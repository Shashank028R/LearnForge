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
 * Calculates retention probability (retrievability R in [0, 1])
 */
export function calculateRetrievability(lastDemonstratedAt, evaluationTime = new Date(), stabilityDays = 14) {
  if (!lastDemonstratedAt) return 0;
  const evalMs = evaluationTime instanceof Date ? evaluationTime.getTime() : new Date(evaluationTime).getTime();
  const demMs = lastDemonstratedAt instanceof Date ? lastDemonstratedAt.getTime() : new Date(lastDemonstratedAt).getTime();
  const elapsedDays = Math.max(0, (evalMs - demMs) / 86400000);
  const stab = Math.max(1, stabilityDays);
  return Math.exp(-elapsedDays / stab);
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
 * Deterministically sorts target concepts within a single turn:
 * 1. Prerequisites precede dependent concepts (topological order).
 * 2. Lexicographical tie-breaker on conceptId.toString().
 */
export function sortTargetConceptsByDependency(targetConceptIds = [], conceptPrerequisitesMap = new Map()) {
  if (!targetConceptIds || targetConceptIds.length <= 1) {
    return targetConceptIds;
  }

  const targetIdStrings = targetConceptIds.map((id) => id.toString());
  const targetIdSet = new Set(targetIdStrings);

  const inDegree = new Map();
  const adj = new Map();

  for (const id of targetIdStrings) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }

  for (const id of targetIdStrings) {
    const prereqs = conceptPrerequisitesMap.get(id) || [];
    for (const prereq of prereqs) {
      const pStr = prereq.toString();
      if (targetIdSet.has(pStr) && pStr !== id) {
        adj.get(pStr).push(id);
        inDegree.set(id, (inDegree.get(id) || 0) + 1);
      }
    }
  }

  const queue = targetIdStrings.filter((id) => inDegree.get(id) === 0).sort();
  const sorted = [];

  while (queue.length > 0) {
    const current = queue.shift();
    sorted.push(current);

    const neighbors = adj.get(current) || [];
    for (const neighbor of neighbors) {
      inDegree.set(neighbor, inDegree.get(neighbor) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
        queue.sort();
      }
    }
  }

  for (const id of targetIdStrings) {
    if (!sorted.includes(id)) {
      sorted.push(id);
    }
  }

  const idMap = new Map(targetConceptIds.map((id) => [id.toString(), id]));
  return sorted.map((strId) => idMap.get(strId));
}

/**
 * Pure deterministic projection over an evidence sequence E.
 */
export function projectEvidenceHistory(initialStatesMap, turns = [], conceptPrerequisitesMap = new Map(), evaluationTime = new Date()) {
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

    const rawTargetIds = turn.question && Array.isArray(turn.question.targetConceptIds)
      ? turn.question.targetConceptIds
      : [];

    const targetIds = sortTargetConceptsByDependency(rawTargetIds, conceptPrerequisitesMap);

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

  for (const [strId, state] of statesMap.entries()) {
    state.decayedScore = calculateDecayedScore(state.masteryScore, state.lastDemonstratedAt, evaluationTime);
    const prereqs = conceptPrerequisitesMap.get(strId) || [];
    const check = checkPrerequisitesSatisfied(prereqs, statesMap);
    state.prerequisiteWarning = !check.satisfied;
    state.unmetPrerequisiteIds = check.unmetPrerequisiteIds;
  }

  return statesMap;
}

// ============================================================================
// PHASE 09 CHECKPOINT 3: GLOBALLY TRANSITIVE PREREQUISITE & PRIORITY ENGINE
// ============================================================================

/**
 * Computes subject-wide transitive prerequisite metrics for all canonical concepts.
 *
 * @param {Array<Object>} subjectConcepts - All canonical Concept documents in subject
 * @param {Map<string, Object>|Array<Object>} userLearningStates - Persisted ConceptLearningStates
 * @returns {Map<string, Object>} conceptId -> { unmasteredPrereqDepth, unmasteredDownstreamCount, isRootBlocker, isBlocked, isMastered }
 */
