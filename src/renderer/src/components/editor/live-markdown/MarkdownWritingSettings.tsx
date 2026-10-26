import { useState, useId } from 'react'
import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  setMarkdownWritingPreferences,
  validMarkdownImageFolder,
  type MarkdownWritingPreferences
} from './markdown-writing-preferences'

export function MarkdownWritingSettings({
  preferences
}: {
  preferences: MarkdownWritingPreferences
}) {
  const id = useId()
  const [folder, setFolder] = useState(preferences.imageFolder)
  const valid = validMarkdownImageFolder(folder)
  return (
    <Popover
      onOpenChange={(open) => {
        if (open) {
          setFolder(preferences.imageFolder)
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" aria-label="写作设置">
          <Settings2 className="size-3.5" />
          写作设置
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4 p-4">
        <p className="text-sm font-medium">写作设置</p>
        {(
          [
            ['focus', '专注模式'],
            ['typewriter', '打字机模式'],
            ['spellcheck', '拼写检查']
          ] as const
        ).map(([key, label]) => (
          <div className="flex items-center justify-between gap-3" key={key}>
            <Label htmlFor={`${id}-${key}`} className="text-xs">
              {label}
            </Label>
            <Checkbox
              id={`${id}-${key}`}
              checked={preferences[key]}
              onCheckedChange={(value) => setMarkdownWritingPreferences({ [key]: value === true })}
            />
          </div>
        ))}
        <div className="space-y-2">
          <Label htmlFor={`${id}-width`} className="text-xs">
            正文宽度
          </Label>
          <Select
            value={preferences.width}
            onValueChange={(width: 'full' | 'reading') => setMarkdownWritingPreferences({ width })}
          >
            <SelectTrigger id={`${id}-width`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full">填满编辑区域</SelectItem>
              <SelectItem value="reading">适合阅读的宽度</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (valid) {
              setMarkdownWritingPreferences({ imageFolder: folder.trim() })
            }
          }}
        >
          <Label htmlFor={`${id}-folder`} className="text-xs">
            图片资源目录
          </Label>
          <Input
            id={`${id}-folder`}
            value={folder}
            placeholder="留空：与文档同目录"
            aria-invalid={!valid}
            onChange={(event) => setFolder(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            相对于文档，例如 assets 或 {'{filename}.assets'}。应用于之后导入、粘贴和拖入的图片。
          </p>
          {!valid && (
            <p className="text-xs text-destructive" role="alert">
              请输入文档内的相对目录，不可包含 ..
            </p>
          )}
          <Button
            type="submit"
            variant="secondary"
            size="xs"
            disabled={!valid || folder.trim() === preferences.imageFolder}
          >
            保存资源目录
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
