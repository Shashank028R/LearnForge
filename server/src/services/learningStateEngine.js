import { checkPrerequisitesSatisfied } from './conceptPrerequisiteValidator.js';

/**
 * Pure mathematical exponential retention decay calculation.
 * Parameters:
 * - masteryScore: number in [0, 100]
 * - lastDemonstratedAt: Date or timestamp
 * - evaluationTime: Date or timestamp (injected clock for deterministic tests)
 *
 * Invariants:
 * - Grace period = 7 days (0% decay during days 0..7)
 * - lambda = 0.005 day^-1 (~3.44% weekly decay beyond grace, half-life ~138.6 days)
 * - Floor = 35% of masteryScore
 * - Never demonstrated (lastDemonstratedAt == null) => 0
 */
export function calculateDecayedScore(masteryScore, lastDemonstratedAt, evaluationTime = new Date()) {
  if (!lastDemonstratedAt || typeof masteryScore !== 'number' || masteryScore <= 0) {
    return 0;
  }

  const evalMs = evaluationTime instanceof Date ? evaluationTime.getTime() : new Date(evaluationTime).getTime();
  const demonstratedMs = lastDemonstratedAt instanceof Date ? lastDemonstratedAt.getTime() : new Date(lastDemonstratedAt).getTime();

  const elapsedMs = Math.max(0, evalMs - demonstratedMs);
  const elapsedDays = elapsedMs / 86400000;
  const deltaDays = Math.max(0, elapsedDays - 7); // 7-day grace period

  if (deltaDays === 0) {
    return Math.round(masteryScore);
  }

  const lambda = 0.005;
  const decayFactor = Math.max(0.35, Math.exp(-lambda * deltaDays));
  return Math.round(masteryScore * decayFactor + 1e-9);
}

/**
 * Bounded score adjustment formulas
 */
export function calculateScoreGain(currentScore, baseGain) {
  const delta = Math.round(baseGain * Math.max(0.1, 1 - currentScore / 120));
  return Math.min(100, Math.max(0, currentScore + delta));
}

export function calculateScorePenalty(currentScore, basePenalty) {
  const delta = Math.round(basePenalty * Math.max(0.4, currentScore / 100));
  return Math.min(100, Math.max(0, currentScore - delta));
}

export function calculateConfidenceGain(currentConf, baseGain) {
  const delta = Math.round(baseGain * Math.max(0.1, 1 - currentConf / 120));
  return Math.min(100, Math.max(0, currentConf + delta));
}

export function calculateConfidencePenalty(currentConf, basePenalty) {
  const delta = Math.round(basePenalty * Math.max(0.4, currentConf / 100));
  return Math.min(100, Math.max(0, currentConf - delta));
}

/**
 * Formal MASTERED proof function based strictly on historical evidence & prerequisites
 */
export function isConceptMastered({
  consecutiveSuccesses,
  attemptsCount,
  masteryScore,
  confidenceScore,
  activeMisconceptions,
  prerequisitesSatisfied,
}) {
  return (
    consecutiveSuccesses >= 2 &&
    attemptsCount >= 3 &&
    masteryScore >= 85 &&
    confidenceScore >= 75 &&
    (!activeMisconceptions || activeMisconceptions.length === 0) &&
    prerequisitesSatisfied === true
  );
}

/**
 * Creates a clean default NOT_STARTED state for a concept
 */
export function createInitialConceptLearningState(conceptId, userId, subjectId, topicId) {
  return {
    userId,
    subjectId,
    topicId,
    conceptId,
    masteryStatus: 'NOT_STARTED',
    masteryScore: 0,
    decayedScore: 0,
    confidenceScore: 0,
    attemptsCount: 0,
    consecutiveSuccesses: 0,
    consecutiveFailures: 0,
    activeMisconceptions: [],
    resolvedMisconceptions: [],
    prerequisiteWarning: false,
    unmetPrerequisiteIds: [],
    lastAttemptedAt: null,
    lastDemonstratedAt: null,
    lastProcessedTurnId: null,
    lastProcessedAnsweredAt: null,
    stateVersion: 1,
  };
}

/**
 * Pure transition engine: applies a single completed StudyTurn to a ConceptLearningState.
 *
 * @param {Object} currentState - Current state of concept
 * @param {Object} turn - Completed StudyTurn subdocument
 * @param {Object} options - { prerequisites: ObjectId[], prerequisiteStatesMap: Map, evaluationTime: Date }
 * @returns {Object} New immutable ConceptLearningState object
 */
