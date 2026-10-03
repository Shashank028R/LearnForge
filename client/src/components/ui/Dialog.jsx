import React, { useRef, useId } from 'react';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { useFocusTrap } from '../../hooks/useFocusTrap';

/**
 * Accessible Dialog/Modal component adhering to LearnForge design system.
 * - Restrained styling, no glassmorphism, no neon borders, subtle shadow.
 * - Full accessible focus trap: Tab and Shift+Tab cycle within modal.
 * - Escape key dismisses modal.
 * - Restores focus to trigger element upon closing.
 * - Unique IDs for aria-labelledby and aria-describedby.
 * - Backdrop click closes modal; clicking content container does not.
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
  const uniqueId = useId();

  const titleId = title ? `dialog-title-${uniqueId}` : undefined;
  const descriptionId = description ? `dialog-desc-${uniqueId}` : undefined;

  // Accessible keyboard trap, escape listener, and focus restoration
  useFocusTrap({
    containerRef: dialogRef,
    isOpen,
    onClose,
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
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
        onClick={(e) => e.stopPropagation()}
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
                id={titleId}
                className="text-lg font-semibold text-app-text-primary leading-snug"
              >
                {title}
              </h2>
            )}
            {description && (
              <p
                id={descriptionId}
                className="text-xs text-app-text-muted mt-1 leading-relaxed"
              >
                {description}
              </p>
            )}
          </div>
          <IconButton
            icon={<Icon name="close" size={16} />}
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
