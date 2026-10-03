import React from 'react';
import { Skeleton } from './Skeleton';

/**
 * Reusable LoadingState components (route, list, card, inline).
 */
export function LoadingState({
  type = 'route',
  message = 'Loading workspace...',
  className = '',
}) {
  if (type === 'list') {
    return (
      <div className={`space-y-3 p-4 ${className}`} aria-busy="true">
        <Skeleton height="h-6" width="w-1/4" />
        <div className="space-y-2 pt-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 border border-app-border rounded-md bg-app-surface"
            >
              <Skeleton circle width="w-8" height="h-8" />
              <div className="flex-1 space-y-1.5">
                <Skeleton width="w-1/3" height="h-3.5" />
                <Skeleton width="w-1/2" height="h-2.5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'cards') {
    return (
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 ${className}`} aria-busy="true">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="p-5 border border-app-border rounded-lg bg-app-surface space-y-3"
          >
            <div className="flex items-center justify-between">
              <Skeleton width="w-1/2" height="h-4" />
              <Skeleton circle width="w-6" height="h-6" />
            </div>
            <Skeleton width="w-full" height="h-3" />
            <Skeleton width="w-3/4" height="h-3" />
            <div className="pt-2 flex gap-2">
              <Skeleton width="w-16" height="h-5" />
              <Skeleton width="w-20" height="h-5" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Default 'route' or inline spinner + message
  return (
    <div
      className={`flex flex-col items-center justify-center min-h-[300px] p-8 text-center ${className}`}
      aria-busy="true"
    >
      <div className="relative flex items-center justify-center mb-3">
        <svg
          className="animate-spin h-6 w-6 text-brand-500"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-20"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="opacity-80"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>
      <p className="text-xs font-medium text-app-text-secondary tracking-tight">
        {message}
      </p>
    </div>
  );
}

export default LoadingState;
