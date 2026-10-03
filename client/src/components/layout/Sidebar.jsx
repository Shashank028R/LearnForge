import React from 'react';
import { NavLink } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';

const NAV_GROUPS = [
  {
    label: 'Workspace',
    items: [
      { to: '/', label: 'Home', icon: 'home', end: true },
      { to: '/subjects', label: 'Subjects', icon: 'book' },
      { to: '/chats', label: 'Chats', icon: 'chat' },
      { to: '/notes', label: 'Notes', icon: 'notes' },
      { to: '/study', label: 'Study', icon: 'study' },
      { to: '/quizzes', label: 'Quizzes', icon: 'quiz' },
      { to: '/progress', label: 'Progress', icon: 'progress' },
    ],
  },
  {
    label: 'Utilities & Account',
    items: [
      { to: '/import', label: 'Import', icon: 'import' },
      { to: '/profile', label: 'Profile', icon: 'user' },
      { to: '/settings', label: 'Settings', icon: 'settings' },
    ],
  },
];

export function Sidebar({ isOpen, onClose }) {
  const navItemClass = ({ isActive }) => `
    flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md transition-colors
    ${
      isActive
        ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 font-semibold shadow-subtle'
        : 'text-app-text-secondary hover:text-app-text-primary hover:bg-app-surface-hover'
    }
  `;

  const sidebarContent = (
    <div className="flex flex-col h-full bg-app-surface border-r border-app-border">
      {/* Brand Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-app-border">
        <NavLink to="/" className="flex items-center gap-2 text-decoration-none">
          <div className="w-7 h-7 rounded bg-brand-500 text-white flex items-center justify-center font-bold text-xs shadow-subtle">
            LF
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold tracking-tight text-app-text-primary leading-tight">
              LearnForge
            </span>
            <span className="text-[10px] text-app-text-muted font-mono leading-none">
              Workspace
            </span>
          </div>
        </NavLink>

        {/* Mobile close button */}
        <div className="md:hidden">
          <IconButton
            icon={<Icon name="x" size={16} />}
            label="Close navigation"
            variant="ghost"
            size="sm"
            onClick={onClose}
          />
        </div>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-5" aria-label="Main Navigation">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-1">
            <div className="px-3 text-[10px] font-semibold text-app-text-muted uppercase tracking-wider">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => {
                    // Close drawer on navigation in mobile
                    if (window.innerWidth < 768 && onClose) {
                      onClose();
                    }
                  }}
                  className={navItemClass}
                >
                  <Icon name={item.icon} size={16} className="opacity-75 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer Info */}
      <div className="p-3 border-t border-app-border">
        <div className="px-3 py-2 rounded bg-app-surface-muted/50 text-[11px] text-app-text-muted flex items-center justify-between">
          <span className="font-mono text-[10px]">LearnForge v0.2</span>
          <span className="inline-flex items-center gap-1 text-[10px] text-brand-600 dark:text-brand-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Ready
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:block w-60 h-screen sticky top-0 flex-shrink-0 z-20">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Backdrop & Container */}
      {isOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 transition-opacity"
            onClick={onClose}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 w-64 z-50 shadow-modal">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}

export default Sidebar;
