/** Shared helpers for Excel/CSV downloads with selectable columns. */

export type ExcelColumnOption = {
  /** Stable key used in checkbox state (usually same as label). */
  id: string
  label: string
}

export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const raw = String(value ?? "")
  if (raw.includes(",") || raw.includes('"') || raw.includes("\n") || raw.includes("\r")) {
    return `"${raw.replace(/"/g, '""')}"`
  }
  return raw
}

export function filterRowsByColumnIds(
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
  selectedIds: string[],
): { headers: string[]; rows: Array<Array<string | number | boolean | null | undefined>> } {
  const selected = new Set(selectedIds)
  const indices = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => selected.has(header))
  return {
    headers: indices.map((item) => item.header),
    rows: rows.map((row) => indices.map(({ index }) => row[index] ?? "")),
  }
}

export function downloadCsvFile(params: {
  filename: string
  headers: string[]
  rows: Array<Array<string | number | boolean | null | undefined>>
  /** UTF-8 BOM helps Excel open Hindi/rupee characters correctly. */
  withBom?: boolean
}): void {
  const { filename, headers, rows, withBom = true } = params
  if (!headers.length) return
  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
    .join("\n")
  const blob = new Blob([withBom ? `\uFEFF${csvContent}` : csvContent], {
    type: "text/csv;charset=utf-8;",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function columnOptionsFromHeaders(headers: string[]): ExcelColumnOption[] {
  return headers.map((label) => ({ id: label, label }))
}
