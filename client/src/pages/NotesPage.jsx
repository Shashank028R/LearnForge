import React from 'react';
import { EmptyState, Button, Icon } from '../components/ui';

export function NotesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-app-text-primary tracking-tight">
            Notes
          </h1>
          <p className="text-xs text-app-text-secondary mt-0.5">
            Structured concept summaries and synthesized study notes.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<Icon name="plus" size={14} />}
          onClick={() => {}}
        >
          New Note
        </Button>
      </div>

      <EmptyState
        icon={<Icon name="notes" size={24} />}
        title="Your notes will appear here as you learn."
        description="Key takeaways, formulas, and synthesized summaries extracted during study sessions will be compiled here."
        actionLabel="Create Note"
        onAction={() => {}}
      />
    </div>
  );
}

export default NotesPage;
