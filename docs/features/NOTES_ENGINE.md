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

### 3. Typed Block Hierarchy
Notes are composed of 9 typed blocks with strict schema validation:
- `heading` (level 1-6, text)
- `paragraph` (text)
- `bullet_list` (items array)
- `numbered_list` (items array)
- `code` (language, code, caption)
- `quote` (text, citation)
- `callout` (variant: `info`|`warning`|`tip`|`key_takeaway`, title, text)
- `table` (headers, rows)
- `divider`

Each block maintains an authoritative `origin: 'user' | 'ai' | 'system'`, and provenance metadata.

### 4. Risk Classification & Staging
Candidate AI updates are staged in `NoteProposal` records:
- **`HIGH RISK`**: Modifies user-authored blocks, modifies code, or touches active concept conflicts. Always requires explicit approval.
- **`MEDIUM RISK`**: Modifies or removes existing AI-authored explanation blocks. Requires explicit approval.
- **`LOW RISK`**: Pure additions to AI-authored sections.

### 5. Optimistic Concurrency & Transactions
All revisions, restores, and proposal approvals execute inside MongoDB multi-document transactions validating `baseVersion === currentVersionNumber`. Concurrency collisions map cleanly to domain HTTP 409 conflict errors (`STALE_BASE_VERSION` / `STALE_PROPOSAL_BASE`).
