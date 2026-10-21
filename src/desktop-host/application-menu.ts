import type { MenuItemConstructorOptions } from 'electron'
import { nativeCall, sendDesktopEvent } from './desktop-context'
import { desktopWindow, ipcMain } from './ipc-port'

type NativeMenuItem = {
  id: string
  label: string | null
  role: string | null
  type: string | null
  enabled: boolean
  checked: boolean
  accelerator: string | null
  submenu: NativeMenuItem[] | null
}
type DesktopMenu = { items: NativeMenuItem[]; callbacks: Map<string, () => void> }
let nextId = 0
let installed: DesktopMenu | null = null
let previous: DesktopMenu | null = null
let installing: DesktopMenu | null = null
let queue = Promise.resolve()

ipcMain.on('desktop:menu-click', (_event, id: unknown) => {
  if (typeof id !== 'string') {
    return
  }
  const callback =
    installing?.callbacks.get(id) ?? installed?.callbacks.get(id) ?? previous?.callbacks.get(id)
  callback?.()
})

export const Menu = {
  buildFromTemplate(template: MenuItemConstructorOptions[]): DesktopMenu {
    const callbacks = new Map<string, () => void>()
    const convert = (entries: MenuItemConstructorOptions[]): NativeMenuItem[] =>
      entries
        .filter((item) => item.visible !== false)
        .map((item) => {
          const id = `desktop-menu-${++nextId}`
          if (item.click) {
            callbacks.set(id, () =>
              item.click!(
                undefined as never,
                desktopWindow as never,
                { triggeredByAccelerator: false } as never
              )
            )
          }
          return {
            id,
            label: item.label ?? null,
            role: item.role ?? null,
            type: item.type ?? null,
            enabled: item.enabled !== false,
            checked: item.checked === true,
            accelerator: item.accelerator ?? null,
            submenu: Array.isArray(item.submenu) ? convert(item.submenu) : null
          }
        })
    return { items: convert(template), callbacks }
  },
  setApplicationMenu(menu: DesktopMenu): void {
    queue = queue
      .then(async () => {
        installing = menu
        try {
          await nativeCall('menu-set', menu.items)
          previous = installed
          installed = menu
        } finally {
          installing = null
        }
      })
      .catch((error) => console.error('[desktop-host] Native menu unavailable:', error))
  },
  getApplicationMenu: () => ({ popup: () => sendDesktopEvent('desktop:show-menu') })
}
