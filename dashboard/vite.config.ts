import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import { fileURLToPath, URL } from 'node:url'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@core': fileURLToPath(new URL('../src', import.meta.url)),
      '@demo': fileURLToPath(new URL('../preview', import.meta.url))
    },
    dedupe: ['vue', 'pinia', 'zod']
  },
  server: {
    proxy: {
      '/api': { target: process.env.BOT_API_URL ?? 'http://127.0.0.1:19335', ws: true },
      '/health': { target: process.env.BOT_API_URL ?? 'http://127.0.0.1:19335' }
    }
  },
  build: {
    outDir: resolve(process.env.BOT_WEB_DIR ?? '../dist'),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (id.includes('monaco-editor')) {
            return 'monaco'
          }
          if (id.includes('markstream') || id.includes('shiki')) {
            return 'markdown'
          }
        }
      }
    }
  }
})
