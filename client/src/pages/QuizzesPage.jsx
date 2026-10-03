import React from 'react';
import { EmptyState, Button, Icon } from '../components/ui';

export function QuizzesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-app-text-primary tracking-tight">
            Quizzes & Assessments
          </h1>
          <p className="text-xs text-app-text-secondary mt-0.5">
            Diagnostic evaluations and retention checks created from your curriculum.
          </p>
        </div>
      </div>

      <EmptyState
        icon={<Icon name="quiz" size={24} />}
        title="Study a topic first to generate a quiz."
        description="Once you have reviewed subjects or engaged in study chats, automated assessment quizzes will become available."
        actionLabel="Explore Subjects"
        onAction={() => {}}
      />
    </div>
  );
}

export default QuizzesPage;
