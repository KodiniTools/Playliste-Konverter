<script setup>
import { useConverterStore } from '../stores/converter'
import { useI18n } from 'vue-i18n'

const store = useConverterStore()
const { t } = useI18n()
</script>

<template>
  <div class="bg-white dark:bg-dark-card rounded-lg border border-neutral dark:border-muted p-4 sm:p-6">
    <h3 class="font-semibold text-sm sm:text-base text-dark dark:text-neutral-light mb-3 sm:mb-4">
      {{ store.status === 'uploading' ? t('conversion.uploading') : t('conversion.converting') }}
    </h3>

    <div class="relative pt-1">
      <div class="flex mb-2 items-center justify-between gap-2">
        <div class="flex items-center gap-2 sm:gap-3">
          <span class="text-xs font-semibold inline-block text-accent-dark dark:text-accent">
            {{ Math.round(store.totalProgress) }}%
          </span>
          <!-- Geschwindigkeit während Upload -->
          <span
            v-if="store.status === 'uploading' && store.formattedUploadSpeed"
            class="text-xs text-muted dark:text-neutral"
          >
            {{ store.formattedUploadSpeed }}
          </span>
        </div>
        <!-- Geschätzte Restzeit -->
        <span
          v-if="store.status === 'uploading' && store.formattedTimeRemaining"
          class="text-xs text-muted dark:text-neutral text-right"
        >
          {{ t('conversion.remaining') }}: {{ store.formattedTimeRemaining }}
        </span>
      </div>
      <div class="overflow-hidden h-2 mb-4 text-xs flex rounded bg-neutral-light dark:bg-muted">
        <div
          :style="{ width: store.totalProgress + '%' }"
          class="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-accent dark:bg-accent transition-all duration-300"
        ></div>
      </div>
    </div>

    <div class="flex items-center justify-between">
      <p class="text-sm text-muted dark:text-neutral">
        {{ t('conversion.progress') }}
      </p>

      <!-- Abbrechen Button -->
      <button
        @click="store.cancel"
        :disabled="store.isCancelling"
        class="px-4 py-2 text-sm font-medium rounded-lg transition-colors
               bg-secondary/10 hover:bg-secondary/20 text-secondary dark:text-secondary-light
               border border-secondary/30 hover:border-secondary/50
               disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span v-if="store.isCancelling">{{ t('conversion.cancelling') }}</span>
        <span v-else>{{ t('conversion.cancel') }}</span>
      </button>
    </div>
  </div>
</template>
