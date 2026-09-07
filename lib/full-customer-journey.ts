/**
 * Full customer journey: Calling Data → Calling Action → Quotation ops → Final Confirmation.
 * Built by merging calling-action rows with quotations (match on mobile / leadId).
 */

import type { Quotation } from "@/lib/quotation-context"
import {
  journeyMobileKey,
  journeyMobilesMatch,
  readQuotationCallingLeadId,
} from "@/lib/journey-calling-actions"
import {
  classifyCallingActionSummaryBucket,
  classifyCallingConnection,
  type CallingActionLike,
} from "@/lib/calling-action-summary"
import {
  formatJourneyStageStatusLabel,
  getJourneyDateRangeBounds,
  getJourneyFileLoginLabel,
  getJourneyFilterDate,
  getJourneyHoldInfo,
  getJourneyStageProgress,
  matchesJourneyDateRangeFilter,
  type JourneyDateRangeFilter,
  type JourneyStageStatus,
} from "@/lib/customer-journey"
import { formatPersonName } from "@/lib/name-display"
import { getQuotationApprovalDate } from "@/lib/quotation-approval-date"

export type FullJourneyStageKey =
  | "callingData"
  | "callingAction"
  | "quotation"
  | "adminApproval"
  | "installation"
  | "metering"
  | "finalConfirmation"

export type FullJourneyStageProgress = Record<FullJourneyStageKey, JourneyStageStatus>

export type JourneyCallingAction = CallingActionLike & {
  id: string
  leadId?: string
  dealerId?: string
  dealerName?: string
  customerName?: string
  customerMobile?: string
  actionAt?: string
  nextFollowUpAt?: string
  callRemark?: string
}

export type JourneyTimelineEvent = {
  id: string
  at: string
  label: string
  detail?: string
  source: "calling" | "quotation" | "ops"
}

export type FullCustomerJourneyRow = {
  id: string
  customerName: string
  customerMobile: string
  mobileKey: string
  dealerName?: string
  dealerId?: string
  quotationId?: string
  leadId?: string
  fileLoginLabel?: string
  holdLabel: string
  holdHolder: string
  stages: FullJourneyStageProgress
  /** ISO timestamp when each stage happened (if known). */
  stageDates: Partial<Record<FullJourneyStageKey, string>>
  timeline: JourneyTimelineEvent[]
  latestAt: string
  callingActions: JourneyCallingAction[]
  quotation?: Quotation
}

export const FULL_JOURNEY_STAGE_LABELS: Record<FullJourneyStageKey, string> = {
  callingData: "Calling Data",
  callingAction: "Calling Action",
  quotation: "Quotation",
  adminApproval: "Admin Approval",
  installation: "Installation",
  metering: "Metering",
  finalConfirmation: "Final Confirmation",
}

function mobileKey(value: string | undefined | null): string {
  return journeyMobileKey(value)
}

function parseToValidDate(value: string | undefined | null): Date | null {
  const raw = String(value || "").trim()
  if (!raw) return null

  // Calling Data often stores "10/6/2026, 5:42:50 pm" as dd/mm/yyyy. Prefer that
  // before native Date (which treats slash dates as mm/dd).
  const match = raw.match(
    /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i,
  )
  if (match) {
    let year = Number(match[3])
    if (year < 100) year += 2000
    const day = Number(match[1])
    const month = Number(match[2])
    let hour = Number(match[4] || 0)
    const minute = Number(match[5] || 0)
    const second = Number(match[6] || 0)
    const ampm = String(match[7] || "").toLowerCase()
    if (ampm === "pm" && hour < 12) hour += 12
    if (ampm === "am" && hour === 12) hour = 0
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const parsed = new Date(year, month - 1, day, hour, minute, second)
      if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > 0) return parsed
    }
  }

  const native = new Date(raw)
  if (!Number.isNaN(native.getTime()) && native.getTime() > 0) return native
  return null
}

function safeIso(value: string | undefined | null): string {
  const d = parseToValidDate(value)
  return d ? d.toISOString() : ""
}

