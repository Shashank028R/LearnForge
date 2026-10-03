import nodemailer from 'nodemailer';
import { config } from '../../config/env.js';

class EmailService {
  constructor() {
    this.memorySentOtps = new Map();
    this.transporter = null;
  }

  /**
   * Initializes or returns the cached Nodemailer SMTP transporter.
   */
  getTransporter() {
    if (!this.transporter) {
      if (!config.smtpHost) {
        throw new Error('Email delivery misconfigured: SMTP_HOST is required when EMAIL_PROVIDER=smtp.');
      }

      this.transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        auth: config.smtpUser ? {
          user: config.smtpUser,
          pass: config.smtpPass,
        } : undefined,
      });
    }
    return this.transporter;
  }

  /**
   * Tests whether the configured SMTP server is reachable and credentials are valid.
   * @returns {Promise<{ status: string, message?: string }>}
   */
  async verifyConnection() {
    if (config.emailProvider !== 'smtp') {
      return { status: 'skipped', provider: config.emailProvider };
    }

    try {
      const transporter = this.getTransporter();
      await transporter.verify();
      return { status: 'connected' };
    } catch (error) {
      return { status: 'failed', message: error.message };
    }
  }

  /**
   * Dispatches a 6-digit OTP verification code.
   *
   * @param {string} toEmail 
   * @param {string} otpCode 
   * @returns {Promise<{ success: boolean, messageId: string }>}
   */
  async sendOtpEmail(toEmail, otpCode) {
    const normalizedEmail = toEmail.toLowerCase().trim();
    const fallbackMessageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Store in memory for testing/local development inspection
    if (config.isTest) {
      this.memorySentOtps.set(normalizedEmail, {
        code: otpCode,
        sentAt: new Date(),
        messageId: fallbackMessageId,
      });
      return { success: true, messageId: fallbackMessageId };
    }

    // Real SMTP delivery when EMAIL_PROVIDER=smtp
    if (config.emailProvider === 'smtp') {
      try {
        const transporter = this.getTransporter();
        const info = await transporter.sendMail({
          from: config.emailFrom,
          to: normalizedEmail,
          subject: `Your LearnForge verification code: ${otpCode}`,
          text: `Your LearnForge verification code is: ${otpCode}\n\nThis code will expire in ${config.otpExpiryMinutes} minutes. If you did not request this code, you can safely ignore this email.`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
              <div style="margin-bottom: 24px;">
                <h2 style="margin: 0; font-size: 20px; font-weight: 700; color: #0f172a;">LearnForge</h2>
              </div>
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.5;">Hello,</p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.5;">Use the following 6-digit verification code to sign in to your LearnForge workspace:</p>
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; text-align: center; margin: 0 0 24px;">
                <span style="font-family: 'JetBrains Mono', monospace, Courier; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #2563eb;">${otpCode}</span>
              </div>
              <p style="margin: 0 0 16px; font-size: 14px; color: #64748b; line-height: 1.5;">This code will expire in ${config.otpExpiryMinutes} minutes. If you did not request this code, you can safely ignore this email.</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;" />
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">LearnForge — AI Learning Workspace</p>
            </div>
          `,
        });

        this.memorySentOtps.set(normalizedEmail, {
          code: otpCode,
          sentAt: new Date(),
          messageId: info.messageId,
        });

        return { success: true, messageId: info.messageId };
      } catch (error) {
        console.error('[LearnForge EmailService] SMTP dispatch failed:', error.message);
        const err = new Error(`Failed to send verification email: ${error.message}`);
        err.code = 'EMAIL_DELIVERY_FAILED';
        err.statusCode = 502;
        throw err;
      }
    }

    // Local Development Console Provider
    if (config.emailProvider === 'console') {
      if (config.isProduction) {
        throw new Error(
          'Email delivery misconfigured: Production mode cannot use "console" emailProvider. Configure a verified transactional email provider.'
        );
      }

      this.memorySentOtps.set(normalizedEmail, {
        code: otpCode,
        sentAt: new Date(),
        messageId: fallbackMessageId,
      });

      console.log('\n============================================================');
      console.log(`[LearnForge EmailService] Development OTP Delivery`);
      console.log(`Recipient : ${normalizedEmail}`);
      console.log(`OTP Code  : [ ${otpCode} ] (Valid for ${config.otpExpiryMinutes} minutes)`);
      console.log(`MessageId : ${fallbackMessageId}`);
      console.log('============================================================\n');

      return { success: true, messageId: fallbackMessageId };
    }

    throw new Error(`Email delivery misconfigured: Unsupported provider "${config.emailProvider}".`);
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
