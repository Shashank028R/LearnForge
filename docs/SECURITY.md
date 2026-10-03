# LearnForge — Canonical Security Specification & Baseline

This document is the authoritative security architecture specification for **LearnForge**. It establishes the security controls implemented in the Phase 00 foundation, the mandatory security requirements for Phase 01 (Authentication), and security controls scheduled for subsequent phases.

---

## 1. Security Architecture Implementation Matrix

To maintain total transparency and avoid ambiguity, every security control is explicitly classified by implementation status:

| Security Domain | Control Description | Status / Target Phase | Verification Method |
| :--- | :--- | :--- | :--- |
| **Secret Management** | Zero credentials in git; `.env.example` templates; strict `.gitignore` | **Implemented in Phase 00** | Repository audit; regex scan |
| **CORS Policy** | Restrict cross-origin access to configured `CLIENT_ORIGIN` | **Implemented in Phase 00** | Express CORS middleware in `app.js` |
| **Request Correlation** | Cryptographically secure `X-Request-ID` attached to all requests/responses | **Implemented in Phase 00** | Middleware in `requestId.js`; integration test |
| **Information Leakage** | Standard error envelopes; stack traces suppressed in production | **Implemented in Phase 00** | `errorHandler.js`; 404/500 integration tests |
| **Resilient DB State** | Safe connection handling without leaking connection string credentials | **Implemented in Phase 00** | `database.js` error wrapper |
| **Dual Identity Auth** | Google OAuth 2.0 (OpenID Connect) & passwordless email OTP | **Required in Phase 01** | Phase 01 test suite |
| **OTP Security** | Cryptographic 6-digit generation, hashing, short TTL, retry throttling | **Required in Phase 01** | Phase 01 security tests |
| **Session Lifecycle** | HTTP-only, SameSite, Secure cookies with database-backed revocation | **Required in Phase 01** | Session tampering & revocation tests |
| **Mobile Auth Support** | `Authorization: Bearer <token>` dual-header support for mobile clients | **Required in Phase 01** | Header validation tests |
| **User Data Ownership** | Server-side user ownership validation on all entity queries | **Required in Phase 01/03** | Cross-tenant authorization tests |
| **AI Untrusted Input** | Schema validation on LLM output before state mutation; prompt isolation | **Required in Phase 05/06** | AI Gateway output schema tests |
| **Import & File Security**| MIME type verification, size quotas, treating imports as inert data | **Required in Phase 11** | Import payload parser tests |
| **Rate Limiting** | Tiered rate limiting (OTP, auth, AI generation, imports) | **Required in Phase 01/14**| Load testing & abuse simulation |
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
- The correlation ID is:
  1. Attached to the HTTP response header (`X-Request-Id`).
  2. Injected into `req.id` and logged with request timing via Morgan.
  3. Included in every API error envelope to allow immediate log correlation during troubleshooting.

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

### 2.5 Database Access Principles
- Centralized through `server/src/config/database.js`.
- Connection timeouts (`serverSelectionTimeoutMS: 3000`) prevent hanging threads.
- Connection failures log sanitized error summaries without printing raw connection strings (which might embed username/password parameters).

---

## 3. Required in Phase 01 (Authentication & User Identity)

### 3.1 Authentication Architecture (ADR-009)
- LearnForge uses a **self-managed, native MongoDB session architecture** paired with Google OAuth 2.0 (OpenID Connect) and passwordless email OTP.
- No passwords are created, accepted, or stored anywhere in the system, completely eliminating credential stuffing and rainbow table vectors.

### 3.2 Passwordless Email OTP Security Rules
1. **Cryptographic Generation**: OTP tokens must be 6-digit integers generated via cryptographically secure pseudo-random number generators (`crypto.randomInt(100000, 1000000)`).
2. **At-Rest Protection**: Plaintext OTP codes must never be stored in MongoDB. The database stores a SHA-256 hash of the OTP paired with a salt or HMAC key:
   $$\text{storedHash} = \text{HMAC-SHA256}(\text{OTP}, \text{SECRET})$$
3. **Short Expiration (TTL)**: OTP codes expire strictly after **10 minutes** from generation, enforced via MongoDB TTL indexes.
4. **Attempt Throttling**: A maximum of **5 failed verification attempts** is permitted per OTP token. Exceeding this invalidates the OTP immediately.
5. **Request Throttling**: An email address can only request a new OTP once every **60 seconds**, and an IP address can request at most **5 OTPs per 15 minutes** to prevent email flooding/abuse.

