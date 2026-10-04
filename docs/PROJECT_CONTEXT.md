# LearnForge — Living Project Context

## 1. Product Identity

**LearnForge** is an AI-powered learning workspace designed for serious students and professionals. It automatically transforms study conversations into structured, evolving knowledge, adaptive pedagogical study sessions, versioned notes, quizzes, and verifiable learning progress.

> **Core Philosophy**: Chat is the interaction layer. Knowledge is the product. Notes are the structured representation of that knowledge. AI is the pedagogical engine that evaluates, extracts, and organizes it.

---

## 2. Current Phase Status

- **Current Phase**: **Phase 04.1 — Syllabus & Knowledge Governance Foundation (COMPLETED)**
- **Next Phase**: **Phase 05 — AI Gateway, Model Routing & Pedagogical Engine (Awaiting authorization)**
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
- **End-to-End Atomic Approval & Structural Invariant**: MongoDB Partial Unique Index `{ subjectId: 1, status: 1 }` (`partialFilterExpression: { status: 'approved' }`) physically preventing multiple approved versions per subject, multi-document ACID transactions on replica sets / Atlas, and pre/post reconciliation CAS guards preventing stale mutator state corruption under concurrency.
- **Subject `topicsCount` Semantic Contract**: Defined strictly as the count of active syllabus topics (`isActiveInSyllabus: true`). Subjects start with `no_syllabus` and `topicsCount: 0`. Pre-syllabus topics default to `isActiveInSyllabus: false`.
- **Topic Reconciliation & History Preservation**: Preserves stable `_id` and learning history across revisions; omitted topics become historical (`isActiveInSyllabus: false`) and re-added topics reactivate seamlessly.
- **Knowledge Semantic Layers & Annotations**: 7 distinct semantic layers; complete `Annotation` model and REST API for user notes and tags.
- **Interactive UI**: Syllabus governance panel, version history viewer, approval confirmation modal, and inline annotations.

---

## 4. Current Work
- Phase 04.1 complete. Awaiting explicit project-owner authorization before beginning Phase 05.

---

## 5. Upcoming Work (Phase 03 — Subjects, Topics & Knowledge Structure)
- Design and implement Subjects & Topics schema and knowledge hierarchies.
- Curriculum modules and topic taxonomy modeling.
- CRUD operations and subject workspace interaction.

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

---

## 7. Deferred Decisions
- **AI Model Selection**: Specific provider models (e.g. Gemini 1.5 Pro/Flash, Claude 3.5 Sonnet, GPT-4o) deferred to Phase 05.
- **Cloud Object Storage Provider**: AWS S3 vs. Cloudflare R2 deferred to Phase 11.
