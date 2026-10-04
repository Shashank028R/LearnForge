# Phase 08 Architecture Plan — Strict Study Mode & Active Recall

## 1. Executive Summary & Core Objective

**Phase 08** implements **Strict Study Mode & Active Recall** for LearnForge, converting the platform from an open-ended conversational tool into a **rigorous, interactive pedagogical tutor**.

### The Pedagogical Invariant
$$\text{Normal Chat (Phase 04/05): Student asks} \longrightarrow \text{AI explains}$$
$$\text{Study Mode (Phase 08): AI teaches} \longrightarrow \text{Active Recall Question} \longrightarrow \text{Evaluates Reasoning} \longrightarrow \text{Socratic Remediation} \longrightarrow \text{Advances on Demonstrated Understanding}$$

The AI operates as a strict instructor prioritizing **demonstrated conceptual mastery** over conversational smoothness:
- **No superficial validation**: Never responds with empty praise like "Correct! Great job."
- **Multi-criteria evaluation**: Correctness, completeness, reasoning depth, step-by-step logic, and misconception detection.
- **Socratic remediation**: When an answer is incomplete or flawed, the system provides targeted hints and sub-questions rather than immediately giving away the full answer.
- **Controlled progression**: Advancement to subsequent concepts occurs only when understanding has been clearly demonstrated.

---

## 2. Absolute Scope & Phase Boundaries

### In Scope (Phase 08)
- **Topic-Scoped Study Sessions**: `StudySession` domain entity tracking session lifecycle, question progression, and turn history.
- **Pedagogical Loop**: Active recall question generation, multi-criteria answer evaluation, Socratic remediation, and rechecking.
- **Syllabus & Knowledge Integration**: Grounding study sessions in approved `SyllabusVersion` and canonical `Concept` entities (including active misconceptions).
- **Curriculum Pinning**: Sessions permanently pin their approved `SyllabusVersion` at creation time.
- **AI Gateway Integration**: Provider-agnostic task routing for `STUDY_QUESTION_GENERATION`, `STUDY_ANSWER_EVALUATION`, and `STUDY_REMEDIATION` with strict schema validation and deterministic rule-based fallbacks.
- **Fenced Concurrency & Idempotency**: Multi-document transaction boundaries, optimistic sequence/version locking, authoritative `operationId` lease fencing, single-slot evaluation state tracking, and intra-session historical idempotency.
- **Restrained Frontend Workspace**: Calm, high-density study canvas with question view, answer composer, structured evaluation feedback, remediation panel, and WCAG AA keyboard ergonomics.
- **Fail-Closed Verification**: Automated unit/integration test suites and live verification against MongoDB Atlas replica set transactions and live AI inference.

### Strictly Out of Scope (Deferred to Future Phases)
- **Phase 09 (Learning State & Mastery Engine)**: Authoritative long-term mastery score calculations, spaced repetition intervals, forgetting curves, and student profile mastery aggregation.
- **Phase 10 (Quiz & Assessment System)**: Formal multiple-choice/timed quiz generation, grading rubrics, and formal exam simulations.
- **Phase 11 (Conversation Import)**: ChatGPT/Gemini transcript ingestion and merge workflows.
- **Phase 12 (PDF Export)**: Print formatting and PDF generation.
- **Phase 13 (Learning Analytics & Profile)**: Comprehensive student profile dashboards.
- **Mobile Native Applications**: React Native / Flutter clients.
- **Notes Mutation**: Study Mode never directly mutates canonical `NoteDocument` or `NoteVersion` records (Phase 07 rules remain authoritative).

---

