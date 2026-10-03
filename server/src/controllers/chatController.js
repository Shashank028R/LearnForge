import mongoose from 'mongoose';
import { Chat } from '../models/Chat.js';
import { Message } from '../models/Message.js';
import { Subject } from '../models/Subject.js';
import { Topic } from '../models/Topic.js';
import { Annotation } from '../models/Annotation.js';

/**
 * Formats a chat document for standard API response envelopes.
 */
function formatChatResponse(chat, subjectDoc = null, topicDoc = null) {
  const rawSubjectId = chat.subjectId && typeof chat.subjectId === 'object' && chat.subjectId._id
    ? chat.subjectId._id.toString()
    : chat.subjectId
    ? chat.subjectId.toString()
    : null;

  const rawTopicId = chat.topicId && typeof chat.topicId === 'object' && chat.topicId._id
    ? chat.topicId._id.toString()
    : chat.topicId
    ? chat.topicId.toString()
    : null;

  const formatted = {
    id: chat._id.toString(),
    _id: chat._id.toString(),
    userId: chat.userId.toString(),
    subjectId: rawSubjectId,
    topicId: rawTopicId,
    title: chat.title,
    status: chat.status,
    messagesCount: chat.messagesCount || 0,
    lastMessageAt: chat.lastMessageAt,
    metadata: chat.metadata || {},
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };

  if (subjectDoc) {
    formatted.subject = {
      id: subjectDoc._id.toString(),
      _id: subjectDoc._id.toString(),
      name: subjectDoc.name,
      color: subjectDoc.color,
    };
  }

  if (topicDoc) {
    formatted.topic = {
      id: topicDoc._id.toString(),
      _id: topicDoc._id.toString(),
      title: topicDoc.title,
      status: topicDoc.status,
      orderIndex: topicDoc.orderIndex,
    };
  }

  return formatted;
}

/**
 * Formats a message document for standard API response envelopes.
 */
