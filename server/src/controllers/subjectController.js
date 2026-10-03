import mongoose from 'mongoose';
import { Subject } from '../models/Subject.js';
import { Topic } from '../models/Topic.js';
import { Chat } from '../models/Chat.js';
import { Message } from '../models/Message.js';

export const VALID_MASTERY_LEVELS = ['beginner', 'intermediate', 'advanced', 'comprehensive'];

function sanitizeSubject(subject) {
  return {
    id: subject._id,
    _id: subject._id,
    name: subject.name,
    description: subject.description,
    color: subject.color,
    status: subject.status,
    targetMasteryLevel: subject.targetMasteryLevel,
    topicsCount: subject.topicsCount,
    createdAt: subject.createdAt,
    updatedAt: subject.updatedAt,
  };
}

/**
 * GET /api/v1/subjects
 * Lists all subjects owned by the authenticated user.
 * Supports status filtering and search.
 */
export async function listSubjects(req, res, next) {
  try {
    const { status, search, sort } = req.query;
    const filter = { userId: req.user._id };

    if (status && ['active', 'archived'].includes(status)) {
      filter.status = status;
    }

    if (search && typeof search === 'string' && search.trim().length > 0) {
      const searchRegex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: searchRegex }, { description: searchRegex }];
    }

    const sortOption = sort === 'name' ? { normalizedName: 1 } : { updatedAt: -1 };

    const subjects = await Subject.find(filter).sort(sortOption);

    return res.status(200).json({
      success: true,
      data: {
        subjects: subjects.map(sanitizeSubject),
      },
      meta: {
        total: subjects.length,
        requestId: req.id || 'unknown',
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/subjects
 * Creates a new subject for the authenticated user.
 */
export async function createSubject(req, res, next) {
  try {
    const { name, description = '', color = '#3b82f6', targetMasteryLevel = 'intermediate' } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Subject name is required.',
          details: [{ field: 'name', issue: 'required' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    const trimmedName = name.trim();
    if (trimmedName.length > 120) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Subject name cannot exceed 120 characters.',
          details: [{ field: 'name', issue: 'max_length_exceeded' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    if (typeof description !== 'string' || description.length > 500) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Subject description cannot exceed 500 characters.',
          details: [{ field: 'description', issue: 'max_length_exceeded' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    if (!VALID_MASTERY_LEVELS.includes(targetMasteryLevel)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid target mastery level. Must be one of: ${VALID_MASTERY_LEVELS.join(', ')}.`,
          details: [{ field: 'targetMasteryLevel', issue: 'invalid_enum' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    const normalizedName = trimmedName.toLowerCase();

    // Check for duplicate subject name for this user
    const existing = await Subject.findOne({ userId: req.user._id, normalizedName });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'A subject with this name already exists in your workspace.',
          details: [{ field: 'name', issue: 'duplicate_entry' }],
        },
        requestId: req.id || 'unknown',
      });
    }

    const subject = await Subject.create({
      userId: req.user._id,
      name: trimmedName,
      normalizedName,
      description: description.trim(),
      color: typeof color === 'string' ? color.trim() : '#3b82f6',
      targetMasteryLevel,
      status: 'active',
      topicsCount: 0,
    });

    return res.status(201).json({
      success: true,
      data: {
        subject: sanitizeSubject(subject),
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
          message: 'A subject with this name already exists.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }
    next(error);
  }
}

/**
 * GET /api/v1/subjects/:subjectId
 * Retrieves a single subject owned by the authenticated user.
 */
export async function getSubject(req, res, next) {
  try {
    const { subjectId } = req.params;

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

    // Refresh actual topic count
    const actualCount = await Topic.countDocuments({ subjectId: subject._id, userId: req.user._id });
    if (subject.topicsCount !== actualCount) {
      subject.topicsCount = actualCount;
      await subject.save();
    }

    return res.status(200).json({
      success: true,
      data: {
        subject: sanitizeSubject(subject),
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
 * PUT /api/v1/subjects/:subjectId
 * Updates an owned subject.
 */
export async function updateSubject(req, res, next) {
  try {
    const { subjectId } = req.params;

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

    const { name, description, color, status, targetMasteryLevel } = req.body;

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Subject name cannot be empty.',
            details: [{ field: 'name', issue: 'required' }],
          },
          requestId: req.id || 'unknown',
        });
      }

      const trimmedName = name.trim();
      if (trimmedName.length > 120) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Subject name cannot exceed 120 characters.',
            details: [{ field: 'name', issue: 'max_length_exceeded' }],
          },
          requestId: req.id || 'unknown',
        });
      }

      const normalized = trimmedName.toLowerCase();
      if (normalized !== subject.normalizedName) {
        const existing = await Subject.findOne({
          userId: req.user._id,
          normalizedName: normalized,
          _id: { $ne: subject._id },
        });
        if (existing) {
          return res.status(409).json({
            success: false,
            error: {
              code: 'CONFLICT',
              message: 'A subject with this name already exists in your workspace.',
              details: [{ field: 'name', issue: 'duplicate_entry' }],
            },
            requestId: req.id || 'unknown',
          });
        }
        subject.name = trimmedName;
        subject.normalizedName = normalized;
      }
    }

    if (description !== undefined) {
      if (typeof description !== 'string' || description.length > 500) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Description cannot exceed 500 characters.',
            details: [{ field: 'description', issue: 'max_length_exceeded' }],
          },
          requestId: req.id || 'unknown',
        });
      }
      subject.description = description.trim();
    }

    if (color !== undefined && typeof color === 'string') {
      subject.color = color.trim();
    }

    if (status !== undefined) {
      if (!['active', 'archived'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Status must be active or archived.',
            details: [{ field: 'status', issue: 'invalid_enum' }],
          },
          requestId: req.id || 'unknown',
        });
      }
      subject.status = status;
    }

    if (targetMasteryLevel !== undefined) {
      if (!VALID_MASTERY_LEVELS.includes(targetMasteryLevel)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid target mastery level. Must be one of: ${VALID_MASTERY_LEVELS.join(', ')}.`,
            details: [{ field: 'targetMasteryLevel', issue: 'invalid_enum' }],
          },
          requestId: req.id || 'unknown',
        });
      }
      subject.targetMasteryLevel = targetMasteryLevel;
    }

    await subject.save();

    return res.status(200).json({
      success: true,
      data: {
        subject: sanitizeSubject(subject),
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
          message: 'A subject with this name already exists.',
          details: [],
        },
        requestId: req.id || 'unknown',
      });
    }
    next(error);
  }
}

/**
 * DELETE /api/v1/subjects/:subjectId
 * Deletes an owned subject and cascades deletion to all child topics.
 */
export async function deleteSubject(req, res, next) {
  try {
    const { subjectId } = req.params;

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

    // Cascade deletion of all child topics belonging to this subject and user
    const deleteTopicsResult = await Topic.deleteMany({
      subjectId: subject._id,
      userId: req.user._id,
    });

    // Cascade deletion of all chats and messages linked to this subject
    const subjectChats = await Chat.find({
      subjectId: subject._id,
      userId: req.user._id,
    }).select('_id');

    if (subjectChats.length > 0) {
      const chatIds = subjectChats.map((c) => c._id);
      await Message.deleteMany({ chatId: { $in: chatIds }, userId: req.user._id });
      await Chat.deleteMany({ _id: { $in: chatIds }, userId: req.user._id });
    }

    await Subject.deleteOne({ _id: subject._id });

    return res.status(200).json({
      success: true,
      data: {
        message: 'Subject and associated topics deleted successfully.',
        deletedSubjectId: subjectId,
        cascadeDeletedTopicsCount: deleteTopicsResult.deletedCount || 0,
      },
      meta: {
        requestId: req.id || 'unknown',
      },
    });
  } catch (error) {
    next(error);
  }
}
