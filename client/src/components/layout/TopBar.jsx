import React from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { UserNav } from './UserNav';

const ROUTE_TITLES = {
  '/': 'Home',
  '/subjects': 'Subjects',
  '/chats': 'Chats',
  '/notes': 'Notes',
  '/study': 'Study',
  '/quizzes': 'Quizzes',
  '/progress': 'Progress',
  '/import': 'Import',
  '/profile': 'User Profile',
  '/settings': 'Settings',
};

export function TopBar({ onMenuToggle, onOpenAuth }) {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  // Determine current page context title
  const currentTitle = ROUTE_TITLES[location.pathname] || 'Workspace';

  return (
    <header className="h-14 bg-app-surface border-b border-app-border px-4 flex items-center justify-between gap-4 sticky top-0 z-10 flex-shrink-0">
      {/* Left: Mobile Menu Trigger & Breadcrumbs */}
      <div className="flex items-center gap-3">
        <div className="md:hidden">
          <IconButton
            icon={<Icon name="menu" size={18} />}
            label="Open navigation menu"
            variant="ghost"
            size="sm"
            onClick={onMenuToggle}
          />
        </div>

        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs">
          <span className="text-app-text-muted hidden sm:inline">Workspace</span>
          <span className="text-app-text-muted hidden sm:inline">/</span>
          <span className="font-semibold text-app-text-primary tracking-tight">
            {currentTitle}
          </span>
        </nav>
      </div>

      {/* Middle: Restrained Quick Search Placeholder Trigger */}
      <div className="hidden lg:flex items-center flex-1 max-w-sm mx-4">
        <button
          type="button"
          onClick={() => {}}
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-app-text-muted bg-app-surface-muted border border-app-border rounded-md hover:bg-app-surface transition-colors cursor-pointer text-left"
          aria-label="Quick search (Coming in future phases)"
        >
          <div className="flex items-center gap-2 truncate">
            <Icon name="search" size={14} className="opacity-60 flex-shrink-0" />
            <span className="truncate">Search workspace...</span>
          </div>
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-app-text-muted border border-app-border rounded bg-app-surface">
            /
          </kbd>
        </button>
      </div>

      {/* Right: Actions, Theme Toggle & User Account Nav */}
      <div className="flex items-center gap-2">
        <IconButton
          icon={<Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />}
          label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
        />

        <div className="h-4 w-[1px] bg-app-border mx-1" aria-hidden="true" />

        <UserNav onOpenAuth={onOpenAuth} />
      </div>
    </header>
  );
}

export default TopBar;
