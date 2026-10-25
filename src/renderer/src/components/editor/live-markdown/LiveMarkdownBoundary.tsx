import React from 'react'
import { Button } from '@/components/ui/button'

export class LiveMarkdownBoundary extends React.Component<
  {
    children: React.ReactNode
    fallback: React.ReactNode
  },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  componentDidCatch(error: Error): void {
    console.error('[markdown-live-editor]', error)
  }
  render(): React.ReactNode {
    if (!this.state.failed) {
      return this.props.children
    }
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          <span>即时渲染遇到错误，已显示源码，当前修改仍保留。</span>
          <Button variant="ghost" size="xs" onClick={() => this.setState({ failed: false })}>
            重试
          </Button>
        </div>
        <div className="min-h-0 flex-1">{this.props.fallback}</div>
      </div>
    )
  }
}
