# Phase 01 — Authentication & User Identity

## Objective

Implement reliable production-oriented authentication using Google sign-in and email OTP.

## Scope

- Google authentication;
- email OTP request/verification;
- account creation/login;
- account linking rules;
- session management;
- logout;
- logout all devices where supported;
- protected routes;
- user profile bootstrap.

## Security Requirements

- OTP expiration;
- resend throttling;
- verification attempt limits;
- server-side ownership enforcement;
- secure session lifecycle;
- no secrets in frontend;
- no plaintext OTP persistence if avoidable.

## Acceptance Criteria

- new user can register/login with Google;
- user can sign in with email OTP;
- same email is handled deterministically;
- closing/reopening the browser preserves the intended session behavior;
- logout works;
- protected APIs reject unauthenticated users;
- cross-user resource access is denied.

## Documentation

Update auth sections in SECURITY.md, API.md, DEPENDENCIES.md, ARCHITECTURE.md, CHANGELOG.md, and this report.
