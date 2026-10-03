import { describe, it, expect } from 'vitest';
import {
  generateOtpCode,
  hashOtp,
  verifyOtpHash,
  generateSessionToken,
  hashSessionToken,
} from '../src/utils/authCrypto.js';

describe('Auth Cryptographic Utilities', () => {
  it('generateOtpCode should produce 6-digit numeric string', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
      const num = parseInt(code, 10);
      expect(num).toBeGreaterThanOrEqual(100000);
      expect(num).toBeLessThan(1000000);
    }
  });

  it('hashOtp should produce deterministic HMAC-SHA-256 hex string', () => {
    const email = 'test@example.com';
    const code = '123456';
    const hash1 = hashOtp(email, code);
    const hash2 = hashOtp('TEST@example.com ', '123456');

    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2); // Normalization check
  });

  it('verifyOtpHash should perform constant-time verification', () => {
    const email = 'user@learnforge.local';
    const correctCode = '654321';
    const hash = hashOtp(email, correctCode);

    expect(verifyOtpHash(email, correctCode, hash)).toBe(true);
    expect(verifyOtpHash(email, '654320', hash)).toBe(false);
    expect(verifyOtpHash('different@domain.com', correctCode, hash)).toBe(false);
    expect(verifyOtpHash(email, '', hash)).toBe(false);
    expect(verifyOtpHash(email, '12345', hash)).toBe(false);
  });

  it('generateSessionToken and hashSessionToken should produce high-entropy hashes', () => {
    const token = generateSessionToken();
    expect(token).toHaveLength(64); // 32 bytes in hex

    const hash = hashSessionToken(token);
    expect(hash).toHaveLength(64); // SHA-256 in hex
    expect(hash).not.toBe(token);
  });
});
