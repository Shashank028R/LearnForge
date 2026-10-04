import mongoose from 'mongoose';
import crypto from 'crypto';

const uuidv4 = () => crypto.randomUUID();
import { NoteDocument } from '../../models/NoteDocument.js';
import { NoteVersion } from '../../models/NoteVersion.js';
import { NoteProposal } from '../../models/NoteProposal.js';
import { Subject } from '../../models/Subject.js';
import { Topic } from '../../models/Topic.js';
import { SyllabusVersion } from '../../models/SyllabusVersion.js';
import { Concept } from '../../models/Concept.js';
import { LearningEvent } from '../../models/LearningEvent.js';
import { validateBlockContent } from '../../models/blocks/blockSchema.js';
import { classifyProposalRisk } from '../risk/riskClassifier.js';
import { AI_TASK_TYPES } from '../../ai/schemas/tasks.js';

/**
 * Notes Domain Service (Phase 07)
 * Authoritative service coordinating note persistence, immutable versioning,
 * optimistic concurrency, AI synthesis, and risk-based merge approval.
 */
export class NotesService {
  constructor(aiGateway = null) {
    this.aiGateway = aiGateway;
  }

  /**
   * Helper to normalize raw block inputs into valid typed blocks
   */
  normalizeBlocks(blocks = [], defaultOrigin = 'user') {
    if (!Array.isArray(blocks)) {
      throw new Error('Blocks must be an array');
    }

    return blocks.map((b, idx) => {
      const id = b.id || uuidv4();
      const type = b.type;
      const content = b.content;
      const order = typeof b.order === 'number' ? b.order : idx;
      const origin = ['user', 'ai', 'system'].includes(b.origin) ? b.origin : defaultOrigin;
      const metadata = b.metadata || {
        conceptAttributions: b.conceptAttributions || [],
        lastModifiedAt: new Date(),
      };

      const validation = validateBlockContent(type, content);
      if (!validation.isValid) {
        const valErr = new Error(`Block ${idx} (${type}) validation failed: ${validation.reason}`);
        valErr.code = 'INVALID_BLOCK_SCHEMA';
        valErr.status = 400;
        throw valErr;
      }

      return {
        id,
        type,
        content,
        order,
        origin,
        metadata,
      };
    });
  }

  /**
   * Lists user's NoteDocuments with populated currentVersion
   */
  async getNotesList(params) {
    const { userId, subjectId, limit = 50, page = 1 } = params;
    const query = { userId };
    if (subjectId && mongoose.Types.ObjectId.isValid(subjectId)) {
      query.subjectId = subjectId;
    }

    const skip = (Math.max(1, page) - 1) * Math.min(100, limit);
    const notes = await NoteDocument.find(query)
      .populate('currentVersionId')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(Math.min(100, limit))
      .lean();

    const total = await NoteDocument.countDocuments(query);

    return {
      notes,
      total,
      page,
      limit,
    };
  }

  /**
   * Read-only retrieval of a topic's canonical NoteDocument (returns null if not initialized)
   */
  async getTopicNote(params) {
    const { userId, topicId } = params;
    return NoteDocument.findOne({ userId, topicId }).populate('currentVersionId').lean();
  }

  /**
   * Retrieves a NoteDocument by ID with populated currentVersion
   */
  async getNoteById(params) {
    const { userId, noteId } = params;
    return NoteDocument.findOne({ _id: noteId, userId }).populate('currentVersionId').lean();
  }

