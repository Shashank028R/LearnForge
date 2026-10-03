# ADR-009 — Authentication Architecture: Self-Managed Native Sessions vs. Managed Provider

- **Status**: Accepted (Updated with Technical Corrections for Phase 01)
- **Date**: October 2026
- **Decider**: Senior Full-Stack Software Architect
- **Target Phase**: Phase 01 (Authentication & User Identity)

---

## 1. Context

LearnForge requires a production-grade authentication and user identity system. The application serves two primary authentication workflows:
1. **Google OAuth 2.0 / Sign-In** (one-click federated identity via OpenID Connect).
2. **Passwordless Email OTP** (6-digit numeric verification code sent via transactional email).

Crucially, **traditional username/password authentication is intentionally omitted**. Users never create, store, or manage passwords in LearnForge, which eliminates password storage risks and password credential-stuffing concerns. However, **passwordless authentication does not eliminate authentication risk**: LearnForge remains directly responsible for OTP abuse prevention, account enumeration resistance, OAuth verification, secure session handling, CSRF/XSS protections, deterministic account linking, and authorization.

LearnForge's application data is housed in MongoDB (with Mongoose ODM), with schemas established in `DATABASE.md` for `User`, `AuthIdentity`, and `UserSession`. Before Phase 01 implementation begins, this ADR formally evaluates external **Managed Authentication Providers** (e.g. Supabase Auth, Clerk, Firebase Auth, Auth0) versus a **Self-Managed Native Session Architecture** built directly in Express and MongoDB.

---

## 2. Requirements

The chosen authentication architecture must satisfy the following technical requirements:
1. **Dual Identity**: Seamless support for Google OAuth and passwordless 6-digit email OTP.
2. **Account Linking**: Deterministic reconciliation if a user signs in via email OTP and later uses Google OAuth with the same verified email address (ADR-010).
3. **Session Lifecycle**: Secure browser persistence (surviving browser restarts), single-device logout, and global logout ("Logout all devices").
4. **Clean MongoDB Integration**: Immediate, zero-latency access to the `userId` in Mongoose queries without distributed transaction failures or asynchronous webhook synchronization lag.
5. **Future Mobile Readiness**: Ability for future iOS and Android apps (React Native or Flutter) to authenticate against the identical backend endpoints using bearer tokens.
6. **Security Hardening**: Protection against OTP brute-force attacks, offline hash cracking, session hijacking, XSS token exfiltration, and CSRF.
7. **Cost & Sustainability**: Predictable operational cost scaling with workload rather than per-identity platform fees.
8. **Reliability & Data Sovereignty**: Zero external auth provider dependencies that could hold user identity data hostage or cause downtime for the core learning workspace.

---

## 3. Options Considered

### Option A: Managed Authentication Provider (e.g. Supabase Auth, Clerk, Auth0, Firebase)

Current managed authentication providers are mature and capable:
- **Supabase Auth**: Built on GoTrue, supports Google OAuth, email OTP (6-digit numeric codes via custom email templates), and mobile SDKs. (Hosted free tier historically offers up to 50k MAUs as of 2026; pricing models remain subject to change by provider).
- **Clerk**: Offers pre-built React components, Google OAuth, and native 6-digit email OTP. (Free tier historically covers up to 10k MAUs with per-MAU scaling tiers thereafter; pricing subject to change).
- **Firebase Auth**: Robust Google identity integration and cross-platform mobile SDKs; email OTP typically relies on email action links or Firebase Identity Platform extensions.
- **Auth0**: Comprehensive enterprise identity provider with extensive compliance features, with usage-based pricing tiers scaling with MAUs.

**Architectural Assessment of Managed Providers for LearnForge**:  
While managed providers *do* support 6-digit email OTP and Google OAuth, adopting an external provider introduces a major architectural drawback for LearnForge: the **Split-Brain Database Problem**:
- LearnForge's domain data (subjects, topics, notes, knowledge states, quizzes) resides in MongoDB. Every managed provider stores user identities in an external cloud database (e.g. Supabase PostgreSQL or Clerk multi-tenant storage).
- Creating a user requires an asynchronous webhook or a post-signup client callback to sync the external `user_id` into MongoDB.
- Webhooks can fail, experience delivery latency, or arrive out of order, leading to orphaned user states or race conditions where a user tries to create a subject before their MongoDB record exists.
- Cross-database transactions are impossible, preventing atomic rollbacks if user initialization fails.

