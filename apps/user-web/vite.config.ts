import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'LATLAI_')
  const devHost = env['LATLAI_DEV_ALLOWED_HOST']?.trim()
  const devApiOrigin = env['LATLAI_DEV_API_ORIGIN'] ??
    new URL(process.env['VITE_API_BASE_URL'] ?? 'http://localhost:3000', 'http://localhost:3000').origin
  return {
    plugins: [react()],
    server: {
      port: 5174,
      allowedHosts: devHost ? [devHost] : [],
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
