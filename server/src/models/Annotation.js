import mongoose from 'mongoose';

const annotationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
      index: true,
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['comment', 'tag'],
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  }
);

// Compound Query Indexes:
annotationSchema.index({ userId: 1, messageId: 1, createdAt: 1 });
annotationSchema.index({ userId: 1, chatId: 1, createdAt: 1 });

export const Annotation =
  mongoose.models.Annotation || mongoose.model('Annotation', annotationSchema);
export default Annotation;
