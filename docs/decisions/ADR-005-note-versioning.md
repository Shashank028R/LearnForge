# ADR-005 — Immutable Note Versions

## Status

Accepted

## Decision

Material note updates create immutable version snapshots. AI changes should be attributable and revertible.

## Rationale

AI-generated updates must never silently destroy user work.

## Consequences

- storage overhead;
- simpler auditability;
- safer rollback;
- clearer interview story.
