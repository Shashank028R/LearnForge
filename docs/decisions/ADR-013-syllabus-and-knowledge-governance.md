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

3. **Explicit Approval Requirement & Canonical Topic Reconciliation:**
   - Conversational affirmative text (e.g. "looks good", "continue") never triggers automatic approval.
   - Approval requires an explicit API call: `POST /api/v1/subjects/:subjectId/syllabus/versions/:versionId/approve`.
   - On approval, canonical `Topic` documents are reconciled: existing topics matching by normalized title preserve their stable `_id`, mastery level, notes count, and chat references, preventing data loss.

4. **Off-Topic Classification Contract:**
   - Assistant message metadata includes `knowledgeContext: { relevance: 'unclassified'|'on_topic'|'off_topic'|'uncertain', disposition: 'unclassified'|'candidate'|'excluded'|'promoted' }`.
   - The frontend never infers relevance via keywords; it only displays the off-topic warning banner when the backend explicitly returns `relevance === 'off_topic'`.
   - Users can save off-topic message insights as auxiliary `Annotation` records (comments or tags) without polluting canonical notes.

## Consequences
- **Positive:**
  - Clear architectural boundary established before Phase 05 AI Gateway integration.
  - Complete historical auditability of syllabus changes without destructive overwrites.
  - Users maintain full freedom to explore tangential topics without curriculum distortion.
- **Negative:**
  - Requires explicit derivation step when editing approved syllabi, increasing number of version records over time.
