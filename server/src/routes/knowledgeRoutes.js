import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { requireDatabase } from '../middleware/databaseCheck.js';
import {
  listTopicConcepts,
  getConceptDetails,
  listTopicLearningEvents,
  triggerMessageExtraction,
} from '../controllers/knowledgeController.js';

const router = express.Router();

// Topic concepts and learning events
router.get('/topics/:topicId/concepts', requireDatabase, authenticateUser, listTopicConcepts);
router.get('/topics/:topicId/learning-events', requireDatabase, authenticateUser, listTopicLearningEvents);
router.post('/topics/:topicId/extract-knowledge', requireDatabase, authenticateUser, triggerMessageExtraction);

// Individual concept inspection
router.get('/concepts/:conceptId', requireDatabase, authenticateUser, getConceptDetails);

export default router;
