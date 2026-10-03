import React from 'react';

/**
 * Accessible Icon-only button with required aria-label or label.
 */
export function IconButton({
  icon,
  label,
  'aria-label': ariaLabel,
  variant = 'ghost',
  size = 'md',
  disabled = false,
  className = '',
  onClick,
  ...props
}) {
  const sizeStyles = {
    sm: 'p-1.5 rounded',
    md: 'p-2 rounded-md',
    lg: 'p-2.5 rounded-md',
  };

  const variantStyles = {
    ghost: 'text-app-text-secondary hover:text-app-text-primary hover:bg-app-surface-hover',
    secondary: 'bg-app-surface border border-app-border text-app-text-primary hover:bg-app-surface-hover',
    primary: 'bg-brand-500 hover:bg-brand-600 text-white shadow-subtle',
  };

  const computedAriaLabel = ariaLabel || label;

  return (
    <button
      type="button"
      aria-label={computedAriaLabel}
      disabled={disabled}
      onClick={onClick}
      className={`
        inline-flex items-center justify-center transition-colors select-none
        focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none
        ${sizeStyles[size] || sizeStyles.md}
        ${variantStyles[variant] || variantStyles.ghost}
        ${className}
      `}
      {...props}
    >
      {icon}
    </button>
  );
}

export default IconButton;