  /**
   * Lists historical versions of a NoteDocument
   */
  async getNoteVersions(params) {
    const { userId, noteId, page = 1, limit = 20 } = params;

    const noteDoc = await NoteDocument.findOne({ _id: noteId, userId });
    if (!noteDoc) {
      const err = new Error(`Note ${noteId} not found or unauthorized.`);
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const skip = (Math.max(1, page) - 1) * Math.min(50, limit);
    const versions = await NoteVersion.find({ noteDocumentId: noteId, userId })
      .sort({ version: -1 })
      .skip(skip)
      .limit(Math.min(50, limit))
      .lean();

    const total = await NoteVersion.countDocuments({ noteDocumentId: noteId, userId });

    return {
      versions,
      total,
      page,
      limit,
      currentVersionId: noteDoc.currentVersionId,
      currentVersionNumber: noteDoc.currentVersionNumber,
    };
  }

  /**
   * Retrieves a specific historical version
   */
  async getNoteVersion(params) {
    const { userId, noteId, versionNumber } = params;

    const noteDoc = await NoteDocument.findOne({ _id: noteId, userId });
    if (!noteDoc) {
      const err = new Error(`Note ${noteId} not found or unauthorized.`);
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const versionDoc = await NoteVersion.findOne({
      noteDocumentId: noteId,
      userId,
      version: versionNumber,
    }).lean();

    if (!versionDoc) {
      const err = new Error(`Note version ${versionNumber} not found.`);
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    return {
      ...versionDoc,
      isCurrentVersion: noteDoc.currentVersionId.toString() === versionDoc._id.toString(),
    };
  }

  /**
   * Creates the initial NoteDocument and NoteVersion v1 atomically
   */
  async createInitialTopicNote(params) {
    const {
      userId,
      topicId,
      title,
      blocks = [],
      changeSummary = 'Initial note creation',
      provenance = {},
    } = params;

    // 1. Verify Topic ownership and retrieve Subject
    const topic = await Topic.findOne({ _id: topicId, userId });
    if (!topic) {
      const err = new Error(`Topic ${topicId} not found or unauthorized.`);
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const subject = await Subject.findOne({ _id: topic.subjectId, userId });
    if (!subject) {
      const err = new Error(`Subject ${topic.subjectId} not found or unauthorized.`);
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const normalizedBlocks = this.normalizeBlocks(blocks, 'user');
    const noteTitle = title?.trim() || topic.title || 'Untitled Note';

    // 2. Atomic Multi-Document Transaction
    let session = null;
    try {
      session = await mongoose.startSession();
      session.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
    } catch (sessionErr) {
      if (session) {
        try {
          await session.endSession();
        } catch (_) {}
      }
      const txError = new Error(
        'Note persistence requires MongoDB multi-document transaction support (MongoDB Atlas or replica set).'
      );
      txError.code = 'TRANSACTION_UNAVAILABLE';
      txError.status = 503;
      throw txError;
    }

    try {
      // Check if note already exists for this topic within session
      const existingNote = await NoteDocument.findOne({ userId, topicId }).session(session);
      if (existingNote) {
        await session.abortTransaction();
        const existingPopulated = await NoteDocument.findById(existingNote._id).populate('currentVersionId');
        return {
          note: existingPopulated,
          alreadyExisted: true,
        };
      }

      const noteDocId = new mongoose.Types.ObjectId();
      const versionDocId = new mongoose.Types.ObjectId();

      const noteVersion = new NoteVersion({
        _id: versionDocId,
        noteDocumentId: noteDocId,
        userId,
        subjectId: subject._id,
        topicId: topic._id,
        version: 1,
        parentVersionId: null,
        blocks: normalizedBlocks,
        sourceType: 'initial_creation',
        changeSummary,
        provenance: {
          conceptIds: provenance.conceptIds || [],
          learningEventIds: provenance.learningEventIds || [],
          syllabusVersionId: provenance.syllabusVersionId || null,
          syllabusVersion: provenance.syllabusVersion || null,
          aiMetadata: provenance.aiMetadata || {},
        },
        createdBy: userId,
      });

      await noteVersion.save({ session });

      const noteDoc = new NoteDocument({
        _id: noteDocId,
        userId,
        subjectId: subject._id,
        topicId: topic._id,
        title: noteTitle,
        currentVersionNumber: 1,
        currentVersionId: versionDocId,
        status: 'published',
        metadata: {
          blockCount: normalizedBlocks.length,
          totalWordCount: normalizedBlocks.reduce((acc, b) => acc + JSON.stringify(b.content).length, 0),
          conceptAttributionCount: (provenance.conceptIds || []).length,
          lastSynthesizedAt: new Date(),
        },
      });

      await noteDoc.save({ session });

      await session.commitTransaction();

      const resultNote = noteDoc.toObject();
      resultNote.currentVersionId = noteVersion.toObject();

      return {
        note: resultNote,
        createdVersion: noteVersion.toObject(),
        alreadyExisted: false,
      };
    } catch (err) {
      try {
        await session.abortTransaction();
      } catch (_) {}

      // Handle concurrent creation race on unique { userId: 1, topicId: 1 }
      const isDuplicateKey =
        err.code === 11000 ||
        err.codeName === 'DuplicateKey' ||
        /E11000|duplicate key/i.test(err.message || '');

      if (isDuplicateKey) {
        const existingNote = await NoteDocument.findOne({ userId, topicId }).populate('currentVersionId');
        if (existingNote) {
          return {
            note: existingNote.toObject(),
            alreadyExisted: true,
          };
        }
      }

      throw err;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Submits a manual note revision with optimistic concurrency protection
   */
  async createManualRevision(params) {
    const {
      userId,
      noteId,
      baseVersion,
      title,
      blocks = [],
      changeSummary = 'Manual note edit',
    } = params;

    if (typeof baseVersion !== 'number') {
      const err = new Error('baseVersion number is required for optimistic concurrency verification.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      throw err;
    }

    const normalizedBlocks = this.normalizeBlocks(blocks, 'user');

    let session = null;
    try {
      session = await mongoose.startSession();
      session.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
    } catch (sessionErr) {
      if (session) {
        try {
          await session.endSession();
        } catch (_) {}
      }
      const txError = new Error(
        'Note persistence requires MongoDB multi-document transaction support (MongoDB Atlas or replica set).'
      );
      txError.code = 'TRANSACTION_UNAVAILABLE';
      txError.status = 503;
      throw txError;
    }

    try {
      const noteDoc = await NoteDocument.findOne({ _id: noteId, userId }).session(session);
      if (!noteDoc) {
        const err = new Error(`Note ${noteId} not found or unauthorized.`);
        err.code = 'NOT_FOUND';
        err.status = 404;
        throw err;
      }

      // Optimistic Concurrency Check: Verify baseVersion matches current version
      if (noteDoc.currentVersionNumber !== baseVersion) {
        const conflictErr = new Error(
          `Stale update rejected: your base version (v${baseVersion}) does not match current note version (v${noteDoc.currentVersionNumber}).`
        );
        conflictErr.code = 'STALE_BASE_VERSION';
        conflictErr.status = 409;
        throw conflictErr;
      }

      const newVersionNumber = baseVersion + 1;
      const versionDocId = new mongoose.Types.ObjectId();

      const newNoteVersion = new NoteVersion({
        _id: versionDocId,
        noteDocumentId: noteDoc._id,
        userId,
        subjectId: noteDoc.subjectId,
        topicId: noteDoc.topicId,
        version: newVersionNumber,
        parentVersionId: noteDoc.currentVersionId,
        blocks: normalizedBlocks,
        sourceType: 'manual_edit',
        changeSummary,
        provenance: {
          conceptIds: [],
          learningEventIds: [],
          syllabusVersionId: null,
          syllabusVersion: null,
          aiMetadata: {},
        },
        createdBy: userId,
      });

      await newNoteVersion.save({ session });

      if (title && title.trim()) {
        noteDoc.title = title.trim();
      }
      noteDoc.currentVersionNumber = newVersionNumber;
      noteDoc.currentVersionId = versionDocId;
      noteDoc.metadata = {
        blockCount: normalizedBlocks.length,
        totalWordCount: normalizedBlocks.reduce((acc, b) => acc + JSON.stringify(b.content).length, 0),
        conceptAttributionCount: noteDoc.metadata?.conceptAttributionCount || 0,
        lastSynthesizedAt: noteDoc.metadata?.lastSynthesizedAt || null,
      };

      await noteDoc.save({ session });

      await session.commitTransaction();

      const resultNote = noteDoc.toObject();
      resultNote.currentVersionId = newNoteVersion.toObject();

      return {
        note: resultNote,
        version: newNoteVersion.toObject(),
      };
    } catch (err) {
      try {
        await session.abortTransaction();
      } catch (_) {}

      // Map unique version index collision or write conflict to domain error 409
      const isVersionConflict =
        err.code === 11000 ||
        err.code === 112 ||
        err.codeName === 'DuplicateKey' ||
        err.codeName === 'WriteConflict' ||
        /E11000|duplicate key|WriteConflict/i.test(err.message || '');

      if (isVersionConflict && err.code !== 'STALE_BASE_VERSION') {
        const conflictErr = new Error(
          'Concurrent version collision: another update was committed simultaneously. Please refresh and retry.'
        );
        conflictErr.code = 'STALE_BASE_VERSION';
        conflictErr.status = 409;
        throw conflictErr;
      }

      throw err;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Restores an older historical version as a brand-new immutable NoteVersion
   */
  async restoreVersion(params) {
    const { userId, noteId, targetVersionNumber, baseVersion } = params;

    if (typeof baseVersion !== 'number') {
      const err = new Error('baseVersion number is required for optimistic concurrency verification.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      throw err;
    }

    let session = null;
    try {
      session = await mongoose.startSession();
      session.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
    } catch (sessionErr) {
      if (session) {
        try {
          await session.endSession();
        } catch (_) {}
      }
      const txError = new Error(
        'Note persistence requires MongoDB multi-document transaction support (MongoDB Atlas or replica set).'
      );
      txError.code = 'TRANSACTION_UNAVAILABLE';
      txError.status = 503;
      throw txError;
    }

    try {
      const noteDoc = await NoteDocument.findOne({ _id: noteId, userId }).session(session);
      if (!noteDoc) {
        const err = new Error(`Note ${noteId} not found or unauthorized.`);
        err.code = 'NOT_FOUND';
        err.status = 404;
        throw err;
      }

      if (noteDoc.currentVersionNumber !== baseVersion) {
        const conflictErr = new Error(
          `Stale update rejected: your base version (v${baseVersion}) does not match current note version (v${noteDoc.currentVersionNumber}).`
        );
        conflictErr.code = 'STALE_BASE_VERSION';
        conflictErr.status = 409;
        throw conflictErr;
      }

      const targetVersion = await NoteVersion.findOne({
        noteDocumentId: noteId,
        userId,
        version: targetVersionNumber,
      }).session(session);

      if (!targetVersion) {
        const err = new Error(`Historical version v${targetVersionNumber} not found.`);
        err.code = 'NOT_FOUND';
        err.status = 404;
        throw err;
      }

      const newVersionNumber = baseVersion + 1;
      const versionDocId = new mongoose.Types.ObjectId();

      // Brand-new NoteVersion containing a copy of historical blocks (historical record is never mutated)
      const restoredVersion = new NoteVersion({
        _id: versionDocId,
        noteDocumentId: noteDoc._id,
        userId,
        subjectId: noteDoc.subjectId,
        topicId: noteDoc.topicId,
        version: newVersionNumber,
        parentVersionId: noteDoc.currentVersionId,
        blocks: targetVersion.blocks,
        sourceType: 'version_restore',
        changeSummary: `Restored content from historical version v${targetVersionNumber}`,
        provenance: targetVersion.provenance || {},
        createdBy: userId,
      });

      await restoredVersion.save({ session });

      noteDoc.currentVersionNumber = newVersionNumber;
      noteDoc.currentVersionId = versionDocId;
      noteDoc.metadata = {
        blockCount: targetVersion.blocks?.length || 0,
        totalWordCount: (targetVersion.blocks || []).reduce((acc, b) => acc + JSON.stringify(b.content).length, 0),
        conceptAttributionCount: noteDoc.metadata?.conceptAttributionCount || 0,
        lastSynthesizedAt: noteDoc.metadata?.lastSynthesizedAt || null,
      };

      await noteDoc.save({ session });

      await session.commitTransaction();

      const resultNote = noteDoc.toObject();
      resultNote.currentVersionId = restoredVersion.toObject();

      return {
        note: resultNote,
        restoredVersion: restoredVersion.toObject(),
        fromVersion: targetVersionNumber,
      };
    } catch (err) {
      try {
        await session.abortTransaction();
      } catch (_) {}

      const isVersionConflict =
        err.code === 11000 ||
        err.code === 112 ||
        err.codeName === 'DuplicateKey' ||
        err.codeName === 'WriteConflict' ||
        /E11000|duplicate key|WriteConflict/i.test(err.message || '');

      if (isVersionConflict && err.code !== 'STALE_BASE_VERSION') {
        const conflictErr = new Error(
          'Concurrent version collision: another update was committed simultaneously. Please refresh and retry.'
        );
        conflictErr.code = 'STALE_BASE_VERSION';
        conflictErr.status = 409;
        throw conflictErr;
      }

      throw err;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Synthesizes an AI note proposal from canonical knowledge facts (Phase 06 outputs)
   */
  async synthesizeNoteProposal(params) {
    const { userId, topicId, customInstructions, requestId = 'unknown' } = params;

    // 1. Authoritative Context Gathering
    const topic = await Topic.findOne({ _id: topicId, userId });
    if (!topic) {
      const err = new Error(`Topic ${topicId} not found or unauthorized.`);
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const subject = await Subject.findOne({ _id: topic.subjectId, userId });
    if (!subject) {
      const err = new Error(`Subject ${topic.subjectId} not found or unauthorized.`);
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const approvedSyllabus = await SyllabusVersion.findOne({
      subjectId: subject._id,
      userId,
      status: 'approved',
    });

    const canonicalConcepts = await Concept.find({ userId, topicId }).sort({ confidenceScore: -1 });
    const learningEvents = await LearningEvent.find({ userId, topicId }).sort({ createdAt: -1 }).limit(20);

    const conflictedConcepts = canonicalConcepts.filter((c) => c.conflictState?.hasConflict);
    const existingNote = await NoteDocument.findOne({ userId, topicId }).populate('currentVersionId');

    const currentBlocks = existingNote?.currentVersionId?.blocks || [];
    const baseVersion = existingNote ? existingNote.currentVersionNumber : 0;
    const baseVersionId = existingNote ? existingNote.currentVersionId._id : new mongoose.Types.ObjectId();

    // 2. Prepare Context Payload for AI Gateway
    const conceptSummaries = canonicalConcepts.map((c) => ({
      name: c.name,
      status: c.status,
      confidenceScore: c.confidenceScore,
      evidenceCount: c.evidenceCount,
      activeMisconceptions: (c.misconceptions || []).filter((m) => m.isActive).map((m) => m.misconceptionText),
      hasConflict: Boolean(c.conflictState?.hasConflict),
    }));

    const eventSummaries = learningEvents.map((e) => ({
      eventType: e.eventType,
      outcome: e.classificationOutcome,
      evidenceText: e.evidenceText,
    }));

    const subjectContext = {
      name: subject.title || subject.name,
      description: subject.description,
      targetMasteryLevel: subject.targetMasteryLevel,
    };

    const syllabusContext = approvedSyllabus
      ? {
          version: approvedSyllabus.version,
          title: approvedSyllabus.title,
          sections: approvedSyllabus.sections,
        }
      : null;

    const topicContext = {
      title: topic.title,
      description: topic.description,
    };

    let aiResult = null;
    let proposedBlocks = [];
    let changeSummary = 'Synthesized from canonical concepts and validated learning events';
    let aiMetadata = {
      provider: 'deterministic',
      model: 'none',
      task: AI_TASK_TYPES.NOTE_SYNTHESIS,
      requestId,
      latencyMs: 0,
    };

    // 3. Invoke AI Gateway if configured
    if (this.aiGateway) {
      try {
        const userPrompt = `Synthesize a structured study note for topic "${topic.title}".
Canonical Concepts:
${JSON.stringify(conceptSummaries, null, 2)}

Recent Validated Learning Observations:
${JSON.stringify(eventSummaries, null, 2)}

${customInstructions ? `Special Instructions: ${customInstructions}` : ''}`;

        aiResult = await this.aiGateway.generate({
          task: AI_TASK_TYPES.NOTE_SYNTHESIS,
          messages: [{ role: 'user', content: userPrompt }],
          subjectContext,
          syllabusContext,
          topicContext,
          userId,
          requestId,
        });

        if (aiResult?.text) {
          aiMetadata = {
            provider: aiResult.provider,
            model: aiResult.model,
            task: aiResult.task || AI_TASK_TYPES.NOTE_SYNTHESIS,
            requestId: aiResult.requestId || requestId,
            latencyMs: aiResult.latencyMs || 0,
          };

          const rawText = aiResult.text.trim();
          let jsonStr = rawText;
          const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (fenceMatch) {
            jsonStr = fenceMatch[1].trim();
          }

          const parsed = JSON.parse(jsonStr);
          if (parsed.changeSummary) changeSummary = parsed.changeSummary;
          if (Array.isArray(parsed.blocks)) {
            proposedBlocks = this.normalizeBlocks(parsed.blocks, 'ai');
          }
        }
      } catch (aiErr) {
        // Fallback to deterministic synthesis if AI is unavailable or produces invalid JSON
        proposedBlocks = [];
      }
    }

    // 4. Deterministic Rule-Based Fallback if AI produced no blocks
    if (proposedBlocks.length === 0) {
      proposedBlocks = this._buildDeterministicBlocks({
        topic,
        canonicalConcepts,
        learningEvents,
      });
      changeSummary = 'Deterministic factual note synthesis from canonical topic concepts';
    }

    // 5. Evaluate Risk Classification and Block Diff
    const risk = classifyProposalRisk({
      currentBlocks,
      proposedBlocks,
      conflictedConcepts,
    });

    const proposalDoc = new NoteProposal({
      noteDocumentId: existingNote ? existingNote._id : new mongoose.Types.ObjectId(),
      userId,
      subjectId: subject._id,
      topicId: topic._id,
      baseVersion: Math.max(1, baseVersion),
      baseVersionId: baseVersionId,
      proposedBlocks,
      diff: risk.diff,
      riskAssessment: {
        riskLevel: risk.riskLevel,
        reasons: risk.reasons,
        hasUserAuthoredConflicts: risk.hasUserAuthoredConflicts,
        protectedBlockIds: risk.protectedBlockIds,
        requiresApproval: risk.requiresApproval,
      },
      provenance: {
        conceptIds: canonicalConcepts.map((c) => c._id),
        learningEventIds: learningEvents.map((e) => e._id),
        syllabusVersionId: approvedSyllabus ? approvedSyllabus._id : null,
        syllabusVersion: approvedSyllabus ? approvedSyllabus.version : null,
        aiMetadata,
      },
      status: 'pending',
      changeSummary,
    });

    // If there was no existing NoteDocument, we create it when the proposal is approved
    if (existingNote) {
      proposalDoc.noteDocumentId = existingNote._id;
    }

    await proposalDoc.save();

    return {
      proposal: proposalDoc.toObject(),
      existingNote: existingNote ? existingNote.toObject() : null,
      riskLevel: risk.riskLevel,
      requiresApproval: risk.requiresApproval,
    };
  }

  /**
   * Deterministic fallback block builder from canonical concepts
   */
  _buildDeterministicBlocks({ topic, canonicalConcepts, learningEvents }) {
    const blocks = [];

    // Title / Intro
    blocks.push({
      id: uuidv4(),
      type: 'heading',
      content: { level: 1, text: `${topic.title} — Overview` },
      order: 0,
      origin: 'ai',
      metadata: { conceptAttributions: [], lastModifiedAt: new Date() },
    });

    if (topic.description) {
      blocks.push({
        id: uuidv4(),
        type: 'paragraph',
        content: { text: topic.description },
        order: 1,
        origin: 'ai',
        metadata: { conceptAttributions: [], lastModifiedAt: new Date() },
      });
    }

    // Core Concepts
    if (canonicalConcepts.length > 0) {
      blocks.push({
        id: uuidv4(),
        type: 'heading',
        content: { level: 2, text: 'Key Concepts & Definitions' },
        order: 2,
        origin: 'ai',
        metadata: { conceptAttributions: [], lastModifiedAt: new Date() },
      });

      canonicalConcepts.forEach((concept, idx) => {
        blocks.push({
          id: uuidv4(),
          type: 'paragraph',
          content: {
            text: `**${concept.name}** (Status: ${concept.status}, Confidence: ${concept.confidenceScore}%): ${concept.description || 'Core pedagogical concept.'}`,
          },
          order: 3 + idx * 2,
          origin: 'ai',
          metadata: { conceptAttributions: [concept.name], lastModifiedAt: new Date() },
        });

        // Add callouts for misconceptions or active corrections
        const activeMisconceptions = (concept.misconceptions || []).filter((m) => m.isActive);
        if (activeMisconceptions.length > 0) {
          blocks.push({
            id: uuidv4(),
            type: 'callout',
            content: {
              variant: 'warning',
              title: `Misconception Alert: ${concept.name}`,
              text: activeMisconceptions.map((m) => m.misconceptionText).join('; '),
            },
            order: 4 + idx * 2,
            origin: 'ai',
            metadata: { conceptAttributions: [concept.name], lastModifiedAt: new Date() },
          });
        }
      });
    }

    return blocks;
  }

  /**
   * Approves a NoteProposal and commits a new immutable NoteVersion atomically
   */
  async approveProposal(params) {
    const { userId, noteId, proposalId, baseVersion } = params;

    let session = null;
    try {
      session = await mongoose.startSession();
      session.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
    } catch (sessionErr) {
      if (session) {
        try {
          await session.endSession();
        } catch (_) {}
      }
      const txError = new Error(
        'Note persistence requires MongoDB multi-document transaction support (MongoDB Atlas or replica set).'
      );
      txError.code = 'TRANSACTION_UNAVAILABLE';
      txError.status = 503;
      throw txError;
    }

    try {
      const proposal = await NoteProposal.findOne({ _id: proposalId, userId }).session(session);
      if (!proposal) {
        const err = new Error(`Proposal ${proposalId} not found or unauthorized.`);
        err.code = 'NOT_FOUND';
        err.status = 404;
        throw err;
      }

      if (proposal.status !== 'pending') {
        const err = new Error(`Cannot approve proposal in '${proposal.status}' state.`);
        err.code = 'INVALID_PROPOSAL_STATUS';
        err.status = 400;
        throw err;
      }

      let noteDoc = null;
      if (noteId && mongoose.Types.ObjectId.isValid(noteId)) {
        noteDoc = await NoteDocument.findOne({ _id: noteId, userId }).session(session);
      } else if (proposal.noteDocumentId) {
        noteDoc = await NoteDocument.findOne({ _id: proposal.noteDocumentId, userId }).session(session);
      }

      // If note exists, verify baseVersion matches currentVersionId
      if (noteDoc) {
        if (!proposal.baseVersionId.equals(noteDoc.currentVersionId)) {
          const conflictErr = new Error(
            `Stale proposal rejected: proposal base version does not match current note version (v${noteDoc.currentVersionNumber}).`
          );
          conflictErr.code = 'STALE_PROPOSAL_BASE';
          conflictErr.status = 409;
          throw conflictErr;
        }

        if (typeof baseVersion === 'number' && noteDoc.currentVersionNumber !== baseVersion) {
          const conflictErr = new Error(
            `Stale update rejected: requested base version (v${baseVersion}) does not match current note version (v${noteDoc.currentVersionNumber}).`
          );
          conflictErr.code = 'STALE_PROPOSAL_BASE';
          conflictErr.status = 409;
          throw conflictErr;
        }

        const newVersionNumber = noteDoc.currentVersionNumber + 1;
        const versionDocId = new mongoose.Types.ObjectId();

        const newNoteVersion = new NoteVersion({
          _id: versionDocId,
          noteDocumentId: noteDoc._id,
          userId,
          subjectId: noteDoc.subjectId,
          topicId: noteDoc.topicId,
          version: newVersionNumber,
          parentVersionId: noteDoc.currentVersionId,
          blocks: proposal.proposedBlocks,
          sourceType: 'ai_merge_proposal',
          changeSummary: proposal.changeSummary,
          provenance: proposal.provenance || {},
          createdBy: userId,
        });

        await newNoteVersion.save({ session });

        noteDoc.currentVersionNumber = newVersionNumber;
        noteDoc.currentVersionId = versionDocId;
        noteDoc.metadata = {
          blockCount: proposal.proposedBlocks.length,
          totalWordCount: proposal.proposedBlocks.reduce((acc, b) => acc + JSON.stringify(b.content).length, 0),
          conceptAttributionCount: (proposal.provenance?.conceptIds || []).length,
          lastSynthesizedAt: new Date(),
        };

        await noteDoc.save({ session });

        proposal.status = 'approved';
        proposal.reviewedAt = new Date();
        await proposal.save({ session });

        await session.commitTransaction();

        const resultNote = noteDoc.toObject();
        resultNote.currentVersionId = newNoteVersion.toObject();

        return {
          note: resultNote,
          version: newNoteVersion.toObject(),
          proposal: proposal.toObject(),
        };
      } else {
        // Initial NoteDocument creation through proposal approval
        const topic = await Topic.findOne({ _id: proposal.topicId, userId }).session(session);
        const noteDocId = new mongoose.Types.ObjectId();
        const versionDocId = new mongoose.Types.ObjectId();

        const initialVersion = new NoteVersion({
          _id: versionDocId,
          noteDocumentId: noteDocId,
          userId,
          subjectId: proposal.subjectId,
          topicId: proposal.topicId,
          version: 1,
          parentVersionId: null,
          blocks: proposal.proposedBlocks,
          sourceType: 'ai_synthesis',
          changeSummary: proposal.changeSummary,
          provenance: proposal.provenance || {},
          createdBy: userId,
        });

        await initialVersion.save({ session });

        const newNoteDoc = new NoteDocument({
          _id: noteDocId,
          userId,
          subjectId: proposal.subjectId,
          topicId: proposal.topicId,
          title: topic ? topic.title : 'Synthesized Study Note',
          currentVersionNumber: 1,
          currentVersionId: versionDocId,
          status: 'published',
          metadata: {
            blockCount: proposal.proposedBlocks.length,
            totalWordCount: proposal.proposedBlocks.reduce((acc, b) => acc + JSON.stringify(b.content).length, 0),
            conceptAttributionCount: (proposal.provenance?.conceptIds || []).length,
            lastSynthesizedAt: new Date(),
          },
        });

        await newNoteDoc.save({ session });

        proposal.noteDocumentId = noteDocId;
        proposal.status = 'approved';
        proposal.reviewedAt = new Date();
        await proposal.save({ session });

        await session.commitTransaction();

        const resultNote = newNoteDoc.toObject();
        resultNote.currentVersionId = initialVersion.toObject();

        return {
          note: resultNote,
          version: initialVersion.toObject(),
          proposal: proposal.toObject(),
        };
      }
    } catch (err) {
      try {
        await session.abortTransaction();
      } catch (_) {}

      const isVersionConflict =
        err.code === 11000 ||
        err.code === 112 ||
        err.codeName === 'DuplicateKey' ||
        err.codeName === 'WriteConflict' ||
        /E11000|duplicate key|WriteConflict/i.test(err.message || '');

      if (isVersionConflict && err.code !== 'STALE_PROPOSAL_BASE') {
        const conflictErr = new Error(
          'Concurrent version collision: another update was committed simultaneously. Please refresh and retry.'
        );
        conflictErr.code = 'STALE_PROPOSAL_BASE';
        conflictErr.status = 409;
        throw conflictErr;
      }

      throw err;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Rejects a NoteProposal
   */
  async rejectProposal(params) {
    const { userId, proposalId, reason } = params;

    const proposal = await NoteProposal.findOne({ _id: proposalId, userId });
    if (!proposal) {
      const err = new Error(`Proposal ${proposalId} not found or unauthorized.`);
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (proposal.status !== 'pending') {
      const err = new Error(`Cannot reject proposal in '${proposal.status}' state.`);
      err.code = 'INVALID_PROPOSAL_STATUS';
      err.status = 400;
      throw err;
    }

    proposal.status = 'rejected';
    proposal.reviewedAt = new Date();
    if (reason) {
      proposal.riskAssessment.reasons.push(`Rejection reason: ${reason}`);
    }

    await proposal.save();

    return {
      proposal: proposal.toObject(),
    };
  }

  /**
   * Lists proposals for a note
   */
  async getNoteProposals(params) {
    const { userId, noteId, status, page = 1, limit = 20 } = params;

    const query = { userId };
    if (noteId && mongoose.Types.ObjectId.isValid(noteId)) {
      query.noteDocumentId = noteId;
    }
    if (status && ['pending', 'approved', 'rejected', 'expired'].includes(status)) {
      query.status = status;
    }

    const skip = (Math.max(1, page) - 1) * Math.min(50, limit);
    const proposals = await NoteProposal.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Math.min(50, limit))
      .lean();

    const total = await NoteProposal.countDocuments(query);

    return {
      proposals,
      total,
      page,
      limit,
    };
  }

  /**
   * Retrieves a specific proposal with block diff and risk assessment
   */
  async getProposalById(params) {
    const { userId, proposalId } = params;
    return NoteProposal.findOne({ _id: proposalId, userId }).lean();
  }
}

export const notesService = new NotesService();
