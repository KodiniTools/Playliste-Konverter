<script setup lang="ts">
  import { ref, useId, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useConverterStore, type PlaylistItem } from '../stores/converter'
  import { formatTrimTime, parseTime } from '../utils/format'

  /**
   * Start und Ende eines Tracks festlegen (N9). Leere Felder = Anfang bzw.
   * Ende des Tracks. Übernommen wird beim Verlassen des Feldes oder mit Enter.
   */
  const props = defineProps<{ item: PlaylistItem }>()
  const store = useConverterStore()
  const { t } = useI18n()
  const uid = useId()

  const startText = ref('')
  const endText = ref('')
  const invalid = ref(false)

  watch(
    () => [props.item.trimStart, props.item.trimEnd] as const,
    ([start, end]) => {
      startText.value = start !== undefined ? formatTrimTime(start) : ''
      endText.value = end !== undefined ? formatTrimTime(end) : ''
    },
    { immediate: true },
  )

  const lengthText = () =>
    typeof props.item.duration === 'number' ? formatTrimTime(props.item.duration) : ''

  function apply() {
    const start = startText.value.trim() === '' ? null : parseTime(startText.value)
    const end = endText.value.trim() === '' ? null : parseTime(endText.value)
    const parseFailed =
      (startText.value.trim() !== '' && start === null) ||
      (endText.value.trim() !== '' && end === null)
    invalid.value = parseFailed || !store.setTrim(props.item.id, start, end)
  }

  function reset() {
    store.setTrim(props.item.id, null, null)
    invalid.value = false
  }
</script>

<template>
  <div
    class="flex flex-wrap items-end gap-3 rounded-sm border border-line bg-surface-1 p-3"
    :data-trim-editor="item.id"
  >
    <div>
      <label :for="`trim-start-${uid}`" class="mb-1 block text-xs font-medium text-ink-2">{{
        t('trim.start')
      }}</label>
      <input
        :id="`trim-start-${uid}`"
        v-model="startText"
        type="text"
        inputmode="decimal"
        placeholder="0:00"
        :aria-invalid="invalid"
        :aria-describedby="`trim-hint-${uid}`"
        data-testid="trim-start"
        class="w-24 rounded-sm border border-line bg-surface-2 px-2 py-1 text-sm tabular-nums text-ink"
        @change="apply"
        @keydown.enter.prevent="apply"
      />
    </div>
    <div>
      <label :for="`trim-end-${uid}`" class="mb-1 block text-xs font-medium text-ink-2">{{
        t('trim.end')
      }}</label>
      <input
        :id="`trim-end-${uid}`"
        v-model="endText"
        type="text"
        inputmode="decimal"
        :placeholder="lengthText()"
        :aria-invalid="invalid"
        :aria-describedby="`trim-hint-${uid}`"
        data-testid="trim-end"
        class="w-24 rounded-sm border border-line bg-surface-2 px-2 py-1 text-sm tabular-nums text-ink"
        @change="apply"
        @keydown.enter.prevent="apply"
      />
    </div>
    <button
      v-if="item.trimStart !== undefined || item.trimEnd !== undefined"
      type="button"
      class="py-1 text-sm font-medium text-ink-2 hover:text-ink hover:underline"
      @click="reset"
    >
      {{ t('trim.reset') }}
    </button>
    <p
      :id="`trim-hint-${uid}`"
      :class="['w-full text-xs', invalid ? 'text-danger' : 'text-ink-3']"
      :role="invalid ? 'alert' : undefined"
    >
      {{ invalid ? t('trim.invalid') : t('trim.hint') }}
    </p>
  </div>
</template>
