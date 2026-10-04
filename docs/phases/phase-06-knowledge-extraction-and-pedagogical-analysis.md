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
- Append-only, immutable, tenant-scoped ledger entry recording each discrete learning observation with source attribution.
- **Append-Only Immutability**: Protected by Mongoose pre-hooks on `save` (if not new), `updateOne`, `updateMany`, `findOneAndUpdate`, `replaceOne`, `findOneAndReplace`, `deleteOne`, `deleteMany`, `findOneAndDelete`, AND a schema-level static `bulkWrite` guard blocking all update, replace, and delete operations. Timestamps schema configured with `{ createdAt: true, updatedAt: false }`.
- **Compound Unique Index (Idempotency)**: `{ userId: 1, idempotencyKey: 1 }`. Exchange-level base key `${userId}:${sourceMessageId}:${version}` used for primary event (i=0) and keyed suffix `:e${i}` for subsequent events, ensuring atomic deduplication across 1, 3, or 10 events.
- **Query Indexes**: `{ userId: 1, topicId: 1, createdAt: -1 }`, `{ userId: 1, conceptId: 1, createdAt: -1 }`, `{ userId: 1, sourceMessageId: 1 }`.
- **Fields**: `userId`, `subjectId`, `topicId`, `chatId`, `sourceMessageId`, `conceptId`, `conceptName`, `eventType`, `classificationOutcome`, `evidenceText`, `confidenceScore`, `previousStatus`, `newStatus`, `misconception`, `idempotencyKey`, `metadata`.

### C. Knowledge Engine Components (`server/src/knowledge/`)
1. **`EventExtractor` (`extraction/eventExtractor.js`)**:
   - Calls the Phase 05 `AIGateway` with task `KNOWLEDGE_EVENT_EXTRACTION`.
   - Consumes the normalized `AIResponse` contract (`{ text, provider, model, task, usage, routingMetadata, latencyMs }`).
   - Parses and validates structured JSON schema envelopes with markdown fence cleansing and robust array salvage for truncated JSON streams.
   - Deterministic rule-based fallback when AI providers are unconfigured or unavailable.
2. **`ConceptResolver` (`resolution/conceptResolver.js`)**:
   - Matches candidate concepts against existing records via exact normalized name (`normalizedName`) and normalized aliases (`normalizedAliases`).
   - Reconciles aliases dynamically when new synonyms or acronyms are discovered.
   - Classifies relationships: `NEW`, `EXISTING`, `DUPLICATE`, `COMPLEMENTARY`, `CORRECTION`, `CONFLICT`.
3. **`LearningStateMachine` (`state/learningStateMachine.js`)**:
   - Governs deterministic, bounded state transitions with explicit precedence:
     1. **Explicit Correction Precedence**: Valid `concept_corrected` / `CORRECTION` classification evaluates first, recovering from `NEEDS_REVIEW` to `LEARNING` (or `UNDERSTOOD` if `evidenceCount >= 3` and `confidenceScore >= 70`) and resolving active misconceptions. Correction events may contain a misconception payload describing the prior misconception being corrected without re-triggering `NEEDS_REVIEW`.
     2. **Explicit Conflict / Misconception**: `concept_conflict` / `CONFLICT` or `misconception_detected` / `concept_misunderstood` sets `NEEDS_REVIEW` with deterministic penalties (-15 to -30) and preserves `NEEDS_REVIEW` until an explicit correction occurs.
     3. **Normal Progression**:
        - `NOT_STARTED` → `INTRODUCED` on first evidence encounter (`evidenceCount = 1`, score 25).
        - `INTRODUCED` → `LEARNING` when `evidenceCount >= 2` and `confidenceScore >= 40`.
        - `LEARNING` → `UNDERSTOOD` when `evidenceCount >= 3` and `confidenceScore >= 70`.
        - `UNDERSTOOD` → `STRONG` when `evidenceCount >= 5` and `confidenceScore >= 90`.
   - Duplicate evidence: Bounded increase formula $\Delta = \text{round}\left(5 \times \max\left(0.1, 1 - \frac{S_{\text{current}}}{125}\right)\right)$ (+1% to +5%).
   - Diminishing returns confidence formula: $\Delta = \text{round}\left(\text{delta} \times \max\left(0.1, 1 - \frac{S_{\text{current}}}{125}\right)\right)$.
   - Computes aggregate `Topic.knowledgeState.masteryScore` and `Topic.status`.
