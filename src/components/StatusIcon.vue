<script setup>
  import { computed } from 'vue'

  /**
   * Status-Glyphe (Outline, 24er Viewbox, Strich 2) in der Statusfarbe der Tokens.
   * Ersetzt die früheren Unicode-Zeichen (✓ ✕ ⚠ ℹ) in Toasts, Banner und Warnungen.
   */
  const props = defineProps({
    type: {
      type: String,
      default: 'info',
      validator: (value) => ['success', 'error', 'warning', 'info', 'pending'].includes(value),
    },
  })

  const PATHS = {
    success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    error:
      'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    warning: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    pending: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  }

  const COLORS = {
    success: 'text-success',
    error: 'text-danger',
    warning: 'text-warning',
    pending: 'text-warning',
    info: 'text-info',
  }

  const path = computed(() => PATHS[props.type] ?? PATHS.info)
  const colorClass = computed(() => COLORS[props.type] ?? COLORS.info)
</script>

<template>
  <svg
    :class="['flex-shrink-0', colorClass]"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="path" />
  </svg>
</template>
