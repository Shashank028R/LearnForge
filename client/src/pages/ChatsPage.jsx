import React from 'react';
import { EmptyState, Button, Icon } from '../components/ui';

export function ChatsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-app-text-primary tracking-tight">
            Conversations
          </h1>
          <p className="text-xs text-app-text-secondary mt-0.5">
            Socratic AI tutoring dialogues tailored to your knowledge level and syllabus.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<Icon name="plus" size={14} />}
          onClick={() => {}}
        >
          New Chat
        </Button>
      </div>

      <EmptyState
        icon={<Icon name="chat" size={24} />}
        title="No conversations yet."
        description="Start a new Socratic learning session to explore complex topics step-by-step."
        actionLabel="Start Conversation"
        onAction={() => {}}
      />
    </div>
  );
}

export default ChatsPage;
