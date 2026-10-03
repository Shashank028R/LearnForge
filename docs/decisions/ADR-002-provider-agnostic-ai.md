# ADR-002 — Provider-Agnostic AI Gateway

## Status

Accepted

## Decision

All AI features access providers through an internal AI Gateway and provider adapters.

The task router can select models based on the task rather than forcing the user to choose one.

## Rationale

- supports multiple providers;
- isolates SDK changes;
- enables task-specific model selection;
- simplifies fallback and observability;
- makes future provider additions safer.

## Consequences

- additional abstraction layer;
- requires normalized errors and outputs;
- provider-specific capabilities must be mapped carefully.
