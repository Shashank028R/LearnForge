import mongoose from 'mongoose';
import { blockSubdocumentSchema } from './blocks/blockSchema.js';

export const NOTE_VERSION_SOURCE_TYPES = [
  'initial_creation',
  'manual_edit',
  'ai_synthesis',
  'ai_merge_proposal',
  'version_restore',
];

const noteVersionSchema = new mongoose.Schema(
  {
    noteDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NoteDocument',
      required: true,
      index: true,
    },
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
    version: {
      type: Number,
      required: true,
      min: 1,
    },
    parentVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NoteVersion',
      default: null,
    },
    blocks: {
      type: [blockSubdocumentSchema],
      default: [],
    },
    sourceType: {
      type: String,
      required: true,
      enum: NOTE_VERSION_SOURCE_TYPES,
      default: 'initial_creation',
    },
    changeSummary: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    provenance: {
      conceptIds: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'Concept',
        default: [],
      },
      learningEventIds: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'LearningEvent',
        default: [],
      },
      syllabusVersionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SyllabusVersion',
        default: null,
      },
      syllabusVersion: {
        type: Number,
        default: null,
      },
      aiMetadata: {
        provider: { type: String, default: null },
        model: { type: String, default: null },
        task: { type: String, default: null },
        requestId: { type: String, default: null },
        latencyMs: { type: Number, default: null },
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable append-only audit record: zero updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound unique index ensuring version sequence integrity per NoteDocument
noteVersionSchema.index({ noteDocumentId: 1, version: 1 }, { unique: true });
noteVersionSchema.index({ userId: 1, topicId: 1, version: -1 });

// ==============================================================================
// STRICT IMMUTABILITY GUARDS
// NoteVersion is an append-only historical snapshot and cannot be modified or deleted.
// ==============================================================================

const IMMUTABILITY_ERROR_MESSAGE =
  'NoteVersion is an immutable append-only version snapshot and cannot be updated, replaced, or deleted.';

// 1. Guard against document.save() modifications on existing documents
noteVersionSchema.pre('save', function (next) {
  if (!this.isNew) {
    const err = new Error(IMMUTABILITY_ERROR_MESSAGE);
    err.code = 'IMMUTABLE_NOTE_VERSION';
    err.status = 400;
    return next(err);
  }
  next();
});

// 2. Guard against query-level updates and replacements
const prohibitedUpdateMethods = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'findOneAndReplace',
];

prohibitedUpdateMethods.forEach((method) => {
  noteVersionSchema.pre(method, function (next) {
    const err = new Error(IMMUTABILITY_ERROR_MESSAGE);
    err.code = 'IMMUTABLE_NOTE_VERSION';
    err.status = 400;
    next(err);
  });
});

// 3. Guard against query-level deletions
const prohibitedDeleteMethods = [
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
];

prohibitedDeleteMethods.forEach((method) => {
  noteVersionSchema.pre(method, function (next) {
    const err = new Error(IMMUTABILITY_ERROR_MESSAGE);
    err.code = 'IMMUTABLE_NOTE_VERSION';
    err.status = 400;
    next(err);
  });
});

// 4. Override static bulkWrite to prevent bypassing middleware
const originalBulkWrite = noteVersionSchema.statics.bulkWrite;
noteVersionSchema.statics.bulkWrite = async function (ops, options) {
  const containsProhibitedOps = ops.some((op) => {
    return (
      op.updateOne ||
      op.updateMany ||
      op.replaceOne ||
      op.deleteOne ||
      op.deleteMany
    );
  });

  if (containsProhibitedOps) {
    const err = new Error(IMMUTABILITY_ERROR_MESSAGE);
    err.code = 'IMMUTABLE_NOTE_VERSION';
    err.status = 400;
    throw err;
  }

  if (originalBulkWrite) {
    return originalBulkWrite.call(this, ops, options);
  }
  return mongoose.Model.bulkWrite.call(this, ops, options);
};

export const NoteVersion = mongoose.model('NoteVersion', noteVersionSchema);