## 3. Subsystem Integration & Architectural Boundaries

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   LEARNFORGE ARCHITECTURE                              │
├───────────────────────────────────┬────────────────────────────────────────────────────┤
│ Phase 01: Authentication          │ Session cookies, User identity, Tenant isolation   │
├───────────────────────────────────┼────────────────────────────────────────────────────┤
│ Phase 03: Subjects & Topics       │ Study sessions anchor to Subject & Topic           │
├───────────────────────────────────┼────────────────────────────────────────────────────┤
│ Phase 04.1: Syllabus Governance   │ Approved SyllabusVersion pinned at session creation│
├───────────────────────────────────┼────────────────────────────────────────────────────┤
│ Phase 05: AI Gateway & Router     │ ModelRouter executes study tasks with fallbacks   │
├───────────────────────────────────┼────────────────────────────────────────────────────┤
│ Phase 06: Knowledge Engine        │ Canonical Concepts & Misconceptions ground queries │
├───────────────────────────────────┼────────────────────────────────────────────────────┤
│ Phase 07: Structured Notes Engine │ NoteDocument & NoteVersion provide study context   │
└───────────────────────────────────┴────────────────────────────────────────────────────┘
```

### A. Syllabus Governance & Version Pinning (Phase 04.1)
- **Session Pinning**: When a study session is created, the system checks for an approved syllabus:
  - If `SyllabusVersion.findOne({ subjectId, userId, status: 'approved' })` exists, `StudySession.syllabusVersionId` is stored and `StudySession.syllabusVersionNumber` is pinned (e.g., `syllabusVersionNumber: 1`).
  - The study session remains **permanently pinned** to that exact syllabus version throughout its lifecycle. Subsequent syllabus revisions or new approvals in the subject do **not** mutate or re-scope an existing active study session.
  - If no approved syllabus existed at session creation, `StudySession.syllabusVersionId: null` indicates topic-only scope and remains that way.
- Draft and superseded syllabus versions are never used as authoritative context.

### B. Knowledge Engine & LearningEvent Boundary (Phase 06)
- **Server-Authoritative Concept Selection**:
  - The server queries canonical `Concept` entities (`userId`, `topicId`) before invoking the AI Gateway.
  - Whitelist of concept IDs, normalized names, and descriptions is passed in prompt context.
  - AI responses returning `targetConceptNames` are strictly matched against the server's canonical topic concepts. Hallucinated or out-of-scope concepts are stripped by the server before persistence.
- **LearningEvent Schema Protection**:
  - In Phase 06, `LearningEvent` is an immutable append-only ledger strictly requiring `chatId` and `sourceMessageId` representing verified conversational evidence.
  - Study Mode turns are **session-local pedagogical records** persisted inside `StudySession.turns`.
  - Concept demonstrations and struggles are tracked as **session-local observations** (`metrics.demonstratedConceptIds`, `metrics.strugglingConceptIds`).
  - Study Mode does **NOT** fabricate fake `chatId`/`sourceMessageId` references or create a parallel unanchored `LearningEvent` pipeline.
  - Creation of long-term `LearningEvent` ledger records and mastery transitions remains the exclusive responsibility of Phase 06 (conversational knowledge extraction) and Phase 09 (mastery engine).

### C. Structured Notes Boundary (Phase 07)
- Reads `NoteDocument` and `NoteVersion` as reference context for question generation and factual verification.
- Study Mode **never** directly mutates or overwrites canonical notes. Notes continue following Phase 07 proposal/versioning rules.

### D. AI Gateway Boundary (Phase 05)
- All AI calls route exclusively through `aiGateway.generate({ task, ... })`.
- No direct provider SDK imports in domain services.
- Model router handles transient retries and secondary provider fallbacks automatically.
- All AI outputs are schema-validated before modifying application state; raw model text is never trusted.

---

## 4. Domain Data Model: `StudySession`

File: `server/src/models/StudySession.js`

```javascript
import mongoose from 'mongoose';

/**
 * StudyTurn Schema
 * Embedded subdocument within StudySession.turns (NOT a standalone registered Mongoose model).
 * Tracks individual initial or follow-up question/answer attempts.
 */
