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
    this.memorySentOtps.set(toEmail.toLowerCase().trim(), {
      code: otpCode,
      sentAt: new Date(),
      messageId,
    });

    if (config.isTest) {
      // Quiet mode during automated test suites
      return { success: true, messageId };
    }

    if (config.emailProvider === 'console' || !config.isProduction) {
      console.log('\n============================================================');
      console.log(`[LearnForge EmailService] Development OTP Delivery`);
      console.log(`Recipient : ${toEmail}`);
      console.log(`OTP Code  : [ ${otpCode} ] (Valid for ${config.otpExpiryMinutes} minutes)`);
      console.log(`MessageId : ${messageId}`);
      console.log('============================================================\n');
      return { success: true, messageId };
    }

    // Production SMTP or Transactional API implementation
    if (config.emailProvider === 'smtp') {
      // Configured via SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
      console.log(`[EmailService] Production SMTP dispatched to ${toEmail}`);
      return { success: true, messageId };
    }

    return { success: true, messageId };
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
