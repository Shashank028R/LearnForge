# Phase 08 — Strict Study Mode & Active Recall Implementation Report

## 1. Objective
Transform LearnForge from a passive conversational tool into a strict, interactive pedagogical tutor. The AI drives active recall, evaluates multi-criteria reasoning, activates Socratic remediation for incomplete/flawed understanding, and only advances upon demonstrated conceptual competence.

---

## 2. Architecture Overview
- **Domain Entity**: `StudySession` model anchoring to `User`, `Subject`, and `Topic`.
- **Embedded Subdocument**: `StudyTurn` subdocument in `StudySession.turns` recording initial and follow-up attempts (`parentTurnId` links intra-session turns).
- **Single-Slot In-Flight Tracker**: `evaluationState` managing active evaluation leases with authoritative `operationId` fencing tokens.
- **Central State Machine**: `server/src/study/stateMachine.js` enforcing legal state transitions, non-stranding failure recovery, and pause protections (`CANNOT_PAUSE_DURING_EVALUATION`).
- **AI Gateway Integration**: Provider-agnostic task routing for `STUDY_QUESTION_GENERATION`, `STUDY_ANSWER_EVALUATION`, and `STUDY_REMEDIATION` with deterministic rule-based fallbacks.
- **Curriculum Pinning**: Permanent immutability of approved `SyllabusVersion` at session creation.

---

## 3. Files Added and Modified
### Added
- [StudySession.js](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/server/src/models/StudySession.js): Core domain model with `studyTurnSchema` and `evaluationStateSchema`.
- [stateMachine.js](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/server/src/study/stateMachine.js): Central transition validator and pause invariants.
- [studyPrompts.js](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/server/src/study/prompts/studyPrompts.js): Grounded prompt builders for questions, evaluation, and remediation.
- [studyAiService.js](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/server/src/study/services/studyAiService.js): AI Gateway runner, schema normalizer, concept whitelist filter, authoritative adversarial signal grounding, and deterministic fallbacks.
- [studyService.js](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/server/src/study/services/studyService.js): Domain aggregate service managing leases, optimistic concurrency, fail-closed transactions, and idempotency.
- [studyController.js](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/server/src/controllers/studyController.js): REST controller for study endpoints.
- [studyRoutes.js](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/server/src/routes/studyRoutes.js): Express routes mounted on `/api/v1`.
- [studySession.test.js](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/server/tests/studySession.test.js): 26 automated test scenarios covering concurrency, fencing, idempotency, adversarial signal grounding, fail-closed transactions, and pedagogy.
- [verify_phase08_live.js](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/server/scripts/verify_phase08_live.js): 19-gate fail-closed live verification script.

### Modified
- [tasks.js](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/server/src/ai/schemas/tasks.js): Registered `STUDY_QUESTION_GENERATION`, `STUDY_ANSWER_EVALUATION`, `STUDY_REMEDIATION`.
- [modelRouter.js](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/server/src/ai/router/modelRouter.js): Configured task-to-provider preference chains.
- [app.js](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/server/src/app.js): Mounted `studyRouter`.

---

