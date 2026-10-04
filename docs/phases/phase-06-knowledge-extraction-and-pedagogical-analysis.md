# Phase 06 — Knowledge Extraction Engine & Pedagogical Analysis Report

## 1. Objective
Build the first production-grade **Knowledge Extraction Engine & Pedagogical Analysis Subsystem** for LearnForge. The engine transforms conversational evidence into validated, auditable learning events (`LearningEvent`), canonical concept identities (`Concept`), bounded learning states (`NOT_STARTED` → `INTRODUCED` → `LEARNING` → `UNDERSTOOD` → `STRONG` / `NEEDS_REVIEW`), and deterministic topic knowledge aggregates (`Topic.knowledgeState` & `Topic.status`), while strictly upholding the core axiom:
> **"Chat is evidence. Knowledge is the product. Notes are the structured representation of that knowledge. AI is the pedagogical engine that evaluates and organizes it."**

---

## 2. Hard Phase Boundaries & Scope Enforcement
The following boundaries were strictly observed:
- **Zero Note Mutations**: No `NoteDocument` or `NoteVersion` entities were created, generated, or edited (deferred to Phase 07).
- **Zero Study Mode Enforcement**: Study Mode state machines and session locks remain deferred to Phase 08.
- **Zero Quiz Generation**: Quizzes and automated assessments remain deferred to Phase 10.
- **Zero Raw Transcript Conflation**: Raw chat transcripts are never treated as canonical knowledge.
- **Sole Source of State Mutation**: `Topic.knowledgeState` and `Topic.status` are updated solely through the `KnowledgeEngineService` and are never mutated directly by HTTP controllers.

---

## 3. Architecture & Data Model Changes

### A. Concept Model (`server/src/models/Concept.js`)
- Canonical domain entity for discrete units of knowledge within a topic.
- **Compound Unique Index**: `{ userId: 1, topicId: 1, normalizedName: 1 }`.
- **Compound Query Indexes**: `{ userId: 1, topicId: 1, status: 1 }`, `{ userId: 1, topicId: 1, confidenceScore: -1 }`.
- **Fields**: `userId`, `subjectId`, `topicId`, `name`, `normalizedName`, `aliases`, `normalizedAliases`, `description`, `status`, `confidenceScore` (0–100), `evidenceCount`, `misconceptions` (`[{ misconceptionText, correctionText, detectedAt, resolvedAt, isActive }]`), `conflictState` (`{ hasConflict, description, flaggedAt, resolvedAt }`), `lastStudiedAt`.

### B. LearningEvent Model (`server/src/models/LearningEvent.js`)
- Immutable, tenant-scoped ledger entry recording each discrete learning observation with source attribution.
- **Compound Unique Index (Idempotency)**: `{ userId: 1, idempotencyKey: 1 }`.
- **Query Indexes**: `{ userId: 1, topicId: 1, createdAt: -1 }`, `{ userId: 1, conceptId: 1, createdAt: -1 }`, `{ userId: 1, sourceMessageId: 1 }`.
- **Fields**: `userId`, `subjectId`, `topicId`, `chatId`, `sourceMessageId`, `conceptId`, `conceptName`, `eventType`, `classificationOutcome`, `evidenceText`, `confidenceScore`, `previousStatus`, `newStatus`, `misconception`, `idempotencyKey`, `metadata`.

### C. Knowledge Engine Components (`server/src/knowledge/`)
1. **`EventExtractor` (`extraction/eventExtractor.js`)**:
   - Calls the Phase 05 `AIGateway` with task `KNOWLEDGE_EVENT_EXTRACTION`.
   - Parses and validates structured JSON schema envelopes.
   - Deterministic rule-based fallback when AI providers are unconfigured or unavailable.
2. **`ConceptResolver` (`resolution/conceptResolver.js`)**:
   - Matches candidate concepts against existing records via exact normalized name (`normalizedName`) and normalized aliases (`normalizedAliases`).
   - Reconciles aliases dynamically when new synonyms or acronyms are discovered.
   - Classifies relationships: `NEW`, `EXISTING`, `DUPLICATE`, `COMPLEMENTARY`, `CORRECTION`, `CONFLICT`.
3. **`LearningStateMachine` (`state/learningStateMachine.js`)**:
   - Governs deterministic, bounded state transitions (`NOT_STARTED` → `INTRODUCED` → `LEARNING` → `UNDERSTOOD` → `STRONG` / `NEEDS_REVIEW`).
   - Diminishing returns confidence formula preventing artificial score inflation.
   - Misconception penalties (-20 to -35 points) with recovery upon correction.
   - Computes aggregate `Topic.knowledgeState.masteryScore` and `Topic.status`.
4. **`KnowledgeEngineService` (`services/knowledgeEngineService.js`)**:
   - Orchestrates the full pipeline with tenant verification, syllabus governance boundary checks, idempotency deduplication, and atomic multi-document MongoDB transactions on replica sets.

---

## 4. API Endpoints Mounted (`/api/v1`)

| Method | Path | Description | Security |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/topics/:topicId/concepts` | Lists concepts and aggregate mastery for an owned topic | Authenticated + DB Check |
| `GET` | `/api/v1/concepts/:conceptId` | Retrieves concept details and chronological learning events | Authenticated + DB Check |
| `GET` | `/api/v1/topics/:topicId/learning-events` | Lists chronological learning events for an owned topic | Authenticated + DB Check |
| `POST` | `/api/v1/topics/:topicId/extract-knowledge` | Explicitly triggers knowledge extraction on a verified exchange | Authenticated + DB Check |

---

## 5. Verification Summary

- **Automated Backend Tests**: **150 / 150 passed (100%)** across 11 test files (`server/tests/knowledgeEngine.test.js`, `server/tests/chats.test.js`, etc.).
- **Automated Frontend Tests**: **46 / 46 passed (100%)** (`client/src/App.test.jsx`, etc.).
- **Total Monorepo Tests**: **196 / 196 passed (100%)**.
- **Live Integration Verification (`server/scripts/verify_phase06_live.js`)**:
  - Live Express API health verified.
  - MongoDB Atlas replica set connected and multi-document transactions verified.
  - On-topic exchange created and extracted into `LearningEvent` and `Concept`.
  - Idempotency verified on repeated processing.
  - Misconception clarification and recovery verified.
  - Off-topic message governance exclusion verified.
  - Phase boundary verified: 0 `NoteDocument` / `NoteVersion` instances created.
  - Live Groq API verified with exact marker `"LearnForge Phase 06 Knowledge Engine Live Verified"`.
