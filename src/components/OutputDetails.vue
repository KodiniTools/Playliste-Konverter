<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useConverterStore } from '../stores/converter'
  import { COVER_ACCEPT } from '../constants'

  /**
   * Dateiname, Tags (Titel, Künstler, Album) und Cover der Ausgabe (N6).
   * Aufklappbar, weil die Angaben optional sind.
   */
  const store = useConverterStore()
  const { t } = useI18n()
  const uid = useId()
  const id = (name: string) => `out-${name}-${uid}`

  const TAG_FIELDS = [
    ['title', 'output.tagTitle'],
    ['artist', 'output.tagArtist'],
    ['album', 'output.tagAlbum'],
  ] as const

  const coverInput = ref<HTMLInputElement | null>(null)
  const coverPreview = ref<string | null>(null)

  // Vorschau-URL des Covers verwalten (alte URL immer freigeben)
  watch(
    () => store.cover,
    (file) => {
      if (coverPreview.value) URL.revokeObjectURL(coverPreview.value)
      coverPreview.value = file ? URL.createObjectURL(file) : null
    },
    { immediate: true },
  )
  onBeforeUnmount(() => {
    if (coverPreview.value) URL.revokeObjectURL(coverPreview.value)
  })

  const coverIgnored = computed(() => store.cover !== null && store.outputFormat !== 'mp3')

  function onCoverChange(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0] ?? null
    if (!store.setCover(file)) input.value = ''
  }

  function removeCover() {
    store.setCover(null)
    if (coverInput.value) coverInput.value.value = ''
  }
</script>

<template>
  <details class="group rounded-lg border border-line bg-surface-1 p-4 sm:p-5">
    <summary
      class="flex cursor-pointer list-none items-center justify-between gap-2 text-md font-semibold text-ink"
    >
      <span>
        {{ t('output.title') }}
        <span class="ml-1 text-sm font-normal text-ink-3">{{ t('output.optional') }}</span>
      </span>
      <svg
        class="h-4 w-4 text-ink-3 transition-transform group-open:rotate-180"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </summary>

    <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div class="sm:col-span-2">
        <label :for="id('name')" class="mb-1 block text-sm font-medium text-ink-2">{{
          t('output.fileName')
        }}</label>
        <input
          :id="id('name')"
          v-model="store.outputName"
          type="text"
          maxlength="100"
          placeholder="playlist"
          data-testid="output-name"
          class="w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-md text-ink placeholder:text-ink-3"
        />
        <p class="mt-1 text-xs text-ink-3" data-testid="output-file-name">
          {{ t('output.fileNameHint', { name: store.outputFileName }) }}
        </p>
      </div>

      <div v-for="[field, labelKey] in TAG_FIELDS" :key="field">
        <label :for="id(field)" class="mb-1 block text-sm font-medium text-ink-2">{{
          t(labelKey)
        }}</label>
        <input
          :id="id(field)"
          v-model="store.tags[field]"
          type="text"
          maxlength="200"
          :data-testid="`tag-${field}`"
          class="w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-md text-ink"
        />
      </div>

      <div>
        <span :id="id('cover-label')" class="mb-1 block text-sm font-medium text-ink-2">{{
          t('output.cover')
        }}</span>
        <div class="flex items-center gap-3">
          <img
            v-if="coverPreview"
            :src="coverPreview"
            :alt="t('output.coverPreview')"
            class="h-12 w-12 rounded-sm border border-line object-cover"
          />
          <label
            class="cursor-pointer rounded-md border border-line bg-surface-2 px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-3"
          >
            {{ store.cover ? t('output.coverChange') : t('output.coverSelect') }}
            <input
              ref="coverInput"
              type="file"
              :accept="COVER_ACCEPT"
              class="sr-only"
              :aria-labelledby="id('cover-label')"
              data-testid="cover-input"
              @change="onCoverChange"
            />
          </label>
          <button
            v-if="store.cover"
            type="button"
            class="text-sm font-medium text-danger hover:underline"
            @click="removeCover"
          >
            {{ t('output.coverRemove') }}
          </button>
        </div>
        <p class="mt-1 text-xs" :class="coverIgnored ? 'text-warning' : 'text-ink-3'">
          {{ coverIgnored ? t('output.coverMp3Only') : t('output.coverHint') }}
        </p>
      </div>
    </div>
  </details>
</template>
