# API Design

## 1. API Principles

- REST-style resource-oriented endpoints initially.
- JSON request/response unless a binary upload/download requires another content type.
- Consistent error format.
- Authentication enforced server-side.
- Authorization based on ownership and permissions.
- Pagination for potentially large collections.
- Idempotency where retries could create duplicates.
- Version the API when breaking changes become necessary.

## 2. Base Structure

Suggested base path:

`/api/v1`

The exact public deployment path may differ, but the application should keep a version boundary in the backend.

## 3. Authentication Endpoints

Example resources:

- `POST /auth/otp/request`
- `POST /auth/otp/verify`
- `POST /auth/google/start` or provider-specific flow
- `GET /auth/me`
- `POST /auth/logout`
- `POST /auth/logout-all`

The exact Google authentication flow must match the selected production auth mechanism.

## 4. Subject Endpoints

- `GET /subjects`
- `POST /subjects`
- `GET /subjects/:subjectId`
- `PATCH /subjects/:subjectId`
- `DELETE /subjects/:subjectId`
- `GET /subjects/:subjectId/topics`

## 5. Topic / Knowledge Endpoints

- `POST /subjects/:subjectId/topics`
- `PATCH /topics/:topicId`
- `DELETE /topics/:topicId`
- `GET /subjects/:subjectId/knowledge`
- `GET /concepts/:conceptId`
- `GET /subjects/:subjectId/progress`

## 6. Chat Endpoints

- `GET /chats`
- `POST /chats`
- `GET /chats/:chatId`
- `PATCH /chats/:chatId`
- `DELETE /chats/:chatId`
- `GET /chats/:chatId/messages`
- `POST /chats/:chatId/messages`

Streaming may be used for assistant output, but the final message must still be persisted as a canonical message record.

## 7. Study Mode Endpoints

- `POST /study-sessions`
- `GET /study-sessions/:id`
- `POST /study-sessions/:id/respond`
- `POST /study-sessions/:id/finish`

Study Mode may reuse chat infrastructure but must maintain explicit session metadata and learning-state outcomes.

## 8. Notes Endpoints

- `GET /subjects/:subjectId/notes`
- `GET /notes/:noteId`
- `PATCH /notes/:noteId`
- `POST /notes/:noteId/changes/preview`
- `POST /notes/:noteId/changes/:changeId/approve`
- `POST /notes/:noteId/changes/:changeId/reject`
- `POST /notes/:noteId/revert`
- `GET /notes/:noteId/versions`
- `GET /notes/:noteId/export/pdf`

## 9. Quiz Endpoints

- `POST /quizzes/generate`
- `GET /quizzes`
- `GET /quizzes/:quizId`
- `POST /quizzes/:quizId/start`
- `POST /quizzes/:quizId/submit`
- `GET /quiz-attempts/:attemptId`

## 10. Import Endpoints

- `POST /imports`
- `GET /imports/:importId`
- `POST /imports/:importId/analyze`
- `GET /imports/:importId/merge-preview`
- `POST /imports/:importId/merge`
- `POST /imports/:importId/create-chat`
- `POST /imports/:importId/create-subject`

## 11. Profile / Progress Endpoints

- `GET /profile`
- `PATCH /profile`
- `GET /profile/progress`
- `GET /profile/activity`
- `GET /subjects/:subjectId/progress`

## 12. Error Contract

Use a consistent shape such as:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields are invalid.",
    "details": []
  },
  "requestId": "..."
}
```

Never leak provider keys, stack traces, database details, or sensitive internals to clients.

## 13. Success Contract

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Metadata is optional and may include pagination or request context.

## 14. Pagination

Use cursor-based pagination for high-growth collections such as messages and activity once needed. Offset pagination can be used for small collections initially when it simplifies the UI.

## 15. Authorization

Every resource lookup must be checked against the authenticated user. Never rely on frontend subject/chat IDs as proof of ownership.

## 16. Rate Limits

Rate-limit at minimum:

- OTP requests;
- OTP verification attempts;
- authentication endpoints;
- AI generation endpoints;
- import endpoints;
- PDF generation if expensive.

## 17. Idempotency

Where duplicate retries are harmful, support idempotency keys or unique request identifiers.

## 18. API Documentation

Once implementation starts, the project should maintain an OpenAPI specification or equivalent machine-readable API contract for stable endpoints.
