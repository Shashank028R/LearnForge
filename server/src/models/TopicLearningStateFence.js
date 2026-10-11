import mongoose from 'mongoose';

const topicLearningStateFenceSchema = new mongoose.Schema(
  {
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    version: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
    },
    activeRebuildLock: {
      lockId: { type: String, default: null },
      acquiredAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null },
    },
    lastTurnWatermark: {
      lastTurnId: { type: mongoose.Schema.Types.ObjectId, default: null },
      lastTurnAnsweredAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
  }
);

// Compound Unique Index: Strictly one fence document per user per topic
topicLearningStateFenceSchema.index({ userId: 1, topicId: 1 }, { unique: true });

export const TopicLearningStateFence =
  mongoose.models.TopicLearningStateFence ||
  mongoose.model('TopicLearningStateFence', topicLearningStateFenceSchema);

export default TopicLearningStateFence;
