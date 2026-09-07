/**
 * Meta / Google Sheets social-media lead columns → HR calling pipeline.
 * Backend sync: BACKEND_GOOGLE_SHEETS_SOCIAL_LEADS.ts
 */

export const DEFAULT_SOCIAL_LEADS_SPREADSHEET_ID = "18zqPIpa3fcjRvfNqdm3FPC10bszPIPHbv5F3-TMk0A0"

/** Default Meta sheet tabs — matches live spreadsheet until Discover returns the real list. */
export const DEFAULT_SOCIAL_SHEET_TAB_NAMES = [
  "Jaipur Leads",
  "Ajmer Leads",
  "Crompton Leads",
  "Ajmer Solar Lead Form New",
]

export const HR_SHEET_SOURCES_STORAGE_KEY = "hrSheetSourcesConfig"
export const HR_SHEET_DISCOVERED_TABS_STORAGE_KEY = "hrSheetDiscoveredTabs"

export type SocialMediaLeadSource = {
  id: string
  spreadsheetId: string
  sheetTabName: string
  /** UI tab label — usually same as sheetTabName (e.g. Ajmer_Leads). */
  displayName: string
  enabled: boolean
  dealerIds: string[]
  activeLimitPerDealer: number
  lastSyncedAt?: string
  lastSyncStatus?: "ok" | "error" | "pending"
  lastSyncError?: string
  rowCount?: number
  assignedCount?: number
  unassignedCount?: number
  completedCount?: number
  uploadId?: string
}

export type SocialMediaLeadRow = {
  id?: string
  externalId?: string
  name: string
  mobile: string
  altMobile?: string
  address?: string
  city?: string
  state?: string
  customerNote?: string
  kNumber?: string
  platform?: string
  campaignName?: string
  adName?: string
  leadStatus?: string
  remarks?: string
  remarks2?: string
  kw?: string
  assignedPersonName?: string
  firstCallResponse?: string
  secondCallResponse?: string
  loginFlag?: boolean | string
  finalDecision?: string
  finalDecisionReason?: string
  createdTime?: string
  assignedDealerId?: string
  assignedDealerName?: string
  assignmentStatus?: string
  sourceTab?: string
  raw: Record<string, string>
}

const normalizeHeaderKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "")

const getFromRaw = (raw: Record<string, string>, aliases: string[]) => {
  for (const alias of aliases) {
    const value = raw[normalizeHeaderKey(alias)]
    if (value) return value
  }
  return ""
}

export const normalizeSocialLeadMobile = (value: string) => {
  const digits = String(value || "").replace(/\D/g, "")
  if (digits.length <= 10) return digits
  return digits.slice(-10)
}

export const parseSocialLeadBoolean = (value: string) => {
  const v = String(value || "").trim().toLowerCase()
  if (!v) return false
  return v === "true" || v === "yes" || v === "1" || v === "y"
}

