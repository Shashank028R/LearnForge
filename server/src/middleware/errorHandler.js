import { config } from '../config/env.js';

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}`,
      details: [],
    },
    requestId: req.id || 'unknown',
  });
}

export function globalErrorHandler(err, req, res, next) {
  const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
  const code = err.code || (status === 500 ? 'INTERNAL_SERVER_ERROR' : 'ERROR');
  const message = err.message || 'An unexpected server error occurred.';

  const response = {
    success: false,
    error: {
      code,
      message,
      details: err.details || [],
    },
    requestId: req.id || 'unknown',
  };

  if (!config.isProduction && status === 500 && err.stack) {
    response.error.stack = err.stack;
  }

  res.status(status).json(response);
}
