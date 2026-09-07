# Backend changes handoff (May 2026)

Action items for the backend team from recent frontend work. Full detail lives in `BACKEND_CHANGES_REQUIRED.md` (**§7.8**, **§7.9**, dealer calling queue **§E / §E.1 / §E.2 / §H / §J**, **§J.1**, **§X**, **§Z**). **Calling queue:** current lead until Submit — **§4.5.1** / **§E.1**; **reschedule 500** — **§4.5.2** / **§E.2**. Reference implementations: `BACKEND_ADMIN_QUOTATION_STATUS.ts` (HR uploads, `patchDealerCallingQueueAction`), `lib/quotation-pdf-display.ts` (PDF wording), `lib/calling-remark-payload.ts` (remark PATCH body), `lib/api.ts` (HR/admin calling-actions query params), `lib/visit-report.ts` (admin visit list mapping).

---

## 1. HR uploaded leads — correct Assigned / Unassigned counts

### Problem

`GET /api/hr/leads/uploads` (and upload detail) sometimes returns **`assignedCount: rowCount`** and **`unassignedCount: 0`** while every row is still **Unassigned** + **Pending**. That happens when upload-time stats (`POST` response `assigned`) are reused as live batch counts.

### What HR expects (matches table columns)

| Count | Per lead |
|-------|----------|
| **Unassigned** | No valid `assignedDealerId` (null/empty/sentinel) and status `queued` / `pending` |
| **Assigned** | Valid dealer UUID + status `assigned` or `in_progress` (not completed) |
| **Completed** | Status `completed` / `done` / `closed` |

**Invariant:** `assignedCount + unassignedCount + completedCount === rowCount`

### Endpoints

| Method | Path | Change |
|--------|------|--------|
| `GET` | `/api/hr/leads/uploads` | Return live `assignedCount`, `unassignedCount`, `completedCount` per batch (SQL aggregate, not upload-time `assigned`) |
| `GET` | `/api/hr/leads/uploads/{uploadId}` | Same counts for **full batch** (not current page only) + paginated `rows[]` with `assignedDealerId`, `assignedDealerName`, `status` |
| `POST` | `/api/hr/leads/upload-csv` | Keep **`assignedAtUpload`** / **`queuedAtUpload`** — do **not** expose these as `assignedCount` on GET |

### POST upload response (keep distinct keys)

```json
{
  "success": true,
  "parsed": 1000,
  "created": 1000,
  "assignedAtUpload": 3,
  "queuedAtUpload": 997,
  "uploadId": "upload_abc"
}
```

### GET list item example

```json
{
  "id": "upload_abc",
  "fileName": "leads.csv",
  "rowCount": 1000,
  "assignedCount": 3,
  "unassignedCount": 997,
  "completedCount": 0,
  "dealerIds": ["dealer-uuid-1", "dealer-uuid-2"]
}
```

### Per-row rules

- **`dealerIds` on batch** = dealer **pool** at upload — do **not** set `assigned_dealer_id` on every lead from this list.
- **Unassigned row:** `assignedDealerId: null`, `status: "queued"` (frontend shows “Unassigned” / “Pending”).
- **Assigned row:** real dealer UUID + `assignedDealerName` from join + `status: "assigned"` or `"in_progress"`.

### SQL (adjust table/column names)

```sql
SELECT
  upload_id,
  COUNT(*) AS row_count,
  SUM(CASE WHEN LOWER(status) IN ('completed', 'done', 'closed') THEN 1 ELSE 0 END) AS completed_count,
  SUM(CASE
    WHEN LOWER(status) NOT IN ('completed', 'done', 'closed')
     AND assigned_dealer_id IS NOT NULL
     AND TRIM(assigned_dealer_id) <> ''
     AND LOWER(TRIM(assigned_dealer_id)) NOT IN ('unassigned', 'null', 'none', '-', 'na', 'n/a', 'pool', 'open')
    THEN 1 ELSE 0 END) AS assigned_count,
  SUM(CASE
    WHEN LOWER(status) NOT IN ('completed', 'done', 'closed')
     AND (
       assigned_dealer_id IS NULL
       OR TRIM(assigned_dealer_id) = ''
       OR LOWER(TRIM(assigned_dealer_id)) IN ('unassigned', 'null', 'none', '-', 'na', 'n/a', 'pool', 'open')
     )
    THEN 1 ELSE 0 END) AS unassigned_count
FROM hr_leads
GROUP BY upload_id;
```

### Reference code

- `computeHrUploadLeadCounts()` in `BACKEND_ADMIN_QUOTATION_STATUS.ts`
- `getHrLeadsUploads` / `getHrLeadsUploadById` in same file

### QA

1. Upload 1000 leads, 3 allocated at upload → POST `assignedAtUpload: 3`.
2. GET list → `assignedCount: 3`, `unassignedCount: 997`, `completedCount: 0` (not 1000 assigned).
3. Modal rows: `assignedDealerId: null`, `status: queued` → header counts still match batch object.

---

## 2. Quotation `products` JSON — PDF display, brands, validation (May 2026)

**Frontend:** `lib/quotation-api-payload.ts`, `lib/quotation-pdf-display.ts`, `lib/quotation-proposal-document.ts`, `components/product-selection-form.tsx`.

Proposal PDF is **client-generated**; backend stores/returns `products` and optional `dealer` on GET.

### 2.1 PDF panel range keys

| Field | Scope |
|-------|--------|
| `pdfPanelRangeKey` | `dcr` / `non-dcr` |
| `pdfDcrPanelRangeKey` | `both` — DCR |
| `pdfNonDcrPanelRangeKey` | `both` — Non-DCR |

**Values:** `waaree_540_560_bifacial`, `waaree_580_700_bifacial_topcon`, `adani_540_580_bifacial`, `adani_610_625_bifacial_topcon`, `premier_600_625_bifacial_topcon`, **`tata_530_570`** (Tata DCR Jun 2026 package), **`premier_energy_600_610`** (Crompton DCR set — Premier Energy 600W–610W).

**Snake_case:** `pdf_panel_range_key`, `pdf_dcr_panel_range_key`, `pdf_non_dcr_panel_range_key`.

**Legacy:** `pdfUsePanelSizeRange` (old rows only). **`pdfUseInverterBrandOptions` no longer sent.**

**Save flow:** `POST` strips PDF keys → **`PATCH /api/quotations/{id}/products`** saves them.

**Uncheck / clear:** Frontend sends `pdfPanelRangeKey: ""` (and snake_case `null`) when a box is unchecked. Backend must **remove or null out** stored keys on PATCH — do not ignore empty strings or leave stale keys (otherwise PDF keeps old “As per the set” behaviour).

When a range key is set, PDF shows panel spec as **“As per the set”** and inverter brand as **“As per the set”** when any range is active; allow **qty 0 / omitted** on backend validation.

**Panel size on GET:** Prefer `panelSize` over legacy `dcrPanelSize` when both exist for DCR quotations (frontend syncs on save; avoid returning conflicting duplicates).

### 2.2 Combined brand strings (if whitelisted)

| Field | Extra values |
|-------|----------------|
| `inverterBrand` | `Vsole/Xwatt/Saatvik`, `Vsole/Xwatt`, catalog brands (GoodWe, Polycab, …), **`Crompton`** (Crompton DCR set), **`As per the set`** (Tata DCR only) |
| `meterBrand` | `L&T/HPL/Genus/Secure` |

### 2.3 DCR inverter brand — Tata vs all other packages (Jun 2026)

**Frontend:** `lib/quotation-api-payload.ts` (`toCatalogCompatibleProducts`, `restoreDcrPackageDisplayForForm`), `components/product-selection-form.tsx`.

| Package | UI | `inverterBrand` on POST/PATCH | `inverterSize` |
|---------|-----|------------------------------|----------------|
| **Tata DCR** (`panelBrand` = `Tata`) | Read-only **As per the set** | **`As per the set`** | **`As per the set`** |
| **Crompton set** (`panelType` = `Crompton set`, form brand `Premier Energy`) | Fixed **Crompton** | **`Crompton`** | **`3.6kW`** |
| **Other DCR** (Adani, Waaree, Premier Energies, …) | Dropdown; **default** `Vsole/Xwatt`; dealer may pick another catalog brand | User’s choice (default `Vsole/Xwatt` if empty) | Concrete kW e.g. `5kW`, `10kW` |

**Tata DCR also sends:**

- `panelSize`: `As per the set`
- `panelQuantity`: `0`
- `pdfPanelRangeKey`: `tata_530_570`

**Backend must:**

1. **Accept and persist** literal `As per the set` on `inverterBrand`, `inverterSize`, and `panelSize` for Tata rows — do **not** rewrite to `530W` / `Vsole/Xwatt` on save.
2. **Return the same strings on GET** so edit/reload shows Tata package-set correctly (`restoreDcrPackageDisplayForForm` uses `panelBrand === "tata"` + `pdfPanelRangeKey`).
3. **Allow `panelQuantity` / `dcrPanelQuantity` = 0** when `panelBrand === "Tata"` OR `pdfPanelRangeKey === "tata_530_570"` OR `inverterBrand` / `panelSize` is `As per the set` (same relaxation as other PDF range keys).
4. **Do not require** `inverterSize` to match `^\d+kW$` when value is `As per the set`.
5. **Do not require** `panelSize` to match `^\d+W$` when value is `As per the set`.
6. For **non-Tata DCR**, accept any **catalog inverter brand** the dealer selects; only default to `Vsole/Xwatt` when the field is omitted (frontend default, not a server overwrite on PATCH).

**Example — Tata DCR (`POST` body + `PATCH` products):**

```json
{
  "systemType": "dcr",
  "phase": "1-Phase",
  "panelBrand": "Tata",
  "panelSize": "As per the set",
  "panelQuantity": 0,
  "dcrPanelBrand": "Tata",
  "dcrPanelSize": "As per the set",
  "dcrPanelQuantity": 0,
  "inverterType": "String Inverter",
  "inverterBrand": "As per the set",
  "inverterSize": "As per the set",
  "structureSize": "3.1kW",
  "pdfPanelRangeKey": "tata_530_570",
  "centralSubsidy": 78000
}
```

**Example — Adani DCR (dealer changed inverter to GoodWe):**

```json
{
  "systemType": "dcr",
  "panelBrand": "Adani",
  "panelSize": "555W",
  "panelQuantity": 10,
  "inverterBrand": "GoodWe",
  "inverterSize": "10kW",
  "pdfPanelRangeKey": "adani_610_625_bifacial_topcon"
}
```

**Validation pseudocode:**

```ts
const AS_PER_SET = /^(as per the set|as per set)$/i

function isTataDcrPackage(p: Products): boolean {
  return p.systemType === "dcr" && String(p.panelBrand || p.dcrPanelBrand || "").trim().toLowerCase() === "tata"
}

function isPackageSetField(v?: string): boolean {
  return AS_PER_SET.test(String(v || "").trim())
}

// Tata OR pdf range OR as-per-set labels → allow panel qty 0
function panelQtyOk(p: Products): boolean {
  if (p.pdfPanelRangeKey || isTataDcrPackage(p) || isPackageSetField(p.panelSize)) return true
  return (p.panelQuantity ?? 0) > 0
}

// inverterBrand: allow catalog brands + Vsole/Xwatt + As per the set (Tata)
// Do NOT strip or normalize user-selected GoodWe/Polycab on non-Tata DCR
```

### 2.4 GET quotation — `dealer`

Return `dealer: { id, firstName, lastName, email, mobile, username, role }` for proposal “Dealer Details”.

### 2.5 Commercial PDF flag — hide subsidy on proposal (Jun 2026)

**Frontend:** `components/product-selection-form.tsx` (“Commercial project” checkbox), `lib/quotation-pdf-display.ts` (`isPdfCommercialSet`), `lib/quotation-api-payload.ts` (`buildPdfDisplayFlagsPayload`).

| Field | Type | Purpose |
|-------|------|---------|
| `pdfCommercialSet` | `boolean` | Commercial DCR/BOTH set — omit Central/State/Subsidy T&C on proposal PDF page 3 |
| `pdf_commercial_set` | `boolean` | snake_case mirror |

**Save flow:** Same as panel range keys — stripped on `POST /api/quotations` for catalog validation; persisted via **`PATCH /api/quotations/{id}/products`** immediately after create (and on edit).

**Clear on uncheck:** Frontend sends `pdfCommercialSet: false` and `pdf_commercial_set: false`. PATCH must clear stored value — do not leave stale `true`.

**Does not affect:** pricing, subsidies in DB, or catalog validation. PDF-only display flag.

**Example `products` fragment:**

```json
{
  "systemType": "dcr",
  "panelBrand": "Premier Energies",
  "pdfPanelRangeKey": "premier_600_625_bifacial_topcon",
  "pdfCommercialSet": true,
  "pdf_commercial_set": true,
  "centralSubsidy": 78000
}
```

### 2.6 Proposal PDF dates — `updatedAt` + 7-day validity (Jun 2026)

**Frontend:** `lib/quotation-proposal-document.ts` (`normalizeQuotationTimestamps`, `resolveProposalQuotationDates`), `components/quotation-details-dialog.tsx` (refetches `GET /quotations/{id}` before Download PDF), `components/quotation-proposal-pdf.tsx`.

**Behaviour on PDF download:**

| PDF field | Source |
|-----------|--------|
| **Updated** (header label) | `updatedAt` → else `createdAt` → else derive from `validUntil − 7 days` |
| **Valid Until** | **Updated date + 7 days** (`PROPOSAL_VALIDITY_DAYS = 7`) |

**Download flow:** Admin/dealer dialog calls **`GET /api/quotations/{id}`** immediately before generating the PDF so the file uses the latest server `updatedAt`.

**Backend requirements:**

1. **`updated_at` column** on quotations — auto-set to `NOW()` on every mutation that changes quotation data:
   - `PATCH /api/quotations/{id}/products`
   - `PATCH /api/quotations/{id}/pricing` (and legacy discount PATCH if still used)
   - Any admin/dealer edit that changes products, pricing, or discount
2. **Return `updatedAt`** (camelCase) on **`GET /api/quotations`** list and **`GET /api/quotations/{id}`** (optional snake_case `updated_at`).
3. **PATCH responses** should include refreshed `updatedAt` so the dialog/PDF use the server timestamp after save.
4. **`validUntil` (optional):** If stored server-side, set/recompute to **`updatedAt + 7 days`** whenever products or pricing are updated (not only on create). Frontend does not require `validUntil` if `updatedAt` is present.

**Example GET quotation fragment:**

```json
{
  "id": "QT-HTIV24",
  "createdAt": "2026-04-20T10:00:00.000Z",
  "updatedAt": "2026-04-27T09:30:00.000Z",
  "validUntil": "2026-05-04T09:30:00.000Z",
  "products": { "...": "..." }
}
```

### 2.7 `validUntil` (optional legacy)

Prefer **`updatedAt + 7 days`** (see §2.6). If only `createdAt` exists, frontend falls back to `createdAt` for PDF date. Align server default from **5 days → 7 days** if `validUntil` is set on create.

### Example `products` (non-Tata DCR + PDF range)

```json
{
  "systemType": "dcr",
  "panelBrand": "Adani",
  "panelSize": "610W",
  "panelQuantity": 0,
  "inverterBrand": "Vsole/Xwatt",
  "inverterSize": "10kW",
  "meterBrand": "L&T/HPL/Genus/Secure",
  "pdfPanelRangeKey": "adani_610_625_bifacial_topcon"
}
```

### Endpoints

| Method | Path |
|--------|------|
| `POST` | `/api/quotations` |
| `PATCH` | `/api/quotations/{id}/products` |
| `GET` | `/api/quotations`, `/api/quotations/{id}` |

### Do not

Use PDF keys in pricing/catalog validation. Do not strip PDF keys on PATCH.

### Checklist

- [ ] Persist `pdf*PanelRangeKey` on `products`
- [ ] PATCH clears keys when frontend sends `""` / `null`
- [ ] PATCH products after create works
- [ ] Relax panel qty when range keys set
- [ ] Allow combined inverter/meter brands (`Vsole/Xwatt`, etc.)
- [ ] Add PDF key **`tata_530_570`**
- [ ] Accept **`As per the set`** on `inverterBrand`, `inverterSize`, `panelSize` (Tata DCR)
- [ ] Persist Tata rows **without** rewriting to `530W` / `Vsole/Xwatt`
- [ ] Non-Tata DCR: persist dealer-selected catalog `inverterBrand` (default `Vsole/Xwatt` only when omitted)
- [ ] Relax panel qty for Tata / as-per-set / `tata_530_570`
- [ ] Return `dealer` on GET quotation
- [ ] Persist **`pdfCommercialSet`** / **`pdf_commercial_set`**; clear on `false`
- [ ] Return **`updatedAt`** on GET list + GET by id; bump on products/pricing PATCH
- [ ] (Optional) `validUntil` = **`updatedAt + 7 days`** on create and on products/pricing update

**Full spec:** `BACKEND_CHANGES_REQUIRED.md` §X.

### 2.6 Pricing tables API (required for Admin Pricing + dealer PDF)

**Docs:** `BACKEND_PRICING_TABLES.md` · copy-paste `BACKEND_PRICING_TABLES_CONTROLLER.ts` · seed `BACKEND_PRICING_TABLES_SEED.json` / helpers `BACKEND_PRICING_TABLES_SEED.ts` · detail `BACKEND_PRICING_TABLES_API.md`

| Method | Path | Who |
|--------|------|-----|
| GET | `/api/quotations/pricing-tables` | dealers / admins / visitors |
| PUT | `/api/quotations/pricing-tables` | **admin only** |

**Admin → Pricing:** Add/Delete are draft-only (confirm in UI). **Save** PUTs full `{ dcr, nonDcr, both, … }` — backend must **replace** those arrays and echo them on GET. Seed from FE `lib/pricing-tables.ts` snapshot (incl. **Waaree Topcon 610W**). Calling Data PDF + New Quotation read GET.

---

## 3. Dealer calling queue — fix `LEAD_004` (“Lead not assigned to dealer”)

**Symptom:** Dealer sees a lead under **Current Lead**, taps **Start Call** or **Submit** (e.g. Not Connected → Call Unanswered), gets **403 / `LEAD_004` — Lead not assigned to dealer**.

**Cause:** `GET /calling-queue/next` returns a lead the dealer may **view** (pool / batch), but `PATCH .../action` rejects because `assigned_dealer_id` is null or belongs to another dealer.

**Frontend mitigations (already shipped):** dialer opens immediately; retries assign via `POST .../claim`, `POST .../assign`, `PATCH .../calling-queue/{id}`; on persistent `LEAD_004` the UI saves **locally** (`in_progress` on start, `completed`/`rescheduled` on submit) **without** showing the error. **Backend must still implement Option A or C** so actions persist in DB and sync across devices / Admin Calling Reports.

### Required backend behavior (pick one or combine)

#### Option A — Auto-assign on `start` **and** completion (recommended)

`PATCH /api/dealers/me/calling-queue/{leadId}/action`

When the authenticated dealer is allowed to work the lead:

**On `action === "start"`:**

1. If `assigned_dealer_id` is empty and the lead is in the dealer’s eligible pool (upload `dealerIds`, `eligibleDealerIds`, or allocator rules), set `assigned_dealer_id = dealer.id` and `status = in_progress` (or `assigned` then `in_progress`).
2. If already assigned to **this** dealer, proceed with transition to `in_progress`.
3. If assigned to **another** dealer, return **`LEAD_004`** (do not return this lead from `/next` for other dealers).

**On completion** (`called`, `follow_up`, `not_interested`, `rescheduled`):

1. If `assigned_dealer_id` is empty but the lead is `in_progress` for this dealer (or in their eligible pool), **auto-assign** `assigned_dealer_id = dealer.id` in the same transaction, then apply the completion transition.
2. If `assigned_dealer_id` already matches JWT dealer, persist remark fields and close the lead.
3. If assigned to **another** dealer, return **`LEAD_004`**.

**Example — Not Connected / Call Unanswered (frontend sends `not_interested`):**

```json
PATCH /api/dealers/me/calling-queue/{leadId}/action
{
  "action": "not_interested",
  "actionAt": "2026-06-05T10:30:00.000Z",
  "callRemark": "[part_1_call_and_lead] Call Unanswered",
  "call_remark": "[part_1_call_and_lead] Call Unanswered",
  "statusCategory": "part_1_call_and_lead",
  "status_category": "part_1_call_and_lead",
  "statusText": "Call Unanswered",
  "status_text": "Call Unanswered"
}
```

Response **200** must persist `call_remark`, set `status = completed` (or your terminal status), set `action` / `action_at`, then return `nextLead` for the same dealer.

Optional body flags the frontend may send (treat as hints):

```json
{
  "action": "start",
  "claim": true,
  "autoAssign": true,
  "assignedDealerId": "<dealer-uuid-from-jwt>"
}
```

#### Option B — Claim / assign endpoints

Implement **at least one** (frontend already calls these if present):

| Method | Path |
|--------|------|
| `POST` | `/api/dealers/me/calling-queue/{leadId}/claim` |
| `POST` | `/api/dealers/me/calling-queue/{leadId}/assign` body `{ assignedDealerId, status: "assigned" }` |
| `PATCH` | `/api/dealers/me/calling-queue/{leadId}` body `{ assignedDealerId, status }` |

- Auth: dealer JWT.
- Sets `assigned_dealer_id` to current dealer if lead is pool/unassigned and dealer is eligible.
- Returns updated lead + **409** if already claimed by someone else.

#### Option C — Assign before returning from `/next`

`GET /api/dealers/me/calling-queue/next` (and `/current`)

- When allocating the next lead to a dealer, **persist** `assigned_dealer_id` on that row **before** returning it (work-queue model).
- Response lead must include `assignedDealerId` = dealer’s UUID (same as JWT `dealers.id`).

### Assignee fields on every lead object

| Field | Rule |
|-------|------|
| `assignedDealerId` / `assigned_dealer_id` | UUID of dealer who must call — **must match JWT id** when lead is “theirs” |
| `assignedDealerName` | Join from `dealers` table |
| `dealerId` / `dealerName` | Uploader / CRM only — **not** calling assignee |

Sentinels treated as unassigned: `unassigned`, `null`, `none`, `pool`, `open`, etc.

### `GET /next` must not contradict `PATCH`

- Do **not** return a lead in `lead` / `nextLead` / `currentLead` if this dealer cannot `PATCH` it.
- `/next` and `/current` should use the **same** visibility and allocation rules.

### On action completion

After `called` / `follow_up` / `not_interested` / `rescheduled`:

- Set lead status appropriately (`completed`, `rescheduled`, etc.).
- Allocate next queued lead to the same dealer when under active cap (see `BACKEND_CHANGES_REQUIRED.md` §7.7, §G).

### QA

1. HR uploads batch with dealer pool; dealer A opens Calling Data → sees one current lead.
2. **Start Call** → **200**, lead moves to `in_progress` (no `LEAD_004`).
3. **Submit** (Not Connected → Call Unanswered) → **200**, remark saved, lead `completed`, `nextLead` returned (no `LEAD_004`).
4. Dealer B does not see A’s in-progress lead in `/next`.
5. Pool lead with no assignee: first `start` assigns to current dealer; second dealer gets `LEAD_004` or a different lead.
6. Admin / HR calling reports show the submitted remark and dealer name after refresh.

### Reference

- `BACKEND_CHANGES_REQUIRED.md` — Dealer calling queue section (~line 2307), §7.7 work queue, error `LEAD_004`
- `lib/calling-lead-assignee.ts`, `lib/api.ts` → `claimCallingLead`, `updateCallingLeadAction`

