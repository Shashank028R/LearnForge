# ADR-001 — Product Architecture

## Status

Accepted

## Context

The product combines AI chat, notes, learning progress, quizzes, and study sessions.

## Decision

Treat the application as an AI-powered learning platform rather than a simple chat or notes app.

The architectural center is the knowledge model. Chat produces evidence and learning events. Notes, progress, and quizzes consume the resulting knowledge state.

## Consequences

Positive:
- scalable feature model;
- easier future adaptive learning;
- mobile client can reuse backend knowledge APIs;
- clearer separation of concerns.

Negative:
- more domain complexity than a simple chatbot;
- requires explicit knowledge modeling and event flows.
