# Security Architecture

## 1. Security Objectives

Protect:

- account identity;
- authentication credentials/tokens;
- user conversations;
- notes and learning data;
- imported files;
- AI provider credentials;
- generated exports;
- cross-user isolation.

## 2. Authentication

Required mechanisms:

- Google sign-in;
- email OTP;
- secure session lifecycle;
- logout and global logout;
- account linking rules;
- OTP expiration;
- OTP retry/resend limits.

Do not store plaintext OTPs if avoidable. Store a secure representation and short-lived expiration metadata.

## 3. Authorization

Every authenticated API call must resolve the current user and enforce ownership.

Never trust:

- subject IDs from the client;
- chat IDs from the client;
- note IDs from the client;
- import IDs from the client.

Ownership must be checked server-side before reading or mutating data.

## 4. Session Security

The chosen session mechanism must address:

- secure cookie flags if cookies are used;
- CSRF protection where applicable;
- token expiration;
- rotation/revocation;
- refresh/session theft considerations;
- device/session management.

## 5. Input Validation

Validate all external input at the API boundary.

Examples:

- email formats;
- OTP format;
- subject/title lengths;
- note block schema;
- file type and size;
- chat message length;
- pagination parameters.

## 6. AI Security

AI output is untrusted content.

Do not let model output directly execute code, database queries, shell commands, or arbitrary HTML.

Structured AI outputs must be schema-validated before entering domain services.

## 7. Prompt Injection

Imported conversations and user-controlled documents can contain instructions that attempt to manipulate the AI system.

The AI architecture must clearly separate:

- trusted system instructions;
- developer/application policy;
- user content;
- imported external content.

Imported content must be treated as data to analyze, not as trusted instructions.

## 8. API Keys

AI, email, storage, and other provider credentials:

- server-side only;
- environment/secret-store managed;
- never exposed to browser code;
- never committed to git.

## 9. XSS / HTML

Notes may contain rich formatting. Sanitize any rendered HTML and prefer structured editor blocks over arbitrary raw HTML.

## 10. File Upload Security

For imports and attachments:

- validate MIME type and extension;
- enforce maximum size;
- use safe storage keys;
- scan where appropriate;
- never execute uploaded files;
- avoid directly serving private objects without authorization.

## 11. Rate Limiting / Abuse Prevention

Protect:

- OTP endpoints;
- login flows;
- AI generation;
- imports;
- PDF generation.

## 12. Data Minimization

Store only what is required for product functionality, debugging, security, or explicit analytics.

AI request logs must avoid unnecessary retention of sensitive conversation bodies.

## 13. Auditability

Security-sensitive actions should be attributable where useful:

- account changes;
- authentication changes;
- note deletions/reverts;
- import merge actions.

## 14. Recovery

Design for:

- AI provider failure;
- email delivery failure;
- database transient errors;
- storage failures;
- partially processed imports.

Critical user data mutations should be transactional where appropriate.

## 15. Production Checklist

Before production:

- secret audit;
- dependency vulnerability audit;
- authorization tests;
- authentication abuse tests;
- rate-limit tests;
- import payload tests;
- XSS tests;
- CORS configuration review;
- secure headers review;
- logging/PII review;
- backup/restore verification.
