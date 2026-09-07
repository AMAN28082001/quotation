# Backend: Installation tab data (Payment Management → Admin Installation)

**Status: BLOCKER** — Admin → **Installation** tab is empty after refresh unless the backend implements the endpoints and fields below.

**Frontend (already done):** Only quotations with green **Sent to installer** in Payment Management appear in Installation. The UI reads **`installationReadyForInstaller`** and **`installationReleasedAt`** from **`GET /api/admin/quotations`**. If those fields are missing or always `false`, **no rows show** (localStorage is a same-browser fallback only).

---

## 1. Why data is not coming

| What works today | What breaks |
|------------------|-------------|
| Account team clicks **Send to Installer** → green badge may show (localStorage + optimistic UI) | **`PATCH /quotations/{id}/installation-release`** missing or returns 404 → flag never saved in DB |
| Payment Management on same browser | Admin panel on refresh / other device → **`GET /admin/quotations`** has no release fields |
| Approved quotations exist | Installation tab filters **only released** rows → empty list |

**Fix:** Persist release on PATCH; return release + workflow fields on every list GET used by admin and account-management.

---

## 2. Data flow

```
Payment Management                    Backend DB                         Admin Installation
─────────────────                    ──────────                         ────────────────────
[Send to Installer]  ──PATCH──►  installation_ready_for_installer=true
                                   installation_released_at=NOW()
                                   installation_status=pending_installer
                                              │
                                              ▼
                                   GET /admin/quotations  ──►  Pending Installation tab
                                   (must include flags)        (photos not uploaded)

Installer/Admin upload photos  ──PATCH──►  installation_status=installer_approved
                                              │
                                              ▼
                                   GET /admin/quotations  ──►  Approved Installation tab

Admin [Revert]  ──PATCH──►  installation_status=pending_installer
                            (quotation.status unchanged; photos kept)
                                              │
                                              ▼
                                   GET /admin/quotations  ──►  Pending Installation tab

Admin [Send to Metering]  ──PATCH──►  installation_status=pending_metering
                                              │
                                              ▼
                                   Row leaves Installation → Metering tab
```

---

## 3. Database (required columns)

```sql
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS installation_ready_for_installer BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS installation_released_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS installation_status VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS installation_scheduled_at DATE NULL,
  ADD COLUMN IF NOT EXISTS installation_team_id UUID NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_installation_release
  ON quotations (installation_ready_for_installer, installation_released_at)
  WHERE installation_ready_for_installer = TRUE;
```

**Allowed `installation_status` values:**

| Value | Meaning |
|-------|---------|
| `pending_installer` | Sent from Payment Management; no upload yet |
| `installer_in_progress` | Work started |
| `installer_approved` | Photos uploaded / install complete |
| `pending_metering` | Admin sent to metering (manual) |
| `metering_in_progress` | Metering team working |
| `metering_approved` | Metering approved |
| `mco` | MCO stage |
| `pending_baldev` / `baldev_approved` / `completed` | Later pipeline |

---

## 4. Endpoint A — Release to installer (Account Management)

**Implement this route (frontend preferred path):**

```
PATCH /api/quotations/:quotationId/installation-release
Authorization: Bearer <account-management or admin JWT>
Content-Type: application/json
```

**Request body:**

```json
{
  "installationReadyForInstaller": true,
  "installationReleasedAt": "2026-06-05T10:30:00.000Z"
}
```

**Backend logic:**

1. Load quotation; require `status = approved` (or your business rule).
2. Set:
   - `installation_ready_for_installer = true`
   - `installation_released_at = body.installationReleasedAt OR NOW()`
   - `installation_status = 'pending_installer'` (only if currently null or still pre-install)
3. Save; return updated quotation.

**Response `200` (example):**

```json
{
  "success": true,
  "data": {
    "id": "QT-V9L5W8",
    "installationReadyForInstaller": true,
    "installationReleasedAt": "2026-06-05T10:30:00.000Z",
    "installationStatus": "pending_installer"
  }
}
```