## 4. REST APIs Implemented

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/topics/:topicId/study/sessions` | Create new session or resume active session (pins syllabus) | 201, 200, 404, 401 |
| `GET` | `/api/v1/study-sessions` | List user's active and recent study sessions | 200, 401 |
| `GET` | `/api/v1/study-sessions/:id` | Retrieve full study session document including turn history | 200, 404, 401 |
| `POST` | `/api/v1/study-sessions/:id/answer` | Submit answer for active question (optimistic lock & fenced lease) | 200, 400, 404, 409 |
| `POST` | `/api/v1/study-sessions/:id/continue` | Advance session (`ADVANCING` $\rightarrow$ next question; `REMEDIATING` $\rightarrow$ follow-up; completed topic $\rightarrow$ `COMPLETED`) | 200, 400, 404, 409 |
| `POST` | `/api/v1/study-sessions/:id/pause` | Pause session (allowed from `QUESTIONING`, `REMEDIATING`, `RECHECKING`) | 200, 400, 404, 409 |
| `POST` | `/api/v1/study-sessions/:id/resume` | Resume session to exact `pausedFromStatus` | 200, 400, 404 |
| `POST` | `/api/v1/study-sessions/:id/exit` | Terminate study session (`status: 'EXITED'`) | 200, 400, 404 |

---

## 5. Data Model (`StudySession`)
- `userId`, `subjectId`, `topicId`: Tenant-isolated relational anchors.
- `syllabusVersionId`, `syllabusVersionNumber`: Pinned approved syllabus version (immutable).
- `status`: State enum (`ORIENTING`, `QUESTIONING`, `ANSWER_PENDING`, `EVALUATING`, `REMEDIATING`, `RECHECKING`, `ADVANCING`, `COMPLETED`, `PAUSED`, `EXITED`).
- `pausedFromStatus`: Exact prior state before pause.
- `isActive`: Boolean flag (`true` for all non-terminal active states; `false` on `COMPLETED` and `EXITED`).
- `sessionVersion`: Monotonic integer for optimistic concurrency locking.
- `sequenceCounter`: Monotonic integer index for turn numbering.
- `activeQuestion`: Active prompt with `expectedReasoningSignals` and `targetConceptIds`.
- `evaluationState`: Single-slot tracker with `operationId`, `leaseExpiresAt`, `answerFingerprint`, `lastError`.
- `turns`: Array of `StudyTurn` subdocuments.
- `metrics`: Local counters (`correctCount`, `partiallyCorrectCount`, `incorrectCount`, `remediationsCount`, `demonstratedConceptIds`, `strugglingConceptIds`).

### Database Constraint
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

---

## 6. State Machine & Transitions

```
QUESTIONING ──[Submit Answer]──► ANSWER_PENDING ──► EVALUATING
     ▲                                                │
     │                 ┌──────────────[Advance]───────┤
     │                 ▼                              ▼
     └──[Continue]── ADVANCING                   REMEDIATING
           │ (All Concepts Demonstrated)              │ [Continue]
           ▼                                          ▼
       COMPLETED                                 RECHECKING ──[Follow-Up Answer]──► ANSWER_PENDING
