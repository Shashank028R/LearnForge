# LearnForge — Phase 01: Authentication & User Identity Execution Report

**Status**: PHASE 01 COMPLETE  
**Date**: October 2026  
**Repository**: [https://github.com/Shashank028R/LearnForge.git](https://github.com/Shashank028R/LearnForge.git)  
**Branch**: `main`

---

## 1. Architecture Overview

Phase 01 establishes the foundational identity and session management infrastructure for LearnForge. The system is designed around self-managed, database-backed sessions with dual-mode credential extraction (HTTP-only cookies for web browsers and Bearer tokens for mobile/CLI clients) and dual authentication pathways (Passwordless Email OTP and Google Sign-In via OpenID Connect).

```
                      +---------------------------------------+
                      |               Client                  |
                      |  (React SPA / Future Mobile Client)   |
                      +-------------------+-------------------+
                                          |
                      HTTPS Requests with |
                      Cookie / Bearer     |
                                          v
                      +---------------------------------------+
                      |         Express Router & App          |
                      |   cookieParser, rateLimiter, cors     |
                      +-------------------+-------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |      Authentication Middleware        |
                      |  - Extract cookie / Bearer token      |
                      |  - SHA-256 hash raw token             |
                      |  - Lookup active session in MongoDB   |
                      |  - Populate req.user, req.authSession |
                      +-------------------+-------------------+
                                          |
                        +-----------------+-----------------+
                        |                                   |
                        v                                   v
         +-----------------------------+     +-----------------------------+
         |     OTP Auth Controller     |     |   Google Auth Controller    |
         |  - 6-digit random code      |     |  - OIDC ID token validation |
         |  - HMAC-SHA-256 with pepper |     |  - google-auth-library      |
         |  - 5-attempt brute-force cap|     |  - Deterministic linking    |
         |  - Pluggable EmailService   |     |    (ADR-010)                |
         +--------------+--------------+     +--------------+--------------+
                        |                                   |
                        +-----------------+-----------------+
                                          |
                                          v
                      +---------------------------------------+
                      |      Persistence Layer (MongoDB)      |
                      |  - users (primary identity)           |
                      |  - auth_identities (external OAuth)   |
                      |  - user_sessions (hashed tokens)      |
                      |  - email_otp_tokens (peppered hashes) |
                      +-------------------+-------------------+
```

---

## 2. Passwordless Email OTP Lifecycle

### 2.1 Code Generation
- 6-digit numeric verification code generated using Node.js cryptographically secure randomness: `crypto.randomInt(100000, 1000000).toString()`.
- `Math.random()` is strictly prohibited.

### 2.2 Storage & Threat Mitigation
- **The Offline Guessing Problem**: A 6-digit code has only $10^6$ combinations. If stored as a plain SHA-256 hash in MongoDB, an attacker with a leaked database snapshot could brute-force all 1,000,000 possibilities in seconds.
- **The Pepper Solution**: LearnForge uses HMAC-SHA-256 keyed with a secret server-side pepper (`OTP_HMAC_SECRET`). This secret lives exclusively in server environment variables and is never committed to Git or stored in MongoDB. Leaking the database alone does not grant an attacker the ability to test candidate codes.
- Plaintext OTPs are never stored in the database.

### 2.3 Verification & Invalidation
- **Constant-Time Comparison**: Candidate code hashes are compared against stored hashes using `crypto.timingSafeEqual` to prevent timing side-channel attacks.
- **Attempt Tracking**: Each token document contains an `attempts` counter.
- **Automatic Invalidation**: If `attempts >= 5`, the token is immediately and permanently deleted, returning 400 `INVALID_OTP`. Five attempts out of $1,000,000$ yields a brute-force success probability of only $0.0005\%$.
- **Post-Verification Deletion**: Upon successful verification, the OTP token is deleted from MongoDB before the session is issued, preventing replay attacks.
- **TTL vs Explicit Checks**: While MongoDB TTL automatically garbage-collects expired tokens, the application explicitly verifies `expiresAt > new Date()` to ensure expiration is not subject to MongoDB TTL background sweep delays (which run every 60 seconds).

### 2.4 Resend Cooldown & Abuse Protection
- **Cooldown**: 60-second cooldown per normalized email.
- **IP Throttling**: 5 OTP requests per 15 minutes per IP address; 10 OTP verifications per 15 minutes per IP address via `express-rate-limit`.
- **Account Enumeration Resistance**: `POST /api/v1/auth/otp/request` returns the exact same envelope whether an account already exists or not:
  ```json
  {
    "success": true,
    "data": {
      "message": "If the email is valid, a verification code has been sent.",
      "expiresIn": 600,
      "resendCooldown": 60
    }
  }
  ```

---

## 3. Google Sign-In & OpenID Connect (OIDC)

### 3.1 Flow & Server-Side Verification
1. The client signs in via Google Identity Services and receives an OpenID Connect (OIDC) ID token (JWT).
2. The client transmits the ID token to `POST /api/v1/auth/google`.
3. The server uses `google-auth-library` (`OAuth2Client.verifyIdToken`) to fetch Google's JSON Web Key Set (JWKS) and verify:
   - **Cryptographic Signature**: Validated against Google's public certificates.
   - **Audience (`aud`)**: Must strictly match our configured `GOOGLE_CLIENT_ID`.
   - **Issuer (`iss`)**: Must match `accounts.google.com` or `https://accounts.google.com`.
   - **Expiration (`exp`)**: Token must be active (`exp > now`).
4. Client-supplied profile data is completely ignored; only claims extracted from the cryptographically verified JWT payload are trusted.

### 3.2 Deterministic Account Linking (ADR-010)
- If an existing `AuthIdentity` matches `{ provider: 'google', providerSubject: sub }`, the associated user is logged in.
- If no identity matches, the server inspects `email_verified`. If `true` and a user with matching `normalizedEmail` exists, a new `AuthIdentity` is linked to that existing `User`.
- If no user exists, a new `User` document and `AuthIdentity` are bootstrapped idempotently.
- Unverified Google emails (`email_verified: false`) are rejected with `AUTH_PROVIDER_ERROR` to prevent account takeover.

---

## 4. Session Architecture & Persistence

### 4.1 Opaque High-Entropy Tokens
- Rather than stateless JWTs, LearnForge issues 256-bit (32 bytes) cryptographically random hexadecimal tokens (`crypto.randomBytes(32).toString('hex')`).
- Tokens contain zero PII, zero claims, and cannot be decoded by clients.

### 4.2 Hashed Storage
- MongoDB stores only the SHA-256 hash of the session token:
  ```javascript
  const sessionTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  ```
- If MongoDB is compromised, the attacker cannot impersonate active users because SHA-256 is computationally irreversible.

### 4.3 Browser Cookie Flags
- **`HttpOnly: true`**: Inaccessible to JavaScript (`document.cookie`), completely mitigating token theft via XSS.
- **`Secure: true`** (in production): Transmitted only over TLS/HTTPS.
- **`SameSite: 'lax'`**: Protects against cross-site request forgery (CSRF).
- **`maxAge: 30 * 24 * 60 * 60 * 1000`**: 30-day persistent session.

### 4.4 Revocation & Logout
- **Logout Single**: Marks the current session `revokedAt = new Date()` and clears the cookie.
- **Logout All Devices**: `POST /api/v1/auth/logout-all` updates all active sessions for the user:
  ```javascript
  await UserSession.updateMany(
    { userId: req.user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  ```
  Immediately invalidates all mobile devices, desktop browsers, and active sessions.

---

## 5. Mobile & API Parity

The centralized authentication middleware (`server/src/middleware/auth.js`) extracts credentials using the following precedence:
1. `req.cookies.learnforge_session` (Browser cookie)
2. `req.headers.authorization` (`Bearer <session-token>`)

Both pathways resolve through the exact same token hasher, session lookup, user verification, and role attachment (`req.user`, `req.authSession`). Mobile applications can store the raw token in secure platform storage (iOS Keychain / Android Keystore) and authenticate without cookies.

---

## 6. Database Models & Indexes

| Model | Collection | Primary Fields | Key Indexes |
|---|---|---|---|
| `User` | `users` | `email`, `normalizedEmail`, `displayName`, `avatarUrl`, `accountStatus`, `preferences` | `{ normalizedEmail: 1 }` (unique), `{ email: 1 }` |
| `AuthIdentity` | `auth_identities` | `userId`, `provider`, `providerSubject`, `emailAtProvider` | `{ provider: 1, providerSubject: 1 }` (unique compound), `{ userId: 1 }` |
| `UserSession` | `user_sessions` | `userId`, `sessionTokenHash`, `expiresAt`, `revokedAt`, `authMethod`, `deviceInfo` | `{ sessionTokenHash: 1 }` (unique), `{ userId: 1 }`, `{ expiresAt: 1 }` (TTL) |
| `EmailOtpToken` | `email_otp_tokens` | `email`, `normalizedEmail`, `codeHash`, `attempts`, `expiresAt` | `{ normalizedEmail: 1 }`, `{ expiresAt: 1 }` (TTL) |

---

## 7. Security Threats & Mitigations

| Threat | Mitigation Strategy | Implementation |
|---|---|---|
| **Brute-force 6-digit OTP** | 5-attempt maximum, 10-minute expiry, IP rate limits, constant-time verification. | `authController.js`, `authCrypto.js`, `rateLimiter.js` |
| **Offline OTP cracking from DB dump** | HMAC-SHA-256 keyed with secret server pepper (`OTP_HMAC_SECRET`). | `authCrypto.js` |
| **Account enumeration** | Uniform response messages regardless of whether the email exists. | `authController.js` |
| **Session theft via XSS** | Web session token stored strictly in `HttpOnly` cookie. | `authController.js` |
| **Session theft via DB dump** | Only SHA-256 hash of session token stored in MongoDB. | `authController.js`, `auth.js` |
| **Cross-Site Request Forgery (CSRF)** | `SameSite: 'lax'` on session cookie. | `authController.js` |
| **OAuth impersonation / replay** | Server-side cryptographic signature, audience, issuer, and expiry verification. | `GoogleAuthService.js` |
| **Account takeover via unverified email** | OAuth linking strictly requires `email_verified: true` from provider (ADR-010). | `authController.js` |
| **Concurrent signup race conditions** | Unique compound indexes and code 11000 duplicate key handling. | `authController.js` |

---

## 8. Packages Installed & Evaluated

1. **`cookie-parser`** (`^1.4.7`):
   - *Purpose*: Parse incoming HTTP `Cookie` headers into `req.cookies`.
   - *Rationale*: Standard, battle-tested Express cookie parsing utility.
2. **`express-rate-limit`** (`^8.7.0`):
   - *Purpose*: Protect OTP and auth endpoints against abuse and brute-force attacks.
   - *Rationale*: Lightweight, standard Express middleware with configurable windows, max hits, and custom error responses.
3. **`google-auth-library`** (`^11.1.0`):
   - *Purpose*: Cryptographically verify Google OpenID Connect ID tokens on the server.
   - *Rationale*: Official, actively maintained Google authentication library; handles JWKS public key rotation, caching, and assertion validation.

---

## 9. Automated Testing Results

All 26 automated tests pass across both backend and frontend workspaces:

```
Test Files  4 passed (4)
     Tests  24 passed (24)
  Duration  1.41s (transform 323ms, setup 0ms, collect 520ms, tests 246ms)

Test Files  1 passed (1)
     Tests  2 passed (2)
  Duration  887ms
```

### Server Integration & Unit Tests (`server/tests/`)
1. **`authCrypto.test.js`**:
   - Generates 6-digit code with proper range;
   - Generates consistent HMAC-SHA-256 hashes with pepper;
   - Constant-time verification matches valid code and rejects invalid code;
   - Generates 64-character hex session token and deterministic SHA-256 hash.
2. **`googleAuthService.test.js`**:
   - Validates valid Google ID token and extracts claims;
   - Throws `INVALID_OIDC_TOKEN` when signature is invalid;
   - Throws `INVALID_AUDIENCE` when audience does not match `GOOGLE_CLIENT_ID`.
3. **`auth.test.js`**:
   - Request OTP: rejects invalid email format;
   - Request OTP: enforces 60-second cooldown on rapid resend;
   - Verify OTP: rejects nonexistent or expired OTP;
   - Verify OTP: tracks failed attempts and enforces 5-attempt limit with permanent invalidation;
   - Verify OTP: successfully authenticates and issues persistent session cookie;
   - Google Sign-In: rejects request missing ID token;
   - Google Sign-In: verifies token and creates new user + `AuthIdentity`;
   - Account Linking: links Google identity to existing user when `email_verified: true` (ADR-010);
   - Session Resolution: rejects unauthenticated requests with 401 `AUTH_REQUIRED`;
   - Session Resolution: returns authenticated user info via cookie;
   - Mobile Parity: returns authenticated user info via `Authorization: Bearer <token>`;
   - Logout: revokes active session and clears cookie;
   - Logout All: invalidates all active sessions for the user across all devices.

---

## 10. Problems Encountered & Solutions

### 10.1 Mongoose Command Buffering Delay During Database Outages
- **Problem**: When testing or developing without an active MongoDB connection, Mongoose defaults to buffering database commands for 10,000ms before timing out, causing auth requests to hang for 10 seconds.
- **Solution**: Implemented `requireDatabase` middleware in `server/src/middleware/databaseCheck.js`. It checks `mongoose.connection.readyState === 1`. If MongoDB is offline, it immediately terminates the request with 503 `SERVICE_UNAVAILABLE` and a clear diagnostic message, completely eliminating the 10-second hang.

### 10.2 Database-Dump Vulnerability for 6-Digit OTPs
- **Problem**: 6-digit OTPs ($10^6$ space) can be cracked offline in seconds if hashed with simple SHA-256 or salted SHA-256 when the database is dumped.
- **Solution**: Reconciled the ADR-009 discrepancy by adopting HMAC-SHA-256 with an environment-based server pepper (`OTP_HMAC_SECRET`). The pepper is decoupled from MongoDB, defeating offline rainbow table and dictionary attacks even if the database is completely leaked.

### 10.3 Window-Resize Listener in Vite Dev Overlay
- **Problem**: During browser subagent visual verification, the Vite development client injected an internal resize listener that triggered a warning in headless Chrome.
- **Solution**: Verified it was harmless Vite client HMR overlay code. Verified clean production builds (`npm run build:client`) have zero test or console errors.

---

## 11. Interview Preparation Highlights

The technical interviewer will probe the exact implementation details of this system. Key answers:
1. **Why not JWT in localStorage?** Vulnerable to XSS token theft; cannot be revoked instantly without maintaining a distributed denylist.
2. **Why hash session tokens in MongoDB?** If MongoDB is leaked, attackers cannot extract plaintext session bearer tokens.
3. **Why HMAC instead of salt for OTP?** 6-digit codes have low entropy ($10^6$). Salts stored alongside hashes do not stop offline brute-forcing once the DB is compromised. An external HMAC pepper stored only in memory/env variables prevents offline cracking without the server secret.
4. **How do you handle race conditions during simultaneous sign-ups?** Compound unique index `{ provider: 1, providerSubject: 1 }` on `AuthIdentity` and `{ normalizedEmail: 1 }` on `User`. Duplicate key error `11000` is caught gracefully and re-queries the winning record.
5. **How does mobile work?** Auth middleware checks cookies first, then falls back to `Authorization: Bearer <session-token>`.

---

## 12. Next Phase

**Phase 02 — User Preferences, Account Settings & Profile Management** (or subject domain modeling per roadmap).  
*Note*: Per project instructions, Phase 02 will NOT be started automatically.