**Auth:** roles `account-management`, `admin`.

**Fallback routes** (frontend retries if 404):  
`PATCH /api/quotations/:id/installation/ready` — same body/behavior.

**Do not** rely on `PATCH /payment-details` alone unless you merge **only** release fields without wiping payment phases.

---

## 5. Endpoint B — Admin quotation list (Installation tab source)

```
GET /api/admin/quotations?page=1&limit=1000
Authorization: Bearer <admin JWT>
```

**Every item in `quotations[]` MUST include (camelCase or snake_case):**

```json
{
  "id": "QT-V9L5W8",
  "status": "approved",
  "installationReadyForInstaller": true,
  "installation_ready_for_installer": true,
  "installationReleasedAt": "2026-06-05T10:30:00.000Z",
  "installation_released_at": "2026-06-05T10:30:00.000Z",
  "installationStatus": "pending_installer",
  "installation_status": "pending_installer",
  "installationScheduledAt": "2026-06-12",
  "installationTeamId": null,
  "customer": { "firstName": "Sharwan", "lastName": "Lal Jat", "mobile": "..." },
  "dealer": { "id": "...", "firstName": "...", "lastName": "...", "mobile": "..." }
}
```

**Critical:** Do not nest release flags only under `payment`, `workflow`, or `metadata` — the frontend reads **top-level** fields on each quotation object.

**Filter (optional server-side):** Admin Installation could request all quotations; frontend filters client-side. Minimum fix: return release fields on **all** approved rows that were released.

---

## 6. Endpoint C — Account Management list

```
GET /api/quotations?status=approved&page=1&limit=1000
Authorization: Bearer <account-management JWT>
```

Same release fields as §5 on each row — drives green **Sent to installer** badge after refresh.

---

## 7. Endpoint D — Installer queue (supplementary)

```
GET /api/installer/quotations?status=pending_installer&page=1&limit=1000
```

**WHERE clause:**

```sql
WHERE installation_ready_for_installer = TRUE
   OR installation_released_at IS NOT NULL
```

Do **not** return `status = approved` quotations that were never released.

---

## 8. Endpoint E — Installation status updates

**After photo upload:**

```
PATCH /api/admin/quotations/:id/installation-status
{ "installationStatus": "installer_approved" }
```

**Send to metering (manual — do NOT auto on upload):**

```
PATCH /api/admin/quotations/:id/installation-status
{ "installationStatus": "pending_metering" }
```

**Revert to pending (admin — required):**

```
PATCH /api/admin/quotations/:id/installation-status
{
  "installationStatus": "pending_installer",
  "force": true,
  "adminOverride": true,
  "allowRevert": true
}
```

Allowed from `installer_approved` or `installer_partial_approved` (idempotent if already `pending_installer`).

- Set **`installation_status = pending_installer`**.
- Do **not** change quotation **`status`** (`approved` stays `approved`).
- Clear **`installer_approved_at`**, **`installation_partial_approved`**.
- Keep uploaded photos.
- Remove id from `GET …/installer/quotations?status=approved`; add to `?status=pending_installer`.

Full spec: **`BACKEND_INSTALLATION_REVERT.ts`**, HANDOFF **§35**, REQUIRED **§AH**.

Return updated `installationStatus` in response body.

---

## 9. List serializer (Node/Express pseudocode)

Add to your quotation `toJSON()` / list mapper:

```javascript
function serializeQuotationForAdmin(row) {
  return {
    id: row.id,
    status: row.status,
    // ... customer, dealer, pricing, etc.
    installationReadyForInstaller: Boolean(row.installation_ready_for_installer),
    installation_ready_for_installer: Boolean(row.installation_ready_for_installer),
    installationReleasedAt: row.installation_released_at?.toISOString?.() ?? row.installation_released_at ?? null,
    installation_released_at: row.installation_released_at?.toISOString?.() ?? row.installation_released_at ?? null,
    installationStatus: row.installation_status ?? null,
    installation_status: row.installation_status ?? null,
    installationScheduledAt: row.installation_scheduled_at ?? null,
    installationTeamId: row.installation_team_id ?? null,
  }
}
```

