import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';

/**
 * Protected route wrapper and layout route.
 * - Prevents protected workspace content from rendering while authentication is loading.
 * - Displays an accessible sign-in invitation for unauthenticated users.
 * - Supports both standalone wrapping (`children`) and nested route trees (`<Outlet />`).
 */
export function ProtectedRoute({ children, onOpenAuth }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <LoadingState type="route" message="Validating secure session..." />;
  }

  if (!isAuthenticated) {
    return (
      <div className="py-12">
        <EmptyState
          icon={<Icon name="shield" size={24} />}
          title="Sign in required"
          description="This section of your workspace requires an active, authenticated LearnForge session."
          actionLabel="Sign In"
          onAction={onOpenAuth}
        />
      </div>
    );
  }

  return children ? children : <Outlet />;
}

export default ProtectedRoute;
