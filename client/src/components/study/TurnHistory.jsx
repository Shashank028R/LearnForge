import React, { useState } from 'react';
import { Badge, Icon, IconButton } from '../ui';

const VERDICT_BADGES = {
  CORRECT: { variant: 'success', label: 'Correct' },
  PARTIALLY_CORRECT: { variant: 'warning', label: 'Partially Correct' },
  INCORRECT: { variant: 'danger', label: 'Incorrect' },
  UNCERTAIN: { variant: 'neutral', label: 'Uncertain' },
};

export function TurnHistory({ turns = [], onClose }) {
  const [expandedIndices, setExpandedIndices] = useState(new Set());

  const toggleTurn = (index) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (!turns || turns.length === 0) {
    return (
      <div className="bg-app-surface border border-app-border rounded-lg p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-app-border-subtle">
          <h3 className="text-sm font-semibold text-app-text-primary flex items-center gap-2">
            <Icon name="history" size={16} />
            Session History
          </h3>
          {onClose && (
            <IconButton
              name="x"
              size="sm"
              variant="ghost"
              onClick={onClose}
              aria-label="Close history"
            />
          )}
        </div>
        <p className="text-xs text-app-text-muted italic">
          No previous turns recorded in this session yet. Answer questions to build your active recall history.
        </p>
      </div>
    );
  }

  return (
    <section
      className="bg-app-surface border border-app-border rounded-lg p-5 shadow-sm space-y-4"
      aria-label="Study session turn history"
    >
      <div className="flex items-center justify-between pb-2 border-b border-app-border-subtle">
        <div className="flex items-center gap-2">
          <Icon name="history" size={16} className="text-app-text-secondary" />
          <h3 className="text-sm font-semibold text-app-text-primary">
            Session History ({turns.length} {turns.length === 1 ? 'Turn' : 'Turns'})
          </h3>
        </div>
        {onClose && (
          <IconButton
            name="x"
            size="sm"
            variant="ghost"
            onClick={onClose}
            aria-label="Close history panel"
          />
        )}
      </div>

      <div className="space-y-3">
        {turns.map((turn, idx) => {
          const isExpanded = expandedIndices.has(idx);
          const verdict = turn.evaluation?.verdict || 'UNCERTAIN';
          const verdictConfig = VERDICT_BADGES[verdict] || VERDICT_BADGES.UNCERTAIN;
          const isFollowUp = turn.attemptType === 'FOLLOW_UP';

          return (
            <div
              key={turn._id || turn.clientTurnId || idx}
              className="border border-app-border rounded-md overflow-hidden transition-colors"
            >
              {/* Header Toggle */}
              <button
                type="button"
                onClick={() => toggleTurn(idx)}
                className="w-full text-left p-3 bg-app-surface-muted/30 hover:bg-app-surface-hover flex items-center justify-between gap-3 focus:outline-none focus:ring-1 focus:ring-brand-500"
                aria-expanded={isExpanded}
              >
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="font-mono text-app-text-muted font-medium">
                    #{idx + 1}
                  </span>
                  <Badge variant={isFollowUp ? 'warning' : 'subtle'} size="sm">
                    {isFollowUp ? 'Follow-Up' : 'Initial Attempt'}
                  </Badge>
                  <span className="font-medium text-app-text-primary truncate max-w-[280px] sm:max-w-md">
                    {turn.question?.prompt}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant={verdictConfig.variant} size="sm">
                    {verdictConfig.label}
                  </Badge>
                  <Icon
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    className="text-app-text-muted"
                  />
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="p-4 bg-app-surface space-y-3 border-t border-app-border-subtle text-xs">
                  {/* Question Prompt */}
                  <div>
                    <span className="font-semibold text-app-text-muted uppercase tracking-wider text-[10px]">
                      Prompt:
                    </span>
                    <p className="text-app-text-primary mt-0.5 leading-relaxed">
                      {turn.question?.prompt}
                    </p>
                  </div>

                  {/* Student Answer */}
                  <div className="bg-app-surface-muted/60 p-3 rounded border border-app-border-subtle">
                    <span className="font-semibold text-app-text-muted uppercase tracking-wider text-[10px]">
                      Your Answer:
                    </span>
                    <p className="text-app-text-primary mt-1 italic whitespace-pre-wrap leading-relaxed">
                      {turn.userAnswer}
                    </p>
                  </div>

                  {/* Tutor Feedback */}
                  {turn.evaluation?.feedback && (
                    <div>
                      <span className="font-semibold text-app-text-muted uppercase tracking-wider text-[10px]">
                        Tutor Feedback:
                      </span>
                      <p className="text-app-text-secondary mt-0.5 leading-relaxed">
                        {turn.evaluation.feedback}
                      </p>
                    </div>
                  )}

                  {/* Remediation Note (if any) */}
                  {turn.remediation?.remediationText && (
                    <div className="bg-status-warning-bg/40 border border-status-warning/20 p-2.5 rounded text-status-warning-text">
                      <span className="font-semibold uppercase tracking-wider text-[10px]">
                        Socratic Guidance Given:
                      </span>
                      <p className="mt-0.5 text-app-text-primary leading-relaxed">
                        {turn.remediation.remediationText}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default TurnHistory;
