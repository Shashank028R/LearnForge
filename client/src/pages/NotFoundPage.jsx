import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Icon } from '../components/ui';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6">
      <div className="w-12 h-12 rounded-lg bg-app-surface-muted text-app-text-muted flex items-center justify-center mb-4">
        <Icon name="alert" size={24} />
      </div>

      <h1 className="text-xl font-bold text-app-text-primary tracking-tight">
        404 — Page Not Found
      </h1>

      <p className="text-xs text-app-text-secondary mt-1.5 max-w-sm leading-relaxed mb-6">
        The requested workspace location does not exist or has been relocated.
      </p>

      <Button
        variant="primary"
        size="sm"
        icon={<Icon name="home" size={14} />}
        onClick={() => navigate('/')}
      >
        Back to Home
      </Button>
    </div>
  );
}

export default NotFoundPage;
