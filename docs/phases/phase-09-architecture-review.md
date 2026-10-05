# Phase 09 — Learning State Engine Architecture Review

**Status**: APPROVED ARCHITECTURE SPECIFICATION  
**Author**: Implementation Engineer  
**Date**: October 5, 2026  
**Repository Remote**: `https://github.com/Shashank028R/LearnForge.git`  
**Base Commit (HEAD)**: `0ce4aa70e3cbc1601345cec069d0188f5b387f8a`  

---

## 1. Executive Summary & Core Principle

In LearnForge, our architectural separation of concerns is defined as:

> **“Canonical Knowledge is the product. Study Sessions record evaluative evidence. Learning State interprets that evidence into explainable, structured mastery without mutating canonical knowledge.”**

### Semantic Boundaries (Strictly Non-Destructive)

| Layer | Source / Model | Mutability | Role in Phase 09 |
| :--- | :--- | :---: | :--- |
| **A. Canonical Knowledge** | `Concept`, `Topic`, `Subject`, `NoteDocument`, `NoteVersion` | Strict / Versioned | **READ-ONLY**. Learning State references concept `_id`s but **NEVER** mutates canonical definitions, notes, or topics. |
| **B. Syllabus** | `SyllabusVersion` | Immutable | **READ-ONLY**. Referenced for approved curriculum structure. |
| **C. Evaluative Evidence Ledger** | `StudySession.turns` | Sealed Append-Only | **EXCLUSIVE AUTHORITATIVE SOURCE**. Historical record of student answers, multi-criteria evaluations, remediations, and follow-ups. Once evaluated, completed turns are immutable. |
| **D. Conversational Evidence Ledger** | `LearningEvent` | Append-Only | **SEPARATE SUPPLEMENTARY LEDGER**. Phase 06 chat extractions. Preserved for conversational history; does **NOT** project into or mutate `ConceptLearningState`. |
| **E. Materialized Learning State** | `ConceptLearningState` | Materialized Projection | **DERIVED INTERPRETATION**. Materialized, deterministic projection of student mastery, confidence, misconceptions, and retention. **Fully rebuildable from `StudySession.turns`**. |

---

## 2. The Authoritative Evidence Stream & Immutability Model

### A. Authoritative Evidence Source Semantics
- **`StudySession.turns` is the EXCLUSIVE AUTHORITATIVE EVIDENCE STREAM for `ConceptLearningState`**.
- Active recall evaluations contain rigorous, multi-criteria pedagogical grades (`verdict`, `correctness`, `completeness`, `reasoningQuality`, `misconceptionDetected`, `misconceptionSummary`, `strengths`, `weaknesses`, `nextAction`, and Socratic follow-up loops).
- **`LearningEvent` records** (from Phase 06 chat extractions) remain an immutable audit ledger of unstructured chat interactions, but are **NOT** consumed by the Learning State Engine. This completely avoids double-counting, semantic precedence conflicts, and multi-stream divergence.

### B. Authoritative Turn Immutability Guarantees
- In `StudySession`, turns are only updated during the active, fenced evaluation lifecycle of that turn (`submitAnswer` / `submitFollowUpAnswer`) protected by `evaluationState.operationId` and `sessionVersion` optimistic concurrency.
- Once a turn has `evaluation.evaluatedAt !== null` and `evaluation.verdict !== null`, its fields (`userAnswer`, `answeredAt`, `evaluation`, `remediation`) are sealed and **immutable**.
- No service, controller, or route exposes mutation or deletion of historical completed turns.
- The rebuild engine reads `StudySession.turns` strictly with read-only cursor queries (`lean()`).

### C. Evidence De-duplication & Idempotency
- Every evaluative event originates from a unique `StudyTurn._id` within a `StudySession`.
- Projection into `ConceptLearningState` uses a dedicated projection ledger (`ProcessedStudyTurn` collection with compound unique index `{ userId: 1, conceptId: 1, turnId: 1 }`).
- Replaying a turn that has already been projected matches the unique index, emits a warning, and returns the existing state without mutating metrics or scores.

