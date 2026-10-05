import mongoose from 'mongoose';

/**
 * StudyTurn Schema
 * Embedded subdocument within StudySession.turns (NOT a registered standalone Mongoose model).
 * Tracks individual initial or follow-up question/answer/evaluation attempts.
 */
export const studyTurnSchema = new mongoose.Schema(
  {
    turnIndex: { type: Number, required: true, min: 0 },
    clientTurnId: { type: String, required: true }, // Client-generated idempotency key
    attemptType: {
      type: String,
      enum: ['INITIAL', 'FOLLOW_UP'],
      required: true,
      default: 'INITIAL',
    },
    // Note: StudyTurn is an embedded subdocument.
    // parentTurnId references another StudySession.turns._id within the SAME StudySession document.
    // Explicitly contains NO `ref: 'StudyTurn'` because StudyTurn is not a registered Mongoose model.
    parentTurnId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    question: {
      questionId: { type: String, required: true },
      questionType: {
        type: String,
        enum: [
          'recall',
          'explain_in_own_words',
          'compare',
          'mechanism',
          'trace_execution',
          'predict_outcome',
          'debugging',
          'apply_concept',
          'identify_misconception',
          'prerequisite_check',
          'scenario',
        ],
        required: true,
      },
      prompt: { type: String, required: true, trim: true, maxlength: 4000 },
      targetConceptIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Concept' }],
      targetConceptNames: [{ type: String, trim: true }],
      expectedReasoningSignals: [{ type: String, trim: true }],
      difficultyIntent: {
        type: String,
        enum: ['introductory', 'intermediate', 'advanced'],
        default: 'intermediate',
      },
      prerequisiteConceptIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Concept' }],
      generatedAt: { type: Date, default: Date.now },
    },
    userAnswer: { type: String, trim: true, maxlength: 20000, default: null },
    answeredAt: { type: Date, default: null },
    evaluation: {
      verdict: {
        type: String,
        enum: ['CORRECT', 'PARTIALLY_CORRECT', 'INCORRECT', 'UNCERTAIN', null],
        default: null,
      },
      correctness: { type: Number, min: 0, max: 100, default: null },
      completeness: { type: Number, min: 0, max: 100, default: null },
      reasoningQuality: { type: Number, min: 0, max: 100, default: null },
      misconceptionDetected: { type: Boolean, default: false },
      misconceptionSummary: { type: String, default: '' },
      missingConcepts: [{ type: String }],
      strengths: [{ type: String }],
      weaknesses: [{ type: String }],
      feedback: { type: String, default: '' },
      nextAction: {
        type: String,
        enum: ['ADVANCE', 'PROBE', 'REMEDIATE', 'RETRY', 'CLARIFY', null],
        default: null,
      },
      evaluatedAt: { type: Date, default: null },
      provenance: {
        provider: { type: String, default: 'deterministic' },
        model: { type: String, default: 'rule-based-v1' },
        latencyMs: { type: Number, default: 0 },
        requestId: { type: String, default: 'unknown' },
        source: {
          type: String,
          enum: ['ai', 'deterministic_fallback'],
          default: 'deterministic_fallback',
        },
      },
    },
    remediation: {
      remediationText: { type: String, default: '' },
      followUpQuestion: { type: String, default: '' },
      remediatedAt: { type: Date, default: null },
    },
  },
  { _id: true }
);

/**
 * EvaluationState Schema (Single-Slot Active Operation Tracker)
 * Tracks ONLY the currently active in-flight submission operation.
 * Completed historical idempotency is resolved from StudySession.turns.
 */
export const evaluationStateSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['IDLE', 'RECEIVED', 'EVALUATING', 'COMPLETED', 'FAILED'],
      default: 'IDLE',
    },
    operationId: { type: String, default: null }, // Authoritative fencing token for active evaluation lease
    clientTurnId: { type: String, default: null },
    questionId: { type: String, default: null },
    answerFingerprint: { type: String, default: null }, // SHA-256 of trimmed answer
    startedAt: { type: Date, default: null },
    leaseExpiresAt: { type: Date, default: null }, // Crash lease timeout (30s)
    lastError: {
      code: { type: String, default: null },
      message: { type: String, default: null },
      attemptCount: { type: Number, default: 0 },
    },
  },
  { _id: false }
);

/**
 * StudySession Schema
 * Root domain aggregate for topic-scoped strict study sessions.
 */
const studySessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true, index: true },
    syllabusVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'SyllabusVersion', default: null },
    syllabusVersionNumber: { type: Number, default: null }, // Pinned at session creation
    title: { type: String, trim: true, maxlength: 200, default: 'Active Recall Study Session' },
    status: {
      type: String,
      enum: [
        'ORIENTING',
        'QUESTIONING',
        'ANSWER_PENDING',
        'EVALUATING',
        'REMEDIATING',
        'RECHECKING',
        'ADVANCING',
        'COMPLETED',
        'PAUSED',
        'EXITED',
      ],
      default: 'ORIENTING',
      index: true,
    },
    pausedFromStatus: {
      type: String,
      enum: ['QUESTIONING', 'REMEDIATING', 'RECHECKING', null],
      default: null,
    },
    sessionVersion: { type: Number, default: 1, min: 1 }, // Optimistic concurrency lock
    sequenceCounter: { type: Number, default: 0, min: 0 }, // Monotonic turn sequence index
    activeQuestion: { type: studyTurnSchema.tree.question, default: null },
    evaluationState: { type: evaluationStateSchema, default: () => ({ status: 'IDLE' }) },
    turns: [studyTurnSchema],
    metrics: {
      totalQuestionsAsked: { type: Number, default: 0 },
      totalAnswersSubmitted: { type: Number, default: 0 },
      correctCount: { type: Number, default: 0 },
      partiallyCorrectCount: { type: Number, default: 0 },
      incorrectCount: { type: Number, default: 0 },
      remediationsCount: { type: Number, default: 0 },
      demonstratedConceptIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Concept' }],
      strugglingConceptIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Concept' }],
    },
    isActive: { type: Boolean, default: true, index: true }, // Set to false on terminal COMPLETED or EXITED
    lastActivityAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

// Compound Indexes
studySessionSchema.index({ userId: 1, topicId: 1, status: 1 });
studySessionSchema.index({ userId: 1, status: 1, lastActivityAt: -1 });
studySessionSchema.index({ userId: 1, subjectId: 1, lastActivityAt: -1 });

// Database-level race-safety constraint: only one active (isActive=true) session allowed per user and topic
studySessionSchema.index(
  { userId: 1, topicId: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
    name: 'unique_active_study_session_per_user_topic',
  }
);

// Multikey index for clientTurnId query acceleration.
// Uniqueness is session-scoped and enforced by application-level transactional query logic.
studySessionSchema.index({ 'turns.clientTurnId': 1 });

/**
 * Asserts that completed turns are strictly immutable.
 * Throws an error if any completed turn was removed or modified.
 */
export function assertTurnImmutability(existingTurns = [], updatedTurns = []) {
  const existingCompletedTurns = existingTurns.filter(
    (t) => t.evaluation && t.evaluation.evaluatedAt !== null && t.evaluation.verdict !== null
  );

  for (const completedTurn of existingCompletedTurns) {
    const matchingUpdated = updatedTurns.find(
      (ut) => ut._id && completedTurn._id && ut._id.toString() === completedTurn._id.toString()
    );

    if (!matchingUpdated) {
      const err = new Error(`Immutability violation: Completed study turn ${completedTurn._id} cannot be deleted.`);
      err.code = 'TURN_IMMUTABILITY_VIOLATION';
      err.statusCode = 400;
      throw err;
    }

    const completedTurnEval = completedTurn.evaluation || {};
    const updatedTurnEval = matchingUpdated.evaluation || {};

    const isAnswerEqual = String(completedTurn.userAnswer || '') === String(matchingUpdated.userAnswer || '');
    const isVerdictEqual = completedTurnEval.verdict === updatedTurnEval.verdict;
    const isCorrectnessEqual = completedTurnEval.correctness === updatedTurnEval.correctness;
    const isCompletenessEqual = completedTurnEval.completeness === updatedTurnEval.completeness;
    const isReasoningEqual = completedTurnEval.reasoningQuality === updatedTurnEval.reasoningQuality;
    const isMisconceptionDetectedEqual = Boolean(completedTurnEval.misconceptionDetected) === Boolean(updatedTurnEval.misconceptionDetected);
    const isMisconceptionSummaryEqual = String(completedTurnEval.misconceptionSummary || '') === String(updatedTurnEval.misconceptionSummary || '');
    const isQuestionIdEqual = completedTurn.question?.questionId === matchingUpdated.question?.questionId;
    const isAttemptTypeEqual = completedTurn.attemptType === matchingUpdated.attemptType;
    const isTurnIndexEqual = completedTurn.turnIndex === matchingUpdated.turnIndex;
    const isClientTurnIdEqual = completedTurn.clientTurnId === matchingUpdated.clientTurnId;

    if (
      !isAnswerEqual ||
      !isVerdictEqual ||
      !isCorrectnessEqual ||
      !isCompletenessEqual ||
      !isReasoningEqual ||
      !isMisconceptionDetectedEqual ||
      !isMisconceptionSummaryEqual ||
      !isQuestionIdEqual ||
      !isAttemptTypeEqual ||
      !isTurnIndexEqual ||
      !isClientTurnIdEqual
    ) {
      const err = new Error(`Immutability violation: Completed study turn ${completedTurn._id} cannot be modified after evaluation.`);
      err.code = 'TURN_IMMUTABILITY_VIOLATION';
      err.statusCode = 400;
      throw err;
    }
  }
}