function formatActionLabel(action: JourneyCallingAction): string {
  const status =
    String(action.statusText || action.status_text || "").trim() ||
    String(action.action || "").replace(/_/g, " ")
  const connection = classifyCallingConnection(action)
  const bucket = classifyCallingActionSummaryBucket(action)
  const parts = [
    connection === "connected" ? "Connected" : "Not Connected",
    status || bucket,
  ].filter(Boolean)
  return parts.join(" · ")
}

function actionTimeMs(value?: string | null): number {
  return parseToValidDate(value)?.getTime() || 0
}

function firstTruthyIso(...values: Array<string | undefined | null>): string | undefined {
  for (const value of values) {
    const iso = safeIso(value)
    if (iso) return iso
  }
  return undefined
}

function statusHistoryAt(quotation: Quotation | undefined, match: (status: string) => boolean): string | undefined {
  const history = Array.isArray(quotation?.statusHistory) ? quotation!.statusHistory! : []
  for (const entry of history) {
    const status = String(entry?.status || "").toLowerCase()
    if (!match(status)) continue
    const at = safeIso(entry?.at)
    if (at) return at
  }
  return undefined
}

function readQuotationField(quotation: Quotation | undefined, ...keys: string[]): string | undefined {
  if (!quotation) return undefined
  const q = quotation as unknown as Record<string, unknown>
  for (const key of keys) {
    const value = q[key]
    if (typeof value === "string" && value.trim()) return value
    if (typeof value === "number" && Number.isFinite(value)) {
      const asDate = new Date(value)
      if (!Number.isNaN(asDate.getTime())) return asDate.toISOString()
    }
  }
  return undefined
}

function isoFromDate(value: Date | null | undefined): string | undefined {
  if (!value || Number.isNaN(value.getTime())) return undefined
  return value.toISOString()
}

/** Resolve best-known date/time for each journey stage. */
export function resolveFullJourneyStageDates(
  actions: JourneyCallingAction[],
  quotation?: Quotation,
): Partial<Record<FullJourneyStageKey, string>> {
  const sortedActions = [...actions].sort((a, b) => actionTimeMs(a.actionAt) - actionTimeMs(b.actionAt))
  const connectedActions = sortedActions.filter((item) => {
    const action = String(item.action || "")
      .toLowerCase()
      .trim()
    if (action === "start") return false
    return classifyCallingConnection(item) === "connected"
  })
  const interestedConnected = connectedActions.filter(
    (item) => classifyCallingActionSummaryBucket(item) === "interested",
  )
  const firstConnected = connectedActions[0]
  const latestConnected = connectedActions[connectedActions.length - 1]

  const quotationDate = firstTruthyIso(
    quotation?.createdAt,
    readQuotationField(quotation, "created_at", "quotationDate", "quotation_date", "submittedAt", "submitted_at"),
  )
  const calling = callingStagesFromActions(actions)
  // Dates only from real connected calls — never quotation dates for calling chips.
  const callingData =
    calling.callingData !== "pending" && firstConnected
      ? firstTruthyIso(
          interestedConnected[0]?.actionAt,
          firstConnected.actionAt,
          firstConnected.nextFollowUpAt,
        )
      : undefined
  const callingAction =
    calling.callingAction !== "pending" && latestConnected
      ? firstTruthyIso(
          interestedConnected[interestedConnected.length - 1]?.actionAt,
          latestConnected.actionAt,
          firstConnected?.actionAt,
        )
      : undefined
  const callingShared = callingData || callingAction

  const adminApproval = firstTruthyIso(
    isoFromDate(quotation ? getQuotationApprovalDate(quotation) : null),
    quotation?.statusApprovedAt,
    readQuotationField(
      quotation,
      "status_approved_at",
      "approvedAt",
      "approved_at",
      "adminApprovedAt",
      "admin_approved_at",
    ),
    statusHistoryAt(quotation, (s) => s === "approved"),
    quotation?.fileLoginAt,
    readQuotationField(quotation, "file_login_at"),
  )

  const installation = firstTruthyIso(
    readQuotationField(
      quotation,
      "installerApprovedAt",
      "installer_approved_at",
      "installationApprovedAt",
      "installation_approved_at",
      "installationCompletedAt",
      "installation_completed_at",
    ),
    quotation?.installationReleasedAt,
    readQuotationField(quotation, "installation_released_at"),
    statusHistoryAt(
      quotation,
      (s) =>
        s === "installer_approved" ||
        s === "pending_metering" ||
        s.includes("installer_approved"),
    ),
  )

  const metering = firstTruthyIso(
    quotation?.meteringApprovedAt,
    readQuotationField(
      quotation,
      "metering_approved_at",
      "meteringCompletedAt",
      "metering_completed_at",
    ),
    quotation?.mcoAt,
    readQuotationField(quotation, "mco_at", "mcoAt"),
    statusHistoryAt(
      quotation,
      (s) =>
        s === "metering_approved" ||
        s === "mco" ||
        s === "pending_baldev" ||
        s.includes("metering_approved"),
    ),
  )

  const finalConfirmation = firstTruthyIso(
    readQuotationField(
      quotation,
      "baldevApprovedAt",
      "baldev_approved_at",
      "finalConfirmationAt",
      "final_confirmation_at",
      "completedAt",
      "completed_at",
    ),
    statusHistoryAt(
      quotation,
      (s) => s === "baldev_approved" || s === "completed" || s.includes("baldev_approved"),
    ),
  )

  return {
    ...(calling.callingData !== "pending" && callingShared
      ? { callingData: callingData || callingShared }
      : {}),
    ...(calling.callingAction !== "pending" && callingShared
      ? { callingAction: callingAction || callingShared }
      : {}),
    ...(quotationDate ? { quotation: quotationDate } : {}),
    ...(adminApproval ? { adminApproval } : {}),
    ...(installation ? { installation } : {}),
    ...(metering ? { metering } : {}),
    ...(finalConfirmation ? { finalConfirmation } : {}),
  }
}

