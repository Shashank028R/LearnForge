# LearnForge — Engineering Implementation Log

This log is the permanent chronological engineering journal for the LearnForge project. Every phase records its objective, work performed, architectural decisions, testing, problems, and solutions.

## [Phase 08 — Checkpoint 4] Integration, Concurrency & AI Failure Verification

- **Date**: October 5, 2026
- **Status**: Completed (Integration Audit, Identical Concurrency Race, FOLLOW_UP Concurrency Race, Lease Fencing, Real AI Gateway Provider Fallback with Truthful Provenance, Catastrophic Recovery & 21/21 Live Gates Verified)
- **Phase**: Phase 08 — Strict Study Mode & Active Recall (Checkpoint 4)
- **Core Invariant**: *"Normal Chat = user asks → AI explains. Study Mode = AI teaches → asks active recall question → evaluates multi-criteria reasoning → Socratic remediation → advances on demonstrated understanding."*
- **Objective**: Prove full end-to-end integration, real identical-submission concurrency protection on MongoDB Atlas, real FOLLOW_UP concurrency protection, authoritative lease fencing, idempotency, real AI Gateway multi-provider fallback with truthful provenance, catastrophic evaluation recovery across all providers and deterministic fallback, curriculum pinning, and cross-tenant security.

### Work Performed
1. **API Contract Audit**:
   - Compared `studyApi.js` against `studyController.js` and `studyRoutes.js`. Verified all 8 endpoints match 100% on methods, routes, payloads, response envelopes, sessionVersion optimistic locking, and HTTP 409 conflict handling.
2. **Real Live Identical Logical-Submission Race (`TestSyncBarrier(2)`) (Gate 14)**:
   - Tested overlapping submissions with SAME `sessionVersion`, SAME `questionId`, SAME `clientTurnId`, and SAME answer text on MongoDB Atlas. Proved exactly 1 turn commits atomically (HTTP 200) while the race competitor rejects with HTTP 409 `STALE_STUDY_STATE`. Exactly 1 turn persisted, `totalAnswersSubmitted` incremented once, `sequenceCounter` incremented once. Replay returns `idempotent: true`; modified payload rejected with HTTP 409 `IDEMPOTENCY_KEY_REUSE_CONFLICT`.
3. **Real Live FOLLOW_UP Concurrency Race (`TestSyncBarrier(2)`) (Gate 19)**:
   - Tested overlapping follow-up submissions in `RECHECKING` state with SAME `clientTurnId` on MongoDB Atlas. Proved exactly 1 `FOLLOW_UP` turn commits with intact `parentTurnId` referencing the initial turn.
4. **Lease Fencing Verification (Gate 15)**:
   - Verified that when Worker B takes over an expired lease with `operationId_B`, late-returning Worker A with `operationId_A` matches 0 documents and fails safely without overwriting results or double-counting metrics.
5. **Real AI Gateway Provider Fallback with Truthful Provenance (Gate 17 & Backend Test 27)**:
   - *"Primary provider failed and secondary provider successfully handled the request."*
   - Explicitly injected deterministic provider failure at the primary provider (OpenAI rate limit / 429 quota exhaustion) and executed the real AI Gateway path. Verified that ModelRouter retried and seamlessly routed to secondary provider Groq (`openai/gpt-oss-20b`). Asserted structured evaluation response and truthful provenance: `source: 'ai'`, `provider: 'groq'`, `model: 'openai/gpt-oss-20b'`.
6. **Catastrophic Gateway Failure Recovery (Gate 18 & Backend Test 28)**:
   - *"All configured AI providers and deterministic fallback failed; StudySession safely exited EVALUATING and became retry-safe."*
   - Injected failure across all configured AI providers and induced failure in deterministic fallback. Verified that `evaluationState.status` transitions to `'FAILED'`, session safely restores to `QUESTIONING` (for initial attempt) or `RECHECKING` (for follow-up attempt), `activeQuestion` is preserved, no false turns or evaluations are persisted, and subsequent retry succeeds via the normal evaluation path.
7. **Testing & Build Verification**:
   - 21 / 21 Live Verification Gates passed (100%) on MongoDB Atlas replica set (`server/scripts/verify_phase08_live.js`).
   - 233 / 233 Backend Tests passing (100%) across 13 test files.
   - 70 / 70 Frontend Tests passing (100%) across 7 test files.
   - 303 / 303 Total Monorepo Tests passing (100%) across 20 test files.
   - Clean Vite production build in 15.43s.

---

## [Phase 08 — Checkpoint 3] Strict Study Mode & Active Recall Frontend

- **Date**: October 5, 2026
- **Status**: Completed (Frontend Implementation, Automated Test Suite & Browser Verification)
- **Phase**: Phase 08 — Strict Study Mode & Active Recall (Checkpoint 3)
- **Core Invariant**: *"Normal Chat = user asks → AI explains. Study Mode = AI teaches → asks active recall question → evaluates multi-criteria reasoning → Socratic remediation → advances on demonstrated understanding."*
- **Objective**: Implement the Phase 08 Strict Study Mode frontend as a calm, professional, high-utility study workspace that directly interfaces with the authoritative Phase 08 backend state machine.

### Work Performed
1. **API Client Integration (`client/src/api/studyApi.js`)**:
   - Implemented standard client bindings for all 8 Phase 08 backend endpoints: `createOrResumeSession`, `listSessions`, `getSession`, `submitAnswer`, `continueSession`, `pauseSession`, `resumeSession`, `exitSession`.
2. **Component Architecture (`client/src/components/study/`)**:
   - `StudyHeader.jsx`: Topic context, state badge (`QUESTIONING`, `REMEDIATING`, `RECHECKING`, `ADVANCING`, `PAUSED`, `COMPLETED`, `EXITED`), pinned syllabus badge (`Syllabus v# (Pinned)`), sessionVersion, pause/resume, exit dialog, turn history toggle.
   - `QuestionCard.jsx`: Visual focus displaying active recall question prompt, question type badge, target concept names, and reasoning expectations.
   - `AnswerComposer.jsx`: Keyboard-accessible textarea with live character counter (20,000 max), `Ctrl+Enter` / `Cmd+Enter` shortcut, draft text preservation across 409 conflict reconciliations, stable `clientTurnIdRef` key across network retries, and disabled states during in-flight evaluation.
   - `EvaluationCard.jsx`: Transparent pedagogical breakdown rendering verdict badge (`CORRECT`, `PARTIALLY_CORRECT`, `INCORRECT`, `UNCERTAIN`), percentage scores, submitted answer recap, tutor analysis prose, key strengths, improvement areas, missing concepts, and continue advancement button.
   - `RemediationCard.jsx`: Dedicated Socratic remediation view presenting tutor hint, follow-up probe preview, and "Answer Follow-Up Question" transition action.
   - `TurnHistory.jsx`: Collapsible chronological turn history distinguishing `INITIAL` vs `FOLLOW_UP` attempts, prompts, student answers, and evaluations.
   - `StudyCompletedCard.jsx`: Genuine session-local completion summary displaying questions asked, answers submitted, direct correct count, and remediation count.
   - `StudyExitedCard.jsx`: Terminal sealed session view.
3. **Workspace & Navigation Integration (`client/src/pages/StudyPage.jsx`, `SubjectDetailPage.jsx`, `Sidebar.jsx`, `App.jsx`)**:
   - Integrated topic launcher, URL query synchronization (`sessionId`, `topicId`), single-flight session initiation, draft preservation across HTTP 409 (`STALE_STUDY_STATE`) concurrency reconciliations, and evaluation crash recovery (`EVALUATION_FAILED_RETRY_SAFE`).
   - Added Study button directly on topic nodes in Subject Detail view and Sidebar navigation.
4. **Automated Testing & Build Verification**:
   - Added 18 comprehensive unit & integration tests in `client/src/pages/Study.test.jsx`. Total client tests: 70/70 passing (100%). Total backend tests: 231/231 passing (100%). Monorepo total: 301/301 tests passing (100%).
   - Vite production build verified and clean.
5. **Live Browser Verification**:
   - Autonomous end-to-end user journey executed against live dev server and MongoDB database, validating subject navigation, study session launch, active recall reasoning prompt, live answer submission, AI evaluation card display, Socratic follow-up advancement, pause/resume, and turn history drawer.

---

## [Phase 08 — Checkpoint 2] Strict Study Mode & Active Recall Backend

