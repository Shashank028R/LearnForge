# LearnForge — Engineering Implementation Log

This log is the permanent chronological engineering journal for the LearnForge project. Every phase records its objective, work performed, architectural decisions, testing, problems, and solutions.

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
