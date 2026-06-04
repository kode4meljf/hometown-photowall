import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const httpBase = env.VITE_CLOUDBASE_HTTP_BASE || 'https://cloud1-d2g545zl57f7db2de-1419842609.ap-shanghai.app.tcloudbase.com'
  const apiPath = env.VITE_ADMIN_API_PATH || '/adminApi'

  const plugins: import('vite').PluginOption[] = [vue()]
  if (mode === 'production' && !env.VITE_ADMIN_API_URL) {
    plugins.push({
      name: 'require-admin-api-url',
      buildStart() {
        throw new Error(
          '生产构建必须设置 VITE_ADMIN_API_URL（CloudBase adminApi 完整 URL），参考 web/.env.example'
        )
      },
    })
  }

  return {
    plugins,
    server: {
      host: '0.0.0.0',
      port: 5174,
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
