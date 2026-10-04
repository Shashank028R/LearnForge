import apiClient from './apiClient';

export const notesApi = {
  // Topic-anchored endpoints
  getTopicNote: (topicId) => apiClient.get(`/topics/${topicId}/note`),
  createInitialTopicNote: (topicId, data) => apiClient.post(`/topics/${topicId}/note`, data),
  synthesizeProposal: (topicId, data = {}) => apiClient.post(`/topics/${topicId}/notes/synthesize`, data),

  // Note Document endpoints
  list: (params = {}) => {
    const query = new URLSearchParams();
    if (params.subjectId) query.append('subjectId', params.subjectId);
    if (params.page) query.append('page', params.page);
    if (params.limit) query.append('limit', params.limit);
    const qs = query.toString();
    return apiClient.get(`/notes${qs ? `?${qs}` : ''}`);
  },
  get: (noteId) => apiClient.get(`/notes/${noteId}`),
  update: (noteId, data) => apiClient.put(`/notes/${noteId}`, data),

  // Version History & Restore endpoints
  getVersions: (noteId, params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.append('page', params.page);
    if (params.limit) query.append('limit', params.limit);
    const qs = query.toString();
    return apiClient.get(`/notes/${noteId}/versions${qs ? `?${qs}` : ''}`);
  },
  getVersion: (noteId, versionNumber) => apiClient.get(`/notes/${noteId}/versions/${versionNumber}`),
  restoreVersion: (noteId, versionNumber, baseVersion) =>
    apiClient.post(`/notes/${noteId}/versions/${versionNumber}/restore`, { baseVersion }),

  // Proposal endpoints
  getProposals: (noteId, params = {}) => {
    const query = new URLSearchParams();
    if (params.status) query.append('status', params.status);
    if (params.page) query.append('page', params.page);
    if (params.limit) query.append('limit', params.limit);
    const qs = query.toString();
    return apiClient.get(`/notes/${noteId}/proposals${qs ? `?${qs}` : ''}`);
  },
  getProposal: (proposalId) => apiClient.get(`/notes/proposals/${proposalId}`),
  approveProposal: (proposalId, baseVersion) =>
    apiClient.post(`/notes/proposals/${proposalId}/approve`, { baseVersion }),
  rejectProposal: (proposalId, reason) =>
    apiClient.post(`/notes/proposals/${proposalId}/reject`, { reason }),
};

export default notesApi;
