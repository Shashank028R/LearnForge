import React from 'react';
import { Badge, Button, Icon } from '../ui';

const VERDICT_CONFIG = {
  CORRECT: {
    variant: 'success',
    label: 'Demonstrated Understanding (Correct)',
    bg: 'bg-status-success-bg border-status-success/30 text-status-success-text',
    icon: 'check',
  },
  PARTIALLY_CORRECT: {
    variant: 'warning',
    label: 'Incomplete Reasoning (Partially Correct)',
    bg: 'bg-status-warning-bg border-status-warning/30 text-status-warning-text',
    icon: 'alert',
  },
  INCORRECT: {
    variant: 'danger',
    label: 'Needs Conceptual Review (Incorrect)',
    bg: 'bg-status-danger-bg border-status-danger/30 text-status-danger-text',
    icon: 'alert',
  },
  UNCERTAIN: {
    variant: 'neutral',
    label: 'Evaluation Inconclusive',
    bg: 'bg-app-surface-muted border-app-border text-app-text-secondary',
    icon: 'info',
  },
};

export function EvaluationCard({
  evaluation,
  userAnswer,
  canAdvance = false,
  onContinue,
  isContinuing = false,
}) {
  if (!evaluation) return null;

  const config = VERDICT_CONFIG[evaluation.verdict] || VERDICT_CONFIG.UNCERTAIN;

  return (
    <section
      className="bg-app-surface border border-app-border rounded-lg p-5 shadow-sm space-y-4"
      aria-labelledby="evaluation-heading"
    >
      {/* Verdict Header Banner */}
      <div
        className={`flex items-center justify-between p-3.5 rounded-md border ${config.bg}`}
      >
        <div className="flex items-center gap-2.5">
          <Icon name={config.icon} size={18} />
          <h3 id="evaluation-heading" className="text-sm font-semibold">
            {config.label}
          </h3>
        </div>

        {/* Multi-Criteria Metrics (Quiet & Informative) */}
        <div className="flex items-center gap-3 text-xs font-mono font-medium">
          {evaluation.correctness !== undefined && (
            <span>Correct: {Math.round(evaluation.correctness)}%</span>
          )}
          {evaluation.completeness !== undefined && (
            <span>Complete: {Math.round(evaluation.completeness)}%</span>
          )}
        </div>
      </div>

      {/* Submitted Answer Recap */}
      {userAnswer && (
        <div className="bg-app-surface-muted/50 rounded-md p-3 border border-app-border-subtle text-xs text-app-text-secondary space-y-1">
          <span className="font-semibold text-app-text-muted uppercase tracking-wider text-[10px]">
            Your Submitted Explanation:
          </span>
          <p className="italic leading-relaxed whitespace-pre-wrap">{userAnswer}</p>
        </div>
      )}

      {/* Primary Pedagogical Feedback */}
      {evaluation.feedback && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-app-text-muted">
            Tutor Analysis:
          </h4>
          <p className="text-sm text-app-text-primary leading-relaxed">
            {evaluation.feedback}
          </p>
        </div>
      )}

      {/* Strengths & Weaknesses Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
        {evaluation.strengths?.length > 0 && (
          <div className="bg-app-surface-muted/30 border border-app-border-subtle rounded p-3 space-y-1.5">
            <span className="text-xs font-semibold text-status-success flex items-center gap-1">
              <Icon name="check" size={12} />
              Key Strengths:
            </span>
            <ul className="list-disc pl-4 space-y-1 text-xs text-app-text-secondary">
              {evaluation.strengths.map((str, i) => (
                <li key={i}>{str}</li>
              ))}
            </ul>
          </div>
        )}

        {evaluation.weaknesses?.length > 0 && (
          <div className="bg-app-surface-muted/30 border border-app-border-subtle rounded p-3 space-y-1.5">
            <span className="text-xs font-semibold text-status-warning flex items-center gap-1">
              <Icon name="alert" size={12} />
              Areas for Improvement:
            </span>
            <ul className="list-disc pl-4 space-y-1 text-xs text-app-text-secondary">
              {evaluation.weaknesses.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Missing Concepts or Misconceptions */}
      {(evaluation.missingConcepts?.length > 0 || evaluation.misconceptionSummary) && (
        <div className="bg-status-danger-bg/50 border border-status-danger/20 rounded p-3 space-y-2 text-xs">
          {evaluation.misconceptionSummary && (
            <div className="space-y-0.5">
              <span className="font-semibold text-status-danger-text">
                Misconception Detected:
              </span>
              <p className="text-status-danger-text/90">
                {evaluation.misconceptionSummary}
              </p>
            </div>
          )}
          {evaluation.missingConcepts?.length > 0 && (
            <div>
              <span className="font-semibold text-status-danger-text">
                Unaddressed Concepts:
              </span>{' '}
              <span className="text-status-danger-text/90">
                {evaluation.missingConcepts.join(', ')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Continue Action Button (when advancing) */}
      {canAdvance && (
        <div className="pt-3 border-t border-app-border-subtle flex justify-end">
          <Button
            variant="primary"
            onClick={onContinue}
            disabled={isContinuing}
            aria-label="Continue to next question"
          >
            {isContinuing ? (
              <span className="flex items-center gap-2">
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Advancing...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                Continue to Next Question
                <Icon name="chevron-right" size={14} />
              </span>
            )}
          </Button>
        </div>
      )}
    </section>
  );
}

export default EvaluationCard;