---

## 4. Calling remarks, queue tabs & start vs submit

**Frontend:** `app/dashboard/calling-data/page.tsx`, `lib/calling-remark-payload.ts`, `lib/calling-lead-session.ts`, `app/dashboard/new-quotation/page.tsx`, `components/customer-details-form.tsx` (`remarks` on customer).

Browser **sessionStorage** holds drafts until Submit; **backend must persist** on action and return data in the correct queue buckets.

### 4.1 Persist call remarks on dealer action

`PATCH /api/dealers/me/calling-queue/{leadId}/action`

**Accept any of these in the body** (frontend sends camelCase + snake_case when remarks are submitted):

| Field | Example |
|-------|---------|
| `callRemark` / `call_remark` | `[call_connectivity] Call Unanswered \| Customer asked callback evening` |
| `statusCategory` / `status_category` | `call_connectivity` |
| `statusText` / `status_text` | `Call Unanswered` |
| `remark` | `Customer asked callback evening` (free text only) |
| `nextFollowUpAt` / `next_follow_up_at` | ISO-8601 — **required** for reschedule / decision-pending hold (§4.5.2) |
| `actionAt` / `action_at` | ISO-8601 — when the action occurred |

**Tagged format** (parse with `parseTaggedCallRemark()` in `BACKEND_ADMIN_QUOTATION_STATUS.ts`):

```text
[statusCategory] statusText | optional free remark
```

**Allowed `statusCategory` values:** `call_connectivity`, `lead_validity`, `customer_intent`, `financial`, `competition`, `schedule`, `other`.

**Persist on the lead row (recommended columns):**

- `status_category`, `status_text`, `remark` (structured)
- `call_remark` (legacy combined string, same as frontend)
- `action`, `action_at`, `next_follow_up_at` when applicable

**On `action: "start"`:** remark fields are usually omitted — only set `status` → `in_progress` and assignee. **Do not require** `callRemark` for start.

**On `action` in `called` \| `follow_up` \| `not_interested` \| `rescheduled`:** **require** valid remark payload (or at least `statusCategory` + `statusText`) so history tabs have data.

**Return on GET** (lead + history items): `callRemark`, `call_remark`, and optionally denormalized `statusCategory`, `statusText`, `remark`.

### 4.2 Customer note on calling lead (optional PATCH)

Frontend shows **Customer Note** on Current Lead (separate from call remarks).

| Method | Path | Body |
|--------|------|------|
| `PATCH` | `/api/dealers/me/calling-queue/{leadId}` | `{ "customerNote": "..." }` or `customer_note` |

Echo on lead object: `customerNote` / `customer_note` in `GET /next`, `GET /current`, and queue lists.

If not implemented, frontend keeps note in **sessionStorage only** until quotation prefill — **persist is strongly preferred**.

### 4.3 Quotation prefill — customer `notes` / `remarks`

`POST /api/customers` (and `PUT` if used)

Accept optional:

```json
{
  "firstName": "Sunita",
  "lastName": "Customer",
  "mobile": "9660016677",
  "address": { "street": "...", "city": "...", "state": "...", "pincode": "..." },
  "notes": "Customer note from calling\n\nCall remark free text",
  "remarks": "same as notes"
}
```

Frontend sends **`remarks`** and **`notes`** with the same value when prefilled from Calling Data.

### 4.4 Separate queue arrays per tab (critical)

`GET /api/dealers/me/calling-queue/next` and `GET /api/dealers/me/calling-queue/current` should return **distinct lists** so Scheduled / Dialled / Connected / Not Connected tabs do not show the same rows.

| Response key | Tab | Rule |
|--------------|-----|------|
| `scheduledLeads` / `upcomingFollowUps` / `rescheduledLeads` | **Scheduled** | Future `nextFollowUpAt` > now, status `rescheduled` (or scheduled) |
| `dialledActions` | **Dialled** | Completed dial attempts: actions in `called`, `follow_up`, `not_interested`, `rescheduled` **without** upcoming future follow-up |
| `connectedActions` | **Connected** | Subset of dialled where `status_text` is **not** a not-connected reason (see frontend `NOT_CONNECTED_REASONS`) |
| `notConnectedActions` | **Not Connected** | Subset where `status_text` is call-unanswered / switched off / not reachable / etc. |
| `recentActions` / `actionHistory` | History / analytics | Union or superset for counts |

**Do not** put future scheduled follow-ups only in `dialledActions` — they belong under **`scheduledLeads`**.

Each action item should include: `id`, `leadId`, `name`, `mobile`, `action`, `actionAt`, `callRemark`, `nextFollowUpAt`, `kNumber`, `address`, `customerNote` (if stored).

### 4.5 `start` must not skip to the next lead

**Problem:** If `PATCH .../action` with `action: "start"` returns `nextLead` / replaces the current queue head, dealers skip leads when tapping Start multiple times.

**Required:**

| Action | Behavior |
|--------|----------|
| `start` | Set assignee + `in_progress`; **return the same lead** (updated). **Do not** return `nextLead` or advance queue. |
| `called` / `follow_up` / `not_interested` / `rescheduled` | Complete workflow; **then** return `nextLead` / updated counts / next queue head. |

Example **`start` response** (no next lead):

```json
{
  "success": true,
  "lead": { "id": "...", "status": "in_progress", "assignedDealerId": "dealer-uuid", "..." }
}
```

Example **after Submit** (`called`):

```json
{
  "success": true,
  "lead": { "...completed or rescheduled..." },
  "nextLead": { "id": "next-uuid", "..." },
  "pendingCount": 42
}
```

### 4.5.1 Current lead must stay until Submit (Jun 2026 — dealer bug fix)

**Symptom:** Dealer opens **Calling Data → Current Lead**, taps **Start Call**, fills connection/status/remarks, then the lead **vanishes** or **another lead appears** before **Submit Current Lead**.

**Frontend:** `app/dashboard/calling-data/page.tsx` pins the active lead client-side and ignores API `nextLead` during `in_progress`. **Backend must still enforce** correct queue semantics so refresh, other devices, and realtime events stay consistent.

#### State machine (per dealer)

```
queued/assigned ──(PATCH start)──► in_progress ──(PATCH called|follow_up|not_interested|rescheduled)──► completed/rescheduled
                                         │                                                              │
                                         └── dealer keeps THIS lead until completion PATCH ────────────┘
```

#### Required backend rules

| # | Rule |
|---|------|
| 1 | **`PATCH …/action` with `action: "start"`** — set `assigned_dealer_id` = JWT dealer, `status` = `in_progress`. Return **`lead`** = same `id` (updated). **Do not** include `nextLead`. **Do not** pre-allocate the next pool row to this dealer. |
| 2 | **`GET …/calling-queue/current`** — if this dealer has an `in_progress` lead, **`currentLead` (or `lead`) MUST be that row** with full fields (`name`, `mobile`, `address`, `customerNote`, `callRemark`, etc.). |
| 3 | **`GET …/calling-queue/next`** while `in_progress` exists — return the **same** `in_progress` lead as head, **or** return counts/history only **without** a different `nextLead`. Never return a **new** queued lead as queue head until the open call is submitted. |
| 4 | **Completion PATCH** (`called`, `follow_up`, `not_interested`, `rescheduled`) — persist `callRemark` / structured status fields, close or reschedule the lead, **then** advance queue and return **`nextLead`**. |
| 5 | **One open call per dealer (recommended)** — at most one `in_progress` row per `assigned_dealer_id`; reject second `start` on another lead until first is completed (frontend also blocks). |
| 6 | **`LEAD_004` on start** — claim unassigned pool lead to JWT dealer on first `start` (see §3). |
| 7 | **Queue refresh** — any GET that omits the dealer’s `in_progress` lead causes UI flicker; always include it in `currentLead` / `leads` / `currentQueue` until completion. |

#### Wrong vs correct `start` response

**Wrong** (causes skip / empty current lead):

```json
{
  "success": true,
  "lead": { "id": "lead-A", "status": "in_progress" },
  "nextLead": { "id": "lead-B", "status": "queued" }
}
```

**Correct:**

```json
{
  "success": true,
  "data": {
    "lead": {
      "id": "lead-A",
      "status": "in_progress",
      "assignedDealerId": "dealer-uuid",
      "name": "Customer",
      "mobile": "9876543210",
      "customerNote": "…"
    }
  }
}
```

#### Wrong vs correct GET `/current` while call open

**Wrong:** `currentLead` = next queued lead B while lead A is still `in_progress` for this dealer.

**Correct:** `currentLead` = lead A (`in_progress`); lead B appears only after completion PATCH on A.

#### Suggested SQL guard (adjust table names)

```sql
-- On PATCH start: do not pick next lead in same transaction
UPDATE hr_calling_leads
SET assigned_dealer_id = $dealer_id, status = 'in_progress', updated_at = NOW()
WHERE id = $lead_id
  AND (assigned_dealer_id IS NULL OR assigned_dealer_id = $dealer_id);

-- On GET current for dealer:
SELECT * FROM hr_calling_leads
WHERE assigned_dealer_id = $dealer_id AND status = 'in_progress'
ORDER BY updated_at DESC
LIMIT 1;
-- If row exists, use as currentLead; else allocate next from pool.
```

#### Backend checklist (add to §4 checklist)

- [ ] `start` never returns `nextLead`
- [ ] `GET /current` returns dealer’s `in_progress` lead when present
- [ ] `GET /next` does not advance past open `in_progress` call
- [ ] Completion actions return `nextLead` only after closing current lead
- [ ] `callRemark` + structured status persisted on completion PATCH
- [ ] `customerNote` echoed on GET while call is open

#### QA

1. Dealer **Start** on lead A → Current Lead still shows A after refresh / tab switch.
2. Fill status + remark → submit → **then** lead B appears.
3. Double **Start** on A → still A (no skip to B).
4. Dealer B cannot see A while A is `in_progress` for dealer A.
5. HR upload pool lead: first **Start** assigns to dealer; no `LEAD_004`.

### 4.5.2 Reschedule / Decision Pending — fix 500 on Submit (Jun 2026)

**Symptom:** Dealer on **Calling Data → Current Lead** selects **Connected → Decision Pending → Callback Scheduled** (or other hold reason), sets **Reschedule date and time**, clicks **Submit** → toast **“Action failed — Internal server error”** (HTTP 500).

**Frontend:** `app/dashboard/calling-data/page.tsx`, `lib/calling-remark-payload.ts` (`enrichCallingActionPayload`, `cleanFreeCallRemark`). On 500 / invalid transition, frontend retries `start` then falls back to **`action: "follow_up"`** with the same `nextFollowUpAt`. **Backend must accept both actions** and must not 500.

#### UI → API mapping (Decision Pending + reschedule)

| UI field | Backend field |
|----------|----------------|
| Hold Reason (e.g. Callback Scheduled) | `statusText` / `status_text` = `Callback Scheduled` |
| (derived) | `statusCategory` / `status_category` = **`schedule`** |
| Remarks textarea | `remark` (free text only) + combined `callRemark` |
| Reschedule datetime | **`nextFollowUpAt`** / **`next_follow_up_at`** (ISO-8601 UTC) |
| Submit | **`action`** = **`rescheduled`** (preferred) or **`follow_up`** (accepted alias) |

#### Example PATCH body (frontend sends camelCase + snake_case)

```json
{
  "action": "rescheduled",
  "callRemark": "[schedule] Callback Scheduled | Adani panel 620w",
  "call_remark": "[schedule] Callback Scheduled | Adani panel 620w",
  "statusCategory": "schedule",
  "status_category": "schedule",
  "statusText": "Callback Scheduled",
  "status_text": "Callback Scheduled",
  "remark": "Adani panel 620w",
  "nextFollowUpAt": "2026-06-11T05:07:00.000Z",
  "next_follow_up_at": "2026-06-11T05:07:00.000Z",
  "actionAt": "2026-06-05T10:37:00.000Z",
  "action_at": "2026-06-05T10:37:00.000Z"
}
```

#### Required server behavior

| # | Rule |
|---|------|
| 1 | **`PATCH …/action`** with `action` in **`rescheduled`** \| **`follow_up`** and **`nextFollowUpAt` / `next_follow_up_at` present** — persist follow-up time; set lead **`status` = `rescheduled`** (not `completed`). |
| 2 | **Do not return HTTP 500** for valid payloads — return **`400` `VAL_001`** if `nextFollowUpAt` missing/invalid, or **`LEAD_005`** for bad transition (never uncaught exception). |
| 3 | **Accept `follow_up` as alias** when `nextFollowUpAt` is set and `status_category` = `schedule` — same DB update as `rescheduled`. |
| 4 | **Transition:** `in_progress` → `rescheduled` (and `assigned` → `rescheduled` after implicit/auto `start` if your API requires it). |
| 5 | **Replace** `call_remark` on submit — store **one** canonical tagged string; **do not append** nested `[schedule] Callback Scheduled` chains (causes VARCHAR overflow → 500). |
| 6 | **`call_remark` / `remark` columns** — use **TEXT** (or length ≥ 4000); validate max length server-side before insert. |
| 7 | Parse tagged `callRemark` with `parseTaggedCallRemark()`; normalize category via `normalizeStatusCategory()` — **`schedule`** must be allowed. |
| 8 | **After success:** return updated **`lead`** + **`nextLead`** (per §4.5); include row in **`scheduledLeads`** / **`rescheduledLeads`** when `next_follow_up_at > NOW()`. |
| 9 | Echo **`nextFollowUpAt`** on GET queue + history items (`dialledActions`, HR/admin calling-actions). |

#### Wrong vs correct persistence

**Wrong** (often causes 500 or bloated rows):

```sql
-- Appends to existing call_remark
UPDATE hr_calling_leads SET call_remark = CONCAT(call_remark, ' | ', $new) ...

-- action enum missing 'rescheduled'
-- next_follow_up_at NOT NULL but body only had nextFollowUpAt and mapper ignored it
```

**Correct:**

```sql
UPDATE hr_calling_leads
SET
  status = 'rescheduled',
  action = $action,  -- 'rescheduled' or 'follow_up'
  status_category = 'schedule',
  status_text = $status_text,
  remark = $remark,
  call_remark = $call_remark,
  next_follow_up_at = $next_follow_up_at::timestamptz,
  action_at = $action_at::timestamptz,
  updated_at = NOW()
WHERE id = $lead_id AND assigned_dealer_id = $dealer_id;
```

#### Example success response

```json
{
  "success": true,
  "data": {
    "lead": {
      "id": "lead-uuid",
      "status": "rescheduled",
      "action": "rescheduled",
      "statusCategory": "schedule",
      "statusText": "Callback Scheduled",
      "callRemark": "[schedule] Callback Scheduled | Adani panel 620w",
      "nextFollowUpAt": "2026-06-11T05:07:00.000Z"
    },
    "nextLead": { "id": "next-uuid", "status": "assigned", "name": "…" },
    "scheduledLeads": [
      { "id": "lead-uuid", "status": "rescheduled", "nextFollowUpAt": "2026-06-11T05:07:00.000Z" }
    ],
    "pendingCount": 40
  }
}
```

#### Backend checklist (reschedule)

- [ ] `rescheduled` and `follow_up` + `nextFollowUpAt` both update lead to `status: rescheduled`
- [ ] Accept `nextFollowUpAt` **and** `next_follow_up_at`
- [ ] `status_category: schedule` + `Callback Scheduled` (and other hold reasons) persist without 500
- [ ] `call_remark` TEXT / adequate length; replace not concat
- [ ] `in_progress` → `rescheduled` transition allowed
- [ ] Row appears in `scheduledLeads` when follow-up is in the future
- [ ] No 500 for valid dealer-owned lead — use `VAL_001` / `LEAD_005` instead

#### QA

1. Start call → Connected → Decision Pending → Callback Scheduled → pick future datetime → Submit → **200**, lead in **Scheduled** tab.
2. Same flow with long remark (repeat submit 5×) → still **200** (no remark bloat 500).
3. Send only `action: follow_up` + `next_follow_up_at` → same result as `rescheduled`.
4. Omit `nextFollowUpAt` → **400** `VAL_001`, not 500.
5. HR/Admin calling-actions list shows `actionAt`, `callRemark`, `nextFollowUpAt` for the row.

**Reference:** `BACKEND_CHANGES_REQUIRED.md` **§E.2**; `BACKEND_ADMIN_QUOTATION_STATUS.ts` → `patchDealerCallingQueueAction`.

### 4.6 Reference

- `BACKEND_ADMIN_QUOTATION_STATUS.ts` → `patchDealerCallingQueueAction`, `parseTaggedCallRemark`, `callingActionToApiJson`
- `lib/calling-remark-payload.ts` → `enrichCallingActionPayload()` (frontend body shape)

### 4.7 QA

1. Submit Current Lead with remarks → `GET` history shows `callRemark`; HR/admin calling actions list shows same text.
2. **Scheduled** tab: only future follow-ups; **Dialled** tab: past actions without duplicating scheduled rows.
3. Double **Start** on same lead → still same lead until Submit.
4. **Create Quotation** from calling → customer `notes` saved on `POST /customers`.
5. Reload app → remarks visible from API (not only browser storage).
6. HR **Dealer Calling Actions**: `GET` with `dealerId` + `startDate`/`endDate` returns filtered rows; **Custom** range sends both dates (see §4.8).
7. **Decision Pending reschedule** → Submit returns 200; lead in Scheduled tab; no Internal Server Error (see §4.5.2).

### 4.8 HR / Admin — GET calling-actions (date & dealer filters)

**Frontend:** `lib/api.ts` (`api.hr.callingActions.getAll`, `api.admin.callingActions.getAll`), `lib/calling-report-date-range.ts`, `app/dashboard/hr/page.tsx`, `app/dashboard/admin/page.tsx`.

HR refetches this list when **preset/custom range** or **dealer** changes and sends:

| Query param | Purpose |
|-------------|---------|
| `limit` | e.g. `2000` |
| `dealerId` | Optional — restrict to one salesperson (dealer UUID) |
| `range` | `daily` \| `weekly` \| `monthly` \| `last_month` \| `all` \| **`custom`** |
| `startDate`, `endDate` | ISO 8601 — inclusive window on **`action_at`** (recommended) |

For **every** preset including **custom**, the SPA sends **`startDate` and `endDate`** built from `buildCallingActionsQueryDates()` so the backend can filter by timestamp alone. If you only implement date filtering, that is sufficient; **`range`** can be logged or used as a hint.

**Paths to implement** (at least one per surface — see `lib/api.ts` fallback order):

- HR: `GET /api/hr/calling-actions`, `GET /api/hr/calling-queue/actions`
- Admin: `GET /api/admin/calling-actions`, `GET /api/admin/calling-queue/actions`, `GET /api/admin/leads/actions`

**Response:** array under `actions` / `callingActions` / `items` / `logs` / `data`; each item needs at minimum `id`, `leadId`, `dealerId`, `dealerName`, `action`, `actionAt`, `callRemark` (and customer fields if stored).

**Summary cards (Interested / Follow Up / Not Interested / Others):** see **§7** — requires structured `statusText` + `statusCategory` (or parseable `callRemark`) on every row.

**Weekly alignment:** same as `lib/calling-report-date-range.ts` — week = **Monday 00:00** through **Sunday end of day** in the timezone you document for reporting.

### Checklist

- [ ] PATCH action accepts `callRemark` + `call_remark` + structured `statusCategory` / `statusText` / `remark`
- [ ] Persist `call_remark` and structured columns; echo on GET
- [ ] Optional PATCH lead `customerNote`
- [ ] `POST /customers` accepts `notes` / `remarks`
- [ ] Queue GET returns `scheduledLeads`, `dialledActions`, `connectedActions`, `notConnectedActions` separately
- [ ] `start` does not return `nextLead`; completion actions do
- [ ] **`GET /current` returns `in_progress` lead until Submit** (§4.5.1)
- [ ] **`GET /next` does not skip past open `in_progress` call** (§4.5.1)
- [ ] **Reschedule Submit** — `rescheduled` / `follow_up` + `nextFollowUpAt` → `status: rescheduled`, no 500 (§4.5.2)
- [ ] HR/Admin **GET calling-actions** honours `dealerId` + `startDate` / `endDate` (and optional `range=custom`)

---

## 5. Frontend (implemented)

| File | Role |
|------|------|
| `lib/hr-upload-lead-display.ts` | Count buckets + table labels (`Unassigned`/`Pending` vs dealer name/`Completed`) |
| `app/dashboard/hr/page.tsx` | Uploaded Data tab, batch modal, **calling actions** date + dealer filters |
| `app/dashboard/admin/page.tsx` | **Calling Reports** tab — same date presets + custom + employee filter |
| `lib/calling-report-date-range.ts` | Preset/custom bounds + ISO params for HR calling-actions `GET` |
| `lib/quotation-pdf-display.ts` | PDF panel range + inverter brand options |
| `lib/calling-lead-assignee.ts` | Calling assignee match + `LEAD_004` detection |
| `lib/calling-remark-payload.ts` | Remark payload enrichment for PATCH action |
| `lib/calling-lead-session.ts` | Browser draft per lead (until API echoes back) |
| `lib/phone-dialer.ts` | Copy number on Start (no `tel:` redirect on desktop) |
| `app/dashboard/calling-data/page.tsx` | Queue tabs, pin lead until Submit, remarks + quotation prefill |
| `app/dashboard/new-quotation/page.tsx` | Prefill `prefillRemarks`, Back to Calling Data |
| `components/customer-details-form.tsx` | Optional `remarks` on customer step |

**HR table rules (frontend):**

- **Completed** — dealer name shown + status completed/done/closed → counts toward **Completed**
- **Unassigned** + **Pending** — all other rows (including dealer allocated but call not finished) → counts toward **Unassigned**
- HR summary shows **Unassigned** and **Completed** only (no separate Assigned badge)

**Fallback:** If API returns upload-time `assignedCount === rowCount` with no completed rows, counts are corrected client-side until GET aggregates are fixed.

---

## 6. Dealer dashboard — Total Value (approved quotations only)

**Frontend:** `app/dashboard/page.tsx` — the **Total Value** stat card sums amounts **only** where `status` is `approved` (case-insensitive). Uses the **same amount as the table AMOUNT column**: `subtotal` (package/set price) → `totalAmount` → `finalAmount`. Display: full INR (e.g. `₹1,89,000`), not lakhs shorthand. Subtitle: **“Approved quotation value”**.

**Current API:** Dealer loads all quotations via `GET /api/quotations` and aggregates client-side. **No new endpoint is required** if list/detail responses are complete.

### Required on `GET /api/quotations` (dealer JWT)

Each quotation object must include:

| Field | Notes |
|-------|--------|
| `status` | `pending`, `approved`, `rejected`, etc. — set to **`approved`** when admin approves |
| `subtotal` | Root and/or `pricing.subtotal` — **primary** (matches AMOUNT column / set price) |
| `totalAmount` | Root and/or `pricing.totalAmount` — fallback |
| `finalAmount` | Root and/or `pricing.finalAmount` — last fallback (after subsidy; can be much lower than subtotal) |

**Do not** include `pending` / `rejected` rows in any server-side `approvedQuotationValue` aggregate.

### Optional — `GET /api/dealers/me/dashboard-stats` (recommended)

Avoids loading full quotation lists for one number.

```json
{
  "success": true,
  "data": {
    "totalQuotations": 27,
    "uniqueCustomers": 23,
    "thisMonthQuotations": 0,
    "approvedQuotationCount": 5,
    "approvedQuotationValue": 1250000
  }
}
```

