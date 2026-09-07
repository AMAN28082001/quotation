# Google Sheets — Social Media Leads (HR Panel)

**Spreadsheet:** `https://docs.google.com/spreadsheets/d/18zqPIpa3fcjRvfNqdm3FPC10bszPIPHbv5F3-TMk0A0`

**Reference implementation:** `BACKEND_GOOGLE_SHEETS_SOCIAL_LEADS.ts`  
**Frontend:** `lib/google-sheets-social-leads.ts`, `components/hr-social-media-sheets-panel.tsx`, HR → **Social Media** tab

---

## Security (read first)

1. **Never commit** the service account JSON to git or the frontend repo.
2. If credentials were shared in chat/email, **rotate the key** in Google Cloud Console.
3. Store credentials only on the **backend server**:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` — full JSON string in env, **or**
   - `GOOGLE_APPLICATION_CREDENTIALS` — path to JSON file
4. Share the spreadsheet with the service account email (`client_email` in JSON) as **Editor**.

---

## Product behaviour

| Feature | Detail |
|---------|--------|
| Sheet tabs | **Exactly** the Google Sheet bottom tabs (e.g. `Jaipur Leads`, `Ajmer Leads`, `Crompton Leads`, `Ajmer Solar Lead Form New`). Discover replaces stale tabs — does not keep old names like `302012 Leads`. |
| Toggle | When **ON**, dealer checkbox pool appears (same as CSV Assignment) |
| Sync | Pulls new rows from Google Sheet → database → round-robin assign (`active_cap`, default 1/dealer) |
| Colours | Lead cards use `lead_status`, remarks, final decision (sky=new, amber=pending, rose=not interested, green=visit/interested). SPA also has filter chips for these 4 buckets (client-side). |
| Calling | Assigned leads appear in **Calling Data** like CSV uploads |
| Dedupe | By mobile per sheet source / upload batch |

---

## Sheet columns (Meta export — live `Ajmer Solar Lead Form New`)

Example header row:

`id | created_time | ad_id | ad_name | adset_id | adset_name | campaign_id | campaign_name | form_id | form_name | is_organic | platform | full_name | phone_number | lead_status`

### Required for import + status + assign

| Sheet column | Example | Persist as | Notes |
|--------------|---------|------------|-------|
| `phone_number` | `p:+918955276223` | `mobile` | Strip non-digits → last **10**; skip row if not 10 digits |
| `id` | `l:2131847664877656` | `external_id` | Dedupe on re-sync |
| `full_name` | `Bhupender Kumar` | `name` | Customer display name |
| `lead_status` | `CREATED` | `lead_status` | UI: `CREATED` / empty → **New**; other values → **Pending** until final decision |

**Dealer assignment is NOT from the sheet.** Use `hr_sheet_sources.dealer_ids` + `active_limit_per_dealer` (round-robin) after sync. Do not invent assignees from Meta columns.

### Optional (status outcomes — when columns exist on other tabs)

| Sheet column | Persist as | UI bucket |
|--------------|------------|-----------|
| `Final Decison` / `final decision` | `final_decision` | Interested / Not interested |
| `Reason of Final Decision` | `final_decision_reason` | Visit / not-interested text |
| `Remarks`, `Remarks 2` | `remarks` / `remarks2` | Fallback for status text |
| `1st Call Response`, `2nd Call Response` | call notes | Display |
| `KW`, `street_address`, `post_code`, `NAME` | kw / address / sheet assignee | Display |

### Optional (display / note — keep if present)

| Sheet column | Persist as |
|--------------|------------|
| `platform` | `platform` (`ig` / `fb`) |
| `campaign_name` | `campaign_name` |
| `ad_name` | `ad_name` |
| `form_name` | note / metadata |
| `created_time` | `created_time` |

### Ignore (do not require for sync)

`ad_id`, `adset_id`, `adset_name`, `campaign_id`, `form_id`, `is_organic` — may store in `raw_json` only.

### API echo (SPA status chips need these)

On every lead in `GET /hr/sheet-sources/:id/leads` and upload batch rows:

`mobile`, `name`, `leadStatus` / `lead_status`, `finalDecision` / `final_decision`, `finalDecisionReason`, `remarks`, `platform`, `campaignName`, `adName`, `assignedDealerId`, `assignedDealerName`, `externalId`

---

## Database

### `hr_sheet_sources`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `spreadsheet_id` | string | Google spreadsheet ID |
| `sheet_tab_name` | string | e.g. `Ajmer_Leads` |
| `display_name` | string | UI label |
| `enabled` | boolean | Toggle in HR |
| `dealer_ids` | JSON array | Round-robin pool |
| `active_limit_per_dealer` | int | Default 1 |
| `last_synced_row` | int | 1-based row cursor after header |
| `last_synced_at` | timestamp | |
| `last_sync_status` | string | `ok` / `error` |
| `last_sync_error` | text | |
| `upload_id` | UUID | Latest `hr_lead_uploads` batch |

### Extend `hr_leads` (or `hr_social_leads`)

Add social fields + link `sheet_source_id`, `external_id`, `sheet_row_index`, `raw_json`.

Reuse `hr_lead_uploads` with `source_type = 'google_sheet'`, `file_name = 'Google Sheet: Ajmer_Leads'`.

---

## API endpoints

All paths are under your API prefix (e.g. `/api/hr/...`). Frontend calls without `/api` when `NEXT_PUBLIC_API_URL` already includes it.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/hr/sheet-sources` | List sources + counts |
| `POST` | `/hr/sheet-sources/discover` | `{ spreadsheetId }` → tab names + upsert rows; **delete** sources whose `sheet_tab_name` is no longer in the spreadsheet |
| `PATCH` | `/hr/sheet-sources/:id` | `{ enabled, dealerIds, activeLimitPerDealer }` |
| `POST` | `/hr/sheet-sources/:id/sync` | Pull sheet → DB → assign |
| `POST` | `/hr/sheet-sources/sync-all` | Cron/HR: sync all **enabled** tabs → assign → socket |
| `GET` | `/hr/sheet-sources/:id/leads` | Paginated rows for UI table |

