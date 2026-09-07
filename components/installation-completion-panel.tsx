"use client"

import { useMemo, useState } from "react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Camera, Image as ImageIcon, MapPin, Plus, Trash2, Upload, X } from "lucide-react"
import { confirmSave } from "@/lib/confirm-save"
import { buildGpsMapCameraPhoto } from "@/lib/live-geotag-photo"

export type InstallationImageField = {
  readonly key: string
  readonly label: string
  readonly required?: boolean
  readonly multiple?: boolean
}

export type InstallationExpenseLine = {
  id: string
  description: string
  amount: string
}

export type InstallationInfoRow = {
  label: string
  value: ReactNode
}

export type InstallationInfoSection = {
  title: string
  rows: InstallationInfoRow[]
  emptyText?: string
}

export type InstallationUploadedFile = {
  name: string
  url: string
  /** Present when the file is still local and must be sent on final submit. */
  localFile?: File
}

type Props = {
  loadingText?: string
  imageFields: readonly InstallationImageField[]
  filesByField: Record<string, InstallationUploadedFile[] | undefined>
  onFilesChange: (fieldKey: string, files: File[]) => void | Promise<void>
  piFiles: InstallationUploadedFile[]
  onPiFilesChange: (files: File[]) => void | Promise<void>
  onRemovePiFile?: (index: number) => void
  uploadingKey?: string | null
  extraExpenses: InstallationExpenseLine[]
  onAddExpense: () => void
  onExpenseChange: (id: string, patch: Partial<InstallationExpenseLine>) => void
  onRemoveExpense: (id: string) => void
  dimensions: { length: string; width: string; height: string }
  onDimensionsChange: (next: { length?: string; width?: string; height?: string }) => void
  notes: string
  onNotesChange: (value: string) => void
  infoSections: InstallationInfoSection[]
  saveLabel: string
  saving: boolean
  onCancel: () => void
  onSave: () => void
  secondarySaveLabel?: string
  onSecondarySave?: () => void
  /** Hide Cancel / Save footer (parent modal supplies actions). */
  hideFooter?: boolean
  /** Only photo / PI upload slots — same UX as the installation upload part. */
  uploadsOnly?: boolean
  /** Denser cards (for WCC / nested modals). */
  compact?: boolean
  /** Hide PI upload slot (e.g. WCC review modal). */
  hidePi?: boolean
  /** Read-only: view installation fields without editing or saving. */
  readOnly?: boolean
}

