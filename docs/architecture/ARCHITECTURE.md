# LearnForge — System Architecture

## 1. Architectural Goals

- Reliable, passwordless dual-identity authentication with Google OAuth and Email OTP.
- Strict subject-centric knowledge organization.
- Real-time pedagogical dialogue via AI teacher mode.
- Provider-agnostic AI Gateway with automated model routing.
- Safe structured note generation with immutable version histories.
- Continuous assessment and quiz feedback loops.
- API-first architecture ensuring identical backend consumption for present web and future mobile clients.

---

## 2. Layered Architecture

```text
Browser Web App / Future Mobile Client
             │
             ▼
     API & Gateway Layer (/api/v1)
 (CORS, Rate Limiting, X-Request-ID, Cookie/Bearer Auth)
             │
   ┌─────────┼──────────┬──────────────┐
   ▼         ▼          ▼              ▼
 Auth      Chat       Notes       Progress/Quiz
 Domain   Domain     Domain          Domain
   │         │          │              │
   └─────────┼──────────┴──────────────┘
             ▼
      Domain Services
   ┌─────────┼──────────┬──────────────┐
   ▼         ▼          ▼              ▼
Knowledge  Study     Import           AI
 Engine    Engine    Engine         Gateway
   │         │          │              │
   └─────────┼──────────┴──────────────┘
             ▼
      Persistence Layer
  (MongoDB / Object Storage)
```

---

## 3. Implemented Auth Domain Architecture (Phase 01 & 01.1)

```text
Incoming Request
       │
       ▼
Extract Credential
  ├── 1. Cookie: req.cookies.learnforge_session (Primary for Web)
  └── 2. Header: Authorization: Bearer <token> (Mobile / API)
       │
       ▼
Hash Token with SHA-256
       │
       ▼
Query UserSession (sessionTokenHash, revokedAt == null, expiresAt > now)
       │
  ┌────┴──────────────────────────┐
  ▼                               ▼
Valid Session               Invalid / Expired / Revoked
  │                               │
Resolve User                      Return 401 (AUTH_REQUIRED / SESSION_REVOKED)
  │
Attach req.user, req.session, req.auth
  │
Execute Protected Controller
```

---

## 4. Account Linking Architecture (ADR-010)

```text
Google OIDC Token Received
             │
             ▼
Cryptographically Verify Claims (aud, iss, exp, email_verified)
             │
             ▼
Lookup AuthIdentity (provider: 'google', providerSubject: sub)
             │
     ┌───────┴───────┐
     ▼               ▼
Found Identity    Not Found
     │               │
Resolve User   Check User.findOne({ normalizedEmail: verifiedEmail })
                     │
             ┌───────┴───────┐
             ▼               ▼
        User Exists     User Does Not Exist
             │               │
        Link Identity   Create User & Link Identity
             │          (Harden vs Code 11000 Races)
             └───────┬───────┘
                     ▼
           Issue Opaque Session
  (Set Secure HttpOnly Cookie; Return User/Session Metadata)
  *Note: Raw token is NEVER returned in JSON response to browser*
```

### 4.1 Future Mobile Bearer Path
Future mobile applications will authenticate through a dedicated mobile authentication flow (such as a dedicated mobile token-issuance endpoint or OAuth PKCE flow) that delivers the bearer token directly to the mobile device for secure storage in hardware keystores (iOS Keychain / Android Keystore). The centralized `authenticateUser` middleware is already architected to resolve `Authorization: Bearer <token>` without any code changes.

---

---

## 5. UI Shell & Design System Architecture (Phase 02)

```text
                     App Root (<App />)
                             │
     ┌───────────────────────┴───────────────────────┐
     ▼                                               ▼
ThemeProvider (light/dark)               AuthProvider (session hydrate)
     │                                               │
     └───────────────────────┬───────────────────────┘
                             ▼
                    AppRoutes & Shell
     ┌───────────────────────┴───────────────────────┐
     ▼                                               ▼
TopBar Header (Context/Theme/UserNav)     Sidebar Navigation (Desktop / Drawer)
     │                                               │
     └───────────────────────┬───────────────────────┘
                             ▼
                   Workspace Main Area
       (Route Placeholders, Empty States, Protected Views)
```

### 5.1 Presentation Strategy
- **Restrained Tokens**: CSS custom properties for neutral surfaces, crisp borders, and subtle elevation.
- **Micro-Primitives**: Low-dependency atomic components (`Button`, `Input`, `Dialog`, `Dropdown`, `EmptyState`, `Skeleton`, `Icon`).
- **Session Continuity**: Auth status hydrated on boot via `/api/v1/auth/me`; no client-side token caching.

### 5.2 Protected Route Hierarchy & Boundaries (Phase 02.1)
- **Protected Layout Wrapper**: All user-specific workspace routes (`/subjects`, `/chats`, `/notes`, `/study`, `/quizzes`, `/progress`, `/import`, `/profile` and nested parameter routes like `/subjects/:subjectId`) are grouped under a unified `<ProtectedRoute />` layout. Unauthenticated access displays an accessible sign-in prompt without layout flicker.
- **Public Accessibility of `/settings`**: The `/settings` route is intentionally public so users can configure appearance (dark mode) and inspect keyboard shortcuts before signing in.
- **Authoritative Boundary Note**: Frontend route protection provides responsive user guidance; the backend API (`server/src/middleware/auth.js`) remains the absolute, authoritative authentication and authorization boundary for all data access.

---

## 6. Knowledge Hierarchy & Topic Domain Architecture (Phase 03)

