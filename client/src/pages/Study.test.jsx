import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StudyPage } from './StudyPage';
import { studyApi } from '../api/studyApi';
import { subjectsApi, topicsApi } from '../api/subjectsApi';

vi.mock('../api/studyApi', () => ({
  studyApi: {
    createOrResumeSession: vi.fn(),
    listSessions: vi.fn(),
    getSession: vi.fn(),
    submitAnswer: vi.fn(),
    continueSession: vi.fn(),
    pauseSession: vi.fn(),
    resumeSession: vi.fn(),
    exitSession: vi.fn(),
  },
}));

vi.mock('../api/subjectsApi', () => ({
  subjectsApi: {
    list: vi.fn(),
    get: vi.fn(),
  },
  topicsApi: {
    list: vi.fn(),
    get: vi.fn(),
  },
}));

const mockTopic = {
  _id: 'top-101',
  title: 'Raft Consensus Protocol',
};

const mockQuestioningSession = {
  _id: 'session-001',
  userId: 'usr-1',
  subjectId: 'subj-1',
  topicId: 'top-101',
  title: 'Raft Consensus Protocol — Active Recall',
  status: 'QUESTIONING',
  sessionVersion: 1,
  sequenceCounter: 0,
  syllabusVersionNumber: 2,
  activeQuestion: {
    questionId: 'q-001',
    questionType: 'mechanism',
    prompt: 'Explain the fundamental mechanism of Randomized Election Timers in Raft.',
    targetConceptNames: ['Randomized Election Timers'],
    expectedReasoningSignals: [
      'Define what Randomized Election Timers is.',
      'Explain how randomized durations prevent split votes.',
    ],
    difficultyIntent: 'intermediate',
  },
  evaluationState: { status: 'IDLE' },
  turns: [],
  metrics: {
    totalQuestionsAsked: 1,
    totalAnswersSubmitted: 0,
    correctCount: 0,
    remediationsCount: 0,
  },
  isActive: true,
};

const mockAdvancingSession = {
  ...mockQuestioningSession,
  status: 'ADVANCING',
  sessionVersion: 3,
  turns: [
    {
      _id: 'turn-1',
      turnIndex: 0,
      clientTurnId: 'turn-client-1',
      attemptType: 'INITIAL',
      question: mockQuestioningSession.activeQuestion,
      userAnswer: 'Randomized timers stagger candidate election timeouts to prevent split votes.',
      evaluation: {
        verdict: 'CORRECT',
        correctness: 90,
        completeness: 85,
        feedback: 'Accurately explained the election timer stagger mechanism.',
        strengths: ['Addressed split vote prevention.'],
        weaknesses: [],
        missingConcepts: [],
      },
    },
  ],
};

const mockRemediatingSession = {
  ...mockQuestioningSession,
  status: 'REMEDIATING',
  sessionVersion: 3,
  turns: [
    {
      _id: 'turn-1',
      turnIndex: 0,
      clientTurnId: 'turn-client-1',
      attemptType: 'INITIAL',
      question: mockQuestioningSession.activeQuestion,
      userAnswer: 'Nodes wait for a timer.',
      evaluation: {
        verdict: 'PARTIALLY_CORRECT',
        correctness: 50,
        completeness: 40,
        feedback: 'Your explanation is missing the split-vote prevention rationale.',
        strengths: ['Mentioned timer wait.'],
        weaknesses: ['Need to explain what happens when split vote occurs.'],
        missingConcepts: ['Split Vote Prevention'],
      },
      remediation: {
        remediationText: 'Remember that if all followers timed out simultaneously, they would all become candidates at once.',
        followUpQuestion: 'How does the random duration between 150-300ms ensure a single candidate emerges with a majority?',
      },
    },
  ],
};

const mockRecheckingSession = {
  ...mockQuestioningSession,
  status: 'RECHECKING',
  sessionVersion: 4,
  activeQuestion: {
    questionId: 'q-followup-001',
    questionType: 'explain_in_own_words',
    prompt: 'How does the random duration between 150-300ms ensure a single candidate emerges with a majority?',
    targetConceptNames: ['Randomized Election Timers'],
  },
  turns: mockRemediatingSession.turns,
};

const mockCompletedSession = {
  ...mockAdvancingSession,
  status: 'COMPLETED',
  isActive: false,
  metrics: {
    totalQuestionsAsked: 3,
    totalAnswersSubmitted: 4,
    correctCount: 3,
    remediationsCount: 1,
  },
};

const mockPausedSession = {
  ...mockQuestioningSession,
  status: 'PAUSED',
  pausedFromStatus: 'QUESTIONING',
};

const mockExitedSession = {
  ...mockQuestioningSession,
  status: 'EXITED',
  isActive: false,
};

