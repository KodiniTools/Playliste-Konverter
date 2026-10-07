<script setup>
  import { useConverterStore } from '../stores/converter'
  import { useI18n } from 'vue-i18n'

  const store = useConverterStore()
  const { t } = useI18n()
</script>

<template>
  <section class="rounded-lg border border-line bg-surface-1 p-4 sm:p-5">
    <h3 class="mb-3 text-lg font-semibold text-ink sm:mb-4">
      {{ store.status === 'uploading' ? t('conversion.uploading') : t('conversion.converting') }}
    </h3>

    <div class="mb-2 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 sm:gap-3">
        <span class="text-xs font-semibold tabular-nums text-ink">
          {{
            store.status === 'uploading' ? store.uploadProgress : Math.round(store.totalProgress)
          }}%
        </span>
        <!-- Geschwindigkeit während Upload -->
        <span
          v-if="store.status === 'uploading' && store.formattedUploadSpeed"
          class="text-xs tabular-nums text-ink-2"
        >
          {{ store.formattedUploadSpeed }}
        </span>
      </div>
      <!-- Geschätzte Restzeit -->
      <span
        v-if="store.status === 'uploading' && store.formattedTimeRemaining"
        class="text-right text-xs tabular-nums text-ink-2"
      >
        {{ t('conversion.remaining') }}: {{ store.formattedTimeRemaining }}
      </span>
    </div>
    <div
      class="mb-4 h-2 overflow-hidden rounded-full bg-surface-3"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="
        store.status === 'uploading' ? store.uploadProgress : Math.round(store.totalProgress)
      "
    >
      <div
        :style="{
          width: (store.status === 'uploading' ? store.uploadProgress : store.totalProgress) + '%',
        }"
        :class="[
          'h-full rounded-full bg-accent transition-[width] duration-slow',
          store.isIndeterminate && 'animate-pulse',
        ]"
      ></div>
    </div>

    <div class="flex items-center justify-between gap-3">
      <p class="text-md text-ink-2">
        {{ t('conversion.progress') }}
      </p>

      <!-- Abbrechen: destruktiv, daher danger-Text auf flacher Sekundär-Fläche -->
      <button
        type="button"
        :disabled="store.isCancelling"
        class="h-control-md flex-shrink-0 rounded-md border border-line-strong bg-surface-2 px-4 text-md font-medium text-danger transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-45"
        @click="store.cancel"
      >
        <span v-if="store.isCancelling">{{ t('conversion.cancelling') }}</span>
        <span v-else>{{ t('conversion.cancel') }}</span>
      </button>
    </div>
  </section>
</template>
