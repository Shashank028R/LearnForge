import express from 'express';
import {
  getSyllabusStatus,
  listSyllabusVersions,
  createSyllabusDraft,
  getSyllabusVersion,
  updateSyllabusDraft,
  approveSyllabusVersion,
} from '../controllers/syllabusController.js';
import { authenticateUser } from '../middleware/auth.js';
import { requireDatabase } from '../middleware/databaseCheck.js';

const router = express.Router();

// Enforce database connectivity and authentication on all syllabus routes
router.use('/subjects/:subjectId/syllabus', requireDatabase, authenticateUser);

// Syllabus Lifecycle & Version Endpoints
router.get('/subjects/:subjectId/syllabus', getSyllabusStatus);
router.get('/subjects/:subjectId/syllabus/versions', listSyllabusVersions);
router.post('/subjects/:subjectId/syllabus/versions', createSyllabusDraft);
router.get('/subjects/:subjectId/syllabus/versions/:versionId', getSyllabusVersion);
router.put('/subjects/:subjectId/syllabus/versions/:versionId', updateSyllabusDraft);
router.patch('/subjects/:subjectId/syllabus/versions/:versionId', updateSyllabusDraft);
router.post('/subjects/:subjectId/syllabus/versions/:versionId/approve', approveSyllabusVersion);

export default router;