describe('StudyPage — Phase 08 Strict Study Mode Frontend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. renders topic session launcher when no session is active', async () => {
    studyApi.listSessions.mockResolvedValue({ sessions: [mockQuestioningSession] });
    subjectsApi.list.mockResolvedValue({ subjects: [{ _id: 'subj-1', title: 'Distributed Systems' }] });

    render(
      <MemoryRouter initialEntries={['/study']}>
        <StudyPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /strict study mode/i })).toBeDefined();
    });

    expect(screen.getByText(/Start a New Study Session/i)).toBeDefined();
    expect(screen.getByText(/Recent Study Sessions/i)).toBeDefined();
  });

  it('2. renders active recall question prompt and composer when in QUESTIONING state', async () => {
    studyApi.getSession.mockResolvedValue(mockQuestioningSession);

    render(
      <MemoryRouter initialEntries={['/study?sessionId=session-001']}>
        <StudyPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Explain the fundamental mechanism of Randomized Election Timers in Raft/i)
      ).toBeDefined();
    });

    expect(screen.getByText(/Active Question/i)).toBeDefined();
    expect(screen.getByLabelText(/Your Explanation \/ Reasoning:/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /submit answer/i })).toBeDefined();
  });

  it('3. submits student answer with questionId, sessionVersion, and stable clientTurnId', async () => {
    studyApi.getSession.mockResolvedValue(mockQuestioningSession);
    studyApi.submitAnswer.mockResolvedValue({
      idempotent: false,
      session: mockAdvancingSession,
    });

    render(
      <MemoryRouter initialEntries={['/study?sessionId=session-001']}>
        <StudyPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Your Explanation \/ Reasoning:/i)).toBeDefined();
    });

    const textarea = screen.getByLabelText(/Your Explanation \/ Reasoning:/i);
    fireEvent.change(textarea, {
      target: { value: 'Randomized timers prevent concurrent candidate split votes.' },
    });

    const submitBtn = screen.getByRole('button', { name: /submit answer/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(studyApi.submitAnswer).toHaveBeenCalledWith(
        'session-001',
        expect.objectContaining({
          questionId: 'q-001',
          sessionVersion: 1,
          answer: 'Randomized timers prevent concurrent candidate split votes.',
          clientTurnId: expect.stringMatching(/^turn_\d+_/),
        })
      );
    });
  });

  it('4. supports keyboard shortcut (Ctrl+Enter) for answer submission', async () => {
    studyApi.getSession.mockResolvedValue(mockQuestioningSession);
    studyApi.submitAnswer.mockResolvedValue({
      idempotent: false,
      session: mockAdvancingSession,
    });

    render(
      <MemoryRouter initialEntries={['/study?sessionId=session-001']}>
        <StudyPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Your Explanation \/ Reasoning:/i)).toBeDefined();
    });

    const textarea = screen.getByLabelText(/Your Explanation \/ Reasoning:/i);
    fireEvent.change(textarea, {
      target: { value: 'Keyboard shortcut submission test.' },
    });
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    await waitFor(() => {
      expect(studyApi.submitAnswer).toHaveBeenCalled();
    });
  });

  it('5. renders evaluation card when session enters ADVANCING state', async () => {
    studyApi.getSession.mockResolvedValue(mockAdvancingSession);

    render(
      <MemoryRouter initialEntries={['/study?sessionId=session-001']}>
        <StudyPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Demonstrated Understanding \(Correct\)/i)).toBeDefined();
    });

    expect(
      screen.getByText(/Accurately explained the election timer stagger mechanism/i)
    ).toBeDefined();
    expect(screen.getByText(/Key Strengths:/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /continue to next question/i })).toBeDefined();
  });

  it('6. advances to next question when Continue button is clicked in ADVANCING state', async () => {
    studyApi.getSession.mockResolvedValue(mockAdvancingSession);
    studyApi.continueSession.mockResolvedValue(mockQuestioningSession);

    render(
      <MemoryRouter initialEntries={['/study?sessionId=session-001']}>
        <StudyPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /continue to next question/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /continue to next question/i }));

    await waitFor(() => {
      expect(studyApi.continueSession).toHaveBeenCalledWith('session-001', {
        sessionVersion: 3,
      });
    });
  });

  it('7. renders Socratic remediation card when session enters REMEDIATING state', async () => {
    studyApi.getSession.mockResolvedValue(mockRemediatingSession);

    render(
      <MemoryRouter initialEntries={['/study?sessionId=session-001']}>
        <StudyPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Socratic Remediation & Deepening/i)).toBeDefined();
    });

    expect(
      screen.getByText(/Remember that if all followers timed out simultaneously/i)
    ).toBeDefined();
    expect(screen.getByRole('button', { name: /answer follow-up question/i })).toBeDefined();
  });

  it('8. transitions to RECHECKING state and displays Socratic follow-up question', async () => {
    studyApi.getSession.mockResolvedValue(mockRecheckingSession);

    render(
      <MemoryRouter initialEntries={['/study?sessionId=session-001']}>
        <StudyPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Socratic Follow-Up/i).length).toBeGreaterThanOrEqual(1);
    });

    expect(
      screen.getByText(/How does the random duration between 150-300ms ensure a single candidate emerges/i)
    ).toBeDefined();
    expect(screen.getByRole('button', { name: /submit answer/i })).toBeDefined();
  });

  it('9. renders completion screen with genuine session metrics on COMPLETED state', async () => {
    studyApi.getSession.mockResolvedValue(mockCompletedSession);

    render(
      <MemoryRouter initialEntries={['/study?sessionId=session-001']}>
        <StudyPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Topic Study Completed/i)).toBeDefined();
    });

    expect(screen.getByText('Direct Correct')).toBeDefined();
    expect(screen.getByRole('button', { name: /start new session on topic/i })).toBeDefined();
  });

  it('10. renders paused screen with resume action when session is PAUSED', async () => {
    studyApi.getSession.mockResolvedValue(mockPausedSession);
    studyApi.resumeSession.mockResolvedValue(mockQuestioningSession);

    render(
      <MemoryRouter initialEntries={['/study?sessionId=session-001']}>
        <StudyPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Study Session Paused/i)).toBeDefined();
    });

    const resumeBtn = screen.getByRole('button', { name: /resume study session/i });
    fireEvent.click(resumeBtn);

    await waitFor(() => {
      expect(studyApi.resumeSession).toHaveBeenCalledWith('session-001', {
        sessionVersion: 1,
      });
    });
  });

  it('11. renders terminal screen when session is EXITED', async () => {
    studyApi.getSession.mockResolvedValue(mockExitedSession);

    render(
      <MemoryRouter initialEntries={['/study?sessionId=session-001']}>
        <StudyPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Study Session Exited/i)).toBeDefined();
    });

    expect(screen.getByText(/This study session has been terminated and sealed/i)).toBeDefined();
  });

  it('12. reconciles session state on HTTP 409 stale sessionVersion conflict', async () => {
    studyApi.getSession
      .mockResolvedValueOnce(mockQuestioningSession)
      .mockResolvedValueOnce(mockAdvancingSession);

    const conflictErr = new Error('Stale study session version.');
    conflictErr.status = 409;
    conflictErr.code = 'STALE_STUDY_STATE';
    studyApi.submitAnswer.mockRejectedValueOnce(conflictErr);

    render(
      <MemoryRouter initialEntries={['/study?sessionId=session-001']}>
        <StudyPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Your Explanation \/ Reasoning:/i)).toBeDefined();
    });

    const textarea = screen.getByLabelText(/Your Explanation \/ Reasoning:/i);
    fireEvent.change(textarea, { target: { value: 'Answer with stale version.' } });
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));

    await waitFor(() => {
      expect(screen.getByText(/Your study session changed in another tab\. Refreshing the latest session state\./i)).toBeDefined();
    });

    // Verifies getSession refetched the latest state
    expect(studyApi.getSession).toHaveBeenCalledTimes(2);
  });

  it('13. handles evaluation crash recovery safely (EVALUATION_FAILED_RETRY_SAFE)', async () => {
    studyApi.getSession
      .mockResolvedValueOnce(mockQuestioningSession)
      .mockResolvedValueOnce(mockQuestioningSession);

    const evalFailErr = new Error('Evaluation service unavailable.');
    evalFailErr.code = 'EVALUATION_FAILED_RETRY_SAFE';
    studyApi.submitAnswer.mockRejectedValueOnce(evalFailErr);

    render(
      <MemoryRouter initialEntries={['/study?sessionId=session-001']}>
        <StudyPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Your Explanation \/ Reasoning:/i)).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText(/Your Explanation \/ Reasoning:/i), {
      target: { value: 'Answer encountering crash.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Answer evaluation encountered a temporary error. The session was restored to a retry-safe state/i)
      ).toBeDefined();
    });
  });

  it('14. toggles and displays session turn history', async () => {
    studyApi.getSession.mockResolvedValue(mockAdvancingSession);

    render(
      <MemoryRouter initialEntries={['/study?sessionId=session-001']}>
        <StudyPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /toggle turn history/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /toggle turn history/i }));

    await waitFor(() => {
      expect(screen.getByText(/Session History \(1 Turn\)/i)).toBeDefined();
    });

    // Click to expand turn #1
    fireEvent.click(screen.getByText(/#1/));

    await waitFor(() => {
      expect(
        screen.getAllByText(/Randomized timers stagger candidate election timeouts to prevent split votes/i).length
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it('15. pauses session when Pause button is clicked in header', async () => {
    studyApi.getSession.mockResolvedValue(mockQuestioningSession);
    studyApi.pauseSession.mockResolvedValue(mockPausedSession);

    render(
      <MemoryRouter initialEntries={['/study?sessionId=session-001']}>
        <StudyPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pause study session/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /pause study session/i }));

    await waitFor(() => {
      expect(studyApi.pauseSession).toHaveBeenCalledWith('session-001', {
        sessionVersion: 1,
      });
    });
  });
});