- **Date**: October 5, 2026
- **Status**: Completed (Backend Implementation & Live Verification)
- **Phase**: Phase 08 — Strict Study Mode & Active Recall
- **Core Invariant**: *"Normal Chat = user asks → AI explains. Study Mode = AI teaches → asks active recall question → evaluates multi-criteria reasoning → Socratic remediation → advances on demonstrated understanding."*
- **Objective**: Build the production-grade Strict Study Mode backend with topic-scoped study sessions, hierarchical initial and follow-up turns, authoritative lease fencing, optimistic locking, Socratic remediation loops, curriculum pinning, explicit `isActive` partial indexing, adversarial signal filtering, fail-closed transactions, and fail-closed live verification.

### Work Performed
1. **Architectural Foundations & ADR-017**:
   - Designed and documented ADR-017 (`docs/decisions/ADR-017-strict-study-mode-and-active-recall.md`) governing study session aggregates, embedded turns, single-slot evaluation tracking, operation fencing tokens, `isActive` partial indexing, and pedagogical state machine invariants.
2. **Domain Persistence Models**:
   - `server/src/models/StudySession.js`: Aggregate root managing session lifecycle, optimistic locking (`sessionVersion`), turn sequences, syllabus pinning, and partial unique index `{ userId: 1, topicId: 1 }` with `{ isActive: true }`.
   - `studyTurnSchema`: Embedded subdocument storing hierarchical initial and follow-up attempts (`attemptType: INITIAL | FOLLOW_UP`, `parentTurnId` referencing intra-session turn `_id` without `ref: 'StudyTurn'`).
   - `evaluationStateSchema`: Single-slot active operation tracker with `operationId` fencing token, crash lease timeouts (30s), and SHA-256 answer fingerprinting.
3. **Central Pedagogical State Machine (`server/src/study/stateMachine.js`)**:
   - Governs transitions across `ORIENTING`, `QUESTIONING`, `ANSWER_PENDING`, `EVALUATING`, `REMEDIATING`, `RECHECKING`, `ADVANCING`, `COMPLETED`, `PAUSED`, `EXITED`.
   - Enforces pause invariants (`CANNOT_PAUSE_DURING_EVALUATION`) and non-stranding recovery back to `QUESTIONING` / `RECHECKING`.
4. **AI Task Registration & Gateway Integration**:
   - Registered `STUDY_QUESTION_GENERATION`, `STUDY_ANSWER_EVALUATION`, and `STUDY_REMEDIATION` in `tasks.js` with preference chains in `modelRouter.js`.
   - `server/src/study/services/studyAiService.js`: Concept whitelist filtering, authoritative adversarial signal validation and canonical concept grounding (`groundExpectedReasoningSignals`), structured schema parsing, and deterministic rule-based fallbacks.
   - `server/src/study/prompts/studyPrompts.js`: Evidence-based prompt builders.
5. **Domain Service & Concurrency Control (`server/src/study/services/studyService.js`)**:
   - Optimistic concurrency control via `sessionVersion` on all mutations (including exit).
   - Fail-closed transaction infrastructure (`TRANSACTION_UNAVAILABLE`) in production/live environments, paired with single-document atomicity for session updates.
   - Race-safe active session creation handling MongoDB duplicate index exceptions under genuine concurrent load.
   - Authoritative lease takeover and stale worker rejection (`STALE_EVALUATION_WORKER_DISCARDED`).
   - Historical idempotency via persisted `turns` (`IDEMPOTENCY_KEY_REUSE_CONFLICT` on mismatched payloads).
   - Curriculum pinning: permanently bounds session scope to approved `SyllabusVersion`.
6. **REST APIs (`server/src/controllers/studyController.js` & `server/src/routes/studyRoutes.js`)**:
   - Mounted authenticated study routes under `/api/v1/study-sessions` and `/api/v1/topics/:topicId/study/sessions`.
7. **Automated & Live Verification**:
   - Added 26 unit/integration tests in `server/tests/studySession.test.js` (total 231 backend tests passing 100%).
   - Fail-closed live verification script `server/scripts/verify_phase08_live.js` fully passed all 19 verification gates against MongoDB Atlas replica set, proving genuine creation races, index enforcement, authoritative reasoning signal validation, `isActive` terminal lifecycle, and evaluation crash recovery.
8. **Gmail OTP Investigation**:
   - Live external Gmail SMTP verification successfully tested and operational (`VERIFIED`).

---

## [Phase 07] Structured Notes Engine & Immutable Versioning

- **Date**: October 5, 2026
- **Status**: Completed
- **Phase**: Phase 07 — Structured Notes Engine
- **Core Invariant**: *"Raw Conversation → Learning Evidence (LearningEvent) → Canonical Knowledge (Concept) → Structured Notes (NoteDocument & NoteVersion). Notes are synthesized from canonical concepts, topic context, and approved syllabus facts, NOT raw conversation transcripts."*
- **Objective**: Build the production-grade Structured Notes Engine for LearnForge with typed block schemas, immutable append-only version history, optimistic concurrency control, user-authored block protection, and risk-managed AI merge proposals.

### Work Performed
1. **Architectural Foundations & ADR-016**:
   - Designed and documented ADR-016 (`docs/decisions/ADR-016-structured-notes-engine.md`) governing typed block hierarchies, immutable version snapshots, optimistic concurrency control, and deterministic collision handling.
2. **Domain Persistence Models**:
   - `server/src/models/blocks/blockSchema.js`: Strictly typed pedagogical block schema supporting 9 block types (`heading`, `paragraph`, `bullet_list`, `numbered_list`, `code`, `quote`, `callout`, `table`, `divider`) with stable IDs and single authoritative provenance (`origin: 'user' | 'ai' | 'system'`).
   - `server/src/models/NoteDocument.js`: Topic-anchored note container with compound unique index `{ userId: 1, topicId: 1 }` and `currentVersionId` pointer.
   - `server/src/models/NoteVersion.js`: Append-only immutable version snapshot with compound unique index `{ noteDocumentId: 1, version: 1 }`. Immutability guards block `save()` on existing records, query updates (`updateOne`, `updateMany`, `findOneAndUpdate`, `replaceOne`, `findOneAndReplace`), query deletes (`deleteOne`, `deleteMany`, `findOneAndDelete`), and prohibited operations via `bulkWrite`.
   - `server/src/models/NoteProposal.js`: Staging model for candidate AI updates with diff computation, risk assessment, and provenance.
3. **Dedicated Notes Subsystem (`server/src/notes/`)**:
   - `risk/riskClassifier.js`: Computes structured block diff and deterministic risk classification (`LOW`, `MEDIUM`, `HIGH`). Enforces user-authored block protection (`HIGH` risk), code block invariant checks, and active concept conflict warnings.
   - `services/notesService.js`: Master orchestrator coordinating initial topic note creation, optimistic manual revisions, immutable version restores, AI note proposal synthesis, and risk-based merge approval in MongoDB multi-document transactions.
4. **AI Gateway Integration**:
   - Registered `NOTE_SYNTHESIS` task mapped to `[STRUCTURED_OUTPUT, COMPLEX_REASONING]` with `NOTE_SYNTHESIS_PROMPT_V1` and default Groq model `openai/gpt-oss-20b`.
5. **REST APIs (`server/src/controllers/notesController.js` & `server/src/routes/notesRoutes.js`)**:
   - Mounted authenticated routes under `/api/v1/notes` and `/api/v1/topics/:topicId/note` with optimistic concurrency validation and domain HTTP 409 conflict mapping (`STALE_BASE_VERSION`, `STALE_PROPOSAL_BASE`).
6. **Frontend Notes Workspace**:
   - `client/src/pages/NotesPage.jsx`: Reading canvas with topic directory, structured block rendering, version badges, and proposal review banner.
   - `client/src/components/notes/BlockRenderer.jsx`: Type-safe rendering of all 9 block variants with provenance badges.
   - `client/src/components/notes/BlockEditor.jsx`: Interactive structured block editor with live preview, block reordering, and optimistic revision saves.
   - `client/src/components/notes/VersionHistoryDrawer.jsx`: History inspector for viewing immutable snapshots and restoring versions.
   - `client/src/components/notes/ProposalReviewModal.jsx`: Risk-informed proposal diff review and approval modal.
7. **Testing & Verification**:
   - Added 37 automated unit/integration tests in `server/tests/notes.test.js` (total 204 backend tests passing 100%).
   - Added 6 frontend tests in `client/src/pages/Notes.test.jsx` (total 52 client tests passing 100%).
   - Total Monorepo Automated Tests: 256 / 256 passing (100%).
   - Fail-closed live verification script `server/scripts/verify_phase07_live.js` fully passed all 16 verification gates including real live deterministic concurrency barriers against MongoDB Atlas replica set transactions and immutability-safe native collection teardown.

---

## [Phase 06] Knowledge Extraction Engine & Pedagogical Analysis

