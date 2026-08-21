// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '../../store'
import { GeneralUpdateSettingsSection } from './GeneralUpdateSettingsSection'

vi.mock('./GeneralRemoteServerUpdates', () => ({ GeneralRemoteServerUpdates: () => null }))
vi.mock('./ReleaseChannelSection', () => ({ ReleaseChannelSection: () => null }))

beforeEach(() => {
  useAppStore.setState({
    updateStatus: { state: 'available', version: '1.4.200', changelog: null }
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      shell: { openUrl: vi.fn().mockResolvedValue(undefined) },
      updater: {
        check: vi.fn(),
        download: vi.fn(),
        getVersion: vi.fn().mockResolvedValue('1.4.199')
      }
    }
  })
})

afterEach(() => {
  cleanup()
  useAppStore.setState({ updateStatus: { state: 'idle' } })
})

it('describes the available action as a download', () => {
  render(<GeneralUpdateSettingsSection />)

  expect(screen.getByRole('button', { name: 'Download Update (1.4.200)' })).toBeTruthy()
  expect(screen.getByText(/is available\. Click "Download Update" to download it\./)).toBeTruthy()
  expect(screen.queryByText(/download and install it/)).toBeNull()
})

it('opens the exact fork release rather than downloading a manual update', () => {
  const releaseUrl = 'https://github.com/WYK15/orca/releases/tag/v1.4.218-wyk.1'
  useAppStore.setState({
    updateStatus: {
      state: 'available',
      version: '1.4.218-wyk.1',
      changelog: null,
      delivery: 'manual',
      releaseUrl
    }
  })
  render(<GeneralUpdateSettingsSection />)
  fireEvent.click(screen.getByRole('button', { name: 'Open Download Page' }))
  expect(window.api.shell.openUrl).toHaveBeenCalledWith(releaseUrl)
  expect(window.api.updater.download).not.toHaveBeenCalled()
})

it('keeps externally managed packages on the system package manager path', () => {
  useAppStore.setState({
    updateStatus: {
      state: 'available',
      version: '1.4.218-wyk.1',
      changelog: null,
      delivery: 'manual',
      externallyManaged: true
    }
  })
  render(<GeneralUpdateSettingsSection />)
  expect(screen.queryByRole('button', { name: 'Open Download Page' })).toBeNull()
  expect(screen.getByText(/system package manager/)).toBeTruthy()
})
