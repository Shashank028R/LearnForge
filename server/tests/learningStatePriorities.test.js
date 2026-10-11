import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import {
  calculateConceptPriorityScore,
  calculateDecayedScore,
  calculateRetrievability,
  compareConceptsByRankingKey,
  determineRankingTier,
  findSubjectTransitivePrerequisiteMetrics,
  generateGlobalRankingKey,
  generatePriorityReason,
  toPublicStatus,
  toPersistedStatus,
  VALID_PUBLIC_STATUSES,
  PERSISTED_TO_PUBLIC_STATUS,
  PUBLIC_TO_PERSISTED_STATUS,
} from '../src/services/learningStateEngine.js';

describe('Phase 09 Checkpoint 3: Learning State Engine & Priority Mathematics', () => {
  const userId = new mongoose.Types.ObjectId();
  const subjectId = new mongoose.Types.ObjectId();
  const topicId = new mongoose.Types.ObjectId();

  const createMockConcept = (name, prerequisites = []) => ({
    _id: new mongoose.Types.ObjectId(),
    userId,
    subjectId,
    topicId,
    name,
    prerequisites: prerequisites.map((p) => (p._id ? p._id : p)),
  });

  it('calculates bounded priority scores strictly within [0, 1000]', () => {
    const concept = createMockConcept('Test Concept');

    // Case 1: Extreme high-urgency state
    const highState = {
      masteryStatus: 'NOT_STARTED',
      masteryScore: 0,
      decayedScore: 0,
      consecutiveFailures: 5,
      activeMisconceptions: [{ text: 'Error 1' }, { text: 'Error 2' }],
      lastDemonstratedAt: null,
    };
    const highMetrics = { unmasteredDownstreamCount: 10, unmasteredPrereqDepth: 0 };
    const highResult = calculateConceptPriorityScore(concept, highState, highMetrics);

    expect(highResult.rawScore).toBeGreaterThan(0);
    expect(highResult.priorityScore).toBeGreaterThanOrEqual(0);
    expect(highResult.priorityScore).toBeLessThanOrEqual(1000);
    expect(Number.isInteger(highResult.priorityScore)).toBe(true);

    // Case 2: Fully mastered state with zero urgency
    const lowState = {
      masteryStatus: 'MASTERED',
      masteryScore: 100,
      decayedScore: 100,
      consecutiveFailures: 0,
      activeMisconceptions: [],
      lastDemonstratedAt: new Date(),
    };
    const lowMetrics = { unmasteredDownstreamCount: 0, unmasteredPrereqDepth: 0 };
    const lowResult = calculateConceptPriorityScore(concept, lowState, lowMetrics);

    expect(lowResult.priorityScore).toBeLessThan(100);
    expect(lowResult.priorityScore).toBeGreaterThanOrEqual(0);
  });

  it('correctly discovers transitive prerequisite chains (A -> B -> C)', () => {
    // Chain: A (Root) -> B (Middle) -> C (Leaf)
    const conceptA = createMockConcept('Concept A', []);
    const conceptB = createMockConcept('Concept B', [conceptA]);
    const conceptC = createMockConcept('Concept C', [conceptB]);

    const subjectConcepts = [conceptA, conceptB, conceptC];

    // All concepts unmastered
    const userLearningStates = new Map();

    const metricsMap = findSubjectTransitivePrerequisiteMetrics(subjectConcepts, userLearningStates);

    const metricsA = metricsMap.get(conceptA._id.toString());
    const metricsB = metricsMap.get(conceptB._id.toString());
    const metricsC = metricsMap.get(conceptC._id.toString());

    // Concept A is root blocker (depth 0, blocks B and C => count 2)
    expect(metricsA.unmasteredPrereqDepth).toBe(0);
    expect(metricsA.unmasteredDownstreamCount).toBe(2);
    expect(metricsA.isRootBlocker).toBe(true);
    expect(metricsA.isBlocked).toBe(false);

    // Concept B is middle (depth 1, blocks C => count 1)
    expect(metricsB.unmasteredPrereqDepth).toBe(1);
    expect(metricsB.unmasteredDownstreamCount).toBe(1);
    expect(metricsB.isRootBlocker).toBe(false);
    expect(metricsB.isBlocked).toBe(true);

    // Concept C is leaf (depth 2, blocks 0 => count 0)
    expect(metricsC.unmasteredPrereqDepth).toBe(2);
    expect(metricsC.unmasteredDownstreamCount).toBe(0);
    expect(metricsC.isRootBlocker).toBe(false);
    expect(metricsC.isBlocked).toBe(true);
  });

  it('unblocks downstream concepts when root prerequisites become MASTERED', () => {
    const conceptA = createMockConcept('Concept A', []);
    const conceptB = createMockConcept('Concept B', [conceptA]);
    const subjectConcepts = [conceptA, conceptB];

    // Mark Concept A as MASTERED
    const userLearningStates = new Map([
      [conceptA._id.toString(), { masteryStatus: 'MASTERED', masteryScore: 90 }],
    ]);

    const metricsMap = findSubjectTransitivePrerequisiteMetrics(subjectConcepts, userLearningStates);
    const metricsB = metricsMap.get(conceptB._id.toString());

    // Concept B is now unblocked (depth 0) and has 0 downstream unmastered concepts
    expect(metricsB.unmasteredPrereqDepth).toBe(0);
    expect(metricsB.isBlocked).toBe(false);
    expect(metricsB.isRootBlocker).toBe(false);
  });

  it('ranks root blockers (Tier 1) ahead of unblocked leaves (Tier 2) and gated concepts (Tier 3)', () => {
    const conceptA = createMockConcept('Root Blocker A', []);
    const conceptB = createMockConcept('Gated Concept B', [conceptA]);
    const conceptStandalone = createMockConcept('Standalone C', []);

    const stateA = { masteryStatus: 'NOT_STARTED', masteryScore: 0 };
    const stateB = { masteryStatus: 'NOT_STARTED', masteryScore: 0 };
    const stateStandalone = { masteryStatus: 'NOT_STARTED', masteryScore: 0 };

    const metricsA = { unmasteredPrereqDepth: 0, unmasteredDownstreamCount: 1 };
    const metricsB = { unmasteredPrereqDepth: 1, unmasteredDownstreamCount: 0 };
    const metricsStandalone = { unmasteredPrereqDepth: 0, unmasteredDownstreamCount: 0 };

    const scoreA = calculateConceptPriorityScore(conceptA, stateA, metricsA).priorityScore;
    const scoreB = calculateConceptPriorityScore(conceptB, stateB, metricsB).priorityScore;
    const scoreStandalone = calculateConceptPriorityScore(conceptStandalone, stateStandalone, metricsStandalone).priorityScore;

    const itemA = { concept: conceptA, rankingKey: generateGlobalRankingKey(conceptA, stateA, scoreA, metricsA) };
    const itemB = { concept: conceptB, rankingKey: generateGlobalRankingKey(conceptB, stateB, scoreB, metricsB) };
    const itemStandalone = {
      concept: conceptStandalone,
      rankingKey: generateGlobalRankingKey(conceptStandalone, stateStandalone, scoreStandalone, metricsStandalone),
    };

    expect(itemA.rankingKey.tier).toBe(1); // Tier 1: Root Blocker
    expect(itemStandalone.rankingKey.tier).toBe(2); // Tier 2: Unblocked Active
    expect(itemB.rankingKey.tier).toBe(3); // Tier 3: Gated Concept

    const candidates = [itemB, itemStandalone, itemA];
    candidates.sort(compareConceptsByRankingKey);

    // Global order: Root Blocker (Tier 1) -> Standalone (Tier 2) -> Gated (Tier 3)
    expect(candidates[0].concept.name).toBe('Root Blocker A');
    expect(candidates[1].concept.name).toBe('Standalone C');
    expect(candidates[2].concept.name).toBe('Gated Concept B');
  });

  it('guarantees deterministic tie-breaking on identical scores', () => {
    const concept1 = createMockConcept('Concept Alpha');
    const concept2 = createMockConcept('Concept Beta');

    const state = { masteryStatus: 'NOT_STARTED', masteryScore: 0, decayedScore: 0, consecutiveFailures: 0 };
    const metrics = { unmasteredPrereqDepth: 0, unmasteredDownstreamCount: 0 };

    const item1 = { concept: concept1, rankingKey: generateGlobalRankingKey(concept1, state, 250, metrics) };
    const item2 = { concept: concept2, rankingKey: generateGlobalRankingKey(concept2, state, 250, metrics) };

    const sorted1 = [item1, item2].sort(compareConceptsByRankingKey);
    const sorted2 = [item2, item1].sort(compareConceptsByRankingKey);

    expect(sorted1[0].concept._id.toString()).toBe(sorted2[0].concept._id.toString());
  });

  it('handles cyclic prerequisite graphs defensively without infinite recursion', () => {
    // Cycle: A -> B -> A
    const conceptA = createMockConcept('Cycle A');
    const conceptB = createMockConcept('Cycle B', [conceptA]);
    conceptA.prerequisites = [conceptB._id];

    const subjectConcepts = [conceptA, conceptB];
    const metricsMap = findSubjectTransitivePrerequisiteMetrics(subjectConcepts, new Map());

    expect(metricsMap.has(conceptA._id.toString())).toBe(true);
    expect(metricsMap.has(conceptB._id.toString())).toBe(true);
    expect(typeof metricsMap.get(conceptA._id.toString()).unmasteredPrereqDepth).toBe('number');
  });

  it('generates appropriate recommendation reason codes', () => {
    const concept = createMockConcept('Reason Test');

    expect(
      generatePriorityReason(concept, { masteryStatus: 'NOT_STARTED' }, 300, {
        unmasteredPrereqDepth: 0,
        unmasteredDownstreamCount: 2,
      })
    ).toBe('ROOT_PREREQUISITE_BLOCKER');

    expect(
      generatePriorityReason(
        concept,
        { masteryStatus: 'NEEDS_REVIEW', activeMisconceptions: [{ text: 'Err' }] },
        200,
        { unmasteredPrereqDepth: 0, unmasteredDownstreamCount: 0 }
      )
    ).toBe('ACTIVE_MISCONCEPTION');

    expect(
      generatePriorityReason(
        concept,
        { masteryStatus: 'NEEDS_REVIEW', consecutiveFailures: 3 },
        200,
        { unmasteredPrereqDepth: 0, unmasteredDownstreamCount: 0 }
      )
    ).toBe('RECENT_FAILURE');

    expect(
      generatePriorityReason(concept, { masteryStatus: 'MASTERED', masteryScore: 95 }, 0, {
        unmasteredPrereqDepth: 0,
        unmasteredDownstreamCount: 0,
      })
    ).toBe('MAINTENANCE_REVIEW');
  });

  it('regression: brings all six scoring factors into exact agreement with Checkpoint 3 v10', () => {
    const concept = createMockConcept('Factor Math Test');
    const evalTime = new Date('2026-10-10T12:00:00.000Z');

    // Test Factor 1: Prerequisite urgency (min(300, 60 * downstream))
    const resPrereq5 = calculateConceptPriorityScore(concept, { masteryStatus: 'NOT_STARTED' }, { unmasteredDownstreamCount: 5 }, evalTime);
    expect(resPrereq5.factors.fPrereq).toBe(300); // 60 * 5 = 300
    const resPrereq2 = calculateConceptPriorityScore(concept, { masteryStatus: 'NOT_STARTED' }, { unmasteredDownstreamCount: 2 }, evalTime);
    expect(resPrereq2.factors.fPrereq).toBe(120); // 60 * 2 = 120

    // Test Factor 2: Status urgency across all statuses
    expect(calculateConceptPriorityScore(concept, { masteryStatus: 'NOT_STARTED' }, {}, evalTime).factors.fStatus).toBe(250);
    expect(calculateConceptPriorityScore(concept, { masteryStatus: 'STRUGGLING' }, {}, evalTime).factors.fStatus).toBe(200);
    expect(calculateConceptPriorityScore(concept, { masteryStatus: 'NEEDS_REVIEW' }, {}, evalTime).factors.fStatus).toBe(200);
    expect(calculateConceptPriorityScore(concept, { masteryStatus: 'INTRODUCED' }, {}, evalTime).factors.fStatus).toBe(150);
    expect(calculateConceptPriorityScore(concept, { masteryStatus: 'LEARNING' }, {}, evalTime).factors.fStatus).toBe(150);
    expect(calculateConceptPriorityScore(concept, { masteryStatus: 'PRACTICING' }, {}, evalTime).factors.fStatus).toBe(100);
    expect(calculateConceptPriorityScore(concept, { masteryStatus: 'UNDERSTOOD' }, {}, evalTime).factors.fStatus).toBe(100);
    expect(calculateConceptPriorityScore(concept, { masteryStatus: 'MASTERED' }, {}, evalTime).factors.fStatus).toBe(0);

    // Test Factor 3: Misconception urgency (min(200, 100 * activeMisconceptionsCount))
    const resMisc1 = calculateConceptPriorityScore(concept, { activeMisconceptions: [{ text: '1' }] }, {}, evalTime);
    expect(resMisc1.factors.fMisconception).toBe(100);
    const resMisc3 = calculateConceptPriorityScore(concept, { activeMisconceptions: [{ text: '1' }, { text: '2' }, { text: '3' }] }, {}, evalTime);
    expect(resMisc3.factors.fMisconception).toBe(200); // capped at 200

    // Test Factor 4: Decay urgency based on retrievability F_decay = 150 * (1 - R)
    // When never demonstrated, R = 0, so F_decay = 150
    const resDecayUnstudied = calculateConceptPriorityScore(concept, { masteryStatus: 'NOT_STARTED' }, {}, evalTime);
    expect(resDecayUnstudied.factors.fDecay).toBe(150);

    // When demonstrated exactly at evalTime, R = 1, so F_decay = 0
    const resDecayFresh = calculateConceptPriorityScore(concept, {
      masteryStatus: 'LEARNING',
      lastDemonstratedAt: evalTime,
      stability: 14,
    }, {}, evalTime);
    expect(resDecayFresh.factors.fDecay).toBe(0);

    // When demonstrated 14 days ago with stability 14, R = exp(-14/14) = exp(-1) ~ 0.367879
    // F_decay = Math.round(150 * (1 - 0.367879)) = Math.round(150 * 0.63212) = 95
    const fourteenDaysAgo = new Date(evalTime.getTime() - 14 * 86400000);
    const resDecay14Days = calculateConceptPriorityScore(concept, {
      masteryStatus: 'LEARNING',
      lastDemonstratedAt: fourteenDaysAgo,
      stability: 14,
    }, {}, evalTime);
    expect(resDecay14Days.factors.fDecay).toBe(95);

    // Test Factor 5: Failure urgency (min(90, 30 * consecutiveFailures))
    const resFail2 = calculateConceptPriorityScore(concept, { consecutiveFailures: 2 }, {}, evalTime);
    expect(resFail2.factors.fFailure).toBe(60);
    const resFail5 = calculateConceptPriorityScore(concept, { consecutiveFailures: 5 }, {}, evalTime);
    expect(resFail5.factors.fFailure).toBe(90);

    // Test Factor 6: Recency urgency based on due-date and stability distance
    // Never studied: F_recency = 50
    expect(resDecayUnstudied.factors.fRecency).toBe(50);

    // Overdue (nextDueDate in the past): F_recency = 50
    const resOverdue = calculateConceptPriorityScore(concept, {
      lastDemonstratedAt: new Date(evalTime.getTime() - 10 * 86400000),
      nextDueDate: new Date(evalTime.getTime() - 3 * 86400000),
      stability: 14,
    }, {}, evalTime);
    expect(resOverdue.factors.fRecency).toBe(50);

    // Future due date (e.g. 7 days in future with stability 14):
    // remaining = 7, stability = 14 => 1 - 7/14 = 0.5 => 50 * 0.5 = 25
    const resFutureDue = calculateConceptPriorityScore(concept, {
      lastDemonstratedAt: evalTime,
      nextDueDate: new Date(evalTime.getTime() + 7 * 86400000),
      stability: 14,
    }, {}, evalTime);
    expect(resFutureDue.factors.fRecency).toBe(25);
  });

  it('regression: verifies public status contract and bidirectional mapping for all statuses', () => {
    // Persisted Checkpoint 2 statuses -> Public API statuses
    expect(toPublicStatus('NOT_STARTED')).toBe('NOT_STARTED');
    expect(toPublicStatus('LEARNING')).toBe('INTRODUCED');
    expect(toPublicStatus('UNDERSTOOD')).toBe('PRACTICING');
    expect(toPublicStatus('NEEDS_REVIEW')).toBe('STRUGGLING');
    expect(toPublicStatus('MASTERED')).toBe('MASTERED');

    // Public API statuses -> Persisted Checkpoint 2 statuses
    expect(toPersistedStatus('NOT_STARTED')).toBe('NOT_STARTED');
    expect(toPersistedStatus('INTRODUCED')).toBe('LEARNING');
    expect(toPersistedStatus('PRACTICING')).toBe('UNDERSTOOD');
    expect(toPersistedStatus('STRUGGLING')).toBe('NEEDS_REVIEW');
    expect(toPersistedStatus('MASTERED')).toBe('MASTERED');

    // VALID_PUBLIC_STATUSES contains all 5 public statuses
    expect(VALID_PUBLIC_STATUSES.has('NOT_STARTED')).toBe(true);
    expect(VALID_PUBLIC_STATUSES.has('INTRODUCED')).toBe(true);
    expect(VALID_PUBLIC_STATUSES.has('PRACTICING')).toBe(true);
    expect(VALID_PUBLIC_STATUSES.has('STRUGGLING')).toBe(true);
    expect(VALID_PUBLIC_STATUSES.has('MASTERED')).toBe(true);
    expect(VALID_PUBLIC_STATUSES.has('INVALID')).toBe(false);
  });
});
