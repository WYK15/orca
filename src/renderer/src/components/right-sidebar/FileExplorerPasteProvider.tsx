import { createContext, useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { dirname } from '@/lib/path'
import { isEditableTarget } from '@/lib/editable-target'
import type { TreeNode, FileExplorerOperationOwner } from './file-explorer-types'
import { useFileExplorerPaste, type FileExplorerPasteOptions } from './useFileExplorerPaste'

export const FileExplorerPasteContext = createContext<{
  paste: (directory: string, owner?: FileExplorerOperationOwner) => Promise<void>
  busy: boolean
  available: boolean
} | null>(null)

type Props = FileExplorerPasteOptions & {
  containerRef: RefObject<HTMLDivElement | null>
  selectedNode: TreeNode | null
  children: ReactNode
}

export function FileExplorerPasteProvider(props: Props): React.JSX.Element {
  const state = useFileExplorerPaste(props)
  const current = useRef({ props, state })
  current.current = { props, state }
  useEffect(() => {
    const accepts = (target: EventTarget | null): boolean => {
      const { props, state } = current.current
      return (
        props.enabled &&
        state.available &&
        !!props.worktreePath &&
        target instanceof Node &&
        props.containerRef.current?.contains(target) === true &&
        !isEditableTarget(target) &&
        !(target instanceof Element && target.closest('[data-ignore-file-explorer-keys="true"]'))
      )
    }
    const paste = (): void => {
      const { props, state } = current.current
      const node = props.selectedNode
      const directory = node
        ? node.isDirectory
          ? node.path
          : dirname(node.path)
        : props.worktreePath
      if (directory) {
        void state.paste(directory, node?.operationOwner)
      }
    }
    const keydown = (event: KeyboardEvent): void => {
      const modifier = navigator.userAgent.includes('Mac') ? event.metaKey : event.ctrlKey
      if (
        modifier &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'v' &&
        accepts(event.target)
      ) {
        event.preventDefault()
        paste()
      }
    }
    const onPaste = (event: ClipboardEvent): void => {
      if (accepts(event.target)) {
        event.preventDefault()
        paste()
      }
    }
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('paste', onPaste, true)
    return () => {
      window.removeEventListener('keydown', keydown, true)
      window.removeEventListener('paste', onPaste, true)
    }
  }, [])
  return (
    <FileExplorerPasteContext.Provider value={state}>
      {props.children}
    </FileExplorerPasteContext.Provider>
  )
}
