/**
 * N2: Kapitel und Tracklist (.txt/.cue/.m3u/.pls/.json) der fertigen Playlist.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import i18n from '../i18n'
import DownloadButton from '../components/DownloadButton.vue'
import { useConverterStore } from '../stores/converter'
import {
  buildCueSheet,
  buildM3u,
  buildPls,
  buildTracklistJson,
  buildTracklistText,
  cueTime,
  sourceFileNames,
  tracklistTime,
} from '../utils/tracklist'
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

describe('Playlist-Formate M3U, PLS, JSON', () => {
  const FILES = ['Intro.mp3', 'Der "beste" Song.flac', 'Outro.wav']

  it('ordnet Kapitel den Originaldateien der Reihe nach zu', () => {
    expect(sourceFileNames(CHAPTERS, FILES)).toEqual(FILES)
    // Kapitel ohne Länge fehlen beim Server → kein Versatz per Index
    expect(sourceFileNames([CHAPTERS[0], CHAPTERS[2]], FILES)).toEqual(['Intro.mp3', 'Outro.wav'])
    // Gleichnamige Tracks bleiben getrennt, Unbekanntes fällt auf den Titel zurück
    expect(
      sourceFileNames(
        [CHAPTERS[0], CHAPTERS[0], { title: 'Neu', start: 0, end: 1 }],
        ['Intro.mp3', 'Intro.ogg'],
      ),
    ).toEqual(['Intro.mp3', 'Intro.ogg', 'Neu'])
    expect(sourceFileNames(CHAPTERS, [])).toEqual(['Intro', 'Der "beste" Song', 'Outro'])
  })

  it('Extended M3U mit #EXTINF (gerundete Dauer) und Datei je Track', () => {
    expect(buildM3u(CHAPTERS, { files: FILES, title: 'Sommer' }).split('\n')).toEqual([
      '#EXTM3U',
      '#EXTENC:UTF-8',
      '#PLAYLIST:Sommer',
      '#EXTINF:63,Intro',
      'Intro.mp3',
      '#EXTINF:3663,Der "beste" Song',
      'Der "beste" Song.flac',
      '#EXTINF:75,Outro',
      'Outro.wav',
      '',
    ])
    const broken = buildM3u([{ title: 'A\nB', start: 0, end: 1 }], { files: ['x\r\ny.mp3'] })
    expect(broken).toBe('#EXTM3U\n#EXTENC:UTF-8\n#EXTINF:1,A B\nx y.mp3\n')
  })

  it('PLS Version 2 mit File/Title/Length und Anzahl', () => {
    expect(buildPls(CHAPTERS, { files: FILES }).split('\r\n')).toEqual([
      '[playlist]',
      'File1=Intro.mp3',
      'Title1=Intro',
      'Length1=63',
      'File2=Der "beste" Song.flac',
      'Title2=Der "beste" Song',
      'Length2=3663',
      'File3=Outro.wav',
      'Title3=Outro',
      'Length3=75',
      'NumberOfEntries=3',
      'Version=2',
      '',
    ])
  })

  it('JSON mit Playlist-Datei und Zeiten je Track', () => {
    const data = JSON.parse(
      buildTracklistJson(CHAPTERS, {
        files: FILES,
        fileName: 'Mix.mp3',
        title: 'Sommer',
        performer: 'Kodini',
      }),
    )
    expect(data).toMatchObject({ title: 'Sommer', performer: 'Kodini', file: 'Mix.mp3' })
    expect(data.duration).toBe(3800)
    expect(data.tracks[1]).toEqual({
      number: 2,
      title: 'Der "beste" Song',
      file: 'Der "beste" Song.flac',
      start: 62.5,
      end: 3725.4,
      duration: 3662.9,
      startTime: '1:02',
    })
    expect(JSON.parse(buildTracklistJson([], { files: [], fileName: 'x.mp3' }))).toEqual({
      title: null,
      performer: null,
      file: 'x.mp3',
      duration: 0,
      tracks: [],
    })
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
    store.files = [
      { id: 1, name: 'Intro.mp3', size: 1, file: new File(['x'], 'Intro.mp3') },
      { id: 2, name: 'Outro.wav', size: 1, file: new File(['x'], 'Outro.wav') },
    ]
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
    await wrapper.get('[data-tracklist="m3u"]').trigger('click')
    await wrapper.get('[data-tracklist="pls"]').trigger('click')
    await wrapper.get('[data-tracklist="json"]').trigger('click')
    expect(names).toEqual([
      'Sommer Mix.txt',
      'Sommer Mix.cue',
      'Sommer Mix.m3u',
      'Sommer Mix.pls',
      'Sommer Mix.json',
    ])
    expect(await blobs[0].text()).toContain('1:02 Der "beste" Song')
    expect(await blobs[1].text()).toContain('FILE "Sommer Mix.mp3" MP3')
    expect(await blobs[2].text()).toContain('#EXTINF:63,Intro\nIntro.mp3')
    expect(blobs[2].type).toBe('audio/x-mpegurl;charset=utf-8')
    expect(await blobs[3].text()).toContain('File3=Outro.wav')
    expect(JSON.parse(await blobs[4].text()).file).toBe('Sommer Mix.mp3')
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(5)
  })
})
