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
          maxTokens: 800,
        });
      }
    } catch (err) {
      // AI Gateway failed or threw error - fallback to deterministic heuristic
      if (!process.env.VITEST) {
        console.error('[EventExtractor AI Error]', err?.message || err);
      }
      extractionSource = 'deterministic_fallback';
    }

    // AIGateway returns normalized AIResponse: { text, provider, model, task, usage, routingMetadata, requestId, latencyMs }
    const rawText = aiResult?.text || aiResult?.content;

    if (rawText) {
      try {
        const parsed = this._cleanAndParseJSON(rawText);
        if (parsed && Array.isArray(parsed.events) && parsed.events.length > 0) {
          return {
            events: this._validateAndNormalizeEvents(parsed.events, topicContext, {
              userContent: userMessage?.content || '',
              assistantContent: assistantMessage?.content || '',
            }),
            topicSummaryUpdate: parsed.topicSummaryUpdate || '',
            extractionSource,
            metadata: {
              provider: aiResult.provider || aiResult.metadata?.provider || 'unknown',
              model: aiResult.model || aiResult.metadata?.model || 'unknown',
              latencyMs: aiResult.latencyMs || aiResult.metadata?.latencyMs || 0,
              usage: aiResult.usage || null,
              routingMetadata: aiResult.routingMetadata || null,
              extractionVersion: this.extractionVersion,
            },
          };
        } else {
          if (!process.env.VITEST) {
            console.error('[EventExtractor] Could not parse valid events from rawText. rawText was:\n', rawText);
          }
        }
      } catch (parseErr) {
        if (!process.env.VITEST) {
          console.error('[EventExtractor JSON Parse Error]', parseErr?.message || parseErr, 'RawText was:', rawText);
        }
      }
    } else {
      if (!process.env.VITEST) {
        console.error('[EventExtractor] rawText is empty or missing from AI response:', JSON.stringify(aiResult));
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
    let cleaned = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    cleaned = cleaned.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

    // 1. Full parse
    try {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (_) {}

    // 2. Greedy structural salvage of completed objects in "events" array
    try {
      const eventsMatch = cleaned.match(/"events"\s*:\s*\[([\s\S]*)/);
      if (eventsMatch) {
        const eventsPart = eventsMatch[1];
        const objects = [];
        let depth = 0;
        let inString = false;
        let escape = false;
        let currentObj = '';

        for (let i = 0; i < eventsPart.length; i++) {
          const char = eventsPart[i];
          if (escape) {
            escape = false;
            if (depth > 0) currentObj += char;
            continue;
          }
          if (char === '\\') {
            escape = true;
            if (depth > 0) currentObj += char;
            continue;
          }
          if (char === '"') {
            inString = !inString;
            if (depth > 0) currentObj += char;
            continue;
          }
          if (inString) {
            if (depth > 0) currentObj += char;
            continue;
          }

          if (char === '{') {
            depth++;
            currentObj += char;
          } else if (char === '}') {
            depth--;
            currentObj += char;
            if (depth === 0) {
              try {
                const parsedObj = JSON.parse(currentObj.trim());
                if (parsedObj && (parsedObj.conceptName || parsedObj.eventType)) {
                  objects.push(parsedObj);
                }
              } catch (_) {}
              currentObj = '';
            }
          } else if (depth > 0) {
            currentObj += char;
          } else if (char === ']') {
            break;
          }
        }

        if (objects.length > 0) {
          return { events: objects, topicSummaryUpdate: '' };
        }
      }
    } catch (_) {}

    return null;
  }

  _validateAndNormalizeEvents(events, topicContext, exchangeContext = null) {
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

    const userText = exchangeContext?.userContent || '';
    const hasUserMisconceptionFlag = /misconception|firmly believe|incorrectly believe|have a serious misconception/i.test(userText);
    const hasUserCorrectionFlag = /understand the correction|correcting my previous|correction for/i.test(userText);

    for (const ev of events) {
      if (!ev || typeof ev !== 'object') continue;
      const conceptName = (ev.conceptName || (topicContext ? topicContext.title : 'General Concept')).trim();
      if (!conceptName) continue;

      const evidenceText = (ev.evidenceText || ev.conceptName || 'Chat evidence statement').trim().slice(0, 1000);

      // Authoritative Classification Order:
      // 1. Explicit correction
      // 2. Explicit conflict
      // 3. Explicit misconception
      // 4. Normal learning event

      const isExplicitMisconceptionType =
        ev.eventType === 'misconception_detected' || ev.eventType === 'concept_misunderstood';

      const hasMisconceptionIndicators =
        isExplicitMisconceptionType ||
        ev.suggestedStatus === 'NEEDS_REVIEW' ||
        Boolean(ev.misconception?.hasMisconception) ||
        Boolean(ev.misconception?.misconceptionText) ||
        /misconception|misunderstood|incorrectly believe|firmly believe|confuse/i.test(evidenceText) ||
        hasUserMisconceptionFlag;

      const hasCorrectionIndicators =
        ev.eventType === 'concept_corrected' ||
        ev.classificationOutcome === 'CORRECTION' ||
        /understand the correction|correcting my previous|correction for|now understand that|now see the difference/i.test(evidenceText) ||
        hasUserCorrectionFlag;

      const isExplicitCorrection =
        hasCorrectionIndicators && !isExplicitMisconceptionType && !/firmly believe|incorrectly believe/i.test(evidenceText) && !hasUserMisconceptionFlag;

      const isExplicitConflict =
        !isExplicitCorrection &&
        (ev.eventType === 'concept_conflict' || ev.classificationOutcome === 'CONFLICT');

      const isExplicitMisconception =
        !isExplicitCorrection &&
        !isExplicitConflict &&
        hasMisconceptionIndicators;

      let eventType = validEventTypes.includes(ev.eventType) ? ev.eventType : 'concept_explained';
      let classificationOutcome = validOutcomes.includes(ev.classificationOutcome) ? ev.classificationOutcome : 'EXISTING';

      if (isExplicitCorrection) {
        eventType = 'concept_corrected';
        classificationOutcome = 'CORRECTION';
      } else if (isExplicitConflict) {
        eventType = 'concept_conflict';
        classificationOutcome = 'CONFLICT';
      } else if (isExplicitMisconception) {
        eventType = 'misconception_detected';
      }

      const misconceptionText = (ev.misconception?.misconceptionText || (isExplicitMisconception ? ev.evidenceText : '')).trim().slice(0, 500);
      const correctionText = (ev.misconception?.correctionText || '').trim().slice(0, 500);
      const severity = ['low', 'medium', 'high'].includes(ev.misconception?.severity)
        ? ev.misconception.severity
        : isExplicitMisconception
        ? 'medium'
        : null;

      const misconception =
        isExplicitMisconception || isExplicitCorrection || Boolean(misconceptionText) || Boolean(correctionText)
          ? {
              misconceptionText,
              correctionText,
              severity,
            }
          : { misconceptionText: '', correctionText: '', severity: null };

      normalized.push({
        conceptName,
        aliases: Array.isArray(ev.aliases) ? ev.aliases.map((a) => String(a).trim()).filter(Boolean) : [],
        eventType,
        classificationOutcome,
        evidenceText,
        suggestedStatus: isExplicitCorrection ? 'LEARNING' : isExplicitMisconception ? 'NEEDS_REVIEW' : ev.suggestedStatus || null,
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

    const isCorrection =
      /understand the correction|correcting my previous|correction for|now understand that|now see the difference/i.test(userText);

    const isMisconception =
      !isCorrection &&
      (/misconception|not quite|incorrect|common mistake|firmly believe|flawed premise|wrong/i.test(assistantText) ||
        /misconception|i believe that|i firmly believe|i thought that|is it true that/i.test(userText));

    let eventType = 'concept_explained';
    let classificationOutcome = 'EXISTING';
    let suggestedStatus = 'INTRODUCED';
    let confidenceDelta = 15;

    if (isCorrection) {
      eventType = 'concept_corrected';
      classificationOutcome = 'CORRECTION';
      suggestedStatus = 'LEARNING';
      confidenceDelta = 20;
    } else if (isMisconception) {
      eventType = 'misconception_detected';
      classificationOutcome = 'EXISTING';
      suggestedStatus = 'NEEDS_REVIEW';
      confidenceDelta = 0;
    }

    return {
      events: [
        {
          conceptName: topicTitle,
          aliases: [],
          eventType,
          classificationOutcome,
          evidenceText: userText.slice(0, 300),
          suggestedStatus,
          confidenceDelta,
          misconception: isMisconception
            ? {
                misconceptionText: userText.slice(0, 300),
                correctionText: assistantText.slice(0, 300),
                severity: 'medium',
              }
            : isCorrection
            ? {
                misconceptionText: 'Previous conceptual misunderstanding',
                correctionText: userText.slice(0, 300),
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
