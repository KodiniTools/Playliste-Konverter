<script setup lang="ts">
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useConverterStore } from '../stores/converter'
  import DropdownSelect from './DropdownSelect.vue'
  import { QUALITY_PRESETS, type QualityPreset } from '../constants'

  const store = useConverterStore()
  const { t } = useI18n()

  const formatOptions = computed(() =>
    store.availableFormats.map((format) => ({
      value: format.id,
      label: format.label,
      description: t(`format.${format.id}.description`),
    })),
  )

  const bitrateOptions = computed(() =>
    store.availableBitratesForFormat.map((bitrate) => ({
      value: bitrate.value,
      label: bitrate.label,
      description: t(`bitrate.${bitrate.value}`),
    })),
  )

  const outputFormat = computed({
    get: () => store.outputFormat,
    set: (value: string | number) => store.setOutputFormat(String(value)),
  })

  const PRESET_LABEL_KEYS: Record<QualityPreset['id'], [string, string]> = {
    speech: ['preset.speech', 'preset.speechHint'],
    music: ['preset.music', 'preset.musicHint'],
    archive: ['preset.archive', 'preset.archiveHint'],
  }

  const mono = computed({
    get: () => store.channels === 1,
    set: (value: boolean) => store.setChannels(value ? 1 : 2),
  })

  const bitrate = computed({
    get: () => store.bitrate,
    set: (value: string | number) => store.setBitrate(Number(value)),
  })
</script>

<template>
  <section class="rounded-lg border border-line bg-surface-1 p-4 sm:p-5">
    <div role="group" :aria-label="t('preset.title')" class="mb-4">
      <p class="mb-2 text-sm font-medium text-ink-2">{{ t('preset.title') }}</p>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          v-for="preset in QUALITY_PRESETS"
          :key="preset.id"
          type="button"
          :data-preset="preset.id"
          :aria-pressed="store.activePreset === preset.id"
          :class="[
            'rounded-md border px-3 py-2 text-left transition-colors',
            store.activePreset === preset.id
              ? 'border-accent bg-accent-soft'
              : 'border-line bg-surface-2 hover:bg-surface-3',
          ]"
          @click="store.applyPreset(preset.id)"
        >
          <span class="block text-md font-semibold text-ink">{{
            t(PRESET_LABEL_KEYS[preset.id][0])
          }}</span>
          <span class="block text-xs text-ink-2">{{ t(PRESET_LABEL_KEYS[preset.id][1]) }}</span>
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <DropdownSelect v-model="outputFormat" :label="t('format.title')" :options="formatOptions" />
      <DropdownSelect v-model="bitrate" :label="t('bitrate.title')" :options="bitrateOptions" />
    </div>
    <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm text-ink-3">
        {{ t('bitrate.hint') }}
      </p>
      <label class="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
        <input v-model="mono" type="checkbox" data-testid="mono" class="h-4 w-4 accent-accent" />
        {{ t('preset.mono') }}
      </label>
    </div>
  </section>
</template>