export function findSubjectTransitivePrerequisiteMetrics(subjectConcepts = [], userLearningStates = new Map()) {
  const statesMap = userLearningStates instanceof Map
    ? userLearningStates
    : new Map((userLearningStates || []).map((s) => [s.conceptId ? s.conceptId.toString() : s._id.toString(), s]));

  const conceptMap = new Map();
  const directPrereqMap = new Map();
  const directDependentsMap = new Map();

  for (const c of subjectConcepts) {
    const cId = c._id.toString();
    conceptMap.set(cId, c);
    const prereqs = Array.isArray(c.prerequisites) ? c.prerequisites.map((p) => p.toString()) : [];
    directPrereqMap.set(cId, prereqs);
    if (!directDependentsMap.has(cId)) {
      directDependentsMap.set(cId, []);
    }
  }

  // Build reverse adjacency graph (dependents)
  for (const [cId, prereqs] of directPrereqMap.entries()) {
    for (const pId of prereqs) {
      if (!directDependentsMap.has(pId)) {
        directDependentsMap.set(pId, []);
      }
      directDependentsMap.get(pId).push(cId);
    }
  }

  // Helper to check if a concept is mastered (masteryScore >= 70 / MASTERED status)
  const isConceptMasteredScore = (cId) => {
    const state = statesMap.get(cId);
    if (!state) return false;
    if (state.masteryStatus === 'MASTERED') return true;
    return typeof state.masteryScore === 'number' && state.masteryScore >= 70;
  };

  const metricsMap = new Map();

  // 1. Calculate unmasteredPrereqDepth (longest unmastered path leading to cId)
  const computePrereqDepth = (cId, visited = new Set()) => {
    if (visited.has(cId)) return 0; // Cycle defensive
    visited.add(cId);

    const prereqs = directPrereqMap.get(cId) || [];
    let maxDepth = 0;

    for (const pId of prereqs) {
      if (!isConceptMasteredScore(pId)) {
        const pDepth = 1 + computePrereqDepth(pId, new Set(visited));
        if (pDepth > maxDepth) maxDepth = pDepth;
      }
    }

    return maxDepth;
  };

  // 2. Calculate unmasteredDownstreamCount (distinct unmastered reachable concepts in downstream DAG)
  const computeDownstreamCount = (cId) => {
    const reachableUnmastered = new Set();
    const queue = [...(directDependentsMap.get(cId) || [])];
    const visited = new Set(queue);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!isConceptMasteredScore(current)) {
        reachableUnmastered.add(current);
      }
      const nextDeps = directDependentsMap.get(current) || [];
      for (const n of nextDeps) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }

    return reachableUnmastered.size;
  };

  for (const c of subjectConcepts) {
    const cId = c._id.toString();
    const isMastered = isConceptMasteredScore(cId);
    const unmasteredPrereqDepth = computePrereqDepth(cId);
    const unmasteredDownstreamCount = computeDownstreamCount(cId);
    const isRootBlocker = !isMastered && unmasteredPrereqDepth === 0 && unmasteredDownstreamCount > 0;
    const isBlocked = !isMastered && unmasteredPrereqDepth > 0;

    metricsMap.set(cId, {
      conceptId: c._id,
      isMastered,
      unmasteredPrereqDepth,
      unmasteredDownstreamCount,
      isRootBlocker,
      isBlocked,
    });
  }

  return metricsMap;
}

// ============================================================================
// STATUS MAPPINGS: SEALED CHECKPOINT 2 <-> PUBLIC CHECKPOINT 3 API CONTRACT
// ============================================================================

export const PERSISTED_TO_PUBLIC_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  LEARNING: 'INTRODUCED',
  UNDERSTOOD: 'PRACTICING',
  NEEDS_REVIEW: 'STRUGGLING',
  MASTERED: 'MASTERED',
};

export const PUBLIC_TO_PERSISTED_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  INTRODUCED: 'LEARNING',
  PRACTICING: 'UNDERSTOOD',
  STRUGGLING: 'NEEDS_REVIEW',
  MASTERED: 'MASTERED',
};

export const VALID_PUBLIC_STATUSES = new Set([
  'NOT_STARTED',
  'INTRODUCED',
  'PRACTICING',
  'STRUGGLING',
  'MASTERED',
]);

export const VALID_PERSISTED_STATUSES = new Set([
  'NOT_STARTED',
  'LEARNING',
  'UNDERSTOOD',
  'NEEDS_REVIEW',
  'MASTERED',
]);


