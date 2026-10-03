import React from 'react';

/**
 * Skeleton loading placeholder with subtle pulse animation.
 */
export function Skeleton({
  variant = 'text',
  width = 'w-full',
  height = 'h-4',
  className = '',
  circle = false,
}) {
  const variantStyles = {
    text: 'h-3.5 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-md',
  };

  return (
    <div
      aria-hidden="true"
      className={`
        animate-pulse bg-app-surface-muted
        ${circle ? 'rounded-full' : variantStyles[variant] || 'rounded'}
        ${width}
        ${height}
        ${className}
      `}
    />
  );
}

export default Skeleton;
