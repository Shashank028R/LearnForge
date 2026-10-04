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
- **AI Gateway Integration**: Provider-agnostic task routing for `STUDY_QUESTION_GENERATION`, `STUDY_ANSWER_EVALUATION`, and `STUDY_REMEDIATION` with strict schema validation and deterministic rule-based fallbacks.
- **Deterministic Concurrency & Idempotency**: Multi-document transaction boundaries, optimistic sequence/version locking, and duplicate submission protections.
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
│ Phase 04.1: Syllabus Governance   │ Approved SyllabusVersion provides curriculum scope │
├───────────────────────────────────┼────────────────────────────────────────────────────┤
│ Phase 05: AI Gateway & Router     │ ModelRouter executes study tasks with fallbacks   │
├───────────────────────────────────┼────────────────────────────────────────────────────┤
│ Phase 06: Knowledge Engine        │ Canonical Concepts & Misconceptions ground queries │
├───────────────────────────────────┼────────────────────────────────────────────────────┤
│ Phase 07: Structured Notes Engine │ NoteDocument & NoteVersion provide study context   │
└───────────────────────────────────┴────────────────────────────────────────────────────┘
```

### A. Syllabus Governance Boundary (Phase 04.1)
- Authoritative curriculum scope is queried via `SyllabusVersion.findOne({ subjectId, userId, status: 'approved' })`.
- If an approved syllabus exists, its sections, topic learning objectives, and ordering inform question generation.
- If no approved syllabus exists, Study Mode functions within the standalone `Topic` context. Draft and superseded syllabus versions are never used as authoritative context.

### B. Knowledge Engine & LearningEvent Boundary (Phase 06)
- **Concept Grounding**: Reads canonical `Concept` entities (`userId`, `topicId`), sorting by priority (e.g., `NEEDS_REVIEW`, `INTRODUCED`, `LEARNING` first; active `misconceptions` prioritized for probing).
- **LearningEvent Schema Protection**: In Phase 06, `LearningEvent` is an immutable append-only ledger strictly requiring `chatId` and `sourceMessageId` (representing verified conversational evidence).
- **Clear Phase 08 Decision**:
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

const studySessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true, index: true },
    syllabusVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'SyllabusVersion', default: null },
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
    sessionVersion: { type: Number, default: 1, min: 1 }, // Optimistic concurrency lock
    sequenceCounter: { type: Number, default: 0, min: 0 }, // Monotonic turn index
    activeQuestion: { type: studyTurnSchema.tree.question, default: null },
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

// Compound Indexes for fast querying and uniqueness
studySessionSchema.index({ userId: 1, topicId: 1, status: 1 });
studySessionSchema.index({ userId: 1, status: 1, lastActivityAt: -1 });
studySessionSchema.index({ userId: 1, subjectId: 1, lastActivityAt: -1 });
```

---

## 5. Complete Pedagogical State Machine

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
          │                        │ (Locks sessionVersion)     │
          │                        ▼                            │
          │                ┌────────────────┐             ┌───────────┐
          │                │ ANSWER_PENDING │             │  PAUSED   │
          │                └───────┬────────┘             └─────▲─────┘
          │                        │                            │ Pause
          │                        ▼                            │
          │                ┌────────────────┐                   │
          │                │   EVALUATING   │───────────────────┤
          │                └───────┬────────┘                   │
          │                        │                            │
       [ADVANCE]                   ├────────────────────────────┤
          │                        │ [REMEDIATE / PROBE / RETRY]│
          ▼                        ▼                            │
   ┌─────────────┐          ┌─────────────┐                     │
   │  ADVANCING  │          │ REMEDIATING │─────────────────────┘
   └──────┬──────┘          └──────┬──────┘
          │ Next Question          │ Follow-Up Prompt
          │ Generated              ▼
          │                 ┌─────────────┐
          │                 │ RECHECKING  │
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

### State Definitions & Mutation Table

