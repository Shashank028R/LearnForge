import { hashSessionToken } from '../utils/authCrypto.js';
import { UserSession } from '../models/UserSession.js';
import { User } from '../models/User.js';

export const SESSION_COOKIE_NAME = 'learnforge_session';

/**
 * Reusable authentication middleware.
 *
 * Resolves authentication credentials via:
 * 1. HTTP-Only Cookie: `req.cookies.learnforge_session` (Web client standard)
 * 2. Header: `Authorization: Bearer <token>` (Future mobile apps / API clients)
 *
 * Precedence: Cookie is preferred when present to guarantee browser security;
 * Bearer header is accepted for non-browser/mobile clients.
 */
export async function authenticateUser(req, res, next) {
  try {
    let rawToken = null;

    // 1. Check HTTP-only cookie
    if (req.cookies && req.cookies[SESSION_COOKIE_NAME]) {
      rawToken = req.cookies[SESSION_COOKIE_NAME];
    }

    // 2. Fallback to Authorization: Bearer header
    if (!rawToken && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        rawToken = parts[1];
      }
    }

    if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication credentials are required to access this resource.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    // Hash the token to look up in MongoDB (never match raw tokens)
    const tokenHash = hashSessionToken(rawToken);

    const session = await UserSession.findOne({ sessionTokenHash: tokenHash });

    if (!session) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Invalid session credential. Please sign in.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    // Check Revocation
    if (session.revokedAt) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'SESSION_REVOKED',
          message: 'This session has been revoked. Please sign in again.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    // Check Expiration
    if (session.expiresAt && session.expiresAt <= new Date()) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Your session has expired. Please sign in again.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    // Resolve associated user
    const user = await User.findById(session.userId);
    if (!user || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'User account is inactive or not found.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    // Update lastSeenAt
    session.lastSeenAt = new Date();
    await session.save();

    // Attach authenticated identity to request
    req.user = user;
    req.session = session;
    req.auth = {
      sessionId: session._id,
      method: session.authMethod,
      userId: user._id,
      email: user.email,
    };

    next();
  } catch (error) {
    next(error);
  }
}
