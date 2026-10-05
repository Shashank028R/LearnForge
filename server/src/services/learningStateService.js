import mongoose from 'mongoose';
import { Concept } from '../models/Concept.js';
import { Topic } from '../models/Topic.js';
import { StudySession } from '../models/StudySession.js';
import { ConceptLearningState } from '../models/ConceptLearningState.js';
import { ProcessedStudyTurn } from '../models/ProcessedStudyTurn.js';
import {
  applyTurnToConceptState,
  calculateDecayedScore,
  createInitialConceptLearningState,
  projectEvidenceHistory,
  sortTargetConceptsByDependency,
} from './learningStateEngine.js';
import { checkPrerequisitesSatisfied } from './conceptPrerequisiteValidator.js';
import { runInTransaction } from '../study/services/studyService.js';

export class LearningStateService {
  /**
   * Projects a single completed StudyTurn into ConceptLearningState for all target concepts.
   * Scalable & Idempotent via ProcessedStudyTurn ledger.
   * Supports MongoDB atomic session transaction forwarding.
   * Multi-concept atomic: all target concepts must project successfully or the transaction aborts.
   * Deterministically orders target concepts by dependency.
   */
  async projectTurnRealtime(userId, sessionId, turn, options = {}) {
    if (!turn || !turn.evaluation || turn.evaluation.verdict === null) {
      return { projected: false, reason: 'Turn is not completed with an evaluation verdict' };
    }

    const evaluationTime = options.evaluationTime || turn.answeredAt || new Date();
    const rawTargetConceptIds = turn.question && Array.isArray(turn.question.targetConceptIds)
      ? turn.question.targetConceptIds
      : [];

    if (rawTargetConceptIds.length === 0) {
      return { projected: false, reason: 'No target concepts associated with turn' };
    }

    // Load concepts to resolve any dependency relations among same-turn concepts
    const dbSession = options.session || null;
    const conceptQuery = Concept.find({ _id: { $in: rawTargetConceptIds }, userId });
    if (dbSession) conceptQuery.session(dbSession);
    const concepts = await conceptQuery.lean();

    const conceptPrerequisitesMap = new Map();
    for (const c of concepts) {
      conceptPrerequisitesMap.set(c._id.toString(), Array.isArray(c.prerequisites) ? c.prerequisites : []);
    }

    const targetConceptIds = sortTargetConceptsByDependency(rawTargetConceptIds, conceptPrerequisitesMap);

    const results = [];

    for (const conceptId of targetConceptIds) {
      const result = await this._projectSingleConceptTurn(userId, sessionId, conceptId, turn, evaluationTime, options);
      results.push(result);
    }

    return { projected: true, results };
  }

