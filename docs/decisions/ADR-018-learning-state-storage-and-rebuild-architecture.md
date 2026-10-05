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

1. **Source of Truth vs. Materialized Interpretation**:
   - `StudySession.turns` and `LearningEvent` are the authoritative, append-only source of truth.
   - `ConceptLearningState` is a materialized projection for fast indexed queries (`{ userId: 1, topicId: 1, masteryStatus: 1 }`).
   - Canonical Knowledge (`Concept`, `Topic`, `NoteDocument`, `NoteVersion`, `SyllabusVersion`) is **strictly read-only** and never mutated by Learning State.

2. **Deterministic Rebuild Guarantee**:
   - A pure domain engine `calculateConceptLearningState(evidenceHistory)` processes turns chronologically.
   - Calling `rebuildTopicLearningState(userId, topicId)` drops materialized state, reads authoritative turns, replays them through the pure engine, and re-inserts the exact state.
   - **Invariant**: $\text{Rebuild}(E) \equiv \text{Project}_{\text{realtime}}(E)$ (Zero drift).

3. **Turn-Level Idempotency (`processedTurnIds`)**:
   - Each `ConceptLearningState` stores `processedTurnIds: [ObjectId]`.
   - Before applying a turn, the service checks if `turn._id` is already in `processedTurnIds`. If so, it returns the existing state without double-counting metrics or scores.

4. **Optimistic Version Locking (`stateVersion`)**:
   - Updates increment `stateVersion`. Concurrent projection collisions fail safely and retry with a fresh document snapshot.

## Consequences
- Fast $O(1)$ indexed reads for frontend views and priority calculations.
- Complete resilience against state corruption via deterministic recomputation.
- Zero mutation of canonical knowledge assets.
