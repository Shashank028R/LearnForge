import mongoose from 'mongoose';
import { Annotation } from '../models/Annotation.js';
import { Chat } from '../models/Chat.js';
import { Message } from '../models/Message.js';

/**
 * GET /api/v1/chats/:chatId/messages/:messageId/annotations
 * List all annotations for a specific message
 */
export async function listAnnotations(req, res, next) {
  try {
    const { chatId, messageId } = req.params;
    if (!mongoose.isValidObjectId(chatId) || !mongoose.isValidObjectId(messageId)) {
      return res.status(404).json({ success: false, message: 'Message or chat not found' });
    }

    const chat = await Chat.findOne({ _id: chatId, userId: req.user._id });
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    const message = await Message.findOne({ _id: messageId, chatId, userId: req.user._id });
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const annotations = await Annotation.find({
      userId: req.user._id,
      chatId,
      messageId,
    }).sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      data: annotations,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/chats/:chatId/messages/:messageId/annotations
 * Create a comment or tag annotation for a message
 */
export async function createAnnotation(req, res, next) {
  try {
    const { chatId, messageId } = req.params;
    if (!mongoose.isValidObjectId(chatId) || !mongoose.isValidObjectId(messageId)) {
      return res.status(404).json({ success: false, message: 'Message or chat not found' });
    }

    const chat = await Chat.findOne({ _id: chatId, userId: req.user._id });
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    const message = await Message.findOne({ _id: messageId, chatId, userId: req.user._id });
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const { type, content } = req.body;

    if (!type || !['comment', 'tag'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Valid annotation type (comment or tag) is required',
      });
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Annotation content is required and cannot be empty',
      });
    }

    if (content.trim().length > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Annotation content cannot exceed 1000 characters',
      });
    }

    const annotation = await Annotation.create({
      userId: req.user._id,
      chatId,
      messageId,
      type,
      content: content.trim(),
    });

    return res.status(201).json({
      success: true,
      data: annotation,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/annotations/:annotationId
 * Update an existing user annotation
 */
export async function updateAnnotation(req, res, next) {
  try {
    const { annotationId } = req.params;
    if (!mongoose.isValidObjectId(annotationId)) {
      return res.status(404).json({ success: false, message: 'Annotation not found' });
    }

    const annotation = await Annotation.findOne({
      _id: annotationId,
      userId: req.user._id,
    });

    if (!annotation) {
      return res.status(404).json({ success: false, message: 'Annotation not found' });
    }

    const { content, type } = req.body;

    if (type && ['comment', 'tag'].includes(type)) {
      annotation.type = type;
    }

    if (content !== undefined) {
      if (typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Annotation content cannot be empty',
        });
      }
      if (content.trim().length > 1000) {
        return res.status(400).json({
          success: false,
          message: 'Annotation content cannot exceed 1000 characters',
        });
      }
      annotation.content = content.trim();
    }

    await annotation.save();

    return res.status(200).json({
      success: true,
      data: annotation,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/annotations/:annotationId
 * Delete a user annotation
 */
export async function deleteAnnotation(req, res, next) {
  try {
    const { annotationId } = req.params;
    if (!mongoose.isValidObjectId(annotationId)) {
      return res.status(404).json({ success: false, message: 'Annotation not found' });
    }

    const annotation = await Annotation.findOneAndDelete({
      _id: annotationId,
      userId: req.user._id,
    });

    if (!annotation) {
      return res.status(404).json({ success: false, message: 'Annotation not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Annotation deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}
