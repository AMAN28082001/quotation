// @ts-nocheck
/**
 * =============================================================================
 * BACKEND REFERENCE — Admin "Send to Metering" from pending_installer (Jul 2026)
 * =============================================================================
 *
 * Frontend:
 *   - Admin Quotations tab → orange "Metering" button
 *   - `app/dashboard/admin/page.tsx` → `handleSendToMetering`
 *   - `lib/api.ts` → `sendQuotationToMetering` / `api.admin.quotations.updateOperationalStatus`
 *
 * Error that must stop:
 *   "Cannot send to metering from installation status 'pending_installer'"
 *
 * Why it happens:
 *   Admin can manually send a quotation to Metering even while OPS is still
 *   `pending_installer` (e.g. after Payment Management release, before installer
 *   photos). The UI allows it; the backend was rejecting the transition.
 *
 * Required behaviour:
 *   For role `admin` (and preferably `account-management`), ALLOW
 *   `pending_installer` | `installer_in_progress` | `installer_approved`
 *   → `pending_metering` when force/adminOverride is set OR on dedicated
 *   send-to-metering route.
 *
 * After save, GET must return for ALL logins (Admin Metering tab + Metering dashboard):
 *   installationStatus / installation_status = "pending_metering"
 *   meteringStatus / metering_status         = "pending_metering"
 *   (optional) pendingMeteringAt / pending_metering_at = ISO timestamp
 *
 * Metering role dashboard loads queue with status=pending_metering and shows
 * those rows under "Meter Pending".
 */

const logMT = (stage, data) => {
  const ts = new Date().toISOString()
  try {
    console.log(`[SendToMetering ${ts}] ${stage}`, data === undefined ? "" : JSON.stringify(data))
  } catch {
    console.log(`[SendToMetering ${ts}] ${stage}`, data)
  }
}

const PRE_METERING_STATUSES = new Set([
  null,
  "",
  "pending_installer",
  "installer_in_progress",
  "installer_approved",
  "pending",
])

function requireAdminOrAm(req, res) {
  const user = req.user || req.dealer
  if (!user || !["admin", "account-management"].includes(user.role)) {
    res.status(403).json({ success: false, error: { code: "AUTH_004", message: "Forbidden" } })
    return null
  }
  return user
}

function currentInstallStatus(quotation) {
  return String(
    quotation.installationStatus ||
      quotation.installation_status ||
      quotation.meteringStatus ||
      quotation.metering_status ||
      "",
  )
    .trim()
    .toLowerCase()
}

/**
 * Apply pending_metering — the single source of truth write for this handoff.
 * Does NOT require installer_approved first when caller is admin + force.
 */
async function applyPendingMetering(quotation, user, { force = false } = {}) {
  const from = currentInstallStatus(quotation)
  const isAdminForce = force === true || user?.role === "admin"

  logMT("① BEFORE", {
    id: quotation.id,
    from,
    force: isAdminForce,
    role: user?.role,
  })

  // Non-admin / non-force: keep stricter gate (installer must be approved).
  if (!isAdminForce && from !== "installer_approved" && from !== "pending_metering") {
    const err = new Error(`Cannot send to metering from installation status '${from || "unset"}'`)
    err.code = "WF_METERING_001"
    err.status = 400
    throw err
  }

  // Admin force: allow from pending_installer / installer_in_progress / installer_approved.
  if (isAdminForce && from && !PRE_METERING_STATUSES.has(from) && from !== "pending_metering") {
    // Already past metering (e.g. metering_approved / mco) — idempotent OK if already pending_metering;
    // otherwise reject moving backwards without an explicit revert flow.
    if (from !== "pending_metering" && from !== "metering_in_progress") {
      const err = new Error(`Cannot send to metering from installation status '${from}'`)
      err.code = "WF_METERING_002"
      err.status = 400
      throw err
    }
  }

  const now = new Date()
  await quotation.update({
    installationStatus: "pending_metering",
    installation_status: "pending_metering",
    meteringStatus: "pending_metering",
    metering_status: "pending_metering",
    pendingMeteringAt: now,
    pending_metering_at: now,
    // Keep quotation.status = approved (do not overwrite with pending_metering).
  })
  await quotation.reload()

  logMT("② AFTER", {
    id: quotation.id,
    installationStatus: quotation.installationStatus || quotation.installation_status,
    meteringStatus: quotation.meteringStatus || quotation.metering_status,
  })
  return quotation
}

// -----------------------------------------------------------------------------
// PREFERRED — PATCH|POST /api/admin/quotations/:id/send-to-metering
// -----------------------------------------------------------------------------
/**
 * Body from frontend:
 * {
 *   "status": "pending_metering",
 *   "installationStatus": "pending_metering",
 *   "meteringStatus": "pending_metering",
 *   "force": true,
 *   "adminOverride": true,
 *   "allowFromPendingInstaller": true,
 *   "source": "admin"
 * }
 */
