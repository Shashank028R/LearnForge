import express from 'express';
import { studyController } from '../controllers/studyController.js';
import { authenticateUser } from '../middleware/auth.js';
import { requireDatabase } from '../middleware/databaseCheck.js';

const router = express.Router();
const auth = [requireDatabase, authenticateUser];

// 1. Session Lifecycle & Initialization
router.post('/topics/:topicId/study/sessions', ...auth, studyController.createOrResumeSession);
router.get('/study-sessions', ...auth, studyController.listStudySessions);
router.get('/study-sessions/:id', ...auth, studyController.getStudySessionById);

// 2. Active Recall & Turn Progression
router.post('/study-sessions/:id/answer', ...auth, studyController.submitAnswer);
router.post('/study-sessions/:id/continue', ...auth, studyController.continueSession);

// 3. Control Operations
router.post('/study-sessions/:id/pause', ...auth, studyController.pauseSession);
router.post('/study-sessions/:id/resume', ...auth, studyController.resumeSession);
router.post('/study-sessions/:id/exit', ...auth, studyController.exitSession);

export default router;
