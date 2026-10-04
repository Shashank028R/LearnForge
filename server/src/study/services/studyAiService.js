import crypto from 'crypto';
import { aiGateway } from '../../ai/index.js';
import { AI_TASK_TYPES } from '../../ai/schemas/tasks.js';
import {
  STUDY_SYSTEM_PROMPT,
  buildQuestionGenerationPrompt,
  buildAnswerEvaluationPrompt,
  buildRemediationPrompt,
} from '../prompts/studyPrompts.js';

export class StudyAiService {
  /**
   * Generates a structured active recall question grounded in canonical concepts.
   */
  async generateQuestion({
    subjectTitle,
    topicTitle,
    pinnedSyllabusContext = null,
    canonicalConcepts = [],
    priorTurns = [],
    targetConcept = null,
    requestId = crypto.randomUUID(),
  }) {
    // 1. If no canonical concepts exist, construct a baseline topic-level concept
    const safeConcepts = canonicalConcepts.length > 0
      ? canonicalConcepts
      : [{ _id: null, name: topicTitle, description: `Core concepts of ${topicTitle}` }];

    try {
      const userPrompt = buildQuestionGenerationPrompt({
        subjectTitle,
        topicTitle,
        pinnedSyllabusContext,
        canonicalConcepts: safeConcepts,
        priorTurns,
        targetConcept,
      });

      const response = await aiGateway.generate({
        task: AI_TASK_TYPES.STUDY_QUESTION_GENERATION,
        prompt: userPrompt,
        systemPrompt: STUDY_SYSTEM_PROMPT,
        temperature: 0.3,
        requestId,
      });

      const parsed = this._parseStructuredOutput(response.text);
      if (parsed && parsed.prompt && typeof parsed.prompt === 'string') {
        const validatedQuestion = this._validateAndNormalizeQuestion(parsed, safeConcepts, targetConcept);
        return {
          ...validatedQuestion,
          questionId: crypto.randomUUID(),
          generatedAt: new Date(),
          provenance: {
            provider: response.metadata?.provider || 'ai',
            model: response.metadata?.model || 'unknown',
            latencyMs: response.metadata?.latencyMs || 0,
            requestId,
            source: 'ai',
          },
        };
      }
    } catch (error) {
      console.warn(`[StudyAiService] Question generation AI fallback triggered: ${error.message}`);
    }

    // Deterministic rule-based fallback
    return this._buildDeterministicQuestion(safeConcepts, topicTitle, targetConcept, requestId);
  }

  /**
   * Evaluates a student's answer using multi-criteria pedagogical analysis.
   */
  async evaluateAnswer({
    question,
    studentAnswer,
    canonicalConcepts = [],
    requestId = crypto.randomUUID(),
  }) {
    try {
      const userPrompt = buildAnswerEvaluationPrompt({
        questionPrompt: question.prompt,
        questionType: question.questionType,
        targetConceptNames: question.targetConceptNames,
        expectedReasoningSignals: question.expectedReasoningSignals,
        canonicalConcepts,
        studentAnswer,
      });

      const response = await aiGateway.generate({
        task: AI_TASK_TYPES.STUDY_ANSWER_EVALUATION,
        prompt: userPrompt,
        systemPrompt: STUDY_SYSTEM_PROMPT,
        temperature: 0.1,
        requestId,
      });

      const parsed = this._parseStructuredOutput(response.text);
      if (parsed && (parsed.verdict || parsed.correctness !== undefined)) {
        const validatedEval = this._validateAndNormalizeEvaluation(parsed);
        return {
          ...validatedEval,
          evaluatedAt: new Date(),
          provenance: {
            provider: response.metadata?.provider || 'ai',
            model: response.metadata?.model || 'unknown',
            latencyMs: response.metadata?.latencyMs || 0,
            requestId,
            source: 'ai',
          },
        };
      }
    } catch (error) {
      console.warn(`[StudyAiService] Answer evaluation AI fallback triggered: ${error.message}`);
    }

    // Deterministic signal-matching fallback
    return this._buildDeterministicEvaluation(question, studentAnswer, requestId);
  }

  /**
   * Generates a Socratic remediation and follow-up question.
   */
  async generateRemediation({
    question,
    studentAnswer,
    evaluation,
    requestId = crypto.randomUUID(),
  }) {
    try {
      const userPrompt = buildRemediationPrompt({
        questionPrompt: question.prompt,
        studentAnswer,
        evaluationFeedback: evaluation.feedback,
        missingConcepts: evaluation.missingConcepts,
        misconceptionSummary: evaluation.misconceptionSummary,
        weaknesses: evaluation.weaknesses,
      });

      const response = await aiGateway.generate({
        task: AI_TASK_TYPES.STUDY_REMEDIATION,
        prompt: userPrompt,
        systemPrompt: STUDY_SYSTEM_PROMPT,
        temperature: 0.3,
        requestId,
      });

      const parsed = this._parseStructuredOutput(response.text);
      if (parsed && parsed.remediationText && parsed.followUpQuestion) {
        return {
          remediationText: parsed.remediationText.trim(),
          followUpQuestion: parsed.followUpQuestion.trim(),
          remediatedAt: new Date(),
        };
      }
    } catch (error) {
      console.warn(`[StudyAiService] Remediation AI fallback triggered: ${error.message}`);
    }

    // Deterministic remediation fallback
    return this._buildDeterministicRemediation(question, evaluation);
  }

