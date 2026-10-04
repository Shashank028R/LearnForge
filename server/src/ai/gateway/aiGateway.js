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

    this.providers = options.customProviders
      ? { ...options.customProviders }
      : {
          gemini: new GeminiProvider({ apiKey: aiConfig.geminiApiKey, model: aiConfig.geminiModel }),
          openai: new OpenAIProvider({ apiKey: aiConfig.openaiApiKey, model: aiConfig.openaiModel }),
          groq: new GroqProvider({ apiKey: aiConfig.groqApiKey, model: aiConfig.groqModel }),
        };

    this.router = new ModelRouter(this.providers, {
      priorityOrder: aiConfig.defaultProviderPriority || ['gemini', 'openai', 'groq'],
      ...(options.routerOptions || {}),
    });

    this.maxRetries = typeof options.maxRetries === 'number' ? options.maxRetries : aiConfig.maxRetries || 2;
    this.telemetry = options.telemetry || aiTelemetry;
  }

  /**
   * Generates a normalized AI response for a requested task.
   * Implements bounded retries with exponential backoff and jitter per provider,
   * followed by fallback to subsequent healthy providers in the preference chain.
   */
  async generate(rawRequest = {}) {
    const request = validateAndNormalizeAIRequest(rawRequest);
    const excludeProviders = [];
    let lastError = null;
    let totalAttempts = 0;

    // Fallback Loop: Iterate through available providers in the task preference chain
    while (true) {
      let route = null;
      try {
        route = this.router.selectRoute(request.task, {
          preferredProvider: request.preferredProvider,
          excludeProviders,
          requestId: request.requestId,
        });
      } catch (routingErr) {
        // All configured providers have been exhausted
        if (lastError) throw lastError;
        throw routingErr;
      }

      const { provider, providerName, model, reason } = route;

      // Same-Provider Retry Loop: Bounded retry for transient failures on the currently selected provider
      for (let providerAttempt = 0; providerAttempt <= this.maxRetries; providerAttempt++) {
        totalAttempts += 1;

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
            attempts: totalAttempts,
            retries: providerAttempt,
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

          const willRetrySameProvider = lastError.isRetryable && providerAttempt < this.maxRetries;

          this.telemetry.recordFailure({
            task: request.task,
            provider: providerName,
            error: lastError,
            latencyMs,
            requestId: request.requestId,
            attempt: totalAttempts,
            willRetry: willRetrySameProvider,
          });

          if (willRetrySameProvider) {
            // RETRY: Apply bounded exponential backoff with jitter on the SAME provider
            const backoff = Math.min(1000, 100 * Math.pow(2, providerAttempt)) + Math.floor(Math.random() * 50);
            await new Promise((resolve) => setTimeout(resolve, backoff));
            continue; // Next attempt against the same provider
          }

          // Non-retryable error or retries exhausted for this provider
          break; // Exit same-provider retry loop to trigger fallback to next provider
        }
      }

      // FALLBACK: Retries exhausted or non-retryable error on this provider; exclude and select next provider
      excludeProviders.push(providerName);
    }
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
