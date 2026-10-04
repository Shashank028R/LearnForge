import React, { useState } from 'react';
import { Button, Badge, Icon, Dialog } from '../ui';

const STATUS_BADGE_CONFIG = {
  ORIENTING: { variant: 'subtle', label: 'Orienting' },
  QUESTIONING: { variant: 'info', label: 'Active Question' },
  ANSWER_PENDING: { variant: 'warning', label: 'Submitting' },
  EVALUATING: { variant: 'warning', label: 'Evaluating...' },
  REMEDIATING: { variant: 'danger', label: 'Remediation Loop' },
  RECHECKING: { variant: 'info', label: 'Socratic Follow-Up' },
  ADVANCING: { variant: 'success', label: 'Ready to Advance' },
  PAUSED: { variant: 'neutral', label: 'Paused' },
  COMPLETED: { variant: 'success', label: 'Session Completed' },
  EXITED: { variant: 'neutral', label: 'Exited' },
};

export function StudyHeader({
  session,
  onPause,
  onResume,
  onExit,
  onToggleHistory,
  showHistory,
  pausing = false,
  resuming = false,
  exiting = false,
}) {
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);

  if (!session) return null;

  const statusConfig = STATUS_BADGE_CONFIG[session.status] || {
    variant: 'neutral',
    label: session.status,
  };

  const isPauseAllowed = ['QUESTIONING', 'REMEDIATING', 'RECHECKING'].includes(session.status);
  const isPaused = session.status === 'PAUSED';
  const isTerminal = ['COMPLETED', 'EXITED'].includes(session.status);
  const isEvaluating = session.status === 'EVALUATING' || session.status === 'ANSWER_PENDING';

  const handleConfirmExit = async () => {
    setIsExitConfirmOpen(false);
    if (onExit) {
      await onExit();
    }
  };

  return (
    <header className="bg-app-surface border border-app-border rounded-lg p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Topic & Metadata Context */}
        <div className="space-y-1">
          <div className="flex items-center flex-wrap gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
              Strict Study Mode
            </span>
            <Badge variant={statusConfig.variant} size="sm">
              {statusConfig.label}
            </Badge>
            {session.syllabusVersionNumber && (
              <Badge variant="subtle" size="sm">
                Syllabus v{session.syllabusVersionNumber} (Pinned)
              </Badge>
            )}
            <span className="text-xs text-app-text-muted font-mono">
              v{session.sessionVersion}
            </span>
          </div>
          <h1 className="text-lg font-bold text-app-text-primary tracking-tight">
            {session.title || 'Topic Study Session'}
          </h1>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* History Toggle */}
          <Button
            variant="secondary"
            size="sm"
            onClick={onToggleHistory}
            aria-pressed={showHistory}
            aria-label={`Toggle turn history (${session.turns?.length || 0})`}
          >
            <Icon name="history" size={14} className="mr-1.5" />
            History ({session.turns?.length || 0})
          </Button>

          {/* Pause Action */}
          {isPauseAllowed && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onPause}
              disabled={pausing || isEvaluating}
              aria-label="Pause study session"
            >
              <Icon name="pause" size={14} className="mr-1.5" />
              {pausing ? 'Pausing...' : 'Pause'}
            </Button>
          )}

          {/* Resume Action */}
          {isPaused && (
            <Button
              variant="primary"
              size="sm"
              onClick={onResume}
              disabled={resuming}
              aria-label="Resume study session"
            >
              <Icon name="play" size={14} className="mr-1.5" />
              {resuming ? 'Resuming...' : 'Resume'}
            </Button>
          )}

          {/* Exit Action */}
          {!isTerminal && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExitConfirmOpen(true)}
              disabled={exiting || isEvaluating}
              className="text-app-text-muted hover:text-status-danger"
              aria-label="Exit study session"
            >
              <Icon name="x" size={14} className="mr-1.5" />
              Exit
            </Button>
          )}
        </div>
      </div>

      {/* Exit Confirmation Dialog */}
      <Dialog
        isOpen={isExitConfirmOpen}
        onClose={() => setIsExitConfirmOpen(false)}
        title="Exit Study Session"
        description="Are you sure you want to exit this study session? Exited sessions are permanently sealed and cannot be resumed."
        confirmLabel="Exit Session"
        cancelLabel="Stay in Session"
        confirmVariant="danger"
        onConfirm={handleConfirmExit}
      />
    </header>
  );
}

export default StudyHeader;
