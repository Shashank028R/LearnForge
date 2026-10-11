import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import {
  calculateConceptPriorityScore,
  calculateDecayedScore,
  compareConceptsByRankingKey,
  determineRankingTier,
  findSubjectTransitivePrerequisiteMetrics,
  generateGlobalRankingKey,
  generatePriorityReason,
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
});
