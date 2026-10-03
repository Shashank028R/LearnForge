# Phase 04: Chat Infrastructure

- **Status**: Complete — Hardened
- **Date**: October 4, 2026
- **Branch**: `main`
- **Core Principle**: *"Knowledge is the product. Conversations are evidence."*

---

## 1. Objective

Build a resilient, production-ready **Chat and Message Infrastructure** in MongoDB that represents the student interaction layer. Enforce deterministic chronological message sequencing, strict multi-tenant authorization boundaries, full CRUD and safe reassignment REST APIs, topic/subject syllabus linkage, and an accessible, responsive two-pane UI workspace, while establishing clean forward-compatibility for downstream AI Gateway routing (Phase 05), knowledge extraction (Phase 06), and note synthesis (Phase 07).

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
1. **Normalized Message Persistence**: Messages are stored in a dedicated `messages` collection with compound unique indexing `{ chatId: 1, sequenceIndex: 1 }`, ensuring unbounded scalability, fast paginated retrieval, and deterministic ordering.
2. **Denormalized User Ownership**: Both `Chat` and `Message` models persist `userId: ObjectId`. This provides defense-in-depth, eliminating relational `$lookup` joins on message queries and securing cross-tenant boundaries with uniform `404 Not Found` responses.
3. **Syllabus Linkage & Safe Reassignment**: Chats can link to a parent `Topic` and `Subject` (or operate as general workspace conversations). When linked, reassigned, or unlinked, `Topic.chatsCount` is maintained through coordinated application-level updates and reconciled on read.
4. **Message Role Authorization Trust Boundary**:
   - **Client messages** (`POST /api/v1/chats/:chatId/messages`) MUST have `role: "user"` (or omit role). Supplying `system` or `assistant` roles returns `400 VALIDATION_ERROR`.
   - **Server / AI Gateway**: Internal backend logic may generate `assistant` or `system` messages.
5. **Concurrency-Safe Sequence Allocation**: Appending messages uses an integer sequence generator with an automatic collision retry loop on MongoDB duplicate key errors (code 11000), guaranteeing monotonic ordering and zero dropped messages under concurrent appends.
6. **Application-Level Cascading Lifecycle**:
   - Deleting a `Chat` purges its messages (`Message.deleteMany({ chatId, userId })`) and decrements `Topic.chatsCount`.
   - Deleting a `Topic` purges its child chats and messages.
   - Deleting a `Subject` cascades deletion across all child topics, chats, and messages.
7. **Assistant Preview Boundary**: Phase 04 provides a deterministic Socratic preview response for development and workflow testing — this is **explicitly NOT an AI model integration** (no AI SDKs or API keys). Phase 05 will replace this with the real AI Gateway and task-based model router.

---

## 3. Schema & Database Design

