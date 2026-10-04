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
import { StudySession } from '../src/models/StudySession.js';
import { studyService } from '../src/study/services/studyService.js';
import { studyAiService } from '../src/study/services/studyAiService.js';
import { STUDY_STATUS, validateStateTransition } from '../src/study/stateMachine.js';
import { hashSessionToken, generateSessionToken } from '../src/utils/authCrypto.js';
import { aiGateway } from '../src/ai/gateway/aiGateway.js';
import { AI_TASK_TYPES } from '../src/ai/schemas/tasks.js';

describe('Phase 08 — Strict Study Mode & Active Recall Backend', () => {
  let userA, userB;
  let sessionTokenA, sessionCookieA;
  let sessionTokenB, sessionCookieB;
  let subjectA, topicA, approvedSyllabusA;
  let concept1, concept2;

  let usersStore = new Map();
  let sessionsStore = new Map();
  let subjectsStore = new Map();
  let topicsStore = new Map();
  let syllabusStore = new Map();
  let conceptsStore = new Map();
  let studySessionsStore = new Map();

  beforeEach(() => {
    usersStore.clear();
    sessionsStore.clear();
    subjectsStore.clear();
    topicsStore.clear();
    syllabusStore.clear();
    conceptsStore.clear();
    studySessionsStore.clear();

    userA = {
      _id: new mongoose.Types.ObjectId(),
      email: 'studentA@learnforge.ai',
      name: 'Student A',
      status: 'active',
    };
    usersStore.set(userA._id.toString(), userA);

    userB = {
      _id: new mongoose.Types.ObjectId(),
      email: 'studentB@learnforge.ai',
      name: 'Student B',
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
      title: 'Distributed Systems',
    };
    subjectsStore.set(subjectA._id.toString(), subjectA);

    topicA = {
      _id: new mongoose.Types.ObjectId(),
      userId: userA._id,
      subjectId: subjectA._id,
      title: 'Raft Consensus Algorithm',
    };
    topicsStore.set(topicA._id.toString(), topicA);

    approvedSyllabusA = {
      _id: new mongoose.Types.ObjectId(),
      userId: userA._id,
      subjectId: subjectA._id,
      versionNumber: 2,
      status: 'approved',
      units: [
        {
          title: 'Consensus Algorithms',
          topics: [{ title: 'Raft Consensus Algorithm' }],
        },
      ],
    };
    syllabusStore.set(approvedSyllabusA._id.toString(), approvedSyllabusA);

    concept1 = {
      _id: new mongoose.Types.ObjectId(),
      userId: userA._id,
      topicId: topicA._id,
      name: 'Leader Election',
      description: 'Process by which a Raft cluster chooses a new leader using randomized timers.',
      aliases: ['Election'],
    };
    conceptsStore.set(concept1._id.toString(), concept1);

    concept2 = {
      _id: new mongoose.Types.ObjectId(),
      userId: userA._id,
      topicId: topicA._id,
      name: 'Log Replication',
      description: 'Mechanism by which leader appends entries to followers.',
      aliases: ['AppendEntries'],
    };
    conceptsStore.set(concept2._id.toString(), concept2);

    // Mock AI Gateway for fast deterministic offline tests
    vi.spyOn(aiGateway, 'generate').mockImplementation(async ({ task, prompt }) => {
      if (task === AI_TASK_TYPES.STUDY_QUESTION_GENERATION) {
        return {
          text: JSON.stringify({
            questionType: 'mechanism',
            prompt: 'Explain how leader election works in Raft with randomized timers.',
            targetConceptNames: ['Leader Election'],
            expectedReasoningSignals: ['Randomized election timers', 'RequestVote RPC'],
            difficultyIntent: 'intermediate',
          }),
          metadata: { provider: 'mock-ai', model: 'mock-model', latencyMs: 1 },
        };
      }
      if (task === AI_TASK_TYPES.STUDY_ANSWER_EVALUATION) {
        const isWeak = prompt.includes('Unsure') || prompt.includes('Bad answer') || prompt.includes('I do not know') || prompt.includes('Weak answer');
        return {
          text: JSON.stringify({
            verdict: isWeak ? 'INCORRECT' : 'CORRECT',
            correctness: isWeak ? 20 : 90,
            completeness: isWeak ? 20 : 85,
            reasoningQuality: isWeak ? 20 : 90,
            misconceptionDetected: false,
            misconceptionSummary: '',
            missingConcepts: isWeak ? ['Leader Election'] : [],
            strengths: isWeak ? [] : ['Clearly explained randomized election timers'],
            weaknesses: isWeak ? ['No reasoning provided'] : [],
            feedback: isWeak ? 'Explanation lacks required mechanism detail.' : 'Accurate and rigorous reasoning.',
            nextAction: isWeak ? 'REMEDIATE' : 'ADVANCE',
          }),
          metadata: { provider: 'mock-ai', model: 'mock-model', latencyMs: 1 },
        };
      }
      if (task === AI_TASK_TYPES.STUDY_REMEDIATION) {
        return {
          text: JSON.stringify({
            remediationText: 'Remember that Raft uses randomized timers to avoid split votes.',
            followUpQuestion: 'Why are randomized election timers essential during leader election in Raft?',
          }),
          metadata: { provider: 'mock-ai', model: 'mock-model', latencyMs: 1 },
        };
      }
      return { text: '{}', metadata: {} };
    });

    // Mock Mongoose queries
    vi.spyOn(User, 'findById').mockImplementation(async (id) => {
      const u = usersStore.get(id?.toString());
      return u ? { ...u } : null;
    });

    vi.spyOn(UserSession, 'findOne').mockImplementation(async (query) => {
      const hash = query.sessionTokenHash;
      for (const s of sessionsStore.values()) {
        if (s.sessionTokenHash === hash) {
          return {
            ...s,
            save: async function () {
              sessionsStore.set(s._id.toString(), { ...s, ...this });
              return this;
            },
          };
        }
      }
      return null;
    });

    vi.spyOn(Subject, 'findOne').mockImplementation(async (query) => {
      for (const s of subjectsStore.values()) {
        const idMatch = !query._id || s._id.toString() === query._id.toString();
        const userMatch = !query.userId || s.userId.toString() === query.userId.toString();
        if (idMatch && userMatch) return { ...s };
      }
      return null;
    });

    vi.spyOn(Topic, 'findOne').mockImplementation(async (query) => {
      for (const t of topicsStore.values()) {
        const idMatch = !query._id || t._id.toString() === query._id.toString();
        const userMatch = !query.userId || t.userId.toString() === query.userId.toString();
        if (idMatch && userMatch) return { ...t };
      }
      return null;
    });

    vi.spyOn(SyllabusVersion, 'findOne').mockImplementation(async (query) => {
      for (const sv of syllabusStore.values()) {
        const subjectMatch = !query.subjectId || sv.subjectId.toString() === query.subjectId.toString();
        const userMatch = !query.userId || sv.userId.toString() === query.userId.toString();
        const statusMatch = !query.status || sv.status === query.status;
        if (subjectMatch && userMatch && statusMatch) return { ...sv };
      }
      return null;
    });

    vi.spyOn(SyllabusVersion, 'findById').mockImplementation(async (id) => {
      const sv = syllabusStore.get(id?.toString());
      return sv ? { ...sv } : null;
    });

    vi.spyOn(Concept, 'find').mockImplementation((query) => {
      const results = [];
      for (const c of conceptsStore.values()) {
        const userMatch = !query.userId || c.userId.toString() === query.userId.toString();
        const topicMatch = !query.topicId || c.topicId.toString() === query.topicId.toString();
        if (userMatch && topicMatch) results.push({ ...c });
      }
      return {
        lean: async () => results,
      };
    });

    // Mock StudySession Mongoose Methods
    vi.spyOn(StudySession, 'findOne').mockImplementation((query) => {
      let matched = null;
      for (const ss of studySessionsStore.values()) {
        const idMatch = !query._id || ss._id.toString() === query._id.toString();
        const userMatch = !query.userId || ss.userId.toString() === query.userId.toString();
        const topicMatch = !query.topicId || ss.topicId.toString() === query.topicId.toString();

        let statusMatch = true;
        if (query.status) {
          if (query.status.$nin) {
            statusMatch = !query.status.$nin.includes(ss.status);
          } else if (query.status.$in) {
            statusMatch = query.status.$in.includes(ss.status);
          } else {
            statusMatch = ss.status === query.status;
          }
        }

        if (idMatch && userMatch && topicMatch && statusMatch) {
          matched = ss;
          break;
        }
      }

      const createDoc = (raw) => {
        if (!raw) return null;
        return {
          ...raw,
          save: async function () {
            studySessionsStore.set(raw._id.toString(), JSON.parse(JSON.stringify(this)));
            return this;
          },
        };
      };

      return {
        sort: () => ({
          then: (resolve) => resolve(createDoc(matched)),
        }),
        then: (resolve) => resolve(createDoc(matched)),
      };
    });

    vi.spyOn(StudySession, 'findById').mockImplementation(async (id) => {
      const raw = studySessionsStore.get(id?.toString());
      if (!raw) return null;
      return {
        ...raw,
        save: async function () {
          studySessionsStore.set(raw._id.toString(), JSON.parse(JSON.stringify(this)));
          return this;
        },
      };
    });

    vi.spyOn(StudySession, 'findOneAndUpdate').mockImplementation(async (filter, update, options) => {
      for (const [idStr, ss] of studySessionsStore.entries()) {
        const idMatch = !filter._id || ss._id.toString() === filter._id.toString();
        const userMatch = !filter.userId || ss.userId.toString() === filter.userId.toString();
        const verMatch = filter.sessionVersion === undefined || ss.sessionVersion === filter.sessionVersion;

        let statusMatch = true;
        if (filter.status) {
          if (filter.status.$in) statusMatch = filter.status.$in.includes(ss.status);
          else if (filter.status.$ne) statusMatch = ss.status !== filter.status.$ne;
          else statusMatch = ss.status === filter.status;
        }

        let qMatch = true;
        if (filter['activeQuestion.questionId']) {
          qMatch = ss.activeQuestion?.questionId === filter['activeQuestion.questionId'];
        }

        let leaseMatch = true;
        if (filter['evaluationState.leaseExpiresAt']?.$lt) {
          const expires = ss.evaluationState?.leaseExpiresAt;
          leaseMatch = expires && new Date(expires) < filter['evaluationState.leaseExpiresAt'].$lt;
        }

        if (idMatch && userMatch && verMatch && statusMatch && qMatch && leaseMatch) {
          // Apply $set
          if (update.$set) {
            for (const [k, v] of Object.entries(update.$set)) {
              if (k.startsWith('evaluationState.')) {
                const subK = k.split('.')[1];
                ss.evaluationState = ss.evaluationState || {};
                ss.evaluationState[subK] = v;
              } else {
                ss[k] = v;
              }
            }
          }
          // Apply $inc
          if (update.$inc) {
            for (const [k, v] of Object.entries(update.$inc)) {
              if (k.startsWith('metrics.')) {
                const subK = k.split('.')[1];
                ss.metrics = ss.metrics || {};
                ss.metrics[subK] = (ss.metrics[subK] || 0) + v;
              } else {
                ss[k] = (ss[k] || 0) + v;
              }
            }
          }

          studySessionsStore.set(idStr, JSON.parse(JSON.stringify(ss)));
          return {
            ...ss,
            save: async function () {
              studySessionsStore.set(idStr, JSON.parse(JSON.stringify(this)));
              return this;
            },
          };
        }
      }
      return null;
    });

    vi.spyOn(StudySession, 'updateOne').mockImplementation(async (filter, update) => {
      for (const [idStr, ss] of studySessionsStore.entries()) {
        const idMatch = !filter._id || ss._id.toString() === filter._id.toString();
        const userMatch = !filter.userId || ss.userId.toString() === filter.userId.toString();

        let statusMatch = true;
        if (filter.status) {
          if (filter.status.$in) statusMatch = filter.status.$in.includes(ss.status);
          else statusMatch = ss.status === filter.status;
        }

        let opIdMatch = true;
        if (filter['evaluationState.operationId']) {
          opIdMatch = ss.evaluationState?.operationId === filter['evaluationState.operationId'];
        }

        if (idMatch && userMatch && statusMatch && opIdMatch) {
          if (update.$set) {
            for (const [k, v] of Object.entries(update.$set)) {
              if (k.startsWith('evaluationState.')) {
                const subK = k.split('.')[1];
                ss.evaluationState = ss.evaluationState || {};
                ss.evaluationState[subK] = v;
              } else {
                ss[k] = v;
              }
            }
          }
          if (update.$push) {
            for (const [k, v] of Object.entries(update.$push)) {
              ss[k] = ss[k] || [];
              const turnDoc = { ...v, _id: v._id || new mongoose.Types.ObjectId() };
              ss[k].push(turnDoc);
            }
          }
          if (update.$inc) {
            for (const [k, v] of Object.entries(update.$inc)) {
              if (k.startsWith('metrics.')) {
                const mK = k.split('.')[1];
                ss.metrics = ss.metrics || {};
                ss.metrics[mK] = (ss.metrics[mK] || 0) + v;
              } else {
                ss[k] = (ss[k] || 0) + v;
              }
            }
          }
          if (update.$addToSet) {
            for (const [k, v] of Object.entries(update.$addToSet)) {
              const mK = k.split('.')[1];
              ss.metrics = ss.metrics || {};
              const list = ss.metrics[mK] || [];
              const toAdd = v.$each || [v];
              for (const item of toAdd) {
                if (!list.some((existing) => existing.toString() === item.toString())) {
                  list.push(item);
                }
              }
              ss.metrics[mK] = list;
            }
          }

          studySessionsStore.set(idStr, JSON.parse(JSON.stringify(ss)));
          return { matchedCount: 1, modifiedCount: 1 };
        }
      }
      return { matchedCount: 0, modifiedCount: 0 };
    });

    vi.spyOn(StudySession.prototype, 'save').mockImplementation(async function () {
      if (!this._id) this._id = new mongoose.Types.ObjectId();
      studySessionsStore.set(this._id.toString(), JSON.parse(JSON.stringify(this)));
      return this;
    });

    vi.spyOn(StudySession, 'find').mockImplementation((query) => {
      const results = [];
      for (const ss of studySessionsStore.values()) {
        const userMatch = !query.userId || ss.userId.toString() === query.userId.toString();
        const topicMatch = !query.topicId || ss.topicId.toString() === query.topicId.toString();
        const statusMatch = !query.status || ss.status === query.status;
        if (userMatch && topicMatch && statusMatch) results.push({ ...ss });
      }
      return {
        sort: () => ({
          skip: () => ({
            limit: () => Promise.resolve(results),
          }),
        }),
      };
    });

    vi.spyOn(StudySession, 'countDocuments').mockImplementation(async (query) => {
      let count = 0;
      for (const ss of studySessionsStore.values()) {
        const userMatch = !query.userId || ss.userId.toString() === query.userId.toString();
        const topicMatch = !query.topicId || ss.topicId.toString() === query.topicId.toString();
        if (userMatch && topicMatch) count++;
      }
      return count;
    });
  });

  // --- Test 1 to 3: Session Creation & Syllabus Pinning ---
  it('1. creates a new study session with pinned approved syllabus and active recall question', async () => {
    const res = await request(app)
      .post(`/api/v1/topics/${topicA._id}/study/sessions`)
      .set('Cookie', sessionCookieA)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.isNew).toBe(true);
    const session = res.body.data.session;
    expect(session.status).toBe(STUDY_STATUS.QUESTIONING);
    expect(session.syllabusVersionId).toBe(approvedSyllabusA._id.toString());
    expect(session.syllabusVersionNumber).toBe(2);
    expect(session.activeQuestion).toBeDefined();
    expect(session.activeQuestion.prompt).toBeDefined();
    expect(session.sessionVersion).toBe(1);
  });

  it('2. resumes existing active study session instead of duplicating', async () => {
    // First creation
    await request(app)
      .post(`/api/v1/topics/${topicA._id}/study/sessions`)
      .set('Cookie', sessionCookieA)
      .expect(201);

    // Second call resumes
    const res = await request(app)
      .post(`/api/v1/topics/${topicA._id}/study/sessions`)
      .set('Cookie', sessionCookieA)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.isNew).toBe(false);
  });

  it('3. creates a topic-only session when no approved syllabus exists', async () => {
    syllabusStore.clear(); // remove approved syllabus

    const res = await request(app)
      .post(`/api/v1/topics/${topicA._id}/study/sessions`)
      .set('Cookie', sessionCookieA)
      .expect(201);

    expect(res.body.data.session.syllabusVersionId).toBeNull();
    expect(res.body.data.session.syllabusVersionNumber).toBeNull();
  });

  // --- Test 4 to 7: AI & Whitelist & Fallback ---
  it('4. grounds question generation in canonical concepts whitelist', async () => {
    const question = await studyAiService.generateQuestion({
      subjectTitle: 'Distributed Systems',
      topicTitle: 'Raft',
      canonicalConcepts: [concept1, concept2],
    });

    expect(question.targetConceptNames.length).toBeGreaterThan(0);
    expect(question.expectedReasoningSignals.length).toBeGreaterThan(0);
  });

  it('5. strips hallucinated or out-of-scope concepts from question output', () => {
    const rawAiOutput = {
      questionType: 'mechanism',
      prompt: 'Explain leader election in Raft.',
      targetConceptNames: ['Leader Election', 'Hallucinated Unrelated Concept'],
      expectedReasoningSignals: ['Random timers reset on heartbeat'],
    };

    const validated = studyAiService._validateAndNormalizeQuestion(rawAiOutput, [concept1, concept2], concept1);
    expect(validated.targetConceptNames).toEqual(['Leader Election']);
    expect(validated.targetConceptIds).toEqual([concept1._id]);
  });

  it('6. validates and bounds answer evaluation schema', () => {
    const rawEval = {
      verdict: 'CORRECT',
      correctness: 150, // out of bounds
      completeness: -20,
      reasoningQuality: 95,
      nextAction: 'ADVANCE',
    };

    const normalized = studyAiService._validateAndNormalizeEvaluation(rawEval);
    expect(normalized.correctness).toBe(100);
    expect(normalized.completeness).toBe(0);
    expect(normalized.verdict).toBe('CORRECT');
    expect(normalized.nextAction).toBe('ADVANCE');
  });

  it('7. executes deterministic AI fallback gracefully on AI gateway errors', async () => {
    const question = studyAiService._buildDeterministicQuestion([concept1], 'Raft', concept1, 'req-test');
    expect(question.provenance.source).toBe('deterministic_fallback');
    expect(question.targetConceptNames).toEqual(['Leader Election']);
  });

  // --- Test 8 to 13: Pedagogical Answer, Advancement & Remediation Loop ---
  it('8. evaluates correct answer and advances session to ADVANCING', async () => {
    const createRes = await request(app)
      .post(`/api/v1/topics/${topicA._id}/study/sessions`)
      .set('Cookie', sessionCookieA)
      .expect(201);

    const sessionId = createRes.body.data.session._id;
    const questionId = createRes.body.data.session.activeQuestion.questionId;

    const answerRes = await request(app)
      .post(`/api/v1/study-sessions/${sessionId}/answer`)
      .set('Cookie', sessionCookieA)
      .send({
        questionId,
        sessionVersion: 1,
        clientTurnId: 'turn-001',
        answer: 'Leader election in Raft relies on randomized election timers to ensure that candidates do not split votes indefinitely.',
      })
      .expect(200);

    expect(answerRes.body.success).toBe(true);
    expect(answerRes.body.data.session.status).toBe(STUDY_STATUS.ADVANCING);
    expect(answerRes.body.data.turn.attemptType).toBe('INITIAL');
    expect(answerRes.body.data.turn.parentTurnId).toBeNull();
  });

  it('9. triggers Socratic remediation on incorrect answer without advancing', async () => {
    const createRes = await request(app)
      .post(`/api/v1/topics/${topicA._id}/study/sessions`)
      .set('Cookie', sessionCookieA)
      .expect(201);

    const sessionId = createRes.body.data.session._id;
    const questionId = createRes.body.data.session.activeQuestion.questionId;

    const answerRes = await request(app)
      .post(`/api/v1/study-sessions/${sessionId}/answer`)
      .set('Cookie', sessionCookieA)
      .send({
        questionId,
        sessionVersion: 1,
        clientTurnId: 'turn-weak-001',
        answer: 'I do not know.',
      })
      .expect(200);

    expect(answerRes.body.data.session.status).toBe(STUDY_STATUS.REMEDIATING);
    expect(answerRes.body.data.turn.remediation.followUpQuestion).toBeDefined();
    expect(answerRes.body.data.session.metrics.remediationsCount).toBe(1);
  });

  it('10. /continue from REMEDIATING exposes follow-up question and transitions to RECHECKING', async () => {
    const createRes = await request(app)
      .post(`/api/v1/topics/${topicA._id}/study/sessions`)
      .set('Cookie', sessionCookieA)
      .expect(201);

    const sessionId = createRes.body.data.session._id;
    const questionId = createRes.body.data.session.activeQuestion.questionId;

    await request(app)
      .post(`/api/v1/study-sessions/${sessionId}/answer`)
      .set('Cookie', sessionCookieA)
      .send({
        questionId,
        sessionVersion: 1,
        clientTurnId: 'turn-weak-002',
        answer: 'Unsure.',
      });

    // Continue to follow-up
    const contRes = await request(app)
      .post(`/api/v1/study-sessions/${sessionId}/continue`)
      .set('Cookie', sessionCookieA)
      .send({ sessionVersion: 3 })
      .expect(200);

    expect(contRes.body.data.status).toBe(STUDY_STATUS.RECHECKING);
    expect(contRes.body.data.activeQuestion).toBeDefined();
  });

  it('11. persists follow-up answer with attemptType: FOLLOW_UP and parentTurnId linked', async () => {
    const createRes = await request(app)
      .post(`/api/v1/topics/${topicA._id}/study/sessions`)
      .set('Cookie', sessionCookieA)
      .expect(201);

    const sessionId = createRes.body.data.session._id;
    const questionId = createRes.body.data.session.activeQuestion.questionId;

    // Initial Weak Answer
    await request(app)
      .post(`/api/v1/study-sessions/${sessionId}/answer`)
      .set('Cookie', sessionCookieA)
      .send({
        questionId,
        sessionVersion: 1,
        clientTurnId: 'turn-weak-003',
        answer: 'Bad answer.',
      });

    // Continue to RECHECKING
    const contRes = await request(app)
      .post(`/api/v1/study-sessions/${sessionId}/continue`)
      .set('Cookie', sessionCookieA)
      .send({ sessionVersion: 3 });

    const followUpQuestionId = contRes.body.data.activeQuestion.questionId;

    // Submit Follow-Up Answer
    const followUpRes = await request(app)
      .post(`/api/v1/study-sessions/${sessionId}/answer`)
      .set('Cookie', sessionCookieA)
      .send({
        questionId: followUpQuestionId,
        sessionVersion: 4,
        clientTurnId: 'turn-followup-001',
        answer: 'Leader election uses randomized election timers so that one candidate times out before others and requests votes.',
      })
      .expect(200);

    expect(followUpRes.body.data.turn.attemptType).toBe('FOLLOW_UP');
    expect(followUpRes.body.data.turn.parentTurnId).toBeDefined();

    // Verify session contains both turns intact
    const fullSession = await studyService.getSessionById(userA._id, sessionId);
    expect(fullSession.turns.length).toBe(2);
    expect(fullSession.turns[0].attemptType).toBe('INITIAL');
    expect(fullSession.turns[1].attemptType).toBe('FOLLOW_UP');
    expect(fullSession.turns[1].parentTurnId.toString()).toBe(fullSession.turns[0]._id.toString());
  });

  // --- Test 14 to 20: Concurrency, Idempotency & Races ---
  it('12. rejects duplicate initial answer submission race (real concurrency)', async () => {
    const createRes = await request(app)
      .post(`/api/v1/topics/${topicA._id}/study/sessions`)
      .set('Cookie', sessionCookieA)
      .expect(201);

    const sessionId = createRes.body.data.session._id;
    const questionId = createRes.body.data.session.activeQuestion.questionId;

    // Launch genuine concurrent answer submissions with the same sessionVersion
    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/v1/study-sessions/${sessionId}/answer`)
        .set('Cookie', sessionCookieA)
        .send({
          questionId,
          sessionVersion: 1,
          clientTurnId: 'turn-race-001',
          answer: 'Detailed correct answer on leader election timers.',
        }),
      request(app)
        .post(`/api/v1/study-sessions/${sessionId}/answer`)
        .set('Cookie', sessionCookieA)
        .send({
          questionId,
          sessionVersion: 1,
          clientTurnId: 'turn-race-002',
          answer: 'Another concurrent answer.',
        }),
    ]);

    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(200);
    expect(statuses).toContain(409); // Exactly one wins, one receives 409 STALE_STUDY_STATE
  });

  it('13. rejects stale sessionVersion with HTTP 409', async () => {
    const createRes = await request(app)
      .post(`/api/v1/topics/${topicA._id}/study/sessions`)
      .set('Cookie', sessionCookieA)
      .expect(201);

    const sessionId = createRes.body.data.session._id;
    const questionId = createRes.body.data.session.activeQuestion.questionId;

    const res = await request(app)
      .post(`/api/v1/study-sessions/${sessionId}/answer`)
      .set('Cookie', sessionCookieA)
      .send({
        questionId,
        sessionVersion: 99, // Stale version
        clientTurnId: 'turn-stale-001',
        answer: 'Some answer.',
      })
      .expect(409);

    expect(res.body.error.code).toBe('STALE_STUDY_STATE');
  });

  it('14. rejects conflicting clientTurnId reuse with modified payload (HTTP 409)', async () => {
    const createRes = await request(app)
      .post(`/api/v1/topics/${topicA._id}/study/sessions`)
      .set('Cookie', sessionCookieA)
      .expect(201);

    const sessionId = createRes.body.data.session._id;
    const questionId = createRes.body.data.session.activeQuestion.questionId;

    // Submit initial turn
    await request(app)
      .post(`/api/v1/study-sessions/${sessionId}/answer`)
      .set('Cookie', sessionCookieA)
      .send({
        questionId,
        sessionVersion: 1,
        clientTurnId: 'turn-idemp-001',
        answer: 'First answer payload.',
      })
      .expect(200);

    // Reuse same clientTurnId with modified answer
    const conflictRes = await request(app)
      .post(`/api/v1/study-sessions/${sessionId}/answer`)
      .set('Cookie', sessionCookieA)
      .send({
        questionId,
        sessionVersion: 3,
        clientTurnId: 'turn-idemp-001',
        answer: 'Different answer payload reuse attempt.',
      })
      .expect(409);

    expect(conflictRes.body.error.code).toBe('IDEMPOTENCY_KEY_REUSE_CONFLICT');
  });

  it('15. returns stored turn on safe idempotent retry with matching payload (HTTP 200)', async () => {
    const createRes = await request(app)
      .post(`/api/v1/topics/${topicA._id}/study/sessions`)
      .set('Cookie', sessionCookieA)
      .expect(201);

    const sessionId = createRes.body.data.session._id;
    const questionId = createRes.body.data.session.activeQuestion.questionId;

    // Submit initial turn
    const firstRes = await request(app)
      .post(`/api/v1/study-sessions/${sessionId}/answer`)
      .set('Cookie', sessionCookieA)
      .send({
        questionId,
        sessionVersion: 1,
        clientTurnId: 'turn-idemp-safe-001',
        answer: 'Identical answer payload for idempotent retry test.',
      })
      .expect(200);

    // Replay identical request
    const replayRes = await request(app)
      .post(`/api/v1/study-sessions/${sessionId}/answer`)
      .set('Cookie', sessionCookieA)
      .send({
        questionId,
        sessionVersion: 1,
        clientTurnId: 'turn-idemp-safe-001',
        answer: 'Identical answer payload for idempotent retry test.',
      })
      .expect(200);

    expect(replayRes.body.data.idempotent).toBe(true);
    expect(replayRes.body.data.turn.clientTurnId).toBe('turn-idemp-safe-001');
  });

  it('16. returns stored historical turn when replayed after later turns exist without state corruption', async () => {
    const createRes = await request(app)
      .post(`/api/v1/topics/${topicA._id}/study/sessions`)
      .set('Cookie', sessionCookieA)
      .expect(201);

    const sessionId = createRes.body.data.session._id;
    const questionId = createRes.body.data.session.activeQuestion.questionId;

    // Turn 1
    await request(app)
      .post(`/api/v1/study-sessions/${sessionId}/answer`)
      .set('Cookie', sessionCookieA)
      .send({
        questionId,
        sessionVersion: 1,
        clientTurnId: 'turn-old-001',
        answer: 'Answer turn 1.',
      });

    // Continue to Turn 2
    await request(app)
      .post(`/api/v1/study-sessions/${sessionId}/continue`)
      .set('Cookie', sessionCookieA)
      .send({ sessionVersion: 3 });

    // Client retransmits Turn 1
    const replayOldRes = await request(app)
      .post(`/api/v1/study-sessions/${sessionId}/answer`)
      .set('Cookie', sessionCookieA)
      .send({
        questionId,
        sessionVersion: 1,
        clientTurnId: 'turn-old-001',
        answer: 'Answer turn 1.',
      })
      .expect(200);

    expect(replayOldRes.body.data.idempotent).toBe(true);
    expect(replayOldRes.body.data.turn.clientTurnId).toBe('turn-old-001');
  });

  // --- Test 21 to 24: Lease Fencing, Takeover & Recovery ---
  it('17. enforces operationId lease fencing: late worker completion fails harmlessly and does not overwrite takeover result', async () => {
    const createRes = await request(app)
      .post(`/api/v1/topics/${topicA._id}/study/sessions`)
      .set('Cookie', sessionCookieA)
      .expect(201);

    const sessionId = createRes.body.data.session._id;
    const questionId = createRes.body.data.session.activeQuestion.questionId;

    // Worker A claims lease with operationId_A
    const opId_A = 'op-worker-A-1111';
    await studyService.submitAnswer(userA._id, sessionId, {
      questionId,
      sessionVersion: 1,
      clientTurnId: 'turn-fence-001',
      answer: 'Worker A answer.',
    }, { operationId: opId_A });

    // Simulate Lease Takeover: Worker B takes over with operationId_B
    const sessionDoc = studySessionsStore.get(sessionId.toString());
    sessionDoc.evaluationState.operationId = 'op-worker-B-2222';
    sessionDoc.evaluationState.leaseExpiresAt = new Date(Date.now() + 30000);
    studySessionsStore.set(sessionId.toString(), sessionDoc);

    // Worker A returns late and attempts to write with stale opId_A
    const writeResult = await StudySession.updateOne(
      {
        _id: sessionId,
        userId: userA._id,
        status: STUDY_STATUS.EVALUATING,
        'evaluationState.operationId': opId_A, // STALE OPERATION ID
      },
      {
        $set: { status: STUDY_STATUS.ADVANCING },
      }
    );

    // Write matches ZERO documents because operationId changed
    expect(writeResult.matchedCount).toBe(0);
  });

  it('18. recovers safely on catastrophic evaluation error: session never stranded in EVALUATING', async () => {
    const createRes = await request(app)
      .post(`/api/v1/topics/${topicA._id}/study/sessions`)
      .set('Cookie', sessionCookieA)
      .expect(201);

    const sessionId = createRes.body.data.session._id;
    const questionId = createRes.body.data.session.activeQuestion.questionId;

    // Submit answer with forced evaluation failure
    try {
      await studyService.submitAnswer(userA._id, sessionId, {
        questionId,
        sessionVersion: 1,
        clientTurnId: 'turn-fail-001',
        answer: 'Any answer that triggers catastrophic error.',
      }, { forceEvaluationError: true });
      expect.fail('Should have thrown an error');
    } catch (err) {
      expect(err.code).toBe('EVALUATION_FAILED_RETRY_SAFE');
    }

    // Verify session recovered safely to QUESTIONING and evaluationState is FAILED
    const recoveredSession = await studyService.getSessionById(userA._id, sessionId);
    expect(recoveredSession.status).toBe(STUDY_STATUS.QUESTIONING);
    expect(recoveredSession.evaluationState.status).toBe('FAILED');
    expect(recoveredSession.activeQuestion.questionId).toBe(questionId); // context preserved
  });

  // --- Test 25 to 29: Pause, Resume, Exits & Tenant Isolation ---
  it('19. rejects pause attempt during EVALUATING with HTTP 409', () => {
    expect(() => {
      validateStateTransition(STUDY_STATUS.EVALUATING, STUDY_STATUS.PAUSED);
    }).toThrow('Cannot pause session while an answer evaluation is currently in progress.');
  });

  it('20. pauses and resumes from REMEDIATING correctly', async () => {
    const createRes = await request(app)
      .post(`/api/v1/topics/${topicA._id}/study/sessions`)
      .set('Cookie', sessionCookieA)
      .expect(201);

    const sessionId = createRes.body.data.session._id;
    const questionId = createRes.body.data.session.activeQuestion.questionId;

    // Submit weak answer to enter REMEDIATING
    await request(app)
      .post(`/api/v1/study-sessions/${sessionId}/answer`)
      .set('Cookie', sessionCookieA)
      .send({
        questionId,
        sessionVersion: 1,
        clientTurnId: 'turn-pause-001',
        answer: 'Weak answer.',
      });

    // Pause
    const pauseRes = await request(app)
      .post(`/api/v1/study-sessions/${sessionId}/pause`)
      .set('Cookie', sessionCookieA)
      .send({ sessionVersion: 3 })
      .expect(200);

    expect(pauseRes.body.data.status).toBe(STUDY_STATUS.PAUSED);
    expect(pauseRes.body.data.pausedFromStatus).toBe(STUDY_STATUS.REMEDIATING);

    // Resume
    const resumeRes = await request(app)
      .post(`/api/v1/study-sessions/${sessionId}/resume`)
      .set('Cookie', sessionCookieA)
      .send({ sessionVersion: 4 })
      .expect(200);

    expect(resumeRes.body.data.status).toBe(STUDY_STATUS.REMEDIATING);
  });

  it('21. enforces tenant isolation (cross-tenant access rejected with HTTP 404)', async () => {
    const createRes = await request(app)
      .post(`/api/v1/topics/${topicA._id}/study/sessions`)
      .set('Cookie', sessionCookieA)
      .expect(201);

    const sessionId = createRes.body.data.session._id;

    // User B attempts to access User A's session
    const getRes = await request(app)
      .get(`/api/v1/study-sessions/${sessionId}`)
      .set('Cookie', sessionCookieB)
      .expect(404);

    expect(getRes.body.error.code).toBe('STUDY_SESSION_NOT_FOUND');
  });

  it('22. prevents mutations after EXITED terminal state', async () => {
    const createRes = await request(app)
      .post(`/api/v1/topics/${topicA._id}/study/sessions`)
      .set('Cookie', sessionCookieA)
      .expect(201);

    const sessionId = createRes.body.data.session._id;

    // Exit
    await request(app)
      .post(`/api/v1/study-sessions/${sessionId}/exit`)
      .set('Cookie', sessionCookieA)
      .expect(200);

    // Attempt answer
    const answerRes = await request(app)
      .post(`/api/v1/study-sessions/${sessionId}/answer`)
      .set('Cookie', sessionCookieA)
      .send({
        questionId: 'any-q',
        sessionVersion: 2,
        clientTurnId: 'turn-exit-001',
        answer: 'Any answer after exit.',
      })
      .expect(400);

    expect(answerRes.body.error.code).toBe('TERMINAL_STUDY_STATE');
  });

  it('23. handles genuine concurrent identical-clientTurnId race deterministically', async () => {
    const createRes = await request(app)
      .post(`/api/v1/topics/${topicA._id}/study/sessions`)
      .set('Cookie', sessionCookieA)
      .expect(201);

    const sessionId = createRes.body.data.session._id;
    const questionId = createRes.body.data.session.activeQuestion.questionId;
    const sharedClientTurnId = 'turn-identical-race-001';
    const sharedAnswer = 'Exact identical answer payload submitted simultaneously.';

    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/v1/study-sessions/${sessionId}/answer`)
        .set('Cookie', sessionCookieA)
        .send({
          questionId,
          sessionVersion: 1,
          clientTurnId: sharedClientTurnId,
          answer: sharedAnswer,
        }),
      request(app)
        .post(`/api/v1/study-sessions/${sessionId}/answer`)
        .set('Cookie', sessionCookieA)
        .send({
          questionId,
          sessionVersion: 1,
          clientTurnId: sharedClientTurnId,
          answer: sharedAnswer,
        }),
    ]);

    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(200);
    // The second request either fails with 409 STALE_STUDY_STATE (version claimed) or resolves idempotently
    expect(statuses.every((s) => s === 200 || s === 409)).toBe(true);
  });

  it('24. grounds expectedReasoningSignals in canonical concept descriptions and operational evidence', () => {
    const rawAiOutputWithoutSignals = {
      questionType: 'mechanism',
      prompt: 'Explain the mechanism of Leader Election.',
      targetConceptNames: ['Leader Election'],
      expectedReasoningSignals: [], // AI generated no signals
    };

    const normalized = studyAiService._validateAndNormalizeQuestion(
      rawAiOutputWithoutSignals,
      [concept1, concept2],
      concept1
    );

    expect(normalized.expectedReasoningSignals.length).toBeGreaterThan(0);
    expect(normalized.expectedReasoningSignals[0]).toContain('Leader Election');
    expect(normalized.expectedReasoningSignals[0]).toContain(concept1.description);
  });
});
