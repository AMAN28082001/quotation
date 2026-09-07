"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ExcelColumnOption } from "@/lib/excel-column-export"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  columns: ExcelColumnOption[]
  /** When provided, restores previously chosen ids (intersected with current columns). */
  initialSelectedIds?: string[] | null
  confirmLabel?: string
  rowCount?: number
  onConfirm: (selectedIds: string[]) => void
}

export function ExcelColumnPickerDialog({
  open,
  onOpenChange,
  title = "Select Excel columns",
  description = "Check only the fields you want to download. Then click Download.",
  columns,
  initialSelectedIds = null,
  confirmLabel = "Download",
  rowCount,
  onConfirm,
}: Props) {
  const allIds = useMemo(() => columns.map((c) => c.id), [columns])
  const initialKey = useMemo(
    () => (initialSelectedIds && initialSelectedIds.length ? initialSelectedIds.join("\u0001") : ""),
    [initialSelectedIds],
  )
  const [selectedIds, setSelectedIds] = useState<string[]>(allIds)

  useEffect(() => {
    if (!open) return
    if (initialKey) {
      const allowed = new Set(allIds)
      const restored = initialKey.split("\u0001").filter((id) => allowed.has(id))
      setSelectedIds(restored.length > 0 ? restored : allIds)
      return
    }
    setSelectedIds(allIds)
  }, [open, allIds, initialKey])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const allSelected = columns.length > 0 && selectedIds.length === columns.length
  const noneSelected = selectedIds.length === 0

  const toggle = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id]
      return prev.filter((x) => x !== id)
    })
  }

  const selectAll = () => setSelectedIds(allIds)
  const clearAll = () => setSelectedIds([])

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal>
      <DialogContent
        className="z-[100] sm:max-w-lg max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0 text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description}
            {typeof rowCount === "number" ? (
              <span className="block mt-1">
                {rowCount} row{rowCount === 1 ? "" : "s"} will be exported with your selected columns.
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-2 flex flex-wrap items-center gap-2 shrink-0">
          <Button type="button" variant="outline" size="sm" onClick={selectAll} disabled={allSelected}>
            Select all
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={clearAll} disabled={noneSelected}>
            Clear all
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {selectedIds.length}/{columns.length} selected
          </span>
        </div>

        <div className="px-6 pb-4 overflow-y-auto flex-1 min-h-0 max-h-[50vh]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {columns.map((col) => {
              const checked = selectedSet.has(col.id)
              const inputId = `excel-col-${col.id.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`
              return (
                <label
                  key={col.id}
                  htmlFor={inputId}
                  className="flex items-start gap-2 rounded-md border border-border/70 px-3 py-2 cursor-pointer hover:bg-muted/40"
                >
                  <Checkbox
                    id={inputId}
                    checked={checked}
                    onCheckedChange={(value) => toggle(col.id, value === true)}
                    className="mt-0.5"
                  />
                  <span className="text-sm leading-snug">{col.label}</span>
                </label>
              )
            })}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={noneSelected}
            onClick={() => {
              const ordered = allIds.filter((id) => selectedSet.has(id))
              onConfirm(ordered)
              onOpenChange(false)
            }}
          >
            {confirmLabel}
            {selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Optional localStorage remember last column picks per export key. */
export function readRememberedExcelColumns(storageKey: string): string[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed.map((v) => String(v)).filter(Boolean)
  } catch {
    return null
  }
}

export function rememberExcelColumns(storageKey: string, selectedIds: string[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(selectedIds))
  } catch {
    // ignore quota / private mode
  }
}
