import { validateAndNormalizeAIRequest } from '../schemas/aiRequest.js';
import { GeminiProvider } from '../providers/geminiProvider.js';
import { OpenAIProvider } from '../providers/openaiProvider.js';
import { GroqProvider } from '../providers/groqProvider.js';
import { ModelRouter } from '../router/modelRouter.js';
import { aiTelemetry } from '../telemetry/aiTelemetry.js';
import { AIAllProvidersFailedError, AIError } from '../errors/aiErrors.js';
import { config } from '../../config/env.js';

/**
 * Central AI Gateway (Phase 05)
 */
export class AIGateway {
  constructor(options = {}) {
    const aiConfig = config.ai || {};

    this.providers = {
      gemini: new GeminiProvider({ apiKey: aiConfig.geminiApiKey, model: aiConfig.geminiModel }),
      openai: new OpenAIProvider({ apiKey: aiConfig.openaiApiKey, model: aiConfig.openaiModel }),
      groq: new GroqProvider({ apiKey: aiConfig.groqApiKey, model: aiConfig.groqModel }),
      ...(options.customProviders || {}),
    };

    this.router = new ModelRouter(this.providers, {
      priorityOrder: aiConfig.defaultProviderPriority || ['gemini', 'openai', 'groq'],
      ...(options.routerOptions || {}),
    });

    this.maxRetries = typeof options.maxRetries === 'number' ? options.maxRetries : aiConfig.maxRetries || 2;
    this.telemetry = options.telemetry || aiTelemetry;
  }

  /**
   * Generates a normalized AI response for a requested task
   */
  async generate(rawRequest = {}) {
    const request = validateAndNormalizeAIRequest(rawRequest);
    const excludeProviders = [];
    let lastError = null;
    let attempts = 0;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      attempts += 1;
      let route = null;

      try {
        route = this.router.selectRoute(request.task, {
          preferredProvider: request.preferredProvider,
          excludeProviders,
          requestId: request.requestId,
        });
      } catch (routingErr) {
        if (lastError) throw lastError;
        throw routingErr;
      }

      const { provider, providerName, model, reason } = route;

      this.telemetry.recordRequest({
        task: request.task,
        provider: providerName,
        model,
        requestId: request.requestId,
      });

      const startTime = Date.now();

      try {
        const response = await provider.generate(request);
        const latencyMs = Date.now() - startTime;

        response.routingMetadata = {
          selectedProvider: providerName,
          selectedModel: model,
          reason,
          attempts,
        };

        this.telemetry.recordSuccess({
          task: request.task,
          provider: providerName,
          model,
          latencyMs,
          usage: response.usage,
          requestId: request.requestId,
        });

        return response;
      } catch (err) {
        const latencyMs = Date.now() - startTime;
        lastError = err instanceof AIError ? err : provider.normalizeError(err, request.requestId);

        const willRetry = lastError.isRetryable && attempt < this.maxRetries;

        this.telemetry.recordFailure({
          task: request.task,
          provider: providerName,
          error: lastError,
          latencyMs,
          requestId: request.requestId,
          attempt: attempt + 1,
          willRetry,
        });

        if (willRetry) {
          // Exclude failing provider and apply exponential jitter before next attempt
          excludeProviders.push(providerName);
          const backoff = Math.floor(Math.random() * 100) + 100 * (attempt + 1);
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }

        // Non-retryable error or exhausted retries
        throw lastError;
      }
    }

    throw lastError || new AIAllProvidersFailedError('AI generation failed after all attempts.', { requestId: request.requestId });
  }

  getHealth() {
    return {
      status: Object.values(this.providers).some((p) => p.isConfigured()) ? 'online' : 'unconfigured',
      providers: this.router.getAvailableProviders(),
      metrics: this.telemetry.getMetrics(),
    };
  }
}

// Export singleton instance initialized from environment configuration
export const aiGateway = new AIGateway();
