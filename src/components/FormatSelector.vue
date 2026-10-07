<script setup>
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useConverterStore } from '../stores/converter'
  import DropdownSelect from './DropdownSelect.vue'

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
    set: (value) => store.setOutputFormat(value),
  })

  const bitrate = computed({
    get: () => store.bitrate,
    set: (value) => store.setBitrate(value),
  })
</script>

<template>
  <section class="rounded-lg border border-line bg-surface-1 p-4 sm:p-5">
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <DropdownSelect v-model="outputFormat" :label="t('format.title')" :options="formatOptions" />
      <DropdownSelect v-model="bitrate" :label="t('bitrate.title')" :options="bitrateOptions" />
    </div>
    <p class="mt-3 text-sm text-ink-3">
      {{ t('bitrate.hint') }}
    </p>
  </section>
</template>
