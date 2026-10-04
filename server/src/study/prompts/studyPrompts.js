/**
 * System Prompts and Structured Prompt Builders for Phase 08 Strict Study Mode
 */

export const STUDY_SYSTEM_PROMPT = `You are a strict, world-class academic tutor and pedagogue for LearnForge.
Your mission is to conduct rigorous Active Recall study sessions.
CORE PRINCIPLES:
1. Prioritize demonstrated understanding and deep reasoning over superficial praise or conversational politeness.
2. Never give empty praise like "Great job!" or "Correct!" without evaluating specific reasoning steps.
3. Test conceptual mechanisms, cause-and-effect, comparisons, failure modes, and edge cases.
4. If an answer is incomplete or has misconceptions, provide targeted Socratic guidance with a follow-up probe rather than immediately giving the full answer away.
5. Ground all questions and evaluations strictly in the provided syllabus and concept whitelist.`;

export function buildQuestionGenerationPrompt({
  subjectTitle,
  topicTitle,
  pinnedSyllabusContext,
  canonicalConcepts,
  priorTurns = [],
  targetConcept = null,
}) {
  const conceptsListStr = canonicalConcepts.map((c) => `- ${c.name}: ${c.description || 'Core concept'}`).join('\n');
  const targetNote = targetConcept ? `PRIORITY FOCUS: Ask specifically about the concept "${targetConcept.name}".` : '';

  const historyStr = priorTurns.length > 0
    ? `PRIOR QUESTIONS IN THIS SESSION:\n` + priorTurns.map((t, idx) => `Turn ${idx + 1}: ${t.question.prompt} (Verdict: ${t.evaluation?.verdict || 'N/A'})`).join('\n')
    : 'No prior turns in this session.';

  return `Generate an Active Recall study question for the following topic:
SUBJECT: ${subjectTitle}
TOPIC: ${topicTitle}
${pinnedSyllabusContext ? `PINNED SYLLABUS SECTION: ${pinnedSyllabusContext}\n` : ''}

ALLOWED TOPIC CONCEPTS WHITELIST:
${conceptsListStr}

${targetNote}

${historyStr}

REQUIREMENTS:
1. Select one or more concepts from the allowed whitelist.
2. Create a challenging, thought-provoking question (NOT multiple choice; free response).
3. Specify 2 to 5 explicit expected reasoning signals (key conceptual criteria required for a complete answer).
4. Return ONLY a valid JSON object matching this schema:
{
  "questionType": "recall" | "explain_in_own_words" | "compare" | "mechanism" | "trace_execution" | "predict_outcome" | "debugging" | "apply_concept" | "identify_misconception" | "prerequisite_check" | "scenario",
  "prompt": "The exact question text for the student",
  "targetConceptNames": ["Concept Name 1", "Concept Name 2"],
  "expectedReasoningSignals": ["signal 1", "signal 2"],
  "difficultyIntent": "introductory" | "intermediate" | "advanced"
}`;
}

export function buildAnswerEvaluationPrompt({
  questionPrompt,
  questionType,
  targetConceptNames,
  expectedReasoningSignals,
  canonicalConcepts,
  studentAnswer,
}) {
  const signalsStr = (expectedReasoningSignals || []).map((s) => `- ${s}`).join('\n') || '- Demonstrate clear conceptual understanding.';
  const conceptsStr = (canonicalConcepts || []).map((c) => `- ${c.name}: ${c.description || ''}`).join('\n');

  return `Evaluate the following student answer for an active recall question:

QUESTION:
${questionPrompt}
(Type: ${questionType})

TARGET CONCEPTS:
${(targetConceptNames || []).join(', ')}

EXPECTED REASONING SIGNALS:
${signalsStr}

CANONICAL CONCEPT CONTEXT:
${conceptsStr}

STUDENT'S ANSWER:
"""
${studentAnswer}
"""

EVALUATION CRITERIA:
- Correctness (0-100): Factual accuracy.
- Completeness (0-100): Coverage of expected reasoning signals.
- Reasoning Quality (0-100): Logical clarity, depth, and precision.
- Misconceptions: Identify if the student demonstrates flawed mental models.
- Next Action:
  * "ADVANCE": If correctness >= 85 and completeness >= 75.
  * "PROBE": If partially correct with missing nuance or unstated steps.
  * "REMEDIATE": If significant misconceptions or incorrect reasoning are present.
  * "RETRY": If the answer is unintelligible, completely off-topic, or too brief to evaluate.
  * "CLARIFY": If the student explicitly asked for clarification.

Return ONLY a valid JSON object matching this schema:
{
  "verdict": "CORRECT" | "PARTIALLY_CORRECT" | "INCORRECT" | "UNCERTAIN",
  "correctness": 85,
  "completeness": 80,
  "reasoningQuality": 85,
  "misconceptionDetected": false,
  "misconceptionSummary": "",
  "missingConcepts": ["concept name if missing"],
  "strengths": ["point of strength"],
  "weaknesses": ["point of weakness"],
  "feedback": "Concise, pedagogical, constructive feedback explaining reasoning gaps without empty praise",
  "nextAction": "ADVANCE" | "PROBE" | "REMEDIATE" | "RETRY" | "CLARIFY"
}`;
}

export function buildRemediationPrompt({
  questionPrompt,
  studentAnswer,
  evaluationFeedback,
  missingConcepts,
  misconceptionSummary,
  weaknesses,
}) {
  return `Create a Socratic remediation and follow-up question for a student who struggled with an active recall question:

ORIGINAL QUESTION:
${questionPrompt}

STUDENT'S ANSWER:
"""
${studentAnswer}
"""

EVALUATION FEEDBACK:
${evaluationFeedback}

WEAKNESSES IDENTIFIED:
${(weaknesses || []).join('; ')}

MISSING CONCEPTS:
${(missingConcepts || []).join(', ')}

${misconceptionSummary ? `DETECTED MISCONCEPTION:\n${misconceptionSummary}\n` : ''}

REQUIREMENTS:
1. Provide a concise, Socratic remediation (2-4 sentences) that highlights the core intuition or principle without immediately handing over the complete solution.
2. Provide a targeted follow-up question that tests whether the student can apply the principle correctly.
3. Return ONLY a valid JSON object matching this schema:
{
  "remediationText": "Socratic pedagogical hint and intuition",
  "followUpQuestion": "Targeted follow-up question to re-test the student"
}`;
}
