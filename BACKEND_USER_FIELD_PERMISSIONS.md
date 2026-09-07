# Backend — Office location + workflow field permissions

**Frontend:** Admin → Users → Create/Edit User → **Dashboard access** (inline on Installation, Metering, Final confirmation rows).  
**Code:** `lib/module-field-permissions.ts`, `components/module-field-permissions-editor.tsx`, `lib/auth-context.tsx`  
**Reference implementation:** `BACKEND_USER_FIELD_PERMISSIONS.ts`  
**Also:** REQUIRED **§AK**, HANDOFF **§38**

Dashboard `access[]` checkboxes control which dashboards open after login. **Field permissions** are separate JSON on the user — per workflow module.

Each workflow row has:
- **Field access** — `none` | `read` | `write`
- **Who can access** — scope dropdown (see below)

---

## 1. Office location

Employee office (Personal Information section).

| Value | Notes |
|-------|--------|
| `Jaipur` | |
| `Ajmer` | |
| `Chomu` | |
| `null` / omitted | UI shows “Not set” |

Persist on **dealers**, **account-managers**, **visitors**:

```json
{
  "officeLocation": "Jaipur",
  "office_location": "Jaipur"
}
```

Echo on `POST /auth/login` → `user.officeLocation`.

Used with scope **`office_only`** (“Only there” in UI).

---

## 2. Module field permissions

JSON on user row. **Not** the same as `access[]`.

```json
{
  "moduleFieldPermissions": {
    "installation": {
      "level": "read",
      "scope": "everyone",
      "selectedUserIds": []
    },
    "metering": {
      "level": "write",
      "scope": "selected_users",
      "selectedUserIds": ["uuid-user-or-dealer-1"]
    },
    "final_confirmation": {
      "level": "write",
      "scope": "office_only",
      "selectedUserIds": []
    }
  }
}
```

**Aliases:** `modulePermissions`, `module_permissions`. Module key alias: `finalConfirmation`.

### `level` (per module)

| Value | Frontend behavior |
|-------|-------------------|
| `none` | No records in that workflow list |
| `read` | Records visible; inputs/buttons disabled |
| `write` | Full edit and submit |

### `scope` — **Who can access** (UI labels)

| Stored value | UI label | Meaning |
|--------------|----------|---------|
| `everyone` | **Everyone** | All quotation rows for that workflow (all dealers), when `level` ≠ `none` |
| `selected_users` | **Selected one** | Rows where `quotation.dealerId` ∈ `selectedUserIds` (dealers/users picked in Admin) |
| `office_only` | **Only there** | `quotation.officeLocation` === viewer office; if missing on row, only `quotation.dealerId` === viewer `id` |

**Backward compatibility:** Accept legacy `everyone_except_dealer` on input; normalize to `everyone` on read/write. Do **not** exclude dealers for `everyone` (legacy `everyone_except_dealer` is treated as `everyone`).

### Module keys → dashboards

| Key | `access[]` key | Dashboard |
|-----|----------------|-----------|
| `installation` | `installation` | `/dashboard/installer` |
| `metering` | `metering` | `/dashboard/metering` |
| `final_confirmation` | `final_confirmation` | `/dashboard/baldev` |

---

## 3. Database

```sql
ALTER TABLE account_managers
  ADD COLUMN IF NOT EXISTS office_location VARCHAR(32) NULL
    CHECK (office_location IN ('Jaipur', 'Ajmer', 'Chomu') OR office_location IS NULL),
  ADD COLUMN IF NOT EXISTS module_field_permissions JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Repeat for dealers, visitors.

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS office_location VARCHAR(32) NULL;
```

**Validation (Zod):**

```typescript
scope: z.enum(["everyone", "selected_users", "office_only"])
  // preprocess: map everyone_except_dealer → everyone
level: z.enum(["none", "read", "write"])
selectedUserIds: z.array(z.string().uuid()).default([])
```

---

## 4. API changes

### User CRUD — accept + echo

| Method | Path |
|--------|------|
| `POST/PUT/GET` | `/admin/account-managers`, `/admin/dealers`, `/admin/visitors` |

**Body fields:** `officeLocation`, `moduleFieldPermissions` (+ aliases `office_location`, `modulePermissions`).

Frontend save example:

```json
{
  "officeLocation": "Jaipur",
  "moduleFieldPermissions": {
    "installation": { "level": "write", "scope": "everyone", "selectedUserIds": [] },
    "metering": { "level": "read", "scope": "selected_users", "selectedUserIds": ["uuid-1"] },
    "final_confirmation": { "level": "write", "scope": "office_only", "selectedUserIds": [] }
  }
}
```

**Normalize on save:** `everyone_except_dealer` → `everyone`; empty `selectedUserIds` when scope ≠ `selected_users`.

### Auth

