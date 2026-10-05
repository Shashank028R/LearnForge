import { AI_TASK_TYPES, isValidTaskType } from './tasks.js';
import { AIInvalidRequestError } from '../errors/aiErrors.js';

/**
 * Validates and normalizes an incoming AI Gateway request
 */
export function validateAndNormalizeAIRequest(rawRequest = {}) {
  if (!rawRequest || typeof rawRequest !== 'object') {
    throw new AIInvalidRequestError('AI request must be a non-null object.');
  }

  const task = rawRequest.task || AI_TASK_TYPES.GENERAL_CHAT;
  if (!isValidTaskType(task)) {
    throw new AIInvalidRequestError(`Invalid AI task type: "${task}".`);
  }

  let rawMessages = Array.isArray(rawRequest.messages) ? [...rawRequest.messages] : [];
  if (rawMessages.length === 0 && rawRequest.prompt && typeof rawRequest.prompt === 'string' && rawRequest.prompt.trim()) {
    rawMessages = [{ role: 'user', content: rawRequest.prompt.trim() }];
  }

  if (rawMessages.length === 0 && !rawRequest.systemPrompt) {
    throw new AIInvalidRequestError('AI request must contain at least one message or prompt.');
  }

  const normalizedMessages = rawMessages.map((msg, idx) => {
    if (!msg || typeof msg !== 'object') {
      throw new AIInvalidRequestError(`Message at index ${idx} must be an object.`);
    }
    const role = ['user', 'assistant', 'system'].includes(msg.role) ? msg.role : 'user';
    const content = typeof msg.content === 'string' ? msg.content.trim() : '';
    if (!content) {
      throw new AIInvalidRequestError(`Message at index ${idx} has empty content.`);
    }
    return { role, content };
  });

  return {
    task,
    messages: normalizedMessages,
    systemPrompt: typeof rawRequest.systemPrompt === 'string' ? rawRequest.systemPrompt.trim() : '',
    subjectContext: rawRequest.subjectContext && typeof rawRequest.subjectContext === 'object'
      ? {
          id: rawRequest.subjectContext._id || rawRequest.subjectContext.id || null,
          name: String(rawRequest.subjectContext.name || '').trim(),
          description: String(rawRequest.subjectContext.description || '').trim(),
          targetMasteryLevel: String(rawRequest.subjectContext.targetMasteryLevel || 'comprehensive').trim(),
        }
      : null,
    syllabusContext: rawRequest.syllabusContext && typeof rawRequest.syllabusContext === 'object'
      ? {
          version: rawRequest.syllabusContext.version || 1,
          title: String(rawRequest.syllabusContext.title || '').trim(),
          sections: Array.isArray(rawRequest.syllabusContext.sections) ? rawRequest.syllabusContext.sections : [],
        }
      : null,
    topicContext: rawRequest.topicContext && typeof rawRequest.topicContext === 'object'
      ? {
          id: rawRequest.topicContext._id || rawRequest.topicContext.id || null,
          title: String(rawRequest.topicContext.title || '').trim(),
          description: String(rawRequest.topicContext.description || '').trim(),
          knowledgeState: rawRequest.topicContext.knowledgeState || null,
        }
      : null,
    temperature: typeof rawRequest.temperature === 'number' ? Math.max(0, Math.min(2, rawRequest.temperature)) : 0.7,
    maxTokens: typeof rawRequest.maxTokens === 'number' ? Math.max(1, Math.min(8192, rawRequest.maxTokens)) : 3000,
    timeoutMs: typeof rawRequest.timeoutMs === 'number' ? rawRequest.timeoutMs : 30000,
    metadata: rawRequest.metadata && typeof rawRequest.metadata === 'object' ? rawRequest.metadata : {},
    requestId: String(rawRequest.requestId || `ai_req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    preferredProvider: rawRequest.preferredProvider ? String(rawRequest.preferredProvider).toLowerCase() : null,
  };
}
