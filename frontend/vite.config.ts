import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { rmSync } from 'node:fs'

const appRoutes = ['/login', '/register', '/projects', '/editor', '/profile', '/users']

const rewritePublicRoutes = {
  name: 'rewrite-public-app-routes',
  configureServer(server: any) {
    server.middlewares.use((request: any, _response: any, next: any) => {
      const pathname = request.url?.split('?')[0]
      if (appRoutes.includes(pathname)) request.url = '/app-shell.html'
      if (pathname === '/docs') request.url = '/docs.html'
      next()
    })
  },
  configurePreviewServer(server: any) {
    server.middlewares.use((request: any, _response: any, next: any) => {
      const pathname = request.url?.split('?')[0]
      if (appRoutes.includes(pathname)) request.url = '/app-shell.html'
      if (pathname === '/docs') request.url = '/docs.html'
      next()
    })
  },
}

const removeE2ePublicHarness = {
  name: 'remove-e2e-public-harness',
  apply: 'build' as const,
  closeBundle() {
    rmSync(new URL('./dist/e2e', import.meta.url), { recursive: true, force: true })
  },
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), rewritePublicRoutes, removeE2ePublicHarness],
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        marketing: 'index.html',
        app: 'app-shell.html',
        docs: 'docs.html',
      },
    },
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
    proxy: {
      '/api': { target: 'http://127.0.0.1:9000', changeOrigin: true },
    },
    watch: {
      usePolling: true, // Use polling for file changes in Docker
    },
  },
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  }
})
