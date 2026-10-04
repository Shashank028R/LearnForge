# ADR-017: Strict Study Mode & Active Recall Pedagogical Architecture

## Status
Accepted

## Context
Standard AI learning platforms act as passive question answering systems. In LearnForge, Study Mode reverses this relationship: the AI acts as a rigorous pedagogical tutor. The AI generates challenging active recall questions, conducts multi-criteria reasoning evaluation, initiates Socratic remediation for incomplete/flawed understanding, and only advances upon demonstrated conceptual competence.

## Decision

1. **Domain Entity & Embedded Subdocument**:
   - `StudySession` is the aggregate root anchored to `User`, `Subject`, and `Topic`.
   - `StudyTurn` is an embedded subdocument within `StudySession.turns` (not a standalone registered Mongoose model).
   - `parentTurnId` is an ObjectId referencing another `StudySession.turns._id` within the **same** session, preserving the complete hierarchical relationship between initial and follow-up turns without overwriting historical attempts.

2. **Lease Fencing & Stale Worker Protection**:
   - `evaluationState.operationId` acts as the authoritative operation fencing token.
   - Initial answer submissions atomically claim an `operationId` with a 30-second lease.
   - If an evaluation lease expires, a recovery worker atomically claims `operationId_B`.
   - All evaluation completion mutations condition on `'evaluationState.operationId': currentOperationId`. A late-returning worker matches 0 documents and fails harmlessly, preventing stale worker state corruption.

3. **Single-Slot Evaluation Tracker & Historical Idempotency**:
   - `evaluationState` tracks only the active in-flight operation.
   - Completed historical idempotency is resolved by querying `StudySession.turns`.
   - Replaying a turn with matching payload returns the stored turn (HTTP 200). Conflicting payload reuse is rejected with HTTP 409 `IDEMPOTENCY_KEY_REUSE_CONFLICT`.

4. **Curriculum Pinning**:
   - An active `StudySession` permanently pins the approved `SyllabusVersion` at creation time (`syllabusVersionId` and `syllabusVersionNumber`).
   - Subsequent syllabus revisions do not alter existing study sessions.

5. **State Machine Invariants & Exit Concurrency**:
   - Pause is strictly prohibited during active evaluation (returns HTTP 409 `CANNOT_PAUSE_DURING_EVALUATION`).
   - Unrecoverable evaluation failures safely restore session state to `QUESTIONING` (initial) or `RECHECKING` (follow-up), ensuring the student is never permanently stranded in `EVALUATING`.
   - `exitSession` requires and verifies expected `sessionVersion`, failing closed with HTTP 409 `STALE_STUDY_STATE` on version conflict.

6. **Active Session Database Constraint (`isActive`)**:
   - `StudySession` maintains an `isActive: Boolean` field (`true` for all non-terminal states; `false` on `COMPLETED` or `EXITED`).
   - Database-level unique active session constraint is enforced via:
     ```javascript
     studySessionSchema.index(
       { userId: 1, topicId: 1 },
       {
         unique: true,
         partialFilterExpression: { isActive: true },
         name: 'unique_active_study_session_per_user_topic',
       }
     );
     ```

## Consequences
- Strict separation between session-local pedagogical records and long-term mastery engine (Phase 09).
- Immutable preservation of all student reasoning steps.
- High resilience to distributed network lag, crashes, and concurrent browser tab races.
