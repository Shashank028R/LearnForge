/**
 * AI Gateway Telemetry & Observability (Phase 05)
 * Logs structured metrics without leaking secrets or full user conversations.
 */

export class AITelemetry {
  constructor() {
    this.metrics = {
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      byProvider: {},
      byTask: {},
    };
  }

  recordRequest({ task, provider, model, requestId }) {
    this.metrics.totalRequests += 1;
    this._ensureBucket(provider, task);
    this.metrics.byProvider[provider].requests += 1;
    this.metrics.byTask[task].requests += 1;

    console.log(`[AI Gateway Request] [${requestId}] task="${task}" provider="${provider}" model="${model}"`);
  }

  recordSuccess({ task, provider, model, latencyMs, usage, requestId }) {
    this.metrics.successCount += 1;
    this._ensureBucket(provider, task);
    this.metrics.byProvider[provider].successes += 1;
    this.metrics.byTask[task].successes += 1;

    const tokenSummary = usage ? `tokens=${usage.totalTokens} (p:${usage.promptTokens}/c:${usage.completionTokens})` : 'tokens=N/A';
    console.log(
      `[AI Gateway Success] [${requestId}] provider="${provider}" model="${model}" latency=${latencyMs}ms ${tokenSummary}`
    );
  }

  recordFailure({ task, provider, error, latencyMs, requestId, attempt, willRetry }) {
    this.metrics.failureCount += 1;
    if (provider) {
      this._ensureBucket(provider, task);
      this.metrics.byProvider[provider].failures += 1;
    }
    if (task) {
      this._ensureBucket(provider || 'unknown', task);
      this.metrics.byTask[task].failures += 1;
    }

    const safeMessage = error?.message ? error.message.slice(0, 300) : 'Unknown error';
    console.warn(
      `[AI Gateway Error] [${requestId}] provider="${provider || 'none'}" code="${error?.code || 'ERROR'}" attempt=${attempt} willRetry=${willRetry} latency=${latencyMs}ms message="${safeMessage}"`
    );
  }

  _ensureBucket(provider, task) {
    if (provider && !this.metrics.byProvider[provider]) {
      this.metrics.byProvider[provider] = { requests: 0, successes: 0, failures: 0 };
    }
    if (task && !this.metrics.byTask[task]) {
      this.metrics.byTask[task] = { requests: 0, successes: 0, failures: 0 };
    }
  }

  getMetrics() {
    return { ...this.metrics };
  }
}

export const aiTelemetry = new AITelemetry();
