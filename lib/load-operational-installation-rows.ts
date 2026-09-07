import { api, fetchSentToInstallerQuotationRows } from "@/lib/api"
import { getInstallationTeamIdForQuotation, readTeamAssignments } from "@/lib/installation-teams"
import {
  extractQuotationListFromApiResponse,
  flattenQuotationListRow,
  flattenWrappedQuotationRow,
  isQuotationSentToInstaller,
  mergeInstallationMediaSources,
  mergeInstallerReleaseOntoQuotation,
  readInstallationScheduledMap,
  readInstallerReleaseMap,
  shouldShowInAdminInstallationTab,
  stampInstallerReleaseFromMap,
  syncInstallerReleaseMapFromRows,
  type OperationalQuotationRecord,
} from "@/lib/operational-install-queue"

export type LoadOperationalInstallationRowsOptions = {
  /** Try GET /admin/quotations when true (403-safe). Default true. */
  fetchAdminQuotationList?: boolean
  /** When set, only rows assigned to this installation team id are returned. */
  filterTeamId?: string
  getQuotationById?: (id: string) => Promise<unknown>
}

export type LoadOperationalInstallationRowsResult = {
  rows: Record<string, unknown>[]
  installerQueueApprovedIds: Set<string>
  releaseMap: ReturnType<typeof readInstallerReleaseMap>
}

/**
 * Shared merge for Admin → Installation and Installer Dashboard — same sent-to-installer rows.
 */
