import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { rmSync } from 'node:fs'

const removeE2ePublicHarness = {
  name: 'remove-e2e-public-harness',
  apply: 'build' as const,
  closeBundle() {
    rmSync(new URL('./dist/e2e', import.meta.url), { recursive: true, force: true })
  },
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), removeE2ePublicHarness],
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
  server: {
    port: 3000, // Match docker-compose port mapping
    host: true, // Needed for Docker container mapping
    strictPort: true,
    watch: {
      usePolling: true, // Use polling for file changes in Docker
    },
  },
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  }
})
