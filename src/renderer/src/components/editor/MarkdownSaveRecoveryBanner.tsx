import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { resolveMarkdownSaveRecovery } from './markdown-save-recovery'

export function MarkdownSaveRecoveryBanner({ fileId }: { fileId: string }): React.JSX.Element {
  const resolve = (choice: 'accept' | 'restore'): void => {
    useAppStore.setState((state) => resolveMarkdownSaveRecovery(state, fileId, choice))
  }
  return (
    <div role="alert" className="border-b border-border bg-muted px-3 py-2 text-xs text-foreground">
      <p>
        {translate(
          'editor.markdownRecovery.description',
          'Saving is paused because the original formatting could not be preserved. Your edits are kept in this source draft, which may include formatting changes elsewhere in the file.'
        )}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => resolve('accept')}>
          {translate('editor.markdownRecovery.accept', 'Accept formatting changes')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => resolve('restore')}>
          {translate('editor.markdownRecovery.restore', 'Restore previous source')}
        </Button>
      </div>
    </div>
  )
}
