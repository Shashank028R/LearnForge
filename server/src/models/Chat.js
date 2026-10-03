import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema(
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
      default: null,
      index: true,
    },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      default: null,
      index: true,
    },
    title: {
      type: String,
      trim: true,
      minlength: 1,
      maxlength: 200,
      default: 'New Conversation',
    },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
      index: true,
    },
    messagesCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    sequenceCounter: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

// Compound Query Indexes:
// Fast chronological user chat retrieval with status filtering
chatSchema.index({ userId: 1, status: 1, lastMessageAt: -1 });

// Fast topic-scoped chat retrieval
chatSchema.index({ userId: 1, topicId: 1, lastMessageAt: -1 });

// Fast subject-scoped chat retrieval
chatSchema.index({ userId: 1, subjectId: 1, lastMessageAt: -1 });

export const Chat = mongoose.models.Chat || mongoose.model('Chat', chatSchema);
export default Chat;
