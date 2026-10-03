# LearnForge — Architecture Review & Verification (Phase 00)

**Date**: October 2026  
**Status**: Completed & Approved  
**Author**: Senior Full-Stack Software Architect & Engineer  
**Project**: LearnForge (AI-Powered Learning Workspace)  

---

## 1. Overview and Documents Reviewed

This review establishes the foundational architectural validation for LearnForge before any application feature code is written. Every document in the initial specification pack has been reviewed in detail:

- `README.md` (Legacy AI Study Workspace root documentation)
- `PROJECT_CONTEXT.md` (Living product state, pillars, modes, entities)
- `ARCHITECTURE.md` (System layers, responsibilities, domain boundaries, event flows)
- `TECH_STACK.md` (Frontend, backend, database, AI, auth, storage, testing choices)
- `DATABASE.md` (Entity schemas, relationships, indexing, invariants, progress calculation)
- `API.md` (Conventions, base paths `/api/v1`, endpoints, success/error contracts)
- `AI_ARCHITECTURE.md` (AI Gateway, task taxonomy, model router, prompts, guardrails)
- `KNOWLEDGE_ENGINE.md` (Event pipeline, concept resolution, learning states, confidence, conflict handling)
- `NOTES_ENGINE.md` (Structured block model, AI vs. user authority, versioning, update policies)
- `STUDY_MODE.md` (Strict teacher loop, answer evaluation, mastery logic, remediation)
- `QUIZ_SYSTEM.md` (Sources, generation pipeline, adaptive assessment, knowledge impact)
- `IMPORT_SYSTEM.md` (Input normalization, AI analysis, merge preview, source attribution)
- `SECURITY.md` (Auth, session security, API authorization, AI untrusted output, rate limiting)
- `DEPLOYMENT.md` (Environments, hosting strategy, logging, operations)
- `DEPENDENCIES.md` (Registry rules, selection criteria, initial categories)
- `CHANGELOG.md` (Historical and ongoing change tracking)
- `ADR-001` through `ADR-008` (Core architectural decisions)
- `INTERVIEW_GUIDE.md` (Technical question & answer framework)
- `phases/phase-00-foundation.md` through `phases/phase-17-final-audit.md` (18-phase implementation roadmap)

---

## 2. Contradictions Discovered & Resolutions

### Contradiction 1: Project Naming & Brand Identity
- **Issue**: The repository and repository prompt designate the project as **`LearnForge`** (`https://github.com/Shashank028R/LearnForge.git`), while the original documentation suite uniformly referred to the project by the working title **`AI Study Workspace`**.
- **Impact**: Confusing references across package manifests, titles, UI copy, and documentation.
- **Resolution**: The project is formally named **`LearnForge`**. All documentation headers, package manifests, and README files reflect LearnForge as the product name. Reference to "AI Study Workspace" is retained purely as historical context and functional descriptor ("an AI-powered learning workspace").

### Contradiction 2: Authentication Strategy — Self-Managed Session vs. Managed Provider
- **Issue**: 
  - `TECH_STACK.md` states: *"A production authentication provider may be used where it materially improves reliability and security. Provider selection must be documented in an ADR before implementation."*
  - `DATABASE.md` specifies explicit schemas for `UserSession` (with `sessionTokenHash`, `deviceInfo`, `expiresAt`, `revokedAt`) and `AuthIdentity` (with `provider`, `providerSubject`).
  - `API.md` defines custom endpoints for `/auth/otp/request`, `/auth/otp/verify`, `/auth/google/start`, `/auth/logout-all`.
  - `SECURITY.md` discusses cookie security, CSRF protection, and token rotation.
- **Impact**: If a third-party managed auth provider (e.g. Supabase Auth, Clerk, Auth0) is chosen, the database schemas for `UserSession` and custom OTP tables are redundant or conflict with the provider's token management. Conversely, if a self-managed auth architecture is used, backend-issued cryptographic session tokens with httpOnly cookies and Redis/MongoDB tracking are required.
- **Resolution for Phase 00**: No auth provider or library is locked in Phase 00. The server foundation will establish standard REST middleware boundaries with `/api/v1` routing. Before implementing Phase 01, an ADR (`ADR-009`) must formally record the decision between a self-managed cryptographic session/token service vs. a managed authentication service.

