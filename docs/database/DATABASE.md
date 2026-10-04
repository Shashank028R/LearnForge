# LearnForge — Database Design & Schema Specification

## 1. Core Principles

- Explicit user ownership on all private records.
- Normalized references for high-growth and cross-cutting entities.
- Passwordless identity modeling with zero stored passwords.
- Immutable snapshots for note versioning and audit trails.
- Strict indexing strategy aligned with query access patterns.
- Automatic document cleanup via MongoDB TTL (Time-To-Live) indexes.

---

## 2. Authentication Entities (Phase 01 Implemented)

### 2.1 User
Represents account-level identity and preferences.

```javascript
{
  _id: ObjectId,
  email: String,            // Original email string, lowercase, trimmed
  normalizedEmail: String,  // Unique, indexed canonical email
  displayName: String,      // User display name
  avatarUrl: String,        // Profile image URL or null
  status: String,           // 'active' | 'suspended' | 'deactivated'
  timezone: String,         // Default: 'UTC'
  onboardingState: String,  // Default: 'completed'
  preferences: {
    theme: String,          // 'light' | 'dark'
    density: String,        // 'normal' | 'compact'
    studyStrictness: String,// 'balanced' | 'strict'
    defaultMode: String     // 'chat' | 'study'
  },
  lastActiveAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes**:
- `normalizedEmail`: `{ unique: true }`
- `status`: `{}`

---

### 2.2 AuthIdentity
Represents an external or email authentication identity attached to a User.

```javascript
{
  _id: ObjectId,
  userId: ObjectId,         // Ref: 'User'
  provider: String,         // 'google' | 'email'
  providerSubject: String,  // Google 'sub' claim or normalized email
  emailAtProvider: String,  // Email reported by the provider
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes**:
- Compound Unique Index: `{ provider: 1, providerSubject: 1 }, { unique: true }`
- Lookup Index: `{ userId: 1 }`

---

### 2.3 UserSession
Represents an active or revoked authenticated session. Raw session tokens are never stored.

```javascript
{
  _id: ObjectId,
  userId: ObjectId,         // Ref: 'User'
  sessionTokenHash: String, // SHA-256 hash of opaque 256-bit token
  deviceInfo: {
    userAgent: String,
    ip: String
  },
  authMethod: String,       // 'google' | 'otp'
  expiresAt: Date,          // Default: 30 days from creation
  revokedAt: Date,          // null if active, Date if logged out
  lastSeenAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes**:
- `sessionTokenHash`: `{ unique: true }`
- `userId`: `{}`
- `revokedAt`: `{}`
- TTL Index: `{ expiresAt: 1 }, { expireAfterSeconds: 0 }` (Automated MongoDB expiration cleanup)

---

### 2.4 EmailOtpToken
Stores pending 6-digit passwordless verification codes. Plaintext codes are never stored.

```javascript
{
  _id: ObjectId,
  email: String,            // Normalized email, unique
  otpHash: String,          // HMAC-SHA-256(key=OTP_HMAC_SECRET, data=email + ":" + code)
  attempts: Number,         // Default: 0 (locked out at 5)
  maxAttempts: Number,      // Default: 5
  expiresAt: Date,          // 10 minutes from creation
  resendAvailableAt: Date,  // 60-second cooldown
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes**:
- `email`: `{ unique: true }`
- TTL Index: `{ expiresAt: 1 }, { expireAfterSeconds: 0 }`

---

## 3. Knowledge Hierarchy & Governance Entities (Phase 03 & 04.1 Implemented)

### 3.1 Subject
Represents a user-owned learning discipline or course syllabus.

```javascript
{
  _id: ObjectId,
  userId: ObjectId,          // Ref: 'User', indexed, required
  name: String,              // Trimmed, 1-120 chars, required
  normalizedName: String,    // Lowercase for unique compound index per user
  description: String,       // Optional, max 500 chars
  color: String,             // Color hex code (default: '#3b82f6')
  status: String,            // 'active' | 'archived' (default: 'active')
  targetMasteryLevel: String,// 'beginner' | 'intermediate' | 'advanced' | 'comprehensive'
  topicsCount: Number,       // Maintained count of ACTIVE syllabus topics ({ isActiveInSyllabus: true }) (default: 0)
  syllabusStatus: String,    // 'no_syllabus' | 'draft' | 'approved' (default: 'no_syllabus')
  activeSyllabusVersionId: ObjectId, // Ref: 'SyllabusVersion', nullable
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes**:
- Unique Compound Index: `{ userId: 1, normalizedName: 1 }, { unique: true }` — prevents duplicate subject names within a user's workspace.
- Dashboard Query Index: `{ userId: 1, status: 1, updatedAt: -1 }` — optimizes workspace filtering and chronological display.
- Syllabus Status Index: `{ syllabusStatus: 1 }`

---

### 3.2 SyllabusVersion
Represents an immutable or draft curriculum proposal / authoritative learning contract.

```javascript
{
  _id: ObjectId,
  subjectId: ObjectId,       // Ref: 'Subject', indexed, required
  userId: ObjectId,          // Ref: 'User', indexed, required
  version: Number,           // Monotonic version number (1, 2, 3...), required
  status: String,            // 'draft' | 'approved' | 'superseded' (default: 'draft')
  title: String,             // Curriculum title (default: 'Curriculum Syllabus')
  sections: [
    {
      _id: ObjectId,
      key: String,           // Stable key (e.g. 'sec-1')
      title: String,
      description: String,
      orderIndex: Number,
      topics: [
        {
          _id: ObjectId,
          key: String,       // Stable key (e.g. 'top-1-1')
          title: String,
          description: String,
          orderIndex: Number,
          estimatedMinutes: Number
        }
      ]
    }
  ],
  source: String,            // 'user_created' | 'ai_assisted' | 'imported'
  changeSummary: String,     // Revision notes
  approvedAt: Date,          // Timestamp of explicit approval
  supersededAt: Date,        // Timestamp when replaced by a newer approved version
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes**:
- Compound Unique Version Index: `{ subjectId: 1, version: 1 }, { unique: true }`
- Compound Version Listing Index: `{ userId: 1, subjectId: 1, version: -1 }`
- Partial Unique Approved Index: `{ subjectId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'approved' } }` — structurally guarantees at the database storage engine layer that at most ONE approved syllabus version can exist per subject. Multi-document ACID transactions (`session.startTransaction()`) are strictly required on MongoDB replica sets/Atlas to atomically orchestrate superseding, approval, Topic reconciliation, and Subject metadata updates. Standalone MongoDB instances without replica sets return HTTP 503.

---

### 3.3 Topic
Represents a curriculum unit or module belonging to a Subject with an embedded knowledge state.

```javascript
{
  _id: ObjectId,
  subjectId: ObjectId,       // Ref: 'Subject', indexed, required
  userId: ObjectId,          // Ref: 'User', indexed, required (denormalized ownership)
  title: String,             // Trimmed, 1-160 chars, required
  normalizedTitle: String,   // Lowercase for unique index within subject
  description: String,       // Optional, max 1000 chars
  orderIndex: Number,        // Explicit sequential ordering (0, 1, 2...)
  status: String,            // 'not_started' | 'in_progress' | 'mastered' (default: 'not_started')
  isActiveInSyllabus: Boolean,// true = active curriculum topic; false = historical/retired topic (default: false)
  knowledgeState: {
    masteryScore: Number,    // 0 - 100 (default: 0)
    keyConcepts: [String],   // Canonical atomic concept tags
    summary: String,         // Canonical synthesized summary
    lastStudiedAt: Date      // Timestamp of last interaction
  },
  notesCount: Number,        // Future Phase 07 counter (default: 0)
  chatsCount: Number,        // Phase 04 counter (default: 0)
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes**:
- Sequential Order Index: `{ subjectId: 1, orderIndex: 1 }` — optimizes sequential topic list retrieval.
- Tenant & Relationship Index: `{ userId: 1, subjectId: 1 }` — supports fast user-scoped aggregation.
- Unique Compound Index: `{ subjectId: 1, normalizedTitle: 1 }, { unique: true }` — prevents duplicate topic titles within a single subject.
- Active Syllabus Index: `{ subjectId: 1, isActiveInSyllabus: 1, orderIndex: 1 }` — optimizes retrieval of active curriculum topics.

---

### 3.4 Chat
Represents an interactive conversation session optionally anchored to a Subject and Topic.

```javascript
{
  _id: ObjectId,
  userId: ObjectId,          // Ref: 'User', indexed, required
  subjectId: ObjectId,       // Ref: 'Subject', indexed, nullable
  topicId: ObjectId,         // Ref: 'Topic', indexed, nullable
  title: String,             // Trimmed, max 200 chars (default: 'New Conversation')
  status: String,            // 'active' | 'archived' (default: 'active')
  messagesCount: Number,     // Cached counter of child messages (default: 0)
  sequenceCounter: Number,   // Atomic sequence reservation allocator (default: 0)
  lastMessageAt: Date,       // Timestamp of most recent message (default: Date.now)
  metadata: Object,          // Extensible key-value metadata (default: {})
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes**:
- Compound Active Listing Index: `{ userId: 1, status: 1, lastMessageAt: -1 }` — fast retrieval of user's active/archived chats.
- Topic-Scoped Query Index: `{ userId: 1, topicId: 1, lastMessageAt: -1 }` — fast topic-scoped chat retrieval.
- Subject-Scoped Query Index: `{ userId: 1, subjectId: 1, lastMessageAt: -1 }` — fast subject-scoped chat retrieval.

---

### 3.5 Message
Represents an immutable conversational turn within a Chat session.

```javascript
{
  _id: ObjectId,
  chatId: ObjectId,          // Ref: 'Chat', indexed, required
  userId: ObjectId,          // Ref: 'User', indexed, required (denormalized ownership)
  role: String,              // 'user' | 'assistant' | 'system', required
  content: String,           // Trimmed, 1-20,000 chars, required
  sequenceIndex: Number,     // 0-indexed sequential position counter, required
  status: String,            // 'sent' | 'delivered' | 'error' (default: 'sent')
  metadata: Object,          // Extensible metadata for tokens, model, citations
  knowledgeContext: {
    relevance: String,       // 'unclassified' | 'on_topic' | 'off_topic' | 'uncertain' (default: 'unclassified')
    subjectId: ObjectId,     // Ref: 'Subject', nullable
    topicId: ObjectId,       // Ref: 'Topic', nullable
    disposition: String      // 'unclassified' | 'candidate' | 'excluded' | 'promoted' (default: 'unclassified')
  },
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes**:
- Unique Compound Sequence Index: `{ chatId: 1, sequenceIndex: 1 }, { unique: true }` — guarantees strict deterministic chronological ordering and prevents collisions.
- Tenant & Chat Query Index: `{ userId: 1, chatId: 1 }` — supports fast user-scoped aggregation and authorization.

---

### 3.6 Annotation
Represents user-created auxiliary metadata (comments and tags) attached to a chat message.

```javascript
{
  _id: ObjectId,
  userId: ObjectId,          // Ref: 'User', indexed, required
  chatId: ObjectId,          // Ref: 'Chat', indexed, required
  messageId: ObjectId,       // Ref: 'Message', indexed, required
  type: String,              // 'comment' | 'tag', required
  content: String,           // Trimmed, max 1000 chars, required
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes**:
- Message Annotation Index: `{ userId: 1, messageId: 1, createdAt: 1 }`
- Chat Annotation Index: `{ userId: 1, chatId: 1, createdAt: 1 }`

---

## 4. Core Domain Entities (Scheduled for Subsequent Phases)

- **LearningEvent** (`Phase 06`): Learning observations and concept interactions.
- **NoteDocument & NoteVersion** (`Phase 07`): Typed block notes and immutable snapshots.
- **Quiz & QuizAttempt** (`Phase 10`): Dynamic assessments and scored student responses.
- **ImportJob** (`Phase 11`): External conversation ingest tracking.

---

## 5. Invariants & Data Integrity Rules

1. **User Identity Invariant**: Every `AuthIdentity` and `UserSession` must resolve to an active, valid `User`.
2. **Deterministic Linking**: The compound unique index on `AuthIdentity(provider, providerSubject)` guarantees an external identity cannot be attached to multiple accounts.
3. **Session Nonce Invariant**: `sessionTokenHash` is unique. Collisions on 256-bit cryptographically random tokens have probability $\approx 2^{-256}$.
4. **Zero Stored Plaintext Credentials**: Plaintext OTP codes and raw session tokens are strictly barred from MongoDB storage.
5. **Concurrent Bootstrap & Transaction Evaluation**:
   User bootstrap and external identity linking are designed around idempotent unique constraints (`normalizedEmail: unique`, `provider + providerSubject: unique`). In the event of simultaneous authentication requests for the same identity or email, MongoDB rejects duplicate insertions with error code 11000. Application logic intercepts error code 11000 and resolves the concurrently created document rather than throwing a 500 error. Multi-document MongoDB transactions were deliberately evaluated and avoided for user bootstrap because standalone MongoDB environments (standard in developer workstations and isolated test runners) do not support transactions without an active replica set (`rs.initiate()`). Relying on atomic upserts (`findOneAndUpdate` with `upsert: true`) and code 11000 recovery guarantees race-free idempotency across standalone MongoDB, replica sets, and MongoDB Atlas.
6. **Topic Count Consistency & Cascade Management**:
   Subject `topicsCount` and Topic `chatsCount` are maintained through coordinated application-level updates without multi-document transactions when entities are created, reassigned, or deleted. Counts can also be reconciled from persisted child records upon single-entity retrieval. Cascading deletions are orchestrated at the application level (`Message.deleteMany` $\rightarrow$ `Chat.deleteMany` $\rightarrow$ `Topic.deleteMany` $\rightarrow$ `Subject.deleteOne`), avoiding multi-document transaction dependencies while preserving cross-tenant data safety.
7. **Atomic Sequence Allocation & Unique Constraints**:
   Message ordering relies on `Chat.sequenceCounter` incremented atomically on the Chat document via `$inc`. Individual message documents enforce the unique compound constraint `{ chatId: 1, sequenceIndex: 1 }`. If a sequence index collision occurs due to legacy drift, an application retry loop reconciles the counter and safely retries without duplicating user message records.
8. **Syllabus Immutability, Single Active Approved Invariant & End-to-End Atomic Approval**:
   Approved syllabus versions in `SyllabusVersion` are immutable historical records. Creating or editing draft syllabi never mutates canonical `Topic` records. A schema-level Partial Unique Index (`{ subjectId: 1, status: 1 }` with `partialFilterExpression: { status: 'approved' }`) structurally guarantees that at most ONE approved syllabus version can exist per Subject at any time. When a version is explicitly approved (`POST /api/v1/subjects/:subjectId/syllabus/versions/:versionId/approve`), end-to-end atomicity is achieved through MongoDB multi-document ACID transactions (on replica sets / Atlas) combined with pre- and post-reconciliation CAS guards across all environments. Prior approved versions are transitioned to `superseded`, competing concurrent approvals are safely serialized/retried on unique constraint or write conflict errors, and canonical topics are reconciled:
   - Topics present in the approved syllabus become `isActiveInSyllabus: true` with stable `Topic._id`, preserved descriptions, and preserved learning data (`knowledgeState`, `notesCount`, `chatsCount`).
   - Topics omitted from the newly approved syllabus become `isActiveInSyllabus: false` (historical/retired) without deleting records or losing past learning evidence.
   - Topics re-added in later versions reactivate with `isActiveInSyllabus: true` and retain their historical data.
   - `Subject.topicsCount` strictly equals the count of active syllabus topics (`isActiveInSyllabus: true`). Before syllabus approval, manually created topics have `isActiveInSyllabus: false` and `Subject.topicsCount` is 0.
   - If a concurrent approval request supersedes an in-flight approval, CAS guards detect staleness and re-sync canonical topics to the true winning approved version, preventing stale mutator state corruption.
9. **Auxiliary Annotations vs Canonical Knowledge**:
   User comments and tags stored in `Annotation` are auxiliary metadata attached to raw conversational evidence. They are strictly segregated from `Topic.knowledgeState` and future canonical notes.
