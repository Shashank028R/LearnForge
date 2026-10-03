# Database Design

## 1. Principles

- Keep ownership explicit.
- Prefer references for high-growth or cross-cutting collections.
- Embed small immutable metadata where it improves read locality.
- Keep user-authored content distinguishable from AI-derived content.
- Use timestamps consistently.
- Add indexes based on actual access patterns.
- Use transactions for multi-collection changes where atomicity matters.

## 2. Core Entities

### User

Purpose: account-level identity and profile.

Suggested fields:

- `_id`
- `email`
- `displayName`
- `avatarUrl`
- `status`
- `timezone`
- `onboardingState`
- `createdAt`
- `updatedAt`
- `lastActiveAt`

Constraints:
- email normalized and unique where applicable;
- never store provider secrets.

### AuthIdentity

Represents an external identity such as Google.

Fields:
- `_id`
- `userId`
- `provider`
- `providerSubject`
- `emailAtProvider`
- `createdAt`
- `updatedAt`

Unique index: `(provider, providerSubject)`.

### UserSession

Fields:
- `_id`
- `userId`
- `sessionTokenHash` or equivalent secure session reference
- `deviceInfo`
- `ipMetadata` only where legally/operationally justified
- `expiresAt`
- `revokedAt`
- `createdAt`

### Subject

Fields:
- `_id`
- `userId`
- `name`
- `slug`
- `description`
- `status`
- `colorToken` (semantic token, not hard-coded design color)
- `createdAt`
- `updatedAt`

Unique per user: `(userId, slug)`.

### Topic

Fields:
- `_id`
- `subjectId`
- `parentTopicId`
- `name`
- `slug`
- `description`
- `order`
- `status`
- `createdAt`
- `updatedAt`

Hierarchy can be represented with `parentTopicId` to avoid hard-coded depth.

### Concept

A learning concept within a topic.

Fields:
- `_id`
- `subjectId`
- `topicId`
- `canonicalName`
- `summary`
- `aliases`
- `status`
- `createdAt`
- `updatedAt`

Canonical identity must be stable enough for deduplication.

### Chat

Fields:
- `_id`
- `userId`
- `subjectId` nullable
- `title`
- `mode` (`chat`, `study`)
- `source` (`native`, `imported`)
- `archivedAt`
- `createdAt`
- `updatedAt`
- `lastMessageAt`

### Message

Fields:
- `_id`
- `chatId`
- `role` (`user`, `assistant`, `system`)
- `content`
- `parts` for structured content when needed
- `providerMetadata` sanitized
- `tokenUsage` where available
- `sequence`
- `createdAt`

Index: `(chatId, sequence)`.

### LearningEvent

Represents a meaningful learning interaction.

Fields:
- `_id`
- `userId`
- `subjectId`
- `topicId`
- `chatId` nullable
- `messageId` nullable
- `eventType`
- `payload`
- `source`
- `confidence`
- `createdAt`

Event types may include:
- concept_introduced;
- concept_explained;
- user_explained;
- answer_evaluated;
- misconception_detected;
- example_added;
- correction_recorded;
- quiz_result;
- imported_knowledge.

### KnowledgeState

Fields:
- `_id`
- `userId`
- `conceptId`
- `state`
- `confidenceScore`
- `evidenceCount`
- `lastAssessedAt`
- `lastStudiedAt`
- `nextReviewAt` nullable
- `weakAreas`
- `strengths`
- `version`
- `updatedAt`

Unique index: `(userId, conceptId)`.

### NoteDocument

Represents the logical note page/document.

Fields:
- `_id`
- `userId`
- `subjectId`
- `topicId`
- `title`
- `summary`
- `currentVersionId`
- `status`
- `createdAt`
- `updatedAt`

### NoteVersion

Immutable snapshot of a note document.

Fields:
- `_id`
- `noteDocumentId`
- `versionNumber`
- `blocks`
- `createdByType` (`user`, `ai`, `system`, `import`)
- `sourceReferences`
- `changeSummary`
- `createdAt`

Unique index: `(noteDocumentId, versionNumber)`.

### NoteChange

