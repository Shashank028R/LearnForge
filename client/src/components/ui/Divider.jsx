import React from 'react';

/**
 * Minimal Divider primitive with optional label.
 */
export function Divider({ label = null, className = '' }) {
  if (!label) {
    return <hr className={`border-t border-app-border my-4 ${className}`} />;
  }

  return (
    <div className={`relative flex items-center justify-center my-4 ${className}`}>
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-app-border" />
      </div>
      <span className="relative bg-app-surface px-2 text-[11px] uppercase tracking-wider text-app-text-muted">
        {label}
      </span>
    </div>
  );
}

export default Divider;
