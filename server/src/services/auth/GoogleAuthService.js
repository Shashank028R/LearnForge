import { OAuth2Client } from 'google-auth-library';
import { config } from '../../config/env.js';

class GoogleAuthService {
  constructor() {
    this.client = new OAuth2Client(config.googleClientId);
    this.mockVerifier = null;
  }

  /**
   * Cryptographically verifies a Google ID Token (JWT) issued by Google OpenID Connect.
   *
   * @param {string} idToken 
   * @returns {Promise<{ sub: string, email: string, emailVerified: boolean, name: string, picture: string }>}
   */
  async verifyGoogleToken(idToken) {
    if (!idToken || typeof idToken !== 'string') {
      const err = new Error('Google ID token is required.');
      err.code = 'INVALID_TOKEN';
      err.statusCode = 400;
      throw err;
    }

    // Support mock verification boundary for unit and integration testing
    if (this.mockVerifier) {
      return this.mockVerifier(idToken);
    }

    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: config.googleClientId,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        const err = new Error('Invalid token payload from Google.');
        err.code = 'INVALID_TOKEN';
        err.statusCode = 401;
        throw err;
      }

      // Verify Issuer
      const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
      if (!validIssuers.includes(payload.iss)) {
        const err = new Error(`Invalid token issuer: ${payload.iss}`);
        err.code = 'INVALID_TOKEN';
        err.statusCode = 401;
        throw err;
      }

      // Verify Audience
      if (config.googleClientId && payload.aud !== config.googleClientId) {
        const err = new Error(`Token audience does not match application client ID.`);
        err.code = 'INVALID_TOKEN';
        err.statusCode = 401;
        throw err;
      }

      // Verify Expiration
      if (payload.exp && payload.exp * 1000 <= Date.now()) {
        const err = new Error('Google ID token has expired.');
        err.code = 'INVALID_TOKEN';
        err.statusCode = 401;
        throw err;
      }

      // Verify Email Verification Claim
      if (!payload.email_verified) {
        const err = new Error('Google account email has not been verified by Google.');
        err.code = 'AUTH_PROVIDER_ERROR';
        err.statusCode = 403;
        throw err;
      }

      return {
        sub: payload.sub,
        email: payload.email.toLowerCase().trim(),
        emailVerified: Boolean(payload.email_verified),
        name: payload.name || '',
        picture: payload.picture || '',
      };
    } catch (error) {
      if (error.statusCode) throw error;
      const err = new Error(`Google authentication failed: ${error.message}`);
      err.code = 'AUTH_PROVIDER_ERROR';
      err.statusCode = 401;
      throw err;
    }
  }

  /**
   * Pluggable verification boundary for CI testing.
   * Does not fake crypto inside tests, but allows injecting the test verification hook.
   */
  setMockVerifier(fn) {
    this.mockVerifier = fn;
  }

  clearMockVerifier() {
    this.mockVerifier = null;
  }
}

export const googleAuthService = new GoogleAuthService();
export default googleAuthService;
