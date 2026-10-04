import React from 'react';
import { Button, Icon } from '../ui';

export function StudyExitedCard({ session, onNewSession, onReturnToTopics }) {
  return (
    <section
      className="bg-app-surface border border-app-border rounded-lg p-6 shadow-sm space-y-5 text-center"
      aria-labelledby="exited-title"
    >
      <div className="w-12 h-12 rounded-full bg-app-surface-muted text-app-text-muted flex items-center justify-center mx-auto">
        <Icon name="x" size={24} />
      </div>

      <div className="space-y-1.5 max-w-md mx-auto">
        <h2 id="exited-title" className="text-lg font-bold text-app-text-primary tracking-tight">
          Study Session Exited
        </h2>
        <p className="text-xs text-app-text-secondary leading-relaxed">
          This study session has been terminated and sealed. Its turn history is preserved for reference, but no further answers can be submitted.
        </p>
      </div>

      <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
        {onNewSession && (
          <Button
            variant="primary"
            onClick={onNewSession}
            aria-label="Start a new active recall study session"
          >
            <Icon name="play" size={14} className="mr-1.5" />
            Start New Session
          </Button>
        )}

        {onReturnToTopics && (
          <Button
            variant="secondary"
            onClick={onReturnToTopics}
            aria-label="Return to subjects and topics"
          >
            <Icon name="book" size={14} className="mr-1.5" />
            Browse Topics
          </Button>
        )}
      </div>
    </section>
  );
}

export default StudyExitedCard;
