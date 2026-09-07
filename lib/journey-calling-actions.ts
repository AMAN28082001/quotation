/**
 * Shared helpers to pull calling-action rows from dealer/admin/HR API payloads
 * and normalize them for Customer Journey matching.
 */

import type { JourneyCallingAction } from "@/lib/full-customer-journey"
import { normalizeMobileForMatch } from "@/lib/quotation-api-payload"
import { parseTaggedCallRemark } from "@/lib/calling-remark-payload"
import {
  readAllDealerCallingActions,
  resolveCallingActionRemark,
} from "@/lib/dealer-calling-action-history"
import { api, ApiError } from "@/lib/api"
import { callingActionRowKey, extractCallingActionsFromApiResponse } from "@/lib/calling-report-date-range"

const ACTION_ARRAY_KEYS = [
  "actions",
  "callingActions",
  "calling_actions",
  "recentActions",
  "actionHistory",
  "completedActions",
  "dialledActions",
  "connectedActions",
  "notConnectedActions",
  "items",
  "rows",
  "results",
  "records",
  "list",
  "logs",
] as const

function pushUnique(target: unknown[], seen: Set<string>, item: unknown) {
  if (!item || typeof item !== "object") return
  const row = item as Record<string, unknown>
  const id = String(row.id || row._id || "")
  const leadId = String(row.leadId || row.lead_id || (row.lead as any)?.id || "")
  const actionAt = String(row.actionAt || row.action_at || row.updatedAt || row.createdAt || "")
  const action = String(row.action || row.status || "")
  const fingerprint = id || `${leadId}|${action}|${actionAt}`
  if (!fingerprint || fingerprint === "||") {
    target.push(item)
    return
  }
  if (seen.has(fingerprint)) return
  seen.add(fingerprint)
  target.push(item)
}

/** Flatten common calling-action array shapes from backend responses. */
export function extractCallingActionList(response: unknown, depth = 0): unknown[] {
  if (response == null || depth > 4) return []
  if (Array.isArray(response)) return response

  if (typeof response !== "object") return []
  const r = response as Record<string, unknown>
  const seen = new Set<string>()
  const merged: unknown[] = []

  for (const key of ACTION_ARRAY_KEYS) {
    const value = r[key]
    if (Array.isArray(value)) {
      for (const item of value) pushUnique(merged, seen, item)
    }
  }

  if (r.data != null) {
    for (const item of extractCallingActionList(r.data, depth + 1)) {
      pushUnique(merged, seen, item)
    }
  }

  if (merged.length > 0) return merged

  // Single nested object that itself holds arrays
  for (const value of Object.values(r)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = extractCallingActionList(value, depth + 1)
      if (nested.length > 0) {
        for (const item of nested) pushUnique(merged, seen, item)
      }
    }
  }

  return merged
}

export function journeyMobileKey(value: string | undefined | null): string {
  const digits = normalizeMobileForMatch(value || "")
  if (digits.length >= 10) return digits.slice(-10)
  return digits
}

export function journeyMobilesMatch(a?: string | null, b?: string | null): boolean {
  const left = journeyMobileKey(a)
  const right = journeyMobileKey(b)
  if (!left || !right) return false
  return left === right || left.endsWith(right) || right.endsWith(left)
}

function readNestedMobile(source: Record<string, unknown> | null | undefined): string {
  if (!source) return ""
  for (const key of [
    "mobile",
    "customerMobile",
    "customer_mobile",
    "phone",
    "phoneNumber",
    "phone_number",
    "contactMobile",
    "contact_mobile",
  ]) {
    const value = source[key]
    if (typeof value === "string" && value.trim()) return value.trim()
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
  }
  return ""
}

