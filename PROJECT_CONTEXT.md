# LearnForge — Living Project Context

## 1. Product Identity

**LearnForge** is an AI-powered learning workspace designed for serious students and professionals. It automatically transforms study conversations into structured, evolving knowledge, adaptive pedagogical study sessions, versioned notes, quizzes, and verifiable learning progress.

> **Core Philosophy**: Chat is the interaction layer. Knowledge is the product. Notes are the structured representation of that knowledge. AI is the pedagogical engine that evaluates, extracts, and organizes it.

---

## 2. Current Phase Status

- **Current Phase**: **Phase 07 — Structured Notes Engine (COMPLETED & SEALED)**
- **Next Phase**: **Phase 08 — Adaptive Study Sessions & Socratic Tutoring (Awaiting authorization)**
- **Repository Remote**: `https://github.com/Shashank028R/LearnForge.git`
- **Default Branch**: `main`

---

## 3. Completed Work Summary

### Phase 00 & 00.1 (Foundation & Reconciliation)
- Monorepo structure with npm workspaces linking `/client` and `/server`.
- Centralized configuration, correlation IDs (`X-Request-ID`), and standardized JSON response envelopes.
- Architectural review (`docs/architecture/ARCHITECTURE_REVIEW.md`) and canonical security specification (`docs/SECURITY.md`).
- Architectural decisions ADR-001 through ADR-009.

### Phase 01 & 01.1 (Authentication & User Identity Hardening)
- **Passwordless Email OTP**: 6-digit numeric OTP generation using cryptographic randomness, secured at rest via HMAC-SHA-256 with a server-side secret pepper (`OTP_HMAC_SECRET`), 10-minute expiration, 5-attempt brute-force lockout, and 60-second resend cooldown.
- **Google OAuth 2.0 (OpenID Connect)**: Server-side cryptographic token verification using `google-auth-library` with issuer, audience, expiration, and `email_verified` validation. Real Google Identity Services client flow with no dev mock prompts.
- **Critical Web Session Security**: Raw session tokens are never returned in JSON to web clients and never stored in `localStorage` or `sessionStorage`. Browser authentication relies exclusively on `HttpOnly`, `SameSite: 'lax'`, `Secure` cookies.
- **Mobile Bearer Parity**: Centralized middleware retains `Authorization: Bearer <session-token>` resolution for future mobile clients.
- **Deterministic Account Linking (ADR-010)**: Automated, safe reconciliation of Google OAuth and Email OTP identities based on verified email matching, preventing duplicate accounts.
- **Concurrent User Bootstrap Hardening**: MongoDB duplicate key race conditions (error code 11000) on `normalizedEmail` and compound unique index `{ provider, providerSubject }` are caught and safely resolved without 500 errors.
- **Session Revocation**: Single session logout and global all-device revocation (`/api/v1/auth/logout-all`).
- **Tiered Rate Limiting**: Protection against brute-force and email abuse using `express-rate-limit`.

### Phase 02 & 02.1 (Professional UI Shell & Route Protection Boundaries)
- **Calm, High-Density Productivity Shell**: Persistent desktop sidebar, sticky topbar with breadcrumb and search trigger, responsive mobile drawer navigation.
- **Strict Anti-AI-Gimmick Design**: Zero neon, zero glowing borders, zero glassmorphism, zero decorative floating orbs, zero fake metrics.
- **Restrained Color & Surface Tokens**: Semantic tokens (`app.*`, `brand.*`, `status.*`), typography utilities, and low-distraction dark mode.
- **Complete Reusable UI Primitives Suite**: `Button`, `IconButton`, `Input`, `Dialog`, `Dropdown`, `EmptyState`, `Skeleton`, `LoadingState`, `ErrorState`, `Tabs`, `Divider`, `Avatar`, `Badge`, and native 1.5-stroke SVG `Icon`.
- **Protected Route Hierarchy**: Centralized layout-level `ProtectedRoute` protecting all workspace routes (`/subjects`, `/chats`, `/notes`, `/study`, `/quizzes`, `/progress`, `/import`, `/profile`).
- **Modal Focus Trap & Accessibility**: WCAG AA focus trap, Tab/Shift+Tab cycle, Escape dismiss, backdrop click isolation, and focus restoration to opener element.

