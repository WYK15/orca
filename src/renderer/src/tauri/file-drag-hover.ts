/** Bridge AppKit's intercepted hover events to the explorer's existing targets. */
export function createNativeFileDragHover(target: Document = document) {
  let previous: Element | null = null
  function send(element: Element, type: string, x = 0, y = 0): void {
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(new File([], 'native-file-drag'))
    element.dispatchEvent(
      new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, clientX: x, clientY: y })
    )
  }
  const clear = (): void => {
    if (previous) {
      send(previous, 'dragleave')
      previous = null
    }
  }
  return {
    clear,
    update(value: unknown): void {
      const point = value as { x?: unknown; y?: unknown } | null
      if (
        !point ||
        typeof point.x !== 'number' ||
        typeof point.y !== 'number' ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y)
      ) {
        clear()
        target.dispatchEvent(new Event('dragend', { bubbles: true }))
        return
      }
      const element = target.elementFromPoint(point.x, point.y)
      if (element !== previous) {
        if (previous) {
          send(previous, 'dragleave', point.x, point.y)
        }
        previous = element
        if (element) {
          send(element, 'dragenter', point.x, point.y)
        }
      }
      if (element) {
        send(element, 'dragover', point.x, point.y)
      }
    }
  }
}
