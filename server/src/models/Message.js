import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 20000,
    },
    sequenceIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'error'],
      default: 'sent',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    knowledgeContext: {
      relevance: {
        type: String,
        enum: ['unclassified', 'on_topic', 'off_topic', 'uncertain'],
        default: 'unclassified',
      },
      subjectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        default: null,
      },
      topicId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Topic',
        default: null,
      },
      disposition: {
        type: String,
        enum: ['unclassified', 'candidate', 'excluded', 'promoted'],
        default: 'unclassified',
      },
    },
  },
  {
    timestamps: true,
  }
);

// Compound Unique Index: Strict deterministic sequential ordering within a chat
messageSchema.index({ chatId: 1, sequenceIndex: 1 }, { unique: true });

// Compound Query Index: Fast user authorization and analytics scan
messageSchema.index({ userId: 1, chatId: 1 });

export const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);
export default Message;
