import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import App from './App.jsx';
import { AppRoutes } from './routes/AppRoutes.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';

describe('LearnForge Application Shell & Design System (Phase 02)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    // Mock global fetch for auth verification
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
        // Return unauthenticated by default
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

  it('renders application shell with sidebar navigation and home workspace', async () => {
    renderWithRouter(['/']);

    // Brand and Navigation
    expect(screen.getAllByText('LearnForge').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /home/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /subjects/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /chats/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /notes/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /study/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /quizzes/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /progress/i })).toBeDefined();

    // Home Onboarding content (genuine empty workspace, zero fake statistics)
    expect(screen.getByText('Welcome to LearnForge')).toBeDefined();
    expect(screen.getByRole('button', { name: /create subject/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /start conversation/i })).toBeDefined();
  });

  it('navigates cleanly to Subjects page and displays authentic empty state', async () => {
    renderWithRouter(['/subjects']);

    expect(screen.getByRole('heading', { name: 'Subjects' })).toBeDefined();
    expect(screen.getByText('No subjects yet.')).toBeDefined();
    expect(
      screen.getByText(/create your first subject to organize study material/i)
    ).toBeDefined();
  });

  it('navigates to Chats page with authentic empty state', async () => {
    renderWithRouter(['/chats']);

    expect(screen.getByRole('heading', { name: 'Conversations' })).toBeDefined();
    expect(screen.getByText('No conversations yet.')).toBeDefined();
  });

  it('navigates to Quizzes page with authentic empty state', async () => {
    renderWithRouter(['/quizzes']);

    expect(screen.getByRole('heading', { name: 'Quizzes & Assessments' })).toBeDefined();
    expect(screen.getByText('Study a topic first to generate a quiz.')).toBeDefined();
  });

  it('protects /profile route when unauthenticated with accessible prompt', async () => {
    renderWithRouter(['/profile']);

    expect(await screen.findByText('Sign in required')).toBeDefined();
    expect(
      screen.getByText(/this section of your workspace requires an active, authenticated learnforge session/i)
    ).toBeDefined();
  });

  it('renders 404 page for unknown routes with recovery link', async () => {
    renderWithRouter(['/unknown-random-workspace-path']);

    expect(screen.getByText('404 — Page Not Found')).toBeDefined();
    expect(screen.getByRole('button', { name: /back to home/i })).toBeDefined();
  });

  it('supports theme switching between light and dark mode', async () => {
    renderWithRouter(['/settings']);

    const lightBtn = screen.getByRole('button', { name: /light mode clean/i });
    const darkBtn = screen.getByRole('button', { name: /dark mode low-distraction/i });

    expect(lightBtn).toBeDefined();
    expect(darkBtn).toBeDefined();

    fireEvent.click(darkBtn);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('learnforge_theme')).toBe('dark');

    fireEvent.click(lightBtn);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('learnforge_theme')).toBe('light');
  });

  it('verifies that no session tokens or credentials are leaked to browser storage', async () => {
    renderWithRouter(['/']);

    expect(localStorage.getItem('sessionToken')).toBeNull();
    expect(sessionStorage.getItem('sessionToken')).toBeNull();
    expect(localStorage.getItem('bearerToken')).toBeNull();
  });
});
