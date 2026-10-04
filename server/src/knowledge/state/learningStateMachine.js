/**
 * Learning State Machine & Deterministic Evaluation (Phase 06)
 * Governs bounded state transitions, confidence scoring, and topic mastery calculations.
 */

export const LEARNING_STATES = {
  NOT_STARTED: 'NOT_STARTED',
  INTRODUCED: 'INTRODUCED',
  LEARNING: 'LEARNING',
  UNDERSTOOD: 'UNDERSTOOD',
  STRONG: 'STRONG',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
};

export class LearningStateMachine {
  /**
   * Calculates the next concept state, bounded confidence score, and updated misconceptions
   */
  evaluateTransition({ currentConcept, eventData }) {
    const isNew = !currentConcept;
    const currentStatus = isNew ? LEARNING_STATES.NOT_STARTED : currentConcept.status || LEARNING_STATES.NOT_STARTED;
    const currentScore = isNew ? 0 : currentConcept.confidenceScore || 0;
    const currentEvidenceCount = isNew ? 0 : currentConcept.evidenceCount || 0;
    const nextEvidenceCount = currentEvidenceCount + 1;

    const {
      eventType,
      classificationOutcome,
      confidenceDelta,
      misconception,
    } = eventData;

    let newStatus = currentStatus;
    let newScore = currentScore;
    const isMisconception = eventType === 'misconception_detected' || eventType === 'concept_misunderstood';
    const isCorrection = (eventType === 'concept_corrected' || classificationOutcome === 'CORRECTION') && !isMisconception;
    const hasActiveMisconception = Boolean(misconception && misconception.misconceptionText);
    const isConflict = classificationOutcome === 'CONFLICT' || eventType === 'concept_conflict';

    // 1. Correction of Previous Misconception -> Explicit Precedence Recovery (Evaluated First)
    if (isCorrection) {
      newScore = Math.min(100, currentScore + 15);
      if (currentStatus === LEARNING_STATES.NEEDS_REVIEW || currentStatus === LEARNING_STATES.NOT_STARTED) {
        if (nextEvidenceCount >= 3 && newScore >= 70) {
          newStatus = LEARNING_STATES.UNDERSTOOD;
        } else {
          newStatus = LEARNING_STATES.LEARNING;
        }
      } else {
        newStatus = this._evaluateStatusFromMetrics(nextEvidenceCount, newScore);
      }

      return {
        previousStatus: isNew ? null : currentStatus,
        newStatus,
        confidenceScore: newScore,
        evidenceCount: nextEvidenceCount,
      };
    }

    // 2. Misconception / Confusion / Conflict -> Immediate regression to NEEDS_REVIEW
    if (
      hasActiveMisconception ||
      isConflict ||
      eventType === 'misconception_detected' ||
      eventType === 'concept_misunderstood'
    ) {
      newStatus = LEARNING_STATES.NEEDS_REVIEW;
      const penalty = misconception?.severity === 'high' ? 30 : misconception?.severity === 'low' ? 15 : 20;
      newScore = Math.max(0, Math.round(currentScore - penalty));
      return {
        previousStatus: isNew ? null : currentStatus,
        newStatus,
        confidenceScore: newScore,
        evidenceCount: nextEvidenceCount,
      };
    }

    // 3. First-time Concept Introduction
    if (isNew || eventType === 'concept_introduced') {
      newScore = Math.max(currentScore, 25);
    }
    // 4. Duplicate Repetition -> Minimal reinforcement
    else if (classificationOutcome === 'DUPLICATE') {
      newScore = this._applyBoundedIncrease(currentScore, 5);
    }
    // 5. Active Recall / Reinforcement
    else if (eventType === 'concept_recalled' || eventType === 'concept_reinforced') {
      const delta = typeof confidenceDelta === 'number' ? confidenceDelta : 20;
      newScore = this._applyBoundedIncrease(currentScore, delta);
    }
    // 6. Normal Explanation / Complementary Knowledge
    else {
      const delta = typeof confidenceDelta === 'number' ? confidenceDelta : 25;
      newScore = this._applyBoundedIncrease(currentScore, delta);
    }

    // Determine target status from authoritative thresholds
    newStatus = this._evaluateStatusFromMetrics(nextEvidenceCount, newScore);

    return {
      previousStatus: isNew ? null : currentStatus,
      newStatus,
      confidenceScore: newScore,
      evidenceCount: nextEvidenceCount,
    };
  }

  /**
   * Deterministic status evaluation from evidence count and confidence score
   */
  _evaluateStatusFromMetrics(evidenceCount, score) {
    if (evidenceCount >= 5 && score >= 90) {
      return LEARNING_STATES.STRONG;
    }
    if (evidenceCount >= 3 && score >= 70) {
      return LEARNING_STATES.UNDERSTOOD;
    }
    if (evidenceCount >= 2 && score >= 40) {
      return LEARNING_STATES.LEARNING;
    }
    if (evidenceCount >= 1) {
      return LEARNING_STATES.INTRODUCED;
    }
    return LEARNING_STATES.NOT_STARTED;
  }

  /**
   * Evaluates topic-level mastery aggregate from all its active concepts
   */
  evaluateTopicAggregate(concepts = []) {
    if (!concepts || concepts.length === 0) {
      return {
        masteryScore: 0,
        status: 'not_started',
        keyConcepts: [],
      };
    }

    const totalScore = concepts.reduce((sum, c) => sum + (c.confidenceScore || 0), 0);
    const averageScore = Math.round(totalScore / concepts.length);
    const keyConcepts = concepts.map((c) => c.name);

    const hasAnyActive = concepts.some((c) =>
      ['INTRODUCED', 'LEARNING', 'UNDERSTOOD', 'STRONG', 'NEEDS_REVIEW'].includes(c.status)
    );

    const allUnderstoodOrStrong = concepts.every((c) =>
      ['UNDERSTOOD', 'STRONG'].includes(c.status)
    );

    let status = 'not_started';
    if (allUnderstoodOrStrong && averageScore >= 80) {
      status = 'mastered';
    } else if (hasAnyActive) {
      status = 'in_progress';
    }

    return {
      masteryScore: Math.min(100, Math.max(0, averageScore)),
      status,
      keyConcepts,
    };
  }

  _applyBoundedIncrease(current, delta) {
    if (current >= 100) return 100;
    // Diminishing returns formula as confidence approaches 100
    const factor = Math.max(0.1, 1 - current / 125);
    const increase = Math.max(1, Math.round(delta * factor));
    return Math.min(100, current + increase);
  }
}