Reference handler: **`BACKEND_ADMIN_QUOTATION_STATUS.ts`** → `patchQuotationInstallationRelease`, `serializeInstallationReleaseFields`.

---

## 10. Backfill (if Payment Management already sent rows in production)

If account team already clicked **Send to Installer** but DB has no flags (frontend-only state):

```sql
-- Example: backfill from audit log or manual list of quotation IDs
UPDATE quotations
SET installation_ready_for_installer = TRUE,
    installation_released_at = COALESCE(installation_released_at, status_approved_at, NOW()),
    installation_status = COALESCE(installation_status, 'pending_installer')
WHERE id IN ('QT-XXXX', 'QT-YYYY');
```

After backfill, `GET /admin/quotations` must return the updated fields.

---

## 11. QA checklist (backend team)

1. **PATCH release**  
   ```bash
   curl -X PATCH "$API/quotations/QT-TEST/installation-release" \
     -H "Authorization: Bearer $AM_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"installationReadyForInstaller":true,"installationReleasedAt":"2026-06-05T12:00:00.000Z"}'
   ```  
   Expect **200**; DB row has `installation_ready_for_installer = true`.

2. **GET admin list**  
   ```bash
   curl "$API/admin/quotations?limit=10" -H "Authorization: Bearer $ADMIN_TOKEN"
   ```  
   Released quotation includes `installationReadyForInstaller: true`.

3. **Cross-session**  
   Send from Payment Management → open Admin Installation in incognito / different browser → row visible.

4. **Not released**  
   Approved quotation without release PATCH → **must not** appear in `GET /installer/quotations` and frontend Installation tab.

5. **Upload**  
   Complete install upload → `installationStatus: installer_approved` on next GET.

6. **Metering**  
   PATCH `pending_metering` only on explicit Send to Metering — not on upload.

---

## 12. Frontend files (for reference)

| File | Purpose |
|------|---------|
| `lib/operational-install-queue.ts` | `isQuotationSentToInstaller`, `shouldShowInAdminInstallationTab` |
| `lib/api.ts` | `releaseForInstallation`, `admin.quotations.getAll` |
| `app/dashboard/account-management/page.tsx` | Send to Installer |
| `app/dashboard/admin/page.tsx` | Installation tab |

---

## 13. Related docs

- `BACKEND_CHANGES_HANDOFF.md` — §9, **§40** (Retrieve from Installation)  
- `BACKEND_CHANGES_REQUIRED.md` — Installation release & planned date, **§AM**  
- `BACKEND_RETRIEVE_FROM_INSTALLATION.ts` — undo Send to Installer handler  
- `BACKEND_ADMIN_QUOTATION_STATUS.ts` — reference PATCH/serializer code  

---

## 14. Retrieve from Installation (undo Send to Installer) — Sep 2026

**UI:** Admin Installation **Revert** (↺) on Pending/Partial/In progress; Accounts **Revert** when badge shows **Sent to installer**.

**Effect:** Clear `installation_ready_for_installer` and `installation_released_at`. Row leaves Installation tab; Accounts can **Send to Installer** again.

**Preferred route:**

```
PATCH /api/quotations/{id}/installation-release
{
  "installationReadyForInstaller": false,
  "installation_ready_for_installer": false,
  "installationReleasedAt": null,
  "installation_released_at": null,
  "retrieveFromInstallation": true,
  "allowRevert": true
}
```

Or dedicated: `PATCH /api/admin/quotations/{id}/retrieve-from-installation`

**Must not:** wipe `installments` / payment phases on this PATCH (merge release fields only).

**Block when:** `metering_approved`, `mco`, `meter_installation_pending`, etc. → **409**.

**Not the same as:** Approved Installation **Revert** (`installer_approved` → `pending_installer`) — see `BACKEND_INSTALLATION_REVERT.ts`.
