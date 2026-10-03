import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Icon, Badge } from '../components/ui';

export function PlaceholderDetailPage({ resourceType = 'Resource' }) {
  const params = useParams();
  const navigate = useNavigate();
  const id = params.subjectId || params.chatId || params.noteId || Object.values(params)[0];

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          icon={<Icon name="arrow-left" size={14} />}
          onClick={() => navigate(-1)}
        >
          Back
        </Button>
      </div>

      <div className="border border-app-border rounded-lg p-6 bg-app-surface space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant="neutral">Upcoming in Phase 03+</Badge>
          <span className="font-mono text-xs text-app-text-muted">ID: {id}</span>
        </div>

        <h1 className="text-lg font-bold text-app-text-primary">
          {resourceType} Workspace Detail
        </h1>

        <p className="text-xs text-app-text-secondary leading-relaxed">
          This detail route foundation is established for routing integrity.
          The interactive curriculum structures, Socratic chat stream, and synchronized note editors will be connected during their designated development phases.
        </p>

        <div className="pt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/')}
          >
            Return to Workspace Home
          </Button>
        </div>
      </div>
    </div>
  );
}

export default PlaceholderDetailPage;
