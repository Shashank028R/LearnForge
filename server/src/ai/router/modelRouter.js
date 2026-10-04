import { AI_TASK_TYPES } from '../schemas/tasks.js';
import { AIAllProvidersFailedError } from '../errors/aiErrors.js';

/**
 * Task-Based Automatic Model Router (Phase 05)
 */
export class ModelRouter {
  constructor(providers = {}, options = {}) {
    this.providers = providers; // Map of name -> BaseProvider instance
    this.priorityOrder = options.priorityOrder || ['gemini', 'openai', 'anthropic'];

    // Default task-to-provider preferences based on explicit capability configuration
    this.taskPreferences = {
      [AI_TASK_TYPES.GENERAL_CHAT]: ['gemini', 'openai', 'anthropic'],
      [AI_TASK_TYPES.PEDAGOGICAL_EXPLANATION]: ['openai', 'anthropic', 'gemini'],
      [AI_TASK_TYPES.SYLLABUS_GENERATION]: ['anthropic', 'openai', 'gemini'],
      [AI_TASK_TYPES.KNOWLEDGE_RELEVANCE_CLASSIFICATION]: ['gemini', 'openai', 'anthropic'],
      ...(options.taskPreferences || {}),
    };
  }

  /**
   * Evaluates available providers and selects the optimal deterministic route
   */
  selectRoute(task, options = {}) {
    const { preferredProvider, excludeProviders = [], requestId = 'unknown' } = options;

    // 1. If explicit preferred provider is requested and healthy/configured, use it
    if (preferredProvider && this.providers[preferredProvider]) {
      const provider = this.providers[preferredProvider];
      if (provider.isConfigured() && !excludeProviders.includes(preferredProvider)) {
        const health = provider.getHealth();
        if (health.status !== 'degraded') {
          return {
            provider,
            providerName: preferredProvider,
            model: provider.config.model,
            task,
            reason: 'preferred_override',
            requestId,
          };
        }
      }
    }

    // 2. Select preference chain for this specific task
    const candidateNames = this.taskPreferences[task] || this.priorityOrder;

    for (const name of candidateNames) {
      if (excludeProviders.includes(name)) continue;

      const provider = this.providers[name];
      if (!provider || !provider.isConfigured()) continue;

      const health = provider.getHealth();
      if (health.status === 'degraded') continue;

      return {
        provider,
        providerName: name,
        model: provider.config.model,
        task,
        reason: `task_policy_${task}`,
        requestId,
      };
    }

    // 3. Fallback: try any configured provider not excluded (even if degraded)
    for (const name of this.priorityOrder) {
      if (excludeProviders.includes(name)) continue;
      const provider = this.providers[name];
      if (provider && provider.isConfigured()) {
        return {
          provider,
          providerName: name,
          model: provider.config.model,
          task,
          reason: 'fallback_configured',
          requestId,
        };
      }
    }

    // 4. No configured provider available
    throw new AIAllProvidersFailedError(
      'No configured and healthy AI provider is currently available to fulfill the request. Configure GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.',
      { requestId }
    );
  }

  getAvailableProviders() {
    const list = {};
    for (const [name, provider] of Object.entries(this.providers)) {
      list[name] = {
        isConfigured: provider.isConfigured(),
        health: provider.getHealth(),
        model: provider.config.model,
      };
    }
    return list;
  }
}