const studyTurnSchema = new mongoose.Schema(
  {
    turnIndex: { type: Number, required: true, min: 0 },
    clientTurnId: { type: String, required: true }, // Client-generated idempotency key
    attemptType: {
      type: String,
      enum: ['INITIAL', 'FOLLOW_UP'],
      required: true,
      default: 'INITIAL',
    },
    // Note: StudyTurn is an embedded subdocument.
    // parentTurnId references another StudySession.turns._id within the SAME StudySession document.
    // Explicitly contains NO `ref: 'StudyTurn'` because StudyTurn is not a registered Mongoose model.
    parentTurnId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    question: {
      questionId: { type: String, required: true },
      questionType: {
        type: String,
        enum: [
          'recall',
          'explain_in_own_words',
          'compare',
          'mechanism',
          'trace_execution',
          'predict_outcome',
          'debugging',
          'apply_concept',
          'identify_misconception',
          'prerequisite_check',
          'scenario',
        ],
        required: true,
      },
      prompt: { type: String, required: true, trim: true, maxlength: 4000 },
      targetConceptIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Concept' }],
      targetConceptNames: [{ type: String, trim: true }],
      expectedReasoningSignals: [{ type: String, trim: true }],
      difficultyIntent: { type: String, enum: ['introductory', 'intermediate', 'advanced'], default: 'intermediate' },
      prerequisiteConceptIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Concept' }],
      generatedAt: { type: Date, default: Date.now },
    },
    userAnswer: { type: String, trim: true, maxlength: 20000, default: null },
    answeredAt: { type: Date, default: null },
    evaluation: {
      verdict: { type: String, enum: ['CORRECT', 'PARTIALLY_CORRECT', 'INCORRECT', 'UNCERTAIN', null], default: null },
      correctness: { type: Number, min: 0, max: 100, default: null },
      completeness: { type: Number, min: 0, max: 100, default: null },
      reasoningQuality: { type: Number, min: 0, max: 100, default: null },
      misconceptionDetected: { type: Boolean, default: false },
      misconceptionSummary: { type: String, default: '' },
      missingConcepts: [{ type: String }],
      strengths: [{ type: String }],
      weaknesses: [{ type: String }],
      feedback: { type: String, default: '' },
      nextAction: { type: String, enum: ['ADVANCE', 'PROBE', 'REMEDIATE', 'RETRY', 'CLARIFY', null], default: null },
      evaluatedAt: { type: Date, default: null },
      provenance: {
        provider: { type: String, default: 'deterministic' },
        model: { type: String, default: 'rule-based-v1' },
        latencyMs: { type: Number, default: 0 },
        requestId: { type: String, default: 'unknown' },
        source: { type: String, enum: ['ai', 'deterministic_fallback'], default: 'deterministic_fallback' },
      },
    },
    remediation: {
      remediationText: { type: String, default: '' },
      followUpQuestion: { type: String, default: '' },
      remediatedAt: { type: Date, default: null },
    },
  },
  { _id: true }
);

/**
 * EvaluationState Schema (Single-Slot Active Operation Tracker)
 * Tracks ONLY the currently active in-flight submission operation.
 * Completed historical idempotency is resolved from StudySession.turns.
 */
const evaluationStateSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['IDLE', 'RECEIVED', 'EVALUATING', 'COMPLETED', 'FAILED'],
      default: 'IDLE',
    },
    operationId: { type: String, default: null }, // Authoritative fencing token for the active evaluation lease
    clientTurnId: { type: String, default: null },
    questionId: { type: String, default: null },
    answerFingerprint: { type: String, default: null }, // SHA-256 of trimmed answer
    startedAt: { type: Date, default: null },
    leaseExpiresAt: { type: Date, default: null }, // Crash lease timeout (30s)
    lastError: {
      code: { type: String, default: null },
      message: { type: String, default: null },
      attemptCount: { type: Number, default: 0 },
    },
  },
  { _id: false }
);

/**
 * StudySession Schema
 * Root domain aggregate for topic-scoped strict study sessions.
 */
const studySessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true, index: true },
    syllabusVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'SyllabusVersion', default: null },
    syllabusVersionNumber: { type: Number, default: null }, // Pinned at session creation
    title: { type: String, trim: true, maxlength: 200, default: 'Active Recall Study Session' },
    status: {
      type: String,
      enum: [
        'ORIENTING',
        'QUESTIONING',
        'ANSWER_PENDING',
        'EVALUATING',
        'REMEDIATING',
        'RECHECKING',
        'ADVANCING',
        'COMPLETED',
        'PAUSED',
        'EXITED',
      ],
      default: 'ORIENTING',
      index: true,
    },
    pausedFromStatus: {
      type: String,
      enum: ['QUESTIONING', 'REMEDIATING', 'RECHECKING', null],
      default: null,
    },
    sessionVersion: { type: Number, default: 1, min: 1 }, // Optimistic concurrency lock
    sequenceCounter: { type: Number, default: 0, min: 0 }, // Monotonic turn sequence index
    activeQuestion: { type: studyTurnSchema.tree.question, default: null },
    evaluationState: { type: evaluationStateSchema, default: () => ({ status: 'IDLE' }) },
    turns: [studyTurnSchema],
    metrics: {
      totalQuestionsAsked: { type: Number, default: 0 },
      totalAnswersSubmitted: { type: Number, default: 0 },
      correctCount: { type: Number, default: 0 },
      partiallyCorrectCount: { type: Number, default: 0 },
      incorrectCount: { type: Number, default: 0 },
      remediationsCount: { type: Number, default: 0 },
      demonstratedConceptIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Concept' }],
      strugglingConceptIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Concept' }],
    },
    lastActivityAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

// Compound Indexes
studySessionSchema.index({ userId: 1, topicId: 1, status: 1 });
studySessionSchema.index({ userId: 1, status: 1, lastActivityAt: -1 });
studySessionSchema.index({ userId: 1, subjectId: 1, lastActivityAt: -1 });

