import mongoose from 'mongoose';

export const LEARNING_EVENT_TYPES = [
  'concept_introduced',
  'concept_explained',
  'concept_recalled',
  'concept_misunderstood',
  'misconception_detected',
  'concept_corrected',
  'concept_reinforced',
  'concept_conflict',
  'learning_signal',
];

export const CLASSIFICATION_OUTCOMES = [
  'NEW',
  'EXISTING',
  'DUPLICATE',
  'COMPLEMENTARY',
  'CORRECTION',
  'CONFLICT',
];

const learningEventSchema = new mongoose.Schema(
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
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
      index: true,
    },
    sourceMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      required: true,
      index: true,
    },
    conceptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Concept',
      default: null,
      index: true,
    },
    conceptName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    eventType: {
      type: String,
      enum: LEARNING_EVENT_TYPES,
      required: true,
      index: true,
    },
    classificationOutcome: {
      type: String,
      enum: CLASSIFICATION_OUTCOMES,
      required: true,
      index: true,
    },
    evidenceText: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    confidenceScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 50,
    },
    previousStatus: {
      type: String,
      enum: ['NOT_STARTED', 'INTRODUCED', 'LEARNING', 'UNDERSTOOD', 'STRONG', 'NEEDS_REVIEW', null],
      default: null,
    },
    newStatus: {
      type: String,
      enum: ['NOT_STARTED', 'INTRODUCED', 'LEARNING', 'UNDERSTOOD', 'STRONG', 'NEEDS_REVIEW'],
      required: true,
    },
    misconception: {
      misconceptionText: {
        type: String,
        default: '',
      },
      correctionText: {
        type: String,
        default: '',
      },
      severity: {
        type: String,
        enum: ['low', 'medium', 'high', null],
        default: null,
      },
    },
    idempotencyKey: {
      type: String,
      required: true,
      index: true,
    },
    metadata: {
      extractionVersion: {
        type: String,
        default: 'v1.0',
      },
      provider: {
        type: String,
        default: 'deterministic',
      },
      model: {
        type: String,
        default: 'none',
      },
      latencyMs: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Compound Unique Index for Idempotency: Prevent duplicate event creation from the same message
learningEventSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });

// Compound Query Index: Fast user timeline and concept timeline queries
learningEventSchema.index({ userId: 1, topicId: 1, createdAt: -1 });
learningEventSchema.index({ userId: 1, conceptId: 1, createdAt: -1 });
learningEventSchema.index({ userId: 1, sourceMessageId: 1 });

// Defense in Depth: Enforce Append-Only Immutability on LearningEvent
const immutableLedgerError = () =>
  new Error('LearningEvent is an immutable append-only audit ledger and cannot be updated, replaced, or modified.');
const immutableLedgerDeleteError = () =>
  new Error('LearningEvent is an immutable append-only audit ledger and cannot be deleted.');

learningEventSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(immutableLedgerError());
  }
  next();
});

learningEventSchema.pre('updateOne', function (next) {
  next(immutableLedgerError());
});

learningEventSchema.pre('updateMany', function (next) {
  next(immutableLedgerError());
});

learningEventSchema.pre('findOneAndUpdate', function (next) {
  next(immutableLedgerError());
});

learningEventSchema.pre('replaceOne', function (next) {
  next(immutableLedgerError());
});

learningEventSchema.pre('findOneAndReplace', function (next) {
  next(immutableLedgerError());
});

learningEventSchema.pre('deleteOne', function (next) {
  next(immutableLedgerDeleteError());
});

learningEventSchema.pre('deleteMany', function (next) {
  next(immutableLedgerDeleteError());
});

learningEventSchema.pre('findOneAndDelete', function (next) {
  next(immutableLedgerDeleteError());
});

// Guard against bulk mutation/deletion bypass via Model.bulkWrite
learningEventSchema.static('bulkWrite', async function (ops = [], options = {}) {
  for (const op of ops) {
    if (op.updateOne || op.updateMany || op.replaceOne || op.deleteOne || op.deleteMany) {
      throw immutableLedgerError();
    }
  }
  return mongoose.Model.bulkWrite.call(this, ops, options);
});

export const LearningEvent = mongoose.models.LearningEvent || mongoose.model('LearningEvent', learningEventSchema);
export default LearningEvent;
