# ADR-010 — Deterministic Account Linking Policy

- **Status**: Accepted (Updated with Phase 01.1 Concurrency Hardening)
- **Date**: October 2026
- **Decider**: Senior Full-Stack Software Architect
- **Target Phase**: Phase 01 & 01.1 (Authentication & User Identity)

---

## 1. Context

LearnForge supports dual authentication methods:
1. **Google OAuth 2.0 (OpenID Connect)**.
2. **Passwordless Email OTP** (6-digit numeric verification code).

A common user journey involves signing in via one method and later returning via the other method using the same email address. For example:
- A user signs in using **Email OTP** (`alice@example.com`), creating a LearnForge user profile, subjects, and study history.
- In a later session, the user clicks **Continue with Google** using their Google account (`alice@example.com`, `email_verified = true`, `sub = "google-uid-123"`).

Without explicit account linking rules, an authentication system might:
- Accidentally create a second user account (`User B`), stranding the user's existing notes and history; OR
- Allow unverified external claims to attach to existing accounts, creating an account takeover vulnerability.

---

## 2. Decision

LearnForge implements a **server-enforced deterministic account linking policy** governed by verified email ownership:

### Rules:
1. **Canonical Identifier**: The primary user identity is identified by `User.normalizedEmail` (lowercase, trimmed).
2. **Primary Provider Resolution**:
   - When authenticating via Google OAuth, the system first queries `AuthIdentity` for `provider = "google"` and `providerSubject = sub`.
   - If an existing Google `AuthIdentity` is found, the system immediately resolves the associated `User`.
3. **Deterministic Linking on Email Match**:
   - If no Google `AuthIdentity` exists for `sub`, the system inspects the cryptographically verified Google ID token payload.
   - **Precondition**: Google's `email_verified` claim **must be strictly `true`**. If `email_verified` is not true, authentication is rejected with `AUTH_PROVIDER_ERROR` (unverified email cannot link).
   - The server queries `User.findOne({ normalizedEmail: verifiedEmail })`.
   - If an existing `User` is found (e.g. originally registered via Email OTP):
     - The server creates a new `AuthIdentity` record associating `provider = "google"` and `providerSubject = sub` with the **existing `User` ID**.
     - The user is logged into their existing account with zero data duplication.
   - If no existing `User` is found:
     - The server creates a new `User` record and attaches the Google `AuthIdentity`.
4. **Email OTP Registration Reconciliation**:
   - When a user verifies an email OTP, they prove control over `normalizedEmail`.
   - If a `User` already exists with that email (e.g. originally registered via Google), the OTP verification resolves that existing user. An `AuthIdentity` for `('email', normalizedEmail)` is created if not already present.
5. **Server-Side Enforcement Only**:
   - Account linking is never triggered or confirmed via client-side parameters. The client cannot send `{ "linkToUserId": "..." }`.
   - Linking is entirely automatic and server-determined based on cryptographic proof of email ownership.

---

## 3. Threat Model & Mitigations

| Threat | Risk Level | Mitigation |
| :--- | :--- | :--- |
| **Unverified Email Account Takeover**: Attacker creates a Google account with victim's email, but Google has not verified it. | Critical | **Strict `email_verified: true` check**: Google ID token claim `email_verified` must be boolean `true`. Unverified Google accounts are rejected. |
| **Identity Hijacking via Client-Supplied IDs**: Malicious client sends target `userId` in request body. | Critical | **Zero Client-Side Trust**: Client cannot specify `userId`. Linking logic exclusively uses verified server-side claims (`ticket.getPayload().email`). |
| **Race Conditions on Concurrent Registration**: Simultaneous sign-in via Google and OTP for the same email. | Medium | **MongoDB Unique Constraints & Code 11000 Interception**: Compound unique index `{ provider: 1, providerSubject: 1 }` and `{ normalizedEmail: 1 }`. Concurrent creations catch code `11000` duplicate key errors, safely resolving the winning document without returning 500 errors. |

---

## 4. Consequences

### Positive
- Users never experience duplicate "split" accounts when switching between Google sign-in and Email OTP.
- User notes, progress, and study history remain continuous and unified.
- Completely transparent and frictionless for the user.

### Negative / Obligations
- Server must rigorously inspect `email_verified` on all OAuth tokens.
- Transactional or retry-safe logic required when handling concurrent first-time sign-ins.
