import { pickMediaUrlFromValue, toPublicOpenHref } from "@/lib/media-url"
import {
  isInstallationApprovedForAdminTab,
  type OperationalQuotationRecord,
} from "@/lib/operational-install-queue"

export const OPERATIONAL_INSTALLATION_IMAGE_FIELD_KEYS = [
  "homeFrontPhoto",
  "homeWithPersonPhoto",
  "inverterWithCustomerPhoto",
  "plantWithCustomerPhoto",
  "inverterSerialNumberPhoto",
  "panelSerialNumberPhoto",
  "geoTagPlantPhoto",
  "otherImages",
] as const

function pickNonEmptyString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim()
  return undefined
}

function addUrlFromUnknown(urls: string[], value: unknown) {
  if (value == null) return
  if (Array.isArray(value)) {
    for (const item of value) addUrlFromUnknown(urls, item)
    return
  }
  const normalized =
    toPublicOpenHref(typeof value === "string" ? value : pickMediaUrlFromValue(value) || value) ||
    (typeof value === "string" && value.trim() ? value.trim() : undefined)
  if (normalized && !urls.includes(normalized)) urls.push(normalized)
}

function collectUrlsForInstallField(fieldKey: string, ...containers: unknown[]): string[] {
  const snake = fieldKey.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
  const urls: string[] = []
  for (const raw of containers) {
    const o = raw as Record<string, unknown> | null | undefined
    if (!o || typeof o !== "object" || Array.isArray(o)) continue
    addUrlFromUnknown(urls, o[`${fieldKey}PublicUrl`])
    addUrlFromUnknown(urls, o[`${fieldKey}_public_url`])
    addUrlFromUnknown(urls, o[`${snake}_public_url`])
    addUrlFromUnknown(urls, o[`${fieldKey}Url`])
    addUrlFromUnknown(urls, o[`${fieldKey}_url`])
    addUrlFromUnknown(urls, o[`${snake}_url`])
    addUrlFromUnknown(urls, o[fieldKey])
    addUrlFromUnknown(urls, o[snake])
    const arrKeys = [`${fieldKey}s`, `${fieldKey}Urls`, `${fieldKey}_urls`, `${snake}s`, `${snake}_urls`]
    for (const k of arrKeys) addUrlFromUnknown(urls, o[k])
    const bags = [o.installationPhotos, o.installation_photos, o.completionPhotos, o.completion_photos, o.images, o.photos]
    for (const bag of bags) {
      if (bag && typeof bag === "object" && !Array.isArray(bag)) {
        const b = bag as Record<string, unknown>
        addUrlFromUnknown(urls, b[fieldKey])
        addUrlFromUnknown(urls, b[snake])
      }
    }
  }
  return urls
}

function extractPiMediaUrls(q: Record<string, unknown>): string[] {
  const doc = (q.documents || q.document || {}) as Record<string, unknown>
  const urls: string[] = []
  const add = (s?: string) => {
    const normalized = s ? toPublicOpenHref(s) || s.trim() : ""
    if (normalized && !urls.includes(normalized)) urls.push(normalized)
  }
  for (const arr of [
    doc.piUploadUrls,
    doc.pi_upload_urls,
    doc.piUploads,
    doc.pi_uploads,
    q.piUploadUrls,
    q.pi_upload_urls,
    q.piUploads,
    q.pi_uploads,
  ]) {
    if (!Array.isArray(arr)) continue
    for (const item of arr) {
      if (typeof item === "string") add(item)
      else if (item && typeof item === "object") add(pickMediaUrlFromValue(item))
    }
  }
  add(pickNonEmptyString(doc.piUploadUrl))
  add(pickNonEmptyString(doc.pi_upload_url))
  add(pickNonEmptyString(q.piUploadUrl))
  add(pickNonEmptyString(q.pi_upload_url))
  return urls
}

/** Public PI / proforma document URLs on a quotation (list or detail shape). */
export function extractPiUploadUrls(q: Record<string, unknown> | null | undefined): string[] {
  if (!q || typeof q !== "object") return []
  return extractPiMediaUrls(q)
}

