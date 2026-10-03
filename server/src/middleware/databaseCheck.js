import mongoose from 'mongoose';
import { config } from '../config/env.js';

/**
 * Middleware that ensures database connectivity before attempting operations.
 * Prevents 10,000ms Mongoose command buffering timeouts when MongoDB is offline.
 */
export function requireDatabase(req, res, next) {
  if (!config.isTest && mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Database service is currently offline. Please ensure MongoDB is running.',
        details: [{ readyState: mongoose.connection.readyState }],
      },
      requestId: req.id || 'unknown',
    });
  }
  next();
}
