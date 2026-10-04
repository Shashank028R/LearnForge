import React from 'react';
import { Badge, Icon } from '../ui';

const QUESTION_TYPE_LABELS = {
  recall: 'Active Recall',
  explain_in_own_words: 'Explain in Own Words',
  compare: 'Conceptual Comparison',
  mechanism: 'Mechanism Analysis',
  trace_execution: 'Trace Execution',
  predict_outcome: 'Predict Outcome',
  debugging: 'Debugging & Invariants',
  apply_concept: 'Applied Problem',
  identify_misconception: 'Identify Misconception',
  prerequisite_check: 'Prerequisite Verification',
  scenario: 'Scenario Evaluation',
};

export function QuestionCard({ question, isFollowUp = false }) {
  if (!question) return null;

  const typeLabel = QUESTION_TYPE_LABELS[question.questionType] || question.questionType || 'Active Recall';

  return (
    <section
      className="bg-app-surface border border-app-border rounded-lg p-5 shadow-sm space-y-4"
      aria-labelledby="active-question-heading"
    >
      {/* Header Tags */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={isFollowUp ? 'warning' : 'primary'} size="sm">
            {isFollowUp ? 'Socratic Follow-Up' : 'Active Recall Question'}
          </Badge>
          <Badge variant="subtle" size="sm">
            {typeLabel}
          </Badge>
          {question.difficultyIntent && (
            <span className="text-xs text-app-text-muted capitalize">
              Level: {question.difficultyIntent}
            </span>
          )}
        </div>

        {/* Target Concepts */}
        {question.targetConceptNames?.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-app-text-muted">Target:</span>
            {question.targetConceptNames.map((name, idx) => (
              <span
                key={idx}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 border border-brand-200 dark:border-brand-800"
              >
                {name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Primary Prompt */}
      <div className="space-y-2">
        <h2
          id="active-question-heading"
          className="text-base font-semibold text-app-text-primary leading-relaxed"
        >
          {question.prompt}
        </h2>
      </div>

      {/* Expected Reasoning Signals Guidance (if available, quiet hint) */}
      {question.expectedReasoningSignals?.length > 0 && (
        <div className="pt-2 border-t border-app-border-subtle">
          <p className="text-xs font-medium text-app-text-muted mb-1.5 flex items-center gap-1">
            <Icon name="info" size={12} />
            Reasoning Criteria:
          </p>
          <ul className="space-y-1 pl-4 list-disc text-xs text-app-text-secondary leading-normal">
            {question.expectedReasoningSignals.map((signal, idx) => (
              <li key={idx}>{signal}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default QuestionCard;
