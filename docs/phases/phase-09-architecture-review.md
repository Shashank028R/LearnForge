# Phase 09 — Learning State Engine Architecture Review

**Status**: APPROVED ARCHITECTURE SPECIFICATION  
**Author**: Implementation Engineer  
**Date**: October 5, 2026  
**Repository Remote**: `https://github.com/Shashank028R/LearnForge.git`  
**Base Commit (HEAD)**: `28d83201414bd92cb16a5e40d966b311bff27b72`  

---

## 1. Executive Summary & Core Principle

In LearnForge, our architectural separation of concerns is defined as:

> **“Canonical Knowledge is the product. Study Sessions record evaluative evidence. Learning State interprets that evidence into explainable, structured mastery without mutating canonical knowledge.”**

### Semantic Boundaries (Strictly Non-Destructive)

| Layer | Source / Model | Mutability | Role in Phase 09 |
| :--- | :--- | :---: | :--- |
| **A. Canonical Knowledge** | `Concept`, `Topic`, `Subject`, `NoteDocument`, `NoteVersion` | Strict / Versioned | **READ-ONLY**. Learning State references concept `_id`s but **NEVER** mutates canonical definitions, notes, or topics. |
| **B. Syllabus** | `SyllabusVersion` | Immutable | **READ-ONLY**. Referenced for approved curriculum structure. |
| **C. Evaluative Evidence Ledger** | `StudySession.turns` | Append-Only | **EXCLUSIVE AUTHORITATIVE SOURCE**. Historical record of student answers, multi-criteria evaluations, remediations, and follow-ups. |
| **D. Conversational Evidence Ledger** | `LearningEvent` | Append-Only | **SEPARATE SUPPLEMENTARY LEDGER**. Phase 06 chat extractions. Preserved for conversational history; does **NOT** project into or mutate `ConceptLearningState`. |
| **E. Materialized Learning State** | `ConceptLearningState` | Materialized Projection | **DERIVED INTERPRETATION**. Materialized, deterministic projection of student mastery, confidence, misconceptions, and retention. **Fully rebuildable from `StudySession.turns`**. |

---

## 2. The Authoritative Evidence Stream & Relationship between Streams

### A. Authoritative Evidence Source
- **`StudySession.turns` is the EXCLUSIVE AUTHORITATIVE EVIDENCE STREAM for `ConceptLearningState`**.
- Active recall evaluations contain rigorous, multi-criteria pedagogical grades (`verdict`, `correctness`, `completeness`, `reasoningQuality`, `misconceptionDetected`, `misconceptionSummary`, `strengths`, `weaknesses`, `nextAction`, and Socratic follow-up loops).
- **`LearningEvent` records** (from Phase 06 chat extractions) remain an immutable audit ledger of unstructured chat interactions, but are **NOT** consumed by the Learning State Engine. This completely avoids double-counting, semantic precedence conflicts, and multi-stream divergence.

### B. Evidence De-duplication & Idempotency
- Every evaluative event originates from a unique `StudyTurn._id` within a `StudySession`.
- Projection into `ConceptLearningState` uses a dedicated projection ledger (`ProcessedStudyTurn` collection with compound unique index `{ userId: 1, conceptId: 1, turnId: 1 }`).
- Replaying a turn that has already been projected matches the unique index, emits a warning, and returns the existing state without mutating metrics or scores.

---

## 3. Authoritative Prerequisite Model

### A. Canonical Prerequisite Definition
- Canonical prerequisites are defined on the canonical `Concept` model:
  ```javascript
  // Concept schema (Phase 06 / 09)
  prerequisites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Concept' }]
  ```
- **Ownership & Authorization**: Prerequisite relationships are tenant-scoped (`userId`, `topicId`, `subjectId`) and defined strictly by the curriculum/syllabus hierarchy.
- **AI Question Metadata Isolation**: AI-generated `question.prerequisiteConceptIds` in `StudyTurn` is transient pedagogical metadata for prompt generation only; it **NEVER** redefines or mutates canonical prerequisites.

