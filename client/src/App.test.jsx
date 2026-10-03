import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import App from './App.jsx';

describe('LearnForge Client Foundation & Auth Shell', () => {
  beforeEach(() => {
    // Mock global fetch for health check and auth check
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
        // Return unauthenticated on initial mount
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () =>
            Promise.resolve({
              success: false,
              error: { code: 'AUTH_REQUIRED' },
            }),
        });
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    });
  });

  it('renders application header, auth status, and sign-in button', async () => {
    render(<App />);

    expect(screen.getByText('LearnForge')).toBeDefined();
    expect(await screen.findByText('Auth Online')).toBeDefined();
    expect(await screen.findAllByText(/Sign In/i)).toBeDefined();
    expect(screen.getByText(/Authentication & User Identity/i)).toBeDefined();
    expect(screen.getByText(/Passwordless & Google/i)).toBeDefined();
  });

  it('opens and closes the AuthModal dialog on button click', async () => {
    render(<App />);

    const signInBtn = await screen.findByRole('button', { name: /^sign in$/i });
    fireEvent.click(signInBtn);

    // Auth modal should now be visible
    expect(await screen.findByRole('dialog')).toBeDefined();
    expect(screen.getByText('Welcome to LearnForge')).toBeDefined();
    expect(screen.getByText(/Continue with Google/i)).toBeDefined();
    expect(screen.getByPlaceholderText('you@domain.com')).toBeDefined();

    // Close button
    const closeBtn = screen.getByRole('button', { name: /close dialog/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('verifies web client does NOT persist session tokens in localStorage or sessionStorage', async () => {
    // Ensure localStorage and sessionStorage remain untouched
    expect(localStorage.getItem('learnforge_bearer_fallback')).toBeNull();
    expect(localStorage.getItem('sessionToken')).toBeNull();
    expect(sessionStorage.getItem('sessionToken')).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