### Option B: Self-Managed Native Session Architecture (Express + Mongoose + Native Crypto)

In this approach, the Express backend directly manages identity and sessions using LearnForge's existing MongoDB database:
- **Google OAuth**: Verified server-side via Google's official `google-auth-library` (OpenID Connect token verification).
- **Email OTP**: Cryptographically generated 6-digit codes (`crypto.randomInt`), secured at rest using **HMAC-SHA-256 with a server-side secret pepper** (`OTP_HMAC_SECRET`), stored with explicit 10-minute expiration and MongoDB TTL cleanup, dispatched via transactional email (Resend / SendGrid / Nodemailer SMTP).
- **Session Model**: Opaque 256-bit cryptographically secure session tokens stored in the `UserSession` collection as SHA-256 hashes. Delivered to web browsers via HTTP-only, SameSite, Secure cookies, and accepted via `Authorization: Bearer <token>` headers for mobile clients.
- **Single Source of Truth**: `User`, `AuthIdentity`, and `UserSession` live in the exact same MongoDB database as the rest of the application.

---

## 4. Evaluation Matrix

| Criterion | Option A: Managed Provider (Supabase/Clerk) | Option B: Self-Managed Native Sessions | Winner |
| :--- | :--- | :--- | :--- |
| **MongoDB Integration** | **Split-Brain**: Requires webhook sync; vulnerable to race conditions | **Native**: Single source of truth, atomic operations, zero sync latency | **Option B** |
| **Email OTP UX** | **Supported**: 6-digit codes supported, but template/workflow constrained by provider | **Exact**: Direct control over 6-digit numeric OTP generation, verification, and email template | **Option B** |
| **Google OAuth** | **Turnkey**: Provider dashboard configuration | **Standard**: Straightforward server-side Google ID token verification via `google-auth-library` | **Option A (slight)** |
| **Session Control** | **Restricted**: Limited to provider token lifetimes and revocation APIs | **Complete**: Native `revokedAt` timestamps, instant global logout, explicit database state | **Option B** |
| **Future Mobile Support** | **Strong**: Ready-made mobile SDKs | **Strong**: Clean `/api/v1/auth/*` endpoints with Bearer token header support | **Tie** |
| **Vendor Lock-in** | **High**: Proprietary user IDs, migration requires exporting user databases | **Zero**: 100% open-source, standard Node.js & MongoDB primitives | **Option B** |
| **Operational Cost** | **Managed Subscription**: May incur per-MAU subscription fees as application scales | **No Auth Subscription**: No separate managed-auth subscription is required; infrastructure and transactional email still incur operational costs | **Option B** |
| **Security Surface** | **Delegated**: Provider handles brute-force and token rotation | **Self-Governed**: Application must handle OTP rate limiting, attempt throttling, and secure cookies | **Option A (slight)** |

---

## 5. Decision

**LearnForge adopts Option B: Self-Managed Native Session Architecture** using Node.js, Express, and MongoDB.

Authentication is implemented in Phase 01 using:
1. **Google OAuth 2.0 (OpenID Connect)**: Server-side validation of Google credentials via `google-auth-library`.
2. **Passwordless Email OTP**: 6-digit cryptographic tokens (`crypto.randomInt(100000, 1000000)`), secured using HMAC-SHA-256 with a dedicated server-side secret key (`OTP_HMAC_SECRET`), with 10-minute expiration and a strict 5-attempt limit.
3. **Stateful Native Sessions**: Opaque 256-bit session tokens hashed (SHA-256) and tracked in the `UserSession` MongoDB collection, delivered via HTTP-only, SameSite, Secure cookies for web, with dual Bearer token header resolution for mobile clients.
4. **Zero Stored Passwords**: No password hashing, salting, or storage libraries will be introduced.

---

## 6. Technical Clarification: OTP Hashing & Offline Guessing Defense

A 6-digit numeric OTP has only $10^6$ (1,000,000) possible values (from `100000` to `999999`). 