| State | Valid Incoming | Valid Outgoing | Database Mutation Occurring | Invalid Transition Handling |
| :--- | :--- | :--- | :--- | :--- |
| **`ORIENTING`** | *Creation* | `QUESTIONING` | Session initialized; topic concepts and syllabus loaded; initial active question attached; `sessionVersion` = 1. | Rejects answers (`INVALID_STUDY_STATE`). |
| **`QUESTIONING`** | `ORIENTING`, `ADVANCING` | `ANSWER_PENDING`, `PAUSED`, `EXITED` | Active question exposed to student; `activeQuestion` populated; waiting for student input. | Duplicate question generation blocked. |
| **`ANSWER_PENDING`** | `QUESTIONING`, `RECHECKING` | `EVALUATING` | Student answer received; `sessionVersion` incremented; state locked to prevent concurrent double-submits. | Duplicate submission throws 409 `STALE_STUDY_STATE`. |
| **`EVALUATING`** | `ANSWER_PENDING` | `ADVANCING`, `REMEDIATING`, `COMPLETED`, `PAUSED`, `EXITED` | AI evaluation executed; structured evaluation subdocument generated; turn appended to `turns`; metrics updated. | Bypassing evaluation blocked. |
| **`REMEDIATING`** | `EVALUATING` | `RECHECKING`, `PAUSED`, `EXITED` | Socratic remediation text and follow-up prompt generated; attached to turn remediation subdocument. | Advancing without remediation blocked. |
| **`RECHECKING`** | `REMEDIATING` | `ANSWER_PENDING`, `PAUSED`, `EXITED` | Follow-up question presented to student; waiting for follow-up answer. | Bypassing follow-up blocked. |
| **`ADVANCING`** | `EVALUATING` | `QUESTIONING`, `COMPLETED` | Understanding demonstrated; turn finalized; next concept query staged. | Submitting answer while advancing blocked. |
| **`PAUSED`** | `QUESTIONING`, `RECHECKING`, `REMEDIATING`, `EVALUATING` | `QUESTIONING`, `RECHECKING`, `EXITED` | Session frozen; `lastActivityAt` updated; resumes to exact prior active state upon `resume`. | Submitting answers while paused throws 400. |
| **`EXITED`** | Any non-terminal | *None (Terminal)* | Session marked closed; `status: 'EXITED'`; zero further state transitions allowed. | Any post-exit mutation throws 400. |
| **`COMPLETED`** | `ADVANCING`, `EVALUATING` | *None (Terminal)* | All targeted topic concepts covered with demonstrated competence; `status: 'COMPLETED'`. | Any post-completion mutation throws 400. |

---

## 6. Concurrency, Idempotency & Transaction Contract

### A. Authoritative Concurrency Control
1. **`sessionVersion`**: Integer version token incremented atomically on every mutation (`$inc: { sessionVersion: 1 }`).
2. **`sequenceCounter`**: Monotonically increasing turn sequence index (0, 1, 2, ...).
3. **`activeQuestion.questionId`**: Unique UUIDv4 identifying the active question.
4. **`clientTurnId`**: Client-generated UUIDv4 provided with answer submission.