- **Date**: October 4, 2026
- **Status**: Completed
- **Phase**: Phase 06 — Knowledge Extraction Engine & Pedagogical Analysis
- **Core Principle**: *"Chat is evidence. Knowledge is the product. Notes are the structured representation of that knowledge. AI is the pedagogical engine that evaluates and organizes it."*
- **Objective**: Build the first production-grade Knowledge Extraction Engine and Pedagogical Analysis pipeline. Transform conversational evidence into validated, auditable `LearningEvent` ledger entries and canonical `Concept` models, with deterministic state machine transitions (`NOT_STARTED` → `INTRODUCED` → `LEARNING` → `UNDERSTOOD` → `STRONG` / `NEEDS_REVIEW`), bounded confidence scoring, misconception tracking, conflict handling, and topic mastery aggregation (`Topic.knowledgeState` & `Topic.status`), while strictly respecting phase boundaries (zero `NoteDocument` / `NoteVersion` mutations).
- **Active AI Gateway Tasks**: Added `KNOWLEDGE_EVENT_EXTRACTION` mapped to `STRUCTURED_OUTPUT` and `COMPLEX_REASONING` capabilities.

### Work Performed
1. **Architectural Foundations & ADR-015**:
   - Designed and documented ADR-015 governing knowledge extraction, concept resolution, learning states, and transaction boundaries.
   - Preserved strict separation between raw conversation transcripts (evidence) and canonical knowledge state (`Concept` / `LearningEvent` / `Topic.knowledgeState`).
2. **Domain Persistence Models**:
   - `server/src/models/Concept.js`: Canonical concept model with compound unique index `{ userId: 1, topicId: 1, normalizedName: 1 }`, status tracking, bounded confidence score (0–100), evidence counts, misconceptions, and conflict state.
   - `server/src/models/LearningEvent.js`: Immutable, tenant-scoped ledger entry with compound unique index `{ userId: 1, idempotencyKey: 1 }` (`${userId}:${sourceMessageId}:${version}`), event types, classification outcomes (`NEW`, `EXISTING`, `DUPLICATE`, `COMPLEMENTARY`, `CORRECTION`, `CONFLICT`), and source attribution.
3. **Dedicated Knowledge Engine Subsystem (`server/src/knowledge/`)**:
   - `extraction/eventExtractor.js`: Calls AIGateway task `KNOWLEDGE_EVENT_EXTRACTION` consuming normalized `AIResponse` envelope (`text`, `provider`, `model`, `usage`) with JSON schema enforcement and deterministic rule-based fallback.
   - `resolution/conceptResolver.js`: Exact normalized name matching and normalized alias resolution with automatic synonym/acronym reconciliation.
   - `state/learningStateMachine.js`: Governs deterministic state transitions (`NOT_STARTED` → `INTRODUCED` → `LEARNING` → `UNDERSTOOD` → `STRONG` / `NEEDS_REVIEW`), diminishing returns confidence formula, misconception penalties (-15 to -30), recovery on correction, and topic aggregate mastery calculation.
   - `services/knowledgeEngineService.js`: Master coordinator handling tenant authorization, approved syllabus boundaries, off-topic exclusion, idempotency deduplication, and mandatory multi-document transactions. Sequential uncommitted fallback is prohibited.
4. **Chat Messaging Integration (`server/src/controllers/chatController.js`)**:
   - Wired `knowledgeEngine.processExchangeEvidence(...)` into `createChat` and `sendMessage` after successful message persistence for on-topic topic chats.
5. **Knowledge REST APIs (`server/src/controllers/knowledgeController.js` & `server/src/routes/knowledgeRoutes.js`)**:
   - Mounted `GET /api/v1/topics/:topicId/concepts`, `GET /api/v1/concepts/:conceptId`, `GET /api/v1/topics/:topicId/learning-events`, and hardened `POST /api/v1/topics/:topicId/extract-knowledge` validating server-loaded persisted Message documents.
6. **Testing & Verification**:
   - Added 35 automated unit/integration tests in `server/tests/knowledgeEngine.test.js` and 19 in `server/tests/aiGateway.test.js` (server total: 167 tests passing 100%).
   - All 46 client tests passing (client total: 46 tests passing 100%).
   - Total Monorepo Automated Tests: 213 / 213 passing (100%).
   - Live integration script `verify_phase06_live.js` fully passed all 14 fail-closed verification gates (MongoDB Atlas replica set, Express API, real application AI extraction with live Groq API `openai/gpt-oss-20b`, hard >= 3 multi-event threshold, deterministic fresh-exchange concurrent transaction race with synchronization barrier and `transaction_conflict_recovery` verification, brand-new concept `CORRECTION`/`CONFLICT` classification semantics, and correction recovery with misconception payloads).
   - Phase boundary verified: 0 `NoteDocument` / `NoteVersion` created.

---

## [Phase 05] AI Gateway, Automatic Model Routing & Pedagogical Engine

- **Date**: October 4, 2026
- **Status**: Completed
- **Phase**: Phase 05 — AI Gateway, Automatic Model Routing & Pedagogical Engine
- **Core Principle**: *"Chat is the interaction layer. Knowledge is the product. AI is the pedagogical engine."*
- **Objective**: Build the first production-grade multi-provider AI architecture for LearnForge, featuring a centralized provider-neutral AI Gateway abstraction, official concrete provider adapters (Google Gemini, OpenAI, Groq), task-based automatic model routing with zero client-side provider selection, bounded exponential backoff with jitter and fallback chains, curriculum context boundary enforcement, knowledge relevance classification without canonical knowledge pollution, safe redacted telemetry, and complete integration with the Phase 04 chat messaging pipeline.
- **Active Providers**: `gemini` (`@google/genai`), `openai` (`openai`), `groq` (`groq-sdk`).
- **Anthropic Status**: `DISABLED / DEFERRED`. Not part of active Phase 05 provider set, not called, not in fallback chains, no Anthropic credentials required.

### Work Performed
1. **Architectural Foundations & ADR-014**:
   - Decoupled all AI provider logic from controllers, domain models, and frontend components into a centralized subsystem (`server/src/ai/`).
   - Defined structured task taxonomy (`general_chat`, `pedagogical_explanation`, `syllabus_generation`, `knowledge_relevance_classification`) and mapped each to capability requirements (`text_generation`, `structured_output`, `fast_classification`, `complex_reasoning`).
   - Established server-as-sole-trust-boundary: client never chooses models or providers; routing is governed automatically and deterministically by the `ModelRouter`.
   - Codified ADR-014 explaining the centralized gateway, provider adapters, task taxonomy, error normalization, and strict separation between conversational evidence and canonical topic knowledge.
2. **AI Gateway & Provider Adapters**:
   - `server/src/ai/gateway/aiGateway.js`: Central gateway coordinating schema validation, route selection, request execution, deterministic same-provider retries with exponential backoff and jitter (`Math.min(1000, 100 * 2^attempt) + jitter`), provider fallback chains upon retry exhaustion, and telemetry recording.
   - `server/src/ai/schemas/aiRequest.js`: Validates and normalizes incoming requests into standard schema envelopes.
   - `server/src/ai/schemas/aiResponse.js`: Formats uniform, provider-agnostic response objects with routing metadata, token usage, latency, and request IDs.
   - `server/src/ai/providers/baseProvider.js`: Base adapter class with health state tracking (healthy/degraded), failure counters, and standardized error normalization (`AIAuthenticationError`, `AIInvalidRequestError`, `AIRateLimitedError`, `AITimeoutError`, `AIProviderUnavailableError`).
   - `server/src/ai/providers/geminiProvider.js`: Adapter for Google Gemini models using official `@google/genai` (v2.27.0).
   - `server/src/ai/providers/openaiProvider.js`: Adapter for OpenAI models using official `openai` (v7.27.0).
   - `server/src/ai/providers/groqProvider.js`: Adapter for Groq models using official `groq-sdk` (v1.6.0). Configured default model `openai/gpt-oss-20b`.
   - `server/src/ai/router/modelRouter.js`: Automatic task-based router selecting optimal providers by capability matching, health status, and fallback chains:
     - `general_chat`: `gemini` → `groq` → `openai`
     - `pedagogical_explanation`: `openai` → `gemini` → `groq`
     - `syllabus_generation`: `openai` → `gemini` → `groq`
     - `knowledge_relevance_classification`: `groq` → `gemini` → `openai`
   - `server/src/ai/telemetry/aiTelemetry.js`: Structured request logging and token metrics tracking with strict redaction of API keys, authorization headers, and raw user conversation bodies.
