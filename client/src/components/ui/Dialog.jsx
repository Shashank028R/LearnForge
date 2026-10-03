import React, { useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { IconButton } from './IconButton';

/**
 * Accessible Dialog/Modal component adhering to LearnForge design system.
 * Restrained styling, no glassmorphism, no neon borders, subtle shadow.
 */
export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'max-w-md',
  className = '',
}) {
  const dialogRef = useRef(null);

  // Close on Escape key press
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Focus trap: focus dialog on open
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'dialog-title' : undefined}
      aria-describedby={description ? 'dialog-description' : undefined}
    >
      {/* Backdrop: neutral, non-glassmorphic, subtle dark tint */}
      <div
        className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog container */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`
          relative z-10 w-full ${maxWidth}
          bg-app-surface text-app-text-primary
          border border-app-border rounded-lg shadow-modal
          p-6 max-h-[90vh] overflow-y-auto
          focus:outline-none transition-all
          ${className}
        `}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            {title && (
              <h2
                id="dialog-title"
                className="text-lg font-semibold text-app-text-primary leading-snug"
              >
                {title}
              </h2>
            )}
            {description && (
              <p
                id="dialog-description"
                className="text-xs text-app-text-muted mt-1 leading-relaxed"
              >
                {description}
              </p>
            )}
          </div>
          <IconButton
            icon={<Icon name="x" size={16} />}
            label="Close dialog"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="-mr-1 -mt-1"
          />
        </div>

        <div>{children}</div>
      </div>
    </div>
  );
}

export default Dialog;
