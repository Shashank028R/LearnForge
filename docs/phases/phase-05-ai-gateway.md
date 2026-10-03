# Phase 05 — AI Gateway & Automatic Model Router

## Objective

Introduce provider abstraction and automatic model selection without coupling the chat UI to a specific vendor.

## Scope

- AI Gateway;
- provider adapter contract;
- task taxonomy;
- model router;
- normalized errors;
- timeouts/retries where safe;
- telemetry;
- provider configuration.

## Acceptance Criteria

Chat and domain services call the AI Gateway, not provider SDKs directly. Model selection is observable and testable.