```

---

## 7. Concurrency Model
- **`sessionVersion` Optimistic Locking**: Every mutation requires matching `sessionVersion`.
- **Double Submit Race Resolution**: Request A matches version $N$, atomically claims the answer submission, and increments version to $N + 1$. Concurrent Request B matching version $N$ affects 0 documents and fails closed with HTTP 409 `STALE_STUDY_STATE`.

---

## 8. Idempotency Model
- **Historical Idempotency via `StudySession.turns`**:
  - Same `clientTurnId` + matching payload (`questionId` + SHA-256 fingerprint) $\rightarrow$ Returns stored turn (HTTP 200).
  - Same `clientTurnId` + conflicting payload $\rightarrow$ Rejects with HTTP 409 `IDEMPOTENCY_KEY_REUSE_CONFLICT`.
  - Replay after later turns $\rightarrow$ Returns stored turn without rewinding session state.

---

## 9. Lease Fencing & Stale Worker Protection
- `evaluationState.operationId` acts as the authoritative fencing token.
- Initial submission atomically sets `operationId_A` and a 30s lease.
- If Worker A experiences lag and its lease expires, Worker B takes over and claims `operationId_B`.
- Every database completion/failure write conditionally checks `'evaluationState.operationId': currentOperationId`.
- When Worker A returns late, its commit matches `0` documents (`matchedCount === 0`), logs `STALE_EVALUATION_WORKER_DISCARDED`, and exits harmlessly without overwriting Worker B's result.

---

## 10. AI Gateway Integration & Whitelist Enforcement
- Generates structured active recall prompts using `aiGateway.generate({ task: AI_TASK_TYPES.STUDY_QUESTION_GENERATION, ... })`.
- Server-authoritative concept whitelist and signal grounding: queries `Concept.find({ userId, topicId })`, matches candidate signals strictly to canonical concept full names and aliases, and synthesizes authoritative reasoning signals directly from canonical concept evidence.

---

## 11. Fallback Behavior
- AI provider failure $\rightarrow$ ModelRouter fallback $\rightarrow$ Deterministic rule-based fallbacks (`_buildDeterministicQuestion`, `_buildDeterministicEvaluation`, `_buildDeterministicRemediation`).
- Catastrophic error recovery: sets `evaluationState.status = 'FAILED'`, logs `lastError`, and safely restores session to `QUESTIONING` (for initial question) or `RECHECKING` (for follow-up), ensuring the session is **never** stranded in `EVALUATING`.

---

## 12. Syllabus Pinning
- At session creation, if `SyllabusVersion.findOne({ subjectId, userId, status: 'approved' })` exists, `syllabusVersionId` and `syllabusVersionNumber` are pinned.
- The session remains permanently pinned to that version throughout its lifecycle. Subsequent syllabus approvals or revisions do not alter the active session.

---

## 13. Automated Test Suite (`server/tests/studySession.test.js`)
- 26 comprehensive test scenarios covering all pedagogical states, real Promise.all concurrency races, single-turn database invariants for identical clientTurnId requests, lease fencing, idempotency key reuse conflict handling, adversarial signal filtering, and fail-closed transactions.

---

## 14. Test Totals
- Total test files: **13 passed (13/13)**
- Total tests: **231 passed (231/231)**
- Test execution duration: **~3.5s**

---

## 15. Live Verification Results (`verify_phase08_live.js`)
- All **19/19 live verification gates passed** against live Express dev server, MongoDB Atlas replica set, and AI Gateway:
  - `[1/19]` `[HTTP API]` Health & Database Connectivity Check
  - `[2/19]` `[DATABASE]` MongoDB Atlas Replica Set Connection
  - `[3/19]` `[DATABASE]` Multi-Document Transaction Support & Partial Unique Index (`{ isActive: true }`) Assertion
  - `[4/19]` `[DATABASE]` Isolated Test Tenant & Canonical Knowledge Setup
  - `[5/19]` `[DOMAIN-SERVICE & DATABASE]` Real Live Concurrent Active-Session Creation Race (`TestSyncBarrier(2)` on MongoDB Atlas)
  - `[6/19]` `[DOMAIN-SERVICE]` Verify Session Ownership & Curriculum Pinning
  - `[7/19]` `[AI GATEWAY & DOMAIN]` Authoritative Adversarial Reasoning-Signal Validation & Whitelist Grounding
  - `[8/19]` `[HTTP API]` Submit Incomplete/Weak Answer
  - `[9/19]` `[AI GATEWAY]` Multi-Criteria Answer Evaluation
  - `[10/19]` `[PEDAGOGY]` Socratic Remediation Loop (No Blind Advance)
  - `[11/19]` `[HTTP API]` Submit Socratic Follow-Up Answer (`attemptType: FOLLOW_UP`, `parentTurnId` linked)
  - `[12/19]` `[PEDAGOGY]` Demonstrated Understanding & Advancement
  - `[13/19]` `[HTTP API]` Fetch Next Question (`POST /continue`)
  - `[14/19]` `[DOMAIN-SERVICE CONCURRENCY]` Real Live Atlas Concurrency Race (Duplicate Answer Submissions)
  - `[15/19]` `[LEASE FENCING & RECOVERY]` Authoritative Lease Takeover & Stale Worker Rejection (matching `EVALUATING` status)
  - `[16/19]` `[HTTP API]` Cross-Tenant Security Isolation (HTTP 404)
  - `[17/19]` `[AI GATEWAY]` Real Live Evaluation Failure Recovery & Non-Stranding Pedagogy on MongoDB Atlas
  - `[18/19]` `[LIFECYCLE & DATABASE]` Real Application Completion Path (`continueSession` $\rightarrow$ `COMPLETED`, `isActive: false`) and Exited Invariants
  - `[19/19]` `[TEARDOWN]` Immutability-Safe Native Driver Teardown

---

## 16. Problems Discovered
1. `validateStateTransition`: General transition check was executing before specific pause error code evaluation (`CANNOT_PAUSE_DURING_EVALUATION`).
2. Concurrency Barrier: Synchronization barrier was called after atomic update instead of before, causing the losing request to throw before releasing the barrier.
3. UUID Package Dependency: Module resolution failed on external `uuid` import.
4. MongoDB `$nin` Partial Index Unsupported: Replaced with explicit `isActive: Boolean` flag with `partialFilterExpression: { isActive: true }`.

---

## 17. Fixes Applied
1. Reordered pause checks in `stateMachine.js` to return `409 CANNOT_PAUSE_DURING_EVALUATION` when pausing from `EVALUATING` or `ANSWER_PENDING`.
2. Repositioned barrier synchronization in `submitAnswer` directly before atomic `findOneAndUpdate` execution.
3. Switched to Node.js standard built-in `crypto.randomUUID()`.
4. Migrated to `{ isActive: true }` partial index and updated creation, completion, and exit lifecycles to maintain `isActive: false` on terminal states.

---

## 18. Limitations
- Study Mode is strictly session-local in Phase 08. Long-term mastery curves and spaced repetition scheduling are reserved for Phase 09.
- Study Mode does not directly mutate canonical notes (Phase 07 remains sealed).

---

## 19. Security Considerations
- Strict tenant isolation on all session endpoints (`StudySession.findOne({ _id, userId })`).
- Constant-time answer hashing (`SHA-256`) for tamper detection.
- Rate limiting and maximum answer payload capping (20,000 characters).

---

## 20. Interview Explanation
*“In LearnForge, normal chat allows students to passively ask questions, but Study Mode reverses this dynamic: the AI acts as a rigorous pedagogical tutor. When a student enters a topic, the session pins the approved syllabus and canonical concepts. The AI presents free-response questions grounded in explicit reasoning signals. If a student's answer has conceptual gaps or misconceptions, the state machine enters a Socratic remediation loop rather than advancing blindly. Turn attempts are preserved hierarchically without overwriting history. Concurrency is protected via optimistic version locking and authoritative lease fencing with unique operation tokens.”*

---

## 21. Interview Questions and Answers
- **Q**: How does the system handle concurrent answer submissions from multiple browser tabs?
  - **A**: The session uses optimistic concurrency via `sessionVersion`. Request A atomically updates the state and increments the version to $N+1$. Request B presenting stale version $N$ matches 0 documents and receives an HTTP 409 `STALE_STUDY_STATE`.
- **Q**: How are stale AI worker completions prevented after a lease expires?
  - **A**: Every evaluation operation generates an authoritative `operationId` token. When a lease expires and a new worker takes over, the new worker updates the document with `operationId_B`. When the stale worker returns, its final write conditions on `operationId_A`, matching 0 documents and discarding its stale payload safely.

---

## 22. Exact Commit SHA
- Plan Authorization Base: `2172716567fa901bb1d1a6cfc84d5bae892a9f14`
- Final Implementation Commit: `d5dd57422602708c5b4da604b0eaf90a0dc0510d`

---

## 23. Git Synchronization State
- `main` branch synchronized with `origin/main`.

---

## 24. Gmail OTP Investigation

### SMTP Configuration State
- **Provider (`EMAIL_PROVIDER`)**: `smtp`
- **SMTP Host (`SMTP_HOST`)**: `smtp.gmail.com`
- **SMTP Port (`SMTP_PORT`)**: `465` (SSL) / `587` (STARTTLS)
- **SMTP Secure (`SMTP_SECURE`)**: `true`
- **Configured Username (`SMTP_USER`)**: `PRESENT`
- **Configured Password (`SMTP_PASS`)**: `PRESENT` (16-character string)
- **Sender Address (`EMAIL_FROM`)**: `PRESENT`

### Runtime Diagnostic & Verification Outcome
- **Transporter Initialization**: `VERIFIED` (Nodemailer successfully creates transport).
- **Transporter Verification Result**: `VERIFIED` (Authenticated with Gmail SMTP `smtp.gmail.com:465` with SSL/TLS).
- **Live Dispatch Verification Result**: `VERIFIED` (Real OTP dispatch tested via `emailService.sendOtpEmail`, message accepted by Google SMTP with unique `messageId` and `250 2.0.0 OK`).

### Credential Gate Status
- **Status**: Live Gmail SMTP email OTP delivery is 100% operational and verified.

---

### Section 25: Architectural Refinements & Reliability Enhancements

1. **MongoDB Multi-Document Transaction Support & Single-Document Atomicity**:
   - `StudySession.updateOne` with query fencing (`operationId`, `sessionVersion`, `status`) guarantees atomic document updates.
   - `runInTransaction` operates in fail-closed mode in production/live environments (`TRANSACTION_UNAVAILABLE`), serving as defensive infrastructure for cross-collection invariants.
2. **State Machine Lifecycle Lockstep**:
   - Explicit `ANSWER_PENDING -> EVALUATING` transitions guarantee `StudySession.status` and `evaluationState.status` remain strictly synchronous.
3. **Database-Level Active Session Creation Race Safety**:
   - Compound partial unique index `{ userId: 1, topicId: 1 }` with `partialFilterExpression: { isActive: true }` prevents duplicate active session creation races at the database level on MongoDB Atlas.
4. **Authoritative Reasoning Signal Filtering**:
   - `studyAiService.groundExpectedReasoningSignals` filters arbitrary/hallucinated model signals against canonical concept terms and synthesizes authoritative signals directly from concept definitions when invalid.
5. **Full Test Suite Status**:
   - **231 / 231 automated backend tests passing (100%)** across 13 test files.
   - **19 / 19 live verifier gates passed (100%)** on MongoDB Atlas replica set.

---

## 26. Phase 08 Checkpoint 3 — Frontend Implementation Report

### A. Objective & Design Philosophy
The Checkpoint 3 objective was to construct a calm, professional, high-utility Study Mode frontend workspace that directly interfaces with the authoritative Phase 08 backend APIs without altering backend invariants or inventing client-side state.

In accordance with LearnForge product principles:
- Strictly avoided decorative/gamified fluff: no neons, no glassmorphism, no glowing borders, no fake streaks, and no fabricated mastery stats.
- Built a serious, distraction-free knowledge workspace focused on active recall reasoning, clear pedagogical evaluation, Socratic remediation, and accessible keyboard ergonomics (WCAG AA).

### B. Frontend Architecture & Component Decomposition
1. **API Client Layer ([studyApi.js](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/client/src/api/studyApi.js))**:
   - Direct integration with all 8 backend endpoints: `createOrResumeSession`, `listSessions`, `getSession`, `submitAnswer`, `continueSession`, `pauseSession`, `resumeSession`, `exitSession`.
2. **Workspace Header ([StudyHeader.jsx](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/client/src/components/study/StudyHeader.jsx))**:
   - Renders topic title, state badge (`QUESTIONING`, `REMEDIATING`, `RECHECKING`, `ADVANCING`, `PAUSED`, `COMPLETED`, `EXITED`), pinned syllabus badge (`Syllabus v# (Pinned)`), session version (`v#`), turn history toggle, pause/resume actions, and exit modal with confirmation.
