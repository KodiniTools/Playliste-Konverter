<script setup>
import { onMounted } from 'vue'
import { useConverterStore } from './stores/converter'
import { useUIStore } from './stores/ui'
import { useI18n } from 'vue-i18n'
import FileUploader from './components/FileUploader.vue'
import FileList from './components/FileList.vue'
import ConversionProgress from './components/ConversionProgress.vue'
import DownloadButton from './components/DownloadButton.vue'
import SettingsSwitcher from './components/SettingsSwitcher.vue'
import FAQ from './components/FAQ.vue'
import SizeWarning from './components/SizeWarning.vue'

const store = useConverterStore()
const uiStore = useUIStore()
const { t } = useI18n()

onMounted(() => {
  // Theme initialisieren beim App-Start
  uiStore.theme // Triggert den watcher im UI store
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 transition-colors">
    <div class="max-w-4xl mx-auto px-4">
      <header class="mb-8">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">{{ t('app.title') }}</h1>
            <p class="text-gray-600 dark:text-gray-400 mt-2">{{ t('app.subtitle') }}</p>
            <p class="text-sm text-orange-600 dark:text-orange-400 mt-1">{{ t('app.warning') }}</p>
          </div>
          <SettingsSwitcher />
        </div>
      </header>

      <div v-if="store.status === 'idle'" class="space-y-6">
        <FileUploader />
        <FileList v-if="store.files.length > 0" />

        <!-- Size Warning / All Clear -->
        <SizeWarning />

        <button
          v-if="store.files.length > 0"
          @click="store.convert"
          :disabled="store.isOverSizeLimit"
          :class="[
            'w-full py-3 rounded-lg font-semibold transition-colors',
            store.isOverSizeLimit
              ? 'bg-gray-400 dark:bg-gray-600 text-gray-200 dark:text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 dark:bg-blue-500 text-white hover:bg-blue-700 dark:hover:bg-blue-600'
          ]"
        >
          {{ store.files.length }} {{ t('button.convert') }}
        </button>
      </div>

      <ConversionProgress v-else-if="store.status !== 'done'" />

      <DownloadButton v-else />

      <div v-if="store.errorMessage" class="mt-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
        <p class="text-red-800 dark:text-red-300">{{ store.errorMessage }}</p>
        <button @click="store.reset" class="mt-2 text-red-600 dark:text-red-400 underline">{{ t('error.reset') }}</button>
      </div>

      <!-- FAQ Section -->
      <div class="mt-12">
        <FAQ />
      </div>
    </div>
  </div>
</template>