  /**
   * Internal helper to project a turn for a single concept with atomic claim & idempotency.
   * Invariant: For each (userId, conceptId, turnId), exactly one projection effect occurs.
   */
  async _projectSingleConceptTurn(userId, sessionId, conceptId, turn, evaluationTime, options = {}, maxRetries = 5) {
    const isDbConnected = mongoose.connection && mongoose.connection.readyState === 1;
    if (!isDbConnected && process.env.NODE_ENV === 'test' && !options.force) {
      return { conceptId, idempotent: false, projected: false, reason: 'Disconnected test environment' };
    }

    const dbSession = options.session || null;
    const sessionOpts = dbSession ? { session: dbSession } : {};

    const uId = new mongoose.Types.ObjectId(userId);
    const cId = new mongoose.Types.ObjectId(conceptId);
    const sId = new mongoose.Types.ObjectId(sessionId);
    const tId = turn._id instanceof mongoose.Types.ObjectId ? turn._id : new mongoose.Types.ObjectId(turn._id);

    // Concurrency test barrier hook
    if (typeof options.barrier === 'function') {
      await options.barrier();
    }

    // 1. ATOMIC CLAIM: Attempt to insert the unique ProcessedStudyTurn ledger entry
    let claimAcquired = false;
    try {
      if (dbSession) {
        await ProcessedStudyTurn.create(
          [
            {
              userId: uId,
              conceptId: cId,
              turnId: tId,
              sessionId: sId,
              processedAt: new Date(),
            },
          ],
          sessionOpts
        );
      } else {
        await ProcessedStudyTurn.create({
          userId: uId,
          conceptId: cId,
          turnId: tId,
          sessionId: sId,
          processedAt: new Date(),
        });
      }
      claimAcquired = true;
    } catch (claimErr) {
      // If duplicate key error (11000), turn was already claimed/projected
      if (claimErr.code === 11000 || claimErr.message?.includes('E11000')) {
        const query = ConceptLearningState.findOne({ userId: uId, conceptId: cId });
        if (dbSession) query.session(dbSession);
        const existingState = await query.lean();
        return {
          conceptId: cId,
          idempotent: true,
          projected: false,
          state: existingState,
        };
      }
      throw claimErr;
    }

    // 2. Load canonical concept to ensure ownership & obtain canonical prerequisites
    const conceptQuery = Concept.findOne({ _id: cId, userId: uId });
    if (dbSession) conceptQuery.session(dbSession);
    const conceptDoc = await conceptQuery.lean();

    if (!conceptDoc) {
      if (claimAcquired && !dbSession) {
        await ProcessedStudyTurn.deleteOne({ userId: uId, conceptId: cId, turnId: tId }).catch(() => {});
      }
      throw new Error(`Canonical concept ${cId} not found or tenant access denied`);
    }

    // 3. Retry loop for optimistic stateVersion concurrency
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt += 1;

      try {
        // Load or initialize ConceptLearningState
        const stateQuery = ConceptLearningState.findOne({ userId: uId, conceptId: cId });
        if (dbSession) stateQuery.session(dbSession);
        let stateDoc = await stateQuery;
        let isNewDoc = false;

        if (!stateDoc) {
          stateDoc = new ConceptLearningState(
            createInitialConceptLearningState(cId, uId, conceptDoc.subjectId, conceptDoc.topicId)
          );
          isNewDoc = true;
        }

        // Load prerequisite states if canonical prerequisites exist
        const prerequisites = Array.isArray(conceptDoc.prerequisites) ? conceptDoc.prerequisites : [];
        const prereqStatesMap = new Map();

        if (prerequisites.length > 0) {
          const prereqQuery = ConceptLearningState.find({
            userId: uId,
            conceptId: { $in: prerequisites },
          });
          if (dbSession) prereqQuery.session(dbSession);
          const prereqStates = await prereqQuery.lean();

          for (const ps of prereqStates) {
            ps.decayedScore = calculateDecayedScore(ps.masteryScore, ps.lastDemonstratedAt, evaluationTime);
            prereqStatesMap.set(ps.conceptId.toString(), ps);
          }
        }

        // Compute pure transition
        const currentStateObj = stateDoc.toObject ? stateDoc.toObject() : stateDoc;
        const nextState = applyTurnToConceptState(currentStateObj, turn, {
          prerequisites,
          prerequisiteStatesMap: prereqStatesMap,
          evaluationTime,
        });

        // Update document fields
        stateDoc.masteryStatus = nextState.masteryStatus;
        stateDoc.masteryScore = nextState.masteryScore;
        stateDoc.decayedScore = nextState.decayedScore;
        stateDoc.confidenceScore = nextState.confidenceScore;
        stateDoc.attemptsCount = nextState.attemptsCount;
        stateDoc.consecutiveSuccesses = nextState.consecutiveSuccesses;
        stateDoc.consecutiveFailures = nextState.consecutiveFailures;
        stateDoc.activeMisconceptions = nextState.activeMisconceptions;
        stateDoc.resolvedMisconceptions = nextState.resolvedMisconceptions;
        stateDoc.prerequisiteWarning = nextState.prerequisiteWarning;
        stateDoc.unmetPrerequisiteIds = nextState.unmetPrerequisiteIds;
        stateDoc.lastAttemptedAt = nextState.lastAttemptedAt;
        stateDoc.lastDemonstratedAt = nextState.lastDemonstratedAt;
        stateDoc.lastProcessedTurnId = tId;
        stateDoc.lastProcessedAnsweredAt = nextState.lastProcessedAnsweredAt;

        if (isNewDoc) {
          await stateDoc.save(sessionOpts);
          return { conceptId: cId, idempotent: false, projected: true, state: stateDoc.toObject() };
        } else {
          const currentVersion = stateDoc.stateVersion;
          const updateResult = await ConceptLearningState.updateOne(
            {
              _id: stateDoc._id,
              userId: uId,
              stateVersion: currentVersion,
            },
            {
              $set: {
                masteryStatus: nextState.masteryStatus,
                masteryScore: nextState.masteryScore,
                decayedScore: nextState.decayedScore,
                confidenceScore: nextState.confidenceScore,
                attemptsCount: nextState.attemptsCount,
                consecutiveSuccesses: nextState.consecutiveSuccesses,
                consecutiveFailures: nextState.consecutiveFailures,
                activeMisconceptions: nextState.activeMisconceptions,
                resolvedMisconceptions: nextState.resolvedMisconceptions,
                prerequisiteWarning: nextState.prerequisiteWarning,
                unmetPrerequisiteIds: nextState.unmetPrerequisiteIds,
                lastAttemptedAt: nextState.lastAttemptedAt,
                lastDemonstratedAt: nextState.lastDemonstratedAt,
                lastProcessedTurnId: tId,
                lastProcessedAnsweredAt: nextState.lastProcessedAnsweredAt,
              },
              $inc: { stateVersion: 1 },
            },
            sessionOpts
          );

          if (updateResult.matchedCount > 0) {
            const findSaved = ConceptLearningState.findById(stateDoc._id);
            if (dbSession) findSaved.session(dbSession);
            const savedDoc = await findSaved.lean();
            return { conceptId: cId, idempotent: false, projected: true, state: savedDoc };
          }
          // Optimistic version collision, retry loop
        }
      } catch (err) {
        if (attempt >= maxRetries) {
          if (claimAcquired && !dbSession) {
            await ProcessedStudyTurn.deleteOne({ userId: uId, conceptId: cId, turnId: tId }).catch(() => {});
          }
          throw err;
        }
      }
    }

