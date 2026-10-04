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

export const StudySession = mongoose.model('StudySession', studySessionSchema);
export default StudySession;
