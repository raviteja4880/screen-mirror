const config = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3001',
  isProduction: import.meta.env.PROD,
  webrtc: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      // Production: add TURN servers here
    ]
  }
};

export default config;