export function toPublicStatus(status) {
  if (!status) return 'NOT_STARTED';
  return PERSISTED_TO_PUBLIC_STATUS[status] || status;
}

export function toPersistedStatus(status) {
  if (!status) return 'NOT_STARTED';
  return PUBLIC_TO_PERSISTED_STATUS[status] || status;
}

/**
 * Computes bounded study priority score [0, 1000] across 6 normalized factors per Checkpoint 3 v10.
 * Derivation defaults for fields not persisted by sealed baseline:
 * - stability: 1.0 day for NOT_STARTED, 14.0 days for studied concepts
 * - retrievability: exp(-elapsedDays / stability) if lastDemonstratedAt exists, else 0.0
 * - nextDueDate: lastDemonstratedAt + 7 days grace period, or null if never demonstrated
 */
export function calculateConceptPriorityScore(concept, state, prereqMetrics = {}, evaluationTime = new Date()) {
  const metrics = prereqMetrics || {};
  const downstreamCount = metrics.unmasteredDownstreamCount || 0;

  // Factor 1: Prerequisite Urgency (0..300)
  const fPrereq = Math.min(300, 60 * downstreamCount);

  // Factor 2: Status Urgency (0..250)
  const rawStatus = state?.masteryStatus || state?.status || 'NOT_STARTED';
  const publicStatus = toPublicStatus(rawStatus);
  let fStatus = 0;
  if (publicStatus === 'NOT_STARTED') fStatus = 250;
  else if (publicStatus === 'STRUGGLING') fStatus = 200;
  else if (publicStatus === 'INTRODUCED') fStatus = 150;
  else if (publicStatus === 'PRACTICING') fStatus = 100;
  else if (publicStatus === 'MASTERED') fStatus = 0;

  // Factor 3: Misconception Urgency (0..200)
  const activeMisconceptions = Array.isArray(state?.activeMisconceptions) ? state.activeMisconceptions.length : 0;
  const fMisconception = Math.min(200, 100 * activeMisconceptions);

  // Factor 4: Decay Urgency (0..150) based on retrievability: F_decay = 150 * (1 - retrievability)
  const stabilityDays = typeof state?.stability === 'number' && state.stability > 0
    ? state.stability
    : (publicStatus === 'NOT_STARTED' ? 1.0 : 14.0);
  const retrievability = typeof state?.retrievability === 'number'
    ? state.retrievability
    : calculateRetrievability(state?.lastDemonstratedAt, evaluationTime, stabilityDays);
  const fDecay = Math.min(150, Math.max(0, Math.round(150 * (1 - retrievability))));

  // Factor 5: Failure Urgency (0..90)
  const consecutiveFailures = state?.consecutiveFailures || 0;
  const fFailure = Math.min(90, 30 * consecutiveFailures);

  // Factor 6: Recency Urgency (0..50) based on due-date and stability distance
  // If never studied or overdue: 50
  // If not due: max(0, 50 * (1 - (nextDueDate - evaluationTime) / (stability * 86400000)))
  let fRecency = 50;
  if (!state?.lastDemonstratedAt && !state?.lastAttemptedAt) {
    fRecency = 50;
  } else {
    const nextDueDate = state?.nextDueDate
      ? (state.nextDueDate instanceof Date ? state.nextDueDate : new Date(state.nextDueDate))
      : (state?.lastDemonstratedAt ? new Date(new Date(state.lastDemonstratedAt).getTime() + 7 * 86400000) : null);

    if (!nextDueDate) {
      fRecency = 50;
    } else {
      const evalMs = evaluationTime instanceof Date ? evaluationTime.getTime() : new Date(evaluationTime).getTime();
      const dueMs = nextDueDate.getTime();
      if (evalMs >= dueMs) {
        fRecency = 50;
      } else {
        const remainingMs = dueMs - evalMs;
        const stabilityMs = stabilityDays * 86400000;
        fRecency = Math.max(0, Math.min(50, Math.round(50 * (1 - remainingMs / stabilityMs))));
      }
    }
  }

  const rawScore = fPrereq + fStatus + fMisconception + fDecay + fFailure + fRecency;
  const clampedScore = Math.max(0, Math.min(1000, Math.round(rawScore)));

  return {
    rawScore,
    priorityScore: clampedScore,
    factors: {
      fPrereq,
      fStatus,
      fMisconception,
      fDecay,
      fFailure,
      fRecency,
    },
  };
}

