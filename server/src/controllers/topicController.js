import mongoose from 'mongoose';
import { Topic } from '../models/Topic.js';
import { Subject } from '../models/Subject.js';
import { Chat } from '../models/Chat.js';
import { Message } from '../models/Message.js';
import { Annotation } from '../models/Annotation.js';

function sanitizeTopic(topic) {
  return {
    id: topic._id,
    _id: topic._id,
    subjectId: topic.subjectId,
    title: topic.title,
    description: topic.description,
    orderIndex: topic.orderIndex,
    status: topic.status,
    isActiveInSyllabus: topic.isActiveInSyllabus !== undefined ? topic.isActiveInSyllabus : true,
    knowledgeState: {
      masteryScore: topic.knowledgeState?.masteryScore || 0,
      keyConcepts: topic.knowledgeState?.keyConcepts || [],
      summary: topic.knowledgeState?.summary || '',
      lastStudiedAt: topic.knowledgeState?.lastStudiedAt || null,
    },
    notesCount: topic.notesCount || 0,
    chatsCount: topic.chatsCount || 0,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
  };
}

/**
 * GET /api/v1/subjects/:subjectId/topics
 * Lists all topics within an owned subject, ordered sequentially.
 */
export async function listTopicsForSubject(req, res, next) {
  try {
    const subjectId = req.params.subjectId || req.query.subjectId;

    if (!subjectId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Subject identifier is required.',
          details: [{ field: 'subjectId', issue: 'required' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(subjectId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid subject identifier.',
          details: [{ field: 'subjectId', issue: 'invalid_object_id' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    // Verify parent subject ownership
    const subject = await Subject.findOne({ _id: subjectId, userId: req.user._id });
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Subject not found.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    const topics = await Topic.find({
      subjectId: subject._id,
      userId: req.user._id,
    }).sort({ orderIndex: 1, createdAt: 1 });

    return res.status(200).json({
      success: true,
      data: {
        topics: topics.map(sanitizeTopic),
        subject: {
          id: subject._id,
          name: subject.name,
          color: subject.color,
        },
      },
      meta: {
        total: topics.length,
        requestId: req.id || 'unknown',
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/subjects/:subjectId/topics
 * Creates a new topic inside an owned subject.
 */
export async function createTopic(req, res, next) {
  try {
    const subjectId = req.params.subjectId || req.body.subjectId;

    if (!subjectId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Subject identifier is required.',
          details: [{ field: 'subjectId', issue: 'required' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(subjectId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid subject identifier.',
          details: [{ field: 'subjectId', issue: 'invalid_object_id' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    // Enforce ownership of parent subject
    const subject = await Subject.findOne({ _id: subjectId, userId: req.user._id });
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Subject not found.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    const {
      title,
      description = '',
      orderIndex,
      status = 'not_started',
      keyConcepts = [],
      summary = '',
    } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Topic title is required.',
          details: [{ field: 'title', issue: 'required' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    const trimmedTitle = title.trim();
    if (trimmedTitle.length > 160) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Topic title cannot exceed 160 characters.',
          details: [{ field: 'title', issue: 'max_length_exceeded' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    if (typeof description !== 'string' || description.length > 1000) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Topic description cannot exceed 1000 characters.',
          details: [{ field: 'description', issue: 'max_length_exceeded' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    const validStatuses = ['not_started', 'in_progress', 'mastered'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid topic status.',
          details: [{ field: 'status', issue: 'invalid_enum' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    const normalizedTitle = trimmedTitle.toLowerCase();

    // Check duplicate topic title in this subject
    const existingTopic = await Topic.findOne({
      subjectId: subject._id,
      normalizedTitle,
    });
    if (existingTopic) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'A topic with this title already exists in this subject.',
          details: [{ field: 'title', issue: 'duplicate_entry' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    // Determine order index if not specified
    let targetOrderIndex = typeof orderIndex === 'number' ? orderIndex : 0;
    if (orderIndex === undefined) {
      const highestOrder = await Topic.findOne({ subjectId: subject._id }).sort({ orderIndex: -1 });
      targetOrderIndex = highestOrder ? highestOrder.orderIndex + 1 : 0;
    }

    const sanitizedConcepts = Array.isArray(keyConcepts)
      ? keyConcepts
          .filter((c) => typeof c === 'string' && c.trim().length > 0)
          .map((c) => c.trim().toLowerCase())
          .slice(0, 30)
      : [];

    const topic = await Topic.create({
      subjectId: subject._id,
      userId: req.user._id,
      title: trimmedTitle,
      normalizedTitle,
      description: description.trim(),
      orderIndex: targetOrderIndex,
      status,
      isActiveInSyllabus: false,
      knowledgeState: {
        masteryScore: 0,
        keyConcepts: sanitizedConcepts,
        summary: typeof summary === 'string' ? summary.trim() : '',
        lastStudiedAt: null,
      },
    });

    // Reconcile Subject.topicsCount to strictly reflect active syllabus topics count
    const activeCount = await Topic.countDocuments({
      subjectId: subject._id,
      userId: req.user._id,
      isActiveInSyllabus: true,
    });
    if (subject.topicsCount !== activeCount) {
      subject.topicsCount = activeCount;
      await subject.save();
    }

    return res.status(201).json({
      success: true,
      data: {
        topic: sanitizeTopic(topic),
      },
      meta: {
        requestId: req.id || 'unknown',
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'A topic with this title already exists in this subject.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }
    next(error);
  }
}

/**
 * GET /api/v1/topics/:topicId
 * Retrieves a single topic owned by the authenticated user.
 */
export async function getTopic(req, res, next) {
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
          message: 'Topic not found.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    // Reconcile chats counter on read
    const actualChatsCount = await Chat.countDocuments({ topicId: topic._id, userId: req.user._id });
    if (topic.chatsCount !== actualChatsCount) {
      topic.chatsCount = actualChatsCount;
      await topic.save();
    }

    return res.status(200).json({
      success: true,
      data: {
        topic: sanitizeTopic(topic),
      },
      meta: {
        requestId: req.id || 'unknown',
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/v1/topics/:topicId
 * Updates an owned topic.
 */
export async function updateTopic(req, res, next) {
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
          message: 'Topic not found.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    const {
      title,
      description,
      orderIndex,
      status,
      summary,
      keyConcepts,
      masteryScore,
      lastStudiedAt,
    } = req.body;

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Topic title cannot be empty.',
            details: [{ field: 'title', issue: 'required' }],
          },
          requestId: req.id || 'unknown',
        });
      }

      const trimmedTitle = title.trim();
      if (trimmedTitle.length > 160) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Topic title cannot exceed 160 characters.',
            details: [{ field: 'title', issue: 'max_length_exceeded' }],
          },
          requestId: req.id || 'unknown',
        });
      }

      const normalized = trimmedTitle.toLowerCase();
      if (normalized !== topic.normalizedTitle) {
        const existing = await Topic.findOne({
          subjectId: topic.subjectId,
          normalizedTitle: normalized,
          _id: { $ne: topic._id },
        });
        if (existing) {
          return res.status(409).json({
            success: false,
            error: {
              code: 'CONFLICT',
              message: 'A topic with this title already exists in this subject.',
              details: [{ field: 'title', issue: 'duplicate_entry' }],
            },
            requestId: req.id || 'unknown',
          });
        }
        topic.title = trimmedTitle;
        topic.normalizedTitle = normalized;
      }
    }

    if (description !== undefined) {
      if (typeof description !== 'string' || description.length > 1000) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Description cannot exceed 1000 characters.',
            details: [{ field: 'description', issue: 'max_length_exceeded' }],
          },
          requestId: req.id || 'unknown',
        });
      }
      topic.description = description.trim();
    }

    if (orderIndex !== undefined && typeof orderIndex === 'number') {
      topic.orderIndex = orderIndex;
    }

    if (status !== undefined) {
      if (!['not_started', 'in_progress', 'mastered'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid status.',
            details: [{ field: 'status', issue: 'invalid_enum' }],
          },
          requestId: req.id || 'unknown',
        });
      }
      topic.status = status;
    }

    // Knowledge state updates
    if (!topic.knowledgeState) {
      topic.knowledgeState = {};
    }

    if (summary !== undefined && typeof summary === 'string') {
      topic.knowledgeState.summary = summary.trim();
    }

    if (keyConcepts !== undefined && Array.isArray(keyConcepts)) {
      topic.knowledgeState.keyConcepts = keyConcepts
        .filter((c) => typeof c === 'string' && c.trim().length > 0)
        .map((c) => c.trim().toLowerCase())
        .slice(0, 30);
    }

    if (masteryScore !== undefined && typeof masteryScore === 'number') {
      topic.knowledgeState.masteryScore = Math.max(0, Math.min(100, Math.round(masteryScore)));
    }

    if (lastStudiedAt !== undefined) {
      topic.knowledgeState.lastStudiedAt = lastStudiedAt ? new Date(lastStudiedAt) : null;
    }

    await topic.save();

    return res.status(200).json({
      success: true,
      data: {
        topic: sanitizeTopic(topic),
      },
      meta: {
        requestId: req.id || 'unknown',
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'A topic with this title already exists in this subject.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }
    next(error);
  }
}

/**
 * DELETE /api/v1/topics/:topicId
 * Deletes an owned topic and decrements the parent subject's topicsCount.
 */
export async function deleteTopic(req, res, next) {
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
          message: 'Topic not found.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    const subjectId = topic.subjectId;

    // Cascade delete any chats, messages, and annotations associated with this topic
    const topicChats = await Chat.find({
      topicId: topic._id,
      userId: req.user._id,
    });

    if (topicChats && topicChats.length > 0) {
      const chatIds = topicChats.map((c) => c._id);
      const topicMessages = await Message.find({
        chatId: { $in: chatIds },
        userId: req.user._id,
      });
      const messageIds = (topicMessages || []).map((m) => m._id);

      await Annotation.deleteMany({
        userId: req.user._id,
        $or: [{ chatId: { $in: chatIds } }, { messageId: { $in: messageIds } }],
      });

      await Message.deleteMany({ chatId: { $in: chatIds }, userId: req.user._id });
      await Chat.deleteMany({ _id: { $in: chatIds }, userId: req.user._id });
    }

    await Topic.deleteOne({ _id: topic._id });

    // Reconcile topicsCount on parent subject to strictly reflect active syllabus topics count
    const activeCount = await Topic.countDocuments({
      subjectId: subjectId,
      userId: req.user._id,
      isActiveInSyllabus: true,
    });
    await Subject.updateOne(
      { _id: subjectId, userId: req.user._id },
      { $set: { topicsCount: activeCount } }
    );

    return res.status(200).json({
      success: true,
      data: {
        message: 'Topic deleted successfully.',
        deletedTopicId: topicId,
      },
      meta: {
        requestId: req.id || 'unknown',
      },
    });
  } catch (error) {
    next(error);
  }
}