### 3.3 Google OAuth 2.0 Security
- Implemented via standard OpenID Connect flow.
- ID tokens received from the client must be cryptographically validated server-side using Google's public keys (via `google-auth-library` or standard JWKS validation).
- Claims verified: `aud` matches `GOOGLE_CLIENT_ID`, `iss` is `accounts.google.com` or `https://accounts.google.com`, and `exp` is in the future.
- Account linking is deterministic: if an account exists with the verified Google email, the `AuthIdentity` is linked to the existing `User` record after email verification confirmation.

### 3.4 Session Management & Cookie Security
- **Opaque Session Tokens**: Sessions use a high-entropy cryptographically random 256-bit token (`crypto.randomBytes(32).toString('hex')`).
- **Database Tracking**: The database stores `sessionTokenHash` (SHA-256 of the token), `userId`, `deviceInfo`, `expiresAt`, and `revokedAt`.
- **Cookie Security Flags**:
  - `HttpOnly`: Inaccessible to browser JavaScript (protects against XSS token theft).
  - `Secure`: Transmitted only over HTTPS (in production).
  - `SameSite: 'Lax'` (or `'Strict'` where compatible): Defends against Cross-Site Request Forgery (CSRF).
- **Session Revocation**:
  - Single logout: Marks the active session `revokedAt = new Date()`.
  - Global logout ("Logout all devices"): Revokes all active sessions for `userId`.

### 3.5 Future Mobile Security Considerations
- Mobile applications (React Native, Flutter) cannot rely on web cookie storage due to platform-specific sandbox boundaries.
- The authentication middleware must support dual resolution:
  1. Primary for web: Read session token from secure HTTP-only cookie.
  2. Fallback for mobile/API: Read session token from `Authorization: Bearer <session_token>` header.
- This ensures mobile compatibility without weakening web cookie defenses.

---

## 4. Required in Later Phases

### 4.1 Strict User Data Ownership Enforcement (Phase 03+)
- **Never Trust Client Identifiers**: Client requests containing `:subjectId`, `:chatId`, `:noteId`, or `:importId` must be authorized against the authenticated user:
  ```javascript
  const subject = await Subject.findOne({ _id: subjectId, userId: req.user._id });
  if (!subject) throw new NotFoundError('Subject not found');
  ```
- No user can access or mutate another user's learning data, chats, notes, or quiz attempts.

### 4.2 AI Untrusted Output & Prompt Injection Defense (Phase 05+)
- **AI Output is Untrusted**: Large language model responses are treated as untrusted input. Model outputs must be validated against strict runtime schemas (Zod) before modifying database state.
- **Prompt Injection Isolation**: Imported conversation transcripts and user notes are classified strictly as **inert data** within prompts (`<user_data>` delimiters) and never interpolated directly into system instructions or execution contexts.
- **No Direct Execution**: Model outputs can never execute arbitrary database queries, shell commands, or unparsed HTML.

### 4.3 Import & File Upload Security (Phase 11)
- **MIME & Extension Whitelisting**: Only approved formats (`application/json`, `text/plain`, `text/markdown`) are accepted.
- **Payload Size Limits**: Strict byte limits on uploaded files (e.g. 5 MB) enforced before memory buffering.
- **Sanitized Filenames**: File storage keys use UUIDs or content-hash names; original client filenames are never used as filesystem or object storage paths.
- **Malicious Payload Mitigation**: Imported JSON structures are parsed in isolated try/catch blocks with bounded recursion depth.

### 4.4 Rich Text Sanitization & XSS Defense (Phase 07 & 12)
- Structured note blocks (headings, paragraphs, code, callouts) are stored as typed JSON objects rather than raw HTML strings (ADR-003).
- Any rendered markup in the frontend client is sanitized using `DOMPurify` before insertion into the DOM.

### 4.5 Rate Limiting & Abuse Prevention (Phase 14)
Tiered rate limiting using `express-rate-limit`:
1. **Authentication & OTP**: Strictest limits (5 attempts / minute).
2. **AI Gateway Generation**: Bounded by user quotas (e.g. 20 requests / minute) to prevent API credit exhaustion.
3. **Import Parsing**: Resource-intensive processing throttled to 5 jobs / hour per user.
4. **Export / PDF Generation**: Throttled to 10 exports / hour per user.

---

## 5. Security Audit Checklist for Production Readiness

Before graduating to production (Phase 16):
- [ ] No secrets committed in git history (`git log -S` audit).
- [ ] Automated dependency vulnerability audit (`npm audit --production`).
- [ ] Cross-tenant data isolation verified via automated security tests.
- [ ] Rate limiters active on all public and authenticated endpoints.
- [ ] OWASP Top 10 defenses verified (injection, broken auth, XSS, CSRF).
- [ ] Strict Content Security Policy (CSP) and security headers configured via `helmet`.
- [ ] Database backups configured with point-in-time recovery and encryption at rest.
