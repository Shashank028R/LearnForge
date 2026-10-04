import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { UserSession } from '../src/models/UserSession.js';
import { Subject } from '../src/models/Subject.js';
import { Topic } from '../src/models/Topic.js';
import { Chat } from '../src/models/Chat.js';
import { Message } from '../src/models/Message.js';
import { SyllabusVersion } from '../src/models/SyllabusVersion.js';
import { Concept, normalizeConceptName } from '../src/models/Concept.js';
import { LearningEvent } from '../src/models/LearningEvent.js';
import { EventExtractor } from '../src/knowledge/extraction/eventExtractor.js';
import { ConceptResolver } from '../src/knowledge/resolution/conceptResolver.js';
import { LearningStateMachine, LEARNING_STATES } from '../src/knowledge/state/learningStateMachine.js';
import { KnowledgeEngineService } from '../src/knowledge/services/knowledgeEngineService.js';
import { hashSessionToken, generateSessionToken } from '../src/utils/authCrypto.js';
import { AI_TASK_TYPES } from '../src/ai/schemas/tasks.js';

describe('Phase 06 — Knowledge Extraction Engine & Pedagogical Analysis', () => {
  let userA, userB;
  let sessionTokenA, sessionCookieA;
  let sessionTokenB, sessionCookieB;
  let subjectA, topicA, approvedSyllabusA;

  let conceptsStore = new Map();
  let learningEventsStore = new Map();
  let usersStore = new Map();
  let sessionsStore = new Map();
  let subjectsStore = new Map();
  let topicsStore = new Map();
  let chatsStore = new Map();
  let messagesStore = new Map();
  let syllabusStore = new Map();

  beforeEach(() => {
    conceptsStore.clear();
    learningEventsStore.clear();
    usersStore.clear();
    sessionsStore.clear();
    subjectsStore.clear();
    topicsStore.clear();
    chatsStore.clear();
    messagesStore.clear();
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
      title: 'Systems Programming in Rust',
      name: 'Systems Programming in Rust',
      description: 'Memory safety without garbage collection',
      status: 'active',
    };
    subjectsStore.set(subjectA._id.toString(), subjectA);

    topicA = {
      _id: new mongoose.Types.ObjectId(),
      userId: userA._id,
      subjectId: subjectA._id,
      title: 'Ownership and Borrowing',
      normalizedTitle: 'ownership and borrowing',
      description: 'Affine type system and borrow checker mechanics',
      status: 'not_started',
      knowledgeState: {
        masteryScore: 0,
        keyConcepts: [],
        summary: '',
        lastStudiedAt: null,
      },
      save: async function () {
        topicsStore.set(this._id.toString(), this);
        return this;
      },
    };
    topicsStore.set(topicA._id.toString(), topicA);

    approvedSyllabusA = {
      _id: new mongoose.Types.ObjectId(),
      userId: userA._id,
      subjectId: subjectA._id,
      version: 1,
      title: 'Rust Core Curriculum',
      status: 'approved',
      sections: [
        {
          title: 'Memory Management',
          topics: [{ title: 'Ownership and Borrowing' }],
        },
      ],
    };
    syllabusStore.set(approvedSyllabusA._id.toString(), approvedSyllabusA);

    // Mongoose Mocks for fast unit/integration testing
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
      if (doc && doc.userId.toString() === query.userId?.toString()) return doc;
      return null;
    });

    vi.spyOn(Topic, 'findOne').mockImplementation(async (query) => {
      const doc = topicsStore.get(query._id?.toString());
      if (!doc) return null;
      if (query.userId && doc.userId.toString() !== query.userId.toString()) return null;
      if (query.subjectId && doc.subjectId.toString() !== query.subjectId.toString()) return null;
      return doc;
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

    vi.spyOn(Concept, 'findOne').mockImplementation((query) => ({
      session: async () => {
        for (const c of conceptsStore.values()) {
          if (c.userId.toString() !== query.userId?.toString()) continue;
          if (c.topicId.toString() !== query.topicId?.toString()) continue;

          if (query.normalizedName && c.normalizedName === query.normalizedName) {
            return c;
          }
          if (query.$or) {
            for (const orClause of query.$or) {
              if (orClause.normalizedAliases && c.normalizedAliases?.includes(orClause.normalizedAliases)) {
                return c;
              }
            }
          }
        }
        return null;
      },
    }));

    vi.spyOn(Concept, 'find').mockImplementation((query) => ({
      session: async () => {
        const results = [];
        for (const c of conceptsStore.values()) {
          if (c.userId.toString() === query.userId?.toString() && c.topicId.toString() === query.topicId?.toString()) {
            results.push(c);
          }
        }
        return results;
      },
      sort: () => ({
        lean: async () => {
          const results = [];
          for (const c of conceptsStore.values()) {
            if (c.userId.toString() === query.userId?.toString() && c.topicId.toString() === query.topicId?.toString()) {
              results.push(c);
            }
          }
          return results;
        },
      }),
    }));

    vi.spyOn(LearningEvent, 'findOne').mockImplementation(async (query) => {
      for (const ev of learningEventsStore.values()) {
        if (ev.userId.toString() === query.userId?.toString()) {
          if (query.idempotencyKey && ev.idempotencyKey === query.idempotencyKey) {
            return ev;
          }
          if (query.$or && Array.isArray(query.$or)) {
            const matchesOr = query.$or.some((clause) => {
              if (clause.idempotencyKey && ev.idempotencyKey === clause.idempotencyKey) return true;
              if (clause.sourceMessageId && ev.sourceMessageId?.toString() === clause.sourceMessageId?.toString()) return true;
              return false;
            });
            if (matchesOr) return ev;
          }
        }
      }
      return null;
    });

    vi.spyOn(LearningEvent, 'find').mockImplementation((query) => ({
      sort: () => ({
        limit: () => ({
          lean: async () => {
            const results = [];
            for (const ev of learningEventsStore.values()) {
              if (ev.userId.toString() === query.userId?.toString()) {
                if (!query.topicId || ev.topicId.toString() === query.topicId.toString()) {
                  if (!query.conceptId || ev.conceptId?.toString() === query.conceptId.toString()) {
                    results.push(ev);
                  }
                }
              }
            }
            return results;
          },
        }),
      }),
    }));

    vi.spyOn(mongoose, 'startSession').mockImplementation(async () => ({
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
    }));

    vi.spyOn(Concept.prototype, 'save').mockImplementation(async function () {
      conceptsStore.set(this._id.toString(), this);
      return this;
    });

    vi.spyOn(LearningEvent.prototype, 'save').mockImplementation(async function () {
      if (!this.isNew && this.isNew !== undefined) {
        throw new Error('LearningEvent is an immutable append-only audit ledger and cannot be updated, replaced, or modified.');
      }
      learningEventsStore.set(this.idempotencyKey, this);
      return this;
    });
  });

  describe('1. Concept Identity & Resolution Layer', () => {
    it('normalizes concept names and aliases reliably', () => {
      expect(normalizeConceptName('Borrow Checker')).toBe('borrow checker');
      expect(normalizeConceptName('  Binary Search Tree (BST)  ')).toBe('binary search tree bst');
      expect(normalizeConceptName('ownership-and-borrowing')).toBe('ownership-and-borrowing');
      expect(normalizeConceptName('')).toBe('');
    });

    it('resolves a brand new concept as NEW', async () => {
      const resolver = new ConceptResolver();
      const resolution = await resolver.resolveConcept({
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        candidateName: 'Lifetimes',
        aliases: ['lifetime annotations', "'a"],
        proposedOutcome: 'NEW',
      });

      expect(resolution.isNew).toBe(true);
      expect(resolution.classificationOutcome).toBe('NEW');
      expect(resolution.resolvedName).toBe('Lifetimes');
      expect(resolution.concept).toBeNull();
    });

    it('resolves an exact normalized name match as EXISTING', async () => {
      const conceptId = new mongoose.Types.ObjectId();
      const existingConcept = {
        _id: conceptId,
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        name: 'Borrow Checker',
        normalizedName: 'borrow checker',
        aliases: [],
        normalizedAliases: [],
        status: 'INTRODUCED',
        confidenceScore: 20,
        evidenceCount: 1,
        save: async function () {
          conceptsStore.set(this._id.toString(), this);
          return this;
        },
      };
      conceptsStore.set(conceptId.toString(), existingConcept);

      const resolver = new ConceptResolver();
      const resolution = await resolver.resolveConcept({
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        candidateName: 'borrow checker',
        aliases: ['the borrow checker'],
        proposedOutcome: 'EXISTING',
      });

      expect(resolution.isNew).toBe(false);
      expect(resolution.classificationOutcome).toBe('EXISTING');
      expect(resolution.concept._id.toString()).toBe(conceptId.toString());
      expect(resolution.concept.aliases).toContain('the borrow checker');
    });

    it('resolves via normalized alias and prevents duplicate concept creation', async () => {
      const conceptId = new mongoose.Types.ObjectId();
      const existingConcept = {
        _id: conceptId,
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        name: 'Binary Search Tree',
        normalizedName: 'binary search tree',
        aliases: ['BST'],
        normalizedAliases: ['bst'],
        status: 'LEARNING',
        confidenceScore: 40,
        evidenceCount: 2,
        save: async function () {
          conceptsStore.set(this._id.toString(), this);
          return this;
        },
      };
      conceptsStore.set(conceptId.toString(), existingConcept);

      const resolver = new ConceptResolver();
      const resolution = await resolver.resolveConcept({
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        candidateName: 'BST',
        aliases: [],
        proposedOutcome: 'DUPLICATE',
      });

      expect(resolution.isNew).toBe(false);
      expect(resolution.classificationOutcome).toBe('DUPLICATE');
      expect(resolution.concept._id.toString()).toBe(conceptId.toString());
      expect(resolution.resolvedName).toBe('Binary Search Tree');
    });
  });

  describe('2. Learning State Machine & Bounded Confidence Calculations', () => {
    const sm = new LearningStateMachine();

    it('transitions newly introduced concept from NOT_STARTED to INTRODUCED with score 25', () => {
      const res = sm.evaluateTransition({
        currentConcept: null,
        eventData: {
          eventType: 'concept_introduced',
          classificationOutcome: 'NEW',
          confidenceDelta: 15,
        },
      });

      expect(res.previousStatus).toBeNull();
      expect(res.newStatus).toBe(LEARNING_STATES.INTRODUCED);
      expect(res.confidenceScore).toBe(25);
      expect(res.evidenceCount).toBe(1);
    });

    it('advances INTRODUCED concept to LEARNING upon detailed explanation reaching score >= 40', () => {
      const res = sm.evaluateTransition({
        currentConcept: {
          status: LEARNING_STATES.INTRODUCED,
          confidenceScore: 30,
          evidenceCount: 1,
        },
        eventData: {
          eventType: 'concept_explained',
          classificationOutcome: 'COMPLEMENTARY',
          confidenceDelta: 25,
        },
      });

      expect(res.previousStatus).toBe(LEARNING_STATES.INTRODUCED);
      expect(res.newStatus).toBe(LEARNING_STATES.LEARNING);
      expect(res.confidenceScore).toBeGreaterThanOrEqual(40);
    });

    it('advances LEARNING concept to UNDERSTOOD after active recall and sufficient evidence (E >= 3, score >= 70)', () => {
      const res = sm.evaluateTransition({
        currentConcept: {
          status: LEARNING_STATES.LEARNING,
          confidenceScore: 65,
          evidenceCount: 2,
        },
        eventData: {
          eventType: 'concept_recalled',
          classificationOutcome: 'EXISTING',
          confidenceDelta: 20,
        },
      });

      expect(res.newStatus).toBe(LEARNING_STATES.UNDERSTOOD);
      expect(res.confidenceScore).toBeGreaterThanOrEqual(70);
    });

    it('advances UNDERSTOOD concept to STRONG after repeated successful reinforcement (E >= 5, score >= 90)', () => {
      const res = sm.evaluateTransition({
        currentConcept: {
          status: LEARNING_STATES.UNDERSTOOD,
          confidenceScore: 88,
          evidenceCount: 4,
        },
        eventData: {
          eventType: 'concept_reinforced',
          classificationOutcome: 'EXISTING',
          confidenceDelta: 20,
        },
      });

      expect(res.newStatus).toBe(LEARNING_STATES.STRONG);
      expect(res.confidenceScore).toBeGreaterThanOrEqual(90);
    });

    it('regresses concept to NEEDS_REVIEW upon detected misconception with score penalty', () => {
      const res = sm.evaluateTransition({
        currentConcept: {
          status: LEARNING_STATES.UNDERSTOOD,
          confidenceScore: 70,
          evidenceCount: 3,
        },
        eventData: {
          eventType: 'misconception_detected',
          classificationOutcome: 'CORRECTION',
          misconception: {
            misconceptionText: 'Rust allows multiple mutable references at once',
            correctionText: 'Rust enforces aliasing XOR mutability at compile time',
            severity: 'high',
          },
        },
      });

      expect(res.newStatus).toBe(LEARNING_STATES.NEEDS_REVIEW);
      expect(res.confidenceScore).toBeLessThanOrEqual(50);
    });

    it('recovers from NEEDS_REVIEW back to LEARNING upon valid correction', () => {
      const res = sm.evaluateTransition({
        currentConcept: {
          status: LEARNING_STATES.NEEDS_REVIEW,
          confidenceScore: 40,
          evidenceCount: 4,
        },
        eventData: {
          eventType: 'concept_corrected',
          classificationOutcome: 'CORRECTION',
          misconception: null,
        },
      });

      expect(res.newStatus).toBe(LEARNING_STATES.LEARNING);
      expect(res.confidenceScore).toBeGreaterThan(40);
    });

    it('evaluates topic aggregate masteryScore and status accurately', () => {
      const topicAggregate1 = sm.evaluateTopicAggregate([]);
      expect(topicAggregate1.masteryScore).toBe(0);
      expect(topicAggregate1.status).toBe('not_started');

      const concepts = [
        { name: 'Ownership', status: 'STRONG', confidenceScore: 90 },
        { name: 'Borrowing', status: 'UNDERSTOOD', confidenceScore: 80 },
        { name: 'Lifetimes', status: 'UNDERSTOOD', confidenceScore: 85 },
      ];
      const topicAggregate2 = sm.evaluateTopicAggregate(concepts);
      expect(topicAggregate2.masteryScore).toBe(85);
      expect(topicAggregate2.status).toBe('mastered');
      expect(topicAggregate2.keyConcepts).toEqual(['Ownership', 'Borrowing', 'Lifetimes']);

      const mixedConcepts = [
        { name: 'Ownership', status: 'STRONG', confidenceScore: 90 },
        { name: 'Lifetimes', status: 'NEEDS_REVIEW', confidenceScore: 40 },
      ];
      const topicAggregate3 = sm.evaluateTopicAggregate(mixedConcepts);
      expect(topicAggregate3.masteryScore).toBe(65);
      expect(topicAggregate3.status).toBe('in_progress');
    });
  });

  describe('3. Event Extractor & AI Integration', () => {
    it('extracts valid structured events from mock AI Gateway response', async () => {
      const mockGateway = {
        generate: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            events: [
              {
                conceptName: 'Aliasing XOR Mutability',
                aliases: ['borrow checker invariant'],
                eventType: 'concept_explained',
                classificationOutcome: 'NEW',
                evidenceText: 'References can be either shared or unique, but never both simultaneously.',
                suggestedStatus: 'INTRODUCED',
                confidenceDelta: 15,
                misconception: { hasMisconception: false },
              },
            ],
            topicSummaryUpdate: 'Focuses on compile-time memory safety invariants.',
            rationale: 'Core pedagogical principle introduced',
          }),
          metadata: { provider: 'groq', model: 'openai/gpt-oss-120b', latencyMs: 250 },
        }),
      };

      const extractor = new EventExtractor(mockGateway);
      const result = await extractor.extractExchangeEvents({
        userMessage: { content: 'Can I have two mutable references to the same variable?' },
        assistantMessage: { content: 'No, Rust enforces Aliasing XOR Mutability.' },
        subjectContext: { name: 'Rust' },
        topicContext: { title: 'Ownership' },
        userId: userA._id,
      });

      expect(result.events).toHaveLength(1);
      expect(result.events[0].conceptName).toBe('Aliasing XOR Mutability');
      expect(result.events[0].classificationOutcome).toBe('NEW');
      expect(result.metadata.provider).toBe('groq');
      expect(result.metadata.model).toBe('openai/gpt-oss-120b');
    });

    it('falls back to deterministic extraction when AI Gateway fails', async () => {
      const mockFailingGateway = {
        generate: vi.fn().mockRejectedValue(new Error('AI Gateway 503 Unavailable')),
      };

      const extractor = new EventExtractor(mockFailingGateway);
      const result = await extractor.extractExchangeEvents({
        userMessage: { content: 'What is the borrow checker?' },
        assistantMessage: { content: 'The borrow checker is a compiler component that verifies lifetime invariants.' },
        topicContext: { title: 'Borrow Checker' },
        userId: userA._id,
      });

      expect(result.events).toHaveLength(1);
      expect(result.events[0].conceptName).toBe('Borrow Checker');
      expect(result.extractionSource).toBe('deterministic_rule');
    });
  });

  describe('4. Knowledge Engine Service Pipeline & Governance', () => {
    it('excludes off-topic messages from mutating canonical knowledge state', async () => {
      const engine = new KnowledgeEngineService();
      const result = await engine.processExchangeEvidence({
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        chatId: new mongoose.Types.ObjectId(),
        sourceMessageId: new mongoose.Types.ObjectId(),
        userMessage: { content: 'How do I cook pasta?', knowledgeContext: { relevance: 'off_topic' } },
        assistantMessage: { content: 'Boil water first.', knowledgeContext: { relevance: 'off_topic' } },
      });

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('off_topic_exclusion');
    });

    it('enforces idempotency on re-processing the same message', async () => {
      const engine = new KnowledgeEngineService();
      const messageId = new mongoose.Types.ObjectId();
      const idempotencyKey = `${userA._id}:${messageId}:v1.0`;

      learningEventsStore.set(idempotencyKey, {
        userId: userA._id,
        idempotencyKey,
      });

      const result = await engine.processExchangeEvidence({
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        chatId: new mongoose.Types.ObjectId(),
        sourceMessageId: messageId,
        userMessage: { content: 'Tell me about ownership.' },
        assistantMessage: { content: 'Each value in Rust has an owner.' },
      });

      expect(result.skipped).toBe(true);
      expect(result.duplicate).toBe(true);
      expect(result.reason).toBe('already_processed');
    });
  });

  describe('5. REST APIs & Security Tenant Boundaries', () => {
    it('returns 401 Unauthorized for GET /api/v1/topics/:topicId/concepts without auth cookie', async () => {
      const res = await request(app).get(`/api/v1/topics/${topicA._id}/concepts`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 when User B tries to inspect User A topic concepts (Tenant Isolation)', async () => {
      const res = await request(app)
        .get(`/api/v1/topics/${topicA._id}/concepts`)
        .set('Cookie', sessionCookieB);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('lists topic concepts successfully for authenticated owner', async () => {
      const conceptId = new mongoose.Types.ObjectId();
      conceptsStore.set(conceptId.toString(), {
        _id: conceptId,
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        name: 'Borrow Checker',
        normalizedName: 'borrow checker',
        aliases: ['borrowck'],
        status: 'UNDERSTOOD',
        confidenceScore: 75,
        evidenceCount: 3,
        misconceptions: [],
        conflictState: { hasConflict: false },
        lastStudiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get(`/api/v1/topics/${topicA._id}/concepts`)
        .set('Cookie', sessionCookieA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.concepts).toHaveLength(1);
      expect(res.body.data.concepts[0].name).toBe('Borrow Checker');
      expect(res.body.data.concepts[0].status).toBe('UNDERSTOOD');
      expect(res.body.data.concepts[0].confidenceScore).toBe(75);
    });

    it('retrieves concept details and associated learning events', async () => {
      const conceptId = new mongoose.Types.ObjectId();
      conceptsStore.set(conceptId.toString(), {
        _id: conceptId,
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        name: 'RAII',
        normalizedName: 'raii',
        aliases: ['Resource Acquisition Is Initialization'],
        status: 'LEARNING',
        confidenceScore: 50,
        evidenceCount: 2,
        misconceptions: [],
        conflictState: { hasConflict: false },
        lastStudiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.spyOn(Concept, 'findOne').mockImplementation(async (query) => {
        const c = conceptsStore.get(query._id?.toString());
        if (c && c.userId.toString() === query.userId?.toString()) return c;
        return null;
      });

      const res = await request(app)
        .get(`/api/v1/concepts/${conceptId}`)
        .set('Cookie', sessionCookieA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.concept.name).toBe('RAII');
      expect(res.body.data.learningEvents).toBeDefined();
    });

    it('rejects cross-tenant concept inspection with 404', async () => {
      const conceptId = new mongoose.Types.ObjectId();
      conceptsStore.set(conceptId.toString(), {
        _id: conceptId,
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        name: 'Private Concept',
        normalizedName: 'private concept',
        status: 'INTRODUCED',
        confidenceScore: 20,
      });

      vi.spyOn(Concept, 'findOne').mockImplementation(async (query) => {
        const c = conceptsStore.get(query._id?.toString());
        if (c && c.userId.toString() === query.userId?.toString()) return c;
        return null;
      });

      const res = await request(app)
        .get(`/api/v1/concepts/${conceptId}`)
        .set('Cookie', sessionCookieB);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('rejects forged or cross-tenant message extraction requests on manual extraction endpoint', async () => {
      const otherChatId = new mongoose.Types.ObjectId();
      const fakeMsgId = new mongoose.Types.ObjectId();

      vi.spyOn(Chat, 'findOne').mockImplementation(async (query) => {
        const c = chatsStore.get(query._id?.toString());
        if (c && c.userId.toString() === query.userId?.toString() && c.topicId.toString() === query.topicId?.toString()) {
          return c;
        }
        return null;
      });

      vi.spyOn(Message, 'findOne').mockImplementation(async (query) => {
        const m = messagesStore.get(query._id?.toString());
        if (m && m.userId.toString() === query.userId?.toString() && m.chatId.toString() === query.chatId?.toString() && m.role === query.role) {
          return m;
        }
        return null;
      });

      // 1. Missing fields
      const res1 = await request(app)
        .post(`/api/v1/topics/${topicA._id}/extract-knowledge`)
        .set('Cookie', sessionCookieA)
        .send({});
      expect(res1.status).toBe(400);

      // 2. Chat does not exist or belong to user
      const res2 = await request(app)
        .post(`/api/v1/topics/${topicA._id}/extract-knowledge`)
        .set('Cookie', sessionCookieA)
        .send({
          chatId: otherChatId,
          userMessageId: fakeMsgId,
          assistantMessageId: fakeMsgId,
        });
      expect(res2.status).toBe(404);

      // 3. User message unpersisted / role invalid
      const validChat = {
        _id: new mongoose.Types.ObjectId(),
        userId: userA._id,
        topicId: topicA._id,
      };
      chatsStore.set(validChat._id.toString(), validChat);

      const res3 = await request(app)
        .post(`/api/v1/topics/${topicA._id}/extract-knowledge`)
        .set('Cookie', sessionCookieA)
        .send({
          chatId: validChat._id,
          userMessageId: fakeMsgId,
          assistantMessageId: fakeMsgId,
        });
      expect(res3.status).toBe(400);
      expect(res3.body.error.code).toBe('INVALID_EVIDENCE');
    });
  });

  describe('6. P0 & P1 Regression Gates (AIGateway Contract, Transactions & Immutability)', () => {
    it('P0-1: EventExtractor consumes normalized AIGateway response ({ text, provider, model, usage })', async () => {
      const mockGateway = {
        generate: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            events: [
              {
                conceptName: 'Smart Pointers',
                aliases: ['Box', 'Rc', 'Arc'],
                eventType: 'concept_explained',
                classificationOutcome: 'NEW',
                evidenceText: 'Box provides heap allocation in Rust.',
                confidenceDelta: 15,
              },
            ],
            topicSummaryUpdate: 'Introduces pointer types',
          }),
          provider: 'groq',
          model: 'llama-3.3-70b-versatile',
          task: AI_TASK_TYPES.KNOWLEDGE_EVENT_EXTRACTION,
          usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
          routingMetadata: { attempt: 1 },
          requestId: 'req-contract-test',
        }),
      };

      const extractor = new EventExtractor(mockGateway);
      const result = await extractor.extractExchangeEvents({
        userMessage: { content: 'What is Box<T>?' },
        assistantMessage: { content: 'Box<T> is a smart pointer for heap allocation.' },
        topicContext: { title: 'Smart Pointers' },
        userId: userA._id,
      });

      expect(result.events).toHaveLength(1);
      expect(result.events[0].conceptName).toBe('Smart Pointers');
      expect(result.metadata.provider).toBe('groq');
      expect(result.metadata.model).toBe('llama-3.3-70b-versatile');
      expect(result.metadata.usage.totalTokens).toBe(150);
    });

    it('P0-2: Fails safely when MongoDB transaction support is unavailable', async () => {
      vi.spyOn(mongoose, 'startSession').mockRejectedValueOnce(new Error('Standalone MongoDB does not support transactions'));

      const engine = new KnowledgeEngineService();
      await expect(
        engine.processExchangeEvidence({
          userId: userA._id,
          subjectId: subjectA._id,
          topicId: topicA._id,
          chatId: new mongoose.Types.ObjectId(),
          sourceMessageId: new mongoose.Types.ObjectId(),
          userMessage: { content: 'Explain borrow checker.' },
          assistantMessage: { content: 'Borrow checker ensures references are valid.' },
        })
      ).rejects.toThrow('Knowledge state mutations require MongoDB multi-document transaction support');
    });

    it('P0-3: Enforces append-only immutability on LearningEvent instances and pre-hooks', async () => {
      const event = new LearningEvent({
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        chatId: new mongoose.Types.ObjectId(),
        sourceMessageId: new mongoose.Types.ObjectId(),
        conceptName: 'Immutable Concept',
        eventType: 'concept_introduced',
        classificationOutcome: 'NEW',
        evidenceText: 'Historical evidence line',
        confidenceScore: 25,
        newStatus: 'INTRODUCED',
        idempotencyKey: 'test-immutability-key',
      });

      // Mark as not new to test save mutation rejection
      event.isNew = false;
      await expect(event.save()).rejects.toThrow('LearningEvent is an immutable append-only audit ledger');

      // Test all query-level mutation hooks on LearningEvent schema
      const schema = LearningEvent.schema;
      expect(schema.s.hooks._pres.has('updateOne')).toBe(true);
      expect(schema.s.hooks._pres.has('updateMany')).toBe(true);
      expect(schema.s.hooks._pres.has('findOneAndUpdate')).toBe(true);
      expect(schema.s.hooks._pres.has('replaceOne')).toBe(true);
      expect(schema.s.hooks._pres.has('findOneAndReplace')).toBe(true);
      expect(schema.s.hooks._pres.has('deleteOne')).toBe(true);
      expect(schema.s.hooks._pres.has('deleteMany')).toBe(true);
      expect(schema.s.hooks._pres.has('findOneAndDelete')).toBe(true);

      // Test bulkWrite mutation and deletion rejection
      await expect(
        LearningEvent.bulkWrite([{ updateOne: { filter: { _id: event._id }, update: { confidenceScore: 100 } } }])
      ).rejects.toThrow('LearningEvent is an immutable append-only audit ledger');

      await expect(
        LearningEvent.bulkWrite([{ deleteOne: { filter: { _id: event._id } } }])
      ).rejects.toThrow('LearningEvent is an immutable append-only audit ledger');
    });

    it('P1-MultiEvent: Enforces exchange-level idempotency for 1, 3, and 10 events', async () => {
      const fakeGateway = {
        generate: vi.fn(),
      };
      const engine = new KnowledgeEngineService(fakeGateway);
      const sourceMsgId = new mongoose.Types.ObjectId();
      const chatId = new mongoose.Types.ObjectId();

      // Test 3 events extracted from single exchange
      fakeGateway.generate.mockResolvedValueOnce({
        text: JSON.stringify({
          events: [
            { conceptName: 'Event 1 Concept', eventType: 'concept_introduced', classificationOutcome: 'NEW' },
            { conceptName: 'Event 2 Concept', eventType: 'concept_introduced', classificationOutcome: 'NEW' },
            { conceptName: 'Event 3 Concept', eventType: 'concept_introduced', classificationOutcome: 'NEW' },
          ],
        }),
        provider: 'groq',
        model: 'openai/gpt-oss-120b',
      });

      const firstRes = await engine.processExchangeEvidence({
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        chatId,
        sourceMessageId: sourceMsgId,
        userMessage: { content: 'Explain 3 concepts.' },
        assistantMessage: { content: 'Here are 3 concepts.' },
      });

      expect(firstRes.success).toBe(true);
      expect(firstRes.learningEvents.length).toBe(3);
      expect(firstRes.learningEvents[0].idempotencyKey).toBe(`${userA._id}:${sourceMsgId}:v1.0`);
      expect(firstRes.learningEvents[1].idempotencyKey).toBe(`${userA._id}:${sourceMsgId}:v1.0:e1`);
      expect(firstRes.learningEvents[2].idempotencyKey).toBe(`${userA._id}:${sourceMsgId}:v1.0:e2`);

      // Repeated processing attempt for same exchange must be deduplicated
      const repeatRes = await engine.processExchangeEvidence({
        userId: userA._id,
        subjectId: subjectA._id,
        topicId: topicA._id,
        chatId,
        sourceMessageId: sourceMsgId,
        userMessage: { content: 'Explain 3 concepts.' },
        assistantMessage: { content: 'Here are 3 concepts.' },
      });

      expect(repeatRes.skipped).toBe(true);
      expect(repeatRes.duplicate).toBe(true);
      expect(repeatRes.reason).toBe('already_processed');
    });

    it('P1-CorrectionPrecedence: Recovers from NEEDS_REVIEW when extractor output contains misconception payload', () => {
      const sm = new LearningStateMachine();

      // Given a concept in NEEDS_REVIEW
      const currentConcept = {
        status: LEARNING_STATES.NEEDS_REVIEW,
        confidenceScore: 30,
        evidenceCount: 1,
      };

      // When an extractor emits concept_corrected with misconception details attached
      const eventData = {
        eventType: 'concept_corrected',
        classificationOutcome: 'CORRECTION',
        misconception: {
          misconceptionText: 'Learner thought AST retains punctuation',
          correctionText: 'AST discards redundant punctuation',
          severity: 'medium',
        },
      };

      const transition = sm.evaluateTransition({ currentConcept, eventData });

      // Then correction precedence takes effect and status recovers to LEARNING
      expect(transition.newStatus).toBe(LEARNING_STATES.LEARNING);
      expect(transition.confidenceScore).toBe(45); // 30 + 15
      expect(transition.evidenceCount).toBe(2);
    });

    it('P1-DuplicateFormula: Applies authoritative bounded increase formula for duplicate evidence', () => {
      const sm = new LearningStateMachine();

      // At score 0 -> increase is 5
      expect(sm._applyBoundedIncrease(0, 5)).toBe(5);

      // At score 50 -> factor = 1 - 50/125 = 0.6 -> increase = round(5 * 0.6) = 3 -> score 53
      expect(sm._applyBoundedIncrease(50, 5)).toBe(53);

      // At score 80 -> factor = 1 - 80/125 = 0.36 -> increase = round(5 * 0.36) = 2 -> score 82
      expect(sm._applyBoundedIncrease(80, 5)).toBe(82);

      // At score 95 -> factor = 1 - 95/125 = 0.24 -> increase = round(5 * 0.24) = 1 -> score 96
      expect(sm._applyBoundedIncrease(95, 5)).toBe(96);

      // At score 100 -> stays 100
      expect(sm._applyBoundedIncrease(100, 5)).toBe(100);
    });

    it('P1-1 & P1-2: Verifies all state transition boundaries and confidence formula invariants', () => {
      const sm = new LearningStateMachine();

      // 1 Evidence -> INTRODUCED
      const t1 = sm.evaluateTransition({
        currentConcept: null,
        eventData: { eventType: 'concept_introduced', classificationOutcome: 'NEW' },
      });
      expect(t1.newStatus).toBe(LEARNING_STATES.INTRODUCED);
      expect(t1.confidenceScore).toBe(25);
      expect(t1.evidenceCount).toBe(1);

      // 2 Evidence, score 39 -> INTRODUCED (< 40)
      const t2_low = sm.evaluateTransition({
        currentConcept: { status: LEARNING_STATES.INTRODUCED, confidenceScore: 20, evidenceCount: 1 },
        eventData: { eventType: 'concept_explained', classificationOutcome: 'COMPLEMENTARY', confidenceDelta: 15 },
      });
      expect(t2_low.confidenceScore).toBeLessThan(40);
      expect(t2_low.newStatus).toBe(LEARNING_STATES.INTRODUCED);

      // 2 Evidence, score >= 40 -> LEARNING
      const t2_high = sm.evaluateTransition({
        currentConcept: { status: LEARNING_STATES.INTRODUCED, confidenceScore: 30, evidenceCount: 1 },
        eventData: { eventType: 'concept_explained', classificationOutcome: 'COMPLEMENTARY', confidenceDelta: 25 },
      });
      expect(t2_high.confidenceScore).toBeGreaterThanOrEqual(40);
      expect(t2_high.newStatus).toBe(LEARNING_STATES.LEARNING);

      // 3 Evidence, score 69 -> LEARNING (< 70)
      const t3_low = sm.evaluateTransition({
        currentConcept: { status: LEARNING_STATES.LEARNING, confidenceScore: 50, evidenceCount: 2 },
        eventData: { eventType: 'concept_explained', classificationOutcome: 'EXISTING', confidenceDelta: 10 },
      });
      expect(t3_low.confidenceScore).toBeLessThan(70);
      expect(t3_low.newStatus).toBe(LEARNING_STATES.LEARNING);

      // 3 Evidence, score >= 70 -> UNDERSTOOD
      const t3_high = sm.evaluateTransition({
        currentConcept: { status: LEARNING_STATES.LEARNING, confidenceScore: 60, evidenceCount: 2 },
        eventData: { eventType: 'concept_recalled', classificationOutcome: 'EXISTING', confidenceDelta: 20 },
      });
      expect(t3_high.confidenceScore).toBeGreaterThanOrEqual(70);
      expect(t3_high.newStatus).toBe(LEARNING_STATES.UNDERSTOOD);

      // 4 Evidence, score 95 -> UNDERSTOOD (evidence count < 5)
      const t4 = sm.evaluateTransition({
        currentConcept: { status: LEARNING_STATES.UNDERSTOOD, confidenceScore: 85, evidenceCount: 3 },
        eventData: { eventType: 'concept_reinforced', classificationOutcome: 'EXISTING', confidenceDelta: 25 },
      });
      expect(t4.confidenceScore).toBeGreaterThanOrEqual(90);
      expect(t4.newStatus).toBe(LEARNING_STATES.UNDERSTOOD);

      // 5 Evidence, score >= 90 -> STRONG
      const t5 = sm.evaluateTransition({
        currentConcept: { status: LEARNING_STATES.UNDERSTOOD, confidenceScore: 90, evidenceCount: 4 },
        eventData: { eventType: 'concept_reinforced', classificationOutcome: 'EXISTING', confidenceDelta: 20 },
      });
      expect(t5.confidenceScore).toBeGreaterThanOrEqual(90);
      expect(t5.newStatus).toBe(LEARNING_STATES.STRONG);

      // Conflict / Misconception -> NEEDS_REVIEW with score penalty
      const t_conflict = sm.evaluateTransition({
        currentConcept: { status: LEARNING_STATES.STRONG, confidenceScore: 95, evidenceCount: 5 },
        eventData: { classificationOutcome: 'CONFLICT', eventType: 'concept_conflict' },
      });
      expect(t_conflict.newStatus).toBe(LEARNING_STATES.NEEDS_REVIEW);
      expect(t_conflict.confidenceScore).toBe(75); // 95 - 20 = 75
    });
  });
});
