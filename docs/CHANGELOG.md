# Changelog

All notable changes to the LearnForge project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-10-04

### Phase 05 — AI Gateway, Automatic Model Routing & Pedagogical Engine

#### Added
- **Centralized AI Gateway Subsystem (`server/src/ai/`)**:
  - `AIGateway.js`: Central provider-neutral gateway orchestrating request validation, automatic model routing, execution, bounded retries with jitter, provider fallback chains, and telemetry recording.
  - `aiRequest.js` & `aiResponse.js`: Request/response normalizers producing immutable, provider-agnostic payloads (`AIResponse`) with routing metadata, token usage, latency, and request IDs.
  - `BaseProvider.js`: Abstract provider adapter with health state tracking, failure counters, and standardized error normalization (`AIAuthenticationError`, `AIInvalidRequestError`, `AIRateLimitedError`, `AITimeoutError`, `AIProviderUnavailableError`).
  - `GeminiProvider.js`: Concrete adapter for Google Gemini models using official `@google/genai` (v2.27.0).
  - `OpenAIProvider.js`: Concrete adapter for OpenAI models using official `openai` (v7.27.0).
  - `GroqProvider.js`: Concrete adapter for Groq models using official `groq-sdk` (v1.6.0). Default model `openai/gpt-oss-120b`.
  - Anthropic: Marked `DISABLED / DEFERRED` and excluded from Phase 05 active provider set.
- **Task-Based Automatic Model Router (`ModelRouter.js`)**:
  - Defined task taxonomy (`general_chat`, `pedagogical_explanation`, `syllabus_generation`, `knowledge_relevance_classification`) and mapped each to capability requirements (`text_generation`, `structured_output`, `fast_classification`, `complex_reasoning`).
  - Automatic, deterministic provider selection without exposing model or provider options to the frontend.
  - Configured active preference chains:
    - `general_chat`: `gemini` → `groq` → `openai`
    - `pedagogical_explanation`: `openai` → `gemini` → `groq`
    - `syllabus_generation`: `openai` → `gemini` → `groq`
    - `knowledge_relevance_classification`: `groq` → `gemini` → `openai`
  - Resilience engine with bounded exponential backoff with jitter on transient failures (`429`, `503`, `ETIMEDOUT`) and provider fallback chains.
  - Offline Socratic fallback engine (`model: 'socratic-engine'`) delivering deterministic responses when external API keys are unconfigured.
- **Centralized Prompt Registry & Curriculum Context Isolation (`promptRegistry.js`)**:
  - `generalLearningPrompt.js`: Socratic, patient, and pedagogically structured guidance.
  - `pedagogicalExplanationPrompt.js`: Deep conceptual breakdowns with intuition, mechanics, misconceptions, and active recall checks.
  - `syllabusGenerationPrompt.js`: Structured curriculum JSON generation.
  - `knowledgeRelevanceClassificationPrompt.js`: Fast semantic relevance evaluation against active curriculum.
  - **Curriculum Context Isolation**: Prompt assembly strictly queries approved syllabi (`status: 'approved'`). Draft and superseded versions are never injected as authoritative context.
- **Chat Integration & Knowledge Relevance Governance (`chatController.js`)**:
  - `sendMessage` and `createChat` invoke `generateAIExchange` through the AI Gateway.
  - Populates `knowledgeContext: { relevance, disposition, subjectId, topicId }` on assistant messages.
  - Off-topic inquiries receive helpful answers, but their `knowledgeContext.relevance` is marked `off_topic` and `disposition` is set to `excluded`, preserving conversational evidence while strictly preventing canonical note or topic knowledge pollution.
  - Mounted `aiMessageRateLimiter` (30 req/min per IP) on chat endpoints.
- **Frontend Polish (`ChatsPage.jsx`)**:
  - Added assistant thinking skeleton during generation (`isSending`).
  - Added retry affordance on failed user messages.
  - Rendered off-topic warning banner strictly from backend metadata (`knowledgeContext.relevance === 'off_topic'`).
  - Displayed calm pedagogical task metadata on assistant message bubbles.
