/// <reference types="vite/client" />

// File System Access API („Speichern unter“): nur Chromium, deshalb nicht in lib.dom
interface SaveFilePickerOptions {
  suggestedName?: string
  types?: { description?: string; accept: Record<string, string[]> }[]
}

interface Window {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
}
