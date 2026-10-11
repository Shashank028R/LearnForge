import mongoose from 'mongoose';
import { learningStateService } from '../services/learningStateService.js';
import { VALID_PUBLIC_STATUSES, VALID_PERSISTED_STATUSES } from '../services/learningStateEngine.js';
import { config } from '../config/env.js';

function parseEvaluationTimestamp(req) {
  if (config.isTest && req.query.evaluationTimestamp) {
    const parsed = new Date(req.query.evaluationTimestamp);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

export const learningStateController = {
  /**
   * GET /api/v1/learning-state/concepts/:conceptId
   */
  async getConceptLearningState(req, res, next) {
    try {
      const { conceptId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(conceptId)) {
        const error = new Error('Invalid conceptId format.');
        error.code = 'VALIDATION_ERROR';
        error.statusCode = 400;
        throw error;
      }

      const evalTime = parseEvaluationTimestamp(req);
      const result = await learningStateService.getConceptLearningState(req.user._id, conceptId, {
        evaluationTime: evalTime,
      });

      return res.status(200).json({
        success: true,
        data: result,
        meta: {
          evaluationTimestamp: evalTime.toISOString(),
          requestId: req.id || 'unknown',
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/learning-state/topics/:topicId
   */
  async getTopicLearningSummary(req, res, next) {
    try {
      const { topicId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(topicId)) {
        const error = new Error('Invalid topicId format.');
        error.code = 'VALIDATION_ERROR';
        error.statusCode = 400;
        throw error;
      }

      const { status, page, limit } = req.query;
      if (status && !VALID_PUBLIC_STATUSES.has(status) && !VALID_PERSISTED_STATUSES.has(status)) {
        const error = new Error(`Invalid status filter '${status}'. Allowed values: ${Array.from(VALID_PUBLIC_STATUSES).join(', ')}.`);
        error.code = 'VALIDATION_ERROR';
        error.statusCode = 400;
        throw error;
      }

      const evalTime = parseEvaluationTimestamp(req);

      const result = await learningStateService.getTopicLearningSummary(req.user._id, topicId, {
        evaluationTime: evalTime,
        status,
        page,
        limit,
      });

      return res.status(200).json({
        success: true,
        data: {
          topicId: result.topicId,
          subjectId: result.subjectId,
          isActiveInSyllabus: result.isActiveInSyllabus,
          summary: result.summary,
          weakConcepts: result.weakConcepts,
          concepts: result.concepts,
        },
        meta: {
          evaluationTimestamp: evalTime.toISOString(),
          pagination: result.pagination,
          requestId: req.id || 'unknown',
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/learning-state/subjects/:subjectId
   */
  async getSubjectLearningSummary(req, res, next) {
    try {
      const { subjectId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(subjectId)) {
        const error = new Error('Invalid subjectId format.');
        error.code = 'VALIDATION_ERROR';
        error.statusCode = 400;
        throw error;
      }

      const { page, limit } = req.query;
      const evalTime = parseEvaluationTimestamp(req);

      const result = await learningStateService.getSubjectLearningSummary(req.user._id, subjectId, {
        evaluationTime: evalTime,
        page,
        limit,
      });

      return res.status(200).json({
        success: true,
        data: {
          subjectId: result.subjectId,
          summary: result.summary,
          weakestTopics: result.weakestTopics,
          topics: result.topics,
        },
        meta: {
          evaluationTimestamp: evalTime.toISOString(),
          pagination: result.pagination,
          requestId: req.id || 'unknown',
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/learning-state/priorities
   */
  async getLearningPriorities(req, res, next) {
    try {
      const { subjectId, topicId, limit, includeMastered } = req.query;
      if (!subjectId || !mongoose.Types.ObjectId.isValid(subjectId)) {
        const error = new Error('A valid subjectId query parameter is required.');
        error.code = 'VALIDATION_ERROR';
        error.statusCode = 400;
        throw error;
      }

      if (topicId && !mongoose.Types.ObjectId.isValid(topicId)) {
        const error = new Error('Invalid topicId query parameter.');
        error.code = 'VALIDATION_ERROR';
        error.statusCode = 400;
        throw error;
      }

      const evalTime = parseEvaluationTimestamp(req);
      const result = await learningStateService.getLearningPriorities(req.user._id, {
        subjectId,
        topicId,
        limit,
        includeMastered: includeMastered === 'true' || includeMastered === true,
        evaluationTime: evalTime,
      });

      return res.status(200).json({
        success: true,
        data: {
          recommendations: result.recommendations,
        },
        meta: {
          evaluationTimestamp: evalTime.toISOString(),
          pagination: result.pagination,
          requestId: req.id || 'unknown',
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/learning-state/rebuild/:topicId
   * (Also supporting POST /topics/:topicId/rebuild)
   */
  async rebuildTopic(req, res, next) {
    try {
      const topicId = req.params.topicId;
      if (!mongoose.Types.ObjectId.isValid(topicId)) {
        const error = new Error('Invalid topicId format.');
        error.code = 'VALIDATION_ERROR';
        error.statusCode = 400;
        throw error;
      }

      const evalTime = parseEvaluationTimestamp(req);
      const result = await learningStateService.rebuildTopicLearningState(req.user._id, topicId, {
        evaluationTime: evalTime,
      });

      return res.status(200).json({
        success: true,
        data: result,
        meta: {
          requestId: req.id || 'unknown',
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

export default learningStateController;
