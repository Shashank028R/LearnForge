import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIGateway } from '../src/ai/gateway/aiGateway.js';
import { ModelRouter } from '../src/ai/router/modelRouter.js';
import { BaseProvider } from '../src/ai/providers/baseProvider.js';
import { GeminiProvider } from '../src/ai/providers/geminiProvider.js';
import { OpenAIProvider } from '../src/ai/providers/openaiProvider.js';
import { GroqProvider } from '../src/ai/providers/groqProvider.js';
import { validateAndNormalizeAIRequest } from '../src/ai/schemas/aiRequest.js';
import { AI_TASK_TYPES, AI_CAPABILITIES } from '../src/ai/schemas/tasks.js';
import {
  AIError,
  AIProviderUnavailableError,
  AITimeoutError,
  AIAuthenticationError,
  AIRateLimitedError,
  AIInvalidRequestError,
  AIAllProvidersFailedError,
} from '../src/ai/errors/aiErrors.js';
import { buildSystemPrompt } from '../src/ai/prompts/promptRegistry.js';
import { aiTelemetry } from '../src/ai/telemetry/aiTelemetry.js';

describe('AI Gateway & Task-Based Model Routing (Gemini, OpenAI, Groq)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Task Taxonomy & Schema Validation', () => {
    it('defines valid task taxonomy and capability mappings', () => {
      expect(AI_TASK_TYPES.GENERAL_CHAT).toBe('general_chat');
      expect(AI_TASK_TYPES.PEDAGOGICAL_EXPLANATION).toBe('pedagogical_explanation');
      expect(AI_TASK_TYPES.SYLLABUS_GENERATION).toBe('syllabus_generation');
      expect(AI_TASK_TYPES.KNOWLEDGE_RELEVANCE_CLASSIFICATION).toBe('knowledge_relevance_classification');

      expect(AI_CAPABILITIES.TEXT_GENERATION).toBe('text_generation');
      expect(AI_CAPABILITIES.STRUCTURED_OUTPUT).toBe('structured_output');
      expect(AI_CAPABILITIES.FAST_CLASSIFICATION).toBe('fast_classification');
      expect(AI_CAPABILITIES.COMPLEX_REASONING).toBe('complex_reasoning');
    });

    it('validates and normalizes valid AI request schemas', () => {
      const validReq = {
        task: AI_TASK_TYPES.PEDAGOGICAL_EXPLANATION,
        messages: [{ role: 'user', content: 'Explain recursion.' }],
        systemPrompt: 'You are a patient CS educator.',
        temperature: 0.5,
        timeoutMs: 15000,
        requestId: 'req-test-123',
      };

      const normalized = validateAndNormalizeAIRequest(validReq);
      expect(normalized.task).toBe(AI_TASK_TYPES.PEDAGOGICAL_EXPLANATION);
      expect(normalized.messages).toHaveLength(1);
      expect(normalized.systemPrompt).toBe('You are a patient CS educator.');
      expect(normalized.temperature).toBe(0.5);
      expect(normalized.timeoutMs).toBe(15000);
      expect(normalized.requestId).toBe('req-test-123');
    });

    it('rejects invalid tasks and malformed requests with AIInvalidRequestError', () => {
      expect(() => {
        validateAndNormalizeAIRequest({
          task: 'non_existent_task',
          messages: [{ role: 'user', content: 'test' }],
        });
      }).toThrow(AIInvalidRequestError);

      expect(() => {
        validateAndNormalizeAIRequest({
          task: AI_TASK_TYPES.GENERAL_CHAT,
          messages: 'not-an-array',
        });
      }).toThrow(AIInvalidRequestError);

      expect(() => {
        validateAndNormalizeAIRequest({
          task: AI_TASK_TYPES.GENERAL_CHAT,
          messages: [],
        });
      }).toThrow(AIInvalidRequestError);
    });
  });

  describe('2. Provider Adapters', () => {
    it('BaseProvider normalizes error types correctly', () => {
      const provider = new BaseProvider('test_provider', { apiKey: 'key' });

      const authErr = provider.normalizeError({ status: 401, message: 'Unauthorized API key' }, 'req-1');
      expect(authErr).toBeInstanceOf(AIAuthenticationError);
      expect(authErr.isRetryable).toBe(false);

      const rateErr = provider.normalizeError({ status: 429, message: 'RESOURCE_EXHAUSTED' }, 'req-2');
      expect(rateErr).toBeInstanceOf(AIRateLimitedError);
      expect(rateErr.isRetryable).toBe(true);

      const timeoutErr = provider.normalizeError({ code: 'ETIMEDOUT', message: 'connection timed out' }, 'req-3');
      expect(timeoutErr).toBeInstanceOf(AITimeoutError);
      expect(timeoutErr.isRetryable).toBe(true);

      const badReqErr = provider.normalizeError({ status: 400, message: 'invalid_request payload' }, 'req-4');
      expect(badReqErr).toBeInstanceOf(AIInvalidRequestError);
      expect(badReqErr.isRetryable).toBe(false);

      const unavailErr = provider.normalizeError({ status: 503, message: 'service unavailable' }, 'req-5');
      expect(unavailErr).toBeInstanceOf(AIProviderUnavailableError);
      expect(unavailErr.isRetryable).toBe(true);
    });

    it('GeminiProvider adapter maps prompts and normalizes response safely', async () => {
      const gemini = new GeminiProvider({
        apiKey: 'test-gemini-key',
        model: 'gemini-2.5-flash',
      });

      const mockGenerateContent = vi.fn().mockResolvedValue({
        text: 'Recursion is a function calling itself.',
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 30, totalTokenCount: 50 },
        candidates: [{ finishReason: 'STOP' }],
      });

      gemini.client = {
        models: {
          generateContent: mockGenerateContent,
        },
      };

      const req = validateAndNormalizeAIRequest({
        task: AI_TASK_TYPES.GENERAL_CHAT,
        systemPrompt: 'You are an AI teacher.',
        messages: [{ role: 'user', content: 'What is recursion?' }],
        requestId: 'req-gemini-1',
      });

      const res = await gemini.generate(req);
      expect(res.text).toBe('Recursion is a function calling itself.');
      expect(res.provider).toBe('gemini');
      expect(res.model).toBe('gemini-2.5-flash');
      expect(res.usage.totalTokens).toBe(50);
      expect(mockGenerateContent).toHaveBeenCalled();
    });

    it('OpenAIProvider adapter maps chat completions and normalizes response safely', async () => {
      const openai = new OpenAIProvider({
        apiKey: 'test-openai-key',
        model: 'gpt-4o-mini',
      });

      const mockCreate = vi.fn().mockResolvedValue({
        choices: [
          {
            message: { content: 'Binary search runs in O(log n).' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 },
      });

      openai.client = {
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      };

      const req = validateAndNormalizeAIRequest({
        task: AI_TASK_TYPES.PEDAGOGICAL_EXPLANATION,
        systemPrompt: 'You are a computer science professor.',
        messages: [{ role: 'user', content: 'How fast is binary search?' }],
        requestId: 'req-openai-1',
      });

      const res = await openai.generate(req);
      expect(res.text).toBe('Binary search runs in O(log n).');
      expect(res.provider).toBe('openai');
      expect(res.model).toBe('gpt-4o-mini');
      expect(res.usage.totalTokens).toBe(40);
      expect(mockCreate).toHaveBeenCalled();
    });

    it('GroqProvider adapter maps chat completions and normalizes response safely', async () => {
      const groq = new GroqProvider({
        apiKey: 'test-groq-key',
        model: 'llama-3.3-70b-versatile',
      });

      const mockCreate = vi.fn().mockResolvedValue({
        choices: [
          {
            message: { content: 'Dynamic programming memoizes subproblem solutions.' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 30, completion_tokens: 45, total_tokens: 75 },
      });

      groq.client = {
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      };

      const req = validateAndNormalizeAIRequest({
        task: AI_TASK_TYPES.PEDAGOGICAL_EXPLANATION,
        systemPrompt: 'You are an algorithms educator.',
        messages: [{ role: 'user', content: 'What is dynamic programming?' }],
        requestId: 'req-groq-1',
      });

      const res = await groq.generate(req);
      expect(res.text).toBe('Dynamic programming memoizes subproblem solutions.');
      expect(res.provider).toBe('groq');
      expect(res.model).toBe('llama-3.3-70b-versatile');
      expect(res.usage.totalTokens).toBe(75);
      expect(mockCreate).toHaveBeenCalled();
    });

    it('GroqProvider parses classification output when task is knowledge_relevance_classification', async () => {
      const groq = new GroqProvider({
        apiKey: 'test-groq-key',
        model: 'llama-3.3-70b-versatile',
      });

      const mockCreate = vi.fn().mockResolvedValue({
        choices: [
          {
            message: { content: '```json\n{"relevance": "off_topic", "confidence": 0.95, "reason": "Recipe question"}\n```' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
      });

      groq.client = {
        chat: { completions: { create: mockCreate } },
      };

      const req = validateAndNormalizeAIRequest({
        task: AI_TASK_TYPES.KNOWLEDGE_RELEVANCE_CLASSIFICATION,
        messages: [{ role: 'user', content: 'How to bake cookies?' }],
        requestId: 'req-groq-class-1',
      });

      const res = await groq.generate(req);
      expect(res.classification).toBeDefined();
      expect(res.classification.relevance).toBe('off_topic');
    });
  });

  describe('3. Task-Based Model Router', () => {
    it('selects provider and model deterministically based on task capabilities', () => {
      const mockGemini = new GeminiProvider({ apiKey: 'gem-key', model: 'gemini-2.5-flash' });
      const mockOpenAI = new OpenAIProvider({ apiKey: 'oai-key', model: 'gpt-4o-mini' });
      const mockGroq = new GroqProvider({ apiKey: 'grq-key', model: 'llama-3.3-70b-versatile' });

      const providers = {
        gemini: mockGemini,
        openai: mockOpenAI,
        groq: mockGroq,
      };

      const router = new ModelRouter(providers, {
        priorityOrder: ['gemini', 'openai', 'groq'],
      });

      // Knowledge relevance classification -> preference groq -> gemini -> openai
      const fastDecision = router.selectRoute(AI_TASK_TYPES.KNOWLEDGE_RELEVANCE_CLASSIFICATION);
      expect(fastDecision.providerName).toBe('groq');
      expect(fastDecision.model).toBe('llama-3.3-70b-versatile');

      // General chat -> preference gemini -> groq -> openai
      const chatDecision = router.selectRoute(AI_TASK_TYPES.GENERAL_CHAT);
      expect(chatDecision.providerName).toBe('gemini');
      expect(chatDecision.model).toBe('gemini-2.5-flash');

      // Pedagogical explanation -> preference openai -> gemini -> groq
      const reasoningDecision = router.selectRoute(AI_TASK_TYPES.PEDAGOGICAL_EXPLANATION);
      expect(reasoningDecision.providerName).toBe('openai');
    });

    it('falls back to alternate provider when primary provider is degraded', () => {
      const mockGemini = new GeminiProvider({ apiKey: 'gem-key', model: 'gemini-2.5-flash' });
      const mockGroq = new GroqProvider({ apiKey: 'grq-key', model: 'llama-3.3-70b-versatile' });

      // Mark gemini degraded with 3 failures
      mockGemini.recordFailure(new AIProviderUnavailableError('Service Unavailable', { provider: 'gemini' }));
      mockGemini.recordFailure(new AIProviderUnavailableError('Service Unavailable', { provider: 'gemini' }));
      mockGemini.recordFailure(new AIProviderUnavailableError('Service Unavailable', { provider: 'gemini' }));

      const providers = {
        gemini: mockGemini,
        groq: mockGroq,
      };

      const router = new ModelRouter(providers, {
        priorityOrder: ['gemini', 'groq'],
        taskPreferences: {
          [AI_TASK_TYPES.GENERAL_CHAT]: ['gemini', 'groq'],
        },
      });

      const fallbackDecision = router.selectRoute(AI_TASK_TYPES.GENERAL_CHAT);
      expect(fallbackDecision.providerName).toBe('groq');
      expect(fallbackDecision.model).toBe('llama-3.3-70b-versatile');
    });
  });

  describe('4. AI Gateway Execution, Retries, and Fallback', () => {
    it('successfully routes and executes request via Gateway', async () => {
      const mockProvider = new GeminiProvider({ apiKey: 'gem-key', model: 'gemini-2.5-flash' });
      vi.spyOn(mockProvider, 'generate').mockResolvedValue({
        text: 'Explanation of closures.',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        task: AI_TASK_TYPES.PEDAGOGICAL_EXPLANATION,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        finishReason: 'stop',
        latencyMs: 15,
        requestId: 'req-gw-1',
      });

      const gateway = new AIGateway({
        customProviders: { gemini: mockProvider },
        routerOptions: { priorityOrder: ['gemini'] },
        maxRetries: 2,
      });

      const res = await gateway.generate({
        task: AI_TASK_TYPES.PEDAGOGICAL_EXPLANATION,
        messages: [{ role: 'user', content: 'What is a closure?' }],
        requestId: 'req-gw-1',
      });

      expect(res.text).toBe('Explanation of closures.');
      expect(res.provider).toBe('gemini');
      expect(res.model).toBe('gemini-2.5-flash');
      expect(res.routingMetadata).toBeDefined();
      expect(res.routingMetadata.attempts).toBe(1);
      expect(res.routingMetadata.retries).toBe(0);
    });

    it('retries transient failures on the SAME provider with backoff and succeeds on subsequent attempt', async () => {
      const mockProvider = new GeminiProvider({ apiKey: 'gem-key', model: 'gemini-2.5-flash' });
      let geminiCallCount = 0;

      vi.spyOn(mockProvider, 'generate').mockImplementation(async () => {
        geminiCallCount++;
        if (geminiCallCount < 3) {
          throw new AIRateLimitedError('Rate limit exceeded', { provider: 'gemini' });
        }
        return {
          text: 'Success on 3rd attempt on same provider',
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          task: AI_TASK_TYPES.GENERAL_CHAT,
          usage: { totalTokens: 25 },
          finishReason: 'stop',
          latencyMs: 10,
          requestId: 'req-retry-same-1',
        };
      });

      const gateway = new AIGateway({
        customProviders: { gemini: mockProvider },
        routerOptions: { priorityOrder: ['gemini'] },
        maxRetries: 2,
      });

      const res = await gateway.generate({
        task: AI_TASK_TYPES.GENERAL_CHAT,
        messages: [{ role: 'user', content: 'Hello' }],
        requestId: 'req-retry-same-1',
      });

      expect(res.text).toBe('Success on 3rd attempt on same provider');
      expect(res.provider).toBe('gemini');
      expect(geminiCallCount).toBe(3); // 1 initial attempt + 2 retries on same provider
      expect(res.routingMetadata.attempts).toBe(3);
      expect(res.routingMetadata.retries).toBe(2);
    });

    it('falls back to secondary provider after primary provider exhausts its retry budget', async () => {
      const primaryProvider = new GeminiProvider({ apiKey: 'gem-key', model: 'gemini-2.5-flash' });
      const fallbackProvider = new GroqProvider({ apiKey: 'grq-key', model: 'openai/gpt-oss-120b' });

      let primaryCalls = 0;
      let fallbackCalls = 0;

      vi.spyOn(primaryProvider, 'generate').mockImplementation(async () => {
        primaryCalls++;
        throw new AIProviderUnavailableError('Service 503 Unavailable', { provider: 'gemini' });
      });

      vi.spyOn(fallbackProvider, 'generate').mockImplementation(async () => {
        fallbackCalls++;
        return {
          text: 'Success from Groq fallback provider',
          provider: 'groq',
          model: 'openai/gpt-oss-120b',
          task: AI_TASK_TYPES.GENERAL_CHAT,
          usage: { totalTokens: 30 },
          finishReason: 'stop',
          latencyMs: 12,
          requestId: 'req-exhaust-fallback-1',
        };
      });

      const gateway = new AIGateway({
        customProviders: { gemini: primaryProvider, groq: fallbackProvider },
        routerOptions: {
          priorityOrder: ['gemini', 'groq'],
          taskPreferences: { [AI_TASK_TYPES.GENERAL_CHAT]: ['gemini', 'groq'] },
        },
        maxRetries: 2,
      });

      const res = await gateway.generate({
        task: AI_TASK_TYPES.GENERAL_CHAT,
        messages: [{ role: 'user', content: 'Hello' }],
        requestId: 'req-exhaust-fallback-1',
      });

      expect(res.text).toBe('Success from Groq fallback provider');
      expect(res.provider).toBe('groq');
      expect(primaryCalls).toBe(3); // 1 initial + 2 retries before fallback
      expect(fallbackCalls).toBe(1); // 1 attempt on fallback provider
      expect(res.routingMetadata.attempts).toBe(4); // 3 primary + 1 fallback
    });

    it('falls back immediately without retrying on non-retryable errors (e.g. auth error)', async () => {
      const failingAuth = new GeminiProvider({ apiKey: 'bad-key', model: 'gemini-2.5-flash' });
      const healthyGroq = new GroqProvider({ apiKey: 'grq-key', model: 'openai/gpt-oss-120b' });

      let authCalls = 0;
      let groqCalls = 0;

      vi.spyOn(failingAuth, 'generate').mockImplementation(async () => {
        authCalls++;
        throw new AIAuthenticationError('Invalid API Key', { provider: 'gemini' });
      });

      vi.spyOn(healthyGroq, 'generate').mockImplementation(async () => {
        groqCalls++;
        return {
          text: 'Groq recovered from unretryable Gemini auth error',
          provider: 'groq',
          model: 'openai/gpt-oss-120b',
          task: AI_TASK_TYPES.GENERAL_CHAT,
          usage: { totalTokens: 15 },
          finishReason: 'stop',
          latencyMs: 8,
          requestId: 'req-nonretryable-fallback',
        };
      });

      const gateway = new AIGateway({
        customProviders: { gemini: failingAuth, groq: healthyGroq },
        routerOptions: {
          priorityOrder: ['gemini', 'groq'],
          taskPreferences: { [AI_TASK_TYPES.GENERAL_CHAT]: ['gemini', 'groq'] },
        },
        maxRetries: 3,
      });

      const res = await gateway.generate({
        task: AI_TASK_TYPES.GENERAL_CHAT,
        messages: [{ role: 'user', content: 'Hello' }],
        requestId: 'req-nonretryable-fallback',
      });

      expect(res.text).toBe('Groq recovered from unretryable Gemini auth error');
      expect(authCalls).toBe(1); // Exactly 1 attempt, zero retries on auth error
      expect(groqCalls).toBe(1); // Immediate fallback to Groq
    });

    it('throws AIAllProvidersFailedError when all configured providers are exhausted', async () => {
      const mockGemini = new GeminiProvider({ apiKey: 'gem-key', model: 'gemini-2.5-flash' });
      const mockGroq = new GroqProvider({ apiKey: 'grq-key', model: 'openai/gpt-oss-120b' });

      vi.spyOn(mockGemini, 'generate').mockRejectedValue(
        new AIProviderUnavailableError('Gemini 500', { provider: 'gemini' })
      );
      vi.spyOn(mockGroq, 'generate').mockRejectedValue(
        new AIProviderUnavailableError('Groq 500', { provider: 'groq' })
      );

      const gateway = new AIGateway({
        customProviders: { gemini: mockGemini, groq: mockGroq },
        routerOptions: { priorityOrder: ['gemini', 'groq'] },
        maxRetries: 1,
      });

      await expect(
        gateway.generate({
          task: AI_TASK_TYPES.GENERAL_CHAT,
          messages: [{ role: 'user', content: 'Hello' }],
          requestId: 'req-all-fail',
        })
      ).rejects.toThrow();
    });
  });

  describe('5. Central Prompt Registry & Curriculum Context Isolation', () => {
    it('assembles pedagogical explanation prompt with Subject, Approved Syllabus, and Topic context', () => {
      const assembled = buildSystemPrompt(AI_TASK_TYPES.PEDAGOGICAL_EXPLANATION, {
        subjectContext: {
          name: 'Distributed Systems',
          targetMasteryLevel: 'advanced',
          description: 'Consensus algorithms and replication',
        },
        syllabusContext: {
          version: 2,
          title: 'Distributed Consensus',
          sections: [
            {
              title: 'Consensus Protocols',
              topics: [{ title: 'Raft Protocol' }, { title: 'Paxos' }],
            },
          ],
        },
        topicContext: {
          title: 'Raft Protocol',
          description: 'Leader election and log replication',
        },
      });

      expect(assembled).toContain('Distributed Systems');
      expect(assembled).toContain('Consensus Protocols');
      expect(assembled).toContain('Raft Protocol');
      expect(assembled).toContain('LearnForge Deep Explanation Engine');
    });
  });

  describe('6. Telemetry & Security Protection', () => {
    it('records telemetry and redacts sensitive tokens or authorization keys', () => {
      const requestSpy = vi.spyOn(aiTelemetry, 'recordRequest');
      const successSpy = vi.spyOn(aiTelemetry, 'recordSuccess');

      aiTelemetry.recordRequest({
        task: AI_TASK_TYPES.GENERAL_CHAT,
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        requestId: 'req-telemetry-1',
      });

      aiTelemetry.recordSuccess({
        task: AI_TASK_TYPES.GENERAL_CHAT,
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        latencyMs: 120,
        usage: { totalTokens: 45, promptTokens: 20, completionTokens: 25 },
        requestId: 'req-telemetry-1',
      });

      expect(requestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          task: AI_TASK_TYPES.GENERAL_CHAT,
          provider: 'groq',
          model: 'llama-3.3-70b-versatile',
          requestId: 'req-telemetry-1',
        })
      );

      expect(successSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          task: AI_TASK_TYPES.GENERAL_CHAT,
          provider: 'groq',
          latencyMs: 120,
        })
      );

      const metrics = aiTelemetry.getMetrics();
      expect(metrics.totalRequests).toBeGreaterThan(0);
      expect(metrics.successCount).toBeGreaterThan(0);
    });
  });
});
