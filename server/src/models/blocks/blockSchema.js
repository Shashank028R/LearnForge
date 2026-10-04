import mongoose from 'mongoose';
import crypto from 'crypto';

const uuidv4 = () => crypto.randomUUID();

/**
 * Structured Typed Block Definitions (Phase 07)
 * Strictly typed schema for pedagogical note blocks with stable identity and single authoritative provenance.
 */

export const BLOCK_TYPES = [
  'heading',
  'paragraph',
  'bullet_list',
  'numbered_list',
  'code',
  'quote',
  'callout',
  'table',
  'divider',
];

export const BLOCK_ORIGINS = ['user', 'ai', 'system'];

export const CALLOUT_VARIANTS = ['info', 'warning', 'tip', 'key_takeaway'];

/**
 * Validates the typed content schema for a specific block type
 */
export function validateBlockContent(type, content) {
  if (!content || typeof content !== 'object') {
    return { isValid: false, reason: 'Block content must be a non-null object' };
  }

  switch (type) {
    case 'heading': {
      if (typeof content.text !== 'string' || content.text.trim().length === 0) {
        return { isValid: false, reason: 'Heading block requires non-empty string "text"' };
      }
      if (![1, 2, 3].includes(content.level)) {
        return { isValid: false, reason: 'Heading block "level" must be 1, 2, or 3' };
      }
      return { isValid: true };
    }

    case 'paragraph': {
      if (typeof content.text !== 'string') {
        return { isValid: false, reason: 'Paragraph block requires string "text"' };
      }
      return { isValid: true };
    }

    case 'bullet_list':
    case 'numbered_list': {
      if (!Array.isArray(content.items) || content.items.length === 0) {
        return { isValid: false, reason: `${type} requires non-empty array "items"` };
      }
      const hasInvalidItem = content.items.some((item) => typeof item !== 'string' || item.trim().length === 0);
      if (hasInvalidItem) {
        return { isValid: false, reason: `${type} items must be non-empty strings` };
      }
      return { isValid: true };
    }

    case 'code': {
      if (typeof content.code !== 'string') {
        return { isValid: false, reason: 'Code block requires string "code"' };
      }
      if (typeof content.language !== 'string' || content.language.trim().length === 0) {
        return { isValid: false, reason: 'Code block requires non-empty string "language"' };
      }
      return { isValid: true };
    }

    case 'quote': {
      if (typeof content.text !== 'string' || content.text.trim().length === 0) {
        return { isValid: false, reason: 'Quote block requires non-empty string "text"' };
      }
      if (content.citation !== undefined && typeof content.citation !== 'string') {
        return { isValid: false, reason: 'Quote citation must be a string if provided' };
      }
      return { isValid: true };
    }

    case 'callout': {
      if (!CALLOUT_VARIANTS.includes(content.variant)) {
        return { isValid: false, reason: `Callout variant must be one of: ${CALLOUT_VARIANTS.join(', ')}` };
      }
      if (typeof content.text !== 'string' || content.text.trim().length === 0) {
        return { isValid: false, reason: 'Callout block requires non-empty string "text"' };
      }
      if (content.title !== undefined && typeof content.title !== 'string') {
        return { isValid: false, reason: 'Callout title must be a string if provided' };
      }
      return { isValid: true };
    }

    case 'table': {
      if (!Array.isArray(content.headers) || content.headers.length === 0) {
        return { isValid: false, reason: 'Table block requires non-empty array "headers"' };
      }
      if (!Array.isArray(content.rows)) {
        return { isValid: false, reason: 'Table block requires array "rows"' };
      }
      const headerLength = content.headers.length;
      for (let r = 0; r < content.rows.length; r++) {
        const row = content.rows[r];
        if (!Array.isArray(row) || row.length !== headerLength) {
          return { isValid: false, reason: `Table row ${r} must be an array of length ${headerLength}` };
        }
      }
      return { isValid: true };
    }

    case 'divider': {
      return { isValid: true };
    }

    default:
      return { isValid: false, reason: `Unsupported block type: ${type}` };
  }
}

/**
 * Mongoose subdocument schema for structured blocks
 */
export const blockSubdocumentSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      default: () => uuidv4(),
    },
    type: {
      type: String,
      required: true,
      enum: BLOCK_TYPES,
    },
    content: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      validate: {
        validator: function (val) {
          const res = validateBlockContent(this.type, val);
          return res.isValid;
        },
        message: function (props) {
          const res = validateBlockContent(this.type, props.value);
          return res.reason || 'Invalid block content';
        },
      },
    },
    order: {
      type: Number,
      required: true,
      min: 0,
    },
    origin: {
      type: String,
      required: true,
      enum: BLOCK_ORIGINS,
      default: 'user',
    },
    metadata: {
      conceptAttributions: {
        type: [String],
        default: [],
      },
      lastModifiedAt: {
        type: Date,
        default: Date.now,
      },
    },
  },
  {
    _id: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Derived virtual: isUserAuthored is strictly derived from origin === 'user'
blockSubdocumentSchema.virtual('isUserAuthored').get(function () {
  return this.origin === 'user';
});
