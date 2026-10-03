import mongoose from 'mongoose';

const syllabusTopicItemSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 1000,
    },
    orderIndex: {
      type: Number,
      default: 0,
    },
    estimatedMinutes: {
      type: Number,
      default: 30,
      min: 5,
      max: 600,
    },
  },
  { _id: true }
);

const syllabusSectionSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 1000,
    },
    orderIndex: {
      type: Number,
      default: 0,
    },
    topics: [syllabusTopicItemSchema],
  },
  { _id: true }
);

const syllabusVersionSchema = new mongoose.Schema(
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
    version: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ['draft', 'approved', 'superseded'],
      default: 'draft',
      index: true,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 200,
      default: 'Curriculum Syllabus',
    },
    sections: [syllabusSectionSchema],
    source: {
      type: String,
      enum: ['user_created', 'ai_assisted', 'imported'],
      default: 'user_created',
    },
    changeSummary: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    supersededAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound Unique Index: version number is unique per Subject
syllabusVersionSchema.index({ subjectId: 1, version: 1 }, { unique: true });

// Compound Query Index: fast listing of versions by subject and user
syllabusVersionSchema.index({ userId: 1, subjectId: 1, version: -1 });

export const SyllabusVersion =
  mongoose.models.SyllabusVersion || mongoose.model('SyllabusVersion', syllabusVersionSchema);
export default SyllabusVersion;
