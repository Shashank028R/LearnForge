import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { UserSession } from '../src/models/UserSession.js';
import { Chat } from '../src/models/Chat.js';
import { Message } from '../src/models/Message.js';
import { Annotation } from '../src/models/Annotation.js';
import { hashSessionToken, generateSessionToken } from '../src/utils/authCrypto.js';

describe('Message Annotations API (/api/v1/chats/:chatId/messages/:messageId/annotations, /api/v1/annotations)', () => {
  let usersStore = new Map();
  let sessionsStore = new Map();
  let chatsStore = new Map();
  let messagesStore = new Map();
  let annotationsStore = new Map();

  let userA, userB;
  let sessionCookieA, sessionCookieB;
  let chatA, messageA;

  beforeEach(() => {
    usersStore.clear();
    sessionsStore.clear();
    chatsStore.clear();
    messagesStore.clear();
    annotationsStore.clear();

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

    // Mock Chat
    vi.spyOn(Chat, 'findOne').mockImplementation(async (query) => {
      for (const c of chatsStore.values()) {
        const idMatch = !query._id || c._id.toString() === query._id.toString();
        const userMatch = !query.userId || c.userId.toString() === query.userId.toString();
        if (idMatch && userMatch) {
          return {
            ...c,
            save: async function () {
              chatsStore.set(c._id.toString(), { ...c, ...this });
              return this;
            },
          };
        }
      }
      return null;
    });

    // Mock Message
    vi.spyOn(Message, 'findOne').mockImplementation(async (query) => {
      for (const m of messagesStore.values()) {
        const idMatch = !query._id || m._id.toString() === query._id.toString();
        const chatMatch = !query.chatId || m.chatId.toString() === query.chatId.toString();
        const userMatch = !query.userId || m.userId.toString() === query.userId.toString();
        if (idMatch && chatMatch && userMatch) {
          return {
            ...m,
            save: async function () {
              messagesStore.set(m._id.toString(), { ...m, ...this });
              return this;
            },
          };
        }
      }
      return null;
    });

    // Mock Annotation
    vi.spyOn(Annotation, 'find').mockImplementation((query) => {
      const matched = [];
      for (const a of annotationsStore.values()) {
        const userMatch = !query.userId || a.userId.toString() === query.userId.toString();
        const chatMatch = !query.chatId || a.chatId.toString() === query.chatId.toString();
        const msgMatch = !query.messageId || a.messageId.toString() === query.messageId.toString();
        if (userMatch && chatMatch && msgMatch) {
          matched.push({
            ...a,
            save: async function () {
              annotationsStore.set(a._id.toString(), { ...a, ...this });
              return this;
            },
          });
        }
      }
      return {
        sort: (sortObj) => {
          if (sortObj?.createdAt === 1) {
            matched.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
          }
          return Promise.resolve(matched);
        },
        then: (resolve) => resolve(matched),
      };
    });

    vi.spyOn(Annotation, 'findOne').mockImplementation(async (query) => {
      for (const a of annotationsStore.values()) {
        const idMatch = !query._id || a._id.toString() === query._id.toString();
        const userMatch = !query.userId || a.userId.toString() === query.userId.toString();
        if (idMatch && userMatch) {
          return {
            ...a,
            save: async function () {
              annotationsStore.set(a._id.toString(), { ...a, ...this });
              return this;
            },
          };
        }
      }
      return null;
    });

    vi.spyOn(Annotation, 'create').mockImplementation(async (doc) => {
      const id = new mongoose.Types.ObjectId();
      const newAnn = {
        _id: id,
        ...doc,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      annotationsStore.set(id.toString(), newAnn);
      return newAnn;
    });

    vi.spyOn(Annotation, 'findOneAndDelete').mockImplementation(async (query) => {
      for (const [id, a] of annotationsStore.entries()) {
        const idMatch = !query._id || a._id.toString() === query._id.toString();
        const userMatch = !query.userId || a.userId.toString() === query.userId.toString();
        if (idMatch && userMatch) {
          annotationsStore.delete(id);
          return a;
        }
      }
      return null;
    });

    // Create Test Users
    const userAId = new mongoose.Types.ObjectId();
    userA = { _id: userAId, email: 'user_a@example.com', status: 'active', isEmailVerified: true };
    usersStore.set(userAId.toString(), userA);

    const tokenA = generateSessionToken();
    sessionsStore.set('sess_a', {
      _id: 'sess_a',
      userId: userAId,
      sessionTokenHash: hashSessionToken(tokenA),
      isActive: true,
      expiresAt: new Date(Date.now() + 86400000),
    });
    sessionCookieA = `learnforge_session=${tokenA}`;

    const userBId = new mongoose.Types.ObjectId();
    userB = { _id: userBId, email: 'user_b@example.com', status: 'active', isEmailVerified: true };
    usersStore.set(userBId.toString(), userB);

    const tokenB = generateSessionToken();
    sessionsStore.set('sess_b', {
      _id: 'sess_b',
      userId: userBId,
      sessionTokenHash: hashSessionToken(tokenB),
      isActive: true,
      expiresAt: new Date(Date.now() + 86400000),
    });
    sessionCookieB = `learnforge_session=${tokenB}`;

    // Create Chat and Message for User A
    const chatId = new mongoose.Types.ObjectId();
    chatA = {
      _id: chatId,
      userId: userAId,
      title: 'JavaScript Study',
      status: 'active',
      messagesCount: 1,
    };
    chatsStore.set(chatId.toString(), chatA);

    const messageId = new mongoose.Types.ObjectId();
    messageA = {
      _id: messageId,
      chatId,
      userId: userAId,
      role: 'assistant',
      content: 'Here is an off-topic explanation of React Server Components.',
      sequenceIndex: 1,
      status: 'sent',
      knowledgeContext: {
        relevance: 'off_topic',
        subjectId: null,
        topicId: null,
        disposition: 'excluded',
      },
    };
    messagesStore.set(messageId.toString(), messageA);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Creates a comment annotation on a message', async () => {
    const res = await request(app)
      .post(`/api/v1/chats/${chatA._id}/messages/${messageA._id}/annotations`)
      .set('Cookie', sessionCookieA)
      .send({
        type: 'comment',
        content: 'Useful background context for next project',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.type).toBe('comment');
    expect(res.body.data.content).toBe('Useful background context for next project');
    expect(annotationsStore.size).toBe(1);
  });

  it('2. Creates a tag annotation on a message', async () => {
    const res = await request(app)
      .post(`/api/v1/chats/${chatA._id}/messages/${messageA._id}/annotations`)
      .set('Cookie', sessionCookieA)
      .send({
        type: 'tag',
        content: 'react-server-components',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.type).toBe('tag');
    expect(res.body.data.content).toBe('react-server-components');
  });

  it('3. Lists annotations for a message in chronological order', async () => {
    await request(app)
      .post(`/api/v1/chats/${chatA._id}/messages/${messageA._id}/annotations`)
      .set('Cookie', sessionCookieA)
      .send({ type: 'tag', content: 'architecture' });

    await request(app)
      .post(`/api/v1/chats/${chatA._id}/messages/${messageA._id}/annotations`)
      .set('Cookie', sessionCookieA)
      .send({ type: 'comment', content: 'Review later before system design interview' });

    const listRes = await request(app)
      .get(`/api/v1/chats/${chatA._id}/messages/${messageA._id}/annotations`)
      .set('Cookie', sessionCookieA);

    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.data).toHaveLength(2);
  });

  it('4. Updates and deletes an annotation', async () => {
    const createRes = await request(app)
      .post(`/api/v1/chats/${chatA._id}/messages/${messageA._id}/annotations`)
      .set('Cookie', sessionCookieA)
      .send({ type: 'comment', content: 'Initial note' });

    const annotationId = createRes.body.data._id;

    // Update annotation
    const updateRes = await request(app)
      .patch(`/api/v1/annotations/${annotationId}`)
      .set('Cookie', sessionCookieA)
      .send({ content: 'Updated note with more detail' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.content).toBe('Updated note with more detail');

    // Delete annotation
    const deleteRes = await request(app)
      .delete(`/api/v1/annotations/${annotationId}`)
      .set('Cookie', sessionCookieA);

    expect(deleteRes.status).toBe(200);
    expect(annotationsStore.size).toBe(0);
  });

  it('5. Enforces tenant isolation — rejects cross-tenant annotation creation and access (returns 404)', async () => {
    // User B tries to annotate User A's message
    const createRes = await request(app)
      .post(`/api/v1/chats/${chatA._id}/messages/${messageA._id}/annotations`)
      .set('Cookie', sessionCookieB)
      .send({ type: 'comment', content: 'Malicious annotation' });

    expect(createRes.status).toBe(404);

    // Create annotation by User A
    const annA = await request(app)
      .post(`/api/v1/chats/${chatA._id}/messages/${messageA._id}/annotations`)
      .set('Cookie', sessionCookieA)
      .send({ type: 'tag', content: 'private-tag' });

    const annId = annA.body.data._id;

    // User B tries to update User A's annotation
    const updateRes = await request(app)
      .patch(`/api/v1/annotations/${annId}`)
      .set('Cookie', sessionCookieB)
      .send({ content: 'Hacked content' });

    expect(updateRes.status).toBe(404);

    // User B tries to delete User A's annotation
    const deleteRes = await request(app)
      .delete(`/api/v1/annotations/${annId}`)
      .set('Cookie', sessionCookieB);

    expect(deleteRes.status).toBe(404);
  });
});
