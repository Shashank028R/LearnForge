import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env relative to server root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/learnforge',
  apiPrefix: '/api/v1',

  // Authentication & Session configuration
  sessionSecret: process.env.SESSION_SECRET || 'dev_session_secret_learnforge_at_least_32_characters_long',
  otpHmacSecret: process.env.OTP_HMAC_SECRET || 'dev_otp_hmac_secret_pepper_keep_separate_from_database',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',

  // Email service configuration
  emailProvider: process.env.EMAIL_PROVIDER || 'console',
  emailFrom: process.env.EMAIL_FROM || 'LearnForge <no-reply@learnforge.local>',

  // OTP Security parameters
  otpExpiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10),
  otpResendCooldownSeconds: parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '60', 10),
  otpMaxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10),
};
