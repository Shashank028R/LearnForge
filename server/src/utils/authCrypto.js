import crypto from 'crypto';
import { config } from '../config/env.js';

/**
 * Generates a cryptographically secure 6-digit numeric OTP code.
 * Range: 100000 to 999999 (inclusive).
 *
 * @returns {string}
 */
export function generateOtpCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Computes an HMAC-SHA-256 hash of the OTP code bound to the user's normalized email.
 * Uses a server-side secret pepper (OTP_HMAC_SECRET) kept separate from MongoDB to protect
 * against offline brute-forcing if the database is breached.
 *
 * @param {string} email 
 * @param {string} code 
 * @returns {string}
 */
export function hashOtp(email, code) {
  const normalized = email.toLowerCase().trim();
  const hmac = crypto.createHmac('sha256', config.otpHmacSecret);
  hmac.update(`${normalized}:${code.trim()}`);
  return hmac.digest('hex');
}

/**
 * Performs a constant-time comparison of a candidate OTP against the stored HMAC hash.
 * Defends against side-channel timing attacks.
 *
 * @param {string} email 
 * @param {string} candidateCode 
 * @param {string} storedHash 
 * @returns {boolean}
 */
export function verifyOtpHash(email, candidateCode, storedHash) {
  if (!candidateCode || typeof candidateCode !== 'string' || candidateCode.trim().length !== 6) {
    return false;
  }
  const candidateHash = hashOtp(email, candidateCode);

  const candidateBuffer = Buffer.from(candidateHash, 'hex');
  const storedBuffer = Buffer.from(storedHash, 'hex');

  if (candidateBuffer.length !== storedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidateBuffer, storedBuffer);
}

/**
 * Generates an opaque, high-entropy 256-bit session token.
 *
 * @returns {string} (64 hex characters)
 */
export function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Computes a SHA-256 hash of an opaque session token.
 * Only the hash is persisted to the UserSession collection in MongoDB.
 *
 * @param {string} token 
 * @returns {string}
 */
export function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}
