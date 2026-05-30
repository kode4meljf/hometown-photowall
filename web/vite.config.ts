import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const httpBase = env.VITE_CLOUDBASE_HTTP_BASE || 'https://cloud1-d2g545zl57f7db2de-1419842609.ap-shanghai.app.tcloudbase.com'
  const apiPath = env.VITE_ADMIN_API_PATH || '/adminApi'

  return {
    plugins: [vue()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api/admin': {
          target: httpBase,
          changeOrigin: true,
          rewrite: () => apiPath
        }
      }
    }
  }
})
