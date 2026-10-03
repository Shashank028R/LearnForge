# ADR-011: Subject, Topic & Knowledge Structure Persistence Architecture

- **Status**: Accepted
- **Date**: October 3, 2026
- **Deciders**: LearnForge Core Architecture & Project Owner
- **Consulted**: `PROJECT_CONTEXT.md`, `docs/architecture/ARCHITECTURE.md`, `docs/SECURITY.md`, `ADR-001`
- **Informed**: Monorepo Full-Stack Engineers

---

## 1. Context and Problem Statement

In LearnForge, the primary product principle is:
> **Knowledge is the product. Conversations are evidence.**

To fulfill this vision, subjects, topics, and evolving knowledge structures must be first-class persisted entities in MongoDB rather than transient client state or chat-only tags.

The system requires:
1. A hierarchy connecting user knowledge domains (`Subject`) to discrete study modules (`Topic`).
2. An extensible persistence foundation for canonical knowledge states (key concepts, synthesized summaries, mastery scores) that downstream phases (Phase 04 Socratic Chat, Phase 05/06 AI Gateway & Extraction, Phase 07 Structured Notes, Phase 10 Adaptive Quizzes) can enrich without structural database redesign.
3. Strict multitenant isolation guaranteeing zero cross-user data leakage.
4. Deterministic topic ordering and cascading lifecycle management.

---

## 2. Decision Drivers

- **Ownership-First Security**: Every read, write, update, and delete must enforce authenticated user boundaries at the database query layer.
- **Query Efficiency**: Subjects and topics are queried frequently during sidebar navigation, study sessions, and note synchronization; queries must be covered by composite indexes without slow $lookup joins where avoidable.
- **Relational Integrity**: Deleting a subject must reliably clean up orphaned topics.
- **Future Extensibility**: The topic knowledge structure must accommodate AI-extracted concepts and mastery states without schema breaking changes.
- **No Unvetted Dependencies**: Implementation must leverage existing Mongoose ODM patterns without adding heavy third-party ORMs or plugins.

---

## 3. Considered Options

### Option A: Fully Embedded Topics within Subject Document
Store topics as a subdocument array inside `Subject.topics`:
- *Pros*: Single document read loads subject and all topics. Atomic updates within single document.
- *Cons*: High document growth, 16MB BSON limit risk for heavy subjects, complex positional array updates, severe indexing and concurrency friction when future notes, chats, and quiz attempts need to reference individual topic IDs.

### Option B: Normalized Collections with Denormalized Ownership (Chosen)
Separate `Subject` and `Topic` collections in MongoDB with denormalized `userId` on both:
- `Subject`: Holds user domain metadata, target mastery level, and cached `topicsCount`.
- `Topic`: Holds `subjectId`, `userId`, `orderIndex`, learning status, and embedded `knowledgeState` (summary, key concepts, mastery score).
- *Pros*:
  - Clean 1:N relational references.
  - Direct indexed querying of topics by ID while enforcing `userId` ownership in a single index lookup (`{ _id: topicId, userId: req.user._id }`).
  - Zero risk of BSON document size bloat.
  - Independent pagination, ordering, and filtering.
- *Cons*: Requires an explicit cascade delete of topics when a subject is deleted.

---

## 4. Architectural Specifications

### 4.1 Schema Definitions

#### Subject Schema (`subjects`)
```javascript
{
  _id: ObjectId,
  userId: ObjectId,          // Ref: User (indexed, required)
  name: String,              // Trimmed, 1-120 chars
  normalizedName: String,    // Lowercase for unique compound index per user
  description: String,       // Optional, max 500 chars
  color: String,             // Visual theme token (default: '#3b82f6')
  status: String,            // 'active' | 'archived' (default: 'active')
  targetMasteryLevel: String,// 'beginner' | 'intermediate' | 'advanced' | 'comprehensive'
  topicsCount: Number,       // Cached count of child topics
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes**:
- `{ userId: 1, status: 1, updatedAt: -1 }`: Fast user subject dashboard queries.
- `{ userId: 1, normalizedName: 1 }`: Unique compound index preventing duplicate subject names per account.

#### Topic Schema (`topics`)
```javascript
{
  _id: ObjectId,
  subjectId: ObjectId,       // Ref: Subject (indexed, required)
  userId: ObjectId,          // Ref: User (denormalized for fast ownership queries)
  title: String,             // Trimmed, 1-160 chars
  normalizedTitle: String,   // Lowercase for unique compound index within subject
  description: String,       // Optional, max 1000 chars
  orderIndex: Number,        // Explicit sequential ordering (0, 1, 2...)
  status: String,            // 'not_started' | 'in_progress' | 'mastered'
  knowledgeState: {
    masteryScore: Number,    // 0 - 100 (default: 0)
    keyConcepts: [String],   // Canonical atomic concept tags
    summary: String,         // Evolving synthesis
    lastStudiedAt: Date      // Timestamp of last interaction
  },
  notesCount: Number,        // Future Phase 07 counter
  chatsCount: Number,        // Future Phase 04 counter
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes**:
- `{ subjectId: 1, orderIndex: 1 }`: Sequential topic loading for subject view.
- `{ userId: 1, subjectId: 1 }`: Fast tenant boundary validation.
- `{ subjectId: 1, normalizedTitle: 1 }`: Unique compound index preventing duplicate topic names within the same subject.

### 4.2 Ownership & Cross-Tenant Isolation Rule
1. **Never trust client-provided `userId`**: The authenticated identity is strictly injected via `req.user._id` by `authenticateUser`.
2. **Subject Scoping**: All Subject operations query `{ _id: subjectId, userId: req.user._id }`.
3. **Topic Scoping**: All Topic mutations and reads verify `{ _id: topicId, userId: req.user._id }`.
4. **Subject Creation Check for Topics**: When creating a topic under `/subjects/:subjectId/topics`, the system first validates that the target `subjectId` exists and belongs to `req.user._id`. If not, a `404 Not Found` is returned, preventing any unauthorized user from attaching topics to another student's subject.
5. **Cascade Lifecycle**: When a Subject is deleted, `Topic.deleteMany({ subjectId, userId: req.user._id })` is executed atomically within application logic before returning success.

---

## 5. Consequences

### Positive
- Strict cross-tenant isolation guaranteed at database layer.
- Clean separation of curriculum structure from conversation evidence.
- High performance index coverage on all primary navigation paths.
- Future phases (Chat, Notes, AI Extraction, Quizzes) can immediately anchor to stable `subjectId` and `topicId` foreign keys.

### Negative / Trade-offs
- Deleting a subject requires application-level cascade deletion of child topics. This is handled reliably in the `deleteSubject` controller.