### Pre-Phase-03 (API, Integration, Credential & Live-Verification Audit)
- **Live Verification**: Google GIS, Email OTP via real SMTP, and MongoDB Atlas live verified by project owner.
- **Credential Gate Cleared**: Documented in `docs/verification/INTEGRATION_CREDENTIAL_AUDIT.md`.

### Phase 03 (Subjects, Topics & Knowledge Structure)
- **Architectural Principle**: *"Knowledge is the product. Conversations are evidence."*
- **Domain Persistence**: Normalized `Subject` and `Topic` models in MongoDB with denormalized `userId` ownership (ADR-011).
- **Knowledge Structure Foundation**: Embedded `knowledgeState` subdocument with `masteryScore`, `keyConcepts`, `summary`, and `lastStudiedAt`.
- **Strict Multi-Tenant Isolation**: Verified server-side tenant scoping returning 404 for cross-user resource access.
- **Application Cascade Deletion**: Deleting an owned subject cascades deletion to all child topics and cleans up workspace state.
- **REST APIs**: Complete CRUD for subjects and topics mounted under `/api/v1/subjects` and `/api/v1/topics` with input validation, duplicate detection, and sequential ordering.
- **Interactive UI**: API-backed `SubjectsPage` and `SubjectDetailPage` featuring real lists, create/edit modals, accessible delete confirmations, and loading/empty/error states.

### Phase 04 (Chat Infrastructure)
- **Domain Persistence**: `Chat` and `Message` models with sequential `sequenceIndex` and compound unique index `{ chatId: 1, sequenceIndex: 1 }`.
- **Message Role Trust Boundary**: Strict role authorization on `POST /messages` allowing only `role: "user"`.
- **Concurrency Correctness**: Atomic message sequencing with retry loop on E11000 duplicate key collision.
- **Interactive UI**: Two-pane workspace with search, status filters, message thread, auto-expanding composer, and topic/subject reassignment.

### Phase 04.1 (Syllabus & Knowledge Governance Foundation)
- **End-to-End Atomic Approval & Structural Invariant**: MongoDB Partial Unique Index `{ subjectId: 1, status: 1 }` (`partialFilterExpression: { status: 'approved' }`) physically preventing multiple approved versions per subject, mandatory multi-document ACID transactions on replica sets / Atlas (`session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } })`) wrapping superseding, approval, topic reconciliation, and Subject metadata updates in a single isolated transaction with automated retry on transient write conflicts (`WriteConflict` code 112). Standalone MongoDB instances without replica sets return HTTP 503.
- **Live Atlas Adversarial Interleaving Resistance**: Verified on remote MongoDB Atlas replica set with delayed uncommitted workers failing cleanly with `WriteConflict` and preventing stale mutator state corruption.
- **Subject `topicsCount` Semantic Contract**: Defined strictly as the count of active syllabus topics (`isActiveInSyllabus: true`). Subjects start with `no_syllabus` and `topicsCount: 0`. Pre-syllabus topics default to `isActiveInSyllabus: false`.
- **Topic Reconciliation & History Preservation**: Preserves stable `_id` and learning history across revisions; omitted topics become historical (`isActiveInSyllabus: false`) and re-added topics reactivate seamlessly.
- **Knowledge Semantic Layers & Annotations**: 7 distinct semantic layers; complete `Annotation` model and REST API for user notes and tags.
- **Interactive UI**: Syllabus governance panel, version history viewer, approval confirmation modal, and inline annotations.