export async function postAdminSendToMetering(req, res) {
  const user = requireAdminOrAm(req, res)
  if (!user) return
  const quotationId = req.params.quotationId || req.params.id
  const body = req.body || {}
  logMT("▶ IN send-to-metering", { quotationId, user: user?.id, role: user?.role, body })

  try {
    const quotation = await Quotation.findByPk(quotationId)
    if (!quotation) {
      return res.status(404).json({ success: false, error: { code: "RES_001", message: "Not found" } })
    }

    const force =
      body.force === true ||
      body.adminOverride === true ||
      body.allowFromPendingInstaller === true ||
      user.role === "admin"

    await applyPendingMetering(quotation, user, { force })
    const data = quotationToApiJson(quotation)
    logMT("◀ OUT 200", {
      id: data.id,
      installationStatus: data.installationStatus || data.installation_status,
      meteringStatus: data.meteringStatus || data.metering_status,
    })
    return res.json({ success: true, data })
  } catch (e) {
    logMT("✖ ERROR", { quotationId, message: e?.message, stack: e?.stack })
    const status = e?.status || 500
    return res.status(status).json({
      success: false,
      error: { code: e?.code || "SYS_001", message: e?.message || "Internal error" },
    })
  }
}

// -----------------------------------------------------------------------------
// ALSO FIX — PATCH /api/admin/quotations/:id/installation-status
// -----------------------------------------------------------------------------
/**
 * When body.installationStatus / status === "pending_metering", use the same
 * applyPendingMetering path. Do NOT return:
 *   "Cannot send to metering from installation status 'pending_installer'"
 * when force/adminOverride is true OR role is admin.
 *
 * Drop-in snippet for the existing handler:
 *
 *   const target = String(body.installationStatus || body.installation_status || body.status || "").toLowerCase()
 *   if (target === "pending_metering") {
 *     const force = body.force === true || body.adminOverride === true || body.allowFromPendingInstaller === true || req.user?.role === "admin"
 *     await applyPendingMetering(quotation, req.user, { force })
 *     return res.json({ success: true, data: quotationToApiJson(quotation) })
 *   }
 */
export async function patchAdminInstallationStatusAllowMetering(req, res) {
  const user = requireAdminOrAm(req, res)
  if (!user) return
  const quotationId = req.params.quotationId || req.params.id
  const body = req.body || {}
  const target = String(
    body.installationStatus || body.installation_status || body.status || body.meteringStatus || "",
  )
    .trim()
    .toLowerCase()

  logMT("▶ IN installation-status", { quotationId, target, body })

  try {
    const quotation = await Quotation.findByPk(quotationId)
    if (!quotation) {
      return res.status(404).json({ success: false, error: { code: "RES_001", message: "Not found" } })
    }

    if (target === "pending_metering") {
      const force =
        body.force === true ||
        body.adminOverride === true ||
        body.allowFromPendingInstaller === true ||
        user.role === "admin"
      await applyPendingMetering(quotation, user, { force })
      return res.json({ success: true, data: quotationToApiJson(quotation) })
    }

    // … existing non-metering status handling …
    return res.status(400).json({
      success: false,
      error: { code: "VAL_STATUS", message: `Unhandled status in this snippet: ${target}` },
    })
  } catch (e) {
    logMT("✖ ERROR installation-status", { quotationId, message: e?.message, stack: e?.stack })
    const status = e?.status || 500
    return res.status(status).json({
      success: false,
      error: { code: e?.code || "SYS_001", message: e?.message || "Internal error" },
    })
  }
}

// -----------------------------------------------------------------------------
// GET queues — Metering dashboard + Admin Metering tab
// -----------------------------------------------------------------------------
/**
 * GET /api/installer/queue?status=pending_metering
 * GET /api/metering/queue?status=pending_metering   (optional)
 * GET /api/admin/quotations?status=approved
 *
 * MUST include rows where installation_status OR metering_status = 'pending_metering'.
 * Frontend Metering dashboard calls getQueue({ status: "pending_metering" }) first.
 */

/*
router.patch("/admin/quotations/:id/send-to-metering", authRequired, postAdminSendToMetering)
router.post ("/admin/quotations/:id/send-to-metering", authRequired, postAdminSendToMetering)
router.patch("/admin/quotations/:id/installation-status", authRequired, patchAdminInstallationStatusAllowMetering)
*/

// -----------------------------------------------------------------------------
// QA checklist
// -----------------------------------------------------------------------------
/*
 1. Quotation QT-RKDQDE: status=approved, installation_status=pending_installer.
 2. Admin → Quotations → click Metering.
 3. Expect 200 (not "Cannot send to metering from installation status 'pending_installer'").
 4. GET row → installationStatus=pending_metering, meteringStatus=pending_metering.
 5. Admin → Metering tab → Meter Pending shows the row.
 6. Metering role login → Meter Pending shows the same row.
 7. Console: [SendToMetering] ▶ IN / ① BEFORE / ② AFTER / ◀ OUT 200.

Related:
  - Retrieve from Metering → BACKEND_RETRIEVE_FROM_METERING.ts (HANDOFF §39)
  - Retrieve from Installation → BACKEND_RETRIEVE_FROM_INSTALLATION.ts (HANDOFF §40)
*/
