import mongoose from 'mongoose';

const knowledgeStateSchema = new mongoose.Schema(
  {
    masteryScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    keyConcepts: {
      type: [String],
      default: [],
    },
    summary: {
      type: String,
      default: '',
    },
    lastStudiedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const topicSchema = new mongoose.Schema(
  {
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 160,
    },
    normalizedTitle: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    orderIndex: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'mastered'],
      default: 'not_started',
      index: true,
    },
    knowledgeState: {
      type: knowledgeStateSchema,
      default: () => ({}),
    },
    notesCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    chatsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActiveInSyllabus: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound Sequential Index: Retrieve topics in explicit sequence
topicSchema.index({ subjectId: 1, orderIndex: 1 });

// Compound Tenant Index: Fast user-scoped topic queries
topicSchema.index({ userId: 1, subjectId: 1 });

// Compound Unique Index: Prevent duplicate topic titles within the same subject
topicSchema.index({ subjectId: 1, normalizedTitle: 1 }, { unique: true });

// Compound Active Syllabus Index: Fast retrieval of active curriculum topics
topicSchema.index({ subjectId: 1, isActiveInSyllabus: 1, orderIndex: 1 });

export const Topic = mongoose.models.Topic || mongoose.model('Topic', topicSchema);
export default Topic;