export function applyTurnToConceptState(currentState, turn, options = {}) {
  const evaluationTime = options.evaluationTime || turn.answeredAt || new Date();
  const evaluation = turn.evaluation || {};
  const verdict = evaluation.verdict;
  const correctness = typeof evaluation.correctness === 'number' ? evaluation.correctness : 0;
  const misconceptionDetected = Boolean(evaluation.misconceptionDetected);
  const misconceptionSummary = evaluation.misconceptionSummary || '';
  const isFollowUp = turn.attemptType === 'FOLLOW_UP';
  const turnAnsweredAt = turn.answeredAt ? new Date(turn.answeredAt) : new Date();
  const turnId = turn._id;

  const state = {
    ...currentState,
    activeMisconceptions: Array.isArray(currentState.activeMisconceptions)
      ? currentState.activeMisconceptions.map((m) => ({ ...m }))
      : [],
    resolvedMisconceptions: Array.isArray(currentState.resolvedMisconceptions)
      ? currentState.resolvedMisconceptions.map((m) => ({ ...m }))
      : [],
    unmetPrerequisiteIds: Array.isArray(currentState.unmetPrerequisiteIds)
      ? [...currentState.unmetPrerequisiteIds]
      : [],
  };

  state.attemptsCount += 1;
  state.lastAttemptedAt = turnAnsweredAt;
  state.lastProcessedTurnId = turnId;
  state.lastProcessedAnsweredAt = turnAnsweredAt;

  // Prerequisite check
  const prereqCheck = checkPrerequisitesSatisfied(options.prerequisites || [], options.prerequisiteStatesMap || new Map());
  state.prerequisiteWarning = !prereqCheck.satisfied;
  state.unmetPrerequisiteIds = prereqCheck.unmetPrerequisiteIds;

  const prevStatus = state.masteryStatus;

  // Misconception handling helper
  const addActiveMisconception = (text) => {
    if (text && !state.activeMisconceptions.some((m) => m.misconceptionText === text)) {
      state.activeMisconceptions.push({
        misconceptionText: text,
        detectedAt: turnAnsweredAt,
        turnId,
      });
    }
  };

  const resolveAllActiveMisconceptions = () => {
    if (state.activeMisconceptions.length > 0) {
      for (const m of state.activeMisconceptions) {
        state.resolvedMisconceptions.push({
          misconceptionText: m.misconceptionText,
          detectedAt: m.detectedAt || turnAnsweredAt,
          resolvedAt: turnAnsweredAt,
          turnId,
        });
      }
      state.activeMisconceptions = [];
    }
  };

  // --- TRANSITIONS ---
  if (prevStatus === 'NOT_STARTED') {
    if (verdict === 'CORRECT') {
      if (correctness >= 85) {
        state.masteryStatus = 'UNDERSTOOD';
        state.masteryScore = 70;
        state.confidenceScore = 40;
      } else {
        state.masteryStatus = 'LEARNING';
        state.masteryScore = 50;
        state.confidenceScore = 30;
      }
      state.consecutiveSuccesses = 1;
      state.consecutiveFailures = 0;
      state.lastDemonstratedAt = turnAnsweredAt;
    } else if (verdict === 'PARTIALLY_CORRECT') {
      state.masteryStatus = 'LEARNING';
      state.masteryScore = 35;
      state.confidenceScore = 20;
      state.consecutiveSuccesses = 0;
      state.consecutiveFailures = 0;
      state.lastDemonstratedAt = turnAnsweredAt;
    } else {
      // INCORRECT or UNCERTAIN
      state.masteryStatus = 'NEEDS_REVIEW';
      state.masteryScore = 10;
      state.confidenceScore = 10;
      state.consecutiveSuccesses = 0;
      state.consecutiveFailures = 1;
      if (misconceptionDetected || misconceptionSummary) {
        addActiveMisconception(misconceptionSummary || 'Initial attempt conceptual error detected');
      }
    }
  } else if (prevStatus === 'NEEDS_REVIEW') {
    if (isFollowUp && verdict === 'CORRECT') {
      resolveAllActiveMisconceptions();
      state.masteryScore = calculateScoreGain(state.masteryScore, 30);
      state.confidenceScore = calculateConfidenceGain(state.confidenceScore, 20);
      state.consecutiveSuccesses = 1;
      state.consecutiveFailures = 0;
      state.lastDemonstratedAt = turnAnsweredAt;
      state.masteryStatus = state.masteryScore >= 75 ? 'UNDERSTOOD' : 'LEARNING';
    } else if (verdict === 'CORRECT') {
      if (misconceptionDetected) {
        addActiveMisconception(misconceptionSummary);
      } else {
        resolveAllActiveMisconceptions();
      }
      state.masteryScore = calculateScoreGain(state.masteryScore, 25);
      state.confidenceScore = calculateConfidenceGain(state.confidenceScore, 15);
      state.consecutiveSuccesses = 1;
      state.consecutiveFailures = 0;
      state.lastDemonstratedAt = turnAnsweredAt;
      if (state.activeMisconceptions.length === 0) {
        state.masteryStatus = state.masteryScore >= 75 ? 'UNDERSTOOD' : 'LEARNING';
      }
    } else {
      // INCORRECT or PARTIALLY_CORRECT during NEEDS_REVIEW
      state.masteryScore = calculateScorePenalty(state.masteryScore, 15);
      state.confidenceScore = calculateConfidencePenalty(state.confidenceScore, 10);
      state.consecutiveSuccesses = 0;
      state.consecutiveFailures += 1;
      if (misconceptionDetected) {
        addActiveMisconception(misconceptionSummary);
      }
    }
  } else if (prevStatus === 'LEARNING') {
    if (verdict === 'CORRECT') {
      state.consecutiveSuccesses += 1;
      state.consecutiveFailures = 0;
      state.lastDemonstratedAt = turnAnsweredAt;
      state.masteryScore = calculateScoreGain(state.masteryScore, 25);
      state.confidenceScore = calculateConfidenceGain(state.confidenceScore, 20);

      if (correctness >= 85 && state.attemptsCount >= 2 && state.masteryScore >= 70) {
        state.masteryStatus = 'UNDERSTOOD';
      }
    } else if (verdict === 'PARTIALLY_CORRECT') {
      state.consecutiveSuccesses = 0;
      state.masteryScore = calculateScoreGain(state.masteryScore, 10);
      state.confidenceScore = calculateConfidenceGain(state.confidenceScore, 5);
      state.lastDemonstratedAt = turnAnsweredAt;
    } else {
      // INCORRECT
      state.consecutiveSuccesses = 0;
      state.consecutiveFailures += 1;

      if (state.consecutiveFailures >= 2 || misconceptionDetected) {
        state.masteryStatus = 'NEEDS_REVIEW';
        state.masteryScore = calculateScorePenalty(state.masteryScore, 25);
        state.confidenceScore = calculateConfidencePenalty(state.confidenceScore, 15);
        if (misconceptionDetected) {
          addActiveMisconception(misconceptionSummary);
        }
      } else {
        state.masteryScore = calculateScorePenalty(state.masteryScore, 15);
        state.confidenceScore = calculateConfidencePenalty(state.confidenceScore, 10);
      }
    }
  } else if (prevStatus === 'UNDERSTOOD') {
    if (verdict === 'CORRECT') {
      state.consecutiveSuccesses += 1;
      state.consecutiveFailures = 0;
      state.lastDemonstratedAt = turnAnsweredAt;
      state.masteryScore = calculateScoreGain(state.masteryScore, 15);
      state.confidenceScore = calculateConfidenceGain(state.confidenceScore, 15);

      const masteredEligible = isConceptMastered({
        consecutiveSuccesses: state.consecutiveSuccesses,
        attemptsCount: state.attemptsCount,
        masteryScore: state.masteryScore,
        confidenceScore: state.confidenceScore,
        activeMisconceptions: state.activeMisconceptions,
        prerequisitesSatisfied: prereqCheck.satisfied,
      });

      if (masteredEligible) {
        state.masteryStatus = 'MASTERED';
      } else if (!prereqCheck.satisfied) {
        state.masteryStatus = 'UNDERSTOOD';
      }
    } else if (verdict === 'PARTIALLY_CORRECT') {
      state.consecutiveSuccesses = 0;
      state.masteryScore = calculateScoreGain(state.masteryScore, 5);
      state.confidenceScore = calculateConfidenceGain(state.confidenceScore, 5);
      state.lastDemonstratedAt = turnAnsweredAt;
    } else {
      // INCORRECT or misconceptionDetected
      state.masteryStatus = 'NEEDS_REVIEW';
      state.masteryScore = calculateScorePenalty(state.masteryScore, 25);
      state.confidenceScore = calculateConfidencePenalty(state.confidenceScore, 20);
      state.consecutiveSuccesses = 0;
      state.consecutiveFailures = 1;
      if (misconceptionDetected) {
        addActiveMisconception(misconceptionSummary);
      }
    }
  } else if (prevStatus === 'MASTERED') {
    if (verdict === 'CORRECT') {
      state.consecutiveSuccesses += 1;
      state.consecutiveFailures = 0;
      state.lastDemonstratedAt = turnAnsweredAt;
      state.masteryScore = calculateScoreGain(state.masteryScore, 5);
      state.confidenceScore = calculateConfidenceGain(state.confidenceScore, 5);
    } else if (verdict === 'PARTIALLY_CORRECT') {
      state.consecutiveSuccesses = 0;
      state.masteryScore = calculateScorePenalty(state.masteryScore, 10);
      state.confidenceScore = calculateConfidencePenalty(state.confidenceScore, 10);
      state.lastDemonstratedAt = turnAnsweredAt;
    } else {
      // INCORRECT demotion
      state.masteryStatus = 'NEEDS_REVIEW';
      state.masteryScore = calculateScorePenalty(state.masteryScore, 30);
      state.confidenceScore = calculateConfidencePenalty(state.confidenceScore, 25);
      state.consecutiveSuccesses = 0;
      state.consecutiveFailures = 1;
      if (misconceptionDetected) {
        addActiveMisconception(misconceptionSummary);
      }
    }
  }

  // Calculate decayedScore at evaluationTime
  state.decayedScore = calculateDecayedScore(state.masteryScore, state.lastDemonstratedAt, evaluationTime);

  return state;
}

