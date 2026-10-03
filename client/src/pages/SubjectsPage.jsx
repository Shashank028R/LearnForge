import React from 'react';
import { EmptyState, Button, Icon } from '../components/ui';

export function SubjectsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-app-text-primary tracking-tight">
            Subjects
          </h1>
          <p className="text-xs text-app-text-secondary mt-0.5">
            Organize your knowledge base into structured academic disciplines and topics.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<Icon name="plus" size={14} />}
          onClick={() => {}}
        >
          New Subject
        </Button>
      </div>

      <EmptyState
        icon={<Icon name="book" size={24} />}
        title="No subjects yet."
        description="Create your first subject to organize study material, knowledge notes, and topic hierarchies."
        actionLabel="Create Subject"
        onAction={() => {}}
      />
    </div>
  );
}

export default SubjectsPage;
