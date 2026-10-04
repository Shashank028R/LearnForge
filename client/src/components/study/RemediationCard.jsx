import React from 'react';
import { Button, Icon } from '../ui';

export function RemediationCard({
  remediation,
  onContinue,
  isContinuing = false,
}) {
  if (!remediation) return null;

  return (
    <section
      className="bg-app-surface border-2 border-status-warning/40 rounded-lg p-5 shadow-sm space-y-4"
      aria-labelledby="remediation-heading"
    >
      {/* Socratic Remediation Header */}
      <div className="flex items-center gap-2.5 text-status-warning-text pb-2 border-b border-app-border-subtle">
        <Icon name="alert" size={20} className="text-status-warning" />
        <div>
          <h3 id="remediation-heading" className="text-sm font-bold text-app-text-primary">
            Socratic Remediation & Deepening
          </h3>
          <p className="text-xs text-app-text-muted">
            Let's clarify the mechanism before moving forward.
          </p>
        </div>
      </div>

      {/* Tutor Explanation / Conceptual Hint */}
      {remediation.remediationText && (
        <div className="space-y-1.5 bg-status-warning-bg/40 border border-status-warning/20 rounded p-3.5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-status-warning-text">
            Tutor Guidance:
          </h4>
          <p className="text-sm text-app-text-primary leading-relaxed">
            {remediation.remediationText}
          </p>
        </div>
      )}

      {/* Target Follow-Up Question Preview */}
      {remediation.followUpQuestion && (
        <div className="space-y-1.5 pt-1">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400 flex items-center gap-1.5">
            <Icon name="info" size={14} />
            Target Follow-Up Probe:
          </h4>
          <p className="text-sm font-semibold text-app-text-primary italic bg-app-surface-muted/60 p-3 rounded border border-app-border-subtle">
            "{remediation.followUpQuestion}"
          </p>
        </div>
      )}

      {/* Action to proceed to RECHECKING */}
      <div className="pt-2 flex justify-end">
        <Button
          variant="primary"
          onClick={onContinue}
          disabled={isContinuing}
          aria-label="Answer follow-up question"
        >
          {isContinuing ? (
            <span className="flex items-center gap-2">
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Loading Follow-Up...
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              Answer Follow-Up Question
              <Icon name="chevron-right" size={14} />
            </span>
          )}
        </Button>
      </div>
    </section>
  );
}

export default RemediationCard;
