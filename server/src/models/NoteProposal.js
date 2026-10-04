import mongoose from 'mongoose';
import { blockSubdocumentSchema } from './blocks/blockSchema.js';

export const NOTE_PROPOSAL_STATUSES = ['pending', 'approved', 'rejected', 'expired'];
export const NOTE_RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];

const noteProposalSchema = new mongoose.Schema(
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
    baseVersion: {
      type: Number,
      required: true,
      min: 1,
    },
    baseVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NoteVersion',
      required: true,
    },
    proposedBlocks: {
      type: [blockSubdocumentSchema],
      default: [],
    },
    diff: {
      addedBlockIds: { type: [String], default: [] },
      removedBlockIds: { type: [String], default: [] },
      modifiedBlocks: { type: [mongoose.Schema.Types.Mixed], default: [] },
      unchangedBlockIds: { type: [String], default: [] },
    },
    riskAssessment: {
      riskLevel: {
        type: String,
        required: true,
        enum: NOTE_RISK_LEVELS,
        default: 'MEDIUM',
      },
      reasons: {
        type: [String],
        default: [],
      },
      hasUserAuthoredConflicts: {
        type: Boolean,
        default: false,
      },
      protectedBlockIds: {
        type: [String],
        default: [],
      },
      requiresApproval: {
        type: Boolean,
        default: true,
      },
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
    status: {
      type: String,
      required: true,
      enum: NOTE_PROPOSAL_STATUSES,
      default: 'pending',
    },
    changeSummary: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

noteProposalSchema.index({ noteDocumentId: 1, status: 1, createdAt: -1 });
noteProposalSchema.index({ userId: 1, status: 1 });

export const NoteProposal = mongoose.model('NoteProposal', noteProposalSchema);
