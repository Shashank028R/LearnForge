# LearnForge

> An AI-powered learning workspace that transforms study conversations into structured, evolving knowledge, adaptive pedagogical sessions, versioned notes, quizzes, and verifiable progress.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![Status](https://img.shields.io/badge/Phase-06%20Knowledge%20Engine-indigo.svg)](docs/phases/phase-06-knowledge-extraction-and-pedagogical-analysis.md)

---

## 1. Project Overview

**LearnForge** bridges the gap between conversational AI and durable knowledge retention. While standard AI chat interfaces are effective at generating instant explanations, the resulting insights remain trapped in ephemeral chat logs. Once the conversation window closes, knowledge is scattered, retention is unmeasured, and the student is left with unstructured text.

LearnForge redefines the interaction model around a central axiom:

> **Chat is the interaction layer. Knowledge is the product. Notes are the structured representation of that knowledge. AI is the pedagogical engine that evaluates and organizes it.**

The application provides a distraction-free, professional environment tailored for intensive, long-form learning. It combines two complementary operational modes:
1. **Normal Chat Mode**: Open-ended conceptual inquiry and technical dialogue.
2. **Strict Study Mode**: A pedagogical loop where the AI acts as a patient but rigorous teacher—challenging assumptions, probing depth of understanding, detecting misconceptions, and refusing to mark concepts as mastered without demonstrated competence.

---

## 2. Why LearnForge?

- **Zero Ephemeral Loss**: Every meaningful insight, explanation, and clarification is extracted into a normalized knowledge graph rather than fading into chat history.
- **Pedagogical Rigor vs. Passive Flattery**: Standard chatbots passively validate superficial answers. LearnForge's Study Mode challenges weak reasoning and ensures active recall.
- **Protective Note Automation**: User-authored notes are never overwritten by speculative AI outputs. Automated enhancements follow a strict risk-based diff and versioning policy.
- **Targeted Knowledge Verification**: Quizzes and spaced assessments are generated directly from the specific concepts studied, feeding performance metrics back into mastery scores.
- **API-First & Mobile-Ready**: A decoupled, RESTful backend ensures that future mobile clients can synchronize seamlessly with the identical data model.

---

## 3. Core Workflow

```text
Study / Discuss
     │
     ▼
Pedagogical Evaluation (Detect misconceptions, assess depth)
     │
     ▼
Extract Learning Events (Canonical concepts, confidence signals)
     │
     ▼
Knowledge State Update (NOT_STARTED → LEARNING → UNDERSTOOD → STRONG)
     │
     ▼
Structured Notes Update (Immutable versions, risk-based diffs)
     │
     ▼
Adaptive Assessment & Quizzes (Generated from covered material)
     │
     ▼
Progress Telemetry & Review Signals
```

---

## 4. Key Capabilities

| Capability | Status | Description |
| :--- | :--- | :--- |
| **Monorepo Foundation** | **Implemented** | Decoupled client (`/client`) and server (`/server`) with npm workspaces, unified scripts, and strict environment isolation. |
| **API Health & Observability** | **Implemented** | Correlation IDs (`X-Request-ID`), standardized response envelopes, and runtime database connectivity telemetry. |
| **Architecture Documentation** | **Implemented** | 18 detailed phase specifications, 9 Architecture Decision Records (ADRs), system diagrams, and continuous interview guide. |
| **User Authentication** | **Implemented** | Dual-provider identity: Google OAuth 2.0 and passwordless email OTP with secure session lifecycle. |
| **Professional UI Shell** | **Implemented** | Distraction-free, restrained productivity UI without neon, glassmorphism, or decorative bloat. |
| **Subject & Topic Hierarchy** | **Implemented** | Hierarchical knowledge organization mapping subjects, topics, and canonical concepts. |
| **Conversational Engine** | **Implemented** | Streaming-ready message persistence and subject-scoped conversation contexts. |
| **AI Gateway & Router** | **Implemented** | Multi-provider abstraction (Gemini, OpenAI, Groq) with automated model routing by task complexity. |
| **Knowledge Engine** | **Implemented** | Canonical concept extraction, deduplication, confidence scoring, misconception tracking, and learning event ledgers. |
| **Structured Notes Engine** | *Planned (Phase 07)* | Block-based structured notes with immutable version history and risk-based AI merge proposals. |
| **Strict Study Mode** | *Planned (Phase 08)* | Adaptive teacher loop evaluating answer completeness, reasoning quality, and remediating weak points. |
| **Progress Engine** | *Planned (Phase 09)* | Verifiable mastery calculations derived from concept states rather than arbitrary percentages. |
| **Quiz & Assessment System** | *Planned (Phase 10)* | Automated quiz generation from studied concepts with deterministic and AI-evaluated scoring. |
| **Conversation Import** | *Planned (Phase 11)* | Import pipeline for ChatGPT and Gemini transcripts with merge preview and conflict detection. |
| **PDF Note Export** | *Planned (Phase 12)* | High-fidelity print/PDF export preserving structured headings, tables, and code snippets. |
| **Learning Analytics** | *Planned (Phase 13)* | Comprehensive student profile displaying topic coverage, mastery distribution, and review schedules. |

---

## 5. Technology Stack

### Frontend (`/client`)
- **Library**: React 18
- **Tooling & Dev Server**: Vite
- **Routing**: React Router DOM (v6)
- **Styling**: Tailwind CSS (configured for a restrained, professional, developer-focused aesthetic)
- **Test Runner**: Vitest + React Testing Library + JSDOM

### Backend (`/server`)
- **Runtime**: Node.js (v20+ LTS, ES Modules)
- **Framework**: Express.js
- **Database ODM**: Mongoose (MongoDB)
- **Observability**: Morgan HTTP logger + native UUID correlation tracking
- **Test Runner**: Vitest + Supertest

### System Invariants
- **Language**: Modern Standard JavaScript (ES2022+) with JSDoc annotations.
- **API Boundary**: Versioned base path at `/api/v1` with consistent success and error envelopes.
- **Security**: Strict credential hygiene (`.env.example` templates, zero credentials in source control).

---

## 6. Architecture Overview

LearnForge follows an **API-first, layered domain architecture**:

```text
[ Browser Web App ]           [ Future Mobile App ]
         │                              │
         └──────────────┬───────────────┘
                        ▼
            Reverse Proxy / CORS / Rate Limiting
                        │
                        ▼
             API Gateway (/api/v1)
      (X-Request-ID, Auth & Session Validation)
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
   [Chat Service] [Study Service] [Notes Service]
         │              │              │
         └──────────────┼──────────────┘
                        ▼
             [ AI Gateway & Router ]
            (Task-based Model Routing)
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
    [MongoDB]     [Object Storage] [External AI Providers]
```

Detailed architecture diagrams, sequence interactions, and mobile integration contracts are documented in [`docs/architecture/SYSTEM_DIAGRAMS.md`](docs/architecture/SYSTEM_DIAGRAMS.md).

---

## 7. Project Structure

```text
LearnForge/
├── client/                     # Frontend application (React + Vite + Tailwind)
│   ├── src/
│   │   ├── App.jsx             # Root application component
│   │   ├── main.jsx            # React DOM mounting & router setup
│   │   ├── index.css           # Tailwind base styles and design tokens
│   │   └── App.test.jsx        # Component unit tests
│   ├── .env.example            # Client environment variable documentation
│   ├── tailwind.config.js      # Restrained design system configuration
│   └── vite.config.js          # Vite build and proxy configuration
├── server/                     # Backend API server (Node.js + Express)
│   ├── src/
│   │   ├── config/             # Centralized environment and database connectivity
│   │   ├── middleware/         # Correlation ID and standardized error handlers
│   │   ├── routes/             # REST route handlers (/api/v1/health)
│   │   ├── app.js              # Express application factory
│   │   └── index.js            # Server entry point & lifecycle management
│   ├── tests/                  # Integration tests (Supertest + Vitest)
│   ├── .env.example            # Server environment variable documentation
│   └── package.json            # Server package manifest
├── docs/                       # Comprehensive engineering documentation
│   ├── architecture/           # System design, review, diagrams, tech stack
│   ├── api/                    # REST API specifications and contracts
│   ├── database/               # MongoDB entity schemas, relationships, indexes
│   ├── features/               # Knowledge engine, notes engine, study mode specs
│   ├── phases/                 # Phase-by-phase implementation specifications & reports
│   ├── decisions/              # Architecture Decision Records (ADR-001 through ADR-015)
│   ├── interview/              # Project-specific technical interview guide
│   ├── operations/             # Security controls and deployment runbooks
│   ├── PROJECT_CONTEXT.md      # Living project state and roadmap
│   ├── IMPLEMENTATION_LOG.md   # Chronological engineering log
│   ├── DEPENDENCIES.md         # Audited dependency registry
│   └── CHANGELOG.md            # Versioned changelog
├── .gitignore                  # Production-grade Git ignore rules
├── package.json                # Root monorepo workspace configuration
└── README.md                   # This document
```

---

## 8. Development Status

| Milestone | Phase | Scope | Status |
| :--- | :--- | :--- | :--- |
| **M0** | **Phase 00** | Project Foundation, Workspace Setup, Architecture Verification | **Completed** |
| **M1** | **Phase 01** | Authentication & User Identity (Google OAuth & Email OTP) | **Completed** |
| **M2** | **Phase 02** | Professional UI Shell & Design System | **Completed** |
| **M3** | **Phase 03** | Subjects, Topics & Canonical Concepts | **Completed** |
| **M4** | **Phase 04** | Chat Infrastructure & Message Persistence | **Completed** |
| **—** | **Phase 04.1** | Syllabus & Knowledge Governance Foundation | **Completed** |
| **M5** | **Phase 05** | AI Gateway & Automatic Model Router | **Completed** |
| **M6** | **Phase 06** | Concept Extraction & Pedagogical Analysis | **Completed** |
| **M7** | **Phase 07** | Structured Notes Engine | *Up Next (Awaiting authorization)* |
| **M8–M17**| **Phases 08–17** | Strict Study Mode through Final Production Audit | *Planned* |

---

## 9. Local Development & Setup

### Prerequisites
- **Node.js**: `v20.0.0` or higher
- **npm**: `v10.0.0` or higher
- **MongoDB**: Local MongoDB instance or free MongoDB Atlas cluster (optional for Phase 00)

### 1. Clone the Repository
```bash
git clone https://github.com/Shashank028R/LearnForge.git
cd LearnForge
```

### 2. Install Workspace Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy the example environment templates:
```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

### 4. Run the Development Servers
To boot both the Express API server and the Vite React frontend concurrently:
```bash
npm run dev
```

- **Frontend Client**: [http://localhost:5173](http://localhost:5173)
- **Backend API Server**: [http://localhost:5000](http://localhost:5000)
- **API Health Check**: [http://localhost:5000/api/v1/health](http://localhost:5000/api/v1/health)

---

## 10. Running Automated Tests

Run the complete test suite across the monorepo:
```bash
npm test
```

Or run test suites independently:
```bash
# Server API integration tests (Supertest + Vitest)
npm run test:server

# Client component tests (Vitest + JSDOM)
npm run test:client
```

---

## 11. Engineering Decisions (ADRs)

Key architectural decisions are documented as immutable Architecture Decision Records in [`docs/decisions/`](docs/decisions/):

- **[ADR-001](docs/decisions/ADR-001-product-architecture.md)**: Product Architecture — Knowledge Model as the Central Entity.
- **[ADR-002](docs/decisions/ADR-002-provider-agnostic-ai.md)**: Provider-Agnostic AI Gateway with Task-Based Routing.
- **[ADR-003](docs/decisions/ADR-003-structured-notes.md)**: Structured Typed Blocks Over Unrestricted HTML Blobs.
- **[ADR-004](docs/decisions/ADR-004-knowledge-separation.md)**: Decoupling Conversation Transcripts from Canonical Knowledge State.
- **[ADR-005](docs/decisions/ADR-005-note-versioning.md)**: Immutable Note Versions and Reversible AI Updates.
- **[ADR-006](docs/decisions/ADR-006-api-first-mobile-ready.md)**: API-First, Mobile-Ready Backend Contracts.
- **[ADR-007](docs/decisions/ADR-007-automatic-vs-review-note-updates.md)**: Risk-Based Note Update Automation Policy.
- **[ADR-008](docs/decisions/ADR-008-engineering-documentation.md)**: Documentation as an Immutable Build Requirement.
- **[ADR-009](docs/decisions/ADR-009-session-architecture.md)**: Self-Managed Native MongoDB Session Architecture.
- **[ADR-010](docs/decisions/ADR-010-account-linking-policy.md)**: Deterministic Account Linking Policy.
- **[ADR-011](docs/decisions/ADR-011-subject-topic-knowledge-structure.md)**: Subject-Topic Knowledge Structure and Mastery Level Contract.
- **[ADR-012](docs/decisions/ADR-012-chat-and-message-infrastructure.md)**: Chat and Message Infrastructure with Sequential Ordering.
- **[ADR-013](docs/decisions/ADR-013-syllabus-governance-and-immutability.md)**: Syllabus and Knowledge Governance Foundation.
- **[ADR-014](docs/decisions/ADR-014-ai-gateway-and-model-routing.md)**: AI Gateway Abstraction, Task-Based Model Routing & Pedagogical Engine.
- **[ADR-015](docs/decisions/ADR-015-knowledge-extraction-concept-resolution.md)**: Knowledge Extraction, Concept Resolution & Learning State.

---

## 12. Security Note

- **Zero Plaintext Secrets**: All sensitive keys, tokens, and credentials must reside in environment variables managed outside of source control.
- **AI Output as Untrusted Input**: Model outputs are schema-validated before modifying application state and never executed directly as raw code or queries.
- **Cross-User Isolation**: Every database operation enforces authenticated user ownership at the controller boundary.

---

## 13. Author & License

- **Author**: Shashank ([@Shashank028R](https://github.com/Shashank028R))
- **Repository**: [https://github.com/Shashank028R/LearnForge.git](https://github.com/Shashank028R/LearnForge.git)
- **License**: [MIT](LICENSE)
