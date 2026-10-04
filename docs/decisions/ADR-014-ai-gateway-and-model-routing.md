# ADR-014: AI Gateway Abstraction, Task-Based Model Routing & Pedagogical Engine

## Status
Accepted

## Context
LearnForge is an AI-powered mastery workspace designed around the fundamental principle:
> *Chat is the interaction layer. Knowledge is the product. AI is the pedagogical engine.*

Directly coupling LLM provider SDKs (e.g. Google Gemini, OpenAI, Groq) to Express controllers, domain models, or React components creates severe technical debt:
1. **Vendor Lock-in & Fragility:** Provider-specific response schemas, token usage conventions, and error codes leak across the codebase.
2. **Brittle Frontend Complexity:** Forcing clients to select models or providers exposes internal infrastructure concerns and degrades user focus.
3. **Curriculum Leakage & Hallucination:** Sending unverified draft syllabi or cross-tenant context to LLMs compromises educational integrity.
4. **Resilience Failures:** Transient provider rate limits, network timeouts, or partial outages cause abrupt user-facing errors if not mitigated by intelligent retries and automated fallback chains.

We needed a centralized, provider-neutral AI architecture governed strictly by task taxonomy, capability requirements, and deterministic routing policies.

## Decision

### 1. Centralized AI Gateway Abstraction
All AI interactions must pass through the `AIGateway` subsystem (`server/src/ai/`).
- **Normalized Request Contract (`validateAndNormalizeAIRequest`)**: Encapsulates `task`, `messages`, `systemPrompt`, `subjectContext`, `syllabusContext`, `topicContext`, `temperature`, `timeoutMs`, and `requestId`.
- **Normalized Response Contract (`AIResponse`)**: Emits uniform `{ text, provider, model, task, usage, finishReason, latencyMs, routingMetadata, requestId }` independent of the underlying provider SDK.
- **Provider SDK Isolation**: Provider SDKs (`@google/genai`, `openai`, `groq-sdk`) are strictly confined to `server/src/ai/providers/`. No Express controllers or frontend components may import provider SDKs.
- **Active Providers for Phase 05**: `gemini`, `openai`, `groq`.
- **Anthropic Status**: `DISABLED / DEFERRED`. Not part of active Phase 05 provider set, not included in routing or fallback chains, not live-verified, and no Anthropic credentials required.

### 2. Task Taxonomy & Capability-Based Routing
LearnForge defines a structured task and capability taxonomy:
- **Task Types**:
  - `general_chat`: Multi-turn conversational learning and general inquiries. Default routing: `gemini` → `groq` → `openai`.
  - `pedagogical_explanation`: Deep conceptual breakdowns with intuition, mechanics, misconceptions, and active recall checks. Default routing: `openai` → `gemini` → `groq`.
  - `syllabus_generation`: Structured curriculum generation and topic hierarchical planning. Default routing: `openai` → `gemini` → `groq`.
  - `knowledge_relevance_classification`: Fast semantic classification of whether user input is `on_topic`, `off_topic`, or `uncertain`. Default routing: `groq` → `gemini` → `openai`.
- **Capabilities**: `text_generation`, `structured_output`, `fast_classification`, `complex_reasoning`.
- **Automatic Model Router (`ModelRouter`)**:
  - Automatically selects the optimal provider/model based on task capability requirements, configured priority order (`gemini`, `openai`, `groq`), and real-time provider health metrics.
  - **Zero Frontend Model Selection**: The client never chooses or specifies AI providers or model names. The server remains the sole trust and routing boundary.

### 3. Resilient Multi-Provider Failure Handling & Retries
- **Error Classification**: Normalized into standard error classes:
  - `AIAuthenticationError` (Permanent, 401/403, non-retryable)
  - `AIInvalidRequestError` (Permanent, 400, non-retryable)
  - `AIRateLimitedError` (Transient, 429, retryable)
  - `AITimeoutError` (Transient, ETIMEDOUT, retryable)
  - `AIProviderUnavailableError` (Transient, 500/502/503/504, retryable)
  - `AIAllProvidersFailedError` (Terminal exhausted fallback error)
- **Bounded Exponential Backoff with Jitter**: Retries transient failures up to `maxRetries` (default 2) with jitter.
- **Automatic Fallback Chain**: If a provider fails transiently across retries or is degraded (≥3 consecutive failures), the Gateway transparently falls back to the next configured provider in the preference chain.
- **Socratic Engine Fallback**: In development/testing when external credentials are not supplied, the gateway gracefully falls back to a deterministic offline Socratic pedagogical engine.

### 4. Authoritative Curriculum Context Boundaries
- **Strict Syllabus Governance**: When assembling context in `promptRegistry.js`, only explicitly approved syllabi (`status: 'approved'`) are included as authoritative curriculum. Draft or superseded versions are never injected as authoritative truth.
- **Context Isolation**: Only subject and topic data belonging to the authenticated `req.user._id` is queried and injected.

### 5. Off-Topic Relevance Classification without Canonical Knowledge Pollution
- Messages are classified into `relevance: 'on_topic' | 'off_topic' | 'uncertain'`.
- Off-topic inquiries receive helpful answers, but their `knowledgeContext.disposition` is marked `excluded`.
- Off-topic conversations are preserved as conversational evidence but **never automatically create canonical notes, topic summaries, or curriculum modifications**.

### 6. Credential Gate & Redacted Observability
- API keys (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`) are read strictly from server environment variables.
- Telemetry (`AITelemetry`) logs structured request latency, task, provider, and token counts with request IDs while strictly redacting secrets, auth headers, and raw user conversation bodies.

## Consequences
- **Positive:**
  - High availability: Transparent fallback between Gemini, OpenAI, and Groq ensures resilience during single-provider outages.
  - Testability: Clean normalized provider interfaces allow comprehensive automated unit and integration tests without network dependency.
  - Pedagogical consistency: Centralized prompt templates enforce high-rigor Socratic teaching standards across all models.
  - Strict security: API keys and cross-tenant learning context can never leak to the client or external log aggregators.
- **Negative:**
  - Provider adapters must be maintained when upstream provider SDKs release major breaking version upgrades.
