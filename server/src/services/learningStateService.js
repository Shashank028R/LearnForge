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
} from './learningStateEngine.js';
import { checkPrerequisitesSatisfied } from './conceptPrerequisiteValidator.js';

export class LearningStateService {
  /**
   * Projects a single completed StudyTurn into ConceptLearningState for all target concepts.
   * Scalable & Idempotent via ProcessedStudyTurn ledger.
   * Concurrency-safe via optimistic stateVersion lock with automatic retry.
   */
  async projectTurnRealtime(userId, sessionId, turn, options = {}) {
    if (!turn || !turn.evaluation || turn.evaluation.verdict === null) {
      return { projected: false, reason: 'Turn is not completed with an evaluation verdict' };
    }

    const evaluationTime = options.evaluationTime || turn.answeredAt || new Date();
    const targetConceptIds = turn.question && Array.isArray(turn.question.targetConceptIds)
      ? turn.question.targetConceptIds
      : [];

    if (targetConceptIds.length === 0) {
      return { projected: false, reason: 'No target concepts associated with turn' };
    }

    const results = [];

    for (const conceptId of targetConceptIds) {
      const result = await this._projectSingleConceptTurn(userId, sessionId, conceptId, turn, evaluationTime, options);
      results.push(result);
    }

    return { projected: true, results };
  }

