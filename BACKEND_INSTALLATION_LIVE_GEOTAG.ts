// @ts-nocheck
/**
 * =============================================================================
 * BACKEND — Installation **Upload** + **Live photo (geotag)** — Aug 2026
 * =============================================================================
 *
 * UI: Admin / Installer → installation completion cards
 *   - Upload  = gallery / file picker
 *   - Live photo = camera + device GPS stamped onto the JPEG
 *
 * Frontend:
 *   - `components/installation-completion-panel.tsx`
 *   - `lib/live-geotag-photo.ts` (client stamps lat/lng + timestamp on the image)
 *   - Upload still goes through existing completion multipart
 *     (`api.installer.uploadCompletionDocuments` / Multer §26)
 *
 * Docs: REQUIRED §AJ, HANDOFF §37
 *
 * Today (no backend change required for basic UX):
 *   Live photos are normal image files. GPS is burned into the pixels.
 *   Existing POST …/documents already accepts them.
 *
 * Backend optional (recommended) — store structured geotag so list/detail can
 * show coordinates without reading the image, and for audit / compliance.
 *
 * =============================================================================
 */

/**
 * Existing upload routes (unchanged Multer field names — see
 * BACKEND_INSTALLATION_COMPLETION_MULTER.ts):
 *
 *   POST /api/installer/quotations/:quotationId/documents
 *   POST /api/admin/quotations/:quotationId/installer-documents
 *   POST /api/admin/installer/quotations/:quotationId/documents
 *
 * New optional multipart text fields (JSON strings):
 *
 *   installationImageCaptureMetaJson
 *   // or per-file:
 *   // installerCompletionImageCaptureMetaJson  (aligned with field order array)
 *
 * Example `installationImageCaptureMetaJson`:
 * {
 *   "homeWithPersonPhoto": [
 *     {
 *       "source": "live",                 // "live" | "upload"
 *       "latitude": 26.9124,
 *       "longitude": 75.7873,
 *       "accuracyMeters": 12.5,
 *       "capturedAt": "2026-08-26T05:50:00.000Z"
 *     }
 *   ],
 *   "geoTagPlantPhoto": [
 *     { "source": "live", "latitude": 26.91, "longitude": 75.78, "capturedAt": "…" }
 *   ]
 * }
 *
 * Rules:
 *   1) Accept and persist even if some coords are null (GPS denied).
 *   2) Do not reject gallery uploads that omit this JSON.
 *   3) Keep accepting stamped JPEG bytes as today (source of truth for “Open link”).
 */

/**
 * Suggested DB (JSON column or side table):
 *
 * ALTER TABLE quotation_installation_documents
 *   ADD COLUMN IF NOT EXISTS capture_meta JSONB NULL;
 *
 * Or on quotations.documents JSON:
 *   documents.homeWithPersonPhotoCaptureMeta = [ { source, latitude, longitude, … } ]
 */

/**
 * GET /api/admin/quotations and GET /api/quotations/:id
 * Echo for each installation image field (optional but recommended):
 *
 *   homeWithPersonPhotoPublicUrl / Url  (existing)
 *   homeWithPersonPhotoCaptureMeta: [
 *     { source: "live", latitude, longitude, accuracyMeters, capturedAt }
 *   ]
 *
 * Same pattern for:
 *   homeFrontPhoto, inverterWithCustomerPhoto, plantWithCustomerPhoto,
 *   inverterSerialNumberPhoto, panelSerialNumberPhoto, geoTagPlantPhoto, otherImages
 */

/**
 * Optional dedicated endpoint (only if you want server-side EXIF/GPS parse):
 *
 *   POST /api/quotations/:id/installation-images/live
 *   multipart: file + latitude + longitude + accuracyMeters + fieldKey
 *
 * Prefer extending the existing completion POST instead of a new route.
 */

export const INSTALLATION_LIVE_GEOTAG_CAPTURE_SOURCES = ["live", "upload"]

export function parseInstallationImageCaptureMetaJson(raw) {
  if (!raw) return {}
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}
