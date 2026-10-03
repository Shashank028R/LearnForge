# ADR-007 — Risk-Based Note Update Policy

## Status

Accepted

## Decision

Use risk-based automation:

- low-risk additions may be applied automatically;
- medium/high-risk rewrites should generate reviewable changes;
- user-authored content has stronger protection than AI-authored content.

## Rationale

Fully manual notes defeat the product goal. Fully automatic destructive rewriting risks data loss.

## Consequences

Requires a change proposal/diff model and version history.
