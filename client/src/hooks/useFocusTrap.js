import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Custom accessible focus trap hook for dialogs and modals.
 * - Saves and restores previous active element focus
 * - Moves focus into modal only on open transition (does not steal focus during typing/state updates)
 * - Traps Tab and Shift+Tab within modal focusable elements
 * - Listens for Escape key to trigger onClose
 */
export function useFocusTrap({ containerRef, isOpen, onClose, initialFocusRef }) {
  const previousActiveElement = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    // Capture the trigger element that opened the modal
    previousActiveElement.current = document.activeElement;

    const container = containerRef.current;
    if (!container) return;

    // Set initial focus on open transition only
    const timer = setTimeout(() => {
      if (initialFocusRef?.current && typeof initialFocusRef.current.focus === 'function') {
        initialFocusRef.current.focus();
      } else {
        const autoFocusEl = container.querySelector('[autofocus]');
        if (autoFocusEl && typeof autoFocusEl.focus === 'function') {
          autoFocusEl.focus();
        } else {
          const formInput = container.querySelector(
            'input:not([disabled]), textarea:not([disabled]), select:not([disabled])'
          );
          if (formInput && typeof formInput.focus === 'function') {
            formInput.focus();
          } else {
            const focusables = container.querySelectorAll(FOCUSABLE_SELECTOR);
            if (focusables.length > 0) {
              focusables[0].focus();
            } else {
              container.focus();
            }
          }
        }
      }
    }, 10);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (typeof onCloseRef.current === 'function') {
          onCloseRef.current();
        }
        return;
      }

      if (e.key !== 'Tab') return;

      const focusables = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }

      const firstElement = focusables[0];
      const lastElement = focusables[focusables.length - 1];

      if (e.shiftKey) {
        // Shift + Tab: backward cycling
        if (document.activeElement === firstElement || document.activeElement === container) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: forward cycling
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);

      // Restore focus to the element that was focused before opening
      if (
        previousActiveElement.current &&
        typeof previousActiveElement.current.focus === 'function'
      ) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen]); // Only rerun when isOpen transitions
}

export default useFocusTrap;