function addDedupedUrl(sink: string[], max: number, s?: string) {
  const normalized = toPublicOpenHref(s)
  if (!normalized || sink.includes(normalized) || sink.length >= max) return
  sink.push(normalized)
}

function collectUrlsFromArrayLike(arr: unknown, sink: string[], max: number) {
  if (!Array.isArray(arr)) return
  for (const item of arr) {
    if (sink.length >= max) return
    addDedupedUrl(sink, max, pickMediaUrlFromValue(item))
  }
}

/** All public http(s) image/doc URLs for installation completion (list + detail shapes). */
export function gatherInstallationPublicImageUrls(q: Record<string, unknown>, max = 24): string[] {
  const out: string[] = []
  const doc = (q.documents || q.document || q.installationDocuments || q.quotationDocuments || {}) as Record<
    string,
    unknown
  >
  const inst = (q.installation || q.installerInstallation || q.installationCompletion || {}) as Record<string, unknown>

  const nested = [
    q,
    !Array.isArray(doc) ? doc : undefined,
    !Array.isArray(inst) ? inst : undefined,
    (q.installation || q.installerInstallation) as Record<string, unknown> | undefined,
    q.installerCompletion as Record<string, unknown> | undefined,
    q.installationCompletion as Record<string, unknown> | undefined,
    (doc as Record<string, unknown>).installation as Record<string, unknown> | undefined,
    (doc as Record<string, unknown>).installerCompletion as Record<string, unknown> | undefined,
    (doc as Record<string, unknown>).installationCompletion as Record<string, unknown> | undefined,
    (inst as Record<string, unknown>).documents as Record<string, unknown> | undefined,
    (inst as Record<string, unknown>).images as Record<string, unknown> | undefined,
    (inst as Record<string, unknown>).photos as Record<string, unknown> | undefined,
  ].filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x))

  for (const fieldKey of OPERATIONAL_INSTALLATION_IMAGE_FIELD_KEYS) {
    for (const url of collectUrlsForInstallField(fieldKey, ...nested)) {
      addDedupedUrl(out, max, url)
    }
  }
  for (const url of extractPiMediaUrls(q)) addDedupedUrl(out, max, url)

  const arrayKeys = [
    "siteCompletionImages",
    "site_completion_images",
    "installerCompletionImages",
    "installer_completion_images",
    "completionImages",
    "completion_images",
    "installationImages",
    "installation_images",
    "installerCompletionImageUrls",
  ]

  for (const src of nested) {
    for (const k of arrayKeys) {
      collectUrlsFromArrayLike(src[k], out, max)
    }
  }

  const documentList = Array.isArray(q.documents)
    ? q.documents
    : Array.isArray(q.installationDocuments)
      ? q.installationDocuments
      : null
  if (documentList) {
    const qid = String(q.id || "").trim().toLowerCase()
    for (const item of documentList) {
      if (out.length >= max) break
      if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>
        const owner = String(rec.quotationId || rec.quotation_id || rec.quotationID || "").trim().toLowerCase()
        if (owner && qid && owner !== qid) continue
        const fieldHint = String(rec.field || rec.fieldKey || rec.field_key || rec.type || rec.documentType || "").trim()
        if (fieldHint) {
          for (const fieldKey of OPERATIONAL_INSTALLATION_IMAGE_FIELD_KEYS) {
            if (fieldHint === fieldKey || fieldHint.replace(/-/g, "").toLowerCase() === fieldKey.toLowerCase()) {
              for (const url of collectUrlsForInstallField(fieldKey, rec)) addDedupedUrl(out, max, url)
            }
          }
        }
        addDedupedUrl(out, max, pickMediaUrlFromValue(item))
      } else {
        addDedupedUrl(out, max, pickMediaUrlFromValue(item))
      }
    }
  }

  const jsonBlob =
    pickNonEmptyString(q.installationImageUrls) ||
    pickNonEmptyString(q.installation_image_urls) ||
    pickNonEmptyString(doc.installationImageUrls) ||
    pickNonEmptyString(doc.installation_image_urls) ||
    pickNonEmptyString(q.existingInstallationImageUrlsJson) ||
    pickNonEmptyString(q.existing_installation_image_urls_json) ||
    pickNonEmptyString(doc.existingInstallationImageUrlsJson) ||
    pickNonEmptyString(doc.existing_installation_image_urls_json)
  if (jsonBlob && (jsonBlob.startsWith("[") || jsonBlob.startsWith("{"))) {
    try {
      const parsed = JSON.parse(jsonBlob)
      if (Array.isArray(parsed)) collectUrlsFromArrayLike(parsed, out, max)
      else if (parsed && typeof parsed === "object") {
        for (const v of Object.values(parsed as Record<string, unknown>)) {
          if (Array.isArray(v)) collectUrlsFromArrayLike(v, out, max)
          else if (typeof v === "string") addDedupedUrl(out, max, v)
        }
      }
    } catch {
      // ignore invalid JSON
    }
  }

  return out
}

