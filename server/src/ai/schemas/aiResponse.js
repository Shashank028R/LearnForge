/**
 * Formats and normalizes provider output into standard AI Gateway response (Phase 05)
 */
export function createNormalizedAIResponse({
  text = '',
  provider = 'unknown',
  model = 'unknown',
  task = 'general_chat',
  usage = null,
  finishReason = 'stop',
  latencyMs = 0,
  requestId = 'unknown',
  routingMetadata = null,
  classification = null,
  rawPayload = null,
} = {}) {
  return {
    text: String(text || '').trim(),
    provider: String(provider).toLowerCase(),
    model: String(model),
    task: String(task),
    usage: usage
      ? {
          promptTokens: Number(usage.promptTokens || usage.inputTokens || 0),
          completionTokens: Number(usage.completionTokens || usage.outputTokens || 0),
          totalTokens: Number(usage.totalTokens || (usage.promptTokens || 0) + (usage.completionTokens || 0)),
        }
      : { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    finishReason: String(finishReason || 'stop'),
    latencyMs: Math.max(0, Math.round(latencyMs)),
    requestId: String(requestId),
    routingMetadata: routingMetadata || {
      selectedProvider: provider,
      selectedModel: model,
      reason: 'direct',
      attempts: 1,
    },
    classification: classification || null,
  };
}
