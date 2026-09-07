// @ts-nocheck
/**
 * =============================================================================
 * BACKEND — Google Sheets → HR Social Media Leads (Meta / IG / FB exports)
 * =============================================================================
 *
 * Spreadsheet (production):
 *   https://docs.google.com/spreadsheets/d/18zqPIpa3fcjRvfNqdm3FPC10bszPIPHbv5F3-TMk0A0
 *
 * Each tab (e.g. Ajmer_Leads, Jaipur_Leads) becomes an HR panel sub-tab when enabled.
 * Sync reads new rows, stores in DB, runs same round-robin allocator as CSV upload.
 *
 * Frontend:
 *   - HR → Social Media tab
 *   - lib/google-sheets-social-leads.ts
 *   - lib/api.ts → api.hr.sheetSources.*
 *
 * Security:
 *   - NEVER commit service account JSON to git.
 *   - Share spreadsheet with service account email (Editor).
 *   - Env: GOOGLE_SERVICE_ACCOUNT_JSON (stringified) OR GOOGLE_APPLICATION_CREDENTIALS path.
 *
 * =============================================================================
 */

import { google } from "googleapis"

const DEFAULT_SPREADSHEET_ID = "18zqPIpa3fcjRvfNqdm3FPC10bszPIPHbv5F3-TMk0A0"

// -----------------------------------------------------------------------------
// DB tables (suggested)
// -----------------------------------------------------------------------------

/**
 * hr_sheet_sources
 *   id UUID PK
 *   spreadsheet_id VARCHAR
 *   sheet_tab_name VARCHAR          -- e.g. Ajmer_Leads
 *   display_name VARCHAR
 *   enabled BOOLEAN DEFAULT false
 *   dealer_ids JSONB                -- pool for round-robin
 *   active_limit_per_dealer INT DEFAULT 1
 *   last_synced_row INT DEFAULT 1     -- 1-based sheet row after header
 *   last_synced_at TIMESTAMPTZ
 *   last_sync_status VARCHAR
 *   last_sync_error TEXT
 *   upload_id UUID NULL               -- latest hr_lead_uploads batch for this tab
 *   created_at, updated_at
 *
 * hr_social_leads (extends hr_leads OR JSONB on hr_leads)
 *   id UUID PK
 *   upload_id UUID FK hr_lead_uploads
 *   sheet_source_id UUID FK hr_sheet_sources
 *   external_id VARCHAR             -- Meta lead id column (l:…)
 *   sheet_row_index INT
 *   platform, campaign_name, ad_name, lead_status
 *   remarks, remarks_2, kw
 *   assigned_person_name            -- NAME column in sheet (ops assignee label)
 *   first_call_response, second_call_response
 *   login_flag BOOLEAN
 *   final_decision, final_decision_reason
 *   created_time TIMESTAMPTZ
 *   raw_json JSONB
 *   -- plus standard hr_leads: name, mobile, address, city, assigned_dealer_id, status
 *
 * Reuse hr_lead_uploads with:
 *   source_type = 'google_sheet'
 *   source_sheet_tab = 'Ajmer_Leads'
 *   file_name = 'Google Sheet: Ajmer_Leads'
 */

// -----------------------------------------------------------------------------
// SQL migration (run once)
// -----------------------------------------------------------------------------

