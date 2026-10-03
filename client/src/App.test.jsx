import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import App from './App.jsx';

describe('LearnForge Client Foundation', () => {
  it('renders the application header and product description', async () => {
    // Mock global fetch for health check
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              status: 'healthy',
              service: 'LearnForge API',
              version: '0.1.0',
              database: 'disconnected',
            },
          }),
      })
    );

    render(<App />);

    expect(screen.getByText('LearnForge')).toBeDefined();
    expect(screen.getByText(/AI-Powered Knowledge & Learning Workspace/i)).toBeDefined();
    expect(await screen.findByText('Phase 00 Verified')).toBeDefined();
    expect(await screen.findByText(/LearnForge API/i)).toBeDefined();
  });
});