- **Testing & Verification**:
  - 15 comprehensive unit and integration tests in `server/tests/aiGateway.test.js` (total 128 server tests passing 100%).
  - 46 frontend tests passing in `client/` (total 46 client tests passing 100%).
  - Total automated monorepo tests increased to 174 tests (100% passing).
  - Clean Vite production build (`dist/` generated cleanly with 0 errors).
  - Live Atlas API verification script (`verify_phase05_live.js`) exercising real Express HTTP APIs, Atlas database, and live Groq inference.

---

## [0.5.1] - 2026-10-04

### Phase 04.1 — Syllabus & Knowledge Governance Foundation

#### Added & Hardened
- **End-to-End Atomic Approval Pipeline & Concurrency Hardening**:
  - Defined MongoDB Partial Unique Index `{ subjectId: 1, status: 1 }` with `partialFilterExpression: { status: 'approved' }` on `SyllabusVersion.js` to physically prevent more than one approved syllabus version per subject at the database storage engine layer.
  - Required multi-document ACID transactions on replica sets / Atlas (`session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } })`) to atomically execute version superseding, target approval, canonical topic reconciliation, active count calculation, and `Subject.activeSyllabusVersionId` / `Subject.topicsCount` updates in a single isolated transaction with automated retry on transient write conflicts (`WriteConflict` code 112). Standalone MongoDB instances without replica sets return HTTP 503.
  - Implemented live Atlas adversarial test with deliberate worker interleaving, verifying that stale uncommitted worker transactions cleanly abort with `WriteConflict` and prevent stale mutator corruption.
- **Subject `topicsCount` & Topic Lifecycle Semantic Contract**:
  - `Subject.topicsCount` is strictly defined as the count of active syllabus topics (`Topic.countDocuments({ subjectId, userId, isActiveInSyllabus: true })`).
  - Pre-syllabus user-created topics default to `isActiveInSyllabus: false`, enabling free-form study without violating the active syllabus count contract (`topicsCount = 0`).
  - Draft syllabus edits do NOT activate canonical syllabus topics.
  - Syllabus approval reconciles matching topics (`isActiveInSyllabus: true`), marks omitted topics historical (`isActiveInSyllabus: false`) with stable `_id` and learning history preserved, and reactivates re-added topics with cumulative learning history intact.
- **Domain Persistence & Models**:
  - `SyllabusVersion.js`: Versioned syllabus model supporting `draft`, `approved`, and `superseded` states, structured hierarchical sections and topics, change summaries, and approval audit timestamps.
  - `Annotation.js`: Model for user-authored auxiliary comments and tags attached to chats and messages.
  - `Topic.js`: Added `isActiveInSyllabus` (default: `false`, indexed) distinguishing active syllabus topics from retired/historical topics.
  - Added `syllabusStatus` and `activeSyllabusVersionId` to `Subject.js`.
  - Added `knowledgeContext` (`relevance`, `subjectId`, `topicId`, `disposition`) to `Message.js`.
- **REST APIs & Topic Governance**:
  - Full syllabus lifecycle management under `/api/v1/subjects/:subjectId/syllabus` (`GET /status`, `GET /versions`, `POST /drafts`, `GET /versions/:version`, `PUT /drafts/:version`, `POST /versions/:version/approve`).
  - Full CRUD for comments and tags under `/api/v1/annotations`.
- **Application Cascade Deletions**:
  - Subject deletion cascades removal of all associated `Topic`, `Chat`, `Message`, `SyllabusVersion`, and `Annotation` documents.
  - Topic/Chat deletions cascade cleanup of associated annotations.