3. **Prompt Architecture & Curriculum Context Isolation**:
   - Centralized prompt registry in `server/src/ai/prompts/promptRegistry.js`:
     - `generalLearningPrompt.js`: Socratic, patient, and pedagogically structured guidance.
     - `pedagogicalExplanationPrompt.js`: Deep explanations with intuition, mechanics, misconceptions, and active recall checks.
     - `syllabusGenerationPrompt.js`: Structured curriculum JSON generation.
     - `knowledgeRelevanceClassificationPrompt.js`: Fast semantic classification of relevance against active curriculum.
   - **Curriculum Context Isolation**: Prompt assembly strictly queries approved syllabi (`status: 'approved'`). Draft and superseded versions are never injected as authoritative context.
4. **Chat Integration & Knowledge Relevance Governance**:
   - Updated `server/src/controllers/chatController.js`:
     - `sendMessage` and `createChat` invoke `generateAIExchange` through the AI Gateway.
     - Populates `knowledgeContext: { relevance, disposition, subjectId, topicId }` on assistant messages.
     - Off-topic inquiries receive helpful answers, but their `knowledgeContext.relevance` is marked `off_topic` and `disposition` is set to `excluded`, preserving conversational evidence while strictly preventing canonical note or topic knowledge pollution.
     - Implemented graceful offline Socratic engine fallback when external API keys are unconfigured or providers fail.
   - Mounted `aiMessageRateLimiter` (30 req/min per IP) on chat message generation endpoints.
5. **Frontend Polish (`client/src/pages/ChatsPage.jsx`)**:
   - Added assistant thinking skeleton during AI generation (`isSending`).
   - Added retry affordance on failed user messages.
   - Rendered off-topic warning banner strictly from backend metadata (`knowledgeContext.relevance === 'off_topic'`).
   - Displayed calm pedagogical task metadata on assistant message bubbles.
6. **Testing & Verification**:
   - Added 17 comprehensive unit and integration tests in `server/tests/aiGateway.test.js` covering schema normalization, provider adapters, task-based routing, Groq generation and classification parsing, same-provider retry with backoff, fallback after retry exhaustion, non-retryable handling, prompt assembly, and telemetry (server total: 130 tests passing 100%).
   - All 46 frontend tests in `client/` passing (client total: 46 tests passing 100%).
   - Total Monorepo Tests: 176 automated tests passing.
   - Clean Vite production build (`dist/` generated cleanly with 0 errors).
   - Live integration script `verify_phase05_live.js` (Fail-Closed) fully verified against running backend (`http://localhost:5000`), MongoDB Atlas cluster, and live Groq API.
   - External Live Provider Status:
     - Gemini: `CONFIGURED` / `IMPLEMENTED — BLOCKED / NOT LIVE-VERIFIED`
     - OpenAI: `CONFIGURED` / `IMPLEMENTED — BLOCKED / NOT LIVE-VERIFIED`
     - Groq: `LIVE-VERIFIED` (Tested live with `GROQ_API_KEY` and `openai/gpt-oss-20b`, exact marker `"LearnForge Groq Live Verified"` verified)
     - Anthropic: `DISABLED / DEFERRED` (Not part of active Phase 05 provider set)

---

## [Phase 04.1] Syllabus & Knowledge Governance Foundation

- **Date**: October 4, 2026
- **Status**: Completed
- **Phase**: Phase 04.1 — Syllabus & Knowledge Governance Foundation
- **Core Principle**: *"Chat is the interaction layer. Knowledge is the product."*
- **Objective**: Establish the product, data, and UX foundations for multi-version syllabus lifecycle management, explicit user approval, canonical topic reconciliation with stable Topic `_id` preservation, off-topic message categorization contracts, and lightweight user annotations (comments and tags), prior to downstream AI Gateway integration in Phase 05.

### Work Performed
1. **Architectural Foundations & ADR-013**:
   - Codified distinct semantic boundaries across 7 layers: raw conversation evidence, draft syllabus, approved canonical syllabus, topic-related knowledge candidates, canonical topic knowledge, off-topic conversations, and user annotations.
   - Enforced non-blocking subject creation: subjects begin in `no_syllabus` state with `topicsCount = 0` without requiring an approved syllabus.
   - Adopted multi-version immutable syllabus history (`SyllabusVersion`) with drafts, explicit approval, and superseded state tracking.
   - **Single Active Approved Invariant & End-to-End Concurrency Safety**: Structurally guaranteed at the MongoDB storage engine level via a Partial Unique Index `{ subjectId: 1, status: 1 }` (`unique: true, partialFilterExpression: { status: 'approved' }`). End-to-end atomicity is strictly enforced via multi-document ACID transactions (`session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } })`) wrapping version superseding, target approval, canonical topic reconciliation, active count calculation, and `Subject.activeSyllabusVersionId` / `Subject.topicsCount` updates in a single isolated transaction with automated retry on transient write conflicts (`WriteConflict` code 112, E11000). Transaction support (MongoDB replica set or MongoDB Atlas) is a mandatory prerequisite; standalone instances without replica sets return HTTP 503.
2. **Domain Persistence & Models**:
   - `server/src/models/SyllabusVersion.js`: `subjectId`, `userId`, `version`, `status` (`draft` | `approved` | `superseded`), `sections` (with nested `topics`), `source`, `changeSummary`, `approvedAt`, `supersededAt`. Partial unique index `{ subjectId: 1, status: 1 }` (`status: 'approved'`) and compound unique index `{ subjectId: 1, version: 1 }`.
   - `server/src/models/Annotation.js`: `userId`, `chatId`, `messageId`, `type` (`comment` | `tag`), `content`. Indexed on `{ userId: 1, chatId: 1, messageId: 1 }`.
   - `server/src/models/Topic.js`: Added `isActiveInSyllabus` (default: `false`, indexed) for active vs historical curriculum membership.
   - Updated `Subject.js`: Added `syllabusStatus` (`no_syllabus` | `draft` | `approved`) and `activeSyllabusVersionId`.
   - Updated `Message.js`: Added `knowledgeContext` schema fields (`relevance`, `subjectId`, `topicId`, `disposition`).
3. **REST APIs, Topic Lifecycle & Cascade Cleanup**:
   - `server/src/controllers/syllabusController.js`: `getSyllabusStatus`, `listSyllabusVersions`, `createSyllabusDraft`, `getSyllabusVersion`, `updateSyllabusDraft`, `approveSyllabusVersion`, `reconcileCanonicalTopics`.
   - **Active vs. Historical Topic Reconciliation**: `approveSyllabusVersion` reconciles canonical topics by normalized title, marking active syllabus topics with `isActiveInSyllabus: true`, preserving stable `_id`s, descriptions, `notesCount`, `chatsCount`, and `knowledgeState`. Topics omitted in the newly approved version are preserved as historical (`isActiveInSyllabus: false`) rather than deleted. Topics re-added in future versions are reactivated (`isActiveInSyllabus: true`).
   - **Subject Topics Count Contract**: `Subject.topicsCount` strictly maintains the count of **active syllabus topics** (`Topic.countDocuments({ subjectId, userId, isActiveInSyllabus: true })`). Manually created topics before syllabus approval default to `isActiveInSyllabus: false` and `Subject.topicsCount` remains `0` until an approved syllabus governs them.
   - **Full Cascading Deletions**: Subject deletion purges all linked `Topic`, `Chat`, `Message`, `SyllabusVersion`, and `Annotation` documents. Chat and Topic deletions cascade removal of linked annotations.
   - `server/src/controllers/annotationController.js`: Full CRUD for user-authored comments and tags.
   - `server/src/routes/syllabus.js` & `server/src/routes/annotations.js`: Protected with `requireDatabase` and `authenticateUser`.
4. **Interactive UI & Accessibility**:
   - `client/src/hooks/useFocusTrap.js`: Fixed critical bug where keystroke re-renders caused focus jumps to dialog close buttons by isolating `onClose` callbacks in refs and prioritizing autofocus elements.
   - `client/src/pages/SubjectDetailPage.jsx`: Full syllabus governance panel with status badges, multi-version history, draft editor with section/topic management, historical/retired topic badges, and explicit approval confirmation modals.
   - `client/src/pages/ChatsPage.jsx`: Rendered off-topic warning alerts strictly from backend `knowledgeContext.relevance === 'off_topic'` (zero client heuristics) and integrated inline comment/tag annotations.
   - `client/src/api/syllabusApi.js` & `client/src/api/annotationsApi.js`: Frontend API clients.