---

## 3. Authoritative Prerequisite Model

### A. Canonical Prerequisite Definition (Checkpoint 2 Implementation Plan)
- Note: At current repository HEAD, `server/src/models/Concept.js` does not yet have a `prerequisites` field.
- **Decision (Option A)**: `Concept.prerequisites` will be introduced into `Concept.js` during **Checkpoint 2 implementation** as the sole canonical prerequisite relation:
  ```javascript
  // Concept schema addition in Checkpoint 2:
  prerequisites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Concept',
    default: []
  }]
  ```
- **Ownership & Tenant Isolation**: Every referenced `prerequisiteConceptId` must belong to the exact same `userId`.
- **Scope**: Prerequisites may reference concepts within the same topic or across topics within the same subject.
- **Validation Rules**:
  1. *No Self-Reference*: $P_i \neq C$.
  2. *Acyclicity*: Concept update validation checks that $C \notin \text{Ancestors}(P_i)$.
  3. *Missing/Deleted Prerequisites*: If a prerequisite concept is deleted or unresolvable, it is treated as unfulfilled (unmet).
- **Mutation Authorization**: Only modified via authenticated curriculum/concept management endpoints by the concept's owner.
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
- `LEARNING`: Actively practiced with partial understanding or initial scores ($< 85\%$).
- `NEEDS_REVIEW`: Active misconception detected or $\ge 2$ consecutive failures.
- `UNDERSTOOD`: Demonstrates solid conceptual understanding (`correctness >= 85%`, `completeness >= 80%`).
- `MASTERED`: High-stability understanding meeting all strict multi-attempt criteria and prerequisite gates.

### State Transition Matrix

| Previous State | Evidence / Condition | New State | Score Delta ($\Delta S$) | Conf. Delta ($\Delta C$) | Consecutive Streaks | Misconception Ledger | Prerequisite Check |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `NOT_STARTED` | Turn evaluated: `CORRECT` ($\ge 85\%$) | `UNDERSTOOD` | $+70$ | $+40$ | `successes = 1`, `failures = 0` | No change | Not required for `UNDERSTOOD` |
| `NOT_STARTED` | Turn evaluated: `CORRECT` ($< 85\%$) | `LEARNING` | $+50$ | $+30$ | `successes = 1`, `failures = 0` | No change | Not required |
| `NOT_STARTED` | Turn evaluated: `PARTIALLY_CORRECT` | `LEARNING` | $+35$ | $+20$ | `successes = 0`, `failures = 0` | No change | Not required |
| `NOT_STARTED` | Turn evaluated: `INCORRECT` / `UNCERTAIN` | `NEEDS_REVIEW` | $+10$ | $+10$ | `successes = 0`, `failures = 1` | Summary logged if present | Not required |
| `LEARNING` | `CORRECT` ($\ge 85\%$), `attempts >= 2` | `UNDERSTOOD` | Bounded $+25$ | Bounded $+20$ | `successes += 1`, `failures = 0` | No change | Not required |
| `LEARNING` | `PARTIALLY_CORRECT` | `LEARNING` | Bounded $+10$ | Bounded $+5$ | `successes = 0`, `failures = 0` | No change | Not required |
| `LEARNING` | `INCORRECT` (first failure) | `LEARNING` | Bounded $-15$ | Bounded $-10$ | `successes = 0`, `failures = 1` | Logged if detected | Not required |
| `LEARNING` | `INCORRECT` (`failures >= 2` OR `misconception`) | `NEEDS_REVIEW` | Bounded $-25$ | Bounded $-15$ | `successes = 0`, `failures += 1` | Added to `activeMisconceptions` | Not required |
| `UNDERSTOOD` | `CORRECT` + `MASTERED Criteria Met` + `Prerequisites Satisfied` | `MASTERED` | Bounded $+15$ | Bounded $+15$ | `successes += 1`, `failures = 0` | Must have 0 active | All prerequisites $\ge 50$ decayed |
| `UNDERSTOOD` | `CORRECT` + `Prerequisites Unmet` | `UNDERSTOOD` | Bounded $+10$ | Bounded $+10$ | `successes += 1`, `failures = 0` | No change | Gated; `prerequisiteWarning: true` |
| `UNDERSTOOD` | `INCORRECT` OR `misconceptionDetected` | `NEEDS_REVIEW` | Bounded $-25$ | Bounded $-20$ | `successes = 0`, `failures = 1` | Added to `activeMisconceptions` | Not required |
| `MASTERED` | `CORRECT` | `MASTERED` | Bounded $+5$ | Bounded $+5$ | `successes += 1`, `failures = 0` | No change | `lastDemonstratedAt = now` |
| `MASTERED` | `INCORRECT` OR `misconceptionDetected` | `NEEDS_REVIEW` | Bounded $-30$ | Bounded $-25$ | `successes = 0`, `failures = 1` | Added to `activeMisconceptions` | Re-evaluation demotion |
| `NEEDS_REVIEW` | Socratic `FOLLOW_UP` = `CORRECT` | `LEARNING` (or `UNDERSTOOD` if $S \ge 75$) | Bounded $+30$ | Bounded $+20$ | `successes = 1`, `failures = 0` | Moved to `resolvedMisconceptions` | Misconception cleared |
| `NEEDS_REVIEW` | Socratic `FOLLOW_UP` = `INCORRECT` | `NEEDS_REVIEW` | Bounded $-15$ | Bounded $-10$ | `successes = 0`, `failures += 1` | Retained in `activeMisconceptions` | Remediation needed |