/** Display date+time for journey stage chips (local), e.g. "24 Aug 2026, 06:06 pm". */
export function formatJourneyStageDateTime(value?: string | null): string {
  const d = parseToValidDate(value)
  if (!d) return "—"
  const datePart = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
  const timePart = d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
  return `${datePart}, ${timePart}`
}

/** True when any action is a real call that connected and marked interested. */
function hasCalledConnectedInterested(actions: JourneyCallingAction[]): boolean {
  return actions.some((item) => {
    const action = String(item.action || "")
      .toLowerCase()
      .trim()
    if (action === "start") return false
    if (classifyCallingConnection(item) !== "connected") return false
    return classifyCallingActionSummaryBucket(item) === "interested"
  })
}

/** True when dealer actually connected with the customer (not unanswered / start-only). */
function hasConnectedCallingAction(actions: JourneyCallingAction[]): boolean {
  return actions.some((item) => {
    const action = String(item.action || "")
      .toLowerCase()
      .trim()
    if (action === "start") return false
    return classifyCallingConnection(item) === "connected"
  })
}

function callingStagesFromActions(actions: JourneyCallingAction[]): {
  callingData: JourneyStageStatus
  callingAction: JourneyStageStatus
} {
  if (actions.length === 0) {
    return { callingData: "pending", callingAction: "pending" }
  }

  // Green Interested only when called + connected + interested.
  if (hasCalledConnectedInterested(actions)) {
    return { callingData: "completed", callingAction: "completed" }
  }

  // Any call history but never connected → stay Pending (walk-in / quotation-only path).
  if (!hasConnectedCallingAction(actions)) {
    return { callingData: "pending", callingAction: "pending" }
  }

  const latest = [...actions]
    .filter((item) => {
      const action = String(item.action || "")
        .toLowerCase()
        .trim()
      if (action === "start") return false
      return classifyCallingConnection(item) === "connected"
    })
    .sort((a, b) => new Date(b.actionAt || 0).getTime() - new Date(a.actionAt || 0).getTime())[0]

  if (!latest) {
    return { callingData: "pending", callingAction: "pending" }
  }

  const action = String(latest.action || "")
    .toLowerCase()
    .trim()
  const bucket = classifyCallingActionSummaryBucket(latest)

  if (bucket === "followUp" || action === "follow_up" || action === "rescheduled") {
    return { callingData: "completed", callingAction: "in_progress" }
  }

  // Connected call recorded but not marked interested yet.
  return { callingData: "completed", callingAction: "in_progress" }
}

