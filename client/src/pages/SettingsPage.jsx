import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { Icon, Button } from '../components/ui';

export function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-app-text-primary tracking-tight">
          Settings & Workspace Preferences
        </h1>
        <p className="text-xs text-app-text-secondary mt-0.5">
          Configure appearance, accessibility, and workspace layout defaults.
        </p>
      </div>

      {/* Theme Settings */}
      <div className="border border-app-border rounded-lg p-6 bg-app-surface space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-app-text-primary">Appearance & Theme</h2>
          <p className="text-xs text-app-text-secondary mt-0.5">
            Select your preferred visual mode for extended study sessions.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 max-w-md pt-1">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`
              p-3.5 border rounded-lg flex items-center gap-3 text-left transition-all
              ${
                theme === 'light'
                  ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/20 ring-1 ring-brand-500'
                  : 'border-app-border bg-app-surface hover:bg-app-surface-hover'
              }
            `}
          >
            <div className="w-8 h-8 rounded bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0">
              <Icon name="sun" size={16} />
            </div>
            <div>
              <div className="text-xs font-semibold text-app-text-primary">Light Mode</div>
              <div className="text-[11px] text-app-text-secondary">Clean neutral paper</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`
              p-3.5 border rounded-lg flex items-center gap-3 text-left transition-all
              ${
                theme === 'dark'
                  ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/20 ring-1 ring-brand-500'
                  : 'border-app-border bg-app-surface hover:bg-app-surface-hover'
              }
            `}
          >
            <div className="w-8 h-8 rounded bg-slate-800 text-slate-200 flex items-center justify-center flex-shrink-0">
              <Icon name="moon" size={16} />
            </div>
            <div>
              <div className="text-xs font-semibold text-app-text-primary">Dark Mode</div>
              <div className="text-[11px] text-app-text-secondary">Low-distraction slate</div>
            </div>
          </button>
        </div>
      </div>

      {/* Keyboard Navigation Guidance */}
      <div className="border border-app-border rounded-lg p-6 bg-app-surface space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-app-text-primary">Accessibility & Navigation</h2>
          <p className="text-xs text-app-text-secondary mt-0.5">
            Standard keyboard bindings supported across the LearnForge shell.
          </p>
        </div>

        <div className="divide-y divide-app-border text-xs">
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-app-text-secondary">Focus Quick Search</span>
            <kbd className="px-2 py-0.5 text-[11px] font-mono border border-app-border rounded bg-app-surface-muted text-app-text-primary">
              /
            </kbd>
          </div>
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-app-text-secondary">Close Dialog or Drawer</span>
            <kbd className="px-2 py-0.5 text-[11px] font-mono border border-app-border rounded bg-app-surface-muted text-app-text-primary">
              Esc
            </kbd>
          </div>
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-app-text-secondary">Skip to Main Content</span>
            <kbd className="px-2 py-0.5 text-[11px] font-mono border border-app-border rounded bg-app-surface-muted text-app-text-primary">
              Tab
            </kbd>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
