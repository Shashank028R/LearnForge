# ADR-009 — Authentication Architecture: Self-Managed Native Sessions vs. Managed Provider

- **Status**: Accepted
- **Date**: October 2026
- **Decider**: Senior Full-Stack Software Architect
- **Target Phase**: Phase 01 (Authentication & User Identity)

---

## 1. Context

LearnForge requires a production-grade authentication and user identity system. The application serves two primary authentication workflows:
1. **Google OAuth 2.0 / Sign-In** (one-click federated identity).
2. **Passwordless Email OTP** (6-digit numeric verification code sent via transactional email).

Crucially, **traditional username/password authentication is intentionally omitted**. Users never create, store, or manage passwords in LearnForge, which eliminates the single largest attack surface in web applications (credential stuffing, weak password hygiene, password database breaches, and complex reset workflows).

LearnForge's application data is housed in MongoDB (with Mongoose ODM), with schemas already established in `DATABASE.md` for `User`, `AuthIdentity`, and `UserSession`. Before Phase 01 implementation begins, an architectural decision must be made: should authentication be handled by an external **Managed Authentication Provider** (e.g. Supabase Auth, Clerk, Firebase Auth, Auth0) or a **Self-Managed Native Session Architecture** built directly in Express and MongoDB?

---

## 2. Requirements

The chosen authentication architecture must satisfy the following technical requirements:
1. **Dual Identity**: Seamless support for Google OAuth and passwordless 6-digit email OTP.
2. **Account Linking**: Deterministic reconciliation if a user signs in via email OTP and later uses Google OAuth with the same verified email address.
3. **Session Lifecycle**: Secure browser persistence (surviving browser restarts), single-device logout, and global logout ("Logout all devices").
4. **Clean MongoDB Integration**: Immediate, zero-latency access to the `userId` in Mongoose queries without distributed transaction failures or asynchronous webhook synchronization lag.
5. **Future Mobile Readiness**: Ability for future iOS and Android apps (React Native or Flutter) to authenticate against the identical backend endpoints using bearer tokens.
6. **Security Burden**: Protection against OTP brute-force attacks, session hijacking, XSS token exfiltration, and CSRF.
7. **Cost & Sustainability**: Low operational cost that scales sustainably without steep per-MAU billing cliffs.
8. **Reliability & Data Sovereignty**: Zero external dependencies that could hold user identity data hostage or cause downtime for the core learning workspace.

---

## 3. Options Considered

### Option A: Managed Authentication Provider (e.g. Supabase Auth, Clerk, Auth0, Firebase)

- **Supabase Auth**: Generous free tier (50,000 MAUs), built-in GoTrue engine supporting Google OAuth and Email OTP, native mobile SDKs.
- **Clerk**: Exceptional pre-built React components and developer ergonomics, but limited free tier (10,000 MAUs) and expensive scaling ($25/month + $0.02/user).
- **Firebase Auth**: Robust Google identity integration and cross-platform mobile SDKs, but email OTP requires complex Firebase Identity Platform configuration or email action links rather than 6-digit numeric codes.
- **Auth0**: Comprehensive enterprise features, but steep pricing after 7,500 MAUs ($23+/month) and high configuration complexity.

**Key Architectural Flaw with Option A (Split-Brain Architecture)**:  
LearnForge's domain data (subjects, topics, notes, knowledge states, quizzes) lives in MongoDB. Every managed provider stores user identities in their proprietary cloud or PostgreSQL database. This forces a **distributed split-brain system**:
- Creating a user requires an asynchronous webhook or a post-signup client callback to sync the external `user_id` into MongoDB.
- Webhooks can fail, experience delivery latency, or arrive out of order, leading to orphaned user states or race conditions where a user tries to create a subject before their MongoDB record exists.
- Foreign keys across two different databases cannot be constrained or cascaded atomically.

### Option B: Self-Managed Native Session Architecture (Express + Mongoose + Native Crypto)

In this approach, the Express backend directly manages identity and sessions using LearnForge's existing MongoDB database:
- **Google OAuth**: Verified server-side via Google's official `google-auth-library` or standard OpenID Connect token verification.
- **Email OTP**: Cryptographically generated 6-digit codes (`crypto.randomInt`), stored as salted SHA-256 hashes with 10-minute TTL indexes in MongoDB, dispatched via transactional email (Resend / SendGrid / Nodemailer SMTP).
- **Session Model**: Opaque 256-bit cryptographically secure session tokens stored in the `UserSession` collection. Delivered to web browsers via HTTP-only, SameSite, Secure cookies, and accepted via `Authorization: Bearer <token>` headers for mobile clients.
- **Single Source of Truth**: `User`, `AuthIdentity`, and `UserSession` live in the exact same MongoDB database as the rest of the application.

---

## 4. Evaluation Matrix

