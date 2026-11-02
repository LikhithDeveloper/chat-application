import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The dev server forwards /api and /socket.io to the backend, so the browser sees ONE origin.
// That is what lets the strict, httpOnly refresh cookie work without any CORS tricks.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
      '/socket.io': { target: 'http://localhost:5000', ws: true },
    },
  },
})
