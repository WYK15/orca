type NativeWindowDrag = {
  startDragging: () => Promise<void>
  toggleMaximize: () => Promise<void>
}
const DRAG_REGION =
  '.titlebar,.titlebar-left,.titlebar-drag-strip,.right-sidebar-header-drag,[data-terminal-focus-release-surface="true"]'
const INTERACTIVE =
  'button,a,input,textarea,select,[role="button"],[role="tab"],[data-testid="sortable-tab"],[contenteditable="true"],[data-radix-popper-content-wrapper],[data-slot$="-overlay"],[data-slot$="-content"],.right-sidebar-header-no-drag'

export function installTitlebarDrag(
  window: NativeWindowDrag,
  target: Document = document
): () => void {
  const onMouseDown = (event: MouseEvent): void => {
    if (
      event.button !== 0 ||
      event.defaultPrevented ||
      target.documentElement.hasAttribute('data-regular-terminal-input-focused')
    ) {
      return
    }
    const path = event
      .composedPath()
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
    let draggable = false
    for (const element of path) {
      const inline = element.style as CSSStyleDeclaration & { WebkitAppRegion?: string }
      const region =
        inline.getPropertyValue('-webkit-app-region') ||
        inline.WebkitAppRegion ||
        target.defaultView
          ?.getComputedStyle(element)
          .getPropertyValue('--orcaw-window-region')
          .trim()
      if (element.matches(INTERACTIVE) || region === 'no-drag') {
        return
      }
      if (region === 'drag' || element.matches(DRAG_REGION)) {
        draggable = true
      }
    }
    if (draggable) {
      event.preventDefault()
      void (event.detail === 2 ? window.toggleMaximize() : window.startDragging()).catch(
        console.error
      )
    }
  }
  target.addEventListener('mousedown', onMouseDown)
  return () => target.removeEventListener('mousedown', onMouseDown)
}
