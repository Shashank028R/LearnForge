import mongoose from 'mongoose';

const processedStudyTurnSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    conceptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Concept',
      required: true,
      index: true,
    },
    turnId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StudySession',
      required: true,
    },
    processedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

// Compound Unique Index: Strictly one projection per turn per user per concept
processedStudyTurnSchema.index({ userId: 1, conceptId: 1, turnId: 1 }, { unique: true });

// Query index for topic/concept level rebuild cleanup
processedStudyTurnSchema.index({ userId: 1, conceptId: 1 });
processedStudyTurnSchema.index({ userId: 1, sessionId: 1 });

export const ProcessedStudyTurn =
  mongoose.models.ProcessedStudyTurn || mongoose.model('ProcessedStudyTurn', processedStudyTurnSchema);

export default ProcessedStudyTurn;
