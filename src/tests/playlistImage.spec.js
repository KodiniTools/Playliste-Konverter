/**
 * Playlist als Bild (1:1 / 2:3) mit den Einstellungen aus dem Playlist Generator:
 * Farben, Hintergrundbild mit Deckkraft, Textgröße und Textdeckkraft.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import i18n from '../i18n'
import PlaylistImage from '../components/PlaylistImage.vue'
import { useConverterStore } from '../stores/converter'
import * as image from '../utils/playlistImage'

const {
  PLAYLIST_IMAGE_SIZES,
  coverCrop,
  defaultImageColors,
  drawPlaylistImage,
  imageRows,
  imagePalette,
  imageTracks,
  playlistImageFileName,
  scaledGeometry,
} = image

vi.mock('../utils/playlistImage', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    renderPlaylistImage: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
  }
})

/** Minimaler 2D-Kontext, der Texte und Deckkraft beim Zeichnen mitschreibt. */
function fakeContext() {
  const texts = []
  const ctx = {
    globalAlpha: 1,
    font: '',
    fillStyle: '',
    texts,
    measureText: (text) => ({ width: text.length * 10 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    fillText(text, x, y) {
      texts.push({ text, y, alpha: ctx.globalAlpha, font: ctx.font })
    },
  }
  for (const name of [
    'fillRect',
    'save',
    'restore',
    'beginPath',
    'arc',
    'fill',
    'stroke',
    'drawImage',
  ])
    ctx[name] = () => {}
  return ctx
}

const DATA = {
  name: 'Sommer Mix',
  tracks: Array.from({ length: 30 }, (_, i) => ({ title: `Song ${i + 1}`, seconds: 180 })),
  meta: '30 Titel · 90 min',
  kicker: 'Playlist',
  moreLabel: '+ {count} weitere Titel',
  footer: 'Fuß',
}

describe('playlistImage-Hilfen', () => {
  it('Formate 1:1 und 2:3', () => {
    expect(PLAYLIST_IMAGE_SIZES.square).toEqual({ width: 1080, height: 1080 })
    expect(PLAYLIST_IMAGE_SIZES.portrait).toEqual({ width: 1080, height: 1620 })
  })

  it('imageRows fasst überzählige Titel in „+ N weitere“ zusammen', () => {
    const tracks = DATA.tracks.slice(0, 5)
    expect(imageRows(tracks, 5)).toEqual({ tracks, more: 0 })
    expect(imageRows(tracks, 3)).toEqual({ tracks: tracks.slice(0, 2), more: 3 })
    expect(imageRows(tracks, 0.4).tracks).toHaveLength(0)
  })

  it('imageTracks nimmt die Kapitel, sonst die Dateien mit Zuschnitt', () => {
    const chapters = [
      { title: 'A', start: 0, end: 60 },
      { title: 'B', start: 60, end: 150 },
    ]
    expect(imageTracks(chapters, [])).toEqual({
      tracks: [
        { title: 'A', seconds: 60 },
        { title: 'B', seconds: 90 },
      ],
      totalSeconds: 150,
      incomplete: false,
    })
    const files = [
      { name: 'eins.mp3', duration: 100, trimStart: 10, trimEnd: 70 },
      { name: 'zwei.wav', duration: null },
    ]
    expect(imageTracks([], files)).toEqual({
      tracks: [
        { title: 'eins', seconds: 60 },
        { title: 'zwei', seconds: null },
      ],
      totalSeconds: 60,
      incomplete: true,
    })
  })

  it('Dateiname enthält das Seitenverhältnis', () => {
    expect(playlistImageFileName('Sommer: Mix', 'square', 'image/png')).toBe('Sommer_ Mix-1x1.png')
    expect(playlistImageFileName('  ', 'portrait', 'image/jpeg')).toBe('playlist-2x3.jpg')
  })

  it('Textgröße skaliert Schrift und Zeilen, Ränder bleiben; Grenzen 70–140 %', () => {
    const base = scaledGeometry('square', 1)
    const big = scaledGeometry('square', 1.4)
    expect(big.track).toBeCloseTo(base.track * 1.4)
    expect(big.row).toBeCloseTo(base.row * 1.4)
    expect(big.pad).toBe(base.pad)
    expect(scaledGeometry('square', 5).track).toBeCloseTo(base.track * 1.4)
    expect(scaledGeometry('square', 0).track).toBeCloseTo(base.track * 0.7)
  })

  it('Theme-Farben unverändert, eigene Farben ergeben gemischte Nebentöne', () => {
    const dark = defaultImageColors('dark')
    expect(imagePalette('dark').bg).toBe(dark.background)
    const custom = imagePalette('dark', { text: '#ffffff', background: '#000000' })
    expect(custom).toMatchObject({ bg: '#000000', text: '#ffffff' })
    expect(custom.muted).not.toBe('#ffffff')
  })

  it('coverCrop schneidet mittig wie object-fit: cover', () => {
    expect(coverCrop(2000, 1000, 1080, 1080)).toEqual({ sx: 500, sy: 0, sw: 1000, sh: 1000 })
  })

  it('größerer Text zeigt weniger Zeilen, 2:3 mehr als 1:1', () => {
    const rows = (format, textScale) => {
      const ctx = fakeContext()
      drawPlaylistImage(ctx, DATA, format, { theme: 'dark', textScale })
      return ctx.texts.filter((t) => /^Song /.test(t.text)).length
    }
    expect(rows('square', 1.4)).toBeLessThan(rows('square', 1))
    expect(rows('portrait', 1)).toBeGreaterThan(rows('square', 1))
  })

  it('Textdeckkraft gilt für alle Texte, untere Grenze 20 %', () => {
    const ctx = fakeContext()
    drawPlaylistImage(ctx, DATA, 'square', { theme: 'light', textOpacity: 0.5 })
    expect(ctx.texts.length).toBeGreaterThan(0)
    expect(ctx.texts.every((t) => t.alpha === 0.5)).toBe(true)
    const faint = fakeContext()
    drawPlaylistImage(faint, DATA, 'square', { theme: 'light', textOpacity: 0 })
    expect(faint.texts.every((t) => t.alpha === 0.2)).toBe(true)
  })
})

describe('PlaylistImage-Komponente', () => {
  let wrapper

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    i18n.global.locale.value = 'de'
    vi.clearAllMocks()
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    URL.revokeObjectURL = vi.fn()
    const store = useConverterStore()
    store.chapters = [
      { title: 'Intro', start: 0, end: 62 },
      { title: 'Outro', start: 62, end: 200 },
    ]
    store.outputName = 'Sommer'
  })

  afterEach(() => wrapper?.unmount())

  async function openPanel() {
    wrapper = mount(PlaylistImage, { global: { plugins: [i18n] } })
    const details = wrapper.find('details').element
    details.open = true
    await wrapper.find('details').trigger('toggle')
    await flushPromises()
  }

  it('zeichnet erst beim Aufklappen und zeigt die Vorschau', async () => {
    wrapper = mount(PlaylistImage, { global: { plugins: [i18n] } })
    await flushPromises()
    expect(image.renderPlaylistImage).not.toHaveBeenCalled()
    wrapper.unmount()

    await openPanel()
    expect(image.renderPlaylistImage).toHaveBeenCalledTimes(1)
    const [data, format, style] = image.renderPlaylistImage.mock.calls[0]
    expect(format).toBe('square')
    expect(data.name).toBe('Sommer')
    expect(data.moreLabel).toBe('+ {count} weitere Titel')
    expect(data.tracks.map((t) => t.title)).toEqual(['Intro', 'Outro'])
    expect(style).toMatchObject({ textScale: 1, textOpacity: 1, background: null })
    expect(wrapper.find('[data-testid="image-preview"]').exists()).toBe(true)
  })

  it('übergibt Format 2:3, Textgröße und Textdeckkraft', async () => {
    await openPanel()
    await wrapper.find('[data-format="portrait"]').setValue()
    await wrapper.find('[data-input="text-size"]').setValue('120')
    await wrapper.find('[data-input="text-opacity"]').setValue('60')
    await flushPromises()
    const [, format, style] = image.renderPlaylistImage.mock.calls.at(-1)
    expect(format).toBe('portrait')
    expect(style.textScale).toBeCloseTo(1.2)
    expect(style.textOpacity).toBeCloseTo(0.6)
  })

  it('Farben: Zurücksetzen erst nach Änderung, Warnung bei schwachem Kontrast', async () => {
    await openPanel()
    const reset = wrapper.find('[data-action="reset-colors"]')
    expect(reset.attributes('disabled')).toBeDefined()
    await wrapper.find('[data-color="text"]').setValue('#111111')
    await wrapper.find('[data-color="background"]').setValue('#151515')
    expect(reset.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="low-contrast"]').exists()).toBe(true)
    const [, , style] = image.renderPlaylistImage.mock.calls.at(-1)
    expect(style.colors).toEqual({ text: '#111111', background: '#151515' })
    await reset.trigger('click')
    expect(wrapper.find('[data-testid="low-contrast"]').exists()).toBe(false)
  })

  it('geringe Textdeckkraft löst die Kontrastwarnung aus', async () => {
    await openPanel()
    expect(wrapper.find('[data-testid="low-contrast"]').exists()).toBe(false)
    await wrapper.find('[data-input="text-opacity"]').setValue('20')
    expect(wrapper.find('[data-testid="low-contrast"]').exists()).toBe(true)
  })

  it('Download nutzt Name und Seitenverhältnis', async () => {
    await openPanel()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    let downloaded = ''
    click.mockImplementation(function () {
      downloaded = this.download
    })
    await wrapper.find('[data-action="download"]').trigger('click')
    expect(downloaded).toBe('Sommer-1x1.png')
    click.mockRestore()
  })
})