3. **Active Question Card ([QuestionCard.jsx](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/client/src/components/study/QuestionCard.jsx))**:
   - Clear visual focal point displaying active question prompt, question type badge, target concepts, and pedagogical guidance.
4. **Answer Composer ([AnswerComposer.jsx](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/client/src/components/study/AnswerComposer.jsx))**:
   - Comfortable textarea with 20,000 character maximum counter, keyboard submission shortcut (`Ctrl+Enter` / `Cmd+Enter`), disabled/evaluating indicators during in-flight evaluation, and stable `clientTurnIdRef` generation to maintain idempotency across network retries and re-renders.
5. **Structured Evaluation Card ([EvaluationCard.jsx](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/client/src/components/study/EvaluationCard.jsx))**:
   - Displays authentic backend evaluation: verdict badge (`CORRECT`, `PARTIALLY_CORRECT`, `INCORRECT`, `UNCERTAIN`), percentage scores (correctness, completeness), recap of submitted explanation, tutor analysis prose, key strengths, improvement areas, missing concepts, and advance button when in `ADVANCING` state.
6. **Socratic Remediation Card ([RemediationCard.jsx](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/client/src/components/study/RemediationCard.jsx))**:
   - Active when in `REMEDIATING` state; presents tutor conceptual hint, follow-up question probe preview, and "Answer Follow-Up Question" button to transition to `RECHECKING`.