- **Interactive UI & Accessibility**:
  - `SubjectDetailPage.jsx`: Added syllabus governance panel, draft editor, version history modal, historical topic badge rendering, and explicit approval confirmation modal.
  - `ChatsPage.jsx`: Added off-topic detection banner display derived exclusively from backend response data (zero heuristic guessing) and added inline message comment/tag annotations.
  - `useFocusTrap.js`: Fixed modal focus theft on input typing by stabilizing `onClose` references in React refs.
- **Testing & Verification**:
  - 18 backend tests in `server/tests/syllabus.test.js` and `server/tests/annotations.test.js` including genuine concurrent approval tests, adversarial delayed-interleaving tests, and manual topic pre-syllabus lifecycle tests (total 113 server tests passing).
  - 6 frontend tests in `client/src/pages/SyllabusGovernance.test.jsx` (total 46 client tests passing).
  - Total automated monorepo tests increased to 159 tests (100% passing).
  - Live Atlas API verification script (`verify_phase04_1_live.js`) exercising real Express HTTP APIs and Atlas database invariants across 8 rigorous stages including genuine concurrent approval tests.
  - End-to-end browser verification of modal focus stability and syllabus governance flow.

---

## [0.5.0] - 2026-10-04

### Phase 04 — Chat Infrastructure

#### Added
- **Domain Models & Persistence**:
  - `Chat.js`: User-owned chat sessions optionally linked to `Subject` and `Topic` with status, message counter, and compound activity indexes.
  - `Message.js`: User-owned message turns with compound unique sequential indexing `{ chatId: 1, sequenceIndex: 1 }` and metadata readiness for downstream AI features.
- **REST APIs & Reassignment**:
  - Full CRUD and safe topic/subject reassignment endpoints under `/api/v1/chats` (`GET /`, `POST /`, `GET /:id`, `PUT /:id`, `PATCH /:id`, `DELETE /:id`).
  - Message exchange endpoints under `/api/v1/chats/:id/messages` (`GET /`, `POST /`).
- **Security & Concurrency Hardening**:
  - Enforced Message Role Trust Boundary (`POST /api/v1/chats/:id/messages` only allows `role: "user"`, rejecting `assistant` and `system` client injections with 400).
  - Implemented concurrency-safe sequence allocation retry loop on duplicate key collisions (code 11000).
  - Automated cascade deletion from Subject → Topic → Chat → Messages.
  - Topic `chatsCount` increment/decrement lifecycle and read reconciliation.
  - Strict tenant isolation returning 404 on cross-user queries and cross-tenant reassignments.
- **Interactive Two-Pane UI**:
  - `ChatsPage.jsx`: Full responsive conversation history sidebar, search filter, status tabs, New Chat modal with topic/subject selector, message thread with student & assistant avatars, copy utility, and auto-expanding composer.
  - `chatsApi.js`: Centralized client API service for chats and messages.
  - Added native SVG icons in `Icon.jsx`: `send`, `sparkles`, `copy`, `archive`.
  - Connected `/chats` and `/chats/:chatId` in `AppRoutes.jsx`.
- **Architectural Documentation**:
  - Authored `docs/decisions/ADR-012-chat-and-message-infrastructure.md`.
  - Authored `docs/phases/phase-04-chat-infrastructure.md`.
  - Added technical interview questions Q46–Q50 in `docs/interview/INTERVIEW_GUIDE.md`.
- **Automated & Live Tests**:
  - 29 backend tests in `server/tests/chats.test.js` (total server tests: 95).
  - 4 frontend tests in `client/src/pages/Chats.test.jsx` (total client tests: 40).
  - Total automated monorepo tests increased to 135 tests (100% passing).
  - Extended live verification script `server/scripts/verify_phase04_live.js` passing against live MongoDB Atlas and local backend across 11 stages and 17 verification points including 10-request concurrency.
  - Completed end-to-end browser verification of `/chats` workspace, new conversation creation, Socratic preview responses, archiving, and deletion.

---

## [0.4.0] - 2026-10-03

### Phase 03 — Subjects, Topics & Knowledge Structure

