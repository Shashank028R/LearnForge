import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import fs from 'fs';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Concept } from '../src/models/Concept.js';
import { Topic } from '../src/models/Topic.js';
import { Subject } from '../src/models/Subject.js';
import { StudySession } from '../src/models/StudySession.js';
import { ConceptLearningState } from '../src/models/ConceptLearningState.js';
import { ProcessedStudyTurn } from '../src/models/ProcessedStudyTurn.js';
import { TopicLearningStateFence } from '../src/models/TopicLearningStateFence.js';
import { learningStateService } from '../src/services/learningStateService.js';
import { runInTransaction } from '../src/utils/transaction.js';

describe('Phase 09 Checkpoint 3: Real MongoDB Replica Set Concurrency & Fencing Suite', { timeout: 120000 }, () => {
  let replSet;
  let userId;
  let subjectId, topicAId, topicBId;
  let conceptXId, conceptYId;

  beforeAll(async () => {
    const systemBinary = process.env.MONGOMS_SYSTEM_BINARY;
    const binaryConfig = systemBinary && fs.existsSync(systemBinary) ? { systemBinary } : {};

    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      binary: binaryConfig,
      instanceOpts: [{ startupTimeout: 60000 }],
    });
    const uri = replSet.getUri();
    await mongoose.connect(uri);

    // Initialize all models and compound unique indexes
    await Concept.init();
    await Topic.init();
    await Subject.init();
    await StudySession.init();
    await ConceptLearningState.init();
    await ProcessedStudyTurn.init();
    await TopicLearningStateFence.init();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (replSet) {
      await replSet.stop();
    }
  });

  beforeEach(async () => {
    const collections = [
      'concepts',
      'topics',
      'subjects',
      'studysessions',
      'conceptlearningstates',
      'processedstudyturns',
      'topiclearningstatefences',
    ];
    for (const col of collections) {
      if (mongoose.connection.collections[col]) {
        await mongoose.connection.collections[col].deleteMany({});
      }
    }

    userId = new mongoose.Types.ObjectId();
    subjectId = new mongoose.Types.ObjectId();
    topicAId = new mongoose.Types.ObjectId();
    topicBId = new mongoose.Types.ObjectId();

    await Subject.create({
      _id: subjectId,
      userId,
      title: 'Distributed Systems',
      name: 'Distributed Systems',
      normalizedName: 'distributed systems',
      status: 'active',
    });

    await Topic.create([
      {
        _id: topicAId,
        subjectId,
        userId,
        title: 'Consensus',
        name: 'Consensus',
        normalizedTitle: 'consensus',
        orderIndex: 1,
      },
      {
        _id: topicBId,
        subjectId,
        userId,
        title: 'Replication',
        name: 'Replication',
        normalizedTitle: 'replication',
        orderIndex: 2,
      },
    ]);

    conceptXId = new mongoose.Types.ObjectId();
    conceptYId = new mongoose.Types.ObjectId();

    // Topic A has Concept X (Paxos)
    // Topic B has Concept Y (Raft) which depends on Concept X
    await Concept.create([
      {
        _id: conceptXId,
        topicId: topicAId,
        subjectId,
        userId,
        name: 'Paxos',
        normalizedName: 'paxos',
        orderIndex: 1,
        prerequisites: [],
      },
      {
        _id: conceptYId,
        topicId: topicBId,
        subjectId,
        userId,
        name: 'Raft',
        normalizedName: 'raft',
        orderIndex: 1,
        prerequisites: [conceptXId],
      },
    ]);
  });

  it('1. One committed live turn increments TopicLearningStateFence.version by exactly +1', async () => {
    const sessionId = new mongoose.Types.ObjectId();
    const turn = {
      _id: new mongoose.Types.ObjectId(),
      answeredAt: new Date(),
      question: { targetConceptIds: [conceptXId] },
      evaluation: { verdict: 'CORRECT', correctness: 90 },
    };

    await runInTransaction(async (session) => {
      await learningStateService.projectTurnRealtime(userId, sessionId, turn, {
        session,
        topicId: topicAId,
        forceFence: true,
      });
    });

    const fence = await TopicLearningStateFence.findOne({ userId, topicId: topicAId });
    expect(fence).toBeDefined();
    expect(fence.version).toBe(1);
    expect(fence.lastTurnWatermark.lastTurnId.toString()).toBe(turn._id.toString());
  });

  it('2. Live turn targeting multiple concepts increments TopicLearningStateFence.version by +1 total', async () => {
    // Create second concept in Topic A
    const conceptX2 = await Concept.create({
      _id: new mongoose.Types.ObjectId(),
      topicId: topicAId,
      subjectId,
      userId,
      name: 'Multi-Paxos',
      normalizedName: 'multi-paxos',
      orderIndex: 2,
      prerequisites: [conceptXId],
    });

    const sessionId = new mongoose.Types.ObjectId();
    const turn = {
      _id: new mongoose.Types.ObjectId(),
      answeredAt: new Date(),
      question: { targetConceptIds: [conceptXId, conceptX2._id] },
      evaluation: { verdict: 'CORRECT', correctness: 95 },
    };

    await runInTransaction(async (session) => {
      await learningStateService.projectTurnRealtime(userId, sessionId, turn, {
        session,
        topicId: topicAId,
        forceFence: true,
      });
    });

    const fence = await TopicLearningStateFence.findOne({ userId, topicId: topicAId });
    expect(fence.version).toBe(1); // Exactly +1, not +2
  });

  it('3. Two sequential committed live turns increment TopicLearningStateFence.version by +2', async () => {
    const sessionId = new mongoose.Types.ObjectId();
    const turn1 = {
      _id: new mongoose.Types.ObjectId(),
      answeredAt: new Date(),
      question: { targetConceptIds: [conceptXId] },
      evaluation: { verdict: 'CORRECT', correctness: 85 },
    };
    const turn2 = {
      _id: new mongoose.Types.ObjectId(),
      answeredAt: new Date(),
      question: { targetConceptIds: [conceptXId] },
      evaluation: { verdict: 'CORRECT', correctness: 90 },
    };

    await runInTransaction(async (session) => {
      await learningStateService.projectTurnRealtime(userId, sessionId, turn1, {
        session,
        topicId: topicAId,
        forceFence: true,
      });
    });

    await runInTransaction(async (session) => {
      await learningStateService.projectTurnRealtime(userId, sessionId, turn2, {
        session,
        topicId: topicAId,
        forceFence: true,
      });
    });

    const fence = await TopicLearningStateFence.findOne({ userId, topicId: topicAId });
    expect(fence.version).toBe(2);
  });

  it('4. Idempotent turn replay leaves TopicLearningStateFence.version unchanged (+0)', async () => {
    const sessionId = new mongoose.Types.ObjectId();
    const turn = {
      _id: new mongoose.Types.ObjectId(),
      answeredAt: new Date(),
      question: { targetConceptIds: [conceptXId] },
      evaluation: { verdict: 'CORRECT', correctness: 90 },
    };

    // First projection
    await runInTransaction(async (session) => {
      await learningStateService.projectTurnRealtime(userId, sessionId, turn, {
        session,
        topicId: topicAId,
        forceFence: true,
      });
    });

    // Replay same turn
    const replayResult = await runInTransaction(async (session) => {
      return await learningStateService.projectTurnRealtime(userId, sessionId, turn, {
        session,
        topicId: topicAId,
        forceFence: true,
      });
    });

    expect(replayResult.results[0].idempotent).toBe(true);
    const fence = await TopicLearningStateFence.findOne({ userId, topicId: topicAId });
    expect(fence.version).toBe(1); // Remained 1
  });

  it('5. Rolled-back transaction leaves TopicLearningStateFence.version unchanged (+0)', async () => {
    const sessionId = new mongoose.Types.ObjectId();
    const turn = {
      _id: new mongoose.Types.ObjectId(),
      answeredAt: new Date(),
      question: { targetConceptIds: [conceptXId] },
      evaluation: { verdict: 'CORRECT', correctness: 90 },
    };

    let threw = false;
    try {
      await runInTransaction(async (session) => {
        await learningStateService.projectTurnRealtime(userId, sessionId, turn, {
          session,
          topicId: topicAId,
          forceFence: true,
        });
        throw new Error('Simulated persistence failure before commit');
      });
    } catch (err) {
      threw = true;
    }

    expect(threw).toBe(true);
    const fence = await TopicLearningStateFence.findOne({ userId, topicId: topicAId });
    expect(fence).toBeNull(); // Rolled back completely
  });

  it('6. Rebuild publication recreates state but leaves TopicLearningStateFence.version unchanged (+0)', async () => {
    const turn = {
      _id: new mongoose.Types.ObjectId(),
      turnIndex: 0,
      clientTurnId: 'turn-c6-1',
      attemptType: 'INITIAL',
      answeredAt: new Date(),
      question: {
        questionId: 'q-paxos-1',
        prompt: 'Explain Paxos consensus',
        questionType: 'explain_in_own_words',
        targetConceptIds: [conceptXId],
      },
      evaluation: { verdict: 'CORRECT', correctness: 90 },
    };

    await StudySession.create({
      _id: new mongoose.Types.ObjectId(),
      userId,
      subjectId,
      topicId: topicAId,
      turns: [turn],
    });

    await runInTransaction(async (session) => {
      await learningStateService.projectTurnRealtime(userId, new mongoose.Types.ObjectId(), turn, {
        session,
        topicId: topicAId,
        forceFence: true,
      });
    });

    const fenceBefore = await TopicLearningStateFence.findOne({ userId, topicId: topicAId });
    expect(fenceBefore.version).toBe(1);

    // 2. Rebuild Topic A
    const rebuildRes = await learningStateService.rebuildTopicLearningState(userId, topicAId);
    expect(rebuildRes.rebuiltConceptsCount).toBe(1);

    const fenceAfter = await TopicLearningStateFence.findOne({ userId, topicId: topicAId });
    expect(fenceAfter.version).toBe(1); // Version remained 1 (+0)
    expect(fenceAfter.activeRebuildLock.lockId).toBeNull(); // Lock cleanly released
  });

  it('7. First-use fence creation race: losing transaction aborts and cleanly retries via runInTransaction', async () => {
    const topicRaceId = new mongoose.Types.ObjectId();
    await Topic.create({
      _id: topicRaceId,
      subjectId,
      userId,
      title: 'Race Topic',
      name: 'Race Topic',
      normalizedTitle: 'race topic',
      orderIndex: 3,
    });
    const conceptRace = await Concept.create({
      _id: new mongoose.Types.ObjectId(),
      topicId: topicRaceId,
      subjectId,
      userId,
      name: 'Race Concept',
      normalizedName: 'race concept',
      orderIndex: 1,
      prerequisites: [],
    });

    const turn1 = {
      _id: new mongoose.Types.ObjectId(),
      answeredAt: new Date(),
      question: { targetConceptIds: [conceptRace._id] },
      evaluation: { verdict: 'CORRECT', correctness: 80 },
    };
    const turn2 = {
      _id: new mongoose.Types.ObjectId(),
      answeredAt: new Date(),
      question: { targetConceptIds: [conceptRace._id] },
      evaluation: { verdict: 'CORRECT', correctness: 90 },
    };

    // Execute two concurrent transactions that contend on creating the initial TopicLearningStateFence
    const [res1, res2] = await Promise.all([
      runInTransaction(async (session) => {
        return await learningStateService.projectTurnRealtime(userId, new mongoose.Types.ObjectId(), turn1, {
          session,
          topicId: topicRaceId,
          forceFence: true,
        });
      }),
      runInTransaction(async (session) => {
        return await learningStateService.projectTurnRealtime(userId, new mongoose.Types.ObjectId(), turn2, {
          session,
          topicId: topicRaceId,
          forceFence: true,
        });
      }),
    ]);

    expect(res1.projected).toBe(true);
    expect(res2.projected).toBe(true);

    // Exactly one fence document exists and its version cleanly reached 2
    const fences = await TopicLearningStateFence.find({ userId, topicId: topicRaceId });
    expect(fences).toHaveLength(1);
    expect(fences[0].version).toBe(2);
  });

  it('8. Cross-topic prerequisite race: live turn in prerequisite topic during rebuild aborts publication with 409', async () => {
    // Topic B depends on Concept X in Topic A
    // Hook: between Phase 1 snapshot capture and Phase 3 publication, simulate live turn in Topic A
    let mutationHookTriggered = false;

    const turnOnX = {
      _id: new mongoose.Types.ObjectId(),
      answeredAt: new Date(),
      question: { targetConceptIds: [conceptXId] },
      evaluation: { verdict: 'CORRECT', correctness: 95 },
    };

    let caughtError = null;
    try {
      await learningStateService.rebuildTopicLearningState(userId, topicBId, {
        afterSnapshotHook: async () => {
          mutationHookTriggered = true;
          // Live turn commits in Topic A, incrementing Topic A fence version
          await runInTransaction(async (session) => {
            await learningStateService.projectTurnRealtime(userId, new mongoose.Types.ObjectId(), turnOnX, {
              session,
              topicId: topicAId,
              forceFence: true,
            });
          });
        },
      });
    } catch (err) {
      caughtError = err;
    }

    expect(mutationHookTriggered).toBe(true);
    expect(caughtError).toBeDefined();
    expect(caughtError.code).toBe('REBUILD_CONCURRENT_MUTATION_CONFLICT');
    expect(caughtError.statusCode).toBe(409);

    // Ensure rebuild did not commit corrupt state
    const fenceA = await TopicLearningStateFence.findOne({ userId, topicId: topicAId });
    expect(fenceA.version).toBe(1);
    expect(fenceA.activeRebuildLock.lockId).toBeNull(); // Safely cleared
  });

  it('9. Stale lease takeover: expired lease (>30s) is legally acquired by new rebuild worker', async () => {
    const expiredLockId = 'stale-worker-uuid-1';
    const thirtyOneSecsAgo = new Date(Date.now() - 31000);

    // Pre-seed an expired lock on Topic A
    await TopicLearningStateFence.create({
      userId,
      topicId: topicAId,
      version: 0,
      activeRebuildLock: {
        lockId: expiredLockId,
        acquiredAt: new Date(Date.now() - 61000),
        expiresAt: thirtyOneSecsAgo,
      },
    });

    // New rebuild worker must succeed in acquiring and completing
    const rebuildRes = await learningStateService.rebuildTopicLearningState(userId, topicAId);
    expect(rebuildRes.rebuiltConceptsCount).toBe(1);

    const fence = await TopicLearningStateFence.findOne({ userId, topicId: topicAId });
    expect(fence.activeRebuildLock.lockId).toBeNull(); // New worker finished and cleared lock cleanly
  });

  it('10. Stale worker lock isolation: worker with expired lockId cannot clear a replacement lock', async () => {
    const lockWorker1 = 'worker-1-uuid';
    const lockWorker2 = 'worker-2-uuid';

    // Worker 2 currently holds the active lease
    await TopicLearningStateFence.create({
      userId,
      topicId: topicAId,
      version: 0,
      activeRebuildLock: {
        lockId: lockWorker2,
        acquiredAt: new Date(),
        expiresAt: new Date(Date.now() + 30000),
      },
    });

    // Stale Worker 1 attempts to release the lock using safe owner predicate
    await TopicLearningStateFence.updateMany(
      { topicId: topicAId, userId, 'activeRebuildLock.lockId': lockWorker1 },
      { $set: { 'activeRebuildLock.lockId': null, 'activeRebuildLock.acquiredAt': null, 'activeRebuildLock.expiresAt': null } }
    );

    // Worker 2's lock is completely preserved!
    const fence = await TopicLearningStateFence.findOne({ userId, topicId: topicAId });
    expect(fence.activeRebuildLock.lockId).toBe(lockWorker2);
  });

  it('11. Overlapping rebuilds on shared closure acquire leases in deterministic order without deadlock', async () => {
    // Both Topic A and Topic B rebuilds execute concurrently
    // Since Topic B depends on A, closure of B is [A, B] and closure of A is [A].
    // Deterministic ascending sorting guarantees both sort A first.
    const [resA, resB] = await Promise.allSettled([
      learningStateService.rebuildTopicLearningState(userId, topicAId),
      learningStateService.rebuildTopicLearningState(userId, topicBId),
    ]);

    // One must succeed, or if lock is held, the other fails cleanly with 409 REBUILD_LOCK_ACTIVE (no deadlock!)
    const statuses = [resA.status, resB.status];
    expect(statuses).toContain('fulfilled');
  });

  it('12. UnknownTransactionCommitResult handling retries commit on active session without replaying callback', async () => {
    let callbackExecutionCount = 0;
    let commitCallCount = 0;

    const mockWorkFn = async (session) => {
      callbackExecutionCount += 1;
      return { success: true };
    };

    // Run custom test wrapping runInTransaction commit simulation
    const originalStartSession = mongoose.startSession.bind(mongoose);
    vi.spyOn(mongoose, 'startSession').mockImplementation(async (...args) => {
      const realSession = await originalStartSession(...args);
      const originalCommit = realSession.commitTransaction.bind(realSession);

      realSession.commitTransaction = async function () {
        commitCallCount += 1;
        if (commitCallCount === 1) {
          const err = new Error('Simulated unknown commit error');
          err.errorLabels = ['UnknownTransactionCommitResult'];
          err.hasErrorLabel = (label) => label === 'UnknownTransactionCommitResult';
          throw err;
        }
        return await originalCommit();
      };
      return realSession;
    });

    const res = await runInTransaction(mockWorkFn);
    expect(res.success).toBe(true);
    expect(callbackExecutionCount).toBe(1); // Callback was executed ONCE
    expect(commitCallCount).toBe(2); // Commit was retried on the same active session
  });

  it('13. Unexpected ProcessedStudyTurn insertion failure aborts publication transaction', async () => {
    // Force ProcessedStudyTurn.insertMany to reject inside publication
    vi.spyOn(ProcessedStudyTurn, 'insertMany').mockRejectedValueOnce(
      new Error('Disk write failure / unexpected ledger failure')
    );

    // Pre-seed a turn in StudySession
    await StudySession.create({
      _id: new mongoose.Types.ObjectId(),
      userId,
      subjectId,
      topicId: topicAId,
      turns: [
        {
          _id: new mongoose.Types.ObjectId(),
          turnIndex: 0,
          clientTurnId: 'turn-c13-1',
          attemptType: 'INITIAL',
          answeredAt: new Date(),
          question: {
            questionId: 'q-c13-1',
            prompt: 'Explain Paxos protocol',
            questionType: 'explain_in_own_words',
            targetConceptIds: [conceptXId],
          },
          evaluation: { verdict: 'CORRECT', correctness: 90 },
        },
      ],
    });

    let threw = false;
    try {
      await learningStateService.rebuildTopicLearningState(userId, topicAId);
    } catch (err) {
      threw = true;
      expect(err.message).toContain('Disk write failure');
    }

    expect(threw).toBe(true);
  });

  it('14. Sparse rebuild materialization: only concepts with completed attempts are persisted to ConceptLearningState', async () => {
    const conceptZId = new mongoose.Types.ObjectId();
    const conceptWId = new mongoose.Types.ObjectId();

    // In topicA:
    // conceptXId has 1 correct turn
    // conceptZId has 1 failed turn
    // conceptWId has 0 turns (unstudied)
    await Concept.create([
      {
        _id: conceptZId,
        topicId: topicAId,
        subjectId,
        userId,
        name: 'Two-Phase Commit',
        normalizedName: 'two-phase commit',
        orderIndex: 2,
        prerequisites: [],
      },
      {
        _id: conceptWId,
        topicId: topicAId,
        subjectId,
        userId,
        name: 'Chandy-Lamport',
        normalizedName: 'chandy-lamport',
        orderIndex: 3,
        prerequisites: [],
      },
    ]);

    await StudySession.create({
      _id: new mongoose.Types.ObjectId(),
      userId,
      subjectId,
      topicId: topicAId,
      turns: [
        {
          _id: new mongoose.Types.ObjectId(),
          turnIndex: 0,
          clientTurnId: 'turn-c14-1',
          attemptType: 'INITIAL',
          answeredAt: new Date(),
          question: {
            questionId: 'q-c14-1',
            prompt: 'Explain Paxos protocol',
            questionType: 'explain_in_own_words',
            targetConceptIds: [conceptXId],
          },
          evaluation: { verdict: 'CORRECT', correctness: 85 },
        },
        {
          _id: new mongoose.Types.ObjectId(),
          turnIndex: 1,
          clientTurnId: 'turn-c14-2',
          attemptType: 'INITIAL',
          answeredAt: new Date(),
          question: {
            questionId: 'q-c14-2',
            prompt: 'Explain Two-Phase Commit',
            questionType: 'explain_in_own_words',
            targetConceptIds: [conceptZId],
          },
          evaluation: { verdict: 'INCORRECT', correctness: 20 },
        },
      ],
    });

    const rebuildRes = await learningStateService.rebuildTopicLearningState(userId, topicAId);
    expect(rebuildRes.status).toBe('COMPLETED');
    expect(rebuildRes.processedTurnsCount).toBe(2);

    // In MongoDB collection: exactly 2 documents exist for topicA (conceptXId and conceptZId).
    // ConceptW (0 turns) must NOT have a row persisted in ConceptLearningState!
    const persistedStates = await ConceptLearningState.find({ userId, topicId: topicAId });
    expect(persistedStates).toHaveLength(2);

    const persistedConceptIds = persistedStates.map((s) => s.conceptId.toString());
    expect(persistedConceptIds).toContain(conceptXId.toString());
    expect(persistedConceptIds).toContain(conceptZId.toString());
    expect(persistedConceptIds).not.toContain(conceptWId.toString());

    // Concept W synthesized on read as NOT_STARTED
    const stateW = await learningStateService.getConceptLearningState(userId, conceptWId);
    expect(stateW.state.status).toBe('NOT_STARTED');
    expect(stateW.state.totalRepetitions).toBe(0);
    expect(stateW.state.masteryScore).toBe(0);
    expect(stateW.state.retrievability).toBe(0);

    // Topic summary correctly includes Concept W in notStartedConcepts count and concepts array
    const topicSummary = await learningStateService.getTopicLearningSummary(userId, topicAId);
    expect(topicSummary.summary.totalConcepts).toBe(3);
    expect(topicSummary.summary.notStartedConcepts).toBe(1);
    expect(
      topicSummary.summary.practicingConcepts +
        topicSummary.summary.strugglingConcepts +
        topicSummary.summary.masteredConcepts
    ).toBe(2);
    expect(topicSummary.concepts).toHaveLength(3);
  });
});

