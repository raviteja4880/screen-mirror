import config from '../config';

const handleResponse = async (response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'API request failed');
  }
  return response.json();
};

export const api = {
  createRoom: async () => {
    const response = await fetch(`${config.apiUrl}/create-room`);
    return handleResponse(response);
  },

  getRoomDetails: async (roomId) => {
    const response = await fetch(`${config.apiUrl}/room/${roomId}`);
    return handleResponse(response);
  },

  checkHealth: async () => {
    const response = await fetch(`${config.apiUrl}/health`);
    return handleResponse(response);
  },
};

export default api;