// Note: 'turns.clientTurnId' index is a multikey index used strictly for query acceleration.
// Uniqueness of clientTurnId is session-scoped and strictly enforced through application-level
// conditional persistence and idempotency validation logic, NOT by this MongoDB index.
studySessionSchema.index({ 'turns.clientTurnId': 1 });
```

---

## 5. Complete Pedagogical State Machine, Failure Recovery & Pause Invariants

```
                           ┌────────────────┐
                           │   (CREATE)     │
                           └───────┬────────┘
                                   │
                                   ▼
                           ┌────────────────┐
                           │   ORIENTING    │
                           └───────┬────────┘
                                   │ Initial Question Generated
                                   ▼
          ┌───────────────►┌────────────────┐◄──────────────────┐
          │                │  QUESTIONING   │                   │
          │                └───────┬────────┘                   │
          │                        │ Submit Answer              │ Resume
          │                        │ (Locks sessionVersion)     │ (returns to pausedFromStatus)
          │                        ▼                            │
          │                ┌────────────────┐             ┌───────────┐
          │                │ ANSWER_PENDING │             │  PAUSED   │
          │                └───────┬────────┘             └─────▲─────┘
          │                        │                            │
          │                        ▼                            │ Pause allowed ONLY from:
          │                ┌────────────────┐                   │ - QUESTIONING
          │                │   EVALUATING   │                   │ - REMEDIATING
          │                └───────┬────────┘                   │ - RECHECKING
          │                        │                            │ (PAUSE during EVALUATING
          │                        │ [CATASTROPHIC FAILURE]     │  throws HTTP 409)
          │                        ├───────────────────────────►│ (Transitions back to
          │                        │ (FAILED -> QUESTIONING /   │  QUESTIONING or RECHECKING)
          │                        │  RECHECKING retry-safe)    │
       [ADVANCE]                   │                            │
          │                        ├────────────────────────────┤
          │                        │ [REMEDIATE / PROBE / RETRY]│
          ▼                        ▼                            │
   ┌─────────────┐          ┌─────────────┐                     │
   │  ADVANCING  │          │ REMEDIATING │─────────────────────┤
   └──────┬──────┘          └──────┬──────┘                     │
          │ Next Question          │ Follow-Up Prompt           │
          │ Generated              ▼                            │
          │                 ┌─────────────┐                     │
          │                 │ RECHECKING  │─────────────────────┘
          │                 └──────┬──────┘
          │                        │ Submit Follow-Up Answer
          │                        ▼
          │                 (ANSWER_PENDING)
          │
          │ Session Goal Reached
          ▼
   ┌─────────────┐          ┌─────────────┐
   │  COMPLETED  │          │   EXITED    │
   └─────────────┘          └─────────────┘
   (Terminal State)         (Terminal State)