| Field | Rule |
|-------|------|
| `approvedQuotationValue` | `SUM(ABS(COALESCE(final_amount, total_amount, 0)))` WHERE `LOWER(status) = 'approved'` AND `dealer_id =` authenticated dealer |
| `approvedQuotationCount` | `COUNT(*)` with same filter |
| `thisMonthQuotations` | `created_at` in current calendar month (dealer scope) |

**SQL (adjust names):**

```sql
SELECT COALESCE(SUM(ABS(COALESCE(final_amount, total_amount, 0))), 0) AS approved_quotation_value,
       COUNT(*) AS approved_quotation_count
FROM quotations
WHERE dealer_id = $dealerId
  AND LOWER(TRIM(status)) = 'approved';
```

### Admin approval

When admin sets quotation status to approved (`PATCH` admin quotation status — see `BACKEND_ADMIN_QUOTATION_STATUS.ts`), persist `status = 'approved'` and keep `final_amount` / `total_amount` in sync with pricing so dealer dashboard totals match the **Amount** column in the table.

### Checklist

- [ ] `GET /api/quotations` returns `status`, `finalAmount` (or `pricing.finalAmount`), `totalAmount` for every dealer row
- [ ] Admin approve flow sets `status` to `approved` reliably
- [ ] (Optional) `GET /api/dealers/me/dashboard-stats` with `approvedQuotationValue`

**Full spec:** `BACKEND_CHANGES_REQUIRED.md` §7.9.

---

## 7. HR Dealer Actions — summary buckets (Interested / Follow Up / Not Interested)

**Frontend:** `app/dashboard/hr/page.tsx` (Dealer Actions tab), `lib/calling-action-summary.ts`, `lib/calling-remark-payload.ts`. **API-only** — no `localStorage` merge for this tab.

### Problem

HR summary cards were wrong when backend returned only `action: "called"` without the dealer’s selected **status text** (e.g. `Already Installed Solar` counted as Interested). Counts must match the **dealer calling status picker** (`app/dashboard/calling-data/page.tsx`).

**UI (May 2026):** Primary HR cards are **Connected** vs **Not Connected** (same rules as dealer Calling Data). Under **Connected**, sub-counts show Interested / Follow Up / Not Interested. Optional GET fields `connectedActions` / `notConnectedActions` on queue response are not required if each row has `statusText` or tagged `callRemark`.

### Required on PATCH (dealer completes a call)

`PATCH /api/dealers/me/calling-queue/{leadId}/action` (and HR/admin equivalents) must persist:

| Field | Example |
|-------|---------|
| `action` | `called` \| `follow_up` \| `not_interested` \| `rescheduled` |
| `callRemark` / `call_remark` | `[competition] Already Installed Solar \| optional note` |
| `statusCategory` / `status_category` | `competition`, `customer_intent`, `schedule`, `call_connectivity`, … |
| `statusText` / `status_text` | Exact label from picker, e.g. `Interested`, `Callback Later`, `Already Installed Solar` |

Tagged remark format (frontend sends all of the above):

```text
[{statusCategory}] {statusText} | {freeRemark}
```

Reference: `enrichCallingActionPayload()` in `lib/calling-remark-payload.ts`, `BACKEND_ADMIN_QUOTATION_STATUS.ts` (`patchDealerCallingQueueAction`).

### Required on GET (HR / Admin calling-actions)

Each row in `GET /api/hr/calling-actions` (and admin paths in §4.8) must echo:

| Field | Required for summary |
|-------|----------------------|
| `action`, `actionAt` | Yes |
| `callRemark` or `call_remark` | Yes (fallback parse) |
| `statusCategory` / `status_category` | **Strongly recommended** |
| `statusText` / `status_text` | **Strongly recommended** — exact picker label |
| `dealerId`, `dealerName`, `leadId` | Yes |
| Customer `name`, `mobile`, `address` | Display only |

Frontend classification (`lib/calling-action-summary.ts`):

| Bucket | Examples |
|--------|----------|
| **Interested** | `Interested`, `Highly Interested`, `Site Visit Scheduled`, `Quotation Shared`, `Valid Lead`, … |
| **Follow Up** | `Callback Later`, `Rescheduled`, `Follow-up Pending`, `action: follow_up` |
| **Not Interested** | `Not Interested`, `Already Installed Solar`, `Chose Competitor`, `action: not_interested` |
| **Others** | `start`, connectivity-only rows, unclassified |

Do **not** classify using substring `includes("interested")` on status text.

### Optional — server-side aggregates

```json
{
  "actions": [ /* ... */ ],
  "summary": {
    "interested": 12,
    "followUp": 5,
    "notInterested": 48,
    "others": 3,
    "total": 68
  }
}
```

If omitted, frontend computes from `actions[]` using the same rules.

### Checklist

- [ ] PATCH persists `status_category` + `status_text` + `call_remark` on every submit
- [ ] GET returns structured fields on every action row (not only `action: called`)
- [ ] `Already Installed Solar` / `Not Interested` rows are **not** counted as Interested
- [ ] `Interested` / `Highly Interested` rows count as Interested
- [ ] HR GET honours `dealerId` + `startDate` / `endDate` for **All Dealers** and per-dealer filters

**Full spec:** `BACKEND_CHANGES_REQUIRED.md` §J.1.

---

## 7.1 Dealer Calling Data — backend-only history and single-count totals

**Frontend:** `app/dashboard/calling-data/page.tsx` (analytics cards + tabs).

### Problem

The same call action was being counted twice when identical rows arrived from:
- backend API action history
- browser local cache fallback rows

Frontend is now aligned to **backend source of truth** for calling action history/counts.

### Backend requirement

Make backend responses complete enough so UI never needs local history fallback for counts:

1. `GET /api/dealers/me/calling-queue/next` and `/current` should return action arrays (`recentActions` / `actionHistory` / `dialledActions` / `connectedActions` / `notConnectedActions`) as needed for tabs + analytics.
2. `GET /api/dealers/calling-actions` (or equivalent already used by dealer analytics) should return canonical rows for the logged-in dealer.
3. Each action row must have a stable unique `id` plus `leadId`, `action`, `actionAt`, `callRemark` (and ideally `statusText` / `statusCategory`).
4. Do not emit duplicate action rows for the same action event (same logical call submit).

### Optional hardening (recommended)

- Add an idempotency/uniqueness rule for action inserts (for example by `(lead_id, action, action_at)` or a backend-generated action UUID) to prevent double-write races.
- If your write path can retry internally, ensure duplicate retries return existing row instead of creating a new one.

### QA

1. Submit one call outcome once from dealer Calling Data.
2. Refresh page; counts should increase by exactly **1** in the relevant bucket.
3. Open in second tab/device; same counts and no duplication.
4. Calling actions GET should show one row for that submit.

---

## 6. Account Management — Payment Management dealer filter

**Frontend:** `app/dashboard/account-management/page.tsx` — **Payment Management** tab filters approved payment rows by dealer (dropdown **All Dealers** / specific dealer / **Unassigned**).

**Filtering is client-side today.** No new endpoint is required if list payloads already include dealer fields.

### Required on approved quotation list

Used by account-management: `GET /api/quotations?status=approved` (or role-scoped equivalent).

Each row **must** include:

| Field | Purpose |
|-------|---------|
| `dealerId` / `dealer_id` | Filter key (UUID) |
| `dealer` | `{ id, firstName, lastName, mobile, email, username, role }` for display |
| `statusApprovedAt` / `approved_at` | Approve-date range filter |
| `fileLoginAt` / `file_login_at` | File-login date filter |
| `paymentType` / `payment_type`, `paymentStatus`, `paymentMode` | Payment-type / status filters |
| `installments` / `paymentPhases` / `payment_phases` | Installment **count** filter (array length) |
| `subtotal`, `remaining`, `remainingAmount` | Payment amounts |
| `bankName`, `bankIfsc` | Loan / cash+loan display |

**Installment count filter:** Frontend matches `phases.length === N` (exact count). Persist the full installment array on PATCH; do not return stale partial arrays.

**Installment remove + Submit (Jul 2026):** When Account Management removes rows and clicks Submit, frontend sends `replaceInstallments: true` and tries **`PUT /api/quotations/{id}/installments`** first. Backend must **DELETE all existing installment rows** and insert exactly the body array (`[]` clears all). **Do not merge/upsert** — deleted rows must not reappear on GET. See **`BACKEND_CHANGES_REQUIRED.md` §AB** and **`BACKEND_INSTALLMENT_REPLACE.ts`**.

**Final Settlement (Jul 2026):** Account Management **Submit final settlement** — settlement amount = **Remaining only** (e.g. ₹2,000 → discount `d`). Client now calls **`api.quotations.finalizeSettlement`** which persists to the DB and **throws if nothing saved** (no localStorage fallback when API is on). Call order: (1) **`POST /final-settlement`** (preferred atomic), else (2) `PATCH /pricing` with absolute `discountAmount` + `PATCH /payment-details` **without phases** (`paymentStatus=completed`, `remaining=0`, `finalSettlementAmount`), else (3) `PATCH /discount` (absolute INR). **Do not** re-PUT installments (that caused `Total paid (290000) cannot exceed payable after discount (212000)`). GET must return **`finalSettlementApplied:true`** (and/or `finalSettlementAmount>0`) so the button stays hidden after refresh on any device. Never return `remaining:0`/`completed` when unpaid gap exists without discount. Full spec: **`BACKEND_FINAL_SETTLEMENT.md`**; copy-paste controllers: **`BACKEND_FINAL_SETTLEMENT.ts`**.

**Revert Settlement (Jul 2026):** Manage → **Revert settlement** undoes a mistaken discount `d` (e.g. −₹197,000). Client: **`api.quotations.revertSettlement`**. Preferred: **`POST /quotations/:id/revert-final-settlement`** (also `DELETE /final-settlement`). Clears `finalSettlementApplied` / amount, restores discount/remaining/status; installments unpaid. Spec: **`BACKEND_REVERT_SETTLEMENT.md`**.

**Role dashboard sync (Jul 2026):** Admin/Accounts updates to Installation / Metering / Final confirmation / Payments must appear in the **individual role logins** (installer, metering, baldev, account-management) on **any device**. Today "Send to Installer" and workflow maps live in browser `localStorage`, and stage-write endpoints silently no-op on 404, so cross-device individual logins don't sync. Backend must persist + return canonical fields (`installationReadyForInstaller`, `installationReleasedAt`, `installationStatus`, `meteringStage/meteringStatus`, `mcoStatus`, `paymentStatus`, `remaining`, `discountAmount`, `subsidyCheques`, `installments`) and set them together on each transition (metering completion must set `installationStatus=pending_baldev`). Full spec: **`BACKEND_ROLE_DASHBOARD_SYNC.md`**.

### Payment Excel — Customer Journey columns (Jul 2026)

**Frontend:** `app/dashboard/account-management/page.tsx` → **Download Excel** (client-side CSV).

**No new endpoint.** Append these columns after payment amounts:

| CSV column | Backend dependency |
|------------|-------------------|
| Installment Count | `installments` / `payment_phases` array length |
| Admin Approval Status | `status` |
| Installation Status | `installationStatus` / `installation_status` |
| Metering Status | `meteringStage`, `meteringStatus`, `mcoStatus` (+ install status fallback) |
| Final Confirmation Status | `installation_status` / metering when `pending_baldev` |
| **File Status** (last) | `installation_status` + `status` (see §AC label table) |

**Critical:** `GET /api/quotations?status=approved` must return **`installationStatus`** and metering workflow fields on every row. If missing, Excel shows **Workflow Pending** for all rows after refresh.

### Installation FILE STATUS mapping (Aug 2026)

Payment Management **FILE STATUS → Installation** (and dealer journey) must match Admin → Installation tabs:

| Admin Installation tab | Persist / return on GET | UI label |
|------------------------|-------------------------|----------|
| Pending Installation | `pending_installer` or `installer_in_progress` (+ release flags) | **Pending** |
| Partial Approved | `installer_partial_approved` / `installationPartialApproved: true` | **In Progress** |
| Approved Installation | `installer_approved` (+ `installerApprovedAt` / photos) | **Approved** |

**Do not** map `installer_in_progress` → In Progress for this column — that row stays in **Pending Installation**.

Account filter **Installation · Pending** must include the same Send-to-Installer set as Admin Pending Installation (counts should match). Requires release flags on list GET — see **§25**.

### Metering FILE STATUS mapping (Jul 2026)

Payment Management **FILE STATUS → Metering** (and dealer journey panel) must match Admin → Metering tabs:

| Admin tab | Backend field / value | UI label |
|-----------|----------------------|----------|
| Meter Pending | `pending_metering` | Pending |
| Meter in Discom | `metering_approved` | In Progress |
| WCC Pending | `meteringWccAfterDiscom: true` | In Progress |
| Meter Installation Pending | `meter_installation_pending` | In Progress |
| Final Step | `mco` | **Completed** |
| Not in metering | (empty) | Pending |

**Full spec:** **`BACKEND_CHANGES_REQUIRED.md` §AC**, **`BACKEND_PAYMENT_EXCEL_JOURNEY_STATUS.ts`**, frontend `lib/customer-journey.ts` → `resolveMeteringJourneyStatus`.

### Optional — server-side dealer filter (performance)

When the approved list is large:

```
GET /api/quotations?status=approved&dealerId={uuid}
GET /api/quotations?status=approved&dealerId=unassigned
```

- Auth: **account-management**, **admin** (same as existing approved list).
- `dealerId=unassigned` → rows with null/empty `dealer_id`.
- Omit param → all dealers (current behaviour).

### Optional — server-side installment count

```
GET /api/quotations?status=approved&installmentCount=2
```

Exact match on number of installment/phase rows (not “has installment 2”).

### Checklist

- [ ] Approved list returns `dealerId` + nested `dealer` on every row used by account-management
- [ ] `installments` / `payment_phases` array reflects true count after PATCH **replace** (not merge)
- [ ] `PUT /quotations/{id}/installments` with `replace: true` deletes orphans
- [ ] `phases: []` clears all installments
- [ ] Approve / file-login timestamps exposed for date-range filters
- [ ] `installationStatus` + metering fields on approved list (Payment Excel §AC)
- [ ] Metering FILE STATUS: Final Step=`mco`→Completed; Meter Pending→Pending; Discom/WCC/Meter Install→In Progress
- [ ] Return `meteringWccAfterDiscom` on approved / admin / metering list GETs
- [ ] (Optional) `dealerId` query param on approved list for account-management role

**Reference:** `BACKEND_CHANGES_REQUIRED.md` §6.5, §7.9, **§AB**, **§AC**; `BACKEND_INSTALLMENT_REPLACE.ts`, `BACKEND_PAYMENT_EXCEL_JOURNEY_STATUS.ts`; `BACKEND_ADMIN_QUOTATION_STATUS.ts`.

---

## 7.2 Admin Overview — first-load optimization (instant cards)

**Frontend issue observed:** On first open of Admin Panel, Overview cards briefly show `0`/`₹0.0L` while heavy quotation list APIs are still loading.  
**Frontend mitigation shipped:** UI now shows loading placeholders and fetches `admin.statistics` earlier.  
**Backend optimization needed:** make overview stats API fast and cache-friendly.

### Required backend optimization

1. Add/optimize a lightweight endpoint for overview cards (or optimize existing one):
   - `GET /api/admin/statistics` (preferred existing path)
   - Must return quickly without waiting for full quotation list serialization.
2. Include pre-aggregated fields:
   - `overview.totalQuotations`
   - `overview.totalRevenue` (or equivalent absolute INR field)
   - `thisMonth.quotations`
   - `thisMonth.revenue`
   - `thisMonth.approvedCustomers` (unique count)
3. Ensure deterministic response envelope (`data.overview`, `data.thisMonth`) to avoid fallback parsing.

### Performance targets (recommended)

- p95 latency for stats endpoint: **< 300ms** (same region)
- Avoid N+1 joins; use aggregate SQL/materialized summary where possible
- Add indexes for date/status filters used by “this month”:
  - `quotations(status, status_approved_at)`
  - `quotations(created_at)`

### Caching recommendations

- Cache stats for short TTL (15-60s), per role/scope.
- Invalidate cache on quotation create/update/approve/revert-settlement/payment updates.
- Return `generatedAt` timestamp so UI can show freshness if needed.

### QA

1. Open `/dashboard/admin` with cold cache and 5k+ quotations.
2. Overview cards should populate quickly from stats API (not wait for full list).
3. Values should stay consistent after hard refresh and realtime mutations.

---

## 7.3 Admin Calling Reports — first-load optimization (instant counters)

**Frontend:** `app/dashboard/admin/page.tsx` → **Calling Reports** tab (`Employee Calling Actions` cards).  
**Observed UX issue:** on initial load, counters appear as `0` before calling-actions API finishes.

### Backend optimization required

1. Optimize `GET /api/admin/calling-actions` (or fallback paths in §4.8) for first paint:
   - return the newest filtered rows quickly
   - avoid expensive joins in the critical path when not needed for counters
   - support low-latency first-page response when `limit` is present (frontend now requests this tab independently with `limit=1000`)
2. Keep row payload stable and complete for classification:
   - `id`, `leadId`, `dealerId`, `dealerName`, `action`, `actionAt`, `callRemark`
   - recommended: `statusText`, `statusCategory`
3. Support fast date/dealer filtering server-side (`dealerId`, `startDate`, `endDate`) so client does not process very large all-time datasets for first render.
4. Default sort should be `actionAt DESC` (newest first) unless explicit sort is provided.

### Optional fast-summary endpoint (recommended)

If list endpoint is heavy, add:

```
GET /api/admin/calling-actions/summary?dealerId=&startDate=&endDate=
```

Example:

```json
{
  "data": {
    "totalCalls": 482,
    "connected": 301,
    "notConnected": 181,
    "connectedInterested": 97,
    "connectedFollowUp": 122,
    "connectedNotInterested": 82,
    "generatedAt": "2026-07-28T09:40:00Z"
  }
}
```

- Semantics must match frontend classifier in `lib/calling-action-summary.ts`.
- Enables instant cards while full list continues loading.

### Performance/caching targets

- p95 list query latency (filtered month/dealer): **< 400ms**
- p95 summary query latency: **< 200ms**
- Short TTL cache (15-60s) acceptable for summary with mutation-based invalidation.
- If list is huge, return paginated rows plus total/next cursor; frontend only needs first page for immediate render.

### QA

1. Open Admin → Calling Reports with cold browser tab.
2. Counters should populate quickly from API (no long zero-state phase).
3. Counts should match filtered action rows for same range/employee.
4. Refresh and cross-device check should stay consistent.

---

## 7.4 Admin Quotations tab — first-load optimization (instant list)

**Frontend:** `app/dashboard/admin/page.tsx` → **Quotations** tab.  
**Observed issue:** first tab open waits too long before rows appear (heavy admin bootstrap path).

### Backend optimization required

1. Optimize `GET /api/admin/quotations` for fast first page:
   - respond quickly for `page=1&limit=...`
   - avoid unnecessary heavy joins/computed blobs on list path
2. Keep lightweight list fields always present for immediate rendering:
   - `id`, `createdAt`, `status`, `dealerId`/`dealer`, `customer`, `subtotal`/`pricing.subtotal`
   - include minimal products/system metadata needed by current table
3. Ensure pagination metadata is returned (`total`, `pagination.totalPages`, or equivalent) so client can render progressively.
4. Default sort should be predictable (e.g. newest first) unless explicit sort is provided.

### Recommended split (best UX)

- `GET /api/admin/quotations` => lightweight list endpoint
- Heavy details/media can remain on detail endpoint (`GET /api/admin/quotations/{id}`) or optional expanded fields

This allows frontend to show first rows instantly, then hydrate deeper fields lazily.

### Performance targets

- p95 for first list page (`limit<=100`): **< 300ms**
- p95 for paginated subsequent pages: **< 400ms**

### QA

1. Open Admin → Quotations with cold cache.
2. First rows should appear quickly (without waiting for all pages/all enrichments).
3. Scrolling/pagination should progressively load additional rows.
4. Search and filters should remain responsive with large datasets.

---

## 7.5 Admin Installation tab — first-load optimization

**Frontend:** `app/dashboard/admin/page.tsx` → **Installation** (Pending / Partial / Approved).  
**Observed issue:** tab opens empty (“No installer records found”) for a long time because bootstrap waited serially on admin quotation pages, installer queues, payment-sent lists, then per-id detail fetches.

### Frontend mitigations (already shipped)

- Parallel fetch of `GET /admin/quotations` pages + installer queue + payment-sent rows
- Stamp release/installer flags on early preview rows
- Paint Installation list **before** slow `GET /admin/quotations/{id}` enrichment
- Debounced search (same as Quotations)
- Loading placeholder while bootstrap still empty

### Backend optimization required

1. **`GET /api/installer/queue`** (and status variants `pending_installer`, `approved`, etc.):
   - Fast first page (`limit<=1000`) without heavy media blobs
   - Include release flags + `installationStatus` / nested customer/dealer on each row
2. **`GET /api/admin/quotations`** list rows must include installer-visibility fields so Admin Installation does not depend on N× detail calls:
   - `installationReadyForInstaller` / `installation_ready_for_installer`
   - `installationReleasedAt` / `installation_released_at`
   - `installationStatus` / `installation_status`
   - `installationScheduledAt`, `installationTeamId` when set
3. Prefer a dedicated lightweight queue for admin ops if full quotation list remains heavy:
   - e.g. `GET /api/admin/installation/quotations?status=pending_installer|partial|approved&page=&limit=&search=`
4. Avoid requiring the client to call `GET /admin/quotations/{id}` just to show Installation rows.

### Performance targets

- p95 installer queue first page: **< 300ms**
- Admin Installation first visible rows: without waiting for per-id detail fan-out

### QA

1. Cold-open Admin → Installation → Pending Installation — rows (or “Loading…”) appear quickly; not a long false empty state.
2. Search by name/mobile/email/ID stays responsive.
3. After full bootstrap, counts match Payment “Send to Installer” releases.

---

## 7.6 Admin Metering tab — flow / first-load optimization

**Frontend:** `app/dashboard/admin/page.tsx` → **Metering** (WCC / Meter Pending / Discom / Meter Install / Bank / Pending payment / MCO).  
**Observed issue:** switching to Metering feels slow because client re-filters the full quotation list and metering stage helpers on every tab change; list also waits on heavy admin bootstrap.

### Frontend mitigations (already shipped)

- Tab switches use `startTransition` so the tab UI updates before heavy list work
- Quotation filter/buckets run only while Quotations workspace is active
- Metering stage buckets computed only when `operationalTab === "metering"`
- Debounced search + loading placeholders

### Backend optimization required

1. **List fields on `GET /api/admin/quotations`** (lightweight) must include metering workflow fields so Admin Metering does not need per-id hydration for queue membership:
   - `installationStatus` / `installation_status`
   - `meteringStatus` / `metering_status`
   - `meteringApprovedAt` / `metering_approved_at`
   - `mcoStatus` / `mcoAt` (or equivalents)
   - `meteringWccAfterDiscom` / `metering_wcc_after_discom`
   - Discom fields used by UI (`discomName`, `discomLocation`, remarks) when already known
2. Prefer dedicated admin metering queue (best at scale):

```
GET /api/admin/metering/quotations?stage=wcc|processing|approved|meter_install|bank_process|pending_payment|mco&page=&limit=&search=
```

3. Keep completion media / heavy docs on detail endpoints only.
4. Server-side `search` on name / mobile / quotation id for metering queue.

### Performance targets

- p95 metering queue first page: **< 300ms**
- Tab switch should not require refetching the entire admin quotation corpus

### QA

