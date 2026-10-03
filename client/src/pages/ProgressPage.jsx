import React from 'react';
import { EmptyState, Icon } from '../components/ui';

export function ProgressPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-app-text-primary tracking-tight">
            Learning Progress & Analytics
          </h1>
          <p className="text-xs text-app-text-secondary mt-0.5">
            Retention metrics, concept mastery levels, and study cadence.
          </p>
        </div>
      </div>

      <EmptyState
        icon={<Icon name="progress" size={24} />}
        title="Your learning progress will appear after you start studying."
        description="As you review materials, answer quiz questions, and complete study sessions, accurate retention metrics will be visualized here."
      />
    </div>
  );
}

export default ProgressPage;
