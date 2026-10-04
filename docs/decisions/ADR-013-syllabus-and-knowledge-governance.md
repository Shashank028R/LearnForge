# ADR-013: Syllabus Lifecycle & Knowledge Governance Foundation

## Status
Accepted

## Context
In LearnForge, learning starts as free-form conversation, but canonical curriculum and note systems require structured, authoritative definitions. Previously, conversation messages risked being conflated with authoritative curriculum content or canonical notes.

We needed a strict semantic separation between:
1. **Raw Conversation Evidence:** Chat messages exchanged between user and assistant.
2. **Draft Syllabus:** Iteratively edited curriculum proposals.
3. **Approved Canonical Syllabus:** The authoritative curriculum contract for a subject.
4. **Topic-Related Knowledge Candidates:** Ephemeral conversation insights pending evaluation.
5. **Canonical Topic Knowledge:** Extracted, verified topic knowledge states.
6. **Off-Topic Conversation:** Free-form discussions outside the active syllabus that must receive normal responses but remain excluded from canonical notes.
7. **User-Created Annotations:** Explicit user comments and tags attached to conversation evidence as auxiliary metadata.

## Decision
1. **Subject Creation Does Not Require a Syllabus:**
   - Users can create a Subject and immediately chat in free-form mode.
   - Subjects exist in one of three states: `no_syllabus`, `draft`, `approved`.

2. **Immutable Versioning for Syllabus Governance:**
   - Every revision cycle creates an independent `SyllabusVersion` document with monotonic numbering (`v1`, `v2`, `v3`).
   - Approved versions are immutable. Requesting an edit creates a new draft version derived from the active approved version.
   - When a new draft is approved, the previous approved version transitions to `superseded` with audit timestamps (`approvedAt`, `supersededAt`).

3. **Explicit Approval Requirement & Canonical Topic Lifecycle Reconciliation:**
   - Conversational affirmative text (e.g. "looks good", "continue") never triggers automatic approval.
   - Approval requires an explicit API call: `POST /api/v1/subjects/:subjectId/syllabus/versions/:versionId/approve`.
   - **Active vs. Historical Topic Reconciliation**:
     - Topics present in the approved syllabus are marked active (`isActiveInSyllabus: true`).
     - Existing topics matching by normalized title preserve their stable `_id`, `description`, `knowledgeState`, `notesCount`, and `chatsCount`.
     - Topics omitted from a newly approved syllabus are **not deleted**; they are marked historical (`isActiveInSyllabus: false`) to preserve all learning history, notes, and conversation evidence.
   - **Single Active Approved Version Invariant & End-to-End Concurrency Safety**:
     - Exactly one approved syllabus version exists per subject at any given time.
     - **Persistence Constraint**: Enforced at the database storage engine layer by a MongoDB Partial Unique Index `{ subjectId: 1, status: 1 }` (`unique: true, partialFilterExpression: { status: 'approved' }`).
     - **End-to-End Atomic Approval Pipeline**: Multi-document ACID transactions (on replica sets / MongoDB Atlas) executing version superseding, target approval, canonical topic reconciliation, active count calculation, and `Subject.activeSyllabusVersionId` update in a single isolated atomic transaction with retry on transient write conflicts.
     - **CAS Guard & Staleness Protection**: In all environments, pre- and post-reconciliation CAS checks verify that the target version has not lost an approval race to a concurrent request before mutating canonical state. If a stale approval is detected, canonical topics are immediately re-synced to the true winning approved version, preventing stale mutator corruption.
   - **Subject Topics Count Contract**:
     - `Subject.topicsCount` strictly reflects the count of **active syllabus topics** (`Topic.countDocuments({ subjectId, userId, isActiveInSyllabus: true })`), preventing historical topics from skewing curriculum metrics.
     - Newly manually created topics before syllabus approval default to `isActiveInSyllabus: false` and `Subject.topicsCount` remains 0 until governed by an approved syllabus.

4. **Off-Topic Classification Contract:**
   - Assistant message metadata includes `knowledgeContext: { relevance: 'unclassified'|'on_topic'|'off_topic'|'uncertain', disposition: 'unclassified'|'candidate'|'excluded'|'promoted' }`.
   - The frontend never infers relevance via keywords; it only displays the off-topic warning banner when the backend explicitly returns `relevance === 'off_topic'`.
   - Users can save off-topic message insights as auxiliary `Annotation` records (comments or tags) without polluting canonical notes.

5. **Application-Level Cascade Deletion Contract:**
   - Deleting a `Subject` purges its `Topic`, `Chat`, `Message`, `SyllabusVersion`, and `Annotation` records.
   - Deleting a `Topic` purges associated `Chat`, `Message`, and `Annotation` records.
   - Deleting a `Chat` purges child `Message` and `Annotation` records.
   - All cascades are strictly scoped by `userId: req.user._id` to prevent cross-tenant data corruption.

## Consequences
- **Positive:**
  - Clear architectural boundary established before Phase 05 AI Gateway integration.
  - Complete historical auditability of syllabus changes without destructive overwrites.
  - Active curriculum and active `Topic` set never contradict each other.
  - Preserved learning progress and chat history even when topics are removed from syllabus revisions.
  - Zero orphan records across all lifecycle deletions.
- **Negative:**
  - Requires explicit derivation step when editing approved syllabi, increasing number of version records over time.
