<script setup>
  import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

  /**
   * Auswahl-Dropdown im KodiniTools-Look (Tokens v2) mit zweizeiligen Optionen
   * (Label + Beschreibung), die ein natives <select> nicht darstellen kann.
   *
   * ARIA-Muster „Select-Only Combobox“ (WAI-ARIA APG):
   * - Auslöser: role="combobox", aria-expanded, aria-controls, aria-activedescendant
   * - Liste:    role="listbox", Optionen role="option" mit aria-selected
   * - Tastatur: ↓/↑/Enter/Leertaste öffnen; offen ↓/↑ bewegen, Pos1/Ende springen,
   *             Enter/Leertaste wählen, Esc schließt ohne Auswahl, Tab wählt und verlässt.
   * Der Fokus bleibt immer auf dem Auslöser; geschlossen wird auch bei Klick außerhalb.
   */
  const props = defineProps({
    /** Gewählter Wert (v-model), String oder Zahl */
    modelValue: { type: [String, Number], required: true },
    /** Optionen: { value, label, description? } */
    options: {
      type: Array,
      required: true,
      validator: (list) => list.every((option) => option && 'value' in option && 'label' in option),
    },
    /** Sichtbares Feldlabel (Pflicht für Barrierefreiheit) */
    label: { type: String, required: true },
  })

  const emit = defineEmits(['update:modelValue'])

  const uid = useId()
  const labelId = `dd-label-${uid}`
  const buttonId = `dd-button-${uid}`
  const listboxId = `dd-listbox-${uid}`
  const optionId = (index) => `dd-option-${uid}-${index}`

  const root = ref(null)
  const trigger = ref(null)
  const isOpen = ref(false)
  const activeIndex = ref(-1)
  const openUpward = ref(false)

  const selectedIndex = computed(() =>
    props.options.findIndex((option) => option.value === props.modelValue),
  )
  const selectedOption = computed(() => props.options[selectedIndex.value] ?? null)

  // Platz, den der fixierte Sticky-Player unten verdeckt (Player-Bar + Abstand)
  const BOTTOM_RESERVE = 96
  const OPTION_HEIGHT = 56

  function decideDirection() {
    const rect = trigger.value?.getBoundingClientRect()
    if (!rect) return
    const needed = props.options.length * OPTION_HEIGHT + 16
    const below = window.innerHeight - rect.bottom - BOTTOM_RESERVE
    openUpward.value = below < needed && rect.top > below
  }

  function open(index = selectedIndex.value) {
    if (props.options.length === 0) return
    decideDirection()
    activeIndex.value = index >= 0 ? index : 0
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
    activeIndex.value = -1
  }

  function choose(index) {
    const option = props.options[index]
    if (option && option.value !== props.modelValue) emit('update:modelValue', option.value)
    close()
  }

  function toggle() {
    if (isOpen.value) close()
    else open()
  }

  function move(delta) {
    const count = props.options.length
    activeIndex.value = Math.min(count - 1, Math.max(0, activeIndex.value + delta))
  }

  function onKeydown(event) {
    const { key } = event
    if (!isOpen.value) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(key)) {
        event.preventDefault()
        open()
      } else if (key === 'Home' || key === 'End') {
        event.preventDefault()
        open(key === 'Home' ? 0 : props.options.length - 1)
      }
      return
    }

    switch (key) {
      case 'ArrowDown':
        event.preventDefault()
        move(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        move(-1)
        break
      case 'Home':
        event.preventDefault()
        activeIndex.value = 0
        break
      case 'End':
        event.preventDefault()
        activeIndex.value = props.options.length - 1
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        choose(activeIndex.value)
        break
      case 'Escape':
        event.preventDefault()
        close()
        break
      case 'Tab':
        // Wählen und den Fokus normal weiterwandern lassen
        choose(activeIndex.value)
        break
      default:
        break
    }
  }

  function onDocumentPointerDown(event) {
    if (root.value && !root.value.contains(event.target)) close()
  }

  // Aktive Option sichtbar halten (bei langen Listen)
  watch(activeIndex, async (index) => {
    if (!isOpen.value || index < 0) return
    await nextTick()
    document.getElementById(optionId(index))?.scrollIntoView?.({ block: 'nearest' })
  })

  watch(isOpen, (value) => {
    if (value) document.addEventListener('pointerdown', onDocumentPointerDown)
    else document.removeEventListener('pointerdown', onDocumentPointerDown)
  })

  onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <div ref="root" class="relative flex min-w-0 flex-col gap-1">
    <span :id="labelId" class="text-sm font-medium text-ink-2">{{ label }}</span>

    <button
      :id="buttonId"
      ref="trigger"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="isOpen ? 'true' : 'false'"
      :aria-controls="listboxId"
      :aria-labelledby="`${labelId} ${buttonId}`"
      :aria-activedescendant="isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined"
      :class="[
        'flex h-control-lg w-full items-center gap-2 rounded-md border bg-surface-2 px-3 text-left transition-colors hover:bg-surface-3',
        isOpen ? 'border-accent' : 'border-line-strong',
      ]"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span class="flex min-w-0 flex-1 items-baseline gap-2">
        <span class="truncate text-md font-semibold text-ink">{{ selectedOption?.label }}</span>
        <span
          v-if="selectedOption?.description"
          class="hidden truncate text-sm text-ink-2 sm:inline"
        >
          {{ selectedOption.description }}
        </span>
      </span>
      <svg
        :class="['h-4 w-4 flex-shrink-0 text-ink-3 transition-transform', isOpen && 'rotate-180']"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <ul
      v-show="isOpen"
      :id="listboxId"
      role="listbox"
      tabindex="-1"
      :aria-labelledby="labelId"
      :class="[
        'absolute left-0 right-0 z-backdrop max-h-80 overflow-y-auto rounded-md border border-line bg-surface-1 p-1 shadow-overlay',
        openUpward ? 'bottom-full mb-1' : 'top-full mt-1',
      ]"
    >
      <li
        v-for="(option, index) in options"
        :id="optionId(index)"
        :key="option.value"
        role="option"
        :aria-selected="index === selectedIndex ? 'true' : 'false'"
        :class="[
          'flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2 transition-colors',
          index === selectedIndex ? 'bg-accent-soft' : '',
          index === activeIndex && index !== selectedIndex ? 'bg-surface-3' : '',
          index === activeIndex ? 'ring-1 ring-inset ring-line-strong' : '',
        ]"
        @pointerenter="activeIndex = index"
        @mousedown.prevent
        @click="choose(index)"
      >
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="text-md font-semibold text-ink">{{ option.label }}</span>
          <span v-if="option.description" class="text-sm text-ink-2">{{ option.description }}</span>
        </span>
        <svg
          v-if="index === selectedIndex"
          class="h-4 w-4 flex-shrink-0 text-ink"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </li>
    </ul>
  </div>
</template>
