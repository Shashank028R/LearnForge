import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { AppRoutes } from './routes/AppRoutes.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';

describe('LearnForge Application Shell & Protected Routes (Phase 02.1)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    // Default mock: Unauthenticated session
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/v1/health')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                status: 'healthy',
                service: 'LearnForge API',
                version: '0.1.0',
                database: 'connected',
              },
            }),
        });
      }
      if (url.includes('/api/v1/auth/me')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () =>
            Promise.resolve({
              success: false,
              error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
            }),
        });
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    });
  });

  const renderWithRouter = (initialEntries = ['/']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <ThemeProvider>
          <AuthProvider>
            <AppRoutes onOpenAuth={vi.fn()} />
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );
  };

  it('renders application shell with sidebar navigation and public home workspace', async () => {
    renderWithRouter(['/']);

    expect(screen.getAllByText('LearnForge').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /home/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /subjects/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /chats/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /notes/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /study/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /quizzes/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /progress/i })).toBeDefined();

    // Home Onboarding content is public
    expect(screen.getByText('Welcome to LearnForge')).toBeDefined();
    expect(screen.getByRole('button', { name: /create subject/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /start conversation/i })).toBeDefined();
  });

  const PROTECTED_ROUTES = [
    { path: '/subjects', label: 'Subjects' },
    { path: '/subjects/subject-123', label: 'Subject Details' },
    { path: '/chats', label: 'Chats' },
    { path: '/chats/chat-456', label: 'Chat Details' },
    { path: '/notes', label: 'Notes' },
    { path: '/notes/note-789', label: 'Note Details' },
    { path: '/study', label: 'Study' },
    { path: '/quizzes', label: 'Quizzes' },
    { path: '/progress', label: 'Progress' },
    { path: '/import', label: 'Import' },
    { path: '/profile', label: 'Profile' },
  ];

  describe.each(PROTECTED_ROUTES)('Protected Route: $path', ({ path, label }) => {
    it(`blocks unauthenticated access to ${path} and displays accessible sign-in prompt`, async () => {
      renderWithRouter([path]);

      expect(await screen.findByText('Sign in required')).toBeDefined();
      expect(
        screen.getByText(/this section of your workspace requires an active, authenticated learnforge session/i)
      ).toBeDefined();
      expect(
        screen.getAllByRole('button', { name: /^sign in$/i }).length
      ).toBeGreaterThanOrEqual(2);
    });
  });

  it('renders protected content when authenticated', async () => {
    // Mock authenticated session
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/v1/auth/me')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                user: {
                  id: 'usr_123',
                  email: 'student@domain.com',
                  displayName: 'Alex Scholar',
                },
                session: {
                  id: 'ses_123',
                  authMethod: 'email_otp',
                  expiresAt: new Date(Date.now() + 86400000).toISOString(),
                },
              },
            }),
        });
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    });

    renderWithRouter(['/subjects']);

    expect(await screen.findByRole('heading', { name: 'Subjects' })).toBeDefined();
    expect(screen.getByText('No subjects yet.')).toBeDefined();
  });

  it('renders auth loading state while session resolution is in progress', async () => {
    // Never-resolving promise to test loading state
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/v1/auth/me')) {
        return new Promise(() => {});
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    });

    renderWithRouter(['/subjects']);

    expect(screen.getByText('Validating secure session...')).toBeDefined();
    expect(screen.queryByText('No subjects yet.')).toBeNull();
    expect(screen.queryByText('Sign in required')).toBeNull();
  });

  it('allows public access to /settings for appearance and keyboard shortcuts', async () => {
    renderWithRouter(['/settings']);

    expect(
      screen.getByRole('heading', { name: 'Settings & Workspace Preferences' })
    ).toBeDefined();
    expect(screen.getByRole('button', { name: /light mode clean/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /dark mode low-distraction/i })).toBeDefined();
  });

  it('supports theme switching between light and dark mode', async () => {
    renderWithRouter(['/settings']);

    const lightBtn = screen.getByRole('button', { name: /light mode clean/i });
    const darkBtn = screen.getByRole('button', { name: /dark mode low-distraction/i });

    fireEvent.click(darkBtn);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('learnforge_theme')).toBe('dark');

    fireEvent.click(lightBtn);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('learnforge_theme')).toBe('light');
  });

  it('renders 404 page for unknown routes with recovery link', async () => {
    renderWithRouter(['/unknown-workspace-path']);

    expect(screen.getByText('404 — Page Not Found')).toBeDefined();
    expect(screen.getByRole('button', { name: /back to home/i })).toBeDefined();
  });

  it('verifies that no session tokens or credentials are leaked to browser storage', async () => {
    renderWithRouter(['/']);

    expect(localStorage.getItem('sessionToken')).toBeNull();
    expect(sessionStorage.getItem('sessionToken')).toBeNull();
    expect(localStorage.getItem('bearerToken')).toBeNull();
  });
});
