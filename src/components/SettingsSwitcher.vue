<script setup>
import { useUIStore } from '../stores/ui'
import { useI18n } from 'vue-i18n'

const uiStore = useUIStore()
const { locale } = useI18n()

function toggleLanguage() {
  const newLocale = locale.value === 'de' ? 'en' : 'de'
  locale.value = newLocale
  uiStore.setLocale(newLocale)
}
</script>

<template>
  <div class="flex items-center gap-3">
    <!-- Language Switcher -->
    <button
      @click="toggleLanguage"
      class="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      :title="locale === 'de' ? 'Switch to English' : 'Zu Deutsch wechseln'"
    >
      <svg class="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
      </svg>
      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ locale.toUpperCase() }}</span>
    </button>

    <!-- Theme Switcher -->
    <button
      @click="uiStore.toggleTheme"
      class="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      :title="uiStore.theme === 'light' ? 'Dark Mode aktivieren' : 'Light Mode aktivieren'"
    >
      <!-- Sun icon (light mode) -->
      <svg v-if="uiStore.theme === 'light'" class="w-5 h-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
      <!-- Moon icon (dark mode) -->
      <svg v-else class="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
    </button>
  </div>
</template>
