import React from 'react';
import { Button } from './Button';

/**
 * Restrained, informative EmptyState component for LearnForge.
 * Replaces generic SaaS decoration with calm, clear guidance.
 */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  className = '',
}) {
  return (
    <div
      className={`
        flex flex-col items-center justify-center text-center
        p-8 md:p-12 border border-dashed border-app-border rounded-lg
        bg-app-surface/50 max-w-lg mx-auto my-6
        ${className}
      `}
    >
      {icon && (
        <div className="w-12 h-12 rounded-lg bg-app-surface-muted text-app-text-muted flex items-center justify-center mb-4">
          {icon}
        </div>
      )}

      <h3 className="text-base font-semibold text-app-text-primary tracking-tight">
        {title}
      </h3>

      {description && (
        <p className="text-xs text-app-text-secondary mt-1.5 max-w-sm leading-relaxed">
          {description}
        </p>
      )}

      {(actionLabel || secondaryActionLabel) && (
        <div className="flex flex-wrap items-center justify-center gap-3 mt-5">
          {actionLabel && (
            <Button size="sm" variant="primary" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryActionLabel && (
            <Button size="sm" variant="secondary" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
