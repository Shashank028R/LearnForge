# System Architecture

## 1. Architectural Goals

The architecture must support:

- reliable authentication;
- subject-centric study organization;
- real-time-feeling chat UX;
- multiple AI providers and model routing;
- automatic knowledge extraction;
- safe note updates with version history;
- strict teacher behavior;
- quizzes based on actual covered material;
- imports from external AI conversations;
- PDF export;
- future web/mobile clients using the same backend;
- strong security and observability;
- clear explainability for interviews.

## 2. Layered Architecture

```text
Browser / Future Mobile Client
            |
            v
       API / Web Layer
            |
  +---------+----------+----------------+
  |         |          |                |
 Auth     Chat       Notes         Progress/Quiz
  |         |          |                |
  +---------+----------+----------------+
            |
            v
       Domain Services
            |
  +---------+----------+-------------------+
  |         |          |                   |
Knowledge  Study     Import              AI
 Engine    Engine     Engine            Gateway
  |         |          |                   |
  +---------+----------+-------------------+
            |
            v
        Persistence
     MongoDB / Storage
```

## 3. Frontend Responsibilities

The frontend is responsible for:

- rendering pages and components;
- handling local UI state;
- optimistic interaction where safe;
- streaming chat display if supported;
- note editing UI;
- quiz UI;
- progress visualizations;
- client-side validation for UX only;
- displaying server-side errors clearly.

The frontend must not own business-critical learning logic.

## 4. Backend Responsibilities

The backend is responsible for:

- authentication and authorization;
- business rules;
- database access;
- AI provider credentials;
- knowledge extraction orchestration;
- note update policies;
- quiz generation/evaluation orchestration;
- import processing;
- rate limiting;
- audit/observability;
- future mobile API compatibility.

## 5. Domain Boundaries

### Auth Domain

Identity, verification, sessions, OAuth links, logout, account recovery, authorization.

### Study Domain

Subjects, topics, concepts, learning events, knowledge states, study sessions.

### Conversation Domain

Chats, messages, message metadata, chat organization, chat-to-subject relationships.

### Knowledge Domain

Concept extraction, deduplication, confidence, learning-state transitions, conflict detection.

### Notes Domain

Structured note blocks, revisions, user edits, AI change proposals, history, exports.

### Assessment Domain

Quiz creation, attempts, question evaluation, scoring, concept-level outcomes.

### Import Domain

Parsing, normalization, source attribution, classification, merge analysis, import review.

### AI Domain

Task classification, model selection, provider adapters, prompt policies, fallbacks, quotas, telemetry.

## 6. Event-Oriented Internal Flow

A message should not directly rewrite notes inside a controller.

Preferred flow:

```text
Message Created
      |
      v
Conversation Service
      |
      v
Learning Analysis Job
      |
      +--> detect concepts
      +--> detect questions/answers
      +--> identify topic
      +--> detect misconceptions
      +--> compare existing knowledge
      |
      v
Knowledge Engine
      |
      +--> knowledge state update
      +--> note update proposal
      +--> quiz/review signal
      |
      v
Persist + Notify
```

This separation improves testability and makes future asynchronous/background processing easier.

## 7. Synchronous vs Asynchronous Work

Synchronous:
- authentication response;
- normal CRUD;
- chat request setup;
- reading notes;
- starting a quiz.

Asynchronous/background-capable:
- deep conversation analysis;
- large import processing;
- note merge calculations;
- PDF generation for large documents;
- analytics aggregation;
- expensive AI enrichment.

The initial implementation may execute some jobs inline when practical, but service boundaries should allow migration to a job queue later.

## 8. API-First Mobile Readiness

The web app consumes backend APIs rather than private server shortcuts. Future mobile clients will use the same authentication, subject, chat, notes, knowledge, quiz, and progress APIs.

## 9. External System Boundary

```text
Application Code
      |
      v
Internal Adapter / Service
      |
      v
External Provider
```

External providers include:

- AI providers;
- Google identity;
- email delivery;
- object storage;
- optional PDF/diagram tooling.

Provider-specific SDK usage must remain isolated from core domain logic.

## 10. Failure Isolation

The application must avoid single points where one failed external service corrupts user data.

Examples:

- AI provider failure must not delete notes.
- Email provider failure must not create a half-verified account.
- PDF generation failure must not alter the source notes.
- Import parsing failure must preserve the original imported artifact when possible.

## 11. Data Ownership Principle

User-authored data and AI-derived data must be distinguishable.

Every note block or major change should be attributable to a source such as:

- user-created;
- user-edited;
- AI-created;
- AI-updated;
- imported;
- quiz-derived;
- system-generated.

## 12. Scalability Direction

First optimize for correctness and maintainability. Then introduce:

- caching;
- background queues;
- pagination;
- streaming;
- read models/aggregations;
- search indexes;
- horizontal scaling;
- provider routing/circuit breakers.

Do not pre-build infrastructure that the initial product does not need.
