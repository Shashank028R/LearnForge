# Phase 03: Subjects, Topics & Knowledge Structure

- **Status**: Complete
- **Date**: October 3, 2026
- **Branch**: `main`
- **Core Principle**: *"Knowledge is the product. Conversations are evidence."*

---

## 1. Objective

Transform subjects and topics from frontend visual placeholders into first-class, authenticated, user-isolated persisted domain entities in MongoDB. Establish an extensible knowledge structure foundation capable of supporting downstream AI extraction (Phase 05/06), structured notes (Phase 07), study sessions (Phase 08), and adaptive quizzes (Phase 10) without future schema breaking changes.

---

## 2. Architecture & Domain Model

LearnForge organizes learning hierarchy into two primary persistent domain entities with strict user ownership and an embedded canonical knowledge state:

```
[User] (1)
  │
  ├──> (N) [Subject]
  │           │ _id, userId, name, normalizedName, color, targetMasteryLevel, topicsCount
  │           │
  │           └──> (N) [Topic]
  │                     │ _id, subjectId, userId, title, normalizedTitle, orderIndex, status
  │                     │
  │                     └──> [knowledgeState] (Embedded Subdocument)
  │                               masteryScore (0-100)
  │                               keyConcepts ([String])
  │                               summary (String)
  │                               lastStudiedAt (Date)
```

### Key Architectural Decisions (ADR-011)
1. **Denormalized Ownership**: Both `Subject` and `Topic` store `userId: ObjectId`. This allows topic queries (`findOne`, `updateOne`, `deleteOne`) to enforce user ownership in a single indexed query (`{ _id: topicId, userId: req.user._id }`) without requiring an expensive cross-collection join against the parent subject.
2. **Normalized Collections**: Topics are stored in a dedicated `topics` collection rather than embedded in an unbounded array inside `Subject`. This avoids MongoDB's 16MB document size limit and enables direct indexing and foreign key references from future chats and notes.
3. **Application-Level Cascading Deletions**: Deleting a subject triggers a scoped cascade delete (`await Topic.deleteMany({ subjectId: subject._id, userId: req.user._id })`), ensuring orphaned topic records never linger in the database.
4. **Knowledge State Boundary**: `knowledgeState` subdocument is persisted directly within `Topic`. In Phase 03, the schema foundation is fully established and exposed for manual curation; automatic AI extraction and background LLM synchronization are deferred to Phases 05 and 06.

---

## 3. Schema & Database Design

