import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import {
  Button,
  IconButton,
  Input,
  Dialog,
  Dropdown,
  EmptyState,
  Badge,
  Avatar,
  Tabs,
  Icon,
  ErrorState,
  LoadingState,
} from './index';

describe('UI Primitives — Design System Verification', () => {
  describe('Icon', () => {
    it('renders canonical close icon and known vector paths', () => {
      const { container } = render(<Icon name="close" size={16} />);
      const svg = container.querySelector('svg');
      expect(svg).toBeDefined();
      const path = container.querySelector('path');
      expect(path.getAttribute('d')).toContain('M6 18L18 6M6 6l12 12');
    });

    it('falls back gracefully to info icon for unknown icon names with console warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { container } = render(<Icon name="non_existent_icon_name" size={16} />);
      expect(container.querySelector('svg')).toBeDefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Icon] Unknown icon name "non_existent_icon_name"')
      );
      warnSpy.mockRestore();
    });
  });

  describe('Button', () => {
    it('renders with children, handles click events, and supports loading state', () => {
      const handleClick = vi.fn();
      const { rerender } = render(
        <Button variant="primary" onClick={handleClick}>
          Click Me
        </Button>
      );

      const btn = screen.getByRole('button', { name: /click me/i });
      expect(btn).toBeDefined();
      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);

      // Loading state disables interaction
      rerender(
        <Button variant="primary" loading onClick={handleClick}>
          Click Me
        </Button>
      );
      expect(btn.getAttribute('disabled')).not.toBeNull();
      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('renders different variants appropriately', () => {
      render(
        <div>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
      );

      expect(screen.getByRole('button', { name: /secondary/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /outline/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /danger/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /ghost/i })).toBeDefined();
    });
  });

  describe('Input', () => {
    it('renders label, input, and accessible error message', () => {
      const handleChange = vi.fn();
      render(
        <Input
          id="test-input"
          label="Email Address"
          placeholder="user@example.com"
          value=""
          onChange={handleChange}
          error="Invalid email format"
        />
      );

      expect(screen.getByLabelText(/email address/i)).toBeDefined();
      const input = screen.getByPlaceholderText('user@example.com');
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText('Invalid email format')).toBeDefined();
    });
  });

  describe('Dialog', () => {
    function DialogHarness() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <div>
          <button id="open-btn" onClick={() => setIsOpen(true)}>
            Open Test Dialog
          </button>
          <Dialog
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            title="Test Dialog Title"
            description="Test dialog description"
          >
            <div>
              <input id="modal-input-1" placeholder="First Field" />
              <button id="modal-action-btn">Action Button</button>
            </div>
          </Dialog>
        </div>
      );
    }

    it('manages focus trap, Tab/Shift+Tab cycling, Escape key, and focus restoration', async () => {
      render(<DialogHarness />);

      const triggerBtn = screen.getByRole('button', { name: /open test dialog/i });
      triggerBtn.focus();
      expect(document.activeElement).toBe(triggerBtn);

      // Open dialog
      fireEvent.click(triggerBtn);

      // Dialog is rendered with correct ARIA attributes
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toBeDefined();
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.getAttribute('aria-labelledby')).toMatch(/dialog-title-/);
      expect(dialog.getAttribute('aria-describedby')).toMatch(/dialog-desc-/);

      // First focusable element receives focus
      await waitFor(() => {
        expect(document.activeElement).not.toBe(triggerBtn);
      });

      // Get all focusables in modal
      const closeBtn = screen.getByRole('button', { name: /close dialog/i });
      const firstInput = screen.getByPlaceholderText('First Field');
      const actionBtn = screen.getByRole('button', { name: /action button/i });

      // Focus last element (actionBtn) and press Tab -> should wrap to first focusable element
      actionBtn.focus();
      expect(document.activeElement).toBe(actionBtn);

      fireEvent.keyDown(window, { key: 'Tab' });
      expect(document.activeElement).toBe(closeBtn);

      // Press Shift+Tab on first element (closeBtn) -> should wrap to last element
      fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(actionBtn);

      // Press Escape -> closes dialog
      fireEvent.keyDown(window, { key: 'Escape' });
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeNull();
      });

      // Focus restores to trigger button
      expect(document.activeElement).toBe(triggerBtn);
    });

    it('closes on backdrop click but not on dialog content click', async () => {
      const handleClose = vi.fn();
      render(
        <Dialog isOpen={true} onClose={handleClose} title="Backdrop Test">
          <p>Dialog Body Content</p>
        </Dialog>
      );

      // Clicking dialog content container does NOT close
      const content = screen.getByText('Dialog Body Content');
      fireEvent.click(content);
      expect(handleClose).not.toHaveBeenCalled();

      // Backdrop click closes dialog
      const backdrop = document.querySelector('[aria-hidden="true"]');
      expect(backdrop).toBeDefined();
      fireEvent.click(backdrop);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Dropdown', () => {
    it('opens on trigger click and executes item callbacks', () => {
      const handleItemClick = vi.fn();
      const items = [
        { label: 'Profile Settings', onClick: handleItemClick },
        { type: 'divider' },
        { label: 'Sign Out', danger: true, onClick: handleItemClick },
      ];

      render(
        <Dropdown
          trigger={<button type="button">Open Menu</button>}
          items={items}
        />
      );

      expect(screen.queryByRole('menu')).toBeNull();

      // Click trigger
      const trigger = screen.getByRole('button', { name: /open menu/i });
      fireEvent.click(trigger);

      expect(screen.getByRole('menu')).toBeDefined();
      const menuItem = screen.getByRole('menuitem', { name: /profile settings/i });
      expect(menuItem).toBeDefined();

      fireEvent.click(menuItem);
      expect(handleItemClick).toHaveBeenCalledTimes(1);

      // Menu closes after selection
      expect(screen.queryByRole('menu')).toBeNull();
    });
  });

  describe('EmptyState', () => {
    it('renders title, description, and primary/secondary actions', () => {
      const handleAction = vi.fn();
      render(
        <EmptyState
          title="No subjects yet."
          description="Create your first subject to organize study material."
          actionLabel="Create Subject"
          onAction={handleAction}
        />
      );

      expect(screen.getByText('No subjects yet.')).toBeDefined();
      expect(
        screen.getByText(/create your first subject to organize study material/i)
      ).toBeDefined();

      const actionBtn = screen.getByRole('button', { name: /create subject/i });
      fireEvent.click(actionBtn);
      expect(handleAction).toHaveBeenCalledTimes(1);
    });
  });

  describe('Tabs', () => {
    it('renders tabs list and triggers selection change', () => {
      const handleChange = vi.fn();
      const tabs = [
        { id: 'all', label: 'All Subjects' },
        { id: 'active', label: 'In Progress' },
      ];

      render(<Tabs tabs={tabs} activeTab="all" onChange={handleChange} />);

      expect(screen.getByRole('tablist')).toBeDefined();
      const activeTab = screen.getByRole('tab', { name: /all subjects/i });
      expect(activeTab.getAttribute('aria-selected')).toBe('true');

      const nextTab = screen.getByRole('tab', { name: /in progress/i });
      fireEvent.click(nextTab);
      expect(handleChange).toHaveBeenCalledWith('active');
    });
  });

  describe('ErrorState and LoadingState', () => {
    it('renders calm error state with recovery action', () => {
      const handleRetry = vi.fn();
      render(
        <ErrorState
          title="Connection Error"
          message="Failed to connect to backend."
          onRetry={handleRetry}
        />
      );

      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText('Connection Error')).toBeDefined();
      const retryBtn = screen.getByRole('button', { name: /try again/i });
      fireEvent.click(retryBtn);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });

    it('renders loading skeletons without crashing', () => {
      render(<LoadingState type="cards" />);
      expect(document.querySelector('[aria-busy="true"]')).toBeDefined();
    });
  });
});
