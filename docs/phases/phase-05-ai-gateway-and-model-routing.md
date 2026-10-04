# Phase 05 — AI Gateway, Automatic Model Routing & Pedagogical Engine

## Overview
Phase 05 establishes the first production-grade, multi-provider AI architecture for LearnForge.

### Core Architectural Principle
> **Chat is the interaction layer. Knowledge is the product. AI is the pedagogical engine.**

The AI subsystem is fully decoupled from Express controllers, React components, and database models. The application interfaces with AI purely in terms of **tasks** and **capabilities**, not vendor names.

---

## 1. Architecture & Flow

```
Client (Web UI)
      ↓
Chat API Controller (`chatController.js`)
      ↓
AI Gateway (`AIGateway.js`)
      ↓
Automatic Task-Based Model Router (`ModelRouter.js`)
      ↓
Provider Adapter (`BaseProvider.js` → `GeminiProvider` | `OpenAIProvider` | `GroqProvider`)
      ↓
Upstream AI Provider (Google Gemini / OpenAI / Groq)
```

1. **Client Sends Message**: Client dispatches user prompt (`role: "user"`). Client never selects a provider or model.
2. **User Message Persistence**: User message is atomically assigned a sequential sequence index (`sequenceIndex`) and saved to MongoDB.
3. **Authoritative Context Assembly**: Server queries authenticated domain boundaries:
   - `Subject` (`name`, `description`, `targetMasteryLevel`)
   - `SyllabusVersion` (**Active Approved version only**; draft/superseded versions are never authoritative)
   - `Topic` (`title`, `description`)
   - Recent message conversation history
4. **Task Classification & Routing**:
   - Classifies relevance of input (`on_topic`, `off_topic`, `uncertain`).
   - Dispatches `general_chat` or `pedagogical_explanation` through the `ModelRouter`.
5. **Provider Execution & Normalization**: Adapter executes the model call and normalizes the response into an immutable `AIResponse` envelope.
6. **Persistence & Knowledge Governance**:
   - Assistant message is persisted with incremental `sequenceIndex`.
   - Populates `knowledgeContext: { relevance, disposition, subjectId, topicId }`.
   - Attaches sanitized `metadata: { provider, model, task, latencyMs, usage, routingDecision }`.
   - If off-topic, disposition is set to `excluded` (preserving conversation evidence without creating canonical topic notes).

---

## 2. Task & Capability Taxonomy

| Task Type | Required Capabilities | Default Preference Chain | Purpose |
| :--- | :--- | :--- | :--- |
| `general_chat` | `text_generation` | Gemini → Groq → OpenAI | Free-form learning dialogues, Q&A, and exploration. |
| `pedagogical_explanation` | `text_generation`, `complex_reasoning` | OpenAI → Gemini → Groq | Structured conceptual deep-dives (intuition, mechanics, edge cases, active recall checks). |
| `syllabus_generation` | `structured_output`, `complex_reasoning` | OpenAI → Gemini → Groq | Comprehensive curriculum planning and hierarchical topic structuring. |
| `knowledge_relevance_classification` | `fast_classification`, `structured_output` | Groq → Gemini → OpenAI | Fast semantic evaluation of message alignment with active syllabus scope. |

---

## 3. Provider Adapters & Normalization

All adapters extend `BaseProvider` (`server/src/ai/providers/baseProvider.js`) and implement uniform execution, error normalization, and health monitoring:

1. **`GeminiProvider`** (`server/src/ai/providers/geminiProvider.js`): Uses official `@google/genai` (v2.27.0). Defaults to `gemini-2.5-flash`.
2. **`OpenAIProvider`** (`server/src/ai/providers/openaiProvider.js`): Uses official `openai` (v7.27.0). Defaults to `gpt-4o-mini`.
3. **`GroqProvider`** (`server/src/ai/providers/groqProvider.js`): Uses official `groq-sdk` (v1.6.0). Defaults to `openai/gpt-oss-20b`.
4. **Anthropic**: `DISABLED / DEFERRED`. Not part of active Phase 05 provider set.

