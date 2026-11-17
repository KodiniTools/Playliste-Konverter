import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import { resolve } from 'node:path'
import { PAGES } from './src/landing/pages'
import { localizeHtml } from './src/utils/localizeHtml'

const root = import.meta.dirname

/**
 * Schreibt neben jede der vier Seiten (index, app, faq, funktion) eine englische Fassung
 * *.en.html mit englischem <html lang>, Titel, Description und Canonical (?lang=en).
 * nginx liefert sie für ?lang=en aus (deploy/nginx-playlistkonverter.conf), damit Crawler
 * ohne JavaScript schon im HTML Englisch sehen. Laufzeit-i18n bleibt unverändert.
 */
function localizedPages() {
  return {
    name: 'localized-pages',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const [key, page] of Object.entries(PAGES)) {
        const file = bundle[`${key}.html`]
        if (!file || file.type !== 'asset') {
          this.error(`localized-pages: ${key}.html fehlt im Bundle`)
        }
        const html =
          typeof file.source === 'string' ? file.source : new TextDecoder().decode(file.source)
        this.emitFile({
          type: 'asset',
          fileName: `${key}.en.html`,
          source: localizeHtml(html, { lang: 'en', ...page.en, canonical: `${page.url}?lang=en` }),
        })
      }
    },
  }
}

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
    localizedPages(),
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