1. Cold-open Admin → Metering → Meter Pending — rows or loading appear quickly.
2. Switching Installation ↔ Metering ↔ Quotations feels responsive.
3. Stage chips (WCC / Bank / MCO) counts match backend stage fields.

---

## 7. Admin Overview — total kW (capacity) by dealer

**Frontend:** `app/dashboard/admin/page.tsx` — **Overview → Dealers by Revenue** sums **system kW** from each dealer’s **approved** quotations (same approval-date + dealer filters as revenue). Example: Sunil with 12 approved quotations this month → **total kW = sum of all 12 system sizes**.

**Calculation is client-side** via:
- `lib/merge-quotation-products.ts` — merges product fields from all API shapes
- `lib/quotation-system-kw.ts` — computes kW per quotation and sums

**Endpoint used today:** `GET /api/admin/quotations` (full list; no new endpoint required).

---

### Required — `GET /admin/quotations` list rows

Each quotation row must include enough **product / system-size** data to compute kW. The frontend merges these sources (in priority order):

| Source | Notes |
|--------|--------|
| `products` | JSON/JSONB object (preferred) — may be stringified JSON |
| `quotationProduct` | Sequelize / separate-table row (object) |
| `quotationProducts[]` | Array — first row used if present |
| Flattened root fields | `panelSize` / `panel_size`, `panelQuantity` / `panel_quantity`, etc. |
| Precomputed (best) | `systemKw` / `system_kw` or `systemSize` / `system_size` |

**Do not** return `products: {}` with no panel fields anywhere else — that produces **0 kW** even when revenue is correct.

#### Fields used to compute kW (by system type)

| System type | Required fields (camelCase or snake_case) |
|-------------|-------------------------------------------|
| DCR / Non-DCR | `systemType`, `panelSize`, `panelQuantity` |
| DCR-only | `dcrPanelSize`, `dcrPanelQuantity` (or same as panel fields) |
| BOTH | `dcrPanelSize`, `dcrPanelQuantity`, `nonDcrPanelSize`, `nonDcrPanelQuantity` |
| CUSTOMIZE | `customPanels[]` with `size`, `quantity` |
| Fallback | `inverterSize`, then `structureSize` |
| Precomputed | `systemKw` / `system_kw` (numeric kW) or `systemSize` / `system_size` (e.g. `"5.5kW"`) |

#### kW formula (matches frontend `calculateSystemSize`)

```
kW = (panelSizeW × panelQuantity) / 1000
```

For BOTH: sum DCR kW + Non-DCR kW. For CUSTOMIZE: sum all custom panel rows.

#### Also required on same rows (already used for revenue card)

| Field | Purpose |
|-------|---------|
| `status` = `approved` | Only approved rows count toward kW |
| `statusApprovedAt` / `status_approved_at` / `approvedAt` | Date-range filter (default: this month) |
| `dealerId` / `dealer_id` + nested `dealer` | Per-dealer breakdown |
| `pricing.subtotal` or flattened `subtotal` | Revenue (unchanged) |

---

### Recommended — normalized `products` on list responses

If product data lives in `quotation_products` table, **either**:

1. **Include joined row** as `quotationProduct` / `quotationProducts` on list (frontend merges automatically), **or**
2. **Serialize merged `products`** on every list/detail response (simplest for all clients):

```json
{
  "id": "uuid",
  "status": "approved",
  "statusApprovedAt": "2026-05-15T10:00:00Z",
  "dealerId": "dealer-uuid",
  "subtotal": 297000,
  "products": {
    "systemType": "non-dcr",
    "panelSize": "550W",
    "panelQuantity": 12
  }
}
```

Or with precomputed size (fastest, no parsing):

```json
{
  "systemKw": 6.6,
  "products": { "systemType": "non-dcr", "panelSize": "550W", "panelQuantity": 12 }
}
```

---

### Optional — server-side aggregates

For faster admin dashboard when quotation volume is high:

```
GET /api/admin/overview/dealer-stats?range=this_month&dealerId=
```

```json
{
  "dealers": [
    {
      "dealerId": "uuid",
      "dealerName": "Sunil Choudhry",
      "approvedCount": 12,
      "revenue": 2970000,
      "totalKw": 72.6
    }
  ],
  "totalKw": 842.3,
  "totalRevenue": 125000000
}
```

- `totalKw` = sum of per-quotation system size for **approved** rows in range (same rules as frontend, or use stored `system_kw`).
- Filter params: `this_month`, `week`, `last_month`, `custom` + `from`/`to`, optional `dealerId`.

---

### Optional — persisted `system_kw` column

```sql
ALTER TABLE quotations ADD COLUMN system_kw NUMERIC(10,2) NULL;
```

Set on create/update from products (same formula as frontend). Return as `systemKw` / `system_kw` on list/detail. Frontend **prefers this** when present.

Example trigger on product save:

```sql
-- Pseudocode: system_kw = (parse_w(panel_size) * panel_quantity) / 1000
UPDATE quotations SET system_kw = computed_kw WHERE id = :id;
```

---

### Backend checklist

- [ ] `GET /admin/quotations` includes product data (`products` **or** `quotationProduct` **or** root panel fields **or** `system_kw`)
- [ ] Empty `products: {}` without panel fields elsewhere is fixed (root cause of 0 kW in production)
- [ ] `statusApprovedAt` set when status becomes `approved`
- [ ] `dealerId` present on every quotation row
- [ ] (Recommended) Merge `quotationProduct` into `products` on list serializer
- [ ] (Optional) `system_kw` column maintained on quotation create/update
- [ ] (Optional) `GET /admin/overview/dealer-stats` with `totalKw` per dealer

### QA — verify kW matches revenue dealers

1. Pick dealer with known approved count (e.g. 12 this month).
2. Open admin **Overview → Dealers by Revenue** — kW should be **> 0** if quotations have panel config.
3. Sum manually: each approved quotation’s `(panelSize × panelQuantity) / 1000` should match dealer total (± rounding).
4. If revenue correct but kW still 0 → inspect API row: missing `products`, `quotationProduct`, and panel root fields.

**Reference:** `lib/merge-quotation-products.ts`, `lib/quotation-system-kw.ts`, `lib/pricing-tables.ts` (`calculateSystemSize`).

---

## 8. Mobile app — API URL (HTTPS)

**Frontend:** Capacitor WebView + `lib/resolve-api-base-url.ts` uses **`https://api.inventory.chairbordsolar.com/api`**.

- HTTP URLs **301 redirect to HTTPS**; Android WebView **fails POST login** on redirect.
- **No API code change** if production serves HTTPS on the same host.
- Ensure CORS allows `https://quotation.chairbordsolar.com` (and dev origins if needed).

---

## 9. Payment Management → Admin Installation (Accounts release only)

> **BLOCKER — data not showing:** Admin Installation tab stays empty until backend implements **`PATCH /quotations/{id}/installation-release`** and returns release fields on **`GET /admin/quotations`**.  
> **Give backend team:** [`BACKEND_INSTALLATION_RELEASE.md`](./BACKEND_INSTALLATION_RELEASE.md) (step-by-step + SQL + curl QA) and `BACKEND_ADMIN_QUOTATION_STATUS.ts` → `patchQuotationInstallationRelease`.

**Frontend:** `app/dashboard/account-management/page.tsx` (Payment Management / **Send to Installer**), `app/dashboard/admin/page.tsx` (Admin → **Installation**), `lib/operational-install-queue.ts` (`shouldShowInAdminInstallationTab`, `isQuotationSentToInstaller`).

**Full spec:** `BACKEND_CHANGES_REQUIRED.md` — **Installation release & planned installation date**, **§6.4.C.7–C.8**, **§M**.

### Root cause (why Installation tab is empty today)

| Step | Expected | If backend missing |
|------|----------|-------------------|
| Account team clicks **Send to Installer** | `PATCH …/installation-release` saves DB flags | 404/403 → only browser localStorage; admin refresh loses data |
| Admin opens **Installation** tab | `GET /admin/quotations` returns `installationReadyForInstaller: true` | Field absent/false → frontend hides all rows |
| Green badge in Payment Management | Same flags on `GET /quotations?status=approved` | Badge may show locally but admin panel empty |

**Minimum backend deliverable:** Implement §A + §B below, then verify with curl in `BACKEND_INSTALLATION_RELEASE.md` §11.

### Product rule (what the UI enforces)

| Payment Management (Account team) | Admin → Installation tab |
|-----------------------------------|---------------------------|
| **Send to Installer** **not** clicked | Row **must not** appear |
| **Sent to installer** (badge shown) | Row **appears** |
| Sent, **no installation photos** | **Pending Installation** |
| Sent, **photos uploaded** / `installer_approved` | **Approved Installation** |
| After **Send to Metering** (manual) | Row leaves Installation → **Metering** tab |

The frontend **only** treats a quotation as “sent” when **`installationReadyForInstaller === true`** and/or **`installationReleasedAt`** is set (from API or the release PATCH). It does **not** show approved quotations that were never released from Payment Management.

### Problem if backend is incomplete

- Payment Management shows **Sent to installer**, but Admin **Installation** is empty after refresh (especially on another browser/device) → release flags not persisted or not returned on **`GET /api/admin/quotations`**.
- Non-released approved quotations appear in installer/admin lists → queue not gated on release fields.
- Upload completes but row stays in **Pending** → `installationStatus` / image URLs not returned on admin list GET.

### Required quotation fields (persist + return on GET)

| Field (camelCase) | snake_case | Type | When set |
|-------------------|------------|------|----------|
| `installationReadyForInstaller` | `installation_ready_for_installer` | boolean | Account team clicks **Send to Installer** |
| `installationReleasedAt` | `installation_released_at` | ISO 8601 | Same action |
| `installationStatus` | `installation_status` | string | Workflow (see below) |
| `installationScheduledAt` | `installation_scheduled_at` | `YYYY-MM-DD` | Optional; admin planned date |
| `installationTeamId` | `installation_team_id` | UUID | Optional; team assignment |

Also return installation **photo URLs** on list/detail (`documents`, `siteCompletionImages`, `installationImageUrls`, per-field `*Url`, etc.) so **Approved Installation** works after refresh without relying on browser cache.

### A) PATCH — release to installer (Account Management)

**Preferred:** `PATCH /api/quotations/{quotationId}/installation-release`

**Body:**

```json
{
  "installationReadyForInstaller": true,
  "installationReleasedAt": "2026-06-05T10:30:00.000Z"
}
```

**Backend must:**

1. Set `installation_ready_for_installer = true` and `installation_released_at` (prefer client ISO or server `NOW()`).
2. Set **`installation_status = pending_installer`** when first released (recommended — matches **Pending Installation** tab).
3. **Do not** add the row to installer/admin operational lists until this PATCH succeeds.
4. **Auth:** account-management role (or equivalent).

**Fallback paths** (frontend tries in order — see `lib/api.ts` → `releaseForInstallation`):

- `PATCH /api/quotations/{id}/installation/ready`
- `PATCH /api/quotations/{id}/payment-details` (merge only release fields; do not wipe unrelated payment data)

### B) GET — list endpoints must echo release + workflow

Return the fields above on **each quotation object** (top level, not only nested under undocumented keys):

| Endpoint | Used by |
|----------|---------|
| `GET /api/admin/quotations` | Admin → Installation tab |
| `GET /api/quotations/{id}` | Row refresh after upload |
| Account Management approved/payments list | Payment Management **Sent to installer** badge |
| `GET /api/installer/quotations` | Installer dashboard (nested `quotation` OK if flattened fields also present) |

**Installer queue filter:** Only return quotations where **`installation_ready_for_installer = true`** OR **`installation_released_at IS NOT NULL`**. Do **not** include rows that are merely `status = approved` without release. See **§M** in `BACKEND_CHANGES_REQUIRED.md`.

### C) Installation workflow — Pending vs Approved tabs

**Pending Installation** (sent, work not done):

- `installation_status` in: `pending_installer`, `installer_in_progress`, `in_progress`, or empty/null right after release.

**Approved Installation** (photos uploaded / install complete):

- `installation_status` in: `installer_approved`, `pending_baldev`, `baldev_approved`, `completed`
- **Plus:** persist and return at least one installation completion image URL on the quotation row.
- **Exclude** rows already in metering: `pending_metering`, `metering_in_progress`, `metering_approved`, `mco` — these belong only on Admin → **Metering** (see **§11**).

**On completion upload** (installer or admin):

- `POST` / `PATCH` installer completion routes → set **`installation_status = installer_approved`** (preferred).
- **Do not** auto-set **`pending_metering`** on upload — metering starts only when admin/installation team clicks **Send to Metering** (`PATCH` with `pending_metering`). See `sendQuotationToMetering()` in `lib/api.ts`.

**Revert to pending** (admin):

- Accept `installation_status = pending_installer` from admin JWT (idempotent **200**).

### D) PATCH — Send to Metering (manual handoff)

When admin/installation team sends to metering, accept:

```json
{
  "installationStatus": "pending_metering",
  "installation_status": "pending_metering"
}
```

**Paths tried by frontend:** `PATCH /api/admin/quotations/{id}/installation-status` (and fallbacks in `lib/api.ts`).

**Auth:** `admin`, `installation-team`, or `installer` (installation team uses same handoff).

After success, row should appear under Admin → **Metering → Processing**, not Installation.

### E) SQL / migration (if columns missing)

```sql
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS installation_ready_for_installer BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS installation_released_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS installation_scheduled_at DATE NULL,
  ADD COLUMN IF NOT EXISTS installation_team_id UUID NULL,
  ADD COLUMN IF NOT EXISTS installation_status TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_installation_release
  ON quotations (installation_ready_for_installer, installation_released_at)
  WHERE installation_ready_for_installer = TRUE;
```

### Backend checklist

- [ ] `PATCH …/installation-release` (or `/installation/ready`) persists release flag + timestamp
- [ ] First release sets `installation_status = pending_installer` (recommended)
- [ ] `GET /api/admin/quotations` returns `installationReadyForInstaller`, `installationReleasedAt`, `installationStatus` on every row
- [ ] Account Management payments/approved list returns same release fields (for **Sent to installer** badge)
- [ ] Installer queue GET **only** includes released quotations
- [ ] Completion upload sets `installer_approved` + returns image URLs on subsequent GET
- [ ] Upload does **not** auto-advance to `pending_metering`
- [ ] Manual **Send to Metering** PATCH allowed for admin + installation-team
- [ ] Non-released approved quotations **never** appear in installation/installer operational APIs

### QA

1. Approve quotation in admin — **do not** send from Payment Management → **must not** appear in Admin Installation or installer queue.
2. Payment Management → **Send to Installer** → appears in Admin **Pending Installation** with **Sent to installation** date.
3. Hard refresh / different browser (same user role) → row still visible (proves server persistence, not localStorage only).
4. Upload installation photos → moves to **Approved Installation**; `GET /admin/quotations` shows `installationStatus: installer_approved` + URLs.
5. **Send to Metering** → row disappears from Installation; appears in Metering **Processing**.
6. Payment row still shows **Sent to installer**; unreleased neighbours stay out of Installation tab.

**Reference:** `lib/operational-install-queue.ts`, `lib/api.ts` (`releaseForInstallation`, `sendQuotationToMetering`), `BACKEND_CHANGES_REQUIRED.md` §M.

---

## 8. Admin Visitor Reports — list all visits with status (Jun 2026)

### Problem

Admin → **Visitor Reports** tab needs a **system-wide** visit list (all dealers, all visitors) with **status badges** and filters by **visitor**, **status**, **date range**, and **search**. Today there is only `GET /visitors/me/visits` (scoped to logged-in visitor) and `GET /quotations/{id}/visits` (per quotation). Admin cannot load a report without N+1 quotation calls.

### Frontend (implemented)

| File | Role |
|------|------|
| `app/dashboard/admin/page.tsx` | **Visitor Reports** tab — filters, status summary cards, visit rows |
| `lib/visit-report.ts` | Maps API visit → report row; normalizes `status`; client-side filters |
| `lib/api.ts` | `api.admin.visits.getAll()` → tries `GET /admin/visits`, falls back to `GET /visits` |

**Initial load:** `GET /admin/visits?limit=2000&status=all` (admin JWT). **Frontend fallback (Jun 2026):** if list endpoints fail, aggregates `GET /quotations/{id}/visits` across all admin quotations (`lib/load-admin-visitor-reports.ts`) so reports populate before `/admin/visits` ships.

**Client-side filters today** (server should support same query params for scale):

| Filter | Query param | Notes |
|--------|-------------|--------|
| Visitor | `visitorId` | Match `visit_assignments.visitor_id` |
| Status | `status` | `pending` \| `approved` \| `completed` \| `incomplete` \| `rejected` \| `rescheduled` \| **`all`** |
| Date range | `startDate`, `endDate` | ISO `YYYY-MM-DD` on `visitDate` |
| Search | `search` | Customer name, mobile, quotation id, location, visitor name, dealer name |

### Required endpoint (preferred)

```
GET /api/admin/visits
Authorization: Bearer {admin_token}
```

**Fallback (if same handler):** `GET /api/visits` with **admin** role — must return **all** visits, not dealer-scoped only.

### Response (200)

```json
{
  "success": true,
  "data": {
    "visits": [
      {
        "id": "visit_456",
        "quotationId": "QT-ABC123",
        "dealerId": "dealer_123",
        "visitDate": "2025-12-20",
        "visitTime": "14:00",
        "visitStartTime": "14:00",
        "visitEndTime": "16:00",
        "location": "123 MG Road, Jaipur, Rajasthan - 302012",
        "locationLink": "https://maps.google.com/?q=26.9124,75.7873",
        "notes": "Customer prefers afternoon visit",
        "status": "completed",
        "rejectionReason": null,
        "createdAt": "2025-12-17T14:30:00Z",
        "updatedAt": "2025-12-20T16:05:00Z",
        "visitors": [
          { "visitorId": "visitor_001", "visitorName": "Rajesh Kumar" }
        ],
        "quotation": {
          "id": "QT-ABC123",
          "dealerId": "dealer_123",
          "status": "approved",
          "finalAmount": 285950
        },
        "customer": {
          "firstName": "Amit",
          "lastName": "Sharma",
          "mobile": "9876543210"
        },
        "dealer": {
          "id": "dealer_123",
          "firstName": "John",
          "lastName": "Doe"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 2000,
      "total": 142,
      "totalPages": 1
    }
  }
}
```

**Field aliases accepted by frontend mapper** (`lib/visit-report.ts`): `date` / `visitDate`, `visitStatus` / `visit_status` / `status`, `visitLocation` / `location`, `otherVisitors` / `visitors`, snake_case mirrors optional.

### Status enum (must match visitor dashboard)

`pending` → `approved` → (`completed` | `incomplete` | `rescheduled` | `rejected`)

Do **not** default omitted `status` to a filter that hides non-pending rows when `status=all` is sent.

### Auth & scope

| Role | `GET /admin/visits` |
|------|---------------------|
| **admin** | All visits |
| dealer | 403 (use own quotation visits) |
| visitor | 403 (use `GET /visitors/me/visits`) |

### SQL sketch (adjust names)

```sql
SELECT v.*,
       json_agg(json_build_object('visitorId', va.visitor_id, 'visitorName', va.visitor_name)) AS visitors
FROM visits v
LEFT JOIN visit_assignments va ON va.visit_id = v.id
LEFT JOIN quotations q ON q.id = v.quotation_id
LEFT JOIN customers c ON c.id = q.customer_id
LEFT JOIN dealers d ON d.id = v.dealer_id
WHERE ($1::text IS NULL OR $1 = 'all' OR v.status = $1)
  AND ($2::uuid IS NULL OR EXISTS (
        SELECT 1 FROM visit_assignments va2
        WHERE va2.visit_id = v.id AND va2.visitor_id = $2))
  AND ($3::date IS NULL OR v.visit_date >= $3)
  AND ($4::date IS NULL OR v.visit_date <= $4)
GROUP BY v.id
ORDER BY v.visit_date DESC, v.visit_time DESC
LIMIT $5 OFFSET $6;
```

Join **customer** and **dealer** name fields in application layer or JSON subselect for list performance.

### Indexes (recommended)

- Existing: `idx_visit_status`, `idx_visit_date`, `idx_assignment_visitor`
- Optional composite: `(visit_date DESC, status)` for admin report default sort

### Realtime (optional)

Emit `backend:mutation` with `path` containing `visit` when visit status changes so Admin Visitor Reports tab can refresh (frontend already listens when tab is open).

### Checklist

- [ ] Implement `GET /api/admin/visits` (admin auth)
- [ ] Support `status=all` and individual status values
- [ ] Support `visitorId`, `startDate`, `endDate`, `search`, `page`, `limit`
- [ ] Return `visitors[]` with `visitorId` + `visitorName` per visit
- [ ] Return nested `customer`, `dealer`, `quotation` (minimal fields OK for list)
- [ ] Return `rejectionReason` / `notes` for incomplete / rejected / rescheduled rows
- [ ] Paginate when `total > limit` (frontend currently requests `limit=2000`)
- [ ] 404 on `/admin/visits` → frontend falls back to `GET /visits` (implement one path in production)

### Completion details modal (admin — eye button on **Completed** rows)

**Frontend:** `components/admin-visit-details-dialog.tsx` → `GET /quotations/{quotationId}/visits`, match visit `id`, show **only** visitor-entered completion data (dimensions, notes, images).

**No new endpoint required** if `GET /quotations/{id}/visits` returns full completion payload for **admin** JWT (same fields as visitor complete flow).

| Field | Required for modal |
|-------|-------------------|
| `notes` | Visit / completion notes (e.g. `3kw`) |
| `length`, `width` | Site dimensions |
| `backLegFeet`, `midLegFeet`, `frontLegFeet` (or snake_case) | Leg measurements in feet |
| `unit` | `feet` or `cm` |
| `rowDiagramImage` / `row_diagram_image` | **Public or signed HTTPS URL** (not raw S3 path that 403s) |
| `meterImage` / `meter_image` | Same |
| `images` / `siteImages` / `completionImages` | Array of accessible image URLs |
| `completionDetails` / `siteDimensions` | Optional nested mirrors of above |

**Also fix on list/report rows (not in completion modal, but visible in report list):**

- `visitors[].visitorName` — not only `visitorId` UUID
- `customer.firstName` / `lastName` on quotation join — avoid `N/A` in report list

**Media:** Reuse **§U** (public/signed URLs) for visit upload URLs so row diagram / meter / site images open in browser.

### QA

1. Admin → Visitor Reports → all assigned visits appear with correct status badges.
2. Filter by **visitor** → only that visitor’s assignments show.
3. Filter by **status** = `completed` → only completed rows.
4. Date range **this month** matches `visitDate` boundaries.
5. Search by customer mobile or quotation id returns matching rows.
6. Visitor completes visit on mobile → admin report shows `completed` after refresh (or realtime).

**Reference:** `lib/visit-report.ts`, `app/dashboard/admin/page.tsx`, `BACKEND_CHANGES_REQUIRED.md` **§Z**.

---

## 10. Final confirmation — document upload (`Invalid quotation document payload`)

**Symptom:** Admin → **Final confirmation** → **Update Final Details** → **Save Details** fails with **`Invalid quotation document payload`**.

**Frontend (done):** `lib/api.ts` → `uploadFinalConfirmationDocuments`, `lib/final-confirmation-documents.ts`, `app/dashboard/admin/page.tsx`, `app/dashboard/baldev/page.tsx`.

**Full spec:** `BACKEND_CHANGES_REQUIRED.md` **§M**.

### Root cause

