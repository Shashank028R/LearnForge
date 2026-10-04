import mongoose from 'mongoose';
import { notesService } from '../notes/services/notesService.js';
import { aiGateway } from '../ai/gateway/aiGateway.js';

// Instantiate domain service with AI gateway
const activeNotesService = new notesService.constructor(aiGateway);

/**
 * Controller handling Phase 07 Structured Notes API endpoints
 */
export const notesController = {
  /**
   * GET /api/v1/notes
   * Lists user's NoteDocuments with pagination & filtering
   */
  async getNotesList(req, res, next) {
    try {
      const userId = req.user._id;
      const { subjectId, page, limit } = req.query;

      const result = await activeNotesService.getNotesList({
        userId,
        subjectId,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 50,
      });

      res.status(200).json({
        success: true,
        data: result.notes,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/topics/:topicId/note
   * Read-only retrieval of canonical topic note. Returns 404 if no note exists yet.
   */
  async getTopicNote(req, res, next) {
    try {
      const userId = req.user._id;
      const { topicId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(topicId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid topicId parameter.',
          },
        });
      }

      const note = await activeNotesService.getTopicNote({ userId, topicId });
      if (!note) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOTE_NOT_FOUND',
            message: `No structured note exists for topic ${topicId}.`,
          },
        });
      }

      res.status(200).json({
        success: true,
        data: note,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/topics/:topicId/note
   * Creates initial topic NoteDocument and NoteVersion v1
   */
  async createInitialTopicNote(req, res, next) {
    try {
      const userId = req.user._id;
      const { topicId } = req.params;
      const { title, blocks, changeSummary, provenance } = req.body;

      if (!mongoose.Types.ObjectId.isValid(topicId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid topicId parameter.',
          },
        });
      }

      const result = await activeNotesService.createInitialTopicNote({
        userId,
        topicId,
        title,
        blocks,
        changeSummary,
        provenance,
      });

      const statusCode = result.alreadyExisted ? 200 : 201;
      res.status(statusCode).json({
        success: true,
        data: result.note,
        alreadyExisted: result.alreadyExisted,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/notes/:noteId
   * Retrieves single note by ID
   */
  async getNoteById(req, res, next) {
    try {
      const userId = req.user._id;
      const { noteId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(noteId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid noteId parameter.',
          },
        });
      }

      const note = await activeNotesService.getNoteById({ userId, noteId });
      if (!note) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Note ${noteId} not found or unauthorized.`,
          },
        });
      }

      res.status(200).json({
        success: true,
        data: note,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /api/v1/notes/:noteId
   * Creates manual revision with optimistic concurrency protection
   */
  async createManualRevision(req, res, next) {
    try {
      const userId = req.user._id;
      const { noteId } = req.params;
      const { baseVersion, title, blocks, changeSummary } = req.body;

      if (!mongoose.Types.ObjectId.isValid(noteId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid noteId parameter.',
          },
        });
      }

      if (typeof baseVersion !== 'number') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'baseVersion is required and must be a number.',
          },
        });
      }

      const result = await activeNotesService.createManualRevision({
        userId,
        noteId,
        baseVersion,
        title,
        blocks,
        changeSummary,
      });

      res.status(200).json({
        success: true,
        data: result.note,
        version: result.version,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/notes/:noteId/versions
   * Lists historical versions of a note
   */
  async getNoteVersions(req, res, next) {
    try {
      const userId = req.user._id;
      const { noteId } = req.params;
      const { page, limit } = req.query;

      if (!mongoose.Types.ObjectId.isValid(noteId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid noteId parameter.',
          },
        });
      }

      const result = await activeNotesService.getNoteVersions({
        userId,
        noteId,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
      });

      res.status(200).json({
        success: true,
        data: result.versions,
        currentVersionId: result.currentVersionId,
        currentVersionNumber: result.currentVersionNumber,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/notes/:noteId/versions/:versionNumber
   * Retrieves a specific version snapshot
   */
  async getNoteVersion(req, res, next) {
    try {
      const userId = req.user._id;
      const { noteId, versionNumber } = req.params;

      if (!mongoose.Types.ObjectId.isValid(noteId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid noteId parameter.',
          },
        });
      }

      const versionNum = parseInt(versionNumber, 10);
      if (isNaN(versionNum) || versionNum < 1) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'versionNumber must be a positive integer.',
          },
        });
      }

      const version = await activeNotesService.getNoteVersion({
        userId,
        noteId,
        versionNumber: versionNum,
      });

      res.status(200).json({
        success: true,
        data: version,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/notes/:noteId/versions/:versionNumber/restore
   * Restores historical version by appending a new NoteVersion
   */
  async restoreVersion(req, res, next) {
    try {
      const userId = req.user._id;
      const { noteId, versionNumber } = req.params;
      const { baseVersion } = req.body;

      if (!mongoose.Types.ObjectId.isValid(noteId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid noteId parameter.',
          },
        });
      }

      const versionNum = parseInt(versionNumber, 10);
      if (isNaN(versionNum) || versionNum < 1) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'versionNumber must be a positive integer.',
          },
        });
      }

      if (typeof baseVersion !== 'number') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'baseVersion is required and must be a number.',
          },
        });
      }

      const result = await activeNotesService.restoreVersion({
        userId,
        noteId,
        targetVersionNumber: versionNum,
        baseVersion,
      });

      res.status(200).json({
        success: true,
        data: result.note,
        restoredVersion: result.restoredVersion,
        fromVersion: result.fromVersion,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/topics/:topicId/notes/synthesize
   * Triggers AI note synthesis proposal from canonical concepts
   */
  async synthesizeProposal(req, res, next) {
    try {
      const userId = req.user._id;
      const { topicId } = req.params;
      const { customInstructions } = req.body;
      const requestId = req.correlationId || req.headers['x-request-id'] || 'notes-synth';

      if (!mongoose.Types.ObjectId.isValid(topicId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid topicId parameter.',
          },
        });
      }

      const result = await activeNotesService.synthesizeNoteProposal({
        userId,
        topicId,
        customInstructions,
        requestId,
      });

      res.status(201).json({
        success: true,
        data: result.proposal,
        riskLevel: result.riskLevel,
        requiresApproval: result.requiresApproval,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/notes/:noteId/proposals
   * Lists proposals for a note
   */
  async getNoteProposals(req, res, next) {
    try {
      const userId = req.user._id;
      const { noteId } = req.params;
      const { status, page, limit } = req.query;

      if (noteId && !mongoose.Types.ObjectId.isValid(noteId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid noteId parameter.',
          },
        });
      }

      const result = await activeNotesService.getNoteProposals({
        userId,
        noteId,
        status,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
      });

      res.status(200).json({
        success: true,
        data: result.proposals,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/notes/proposals/:proposalId
   * Retrieves proposal details with diff & risk assessment
   */
  async getProposalById(req, res, next) {
    try {
      const userId = req.user._id;
      const { proposalId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(proposalId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid proposalId parameter.',
          },
        });
      }

      const proposal = await activeNotesService.getProposalById({ userId, proposalId });
      if (!proposal) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Proposal ${proposalId} not found or unauthorized.`,
          },
        });
      }

      res.status(200).json({
        success: true,
        data: proposal,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/notes/proposals/:proposalId/approve
   * Approves note proposal and commits a new NoteVersion
   */
  async approveProposal(req, res, next) {
    try {
      const userId = req.user._id;
      const { proposalId } = req.params;
      const { baseVersion } = req.body;

      if (!mongoose.Types.ObjectId.isValid(proposalId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid proposalId parameter.',
          },
        });
      }

      const result = await activeNotesService.approveProposal({
        userId,
        proposalId,
        baseVersion,
      });

      res.status(200).json({
        success: true,
        data: result.note,
        version: result.version,
        proposal: result.proposal,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/notes/proposals/:proposalId/reject
   * Rejects note proposal
   */
  async rejectProposal(req, res, next) {
    try {
      const userId = req.user._id;
      const { proposalId } = req.params;
      const { reason } = req.body;

      if (!mongoose.Types.ObjectId.isValid(proposalId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid proposalId parameter.',
          },
        });
      }

      const result = await activeNotesService.rejectProposal({
        userId,
        proposalId,
        reason,
      });

      res.status(200).json({
        success: true,
        data: result.proposal,
      });
    } catch (err) {
      next(err);
    }
  },
};
