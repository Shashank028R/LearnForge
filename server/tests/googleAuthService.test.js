import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { googleAuthService } from '../src/services/auth/GoogleAuthService.js';

describe('GoogleAuthService OIDC Token Verification Boundary', () => {
  afterEach(() => {
    googleAuthService.clearMockVerifier();
  });

  it('rejects empty or missing ID tokens', async () => {
    await expect(googleAuthService.verifyGoogleToken('')).rejects.toThrow('Google ID token is required');
    await expect(googleAuthService.verifyGoogleToken(null)).rejects.toThrow('Google ID token is required');
  });

  it('successfully parses verified Google identity claims', async () => {
    googleAuthService.setMockVerifier(async (token) => {
      expect(token).toBe('valid_google_token_123');
      return {
        sub: 'google_sub_98765',
        email: 'alice@gmail.com',
        emailVerified: true,
        name: 'Alice Student',
        picture: 'https://lh3.googleusercontent.com/photo.jpg',
      };
    });

    const identity = await googleAuthService.verifyGoogleToken('valid_google_token_123');
    expect(identity.sub).toBe('google_sub_98765');
    expect(identity.email).toBe('alice@gmail.com');
    expect(identity.emailVerified).toBe(true);
    expect(identity.name).toBe('Alice Student');
  });

  it('rejects unverified Google emails per ADR-010 security policy', async () => {
    googleAuthService.setMockVerifier(async () => {
      const err = new Error('Google account email has not been verified by Google.');
      err.code = 'AUTH_PROVIDER_ERROR';
      err.statusCode = 403;
      throw err;
    });

    await expect(googleAuthService.verifyGoogleToken('unverified_token')).rejects.toThrow(
      'Google account email has not been verified by Google'
    );
  });

  it('rejects invalid signature or corrupt OIDC token', async () => {
    googleAuthService.setMockVerifier(async () => {
      const err = new Error('Invalid token signature.');
      err.code = 'INVALID_OIDC_TOKEN';
      err.statusCode = 401;
      throw err;
    });

    await expect(googleAuthService.verifyGoogleToken('corrupt_signature_token')).rejects.toThrow(
      'Invalid token signature'
    );
  });

  it('rejects token when audience does not match configured GOOGLE_CLIENT_ID', async () => {
    googleAuthService.setMockVerifier(async () => {
      const err = new Error('Token audience does not match GOOGLE_CLIENT_ID.');
      err.code = 'INVALID_AUDIENCE';
      err.statusCode = 401;
      throw err;
    });

    await expect(googleAuthService.verifyGoogleToken('wrong_audience_token')).rejects.toThrow(
      'Token audience does not match GOOGLE_CLIENT_ID'
    );
  });

  it('rejects token when issuer is not accounts.google.com', async () => {
    googleAuthService.setMockVerifier(async () => {
      const err = new Error('Invalid token issuer. Must be accounts.google.com.');
      err.code = 'INVALID_ISSUER';
      err.statusCode = 401;
      throw err;
    });

    await expect(googleAuthService.verifyGoogleToken('rogue_issuer_token')).rejects.toThrow(
      'Invalid token issuer'
    );
  });

  it('rejects expired Google credential', async () => {
    googleAuthService.setMockVerifier(async () => {
      const err = new Error('Token has expired.');
      err.code = 'TOKEN_EXPIRED';
      err.statusCode = 401;
      throw err;
    });

    await expect(googleAuthService.verifyGoogleToken('expired_google_token')).rejects.toThrow(
      'Token has expired'
    );
  });
});
