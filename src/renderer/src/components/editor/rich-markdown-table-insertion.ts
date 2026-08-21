import type { Editor } from '@tiptap/react'

export type RichMarkdownTableDimensions = {
  bodyRows: number
  columns: number
}

export const RICH_MARKDOWN_TABLE_LIMITS = {
  bodyRows: { min: 1, quickMax: 10, max: 100 },
  columns: { min: 1, quickMax: 10, max: 50 }
} as const

export function validateRichMarkdownTableDimensions({
  bodyRows,
  columns
}: RichMarkdownTableDimensions): boolean {
  return (
    Number.isInteger(bodyRows) &&
    bodyRows >= RICH_MARKDOWN_TABLE_LIMITS.bodyRows.min &&
    bodyRows <= RICH_MARKDOWN_TABLE_LIMITS.bodyRows.max &&
    Number.isInteger(columns) &&
    columns >= RICH_MARKDOWN_TABLE_LIMITS.columns.min &&
    columns <= RICH_MARKDOWN_TABLE_LIMITS.columns.max
  )
}

export function insertRichMarkdownTable(
  editor: Editor,
  dimensions: RichMarkdownTableDimensions
): boolean {
  if (!validateRichMarkdownTableDimensions(dimensions)) {
    return false
  }

  return editor
    .chain()
    .focus()
    .insertTable({
      rows: dimensions.bodyRows + 1,
      cols: dimensions.columns,
      withHeaderRow: true
    })
    .run()
}