function buildTimeline(
  actions: JourneyCallingAction[],
  quotation?: Quotation,
): JourneyTimelineEvent[] {
  const events: JourneyTimelineEvent[] = []

  for (const action of actions) {
    const at = safeIso(action.actionAt)
    if (!at) continue
    events.push({
      id: `call-${action.id}`,
      at,
      label: formatActionLabel(action),
      detail: [action.callRemark, action.nextFollowUpAt ? `Follow-up: ${action.nextFollowUpAt}` : ""]
        .filter(Boolean)
        .join(" · ") || undefined,
      source: "calling",
    })
  }

  if (quotation) {
    const created = safeIso(quotation.createdAt)
    if (created) {
      events.push({
        id: `q-created-${quotation.id}`,
        at: created,
        label: "Quotation created",
        detail: quotation.id,
        source: "quotation",
      })
    }

    const history = Array.isArray(quotation.statusHistory) ? quotation.statusHistory : []
    for (let i = 0; i < history.length; i++) {
      const entry = history[i] as { status?: string; at?: string }
      const at = safeIso(entry?.at)
      if (!at) continue
      events.push({
        id: `q-status-${quotation.id}-${i}`,
        at,
        label: `Quotation status: ${String(entry.status || "").replace(/_/g, " ")}`,
        source: "quotation",
      })
    }

    const fileLoginAt = safeIso(
      quotation.fileLoginAt || ((quotation as unknown as Record<string, unknown>).file_login_at as string),
    )
    if (fileLoginAt) {
      events.push({
        id: `q-filelogin-${quotation.id}`,
        at: fileLoginAt,
        label: `File login: ${getJourneyFileLoginLabel(quotation)}`,
        source: "ops",
      })
    }

    const progress = getJourneyStageProgress(quotation)
    const hold = getJourneyHoldInfo(quotation)
    const filterDate = getJourneyFilterDate(quotation)
    if (filterDate && progress.finalConfirmation === "completed") {
      events.push({
        id: `q-final-${quotation.id}`,
        at: filterDate.toISOString(),
        label: "Final confirmation completed",
        detail: hold.stageLabel,
        source: "ops",
      })
    }
  }

  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
}

function stagesForRow(
  actions: JourneyCallingAction[],
  quotation?: Quotation,
): FullJourneyStageProgress {
  const calling = callingStagesFromActions(actions)
  if (!quotation) {
    return {
      callingData: calling.callingData,
      callingAction: calling.callingAction,
      quotation: "pending",
      adminApproval: "pending",
      installation: "pending",
      metering: "pending",
      finalConfirmation: "pending",
    }
  }

  const ops = getJourneyStageProgress(quotation)
  const status = String(quotation.status || "pending").toLowerCase()
  // Quotation file exists → Quotation stage is Completed (with created date).
  // Awaiting admin stays Pending on Admin Approval — not "In Progress" on Quotation.
  const quotationStage: JourneyStageStatus =
    status === "rejected" ? "pending" : "completed"

  return {
    callingData: calling.callingData,
    callingAction: calling.callingAction,
    quotation: quotationStage,
    adminApproval: ops.adminApproval,
    installation: ops.installation,
    metering: ops.metering,
    finalConfirmation: ops.finalConfirmation,
  }
}

function holdForRow(
  stages: FullJourneyStageProgress,
  quotation?: Quotation,
  latestAction?: JourneyCallingAction,
): { holder: string; stageLabel: string } {
  if (quotation) {
    const hold = getJourneyHoldInfo(quotation)
    const approvalStatus = String(quotation.status || "pending").toLowerCase()
    if (approvalStatus !== "approved") {
      return hold
    }
    if (hold.holder !== "Admin Approval") {
      return hold
    }
  }

  if (stages.callingAction === "in_progress") {
    const label = latestAction ? formatActionLabel(latestAction) : "Follow-up pending"
    return { holder: "Calling Action", stageLabel: label }
  }
  if (stages.callingData === "completed" && stages.callingAction === "completed" && !quotation) {
    return { holder: "Calling Action", stageLabel: latestAction ? formatActionLabel(latestAction) : "Call completed" }
  }
  if (stages.callingData === "pending") {
    return { holder: "Calling Data", stageLabel: "Awaiting call" }
  }
  return { holder: "Calling Data", stageLabel: "In calling queue" }
}

