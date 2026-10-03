import React from 'react';
import { Icon } from './Icon';
import { Button } from './Button';

/**
 * Professional, calm ErrorState for failed views or operations.
 * Strictly avoids exposing database internals, stack traces, or vendor details.
 */
export function ErrorState({
  title = 'Something went wrong',
  message = "We couldn't load this workspace. Please check your connection and try again.",
  onRetry,
  retryLabel = 'Try again',
  className = '',
}) {
  return (
    <div
      role="alert"
      className={`
        flex flex-col items-center justify-center text-center
        p-8 md:p-12 border border-status-danger/20 rounded-lg
        bg-status-danger-bg/30 max-w-md mx-auto my-6
        ${className}
      `}
    >
      <div className="w-10 h-10 rounded-full bg-status-danger/10 text-status-danger flex items-center justify-center mb-3">
        <Icon name="alert" size={20} />
      </div>

      <h3 className="text-sm font-semibold text-app-text-primary">
        {title}
      </h3>

      <p className="text-xs text-app-text-secondary mt-1.5 leading-relaxed">
        {message}
      </p>

      {onRetry && (
        <div className="mt-4">
          <Button size="sm" variant="secondary" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

export default ErrorState;
