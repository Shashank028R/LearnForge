# LearnForge — Canonical Security Specification & Baseline

This document is the authoritative security architecture specification for **LearnForge**. It establishes the security controls implemented in the Phase 00 foundation, the authentication security controls implemented in Phase 01, and future security controls scheduled for subsequent phases.

---

## 1. Security Architecture Implementation Matrix

| Security Domain | Control Description | Status / Target Phase | Verification Method |
| :--- | :--- | :--- | :--- |
| **Secret Management** | Zero credentials in git; `.env.example` templates; strict `.gitignore` | **Implemented in Phase 00** | Repository audit; regex scan |
| **CORS Policy** | Restrict cross-origin access to configured `CLIENT_ORIGIN` | **Implemented in Phase 00** | Express CORS middleware in `app.js` |
| **Request Correlation** | Cryptographically secure `X-Request-ID` attached to all requests/responses | **Implemented in Phase 00** | Middleware in `requestId.js`; integration test |
| **Information Leakage** | Standard error envelopes; stack traces suppressed in production | **Implemented in Phase 00** | `errorHandler.js`; 404/500 integration tests |
| **Resilient DB State** | Safe connection handling without leaking connection string credentials | **Implemented in Phase 00** | `database.js` error wrapper; `requireDatabase` |
| **Dual Identity Auth** | Google OAuth 2.0 (OpenID Connect) & passwordless email OTP | **Implemented in Phase 01** | `auth.test.js` & `googleAuthService.test.js` |
| **OTP Security** | Cryptographic 6-digit generation, HMAC-SHA-256 peppered hash, short TTL, 5-attempt lockout | **Implemented in Phase 01** | `authCrypto.test.js` & `auth.test.js` (brute-force test) |
| **Session Lifecycle** | Opaque 256-bit tokens, SHA-256 hashed in MongoDB, HTTP-only SameSite Secure cookies | **Implemented in Phase 01** | Session tampering, cookie, & revocation tests |
| **Session Revocation** | Single logout (`/auth/logout`) and global all-device revocation (`/auth/logout-all`) | **Implemented in Phase 01** | `auth.test.js` revocation test |
| **Mobile Auth Support** | `Authorization: Bearer <token>` dual-header support for mobile clients | **Implemented in Phase 01** | `auth.test.js` header resolution test |
| **Deterministic Linking**| Auto-links verified Google identity with existing email-OTP user (ADR-010) | **Implemented in Phase 01** | `auth.test.js` account linking test |
| **Rate Limiting** | Tiered IP rate limiting for OTP request (5/15m), OTP verify (10/15m), Google auth (15/15m) | **Implemented in Phase 01** | `express-rate-limit` middleware |
| **User Data Ownership** | Server-side user ownership validation on all entity queries | **Required in Phase 03** | Cross-tenant authorization tests |
| **AI Untrusted Input** | Schema validation on LLM output before state mutation; prompt isolation | **Required in Phase 05/06** | AI Gateway output schema tests |
| **Import & File Security**| MIME type verification, size quotas, treating imports as inert data | **Required in Phase 11** | Import payload parser tests |
| **HTML Sanitization** | Structured block rendering and DOMPurify for rich text/notes | **Required in Phase 07/12**| XSS injection fuzzing |

---

## 2. Implemented in Phase 00 Baseline

### 2.1 Environment Configuration & Secret Hygiene
- **Zero Plaintext Secrets**: No API keys, database credentials, or signing secrets are tracked in version control.
- **Example Templates**: `client/.env.example` and `server/.env.example` define configuration schemas using placeholder values.
- **Strict `.gitignore`**: Excludes `.env`, `.env.*.local`, `node_modules/`, `build/`, `dist/`, logs, and operating system artifacts. Approved example files (`!*.env.example`) are explicitly whitelisted.

### 2.2 Cross-Origin Resource Sharing (CORS)
- In `server/src/app.js`, CORS is enforced using the `cors` middleware bound to `config.clientOrigin`:
  ```javascript
  app.use(cors({
    origin: config.clientOrigin,
    credentials: true,
  }));
  ```
- Wildcard origins (`*`) with credentials are expressly forbidden to prevent cross-origin credential harvesting.

