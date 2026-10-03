# AI Architecture

## 1. Goal

Provide a provider-agnostic AI layer that supports normal chat, strict study interactions, note extraction, note comparison, quiz generation, answer evaluation, and import analysis.

## 2. Core Abstraction

```text
Application Service
       |
       v
   AI Gateway
       |
       +--> Task Classifier
       |
       +--> Model Router
       |
       +--> Provider Adapter
             /       |       \
         Provider A  B       Future C
```

Business services should request capabilities rather than provider SDKs.

Example conceptual interface:

```text
aiGateway.generate({
  taskType,
  input,
  constraints,
  outputSchema,
  priority
})
```

## 3. Task Types

Suggested initial task taxonomy:

- CHAT_RESPONSE
- STUDY_TEACH
- STUDY_QUESTION
- ANSWER_EVALUATION
- CONCEPT_EXTRACTION
- NOTE_DRAFT
- NOTE_UPDATE_ANALYSIS
- CONFLICT_ANALYSIS
- QUIZ_GENERATION
- QUIZ_EVALUATION
- IMPORT_NORMALIZATION
- IMPORT_ANALYSIS
- SUMMARY

## 4. Automatic Model Routing

The user should not need to choose a model for normal product operation.

The router considers:

- task type;
- required reasoning depth;
- latency target;
- expected context size;
- structured output support;
- tool/function requirements where applicable;
- provider health;
- cost budget;
- user/plan limits where applicable.

## 5. Provider Adapter Contract

Each provider adapter should expose a common internal contract for:

- text generation;
- structured output where supported;
- token/usage metadata;
- timeout/error normalization;
- streaming where supported.

Provider-specific response shapes must not leak into domain services.

## 6. Fallback Strategy

A provider failure should produce a normalized error such as:

- timeout;
- rate limited;
- quota exhausted;
- service unavailable;
- invalid request;
- safety refusal;
- malformed provider response.

Fallback to an alternate model/provider only when the task contract permits it.

Do not automatically switch models for a task if doing so could materially change semantics without a safe fallback policy.

## 7. Prompt Architecture

Maintain reusable prompt templates by task.

Prompt layers should conceptually be:

1. application/system policy;
2. task instructions;
3. trusted user preference context;
4. relevant knowledge context;
5. conversation context;
6. user message;
7. imported/untrusted content clearly marked as data.

## 8. Context Selection

Do not send all user notes and all historical chats to every request.

Retrieve relevant context based on:

- subject;
- topic;
- current chat;
- recent learning events;
- relevant concepts;
- selected note sections.

The first implementation may use deterministic retrieval. More advanced semantic retrieval can be introduced later.

## 9. Structured AI Output

Where AI output drives application state, require validated structured output.

Examples:

```text
ConceptExtractionResult
NoteChangeProposal
AnswerEvaluation
QuizQuestionSet
ImportAnalysisResult
```

Never persist arbitrary model output directly into critical fields without validation.

## 10. Knowledge Update Safety

AI-generated knowledge should pass through domain validation and change-diff logic before updating notes.

## 11. Cost Controls

Track at least:

- task type;
- provider/model;
- latency;
- usage if available;
- success/error.

Potential future controls:

- per-user quotas;
- task-specific model budgets;
- caching;
- batch processing;
- model downgrade for low-risk tasks.

## 12. Reliability Controls

Eventually introduce:

- timeouts;
- retries with backoff only where safe;
- circuit breaker/cooldown behavior;
- provider health tracking;
- maximum context limits.

## 13. AI Observability

Log enough information to understand:

- what task ran;
- which provider/model handled it;
- latency;
- normalized result status;
- failure reason.

Avoid storing sensitive content unnecessarily.

## 14. Interview-Level Explanation

The owner should be able to explain:

- why an AI gateway exists;
- why provider adapters exist;
- how task classification works;
- how models are selected;
- how failures are handled;
- how AI output is validated;
- why AI is not allowed to directly mutate the database.
