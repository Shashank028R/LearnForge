# LearnForge — Living Project Context

## 1. Product Identity

**LearnForge** is an AI-powered learning workspace designed for serious students and professionals. It automatically transforms study conversations into structured, evolving knowledge, adaptive pedagogical study sessions, versioned notes, quizzes, and verifiable learning progress.

> **Core Philosophy**: Chat is the interaction layer. Knowledge is the product. Notes are the structured representation of that knowledge. AI is the pedagogical engine that evaluates, extracts, and organizes it.

---

## 2. Current Phase Status

- **Current Phase**: **Phase 02 — Professional UI Shell & Design System (COMPLETED)**
- **Next Phase**: **Phase 03 — Subjects, Topics & Knowledge Structure**
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

### Phase 02 (Professional UI Shell & Design System)
- **Calm, High-Density Productivity Shell**: Persistent desktop sidebar, sticky topbar with breadcrumb and search trigger, responsive mobile drawer navigation.
- **Strict Anti-AI-Gimmick Design**: Zero neon, zero glowing borders, zero glassmorphism, zero decorative floating orbs, zero fake metrics.
- **Restrained Color & Surface Tokens**: Semantic tokens (`app.*`, `brand.*`, `status.*`), typography utilities, and low-distraction dark mode.
- **Complete Reusable UI Primitives Suite**: `Button`, `IconButton`, `Input`, `Dialog`, `Dropdown`, `EmptyState`, `Skeleton`, `LoadingState`, `ErrorState`, `Tabs`, `Divider`, `Avatar`, `Badge`, and native 1.5-stroke SVG `Icon`.
- **Authentic Routing & Empty States**: Clean routing foundation (`/`, `/subjects`, `/chats`, `/notes`, `/study`, `/quizzes`, `/progress`, `/import`, `/profile`, `/settings`) with authentic empty states and no fabricated data.
- **Refactored Auth UI Integration**: Preserved Google Identity Services, 6-digit OTP, paste support, and HttpOnly session cookies while removing demo styling.
- **Automated Tests**: 47 tests passing (30 server + 17 client).
- **Design System Spec**: Canonical documentation created at `docs/features/DESIGN_SYSTEM.md`.

---

## 4. Current Work
- Phase 02 completed and fully verified.
- Awaiting project owner authorization before initiating Phase 03.

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
