import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';

/**
 * Standard handler formatting rate-limit rejections into the application's
 * canonical error envelope.
 */
function createRateLimitHandler(errorCode, message) {
  return (req, res /*, next, options */) => {
    res.status(429).json({
      success: false,
      error: {
        code: errorCode,
        message,
        details: [],
      },
      requestId: req.id || 'unknown',
    });
  };
}

/**
 * Rate limiter for OTP requests:
 * Max 5 OTP requests per IP per 15-minute window.
 */
export const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isTest ? 100 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => config.isTest && req.headers['x-bypass-rate-limit'] === 'test-bypass',
  handler: createRateLimitHandler('OTP_RATE_LIMITED', 'Too many OTP requests from this IP. Please wait 15 minutes before retrying.'),
});

/**
 * Rate limiter for OTP verification attempts:
 * Max 10 verification requests per IP per 15-minute window.
 */
export const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isTest ? 100 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => config.isTest && req.headers['x-bypass-rate-limit'] === 'test-bypass',
  handler: createRateLimitHandler('OTP_RATE_LIMITED', 'Too many verification attempts from this IP. Please wait 15 minutes before retrying.'),
});

/**
 * Rate limiter for Google OAuth authentication:
 * Max 15 attempts per IP per 15-minute window.
 */
export const googleAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isTest ? 100 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => config.isTest && req.headers['x-bypass-rate-limit'] === 'test-bypass',
  handler: createRateLimitHandler('AUTH_RATE_LIMITED', 'Too many authentication attempts from this IP. Please try again later.'),
});

/**
 * Rate limiter for AI message generation & chat exchanges (Phase 05):
 * Max 30 messages per minute per IP.
 */
export const aiMessageRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.isTest ? 500 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => (config.isTest || config.isDevelopment) && req.headers['x-bypass-rate-limit'] === 'test-bypass',
  handler: createRateLimitHandler('AI_RATE_LIMITED', 'Too many AI requests. Please slow down and try again in a moment.'),
});
