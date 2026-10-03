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

## 3. Implemented Auth Domain Architecture (Phase 01)

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
             │               │
             └───────┬───────┘
                     ▼
           Issue Opaque Session
        (Set Cookie & Return Token)
```

---

## 5. Domain Boundaries

- **Auth Domain (Phase 01 - Implemented)**: User identity, AuthIdentity linking, UserSession tracking, OTP generation/hashing, and session revocation.
- **Study Domain (Phase 03 - Planned)**: Subjects, topics, concepts, and study sessions.
- **Conversation Domain (Phase 04 - Planned)**: Chats, messages, and streaming response delivery.
- **AI Domain (Phase 05 - Planned)**: AI Gateway, task classification, and provider adapters.
- **Knowledge Domain (Phase 06 - Planned)**: Concept extraction, confidence tracking, and misconception detection.
- **Notes Domain (Phase 07 - Planned)**: Structured block notes, versioning, and diff proposals.
- **Assessment Domain (Phase 10 - Planned)**: Quiz generation, attempts, and scoring.
- **Import Domain (Phase 11 - Planned)**: External conversation parsing and knowledge merge.