### B. Prerequisite Gating Invariant
When calculating concept readiness and mastery:
1. Concept $C$ cannot achieve `MASTERED` status unless all of its canonical `prerequisites` $[P_1, P_2, \dots, P_n]$ have:
   - `masteryStatus` in `['UNDERSTOOD', 'MASTERED']`
   - `decayedScore >= 50`
   - `activeMisconceptions.length === 0`
2. If any prerequisite fails this condition:
   - Concept $C$ mastery status is capped at `UNDERSTOOD`.
   - Concept $C$ receives `prerequisiteWarning: true` and lists the unmet prerequisite IDs.
   - In study prioritization, unmet prerequisites are prioritized for study **before** concept $C$.

---

## 4. Single Authoritative Mastery State Machine

`ConceptLearningState.masteryStatus` is a separate semantic field from `Concept.status` and governs the student's personal mastery progress.

### Discrete States
- `NOT_STARTED`: Concept has 0 evaluated study turns.
- `INTRODUCED`: 1 evaluated turn recorded, or initial exploration.
- `LEARNING`: Actively practiced with partial understanding or initial scores ($< 85\%$).
- `NEEDS_REVIEW`: Active misconception detected or $\ge 2$ consecutive failures.
- `UNDERSTOOD`: Demonstrates solid conceptual understanding (`correctness >= 85%`, `completeness >= 80%`).
- `MASTERED`: High-stability understanding meeting all strict multi-attempt criteria and prerequisite gates.

### State Transition Matrix

| Previous State | Evidence / Condition | New State | Score Delta ($\Delta S$) | Conf. Delta ($\Delta C$) | Consecutive Streaks | Misconception Ledger |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `NOT_STARTED` | Turn evaluated: `CORRECT` ($\ge 85\%$) | `UNDERSTOOD` | $+70$ | $+40$ | `successes = 1`, `failures = 0` | No change |
| `NOT_STARTED` | Turn evaluated: `CORRECT` ($< 85\%$) | `LEARNING` | $+50$ | $+30$ | `successes = 1`, `failures = 0` | No change |
| `NOT_STARTED` | Turn evaluated: `PARTIALLY_CORRECT` | `LEARNING` | $+35$ | $+20$ | `successes = 0`, `failures = 0` | No change |
| `NOT_STARTED` | Turn evaluated: `INCORRECT` | `NEEDS_REVIEW` | $+10$ | $+10$ | `successes = 0`, `failures = 1` | Summary logged if present |
| `LEARNING` | `CORRECT` ($\ge 85\%$), `attempts >= 2` | `UNDERSTOOD` | Bounded $+25$ | Bounded $+20$ | `successes += 1`, `failures = 0` | No change |
| `LEARNING` | `PARTIALLY_CORRECT` | `LEARNING` | Bounded $+10$ | Bounded $+5$ | `successes = 0`, `failures = 0` | No change |
| `LEARNING` | `INCORRECT` (first failure) | `LEARNING` | Bounded $-15$ | Bounded $-10$ | `successes = 0`, `failures = 1` | Logged if detected |
| `LEARNING` | `INCORRECT` (`failures >= 2` OR `misconception`) | `NEEDS_REVIEW` | Bounded $-25$ | Bounded $-15$ | `successes = 0`, `failures += 1` | Added to `activeMisconceptions` |
| `UNDERSTOOD` | `CORRECT` + `MASTERED Criteria Met` | `MASTERED` | Bounded $+15$ | Bounded $+15$ | `successes += 1`, `failures = 0` | No change |
| `UNDERSTOOD` | `CORRECT` + `Prerequisites Unmet` | `UNDERSTOOD` | Bounded $+10$ | Bounded $+10$ | `successes += 1`, `failures = 0` | Gated with warning |
| `UNDERSTOOD` | `INCORRECT` OR `misconceptionDetected` | `NEEDS_REVIEW` | Bounded $-25$ | Bounded $-20$ | `successes = 0`, `failures = 1` | Added to `activeMisconceptions` |
| `MASTERED` | `CORRECT` | `MASTERED` | Bounded $+5$ | Bounded $+5$ | `successes += 1`, `failures = 0` | `lastDemonstratedAt = now` |
| `MASTERED` | `INCORRECT` OR `misconceptionDetected` | `NEEDS_REVIEW` | Bounded $-30$ | Bounded $-25$ | `successes = 0`, `failures = 1` | Added to `activeMisconceptions` |
| `NEEDS_REVIEW` | Socratic `FOLLOW_UP` = `CORRECT` | `LEARNING` (or `UNDERSTOOD` if $S \ge 75$) | Bounded $+30$ | Bounded $+20$ | `successes = 1`, `failures = 0` | Moved to `resolvedMisconceptions` |
| `NEEDS_REVIEW` | Socratic `FOLLOW_UP` = `INCORRECT` | `NEEDS_REVIEW` | Bounded $-15$ | Bounded $-10$ | `successes = 0`, `failures += 1` | Retained in `activeMisconceptions` |

