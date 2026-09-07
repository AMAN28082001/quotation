"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CalendarDays, CheckCircle2, ClipboardList, FileCheck, Search, Wallet, Wrench } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { api, ApiError } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatPersonName } from "@/lib/name-display"
import { formatQuotationVisitLocation } from "@/lib/format-customer-address"
import { keepCurrentQuotationsOnly } from "@/lib/quotation-current"
import {
  extractQuotationListFromApiResponse,
  getInstallationWorkflowStatus,
  getMeteringWorkflowStage,
  isInstallationPartialApproved,
  isInstallationUploadCompleteByStatus,
  mergeAdminMeteringHandoffOntoQuotation,
  readAdminMeteringHandoffMap,
  readInstallerReleaseMap,
  shouldShowInAdminInstallationTab,
  syncAdminMeteringHandoffMapFromRows,
} from "@/lib/operational-install-queue"
import { isInstallationUploadCompleteWithMedia } from "@/lib/installation-public-images"
import { StoredMediaPreview } from "@/components/stored-media-preview"
import { useAuth } from "@/lib/auth-context"
import {
  filterQuotationsByWorkflowPermission,
  shouldLoadAllWorkflowQuotations,
} from "@/lib/module-field-permissions"
import {
  matchesMeteringOverdueFilter,
  meteringOverdueRowClasses,
  meteringOverdueTone,
  resolveMeteringReferenceYmd,
  type InstallOverdueFilter,
} from "@/lib/metering-overdue-ui"
import {
  parseMeterDocumentNameFromApiPayload,
  parseMeterDocumentUrlFromApiPayload,
  readQuotationMeterDocument,
  toMeterDocumentPublicViewUrl,
} from "@/lib/parse-api-media"

/** Meter process (left) + Bank process (right) tabs — same order as Admin Metering. */
export type MeteringStage =
  | "processing"
  | "approved"
  | "wcc"
  | "meter_install"
  | "mco"
  | "bank_process"
  | "pending_payment"

const METER_PROCESS_TABS: MeteringStage[] = ["processing", "approved", "wcc", "meter_install", "mco"]
const BANK_PROCESS_TABS: MeteringStage[] = ["bank_process", "pending_payment"]

const EMPTY_SEARCH_BY_TAB: Record<MeteringStage, string> = {
  processing: "",
  approved: "",
  wcc: "",
  meter_install: "",
  mco: "",
  bank_process: "",
  pending_payment: "",
}

type MeteringWorkflowItem = {
  discomName?: string
  meterType?: "solar" | "net" | "both"
  meterNo?: string
  solarMeterNo?: string
  netMeterNo?: string
  remarks?: string
  authorizedRepresentative?: string
  meterDocumentName?: string
  meterDocumentUrl?: string
  workCompleteReportImageName?: string
  workCompleteReportImageUrl?: string
  meterInstalledPhotoName?: string
  meterInstalledPhotoUrl?: string
  completeDcrReportImageName?: string
  completeDcrReportImageUrl?: string
}

type MeteringQuotation = {
  id: string
  status?: string
  customer?: {
    firstName?: string
    lastName?: string
    mobile?: string
    address?: string | Record<string, unknown>
    location?: string
  }
  dealer?: { firstName?: string; lastName?: string; mobile?: string; phone?: string }
  visitLocation?: string
  location?: string
  locationLink?: string
  createdAt?: string
  installationStatus?: string
  installation_status?: string
  pricing?: { subtotal?: number; totalAmount?: number; finalAmount?: number }
  subtotal?: number
  totalAmount?: number
  finalAmount?: number
  meteringStage?: string
  metering_status?: string
  mcoStatus?: string
  mco_status?: string
  meteringApprovedAt?: string
  metering_approved_at?: string
  mcoAt?: string
  mco_at?: string
  discomName?: string
  meterType?: "solar" | "net" | "both"
  meterNo?: string
  solarMeterNo?: string
  netMeterNo?: string
  remarks?: string
  authorizedRepresentative?: string
  authorized_representative?: string
  meterDocumentUrl?: string
  meter_document_url?: string
  workCompleteReportImageUrl?: string
  work_complete_report_image_url?: string
  workCompleteReportImageName?: string
  work_complete_report_image_name?: string
  meterInstalledPhotoUrl?: string
  meter_installed_photo_url?: string
  meterInstalledPhotoName?: string
  meter_installed_photo_name?: string
  completeDcrReportImageUrl?: string
  complete_dcr_report_image_url?: string
  completeDcrReportImageName?: string
  complete_dcr_report_image_name?: string
  phase?: string
  products?: { phase?: string }
  meteringWccAfterDiscom?: boolean
  metering_wcc_after_discom?: boolean
  bankProcessDone?: boolean
  bank_process_done?: boolean
  paymentType?: string
  payment_type?: string
  paymentMode?: string
  payment_mode?: string
}

type MeteringModalDraft = {
  discomName: string
  meterType: "" | "solar" | "net" | "both"
  meterNo: string
  solarMeterNo: string
  netMeterNo: string
  remarks: string
  authorizedRepresentative: string
}

const quotationFromApiRecord = (raw: unknown): MeteringQuotation => {
  if (!raw || typeof raw !== "object") return raw as MeteringQuotation
  const r = raw as Record<string, any>
  const nested = r.quotation
  const flat =
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? ({ ...(nested as Record<string, any>), ...r } as Record<string, any>)
      : { ...r }
  return flat as MeteringQuotation
}

const dedupeByQuotationId = (rows: MeteringQuotation[]) => {
  const map = new Map<string, MeteringQuotation>()
  rows.forEach((row) => {
    if (!row?.id) return
    if (!map.has(row.id)) map.set(row.id, row)
  })
  return Array.from(map.values())
}

function stageFromBackend(q: MeteringQuotation): Exclude<MeteringStage, "wcc" | "bank_process" | "pending_payment"> | null {
  const stage = getMeteringWorkflowStage(q as Record<string, unknown>)
  if (stage === "processing" || stage === "approved" || stage === "meter_install" || stage === "mco") {
    return stage
  }
  return null
}

function hasMeteringWccPack(q: MeteringQuotation): boolean {
  const r = q as Record<string, unknown>
  const discom = String(r.discomName || r.discom_name || "").trim()
  const assigned = String(
    r.authorizedRepresentative ||
      r.authorized_representative ||
      r.assignedPersonName ||
      r.assigned_person_name ||
      "",
  ).trim()
  return Boolean(discom && assigned)
}

function isWccAfterDiscomFlag(q: MeteringQuotation): boolean {
  const r = q as Record<string, unknown>
  const v = r.meteringWccAfterDiscom ?? r.metering_wcc_after_discom
  return v === true || v === 1 || String(v).toLowerCase() === "true"
}

/** Same visibility rule as Admin → Metering (`isMeteringVisible`). */
function isMeteringVisibleRow(q: MeteringQuotation, isWccPending: (row: MeteringQuotation) => boolean): boolean {
  return stageFromBackend(q) !== null || isWccPending(q)
}