/**
 * Merge calling actions + quotations into one journey row per customer mobile
 * (and orphan quotations / actions without a pair).
 * Matching uses last-10 mobile digits and optional quotation↔lead id from backend.
 */
export function buildFullCustomerJourneyRows(input: {
  quotations: Quotation[]
  callingActions: JourneyCallingAction[]
}): FullCustomerJourneyRow[] {
  const actionsByMobile = new Map<string, JourneyCallingAction[]>()
  const actionsByLeadId = new Map<string, JourneyCallingAction[]>()

  const pushAction = (map: Map<string, JourneyCallingAction[]>, key: string, action: JourneyCallingAction) => {
    if (!key) return
    const list = map.get(key) || []
    list.push(action)
    map.set(key, list)
  }

  for (const action of input.callingActions) {
    const key = mobileKey(action.customerMobile)
    pushAction(actionsByMobile, key, action)
    const leadId = String(action.leadId || "").trim()
    if (leadId) pushAction(actionsByLeadId, leadId, action)
  }

  const quotationsByMobile = new Map<string, Quotation[]>()
  for (const quotation of input.quotations) {
    const key = mobileKey(quotation.customer?.mobile)
    if (!key) continue
    const list = quotationsByMobile.get(key) || []
    list.push(quotation)
    quotationsByMobile.set(key, list)
  }

  const allKeys = new Set([...actionsByMobile.keys(), ...quotationsByMobile.keys()])
  const rows: FullCustomerJourneyRow[] = []
  const usedActionIds = new Set<string>()

  const collectActionsForQuotation = (quotation: Quotation, mobile: string): JourneyCallingAction[] => {
    const byMobile = actionsByMobile.get(mobile) || []
    const leadId = readQuotationCallingLeadId(quotation as unknown as Record<string, unknown>)
    const byLead = leadId ? actionsByLeadId.get(leadId) || [] : []
    const merged = new Map<string, JourneyCallingAction>()

    const consider = (action: JourneyCallingAction) => {
      const leadMatch = Boolean(leadId && action.leadId && action.leadId === leadId)
      const mobileMatch =
        journeyMobilesMatch(action.customerMobile, quotation.customer?.mobile) ||
        journeyMobilesMatch(action.customerMobile, mobile)
      if (!leadMatch && !mobileMatch) return
      merged.set(action.id, action)
      usedActionIds.add(action.id)
    }

    for (const action of [...byMobile, ...byLead]) consider(action)
    if (merged.size === 0) {
      for (const action of input.callingActions) consider(action)
    } else {
      // Same customer: also attach actions whose last-10 mobile matches even if map key differed.
      for (const action of input.callingActions) {
        if (merged.has(action.id)) continue
        if (journeyMobilesMatch(action.customerMobile, quotation.customer?.mobile)) consider(action)
      }
    }

    return [...merged.values()].sort((a, b) => actionTimeMs(a.actionAt) - actionTimeMs(b.actionAt))
  }

  for (const key of allKeys) {
    const quotations = (quotationsByMobile.get(key) || []).sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
    )
    const quotation = quotations[0]
    const actions = quotation
      ? collectActionsForQuotation(quotation, key)
      : (actionsByMobile.get(key) || []).sort(
          (a, b) => new Date(a.actionAt || 0).getTime() - new Date(b.actionAt || 0).getTime(),
        )

    if (!quotation && actions.length === 0) continue

    for (const action of actions) usedActionIds.add(action.id)

    const latestAction = actions[actions.length - 1]
    const stages = stagesForRow(actions, quotation)
    const stageDates = resolveFullJourneyStageDates(actions, quotation)
    const hold = holdForRow(stages, quotation, latestAction)
    const timeline = buildTimeline(actions, quotation)
    const latestAt =
      timeline[timeline.length - 1]?.at ||
      safeIso(latestAction?.actionAt) ||
      safeIso(quotation?.createdAt) ||
      ""

    const customerName =
      formatPersonName(quotation?.customer?.firstName, quotation?.customer?.lastName, "") ||
      latestAction?.customerName ||
      "Unknown"
    const customerMobile = quotation?.customer?.mobile || latestAction?.customerMobile || key
    const leadId =
      latestAction?.leadId ||
      actions[0]?.leadId ||
      (quotation ? readQuotationCallingLeadId(quotation as unknown as Record<string, unknown>) : "") ||
      undefined

    rows.push({
      id: quotation?.id || `lead-${leadId || key}`,
      customerName,
      customerMobile,
      mobileKey: key,
      dealerName: latestAction?.dealerName,
      dealerId: latestAction?.dealerId || quotation?.dealerId,
      quotationId: quotation?.id,
      leadId,
      fileLoginLabel: quotation ? getJourneyFileLoginLabel(quotation) : undefined,
      holdLabel: hold.stageLabel,
      holdHolder: hold.holder,
      stages,
      stageDates,
      timeline,
      latestAt,
      callingActions: actions,
      quotation,
    })
  }

  // Orphan calling actions (no quotation mobile key collision handled above)
  const orphanByMobile = new Map<string, JourneyCallingAction[]>()
  for (const action of input.callingActions) {
    if (usedActionIds.has(action.id)) continue
    const key = mobileKey(action.customerMobile)
    if (!key) continue
    const list = orphanByMobile.get(key) || []
    list.push(action)
    orphanByMobile.set(key, list)
  }

  for (const [key, actionsRaw] of orphanByMobile) {
    if (rows.some((row) => row.mobileKey === key)) continue
    const actions = [...actionsRaw].sort(
      (a, b) => new Date(a.actionAt || 0).getTime() - new Date(b.actionAt || 0).getTime(),
    )
    const latestAction = actions[actions.length - 1]
    const stages = stagesForRow(actions, undefined)
    const stageDates = resolveFullJourneyStageDates(actions, undefined)
    const hold = holdForRow(stages, undefined, latestAction)
    const timeline = buildTimeline(actions, undefined)
    rows.push({
      id: `lead-${latestAction?.leadId || key}`,
      customerName: latestAction?.customerName || "Unknown",
      customerMobile: latestAction?.customerMobile || key,
      mobileKey: key,
      dealerName: latestAction?.dealerName,
      dealerId: latestAction?.dealerId,
      leadId: latestAction?.leadId || actions[0]?.leadId,
      holdLabel: hold.stageLabel,
      holdHolder: hold.holder,
      stages,
      stageDates,
      timeline,
      latestAt: timeline[timeline.length - 1]?.at || safeIso(latestAction?.actionAt) || "",
      callingActions: actions,
    })
  }

  return mergeSameCustomerJourneyRows(rows).sort(
    (a, b) => new Date(b.latestAt || 0).getTime() - new Date(a.latestAt || 0).getTime(),
  )
}