| What happened | Why |
|---------------|-----|
| UI sent `panelWarrantyFile`, `workCompletionWarrantyFile`, etc. | Correct field names for final confirmation |
| Request went to **`PATCH /quotations/{id}/documents`** | That route is **KYC-only** (Aadhaar, PAN, bank, `emailId`, …) |
| Server allowlists KYC keys only | Unknown keys → **`400`** `Invalid quotation document payload` |

**Fix:** Implement a **separate POST** handler for final-confirmation files. Do **not** add these keys to the KYC PATCH allowlist unless you intentionally merge both flows (not recommended).

### Minimum backend deliverable

**Implement:**

```
POST /api/admin/quotations/{quotationId}/final-confirmation-documents
Content-Type: multipart/form-data
Roles: admin, baldev
```

**Multipart keys (any subset per request):**

- `customerFinalBillFile`
- `panelWarrantyFile`
- `inverterWarrantyFile`
- `workCompletionWarrantyFile`

**Persist + return on GET** (each quotation row):

- `customerFinalBillFileUrl`, `panelWarrantyFileUrl`, `inverterWarrantyFileUrl`, `workCompletionWarrantyFileUrl`
- Optional: matching `*FileName` fields
- snake_case mirrors accepted

**Optional fallback** (frontend already tries if POST batch missing):

```
POST /api/quotations/{quotationId}/documents/upload
field=panelWarrantyFile&file=…
```

Extend existing per-file upload allowlist to include the four final-confirmation `field` values.

### Frontend retry order (for backend routing)

1. `POST /admin/quotations/{id}/final-confirmation-documents` ← **implement this first**
2. `POST /admin/quotations/{id}/documents`
3. `POST /quotations/{id}/final-confirmation-documents`
4. `POST /baldev/quotations/{id}/final-confirmation-documents`
5. `POST /quotations/{id}/documents`
6. Per-file: `POST …/documents/upload` with `field` + `file`

### QA

1. Upload Panel Warranty + Work Completion PDFs → **`200`**, URLs in response.
2. Re-open same quotation → GET list shows saved URLs (no re-upload required).
3. Baldev dashboard same flow with `baldev` JWT.
4. Dealer KYC **PATCH** `/documents` still works unchanged.

**Reference handler:** `BACKEND_ADMIN_QUOTATION_STATUS.ts` → `postAdminFinalConfirmationDocuments`

---

## 11. Admin Quotations tab — Send to Metering (manual handoff)

**Frontend (done):** Admin → **Quotations → All** — **Metering** button on each row (`app/dashboard/admin/page.tsx` → `handleSendToMetering`, `lib/api.ts` → `sendQuotationToMetering`).

**Copy-paste controllers + logging:** **`BACKEND_SEND_TO_METERING.ts`**.

### Error that must stop

```
Cannot send to metering from installation status 'pending_installer'
```

Admin may send while OPS is still **Pending Installer**. Backend MUST allow that for `admin` when body includes `force` / `adminOverride` / `allowFromPendingInstaller`, or on `PATCH|POST /admin/quotations/:id/send-to-metering`.

### What the UI does

| Trigger | Who | When button shows |
|---------|-----|-------------------|
| **Metering** | `admin` | Quotation **not** already in metering pipeline (`pending_metering`+) |
| Same button | `admin` | **`status` = `pending` or `approved`** (rejected/completed hidden) |
| After success | — | UI opens **Metering → Meter Pending**; row appears on **Metering dashboard** too |

Frontend body always includes:

```json
{
  "installationStatus": "pending_metering",
  "installation_status": "pending_metering",
  "meteringStatus": "pending_metering",
  "metering_status": "pending_metering",
  "force": true,
  "adminOverride": true,
  "allowFromPendingInstaller": true,
  "source": "admin"
}
```

If the server still rejects, frontend steps: `installer_approved` → `pending_metering`.

### Required backend endpoint

**Preferred:**

```
PATCH|POST /api/admin/quotations/{quotationId}/send-to-metering
```

**Also fix:**

```
PATCH /api/admin/quotations/{quotationId}/installation-status
```

(do not reject `pending_installer` → `pending_metering` for admin/force)

**Fallback paths** (frontend tries until one returns 2xx): see `sendQuotationToMetering()` / `patchOperationalWorkflowStatus()` in `lib/api.ts`.

### Persist + return on GET

After success, every GET (admin list + metering queue) must return:

```json
{
  "installationStatus": "pending_metering",
  "installation_status": "pending_metering",
  "meteringStatus": "pending_metering",
  "metering_status": "pending_metering"
}
```

`GET /installer/queue?status=pending_metering` must include these rows (Metering dashboard Meter Pending).

### Persist + return on GET (legacy)
After PATCH, **`GET /api/admin/quotations`** (and **`GET /api/metering/quotations`**) must return:

| Field | Value after handoff |
|-------|---------------------|
| `installationStatus` / `installation_status` | `pending_metering` (or keep `installer_approved` only if you mirror metering on separate column — frontend reads **both**) |
| `meteringStatus` / `metering_status` | `pending_metering` |
| Prior release flags | **Unchanged** — `installationReadyForInstaller`, `installationReleasedAt` stay set |

**Metering queue:** Row must appear in `GET /api/metering/quotations?status=processing` (or equivalent filter for `pending_metering` / `metering_in_progress`).

**Installation tab:** Row **stays visible** after `pending_metering`+ (Account → Send to Installer history). It moves to **Approved Installation** when upload is complete; Metering also shows the same row. Backend should keep returning `installationReadyForInstaller` / `installationReleasedAt` on GET.

### Business rules (recommended)

| Rule | Recommendation |
|------|----------------|
| Quotation `status` still **pending** | **Allow** admin override (frontend enables send) **or** return **`400` `VAL_001`** with clear message — do not **500** |
| Not released from Payment Management | **Allow** admin force handoff **or** reject with **`400`** — document your choice |
| Already `pending_metering` | Idempotent **`200`** with current row |
| Auto-advance on photo upload | **Do not** set `pending_metering` on upload — only explicit PATCH |

### Auth

- **`admin`** JWT: **required** on `PATCH /admin/quotations/{id}/installation-status`
- Optional: same for `installation-team` / `installer` on installer-scoped routes (unchanged)

### Checklist

- [ ] `PATCH …/installation-status` accepts `pending_metering` from **admin**
- [ ] Persists `installation_status` and/or `metering_status` on `quotations` table
- [ ] `GET /admin/quotations` returns updated stage on next load (no stale cache)
- [ ] `GET /metering/quotations` includes the row under processing/pending_metering
- [ ] Does **not** require `installer_approved` before `pending_metering` when caller is admin (Quotations tab early send)
- [ ] Optional: allow `status = pending` on quotation or return explicit validation error

### QA

1. Admin → Quotations → **Approved** row with **Pending Installer** → **Send to Metering** → **200**.
2. Row in **Metering → Processing**; **not** in Installation Pending/Approved.
3. `GET /admin/quotations` shows `installationStatus` / `meteringStatus` = `pending_metering` (or equivalent).
4. **Pending** quotation status row → send succeeds or **`400`** with message (no **500**).
5. Metering user sees row in their queue after handoff.

**Reference:** `lib/operational-install-queue.ts` (`shouldHideSentQuotationFromAdminInstallationTab`, `getAdminQuotationsTabSendToMeteringState`), `BACKEND_CHANGES_HANDOFF.md` §9.D.

---

## 12. Super Admin — Quotation login + Inventory data (Jul 2026)

**Frontend:** `/login` → Admin Panel → **Accounts** → **Open Inventory** (`/dashboard/inventory`).

**No second login:** quotation Admin session reuses the same JWT (`authToken` / `auth_token`). SPA maps Admin → inventory effective `super-admin` via `buildInventoryAuthUserFromQuotationSession` — never redirects to `/inventory-auth/login`.

**Full spec:** `BACKEND_CHANGES_REQUIRED.md` **§AD**, `BACKEND_SUPER_ADMIN_QUOTATION_LOGIN.ts`.

### Required backend (minimum)

1. **`POST /api/auth/login`** for admin / super-admin → correct `user.role` + JWT.
2. **Same Bearer** on inventory SA routes (no `/inventory-auth/login`).
3. **Local evidence to fix** (quotation Admin JWT today):

| Works | Broken (401) |
|-------|----------------|
| `GET /products` | `GET /users`, `/users?role=admin`, `/users/agents` |
| | `GET /sales`, `/stock-requests`, `/stock-returns`, `/admin-inventory` |

`GET /admin/users` → **404** — ignore; SPA uses `/users` only.

4. Shared allow-list **`admin` | `super-admin`** on all broken routes (same as `/products`).
5. `"Invalid token or user inactive"` only when JWT bad or `is_active = false`.

### Checklist

- [ ] Quotation Admin token: `GET /users?role=admin` → **200** (not 401)
- [ ] Same token: `/users/agents`, `/sales`, `/stock-requests`, `/stock-returns`, `/admin-inventory` → **200**
- [ ] Allow-list matches `/products`
- [ ] No dependency on `/admin/users`
- [ ] Open Inventory never asks for `/inventory-auth/login`

**Full spec:** `BACKEND_CHANGES_REQUIRED.md` **§AD.5.1**, `BACKEND_SUPER_ADMIN_QUOTATION_LOGIN.ts`.

---

## 13. Admin — Product Needed (installation-pending brand dashboard)

**Frontend:** Admin Panel → Overview → **Product Needed**  
**API call:** `GET /admin/product-needed` via `api.admin.productNeeded.getAll`  
**Full reference:** `BACKEND_ADMIN_PRODUCT_NEEDED.ts`  
**Client logic:** `lib/admin-product-needed.ts`, `lib/load-admin-product-needed.ts`

### Goal

Procurement dashboard for **installation-pending jobs only** (same gate as Admin → Pending Installation):

- One **brand card** per panel brand (Waaree, Adani, Tata…) with wattage / set lines inside
- One **brand card** per inverter brand with kW / set lines inside
- “As per the set” with missing qty → **1 set per job** (e.g. Tata across 2 jobs = **2 sets**)

Frontend already aggregates client-side from `GET /admin/quotations` when this route is missing. Ship the dedicated endpoint for correct filtering at scale.

### Required backend

1. **`GET /admin/product-needed`** (admin JWT only)
2. Query params:

| Param | Notes |
|-------|--------|
| `scope` | `installation_pending` (default) or `file_login`. Rejected never included. |
| `dealerId`, `search`, `startDate`, `endDate` | Optional filters |
| `dateField` | `installation_released` (default) or `file_login` or `created` |
| `page`, `limit` | Default limit 500, max 2000 |

3. **Eligibility**
   - `scope=installation_pending`: same gate as Pending Installation (approved, released to installer, not yet installer-approved)
   - `scope=file_login`: file login recorded (`already_login` / `login_now` or `file_login_at`), quotation **not approved**, **never rejected**
   - **Always exclude** `status=rejected`
4. Each row must include structured **`panelLines`** + **`inverterBrand` / `inverterSize` / `inverterQuantity`** (not summary strings alone)
5. Optionally return **`data.aggregates`** (brand cards) computed on the **full filtered set** before pagination — see `buildBrandAggregates` in `BACKEND_ADMIN_PRODUCT_NEEDED.ts`
6. Ensure **`GET /admin/quotations`** still returns release flags + products so SPA fallback works

### Response shape (minimum)

```json
{
  "success": true,
  "data": {
    "rows": [
      {
        "quotationId": "QT-…",
        "dealerId": "…",
        "customerName": "…",
        "customerMobile": "…",
        "dealerName": "…",
        "systemKw": "5kW",
        "systemType": "DCR",
        "panels": "Waaree 540W × 10",
        "inverter": "Vsole/Xwatt · 5kW",
        "panelLines": [{ "brand": "Waaree", "size": "540W", "quantity": 10 }],
        "inverterBrand": "Vsole/Xwatt",
        "inverterSize": "5kW",
        "inverterQuantity": 1,
        "installationReleasedAt": "2026-07-01T10:00:00.000Z",
        "quotationStatus": "approved"
      }
    ],
    "aggregates": {
      "jobCount": 22,
      "totalPanels": 151,
      "totalInverters": 22,
      "panels": [
        {
          "brand": "Waaree",
          "totalQuantity": 63,
          "jobCount": 8,
          "sizes": [
            { "size": "540W", "quantity": 54, "jobCount": 7, "unit": "panels" },
            { "size": "560W", "quantity": 9, "jobCount": 1, "unit": "panels" }
          ]
        },
        {
          "brand": "Tata",
          "totalQuantity": 2,
          "jobCount": 2,
          "sizes": [
            { "size": "As per the set", "quantity": 2, "jobCount": 2, "unit": "sets" }
          ]
        }
      ],
      "inverters": []
    },
    "pagination": { "page": 1, "limit": 2000, "total": 22, "totalPages": 1 }
  }
}
```

### Checklist

- [ ] `GET /admin/product-needed?scope=installation_pending` → **200** (admin)
- [ ] Dealer / visitor → **403**
- [ ] Only Pending Installation jobs (not Approved Installation / metering)
- [ ] `panelLines` present and wattage normalized (`540W`)
- [ ] Set packages with qty `0` count as **sets** (1 per job)
- [ ] Optional `aggregates.panels` / `aggregates.inverters` = one card per brand
- [ ] `dealerId` + date filters applied server-side
- [ ] SPA still works if route returns **404** (quotation-list fallback)

### QA

1. Send a job to installer → it appears in Product Needed; approve installation → it **leaves**.
2. Two Adani jobs (540W×10 and 620W×5) → **one Adani card** with two size lines (`10` and `5`), not two brand cards.
3. Two Tata “As per the set” jobs with qty 0 → Tata card shows **2 sets**.
4. Filter by dealer → totals only for that dealer.
5. Non-admin token → **403**.

**Reference:** `BACKEND_ADMIN_PRODUCT_NEEDED.ts`, `lib/admin-product-needed.ts` (`isQuotationEligibleForProductNeeded`, `aggregateProductNeededDashboard`).

---

## 14. Inventory — `products_created_by_fkey` on POST /products

**Frontend:** Quotation Admin → Open Super Admin → Add Product / Tally Import  
**Failing call:** `POST /api/products` → **500**  
**Live error:**
`insert or update on table "products" violates foreign key constraint "products_created_by_fkey"`

### Root cause

`products.created_by` is set to the **quotation Admin JWT user id**, but that id is **not** in inventory `users`.

### Backend deliverable (required)

**File:** `BACKEND_PRODUCTS_CREATED_BY.ts` — copy `resolveInventoryCreatedBy` into inventory `POST /products`.

| Step | Action |
|------|--------|
| 1 | If `jwt.sub` exists in inventory `users` → use it |
| 2 | Else if body `created_by` / `createdBy` is a valid inventory user → use it |
| 3 | Else if same `username` exists in inventory `users` → use it |
| 4 | Else **upsert** inventory user with `id = jwt.sub`, `role = super-admin` |
| 5 | Else fall back to any active super-admin; else **400** `INV_USER_MISSING` |

Never INSERT `products.created_by` with a bare JWT id that is absent from `users`.

Also:
- Honor JSON create without image / without serials (SPA attaches serials on PUT)
- Return real DB/error messages (not only `SYS_001` / `"Server error"`)

### Frontend already does

- Sends `created_by` when it can resolve an inventory user
- Creates product then PUT serials
- Clearer FK error copy

Frontend **cannot** fix this alone if the API ignores body `created_by` and does not upsert.

### Checklist

- [ ] Quotation Admin → Tally import / Add Product → **201/200** (no FK error)
- [ ] Inventory `users` has JWT sub **or** `created_by` → valid `users.id`
- [ ] Native inventory super-admin create unchanged
- [ ] Body `created_by` accepted when JWT user missing
- [ ] Missing actor → **400** `INV_USER_MISSING` with clear message

### QA

1. Quotation Admin login → Open Super Admin → import Inverter + serials → saved.
2. `SELECT * FROM users WHERE id = '<jwt-sub>';` → row exists (after upsert) **or** product.created_by points elsewhere valid.
3. Repeat create — no 500.

**Reference:** `BACKEND_PRODUCTS_CREATED_BY.ts`

---

## 15. Calling Data — drain Unassigned+Assigned to **0** + fix empty Current Lead

**Frontend:** Dealer → **Calling Data** (e.g. Harshita) + HR → **Uploaded Lead Data**  
**APIs:** `GET …/calling-queue/next|current` + `POST …/uploads/:id/assign-unassigned`  
**Full references:** `BACKEND_ASSIGN_UNASSIGNED.ts` + `BACKEND_CALLING_QUEUE_CURRENT.ts`  
**Related:** §3 (`LEAD_004` / claim), `BACKEND_CHANGES_REQUIRED.md` §7.7–7.8

### Live blocker (Jul 2026)

**HR Uploaded Data (example top row):** Unassigned **193** · Assigned **37** · Completed 2370  
**Dealer Calling Data (Harshita):** **“No calling data pending for you.”**

```
GET /api/dealers/me/calling-queue/current → 500 SYS_001
GET /api/dealers/me/calling-queue/next    → empty / no claim of Assigned or Unassigned
```

**Product requirement (any how):** every batch must reach Unassigned **0** and Assigned **0**. Remaining rows must appear as Current Lead for pool dealers until Completed absorbs them.

| Step | Who | What |
|------|-----|------|
| 1 | Backend + HR | `POST …/assign-unassigned` (or `/next` claim) → Unassigned **0** |
| 2 | Backend + Dealer | `/next` returns that dealer’s Assigned lead → they complete → Assigned drains |
| 3 | Repeat | Oldest uploads first until all batches are `0 / 0 / rowCount` |

SPA falls back across `/next`↔`/current` on 500 — but empty `/next` still blanks Current Lead. **Backend must ship both queue fix and assign-unassigned.**

### Required backend

#### A) Stop 500 on `/current` (minimum today)

| Rule | Detail |
|------|--------|
| Always **200** | `{ success: true, lead: null \| object, queue: [], … }` |
| No uncaught joins | Null assignee / missing upload / missing customer must not throw |
| Thin handler | Return dealer’s open `in_progress`/`assigned` row only; else `lead: null` |
| Optional | On unexpected error still return **200 empty** (not SYS_001) |

#### B) `/next` = FCFS source of truth

1. If dealer has open assigned/`in_progress` → return that lead.
2. Else claim **oldest unassigned** lead in uploads where dealer ∈ `dealerIds` / `eligibleDealerIds` (`FOR UPDATE SKIP LOCKED`).
3. Persist `assigned_dealer_id` before response (or auto-claim on `start` — §3).
4. Include lead in `lead` **and** `queue` / `pendingLeads` / `leads`.
5. On completion action → mark completed + return `nextLead` (repeat until pool empty).
6. Reclaim stuck Assigned (no activity 4–24h) back to unassigned pool.

#### C) Drain Unassigned → 0 (HR + upload) — **product priority**

**Full reference (implement this):** `BACKEND_ASSIGN_UNASSIGNED.ts`  
Also mirrored in: `BACKEND_ADMIN_QUOTATION_STATUS.ts` → `postHrLeadsUploadAssignUnassigned`

HR Uploaded Data still shows yellow **Unassigned** (193, 97, 74, …). Product wants that badge **to 0 first** by assigning remaining rows to the batch dealer pool (round-robin), then dealers work Assigned → Completed.

| Piece | Detail |
|-------|--------|
| **NEW** | `POST /hr/leads/uploads/:uploadId/assign-unassigned` — round-robin all unassigned in that upload to `upload.dealerIds` → `unassignedCount === 0` |
| Upload patch | Honor `assignmentMode=round_robin_all` when present → assign **every** new row; ignore `activeLimitPerDealer` cap |
| SPA upload (default) | Sends **`activeLimitPerDealer=1`** only (earlier working path). Does **not** send oversized limits. |
| ⚠️ Validator | Zod rejects `activeLimitPerDealer` / `activeLeadsLimit` **> 50** with **"Too big: expected number to be <=50"**. SPA always sends **1..50**. For full drain use `POST …/assign-unassigned`, or honor `round_robin_all` while ignoring the numeric cap. |
| Bulk order | SPA “Assign all unassigned (oldest first)” calls that POST per batch sorted by `uploadedAt ASC` |
| Counts | After assign: `unassignedCount === 0`, `assignedCount` rises, `completedCount` unchanged |
| Dealer UI | `/next` / `/current` return dealer’s next **assigned** lead FIFO (see `BACKEND_CALLING_QUEUE_CURRENT.ts`) |

```http
POST /api/hr/leads/uploads/:uploadId/assign-unassigned
Authorization: Bearer <HR_JWT>
Content-Type: application/json

{ "assignmentMode": "round_robin_all" }
```

```json
{
  "success": true,
  "uploadId": "…",
  "assigned": 193,
  "unassignedCount": 0,
  "unassignedRemaining": 0,
  "assignedCount": 230,
  "completedCount": 2370,
  "rowCount": 2600,
  "counts": { "assigned": 230, "unassigned": 0, "completed": 2370 }
}
```

#### C-2) Upload returns **500 "Internal server error"** (live bug)

**Call:** `POST /hr/leads/upload-csv` (multipart) → clicks **Assign Leads** → after a delay → `500`.
Validation now passes (SPA sends `activeLimitPerDealer=1`), so the crash is **inside** the handler.

Most likely causes — fix all:

| Cause | Fix |
|-------|-----|
| CSV parser throws on a bad/empty row, odd delimiter, or BOM/encoding | Wrap parse in try/catch → return **400 VAL_001** with row number, never uncaught 500 |
| Round-robin allocator throws (empty `dealerIds`, division, null dealer) | Guard: if `dealerIds.length === 0` → 400 VAL_002; skip nulls |
| Duplicate mobile / unique index violation on insert | Catch PG unique error → count as `skippedDuplicate`, keep going |
| FK on `assigned_dealer_id` (dealer id not in `dealers`/`users`) | Validate dealer ids exist before assign; 400 if unknown |
| Large CSV → request/DB timeout | Batch inserts (chunk 500–1000), stream parse, raise timeout, or return 202 + async |

**Contract:** handler must be fully wrapped so any failure returns a JSON error
(`{ success:false, error:{ code, message } }`) with **4xx for bad input**, and only
a true server fault is 500. Never let the CSV parse or allocator throw uncaught.

SPA resilience: the client retries 3 multipart shapes (file/csvFile, dealerIds[]/JSON,
activeLimitPerDealer/activeLeadsLimit) on `400/422/500/SYS_001`. If all 500, it surfaces
"Lead upload failed on the server (500)…". Fixing the handler above resolves it.

#### D) HR counts (§7.8)

Live `unassignedCount` + `assignedCount` + `completedCount` === `rowCount` from DB. Goal: Unassigned **0**, then Assigned **0**, Completed = rows.

### Response shape (both `/next` and `/current`)

```json
{
  "success": true,
  "lead": { "id": "…", "name": "…", "mobile": "…", "status": "assigned", "assignedDealerId": "<jwt-dealer-id>", "uploadBatchId": "…", "queuedAt": "…" },
  "currentLead": { },
  "nextLead": { },
  "queue": [ ],
  "pendingLeads": [ ],
  "leads": [ ],
  "scheduledLeads": [ ],
  "recentActions": [ ],
  "pendingCount": 1,
  "queuedCount": 0,
  "scheduledCount": 0,
  "completedCount": 0,
  "counts": { "pending": 1, "queued": 0, "scheduled": 0, "completed": 0 }
}
```

Empty: `"lead": null`, arrays `[]`, counts `0` — still **200**.

### Checklist

