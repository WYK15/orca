import { describe, expect, it } from 'vitest'
import { agentBrowserBinaryName } from './agent-browser-binary-name'

describe('agentBrowserBinaryName', () => {
  it('uses the available x64 helper on Windows ARM64', () => {
    expect(agentBrowserBinaryName('win32', 'arm64')).toBe('agent-browser-win32-x64.exe')
  })

  it('keeps native helpers on other supported platforms', () => {
    expect(agentBrowserBinaryName('win32', 'x64')).toBe('agent-browser-win32-x64.exe')
    expect(agentBrowserBinaryName('darwin', 'arm64')).toBe('agent-browser-darwin-arm64')
    expect(agentBrowserBinaryName('linux', 'x64')).toBe('agent-browser-linux-x64')
  })
})
