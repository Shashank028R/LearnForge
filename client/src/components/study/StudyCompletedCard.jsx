import React from 'react';
import { Button, Badge, Icon } from '../ui';

export function StudyCompletedCard({ session, onNewSession, onReturnToTopics }) {
  if (!session) return null;

  const metrics = session.metrics || {};

  return (
    <section
      className="bg-app-surface border border-status-success/30 rounded-lg p-6 shadow-sm space-y-6 text-center"
      aria-labelledby="completion-title"
    >
      <div className="w-12 h-12 rounded-full bg-status-success-bg text-status-success flex items-center justify-center mx-auto">
        <Icon name="check" size={24} />
      </div>

      <div className="space-y-1.5 max-w-md mx-auto">
        <h2 id="completion-title" className="text-xl font-bold text-app-text-primary tracking-tight">
          Topic Study Completed
        </h2>
        <p className="text-xs text-app-text-secondary leading-relaxed">
          You have successfully demonstrated understanding for all canonical concepts in this topic's approved curriculum.
        </p>
      </div>

      {/* Genuine Session-Local Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto pt-2">
        <div className="bg-app-surface-muted/40 border border-app-border rounded-lg p-3 text-center">
          <span className="text-xs text-app-text-muted">Questions</span>
          <p className="text-lg font-bold text-app-text-primary font-mono mt-0.5">
            {metrics.totalQuestionsAsked || 0}
          </p>
        </div>

        <div className="bg-app-surface-muted/40 border border-app-border rounded-lg p-3 text-center">
          <span className="text-xs text-app-text-muted">Answers</span>
          <p className="text-lg font-bold text-app-text-primary font-mono mt-0.5">
            {metrics.totalAnswersSubmitted || 0}
          </p>
        </div>

        <div className="bg-app-surface-muted/40 border border-app-border rounded-lg p-3 text-center">
          <span className="text-xs text-app-text-muted">Direct Correct</span>
          <p className="text-lg font-bold text-status-success font-mono mt-0.5">
            {metrics.correctCount || 0}
          </p>
        </div>

        <div className="bg-app-surface-muted/40 border border-app-border rounded-lg p-3 text-center">
          <span className="text-xs text-app-text-muted">Remediations</span>
          <p className="text-lg font-bold text-app-text-secondary font-mono mt-0.5">
            {metrics.remediationsCount || 0}
          </p>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center justify-center gap-3 pt-4 flex-wrap">
        {onNewSession && (
          <Button
            variant="primary"
            onClick={onNewSession}
            aria-label="Start new session on topic"
          >
            <Icon name="play" size={14} className="mr-1.5" />
            Start New Session on Topic
          </Button>
        )}

        {onReturnToTopics && (
          <Button
            variant="secondary"
            onClick={onReturnToTopics}
            aria-label="Return to topics"
          >
            <Icon name="book" size={14} className="mr-1.5" />
            Return to Topics
          </Button>
        )}
      </div>
    </section>
  );
}

export default StudyCompletedCard;
