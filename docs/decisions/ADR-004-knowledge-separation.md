# ADR-004 — Separate Conversation From Knowledge State

## Status

Accepted

## Decision

Conversation transcripts are evidence. KnowledgeState is the canonical representation of user learning state.

## Rationale

A transcript cannot directly answer what the user understands, which concepts are weak, or what should be reviewed next.

Separating these concerns enables quizzes, progress tracking, adaptive Study Mode, and note updates.