### Contradiction 3: Chat Response Latency vs. Synchronous Knowledge Pipeline
- **Issue**: 
  - `ARCHITECTURE.md` Section 6 ("Event-Oriented Internal Flow") specifies that a message triggers: `Message Created -> Conversation Service -> Learning Analysis Job -> Knowledge Engine -> Persist + Notify`.
  - `API.md` specifies `POST /chats/:chatId/messages`.
  - If knowledge extraction, concept deduplication, and note update proposals execute synchronously within the HTTP request cycle of `POST /chats/:chatId/messages`, response latency would exceed 5 to 15 seconds, creating an unacceptable chat user experience.
- **Impact**: Server request timeouts, poor UI responsiveness, and potential client-side retries generating duplicate learning events.
- **Resolution**: Chat message generation and knowledge processing must be decoupled:
  1. The chat assistant response is generated and persisted/streamed directly to the user.
  2. A domain event (`MESSAGE_RECEIVED` / `MESSAGE_COMPLETED`) is emitted in the background (via Node.js `EventEmitter` initially, and message queue later) to trigger the Learning Analysis Job asynchronously.
  3. Knowledge states and note change proposals update asynchronously, notifying the client through status polling or server-sent events.

### Contradiction 4: Topic-to-Note Cardinality
- **Issue**: 
  - `DATABASE.md` defines `NoteDocument` containing both `subjectId` and `topicId`, with an index on `(userId, subjectId, topicId)`.
  - `API.md` includes `GET /subjects/:subjectId/notes` and `GET /notes/:noteId`.
  - `NOTES_ENGINE.md` discusses notes organized by subject and topic. It is ambiguous whether each topic has exactly one canonical `NoteDocument` or multiple user-created notes per topic.
- **Impact**: Confusion in UI routing (`/subjects/:subjectId/topics/:topicId/notes`) and in automated AI note update targeting.
- **Resolution**: In the core model, each `Topic` has **one canonical structured NoteDocument** that aggregates all concepts within that topic. However, `NoteDocument` supports sub-documents or standalone documents if a user creates custom notes. The index `(userId, subjectId, topicId)` allows efficient lookup of the topic's canonical note.

### Contradiction 5: Storage Provider Selection for Local Development vs. Production
- **Issue**: 
  - `DATABASE.md` defines `FileAsset` (`storageProvider`, `storageKey`, `mimeType`, `size`, `checksum`).
  - `TECH_STACK.md` specifies that binary assets must use object storage rather than MongoDB documents.
  - However, local offline development cannot mandate an active AWS S3 or Cloudflare R2 bucket.
- **Impact**: Developers without cloud credentials cannot run or test import features locally.
- **Resolution**: Introduce a pluggable `StorageService` interface with a `LocalStorageProvider` (storing files in a secured local uploads directory with content-hash names) for development/test environments, and an `S3CompatibleStorageProvider` for staging and production.

---

## 3. Missing Decisions Identified & Phase 00 Resolutions

### Decision 1: Monorepo Organization & Script Orchestration
- **Gap**: The specification requested `/client`, `/server`, and `/docs`, but did not specify package manager workspace mechanics.
- **Resolution**: Establish an npm workspace at the root level (`package.json`) linking `client` and `server`. Root scripts (`npm run dev`, `npm run dev:client`, `npm run dev:server`, `npm test`, `npm run lint`) provide clean developer ergonomics without introducing complex monorepo tooling like Turborepo or Nx before it is needed.

### Decision 2: Automated Testing Stack
- **Gap**: `TECH_STACK.md` left the test runner and assertion libraries as "to be selected in Phase 00".
- **Resolution**:
  - **Runner**: `Vitest` for both backend and frontend. Vitest provides blazing-fast ESM-native execution, zero configuration overhead, unified syntax, and excellent compatibility with Vite.
  - **Backend API Testing**: `supertest` with Vitest for integration testing Express routes without binding live TCP ports.
  - **Frontend Testing**: `Vitest` + `jsdom` + `@testing-library/react` for UI component testing.