export function normalizeJourneyCallingAction(item: any, index: number): JourneyCallingAction {
  const lead = item?.lead && typeof item.lead === "object" ? item.lead : null
  const customer = item?.customer && typeof item.customer === "object" ? item.customer : null
  const actionAt =
    item?.actionAt ||
    item?.action_at ||
    item?.updatedAt ||
    item?.updated_at ||
    item?.createdAt ||
    item?.created_at ||
    item?.calledAt ||
    item?.called_at ||
    item?.submittedAt ||
    item?.submitted_at ||
    item?.completedAt ||
    item?.completed_at ||
    item?.dialledAt ||
    item?.dialled_at ||
    lead?.actionAt ||
    lead?.action_at ||
    lead?.updatedAt ||
    lead?.createdAt ||
    ""
  const leadId = String(
    item?.leadId ||
      item?.lead_id ||
      lead?.id ||
      lead?._id ||
      item?.callingLeadId ||
      item?.calling_lead_id ||
      "",
  ).trim()
  const callRemark =
    resolveCallingActionRemark(item) ||
    resolveCallingActionRemark(lead) ||
    String(item?.callRemark || item?.call_remark || item?.remark || lead?.callRemark || "").trim()
  const tagged = parseTaggedCallRemark(callRemark)
  const customerMobile =
    readNestedMobile(item) ||
    readNestedMobile(lead) ||
    readNestedMobile(customer) ||
    ""

  return {
    id: String(item?.id || item?._id || `${leadId || "lead"}-${actionAt || "na"}-${index}`),
    leadId,
    dealerId: String(
      item?.dealerId || item?.assignedDealerId || item?.assigned_dealer_id || item?.dealer?.id || "",
    ),
    dealerName:
      item?.dealerName ||
      item?.assignedDealerName ||
      item?.assigned_dealer_name ||
      (item?.dealer
        ? `${item.dealer.firstName || ""} ${item.dealer.lastName || ""}`.trim()
        : "") ||
      "",
    customerName:
      item?.name ||
      item?.customerName ||
      item?.customer_name ||
      lead?.name ||
      `${item?.customer?.firstName || ""} ${item?.customer?.lastName || ""}`.trim() ||
      "",
    customerMobile,
    action: item?.action || item?.status || lead?.action || "unknown",
    callRemark,
    statusCategory:
      item?.statusCategory ||
      item?.status_category ||
      lead?.statusCategory ||
      lead?.status_category ||
      tagged.statusCategory ||
      "",
    statusText:
      item?.statusText ||
      item?.status_text ||
      lead?.statusText ||
      lead?.status_text ||
      tagged.status ||
      "",
    status_category: item?.status_category || tagged.statusCategory || "",
    status_text: item?.status_text || tagged.status || "",
    actionAt: String(actionAt || ""),
    nextFollowUpAt: item?.nextFollowUpAt || item?.next_follow_up_at || lead?.nextFollowUpAt,
  }
}

export function normalizeJourneyCallingActions(response: unknown): JourneyCallingAction[] {
  return extractCallingActionList(response).map((item, index) =>
    normalizeJourneyCallingAction(item, index),
  )
}

function mergeCallingActionRowsInto(target: unknown[], seenKeys: Set<string>, rows: unknown[]) {
  for (const row of rows) {
    const rec = row as Record<string, unknown>
    const key = callingActionRowKey({
      id: String(rec.id || rec._id || ""),
      leadId: String(rec.leadId || rec.lead_id || (rec.lead as { id?: string } | undefined)?.id || ""),
      customerMobile: String(rec.mobile || rec.customerMobile || rec.customer_mobile || ""),
      action: String(rec.action || rec.status || ""),
      actionAt: String(rec.actionAt || rec.action_at || rec.updatedAt || rec.createdAt || ""),
    })
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
    target.push(row)
  }
}

/**
 * Load calling actions for Admin Customer Journey.
 * Tries admin API → HR API → per-dealer browser cache when admin RBAC blocks calling-actions.
 *
 * Pass a date `range` (default `daily` / today) so the tab does not wait on all-time pagination.
 */
export type JourneyCallingLoadOptions = {
  range?: "daily" | "weekly" | "monthly" | "last_month" | "all" | "custom"
  startDate?: string
  endDate?: string
  fromDate?: string
  toDate?: string
  maxPages?: number
  /** Called after each page so UI can paint before the full fetch finishes. */
  onProgress?: (actions: JourneyCallingAction[], done: boolean) => void
}

