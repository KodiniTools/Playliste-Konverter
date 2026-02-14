<script setup>
import { watch } from 'vue'
import { useConverterStore } from './stores/converter'
import { useUIStore } from './stores/ui'
import { useI18n } from 'vue-i18n'
import FileUploader from './components/FileUploader.vue'
import FileList from './components/FileList.vue'
import FormatSelector from './components/FormatSelector.vue'
import ConversionProgress from './components/ConversionProgress.vue'
import DownloadButton from './components/DownloadButton.vue'
import SizeWarning from './components/SizeWarning.vue'
import ToastContainer from './components/ToastContainer.vue'

const store = useConverterStore()
const uiStore = useUIStore()
const { t, locale } = useI18n()

// vue-i18n Locale mit UI-Store synchronisieren (gesteuert von SSI-Navigation)
watch(() => uiStore.locale, (newLocale) => {
  locale.value = newLocale
}, { immediate: true })
</script>

<template>
  <ToastContainer />
  <div class="min-h-screen bg-neutral-light dark:bg-dark py-4 sm:py-8 transition-colors">
    <div class="max-w-4xl mx-auto px-3 sm:px-4">
      <header class="mb-6 sm:mb-8">
        <div class="flex flex-col items-center text-center mb-4 gap-2">
          <div class="flex items-center gap-2 sm:gap-3">
            <a href="./" class="home-link flex-shrink-0" title="Home">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
            </a>
            <h1 class="text-xl sm:text-3xl font-bold text-dark dark:text-neutral-light">{{ t('app.title') }}</h1>
            <!-- PayPal Donation Button -->
            <form action="https://www.paypal.com/donate" method="post" target="_top" class="inline-block">
              <input type="hidden" name="hosted_button_id" value="8RGLGQ2BFMHU6" />
              <button type="submit" class="donate-btn" :title="t('donate.title')">
                <svg class="donate-btn-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
                <span class="hidden sm:inline text-sm">{{ t('donate.button') }}</span>
              </button>
            </form>
          </div>
          <p class="text-sm sm:text-base text-muted dark:text-neutral">{{ t('app.subtitle') }}</p>
        </div>
      </header>

      <div v-if="store.status === 'idle'" class="space-y-6">
        <FileUploader />
        <FileList v-if="store.files.length > 0" />

        <!-- Format Selector -->
        <FormatSelector v-if="store.files.length > 0" />

        <!-- Size Warning / All Clear -->
        <SizeWarning />

        <button
          v-if="store.files.length > 0"
          @click="store.convert"
          :disabled="store.isOverSizeLimit"
          :class="[
            'w-full py-3 rounded-lg font-semibold transition-colors',
            store.isOverSizeLimit
              ? 'bg-neutral dark:bg-muted text-neutral-light dark:text-muted-light cursor-not-allowed'
              : 'bg-accent text-dark hover:bg-accent-dark dark:bg-accent dark:text-dark dark:hover:bg-accent-dark'
          ]"
        >
          {{ store.files.length }} {{ t('button.convert') }}
        </button>
      </div>

      <ConversionProgress v-else-if="store.status !== 'done'" />

      <DownloadButton v-else />

      <div v-if="store.errorMessage" class="mt-4 p-4 bg-secondary-light/20 dark:bg-secondary-dark/30 border border-secondary dark:border-secondary-dark rounded-lg">
        <p class="text-secondary-dark dark:text-secondary-light">{{ store.errorMessage }}</p>
        <button @click="store.reset" class="mt-2 text-secondary dark:text-secondary-light underline">{{ t('error.reset') }}</button>
      </div>
    </div>
  </div>
</template>
