<script setup>
  import { useConverterStore } from '../stores/converter'
  import { useI18n } from 'vue-i18n'

  const store = useConverterStore()
  const { t } = useI18n()
</script>

<template>
  <section class="space-y-4 rounded-lg border border-line bg-surface-1 p-4 sm:space-y-5 sm:p-5">
    <!-- Format-Auswahl -->
    <div>
      <h3 class="mb-2 text-md font-semibold text-ink sm:mb-3">
        {{ t('format.title') }}
      </h3>
      <div class="flex flex-wrap gap-2" role="group" :aria-label="t('format.title')">
        <button
          v-for="format in store.availableFormats"
          :key="format.id"
          type="button"
          :aria-pressed="store.outputFormat === format.id"
          :class="[
            'h-control-md rounded-md border px-3 text-md font-medium transition-colors sm:px-4',
            store.outputFormat === format.id
              ? 'border-accent bg-accent-soft text-ink'
              : 'border-line-strong bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink',
          ]"
          @click="store.setOutputFormat(format.id)"
        >
          <span class="font-semibold">{{ format.label }}</span>
          <span class="ml-1 hidden text-xs text-ink-2 sm:inline">{{
            t(`format.${format.id}.description`)
          }}</span>
        </button>
      </div>
    </div>

    <!-- Bitrate-Auswahl -->
    <div>
      <h3 class="mb-2 text-md font-semibold text-ink sm:mb-3">
        {{ t('bitrate.title') }}
      </h3>
      <div class="flex flex-wrap gap-2" role="group" :aria-label="t('bitrate.title')">
        <button
          v-for="br in store.availableBitratesForFormat"
          :key="br.value"
          type="button"
          :aria-pressed="store.bitrate === br.value"
          :class="[
            'h-control-md rounded-md border px-3 text-md font-medium transition-colors',
            store.bitrate === br.value
              ? 'border-accent bg-accent-soft text-ink'
              : 'border-line-strong bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink',
          ]"
          @click="store.setBitrate(br.value)"
        >
          <span class="font-semibold">{{ br.label }}</span>
          <span class="ml-1 hidden text-xs text-ink-2 sm:inline">{{
            t(`bitrate.${br.value}`)
          }}</span>
        </button>
      </div>
      <p class="mt-2 text-sm text-ink-3">
        {{ t('bitrate.hint') }}
      </p>
    </div>
  </section>
</template>