### Score Adjustment Formulas (Bounded within $[0, 100]$)
$$\Delta_{\text{gain}} = \text{round}\left( \text{baseGain} \times \max\left(0.10, 1 - \frac{S_{\text{current}}}{120}\right) \right)$$
$$\Delta_{\text{penalty}} = \text{round}\left( \text{basePenalty} \times \max\left(0.40, \frac{S_{\text{current}}}{100}\right) \right)$$

---

## 5. Mathematical Retention & Recency Decay Specification

### A. Mathematical Definition (Daily Exponential Decay)
- **Time Unit**: **Days ($d$)**.
- **Grace Period ($T_{\text{grace}}$)**: $7$ days following `lastDemonstratedAt`. During days $0 \le d \le 7$, retention decay is exactly $0\%$.
- **Elapsed Days beyond Grace Period ($\Delta d$)**:
  $$\Delta d(t) = \max\left(0, \frac{t - \text{lastDemonstratedAt}}{86,400,000} - 7\right)$$
- **Daily Decay Constant ($\lambda$)**:
  $$\lambda = 0.005 \text{ day}^{-1}$$
  - Equivalent weekly decay: $1 - e^{-0.005 \times 7} \approx 3.44\%$ per week beyond grace period.
  - Half-life beyond grace period: $T_{1/2} = \frac{\ln(2)}{0.005} \approx 138.6 \text{ days}$ (~$4.5$ months).
- **Decay Formula**:
  $$S_{\text{decayed}}(t) = \text{round}\left( S_{\text{mastery}} \times \max\left(0.35, e^{-\lambda \times \Delta d(t)}\right) \right)$$
- **Decay Floor**: $35\%$ of $S_{\text{mastery}}$ ($0.35 \times S_{\text{mastery}}$).
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

## 7. Deterministic Rebuild Guarantee: $\text{Rebuild}(E, t_{\text{eval}}) \equiv \text{Project}(E, t_{\text{eval}})$

### Distinguishing Time-Invariant vs. Time-Dependent State