### 2.3 Request Correlation IDs (`X-Request-ID`)
- Every HTTP request passing through `server/src/middleware/requestId.js` is assigned a correlation ID using Node's native `crypto.randomUUID()`, or preserves an incoming `x-request-id` header if valid.
- The correlation ID is attached to the HTTP response header (`X-Request-Id`), logged via Morgan, and included in all API error envelopes.

### 2.4 Centralized Error Response & Data Leakage Prevention
- Handled via `server/src/middleware/errorHandler.js`:
  ```json
  {
    "success": false,
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Human-readable description.",
      "details": []
    },
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
  ```
- Internal stack traces, raw Mongoose/MongoDB query errors, and provider internals are never returned to clients in production environments.

---

## 3. Implemented in Phase 01 (Authentication & User Identity)

### 3.1 Authentication Architecture (ADR-009)
- LearnForge uses a **self-managed, native MongoDB session architecture** paired with Google OAuth 2.0 (OpenID Connect) and passwordless email OTP.
- No passwords are created, accepted, or stored anywhere in the system, completely eliminating credential stuffing and rainbow table vectors.

### 3.2 Passwordless Email OTP Security Controls
1. **Cryptographic Generation**: 6-digit integers generated via cryptographically secure pseudo-random number generator (`crypto.randomInt(100000, 1000000)`).
2. **HMAC-SHA-256 with Server Pepper**: Plaintext OTP codes are never stored in MongoDB. The database stores an HMAC-SHA-256 hash using a server-side secret pepper (`OTP_HMAC_SECRET`) bound to the normalized email:
   $$\text{otpHash} = \text{HMAC-SHA-256}(\text{key}=\text{OTP\_HMAC\_SECRET}, \text{data}=\text{email} + ":" + \text{code})$$
   - Prevents offline brute-force cracking if the MongoDB database is compromised.
3. **Constant-Time Verification**: Verification uses `crypto.timingSafeEqual` to defend against timing side-channel attacks.
4. **Short Expiration (TTL)**: OTP codes expire strictly after **10 minutes**, enforced explicitly in code and cleaned up automatically via MongoDB TTL index.
5. **Attempt Throttling**: A maximum of **5 failed verification attempts** is permitted. Reaching 5 attempts immediately destroys the OTP token.
6. **Request Throttling**: An email address can only request a new OTP once every **60 seconds**, and an IP address can request at most **5 OTPs per 15 minutes** via `express-rate-limit`.
7. **Enumeration Resistance**: The OTP request endpoint returns an identical generic success message regardless of whether the email was previously registered.

### 3.3 Google OAuth 2.0 Security
- Server-side cryptographic verification of Google ID tokens using official `google-auth-library`.
- Claims verified: `aud` matches `GOOGLE_CLIENT_ID`, `iss` is `accounts.google.com` or `https://accounts.google.com`, `exp` is in the future, and `email_verified` is strictly `true`.
- **Deterministic Account Linking (ADR-010)**: If a user registered via Email OTP and later signs in with a verified Google account of the identical email, Google's `AuthIdentity` is attached to the existing `User` record without duplicating accounts.

### 3.4 Session Management & Cookie Security
- **Opaque Session Tokens**: High-entropy cryptographically random 256-bit token (`crypto.randomBytes(32).toString('hex')`).
- **Database Tracking**: MongoDB stores `sessionTokenHash` (SHA-256 of the token), `userId`, `deviceInfo`, `expiresAt` (30 days), and `revokedAt`. Raw tokens are never stored in the database.
- **Zero Web Token Exposure**: Raw session tokens are **never** returned in JSON responses to the browser (`POST /api/v1/auth/otp/verify` and `POST /api/v1/auth/google` return only user and session metadata).
- **No Browser Credential Storage**: Authentication credentials are strictly prohibited from `localStorage`, `sessionStorage`, IndexedDB, or persistent React state.
- **Cookie Security Flags**:
  - `HttpOnly`: Inaccessible to browser JavaScript via `document.cookie`, preventing direct credential extraction/exfiltration via script injection (note: `HttpOnly` protects the raw session token from being stolen, but application-level input hygiene, output encoding, and CSP remain necessary to prevent in-context malicious actions during XSS).
  - `Secure`: Transmitted only over HTTPS (in production).
  - `SameSite: 'Lax'`: Defends against Cross-Site Request Forgery (CSRF).
  - `Path=/` and explicit 30-day lifetime.