studySessionSchema.pre('save', async function (next) {
  if (!this.isNew && this.isModified('turns')) {
    try {
      const existing = await this.constructor.findById(this._id).select('turns').lean();
      if (existing && Array.isArray(existing.turns)) {
        assertTurnImmutability(existing.turns, this.turns);
      }
    } catch (err) {
      return next(err);
    }
  }
  next();
});

studySessionSchema.pre(['updateOne', 'findOneAndUpdate', 'updateMany', 'replaceOne', 'findOneAndReplace'], async function (next) {
  const update = this.getUpdate();
  if (!update) return next();

  try {
    const query = this.getQuery ? this.getQuery() : {};
    const existingDocs = await this.model.find(query).select('turns').lean();

    for (const existing of existingDocs) {
      if (!existing || !Array.isArray(existing.turns)) continue;
      const completedTurns = existing.turns.filter(
        (t) => t.evaluation && t.evaluation.evaluatedAt !== null && t.evaluation.verdict !== null
      );
      if (completedTurns.length === 0) continue;

      // 1. Check direct document replacement without $ operators
      const isDirectReplacement = Object.keys(update).length > 0 && !Object.keys(update).some((k) => k.startsWith('$'));
      if (isDirectReplacement) {
        if (!Array.isArray(update.turns)) {
          const err = new Error('Immutability violation: Document replacement cannot omit completed study turns.');
          err.code = 'TURN_IMMUTABILITY_VIOLATION';
          err.statusCode = 400;
          return next(err);
        }
        assertTurnImmutability(existing.turns, update.turns);
      }

      // 2. Check $pull / $pop / $unset operations
      if (update.$pull?.turns || update.$pop?.turns || update.$unset?.turns) {
        const err = new Error('Immutability violation: Query operations cannot delete or unset completed study turns.');
        err.code = 'TURN_IMMUTABILITY_VIOLATION';
        err.statusCode = 400;
        return next(err);
      }

      // 3. Check $set operations (array overwrite or nested property update)
      if (update.$set) {
        if (update.$set.turns) {
          assertTurnImmutability(existing.turns, update.$set.turns);
        }

        // Check nested path updates: e.g. "turns.0.userAnswer" or "turns.0.evaluation.correctness"
        for (const [key, val] of Object.entries(update.$set)) {
          const match = key.match(/^turns\.(\d+)(\..+)?$/);
          if (match) {
            const index = parseInt(match[1], 10);
            const targetTurn = existing.turns[index];
            if (targetTurn && targetTurn.evaluation?.evaluatedAt !== null && targetTurn.evaluation?.verdict !== null) {
              const subPath = match[2] || '';
              // If modifying any sealed field of a completed turn
              const err = new Error(`Immutability violation: Nested field "${key}" of completed study turn ${targetTurn._id} cannot be modified.`);
              err.code = 'TURN_IMMUTABILITY_VIOLATION';
              err.statusCode = 400;
              return next(err);
            }
          }
        }
      }

      // 4. Check nested $unset on turn paths
      if (update.$unset) {
        for (const key of Object.keys(update.$unset)) {
          if (key.startsWith('turns.')) {
            const match = key.match(/^turns\.(\d+)/);
            if (match) {
              const index = parseInt(match[1], 10);
              const targetTurn = existing.turns[index];
              if (targetTurn && targetTurn.evaluation?.evaluatedAt !== null && targetTurn.evaluation?.verdict !== null) {
                const err = new Error(`Immutability violation: Nested field "${key}" of completed study turn cannot be unset.`);
                err.code = 'TURN_IMMUTABILITY_VIOLATION';
                err.statusCode = 400;
                return next(err);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    return next(err);
  }

  next();
});

studySessionSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], async function (next) {
  try {
    const query = this.getQuery ? this.getQuery() : {};
    const existingDocs = await this.model.find(query).select('turns').lean();

    for (const existing of existingDocs) {
      if (existing && Array.isArray(existing.turns)) {
        const hasCompletedTurn = existing.turns.some(
          (t) => t.evaluation && t.evaluation.evaluatedAt !== null && t.evaluation.verdict !== null
        );
        if (hasCompletedTurn) {
          const err = new Error(`Immutability violation: Cannot delete StudySession ${existing._id} containing completed authoritative study turns.`);
          err.code = 'TURN_IMMUTABILITY_VIOLATION';
          err.statusCode = 400;
          return next(err);
        }
      }
    }
  } catch (err) {
    return next(err);
  }
  next();
});

export const StudySession = mongoose.models.StudySession || mongoose.model('StudySession', studySessionSchema);
export default StudySession;