export function InstallationCompletionPanel({
  loadingText,
  imageFields,
  filesByField,
  onFilesChange,
  piFiles,
  onPiFilesChange,
  onRemovePiFile,
  uploadingKey,
  extraExpenses,
  onAddExpense,
  onExpenseChange,
  onRemoveExpense,
  dimensions,
  onDimensionsChange,
  notes,
  onNotesChange,
  infoSections,
  saveLabel,
  saving,
  onCancel,
  onSave,
  secondarySaveLabel,
  onSecondarySave,
  hideFooter = false,
  uploadsOnly = false,
  compact = false,
  hidePi = false,
  readOnly = false,
}: Props) {
  const locked = readOnly
  const [previewLoadErrorByField, setPreviewLoadErrorByField] = useState<Record<string, boolean>>({})
  const [liveCapturingKey, setLiveCapturingKey] = useState<string | null>(null)
  const [liveCaptureHintByField, setLiveCaptureHintByField] = useState<Record<string, string>>({})
  const sampleBackgroundImageUrl =
    "https://img.freepik.com/premium-vector/house-front-view-home-facade-building-exterior_171867-73.jpg"
  const frontWithPersonBackgroundImageUrl =
    "https://img.freepik.com/free-photo/3d-render-man-leaning-traditional-timber-house_1048-5603.jpg?semt=ais_hybrid&w=740&q=80"
  const inverterWithCustomerBackgroundImageUrl =
    "/install-guides/inverter-with-customer.png"
  const plantWithCustomerBackgroundImageUrl = "/install-guides/plant-with-customer.png"
  const inverterWithSerialBackgroundImageUrl = "/install-guides/inverter-with-serial.png"
  const panelWithSerialBackgroundImageUrl = "/install-guides/panel-with-serial.png"
  const geotagWithPlantsBackgroundImageUrl = "/install-guides/geotag-with-plants.png"
  const piTemplateBackgroundImageUrl =
    "https://assets.refrens.com/442_Product_Quotation_Template_Word_2c06e58c5d.webp"

  const getImageGuide = (key: string) => {
    const k = String(key || "").toLowerCase()
    if (k.includes("homefront")) return "Capture full front elevation of the house."
    if (k.includes("homewithperson")) return "Capture front view with customer standing in frame."
    if (k.includes("inverterwithcustomer")) return "Capture inverter with customer clearly visible."
    if (k.includes("plantwithcustomer")) return "Capture installed plant/array with customer."
    if (k.includes("inverterserial")) return "Capture inverter serial sticker close-up, fully readable."
    if (k.includes("panelserial")) return "Capture panel serial labels clearly and in focus."
    if (k.includes("geotag")) return "Use Live photo or Upload — GPS map + address will be stamped on the image."
    if (k.includes("other")) return "Upload or Live photo; both stamp GPS Map Camera–style location."
    return "Upload (gallery) or Live photo (camera). Both add GPS map, address, lat/lng, and time."
  }

  const uploadedPreviewItems = useMemo(() => {
    const fileEntries = Object.entries(filesByField)
      .flatMap(([fieldKey, files]) => {
        if (!files || files.length === 0) return []
        const firstImage = files[0]
        return firstImage ? [{ fieldKey, file: firstImage }] : []
      })
      .slice(0, 3)

    return fileEntries.map((entry) => ({
      fieldKey: entry.fieldKey,
      fileName: entry.file.name,
      url: entry.file.url,
    }))
  }, [filesByField])

  const uploadedFieldPreviewMap = useMemo(() => {
    const entries = Object.entries(filesByField)
      .map(([fieldKey, files]) => {
        if (!files || files.length === 0) return null
        const firstImage = files[0]
        if (!firstImage) return null
        return [fieldKey, firstImage.url] as const
      })
      .filter(Boolean) as Array<readonly [string, string]>
    return Object.fromEntries(entries) as Record<string, string>
  }, [filesByField])

  const piPreviewUrl = useMemo(() => {
    const first = piFiles[0]
    if (!first) return ""
    if (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(first.url)) return first.url
    return ""
  }, [piFiles])

  const applyGpsMapCameraStamp = async (
    field: InstallationImageField,
    files: File[],
    source: "live" | "upload",
  ) => {
    if (!files.length) return
    setPreviewLoadErrorByField((prev) => ({ ...prev, [field.key]: false }))
    setLiveCapturingKey(field.key)
    try {
      const stampedFiles: File[] = []
      let lastCoords: { latitude: number; longitude: number } | null = null
      let lastPlace = ""
      let anyStamped = false
      for (const file of files) {
        const result = await buildGpsMapCameraPhoto(file, source)
        stampedFiles.push(result.file)
        if (result.coords) lastCoords = result.coords
        if (result.place?.title) lastPlace = result.place.title
        if (result.stamped) anyStamped = true
      }
      await onFilesChange(field.key, stampedFiles)
      const label = source === "live" ? "Live photo" : "Upload"
      setLiveCaptureHintByField((prev) => ({
        ...prev,
        [field.key]: lastCoords
          ? `${label} · GPS Map Camera · ${lastPlace || `${lastCoords.latitude.toFixed(5)}, ${lastCoords.longitude.toFixed(5)}`}`
          : anyStamped
            ? `${label} stamped — GPS unavailable (allow location and retry)`
            : `${label} saved`,
      }))
    } catch {
      setLiveCaptureHintByField((prev) => ({
        ...prev,
        [field.key]: "Could not stamp GPS. Allow camera/location and try again.",
      }))
    } finally {
      setLiveCapturingKey(null)
    }
  }

  const handleGalleryPick = (field: InstallationImageField, files: File[]) => {
    void applyGpsMapCameraStamp(field, files, "upload")
  }

  const handleLivePhotoPick = (field: InstallationImageField, files: File[]) => {
    void applyGpsMapCameraStamp(field, files, "live")
  }

  const renderImageFieldCard = (field: InstallationImageField) => {
    const galleryInputId = `install-image-${field.key}`
    const liveInputId = `install-image-live-${field.key}`
    const key = String(field.key).toLowerCase()
    const backgroundImageUrl = key.includes("homewithperson")
      ? frontWithPersonBackgroundImageUrl
      : key.includes("inverterwithcustomer")
        ? inverterWithCustomerBackgroundImageUrl
        : key.includes("plantwithcustomer")
          ? plantWithCustomerBackgroundImageUrl
          : key.includes("inverterserial")
            ? inverterWithSerialBackgroundImageUrl
            : key.includes("panelserial")
              ? panelWithSerialBackgroundImageUrl
              : key.includes("geotag")
                ? geotagWithPlantsBackgroundImageUrl
                : sampleBackgroundImageUrl
    const uploadedCardPreviewUrl = uploadedFieldPreviewMap[field.key]
    const hasUploadedPreview = Boolean(uploadedCardPreviewUrl) && !previewLoadErrorByField[field.key]
    const busy = Boolean(uploadingKey) || liveCapturingKey === field.key
    const btnClass = `inline-flex items-center gap-1 rounded-md border border-border bg-background/95 text-[11px] font-medium text-foreground hover:bg-background ${
      compact ? "h-7 px-2" : "h-8 px-2.5"
    } ${busy ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`

    return (
      <div key={field.key} className={compact ? "space-y-1" : "space-y-1.5"}>
        <p className={compact ? "text-[11px] text-muted-foreground leading-tight" : "text-xs text-muted-foreground"}>
          {field.label}
          {field.required !== false ? " *" : ""}
        </p>
        <div
          className={`relative overflow-hidden rounded-md border border-dashed border-border/70 ${compact ? "aspect-[4/3]" : "aspect-square"}`}
          style={{
            backgroundImage: hasUploadedPreview ? undefined : `url(${backgroundImageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          {hasUploadedPreview ? (
            <img
              src={uploadedCardPreviewUrl}
              alt={`${field.label} preview`}
              className="absolute inset-0 h-full w-full object-cover"
              onLoad={() =>
                setPreviewLoadErrorByField((prev) =>
                  prev[field.key] ? { ...prev, [field.key]: false } : prev,
                )
              }
              onError={() =>
                setPreviewLoadErrorByField((prev) => ({ ...prev, [field.key]: true }))
              }
            />
          ) : null}
          {((filesByField[field.key] || []).length > 0 || hasUploadedPreview) ? (
            <button
              type="button"
              aria-label={`Remove ${field.label} image`}
              className="absolute right-1.5 top-1.5 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm hover:bg-background"
              onClick={() => {
                setPreviewLoadErrorByField((prev) => ({ ...prev, [field.key]: false }))
                setLiveCaptureHintByField((prev) => {
                  const next = { ...prev }
                  delete next[field.key]
                  return next
                })
                onFilesChange(field.key, [])
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <div className={`absolute inset-0 ${hasUploadedPreview ? "bg-background/20" : "bg-background/65"}`} />
          {!compact ? (
            <div className="absolute top-2 left-2 right-2 flex items-start gap-2">
              <div className="mt-0.5 rounded bg-background/80 p-1">
                <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <p className={`text-[11px] leading-snug line-clamp-3 ${hasUploadedPreview ? "text-foreground" : "text-muted-foreground"}`}>
                {getImageGuide(field.key)}
              </p>
            </div>
          ) : null}
          <div
            className={`absolute inset-x-0 z-10 flex flex-wrap items-center justify-center gap-1.5 px-2 ${
              compact ? "bottom-1.5" : "bottom-2"
            }`}
          >
            <Label htmlFor={galleryInputId} className={btnClass} title="Choose from gallery / files">
              <Upload className="w-3.5 h-3.5 shrink-0" />
              {uploadingKey === field.key || liveCapturingKey === field.key
                ? "Stamping…"
                : "Upload"}
            </Label>
            <Label
              htmlFor={liveInputId}
              className={btnClass}
              title="Open camera and stamp GPS Map Camera location"
            >
              <Camera className="w-3.5 h-3.5 shrink-0" />
              {liveCapturingKey === field.key ? "Stamping…" : "Live photo"}
            </Label>
          </div>
        </div>
        <Input
          id={galleryInputId}
          type="file"
          accept="image/*,.heic,.heif"
          multiple={field.multiple === true}
          className="hidden"
          disabled={locked || busy}
          onChange={(e) => {
            handleGalleryPick(field, Array.from(e.target.files || []))
            e.currentTarget.value = ""
          }}
        />
        <Input
          id={liveInputId}
          type="file"
          accept="image/*"
          capture="environment"
          multiple={field.multiple === true}
          className="hidden"
          disabled={locked || busy}
          onChange={(e) => {
            void handleLivePhotoPick(field, Array.from(e.target.files || []))
            e.currentTarget.value = ""
          }}
        />
        {!compact ? (
          <p className="text-[11px] text-muted-foreground truncate">
            {(filesByField[field.key] || []).length > 0
              ? `${(filesByField[field.key] || []).length} file(s) selected`
              : "No file selected"}
          </p>
        ) : null}
        {liveCaptureHintByField[field.key] ? (
          <p className="flex items-start gap-1 text-[11px] text-emerald-800 dark:text-emerald-200">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="min-w-0 break-words">{liveCaptureHintByField[field.key]}</span>
          </p>
        ) : null}
        {previewLoadErrorByField[field.key] ? (
          <p className="text-[11px] text-amber-700">
            Preview unavailable for this image format in browser. Upload is still selected.
          </p>
        ) : null}
      </div>
    )
  }

  const renderPiUploadCard = () => {
    return (
      <div key="pi-upload-card" className={compact ? "space-y-1" : "space-y-1.5"}>
        <p className={compact ? "text-[11px] text-muted-foreground leading-tight" : "text-xs text-muted-foreground"}>
          PI Upload (multiple)
        </p>
        <div
          className={`relative overflow-hidden rounded-md border border-dashed border-border/70 ${compact ? "aspect-[4/3]" : "aspect-square"}`}
          style={{
            backgroundImage: `url(${piPreviewUrl || piTemplateBackgroundImageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className={`absolute inset-0 ${piPreviewUrl ? "bg-background/25" : "bg-background/55"}`} />
          {piFiles.length > 0 && onRemovePiFile ? (
            <button
              type="button"
              aria-label="Remove all PI files"
              className="absolute right-1.5 top-1.5 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm hover:bg-background"
              onClick={() => {
                for (let i = piFiles.length - 1; i >= 0; i -= 1) onRemovePiFile(i)
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {!compact ? (
            <div className="absolute top-2 left-2 right-2 flex items-start gap-2">
              <div className="mt-0.5 rounded bg-background/80 p-1">
                <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground line-clamp-3">
                Upload one or more PI documents or images. Template shown as guide background.
              </p>
            </div>
          ) : null}
          <div className={`absolute inset-x-0 flex justify-center px-2 ${compact ? "bottom-1.5" : "bottom-2"}`}>
            <Label
              htmlFor="install-pi-upload"
              className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-background/90 text-xs font-medium text-foreground hover:bg-background ${
                compact ? "h-7 px-2.5" : "h-8 px-3"
              } ${uploadingKey ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
            >
              <Upload className="w-3.5 h-3.5" />
              {uploadingKey === "piUpload" ? "Uploading..." : "Upload PI"}
            </Label>
          </div>
        </div>
        <Input
          id="install-pi-upload"
          type="file"
          accept="application/pdf,image/*"
          multiple
          className="hidden"
          disabled={locked || Boolean(uploadingKey)}
          onChange={(e) => {
            void onPiFilesChange(Array.from(e.target.files || []))
            e.currentTarget.value = ""
          }}
        />
        {compact ? (
          piFiles.length > 0 ? (
            <p className="text-[10px] text-muted-foreground truncate">{piFiles.length} file(s)</p>
          ) : null
        ) : piFiles.length === 0 ? (
          <p className="text-[11px] text-muted-foreground truncate">No file selected</p>
        ) : (
          <ul className="space-y-1">
            {piFiles.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
              >
                <span className="min-w-0 flex-1 truncate" title={file.name}>
                  {file.name}
                </span>
                {onRemovePiFile ? (
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => onRemovePiFile(index)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  const cols = compact ? 4 : 3
  const slotCount = imageFields.length + (hidePi ? 0 : 1)
  const piSpacerCount = (cols - (slotCount % cols)) % cols
  const anyImageFieldRequired = imageFields.some((f) => f.required !== false)

  return (
    <div className={`rounded-md border border-border/70 space-y-3 ${compact ? "p-2.5" : "p-3"}`}>
      {loadingText ? <p className="text-xs text-muted-foreground">{loadingText}</p> : null}
      <div className={uploadsOnly ? "space-y-3" : "grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4"}>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium">
              {anyImageFieldRequired
                ? "Installation Completion Images (required as marked *)"
                : "Installation Completion Images"}
            </p>
            <div
              className={
                compact
                  ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2"
                  : "grid grid-cols-1 md:grid-cols-3 gap-3"
              }
            >
              {imageFields.map((field) => renderImageFieldCard(field))}
              {Array.from({ length: piSpacerCount }).map((_, idx) => (
                <div
                  key={`pi-spacer-${idx}`}
                  className={compact ? "hidden lg:block" : "hidden md:block"}
                  aria-hidden="true"
                />
              ))}
              {!hidePi ? renderPiUploadCard() : null}
            </div>
          </div>

          {!uploadsOnly ? (
          <>
          <div className="space-y-2 rounded-md border border-border/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs font-medium">Extra expenses (optional)</Label>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={onAddExpense}>
                <Plus className="w-3.5 h-3.5" />
                Add expense
              </Button>
            </div>
            {extraExpenses.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No extra expenses added.</p>
            ) : (
              <div className="space-y-2">
                {extraExpenses.map((line) => (
                  <div key={line.id} className="grid grid-cols-1 sm:grid-cols-[1fr_120px_auto] gap-2 items-end">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Description</Label>
                      <Input
                        className="h-9 text-sm"
                        placeholder="e.g. Transport, extra cable"
                        value={line.description}
                        onChange={(e) => onExpenseChange(line.id, { description: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Amount (₹)</Label>
                      <Input
                        className="h-9 text-sm"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0"
                        value={line.amount}
                        onChange={(e) => onExpenseChange(line.id, { amount: e.target.value })}
                      />
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground" onClick={() => onRemoveExpense(line.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium">Site legs (feet) (optional)</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Back leg</Label>
                <Input type="number" min="0" step="0.01" value={dimensions.length} readOnly={locked} onChange={(e) => onDimensionsChange({ length: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Mid leg (optional)</Label>
                <Input type="number" min="0" step="0.01" value={dimensions.width} readOnly={locked} onChange={(e) => onDimensionsChange({ width: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Front leg</Label>
                <Input type="number" min="0" step="0.01" value={dimensions.height} readOnly={locked} onChange={(e) => onDimensionsChange({ height: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium">Notes (optional)</p>
            <Textarea rows={2} placeholder="Installation notes, material used, issues, etc." value={notes} readOnly={locked} onChange={(e) => onNotesChange(e.target.value)} />
          </div>
          </>
          ) : null}
        </div>

        {!uploadsOnly ? (
        <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3">
          {infoSections.map((section, idx) => (
            <div key={section.title} className={idx === 0 ? "space-y-2" : "space-y-2 border-t border-border/60 pt-2"}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</p>
              {section.rows.length > 0 ? (
                <div className="space-y-1.5">
                  {section.rows.map((row) => (
                    <div key={row.label} className="text-xs flex items-start justify-between gap-2">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="font-medium text-right">{row.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{section.emptyText || "No details available."}</p>
              )}
            </div>
          ))}
          <div className="space-y-2 border-t border-border/60 pt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Uploaded image preview</p>
            {uploadedPreviewItems.length === 0 ? (
              <p className="text-xs text-muted-foreground">Upload images to see preview here.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {uploadedPreviewItems.map((item) => (
                  <div key={`${item.fieldKey}-${item.fileName}`} className="space-y-1">
                    <div
                      className="aspect-square rounded-md border border-border/60 bg-center bg-cover bg-no-repeat"
                      style={{ backgroundImage: `url(${item.url})` }}
                    />
                    <p className="text-[10px] text-muted-foreground truncate">{item.fileName}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        ) : null}
      </div>

      {!hideFooter ? (
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={locked || saving || Boolean(uploadingKey)}>
          Cancel
        </Button>
        {secondarySaveLabel && onSecondarySave ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (!confirmSave(`Save as "${secondarySaveLabel}"?`)) return
              onSecondarySave()
            }}
            disabled={locked || saving || Boolean(uploadingKey)}
          >
            {saving ? "Saving..." : uploadingKey ? "Uploading..." : secondarySaveLabel}
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={() => {
            if (!confirmSave(`Save as "${saveLabel}"?`)) return
            onSave()
          }}
          disabled={locked || saving || Boolean(uploadingKey)}
        >
          {saving ? "Saving..." : uploadingKey ? "Uploading..." : saveLabel}
        </Button>
      </div>
      ) : null}
    </div>
  )
}
