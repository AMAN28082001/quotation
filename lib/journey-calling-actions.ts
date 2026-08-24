/**
 * Shared helpers to pull calling-action rows from dealer/admin/HR API payloads
 * and normalize them for Customer Journey matching.
 */

import type { JourneyCallingAction } from "@/lib/full-customer-journey"
import { normalizeMobileForMatch } from "@/lib/quotation-api-payload"
import { parseTaggedCallRemark } from "@/lib/calling-remark-payload"
import { resolveCallingActionRemark } from "@/lib/dealer-calling-action-history"

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
    lead?.actionAt ||
    lead?.action_at ||
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