/** Map one spreadsheet row (header → value) to SocialMediaLeadRow. */
export function mapSocialSheetRowToLead(
  raw: Record<string, string>,
  sourceTab?: string,
): SocialMediaLeadRow | null {
  const mobile = normalizeSocialLeadMobile(
    getFromRaw(raw, ["phone_number", "phonenumber", "mobile", "contact", "contactno", "phone"]),
  )
  if (mobile.length !== 10) return null

  const name = getFromRaw(raw, ["full_name", "fullname", "name", "customername"])
  const street = getFromRaw(raw, ["street_address", "address", "street"])
  const postCode = getFromRaw(raw, ["post_code", "postcode", "pincode", "zip"])
  const address = [street, postCode].filter(Boolean).join(", ")

  const cityHint = getFromRaw(raw, [
    "आप_सोलर_कहाँ_लगवाना_चाहते_हैं?",
    "city",
    "location",
  ])

  return {
    externalId: getFromRaw(raw, ["id", "lead_id", "external_id"]),
    name,
    mobile,
    address,
    city: cityHint,
    platform: getFromRaw(raw, ["platform", "is_organic"]),
    campaignName: getFromRaw(raw, ["campaign_name", "campaign"]),
    adName: getFromRaw(raw, ["ad_name", "ad"]),
    leadStatus: getFromRaw(raw, ["lead_status", "status"]),
    remarks: getFromRaw(raw, ["remarks", "remark", "note"]),
    remarks2: getFromRaw(raw, ["remarks2", "remarks 2"]),
    kw: getFromRaw(raw, ["kw", "systemkw", "capacity"]),
    assignedPersonName: getFromRaw(raw, ["name", "assignedperson", "assigned_person"]),
    firstCallResponse: getFromRaw(raw, ["1stcallresponse", "firstcallresponse"]),
    secondCallResponse: getFromRaw(raw, ["2ndcallresponse", "secondcallresponse"]),
    loginFlag: parseSocialLeadBoolean(getFromRaw(raw, ["login", "filelogin"])),
    finalDecision: getFromRaw(raw, ["finaldecison", "finaldecision", "final decision"]),
    finalDecisionReason: getFromRaw(raw, ["reasonoffinaldecision", "reason of final decision"]),
    createdTime: getFromRaw(raw, ["created_time", "createdat", "created"]),
    assignedDealerId: getFromRaw(raw, ["assigneddealerid", "dealerid"]),
    assignedDealerName: getFromRaw(raw, ["assigneddealername", "dealername"]),
    assignmentStatus: getFromRaw(raw, ["assignmentstatus", "callstatus"]),
    customerNote: [
      getFromRaw(raw, ["adset_name"]),
      getFromRaw(raw, ["form_name"]),
      getFromRaw(raw, ["आपका_महीने_का_बिजली_बिल_कितना_आता_है?"]),
      getFromRaw(raw, ["आप_सोलर_सिस्टम_कब_लगवाना_चाहते_हैं?"]),
    ]
      .filter(Boolean)
      .join(" · "),
    sourceTab,
    raw,
  }
}

export type SocialLeadStatusBucket = "new" | "pending" | "not_interested" | "interested"

export type SocialLeadStatusDisplay = {
  label: string
  badgeClassName: string
  cardAccentClassName: string
  bucket: SocialLeadStatusBucket
}

/** Sheet lead_status + final decision → badge / card colours (match spreadsheet semantics). */
export function getSocialLeadStatusDisplay(row: SocialMediaLeadRow): SocialLeadStatusDisplay {
  const leadStatus = String(row.leadStatus || "").trim().toUpperCase()
  const final = String(row.finalDecision || "").trim().toLowerCase()
  const reason = String(row.finalDecisionReason || row.remarks || "").toLowerCase()

  if (final.includes("not interested") || reason.includes("not intrested") || reason.includes("not interested")) {
    return {
      label: "Not interested",
      badgeClassName: "border-rose-200 text-rose-900 bg-rose-50",
      cardAccentClassName: "border-l-rose-500",
      bucket: "not_interested",
    }
  }
  if (final.includes("interested") || reason.includes("office visit") || reason.includes("visit")) {
    return {
      label: "Interested / Visit",
      badgeClassName: "border-emerald-200 text-emerald-900 bg-emerald-50",
      cardAccentClassName: "border-l-emerald-500",
      bucket: "interested",
    }
  }
  if (leadStatus === "CREATED" || !leadStatus) {
    return {
      label: leadStatus || "New",
      badgeClassName: "border-sky-200 text-sky-900 bg-sky-50",
      cardAccentClassName: "border-l-sky-500",
      bucket: "new",
    }
  }
  if (leadStatus.includes("COMPLETE") || leadStatus.includes("DONE")) {
    return {
      label: leadStatus,
      badgeClassName: "border-emerald-200 text-emerald-800 bg-emerald-50",
      cardAccentClassName: "border-l-emerald-600",
      bucket: "interested",
    }
  }
  return {
    label: leadStatus,
    badgeClassName: "border-amber-200 text-amber-900 bg-amber-50",
    cardAccentClassName: "border-l-amber-500",
    bucket: "pending",
  }
}

export const SOCIAL_LEAD_STATUS_TABS: Array<{
  key: SocialLeadStatusBucket | "all"
  label: string
  activeClass: string
}> = [
  { key: "all", label: "All", activeClass: "border-foreground/30 bg-muted" },
  { key: "new", label: "New", activeClass: "border-sky-300 bg-sky-50 text-sky-900" },
  { key: "pending", label: "Pending", activeClass: "border-amber-300 bg-amber-50 text-amber-900" },
  {
    key: "not_interested",
    label: "Not interested",
    activeClass: "border-rose-300 bg-rose-50 text-rose-900",
  },
  {
    key: "interested",
    label: "Interested / Visit",
    activeClass: "border-emerald-300 bg-emerald-50 text-emerald-900",
  },
]