### Decision 3: Centralized Error and Response Envelopes
- **Gap**: `API.md` provided example JSON envelopes for success and error, but lacked standardized status code mappings and error classification.
- **Resolution**: Standardize on:
  - Success Envelope: `{ success: true, data: ..., meta: ... }`
  - Error Envelope: `{ success: false, error: { code: string, message: string, details?: any[] }, requestId: string }`
  - Standard error codes: `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `VALIDATION_ERROR`, `RATE_LIMITED`, `INTERNAL_SERVER_ERROR`, `SERVICE_UNAVAILABLE`.

### Decision 4: Safe Offline Database Handling
- **Gap**: If MongoDB is not running locally during Phase 00 setup or test execution, a naive `mongoose.connect()` will crash the process immediately.
- **Resolution**: Provide a resilient connection utility:
  - If `MONGODB_URI` is provided, attempt connection with a reasonable timeout.
  - If disconnected or failed, log a clear warning rather than crashing the HTTP server during development mode.
  - Expose database connectivity state explicitly in `GET /api/v1/health` (`database: "connected" | "disconnected" | "connecting"`).

---

## 4. Technically Risky Assumptions & Mitigations

| Risk | Likelihood | Impact | Architectural Mitigation |
| :--- | :--- | :--- | :--- |
| **Unchecked AI Note Mutation**: AI overwrites or degrades high-value notes written by the user. | High | Critical | **Risk-based policy (ADR-007)**: User-authored blocks have immutable authority over AI proposals. Low-risk additions are appended; medium/high-risk edits require explicit user diff approval. Immutable note versions (ADR-005) guarantee rollback. |
| **Prompt Injection via Imported Chats**: Malicious prompts in imported ChatGPT/Gemini conversations hijack system prompts. | High | High | **Input sanitization & tagging**: External imported text is strictly treated as untrusted data (`role: "user"` / data payload). System policies are isolated and never dynamically constructed from user input. |
| **Unbounded Document Size in MongoDB**: Storing massive conversation histories or note revisions inside single documents exceeding MongoDB's 16MB limit. | Medium | High | **Referenced collection design**: Messages, note versions, learning events, and quiz answers are stored in separate referenced collections with indexes, never unbounded embedded arrays. Large files use `FileAsset` + object storage. |
| **LLM Output Formatting Drift**: AI returns invalid JSON or fails to adhere to expected schemas. | High | Medium | **Schema validation barrier (Zod / JSON Schema)**: Model outputs are parsed and validated through runtime schemas before entering domain services. Malformed responses trigger normalized retries or fallbacks. |
| **Vendor Lock-in to Single AI Provider**: Hardcoding OpenAI or Anthropic SDK calls into business services. | Medium | High | **AI Gateway with Provider Adapters (ADR-002)**: Domain services request capability tokens (e.g. `CONCEPT_EXTRACTION`, `STUDY_TEACH`). Adapters normalize inputs, outputs, errors, and token metrics. |

---

## 5. Decisions Made in Phase 00

1. **Repository Structure**: Monorepo with `/client`, `/server`, and structured `/docs` hierarchy (`/architecture`, `/api`, `/database`, `/features`, `/phases`, `/decisions`, `/interview`, `/operations`).
2. **Language**: Standard modern JavaScript (ES Modules, Node 20+, browser ES2022) with JSDoc annotations for type documentation. TypeScript was deliberately avoided to maintain owner familiarity and rapid iteration as specified.
3. **Frontend Baseline**: React 18+, Vite, React Router DOM, Tailwind CSS (configured with a restrained, neutral, professional design system; no neon, glassmorphism, or decorative bloat).
4. **Backend Baseline**: Express.js with ES Modules, centralized error handling, correlation IDs (`requestId`), environment validation via `dotenv`, and Mongoose database connectivity abstraction.
5. **Testing Baseline**: Vitest + Supertest configured for fast local test execution.
6. **Documentation Pipeline**: Every phase must update its dedicated phase report, `PROJECT_CONTEXT.md`, `CHANGELOG.md`, `IMPLEMENTATION_LOG.md`, `DEPENDENCIES.md`, and `INTERVIEW_GUIDE.md`.

---

## 6. Items Deferred to Later Phases

- **Phase 01**: Final selection and implementation of the authentication mechanism (Google OAuth, passwordless email OTP, session storage).
- **Phase 02**: Complete design token implementation, component library, and application layout shell.
- **Phase 03**: Subject and topic Mongoose models, validation, and REST controllers.
- **Phase 04**: Chat persistence, conversation pagination, and streaming infrastructure.
- **Phase 05**: Concrete AI Gateway provider adapters (e.g. Gemini, OpenAI, Anthropic) and routing algorithms.
- **Phase 06-12**: Knowledge engine, notes engine, study mode, quiz generation, conversation import, and PDF export.
- **Phase 14-16**: Background job queue (e.g. BullMQ / Redis), rate limiting, and production cloud infrastructure.

---

## 7. Architectural Approval

The architecture of **LearnForge** is sound, cohesive, and thoroughly documented. With the resolutions and mitigations outlined in this review, the project foundation is validated for Phase 00 implementation.
