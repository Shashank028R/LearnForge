import apiClient from './apiClient';

/**
 * Study Mode API client for Phase 08 Strict Study Mode & Active Recall.
 * Communicates strictly with authenticated backend study routes.
 */
export const studyApi = {
  /**
   * Create new session or resume existing active session for a topic.
   * POST /api/v1/topics/:topicId/study/sessions
   */
  createOrResumeSession: (topicId) =>
    apiClient.post(`/topics/${topicId}/study/sessions`),

  /**
   * Lists study sessions for the authenticated user.
   * GET /api/v1/study-sessions
   */
  listSessions: (params = {}) => {
    const query = new URLSearchParams();
    if (params.topicId) query.append('topicId', params.topicId);
    if (params.status) query.append('status', params.status);
    if (params.limit) query.append('limit', params.limit);
    if (params.skip) query.append('skip', params.skip);
    const qs = query.toString();
    return apiClient.get(`/study-sessions${qs ? `?${qs}` : ''}`);
  },

  /**
   * Retrieves full study session by ID with turn history.
   * GET /api/v1/study-sessions/:id
   */
  getSession: (id) =>
    apiClient.get(`/study-sessions/${id}`),

  /**
   * Submits an answer for the active question.
   * POST /api/v1/study-sessions/:id/answer
   * Body: { questionId, sessionVersion, clientTurnId, answer }
   */
  submitAnswer: (id, data) =>
    apiClient.post(`/study-sessions/${id}/answer`, data),

  /**
   * Advances already-evaluated session forward (ADVANCING -> next Q; REMEDIATING -> follow-up).
   * POST /api/v1/study-sessions/:id/continue
   * Body: { sessionVersion }
   */
  continueSession: (id, data = {}) =>
    apiClient.post(`/study-sessions/${id}/continue`, data),

  /**
   * Pauses an active study session.
   * POST /api/v1/study-sessions/:id/pause
   * Body: { sessionVersion }
   */
  pauseSession: (id, data = {}) =>
    apiClient.post(`/study-sessions/${id}/pause`, data),

  /**
   * Resumes a paused session back to its exact prior status.
   * POST /api/v1/study-sessions/:id/resume
   * Body: { sessionVersion }
   */
  resumeSession: (id, data = {}) =>
    apiClient.post(`/study-sessions/${id}/resume`, data),

  /**
   * Terminates study session permanently.
   * POST /api/v1/study-sessions/:id/exit
   * Body: { sessionVersion }
   */
  exitSession: (id, data = {}) =>
    apiClient.post(`/study-sessions/${id}/exit`, data),
};

export default studyApi;
