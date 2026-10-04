import { AI_TASK_TYPES } from '../../ai/schemas/tasks.js';
import { normalizeConceptName } from '../../models/Concept.js';

/**
 * Event Extractor (Phase 06)
 * Calls the AI Gateway or applies deterministic heuristic parsing to extract
 * candidate learning events and concept signals from a chat exchange.
 */
export class EventExtractor {
  constructor(aiGateway) {
    this.aiGateway = aiGateway;
    this.extractionVersion = 'v1.0';
  }

  /**
   * Extracts structured learning events from a user/assistant exchange
   */
  async extractExchangeEvents(params) {
    const {
      userMessage,
      assistantMessage,
      subjectContext,
      syllabusContext,
      topicContext,
      userId,
      requestId = 'unknown',
    } = params;

    const exchangePrompt = `[Exchange for Knowledge Extraction]
User Statement: "${userMessage.content}"
Assistant Pedagogical Response: "${assistantMessage.content}"`;

    let aiResult = null;
    let extractionSource = 'ai_gateway';

    try {
      if (this.aiGateway) {
        aiResult = await this.aiGateway.generate({
          task: AI_TASK_TYPES.KNOWLEDGE_EVENT_EXTRACTION,
          messages: [{ role: 'user', content: exchangePrompt }],
          userId,
          requestId,
          subjectContext,
          syllabusContext,
          topicContext,
          temperature: 0.1,
          maxTokens: 1000,
        });
      }
    } catch (err) {
      // AI Gateway failed or threw error - fallback to deterministic heuristic
      extractionSource = 'deterministic_fallback';
    }

    if (aiResult && aiResult.content) {
      try {
        const parsed = this._cleanAndParseJSON(aiResult.content);
        if (parsed && Array.isArray(parsed.events) && parsed.events.length > 0) {
          return {
            events: this._validateAndNormalizeEvents(parsed.events, topicContext),
            topicSummaryUpdate: parsed.topicSummaryUpdate || '',
            extractionSource,
            metadata: {
              provider: aiResult.metadata?.provider || 'unknown',
              model: aiResult.metadata?.model || 'unknown',
              latencyMs: aiResult.metadata?.latencyMs || 0,
              extractionVersion: this.extractionVersion,
            },
          };
        }
      } catch (parseErr) {
        // Fallback to deterministic extraction on invalid JSON
      }
    }

    // Deterministic Rule-Based Fallback Extractor
    return this._deterministicExtraction({
      userMessage,
      assistantMessage,
      topicContext,
      extractionVersion: this.extractionVersion,
    });
  }

  _cleanAndParseJSON(rawContent) {
    if (!rawContent || typeof rawContent !== 'string') return null;
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  }

  _validateAndNormalizeEvents(events, topicContext) {
    const normalized = [];
    const validEventTypes = [
      'concept_introduced',
      'concept_explained',
      'concept_recalled',
      'concept_misunderstood',
      'misconception_detected',
      'concept_corrected',
      'concept_reinforced',
      'concept_conflict',
      'learning_signal',
    ];
    const validOutcomes = ['NEW', 'EXISTING', 'DUPLICATE', 'COMPLEMENTARY', 'CORRECTION', 'CONFLICT'];

    for (const ev of events) {
      if (!ev || typeof ev !== 'object') continue;
      const conceptName = (ev.conceptName || (topicContext ? topicContext.title : 'General Concept')).trim();
      if (!conceptName) continue;

      const eventType = validEventTypes.includes(ev.eventType) ? ev.eventType : 'concept_explained';
      const classificationOutcome = validOutcomes.includes(ev.classificationOutcome) ? ev.classificationOutcome : 'EXISTING';
      const evidenceText = (ev.evidenceText || ev.conceptName || 'Chat evidence statement').trim().slice(0, 1000);

      const hasMisconception = ev.misconception && ev.misconception.hasMisconception;
      const misconception = hasMisconception
        ? {
            misconceptionText: (ev.misconception.misconceptionText || '').trim().slice(0, 500),
            correctionText: (ev.misconception.correctionText || '').trim().slice(0, 500),
            severity: ['low', 'medium', 'high'].includes(ev.misconception.severity) ? ev.misconception.severity : 'medium',
          }
        : { misconceptionText: '', correctionText: '', severity: null };

      normalized.push({
        conceptName,
        aliases: Array.isArray(ev.aliases) ? ev.aliases.map((a) => String(a).trim()).filter(Boolean) : [],
        eventType,
        classificationOutcome,
        evidenceText,
        suggestedStatus: ev.suggestedStatus || null,
        confidenceDelta: typeof ev.confidenceDelta === 'number' ? Math.max(0, Math.min(30, ev.confidenceDelta)) : 15,
        misconception,
      });
    }

    return normalized;
  }

  _deterministicExtraction({ userMessage, assistantMessage, topicContext, extractionVersion }) {
    const topicTitle = topicContext?.title || 'Core Topic Knowledge';
    const userText = userMessage.content || '';
    const assistantText = assistantMessage.content || '';

    // Check for misconception indicators in assistant response (e.g. "actually", "misconception", "not quite")
    const isMisconceptionCorrection =
      /misconception|not quite|incorrect|common mistake|actually,/i.test(assistantText) ||
      /i thought|is it true that/i.test(userText);

    const eventType = isMisconceptionCorrection ? 'concept_corrected' : 'concept_explained';
    const classificationOutcome = isMisconceptionCorrection ? 'CORRECTION' : 'EXISTING';

    return {
      events: [
        {
          conceptName: topicTitle,
          aliases: [],
          eventType,
          classificationOutcome,
          evidenceText: userText.slice(0, 300),
          suggestedStatus: isMisconceptionCorrection ? 'LEARNING' : 'INTRODUCED',
          confidenceDelta: isMisconceptionCorrection ? 10 : 15,
          misconception: isMisconceptionCorrection
            ? {
                misconceptionText: userText.slice(0, 300),
                correctionText: assistantText.slice(0, 300),
                severity: 'medium',
              }
            : { misconceptionText: '', correctionText: '', severity: null },
        },
      ],
      topicSummaryUpdate: '',
      extractionSource: 'deterministic_rule',
      metadata: {
        provider: 'deterministic',
        model: 'heuristic-v1',
        latencyMs: 1,
        extractionVersion,
      },
    };
  }
}