### Normalized Response Envelope
```json
{
  "text": "Socratic explanation...",
  "provider": "groq",
  "model": "openai/gpt-oss-20b",
  "task": "pedagogical_explanation",
  "usage": {
    "promptTokens": 120,
    "completionTokens": 240,
    "totalTokens": 360
  },
  "finishReason": "stop",
  "latencyMs": 412,
  "routingMetadata": {
    "selectedProvider": "groq",
    "selectedModel": "openai/gpt-oss-20b",
    "reason": "task_policy_pedagogical_explanation",
    "attempts": 1
  },
  "requestId": "req_1728020000000_abc123"
}
```

---

## 4. Error Normalization & Resilience Strategy

- **`AIAuthenticationError`** (HTTP 401/403, invalid keys) → **Permanent / Non-Retryable**.
- **`AIInvalidRequestError`** (HTTP 400, malformed prompts) → **Permanent / Non-Retryable**.
- **`AIRateLimitedError`** (HTTP 429, resource exhausted) → **Transient / Retryable**.
- **`AITimeoutError`** (ETIMEDOUT, network abort) → **Transient / Retryable**.
- **`AIProviderUnavailableError`** (HTTP 500/502/503/504) → **Transient / Retryable**.
- **`AIAllProvidersFailedError`** → Terminal error when all configured providers are exhausted.

### Bounded Same-Provider Retries with Exponential Jitter & Fallback Chain
1. **Same-Provider Retry**: If the currently selected provider encounters a retryable error (`429 Rate Limit`, `ETIMEDOUT`, `5xx Unavailable`), the Gateway retries the *same* provider up to `maxRetries` (default 2) with exponential backoff and randomized jitter (`Math.min(1000, 100 * 2^attempt) + jitter`). The provider is NOT excluded after a single transient failure.
2. **Provider Fallback**: If retries are exhausted on a provider or the provider hits a non-retryable error, the Gateway excludes that provider for the current request and transparently falls back to the next healthy provider in the task preference chain.
3. **Application-Level Offline Socratic Fallback**: When external AI API keys are not configured or all upstream providers fail, `chatController.js` catches `AIAllProvidersFailedError` / `AIAuthenticationError` and delivers an application-level offline Socratic fallback response (`model: 'socratic-engine'`), preventing chat disruption.

---

## 5. Security & Knowledge Boundaries

1. **Credential Gate**:
   - Zero hardcoded keys or fake test keys in codebase or test fixtures.
   - Credentials read exclusively from environment variables (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`).
   - `.env.example` contains placeholders only.
2. **Tenant Isolation**:
   - Server validates that `chatId`, `subjectId`, and `topicId` strictly belong to `req.user._id`.
   - Cross-tenant context leakage is structurally impossible.
3. **Role Trust Boundary**:
   - Frontend cannot submit assistant or system messages directly. Server assigns sequence indexes and creates assistant messages.
4. **Knowledge Governance Invariants**:
   - **Approved Syllabus Context Only**: Draft and superseded syllabi are never presented to the AI as authoritative curriculum context.
   - **Off-Topic Protection**: Off-topic user questions are answered politely, but `knowledgeContext.disposition` is set to `excluded` and never automatically converted to canonical notes or topic knowledge.

---

## 6. Verification Summary

- **Unit & Mocked Tests**: 130/130 backend tests passing (`server/tests/aiGateway.test.js`, `server/tests/chats.test.js`, etc.).
- **Client Tests**: 46/46 frontend tests passing (`client/src/App.test.jsx`, `client/src/pages/Chats.test.jsx`, etc.).
- **Total Monorepo Tests**: 176/176 automated tests passing (100%).
- **Client Production Build**: Passed cleanly with Vite (`dist/` built cleanly).
- **MongoDB Atlas Live Integration & Fail-Closed Provider Verification**: `server/scripts/verify_phase05_live.js` verified end-to-end against live Express API, Atlas cluster, and live Groq API.
- **External AI Providers**:
  - Gemini: `CONFIGURED` / `IMPLEMENTED — BLOCKED / NOT LIVE-VERIFIED` (No live external API key in local `.env`)
  - OpenAI: `CONFIGURED` / `IMPLEMENTED — BLOCKED / NOT LIVE-VERIFIED` (No live external API key in local `.env`)
  - Groq: `LIVE-VERIFIED` (Tested live with `GROQ_API_KEY` and `openai/gpt-oss-20b`, exact marker `"LearnForge Groq Live Verified"` verified)
  - Anthropic: `DISABLED / DEFERRED` (Not part of active Phase 05 provider set)
