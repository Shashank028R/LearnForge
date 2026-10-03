import React from 'react';
import { EmptyState, Button, Icon } from '../components/ui';

export function ImportPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-app-text-primary tracking-tight">
            Import & Data Migration
          </h1>
          <p className="text-xs text-app-text-secondary mt-0.5">
            Bring previous notes, conversation archives, or course syllabi into your LearnForge workspace.
          </p>
        </div>
      </div>

      <EmptyState
        icon={<Icon name="import" size={24} />}
        title="Import a conversation to bring existing knowledge into LearnForge."
        description="Support for importing external markdown notes, chat exports, and syllabus outlines will be connected in future phases."
        actionLabel="Select Archive File"
        onAction={() => {}}
      />
    </div>
  );
}

export default ImportPage;
