# ADR-016: Structured Notes Engine & Immutable Versioning Architecture

## Context & Problem Statement

In LearnForge, notes are not ephemeral scratchpads or unvalidated AI summaries of raw conversation transcripts. Instead, notes serve as canonical, structured study assets synthesized strictly from validated pedagogical facts: canonical concepts (with mastery states and misconceptions), topic scope, and approved syllabus versions.

To ensure pedagogical integrity, user agency, and concurrent write safety across distributed clients, the Notes Engine requires:
1. **Strict typed block structure** with stable block identities and single server-authoritative provenance.
2. **Append-only immutable versioning** where historical revisions are permanently preserved and cannot be overwritten or deleted.
3. **User-authored block protection** and deterministic risk classification (`LOW`, `MEDIUM`, `HIGH`) for candidate AI updates.
4. **Optimistic concurrency control and MongoDB multi-document transaction boundaries** with deterministic version collision handling.

## Architectural Decision

### 1. Invariant Knowledge Synthesis Pipeline
Notes are generated strictly via:
$$\text{RAW CONVERSATION} \longrightarrow \text{LEARNING EVENTS} \longrightarrow \text{CANONICAL CONCEPTS} \longrightarrow \text{STRUCTURED NOTES}$$
No direct summarization of raw conversation transcripts is permitted into canonical notes.

### 2. Note Document & NoteVersion Separation
- **`NoteDocument`**: The topic-anchored container holding metadata, title, `currentVersionNumber`, and `currentVersionId` pointer. Exactly one canonical NoteDocument exists per `{ userId, topicId }`.
- **`NoteVersion`**: Strictly immutable append-only historical snapshot. Contains typed blocks, `version` sequence number, `sourceType` (`initial_creation`, `manual_edit`, `ai_synthesis`, `ai_merge_proposal`, `version_restore`), and provenance metadata. Zero mutable status flags (`status: current|historical|superseded` is prohibited). Authoritative status is derived strictly from `NoteDocument.currentVersionId`.

### 3. NoteVersion Immutability Invariant
`NoteVersion` models strictly block:
- `save()` on existing documents (`!this.isNew`)
- Query-level updates: `updateOne`, `updateMany`, `findOneAndUpdate`, `replaceOne`, `findOneAndReplace`
- Query-level deletions: `deleteOne`, `deleteMany`, `findOneAndDelete`
- Prohibited update/delete forms via `bulkWrite`
All mutation attempts throw domain error `IMMUTABLE_NOTE_VERSION`. Teardown in live verification scripts utilizes native MongoDB driver collection operations to preserve domain model immutability hooks.

### 4. Typed Block Hierarchy & Server-Authoritative Provenance
Blocks are strictly typed (`heading`, `paragraph`, `bullet_list`, `numbered_list`, `code`, `quote`, `callout`, `table`, `divider`) with a single authoritative `origin` field (`'user' | 'ai' | 'system'`).
- **Heading Levels**: Restricted strictly to 1, 2, 3.
- **Canonical Code**: Schema restricted strictly to `{ language, code }`.
- **Server Provenance**: Client-supplied origin spoofing is ignored. Manual edits/new blocks receive `origin: 'user'`, unchanged existing blocks retain their server origin, and AI proposals strictly receive `origin: 'ai'`.
- **Fallback Provenance**: If AI output fails JSON parsing, fallback sets `source: 'deterministic_fallback'`, `provider: 'deterministic'`, `model: 'rule-based-v1'`. Provider/model metadata is persisted only upon parsed success.

### 5. Deterministic Risk Classification & Merging
Candidate AI updates are staged as `NoteProposal` records and classified into risk tiers:
- **`HIGH RISK`**: Modifies user-authored blocks (`origin === 'user'`), modifies code blocks, or touches active concept conflicts (`conflictState.hasConflict === true`). Explicit manual user approval required (`requiresApproval: true`).
- **`MEDIUM RISK`**: Modifies or removes existing AI-authored explanation blocks. Explicit user approval required (`requiresApproval: true`).
- **`LOW RISK`**: Purely additive new knowledge blocks to AI-authored sections.

Atomic conditional status transitions (`findOneAndUpdate({ _id, status: 'pending' }, ...)`) prevent concurrent approval and rejection race conditions.

### 6. Optimistic Concurrency & Collision Recovery
- Every manual revision, restore, and proposal approval requires explicit `baseVersion` verification inside a MongoDB multi-document transaction (`readConcern: 'snapshot'`, `writeConcern: 'majority'`).
- If `baseVersion !== noteDoc.currentVersionNumber`, the transaction aborts with HTTP 409 Conflict (`STALE_BASE_VERSION` or `STALE_PROPOSAL_BASE`).
- Compound unique indexes `{ noteDocumentId: 1, version: 1 }` and `{ userId: 1, topicId: 1 }` serve as secondary storage guards. Any concurrent write collisions (E11000 / WriteConflict) are intercepted, transaction aborted, and mapped to domain HTTP 409 conflict errors with zero leaked raw database errors and zero partial state.
- Real live concurrency is proven using deterministic synchronization barriers against MongoDB Atlas replica set transactions.
- Version restore creates a **new sequential NoteVersion** copying historical blocks without mutating historical snapshots.

## Consequences & Guarantees

- **Pedagogical Consistency**: Notes reflect authoritative knowledge state, automatically surfacing active misconceptions and concept mastery.
- **Auditability & Recovery**: Every historical state is permanently reproducible. Accidental edits or unwanted AI updates can be reversed instantly.
- **Concurrency Safety**: Race conditions between multiple tabs or concurrent AI merges resolve deterministically without data corruption or ghost versions.
