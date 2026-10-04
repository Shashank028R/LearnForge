/**
 * Central State Machine for Strict Study Mode (Phase 08)
 */

export const STUDY_STATUS = {
  ORIENTING: 'ORIENTING',
  QUESTIONING: 'QUESTIONING',
  ANSWER_PENDING: 'ANSWER_PENDING',
  EVALUATING: 'EVALUATING',
  REMEDIATING: 'REMEDIATING',
  RECHECKING: 'RECHECKING',
  ADVANCING: 'ADVANCING',
  COMPLETED: 'COMPLETED',
  PAUSED: 'PAUSED',
  EXITED: 'EXITED',
};

export const ALLOWED_PAUSE_STATUSES = [
  STUDY_STATUS.QUESTIONING,
  STUDY_STATUS.REMEDIATING,
  STUDY_STATUS.RECHECKING,
];

export const TERMINAL_STATUSES = [
  STUDY_STATUS.EXITED,
  STUDY_STATUS.COMPLETED,
];

/**
 * Valid outgoing transitions map
 */
export const VALID_TRANSITIONS = {
  [STUDY_STATUS.ORIENTING]: [
    STUDY_STATUS.QUESTIONING,
    STUDY_STATUS.EXITED,
  ],
  [STUDY_STATUS.QUESTIONING]: [
    STUDY_STATUS.ANSWER_PENDING,
    STUDY_STATUS.PAUSED,
    STUDY_STATUS.EXITED,
  ],
  [STUDY_STATUS.ANSWER_PENDING]: [
    STUDY_STATUS.EVALUATING,
  ],
  [STUDY_STATUS.EVALUATING]: [
    STUDY_STATUS.ADVANCING,
    STUDY_STATUS.REMEDIATING,
    STUDY_STATUS.COMPLETED,
    STUDY_STATUS.QUESTIONING, // Recovery on catastrophic initial-evaluation failure
    STUDY_STATUS.RECHECKING,  // Recovery on catastrophic follow-up-evaluation failure
    STUDY_STATUS.EXITED,
  ],
  [STUDY_STATUS.REMEDIATING]: [
    STUDY_STATUS.RECHECKING,
    STUDY_STATUS.PAUSED,
    STUDY_STATUS.EXITED,
  ],
  [STUDY_STATUS.RECHECKING]: [
    STUDY_STATUS.ANSWER_PENDING,
    STUDY_STATUS.PAUSED,
    STUDY_STATUS.EXITED,
  ],
  [STUDY_STATUS.ADVANCING]: [
    STUDY_STATUS.QUESTIONING,
    STUDY_STATUS.COMPLETED,
    STUDY_STATUS.EXITED,
  ],
  [STUDY_STATUS.PAUSED]: [
    STUDY_STATUS.QUESTIONING,
    STUDY_STATUS.REMEDIATING,
    STUDY_STATUS.RECHECKING,
    STUDY_STATUS.EXITED,
  ],
  [STUDY_STATUS.COMPLETED]: [],
  [STUDY_STATUS.EXITED]: [],
};

/**
 * Validates whether a proposed transition is legal.
 * Throws a descriptive error if invalid.
 */
export function validateStateTransition(currentStatus, nextStatus, context = {}) {
  if (TERMINAL_STATUSES.includes(currentStatus)) {
    const error = new Error(`Cannot transition from terminal status "${currentStatus}".`);
    error.code = 'TERMINAL_STUDY_STATE';
    error.statusCode = 400;
    throw error;
  }

  // Specific Pause Rules (e.g. attempting to pause during active evaluation)
  if (nextStatus === STUDY_STATUS.PAUSED) {
    if (!ALLOWED_PAUSE_STATUSES.includes(currentStatus)) {
      const isEvaluating = currentStatus === STUDY_STATUS.EVALUATING || currentStatus === STUDY_STATUS.ANSWER_PENDING;
      const error = new Error(
        isEvaluating
          ? 'Cannot pause session while an answer evaluation is currently in progress.'
          : `Cannot pause study session from "${currentStatus}".`
      );
      error.code = isEvaluating
        ? 'CANNOT_PAUSE_DURING_EVALUATION'
        : 'INVALID_PAUSE_STATE';
      error.statusCode = 409;
      throw error;
    }
  }

  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    const error = new Error(`Invalid study session transition from "${currentStatus}" to "${nextStatus}".`);
    error.code = 'INVALID_STUDY_STATE_TRANSITION';
    error.statusCode = 400;
    throw error;
  }

  // Specific Resume Rules
  if (currentStatus === STUDY_STATUS.PAUSED) {
    if (nextStatus !== STUDY_STATUS.EXITED && nextStatus !== context.pausedFromStatus) {
      const error = new Error(
        `Cannot resume to "${nextStatus}". Session was paused from "${context.pausedFromStatus}".`
      );
      error.code = 'INVALID_RESUME_STATE';
      error.statusCode = 400;
      throw error;
    }
  }

  return true;
}
