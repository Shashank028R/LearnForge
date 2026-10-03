import express from 'express';
import {
  requestOtp,
  verifyOtp,
  authenticateGoogle,
  getMe,
  logout,
  logoutAll,
} from '../controllers/authController.js';
import { authenticateUser } from '../middleware/auth.js';
import {
  otpRequestLimiter,
  otpVerifyLimiter,
  googleAuthLimiter,
} from '../middleware/rateLimiter.js';
import { requireDatabase } from '../middleware/databaseCheck.js';

const router = express.Router();

// Enforce database connectivity for all authentication endpoints
router.use(requireDatabase);

// Public Authentication Endpoints (Rate Limited)
router.post('/auth/otp/request', otpRequestLimiter, requestOtp);
router.post('/auth/otp/verify', otpVerifyLimiter, verifyOtp);
router.post('/auth/google', googleAuthLimiter, authenticateGoogle);

// Protected Identity & Session Endpoints
router.get('/auth/me', authenticateUser, getMe);
router.post('/auth/logout', authenticateUser, logout);
router.post('/auth/logout-all', authenticateUser, logoutAll);

export default router;
