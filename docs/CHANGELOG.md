# Changelog

All notable changes to the LearnForge project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
