# Technology Stack

## Frontend

### React

Purpose: component-based web UI.

Why:
- strong ecosystem;
- familiar to the project owner;
- suitable for chat, notes, editor, quiz, and dashboard interfaces.

### Vite

Purpose: frontend development/build tooling.

### JavaScript

The initial project uses JavaScript rather than TypeScript to align with the owner's current skill set and reduce language overhead.

### React Router

Purpose: client-side navigation and protected routes.

### Tailwind CSS

Purpose: consistent styling and responsive layout.

Constraint: the visual system must stay professional and restrained. Tailwind is a tool, not a design language.

## Backend

### Node.js

Purpose: server-side runtime.

### Express

Purpose: HTTP API layer and middleware composition.

### JavaScript

Used across the backend for consistency and easier project ownership.

## Database

### MongoDB

Purpose: persistence for users, conversations, structured knowledge, notes, quizzes, and flexible metadata.

Reasoning:
- document-oriented data maps naturally to conversations and note structures;
- schema flexibility is useful for evolving AI-generated knowledge metadata;
- strong indexing and aggregation support are available for analytics and retrieval.

Trade-off:
- relationships must be deliberately modeled;
- consistency-sensitive workflows may require transactions.

### Mongoose

Purpose: modeling, validation, indexes, and MongoDB access abstraction.

## AI Architecture

The product must use an internal AI Gateway and provider adapters rather than scattering provider SDK calls throughout business logic.

Initial provider selection is intentionally not frozen in this document. The implementation phase should validate provider capabilities, cost, latency, quotas, structured-output support, and reliability before committing versions/configuration.

## Authentication

The system must support:

- Google sign-in;
- passwordless email OTP;
- secure session management;
- account linking;
- rate-limited OTP flow.

A production authentication provider may be used where it materially improves reliability and security. Provider selection must be documented in an ADR before implementation.

## Storage

Binary assets such as imported files and generated exports should be stored in object storage rather than MongoDB documents once production usage requires it.

## Email

An external transactional email provider is expected for OTP delivery. The chosen provider must be abstracted behind an email service.

## PDF

The source of truth remains structured notes. PDF generation should be a render/export concern, not the primary data format.

## Testing

The exact test stack will be selected in Phase 00 based on ecosystem fit. The minimum expectation is:

- unit tests;
- API/integration tests;
- frontend component tests where valuable;
- end-to-end tests for critical flows.

## Environment Management

Secrets must come from environment configuration or a managed secret store. No API key or credential may be committed to the repository.

## Version Policy

Do not blindly pin versions from this document. At implementation time, choose compatible stable versions, record them in `DEPENDENCIES.md`, and preserve a working lockfile.
