import {
  AIError,
  AIAuthenticationError,
  AIRateLimitedError,
  AITimeoutError,
  AIProviderUnavailableError,
  AIInvalidRequestError,
} from '../errors/aiErrors.js';

/**
 * Base AI Provider Adapter (Phase 05)
 */
export class BaseProvider {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    this.failureCount = 0;
    this.lastFailureAt = null;
    this.lastError = null;
    this.consecutiveSuccesses = 0;
  }

  isConfigured() {
    return Boolean(this.config.apiKey);
  }

  getHealth() {
    if (!this.isConfigured()) {
      return { status: 'unconfigured', failureCount: 0, lastFailureAt: null, lastError: 'API key not configured' };
    }
    if (this.failureCount >= 3) {
      return { status: 'degraded', failureCount: this.failureCount, lastFailureAt: this.lastFailureAt, lastError: this.lastError?.message };
    }
    return { status: 'healthy', failureCount: this.failureCount, lastFailureAt: this.lastFailureAt, lastError: null };
  }

  recordSuccess() {
    this.failureCount = 0;
    this.lastError = null;
    this.consecutiveSuccesses += 1;
  }

  recordFailure(err) {
    this.failureCount += 1;
    this.lastFailureAt = new Date();
    this.lastError = err;
    this.consecutiveSuccesses = 0;
  }

  /**
   * Abstract generate method to be implemented by concrete adapters
   */
  async generate(normalizedRequest) {
    throw new Error(`generate() not implemented for provider ${this.name}`);
  }

  /**
   * Normalizes low-level SDK/HTTP errors into standard AIError instances
   */
  normalizeError(error, requestId = 'unknown') {
    const msg = error?.message || 'Unknown provider error';
    const status = error?.status || error?.statusCode || error?.response?.status;
    const code = error?.code || error?.error?.code;

    // Authentication failures (401, 403, invalid_api_key)
    if (status === 401 || status === 403 || msg.includes('API key') || msg.includes('authentication') || msg.includes('unauthorized') || code === 'invalid_api_key') {
      return new AIAuthenticationError(`Authentication failed for provider ${this.name}: ${msg}`, {
        provider: this.name,
        requestId,
        cause: error,
      });
    }

    // Quota exhausted / billing failure (non-retryable)
    if (msg.includes('no credits remaining') || msg.includes('insufficient_quota') || msg.includes('billing')) {
      return new AIRateLimitedError(`Quota exhausted for provider ${this.name}: ${msg}`, {
        provider: this.name,
        requestId,
        isRetryable: false,
        cause: error,
      });
    }

    // Rate limits (429, RESOURCE_EXHAUSTED)
    if (status === 429 || code === 'rate_limit_exceeded' || msg.includes('rate limit') || msg.includes('RESOURCE_EXHAUSTED')) {
      return new AIRateLimitedError(`Rate limit exceeded for provider ${this.name}: ${msg}`, {
        provider: this.name,
        requestId,
        cause: error,
      });
    }

    // Timeouts
    if (code === 'ETIMEDOUT' || code === 'ECONNABORTED' || msg.includes('timeout') || msg.includes('timed out')) {
      return new AITimeoutError(`Request timed out for provider ${this.name}: ${msg}`, {
        provider: this.name,
        requestId,
        cause: error,
      });
    }

    // Bad requests / schema errors / model unavailable (400, 404)
    if (status === 400 || status === 404 || msg.includes('invalid_request') || msg.includes('bad request') || msg.includes('no longer available') || msg.includes('not found')) {
      return new AIInvalidRequestError(`Invalid request for provider ${this.name}: ${msg}`, {
        provider: this.name,
        requestId,
        cause: error,
      });
    }

    // Server errors (500, 502, 503, 504, UNAVAILABLE)
    return new AIProviderUnavailableError(`Provider ${this.name} error: ${msg}`, {
      provider: this.name,
      requestId,
      cause: error,
    });
  }
}