### 3.1 Chat Collection (`chats`)
```javascript
{
  _id: ObjectId,
  userId: ObjectId,          // Indexed, Ref: User, Required
  subjectId: ObjectId,       // Indexed, Ref: Subject, Optional/Nullable
  topicId: ObjectId,         // Indexed, Ref: Topic, Optional/Nullable
  title: String,             // Trimmed, 1-200 chars (default: 'New Conversation')
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
  content: String,           // Trimmed, 1-20,000 chars, Required
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
| `PUT` / `PATCH` | `/api/v1/chats/:chatId` | Update chat metadata (title, status, metadata) and safely reassign `subjectId` / `topicId` | 200, 400, 404 |
| `DELETE` | `/api/v1/chats/:chatId` | Delete chat, cascade child messages, decrement parent `Topic.chatsCount` | 200, 404 |
| `GET` | `/api/v1/chats/:chatId/messages` | List chronological messages (`?limit=50&beforeSequence=`) | 200, 404 |
| `POST` | `/api/v1/chats/:chatId/messages` | Append user message (role `user` only) & generate deterministic Socratic preview | 201, 400, 404 |

---

## 5. Security & Authorization Enforcement

1. **Role Trust Boundary**:
   - Client messages sent to `POST /api/v1/chats/:chatId/messages` must have `role: "user"` or omit role.
   - Any client attempt to supply `role: "system"` or `role: "assistant"` is rejected with `400 VALIDATION_ERROR`.
   - This guarantees that user content cannot impersonate system instructions when Phase 05 constructs LLM prompts.
2. **Strict Multi-Tenant Isolation**:
   - `Chat.findOne({ _id: chatId, userId: req.user._id })`
   - `Message.find({ chatId, userId: req.user._id })`
   - Returns `404 Not Found` for any attempt by User B to view, update, delete, or send messages into User A's chat (preventing ID enumeration).
3. **Safe Reassignment & Cross-Tenant Parenting Prevention**:
   - Reassigning a chat validates that both target `subjectId` and `topicId` belong to `req.user._id`.
   - Inconsistent subject/topic combinations are rejected with `400 VALIDATION_ERROR`.
   - Cross-tenant reassignment attempts return `404 NOT_FOUND`.
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
   - Message thread: Avatars (Sparkles for Assistant, User for Student), markdown bubble styling, timestamps, copy to clipboard utility with visual feedback, and auto-scroll to latest message.
   - Message composer: Auto-resizing textarea, Enter to send, Shift+Enter for new line, character counter, and loading state.
   - New Conversation modal: Topic & Subject dropdown selectors, optional title, initial prompt, and accessible focus management.

2. **`client/src/api/chatsApi.js`**:
   - Standardized API service client for chat and message operations with defensive unboxing.

3. **`client/src/components/ui/Icon.jsx`**:
   - Added native SVG icons for `send`, `sparkles`, `copy`, and `archive`.

4. **`client/src/routes/AppRoutes.jsx`**:
   - Mounted `ChatsPage` on protected routes `/chats` and `/chats/:chatId`.

---

## 7. Verification & Testing

### 7.1 Automated Backend Tests (`server/tests/chats.test.js`)
28 automated tests covering:
- Authentication enforcement on all chat/message endpoints.
- General and topic-linked chat creation with initial Socratic dialogue.
- Safe chat reassignment (Topic A → Topic B, Topic → No Topic, No Topic → Topic, subject/topic consistency, cross-tenant rejection).
- Message Role Trust Boundary (rejecting `system` and `assistant` from client, accepting `user`).
- Concurrency-safe sequence allocation and duplicate-key collision recovery.
- Chronological message listing and beforeSequence pagination.
- Chat metadata update and archiving.
- Chat deletion and child message cascade deletion.
- Multi-tenant cross-user access rejection (404 on GET, PUT, PATCH, DELETE, message listing, message sending, and foreign topic association).
- Full cascade deletion from Subject → Topic → Chat → Messages.
- Input validation (empty content, invalid ObjectIds, 20,000 max length).
- Total server test suite: **94 tests passing across 7 test files**.

### 7.2 Automated Frontend Tests (`client/src/pages/Chats.test.jsx`)
4 automated tests covering:
- Conversation list rendering and active chat message thread loading.
- Empty state rendering when no conversations exist.
- New conversation modal opening, subject/topic selection, form submission, and conversation redirect.
- Message composer input, sending message, and rendering user + assistant exchange bubbles.
- Total client test suite: **40 tests passing across 4 test files**.
- **Total Monorepo Tests: 134 tests passing (100%)**.

### 7.3 Production Build Verification
- Vite production build completed with 0 errors: `built in 7.13s`, generating 280kB gzipped JavaScript bundle.

### 7.4 Live Integration & Regression Verification (`server/scripts/verify_phase04_live.js`)
Executed against local Express backend on port 5000 and live MongoDB Atlas:
```
=== Starting Phase 04 Live Verification against local server and MongoDB Atlas ===

✓ Connected to MongoDB Atlas for test fixture provisioning
✓ Provisioned User A (6ac14d728c119c496ec6c91a) and User B (6ac14d738c119c496ec6c925)

[1] User A creates Subject A...
✓ Created Subject A: 6ac14d74665e63850d8e7e9e

[2] User A creates Topic A and Topic B under Subject A...
✓ Created Topic A: 6ac14d74665e63850d8e7ea6
✓ Created Topic B: 6ac14d75665e63850d8e7eaf