7. **Turn History Drawer ([TurnHistory.jsx](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/client/src/components/study/TurnHistory.jsx))**:
   - Collapsible chronological history preserving `INITIAL` vs `FOLLOW_UP` turn distinction, recorded prompts, submitted student answers, and tutor evaluations.
8. **Session Completion Card ([StudyCompletedCard.jsx](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/client/src/components/study/StudyCompletedCard.jsx))**:
   - Terminal completion view showing genuine session-local metrics returned by backend (`totalQuestionsAsked`, `totalAnswersSubmitted`, `correctCount`, `remediationsCount`) with actions to start a new session or return to topics overview.
9. **Session Exited Card ([StudyExitedCard.jsx](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/client/src/components/study/StudyExitedCard.jsx))**:
   - Terminal sealed indicator confirming session exit.
10. **Workspace Container Page ([StudyPage.jsx](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/client/src/pages/StudyPage.jsx))**:
    - Central container managing session lifecycle, topic selector / session launcher, URL query synchronization (`sessionId`, `topicId`), concurrency reconciliation (`HTTP 409 STALE_STUDY_STATE`), and evaluation crash recovery.

### C. Concurrency, Idempotency & Draft Preservation Handling
- **Draft Preservation Across 409 Conflict Reconciliation**:
  - The student's typed reasoning draft is maintained in client state (`draftsByQuestion[questionId]`), indexed by question ID.
  - When an HTTP 409 `STALE_STUDY_STATE` response is returned, the frontend informs the user with an alert ("*Your study session changed in another tab. Refreshing the latest session state.*") and fetches the latest authoritative session.
  - If the logical active question remains the same, the composer textarea preserves the exact typed text and retains the stable `clientTurnId`.
  - The draft is cleared only when an answer is successfully evaluated/advanced or when a genuinely new question arrives.
