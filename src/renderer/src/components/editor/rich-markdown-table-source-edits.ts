type TableLine = { prefix: string; cells: string[]; suffix: string }
type SourceTable = { start: number; rows: TableLine[] }

function parseTableLine(line: string): TableLine | null {
  if (!/^[ \t]*\|/.test(line) || !/\|[ \t]*$/.test(line)) {
    return null
  }
  const pipes: number[] = []
  let backslashes = 0
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '|' && backslashes % 2 === 0) {
      pipes.push(index)
    }
    backslashes = line[index] === '\\' ? backslashes + 1 : 0
  }
  if (pipes.length < 2) {
    return null
  }
  return {
    prefix: line.slice(0, pipes[0] + 1),
    cells: pipes.slice(1).map((pipe, index) => line.slice(pipes[index] + 1, pipe)),
    suffix: line.slice(pipes.at(-1))
  }
}

function collectTables(lines: string[]): SourceTable[] {
  const tables: SourceTable[] = []
  let fence: { marker: string; length: number } | null = null
  for (let index = 0; index < lines.length - 1; index += 1) {
    const match = lines[index].match(/^[ \t]*(`{3,}|~{3,})(.*)$/)
    if (match) {
      if (!fence) {
        fence = { marker: match[1][0], length: match[1].length }
      } else if (
        match[1][0] === fence.marker &&
        match[1].length >= fence.length &&
        !match[2].trim()
      ) {
        fence = null
      }
      continue
    }
    if (fence) {
      continue
    }
    const header = parseTableLine(lines[index])
    const separator = parseTableLine(lines[index + 1])
    if (
      !header ||
      !separator ||
      separator.cells.length !== header.cells.length ||
      !separator.cells.every((cell) => /^:?-+:?$/.test(cell.trim()))
    ) {
      continue
    }
    const rows = [header, separator]
    for (let next = index + 2; next < lines.length; next += 1) {
      const row = parseTableLine(lines[next])
      if (!row || row.cells.length !== header.cells.length) {
        break
      }
      rows.push(row)
    }
    tables.push({ start: index, rows })
    index += rows.length - 1
  }
  return tables
}

export function preserveMarkdownTableSourcePadding(base: string, edited: string): string {
  const baseTables = collectTables(base.split('\n'))
  const editedLines = edited.split('\n')
  const editedTables = collectTables(editedLines)
  if (baseTables.length !== editedTables.length) {
    return edited
  }
  editedTables.forEach((table, index) => {
    const previous = baseTables[index]
    if (
      previous.rows.length !== table.rows.length ||
      previous.rows[0].cells.length !== table.rows[0].cells.length
    ) {
      return
    }
    table.rows.forEach((row, rowIndex) => {
      const cells = row.cells.map((cell, column) => {
        const old = previous.rows[rowIndex].cells[column]
        const value = cell.trim()
        const unchanged =
          rowIndex === 1
            ? old.trim().replace(/-/g, '') === value.replace(/-/g, '')
            : old.trim() === value
        if (unchanged) {
          return old
        }
        return `${old.match(/^[ \t]*/)![0]}${value}${old.match(/[ \t]*$/)![0]}`
      })
      editedLines[table.start + rowIndex] = row.prefix + cells.join('|') + row.suffix
    })
  })
  return editedLines.join('\n')
}

export function applyMarkdownTableCellEdits(
  source: string,
  base: string,
  edited: string
): {
  source: string
  base: string
} {
  const sourceLines = source.split('\n')
  const baseLines = base.split('\n')
  const sourceTables = collectTables(sourceLines)
  const baseTables = collectTables(baseLines)
  const editedTables = collectTables(edited.split('\n'))
  if (sourceTables.length !== baseTables.length || baseTables.length !== editedTables.length) {
    return { source, base }
  }
  baseTables.forEach((table, index) => {
    const original = sourceTables[index]
    const updated = editedTables[index]
    if (
      original.rows.length !== table.rows.length ||
      updated.rows.length !== table.rows.length ||
      original.rows[0].cells.length !== table.rows[0].cells.length ||
      updated.rows[0].cells.length !== table.rows[0].cells.length
    ) {
      return
    }
    table.rows.forEach((row, rowIndex) => {
      if (rowIndex === 1) {
        return
      }
      const sourceRow = original.rows[rowIndex]
      row.cells.forEach((cell, column) => {
        const value = updated.rows[rowIndex].cells[column].trim()
        const sourceCell = sourceRow.cells[column]
        if (cell.trim() === value || cell.trim() !== sourceCell.trim()) {
          return
        }
        sourceRow.cells[column] = replaceCellValue(sourceCell, value)
        row.cells[column] = replaceCellValue(cell, value)
      })
      sourceLines[original.start + rowIndex] =
        sourceRow.prefix + sourceRow.cells.join('|') + sourceRow.suffix
      baseLines[table.start + rowIndex] = row.prefix + row.cells.join('|') + row.suffix
    })
  })
  return { source: sourceLines.join('\n'), base: baseLines.join('\n') }
}

function replaceCellValue(cell: string, value: string): string {
  return `${cell.match(/^[ \t]*/)![0]}${value}${cell.match(/[ \t]*$/)![0]}`
}
