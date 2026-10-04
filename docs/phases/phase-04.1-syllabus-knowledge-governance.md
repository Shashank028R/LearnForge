# Phase 04.1 — Syllabus & Knowledge Governance Foundation

## Overview
Phase 04.1 establishes the durable product, data model, and user experience foundation for **Syllabus Lifecycle Management** and **Knowledge Governance** prior to the Phase 05 AI Gateway integration.

## Core Architectural Invariants
1. **"Chat is the interaction layer. Knowledge is the product."**
2. **"Chat is free-form."** (Users can discuss any topic, technical or non-technical, without assistant rejection).
3. **"Chat history is evidence, not canonical knowledge."** (Conversations are never automatically dumped into notes).
4. **"Only an explicitly approved syllabus becomes the active curriculum."**
5. **"Draft syllabus changes do not become canonical until approval."**
6. **"Topic-related conversation is a candidate for knowledge processing, not automatic notes."**
7. **"Off-topic conversation receives normal AI responses but is excluded from canonical knowledge when classified OFF_TOPIC."**
8. **"Users may explicitly preserve off-topic material as comments or tags."**
9. **"Canonical knowledge, syllabus, comments/tags, and raw conversation evidence are distinct semantic layers."**

## Semantic Layers Comparison Table

| Semantic Layer | Persistence Model | Mutation Lifecycle | Canonical Knowledge Role |
| :--- | :--- | :--- | :--- |
| **Raw Conversation Evidence** | `Message` & `Chat` | Append-only, chronological | Historical interaction transcript |
| **Draft Syllabus** | `SyllabusVersion` (status: `draft`) | Mutable within draft version | Curriculum proposal under revision |
| **Approved Canonical Syllabus** | `SyllabusVersion` (status: `approved`) | Immutable, explicit approval | Authoritative Subject curriculum contract |
| **Superseded Syllabus** | `SyllabusVersion` (status: `superseded`) | Read-only historical audit | Historical curriculum rollback snapshot |
| **Canonical Topics** | `Topic` | Reconciled upon syllabus approval | Authoritative knowledge nodes for study mode |
| **Off-Topic Interaction** | `Message` (`knowledgeContext.relevance: 'off_topic'`) | Excluded from knowledge pipeline | Normal response with non-canonical banner |
| **User Annotations** | `Annotation` (`type: 'comment' \| 'tag'`) | User CRUD operations | Auxiliary user thoughts on interaction evidence |

## API Contracts Implemented

### Syllabus Governance
- `GET /api/v1/subjects/:subjectId/syllabus` — Returns current syllabus status, active approved version, latest draft version, and total versions count.
- `GET /api/v1/subjects/:subjectId/syllabus/versions` — Lists chronological/version-sorted syllabus revisions for the subject.
- `POST /api/v1/subjects/:subjectId/syllabus/versions` — Creates a new syllabus draft (`v1`, `v2`, or derived revision).
- `GET /api/v1/subjects/:subjectId/syllabus/versions/:versionId` — Retrieves a specific syllabus version.
- `PUT /api/v1/subjects/:subjectId/syllabus/versions/:versionId` — Updates sections and metadata of a draft syllabus (rejects modifications to approved or superseded versions).
- `POST /api/v1/subjects/:subjectId/syllabus/versions/:versionId/approve` — Explicitly activates version as authoritative curriculum, supersedes previous active version, marks present topics active (`isActiveInSyllabus: true`), marks omitted topics historical (`isActiveInSyllabus: false`) while retaining stable `_id` and learning progress, reactivates previously retired topics if re-added, and updates `Subject.topicsCount` to strictly active topics.

### Message Annotations
- `GET /api/v1/chats/:chatId/messages/:messageId/annotations` — Lists user comments and tags on a message.
- `POST /api/v1/chats/:chatId/messages/:messageId/annotations` — Creates a comment or tag annotation.
- `PATCH /api/v1/annotations/:annotationId` — Updates annotation content.
- `DELETE /api/v1/annotations/:annotationId` — Deletes annotation.

## Topic Lifecycle & History Governance
- **Pre-Syllabus Manual Topics**: Newly created manual topics before an approved syllabus exists default to `isActiveInSyllabus: false`. They allow free-form chat and notes attachment, but `Subject.topicsCount` strictly reflects `0` active syllabus topics until governed by an approved syllabus.
- **Active Topics**: Topics explicitly declared in the latest approved syllabus version are flagged `isActiveInSyllabus: true` and are eligible for Study Mode and active assessment.
- **Historical / Retired Topics**: Topics present in prior syllabus versions but omitted in the latest approved version are preserved with `isActiveInSyllabus: false`. Their stable `_id`, `description`, `knowledgeState` (mastery scores, key concepts, summaries), `notesCount`, and `chatsCount` remain permanently accessible.
- **Topic Reactivation**: Re-adding a previously retired topic in a subsequent syllabus version restores its `isActiveInSyllabus: true` flag while maintaining its historical learning progress.
- **Subject.topicsCount Contract**: Defined strictly as the count of **active syllabus topics** (`Topic.countDocuments({ subjectId, userId, isActiveInSyllabus: true })`), preventing historical or pre-governance records from inflating current curriculum metrics.
- **Single Approved Version Invariant & End-to-End Atomic Approval Pipeline**:
  - Structurally guaranteed at the MongoDB storage engine level via a Partial Unique Index `{ subjectId: 1, status: 1 }` (`unique: true, partialFilterExpression: { status: 'approved' }`).
  - End-to-end atomicity is strictly enforced through MongoDB multi-document ACID transactions (`session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } })`) wrapping version superseding, approval, canonical topic reconciliation, and `Subject.activeSyllabusVersionId` / `Subject.topicsCount` updates in a single isolated transaction with automated retry on transient write conflicts (`WriteConflict` code 112, E11000).
  - Transaction support (MongoDB replica set or MongoDB Atlas) is a strict prerequisite for approval operations. Standalone MongoDB instances without replica sets return `HTTP 503 Service Unavailable` with a clear prerequisite message.
  - Live adversarial interleaving testing against MongoDB Atlas verified that delayed worker threads attempting to commit stale transactions after an interleaved approval race fail cleanly with `WriteConflict`, preventing any stale mutator corruption of canonical topics or `Subject` active version.

## Cascading Entity Cleanup
- `Subject` deletion cascades removal of all associated `Topic`, `Chat`, `Message`, `SyllabusVersion`, and `Annotation` documents.
- `Topic` deletion cascades removal of all linked `Chat`, `Message`, and `Annotation` documents.
- `Chat` deletion cascades removal of all child `Message` and `Annotation` documents.
- All deletions are strictly scoped by `userId: req.user._id` preventing cross-tenant leakage or orphan records.

## Multi-Tenant Security & Role Boundaries
- Strict multi-tenant authorization (`requireDatabase` + `authenticateUser` + `userId: req.user._id`). Cross-tenant requests return `404 Not Found`.
- Client role trust boundary strictly maintained: client messages must have `role: "user"`. Client requests with `assistant` or `system` roles return `400 Bad Request`.