/** Full card surface classes for dealer Calling Data current-lead panel. */
export function getSocialLeadCardSurfaceClass(display: SocialLeadStatusDisplay): string {
  if (display.cardAccentClassName.includes("sky")) {
    return "border-sky-200/80 bg-gradient-to-b from-white to-sky-50/55 shadow-sm border-l-4 border-l-sky-500"
  }
  if (display.cardAccentClassName.includes("rose")) {
    return "border-rose-200/80 bg-gradient-to-b from-white to-rose-50/45 shadow-sm border-l-4 border-l-rose-500"
  }
  if (display.cardAccentClassName.includes("emerald")) {
    return "border-emerald-200/80 bg-gradient-to-b from-white to-emerald-50/45 shadow-sm border-l-4 border-l-emerald-500"
  }
  return "border-amber-200/80 bg-gradient-to-b from-white to-amber-50/45 shadow-sm border-l-4 border-l-amber-500"
}

export type SocialMediaCallingLeadLike = {
  sourceType?: string
  source_type?: string
  sheetSourceId?: string
  sheet_source_id?: string
  uploadFileName?: string
  upload_file_name?: string
  fileName?: string
  file_name?: string
  platform?: string
  leadStatus?: string
  lead_status?: string
  sheetLeadStatus?: string
  externalId?: string
  external_id?: string
  customerNote?: string
  campaignName?: string
  campaign_name?: string
  raw?: Record<string, string>
  raw_json?: Record<string, string>
}

/** True when lead came from Meta / Google Sheet sync (not plain CSV upload). */
export function isSocialMediaCallingLead(lead: SocialMediaCallingLeadLike | null | undefined): boolean {
  if (!lead) return false

  const sourceType = String(lead.sourceType || lead.source_type || "").toLowerCase()
  if (
    sourceType === "google_sheet" ||
    sourceType === "social_media" ||
    sourceType === "social" ||
    sourceType === "meta"
  ) {
    return true
  }

  const fileName = String(
    lead.uploadFileName ||
      lead.upload_file_name ||
      lead.fileName ||
      lead.file_name ||
      "",
  ).toLowerCase()
  if (fileName.includes("google sheet")) return true

  if (lead.sheetSourceId || lead.sheet_source_id) return true

  const externalId = String(lead.externalId || lead.external_id || "")
  if (externalId.startsWith("l:") || externalId.startsWith("ag:")) return true

  const platform = String(lead.platform || "").toLowerCase()
  if (platform === "ig" || platform === "fb" || platform === "facebook" || platform === "instagram") return true

  const sheetStatus = String(lead.sheetLeadStatus || lead.lead_status || lead.leadStatus || "").toUpperCase()
  if (sheetStatus === "CREATED") return true

  const raw = lead.raw || lead.raw_json
  if (raw && typeof raw === "object") {
    const keys = Object.keys(raw)
    if (keys.some((k) => k.includes("campaign") || k.includes("ad_name") || k.includes("phone_number"))) return true
  }

  const note = String(lead.customerNote || "").toLowerCase()
  if (note.includes("lead ad_") || note.includes("adset") || note.includes("form_name")) return true

  return false
}

export function callingLeadToSocialDisplayRow(lead: SocialMediaCallingLeadLike & {
  name?: string
  mobile?: string
  remarks?: string
  remarks2?: string
  remarks_2?: string
  kw?: string
  finalDecision?: string
  final_decision?: string
  finalDecisionReason?: string
  final_decision_reason?: string
  firstCallResponse?: string
  first_call_response?: string
  secondCallResponse?: string
  second_call_response?: string
  address?: string
}): SocialMediaLeadRow {
  return {
    name: String(lead.name || ""),
    mobile: String((lead as { mobile?: string }).mobile || ""),
    address: String(lead.address || ""),
    platform: String(lead.platform || ""),
    campaignName: String(lead.campaignName || lead.campaign_name || ""),
    leadStatus: String(lead.sheetLeadStatus || lead.lead_status || lead.leadStatus || ""),
    remarks: String(lead.remarks || ""),
    remarks2: String(lead.remarks2 || lead.remarks_2 || ""),
    kw: String(lead.kw || ""),
    finalDecision: String(lead.finalDecision || lead.final_decision || ""),
    finalDecisionReason: String(lead.finalDecisionReason || lead.final_decision_reason || ""),
    firstCallResponse: String(lead.firstCallResponse || lead.first_call_response || ""),
    secondCallResponse: String(lead.secondCallResponse || lead.second_call_response || ""),
    raw: (lead.raw || lead.raw_json || {}) as Record<string, string>,
  }
}

