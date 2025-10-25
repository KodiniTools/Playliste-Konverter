<script setup>
import { useConverterStore } from '../stores/converter'

const store = useConverterStore()
</script>

<template>
  <div class="bg-white rounded-lg border border-gray-200 p-6">
    <h3 class="font-semibold text-gray-900 mb-4">
      {{ store.status === 'uploading' ? 'Hochladen...' : 'Konvertierung läuft...' }}
    </h3>
    
    <div class="relative pt-1">
      <div class="flex mb-2 items-center justify-between">
        <div>
          <span class="text-xs font-semibold inline-block text-blue-600">
            {{ Math.round(store.totalProgress) }}%
          </span>
        </div>
      </div>
      <div class="overflow-hidden h-2 mb-4 text-xs flex rounded bg-blue-200">
        <div
          :style="{ width: store.totalProgress + '%' }"
          class="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-600 transition-all duration-300"
        ></div>
      </div>
    </div>

    <p class="text-sm text-gray-600">
      {{ store.status === 'uploading' ? 'Dateien werden hochgeladen...' : 'FFmpeg verarbeitet die Tracks...' }}
    </p>
  </div>
</template>
