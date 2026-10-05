import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { Concept } from '../src/models/Concept.js';
import { Topic } from '../src/models/Topic.js';
import { Subject } from '../src/models/Subject.js';
import { StudySession, assertTurnImmutability } from '../src/models/StudySession.js';
import { ConceptLearningState } from '../src/models/ConceptLearningState.js';
import { ProcessedStudyTurn } from '../src/models/ProcessedStudyTurn.js';
import {
  calculateDecayedScore,
  calculateScoreGain,
  calculateScorePenalty,
  calculateConfidenceGain,
  calculateConfidencePenalty,
  isConceptMastered,
  createInitialConceptLearningState,
  applyTurnToConceptState,
  projectEvidenceHistory,
  sortTargetConceptsByDependency,
} from '../src/services/learningStateEngine.js';
import {
  validatePrerequisitesGraph,
  checkPrerequisitesSatisfied,
} from '../src/services/conceptPrerequisiteValidator.js';
import { LearningStateService } from '../src/services/learningStateService.js';
import { StudyService } from '../src/study/services/studyService.js';

describe('Phase 09 — Checkpoint 2: Learning State Engine & Rebuild Implementation', () => {
  let userId, subjectId, topicId;
  let conceptAId, conceptBId, conceptCId;

  beforeEach(() => {
    userId = new mongoose.Types.ObjectId();
    subjectId = new mongoose.Types.ObjectId();
    topicId = new mongoose.Types.ObjectId();

    conceptAId = new mongoose.Types.ObjectId();
    conceptBId = new mongoose.Types.ObjectId();
    conceptCId = new mongoose.Types.ObjectId();
  });

  // ==========================================
  // 1. PURE MATHEMATICAL RETENTION DECAY TESTS
  // ==========================================
  describe('1. Retention Decay Calculation (ADR-019 Option A: Daily Exponential Decay)', () => {
    const baseScore = 90;
    const baseDate = new Date('2026-10-01T00:00:00.000Z');

    it('returns 0 if never demonstrated', () => {
      expect(calculateDecayedScore(90, null, baseDate)).toBe(0);
      expect(calculateDecayedScore(0, baseDate, baseDate)).toBe(0);
    });

    it('returns 100% of score within 7-day grace period (0 to 7 days)', () => {
      // 0 days elapsed
      expect(calculateDecayedScore(baseScore, baseDate, baseDate)).toBe(90);

      // 5 days elapsed
      const day5 = new Date('2026-10-06T00:00:00.000Z');
      expect(calculateDecayedScore(baseScore, baseDate, day5)).toBe(90);

      // 7 days elapsed (grace boundary)
      const day7 = new Date('2026-10-08T00:00:00.000Z');
      expect(calculateDecayedScore(baseScore, baseDate, day7)).toBe(90);
    });

    it('calculates mathematically correct daily decay beyond grace period', () => {
      // 8 days elapsed (1 day beyond grace: e^(-0.005 * 1) = 0.9950 => 89.55 => 90)
      const day8 = new Date('2026-10-09T00:00:00.000Z');
      expect(calculateDecayedScore(baseScore, baseDate, day8)).toBe(90);

      // 14 days elapsed (7 days beyond grace: e^(-0.005 * 7) = 0.9656 => 86.9 => 87)
      const day14 = new Date('2026-10-15T00:00:00.000Z');
      expect(calculateDecayedScore(baseScore, baseDate, day14)).toBe(87);

      // 37 days elapsed (30 days beyond grace: e^(-0.005 * 30) = 0.8607 => 77.46 => 77)
      const day37 = new Date('2026-11-07T00:00:00.000Z');
      expect(calculateDecayedScore(baseScore, baseDate, day37)).toBe(77);

      // 145 days elapsed (138 days beyond grace - Half-Life: e^(-0.005 * 138) = 0.5016 => 45.14 => 45)
      const day145 = new Date('2027-02-23T00:00:00.000Z');
      expect(calculateDecayedScore(baseScore, baseDate, day145)).toBe(45);
    });

    it('strictly enforces 35% retention floor for very large elapsed times', () => {
      // 365 days elapsed (358 days beyond grace => floor 35% of 90 = 31.5 => 32)
      const day365 = new Date('2027-10-01T00:00:00.000Z');
      expect(calculateDecayedScore(baseScore, baseDate, day365)).toBe(32);

      // 1000 days elapsed => floor 35% of 90 = 32
      const day1000 = new Date('2029-06-27T00:00:00.000Z');
      expect(calculateDecayedScore(baseScore, baseDate, day1000)).toBe(32);
    });
  });

  // ==========================================
  // 2. BOUNDED SCORE & CONFIDENCE ADJUSTMENTS
  // ==========================================
  describe('2. Bounded Score & Confidence Adjustments', () => {
    it('applies gain damping as score approaches 100', () => {
      const gainLow = calculateScoreGain(20, 25); // ~ 25 * (1 - 20/120) = 25 * 0.833 = 21
      expect(gainLow).toBe(41);

      const gainHigh = calculateScoreGain(90, 25); // ~ 25 * (1 - 90/120) = 25 * 0.25 = 6
      expect(gainHigh).toBe(96);

      const gainMax = calculateScoreGain(100, 25);
      expect(gainMax).toBe(100);
    });

    it('applies penalty scaling as score increases', () => {
      const penLow = calculateScorePenalty(30, 25); // ~ 25 * max(0.4, 30/100) = 25 * 0.4 = 10
      expect(penLow).toBe(20);

      const penHigh = calculateScorePenalty(90, 25); // ~ 25 * (90/100) = 25 * 0.9 = 23
      expect(penHigh).toBe(67);

      const penFloor = calculateScorePenalty(5, 25);
      expect(penFloor).toBe(0);
    });
  });

  // ==========================================
  // 3. CANONICAL PREREQUISITES VALIDATION & SUBJECT ISOLATION
  // ==========================================
  describe('3. Canonical Prerequisites Graph Validation & Subject Isolation', () => {
    it('accepts same-topic prerequisite within same subject', async () => {
      const fakeConceptModel = {
        findOne: vi.fn().mockResolvedValue({ subjectId }),
        find: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([{ _id: conceptBId, subjectId, prerequisites: [] }]),
        }),
      };

      const result = await validatePrerequisitesGraph(userId, conceptAId, [conceptBId], fakeConceptModel, subjectId);
      expect(result.valid).toBe(true);
    });

    it('accepts cross-topic prerequisite within SAME subject', async () => {
      const fakeConceptModel = {
        findOne: vi.fn().mockResolvedValue({ subjectId }),
        find: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([{ _id: conceptBId, subjectId, prerequisites: [] }]),
        }),
      };

      const result = await validatePrerequisitesGraph(userId, conceptAId, [conceptBId], fakeConceptModel, subjectId);
      expect(result.valid).toBe(true);
    });

    it('rejects cross-subject prerequisite with Subject isolation violation', async () => {
      const otherSubjectId = new mongoose.Types.ObjectId();
      const fakeConceptModel = {
        findOne: vi.fn().mockResolvedValue({ subjectId }),
        find: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([{ _id: conceptBId, subjectId: otherSubjectId, prerequisites: [] }]),
        }),
      };

      await expect(
        validatePrerequisitesGraph(userId, conceptAId, [conceptBId], fakeConceptModel, subjectId)
      ).rejects.toThrow('Subject isolation violation');
    });

    it('rejects self-referential prerequisite', async () => {
      const fakeConceptModel = {
        find: vi.fn(),
        findOne: vi.fn(),
      };

      await expect(
        validatePrerequisitesGraph(userId, conceptAId, [conceptAId], fakeConceptModel, subjectId)
      ).rejects.toThrow('Self-reference violation');
    });

    it('rejects missing or cross-tenant prerequisites', async () => {
      const fakeConceptModel = {
        findOne: vi.fn().mockResolvedValue({ subjectId }),
        find: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]), // Only 0 found instead of 1
        }),
      };

      await expect(
        validatePrerequisitesGraph(userId, conceptAId, [conceptBId], fakeConceptModel, subjectId)
      ).rejects.toThrow('Tenant isolation / missing prerequisite violation');
    });

    it('detects and rejects cyclical prerequisite chains (A -> B -> A)', async () => {
      const fakeConceptModel = {
        findOne: vi.fn().mockImplementation((query) => {
          if (query._id.toString() === conceptBId.toString()) {
            return {
              lean: vi.fn().mockResolvedValue({ _id: conceptBId, subjectId, prerequisites: [conceptAId] }),
            };
          }
          return { lean: vi.fn().mockResolvedValue({ subjectId }) };
        }),
        find: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([{ _id: conceptBId, subjectId, prerequisites: [conceptAId] }]),
        }),
      };

      await expect(
        validatePrerequisitesGraph(userId, conceptAId, [conceptBId], fakeConceptModel, subjectId)
      ).rejects.toThrow('Cycle violation');
    });

    it('correctly evaluates prerequisite satisfaction states', () => {
      const prereqMap = new Map();
      prereqMap.set(conceptBId.toString(), {
        masteryStatus: 'UNDERSTOOD',
        decayedScore: 75,
        activeMisconceptions: [],
      });

      // Fully satisfied
      const check1 = checkPrerequisitesSatisfied([conceptBId], prereqMap);
      expect(check1.satisfied).toBe(true);
      expect(check1.unmetPrerequisiteIds).toHaveLength(0);

      // Decayed below threshold (< 50)
      prereqMap.set(conceptBId.toString(), {
        masteryStatus: 'UNDERSTOOD',
        decayedScore: 45,
        activeMisconceptions: [],
      });
      const check2 = checkPrerequisitesSatisfied([conceptBId], prereqMap);
      expect(check2.satisfied).toBe(false);
      expect(check2.unmetPrerequisiteIds).toContainEqual(conceptBId);

      // Active misconception present
      prereqMap.set(conceptBId.toString(), {
        masteryStatus: 'UNDERSTOOD',
        decayedScore: 80,
        activeMisconceptions: [{ misconceptionText: 'Error' }],
      });
      const check3 = checkPrerequisitesSatisfied([conceptBId], prereqMap);
      expect(check3.satisfied).toBe(false);

      // Missing prerequisite state
      const check4 = checkPrerequisitesSatisfied([conceptCId], prereqMap);
      expect(check4.satisfied).toBe(false);
      expect(check4.unmetPrerequisiteIds).toContainEqual(conceptCId);
    });
  });

  // ==========================================
  // 4. FULL STATE TRANSITION MATRIX TESTS
  // ==========================================
  describe('4. Complete State Transition Matrix (ADR-019)', () => {
    const fixedNow = new Date('2026-10-05T12:00:00.000Z');

    it('NOT_STARTED + CORRECT (>= 85%) => UNDERSTOOD', () => {
      const initial = createInitialConceptLearningState(conceptAId, userId, subjectId, topicId);
      const turn = {
        _id: new mongoose.Types.ObjectId(),
        attemptType: 'INITIAL',
        answeredAt: fixedNow,
        evaluation: {
          verdict: 'CORRECT',
          correctness: 90,
          completeness: 85,
          misconceptionDetected: false,
        },
      };

      const result = applyTurnToConceptState(initial, turn, { evaluationTime: fixedNow });
      expect(result.masteryStatus).toBe('UNDERSTOOD');
      expect(result.masteryScore).toBe(70);
      expect(result.confidenceScore).toBe(40);
      expect(result.consecutiveSuccesses).toBe(1);
      expect(result.attemptsCount).toBe(1);
      expect(result.lastDemonstratedAt).toEqual(fixedNow);
    });

    it('NOT_STARTED + CORRECT (< 85%) => LEARNING', () => {
      const initial = createInitialConceptLearningState(conceptAId, userId, subjectId, topicId);
      const turn = {
        _id: new mongoose.Types.ObjectId(),
        attemptType: 'INITIAL',
        answeredAt: fixedNow,
        evaluation: {
          verdict: 'CORRECT',
          correctness: 80,
          completeness: 75,
          misconceptionDetected: false,
        },
      };

      const result = applyTurnToConceptState(initial, turn, { evaluationTime: fixedNow });
      expect(result.masteryStatus).toBe('LEARNING');
      expect(result.masteryScore).toBe(50);
      expect(result.confidenceScore).toBe(30);
    });

    it('NOT_STARTED + PARTIALLY_CORRECT => LEARNING', () => {
      const initial = createInitialConceptLearningState(conceptAId, userId, subjectId, topicId);
      const turn = {
        _id: new mongoose.Types.ObjectId(),
        attemptType: 'INITIAL',
        answeredAt: fixedNow,
        evaluation: {
          verdict: 'PARTIALLY_CORRECT',
          correctness: 60,
          completeness: 50,
        },
      };

      const result = applyTurnToConceptState(initial, turn, { evaluationTime: fixedNow });
      expect(result.masteryStatus).toBe('LEARNING');
      expect(result.masteryScore).toBe(35);
      expect(result.confidenceScore).toBe(20);
      expect(result.consecutiveSuccesses).toBe(0);
    });

    it('NOT_STARTED + INCORRECT => NEEDS_REVIEW', () => {
      const initial = createInitialConceptLearningState(conceptAId, userId, subjectId, topicId);
      const turn = {
        _id: new mongoose.Types.ObjectId(),
        attemptType: 'INITIAL',
        answeredAt: fixedNow,
        evaluation: {
          verdict: 'INCORRECT',
          correctness: 20,
          misconceptionDetected: true,
          misconceptionSummary: 'Confused stack with queue',
        },
      };

      const result = applyTurnToConceptState(initial, turn, { evaluationTime: fixedNow });
      expect(result.masteryStatus).toBe('NEEDS_REVIEW');
      expect(result.masteryScore).toBe(10);
      expect(result.consecutiveFailures).toBe(1);
      expect(result.activeMisconceptions).toHaveLength(1);
      expect(result.activeMisconceptions[0].misconceptionText).toBe('Confused stack with queue');
    });

    it('LEARNING + 2 consecutive failures => NEEDS_REVIEW', () => {
      const state = {
        ...createInitialConceptLearningState(conceptAId, userId, subjectId, topicId),
        masteryStatus: 'LEARNING',
        masteryScore: 50,
        confidenceScore: 30,
        attemptsCount: 1,
        consecutiveFailures: 1,
      };

      const turn = {
        _id: new mongoose.Types.ObjectId(),
        attemptType: 'INITIAL',
        answeredAt: fixedNow,
        evaluation: {
          verdict: 'INCORRECT',
          misconceptionDetected: false,
        },
      };

      const result = applyTurnToConceptState(state, turn, { evaluationTime: fixedNow });
      expect(result.masteryStatus).toBe('NEEDS_REVIEW');
      expect(result.consecutiveFailures).toBe(2);
      expect(result.masteryScore).toBeLessThan(50);
    });

    it('UNDERSTOOD + INCORRECT => NEEDS_REVIEW', () => {
      const state = {
        ...createInitialConceptLearningState(conceptAId, userId, subjectId, topicId),
        masteryStatus: 'UNDERSTOOD',
        masteryScore: 75,
        confidenceScore: 60,
        attemptsCount: 2,
        consecutiveSuccesses: 2,
      };

      const turn = {
        _id: new mongoose.Types.ObjectId(),
        attemptType: 'INITIAL',
        answeredAt: fixedNow,
        evaluation: {
          verdict: 'INCORRECT',
          misconceptionDetected: true,
          misconceptionSummary: 'Syntax error assumption',
        },
      };

      const result = applyTurnToConceptState(state, turn, { evaluationTime: fixedNow });
      expect(result.masteryStatus).toBe('NEEDS_REVIEW');
      expect(result.consecutiveSuccesses).toBe(0);
      expect(result.consecutiveFailures).toBe(1);
      expect(result.activeMisconceptions).toHaveLength(1);
    });

    it('MASTERED + INCORRECT => NEEDS_REVIEW (Demotion)', () => {
      const state = {
        ...createInitialConceptLearningState(conceptAId, userId, subjectId, topicId),
        masteryStatus: 'MASTERED',
        masteryScore: 92,
        confidenceScore: 85,
        attemptsCount: 4,
        consecutiveSuccesses: 3,
      };

      const turn = {
        _id: new mongoose.Types.ObjectId(),
        attemptType: 'INITIAL',
        answeredAt: fixedNow,
        evaluation: {
          verdict: 'INCORRECT',
          misconceptionDetected: true,
          misconceptionSummary: 'Forgotten edge case',
        },
      };

      const result = applyTurnToConceptState(state, turn, { evaluationTime: fixedNow });
      expect(result.masteryStatus).toBe('NEEDS_REVIEW');
      expect(result.consecutiveSuccesses).toBe(0);
      expect(result.masteryScore).toBeLessThan(70);
    });

    it('NEEDS_REVIEW + Socratic FOLLOW_UP CORRECT => Resolves active misconceptions & returns to LEARNING/UNDERSTOOD', () => {
      const state = {
        ...createInitialConceptLearningState(conceptAId, userId, subjectId, topicId),
        masteryStatus: 'NEEDS_REVIEW',
        masteryScore: 35,
        confidenceScore: 20,
        attemptsCount: 2,
        activeMisconceptions: [
          {
            misconceptionText: 'Confused stack with queue',
            detectedAt: new Date('2026-10-04T00:00:00Z'),
            turnId: new mongoose.Types.ObjectId(),
          },
        ],
      };

      const followUpTurn = {
        _id: new mongoose.Types.ObjectId(),
        attemptType: 'FOLLOW_UP',
        answeredAt: fixedNow,
        evaluation: {
          verdict: 'CORRECT',
          correctness: 90,
          completeness: 85,
        },
      };

      const result = applyTurnToConceptState(state, followUpTurn, { evaluationTime: fixedNow });
      expect(result.activeMisconceptions).toHaveLength(0);
      expect(result.resolvedMisconceptions).toHaveLength(1);
      expect(result.resolvedMisconceptions[0].misconceptionText).toBe('Confused stack with queue');
      expect(result.masteryStatus).toBe('LEARNING');
      expect(result.consecutiveSuccesses).toBe(1);
      expect(result.consecutiveFailures).toBe(0);
    });
  });

  // ==========================================
  // 5. MASTERED PROOF & PREREQUISITE GATING
  // ==========================================
  describe('5. Multi-Attempt MASTERED Proof & Prerequisite Gating', () => {
    const fixedNow = new Date('2026-10-05T12:00:00.000Z');

    it('CORRECT != AUTOMATIC MASTERED (Single correct attempt cannot achieve MASTERED)', () => {
      expect(
        isConceptMastered({
          consecutiveSuccesses: 1,
          attemptsCount: 1,
          masteryScore: 70,
          confidenceScore: 40,
          activeMisconceptions: [],
          prerequisitesSatisfied: true,
        })
      ).toBe(false);
    });

    it('proves MASTERED when all 6 criteria are strictly satisfied', () => {
      expect(
        isConceptMastered({
          consecutiveSuccesses: 2,
          attemptsCount: 3,
          masteryScore: 88,
          confidenceScore: 80,
          activeMisconceptions: [],
          prerequisitesSatisfied: true,
        })
      ).toBe(true);
    });

    it('blocks MASTERED and stays UNDERSTOOD if canonical prerequisites are unsatisfied', () => {
      const state = {
        ...createInitialConceptLearningState(conceptAId, userId, subjectId, topicId),
        masteryStatus: 'UNDERSTOOD',
        masteryScore: 82,
        confidenceScore: 70,
        attemptsCount: 2,
        consecutiveSuccesses: 1,
      };

      const turn = {
        _id: new mongoose.Types.ObjectId(),
        attemptType: 'INITIAL',
        answeredAt: fixedNow,
        evaluation: {
          verdict: 'CORRECT',
          correctness: 95,
        },
      };

      // Prerequisite B is unmet
      const prereqMap = new Map();
      prereqMap.set(conceptBId.toString(), {
        masteryStatus: 'LEARNING',
        decayedScore: 30,
        activeMisconceptions: [],
      });

      const result = applyTurnToConceptState(state, turn, {
        prerequisites: [conceptBId],
        prerequisiteStatesMap: prereqMap,
        evaluationTime: fixedNow,
      });

      expect(result.masteryStatus).toBe('UNDERSTOOD'); // Gated from MASTERED
      expect(result.prerequisiteWarning).toBe(true);
      expect(result.unmetPrerequisiteIds).toContainEqual(conceptBId);
    });

    it('advances to MASTERED once canonical prerequisites become satisfied', () => {
      const state = {
        ...createInitialConceptLearningState(conceptAId, userId, subjectId, topicId),
        masteryStatus: 'UNDERSTOOD',
        masteryScore: 82,
        confidenceScore: 70,
        attemptsCount: 2,
        consecutiveSuccesses: 1,
      };

      const turn = {
        _id: new mongoose.Types.ObjectId(),
        attemptType: 'INITIAL',
        answeredAt: fixedNow,
        evaluation: {
          verdict: 'CORRECT',
          correctness: 95,
        },
      };

      // Prerequisite B is now satisfied
      const prereqMap = new Map();
      prereqMap.set(conceptBId.toString(), {
        masteryStatus: 'UNDERSTOOD',
        decayedScore: 80,
        activeMisconceptions: [],
      });

      const result = applyTurnToConceptState(state, turn, {
        prerequisites: [conceptBId],
        prerequisiteStatesMap: prereqMap,
        evaluationTime: fixedNow,
      });

      expect(result.masteryStatus).toBe('MASTERED');
      expect(result.prerequisiteWarning).toBe(false);
      expect(result.unmetPrerequisiteIds).toHaveLength(0);
    });
  });

  // ==========================================
  // 6. CROSS-TOPIC PREREQUISITES & REBUILD PARITY
  // ==========================================
  describe('6. Cross-Topic Prerequisite Rebuild Parity', () => {
    const t0 = new Date('2026-10-01T10:00:00.000Z');
    const t1 = new Date('2026-10-02T10:00:00.000Z');
    const t2 = new Date('2026-10-03T10:00:00.000Z');
    const evaluationClock = new Date('2026-10-15T12:00:00.000Z');

    it('resolves cross-topic prerequisite correctly during batch rebuild', () => {
      // Concept A is in Topic 1, Concept B is in Topic 2 and depends on Concept A
      const topic1Id = new mongoose.Types.ObjectId();
      const topic2Id = new mongoose.Types.ObjectId();

      const initialMap = new Map();
      // External prerequisite Concept A from Topic 1 (already UNDERSTOOD)
      initialMap.set(conceptAId.toString(), {
        ...createInitialConceptLearningState(conceptAId, userId, subjectId, topic1Id),
        masteryStatus: 'UNDERSTOOD',
        masteryScore: 85,
        decayedScore: 85,
        lastDemonstratedAt: t0,
      });

      // Target Concept B in Topic 2
      initialMap.set(conceptBId.toString(), createInitialConceptLearningState(conceptBId, userId, subjectId, topic2Id));

      const prereqMap = new Map();
      prereqMap.set(conceptBId.toString(), [conceptAId]);

      const turn1 = {
        _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
        answeredAt: t1,
        question: { targetConceptIds: [conceptBId] },
        evaluation: { verdict: 'CORRECT', correctness: 90 },
      };

      const turn2 = {
        _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439012'),
        answeredAt: t2,
        question: { targetConceptIds: [conceptBId] },
        evaluation: { verdict: 'CORRECT', correctness: 95 },
      };

      const rebuiltMap = projectEvidenceHistory(initialMap, [turn1, turn2], prereqMap, evaluationClock);

      const stateB = rebuiltMap.get(conceptBId.toString());
      expect(stateB).toBeDefined();
      expect(stateB.masteryStatus).toBe('UNDERSTOOD');
      expect(stateB.prerequisiteWarning).toBe(false); // Successfully resolved Concept A across topics
      expect(stateB.unmetPrerequisiteIds).toHaveLength(0);
    });

    it('produces identical state regardless of turn arrival order (Deterministic Total Ordering)', () => {
      const initialMap = new Map();
      initialMap.set(conceptAId.toString(), createInitialConceptLearningState(conceptAId, userId, subjectId, topicId));

      const turn1 = {
        _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
        answeredAt: t0,
        question: { targetConceptIds: [conceptAId] },
        evaluation: { verdict: 'CORRECT', correctness: 90 },
      };

      const turn2 = {
        _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439012'),
        answeredAt: t1,
        question: { targetConceptIds: [conceptAId] },
        evaluation: { verdict: 'CORRECT', correctness: 95 },
      };

      const turn3 = {
        _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439013'),
        answeredAt: t2,
        question: { targetConceptIds: [conceptAId] },
        evaluation: { verdict: 'CORRECT', correctness: 92 },
      };

      const forwardResult = projectEvidenceHistory(initialMap, [turn1, turn2, turn3], new Map(), evaluationClock);
      const shuffledResult = projectEvidenceHistory(initialMap, [turn3, turn1, turn2], new Map(), evaluationClock);

      const stateForward = forwardResult.get(conceptAId.toString());
      const stateShuffled = shuffledResult.get(conceptAId.toString());

      expect(stateForward.masteryStatus).toBe(stateShuffled.masteryStatus);
      expect(stateForward.masteryScore).toBe(stateShuffled.masteryScore);
      expect(stateForward.decayedScore).toBe(stateShuffled.decayedScore);
      expect(stateForward.confidenceScore).toBe(stateShuffled.confidenceScore);
      expect(stateForward.attemptsCount).toBe(stateShuffled.attemptsCount);
      expect(stateForward.consecutiveSuccesses).toBe(stateShuffled.consecutiveSuccesses);
      expect(stateForward.lastDemonstratedAt).toEqual(stateShuffled.lastDemonstratedAt);
    });
  });

  // ==========================================
  // 7. COMPLETED TURN IMMUTABILITY GUARANTEES (Mongoose Query-Path & Model Invariants)
  // ==========================================
  describe('7. Completed StudyTurn Immutability Guarantees', () => {
    it('assertTurnImmutability passes for unmodified completed turns', () => {
      const turnId = new mongoose.Types.ObjectId();
      const existing = [
        {
          _id: turnId,
          turnIndex: 0,
          clientTurnId: 'client-1',
          attemptType: 'INITIAL',
          question: { questionId: 'q-1' },
          userAnswer: 'My Answer',
          evaluation: {
            verdict: 'CORRECT',
            correctness: 90,
            evaluatedAt: new Date(),
          },
        },
      ];

      const updated = [
        {
          _id: turnId,
          turnIndex: 0,
          clientTurnId: 'client-1',
          attemptType: 'INITIAL',
          question: { questionId: 'q-1' },
          userAnswer: 'My Answer',
          evaluation: {
            verdict: 'CORRECT',
            correctness: 90,
            evaluatedAt: existing[0].evaluation.evaluatedAt,
          },
        },
      ];

      expect(() => assertTurnImmutability(existing, updated)).not.toThrow();
    });

    it('assertTurnImmutability throws if completed turn answer or evaluation is altered', () => {
      const turnId = new mongoose.Types.ObjectId();
      const existing = [
        {
          _id: turnId,
          turnIndex: 0,
          clientTurnId: 'client-1',
          attemptType: 'INITIAL',
          question: { questionId: 'q-1' },
          userAnswer: 'Original Answer',
          evaluation: {
            verdict: 'CORRECT',
            correctness: 90,
            evaluatedAt: new Date(),
          },
        },
      ];

      const tampered = [
        {
          _id: turnId,
          turnIndex: 0,
          clientTurnId: 'client-1',
          attemptType: 'INITIAL',
          question: { questionId: 'q-1' },
          userAnswer: 'Tampered Answer',
          evaluation: {
            verdict: 'CORRECT',
            correctness: 90,
            evaluatedAt: existing[0].evaluation.evaluatedAt,
          },
        },
      ];

      expect(() => assertTurnImmutability(existing, tampered)).toThrow('Immutability violation');
    });

    it('assertTurnImmutability throws if completed turn is deleted from array', () => {
      const turnId = new mongoose.Types.ObjectId();
      const existing = [
        {
          _id: turnId,
          turnIndex: 0,
          clientTurnId: 'client-1',
          attemptType: 'INITIAL',
          question: { questionId: 'q-1' },
          userAnswer: 'Original Answer',
          evaluation: {
            verdict: 'CORRECT',
            correctness: 90,
            evaluatedAt: new Date(),
          },
        },
      ];

      const deleted = [];

      expect(() => assertTurnImmutability(existing, deleted)).toThrow('cannot be deleted');
    });

    it('query middleware blocks updateOne with $set tampering on completed turns', async () => {
      const turnId = new mongoose.Types.ObjectId();
      const existingDoc = {
        _id: new mongoose.Types.ObjectId(),
        turns: [
          {
            _id: turnId,
            turnIndex: 0,
            userAnswer: 'Original',
            evaluation: { verdict: 'CORRECT', evaluatedAt: new Date() },
          },
        ],
      };

      const mockQueryContext = {
        model: {
          base: { now: () => new Date() },
          schema: { options: {} },
          find: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([existingDoc]),
            }),
          }),
        },
        getQuery: () => ({ _id: existingDoc._id }),
        getUpdate: () => ({
          $set: { 'turns.0.userAnswer': 'Hacked Answer' },
        }),
      };

      const hooks = StudySession.schema.s.hooks._pres.get('updateOne') || [];
      let capturedError = null;

      for (const hook of hooks) {
        if (hook.fn.toString().includes('assertTurnImmutability') || hook.fn.toString().includes('TURN_IMMUTABILITY_VIOLATION')) {
          await new Promise((resolve) => {
            hook.fn.call(mockQueryContext, (err) => {
              if (err) capturedError = err;
              resolve();
            });
          });
        }
      }

      expect(capturedError).toBeDefined();
      expect(capturedError.code).toBe('TURN_IMMUTABILITY_VIOLATION');
    });

    it('query middleware blocks updateOne with $pull / $pop / $unset on completed turns', async () => {
      const turnId = new mongoose.Types.ObjectId();
      const existingDoc = {
        _id: new mongoose.Types.ObjectId(),
        turns: [
          {
            _id: turnId,
            turnIndex: 0,
            userAnswer: 'Original',
            evaluation: { verdict: 'CORRECT', evaluatedAt: new Date() },
          },
        ],
      };

      const mockQueryContext = {
        model: {
          base: { now: () => new Date() },
          schema: { options: {} },
          find: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([existingDoc]),
            }),
          }),
        },
        getQuery: () => ({ _id: existingDoc._id }),
        getUpdate: () => ({
          $pull: { turns: { _id: turnId } },
        }),
      };

      const hooks = StudySession.schema.s.hooks._pres.get('updateOne') || [];
      let capturedError = null;

      for (const hook of hooks) {
        if (hook.fn.toString().includes('assertTurnImmutability') || hook.fn.toString().includes('TURN_IMMUTABILITY_VIOLATION')) {
          await new Promise((resolve) => {
            hook.fn.call(mockQueryContext, (err) => {
              if (err) capturedError = err;
              resolve();
            });
          });
        }
      }

      expect(capturedError).toBeDefined();
      expect(capturedError.code).toBe('TURN_IMMUTABILITY_VIOLATION');
    });

    it('query middleware blocks deleteOne / findOneAndDelete on session with completed turns', async () => {
      const turnId = new mongoose.Types.ObjectId();
      const existingDoc = {
        _id: new mongoose.Types.ObjectId(),
        turns: [
          {
            _id: turnId,
            turnIndex: 0,
            evaluation: { verdict: 'CORRECT', evaluatedAt: new Date() },
          },
        ],
      };

      const mockQueryContext = {
        model: {
          find: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([existingDoc]),
            }),
          }),
        },
        getQuery: () => ({ _id: existingDoc._id }),
      };

      const hooks = StudySession.schema.s.hooks._pres.get('deleteOne') || [];
      let capturedError = null;

      for (const hook of hooks) {
        if (hook.fn.toString().includes('Cannot delete StudySession') || hook.fn.toString().includes('TURN_IMMUTABILITY_VIOLATION')) {
          await new Promise((resolve) => {
            hook.fn.call(mockQueryContext, (err) => {
              if (err) capturedError = err;
              resolve();
            });
          });
        }
      }

      expect(capturedError).toBeDefined();
      expect(capturedError.code).toBe('TURN_IMMUTABILITY_VIOLATION');
    });
  });

  // ==========================================
  // 8. SAME-TURN TOPOLOGICAL DEPENDENCY ORDERING & INTEGRATION
  // ==========================================
  describe('8. Same-Turn Topological Dependency Ordering & Realtime Projection', () => {
    let service;

    beforeEach(() => {
      service = new LearningStateService();
    });

    it('sortTargetConceptsByDependency orders prerequisites before dependent concepts', () => {
      const idA = new mongoose.Types.ObjectId('507f1f77bcf86cd799439001');
      const idB = new mongoose.Types.ObjectId('507f1f77bcf86cd799439002');
      const idC = new mongoose.Types.ObjectId('507f1f77bcf86cd799439003');

      // Dependency graph: C depends on B, B depends on A
      const prereqMap = new Map();
      prereqMap.set(idB.toString(), [idA]);
      prereqMap.set(idC.toString(), [idB]);
      prereqMap.set(idA.toString(), []);

      // Shuffled input
      const input = [idC, idA, idB];
      const sorted = sortTargetConceptsByDependency(input, prereqMap);

      expect(sorted.map((id) => id.toString())).toEqual([idA.toString(), idB.toString(), idC.toString()]);
    });

    it('sortTargetConceptsByDependency applies lexicographical tie-breaker for independent concepts', () => {
      const idX = new mongoose.Types.ObjectId('507f1f77bcf86cd799439009');
      const idY = new mongoose.Types.ObjectId('507f1f77bcf86cd799439001');

      const prereqMap = new Map();
      const sorted = sortTargetConceptsByDependency([idX, idY], prereqMap);

      expect(sorted[0].toString()).toBe(idY.toString());
      expect(sorted[1].toString()).toBe(idX.toString());
    });

    it('processes same-turn concepts in topological order so dependent concept benefits from updated prerequisite', () => {
      const idA = new mongoose.Types.ObjectId('507f1f77bcf86cd799439001');
      const idB = new mongoose.Types.ObjectId('507f1f77bcf86cd799439002');

      const initialMap = new Map();
      initialMap.set(idA.toString(), {
        ...createInitialConceptLearningState(idA, userId, subjectId, topicId),
        masteryStatus: 'LEARNING',
        masteryScore: 80,
        attemptsCount: 2,
        consecutiveSuccesses: 1,
      });
      initialMap.set(idB.toString(), {
        ...createInitialConceptLearningState(idB, userId, subjectId, topicId),
        masteryStatus: 'UNDERSTOOD',
        masteryScore: 85,
        confidenceScore: 80,
        attemptsCount: 2,
        consecutiveSuccesses: 1,
      });

      // B depends on A
      const prereqMap = new Map();
      prereqMap.set(idB.toString(), [idA]);
      prereqMap.set(idA.toString(), []);

      // Turn targets [B, A] in reversed order
      const turn = {
        _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439099'),
        answeredAt: new Date('2026-10-05T10:00:00.000Z'),
        question: { targetConceptIds: [idB, idA] },
        evaluation: { verdict: 'CORRECT', correctness: 90 },
      };

      const result = projectEvidenceHistory(initialMap, [turn], prereqMap, new Date('2026-10-05T10:00:00.000Z'));

      const finalA = result.get(idA.toString());
      const finalB = result.get(idB.toString());

      // A was processed first and reached MASTERED
      expect(finalA.consecutiveSuccesses).toBe(2);
      expect(finalA.masteryScore).toBeGreaterThanOrEqual(85);

      // B was processed after A, seeing A satisfied, allowing B to become MASTERED
      expect(finalB.masteryStatus).toBe('MASTERED');
      expect(finalB.prerequisiteWarning).toBe(false);
    });

    it('rejects turn projection if turn is un-evaluated', async () => {
      const result = await service.projectTurnRealtime(userId, new mongoose.Types.ObjectId(), {
        evaluation: { verdict: null },
      });
      expect(result.projected).toBe(false);
    });

    it('computes dynamic topic summary on read from concept states', () => {
      const conceptStates = [
        { masteryStatus: 'MASTERED', masteryScore: 90, decayedScore: 90, activeMisconceptions: [] },
        { masteryStatus: 'UNDERSTOOD', masteryScore: 75, decayedScore: 70, activeMisconceptions: [] },
        { masteryStatus: 'LEARNING', masteryScore: 40, decayedScore: 40, activeMisconceptions: [] },
        {
          masteryStatus: 'NEEDS_REVIEW',
          masteryScore: 20,
          decayedScore: 20,
          activeMisconceptions: [{ misconceptionText: 'Error' }],
        },
      ];

      const summary = service._computeTopicSummary(conceptStates);
      expect(summary.totalConcepts).toBe(4);
      expect(summary.masteredCount).toBe(1);
      expect(summary.understoodCount).toBe(1);
      expect(summary.learningCount).toBe(1);
      expect(summary.needsReviewCount).toBe(1);
      expect(summary.activeMisconceptionsCount).toBe(1);
      expect(summary.averageMasteryScore).toBe(56);
    });
  });

  // ==========================================
  // 9. HISTORICAL TRANSITIVE CLOSURE REBUILD & TRANSACTIONAL GUARANTEES
  // ==========================================
  describe('9. Historical Transitive Closure Rebuild & Transactional Guarantees', () => {
    let service;

    beforeEach(() => {
      service = new LearningStateService();
    });

    it('rebuildTopicLearningState discovers and replays prerequisite closure across multiple topics from raw turns', async () => {
      const topic1Id = new mongoose.Types.ObjectId();
      const topic2Id = new mongoose.Types.ObjectId();
      const cA = { _id: conceptAId, userId, subjectId, topicId: topic1Id, prerequisites: [] };
      const cB = { _id: conceptBId, userId, subjectId, topicId: topic2Id, prerequisites: [conceptAId] };

      // Mock Concept queries
      vi.spyOn(Concept, 'find').mockImplementation((query) => {
        if (query.topicId?.equals(topic2Id)) {
          return { lean: vi.fn().mockResolvedValue([cB]) };
        }
        if (query._id?.$in) {
          return { lean: vi.fn().mockResolvedValue([cA]) };
        }
        return { lean: vi.fn().mockResolvedValue([]) };
      });

      // Mock StudySession queries returning turns for Topic 1 and Topic 2
      const turnA = {
        _id: new mongoose.Types.ObjectId(),
        answeredAt: new Date('2026-10-01T10:00:00.000Z'),
        question: { targetConceptIds: [conceptAId] },
        evaluation: { verdict: 'CORRECT', correctness: 90 },
      };
      const turnB = {
        _id: new mongoose.Types.ObjectId(),
        answeredAt: new Date('2026-10-02T10:00:00.000Z'),
        question: { targetConceptIds: [conceptBId] },
        evaluation: { verdict: 'CORRECT', correctness: 90 },
      };

      vi.spyOn(StudySession, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { _id: new mongoose.Types.ObjectId(), topicId: topic1Id, turns: [turnA] },
          { _id: new mongoose.Types.ObjectId(), topicId: topic2Id, turns: [turnB] },
        ]),
      });

      vi.spyOn(ConceptLearningState, 'deleteMany').mockResolvedValue({ deletedCount: 1 });
      vi.spyOn(ProcessedStudyTurn, 'deleteMany').mockResolvedValue({ deletedCount: 1 });
      vi.spyOn(ConceptLearningState, 'insertMany').mockImplementation((docs) => Promise.resolve(docs));
      vi.spyOn(ProcessedStudyTurn, 'insertMany').mockResolvedValue([]);

      const rebuildRes = await service.rebuildTopicLearningState(userId, topic2Id);

      expect(rebuildRes.rebuiltCount).toBe(1);
      expect(rebuildRes.conceptStates[0].conceptId.toString()).toBe(conceptBId.toString());
      expect(rebuildRes.conceptStates[0].prerequisiteWarning).toBe(false);
    });
  });

  // ==========================================
  // 10. GENUINE BARRIER-BASED TWO-WORKER CONCURRENCY TEST
  // ==========================================
  describe('10. Genuine Barrier-Based Two-Worker Concurrency Test', () => {
    let service;

    beforeEach(() => {
      service = new LearningStateService();
    });

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

    it('two concurrent workers projecting the same turn synchronize on barrier and preserve idempotency', async () => {
      const turnId = new mongoose.Types.ObjectId();
      const sessionId = new mongoose.Types.ObjectId();
      const turn = {
        _id: turnId,
        attemptType: 'INITIAL',
        question: { targetConceptIds: [conceptAId] },
        evaluation: { verdict: 'CORRECT', correctness: 90 },
        answeredAt: new Date(),
      };

      const barrier = createBarrier(2);
      let claimCallCount = 0;

      // Mock ProcessedStudyTurn.create so worker 1 succeeds and worker 2 gets duplicate key error (11000)
      vi.spyOn(ProcessedStudyTurn, 'create').mockImplementation(async () => {
        claimCallCount += 1;
        if (claimCallCount === 1) {
          return { _id: new mongoose.Types.ObjectId() };
        }
        const err = new Error('E11000 duplicate key error');
        err.code = 11000;
        throw err;
      });

      vi.spyOn(Concept, 'findOne').mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: conceptAId, userId, subjectId, topicId, prerequisites: [] }),
      });

      vi.spyOn(ConceptLearningState, 'findOne').mockImplementation(() => {
        const fakeDoc = {
          _id: new mongoose.Types.ObjectId(),
          userId,
          conceptId: conceptAId,
          stateVersion: 1,
          toObject: () => ({ ...createInitialConceptLearningState(conceptAId, userId, subjectId, topicId) }),
          save: vi.fn().mockResolvedValue(true),
        };
        return {
          session: vi.fn().mockReturnThis(),
          lean: vi.fn().mockResolvedValue(fakeDoc.toObject()),
          then: (resolve) => resolve(fakeDoc),
        };
      });

      vi.spyOn(ConceptLearningState, 'updateOne').mockResolvedValue({ matchedCount: 1 });
      vi.spyOn(ConceptLearningState, 'findById').mockReturnValue({
        session: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue({ _id: new mongoose.Types.ObjectId(), stateVersion: 2 }),
      });

      // Launch both workers concurrently with shared barrier
      const worker1Promise = service._projectSingleConceptTurn(
        userId,
        sessionId,
        conceptAId,
        turn,
        turn.answeredAt,
        { barrier, force: true }
      );

      const worker2Promise = service._projectSingleConceptTurn(
        userId,
        sessionId,
        conceptAId,
        turn,
        turn.answeredAt,
        { barrier, force: true }
      );

      const [res1, res2] = await Promise.all([worker1Promise, worker2Promise]);

      const projectedResults = [res1, res2].filter((r) => r.projected === true);
      const idempotentResults = [res1, res2].filter((r) => r.idempotent === true);

      // Exactly one worker projects, exactly one worker receives idempotent bypass
      expect(projectedResults).toHaveLength(1);
      expect(idempotentResults).toHaveLength(1);
    });
  });
});
