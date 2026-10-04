/**
 * Normalized AI Gateway Error Hierarchy (Phase 05)
 */

export class AIError extends Error {
  constructor(message, { code = 'AI_ERROR', statusCode = 500, provider = null, isRetryable = false, requestId = 'unknown', cause = null } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.provider = provider;
    this.isRetryable = isRetryable;
    this.requestId = requestId;
    if (cause) this.cause = cause;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      provider: this.provider,
      isRetryable: this.isRetryable,
      requestId: this.requestId,
    };
  }
}

export class AIProviderUnavailableError extends AIError {
  constructor(message = 'The requested AI provider is currently unavailable.', options = {}) {
    super(message, {
      code: 'AI_PROVIDER_UNAVAILABLE',
      statusCode: 503,
      isRetryable: true,
      ...options,
    });
  }
}

export class AITimeoutError extends AIError {
  constructor(message = 'The AI request timed out before completing.', options = {}) {
    super(message, {
      code: 'AI_TIMEOUT',
      statusCode: 504,
      isRetryable: true,
      ...options,
    });
  }
}

export class AIAuthenticationError extends AIError {
  constructor(message = 'AI provider authentication failed. Check API credentials.', options = {}) {
    super(message, {
      code: 'AI_AUTHENTICATION_FAILED',
      statusCode: 500,
      isRetryable: false,
      ...options,
    });
  }
}

export class AIRateLimitedError extends AIError {
  constructor(message = 'The AI provider rate limit was exceeded. Please try again shortly.', options = {}) {
    super(message, {
      code: 'AI_RATE_LIMITED',
      statusCode: 429,
      isRetryable: true,
      ...options,
    });
  }
}

export class AIInvalidRequestError extends AIError {
  constructor(message = 'Invalid AI request parameters or prompt schema.', options = {}) {
    super(message, {
      code: 'AI_INVALID_REQUEST',
      statusCode: 400,
      isRetryable: false,
      ...options,
    });
  }
}

export class AIAllProvidersFailedError extends AIError {
  constructor(message = 'All configured AI providers failed or are unconfigured.', options = {}) {
    super(message, {
      code: 'AI_ALL_PROVIDERS_FAILED',
      statusCode: 503,
      isRetryable: false,
      ...options,
    });
  }
}