- [ ] `GET …/calling-queue/current` → **200** (never SYS_001) with or without a lead
- [ ] `GET …/calling-queue/next` → allocates FIFO unassigned when dealer free + Unassigned > 0; also returns next already-assigned lead
- [ ] Claim/lock so two dealers cannot get the same lead
- [ ] Completion returns `nextLead` until Unassigned+Assigned drain
- [ ] Stuck assigned reclaimed to pool (optional if all leads are pre-assigned)
- [ ] `POST …/uploads/:id/assign-unassigned` → Unassigned → 0 for that batch
- [ ] Upload honors `assignmentMode=round_robin_all` (no active-cap leftover queue)
- [ ] **`POST /hr/leads/upload-csv` never 500s on Assign Leads** — parse/insert/allocate hardened (§15-C-2); Zod max 50 still honored; chunked inserts for large CSVs
- [ ] Optional aliases `/lead-queue/next|current` or keep 404 (SPA falls through)

### QA

1. Dealer refresh Calling Data → Current Lead shows (no console 500 on `/current`).
2. Curl `/current` with no open lead → `200 { "lead": null }`.
3. Curl `/next` while batch has Unassigned → `200` with `assignedDealerId` set.
4. Complete call → next lead appears until batch Unassigned 0 / Assigned 0.
5. HR Uploaded Data badges match DB live counts.
6. HR **Assign unassigned** on a batch with Unassigned 193 → badge becomes **0**, Assigned rises by 193.
7. New CSV upload with dealers selected → Unassigned **0** immediately (`round_robin_all`).

**Reference:** `BACKEND_ASSIGN_UNASSIGNED.ts` (Unassigned → 0) + `BACKEND_CALLING_QUEUE_CURRENT.ts` (`/current` + `/next`) + `postHrLeadsUploadAssignUnassigned` in `BACKEND_ADMIN_QUOTATION_STATUS.ts`

---

## 16. Inventory — `stock_requests_dispatched_by_id_fkey` on dispatch

**Frontend:** Quotation Admin → Inventory → Stock Requests → **Review & Dispatch**  
**Failing call:** `POST /api/stock-requests/:id/dispatch` → **500**  
**Live error:**
`insert or update on table "stock_requests" violates foreign key constraint "stock_requests_dispatched_by_id_fkey"`

### Root cause

Same as §14: Quotation Admin JWT `sub` is written to `stock_requests.dispatched_by_id`, but that id is **not** in inventory `users`.

### Backend deliverable (required)

**File:** `BACKEND_STOCK_REQUESTS_DISPATCHED_BY.ts`

| Step | Action |
|------|--------|
| 1 | Reuse / copy `resolveInventoryCreatedBy` from §14 |
| 2 | Honor body `dispatched_by_id` / `dispatched_by` if valid inventory user |
| 3 | Else upsert JWT user into inventory `users`, then set `dispatched_by_id` |
| 4 | Never UPDATE with a bare JWT id missing from `users` |
| 5 | Return **400 INV_USER_MISSING** (not opaque SYS_001) on FK |

### Frontend already does

- Sends `dispatched_by_id` when it can resolve an inventory user
- Clearer error copy pointing at this section

### QA

1. Quotation Admin → Review & Dispatch with selected serials → **200**, status `dispatched`
2. Row `dispatched_by_id` exists in inventory `users`
3. No `stock_requests_dispatched_by_id_fkey` in response

**Reference:** `BACKEND_STOCK_REQUESTS_DISPATCHED_BY.ts`, `BACKEND_PRODUCTS_CREATED_BY.ts`

---

## 17. Metering — dual track (Meter process left + Bank process right)

**Frontend:** Admin → Metering, `/dashboard/metering`, Installer → Metering  
**Full handoff:** **`BACKEND_METERING_DUAL_TRACK.md`**  
**Meter stages detail:** `BACKEND_METERING_DISCOM_WCC_METER_INSTALL.md`

### UI

| Track | Tabs (order) |
|-------|----------------|
| **Meter process** (left, blue outline) | Meter Pending → Meter in Discom → WCC Pending → Meter Installation Pending → Final Step |
| **Bank process** (right, amber outline) | Bank Process → Pending Payment |

Bank is **parallel** (loan / cash+loan only) — not after Final Step.

### Backend still required

1. Meter statuses + `meteringWccAfterDiscom` (existing handoff).
2. **NEW** `bankProcessDone` / `bank_process_done` (+ optional `bank_process_done_at`) echoed on GET.
3. **NEW** `PATCH …/bank-process` (or payment-details) accepting `bankProcessDone: true` without changing metering stage.
4. Echo `paymentType` / `payment_type` (`loan` | `mix` | `cash`) on list rows.
5. Authorize **`installer`** on metering status / details / WCC / bank routes used by Installer → Metering (else `403 AUTH_004`).

### QA (short)

1. Loan row in Meter Pending also in Bank Process.
2. Mark bank done → Pending Payment; still in Meter tab; survives refresh.
3. Installer Metering tab loads queue without AUTH_004.

---

## 18. Document Submission — Property Documents (PDF) optional

**Frontend:** Dashboard / Quotations Document Submission — label has no `*`; client no longer blocks Submit when PDF is missing.

**Backend:** **`BACKEND_PROPERTY_DOCUMENT_OPTIONAL.md`**

### Required API change

On `PATCH /api/quotations/{quotationId}/documents` (KYC / customer documents):

1. Remove `propertyDocumentPdf` from any **required** file list (Zod / manual checks).
2. Do **not** return **400** when the property PDF part is omitted or when the quotation has never stored one.
3. Still accept and store the PDF when uploaded; leave null when never provided.
4. Keep `geotagRoofPhoto` / `customerWithHousePhoto` optional as today.

### QA

1. Submit documents without Property Documents PDF → **200**.
2. Later upload PDF only → persists; reopen shows View link.

---

## 19. Non-DCR 80kW set — Renew Energy / Waaree / Adani (Vsole/Xwatt)

**Frontend:** Non-DCR browse + PDF proposal  
**Full handoff:** **`BACKEND_NON_DCR_80KW.md`**

### Set prices (3-Phase, inverter 80kW Vsole/Xwatt)

| Panel brand | Set price |
|-------------|-----------|
| **Renew Energy** | ₹25,10,000 |
| **Waaree** | ₹25,90,000 |
| **Adani** | ₹25,90,000 |

### PDF panel ranges (persist `pdfPanelRangeKey`)

| Brand | Key | Label |
|-------|-----|-------|
| Renew Energy | `renew_energy_600_630` | 600W - 630W |
| Waaree | `waaree_580_630` | 580W - 630W |
| Adani | `adani_600_630` | 600W - 630W |

### Other

- Allow brand **`Renew Energy`** (do not coerce to RenewSys / Adani).
- ≥20kW PDF: CT / BT + “As per the set” is **frontend-only**; backend only needs products + range keys + pricing.
- If serving `GET /quotations/pricing-tables`, include the three 80kW `nonDcr` rows + presets.

### QA (short)

1. Save 80kW Renew Energy → GET echoes brand + `renew_energy_600_630` + subtotal 2510000.
2. Waaree / Adani same with their keys/prices.
3. Empty range key clears on PATCH.

---

## 20. Inventory — `sales_created_by_fkey` on POST /sales

**Frontend:** Quotation Admin → Inventory → Agent → **New B2B / B2C Sale** → **Record Sale**  
**Failing call:** `POST /api/sales` → **500**  
**Live error:**
`insert or update on table "sales" violates foreign key constraint "sales_created_by_fkey"`

### Root cause

Same as §14 / §16: Quotation Admin JWT `sub` is written to `sales.created_by`, but that id is **not** in inventory `users`.

### Backend deliverable (required)

**File:** `BACKEND_SALES_CREATED_BY.ts`

| Step | Action |
|------|--------|
| 1 | Reuse / copy `resolveInventoryCreatedBy` from §14 |
| 2 | Honor body `created_by` / `createdBy` / `created_by_id` / `createdById` if valid inventory user |
| 3 | Else upsert JWT user into inventory `users`, then set `sales.created_by` |
| 4 | Never INSERT with a bare JWT id missing from `users` |
| 5 | Return **400 INV_USER_MISSING** (not opaque SYS_001 / raw PG FK text) |

### Frontend already does

- Resolves inventory user via `resolveInventoryCreatedByForWrite()`
- Sends `created_by`, `createdBy`, `created_by_id`, `createdById` on `POST /sales`
- Retries once with a fallback inventory user id when response matches `sales_created_by_fkey`

### QA

1. Quotation Admin → Agent → New B2B Sale → Record Sale → **201**
2. Row `created_by` exists in inventory `users`
3. No `sales_created_by_fkey` in response
4. Body `created_by` accepted when JWT user missing
5. After first success, `SELECT * FROM users WHERE id = '<jwt-sub>';` → row exists (upsert path)

**Reference:** `BACKEND_SALES_CREATED_BY.ts`, `BACKEND_PRODUCTS_CREATED_BY.ts`, `BACKEND_STOCK_REQUESTS_DISPATCHED_BY.ts`

---

## 21. Inventory — Agent sale must deduct **admin** stock (not central)

**Frontend:** Quotation Admin → Inventory → **Agent** → Sell from admin stock (e.g. CHAIRBORD HEAD OFFICE) → Record Sale  
**Failing call:** `POST /api/sales` → **400/500**  
**Live error:** `Insufficient central inventory for sale`

### Root cause

UI loads availability from `GET /admin-inventory/admin/:adminId` (admin has stock).  
Backend still validates / deducts `products.central_stock` and ignores `admin_id` for the stock check.

### Backend deliverable (required)

**File:** `BACKEND_SALES_ADMIN_STOCK.ts`

| Step | Action |
|------|--------|
| 1 | If body has `admin_id` / `adminId` / `sell_from_admin_id` / `stock_admin_id` **or** `stock_source: "admin"` / `use_admin_stock: true` → **admin stock path** |
| 2 | Validate qty against `admin_inventory` for `(admin_id, product_id)` |
| 3 | Deduct from `admin_inventory.quantity` only |
| 4 | Do **not** require or deduct `central_stock` on this path |
| 5 | Persist `sale.admin_id` |
| 6 | Only when **no** admin id → keep existing central stock check / message |

### Frontend already does

- Sends `admin_id`, `adminId`, `sell_from_admin_id`, `stock_admin_id`, `stock_source: "admin"`, `use_admin_stock: true`
- Shows clearer error pointing at this section when API returns “Insufficient central…”

### QA

1. Admin stock Available 130, central 0 → Record Sale → **201**
2. Admin inventory qty decreases; central unchanged
3. Without `admin_id`, central insufficient still returns the central message

**Reference:** `BACKEND_SALES_ADMIN_STOCK.ts`, `BACKEND_SALES_CREATED_BY.ts`

---

## 22. Inventory — Sale line items must persist & return qty / unit_price

**Frontend:** Quotation Admin → Inventory → **Agent** → Sales History → **View items**  
(also Approvals → Pending Sales → View items)

**Symptom:** Expanded lines show `Qty 0.00 × ₹0 = ₹104` — line amount present, quantity and unit price missing/zero.

### Root cause

`POST /sales` body already sends:

```json
{
  "items": [
    { "product_id": "…", "quantity": 2, "unit_price": 100, "gst_rate": 18 }
  ],
  "subtotal": 200,
  "tax_amount": 36,
  "total_amount": 236
}
```

Backend either does not write `sale_items.quantity` / `unit_price`, or `GET /sales` / `GET /sales/:id` omits them (only returns amount/subtotal / product_id).

### Backend deliverable (required)

**File:** `BACKEND_SALES_LINE_ITEMS.ts`

| Step | Action |
|------|--------|
| 1 | On `POST /sales`, for each `items[]` row persist **`quantity`**, **`unit_price`**, **`gst_rate`**, and line **`subtotal`** (`qty * unit_price`) |
| 2 | Accept aliases: `qty`, `rate`/`price`, `gstRate`, `line_total`/`amount` |
| 3 | Persist sale-level `subtotal`, `tax_amount`, `discount_amount`, `total_amount` (from body or recompute) |
| 4 | `GET /sales` and `GET /sales/:id` return each item with `quantity`, `unit_price`, `gst_rate`, `subtotal`, plus `product: { id, name }` when joined |
| 5 | Never insert/select lines as amount-only with qty/price left at DB default `0` |
| 6 | Stock deduct (§21) must use the **same** persisted `quantity` |

### Frontend already does

- Sends real `quantity` / `unit_price` / `gst_rate` on create
- Sends sale `subtotal` / `tax_amount` / `total_amount`
- UI normalizes aliases and can infer `Qty 1 × amount` when API returns zeros — **display workaround only**; backend must still store real values

### QA

1. Create sale with qty 2 @ ₹100 → **201**
2. `GET /sales/:id` → `items[0].quantity === 2`, `unit_price === 100`
3. Sales History → View items → **not** `0.00 × ₹0`
4. Multi-line / Tally import sales keep per-line qty and rate

**Reference:** `BACKEND_SALES_LINE_ITEMS.ts`, `BACKEND_SALES_ADMIN_STOCK.ts`, `BACKEND_SALES_CREATED_BY.ts`

---

## 23. Quotations — Additional quotation + restore current (same customer)

**Frontend:** Quotations → Actions → **Create another quotation** opens New Quotation with customer locked; save creates a **new** row; old stays.  
**List UI:** One visible row per customer (current); **History** dialog lists older versions and **Restore**.

### Root cause / gap

`POST /quotations` rejects a second quotation for the same mobile. No `is_current` / restore API, so old vs new cannot be managed server-side.

### Backend deliverable (required)

**File:** `BACKEND_QUOTATION_SYSTEM_HISTORY.ts`

| Step | Action |
|------|--------|
| 1 | Migration: `is_current BOOLEAN DEFAULT true`, optional `source_quotation_id` |
| 2 | If body has `allowAdditionalQuotation` / `sourceQuotationId` → **skip** duplicate-mobile block |
| 3 | Create **new** row with `is_current=true`; set other same-customer rows `is_current=false` |
| 4 | Do **not** update/delete the old quotation’s products |
| 5 | `POST /quotations/:id/restore-current` → that id `is_current=true`, others for customer `false` |
| 6 | `GET /quotations` returns `isCurrent` / `is_current` on each row |

### Body frontend sends on revise save

```json
{
  "allowAdditionalQuotation": true,
  "allowDuplicateMobile": true,
  "isCurrent": true,
  "setAsCurrent": true,
  "sourceQuotationId": "QT-OLD",
  "customer": { "mobile": "98xxxxxxxx" },
  "products": { "panelBrand": "Waaree" },
  "subtotal": 392000,
  "totalAmount": 314000,
  "finalAmount": 314000
}
```

### Routes

| Method | Path | Behavior |
|--------|------|----------|
| `POST` | `/quotations` | New row when flags present; mark current; demote siblings |
| `POST` | `/quotations/:id/restore-current` | Restore this id as current |
| `GET` | `/quotations` | Both old + new; include `isCurrent` |

### Frontend already does

- **Create another quotation** → `/dashboard/new-quotation?reviseQuotationId=…&lockCustomer=1` (customer locked; system editable)
- Saves with `allowAdditionalForCustomer` + `sourceQuotationId` (skips client duplicate-mobile check)
- Groups list to **one row per customer**; History + Restore for older ids
- Calls `POST /quotations/:id/restore-current` (fallback `set-current` / PATCH `isCurrent`)

### QA

1. Create another quotation for same customer (new system) → new id; old kept  
2. List API returns both; new has `isCurrent=true`  
3. Restore old → old `isCurrent=true`, new false  
4. Same mobile **without** flags → still duplicate error  

**Reference:** `BACKEND_QUOTATION_SYSTEM_HISTORY.ts`, `lib/quotation-current.ts`, `lib/api.ts` (`restoreAsCurrent`)

---

## 24. Metering FILE STATUS (Payment Management + dashboards)

**Frontend:** Account → Payment Management **FILE STATUS → Metering**; same helper on dealer journey panel.  
**File:** `BACKEND_PAYMENT_EXCEL_JOURNEY_STATUS.ts`, `lib/customer-journey.ts` → `resolveMeteringJourneyStatus`

### Mapping (must match Admin → Metering tabs)

| Admin Metering tab | Persist / return on GET | UI label |
|--------------------|-------------------------|----------|
| Meter Pending | `meteringStatus` / `installationStatus` = `pending_metering` | **Pending** |
| Meter in Discom | `metering_approved` | **In Progress** |
| WCC Pending | `meteringWccAfterDiscom: true` (+ snake_case) | **In Progress** |
| Meter Installation Pending | `meter_installation_pending` | **In Progress** |
| Final Step | `mco` | **Completed** |
| After Final Step | `pending_baldev` / `baldev_approved` / `completed` | **Completed** |
| Not in metering | empty / unset | **Pending** |

### Backend deliverable

| Step | Action |
|------|--------|
| 1 | On each metering stage PATCH, persist the canonical status above |
| 2 | Persist `metering_wcc_after_discom` boolean when moving to WCC Pending |
| 3 | Return these fields on `GET /quotations?status=approved`, `GET /admin/quotations`, `GET /metering/quotations` |
| 4 | (Optional) pre-compute `journeyStageProgress.metering` on list rows using the same mapping |

### QA

1. File in Meter Pending → Payment Management shows Metering **Pending**  
2. File in Meter in Discom / WCC / Meter Installation → **In Progress**  
3. File in Final Step → **Completed**  
4. Refresh on another device — labels still correct (fields from API, not localStorage only)

**Reference:** `BACKEND_PAYMENT_EXCEL_JOURNEY_STATUS.ts`, `BACKEND_METERING_DISCOM_WCC_METER_INSTALL.md`, `lib/customer-journey.ts`

---

## 25. Installation FILE STATUS + Account filter = Admin Installation tabs

**Frontend:** Account → Payment Management **FILE STATUS → Installation** + filter  
`installation:pending` / `installation:in_progress` / `installation:completed`  
**Also:** dealer Dashboard journey panel, Excel Installation Status column.  
**Files:** `lib/customer-journey.ts` (`resolveInstallationJourneyStatus`, `paymentMatchesFileStatusFilter`), `BACKEND_PAYMENT_EXCEL_JOURNEY_STATUS.ts`, `BACKEND_INSTALLATION_RELEASE.md`

### Problem

Admin **Pending Installation** showed ~27 rows, but Account **Installation · Pending** showed ~2. Causes:

1. List GET omitted `installation_ready_for_installer` / `installation_released_at` / `installation_status` → frontend could not classify the same set  
2. Status mapping treated `installer_in_progress` as In Progress instead of Pending (Admin tab bucket)

### Mapping (must match Admin → Installation)

| Admin tab | Backend status / flags | FILE STATUS label |
|-----------|------------------------|-------------------|
| **Pending Installation** | Released to installer AND not partial AND not fully approved. Typical: `installation_status` ∈ `pending_installer`, `installer_in_progress`, empty; flags `installationReadyForInstaller` / `installationReleasedAt` set | **Pending** |
| **Partial Approved** | `installer_partial_approved` **or** `installation_partial_approved = true` | **In Progress** |
| **Approved Installation** | `installer_approved` **or** `installer_approved_at` set (photos uploaded / Complete & Mark as Approved) | **Approved** |

### Backend deliverable

| Step | Action |
|------|--------|
| 1 | **Send to Installer** (`PATCH …/installation-release`): set `installation_ready_for_installer=true`, `installation_released_at=now()`, prefer `installation_status=pending_installer` |
| 2 | **Partial Approved** upload: persist `installation_status=installer_partial_approved` and/or `installation_partial_approved=true` |
| 3 | **Complete & Mark as Approved**: set `installation_status=installer_approved`, `installer_approved_at=now()`, clear partial flags |
| 4 | Return on **`GET /quotations?status=approved`** (and admin/installer lists): `installationStatus`, `installationReadyForInstaller`, `installationReleasedAt`, `installationPartialApproved`, `installerApprovedAt` (+ snake_case) |
| 5 | Do **not** clear release flags when moving to metering — Installation history stays queryable |
| 6 | (Optional) `GET …?fileStatus=installation:pending` server filter using the same rules for large lists |

### Account filter contract

- Filter **Installation · Pending** = rows with release flags **and** Pending bucket (not partial, not approved).  
- Count should match Admin **Pending Installation** for the same org data.  
- Frontend also keeps non-current quotations that are released to installer so history rows are not dropped.

### QA

1. Send 27 files to installer → Admin Pending Installation = 27  
2. Account → Installation · Pending → **27** (same ids)  
3. Mark one Partial Approved → leaves Pending filter; appears under Installation · In Progress  
4. Complete & Approve one → Installation FILE STATUS **Approved**; Pending count decreases by 1  
5. Refresh / other device — counts unchanged (DB fields, not localStorage)

**Reference:** `BACKEND_INSTALLATION_RELEASE.md`, `BACKEND_PAYMENT_EXCEL_JOURNEY_STATUS.ts`, `lib/operational-install-queue.ts`, `lib/customer-journey.ts`

---

## 26. Installation completion upload — Multer “Unexpected or too many file fields”

**Frontend:** Admin / Installer → **Complete & Mark as Approved** / **Partial Approved**  
**Toast:** `Upload failed — Unexpected or too many file fields`  
**File:** `BACKEND_INSTALLATION_COMPLETION_MULTER.ts`, `lib/api.ts` → `uploadCompletionDocuments`

### Cause

Installer-completion `POST …/documents` uses a Multer allow-list that does **not** include the client’s file field names, or `maxCount` / `files` limit is too low (`LIMIT_UNEXPECTED_FILE` / `LIMIT_FILE_COUNT`).  
Often the KYC documents Multer config (aadhaar/PAN/…) was reused on this route.

### What the client sends (preferred)

| Part | Type | Notes |
|------|------|--------|
| `installerCompletionImages` | file × N | All site photos under one key |
| `installerCompletionImageFieldOrderJson` | text | JSON array mapping file index → logical key |
| `piUpload` | file × N | Optional PI docs |
| `existingInstallationImageUrlsJson` | text | Retained S3 URLs when re-editing |
| `installationStatus` | text | `installer_approved` or `installer_partial_approved` |
| legs / expenses / remarks | text | See §6.4.C |

**Fallback shape** (if aggregate is rejected): same text fields + files under  
`homeFrontPhoto`, `homeWithPersonPhoto`, `inverterWithCustomerPhoto`, `plantWithCustomerPhoto`,  
`inverterSerialNumberPhoto`, `panelSerialNumberPhoto`, `geoTagPlantPhoto`, `otherImages`.

### Backend deliverable

| Step | Action |
|------|--------|
| 1 | On installer-completion routes only, use Multer `.fields([...])` with **both** aggregate + per-field + `piUpload`, **or** `.any()` with `limits.files ≥ 40` |
| 2 | Set `installerCompletionImages` **maxCount ≥ 20** (panel serials / otherImages can be many) |
| 3 | Set `piUpload` **maxCount ≥ 10** |
| 4 | Allow **admin** JWT on `POST /api/installer/quotations/:id/documents` **or** provide `POST /api/admin/quotations/:id/installer-documents` with the same handler |
| 5 | Parse `installerCompletionImageFieldOrderJson` to store per-column URLs |
| 6 | Persist `installation_status` + `installer_approved_at` / partial flags; return media on GET |
| 7 | Never route this multipart through KYC `PATCH /api/quotations/:id/documents` |

### Example Multer fields

```js
upload.fields([
  { name: "installerCompletionImages", maxCount: 30 },
  { name: "piUpload", maxCount: 10 },
  { name: "homeFrontPhoto", maxCount: 5 },
  { name: "homeWithPersonPhoto", maxCount: 5 },
  { name: "inverterWithCustomerPhoto", maxCount: 5 },
  { name: "plantWithCustomerPhoto", maxCount: 5 },
  { name: "inverterSerialNumberPhoto", maxCount: 5 },
  { name: "panelSerialNumberPhoto", maxCount: 20 },
  { name: "geoTagPlantPhoto", maxCount: 5 },
  { name: "otherImages", maxCount: 20 },
])
```

