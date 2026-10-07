<script setup>
  import { computed } from 'vue'
  import { useConverterStore } from '../stores/converter'
  import { useI18n } from 'vue-i18n'
  import { formatBytes } from '../utils/format'
  import { SIZE_THRESHOLD_YELLOW, SIZE_THRESHOLD_ORANGE } from '../constants'
  import StatusIcon from './StatusIcon.vue'

  const store = useConverterStore()
  const { t } = useI18n()

  const maxSizeFormatted = computed(() => formatBytes(store.maxPlaylistSize))
  const currentSizeFormatted = computed(() => formatBytes(store.totalSize))
  const overByFormatted = computed(() => formatBytes(store.totalSize - store.maxPlaylistSize))

  const isYellowWarning = computed(() => {
    return (
      !store.isOverSizeLimit &&
      store.totalSize >= SIZE_THRESHOLD_YELLOW &&
      store.totalSize < SIZE_THRESHOLD_ORANGE
    )
  })

  const isOrangeWarning = computed(() => {
    return !store.isOverSizeLimit && store.totalSize >= SIZE_THRESHOLD_ORANGE
  })

  /**
   * Vier Stufen auf die Status-Tokens: über MAX_PLAYLIST_SIZE → danger,
   * ab SIZE_THRESHOLD_ORANGE → warning, ab SIZE_THRESHOLD_YELLOW → info,
   * darunter → success.
   */
  const variant = computed(() => {
    if (store.files.length === 0) return null
    if (store.isOverSizeLimit) {
      return {
        icon: 'error',
        role: 'alert',
        edgeClass: 'border-l-danger',
        textClass: 'text-danger',
        titleKey: 'sizeWarning.title',
        messageKey: 'sizeWarning.message',
        estimateKey: null,
        showOverBy: true,
      }
    }
    if (isOrangeWarning.value) {
      return {
        icon: 'pending',
        role: 'status',
        edgeClass: 'border-l-warning',
        textClass: 'text-warning',
        titleKey: 'sizeOrangeWarning.title',
        messageKey: 'sizeOrangeWarning.message',
        estimateKey: 'sizeOrangeWarning.estimatedTime',
        showOverBy: false,
      }
    }
    if (isYellowWarning.value) {
      return {
        icon: 'info',
        role: 'status',
        edgeClass: 'border-l-info',
        textClass: 'text-info',
        titleKey: 'sizeYellowWarning.title',
        messageKey: 'sizeYellowWarning.message',
        estimateKey: 'sizeYellowWarning.estimatedTime',
        showOverBy: false,
      }
    }
    return {
      icon: 'success',
      role: 'status',
      edgeClass: 'border-l-success',
      textClass: 'text-success',
      titleKey: 'sizeOk.title',
      messageKey: 'sizeOk.message',
      estimateKey: null,
      showOverBy: false,
    }
  })
</script>

<template>
  <!-- Status als Icon, Text und 3-px-Kante links — nie als Flächenfüllung -->
  <section
    v-if="variant"
    :role="variant.role"
    :class="[
      'mb-4 rounded-md border border-l-[3px] border-line bg-surface-1 p-4',
      variant.edgeClass,
    ]"
  >
    <div class="flex items-start gap-3">
      <StatusIcon :type="variant.icon" class="mt-0.5 h-5 w-5" />

      <div class="flex-1">
        <h3 class="mb-1 text-lg font-semibold text-ink">
          {{ t(variant.titleKey) }}
        </h3>
        <p class="mb-3 text-md text-ink-2">
          {{ t(variant.messageKey, { maxSize: maxSizeFormatted }) }}
        </p>
        <p
          v-if="variant.estimateKey"
          :class="['-mt-1 mb-3 text-sm font-medium', variant.textClass]"
        >
          {{ t(variant.estimateKey) }}
        </p>

        <!-- Size Details: Werte in ink, weil Statusfarben auf surface-2 im Light-Theme unter 4.5:1 liegen -->
        <dl
          :class="[
            'grid grid-cols-1 gap-2 text-md',
            variant.showOverBy ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
          ]"
        >
          <div class="rounded-sm bg-surface-2 px-3 py-2">
            <dt class="text-sm text-ink-2">{{ t('sizeWarning.currentSize') }}</dt>
            <dd class="font-semibold tabular-nums text-ink">{{ currentSizeFormatted }}</dd>
          </div>
          <div class="rounded-sm bg-surface-2 px-3 py-2">
            <dt class="text-sm text-ink-2">{{ t('sizeWarning.maxSize') }}</dt>
            <dd class="font-semibold tabular-nums text-ink">{{ maxSizeFormatted }}</dd>
          </div>
          <div v-if="variant.showOverBy" class="rounded-sm bg-surface-2 px-3 py-2">
            <dt class="text-sm text-ink-2">{{ t('sizeWarning.overBy') }}</dt>
            <dd class="font-semibold tabular-nums text-ink">{{ overByFormatted }}</dd>
          </div>
        </dl>
      </div>
    </div>
  </section>
</template>