/** One row per customer (last-10 mobile / lead). Calling-only + quotation-only of the same person become a single journey. */
function mergeSameCustomerJourneyRows(rows: FullCustomerJourneyRow[]): FullCustomerJourneyRow[] {
  const byKey = new Map<string, FullCustomerJourneyRow>()
  const unmatched: FullCustomerJourneyRow[] = []

  const rowKey = (row: FullCustomerJourneyRow) => {
    const mobile = journeyMobileKey(row.customerMobile) || row.mobileKey
    if (mobile && mobile.length >= 8) return `m:${mobile.length >= 10 ? mobile.slice(-10) : mobile}`
    if (row.leadId) return `l:${row.leadId}`
    return ""
  }

  for (const row of rows) {
    const key = rowKey(row)
    if (!key) {
      unmatched.push(row)
      continue
    }
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, row)
      continue
    }
    const quotation = existing.quotation || row.quotation
    const actionMap = new Map<string, JourneyCallingAction>()
    for (const action of [...existing.callingActions, ...row.callingActions]) {
      actionMap.set(action.id, action)
    }
    const actions = [...actionMap.values()].sort((a, b) => actionTimeMs(a.actionAt) - actionTimeMs(b.actionAt))
    const latestAction = actions[actions.length - 1]
    const stages = stagesForRow(actions, quotation)
    const stageDates = resolveFullJourneyStageDates(actions, quotation)
    const hold = holdForRow(stages, quotation, latestAction)
    const timeline = buildTimeline(actions, quotation)
    byKey.set(key, {
      ...existing,
      ...row,
      id: quotation?.id || existing.id || row.id,
      customerName:
        formatPersonName(quotation?.customer?.firstName, quotation?.customer?.lastName, "") ||
        existing.customerName ||
        row.customerName,
      customerMobile: quotation?.customer?.mobile || existing.customerMobile || row.customerMobile,
      mobileKey: journeyMobileKey(quotation?.customer?.mobile || existing.customerMobile || row.customerMobile) || key,
      dealerName: latestAction?.dealerName || existing.dealerName || row.dealerName,
      dealerId: latestAction?.dealerId || quotation?.dealerId || existing.dealerId || row.dealerId,
      quotationId: quotation?.id || existing.quotationId || row.quotationId,
      leadId: latestAction?.leadId || actions[0]?.leadId || existing.leadId || row.leadId,
      fileLoginLabel: quotation ? getJourneyFileLoginLabel(quotation) : existing.fileLoginLabel || row.fileLoginLabel,
      holdLabel: hold.stageLabel,
      holdHolder: hold.holder,
      stages,
      stageDates,
      timeline,
      latestAt:
        timeline[timeline.length - 1]?.at ||
        safeIso(latestAction?.actionAt) ||
        safeIso(quotation?.createdAt) ||
        existing.latestAt,
      callingActions: actions,
      quotation,
    })
  }

  return [...byKey.values(), ...unmatched]
}