```text
[User Session (req.user._id)]
            │
            ▼
 ┌──────────────────────┐
 │     Subject Model    │ <─── Unique Index: { userId, normalizedName }
 │  (name, color,       │
 │   targetMasteryLevel,│
 │   topicsCount)       │
 └──────────┬───────────┘
            │ 1:N Relationship
            ▼
 ┌──────────────────────┐
 │      Topic Model     │ <─── Unique Index: { subjectId, normalizedTitle }
 │ (subjectId, userId,  │ <─── Compound Index: { subjectId, orderIndex }
 │  title, orderIndex,  │
 │  status)             │
 └──────────┬───────────┘
            │ Embedded Subdocument
            ▼
 ┌───────────────────────────────────────┐
 │       knowledgeState Subdocument      │
 │  (masteryScore: 0-100,                │
 │   keyConcepts: [String],              │
 │   summary: String,                    │
 │   lastStudiedAt: Date)                │
 └───────────────────────────────────────┘
```

### 6.1 Strict Multi-Tenant Isolation Strategy
- All reads and mutations query `userId: req.user._id` directly:
  - `Subject.findOne({ _id: subjectId, userId: req.user._id })`
  - `Topic.findOne({ _id: topicId, userId: req.user._id })`
  - `Chat.findOne({ _id: chatId, userId: req.user._id })`
  - `Message.find({ chatId, userId: req.user._id })`
- Denormalizing `userId` on `Topic`, `Chat`, and `Message` models enables O(1) indexed authorization without relational `$lookup` joins.
- Cross-tenant requests return `404 Not Found` rather than `403 Forbidden` to prevent resource ID enumeration attacks.

### 6.2 Cascade Lifecycle & Counter Management
- When a `Subject` is deleted, all associated `Topic`, `Chat`, `Message`, `SyllabusVersion`, and `Annotation` records are purged.
- When a `Topic` is deleted, all associated `Chat`, `Message`, and `Annotation` records are purged.
- When a `Chat` is deleted, all child `Message` and `Annotation` records are purged.
- **Subject `topicsCount` Contract**: Strictly defined as the count of active syllabus topics (`isActiveInSyllabus: true`). Inactive/historical topics remain persisted for history/evidence preservation but are excluded from `topicsCount`. Counts are maintained through coordinated application-level updates and reconciled on read lookups (`Topic.countDocuments({ subjectId, userId, isActiveInSyllabus: true })`).

### 6.3 Syllabus Lifecycle & Topic History Governance (Phase 04.1)
- Subjects start in `no_syllabus` state and do NOT require an approved syllabus for creation or topic management.
- Draft syllabi are created with hierarchical sections and topics (`SyllabusVersion`, status: `draft`).
- Multiple drafts can be edited safely; explicit user approval (`POST /api/v1/subjects/:id/syllabus/versions/:version/approve`) commits canonical topics into the `Topic` collection.
- **Topic Reconciliation & History Preservation**:
  1. Matching topics remain active (`isActiveInSyllabus: true`) with stable `_id` and preserved learning history (`knowledgeState`, `chatsCount`, `notesCount`).
  2. Newly introduced topics are created with `isActiveInSyllabus: true`.
  3. Topics removed in the new syllabus version are preserved with `isActiveInSyllabus: false` (historical/retired) — no data or chat history is destroyed.
  4. Topics re-added in subsequent versions are reactivated (`isActiveInSyllabus: true`) with their existing `_id` and cumulative learning state preserved.
- Prior approved versions transition to `superseded` status, maintaining exactly one active approved version per subject.

### 6.4 Knowledge Semantic Layers & Annotation Subsystem (Phase 04.1)
- LearnForge enforces strict distinction across 7 semantic layers:
  1. Raw conversation evidence (`Message`, `Chat`)
  2. Draft syllabus (`SyllabusVersion`, status: `draft`)
  3. Approved canonical syllabus (`SyllabusVersion`, status: `approved`)
  4. Topic-related knowledge candidates
  5. Canonical topic knowledge (`Topic.knowledgeState`)
  6. Off-topic conversation (`Message.knowledgeContext.relevance: 'off_topic'`)
  7. User-created comments/tags (`Annotation`)
- `Annotation` model allows users to attach subjective commentary and semantic tags to messages and chats without polluting authoritative conversation evidence or canonical topic knowledge.

---

## 7. Domain Boundaries

- **Auth Domain (Phase 01 & 01.1 - Implemented)**: User identity, AuthIdentity linking, UserSession tracking, OTP generation/hashing, and session revocation.
- **UI Shell Domain (Phase 02 & 02.1 - Implemented)**: Professional application shell, navigation, design tokens, route boundaries, and reusable primitives.
- **Knowledge Hierarchy Domain (Phase 03 - Implemented)**: Subjects, topics, sequential ordering, and embedded knowledge state foundation.
- **Conversation Domain (Phase 04 - Implemented)**: Chat sessions, chronological message sequencing (`sequenceIndex`), topic/subject context linking, and responsive two-pane workspace.
- **Syllabus & Knowledge Governance Domain (Phase 04.1 - Implemented)**: Multi-version syllabus lifecycle, draft reconciliation, topic ID stability, off-topic data contract, and user annotations.
- **AI Domain (Phase 05 - Planned)**: AI Gateway, task classification, and provider adapters (Gemini, OpenAI, Anthropic).
- **Knowledge Extraction Domain (Phase 06 - Planned)**: Concept extraction, confidence tracking, and misconception detection.
- **Notes Domain (Phase 07 - Planned)**: Structured block notes, versioning, and diff proposals.
- **Study Mode Domain (Phase 08 - Planned)**: Socratic teacher logic, session objectives, and mastery pacing.
- **Assessment Domain (Phase 10 - Planned)**: Quiz generation, attempts, and scoring.
- **Import Domain (Phase 11 - Planned)**: External conversation parsing and knowledge merge.

