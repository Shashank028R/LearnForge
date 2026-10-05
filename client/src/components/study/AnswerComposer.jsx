import React, { useState, useEffect, useRef } from 'react';
import { Button, Icon } from '../ui';

const MAX_ANSWER_CHARS = 20000;

export function AnswerComposer({
  questionId,
  sessionVersion,
  draftText = '',
  clientTurnId,
  onDraftChange,
  onSubmit,
  isSubmitting = false,
  isEvaluating = false,
  disabled = false,
}) {
  const [internalText, setInternalText] = useState(draftText);
  const [validationError, setValidationError] = useState(null);
  const textareaRef = useRef(null);

  // Fallback clientTurnId if not provided by parent
  const fallbackTurnIdRef = useRef('');

  const activeTurnId = clientTurnId || fallbackTurnIdRef.current;
  const currentText = onDraftChange ? draftText : internalText;

  useEffect(() => {
    if (!clientTurnId) {
      fallbackTurnIdRef.current = `turn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    setValidationError(null);
    if (textareaRef.current && !disabled) {
      textareaRef.current.focus();
    }
  }, [questionId, clientTurnId]);

  const handleTextChange = (text) => {
    if (onDraftChange) {
      onDraftChange(text);
    } else {
      setInternalText(text);
    }
    if (validationError) setValidationError(null);
  };

  const charCount = currentText.length;
  const isTooLong = charCount > MAX_ANSWER_CHARS;
  const isEmpty = currentText.trim().length === 0;
  const isBusy = isSubmitting || isEvaluating;

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (isBusy || disabled) return;

    if (isEmpty) {
      setValidationError('Please compose your answer before submitting.');
      textareaRef.current?.focus();
      return;
    }

    if (isTooLong) {
      setValidationError(`Answer exceeds the maximum limit of ${MAX_ANSWER_CHARS.toLocaleString()} characters.`);
      return;
    }

    setValidationError(null);
    if (onSubmit) {
      onSubmit({
        questionId,
        sessionVersion,
        clientTurnId: activeTurnId,
        answer: currentText.trim(),
      });
    }
  };

  const handleKeyDown = (e) => {
    // Ctrl+Enter or Cmd+Enter submits answer
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-app-surface border border-app-border rounded-lg p-5 shadow-sm space-y-4"
      aria-label="Answer composition form"
    >
      <div className="flex items-center justify-between">
        <label
          htmlFor="student-answer-input"
          className="text-sm font-semibold text-app-text-primary"
        >
          Your Explanation / Reasoning:
        </label>
        <span
          className={`text-xs font-mono ${
            isTooLong
              ? 'text-status-danger font-semibold'
              : 'text-app-text-muted'
          }`}
          aria-live="polite"
        >
          {charCount.toLocaleString()} / {MAX_ANSWER_CHARS.toLocaleString()}
        </span>
      </div>

      <div className="relative">
        <textarea
          id="student-answer-input"
          ref={textareaRef}
          value={currentText}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isBusy || disabled}
          placeholder="Explain the mechanism step-by-step in your own words. Address the key invariants, components, and why this design is required..."
          rows={6}
          className="w-full rounded-md border border-app-border bg-app-bg px-3.5 py-3 text-sm text-app-text-primary placeholder:text-app-text-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-60 disabled:cursor-not-allowed resize-y transition-colors leading-relaxed font-sans"
          aria-invalid={Boolean(validationError || isTooLong)}
          aria-describedby={validationError ? 'composer-error-msg' : undefined}
        />
      </div>

      {validationError && (
        <p
          id="composer-error-msg"
          className="text-xs text-status-danger font-medium flex items-center gap-1.5"
          role="alert"
        >
          <Icon name="alert" size={14} />
          {validationError}
        </p>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
        <span className="text-xs text-app-text-muted flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-app-surface-muted border border-app-border rounded">
            Ctrl
          </kbd>
          +
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-app-surface-muted border border-app-border rounded">
            Enter
          </kbd>
          to submit
        </span>

        <Button
          type="submit"
          variant="primary"
          disabled={isBusy || disabled || isEmpty || isTooLong}
          className="min-w-[140px]"
          aria-busy={isBusy}
        >
          {isBusy ? (
            <span className="flex items-center gap-2">
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Evaluating...
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Icon name="send" size={14} />
              Submit Answer
            </span>
          )}
        </Button>
      </div>
    </form>
  );
}

export default AnswerComposer;
