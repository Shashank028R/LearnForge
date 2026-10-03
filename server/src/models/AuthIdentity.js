import mongoose from 'mongoose';

const authIdentitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ['google', 'email'],
      required: true,
    },
    providerSubject: {
      type: String,
      required: true,
    },
    emailAtProvider: {
      type: String,
      trim: true,
      lowercase: true,
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index: the same external identity cannot belong to multiple users
authIdentitySchema.index({ provider: 1, providerSubject: 1 }, { unique: true });

export const AuthIdentity = mongoose.models.AuthIdentity || mongoose.model('AuthIdentity', authIdentitySchema);
export default AuthIdentity;