  // --- Helpers and Fallbacks ---

  _parseStructuredOutput(text) {
    if (!text || typeof text !== 'string') return null;
    try {
      return JSON.parse(text.trim());
    } catch {
      // Extract from markdown code block if wrapped in ```json ... ```
      const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match && match[1]) {
        try {
          return JSON.parse(match[1].trim());
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  _validateAndNormalizeQuestion(raw, canonicalConcepts, preferredConcept) {
    const validTypes = [
      'recall',
      'explain_in_own_words',
      'compare',
      'mechanism',
      'trace_execution',
      'predict_outcome',
      'debugging',
      'apply_concept',
      'identify_misconception',
      'prerequisite_check',
      'scenario',
    ];

    const questionType = validTypes.includes(raw.questionType) ? raw.questionType : 'mechanism';
    const prompt = (raw.prompt || '').trim();

    // Whitelist concept validation: map proposed names to canonical Concept IDs
    const matchedConceptIds = [];
    const matchedConceptNames = [];

    const rawConceptNames = Array.isArray(raw.targetConceptNames) ? raw.targetConceptNames : [];

    for (const cName of rawConceptNames) {
      if (typeof cName !== 'string') continue;
      const normalized = cName.trim().toLowerCase();
      const matched = canonicalConcepts.find(
        (c) => c.name.trim().toLowerCase() === normalized || (c.aliases || []).some((a) => a.trim().toLowerCase() === normalized)
      );
      if (matched && matched._id && !matchedConceptIds.includes(matched._id)) {
        matchedConceptIds.push(matched._id);
        matchedConceptNames.push(matched.name);
      }
    }

    // If no concepts matched due to AI hallucination, assign preferred or first canonical concept
    if (matchedConceptIds.length === 0 && canonicalConcepts.length > 0) {
      const fallbackConcept = preferredConcept || canonicalConcepts[0];
      if (fallbackConcept._id) {
        matchedConceptIds.push(fallbackConcept._id);
      }
      matchedConceptNames.push(fallbackConcept.name);
    }

    // Ground and validate expectedReasoningSignals against canonical concept evidence
    const canonicalTargetConcepts = canonicalConcepts.filter((c) =>
      matchedConceptIds.some((id) => id && c._id && id.toString() === c._id.toString())
    );

    let expectedReasoningSignals = Array.isArray(raw.expectedReasoningSignals)
      ? raw.expectedReasoningSignals
          .filter((s) => typeof s === 'string' && s.trim().length > 0)
          .map((s) => s.trim())
      : [];

    // If signals are missing or too generic, ground them in the canonical concept descriptions/evidence
    if (expectedReasoningSignals.length === 0) {
      if (canonicalTargetConcepts.length > 0) {
        expectedReasoningSignals = canonicalTargetConcepts.map((c) => {
          if (c.description && c.description.trim()) {
            return `Demonstrate understanding of ${c.name}: ${c.description.trim()}`;
          }
          return `Accurately explain the core operational mechanism of ${c.name}.`;
        });
      } else {
        expectedReasoningSignals = ['Accurately explain the primary mechanism and operational requirements.'];
      }
    }

    const difficultyIntent = ['introductory', 'intermediate', 'advanced'].includes(raw.difficultyIntent)
      ? raw.difficultyIntent
      : 'intermediate';

    return {
      questionType,
      prompt,
      targetConceptIds: matchedConceptIds,
      targetConceptNames: matchedConceptNames,
      expectedReasoningSignals,
      difficultyIntent,
      prerequisiteConceptIds: [],
    };
  }

  _validateAndNormalizeEvaluation(raw) {
    const validVerdicts = ['CORRECT', 'PARTIALLY_CORRECT', 'INCORRECT', 'UNCERTAIN'];
    const validActions = ['ADVANCE', 'PROBE', 'REMEDIATE', 'RETRY', 'CLARIFY'];

    const correctness = Math.max(0, Math.min(100, Number(raw.correctness) || 0));
    const completeness = Math.max(0, Math.min(100, Number(raw.completeness) || 0));
    const reasoningQuality = Math.max(0, Math.min(100, Number(raw.reasoningQuality) || 0));

    let verdict = validVerdicts.includes(raw.verdict) ? raw.verdict : null;
    if (!verdict) {
      if (correctness >= 80 && completeness >= 70) verdict = 'CORRECT';
      else if (correctness >= 45 || completeness >= 40) verdict = 'PARTIALLY_CORRECT';
      else verdict = 'INCORRECT';
    }

    let nextAction = validActions.includes(raw.nextAction) ? raw.nextAction : null;
    if (!nextAction) {
      if (verdict === 'CORRECT') nextAction = 'ADVANCE';
      else if (verdict === 'PARTIALLY_CORRECT') nextAction = 'PROBE';
      else nextAction = 'REMEDIATE';
    }

    return {
      verdict,
      correctness,
      completeness,
      reasoningQuality,
      misconceptionDetected: Boolean(raw.misconceptionDetected),
      misconceptionSummary: raw.misconceptionSummary ? String(raw.misconceptionSummary).trim() : '',
      missingConcepts: Array.isArray(raw.missingConcepts) ? raw.missingConcepts.map(String) : [],
      strengths: Array.isArray(raw.strengths) ? raw.strengths.map(String) : [],
      weaknesses: Array.isArray(raw.weaknesses) ? raw.weaknesses.map(String) : [],
      feedback: (raw.feedback || '').trim() || 'Evaluated reasoning against expected signals.',
      nextAction,
    };
  }

  _buildDeterministicQuestion(canonicalConcepts, topicTitle, targetConcept, requestId) {
    const concept = targetConcept || (canonicalConcepts.length > 0 ? canonicalConcepts[0] : null);
    const conceptName = concept?.name || topicTitle;

    return {
      questionId: crypto.randomUUID(),
      questionType: 'explain_in_own_words',
      prompt: `Explain the fundamental mechanism and role of "${conceptName}" within ${topicTitle} in your own words.`,
      targetConceptIds: concept?._id ? [concept._id] : [],
      targetConceptNames: [conceptName],
      expectedReasoningSignals: [
        `Define what ${conceptName} is.`,
        `Describe how ${conceptName} operates.`,
        `Explain why ${conceptName} is critical.`,
      ],
      difficultyIntent: 'intermediate',
      prerequisiteConceptIds: [],
      generatedAt: new Date(),
      provenance: {
        provider: 'deterministic',
        model: 'rule-based-v1',
        latencyMs: 0,
        requestId,
        source: 'deterministic_fallback',
      },
    };
  }

  _buildDeterministicEvaluation(question, studentAnswer, requestId) {
    const trimmed = (studentAnswer || '').trim().toLowerCase();
    const targetNames = (question.targetConceptNames || []).map((n) => n.toLowerCase());
    const signals = (question.expectedReasoningSignals || []).map((s) => s.toLowerCase());

    const mentionsTarget = targetNames.some((n) => trimmed.includes(n));
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

    let correctness = 30;
    let completeness = 20;
    let reasoningQuality = 30;
    let verdict = 'INCORRECT';
    let nextAction = 'REMEDIATE';

    if (wordCount >= 20 && mentionsTarget) {
      correctness = 85;
      completeness = 80;
      reasoningQuality = 80;
      verdict = 'CORRECT';
      nextAction = 'ADVANCE';
    } else if (wordCount >= 10 || mentionsTarget) {
      correctness = 55;
      completeness = 50;
      reasoningQuality = 50;
      verdict = 'PARTIALLY_CORRECT';
      nextAction = 'PROBE';
    }

    return {
      verdict,
      correctness,
      completeness,
      reasoningQuality,
      misconceptionDetected: false,
      misconceptionSummary: '',
      missingConcepts: mentionsTarget ? [] : targetNames,
      strengths: mentionsTarget ? ['Included relevant concept terminology.'] : [],
      weaknesses: wordCount < 20 ? ['Answer requires deeper explanation and structural completeness.'] : [],
      feedback: verdict === 'CORRECT'
        ? 'Your answer demonstrates accurate understanding of the core mechanism.'
        : 'Your explanation is missing key reasoning steps. Focus on how the components interact step-by-step.',
      nextAction,
      evaluatedAt: new Date(),
      provenance: {
        provider: 'deterministic',
        model: 'rule-based-v1',
        latencyMs: 0,
        requestId,
        source: 'deterministic_fallback',
      },
    };
  }

  _buildDeterministicRemediation(question, evaluation) {
    const conceptName = (question.targetConceptNames && question.targetConceptNames[0]) || 'this concept';
    return {
      remediationText: `Consider the fundamental purpose of ${conceptName}: think about what problem it solves and what state changes occur.`,
      followUpQuestion: `In 2-3 sentences, what is the single most important invariant or step in ${conceptName}?`,
      remediatedAt: new Date(),
    };
  }
}

export const studyAiService = new StudyAiService();
export default studyAiService;
