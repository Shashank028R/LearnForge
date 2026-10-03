import mongoose from 'mongoose';

const emailOtpTokenSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    resendAvailableAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index for automated MongoDB cleanup
emailOtpTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailOtpToken = mongoose.models.EmailOtpToken || mongoose.model('EmailOtpToken', emailOtpTokenSchema);
export default EmailOtpToken;
