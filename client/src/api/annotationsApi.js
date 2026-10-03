import apiClient from './apiClient';

export const annotationsApi = {
  listForMessage: (chatId, messageId) =>
    apiClient.get(`/chats/${chatId}/messages/${messageId}/annotations`),
  create: (chatId, messageId, data) =>
    apiClient.post(`/chats/${chatId}/messages/${messageId}/annotations`, data),
  update: (annotationId, data) => apiClient.patch(`/annotations/${annotationId}`, data),
  delete: (annotationId) => apiClient.delete(`/annotations/${annotationId}`),
};

export default annotationsApi;