- **Session Revocation**:
  - Single logout (`POST /api/v1/auth/logout`): Marks the active session `revokedAt = new Date()` and clears the cookie.
  - Global logout (`POST /api/v1/auth/logout-all`): Sets `revokedAt = new Date()` on all active sessions for `userId`.
- **Mobile Architecture Parity**: The `authenticateUser` middleware supports dual resolution:
  1. Primary for web: Read session token from secure HTTP-only cookie (`learnforge_session`).
  2. Fallback for mobile: Read session token from `Authorization: Bearer <session_token>` header. Mobile clients will obtain tokens via a dedicated mobile authentication endpoint and store them in hardware-backed storage (iOS Keychain / Android Keystore).
- **Concurrent User Bootstrap Hardening**: User and identity creation handles MongoDB duplicate key error code 11000 on `normalizedEmail` and compound unique index `{ provider: 1, providerSubject: 1 }` gracefully, resolving the winner of the race condition without returning 500 errors.

---

## 4. Implemented in Phase 02 & 02.1 (UI Shell & Route Protection Boundaries)

### 4.1 Frontend Route Protection vs. Authoritative Backend Authorization
- **UI Route Boundary (`ProtectedRoute.jsx`)**: User-specific workspace routes (`/subjects`, `/chats`, `/notes`, `/study`, `/quizzes`, `/progress`, `/import`, `/profile` and nested parameter routes) are wrapped in a client-side layout guard. Unauthenticated users see an accessible sign-in invitation rather than private UI structures.
- **Zero Premature Content Rendering**: While session status is resolving (`loading === true`), `ProtectedRoute` renders a calm loading state, preventing any layout flicker or brief exposure of protected UI views.
- **Authoritative Security Principle**: Frontend route guards are strictly for user experience guidance. The browser environment is inherently client-controlled; therefore, the backend API (`server/src/middleware/auth.js`) remains the sole, authoritative boundary for data access. Every protected API endpoint independently authenticates the session and validates user ownership.
- **Zero Browser Storage Leakage**: The client never caches raw session tokens or user credentials in `localStorage` or `sessionStorage`. Authentication state is continuously backed by secure `HttpOnly`, `SameSite: 'lax'` cookies.

---

## 5. Required in Later Phases

### 4.1 Strict User Data Ownership Enforcement (Phase 03+)
- **Never Trust Client Identifiers**: Client requests containing `:subjectId`, `:chatId`, `:noteId`, or `:importId` must be authorized against the authenticated user:
  ```javascript
  const subject = await Subject.findOne({ _id: subjectId, userId: req.user._id });
  if (!subject) throw new NotFoundError('Subject not found');
  ```
- No user can access or mutate another user's learning data, chats, notes, or quiz attempts.

### 4.2 AI Untrusted Output & Prompt Injection Defense (Phase 05+)
- **AI Output is Untrusted**: Large language model responses are treated as untrusted input. Model outputs must be validated against strict runtime schemas (Zod) before modifying database state.
- **Prompt Injection Isolation**: Imported conversation transcripts and user notes are classified strictly as **inert data** within prompts (`<user_data>` delimiters) and never interpolated directly into system instructions.
- **No Direct Execution**: Model outputs can never execute arbitrary database queries, shell commands, or unparsed HTML.

### 4.3 Import & File Upload Security (Phase 11)
- **MIME & Extension Whitelisting**: Only approved formats (`application/json`, `text/plain`, `text/markdown`) are accepted.
- **Payload Size Limits**: Strict byte limits on uploaded files (5 MB) enforced before memory buffering.
- **Sanitized Filenames**: File storage keys use UUIDs or content-hash names.

### 4.4 Rich Text Sanitization & XSS Defense (Phase 07 & 12)
- Structured note blocks are stored as typed JSON objects rather than raw HTML strings (ADR-003).
- Any rendered markup in the frontend client is sanitized using `DOMPurify` before insertion into the DOM.
