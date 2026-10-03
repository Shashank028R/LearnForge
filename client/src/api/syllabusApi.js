import apiClient from './apiClient';

export const syllabusApi = {
  getStatus: (subjectId) => apiClient.get(`/subjects/${subjectId}/syllabus`),
  listVersions: (subjectId) => apiClient.get(`/subjects/${subjectId}/syllabus/versions`),
  createDraft: (subjectId, data) => apiClient.post(`/subjects/${subjectId}/syllabus/versions`, data),
  getVersion: (subjectId, versionId) =>
    apiClient.get(`/subjects/${subjectId}/syllabus/versions/${versionId}`),
  updateDraft: (subjectId, versionId, data) =>
    apiClient.put(`/subjects/${subjectId}/syllabus/versions/${versionId}`, data),
  approveVersion: (subjectId, versionId) =>
    apiClient.post(`/subjects/${subjectId}/syllabus/versions/${versionId}/approve`),
};

export default syllabusApi;