function formatMessageResponse(message) {
  return {
    id: message._id.toString(),
    _id: message._id.toString(),
    chatId: message.chatId.toString(),
    userId: message.userId.toString(),
    role: message.role,
    content: message.content,
    sequenceIndex: message.sequenceIndex,
    status: message.status,
    metadata: message.metadata || {},
    knowledgeContext: message.knowledgeContext || {
      relevance: 'unclassified',
      subjectId: null,
      topicId: null,
      disposition: 'unclassified',
    },
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
}

/**
 * Generates an initial Socratic assistant prompt/response based on context.
 */
function generateAssistantPrompt(userContent, subjectName = null, topicTitle = null) {
  const contextPrefix = topicTitle
    ? `Regarding **${topicTitle}**${subjectName ? ` in *${subjectName}*` : ''}: `
    : subjectName
    ? `In **${subjectName}**: `
    : '';

  if (!userContent || userContent.trim().length === 0) {
    return `${contextPrefix}Welcome to this learning session. What core question or concept would you like to explore first?`;
  }

  return `${contextPrefix}That is an intriguing question. To break this down Socratically: what is the fundamental principle behind "${userContent.trim().slice(0, 60)}${userContent.trim().length > 60 ? '...' : ''}", and how does it relate to what you already understand?`;
}

/**
 * GET /api/v1/chats
 * Lists user's chats with optional filters (status, subjectId, topicId, search).
 */
export async function listChats(req, res, next) {
  try {
    const { status, subjectId, topicId, search, page = 1, limit = 20 } = req.query;

    const query = { userId: req.user._id };

    if (status) {
      if (!['active', 'archived'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: "Status must be either 'active' or 'archived'.",
            details: [{ field: 'status', issue: 'invalid_status_enum' }],
          },
          requestId: req.id || 'unknown',
        });
      }
      query.status = status;
    }

    if (subjectId) {
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
      query.subjectId = subjectId;
    }

    if (topicId) {
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
      query.topicId = topicId;
    }

    if (search && typeof search === 'string' && search.trim().length > 0) {
      const sanitizedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.title = { $regex: sanitizedSearch, $options: 'i' };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [chats, totalCount] = await Promise.all([
      Chat.find(query)
        .populate('subjectId', 'name color')
        .populate('topicId', 'title status orderIndex')
        .sort({ lastMessageAt: -1, updatedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Chat.countDocuments(query),
    ]);

    const formattedChats = chats.map((c) => {
      const subjectDoc = c.subjectId && typeof c.subjectId === 'object' ? c.subjectId : null;
      const topicDoc = c.topicId && typeof c.topicId === 'object' ? c.topicId : null;
      return formatChatResponse(c, subjectDoc, topicDoc);
    });

    return res.status(200).json({
      success: true,
      data: {
        chats: formattedChats,
        pagination: {
          total: totalCount,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(totalCount / limitNum) || 1,
        },
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
 * POST /api/v1/chats
 * Creates a new chat session for the authenticated user.
 */
export async function createChat(req, res, next) {
  try {
    const { title, subjectId, topicId, initialMessage, metadata } = req.body || {};

    let subjectDoc = null;
    let topicDoc = null;

    if (topicId) {
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

      topicDoc = await Topic.findOne({ _id: topicId, userId: req.user._id });
      if (!topicDoc) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Referenced topic not found or does not belong to your account.',
            details: [{ field: 'topicId', issue: 'topic_not_found' }],
          },
          requestId: req.id || 'unknown',
        });
      }

      // Auto-resolve or validate subjectId from topic
      subjectDoc = await Subject.findOne({ _id: topicDoc.subjectId, userId: req.user._id });
    } else if (subjectId) {
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

      subjectDoc = await Subject.findOne({ _id: subjectId, userId: req.user._id });
      if (!subjectDoc) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Referenced subject not found or does not belong to your account.',
            details: [{ field: 'subjectId', issue: 'subject_not_found' }],
          },
          requestId: req.id || 'unknown',
        });
      }
    }

    let chatTitle = (title && typeof title === 'string' && title.trim().length > 0)
      ? title.trim().slice(0, 200)
      : null;

    if (!chatTitle) {
      if (topicDoc) {
        chatTitle = `Study: ${topicDoc.title}`;
      } else if (subjectDoc) {
        chatTitle = `Explore: ${subjectDoc.name}`;
      } else if (initialMessage && typeof initialMessage === 'string' && initialMessage.trim().length > 0) {
        chatTitle = initialMessage.trim().slice(0, 60);
      } else {
        chatTitle = 'New Conversation';
      }
    }

    const chat = await Chat.create({
      userId: req.user._id,
      subjectId: subjectDoc ? subjectDoc._id : null,
      topicId: topicDoc ? topicDoc._id : null,
      title: chatTitle,
      status: 'active',
      messagesCount: 0,
      lastMessageAt: new Date(),
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
    });

    const messages = [];

    // Increment Topic.chatsCount if linked
    if (topicDoc) {
      await Topic.updateOne(
        { _id: topicDoc._id, userId: req.user._id },
        { $inc: { chatsCount: 1 } }
      );
    }

    // Process initial message if provided
    if (initialMessage && typeof initialMessage === 'string' && initialMessage.trim().length > 0) {
      const userMessage = await Message.create({
        chatId: chat._id,
        userId: req.user._id,
        role: 'user',
        content: initialMessage.trim(),
        sequenceIndex: 0,
        status: 'sent',
      });
      messages.push(formatMessageResponse(userMessage));

      const assistantContent = generateAssistantPrompt(
        initialMessage,
        subjectDoc?.name,
        topicDoc?.title
      );

      const assistantMessage = await Message.create({
        chatId: chat._id,
        userId: req.user._id,
        role: 'assistant',
        content: assistantContent,
        sequenceIndex: 1,
        status: 'sent',
        metadata: { engine: 'phase-04-socratic-preview' },
      });
      messages.push(formatMessageResponse(assistantMessage));

      chat.messagesCount = 2;
      chat.sequenceCounter = 2;
      chat.lastMessageAt = new Date();
      await chat.save();
    }

    return res.status(201).json({
      success: true,
      data: {
        chat: formatChatResponse(chat, subjectDoc, topicDoc),
        messages,
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
 * GET /api/v1/chats/:chatId
 * Gets single chat metadata and parent subject/topic context.
 */
export async function getChat(req, res, next) {
  try {
    const { chatId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid chat identifier.',
          details: [{ field: 'chatId', issue: 'invalid_object_id' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    const chat = await Chat.findOne({ _id: chatId, userId: req.user._id })
      .populate('subjectId', 'name color')
      .populate('topicId', 'title status orderIndex');

    if (!chat) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Conversation not found.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    // Reconcile message counter on single read
    const actualMessagesCount = await Message.countDocuments({
      chatId: chat._id,
      userId: req.user._id,
    });
    if (chat.messagesCount !== actualMessagesCount) {
      chat.messagesCount = actualMessagesCount;
      await chat.save();
    }

    const subjectDoc = chat.subjectId && typeof chat.subjectId === 'object' ? chat.subjectId : null;
    const topicDoc = chat.topicId && typeof chat.topicId === 'object' ? chat.topicId : null;

    return res.status(200).json({
      success: true,
      data: {
        chat: formatChatResponse(chat, subjectDoc, topicDoc),
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
 * PUT / PATCH /api/v1/chats/:chatId
 * Updates chat metadata (title, status, metadata) and safely reassigns subjectId/topicId.
 */
export async function updateChat(req, res, next) {
  try {
    const { chatId } = req.params;
    const { title, status, subjectId, topicId, metadata } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid chat identifier.',
          details: [{ field: 'chatId', issue: 'invalid_object_id' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    const chat = await Chat.findOne({ _id: chatId, userId: req.user._id });

    if (!chat) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Conversation not found.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Chat title cannot be empty.',
            details: [{ field: 'title', issue: 'title_required' }],
          },
          requestId: req.id || 'unknown',
        });
      }
      chat.title = title.trim().slice(0, 200);
    }

    if (status !== undefined) {
      if (!['active', 'archived'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: "Status must be either 'active' or 'archived'.",
            details: [{ field: 'status', issue: 'invalid_status_enum' }],
          },
          requestId: req.id || 'unknown',
        });
      }
      chat.status = status;
    }

    // Handle subjectId / topicId Reassignment
    let newSubjectId = chat.subjectId;
    let newTopicId = chat.topicId;
    let subjectChanged = false;

    if (subjectId !== undefined || topicId !== undefined) {
      let targetSubjectDoc = null;
      let targetTopicDoc = null;

      if (topicId !== undefined && topicId !== null && topicId !== '') {
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

        targetTopicDoc = await Topic.findOne({ _id: topicId, userId: req.user._id });
        if (!targetTopicDoc) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Referenced topic not found or does not belong to your account.',
              details: [{ field: 'topicId', issue: 'topic_not_found' }],
            },
            requestId: req.id || 'unknown',
          });
        }

        const topicSubjectIdStr = targetTopicDoc.subjectId ? targetTopicDoc.subjectId.toString() : null;

        if (subjectId !== undefined && subjectId !== null && subjectId !== '') {
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

          if (topicSubjectIdStr !== subjectId.toString()) {
            return res.status(400).json({
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Topic does not belong to the specified subject.',
                details: [{ field: 'topicId', issue: 'topic_subject_mismatch' }],
              },
              requestId: req.id || 'unknown',
            });
          }

          targetSubjectDoc = await Subject.findOne({ _id: subjectId, userId: req.user._id });
          if (!targetSubjectDoc) {
            return res.status(404).json({
              success: false,
              error: {
                code: 'NOT_FOUND',
                message: 'Referenced subject not found or does not belong to your account.',
                details: [{ field: 'subjectId', issue: 'subject_not_found' }],
              },
              requestId: req.id || 'unknown',
            });
          }
        } else {
          // Auto-resolve parent subject from topic
          targetSubjectDoc = await Subject.findOne({ _id: targetTopicDoc.subjectId, userId: req.user._id });
        }

        newTopicId = targetTopicDoc._id;
        newSubjectId = targetSubjectDoc ? targetSubjectDoc._id : null;
        subjectChanged = true;
      } else if (topicId === null || topicId === '') {
        // Explicitly clearing topic
        newTopicId = null;

        if (subjectId !== undefined) {
          if (subjectId !== null && subjectId !== '') {
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

            targetSubjectDoc = await Subject.findOne({ _id: subjectId, userId: req.user._id });
            if (!targetSubjectDoc) {
              return res.status(404).json({
                success: false,
                error: {
                  code: 'NOT_FOUND',
                  message: 'Referenced subject not found or does not belong to your account.',
                  details: [{ field: 'subjectId', issue: 'subject_not_found' }],
                },
                requestId: req.id || 'unknown',
              });
            }
            newSubjectId = targetSubjectDoc._id;
          } else {
            newSubjectId = null;
          }
          subjectChanged = true;
        }
      } else if (subjectId !== undefined) {
        // topicId was not provided, but subjectId was provided
        if (subjectId !== null && subjectId !== '') {
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

          targetSubjectDoc = await Subject.findOne({ _id: subjectId, userId: req.user._id });
          if (!targetSubjectDoc) {
            return res.status(404).json({
              success: false,
              error: {
                code: 'NOT_FOUND',
                message: 'Referenced subject not found or does not belong to your account.',
                details: [{ field: 'subjectId', issue: 'subject_not_found' }],
              },
              requestId: req.id || 'unknown',
            });
          }

          newSubjectId = targetSubjectDoc._id;
          subjectChanged = true;

          // If existing topic does not belong to new subject, detach topic
          if (chat.topicId) {
            const existingTopic = await Topic.findOne({ _id: chat.topicId, userId: req.user._id });
            if (existingTopic && existingTopic.subjectId.toString() !== subjectId.toString()) {
              newTopicId = null;
            }
          }
        } else {
          // Setting subject to null also clears topic
          newSubjectId = null;
          newTopicId = null;
          subjectChanged = true;
        }
      }

      // Reconcile Topic.chatsCount
      const oldTopicIdStr = chat.topicId ? chat.topicId.toString() : null;
      const newTopicIdStr = newTopicId ? newTopicId.toString() : null;

      if (oldTopicIdStr !== newTopicIdStr) {
        if (oldTopicIdStr) {
          await Topic.updateOne(
            { _id: oldTopicIdStr, userId: req.user._id, chatsCount: { $gt: 0 } },
            { $inc: { chatsCount: -1 } }
          );
        }
        if (newTopicIdStr) {
          await Topic.updateOne(
            { _id: newTopicIdStr, userId: req.user._id },
            { $inc: { chatsCount: 1 } }
          );
        }
        chat.topicId = newTopicId;
      }

      if (subjectChanged) {
        chat.subjectId = newSubjectId;
      }
    }

    if (metadata && typeof metadata === 'object') {
      chat.metadata = { ...chat.metadata, ...metadata };
    }

    await chat.save();

    const populatedChat = await Chat.findOne({ _id: chat._id, userId: req.user._id })
      .populate('subjectId', 'name color')
      .populate('topicId', 'title status orderIndex');

    const subjectDoc = populatedChat.subjectId && typeof populatedChat.subjectId === 'object' ? populatedChat.subjectId : null;
    const topicDoc = populatedChat.topicId && typeof populatedChat.topicId === 'object' ? populatedChat.topicId : null;

    return res.status(200).json({
      success: true,
      data: {
        chat: formatChatResponse(populatedChat, subjectDoc, topicDoc),
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
 * DELETE /api/v1/chats/:chatId
 * Deletes chat, cascade deletes child messages, and decrements Topic.chatsCount if linked.
 */
export async function deleteChat(req, res, next) {
  try {
    const { chatId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid chat identifier.',
          details: [{ field: 'chatId', issue: 'invalid_object_id' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    const chat = await Chat.findOne({ _id: chatId, userId: req.user._id });

    if (!chat) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Conversation not found.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    // Find message IDs for annotation cleanup
    const chatMessages = await Message.find({
       chatId: chat._id,
       userId: req.user._id,
    });
    const messageIds = (chatMessages || []).map((m) => m._id);

    // Clean up annotations attached to this chat or its messages
    await Annotation.deleteMany({
      userId: req.user._id,
      $or: [{ chatId: chat._id }, { messageId: { $in: messageIds } }],
    });

    // Cascade delete child messages
    const deleteMessagesResult = await Message.deleteMany({
      chatId: chat._id,
      userId: req.user._id,
    });

    await Chat.deleteOne({ _id: chat._id });

    // Decrement Topic.chatsCount if topic linked
    if (chat.topicId) {
      await Topic.updateOne(
        { _id: chat.topicId, userId: req.user._id, chatsCount: { $gt: 0 } },
        { $inc: { chatsCount: -1 } }
      );
    }

    return res.status(200).json({
      success: true,
      data: {
        message: 'Conversation and associated messages deleted successfully.',
        deletedChatId: chatId,
        cascadeDeletedMessagesCount: deleteMessagesResult.deletedCount || 0,
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
 * GET /api/v1/chats/:chatId/messages
 * Lists chronological messages for an owned chat.
 */
export async function listMessages(req, res, next) {
  try {
    const { chatId } = req.params;
    const { limit = 50, beforeSequence } = req.query;

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid chat identifier.',
          details: [{ field: 'chatId', issue: 'invalid_object_id' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    const chat = await Chat.findOne({ _id: chatId, userId: req.user._id });

    if (!chat) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Conversation not found.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    const query = { chatId: chat._id, userId: req.user._id };

    if (beforeSequence !== undefined && !isNaN(parseInt(beforeSequence, 10))) {
      query.sequenceIndex = { $lt: parseInt(beforeSequence, 10) };
    }

    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    const messages = await Message.find(query)
      .sort({ sequenceIndex: 1 })
      .limit(limitNum)
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        messages: messages.map(formatMessageResponse),
        chatId,
        total: chat.messagesCount,
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
 * POST /api/v1/chats/:chatId/messages
 * Appends a message to the chat and generates an assistant exchange.
 * Security Trust Boundary:
 * - Client messages MUST have role "user" (or omit role).
 * - "assistant" and "system" roles cannot be supplied by clients (returns 400).
 */
export async function sendMessage(req, res, next) {
  try {
    const { chatId } = req.params;
    const { content, role, metadata } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid chat identifier.',
          details: [{ field: 'chatId', issue: 'invalid_object_id' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    // Role Trust Boundary: Client messages must only be 'user'
    if (role !== undefined && role !== 'user') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Client messages must use role "user". Roles "assistant" and "system" cannot be created by clients.',
          details: [{ field: 'role', issue: 'invalid_client_role' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Message content cannot be empty.',
          details: [{ field: 'content', issue: 'content_required' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    if (content.trim().length > 20000) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Message content exceeds maximum allowed length (20,000 characters).',
          details: [{ field: 'content', issue: 'content_too_long' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    const chat = await Chat.findOne({ _id: chatId, userId: req.user._id })
      .populate('subjectId', 'name')
      .populate('topicId', 'title');

    if (!chat) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Conversation not found.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }

    const subjectName = chat.subjectId && typeof chat.subjectId === 'object' ? chat.subjectId.name : null;
    const topicTitle = chat.topicId && typeof chat.topicId === 'object' ? chat.topicId.title : null;

    // Phase 04 Deterministic Socratic Preview (NOT an external AI model integration)
    const assistantContent = generateAssistantPrompt(content.trim(), subjectName, topicTitle);

    const countToReserve = 2;
    let formattedUser = null;
    let formattedAssistant = null;
    const maxRetries = 5;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // 1. Atomically reserve sequence range on the Chat document
      const reservedChat = await Chat.findOneAndUpdate(
        { _id: chatId, userId: req.user._id },
        {
          $inc: { sequenceCounter: countToReserve, messagesCount: countToReserve },
          $set: {
            lastMessageAt: new Date(),
            ...(chat.title === 'New Conversation' && content.trim().length > 0
              ? { title: content.trim().slice(0, 60) }
              : {}),
          },
        },
        { new: false } // returns document state BEFORE atomic increment
      );

      if (!reservedChat) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Conversation not found.',
            details: [],
          },
          requestId: req.id || 'unknown',
        });
      }

      // If chat had sequenceCounter undefined, calculate base from existing messages count
      let baseSequenceIndex = typeof reservedChat.sequenceCounter === 'number'
        ? reservedChat.sequenceCounter
        : (reservedChat.messagesCount || 0);

      try {
        // 2. Insert user message and assistant preview message with reserved sequence numbers
        const userMessage = await Message.create({
          chatId: chat._id,
          userId: req.user._id,
          role: 'user',
          content: content.trim(),
          sequenceIndex: baseSequenceIndex,
          status: 'sent',
          metadata: metadata && typeof metadata === 'object' ? metadata : {},
        });

        const assistantMessage = await Message.create({
          chatId: chat._id,
          userId: req.user._id,
          role: 'assistant',
          content: assistantContent,
          sequenceIndex: baseSequenceIndex + 1,
          status: 'sent',
          metadata: { engine: 'phase-04-socratic-preview' },
        });

        formattedUser = formatMessageResponse(userMessage);
        formattedAssistant = formatMessageResponse(assistantMessage);
        break;
      } catch (err) {
        const isDuplicateKey =
          err.code === 11000 ||
          (err.writeErrors && err.writeErrors.some((e) => e.code === 11000));

        if (isDuplicateKey && attempt < maxRetries - 1) {
          // If collision occurred (e.g. sequence drift), reconcile counter and retry
          const lastMsg = await Message.findOne({ chatId: chat._id })
            .sort({ sequenceIndex: -1 })
            .lean();
          const nextMaxSeq = lastMsg ? lastMsg.sequenceIndex + 1 : 0;
          await Chat.updateOne(
            { _id: chat._id, userId: req.user._id },
            { $set: { sequenceCounter: nextMaxSeq }, $inc: { messagesCount: -countToReserve } }
          );
          await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }

    return res.status(201).json({
      success: true,
      data: {
        messages: [formattedUser, formattedAssistant],
        userMessage: formattedUser,
        assistantMessage: formattedAssistant,
      },
      meta: {
        requestId: req.id || 'unknown',
      },
    });
  } catch (error) {
    next(error);
  }
}
