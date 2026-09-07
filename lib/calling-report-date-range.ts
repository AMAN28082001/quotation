/**
 * Shared date bounds for dealer calling reports (HR / Admin panels).
 * Week = Monday–Sunday (ISO-style week start).
 */

export type CallingReportPreset = "daily" | "weekly" | "monthly" | "last_month"

export function formatYmdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function parseCallingActionAt(value?: string | number | null): Date | null {
  if (value == null) return null
  const raw = String(value).trim()
  if (!raw) return null

  if (/^\d{10,13}$/.test(raw)) {
    const n = Number(raw)
    const ms = raw.length === 10 ? n * 1000 : n
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const indian = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (indian) {
    const dd = Number(indian[1])
    const mm = Number(indian[2]) - 1
    let yyyy = Number(indian[3])
    if (indian[3].length === 2) yyyy += yyyy >= 70 ? 1900 : 2000
    const d = new Date(yyyy, mm, dd, Number(indian[4] || 0), Number(indian[5] || 0), Number(indian[6] || 0))
    return Number.isNaN(d.getTime()) ? null : d
  }

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw)) {
    const d = new Date(raw.replace(" ", "T"))
    if (!Number.isNaN(d.getTime())) return d
  }

  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export function extractCallingActionsFromApiResponse(response: unknown): { rows: unknown[]; total: number | null } {
  if (Array.isArray(response)) return { rows: response, total: response.length }
  if (!response || typeof response !== "object") return { rows: [], total: null }
  const root = response as Record<string, unknown>
  const nested =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : null
  const candidates = [
    root.actions,
    root.callingActions,
    root.items,
    root.logs,
    Array.isArray(root.data) ? root.data : undefined,
    nested?.actions,
    nested?.callingActions,
    nested?.items,
    nested?.logs,
  ]
  const rows = (candidates.find((c) => Array.isArray(c)) as unknown[] | undefined) || []
  const pagination = (root.pagination ?? nested?.pagination) as Record<string, unknown> | undefined
  const meta = (root.meta ?? nested?.meta) as Record<string, unknown> | undefined
  const totalRaw =
    pagination?.total ??
    meta?.total ??
    root.total ??
    nested?.total ??
    root.totalCount ??
    nested?.totalCount ??
    root.count
  const n = Number(totalRaw)
  return { rows, total: Number.isFinite(n) && n >= 0 ? n : null }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function callingActionRowKey(item: {
  id?: string
  leadId?: string
  customerMobile?: string
  action?: string
  actionAt?: string
}): string {
  const id = String(item.id || "").trim()
  if (id && UUID_RE.test(id)) return `id:${id}`
  const mobile = String(item.customerMobile || "").replace(/\D/g, "").slice(-10)
  return ["fp", item.leadId || "", mobile, item.action || "", item.actionAt || ""].join("|")
}

/** Inclusive local calendar-day compare (avoids UTC shifting a call into the wrong month). */
export function isCallingActionInBounds(
  actionAt: string | undefined,
  bounds: { start: Date; end: Date },
): boolean {
  const at = parseCallingActionAt(actionAt)
  if (!at) return false
  const ymd = formatYmdLocal(at)
  return ymd >= formatYmdLocal(bounds.start) && ymd <= formatYmdLocal(bounds.end)
}

/** One submitted outcome per lead/mobile in the current list (latest timestamp wins). Skips Start. */
export function latestCallingActionPerContact<
  T extends { leadId?: string; customerMobile?: string; action?: string; actionAt?: string; id?: string },
>(items: T[]): T[] {
  const map = new Map<string, T>()
  let anon = 0
  for (const item of items) {
    if (String(item.action || "").toLowerCase().trim() === "start") continue
    const lead = String(item.leadId || "").trim()
    const mobile = String(item.customerMobile || "").replace(/\D/g, "").slice(-10)
    const key = lead || (mobile.length >= 10 ? `m:${mobile}` : "") || `anon:${item.id || anon++}`
    const prev = map.get(key)
    const t = parseCallingActionAt(item.actionAt)?.getTime() || 0
    const pt = prev ? parseCallingActionAt(prev.actionAt)?.getTime() || 0 : -1
    if (!prev || t >= pt) map.set(key, item)
  }
  return [...map.values()]
}

function dayStart(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function dayEnd(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

export function getPresetBounds(preset: CallingReportPreset, now = new Date()): { start: Date; end: Date } {
  if (preset === "daily") {
    return { start: dayStart(now), end: dayEnd(now) }
  }
  if (preset === "weekly") {
    const start = dayStart(now)
    const wd = start.getDay()
    const diff = wd === 0 ? 6 : wd - 1
    start.setDate(start.getDate() - diff)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }
  if (preset === "monthly") {
    const start = dayStart(new Date(now.getFullYear(), now.getMonth(), 1))
    const end = dayEnd(new Date(now.getFullYear(), now.getMonth() + 1, 0))
    return { start, end }
  }
  const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const start = dayStart(new Date(prevYear, prevMonth, 1))
  const end = dayEnd(new Date(prevYear, prevMonth + 1, 0))
  return { start, end }
}

/** Parse `YYYY-MM-DD` as local calendar dates; inclusive range. */
export function getCustomBoundsFromYmd(fromYmd: string, toYmd: string): { start: Date; end: Date } | null {
  const from = String(fromYmd || "").trim()
  const to = String(toYmd || "").trim()
  if (!from || !to) return null
  const parse = (ymd: string, endOfDay: boolean) => {
    const parts = ymd.split("-").map((p) => Number(p))
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null
    const [y, m, d] = parts
    const dt = endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0)
    return Number.isNaN(dt.getTime()) ? null : dt
  }
  const start = parse(from, false)
  const end = parse(to, true)
  if (!start || !end || start > end) return null
  return { start, end }
}

export function boundsToApiIsoRange(bounds: { start: Date; end: Date }): { startDate: string; endDate: string } {
  return { startDate: bounds.start.toISOString(), endDate: bounds.end.toISOString() }
}

/** Query params for HR/Admin calling-actions list (optional `startDate` / `endDate`). */
export function buildCallingActionsQueryDates(
  range: "daily" | "weekly" | "monthly" | "last_month" | "all" | "custom",
  customFromYmd: string,
  customToYmd: string,
): { startDate?: string; endDate?: string; fromDate?: string; toDate?: string } {
  if (range === "all") return {}
  if (range === "custom") {
    const b = getCustomBoundsFromYmd(customFromYmd, customToYmd)
    if (!b) return {}
    return {
      ...boundsToApiIsoRange(b),
      fromDate: formatYmdLocal(b.start),
      toDate: formatYmdLocal(b.end),
    }
  }
  const b = getPresetBounds(range, new Date())
  return {
    ...boundsToApiIsoRange(b),
    fromDate: formatYmdLocal(b.start),
    toDate: formatYmdLocal(b.end),
  }
}
