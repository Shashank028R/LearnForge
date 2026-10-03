import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/**
 * Main application shell for LearnForge.
 * Structured around desktop persistent sidebar / mobile drawer,
 * sticky restrained topbar, and scrollable content workspace.
 */
export function AppShell({ onOpenAuth }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen w-full bg-app-bg text-app-text-primary overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Main Workspace Frame */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        {/* Top Header */}
        <TopBar
          onMenuToggle={() => setMobileMenuOpen((prev) => !prev)}
          onOpenAuth={onOpenAuth}
        />

        {/* Content Workspace Area */}
        <main
          id="main-content"
          className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 outline-none"
          tabIndex={-1}
        >
          <div className="max-w-6xl mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default AppShell;