[3] User A creates Chat linked to Topic A with initial message...
✓ Chat created: 6ac14d75665e63850d8e7eb7 - "Study: Paxos & Raft Protocols"

[4] Verifying Topic A chatsCount...
  Topic A chatsCount: 1
  Topic B chatsCount: 0
✓ Topic counts verified correctly

[5] Reassigning Chat from Topic A to Topic B via PATCH /api/v1/chats/:id...
✓ Chat reassigned. New topicId: 6ac14d75665e63850d8e7eaf

[6] Verifying updated Topic A (0) and Topic B (1) chatsCount...
  Topic A chatsCount: 0
  Topic B chatsCount: 1
✓ Topic counts reconciled properly after reassignment

[7] Testing cross-tenant reassignment security (User A trying to assign User B topic)...
✓ Cross-tenant reassignment rejected with 404 Not Found (Passed)

[8] Testing Message Role Authorization Trust Boundary...
✓ role="system" rejected: 400 Client messages must use role "user". Roles "assistant" and "system" cannot be created by clients.
✓ role="assistant" rejected: 400 Client messages must use role "user". Roles "assistant" and "system" cannot be created by clients.
✓ role="user" accepted: created user message (2) and assistant preview (3)

[9] Verifying sequence ordering and concurrency handling...
✓ Persisted messages sequence indices: [0, 1, 2, 3, 4, 5, 6, 7]
✓ All sequence indices strictly unique, continuous, and monotonically ordered

[10] Cross-tenant Isolation Verification (User B querying User A)...
✓ User B GET Chat A -> 404 Not Found (Passed)
✓ User B PATCH Chat A -> 404 Not Found (Passed)
✓ User B DELETE Chat A -> 404 Not Found (Passed)
✓ User B GET Messages of Chat A -> 404 Not Found (Passed)
✓ User B POST Message in Chat A -> 404 Not Found (Passed)

[11] Cascading Deletion Verification (Subject -> Topics -> Chats -> Messages)...
✓ User A deleted Subject A
  Remaining topics in DB: 0
  Remaining chats in DB: 0
  Remaining messages in DB: 0
✓ Cascade deletion verified completely clean

=== ALL PHASE 04 LIVE VERIFICATION CHECKS PASSED SUCCESSFULLY ===
✓ Cleaned up test fixtures and disconnected from MongoDB Atlas
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

### Q1: Why use an integer `sequenceIndex` with a retry loop instead of relying on `createdAt` timestamps for message ordering?
**Answer**: Clocks across distributed client devices and container instances experience clock drift and sub-millisecond concurrency overlaps. Relying on timestamps can result in messages appearing out of order. An explicit integer `sequenceIndex` with a compound unique index `{ chatId: 1, sequenceIndex: 1 }` guarantees deterministic chronological ordering and prevents duplicate insertions. By wrapping sequence allocation in a short backoff retry loop on MongoDB duplicate key errors (code 11000), concurrent message appends succeed deterministically without requiring multi-document transactions.

### Q2: Why separate `Chat` and `Message` into different collections instead of embedding messages inside the chat document?
**Answer**: Embedding messages within a single document hits MongoDB's 16MB document cap and causes document fragmentation during active learning sessions. Normalizing messages into an independent collection allows conversations to scale indefinitely, enables efficient pagination (`?limit=50&beforeSequence=`), and permits individual messages to be referenced as canonical evidence by downstream knowledge extraction (Phase 06) and note synthesis (Phase 07) engines.

### Q3: What is the Message Role Trust Boundary and why is it critical for Phase 05?
**Answer**: The client endpoint `POST /api/v1/chats/:chatId/messages` strictly enforces that client-submitted messages use `role: "user"`, rejecting `role: "assistant"` or `role: "system"` with `400 VALIDATION_ERROR`. This establishes a strict trust boundary: user input can never inject authoritative system prompts or falsify assistant responses into persisted conversation history. When Phase 05 reconstructs message history to prompt LLMs, system instructions remain strictly server-controlled.
