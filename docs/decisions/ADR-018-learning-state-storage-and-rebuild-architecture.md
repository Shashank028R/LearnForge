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

1. **Authoritative Evidence Stream Semantics**:
   - **`StudySession.turns` is the EXCLUSIVE AUTHORITATIVE EVIDENCE STREAM for `ConceptLearningState`**.
   - Active recall study evaluations provide structured, multi-criteria pedagogical grades (`verdict`, `correctness`, `completeness`, `reasoningQuality`, `misconceptionDetected`, `misconceptionSummary`, `strengths`, `weaknesses`, `nextAction`, and Socratic follow-up loops).
   - **`LearningEvent` records** (from Phase 06 chat extractions) represent an immutable audit ledger of conversational interactions and are **NOT** consumed by `ConceptLearningState`. This eliminates double-counting, semantic precedence conflicts, and multi-stream divergence.
   - Canonical Knowledge (`Concept`, `Topic`, `Subject`, `NoteDocument`, `NoteVersion`, `SyllabusVersion`) is **strictly read-only** and never mutated by Learning State.

2. **Deterministic Total Ordering & Rebuild Guarantee**:
   - Evidence set $E$ is the set of all completed `StudyTurn` subdocuments within `StudySession.turns` belonging to `userId` and `topicId`.
   - Deterministic sort key eliminates tie ambiguity:
     $$\text{SortKey}(T) = \langle T.\text{answeredAt} \text{ (ascending)}, T.\_id.\text{toString()} \text{ (ascending)} \rangle$$
   - A pure domain engine `calculateConceptLearningState(evidenceHistory)` processes turns chronologically.
   - Calling `rebuildTopicLearningState(userId, topicId)` drops materialized state for that topic, reads authoritative turns, replays them through the pure engine, and re-inserts the exact state.
   - **Rebuild Invariant**: $\text{Rebuild}(E) \equiv \text{Project}_{\text{realtime}}(E)$ ($100\%$ zero-drift parity).

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

4. **Optimistic Version Locking (`stateVersion`)**:
   - Atomic updates increment `stateVersion`. Concurrent projection collisions fail safely and retry with a fresh document snapshot.

5. **Topic & Subject Aggregates (Dynamic Aggregation on Read)**:
   - `ConceptLearningState` is the sole materialized model.
   - Topic and subject mastery summaries (counts by mastery state, average mastery scores, active misconceptions) are calculated dynamically on read from `ConceptLearningState`. This prevents multi-document synchronization drift and eliminates duplicate state.

## Consequences
- Fast $O(1)$ indexed reads for frontend views and priority calculations.
- Complete resilience against state corruption via deterministic recomputation from `StudySession.turns`.
- Bounded document size with no unbounded array growth.
- Zero mutation of canonical knowledge assets.
