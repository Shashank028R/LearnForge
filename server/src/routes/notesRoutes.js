import express from 'express';
import { notesController } from '../controllers/notesController.js';
import { authenticateUser } from '../middleware/auth.js';
import { requireDatabase } from '../middleware/databaseCheck.js';

const router = express.Router();

const auth = [requireDatabase, authenticateUser];

// 1. Topic-Anchored Note Endpoints
router.get('/topics/:topicId/note', ...auth, notesController.getTopicNote);
router.post('/topics/:topicId/note', ...auth, notesController.createInitialTopicNote);
router.post('/topics/:topicId/notes/synthesize', ...auth, notesController.synthesizeProposal);

// 2. Note Document Endpoints
router.get('/notes', ...auth, notesController.getNotesList);
router.get('/notes/:noteId', ...auth, notesController.getNoteById);
router.put('/notes/:noteId', ...auth, notesController.createManualRevision);

// 3. Version History & Restore Endpoints
router.get('/notes/:noteId/versions', ...auth, notesController.getNoteVersions);
router.get('/notes/:noteId/versions/:versionNumber', ...auth, notesController.getNoteVersion);
router.post('/notes/:noteId/versions/:versionNumber/restore', ...auth, notesController.restoreVersion);

// 4. Proposal Endpoints
router.get('/notes/:noteId/proposals', ...auth, notesController.getNoteProposals);
router.get('/notes/proposals/:proposalId', ...auth, notesController.getProposalById);
router.post('/notes/proposals/:proposalId/approve', ...auth, notesController.approveProposal);
router.post('/notes/proposals/:proposalId/reject', ...auth, notesController.rejectProposal);

export default router;
