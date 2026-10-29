import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import { resolve } from 'node:path'

const root = import.meta.dirname

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    // Übersetzungen vorkompilieren → vue-i18n-Runtime-Build ohne Message-Compiler
    VueI18nPlugin({
      include: resolve(root, 'src/i18n/locales/**'),
      runtimeOnly: true,
      compositionOnly: true,
      fullInstall: false,
    }),
  ],
  base: '/playlistkonverter/',
  define: {
    // vue-i18n-Devtools im Produktions-Build entfernen (Tree-Shaking)
    __INTLIFY_PROD_DEVTOOLS__: false,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        app: resolve(root, 'app.html'),
        faq: resolve(root, 'faq.html'),
        funktion: resolve(root, 'funktion.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.spec.js'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3008',
        changeOrigin: true,
      },
    },
  },
})
