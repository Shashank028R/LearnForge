import { User } from '../models/User.js';
import { AuthIdentity } from '../models/AuthIdentity.js';
import { UserSession } from '../models/UserSession.js';
import { EmailOtpToken } from '../models/EmailOtpToken.js';
import { emailService } from '../services/email/EmailService.js';
import { googleAuthService } from '../services/auth/GoogleAuthService.js';
import {
  generateOtpCode,
  hashOtp,
  verifyOtpHash,
  generateSessionToken,
  hashSessionToken,
} from '../utils/authCrypto.js';
import { config } from '../config/env.js';
import { SESSION_COOKIE_NAME } from '../middleware/auth.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sanitizeUser(user) {
  return {
    id: user._id,
    email: user.email,
    displayName: user.displayName || user.email.split('@')[0],
    avatarUrl: user.avatarUrl || null,
    status: user.status,
    timezone: user.timezone,
    preferences: user.preferences,
    createdAt: user.createdAt,
  };
}

function setSessionCookie(res, rawToken) {
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
  });
}

/**
 * POST /api/v1/auth/otp/request
 * Initiates a passwordless email verification flow.
 * Implements enumeration-resistant response and resend cooldown.
 */
export async function requestOtp(req, res, next) {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please provide a valid email address.',
          details: [{ field: 'email', issue: 'invalid_format' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check resend cooldown
    const existingToken = await EmailOtpToken.findOne({ email: normalizedEmail });
    if (existingToken && existingToken.resendAvailableAt > new Date()) {
      const retryAfterSeconds = Math.ceil((existingToken.resendAvailableAt - Date.now()) / 1000);
      return res.status(429).json({
        success: false,
        error: {
          code: 'OTP_RATE_LIMITED',
          message: `Please wait ${retryAfterSeconds} seconds before requesting a new code.`,
          details: [{ retryAfterSeconds }],
        },
        requestId: req.id || 'unknown',
      });
    }

    // Generate cryptographic OTP and HMAC hash
    const otpCode = generateOtpCode();
    const otpHash = hashOtp(normalizedEmail, otpCode);

    const expiresAt = new Date(Date.now() + config.otpExpiryMinutes * 60 * 1000);
    const resendAvailableAt = new Date(Date.now() + config.otpResendCooldownSeconds * 1000);

    // Persist hashed OTP with reset attempts
    await EmailOtpToken.findOneAndUpdate(
      { email: normalizedEmail },
      {
        otpHash,
        attempts: 0,
        maxAttempts: config.otpMaxAttempts,
        expiresAt,
        resendAvailableAt,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Dispatch OTP via abstracted email service
    await emailService.sendOtpEmail(normalizedEmail, otpCode);

    // Enumeration-resistant success response
    return res.status(200).json({
      success: true,
      data: {
        message: 'If the provided email address is valid, a verification code has been dispatched.',
        cooldownSeconds: config.otpResendCooldownSeconds,
        expiresInMinutes: config.otpExpiryMinutes,
      },
      meta: {
        requestId: req.id || 'unknown',
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/auth/otp/verify
 * Validates a 6-digit OTP code, destroys the token upon success, and provisions a session.
 */
export async function verifyOtp(req, res, next) {
  try {
    const { email, code } = req.body;

    if (!email || !code || typeof email !== 'string' || typeof code !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Both email and 6-digit verification code are required.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const cleanCode = code.trim();

    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_OTP',
          message: 'Verification code must be exactly 6 digits.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    const tokenDoc = await EmailOtpToken.findOne({ email: normalizedEmail });

    // Explicit expiration check (do not rely solely on MongoDB TTL for authorization)
    if (!tokenDoc || tokenDoc.expiresAt <= new Date()) {
      if (tokenDoc) {
        await EmailOtpToken.deleteOne({ _id: tokenDoc._id });
      }
      return res.status(400).json({
        success: false,
        error: {
          code: 'OTP_EXPIRED',
          message: 'Verification code has expired or was not requested. Please request a new code.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    // Check maximum failed attempts
    if (tokenDoc.attempts >= tokenDoc.maxAttempts) {
      await EmailOtpToken.deleteOne({ _id: tokenDoc._id });
      return res.status(429).json({
        success: false,
        error: {
          code: 'MAX_ATTEMPTS_EXCEEDED',
          message: 'Maximum verification attempts exceeded. For security, this code has been invalidated. Please request a new code.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    // Constant-time HMAC comparison
    const isValid = verifyOtpHash(normalizedEmail, cleanCode, tokenDoc.otpHash);

    if (!isValid) {
      tokenDoc.attempts += 1;
      const remainingAttempts = Math.max(0, tokenDoc.maxAttempts - tokenDoc.attempts);

      if (tokenDoc.attempts >= tokenDoc.maxAttempts) {
        await EmailOtpToken.deleteOne({ _id: tokenDoc._id });
        return res.status(429).json({
          success: false,
          error: {
            code: 'MAX_ATTEMPTS_EXCEEDED',
            message: 'Maximum verification attempts exceeded. This code has been invalidated.',
            details: [{ remainingAttempts: 0 }],
          },
          requestId: req.id || 'unknown',
        });
      }

      await tokenDoc.save();

      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_OTP',
          message: 'Incorrect verification code. Please check and try again.',
          details: [{ remainingAttempts }],
        },
        requestId: req.id || 'unknown',
      });
    }

    // Code verified: immediately invalidate/destroy token
    await EmailOtpToken.deleteOne({ _id: tokenDoc._id });

    // Resolve or bootstrap user with concurrent race protection
    let user = await User.findOne({ normalizedEmail });
    if (!user) {
      try {
        user = await User.create({
          email: normalizedEmail,
          normalizedEmail,
          displayName: normalizedEmail.split('@')[0],
        });
      } catch (err) {
        if (err.code === 11000) {
          // Concurrent creation race: another request created the user simultaneously
          user = await User.findOne({ normalizedEmail });
          if (!user) throw err;
        } else {
          throw err;
        }
      }
    }

    // Ensure AuthIdentity for email provider is linked idempotently
    try {
      await AuthIdentity.findOneAndUpdate(
        { provider: 'email', providerSubject: normalizedEmail },
        { userId: user._id, emailAtProvider: normalizedEmail },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (err) {
      if (err.code === 11000) {
        // Handled idempotent upsert race
        await AuthIdentity.findOne({ provider: 'email', providerSubject: normalizedEmail });
      } else {
        throw err;
      }
    }

    // Issue opaque session token
    const rawSessionToken = generateSessionToken();
    const sessionTokenHash = hashSessionToken(rawSessionToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    const sessionDoc = await UserSession.create({
      userId: user._id,
      sessionTokenHash,
      authMethod: 'otp',
      deviceInfo: {
        userAgent: req.headers['user-agent'] || '',
        ip: req.ip || '',
      },
      expiresAt,
    });

    // Set secure HTTP-only cookie — raw session token is NEVER returned in JSON
    setSessionCookie(res, rawSessionToken);

    return res.status(200).json({
      success: true,
      data: {
        user: sanitizeUser(user),
        session: {
          id: sessionDoc._id,
          expiresAt,
          authMethod: 'otp',
        },
      },
      meta: {
        requestId: req.id || 'unknown',
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/auth/google
 * Authenticates user via Google OAuth 2.0 OpenID Connect ID Token.
 * Enforces server-side verification and deterministic account linking (ADR-010).
 */
export async function authenticateGoogle(req, res, next) {
  try {
    const { idToken } = req.body;

    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Google ID token is required.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    // Cryptographic server-side verification of Google claims
    const googlePayload = await googleAuthService.verifyGoogleToken(idToken);
    const { sub, email, name, picture } = googlePayload;
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Check if an AuthIdentity already exists for this Google subject
    let identity = await AuthIdentity.findOne({ provider: 'google', providerSubject: sub });
    let user = null;

    if (identity) {
      user = await User.findById(identity.userId);
    }

    if (!user) {
      // 2. Deterministic Account Linking: check if a user with this verified email already exists
      user = await User.findOne({ normalizedEmail });

      if (user) {
        // Link Google identity to existing account (e.g. originally registered via OTP)
        if (!user.avatarUrl && picture) {
          user.avatarUrl = picture;
          await user.save();
        }
      } else {
        // 3. New user registration with concurrent race protection
        try {
          user = await User.create({
            email: normalizedEmail,
            normalizedEmail,
            displayName: name || normalizedEmail.split('@')[0],
            avatarUrl: picture || null,
          });
        } catch (err) {
          if (err.code === 11000) {
            // Concurrent creation race: another request created the user concurrently
            user = await User.findOne({ normalizedEmail });
            if (!user) throw err;
          } else {
            throw err;
          }
        }
      }

      // Link identity record idempotently
      try {
        await AuthIdentity.findOneAndUpdate(
          { provider: 'google', providerSubject: sub },
          { userId: user._id, emailAtProvider: normalizedEmail },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (err) {
        if (err.code === 11000) {
          // If another concurrent request created this identity, re-verify link
          await AuthIdentity.findOneAndUpdate(
            { provider: 'google', providerSubject: sub },
            { $set: { userId: user._id, emailAtProvider: normalizedEmail } }
          );
        } else {
          throw err;
        }
      }
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_DISABLED',
          message: 'User account is suspended or deactivated.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    // Issue opaque session token
    const rawSessionToken = generateSessionToken();
    const sessionTokenHash = hashSessionToken(rawSessionToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    const sessionDoc = await UserSession.create({
      userId: user._id,
      sessionTokenHash,
      authMethod: 'google',
      deviceInfo: {
        userAgent: req.headers['user-agent'] || '',
        ip: req.ip || '',
      },
      expiresAt,
    });

    // Set secure HTTP-only cookie — raw session token is NEVER returned in JSON
    setSessionCookie(res, rawSessionToken);

    return res.status(200).json({
      success: true,
      data: {
        user: sanitizeUser(user),
        session: {
          id: sessionDoc._id,
          expiresAt,
          authMethod: 'google',
        },
      },
      meta: {
        requestId: req.id || 'unknown',
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/auth/me
 * Retrieves current authenticated user profile and active session metadata.
 */
export async function getMe(req, res) {
  return res.status(200).json({
    success: true,
    data: {
      user: sanitizeUser(req.user),
      session: {
        id: req.session._id,
        authMethod: req.session.authMethod,
        expiresAt: req.session.expiresAt,
        createdAt: req.session.createdAt,
      },
    },
    meta: {
      requestId: req.id || 'unknown',
    },
  });
}

/**
 * POST /api/v1/auth/logout
 * Terminates the active session and clears the browser cookie.
 */
export async function logout(req, res, next) {
  try {
    if (req.session) {
      req.session.revokedAt = new Date();
      await req.session.save();
    }

    clearSessionCookie(res);

    return res.status(200).json({
      success: true,
      data: {
        message: 'Logged out successfully.',
      },
      meta: {
        requestId: req.id || 'unknown',
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/auth/logout-all
 * Revokes all active sessions for the user across all devices.
 */
export async function logoutAll(req, res, next) {
  try {
    if (req.user) {
      await UserSession.updateMany(
        { userId: req.user._id, revokedAt: null },
        { revokedAt: new Date() }
      );
    }

    clearSessionCookie(res);

    return res.status(200).json({
      success: true,
      data: {
        message: 'All active sessions across all devices have been revoked.',
      },
      meta: {
        requestId: req.id || 'unknown',
      },
    });
  } catch (error) {
    next(error);
  }
}
