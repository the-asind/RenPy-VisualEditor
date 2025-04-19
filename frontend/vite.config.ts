import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000, // Match docker-compose port mapping
    host: true, // Needed for Docker container mapping
    strictPort: true,
     watch: {
       usePolling: true, // Use polling for file changes in Docker
     }
  }
})