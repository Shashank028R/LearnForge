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
- **Deterministic Concurrency & Idempotency**: Multi-document transaction boundaries, optimistic sequence/version locking, crash-safe evaluation leases, and duplicate submission protections.
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

const studyTurnSchema = new mongoose.Schema(
  {
    turnIndex: { type: Number, required: true, min: 0 },
    clientTurnId: { type: String, required: true }, // Idempotency key from client
    attemptType: {
      type: String,
      enum: ['INITIAL', 'FOLLOW_UP'],
      required: true,
      default: 'INITIAL',
    },
    parentTurnId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StudyTurn',
      default: null, // null for INITIAL attempt, references parent turn for FOLLOW_UP
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

const evaluationStateSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['IDLE', 'RECEIVED', 'EVALUATING', 'COMPLETED', 'FAILED'],
      default: 'IDLE',
    },
    operationId: { type: String, default: null },
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
    sequenceCounter: { type: Number, default: 0, min: 0 }, // Monotonic turn index
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
studySessionSchema.index({ 'turns.clientTurnId': 1 });
```

---

## 5. Complete Pedagogical State Machine & Pause Invariants

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
       [ADVANCE]                   ├────────────────────────────┤  throws HTTP 409)
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
| **`QUESTIONING`** | `ORIENTING`, `ADVANCING` | `ANSWER_PENDING`, `PAUSED`, `EXITED` | Active question presented to student; waiting for initial student answer. | Duplicate question generation blocked. |
| **`ANSWER_PENDING`** | `QUESTIONING`, `RECHECKING` | `EVALUATING` | Student answer received; `sessionVersion` incremented; `evaluationState.status` set to `EVALUATING` with 30s lease. | Duplicate submissions throw 409 `STALE_STUDY_STATE`. |
| **`EVALUATING`** | `ANSWER_PENDING` | `ADVANCING`, `REMEDIATING`, `COMPLETED`, `EXITED` *(PAUSE NOT ALLOWED)* | AI evaluation executed; structured evaluation subdocument attached; turn appended to `turns`; metrics updated; `evaluationState.status` set to `COMPLETED`. | Pausing during evaluation returns 409 `CANNOT_PAUSE_DURING_EVALUATION`. |
| **`REMEDIATING`** | `EVALUATING` | `RECHECKING`, `PAUSED`, `EXITED` | Socratic remediation text and follow-up prompt generated; attached to turn remediation subdocument. | Advancing without remediation blocked. |
| **`RECHECKING`** | `REMEDIATING` | `ANSWER_PENDING`, `PAUSED`, `EXITED` | Follow-up question presented to student; waiting for follow-up answer attempt (`attemptType: 'FOLLOW_UP'`). | Bypassing follow-up blocked. |
| **`ADVANCING`** | `EVALUATING` | `QUESTIONING`, `COMPLETED` | Understanding demonstrated; turn finalized; next concept query staged. | Submitting answer while advancing blocked. |
| **`PAUSED`** | `QUESTIONING`, `RECHECKING`, `REMEDIATING` | `QUESTIONING`, `RECHECKING`, `REMEDIATING`, `EXITED` | Session frozen; `pausedFromStatus` stored; `lastActivityAt` updated; resumes to exact `pausedFromStatus`. | Submitting answers while paused throws 400. |
| **`EXITED`** | Any non-terminal | *None (Terminal)* | Session marked closed (`status: 'EXITED'`); zero further state transitions allowed. | Post-exit mutations throw 400. |
| **`COMPLETED`** | `ADVANCING`, `EVALUATING` | *None (Terminal)* | All targeted topic concepts covered with demonstrated competence (`status: 'COMPLETED'`). | Post-completion mutations throw 400. |

---

## 6. Follow-Up Answer Persistence & Turn Model

### A. Turn Separation & Hierarchy
1. **Initial Question & Answer**:
   - `attemptType: 'INITIAL'`
   - `parentTurnId: null`
   - `turnIndex: 0`
   - Records student's initial answer and evaluation.
   - If evaluation is `PARTIALLY_CORRECT` or `INCORRECT`, `remediation` is populated with `remediationText` and `followUpQuestion`.
2. **Follow-Up Answer & Evaluation**:
   - `attemptType: 'FOLLOW_UP'`
   - `parentTurnId: ObjectId(turn[0]._id)`
   - `turnIndex: 1`
   - `question`: Embedded copy of the follow-up question.
   - `userAnswer`: Student's response to the Socratic follow-up probe.
   - `evaluation`: Multi-criteria evaluation of the follow-up attempt.
   - Both turns remain **permanently recoverable** in `StudySession.turns`.

### B. Metrics Counting Rules
- `totalQuestionsAsked`: Incremented when an initial question or follow-up question is presented.
- `totalAnswersSubmitted`: Incremented on every answer submission (initial and follow-up).
- `correctCount` / `partiallyCorrectCount` / `incorrectCount`: Evaluated per turn attempt.
- `remediationsCount`: Incremented when a turn triggers remediation.
- `demonstratedConceptIds`: Updated when a turn achieves `verdict: 'CORRECT'` or `nextAction: 'ADVANCE'`.
- `strugglingConceptIds`: Updated when a turn receives `verdict: 'INCORRECT'` or misconception is detected.

---

## 7. Crash-Safe Evaluation, Idempotency & Concurrency Contract

### A. Durable Submission & Lease Protocol
1. **Answer Fingerprinting**: `answerFingerprint = crypto.createHash('sha256').update(answer.trim()).digest('hex')`.
2. **Atomic Transition & Lease**:
   ```javascript
   const session = await StudySession.findOneAndUpdate(
     {
       _id: sessionId,
       userId: userId,
       sessionVersion: expectedSessionVersion,
       status: { $in: ['QUESTIONING', 'RECHECKING'] },
       'activeQuestion.questionId': questionId,
     },
     {
       $set: {
         status: 'ANSWER_PENDING',
         'evaluationState.status': 'EVALUATING',
         'evaluationState.operationId': uuidv4(),
         'evaluationState.clientTurnId': clientTurnId,
         'evaluationState.questionId': questionId,
         'evaluationState.answerFingerprint': answerFingerprint,
         'evaluationState.startedAt': new Date(),
         'evaluationState.leaseExpiresAt': new Date(Date.now() + 30000), // 30s lease
         lastActivityAt: new Date(),
       },
       $inc: { sessionVersion: 1 },
     },
     { new: true, session: dbSession }
   );
   ```

### B. Strict Retry & Idempotency Rules
- **Idempotent Match**: If a request arrives with `clientTurnId` matching an existing turn in `turns`:
  - If `questionId` and `answerFingerprint` match: Return existing evaluated turn with HTTP 200 (safe retry).
  - If `questionId` or `answerFingerprint` differs: Reject with `HTTP 409 IDEMPOTENCY_KEY_REUSE_CONFLICT`.
- **Double-Click / Concurrent Race**:
  - Request A matches `sessionVersion: N`, transitions state, increments `sessionVersion` to `N + 1`.
  - Request B (with stale version $N$) matches 0 documents and fails closed with `HTTP 409 STALE_STUDY_STATE`.
- **Crash Recovery**:
  - If the server crashes during AI execution, `evaluationState.leaseExpiresAt` expires after 30s.
  - When the student retries or refreshes, the backend detects expired lease and executes a deterministic fallback evaluation or retries cleanly, resetting `evaluationState`.

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
| `POST` | `/api/v1/study-sessions/:id/answer` | Submit answer for active question (optimistic lock & lease) | 200, 400, 404, 409 |
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
4. **Idempotent Retry**: Submitting same `clientTurnId` with identical payload returns existing evaluated turn (HTTP 200).
5. **Process Crash & Lease Recovery**: Simulating crash during `EVALUATING` recovers via lease expiration upon subsequent request.
6. **Pause During Evaluation Blocked**: Attempting to pause while `status: 'EVALUATING'` returns HTTP 409 `CANNOT_PAUSE_DURING_EVALUATION`.
7. **Pause and Resume from Remediation**: Pausing from `REMEDIATING` stores `pausedFromStatus: 'REMEDIATING'` and resumes cleanly.
8. **Follow-Up Answer Persistence**: Follow-up turn persisted with `attemptType: 'FOLLOW_UP'`, `parentTurnId` pointing to initial turn, preserving complete history.
9. **Syllabus Version Pinning**: Approving a new syllabus version does not alter an existing active session's pinned `syllabusVersionId`.
10. **Hallucinated Concept Stripping**: Out-of-scope/hallucinated concept names in AI output are stripped and normalized strictly to canonical topic concepts.
11. **Stale Concurrent Tab Submission**: Out-of-order sequence index submission from concurrent tab rejected with HTTP 409.
12. **Cross-Tenant Security**: Other tenant user cannot access or submit answers to session (HTTP 404).

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
15. `[15/18]` `[DOMAIN-SERVICE CONCURRENCY]` Stale Sequence Index Collision Rejection (HTTP 409).
16. `[16/18]` `[HTTP API]` Cross-Tenant Security Isolation (HTTP 404 on other user session).
17. `[17/18]` `[AI GATEWAY]` Safe Fallback Execution on AI Provider Outage.
18. `[18/18]` `[TEARDOWN]` Immutability-Safe Native Driver Test Teardown.
