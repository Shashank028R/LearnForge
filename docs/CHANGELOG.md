# Changelog

All notable changes to the LearnForge project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-10-03

### Phase 00 — Project Foundation, Repository Setup & Architecture Verification

#### Added
- **Repository Setup**: Initialized npm workspace monorepo linking `/client` and `/server`.
- **Architecture Review**: Authored `docs/architecture/ARCHITECTURE_REVIEW.md` resolving naming, auth, storage, and asynchronous pipeline considerations.
- **System Diagrams**: Authored `docs/architecture/SYSTEM_DIAGRAMS.md` with Mermaid diagrams for system architecture, client-server decoupling, mobile API relationship, and documentation workflow.
- **Frontend Foundation (`/client`)**: React 18, Vite, React Router DOM, and Tailwind CSS configured with a restrained, professional palette tailored for long study sessions.
- **Backend Foundation (`/server`)**: Node.js Express (ES Modules) with centralized environment loading, correlation ID middleware (`X-Request-ID`), standardized JSON error envelopes, and graceful MongoDB connectivity abstraction.
- **API Health Telemetry**: Created `GET /api/v1/health` returning service identity, uptime, environment, and database state.
- **Testing Suites**: Configured Vitest + Supertest for backend integration tests, and Vitest + React Testing Library + JSDOM for frontend component tests.
- **Environment & Git Hygiene**: Created `client/.env.example`, `server/.env.example`, and production-grade `.gitignore`.
- **Engineering Documentation System**: Established living engineering journal `docs/IMPLEMENTATION_LOG.md`, audited `docs/DEPENDENCIES.md`, updated `docs/PROJECT_CONTEXT.md`, and technical Q&A in `docs/interview/INTERVIEW_GUIDE.md`.
- **Phase 00 Report**: Authored comprehensive Phase 00 implementation and interview study report in `docs/phases/phase-00-foundation.md`.
- **Root README**: Authored professional, comprehensive GitHub `README.md`.

#### Deliberately Deferred (Non-Goals for Phase 00)
- User authentication, Google OAuth, and OTP workflows (deferred to Phase 01).
- Complete UI screens and design tokens (deferred to Phase 02).
- Subject, topic, and concept schemas/models (deferred to Phase 03).
- Chat persistence and streaming endpoints (deferred to Phase 04).
- AI Gateway provider adapters and router (deferred to Phase 05).
