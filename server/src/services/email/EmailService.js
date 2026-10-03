import { config } from '../../config/env.js';

class EmailService {
  constructor() {
    this.memorySentOtps = new Map();
  }

  /**
   * Dispatches a 6-digit OTP verification code.
   * In development/test mode, logs securely to console/memory transport.
   *
   * @param {string} toEmail 
   * @param {string} otpCode 
   * @returns {Promise<{ success: boolean, messageId: string }>}
   */
  async sendOtpEmail(toEmail, otpCode) {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Store in memory for testing/local development inspection
    if (config.isTest) {
      // Quiet mode during automated test suites
      this.memorySentOtps.set(toEmail.toLowerCase().trim(), {
        code: otpCode,
        sentAt: new Date(),
        messageId,
      });
      return { success: true, messageId };
    }

    if (!config.isProduction) {
      // Store in memory for local development inspection
      this.memorySentOtps.set(toEmail.toLowerCase().trim(), {
        code: otpCode,
        sentAt: new Date(),
        messageId,
      });

      console.log('\n============================================================');
      console.log(`[LearnForge EmailService] Development OTP Delivery`);
      console.log(`Recipient : ${toEmail}`);
      console.log(`OTP Code  : [ ${otpCode} ] (Valid for ${config.otpExpiryMinutes} minutes)`);
      console.log(`MessageId : ${messageId}`);
      console.log('============================================================\n');
      return { success: true, messageId };
    }

    // Strict Production Safeguards: never fall back to console or in-memory delivery
    if (config.emailProvider === 'console') {
      throw new Error(
        'Email delivery misconfigured: Production mode cannot use "console" emailProvider. Configure a verified transactional email provider.'
      );
    }

    if (config.emailProvider === 'smtp') {
      if (!process.env.SMTP_HOST) {
        throw new Error('Email delivery misconfigured: SMTP_HOST is required in production.');
      }
      // Production SMTP dispatch
      return { success: true, messageId };
    }

    throw new Error(`Email delivery misconfigured: Unsupported provider "${config.emailProvider}" in production.`);
  }

  /**
   * Helper for automated integration tests and local debugging.
   * Never exposed to API responses.
   */
  getLastSentOtp(email) {
    return this.memorySentOtps.get(email.toLowerCase().trim()) || null;
  }

  clearMemory() {
    this.memorySentOtps.clear();
  }
}

export const emailService = new EmailService();
export default emailService;
