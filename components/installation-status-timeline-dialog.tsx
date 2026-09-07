"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { StatusHistoryEntry } from "@/lib/quotation-context"

type InstallationStatusTimelineDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  quotationId?: string
  createdAt?: string
  fileLoginAt?: string
  statusApprovedAt?: string
  status?: string
  statusHistory?: StatusHistoryEntry[]
}

export function InstallationStatusTimelineDialog({
  open,
  onOpenChange,
  quotationId,
  createdAt,
  fileLoginAt,
  statusApprovedAt,
  status,
  statusHistory,
}: InstallationStatusTimelineDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Status timeline</DialogTitle>
          <DialogDescription>
            {quotationId ? (
              <>
                Quotation <span className="font-mono">{quotationId}</span> — each status change with date and time.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border/70 bg-muted/20 p-3 space-y-1 text-xs">
            <p>
              <span className="font-medium text-foreground">Created: </span>
              {createdAt ? new Date(createdAt).toLocaleString() : "—"}
            </p>
            {fileLoginAt ? (
              <p>
                <span className="font-medium text-foreground">File login: </span>
                {new Date(fileLoginAt).toLocaleString()}
              </p>
            ) : null}
            {statusApprovedAt ? (
              <p>
                <span className="font-medium text-foreground">Last approved: </span>
                {new Date(statusApprovedAt).toLocaleString()}
              </p>
            ) : null}
          </div>
          {statusHistory && statusHistory.length > 0 ? (
            <ul className="space-y-2">
              {statusHistory.map((entry, idx) => (
                <li
                  key={`${entry.at}-${entry.status}-${idx}`}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 rounded-md border border-border/60 px-3 py-2"
                >
                  <Badge variant="outline" className="w-fit capitalize">{entry.status}</Badge>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {entry.at ? new Date(entry.at).toLocaleString() : "—"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              No status history from the server yet. Current status:{" "}
              <span className="font-medium capitalize">{status || "pending"}</span>.
            </p>
          )}
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