| Criterion | Option A: Managed Provider (Supabase/Clerk) | Option B: Self-Managed Native Sessions | Winner |
| :--- | :--- | :--- | :--- |
| **MongoDB Integration** | **Poor**: Split-brain databases, requires webhook sync, risks race conditions | **Native**: Single source of truth, atomic transactions, zero sync latency | **Option B** |
| **Email OTP UX** | **Variable**: Often uses email action links or requires extra phone/identity add-ons | **Exact**: Custom 6-digit numeric OTP directly matching product design | **Option B** |
| **Google OAuth** | **Turnkey**: Provider dashboard configuration | **Standard**: Straightforward server-side Google ID token verification | **Option A (slight)** |
| **Session Control** | **Restricted**: Limited to provider token lifetimes and revocation APIs | **Complete**: Native `revokedAt` timestamps, instant global logout | **Option B** |
| **Future Mobile Support** | **Strong**: Ready-made mobile SDKs | **Strong**: Clean `/api/v1/auth/*` endpoints with Bearer token header support | **Tie** |
| **Vendor Lock-in** | **High**: Proprietary user IDs, migration requires exporting user databases | **Zero**: 100% open-source, standard Node.js & MongoDB primitives | **Option B** |
| **Operational Cost** | **Risk**: Free tier cliffs, per-user pricing scaling with growth | **Zero Extra Cost**: Runs within existing Express/MongoDB infrastructure | **Option B** |
| **Security Surface** | **Managed**: Provider handles token rotation and rate limiting | **Self-Governed**: Must implement rate limiting and OTP attempt limits | **Option A (slight)** |

---

## 5. Decision

**LearnForge will adopt Option B: Self-Managed Native Session Architecture** using Node.js, Express, and MongoDB.

Authentication will be implemented in Phase 01 using:
1. **Google OAuth 2.0 (OpenID Connect)**: Server-side validation of Google credentials via `google-auth-library`.
2. **Passwordless Email OTP**: 6-digit cryptographic tokens (`crypto.randomInt`), stored as salted hashes with 10-minute expiration in MongoDB, delivered via an abstracted transactional email service.
3. **Stateful Native Sessions**: Opaque session tokens hashed and tracked in the `UserSession` MongoDB collection, delivered via HTTP-only, SameSite, Secure cookies for web, with dual Bearer token header resolution for mobile clients.
4. **Zero Passwords**: No password hashing, salting, or storage libraries will be introduced.

---

## 6. Why the Decision Was Chosen

1. **Elimination of the Split-Brain Problem**:  
   By keeping user identity, auth identities, and user sessions inside MongoDB, LearnForge maintains a single, unified database. When a user authenticates for the first time, their profile is initialized atomically in the same database transaction that creates their default preferences.
2. **Passwordless Drastically Reduces Security Risk**:  
   The primary justification for heavy third-party auth platforms like Auth0 or Clerk is the immense burden of securely managing passwords (bcrypt/Argon2 tuning, credential stuffing attacks, breached password lists, reset emails). Because LearnForge uses **only Google OAuth and short-lived Email OTP**, that entire class of vulnerabilities is eliminated. Managing 6-digit OTP hashes and opaque session tokens in Node.js is clean, well-understood, and safe.
3. **Exact Product UX Control**:  
   Third-party providers frequently impose rigid UI components, redirected login pages, or email action magic links. LearnForge requires an in-app 6-digit verification code input that feels seamless and integrated with the study workspace.
4. **Complete Data Sovereignty & Portability**:  
   All user records remain under the project owner's direct control in MongoDB without vendor lock-in or surprise pricing tiers.

---

## 7. Trade-offs & Mitigations

| Trade-off | Mitigation |
| :--- | :--- |
| **Email Delivery Dependency**: Email OTP requires a reliable transactional email service (e.g. Resend, SendGrid, Amazon SES). | Abstract the email sender behind an `EmailService` interface. For local development, log OTP codes to the console/test log so development is completely offline-capable. |
| **Brute-Force & Rate Limiting Responsibility**: Developer must handle OTP abuse prevention. | Implement strict tiered rate limiting in Express (`express-rate-limit`): maximum 5 verification attempts per OTP, 1 request per 60 seconds per email, and 5 requests per 15 minutes per IP. |
| **Session Cleanup**: Expired sessions in MongoDB must not accumulate indefinitely. | Use native MongoDB TTL (Time-To-Live) indexes on the `expiresAt` field in the `UserSession` collection to allow MongoDB to purge expired records automatically. |

---

## 8. Migration / Exit Considerations

If LearnForge ever scales to an enterprise level requiring SAML/SSO or compliance certifications (SOC2, HIPAA) that justify a dedicated identity provider (e.g. Okta, WorkOS):
- The `AuthIdentity` collection already stores `(provider, providerSubject)`. Migrating to an external identity provider simply requires adding an adapter that maps the external provider subject to `AuthIdentity.providerSubject`.
- Because session verification is centralized in an Express middleware (`authenticateUser`), swapping the session verification mechanism requires altering only that single middleware without modifying domain controllers.

---

## 9. Consequences

### Positive Consequences
- Zero external database synchronization or webhook latency.
- Full atomic transactions in MongoDB across user creation and default workspace bootstrap.
- Zero subscription cost for user identity.
- Exact control over 6-digit OTP UX and email branding.
- Unified web and mobile API contracts (`/api/v1/auth/*`).

### Negative Consequences / Obligations for Phase 01
- Must implement rate limiting and brute-force throttling for OTP endpoints.
- Must configure transactional email provider credentials in production.
- Must handle Google OAuth credential registration in the Google Cloud Console.
