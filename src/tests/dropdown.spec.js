/**
 * DropdownSelect (ARIA Select-Only Combobox) und die Format-/Qualitätsauswahl.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import i18n from '../i18n'
import DropdownSelect from '../components/DropdownSelect.vue'
import FormatSelector from '../components/FormatSelector.vue'
import SizeWarning from '../components/SizeWarning.vue'
import { useConverterStore, normalizeBitrate, normalizeFormat } from '../stores/converter'
import { SIZE_THRESHOLD_ORANGE, SIZE_THRESHOLD_YELLOW } from '../constants'

const OPTIONS = [
  { value: 'webm', label: 'WebM (Opus)', description: 'Kompakt, modern' },
  { value: 'mp3', label: 'MP3', description: 'Universell kompatibel' },
  { value: 'ogg', label: 'OGG (Vorbis)', description: 'Open Source' },
]

let wrapper

function mountDropdown(modelValue = 'mp3') {
  wrapper = mount(DropdownSelect, {
    props: {
      modelValue,
      label: 'Ausgabeformat',
      options: OPTIONS,
      'onUpdate:modelValue': (value) => wrapper.setProps({ modelValue: value }),
    },
    attachTo: document.body,
  })
  return wrapper
}

const trigger = () => wrapper.get('[role="combobox"]')
const listbox = () => wrapper.get('[role="listbox"]')
const isOpen = () => trigger().attributes('aria-expanded') === 'true'
const press = (key) => trigger().trigger('keydown', { key })

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('DropdownSelect', () => {
  it('zeigt die Auswahl im Auslöser und verknüpft Label, Combobox und Listbox', () => {
    mountDropdown('mp3')
    expect(trigger().text()).toContain('MP3')
    expect(trigger().text()).toContain('Universell kompatibel')
    expect(trigger().attributes('aria-haspopup')).toBe('listbox')
    expect(trigger().attributes('aria-controls')).toBe(listbox().attributes('id'))
    const labelId = wrapper.get('span[id^="dd-label-"]').attributes('id')
    expect(trigger().attributes('aria-labelledby')).toContain(labelId)
    expect(listbox().attributes('aria-labelledby')).toBe(labelId)
    expect(isOpen()).toBe(false)
  })

  it('öffnet per Klick, markiert die Auswahl und wählt per Klick', async () => {
    mountDropdown('mp3')
    await trigger().trigger('click')
    expect(isOpen()).toBe(true)
    const options = wrapper.findAll('[role="option"]')
    expect(options).toHaveLength(3)
    expect(options[1].attributes('aria-selected')).toBe('true')
    expect(trigger().attributes('aria-activedescendant')).toBe(options[1].attributes('id'))

    await options[2].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['ogg']])
    expect(isOpen()).toBe(false)
    expect(trigger().text()).toContain('OGG (Vorbis)')
  })

  it('bedient sich vollständig per Tastatur', async () => {
    mountDropdown('mp3')
    await press('ArrowDown')
    expect(isOpen()).toBe(true)
    await press('ArrowDown')
    const options = wrapper.findAll('[role="option"]')
    expect(trigger().attributes('aria-activedescendant')).toBe(options[2].attributes('id'))
    await press('ArrowDown') // am Ende bleibt die letzte Option aktiv
    expect(trigger().attributes('aria-activedescendant')).toBe(options[2].attributes('id'))
    await press('Home')
    expect(trigger().attributes('aria-activedescendant')).toBe(options[0].attributes('id'))
    await press('Enter')
    expect(wrapper.emitted('update:modelValue')).toEqual([['webm']])
    expect(isOpen()).toBe(false)
  })

  it('Escape schließt ohne Auswahl, Tab wählt die aktive Option', async () => {
    mountDropdown('mp3')
    await press(' ')
    await press('ArrowUp')
    await press('Escape')
    expect(isOpen()).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await press('End')
    expect(isOpen()).toBe(true)
    await press('Tab')
    expect(wrapper.emitted('update:modelValue')).toEqual([['ogg']])
    expect(isOpen()).toBe(false)
  })

  it('schließt bei Klick außerhalb', async () => {
    mountDropdown('mp3')
    await trigger().trigger('click')
    expect(isOpen()).toBe(true)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(isOpen()).toBe(false)
  })

  it('meldet keine Änderung, wenn die bereits gewählte Option erneut gewählt wird', async () => {
    mountDropdown('mp3')
    await press('Enter')
    await press('Enter')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})

describe('FormatSelector', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    i18n.global.locale.value = 'de'
  })

  function mountSelector() {
    wrapper = mount(FormatSelector, {
      global: { plugins: [i18n] },
      attachTo: document.body,
    })
    return wrapper
  }

  it('zeigt zwei Dropdowns statt Pill-Reihen', () => {
    mountSelector()
    const combos = wrapper.findAll('[role="combobox"]')
    expect(combos).toHaveLength(2)
    expect(wrapper.text()).toContain('Ausgabeformat')
    expect(wrapper.text()).toContain('Audioqualität')
    expect(wrapper.findAll('[aria-pressed]')).toHaveLength(0)
  })

  it('Formatwechsel begrenzt die Bitrate und kürzt die Qualitätsliste', async () => {
    const store = useConverterStore()
    store.setBitrate(320)
    mountSelector()
    const [formatBox, bitrateBox] = wrapper.findAll('[role="combobox"]')
    expect(bitrateBox.text()).toContain('320 kbps')

    await formatBox.trigger('click')
    await wrapper.findAll('[role="listbox"]')[0].findAll('[role="option"]')[0].trigger('click') // WebM
    expect(store.outputFormat).toBe('webm')
    expect(store.bitrate).toBe(256)
    expect(bitrateBox.text()).toContain('256 kbps')

    await bitrateBox.trigger('click')
    const bitrateOptions = wrapper.findAll('[role="listbox"]')[1].findAll('[role="option"]')
    expect(bitrateOptions.map((o) => o.text())).not.toContain('320 kbps')
  })
})

describe('Gespeicherte Format-/Bitrate-Werte', () => {
  it('normalizeFormat fällt bei unbekanntem Format auf MP3 zurück', () => {
    expect(normalizeFormat('webm')).toBe('webm')
    expect(normalizeFormat('flac')).toBe('mp3')
    expect(normalizeFormat(null)).toBe('mp3')
  })

  it('normalizeBitrate bringt Werte auf eine angebotene Stufe des Formats', () => {
    expect(normalizeBitrate(128, 'mp3')).toBe(128)
    expect(normalizeBitrate(NaN, 'mp3')).toBe(192)
    expect(normalizeBitrate(999, 'mp3')).toBe(192)
    expect(normalizeBitrate(320, 'webm')).toBe(256)
  })

  it('der Store startet mit normalisierten Werten aus dem localStorage', () => {
    localStorage.setItem('outputFormat', 'webm')
    localStorage.setItem('bitrate', '320')
    setActivePinia(createPinia())
    const store = useConverterStore()
    expect(store.outputFormat).toBe('webm')
    expect(store.bitrate).toBe(256)
  })
})

describe('Größenhinweise ohne Minutenangaben', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    i18n.global.locale.value = 'de'
  })

  it.each([SIZE_THRESHOLD_YELLOW, SIZE_THRESHOLD_ORANGE])(
    'ab %i Bytes keine Zeitschätzung',
    (bytes) => {
      const store = useConverterStore()
      store.files = [{ id: 1, name: 'a.wav', size: bytes }]
      wrapper = mount(SizeWarning, { global: { plugins: [i18n] } })
      expect(wrapper.text()).not.toMatch(/Minute|minute/)
    },
  )

  it('keine Minutenangaben in den Übersetzungen', () => {
    const messages = JSON.stringify(i18n.global.messages.value)
    expect(messages).not.toMatch(/\d+-\d+ (?:Minuten|minutes)|estimatedTime/)
  })
})