5. **Testing & Live Verification**:
   - 18 automated backend tests across `syllabus.test.js` and `annotations.test.js` including genuine concurrent approval tests and adversarial delayed-interleaving tests (server total: 113 tests passing 100%).
   - 6 automated frontend tests in `SyllabusGovernance.test.jsx` (client total: 46 tests passing 100%).
   - Total Monorepo Tests: 159 automated tests passing.
   - Clean Vite production build.
   - Live integration script `verify_phase04_1_live.js` fully exercising real Express HTTP APIs (`http://localhost:5000`) against remote MongoDB Atlas replica set, including live adversarial delayed-worker interleaving where stale worker transactions cleanly abort with `WriteConflict` and prevent stale mutator state corruption. All 8 database invariants verified with 100% pass rate.

---

## [Phase 04] Chat Infrastructure

- **Date**: October 4, 2026
- **Status**: Completed — Hardened
- **Phase**: Phase 04 — Chat Infrastructure
- **Core Principle**: *"Knowledge is the product. Conversations are evidence."*
- **Objective**: Build durable Chat and Message infrastructure in MongoDB, enforce deterministic chronological sequence indexing with duplicate-key collision recovery, strict message role trust boundaries, full CRUD and safe topic/subject reassignment REST APIs, and an accessible, responsive two-pane UI workspace, while establishing clean forward-compatibility for downstream AI Gateway routing (Phase 05), knowledge extraction (Phase 06), and note synthesis (Phase 07).

### Work Performed
1. **Architectural Foundations & ADR-012**:
   - Evaluated embedded messages vs. normalized `Chat` and `Message` collections.
   - Adopted normalized collections with denormalized `userId` on both models and compound unique indexing `{ chatId: 1, sequenceIndex: 1 }` (ADR-012).
   - Designed schema readiness with `metadata: {}` for downstream tokens, model parameters, sources, and citations.
2. **Domain Persistence & Models**:
   - Created `server/src/models/Chat.js`: `userId`, `subjectId` (optional), `topicId` (optional), `title` (max 200), `status` (`active` | `archived`), `messagesCount`, `lastMessageAt`, `metadata`. Indexes: `{ userId: 1, status: 1, lastMessageAt: -1 }`, `{ userId: 1, topicId: 1, lastMessageAt: -1 }`, `{ userId: 1, subjectId: 1, lastMessageAt: -1 }`.
   - Created `server/src/models/Message.js`: `chatId`, `userId`, `role` (`user` | `assistant` | `system`), `content` (max 20,000), `sequenceIndex`, `status` (`sent` | `delivered` | `error`), `metadata`. Indexes: unique `{ chatId: 1, sequenceIndex: 1 }`, `{ userId: 1, chatId: 1 }`.
3. **REST APIs, Reassignment & Role Trust Boundary**:
   - `server/src/controllers/chatController.js`: Handlers for `listChats`, `createChat` (with optional `initialMessage` and deterministic Socratic preview), `getChat` (with count reconciliation), `updateChat` (`PUT` / `PATCH` supporting safe `subjectId` and `topicId` reassignment, ownership checks, consistency validation, and `Topic.chatsCount` maintenance), `deleteChat`, `listMessages`, `sendMessage`.
   - Hardened `sendMessage`: Enforced Message Role Trust Boundary (client messages must use `role: "user"`, rejecting `assistant` and `system` roles with 400 `VALIDATION_ERROR`). Implemented concurrency-safe sequence allocation retry loop on duplicate key collisions (code 11000).
   - `server/src/routes/chats.js`: Protected via `requireDatabase` and `authenticateUser`.
   - Updated `subjectController.js` and `topicController.js` for cascading deletions of associated chats/messages and reconciliation of `Topic.chatsCount`.
4. **Interactive Frontend UI**:
   - `client/src/api/chatsApi.js`: Centralized service for chats and messages API calls.
   - `client/src/pages/ChatsPage.jsx`: Responsive two-pane workspace with search filter, status tabs (Active, Archived, All), New Chat modal with topic/subject selector, active message thread, avatars, markdown bubble styling, timestamps, copy to clipboard, and auto-expanding message composer.
   - `client/src/components/ui/Icon.jsx`: Added native SVG paths for `send`, `sparkles`, `copy`, and `archive`.
   - `client/src/routes/AppRoutes.jsx`: Connected `ChatsPage` to protected routes `/chats` and `/chats/:chatId`.
5. **Testing & Verification**:
   - Added 29 automated backend tests in `server/tests/chats.test.js` including genuine `Promise.all()` 10-request concurrency and deterministic E11000 collision recovery (server total: 95 tests passing).
   - Added 4 automated frontend tests in `client/src/pages/Chats.test.jsx` (client total: 40 tests passing).
   - Total Monorepo Tests: 135 tests passing (100%).
   - Verified Vite production build (`dist/` generated in 7.13s with 0 errors).
   - Executed live verification script `server/scripts/verify_phase04_live.js` against running backend and Atlas MongoDB (CRUD, safe reassignment, topic count maintenance, role trust boundary, 10-request concurrent sequence indexing across 24 messages, cross-tenant 404 security checks, and full cascading deletions).
   - Completed real browser verification on `http://localhost:5173/chats` testing authenticated workspace, new chat creation, message sending, Socratic assistant preview response, archiving, and deletion.

---

## [Phase 03] Subjects, Topics & Knowledge Structure

- **Date**: October 3, 2026
- **Status**: Completed
- **Phase**: Phase 03 — Subjects, Topics & Knowledge Structure
- **Core Principle**: *"Knowledge is the product. Conversations are evidence."*
- **Objective**: Design and implement the primary LearnForge knowledge hierarchy as first-class persisted domain entities in MongoDB, enforce strict multi-tenant authorization boundaries, provide complete CRUD REST APIs, create an accessible, responsive UI with loading/empty/error states, and lay the persistence foundation for downstream AI extraction and study features.

### Work Performed
1. **Architectural Foundations & ADR-011**:
   - Evaluated normalized vs. embedded domain models for `Subject` and `Topic`.
   - Adopted normalized collections with denormalized `userId` ownership on both models (ADR-011).
   - Designed embedded `knowledgeState` subdocument (`masteryScore`, `keyConcepts`, `summary`, `lastStudiedAt`) within `Topic` to provide schema readiness for future AI extraction (Phase 06) and adaptive quizzes (Phase 10).
2. **Domain Persistence & Models**:
   - Created `server/src/models/Subject.js` with fields: `userId`, `name`, `normalizedName`, `description`, `color`, `status`, `targetMasteryLevel`, `topicsCount`. Indexes: unique `{ userId: 1, normalizedName: 1 }`, `{ userId: 1, status: 1, updatedAt: -1 }`.
   - Created `server/src/models/Topic.js` with fields: `subjectId`, `userId`, `title`, `normalizedTitle`, `description`, `orderIndex`, `status`, `knowledgeState`, `notesCount`, `chatsCount`. Indexes: `{ subjectId: 1, orderIndex: 1 }`, `{ userId: 1, subjectId: 1 }`, unique `{ subjectId: 1, normalizedTitle: 1 }`.
3. **API Implementation & REST Controllers**:
   - `server/src/controllers/subjectController.js`: Handlers for `listSubjects`, `createSubject`, `getSubject`, `updateSubject`, `deleteSubject` (with application-level cascade delete of child topics and read reconciliation of `topicsCount`).
   - `server/src/controllers/topicController.js`: Handlers for `listTopicsForSubject`, `createTopic`, `getTopic`, `updateTopic`, `deleteTopic` (with Subject `topicsCount` maintained through coordinated application-level updates when topics are created or deleted, and reconciled from persisted Topic records).
   - `server/src/routes/subjects.js` & `server/src/routes/topics.js`: Protected via `requireDatabase` and `authenticateUser`. Supported both nested `/subjects/:subjectId/topics` and collection `/topics?subjectId=:id` endpoints.
4. **Strict Security & Multi-Tenant Isolation**:
   - Every read, update, and delete query strictly filters by `userId: req.user._id`.
   - Cross-tenant requests return `404 Not Found` to prevent ID enumeration attacks.
   - Verified that User B cannot read, modify, or delete User A's subjects or topics, nor inject topics into User A's subjects.
5. **Interactive Frontend UI**:
   - `client/src/api/subjectsApi.js`: Centralized service for subjects and topics API calls.
   - `client/src/pages/SubjectsPage.jsx`: Real API-backed subjects listing, 6-card loading skeleton, empty state, "New Subject" dialog with color presets, "Edit Subject" dialog, and accessible delete confirmation dialog.
   - `client/src/pages/SubjectDetailPage.jsx`: Subject header with metadata badges, topic list with sequential order badges, concept tags preview, "New Topic" dialog, "Edit Topic" dialog, and delete confirmations.
   - `client/src/routes/AppRoutes.jsx`: Connected `SubjectDetailPage` to protected route `/subjects/:subjectId`.
   - `client/src/components/ui/Icon.jsx`: Added native SVG paths for `edit`, `trash`, and `layers`.
