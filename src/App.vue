<script setup>
import { onMounted } from 'vue'
import { useConverterStore } from './stores/converter'
import { useUIStore } from './stores/ui'
import { useI18n } from 'vue-i18n'
import FileUploader from './components/FileUploader.vue'
import FileList from './components/FileList.vue'
import FormatSelector from './components/FormatSelector.vue'
import ConversionProgress from './components/ConversionProgress.vue'
import DownloadButton from './components/DownloadButton.vue'
import SettingsSwitcher from './components/SettingsSwitcher.vue'
import FAQ from './components/FAQ.vue'
import SizeWarning from './components/SizeWarning.vue'
import ToastContainer from './components/ToastContainer.vue'

const store = useConverterStore()
const uiStore = useUIStore()
const { t } = useI18n()

onMounted(() => {
  // Theme initialisieren beim App-Start
  uiStore.theme // Triggert den watcher im UI store
})
</script>

<template>
  <ToastContainer />
  <div class="min-h-screen bg-neutral-light dark:bg-dark py-8 transition-colors">
    <div class="max-w-4xl mx-auto px-4">
      <header class="mb-8">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h1 class="text-3xl font-bold text-dark dark:text-neutral-light">{{ t('app.title') }}</h1>
            <p class="text-muted dark:text-neutral mt-2">{{ t('app.subtitle') }}</p>
            <p class="text-sm text-secondary dark:text-secondary-light mt-1">{{ t('app.warning') }}</p>
          </div>
          <div class="flex items-center gap-3">
            <SettingsSwitcher />
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

      <!-- FAQ Section -->
      <div class="mt-12">
        <FAQ />
      </div>
    </div>
  </div>
</template>