/**
 * Determines ranking tier (1: Root Blocker, 2: Active Unblocked, 3: Gated/Blocked, 4: Mastered Maintenance)
 */
export function determineRankingTier(state, prereqMetrics = {}) {
  const mastery = typeof state?.masteryScore === 'number' ? state.masteryScore : 0;
  const isMastered = state?.masteryStatus === 'MASTERED' || mastery >= 70;
  const depth = prereqMetrics.unmasteredPrereqDepth || 0;
  const downstreamCount = prereqMetrics.unmasteredDownstreamCount || 0;

  if (isMastered) {
    return 4; // Tier 4: Mastered Maintenance
  }
  if (depth === 0 && downstreamCount > 0) {
    return 1; // Tier 1: Root Prerequisite Blocker
  }
  if (depth === 0 && downstreamCount === 0) {
    return 2; // Tier 2: Unblocked Active Candidate
  }
  return 3; // Tier 3: Gated / Blocked Candidate
}

/**
 * Generates the globally transitive, monotonic 6-element ranking key tuple.
 */
export function generateGlobalRankingKey(concept, state, priorityScore, prereqMetrics = {}) {
  const tier = determineRankingTier(state, prereqMetrics);
  const depth = prereqMetrics.unmasteredPrereqDepth || 0;
  const decayedScore = typeof state?.decayedScore === 'number' ? state.decayedScore : (state?.masteryScore || 0);
  const consecutiveFailures = state?.consecutiveFailures || 0;
  const idStr = concept._id ? concept._id.toString() : '';

  return {
    tier,
    depth,
    negPriorityScore: -priorityScore,
    decayedScore,
    negFailures: -consecutiveFailures,
    idStr,
  };
}

/**
 * Lexicographical comparator using the 6-element ranking tuple.
 */
export function compareConceptsByRankingKey(a, b) {
  const kA = a.rankingKey;
  const kB = b.rankingKey;

  // 1. Tier ascending (Tier 1 < Tier 2 < Tier 3 < Tier 4)
  if (kA.tier !== kB.tier) return kA.tier - kB.tier;

  // 2. Prerequisite depth ascending (closer to unblocking first)
  if (kA.depth !== kB.depth) return kA.depth - kB.depth;

  // 3. Priority score descending (higher priority first => negPriorityScore ascending)
  if (kA.negPriorityScore !== kB.negPriorityScore) return kA.negPriorityScore - kB.negPriorityScore;

  // 4. Decayed score ascending (lower retention first)
  if (kA.decayedScore !== kB.decayedScore) return kA.decayedScore - kB.decayedScore;

  // 5. Consecutive failures descending (more failures first => negFailures ascending)
  if (kA.negFailures !== kB.negFailures) return kA.negFailures - kB.negFailures;

  // 6. Deterministic tie-breaker on concept ID string
  return kA.idStr.localeCompare(kB.idStr);
}

/**
 * Generates human-readable deterministic recommendation reason code.
 */
export function generatePriorityReason(concept, state, priorityScore, prereqMetrics = {}) {
  const tier = determineRankingTier(state, prereqMetrics);
  const activeMisconceptions = Array.isArray(state?.activeMisconceptions) ? state.activeMisconceptions.length : 0;
  const consecutiveFailures = state?.consecutiveFailures || 0;
  const mastery = state?.masteryScore || 0;
  const decayed = typeof state?.decayedScore === 'number' ? state.decayedScore : mastery;
  const publicStatus = toPublicStatus(state?.masteryStatus || state?.status);

  if (tier === 1) return 'ROOT_PREREQUISITE_BLOCKER';
  if (activeMisconceptions > 0) return 'ACTIVE_MISCONCEPTION';
  if (consecutiveFailures >= 2) return 'RECENT_FAILURE';
  if (publicStatus === 'NOT_STARTED') return 'NEW_CONCEPT_INTRODUCTION';
  if (mastery - decayed >= 25) return 'FORGETTING_RISK';
  if (tier === 4) return 'MAINTENANCE_REVIEW';
  return 'PRACTICE_DUE';
}