6. **Testing & Verification**:
   - Added 21 automated backend tests in `server/tests/subjects.test.js` (total 59 server tests passing).
   - Added 5 automated frontend tests in `client/src/pages/Subjects.test.jsx` (total 35 client tests passing).
   - Validated Vite production build (`dist/` generated in 7.66s with zero errors).
   - Executed live integration script `server/scripts/verify_phase03_live.js` against running backend and Atlas MongoDB, confirming all CRUD, cross-tenant 404 security checks, and cascading deletions.
7. **Mastery Level Contract Alignment**:
   - Resolved client/server contract mismatch where `targetMasteryLevel` in `Subject.js` schema and `subjectController.js` permitted only `beginner`, `intermediate`, `advanced`, rejecting `comprehensive` selected in the UI.
   - Updated `Subject.js` schema enum and `subjectController.js` validation to accept `['beginner', 'intermediate', 'advanced', 'comprehensive']`.
   - Added automated server tests in `server/tests/subjects.test.js` for all 4 mastery levels, `comprehensive` update, and 400 validation failures (server total: 66 tests passing).
   - Added automated client test in `client/src/pages/Subjects.test.jsx` for `comprehensive` selection and submission (client total: 36 tests passing).
   - Live verified against running backend and Atlas MongoDB: creation, persistence, bidirectional updates, and invalid rejection.

---

## [Pre-Phase-03] API, External Integration, Credential & Live-Verification Audit

- **Date**: October 3, 2026
- **Status**: Completed (Phase 03 Gate Blocked pending external credentials)
- **Objective**: Execute a rigorous pre-Phase-03 audit of the LearnForge codebase: inventory all currently implemented API endpoints, discover all external service dependencies, resolve implementation blockers for real SMTP delivery, purge unused credentials, establish formal Credential Gates, and audit secret-hygiene across the repository.