/*
-- PostgreSQL example

CREATE TABLE IF NOT EXISTS hr_sheet_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spreadsheet_id VARCHAR(128) NOT NULL,
  sheet_tab_name VARCHAR(128) NOT NULL,
  display_name VARCHAR(256) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  dealer_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  active_limit_per_dealer INT NOT NULL DEFAULT 1,
  last_synced_row INT NOT NULL DEFAULT 1,
  last_synced_at TIMESTAMPTZ,
  last_sync_status VARCHAR(32),
  last_sync_error TEXT,
  upload_id UUID REFERENCES hr_lead_uploads(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (spreadsheet_id, sheet_tab_name)
);

ALTER TABLE hr_lead_uploads
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(32) DEFAULT 'csv',
  ADD COLUMN IF NOT EXISTS source_sheet_tab VARCHAR(128);

ALTER TABLE hr_leads
  ADD COLUMN IF NOT EXISTS sheet_source_id UUID REFERENCES hr_sheet_sources(id),
  ADD COLUMN IF NOT EXISTS external_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS sheet_row_index INT,
  ADD COLUMN IF NOT EXISTS platform VARCHAR(64),
  ADD COLUMN IF NOT EXISTS campaign_name VARCHAR(256),
  ADD COLUMN IF NOT EXISTS ad_name VARCHAR(256),
  ADD COLUMN IF NOT EXISTS lead_status VARCHAR(64),
  ADD COLUMN IF NOT EXISTS remarks TEXT,
  ADD COLUMN IF NOT EXISTS remarks_2 TEXT,
  ADD COLUMN IF NOT EXISTS kw VARCHAR(32),
  ADD COLUMN IF NOT EXISTS assigned_person_name VARCHAR(128),
  ADD COLUMN IF NOT EXISTS first_call_response TEXT,
  ADD COLUMN IF NOT EXISTS second_call_response TEXT,
  ADD COLUMN IF NOT EXISTS login_flag BOOLEAN,
  ADD COLUMN IF NOT EXISTS final_decision VARCHAR(128),
  ADD COLUMN IF NOT EXISTS final_decision_reason TEXT,
  ADD COLUMN IF NOT EXISTS created_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS raw_json JSONB;

CREATE INDEX IF NOT EXISTS idx_hr_leads_sheet_source ON hr_leads(sheet_source_id);
CREATE INDEX IF NOT EXISTS idx_hr_leads_upload_mobile ON hr_leads(upload_id, mobile);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_leads_sheet_external
  ON hr_leads(sheet_source_id, external_id)
  WHERE external_id IS NOT NULL AND external_id <> '';
*/

// -----------------------------------------------------------------------------
// Helpers — upload batch + API row shape
// -----------------------------------------------------------------------------

function mapSheetSourceForApi(row, counts) {
  return {
    id: row.id,
    spreadsheetId: row.spreadsheet_id,
    sheetTabName: row.sheet_tab_name,
    displayName: row.display_name,
    enabled: row.enabled,
    dealerIds: asArray(row.dealer_ids),
    activeLimitPerDealer: row.active_limit_per_dealer ?? 1,
    lastSyncedAt: row.last_synced_at,
    lastSyncStatus: row.last_sync_status,
    lastSyncError: row.last_sync_error,
    uploadId: row.upload_id,
    rowCount: counts?.rowCount ?? 0,
    assignedCount: counts?.assignedCount ?? 0,
    unassignedCount: counts?.unassignedCount ?? 0,
    completedCount: counts?.completedCount ?? 0,
  }
}

function mapSocialLeadForApi(r, dealerNameById) {
  const assignedDealerId = normalizeAssigneeId(r.assigned_dealer_id) || null
  const status = r.status || "queued"
  return {
    id: r.id,
    externalId: r.external_id,
    name: r.name,
    mobile: r.mobile,
    address: r.address,
    city: r.city,
    customerNote: r.customer_note,
    platform: r.platform,
    campaignName: r.campaign_name,
    adName: r.ad_name,
    leadStatus: r.lead_status,
    remarks: r.remarks,
    remarks2: r.remarks_2,
    kw: r.kw,
    assignedPersonName: r.assigned_person_name,
    firstCallResponse: r.first_call_response,
    secondCallResponse: r.second_call_response,
    loginFlag: r.login_flag,
    finalDecision: r.final_decision,
    finalDecisionReason: r.final_decision_reason,
    createdTime: r.created_time,
    assignedDealerId,
    assignedDealerName: assignedDealerId ? dealerNameById?.[assignedDealerId] || null : null,
    assignmentStatus: status,
    status,
    sourceTab: r.source_sheet_tab,
    raw: r.raw_json,
  }
}

async function createOrGetSheetUploadBatch(sourceRow, db) {
  if (sourceRow.upload_id) {
    const existing = await db.hrLeadUploads.findByPk(sourceRow.upload_id)
    if (existing) return existing
  }

  const tab = sourceRow.sheet_tab_name
  const upload = await db.hrLeadUploads.create({
    file_name: `Google Sheet: ${tab}`,
    source_type: "google_sheet",
    source_sheet_tab: tab,
    uploaded_by: null,
    uploaded_at: new Date(),
    row_count: 0,
    dealer_ids: asArray(sourceRow.dealer_ids),
  })

  await sourceRow.update({ upload_id: upload.id })
  return upload
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : [value]
    } catch {
      return [value]
    }
  }
  return []
}

