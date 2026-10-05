import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Concept } from '../src/models/Concept.js';
import { Topic } from '../src/models/Topic.js';
import { Subject } from '../src/models/Subject.js';
import { StudySession } from '../src/models/StudySession.js';
import { ConceptLearningState } from '../src/models/ConceptLearningState.js';
import { ProcessedStudyTurn } from '../src/models/ProcessedStudyTurn.js';
import { learningStateService } from '../src/services/learningStateService.js';
import { createInitialConceptLearningState } from '../src/services/learningStateEngine.js';

import fs from 'fs';

process.env.MONGOMS_MD5_CHECK = '0';

describe('Phase 09 — Checkpoint 2: Real MongoDB Integration Suite', { timeout: 120000 }, () => {
  let replSet;
  let userId, subjectId, topicId;
  let conceptAId, conceptBId;

  beforeAll(async () => {
    const localBinaryPath = 'C:/Users/shash/.cache/mongodb-binaries/mongod-x64-win32-8.2.6.exe';
    const binaryConfig = fs.existsSync(localBinaryPath) ? { systemBinary: localBinaryPath } : {};

    // Start real replica set to support transactions and real unique indexes
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      binary: binaryConfig,
      instanceOpts: [{ startupTimeout: 60000 }],
    });
    const uri = replSet.getUri();
    await mongoose.connect(uri);

    // Ensure all unique indexes are built on the real database
    await Concept.init();
    await ProcessedStudyTurn.init();
    await ConceptLearningState.init();
    await StudySession.init();
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
    // Clean all collections in test database using raw collection handles for test isolation
    const collections = ['concepts', 'topics', 'subjects', 'studysessions', 'conceptlearningstates', 'processedstudyturns'];
    for (const col of collections) {
      if (mongoose.connection.collections[col]) {
        await mongoose.connection.collections[col].deleteMany({});
      }
    }

    userId = new mongoose.Types.ObjectId();
    subjectId = new mongoose.Types.ObjectId();
    topicId = new mongoose.Types.ObjectId();

    conceptAId = new mongoose.Types.ObjectId();
    conceptBId = new mongoose.Types.ObjectId();
  });

  // Helper barrier for genuine concurrent synchronization
  function createBarrier(count) {
    let waiting = 0;
    let release;
    const barrierPromise = new Promise((resolve) => {
      release = resolve;
    });
    return async function arriveAndWait() {
      waiting += 1;
      if (waiting === count) {
        release();
      } else {
        await barrierPromise;
      }
    };
  }

  // ==========================================
  // 1. REAL MONGODB TWO-WORKER CONCURRENCY TEST
  // ==========================================
  describe('1. Real MongoDB Two-Worker Concurrency & Unique Index Race', () => {
    it('two concurrent workers projecting the same turn race on real MongoDB unique index and guarantee exactly one projection effect', async () => {
      // 1. Setup real Concept in MongoDB
      await Concept.create({
        _id: conceptAId,
        userId,
        subjectId,
        topicId,
        name: 'Distributed Consensus',
        normalizedName: 'distributed consensus',
        description: 'Raft algorithm principles',
        prerequisites: [],
      });

      const turnId = new mongoose.Types.ObjectId();
      const sessionId = new mongoose.Types.ObjectId();
      const turn = {
        _id: turnId,
        attemptType: 'INITIAL',
        question: { targetConceptIds: [conceptAId] },
        evaluation: {
          verdict: 'CORRECT',
          correctness: 85,
          evaluatedAt: new Date(),
        },
        answeredAt: new Date(),
      };

      const barrier = createBarrier(2);

      // Launch two concurrent worker executions without mocking ProcessedStudyTurn
      const worker1 = learningStateService._projectSingleConceptTurn(
        userId,
        sessionId,
        conceptAId,
        turn,
        turn.answeredAt,
        { barrier, force: true }
      );

      const worker2 = learningStateService._projectSingleConceptTurn(
        userId,
        sessionId,
        conceptAId,
        turn,
        turn.answeredAt,
        { barrier, force: true }
      );

      const [res1, res2] = await Promise.all([worker1, worker2]);

      // Exactly one worker must project, exactly one worker must encounter duplicate key and return idempotent
      const projectedResults = [res1, res2].filter((r) => r.projected === true);
      const idempotentResults = [res1, res2].filter((r) => r.idempotent === true);

      expect(projectedResults).toHaveLength(1);
      expect(idempotentResults).toHaveLength(1);

      // Verify real MongoDB state: exactly 1 ProcessedStudyTurn document exists
      const processedCount = await ProcessedStudyTurn.countDocuments({
        userId,
        conceptId: conceptAId,
        turnId,
      });
      expect(processedCount).toBe(1);

      // Verify real MongoDB state: exactly 1 ConceptLearningState document exists
      const stateCount = await ConceptLearningState.countDocuments({
        userId,
        conceptId: conceptAId,
      });
      expect(stateCount).toBe(1);

      // Verify final ConceptLearningState in MongoDB has single turn projection effect
      const finalState = await ConceptLearningState.findOne({ userId, conceptId: conceptAId }).lean();
      expect(finalState).toBeDefined();
      expect(finalState.attemptsCount).toBe(1);
      expect(finalState.consecutiveSuccesses).toBe(1);
      expect(finalState.masteryStatus).toBe('UNDERSTOOD');
      expect(finalState.masteryScore).toBe(70);
    });
  });

  // ==========================================
  // 2. ACTUAL MONGOOSE QUERY-PATH IMMUTABILITY TESTS
  // ==========================================
  describe('2. Actual Mongoose Query-Path Immutability Tests', () => {
    let completedSession;
    let completedTurnId;

    beforeEach(async () => {
      completedTurnId = new mongoose.Types.ObjectId();
      completedSession = await StudySession.create({
        userId,
        subjectId,
        topicId,
        status: 'QUESTIONING',
        turns: [
          {
            _id: completedTurnId,
            turnIndex: 0,
            clientTurnId: 'client-turn-1',
            attemptType: 'INITIAL',
            question: {
              questionId: 'q-1',
              questionType: 'recall',
              prompt: 'Explain Paxos consensus',
            },
            userAnswer: 'Authoritative Student Answer',
            answeredAt: new Date('2026-10-01T10:00:00.000Z'),
            evaluation: {
              verdict: 'CORRECT',
              correctness: 90,
              evaluatedAt: new Date('2026-10-01T10:01:00.000Z'),
            },
          },
        ],
      });
    });

    it('StudySession.updateOne() blocks nested $set tampering of completed turns', async () => {
      await expect(
        StudySession.updateOne(
          { _id: completedSession._id },
          { $set: { 'turns.0.userAnswer': 'Tampered Answer' } }
        )
      ).rejects.toThrow(/Immutability violation/i);

      // Verify database document was not modified
      const doc = await StudySession.findById(completedSession._id).lean();
      expect(doc.turns[0].userAnswer).toBe('Authoritative Student Answer');
    });

    it('StudySession.findOneAndUpdate() blocks nested $set tampering of completed turns', async () => {
      await expect(
        StudySession.findOneAndUpdate(
          { _id: completedSession._id },
          { $set: { 'turns.0.evaluation.verdict': 'INCORRECT' } }
        )
      ).rejects.toThrow(/Immutability violation/i);

      const doc = await StudySession.findById(completedSession._id).lean();
      expect(doc.turns[0].evaluation.verdict).toBe('CORRECT');
    });

    it('StudySession.updateMany() blocks nested $set tampering of completed turns', async () => {
      await expect(
        StudySession.updateMany(
          { _id: completedSession._id },
          { $set: { 'turns.0.evaluation.correctness': 0 } }
        )
      ).rejects.toThrow(/Immutability violation/i);
    });

    it('StudySession.updateOne() blocks $pull deletion of completed turns', async () => {
      await expect(
        StudySession.updateOne(
          { _id: completedSession._id },
          { $pull: { turns: { _id: completedTurnId } } }
        )
      ).rejects.toThrow(/Immutability violation/i);

      const doc = await StudySession.findById(completedSession._id).lean();
      expect(doc.turns).toHaveLength(1);
    });

    it('StudySession.updateOne() blocks $pop deletion of completed turns', async () => {
      await expect(
        StudySession.updateOne(
          { _id: completedSession._id },
          { $pop: { turns: 1 } }
        )
      ).rejects.toThrow(/Immutability violation/i);

      const doc = await StudySession.findById(completedSession._id).lean();
      expect(doc.turns).toHaveLength(1);
    });

    it('StudySession.updateOne() blocks $unset of completed turns array', async () => {
      await expect(
        StudySession.updateOne(
          { _id: completedSession._id },
          { $unset: { turns: 1 } }
        )
      ).rejects.toThrow(/Immutability violation/i);
    });

    it('StudySession.replaceOne() blocks replacement that omits completed turns', async () => {
      await expect(
        StudySession.replaceOne(
          { _id: completedSession._id },
          {
            userId,
            subjectId,
            topicId,
            status: 'COMPLETED',
            turns: [],
          }
        )
      ).rejects.toThrow(/Immutability violation/i);
    });

    it('StudySession.findOneAndReplace() blocks replacement that tampers with completed turns', async () => {
      await expect(
        StudySession.findOneAndReplace(
          { _id: completedSession._id },
          {
            userId,
            subjectId,
            topicId,
            status: 'COMPLETED',
            turns: [
              {
                _id: completedTurnId,
                turnIndex: 0,
                clientTurnId: 'client-turn-1',
                attemptType: 'INITIAL',
                question: { questionId: 'q-1', questionType: 'recall', prompt: 'P' },
                userAnswer: 'Modified answer',
                evaluation: { verdict: 'CORRECT', evaluatedAt: new Date() },
              },
            ],
          }
        )
      ).rejects.toThrow(/Immutability violation/i);
    });

    it('StudySession.deleteOne() blocks deletion of StudySession with completed turns', async () => {
      await expect(
        StudySession.deleteOne({ _id: completedSession._id })
      ).rejects.toThrow(/Cannot delete StudySession/i);

      const doc = await StudySession.findById(completedSession._id).lean();
      expect(doc).toBeDefined();
    });

    it('StudySession.findOneAndDelete() blocks deletion of StudySession with completed turns', async () => {
      await expect(
        StudySession.findOneAndDelete({ _id: completedSession._id })
      ).rejects.toThrow(/Cannot delete StudySession/i);

      const doc = await StudySession.findById(completedSession._id).lean();
      expect(doc).toBeDefined();
    });

    it('StudySession.deleteMany() blocks deletion of StudySessions with completed turns', async () => {
      await expect(
        StudySession.deleteMany({ userId })
      ).rejects.toThrow(/Cannot delete StudySession/i);
    });

    it('allows valid updates to non-turn fields while preserving completed turns byte-for-byte', async () => {
      const updateRes = await StudySession.updateOne(
        { _id: completedSession._id },
        { $set: { title: 'Updated Valid Title' } }
      );
      expect(updateRes.modifiedCount).toBe(1);

      const doc = await StudySession.findById(completedSession._id).lean();
      expect(doc.title).toBe('Updated Valid Title');
      expect(doc.turns[0].userAnswer).toBe('Authoritative Student Answer');
      expect(doc.turns[0].evaluation.verdict).toBe('CORRECT');
    });

    it('allows appending a new turn after completed turn while preserving completed turn immutable', async () => {
      const newTurnId = new mongoose.Types.ObjectId();
      const newTurn = {
        _id: newTurnId,
        turnIndex: 1,
        clientTurnId: 'client-turn-2',
        attemptType: 'INITIAL',
        question: {
          questionId: 'q-2',
          questionType: 'recall',
          prompt: 'Next question',
        },
        userAnswer: null,
        evaluation: { verdict: null },
      };

      const pushRes = await StudySession.updateOne(
        { _id: completedSession._id },
        { $push: { turns: newTurn } }
      );
      expect(pushRes.modifiedCount).toBe(1);

      const doc = await StudySession.findById(completedSession._id).lean();
      expect(doc.turns).toHaveLength(2);
      expect(doc.turns[0]._id.toString()).toBe(completedTurnId.toString());
      expect(doc.turns[0].userAnswer).toBe('Authoritative Student Answer');
      expect(doc.turns[1]._id.toString()).toBe(newTurnId.toString());
    });
  });

  // ==========================================
  // 3. REAL TRANSACTION ROLLBACK TEST FOR REBUILD
  // ==========================================
  describe('3. Real Transaction Rollback Test for Rebuild', () => {
    it('aborts and completely rolls back destructive delete on transaction failure, preserving previous state', async () => {
      // 1. Create valid Concept in topic
      await Concept.create({
        _id: conceptAId,
        userId,
        subjectId,
        topicId,
        name: 'Concept A',
        normalizedName: 'concept a',
        prerequisites: [],
      });

      // 2. Create existing ConceptLearningState materialized state
      await ConceptLearningState.create({
        userId,
        subjectId,
        topicId,
        conceptId: conceptAId,
        masteryStatus: 'LEARNING',
        masteryScore: 65,
        decayedScore: 65,
        confidenceScore: 50,
        attemptsCount: 2,
        consecutiveSuccesses: 1,
        consecutiveFailures: 0,
        stateVersion: 5,
      });

      // 3. Create existing ProcessedStudyTurn ledger entries
      const oldTurnId = new mongoose.Types.ObjectId();
      await ProcessedStudyTurn.create({
        userId,
        conceptId: conceptAId,
        turnId: oldTurnId,
        sessionId: new mongoose.Types.ObjectId(),
        processedAt: new Date(),
      });

      // 4. Create historical StudySession with a completed turn
      const session = await StudySession.create({
        userId,
        subjectId,
        topicId,
        turns: [
          {
            _id: new mongoose.Types.ObjectId(),
            turnIndex: 0,
            clientTurnId: 't-1',
            attemptType: 'INITIAL',
            question: { questionId: 'q-1', questionType: 'recall', prompt: 'P', targetConceptIds: [conceptAId] },
            userAnswer: 'Ans',
            answeredAt: new Date(),
            evaluation: { verdict: 'CORRECT', correctness: 90, evaluatedAt: new Date() },
          },
        ],
      });

      // 5. Force a deterministic failure inside the rebuild transaction after the initial deleteMany has executed
      // by injecting an error hook on ConceptLearningState.insertMany
      const originalInsertMany = ConceptLearningState.insertMany;
      ConceptLearningState.insertMany = async function (...args) {
        throw new Error('Simulated database write failure during rebuild transaction');
      };

      try {
        await expect(
          learningStateService.rebuildTopicLearningState(userId, topicId)
        ).rejects.toThrow('Simulated database write failure during rebuild transaction');
      } finally {
        ConceptLearningState.insertMany = originalInsertMany;
      }

      // 6. Verify full rollback: existing ConceptLearningState is completely preserved
      const preservedState = await ConceptLearningState.findOne({ userId, conceptId: conceptAId }).lean();
      expect(preservedState).toBeDefined();
      expect(preservedState.masteryStatus).toBe('LEARNING');
      expect(preservedState.masteryScore).toBe(65);
      expect(preservedState.stateVersion).toBe(5);

      // 7. Verify full rollback: existing ProcessedStudyTurn is preserved
      const preservedLedger = await ProcessedStudyTurn.findOne({ userId, conceptId: conceptAId, turnId: oldTurnId }).lean();
      expect(preservedLedger).toBeDefined();

      // 8. Verify clean rebuild succeeds after fixing failure
      const successfulRebuild = await learningStateService.rebuildTopicLearningState(userId, topicId);
      expect(successfulRebuild.rebuiltCount).toBe(1);
      expect(successfulRebuild.conceptStates[0].masteryStatus).toBe('UNDERSTOOD');
      expect(successfulRebuild.conceptStates[0].masteryScore).toBe(70);

      // Verify updated database state
      const updatedState = await ConceptLearningState.findOne({ userId, conceptId: conceptAId }).lean();
      expect(updatedState.masteryStatus).toBe('UNDERSTOOD');
      expect(updatedState.masteryScore).toBe(70);
    });
  });
});
