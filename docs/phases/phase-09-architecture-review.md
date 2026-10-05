# Phase 09 — Learning State Engine Architecture Review

**Status**: APPROVED ARCHITECTURE DRAFT  
**Author**: Implementation Engineer  
**Date**: October 5, 2026  
**Repository Remote**: `https://github.com/Shashank028R/LearnForge.git`  
**Base Commit (HEAD)**: `3016d784bc2849c2c69e9fde631a0350f099cf25`  

---

## 1. Executive Summary & Core Principle

In LearnForge, our core architectural separation of concerns is:

> **“Canonical Knowledge is the product. Conversations and Study Sessions record evidence. Learning State interprets that evidence into explainable, structured mastery.”**

### Semantic Boundaries (Strictly Non-Destructive)

| Layer | Source / Model | Mutability | Role in Phase 09 |
| :--- | :--- | :---: | :--- |
| **A. Canonical Knowledge** | `Concept`, `Topic`, `Subject`, `NoteDocument`, `NoteVersion` | Strict / Versioned | **READ-ONLY**. Learning State references concept `_id`s but **NEVER** mutates canonical definitions, notes, or topics. |
| **B. Syllabus** | `SyllabusVersion` | Immutable | **READ-ONLY**. Referenced for approved curriculum structure. |
| **C. Evidence Ledger** | `StudySession.turns`, `LearningEvent` | Append-Only | **SOURCE OF TRUTH**. Immutable historical record of student answers, evaluations, remediations, and chat extractions. |
| **D. Learning State** | `ConceptLearningState`, `TopicLearningStateSummary` | Materialized Projection | **DERIVED INTERPRETATION**. Materialized, deterministic projection of student mastery, confidence, misconceptions, and retention. **Fully rebuildable from evidence**. |

---

## 2. Evidence Audit: What Phase 08 Records vs. What Phase 09 Derives

### Source Evidence Recorded in Phase 08 (`StudySession.turns`)

From our repository audit of `server/src/models/StudySession.js`:

```javascript
studyTurnSchema = {
  turnIndex: Number,
  clientTurnId: String,
  attemptType: 'INITIAL' | 'FOLLOW_UP',
  parentTurnId: ObjectId, // Links follow-up to initiating turn
  question: {
    questionId: String,
    questionType: String,
    prompt: String,
    targetConceptIds: [ObjectId],     // Canonical Concept IDs
    targetConceptNames: [String],
    expectedReasoningSignals: [String],
    difficultyIntent: 'introductory' | 'intermediate' | 'advanced',
    prerequisiteConceptIds: [ObjectId],
    generatedAt: Date,
  },
  userAnswer: String,
  answeredAt: Date,
  evaluation: {
    verdict: 'CORRECT' | 'PARTIALLY_CORRECT' | 'INCORRECT' | 'UNCERTAIN',
    correctness: Number (0-100),
    completeness: Number (0-100),
    reasoningQuality: Number (0-100),
    misconceptionDetected: Boolean,
    misconceptionSummary: String,
    missingConcepts: [String],
    strengths: [String],
    weaknesses: [String],
    feedback: String,
    nextAction: 'ADVANCE' | 'PROBE' | 'REMEDIATE' | 'RETRY' | 'CLARIFY',
    evaluatedAt: Date,
    provenance: { provider, model, latencyMs, requestId, source },
  },
  remediation: { remediationText, followUpQuestion, remediatedAt }
}
```

### Questions Phase 09 Answers from this Evidence