function normalizeAssigneeId(value) {
  const id = String(value ?? "").trim()
  if (!id) return ""
  const lower = id.toLowerCase()
  if (["unassigned", "null", "none", "-", "na", "n/a"].includes(lower)) return ""
  return id
}

// Import from BACKEND_ASSIGN_UNASSIGNED.ts / BACKEND_ADMIN_QUOTATION_STATUS.ts:
//   assignUnassignedWithActiveCap(uploadId, { dealerIds, activeLimitPerDealer })
//   computeHrUploadLeadCounts(leads)


function getSheetsClient() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (json) {
    const credentials = JSON.parse(json)
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    })
    return google.sheets({ version: "v4", auth })
  }
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
  return google.sheets({ version: "v4", auth })
}

// -----------------------------------------------------------------------------
// Column mapping (Meta export headers)
// -----------------------------------------------------------------------------

/**
 * Meta Lead Form export headers (live tabs e.g. Ajmer Solar Lead Form New):
 *   id, created_time, ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name,
 *   form_id, form_name, is_organic, platform, full_name, phone_number, lead_status
 *
 * REQUIRED for import / status / assign:
 *   phone_number → mobile (last 10 digits) — skip row if invalid
 *   id           → external_id (dedupe)
 *   full_name    → name
 *   lead_status  → lead_status (CREATED = New; else Pending until final_decision)
 *
 * ASSIGN dealers from hr_sheet_sources.dealer_ids (NOT from sheet columns).
 *
 * IGNORE for mapping (optional raw_json only): ad_id, adset_id, adset_name, campaign_id, form_id, is_organic
 * OPTIONAL display: platform, campaign_name, ad_name, form_name, created_time
 * OPTIONAL status outcomes (other tabs): Final Decison, Reason of Final Decision, Remarks, KW, address
 */
export const SOCIAL_SHEET_COLUMN_MAP = {
  externalId: ["id"],
  createdTime: ["created_time"],
  platform: ["platform"],
  fullName: ["full_name", "name"],
  mobile: ["phone_number", "phone", "mobile"],
  streetAddress: ["street_address", "address"],
  postCode: ["post_code", "postcode"],
  leadStatus: ["lead_status"],
  remarks: ["remarks"],
  remarks2: ["remarks 2", "remarks2"],
  kw: ["kw"],
  assignedPersonName: ["name"], // second NAME column in sheet — disambiguate by index in mapper
  firstCallResponse: ["1st call response", "1stcallresponse"],
  secondCallResponse: ["2nd call response", "2ndcallresponse"],
  login: ["login"],
  finalDecision: ["final decison", "final decision"],
  finalDecisionReason: ["reason of final decision"],
  adName: ["ad_name"],
  campaignName: ["campaign_name"],
  formName: ["form_name"],
}

function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

function normalizeMobile(value) {
  const digits = String(value || "").replace(/\D/g, "")
  return digits.length > 10 ? digits.slice(-10) : digits
}

function rowToLeadObject(headers, values) {
  const raw = {}
  headers.forEach((h, i) => {
    raw[normalizeHeader(h)] = String(values[i] ?? "").trim()
  })
  const mobile = normalizeMobile(
    raw[normalizeHeader("phone_number")] || raw[normalizeHeader("phone")] || raw[normalizeHeader("mobile")],
  )
  if (mobile.length !== 10) return null

  return {
    externalId: raw[normalizeHeader("id")] || null,
    name: raw[normalizeHeader("full_name")] || raw[normalizeHeader("name")] || "",
    mobile,
    address: [raw[normalizeHeader("street_address")], raw[normalizeHeader("post_code")]]
      .filter(Boolean)
      .join(", "),
    platform: raw[normalizeHeader("platform")] || "",
    campaignName: raw[normalizeHeader("campaign_name")] || "",
    adName: raw[normalizeHeader("ad_name")] || "",
    leadStatus: raw[normalizeHeader("lead_status")] || "",
    remarks: raw[normalizeHeader("remarks")] || "",
    remarks2: raw[normalizeHeader("remarks2")] || "",
    kw: raw[normalizeHeader("kw")] || "",
    firstCallResponse: raw[normalizeHeader("1stcallresponse")] || "",
    secondCallResponse: raw[normalizeHeader("2ndcallresponse")] || "",
    loginFlag: String(raw[normalizeHeader("login")] || "").toLowerCase() === "true",
    finalDecision: raw[normalizeHeader("finaldecison")] || raw[normalizeHeader("finaldecision")] || "",
    finalDecisionReason: raw[normalizeHeader("reasonoffinaldecision")] || "",
    createdTime: raw[normalizeHeader("created_time")] || null,
    raw,
  }
}

