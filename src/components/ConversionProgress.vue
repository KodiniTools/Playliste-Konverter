<script setup>
import { useConverterStore } from '../stores/converter'
import { useI18n } from 'vue-i18n'

const store = useConverterStore()
const { t } = useI18n()
</script>

<template>
  <div class="bg-white dark:bg-dark-card rounded-lg border border-neutral dark:border-muted p-6">
    <h3 class="font-semibold text-dark dark:text-neutral-light mb-4">
      {{ store.status === 'uploading' ? t('conversion.uploading') : t('conversion.converting') }}
    </h3>

    <div class="relative pt-1">
      <div class="flex mb-2 items-center justify-between">
        <div>
          <span class="text-xs font-semibold inline-block text-accent-dark dark:text-accent">
            {{ Math.round(store.totalProgress) }}%
          </span>
        </div>
      </div>
      <div class="overflow-hidden h-2 mb-4 text-xs flex rounded bg-neutral-light dark:bg-muted">
        <div
          :style="{ width: store.totalProgress + '%' }"
          class="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-accent dark:bg-accent transition-all duration-300"
        ></div>
      </div>
    </div>

    <p class="text-sm text-muted dark:text-neutral">
      {{ t('conversion.progress') }}
    </p>
  </div>
</template>
