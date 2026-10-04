# Phase 07 — Structured Notes Engine Specification & Completion Log

## Status: COMPLETE / SEALED

### Overview
Phase 07 implements the **Structured Notes Engine** for LearnForge, enabling structured block editing, canonical concept synthesis, immutable append-only version history, optimistic concurrency control, and risk-managed AI proposal merging.

---

## Architectural Invariants & Guarantees

1. **Synthesis Pipeline**: Notes are synthesized strictly from Canonical Concepts (Phase 06) and approved Syllabus Versions (Phase 05), never from ungrounded raw chat transcripts (`Raw Conversation` → `LearningEvent` → `Canonical Concept` → `Structured NoteDocument & NoteVersion`).
2. **NoteDocument & NoteVersion Separation**: NoteDocument acts as the topic-anchored pointer (`currentVersionId`, `currentVersionNumber`). NoteVersion records are strictly immutable and append-only.
3. **NoteVersion Immutability**: All mutation and deletion paths (`save` on existing, `updateOne`, `updateMany`, `findOneAndUpdate`, `replaceOne`, `findOneAndReplace`, `deleteOne`, `deleteMany`, `findOneAndDelete`, and `bulkWrite` updates/deletes) are blocked with `IMMUTABLE_NOTE_VERSION`.
4. **Optimistic Concurrency Control**: Manual revisions, version restores, and proposal approvals verify `baseVersion` inside MongoDB multi-document transactions. Stale updates reject with domain HTTP 409 (`STALE_BASE_VERSION` / `STALE_PROPOSAL_BASE`).
5. **Secondary Concurrency Guards**: Unique compound indexes `{ noteDocumentId: 1, version: 1 }` and `{ userId: 1, topicId: 1 }` prevent concurrent race corruption and map collisions into safe domain responses.
6. **Deterministic Concurrency Barrier**: Real live concurrency is proven against MongoDB Atlas replica set transactions using synchronization barriers:
   - Initial note creation race: Winner commits v1 via transaction, loser catches unique index / write conflict and recovers safely (`resolvedVia: 'transaction_conflict_recovery'`, `alreadyExisted: true`, zero raw E11000).
   - Manual revision collision: Two simultaneous revisions with `baseVersion: 1` enter transaction processing together; exactly one creates v2, the other safely returns HTTP 409 `STALE_BASE_VERSION` with zero raw E11000 and zero partial state.
7. **Server-Authoritative Block & Note Provenance**:
   - Manual revisions: New/modified blocks receive `origin: 'user'`, unchanged existing blocks retain previous server-side origin, client-supplied origin spoofing is ignored.
   - AI synthesis: Generated blocks are strictly assigned `origin: 'ai'`.
   - Initial note creation: Server-defined empty attribution, client-supplied `aiMetadata`/`provenance` is rejected/ignored.
8. **Accurate AI vs Fallback Provenance**:
   - Successful AI output: `source: 'ai'`, provider/model metadata persisted.
   - Deterministic fallback: `source: 'deterministic_fallback'`, `provider: 'deterministic'`, `model: 'rule-based-v1'`.
9. **Strict Block Schema Validation**:
   - Heading levels restricted strictly to 1, 2, 3.
   - Canonical code schema restricted strictly to `{ language, code }`.
   - Unknown/unsupported keys across all block types are rejected.
10. **Atomic Proposal Lifecycle**:
    - Atomic conditional status transitions prevent concurrent approval and rejection race conditions.
11. **Risk-Managed Proposal Merging**: Staged proposals assess risk (`LOW`, `MEDIUM`, `HIGH`). Modifications to user-authored blocks (`origin === 'user'`), code blocks, or active concept conflicts enforce explicit user approval.
12. **Version Restore Invariant**: Version restores create a brand-new sequential `NoteVersion` copying historical blocks. The target historical `NoteVersion` is never mutated.
13. **Immutability-Safe Teardown**: Live verification test cleanup utilizes native MongoDB driver collection operations to clean test fixtures without violating or bypassing production Mongoose model immutability hooks.

---

## API Endpoints

- `GET /api/v1/notes`: List user's note documents.
- `GET /api/v1/topics/:topicId/note`: Read-only topic note retrieval (returns 404 NOTE_NOT_FOUND if uninitialized with zero side-effects).
- `POST /api/v1/topics/:topicId/note`: Atomic initial NoteDocument & NoteVersion v1 creation.
- `POST /api/v1/topics/:topicId/notes/synthesize`: AI note proposal generation.
- `GET /api/v1/notes/:noteId`: Single note document retrieval.
- `PUT /api/v1/notes/:noteId`: Optimistic manual note revision.
- `GET /api/v1/notes/:noteId/versions`: Historical version list.
- `GET /api/v1/notes/:noteId/versions/:versionNumber`: Historical version snapshot.
- `POST /api/v1/notes/:noteId/versions/:versionNumber/restore`: Version restoration.
- `GET /api/v1/notes/:noteId/proposals`: Staged AI proposals.
- `GET /api/v1/notes/proposals/:proposalId`: Proposal diff & risk details.
- `POST /api/v1/notes/proposals/:proposalId/approve`: Proposal approval and atomic version commit.
- `POST /api/v1/notes/proposals/:proposalId/reject`: Proposal rejection.

---

## Test & Verification Metrics

- **Backend Automated Tests**: 204 passing across 12 test suites (including 37 notes engine tests in `server/tests/notes.test.js`).
- **Frontend Automated Tests**: 52 passing across 6 test suites (including 6 notes workspace tests in `client/src/pages/Notes.test.jsx`).
- **Total Monorepo Tests**: 256 passing tests.
- **Fail-Closed Live Verification**: `server/scripts/verify_phase07_live.js` validates Express API + MongoDB Atlas replica set + live Groq AI pipeline with 100% pass rate across all 16 verification gates.
