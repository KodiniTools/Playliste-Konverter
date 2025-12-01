<script setup>
import { useToastStore } from '../stores/toast'

const toastStore = useToastStore()

function getIcon(type) {
  switch (type) {
    case 'success': return '✓'
    case 'error': return '✕'
    case 'warning': return '⚠'
    default: return 'ℹ'
  }
}

function getClasses(type) {
  const base = 'flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border transition-all duration-300'
  switch (type) {
    case 'success':
      return `${base} bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200`
    case 'error':
      return `${base} bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200`
    case 'warning':
      return `${base} bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200`
    default:
      return `${base} bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200`
  }
}
</script>

<template>
  <div class="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toastStore.toasts"
        :key="toast.id"
        :class="getClasses(toast.type)"
      >
        <span class="text-lg font-bold">{{ getIcon(toast.type) }}</span>
        <span class="flex-1 text-sm font-medium">{{ toast.message }}</span>
        <button
          @click="toastStore.remove(toast.id)"
          class="text-current opacity-60 hover:opacity-100 transition-opacity"
        >
          ✕
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active {
  animation: toast-in 0.3s ease-out;
}

.toast-leave-active {
  animation: toast-out 0.2s ease-in;
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes toast-out {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(100%);
  }
}
</style>
