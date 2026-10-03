import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    normalizedEmail: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    displayName: {
      type: String,
      trim: true,
      default: '',
    },
    avatarUrl: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'deactivated'],
      default: 'active',
      index: true,
    },
    timezone: {
      type: String,
      default: 'UTC',
    },
    onboardingState: {
      type: String,
      default: 'completed',
    },
    preferences: {
      theme: { type: String, default: 'light' },
      density: { type: String, default: 'normal' },
      studyStrictness: { type: String, default: 'balanced' },
      defaultMode: { type: String, default: 'chat' },
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