### Score Adjustment Formulas (Bounded within $[0, 100]$)
$$\Delta_{\text{gain}} = \text{round}\left( \text{baseGain} \times \max\left(0.10, 1 - \frac{S_{\text{current}}}{120}\right) \right)$$
$$\Delta_{\text{penalty}} = \text{round}\left( \text{basePenalty} \times \max\left(0.40, \frac{S_{\text{current}}}{100}\right) \right)$$

---

## 5. Mathematical Retention & Recency Decay Specification

### A. Mathematical Definition (Daily Exponential Decay)
- **Time Unit**: **Days ($d$)**.
- **Grace Period ($T_{\text{grace}}$)**: $7$ days following `lastDemonstratedAt`. During days $0 \le d \le 7$, retention decay is exactly $0\%$.
- **Elapsed Days beyond Grace Period ($\Delta d$)**:
  $$\Delta d = \max\left(0, \frac{\text{now} - \text{lastDemonstratedAt}}{86,400,000} - 7\right)$$
- **Daily Decay Constant ($\lambda$)**:
  $$\lambda = 0.005 \text{ day}^{-1}$$
  - Equivalent weekly decay: $1 - e^{-0.005 \times 7} \approx 3.44\%$ per week beyond grace period.
  - Half-life beyond grace period: $T_{1/2} = \frac{\ln(2)}{0.005} \approx 138.6 \text{ days}$ (~$4.5$ months).
- **Decay Formula**:
  $$S_{\text{decayed}} = \text{round}\left( S_{\text{mastery}} \times \max\left(0.35, e^{-\lambda \times \Delta d}\right) \right)$$
- **Decay Floor**: $35\%$ of $S_{\text{mastery}}$ ($0.35 \times S_{\text{mastery}}$). Demonstrated knowledge is never completely forgotten or erased to 0.
- **Never Demonstrated**: If `lastDemonstratedAt === null`, $S_{\text{decayed}} = 0$.

### B. Boundary Examples (Base Mastery Score $S_{\text{mastery}} = 90$)

| Elapsed Days Since Last Demonstrated | Days Beyond Grace ($\Delta d$) | Decay Factor ($e^{-0.005 \times \Delta d}$) | Decayed Score ($S_{\text{decayed}}$) | Retention Status |
| :---: | :---: | :---: | :---: | :--- |
| **0 days** | $0$ | $1.0000$ | **90** | Fresh (Within Grace Period) |
| **5 days** | $0$ | $1.0000$ | **90** | Fresh (Within Grace Period) |
| **7 days** | $0$ | $1.0000$ | **90** | Grace Period Boundary |
| **8 days** | $1$ | $0.9950$ | **90** | Minimal Decay ($-0.5\%$) |
| **14 days** (2 weeks) | $7$ | $0.9656$ | **87** | Gentle Decay ($-3.4\%$) |
| **37 days** (~5 weeks) | $30$ | $0.8607$ | **77** | Moderate Decay ($-13.9\%$) |
| **97 days** (~3 months) | $90$ | $0.6376$ | **57** | Substantial Decay ($-36.2\%$) |
| **145 days** (~5 months) | $138$ | $0.5015$ | **45** | Half-Life Boundary ($-49.8\%$) |
| **365 days** (1 year) | $358$ | $0.1669 \implies 0.3500$ (Floor) | **32** | Hard Floor Reached ($35\%$) |
| **Never Demonstrated** | N/A | N/A | **0** | Unlearned |

