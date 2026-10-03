import React, { useState, useRef, useEffect } from 'react';

/**
 * Dropdown menu primitive for contextual actions and user navigation.
 */
export function Dropdown({
  trigger,
  items = [],
  align = 'right',
  className = '',
  menuWidth = 'w-56',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const alignStyles = {
    right: 'right-0',
    left: 'left-0',
    center: 'left-1/2 -translate-x-1/2',
  };

  return (
    <div className={`relative inline-block text-left ${className}`} ref={containerRef}>
      <div onClick={() => setIsOpen((prev) => !prev)} className="cursor-pointer">
        {trigger}
      </div>

      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          className={`
            absolute ${alignStyles[align] || alignStyles.right} mt-1.5 ${menuWidth}
            bg-app-surface border border-app-border rounded-md shadow-modal
            py-1 z-50 text-xs focus:outline-none animate-in fade-in-50 duration-75
          `}
        >
          {items.map((item, idx) => {
            if (item.type === 'divider') {
              return (
                <div
                  key={`div-${idx}`}
                  className="my-1 border-t border-app-border"
                  role="separator"
                />
              );
            }

            if (item.type === 'header') {
              return (
                <div
                  key={`hdr-${idx}`}
                  className="px-3 py-1.5 font-semibold text-app-text-muted uppercase tracking-wider text-[10px]"
                >
                  {item.label}
                </div>
              );
            }

            return (
              <button
                key={item.label || idx}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setIsOpen(false);
                  if (item.onClick) item.onClick();
                }}
                className={`
                  w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors
                  ${
                    item.danger
                      ? 'text-status-danger hover:bg-status-danger-bg'
                      : 'text-app-text-primary hover:bg-app-surface-hover'
                  }
                  ${item.disabled ? 'opacity-40 pointer-events-none' : ''}
                `}
              >
                {item.icon && <span className="text-current opacity-70">{item.icon}</span>}
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && <span className="ml-auto">{item.badge}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Dropdown;