#### Added
- **Domain Models & Persistence**:
  - `Subject.js`: User-owned learning subjects with unique normalized names, target mastery levels, color themes, and cached topic counters.
  - `Topic.js`: User-owned topics referencing parent subjects with sequential `orderIndex` and embedded `knowledgeState` subdocument (`masteryScore`, `keyConcepts`, `summary`, `lastStudiedAt`).
- **REST APIs**:
  - Full CRUD endpoints under `/api/v1/subjects` (`GET /`, `POST /`, `GET /:id`, `PUT /:id`, `DELETE /:id`).
  - Full CRUD endpoints under `/api/v1/topics` and nested `/api/v1/subjects/:id/topics`.
- **Application Cascade Deletions**: Deleting a subject cascades deletion to all child topics and cleans up workspace state.
- **Strict Multi-Tenant Isolation**: Server-side user ownership validation (`userId: req.user._id`) on all subject and topic operations, returning 404 for cross-user attempts to prevent enumeration.
- **Interactive UI**:
  - `SubjectsPage.jsx`: Live API-backed subjects listing, 6-card loading skeleton, empty state, "New Subject" dialog, "Edit Subject" dialog, and accessible delete confirmation dialog.
  - `SubjectDetailPage.jsx`: Subject header with metadata badges, topic list with sequential order badges, concept tags preview, "New Topic" dialog, "Edit Topic" dialog, and delete confirmations.
  - `subjectsApi.js`: Centralized service for subjects and topics API calls.
  - Native SVG paths for `edit`, `trash`, and `layers` in `Icon.jsx`.
- **Architectural Documentation**:
  - Authored `docs/decisions/ADR-011-subject-topic-knowledge-structure.md`.
  - Authored `docs/phases/phase-03-subjects-topics-knowledge-structure.md`.
- **Target Mastery Level Contract Alignment**:
  - Aligned backend `Subject.js` schema enum and `subjectController.js` validation to include `comprehensive`, matching documented specifications and frontend selectable options (`beginner`, `intermediate`, `advanced`, `comprehensive`).
- **Automated Tests**:
  - 28 backend tests in `server/tests/subjects.test.js` (server total 66 tests).
  - 6 frontend tests in `client/src/pages/Subjects.test.jsx` (client total 36 tests).
  - Total automated monorepo tests increased to 102 tests (100% passing).
- **Topic Count Consistency & Lifecycle**:
  - Documented that Subject `topicsCount` is maintained through coordinated application-level updates when topics are created or deleted, and reconciled from persisted Topic records upon read.
- **Live Integration Verification**:
  - Live verification script `server/scripts/verify_phase03_live.js` passing against running local backend and live MongoDB Atlas (including `comprehensive` mastery creation, persistence, bidirectional updates, invalid rejection, and cross-tenant checks).

---

## [0.3.2] - 2026-10-03

### Pre-Phase-03 API, Integration, Credential & Live-Verification Audit

#### Added
- **Production SMTP Transport**: Integrated `nodemailer` (v10.0.14) into `EmailService.js`, enabling real SMTP verification code delivery via HTML and plaintext emails when `EMAIL_PROVIDER=smtp`. Retained console logging and in-memory test harnesses.
- **Dedicated Credential Audit Documentation**: Authored `docs/verification/INTEGRATION_CREDENTIAL_AUDIT.md` containing a complete 7-endpoint API inventory, external service discovery matrix, credential gates, and security audit results.
- **Test Suite Expansion**: Added unit tests for `EmailService.js` and expanded API contract edge cases in `auth.test.js` (total tests increased from 60 to 68 passing).

