/** Extract a media URL from common API response shapes after upload/save. */

import { normalizeMediaUrl, pickMediaUrlFromValue, toPublicOpenHref, toPublicS3ObjectHref } from "@/lib/media-url"

const METER_DOC_URL_KEYS = [
  "meterDocumentPublicUrl",
  "meter_document_public_url",
  "meterDocumentUrl",
  "meter_document_url",
  "meterDocumentImageUrl",
  "meter_document_image_url",
  "meterDocumentImage",
  "meter_document_image",
  "meterDocument",
  "meter_document",
  "publicUrl",
  "public_url",
  "signedUrl",
  "signed_url",
  "url",
  "fileUrl",
  "file_url",
] as const

const METER_DOC_NAME_KEYS = [
  "meterDocumentName",
  "meter_document_name",
  "meterDocumentImageName",
  "meter_document_image_name",
  "originalName",
  "original_name",
  "fileName",
  "file_name",
  "name",
] as const

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function pickString(container: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const v = container[key]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return undefined
}

function pickUrlFromContainer(container: Record<string, unknown>): string | undefined {
  for (const key of METER_DOC_URL_KEYS) {
    if (!(key in container)) continue
    const fromValue = pickMediaUrlFromValue(container[key])
    if (fromValue) return fromValue
    if (typeof container[key] === "string" && container[key].trim()) {
      return normalizeMediaUrl(container[key]) || container[key].trim()
    }
  }
  // Generic document object: { publicUrl, url, key, ... }
  const fromSelf = pickMediaUrlFromValue(container)
  if (fromSelf) return fromSelf
  return undefined
}

function collectContainers(payload: unknown): Record<string, unknown>[] {
  const root = asRecord((payload as { data?: unknown })?.data) || asRecord(payload)
  if (!root) return []

  const out: Record<string, unknown>[] = [root]
  const nestKeys = [
    "quotation",
    "metering",
    "details",
    "documents",
    "document",
    "result",
    "item",
    "row",
  ]
  for (const key of nestKeys) {
    const nested = asRecord(root[key])
    if (nested) out.push(nested)
  }
  const docs = root.documents
  if (Array.isArray(docs)) {
    for (const item of docs) {
      const rec = asRecord(item)
      if (!rec) continue
      const docType = String(rec.docType || rec.doc_type || rec.type || "").toLowerCase()
      if (
        !docType ||
        docType.includes("meter") ||
        docType === "meter_doc" ||
        docType === "meter_document"
      ) {
        out.push(rec)
      }
    }
  }
  return out
}

export function parseMediaUrlFromApiPayload(payload: unknown, keys: string[]): string | undefined {
  for (const container of collectContainers(payload)) {
    for (const key of keys) {
      if (!(key in container)) continue
      const fromValue = pickMediaUrlFromValue(container[key])
      if (fromValue) return fromValue
      const v = container[key]
      if (typeof v === "string" && v.trim()) return v.trim()
    }
  }
  return undefined
}

export function parseMeterDocumentUrlFromApiPayload(payload: unknown): string | undefined {
  for (const container of collectContainers(payload)) {
    const url = pickUrlFromContainer(container)
    if (url) return url
  }
  return parseMediaUrlFromApiPayload(payload, [...METER_DOC_URL_KEYS])
}

export function parseMeterDocumentNameFromApiPayload(payload: unknown): string | undefined {
  for (const container of collectContainers(payload)) {
    const name = pickString(container, METER_DOC_NAME_KEYS)
    if (name && !name.includes("://")) return name
  }
  return undefined
}

/** Prefer a browser-openable public/CDN/presigned URL for meter documents. */
export function toMeterDocumentPublicViewUrl(raw: unknown): string | undefined {
  if (raw == null) return undefined
  const fromObj =
    typeof raw === "object" ? pickMediaUrlFromValue(raw) : undefined
  const asString =
    fromObj || (typeof raw === "string" ? raw.trim() : "") || normalizeMediaUrl(raw)
  if (!asString) return undefined

  const opened = toPublicOpenHref(asString) || asString
  // Keep SigV4 query params — stripping them makes private S3 objects Access Denied.
  try {
    const host = new URL(opened).hostname.toLowerCase()
    if (host.includes("amazonaws.com")) {
      const q = new URL(opened).search.toLowerCase()
      const isPresigned =
        q.includes("x-amz-signature=") ||
        q.includes("x-amz-credential=") ||
        q.includes("awsaccesskeyid=")
      if (isPresigned) return opened
      // Non-presigned S3 → prefer public CDN/object base when configured
      return toPublicS3ObjectHref(opened) || opened
    }
  } catch {
    // keep opened
  }
  return opened
}

/** Read meter document URL/name from a quotation row (list or detail). */
export function readQuotationMeterDocument(quotation: Record<string, unknown> | null | undefined): {
  url?: string
  name?: string
} {
  if (!quotation) return {}
  const containers = collectContainers(quotation)
  let url: string | undefined
  let name: string | undefined
  for (const container of containers) {
    if (!url) url = pickUrlFromContainer(container)
    if (!name) {
      const n = pickString(container, METER_DOC_NAME_KEYS)
      if (n && !n.includes("://")) name = n
    }
  }
  const publicView = url ? toMeterDocumentPublicViewUrl(url) : undefined
  return { url: publicView || url, name }
}
