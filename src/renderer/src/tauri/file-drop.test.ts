// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDesktopFileDrop } from './file-drop'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('Tauri native drop routing', () => {
  it('resolves the terminal leaf and tab from the actual drop position', () => {
    document.body.innerHTML =
      '<div data-native-file-drop-target="terminal" data-terminal-tab-id="tab-1"><div data-leaf-id="leaf-2"><span id="hit">terminal</span></div></div>'
    const hit = vi
      .spyOn(document, 'elementFromPoint')
      .mockReturnValue(document.getElementById('hit'))
    expect(resolveDesktopFileDrop({ paths: ['/tmp/test.md'], x: 15, y: 25 })).toEqual({
      paths: ['/tmp/test.md'],
      target: 'terminal',
      tabId: 'tab-1',
      paneLeafId: 'leaf-2'
    })
    expect(hit).toHaveBeenCalledWith(15, 25)
  })

  it('uses the nearest explorer destination and rejects an explorer without one', () => {
    document.body.innerHTML =
      '<div data-native-file-drop-target="file-explorer" data-native-file-drop-dir="/repo"><span id="hit" data-native-file-drop-dir="/repo/docs">docs</span></div>'
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(document.getElementById('hit'))
    const drop = { paths: ['/tmp/test.md'], x: 1, y: 1 }
    expect(resolveDesktopFileDrop(drop)).toEqual({
      paths: drop.paths,
      target: 'file-explorer',
      destinationDir: '/repo/docs'
    })
    document
      .querySelectorAll('[data-native-file-drop-dir]')
      .forEach((element) => element.removeAttribute('data-native-file-drop-dir'))
    expect(resolveDesktopFileDrop(drop)).toBeNull()
  })

  it('retains bounded rejection metadata and rejects invalid coordinates or paths', () => {
    const rejected = { target: 'rejected', reason: 'too-many-paths', pathCount: 257, byteLength: 0 }
    expect(resolveDesktopFileDrop(rejected)).toEqual(rejected)
    expect(resolveDesktopFileDrop({ paths: [false], x: 1, y: 2 })).toBeNull()
    expect(resolveDesktopFileDrop({ paths: ['/tmp/private'], x: Number.NaN, y: 2 })).toBeNull()
  })
})
