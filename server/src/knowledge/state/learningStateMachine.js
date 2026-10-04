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

    const {
      eventType,
      classificationOutcome,
      confidenceDelta = 15,
      misconception,
    } = eventData;

    let newStatus = currentStatus;
    let newScore = currentScore;
    let hasActiveMisconception = misconception && Boolean(misconception.misconceptionText);

    // 1. Misconception or Confusion Detection -> Regression to NEEDS_REVIEW
    if (
      hasActiveMisconception ||
      eventType === 'misconception_detected' ||
      eventType === 'concept_misunderstood'
    ) {
      newStatus = LEARNING_STATES.NEEDS_REVIEW;
      const penalty = misconception?.severity === 'high' ? 30 : misconception?.severity === 'low' ? 15 : 20;
      newScore = Math.max(0, Math.round(currentScore - penalty));
    }
    // 2. Correction of Previous Misconception -> Recovery to LEARNING
    else if (eventType === 'concept_corrected' || classificationOutcome === 'CORRECTION') {
      if (currentStatus === LEARNING_STATES.NEEDS_REVIEW || currentStatus === LEARNING_STATES.NOT_STARTED) {
        newStatus = LEARNING_STATES.LEARNING;
      }
      newScore = this._applyBoundedIncrease(currentScore, 15);
    }
    // 3. First-time Concept Introduction
    else if (isNew || eventType === 'concept_introduced') {
      newStatus = LEARNING_STATES.INTRODUCED;
      newScore = Math.max(currentScore, 20);
    }
    // 4. Duplicate Fact Statement -> Minimal reward for repetition without inflation
    else if (classificationOutcome === 'DUPLICATE') {
      newScore = this._applyBoundedIncrease(currentScore, 2);
    }
    // 5. Normal Explanation / Complementary Knowledge
    else if (eventType === 'concept_explained' || classificationOutcome === 'COMPLEMENTARY') {
      if (currentStatus === LEARNING_STATES.NOT_STARTED) {
        newStatus = LEARNING_STATES.INTRODUCED;
      } else if (currentStatus === LEARNING_STATES.INTRODUCED) {
        newStatus = LEARNING_STATES.LEARNING;
      }
      newScore = this._applyBoundedIncrease(currentScore, confidenceDelta);
    }
    // 6. Recall / Active Reinforcement
    else if (eventType === 'concept_recalled' || eventType === 'concept_reinforced') {
      const nextCount = currentEvidenceCount + 1;
      const potentialScore = this._applyBoundedIncrease(currentScore, confidenceDelta);

      if (currentStatus === LEARNING_STATES.UNDERSTOOD && nextCount >= 4 && potentialScore >= 80) {
        newStatus = LEARNING_STATES.STRONG;
      } else if (
        (currentStatus === LEARNING_STATES.LEARNING || currentStatus === LEARNING_STATES.INTRODUCED) &&
        nextCount >= 2 &&
        potentialScore >= 60
      ) {
        newStatus = LEARNING_STATES.UNDERSTOOD;
      } else if (currentStatus === LEARNING_STATES.NOT_STARTED) {
        newStatus = LEARNING_STATES.INTRODUCED;
      }
      newScore = potentialScore;
    }

    return {
      previousStatus: isNew ? null : currentStatus,
      newStatus,
      confidenceScore: newScore,
      evidenceCount: currentEvidenceCount + 1,
    };
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
    const increase = Math.round(delta * factor);
    return Math.min(100, current + increase);
  }
}