// -----------------------------------------------------------------------------
// Sync one tab
// -----------------------------------------------------------------------------

export async function syncSheetTabSource(sourceRow, { assignLeads = true, db } = {}) {
  const sheets = getSheetsClient()
  const spreadsheetId = sourceRow.spreadsheet_id || DEFAULT_SPREADSHEET_ID
  const tab = sourceRow.sheet_tab_name
  const startRow = Number(sourceRow.last_synced_row || 1)

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tab}'`,
  })

  const rows = response.data.values || []
  if (rows.length < 2) {
    return { imported: 0, skipped: 0, message: "No data rows" }
  }

  const headers = rows[0]
  const dataRows = rows.slice(Math.max(1, startRow - 1))
  const leads = []
  let skipped = 0

  for (let i = 0; i < dataRows.length; i++) {
    const mapped = rowToLeadObject(headers, dataRows[i])
    if (!mapped) {
      skipped += 1
      continue
    }
    leads.push({
      ...mapped,
      sheetRowIndex: startRow + i,
    })
  }

  // Dedupe by mobile + external_id within upload
  const upload = await createOrGetSheetUploadBatch(sourceRow, db)
  let imported = 0

  for (const lead of leads) {
    const exists = await HrLead.findOne({
      where: {
        upload_id: upload.id,
        mobile: lead.mobile,
      },
    })
    if (exists) {
      skipped += 1
      continue
    }

    await HrLead.create({
      upload_id: upload.id,
      sheet_source_id: sourceRow.id,
      external_id: lead.externalId,
      sheet_row_index: lead.sheetRowIndex,
      name: lead.name,
      mobile: lead.mobile,
      address: lead.address,
      customer_note: [lead.campaignName, lead.adName].filter(Boolean).join(" · "),
      platform: lead.platform,
      lead_status: lead.leadStatus,
      remarks: lead.remarks,
      remarks_2: lead.remarks2,
      kw: lead.kw,
      first_call_response: lead.firstCallResponse,
      second_call_response: lead.secondCallResponse,
      login_flag: lead.loginFlag,
      final_decision: lead.finalDecision,
      final_decision_reason: lead.finalDecisionReason,
      created_time: lead.createdTime,
      raw_json: lead.raw,
      status: "queued",
    })
    imported += 1
  }

  await sourceRow.update({
    last_synced_row: rows.length,
    last_synced_at: new Date(),
    last_sync_status: "ok",
    last_sync_error: null,
    upload_id: upload.id,
  })

  if (assignLeads && sourceRow.enabled && sourceRow.dealer_ids?.length) {
    await assignUnassignedWithActiveCap(upload.id, {
      dealerIds: sourceRow.dealer_ids,
      activeLimitPerDealer: sourceRow.active_limit_per_dealer || 1,
    })
  }

  emitSocket("calling:uploads-updated")

  return { imported, skipped, uploadId: upload.id }
}

// -----------------------------------------------------------------------------
// API routes
// -----------------------------------------------------------------------------

/**
 * GET /api/hr/sheet-sources
 * List configured tabs + counts + enabled flag.
 */
export async function listHrSheetSources(req, res) {
  const rows = await HrSheetSource.findAll({ order: [["sheet_tab_name", "ASC"]] })
  const sources = []
  for (const row of rows) {
    const leads = await HrLead.findAll({
      where: { sheet_source_id: row.id },
      attributes: ["status", "assigned_dealer_id"],
    })
    const counts = computeHrUploadLeadCounts(leads)
    sources.push(mapSheetSourceForApi(row, counts))
  }
  return res.json({ success: true, data: { sources }, sources })
}

/**
 * POST /api/hr/sheet-sources/discover
 * Body: { spreadsheetId }
 * Reads spreadsheet metadata → returns tab names for HR UI bootstrap.
 */
