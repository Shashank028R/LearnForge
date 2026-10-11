import express from 'express';
import { learningStateController } from '../controllers/learningStateController.js';
import { authenticateUser } from '../middleware/auth.js';
import { requireDatabase } from '../middleware/databaseCheck.js';
import { rebuildRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();
const auth = [requireDatabase, authenticateUser];

// 1. Concept-Level Read
router.get('/learning-state/concepts/:conceptId', ...auth, learningStateController.getConceptLearningState);

// 2. Topic-Level Aggregation & Breakdown
router.get('/learning-state/topics/:topicId', ...auth, learningStateController.getTopicLearningSummary);

// 3. Subject-Level Rollup & Hierarchy
router.get('/learning-state/subjects/:subjectId', ...auth, learningStateController.getSubjectLearningSummary);

// 4. Globally Transitive Study Prioritization
router.get('/learning-state/priorities', ...auth, learningStateController.getLearningPriorities);
router.get('/learning-state/subjects/:subjectId/priorities', ...auth, (req, res, next) => {
  req.query.subjectId = req.params.subjectId;
  return learningStateController.getLearningPriorities(req, res, next);
});

// 5. Multi-Topic Closure Fenced Rebuild
router.post('/learning-state/rebuild/:topicId', ...auth, rebuildRateLimiter, learningStateController.rebuildTopic);
router.post('/learning-state/topics/:topicId/rebuild', ...auth, rebuildRateLimiter, learningStateController.rebuildTopic);

export default router;
