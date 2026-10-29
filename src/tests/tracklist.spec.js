/**
 * N2: Kapitel und Tracklist (.txt/.cue) der fertigen Playlist.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import i18n from '../i18n'
import DownloadButton from '../components/DownloadButton.vue'
import { useConverterStore } from '../stores/converter'
import { buildCueSheet, buildTracklistText, cueTime, tracklistTime } from '../utils/tracklist'
import * as api from '../api/converter'

vi.mock('../utils/sharedFileRepository', () => ({ replaceSharedFiles: vi.fn() }))
vi.mock('../api/converter', async (importOriginal) => ({
  ...(await importOriginal()),
  uploadFiles: vi.fn(),
  startConversion: vi.fn(),
  subscribeStatus: vi.fn(() => () => {}),
}))

const CHAPTERS = [
  { title: 'Intro', start: 0, end: 62.5 },
  { title: 'Der "beste" Song', start: 62.5, end: 3725.4 },
  { title: 'Outro', start: 3725.4, end: 3800 },
]

let pinia

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  i18n.global.locale.value = 'de'
  vi.clearAllMocks()
})

afterEach(() => vi.restoreAllMocks())

describe('Tracklist-Formate', () => {
  it('Zeiten für Text und CUE', () => {
    expect(tracklistTime(62.5)).toBe('1:02')
    expect(tracklistTime(3725.4)).toBe('1:02:05')
    expect(cueTime(62.5)).toBe('01:02:38')
    expect(cueTime(3725.4)).toBe('62:05:30')
  })

  it('Textliste: Startzeit und Titel je Zeile', () => {
    expect(buildTracklistText(CHAPTERS)).toBe('0:00 Intro\n1:02 Der "beste" Song\n1:02:05 Outro\n')
  })

  it('CUE-Sheet mit Datei, Titel, Interpret und ersetzten Anführungszeichen', () => {
    const cue = buildCueSheet(CHAPTERS, {
      fileName: 'Mix.mp3',
      title: 'Sommer',
      performer: 'Kodini',
    })
    expect(cue.split('\r\n')).toEqual([
      'PERFORMER "Kodini"',
      'TITLE "Sommer"',
      'FILE "Mix.mp3" MP3',
      '  TRACK 01 AUDIO',
      '    TITLE "Intro"',
      '    INDEX 01 00:00:00',
      '  TRACK 02 AUDIO',
      '    TITLE "Der \'beste\' Song"',
      '    INDEX 01 01:02:38',
      '  TRACK 03 AUDIO',
      '    TITLE "Outro"',
      '    INDEX 01 62:05:30',
      '',
    ])
    expect(buildCueSheet(CHAPTERS, { fileName: 'Mix.ogg' })).toContain('FILE "Mix.ogg" WAVE')
  })
})

describe('Kapitel aus dem Status', () => {
  it('convert schickt die Originalnamen als Titel', async () => {
    api.uploadFiles.mockResolvedValue({ data: { session_id: 's1' } })
    api.startConversion.mockResolvedValue({ data: {} })
    const store = useConverterStore()
    store.files = [{ id: 1, name: 'Song; Teil 2.mp3', size: 1, file: new File(['x'], 'a.mp3') }]
    await store.convert()
    expect(api.startConversion).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ titles: ['Song; Teil 2.mp3'] }),
      expect.anything(),
    )
  })
})

describe('DownloadButton: Tracklist', () => {
  function mountWith(chapters) {
    const store = useConverterStore()
    store.downloadUrl = '/api/download/abc'
    store.outputName = 'Sommer Mix'
    store.chapters = chapters
    return mount(DownloadButton, { global: { plugins: [pinia, i18n] } })
  }

  it('erscheint erst ab zwei Kapiteln', () => {
    expect(mountWith([CHAPTERS[0]]).find('[data-testid="tracklist"]').exists()).toBe(false)
    expect(mountWith(CHAPTERS).get('[data-testid="tracklist"]').text()).toContain(
      '3 Kapitel eingebettet',
    )
  })

  it('lädt die Tracklist unter dem Namen der Playlist herunter', async () => {
    const blobs = []
    URL.createObjectURL = vi.fn((blob) => {
      blobs.push(blob)
      return 'blob:x'
    })
    URL.revokeObjectURL = vi.fn()
    const names = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      names.push(this.download)
    })
    const wrapper = mountWith(CHAPTERS)
    await wrapper.get('[data-tracklist="txt"]').trigger('click')
    await wrapper.get('[data-tracklist="cue"]').trigger('click')
    expect(names).toEqual(['Sommer Mix.txt', 'Sommer Mix.cue'])
    expect(await blobs[0].text()).toContain('1:02 Der "beste" Song')
    expect(await blobs[1].text()).toContain('FILE "Sommer Mix.mp3" MP3')
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
  })
})