export function readHrSheetSourcesFromStorage(): SocialMediaLeadSource[] {
  if (typeof window === "undefined") return []
  try {
    const raw = JSON.parse(localStorage.getItem(HR_SHEET_SOURCES_STORAGE_KEY) || "[]")
    return Array.isArray(raw) ? (raw as SocialMediaLeadSource[]) : []
  } catch {
    return []
  }
}

export function writeHrSheetSourcesToStorage(sources: SocialMediaLeadSource[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(HR_SHEET_SOURCES_STORAGE_KEY, JSON.stringify(sources))
  } catch {
    // no-op
  }
}

export function readDiscoveredSheetTabsFromStorage(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = JSON.parse(localStorage.getItem(HR_SHEET_DISCOVERED_TABS_STORAGE_KEY) || "[]")
    return Array.isArray(raw) ? raw.map((t) => String(t || "").trim()).filter(Boolean) : []
  } catch {
    return []
  }
}

export function writeDiscoveredSheetTabsToStorage(tabs: string[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(
      HR_SHEET_DISCOVERED_TABS_STORAGE_KEY,
      JSON.stringify(tabs.map((t) => String(t || "").trim()).filter(Boolean)),
    )
  } catch {
    // no-op
  }
}

/** Prefer last Discover result so UI matches the live spreadsheet, not stale DB rows. */
export function filterSourcesToDiscoveredTabs(
  sources: SocialMediaLeadSource[],
  discoveredTabs?: string[],
): SocialMediaLeadSource[] {
  const tabs = discoveredTabs ?? readDiscoveredSheetTabsFromStorage()
  if (!tabs.length || !sources.length) return sources
  return reconcileSheetSourcesWithDiscoveredTabs(
    sources,
    tabs,
    sources[0]?.spreadsheetId || DEFAULT_SOCIAL_LEADS_SPREADSHEET_ID,
  )
}

export function defaultSheetSourcesForSpreadsheet(spreadsheetId: string): SocialMediaLeadSource[] {
  const base = spreadsheetId || DEFAULT_SOCIAL_LEADS_SPREADSHEET_ID
  return DEFAULT_SOCIAL_SHEET_TAB_NAMES.map((tab) => ({
    id: `local-${tab}`,
    spreadsheetId: base,
    sheetTabName: tab,
    displayName: tab.replace(/_/g, " "),
    enabled: tab === "Ajmer Leads" || tab === "Ajmer_Leads",
    dealerIds: [],
    activeLimitPerDealer: 1,
  }))
}

/** Backend not configured with Google service account yet (expected before .env is set). */
export function isGoogleSheetsCredentialsPendingError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: string }).message || "")
        : String(error || "")
  const lower = message.toLowerCase()
  return (
    lower.includes("google_service_account_json") ||
    lower.includes("google_application_credentials") ||
    (lower.includes("service account") && lower.includes("required")) ||
    lower.includes("google sheets credentials") ||
    lower.includes("sheets api") && lower.includes("credential")
  )
}

/** Normalize sheet tab names so "Ajmer_Leads" and "Ajmer Leads" match. */
export function normalizeSheetTabKey(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
}

/**
 * Keep existing enabled/dealer settings for tabs that still exist, but drop tabs
 * that are no longer in the spreadsheet. Discover must show the sheet 1:1.
 */
export function reconcileSheetSourcesWithDiscoveredTabs(
  existing: SocialMediaLeadSource[],
  discoveredTabs: string[],
  spreadsheetId: string,
): SocialMediaLeadSource[] {
  const existingByKey = new Map<string, SocialMediaLeadSource>()
  for (const source of existing) {
    existingByKey.set(normalizeSheetTabKey(source.sheetTabName), source)
  }

  return discoveredTabs
    .map((tab) => String(tab || "").trim())
    .filter(Boolean)
    .map((tab) => {
      const prev = existingByKey.get(normalizeSheetTabKey(tab))
      if (prev) {
        return {
          ...prev,
          spreadsheetId,
          sheetTabName: tab,
          displayName: tab.replace(/_/g, " "),
        }
      }
      return {
        id: `local-${tab}`,
        spreadsheetId,
        sheetTabName: tab,
        displayName: tab.replace(/_/g, " "),
        enabled: false,
        dealerIds: [],
        activeLimitPerDealer: 1,
      }
    })
}

