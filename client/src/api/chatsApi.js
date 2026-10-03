import apiClient from './apiClient';

export const chatsApi = {
  list: (params = {}) => {
    const query = new URLSearchParams();
    if (params.status) query.append('status', params.status);
    if (params.subjectId) query.append('subjectId', params.subjectId);
    if (params.topicId) query.append('topicId', params.topicId);
    if (params.search) query.append('search', params.search);
    if (params.page) query.append('page', params.page);
    if (params.limit) query.append('limit', params.limit);
    const queryString = query.toString();
    return apiClient.get(`/chats${queryString ? `?${queryString}` : ''}`);
  },

  get: (chatId) => apiClient.get(`/chats/${chatId}`),

  create: (data) => apiClient.post('/chats', data),

  update: (chatId, data) => apiClient.put(`/chats/${chatId}`, data),

  delete: (chatId) => apiClient.delete(`/chats/${chatId}`),

  listMessages: (chatId, params = {}) => {
    const query = new URLSearchParams();
    if (params.limit) query.append('limit', params.limit);
    if (params.beforeSequence !== undefined) query.append('beforeSequence', params.beforeSequence);
    const queryString = query.toString();
    return apiClient.get(`/chats/${chatId}/messages${queryString ? `?${queryString}` : ''}`);
  },

  sendMessage: (chatId, data) => apiClient.post(`/chats/${chatId}/messages`, data),
};

export default chatsApi;