1. **Demonstrated Concepts**: Which concepts have $\ge 1$ verified `CORRECT` evaluations without active misconceptions?
2. **Weak / Struggling Concepts**: Which concepts have repeated `INCORRECT` verdicts or $\ge 2$ consecutive failures?
3. **Partially Understood**: Which concepts have `PARTIALLY_CORRECT` verdicts or missing reasoning signals?
4. **Active Misconceptions**: What specific misconceptions were flagged (`misconceptionDetected === true`) and have not yet been resolved by a subsequent successful evaluation?
5. **Stability & Depth**: How many attempts were required, what is the streak of consecutive successes, and what is the bounded confidence score?
6. **Retention & Recency**: When was the concept last demonstrated, and what is its time-decayed retention score?
7. **Prerequisite Readiness**: Are prerequisite concepts mastered before advancing to dependent concepts?
8. **Next Study Priorities**: Which concepts have the highest pedagogical priority for the next study session?

---

## 3. Domain Model Design: `ConceptLearningState`

### Schema Definition (`server/src/models/ConceptLearningState.js`)

```javascript
const conceptLearningStateSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true, index: true },
    conceptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true, index: true },

    // Mastery & Confidence Metrics
    masteryStatus: {
      type: String,
      enum: ['NOT_STARTED', 'INTRODUCED', 'LEARNING', 'NEEDS_REVIEW', 'UNDERSTOOD', 'MASTERED'],
      default: 'NOT_STARTED',
      index: true,
    },
    masteryScore: { type: Number, min: 0, max: 100, default: 0 }, // 0 to 100 base score
    confidenceScore: { type: Number, min: 0, max: 100, default: 0 }, // Stability & evidence depth
    decayedScore: { type: Number, min: 0, max: 100, default: 0 }, // Score adjusted for time decay

    // Quantitative Turn Counters
    attemptsCount: { type: Number, min: 0, default: 0 },
    correctCount: { type: Number, min: 0, default: 0 },
    partiallyCorrectCount: { type: Number, min: 0, default: 0 },
    incorrectCount: { type: Number, min: 0, default: 0 },
    followUpCount: { type: Number, min: 0, default: 0 },
    remediationsCount: { type: Number, min: 0, default: 0 },

    // Consecutive Streaks (Stability & Failure Indicators)
    consecutiveSuccesses: { type: Number, min: 0, default: 0 },
    consecutiveFailures: { type: Number, min: 0, default: 0 },

    // Misconception Ledger (Historical & Active)
    activeMisconceptions: [
      {
        misconceptionSummary: { type: String, required: true, trim: true },
        detectedAt: { type: Date, default: Date.now },
        sourceTurnId: { type: mongoose.Schema.Types.ObjectId, default: null },
        sourceSessionId: { type: mongoose.Schema.Types.ObjectId, default: null },
      },
    ],
    resolvedMisconceptions: [
      {
        misconceptionSummary: { type: String, required: true, trim: true },
        detectedAt: { type: Date, required: true },
        resolvedAt: { type: Date, default: Date.now },
        resolutionTurnId: { type: mongoose.Schema.Types.ObjectId, default: null },
        resolutionSessionId: { type: mongoose.Schema.Types.ObjectId, default: null },
      },
    ],

    // Timestamps for Retention & Decay
    lastAttemptedAt: { type: Date, default: null },
    lastDemonstratedAt: { type: Date, default: null }, // Most recent CORRECT verdict
    lastEvaluatedAt: { type: Date, default: null },

    // Processed Turn Ledger for Idempotency
    processedTurnIds: [{ type: mongoose.Schema.Types.ObjectId }],

    // State Metadata
    stateVersion: { type: Number, default: 1, min: 1 },
    lastRebuiltAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Compound Unique Index: Exactly one learning state per user per concept
conceptLearningStateSchema.index({ userId: 1, conceptId: 1 }, { unique: true });

// Compound Query Indices
conceptLearningStateSchema.index({ userId: 1, topicId: 1, masteryStatus: 1 });
conceptLearningStateSchema.index({ userId: 1, subjectId: 1, masteryScore: 1 });
conceptLearningStateSchema.index({ userId: 1, topicId: 1, decayedScore: 1 });
```

### Field Justification Table