#### Changed & Fixed
- **Google OAuth Config Hygiene**: Purged unused `GOOGLE_CLIENT_SECRET` from `server/.env.example`. Documented that Google Identity Services (GIS) client-side ID token verification requires only `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID`.
- **Security Documentation Precision**: Corrected statements in `SECURITY.md`, `INTERVIEW_GUIDE.md`, and `ADR-009` that claimed `HttpOnly` "neutralizes XSS". Accurately documented that `HttpOnly` protects against raw token exfiltration via JavaScript (`document.cookie`), while full XSS defense requires defense-in-depth.
- **Audited Dependency Registry**: Added `nodemailer` to `docs/DEPENDENCIES.md` as an audited runtime dependency.

---

## [0.3.1] - 2026-10-03

### Phase 02.1 — UI Shell Corrections & Accessibility Hardening

#### Changed & Hardened
- **Protected Workspace Route Hierarchy**: Reorganized `AppRoutes.jsx` with a unified layout-level `ProtectedRoute` protecting all user-specific workspace routes (`/subjects`, `/subjects/:subjectId`, `/chats`, `/chats/:chatId`, `/notes`, `/notes/:noteId`, `/study`, `/quizzes`, `/progress`, `/import`, `/profile`). Nested detail routes inherit protection automatically.
- **Zero-Flicker Auth Loading State**: Ensured `ProtectedRoute` renders a calm `LoadingState` while authentication state is resolving (`loading === true`), preventing premature rendering of protected content or redirect flicker.
- **Canonical Close Icon Unification**: Replaced all invalid `name="x"` references with canonical `name="close"` across `Dialog.jsx`, `Sidebar.jsx`, and `AuthModal.jsx`.
- **Enhanced Icon Fallback**: Updated `Icon.jsx` to log clear developer console warnings when unknown icon names are requested while gracefully falling back to `info`.
- **Accessible Modal Focus Trap & Restoration**: Implemented custom `useFocusTrap` hook for `Dialog.jsx` and `AuthModal.jsx`, ensuring focus shifts into dialog on open, Tab and Shift+Tab cycle within focusables without leaking, Escape key dismisses modal, click-propagation is isolated from backdrop, and focus is restored to opener upon closing.
- **Unique Modal ARIA Identifiers**: Dynamic unique ID generation via React `useId()` for `aria-labelledby` and `aria-describedby` in `Dialog.jsx`.
- **Public Accessibility of `/settings`**: Documented deliberate architectural decision keeping `/settings` publicly accessible for pre-auth theme and keyboard ergonomics.
- **Test Expansion**: Expanded client automated test suite from 17 to 30 tests (monorepo total 60 tests passing 100%).

---

## [0.3.0] - 2026-10-03

### Phase 02 — Professional UI Shell & Design System

#### Added
- **Design System & Token Architecture**: Complete token foundations in `client/tailwind.config.js` and `client/src/index.css` supporting calm neutrals (`app.*`), restrained brand blues (`brand.*`), semantic feedback (`status.*`), micro-radii, and subtle elevations.
- **Theme Architecture**: Implemented `ThemeContext.jsx` with light and low-distraction dark mode support, persistence to `localStorage`, and OS preference synchronization.
- **Application Shell Components**:
  - `Sidebar.jsx`: Persistent 240px desktop sidebar and mobile off-canvas drawer with active route states and version indicator.
  - `TopBar.jsx`: Restrained navigation header featuring breadcrumbs, quick search trigger placeholder, theme toggle button, and authenticated `UserNav`.
  - `AppShell.jsx`: Unified shell layout managing responsive mobile drawer state and scrollable workspace content frame.
- **Reusable UI Primitives Suite** (`client/src/components/ui/`):
  - `Button`, `IconButton`, `Input`, `Dialog`, `Dropdown`, `EmptyState`, `Skeleton`, `LoadingState`, `ErrorState`, `Tabs`, `Divider`, `Avatar`, `Badge`, and unified 1.5-stroke vector `Icon`.
