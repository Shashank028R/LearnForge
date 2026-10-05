import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Button,
  Badge,
  Icon,
  EmptyState,
  LoadingState,
  ErrorState,
} from '../components/ui';
import { studyApi } from '../api/studyApi';
import { subjectsApi, topicsApi } from '../api/subjectsApi';
import {
  StudyHeader,
  QuestionCard,
  AnswerComposer,
  EvaluationCard,
  RemediationCard,
  TurnHistory,
  StudyCompletedCard,
  StudyExitedCard,
} from '../components/study';

/**
 * StudyPage Component (Phase 08)
 * Strict Study Mode & Active Recall Frontend Workspace.
 * Authoritatively driven by backend StudySession state machine.
 */
export function StudyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlTopicId = searchParams.get('topicId');
  const urlSessionId = searchParams.get('sessionId');

  // Authoritative Session State
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [concurrencyNotice, setConcurrencyNotice] = useState(null);

  // In-flight Action States
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // View Sub-states
  const [showHistory, setShowHistory] = useState(false);

  // Draft Management & Stable Client Turn IDs (Blocker 1)
  const [draftsByQuestion, setDraftsByQuestion] = useState({});
  const clientTurnIdsRef = useRef({});
  const inFlightInitiationRef = useRef(null);
  const inFlightLoadRef = useRef(null);

  const getClientTurnId = useCallback((qId) => {
    if (!qId) return '';
    if (!clientTurnIdsRef.current[qId]) {
      clientTurnIdsRef.current[qId] = `turn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    return clientTurnIdsRef.current[qId];
  }, []);

  const handleDraftChange = useCallback((qId, text) => {
    if (!qId) return;
    setDraftsByQuestion((prev) => ({
      ...prev,
      [qId]: text,
    }));
  }, []);

  const clearQuestionDraft = useCallback((qId) => {
    if (!qId) return;
    setDraftsByQuestion((prev) => {
      if (!(qId in prev)) return prev;
      const next = { ...prev };
      delete next[qId];
      return next;
    });
  }, []);

  // Session Selector / Launcher State (when no session is active)
  const [recentSessions, setRecentSessions] = useState([]);
  const [subjectsList, setSubjectsList] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [topicsList, setTopicsList] = useState([]);
  const [loadingTopics, setLoadingTopics] = useState(false);

  // 1. Initial Load / URL Change Orchestration (Single Authoritative Initiation Path)
  useEffect(() => {
    if (urlSessionId) {
      loadSessionById(urlSessionId);
    } else if (urlTopicId) {
      initiateTopicSession(urlTopicId);
    } else {
      loadSessionSelectorData();
    }
  }, [urlSessionId, urlTopicId]);

  // Fetch session by ID
  const loadSessionById = async (id) => {
    if (!id) return;
    if (session?._id === id && !loading) return;
    if (inFlightLoadRef.current === id) return;
    inFlightLoadRef.current = id;
    try {
      setLoading(true);
      setError(null);
      setConcurrencyNotice(null);
      const res = await studyApi.getSession(id);
      const sessionDoc = res?.data || res;
      setSession(sessionDoc);
    } catch (err) {
      setError(err.message || 'Failed to load study session.');
      setSession(null);
    } finally {
      setLoading(false);
      inFlightLoadRef.current = null;
    }
  };

  // Create or Resume topic session (Guarded Single Flight)
  const initiateTopicSession = async (topicId) => {
    if (!topicId) return;
    if (inFlightInitiationRef.current === topicId) return;
    inFlightInitiationRef.current = topicId;
    try {
      setLoading(true);
      setError(null);
      setConcurrencyNotice(null);
      const res = await studyApi.createOrResumeSession(topicId);
      const sessionDoc = res?.session || res?.data?.session || res;
      setSession(sessionDoc);
      if (sessionDoc?._id) {
        setSearchParams({ sessionId: sessionDoc._id }, { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Failed to start study session for topic.');
      setSession(null);
    } finally {
      setLoading(false);
      inFlightInitiationRef.current = null;
    }
  };

  // Load Session Selector Data (recent sessions + subjects)
  const loadSessionSelectorData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [sessionsRes, subjectsRes] = await Promise.all([
        studyApi.listSessions({ limit: 10 }).catch(() => ({ sessions: [] })),
        subjectsApi.list().catch(() => ({ subjects: [] })),
      ]);

      const sessionList = Array.isArray(sessionsRes)
        ? sessionsRes
        : sessionsRes?.sessions || sessionsRes?.data || [];
      const subjList = Array.isArray(subjectsRes)
        ? subjectsRes
        : subjectsRes?.subjects || subjectsRes?.data || [];

      setRecentSessions(sessionList);
      setSubjectsList(subjList);
      setSession(null);
    } catch (err) {
      setError(err.message || 'Failed to load study overview.');
    } finally {
      setLoading(false);
    }
  };

  // When selected subject changes in launcher, load its topics
  const handleSubjectChange = async (subjectId) => {
    setSelectedSubjectId(subjectId);
    if (!subjectId) {
      setTopicsList([]);
      return;
    }
    try {
      setLoadingTopics(true);
      const res = await topicsApi.list(subjectId);
      const list = Array.isArray(res) ? res : res?.topics || res?.data || [];
      setTopicsList(list);
    } catch (_) {
      setTopicsList([]);
    } finally {
      setLoadingTopics(false);
    }
  };

  // Concurrency Conflict Reconciliation Helper
  const reconcileSessionState = async (customNotice = null) => {
    if (!session?._id) return;
    setConcurrencyNotice(
      customNotice ||
        'Your study session was updated in another tab. Synchronized with the latest state.'
    );
    try {
      const res = await studyApi.getSession(session._id);
      const latestDoc = res?.data || res;
      setSession(latestDoc);
    } catch (_) {}
  };

  // 2. Core Study Action Handlers

  // Submit Student Answer
  const handleSubmitAnswer = async ({ questionId, sessionVersion, clientTurnId, answer }) => {
    if (!session?._id) return;
    try {
      setIsSubmittingAnswer(true);
      setError(null);
      setConcurrencyNotice(null);

      const res = await studyApi.submitAnswer(session._id, {
        questionId,
        sessionVersion,
        clientTurnId,
        answer,
      });

      const updatedSession = res?.session || res?.data?.session || res;
      if (updatedSession) {
        setSession(updatedSession);
        // Clear draft only upon successful evaluation submission
        clearQuestionDraft(questionId);
      }
    } catch (err) {
      if (err.status === 409 || err.code === 'STALE_STUDY_STATE' || err.code === 'IDEMPOTENCY_KEY_REUSE_CONFLICT') {
        await reconcileSessionState('Your study session changed in another tab. Refreshing the latest session state.');
        // DRAFT IS PRESERVED for same logical question!
      } else if (err.code === 'EVALUATION_FAILED_RETRY_SAFE') {
        setError('Answer evaluation encountered a temporary error. The session was restored to a retry-safe state. Please try submitting again.');
        await reconcileSessionState();
        // DRAFT IS PRESERVED!
      } else {
        setError(err.message || 'Failed to submit answer.');
      }
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  // Continue Session (ADVANCING -> next Q; REMEDIATING -> follow-up; or COMPLETED)
  const handleContinue = async () => {
    if (!session?._id) return;
    try {
      setIsContinuing(true);
      setError(null);
      setConcurrencyNotice(null);

      const res = await studyApi.continueSession(session._id, {
        sessionVersion: session.sessionVersion,
      });

      const updatedSession = res?.data || res;
      if (updatedSession) {
        setSession(updatedSession);
      }
    } catch (err) {
      if (err.status === 409 || err.code === 'STALE_STUDY_STATE') {
        await reconcileSessionState('Session state was advanced elsewhere. Refreshed.');
      } else {
        setError(err.message || 'Failed to advance session.');
      }
    } finally {
      setIsContinuing(false);
    }
  };

  // Pause Active Session
  const handlePause = async () => {
    if (!session?._id) return;
    try {
      setIsPausing(true);
      setError(null);

      const res = await studyApi.pauseSession(session._id, {
        sessionVersion: session.sessionVersion,
      });

      const updatedSession = res?.data || res;
      if (updatedSession) {
        setSession(updatedSession);
      }
    } catch (err) {
      if (err.status === 409 || err.code === 'STALE_STUDY_STATE') {
        await reconcileSessionState();
      } else {
        setError(err.message || 'Failed to pause session.');
      }
    } finally {
      setIsPausing(false);
    }
  };

  // Resume Paused Session
  const handleResume = async () => {
    if (!session?._id) return;
    try {
      setIsResuming(true);
      setError(null);

      const res = await studyApi.resumeSession(session._id, {
        sessionVersion: session.sessionVersion,
      });

      const updatedSession = res?.data || res;
      if (updatedSession) {
        setSession(updatedSession);
      }
    } catch (err) {
      if (err.status === 409 || err.code === 'STALE_STUDY_STATE') {
        await reconcileSessionState();
      } else {
        setError(err.message || 'Failed to resume session.');
      }
    } finally {
      setIsResuming(false);
    }
  };

  // Exit Session Permanently
  const handleExit = async () => {
    if (!session?._id) return;
    try {
      setIsExiting(true);
      setError(null);

      const res = await studyApi.exitSession(session._id, {
        sessionVersion: session.sessionVersion,
      });

      const updatedSession = res?.data || res;
      if (updatedSession) {
        setSession(updatedSession);
      }
    } catch (err) {
      if (err.status === 409 || err.code === 'STALE_STUDY_STATE') {
        await reconcileSessionState();
      } else {
        setError(err.message || 'Failed to exit session.');
      }
    } finally {
      setIsExiting(false);
    }
  };

  // Reset & Start New Session (Single Authoritative Initiation Path)
  const handleStartNewSession = () => {
    const topicId = session?.topicId;
    setSession(null);
    if (topicId) {
      if (urlTopicId === topicId && !urlSessionId) {
        initiateTopicSession(topicId);
      } else {
        setSearchParams({ topicId });
      }
    } else {
      setSearchParams({});
    }
  };

  // Return to Subjects Overview
  const handleReturnToTopics = () => {
    if (session?.subjectId) {
      navigate(`/subjects/${session.subjectId}`);
    } else {
      navigate('/subjects');
    }
  };

  // --- Rendering Branches ---

  // 1. Loading Global State
  if (loading) {
    return (
      <div className="py-12">
        <LoadingState label="Preparing active recall study session..." />
      </div>
    );
  }

  // 2. Global Error with no session loaded
  if (error && !session) {
    return (
      <div className="py-8 space-y-4 max-w-xl mx-auto">
        <ErrorState
          title="Unable to load study session"
          message={error}
          actionLabel="Back to Study Overview"
          onAction={() => {
            setSearchParams({});
            loadSessionSelectorData();
          }}
        />
      </div>
    );
  }

  // 3. Session Selector / Launcher (when no active session is selected)
  if (!session) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-app-text-primary tracking-tight">
              Strict Study Mode
            </h1>
            <p className="text-xs text-app-text-secondary mt-0.5">
              Active recall & Socratic pedagogical tutoring. Choose a topic to begin.
            </p>
          </div>
        </div>

        {/* Start Topic Study Selector Card */}
        <section
          className="bg-app-surface border border-app-border rounded-lg p-5 shadow-sm space-y-4"
          aria-labelledby="start-study-heading"
        >
          <h2 id="start-study-heading" className="text-sm font-semibold text-app-text-primary flex items-center gap-2">
            <Icon name="play" size={16} className="text-brand-500" />
            Start a New Study Session
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Subject Selector */}
            <div className="space-y-1.5">
              <label htmlFor="select-subject" className="text-xs font-medium text-app-text-muted">
                Select Subject:
              </label>
              <select
                id="select-subject"
                value={selectedSubjectId}
                onChange={(e) => handleSubjectChange(e.target.value)}
                className="w-full rounded-md border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text-primary focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">-- Choose Subject --</option>
                {subjectsList.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.title || s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Topic Selector */}
            <div className="space-y-1.5">
              <label htmlFor="select-topic" className="text-xs font-medium text-app-text-muted">
                Select Topic:
              </label>
              <select
                id="select-topic"
                disabled={!selectedSubjectId || loadingTopics}
                onChange={(e) => {
                  if (e.target.value) {
                    setSearchParams({ topicId: e.target.value });
                  }
                }}
                className="w-full rounded-md border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text-primary focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
              >
                <option value="">
                  {loadingTopics ? 'Loading topics...' : '-- Choose Topic to Study --'}
                </option>
                {topicsList.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Recent / Active Sessions Directory */}
        {recentSessions.length > 0 ? (
          <section
            className="bg-app-surface border border-app-border rounded-lg p-5 shadow-sm space-y-4"
            aria-labelledby="recent-sessions-heading"
          >
            <h2 id="recent-sessions-heading" className="text-sm font-semibold text-app-text-primary flex items-center gap-2">
              <Icon name="history" size={16} />
              Recent Study Sessions
            </h2>

            <div className="space-y-2">
              {recentSessions.map((s) => (
                <div
                  key={s._id}
                  className="flex items-center justify-between p-3 rounded-md border border-app-border hover:bg-app-surface-hover transition-colors gap-3"
                >
                  <div className="space-y-1 truncate">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-app-text-primary truncate">
                        {s.title}
                      </span>
                      <Badge
                        variant={
                          s.status === 'COMPLETED'
                            ? 'success'
                            : s.status === 'PAUSED'
                            ? 'neutral'
                            : s.status === 'EXITED'
                            ? 'neutral'
                            : 'info'
                        }
                        size="sm"
                      >
                        {s.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-app-text-muted">
                      <span>{s.turns?.length || 0} turns</span>
                      <span>•</span>
                      <span>
                        Last active: {new Date(s.lastActivityAt || s.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSearchParams({ sessionId: s._id });
                    }}
                  >
                    {s.status === 'COMPLETED' || s.status === 'EXITED' ? 'View Review' : 'Resume Session'}
                  </Button>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <EmptyState
            icon={<Icon name="study" size={28} />}
            title="No active study sessions"
            description="Pick a subject and topic above to start active recall pedagogical study."
          />
        )}
      </div>
    );
  }

  // --- Active Study Workspace Session View ---
  const latestTurn = session.turns?.length > 0 ? session.turns[session.turns.length - 1] : null;
  const isPaused = session.status === 'PAUSED';
  const isCompleted = session.status === 'COMPLETED';
  const isExited = session.status === 'EXITED';
  const isEvaluating = session.status === 'EVALUATING' || session.status === 'ANSWER_PENDING';
  const isRemediating = session.status === 'REMEDIATING';
  const isAdvancing = session.status === 'ADVANCING';
  const isRechecking = session.status === 'RECHECKING';

  return (
    <div className="space-y-5 max-w-4xl mx-auto pb-12">
      {/* Session Header */}
      <StudyHeader
        session={session}
        onPause={handlePause}
        onResume={handleResume}
        onExit={handleExit}
        onToggleHistory={() => setShowHistory(!showHistory)}
        showHistory={showHistory}
        pausing={isPausing}
        resuming={isResuming}
        exiting={isExiting}
      />

      {/* Concurrency / Sync Notice Banner */}
      {concurrencyNotice && (
        <div
          className="bg-brand-50 border border-brand-200 text-brand-900 dark:bg-brand-900/30 dark:border-brand-800 dark:text-brand-200 px-4 py-2.5 rounded-md text-xs font-medium flex items-center justify-between"
          role="status"
        >
          <div className="flex items-center gap-2">
            <Icon name="info" size={14} />
            <span>{concurrencyNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setConcurrencyNotice(null)}
            className="text-brand-700 hover:text-brand-900 dark:text-brand-300"
            aria-label="Dismiss notice"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {/* Inline Non-Fatal Error Alert */}
      {error && (
        <div
          className="bg-status-danger-bg border border-status-danger/30 text-status-danger-text px-4 py-3 rounded-md text-xs font-medium flex items-center justify-between"
          role="alert"
        >
          <div className="flex items-center gap-2">
            <Icon name="alert" size={16} />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="hover:opacity-80"
            aria-label="Dismiss error"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {/* Turn History Drawer / Accordion */}
      {showHistory && (
        <TurnHistory
          turns={session.turns}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Main Pedagogical Workflow Views */}

      {/* State 1: COMPLETED */}
      {isCompleted && (
        <StudyCompletedCard
          session={session}
          onNewSession={handleStartNewSession}
          onReturnToTopics={handleReturnToTopics}
        />
      )}

      {/* State 2: EXITED */}
      {isExited && (
        <StudyExitedCard
          session={session}
          onNewSession={handleStartNewSession}
          onReturnToTopics={handleReturnToTopics}
        />
      )}

      {/* State 3: PAUSED */}
      {isPaused && (
        <section
          className="bg-app-surface border border-app-border rounded-lg p-6 text-center space-y-4 shadow-sm"
          aria-labelledby="paused-heading"
        >
          <div className="w-10 h-10 rounded-full bg-app-surface-muted text-app-text-muted flex items-center justify-center mx-auto">
            <Icon name="pause" size={20} />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h2 id="paused-heading" className="text-base font-bold text-app-text-primary">
              Study Session Paused
            </h2>
            <p className="text-xs text-app-text-secondary">
              Your active question context and reasoning draft are preserved.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={handleResume}
            disabled={isResuming}
            aria-label="Resume active recall session"
          >
            <Icon name="play" size={14} className="mr-1.5" />
            {isResuming ? 'Resuming...' : 'Resume Study Session'}
          </Button>
        </section>
      )}

      {/* State 4: ADVANCING (Turn evaluated as CORRECT -> Ready to advance) */}
      {isAdvancing && latestTurn && (
        <div className="space-y-4">
          <EvaluationCard
            evaluation={latestTurn.evaluation}
            userAnswer={latestTurn.userAnswer}
            canAdvance={true}
            onContinue={handleContinue}
            isContinuing={isContinuing}
          />
        </div>
      )}

      {/* State 5: REMEDIATING (Turn evaluated as INCORRECT / PARTIALLY_CORRECT -> Socratic loop) */}
      {isRemediating && latestTurn && (
        <div className="space-y-4">
          <EvaluationCard
            evaluation={latestTurn.evaluation}
            userAnswer={latestTurn.userAnswer}
            canAdvance={false}
          />
          <RemediationCard
            remediation={latestTurn.remediation}
            onContinue={handleContinue}
            isContinuing={isContinuing}
          />
        </div>
      )}

      {/* State 6: QUESTIONING or RECHECKING (Active recall prompt + Answer composer) */}
      {(!isCompleted && !isExited && !isPaused && !isAdvancing && !isRemediating) && (
        <div className="space-y-5">
          <QuestionCard
            question={session.activeQuestion}
            isFollowUp={isRechecking}
          />
          <AnswerComposer
            questionId={session.activeQuestion?.questionId}
            sessionVersion={session.sessionVersion}
            draftText={draftsByQuestion[session.activeQuestion?.questionId] || ''}
            clientTurnId={getClientTurnId(session.activeQuestion?.questionId)}
            onDraftChange={(text) => handleDraftChange(session.activeQuestion?.questionId, text)}
            onSubmit={handleSubmitAnswer}
            isSubmitting={isSubmittingAnswer}
            isEvaluating={isEvaluating}
            disabled={isEvaluating}
          />
        </div>
      )}
    </div>
  );
}

export default StudyPage;