| Field | Purpose | Source vs. Derived | Recomputable? |
| :--- | :--- | :--- | :---: |
| `masteryStatus` | Qualitative state for pedagogical UI and query routing | Derived from verdict history + scores | **YES** |
| `masteryScore` | Base quantitative understanding metric (0–100) | Derived via deterministic formula | **YES** |
| `confidenceScore` | Depth of reasoning and evidence consistency | Derived via bounded accumulation | **YES** |
| `decayedScore` | Real-time retention metric accounting for elapsed days | Derived via mathematical decay | **YES** |
| `attemptsCount` | Volume of practice | Aggregated count of turns targeting concept | **YES** |
| `consecutiveSuccesses` | Stability indicator required for `MASTERED` state | Derived chronologically from turns | **YES** |
| `consecutiveFailures` | Struggling indicator triggering `NEEDS_REVIEW` | Derived chronologically from turns | **YES** |
| `activeMisconceptions` | Current conceptual flaws requiring resolution | Filtered from evaluation summaries | **YES** |
| `resolvedMisconceptions` | Auditable history of corrected flaws | Transferred upon subsequent `CORRECT` turn | **YES** |
| `processedTurnIds` | Idempotency guard preventing double-counting | Set of processed `StudyTurn._id`s | **YES** |

---

## 4. Deterministic Mastery Model & Evidence Weighting

### A. State Transition Model

```
                    ┌─────────────────────────┐
                    │       NOT_STARTED       │
                    └────────────┬────────────┘
                                 │ (First Attempt)
                                 ▼
                    ┌─────────────────────────┐
         ┌─────────►│        LEARNING         │◄────────┐
         │          └────────────┬────────────┘         │
         │                       │                      │
         │ (Follow-up Correct /  │ (Correct >= 85%,     │ (Repeated
         │  Misconception Fixed) │  Attempts >= 2)      │  Success)
         │                       ▼                      │
┌────────┴────────┐ ┌─────────────────────────┐         │
│  NEEDS_REVIEW   │ │       UNDERSTOOD        │─────────┘
└────────┬────────┘ └────────────┬────────────┘
         ▲                       │ (Consecutive Successes >= 2,
         │ (Incorrect /          │  Attempts >= 3, Score >= 85,
         │  Misconception)       │  No Active Misconceptions,
         │                       │  Prerequisites Satisfied)
         │                       ▼
         │          ┌─────────────────────────┐
         └──────────│        MASTERED         │
                    └─────────────────────────┘
```

### B. Transition & Scoring Invariants

1. **`CORRECT != AUTOMATIC MASTERED`**:
   - A single `CORRECT` initial answer moves a concept from `NOT_STARTED` to `LEARNING` (or `UNDERSTOOD` if `correctness >= 85` and `completeness >= 80`).
   - `MASTERED` strictly requires:
     - `consecutiveSuccesses >= 2`
     - `attemptsCount >= 3`
     - `masteryScore >= 85`
     - `confidenceScore >= 75`
     - `activeMisconceptions.length === 0`
     - All `prerequisiteConceptIds` in `UNDERSTOOD` or `MASTERED` state.
2. **`INCORRECT != CONCEPT LOST`**:
   - An `INCORRECT` answer resets `consecutiveSuccesses = 0`, increments `consecutiveFailures += 1`, applies a bounded score penalty ($-20$ points, floor of 0), but **preserves** historical attempt and demonstration counts.
   - If `consecutiveFailures >= 2` or `misconceptionDetected === true`, `masteryStatus` transitions to `NEEDS_REVIEW`.
3. **`PARTIALLY_CORRECT`**:
   - Increments `partiallyCorrectCount += 1`, resets `consecutiveFailures = 0`, applies a bounded score gain ($+5$ to $+10$ points based on completeness). Status remains in `LEARNING`.