### Offline Guessing Threat Model
If an attacker compromises or gains a read-only dump of the MongoDB database:
- **Vulnerability of Standard Salted SHA-256**: If the salt is stored in the database record alongside a standard salted hash `SHA-256(salt + code)`, an attacker can iterate through all 1,000,000 combinations in milliseconds on standard consumer hardware, rendering database-stored salts ineffective against offline brute-forcing.
- **The Concrete Design: HMAC-SHA-256 with Server Pepper (`OTP_HMAC_SECRET`)**:
  LearnForge uses **HMAC-SHA-256** where the secret key is an application server environment variable (`OTP_HMAC_SECRET`) **not stored in MongoDB**:
  $$\text{otpHash} = \text{HMAC-SHA-256}(\text{key}=\text{OTP\_HMAC\_SECRET}, \text{data}=\text{normalizedEmail} + ":" + \text{code})$$
  - Without the server's secret pepper, an attacker with a database dump cannot verify candidate 6-digit guesses offline.
  - Binding `normalizedEmail` into the HMAC input prevents hash transplantation across different email addresses.
  - Verification uses constant-time comparison (`crypto.timingSafeEqual`) to prevent timing side-channel attacks.
  - Plaintext OTPs are never persisted to disk or database.

---

## 7. Why the Decision Was Chosen

1. **Elimination of the Split-Brain Problem**:  
   By keeping user identity, auth identities, and user sessions inside MongoDB, LearnForge maintains a single, unified database. When a user authenticates for the first time, their profile is initialized atomically in the same database operation that creates their default preferences.
2. **Elimination of Password Breach Liabilities**:  
   Passwordless authentication removes password storage and password credential-stuffing concerns. Managing 6-digit OTP hashes and opaque session tokens in Node.js is clean, well-understood, and safe.
3. **Exact Product UX Control**:  
   Direct control over the 6-digit OTP verification code experience without external redirects or third-party iframe overlays.
4. **Complete Data Sovereignty & Portability**:  
   All user records remain under direct control in MongoDB without vendor lock-in or subscription tiers.

---

## 8. Trade-offs & Mitigations

| Trade-off | Mitigation |
| :--- | :--- |
| **Email Delivery Dependency**: Email OTP requires a reliable transactional email service (e.g. Resend, SendGrid, Amazon SES). | Abstract the email sender behind an `EmailService` interface. For local development, log OTP codes to the console/test log so development is completely offline-capable. |
| **Brute-Force & Rate Limiting Responsibility**: Developer must handle OTP abuse prevention. | Implement strict tiered rate limiting in Express (`express-rate-limit`): maximum 5 verification attempts per OTP, 1 request per 60 seconds per email, and 5 requests per 15 minutes per IP. |
| **Session Cleanup**: Expired sessions in MongoDB must not accumulate indefinitely. | Use native MongoDB TTL (Time-To-Live) indexes on the `expiresAt` field in the `UserSession` collection to allow MongoDB to purge expired records automatically, while explicitly checking `expiresAt > now` at authorization time. |

---

## 9. Migration / Exit Considerations

If LearnForge ever scales to an enterprise level requiring SAML/SSO or enterprise compliance (SOC2, HIPAA) that justifies a dedicated identity provider (e.g. Okta, WorkOS):
- The `AuthIdentity` collection stores `(provider, providerSubject)`. Migrating to an external identity provider simply requires adding an adapter that maps the external provider subject to `AuthIdentity.providerSubject`.
- Because session verification is centralized in the `authenticateUser` middleware, swapping the session verification mechanism requires altering only that single middleware without modifying domain controllers.

---

## 10. Consequences

### Positive Consequences
- Zero external database synchronization or webhook latency.
- Full atomic transactions in MongoDB across user creation and default workspace bootstrap.
- No separate managed-auth subscription is required; infrastructure and transactional email still incur operational costs.
- Exact control over 6-digit OTP UX and email branding.
- Unified web and mobile API contracts (`/api/v1/auth/*`).

### Obligations for Phase 01 Implementation
- Implement rate limiting (`express-rate-limit`) and brute-force throttling for OTP endpoints.
- Maintain `OTP_HMAC_SECRET` in environment variables.
- Abstract transactional email delivery via `EmailService`.
- Verify Google OAuth OpenID Connect ID tokens server-side using `google-auth-library`.
