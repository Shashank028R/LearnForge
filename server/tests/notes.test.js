import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { UserSession } from '../src/models/UserSession.js';
import { Subject } from '../src/models/Subject.js';
import { Topic } from '../src/models/Topic.js';
import { SyllabusVersion } from '../src/models/SyllabusVersion.js';
import { Concept } from '../src/models/Concept.js';
import { LearningEvent } from '../src/models/LearningEvent.js';
import { NoteDocument } from '../src/models/NoteDocument.js';
import { NoteVersion } from '../src/models/NoteVersion.js';
import { NoteProposal } from '../src/models/NoteProposal.js';
import { validateBlockContent } from '../src/models/blocks/blockSchema.js';
import { classifyProposalRisk } from '../src/notes/risk/riskClassifier.js';
import { NotesService } from '../src/notes/services/notesService.js';
import { hashSessionToken, generateSessionToken } from '../src/utils/authCrypto.js';
import { AI_TASK_TYPES } from '../src/ai/schemas/tasks.js';

describe('Phase 07 — Structured Notes Engine', () => {
  let userA, userB;
  let sessionTokenA, sessionCookieA;
  let sessionTokenB, sessionCookieB;
  let subjectA, topicA, approvedSyllabusA;
  let concept1, concept2;

  let noteDocumentsStore = new Map();
  let noteVersionsStore = new Map();
  let noteProposalsStore = new Map();
  let conceptsStore = new Map();
  let learningEventsStore = new Map();
  let usersStore = new Map();
  let sessionsStore = new Map();
  let subjectsStore = new Map();
  let topicsStore = new Map();
  let syllabusStore = new Map();

  beforeEach(() => {
    noteDocumentsStore.clear();
    noteVersionsStore.clear();
    noteProposalsStore.clear();
    conceptsStore.clear();
    learningEventsStore.clear();
    usersStore.clear();
    sessionsStore.clear();
    subjectsStore.clear();
    topicsStore.clear();
    syllabusStore.clear();

    userA = {
      _id: new mongoose.Types.ObjectId(),
      email: 'userA@learnforge.ai',
      name: 'User A',
      status: 'active',
    };
    usersStore.set(userA._id.toString(), userA);

    userB = {
      _id: new mongoose.Types.ObjectId(),
      email: 'userB@learnforge.ai',
      name: 'User B',
      status: 'active',
    };
    usersStore.set(userB._id.toString(), userB);

    sessionTokenA = generateSessionToken();
    const sessionA = {
      _id: new mongoose.Types.ObjectId(),
      userId: userA._id,
      sessionTokenHash: hashSessionToken(sessionTokenA),
      isActive: true,
      expiresAt: new Date(Date.now() + 86400000),
    };
    sessionsStore.set(sessionA._id.toString(), sessionA);
    sessionCookieA = `learnforge_session=${sessionTokenA}`;

    sessionTokenB = generateSessionToken();
    const sessionB = {
      _id: new mongoose.Types.ObjectId(),
      userId: userB._id,
      sessionTokenHash: hashSessionToken(sessionTokenB),
      isActive: true,
      expiresAt: new Date(Date.now() + 86400000),
    };
    sessionsStore.set(sessionB._id.toString(), sessionB);
    sessionCookieB = `learnforge_session=${sessionTokenB}`;

    subjectA = {
      _id: new mongoose.Types.ObjectId(),
      userId: userA._id,
      title: 'Database Internals & Storage Engines',
      name: 'Database Internals & Storage Engines',
      description: 'LSM Trees, B-Trees, and Write-Ahead Logging',
      status: 'active',
    };
    subjectsStore.set(subjectA._id.toString(), subjectA);

    topicA = {
      _id: new mongoose.Types.ObjectId(),
      userId: userA._id,
      subjectId: subjectA._id,
      title: 'Log-Structured Merge-Trees',
      normalizedTitle: 'log-structured merge-trees',
      description: 'MemTable, WAL, SSTables, and Compaction Strategies',
      status: 'in_progress',
    };
    topicsStore.set(topicA._id.toString(), topicA);

    approvedSyllabusA = {
      _id: new mongoose.Types.ObjectId(),
      userId: userA._id,
      subjectId: subjectA._id,
      version: 1,
      title: 'Storage Engines Mastery',
      status: 'approved',
      sections: [
        {
          title: 'Append-Only Storage',
          topics: [{ title: 'Log-Structured Merge-Trees' }],
        },
      ],
    };
    syllabusStore.set(approvedSyllabusA._id.toString(), approvedSyllabusA);

    concept1 = {
      _id: new mongoose.Types.ObjectId(),
      userId: userA._id,
      subjectId: subjectA._id,
      topicId: topicA._id,
      name: 'MemTable',
      normalizedName: 'memtable',
      status: 'mastered',
      confidenceScore: 92,
      evidenceCount: 4,
      misconceptions: [],
      conflictState: { hasConflict: false },
    };
    conceptsStore.set(concept1._id.toString(), concept1);

    concept2 = {
      _id: new mongoose.Types.ObjectId(),
      userId: userA._id,
      subjectId: subjectA._id,
      topicId: topicA._id,
      name: 'SSTable',
      normalizedName: 'sstable',
      status: 'learning',
      confidenceScore: 78,
      evidenceCount: 2,
      misconceptions: [
        {
          misconceptionText: 'SSTables are mutable in place',
          severity: 'medium',
          isActive: true,
        },
      ],
      conflictState: { hasConflict: false },
    };
    conceptsStore.set(concept2._id.toString(), concept2);

    // Mongoose Model Spies & InMemory Store simulation
    vi.spyOn(User, 'findById').mockImplementation(async (id) => usersStore.get(id?.toString()) || null);
    vi.spyOn(UserSession, 'findOne').mockImplementation(async (query) => {
      const targetHash = query.sessionTokenHash;
      for (const s of sessionsStore.values()) {
        if (s.sessionTokenHash === targetHash && s.isActive) {
          return {
            ...s,
            user: usersStore.get(s.userId.toString()),
            save: async () => s,
          };
        }
      }
      return null;
    });

    vi.spyOn(Subject, 'findOne').mockImplementation(async (query) => {
      const doc = subjectsStore.get(query._id?.toString());
      if (doc && (!query.userId || doc.userId.toString() === query.userId.toString())) {
        return doc;
      }
      return null;
    });

    vi.spyOn(Topic, 'findOne').mockImplementation(async (query) => {
      const doc = topicsStore.get(query._id?.toString());
      if (doc && (!query.userId || doc.userId.toString() === query.userId.toString())) {
        return doc;
      }
      return null;
    });

    vi.spyOn(SyllabusVersion, 'findOne').mockImplementation(async (query) => {
      for (const s of syllabusStore.values()) {
        if (
          s.subjectId.toString() === query.subjectId?.toString() &&
          s.userId.toString() === query.userId?.toString() &&
          (!query.status || s.status === query.status)
        ) {
          return s;
        }
      }
      return null;
    });

    vi.spyOn(Concept, 'find').mockImplementation((query) => {
      const results = [];
      for (const c of conceptsStore.values()) {
        if (
          c.userId.toString() === query.userId?.toString() &&
          c.topicId.toString() === query.topicId?.toString()
        ) {
          results.push(c);
        }
      }
      return {
        sort: () => results,
      };
    });

    vi.spyOn(LearningEvent, 'find').mockImplementation((query) => {
      const results = [];
      for (const e of learningEventsStore.values()) {
        if (
          e.userId.toString() === query.userId?.toString() &&
          e.topicId.toString() === query.topicId?.toString()
        ) {
          results.push(e);
        }
      }
      return {
        sort: () => ({
          limit: () => results,
        }),
      };
    });

    // Mock NoteDocument queries
    vi.spyOn(NoteDocument, 'findOne').mockImplementation((query) => {
      let found = null;
      for (const doc of noteDocumentsStore.values()) {
        if (query._id && doc._id.toString() === query._id.toString()) {
          if (!query.userId || doc.userId.toString() === query.userId.toString()) {
            found = doc;
            break;
          }
        } else if (
          query.userId &&
          query.topicId &&
          doc.userId.toString() === query.userId.toString() &&
          doc.topicId.toString() === query.topicId.toString()
        ) {
          found = doc;
          break;
        }
      }

      const createQueryChain = (doc) => {
        let isLean = false;
        let isPopulated = false;

        const execute = () => {
          if (!doc) return null;
          let res = doc;
          if (doc.toObject && isLean) {
            res = doc.toObject();
          } else if (isLean) {
            res = { ...doc };
          }
          if (isPopulated && doc.currentVersionId) {
            const ver = noteVersionsStore.get(doc.currentVersionId.toString()) || doc.currentVersionId;
            res = { ...res, currentVersionId: ver };
          }
          return res;
        };

        const chain = {
          populate: () => {
            isPopulated = true;
            return chain;
          },
          session: () => chain,
          lean: () => {
            isLean = true;
            return chain;
          },
          then: (resolve) => resolve(execute()),
        };
        return chain;
      };

      return createQueryChain(found);
    });

    vi.spyOn(NoteDocument, 'findById').mockImplementation((id) => {
      const doc = noteDocumentsStore.get(id?.toString());
      return {
        populate: () => ({
          lean: async () => doc || null,
          then: (resolve) => resolve(doc || null),
        }),
      };
    });

    vi.spyOn(NoteDocument, 'find').mockImplementation((query) => {
      const results = [];
      for (const doc of noteDocumentsStore.values()) {
        if (doc.userId.toString() === query.userId?.toString()) {
          if (!query.subjectId || doc.subjectId.toString() === query.subjectId.toString()) {
            results.push(doc);
          }
        }
      }
      return {
        populate: () => ({
          sort: () => ({
            skip: () => ({
              limit: () => ({
                lean: async () =>
                  results.map((d) => ({
                    ...d,
                    currentVersionId: noteVersionsStore.get(d.currentVersionId?.toString()) || d.currentVersionId,
                  })),
              }),
            }),
          }),
        }),
      };
    });

    vi.spyOn(NoteDocument, 'countDocuments').mockImplementation(async (query) => {
      let count = 0;
      for (const doc of noteDocumentsStore.values()) {
        if (doc.userId.toString() === query.userId?.toString()) {
          if (!query.subjectId || doc.subjectId.toString() === query.subjectId.toString()) {
            count++;
          }
        }
      }
      return count;
    });

    // Mock NoteVersion queries
    vi.spyOn(NoteVersion, 'findOne').mockImplementation((query) => {
      let found = null;
      for (const ver of noteVersionsStore.values()) {
        if (query._id && ver._id.toString() === query._id.toString()) {
          found = ver;
          break;
        } else if (
          query.noteDocumentId &&
          ver.noteDocumentId.toString() === query.noteDocumentId.toString() &&
          ver.userId.toString() === query.userId.toString() &&
          ver.version === query.version
        ) {
          found = ver;
          break;
        }
      }

      const chain = {
        session: () => chain,
        lean: async () => found || null,
        then: (resolve) => resolve(found || null),
      };
      return chain;
    });

    vi.spyOn(NoteVersion, 'find').mockImplementation((query) => {
      const results = [];
      for (const ver of noteVersionsStore.values()) {
        if (
          ver.noteDocumentId.toString() === query.noteDocumentId?.toString() &&
          ver.userId.toString() === query.userId?.toString()
        ) {
          results.push(ver);
        }
      }
      return {
        sort: () => ({
          skip: () => ({
            limit: () => ({
              lean: async () => results.sort((a, b) => b.version - a.version),
            }),
          }),
        }),
      };
    });

    vi.spyOn(NoteVersion, 'countDocuments').mockImplementation(async (query) => {
      let count = 0;
      for (const ver of noteVersionsStore.values()) {
        if (
          ver.noteDocumentId.toString() === query.noteDocumentId?.toString() &&
          ver.userId.toString() === query.userId?.toString()
        ) {
          count++;
        }
      }
      return count;
    });

    // Mock NoteProposal queries
    vi.spyOn(NoteProposal, 'findOne').mockImplementation((query) => {
      let found = null;
      for (const p of noteProposalsStore.values()) {
        if (query._id && p._id.toString() === query._id.toString()) {
          if (!query.userId || p.userId.toString() === query.userId.toString()) {
            found = p;
            break;
          }
        }
      }
      const chain = {
        session: () => chain,
        lean: async () => found || null,
        then: (resolve) => resolve(found || null),
      };
      return chain;
    });

    vi.spyOn(NoteProposal, 'find').mockImplementation((query) => {
      const results = [];
      for (const p of noteProposalsStore.values()) {
        if (p.userId.toString() === query.userId?.toString()) {
          if (!query.noteDocumentId || p.noteDocumentId.toString() === query.noteDocumentId.toString()) {
            if (!query.status || p.status === query.status) {
              results.push(p);
            }
          }
        }
      }
      return {
        sort: () => ({
          skip: () => ({
            limit: () => ({
              lean: async () => results,
            }),
          }),
        }),
      };
    });

    vi.spyOn(NoteProposal, 'findOneAndUpdate').mockImplementation(async (query, update) => {
      let found = null;
      for (const p of noteProposalsStore.values()) {
        if (query._id && p._id.toString() === query._id.toString()) {
          if (!query.userId || p.userId.toString() === query.userId.toString()) {
            if (!query.status || p.status === query.status) {
              found = p;
              break;
            }
          }
        }
      }
      if (!found) return null;

      if (update.$set) {
        Object.assign(found, update.$set);
      }
      if (update.$push) {
        for (const [k, v] of Object.entries(update.$push)) {
          if (k.includes('.')) {
            const [parent, child] = k.split('.');
            if (found[parent] && Array.isArray(found[parent][child])) {
              found[parent][child].push(v);
            }
          }
        }
      }
      return found;
    });

    vi.spyOn(NoteProposal, 'countDocuments').mockImplementation(async (query) => {
      let count = 0;
      for (const p of noteProposalsStore.values()) {
        if (p.userId.toString() === query.userId?.toString()) {
          count++;
        }
      }
      return count;
    });

    vi.spyOn(NoteProposal.prototype, 'save').mockImplementation(async function () {
      noteProposalsStore.set(this._id.toString(), this);
      return this;
    });

    // Mock startSession to simulate MongoDB transactions
    vi.spyOn(mongoose, 'startSession').mockImplementation(async () => ({
      startTransaction: () => {},
      commitTransaction: async () => {},
      abortTransaction: async () => {},
      endSession: async () => {},
    }));
  });

  // ==============================================================================
  // 1. BLOCK SCHEMA & TYPED VALIDATION TESTS
  // ==============================================================================
  describe('Block Schema & Typed Validation', () => {
    it('validates heading block schemas correctly', () => {
      const validH1 = validateBlockContent('heading', { level: 1, text: 'Valid Title' });
      expect(validH1.isValid).toBe(true);

      const invalidH7 = validateBlockContent('heading', { level: 7, text: 'Invalid Level' });
      expect(invalidH7.isValid).toBe(false);

      const emptyText = validateBlockContent('heading', { level: 2, text: '' });
      expect(emptyText.isValid).toBe(false);
    });

    it('validates paragraph block schemas correctly', () => {
      const validP = validateBlockContent('paragraph', { text: 'Valid paragraph content.' });
      expect(validP.isValid).toBe(true);

      const invalidP = validateBlockContent('paragraph', { text: 123 });
      expect(invalidP.isValid).toBe(false);
    });

    it('validates list blocks (bullet_list and numbered_list) correctly', () => {
      const validList = validateBlockContent('bullet_list', { items: ['Item 1', 'Item 2'] });
      expect(validList.isValid).toBe(true);

      const emptyList = validateBlockContent('numbered_list', { items: [] });
      expect(emptyList.isValid).toBe(false);

      const nonArrayItems = validateBlockContent('bullet_list', { items: 'not-array' });
      expect(nonArrayItems.isValid).toBe(false);
    });

    it('validates code blocks correctly', () => {
      const validCode = validateBlockContent('code', {
        language: 'rust',
        code: 'fn main() { println!("Hello LearnForge"); }',
      });
      expect(validCode.isValid).toBe(true);

      const missingCode = validateBlockContent('code', { language: 'rust' });
      expect(missingCode.isValid).toBe(false);
    });

    it('validates callout blocks with variant enforcement', () => {
      const validInfo = validateBlockContent('callout', {
        variant: 'info',
        title: 'Deep Dive',
        text: 'LSM compaction avoids write amplification.',
      });
      expect(validInfo.isValid).toBe(true);

      const invalidVariant = validateBlockContent('callout', {
        variant: 'invalid_variant',
        title: 'Deep Dive',
        text: 'Invalid callout variant.',
      });
      expect(invalidVariant.isValid).toBe(false);
    });

    it('validates table blocks with matching column counts', () => {
      const validTable = validateBlockContent('table', {
        headers: ['Component', 'Role'],
        rows: [
          ['MemTable', 'In-memory buffer'],
          ['SSTable', 'Immutable on-disk table'],
        ],
      });
      expect(validTable.isValid).toBe(true);

      const mismatchedRows = validateBlockContent('table', {
        headers: ['Col A', 'Col B'],
        rows: [['Only one col']],
      });
      expect(mismatchedRows.isValid).toBe(false);
    });

    it('rejects unsupported block types', () => {
      const unknownType = validateBlockContent('unsupported_type', { text: 'test' });
      expect(unknownType.isValid).toBe(false);
      expect(unknownType.reason).toContain('Unsupported block type');
    });

    it('rejects heading level 4 and higher (strict levels 1, 2, 3)', () => {
      const h4 = validateBlockContent('heading', { level: 4, text: 'H4 not allowed' });
      expect(h4.isValid).toBe(false);
      expect(h4.reason).toContain('"level" must be 1, 2, or 3');
    });

    it('rejects code blocks with unsupported keys (e.g. caption)', () => {
      const codeWithCaption = validateBlockContent('code', {
        language: 'rust',
        code: 'let x = 1;',
        caption: 'Illegal caption key',
      });
      expect(codeWithCaption.isValid).toBe(false);
      expect(codeWithCaption.reason).toContain('unsupported field(s): caption');
    });

    it('rejects paragraph with unknown fields', () => {
      const invalidP = validateBlockContent('paragraph', {
        text: 'Valid text',
        unknownField: 123,
      });
      expect(invalidP.isValid).toBe(false);
      expect(invalidP.reason).toContain('unsupported field(s): unknownField');
    });

    it('rejects callout with unknown fields', () => {
      const invalidCallout = validateBlockContent('callout', {
        variant: 'info',
        text: 'Valid text',
        customGimmick: true,
      });
      expect(invalidCallout.isValid).toBe(false);
      expect(invalidCallout.reason).toContain('unsupported field(s): customGimmick');
    });
  });

  // ==============================================================================
  // 2. NOTE VERSION IMMUTABILITY INVARIANT REGRESSION TESTS
  // ==============================================================================
  describe('NoteVersion Immutability Invariant & Mutation Blocking', () => {
    it('blocks save() on existing NoteVersion documents', async () => {
      const versionDoc = new NoteVersion({
        noteDocumentId: new mongoose.Types.ObjectId(),
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        version: 1,
        blocks: [],
        changeSummary: 'Initial creation',
      });

      // Simulating persisted document (isNew = false)
      versionDoc.isNew = false;
      versionDoc.changeSummary = 'Mutated summary';

      let error = null;
      try {
        await versionDoc.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.code).toBe('IMMUTABLE_NOTE_VERSION');
    });

    it('blocks updateOne, updateMany, findOneAndUpdate, replaceOne, and findOneAndReplace', async () => {
      const mutationMethods = [
        'updateOne',
        'updateMany',
        'findOneAndUpdate',
        'replaceOne',
        'findOneAndReplace',
      ];

      for (const method of mutationMethods) {
        let error = null;
        try {
          await NoteVersion[method]({ _id: new mongoose.Types.ObjectId() }, { changeSummary: 'Illegal update' });
        } catch (err) {
          error = err;
        }

        expect(error).toBeDefined();
        expect(error.code).toBe('IMMUTABLE_NOTE_VERSION');
      }
    });

    it('blocks deleteOne, deleteMany, and findOneAndDelete', async () => {
      const deleteMethods = ['deleteOne', 'deleteMany', 'findOneAndDelete'];

      for (const method of deleteMethods) {
        let error = null;
        try {
          await NoteVersion[method]({ _id: new mongoose.Types.ObjectId() });
        } catch (err) {
          error = err;
        }

        expect(error).toBeDefined();
        expect(error.code).toBe('IMMUTABLE_NOTE_VERSION');
      }
    });

    it('blocks prohibited mutation operations passed via bulkWrite', async () => {
      const prohibitedBulkOps = [
        [{ updateOne: { filter: { version: 1 }, update: { $set: { changeSummary: 'mutated' } } } }],
        [{ updateMany: { filter: { version: 1 }, update: { $set: { changeSummary: 'mutated' } } } }],
        [{ replaceOne: { filter: { version: 1 }, replacement: {} } }],
        [{ deleteOne: { filter: { version: 1 } } }],
        [{ deleteMany: { filter: { version: 1 } } }],
      ];

      for (const ops of prohibitedBulkOps) {
        let error = null;
        try {
          await NoteVersion.bulkWrite(ops);
        } catch (err) {
          error = err;
        }

        expect(error).toBeDefined();
        expect(error.code).toBe('IMMUTABLE_NOTE_VERSION');
      }
    });
  });

  // ==============================================================================
  // 3. RISK CLASSIFIER & DIFFER TESTS
  // ==============================================================================
  describe('Risk Classifier & Block Differ', () => {
    it('classifies pure additions to an AI note as LOW risk', () => {
      const currentBlocks = [
        { id: 'b1', type: 'paragraph', content: { text: 'Base paragraph' }, origin: 'ai' },
      ];
      const proposedBlocks = [
        { id: 'b1', type: 'paragraph', content: { text: 'Base paragraph' }, origin: 'ai' },
        { id: 'b2', type: 'paragraph', content: { text: 'New additive paragraph' }, origin: 'ai' },
      ];

      const risk = classifyProposalRisk({
        currentBlocks,
        proposedBlocks,
        conflictedConcepts: [],
      });

      expect(risk.riskLevel).toBe('LOW');
      expect(risk.requiresApproval).toBe(false);
      expect(risk.diff.added.length).toBe(1);
    });

    it('classifies modifications of AI blocks as MEDIUM risk', () => {
      const currentBlocks = [
        { id: 'b1', type: 'paragraph', content: { text: 'Old AI explanation' }, origin: 'ai' },
      ];
      const proposedBlocks = [
        { id: 'b1', type: 'paragraph', content: { text: 'Refined AI explanation' }, origin: 'ai' },
      ];

      const risk = classifyProposalRisk({
        currentBlocks,
        proposedBlocks,
        conflictedConcepts: [],
      });

      expect(risk.riskLevel).toBe('MEDIUM');
      expect(risk.requiresApproval).toBe(true);
      expect(risk.diff.modified.length).toBe(1);
    });

    it('classifies modifications to user-authored blocks (origin: user) as HIGH risk', () => {
      const currentBlocks = [
        { id: 'u1', type: 'paragraph', content: { text: 'User handwritten note' }, origin: 'user' },
      ];
      const proposedBlocks = [
        { id: 'u1', type: 'paragraph', content: { text: 'AI replaced handwritten note' }, origin: 'ai' },
      ];

      const risk = classifyProposalRisk({
        currentBlocks,
        proposedBlocks,
        conflictedConcepts: [],
      });

      expect(risk.riskLevel).toBe('HIGH');
      expect(risk.hasUserAuthoredConflicts).toBe(true);
      expect(risk.protectedBlockIds).toContain('u1');
      expect(risk.requiresApproval).toBe(true);
    });

    it('classifies modifications to code blocks as HIGH risk', () => {
      const currentBlocks = [
        { id: 'c1', type: 'code', content: { language: 'rust', code: 'let x = 1;' }, origin: 'ai' },
      ];
      const proposedBlocks = [
        { id: 'c1', type: 'code', content: { language: 'rust', code: 'let x = 2;' }, origin: 'ai' },
      ];

      const risk = classifyProposalRisk({
        currentBlocks,
        proposedBlocks,
        conflictedConcepts: [],
      });

      expect(risk.riskLevel).toBe('HIGH');
      expect(risk.requiresApproval).toBe(true);
      expect(risk.reasons.some((r) => r.includes('Code block'))).toBe(true);
    });

    it('classifies active concept conflicts as HIGH risk', () => {
      const currentBlocks = [];
      const proposedBlocks = [
        { id: 'b1', type: 'paragraph', content: { text: 'New concept explanation' }, origin: 'ai' },
      ];
      const conflictedConcepts = [{ name: 'WAL Invariant', conflictState: { hasConflict: true } }];

      const risk = classifyProposalRisk({
        currentBlocks,
        proposedBlocks,
        conflictedConcepts,
      });

      expect(risk.riskLevel).toBe('HIGH');
      expect(risk.requiresApproval).toBe(true);
      expect(risk.reasons.some((r) => r.includes('Active concept conflict detected'))).toBe(true);
    });
  });

  // ==============================================================================
  // 4. NOTES DOMAIN SERVICE & CONCURRENCY BARRIERS
  // ==============================================================================
  describe('Notes Domain Service & Concurrency Barriers', () => {
    let notesService;

    beforeEach(() => {
      notesService = new NotesService();
    });

    it('getTopicNote returns null when no note document exists yet', async () => {
      const note = await notesService.getTopicNote({
        userId: userA._id,
        topicId: topicA._id,
      });
      expect(note).toBeNull();
    });

    it('creates initial NoteDocument and NoteVersion v1 atomically', async () => {
      // Mock save to populate in-memory stores
      vi.spyOn(NoteVersion.prototype, 'save').mockImplementation(async function () {
        noteVersionsStore.set(this._id.toString(), this);
        return this;
      });
      vi.spyOn(NoteDocument.prototype, 'save').mockImplementation(async function () {
        noteDocumentsStore.set(this._id.toString(), this);
        return this;
      });

      const result = await notesService.createInitialTopicNote({
        userId: userA._id,
        topicId: topicA._id,
        title: 'Log-Structured Merge-Trees',
        blocks: [
          {
            type: 'heading',
            content: { level: 1, text: 'LSM Trees Overview' },
          },
          {
            type: 'paragraph',
            content: { text: 'An LSM tree organizes data into memory and disk hierarchies.' },
          },
        ],
        changeSummary: 'Initial study note',
      });

      expect(result.alreadyExisted).toBe(false);
      expect(result.note.currentVersionNumber).toBe(1);
      expect(result.note.title).toBe('Log-Structured Merge-Trees');
      expect(result.createdVersion.version).toBe(1);
      expect(result.createdVersion.blocks.length).toBe(2);
    });

    it('rejects manual revision when baseVersion is stale (STALE_BASE_VERSION)', async () => {
      const existingNote = {
        _id: new mongoose.Types.ObjectId(),
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        title: 'LSM Trees',
        currentVersionNumber: 2,
        currentVersionId: new mongoose.Types.ObjectId(),
        save: async function () {
          return this;
        },
      };
      noteDocumentsStore.set(existingNote._id.toString(), existingNote);

      let error = null;
      try {
        await notesService.createManualRevision({
          userId: userA._id,
          noteId: existingNote._id,
          baseVersion: 1, // Stale base version (current is 2)
          blocks: [{ type: 'paragraph', content: { text: 'Updated content' } }],
        });
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.code).toBe('STALE_BASE_VERSION');
      expect(error.status).toBe(409);
    });

    it('creates sequential NoteVersion v2 on valid baseVersion revision', async () => {
      const version1Id = new mongoose.Types.ObjectId();
      const existingNote = {
        _id: new mongoose.Types.ObjectId(),
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        title: 'LSM Trees',
        currentVersionNumber: 1,
        currentVersionId: version1Id,
        save: async function () {
          noteDocumentsStore.set(this._id.toString(), this);
          return this;
        },
        toObject: function () {
          return { ...this };
        },
      };
      noteDocumentsStore.set(existingNote._id.toString(), existingNote);

      vi.spyOn(NoteVersion.prototype, 'save').mockImplementation(async function () {
        noteVersionsStore.set(this._id.toString(), this);
        return this;
      });

      const result = await notesService.createManualRevision({
        userId: userA._id,
        noteId: existingNote._id,
        baseVersion: 1,
        title: 'LSM Trees & Compaction',
        blocks: [{ type: 'paragraph', content: { text: 'Updated content v2' } }],
        changeSummary: 'Added compaction details',
      });

      expect(result.note.currentVersionNumber).toBe(2);
      expect(result.note.title).toBe('LSM Trees & Compaction');
      expect(result.version.version).toBe(2);
      expect(result.version.parentVersionId.toString()).toBe(version1Id.toString());
    });

    it('restores historical version by appending a new sequential NoteVersion without mutating historical version', async () => {
      const v1Id = new mongoose.Types.ObjectId();
      const v2Id = new mongoose.Types.ObjectId();

      const version1 = {
        _id: v1Id,
        noteDocumentId: new mongoose.Types.ObjectId(),
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        version: 1,
        blocks: [{ type: 'paragraph', content: { text: 'Version 1 historical content' } }],
        changeSummary: 'Initial creation',
      };
      noteVersionsStore.set(v1Id.toString(), version1);

      const existingNote = {
        _id: version1.noteDocumentId,
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        title: 'LSM Trees',
        currentVersionNumber: 2,
        currentVersionId: v2Id,
        save: async function () {
          noteDocumentsStore.set(this._id.toString(), this);
          return this;
        },
        toObject: function () {
          return { ...this };
        },
      };
      noteDocumentsStore.set(existingNote._id.toString(), existingNote);

      vi.spyOn(NoteVersion.prototype, 'save').mockImplementation(async function () {
        noteVersionsStore.set(this._id.toString(), this);
        return this;
      });

      const result = await notesService.restoreVersion({
        userId: userA._id,
        noteId: existingNote._id,
        targetVersionNumber: 1,
        baseVersion: 2,
      });

      expect(result.note.currentVersionNumber).toBe(3);
      expect(result.restoredVersion.version).toBe(3);
      expect(result.restoredVersion.sourceType).toBe('version_restore');
      expect(result.restoredVersion.blocks[0].content.text).toBe('Version 1 historical content');
      // Verify historical v1 remains unchanged
      const originalV1 = noteVersionsStore.get(v1Id.toString());
      expect(originalV1.version).toBe(1);
    });

    it('stale proposal approval is rejected with STALE_PROPOSAL_BASE (409)', async () => {
      const currentVersionId = new mongoose.Types.ObjectId();
      const otherVersionId = new mongoose.Types.ObjectId();

      const noteDoc = {
        _id: new mongoose.Types.ObjectId(),
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        currentVersionNumber: 2,
        currentVersionId: currentVersionId,
      };
      noteDocumentsStore.set(noteDoc._id.toString(), noteDoc);

      const staleProposal = {
        _id: new mongoose.Types.ObjectId(),
        noteDocumentId: noteDoc._id,
        userId: userA._id,
        baseVersion: 1,
        baseVersionId: otherVersionId, // Mismatch with currentVersionId
        status: 'pending',
        proposedBlocks: [],
      };
      noteProposalsStore.set(staleProposal._id.toString(), staleProposal);

      let error = null;
      try {
        await notesService.approveProposal({
          userId: userA._id,
          proposalId: staleProposal._id,
        });
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.code).toBe('STALE_PROPOSAL_BASE');
      expect(error.status).toBe(409);
    });

    it('concurrent version collision during manual edit converts E11000 / WriteConflict to 409 STALE_BASE_VERSION', async () => {
      const existingNote = {
        _id: new mongoose.Types.ObjectId(),
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        title: 'LSM Trees',
        currentVersionNumber: 5,
        currentVersionId: new mongoose.Types.ObjectId(),
        save: async function () {
          return this;
        },
      };
      noteDocumentsStore.set(existingNote._id.toString(), existingNote);

      // Simulate concurrent winner committing V6 first -> Mongo throws E11000 duplicate key
      vi.spyOn(NoteVersion.prototype, 'save').mockImplementation(async function () {
        const mongoErr = new Error('E11000 duplicate key error collection: learnforge.noteversions index: noteDocumentId_1_version_1');
        mongoErr.code = 11000;
        mongoErr.codeName = 'DuplicateKey';
        throw mongoErr;
      });

      let error = null;
      try {
        await notesService.createManualRevision({
          userId: userA._id,
          noteId: existingNote._id,
          baseVersion: 5,
          blocks: [{ type: 'paragraph', content: { text: 'Concurrent edit content' } }],
        });
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.code).toBe('STALE_BASE_VERSION');
      expect(error.status).toBe(409);
      expect(error.message).not.toContain('E11000');
    });

    it('concurrent initial creation race catches duplicate {userId, topicId} E11000 and resolves safely as alreadyExisted', async () => {
      const existingNoteDoc = {
        _id: new mongoose.Types.ObjectId(),
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        title: 'LSM Trees Initial',
        currentVersionNumber: 1,
        currentVersionId: new mongoose.Types.ObjectId(),
      };
      noteDocumentsStore.set(existingNoteDoc._id.toString(), existingNoteDoc);

      // Simulate concurrent winning insert causing losing transaction to encounter E11000
      vi.spyOn(NoteDocument.prototype, 'save').mockImplementation(async function () {
        const mongoErr = new Error('E11000 duplicate key error index: userId_1_topicId_1');
        mongoErr.code = 11000;
        mongoErr.codeName = 'DuplicateKey';
        throw mongoErr;
      });

      const result = await notesService.createInitialTopicNote({
        userId: userA._id,
        topicId: topicA._id,
        title: 'LSM Trees Initial',
        blocks: [{ type: 'paragraph', content: { text: 'Race losing content' } }],
      });

      expect(result.alreadyExisted).toBe(true);
      expect(result.note._id.toString()).toBe(existingNoteDoc._id.toString());
    });

    it('rejectProposal transitions proposal status to rejected with reason', async () => {
      const proposal = {
        _id: new mongoose.Types.ObjectId(),
        noteDocumentId: new mongoose.Types.ObjectId(),
        userId: userA._id,
        status: 'pending',
        riskAssessment: { reasons: [] },
        save: async function () {
          noteProposalsStore.set(this._id.toString(), this);
          return this;
        },
        toObject: function () {
          return { ...this };
        },
      };
      noteProposalsStore.set(proposal._id.toString(), proposal);

      const result = await notesService.rejectProposal({
        userId: userA._id,
        proposalId: proposal._id,
        reason: 'Too aggressive modification of explanations',
      });

      expect(result.proposal.status).toBe('rejected');
      expect(result.proposal.riskAssessment.reasons.some((r) => r.includes('Too aggressive'))).toBe(true);
    });

    it('enforces server-authoritative block provenance during manual revision', async () => {
      const v1Id = new mongoose.Types.ObjectId();
      const existingNote = {
        _id: new mongoose.Types.ObjectId(),
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        title: 'LSM Trees',
        currentVersionNumber: 1,
        currentVersionId: {
          _id: v1Id,
          blocks: [
            {
              id: 'b1',
              type: 'heading',
              content: { level: 1, text: 'LSM Overview' },
              order: 0,
              origin: 'ai', // Existing AI block
            },
          ],
        },
        save: async function () {
          return this;
        },
        toObject: function () {
          return { ...this };
        },
      };
      noteDocumentsStore.set(existingNote._id.toString(), existingNote);

      vi.spyOn(NoteVersion.prototype, 'save').mockImplementation(async function () {
        noteVersionsStore.set(this._id.toString(), this);
        return this;
      });

      const result = await notesService.createManualRevision({
        userId: userA._id,
        noteId: existingNote._id,
        baseVersion: 1,
        blocks: [
          // 1. Unchanged existing block -> keeps server origin 'ai'
          {
            id: 'b1',
            type: 'heading',
            content: { level: 1, text: 'LSM Overview' },
            order: 0,
            origin: 'ai',
          },
          // 2. Client attempts to forge origin: 'ai' on a brand new block -> MUST become 'user'
          {
            id: 'b2',
            type: 'paragraph',
            content: { text: 'Client authored text claiming to be AI' },
            order: 1,
            origin: 'ai',
          },
          // 3. Client attempts to forge origin: 'system' on a brand new block -> MUST become 'user'
          {
            id: 'b3',
            type: 'paragraph',
            content: { text: 'Client authored text claiming to be system' },
            order: 2,
            origin: 'system',
          },
        ],
      });

      const versionBlocks = result.version.blocks;
      expect(versionBlocks[0].origin).toBe('ai'); // Retained from existing
      expect(versionBlocks[1].origin).toBe('user'); // Forgery blocked -> user
      expect(versionBlocks[2].origin).toBe('user'); // Forgery blocked -> user
    });

    it('enforces server-authoritative note provenance on initial creation (rejects client-supplied aiMetadata)', async () => {
      vi.spyOn(NoteVersion.prototype, 'save').mockImplementation(async function () {
        noteVersionsStore.set(this._id.toString(), this);
        return this;
      });
      vi.spyOn(NoteDocument.prototype, 'save').mockImplementation(async function () {
        noteDocumentsStore.set(this._id.toString(), this);
        return this;
      });

      const result = await notesService.createInitialTopicNote({
        userId: userA._id,
        topicId: topicA._id,
        title: 'Provenance Guard Note',
        blocks: [{ type: 'paragraph', content: { text: 'Initial content' } }],
        provenance: {
          conceptIds: ['fake_concept_id'],
          aiMetadata: { provider: 'openai', model: 'gpt-4o' }, // Spoofed AI metadata
        },
      });

      // Provenance stored on NoteVersion must be clean server-defined (no client-spoofed AI metadata)
      expect(result.createdVersion.provenance.aiMetadata.provider).toBeNull();
      expect(result.createdVersion.provenance.aiMetadata.model).toBeNull();
      expect(result.createdVersion.provenance.conceptIds).toEqual([]);
    });

    it('accurately tracks AI vs fallback provenance during synthesis', async () => {
      // 1. When AI fails or returns invalid JSON, fallback provenance is recorded
      const mockFailingGateway = {
        generate: vi.fn().mockRejectedValue(new Error('AI API rate limited')),
      };
      const synthServiceFailing = new NotesService(mockFailingGateway);

      const fallbackResult = await synthServiceFailing.synthesizeNoteProposal({
        userId: userA._id,
        topicId: topicA._id,
      });

      expect(fallbackResult.proposal.provenance.aiMetadata.source).toBe('deterministic_fallback');
      expect(fallbackResult.proposal.provenance.aiMetadata.provider).toBe('deterministic');
      expect(fallbackResult.proposal.provenance.aiMetadata.model).toBe('rule-based-v1');

      // 2. When AI succeeds with valid JSON, AI provenance is recorded and origin is normalized to 'ai'
      const mockSuccessGateway = {
        generate: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            changeSummary: 'AI generated notes',
            blocks: [
              {
                id: 'ai_b1',
                type: 'heading',
                content: { level: 1, text: 'AI Heading' },
                origin: 'user', // AI hallucinates origin 'user' -> MUST be normalized to 'ai'
              },
            ],
          }),
          provider: 'groq',
          model: 'openai/gpt-oss-20b',
          latencyMs: 150,
          requestId: 'req-test-ai',
        }),
      };
      const synthServiceSuccess = new NotesService(mockSuccessGateway);

      const aiResult = await synthServiceSuccess.synthesizeNoteProposal({
        userId: userA._id,
        topicId: topicA._id,
      });

      expect(aiResult.proposal.provenance.aiMetadata.source).toBe('ai');
      expect(aiResult.proposal.provenance.aiMetadata.provider).toBe('groq');
      expect(aiResult.proposal.provenance.aiMetadata.model).toBe('openai/gpt-oss-20b');
      expect(aiResult.proposal.proposedBlocks[0].origin).toBe('ai'); // Normalized to 'ai'
    });

    it('prevents concurrent proposal approval / rejection race conditions', async () => {
      const proposal = {
        _id: new mongoose.Types.ObjectId(),
        noteDocumentId: new mongoose.Types.ObjectId(),
        userId: userA._id,
        status: 'approved', // Already approved
        riskAssessment: { reasons: [] },
      };
      noteProposalsStore.set(proposal._id.toString(), proposal);

      // Attempting to reject an approved proposal must fail atomically
      let error = null;
      try {
        await notesService.rejectProposal({
          userId: userA._id,
          proposalId: proposal._id,
        });
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.code).toBe('INVALID_PROPOSAL_STATUS');
    });
  });

  // ==============================================================================
  // 5. REST API ENDPOINTS & TENANT ISOLATION
  // ==============================================================================
  describe('REST API Endpoints & Security Isolation', () => {
    it('GET /api/v1/topics/:topicId/note returns 404 when no note exists', async () => {
      const res = await request(app)
        .get(`/api/v1/topics/${topicA._id}/note`)
        .set('Cookie', sessionCookieA);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOTE_NOT_FOUND');
    });

    it('POST /api/v1/topics/:topicId/note creates initial note', async () => {
      vi.spyOn(NoteVersion.prototype, 'save').mockImplementation(async function () {
        noteVersionsStore.set(this._id.toString(), this);
        return this;
      });
      vi.spyOn(NoteDocument.prototype, 'save').mockImplementation(async function () {
        noteDocumentsStore.set(this._id.toString(), this);
        return this;
      });

      const res = await request(app)
        .post(`/api/v1/topics/${topicA._id}/note`)
        .set('Cookie', sessionCookieA)
        .send({
          title: 'LSM Tree Study Guide',
          blocks: [
            {
              type: 'heading',
              content: { level: 1, text: 'LSM Tree Study Guide' },
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currentVersionNumber).toBe(1);
    });

    it('prevents cross-tenant access to another user note', async () => {
      const noteDocA = {
        _id: new mongoose.Types.ObjectId(),
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        title: 'User A Secret Note',
        currentVersionNumber: 1,
        currentVersionId: new mongoose.Types.ObjectId(),
      };
      noteDocumentsStore.set(noteDocA._id.toString(), noteDocA);

      // User B attempts to access User A's note
      const res = await request(app)
        .get(`/api/v1/notes/${noteDocA._id}`)
        .set('Cookie', sessionCookieB);

      expect(res.status).toBe(404);
    });

    it('rejects unauthenticated requests on note routes', async () => {
      const res = await request(app).get('/api/v1/notes');
      expect(res.status).toBe(401);
    });
  });
});
