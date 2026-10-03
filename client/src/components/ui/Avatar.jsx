import React from 'react';

/**
 * Avatar primitive with fallback initials and border.
 */
export function Avatar({
  src,
  name = '',
  size = 'md',
  className = '',
  statusDot = null, // 'online' | 'offline' | null
  ...props
}) {
  const sizeStyles = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm',
    xl: 'w-12 h-12 text-base',
  };

  const getInitials = (str) => {
    if (!str) return 'LF';
    const parts = str.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return str.slice(0, 2).toUpperCase();
  };

  return (
    <div className={`relative inline-block select-none ${className}`} {...props}>
      {src ? (
        <img
          src={src}
          alt={name || 'User avatar'}
          className={`${sizeStyles[size] || sizeStyles.md} rounded-full object-cover border border-app-border`}
        />
      ) : (
        <div
          className={`
            ${sizeStyles[size] || sizeStyles.md}
            rounded-full bg-brand-500 text-white font-semibold
            flex items-center justify-center border border-app-border
          `}
          aria-label={name || 'User avatar'}
        >
          {getInitials(name)}
        </div>
      )}

      {statusDot && (
        <span
          className={`
            absolute bottom-0 right-0 block w-2.5 h-2.5 rounded-full ring-2 ring-app-surface
            ${statusDot === 'online' ? 'bg-status-success' : 'bg-app-text-muted'}
          `}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

export default Avatar;
