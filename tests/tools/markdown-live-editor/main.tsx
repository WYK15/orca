import { useState, type JSX } from 'react'
import type { EditorView } from '@codemirror/view'
import type { MarkdownEditorMode } from '../../../src/renderer/src/components/editor/live-markdown/editor-context'
import { createRoot } from 'react-dom/client'
import LiveMarkdownEditor from '../../../src/renderer/src/components/editor/live-markdown/LiveMarkdownEditor'
import { TooltipProvider } from '../../../src/renderer/src/components/ui/tooltip'
import { Button } from '../../../src/renderer/src/components/ui/button'
import './check.css'
const fixture = await fetch('/fixture').then((res) => res.json())
const harness = window as typeof window & {
  setDocument: (source: string) => void
  raw: string
  editor: EditorView | null
  lastLink: string
}
const tinyImage = `data:image/svg+xml;base64,${btoa(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="150"><rect width="400" height="150" fill="gray"/><text x="40" y="85" fill="white">Relative image</text></svg>'
)}`
function Check(): JSX.Element {
  const [source, setSource] = useState<string>(fixture.source)
  const [secondSource, setSecondSource] = useState('Other document')
  const [documentId, setDocumentId] = useState('fixture')
  const activeSource = documentId === 'fixture' ? source : secondSource
  const setActiveSource = documentId === 'fixture' ? setSource : setSecondSource
  const [mode, setMode] = useState<MarkdownEditorMode>('live')
  const [saved, setSaved] = useState('')
  const [mounted, setMounted] = useState(true)
  harness.setDocument = setActiveSource
  harness.raw = activeSource
  return (
    <TooltipProvider>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div className="flex gap-2 border-b border-border bg-background p-2 text-foreground">
          {(['live', 'source', 'preview'] as const).map((name) => (
            <Button key={name} variant="ghost" size="sm" onClick={() => setMode(name)}>
              {name}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => document.documentElement.classList.toggle('dark')}
          >
            主题
          </Button>
          <span data-saved>{saved}</span>
          <Button variant="ghost" size="sm" onClick={() => setMounted(!mounted)}>
            切换文档
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDocumentId(documentId === 'fixture' ? 'second' : 'fixture')}
          >
            另一份文档
          </Button>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {mounted && (
            <LiveMarkdownEditor
              fileId={documentId}
              content={activeSource}
              mode={mode}
              scrollCacheKey={documentId}
              onChange={setActiveSource}
              onSave={async (text) => {
                await fetch('/fixture', { method: 'POST', body: text })
                setSaved('已保存')
              }}
              onModeChange={setMode}
              onReady={(view) => (harness.editor = view)}
              context={{
                loadImage: async () => tinyImage,
                openLink: (href) => (harness.lastLink = href)
              }}
            />
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
document.documentElement.classList.add('dark')
createRoot(document.getElementById('root')!).render(<Check />)