| Category | Fields | Invariance Property |
| :--- | :--- | :--- |
| **A. Deterministic Evidence-Derived State** | `masteryStatus`, `masteryScore`, `confidenceScore`, `attemptsCount`, `consecutiveSuccesses`, `consecutiveFailures`, `activeMisconceptions`, `resolvedMisconceptions`, `lastAttemptedAt`, `lastDemonstratedAt`, `lastProcessedTurnId`, `lastProcessedAnsweredAt` | **Time-Invariant**. 100% identical regardless of when or where recomputed from evidence set $E$. |
| **B. Time-Dependent Derived State** | `decayedScore` | **Time-Dependent**. Computed deterministically given $(S_{\text{mastery}}, \text{lastDemonstratedAt}, t_{\text{eval}})$. |

### Deterministic Rebuild Contract
$$\text{Rebuild}(E, t_{\text{eval}}) \equiv \text{Project}(E, t_{\text{eval}})$$
For any fixed evaluation timestamp $t_{\text{eval}}$, every field—including `decayedScore`—matches with zero drift. Automated tests and verification scripts pass an explicit injected clock parameter $t_{\text{eval}}$ rather than calling uncontrolled `Date.now()`.

### Definition of Evidence Set $E$
$E$ is the set of all completed `StudyTurn` subdocuments within `StudySession.turns` belonging to `userId` and `topicId`, where `evaluation.verdict !== null`.

### Deterministic Total Ordering
$$\text{SortKey}(T) = \langle T.\text{answeredAt} \text{ (ascending)}, T.\_id.\text{toString()} \text{ (ascending)} \rangle$$

---

## 8. Scalable Idempotency Architecture

Instead of an unbounded `processedTurnIds: [ObjectId]` array embedded inside `ConceptLearningState`, Phase 09 introduces a dedicated projection ledger collection:

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

---

## 9. Topic & Subject Aggregates Architecture

### Decision: Dynamic Aggregation on Read (Option B)
- **Single Source of Materialized Truth**: `ConceptLearningState` is the only materialized state collection.
- **Topic & Subject Summaries**: Derived dynamically on read by querying `ConceptLearningState` documents for `{ userId, topicId }` or `{ userId, subjectId }`.
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
- [x] **4. Prerequisite source defined**: Canonical `Concept.prerequisites` to be introduced in Checkpoint 2 with tenant isolation, acyclicity, and self-reference checks; AI question metadata isolated.
- [x] **5. Mastery states defined**: `NOT_STARTED`, `INTRODUCED`, `LEARNING`, `NEEDS_REVIEW`, `UNDERSTOOD`, `MASTERED`.
- [x] **6. Exact state transitions specified**: Complete state transition table with scores, streaks, and misconception rules.
- [x] **7. Decay unit specified**: Daily exponential decay ($\lambda = 0.005\text{ day}^{-1}$, 7-day grace period, 35% floor).
- [x] **8. Decay formula mathematically verified**: $S_{\text{decayed}}(t) = \text{round}\left(S_{\text{mastery}} \times \max(0.35, e^{-0.005 \times \Delta d(t)})\right)$.
- [x] **9. Decayed score generation defined**: Computed on read with evaluation-time snapshot indexing.
- [x] **10. Evidence set $E$ defined**: All completed turns ordered by $\langle \text{answeredAt}, \text{turnId} \rangle$.
- [x] **11. Deterministic ordering guaranteed**: Primary `answeredAt`, secondary `_id.toString()`.
- [x] **12. Scalable idempotency**: `ProcessedStudyTurn` ledger avoids unbounded array growth in concept documents.
- [x] **13. Topic/Subject aggregates**: Dynamic aggregation on read from `ConceptLearningState`.
- [x] **14. Rebuild mechanism & clock contract**: $\text{Rebuild}(E, t_{\text{eval}}) \equiv \text{Project}(E, t_{\text{eval}})$ with injected clock for tests.
