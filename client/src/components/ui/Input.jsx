import React, { forwardRef } from 'react';

/**
 * Standard accessible form Input primitive with label, hint, and error states.
 */
export const Input = forwardRef(function Input(
  {
    label,
    id,
    type = 'text',
    error,
    helperText,
    leftIcon,
    rightIcon,
    disabled = false,
    className = '',
    inputClassName = '',
    ...props
  },
  ref
) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const errorId = error && inputId ? `${inputId}-error` : undefined;
  const helperId = helperText && inputId ? `${inputId}-helper` : undefined;

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-medium text-app-text-secondary mb-1.5"
        >
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        {leftIcon && (
          <div className="absolute left-3 text-app-text-muted pointer-events-none">
            {leftIcon}
          </div>
        )}

        <input
          ref={ref}
          id={inputId}
          type={type}
          disabled={disabled}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={errorId || helperId || undefined}
          className={`
            w-full bg-app-surface border rounded text-sm text-app-text-primary
            placeholder:text-app-text-muted transition-colors
            py-2 ${leftIcon ? 'pl-9' : 'pl-3'} ${rightIcon ? 'pr-9' : 'pr-3'}
            ${error ? 'border-status-danger focus-visible:ring-status-danger' : 'border-app-border focus-visible:ring-brand-500'}
            disabled:opacity-50 disabled:bg-app-surface-muted
            ${inputClassName}
          `}
          {...props}
        />

        {rightIcon && (
          <div className="absolute right-3 text-app-text-muted">
            {rightIcon}
          </div>
        )}
      </div>

      {error ? (
        <p id={errorId} className="mt-1 text-xs text-status-danger font-medium" role="alert">
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className="mt-1 text-xs text-app-text-muted">{helperText}</p>
      ) : null}
    </div>
  );
});

export default Input;