/** @deprecated Prefer reconcileSheetSourcesWithDiscoveredTabs (replace, don't accumulate). */
export function mergeSheetSourcesWithTabs(
  existing: SocialMediaLeadSource[],
  discoveredTabs: string[],
  spreadsheetId: string,
): SocialMediaLeadSource[] {
  return reconcileSheetSourcesWithDiscoveredTabs(existing, discoveredTabs, spreadsheetId)
}

const pickArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    for (const key of ["sources", "sheetSources", "items", "tabs", "sheets", "data"]) {
      const nested = obj[key]
      if (Array.isArray(nested)) return nested
      if (nested && typeof nested === "object" && !Array.isArray(nested)) {
        const inner = nested as Record<string, unknown>
        for (const innerKey of ["sources", "sheetSources", "items", "tabs"]) {
          if (Array.isArray(inner[innerKey])) return inner[innerKey] as unknown[]
        }
      }
    }
  }
  return []
}

export function normalizeSheetSourceRow(raw: Record<string, unknown>): SocialMediaLeadSource {
  const sheetTabName = String(
    raw.sheetTabName || raw.sheet_tab_name || raw.tabName || raw.tab_name || raw.name || "",
  ).trim()
  const spreadsheetId = String(raw.spreadsheetId || raw.spreadsheet_id || DEFAULT_SOCIAL_LEADS_SPREADSHEET_ID)
  const dealerIdsRaw = raw.dealerIds || raw.dealer_ids
  const dealerIds = Array.isArray(dealerIdsRaw) ? dealerIdsRaw.map(String).filter(Boolean) : []

  return {
    id: String(raw.id || `local-${sheetTabName || "sheet"}`),
    spreadsheetId,
    sheetTabName,
    displayName: String(raw.displayName || raw.display_name || sheetTabName.replace(/_/g, " ")).trim(),
    enabled: raw.enabled === true || raw.is_enabled === true,
    dealerIds,
    activeLimitPerDealer: Number(raw.activeLimitPerDealer ?? raw.active_limit_per_dealer ?? 1) || 1,
    lastSyncedAt: raw.lastSyncedAt || raw.last_synced_at ? String(raw.lastSyncedAt || raw.last_synced_at) : undefined,
    lastSyncStatus: (raw.lastSyncStatus || raw.last_sync_status) as SocialMediaLeadSource["lastSyncStatus"],
    lastSyncError: raw.lastSyncError || raw.last_sync_error ? String(raw.lastSyncError || raw.last_sync_error) : undefined,
    rowCount: Number(raw.rowCount ?? raw.row_count ?? 0) || undefined,
    assignedCount: Number(raw.assignedCount ?? raw.assigned_count ?? 0) || undefined,
    unassignedCount: Number(raw.unassignedCount ?? raw.unassigned_count ?? 0) || undefined,
    completedCount: Number(raw.completedCount ?? raw.completed_count ?? 0) || undefined,
    uploadId: raw.uploadId || raw.upload_id ? String(raw.uploadId || raw.upload_id) : undefined,
  }
}

export function normalizeSheetSourcesResponse(response: unknown): SocialMediaLeadSource[] {
  const fromArray = pickArray(response)
    .map((item) => normalizeSheetSourceRow(item as Record<string, unknown>))
    .filter((s) => s.sheetTabName)

  if (fromArray.length > 0) return fromArray

  if (response && typeof response === "object") {
    const obj = response as Record<string, unknown>
    const single = obj.data ?? obj.source ?? obj.item
    if (single && typeof single === "object" && !Array.isArray(single)) {
      const row = normalizeSheetSourceRow(single as Record<string, unknown>)
      if (row.sheetTabName) return [row]
    }
    if (obj.sheetTabName || obj.sheet_tab_name) {
      const row = normalizeSheetSourceRow(obj)
      if (row.sheetTabName) return [row]
    }
  }

  return []
}