export function matchesFullJourneySearch(row: FullCustomerJourneyRow, searchTerm: string): boolean {
  const normalized = searchTerm.trim().toLowerCase()
  if (!normalized) return true

  const searchDigits = normalized.replace(/\D/g, "")
  if (searchDigits.length >= 7) {
    const rowMobile = journeyMobileKey(row.customerMobile)
    if (rowMobile && (rowMobile.includes(searchDigits.slice(-10)) || searchDigits.includes(rowMobile))) {
      return true
    }
    if (
      row.callingActions.some((action) => {
        const actionMobile = journeyMobileKey(action.customerMobile)
        return (
          Boolean(actionMobile) &&
          (actionMobile.includes(searchDigits.slice(-10)) || searchDigits.includes(actionMobile))
        )
      })
    ) {
      return true
    }
  }

  const tokens = [
    row.customerName,
    row.customerMobile,
    row.quotationId,
    row.leadId,
    row.dealerName,
    row.holdLabel,
    row.holdHolder,
    row.fileLoginLabel,
    ...Object.values(row.stages),
    ...row.timeline.map((e) => e.label),
    ...row.callingActions.flatMap((a) => [a.statusText, a.callRemark, a.action, a.leadId]),
  ]
  return tokens.some((t) => String(t || "").toLowerCase().includes(normalized))
}

export function matchesFullJourneyDateRange(
  row: FullCustomerJourneyRow,
  filter: JourneyDateRangeFilter,
  customFromYmd: string,
  customToYmd: string,
): boolean {
  if (filter === "all") return true
  if (row.quotation) {
    return matchesJourneyDateRangeFilter(row.quotation, filter, customFromYmd, customToYmd)
  }
  const bounds = getJourneyDateRangeBounds(filter, customFromYmd, customToYmd)
  if (!bounds) return false
  const d = row.latestAt ? new Date(row.latestAt) : null
  if (!d || Number.isNaN(d.getTime())) return false
  return d.getTime() >= bounds.start.getTime() && d.getTime() <= bounds.end.getTime()
}