### C. Computation Lifecycle
- `decayedScore` is **computed dynamically on read** in all API responses and view models based on current timestamp `Date.now()`.
- A snapshot `decayedScore` is also persisted to `ConceptLearningState` during turn evaluations for index sorting (`{ userId: 1, topicId: 1, decayedScore: 1 }`).

---

## 6. Deriving `MASTERED` Status from Evidence

The `MASTERED` state is proven exclusively through historical evaluative evidence:

```javascript
function isConceptMastered({
  consecutiveSuccesses,
  attemptsCount,
  masteryScore,
  confidenceScore,
  activeMisconceptions,
  prerequisiteStates,
}) {
  return (
    consecutiveSuccesses >= 2 &&
    attemptsCount >= 3 &&
    masteryScore >= 85 &&
    confidenceScore >= 75 &&
    activeMisconceptions.length === 0 &&
    prerequisiteStates.every((p) => ['UNDERSTOOD', 'MASTERED'].includes(p.masteryStatus) && p.decayedScore >= 50)
  );
}
```

Every metric is deterministic and recomputable from the ordered sequence of turns.

---

## 7. Deterministic Rebuild Guarantee: $\text{Rebuild}(E) \equiv \text{Project}(E)$

### Definition of Evidence Set $E$
$E$ is the set of all completed `StudyTurn` subdocuments within `StudySession.turns` belonging to `userId` and `topicId` (or `subjectId`), where `evaluation.verdict !== null`.

### Deterministic Total Ordering
To eliminate runtime sorting ambiguities when multiple turns have identical millisecond timestamps, turns are ordered by:
1. Primary key: `turn.answeredAt` ascending ($t_1 < t_2$).
2. Secondary tie-breaker: `turn._id.toString()` ascending lexicographical order.

$$\text{SortKey}(T) = \langle T.\text{answeredAt}, T.\_id.\text{toString()} \rangle$$

### Rebuild Workflow (`learningStateService.rebuildTopicLearningState(userId, topicId)`)
1. Delete existing `ConceptLearningState` and `ProcessedStudyTurn` records for `{ userId, topicId }`.
2. Fetch all `Concept` documents for `{ userId, topicId }` and initialize `ConceptLearningState` at `NOT_STARTED`.
3. Fetch all `StudySession` documents for `{ userId, topicId }`.
4. Extract all completed turns and sort deterministically by $\text{SortKey}$.
5. Sequentially project each turn through the state transition engine.
6. Commit the final states.
7. **Verification Guarantee**: The reconstructed states match real-time projection down to every field and score ($100\%$ zero-drift parity).

---

## 8. Scalable Idempotency Architecture

Instead of an unbounded `processedTurnIds: [ObjectId]` array embedded inside `ConceptLearningState`, Phase 09 introduces a dedicated, lean projection ledger collection:

### Model: `ProcessedStudyTurn` (`server/src/models/ProcessedStudyTurn.js`)
```javascript
const processedStudyTurnSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    conceptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true, index: true },
    turnId: { type: mongoose.Schema.Types.ObjectId, required: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudySession', required: true },
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// Compound Unique Index: Strictly one projection per turn per concept
processedStudyTurnSchema.index({ userId: 1, conceptId: 1, turnId: 1 }, { unique: true });
```

### In `ConceptLearningState`
`ConceptLearningState` maintains only:
- `lastProcessedTurnId`: `ObjectId`
- `lastProcessedAnsweredAt`: `Date`
- `stateVersion`: `Number` (optimistic concurrency lock)

This prevents MongoDB 16MB document growth issues across thousands of study turns while maintaining complete idempotency.

---

## 9. Topic & Subject Aggregates Architecture

