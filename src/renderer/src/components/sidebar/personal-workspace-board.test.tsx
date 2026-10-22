// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import {
  OPEN_WORKSPACE_BOARD_EVENT,
  useWorkspaceBoardPanel,
  type WorkspaceBoardPanelState
} from './useWorkspaceBoardPanel'

const record = vi.hoisted(() => vi.fn())
vi.mock('../../../../shared/fork-feature-policy', () => ({ WORKSPACE_BOARD_ENABLED: false }))
vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({ recordFeatureInteraction: record }) }
}))

it('keeps the omitted board closed for shortcuts, menu actions, and card drag previews', async () => {
  let panel!: WorkspaceBoardPanelState
  function Probe() {
    panel = useWorkspaceBoardPanel()
    return null
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(<Probe />)
    })
    await act(async () => {
      panel.openWorkspaceBoard()
      panel.toggleWorkspaceBoard()
      panel.previewWorkspaceBoardFromDrag()
      panel.solidifyWorkspaceBoardFromDrag()
      window.dispatchEvent(new Event(OPEN_WORKSPACE_BOARD_EVENT))
    })
    expect(panel.workspaceBoardOpen).toBe(false)
    expect(panel.workspaceBoardRenderedOpen).toBe(false)
    expect(record).not.toHaveBeenCalled()
  } finally {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  }
})