4. **Socratic Follow-Up Resolution**:
   - When a student completes a `FOLLOW_UP` attempt with verdict `CORRECT`:
     - Moves matching entries from `activeMisconceptions` to `resolvedMisconceptions`.
     - Recovers status from `NEEDS_REVIEW` to `LEARNING` or `UNDERSTOOD`.
     - Increments `correctCount += 1`, `consecutiveSuccesses += 1`, `consecutiveFailures = 0`.
5. **Bounded Score Adjustment Formula**:
   $$\Delta_{\text{gain}} = \text{round}\left( \text{baseDelta} \times \max\left(0.1, 1 - \frac{S_{\text{current}}}{120}\right) \right)$$
   $$\Delta_{\text{penalty}} = \text{round}\left( \text{basePenalty} \times \max\left(0.5, \frac{S_{\text{current}}}{100}\right) \right)$$
   Guarantees scores remain within $[0, 100]$ without runaway inflation or catastrophic total erasure.

---

## 5. Retention & Recency Decay Formula

Learning decay reflects human forgetting curves in an explainable, bounded manner:

### Mathematical Definition
- **Grace Period**: 7 days after `lastDemonstratedAt`. During this window, decay is $0\%$.
- **Elapsed Days ($t$)**: $\Delta t = \max\left(0, \frac{\text{now} - \text{lastDemonstratedAt}}{86400000} - 7\right)$
- **Decay Constant ($\lambda$)**: $\lambda = 0.025$ (~$2.5\%$ retention decay per week elapsed beyond grace period).
- **Decay Formula**:
  $$S_{\text{decayed}} = \text{round}\left( S_{\text{mastery}} \times \max\left(0.35, e^{-\lambda \times \Delta t}\right) \right)$$
- **Decay Floor**: $35\%$ of $S_{\text{mastery}}$. Demonstrated knowledge is never completely erased to $0$.
- **Never Attempted**: If `lastDemonstratedAt === null`, $S_{\text{decayed}} = S_{\text{mastery}} = 0$.

---

## 6. Prerequisite Influence Model

When evaluating concept readiness and study priorities:
1. If concept $C$ has prerequisites $[P_1, P_2, \dots, P_n]$:
   - If any prerequisite $P_i$ has `masteryStatus === 'NEEDS_REVIEW'` or `decayedScore < 50`:
     - Concept $C$ cannot attain `MASTERED` status (capped at `UNDERSTOOD`).
     - Concept $C$ receives `prerequisiteWarning: true` and lists the unfulfilled prerequisite IDs.
2. In Study Priority Calculation:
   - An unfulfilled prerequisite $P_i$ is prioritized for study **before** concept $C$.

---

## 7. Storage, Projection & Rebuild Architecture (ADR-018)

### Decision: Event-Projected Materialized View with Deterministic Rebuild

```
  ┌────────────────────────────────────────┐
  │  StudySession.turns / LearningEvent    │ (Immutable Evidence Ledger)
  └───────────────────┬────────────────────┘
                      │
           ┌──────────┴──────────┐
           ▼                     ▼
┌──────────────────────┐ ┌───────────────────────────────┐
│ Real-Time Projection │ │ Deterministic Rebuild Engine  │
│ (Atomic per turn)    │ │ (Full replay from zero)       │
└──────────┬───────────┘ └───────────────┬───────────────┘
           │                             │
           └──────────────┬──────────────┘
                          ▼
             ┌────────────────────────┐
             │  ConceptLearningState  │ (Materialized View)
             └────────────────────────┘
```

### Rebuild Invariant
For any student evidence history $E$:
$$\text{Rebuild}(E) \equiv \text{Project}_{\text{realtime}}(E)$$
Running `rebuildTopicLearningState(userId, topicId)` drops materialized state, reads all `StudySession.turns` for that topic ordered by `answeredAt` / `createdAt`, passes them through the pure state transition engine, and yields the exact same state without drift.

---

## 8. Idempotency & Concurrency Strategy