/** Match HR upload batch for a social sheet tab (Google Sheet sync or legacy naming). */
export function matchSocialSheetUploadBatch(
  batches: Array<Record<string, unknown>>,
  sheetTabName: string,
): Record<string, unknown> | null {
  const tab = sheetTabName.trim()
  const tabSpaced = tab.replace(/_/g, " ")
  const patterns = [
    tab.toLowerCase(),
    tabSpaced.toLowerCase(),
    `google sheet: ${tabSpaced.toLowerCase()}`,
    `google sheet: ${tab.toLowerCase()}`,
  ]

  for (const batch of batches) {
    const fileName = String(
      batch.fileName || batch.file_name || batch.originalFileName || batch.csvFileName || "",
    ).toLowerCase()
    const sourceTab = String(batch.sourceSheetTab || batch.source_sheet_tab || "").toLowerCase()
    const sourceType = String(batch.sourceType || batch.source_type || "").toLowerCase()
    if (sourceTab === tab.toLowerCase()) return batch
    if (
      sourceType === "google_sheet" &&
      (sourceTab === tab.toLowerCase() || patterns.some((p) => fileName.includes(p)))
    ) {
      return batch
    }
    if (patterns.some((p) => fileName.includes(p))) return batch
  }

  return null
}

export function mapHrUploadRowToSocialLead(
  row: Record<string, unknown>,
  sourceTab?: string,
): SocialMediaLeadRow {
  const nestedRaw = row.raw as Record<string, string> | undefined
  if (nestedRaw && typeof nestedRaw === "object") {
    const mapped = mapSocialSheetRowToLead(nestedRaw, sourceTab)
    if (mapped) {
      return {
        ...mapped,
        id: row.id ? String(row.id) : mapped.id,
        assignedDealerId: String(row.assignedDealerId || row.assigned_dealer_id || mapped.assignedDealerId || ""),
        assignedDealerName: String(
          row.assignedDealerName || row.assigned_dealer_name || mapped.assignedDealerName || "",
        ),
        assignmentStatus: String(row.assignmentStatus || row.status || mapped.assignmentStatus || ""),
      }
    }
  }
  return normalizeSocialLeadApiRow(row)
}

export function extractUploadRowsFromBatchResponse(response: unknown): Record<string, unknown>[] {
  if (!response || typeof response !== "object") return []
  const obj = response as Record<string, unknown>
  const nested =
    obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)
      ? (obj.data as Record<string, unknown>)
      : null

  for (const key of ["rows", "items", "leads"]) {
    const direct = obj[key]
    if (Array.isArray(direct)) return direct as Record<string, unknown>[]
    if (nested && Array.isArray(nested[key])) return nested[key] as Record<string, unknown>[]
  }

  return []
}

export function extractUploadBatchesList(response: unknown): Record<string, unknown>[] {
  if (!response) return []
  if (Array.isArray(response)) return response as Record<string, unknown>[]

  const root = response as Record<string, unknown>
  if (Array.isArray(root.uploads)) return root.uploads as Record<string, unknown>[]
  if (Array.isArray(root.batches)) return root.batches as Record<string, unknown>[]

  const nested = root.data
  if (Array.isArray(nested)) return nested as Record<string, unknown>[]
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const inner = nested as Record<string, unknown>
    for (const key of ["uploads", "batches", "items"]) {
      if (Array.isArray(inner[key])) return inner[key] as Record<string, unknown>[]
    }
  }

  return []
}

