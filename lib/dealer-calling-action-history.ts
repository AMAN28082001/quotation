import { buildTaggedCallRemark, cleanFreeCallRemark, parseTaggedCallRemark } from "@/lib/calling-remark-payload"

export type StoredDealerCallingAction = {
  id: string
  leadId: string
  dealerId: string
  name: string
  mobile: string
  action?: string
  actionAt?: string
  callRemark?: string
  nextFollowUpAt?: string
  statusCategory?: string
  statusText?: string
  kNumber?: string
  address?: string
  city?: string
  state?: string
  customerNote?: string
}

const STORAGE_PREFIX = "dealer-calling-action-history:"
const MAX_ENTRIES = 600

function storageKey(dealerId: string): string {
  return `${STORAGE_PREFIX}${dealerId}`
}

function readRaw(dealerId: string): StoredDealerCallingAction[] {
  if (!dealerId || typeof localStorage === "undefined") return []
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(dealerId)) || "[]")
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeRaw(dealerId: string, rows: StoredDealerCallingAction[]) {
  if (!dealerId || typeof localStorage === "undefined") return
  try {
    localStorage.setItem(storageKey(dealerId), JSON.stringify(rows.slice(0, MAX_ENTRIES)))
  } catch {
    // ignore quota errors
  }
}

/** Normalize remark from API row or rebuild from structured status fields. */
export function resolveCallingActionRemark(source: Record<string, unknown> | null | undefined): string {
  if (!source) return ""
  const direct = String(
    source.callRemark ||
      source.call_remark ||
      source.lastCallRemark ||
      source.last_call_remark ||
      "",
  ).trim()
  if (direct) return direct

  const category = String(source.statusCategory || source.status_category || "").trim()
  const status = String(source.statusText || source.status_text || "").trim()
  const free = String(source.remark || source.freeRemark || source.free_remark || "").trim()
  if (category && status) return buildTaggedCallRemark(category, status, free)
  if (status && free) return `${status} | ${free}`
  return status || free
}

export function readDealerCallingActions(dealerId: string): StoredDealerCallingAction[] {
  return readRaw(dealerId)
}

/** Merge per-dealer local call history (admin journey fallback when API is forbidden). */
export function readAllDealerCallingActions(dealerIds: string[]): StoredDealerCallingAction[] {
  const seen = new Set<string>()
  const merged: StoredDealerCallingAction[] = []
  for (const dealerId of dealerIds) {
    const id = String(dealerId || "").trim()
    if (!id) continue
    for (const row of readDealerCallingActions(id)) {
      const fingerprint = [row.leadId, row.actionAt || "", row.action || ""].join("|")
      if (!fingerprint.replace(/\|/g, "").trim()) continue
      if (seen.has(fingerprint)) continue
      seen.add(fingerprint)
      merged.push(row)
    }
  }
  return merged
}

export function appendDealerCallingAction(
  dealerId: string,
  item: Omit<StoredDealerCallingAction, "dealerId"> & { dealerId?: string },
) {
  if (!dealerId) return
  const parsed = parseTaggedCallRemark(item.callRemark)
  const row: StoredDealerCallingAction = {
    ...item,
    dealerId,
    callRemark: item.callRemark?.trim() || "",
    statusCategory: item.statusCategory || parsed.statusCategory || undefined,
    statusText: item.statusText || parsed.status || undefined,
  }
  if (!row.callRemark?.trim() && !row.action) return

  const fingerprint = [row.leadId, row.actionAt || "", row.action || ""].join("|")

  const existing = readRaw(dealerId).filter((entry) => {
    const fp = [entry.leadId, entry.actionAt || "", entry.action || ""].join("|")
    return fp !== fingerprint
  })

  writeRaw(dealerId, [row, ...existing])
}

/** Prefer the richest callRemark when merging API + local duplicates. */
export function pickRicherCallRemark(a?: string, b?: string): string {
  const left = (a || "").trim()
  const right = (b || "").trim()
  if (!left) return right
  if (!right) return left
  return left.length >= right.length ? left : right
}

export type PriorCallReviewSource = {
  leadId?: string
  mobile?: string
  callRemark?: string
  statusText?: string
  statusCategory?: string
  actionAt?: string
  nextFollowUpAt?: string
}

function normalizeMobileDigits(mobile?: string): string {
  return (mobile || "").replace(/\D/g, "")
}

/** Latest tagged remark + free-text review for a lead (reschedule / follow-up prefill). */
export function resolveLeadPriorCallReview(
  lead: { id: string; mobile?: string; callRemark?: string; nextFollowUpAt?: string },
  sources: PriorCallReviewSource[],
): {
  taggedRemark: string
  freeRemark: string
  statusText: string
  statusCategory: string
  nextFollowUpAt?: string
  actionAt?: string
} {
  const leadMobile = normalizeMobileDigits(lead.mobile)
  const candidates: PriorCallReviewSource[] = []

  const leadRemark = resolveCallingActionRemark(lead as Record<string, unknown>)
  if (leadRemark || lead.nextFollowUpAt) {
    candidates.push({
      callRemark: leadRemark,
      nextFollowUpAt: lead.nextFollowUpAt,
    })
  }

  for (const source of sources) {
    const id = String(source.leadId || "").trim()
    const mobile = normalizeMobileDigits(source.mobile)
    if (id && id === lead.id) {
      candidates.push(source)
      continue
    }
    if (leadMobile && mobile && mobile === leadMobile) {
      candidates.push(source)
    }
  }

  candidates.sort(
    (a, b) => new Date(b.actionAt || 0).getTime() - new Date(a.actionAt || 0).getTime(),
  )

  for (const candidate of candidates) {
    const taggedRemark = resolveCallingActionRemark(candidate as Record<string, unknown>)
    const parsed = parseTaggedCallRemark(taggedRemark)
    const statusText = String(
      candidate.statusText || parsed.status || "",
    ).trim()
    const statusCategory = String(
      candidate.statusCategory || parsed.statusCategory || "",
    ).trim()
    const freeRemark = cleanFreeCallRemark(parsed.remark || taggedRemark)
    if (!taggedRemark && !freeRemark && !statusText) continue

    return {
      taggedRemark,
      freeRemark,
      statusText,
      statusCategory,
      nextFollowUpAt: candidate.nextFollowUpAt,
      actionAt: candidate.actionAt,
    }
  }

  return {
    taggedRemark: "",
    freeRemark: "",
    statusText: "",
    statusCategory: "",
    nextFollowUpAt: lead.nextFollowUpAt,
  }
}
