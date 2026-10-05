# ADR-018: Learning State Storage Strategy, Event Projection & Deterministic Rebuild

## Status
Accepted

## Context
In LearnForge, student study sessions (Phase 08) and conversation extractions (Phase 06) continuously generate immutable evidence records (`StudySession.turns` and `LearningEvent`). We need a structured, query-efficient representation of concept-level and topic-level mastery for dashboards, study prioritization, and pedagogical adaptation.

We evaluated three storage strategies:
1. **Option A (Pure Dynamic Aggregation on Read)**: Compute mastery on-the-fly from turns during every API request.  
   *Trade-off*: Avoids stale data, but incurs severe latency ($O(N)$ document aggregation across turn arrays), prevents efficient indexing/sorting by mastery score, and increases database load.
2. **Option B (Pure Mutable State without Replay)**: Store state in a mutable document updated incrementally, with no replay mechanism.  
   *Trade-off*: Fast reads, but vulnerable to permanent state corruption if a worker fails mid-update, with no deterministic recovery path.
3. **Option C (Event-Projected Materialized View with Deterministic Rebuild)**: Maintain a dedicated `ConceptLearningState` collection updated atomically on each completed turn, coupled with a pure, idempotent projection engine and a deterministic rebuild mechanism that can reconstruct the entire state from immutable evidence.

## Decision
We choose **Option C: Event-Projected Materialized View with Deterministic Rebuild**.

1. **Authoritative Evidence Stream Semantics & Immutability**:
   - **`StudySession.turns` is the EXCLUSIVE AUTHORITATIVE EVIDENCE STREAM for `ConceptLearningState`**.
   - Active recall study evaluations provide structured, multi-criteria pedagogical grades (`verdict`, `correctness`, `completeness`, `reasoningQuality`, `misconceptionDetected`, `misconceptionSummary`, `strengths`, `weaknesses`, `nextAction`, and Socratic follow-up loops).
   - **Immutability of Completed Turns**: In `StudySession`, turns are only updated during their active, fenced evaluation lifecycle (`submitAnswer` / `submitFollowUpAnswer`) protected by `evaluationState.operationId` and `sessionVersion` optimistic concurrency. Once evaluated (`evaluation.evaluatedAt !== null`), turns are sealed and immutable. No service allows editing or deleting historical turns.
   - **`LearningEvent` records** (from Phase 06 chat extractions) represent an immutable audit ledger of conversational interactions and are **NOT** consumed by `ConceptLearningState`. This eliminates double-counting, semantic precedence conflicts, and multi-stream divergence.
   - Canonical Knowledge (`Concept`, `Topic`, `Subject`, `NoteDocument`, `NoteVersion`, `SyllabusVersion`) is **strictly read-only** and never mutated by Learning State.

2. **Deterministic Rebuild Guarantee with Injected Evaluation Clock**:
   - State is categorized into two distinct types:
     - **Category A (Deterministic Evidence-Derived State)**: `masteryStatus`, `masteryScore`, `confidenceScore`, `attemptsCount`, `consecutiveSuccesses`, `consecutiveFailures`, `activeMisconceptions`, `resolvedMisconceptions`, `lastAttemptedAt`, `lastDemonstratedAt`, `lastProcessedTurnId`, `lastProcessedAnsweredAt`. (100% time-invariant given evidence set $E$).
     - **Category B (Time-Dependent Derived State)**: `decayedScore = calculateDecayedScore(masteryScore, lastDemonstratedAt, evaluationTimestamp)`.
   - Rebuild contract:
     $$\text{Rebuild}(E, t_{\text{eval}}) \equiv \text{Project}(E, t_{\text{eval}})$$
     For any fixed evaluation timestamp $t_{\text{eval}}$, all fields—including `decayedScore`—match with zero drift. Automated tests inject a fixed clock parameter ($t_{\text{eval}}$) rather than calling uncontrolled `Date.now()`.
   - Evidence set $E$ is sorted deterministically:
     $$\text{SortKey}(T) = \langle T.\text{answeredAt} \text{ (ascending)}, T.\_id.\text{toString()} \text{ (ascending)} \rangle$$

3. **Scalable Idempotency Architecture (`ProcessedStudyTurn`)**:
   - Rather than embedding an unbounded `processedTurnIds: [ObjectId]` array inside `ConceptLearningState` (which risks hitting MongoDB 16MB document limits over thousands of turns), projection tracking uses a dedicated projection ledger:
     ```javascript
     // ProcessedStudyTurn schema
     {
       userId: { type: ObjectId, ref: 'User', required: true, index: true },
       conceptId: { type: ObjectId, ref: 'Concept', required: true, index: true },
       turnId: { type: ObjectId, required: true },
       sessionId: { type: ObjectId, ref: 'StudySession', required: true },
       processedAt: { type: Date, default: Date.now }
     }
     // Unique Compound Index:
     { userId: 1, conceptId: 1, turnId: 1 } (unique: true)
     ```
   - In `ConceptLearningState`, only bounded metadata is stored: `lastProcessedTurnId`, `lastProcessedAnsweredAt`, and `stateVersion`.
   - Before applying a turn, the service checks the unique index in `ProcessedStudyTurn`. If the turn was already projected, it returns the existing state without mutating metrics or scores.

4. **Optimistic Concurrency Locking (`stateVersion`)**:
   - Atomic updates increment `stateVersion`. Concurrent projection collisions fail safely and retry with a fresh document snapshot.

5. **Topic & Subject Aggregates (Dynamic Aggregation on Read)**:
   - `ConceptLearningState` is the sole materialized model.
   - Topic and subject mastery summaries (counts by mastery state, average mastery scores, active misconceptions) are calculated dynamically on read from `ConceptLearningState`. This prevents multi-document synchronization drift and eliminates duplicate state.

## Consequences
- Fast $O(1)$ indexed reads for frontend views and priority calculations.
- Complete resilience against state corruption via deterministic recomputation from `StudySession.turns`.
- Bounded document size with no unbounded array growth.
- Zero mutation of canonical knowledge assets.
