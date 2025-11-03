<script setup>
import { useConverterStore } from '../stores/converter'
import { useI18n } from 'vue-i18n'

const store = useConverterStore()
const { t } = useI18n()
</script>

<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
    <h3 class="font-semibold text-gray-900 dark:text-gray-100 mb-4">
      {{ store.status === 'uploading' ? t('conversion.uploading') : t('conversion.converting') }}
    </h3>

    <div class="relative pt-1">
      <div class="flex mb-2 items-center justify-between">
        <div>
          <span class="text-xs font-semibold inline-block text-blue-600 dark:text-blue-400">
            {{ Math.round(store.totalProgress) }}%
          </span>
        </div>
      </div>
      <div class="overflow-hidden h-2 mb-4 text-xs flex rounded bg-blue-200 dark:bg-blue-900">
        <div
          :style="{ width: store.totalProgress + '%' }"
          class="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-600 dark:bg-blue-500 transition-all duration-300"
        ></div>
      </div>
    </div>

    <p class="text-sm text-gray-600 dark:text-gray-400">
      {{ t('conversion.progress') }}
    </p>
  </div>
</template>