- **Authentic Routing Architecture**:
  - Routes for Home (`/`), Subjects (`/subjects`), Chats (`/chats`), Notes (`/notes`), Study (`/study`), Quizzes (`/quizzes`), Progress (`/progress`), Import (`/import`), Profile (`/profile`), and Settings (`/settings`).
  - Detail route placeholders (`/subjects/:subjectId`, `/chats/:chatId`, `/notes/:noteId`).
  - `ProtectedRoute` wrapper displaying accessible sign-in prompts for unauthenticated access.
  - Authentic empty states for all feature areas with zero fake metrics or mock data.
- **Refactored Auth UI Integration**: Refactored `AuthModal.jsx` to adhere to the new design system, eliminating glassmorphism and backdrop blurs while preserving official Google Identity Services, 6-digit OTP, paste support, and HttpOnly session cookies.
- **Automated Tests**: 17 unit tests for UI primitives and App shell behavior. Monorepo total at 47 passing tests.
- **Design System Documentation**: Created canonical design specification at `docs/features/DESIGN_SYSTEM.md`.

---

## [0.2.1] - 2026-10-03

### Phase 01.1 — Authentication Security Corrections & Production Readiness

#### Security & Hardening
- **Zero Web Session Token Exposure**: Removed raw session token leakage from `POST /api/v1/auth/otp/verify` and `POST /api/v1/auth/google` JSON response payloads. Web clients authenticate strictly via `HttpOnly`, `SameSite: 'lax'`, `Secure` cookies.
- **Removed Client Credential Storage**: Purged all `localStorage` and `sessionStorage` token writes (`learnforge_bearer_fallback`) from `AuthContext.jsx`. The browser stores zero authentication credentials in JavaScript-accessible storage.
- **Official Google Identity Services (GIS)**: Replaced mock token prompts and development shortcuts with real Google Identity Services client integration, using `window.google.accounts.id` and the official Google Sign-In button container.
- **Concurrency & Race Condition Hardening**: Hardened `User` and `AuthIdentity` creation in `authController.js` by catching MongoDB duplicate key errors (code 11000) on `normalizedEmail` and compound unique index `{ provider, providerSubject }`, resolving concurrent registration races without 500 errors.
- **Strict Production Email Delivery Safeguards**: Updated `EmailService.js` to strictly reject `console` delivery in production and fail explicitly if transactional email credentials are missing.
- **Mobile Bearer Parity**: Retained `Authorization: Bearer <token>` in `authenticateUser` for future mobile clients with hardware keystores.
- **Testing**: Expanded automated test suite from 26 to 33 tests covering web session security, OIDC verification boundaries, and concurrent registration races. All 33 tests passing.

---

## [0.2.0] - 2026-10-03

### Phase 01 — Authentication & User Identity

#### Added
- **Passwordless Email OTP**: Implemented 6-digit numeric OTP generation via cryptographic randomness, secured at rest with HMAC-SHA-256 using a server-side pepper (`OTP_HMAC_SECRET`), 10-minute expiration, 5-attempt brute-force lockout, and 60-second resend cooldown.
- **Google OAuth 2.0 (OpenID Connect)**: Server-side cryptographic token verification using `google-auth-library` enforcing audience, issuer, expiration, and `email_verified` validation.
- **Deterministic Account Linking (ADR-010)**: Automated, secure reconciliation of Google OAuth and Email OTP accounts by verified email matching, preventing duplicate accounts and account takeovers.
- **Stateful Database Sessions**: Opaque 256-bit session tokens stored as SHA-256 hashes in MongoDB `UserSession`, delivered via HTTP-only, SameSite, Secure cookies for web, with dual `Authorization: Bearer <token>` support for mobile clients.
- **Session Revocation**: Endpoints for single session logout (`POST /api/v1/auth/logout`) and global all-device revocation (`POST /api/v1/auth/logout-all`).
- **Identity Middleware**: `authenticateUser` middleware resolving and validating sessions, populating `req.user`, `req.session`, and `req.auth`.
- **Database Availability Guard**: `requireDatabase` middleware returning fast 503 `SERVICE_UNAVAILABLE` error envelopes when MongoDB is offline, preventing 10-second command buffering timeouts.
- **Rate Limiting**: Tiered IP rate limiters on OTP request, OTP verify, and Google auth routes via `express-rate-limit`.
- **Frontend Authentication UI**: React modal dialog (`AuthModal`) with Google sign-in button, email input, 6-digit OTP inputs with auto-advance and paste support, resend countdown, and session status navbar (`UserNav`).
- **Automated Test Suite**: 24 server integration and unit tests + 2 client component tests passing 100%.
- **Documentation**: Created `docs/decisions/ADR-010-account-linking.md`, `docs/phases/phase-01-authentication-report.md`, and updated `docs/interview/INTERVIEW_GUIDE.md`.