### Phase 05 (AI Gateway, Automatic Model Routing & Pedagogical Engine)
- **Centralized AI Gateway**: Provider-neutral gateway (`server/src/ai/gateway/aiGateway.js`) implementing `generate(request)` with normalized envelopes (`AIResponse`).
- **Official Provider Adapters**: Concrete adapters for Google Gemini (`@google/genai`), OpenAI (`openai`), and Groq (`groq-sdk`) with uniform error normalization and health monitoring. Anthropic marked `DISABLED / DEFERRED`.
- **Task & Capability Taxonomy**: Typed task taxonomy (`general_chat`, `pedagogical_explanation`, `syllabus_generation`, `knowledge_relevance_classification`, `knowledge_event_extraction`) mapped to capability requirements (`text_generation`, `structured_output`, `fast_classification`, `complex_reasoning`).
- **Automatic Model Routing**: Server-side deterministic router (`ModelRouter`) selecting optimal models without exposing provider choices to frontend (`general_chat`: Gemini → Groq → OpenAI; `pedagogical_explanation` & `syllabus_generation`: OpenAI → Gemini → Groq; `knowledge_relevance_classification`: Groq → Gemini → OpenAI; `knowledge_event_extraction`: Groq → OpenAI → Gemini).
- **Resilience Engine**: Deterministic same-provider bounded retries with exponential backoff and jitter on transient failures (`429`, `503`, `ETIMEDOUT`), provider fallback chains upon retry exhaustion, and application-level offline Socratic fallback in `chatController.js`.
- **Curriculum Context Isolation**: Strict prompt assembly ensuring only approved syllabi (`status: 'approved'`) are treated as authoritative curriculum.
- **Knowledge Relevance Governance**: Automatic semantic relevance classification (`on_topic`, `off_topic`, `uncertain`) with `excluded` disposition for off-topic queries, preventing canonical note pollution.
- **Observability & Security**: Request correlation via `X-Request-ID`, token telemetry (`AITelemetry`), rate limiting (`aiMessageRateLimiter`), and strict secret redaction.

### Phase 06 (Knowledge Extraction Engine & Pedagogical Analysis)
- **Knowledge Extraction Pipeline**: Transforms conversational evidence into structured `LearningEvent` ledger records and canonical `Concept` entities without conflating raw transcripts with canonical knowledge.
- **Durable Concept Identity & Resolution**: `ConceptResolver` performs exact normalized name and alias matching with dynamic alias reconciliation, classifying interactions as `NEW`, `EXISTING`, `DUPLICATE`, `COMPLEMENTARY`, `CORRECTION`, or `CONFLICT`.
- **Deterministic Learning State Machine**: Governs transitions across `NOT_STARTED`, `INTRODUCED`, `LEARNING`, `UNDERSTOOD`, `STRONG`, and `NEEDS_REVIEW` using bounded diminishing returns confidence calculations and misconception penalties.
- **Misconception & Conflict Governance**: Tracks active and resolved misconceptions with corrective explanations; flags conceptual conflicts without deleting historical evidence or trusted knowledge.
- **Idempotency & Transaction Boundaries**: Compound unique index `{ userId: 1, idempotencyKey: 1 }` prevents duplicate event processing; multi-document ACID transactions atomically update `LearningEvent`, `Concept`, and `Topic.knowledgeState`.
- **Strict Phase Boundary**: Zero `NoteDocument` or `NoteVersion` records created (deferred to Phase 07).

### Phase 07 (Structured Notes Engine)
- **Architectural Principle**: *"Raw Conversation → Learning Evidence (LearningEvent) → Canonical Knowledge (Concept) → Structured Notes (NoteDocument & NoteVersion)."*
- **Domain Persistence**: `NoteDocument` and immutable append-only `NoteVersion` with compound unique index `{ noteDocumentId: 1, version: 1 }` and comprehensive immutability guards against all update/delete mutations.
- **Dedicated Subsystem**: `server/src/notes/` with `riskClassifier.js` and `notesService.js`.
- **Concurrency & Transactions**: Optimistic concurrency control using `baseVersion` inside MongoDB multi-document transactions with domain HTTP 409 conflict mapping (`STALE_BASE_VERSION`, `STALE_PROPOSAL_BASE`).
- **Interactive UI**: `NotesPage.jsx`, `BlockRenderer.jsx`, `BlockEditor.jsx`, `VersionHistoryDrawer.jsx`, and `ProposalReviewModal.jsx`.

