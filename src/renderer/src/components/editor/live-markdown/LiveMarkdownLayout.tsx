import { useLayoutEffect, useRef, type ComponentPropsWithoutRef, type JSX } from 'react'

export function LiveMarkdownLayout(
  props: Omit<ComponentPropsWithoutRef<'div'>, 'className'>
): JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = container.current
    if (!element) {
      return
    }
    const update = (width: number): void => {
      const narrow = String(width <= 560)
      if (element.dataset.narrow !== narrow) {
        element.dataset.narrow = narrow
      }
    }
    update(element.clientWidth)
    const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return (
    <div {...props} ref={container} className="rich-markdown-editor-layout live-markdown-layout" />
  )
}
