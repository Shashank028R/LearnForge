import { BaseProvider } from './baseProvider.js';
import { createNormalizedAIResponse } from '../schemas/aiResponse.js';
import { buildSystemPrompt } from '../prompts/promptRegistry.js';
import { GoogleGenAI } from '@google/genai';

/**
 * Google Gemini Provider Adapter (Phase 05)
 */
export class GeminiProvider extends BaseProvider {
  constructor(config = {}) {
    super('gemini', {
      apiKey: config.apiKey || process.env.GEMINI_API_KEY || '',
      model: config.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      ...config,
    });
    this.client = this.config.apiKey ? new GoogleGenAI({ apiKey: this.config.apiKey }) : null;
  }

  async generate(normalizedRequest) {
    if (!this.isConfigured()) {
      throw this.normalizeError(new Error('GEMINI_API_KEY is not configured.'), normalizedRequest.requestId);
    }

    const startTime = Date.now();
    try {
      const systemPrompt = buildSystemPrompt(normalizedRequest.task, normalizedRequest);
      const modelName = normalizedRequest.model || this.config.model || 'gemini-2.5-flash';

      // Convert messages to GenAI contents format
      const contents = (normalizedRequest.messages || []).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const client = this.client || new GoogleGenAI({ apiKey: this.config.apiKey });

      const response = await client.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: normalizedRequest.temperature,
          maxOutputTokens: normalizedRequest.maxTokens,
        },
      });

      const latencyMs = Date.now() - startTime;
      this.recordSuccess();

      let text = response.text || '';
      if (!text && response.candidates?.[0]?.content?.parts?.[0]?.text) {
        text = response.candidates[0].content.parts[0].text;
      }

      // If task is classification, attempt to parse JSON classification
      let classification = null;
      if (normalizedRequest.task === 'knowledge_relevance_classification') {
        try {
          const cleaned = text.replace(/```json\n?|```/g, '').trim();
          classification = JSON.parse(cleaned);
        } catch (_) {}
      }

      const usage = response.usageMetadata
        ? {
            promptTokens: response.usageMetadata.promptTokenCount || 0,
            completionTokens: response.usageMetadata.candidatesTokenCount || 0,
            totalTokens: response.usageMetadata.totalTokenCount || 0,
          }
        : null;

      return createNormalizedAIResponse({
        text,
        provider: this.name,
        model: modelName,
        task: normalizedRequest.task,
        usage,
        finishReason: response.candidates?.[0]?.finishReason || 'stop',
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
