import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { config } from './config/env.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { notFoundHandler, globalErrorHandler } from './middleware/errorHandler.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import subjectsRouter from './routes/subjects.js';
import topicsRouter from './routes/topics.js';
import chatsRouter from './routes/chats.js';
import syllabusRouter from './routes/syllabus.js';
import annotationsRouter from './routes/annotations.js';
import knowledgeRouter from './routes/knowledgeRoutes.js';
import notesRouter from './routes/notesRoutes.js';

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
  apiRouter.use(subjectsRouter);
  apiRouter.use(topicsRouter);
  apiRouter.use(chatsRouter);
  apiRouter.use(syllabusRouter);
  apiRouter.use(annotationsRouter);
  apiRouter.use(knowledgeRouter);
  apiRouter.use(notesRouter);

  app.use(config.apiPrefix, apiRouter);

  // Fallback handlers
  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return app;
}

export default createApp();
