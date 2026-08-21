// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GeneralUpdateSettingsSection } from './GeneralUpdateSettingsSection'

const mocks = vi.hoisted(() => ({
  download: vi.fn().mockResolvedValue(undefined),
  getVersion: vi.fn().mockResolvedValue('1.4.165-wyk.4'),
  openUrl: vi.fn().mockResolvedValue(undefined),
  updateStatus: {
    state: 'idle'
  } as Record<string, unknown>
}))

vi.mock('../../store', () => ({
  useAppStore: (selector: (state: { updateStatus: Record<string, unknown> }) => unknown) =>
    selector({ updateStatus: mocks.updateStatus })
}))

vi.mock('./GeneralRemoteServerUpdates', () => ({
  GeneralRemoteServerUpdates: () => null
}))

vi.mock('./ReleaseChannelSection', () => ({
  ReleaseChannelSection: () => null
}))

vi.mock('./SearchableSetting', () => ({
  SearchableSetting: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))

vi.mock('./SettingsFormControls', () => ({
  SettingsSubsectionHeader: ({ title }: { title: string }) => <h2>{title}</h2>
}))

describe('GeneralUpdateSettingsSection', () => {
  beforeEach(() => {
    mocks.download.mockClear()
    mocks.openUrl.mockClear()
    window.api = {
      shell: { openUrl: mocks.openUrl },
      updater: {
        check: vi.fn(),
        download: mocks.download,
        getVersion: mocks.getVersion,
        quitAndInstall: vi.fn()
      }
    } as unknown as typeof window.api
  })

  afterEach(cleanup)

  it('opens the exact release page for manual updates', () => {
    mocks.updateStatus = {
      state: 'available',
      version: '1.4.165-wyk.5',
      delivery: 'manual',
      releaseUrl: 'https://github.com/WYK15/orca/releases/tag/v1.4.165-wyk.5'
    }

    render(<GeneralUpdateSettingsSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Download Page' }))

    expect(mocks.openUrl).toHaveBeenCalledWith(
      'https://github.com/WYK15/orca/releases/tag/v1.4.165-wyk.5'
    )
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it('keeps automatic updates on the updater download path', () => {
    mocks.updateStatus = {
      state: 'available',
      version: '1.4.165-wyk.5'
    }

    render(<GeneralUpdateSettingsSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Install Update (1.4.165-wyk.5)' }))

    expect(mocks.download).toHaveBeenCalledOnce()
    expect(mocks.openUrl).not.toHaveBeenCalled()
  })
})