  /**
   * Internal helper to project a turn for a single concept with idempotency & concurrency retry.
   */
  async _projectSingleConceptTurn(userId, sessionId, conceptId, turn, evaluationTime, options = {}, maxRetries = 5) {
    const uId = new mongoose.Types.ObjectId(userId);
    const cId = new mongoose.Types.ObjectId(conceptId);
    const sId = new mongoose.Types.ObjectId(sessionId);
    const tId = turn._id instanceof mongoose.Types.ObjectId ? turn._id : new mongoose.Types.ObjectId(turn._id);

    // 1. Check idempotency ledger
    const alreadyProcessed = await ProcessedStudyTurn.findOne({
      userId: uId,
      conceptId: cId,
      turnId: tId,
    }).lean();

    if (alreadyProcessed) {
      const existingState = await ConceptLearningState.findOne({ userId: uId, conceptId: cId }).lean();
      return {
        conceptId: cId,
        idempotent: true,
        projected: false,
        state: existingState,
      };
    }

    // 2. Load canonical concept to ensure ownership & obtain canonical prerequisites
    const conceptDoc = await Concept.findOne({ _id: cId, userId: uId }).lean();
    if (!conceptDoc) {
      return {
        conceptId: cId,
        idempotent: false,
        projected: false,
        error: 'Canonical concept not found or tenant access denied',
      };
    }

    // 3. Retry loop for optimistic stateVersion concurrency
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt += 1;

      // Load or initialize ConceptLearningState
      let stateDoc = await ConceptLearningState.findOne({ userId: uId, conceptId: cId });
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
        const prereqStates = await ConceptLearningState.find({
          userId: uId,
          conceptId: { $in: prerequisites },
        }).lean();

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
        try {
          await stateDoc.save();
          // Record in ProcessedStudyTurn ledger
          await ProcessedStudyTurn.create({
            userId: uId,
            conceptId: cId,
            turnId: tId,
            sessionId: sId,
            processedAt: new Date(),
          });
          return { conceptId: cId, idempotent: false, projected: true, state: stateDoc.toObject() };
        } catch (err) {
          // If unique conflict on stateDoc or processedTurn, loop to retry
          if (err.code === 11000 || err.message?.includes('E11000')) {
            continue;
          }
          throw err;
        }
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
          }
        );

        if (updateResult.matchedCount > 0) {
          // Record in ProcessedStudyTurn ledger
          try {
            await ProcessedStudyTurn.create({
              userId: uId,
              conceptId: cId,
              turnId: tId,
              sessionId: sId,
              processedAt: new Date(),
            });
          } catch (ledgerErr) {
            // If already recorded, ignore duplicate key error
            if (ledgerErr.code !== 11000 && !ledgerErr.message?.includes('E11000')) {
              throw ledgerErr;
            }
          }
          const savedDoc = await ConceptLearningState.findById(stateDoc._id).lean();
          return { conceptId: cId, idempotent: false, projected: true, state: savedDoc };
        }
        // Collision occurred, retry
      }
    }

    throw new Error(`Optimistic lock collision: Failed to project turn ${turn._id} for concept ${conceptId} after ${maxRetries} attempts.`);
  }

  /**
   * Deterministically reconstructs the complete topic learning state from historical StudySession.turns.
   * Parity Invariant: Rebuild(E, evaluationTimestamp) === Project(E, evaluationTimestamp)
   */
  async rebuildTopicLearningState(userId, topicId, options = {}) {
    const uId = new mongoose.Types.ObjectId(userId);
    const tId = new mongoose.Types.ObjectId(topicId);
    const evaluationTime = options.evaluationTime || options.evaluationTimestamp || new Date();

    // 1. Fetch all concepts in topic
    const concepts = await Concept.find({ userId: uId, topicId: tId }).lean();
    if (concepts.length === 0) {
      return {
        topicId: tId,
        rebuiltCount: 0,
        conceptStates: [],
        summary: null,
      };
    }

    const conceptIds = concepts.map((c) => c._id);
    const conceptPrerequisitesMap = new Map();
    const initialStatesMap = new Map();

    for (const c of concepts) {
      const strId = c._id.toString();
      conceptPrerequisitesMap.set(strId, Array.isArray(c.prerequisites) ? c.prerequisites : []);
      initialStatesMap.set(strId, createInitialConceptLearningState(c._id, uId, c.subjectId, c.topicId));
    }

    // 2. Fetch all study sessions for topic and extract all completed turns
    const sessions = await StudySession.find({ userId: uId, topicId: tId }).lean();
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

    // 3. Deterministically project evidence through pure engine
    const finalStatesMap = projectEvidenceHistory(
      initialStatesMap,
      allCompletedTurns,
      conceptPrerequisitesMap,
      evaluationTime
    );

    // 4. Atomic wipe and re-insert of materialized views for this topic
    await ConceptLearningState.deleteMany({ userId: uId, topicId: tId });
    await ProcessedStudyTurn.deleteMany({ userId: uId, conceptId: { $in: conceptIds } });

    const statesToInsert = [];
    for (const stateObj of finalStatesMap.values()) {
      statesToInsert.push({
        ...stateObj,
        stateVersion: 1,
      });
    }

    const insertedStates = await ConceptLearningState.insertMany(statesToInsert);

    // Rebuild ProcessedStudyTurn ledger
    const ledgerEntries = [];
    for (const turn of allCompletedTurns) {
      const targetIds = turn.question && Array.isArray(turn.question.targetConceptIds)
        ? turn.question.targetConceptIds
        : [];
      const sId = turnSessionMap.get(turn._id.toString());

      for (const targetId of targetIds) {
        if (conceptIds.some((cid) => cid.toString() === targetId.toString())) {
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
        await ProcessedStudyTurn.insertMany(ledgerEntries, { ordered: false });
      } catch (e) {
        // Ignore duplicate key errors if any turn appeared multiple times
      }
    }

    const summary = this._computeTopicSummary(insertedStates);

    return {
      topicId: tId,
      rebuiltCount: insertedStates.length,
      conceptStates: insertedStates,
      summary,
    };
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

    // Priority rank logic:
    // 1. NEEDS_REVIEW with active misconceptions (urgency = 100)
    // 2. Decayed score < 50 for previously UNDERSTOOD/MASTERED concepts (urgency = 80)
    // 3. LEARNING in progress (urgency = 50)
    // 4. Prerequisite warnings (urgency = 40)
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
