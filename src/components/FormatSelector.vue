<script setup>
import { useConverterStore } from '../stores/converter'
import { useI18n } from 'vue-i18n'

const store = useConverterStore()
const { t } = useI18n()
</script>

<template>
  <div class="bg-white dark:bg-dark-card rounded-lg p-4 border border-neutral dark:border-muted space-y-4">
    <!-- Format-Auswahl -->
    <div>
      <h3 class="text-sm font-semibold text-dark dark:text-neutral-light mb-3">
        {{ t('format.title') }}
      </h3>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="format in store.availableFormats"
          :key="format.id"
          @click="store.setOutputFormat(format.id)"
          :class="[
            'px-4 py-2 rounded-lg text-sm font-medium transition-all',
            'border-2',
            store.outputFormat === format.id
              ? 'border-accent bg-accent/10 text-accent dark:border-accent dark:bg-accent/20 dark:text-accent'
              : 'border-neutral dark:border-muted bg-transparent text-muted dark:text-neutral hover:border-accent/50 dark:hover:border-accent/50'
          ]"
        >
          <span class="font-semibold">{{ format.label }}</span>
          <span class="hidden sm:inline text-xs ml-1 opacity-70">{{ t(`format.${format.id}.description`) }}</span>
        </button>
      </div>
    </div>

    <!-- Bitrate-Auswahl -->
    <div>
      <h3 class="text-sm font-semibold text-dark dark:text-neutral-light mb-3">
        {{ t('bitrate.title') }}
      </h3>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="br in store.availableBitratesForFormat"
          :key="br.value"
          @click="store.setBitrate(br.value)"
          :class="[
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
            'border-2',
            store.bitrate === br.value
              ? 'border-accent bg-accent/10 text-accent dark:border-accent dark:bg-accent/20 dark:text-accent'
              : 'border-neutral dark:border-muted bg-transparent text-muted dark:text-neutral hover:border-accent/50 dark:hover:border-accent/50'
          ]"
        >
          <span class="font-semibold">{{ br.label }}</span>
          <span class="hidden sm:inline text-xs ml-1 opacity-70">{{ t(`bitrate.${br.value}`) }}</span>
        </button>
      </div>
      <p class="text-xs text-muted dark:text-neutral mt-2">
        {{ t('bitrate.hint') }}
      </p>
    </div>
  </div>
</template>