### 3.1 Subject Collection (`subjects`)
```javascript
{
  _id: ObjectId,
  userId: ObjectId,          // Indexed, Ref: User, Required
  name: String,              // Trimmed, 1-120 chars, Required
  normalizedName: String,    // Lowercase for unique compound index
  description: String,       // Optional, max 500 chars
  color: String,             // Color hex code (default: '#3b82f6')
  status: String,            // 'active' | 'archived' (default: 'active')
  targetMasteryLevel: String,// 'beginner' | 'intermediate' | 'advanced' | 'comprehensive'
  topicsCount: Number,       // Cached counter (default: 0)
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes**:
- `{ userId: 1, normalizedName: 1 }` (Unique): Prevents duplicate subject names within a user's workspace while allowing distinct users to have subjects with identical names.
- `{ userId: 1, status: 1, updatedAt: -1 }`: Optimizes user dashboard listing, status filtering, and chronological sorting.

### 3.2 Topic Collection (`topics`)
```javascript
{
  _id: ObjectId,
  subjectId: ObjectId,       // Indexed, Ref: Subject, Required
  userId: ObjectId,          // Indexed, Ref: User, Required
  title: String,             // Trimmed, 1-160 chars, Required
  normalizedTitle: String,   // Lowercase for unique index per subject
  description: String,       // Optional, max 1000 chars
  orderIndex: Number,        // 0-indexed sequential position
  status: String,            // 'not_started' | 'in_progress' | 'mastered' (default: 'not_started')
  knowledgeState: {
    masteryScore: Number,    // 0 - 100 (default: 0)
    keyConcepts: [String],   // Atomic conceptual identifiers
    summary: String,         // Canonical synthesized summary
    lastStudiedAt: Date      // Nullable
  },
  notesCount: Number,        // Future Phase 07 counter (default: 0)
  chatsCount: Number,        // Future Phase 04 counter (default: 0)
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes**:
- `{ subjectId: 1, orderIndex: 1 }`: Covers sequential topic ordering within a subject.
- `{ userId: 1, subjectId: 1 }`: Supports fast workspace aggregation and cross-tenant checks.
- `{ subjectId: 1, normalizedTitle: 1 }` (Unique): Prevents duplicate topic titles within the same parent subject.

---

## 4. API Endpoints & Request/Response Contracts

All endpoints are mounted under `/api/v1` and protected by `requireDatabase` and `authenticateUser` middleware.

| Method | Endpoint | Description | Status |
|--------|----------|-------------|--------|
| `GET` | `/api/v1/subjects` | List current user's subjects (supports `?status=` and `?search=`) | 200 |
| `POST` | `/api/v1/subjects` | Create a new subject for the authenticated user | 201 |
| `GET` | `/api/v1/subjects/:subjectId` | Get a single owned subject | 200, 404 |
| `PUT` | `/api/v1/subjects/:subjectId` | Update an owned subject | 200, 404 |
| `DELETE` | `/api/v1/subjects/:subjectId` | Delete an owned subject and cascade child topics | 200, 404 |
| `GET` | `/api/v1/subjects/:subjectId/topics` | List topics for an owned subject (nested style) | 200, 404 |
| `POST` | `/api/v1/subjects/:subjectId/topics` | Create a topic inside an owned subject (nested style) | 201, 404 |
| `GET` | `/api/v1/topics?subjectId=:id` | List topics for an owned subject (collection style) | 200, 404 |
| `POST` | `/api/v1/topics` | Create a topic inside an owned subject (collection style) | 201, 404 |
| `GET` | `/api/v1/topics/:topicId` | Get a single owned topic | 200, 404 |
| `PUT` | `/api/v1/topics/:topicId` | Update an owned topic | 200, 404 |
| `DELETE` | `/api/v1/topics/:topicId` | Delete an owned topic and decrement subject count | 200, 404 |

### Standard Response Envelope
```json
{
  "success": true,
  "data": {
    "subject": {
      "id": "6ac11f85bc66cc33bb05f4bd",
      "_id": "6ac11f85bc66cc33bb05f4bd",
      "name": "Computational Complexity",
      "description": "P vs NP, Turing machines, and reductions",
      "color": "#3b82f6",
      "status": "active",
      "targetMasteryLevel": "advanced",
      "topicsCount": 1,
      "createdAt": "2026-10-03T15:30:00.000Z",
      "updatedAt": "2026-10-03T15:30:00.000Z"
    }
  },
  "meta": {
    "requestId": "87a0d9f5-5d36-4f7a-9fa8-fcd7e2725cf9"
  }
}
```

---

## 5. Security & Authorization Enforcement

1. **Client User IDs Rejected**: The client never passes a `userId`. All operations derive the user identity strictly from `req.user._id` populated by the session cookie or verified Bearer token.
2. **Strict Multi-Tenant Isolation**:
   - `Subject.findOne({ _id: subjectId, userId: req.user._id })`
   - `Topic.findOne({ _id: topicId, userId: req.user._id })`
   - If User B attempts to access User A's subject or topic via GET, PUT, or DELETE, the server returns `404 Not Found` (deliberately obscuring existence to prevent resource enumeration).
3. **Cross-Tenant Parenting Prevention**: When creating a topic, the handler validates that `subjectId` belongs to `req.user._id`. An attacker cannot insert a topic into another user's subject.
4. **Input Sanitization & Constraints**: Maximum lengths enforced (Name: 120 chars, Subject Description: 500 chars, Topic Title: 160 chars, Topic Description: 1000 chars), enum validation on mastery levels and status, and regex-safe escaping on search filters.

---

## 6. Frontend Implementation

1. **`client/src/pages/SubjectsPage.jsx`**:
   - Live API-backed list rendering with responsive card grid.
   - Top accent color bar, metadata badges (status, target mastery, topic count).
   - "New Subject" modal dialog with accessible focus trap, keyboard dismiss, and color palette presets.
   - "Edit Subject" modal dialog.
   - "Delete Subject" accessible confirmation dialog warning of cascading child deletions.
   - Loading skeleton grid (6 cards).
   - Empty state with guided call-to-action button.
   - Error state with recovery retry button.

2. **`client/src/pages/SubjectDetailPage.jsx`**:
   - Back link to `/subjects`.
   - Subject header card with color badge, title, description, mastery target, and action buttons.
   - Topic list with sequential numbering badges, title, description, and status badges (`not_started`, `in_progress`, `mastered`).
   - Knowledge state preview rendering `keyConcepts` chips.
   - "New Topic" modal dialog (order index, title, description, status).
   - "Edit Topic" modal dialog.
   - "Delete Topic" accessible confirmation dialog.
   - Synchronized `topicsCount` state on parent subject.

3. **`client/src/api/subjectsApi.js`**:
   - Unified API service wrapping `apiClient` for `subjects` and `topics`.

4. **`client/src/routes/AppRoutes.jsx`**:
   - Replaced placeholder detail page with `SubjectDetailPage` for protected route `/subjects/:subjectId`.

---

## 7. Verification & Testing

### 7.1 Automated Backend Tests (`server/tests/subjects.test.js`)
28 automated tests covering:
- Authentication requirement on subjects and topics endpoints.
- CRUD operations for subjects.
- Target mastery contract validation (`beginner`, `intermediate`, `advanced`, `comprehensive`, and invalid 400 rejection on create and update).
- Duplicate subject name prevention per user.
- Status and search query filtering.
- Sequential topic ordering and topic count maintenance.
- Cross-tenant authorization isolation (User B attempting GET, PUT, DELETE on User A's subjects and topics).
- Cascading deletion of topics when a subject is deleted.
- Total server test suite: **66 tests passing across 6 test files**.

### 7.2 Automated Frontend Tests (`client/src/pages/Subjects.test.jsx`, `client/src/App.test.jsx`)
- Loading skeleton state verification.
- Empty state rendering and dialog trigger.
- Subject creation form submission and immediate UI update.
- Target mastery selection including `comprehensive` rendering and submission.
- Subject deletion with accessible confirmation modal.
- Subject detail view with topic listing, concept tags, and topic creation modal.
- Total client test suite: **36 tests passing across 3 test files**.

### 7.3 Production Build Verification
- Vite production build completed with 0 errors: `built in 7.66s`, generating 260kB gzipped JavaScript bundle.

### 7.4 Live Integration & Regression Verification (`server/scripts/verify_phase03_live.js`)
Executed against running local backend on port 5000 connected to MongoDB Atlas:
```
=== Starting Phase 03 Live Verification against local server ===

✓ Connected to MongoDB for test fixture provisioning
✓ Provisioned User A (6ac11f83c8fd1f45bee4d031) and User B (6ac11f84c8fd1f45bee4d039)

[1] User A creates Subject...
✓ Subject created: 6ac11f85bc66cc33bb05f4bd - "Computational Complexity"

[2] User A gets owned Subject...
✓ Fetched subject: "Computational Complexity"

[3] User A creates Topic...
✓ Topic created: 6ac11f86bc66cc33bb05f4c9 - "Polynomial Time Reductions"

[4] User A lists topics for Subject...
✓ Listed 1 topic(s)

[5] User A updates Topic status...
✓ Updated topic status to "mastered"

[6] Cross-tenant Isolation Verification (User B accessing User A)...
✓ User B GET Subject A -> 404 Not Found (Passed)
✓ User B PUT Subject A -> 404 Not Found (Passed)
✓ User B DELETE Subject A -> 404 Not Found (Passed)
✓ User B GET Topics of Subject A -> 404 Not Found (Passed)
✓ User B POST Topic in Subject A -> 404 Not Found (Passed)
✓ User B GET Topic A -> 404 Not Found (Passed)
✓ User B PUT Topic A -> 404 Not Found (Passed)
✓ User B DELETE Topic A -> 404 Not Found (Passed)

[7] Cascading Deletion Verification...
✓ User A deleted Subject A
✓ Confirmed 0 remaining topics in DB (Cascade succeeded)

=== ALL LIVE VERIFICATION CHECKS PASSED SUCCESSFULLY ===
✓ Cleaned up test fixtures and disconnected from DB
```

---

## 8. Dependencies Discipline

- **No new dependencies added**.
- Pure JavaScript ES Modules throughout (`server` and `client`).
- Zero TypeScript introduction.
- Kept within existing dependencies: `express`, `mongoose`, `react`, `react-router-dom`, `vitest`.

---

## 9. Future-Phase Boundaries

To maintain strict architectural modularity, the following capabilities are explicitly deferred:
- **Phase 04 (Socratic Chat Engine)**: Interactive learning conversations referencing `topicId`.
- **Phase 05 (AI Gateway & Model Routing)**: Multi-provider LLM routing (Gemini, OpenAI, Anthropic).
- **Phase 06 (Knowledge Extraction Engine)**: Automatic background concept extraction from conversations into `Topic.knowledgeState`.
- **Phase 07 (Structured Note Generation)**: Canonical synthesis notes mapped to topics.
- **Phase 10 (Adaptive Quizzes)**: Auto-generated quizzes targeting topic key concepts.

---

## 10. Technical Interview Guide & Explanations

### Architecture Overview
> *"In LearnForge, our core architectural thesis is 'Knowledge is the product; conversations are evidence.' In Phase 03, we implemented the persistent knowledge hierarchy using two normalized MongoDB collections: Subjects and Topics. Subjects represent high-level learning domains, while Topics represent discrete curriculum milestones with an embedded `knowledgeState` subdocument containing canonical concepts, synthesized summaries, and mastery scores. Rather than embedding topics inside subjects—which would hit document size limits and make relational querying difficult—we denormalized the `userId` onto both models. This gives us O(1) indexed ownership enforcement on every read and write without expensive cross-collection joins."*

### Likely Technical Interview Questions & Answers

#### Q1: Why denormalize `userId` onto the Topic model if it already has a `subjectId`?
**Answer**: Denormalizing `userId` provides defense-in-depth and eliminates relational join penalties. To mutate or fetch a single topic (`GET /api/v1/topics/:id`), we can execute `Topic.findOne({ _id: topicId, userId: req.user._id })`. This lookup is satisfied in a single index scan using our `{ userId: 1, subjectId: 1 }` index without needing an initial query to verify subject ownership.

#### Q2: Why return 404 instead of 403 when User B accesses User A's subject?
**Answer**: Returning `403 Forbidden` confirms to an attacker that the resource ID exists, allowing enumeration attacks. Returning `404 Not Found` treats unauthorized requests as if the resource does not exist, preserving total privacy between tenants.

#### Q3: How do you handle cascade deletion without transactions?
**Answer**: Because LearnForge supports local and standalone MongoDB instances without requiring replica sets, we use application-level orchestration: when `deleteSubject` is invoked, we delete all child topics matching `{ subjectId: subject._id, userId: req.user._id }` prior to removing the subject document itself. In the event of a crash, orphaned topics remain inaccessible because all list queries require an existing owned parent subject.