export async function discoverHrSheetTabs(req, res) {
  const spreadsheetId = req.body?.spreadsheetId || req.body?.spreadsheet_id || DEFAULT_SPREADSHEET_ID
  const sheets = getSheetsClient()
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const tabs = (meta.data.sheets || []).map((s) => s.properties?.title).filter(Boolean)

  // Upsert only tabs that exist in the live spreadsheet.
  const created = []
  for (const tab of tabs) {
    const [row] = await HrSheetSource.findOrCreate({
      where: { spreadsheet_id: spreadsheetId, sheet_tab_name: tab },
      defaults: {
        display_name: tab.replace(/_/g, " "),
        enabled: false,
        dealer_ids: [],
        active_limit_per_dealer: 1,
        last_synced_row: 1,
      },
    })
    // Keep display_name in sync with Google tab title.
    if (row.display_name !== tab.replace(/_/g, " ")) {
      await row.update({ display_name: tab.replace(/_/g, " ") })
    }
    created.push(row)
  }

  // Remove DB sources for tabs that were deleted/renamed in Google Sheets
  // so GET /hr/sheet-sources matches the spreadsheet 1:1.
  const existing = await HrSheetSource.findAll({ where: { spreadsheet_id: spreadsheetId } })
  const live = new Set(tabs)
  for (const row of existing) {
    if (!live.has(row.sheet_tab_name)) {
      await row.destroy()
    }
  }

  return res.json({
    success: true,
    data: { spreadsheetId, tabs, sources: created.map((r) => mapSheetSourceForApi(r)) },
    tabs,
    sources: created.map((r) => mapSheetSourceForApi(r)),
  })
}

/**
 * PATCH /api/hr/sheet-sources/:id
 * Body: { enabled, dealerIds, activeLimitPerDealer, displayName }
 */
export async function patchHrSheetSource(req, res) {
  const row = await HrSheetSource.findByPk(req.params.id)
  if (!row) return res.status(404).json({ success: false, error: { code: "RES_001" } })
  const body = req.body || {}
  await row.update({
    enabled: body.enabled ?? row.enabled,
    dealer_ids: body.dealerIds ?? body.dealer_ids ?? row.dealer_ids,
    active_limit_per_dealer: body.activeLimitPerDealer ?? body.active_limit_per_dealer ?? row.active_limit_per_dealer,
    display_name: body.displayName ?? body.display_name ?? row.display_name,
  })

  // Keep linked upload batch dealer pool in sync for assign-unassigned.
  if (row.upload_id && (body.dealerIds ?? body.dealer_ids)) {
    const upload = await HrLeadUpload.findByPk(row.upload_id)
    if (upload) {
      await upload.update({ dealer_ids: asArray(row.dealer_ids) })
    }
  }

  const leads = await HrLead.findAll({
    where: { sheet_source_id: row.id },
    attributes: ["status", "assigned_dealer_id"],
  })
  const counts = computeHrUploadLeadCounts(leads)
  return res.json({ success: true, data: mapSheetSourceForApi(row, counts) })
}

/**
 * POST /api/hr/sheet-sources/:id/sync
 * Pull new rows from Google Sheet → DB → optional round-robin assign.
 */
export async function postHrSheetSourceSync(req, res) {
  const row = await HrSheetSource.findByPk(req.params.id)
  if (!row) return res.status(404).json({ success: false, error: { code: "RES_001" } })
  try {
    const result = await syncSheetTabSource(row, { db: req.db })
    return res.json({ success: true, data: result })
  } catch (e) {
    await row.update({ last_sync_status: "error", last_sync_error: e.message })
    return res.status(500).json({ success: false, error: { message: e.message } })
  }
}

/**
 * POST /api/hr/sheet-sources/sync-all
 * Cron / ops: sync every **enabled** sheet source for the default spreadsheet.
 * Recommended schedule: every 15 minutes.
 * Emits `calling:uploads-updated` once at the end (and per syncSheetTabSource).
 *
 * Auth: HR JWT, or internal cron secret header `x-cron-secret` matching CRON_SECRET env.
 */
