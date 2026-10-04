import { BaseProvider } from './baseProvider.js';
import { createNormalizedAIResponse } from '../schemas/aiResponse.js';
import { buildSystemPrompt } from '../prompts/promptRegistry.js';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Anthropic Claude Provider Adapter (Phase 05)
 */
export class AnthropicProvider extends BaseProvider {
  constructor(config = {}) {
    super('anthropic', {
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY || '',
      model: config.model || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
      ...config,
    });
    this.client = this.config.apiKey ? new Anthropic({ apiKey: this.config.apiKey }) : null;
  }

  async generate(normalizedRequest) {
    if (!this.isConfigured()) {
      throw this.normalizeError(new Error('ANTHROPIC_API_KEY is not configured.'), normalizedRequest.requestId);
    }

    const startTime = Date.now();
    try {
      const systemPrompt = buildSystemPrompt(normalizedRequest.task, normalizedRequest);
      const modelName = normalizedRequest.model || this.config.model || 'claude-3-5-sonnet-latest';

      const messages = (normalizedRequest.messages || []).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));

      const client = this.client || new Anthropic({ apiKey: this.config.apiKey });

      const response = await client.messages.create({
        model: modelName,
        system: systemPrompt,
        messages,
        temperature: normalizedRequest.temperature,
        max_tokens: normalizedRequest.maxTokens,
      });

      const latencyMs = Date.now() - startTime;
      this.recordSuccess();

      let text = '';
      if (Array.isArray(response.content)) {
        text = response.content.map((c) => c.text || '').join('');
      }

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
            promptTokens: response.usage.input_tokens || 0,
            completionTokens: response.usage.output_tokens || 0,
            totalTokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
          }
        : null;

      return createNormalizedAIResponse({
        text,
        provider: this.name,
        model: modelName,
        task: normalizedRequest.task,
        usage,
        finishReason: response.stop_reason || 'stop',
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