| Method | Path | Echo on `user` |
|--------|------|----------------|
| `POST` | `/auth/login` | `officeLocation`, `moduleFieldPermissions`, `access` |

### Quotations (scope filtering)

Echo on list + detail:

| Field | Used for |
|-------|----------|
| `officeLocation` | `office_only` (“Only there”) |
| `dealerId` | `selected_users` (“Selected one”) record filter |

Applies to: `GET /quotations?status=approved`, `GET /admin/quotations`, `GET /account-management/quotations`, `GET /quotations/:id`.

**Everyone scope (P0):** When `moduleFieldPermissions.<module>.scope === "everyone"`, the SPA calls **full-list** routes (not dealer-scoped `GET /quotations` only).

| Module | SPA calls (when everyone) |
|--------|---------------------------|
| `accounts` | `GET /account-management/quotations` or `GET /admin/quotations` |
| `installation` | `GET /admin/quotations` (+ installer queue merge) |
| `metering` | `GET /admin/quotations` (+ installer queue merge) |
| `final_confirmation` | `GET /admin/quotations` (or scoped approved list) |

Backend must allow non-admin users with the matching dashboard access + **everyone** scope to receive **all dealers’ rows** on those routes. See **`BACKEND_WORKFLOW_DASHBOARD_PARITY.md`**.

| Scope (UI) | List API | Record filter |
|------------|----------|---------------|
| **Everyone** | Full list (`/admin/quotations` or module route) | All workflow rows |
| **Selected one** | Scoped list + SPA filter | `dealerId` ∈ `selectedUserIds` |
| **Only there** | Scoped list + SPA filter | Same `officeLocation`, or own `dealerId` when office missing |

### `GET /account-management/quotations` (P0 — Everyone scope)

```typescript
// Auth: accounts access OR role account-management OR admin
router.get(
  "/account-management/quotations",
  auth,
  requireAnyAccess(["accounts", "admin"]),
  async (req, res) => {
    const user = req.user
    const rule = user.moduleFieldPermissions?.accounts
    const scope = normalizeScope(rule?.scope ?? "everyone")

    // Everyone → all approved quotations (no dealerId = req.user.id filter)
    if (scope === "everyone" && rule?.level !== "none") {
      const rows = await db.quotations.findApproved({ status: "approved", ...req.query })
      return res.json({ success: true, quotations: rows })
    }

    // Selected / office_only → dealer-scoped list (same as GET /quotations for this user)
    const rows = await db.quotations.findApprovedForUser(user, { status: "approved" })
    return res.json({ success: true, quotations: rows })
  },
)
```

Alias: frontend also tries `GET /admin/quotations?status=approved` when account-management route 404s.


## 5. Server-side enforcement (P1)

Enforce on mutating routes:

| Module | Routes (examples) |
|--------|---------------------|
| `installation` | Install document POST, stage PATCH |
| `metering` | Metering stage PATCH, meter docs |
| `final_confirmation` | Baldev final docs POST, approve |

**403:** `{ "code": "FIELD_PERMISSION_DENIED", "message": "…" }`

```typescript
function normalizeScope(scope: string): "everyone" | "selected_users" | "office_only" {
  if (scope === "everyone_except_dealer") return "everyone"
  return scope as ...
}

function assertWorkflowWrite(user, module, quotation) {
  const rule = user.moduleFieldPermissions?.[module]
  if (user.role === "admin") return
  if (rule?.level !== "write") throw forbidden()
  const scope = normalizeScope(rule.scope)
  if (scope === "office_only") {
    const recordOffice = String(quotation.officeLocation ?? "").trim()
    const viewerOffice = String(user.officeLocation ?? "").trim()
    if (recordOffice && viewerOffice && recordOffice !== viewerOffice) throw forbidden()
    if (!recordOffice) {
      const dealerId = String(quotation.dealerId ?? "").trim()
      if (dealerId && dealerId !== String(user.id)) throw forbidden()
    }
  }
  if (scope === "selected_users") {
    const dealerId = String(quotation.dealerId ?? "").trim()
    if (!dealerId || !rule.selectedUserIds.includes(dealerId)) throw forbidden()
  }
}
```

---

## 6. Frontend fallback (until backend ships)

`localStorage`: `userModulePermissionOverrides`, `userOfficeLocationOverrides` (keyed by username).

---

## 7. QA

1. **Everyone** + installation **write** → dealer with installation access can upload (no dealer block).
2. **Selected one** + metering **write** + `selectedUserIds` [dealer-uuid] → only that dealer's rows editable.
3. **Only there** + office **Ajmer** + installation **read** → only Ajmer quotations; read-only.
4. Legacy JSON with `everyone_except_dealer` → API normalizes to `everyone` on GET.
5. Save user → GET returns same `moduleFieldPermissions`.
6. Login echoes permissions without localStorage override.