```

### State Definitions & Mutation Invariants Table

| State | Valid Incoming | Valid Outgoing | Database Mutation Occurring | Invalid Transition Handling |
| :--- | :--- | :--- | :--- | :--- |
| **`ORIENTING`** | *Creation* | `QUESTIONING` | Session initialized; topic concepts and pinned syllabus loaded; initial `activeQuestion` attached; `sessionVersion` = 1. | Rejects answers (`INVALID_STUDY_STATE`). |
| **`QUESTIONING`** | `ORIENTING`, `ADVANCING`, `EVALUATING` *(on failure)* | `ANSWER_PENDING`, `PAUSED`, `EXITED` | Active question presented to student; waiting for initial student answer. | Duplicate question generation blocked. |
| **`ANSWER_PENDING`** | `QUESTIONING`, `RECHECKING` | `EVALUATING` | Student answer received; `sessionVersion` incremented; `evaluationState.status` set to `EVALUATING` with 30s lease and unique `operationId`. | Duplicate submissions throw 409 `STALE_STUDY_STATE`. |
| **`EVALUATING`** | `ANSWER_PENDING` | `ADVANCING`, `REMEDIATING`, `QUESTIONING` *(on failure)*, `RECHECKING` *(on failure)*, `COMPLETED`, `EXITED` *(PAUSE NOT ALLOWED)* | AI evaluation executed; structured evaluation subdocument attached; turn appended to `turns`; metrics updated; `evaluationState.status` set to `COMPLETED` (or `FAILED` on unrecoverable error). | Pausing during evaluation returns 409 `CANNOT_PAUSE_DURING_EVALUATION`. |
| **`REMEDIATING`** | `EVALUATING` | `RECHECKING`, `PAUSED`, `EXITED` | Socratic remediation text and follow-up prompt generated; attached to turn remediation subdocument. | Advancing without remediation blocked. |
| **`RECHECKING`** | `REMEDIATING`, `EVALUATING` *(on failure)* | `ANSWER_PENDING`, `PAUSED`, `EXITED` | Follow-up question presented to student; waiting for follow-up answer attempt (`attemptType: 'FOLLOW_UP'`). | Bypassing follow-up blocked. |
| **`ADVANCING`** | `EVALUATING` | `QUESTIONING`, `COMPLETED` | Understanding demonstrated; turn finalized; next concept query staged. | Submitting answer while advancing blocked. |
| **`PAUSED`** | `QUESTIONING`, `RECHECKING`, `REMEDIATING` | `QUESTIONING`, `RECHECKING`, `REMEDIATING`, `EXITED` | Session frozen; `pausedFromStatus` stored; `lastActivityAt` updated; resumes to exact `pausedFromStatus`. | Submitting answers while paused throws 400. |
| **`EXITED`** | Any non-terminal | *None (Terminal)* | Session marked closed (`status: 'EXITED'`); zero further state transitions allowed. | Post-exit mutations throw 400. |
| **`COMPLETED`** | `ADVANCING`, `EVALUATING` | *None (Terminal)* | All targeted topic concepts covered with demonstrated competence (`status: 'COMPLETED'`). | Post-completion mutations throw 400. |

---

## 6. Follow-Up Answer Persistence & Turn Model

### A. Turn Separation & Embedded Intra-Session Hierarchy
1. **Initial Question & Answer**:
   - `attemptType: 'INITIAL'`
   - `parentTurnId: null`
   - `turnIndex: 0`
   - Stores student's initial answer and evaluation.
   - If evaluation indicates gaps (`PARTIALLY_CORRECT` or `INCORRECT`), `remediation` is populated with `remediationText` and `followUpQuestion`.
2. **Follow-Up Answer & Evaluation**:
   - `attemptType: 'FOLLOW_UP'`
   - `parentTurnId: ObjectId(turns[0]._id)` (referencing the initial turn's `_id` in the **same session**)
   - `turnIndex: 1`
   - `question`: Embedded copy of the follow-up question.
   - `userAnswer`: Student's response to the Socratic follow-up probe.
   - `evaluation`: Multi-criteria evaluation of the follow-up attempt.
   - **Persistence Invariant**: Both turns remain permanently preserved in `StudySession.turns`. Follow-up answers never overwrite the initial answer or evaluation.

### B. Metrics Counting Rules
- `totalQuestionsAsked`: Incremented when an initial question or follow-up question is presented.
- `totalAnswersSubmitted`: Incremented on every answer submission (initial and follow-up).
- `correctCount` / `partiallyCorrectCount` / `incorrectCount`: Evaluated per turn attempt.
- `remediationsCount`: Incremented when a turn triggers remediation.
- `demonstratedConceptIds`: Updated when a turn achieves `verdict: 'CORRECT'` or `nextAction: 'ADVANCE'`.
- `strugglingConceptIds`: Updated when a turn receives `verdict: 'INCORRECT'` or misconception is detected.

---

## 7. Fenced Lease Protocol, Concurrency & Idempotency Contract

### A. Authoritative Lease Fencing & Stale Worker Protection
To prevent an expired/lagging evaluator (Worker A) from committing its evaluation after another evaluator (Worker B) has taken over:

1. **Authoritative Operation Owner (`evaluationState.operationId`)**:
   - Every evaluation lifecycle operation creates a cryptographically random UUID v4 `operationId`.
   - The initial submission atomically sets `evaluationState.operationId = operationId_A` and `evaluationState.leaseExpiresAt = now + 30000ms`.
2. **Atomic Lease Recovery & Takeover**:
   - When a lease expires (i.e., `evaluationState.leaseExpiresAt < now`), any takeover or recovery worker atomically claims the evaluation by issuing:
     ```javascript
     const session = await StudySession.findOneAndUpdate(
       {
         _id: sessionId,
         userId: userId,
         status: 'EVALUATING',
         'evaluationState.leaseExpiresAt': { $lt: new Date() },
       },
       {
         $set: {
           'evaluationState.operationId': newOperationId, // Atomically replaces expired operationId
           'evaluationState.startedAt': new Date(),
           'evaluationState.leaseExpiresAt': new Date(Date.now() + 30000),
           'evaluationState.lastError': null,
           lastActivityAt: new Date(),
         },
         $inc: { sessionVersion: 1 },
       },
       { new: true, session: dbSession }
     );
     ```
3. **Fenced Finalization Writes**:
   - Every database write that finalizes or mutates an evaluation (`ADVANCING`, `REMEDIATING`, `FAILED`) **MUST** condition on the currently authoritative `operationId`:
     ```javascript
     const finalResult = await StudySession.updateOne(
       {
         _id: sessionId,
         userId: userId,
         status: 'EVALUATING',
         'evaluationState.operationId': currentOperationId, // FENCING CONDITION
       },
       {
         $set: {
           status: nextStatus,
           'evaluationState.status': 'COMPLETED',
           lastActivityAt: new Date(),
         },
         $push: { turns: evaluatedTurn },
         $inc: { sequenceCounter: 1, sessionVersion: 1 },
       },
       { session: dbSession }
     );
     ```
4. **Stale Worker Race Resolution**:
   - **Race Sequence**:
     1. Worker A acquires lease with `operationId_A`.
     2. Worker A experiences network delay or pause; lease expires after 30s.
     3. Worker B detects expired lease, takes over, claims `operationId_B`, evaluates, and commits successfully.
     4. Worker A finally returns late and attempts to commit using `operationId_A`.
   - **Application Behavior**:
     - Worker A's `updateOne` matches **0 documents** (`matchedCount === 0`) because `evaluationState.operationId` is no longer `operationId_A`.
     - Worker A detects that its lease was revoked/superseded, discards its stale result, logs `STALE_EVALUATION_WORKER_DISCARDED`, and exits harmlessly without throwing an unhandled exception or mutating the session.

### B. Single-Slot `evaluationState` Semantics & Historical Idempotency
- **Single-Slot Semantics**: `evaluationState` represents **ONLY** the active in-flight submission. It is not an unbounded array and does not store historical turns.
- **Historical Turn Idempotency**:
  - Completed turn history is resolved by querying `StudySession.turns.find(t => t.clientTurnId === clientTurnId)`.
  - **Same `clientTurnId` + matching payload (`questionId` + `answerFingerprint`)**: Returns the already persisted turn document with `HTTP 200` (safe replay/retry).
  - **Same `clientTurnId` + conflicting payload**: Rejects immediately with `HTTP 409 IDEMPOTENCY_KEY_REUSE_CONFLICT`.
  - **Replay after later turns exist**: If a client retransmits `clientTurnId_0` when the session is already at `turnIndex: 3`, the session inspects `turns`, identifies the matching turn, and returns it with `HTTP 200` without rewinding session state.
- **Multikey Indexing**: The index on `turns.clientTurnId` is for query lookup acceleration. Uniqueness is session-scoped and guaranteed by application-level conditional queries within MongoDB transactions.

### C. Failed Evaluation Session Transition & Authoritative Recovery
The session must **never** remain permanently stranded in `EVALUATING`. If an evaluation fails catastrophically:
1. **Provider Failure**: Primary AI provider fails $\rightarrow$ ModelRouter falls back to secondary provider $\rightarrow$ if all providers fail $\rightarrow$ executes rule-based deterministic fallback (`_buildDeterministicEvaluation`).
2. **Catastrophic / Fallback Failure**: If even the deterministic fallback encounters an unrecoverable exception:
   - `evaluationState.status` is set to `'FAILED'`.
   - `evaluationState.lastError` records `{ code: 'EVALUATION_ERROR', message: error.message, attemptCount: attemptCount + 1 }`.
   - The session transitions out of `EVALUATING` back to its retry-safe state:
     - To `QUESTIONING` if the active question was an `INITIAL` attempt.
     - To `RECHECKING` if the active question was a `FOLLOW_UP` attempt.
   - `activeQuestion` remains preserved on the session.
3. **Student Retry**: The student receives a structured error message (`EVALUATION_FAILED_RETRY_SAFE`) and can immediately resubmit their answer without losing their session context or encountering an unrecoverable `STALE_STUDY_STATE`.

---

## 8. Authoritative Concept Targeting & Grounded Evaluation Signals

1. **Server Concept Whitelist**:
   - Backend queries `Concept.find({ userId, topicId })`.
   - Passes allowed concept names and descriptions in prompt context.
2. **Strict Server-Side Validation**:
   - When AI responds with `targetConceptNames`, the server maps each name strictly against the topic's known canonical concepts (exact normalized name and alias resolution).
   - Any hallucinated or out-of-scope concepts are discarded.
   - If no valid concepts remain, the backend assigns the prioritized concept selected before generation.
   - Persists verified `targetConceptIds` (Mongoose ObjectIds).
3. **Reasoning Signals Grounding**:
   - `expectedReasoningSignals` must contain valid non-empty criteria grounded in the concept's canonical description and active misconceptions, preventing the AI from creating arbitrary grading standards.

---

## 9. AI Task Contracts & Schema Validation

### 1. `STUDY_QUESTION_GENERATION`
- **Capabilities**: `[STRUCTURED_OUTPUT, COMPLEX_REASONING]`
- **Preference Chain**: `groq` $\rightarrow$ `openai` $\rightarrow$ `gemini`
- **Input Context**: Subject, topic, pinned syllabus sections, canonical concepts (with status and active misconceptions), recent turn history.
- **Output Schema**:
```json
{
  "questionType": "mechanism",
  "prompt": "Explain how a Raft follower handles an AppendEntries RPC when the term is higher than its current term.",
  "targetConceptNames": ["AppendEntries RPC", "Term Numbers"],
  "expectedReasoningSignals": [
    "Updates current term to higher term",
    "Transitions to follower state",
    "Resets election timer"
  ],
  "difficultyIntent": "intermediate"
}
```
- **Fallback**: Deterministic concept-driven question builder (`_buildDeterministicQuestion`).

### 2. `STUDY_ANSWER_EVALUATION`
- **Capabilities**: `[STRUCTURED_OUTPUT, COMPLEX_REASONING]`
- **Preference Chain**: `openai` $\rightarrow$ `gemini` $\rightarrow$ `groq`
- **Input Context**: Active question, expected reasoning signals, student answer, concept descriptions, active misconceptions.
- **Output Schema**:
```json
{
  "verdict": "PARTIALLY_CORRECT",
  "correctness": 75,
  "completeness": 60,
  "reasoningQuality": 70,
  "misconceptionDetected": false,
  "misconceptionSummary": "",
  "missingConcepts": ["State transition to follower"],
  "strengths": ["Correctly identified that the term is updated."],
  "weaknesses": ["Did not mention resetting the election timer or transitioning state."],
  "feedback": "You accurately noted the term update, but what role does the follower transition play?",
  "nextAction": "PROBE"
}
```
- **Fallback**: Deterministic signal-matching evaluation (`_buildDeterministicEvaluation`).

### 3. `STUDY_REMEDIATION`
- **Capabilities**: `[STRUCTURED_OUTPUT, COMPLEX_REASONING]`
- **Preference Chain**: `openai` $\rightarrow$ `gemini` $\rightarrow$ `groq`
- **Input Context**: Active question, student answer, evaluation weaknesses, missing concepts, detected misconceptions.
- **Output Schema**:
```json
{
  "remediationText": "Remember that term numbers act as a logical clock in Raft. When any node discovers a higher term, it must immediately step down.",
  "followUpQuestion": "If a candidate node receives this RPC, what state does it transition to and why?"
}
```
- **Fallback**: Deterministic concept remediation prompt builder (`_buildDeterministicRemediation`).

---

## 10. REST API Specifications

Base Path: `/api/v1`

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/topics/:topicId/study/sessions` | Create new session or resume active session (pins syllabus) | 201, 200, 404, 401 |
| `GET` | `/api/v1/study-sessions` | List user's active and recent study sessions | 200, 401 |
| `GET` | `/api/v1/study-sessions/:id` | Retrieve full study session document including turn history | 200, 404, 401 |
| `POST` | `/api/v1/study-sessions/:id/answer` | Submit answer for active question (optimistic lock & fenced lease) | 200, 400, 404, 409 |
| `POST` | `/api/v1/study-sessions/:id/continue` | Advance already-evaluated session (`ADVANCING` $\rightarrow$ next question; `REMEDIATING` $\rightarrow$ follow-up question) | 200, 400, 404, 409 |
| `POST` | `/api/v1/study-sessions/:id/pause` | Pause session (allowed only from `QUESTIONING`, `REMEDIATING`, `RECHECKING`) | 200, 400, 404, 409 |
| `POST` | `/api/v1/study-sessions/:id/resume` | Resume session to exact `pausedFromStatus` | 200, 400, 404 |
| `POST` | `/api/v1/study-sessions/:id/exit` | Terminate study session (`status: 'EXITED'`) | 200, 400, 404 |

