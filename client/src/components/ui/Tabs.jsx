import React from 'react';

/**
 * Accessible Tabs primitive for section switching.
 */
export function Tabs({
  tabs = [],
  activeTab,
  onChange,
  className = '',
}) {
  return (
    <div
      role="tablist"
      className={`flex items-center gap-1 border-b border-app-border overflow-x-auto ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            id={`tab-${tab.id}`}
            aria-controls={`panel-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`
              px-3.5 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors
              ${
                isActive
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400 font-semibold'
                  : 'border-transparent text-app-text-secondary hover:text-app-text-primary hover:border-app-border'
              }
            `}
          >
            <span className="flex items-center gap-1.5">
              {tab.icon && <span className="opacity-75">{tab.icon}</span>}
              {tab.label}
              {tab.badge && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-app-surface-muted text-app-text-muted">
                  {tab.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