export function formatFullJourneyStageLabel(
  status: JourneyStageStatus,
  stage: FullJourneyStageKey,
): string {
  // Calling Action green chip = called + connected + interested.
  if (stage === "callingAction" && status === "completed") return "Interested"
  if (stage === "callingData" && status === "completed") return "Completed"
  if (stage === "quotation" && status === "completed") return "Completed"
  // Customer Journey: waiting steps show "Pending" (not amber "In Progress").
  if (status === "pending" || status === "in_progress") return "Pending"
  if (stage === "adminApproval" || stage === "installation" || stage === "metering" || stage === "finalConfirmation") {
    return formatJourneyStageStatusLabel(
      status,
      stage === "adminApproval"
        ? "adminApproval"
        : stage === "installation"
          ? "installation"
          : stage === "metering"
            ? "metering"
            : "finalConfirmation",
    )
  }
  return formatJourneyStageStatusLabel(status)
}

export type JourneyCallingSourceFilter = "all" | "calling_data" | "not_calling_data"
export type JourneyConnectionFilter = "all" | "connected" | "not_connected"
export type JourneyOutcomeFilter = "all" | "interested" | "followUp" | "notInterested" | "others"

/** Rows that originated from Calling Data (have at least one calling action / lead). */
export function rowHasCallingData(row: FullCustomerJourneyRow): boolean {
  return row.callingActions.length > 0 || Boolean(row.leadId)
}

export function getRowLatestCallingAction(row: FullCustomerJourneyRow): JourneyCallingAction | undefined {
  if (row.callingActions.length === 0) return undefined
  return [...row.callingActions].sort(
    (a, b) => new Date(b.actionAt || 0).getTime() - new Date(a.actionAt || 0).getTime(),
  )[0]
}

/**
 * Quotation mobiles whose journey still shows Calling Data/Action as pending.
 * Used to backfill call history on normal (non-search) load — bulk calling-actions
 * often omit older rows or mobile, while per-mobile search returns them.
 */
export function mobilesNeedingCallingEnrichment(
  quotations: Quotation[],
  callingActions: JourneyCallingAction[],
  limit = 80,
): string[] {
  const knownMobiles = new Set(
    callingActions.map((action) => journeyMobileKey(action.customerMobile)).filter((m) => m.length >= 8),
  )
  const knownLeadIds = new Set(callingActions.map((action) => String(action.leadId || "").trim()).filter(Boolean))
  const missing: string[] = []
  const seen = new Set<string>()
  for (const quotation of quotations) {
    const leadId = readQuotationCallingLeadId(quotation as unknown as Record<string, unknown>)
    if (leadId && knownLeadIds.has(leadId)) continue
    const mobile = journeyMobileKey(quotation.customer?.mobile)
    if (!mobile || mobile.length < 8 || seen.has(mobile) || knownMobiles.has(mobile)) continue
    seen.add(mobile)
    missing.push(mobile)
    if (missing.length >= limit) break
  }
  return missing
}

export function matchesJourneyCallingSourceFilter(
  row: FullCustomerJourneyRow,
  filter: JourneyCallingSourceFilter,
): boolean {
  if (filter === "all") return true
  const hasCalling = rowHasCallingData(row)
  if (filter === "calling_data") return hasCalling
  return !hasCalling
}

export function matchesJourneyConnectionFilter(
  row: FullCustomerJourneyRow,
  filter: JourneyConnectionFilter,
): boolean {
  if (filter === "all") return true
  const latest = getRowLatestCallingAction(row)
  if (!latest) return false
  return classifyCallingConnection(latest) === filter
}

export function matchesJourneyOutcomeFilter(
  row: FullCustomerJourneyRow,
  filter: JourneyOutcomeFilter,
): boolean {
  if (filter === "all") return true
  const latest = getRowLatestCallingAction(row)
  if (!latest) return false
  return classifyCallingActionSummaryBucket(latest) === filter
}

/** Filter journey rows by assigned dealer id (`all` = no filter). */
export function matchesJourneyDealerFilter(
  row: FullCustomerJourneyRow,
  dealerId: string,
): boolean {
  if (!dealerId || dealerId === "all") return true
  if (row.dealerId && row.dealerId === dealerId) return true
  if (row.quotation?.dealerId && row.quotation.dealerId === dealerId) return true
  return row.callingActions.some((action) => action.dealerId === dealerId)
}