---

## 11. Automated Testing Strategy (`server/tests/studySession.test.js`)

Explicit test cases to implement:
1. **Duplicate Initial Answer Race**: Rapid double-submit produces exactly one evaluated turn; second fails with HTTP 409 `STALE_STUDY_STATE`.
2. **Duplicate Follow-Up Answer Race**: Double-submit on follow-up question safely handled with single turn insertion.
3. **Idempotency Key Reuse Conflict**: Submitting same `clientTurnId` with modified answer payload rejects with HTTP 409 `IDEMPOTENCY_KEY_REUSE_CONFLICT`.
4. **Idempotent Retry on Completed Turn**: Submitting same `clientTurnId` with identical payload returns existing evaluated turn (HTTP 200).
5. **Idempotent Retry After Subsequent Turns Exist**: Submitting an old `clientTurnId` when the session has already advanced past it returns the original turn without rolling back or corrupting state.
6. **Lease Fencing & Stale Evaluator Takeover**:
   - Worker A acquires lease (`operationId_A`).
   - Lease expires; Worker B takes over (`operationId_B`) and commits.
   - Worker A returns late and attempts completion with `operationId_A`.
   - Worker A's commit matches 0 documents, rejects harmlessly, and does not overwrite Worker B's result.
7. **Old OperationId Cannot Overwrite EvaluationState**: Attempting to write `evaluationState` with a superseded `operationId` fails closed.
8. **Failed Evaluation Recovery**: Simulating catastrophic AI and fallback failure sets `evaluationState.status = 'FAILED'` and transitions session safely to `QUESTIONING` (or `RECHECKING`), allowing subsequent student submission.
9. **Pause During Evaluation Blocked**: Attempting to pause while `status: 'EVALUATING'` returns HTTP 409 `CANNOT_PAUSE_DURING_EVALUATION`.
10. **Pause and Resume from Remediation**: Pausing from `REMEDIATING` stores `pausedFromStatus: 'REMEDIATING'` and resumes cleanly.
11. **Follow-Up Answer Persistence**: Follow-up turn persisted with `attemptType: 'FOLLOW_UP'`, `parentTurnId` pointing to initial turn `_id`, preserving complete history.
12. **Syllabus Version Pinning**: Approving a new syllabus version does not alter an existing active session's pinned `syllabusVersionId`.
13. **Hallucinated Concept Stripping**: Out-of-scope/hallucinated concept names in AI output are stripped and normalized strictly to canonical topic concepts.
14. **Stale Concurrent Tab Submission**: Out-of-order sequence index submission from concurrent tab rejected with HTTP 409.
15. **Cross-Tenant Security**: Other tenant user cannot access or submit answers to session (HTTP 404).

