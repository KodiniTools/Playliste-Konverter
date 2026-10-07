<script setup>
  import { useI18n } from 'vue-i18n'
  import { useToastStore } from '../stores/toast'
  import StatusIcon from './StatusIcon.vue'

  const toastStore = useToastStore()
  const { t } = useI18n()

  // Status als 3-px-Kante links plus Icon und Text, nie als Flächenfüllung
  const EDGE_CLASSES = {
    success: 'border-l-success',
    error: 'border-l-danger',
    warning: 'border-l-warning',
    info: 'border-l-info',
  }

  function edgeClass(type) {
    return EDGE_CLASSES[type] ?? EDGE_CLASSES.info
  }
</script>

<template>
  <div
    class="toast-stack fixed left-3 right-3 top-4 z-toast flex flex-col gap-2 sm:left-auto sm:right-4 sm:max-w-sm"
    aria-live="polite"
  >
    <TransitionGroup name="toast">
      <div
        v-for="toast in toastStore.toasts"
        :key="toast.id"
        :role="toast.type === 'error' ? 'alert' : 'status'"
        :class="[
          'flex items-center gap-3 rounded-md border border-l-[3px] border-line bg-surface-1 px-4 py-3 text-ink shadow-overlay',
          edgeClass(toast.type),
        ]"
      >
        <StatusIcon :type="toast.type" class="h-4 w-4" />
        <span class="flex-1 text-md font-medium">{{ toast.message }}</span>
        <button
          type="button"
          :aria-label="t('toast.close')"
          class="flex h-control-sm w-7 flex-shrink-0 items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
          @click="toastStore.remove(toast.id)"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
  .toast-stack {
    pointer-events: none;
  }

  .toast-stack > * {
    pointer-events: auto;
  }

  .toast-enter-active,
  .toast-leave-active {
    transition:
      opacity var(--ds-duration-slow) var(--ds-ease),
      transform var(--ds-duration-slow) var(--ds-ease);
  }

  .toast-enter-from,
  .toast-leave-to {
    opacity: 0;
    transform: translateX(16px);
  }
</style>