export function normalizeSocialLeadApiRow(raw: Record<string, unknown>): SocialMediaLeadRow {
  const nestedRaw = (raw.raw || raw.raw_json || raw.rawJson) as Record<string, string> | undefined
  const baseRaw: Record<string, string> =
    nestedRaw && typeof nestedRaw === "object" ? { ...nestedRaw } : {}

  const mapped =
    Object.keys(baseRaw).length > 0
      ? mapSocialSheetRowToLead(baseRaw, String(raw.sourceTab || raw.source_tab || ""))
      : null

  const mobile = normalizeSocialLeadMobile(
    String(raw.mobile || raw.phone_number || raw.phoneNumber || mapped?.mobile || ""),
  )

  return {
    id: raw.id ? String(raw.id) : undefined,
    externalId: String(raw.externalId || raw.external_id || mapped?.externalId || ""),
    name: String(raw.name || raw.full_name || raw.fullName || mapped?.name || ""),
    mobile,
    altMobile: raw.altMobile || raw.alt_mobile ? String(raw.altMobile || raw.alt_mobile) : undefined,
    address: String(raw.address || mapped?.address || ""),
    city: String(raw.city || mapped?.city || ""),
    state: raw.state ? String(raw.state) : undefined,
    customerNote: String(raw.customerNote || raw.customer_note || mapped?.customerNote || ""),
    kNumber: String(raw.kNumber || raw.k_number || raw.kw || mapped?.kw || ""),
    platform: String(raw.platform || mapped?.platform || ""),
    campaignName: String(raw.campaignName || raw.campaign_name || mapped?.campaignName || ""),
    adName: String(raw.adName || raw.ad_name || mapped?.adName || ""),
    leadStatus: String(raw.leadStatus || raw.lead_status || mapped?.leadStatus || ""),
    remarks: String(raw.remarks || mapped?.remarks || ""),
    remarks2: String(raw.remarks2 || raw.remarks_2 || mapped?.remarks2 || ""),
    kw: String(raw.kw || mapped?.kw || ""),
    assignedPersonName: String(
      raw.assignedPersonName || raw.assigned_person_name || mapped?.assignedPersonName || "",
    ),
    firstCallResponse: String(
      raw.firstCallResponse || raw.first_call_response || mapped?.firstCallResponse || "",
    ),
    secondCallResponse: String(
      raw.secondCallResponse || raw.second_call_response || mapped?.secondCallResponse || "",
    ),
    loginFlag:
      typeof raw.loginFlag === "boolean"
        ? raw.loginFlag
        : typeof raw.login_flag === "boolean"
          ? raw.login_flag
          : mapped?.loginFlag,
    finalDecision: String(raw.finalDecision || raw.final_decision || mapped?.finalDecision || ""),
    finalDecisionReason: String(
      raw.finalDecisionReason || raw.final_decision_reason || mapped?.finalDecisionReason || "",
    ),
    createdTime: String(raw.createdTime || raw.created_time || mapped?.createdTime || ""),
    assignedDealerId: String(raw.assignedDealerId || raw.assigned_dealer_id || mapped?.assignedDealerId || ""),
    assignedDealerName: String(
      raw.assignedDealerName || raw.assigned_dealer_name || mapped?.assignedDealerName || "",
    ),
    assignmentStatus: String(raw.assignmentStatus || raw.assignment_status || mapped?.assignmentStatus || ""),
    sourceTab: String(raw.sourceTab || raw.source_tab || mapped?.sourceTab || ""),
    raw: baseRaw,
  }
}

export function normalizeSocialLeadsResponse(response: unknown): SocialMediaLeadRow[] {
  const pickLeads = (value: unknown): unknown[] => {
    const base = pickArray(value)
    if (base.length > 0) return base
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>
      for (const key of ["leads", "rows", "items", "results"]) {
        if (Array.isArray(obj[key])) return obj[key] as unknown[]
      }
      const nested = obj.data
      if (nested && typeof nested === "object" && !Array.isArray(nested)) {
        const inner = nested as Record<string, unknown>
        for (const key of ["leads", "rows", "items", "results"]) {
          if (Array.isArray(inner[key])) return inner[key] as unknown[]
        }
      }
    }
    return []
  }

  return pickLeads(response)
    .map((item) => normalizeSocialLeadApiRow(item as Record<string, unknown>))
    .filter((row) => row.mobile || row.name)
}

export function normalizeDiscoverTabsResponse(response: unknown): string[] {
  const fromArray = pickArray(response)
    .map((item) => {
      if (typeof item === "string") return item.trim()
      if (item && typeof item === "object") {
        const row = item as Record<string, unknown>
        return String(row.sheetTabName || row.sheet_tab_name || row.name || row.title || "").trim()
      }
      return ""
    })
    .filter(Boolean)

  if (fromArray.length > 0) return fromArray

  if (response && typeof response === "object") {
    const obj = response as Record<string, unknown>
    const tabs = obj.tabs || obj.sheets || obj.sheetTabs
    if (Array.isArray(tabs)) {
      return tabs.map((t) => String(t).trim()).filter(Boolean)
    }
  }

  return []
}
