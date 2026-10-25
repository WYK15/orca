import type { EditorView } from '@codemirror/view'
import { undo, redo } from '@codemirror/commands'
import { openSearchPanel } from '@codemirror/search'
import {
  Bold,
  Italic,
  Code,
  CodeXml,
  Table2,
  ImagePlus,
  Search,
  Undo2,
  Redo2,
  List,
  Quote,
  Heading
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from '@/components/ui/dropdown-menu'
import { insertMarkdownBlock, wrapMarkdownSelection } from './editor-commands'

export function LiveMarkdownToolbar({
  view,
  pickImage
}: {
  view: EditorView | null
  pickImage?: () => void
}) {
  const run = (command: (view: EditorView) => boolean): void => {
    if (view) {
      view.focus()
      command(view)
    }
  }
  const tools = [
    { name: '撤销', Icon: Undo2, run: () => run(undo) },
    { name: '重做', Icon: Redo2, run: () => run(redo) },
    { name: '加粗', Icon: Bold, run: () => run(wrapMarkdownSelection('**')) },
    { name: '斜体', Icon: Italic, run: () => run(wrapMarkdownSelection('*')) },
    { name: '行内代码', Icon: Code, run: () => run(wrapMarkdownSelection('`')) },
    { name: '无序列表', Icon: List, run: () => run(insertMarkdownBlock('- ')) },
    { name: '引用', Icon: Quote, run: () => run(insertMarkdownBlock('> ')) },
    { name: '代码块', Icon: CodeXml, run: () => run(insertMarkdownBlock('```\n\n```', 4)) },
    {
      name: '表格',
      Icon: Table2,
      run: () => run(insertMarkdownBlock('| 列 1 | 列 2 |\n| --- | --- |\n|  |  |'))
    },
    { name: '插入图片', Icon: ImagePlus, run: () => pickImage?.() },
    { name: '查找和替换', Icon: Search, run: () => run(openSearchPanel) }
  ]
  return (
    <div className="live-md-toolbar" role="toolbar" aria-label="Markdown 格式">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="标题级别">
            <Heading className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {[1, 2, 3, 4, 5, 6].map((level) => (
            <DropdownMenuItem
              key={level}
              onSelect={() => run(insertMarkdownBlock(`${'#'.repeat(level)} `))}
            >
              标题 {level}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {tools.map(({ name, Icon, run: action }) => (
        <Tooltip key={name}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={name}
              disabled={!view || (name === '插入图片' && !pickImage)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={action}
            >
              <Icon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{name}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}
