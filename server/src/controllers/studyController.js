import mongoose from 'mongoose';
import { studyService } from '../study/services/studyService.js';

export const studyController = {
  /**
   * POST /api/v1/topics/:topicId/study/sessions
   * Create new session or resume active session (pins syllabus)
   */
  async createOrResumeSession(req, res, next) {
    try {
      const userId = req.user._id;
      const { topicId } = req.params;

      const result = await studyService.createOrResumeSession(userId, topicId);

      return res.status(result.isNew ? 201 : 200).json({
        success: true,
        data: {
          session: result.session,
          isNew: result.isNew,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/study-sessions
   * Lists study sessions for the authenticated user
   */
  async listStudySessions(req, res, next) {
    try {
      const userId = req.user._id;
      const { topicId, status, limit, skip } = req.query;

      const result = await studyService.listSessions(userId, {
        topicId,
        status,
        limit,
        skip,
      });

      return res.status(200).json({
        success: true,
        data: result.sessions,
        pagination: {
          total: result.total,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/study-sessions/:id
   * Retrieves full study session document including turn history
   */
  async getStudySessionById(req, res, next) {
    try {
      const userId = req.user._id;
      const { id } = req.params;

      const session = await studyService.getSessionById(userId, id);

      return res.status(200).json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/study-sessions/:id/answer
   * Submits an answer for the active question (optimistic concurrency & lease fencing)
   */
  async submitAnswer(req, res, next) {
    try {
      const userId = req.user._id;
      const { id } = req.params;
      const { questionId, sessionVersion, clientTurnId, answer } = req.body;

      const result = await studyService.submitAnswer(userId, id, {
        questionId,
        sessionVersion,
        clientTurnId,
        answer,
      });

      return res.status(200).json({
        success: true,
        data: {
          idempotent: result.idempotent || false,
          turn: result.turn,
          session: result.session,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/study-sessions/:id/continue
   * Advances already-evaluated session (ADVANCING -> next question; REMEDIATING -> follow-up question)
   */
  async continueSession(req, res, next) {
    try {
      const userId = req.user._id;
      const { id } = req.params;
      const { sessionVersion } = req.body;

      const session = await studyService.continueSession(userId, id, { sessionVersion });

      return res.status(200).json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/study-sessions/:id/pause
   * Pauses an active study session (allowed only from QUESTIONING, REMEDIATING, RECHECKING)
   */
  async pauseSession(req, res, next) {
    try {
      const userId = req.user._id;
      const { id } = req.params;
      const { sessionVersion } = req.body;

      const session = await studyService.pauseSession(userId, id, { sessionVersion });

      return res.status(200).json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/study-sessions/:id/resume
   * Resumes a paused session back to its exact prior status
   */
  async resumeSession(req, res, next) {
    try {
      const userId = req.user._id;
      const { id } = req.params;
      const { sessionVersion } = req.body;

      const session = await studyService.resumeSession(userId, id, { sessionVersion });

      return res.status(200).json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/study-sessions/:id/exit
   * Terminates study session permanently (status: 'EXITED')
   */
  async exitSession(req, res, next) {
    try {
      const userId = req.user._id;
      const { id } = req.params;

      const session = await studyService.exitSession(userId, id);

      return res.status(200).json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default studyController;
