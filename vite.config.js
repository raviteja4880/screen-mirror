import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy API requests to the backend during development
      '/health': 'http://localhost:3001',
      '/room': 'http://localhost:3001',
      '/create-room': 'http://localhost:3001',
    }
  }
})