function getPaymentTypeRaw(q: MeteringQuotation): string {
  const r = q as Record<string, unknown>
  return String(r.paymentType || r.payment_type || r.paymentMode || r.payment_mode || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
}

function isBankProcessEligible(q: MeteringQuotation): boolean {
  const t = getPaymentTypeRaw(q)
  return t === "loan" || t === "mix" || t === "cash_loan" || t === "cash+loan" || t.includes("loan")
}

function isBankProcessDone(q: MeteringQuotation): boolean {
  const r = q as Record<string, unknown>
  return Boolean(r.bankProcessDone || r.bank_process_done)
}

export type MeteringWorkflowPanelProps = {
  /** Intro line under the heading. Pass null to hide it. */
  description?: string | null
  /** Set false when the host page already renders its own heading/intro. */
  showDescription?: boolean
  /** Read-only mode hides every stage-transition and save action. */
  readOnly?: boolean
}

/**
 * Metering workflow (Meter Pending → Meter in Discom → MCO) with Metering Details
 * and MCO document uploads. Shared by the metering-role dashboard and the
 * installer dashboard so both stay in sync with the same backend APIs.
 */
export function MeteringWorkflowPanel({
  description,
  showDescription = true,
  readOnly = false,
}: MeteringWorkflowPanelProps) {
  const { toast } = useToast()
  const { modulePermissions, officeLocation, role, dealer, accountManager, meteringUser, installer } = useAuth()
  const sessionUserId = meteringUser?.id ?? accountManager?.id ?? dealer?.id ?? installer?.id
  const permissionCtx = useMemo(
    () => ({
      userId: sessionUserId,
      officeLocation,
      viewerIsDealer: role === "dealer",
      viewerIsAdmin: role === "admin" || role === "super-admin",
    }),
    [sessionUserId, officeLocation, role],
  )
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<MeteringStage>("processing")
  const [searchByTab, setSearchByTab] = useState<Record<MeteringStage, string>>(EMPTY_SEARCH_BY_TAB)
  const [quotations, setQuotations] = useState<MeteringQuotation[]>([])
  const [workflowMap, setWorkflowMap] = useState<Record<string, MeteringWorkflowItem>>({})
  const [meterDocumentByQuotation, setMeterDocumentByQuotation] = useState<Record<string, File | null>>({})
  const [meterDocumentPreviewByQuotation, setMeterDocumentPreviewByQuotation] = useState<Record<string, string>>({})
  const [detailsModalOpen, setDetailsModalOpen] = useState(false)
  const [detailsQuotationId, setDetailsQuotationId] = useState<string | null>(null)
  const [detailsDraft, setDetailsDraft] = useState<MeteringModalDraft>({
    discomName: "",
    meterType: "",
    meterNo: "",
    solarMeterNo: "",
    netMeterNo: "",
    remarks: "",
    authorizedRepresentative: "",
  })
  const [savingDetails, setSavingDetails] = useState(false)
  const [mcoDocsModalOpen, setMcoDocsModalOpen] = useState(false)
  const [mcoDocsQuotationId, setMcoDocsQuotationId] = useState<string | null>(null)
  const [savingMcoDocs, setSavingMcoDocs] = useState(false)
  const [workCompleteReportByQuotation, setWorkCompleteReportByQuotation] = useState<Record<string, File | null>>({})
  const [meterInstalledPhotoByQuotation, setMeterInstalledPhotoByQuotation] = useState<Record<string, File | null>>({})
  const [completeDcrReportByQuotation, setCompleteDcrReportByQuotation] = useState<Record<string, File | null>>({})
  const [mcoPreviewByQuotation, setMcoPreviewByQuotation] = useState<
    Record<
      string,
      {
        workCompleteReportImage?: string
        meterInstalledPhoto?: string
        completeDcrReportImage?: string
      }
    >
  >({})
  const [filterMeterOverdue, setFilterMeterOverdue] = useState<InstallOverdueFilter>("all")
  const useApi = process.env.NEXT_PUBLIC_USE_API !== "false"

  useEffect(() => {
    return () => {
      Object.values(meterDocumentPreviewByQuotation).forEach((url) => {
        try {
          URL.revokeObjectURL(url)
        } catch {}
      })
      Object.values(mcoPreviewByQuotation).forEach((preview) => {
        ;[preview.workCompleteReportImage, preview.meterInstalledPhoto, preview.completeDcrReportImage].forEach(
          (url) => {
            if (!url || !url.startsWith("blob:")) return
            try {
              URL.revokeObjectURL(url)
            } catch {}
          },
        )
      })
    }
  }, [meterDocumentPreviewByQuotation, mcoPreviewByQuotation])

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        if (useApi) {
          const safeList = async (run: () => Promise<any>) => {
            try {
              return extractQuotationListFromApiResponse(await run())
            } catch {
              return [] as any[]
            }
          }

          const loadAllMetering = shouldLoadAllWorkflowQuotations(
            modulePermissions,
            "metering",
            permissionCtx,
          )

          const installerQueueQuiet = { suppressErrorLog: true as const }

          // Same sources Admin uses for Metering: full list + metering queue statuses.
          // Do NOT dump all approved quotations — that inflated Meter Pending.
          const queueStatuses = [
            "pending_metering",
            "metering_in_progress",
            "metering_approved",
            "meter_installation_pending",
            "mco",
          ] as const
          const queueRows: any[] = []
          for (const status of queueStatuses) {
            queueRows.push(
              ...(await safeList(() =>
                api.installer.getQueue({ status, page: 1, limit: 1000 }, installerQueueQuiet),
              )),
            )
          }

          const broadQueueRows = await safeList(() =>
            api.installer.getQueue({ page: 1, limit: 1000 }, installerQueueQuiet),
          )

          const adminRows = loadAllMetering
            ? await safeList(() => api.quotations.getWorkflowDashboardList({ page: 1, limit: 1000 }))
            : await safeList(() =>
                api.quotations.getAll({ status: "approved", page: 1, limit: 1000 }, { suppressErrorLog: true }),
              )

          const handoffMap = readAdminMeteringHandoffMap()
          const normalized = dedupeByQuotationId(
            [...adminRows, ...queueRows, ...broadQueueRows].map((raw) => {
              const flat = quotationFromApiRecord(raw)
              return mergeAdminMeteringHandoffOntoQuotation(
                flat as Record<string, unknown>,
                handoffMap,
              ) as MeteringQuotation
            }),
          )
          syncAdminMeteringHandoffMapFromRows(normalized as Record<string, unknown>[])

          // Match Admin → Metering: only pipeline stages + WCC Pending entry rows.
          const releaseMap = readInstallerReleaseMap()
          const isWccPendingForLoad = (q: MeteringQuotation) => {
            const stage = stageFromBackend(q)
            if (isWccAfterDiscomFlag(q)) {
              const uploadDone =
                isInstallationUploadCompleteByStatus(q as any) ||
                isInstallationUploadCompleteWithMedia(q as any)
              if (!uploadDone) return false
              return stage !== "meter_install" && stage !== "mco"
            }
            if (stage === "processing") return false
            if (stage !== null) return false
            if (isInstallationPartialApproved(q as any)) return false
            if (!shouldShowInAdminInstallationTab(q as any, releaseMap)) return false
            const uploadDone =
              isInstallationUploadCompleteByStatus(q as any) ||
              isInstallationUploadCompleteWithMedia(q as any) ||
              Boolean((q as any).installerApprovedAt || (q as any).installer_approved_at)
            if (!uploadDone) return false
            if (hasMeteringWccPack(q)) return false
            return true
          }

          const meteringOnly = normalized.filter((q) => isMeteringVisibleRow(q, isWccPendingForLoad))
          setQuotations(meteringOnly)
        } else {
          setQuotations([])
        }
      } catch {
        toast({
          title: "Failed to load quotations",
          description: "Could not load quotations for the metering queue.",
          variant: "destructive",
        })
        setQuotations([])
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [toast, useApi, modulePermissions, permissionCtx])

  const getMeteringStage = (
    q: MeteringQuotation,
  ): Exclude<MeteringStage, "wcc" | "bank_process" | "pending_payment"> | null => {
    // Same as Admin getAdminMeteringStage — never invent "processing" for non-metering rows.
    return stageFromBackend(q)
  }

  const isInMeterPipeline = (q: MeteringQuotation) => getMeteringStage(q) !== null || isWccAfterDiscomFlag(q)

  const isWccPending = (q: MeteringQuotation) => {
    const stage = getMeteringStage(q)
    // Post Meter in Discom → WCC (same as Admin)
    if (isWccAfterDiscomFlag(q)) {
      const uploadDone =
        isInstallationUploadCompleteByStatus(q as any) ||
        isInstallationUploadCompleteWithMedia(q as any)
      if (!uploadDone) return false
      return stage !== "meter_install" && stage !== "mco"
    }
    // Send to Metering with no Discom/WCC action yet → Meter Pending only
    if (stage === "processing") return false
    // Entry: Installation approved, not yet in metering pipeline (Admin WCC Pending entry)
    if (stage !== null) return false
    if (isInstallationPartialApproved(q as any)) return false
    if (!shouldShowInAdminInstallationTab(q as any, readInstallerReleaseMap())) return false
    const uploadDone =
      isInstallationUploadCompleteByStatus(q as any) ||
      isInstallationUploadCompleteWithMedia(q as any) ||
      Boolean((q as any).installerApprovedAt || (q as any).installer_approved_at)
    if (!uploadDone) return false
    if (hasMeteringWccPack(q)) return false
    return true
  }

  const applyLocalMeteringStage = (id: string, stage: Exclude<MeteringStage, "wcc" | "bank_process" | "pending_payment">) => {
    const now = new Date().toISOString()
    setQuotations((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q
        if (stage === "mco") {
          return {
            ...q,
            installationStatus: "mco",
            installation_status: "mco",
            meteringStatus: "mco",
            metering_status: "mco",
            meteringWccAfterDiscom: false,
            metering_wcc_after_discom: false,
            mcoAt: now,
            mco_at: now,
            meteringApprovedAt: q.meteringApprovedAt || q.metering_approved_at || now,
            metering_approved_at: q.metering_approved_at || q.meteringApprovedAt || now,
          }
        }
        if (stage === "meter_install") {
          return {
            ...q,
            installationStatus: "meter_installation_pending",
            installation_status: "meter_installation_pending",
            meteringStatus: "meter_installation_pending",
            metering_status: "meter_installation_pending",
            meteringWccAfterDiscom: false,
            metering_wcc_after_discom: false,
          }
        }
        if (stage === "approved") {
          return {
            ...q,
            installationStatus: "metering_approved",
            installation_status: "metering_approved",
            meteringStatus: "metering_approved",
            metering_status: "metering_approved",
            meteringApprovedAt: now,
            metering_approved_at: now,
          }
        }
        return {
          ...q,
          installationStatus: "pending_metering",
          installation_status: "pending_metering",
          meteringStatus: "pending_metering",
          metering_status: "pending_metering",
        }
      }),
    )
  }

  const moveToWccPending = async (id: string) => {
    if (!confirmSave("Move this file to WCC Pending and save?")) return
    try {
      await api.admin.quotations.setMeteringWccAfterDiscom(id, true)
    } catch {
      // keep local flag even if backend route is missing
    }
    setQuotations((prev) =>
      prev.map((q) =>
        q.id === id
          ? { ...q, meteringWccAfterDiscom: true, metering_wcc_after_discom: true }
          : q,
      ),
    )
    setActiveTab("wcc")
    toast({
      title: "Moved to WCC Pending",
      description: "Complete WCC, then move to Meter Installation Pending.",
    })
  }

  const markBankProcessDone = (id: string) => {
    if (!confirmSave("Mark bank process done and save?")) return
    setQuotations((prev) =>
      prev.map((q) =>
        q.id === id ? { ...q, bankProcessDone: true, bank_process_done: true } : q,
      ),
    )
    setActiveTab("pending_payment")
    toast({
      title: "Moved to Pending Payment",
      description: "Bank process marked done for this quotation.",
    })
  }

  const setStage = async (
    id: string,
    stage: Exclude<MeteringStage, "wcc" | "bank_process" | "pending_payment">,
  ) => {
    if (!useApi) return
    if (!confirmSave(`Move this file to the next stage (${stage.replaceAll("_", " ")}) and save?`)) return

    if (stage === "mco") {
      applyLocalMeteringStage(id, "mco")
      setActiveTab("mco")
      let persisted = false
      try {
        persisted = await api.admin.quotations.forceAdvanceToMco(id)
      } catch {
        // keep local MCO placement
      }
      toast({
        title: "Moved to Final Step",
        description: persisted ? "Quotation is in Final Step." : "Shown in Final Step. Server sync pending.",
      })
      return
    }

    if (stage === "meter_install") {
      applyLocalMeteringStage(id, "meter_install")
      setActiveTab("meter_install")
      try {
        await api.admin.quotations.updateOperationalStatus(id, "meter_installation_pending")
      } catch {
        // local placement is enough if route missing
      }
      toast({
        title: "Moved to Meter Installation Pending",
        description: "Quotation is in Meter Installation Pending.",
      })
      return
    }

    const action = stage === "approved" ? "approve" : "move_back"
    try {
      let response: any
      try {
        response = await api.metering.updateStatus(id, action)
      } catch (error) {
        if (
          stage === "approved" &&
          error instanceof ApiError &&
          (error.code === "WF_003" || error.code === "HTTP_409")
        ) {
          try {
            await api.metering.updateStatus(id, "start")
            response = await api.metering.updateStatus(id, "approve")
          } catch {
            response = await api.metering.forceSetStatus(id, "metering_approved")
          }
        } else {
          throw error
        }
      }
      const saved = response?.data || response || {}
      setQuotations((prev) =>
        prev.map((q) =>
          q.id === id
            ? {
                ...q,
                installationStatus:
                  saved.installationStatus ||
                  saved.installation_status ||
                  (stage === "approved" ? "metering_approved" : "pending_metering"),
                installation_status:
                  saved.installation_status ||
                  saved.installationStatus ||
                  (stage === "approved" ? "metering_approved" : "pending_metering"),
                meteringApprovedAt:
                  saved.meteringApprovedAt ||
                  saved.metering_approved_at ||
                  (stage === "approved" ? new Date().toISOString() : q.meteringApprovedAt),
                metering_approved_at:
                  saved.metering_approved_at ||
                  saved.meteringApprovedAt ||
                  (stage === "approved" ? new Date().toISOString() : q.metering_approved_at),
              }
            : q,
        ),
      )
    } catch (error) {
      toast({
        title: "Status update failed",
        description:
          error instanceof ApiError && error.code === "WF_003"
            ? "Backend blocked direct approve for current stage. Please ensure workflow reaches metering stage, or enable start->approve transition."
            : error instanceof Error
              ? error.message
              : "Could not update status in backend.",
        variant: "destructive",
      })
      return
    }
    toast({
      title: "Stage updated",
      description: `Quotation moved to ${stage}.`,
    })
  }

  const updateWorkflowMeta = (id: string, patch: Partial<MeteringWorkflowItem>) => {
    setWorkflowMap((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        ...patch,
      },
    }))
  }

  const openDetailsModal = (quotationId: string) => {
    const saved = workflowMap[quotationId]
    const row = quotations.find((q) => q.id === quotationId) as any
    setDetailsQuotationId(quotationId)
    setDetailsDraft({
      // Prefer backend values so reopening always reflects persisted data.
      discomName: row?.discomName || row?.discom_name || saved?.discomName || "",
      meterType: row?.meterType || row?.meter_type || saved?.meterType || "",
      meterNo: row?.meterNo || row?.meter_no || saved?.meterNo || "",
      solarMeterNo: row?.solarMeterNo || row?.solar_meter_no || saved?.solarMeterNo || "",
      netMeterNo: row?.netMeterNo || row?.net_meter_no || saved?.netMeterNo || "",
      remarks: row?.remarks || saved?.remarks || "",
      authorizedRepresentative:
        row?.authorizedRepresentative || row?.authorized_representative || saved?.authorizedRepresentative || "",
    })
    if (!saved?.meterDocumentName || !saved?.meterDocumentUrl) {
      updateWorkflowMeta(quotationId, {
        meterDocumentName: saved?.meterDocumentName || row?.meterDocumentName || row?.meter_document_name || "",
        meterDocumentUrl: saved?.meterDocumentUrl || row?.meterDocumentUrl || row?.meter_document_url || "",
      })
    }
    setDetailsModalOpen(true)
  }

  const saveMeteringDetails = async () => {
    if (!detailsQuotationId) return
    if (!confirmSave("Save metering details?")) return

    const patch: Partial<MeteringWorkflowItem> = {
      discomName: detailsDraft.discomName.trim(),
      meterType: detailsDraft.meterType || undefined,
      meterNo: detailsDraft.meterNo.trim(),
      solarMeterNo: detailsDraft.solarMeterNo.trim(),
      netMeterNo: detailsDraft.netMeterNo.trim(),
      remarks: detailsDraft.remarks.trim(),
      authorizedRepresentative: detailsDraft.authorizedRepresentative.trim(),
    }

    updateWorkflowMeta(detailsQuotationId, patch)

    if (!useApi) return

    try {
      setSavingDetails(true)
      const response: any = await api.metering.saveDetails(
        detailsQuotationId,
        {
          discomName: patch.discomName,
          meterType: patch.meterType,
          meterNo: patch.meterNo,
          solarMeterNo: patch.solarMeterNo,
          netMeterNo: patch.netMeterNo,
          remarks: patch.remarks,
          authorizedRepresentative: patch.authorizedRepresentative,
        },
        meterDocumentByQuotation[detailsQuotationId] || null,
      )
      let meterDocumentUrl =
        toMeterDocumentPublicViewUrl(parseMeterDocumentUrlFromApiPayload(response)) ||
        parseMeterDocumentUrlFromApiPayload(response)
      const meterDocumentName =
        parseMeterDocumentNameFromApiPayload(response) ||
        workflowMap[detailsQuotationId]?.meterDocumentName ||
        meterDocumentByQuotation[detailsQuotationId]?.name

      if (meterDocumentUrl) {
        try {
          const { resolvePublicOpenMediaUrl } = await import("@/lib/resolve-public-media-url")
          const opened = await resolvePublicOpenMediaUrl(meterDocumentUrl, detailsQuotationId)
          if (opened) meterDocumentUrl = toMeterDocumentPublicViewUrl(opened) || opened
        } catch {
          // keep parsed url
        }
      }

      if (meterDocumentUrl || meterDocumentName) {
        updateWorkflowMeta(detailsQuotationId, {
          meterDocumentUrl: meterDocumentUrl || undefined,
          meterDocumentName: meterDocumentName || undefined,
        })
      }
      // Keep modal state aligned with persisted backend data (public URL), not stale local blob.
      if (meterDocumentUrl) {
        setMeterDocumentByQuotation((prev) => ({
          ...prev,
          [detailsQuotationId]: null,
        }))
        setMeterDocumentPreviewByQuotation((prev) => ({
          ...prev,
          [detailsQuotationId]: meterDocumentUrl,
        }))
      }
      setQuotations((prev) =>
        prev.map((q) =>
          q.id === detailsQuotationId
            ? {
                ...q,
                discomName: patch.discomName || q.discomName,
                meterType: patch.meterType || q.meterType,
                meterNo: patch.meterNo || q.meterNo,
                solarMeterNo: patch.solarMeterNo || q.solarMeterNo,
                netMeterNo: patch.netMeterNo || q.netMeterNo,
                remarks: patch.remarks ?? q.remarks,
                authorizedRepresentative: patch.authorizedRepresentative || q.authorizedRepresentative,
                authorized_representative: patch.authorizedRepresentative || q.authorized_representative,
                meterDocumentUrl: meterDocumentUrl || q.meterDocumentUrl,
                meter_document_url: meterDocumentUrl || q.meter_document_url,
                meterDocumentPublicUrl: meterDocumentUrl || q.meterDocumentPublicUrl,
                meter_document_public_url: meterDocumentUrl || q.meter_document_public_url,
                meterDocumentName: meterDocumentName || q.meterDocumentName,
                meter_document_name: meterDocumentName || q.meter_document_name,
              }
            : q,
        ),
      )
      toast({
        title: "Saved",
        description: meterDocumentUrl
          ? "Metering details saved. Document public link is ready to view."
          : "Metering details saved to backend.",
      })
      setDetailsModalOpen(false)
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save metering details to backend.",
        variant: "destructive",
      })
    } finally {
      setSavingDetails(false)
    }
  }

  const hasRequiredMeteringDetails = (quotationId: string) => {
    const details = workflowMap[quotationId]
    const q = quotations.find((row) => row.id === quotationId) as any
    if (!details && !q) return false

    const discomOk = (details?.discomName || q?.discomName || "").trim().length > 0
    const meterType = (details?.meterType || q?.meterType || q?.meter_type) as MeteringWorkflowItem["meterType"]
    const meterTypeOk = meterType === "solar" || meterType === "net" || meterType === "both"
    const meterNoOk =
      meterType === "both"
        ? (details?.solarMeterNo || q?.solarMeterNo || q?.solar_meter_no || "").trim().length > 0 &&
          (details?.netMeterNo || q?.netMeterNo || q?.net_meter_no || "").trim().length > 0
        : (details?.meterNo || q?.meterNo || q?.meter_no || "").trim().length > 0
    const meterDocOk =
      !!meterDocumentByQuotation[quotationId] ||
      (details?.meterDocumentName || "").trim().length > 0 ||
      (details?.meterDocumentUrl || "").trim().length > 0 ||
      (q?.meterDocumentUrl || q?.meter_document_url || "").trim().length > 0

    return discomOk && meterTypeOk && meterNoOk && meterDocOk
  }

  const hasRequiredMcoDocuments = (quotationId: string) => {
    const details = workflowMap[quotationId]
    const q = quotations.find((row) => row.id === quotationId) as any
    return (
      (!!workCompleteReportByQuotation[quotationId] ||
        !!details?.workCompleteReportImageUrl ||
        !!q?.workCompleteReportImageUrl ||
        !!q?.work_complete_report_image_url) &&
      (!!meterInstalledPhotoByQuotation[quotationId] ||
        !!details?.meterInstalledPhotoUrl ||
        !!q?.meterInstalledPhotoUrl ||
        !!q?.meter_installed_photo_url) &&
      (!!completeDcrReportByQuotation[quotationId] ||
        !!details?.completeDcrReportImageUrl ||
        !!q?.completeDcrReportImageUrl ||
        !!q?.complete_dcr_report_image_url)
    )
  }

  const openMcoDocsModal = (quotationId: string) => {
    const row = quotations.find((q) => q.id === quotationId) as any
    setMcoDocsQuotationId(quotationId)
    updateWorkflowMeta(quotationId, {
      workCompleteReportImageName:
        row?.workCompleteReportImageName ||
        row?.work_complete_report_image_name ||
        workflowMap[quotationId]?.workCompleteReportImageName,
      workCompleteReportImageUrl:
        row?.workCompleteReportImageUrl ||
        row?.work_complete_report_image_url ||
        workflowMap[quotationId]?.workCompleteReportImageUrl,
      meterInstalledPhotoName:
        row?.meterInstalledPhotoName ||
        row?.meter_installed_photo_name ||
        workflowMap[quotationId]?.meterInstalledPhotoName,
      meterInstalledPhotoUrl:
        row?.meterInstalledPhotoUrl ||
        row?.meter_installed_photo_url ||
        workflowMap[quotationId]?.meterInstalledPhotoUrl,
      completeDcrReportImageName:
        row?.completeDcrReportImageName ||
        row?.complete_dcr_report_image_name ||
        workflowMap[quotationId]?.completeDcrReportImageName,
      completeDcrReportImageUrl:
        row?.completeDcrReportImageUrl ||
        row?.complete_dcr_report_image_url ||
        workflowMap[quotationId]?.completeDcrReportImageUrl,
    })
    setMcoDocsModalOpen(true)
  }

  const saveMcoDocuments = async () => {
    if (!mcoDocsQuotationId) return
    const workFile = workCompleteReportByQuotation[mcoDocsQuotationId] || null
    const meterFile = meterInstalledPhotoByQuotation[mcoDocsQuotationId] || null
    const dcrFile = completeDcrReportByQuotation[mcoDocsQuotationId] || null

    if (!workFile && !meterFile && !dcrFile) {
      toast({
        title: "Upload required",
        description: "Please upload at least one MCO document to save changes.",
        variant: "destructive",
      })
      return
    }
    if (!confirmSave("Save MCO documents?")) return

    try {
      setSavingMcoDocs(true)
      const response: any = await api.metering.uploadMcoDocuments(mcoDocsQuotationId, {
        workCompleteReportImage: workFile,
        meterInstalledPhoto: meterFile,
        completeDcrReportImage: dcrFile,
      })
      const saved = response?.data || response || {}
      const workUrl = saved.workCompleteReportImageUrl || saved.work_complete_report_image_url
      const workName =
        saved.workCompleteReportImageName ||
        saved.work_complete_report_image_name ||
        workFile?.name ||
        workflowMap[mcoDocsQuotationId]?.workCompleteReportImageName
      const meterUrl = saved.meterInstalledPhotoUrl || saved.meter_installed_photo_url
      const meterName =
        saved.meterInstalledPhotoName ||
        saved.meter_installed_photo_name ||
        meterFile?.name ||
        workflowMap[mcoDocsQuotationId]?.meterInstalledPhotoName
      const dcrUrl = saved.completeDcrReportImageUrl || saved.complete_dcr_report_image_url
      const dcrName =
        saved.completeDcrReportImageName ||
        saved.complete_dcr_report_image_name ||
        dcrFile?.name ||
        workflowMap[mcoDocsQuotationId]?.completeDcrReportImageName

      updateWorkflowMeta(mcoDocsQuotationId, {
        workCompleteReportImageUrl: workUrl || workflowMap[mcoDocsQuotationId]?.workCompleteReportImageUrl,
        workCompleteReportImageName: workName,
        meterInstalledPhotoUrl: meterUrl || workflowMap[mcoDocsQuotationId]?.meterInstalledPhotoUrl,
        meterInstalledPhotoName: meterName,
        completeDcrReportImageUrl: dcrUrl || workflowMap[mcoDocsQuotationId]?.completeDcrReportImageUrl,
        completeDcrReportImageName: dcrName,
      })

      setMcoPreviewByQuotation((prev) => ({
        ...prev,
        [mcoDocsQuotationId]: {
          workCompleteReportImage: workUrl || prev[mcoDocsQuotationId]?.workCompleteReportImage,
          meterInstalledPhoto: meterUrl || prev[mcoDocsQuotationId]?.meterInstalledPhoto,
          completeDcrReportImage: dcrUrl || prev[mcoDocsQuotationId]?.completeDcrReportImage,
        },
      }))

      setQuotations((prev) =>
        prev.map((q) =>
          q.id === mcoDocsQuotationId
            ? {
                ...q,
                workCompleteReportImageUrl: workUrl || (q as any).workCompleteReportImageUrl,
                work_complete_report_image_url: workUrl || (q as any).work_complete_report_image_url,
                meterInstalledPhotoUrl: meterUrl || (q as any).meterInstalledPhotoUrl,
                meter_installed_photo_url: meterUrl || (q as any).meter_installed_photo_url,
                completeDcrReportImageUrl: dcrUrl || (q as any).completeDcrReportImageUrl,
                complete_dcr_report_image_url: dcrUrl || (q as any).complete_dcr_report_image_url,
              }
            : q,
        ),
      )

      setWorkCompleteReportByQuotation((prev) => ({ ...prev, [mcoDocsQuotationId]: null }))
      setMeterInstalledPhotoByQuotation((prev) => ({ ...prev, [mcoDocsQuotationId]: null }))
      setCompleteDcrReportByQuotation((prev) => ({ ...prev, [mcoDocsQuotationId]: null }))

      toast({ title: "Saved", description: "MCO documents saved to backend." })
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save MCO documents.",
        variant: "destructive",
      })
    } finally {
      setSavingMcoDocs(false)
    }
  }

  const moveToBaldevConfirmation = async (quotationId: string) => {
    if (!hasRequiredMeteringDetails(quotationId) || !hasRequiredMcoDocuments(quotationId)) {
      toast({
        title: "Required uploads missing",
        description:
          "Complete Metering Details and upload Work Complete Report, Meter Installed Photo, and Complete DCR Report before moving to Baldev confirmation.",
        variant: "destructive",
      })
      return
    }
    if (!confirmSave("Move to Baldev / final confirmation and save?")) return
    try {
      await api.metering.updateStatus(quotationId, "mark_completed")
      setQuotations((prev) =>
        prev.map((q) =>
          q.id === quotationId
            ? {
                ...q,
                installationStatus: "pending_baldev",
                installation_status: "pending_baldev",
              }
            : q,
        ),
      )
      toast({
        title: "Moved to Confirmation",
        description: "Quotation moved to Baldev confirmation queue.",
      })
    } catch (error) {
      toast({
        title: "Move failed",
        description:
          error instanceof Error ? error.message : "Could not move quotation to Baldev confirmation.",
        variant: "destructive",
      })
    }
  }

  const getAdminApprovedDate = (q: MeteringQuotation) =>
    (q as any).approvedAt || (q as any).approvedDate || (q as any).statusUpdatedAt || q.createdAt

  const getDisplayedApprovedDate = (q: MeteringQuotation, tab: MeteringStage) =>
    tab === "approved" || tab === "wcc" || tab === "meter_install"
      ? (q as any).meteringApprovedAt || (q as any).metering_approved_at || getAdminApprovedDate(q)
      : tab === "mco"
        ? (q as any).mcoAt ||
          (q as any).mco_at ||
          (q as any).meteringApprovedAt ||
          (q as any).metering_approved_at ||
          getAdminApprovedDate(q)
        : getAdminApprovedDate(q)

  const getPhaseLabel = (q: MeteringQuotation) => {
    const raw = String(q.phase || q.products?.phase || (q as any).systemPhase || "")
      .toLowerCase()
      .trim()
    if (!raw) return "N/A"
    if (raw.includes("3") || raw.includes("three")) return "Three Phase"
    if (raw.includes("1") || raw.includes("single")) return "Single Phase"
    return raw
  }

  const toTimestamp = (date?: string) => {
    if (!date) return 0
    const parsed = new Date(date).getTime()
    return Number.isNaN(parsed) ? 0 : parsed
  }

  const filterSearch = (list: MeteringQuotation[], search: string) =>
    list.filter((q) => {
      const normalizedSearch = search.trim().toLowerCase()
      if (!normalizedSearch) return true
      const fullName = formatPersonName(q.customer?.firstName, q.customer?.lastName, "").toLowerCase()
      return (
        fullName.includes(normalizedSearch) ||
        (q.customer?.mobile || "").includes(normalizedSearch) ||
        q.id.toLowerCase().includes(normalizedSearch)
      )
    })

  const visibleQuotations = useMemo(
    () =>
      filterQuotationsByWorkflowPermission(
        quotations as Record<string, unknown>[],
        modulePermissions,
        "metering",
        permissionCtx,
      ) as MeteringQuotation[],
    [quotations, modulePermissions, permissionCtx],
  )

  /** One row per customer (current quotation) — same as dealer Quotations. */
  const onlyCurrent = (list: MeteringQuotation[]) => keepCurrentQuotationsOnly(list, visibleQuotations)

  const processingList = useMemo(
    () =>
      onlyCurrent(
        filterSearch(
          visibleQuotations.filter((q) => getMeteringStage(q) === "processing" && !isWccPending(q)),
          searchByTab.processing,
        ).sort((a, b) => toTimestamp(getAdminApprovedDate(a)) - toTimestamp(getAdminApprovedDate(b))),
      ),
    [visibleQuotations, searchByTab.processing],
  )

  const approvedList = useMemo(
    () =>
      onlyCurrent(
        filterSearch(
          visibleQuotations.filter((q) => getMeteringStage(q) === "approved" && !isWccAfterDiscomFlag(q)),
          searchByTab.approved,
        ).sort((a, b) => {
          const aDate = (a as any).meteringApprovedAt || (a as any).metering_approved_at || getAdminApprovedDate(a)
          const bDate = (b as any).meteringApprovedAt || (b as any).metering_approved_at || getAdminApprovedDate(b)
          return toTimestamp(bDate) - toTimestamp(aDate)
        }),
      ),
    [visibleQuotations, searchByTab.approved],
  )

  const wccList = useMemo(
    () =>
      onlyCurrent(
        filterSearch(
          visibleQuotations.filter((q) => isWccPending(q)),
          searchByTab.wcc,
        ).sort((a, b) => toTimestamp(getAdminApprovedDate(b)) - toTimestamp(getAdminApprovedDate(a))),
      ),
    [visibleQuotations, searchByTab.wcc],
  )

  const meterInstallList = useMemo(
    () =>
      onlyCurrent(
        filterSearch(
          visibleQuotations.filter((q) => getMeteringStage(q) === "meter_install"),
          searchByTab.meter_install,
        ).sort((a, b) => toTimestamp(getAdminApprovedDate(b)) - toTimestamp(getAdminApprovedDate(a))),
      ),
    [visibleQuotations, searchByTab.meter_install],
  )

  const mcoList = useMemo(
    () =>
      onlyCurrent(
        filterSearch(
          visibleQuotations.filter((q) => getMeteringStage(q) === "mco"),
          searchByTab.mco,
        ).sort((a, b) => {
          const aDate = (a as any).mcoAt || (a as any).mco_at || getAdminApprovedDate(a)
          const bDate = (b as any).mcoAt || (b as any).mco_at || getAdminApprovedDate(b)
          return toTimestamp(bDate) - toTimestamp(aDate)
        }),
      ),
    [visibleQuotations, searchByTab.mco],
  )

  // Bank process lists — UI commented out; keep logic for easy restore.
  const bankProcessList = useMemo(
    () =>
      onlyCurrent(
        filterSearch(
          visibleQuotations.filter((q) => isInMeterPipeline(q) && isBankProcessEligible(q) && !isBankProcessDone(q)),
          searchByTab.bank_process,
        ).sort((a, b) => toTimestamp(getAdminApprovedDate(b)) - toTimestamp(getAdminApprovedDate(a))),
      ),
    [visibleQuotations, searchByTab.bank_process],
  )

  const pendingPaymentList = useMemo(
    () =>
      onlyCurrent(
        filterSearch(
          visibleQuotations.filter((q) => isInMeterPipeline(q) && isBankProcessEligible(q) && isBankProcessDone(q)),
          searchByTab.pending_payment,
        ).sort((a, b) => toTimestamp(getAdminApprovedDate(b)) - toTimestamp(getAdminApprovedDate(a))),
      ),
    [visibleQuotations, searchByTab.pending_payment],
  )
  void bankProcessList
  void pendingPaymentList
  void BANK_PROCESS_TABS

  const meteringStageForTab = (tab: MeteringStage): "processing" | "approved" | "meter_install" | "mco" | null => {
    if (tab === "processing") return "processing"
    if (tab === "approved") return "approved"
    if (tab === "meter_install") return "meter_install"
    if (tab === "mco") return "mco"
    return null
  }

  const applyMeterOverdueFilter = (list: MeteringQuotation[], tab: MeteringStage) => {
    if (filterMeterOverdue === "all" || tab === "wcc" || tab === "meter_install") return list
    const stage = meteringStageForTab(tab)
    return list.filter((q) => {
      if (stage === "mco" || !stage) return false
      const referenceYmd = resolveMeteringReferenceYmd(q as Record<string, unknown>, stage)
      const tone = meteringOverdueTone(referenceYmd, stage)
      return matchesMeteringOverdueFilter(tone, filterMeterOverdue)
    })
  }

  const stageBadgeClass = (tab: MeteringStage) => {
    if (tab === "processing") return "border-amber-300/80 bg-amber-50 text-amber-800"
    if (tab === "approved") return "border-sky-300/80 bg-sky-50 text-sky-800"
    if (tab === "wcc") return "border-violet-300/80 bg-violet-50 text-violet-800"
    if (tab === "meter_install") return "border-indigo-300/80 bg-indigo-50 text-indigo-800"
    if (tab === "bank_process" || tab === "pending_payment") {
      return "border-amber-400/80 bg-amber-50 text-amber-900"
    }
    return "border-emerald-300/80 bg-emerald-50 text-emerald-800"
  }

  const renderRow = (q: MeteringQuotation, tab: MeteringStage) => {
    const saved = workflowMap[q.id]
    const discomName = String(q.discomName || (q as any).discom_name || saved?.discomName || "").trim() || "N/A"
    const remarks = String(q.remarks || saved?.remarks || "").trim() || "N/A"
    const authorizedRepresentative =
      String(
        q.authorizedRepresentative || q.authorized_representative || saved?.authorizedRepresentative || "",
      ).trim() || "N/A"
    const address = formatQuotationVisitLocation(q)
    const dealerName = formatPersonName(q.dealer?.firstName, q.dealer?.lastName, "N/A")
    const statusLabel = getInstallationWorkflowStatus(q as any) || "—"
    const meteringStage = meteringStageForTab(tab)
    const meteringReferenceYmd = resolveMeteringReferenceYmd(q as Record<string, unknown>, meteringStage)
    const overdueTone = meteringOverdueTone(meteringReferenceYmd, meteringStage)
    const overdueUi = meteringOverdueRowClasses(overdueTone)
    return (
      <tr
        key={q.id}
        className={`border-b border-border/50 transition-colors last:border-b-0 ${overdueUi.row || ""}`.trim()}
        title={overdueUi.title}
      >
        <td className="px-3 py-2.5 align-middle">
          <div className="min-w-[11rem] max-w-[14rem]">
            <p className="text-sm font-semibold leading-tight truncate">
              {formatPersonName(q.customer?.firstName, q.customer?.lastName, "Unknown")}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">{q.customer?.mobile || "No mobile"}</p>
            <p className="text-[10px] font-medium text-muted-foreground/90 truncate">{q.id}</p>
          </div>
        </td>
        <td className="px-3 py-2.5 align-middle">
          <div className="min-w-[8.5rem] max-w-[11rem]">
            <p className="text-xs font-medium leading-tight truncate" title={dealerName}>
              {dealerName}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {q.dealer?.mobile || q.dealer?.phone || "No contact"}
            </p>
          </div>
        </td>
        <td className="px-3 py-2.5 align-middle whitespace-nowrap">
          <p className="text-xs font-medium inline-flex items-center gap-1">
            <CalendarDays className="w-3 h-3 text-muted-foreground shrink-0" />
            {getDisplayedApprovedDate(q, tab)
              ? new Date(getDisplayedApprovedDate(q, tab) as string).toLocaleDateString("en-IN")
              : "N/A"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {tab === "mco" ? "Final Step" : tab === "wcc" ? "WCC" : tab === "meter_install" ? "Install" : "Approved"}
          </p>
        </td>
        <td className="px-3 py-2.5 align-middle whitespace-nowrap">
          <span className="inline-flex rounded-md bg-muted/60 px-2 py-0.5 text-xs font-medium">
            {getPhaseLabel(q)}
          </span>
        </td>
        <td className="px-3 py-2.5 align-middle">
          <p className="text-xs font-medium max-w-[10rem] truncate" title={address}>
            {address}
          </p>
        </td>
        <td className="px-3 py-2.5 align-middle">
          <p className="text-xs font-medium max-w-[10rem] truncate" title={discomName}>
            {discomName}
          </p>
        </td>
        <td className="px-3 py-2.5 align-middle">
          <p className="text-xs font-medium max-w-[9rem] truncate" title={remarks}>
            {remarks}
          </p>
        </td>
        <td className="px-3 py-2.5 align-middle">
          <p className="text-xs font-medium max-w-[9rem] truncate" title={authorizedRepresentative}>
            {authorizedRepresentative}
          </p>
        </td>
        <td className="px-3 py-2.5 align-middle">
          <Badge variant="outline" className={`text-[10px] capitalize font-medium ${stageBadgeClass(tab)}`}>
            {String(statusLabel).replace(/_/g, " ")}
          </Badge>
        </td>
        <td
          className={`px-3 py-2.5 align-middle text-right md:sticky md:right-0 md:z-10 md:shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)] ${overdueUi.sticky || ""}`.trim()}
        >
          <div className="flex flex-nowrap items-center justify-end gap-1.5">
            <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => openDetailsModal(q.id)}>
              Details
            </Button>
            {!readOnly && tab === "processing" && (
              <Button size="sm" className="h-8 shrink-0" onClick={() => void setStage(q.id, "approved")}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                To Discom
              </Button>
            )}
            {!readOnly && tab === "approved" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={() => void setStage(q.id, "processing")}
                >
                  To Pending
                </Button>
                <Button size="sm" className="h-8 shrink-0" onClick={() => void moveToWccPending(q.id)}>
                  To WCC Pending
                </Button>
              </>
            )}
            {!readOnly && tab === "wcc" && (
              <Button size="sm" className="h-8 shrink-0" onClick={() => void setStage(q.id, "meter_install")}>
                <Wrench className="w-3.5 h-3.5 mr-1" />
                To Meter Install
              </Button>
            )}
            {!readOnly && tab === "meter_install" && (
              <Button size="sm" className="h-8 shrink-0" onClick={() => void setStage(q.id, "mco")}>
                <FileCheck className="w-3.5 h-3.5 mr-1" />
                To Final Step
              </Button>
            )}
            {!readOnly && tab === "bank_process" && (
              <Button size="sm" className="h-8 shrink-0" onClick={() => markBankProcessDone(q.id)}>
                <Wallet className="w-3.5 h-3.5 mr-1" />
                To Pending Payment
              </Button>
            )}
            {!readOnly && tab === "mco" && (
              <>
                <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => openMcoDocsModal(q.id)}>
                  MCO Docs
                </Button>
                <Button
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={() => void moveToBaldevConfirmation(q.id)}
                  disabled={!hasRequiredMeteringDetails(q.id) || !hasRequiredMcoDocuments(q.id)}
                >
                  To Confirmation
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={() => void setStage(q.id, "meter_install")}
                >
                  To Meter Install
                </Button>
              </>
            )}
            {!readOnly && tab === "pending_payment" && (
              <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-900">
                Awaiting payment
              </Badge>
            )}
          </div>
        </td>
      </tr>
    )
  }

  const renderMeteringTable = (list: MeteringQuotation[], tab: MeteringStage) => (
    <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-sm">
      <table className="w-full min-w-[96rem] border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur supports-[backdrop-filter]:bg-muted/70">
          <tr className="border-b border-border/70 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2.5 whitespace-nowrap">Customer</th>
            <th className="px-3 py-2.5 whitespace-nowrap">Dealer</th>
            <th className="px-3 py-2.5 whitespace-nowrap">Date</th>
            <th className="px-3 py-2.5 whitespace-nowrap">Phase</th>
            <th className="px-3 py-2.5 whitespace-nowrap">Address</th>
            <th className="px-3 py-2.5 whitespace-nowrap">Discom Name</th>
            <th className="px-3 py-2.5 whitespace-nowrap">Remarks</th>
            <th className="px-3 py-2.5 whitespace-nowrap">Auth. Rep.</th>
            <th className="px-3 py-2.5 whitespace-nowrap">Status</th>
            <th className="px-3 py-2.5 whitespace-nowrap text-right sticky right-0 bg-muted/90 z-10 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>{list.map((q) => renderRow(q, tab))}</tbody>
      </table>
    </div>
  )

  const renderTabBody = (list: MeteringQuotation[], tab: MeteringStage, emptyLabel: string) => {
    if (isLoading) {
      return (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">Loading metering queue…</CardContent>
        </Card>
      )
    }
    if (list.length === 0) {
      return (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">{emptyLabel}</CardContent>
        </Card>
      )
    }
    return renderMeteringTable(applyMeterOverdueFilter(list, tab), tab)
  }

  return (
    <div className="space-y-4">
      {showDescription && description !== null && (
        <p className="text-sm text-muted-foreground">
          {description ||
            "Meter process: Meter Pending → Meter in Discom → WCC Pending → Meter Installation Pending → Final Step. Same stages as Admin → Metering."}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <div className="w-full rounded-lg border border-border/70 bg-muted/30 p-1 flex flex-wrap gap-1">
          {(
            [
              { key: "processing" as const, label: `Meter Pending (${processingList.length})`, icon: ClipboardList },
              { key: "approved" as const, label: `Meter in Discom (${approvedList.length})`, icon: CheckCircle2 },
              { key: "wcc" as const, label: `WCC Pending (${wccList.length})`, icon: ClipboardList },
              {
                key: "meter_install" as const,
                label: `Meter Installation Pending (${meterInstallList.length})`,
                icon: Wrench,
              },
              { key: "mco" as const, label: `Final Step (${mcoList.length})`, icon: FileCheck },
            ] as const
          ).map((item) => {
            const Icon = item.icon
            return (
              <Button
                key={item.key}
                type="button"
                size="sm"
                variant={activeTab === item.key ? "default" : "ghost"}
                className={
                  activeTab === item.key ? "h-8 text-xs gap-1.5 shadow-sm" : "h-8 text-xs gap-1.5"
                }
                onClick={() => setActiveTab(item.key)}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </Button>
            )
          })}
        </div>

        {activeTab !== "wcc" && activeTab !== "meter_install" ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mr-1">
              Overdue (based on date)
            </span>
            {(
              [
                {
                  key: "lt5" as const,
                  label: "Less than 5",
                  activeClass: "bg-emerald-600 text-white hover:bg-emerald-600 border-emerald-600",
                },
                {
                  key: "gte5" as const,
                  label: "5 equal and more",
                  activeClass: "bg-amber-500 text-white hover:bg-amber-500 border-amber-500",
                },
                {
                  key: "gte10" as const,
                  label: "10 equal and more",
                  activeClass: "bg-red-600 text-white hover:bg-red-600 border-red-600",
                },
              ] as const
            ).map((chip) => (
              <Button
                key={chip.key}
                type="button"
                size="sm"
                variant="outline"
                className={
                  filterMeterOverdue === chip.key ? `h-7 text-xs ${chip.activeClass}` : "h-7 text-xs"
                }
                onClick={() => setFilterMeterOverdue((prev) => (prev === chip.key ? "all" : chip.key))}
              >
                {chip.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Bank process UI temporarily commented out — same as Admin
        <div className="xl:w-auto shrink-0 rounded-lg border-2 border-amber-300/80 bg-amber-50/40 p-1.5">
          ...
        </div>
      */}

      <div className="relative w-full md:w-80 md:ml-auto">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={searchByTab[activeTab]}
          onChange={(e) =>
            setSearchByTab((prev) => ({
              ...prev,
              [activeTab]: e.target.value,
            }))
          }
          placeholder="Search by customer, mobile, quotation id"
          className="h-9 pl-8 text-sm"
        />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as MeteringStage)}>
        <TabsList className="hidden">
          {METER_PROCESS_TABS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {key}
            </TabsTrigger>
          ))}
          {/* Bank process tabs temporarily commented out
          {[...BANK_PROCESS_TABS].map((key) => (
            <TabsTrigger key={key} value={key}>
              {key}
            </TabsTrigger>
          ))}
          */}
        </TabsList>
        <TabsContent value="processing" className="space-y-3 pt-2">
          {renderTabBody(processingList, "processing", "No items in Meter Pending.")}
        </TabsContent>
        <TabsContent value="approved" className="space-y-3 pt-2">
          {renderTabBody(approvedList, "approved", "No items in Meter in Discom.")}
        </TabsContent>
        <TabsContent value="wcc" className="space-y-3 pt-2">
          {renderTabBody(wccList, "wcc", "No items in WCC Pending.")}
        </TabsContent>
        <TabsContent value="meter_install" className="space-y-3 pt-2">
          {renderTabBody(meterInstallList, "meter_install", "No items in Meter Installation Pending.")}
        </TabsContent>
        <TabsContent value="mco" className="space-y-3 pt-2">
          {renderTabBody(mcoList, "mco", "No items in Final Step.")}
        </TabsContent>
        {/* Bank process tab bodies temporarily commented out
        <TabsContent value="bank_process" className="space-y-3 pt-2">
          {renderTabBody(bankProcessList, "bank_process", "No loan / cash+loan items in Bank Process.")}
        </TabsContent>
        <TabsContent value="pending_payment" className="space-y-3 pt-2">
          {renderTabBody(pendingPaymentList, "pending_payment", "No items in Pending Payment.")}
        </TabsContent>
        */}
      </Tabs>

      <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Metering Details</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Data is saved to backend database and S3. Local/session storage is not used for persistence.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">DISCOM Name</p>
              <Input
                value={detailsDraft.discomName}
                onChange={(e) => setDetailsDraft((prev) => ({ ...prev, discomName: e.target.value }))}
                placeholder="Enter DISCOM name"
                className="h-9 text-sm"
                disabled={readOnly}
              />
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Meter Type</p>
              <select
                value={detailsDraft.meterType}
                onChange={(e) =>
                  setDetailsDraft((prev) => ({
                    ...prev,
                    meterType: (e.target.value || "") as MeteringModalDraft["meterType"],
                  }))
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={readOnly}
              >
                <option value="">Select meter type</option>
                <option value="solar">Solar Meter</option>
                <option value="net">Net Meter</option>
                <option value="both">Both</option>
              </select>
            </div>
            {detailsDraft.meterType === "both" ? (
              <>
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Solar Meter No</p>
                  <Input
                    value={detailsDraft.solarMeterNo}
                    onChange={(e) => setDetailsDraft((prev) => ({ ...prev, solarMeterNo: e.target.value }))}
                    placeholder="Enter solar meter number"
                    className="h-9 text-sm"
                    disabled={readOnly}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Net Meter No</p>
                  <Input
                    value={detailsDraft.netMeterNo}
                    onChange={(e) => setDetailsDraft((prev) => ({ ...prev, netMeterNo: e.target.value }))}
                    placeholder="Enter net meter number"
                    className="h-9 text-sm"
                    disabled={readOnly}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-1 md:col-span-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {detailsDraft.meterType === "solar"
                    ? "Solar Meter No"
                    : detailsDraft.meterType === "net"
                      ? "Net Meter No"
                      : "Meter No"}
                </p>
                <Input
                  value={detailsDraft.meterNo}
                  onChange={(e) => setDetailsDraft((prev) => ({ ...prev, meterNo: e.target.value }))}
                  placeholder="Enter meter number"
                  className="h-9 text-sm"
                  disabled={readOnly}
                />
              </div>
            )}
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Authorized Representative</p>
              <Input
                value={detailsDraft.authorizedRepresentative}
                onChange={(e) => setDetailsDraft((prev) => ({ ...prev, authorizedRepresentative: e.target.value }))}
                placeholder="Enter authorized representative"
                className="h-9 text-sm"
                disabled={readOnly}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Remarks</p>
              <Textarea
                value={detailsDraft.remarks}
                onChange={(e) => setDetailsDraft((prev) => ({ ...prev, remarks: e.target.value }))}
                placeholder="Enter remarks"
                rows={3}
                className="resize-y min-h-[72px] text-sm"
                disabled={readOnly}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Meter Document Image</p>
              <Input
                type="file"
                accept="image/*,.heic,.heif"
                className="h-9 text-sm"
                disabled={readOnly}
                onChange={(e) => {
                  if (!detailsQuotationId) return
                  const file = e.target.files?.[0] || null
                  setMeterDocumentByQuotation((prev) => ({ ...prev, [detailsQuotationId]: file }))
                  setMeterDocumentPreviewByQuotation((prev) => {
                    const oldUrl = prev[detailsQuotationId]
                    if (oldUrl) {
                      try {
                        URL.revokeObjectURL(oldUrl)
                      } catch {}
                    }
                    return {
                      ...prev,
                      [detailsQuotationId]: file ? URL.createObjectURL(file) : "",
                    }
                  })
                  updateWorkflowMeta(detailsQuotationId, { meterDocumentName: file?.name || "" })
                }}
              />
              <p className="text-[11px] text-muted-foreground truncate">
                {(() => {
                  if (!detailsQuotationId) return "No file selected"
                  const row = quotations.find((q) => q.id === detailsQuotationId) as any
                  return (
                    meterDocumentByQuotation[detailsQuotationId]?.name ||
                    workflowMap[detailsQuotationId]?.meterDocumentName ||
                    row?.meterDocumentName ||
                    row?.meter_document_name ||
                    "No file selected"
                  )
                })()}
              </p>
              {(() => {
                if (!detailsQuotationId) return null
                const row = quotations.find((q) => q.id === detailsQuotationId) as any
                const fromRow = readQuotationMeterDocument(row)
                const savedUrl =
                  fromRow.url ||
                  toMeterDocumentPublicViewUrl(
                    row?.meterDocumentPublicUrl ||
                      row?.meter_document_public_url ||
                      workflowMap[detailsQuotationId]?.meterDocumentUrl ||
                      row?.meterDocumentUrl ||
                      row?.meter_document_url ||
                      meterDocumentPreviewByQuotation[detailsQuotationId],
                  )
                const localFile = meterDocumentByQuotation[detailsQuotationId] || null
                const savedName =
                  meterDocumentByQuotation[detailsQuotationId]?.name ||
                  fromRow.name ||
                  workflowMap[detailsQuotationId]?.meterDocumentName ||
                  row?.meterDocumentName ||
                  row?.meter_document_name
                if (!savedUrl && !localFile) return null
                return (
                  <StoredMediaPreview
                    rawUrl={savedUrl}
                    localFile={localFile}
                    quotationId={detailsQuotationId}
                    fileName={savedName}
                  />
                )
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsModalOpen(false)} disabled={savingDetails}>
              {readOnly ? "Close" : "Cancel"}
            </Button>
            {!readOnly && (
              <Button onClick={saveMeteringDetails} disabled={savingDetails || !detailsQuotationId}>
                {savingDetails ? "Saving..." : "Save Details"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mcoDocsModalOpen} onOpenChange={setMcoDocsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>MCO Completion Documents</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Upload all 3 images before moving this quotation to Baldev confirmation.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { key: "work", label: "Work Complete Report", accept: "image/*" },
              { key: "meter", label: "Meter Installed Photo", accept: "image/*" },
              { key: "dcr", label: "Complete DCR Report (Image)", accept: "image/*" },
            ].map((item) => {
              if (!mcoDocsQuotationId) return null
              const row = quotations.find((q) => q.id === mcoDocsQuotationId) as any
              const workflow = workflowMap[mcoDocsQuotationId] || {}
              const currentName =
                item.key === "work"
                  ? workCompleteReportByQuotation[mcoDocsQuotationId]?.name ||
                    workflow.workCompleteReportImageName ||
                    row?.workCompleteReportImageName ||
                    row?.work_complete_report_image_name
                  : item.key === "meter"
                    ? meterInstalledPhotoByQuotation[mcoDocsQuotationId]?.name ||
                      workflow.meterInstalledPhotoName ||
                      row?.meterInstalledPhotoName ||
                      row?.meter_installed_photo_name
                    : completeDcrReportByQuotation[mcoDocsQuotationId]?.name ||
                      workflow.completeDcrReportImageName ||
                      row?.completeDcrReportImageName ||
                      row?.complete_dcr_report_image_name
              const previewSrc =
                item.key === "work"
                  ? mcoPreviewByQuotation[mcoDocsQuotationId]?.workCompleteReportImage ||
                    workflow.workCompleteReportImageUrl ||
                    row?.workCompleteReportImageUrl ||
                    row?.work_complete_report_image_url
                  : item.key === "meter"
                    ? mcoPreviewByQuotation[mcoDocsQuotationId]?.meterInstalledPhoto ||
                      workflow.meterInstalledPhotoUrl ||
                      row?.meterInstalledPhotoUrl ||
                      row?.meter_installed_photo_url
                    : mcoPreviewByQuotation[mcoDocsQuotationId]?.completeDcrReportImage ||
                      workflow.completeDcrReportImageUrl ||
                      row?.completeDcrReportImageUrl ||
                      row?.complete_dcr_report_image_url
              return (
                <div className="space-y-1" key={item.key}>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.label}</p>
                  <Input
                    type="file"
                    accept={item.accept}
                    className="h-9 text-sm"
                    disabled={readOnly}
                    onChange={(e) => {
                      if (!mcoDocsQuotationId) return
                      const file = e.target.files?.[0] || null
                      const newUrl = file ? URL.createObjectURL(file) : undefined
                      setMcoPreviewByQuotation((prev) => {
                        const current = prev[mcoDocsQuotationId] || {}
                        const oldUrl =
                          item.key === "work"
                            ? current.workCompleteReportImage
                            : item.key === "meter"
                              ? current.meterInstalledPhoto
                              : current.completeDcrReportImage
                        if (oldUrl && oldUrl.startsWith("blob:")) {
                          try {
                            URL.revokeObjectURL(oldUrl)
                          } catch {}
                        }
                        return {
                          ...prev,
                          [mcoDocsQuotationId]: {
                            ...current,
                            ...(item.key === "work"
                              ? { workCompleteReportImage: newUrl || current.workCompleteReportImage }
                              : item.key === "meter"
                                ? { meterInstalledPhoto: newUrl || current.meterInstalledPhoto }
                                : { completeDcrReportImage: newUrl || current.completeDcrReportImage }),
                          },
                        }
                      })
                      if (item.key === "work") {
                        setWorkCompleteReportByQuotation((prev) => ({ ...prev, [mcoDocsQuotationId]: file }))
                        updateWorkflowMeta(mcoDocsQuotationId, {
                          workCompleteReportImageName: file?.name || currentName || "",
                        })
                      } else if (item.key === "meter") {
                        setMeterInstalledPhotoByQuotation((prev) => ({ ...prev, [mcoDocsQuotationId]: file }))
                        updateWorkflowMeta(mcoDocsQuotationId, {
                          meterInstalledPhotoName: file?.name || currentName || "",
                        })
                      } else {
                        setCompleteDcrReportByQuotation((prev) => ({ ...prev, [mcoDocsQuotationId]: file }))
                        updateWorkflowMeta(mcoDocsQuotationId, {
                          completeDcrReportImageName: file?.name || currentName || "",
                        })
                      }
                    }}
                  />
                  <p className="text-[11px] text-muted-foreground truncate">{currentName || "No file selected"}</p>
                  {previewSrc && (
                    <img
                      src={previewSrc}
                      alt={`${item.label} preview`}
                      className="h-24 w-auto rounded border object-cover"
                    />
                  )}
                </div>
              )
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMcoDocsModalOpen(false)} disabled={savingMcoDocs}>
              {readOnly ? "Close" : "Cancel"}
            </Button>
            {!readOnly && (
              <Button onClick={saveMcoDocuments} disabled={savingMcoDocs || !mcoDocsQuotationId}>
                {savingMcoDocs ? "Saving..." : "Save Documents"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
