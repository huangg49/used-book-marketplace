import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'LATLAI_')
  const devHost = env['LATLAI_DEV_ALLOWED_HOST']?.trim()
  const devApiOrigin = env['LATLAI_DEV_API_ORIGIN'] ??
    new URL(process.env['VITE_API_BASE_URL'] ?? 'http://localhost:3000', 'http://localhost:3000').origin
  let assetBase = '/'
  return {
    plugins: [
      react(),
      {
        name: 'book-detail-prefetch-assets',
        apply: 'build',
        configResolved(config) { assetBase = config.base },
        transformIndexHtml: {
          order: 'post',
          handler(_html, context) {
            const detail = Object.values(context.bundle ?? {}).find(chunk =>
              chunk.type === 'chunk' && chunk.facadeModuleId?.replaceAll('\\', '/')
                .endsWith('/src/pages/BookDetailPage.tsx'))
            if (!detail) return []
            const files = new Set<string>()
            function collect(file: string) {
              const chunk = context.bundle?.[file]
              if (!chunk || chunk.type !== 'chunk' || files.has(file)) return
              files.add(file)
              const css = (chunk as { viteMetadata?: { importedCss?: Set<string> } })
                .viteMetadata?.importedCss
              for (const file of css ?? []) files.add(file)
              for (const dependency of chunk.imports) collect(dependency)
            }
            collect(detail.fileName)
            return [{
              tag: 'meta',
              attrs: {
                name: 'latlai-book-detail-assets',
                content: JSON.stringify([...files].map(file => assetBase + file)),
              },
            }]
          },
        },
      },
    ],
    server: {
      host: true,
      port: 5174,
      allowedHosts: devHost ? [devHost] : true,
      proxy: {
        '/api': {
          target: devApiOrigin,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '/api'),
        },
        '/socket.io': {
          target: devApiOrigin,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    preview: {
      port: 4174,
    },
  }
})
