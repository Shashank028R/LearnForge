# ADR-003 — Structured Notes Instead of Raw HTML

## Status

Accepted

## Decision

Notes are stored as structured blocks and versioned documents rather than unrestricted HTML blobs.

## Rationale

- safer rendering;
- easier validation;
- easier AI diffing;
- easier PDF export;
- easier future mobile rendering;
- cleaner source attribution.

## Consequences

- editor implementation is more deliberate;
- block schema must evolve carefully.