### Work Performed
1. **API Inventory**:
   - Inspected all Express routers and confirmed exactly 7 endpoints exist: `GET /api/v1/health`, `POST /api/v1/auth/otp/request`, `POST /api/v1/auth/otp/verify`, `POST /api/v1/auth/google`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout`, `POST /api/v1/auth/logout-all`.
   - Mapped all error codes, response envelopes, validation requirements, database dependencies, and rate limits.
2. **External Integration Discovery**:
   - Audited all third-party references.
   - Identified 3 active integrations: Google Identity Services (OIDC), SMTP Email Transport, and MongoDB database.
   - Confirmed AI Gateway provider keys (Gemini, OpenAI, Anthropic) and Stripe are future phase requirements (Phase 05+) and are not requested prematurely.
3. **SMTP Implementation Blocker Resolution & Environment Clarifications**:
   - Discovered `EmailService.js` previously lacked an actual SMTP transport (fell back to console/memory in development and returned an unimplemented stub in production).
   - Integrated `nodemailer` (v10.0.14) into `EmailService.js`.
   - Implemented real HTML and plaintext email delivery with branded styling when `EMAIL_PROVIDER=smtp`.
   - Preserved console and in-memory test transports for local development and CI testing.
   - Added `SMTP_SECURE=false` to `server/.env.example` with clear comments explaining port 587 (STARTTLS, `false`) vs port 465 (TLS/SSL, `true`).
   - Corrected `EMAIL_PROVIDER` documentation in `server/.env.example` and `ADR-009` to strictly list supported providers (`console`, `smtp`), explicitly removing unbacked references to `resend`.
   - Registered `nodemailer` in `docs/DEPENDENCIES.md`.
4. **Google Credential Correction**:
   - Removed unused `GOOGLE_CLIENT_SECRET` from `server/.env.example`.
   - Confirmed current architecture uses Google Identity Services with client-side ID token verification via `google-auth-library` and public JWKS, requiring only `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID`.
5. **Security Documentation Correction**:
   - Audited and corrected inaccurate claims that `HttpOnly` "neutralizes XSS".
   - Accurately documented in `SECURITY.md`, `INTERVIEW_GUIDE.md`, and `ADR-009` that `HttpOnly` prevents direct token exfiltration via `document.cookie`, while complete XSS defense requires defense-in-depth.
6. **Automated Testing & Build Verification**:
   - Added unit test suite `server/tests/emailService.test.js` (4 tests).
   - Expanded API contract edge case tests in `server/tests/auth.test.js` (+4 tests).
   - Total automated test count increased from 60 to 68 tests (38 server + 30 client, 100% passing).
   - Client production build verified cleanly with Vite (`dist/` generated with zero errors).
7. **Canonical Audit Documentation**:
   - Created `docs/verification/INTEGRATION_CREDENTIAL_AUDIT.md`.
   - Updated `PROJECT_CONTEXT.md` and `docs/CHANGELOG.md`.
8. **Live Integration Verification Execution**:
   - **SMTP Email Delivery**: Live verified. Nodemailer established SSL connection to `smtp.gmail.com:465` and delivered a real 6-digit OTP email to `shashankmuz3@gmail.com` with zero secrets leaked.
   - **Google Identity Services**: Live verified. Client loaded GIS script and successfully rendered official Google Sign-In button in `AuthModal`.
   - **MongoDB Connection**: Identified active blocker. Atlas connection failed with `bad auth : authentication failed` because `MONGODB_URI` contains Atlas placeholder `<db_password` rather than actual database user password.
   - **Auth Endpoints**: Rejection verified live via `requireDatabase` returning `503 SERVICE_UNAVAILABLE` while DB is offline.
   - **Phase 03 Gate**: Remains strictly **BLOCKED** pending Atlas password correction.

---

## [Phase 02.1] UI Shell Corrections & Accessibility Hardening

- **Date**: October 3, 2026
- **Status**: Completed
- **Phase**: Phase 02.1 — UI Shell Corrections & Accessibility Hardening
- **Objective**: Correct workspace route authentication boundaries, unify the canonical `close` icon across the client, implement full modal keyboard focus traps and focus restoration, harden modal ARIA accessibility, document the architectural boundary between frontend route guards and backend authorization, and expand automated tests.

### Work Performed
1. **Protected Workspace Route Hierarchy**:
   - Reorganized `AppRoutes.jsx` with a single unified `<Route element={<ProtectedRoute onOpenAuth={onOpenAuth} />}>` parent layout.
   - Enforces authentication across all workspace routes: `/subjects`, `/subjects/:subjectId`, `/chats`, `/chats/:chatId`, `/notes`, `/notes/:noteId`, `/study`, `/quizzes`, `/progress`, `/import`, and `/profile`.
   - Nested detail routes automatically inherit protection without duplicated boilerplate.
2. **Zero-Flicker Authentication Loading**:
   - `ProtectedRoute.jsx` renders `<LoadingState type="route" message="Validating secure session..." />` while `loading === true`, preventing premature rendering of protected content or redirect flicker.
3. **Canonical Icon Registry & Bug Fix**:
   - Standardized on `close` as the canonical dismiss icon identifier.
   - Replaced all invalid `name="x"` references with `name="close"` in `Dialog.jsx`, `Sidebar.jsx`, and `AuthModal.jsx`.
   - Enhanced `Icon.jsx` to log developer console warnings when unknown icon names are requested while gracefully falling back to `info`.
4. **Modal Focus Trap & Accessibility Hardening (`useFocusTrap.js`)**:
   - Created reusable, zero-dependency `useFocusTrap` hook.
   - Moves focus into modal on open.
   - Traps Tab and Shift+Tab cycling within focusable elements without focus leakage.
   - Listens for Escape key to close modal.
   - Automatically restores keyboard focus to the triggering element upon modal close.
   - Isolated click event propagation on dialog content so backdrop click dismisses while content click does not.
   - Generated dynamic unique IDs via React `useId()` for `aria-labelledby` and `aria-describedby` in `Dialog.jsx`.
5. **Testing & Verification**:
   - Updated `UIPrimitives.test.jsx` testing canonical icon, unknown fallback warning, Tab/Shift+Tab focus trap, Escape dismiss, backdrop click isolation, and focus restoration.
   - Updated `App.test.jsx` with parameterized tests asserting unauthenticated blocks across all workspace routes and detail routes, authenticated access, and loading state rendering.
   - 60/60 monorepo tests passing (30 server + 30 client).
   - Vite production build succeeded cleanly in 11.76s.
   - Verified in real browser session via browser subagent.
6. **Documentation**:
   - Updated `docs/features/DESIGN_SYSTEM.md`, `docs/phases/phase-02-professional-ui-shell.md`, `docs/architecture/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/interview/INTERVIEW_GUIDE.md`, and `docs/CHANGELOG.md`.

---

## [Phase 02] Professional UI Shell & Design System

- **Date**: October 3, 2026
- **Status**: Completed
- **Phase**: Phase 02 — Professional UI Shell & Design System
- **Objective**: Establish the real professional LearnForge application shell, design system tokens, typography scales, reusable UI primitives, responsive desktop/mobile navigation, authentic route foundations and empty states, dark mode theme support, and refactor the authentication interface to match the high-craft productivity aesthetic.

### Work Performed
1. **Design Tokens & Theme Foundation**:
   - Configured custom semantic tokens in `client/tailwind.config.js` (`app.bg`, `app.surface`, `app.surface-muted`, `app.surface-hover`, `app.border`, `app.text-primary`, `app.text-secondary`, `app.text-muted`, `brand.*`, `status.*`).
   - Defined CSS custom properties in `client/src/index.css` supporting light theme (slate-50) and low-distraction dark mode (slate-900 / slate-800).
   - Created `ThemeContext.jsx` with light/dark toggle, OS preference synchronization, and persistence.
2. **Reusable UI Primitives Suite (`client/src/components/ui/`)**:
   - Built atomic, accessible components: `Button`, `IconButton`, `Input`, `Dialog`, `Dropdown`, `EmptyState`, `Skeleton`, `LoadingState`, `ErrorState`, `Tabs`, `Divider`, `Avatar`, `Badge`.
   - Developed native 1.5-stroke vector `Icon` component with 24 custom SVG icons, achieving 0 runtime dependency bloat.
3. **Application Shell Components (`client/src/components/layout/`)**:
   - `Sidebar.jsx`: Desktop persistent 240px sidebar and mobile off-canvas drawer with active route states and version indicator.
   - `TopBar.jsx`: Restrained navigation header featuring breadcrumbs, quick search trigger placeholder, theme toggle button, and authenticated `UserNav`.
   - `AppShell.jsx`: Unified shell layout managing responsive mobile drawer state and scrollable workspace content frame.
4. **Authentic Routing & Empty States**:
   - Configured React Router routes: `/`, `/subjects`, `/chats`, `/notes`, `/study`, `/quizzes`, `/progress`, `/import`, `/profile`, `/settings`, and detail placeholders (`/subjects/:subjectId`, `/chats/:chatId`, `/notes/:noteId`).
   - Implemented `ProtectedRoute` displaying accessible sign-in invitation for unauthenticated access.
   - Implemented authentic, calm empty states for all feature areas with zero fake metrics, streaks, or activity graphs.
5. **Professional Auth UI Integration**:
   - Refactored `AuthModal.jsx` into the LearnForge design system, eliminating glassmorphism and backdrop blurs.
   - Preserved Google Identity Services button, 6-digit OTP row, paste support, resend countdown, and HttpOnly cookie sessions.
6. **Testing & Build Verification**:
   - Created `UIPrimitives.test.jsx` testing buttons, inputs, dialogs, dropdowns, empty states, and tabs.
   - Updated `App.test.jsx` for shell layout, route navigation, 404 handling, and theme toggling.
   - All 47 monorepo tests passing (30 server + 17 client).
   - Clean Vite production build in 11.58s with zero errors.
7. **Visual Browser Subagent Review**:
   - Verified desktop Home workspace, navigation links, authentic empty states (`/subjects`, `/chats`, `/quizzes`), AuthModal opening/closing, dark mode toggle, and mobile drawer pattern (390x844).
8. **Documentation**:
   - Created `docs/features/DESIGN_SYSTEM.md` and `docs/phases/phase-02-professional-ui-shell.md`.
   - Updated `docs/DEPENDENCIES.md`, `docs/PROJECT_CONTEXT.md`, `docs/architecture/ARCHITECTURE.md`, `docs/CHANGELOG.md`, `docs/interview/INTERVIEW_GUIDE.md`.

---

## [Phase 01.1] Authentication Security Corrections & Production Readiness

- **Date**: October 3, 2026
- **Status**: Completed
- **Phase**: Phase 01.1 — Authentication Security Corrections & Production Readiness
- **Objective**: Correct production security and architecture gaps identified during review: eliminate raw session token exposure in JSON responses, remove all `localStorage` token storage from the web client, replace the mock Google token prompt with real Google Identity Services (GIS), harden user bootstrap against concurrent duplicate key races (error code 11000), update Phase 02 roadmap references, and expand automated tests.

### Work Performed
1. **Critical Security Fix — Web Session Token**:
   - Updated `authController.js` (`verifyOtp` and `authenticateGoogle`) to remove `sessionToken` from JSON response payloads.
   - Responses return user profile and session metadata only (`{ user, session: { id, expiresAt, authMethod } }`).
   - Browser authenticates strictly through the secure `HttpOnly`, `SameSite: 'lax'`, `Secure` cookie.
2. **Client Storage Sanitation**:
   - Removed all `localStorage.setItem('learnforge_bearer_fallback', ...)` and `localStorage.removeItem(...)` from `AuthContext.jsx`.
   - Verified via automated grep that `localStorage` and `sessionStorage` contain zero authentication tokens in `client/src`.
3. **Real Google Identity Services Flow**:
   - Removed `prompt(...)` and `mock_google_id_token_demo` from `AuthModal.jsx`.
   - Injected official Google Identity Services script in `client/index.html`.
   - Initialized `window.google.accounts.id` with `VITE_GOOGLE_CLIENT_ID` and rendered the official Google Sign-In button container.
   - Real ID token JWT from Google callback is transmitted to `POST /api/v1/auth/google`.
   - Configured fallback with clean, accessible notification if `VITE_GOOGLE_CLIENT_ID` is unconfigured.
4. **Concurrent User Creation Hardening**:
   - Hardened `verifyOtp` and `authenticateGoogle` to catch MongoDB duplicate key error code `11000` on `normalizedEmail` and compound index `{ provider, providerSubject }`.
   - Safely re-queries the winning user document, eliminating 500 errors during simultaneous authentication requests.
5. **Strict Production Email Safeguards**:
   - Updated `EmailService.js` to reject `console` delivery in production and fail explicitly if transactional email credentials are missing.
6. **Mobile Bearer Parity**:
   - Preserved `Authorization: Bearer <token>` in `authenticateUser` for future mobile applications.
7. **Testing**:
   - Added tests in `server/tests/auth.test.js` asserting zero raw `sessionToken` in JSON, testing cookie flags, and verifying concurrent race resolution.
   - Added OIDC verification boundary tests in `server/tests/googleAuthService.test.js` (signature failure, audience mismatch, issuer mismatch, expired credential).
   - Added client test in `client/src/App.test.jsx` verifying `localStorage` and `sessionStorage` have 0 tokens.
   - All 33 tests passing across backend and frontend.

---

## [Phase 01] Authentication & User Identity

- **Date**: October 3, 2026
- **Status**: Completed
- **Phase**: Phase 01 — Authentication & User Identity
- **Objective**: Implement production-grade passwordless authentication and user identity for LearnForge, including Google OAuth 2.0 (OpenID Connect), 6-digit Email OTP, database-backed stateful sessions in MongoDB, HTTP-only cookies, mobile Bearer token parity, session revocation, deterministic account linking, and professional authentication UI.

### Work Performed
1. **Mongoose Models Implemented**:
   - `User` (`server/src/models/User.js`): Normalized email, display name, avatar URL, account status, timezone, default study preferences, and timestamps.
   - `AuthIdentity` (`server/src/models/AuthIdentity.js`): External identity mapping with unique compound index `{ provider: 1, providerSubject: 1 }`.
   - `UserSession` (`server/src/models/UserSession.js`): Stateful opaque session tokens stored as SHA-256 hashes, device info, `expiresAt` with TTL index, and `revokedAt`.
   - `EmailOtpToken` (`server/src/models/EmailOtpToken.js`): Passwordless verification tokens with HMAC-SHA-256 peppered hash, attempt counter, and TTL index.
2. **Cryptographic Core & Hashing (`server/src/utils/authCrypto.js`)**:
   - `generateOtpCode`: 6-digit integer generation using `crypto.randomInt(100000, 1000000)`.
   - `hashOtp`: HMAC-SHA-256 hash using server-side pepper `OTP_HMAC_SECRET` bound to normalized email, neutralizing offline rainbow table attacks if MongoDB is breached.
   - `verifyOtpHash`: Constant-time comparison (`crypto.timingSafeEqual`) preventing timing side-channel attacks.
   - `generateSessionToken`: 256-bit high-entropy opaque token (`crypto.randomBytes(32).toString('hex')`).
   - `hashSessionToken`: Standard SHA-256 hash for database matching.
3. **Email Delivery Abstraction (`server/src/services/email/EmailService.js`)**:
   - Created `EmailService` with development console transport, test memory queue, and production SMTP/API readiness.
4. **Google OAuth 2.0 OpenID Connect (`server/src/services/auth/GoogleAuthService.js`)**:
   - Server-side cryptographic token verification using `google-auth-library` (`OAuth2Client.verifyIdToken`).
   - Validates audience, issuer, expiration, and enforces `email_verified: true`.
5. **Deterministic Account Linking (ADR-010)**:
   - Reconciles Google sign-in with existing Email-OTP users by verified email matching, preventing duplicate split accounts and account takeover.
6. **Authentication & Session Middleware**:
   - `authenticateUser` (`server/src/middleware/auth.js`): Dual resolution supporting HTTP-only cookies (`learnforge_session`) for browsers and `Authorization: Bearer <token>` for future mobile applications. Validates session state, expiration, and revocation.
   - `requireDatabase` (`server/src/middleware/databaseCheck.js`): Prevents 10-second Mongoose command buffering timeouts when MongoDB is offline, returning fast 503 `SERVICE_UNAVAILABLE`.
   - `rateLimiter` (`server/src/middleware/rateLimiter.js`): Tiered IP rate limiting for OTP request (5/15m), OTP verify (10/15m), and Google auth (15/15m).
7. **Authentication Controllers & Routes**:
   - `POST /api/v1/auth/otp/request`: Enumeration-resistant, 60s cooldown, 10m expiry.
   - `POST /api/v1/auth/otp/verify`: Validates code, enforces 5-attempt brute-force lockout, single-use invalidation, issues session, sets cookie.
   - `POST /api/v1/auth/google`: Server-verified OIDC login, account linking, issues session.
   - `GET /api/v1/auth/me`: Protected current user profile and session info.
   - `POST /api/v1/auth/logout`: Revokes active session and clears cookie.
   - `POST /api/v1/auth/logout-all`: Revokes all user sessions across all devices.
8. **Frontend Authentication UI (`client/src/`)**:
   - `AuthContext`: Manages login/logout lifecycle, current user state, and session persistence.
   - `AuthModal`: Professional modal with Google sign-in, email input, 6-digit OTP inputs with auto-advance and paste support, and resend countdown.
   - `UserNav`: Header navigation showing user avatar/initials, active session indicator, single logout, and all-device logout.
   - Interactive protected API probe in `App.jsx`.
9. **Automated Testing Suite**:
   - 24 server integration/unit tests (`auth.test.js`, `authCrypto.test.js`, `googleAuthService.test.js`, `health.test.js`) + 2 client component tests passing 100%.

### Files Created
- `docs/decisions/ADR-010-account-linking.md`
- `docs/phases/phase-01-authentication-report.md`
- `server/src/models/User.js`
- `server/src/models/AuthIdentity.js`
- `server/src/models/UserSession.js`
- `server/src/models/EmailOtpToken.js`
- `server/src/utils/authCrypto.js`
- `server/src/services/email/EmailService.js`
- `server/src/services/auth/GoogleAuthService.js`
- `server/src/middleware/auth.js`
- `server/src/middleware/databaseCheck.js`
- `server/src/middleware/rateLimiter.js`
- `server/src/controllers/authController.js`
- `server/src/routes/auth.js`
- `server/tests/authCrypto.test.js`
- `server/tests/googleAuthService.test.js`
- `server/tests/auth.test.js`
- `client/src/context/AuthContext.jsx`
- `client/src/components/auth/AuthModal.jsx`
- `client/src/components/layout/UserNav.jsx`

### Files Modified
- `docs/decisions/ADR-009-authentication-architecture.md`
- `docs/SECURITY.md`
- `docs/API.md`
- `docs/ARCHITECTURE.md`
- `docs/DATABASE.md`
- `docs/DEPENDENCIES.md`
- `docs/PROJECT_CONTEXT.md`
- `docs/CHANGELOG.md`
- `docs/interview/INTERVIEW_GUIDE.md`
- `docs/phases/phase-01-authentication.md`
- `server/package.json`
- `server/.env.example`
- `server/src/config/env.js`
- `server/src/app.js`
- `client/src/App.jsx`
- `client/src/App.test.jsx`

### Dependencies Added
- `cookie-parser`: declared `^1.4.7`, resolved `1.4.7` (HTTP-only session cookie parsing)
- `express-rate-limit`: declared `^8.7.0`, resolved `8.7.0` (IP rate limiting on auth endpoints)
- `google-auth-library`: declared `^11.1.0`, resolved `11.1.0` (server-side Google OIDC validation)

### Decisions Made
- **ADR-009 Updates**: Clarified provider capabilities, pricing changeability, accurate operational cost language, and concrete HMAC-SHA-256 OTP hashing design with server pepper.
- **ADR-010**: Adopted deterministic server-side account linking policy for Google OAuth and Email OTP based on verified email matching.

### Problems Encountered & Solutions
1. **Problem**: Mongoose command buffering caused a 10-second timeout on requests when MongoDB was offline in local dev mode.  
   **Solution**: Implemented `requireDatabase` middleware returning fast 503 `SERVICE_UNAVAILABLE` error envelopes when MongoDB is offline, eliminating buffering lag.
2. **Problem**: Duplicate schema index warnings on `EmailOtpToken.expiresAt`.  
   **Solution**: Consolidated schema definition to rely exclusively on the single compound TTL index.
3. **Problem**: React Testing Library selector ambiguity with multiple "Sign In" elements.  
   **Solution**: Refined test assertions in `App.test.jsx` using `findAllByText` and specific role selectors.

---

## [Phase 00.1] Documentation Reconciliation & Foundation Corrections

- **Date**: October 3, 2026
- **Status**: Completed
- **Phase**: Phase 00.1 — Documentation Reconciliation
- **Objective**: Reconcile project documentation with actual repository state prior to starting Phase 01. Formulate canonical security specifications, formally evaluate and document the authentication architecture via ADR-009, and ensure dependency registry accuracy regarding declared vs. resolved package versions.

### Work Performed
1. **Canonical Security Specification (`docs/SECURITY.md`)**:
   - Created the canonical security architecture document covering CORS, correlation IDs, error sanitization, secret hygiene, dual-identity authentication requirements, OTP cryptographic rules, cookie security flags, AI untrusted output principles, import sandboxing, and rate limiting.
   - Categorized all controls into: *Implemented in Phase 00*, *Required in Phase 01*, and *Required in later phases*.
2. **Authentication Architecture Decision Record (`docs/decisions/ADR-009-authentication-architecture.md`)**:
   - Conducted an in-depth evaluation comparing managed auth providers (Supabase Auth, Clerk, Firebase, Auth0) versus a self-managed native session architecture.
   - Evaluated criteria: Google OAuth, email OTP, session revocation, account linking, browser persistence, mobile client parity, security burden, MongoDB integration, cost, and vendor lock-in.
   - Decided on a **Self-Managed Native Session Architecture** using Node.js Express, MongoDB (`UserSession`, `AuthIdentity`, `User`), Google OAuth 2.0 (OpenID Connect), and 6-digit passwordless email OTP.
   - Eliminated the split-brain database risk inherent in third-party auth platforms when using MongoDB as the application database.
3. **Dependency Registry Correction (`docs/DEPENDENCIES.md`)**:
   - Updated dependency tables to explicitly distinguish between the **Declared Version/Range** in `package.json` (e.g. `^18.3.1`) and the **Resolved Exact Version** in `package-lock.json` (e.g. `18.3.1`).
   - Ensured no package is falsely labeled as pinned when using caret ranges.
4. **Project Context & Changelog Synchronization**:
   - Updated `docs/PROJECT_CONTEXT.md` to reflect Phase 00.1 status and explicitly confirmed that Phase 01 authentication has not yet been implemented.
   - Updated `docs/CHANGELOG.md` with the Phase 00.1 release entry.
5. **Phase Report Authoring**:
   - Created `docs/phases/phase-00.1-documentation-reconciliation.md` with complete interview explanation and questions.

---

## [Phase 00] Project Foundation, Repository Setup, Documentation System & Architecture Verification

- **Date**: October 3, 2026
- **Status**: Completed
- **Phase**: Phase 00 — Foundation
- **Objective**: Establish the production-grade monorepo foundation, repository setup, unified documentation structure, architectural validation, environment configuration, code hygiene baseline, and health-check verification without implementing future features prematurely.
