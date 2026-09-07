"use client"

import { Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { InstallationPublicPhoto } from "@/components/installation-public-photo"

type InstallationPhotosViewerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  quotationId?: string
  photoUrls: string[]
  loading?: boolean
}

export function InstallationPhotosViewerDialog({
  open,
  onOpenChange,
  title,
  quotationId,
  photoUrls,
  loading = false,
}: InstallationPhotosViewerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Uploaded installation photos</DialogTitle>
          {title ? <DialogDescription>{title}</DialogDescription> : null}
        </DialogHeader>
        {loading && photoUrls.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading photos…
          </div>
        ) : photoUrls.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No photos on this quotation yet. Use Edit to add images.
          </p>
        ) : (
          <div className="flex max-h-[70vh] flex-wrap gap-3 overflow-y-auto">
            {photoUrls.map((url, idx) => (
              <InstallationPublicPhoto
                key={`${quotationId || "photo"}-${idx}`}
                rawUrl={url}
                quotationId={quotationId}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
