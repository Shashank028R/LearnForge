import mongoose from 'mongoose';

const activeMisconceptionSchema = new mongoose.Schema(
  {
    misconceptionText: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    detectedAt: {
      type: Date,
      default: Date.now,
    },
    turnId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { _id: true }
);

const resolvedMisconceptionSchema = new mongoose.Schema(
  {
    misconceptionText: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    detectedAt: {
      type: Date,
      required: true,
    },
    resolvedAt: {
      type: Date,
      default: Date.now,
    },
    turnId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { _id: true }
);

const conceptLearningStateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
      index: true,
    },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: true,
      index: true,
    },
    conceptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Concept',
      required: true,
      index: true,
    },
    masteryStatus: {
      type: String,
      enum: ['NOT_STARTED', 'INTRODUCED', 'LEARNING', 'NEEDS_REVIEW', 'UNDERSTOOD', 'MASTERED'],
      default: 'NOT_STARTED',
      index: true,
    },
    masteryScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    decayedScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
      index: true,
    },
    confidenceScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    attemptsCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    consecutiveSuccesses: {
      type: Number,
      min: 0,
      default: 0,
    },
    consecutiveFailures: {
      type: Number,
      min: 0,
      default: 0,
    },
    activeMisconceptions: {
      type: [activeMisconceptionSchema],
      default: [],
    },
    resolvedMisconceptions: {
      type: [resolvedMisconceptionSchema],
      default: [],
    },
    prerequisiteWarning: {
      type: Boolean,
      default: false,
    },
    unmetPrerequisiteIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Concept' }],
      default: [],
    },
    lastAttemptedAt: {
      type: Date,
      default: null,
    },
    lastDemonstratedAt: {
      type: Date,
      default: null,
    },
    lastProcessedTurnId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    lastProcessedAnsweredAt: {
      type: Date,
      default: null,
    },
    stateVersion: {
      type: Number,
      min: 1,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

// Compound Unique Index: Exactly one learning state projection per user concept
conceptLearningStateSchema.index({ userId: 1, conceptId: 1 }, { unique: true });

// Compound Query Indices for Fast Topic/Subject Lookups and Sorting
conceptLearningStateSchema.index({ userId: 1, topicId: 1, masteryStatus: 1 });
conceptLearningStateSchema.index({ userId: 1, topicId: 1, decayedScore: 1 });
conceptLearningStateSchema.index({ userId: 1, subjectId: 1, masteryStatus: 1 });
conceptLearningStateSchema.index({ userId: 1, lastAttemptedAt: -1 });

export const ConceptLearningState =
  mongoose.models.ConceptLearningState || mongoose.model('ConceptLearningState', conceptLearningStateSchema);

export default ConceptLearningState;
