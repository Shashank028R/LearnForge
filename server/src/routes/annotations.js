import express from 'express';
import {
  listAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
} from '../controllers/annotationController.js';
import { authenticateUser } from '../middleware/auth.js';
import { requireDatabase } from '../middleware/databaseCheck.js';

const router = express.Router();

// Enforce database connectivity and authentication on message annotations
router.use('/chats/:chatId/messages/:messageId/annotations', requireDatabase, authenticateUser);
router.use('/annotations', requireDatabase, authenticateUser);

// List and create annotations for message
router.get('/chats/:chatId/messages/:messageId/annotations', listAnnotations);
router.post('/chats/:chatId/messages/:messageId/annotations', createAnnotation);

// Update and delete single annotation
router.patch('/annotations/:annotationId', updateAnnotation);
router.put('/annotations/:annotationId', updateAnnotation);
router.delete('/annotations/:annotationId', deleteAnnotation);

export default router;
