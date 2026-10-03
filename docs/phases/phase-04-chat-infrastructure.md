# Phase 04: Chat Infrastructure

- **Status**: Complete
- **Date**: October 4, 2026
- **Branch**: `main`
- **Core Principle**: *"Knowledge is the product. Conversations are evidence."*

---

## 1. Objective

Build a resilient, production-ready **Chat and Message Infrastructure** in MongoDB that represents the student interaction layer. Enforce deterministic chronological message sequencing, strict multi-tenant authorization boundaries, full CRUD REST APIs, topic/subject syllabus linkage, and an accessible, responsive two-pane UI workspace, while establishing clean forward-compatibility for downstream AI Gateway routing (Phase 05), knowledge extraction (Phase 06), and note synthesis (Phase 07).

---

## 2. Architecture & Domain Model

LearnForge organizes the learning and conversational hierarchy as follows:

```
[User] (1)
  │
  ├──> (N) [Subject]
  │           │ _id, userId, name, color, targetMasteryLevel, topicsCount
  │           │
  │           └──> (N) [Topic]
  │                     │ _id, subjectId, userId, title, orderIndex, knowledgeState, chatsCount
  │                     │
  │                     └──> (N) [Chat]
  │                               │ _id, userId, subjectId, topicId, title, status, messagesCount, lastMessageAt
  │                               │
  │                               └──> (N) [Message]
  │                                         _id, chatId, userId, role, content, sequenceIndex, status, metadata
```

### Key Architectural Decisions (ADR-012)
1. **Normalized Message Persistence**: Messages are stored in a dedicated `messages` collection with compound unique indexing `{ chatId: 1, sequenceIndex: 1 }`, ensuring unbounded scalability, fast paginated retrieval, and zero sequence collisions.
2. **Denormalized User Ownership**: Both `Chat` and `Message` models persist `userId: ObjectId`. This provides defense-in-depth, eliminating relational `$lookup` joins on message queries and securing cross-tenant boundaries.
3. **Syllabus Linkage**: Chats can link to a parent `Topic` and `Subject` (or operate as general workspace conversations). When linked to a topic, `Topic.chatsCount` is maintained through coordinated application-level updates and reconciled on read.
4. **Application-Level Cascading Lifecycle**:
   - Deleting a `Chat` purges its messages (`Message.deleteMany({ chatId, userId })`) and decrements `Topic.chatsCount`.
   - Deleting a `Topic` purges its child chats and messages.
   - Deleting a `Subject` cascades deletion across all child topics, chats, and messages.
5. **Decoupled Asynchronous Ready Design**: The chat persistence loop is kept lightweight, ensuring sub-50ms message storage while setting up metadata fields (`metadata: {}`) for future background AI extraction (Phase 06) and note generation (Phase 07).

---

## 3. Schema & Database Design