### B. Atomic Conditional Update & Double-Submit Protection
When the user submits an answer:
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
      lastActivityAt: new Date(),
    },
    $inc: { sessionVersion: 1 },
  },
  { new: true, session: dbSession }
);
```

### C. Concurrency Invariant Scenarios
- **Double-Click / Rapid Concurrent POST**:
  - Request A matches `sessionVersion: N`, transitions state to `ANSWER_PENDING`, and increments `sessionVersion` to `N + 1`.
  - Request B (with stale `sessionVersion: N`) matches 0 documents and fails closed immediately with `HTTP 409 STALE_STUDY_STATE`.
- **Concurrent Tabs**:
  - Tab 1 submits answer at version $N$ $\rightarrow$ succeeds.
  - Tab 2 (holding stale version $N$) attempts answer $\rightarrow$ fails with `HTTP 409`. Refreshing Tab 2 loads the server-authoritative state.
- **Network Retries / Idempotency**:
  - If a network failure occurs during evaluation and the client retries with the identical `clientTurnId`, the server checks if `turns` already contains `clientTurnId` and returns the existing result safely without re-evaluating or creating duplicate turns.
- **MongoDB Multi-Document ACID Transactions**:
  - Turn record insertion, metrics update, and session status transition are committed atomically using `readConcern: 'snapshot'` and `writeConcern: 'majority'`.

---

## 7. AI Task Contracts & Schema Validation

All tasks execute through `aiGateway.generate({ task, ... })`. Raw model output is schema-validated before modifying state.

### 1. `STUDY_QUESTION_GENERATION`
- **Capabilities**: `[STRUCTURED_OUTPUT, COMPLEX_REASONING]`
- **Preference Chain**: `groq` $\rightarrow$ `openai` $\rightarrow$ `gemini`
- **Input Context**: Topic title, topic description, approved syllabus sections, canonical concepts (with mastery status and active misconceptions), recent session turn history.
- **Output Schema**:
```json
{
  "questionType": "mechanism",
  "prompt": "Explain the step-by-step process of leader election in Raft when a follower's election timeout expires.",
  "targetConceptNames": ["Leader Election", "Election Timeout"],
  "expectedReasoningSignals": [
    "Increments current term",
    "Transitions to Candidate state",
    "Votes for self",
    "Sends RequestVote RPCs to all peers"
  ],
  "difficultyIntent": "intermediate"
}
```
- **Validation**: Enforces non-empty `prompt`, valid `questionType` enum, non-empty `targetConceptNames`.
- **Fallback**: Deterministic concept-driven question builder (`_buildDeterministicQuestion`) if AI fails or returns invalid JSON.

### 2. `STUDY_ANSWER_EVALUATION`
- **Capabilities**: `[STRUCTURED_OUTPUT, COMPLEX_REASONING]`
- **Preference Chain**: `openai` $\rightarrow$ `gemini` $\rightarrow$ `groq`
- **Input Context**: Active question, expected reasoning signals, student answer, concept descriptions, active misconceptions.
- **Output Schema**:
```json
{
  "verdict": "PARTIALLY_CORRECT",
  "correctness": 70,
  "completeness": 50,
  "reasoningQuality": 65,
  "misconceptionDetected": false,
  "misconceptionSummary": "",
  "missingConcepts": ["RequestVote RPC dispatch", "Self-vote initialization"],
  "strengths": ["Correctly identified that the term number increments and state changes to Candidate."],
  "weaknesses": ["Omitted the voting mechanism and communication with peer nodes."],
  "feedback": "You understood the state transition and term increment, but how does the candidate secure votes from other nodes?",
  "nextAction": "PROBE"
}
```
- **Validation**: Enforces `verdict` enum (`CORRECT`, `PARTIALLY_CORRECT`, `INCORRECT`, `UNCERTAIN`), numerical scores bounded 0–100, `nextAction` enum (`ADVANCE`, `PROBE`, `REMEDIATE`, `RETRY`, `CLARIFY`).
- **Fallback**: Deterministic signal-matching evaluation (`_buildDeterministicEvaluation`) ensuring sessions never hang on AI provider outages.

### 3. `STUDY_REMEDIATION`
- **Capabilities**: `[STRUCTURED_OUTPUT, COMPLEX_REASONING]`
- **Preference Chain**: `openai` $\rightarrow$ `gemini` $\rightarrow$ `groq`
- **Input Context**: Active question, student answer, evaluation weaknesses, missing concepts, detected misconceptions.
- **Output Schema**:
```json
{
  "remediationText": "In Raft, a candidate cannot win an election alone; it must gather votes from a majority of cluster nodes via RequestVote RPCs.",
  "followUpQuestion": "What RPC does the candidate send to request votes, and what condition must peers check before granting their vote?"
}
```
- **Validation**: Enforces non-empty `remediationText` and `followUpQuestion`.
- **Fallback**: Deterministic concept remediation prompt builder (`_buildDeterministicRemediation`).

---

## 8. REST API Specifications

Base Path: `/api/v1`

### 1. `POST /topics/:topicId/study/sessions`
- **Purpose**: Creates a new study session or resumes an existing active session for the topic.
- **Request Body**: `{ title?: string, mode?: 'standard' }`
- **Response `201/200`**: `{ data: StudySession }`
- **Security**: Requires authenticated user ownership of topic (`404` if unauthorized).

### 2. `GET /study-sessions`
- **Purpose**: Lists all active and recent study sessions for the authenticated user.
- **Query Params**: `status?: string, page?: number, limit?: number`
- **Response `200`**: `{ data: StudySession[], total: number, page: number, limit: number }`

### 3. `GET /study-sessions/:id`
- **Purpose**: Retrieves full study session document including turn history and active question.
- **Response `200`**: `{ data: StudySession }`
- **Security**: Tenant-scoped (`404` if session belongs to another user).

### 4. `POST /study-sessions/:id/answer`
- **Purpose**: Submits student answer for active question; executes evaluation and triggers remediation if needed.
- **Request Body**:
  ```json
  {
    "questionId": "uuid-v4",
    "sessionVersion": 1,
    "clientTurnId": "uuid-v4",
    "answer": "Candidate increments term, votes for self, and sends RequestVote RPCs."
  }
  ```
- **Response `200`**:
  ```json
  {
    "data": {
      "session": StudySession,
      "evaluatedTurn": StudyTurn,
      "nextStatus": "ADVANCING" | "REMEDIATING"
    }
  }
  ```
- **Error Responses**: `400` (Validation), `404` (Not Found), `409` (`STALE_STUDY_STATE`).

### 5. `POST /study-sessions/:id/continue`
- **Purpose**: **Forward transition only**. Advances an already-evaluated session (`ADVANCING` $\rightarrow$ next question `QUESTIONING`; `REMEDIATING` $\rightarrow$ follow-up question `RECHECKING`). Does **zero** re-evaluation.
- **Request Body**: `{ sessionVersion: number }`
- **Response `200`**: `{ data: StudySession }`
- **Error Responses**: `400` (Invalid state to continue), `409` (`STALE_STUDY_STATE`).

### 6. `POST /study-sessions/:id/pause` & `POST /study-sessions/:id/resume`
- **Purpose**: Pauses or resumes an in-progress study session.
- **Response `200`**: `{ data: StudySession }`

### 7. `POST /study-sessions/:id/exit`
- **Purpose**: Terminates and closes study session (`status: 'EXITED'`).
- **Response `200`**: `{ data: StudySession }`

---

## 9. Frontend Study Mode UX Architecture (`client/src/pages/StudyPage.jsx`)

### Visual & Interaction Design
- **Philosophy**: Restrained, high-density, calm, distraction-free productivity UI.
- **Strict Anti-Gimmick Rules**: Zero neon accents, zero glowing borders, zero glassmorphism, zero floating blobs, zero decorative animations.
- **Components**:
  1. **Topic Study Directory**: Browse subjects/topics, view concept counts, resume active sessions with one click.
  2. **Study Canvas Header**: Subject & Topic breadcrumbs, session status badge, question counter, Pause & Exit controls.
  3. **Active Question Card**: Question type badge (`Mechanism`, `Compare`, `Explain in own words`), difficulty tag, targeted concept tags, prominent question text.
  4. **Answer Composer**: Controlled textarea, character counter, keyboard submit affordance (`Ctrl+Enter` / `Cmd+Enter`), primary "Submit Answer" button with loading state.
  5. **Structured Evaluation Panel**: Multi-criteria visual score breakdown (Correctness, Completeness, Reasoning Quality), highlighted strengths, missing logical steps, teacher feedback text.
  6. **Socratic Remediation & Probing Card**: Distinct warning/remediation card surfacing guidance hints and the targeted follow-up question.
  7. **Action Toolbar**: "Next Question" button (in `ADVANCING`), "Submit Follow-Up" (in `RECHECKING`), "Try Again" / "Exit" controls.

---

## 10. Automated Testing Strategy

### A. Backend Unit & Integration Tests (`server/tests/studySession.test.js`)
- **State Machine Tests**: Verify valid transitions and assertion of invalid transitions across all 10 states.
- **Question Generation**: Verify schema compliance, concept attribution, and difficulty mapping.
- **Answer Evaluation**: Verify multi-criteria scoring, missing step detection, and misconception flagging.
- **Remediation & Socratic Loop**: Verify partial/incorrect answers route to remediation and do not advance blindly.
- **Advancement Guard**: Verify advancement occurs only upon verified correct understanding.
- **Concurrency & Idempotency**: Verify duplicate submissions, stale `sessionVersion` collisions (HTTP 409), and `clientTurnId` network retries.
- **Security & Tenant Isolation**: Verify cross-user access returns 404.
- **AI Fallback Resilience**: Verify deterministic rule-based fallback when AI providers fail.

### B. Frontend Component Tests (`client/src/pages/Study.test.jsx`)
- Initial load, topic selection, session resume.
- Active question rendering, answer input, character counter.
- Form submission, loading skeleton, keyboard shortcut (`Ctrl+Enter`).
- Evaluation feedback rendering, strengths/weaknesses display.
- Socratic remediation view, follow-up submission, session completion flow.
- Error state handling and tenant access denials.

---

## 11. Fail-Closed Live Verification Plan (`server/scripts/verify_phase08_live.js`)

Execution against live Express API, MongoDB Atlas replica set, and Groq/OpenAI AI Gateway:

1. `[1/18]` `[HTTP API]` Live API Health Check & Database Connectivity.
2. `[2/18]` `[DATABASE]` MongoDB Atlas Replica Set Connection.
3. `[3/18]` `[DATABASE]` Multi-Document Transaction Support Assertion.
4. `[4/18]` `[DATABASE]` Isolated Test Tenant & Canonical Knowledge Setup.
5. `[5/18]` `[HTTP API]` Create Study Session (`POST /api/v1/topics/:topicId/study/sessions`).
6. `[6/18]` `[DOMAIN-SERVICE]` Verify Session Ownership & Initial State `QUESTIONING`.
7. `[7/18]` `[AI GATEWAY]` Verify Structured Question Generation with Target Concepts.
8. `[8/18]` `[HTTP API]` Submit Incomplete/Weak Answer (`POST /study-sessions/:id/answer`).
9. `[9/18]` `[AI GATEWAY]` Verify Structured Answer Evaluation (`PARTIALLY_CORRECT` / `INCORRECT`).
10. `[10/18]` `[PEDAGOGY]` Verify Remediation Loop Triggered (Does NOT advance blindly).
11. `[11/18]` `[HTTP API]` Submit Socratic Follow-Up Answer.
12. `[12/18]` `[PEDAGOGY]` Verify Demonstrated Understanding & Advancement (`CORRECT` $\rightarrow$ `ADVANCE`).
13. `[13/18]` `[HTTP API]` Fetch Next Question (`POST /study-sessions/:id/continue`).
14. `[14/18]` `[DOMAIN-SERVICE CONCURRENCY]` Proving Real Live Concurrency: Duplicate Answer Submission Race with Synchronization Barrier.
15. `[15/18]` `[DOMAIN-SERVICE CONCURRENCY]` Stale Sequence Index Collision Rejection (HTTP 409).
16. `[16/18]` `[HTTP API]` Cross-Tenant Security Isolation (HTTP 404 on other user session).
17. `[17/18]` `[AI GATEWAY]` Safe Fallback Execution on AI Provider Outage.
18. `[18/18]` `[TEARDOWN]` Immutability-Safe Native Driver Test Teardown.