1. **Turn-Level Idempotency (`processedTurnIds`)**:
   - Each `ConceptLearningState` stores `processedTurnIds: [ObjectId]`.
   - Before applying a turn, the service checks if `turn._id` is already in `processedTurnIds`.
   - If already present, the projection returns the existing state immediately (**no duplicate score increments**).
2. **Optimistic Version Locking (`stateVersion`)**:
   - State mutations check `{ userId, conceptId, stateVersion }` and atomically `$inc: { stateVersion: 1 }`.
   - Concurrent projection collisions retry with updated state snapshot.

---

## 9. REST API Contract Design

All endpoints require authentication and enforce strict tenant isolation (`userId = req.user._id`).

### Endpoints

| Method | Route | Description | Response Status |
| :--- | :--- | :--- | :---: |
| `GET` | `/api/v1/learning-state/concepts/:conceptId` | Get detailed learning state for single concept | 200, 404, 401 |
| `GET` | `/api/v1/learning-state/topics/:topicId` | Get all concept states and summary for topic | 200, 404, 401 |
| `GET` | `/api/v1/learning-state/subjects/:subjectId` | Get subject-level aggregate mastery & progress | 200, 404, 401 |
| `GET` | `/api/v1/learning-state/priorities` | Get prioritized weak & struggling concepts across subjects | 200, 401 |
| `POST` | `/api/v1/learning-state/topics/:topicId/rebuild` | Deterministically reconstruct learning state from evidence | 200, 404, 401 |

---

## 10. Frontend UI Integration Plan

### UI Placement & Tone
- **Tone**: Calm, serious, high-utility knowledge workspace (no glowing neon, no fake gamification streaks, no arbitrary AI percentages).
- **Topic Detail View**: Displays a clean Concept Mastery breakdown (`Mastered`, `Understood`, `Learning`, `Needs Review`) with true evidence counts.
- **Study Page Header**: Shows real topic progress and active misconception warnings.
- **Concept Cards**: Shows last demonstrated date, attempt counts, active misconceptions, and direct "Practice Concept" button.

---

## 11. Verification Plan & Test Matrix

### Automated Test Suite (`server/tests/learningState.test.js`)
1. Initial concept state calculation (`NOT_STARTED` $\rightarrow$ `0` score).
2. First `CORRECT` evaluation transition (`LEARNING` / `UNDERSTOOD`).
3. `PARTIALLY_CORRECT` evaluation progression.
4. `INCORRECT` evaluation penalty and `consecutiveFailures` increment.
5. Misconception detection and immediate `NEEDS_REVIEW` transition.
6. Socratic `FOLLOW_UP` resolution of active misconceptions.
7. Multi-attempt progression to `MASTERED` (`consecutiveSuccesses >= 2`, `attempts >= 3`).
8. Prerequisite gating preventing premature `MASTERED` status.
9. Time decay calculations (grace period, exponential half-life, decay floor).
10. Idempotency: duplicate turn processing produces zero mutation.
11. Deterministic Rebuild: Replaying identical evidence produces identical state.
12. Multi-tenant security isolation (cross-tenant access rejected with HTTP 404).

### Live Atlas Verification (`server/scripts/verify_phase09_live.js`)
1. Database connectivity & compound unique indices on Atlas.
2. Seeding isolated tenant, subject, topic, canonical concepts.
3. Live study turn execution $\rightarrow$ real-time `ConceptLearningState` projection.
4. Active misconception detection and follow-up resolution on Atlas.
5. Live concurrency race on state projection.
6. Full deterministic rebuild execution asserting exact match.
7. REST API contract verification.
8. Cross-tenant isolation verification.
9. Immutability-safe cleanup.

---

## 12. Architectural Decision Records (ADRs) to Create

1. **ADR-018: Learning State Storage Strategy, Event Projection & Deterministic Rebuild**
2. **ADR-019: Deterministic Concept Mastery State Machine & Retention Decay Model**