function last10Digits(value: unknown): string {
  const digits = String(value || "").replace(/\D/g, "")
  if (digits.length >= 10) return digits.slice(-10)
  return digits
}

function quotationIdentityTokens(q: Record<string, unknown>): string[] {
  const customer = q.customer as Record<string, unknown> | undefined
  const tokens = [
    q.id,
    q.quotationId,
    q.quotation_id,
    q.quotationNumber,
    q.quotation_number,
    q.quotationNo,
    customer?.id,
    last10Digits(customer?.mobile || customer?.phone || q.customerMobile || q.mobile),
  ]
    .map((v) => String(v || "").trim().toLowerCase())
    .filter((v) => v.length >= 4)
  return [...new Set(tokens)]
}

export function installationUrlBelongsToQuotation(url: string, q: Record<string, unknown>): boolean {
  let hay = url.toLowerCase()
  try {
    hay = decodeURIComponent(url).toLowerCase()
  } catch {
    // keep raw
  }
  return quotationIdentityTokens(q).some((token) => hay.includes(token))
}

/** Photos for this customer only — list APIs sometimes attach every URL to the first row. */
export function resolveInstallationPhotoUrlsForQuotation(
  q: Record<string, unknown>,
  pool: Array<Record<string, unknown>>,
  max = 24,
): string[] {
  const out: string[] = []
  const qid = String(q.id || "").trim()
  const rows = pool.length > 0 ? pool : [q]

  for (const row of rows) {
    for (const url of gatherInstallationPublicImageUrls(row, 48)) {
      if (installationUrlBelongsToQuotation(url, q)) addDedupedUrl(out, max, url)
    }
  }

  if (out.length > 0) return out

  for (const url of gatherInstallationPublicImageUrls(q, max)) {
    const belongsToSomeoneElse = rows.some((row) => {
      const oid = String(row.id || "").trim()
      return oid && oid !== qid && installationUrlBelongsToQuotation(url, row)
    })
    if (!belongsToSomeoneElse) addDedupedUrl(out, max, url)
  }
  return out
}

export function isInstallationUploadCompleteWithMedia(
  q: OperationalQuotationRecord,
  opts?: { approvedQueueIds?: Set<string> },
): boolean {
  const id = String(q.id || "").trim()
  return isInstallationApprovedForAdminTab(q, {
    imageUrlCount: gatherInstallationPublicImageUrls(q as Record<string, unknown>).length,
    inInstallerApprovedQueue: id ? opts?.approvedQueueIds?.has(id) : false,
  })
}

export const INSTALLATION_APPROVED_MEDIA_STATUSES = new Set([
  "installer_approved",
  "pending_metering",
  "metering_in_progress",
  "metering_approved",
  "meter_installation_pending",
  "meter_install_pending",
  "mco",
  "pending_baldev",
  "baldev_approved",
  "completed",
])
