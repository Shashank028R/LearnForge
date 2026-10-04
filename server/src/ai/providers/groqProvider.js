import { BaseProvider } from './baseProvider.js';
import { createNormalizedAIResponse } from '../schemas/aiResponse.js';
import { buildSystemPrompt } from '../prompts/promptRegistry.js';
import Groq from 'groq-sdk';

/**
 * Groq Provider Adapter (Phase 05)
 */
export class GroqProvider extends BaseProvider {
  constructor(config = {}) {
    super('groq', {
      apiKey: config.apiKey || process.env.GROQ_API_KEY || '',
      model: config.model || process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      ...config,
    });
    this.client = this.config.apiKey ? new Groq({ apiKey: this.config.apiKey }) : null;
  }

  async generate(normalizedRequest) {
    if (!this.isConfigured()) {
      throw this.normalizeError(new Error('GROQ_API_KEY is not configured.'), normalizedRequest.requestId);
    }

    const startTime = Date.now();
    try {
      const systemPrompt = buildSystemPrompt(normalizedRequest.task, normalizedRequest);
      const modelName = normalizedRequest.model || this.config.model || 'openai/gpt-oss-120b';

      const messages = [
        { role: 'system', content: systemPrompt },
        ...(normalizedRequest.messages || []).map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
      ];

      const client = this.client || new Groq({ apiKey: this.config.apiKey });

      const requestParams = {
        model: modelName,
        messages,
        temperature: normalizedRequest.temperature,
        max_tokens:
          normalizedRequest.task === 'knowledge_event_extraction'
            ? Math.min(normalizedRequest.maxTokens || 800, 800)
            : normalizedRequest.maxTokens,
      };

      if (modelName.includes('gpt-oss')) {
        requestParams.reasoning_effort = 'low';
      }

      const response = await client.chat.completions.create(requestParams);

      const latencyMs = Date.now() - startTime;
      this.recordSuccess();

      const choice = response.choices?.[0];
      const text = choice?.message?.content || '';

      // If task is classification, attempt to parse JSON classification
      let classification = null;
      if (normalizedRequest.task === 'knowledge_relevance_classification') {
        try {
          const cleaned = text.replace(/```json\n?|```/g, '').trim();
          classification = JSON.parse(cleaned);
        } catch (_) {}
      }

      const usage = response.usage
        ? {
            promptTokens: response.usage.prompt_tokens || 0,
            completionTokens: response.usage.completion_tokens || 0,
            totalTokens: response.usage.total_tokens || 0,
          }
        : null;

      return createNormalizedAIResponse({
        text,
        provider: this.name,
        model: modelName,
        task: normalizedRequest.task,
        usage,
        finishReason: choice?.finish_reason || 'stop',
        latencyMs,
        requestId: normalizedRequest.requestId,
        classification,
      });
    } catch (err) {
      this.recordFailure(err);
      throw this.normalizeError(err, normalizedRequest.requestId);
    }
  }
}
