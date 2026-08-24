"use client"

import { useEffect, useMemo, useState } from "react"
import { FileText, Loader2 } from "lucide-react"
import { InstallationPublicPhoto } from "@/components/installation-public-photo"
import { cn } from "@/lib/utils"
import { resolvePublicOpenMediaUrl } from "@/lib/resolve-public-media-url"

function isPdfLike(urlOrName: string): boolean {
  const s = urlOrName.toLowerCase()
  return s.includes(".pdf") || s.endsWith("/pdf")
}

type Props = {
  rawUrl?: string | null
  localFile?: File | null
  quotationId?: string
  fileName?: string
  className?: string
}

/** Preview + public Open link for saved S3/API media or a newly chosen file. */
export function StoredMediaPreview({ rawUrl, localFile, quotationId, fileName, className }: Props) {
  const localObjectUrl = useMemo(() => (localFile ? URL.createObjectURL(localFile) : null), [localFile])

  useEffect(() => {
    return () => {
      if (localObjectUrl) URL.revokeObjectURL(localObjectUrl)
    }
  }, [localObjectUrl])

  if (localFile && localObjectUrl) {
    const name = fileName || localFile.name
    const pdf = localFile.type === "application/pdf" || isPdfLike(name)
    if (pdf) {
      return (
        <div className={cn("rounded-md border border-border/60 bg-muted/30 p-3 space-y-2", className)}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate">{name}</span>
          </div>
          <a
            href={localObjectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-medium text-primary underline"
          >
            Open uploaded file
          </a>
        </div>
      )
    }
    return (
      <div className={className}>
        <InstallationPublicPhoto rawUrl={localObjectUrl} quotationId={quotationId} />
        <p className="mt-1 text-[10px] text-muted-foreground truncate">{name}</p>
      </div>
    )
  }

  const url = rawUrl?.trim()
  if (!url) return null

  const displayName = fileName || url.split("/").pop()?.split("?")[0] || "Document"
  if (isPdfLike(url) || isPdfLike(displayName)) {
    return <PdfPublicLink rawUrl={url} quotationId={quotationId} fileName={displayName} className={className} />
  }

  return (
    <div className={className}>
      <InstallationPublicPhoto rawUrl={url} quotationId={quotationId} />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-block text-[11px] font-medium text-primary underline break-all"
      >
        Open public link
      </a>
      {displayName ? <p className="mt-1 text-[10px] text-muted-foreground truncate">{displayName}</p> : null}
    </div>
  )
}

function PdfPublicLink({
  rawUrl,
  quotationId,
  fileName,
  className,
}: {
  rawUrl: string
  quotationId?: string
  fileName: string
  className?: string
}) {
  const [href, setHref] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void resolvePublicOpenMediaUrl(rawUrl, quotationId).then((resolved) => {
      if (!cancelled) {
        setHref(resolved || rawUrl)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [rawUrl, quotationId])

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading document…
      </div>
    )
  }

  const openHref = href || rawUrl
  if (!openHref) return null

  return (
    <div className={cn("rounded-md border border-border/60 bg-muted/30 p-3 space-y-2", className)}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileText className="h-4 w-4 shrink-0" />
        <span className="truncate">{fileName}</span>
      </div>
      <a
        href={openHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] font-medium text-primary underline break-all"
        title={openHref}
      >
        Open public link
      </a>
    </div>
  )
}
