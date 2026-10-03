import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { UserSession } from '../src/models/UserSession.js';
import { AuthIdentity } from '../src/models/AuthIdentity.js';
import { EmailOtpToken } from '../src/models/EmailOtpToken.js';
import { emailService } from '../src/services/email/EmailService.js';
import { googleAuthService } from '../src/services/auth/GoogleAuthService.js';
import { hashSessionToken, hashOtp } from '../src/utils/authCrypto.js';

describe('Authentication & User Identity API (/api/v1/auth)', () => {
  // In-Memory Database Stores for Deterministic Testing
  let usersStore = new Map();
  let sessionsStore = new Map();
  let identitiesStore = new Map();
  let otpTokensStore = new Map();

  beforeEach(() => {
    usersStore.clear();
    sessionsStore.clear();
    identitiesStore.clear();
    otpTokensStore.clear();
    emailService.clearMemory();
    googleAuthService.clearMockVerifier();

    // Mock EmailOtpToken
    vi.spyOn(EmailOtpToken, 'findOne').mockImplementation(async (query) => {
      const email = query.email?.toLowerCase()?.trim();
      const doc = otpTokensStore.get(email);
      if (!doc) return null;
      return {
        ...doc,
        save: async function () {
          otpTokensStore.set(email, { ...doc, attempts: this.attempts });
          return this;
        },
      };
    });

    vi.spyOn(EmailOtpToken, 'findOneAndUpdate').mockImplementation(async (query, update, options) => {
      const email = query.email?.toLowerCase()?.trim();
      const existing = otpTokensStore.get(email) || {
        _id: new mongoose.Types.ObjectId(),
        email,
        attempts: 0,
        maxAttempts: 5,
      };

      const updated = {
        ...existing,
        ...update,
        attempts: update.attempts !== undefined ? update.attempts : existing.attempts,
        updatedAt: new Date(),
      };
      otpTokensStore.set(email, updated);
      return updated;
    });

    vi.spyOn(EmailOtpToken, 'deleteOne').mockImplementation(async (query) => {
      if (query.email) {
        otpTokensStore.delete(query.email.toLowerCase().trim());
      } else if (query._id) {
        for (const [key, val] of otpTokensStore.entries()) {
          if (val._id.toString() === query._id.toString()) {
            otpTokensStore.delete(key);
            break;
          }
        }
      }
      return { deletedCount: 1 };
    });

    // Mock User
    vi.spyOn(User, 'findOne').mockImplementation(async (query) => {
      const email = query.normalizedEmail?.toLowerCase()?.trim();
      for (const u of usersStore.values()) {
        if (u.normalizedEmail === email) return { ...u, save: async () => u };
      }
      return null;
    });

    vi.spyOn(User, 'findById').mockImplementation(async (id) => {
      const u = usersStore.get(id?.toString());
      if (!u) return null;
      return { ...u, save: async () => u };
    });

    vi.spyOn(User, 'create').mockImplementation(async (data) => {
      const id = new mongoose.Types.ObjectId().toString();
      const user = {
        _id: id,
        email: data.email,
        normalizedEmail: data.normalizedEmail,
        displayName: data.displayName || data.email.split('@')[0],
        avatarUrl: data.avatarUrl || null,
        status: 'active',
        timezone: 'UTC',
        preferences: { theme: 'light', density: 'normal' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      usersStore.set(id, user);
      return user;
    });

    // Mock UserSession
    vi.spyOn(UserSession, 'create').mockImplementation(async (data) => {
      const id = new mongoose.Types.ObjectId().toString();
      const session = {
        _id: id,
        ...data,
        revokedAt: null,
        lastSeenAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      sessionsStore.set(id, session);
      return session;
    });

    vi.spyOn(UserSession, 'findOne').mockImplementation(async (query) => {
      const hash = query.sessionTokenHash;
      for (const s of sessionsStore.values()) {
        if (s.sessionTokenHash === hash) {
          return {
            ...s,
            save: async function () {
              sessionsStore.set(s._id, { ...s, ...this });
              return this;
            },
          };
        }
      }
      return null;
    });

    vi.spyOn(UserSession, 'updateMany').mockImplementation(async (query, update) => {
      let count = 0;
      for (const s of sessionsStore.values()) {
        if (s.userId?.toString() === query.userId?.toString()) {
          if (query.revokedAt === null && s.revokedAt !== null) continue;
          Object.assign(s, update);
          count++;
        }
      }
      return { modifiedCount: count };
    });

    // Mock AuthIdentity
    vi.spyOn(AuthIdentity, 'findOne').mockImplementation(async (query) => {
      for (const idDoc of identitiesStore.values()) {
        if (idDoc.provider === query.provider && idDoc.providerSubject === query.providerSubject) {
          return idDoc;
        }
      }
      return null;
    });

    vi.spyOn(AuthIdentity, 'create').mockImplementation(async (data) => {
      const id = new mongoose.Types.ObjectId().toString();
      const doc = { _id: id, ...data };
      identitiesStore.set(id, doc);
      return doc;
    });

    vi.spyOn(AuthIdentity, 'findOneAndUpdate').mockImplementation(async (query, update) => {
      for (const idDoc of identitiesStore.values()) {
        if (idDoc.provider === query.provider && idDoc.providerSubject === query.providerSubject) {
          Object.assign(idDoc, update);
          return idDoc;
        }
      }
      const id = new mongoose.Types.ObjectId().toString();
      const doc = { _id: id, ...query, ...update };
      identitiesStore.set(id, doc);
      return doc;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* -------------------------------------------------------------
   * 1. EMAIL OTP TESTS
   * ------------------------------------------------------------- */
  describe('Passwordless Email OTP Flow', () => {
    it('POST /auth/otp/request validates email format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/otp/request')
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /auth/otp/request sends OTP and provides enumeration-resistant response', async () => {
      const res = await request(app)
        .post('/api/v1/auth/otp/request')
        .send({ email: 'Student@LearnForge.io' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('If the provided email address is valid');

      // Verify OTP was stored in memory transport and NOT as plaintext in database
      const sent = emailService.getLastSentOtp('student@learnforge.io');
      expect(sent).not.toBeNull();
      expect(sent.code).toMatch(/^\d{6}$/);

      const dbDoc = otpTokensStore.get('student@learnforge.io');
      expect(dbDoc).toBeDefined();
      expect(dbDoc.otpHash).not.toBe(sent.code); // Plaintext is never stored
      expect(dbDoc.otpHash).toHaveLength(64); // HMAC-SHA-256
    });

    it('POST /auth/otp/request enforces resend cooldown (60 seconds)', async () => {
      // First request
      await request(app)
        .post('/api/v1/auth/otp/request')
        .send({ email: 'cooldown@learnforge.io' });

      // Immediate second request
      const res = await request(app)
        .post('/api/v1/auth/otp/request')
        .send({ email: 'cooldown@learnforge.io' });

      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('OTP_RATE_LIMITED');
      expect(res.body.error.message).toContain('Please wait');
    });

    it('POST /auth/otp/verify rejects invalid OTP and counts attempts', async () => {
      const email = 'verify@learnforge.io';
      await request(app).post('/api/v1/auth/otp/request').send({ email });

      const res = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ email, code: '000000' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_OTP');
      expect(res.body.error.details[0].remainingAttempts).toBe(4);
    });

    it('POST /auth/otp/verify invalidates code after 5 failed attempts (brute-force defense)', async () => {
      const email = 'bruteforce@learnforge.io';
      await request(app).post('/api/v1/auth/otp/request').send({ email });

      // 4 invalid attempts
      for (let i = 0; i < 4; i++) {
        await request(app).post('/api/v1/auth/otp/verify').send({ email, code: '111111' });
      }

      // 5th invalid attempt: should invalidate token
      const res5 = await request(app).post('/api/v1/auth/otp/verify').send({ email, code: '111111' });
      expect(res5.status).toBe(429);
      expect(res5.body.error.code).toBe('MAX_ATTEMPTS_EXCEEDED');

      // 6th attempt: token is destroyed/expired
      const res6 = await request(app).post('/api/v1/auth/otp/verify').send({ email, code: '111111' });
      expect(res6.status).toBe(400);
      expect(res6.body.error.code).toBe('OTP_EXPIRED');
    });

    it('POST /auth/otp/verify rejects expired OTP', async () => {
      const email = 'expired@learnforge.io';
      await request(app).post('/api/v1/auth/otp/request').send({ email });

      // Simulate expired time
      const doc = otpTokensStore.get(email);
      doc.expiresAt = new Date(Date.now() - 1000);

      const res = await request(app).post('/api/v1/auth/otp/verify').send({ email, code: '123456' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('OTP_EXPIRED');
    });

    it('POST /auth/otp/verify creates user, session, sets secure cookie, and destroys OTP without exposing sessionToken in JSON', async () => {
      const email = 'newuser@learnforge.io';
      await request(app).post('/api/v1/auth/otp/request').send({ email });
      const { code } = emailService.getLastSentOtp(email);

      const res = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ email, code });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(email);
      // CRITICAL SECURITY ASSERTION: Browser response MUST NOT contain raw sessionToken in JSON
      expect(res.body.data.sessionToken).toBeUndefined();
      expect(res.body.data.session).toBeDefined();
      expect(res.body.data.session.authMethod).toBe('otp');

      // Check HTTP-only cookie set with expected security flags
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('learnforge_session=');
      expect(cookies[0]).toContain('HttpOnly');
      expect(cookies[0]).toContain('SameSite=Lax');
      expect(cookies[0]).toContain('Path=/');

      // Extract raw token from Set-Cookie header to verify database hash
      const rawTokenMatch = cookies[0].match(/learnforge_session=([^;]+)/);
      expect(rawTokenMatch).toBeDefined();
      const extractedRawToken = rawTokenMatch[1];

      // Verify OTP is single-use and destroyed
      expect(otpTokensStore.has(email)).toBe(false);

      // Verify User is persisted
      expect(usersStore.size).toBe(1);
      // Verify Session is persisted with hashed token
      expect(sessionsStore.size).toBe(1);
      const session = Array.from(sessionsStore.values())[0];
      expect(session.sessionTokenHash).toBe(hashSessionToken(extractedRawToken));
    });

    it('POST /auth/otp/verify handles concurrent user creation race (code 11000) gracefully', async () => {
      const email = 'race_user@learnforge.io';
      await request(app).post('/api/v1/auth/otp/request').send({ email });
      const { code } = emailService.getLastSentOtp(email);

      // Pre-seed an existing user to simulate another thread winning the User.create race
      const originalCreate = User.create;
      let firstAttempt = true;
      vi.spyOn(User, 'create').mockImplementationOnce(async (data) => {
        // Pre-create user in store to simulate concurrent winner
        const existing = {
          _id: new mongoose.Types.ObjectId().toString(),
          email: data.email,
          normalizedEmail: data.normalizedEmail,
          displayName: 'Concurrent Winner',
          status: 'active',
          preferences: { theme: 'light' },
        };
        usersStore.set(existing._id, existing);
        const duplicateErr = new Error('E11000 duplicate key error collection: users index: normalizedEmail_1');
        duplicateErr.code = 11000;
        throw duplicateErr;
      });

      const res = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ email, code });

      // Must succeed without 500 error, resolving the concurrently created user
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.displayName).toBe('Concurrent Winner');
    });
  });

  /* -------------------------------------------------------------
   * 2. GOOGLE OAUTH & ACCOUNT LINKING (ADR-010)
   * ------------------------------------------------------------- */
  describe('Google OAuth & Deterministic Account Linking', () => {
    it('POST /auth/google creates new user and sets cookie without leaking sessionToken in JSON', async () => {
      googleAuthService.setMockVerifier(async () => ({
        sub: 'google_user_001',
        email: 'google_student@gmail.com',
        emailVerified: true,
        name: 'Google Student',
        picture: 'https://avatar.com/pic.png',
      }));

      const res = await request(app)
        .post('/api/v1/auth/google')
        .send({ idToken: 'valid_id_token' });

      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('google_student@gmail.com');
      expect(res.body.data.user.displayName).toBe('Google Student');
      // CRITICAL: sessionToken must NOT be present in JSON
      expect(res.body.data.sessionToken).toBeUndefined();
      expect(res.body.data.session).toBeDefined();
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toContain('HttpOnly');
    });

    it('POST /auth/google handles concurrent Google signup race (code 11000) gracefully', async () => {
      googleAuthService.setMockVerifier(async () => ({
        sub: 'google_concurrent_sub',
        email: 'concurrent_google@gmail.com',
        emailVerified: true,
        name: 'Concurrent Google User',
        picture: 'https://avatar.com/pic.png',
      }));

      vi.spyOn(User, 'create').mockImplementationOnce(async (data) => {
        const existing = {
          _id: new mongoose.Types.ObjectId().toString(),
          email: data.email,
          normalizedEmail: data.normalizedEmail,
          displayName: 'Concurrent Google Winner',
          status: 'active',
          preferences: { theme: 'light' },
        };
        usersStore.set(existing._id, existing);
        const duplicateErr = new Error('E11000 duplicate key error');
        duplicateErr.code = 11000;
        throw duplicateErr;
      });

      const res = await request(app)
        .post('/api/v1/auth/google')
        .send({ idToken: 'valid_concurrent_token' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.displayName).toBe('Concurrent Google Winner');
    });

    it('POST /auth/google deterministically links to existing email-OTP user (ADR-010)', async () => {
      const sharedEmail = 'shared@domain.com';

      // 1. User originally registers via Email OTP
      await request(app).post('/api/v1/auth/otp/request').send({ email: sharedEmail });
      const { code } = emailService.getLastSentOtp(sharedEmail);
      const otpRes = await request(app).post('/api/v1/auth/otp/verify').send({ email: sharedEmail, code });
      const originalUserId = otpRes.body.data.user.id;

      expect(usersStore.size).toBe(1);

      // 2. User later signs in via Google with the exact same verified email
      googleAuthService.setMockVerifier(async () => ({
        sub: 'google_sub_for_shared',
        email: sharedEmail,
        emailVerified: true,
        name: 'Shared User',
        picture: 'https://avatar.com/shared.png',
      }));

      const googleRes = await request(app)
        .post('/api/v1/auth/google')
        .send({ idToken: 'valid_google_token' });

      expect(googleRes.status).toBe(200);
      // Confirms NO duplicate user was created: user ID matches original
      expect(googleRes.body.data.user.id).toBe(originalUserId);
      expect(usersStore.size).toBe(1);

      // AuthIdentities should now include Google linking to the same user
      const googleIdentity = Array.from(identitiesStore.values()).find((i) => i.provider === 'google');
      expect(googleIdentity).toBeDefined();
      expect(googleIdentity.userId).toBe(originalUserId);
    });

    it('POST /auth/google rejects unverified Google emails', async () => {
      googleAuthService.setMockVerifier(async () => {
        const err = new Error('Google account email has not been verified by Google.');
        err.code = 'AUTH_PROVIDER_ERROR';
        err.statusCode = 403;
        throw err;
      });

      const res = await request(app)
        .post('/api/v1/auth/google')
        .send({ idToken: 'unverified_token' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_PROVIDER_ERROR');
    });
  });

  /* -------------------------------------------------------------
   * 3. SESSIONS, LOGOUT & PROTECTED ROUTES
   * ------------------------------------------------------------- */
  describe('Session Management & Authorization Middleware', () => {
    it('GET /auth/me rejects unauthenticated requests with 401 AUTH_REQUIRED', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });

    it('GET /auth/me succeeds with HTTP-only session cookie', async () => {
      const email = 'cookie_test@learnforge.io';
      await request(app).post('/api/v1/auth/otp/request').send({ email });
      const { code } = emailService.getLastSentOtp(email);
      const verifyRes = await request(app).post('/api/v1/auth/otp/verify').send({ email, code });

      const cookie = verifyRes.headers['set-cookie'];

      const res = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(email);
      expect(res.body.data.session.authMethod).toBe('otp');
    });

    it('GET /auth/me succeeds with Authorization: Bearer header (mobile parity)', async () => {
      const email = 'bearer_test@learnforge.io';
      await request(app).post('/api/v1/auth/otp/request').send({ email });
      const { code } = emailService.getLastSentOtp(email);
      const verifyRes = await request(app).post('/api/v1/auth/otp/verify').send({ email, code });

      // In mobile flow, the mobile client receives the token via dedicated mobile authentication
      // For testing bearer parity, extract token from Set-Cookie header to test the backend bearer resolver
      const rawSessionToken = verifyRes.headers['set-cookie'][0].match(/learnforge_session=([^;]+)/)[1];

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${rawSessionToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe(email);
    });

    it('POST /auth/logout invalidates the active session and clears cookie', async () => {
      const email = 'logout_test@learnforge.io';
      await request(app).post('/api/v1/auth/otp/request').send({ email });
      const { code } = emailService.getLastSentOtp(email);
      const verifyRes = await request(app).post('/api/v1/auth/otp/verify').send({ email, code });
      const cookie = verifyRes.headers['set-cookie'];

      // Logout
      const logoutRes = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
      expect(logoutRes.status).toBe(200);

      // Subsequent access with revoked session fails
      const meRes = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
      expect(meRes.status).toBe(401);
      expect(meRes.body.error.code).toBe('SESSION_REVOKED');
    });

    it('POST /auth/logout-all revokes all sessions across all devices', async () => {
      const email = 'multisession@learnforge.io';
      await request(app).post('/api/v1/auth/otp/request').send({ email });
      const { code } = emailService.getLastSentOtp(email);
      const verifyRes1 = await request(app).post('/api/v1/auth/otp/verify').send({ email, code });
      const cookieDevice1 = verifyRes1.headers['set-cookie'];

      // Simulate second device session
      await request(app).post('/api/v1/auth/otp/request').send({ email });
      const { code: code2 } = emailService.getLastSentOtp(email);
      const verifyRes2 = await request(app).post('/api/v1/auth/otp/verify').send({ email, code: code2 });
      const cookieDevice2 = verifyRes2.headers['set-cookie'];

      // Device 1 triggers logout-all
      const logoutAllRes = await request(app)
        .post('/api/v1/auth/logout-all')
        .set('Cookie', cookieDevice1);
      expect(logoutAllRes.status).toBe(200);

      // Device 1 is revoked
      const checkDevice1 = await request(app).get('/api/v1/auth/me').set('Cookie', cookieDevice1);
      expect(checkDevice1.status).toBe(401);
      expect(checkDevice1.body.error.code).toBe('SESSION_REVOKED');

      // Device 2 is ALSO revoked
      const checkDevice2 = await request(app).get('/api/v1/auth/me').set('Cookie', cookieDevice2);
      expect(checkDevice2.status).toBe(401);
      expect(checkDevice2.body.error.code).toBe('SESSION_REVOKED');
    });
  });
});