export async function postHrSheetSourcesSyncAll(req, res) {
  const cronSecret = process.env.CRON_SECRET
  const headerSecret = req.headers["x-cron-secret"]
  const isCron = cronSecret && headerSecret && String(headerSecret) === String(cronSecret)
  const isHr = Boolean(req.hr || req.user?.role === "hr" || req.user?.role === "admin")
  if (!isCron && !isHr) {
    return res.status(401).json({ success: false, error: { code: "AUTH_003", message: "HR or cron required" } })
  }

  const spreadsheetId =
    req.body?.spreadsheetId || req.body?.spreadsheet_id || process.env.GOOGLE_SHEETS_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID

  const sources = await HrSheetSource.findAll({
    where: { spreadsheet_id: spreadsheetId, enabled: true },
    order: [["sheet_tab_name", "ASC"]],
  })

  const results = []
  for (const row of sources) {
    try {
      const result = await syncSheetTabSource(row, { db: req.db })
      results.push({ id: row.id, sheetTabName: row.sheet_tab_name, ok: true, ...result })
    } catch (e) {
      await row.update({ last_sync_status: "error", last_sync_error: e.message })
      results.push({ id: row.id, sheetTabName: row.sheet_tab_name, ok: false, error: e.message })
    }
  }

  emitSocket("calling:uploads-updated", {
    reason: "sheet_auto_sync",
    spreadsheetId,
    syncedAt: new Date().toISOString(),
    count: results.length,
  })

  return res.json({
    success: true,
    data: {
      spreadsheetId,
      syncedAt: new Date().toISOString(),
      sources: results,
    },
  })
}

/**
 * Cron entry (node-cron / agenda / system crontab):
 *
 *   // every 15 minutes
 *   cron.schedule("*/15 * * * *", async () => {
 *     await fetch(`${API_BASE}/hr/sheet-sources/sync-all`, {
 *       method: "POST",
 *       headers: { "x-cron-secret": process.env.CRON_SECRET, "Content-Type": "application/json" },
 *       body: JSON.stringify({}),
 *     })
 *   })
 *
 * Do NOT use WebSockets to pull from Google Sheets — Sheets has no push to our socket.
 * Socket is only for notifying HR/dealer UIs AFTER the cron sync finishes.
 */

/**
 * GET /api/hr/sheet-sources/:id/leads?page&limit
 * Paginated leads for HR Social Media tab table (same shape as upload batch rows).
 */
export async function getHrSheetSourceLeads(req, res) {
  const row = await HrSheetSource.findByPk(req.params.id)
  if (!row) return res.status(404).json({ success: false, error: { code: "RES_001" } })
  const page = Math.max(1, Number(req.query.page || 1))
  const limit = Math.min(250, Math.max(1, Number(req.query.limit || 50)))
  const { rows, count } = await HrLead.findAndCountAll({
    where: { sheet_source_id: row.id },
    order: [["created_at", "DESC"]],
    offset: (page - 1) * limit,
    limit,
  })
  const dealerIds = [...new Set(rows.map((r) => r.assigned_dealer_id).filter(Boolean))]
  const dealers = dealerIds.length ? await Dealer.findAll({ where: { id: dealerIds } }) : []
  const dealerNameById = Object.fromEntries(dealers.map((d) => [d.id, d.name || d.full_name]))

  return res.json({
    success: true,
    data: {
      source: mapSheetSourceForApi(row),
      rows: rows.map((r) => mapSocialLeadForApi(r, dealerNameById)),
      leads: rows.map((r) => mapSocialLeadForApi(r, dealerNameById)),
      pagination: { page, limit, total: count },
    },
  })
}

/*
router.get("/hr/sheet-sources", authHr, listHrSheetSources)
router.post("/hr/sheet-sources/discover", authHr, discoverHrSheetTabs)
router.post("/hr/sheet-sources/sync-all", authHrOrCron, postHrSheetSourcesSyncAll) // BEFORE :id routes
router.patch("/hr/sheet-sources/:id", authHr, patchHrSheetSource)
router.post("/hr/sheet-sources/:id/sync", authHr, postHrSheetSourceSync)
router.get("/hr/sheet-sources/:id/leads", authHr, getHrSheetSourceLeads)

Cron (required for auto-sync — Google Sheets cannot push via socket):
  */15 * * * *  POST /hr/sheet-sources/sync-all  (header x-cron-secret)
  After each run emit calling:uploads-updated so HR/dealer UIs refresh.
*/

// -----------------------------------------------------------------------------
// QA
// -----------------------------------------------------------------------------
/*
1. Share spreadsheet with service account email (Editor).
2. POST discover → tabs include Ajmer_Leads.
3. PATCH source enabled=true, dealerIds=[…].
4. POST sync → imported N rows; hr_leads created; assigned via active_cap.
5. HR Social Media tab shows coloured status badges.
6. Dealer Calling Data queue receives assigned leads.
7. Re-sync skips duplicate mobiles.
*/
