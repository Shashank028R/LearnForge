import express from 'express';
import {
  listTopicsForSubject,
  createTopic,
  getTopic,
  updateTopic,
  deleteTopic,
} from '../controllers/topicController.js';
import { authenticateUser } from '../middleware/auth.js';
import { requireDatabase } from '../middleware/databaseCheck.js';

const router = express.Router();

// Enforce database connectivity and authentication on all topic routes
router.use('/topics', requireDatabase, authenticateUser);

// Topic Collection Operations
router.get('/topics', listTopicsForSubject);
router.post('/topics', createTopic);

// Topic Direct Item Operations
router.get('/topics/:topicId', getTopic);
router.put('/topics/:topicId', updateTopic);
router.delete('/topics/:topicId', deleteTopic);

export default router;
