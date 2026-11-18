// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CreateSidebarProjectGroupButton } from './CreateSidebarProjectGroupButton'

const mocks = vi.hoisted(() => ({
  state: {
    groupBy: 'repo',
    createProjectGroup: vi.fn(),
    setGroupBy: vi.fn(),
    revealSidebarRow: vi.fn()
  },
  error: vi.fn()
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('sonner', () => ({ toast: { error: mocks.error } }))
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.groupBy = 'repo'
  mocks.state.createProjectGroup.mockResolvedValue({ id: 'new-group' })
})

async function enterName() {
  render(
    <TooltipProvider>
      <CreateSidebarProjectGroupButton />
    </TooltipProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'New group' }))
  const input = await screen.findByRole('textbox')
  await waitFor(() => expect(document.activeElement).toBe(input))
  fireEvent.change(input, { target: { value: '  Work  ' } })
  fireEvent.submit(input.closest('form')!)
}

it('creates a root group and reveals it without resetting existing collapsed folders', async () => {
  await enterName()
  await waitFor(() =>
    expect(mocks.state.revealSidebarRow).toHaveBeenCalledWith('project-group:new-group')
  )
  expect(mocks.state.createProjectGroup).toHaveBeenCalledWith('Work')
  expect(mocks.state.setGroupBy).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

it('keeps the dialog open and editable if saving the group fails', async () => {
  mocks.state.createProjectGroup.mockResolvedValue(null)
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    await enterName()
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Could not create the group.'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create' }).hasAttribute('disabled')).toBe(false)
    )
    expect(mocks.state.revealSidebarRow).not.toHaveBeenCalled()
  } finally {
    log.mockRestore()
  }
})
