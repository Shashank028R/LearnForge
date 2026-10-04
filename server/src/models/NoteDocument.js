import mongoose from 'mongoose';

export const NOTE_DOCUMENT_STATUSES = ['draft', 'published', 'archived'];

const noteDocumentSchema = new mongoose.Schema(
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
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    currentVersionNumber: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    currentVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NoteVersion',
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: NOTE_DOCUMENT_STATUSES,
      default: 'published',
    },
    metadata: {
      totalWordCount: { type: Number, default: 0 },
      blockCount: { type: Number, default: 0 },
      conceptAttributionCount: { type: Number, default: 0 },
      lastSynthesizedAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Exactly one canonical NoteDocument per Topic per User
noteDocumentSchema.index({ userId: 1, topicId: 1 }, { unique: true });
noteDocumentSchema.index({ userId: 1, subjectId: 1, updatedAt: -1 });

export const NoteDocument = mongoose.model('NoteDocument', noteDocumentSchema);