### QA

1. Admin uploads 1+ photos → **Complete & Mark as Approved** → **200**, no Multer toast  
2. **Partial Approved** with one photo → **200**, status `installer_partial_approved`  
3. Re-open Edit, keep existing URLs, add one new photo → still **200**  
4. Installer JWT same payload on `/installer/quotations/:id/documents` → **200**  
5. Refresh Admin → row in **Approved Installation** / **Partial Approved** with photos

**Reference:** `BACKEND_INSTALLATION_COMPLETION_MULTER.ts`, `BACKEND_CHANGES_REQUIRED.md` §6.4.C, `BACKEND_INSTALLATION_PARTIAL_AND_METERING.md`

---

## 27. Crompton DCR set — Premier Energy 600–610W + Crompton 3.6kW (1-Phase)

**Frontend:** DCR Browse → **Crompton set**  
**Full handoff:** **`BACKEND_CROMPTON_DCR_SET.md`**  
**Helpers:** **`BACKEND_CROMPTON_DCR_SET.ts`**

### Set prices (DCR, 1-Phase only)

| System | Inverter | Set price |
|--------|----------|-----------|
| **3kW** | Crompton **3.6kW** | **₹2,10,000** |
| **5kW** | Crompton **3.6kW** | **₹2,95,000** |

### Package identity (persist + echo — do not coerce)

| Field | Value |
|-------|--------|
| `panelBrand` / `dcrPanelBrand` | **`Premier Energy`** |
| `panelType` (package marker) | **`Crompton set`** |
| Panels (PDF) | Premier Energy **600W–610W Topcon Bifacial** via `pdfPanelRangeKey` **`premier_energy_600_610`** |
| `inverterBrand` | **`Crompton`** |
| `inverterSize` | **`3.6kW`** |
| `acdb` / `dcdb` | **`Crompton (1-Phase)`** |

### Backend deliverable

| Step | Action |
|------|--------|
| 1 | Allowlist **`Premier Energy`**, **`panelType: Crompton set`**, **`Crompton`**, **`3.6kW`**, **`premier_energy_600_610`** |
| 2 | Persist both `panelBrand: "Premier Energy"` **and** `panelType: "Crompton set"` — do not drop the marker |
| 3 | Set-price when `panelType === "Crompton set"`: 3kW→210000, 5kW→295000 (do **not** use Premier Energies matrix) |
| 4 | If `GET /quotations/pricing-tables` is live: add two `dcr` rows + two system presets (see md / `.ts`) |
| 5 | Keep existing Premier Energies Topcon column separate (`premier_600_625_bifacial_topcon`) |

### QA (short)

1. Save Crompton set 3kW → GET echoes `panelBrand: "Premier Energy"`, `panelType: "Crompton set"`, Crompton inverter/ACDB/DCDB, `premier_energy_600_610`, subtotal **210000**.
2. 5kW → subtotal **295000**.
3. Reload form: Panel Brand **Premier Energy**, PDF range **600W - 610W Topcon Bifacial** checked.
4. Premier Energies / Tata / INA packages unchanged.

**Reference:** `BACKEND_CROMPTON_DCR_SET.md`, `BACKEND_CROMPTON_DCR_SET.ts`, `lib/pricing-tables.ts`, `lib/quotation-api-payload.ts`

---

## 28. Cash + loan amounts & installment payment modes (Account / Approve)

**Frontend:** Admin Approve + Approved list; Account Payment Management + Excel  
**Full handoff:** **`BACKEND_CASH_LOAN_AMOUNTS.md`**  
**Helpers:** **`BACKEND_CASH_LOAN_AMOUNTS.ts`**  
**Also touch:** `BACKEND_ADMIN_QUOTATION_STATUS.ts` (approve + GET serialize), `BACKEND_INSTALLMENT_REPLACE.ts` (phases)

**Live bug (Aug 2026):** Approve Cash + loan as loan **₹2,00,000** + cash **₹70,000** (total ₹2,70,000) → Admin still showed **Loan ₹2,70,000**. Backend was not persisting / echoing the split (or overwrote with subtotal).

### Rules

| `paymentType` | Persist amounts | Phase `paymentMode` |
|---------------|-----------------|---------------------|
| **loan** | `loanAmount` | `loan` only |
| **cash** | clear loan/cash amounts | `cash` / `upi` / `cheque` (no loan) |
| **mix** (Cash + loan) | `loanAmount` + `cashAmount` (= subtotal) | loan **and** cash/upi/cheque |

### DB

```sql
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS loan_amount NUMERIC(14,2);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(14,2);
```

### Backend deliverable

| Step | Action |
|------|--------|
| 1 | On `PATCH /admin/quotations/:id/status` approve, save `loanAmount` / `cashAmount` (and `loan_amount` / `cash_amount`) |
| 2 | `mix`: **400** if loan+cash ≠ quotation subtotal; never store full subtotal as loan alone |
| 3 | Set `paymentType` = `paymentMode` = body type; sync `filePaymentType` to same |
| 4 | Echo amounts + `paymentType` on PATCH response and every GET list/detail (admin + account) |
| 5 | Installment replace: persist each phase’s `paymentMode`; do not wipe loan/cash amounts |
| 6 | Optional validate phase mode against payment type allowlist |

### Approve body example

```json
{
  "status": "approved",
  "paymentType": "mix",
  "paymentMode": "mix",
  "loanAmount": 200000,
  "cashAmount": 70000,
  "bankName": "Bank of Baroda",
  "bankIfsc": "BARB0KALWAR"
}
```

### QA (short)

1. Approve mix 200000+70000 on 270000 → GET shows both amounts, **not** Loan ₹270000.  
2. Account loan installment → loan remaining drops only.  
3. Cash/UPI installment → cash remaining drops only.  
4. Excel has Loan/Cash amount + paid + remaining columns.  
5. Loan-only / Cash-only modes enforced in Manage UI (backend should not coerce).  
6. Re-approve a wrong row with correct split → GET updates.

**Reference:** `BACKEND_CASH_LOAN_AMOUNTS.md`, `BACKEND_CASH_LOAN_AMOUNTS.ts`, `BACKEND_ADMIN_QUOTATION_STATUS.ts` (`resolveApproveLoanCashAmounts` in approve handler)

---

## 29. Installation completion upload — “not allowed for this quotation state”

**Frontend:** Admin / Installer → **Complete & Mark as Approved** / **Partial Approved** (from **Pending**)  
**Toast:** `Upload failed — Installation upload not allowed for this quotation state`  
**File:** **`BACKEND_INSTALLATION_UPLOAD_STATE.ts`** (also §26 Multer)

### Cause

`POST …/documents` (installer completion) rejects when `installation_status` is still **`pending_installer`** (Pending tab). Product allows Complete / Partial from Pending without a separate Start click.

### Frontend already

1. Auto-PATCH `installer_in_progress` before upload  
2. Sends `force` / `adminOverride` / `allowFromPendingInstaller` on multipart  
3. Retries once if the state error returns  

Backend should still fix the gate so upload works even if Start PATCH fails.

### Backend deliverable

| Step | Action |
|------|--------|
| 1 | On completion `POST …/documents`, **allow** upload from `pending_installer` / empty / `installer_in_progress` / `installer_partial_approved` (and admin re-edit of `installer_approved`) |
| 2 | Honor `force` / `adminOverride` / `allowFromPendingInstaller` **or** admin JWT → do not 409 on pending |
| 3 | On success, persist body `installationStatus` = `installer_approved` or `installer_partial_approved` (no requirement that status was already in_progress) |
| 4 | Optional: if still pending and no target status, set `installer_in_progress` |
| 5 | Keep Multer allow-list from §26 |

### Allowed → blocked (summary)

| Allow upload from | Block (unless admin force) |
|-------------------|----------------------------|
| `pending_installer`, empty, `installer_in_progress`, `installer_partial_approved`, `installer_approved` (re-edit) | `pending_metering`, `mco`, `pending_baldev`, `completed`, … |

### QA

1. Pending row (`pending_installer`) → Admin Complete → **200**, not state toast.  
2. GET → `installer_approved` (or partial).  
3. Installer JWT from pending → **200**.  
4. Already in metering without force → may still 409.

**Reference:** `BACKEND_INSTALLATION_UPLOAD_STATE.ts`, `BACKEND_INSTALLATION_COMPLETION_MULTER.ts`

---

## 30. Account Management — Cost of site (`siteCost`) + Profit grid

**Frontend:** Manage modal + grid (Cost of site / Profit). Save on blur / close / Submit.  
**Problem today:** Submit updates UI, **hard refresh resets to ₹0** until GET echoes DB `site_cost`.  
**Full handoff:** **`BACKEND_SITE_COST.md`** · pack: **`BACKEND_ACCOUNT_PAYMENT_MANAGEMENT.md`**  
**Also:** `BACKEND_ADMIN_QUOTATION_STATUS.ts` (`patchQuotationPaymentDetails`, `quotationToApiJson`)

### Backend deliverable

| Step | Action |
|------|--------|
| 1 | DB column `site_cost` on quotations |
| 2 | `PATCH …/payment-details` `{ siteCost, replaceInstallments: false }` persists **without wiping phases** |
| 3 | Echo `siteCost` / `site_cost` on **GET list + detail** (required for hard refresh) |
| 4 | Accept `siteCost` on installment Submit with `phases` |
| 5 | Optional aliases `PATCH …/site-cost`, `/admin/quotations/…` |

Profit is FE-only — do not store.

### QA

Save Cost of site ₹2,00,000 → GET returns it → hard refresh → grid still shows Cost of site + Profit (subtotal − cost).

---

## 31. Account Management — Installment paid vs AM subtotal (not “payable after discount”)

**Frontend:** Manage → Submit installments  
**Bug:** `Total paid (126000) cannot exceed payable after discount (117000)` while list Subtotal shows AM gross.  
**Full handoff:** **`BACKEND_ACCOUNT_PAYMENT_MANAGEMENT.md` §D**  
**Helper:** `pickQuotationSubtotalForPayments` in `BACKEND_ADMIN_QUOTATION_STATUS.ts`

### Backend deliverable

| Step | Action |
|------|--------|
| 1 | For installment replace, `paymentCap = subtotal − discountAmount` (AM fields) |
| 2 | **Do not** validate installment `sum(paid)` against `amountAfterSubsidy − discount` when lower than AM subtotal |
| 3 | Error text: `cannot exceed subtotal (Y)` — not “payable after discount” |
| 4 | Status-only / site-cost PATCH (`replaceInstallments: false`, no phases): skip paid-vs-cap; do not wipe phases |

### QA

Submit installments with total paid = AM subtotal → **200**. Refresh → phases + siteCost persist.

---

## Related docs

| Doc | Section |
|-----|---------|
| `BACKEND_CHANGES_REQUIRED.md` | §6.4–6.5 (installation workflow, uploads), **Installation release & planned date**, **§M** (final confirmation uploads + accounts release gate), §7.7–7.9, dealer queue (~2307), **§J** + **§J.1**, §X (PDF flags), **PATCH …/documents** (property PDF optional) |
| `BACKEND_ADMIN_QUOTATION_STATUS.ts` | HR upload handlers + `computeHrUploadLeadCounts` + `patchDealerCallingQueueAction` |
| `lib/quotation-pdf-display.ts` | PDF panel range + inverter brand options (incl. 80kW Non-DCR ranges) |
| `lib/calling-lead-assignee.ts` | Assignee normalization spec for backend field names |
| `lib/calling-remark-payload.ts` | PATCH action body for remarks |
| `lib/calling-report-date-range.ts` | HR **GET** `startDate` / `endDate` + `range` semantics |
| `lib/calling-lead-session.ts` | Client-side draft keys (not a backend contract) |
| `lib/calling-action-summary.ts` | HR Interested / Follow Up / Not Interested bucket rules |
| `lib/quotation-system-kw.ts` | Admin overview kW sum per dealer (frontend; optional `system_kw` on API) |
| `lib/merge-quotation-products.ts` | Merges `products` + `quotationProduct` + flat row fields for kW |
| `lib/operational-install-queue.ts` | Payment **Send to Installer** gate + Admin Installation pending/approved rules |
| `lib/visit-report.ts` | Admin Visitor Reports — status normalization, filters, row mapping |
| `lib/final-confirmation-documents.ts` | Final confirmation multipart field names + FormData builder |
| `lib/api.ts` | `uploadFinalConfirmationDocuments`, `sendQuotationToMetering`, `retrieveQuotationFromMetering`, `retrieveQuotationFromInstallation` |
| `lib/operational-install-queue.ts` | `getAdminQuotationsTabSendToMeteringState`, installation vs metering visibility |
| **`BACKEND_ADMIN_PRODUCT_NEEDED.ts`** | **§13** Admin Product Needed — installation-pending + brand aggregates |
| `lib/admin-product-needed.ts` | Product Needed eligibility + brand card aggregation (frontend) |
| **§14** (this file) | Inventory Tally import — `products_created_by_fkey` + serial attach |
| **`BACKEND_PRODUCTS_CREATED_BY.ts`** | **§14** upsert quotation Admin into inventory `users` for `created_by` |
| **§15** (this file) | Calling `/current` 500 SYS_001 + FCFS drain Unassigned/Assigned |
| **`BACKEND_ASSIGN_UNASSIGNED.ts`** | **§15-C** `POST …/assign-unassigned` + upload `round_robin_all` |
| **`BACKEND_CALLING_QUEUE_CURRENT.ts`** | **§15** implement `/calling-queue/current` + `/next` (never SYS_001) |
| **§16** (this file) | Inventory dispatch — `stock_requests_dispatched_by_id_fkey` |
| **`BACKEND_STOCK_REQUESTS_DISPATCHED_BY.ts`** | **§16** upsert JWT user for `dispatched_by_id` |
| **§20** (this file) | Inventory Agent sale — `sales_created_by_fkey` |
| **`BACKEND_SALES_CREATED_BY.ts`** | **§20** upsert JWT user for `sales.created_by` |
| **§21** (this file) | Inventory Agent sale — deduct admin stock not central |
| **`BACKEND_SALES_ADMIN_STOCK.ts`** | **§21** when `admin_id` present, use `admin_inventory` |
| **§22** (this file) | Inventory sale lines — persist/return qty + unit_price |
| **`BACKEND_SALES_LINE_ITEMS.ts`** | **§22** sale_items quantity/unit_price/subtotal serialize |
| **§23** (this file) | Quotations — additional quotation + restore current |
| **`BACKEND_QUOTATION_SYSTEM_HISTORY.ts`** | **§23** allow additional create + `restore-current` + `is_current` |
| **§24** (this file) | Metering FILE STATUS — Final Step Completed / Meter Pending Pending / rest In Progress |
| **§25** (this file) | Installation FILE STATUS — Pending / In Progress / Approved = Admin Installation tabs |
| **§26** (this file) | Installation completion Multer — Unexpected or too many file fields |
| **`BACKEND_INSTALLATION_COMPLETION_MULTER.ts`** | **§26** Multer field allow-list + maxCount + routes |
| **§27** (this file) | Crompton DCR set — Premier Energy 600–610W + Crompton 3.6kW |
| **`BACKEND_CROMPTON_DCR_SET.md`** | **§27** full Crompton set prices, range key, pricing-tables |
| **`BACKEND_CROMPTON_DCR_SET.ts`** | **§27** allowlist helpers + pricing/preset merge |
| **§28** (this file) | Cash + loan amounts + installment payment modes |
| **`BACKEND_CASH_LOAN_AMOUNTS.md`** | **§28** approve/GET/installment + Excel fields |
| **`BACKEND_CASH_LOAN_AMOUNTS.ts`** | **§28** amount validation + remaining-by-side helpers |
| **§29** (this file) | Installation upload — not allowed for this quotation state |
| **`BACKEND_INSTALLATION_UPLOAD_STATE.ts`** | **§29** allow `pending_installer` completion upload + gate helper |
| **§30** (this file) | Account Management Cost of site |
| **`BACKEND_SITE_COST.md`** | **§30** `siteCost` persist + GET echo |
| **§31** (this file) | AM installment paid vs subtotal (not payable-after-discount) |
| **`BACKEND_ACCOUNT_PAYMENT_MANAGEMENT.md`** | **§30–§31** pack — site cost + installment payment cap |
| **`BACKEND_PAYMENT_EXCEL_JOURNEY_STATUS.ts`** | **§24–§25** journey helpers + required GET fields |
| **§17** (this file) | Metering dual track — Meter left + Bank right |
| **`BACKEND_METERING_DUAL_TRACK.md`** | **§17** full dual-track + `bank_process_done` + installer auth |
| **`BACKEND_METERING_DISCOM_WCC_METER_INSTALL.md`** | Meter Pending → Discom → WCC → Meter Install → Final Step |
| **§18** (this file) | Document Submission — Property Documents PDF optional |
| **`BACKEND_PROPERTY_DOCUMENT_OPTIONAL.md`** | **§18** stop requiring `propertyDocumentPdf` on PATCH …/documents |
| **§19** (this file) | Non-DCR 80kW Renew Energy / Waaree / Adani + PDF ranges |
| **`BACKEND_NON_DCR_80KW.md`** | **§19** full 80kW set prices, range keys, pricing-tables |
| **`BACKEND_SUPER_ADMIN_QUOTATION_LOGIN.ts`** | Super-admin `/auth/login` + shared JWT for inventory |
| **`BACKEND_INSTALLATION_RELEASE.md`** | **BLOCKER:** Installation tab — PATCH release + GET list fields + QA curls |
| **§32** (this file) | Customer Journey — calling history + `callingLeadId` link |
| **`BACKEND_CUSTOMER_JOURNEY.ts`** | **§32 / §AE** full Customer Journey backend spec |
| **`BACKEND_CHANGES_REQUIRED.md` §AE** | **§32** checklist + schema |
| **`BACKEND_METER_DOCUMENT_PUBLIC_URL.ts`** | **§33 / §AF** meter document public view link |
| **`BACKEND_CHANGES_REQUIRED.md` §AF** | **§33** checklist |
| **`BACKEND_CUSTOMER_JOURNEY.ts`** (timestamps + bulk) | **§34 / §AG** Calling Data/Action date+time on bulk GET |

---

## 32. Customer Journey tab (Calling Data → Final Confirmation) — Aug 2026

### Frontend

- Admin → **Customer Journey** tab
- Dealer → `/dashboard/customer-journey`
- Merge logic: `lib/full-customer-journey.ts`, `lib/journey-calling-actions.ts`
- Filters modal + scroll load: `components/full-customer-journey-panel.tsx`

### Problem

Quotations that came from Calling Data show later stages complete, but **Calling Data** / **Calling Action** stay Pending because action history is missing, incomplete, or not matchable (no `mobile` / `leadId` / `callingLeadId`).

### Backend must do

1. **Calling-actions GET** (dealer + admin) with `range=all` + high `limit` returns full history rows.
2. Every action row includes: `id`, `leadId`, `mobile`, `name`, `dealerId`, `dealerName`, `action`, `actionAt`, `callRemark`, `statusText`, `statusCategory`, `nextFollowUpAt?`.
3. **Queue GET** (`/calling-queue/current` / `/next`) includes `dialledActions` / `connectedActions` / `notConnectedActions` / `recentActions` (same row shape).
4. On quotation create from Calling Data prefill, persist **`callingLeadId`** and echo it on quotation list/detail GET.
5. Mobile match: store clean digits; search compares last 10 digits.

### Optional (scale)

`GET /api/admin/customer-journey` and `GET /api/dealers/me/customer-journey` — pre-merged rows with `stages` + `stageDates` + `timeline`.

### Docs

- Full spec: **`BACKEND_CUSTOMER_JOURNEY.ts`**
- Also: **`BACKEND_CHANGES_REQUIRED.md` §AE**

### QA

1. Call lead → Submit → Create Quotation Prefill → save.
2. Customer Journey search by mobile → Calling Data + Calling Action **Completed** with dates.
3. Admin same mobile → same calling stages + dealer filter works.

---

## 33. Metering Details — meter document public view link (Aug 2026)

### Frontend

- Admin Metering → **Metering Details** modal (file: image/pdf)
- Metering dashboard → same modal
- Client: `api.metering.saveDetails`, `lib/parse-api-media.ts`, `StoredMediaPreview`

### Problem

Upload + Save still shows **“No meter document on file yet.”** because the API does not return a **browser-openable** `meterDocumentPublicUrl` (or list GET omits it). Private S3 object URLs → Access Denied.

### Backend must do

| Priority | Change |
|----------|--------|
| **P0** | `POST /api/metering/quotations/:id/details` accept file under `meterDocumentImage` **and** aliases (`meterDocument`, `meter_document`, `file`, …) |
| **P0** | Upload to S3; persist `meter_document_key` + `meter_document_name` |
| **P0** | Save response includes **`meterDocumentPublicUrl`** (presigned ≥7d or CDN) + `meterDocumentUrl` + `meterDocumentName` |
| **P0** | Roles: **`metering` + `admin`** (not admin-only) |
| **P0** | `GET /api/admin/quotations` + `GET /api/metering/quotations` echo the same three fields (re-presign from key on each GET) |

### Docs

- Full spec + handler: **`BACKEND_METER_DOCUMENT_PUBLIC_URL.ts`**
- Also: **`BACKEND_CHANGES_REQUIRED.md` §AF** (and existing §J)

### QA

1. Upload PDF in Metering Details → Save.
2. Reopen modal → **Open public link** visible and opens the file.
3. Hard refresh → link still works.

---

## 34. Customer Journey — Calling Data / Calling Action **date+time** on bulk GET (Aug 2026)

### Frontend

- Admin **Customer Journey** + dealer `/dashboard/customer-journey`
- Green **Calling Data** / **Calling Action** chips must show **date and time**, not "—"
- Spec: `BACKEND_CUSTOMER_JOURNEY.ts` (section *Timestamps + speed*)

### Problem

Stages can show **Completed** while time stays empty until the user searches a mobile. The SPA then fires many `GET .../calling-actions?search=<mobile>` calls (slow).

Cause: bulk `GET .../calling-actions?range=all&limit=2000` omits `actionAt` and/or `mobile` / older rows.

### Backend must do (P0)

| Item | Detail |
|------|--------|
| `actionAt` | ISO-8601 on **every** calling-action row (`2026-05-18T10:15:00.000Z`). Echo `action_at` too. |
| Bulk list | Dealer + admin GET with `range=all`, `limit` ≥ 2000 (paginate; return `pagination.total`) |
| Join mobile | Each row includes `mobile` (from calling lead) + `leadId` |
| Stage dates | Calling Data = **earliest** `actionAt`; Calling Action = **latest** `actionAt` |
| Same customer | **One** journey row (last-10 mobile / `callingLeadId`). Do not split quotation vs calling. If only one call exists, both times MAY be the same `actionAt`. |
| Do not | Require per-mobile `?search=` for the default journey list |

### Optional (fastest)

`GET /api/admin/customer-journey` and `GET /api/dealers/me/customer-journey` include `stageDates.callingData` and `stageDates.callingAction` as ISO-8601.

### QA

1. Open Customer Journey **without** searching a number.
2. A converted lead shows Calling Data + Calling Action **Completed** with times (not "—").
3. Network: one (or paginated) calling-actions list, not dozens of `?search=` calls.
4. Search by mobile still works and does not change those times.

---

## 35. Admin Installation **Revert** (Approved → Pending) — Aug 2026