---

## 12. Fail-Closed Live Verification Plan (`verify_phase08_live.js`)

Execution against live Express API, MongoDB Atlas replica set, and Groq/OpenAI AI Gateway:

1. `[1/18]` `[HTTP API]` Live API Health Check & Database Connectivity.
2. `[2/18]` `[DATABASE]` MongoDB Atlas Replica Set Connection.
3. `[3/18]` `[DATABASE]` Multi-Document Transaction Support Assertion.
4. `[4/18]` `[DATABASE]` Isolated Test Tenant & Canonical Knowledge Setup.
5. `[5/18]` `[HTTP API]` Create Study Session with Pinned Syllabus (`POST /api/v1/topics/:topicId/study/sessions`).
6. `[6/18]` `[DOMAIN-SERVICE]` Verify Session Ownership, Initial State `QUESTIONING`, and Curriculum Pinning.
7. `[7/18]` `[AI GATEWAY]` Verify Structured Question Generation with Target Concepts Whitelist.
8. `[8/18]` `[HTTP API]` Submit Incomplete/Weak Answer (`POST /study-sessions/:id/answer`).
9. `[9/18]` `[AI GATEWAY]` Verify Structured Answer Evaluation (`PARTIALLY_CORRECT` / `INCORRECT`).
10. `[10/18]` `[PEDAGOGY]` Verify Remediation Loop Triggered (Does NOT advance blindly).
11. `[11/18]` `[HTTP API]` Submit Socratic Follow-Up Answer (`attemptType: 'FOLLOW_UP'`, `parentTurnId` linked).
12. `[12/18]` `[PEDAGOGY]` Verify Demonstrated Understanding & Advancement (`CORRECT` $\rightarrow$ `ADVANCE`).
13. `[13/18]` `[HTTP API]` Fetch Next Question (`POST /study-sessions/:id/continue`).
14. `[14/18]` `[DOMAIN-SERVICE CONCURRENCY]` Proving Real Live Concurrency: Duplicate Answer Submission Race with Synchronization Barrier.
15. `[15/18]` `[LEASE FENCING & RECOVERY]` Proving Lease Takeover & Stale Worker Rejection (Late worker matches 0 documents).
16. `[16/18]` `[HTTP API]` Cross-Tenant Security Isolation (HTTP 404 on other user session).
17. `[17/18]` `[AI GATEWAY]` Safe Fallback Execution & Non-Stranding Error Recovery on AI Provider Outage.
18. `[18/18]` `[TEARDOWN]` Immutability-Safe Native Driver Test Teardown.