### Decision: Dynamic Aggregation on Read (Option B)
- **Single Source of Materialized Truth**: `ConceptLearningState` is the only materialized state collection.
- **Topic Progress Summary**: Derived dynamically on read by querying all `ConceptLearningState` documents for `{ userId, topicId }`:
  - `totalConcepts`: Total concepts in topic.
  - `masteredCount`: Concepts with `masteryStatus === 'MASTERED'`.
  - `understoodCount`: Concepts with `masteryStatus === 'UNDERSTOOD'`.
  - `learningCount`: Concepts with `masteryStatus === 'LEARNING'`.
  - `needsReviewCount`: Concepts with `masteryStatus === 'NEEDS_REVIEW'`.
  - `averageMasteryScore`: Mean of `masteryScore`.
  - `averageDecayedScore`: Mean of `decayedScore`.
  - `activeMisconceptionsCount`: Total active misconceptions across concepts.
- **Subject Progress Summary**: Derived dynamically by aggregating topic summaries for `{ userId, subjectId }`.
- **Architectural Rationale**: Eliminates multi-document synchronization anomalies between concept and topic documents, eliminates duplicate state corruption, and simplifies rebuilds.

---

## 10. REST API Contract

All endpoints require session authentication and enforce tenant scoping (`userId = req.user._id`).

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :---: |
| `GET` | `/api/v1/learning-state/concepts/:conceptId` | Get detailed learning state for single concept | 200, 404, 401 |
| `GET` | `/api/v1/learning-state/topics/:topicId` | Get all concept states and computed summary for topic | 200, 404, 401 |
| `GET` | `/api/v1/learning-state/subjects/:subjectId` | Get subject-level aggregate mastery & topic cards | 200, 404, 401 |
| `GET` | `/api/v1/learning-state/priorities` | Get prioritized weak, decaying, and struggling concepts | 200, 401 |
| `POST` | `/api/v1/learning-state/topics/:topicId/rebuild` | Deterministically rebuild learning state from study turns | 200, 404, 401 |

---

## 11. Checklist of Checkpoint 1 Criteria

- [x] **1. Authoritative learning evidence defined**: `StudySession.turns` is the exclusive authoritative source for active recall mastery.
- [x] **2. StudySession.turns & LearningEvent relation**: `LearningEvent` is a separate chat audit ledger; `ConceptLearningState` projects exclusively from `StudySession.turns`.
- [x] **3. De-duplication & Idempotency**: Handled via `ProcessedStudyTurn` with unique `{ userId, conceptId, turnId }`.
- [x] **4. Prerequisite source defined**: Canonical `Concept.prerequisites`; AI question metadata isolated.
- [x] **5. Mastery states defined**: `NOT_STARTED`, `INTRODUCED`, `LEARNING`, `NEEDS_REVIEW`, `UNDERSTOOD`, `MASTERED`.
- [x] **6. Exact state transitions specified**: Complete state transition table with scores, streaks, and misconception rules.
- [x] **7. Decay unit specified**: Daily exponential decay ($\lambda = 0.005\text{ day}^{-1}$, 7-day grace period, 35% floor).
- [x] **8. Decay formula mathematically verified**: $S_{\text{decayed}} = \text{round}\left(S_{\text{mastery}} \times \max(0.35, e^{-0.005 \times \Delta d})\right)$.
- [x] **9. Decayed score generation defined**: Computed on read with evaluation-time snapshot indexing.
- [x] **10. Evidence set $E$ defined**: All evaluated turns ordered by $\langle \text{answeredAt}, \text{turnId} \rangle$.
- [x] **11. Deterministic ordering guaranteed**: Primary `answeredAt`, secondary `_id.toString()`.
- [x] **12. Scalable idempotency**: `ProcessedStudyTurn` ledger avoids unbounded array growth in concept documents.
- [x] **13. Topic/Subject aggregates**: Dynamic aggregation on read from `ConceptLearningState`.
- [x] **14. Rebuild mechanism**: `rebuildTopicLearningState` fully reconstructs state with zero drift.