export async function loadOperationalInstallationRows(
  options: LoadOperationalInstallationRowsOptions = {},
): Promise<LoadOperationalInstallationRowsResult> {
  const fetchAdmin = options.fetchAdminQuotationList !== false
  const getById = options.getQuotationById ??
    ((id: string) => api.quotations.getById(id, { suppressErrorLog: true }))

  let releaseLocal = readInstallerReleaseMap()
  const installerQueueById: Record<string, Record<string, unknown>> = {}
  const installerQueueApprovedIdSet = new Set<string>()

  const ingestInstallerQueueRows = (rows: unknown[]) => {
    rows.forEach((row) => {
      const flat = flattenWrappedQuotationRow(row)
      const id = String(flat.id || "").trim()
      if (!id) return
      installerQueueById[id] = mergeInstallationMediaSources(
        installerQueueById[id] || {},
        flat,
      ) as Record<string, unknown>
    })
  }

  let adminRowsRaw: unknown[] = []
  if (fetchAdmin) {
    try {
      const quotationsResponse = await api.quotations.getWorkflowDashboardList({ page: 1, limit: 1000 })
      adminRowsRaw =
        (quotationsResponse as { quotations?: unknown[] }).quotations ||
        extractQuotationListFromApiResponse(quotationsResponse)
    } catch {
      adminRowsRaw = []
    }
  }

  const installerQueueOptions = { suppressErrorLog: true as const }

  try {
    const pending = extractQuotationListFromApiResponse(
      await api.installer.getQueue({ status: "pending_installer", page: 1, limit: 1000 }, installerQueueOptions),
    )
    const approvedQ = extractQuotationListFromApiResponse(
      await api.installer.getQueue({ status: "approved", page: 1, limit: 1000 }, installerQueueOptions),
    )
    ingestInstallerQueueRows(pending)
    ingestInstallerQueueRows(approvedQ)
    approvedQ.forEach((row: unknown) => {
      const flat = flattenWrappedQuotationRow(row)
      const id = String(flat.id || "").trim()
      if (id) installerQueueApprovedIdSet.add(id)
    })
    for (const status of ["installer_in_progress", "installer_approved", "pending_baldev"] as const) {
      try {
        ingestInstallerQueueRows(
          extractQuotationListFromApiResponse(
            await api.installer.getQueue({ status, page: 1, limit: 1000 }, installerQueueOptions),
          ),
        )
      } catch {
        // optional status filter
      }
    }
    if (Object.keys(installerQueueById).length === 0) {
      ingestInstallerQueueRows(
        extractQuotationListFromApiResponse(
          await api.installer.getQueue({ page: 1, limit: 1000 }, installerQueueOptions),
        ),
      )
    }
  } catch {
    // queue optional when admin/payment lists still have rows
  }

  let localQuotationsBackup: Record<string, unknown>[] = []
  try {
    localQuotationsBackup = JSON.parse(localStorage.getItem("quotations") || "[]")
  } catch {
    localQuotationsBackup = []
  }
  const localByIdEarly = new Map(
    localQuotationsBackup
      .filter((row) => String(row?.id || "").trim())
      .map((row) => [String(row.id), row]),
  )

  releaseLocal = syncInstallerReleaseMapFromRows(adminRowsRaw)

  let paymentSentRows: unknown[] = []
  try {
    paymentSentRows = await fetchSentToInstallerQuotationRows()
    releaseLocal = syncInstallerReleaseMapFromRows([...adminRowsRaw, ...paymentSentRows])
  } catch {
    // release map from admin list still applies
  }

  const byId = new Map<string, Record<string, unknown>>()
  adminRowsRaw.forEach((row: unknown) => {
    const flat = flattenQuotationListRow(row)
    const id = String(flat.id || "").trim()
    if (id) byId.set(id, stampInstallerReleaseFromMap(flat, releaseLocal) as Record<string, unknown>)
  })

  Object.entries(installerQueueById).forEach(([id, queueRow]) => {
    const rowWithStatus = installerQueueApprovedIdSet.has(id)
      ? ({
          ...queueRow,
          installationStatus: queueRow.installationStatus ?? queueRow.installation_status ?? "installer_approved",
          installation_status: queueRow.installation_status ?? queueRow.installationStatus ?? "installer_approved",
        } as Record<string, unknown>)
      : queueRow
    const existing = byId.get(id)
    if (existing) {
      byId.set(
        id,
        stampInstallerReleaseFromMap(
          mergeInstallationMediaSources(existing, rowWithStatus) as OperationalQuotationRecord,
          releaseLocal,
        ) as Record<string, unknown>,
      )
      return
    }
    if (isQuotationSentToInstaller(rowWithStatus, releaseLocal) || releaseLocal[id]) {
      byId.set(id, stampInstallerReleaseFromMap(rowWithStatus, releaseLocal) as Record<string, unknown>)
    }
  })

  const paymentRowsToMerge =
    paymentSentRows.length > 0
      ? paymentSentRows
      : await (async () => {
          try {
            const approvedResp = await api.quotations.getAll(
              { status: "approved", page: 1, limit: 1000 },
              { suppressErrorLog: true },
            )
            return extractQuotationListFromApiResponse(approvedResp)
          } catch {
            return [] as unknown[]
          }
        })()

  releaseLocal = syncInstallerReleaseMapFromRows([
    ...adminRowsRaw,
    ...paymentRowsToMerge,
    ...Object.values(installerQueueById),
  ])

  paymentRowsToMerge.forEach((row: unknown) => {
    const flat = flattenQuotationListRow(row)
    const id = String(flat.id || "").trim()
    if (!id) return
    const sent = isQuotationSentToInstaller(flat, releaseLocal) || Boolean(releaseLocal[id])
    if (!sent) return
    const existing = byId.get(id)
    const merged = stampInstallerReleaseFromMap(
      existing ? (mergeInstallationMediaSources(existing, flat) as OperationalQuotationRecord) : flat,
      releaseLocal,
    )
    byId.set(id, merged as Record<string, unknown>)
  })

  Object.entries(releaseLocal).forEach(([id]) => {
    if (!id || byId.has(id)) return
    const localRow = localByIdEarly.get(id)
    if (localRow) {
      byId.set(id, stampInstallerReleaseFromMap(localRow as OperationalQuotationRecord, releaseLocal))
    }
  })

  const missingReleaseIds = Object.keys(releaseLocal)
    .filter((id) => id.trim() && !byId.has(id))
    .slice(0, 24)
  await Promise.all(
    missingReleaseIds.map(async (id) => {
      try {
        const detail = await getById(id)
        const payload =
          (detail as Record<string, unknown>)?.quotation ??
          (detail as Record<string, unknown>)?.data ??
          detail
        const flat = flattenQuotationListRow(payload)
        if (!String(flat.id || "").trim()) return
        byId.set(id, stampInstallerReleaseFromMap(flat, releaseLocal) as Record<string, unknown>)
      } catch {
        // Row stays missing until backend persists release flags
      }
    }),
  )

  const scheduledLocal = readInstallationScheduledMap()
  const teamAssignLocal = readTeamAssignments()

  let rows = Array.from(byId.values())
    .map((q) => {
      const localRow = localByIdEarly.get(String(q.id || ""))
      const withRelease = mergeInstallerReleaseOntoQuotation(
        q as OperationalQuotationRecord,
        releaseLocal,
        (localRow as OperationalQuotationRecord | undefined) ?? null,
      )
      return {
        ...withRelease,
        installationScheduledAt:
          withRelease.installationScheduledAt ||
          (withRelease as Record<string, unknown>).installation_scheduled_at ||
          scheduledLocal[String(q.id || "")],
        installationTeamId:
          withRelease.installationTeamId ||
          (withRelease as Record<string, unknown>).installation_team_id ||
          teamAssignLocal[String(q.id || "")],
      } as Record<string, unknown>
    })
    .filter((q) => shouldShowInAdminInstallationTab(q as OperationalQuotationRecord, releaseLocal))

  if (options.filterTeamId) {
    const want = String(options.filterTeamId).trim()
    rows = rows.filter((q) => {
      const got = String(getInstallationTeamIdForQuotation(String(q.id || ""), q) || "").trim()
      return got === want
    })
  }

  return {
    rows,
    installerQueueApprovedIds: installerQueueApprovedIdSet,
    releaseMap: releaseLocal,
  }
}
