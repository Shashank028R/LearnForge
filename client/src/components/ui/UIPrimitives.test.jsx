import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  ErrorState,
  LoadingState,
} from './index';

describe('UI Primitives — Design System Verification', () => {
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
    it('renders modal dialog when open, manages escape key and close action', () => {
      const handleClose = vi.fn();
      const { rerender } = render(
        <Dialog
          isOpen={true}
          onClose={handleClose}
          title="Test Dialog Title"
          description="Test dialog description"
        >
          <div>Dialog Inner Body</div>
        </Dialog>
      );

      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByText('Test Dialog Title')).toBeDefined();
      expect(screen.getByText('Test dialog description')).toBeDefined();
      expect(screen.getByText('Dialog Inner Body')).toBeDefined();

      // Close button
      const closeBtn = screen.getByRole('button', { name: /close dialog/i });
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);

      // Escape key
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(2);

      // When closed, should not render in DOM
      rerender(
        <Dialog isOpen={false} onClose={handleClose} title="Closed">
          <div>Hidden</div>
        </Dialog>
      );
      expect(screen.queryByRole('dialog')).toBeNull();
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
