import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { UserSession } from '../src/models/UserSession.js';
import { Subject } from '../src/models/Subject.js';
import { Topic } from '../src/models/Topic.js';
import { Concept } from '../src/models/Concept.js';
import { ConceptLearningState } from '../src/models/ConceptLearningState.js';
import { ProcessedStudyTurn } from '../src/models/ProcessedStudyTurn.js';
import { TopicLearningStateFence } from '../src/models/TopicLearningStateFence.js';
import { hashSessionToken, generateSessionToken } from '../src/utils/authCrypto.js';

describe('Phase 09 Checkpoint 3: Learning State Read APIs & Route Integration', () => {
  let usersStore = new Map();
  let sessionsStore = new Map();
  let userA, userB;
  let cookieA, cookieB;

  let subjectA, topicA, conceptA1, conceptA2;
  let subjectB, topicB, conceptB1;

  beforeEach(async () => {
    usersStore.clear();
    sessionsStore.clear();

    const idA = new mongoose.Types.ObjectId().toString();
    userA = {
      _id: idA,
      email: 'usera@learnforge.io',
      normalizedEmail: 'usera@learnforge.io',
      displayName: 'User A',
      status: 'active',
    };
    usersStore.set(idA, userA);

    const tokenA = generateSessionToken();
    sessionsStore.set('session_A', {
      _id: 'session_A',
      userId: idA,
      sessionTokenHash: hashSessionToken(tokenA),
      authMethod: 'otp',
      expiresAt: new Date(Date.now() + 3600000),
      revokedAt: null,
    });
    cookieA = `learnforge_session=${tokenA}`;

    const idB = new mongoose.Types.ObjectId().toString();
    userB = {
      _id: idB,
      email: 'userb@learnforge.io',
      normalizedEmail: 'userb@learnforge.io',
      displayName: 'User B',
      status: 'active',
    };
    usersStore.set(idB, userB);

    const tokenB = generateSessionToken();
    sessionsStore.set('session_B', {
      _id: 'session_B',
      userId: idB,
      sessionTokenHash: hashSessionToken(tokenB),
      authMethod: 'otp',
      expiresAt: new Date(Date.now() + 3600000),
      revokedAt: null,
    });
    cookieB = `learnforge_session=${tokenB}`;

    vi.spyOn(User, 'findById').mockImplementation(async (id) => {
      const u = usersStore.get(id?.toString());
      if (!u) return null;
      return { ...u, save: async () => u };
    });

    vi.spyOn(UserSession, 'findOne').mockImplementation(async (query) => {
      const hash = query.sessionTokenHash;
      for (const s of sessionsStore.values()) {
        if (s.sessionTokenHash === hash) {
          return {
            ...s,
            save: async function () {
              sessionsStore.set(s._id, { ...s, ...this });
              return this;
            },
          };
        }
      }
      return null;
    });

    // Seed test hierarchy for User A
    subjectA = {
      _id: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(idA),
      title: 'Computer Science',
      name: 'Computer Science',
      status: 'active',
    };

    topicA = {
      _id: new mongoose.Types.ObjectId(),
      subjectId: subjectA._id,
      userId: new mongoose.Types.ObjectId(idA),
      title: 'Memory Management',
      name: 'Memory Management',
      order: 1,
    };

    conceptA1 = {
      _id: new mongoose.Types.ObjectId(),
      topicId: topicA._id,
      subjectId: subjectA._id,
      userId: new mongoose.Types.ObjectId(idA),
      name: 'Stack Memory',
      prerequisites: [],
      order: 1,
    };

    conceptA2 = {
      _id: new mongoose.Types.ObjectId(),
      topicId: topicA._id,
      subjectId: subjectA._id,
      userId: new mongoose.Types.ObjectId(idA),
      name: 'Heap Allocation',
      prerequisites: [conceptA1._id],
      order: 2,
    };

    // User B hierarchy
    subjectB = {
      _id: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(idB),
      title: 'Chemistry',
      name: 'Chemistry',
      status: 'active',
    };

    topicB = {
      _id: new mongoose.Types.ObjectId(),
      subjectId: subjectB._id,
      userId: new mongoose.Types.ObjectId(idB),
      title: 'Organic Chemistry',
      name: 'Organic Chemistry',
      order: 1,
    };

    conceptB1 = {
      _id: new mongoose.Types.ObjectId(),
      topicId: topicB._id,
      subjectId: subjectB._id,
      userId: new mongoose.Types.ObjectId(idB),
      name: 'Alkanes',
      prerequisites: [],
      order: 1,
    };

    vi.spyOn(Subject, 'findOne').mockImplementation((query) => {
      const s = [subjectA, subjectB].find((item) => {
        if (query._id && item._id.toString() !== query._id.toString()) return false;
        if (query.userId && item.userId.toString() !== query.userId.toString()) return false;
        return true;
      });
      return {
        lean: () => Promise.resolve(s || null),
      };
    });

    vi.spyOn(Topic, 'findOne').mockImplementation((query) => {
      const t = [topicA, topicB].find((item) => {
        if (query._id && item._id.toString() !== query._id.toString()) return false;
        if (query.userId && item.userId.toString() !== query.userId.toString()) return false;
        return true;
      });
      return {
        lean: () => Promise.resolve(t || null),
      };
    });

    vi.spyOn(Topic, 'find').mockImplementation((query) => {
      const list = [topicA, topicB].filter((item) => {
        if (query.subjectId && item.subjectId.toString() !== query.subjectId.toString()) return false;
        if (query.userId && item.userId.toString() !== query.userId.toString()) return false;
        return true;
      });
      return {
        sort: () => ({
          lean: () => Promise.resolve(list),
        }),
        lean: () => Promise.resolve(list),
      };
    });

    vi.spyOn(Concept, 'findOne').mockImplementation((query) => {
      const c = [conceptA1, conceptA2, conceptB1].find((item) => {
        if (query._id && item._id.toString() !== query._id.toString()) return false;
        if (query.userId && item.userId.toString() !== query.userId.toString()) return false;
        return true;
      });
      return {
        lean: () => Promise.resolve(c || null),
      };
    });

    vi.spyOn(Concept, 'find').mockImplementation((query) => {
      const list = [conceptA1, conceptA2, conceptB1].filter((item) => {
        if (query.subjectId && item.subjectId.toString() !== query.subjectId.toString()) return false;
        if (query.topicId && item.topicId.toString() !== query.topicId.toString()) return false;
        if (query.userId && item.userId.toString() !== query.userId.toString()) return false;
        return true;
      });
      return {
        sort: () => ({
          lean: () => Promise.resolve(list),
        }),
        lean: () => Promise.resolve(list),
      };
    });

    vi.spyOn(ConceptLearningState, 'findOne').mockImplementation(() => ({
      lean: () => Promise.resolve(null),
    }));

    vi.spyOn(ConceptLearningState, 'find').mockImplementation(() => ({
      lean: () => Promise.resolve([]),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. GET /api/v1/learning-state/concepts/:conceptId returns synthesized NOT_STARTED state', async () => {
    const res = await request(app)
      .get(`/api/v1/learning-state/concepts/${conceptA1._id}`)
      .set('Cookie', cookieA);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.conceptId.toString()).toBe(conceptA1._id.toString());
    expect(res.body.data.state.status).toBe('NOT_STARTED');
    expect(res.body.data.state.masteryScore).toBe(0);
    expect(res.body.meta.requestId).toBeDefined();
    expect(res.body.meta.evaluationTimestamp).toBeDefined();
  });

  it('2. GET /api/v1/learning-state/topics/:topicId returns complete summary and paginated concepts', async () => {
    const res = await request(app)
      .get(`/api/v1/learning-state/topics/${topicA._id}`)
      .set('Cookie', cookieA);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.topicId.toString()).toBe(topicA._id.toString());
    expect(res.body.data.summary.totalConcepts).toBe(2);
    expect(res.body.data.summary.notStartedConcepts).toBe(2);
    expect(res.body.data.concepts).toHaveLength(2);
    expect(res.body.meta.pagination.total).toBe(2);
    expect(res.body.meta.requestId).toBeDefined();
  });

  it('3. GET /api/v1/learning-state/subjects/:subjectId returns subject-wide rollup', async () => {
    const res = await request(app)
      .get(`/api/v1/learning-state/subjects/${subjectA._id}`)
      .set('Cookie', cookieA);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.subjectId.toString()).toBe(subjectA._id.toString());
    expect(res.body.data.summary.totalTopics).toBe(1);
    expect(res.body.data.summary.totalConcepts).toBe(2);
    expect(res.body.data.topics).toHaveLength(1);
  });

  it('4. GET /api/v1/learning-state/priorities returns globally transitive ranking with root blocker first', async () => {
    const res = await request(app)
      .get(`/api/v1/learning-state/priorities?subjectId=${subjectA._id}`)
      .set('Cookie', cookieA);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.recommendations).toHaveLength(2);

    // Concept A1 (Stack Memory, root blocker) must precede Concept A2 (Heap Allocation, gated by A1)
    expect(res.body.data.recommendations[0].conceptId.toString()).toBe(conceptA1._id.toString());
    expect(res.body.data.recommendations[0].rankTier).toBe(1);
    expect(res.body.data.recommendations[0].recommendationReason).toBe('ROOT_PREREQUISITE_BLOCKER');

    expect(res.body.data.recommendations[1].conceptId.toString()).toBe(conceptA2._id.toString());
    expect(res.body.data.recommendations[1].rankTier).toBe(3); // Tier 3 Gated
  });

  it('5. Tenant isolation: User A cannot access User B resources (returns 404)', async () => {
    const resConcept = await request(app)
      .get(`/api/v1/learning-state/concepts/${conceptB1._id}`)
      .set('Cookie', cookieA);
    expect(resConcept.status).toBe(404);

    const resTopic = await request(app)
      .get(`/api/v1/learning-state/topics/${topicB._id}`)
      .set('Cookie', cookieA);
    expect(resTopic.status).toBe(404);

    const resSubject = await request(app)
      .get(`/api/v1/learning-state/subjects/${subjectB._id}`)
      .set('Cookie', cookieA);
    expect(resSubject.status).toBe(404);
  });

  it('6. Strict Read Immutability: GET requests perform zero database write mutations', async () => {
    const saveSpy = vi.spyOn(mongoose.Model.prototype, 'save');
    const updateSpy = vi.spyOn(ConceptLearningState, 'updateOne');
    const deleteSpy = vi.spyOn(ConceptLearningState, 'deleteMany');

    await request(app).get(`/api/v1/learning-state/concepts/${conceptA1._id}`).set('Cookie', cookieA);
    await request(app).get(`/api/v1/learning-state/topics/${topicA._id}`).set('Cookie', cookieA);
    await request(app).get(`/api/v1/learning-state/subjects/${subjectA._id}`).set('Cookie', cookieA);
    await request(app).get(`/api/v1/learning-state/priorities?subjectId=${subjectA._id}`).set('Cookie', cookieA);

    expect(saveSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('7. Rebuild endpoint responds and calls rebuildTopicLearningState', async () => {
    const { learningStateService } = await import('../src/services/learningStateService.js');
    vi.spyOn(learningStateService, 'rebuildTopicLearningState').mockResolvedValue({
      topicId: topicA._id,
      rebuiltConceptsCount: 2,
      processedTurnsCount: 0,
      fencedClosureTopics: [topicA._id.toString()],
      rebuiltAt: new Date(),
    });

    const res = await request(app)
      .post(`/api/v1/learning-state/rebuild/${topicA._id}`)
      .set('Cookie', cookieA);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.rebuiltConceptsCount).toBe(2);
    expect(res.body.meta.requestId).toBeDefined();
  });
});