export async function loadJourneyCallingActionsForAdmin(
  dealerIds: string[],
  options?: JourneyCallingLoadOptions,
): Promise<JourneyCallingAction[]> {
  const collected: unknown[] = []
  const seenKeys = new Set<string>()
  const limit = 250
  const range = options?.range ?? "daily"
  const maxPages = options?.maxPages ?? (range === "all" ? 40 : 8)

  const queryBase: {
    limit: number
    range: "daily" | "weekly" | "monthly" | "last_month" | "all" | "custom"
    startDate?: string
    endDate?: string
    fromDate?: string
    toDate?: string
  } = {
    limit,
    range,
  }
  if (options?.startDate) queryBase.startDate = options.startDate
  if (options?.endDate) queryBase.endDate = options.endDate
  if (options?.fromDate) queryBase.fromDate = options.fromDate
  if (options?.toDate) queryBase.toDate = options.toDate

  const emitProgress = (done: boolean) => {
    if (!options?.onProgress) return
    options.onProgress(normalizeJourneyCallingActions({ actions: collected }), done)
  }

  const paginate = async (fetchPage: (page: number) => Promise<unknown | null>) => {
    for (let page = 1; page <= maxPages; page += 1) {
      const response = await fetchPage(page)
      if (!response) break
      const { rows, total } = extractCallingActionsFromApiResponse(response)
      if (rows.length === 0) break
      const before = collected.length
      mergeCallingActionRowsInto(collected, seenKeys, rows)
      if (collected.length === before) break
      emitProgress(false)
      if (rows.length < limit) break
      if (total != null && collected.length >= total) break
    }
  }

  try {
    await paginate(async (page) => {
      try {
        return await api.admin.callingActions.getAll({ ...queryBase, page })
      } catch (error) {
        if (
          error instanceof ApiError &&
          (error.code === "AUTH_004" || error.code === "HTTP_403")
        ) {
          return null
        }
        throw error
      }
    })
  } catch {
    // fall through to HR / local
  }

  if (collected.length === 0) {
    try {
      const hr = await api.hr.callingActions.getAll({
        limit: range === "all" ? 2000 : 500,
        range,
        ...(options?.startDate ? { startDate: options.startDate } : {}),
        ...(options?.endDate ? { endDate: options.endDate } : {}),
      })
      mergeCallingActionRowsInto(collected, seenKeys, extractCallingActionsFromApiResponse(hr).rows)
    } catch {
      // ignore
    }
  }

  if (collected.length === 0 && dealerIds.length > 0) {
    mergeCallingActionRowsInto(collected, seenKeys, readAllDealerCallingActions(dealerIds))
  }

  const normalized = normalizeJourneyCallingActions({ actions: collected })
  emitProgress(true)
  return normalized
}

/** Search enrichment for Customer Journey when bulk admin list is unavailable. */
export async function searchJourneyCallingActionsForAdmin(
  search: string,
): Promise<JourneyCallingAction[]> {
  const trimmed = search.trim()
  if (trimmed.length < 3) return []
  const digits = trimmed.replace(/\D/g, "")
  const query = {
    limit: 200,
    search: digits.length >= 8 ? digits.slice(-10) : trimmed,
    range: "all" as const,
  }

  for (const fetcher of [
    () => api.admin.callingActions.getAll(query),
    () => api.hr.callingActions.getAll(query),
  ]) {
    try {
      const response = await fetcher()
      const found = normalizeJourneyCallingActions(response)
      if (found.length > 0) return found
    } catch {
      // try next source
    }
  }
  return []
}

/** Read optional calling lead id stored on a quotation row from backend. */
export function readQuotationCallingLeadId(quotation: Record<string, unknown> | null | undefined): string {
  if (!quotation) return ""
  const nestedCustomer = quotation.customer as Record<string, unknown> | undefined
  const nestedProducts = quotation.products as Record<string, unknown> | undefined
  const candidates = [
    quotation.callingLeadId,
    quotation.calling_lead_id,
    quotation.leadId,
    quotation.lead_id,
    quotation.prefillLeadId,
    quotation.prefill_lead_id,
    quotation.sourceLeadId,
    quotation.source_lead_id,
    nestedCustomer?.callingLeadId,
    nestedCustomer?.leadId,
    nestedProducts?.callingLeadId,
    nestedProducts?.leadId,
  ]
  for (const value of candidates) {
    const id = String(value || "").trim()
    if (id) return id
  }
  return ""
}
