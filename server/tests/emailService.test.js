import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { emailService } from '../src/services/email/EmailService.js';
import { config } from '../src/config/env.js';
import nodemailer from 'nodemailer';

describe('EmailService', () => {
  beforeEach(() => {
    emailService.clearMemory();
  });

  afterEach(() => {
    emailService.clearMemory();
    vi.restoreAllMocks();
  });

  it('stores and returns sent OTPs in test mode without attempting network dispatch', async () => {
    const email = 'student@learnforge.io';
    const otpCode = '123456';

    const result = await emailService.sendOtpEmail(email, otpCode);

    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();

    const stored = emailService.getLastSentOtp(email);
    expect(stored).not.toBeNull();
    expect(stored.code).toBe(otpCode);
  });

  it('returns null for unsent email lookups', () => {
    expect(emailService.getLastSentOtp('nonexistent@learnforge.io')).toBeNull();
  });

  it('throws an error if SMTP_HOST is missing when EMAIL_PROVIDER=smtp', async () => {
    // Temporarily simulate non-test mode and smtp provider
    const originalIsTest = config.isTest;
    const originalProvider = config.emailProvider;
    const originalSmtpHost = config.smtpHost;

    try {
      config.isTest = false;
      config.emailProvider = 'smtp';
      config.smtpHost = '';
      emailService.transporter = null;

      await expect(emailService.sendOtpEmail('test@learnforge.io', '654321')).rejects.toThrow(
        /SMTP_HOST is required when EMAIL_PROVIDER=smtp/
      );
    } finally {
      config.isTest = originalIsTest;
      config.emailProvider = originalProvider;
      config.smtpHost = originalSmtpHost;
      emailService.transporter = null;
    }
  });

  it('correctly uses nodemailer transporter when EMAIL_PROVIDER=smtp', async () => {
    const originalIsTest = config.isTest;
    const originalProvider = config.emailProvider;
    const originalSmtpHost = config.smtpHost;

    const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'smtp_mock_123' });
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: mockSendMail,
      verify: vi.fn().mockResolvedValue(true),
    });

    try {
      config.isTest = false;
      config.emailProvider = 'smtp';
      config.smtpHost = 'smtp.testserver.com';
      emailService.transporter = null;

      const result = await emailService.sendOtpEmail('recipient@learnforge.io', '888999');

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('smtp_mock_123');
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'recipient@learnforge.io',
          subject: expect.stringContaining('888999'),
        })
      );
    } finally {
      config.isTest = originalIsTest;
      config.emailProvider = originalProvider;
      config.smtpHost = originalSmtpHost;
      emailService.transporter = null;
    }
  });
});
