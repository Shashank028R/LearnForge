# Structured Notes Engine (Phase 07)

## Overview

The **Structured Notes Engine** compiles learning milestones into persistent, structured study notes. Rather than producing ungrounded summaries of raw conversations, notes are synthesized strictly from **canonical concepts**, **topic metadata**, and **approved syllabus versions** (outputs of Phase 05 & Phase 06).

## Core Architecture & Invariants

```
               ┌───────────────────────┐
               │    Raw Conversation   │
               └───────────┬───────────┘
                           │ (Phase 06 Extraction)
                           ▼
               ┌───────────────────────┐
               │     LearningEvent     │
               └───────────┬───────────┘
                           │ (Phase 06 Resolution)
                           ▼
               ┌───────────────────────┐
               │   Canonical Concept   │
               └───────────┬───────────┘
                           │ (Phase 07 Synthesis)
                           ▼
               ┌───────────────────────┐
               │  NoteDocument (vN)    │
               │  ┌─────────────────┐  │
               │  │   NoteVersion   │  │
               │  │  (Append-Only)  │  │
               │  └─────────────────┘  │
               └───────────────────────┘
```

### 1. Document & Version Decoupling
- `NoteDocument`: Topic-level anchor document (`userId`, `subjectId`, `topicId`, `title`, `currentVersionNumber`, `currentVersionId`, `metadata`). Unique index on `{ userId: 1, topicId: 1 }`.
- `NoteVersion`: Append-only immutable snapshot (`noteDocumentId`, `userId`, `version`, `parentVersionId`, `blocks`, `sourceType`, `changeSummary`, `provenance`). Unique index on `{ noteDocumentId: 1, version: 1 }`.

### 2. Strict Immutability
`NoteVersion` records cannot be updated or deleted once committed. The model enforces:
- `pre('save')` check blocking `!this.isNew`.
- `pre` hooks blocking `updateOne`, `updateMany`, `findOneAndUpdate`, `replaceOne`, `findOneAndReplace`, `deleteOne`, `deleteMany`, `findOneAndDelete`.
- Static `bulkWrite` interceptor blocking update/delete operations.

### 3. Server-Authoritative Provenance
Provenance is strictly determined by the server:
- Manual revisions: New and modified blocks receive `origin: 'user'`. Unchanged existing blocks retain their server-side origin. Client cannot spoof AI or system origin.
- AI proposals: Accepted generated blocks are assigned `origin: 'ai'`.
- Initial note creation: Server-defined empty attribution, client-supplied AI metadata is rejected.
- Synthesis fallback: If structured AI output fails parsing, fallback sets `source: 'deterministic_fallback'`, `provider: 'deterministic'`, `model: 'rule-based-v1'`. Provider/model metadata is persisted only when AI output is parsed and accepted.

### 4. Typed Block Hierarchy & Schema Alignment
Notes are composed of 9 typed blocks with strict schema validation:
- `heading` (levels: 1, 2, 3 strictly; text)
- `paragraph` (text)
- `bullet_list` (items array)
- `numbered_list` (items array)
- `code` (language, code strictly)
- `quote` (text, citation)
- `callout` (variant: `info`|`warning`|`tip`|`key_takeaway`, title, text)
- `table` (headers, rows)
- `divider`

Unknown or unsupported keys across all block types are rejected by `validateBlockContent`.

### 5. Risk Classification & Staging
Candidate AI updates are staged in `NoteProposal` records:
- **`HIGH RISK`**: Modifies user-authored blocks, modifies code, or touches active concept conflicts. Always requires explicit approval.
- **`MEDIUM RISK`**: Modifies or removes existing AI-authored explanation blocks. Requires explicit approval.
- **`LOW RISK`**: Pure additions to AI-authored sections.

### 6. Atomic Proposal Lifecycle
Atomic conditional status transitions (`findOneAndUpdate({ _id, status: 'pending' }, ...)`) prevent race conditions between simultaneous approval and rejection requests.

### 7. Optimistic Concurrency & Transactions
All revisions, restores, and proposal approvals execute inside MongoDB multi-document transactions validating `baseVersion === currentVersionNumber`. Concurrency collisions map cleanly to domain HTTP 409 conflict errors (`STALE_BASE_VERSION` / `STALE_PROPOSAL_BASE`).
Real live concurrency is verified using deterministic synchronization barriers against MongoDB Atlas replica set transactions.
