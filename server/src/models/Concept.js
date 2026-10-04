import mongoose from 'mongoose';

const misconceptionItemSchema = new mongoose.Schema(
  {
    misconceptionText: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    correctionText: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    detectedAt: {
      type: Date,
      default: Date.now,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true }
);

const conceptSchema = new mongoose.Schema(
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
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    aliases: {
      type: [String],
      default: [],
    },
    normalizedAliases: {
      type: [String],
      default: [],
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    status: {
      type: String,
      enum: ['NOT_STARTED', 'INTRODUCED', 'LEARNING', 'UNDERSTOOD', 'STRONG', 'NEEDS_REVIEW'],
      default: 'NOT_STARTED',
      index: true,
    },
    confidenceScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    evidenceCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    misconceptions: {
      type: [misconceptionItemSchema],
      default: [],
    },
    conflictState: {
      hasConflict: {
        type: Boolean,
        default: false,
      },
      description: {
        type: String,
        default: '',
      },
      flaggedAt: {
        type: Date,
        default: null,
      },
      resolvedAt: {
        type: Date,
        default: null,
      },
    },
    lastStudiedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound Unique Index: Exactly one canonical concept per normalized name per user topic
conceptSchema.index({ userId: 1, topicId: 1, normalizedName: 1 }, { unique: true });

// Compound Topic Concepts Index: Fast querying of topic concepts by status and confidence
conceptSchema.index({ userId: 1, topicId: 1, status: 1 });
conceptSchema.index({ userId: 1, topicId: 1, confidenceScore: -1 });

// Helper to normalize concept names and aliases
export function normalizeConceptName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ');
}

export const Concept = mongoose.models.Concept || mongoose.model('Concept', conceptSchema);
export default Concept;
