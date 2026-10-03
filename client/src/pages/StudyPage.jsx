import React from 'react';
import { EmptyState, Button, Icon } from '../components/ui';

export function StudyPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-app-text-primary tracking-tight">
            Study Mode
          </h1>
          <p className="text-xs text-app-text-secondary mt-0.5">
            Focused, distraction-free active recall and spaced repetition sessions.
          </p>
        </div>
      </div>

      <EmptyState
        icon={<Icon name="study" size={24} />}
        title="Study queue is currently clear."
        description="Pick a subject or topic to initiate an active recall study session."
        actionLabel="Browse Subjects"
        onAction={() => {}}
      />
    </div>
  );
}

export default StudyPage;