- **Stable Client Idempotency (`clientTurnId`)**:
  - Generated once per active question attempt via `getClientTurnId(questionId)` and stored in a stable reference.
  - Component re-renders, prop updates, and 409 conflict reconciliation retries reuse the exact same `clientTurnId`.
  - A genuinely new question generates a brand-new turn ID and renders an empty composer.
- **Single-Flight Session Initiation**:
  - The URL search parameters (`urlSessionId`, `urlTopicId`) serve as the single authoritative routing trigger.
  - "Start New Session on Topic", topic selector dropdown, and recent session clicks update search parameters without issuing redundant direct API calls, protected by in-flight initiation locks (`inFlightInitiationRef`).

### D. Accessibility Implementation (WCAG AA)
- Semantic HTML tags (`<header>`, `<section>`, `<form>`, `<textarea>`, `<button>`).
- Descriptive `aria-label`, `aria-expanded`, `aria-labelledby`, `aria-live="polite"`, `role="status"`, and `role="alert"` attributes.
- Full keyboard ergonomics: `Ctrl+Enter` / `Cmd+Enter` answer submission, accessible Escape dialog handling, visible focus rings, and high contrast typography.

### E. Frontend Automated Test Suite ([Study.test.jsx](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/client/src/pages/Study.test.jsx))
18 comprehensive unit & integration tests covering:
1. Topic session launcher when no session is active.
2. Active recall prompt and answer composer in `QUESTIONING` state.
3. Answer submission with `questionId`, `sessionVersion`, and stable `clientTurnId`.
4. Keyboard shortcut (`Ctrl+Enter`) for answer submission.
5. Evaluation card rendering in `ADVANCING` state.
6. Advancement to next question via Continue button.
7. Socratic remediation card rendering in `REMEDIATING` state.
8. Transition to `RECHECKING` and Socratic follow-up display.
9. Completion screen with genuine session metrics on `COMPLETED`.
10. Paused screen and resume action on `PAUSED`.
11. Terminal screen on `EXITED`.
12. Session reconciliation on HTTP 409 stale `sessionVersion` conflict.
13. Evaluation crash recovery handling (`EVALUATION_FAILED_RETRY_SAFE`).
14. Session turn history toggle and turn expansion.
15. Pause session action in workspace header.
16. Preservation of student draft answer across 409 reconciliation and reuse of stable `clientTurnId` on retry.
17. Clearing composer draft and generating a fresh `clientTurnId` when a genuinely new question becomes active.
18. Single-flight initiation ensuring "Start New Session on Topic" calls `studyApi.createOrResumeSession` exactly once.

### F. Verification & Test Metrics
- **Client Test Suite**: **70 / 70 tests passing (100%)** across 7 test files.
- **Backend Test Suite**: **231 / 231 tests passing (100%)** across 13 test files.
- **Total Monorepo Suite**: **301 / 301 tests passing (100%)** across 20 test files.
- **Vite Production Build**: Succeeded cleanly (`dist/assets/index-CyhNbbdP.js`, `dist/assets/index-1glz1KBs.css`).
- **Live Browser Verification**: End-to-end user journey executed against live Express backend and MongoDB database. Verified subject selection, study launch, active question prompt, real answer submission, AI evaluation card, Socratic advancement, pause/resume, and turn history drawer.

### G. Scope Boundaries & Mandatory Declarations
- **Phase 08 Checkpoint 2 remains APPROVED & SEALED.**
- **Phase 08 Checkpoint 3 is the current active checkpoint.**
- **Phase 09 NOT STARTED.**
- **Phase 10 NOT STARTED.**
- Strictly NO TypeScript / TSX introduced.
- Strictly NO note mutations or long-term mastery engine scope creep.