/**
 * Pure deterministic projection over an evidence sequence E.
 *
 * @param {Map<string, Object>} initialStatesMap - Map of conceptId -> ConceptLearningState
 * @param {Array<Object>} turns - Array of completed StudyTurn objects
 * @param {Map<string, ObjectId[]>} conceptPrerequisitesMap - Map of conceptId -> prerequisites
 * @param {Date|number} evaluationTime - Evaluation timestamp for deterministic decay
 * @returns {Map<string, Object>} Recomputed concept states map
 */
export function projectEvidenceHistory(initialStatesMap, turns = [], conceptPrerequisitesMap = new Map(), evaluationTime = new Date()) {
  // Deterministic total ordering: answeredAt ascending, then _id.toString() ascending
  const sortedTurns = [...turns].sort((a, b) => {
    const timeA = a.answeredAt ? new Date(a.answeredAt).getTime() : 0;
    const timeB = b.answeredAt ? new Date(b.answeredAt).getTime() : 0;
    if (timeA !== timeB) return timeA - timeB;
    const idA = a._id ? a._id.toString() : '';
    const idB = b._id ? b._id.toString() : '';
    return idA.localeCompare(idB);
  });

  const statesMap = new Map();
  for (const [key, val] of initialStatesMap.entries()) {
    statesMap.set(key.toString(), { ...val });
  }

  for (const turn of sortedTurns) {
    if (!turn.evaluation || turn.evaluation.verdict === null) continue;

    const targetIds = turn.question && Array.isArray(turn.question.targetConceptIds)
      ? turn.question.targetConceptIds
      : [];

    for (const targetId of targetIds) {
      const strTargetId = targetId.toString();
      const currentState = statesMap.get(strTargetId);
      if (!currentState) continue;

      const prerequisites = conceptPrerequisitesMap.get(strTargetId) || [];
      const updatedState = applyTurnToConceptState(currentState, turn, {
        prerequisites,
        prerequisiteStatesMap: statesMap,
        evaluationTime: turn.answeredAt || evaluationTime,
      });

      statesMap.set(strTargetId, updatedState);
    }
  }

  // Final pass to calculate decayedScore for all concepts at the exact requested evaluationTime
  for (const [strId, state] of statesMap.entries()) {
    state.decayedScore = calculateDecayedScore(state.masteryScore, state.lastDemonstratedAt, evaluationTime);
    // Refresh prerequisite gating warnings
    const prereqs = conceptPrerequisitesMap.get(strId) || [];
    const check = checkPrerequisitesSatisfied(prereqs, statesMap);
    state.prerequisiteWarning = !check.satisfied;
    state.unmetPrerequisiteIds = check.unmetPrerequisiteIds;
  }

  return statesMap;
}
