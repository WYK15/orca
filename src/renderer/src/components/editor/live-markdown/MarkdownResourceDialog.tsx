import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { MarkdownResource, MarkdownResourceDraft } from './markdown-resource-source'

export function MarkdownResourceDialog({
  resource,
  onClose,
  onApply
}: {
  resource: MarkdownResource
  onClose: () => void
  onApply: (draft: MarkdownResourceDraft | null) => boolean
}) {
  const [draft, setDraft] = useState<MarkdownResourceDraft>(resource)
  const [error, setError] = useState('')
  const image = resource.kind === 'image'
  const invalidSize = [draft.width, draft.height].some(
    (value) => value !== '' && !/^[1-9]\d{0,4}$/.test(value)
  )
  const change = (key: keyof MarkdownResourceDraft, value: string): void => {
    setDraft((current) => ({ ...current, [key]: value }))
    setError('')
  }
  const apply = (value: MarkdownResourceDraft | null): void => {
    if (onApply(value)) {
      onClose()
    } else {
      setError('文档已改变，请关闭后重新编辑')
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={(event) => event.preventDefault()}>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!invalidSize && draft.href.trim()) {
              apply(draft)
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {image ? '编辑图片' : resource.syntax === 'new' ? '插入链接' : '编辑链接'}
            </DialogTitle>
            <DialogDescription>
              {image
                ? '修改路径、说明或尺寸。尺寸留空时使用图片原始大小。'
                : '支持网址、文档相对路径和 #标题锚点。'}
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-1.5 text-xs">
            {image ? '图片路径' : '链接地址'}
            <Input
              autoFocus
              value={draft.href}
              onChange={(event) => change('href', event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-xs">
            {image ? '图片说明' : '显示文字'}
            <Input value={draft.label} onChange={(event) => change('label', event.target.value)} />
          </label>
          <label className="grid gap-1.5 text-xs">
            提示文字
            <Input value={draft.title} onChange={(event) => change('title', event.target.value)} />
          </label>
          {image && (
            <div className="grid grid-cols-2 gap-3">
              {(['width', 'height'] as const).map((dimension) => (
                <label className="grid gap-1.5 text-xs" key={dimension}>
                  {dimension === 'width' ? '宽度（px）' : '高度（px）'}
                  <Input
                    type="number"
                    min={1}
                    max={99999}
                    value={draft[dimension]}
                    placeholder="自动"
                    aria-invalid={invalidSize}
                    onChange={(event) => change(dimension, event.target.value)}
                  />
                </label>
              ))}
            </div>
          )}
          {invalidSize && (
            <p className="text-xs text-destructive" role="alert">
              尺寸应为 1–99999 的整数，或留空
            </p>
          )}
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            {resource.syntax !== 'new' && (
              <Button type="button" variant="ghost" onClick={() => apply(null)}>
                {image ? '移除图片' : '移除链接'}
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={invalidSize || !draft.href.trim()}>
              应用
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
