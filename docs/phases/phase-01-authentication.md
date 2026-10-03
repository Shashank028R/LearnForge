# Phase 01 — Authentication & User Identity

## Status: COMPLETE

## Objective

Implement reliable production-oriented authentication using Google sign-in and email OTP.

## Scope

- Google authentication (OpenID Connect via `google-auth-library`);
- email OTP request/verification (HMAC-SHA-256 with pepper, constant-time verification);
- account creation/login;
- account linking rules (ADR-010);
- database-backed opaque sessions (SHA-256 hashed, HTTP-only cookies);
- logout (single active session);
- logout all devices (`revokedAt` timestamp invalidation across all user sessions);
- protected routes with dual-mode cookie & Bearer token resolver;
- user profile bootstrap with idempotent creation.

## Security Requirements

- OTP expiration: 10 minutes (`expiresAt > now`);
- Resend throttling: 60-second cooldown per email;
- Verification attempt limits: 5 failed attempts per OTP before permanent invalidation;
- Server-side ownership enforcement: `req.user` attached by centralized middleware;
- Secure session lifecycle: 30-day opaque tokens, hashed at rest, instant revocation;
- No secrets in frontend: credentials and peppers restricted to server environment;
- Plaintext OTP protection: HMAC-SHA-256 with pepper stored outside database.

## Acceptance Criteria Verification

- [x] New user can register/login with Google (server-verified OIDC JWT via Google Identity Services);
- [x] User can sign in with email OTP (cryptographically secure 6-digit code);
- [x] Same email is handled deterministically (ADR-010 account linking);
- [x] Closing/reopening browser preserves session via persistent HTTP-only cookie;
- [x] Browser receives zero raw session tokens in JSON responses (`POST /auth/otp/verify` & `POST /auth/google`);
- [x] Web client stores zero credentials in `localStorage` or `sessionStorage`;
- [x] Logout works (cookie cleared, session revoked in DB);
- [x] Logout-all works (all active sessions for user marked revoked);
- [x] Protected APIs reject unauthenticated users with 401 `AUTH_REQUIRED`;
- [x] Concurrent user creation race (code 11000) resolved gracefully without 500 error;
- [x] Mobile bearer fallback tested and operational;
- [x] All 33 automated tests pass.

## Documentation

- Updated: `docs/SECURITY.md`, `docs/api/API.md`, `docs/DEPENDENCIES.md`, `docs/architecture/ARCHITECTURE.md`, `docs/database/DATABASE.md`, `docs/CHANGELOG.md`, `docs/PROJECT_CONTEXT.md`, `docs/interview/INTERVIEW_GUIDE.md`.
- Architecture Decisions: `docs/decisions/ADR-009-authentication-architecture.md`, `docs/decisions/ADR-010-account-linking.md`.
- Execution Report: `docs/phases/phase-01-authentication-report.md`.