Represents an explainable change proposal or applied change.

Fields:
- `_id`
- `noteDocumentId`
- `baseVersionId`
- `proposedVersionId`
- `status` (`proposed`, `approved`, `rejected`, `applied`, `reverted`)
- `changeSummary`
- `diffMetadata`
- `sourceLearningEventIds`
- `createdAt`
- `resolvedAt`

### Quiz

Fields:
- `_id`
- `userId`
- `subjectId`
- `topicIds`
- `mode` (`manual`, `adaptive`, `review`)
- `difficulty`
- `questionCount`
- `status`
- `createdAt`

### QuizQuestion

Fields:
- `_id`
- `quizId`
- `conceptId`
- `questionType`
- `prompt`
- `options` nullable
- `expectedAnswer`
- `explanation`
- `difficulty`
- `sequence`

### QuizAttempt

Fields:
- `_id`
- `quizId`
- `userId`
- `startedAt`
- `completedAt`
- `score`
- `summary`

### QuizAnswer

Fields:
- `_id`
- `attemptId`
- `questionId`
- `userAnswer`
- `isCorrect`
- `evaluation`
- `conceptImpact`
- `createdAt`

### ImportedConversation

Fields:
- `_id`
- `userId`
- `sourceType`
- `originalFileAssetId` nullable
- `rawContentReference`
- `normalizedConversation`
- `detectedSubjectId` nullable
- `status`
- `createdAt`
- `updatedAt`

Do not store unbounded raw payloads in a single MongoDB document if they risk document-size limits. Large content should use object storage.

### ImportJob

Fields:
- `_id`
- `userId`
- `importedConversationId`
- `status`
- `progress`
- `errorCode`
- `startedAt`
- `completedAt`

### FileAsset

Fields:
- `_id`
- `userId`
- `storageProvider`
- `storageKey`
- `mimeType`
- `size`
- `checksum`
- `purpose`
- `createdAt`

### AIRequestLog

Fields:
- `_id`
- `userId` nullable
- `taskType`
- `provider`
- `model`
- `latencyMs`
- `inputTokens` nullable
- `outputTokens` nullable
- `success`
- `errorCode` nullable
- `createdAt`

Avoid persisting raw sensitive prompts/responses unless necessary for product functionality and explicitly protected.

### UserPreference

Fields:
- `_id`
- `userId`
- `theme`
- `density`
- `defaultMode`
- `studyStrictness`
- `defaultSubjectId` nullable
- `createdAt`
- `updatedAt`

## 3. Relationship Summary

```text
User
 ├── AuthIdentity
 ├── UserSession
 ├── Subject
 │    └── Topic
 │         └── Concept
 ├── Chat
 │    └── Message
 ├── LearningEvent
 ├── KnowledgeState -> Concept
 ├── NoteDocument
 │    └── NoteVersion
 ├── NoteChange
 ├── Quiz
 │    ├── QuizQuestion -> Concept
 │    └── QuizAttempt
 │         └── QuizAnswer
 ├── ImportedConversation
 ├── ImportJob
 ├── FileAsset
 ├── AIRequestLog
 └── UserPreference
```

## 4. Progress Calculation

Progress should be derived from concept/topic knowledge states, not stored as a single manually updated percentage.

A deterministic first implementation can map state to weighted points. The exact formula must be documented and tested before being used in production UI.

## 5. Invariants

- Every user-owned record must be authorized through the owning user or an auditable ownership path.
- A knowledge state must not exist without a valid concept.
- A note version must point to a valid note document.
- A note change must reference its base version.
- A quiz answer must belong to the correct attempt and question.
- Import jobs must not mutate unrelated subjects.

## 6. Indexing Strategy

Initial indexes should target common queries:

- user-owned collections by `userId`;
- subject topics by `(subjectId, order)`;
- chats by `(userId, updatedAt)`;
- messages by `(chatId, sequence)`;
- concepts by subject/topic;
- knowledge states by `(userId, conceptId)`;
- notes by `(userId, subjectId, topicId)`;
- quiz history by `(userId, createdAt)`.

Do not add speculative indexes without measuring access patterns.