### Phase 08 (Strict Study Mode & Active Recall — Checkpoint 2 Backend)
- **Architectural Principle**: *"Normal Chat = user asks → AI explains. Study Mode = AI teaches → asks active recall → evaluates reasoning → Socratic remediation → advances on demonstrated understanding."*
- **Domain Persistence**: Normalized `StudySession` with embedded `StudyTurn` subdocuments (`attemptType: INITIAL | FOLLOW_UP`, `parentTurnId` referencing intra-session turn `_id`).
- **Lease Fencing & Stale Worker Protection**: `evaluationState.operationId` authoritative fencing token with 30s crash leases and atomic lease takeover preventing stale worker state corruption.
- **Central State Machine**: `server/src/study/stateMachine.js` enforcing legal transitions, `CANNOT_PAUSE_DURING_EVALUATION` invariants, and non-stranding recovery to `QUESTIONING` / `RECHECKING`.
- **Syllabus Pinning**: Approved `SyllabusVersion` permanently pinned at session creation.
- **REST APIs**: Complete study session lifecycle, answer submission, continuation, pause/resume, and exit mounted on `/api/v1`.

---

## 4. Current Work
- Phase 08 Checkpoint 2 (Backend Implementation) complete and live-verified (18/18 gates, 227 tests passing). Awaiting authorization for Checkpoint 3 (Frontend Implementation).

---

## 5. Upcoming Work (Phase 08 Checkpoint 3 — Study Mode Frontend Canvas)
- Restrained, calm study workspace UI (`StudyCanvas.jsx`, `QuestionCard.jsx`, `AnswerComposer.jsx`, `EvaluationFeedback.jsx`, `RemediationPanel.jsx`).

---

## 6. Important Architectural Decisions Made

- **ADR-001**: Knowledge Model as central entity; conversations produce evidence.
- **ADR-002**: AI Gateway with provider adapters and task-based model routing.
- **ADR-003**: Structured typed blocks for notes instead of arbitrary HTML.
- **ADR-004**: Decoupling conversation transcripts from canonical knowledge states.
- **ADR-005**: Immutable note versions guaranteeing non-destructive AI updates.
- **ADR-006**: API-first, mobile-ready backend contracts.
- **ADR-007**: Risk-based note update automation policy.
- **ADR-008**: Documentation as an immutable build requirement.
- **ADR-009**: Self-Managed Native MongoDB Session Architecture for authentication.
- **ADR-010**: Deterministic Account Linking Policy for Google OAuth and Email OTP.
- **ADR-011**: Subject and Topic Knowledge Hierarchy Domain Design.
- **ADR-012**: Chat and Message Infrastructure Sequencing and Concurrency Design.
- **ADR-013**: Syllabus Governance, Immutability and Topic Reconciliation.
- **ADR-014**: AI Gateway Abstraction, Task-Based Model Routing & Pedagogical Engine.
- **ADR-015**: Knowledge Extraction, Concept Resolution & Learning State.
- **ADR-016**: Structured Notes Engine & Immutable Versioning Architecture.
- **ADR-017**: Strict Study Mode Domain Aggregate, Lease Fencing & Socratic Pedagogical State Machine.

---

## 7. Deferred Decisions
- **AI Model Selection**: Specific provider models (e.g. Gemini 1.5 Pro/Flash, Claude 3.5 Sonnet, GPT-4o) deferred to Phase 05.
- **Cloud Object Storage Provider**: AWS S3 vs. Cloudflare R2 deferred to Phase 11.
