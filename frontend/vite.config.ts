import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'

const appRoutes = ['/login', '/register', '/projects', '/editor', '/profile', '/users']

const rewritePublicRoutes = {
  name: 'rewrite-public-app-routes',
  configureServer(server: any) {
    server.middlewares.use((request: any, _response: any, next: any) => {
      const pathname = request.url?.split('?')[0]
      if (appRoutes.includes(pathname)) request.url = '/app-shell.html'
      if (pathname === '/docs') request.url = '/docs.html'
      const localePage = pathname?.match(/^\/(ru|de|ja|zh)\/?$/)
      if (localePage) request.url = `/${localePage[1]}/index.html`
      next()
    })
  },
  configurePreviewServer(server: any) {
    server.middlewares.use((request: any, _response: any, next: any) => {
      const pathname = request.url?.split('?')[0]
      if (appRoutes.includes(pathname)) request.url = '/app-shell.html'
      if (pathname === '/docs') request.url = '/docs.html'
      const localePage = pathname?.match(/^\/(ru|de|ja|zh)\/?$/)
      if (localePage) request.url = `/${localePage[1]}/index.html`
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

const attachLocalizedEntryAssets = {
  name: 'attach-localized-landing-entry-assets',
  apply: 'build' as const,
  closeBundle() {
    const outputDirectory = new URL('./dist/', import.meta.url)
    const englishPath = new URL('index.html', outputDirectory)
    const englishHtml = readFileSync(englishPath, 'utf8')
    const entryAssets = englishHtml.match(/<(?:script type="module" crossorigin src="\/assets\/[^\"]+"><\/script>|link rel="modulepreload" crossorigin href="\/assets\/[^\"]+">|link rel="stylesheet" crossorigin href="\/assets\/[^\"]+">)/g)
    if (!entryAssets?.some((asset: string) => asset.startsWith('<script type="module"'))) {
      throw new Error('Could not locate the compiled marketing entry for localized landing pages')
    }
    for (const locale of ['ru', 'de', 'ja', 'zh']) {
      const localePath = new URL(`${locale}/index.html`, outputDirectory)
      let localeHtml = readFileSync(localePath, 'utf8')
      localeHtml = localeHtml.replace(/\s*<script type="module" src="\/src\/landing\.tsx"><\/script>/, '')
      localeHtml = localeHtml.replace('</head>', `    ${entryAssets.join('\n    ')}\n  </head>`)
      writeFileSync(localePath, localeHtml)
    }
  },
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), rewritePublicRoutes, removeE2ePublicHarness, attachLocalizedEntryAssets],
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
