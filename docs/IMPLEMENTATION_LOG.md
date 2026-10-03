# LearnForge — Engineering Implementation Log

This log is the permanent chronological engineering journal for the LearnForge project. Every phase records its objective, work performed, architectural decisions, testing, problems, and solutions.

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