---

## [0.1.1] - 2026-10-03

### Phase 00.1 — Documentation Reconciliation & Foundation Corrections

#### Added
- **Canonical Security Specification**: Created `docs/SECURITY.md` establishing the Phase 00 baseline controls and defining mandatory security requirements for Phase 01 (Authentication) and subsequent phases.
- **Authentication Architecture Decision (ADR-009)**: Created `docs/decisions/ADR-009-authentication-architecture.md` formally adopting a self-managed native MongoDB session architecture (Google OAuth 2.0 + passwordless email OTP) and resolving split-brain database concerns prior to Phase 01.
- **Phase 00.1 Report**: Authored `docs/phases/phase-00.1-documentation-reconciliation.md` documenting findings, changes, verification, and interview preparation.

#### Changed
- **Dependency Registry Accuracy**: Updated `docs/DEPENDENCIES.md` to explicitly distinguish between declared version ranges in `package.json` and resolved exact versions in `package-lock.json`.
- **Project Context Synchronization**: Updated `docs/PROJECT_CONTEXT.md` to mark Phase 00.1 as the active phase, clarifying that Phase 01 authentication is scheduled next and has not been implemented yet.
- **Implementation Journal**: Appended Phase 00.1 entry to `docs/IMPLEMENTATION_LOG.md`.

---

## [0.1.0] - 2026-10-03

### Phase 00 — Project Foundation, Repository Setup & Architecture Verification

#### Added
- **Repository Setup**: Initialized npm workspace monorepo linking `/client` and `/server`.
- **Architecture Review**: Authored `docs/architecture/ARCHITECTURE_REVIEW.md` resolving naming, auth, storage, and asynchronous pipeline considerations.
- **System Diagrams**: Authored `docs/architecture/SYSTEM_DIAGRAMS.md` with Mermaid diagrams for system architecture, client-server decoupling, mobile API relationship, and documentation workflow.
- **Frontend Foundation (`/client`)**: React 18, Vite, React Router DOM, and Tailwind CSS configured with a restrained, professional palette tailored for long study sessions.
- **Backend Foundation (`/server`)**: Node.js Express (ES Modules) with centralized environment loading, correlation ID middleware (`X-Request-ID`), standardized JSON error envelopes, and graceful MongoDB connectivity abstraction.
- **API Health Telemetry**: Created `GET /api/v1/health` returning service identity, uptime, environment, and database state.
- **Testing Suites**: Configured Vitest + Supertest for backend integration tests, and Vitest + React Testing Library + JSDOM for frontend component tests.
- **Environment & Git Hygiene**: Created `client/.env.example`, `server/.env.example`, and production-grade `.gitignore`.
- **Engineering Documentation System**: Established living engineering journal `docs/IMPLEMENTATION_LOG.md`, audited `docs/DEPENDENCIES.md`, updated `docs/PROJECT_CONTEXT.md`, and technical Q&A in `docs/interview/INTERVIEW_GUIDE.md`.
- **Phase 00 Report**: Authored comprehensive Phase 00 implementation and interview study report in `docs/phases/phase-00-foundation.md`.
- **Root README**: Authored professional, comprehensive GitHub `README.md`.
