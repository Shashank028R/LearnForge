import mongoose from 'mongoose';

const subjectSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 120,
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    color: {
      type: String,
      trim: true,
      default: '#3b82f6',
    },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
      index: true,
    },
    targetMasteryLevel: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced', 'comprehensive'],
      default: 'intermediate',
    },
    topicsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    syllabusStatus: {
      type: String,
      enum: ['no_syllabus', 'draft', 'approved'],
      default: 'no_syllabus',
      index: true,
    },
    activeSyllabusVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SyllabusVersion',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound Unique Index: Prevent duplicate subject names per user
subjectSchema.index({ userId: 1, normalizedName: 1 }, { unique: true });

// Compound Query Index: Fast user subject listing sorted by recent activity
subjectSchema.index({ userId: 1, status: 1, updatedAt: -1 });

export const Subject = mongoose.models.Subject || mongoose.model('Subject', subjectSchema);
export default Subject;