    if (claimAcquired && !dbSession) {
      await ProcessedStudyTurn.deleteOne({ userId: uId, conceptId: cId, turnId: tId }).catch(() => {});
    }
    throw new Error(`Optimistic lock collision: Failed to project turn ${turn._id} for concept ${conceptId} after ${maxRetries} attempts.`);
  }

  /**
   * Deterministically reconstructs the complete topic learning state from historical StudySession.turns.
   * Replays the entire transitive prerequisite closure from raw historical evidence.
   * Does not depend on existing materialized state.
   * Transactional and atomic.
   * Parity Invariant: Rebuild(E, evaluationTimestamp) === Project(E, evaluationTimestamp)
   */
  async rebuildTopicLearningState(userId, topicId, options = {}) {
    const uId = new mongoose.Types.ObjectId(userId);
    const tId = new mongoose.Types.ObjectId(topicId);
    const evaluationTime = options.evaluationTime || options.evaluationTimestamp || new Date();

    // 1. Fetch all concepts in target topic
    const targetConcepts = await Concept.find({ userId: uId, topicId: tId }).lean();
    if (targetConcepts.length === 0) {
      return {
        topicId: tId,
        rebuiltCount: 0,
        conceptStates: [],
        summary: null,
      };
    }

    const targetConceptIds = targetConcepts.map((c) => c._id);
    const targetConceptIdStrings = new Set(targetConceptIds.map((id) => id.toString()));

    // 2. Discover full transitive prerequisite closure across the subject from canonical Concept graph
    const allConceptsMap = new Map();
    for (const c of targetConcepts) {
      allConceptsMap.set(c._id.toString(), c);
    }

    const queue = [...targetConcepts];
    while (queue.length > 0) {
      const current = queue.shift();
      const prereqs = Array.isArray(current.prerequisites) ? current.prerequisites : [];
      const unvisitedPrereqIds = prereqs.filter((pid) => !allConceptsMap.has(pid.toString()));

      if (unvisitedPrereqIds.length > 0) {
        const fetchedPrereqs = await Concept.find({
          userId: uId,
          _id: { $in: unvisitedPrereqIds },
        }).lean();

        for (const pDoc of fetchedPrereqs) {
          allConceptsMap.set(pDoc._id.toString(), pDoc);
          queue.push(pDoc);
        }
      }
    }

    // Build initial states and prerequisite adjacency map for ALL concepts in the closure
    const conceptPrerequisitesMap = new Map();
    const initialStatesMap = new Map();

    for (const [strId, cDoc] of allConceptsMap.entries()) {
      conceptPrerequisitesMap.set(strId, Array.isArray(cDoc.prerequisites) ? cDoc.prerequisites : []);
      initialStatesMap.set(strId, createInitialConceptLearningState(cDoc._id, uId, cDoc.subjectId, cDoc.topicId));
    }

    // 3. Fetch historical evidence (StudySession.turns) for ALL topics in the prerequisite closure
    const closureTopicIds = Array.from(
      new Set(Array.from(allConceptsMap.values()).map((c) => c.topicId.toString()))
    ).map((tid) => new mongoose.Types.ObjectId(tid));

    const sessions = await StudySession.find({
      userId: uId,
      topicId: { $in: closureTopicIds },
    }).lean();

    const allCompletedTurns = [];
    const turnSessionMap = new Map();

    for (const session of sessions) {
      if (Array.isArray(session.turns)) {
        for (const turn of session.turns) {
          if (turn.evaluation && turn.evaluation.verdict !== null) {
            allCompletedTurns.push(turn);
            turnSessionMap.set(turn._id.toString(), session._id);
          }
        }
      }
    }

    // 4. Deterministically replay all historical evidence through pure engine
    const finalStatesMap = projectEvidenceHistory(
      initialStatesMap,
      allCompletedTurns,
      conceptPrerequisitesMap,
      evaluationTime
    );

    // 5. Transactional commit: atomically wipe & insert materialized views for target topic concepts only
    const result = await runInTransaction(async (dbSession) => {
      const sessionOpts = dbSession ? { session: dbSession } : {};

      await ConceptLearningState.deleteMany({ userId: uId, topicId: tId }, sessionOpts);
      await ProcessedStudyTurn.deleteMany({ userId: uId, conceptId: { $in: targetConceptIds } }, sessionOpts);

      const statesToInsert = [];
      for (const conceptId of targetConceptIds) {
        const stateObj = finalStatesMap.get(conceptId.toString());
        if (stateObj) {
          statesToInsert.push({
            ...stateObj,
            stateVersion: 1,
          });
        }
      }

      const insertedStates = statesToInsert.length > 0
        ? await ConceptLearningState.insertMany(statesToInsert, sessionOpts)
        : [];

      // Rebuild ProcessedStudyTurn ledger for target topic concepts from target topic sessions
      const ledgerEntries = [];
      for (const turn of allCompletedTurns) {
        const targetIds = turn.question && Array.isArray(turn.question.targetConceptIds)
          ? turn.question.targetConceptIds
          : [];
        const sId = turnSessionMap.get(turn._id.toString());

        for (const targetId of targetIds) {
          if (targetConceptIdStrings.has(targetId.toString())) {
            ledgerEntries.push({
              userId: uId,
              conceptId: targetId,
              turnId: turn._id,
              sessionId: sId,
              processedAt: turn.answeredAt || new Date(),
            });
          }
        }
      }

      if (ledgerEntries.length > 0) {
        try {
          await ProcessedStudyTurn.insertMany(ledgerEntries, { ...sessionOpts, ordered: false });
        } catch (e) {
          // Ignore duplicate key errors if already present
        }
      }

      const summary = this._computeTopicSummary(insertedStates);

      return {
        topicId: tId,
        rebuiltCount: insertedStates.length,
        conceptStates: insertedStates,
        summary,
      };
    });

    return result;
  }

  /**
   * Retrieves single concept learning state with dynamic decayedScore computed at evaluationTime.
   */
  async getConceptLearningState(userId, conceptId, options = {}) {
    const uId = new mongoose.Types.ObjectId(userId);
    const cId = new mongoose.Types.ObjectId(conceptId);
    const evaluationTime = options.evaluationTime || options.evaluationTimestamp || new Date();

    const conceptDoc = await Concept.findOne({ _id: cId, userId: uId }).lean();
    if (!conceptDoc) {
      const error = new Error('Concept not found or access denied.');
      error.code = 'CONCEPT_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    let state = await ConceptLearningState.findOne({ userId: uId, conceptId: cId }).lean();
    if (!state) {
      state = createInitialConceptLearningState(cId, uId, conceptDoc.subjectId, conceptDoc.topicId);
    }

    state.decayedScore = calculateDecayedScore(state.masteryScore, state.lastDemonstratedAt, evaluationTime);

    // Verify prerequisites
    const prerequisites = Array.isArray(conceptDoc.prerequisites) ? conceptDoc.prerequisites : [];
    if (prerequisites.length > 0) {
      const prereqStates = await ConceptLearningState.find({
        userId: uId,
        conceptId: { $in: prerequisites },
      }).lean();
      const prereqMap = new Map();
      for (const ps of prereqStates) {
        ps.decayedScore = calculateDecayedScore(ps.masteryScore, ps.lastDemonstratedAt, evaluationTime);
        prereqMap.set(ps.conceptId.toString(), ps);
      }
      const check = checkPrerequisitesSatisfied(prerequisites, prereqMap);
      state.prerequisiteWarning = !check.satisfied;
      state.unmetPrerequisiteIds = check.unmetPrerequisiteIds;
    }

    return state;
  }

  /**
   * Retrieves all concept states and dynamic summary for a topic.
   */
  async getTopicLearningSummary(userId, topicId, options = {}) {
    const uId = new mongoose.Types.ObjectId(userId);
    const tId = new mongoose.Types.ObjectId(topicId);
    const evaluationTime = options.evaluationTime || options.evaluationTimestamp || new Date();

    const topic = await Topic.findOne({ _id: tId, userId: uId }).lean();
    if (!topic) {
      const error = new Error('Topic not found or access denied.');
      error.code = 'TOPIC_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    const concepts = await Concept.find({ userId: uId, topicId: tId }).lean();
    const states = await ConceptLearningState.find({ userId: uId, topicId: tId }).lean();

    const statesMap = new Map();
    for (const s of states) {
      statesMap.set(s.conceptId.toString(), s);
    }

    const enrichedStates = concepts.map((c) => {
      const strId = c._id.toString();
      let state = statesMap.get(strId);
      if (!state) {
        state = createInitialConceptLearningState(c._id, uId, c.subjectId, c.topicId);
      }
      state.decayedScore = calculateDecayedScore(state.masteryScore, state.lastDemonstratedAt, evaluationTime);
      state.conceptName = c.name;
      return state;
    });

    const summary = this._computeTopicSummary(enrichedStates);

    return {
      topicId: tId,
      topicTitle: topic.title,
      summary,
      conceptStates: enrichedStates,
    };
  }

  /**
   * Computes topic mastery summary dynamically on read.
   */
  _computeTopicSummary(states = []) {
    const totalConcepts = states.length;
    let masteredCount = 0;
    let understoodCount = 0;
    let learningCount = 0;
    let needsReviewCount = 0;
    let notStartedCount = 0;
    let totalMasteryScore = 0;
    let totalDecayedScore = 0;
    let activeMisconceptionsCount = 0;

    for (const s of states) {
      const status = s.masteryStatus || 'NOT_STARTED';
      if (status === 'MASTERED') masteredCount += 1;
      else if (status === 'UNDERSTOOD') understoodCount += 1;
      else if (status === 'LEARNING') learningCount += 1;
      else if (status === 'NEEDS_REVIEW') needsReviewCount += 1;
      else notStartedCount += 1;

      totalMasteryScore += s.masteryScore || 0;
      totalDecayedScore += s.decayedScore || 0;
      activeMisconceptionsCount += Array.isArray(s.activeMisconceptions) ? s.activeMisconceptions.length : 0;
    }

    const averageMasteryScore = totalConcepts > 0 ? Math.round(totalMasteryScore / totalConcepts) : 0;
    const averageDecayedScore = totalConcepts > 0 ? Math.round(totalDecayedScore / totalConcepts) : 0;

    return {
      totalConcepts,
      masteredCount,
      understoodCount,
      learningCount,
      needsReviewCount,
      notStartedCount,
      averageMasteryScore,
      averageDecayedScore,
      activeMisconceptionsCount,
    };
  }

  /**
   * Retrieves subject-level mastery aggregation dynamically on read.
   */
  async getSubjectLearningSummary(userId, subjectId, options = {}) {
    const uId = new mongoose.Types.ObjectId(userId);
    const sId = new mongoose.Types.ObjectId(subjectId);
    const evaluationTime = options.evaluationTime || options.evaluationTimestamp || new Date();

    const topics = await Topic.find({ userId: uId, subjectId: sId }).lean();
    const topicSummaries = [];

    for (const t of topics) {
      const tSummary = await this.getTopicLearningSummary(uId, t._id, { evaluationTime });
      topicSummaries.push({
        topicId: t._id,
        topicTitle: t.title,
        ...tSummary.summary,
      });
    }

    const totalConcepts = topicSummaries.reduce((sum, t) => sum + t.totalConcepts, 0);
    const masteredCount = topicSummaries.reduce((sum, t) => sum + t.masteredCount, 0);
    const understoodCount = topicSummaries.reduce((sum, t) => sum + t.understoodCount, 0);
    const learningCount = topicSummaries.reduce((sum, t) => sum + t.learningCount, 0);
    const needsReviewCount = topicSummaries.reduce((sum, t) => sum + t.needsReviewCount, 0);
    const notStartedCount = topicSummaries.reduce((sum, t) => sum + t.notStartedCount, 0);
    const activeMisconceptionsCount = topicSummaries.reduce((sum, t) => sum + t.activeMisconceptionsCount, 0);

    const averageMasteryScore =
      topicSummaries.length > 0
        ? Math.round(topicSummaries.reduce((sum, t) => sum + t.averageMasteryScore, 0) / topicSummaries.length)
        : 0;

    const averageDecayedScore =
      topicSummaries.length > 0
        ? Math.round(topicSummaries.reduce((sum, t) => sum + t.averageDecayedScore, 0) / topicSummaries.length)
        : 0;

    return {
      subjectId: sId,
      totalTopics: topics.length,
      totalConcepts,
      masteredCount,
      understoodCount,
      learningCount,
      needsReviewCount,
      notStartedCount,
      averageMasteryScore,
      averageDecayedScore,
      activeMisconceptionsCount,
      topics: topicSummaries,
    };
  }

  /**
   * Retrieves prioritized concepts needing review or practice across subjects.
   */
  async getLearningPriorities(userId, options = {}) {
    const uId = new mongoose.Types.ObjectId(userId);
    const evaluationTime = options.evaluationTime || options.evaluationTimestamp || new Date();
    const limit = options.limit || 20;

    const states = await ConceptLearningState.find({ userId: uId }).lean();
    if (states.length === 0) return [];

    const conceptIds = states.map((s) => s.conceptId);
    const concepts = await Concept.find({ _id: { $in: conceptIds } }).lean();
    const conceptNameMap = new Map(concepts.map((c) => [c._id.toString(), c.name]));

    const enriched = states.map((s) => {
      const decayed = calculateDecayedScore(s.masteryScore, s.lastDemonstratedAt, evaluationTime);
      return {
        ...s,
        decayedScore: decayed,
        conceptName: conceptNameMap.get(s.conceptId.toString()) || 'Unknown Concept',
      };
    });

    const prioritized = enriched
      .filter((s) => s.masteryStatus === 'NEEDS_REVIEW' || s.decayedScore < 70 || s.prerequisiteWarning)
      .sort((a, b) => {
        const priorityScoreA =
          (a.masteryStatus === 'NEEDS_REVIEW' ? 100 : 0) +
          (a.activeMisconceptions?.length > 0 ? 50 : 0) +
          (100 - a.decayedScore) +
          (a.prerequisiteWarning ? 20 : 0);

        const priorityScoreB =
          (b.masteryStatus === 'NEEDS_REVIEW' ? 100 : 0) +
          (b.activeMisconceptions?.length > 0 ? 50 : 0) +
          (100 - b.decayedScore) +
          (b.prerequisiteWarning ? 20 : 0);

        return priorityScoreB - priorityScoreA;
      })
      .slice(0, limit);

    return prioritized;
  }
}

export const learningStateService = new LearningStateService();
export default learningStateService;
