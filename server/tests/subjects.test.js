import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { UserSession } from '../src/models/UserSession.js';
import { Subject } from '../src/models/Subject.js';
import { Topic } from '../src/models/Topic.js';
import { Chat } from '../src/models/Chat.js';
import { Message } from '../src/models/Message.js';
import { SyllabusVersion } from '../src/models/SyllabusVersion.js';
import { Annotation } from '../src/models/Annotation.js';
import { hashSessionToken, generateSessionToken } from '../src/utils/authCrypto.js';

describe('Subjects & Topics API (/api/v1/subjects, /api/v1/topics)', () => {
  // In-Memory Database Stores for Deterministic Testing
  let usersStore = new Map();
  let sessionsStore = new Map();
  let subjectsStore = new Map();
  let topicsStore = new Map();

  // Test users
  let userA, userB;
  let sessionCookieA, sessionCookieB;

  beforeEach(() => {
    usersStore.clear();
    sessionsStore.clear();
    subjectsStore.clear();
    topicsStore.clear();

    // 1. Mock User model
    vi.spyOn(User, 'findById').mockImplementation(async (id) => {
      const u = usersStore.get(id?.toString());
      if (!u) return null;
      return { ...u, save: async () => u };
    });

    vi.spyOn(User, 'findOne').mockImplementation(async (query) => {
      for (const u of usersStore.values()) {
        if (query.normalizedEmail && u.normalizedEmail === query.normalizedEmail) return u;
      }
      return null;
    });

    // 2. Mock UserSession model
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

    // 3. Mock Subject model
    vi.spyOn(Subject, 'find').mockImplementation((filter) => {
      return {
        sort: (sortOptions) => {
          let list = Array.from(subjectsStore.values()).filter((s) => {
            if (filter.userId && s.userId.toString() !== filter.userId.toString()) return false;
            if (filter.status && s.status !== filter.status) return false;
            if (filter.$or) {
              const matched = filter.$or.some((condition) => {
                if (condition.name && condition.name.test(s.name)) return true;
                if (condition.description && condition.description.test(s.description)) return true;
                return false;
              });
              if (!matched) return false;
            }
            return true;
          });

          if (sortOptions?.normalizedName) {
            list.sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));
          } else {
            list.sort((a, b) => b.updatedAt - a.updatedAt);
          }
          return Promise.resolve(list);
        },
      };
    });

    vi.spyOn(Subject, 'findOne').mockImplementation(async (query) => {
      for (const s of subjectsStore.values()) {
        if (query._id && typeof query._id === 'object' && query._id.$ne) {
          if (s._id.toString() === query._id.$ne.toString()) continue;
        } else if (query._id && s._id.toString() !== query._id.toString()) {
          continue;
        }
        if (query.userId && s.userId.toString() !== query.userId.toString()) continue;
        if (query.normalizedName && s.normalizedName !== query.normalizedName) continue;
        return {
          ...s,
          save: async function () {
            subjectsStore.set(s._id, { ...s, ...this, updatedAt: new Date() });
            return this;
          },
          deleteOne: async function () {
            subjectsStore.delete(s._id);
            return { deletedCount: 1 };
          },
        };
      }
      return null;
    });

    vi.spyOn(Subject, 'create').mockImplementation(async (data) => {
      const id = new mongoose.Types.ObjectId().toString();
      const doc = {
        _id: id,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
        save: async function () {
          subjectsStore.set(id, { ...this, updatedAt: new Date() });
          return this;
        },
      };
      subjectsStore.set(id, doc);
      return doc;
    });

    vi.spyOn(Subject, 'deleteOne').mockImplementation(async (query) => {
      if (query._id) {
        subjectsStore.delete(query._id.toString());
      }
      return { deletedCount: 1 };
    });

    vi.spyOn(Subject, 'updateOne').mockImplementation(async (query, update) => {
      for (const s of subjectsStore.values()) {
        if (query._id && s._id.toString() !== query._id.toString()) continue;
        if (query.userId && s.userId.toString() !== query.userId.toString()) continue;
        if (update.$inc?.topicsCount) {
          s.topicsCount = Math.max(0, (s.topicsCount || 0) + update.$inc.topicsCount);
        }
        return { modifiedCount: 1 };
      }
      return { modifiedCount: 0 };
    });

    // 4. Mock Topic model
    vi.spyOn(Topic, 'find').mockImplementation((filter) => {
      return {
        sort: (sortOptions) => {
          let list = Array.from(topicsStore.values()).filter((t) => {
            if (filter.subjectId && t.subjectId.toString() !== filter.subjectId.toString()) return false;
            if (filter.userId && t.userId.toString() !== filter.userId.toString()) return false;
            return true;
          });

          list.sort((a, b) => a.orderIndex - b.orderIndex);
          return Promise.resolve(list);
        },
      };
    });

    vi.spyOn(Topic, 'findOne').mockImplementation((query) => {
      const findDoc = () => {
        for (const t of topicsStore.values()) {
          if (query._id && typeof query._id === 'object' && query._id.$ne) {
            if (t._id.toString() === query._id.$ne.toString()) continue;
          } else if (query._id && t._id.toString() !== query._id.toString()) {
            continue;
          }
          if (query.userId && t.userId.toString() !== query.userId.toString()) continue;
          if (query.subjectId && t.subjectId.toString() !== query.subjectId.toString()) continue;
          if (query.normalizedTitle && t.normalizedTitle !== query.normalizedTitle) continue;
          return {
            ...t,
            save: async function () {
              topicsStore.set(t._id, { ...t, ...this, updatedAt: new Date() });
              return this;
            },
            deleteOne: async function () {
              topicsStore.delete(t._id);
              return { deletedCount: 1 };
            },
          };
        }
        return null;
      };

      const result = findDoc();
      return {
        sort: (sortOptions) => {
          if (sortOptions?.orderIndex === -1) {
            const list = Array.from(topicsStore.values())
              .filter((t) => !query.subjectId || t.subjectId.toString() === query.subjectId.toString())
              .sort((a, b) => b.orderIndex - a.orderIndex);
            return Promise.resolve(list[0] || null);
          }
          return Promise.resolve(result);
        },
        then: (resolve) => resolve(result),
      };
    });

    vi.spyOn(Topic, 'create').mockImplementation(async (data) => {
      const id = new mongoose.Types.ObjectId().toString();
      const doc = {
        _id: id,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
        save: async function () {
          topicsStore.set(id, { ...this, updatedAt: new Date() });
          return this;
        },
      };
      topicsStore.set(id, doc);
      return doc;
    });

    vi.spyOn(Topic, 'countDocuments').mockImplementation(async (query) => {
      return Array.from(topicsStore.values()).filter((t) => {
        if (query.subjectId && t.subjectId.toString() !== query.subjectId.toString()) return false;
        if (query.userId && t.userId.toString() !== query.userId.toString()) return false;
        return true;
      }).length;
    });

    vi.spyOn(Topic, 'deleteMany').mockImplementation(async (query) => {
      let count = 0;
      for (const [key, t] of Array.from(topicsStore.entries())) {
        if (query.subjectId && t.subjectId.toString() !== query.subjectId.toString()) continue;
        if (query.userId && t.userId.toString() !== query.userId.toString()) continue;
        topicsStore.delete(key);
        count++;
      }
      return { deletedCount: count };
    });

    vi.spyOn(Topic, 'deleteOne').mockImplementation(async (query) => {
      if (query._id) {
        topicsStore.delete(query._id.toString());
      }
      return { deletedCount: 1 };
    });

    // Mock Chat, Message, SyllabusVersion & Annotation for cascade operations
    vi.spyOn(Chat, 'find').mockImplementation(async () => []);
    vi.spyOn(Chat, 'countDocuments').mockResolvedValue(0);
    vi.spyOn(Chat, 'deleteMany').mockResolvedValue({ deletedCount: 0 });
    vi.spyOn(Message, 'find').mockImplementation(async () => []);
    vi.spyOn(Message, 'deleteMany').mockResolvedValue({ deletedCount: 0 });
    vi.spyOn(SyllabusVersion, 'deleteMany').mockResolvedValue({ deletedCount: 0 });
    vi.spyOn(Annotation, 'deleteMany').mockResolvedValue({ deletedCount: 0 });

    // Create User A and User B
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
    sessionCookieA = `learnforge_session=${tokenA}`;

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
    sessionCookieB = `learnforge_session=${tokenB}`;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* -------------------------------------------------------------
   * 1. AUTHENTICATION PROTECTION
   * ------------------------------------------------------------- */
  describe('Authentication Enforcement', () => {
    it('rejects unauthenticated requests to /subjects with 401', async () => {
      const res = await request(app).get('/api/v1/subjects');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });

    it('rejects unauthenticated POST /subjects with 401', async () => {
      const res = await request(app).post('/api/v1/subjects').send({ name: 'Physics' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });

    it('rejects unauthenticated requests to /topics/:id with 401', async () => {
      const validId = new mongoose.Types.ObjectId().toString();
      const res = await request(app).get(`/api/v1/topics/${validId}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });
  });

  /* -------------------------------------------------------------
   * 2. SUBJECTS CRUD & VALIDATION
   * ------------------------------------------------------------- */
  describe('Subject Management', () => {
    it('creates a subject with valid input', async () => {
      const res = await request(app)
        .post('/api/v1/subjects')
        .set('Cookie', sessionCookieA)
        .send({
          name: 'Distributed Systems',
          description: 'Consensus protocols, Raft, Paxos',
          color: '#3b82f6',
          targetMasteryLevel: 'advanced',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.subject.name).toBe('Distributed Systems');
      expect(res.body.data.subject.targetMasteryLevel).toBe('advanced');
      expect(res.body.data.subject.topicsCount).toBe(0);
    });

    it('rejects subject creation with empty name', async () => {
      const res = await request(app)
        .post('/api/v1/subjects')
        .set('Cookie', sessionCookieA)
        .send({ name: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects subject creation with name exceeding 120 characters', async () => {
      const res = await request(app)
        .post('/api/v1/subjects')
        .set('Cookie', sessionCookieA)
        .send({ name: 'A'.repeat(125) });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it.each(['beginner', 'intermediate', 'advanced', 'comprehensive'])(
      'accepts subject creation with valid targetMasteryLevel: %s',
      async (level) => {
        const res = await request(app)
          .post('/api/v1/subjects')
          .set('Cookie', sessionCookieA)
          .send({
            name: `Subject with ${level}`,
            targetMasteryLevel: level,
          });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.subject.targetMasteryLevel).toBe(level);
      }
    );

    it('rejects subject creation with invalid targetMasteryLevel', async () => {
      const res = await request(app)
        .post('/api/v1/subjects')
        .set('Cookie', sessionCookieA)
        .send({
          name: 'Invalid Mastery Subject',
          targetMasteryLevel: 'expert_ninja',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details[0].field).toBe('targetMasteryLevel');
    });

    it('updates subject targetMasteryLevel to comprehensive', async () => {
      const createRes = await request(app)
        .post('/api/v1/subjects')
        .set('Cookie', sessionCookieA)
        .send({ name: 'Subject to Update Mastery', targetMasteryLevel: 'beginner' });
      const subjectId = createRes.body.data.subject.id;

      const updateRes = await request(app)
        .put(`/api/v1/subjects/${subjectId}`)
        .set('Cookie', sessionCookieA)
        .send({ targetMasteryLevel: 'comprehensive' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.subject.targetMasteryLevel).toBe('comprehensive');
    });

    it('rejects subject update with invalid targetMasteryLevel', async () => {
      const createRes = await request(app)
        .post('/api/v1/subjects')
        .set('Cookie', sessionCookieA)
        .send({ name: 'Subject to Fail Mastery Update', targetMasteryLevel: 'beginner' });
      const subjectId = createRes.body.data.subject.id;

      const updateRes = await request(app)
        .put(`/api/v1/subjects/${subjectId}`)
        .set('Cookie', sessionCookieA)
        .send({ targetMasteryLevel: 'unsupported_level' });

      expect(updateRes.status).toBe(400);
      expect(updateRes.body.error.code).toBe('VALIDATION_ERROR');
      expect(updateRes.body.error.details[0].field).toBe('targetMasteryLevel');
    });

    it('prevents creating duplicate subject names for the same user (case-insensitive)', async () => {
      await request(app)
        .post('/api/v1/subjects')
        .set('Cookie', sessionCookieA)
        .send({ name: 'Linear Algebra' });

      const duplicateRes = await request(app)
        .post('/api/v1/subjects')
        .set('Cookie', sessionCookieA)
        .send({ name: 'linear algebra' });

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body.error.code).toBe('CONFLICT');
    });

    it('lists subjects belonging exclusively to the authenticated user', async () => {
      // User A creates 2 subjects
      await request(app).post('/api/v1/subjects').set('Cookie', sessionCookieA).send({ name: 'Compilers' });
      await request(app).post('/api/v1/subjects').set('Cookie', sessionCookieA).send({ name: 'Databases' });

      // User B creates 1 subject
      await request(app).post('/api/v1/subjects').set('Cookie', sessionCookieB).send({ name: 'Machine Learning' });

      const resA = await request(app).get('/api/v1/subjects').set('Cookie', sessionCookieA);
      expect(resA.status).toBe(200);
      expect(resA.body.data.subjects).toHaveLength(2);
      expect(resA.body.data.subjects.map((s) => s.name)).toContain('Compilers');
      expect(resA.body.data.subjects.map((s) => s.name)).toContain('Databases');
      expect(resA.body.data.subjects.map((s) => s.name)).not.toContain('Machine Learning');

      const resB = await request(app).get('/api/v1/subjects').set('Cookie', sessionCookieB);
      expect(resB.status).toBe(200);
      expect(resB.body.data.subjects).toHaveLength(1);
      expect(resB.body.data.subjects[0].name).toBe('Machine Learning');
    });

    it('updates subject details and rejects duplicate rename', async () => {
      const createRes = await request(app)
        .post('/api/v1/subjects')
        .set('Cookie', sessionCookieA)
        .send({ name: 'Math' });
      const subjectId = createRes.body.data.subject.id;

      await request(app)
        .post('/api/v1/subjects')
        .set('Cookie', sessionCookieA)
        .send({ name: 'Physics' });

      // Valid update
      const updateRes = await request(app)
        .put(`/api/v1/subjects/${subjectId}`)
        .set('Cookie', sessionCookieA)
        .send({ description: 'Advanced Mathematics', targetMasteryLevel: 'advanced' });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.subject.description).toBe('Advanced Mathematics');

      // Duplicate rename rejected
      const duplicateRenameRes = await request(app)
        .put(`/api/v1/subjects/${subjectId}`)
        .set('Cookie', sessionCookieA)
        .send({ name: 'physics' });
      expect(duplicateRenameRes.status).toBe(409);
      expect(duplicateRenameRes.body.error.code).toBe('CONFLICT');
    });

    it('deletes a subject and cascade deletes child topics', async () => {
      const createRes = await request(app)
        .post('/api/v1/subjects')
        .set('Cookie', sessionCookieA)
        .send({ name: 'Operating Systems' });
      const subjectId = createRes.body.data.subject.id;

      // Add 2 child topics
      await request(app)
        .post(`/api/v1/subjects/${subjectId}/topics`)
        .set('Cookie', sessionCookieA)
        .send({ title: 'Process Scheduling' });
      await request(app)
        .post(`/api/v1/subjects/${subjectId}/topics`)
        .set('Cookie', sessionCookieA)
        .send({ title: 'Virtual Memory' });

      expect(topicsStore.size).toBe(2);

      // Delete subject
      const deleteRes = await request(app)
        .delete(`/api/v1/subjects/${subjectId}`)
        .set('Cookie', sessionCookieA);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.data.cascadeDeletedTopicsCount).toBe(2);
      expect(subjectsStore.has(subjectId)).toBe(false);
      expect(topicsStore.size).toBe(0);
    });
  });

  /* -------------------------------------------------------------
   * 3. TOPICS CRUD & ORDERING
   * ------------------------------------------------------------- */
  describe('Topics Management & Knowledge Structure', () => {
    let subjectId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/subjects')
        .set('Cookie', sessionCookieA)
        .send({ name: 'Computer Networks' });
      subjectId = res.body.data.subject.id;
    });

    it('creates topics sequentially and updates parent subject topicsCount', async () => {
      const topic1 = await request(app)
        .post(`/api/v1/subjects/${subjectId}/topics`)
        .set('Cookie', sessionCookieA)
        .send({ title: 'OSI Model', keyConcepts: ['physical', 'transport', 'application'] });

      expect(topic1.status).toBe(201);
      expect(topic1.body.data.topic.title).toBe('OSI Model');
      expect(topic1.body.data.topic.orderIndex).toBe(0);
      expect(topic1.body.data.topic.knowledgeState.keyConcepts).toEqual(['physical', 'transport', 'application']);

      const topic2 = await request(app)
        .post(`/api/v1/subjects/${subjectId}/topics`)
        .set('Cookie', sessionCookieA)
        .send({ title: 'TCP/IP Handshake' });

      expect(topic2.status).toBe(201);
      expect(topic2.body.data.topic.orderIndex).toBe(1);

      // Subject count updated
      const subj = subjectsStore.get(subjectId);
      expect(subj.topicsCount).toBe(2);
    });

    it('rejects duplicate topic title within same subject', async () => {
      await request(app)
        .post(`/api/v1/subjects/${subjectId}/topics`)
        .set('Cookie', sessionCookieA)
        .send({ title: 'DNS Resolution' });

      const dup = await request(app)
        .post(`/api/v1/subjects/${subjectId}/topics`)
        .set('Cookie', sessionCookieA)
        .send({ title: 'dns resolution' });

      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('CONFLICT');
    });

    it('updates topic status and knowledge state', async () => {
      const res = await request(app)
        .post(`/api/v1/subjects/${subjectId}/topics`)
        .set('Cookie', sessionCookieA)
        .send({ title: 'Routing Algorithms' });
      const topicId = res.body.data.topic.id;

      const updateRes = await request(app)
        .put(`/api/v1/topics/${topicId}`)
        .set('Cookie', sessionCookieA)
        .send({
          status: 'in_progress',
          summary: 'Dijkstra and Bellman-Ford shortest path algorithms.',
          masteryScore: 65,
          keyConcepts: ['link-state', 'distance-vector'],
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.topic.status).toBe('in_progress');
      expect(updateRes.body.data.topic.knowledgeState.masteryScore).toBe(65);
      expect(updateRes.body.data.topic.knowledgeState.summary).toContain('Dijkstra');
    });

    it('deletes topic and decrements parent subject topic count', async () => {
      const res = await request(app)
        .post(`/api/v1/subjects/${subjectId}/topics`)
        .set('Cookie', sessionCookieA)
        .send({ title: 'BGP' });
      const topicId = res.body.data.topic.id;

      expect(subjectsStore.get(subjectId).topicsCount).toBe(1);

      const delRes = await request(app)
        .delete(`/api/v1/topics/${topicId}`)
        .set('Cookie', sessionCookieA);

      expect(delRes.status).toBe(200);
      expect(topicsStore.has(topicId)).toBe(false);
      expect(subjectsStore.get(subjectId).topicsCount).toBe(0);
    });
  });

  /* -------------------------------------------------------------
   * 4. CRITICAL: CROSS-TENANT ISOLATION & AUTHORIZATION
   * ------------------------------------------------------------- */
  describe('Cross-Tenant Security & Ownership Boundaries', () => {
    let subjectA_Id;
    let topicA_Id;

    beforeEach(async () => {
      // User A creates subject and topic
      const sRes = await request(app)
        .post('/api/v1/subjects')
        .set('Cookie', sessionCookieA)
        .send({ name: 'Private Architecture Notes' });
      subjectA_Id = sRes.body.data.subject.id;

      const tRes = await request(app)
        .post(`/api/v1/subjects/${subjectA_Id}/topics`)
        .set('Cookie', sessionCookieA)
        .send({ title: 'Microkernel Pattern' });
      topicA_Id = tRes.body.data.topic.id;
    });

    it('prevents User B from accessing User A subject (returns 404)', async () => {
      const res = await request(app)
        .get(`/api/v1/subjects/${subjectA_Id}`)
        .set('Cookie', sessionCookieB);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('prevents User B from updating User A subject', async () => {
      const res = await request(app)
        .put(`/api/v1/subjects/${subjectA_Id}`)
        .set('Cookie', sessionCookieB)
        .send({ name: 'Hijacked Subject' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(subjectsStore.get(subjectA_Id).name).toBe('Private Architecture Notes');
    });

    it('prevents User B from deleting User A subject', async () => {
      const res = await request(app)
        .delete(`/api/v1/subjects/${subjectA_Id}`)
        .set('Cookie', sessionCookieB);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(subjectsStore.has(subjectA_Id)).toBe(true);
    });

    it('prevents User B from creating a topic inside User A subject', async () => {
      const res = await request(app)
        .post(`/api/v1/subjects/${subjectA_Id}/topics`)
        .set('Cookie', sessionCookieB)
        .send({ title: 'Injected Topic' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('prevents User B from listing topics of User A subject', async () => {
      const res = await request(app)
        .get(`/api/v1/subjects/${subjectA_Id}/topics`)
        .set('Cookie', sessionCookieB);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('prevents User B from getting, modifying, or deleting User A topic', async () => {
      // Get
      const getRes = await request(app)
        .get(`/api/v1/topics/${topicA_Id}`)
        .set('Cookie', sessionCookieB);
      expect(getRes.status).toBe(404);

      // Put
      const putRes = await request(app)
        .put(`/api/v1/topics/${topicA_Id}`)
        .set('Cookie', sessionCookieB)
        .send({ title: 'Hijacked Title' });
      expect(putRes.status).toBe(404);
      expect(topicsStore.get(topicA_Id).title).toBe('Microkernel Pattern');

      // Delete
      const delRes = await request(app)
        .delete(`/api/v1/topics/${topicA_Id}`)
        .set('Cookie', sessionCookieB);
      expect(delRes.status).toBe(404);
      expect(topicsStore.has(topicA_Id)).toBe(true);
    });

    it('allows User B to create a subject with the same name in their own namespace', async () => {
      const res = await request(app)
        .post('/api/v1/subjects')
        .set('Cookie', sessionCookieB)
        .send({ name: 'Private Architecture Notes' });

      expect(res.status).toBe(201);
      expect(res.body.data.subject.name).toBe('Private Architecture Notes');
      expect(res.body.data.subject.id).not.toBe(subjectA_Id);
    });
  });
});
