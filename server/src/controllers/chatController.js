import mongoose from 'mongoose';
import { Chat } from '../models/Chat.js';
import { Message } from '../models/Message.js';
import { Subject } from '../models/Subject.js';
import { Topic } from '../models/Topic.js';

/**
 * Formats a chat document for standard API response envelopes.
 */
function formatChatResponse(chat, subjectDoc = null, topicDoc = null) {
  const formatted = {
    id: chat._id.toString(),
    _id: chat._id.toString(),
    userId: chat.userId.toString(),
    subjectId: chat.subjectId ? chat.subjectId.toString() : null,
    topicId: chat.topicId ? chat.topicId.toString() : null,
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
 * PUT /api/v1/chats/:chatId
 * Updates chat metadata (title, status).
 */
export async function updateChat(req, res, next) {
  try {
    const { chatId } = req.params;
    const { title, status, metadata } = req.body || {};

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

    if (metadata && typeof metadata === 'object') {
      chat.metadata = { ...chat.metadata, ...metadata };
    }

    await chat.save();

    await chat.populate('subjectId', 'name color');
    await chat.populate('topicId', 'title status orderIndex');

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
 */
export async function sendMessage(req, res, next) {
  try {
    const { chatId } = req.params;
    const { content, role = 'user', metadata } = req.body || {};

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

    // Determine current highest sequenceIndex
    const lastMessage = await Message.findOne({ chatId: chat._id })
      .sort({ sequenceIndex: -1 })
      .lean();

    const nextSequenceIndex = lastMessage ? lastMessage.sequenceIndex + 1 : 0;

    const userMessage = await Message.create({
      chatId: chat._id,
      userId: req.user._id,
      role: role === 'system' ? 'system' : 'user',
      content: content.trim(),
      sequenceIndex: nextSequenceIndex,
      status: 'sent',
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
    });

    const messages = [formatMessageResponse(userMessage)];

    // Generate assistant response if user message
    let addedCount = 1;
    if (userMessage.role === 'user') {
      const subjectName = chat.subjectId && typeof chat.subjectId === 'object' ? chat.subjectId.name : null;
      const topicTitle = chat.topicId && typeof chat.topicId === 'object' ? chat.topicId.title : null;

      const assistantContent = generateAssistantPrompt(userMessage.content, subjectName, topicTitle);

      const assistantMessage = await Message.create({
        chatId: chat._id,
        userId: req.user._id,
        role: 'assistant',
        content: assistantContent,
        sequenceIndex: nextSequenceIndex + 1,
        status: 'sent',
        metadata: { engine: 'phase-04-socratic-preview' },
      });

      messages.push(formatMessageResponse(assistantMessage));
      addedCount = 2;
    }

    // Auto-update title if initial generic title
    const updates = {
      lastMessageAt: new Date(),
      $inc: { messagesCount: addedCount },
    };

    if (chat.title === 'New Conversation' && userMessage.content.length > 0) {
      updates.title = userMessage.content.slice(0, 60);
    }

    await Chat.updateOne({ _id: chat._id }, updates);

    return res.status(201).json({
      success: true,
      data: {
        messages,
        userMessage: messages[0],
        assistantMessage: messages[1] || null,
      },
      meta: {
        requestId: req.id || 'unknown',
      },
    });
  } catch (error) {
    next(error);
  }
}