### Frontend

- Admin → Installation → **Approved Installation** → **Revert** → confirm
- Calls `api.admin.quotations.revertInstallationToPending` (`lib/api.ts`)
- Spec: **`BACKEND_INSTALLATION_REVERT.ts`**, REQUIRED **§AH**

### Problem

Row stayed on **Approved Installation** after Revert: backend blocked the reverse transition, or wrote `status=pending_installer` on the quotation (invalid enum), or list/queue still treated leftover photos / `installer_approved_at` as approved.

### Backend must do (P0)

| Item | Detail |
|------|--------|
| Allow reverse | `installer_approved` / `installer_partial_approved` → `pending_installer` for **admin** (`force` / `adminOverride` / `allowRevert`) |
| Column | Persist **`installation_status = pending_installer`**. Do **not** change quotation `status`. |
| Clear | `installer_approved_at = null`, `installation_partial_approved = false` |
| Photos | Keep document URLs; do not delete S3 |
| Queues | Pending installer GET **includes** id; approved installer GET **excludes** id |

Preferred:

```
PATCH /api/admin/quotations/:id/installation-status
{ "installationStatus": "pending_installer", "force": true, "adminOverride": true, "allowRevert": true }
```

Optional dedicated: `POST /api/admin/quotations/:id/revert-installation`

### QA

1. Approved Installation → Revert → Yes.
2. Row is gone from Approved; appears under **Pending Installation**.
3. `GET /quotations/:id` still has photos; `installationStatus` is `pending_installer`.
4. Quotation `status` is still `approved`.

---

## 36. Admin Calling Reports — exact **Total Calls** for date filter (Aug 2026)

### Frontend

- Admin → **Calling Reports** → Employee Calling Actions
- Spec: **`BACKEND_CALLING_REPORTS_COUNTS.ts`**, REQUIRED **§AI**, **§J**

### Problem

Monthly/Weekly Total Calls was **1000** or all-time: list GET ignored dates, capped at 1000, used lead created_at, counted **Start**, or ignored **page**.

### Backend must do (P0)

| Item | Detail |
|------|--------|
| Filter | `GET /api/admin/calling-actions` honour `range`, `startDate`/`endDate` (ISO), `fromDate`/`toDate` (`YYYY-MM-DD`) on **`action_at`** |
| Page | Honour `page` + `limit` (250). Do not repeat page 1. |
| Total | `pagination.total` = count **after** date + dealer filter |
| Exclude | `action=start` |
| `actionAt` | ISO-8601 UTC on every row |

Optional: `GET /api/admin/calling-actions/summary` with `totalCalls`, `connected`, `notConnected`, `connectedNotInterested`, `connectedInterested`, `connectedFollowUp` using the **same** filter. `totalCalls === connected + notConnected`.

### QA

1. Calling Reports → **Monthly** vs **Weekly** vs **Daily** → three different totals (unless data is tiny).
2. Total Calls is **not** stuck at 1000.
3. SQL `COUNT(*)` on `action_at` in that window (excluding start) matches the card.

---

## 37. Installation **Upload** + **Live photo (geotag)** — Aug 2026

### Frontend

- Admin / Installer completion cards: **Upload** | **Live photo**
- Spec: **`BACKEND_INSTALLATION_LIVE_GEOTAG.ts`**, REQUIRED **§AJ**
- Client stamps GPS on the JPEG (`lib/live-geotag-photo.ts`); submit uses existing completion multipart (**§26**)

### Backend must do

| Priority | Change |
|----------|--------|
| **P0** | Keep accepting live JPEGs on existing `POST …/documents` (no Multer change required beyond §26) |
| **P1** | Optional text field `installationImageCaptureMetaJson` — `{ fieldKey: [{ source, latitude, longitude, accuracyMeters, capturedAt }] }` |
| **P1** | Persist + echo capture meta on `GET /admin/quotations` and `GET /quotations/:id` |

### QA

1. Live photo with location allowed → save → image shows stamped lat/lng.
2. Gallery Upload still works without GPS.
3. If meta JSON implemented: GET returns coordinates for that field.

---

## 38. User office location + workflow field permissions — Aug 2026

### Frontend

- Admin → Users → Dashboard access: **Field access** + **Who can access** (Everyone | Selected one | Only there)
- Office location: Jaipur / Ajmer / Chomu (employee profile)
- Spec: **`BACKEND_USER_FIELD_PERMISSIONS.ts`**, **`BACKEND_USER_FIELD_PERMISSIONS.md`**, **`BACKEND_WORKFLOW_DASHBOARD_PARITY.md`**, REQUIRED **§AK**
- Client filter: `lib/module-field-permissions.ts` (`canViewWorkflowRecord`, `filterQuotationsByWorkflowPermission`)

### Backend must do (P0)

| Item | Change |
|------|--------|
| **DB** | `office_location`, `module_field_permissions` JSONB on user tables |
| **User API** | `POST/PUT/GET /admin/account-managers`, dealers, visitors — accept + echo `officeLocation`, `moduleFieldPermissions` |
| **Login** | `POST /auth/login` echoes both on `user` |
| **Quotations** | List/detail echo `officeLocation`, `dealerId` for scope filtering |
| **Accounts Everyone** | `GET /account-management/quotations?status=approved` returns all approved rows (not dealer-scoped) |
| **Workflow Everyone** | `GET /admin/quotations` (or module routes) for installation/metering/final_confirmation + `scope: everyone` — see **`BACKEND_WORKFLOW_DASHBOARD_PARITY.md`** |

### Permission model

- **Modules:** `accounts`, `installation`, `metering`, `final_confirmation`
- **Level:** `none` | `read` | `write`
- **Scope:** `everyone` | `selected_users` | `office_only` (UI: Everyone | Selected one | Only there)
- Legacy `everyone_except_dealer` → normalize to `everyone`
- Separate from dashboard `access[]` checkboxes

### Backend should do (P1)

- Enforce write permission on installer / metering / baldev mutation endpoints (403 `FIELD_PERMISSION_DENIED`)

### QA

1. Save user with Ajmer + installation read + office_only → login → installer shows only Ajmer rows, read-only.
2. Final confirmation write → baldev can DCR + approve; read → view only.
3. GET user after save returns same `moduleFieldPermissions` JSON.

---

## 39. Admin **Retrieve from Metering** (Meter Pending → Installation approved) — Sep 2026

### Frontend

- Admin → **Quotations** → **Retrieve** (early metering only)
- Admin → **Metering** → **Meter Pending** → **Retrieve**
- `lib/api.ts` → `retrieveQuotationFromMetering`
- `lib/operational-install-queue.ts` → `canRetrieveFromMeteringPipeline`, `getAdminQuotationsTabRetrieveState`
- Reference: **`BACKEND_RETRIEVE_FROM_METERING.ts`**

### Product

Pull quotation back from **Meter Pending** / **metering_in_progress** to **installer_approved** so admin can fix installation or **Send to Metering** again. User stays on current tab (no redirect).

Frontend also keeps `localStorage.adminMeteringHandoffMap` until GET echoes workflow — **backend must persist** so refresh + other devices match.

### Backend must do (P0)

| Item | Detail |
|------|--------|
| **Route** | `PATCH\|POST /api/admin/quotations/:id/retrieve-from-metering` |
| **Alt** | `PATCH /api/admin/quotations/:id/metering-handoff` with `retrieveFromMetering: true` |
| **From** | `pending_metering`, `metering_in_progress` |
| **To** | `installation_status = installer_approved`; clear `metering_status` / `metering_stage` (null or empty) |
| **Keep** | `installation_ready_for_installer`, `installation_released_at` (Payment Management release) |
| **Keep** | `quotations.status` = `approved` (do not write workflow into `status` column) |
| **Block** | `metering_approved`, `meter_installation_pending`, `mco`, `pending_baldev`, etc. → **409** |
| **Auth** | `admin` |

**Request body (frontend):**

```json
{
  "installationStatus": "installer_approved",
  "installation_status": "installer_approved",
  "target": "installer_approved",
  "retrieveFromMetering": true,
  "allowRevert": true,
  "force": true,
  "adminOverride": true,
  "source": "admin"
}
```

**GET after success:**

```json
{
  "installationStatus": "installer_approved",
  "meteringStatus": null,
  "installationReadyForInstaller": true,
  "installationReleasedAt": "2026-08-27T…"
}
```

Meter Pending queue GET must **exclude** the id. Quotations tab shows **Send to Metering** again when appropriate.

### QA

1. Send to Metering → `pending_metering` on GET.
2. Quotations → Retrieve → **200**; stay on Quotations tab.
3. GET echoes `installer_approved`; metering fields cleared.
4. Meter Pending queue no longer lists row.
5. Retrieve when `metering_approved` → **409**.

---

## 40. **Retrieve from Installation** (undo Send to Installer) — Sep 2026

### Frontend

- Admin → **Installation** → Pending / Partial / In progress → **Revert** (↺ to Accounts)
- Account Management → **Sent to installer** → **Revert**
- `lib/api.ts` → `retrieveQuotationFromInstallation`
- `lib/operational-install-queue.ts` → `getRetrieveFromInstallationState`, `getAdminInstallationTabRevertState`
- Reference: **`BACKEND_RETRIEVE_FROM_INSTALLATION.ts`**

### Product

Undo Account Management **Send to Installer**. Row disappears from Admin **Installation** tab; Accounts shows **Send to Installer** again.

**Different flows:**

| UI action | Effect |
|-----------|--------|
| Installation **Revert** (↺) on Pending/Partial/In progress | Clear release flags → back to Accounts |
| Installation **Revert** on Approved tab | `installer_approved` → `pending_installer` (workflow only) — **`BACKEND_INSTALLATION_REVERT.ts`** |
| Quotations **Retrieve** | Meter Pending → `installer_approved` — **§39** |

### Backend must do (P0)

| Item | Detail |
|------|--------|
| **Route** | `PATCH\|POST /api/admin/quotations/:id/retrieve-from-installation` |
| **Fallback** | `PATCH /api/quotations/:id/installation-release` with `false` flags (merge only — do not wipe installments) |
| **Clear** | `installation_ready_for_installer = false`, `installation_released_at = null` |
| **Optional** | Clear `installation_status` when still `pending_installer` / `in_progress` / partial |
| **Keep** | `quotations.status` = `approved`; keep photo URLs on quotation |
| **Block** | When `metering_approved` / `mco` / `meter_installation_pending` → **409** |
| **Auth** | `admin`, `account-management` |

**Request body (frontend):**

```json
{
  "installationReadyForInstaller": false,
  "installation_ready_for_installer": false,
  "installationReleasedAt": null,
  "installation_released_at": null,
  "retrieveFromInstallation": true,
  "allowRevert": true,
  "source": "retrieve-from-installation"
}
```

**GET after success:**

```json
{
  "installationReadyForInstaller": false,
  "installation_ready_for_installer": false,
  "installationReleasedAt": null,
  "installation_released_at": null
}
```

`GET /installer/queue` and Admin Installation list must **exclude** the quotation until released again.

### QA

1. Accounts → Send to Installer → appears under Installation Pending.
2. Installation → Revert → **200**; row removed from Installation list.
3. Accounts → **Send to Installer** button visible again.
4. `GET /quotations/:id` → release flags false; photos still present.
5. Row in `metering_approved` → Revert disabled / **409**.

---

## 41. **Google Sheets — Social Media Leads** (Meta / IG / FB) — Sep 2026

### Frontend

- HR → **Social Media** tab
- `components/hr-social-media-sheets-panel.tsx`
- `lib/google-sheets-social-leads.ts` — column mapping, status colours, normalizers
- `lib/api.ts` → `api.hr.sheetSources.*` (`getAll`, `discover`, `update`, `sync`, `getLeads`)
- Reference: **`BACKEND_GOOGLE_SHEETS_SOCIAL_LEADS.ts`**, **`BACKEND_GOOGLE_SHEETS_SOCIAL_LEADS.md`**

### Product

| Feature | Detail |
|---------|--------|
| Spreadsheet | `18zqPIpa3fcjRvfNqdm3FPC10bszPIPHbv5F3-TMk0A0` |
| Tabs | **Live sheet only** — currently `Jaipur Leads`, `Ajmer Leads`, `Crompton Leads`, `Ajmer Solar Lead Form New` |
| Discover | Upsert live tabs + **delete** DB rows for tabs removed/renamed in Google Sheets (UI must match sheet 1:1) |
| Toggle ON | Dealer checkbox pool → round-robin (`active_cap`, limit 1/dealer) |
| Sync | Pull new rows → `hr_leads` + `hr_lead_uploads` (`source_type=google_sheet`) |
| Calling | Assigned leads in dealer **Calling Data** + HR **Uploaded Data** |
| Colours | Sky=new, amber=pending, rose=not interested, green=visit/interested |

### Backend must do (P0)

| Item | Detail |
|------|--------|
| **Routes** | `GET /hr/sheet-sources`, `POST discover`, `PATCH :id`, `POST :id/sync`, `POST sync-all`, `GET :id/leads` |
| **Discover prune (P0)** | After reading Google tab titles, upsert those rows, then **DELETE** `hr_sheet_sources` for that `spreadsheet_id` whose `sheet_tab_name` is **not** in the live list. Do not leave old tabs (`302012 Leads`, hiring forms, etc.) |
| **GET list** | Return only remaining sources (same set as Discover) — SPA shows these as Social Media sub-tabs |
| **Auth** | `hr` role |
| **Google** | `googleapis` + service account; share sheet with SA email (Editor) |
| **Env** | `GOOGLE_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS` (+ optional `GOOGLE_SHEETS_SPREADSHEET_ID`, `CRON_SECRET`) |
| **Column map (P0)** | **Required:** `phone_number`→mobile (10 digits), `id`→external_id, `full_name`→name, `lead_status`. **Ignore:** ad_id/adset_*/campaign_id/form_id/is_organic. **Optional:** platform, campaign_name, ad_name, created_time, final decision/remarks. See MD “Sheet columns”. |
| **Dedupe** | By `external_id` and/or mobile per sheet source |
| **Assign** | From `dealer_ids` on source via `BACKEND_ASSIGN_UNASSIGNED.ts` — **not** from sheet columns |
| **Socket** | `calling:uploads-updated` after sync |
| **Auto-sync (P0)** | Cron every **15 min** → `POST /hr/sheet-sources/sync-all` (enabled tabs only) + emit socket. Do **not** rely on socket alone to pull from Google Sheets. |
| **Manual** | Keep `POST /hr/sheet-sources/:id/sync` for **Sync now** |
| **Lead fields** | Echo `leadStatus`, `finalDecision`, remarks, mobile, name, assignedDealer* (status filter chips are client-side) |

### Security

- **Never** commit service account JSON to frontend repo.
- Rotate key if exposed; credentials backend-only.

### QA

1. Spreadsheet has 4 tabs → Discover returns **exactly those 4** names; GET `/hr/sheet-sources` also returns **4** (no stale tabs).
2. Rename/delete a Google tab → Discover again → old name gone from GET list.
3. Enable tab + select dealers → PATCH saves pool.
4. Sync imports rows with valid 10-digit mobile.
5. Re-sync skips duplicate mobile.
6. HR Social Media shows coloured status cards + New/Pending/Not interested/Interested filters.
7. Dealer Calling Data shows assigned social leads.
8. `GET /hr/leads/uploads` includes `google_sheet` batches.
9. Cron every 15 min syncs enabled tabs; HR UI updates without clicking Sync now (socket or soft refresh).

---

## 42. Workflow dashboard parity (Installation / Metering / Final confirmation) — Sep 2026

### Frontend

Individual dashboards now match Admin UI (tables, sub-tabs, overdue, permission scopes):

- **Installation:** `app/dashboard/installer/page.tsx`, `lib/load-operational-installation-rows.ts`
- **Metering:** `components/metering/metering-workflow-panel.tsx` (installer + metering role)
- **Final confirmation:** `components/final-confirmation-workflow-panel.tsx`, `app/dashboard/baldev/page.tsx`

Spec: **`BACKEND_WORKFLOW_DASHBOARD_PARITY.md`**, **`BACKEND_WORKFLOW_DASHBOARD_PARITY.ts`**, REQUIRED **§AK**

### Backend must do (P0)

| Item | Detail |
|------|--------|
| **Scope semantics** | `everyone` = all workflow rows; `selected_users` = `dealerId` ∈ `selectedUserIds`; `office_only` = office match or own dealer |
| **GET /admin/quotations** | Allow non-admin when user has `installation` / `metering` / `final_confirmation` (or `accounts`) access + `scope: everyone` + level ≠ `none` — return **all dealers**, not `dealerId = req.user.id`. SPA tries this route first via `getWorkflowDashboardList()`. |
| **List fields** | Echo `dealerId`, `officeLocation`, install/metering/final workflow fields, final doc URLs (see parity doc §3) |
| **Final approve** | `PATCH` operational status → `baldev_approved` for `final_confirmation` write users |
| **Final docs** | `POST /quotations/:id/final-confirmation-documents` (4 files) |
| **Login** | Echo `moduleFieldPermissions` + `officeLocation` |

### Optional routes (instead of expanding admin auth)

- `GET /installation/quotations`
- `GET /metering/quotations`
- `GET /final-confirmation/quotations`

### QA

1. Account manager + Installation **Everyone** → installer table row count matches Admin Installation (all dealers).
2. Metering **Selected one** with two dealer UUIDs → only those dealers in Meter Pending.
3. Final confirmation **write** → final docs upload + `baldev_approved` PATCH succeed.

---

## 43. Customer Journey — default **Today** + fast dated calling-actions (Sep 2026)

### Frontend

- Admin → **Customer Journey** defaults date filter to **Today**
- Lists **20 rows**, then loads more on scroll
- Reloads calling-actions when date filter changes
- Code: `components/full-customer-journey-panel.tsx`, `lib/journey-calling-actions.ts` → `loadJourneyCallingActionsForAdmin`

### Backend must do (P0)

| Item | Detail |
|------|--------|
| **Honour `range`** | `GET /admin/calling-actions?range=daily\|weekly\|monthly\|last_month\|all\|custom` (same as Calling Reports) |
| **Custom / today bounds** | Accept `startDate` / `endDate` (ISO) and/or `fromDate` / `toDate` (`YYYY-MM-DD`) |
| **Default speed** | SPA opens with `range=daily` (Today). Must return quickly — do **not** force all-time scan |
| **Pagination** | `page` + `limit` (SPA uses 250). Return `pagination.total`. Cap pages for daily (~8) is fine |
| **Row fields** | Every row: `id`, `leadId`, `mobile`, `dealerId`, `dealerName`, `action`, **`actionAt` (ISO-8601)**, `callRemark`, `statusText` / `statusCategory` |
| **Optional** | Dedicated `GET /admin/customer-journey?startDate=&endDate=&page=&limit=20` (see `BACKEND_CUSTOMER_JOURNEY.ts`) |

### Do not

- Ignore `range=daily` and still scan all history
- Omit `actionAt` / `mobile` on bulk rows (forces slow per-mobile search)

### QA

1. Open Customer Journey → first paint in a few seconds with **Today** rows (not endless loading).
2. Change filter to **This week** / **All time** → network shows matching `range` / dates.
3. Scroll list → UI shows next 20 without reloading the whole API.
4. Calling Data / Calling Action chips show date+time when actions exist (§34).

---

## 44. HR Social Media — sheet APIs + lead status fields (Sep 2026)

### Frontend (already live)

- HR → **Assignment / Social Media / Uploaded Data / Dealer Actions** (4 top tabs always visible)
- Social Media: Discover sheet tabs, Enable, dealer pool, Sync
- Lead status filter chips: **New / Pending / Not interested / Interested** (client-side from echoed fields)
- Spec: **`BACKEND_GOOGLE_SHEETS_SOCIAL_LEADS.md`**, **`BACKEND_GOOGLE_SHEETS_SOCIAL_LEADS.ts`**, HANDOFF **§41**

### Backend must do (P0) — if not already shipped

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/hr/sheet-sources` | List sources + counts — **only tabs that still exist in Google Sheets** |
| `POST` | `/hr/sheet-sources/discover` | Body `{ spreadsheetId }` → return exact Google tab titles; upsert; **delete stale** `hr_sheet_sources` |
| `PATCH` | `/hr/sheet-sources/:id` | `{ enabled, dealerIds, activeLimitPerDealer }` |
| `POST` | `/hr/sheet-sources/:id/sync` | Pull Google Sheet → `hr_leads` + upload batch → round-robin |
| `POST` | `/hr/sheet-sources/sync-all` | **P0 auto-sync** — enabled tabs only; auth HR JWT **or** `x-cron-secret`; emit socket |
| `GET` | `/hr/sheet-sources/:id/leads` | Paginated leads for UI |

**Current live tabs (Sep 2026 sheet):** `Jaipur Leads`, `Ajmer Leads`, `Crompton Leads`, `Ajmer Solar Lead Form New`

**Auth:** `hr` · **Env:** `GOOGLE_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS` · `CRON_SECRET` · `GOOGLE_SHEETS_SPREADSHEET_ID` · share sheet with SA email as Editor.

**Cron (P0):** every 15 min → `POST /hr/sheet-sources/sync-all` with `x-cron-secret` → then `calling:uploads-updated`. Copy-paste: `postHrSheetSourcesSyncAll` in `BACKEND_GOOGLE_SHEETS_SOCIAL_LEADS.ts`.

**Discover prune (copy from `BACKEND_GOOGLE_SHEETS_SOCIAL_LEADS.ts` → `discoverHrSheetTabs`):**

```text
1. sheets.spreadsheets.get → tab titles[]
2. findOrCreate each title for spreadsheet_id
3. DELETE hr_sheet_sources WHERE spreadsheet_id = ? AND sheet_tab_name NOT IN (titles)
4. Respond { tabs, sources } for those titles only
```

**Meta column map (Ajmer Solar Lead Form New — P0):**

| Sheet | DB / API | Role |
|-------|----------|------|
| `phone_number` (`p:+91…`) | `mobile` (last 10) | **Required** — skip invalid |
| `id` (`l:…`) | `external_id` | **Required** — dedupe |
| `full_name` | `name` | **Required** |
| `lead_status` (`CREATED`) | `lead_status` | **Required** — New vs Pending |
| `platform`, `campaign_name`, `ad_name`, `created_time` | same | Optional display |
| `ad_id`, `adset_*`, `campaign_id`, `form_id`, `is_organic` | — | **Ignore** (raw_json OK) |
| — | `dealer_ids` on source | **Assign** — not from sheet |

**Echo on lead rows (for status colours / filters):**

| Field | Used for |
|-------|----------|
| `leadStatus` / `lead_status` | New (CREATED) vs Pending |
| `finalDecision` / `final_decision` | Not interested / Interested |
| `finalDecisionReason` / remarks | Visit / not interested text |
| `mobile`, `name`, `platform`, `campaignName`, `address`, `kw` | Card display |
| `assignedDealerId` / `assignedDealerName` | Who got the lead |
| `source_type=google_sheet` on upload batch | Uploaded Data + Calling Data |

**Socket:** `calling:uploads-updated` after sync.

### Frontend-only (no backend)

- 4 HR top tabs layout (Assignment / Social Media / Uploaded Data / Dealer Actions)
- Lead status filter chips (derived from fields above)
- Client prune of stale tabs after Discover (still requires backend prune so refresh stays correct)

### QA

1. Discover returns tabs including `Ajmer_Leads` / city tabs.
2. Enable + save dealers → Sync imports mobiles.
3. Social Media lead cards colour correctly; status filter counts match.
4. Assigned leads appear in dealer Calling Data.
5. Credentials never in frontend repo.

---


