# LearnForge — Living Project Context

## 1. Product Identity

**LearnForge** is an AI-powered learning workspace designed for serious students and professionals. It automatically transforms study conversations into structured, evolving knowledge, adaptive pedagogical study sessions, versioned notes, quizzes, and verifiable learning progress.

> **Core Philosophy**: Chat is the interaction layer. Knowledge is the product. Notes are the structured representation of that knowledge. AI is the pedagogical engine that evaluates, extracts, and organizes it.

---

## 2. Current Phase Status

- **Current Phase**: **Phase 01 — Authentication & User Identity (COMPLETED)**
- **Next Phase**: **Phase 02 — Professional UI Shell & Design System**
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
- **Frontend Authentication UI**: Accessible, responsive React modal and navigation components with Google sign-in and 6-digit OTP verification inputs.
- **Testing**: 33 automated unit and integration tests passing across client and server.

---

## 4. Current Work
- Phase 01.1 completed and verified.
- Awaiting project owner authorization before initiating Phase 02.

---

## 5. Upcoming Work (Phase 02)

- Build the professional productivity application shell (sidebar, top bar, responsive navigation).
- Establish the design system tokens, typography scales, and accessible component library (buttons, inputs, dialogs, toasts).
- Strictly adhere to productivity aesthetic rules: zero neon, zero glassmorphism, zero decorative blobs.

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
