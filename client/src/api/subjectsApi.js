import apiClient from './apiClient';

export const subjectsApi = {
  list: () => apiClient.get('/subjects'),
  get: (subjectId) => apiClient.get(`/subjects/${subjectId}`),
  create: (data) => apiClient.post('/subjects', data),
  update: (subjectId, data) => apiClient.put(`/subjects/${subjectId}`, data),
  delete: (subjectId) => apiClient.delete(`/subjects/${subjectId}`),
};

export const topicsApi = {
  list: (subjectId) => apiClient.get(`/topics?subjectId=${encodeURIComponent(subjectId)}`),
  get: (topicId) => apiClient.get(`/topics/${topicId}`),
  create: (data) => apiClient.post('/topics', data),
  update: (topicId, data) => apiClient.put(`/topics/${topicId}`, data),
  delete: (topicId) => apiClient.delete(`/topics/${topicId}`),
};

export default {
  subjects: subjectsApi,
  topics: topicsApi,
};
