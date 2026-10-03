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

## 3. Knowledge Hierarchy Entities (Phase 03 Implemented)

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
  topicsCount: Number,       // Cached counter of child topics maintained via coordinated application updates (default: 0)
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes**:
- Unique Compound Index: `{ userId: 1, normalizedName: 1 }, { unique: true }` — prevents duplicate subject names within a user's workspace.
- Dashboard Query Index: `{ userId: 1, status: 1, updatedAt: -1 }` — optimizes workspace filtering and chronological display.

---

### 3.2 Topic
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
  knowledgeState: {
    masteryScore: Number,    // 0 - 100 (default: 0)
    keyConcepts: [String],   // Canonical atomic concept tags
    summary: String,         // Canonical synthesized summary
    lastStudiedAt: Date      // Timestamp of last interaction
  },
  notesCount: Number,        // Future Phase 07 counter (default: 0)
  chatsCount: Number,        // Future Phase 04 counter (default: 0)
  createdAt: Date,
  updatedAt: Date
}
```
**Indexes**:
- Sequential Order Index: `{ subjectId: 1, orderIndex: 1 }` — optimizes sequential topic list retrieval.
- Tenant & Relationship Index: `{ userId: 1, subjectId: 1 }` — supports fast user-scoped aggregation.
- Unique Compound Index: `{ subjectId: 1, normalizedTitle: 1 }, { unique: true }` — prevents duplicate topic titles within a single subject.

---

## 4. Core Domain Entities (Scheduled for Subsequent Phases)

- **Chat** (`Phase 04`): Subject-scoped and general conversation sessions.
- **Message** (`Phase 04`): Ordered messages with sequence indexing.
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
   User bootstrap and external identity linking are designed around idempotent unique constraints (`normalizedEmail: unique`, `provider + providerSubject: unique`). In the event of simultaneous authentication requests for the same identity or email, MongoDB rejects duplicate insertions with error code 11000. Application logic intercepts error code 11000 and resolves the concurrently created document rather than throwing a 500 error. Multi-document MongoDB transactions were deliberately evaluated and avoided for user bootstrap because standalone MongoDB environments (standard in developer workstations and isolated test runners) do not support transactions without an active replica set (`rs.initiate()`). Relying on atomic upserts (`findOneAndUpdate` with `upsert: true`) and code 11000 recovery guarantees 100% race-free idempotency across standalone MongoDB, replica sets, and MongoDB Atlas.
6. **Topic Count Consistency & Cascade Management**:
   Subject `topicsCount` is maintained through coordinated application-level updates when topics are created or deleted. The count can also be reconciled from persisted Topic records upon single-subject retrieval. Similarly, cascading deletions are orchestrated at the application level (`Topic.deleteMany({ subjectId, userId })` followed by `Subject.deleteOne({ _id, userId })`), avoiding multi-document transaction dependencies while preserving cross-tenant data safety.
