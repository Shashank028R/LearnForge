# ADR-012: Chat and Message Infrastructure & Persistence Architecture

- **Status**: Accepted
- **Date**: October 4, 2026
- **Context**: LearnForge requires a durable, responsive, multi-tenant Chat and Message infrastructure that represents the conversational interaction layer. This infrastructure must strictly honor the core architectural principle: *"Knowledge is the product. Conversations are evidence."* It must provide resilient persistence, deterministic chronological message sequencing, and cross-tenant isolation while maintaining seamless integration with the syllabus hierarchy (`User → Subject → Topic → Chat → Message`) and forward schema readiness for downstream AI Gateway routing (Phase 05), knowledge extraction (Phase 06), and automatic block note generation (Phase 07).

---

## 1. Decision Drivers

1. **Hierarchy & Conceptual Context**: Conversations must optionally anchor to a specific `Subject` and `Topic`, or exist as general learning dialogues, establishing the foreign-key link for future AI concept extraction.
2. **Deterministic Sequence Ordering**: Message threads must maintain an exact, zero-collision integer sequence counter (`sequenceIndex`) to avoid clock drift and sorting race conditions across distributed clients.
3. **Decoupled Asynchronous Processing**: The chat communication loop must remain ultra-fast, separating real-time message exchange from future asynchronous knowledge extraction and note generation pipelines.
4. **Strict Multi-Tenant Security & Defense-in-Depth**: Denormalize `userId` across both `Chat` and `Message` models so authorization is enforced in a single indexed query (`{ _id: messageId, userId: req.user._id }`) without cross-collection joins.
5. **Multi-Environment Resilience**: Avoid distributed multi-document transaction requirements so that development environments, containers, and MongoDB Atlas clusters operate identically without transaction initialization overhead.

---

## 2. Evaluated Options

### Option A: Embedded Messages Array inside Chat Document
- *Pros*: Single document fetch loads chat metadata and all messages.
- *Cons*: Bounded by MongoDB's 16MB document limit; adding messages requires rewriting the entire array or executing `$push` without pagination; difficult to reference individual messages from future `LearningEvent` observation logs.

### Option B: Normalized `chats` and `messages` Collections with Denormalized `userId` (Chosen)
- *Pros*:
  - Unbounded message thread capacity.
  - Granular message indexing and sequence pagination (`beforeSequence`, `limit`).
  - Individual message ObjectIds can be referenced as evidence by Phase 06 Knowledge Extraction and Phase 07 Notes without schema migrations.
  - Denormalized `userId` on `Message` guarantees O(1) indexed multi-tenant security.
  - Coordinated application-level counter updates (`messagesCount` and `Topic.chatsCount`) with read reconciliation.
- *Cons*: Requires application-level cascade deletion of messages when a chat, topic, or subject is deleted.

---

## 3. Decision

We adopt **Option B**: Normalized `Chat` and `Message` collections in MongoDB with denormalized `userId` ownership.

### Schema Specifications

#### `Chat` Schema (`server/src/models/Chat.js`)
```javascript
{
  _id: ObjectId,
  userId: ObjectId,          // Ref: User, indexed, required
  subjectId: ObjectId,       // Ref: Subject, indexed, nullable
  topicId: ObjectId,         // Ref: Topic, indexed, nullable
  title: String,             // Trimmed, max 200 chars (default: 'New Conversation')
  status: String,            // 'active' | 'archived' (default: 'active')
  messagesCount: Number,     // Cached message counter (default: 0)
  lastMessageAt: Date,       // Timestamp of most recent message (default: Date.now)
  metadata: Object,          // Extensible key-value metadata
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes**:
- `{ userId: 1, status: 1, lastMessageAt: -1 }`: Fast retrieval of user's active/archived chats.
- `{ userId: 1, topicId: 1, lastMessageAt: -1 }`: Fast topic-scoped chat retrieval.
- `{ userId: 1, subjectId: 1, lastMessageAt: -1 }`: Fast subject-scoped chat retrieval.

#### `Message` Schema (`server/src/models/Message.js`)
```javascript
{
  _id: ObjectId,
  chatId: ObjectId,          // Ref: Chat, indexed, required
  userId: ObjectId,          // Ref: User, indexed, required (denormalized ownership)
  role: String,              // 'user' | 'assistant' | 'system', required
  content: String,           // Trimmed, 1-20,000 chars, required
  sequenceIndex: Number,     // 0-indexed integer counter, required
  status: String,            // 'sent' | 'delivered' | 'error' (default: 'sent')
  metadata: Object,          // Schema readiness for tokens, model, sources, citations
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes**:
- `{ chatId: 1, sequenceIndex: 1 }` (Unique): Enforces exact chronological ordering and prevents duplicate sequence collision.
- `{ userId: 1, chatId: 1 }`: Supports fast user-scoped aggregation and authorization.

---

## 4. Multi-Tenant Authorization & Cascade Policy

1. **Client `userId` Ignored**: All operations derive tenant identity from `req.user._id` set by authentication middleware.
2. **Cross-Tenant Privacy**: Queries targeting non-owned chats return `404 Not Found` to prevent resource ID enumeration attacks.
3. **Parent Ownership Validation**: Creating a topic-linked chat validates that both `subjectId` and `topicId` belong to `req.user._id`.
4. **Application-Level Cascading Lifecycle**:
   - `DELETE /api/v1/chats/:id`: Purges child messages (`Message.deleteMany({ chatId, userId })`) and decrements `Topic.chatsCount`.
   - `DELETE /api/v1/topics/:id`: Purges child chats and messages, then decrements `Subject.topicsCount`.
   - `DELETE /api/v1/subjects/:id`: Purges child topics, chats, and messages.

---

## 5. Consequences

### Positive
- Strict isolation of student conversations with zero cross-tenant leakage risk.
- Highly performant indexed access paths for chat listing and message history.
- Schema ready for Phase 05 (AI Gateway routing), Phase 06 (Knowledge extraction), and Phase 07 (Notes generation).

### Negative / Trade-offs
- Message retrieval requires querying a separate collection from chat metadata. This is mitigated by `{ chatId: 1, sequenceIndex: 1 }` index coverage.
