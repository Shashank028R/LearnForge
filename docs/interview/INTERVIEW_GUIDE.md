# LearnForge — Technical Interview Preparation Guide

This living guide is continuously synchronized with the actual implementation of LearnForge. Every answer reflects concrete engineering decisions and codebase artifacts.

---

## 1. Project High-Level Overview

### Q1: What problem does LearnForge solve?
**Answer**:  
Standard AI chatbots (like ChatGPT or Claude) provide immediate, helpful answers, but insights remain trapped in ephemeral chat logs. When a session ends, the learning disappears, misconceptions go undetected, retention is unverified, and notes must be manually written.  
LearnForge treats **chat as the interaction layer and structured knowledge as the durable product**. It automatically extracts concepts, evaluates student comprehension in a strict pedagogical loop, updates structured block-based notes, and generates targeted quizzes directly from studied concepts.

### Q2: How does LearnForge differ from a generic "AI wrapper"?
**Answer**:  
A generic AI wrapper simply proxies chat prompts to an LLM with a system message. LearnForge introduces:
1. **A Canonical Knowledge Engine**: Decouples the chat transcript from the user's actual mastery state (ADR-004).
2. **Pedagogical Strictness**: Study Mode doesn't passively validate vague answers; it challenges reasoning, detects misconceptions, and requires active recall.
3. **Safe Note Automation**: AI updates are subject to risk policies (ADR-007) and immutable version snapshots (ADR-005) so user-authored notes are never silently overwritten.
4. **Provider-Agnostic Gateway**: Task-based model routing isolates business logic from vendor SDKs (ADR-002).

---

## 2. Phase 00 — Foundation & Repository Architecture

### Q3: Why did you choose a decoupled monorepo (`/client` and `/server`) with npm workspaces instead of heavy tools like Turborepo or Nx?
**Answer**:  
For Phase 00, introducing Turborepo, Nx, or Lerna would add speculative tooling complexity, unnecessary config, and build-cache overhead without immediate benefit. Native **npm workspaces** provides clean package separation, hoisted dependency management, unified scripts (`npm test`, `npm run dev`), and strict boundaries between frontend and backend while maintaining lightweight simplicity. If monorepo build times or caching ever become a bottleneck in future phases, migrating from npm workspaces to Turborepo is trivial.

### Q4: Why use standard JavaScript (ES Modules) instead of TypeScript?
**Answer**:  
The choice was deliberate to reduce language transpilation overhead, eliminate type-wrangling friction during rapid domain modeling, and align directly with the project owner's core development velocity. Clean ES Modules with Node 20+, JSDoc annotations, and runtime schema validation (e.g. Zod in later phases) give robust architectural clarity and fast iteration without build friction.

### Q5: Why did you choose Vitest across both frontend and backend instead of Jest?
**Answer**:  
1. **Unified Tooling**: Vitest shares the exact same transformation pipeline and config as Vite on the frontend, avoiding duplicated Babel/Webpack configs.
2. **ESM-Native**: Jest requires complex Babel transforms or experimental flags to handle native ES modules (`import`/`export`), whereas Vitest is ESM-native by default.
3. **Execution Speed**: Vitest uses worker threads and Vite's fast esbuild transform, running the backend integration tests and frontend component tests in under 2 seconds.
4. **Supertest Compatibility**: Supertest integrates seamlessly with Vitest to test Express HTTP endpoints without binding live TCP ports.

### Q6: How does the server handle database connectivity gracefully during development or outages?
**Answer**:  
In `server/src/config/database.js`, connection attempts to MongoDB are managed with a 3-second timeout (`serverSelectionTimeoutMS: 3000`). If MongoDB is offline or unreachable during local development, the server logs a clear diagnostic warning and continues in degraded mode rather than crashing the Node.js process. The runtime database state (`connected`, `disconnected`, `connecting`) is exposed in the `GET /api/v1/health` endpoint, making system health observable to monitoring tools and UI health probes.

### Q7: Why did you introduce `X-Request-ID` correlation IDs in Phase 00?
**Answer**:  
In a distributed or multi-service architecture (and especially when coordinating requests with external AI providers), request tracing is critical. The `requestIdMiddleware` in `server/src/middleware/requestId.js` checks for an incoming `x-request-id` header or generates a cryptographically secure UUID (`crypto.randomUUID()`). This ID is:
- Attached to the response header (`X-Request-Id`).
- Logged with every HTTP request via Morgan.
- Returned in every API error envelope (`{ success: false, error: {...}, requestId }`).  
This ensures that any client error or AI provider timeout can be immediately correlated to server logs.

### Q8: During your architecture review, what major contradiction or risk did you identify regarding chat latency and knowledge extraction?
**Answer**:  
The initial specification described an event flow where a user chat message triggered conversation persistence, AI concept detection, knowledge state updates, and note change diffs. If this entire pipeline executed synchronously within the `POST /chats/:chatId/messages` HTTP request, user-perceived chat latency would exceed 10–15 seconds.  
I resolved this by architecting the pipeline as **decoupled and asynchronous**: the chat response generates and streams/responds to the user immediately, while a domain event is dispatched to trigger the knowledge analysis and note proposal jobs in the background.

---

## 3. General Architecture & System Design Questions

### Q9: Explain the high-level layered architecture.
**Answer**:  
LearnForge follows a 4-tier layered architecture:
1. **Client Layer**: React SPA (web) and future mobile clients consuming standard `/api/v1` REST APIs.
2. **API & Middleware Layer**: Express HTTP routes, correlation ID tracking, rate limiting, and session authentication.
3. **Domain Services Layer**: Discrete domain boundaries—Auth, Study, Conversation, Knowledge Engine, Notes Engine, Quiz Engine, Import Engine, and the AI Gateway.
4. **Persistence & External Adapter Layer**: MongoDB (Mongoose ODM), object storage, external AI providers (Gemini, OpenAI, Anthropic), and transactional email.

### Q10: Why does LearnForge have an AI Gateway rather than calling provider SDKs directly from controllers?
**Answer**:  
Coupling controllers to specific AI SDKs causes vendor lock-in, scatters prompt templates across the codebase, makes testing difficult, and complicates fallback handling. The AI Gateway (ADR-002) abstracts providers behind capability contracts (`aiGateway.generate({ taskType, input, outputSchema })`). The task router automatically selects the optimal model based on reasoning complexity, latency, and cost, while normalizing provider errors and tracking token telemetry.

---

## 4. Documentation & Engineering Discipline

### Q11: What is the "Definition of Done" for LearnForge features?
**Answer**:  
Under ADR-008, a feature is **not** done merely because code was written. A feature is complete only when:
1. Requirements are implemented.
2. Automated unit/integration tests pass.
3. Standard error envelopes and edge cases are handled.
4. Relevant documentation is updated (`PROJECT_CONTEXT.md`, `CHANGELOG.md`, `DEPENDENCIES.md`, `INTERVIEW_GUIDE.md`).
5. A dedicated Phase Report is authored.
6. The implementation can be defended and explained in a technical interview.
