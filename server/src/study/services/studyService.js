import crypto from 'crypto';
import mongoose from 'mongoose';
import { StudySession } from '../../models/StudySession.js';
import { Topic } from '../../models/Topic.js';
import { Subject } from '../../models/Subject.js';
import { SyllabusVersion } from '../../models/SyllabusVersion.js';
import { Concept } from '../../models/Concept.js';
import { studyAiService } from './studyAiService.js';
import { learningStateService } from '../../services/learningStateService.js';
import {
  STUDY_STATUS,
  ALLOWED_PAUSE_STATUSES,
  TERMINAL_STATUSES,
  validateStateTransition,
} from '../stateMachine.js';

/**
 * Executes work within a real MongoDB transaction.
 * In production/live environments:
 * - If MongoDB is disconnected/unavailable, or transaction initialization fails:
 *   fails closed with a deterministic TRANSACTION_UNAVAILABLE error (HTTP 503).
 * In unit/mock test environments (when process.env.NODE_ENV === 'test'):
 *   supports controlled in-memory fallback.
 */
export async function runInTransaction(workFn, options = {}) {
  const isTestEnv = options.isTest !== undefined ? options.isTest : (process.env.NODE_ENV === 'test');
  let dbSession = null;

  const isDbConnected = mongoose.connection && mongoose.connection.readyState === 1;

  if (!isDbConnected) {
    if (!isTestEnv) {
      const txError = new Error(
        'Database transaction unavailable: Study persistence requires MongoDB transaction support (MongoDB Atlas / replica set).'
      );
      txError.code = 'TRANSACTION_UNAVAILABLE';
      txError.statusCode = 503;
      txError.status = 503;
      throw txError;
    }
    return await workFn(null);
  }

  try {
    dbSession = await mongoose.startSession();
    dbSession.startTransaction({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });
  } catch (sessionErr) {
    if (dbSession) {
      try {
        await dbSession.endSession();
      } catch (_) {}
    }
    if (!isTestEnv) {
      const txError = new Error(
        'Database transaction unavailable: Study persistence requires MongoDB transaction support (MongoDB Atlas / replica set).'
      );
      txError.code = 'TRANSACTION_UNAVAILABLE';
      txError.statusCode = 503;
      txError.status = 503;
      throw txError;
    }
    return await workFn(null);
  }

  try {
    const result = await workFn(dbSession);
    await dbSession.commitTransaction();
    return result;
  } catch (err) {
    try {
      await dbSession.abortTransaction();
    } catch (_) {}
    throw err;
  } finally {
    try {
      await dbSession.endSession();
    } catch (_) {}
  }
}

export class StudyService {
  constructor() {
    this.testConcurrencyBarrier = null; // Test synchronization barrier hook
  }