4. **`KnowledgeEngineService` (`services/knowledgeEngineService.js`)**:
   - Orchestrates the full pipeline with tenant verification, syllabus governance boundary checks, exchange-level idempotency deduplication, and mandatory multi-document MongoDB transactions on replica sets / MongoDB Atlas. Sequential uncommitted fallback is prohibited.

---

## 4. API Endpoints Mounted (`/api/v1`)

| Method | Path | Description | Security |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/topics/:topicId/concepts` | Lists concepts and aggregate mastery for an owned topic | Authenticated + DB Check |
| `GET` | `/api/v1/concepts/:conceptId` | Retrieves concept details and chronological learning events | Authenticated + DB Check |
| `GET` | `/api/v1/topics/:topicId/learning-events` | Lists chronological learning events for an owned topic | Authenticated + DB Check |
| `POST` | `/api/v1/topics/:topicId/extract-knowledge` | Explicitly triggers knowledge extraction on verified server-loaded message documents | Authenticated + DB Check |

---

## 5. Verification Summary

- **Automated Backend Tests**: **166 / 166 passed (100%)** across 11 test files (`server/tests/knowledgeEngine.test.js`, `server/tests/aiGateway.test.js`, `server/tests/chats.test.js`, etc.).
- **Automated Frontend Tests**: **46 / 46 passed (100%)** (`client/src/App.test.jsx`, `client/src/pages/Subjects.test.jsx`, etc.).
- **Total Monorepo Tests**: **212 / 212 passed (100%)**.
- **Live Integration Verification (`server/scripts/verify_phase06_live.js` - All 14 Assertive Fail-Closed Gates Passed)**:
  1. Live Express API health verified (`GET /api/v1/health` status `healthy`).
  2. MongoDB Atlas replica set connected.
  3. Multi-document MongoDB transactions confirmed supported.
  4. Authenticated test users established.
  5. Authoritative subject and approved syllabus v1 established.
  6. **REAL AI Extraction Pipeline Verified**: Real chat exchange executed through `chatController` → `KnowledgeEngineService` → `EventExtractor` → `AIGateway` using live provider `groq` and model `openai/gpt-oss-20b`.
  7. **Multi-Event Extraction (>= 3 Gate) & Fresh-Exchange Concurrent Idempotency Verified**:
     - Multi-concept exchange generated >=3 LearningEvents (fail-closed gate asserted).
     - Serial re-processing verified exact 0 duplicate events and preserved concept score.
     - **Fresh-Exchange Concurrent Idempotency**: Verified against a completely fresh exchange with `Promise.all()`, proving exact 1 mutation result, 1 duplicate/already_processed, 0 raw E11000 leaks, 0 duplicate events, and no score doubling.
  8. **Assertive Misconception Verification**: Hard-asserted transition to `NEEDS_REVIEW`, confidence score reduction, and active misconception tracking.
  9. **Assertive Correction Recovery**: Hard-asserted recovery to `LEARNING`, resolution of active misconceptions, and confidence score increase.
  10. **Assertive Off-Topic Governance**: Hard-asserted `relevance === 'off_topic'` and `disposition === 'excluded'` with exact 0 mutation on `LearningEvent` and `Concept` counts.
  11. **Ledger Immutability & bulkWrite Guard**: Schema pre-hooks and static `bulkWrite` override strictly reject `updateOne`, `updateMany`, `replaceOne`, `deleteOne`, `deleteMany`, `findOneAndDelete`, and update/delete `bulkWrite` operations.
  12. **Security Trust Boundaries**: Forged message IDs rejected (`HTTP 400 INVALID_EVIDENCE`) and cross-tenant access blocked (`HTTP 404`).
  13. **Hard Phase Boundaries**: Exactly 0 `NoteDocument` and 0 `NoteVersion` records created.
  14. **Direct Groq Provider Health**: Verified direct provider execution on `openai/gpt-oss-20b`.

---

## 6. Known Limitations & Architectural Notes
- **AI Task Token Scoping**: The 800-token completion limit is task-scoped specifically to `knowledge_event_extraction` to ensure fast structured JSON extraction while general chat and other tasks retain their full unconstrained token allocations.
- **Provider Failover Gracefulness**: When an AI provider returns rate limits or service unavailability, `AIGateway` attempts secondary configured providers before gracefully falling back to deterministic heuristic parsing without failing client chat requests.
- **Phase Boundary Integrity**: Notes, note versions, study sessions, and quizzes remain strictly deferred to subsequent phases.