### 3.1 Chat Collection (`chats`)
```javascript
{
  _id: ObjectId,
  userId: ObjectId,          // Indexed, Ref: User, Required
  subjectId: ObjectId,       // Indexed, Ref: Subject, Optional/Nullable
  topicId: ObjectId,         // Indexed, Ref: Topic, Optional/Nullable
  title: String,             // Trimmed, max 200 chars (default: 'New Conversation')
  status: String,            // 'active' | 'archived' (default: 'active')
  messagesCount: Number,     // Cached counter maintained via coordinated application updates (default: 0)
  lastMessageAt: Date,       // Timestamp of most recent message (default: Date.now)
  metadata: Object,          // Extensible metadata (default: {})
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes**:
- `{ userId: 1, status: 1, lastMessageAt: -1 }`: Fast retrieval of active/archived user chats.
- `{ userId: 1, topicId: 1, lastMessageAt: -1 }`: Fast topic-scoped chat retrieval.
- `{ userId: 1, subjectId: 1, lastMessageAt: -1 }`: Fast subject-scoped chat retrieval.

### 3.2 Message Collection (`messages`)
```javascript
{
  _id: ObjectId,
  chatId: ObjectId,          // Indexed, Ref: Chat, Required
  userId: ObjectId,          // Indexed, Ref: User, Required (denormalized ownership)
  role: String,              // 'user' | 'assistant' | 'system', Required
  content: String,           // Trimmed, 1-20000 chars, Required
  sequenceIndex: Number,     // 0-indexed sequential counter, Required
  status: String,            // 'sent' | 'delivered' | 'error' (default: 'sent')
  metadata: Object,          // Schema readiness for tokens, model, sources, citations
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes**:
- `{ chatId: 1, sequenceIndex: 1 }` (Unique): Enforces exact chronological ordering and prevents sequence index collisions.
- `{ userId: 1, chatId: 1 }`: Supports fast user-scoped aggregation and authorization checks.

---

## 4. API Endpoints & Request/Response Contracts

All endpoints are mounted under `/api/v1` and protected by `requireDatabase` and `authenticateUser` middleware:

| Method | Endpoint | Description | Status |
|---|---|---|---|
| `GET` | `/api/v1/chats` | List user's chats (supports `?status=`, `?subjectId=`, `?topicId=`, `?search=`, pagination) | 200 |
| `POST` | `/api/v1/chats` | Create new chat (accepts `title`, `subjectId`, `topicId`, `initialMessage`) | 201, 400, 404 |
| `GET` | `/api/v1/chats/:chatId` | Get single chat with populated subject & topic details and count reconciliation | 200, 404 |
| `PUT` | `/api/v1/chats/:chatId` | Update chat title or status (`active`/`archived`) | 200, 400, 404 |
| `DELETE` | `/api/v1/chats/:chatId` | Delete chat, cascade child messages, decrement parent `Topic.chatsCount` | 200, 404 |
| `GET` | `/api/v1/chats/:chatId/messages` | List chronological messages (`?limit=50&beforeSequence=`) | 200, 404 |
| `POST` | `/api/v1/chats/:chatId/messages` | Append user message & generate Socratic assistant exchange | 201, 400, 404 |

### Standard Response Envelope Example
```json
{
  "success": true,
  "data": {
    "chat": {
      "id": "6ac14a1cc532bb089e3a5f2c",
      "_id": "6ac14a1cc532bb089e3a5f2c",
      "title": "Study: Paxos & Raft Protocols",
      "status": "active",
      "messagesCount": 2,
      "lastMessageAt": "2026-10-04T00:02:00.000Z",
      "subject": {
        "id": "6ac14a1bc532bb089e3a5f1c",
        "_id": "6ac14a1bc532bb089e3a5f1c",
        "name": "Distributed Computing",
        "color": "#3b82f6"
      },
      "topic": {
        "id": "6ac14a1bc532bb089e3a5f24",
        "_id": "6ac14a1bc532bb089e3a5f24",
        "title": "Paxos & Raft Protocols",
        "status": "not_started"
      }
    },
    "messages": [
      {
        "id": "6ac14a1cc532bb089e3a5f2e",
        "_id": "6ac14a1cc532bb089e3a5f2e",
        "chatId": "6ac14a1cc532bb089e3a5f2c",
        "role": "user",
        "content": "How does Raft ensure that committed log entries are never overwritten?",
        "sequenceIndex": 0,
        "status": "sent",
        "createdAt": "2026-10-04T00:02:00.000Z"
      },
      {
        "id": "6ac14a1cc532bb089e3a5f2f",
        "_id": "6ac14a1cc532bb089e3a5f2f",
        "chatId": "6ac14a1cc532bb089e3a5f2c",
        "role": "assistant",
        "content": "Regarding **Paxos & Raft Protocols** in *Distributed Computing*: That is an intriguing question. To break this down Socratically: what is the fundamental principle behind Leader Completeness?",
        "sequenceIndex": 1,
        "status": "sent",
        "createdAt": "2026-10-04T00:02:00.000Z"
      }
    ]
  },
  "meta": {
    "requestId": "f459c3a1-2d7c-48be-810a-702334f55b9e"
  }
}
```

---

## 5. Security & Authorization Enforcement

1. **Client `userId` Rejected**: Tenant identity is exclusively derived from `req.user._id` populated by session cookie or verified Bearer token.
2. **Strict Multi-Tenant Isolation**:
   - `Chat.findOne({ _id: chatId, userId: req.user._id })`
   - `Message.find({ chatId, userId: req.user._id })`
   - Returns `404 Not Found` for any attempt by User B to view, update, delete, or send messages into User A's chat (preventing enumeration attacks).
3. **Cross-Tenant Parenting Prevention**: When creating a chat under a subject or topic, the handler validates that both target entities belong to `req.user._id`.
4. **Input Sanitization & Length Limits**:
   - Message content: min 1 char, max 20,000 chars.
   - Chat title: max 200 chars.
   - Status: enum validated (`active`, `archived`).

---

## 6. Frontend Implementation

1. **`client/src/pages/ChatsPage.jsx`**:
   - Responsive two-pane workspace.
   - Left sidebar: Search filter, status tabs (Active, Archived, All), "New Chat" modal trigger, conversation list with active indicators, timestamps, subject color badges, and quick actions.
   - Right main pane: Header with conversation title, subject/topic navigation breadcrumbs, status badges, archive toggle, and delete confirmation.
   - Message thread: Avatars (Sparkles for Assistant, User for Student), markdown-ready bubble styling, timestamps, copy to clipboard utility with visual feedback, and auto-scroll to latest message.
   - Message composer: Auto-resizing textarea, Enter to send, Shift+Enter for new line, character counter, and loading state.
   - New Conversation modal: Topic & Subject dropdown selectors, optional title, initial prompt, and accessible focus management.
   - Accessible loading skeletons, empty states, and error recovery states.

2. **`client/src/api/chatsApi.js`**:
   - Standardized API service client for chat and message operations.

3. **`client/src/components/ui/Icon.jsx`**:
   - Added native SVG icons for `send`, `sparkles`, `copy`, and `archive`.

4. **`client/src/routes/AppRoutes.jsx`**:
   - Mounted `ChatsPage` on protected routes `/chats` and `/chats/:chatId`.

---

## 7. Verification & Testing

### 7.1 Automated Backend Tests (`server/tests/chats.test.js`)
17 automated tests covering:
- Authentication requirements on chat and message endpoints.
- General and topic-linked chat creation.
- Topic `chatsCount` increment and decrement lifecycle.
- Initial message submission and Socratic assistant response generation.
- Deterministic sequence indexing and chronological ordering.
- Chat listing, status filtering, search filtering, and pagination.
- Chat metadata update and archiving.
- Chat deletion and child message cascade deletion.
- Multi-tenant cross-user access rejection (404 on GET, PUT, DELETE, message listing, message sending, and foreign topic association).
- Full cascade deletion from Subject → Topic → Chat → Messages.
- Full cascade deletion from Topic → Chat → Messages.
- Input validation (empty content, invalid ObjectIds, max length).
- Total server test suite: **83 tests passing across 7 test files**.

### 7.2 Automated Frontend Tests (`client/src/pages/Chats.test.jsx`)
4 automated tests covering:
- Conversation list rendering and active chat message thread loading.
- Empty state rendering when no conversations exist.
- New conversation modal opening, subject/topic selection, form submission, and conversation redirect.
- Message composer input, sending message, and rendering user + assistant exchange bubbles.
- Total client test suite: **40 tests passing across 4 test files**.
- **Total Monorepo Tests: 123 tests passing (100%)**.

### 7.3 Production Build Verification
- Vite production build completed with 0 errors: `built in 13.46s`, generating 280kB gzipped JavaScript bundle.

### 7.4 Live Integration & Regression Verification (`server/scripts/verify_phase04_live.js`)
Executed against local Express backend on port 5000 and live MongoDB Atlas:
```
=== Starting Phase 04 Live Verification against local server ===

✓ Connected to MongoDB for test fixture provisioning
✓ Provisioned User A (6ac14a1930032100da49f3db) and User B (6ac14a1a30032100da49f3e6)

[1] Provisioning Subject & Topic for User A...
✓ Created Subject: 6ac14a1bc532bb089e3a5f1c
✓ Created Topic: 6ac14a1bc532bb089e3a5f24

[2] User A creates topic-linked conversation with initial message...
✓ Chat created: 6ac14a1cc532bb089e3a5f2c - "Study: Paxos & Raft Protocols"
✓ Initial messages count: 2
✓ Topic chatsCount is: 1

[3] User A sends a follow-up message in conversation...
✓ Sent message. Returned 2 messages in exchange.
  User message sequenceIndex: 2
  Assistant message sequenceIndex: 3

[4] User A retrieves chronological message list...
✓ Retrieved 4 chronological messages.

[5] User A gets single chat details...
✓ Subject linked: Distributed Computing 1791052313341
✓ Topic linked: Paxos & Raft Protocols
✓ Reconciled messagesCount: 4

[6] User A archives conversation...
✓ Chat status updated to: archived

[7] Cross-tenant Isolation Verification (User B accessing User A)...
✓ User B GET Chat A -> 404 Not Found (Passed)
✓ User B PUT Chat A -> 404 Not Found (Passed)
✓ User B DELETE Chat A -> 404 Not Found (Passed)
✓ User B GET Messages of Chat A -> 404 Not Found (Passed)
✓ User B POST Message in Chat A -> 404 Not Found (Passed)
✓ User B POST Chat with Topic A -> 404 Not Found (Passed)

[8] Cascading Deletion Verification (Subject -> Topic -> Chat -> Messages)...
✓ User A deleted Subject A
  Remaining topics in DB: 0
  Remaining chats in DB: 0
  Remaining messages in DB: 0
✓ Cascade deletion verified completely clean

=== ALL PHASE 04 LIVE VERIFICATION CHECKS PASSED SUCCESSFULLY ===
✓ Cleaned up test fixtures and disconnected from DB
```

---

## 8. Dependencies Discipline

- **No new dependencies added**.
- Pure JavaScript ES Modules throughout (`server` and `client`).
- Kept within audited dependencies: `express`, `mongoose`, `react`, `react-router-dom`, `vitest`.
- Zero TypeScript introduction.

---

## 9. Future-Phase Boundaries

The following capabilities are explicitly deferred to maintain strict modularity:
- **Phase 05 (AI Gateway & Model Routing)**: Multi-provider LLM routing (Gemini, OpenAI, Anthropic), streaming delivery, and token accounting.
- **Phase 06 (Knowledge Extraction Engine)**: Extracting validated concepts from chat evidence into `Topic.knowledgeState`.
- **Phase 07 (Structured Note Generation)**: Automatic synthesis block notes generated from conversational milestones.
- **Phase 08 (Study Mode Engine)**: Structured pedagogical coaching loops.
- **Phase 10 (Adaptive Quizzes)**: Auto-generated quizzes targeting topic key concepts.
- **Phase 11 (Conversation Import)**: Ingesting external chat logs into LearnForge.

---

## 10. Technical Interview Guide & Explanations

### Architecture Overview
> *"In LearnForge, chat is the interaction layer, while knowledge is the durable product. In Phase 04, we designed the Chat and Message infrastructure around normalized MongoDB collections. Messages are stored in a dedicated collection with compound unique indexes `{ chatId: 1, sequenceIndex: 1 }` to guarantee strict chronological ordering without timestamp race conditions. Denormalizing `userId` across both models guarantees O(1) indexed multi-tenant security on every message lookup without requiring expensive joins. Furthermore, conversations optionally link directly to curriculum Subjects and Topics, providing the exact foreign-key evidence foundation that downstream AI extraction and note synthesis engines require."*

### Likely Technical Interview Questions & Answers

#### Q1: Why use an integer `sequenceIndex` instead of relying on `createdAt` timestamps for message ordering?
**Answer**: Clocks across distributed client devices and container instances can experience clock drift or sub-millisecond concurrency overlaps. Relying on timestamps can result in messages appearing out of order. An integer `sequenceIndex` with a compound unique index `{ chatId: 1, sequenceIndex: 1 }` guarantees deterministic chronological ordering and prevents sequence collisions.

#### Q2: Why separate `Chat` and `Message` into different collections instead of embedding messages inside the chat document?
**Answer**: Embedding messages within a single document hits MongoDB's 16MB document size limit and complicates pagination. By separating them into dedicated collections, chats can scale indefinitely, support pagination (`?limit=50&beforeSequence=`), and allow individual messages to be referenced as canonical evidence by future knowledge extraction and note synthesis pipelines.

#### Q3: How is `Topic.chatsCount` maintained without multi-document transactions?
**Answer**: `Topic.chatsCount` is maintained through coordinated application-level updates (incremented when topic-linked chats are created, decremented when deleted) and reconciled on single topic queries (`GET /api/v1/topics/:id`). This ensures total consistency without requiring MongoDB replica set transactions.