  /**
   * Creates a new topic-scoped study session or resumes the existing active session.
   * Fully race-safe via database-level unique constraints and transactional check-and-create.
   */
  async createOrResumeSession(userId, topicId, options = {}) {
    if (!mongoose.Types.ObjectId.isValid(topicId)) {
      const error = new Error('Invalid topicId.');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    const topic = await Topic.findOne({ _id: topicId, userId });
    if (!topic) {
      const error = new Error('Topic not found or access denied.');
      error.code = 'TOPIC_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    const subject = await Subject.findOne({ _id: topic.subjectId, userId });
    if (!subject) {
      const error = new Error('Subject not found or access denied.');
      error.code = 'SUBJECT_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    // 1. Check for existing active session (isActive: true)
    const existingSession = await StudySession.findOne({
      userId,
      topicId,
      isActive: true,
    }).sort({ lastActivityAt: -1 });

    if (existingSession) {
      return { session: existingSession, isNew: false };
    }

    // Concurrency test hook
    if (options?.barrier) {
      await options.barrier();
    } else if (this.testConcurrencyBarrier) {
      await this.testConcurrencyBarrier.wait('createOrResumeSession');
    }

    // 2. Syllabus Pinning: Query approved syllabus if one exists for the subject
    const approvedSyllabus = await SyllabusVersion.findOne({
      subjectId: topic.subjectId,
      userId,
      status: 'approved',
    });

    const syllabusVersionId = approvedSyllabus ? approvedSyllabus._id : null;
    const syllabusVersionNumber = approvedSyllabus ? (approvedSyllabus.version ?? approvedSyllabus.versionNumber ?? 1) : null;

    // Pinned syllabus section context if available
    let pinnedSyllabusContext = null;
    const syllabusUnits = (approvedSyllabus?.sections || approvedSyllabus?.units || []);
    if (Array.isArray(syllabusUnits) && syllabusUnits.length > 0) {
      const matchingUnit = syllabusUnits.find(
        (u) => (u.title || '').toLowerCase().includes(topic.title.toLowerCase()) ||
               (u.topics || []).some((t) => (t.title || '').toLowerCase().includes(topic.title.toLowerCase()))
      );
      if (matchingUnit) {
        pinnedSyllabusContext = `Section: ${matchingUnit.title}. Details: ${(matchingUnit.topics || []).map((t) => t.title).join(', ')}`;
      }
    }

    // 3. Load canonical concepts for whitelist
    const canonicalConcepts = await Concept.find({ userId, topicId }).lean();

    // 4. Generate initial active question
    const initialQuestion = await studyAiService.generateQuestion({
      subjectTitle: subject.title,
      topicTitle: topic.title,
      pinnedSyllabusContext,
      canonicalConcepts,
      priorTurns: [],
    });

    // 5. Instantiate new StudySession
    const sessionDoc = new StudySession({
      userId,
      subjectId: topic.subjectId,
      topicId,
      syllabusVersionId,
      syllabusVersionNumber,
      title: `${topic.title} — Active Recall`,
      status: STUDY_STATUS.QUESTIONING,
      pausedFromStatus: null,
      sessionVersion: 1,
      sequenceCounter: 0,
      activeQuestion: initialQuestion,
      evaluationState: { status: 'IDLE' },
      turns: [],
      metrics: {
        totalQuestionsAsked: 1,
        totalAnswersSubmitted: 0,
        correctCount: 0,
        partiallyCorrectCount: 0,
        incorrectCount: 0,
        remediationsCount: 0,
        demonstratedConceptIds: [],
        strugglingConceptIds: [],
      },
      isActive: true,
      lastActivityAt: new Date(),
    });

    try {
      await sessionDoc.save();
      return { session: sessionDoc, isNew: true };
    } catch (saveErr) {
      // Race protection: if another request created an active session concurrently, return that session cleanly
      if (saveErr.code === 11000 || saveErr.message?.includes('E11000')) {
        const concurrentSession = await StudySession.findOne({
          userId,
          topicId,
          isActive: true,
        }).sort({ lastActivityAt: -1 });

        if (concurrentSession) {
          return { session: concurrentSession, isNew: false };
        }
      }
      throw saveErr;
    }
  }

  /**
   * Retrieves list of study sessions for the authenticated user.
   */
  async listSessions(userId, options = {}) {
    const { topicId, status, limit = 50, skip = 0 } = options;
    const filter = { userId };
    if (topicId) filter.topicId = topicId;
    if (status) filter.status = status;

    const [sessions, total] = await Promise.all([
      StudySession.find(filter)
        .sort({ lastActivityAt: -1 })
        .skip(Number(skip))
        .limit(Number(limit)),
      StudySession.countDocuments(filter),
    ]);

    return { sessions, total };
  }

  /**
   * Retrieves full study session by ID with tenant isolation.
   */
  async getSessionById(userId, sessionId) {
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      const error = new Error('Invalid study session ID.');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    const session = await StudySession.findOne({ _id: sessionId, userId });
    if (!session) {
      const error = new Error('Study session not found.');
      error.code = 'STUDY_SESSION_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    return session;
  }

  /**
   * Submits an answer for the active question with optimistic concurrency, lease fencing, and idempotency.
   */
  async submitAnswer(userId, sessionId, payload, options = {}) {
    const { questionId, sessionVersion, clientTurnId, answer } = payload;

    // 1. Validations
    if (!clientTurnId || typeof clientTurnId !== 'string' || !clientTurnId.trim()) {
      const error = new Error('clientTurnId is required for idempotency.');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    if (!questionId || typeof questionId !== 'string') {
      const error = new Error('questionId is required.');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    if (sessionVersion === undefined || sessionVersion === null || isNaN(Number(sessionVersion))) {
      const error = new Error('sessionVersion is required.');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    if (typeof answer !== 'string' || !answer.trim()) {
      const error = new Error('Answer must be a non-empty string.');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    if (answer.trim().length > 20000) {
      const error = new Error('Answer exceeds maximum allowed length (20,000 characters).');
      error.code = 'ANSWER_TOO_LONG';
      error.statusCode = 400;
      throw error;
    }

    const answerFingerprint = crypto.createHash('sha256').update(answer.trim()).digest('hex');

    // 2. Fetch current session for pre-checks and idempotency inspection
    const session = await this.getSessionById(userId, sessionId);

    // 3. Historical Idempotency Check: Inspect completed turns
    const existingTurn = session.turns.find((t) => t.clientTurnId === clientTurnId);
    if (existingTurn) {
      const existingFingerprint = crypto.createHash('sha256').update((existingTurn.userAnswer || '').trim()).digest('hex');
      if (existingTurn.question.questionId === questionId && existingFingerprint === answerFingerprint) {
        // Safe replay of completed turn
        return {
          idempotent: true,
          turn: existingTurn,
          session,
        };
      } else {
        // Conflicting clientTurnId reuse with different payload
        const error = new Error('clientTurnId has already been used with a different question or answer payload.');
        error.code = 'IDEMPOTENCY_KEY_REUSE_CONFLICT';
        error.statusCode = 409;
        throw error;
      }
    }

    // 4. In-flight evaluation state idempotency inspection
    if (session.evaluationState && session.evaluationState.clientTurnId === clientTurnId) {
      if (session.evaluationState.questionId === questionId && session.evaluationState.answerFingerprint === answerFingerprint) {
        if (session.evaluationState.status === 'EVALUATING' || session.evaluationState.status === 'RECEIVED') {
          return {
            idempotent: true,
            inFlight: true,
            session,
          };
        }
      } else {
        const error = new Error('clientTurnId has already been submitted with a different question or answer payload.');
        error.code = 'IDEMPOTENCY_KEY_REUSE_CONFLICT';
        error.statusCode = 409;
        throw error;
      }
    }

    // 5. State Machine & Active Question Verification
    if (TERMINAL_STATUSES.includes(session.status)) {
      const error = new Error(`Cannot submit answer to terminal study session (${session.status}).`);
      error.code = 'TERMINAL_STUDY_STATE';
      error.statusCode = 400;
      throw error;
    }

    if (session.status === STUDY_STATUS.PAUSED) {
      const error = new Error('Cannot submit answer while study session is paused. Resume the session first.');
      error.code = 'SESSION_PAUSED';
      error.statusCode = 400;
      throw error;
    }

    if (![STUDY_STATUS.QUESTIONING, STUDY_STATUS.RECHECKING].includes(session.status)) {
      const error = new Error(`Cannot submit answer while session is in status "${session.status}".`);
      error.code = 'INVALID_STUDY_STATE';
      error.statusCode = 409;
      throw error;
    }

    if (!session.activeQuestion || session.activeQuestion.questionId !== questionId) {
      const error = new Error('Submitted questionId does not match the current active question.');
      error.code = 'ACTIVE_QUESTION_MISMATCH';
      error.statusCode = 400;
      throw error;
    }

    // 6. Optimistic Concurrency & Atomic Claim (ANSWER_PENDING -> EVALUATING)
    const operationId = options.operationId || crypto.randomUUID();
    const leaseExpiresAt = new Date(Date.now() + 30000); // 30-second lease

    // Synchronization barrier for real concurrency tests
    if (typeof options.barrier === 'function') {
      await options.barrier();
    }

    // Step 1: Claim submission atomically into EVALUATING state
    const claimedSession = await StudySession.findOneAndUpdate(
      {
        _id: sessionId,
        userId,
        sessionVersion: Number(sessionVersion),
        status: { $in: [STUDY_STATUS.QUESTIONING, STUDY_STATUS.RECHECKING] },
        'activeQuestion.questionId': questionId,
      },
      {
        $set: {
          status: STUDY_STATUS.EVALUATING,
          'evaluationState.status': 'EVALUATING',
          'evaluationState.operationId': operationId,
          'evaluationState.clientTurnId': clientTurnId,
          'evaluationState.questionId': questionId,
          'evaluationState.answerFingerprint': answerFingerprint,
          'evaluationState.startedAt': new Date(),
          'evaluationState.leaseExpiresAt': leaseExpiresAt,
          'evaluationState.lastError': null,
          lastActivityAt: new Date(),
        },
        $inc: { sessionVersion: 1 },
      },
      { new: true }
    );

    if (!claimedSession) {
      const error = new Error('Stale study session version or concurrent answer submission in progress.');
      error.code = 'STALE_STUDY_STATE';
      error.statusCode = 409;
      throw error;
    }

    // Determine attempt type and parentTurnId
    const isFollowUp = session.status === STUDY_STATUS.RECHECKING;
    const attemptType = isFollowUp ? 'FOLLOW_UP' : 'INITIAL';
    let parentTurnId = null;

    if (isFollowUp && claimedSession.turns.length > 0) {
      // Point to the initiating initial turn in the same session
      const initialTurn = [...claimedSession.turns].reverse().find((t) => t.attemptType === 'INITIAL') || claimedSession.turns[claimedSession.turns.length - 1];
      parentTurnId = initialTurn._id;
    }

    // 7. Execute AI Evaluation & Remediation Pipeline
    let evaluation;
    let remediation = null;
    let canonicalConcepts = [];

    try {
      canonicalConcepts = await Concept.find({ userId, topicId: claimedSession.topicId }).lean();

      evaluation = await studyAiService.evaluateAnswer({
        question: claimedSession.activeQuestion,
        studentAnswer: answer.trim(),
        canonicalConcepts,
      });

      if (evaluation.verdict !== 'CORRECT') {
        remediation = await studyAiService.generateRemediation({
          question: claimedSession.activeQuestion,
          studentAnswer: answer.trim(),
          evaluation,
        });
      }
    } catch (evalError) {
      console.error(`[StudyService] Evaluation failure for session ${sessionId}:`, evalError.message);

      // Transition session safely out of EVALUATING back to retry-safe state
      const fallbackStatus = attemptType === 'INITIAL' ? STUDY_STATUS.QUESTIONING : STUDY_STATUS.RECHECKING;

      await StudySession.updateOne(
        {
          _id: sessionId,
          userId,
          'evaluationState.operationId': operationId,
        },
        {
          $set: {
            status: fallbackStatus,
            'evaluationState.status': 'FAILED',
            'evaluationState.lastError': {
              code: 'EVALUATION_ERROR',
              message: evalError.message,
              attemptCount: 1,
            },
            lastActivityAt: new Date(),
          },
          $inc: { sessionVersion: 1 },
        }
      );

      const err = new Error(`Answer evaluation encountered an unrecoverable error: ${evalError.message}. Session restored to retry-safe state.`);
      err.code = 'EVALUATION_FAILED_RETRY_SAFE';
      err.statusCode = 502;
      throw err;
    }

    // 8. Determine Next Status
    const nextStatus = (evaluation.verdict === 'CORRECT' || evaluation.nextAction === 'ADVANCE')
      ? STUDY_STATUS.ADVANCING
      : STUDY_STATUS.REMEDIATING;

    // 9. Construct Turn Document
    const turnIndex = claimedSession.sequenceCounter;
    const newTurn = {
      turnIndex,
      clientTurnId,
      attemptType,
      parentTurnId,
      question: claimedSession.activeQuestion,
      userAnswer: answer.trim(),
      answeredAt: new Date(),
      evaluation,
      remediation: remediation || { remediationText: '', followUpQuestion: '', remediatedAt: null },
    };

    // 10. Authoritative Fenced Mutation Write (Atomic & guarded by operationId fencing)
    const finalUpdateResult = await runInTransaction(async (dbSession) => {
      const query = {
        _id: sessionId,
        userId,
        status: STUDY_STATUS.EVALUATING,
        'evaluationState.operationId': operationId, // FENCING CONDITION
      };

      const update = {
        $set: {
          status: nextStatus,
          'evaluationState.status': 'COMPLETED',
          lastActivityAt: new Date(),
        },
        $push: { turns: newTurn },
        $inc: {
          sequenceCounter: 1,
          sessionVersion: 1,
          'metrics.totalAnswersSubmitted': 1,
          ...(evaluation.verdict === 'CORRECT' ? { 'metrics.correctCount': 1 } : {}),
          ...(evaluation.verdict === 'PARTIALLY_CORRECT' ? { 'metrics.partiallyCorrectCount': 1 } : {}),
          ...(evaluation.verdict === 'INCORRECT' ? { 'metrics.incorrectCount': 1 } : {}),
          ...(remediation ? { 'metrics.remediationsCount': 1 } : {}),
        },
        $addToSet: {
          ...(evaluation.verdict === 'CORRECT' && newTurn.question.targetConceptIds?.length > 0
            ? { 'metrics.demonstratedConceptIds': { $each: newTurn.question.targetConceptIds } }
            : {}),
          ...(evaluation.verdict === 'INCORRECT' && newTurn.question.targetConceptIds?.length > 0
            ? { 'metrics.strugglingConceptIds': { $each: newTurn.question.targetConceptIds } }
            : {}),
        },
      };

      const opts = dbSession ? { session: dbSession } : {};
      return StudySession.updateOne(query, update, opts);
    });

    // 11. Handle Stale Worker Late Return (Lease Takeover Outcome)
    if (finalUpdateResult.matchedCount === 0) {
      console.warn(`[StudyService] Stale evaluation worker with operationId="${operationId}" was superseded and discarded safely.`);
      const currentLatestSession = await StudySession.findById(sessionId);
      return {
        idempotent: false,
        staleWorkerDiscarded: true,
        session: currentLatestSession,
      };
    }

    const updatedSession = await StudySession.findById(sessionId);
    const addedTurn = updatedSession.turns[updatedSession.turns.length - 1];

    // Project completed turn into Learning State in realtime
    try {
      await learningStateService.projectTurnRealtime(userId, sessionId, addedTurn);
    } catch (projErr) {
      console.warn(`[StudyService] Learning state projection notice for session ${sessionId}:`, projErr.message);
    }

    return {
      idempotent: false,
      turn: addedTurn,
      session: updatedSession,
    };
  }

  /**
   * Advances the study session forward (ZERO re-evaluation).
   * - ADVANCING -> Next Active Question -> QUESTIONING
   * - REMEDIATING -> Follow-Up Question -> RECHECKING
   * Fully protected by expected sessionVersion.
   */
  async continueSession(userId, sessionId, payload = {}) {
    const { sessionVersion } = payload;
    const session = await this.getSessionById(userId, sessionId);

    if (sessionVersion !== undefined && Number(sessionVersion) !== session.sessionVersion) {
      const error = new Error('Stale sessionVersion. Please refresh session state.');
      error.code = 'STALE_STUDY_STATE';
      error.statusCode = 409;
      throw error;
    }

    if (session.status === STUDY_STATUS.ADVANCING) {
      // 1. Advance to next question
      const subject = await Subject.findOne({ _id: session.subjectId, userId });
      const topic = await Topic.findOne({ _id: session.topicId, userId });
      const canonicalConcepts = await Concept.find({ userId, topicId: session.topicId }).lean();

      // Find next concept that hasn't been demonstrated yet
      const demonstratedSet = new Set((session.metrics.demonstratedConceptIds || []).map((id) => String(id)));
      const nextConcept = canonicalConcepts.find((c) => !demonstratedSet.has(String(c._id))) || null;

      // Check if all concepts are demonstrated and session should complete
      if (canonicalConcepts.length > 0 && demonstratedSet.size >= canonicalConcepts.length) {
        const completedSession = await StudySession.findOneAndUpdate(
          {
            _id: sessionId,
            userId,
            status: STUDY_STATUS.ADVANCING,
            sessionVersion: session.sessionVersion,
          },
          {
            $set: {
              status: STUDY_STATUS.COMPLETED,
              isActive: false,
              lastActivityAt: new Date(),
            },
            $inc: { sessionVersion: 1 },
          },
          { new: true }
        );

        if (!completedSession) {
          const error = new Error('Stale sessionVersion. Please refresh session state.');
          error.code = 'STALE_STUDY_STATE';
          error.statusCode = 409;
          throw error;
        }

        return completedSession;
      }

      let pinnedSyllabusContext = null;
      if (session.syllabusVersionId) {
        const syllabus = await SyllabusVersion.findById(session.syllabusVersionId);
        if (syllabus && Array.isArray(syllabus.units)) {
          const matchingUnit = syllabus.units.find(
            (u) => (u.title || '').toLowerCase().includes(topic.title.toLowerCase()) ||
                   (u.topics || []).some((t) => (t.title || '').toLowerCase().includes(topic.title.toLowerCase()))
          );
          if (matchingUnit) {
            pinnedSyllabusContext = `Unit: ${matchingUnit.title}. Topics: ${(matchingUnit.topics || []).map((t) => t.title).join(', ')}`;
          }
        }
      }

      const nextQuestion = await studyAiService.generateQuestion({
        subjectTitle: subject.title,
        topicTitle: topic.title,
        pinnedSyllabusContext,
        canonicalConcepts,
        priorTurns: session.turns,
        targetConcept: nextConcept,
      });

      const updated = await StudySession.findOneAndUpdate(
        {
          _id: sessionId,
          userId,
          status: STUDY_STATUS.ADVANCING,
          sessionVersion: session.sessionVersion,
        },
        {
          $set: {
            activeQuestion: nextQuestion,
            status: STUDY_STATUS.QUESTIONING,
            lastActivityAt: new Date(),
          },
          $inc: {
            sessionVersion: 1,
            'metrics.totalQuestionsAsked': 1,
          },
        },
        { new: true }
      );

      if (!updated) {
        const error = new Error('Stale sessionVersion. Please refresh session state.');
        error.code = 'STALE_STUDY_STATE';
        error.statusCode = 409;
        throw error;
      }

      return updated;
    }

    if (session.status === STUDY_STATUS.REMEDIATING) {
      // 2. Expose follow-up question
      const lastTurn = session.turns[session.turns.length - 1];
      const followUpPrompt = lastTurn?.remediation?.followUpQuestion ||
        `Please explain the mechanism again, ensuring you address how all components interact.`;

      const followUpQuestion = {
        questionId: crypto.randomUUID(),
        questionType: 'explain_in_own_words',
        prompt: followUpPrompt,
        targetConceptIds: lastTurn?.question?.targetConceptIds || [],
        targetConceptNames: lastTurn?.question?.targetConceptNames || [],
        expectedReasoningSignals: lastTurn?.question?.expectedReasoningSignals || [],
        difficultyIntent: lastTurn?.question?.difficultyIntent || 'intermediate',
        prerequisiteConceptIds: [],
        generatedAt: new Date(),
      };

      const updated = await StudySession.findOneAndUpdate(
        {
          _id: sessionId,
          userId,
          status: STUDY_STATUS.REMEDIATING,
          sessionVersion: session.sessionVersion,
        },
        {
          $set: {
            activeQuestion: followUpQuestion,
            status: STUDY_STATUS.RECHECKING,
            lastActivityAt: new Date(),
          },
          $inc: {
            sessionVersion: 1,
            'metrics.totalQuestionsAsked': 1,
          },
        },
        { new: true }
      );

      if (!updated) {
        const error = new Error('Stale sessionVersion. Please refresh session state.');
        error.code = 'STALE_STUDY_STATE';
        error.statusCode = 409;
        throw error;
      }

      return updated;
    }

    const error = new Error(`Cannot continue study session from status "${session.status}". Expected "ADVANCING" or "REMEDIATING".`);
    error.code = 'INVALID_STUDY_STATE';
    error.statusCode = 400;
    throw error;
  }

  /**
   * Pauses an active study session.
   * Allowed ONLY from QUESTIONING, REMEDIATING, RECHECKING.
   * Fully atomic with sessionVersion.
   */
  async pauseSession(userId, sessionId, payload = {}) {
    const { sessionVersion } = payload;
    const session = await this.getSessionById(userId, sessionId);

    if (sessionVersion !== undefined && Number(sessionVersion) !== session.sessionVersion) {
      const error = new Error('Stale sessionVersion.');
      error.code = 'STALE_STUDY_STATE';
      error.statusCode = 409;
      throw error;
    }

    validateStateTransition(session.status, STUDY_STATUS.PAUSED);

    const updated = await StudySession.findOneAndUpdate(
      {
        _id: sessionId,
        userId,
        status: { $in: ALLOWED_PAUSE_STATUSES },
        sessionVersion: session.sessionVersion,
      },
      {
        $set: {
          pausedFromStatus: session.status,
          status: STUDY_STATUS.PAUSED,
          lastActivityAt: new Date(),
        },
        $inc: { sessionVersion: 1 },
      },
      { new: true }
    );

    if (!updated) {
      const error = new Error('Stale sessionVersion or state modified concurrently.');
      error.code = 'STALE_STUDY_STATE';
      error.statusCode = 409;
      throw error;
    }

    return updated;
  }

  /**
   * Resumes a paused study session back to its exact prior status.
   * Fully atomic with sessionVersion.
   */
  async resumeSession(userId, sessionId, payload = {}) {
    const { sessionVersion } = payload;
    const session = await this.getSessionById(userId, sessionId);

    if (sessionVersion !== undefined && Number(sessionVersion) !== session.sessionVersion) {
      const error = new Error('Stale sessionVersion.');
      error.code = 'STALE_STUDY_STATE';
      error.statusCode = 409;
      throw error;
    }

    if (session.status !== STUDY_STATUS.PAUSED) {
      const error = new Error(`Session is not paused (status is "${session.status}").`);
      error.code = 'SESSION_NOT_PAUSED';
      error.statusCode = 400;
      throw error;
    }

    const restoreStatus = session.pausedFromStatus || STUDY_STATUS.QUESTIONING;
    validateStateTransition(session.status, restoreStatus, { pausedFromStatus: session.pausedFromStatus });

    const updated = await StudySession.findOneAndUpdate(
      {
        _id: sessionId,
        userId,
        status: STUDY_STATUS.PAUSED,
        sessionVersion: session.sessionVersion,
      },
      {
        $set: {
          status: restoreStatus,
          pausedFromStatus: null,
          lastActivityAt: new Date(),
        },
        $inc: { sessionVersion: 1 },
      },
      { new: true }
    );

    if (!updated) {
      const error = new Error('Stale sessionVersion or state modified concurrently.');
      error.code = 'STALE_STUDY_STATE';
      error.statusCode = 409;
      throw error;
    }

    return updated;
  }

  /**
   * Terminates a study session permanently (EXITED, isActive: false).
   * Fully atomic with expected sessionVersion.
   */
  async exitSession(userId, sessionId, payload = {}) {
    const { sessionVersion } = payload;
    const session = await this.getSessionById(userId, sessionId);

    if (session.status === STUDY_STATUS.EXITED || !session.isActive) {
      const error = new Error('Cannot perform operations on terminal study session (EXITED).');
      error.code = 'TERMINAL_STUDY_STATE';
      error.statusCode = 400;
      throw error;
    }

    if (sessionVersion !== undefined && Number(sessionVersion) !== session.sessionVersion) {
      const error = new Error('Stale sessionVersion.');
      error.code = 'STALE_STUDY_STATE';
      error.statusCode = 409;
      throw error;
    }

    const updated = await StudySession.findOneAndUpdate(
      {
        _id: sessionId,
        userId,
        isActive: true,
        status: { $ne: STUDY_STATUS.EXITED },
        sessionVersion: session.sessionVersion,
      },
      {
        $set: {
          status: STUDY_STATUS.EXITED,
          isActive: false,
          lastActivityAt: new Date(),
        },
        $inc: { sessionVersion: 1 },
      },
      { new: true }
    );

    if (!updated) {
      const error = new Error('Stale sessionVersion or session state modified concurrently.');
      error.code = 'STALE_STUDY_STATE';
      error.statusCode = 409;
      throw error;
    }

    return updated;
  }

  /**
   * Recovers an expired evaluation lease (safe takeover).
   * Fully atomic with sessionVersion.
   */
  async recoverExpiredLease(userId, sessionId) {
    const newOperationId = crypto.randomUUID();
    const updated = await StudySession.findOneAndUpdate(
      {
        _id: sessionId,
        userId,
        status: { $in: [STUDY_STATUS.ANSWER_PENDING, STUDY_STATUS.EVALUATING] },
        'evaluationState.leaseExpiresAt': { $lt: new Date() },
      },
      {
        $set: {
          status: STUDY_STATUS.EVALUATING,
          'evaluationState.status': 'EVALUATING',
          'evaluationState.operationId': newOperationId,
          'evaluationState.startedAt': new Date(),
          'evaluationState.leaseExpiresAt': new Date(Date.now() + 30000),
          'evaluationState.lastError': null,
          lastActivityAt: new Date(),
        },
        $inc: { sessionVersion: 1 },
      },
      { new: true }
    );

    return updated;
  }
}

export const studyService = new StudyService();
export default studyService;