**Auth:** `hr` role (same as CSV upload).

**Socket:** emit `calling:uploads-updated` after sync (HR + dealer queues refresh).

---

## Auto-sync every 15 minutes (recommended) + socket for UI

Google Sheets **cannot push** into our app. A WebSocket alone cannot replace polling the sheet.

| Layer | Role |
|-------|------|
| **Backend cron (every 15 min)** | Pulls enabled tabs via `POST /hr/sheet-sources/sync-all` |
| **Socket `calling:uploads-updated`** | After cron/manual sync → HR + dealer UIs refresh instantly |
| **Manual Sync now** | Immediate pull when HR needs it now |
| **SPA 15‑min soft refresh** | Fallback if socket was missed |

### New route

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/hr/sheet-sources/sync-all` | HR JWT **or** header `x-cron-secret: $CRON_SECRET` |

Body (optional): `{ "spreadsheetId": "18zqPIpa…" }`

Behaviour: sync every `hr_sheet_sources` row with `enabled=true` for that spreadsheet → assign with active_cap → emit socket once.

### Cron example

```bash
*/15 * * * * curl -sS -X POST "$API_BASE/hr/sheet-sources/sync-all" \
  -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" -d '{}'
```

Or node-cron — see `postHrSheetSourcesSyncAll` in `BACKEND_GOOGLE_SHEETS_SOCIAL_LEADS.ts`.

### Env

```env
CRON_SECRET=long-random-string
GOOGLE_SHEETS_SPREADSHEET_ID=18zqPIpa3fcjRvfNqdm3FPC10bszPIPHbv5F3-TMk0A0
```

### Do not

- Try to “socket sync” directly from Google Sheets (no Sheets push webhook unless you build Apps Script → your API)
- Cron-sync **disabled** tabs (only `enabled=true`)
- Skip `calling:uploads-updated` after cron (UI will look stale until hard refresh)

### Response shapes (camelCase — SPA normalizers accept snake_case too)

**GET `/hr/sheet-sources`**

```json
{
  "success": true,
  "sources": [
    {
      "id": "uuid",
      "spreadsheetId": "18zqPIpa3fcjRvfNqdm3FPC10bszPIPHbv5F3-TMk0A0",
      "sheetTabName": "Ajmer_Leads",
      "displayName": "Ajmer Leads",
      "enabled": true,
      "dealerIds": ["dealer-uuid-1"],
      "activeLimitPerDealer": 1,
      "rowCount": 120,
      "assignedCount": 5,
      "unassignedCount": 100,
      "completedCount": 25,
      "lastSyncedAt": "2026-02-04T10:00:00.000Z",
      "lastSyncStatus": "ok",
      "uploadId": "upload-uuid"
    }
  ]
}
```

**POST `/hr/sheet-sources/discover`**

```json
{
  "success": true,
  "tabs": ["Jaipur Leads", "Ajmer Leads", "Crompton Leads", "Ajmer Solar Lead Form New"],
  "sources": [ /* same tabs as upserted rows */ ],
  "data": {
    "spreadsheetId": "18zqPIpa3fcjRvfNqdm3FPC10bszPIPHbv5F3-TMk0A0",
    "tabs": ["Jaipur Leads", "Ajmer Leads", "Crompton Leads", "Ajmer Solar Lead Form New"],
    "sources": []
  }
}
```

**Discover must prune:** delete `hr_sheet_sources` for this spreadsheet whose `sheet_tab_name` is not in the Google tab list. Otherwise GET still returns stale tabs (`302012 Leads`, hiring forms, …) and HR UI cannot match the sheet.

**POST `/hr/sheet-sources/:id/sync`**

```json
{
  "success": true,
  "data": { "imported": 12, "skipped": 3, "uploadId": "upload-uuid" }
}
```

**GET `/hr/sheet-sources/:id/leads`**

```json
{
  "success": true,
  "data": {
    "leads": [
      {
        "id": "lead-uuid",
        "name": "Hari Ram",
        "mobile": "9602288697",
        "leadStatus": "CREATED",
        "remarks": "office visit next week",
        "kw": "5KW",
        "platform": "ig",
        "campaignName": "Lead Ad_Ajmer-1",
        "assignedDealerName": "Moomal",
        "firstCallResponse": "call cut",
        "finalDecision": "",
        "raw": { }
      }
    ],
    "pagination": { "page": 1, "limit": 50, "total": 120 }
  }
}
```

---

### Dealer Calling Data UI (SPA)

When `GET /dealers/me/calling-queue/current` (or `/next`) returns a **google_sheet** lead, echo these fields so the dealer page shows **Social Media** title + coloured card:

| Field | Example |
|-------|---------|
| `sourceType` / `source_type` | `google_sheet` |
| `uploadFileName` / `file_name` | `Google Sheet: Ajmer Leads` |
| `platform` | `ig`, `fb` |
| `lead_status` or `sheetLeadStatus` | `CREATED` |
| `campaignName`, `remarks`, `kw` | Meta columns |
| `firstCallResponse`, `secondCallResponse` | Sheet call notes |
| `externalId` | `l:863297329853250` |
| `raw` / `raw_json` | Full sheet row |

Without `source_type=google_sheet` or `platform`, SPA treats lead as normal **Calling Data** (orange card).

**Example `GET /dealers/me/calling-queue/current` lead (social):**

```json
{
  "id": "lead-uuid",
  "name": "Hari Ram",
  "mobile": "9602288697",
  "city": "Ajmer",
  "status": "assigned",
  "sourceType": "google_sheet",
  "uploadFileName": "Google Sheet: Ajmer Leads",
  "platform": "ig",
  "lead_status": "CREATED",
  "campaignName": "Lead Ad_Ajmer-1",
  "remarks": "office visit next week",
  "kw": "5KW",
  "firstCallResponse": "call cut",
  "externalId": "l:863297329853250"
}
```

Dealer SPA then shows page title **Social Media**, coloured current-lead card (sky/amber/rose/green), and Meta fields block.

---

## Assignment

Reuse existing allocator from `BACKEND_ASSIGN_UNASSIGNED.ts`:

- `assignmentMode: active_cap`
- `activeLimitPerDealer: 1` (match HR CSV default)
- `dealerIds` from sheet source config when toggle is ON

### Critical — sync + assign sequence (P0)

The SPA does **not** create leads when HR only toggles Enabled or checks dealers. Leads exist only after **sync imports rows**. Assignment happens in two places:

| When | Backend must |
|------|----------------|
| `POST /hr/sheet-sources/:id/sync` | Import rows → then call `assignUnassignedWithActiveCap(uploadId, { dealerIds, activeLimitPerDealer: 1 })` if `enabled` and `dealer_ids` non-empty |
| `PATCH /hr/sheet-sources/:id` | Persist `dealer_ids`; also update linked `hr_lead_uploads.dealer_ids` when `upload_id` is set |
| SPA **Save dealer pool** | Calls existing `POST /hr/leads/uploads/:uploadId/assign-unassigned` with `active_cap` + `rebalance: true` |

Without post-sync assign, HR sees rows in DB but **Social Media / Calling Data stay empty**.

### Upload batch naming (SPA matches these)

| Field | Example |
|-------|---------|
| `file_name` | `Google Sheet: Ajmer Leads` or `Google Sheet: Ajmer_Leads` |
| `source_type` | `google_sheet` |
| `source_sheet_tab` | `Ajmer_Leads` |

SPA also loads leads via `GET /hr/leads/uploads/:uploadId` when `GET /hr/sheet-sources/:id/leads` is empty.

### Discover must upsert real UUIDs

`POST /hr/sheet-sources/discover` must **create/update** `hr_sheet_sources` rows and return server `id` (not `local-*`). SPA uses that `id` for PATCH, sync, and getLeads.

### Credentials error (expected before .env)

If `GOOGLE_SERVICE_ACCOUNT_JSON` / `GOOGLE_APPLICATION_CREDENTIALS` missing, return clear **500** message (SPA shows “credentials pending”, not a hard crash). After env is set, Discover + Sync must succeed without SPA redeploy.

---

## Environment variables (backend)

```env
GOOGLE_SHEETS_SPREADSHEET_ID=18zqPIpa3fcjRvfNqdm3FPC10bszPIPHbv5F3-TMk0A0
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
# OR
GOOGLE_APPLICATION_CREDENTIALS=/secure/path/service-account.json
```

**npm:** `googleapis` on backend only.

---

## Google Cloud setup

1. Create service account in GCP project.
2. Enable **Google Sheets API**.
3. Download JSON key → store in env (not in repo).
4. Open spreadsheet → Share → add `client_email` from JSON as **Editor**.
5. Verify `GET discover` returns tab list including `Ajmer_Leads`.

---

## QA checklist

- [ ] Discover returns all tabs (`Ajmer_Leads`, …)
- [ ] Enable tab + select dealers → PATCH saves pool
- [ ] Sync imports rows with valid 10-digit mobile
- [ ] Duplicate mobile on re-sync → skipped
- [ ] Assigned count follows active_cap (1 per dealer)
- [ ] HR Social Media table shows coloured status badges + filter chips (New / Pending / Not interested / Interested)
- [ ] Dealer Calling Data page title = **Social Media** + coloured card when queue echoes social fields
- [ ] `GET /hr/leads/uploads` includes sheet batches (`source_type=google_sheet`)
- [ ] Credentials not in frontend bundle or git

---

## Related docs

- `BACKEND_CHANGES_HANDOFF.md` §41
- `BACKEND_CHANGES_REQUIRED.md` §AN
- `BACKEND_ASSIGN_UNASSIGNED.ts` — round-robin
- `BACKEND_ADMIN_QUOTATION_STATUS.ts` — `hr_leads` / uploads
