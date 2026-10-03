import express from 'express';
import {
  listSubjects,
  createSubject,
  getSubject,
  updateSubject,
  deleteSubject,
} from '../controllers/subjectController.js';
import {
  listTopicsForSubject,
  createTopic,
} from '../controllers/topicController.js';
import { authenticateUser } from '../middleware/auth.js';
import { requireDatabase } from '../middleware/databaseCheck.js';

const router = express.Router();

// Enforce database connectivity and authentication on all subject routes
router.use('/subjects', requireDatabase, authenticateUser);

// Subjects CRUD Endpoints
router.get('/subjects', listSubjects);
router.post('/subjects', createSubject);
router.get('/subjects/:subjectId', getSubject);
router.put('/subjects/:subjectId', updateSubject);
router.delete('/subjects/:subjectId', deleteSubject);

// Nested Topics within Subject Endpoints
router.get('/subjects/:subjectId/topics', listTopicsForSubject);
router.post('/subjects/:subjectId/topics', createTopic);

export default router;
