import mongoose from 'mongoose';
import { Concept } from '../models/Concept.js';
import { LearningEvent } from '../models/LearningEvent.js';
import { Topic } from '../models/Topic.js';
import { Chat } from '../models/Chat.js';
import { Message } from '../models/Message.js';
import { knowledgeEngine } from '../knowledge/index.js';

/**
 * Knowledge Controller (Phase 06)
 * Read and inspection APIs for Concepts and Learning Events with strict tenant isolation.
 */

export function formatConceptResponse(concept) {
  if (!concept) return null;
  return {
    id: concept._id.toString(),
    subjectId: concept.subjectId.toString(),
    topicId: concept.topicId.toString(),
    name: concept.name,
    normalizedName: concept.normalizedName,
    aliases: concept.aliases || [],
    description: concept.description || '',
    status: concept.status,
    confidenceScore: concept.confidenceScore || 0,
    evidenceCount: concept.evidenceCount || 0,
    misconceptions: (concept.misconceptions || []).map((m) => ({
      id: m._id ? m._id.toString() : undefined,
      misconceptionText: m.misconceptionText,
      correctionText: m.correctionText,
      detectedAt: m.detectedAt,
      resolvedAt: m.resolvedAt,
      isActive: m.isActive,
    })),
    conflictState: concept.conflictState || { hasConflict: false },
    lastStudiedAt: concept.lastStudiedAt,
    createdAt: concept.createdAt,
    updatedAt: concept.updatedAt,
  };
}

export function formatLearningEventResponse(event) {
  if (!event) return null;
  return {
    id: event._id.toString(),
    subjectId: event.subjectId.toString(),
    topicId: event.topicId.toString(),
    chatId: event.chatId.toString(),
    sourceMessageId: event.sourceMessageId.toString(),
    conceptId: event.conceptId ? event.conceptId.toString() : null,
    conceptName: event.conceptName,
    eventType: event.eventType,
    classificationOutcome: event.classificationOutcome,
    evidenceText: event.evidenceText,
    confidenceScore: event.confidenceScore,
    previousStatus: event.previousStatus,
    newStatus: event.newStatus,
    misconception: event.misconception || {},
    idempotencyKey: event.idempotencyKey,
    metadata: event.metadata || {},
    createdAt: event.createdAt,
  };
}

/**
 * GET /api/v1/topics/:topicId/concepts
 * Lists canonical concepts for a topic owned by the authenticated user.
 */
export async function listTopicConcepts(req, res, next) {
  try {
    const { topicId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(topicId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid topic identifier.',
          details: [{ field: 'topicId', issue: 'invalid_object_id' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    const topic = await Topic.findOne({ _id: topicId, userId: req.user._id });
    if (!topic) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Topic not found or unauthorized.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    const concepts = await Concept.find({ userId: req.user._id, topicId })
      .sort({ confidenceScore: -1, createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        concepts: concepts.map(formatConceptResponse),
        topicKnowledgeState: topic.knowledgeState,
        topicStatus: topic.status,
      },
      meta: {
        requestId: req.id || 'unknown',
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/concepts/:conceptId
 * Retrieves a single concept and its chronological learning events.
 */
export async function getConceptDetails(req, res, next) {
  try {
    const { conceptId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(conceptId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid concept identifier.',
          details: [{ field: 'conceptId', issue: 'invalid_object_id' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    const concept = await Concept.findOne({ _id: conceptId, userId: req.user._id });
    if (!concept) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Concept not found or unauthorized.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    const learningEvents = await LearningEvent.find({
      userId: req.user._id,
      conceptId: concept._id,
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        concept: formatConceptResponse(concept),
        learningEvents: learningEvents.map(formatLearningEventResponse),
      },
      meta: {
        requestId: req.id || 'unknown',
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/topics/:topicId/learning-events
 * Lists chronological learning events for a topic owned by the authenticated user.
 */
export async function listTopicLearningEvents(req, res, next) {
  try {
    const { topicId } = req.params;
    const { limit = 50 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(topicId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid topic identifier.',
          details: [{ field: 'topicId', issue: 'invalid_object_id' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    const topic = await Topic.findOne({ _id: topicId, userId: req.user._id });
    if (!topic) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Topic not found or unauthorized.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    const events = await LearningEvent.find({ userId: req.user._id, topicId })
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        learningEvents: events.map(formatLearningEventResponse),
      },
      meta: {
        requestId: req.id || 'unknown',
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/topics/:topicId/extract-knowledge
 * Explicitly triggers knowledge extraction on an existing verified persisted message exchange.
 */
export async function triggerMessageExtraction(req, res, next) {
  try {
    const { topicId } = req.params;
    const { chatId, userMessageId, assistantMessageId } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(topicId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid topic identifier.',
          details: [{ field: 'topicId', issue: 'invalid_object_id' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Valid chatId is required.',
          details: [{ field: 'chatId', issue: 'invalid_or_missing' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    if (!userMessageId || !mongoose.Types.ObjectId.isValid(userMessageId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Valid userMessageId is required.',
          details: [{ field: 'userMessageId', issue: 'invalid_or_missing' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    if (!assistantMessageId || !mongoose.Types.ObjectId.isValid(assistantMessageId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Valid assistantMessageId is required.',
          details: [{ field: 'assistantMessageId', issue: 'invalid_or_missing' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    // 1. Verify Topic ownership
    const topic = await Topic.findOne({ _id: topicId, userId: req.user._id });
    if (!topic) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Topic not found or unauthorized.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    // 2. Verify Chat ownership and topic association
    const chat = await Chat.findOne({ _id: chatId, topicId: topic._id, userId: req.user._id });
    if (!chat) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Chat not found or does not belong to the requested topic.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    // 3. Load authoritative persisted User Message
    const userMessage = await Message.findOne({
      _id: userMessageId,
      chatId: chat._id,
      userId: req.user._id,
      role: 'user',
    });
    if (!userMessage) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_EVIDENCE',
          message: 'User message not found, unpersisted, or role mismatch.',
          details: [{ field: 'userMessageId', issue: 'message_not_found_or_invalid_role' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    // 4. Load authoritative persisted Assistant Message
    const assistantMessage = await Message.findOne({
      _id: assistantMessageId,
      chatId: chat._id,
      userId: req.user._id,
      role: 'assistant',
    });
    if (!assistantMessage) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_EVIDENCE',
          message: 'Assistant message not found, unpersisted, or role mismatch.',
          details: [{ field: 'assistantMessageId', issue: 'message_not_found_or_invalid_role' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    // 5. Invoke Knowledge Engine with persisted database Message entities
    const testBarrierKey =
      process.env.NODE_ENV !== 'production'
        ? (req.headers['x-test-sync-barrier'] || req.body?.testBarrierKey || null)
        : null;

    const result = await knowledgeEngine.processExchangeEvidence({
      userId: req.user._id,
      subjectId: topic.subjectId,
      topicId: topic._id,
      chatId: chat._id,
      sourceMessageId: assistantMessage._id,
      userMessage,
      assistantMessage,
      requestId: req.id || 'unknown',
      testBarrierKey,
    });

    return res.status(200).json({
      success: true,
      data: result,
      meta: {
        requestId: req.id || 'unknown',
      },
    });
  } catch (err) {
    next(err);
  }
}
