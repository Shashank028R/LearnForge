import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { config } from './config/env.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { notFoundHandler, globalErrorHandler } from './middleware/errorHandler.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';

export function createApp() {
  const app = express();

  // Security, cookies, and parsing middleware
  app.use(requestIdMiddleware);
  app.use(cors({
    origin: config.clientOrigin,
    credentials: true,
  }));
  app.use(cookieParser(config.sessionSecret));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Logging (skip logging during automated test runs)
  if (!config.isTest) {
    app.use(morgan(':method :url :status :res[content-length] - :response-time ms [req-id: :res[x-request-id]]'));
  }

  // Mount API v1 router
  const apiRouter = express.Router();
  apiRouter.use(healthRouter);
  apiRouter.use(authRouter);

  app.use(config.apiPrefix, apiRouter);

  // Fallback handlers
  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return app;
}

export default createApp();
