# LearnForge — Living Project Context

## 1. Product Identity

**LearnForge** is an AI-powered learning workspace designed for serious students and professionals. It automatically transforms study conversations into structured, evolving knowledge, adaptive pedagogical study sessions, versioned notes, quizzes, and verifiable learning progress.

> **Core Philosophy**: Chat is the interaction layer. Knowledge is the product. Notes are the structured representation of that knowledge. AI is the pedagogical engine that evaluates, extracts, and organizes it.

---

## 2. Current Phase Status

- **Current Phase**: **Phase 00.1 — Documentation Reconciliation & Foundation Corrections (COMPLETED)**
- **Next Phase**: **Phase 01 — Authentication & User Identity**
- **Repository Remote**: `https://github.com/Shashank028R/LearnForge.git`
- **Default Branch**: `main`

---

## 3. Completed Foundation Work

- **Comprehensive Architecture Review**: Analyzed all 18 phase specifications, ADRs, database designs, API contracts, and security rules. Documented findings and resolved naming and architectural ambiguities in `docs/architecture/ARCHITECTURE_REVIEW.md`.
- **Engineering Documentation System**: Established the formal documentation hierarchy (`/docs/architecture`, `/docs/api`, `/docs/database`, `/docs/features`, `/docs/phases`, `/docs/decisions`, `/docs/interview`, `/docs/operations`), created living logs (`docs/IMPLEMENTATION_LOG.md`), and authored Mermaid system diagrams (`docs/architecture/SYSTEM_DIAGRAMS.md`).
- **Canonical Security Specification**: Created `docs/SECURITY.md` defining the Phase 00 baseline and explicit security requirements for Phase 01 and future phases.
- **Authentication Architecture Decision**: Authored `docs/decisions/ADR-009-authentication-architecture.md` formally establishing the self-managed native MongoDB session architecture (Google OAuth + passwordless email OTP) prior to Phase 01 implementation.
- **Dependency Registry Accuracy**: Updated `docs/DEPENDENCIES.md` distinguishing declared semver ranges in `package.json` from resolved exact versions in `package-lock.json`.
- **Monorepo Architecture**: Configured npm workspaces linking `/client` and `/server` with clean orchestration scripts.
- **Frontend Foundation (`/client`)**: Initialized React 18, Vite, React Router DOM, and Tailwind CSS configured for a restrained, professional productivity aesthetic (strictly zero neon, glassmorphism, or decorative bloat).
- **Backend Foundation (`/server`)**: Initialized Node.js Express (ES Modules) with centralized environment loading, correlation ID tracking (`X-Request-ID`), standardized JSON error/success envelopes, and resilient MongoDB connectivity abstraction.
- **Health & Telemetry**: Exposed `GET /api/v1/health` providing real-time uptime, service identity, environment, and database connectivity status.
- **Testing Baseline**: Configured Vitest + Supertest on backend and Vitest + React Testing Library + JSDOM on frontend.
- **Credential Hygiene**: Configured `client/.env.example`, `server/.env.example`, and comprehensive `.gitignore` preventing secret leakage.
- **GitHub Repository Setup**: Configured Git repository on `main` branch connected to remote.

---

## 4. Current Work (Phase 00.1)

- Reconciling documentation with actual repository state.
- Formally anchoring ADR-009 before writing any authentication code.
- Publishing canonical `docs/SECURITY.md`.
- Correcting dependency registry version descriptions.
- Awaiting project owner authorization before initiating Phase 01.

---

## 5. Upcoming Work (Phase 01)

- Implement Google OAuth 2.0 (OpenID Connect) server-side verification using `google-auth-library`.
- Implement passwordless email OTP request/verification pipelines with cryptographic generation and hashing.
- Implement server-side stateful session tracking in MongoDB (`UserSession`) with HTTP-only cookies and mobile Bearer token support.
- Build login and authentication modal/shell UI in React client.
- Secure protected routes with authentication middleware.

*(Note: Authentication has NOT been implemented yet. It is the core deliverable of Phase 01.)*

---

## 6. Current Architecture Summary

```text
[ Browser / Future Mobile ]
            │
            ▼
    API Layer (/api/v1)
 (X-Request-ID, Error Envelope)
            │
    ┌───────┴───────┐
    ▼               ▼
[Health Route] [Config & DB Abstraction]
                    │
                    ▼
            [MongoDB Connection]
```

---

## 7. Important Architectural Decisions Made

- **ADR-001**: Knowledge Model as central entity; conversations produce evidence.
- **ADR-002**: AI Gateway with provider adapters and task-based model routing.
- **ADR-003**: Structured typed blocks for notes instead of arbitrary HTML.
- **ADR-004**: Decoupling conversation transcripts from canonical knowledge states.
- **ADR-005**: Immutable note versions guaranteeing non-destructive AI updates.
- **ADR-006**: API-first, mobile-ready backend contracts.
- **ADR-007**: Risk-based note update automation policy.
- **ADR-008**: Documentation as an immutable build requirement.
- **ADR-009**: Self-Managed Native MongoDB Session Architecture for authentication (Google OAuth + Passwordless Email OTP).

---

## 8. Known Issues & Limitations

- Local MongoDB instance may not be present in offline developer environments; handled gracefully by connection abstraction without crashing HTTP server.
- Product feature endpoints (auth, chat, notes, AI) are deliberately unmounted until their scheduled phases.

---

## 9. Deferred Decisions

- **AI Model Selection**: Specific provider models (e.g. Gemini 1.5 Pro/Flash, Claude 3.5 Sonnet, GPT-4o) deferred to Phase 05.
- **Cloud Object Storage Provider**: AWS S3 vs. Cloudflare R2 deferred to Phase 11.
