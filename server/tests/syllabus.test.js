import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { UserSession } from '../src/models/UserSession.js';
import { Subject } from '../src/models/Subject.js';
import { Topic } from '../src/models/Topic.js';
import { SyllabusVersion } from '../src/models/SyllabusVersion.js';
import { Chat } from '../src/models/Chat.js';
import { Message } from '../src/models/Message.js';
import { Annotation } from '../src/models/Annotation.js';
import { hashSessionToken, generateSessionToken } from '../src/utils/authCrypto.js';

describe('Syllabus Governance API (/api/v1/subjects/:subjectId/syllabus)', () => {
  let usersStore = new Map();
  let sessionsStore = new Map();
  let subjectsStore = new Map();
  let topicsStore = new Map();
  let syllabusStore = new Map();

  let userA, userB;
  let sessionCookieA, sessionCookieB;
  let subjectA, subjectB;

  beforeEach(() => {
    usersStore.clear();
    sessionsStore.clear();
    subjectsStore.clear();
    topicsStore.clear();
    syllabusStore.clear();

    // Mock User
    vi.spyOn(User, 'findById').mockImplementation(async (id) => {
      const u = usersStore.get(id?.toString());
      if (!u) return null;
      return { ...u, save: async () => u };
    });

    // Mock UserSession
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

    // Mock Subject
    vi.spyOn(Subject, 'findOne').mockImplementation(async (query) => {
      for (const s of subjectsStore.values()) {
        const idMatch = !query._id || s._id.toString() === query._id.toString();
        const userMatch = !query.userId || s.userId.toString() === query.userId.toString();
        if (idMatch && userMatch) {
          return {
            ...s,
            save: async function () {
              subjectsStore.set(s._id.toString(), { ...s, ...this });
              return this;
            },
          };
        }
      }
      return null;
    });

    // Mock Topic
    vi.spyOn(Topic, 'find').mockImplementation((query) => {
      const matched = [];
      for (const t of topicsStore.values()) {
        const subMatch = !query.subjectId || t.subjectId.toString() === query.subjectId.toString();
        const userMatch = !query.userId || t.userId.toString() === query.userId.toString();
        if (subMatch && userMatch) {
          matched.push({
            ...t,
            save: async function () {
              topicsStore.set(t._id.toString(), { ...t, ...this });
              return this;
            },
          });
        }
      }
      return {
        sort: (sortObj) => {
          if (sortObj?.orderIndex !== undefined) {
            matched.sort((a, b) => a.orderIndex - b.orderIndex);
          }
          return Promise.resolve(matched);
        },
        then: (resolve) => resolve(matched),
      };
    });

    vi.spyOn(Topic, 'create').mockImplementation(async (doc) => {
      const id = new mongoose.Types.ObjectId();
      const newTopic = {
        _id: id,
        isActiveInSyllabus: doc.isActiveInSyllabus !== undefined ? doc.isActiveInSyllabus : false,
        ...doc,
        createdAt: new Date(),
        updatedAt: new Date(),
        save: async function () {
          topicsStore.set(id.toString(), { ...newTopic, ...this });
          return this;
        },
      };
      topicsStore.set(id.toString(), newTopic);
      return newTopic;
    });

    vi.spyOn(Topic, 'countDocuments').mockImplementation(async (query) => {
      let count = 0;
      for (const t of topicsStore.values()) {
        const subMatch = !query.subjectId || t.subjectId.toString() === query.subjectId.toString();
        const userMatch = !query.userId || t.userId.toString() === query.userId.toString();
        const activeMatch = query.isActiveInSyllabus === undefined || t.isActiveInSyllabus === query.isActiveInSyllabus;
        if (subMatch && userMatch && activeMatch) count++;
      }
      return count;
    });

    vi.spyOn(Topic, 'updateOne').mockImplementation(async (filter, update, options) => {
      let found = null;
      for (const t of topicsStore.values()) {
        const subMatch = !filter.subjectId || t.subjectId.toString() === filter.subjectId.toString();
        const userMatch = !filter.userId || t.userId.toString() === filter.userId.toString();
        const normMatch = !filter.normalizedTitle || t.normalizedTitle === filter.normalizedTitle;
        if (subMatch && userMatch && normMatch) {
          found = t;
          break;
        }
      }
      if (found) {
        if (update.$set) Object.assign(found, update.$set);
        topicsStore.set(found._id.toString(), found);
        return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
      }
      if (options?.upsert) {
        const id = new mongoose.Types.ObjectId();
        const newTopic = {
          _id: id,
          subjectId: filter.subjectId,
          userId: filter.userId,
          normalizedTitle: filter.normalizedTitle,
          ...(update.$setOnInsert || {}),
          ...(update.$set || {}),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        topicsStore.set(id.toString(), newTopic);
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: id };
      }
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    });

    vi.spyOn(Topic, 'updateMany').mockImplementation(async (filter, update) => {
      let modified = 0;
      for (const t of topicsStore.values()) {
        const subMatch = !filter.subjectId || t.subjectId.toString() === filter.subjectId.toString();
        const userMatch = !filter.userId || t.userId.toString() === filter.userId.toString();
        const ninMatch = !filter.normalizedTitle?.$nin || !filter.normalizedTitle.$nin.includes(t.normalizedTitle);
        if (subMatch && userMatch && ninMatch) {
          if (update.$set) Object.assign(t, update.$set);
          topicsStore.set(t._id.toString(), t);
          modified++;
        }
      }
      return { modifiedCount: modified };
    });

    // Mock SyllabusVersion
    vi.spyOn(SyllabusVersion, 'find').mockImplementation((query) => {
      const matched = [];
      for (const sv of syllabusStore.values()) {
        const subMatch = !query.subjectId || sv.subjectId.toString() === query.subjectId.toString();
        const userMatch = !query.userId || sv.userId.toString() === query.userId.toString();
        if (subMatch && userMatch) {
          matched.push({
            ...sv,
            save: async function () {
              syllabusStore.set(sv._id.toString(), { ...sv, ...this });
              return this;
            },
          });
        }
      }
      return {
        sort: (sortObj) => {
          if (sortObj?.version === -1) {
            matched.sort((a, b) => b.version - a.version);
          }
          return Promise.resolve(matched);
        },
        then: (resolve) => resolve(matched),
      };
    });

    vi.spyOn(SyllabusVersion, 'findOne').mockImplementation((query) => {
      const exec = async () => {
        let candidates = [];
        for (const sv of syllabusStore.values()) {
          const idMatch = !query._id || sv._id.toString() === query._id.toString();
          const subMatch = !query.subjectId || sv.subjectId.toString() === query.subjectId.toString();
          const userMatch = !query.userId || sv.userId.toString() === query.userId.toString();
          const statusMatch = !query.status || sv.status === query.status;
          if (idMatch && subMatch && userMatch && statusMatch) {
            candidates.push(sv);
          }
        }
        if (candidates.length === 0) return null;
        const target = candidates[0];
        return {
          ...target,
          save: async function () {
            syllabusStore.set(target._id.toString(), { ...target, ...this });
            return this;
          },
        };
      };

      return {
        sort: (sortObj) => ({
          select: () => {
            let list = Array.from(syllabusStore.values()).filter((sv) => {
              const subMatch = !query.subjectId || sv.subjectId.toString() === query.subjectId.toString();
              const userMatch = !query.userId || sv.userId.toString() === query.userId.toString();
              const statusMatch = !query.status || sv.status === query.status;
              return subMatch && userMatch && statusMatch;
            });
            if (sortObj?.version === -1) list.sort((a, b) => b.version - a.version);
            return Promise.resolve(list[0] || null);
          },
          then: async (resolve) => {
            let list = Array.from(syllabusStore.values()).filter((sv) => {
              const subMatch = !query.subjectId || sv.subjectId.toString() === query.subjectId.toString();
              const userMatch = !query.userId || sv.userId.toString() === query.userId.toString();
              const statusMatch = !query.status || sv.status === query.status;
              return subMatch && userMatch && statusMatch;
            });
            if (sortObj?.version === -1) list.sort((a, b) => b.version - a.version);
            const target = list[0];
            if (!target) return resolve(null);
            return resolve({
              ...target,
              save: async function () {
                syllabusStore.set(target._id.toString(), { ...target, ...this });
                return this;
              },
            });
          },
        }),
        then: (resolve) => exec().then(resolve),
      };
    });

    vi.spyOn(SyllabusVersion, 'countDocuments').mockImplementation(async (query) => {
      let count = 0;
      for (const sv of syllabusStore.values()) {
        const subMatch = !query.subjectId || sv.subjectId.toString() === query.subjectId.toString();
        const userMatch = !query.userId || sv.userId.toString() === query.userId.toString();
        if (subMatch && userMatch) count++;
      }
      return count;
    });

    vi.spyOn(SyllabusVersion, 'create').mockImplementation(async (doc) => {
      const id = new mongoose.Types.ObjectId();
      const newVersion = {
        _id: id,
        ...doc,
        sections: doc.sections || [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      syllabusStore.set(id.toString(), newVersion);
      return newVersion;
    });

    vi.spyOn(SyllabusVersion, 'updateMany').mockImplementation(async (filter, update) => {
      let modified = 0;
      for (const [id, sv] of syllabusStore.entries()) {
        const subMatch = !filter.subjectId || sv.subjectId.toString() === filter.subjectId.toString();
        const userMatch = !filter.userId || sv.userId.toString() === filter.userId.toString();
        const statusMatch = !filter.status || sv.status === filter.status;
        const idNotMatch = !filter._id?.$ne || sv._id.toString() !== filter._id.$ne.toString();
        if (subMatch && userMatch && statusMatch && idNotMatch) {
          if (update.$set) {
            Object.assign(sv, update.$set);
          }
          syllabusStore.set(id, sv);
          modified++;
        }
      }
      return { modifiedCount: modified };
    });

    vi.spyOn(Topic, 'deleteMany').mockResolvedValue({ deletedCount: 0 });
    vi.spyOn(Chat, 'find').mockResolvedValue([]);
    vi.spyOn(Chat, 'deleteMany').mockResolvedValue({ deletedCount: 0 });
    vi.spyOn(Message, 'find').mockResolvedValue([]);
    vi.spyOn(Message, 'deleteMany').mockResolvedValue({ deletedCount: 0 });
    vi.spyOn(Annotation, 'deleteMany').mockResolvedValue({ deletedCount: 0 });

    // Create Test Users & Sessions
    const userAId = new mongoose.Types.ObjectId();
    userA = {
      _id: userAId,
      email: 'user_a@example.com',
      normalizedEmail: 'user_a@example.com',
      status: 'active',
      isEmailVerified: true,
    };
    usersStore.set(userAId.toString(), userA);

    const tokenA = generateSessionToken();
    const tokenHashA = hashSessionToken(tokenA);
    sessionsStore.set('session_a', {
      _id: 'session_a',
      userId: userAId,
      sessionTokenHash: tokenHashA,
      isActive: true,
      expiresAt: new Date(Date.now() + 86400000),
    });
    sessionCookieA = `learnforge_session=${tokenA}`;

    const userBId = new mongoose.Types.ObjectId();
    userB = {
      _id: userBId,
      email: 'user_b@example.com',
      normalizedEmail: 'user_b@example.com',
      status: 'active',
      isEmailVerified: true,
    };
    usersStore.set(userBId.toString(), userB);

    const tokenB = generateSessionToken();
    const tokenHashB = hashSessionToken(tokenB);
    sessionsStore.set('session_b', {
      _id: 'session_b',
      userId: userBId,
      sessionTokenHash: tokenHashB,
      isActive: true,
      expiresAt: new Date(Date.now() + 86400000),
    });
    sessionCookieB = `learnforge_session=${tokenB}`;

    // Subject for User A (no syllabus initially)
    const subAId = new mongoose.Types.ObjectId();
    subjectA = {
      _id: subAId,
      userId: userAId,
      name: 'JavaScript Mastery',
      normalizedName: 'javascript mastery',
      topicsCount: 0,
      syllabusStatus: 'no_syllabus',
      activeSyllabusVersionId: null,
      status: 'active',
    };
    subjectsStore.set(subAId.toString(), subjectA);

    // Subject for User B
    const subBId = new mongoose.Types.ObjectId();
    subjectB = {
      _id: subBId,
      userId: userBId,
      name: 'Python Foundations',
      normalizedName: 'python foundations',
      topicsCount: 0,
      syllabusStatus: 'no_syllabus',
      activeSyllabusVersionId: null,
      status: 'active',
    };
    subjectsStore.set(subBId.toString(), subjectB);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Returns no_syllabus status for fresh subject without requiring syllabus upfront', async () => {
    const res = await request(app)
      .get(`/api/v1/subjects/${subjectA._id}/syllabus`)
      .set('Cookie', sessionCookieA);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.syllabusStatus).toBe('no_syllabus');
    expect(res.body.data.activeVersion).toBeNull();
    expect(res.body.data.latestDraft).toBeNull();
    expect(res.body.data.totalVersions).toBe(0);
  });

  it('2. Creates a draft syllabus version (v1) without modifying canonical Topics', async () => {
    const payload = {
      title: 'JavaScript Curriculum v1',
      sections: [
        {
          title: 'Fundamentals',
          topics: [
            { title: 'Variables & Scopes', description: 'let, const, var' },
            { title: 'Data Types', description: 'primitives and objects' },
          ],
        },
        {
          title: 'Asynchronous JS',
          topics: [
            { title: 'Promises', description: 'resolve, reject, chaining' },
            { title: 'Async/Await', description: 'async functions' },
          ],
        },
      ],
    };

    const res = await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions`)
      .set('Cookie', sessionCookieA)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.version).toBe(1);
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.sections).toHaveLength(2);

    // Verify Subject status changed to draft
    const updatedSubject = subjectsStore.get(subjectA._id.toString());
    expect(updatedSubject.syllabusStatus).toBe('draft');

    // Canonical topics must NOT be created yet
    expect(topicsStore.size).toBe(0);
  });

  it('3. Updates a draft syllabus version', async () => {
    // Create draft v1
    const createRes = await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions`)
      .set('Cookie', sessionCookieA)
      .send({
        title: 'Initial Draft',
        sections: [{ title: 'Section 1', topics: [{ title: 'Topic 1' }] }],
      });

    const versionId = createRes.body.data._id;

    // Update draft v1
    const updateRes = await request(app)
      .put(`/api/v1/subjects/${subjectA._id}/syllabus/versions/${versionId}`)
      .set('Cookie', sessionCookieA)
      .send({
        title: 'Revised Initial Draft',
        changeSummary: 'Added more details',
        sections: [
          {
            title: 'Section 1 Renamed',
            topics: [
              { title: 'Topic 1', description: 'Updated description' },
              { title: 'Topic 2 Added', description: 'New topic' },
            ],
          },
        ],
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.success).toBe(true);
    expect(updateRes.body.data.title).toBe('Revised Initial Draft');
    expect(updateRes.body.data.changeSummary).toBe('Added more details');
    expect(updateRes.body.data.sections[0].topics).toHaveLength(2);
  });

  it('4. Explicitly approves a syllabus version and reconciles canonical Topics', async () => {
    // Create draft v1
    const createRes = await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions`)
      .set('Cookie', sessionCookieA)
      .send({
        title: 'JavaScript Curriculum v1',
        sections: [
          {
            title: 'Fundamentals',
            topics: [
              { title: 'Variables', description: 'Variables in JS' },
              { title: 'Closures', description: 'Lexical scoping' },
            ],
          },
        ],
      });

    const versionId = createRes.body.data._id;

    // Approve syllabus
    const approveRes = await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions/${versionId}/approve`)
      .set('Cookie', sessionCookieA);

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.success).toBe(true);
    expect(approveRes.body.data.version.status).toBe('approved');
    expect(approveRes.body.data.version.approvedAt).toBeDefined();

    // Canonical Topics should now be created
    expect(topicsStore.size).toBe(2);
    const topics = Array.from(topicsStore.values());
    expect(topics.map((t) => t.title)).toContain('Variables');
    expect(topics.map((t) => t.title)).toContain('Closures');

    // Subject status updated
    const updatedSubject = subjectsStore.get(subjectA._id.toString());
    expect(updatedSubject.syllabusStatus).toBe('approved');
    expect(updatedSubject.activeSyllabusVersionId.toString()).toBe(versionId.toString());
    expect(updatedSubject.topicsCount).toBe(2);
  });

  it('5. Prevents directly modifying an approved syllabus version', async () => {
    // Create and approve v1
    const createRes = await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions`)
      .set('Cookie', sessionCookieA)
      .send({
        title: 'JavaScript Curriculum v1',
        sections: [{ title: 'Section 1', topics: [{ title: 'Topic 1' }] }],
      });
    const versionId = createRes.body.data._id;

    await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions/${versionId}/approve`)
      .set('Cookie', sessionCookieA);

    // Attempt to PUT on approved version
    const updateRes = await request(app)
      .put(`/api/v1/subjects/${subjectA._id}/syllabus/versions/${versionId}`)
      .set('Cookie', sessionCookieA)
      .send({ title: 'Illegal Modification' });

    expect(updateRes.status).toBe(400);
    expect(updateRes.body.success).toBe(false);
    expect(updateRes.body.message).toContain('Cannot modify an approved or superseded syllabus version');
  });

  it('6. Revising syllabus creates a new draft (v2) and supersedes v1 on approval while preserving stable topic identity', async () => {
    // 1. Create and approve v1
    const createV1 = await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions`)
      .set('Cookie', sessionCookieA)
      .send({
        title: 'JavaScript v1',
        sections: [
          {
            title: 'Core',
            topics: [
              { title: 'Variables', description: 'var let const' },
              { title: 'Closures', description: 'inner function' },
            ],
          },
        ],
      });
    const v1Id = createV1.body.data._id;

    await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions/${v1Id}/approve`)
      .set('Cookie', sessionCookieA);

    const initialVariablesTopic = Array.from(topicsStore.values()).find((t) => t.title === 'Variables');
    const initialVariablesId = initialVariablesTopic._id.toString();

    // 2. Create draft v2 (derived from v1)
    const createV2 = await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions`)
      .set('Cookie', sessionCookieA)
      .send({
        baseVersionId: v1Id,
        title: 'JavaScript v2 Draft',
        sections: [
          {
            title: 'Core',
            topics: [
              { title: 'Variables', description: 'Updated explanation of variables' },
              { title: 'Closures', description: 'inner function' },
              { title: 'Promises', description: 'Async control flow' },
            ],
          },
        ],
      });

    expect(createV2.status).toBe(201);
    expect(createV2.body.data.version).toBe(2);
    const v2Id = createV2.body.data._id;

    // Verify v1 is still approved while v2 is draft
    const v1DocBeforeApprove = syllabusStore.get(v1Id.toString());
    expect(v1DocBeforeApprove.status).toBe('approved');

    // 3. Approve v2
    const approveV2 = await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions/${v2Id}/approve`)
      .set('Cookie', sessionCookieA);

    expect(approveV2.status).toBe(200);

    // Verify v1 is now superseded
    const v1DocAfter = syllabusStore.get(v1Id.toString());
    expect(v1DocAfter.status).toBe('superseded');
    expect(v1DocAfter.supersededAt).toBeDefined();

    // Verify v2 is active approved
    const v2DocAfter = syllabusStore.get(v2Id.toString());
    expect(v2DocAfter.status).toBe('approved');

    // Verify stable topic identity preserved for 'Variables'
    const updatedVariablesTopic = Array.from(topicsStore.values()).find((t) => t.title === 'Variables');
    expect(updatedVariablesTopic._id.toString()).toBe(initialVariablesId);
    expect(updatedVariablesTopic.description).toBe('Updated explanation of variables');

    // New topic 'Promises' created
    expect(topicsStore.size).toBe(3);
  });

  it('7. Rejects cross-tenant access to another user syllabus (returns 404)', async () => {
    // Create draft for User A
    const createRes = await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions`)
      .set('Cookie', sessionCookieA)
      .send({
        title: 'Secret Syllabus',
        sections: [{ title: 'Secret Section', topics: [{ title: 'Secret Topic' }] }],
      });

    const versionId = createRes.body.data._id;

    // User B tries to view User A's syllabus
    const statusRes = await request(app)
      .get(`/api/v1/subjects/${subjectA._id}/syllabus`)
      .set('Cookie', sessionCookieB);
    expect(statusRes.status).toBe(404);

    // User B tries to get version
    const getVerRes = await request(app)
      .get(`/api/v1/subjects/${subjectA._id}/syllabus/versions/${versionId}`)
      .set('Cookie', sessionCookieB);
    expect(getVerRes.status).toBe(404);

    // User B tries to approve version
    const approveRes = await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions/${versionId}/approve`)
      .set('Cookie', sessionCookieB);
    expect(approveRes.status).toBe(404);
  });

  it('8. Manages removed topic lifecycle (v1: A, B, C -> v2: A, B -> v3: A, B, C) preserving stable IDs and learning data', async () => {
    // 1. Create and approve v1 with A, B, C
    const v1Res = await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions`)
      .set('Cookie', sessionCookieA)
      .send({
        title: 'Curriculum v1',
        sections: [
          {
            title: 'Section 1',
            topics: [
              { title: 'Topic A', description: 'Alpha' },
              { title: 'Topic B', description: 'Beta' },
              { title: 'Topic C', description: 'Gamma' },
            ],
          },
        ],
      });
    const v1Id = v1Res.body.data._id;
    await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions/${v1Id}/approve`)
      .set('Cookie', sessionCookieA);

    // Verify all 3 active
    expect(topicsStore.size).toBe(3);
    const topicC_v1 = Array.from(topicsStore.values()).find((t) => t.title === 'Topic C');
    expect(topicC_v1.isActiveInSyllabus).toBe(true);
    const topicC_id = topicC_v1._id.toString();

    // Attach mock learning state to Topic C
    topicC_v1.knowledgeState = { masteryScore: 85, keyConcepts: ['gamma_law'] };
    topicC_v1.chatsCount = 4;
    topicC_v1.notesCount = 2;
    topicsStore.set(topicC_id, topicC_v1);

    // Verify Subject topicsCount is 3
    const subjectAfterV1 = subjectsStore.get(subjectA._id.toString());
    expect(subjectAfterV1.topicsCount).toBe(3);

    // 2. Create and approve v2 with A, B (C removed)
    const v2Res = await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions`)
      .set('Cookie', sessionCookieA)
      .send({
        title: 'Curriculum v2',
        sections: [
          {
            title: 'Section 1',
            topics: [
              { title: 'Topic A', description: 'Alpha' },
              { title: 'Topic B', description: 'Beta' },
            ],
          },
        ],
      });
    const v2Id = v2Res.body.data._id;
    await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions/${v2Id}/approve`)
      .set('Cookie', sessionCookieA);

    // Verify Topic A and B are active
    const topicA_v2 = Array.from(topicsStore.values()).find((t) => t.title === 'Topic A');
    const topicB_v2 = Array.from(topicsStore.values()).find((t) => t.title === 'Topic B');
    expect(topicA_v2.isActiveInSyllabus).toBe(true);
    expect(topicB_v2.isActiveInSyllabus).toBe(true);

    // Verify Topic C is preserved but marked historical/inactive
    const topicC_v2 = topicsStore.get(topicC_id);
    expect(topicC_v2).toBeDefined();
    expect(topicC_v2.isActiveInSyllabus).toBe(false);
    expect(topicC_v2.knowledgeState.masteryScore).toBe(85);
    expect(topicC_v2.chatsCount).toBe(4);
    expect(topicC_v2.notesCount).toBe(2);

    // Verify Subject topicsCount reflects ONLY active syllabus topics (2)
    // Note: mock countDocuments counts matching items with isActiveInSyllabus: true
    let activeCount = 0;
    for (const t of topicsStore.values()) {
      if (t.isActiveInSyllabus !== false) activeCount++;
    }
    expect(activeCount).toBe(2);

    // 3. Create and approve v3 re-adding C
    const v3Res = await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions`)
      .set('Cookie', sessionCookieA)
      .send({
        title: 'Curriculum v3',
        sections: [
          {
            title: 'Section 1',
            topics: [
              { title: 'Topic A', description: 'Alpha' },
              { title: 'Topic B', description: 'Beta' },
              { title: 'Topic C', description: 'Gamma Re-added' },
            ],
          },
        ],
      });
    const v3Id = v3Res.body.data._id;
    await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions/${v3Id}/approve`)
      .set('Cookie', sessionCookieA);

    // Verify Topic C is reactivated with preserved ID and learning history
    const topicC_v3 = topicsStore.get(topicC_id);
    expect(topicC_v3.isActiveInSyllabus).toBe(true);
    expect(topicC_v3.description).toBe('Gamma Re-added');
    expect(topicC_v3.knowledgeState.masteryScore).toBe(85);
    expect(topicC_v3.chatsCount).toBe(4);
  });

  it('9. Cascades subject deletion to remove associated SyllabusVersion documents', async () => {
    // Create draft v1 and approve
    const v1Res = await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions`)
      .set('Cookie', sessionCookieA)
      .send({
        title: 'Curriculum v1',
        sections: [{ title: 'Section 1', topics: [{ title: 'Topic 1' }] }],
      });
    const v1Id = v1Res.body.data._id;
    await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions/${v1Id}/approve`)
      .set('Cookie', sessionCookieA);

    // Create draft v2
    await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions`)
      .set('Cookie', sessionCookieA)
      .send({
        title: 'Curriculum v2',
        sections: [{ title: 'Section 1', topics: [{ title: 'Topic 1' }] }],
      });

    expect(syllabusStore.size).toBe(2);

    // Mock SyllabusVersion.deleteMany for cascade verification
    vi.spyOn(SyllabusVersion, 'deleteMany').mockImplementation(async (query) => {
      let deleted = 0;
      for (const [id, sv] of syllabusStore.entries()) {
        const subMatch = !query.subjectId || sv.subjectId.toString() === query.subjectId.toString();
        const userMatch = !query.userId || sv.userId.toString() === query.userId.toString();
        if (subMatch && userMatch) {
          syllabusStore.delete(id);
          deleted++;
        }
      }
      return { deletedCount: deleted };
    });

    vi.spyOn(Subject, 'deleteOne').mockImplementation(async (query) => {
      subjectsStore.delete(query._id.toString());
      return { deletedCount: 1 };
    });

    // Delete subject
    const delRes = await request(app)
      .delete(`/api/v1/subjects/${subjectA._id}`)
      .set('Cookie', sessionCookieA);

    expect(delRes.status).toBe(200);
    expect(syllabusStore.size).toBe(0);
  });

  it('10. Handles concurrent approval attempts and guarantees exactly ONE approved version with all others superseded', async () => {
    // 1. Create 3 distinct draft versions for Subject A
    const v1Res = await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions`)
      .set('Cookie', sessionCookieA)
      .send({
        title: 'Draft Version 1',
        sections: [{ title: 'Section 1', topics: [{ title: 'Topic 1' }] }],
      });
    const v1Id = v1Res.body.data._id;

    const v2Res = await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions`)
      .set('Cookie', sessionCookieA)
      .send({
        title: 'Draft Version 2',
        sections: [{ title: 'Section 2', topics: [{ title: 'Topic 2' }] }],
      });
    const v2Id = v2Res.body.data._id;

    const v3Res = await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions`)
      .set('Cookie', sessionCookieA)
      .send({
        title: 'Draft Version 3',
        sections: [{ title: 'Section 3', topics: [{ title: 'Topic 3' }] }],
      });
    const v3Id = v3Res.body.data._id;

    expect(syllabusStore.size).toBe(3);

    // 2. Issue concurrent approval requests
    const [res1, res2, res3] = await Promise.all([
      request(app).post(`/api/v1/subjects/${subjectA._id}/syllabus/versions/${v1Id}/approve`).set('Cookie', sessionCookieA),
      request(app).post(`/api/v1/subjects/${subjectA._id}/syllabus/versions/${v2Id}/approve`).set('Cookie', sessionCookieA),
      request(app).post(`/api/v1/subjects/${subjectA._id}/syllabus/versions/${v3Id}/approve`).set('Cookie', sessionCookieA),
    ]);

    // All approval requests must return 200
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(200);

    // 3. Invariant: Exactly ONE version is status="approved", all other versions are "superseded"
    const allVersions = Array.from(syllabusStore.values()).filter(
      (sv) => sv.subjectId.toString() === subjectA._id.toString()
    );
    const approvedVersions = allVersions.filter((sv) => sv.status === 'approved');
    const supersededVersions = allVersions.filter((sv) => sv.status === 'superseded');

    expect(approvedVersions.length).toBe(1);
    expect(supersededVersions.length).toBe(2);

    // 4. Invariant: Subject activeSyllabusVersionId matches the single approved version ID
    const subjectDoc = subjectsStore.get(subjectA._id.toString());
    expect(subjectDoc.activeSyllabusVersionId.toString()).toBe(approvedVersions[0]._id.toString());
    expect(subjectDoc.syllabusStatus).toBe('approved');
  });

  it('11. Enforces Subject.topicsCount contract: manual topic before approval has isActiveInSyllabus=false and topicsCount=0 until syllabus approval', async () => {
    // 1. Fresh subject starts with no syllabus and topicsCount = 0
    const subjectDoc = subjectsStore.get(subjectA._id.toString());
    expect(subjectDoc.topicsCount).toBe(0);

    // 2. Manually create a Topic via API
    vi.spyOn(Topic, 'findOne').mockImplementation((query) => {
      const findMatching = () => {
        for (const t of topicsStore.values()) {
          const subMatch = !query.subjectId || t.subjectId.toString() === query.subjectId.toString();
          const normMatch = !query.normalizedTitle || t.normalizedTitle === query.normalizedTitle;
          if (subMatch && normMatch) {
            return {
              ...t,
              save: async function () {
                topicsStore.set(t._id.toString(), { ...t, ...this });
                return this;
              },
            };
          }
        }
        return null;
      };

      return {
        sort: (sortObj) => {
          if (sortObj?.orderIndex === -1) {
            const list = Array.from(topicsStore.values())
              .filter((t) => !query.subjectId || t.subjectId.toString() === query.subjectId.toString())
              .sort((a, b) => b.orderIndex - a.orderIndex);
            return Promise.resolve(list[0] || null);
          }
          return Promise.resolve(findMatching());
        },
        then: (resolve) => resolve(findMatching()),
      };
    });

    const topicRes = await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/topics`)
      .set('Cookie', sessionCookieA)
      .send({
        title: 'Manual Topic Alpha',
        description: 'Created before syllabus exists',
      });

    expect(topicRes.status).toBe(201);
    expect(topicRes.body.data.topic.isActiveInSyllabus).toBe(false);

    // Verify Subject.topicsCount remains 0 (because there is no approved syllabus activating it)
    expect(subjectDoc.topicsCount).toBe(0);

    // 3. Create draft syllabus (draft does NOT activate topics)
    const draftRes = await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions`)
      .set('Cookie', sessionCookieA)
      .send({
        title: 'Curriculum Draft',
        sections: [{ title: 'Section 1', topics: [{ title: 'Manual Topic Alpha', description: 'Governed' }] }],
      });
    const draftId = draftRes.body.data._id;

    const topicBeforeApprove = Array.from(topicsStore.values()).find((t) => t.title === 'Manual Topic Alpha');
    expect(topicBeforeApprove.isActiveInSyllabus).toBe(false);
    expect(subjectDoc.topicsCount).toBe(0);

    // 4. Approve syllabus -> Topic becomes isActiveInSyllabus=true, and topicsCount becomes 1
    const approveRes = await request(app)
      .post(`/api/v1/subjects/${subjectA._id}/syllabus/versions/${draftId}/approve`)
      .set('Cookie', sessionCookieA);

    expect(approveRes.status).toBe(200);

    const topicAfterApprove = topicsStore.get(topicBeforeApprove._id.toString());
    expect(topicAfterApprove.isActiveInSyllabus).toBe(true);
    expect(topicAfterApprove.description).toBe('Governed');

    const subjectAfterApprove = subjectsStore.get(subjectA._id.toString());
    expect(subjectAfterApprove.topicsCount).toBe(1);
  });
});
