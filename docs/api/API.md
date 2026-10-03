# LearnForge — API Design & Contract Specification

## 1. API Principles

- REST-style resource-oriented endpoints mounted under versioned base path `/api/v1`.
- JSON request and response payloads with standardized envelopes.
- Server-side cryptographic authentication and ownership-based authorization.
- Correlation IDs (`X-Request-Id`) returned on every response.
- Tiered rate limiting on authentication and resource-intensive endpoints.
- Secure HTTP-only cookies for web sessions with `Authorization: Bearer <token>` support for mobile clients.

---

## 2. Standard Response Envelopes

### Success Envelope
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### Error Envelope
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable explanation of error.",
    "details": []
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## 3. Implemented Authentication Endpoints (Phase 01)

### 3.1 Request Email OTP
- **Endpoint**: `POST /api/v1/auth/otp/request`
- **Rate Limit**: Max 5 requests per 15 min per IP; 60s per-email cooldown
- **Request Body**:
  ```json
  {
    "email": "student@learnforge.io"
  }
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": {
      "message": "If the provided email address is valid, a verification code has been dispatched.",
      "cooldownSeconds": 60,
      "expiresInMinutes": 10
    },
    "meta": { "requestId": "..." }
  }
  ```
- **Error Codes**: `VALIDATION_ERROR` (400), `OTP_RATE_LIMITED` (429), `SERVICE_UNAVAILABLE` (503).

---

### 3.2 Verify Email OTP
- **Endpoint**: `POST /api/v1/auth/otp/verify`
- **Rate Limit**: Max 10 attempts per 15 min per IP; Max 5 attempts per OTP code
- **Request Body**:
  ```json
  {
    "email": "student@learnforge.io",
    "code": "849201"
  }
  ```
- **Response (`200 OK`)**:
  - Sets HTTP-Only Cookie: `learnforge_session=<raw_session_token>`
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "67041a9f9...",
        "email": "student@learnforge.io",
        "displayName": "student",
        "avatarUrl": null,
        "status": "active",
        "timezone": "UTC"
      },
      "sessionToken": "a9f8b2c4e..."
    },
    "meta": { "requestId": "..." }
  }
  ```
- **Error Codes**: `VALIDATION_ERROR` (400), `INVALID_OTP` (400), `OTP_EXPIRED` (400), `MAX_ATTEMPTS_EXCEEDED` (429).

---

### 3.3 Google OAuth Sign-In (OpenID Connect)
- **Endpoint**: `POST /api/v1/auth/google`
- **Rate Limit**: Max 15 attempts per 15 min per IP
- **Request Body**:
  ```json
  {
    "idToken": "eyJhbGciOiJSUzI1NiIs..."
  }
  ```
- **Response (`200 OK`)**:
  - Sets HTTP-Only Cookie: `learnforge_session=<raw_session_token>`
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "67041a9f9...",
        "email": "student@gmail.com",
        "displayName": "Student Name",
        "avatarUrl": "https://lh3.googleusercontent.com/...",
        "status": "active"
      },
      "sessionToken": "b4e8c1a7d..."
    },
    "meta": { "requestId": "..." }
  }
  ```
- **Error Codes**: `VALIDATION_ERROR` (400), `INVALID_TOKEN` (401), `AUTH_PROVIDER_ERROR` (403).

---

### 3.4 Get Current User Profile & Session
- **Endpoint**: `GET /api/v1/auth/me`
- **Authorization**: Required (`Cookie: learnforge_session=...` or `Authorization: Bearer <token>`)
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "67041a9f9...",
        "email": "student@learnforge.io",
        "displayName": "student",
        "avatarUrl": null,
        "status": "active",
        "timezone": "UTC",
        "preferences": {
          "theme": "light",
          "density": "normal",
          "studyStrictness": "balanced",
          "defaultMode": "chat"
        },
        "createdAt": "2026-10-03T16:00:00.000Z"
      },
      "session": {
        "id": "67041b12...",
        "authMethod": "otp",
        "expiresAt": "2026-11-02T16:00:00.000Z",
        "createdAt": "2026-10-03T16:00:00.000Z"
      }
    },
    "meta": { "requestId": "..." }
  }
  ```
- **Error Codes**: `AUTH_REQUIRED` (401), `SESSION_REVOKED` (401), `SESSION_EXPIRED` (401).

---

### 3.5 Logout Active Session
- **Endpoint**: `POST /api/v1/auth/logout`
- **Authorization**: Required
- **Response (`200 OK`)**:
  - Clears `learnforge_session` cookie
  ```json
  {
    "success": true,
    "data": {
      "message": "Logged out successfully."
    },
    "meta": { "requestId": "..." }
  }
  ```

---

### 3.6 Logout All Devices
- **Endpoint**: `POST /api/v1/auth/logout-all`
- **Authorization**: Required
- **Response (`200 OK`)**:
  - Sets `revokedAt` on all active sessions for current user; clears cookie
  ```json
  {
    "success": true,
    "data": {
      "message": "All active sessions across all devices have been revoked."
    },
    "meta": { "requestId": "..." }
  }
  ```

---

## 4. Planned Endpoints (Scheduled for Later Phases)

### 4.1 System & Health (Phase 00 - Implemented)
- `GET /api/v1/health` — System uptime, status, and database connectivity.

### 4.2 Subjects & Topics (Phase 03 - Planned)
- `GET /api/v1/subjects`
- `POST /api/v1/subjects`
- `GET /api/v1/subjects/:subjectId/topics`
- `POST /api/v1/subjects/:subjectId/topics`

### 4.3 Conversations & Messages (Phase 04 - Planned)
- `GET /api/v1/chats`
- `POST /api/v1/chats`
- `GET /api/v1/chats/:chatId/messages`
- `POST /api/v1/chats/:chatId/messages`

### 4.4 Structured Notes (Phase 07/12 - Planned)
- `GET /api/v1/subjects/:subjectId/notes`
- `GET /api/v1/notes/:noteId`
- `PATCH /api/v1/notes/:noteId`
- `GET /api/v1/notes/:noteId/versions`
- `GET /api/v1/notes/:noteId/export/pdf`

### 4.5 Quizzes (Phase 10 - Planned)
- `POST /api/v1/quizzes/generate`
- `POST /api/v1/quizzes/:quizId/submit`

### 4.6 Imports (Phase 11 - Planned)
- `POST /api/v1/imports`
- `GET /api/v1/imports/:importId/merge-preview`
