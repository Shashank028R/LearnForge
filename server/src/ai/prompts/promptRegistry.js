import { AI_TASK_TYPES } from '../schemas/tasks.js';
import { GENERAL_LEARNING_PROMPT_V1 } from './generalLearningPrompt.js';
import { PEDAGOGICAL_EXPLANATION_PROMPT_V1 } from './pedagogicalExplanationPrompt.js';
import { SYLLABUS_GENERATION_PROMPT_V1 } from './syllabusGenerationPrompt.js';
import { KNOWLEDGE_RELEVANCE_CLASSIFICATION_PROMPT_V1 } from './knowledgeRelevanceClassificationPrompt.js';
import { KNOWLEDGE_EVENT_EXTRACTION_PROMPT_V1 } from './knowledgeEventExtractionPrompt.js';
import { NOTE_SYNTHESIS_PROMPT_V1 } from './noteSynthesisPrompt.js';

export const PROMPT_REGISTRY = {
  [AI_TASK_TYPES.GENERAL_CHAT]: GENERAL_LEARNING_PROMPT_V1,
  [AI_TASK_TYPES.PEDAGOGICAL_EXPLANATION]: PEDAGOGICAL_EXPLANATION_PROMPT_V1,
  [AI_TASK_TYPES.SYLLABUS_GENERATION]: SYLLABUS_GENERATION_PROMPT_V1,
  [AI_TASK_TYPES.KNOWLEDGE_RELEVANCE_CLASSIFICATION]: KNOWLEDGE_RELEVANCE_CLASSIFICATION_PROMPT_V1,
  [AI_TASK_TYPES.KNOWLEDGE_EVENT_EXTRACTION]: KNOWLEDGE_EVENT_EXTRACTION_PROMPT_V1,
  [AI_TASK_TYPES.NOTE_SYNTHESIS]: NOTE_SYNTHESIS_PROMPT_V1,
};

/**
 * Builds the complete system prompt including domain context boundaries
 */
export function buildSystemPrompt(task, request = {}) {
  const promptDef = PROMPT_REGISTRY[task] || GENERAL_LEARNING_PROMPT_V1;
  const sections = [promptDef.systemTemplate];

  if (request.systemPrompt) {
    sections.push(`\n[Additional Instructions]\n${request.systemPrompt}`);
  }

  // Domain Context: Subject Context
  if (request.subjectContext) {
    const { name, description, targetMasteryLevel } = request.subjectContext;
    sections.push(`
[Subject Context]
- Subject Name: ${name || 'General'}
${description ? `- Description: ${description}` : ''}
${targetMasteryLevel ? `- Target Mastery Level: ${targetMasteryLevel}` : ''}`);
  }

  // Domain Context: Authoritative Approved Syllabus (Active Only)
  if (request.syllabusContext) {
    const { version, title, sections: syllabusSections } = request.syllabusContext;
    const formattedSections = (syllabusSections || [])
      .map((s, sIdx) => {
        const topList = (s.topics || []).map((t) => `    * ${t.title}${t.description ? ` (${t.description})` : ''}`).join('\n');
        return `  ${sIdx + 1}. ${s.title}${s.description ? `: ${s.description}` : ''}\n${topList}`;
      })
      .join('\n');

    sections.push(`
[Authoritative Approved Syllabus v${version}: "${title}"]
${formattedSections || '  (No sections defined)'}`);
  }

  // Domain Context: Topic Context
  if (request.topicContext) {
    const { title, description } = request.topicContext;
    sections.push(`
[Current Focal Topic]
- Topic: ${title}
${description ? `- Focus Details: ${description}` : ''}`);
  }

  return sections.join('\n\n').trim();
}
