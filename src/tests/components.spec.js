/**
 * Komponenten auf den v2-Tokens: Status über Kante, Icon und Text statt
 * Flächenfarbe; zugängliche Namen für Icon-Buttons; Größenwarnung in vier Stufen.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import i18n from '../i18n'
import ToastContainer from '../components/ToastContainer.vue'
import SizeWarning from '../components/SizeWarning.vue'
import StatusIcon from '../components/StatusIcon.vue'
import FileList from '../components/FileList.vue'
import { useToastStore } from '../stores/toast'
import { useConverterStore } from '../stores/converter'
import { MAX_PLAYLIST_SIZE, SIZE_THRESHOLD_ORANGE, SIZE_THRESHOLD_YELLOW } from '../constants'

let pinia

function mountWith(component) {
  return mount(component, { global: { plugins: [pinia, i18n] } })
}

beforeEach(() => {
  localStorage.clear()
  pinia = createPinia()
  setActivePinia(pinia)
  i18n.global.locale.value = 'de'
})

describe('StatusIcon', () => {
  it.each([
    ['success', 'text-success'],
    ['error', 'text-danger'],
    ['warning', 'text-warning'],
    ['pending', 'text-warning'],
    ['info', 'text-info'],
  ])('%s nutzt %s und ist dekorativ', (type, colorClass) => {
    const wrapper = mount(StatusIcon, { props: { type } })
    expect(wrapper.classes()).toContain(colorClass)
    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('path').attributes('d')).toBeTruthy()
  })
})

describe('ToastContainer', () => {
  it('zeigt Toasts mit Statuskante, Rolle und beschriftetem Schließen-Button', async () => {
    const wrapper = mountWith(ToastContainer)
    const store = useToastStore()
    store.success('Gespeichert', 0)
    store.error('Fehlgeschlagen', 0)
    await wrapper.vm.$nextTick()

    const toasts = wrapper.findAll('[role="status"], [role="alert"]')
    expect(toasts).toHaveLength(2)
    expect(toasts[0].attributes('role')).toBe('status')
    expect(toasts[0].classes()).toContain('border-l-success')
    expect(toasts[1].attributes('role')).toBe('alert')
    expect(toasts[1].classes()).toContain('border-l-danger')
    expect(toasts[0].text()).toContain('Gespeichert')
    expect(toasts[0].text()).not.toMatch(/[✓✕⚠ℹ]/)

    const close = toasts[0].get('button')
    expect(close.attributes('aria-label')).toBe('Schließen')
    await close.trigger('click')
    expect(store.toasts).toHaveLength(1)
  })
})

describe('SizeWarning', () => {
  function withTotalSize(bytes) {
    const store = useConverterStore()
    store.files = bytes === null ? [] : [{ id: 1, name: 'a.mp3', size: bytes }]
    return mountWith(SizeWarning)
  }

  it('rendert ohne Dateien nichts', () => {
    expect(withTotalSize(null).find('section').exists()).toBe(false)
  })

  it.each([
    ['unter der gelben Schwelle', 10 * 1024 * 1024, 'border-l-success', 'status', 'sizeOk.title'],
    [
      'ab der gelben Schwelle',
      SIZE_THRESHOLD_YELLOW,
      'border-l-info',
      'status',
      'sizeYellowWarning.title',
    ],
    [
      'ab der orangen Schwelle',
      SIZE_THRESHOLD_ORANGE,
      'border-l-warning',
      'status',
      'sizeOrangeWarning.title',
    ],
    ['über dem Limit', MAX_PLAYLIST_SIZE + 1, 'border-l-danger', 'alert', 'sizeWarning.title'],
  ])('%s: %s, Rolle %s', (_label, bytes, edgeClass, role, titleKey) => {
    const section = withTotalSize(bytes).get('section')
    expect(section.classes()).toContain(edgeClass)
    expect(section.attributes('role')).toBe(role)
    expect(section.get('h3').text()).toBe(i18n.global.t(titleKey))
  })

  it('zeigt die Überschreitung nur über dem Limit', () => {
    expect(withTotalSize(MAX_PLAYLIST_SIZE + 1).findAll('dt')).toHaveLength(3)
    expect(withTotalSize(SIZE_THRESHOLD_YELLOW).findAll('dt')).toHaveLength(2)
  })
})

describe('FileList', () => {
  it('beschriftet Play- und Entfernen-Buttons und markiert Entfernen als destruktiv', async () => {
    const store = useConverterStore()
    store.files = [{ id: 7, name: 'Sunset Drive.mp3', size: 4_200_000 }]
    const wrapper = mountWith(FileList)

    const remove = wrapper.get('button[aria-label^="Entfernen"]')
    expect(remove.attributes('aria-label')).toBe('Entfernen: Sunset Drive.mp3')
    expect(wrapper.get('button[aria-label="Track abspielen"]').exists()).toBe(true)
    expect(wrapper.get('button.text-danger').text()).toBe('Alle entfernen')

    await remove.trigger('click')
    expect(store.files).toHaveLength(0)
  })

  // F8: Reihenfolge ohne Drag & Drop (Touch, Tastatur)
  function listOfThree() {
    const store = useConverterStore()
    store.files = ['a.mp3', 'b.mp3', 'c.mp3'].map((name, i) => ({ id: i + 1, name, size: 1 }))
    const wrapper = mount(FileList, {
      attachTo: document.body,
      global: { plugins: [pinia, i18n] },
    })
    const names = () => store.files.map((f) => f.name)
    return { store, wrapper, names }
  }

  it('↑/↓-Buttons verschieben Tracks; an den Rändern gesperrt', async () => {
    const { wrapper, names } = listOfThree()
    expect(wrapper.get('[data-move="up"][data-track-id="1"]').attributes('disabled')).toBeDefined()
    expect(
      wrapper.get('[data-move="down"][data-track-id="3"]').attributes('disabled'),
    ).toBeDefined()
    expect(wrapper.get('[data-move="down"][data-track-id="1"]').attributes('aria-label')).toBe(
      'Nach unten: a.mp3',
    )

    await wrapper.get('[data-move="down"][data-track-id="1"]').trigger('click')
    expect(names()).toEqual(['b.mp3', 'a.mp3', 'c.mp3'])
    await wrapper.get('[data-move="up"][data-track-id="3"]').trigger('click')
    expect(names()).toEqual(['b.mp3', 'c.mp3', 'a.mp3'])
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[aria-live="polite"]').text()).toBe(
      '„c.mp3“ ist jetzt an Position 2 von 3.',
    )
    wrapper.unmount()
  })

  it('Alt+Pfeiltaste verschiebt; Fokus wechselt am Rand auf die andere Richtung', async () => {
    const { wrapper, names } = listOfThree()
    const up = wrapper.get('[data-move="up"][data-track-id="2"]')
    up.element.focus()
    await up.trigger('keydown', { key: 'ArrowUp', altKey: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(names()).toEqual(['b.mp3', 'a.mp3', 'c.mp3'])
    // b ist jetzt oben, "nach oben" gesperrt: Fokus liegt auf "nach unten" von b
    expect(document.activeElement).toBe(
      wrapper.get('[data-move="down"][data-track-id="2"]').element,
    )

    // ohne Alt passiert nichts
    await up.trigger('keydown', { key: 'ArrowDown' })
    expect(names()).toEqual(['b.mp3', 'a.mp3', 'c.mp3'])
    wrapper.unmount()
  })
})
