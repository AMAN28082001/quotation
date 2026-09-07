"use client"

import { useEffect, useMemo, useRef, useState, Fragment } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SolarLogo } from "@/components/solar-logo"
import {
  LogOut,
  Wrench,
  Clock3,
  Search,
  Calendar,
  Edit,
  ChevronDown,
  Users,
  History,
  Eye,
  RotateCcw,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { InstallationTeamsDialog } from "@/components/installation-teams-dialog"
import { api, apiErrorToUserMessage, ApiError, retrieveQuotationFromInstallation } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { formatPersonName } from "@/lib/name-display"
import { confirmSave } from "@/lib/confirm-save"
import { DebouncedSearchInput } from "@/components/debounced-search-input"
import { InstallationStatusTimelineDialog } from "@/components/installation-status-timeline-dialog"
import { InstallationPhotosViewerDialog } from "@/components/installation-photos-viewer-dialog"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  InstallationCompletionPanel,
  type InstallationUploadedFile,
} from "@/components/installation-completion-panel"
import {
  gatherInstallationPublicImageUrls,
  INSTALLATION_APPROVED_MEDIA_STATUSES,
  isInstallationUploadCompleteWithMedia,
} from "@/lib/installation-public-images"
import { loadOperationalInstallationRows } from "@/lib/load-operational-installation-rows"
import {
  addCalendarDaysFromDateString,
  flattenWrappedQuotationRow,
  getAdminInstallationTabRevertState,
  getInstallationWorkflowStatus,
  mergeInstallationMediaSources,
  mergeInstallerReleaseOntoQuotation,
  readInstallerReleaseMap,
  shouldShowInAdminInstallationTab,
  isInstallationPartialApproved,
  getInstallationAdminTabProgress,
  toYmdFromStored,
  setInstallationScheduledDateInLocalMap,
} from "@/lib/operational-install-queue"
import {
  installationOverdueTone,
  installerQueueStatusDisplayLabel,
  installerStageBadgeTone,
  matchesOverdueToneFilter,
  overdueRowClasses,
  resolveInstallationScheduleYmd,
  type InstallOverdueFilter,
} from "@/lib/installation-overdue-ui"
import { cn } from "@/lib/utils"
import {
  loadInstallationTeamsList,
  persistInstallationTeamAssignment,
} from "@/lib/installation-team-management"
import { getInstallationTeamIdForQuotation, type InstallationTeamRecord } from "@/lib/installation-teams"
import { AccessSwitchBar } from "@/components/access-switch-bar"
import { canOpenSection, getAccessOptions, getPostLoginPath } from "@/lib/user-access"
import { isWorkflowModuleReadOnly, filterQuotationsByWorkflowPermission, shouldLoadAllWorkflowQuotations } from "@/lib/module-field-permissions"
import {
  INSTALLATION_IMAGE_FIELDS,
  type InstallationImageFieldKey,
  isInstallationImageFieldMultiple,
  isInstallationImageFieldRequired,
} from "@/lib/installation-image-fields"

type InstallerQuotation = {
  id: string
  status?: string
  customer?: {
    firstName?: string
    lastName?: string
    mobile?: string
    email?: string
    address?: string
    location?: string
    locationLink?: string
  }
  dealer?: { firstName?: string; lastName?: string; mobile?: string }
  visitors?: Array<{ visitorName?: string; name?: string; mobile?: string }>
  otherVisitors?: Array<{ visitorName?: string; name?: string; mobile?: string }>
  assignedVisitors?: Array<{ visitorName?: string; name?: string; mobile?: string }>
  visitLocation?: string
  location?: string
  locationLink?: string
  products?: Record<string, any>
  createdAt?: string
  pricing?: { subtotal?: number; totalAmount?: number; finalAmount?: number }
  subtotal?: number
  totalAmount?: number
  finalAmount?: number
  installationStatus?: string
  installation_status?: string
  installationReadyForInstaller?: boolean
  installationReleasedAt?: string
  installation_ready_for_installer?: boolean
  installation_released_at?: string
  installationScheduledAt?: string
  installation_scheduled_at?: string
  installationTeamId?: string
  installation_team_id?: string
  readyForInstallation?: boolean
  ready_for_installation?: boolean
  releaseToInstaller?: boolean
  length?: number
  width?: number
  height?: number
  siteLength?: number
  siteWidth?: number
  siteHeight?: number
  visitLength?: number
  visitWidth?: number
  visitHeight?: number
  visitId?: string
  backLegFeet?: number
  midLegFeet?: number
  frontLegFeet?: number
}

type InstallerWorkflowItem = {
  status: "pending" | "inprogress" | "approved"
  notes?: string
  imageNames?: string[]
  updatedAt: string
}

const CM_PER_FT = 30.48

const newExpenseLineId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `exp-${Date.now()}-${Math.random().toString(16).slice(2)}`

type ExtraExpenseLine = { id: string; description: string; amount: string }

/** Product-shaped fields sometimes returned on the quotation root or QuotationProduct row instead of `products`. */
const INSTALLER_PRODUCT_ROOT_KEYS = [
  "systemType",
  "phase",
  "panelBrand",
  "panelSize",
  "panelQuantity",
  "panelPrice",
  "dcrPanelBrand",
  "dcrPanelSize",
  "dcrPanelQuantity",
  "nonDcrPanelBrand",
  "nonDcrPanelSize",
  "nonDcrPanelQuantity",
  "inverterType",
  "inverterBrand",
  "inverterSize",
  "inverterPrice",
  "structureType",
  "structureSize",
  "structurePrice",
  "hybridInverter",
  "batteryCapacity",
  "batteryPrice",
  "customPanels",
] as const

const isNonEmptyPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length > 0

const pickProductFieldsFromRecord = (record?: Record<string, any> | null): Record<string, any> => {
  if (!record) return {}
  const out: Record<string, any> = {}
  for (const k of INSTALLER_PRODUCT_ROOT_KEYS) {
    const val = record[k]
    if (val === undefined || val === null) continue
    if (typeof val === "string" && val.trim() === "") continue
    out[k] = val
  }
  return out
}

/**
 * Merge `products` JSON with nested quotation rows and Sequelize-style product rows so installer UI always sees one object.
 */
const mergeInstallerProductSources = (record: Record<string, any>): Record<string, any> => {
  const nested = record.quotation && typeof record.quotation === "object" ? (record.quotation as Record<string, any>) : null
  const qp = record.quotationProduct
  const qps = record.quotationProducts
  const firstArrayRow =
    Array.isArray(qps) && qps[0] && typeof qps[0] === "object" && !Array.isArray(qps[0]) ? (qps[0] as Record<string, any>) : null
  const productRow =
    qp && typeof qp === "object" && !Array.isArray(qp) ? (qp as Record<string, any>) : firstArrayRow

  let merged: Record<string, any> = {}
  if (nested) {
    merged = { ...merged, ...pickProductFieldsFromRecord(nested) }
    if (isNonEmptyPlainObject(nested.products)) merged = { ...merged, ...nested.products }
  }
  merged = { ...merged, ...pickProductFieldsFromRecord(record) }
  if (isNonEmptyPlainObject(record.products)) merged = { ...merged, ...record.products }
  if (productRow && Object.keys(productRow).length > 0) merged = { ...merged, ...productRow }
  return merged
}

/** Flatten `{ quotation: {...} }` list/detail shapes and attach merged `products` for display. */
const installerQuotationFromApiRecord = (raw: unknown): InstallerQuotation => {
  if (!raw || typeof raw !== "object") return raw as InstallerQuotation
  const r = raw as Record<string, any>
  const nested = r.quotation
  const flat =
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? ({ ...(nested as Record<string, any>), ...r } as Record<string, any>)
      : { ...r }
  const mergedProducts = mergeInstallerProductSources(flat)
  const products = isNonEmptyPlainObject(mergedProducts)
    ? mergedProducts
    : isNonEmptyPlainObject(flat.products)
      ? (flat.products as Record<string, any>)
      : flat.products || {}
  return { ...flat, products } as InstallerQuotation
}

export default function InstallerDashboardPage() {
  const router = useRouter()
  const { isAuthenticated, role, installer, installationTeamUser, logout, access, modulePermissions, officeLocation, dealer, accountManager } = useAuth()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "partial" | "done">("pending")
  const [filterInstallOverdue, setFilterInstallOverdue] = useState<InstallOverdueFilter>("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [quotations, setQuotations] = useState<InstallerQuotation[]>([])
  const [expandedQuotationId, setExpandedQuotationId] = useState<string | null>(null)
  const [uploadNotes, setUploadNotes] = useState<Record<string, string>>({})
  const [uploadFilesByQuotation, setUploadFilesByQuotation] = useState<
    Record<string, Partial<Record<InstallationImageFieldKey, InstallationUploadedFile[]>>>
  >({})
  const [piUploadByQuotation, setPiUploadByQuotation] = useState<Record<string, InstallationUploadedFile[]>>({})
  const [extraExpenseLinesByQuotation, setExtraExpenseLinesByQuotation] = useState<Record<string, ExtraExpenseLine[]>>({})
  const [dimensionsByQuotation, setDimensionsByQuotation] = useState<
    Record<string, { length: string; width: string; height: string }>
  >({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [loadingDetailsForId, setLoadingDetailsForId] = useState<string | null>(null)
  const [statusHistoryQuotation, setStatusHistoryQuotation] = useState<InstallerQuotation | null>(null)
  const [installPhotosViewer, setInstallPhotosViewer] = useState<InstallerQuotation | null>(null)
  const [installPhotoUrls, setInstallPhotoUrls] = useState<string[]>([])
  const [installPhotosLoading, setInstallPhotosLoading] = useState(false)
  const [retrievingFromInstallationId, setRetrievingFromInstallationId] = useState<string | null>(null)
  const [installRevertTarget, setInstallRevertTarget] = useState<{ id: string; label: string } | null>(null)
  const [installRevertSaving, setInstallRevertSaving] = useState(false)
  const [workflowMap, setWorkflowMap] = useState<Record<string, InstallerWorkflowItem>>({})
  const [installerQueueApprovedIds, setInstallerQueueApprovedIds] = useState<Set<string>>(() => new Set())
  const [uploadingAssetKey, setUploadingAssetKey] = useState<string | null>(null)
  const [installationTeams, setInstallationTeams] = useState<InstallationTeamRecord[]>([])
  const [installationTeamsDialogOpen, setInstallationTeamsDialogOpen] = useState(false)
  const [installationTeamsRefresh, setInstallationTeamsRefresh] = useState(0)
  const useApi = process.env.NEXT_PUBLIC_USE_API !== "false"
  const canManageInstallationTeams = role === "installer"
  const sessionUserId =
    dealer?.id ?? accountManager?.id ?? installer?.id ?? installationTeamUser?.id ?? undefined
  const installationReadOnly = isWorkflowModuleReadOnly(modulePermissions, "installation", {
    userId: sessionUserId,
    officeLocation,
    viewerIsDealer: role === "dealer",
    viewerIsAdmin: role === "admin" || role === "super-admin",
  })
  const permissionCtx = useMemo(
    () => ({
      userId: sessionUserId,
      officeLocation,
      viewerIsDealer: role === "dealer",
      viewerIsAdmin: role === "admin" || role === "super-admin",
    }),
    [sessionUserId, officeLocation, role],
  )

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login")
      return
    }
    if (
      role !== "installer" &&
      role !== "installation-team" &&
      !canOpenSection(access, role, "installation")
    ) {
      router.push(getPostLoginPath(access.length ? access : []))
    }
  }, [isAuthenticated, role, access, router])

  useEffect(() => {
    const stored = localStorage.getItem("installerWorkflowMap")
    if (stored) {
      try {
        setWorkflowMap(JSON.parse(stored))
      } catch {
        setWorkflowMap({})
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem("installerWorkflowMap", JSON.stringify(workflowMap))
  }, [workflowMap])

  useEffect(() => {
    if (!canManageInstallationTeams) return
    void loadInstallationTeamsList(useApi).then(setInstallationTeams)
  }, [useApi, canManageInstallationTeams, installationTeamsRefresh])

  const handlePersistInstallationTeamAssignment = async (quotationId: string, teamId: string) => {
    const normalized = teamId.trim() || undefined
    setQuotations((prev) =>
      prev.map((q) =>
        q.id === quotationId
          ? ({
              ...q,
              installationTeamId: normalized,
              installation_team_id: normalized,
            } as InstallerQuotation)
          : q,
      ),
    )
    const result = await persistInstallationTeamAssignment(useApi, quotationId, teamId)
    if (result.ok) {
      toast({
        title: "Team assignment updated",
        description: normalized ? "This installation is linked to a team." : "Team unassigned for this row.",
      })
      return
    }
    toast({
      title: "Not saved on server",
      description: result.message,
      variant: "destructive",
    })
  }

  const installDocEnrichAttemptedRef = useRef(new Set<string>())
  const installDocEnrichInFlightRef = useRef(new Set<string>())

  useEffect(() => {
    const loadInstallationQuotations = async () => {
      setIsLoading(true)
      try {
        if (useApi) {
          const loadAllInstallation = shouldLoadAllWorkflowQuotations(
            modulePermissions,
            "installation",
            permissionCtx,
          )
          const { rows, installerQueueApprovedIds: approvedIds } = await loadOperationalInstallationRows({
            fetchAdminQuotationList: loadAllInstallation,
            filterTeamId:
              role === "installation-team" && installationTeamUser?.teamId
                ? String(installationTeamUser.teamId)
                : undefined,
            getQuotationById: (id) => api.quotations.getById(id),
          })
          setInstallerQueueApprovedIds(approvedIds)
          setQuotations(rows.map((row) => installerQuotationFromApiRecord(row)) as InstallerQuotation[])
        } else {
          let localQuotations: InstallerQuotation[] = []
          try {
            localQuotations = JSON.parse(localStorage.getItem("quotations") || "[]")
          } catch {
            localQuotations = []
          }
          const releaseLocal = readInstallerReleaseMap()
          let list = localQuotations
            .map((q: unknown) => installerQuotationFromApiRecord(q))
            .map((q) =>
              mergeInstallerReleaseOntoQuotation(q as Record<string, unknown>, releaseLocal) as InstallerQuotation,
            )
            .filter((q) => shouldShowInAdminInstallationTab(q as Record<string, unknown>, releaseLocal))
          if (role === "installation-team" && installationTeamUser?.teamId) {
            const want = String(installationTeamUser.teamId).trim()
            list = list.filter((q: InstallerQuotation) => {
              const got = String(getInstallationTeamIdForQuotation(q.id, q as Record<string, unknown>) || "").trim()
              return got === want
            })
          }
          setInstallerQueueApprovedIds(new Set())
          setQuotations(list)
        }
      } catch {
        toast({
          title: "Failed to load quotations",
          description: "Could not load installation queue quotations.",
          variant: "destructive",
        })
        setQuotations([])
      } finally {
        setIsLoading(false)
      }
    }
    void loadInstallationQuotations()
  }, [toast, useApi, role, installationTeamUser?.teamId, modulePermissions, permissionCtx])

  useEffect(() => {
    if (!useApi) return

    const candidates = quotations
      .filter((q) => {
        if (!shouldShowInAdminInstallationTab(q as Record<string, unknown>, readInstallerReleaseMap())) return false
        const ws = getInstallationWorkflowStatus(q as Record<string, unknown>)
        const likelyApproved =
          INSTALLATION_APPROVED_MEDIA_STATUSES.has(ws) || installerQueueApprovedIds.has(q.id)
        if (!likelyApproved) return false
        const id = String(q.id || "").trim()
        if (!id || installDocEnrichAttemptedRef.current.has(id) || installDocEnrichInFlightRef.current.has(id)) {
          return false
        }
        return gatherInstallationPublicImageUrls(q as Record<string, unknown>).length === 0
      })
      .slice(0, 20)

    if (candidates.length === 0) return

    let cancelled = false
    void (async () => {
      for (const q of candidates) {
        if (cancelled) break
        const id = q.id
        installDocEnrichAttemptedRef.current.add(id)
        installDocEnrichInFlightRef.current.add(id)
        try {
          const full = await api.quotations.getById(id)
          if (cancelled) break
          setQuotations((prev) =>
            prev.map((row) =>
              row.id === id
                ? (installerQuotationFromApiRecord(
                    mergeInstallationMediaSources(row as Record<string, unknown>, full as Record<string, unknown>),
                  ) as InstallerQuotation)
                : row,
            ),
          )
        } catch {
          // list may still lack documents until backend returns URLs on GET by id
        } finally {
          installDocEnrichInFlightRef.current.delete(id)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [useApi, quotations, installerQueueApprovedIds])

  const getAdminApprovedDate = (q: InstallerQuotation) =>
    (q as any).approvedAt || (q as any).approvedDate || (q as any).statusUpdatedAt || q.createdAt

  const getTeamDisplayName = (q: InstallerQuotation) => {
    const anyQ = q as any
    const directName = String(anyQ.installationTeamName || anyQ.installation_team_name || "").trim()
    if (directName) return directName
    const teamId = String(getInstallationTeamIdForQuotation(q.id, anyQ) || "").trim()
    if (!teamId) return "Unassigned"
    if (role === "installation-team") {
      const loggedInTeamName = String(installationTeamUser?.teamName || installationTeamUser?.username || "").trim()
      if (loggedInTeamName) return loggedInTeamName
    }
    return teamId
  }

  const toTimestamp = (date?: string) => {
    if (!date) return 0
    const parsed = new Date(date).getTime()
    return Number.isNaN(parsed) ? 0 : parsed
  }

  const isInstallationUploadComplete = (q: InstallerQuotation) =>
    isInstallationUploadCompleteWithMedia(q as Record<string, unknown>, {
      approvedQueueIds: installerQueueApprovedIds,
    })

  const getInstallerStatus = (q: InstallerQuotation): "pending" | "partial" | "inprogress" | "approved" => {
    if (isInstallationPartialApproved(q as Record<string, unknown>)) return "partial"
    if (isInstallationUploadComplete(q)) return "approved"
    const progress = getInstallationAdminTabProgress(q as Record<string, unknown>, false)
    if (progress === "partial") return "partial"
    const backendStatus = getInstallationWorkflowStatus(q as Record<string, unknown>)
    if (backendStatus === "installer_in_progress" || backendStatus === "in_progress") {
      return "inprogress"
    }
    return workflowMap[q.id]?.status === "inprogress" ? "inprogress" : "pending"
  }

  const getDealerDisplay = (q: InstallerQuotation) => {
    const qAny = q as Record<string, unknown>
    const nested = (q.dealer || qAny.dealer) as { firstName?: string; lastName?: string; mobile?: string } | undefined
    if (nested && typeof nested === "object") {
      return {
        name: formatPersonName(nested.firstName, nested.lastName, "Dealer"),
        mobile: nested.mobile || "—",
      }
    }
    return { name: "—", mobile: "—" }
  }

  const normalizedSearch = searchTerm.trim().toLowerCase()

  const permissionVisibleQuotations = useMemo(
    () =>
      filterQuotationsByWorkflowPermission(
        quotations as Record<string, unknown>[],
        modulePermissions,
        "installation",
        permissionCtx,
      ) as InstallerQuotation[],
    [quotations, modulePermissions, permissionCtx],
  )

  const sortedQuotations = useMemo(() => {
    // All Account → Send to Installer rows stay visible (including after Send to Metering).
    // Do not collapse to current-quotation-only — that would drop the installed file.
    return [...permissionVisibleQuotations]
      .filter((q) => {
        if (!normalizedSearch) return true
        const fullName = formatPersonName(q.customer?.firstName, q.customer?.lastName, "").toLowerCase()
        return (
          fullName.includes(normalizedSearch) ||
          (q.customer?.mobile || "").includes(normalizedSearch) ||
          q.id.toLowerCase().includes(normalizedSearch)
        )
      })
      .sort((a, b) => toTimestamp(getAdminApprovedDate(a)) - toTimestamp(getAdminApprovedDate(b)))
  }, [permissionVisibleQuotations, normalizedSearch])

  const pendingQuotations = useMemo(
    () =>
      sortedQuotations.filter((q) => {
        const s = getInstallerStatus(q)
        return s === "pending" || s === "inprogress"
      }),
    [sortedQuotations, workflowMap, installerQueueApprovedIds],
  )

  const partialQuotations = useMemo(
    () => sortedQuotations.filter((q) => getInstallerStatus(q) === "partial"),
    [sortedQuotations, workflowMap, installerQueueApprovedIds],
  )

  const approvedQuotations = useMemo(
    () => sortedQuotations.filter((q) => getInstallerStatus(q) === "approved"),
    [sortedQuotations, workflowMap, installerQueueApprovedIds],
  )

  const activeInstallationList = useMemo(() => {
    let list: InstallerQuotation[]
    if (activeTab === "pending") list = pendingQuotations
    else if (activeTab === "partial") list = partialQuotations
    else if (activeTab === "done") list = approvedQuotations
    else list = sortedQuotations

    if (filterInstallOverdue === "all" || activeTab === "done") return list

    return list.filter((q) => {
      const installerStatus = getInstallerStatus(q)
      if (installerStatus === "approved") return false
      const qAny = q as Record<string, unknown>
      const sentToInstallationAt =
        qAny.installationReleasedAt || qAny.installation_released_at || getAdminApprovedDate(q)
      const sentBaseStr = sentToInstallationAt ? String(sentToInstallationAt) : ""
      const installYmd = resolveInstallationScheduleYmd(qAny, sentBaseStr)
      const tone = installationOverdueTone(installYmd, installerStatus)
      return matchesOverdueToneFilter(tone, filterInstallOverdue)
    })
  }, [
    activeTab,
    pendingQuotations,
    partialQuotations,
    approvedQuotations,
    sortedQuotations,
    filterInstallOverdue,
    workflowMap,
    installerQueueApprovedIds,
  ])

  const openUploadPanel = (q: InstallerQuotation) => {
    ensureInstallerDraftData(q)
    setExpandedQuotationId(expandedQuotationId === q.id ? null : q.id)
    if (expandedQuotationId !== q.id) {
      void hydrateQuotationDetails(q)
    }
  }

  const pickDimensionValue = (q: InstallerQuotation, keys: Array<keyof InstallerQuotation>) => {
    for (const key of keys) {
      const val = q[key]
      const n = Number(val)
      if (Number.isFinite(n) && n > 0) return String(n)
    }
    return ""
  }

  const pickFirstFiniteNumber = (...vals: unknown[]): number | undefined => {
    for (const v of vals) {
      if (v === undefined || v === null) continue
      const n = typeof v === "string" && String(v).trim() !== "" ? Number(v) : Number(v)
      if (Number.isFinite(n) && n > 0) return n
    }
    return undefined
  }

  const feetToCmString = (feet: unknown): string => {
    const n = typeof feet === "string" && feet.trim() !== "" ? Number(feet) : Number(feet)
    if (!Number.isFinite(n) || n <= 0) return ""
    const cm = Math.round(n * CM_PER_FT * 100) / 100
    return String(cm)
  }

  /** Site legs (cm): prefer visitor leg fields / siteDimensions, then legacy L×W×H on quotation. */
  const pickSiteLegCmString = (q: InstallerQuotation, leg: "back" | "mid" | "front") => {
    const r = q as Record<string, any>
    if (leg === "back") {
      const cm = pickFirstFiniteNumber(r.backLegCm, r.back_leg_cm)
      if (cm != null) return String(cm)
      const fromFeet = feetToCmString(pickFirstFiniteNumber(r.backLegFeet, r.back_leg_feet))
      if (fromFeet) return fromFeet
      return pickDimensionValue(q, ["length", "siteLength", "visitLength"])
    }
    if (leg === "mid") {
      const cm = pickFirstFiniteNumber(r.midLegCm, r.mid_leg_cm)
      if (cm != null) return String(cm)
      const fromFeet = feetToCmString(pickFirstFiniteNumber(r.midLegFeet, r.mid_leg_feet))
      if (fromFeet) return fromFeet
      return pickDimensionValue(q, ["width", "siteWidth", "visitWidth"])
    }
    const cm = pickFirstFiniteNumber(r.frontLegCm, r.front_leg_cm)
    if (cm != null) return String(cm)
    const fromFeet = feetToCmString(pickFirstFiniteNumber(r.frontLegFeet, r.front_leg_feet))
    if (fromFeet) return fromFeet
    return pickDimensionValue(q, ["height", "siteHeight", "visitHeight"])
  }

  const getVisitorLegRows = (
    q: InstallerQuotation,
    draft?: { length: string; width: string; height: string },
  ): { label: string; value: string }[] => {
    const useDraft = (d: string | undefined, fallback: string) => {
      const t = (d || "").trim()
      return t !== "" ? t : fallback
    }
    const back = useDraft(draft?.length, pickSiteLegCmString(q, "back"))
    const mid = useDraft(draft?.width, pickSiteLegCmString(q, "mid"))
    const front = useDraft(draft?.height, pickSiteLegCmString(q, "front"))
    return [
      { label: "Back leg (cm)", value: back },
      { label: "Mid leg (cm)", value: mid },
      { label: "Front leg (cm)", value: front },
    ].filter((row) => row.value.trim() !== "")
  }

  const getProductSpecRows = (q: InstallerQuotation) => {
    const p = mergeInstallerProductSources(q as unknown as Record<string, any>)
    const systemType = String(p.systemType || "").toLowerCase()
    const panelConfig = (() => {
      if (systemType === "both") {
        const dcr =
          p.dcrPanelSize && p.dcrPanelQuantity
            ? `DCR: ${p.dcrPanelBrand ? `${p.dcrPanelBrand} ` : ""}${p.dcrPanelSize} x ${p.dcrPanelQuantity}`
            : ""
        const nonDcr =
          p.nonDcrPanelSize && p.nonDcrPanelQuantity
            ? `NON-DCR: ${p.nonDcrPanelBrand ? `${p.nonDcrPanelBrand} ` : ""}${p.nonDcrPanelSize} x ${p.nonDcrPanelQuantity}`
            : ""
        return [dcr, nonDcr].filter(Boolean).join(" | ")
      }
      if (systemType === "customize" && Array.isArray(p.customPanels) && p.customPanels.length > 0) {
        return p.customPanels
          .map((cp: any) => `${cp.brand ? `${cp.brand} ` : ""}${cp.size || ""}W x ${cp.quantity || 0}`)
          .join(" | ")
      }
      if (p.panelSize && p.panelQuantity) {
        return `${p.panelBrand ? `${p.panelBrand} ` : ""}${p.panelSize} x ${p.panelQuantity}`
      }
      return ""
    })()

    const inverterConfig = [p.inverterBrand, p.inverterSize, p.inverterType].filter(Boolean).join(" - ")

    const batteryConfig = (() => {
      const parts = [p.batteryCapacity, p.batteryPrice ? `₹${p.batteryPrice}` : undefined].filter(Boolean)
      return parts.join(" - ")
    })()

    return [
      { label: "System Type", value: p.systemType },
      { label: "Panel Configuration", value: panelConfig },
      { label: "Inverter", value: inverterConfig },
      { label: "Phase", value: p.phase },
      { label: "Hybrid Inverter", value: p.hybridInverter },
      { label: "Battery", value: batteryConfig },
      { label: "Battery Capacity", value: p.batteryCapacity },
      { label: "Battery Price", value: p.batteryPrice ? `₹${p.batteryPrice}` : undefined },
      { label: "Structure", value: [p.structureType, p.structureSize].filter(Boolean).join(" - ") },
    ].filter((row) => row.value !== undefined && row.value !== null && String(row.value).trim() !== "")
  }

  const getCustomerInfoRows = (q: InstallerQuotation) => {
    const customerName = formatPersonName(q.customer?.firstName, q.customer?.lastName, "Unknown")
    return [
      { label: "Customer", value: customerName },
      { label: "Mobile", value: q.customer?.mobile },
      { label: "Email", value: q.customer?.email },
      { label: "Agent", value: q.dealer ? formatPersonName(q.dealer.firstName, q.dealer.lastName, "") : undefined },
      { label: "Agent Mobile", value: q.dealer?.mobile },
    ].filter((row) => row.value !== undefined && row.value !== null && String(row.value).trim() !== "")
  }

  const getVisitorDetailsRows = (q: InstallerQuotation) => {
    const visitors = (q.visitors || q.otherVisitors || q.assignedVisitors || [])
      .map((v) => String(v.visitorName || v.name || "").trim())
      .filter((name) => name.length > 0)
    const location = q.visitLocation || q.location || q.customer?.location || q.customer?.address
    const locationLink = q.locationLink || q.customer?.locationLink
    return [
      { label: "Visit Location", value: location },
      { label: "Location Link", value: locationLink },
      { label: "Visitors", value: visitors.length > 0 ? visitors.join(", ") : undefined },
    ].filter((row) => row.value !== undefined && row.value !== null && String(row.value).trim() !== "")
  }

  const ensureInstallerDraftData = (quotation: InstallerQuotation) => {
    setDimensionsByQuotation((prev) => {
      if (prev[quotation.id]) return prev
      return {
        ...prev,
        [quotation.id]: {
          length: pickSiteLegCmString(quotation, "back"),
          width: pickSiteLegCmString(quotation, "mid"),
          height: pickSiteLegCmString(quotation, "front"),
        },
      }
    })
    setExtraExpenseLinesByQuotation((prev) =>
      prev[quotation.id] !== undefined ? prev : { ...prev, [quotation.id]: [] },
    )
    setUploadFilesByQuotation((prev) => (prev[quotation.id] ? prev : { ...prev, [quotation.id]: {} }))
  }

  const hydrateQuotationDetails = async (quotation: InstallerQuotation) => {
    if (!useApi || !quotation?.id) return
    setLoadingDetailsForId(quotation.id)
    try {
      const full = await api.quotations.getById(quotation.id)
      if (!full || typeof full !== "object") return
      const normalized = installerQuotationFromApiRecord(full)

      let visitDetails: any = null
      try {
        const visitResp = await api.visits.getByQuotation(quotation.id)
        const visitList = Array.isArray((visitResp as any)?.visits)
          ? (visitResp as any).visits
          : Array.isArray(visitResp)
            ? (visitResp as any[])
            : []
        visitDetails = visitList[0] || null
      } catch {
        visitDetails = null
      }

      const vd = visitDetails as Record<string, any> | null
      const completion = vd?.completionDetails || vd?.completion_details || {}
      const sd = vd?.siteDimensions || vd?.site_dimensions || completion?.siteDimensions || completion?.site_dimensions || {}
      const backLegFeet = pickFirstFiniteNumber(
        vd?.backLegFeet,
        vd?.back_leg_feet,
        sd.backLegFeet,
        sd.back_leg_feet,
      )
      const midLegFeet = pickFirstFiniteNumber(
        vd?.midLegFeet,
        vd?.mid_leg_feet,
        sd.midLegFeet,
        sd.mid_leg_feet,
      )
      const frontLegFeet = pickFirstFiniteNumber(
        vd?.frontLegFeet,
        vd?.front_leg_feet,
        sd.frontLegFeet,
        sd.front_leg_feet,
      )

      setQuotations((prev) =>
        prev.map((item) => {
          if (item.id !== quotation.id) return item
          return {
            ...item,
            ...normalized,
            customer: {
              ...(item.customer || {}),
              ...((normalized as any).customer || {}),
            },
            dealer: (normalized as any).dealer || item.dealer,
            products: isNonEmptyPlainObject(normalized.products) ? normalized.products : item.products,
            visitId: (vd?.id as string | undefined) || item.visitId,
            backLegFeet: backLegFeet ?? (item as any).backLegFeet,
            midLegFeet: midLegFeet ?? (item as any).midLegFeet,
            frontLegFeet: frontLegFeet ?? (item as any).frontLegFeet,
            visitors:
              (visitDetails?.visitors as any[]) ||
              (visitDetails?.otherVisitors as any[]) ||
              item.visitors ||
              item.otherVisitors,
            otherVisitors: (visitDetails?.otherVisitors as any[]) || item.otherVisitors,
            assignedVisitors: (visitDetails?.assignedVisitors as any[]) || item.assignedVisitors,
            visitLocation: visitDetails?.location || visitDetails?.visitLocation || item.visitLocation,
            location: visitDetails?.location || item.location,
            locationLink: visitDetails?.locationLink || item.locationLink,
            length: visitDetails?.length ?? item.length,
            width: visitDetails?.width ?? item.width,
            height: visitDetails?.height ?? item.height,
            siteLength: visitDetails?.siteLength ?? item.siteLength,
            siteWidth: visitDetails?.siteWidth ?? item.siteWidth,
            siteHeight: visitDetails?.siteHeight ?? item.siteHeight,
          } as InstallerQuotation
        }),
      )
    } catch (error) {
      console.warn("Could not hydrate installer quotation details:", error)
    } finally {
      setLoadingDetailsForId((current) => (current === quotation.id ? null : current))
    }
  }

  const startInstallationInProgress = (quotation: InstallerQuotation) => {
    void (async () => {
      if (useApi) {
        try {
          await api.admin.quotations.updateOperationalStatus(quotation.id, "installer_in_progress")
        } catch {
          // installer JWT may lack admin route — upload panel may still force start
        }
      }
      setWorkflowMap((prev) => ({
        ...prev,
        [quotation.id]: {
          ...(prev[quotation.id] || {}),
          status: "inprogress",
          updatedAt: new Date().toISOString(),
        },
      }))
      openUploadPanel(quotation)
    })()
  }

  const openInstallPhotosViewer = (quotation: InstallerQuotation) => {
    setInstallPhotosViewer(quotation)
    setInstallPhotoUrls(gatherInstallationPublicImageUrls(quotation as Record<string, unknown>, 24))
    setInstallPhotosLoading(true)
    if (!useApi) {
      setInstallPhotosLoading(false)
      return
    }
    void (async () => {
      try {
        const full = flattenWrappedQuotationRow(await api.quotations.getById(quotation.id))
        const merged = mergeInstallationMediaSources(quotation as Record<string, unknown>, full)
        setInstallPhotoUrls(gatherInstallationPublicImageUrls(merged as Record<string, unknown>, 24))
      } catch {
        // keep list-row URLs
      } finally {
        setInstallPhotosLoading(false)
      }
    })()
  }

  const handleRetrieveFromInstallation = async (quotation: InstallerQuotation) => {
    const installerStatus = getInstallerStatus(quotation)
    const revertState = getAdminInstallationTabRevertState(
      quotation as Record<string, unknown>,
      installerStatus,
      readInstallerReleaseMap(),
    )
    if (retrievingFromInstallationId === quotation.id) return
    if (!revertState.enabled) {
      toast({
        title: "Cannot retrieve",
        description: revertState.hint || "This quotation cannot be pulled back to Accounts.",
        variant: "destructive",
      })
      return
    }
    if (!confirmSave(`Retrieve ${quotation.id} from Installation back to Accounts?\n\nThis undoes Send to Installer.`)) {
      return
    }
    setRetrievingFromInstallationId(quotation.id)
    try {
      if (useApi) {
        const ok = await retrieveQuotationFromInstallation(quotation.id)
        if (!ok) {
          toast({
            title: "Retrieve failed",
            description: "Could not clear installation release on the server.",
            variant: "destructive",
          })
          return
        }
      }
      setQuotations((prev) => prev.filter((q) => q.id !== quotation.id))
      toast({ title: "Retrieved", description: "Quotation moved back to Accounts." })
    } catch (error) {
      toast({
        title: "Retrieve failed",
        description: error instanceof ApiError ? error.message : apiErrorToUserMessage(error),
        variant: "destructive",
      })
    } finally {
      setRetrievingFromInstallationId(null)
    }
  }

  const confirmRevertInstallationToPending = async () => {
    if (!installRevertTarget) return
    const { id } = installRevertTarget
    setInstallRevertSaving(true)
    try {
      if (useApi) {
        try {
          await api.admin.quotations.revertInstallationToPending(id)
        } catch {
          await api.admin.quotations.updateOperationalStatus(id, "pending_installer")
        }
      }
      setInstallerQueueApprovedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setQuotations((prev) =>
        prev.map((q) =>
          q.id === id
            ? ({
                ...q,
                installationStatus: "pending_installer",
                installation_status: "pending_installer",
              } as InstallerQuotation)
            : q,
        ),
      )
      setExpandedQuotationId((prev) => (prev === id ? null : prev))
      setInstallRevertTarget(null)
      toast({ title: "Reverted", description: "Moved back to Pending Installation." })
    } catch (error) {
      toast({
        title: "Revert failed",
        description: error instanceof ApiError ? error.message : apiErrorToUserMessage(error),
        variant: "destructive",
      })
    } finally {
      setInstallRevertSaving(false)
    }
  }

  const toLocalUploadedFile = (file: File): InstallationUploadedFile => ({
    name: file.name,
    url: URL.createObjectURL(file),
    localFile: file,
  })

  const uploadInstallerFieldFiles = async (
    quotationId: string,
    fieldKey: InstallationImageFieldKey,
    files: File[],
  ) => {
    if (files.length === 0) {
      setUploadFilesByQuotation((prev) => ({
        ...prev,
        [quotationId]: {
          ...(prev[quotationId] || {}),
          [fieldKey]: [],
        },
      }))
      return
    }

    // Keep files local until Complete/Submit — per-field immediate upload hits Multer
    // "Unexpected or too many file fields" on backends that only allow installerCompletionImages + piUpload.
    setUploadFilesByQuotation((prev) => ({
      ...prev,
      [quotationId]: {
        ...(prev[quotationId] || {}),
        [fieldKey]: files.map(toLocalUploadedFile),
      },
    }))
  }

  const uploadInstallerPiFiles = async (quotationId: string, files: File[]) => {
    if (!files.length) return
    setPiUploadByQuotation((prev) => ({
      ...prev,
      [quotationId]: [...(prev[quotationId] || []), ...files.map(toLocalUploadedFile)],
    }))
  }

  const handleApproveInstallation = async (
    quotation: InstallerQuotation,
    mode: "full" | "partial" = "full",
  ) => {
    const isPartial = mode === "partial"
    const filesByField = uploadFilesByQuotation[quotation.id] || {}
    const requiredFields = INSTALLATION_IMAGE_FIELDS.filter((field) => isInstallationImageFieldRequired(field))
    const uploadedFiles = INSTALLATION_IMAGE_FIELDS.flatMap((field) => filesByField[field.key] || [])
    const notes = uploadNotes[quotation.id] || ""
    const dimensions = dimensionsByQuotation[quotation.id] || { length: "", width: "", height: "" }
    const piUploads = piUploadByQuotation[quotation.id] || []
    const rawExpenseLines = extraExpenseLinesByQuotation[quotation.id] || []
    const expenseLines = rawExpenseLines.filter((l) => l.description.trim() !== "" || l.amount.trim() !== "")

    if (uploadingAssetKey?.startsWith(`${quotation.id}:`)) {
      toast({
        title: "Upload in progress",
        description: "Wait for all completion files to finish uploading before saving.",
        variant: "destructive",
      })
      return
    }

    if (isPartial) {
      if (uploadedFiles.length === 0 && piUploads.length === 0) {
        toast({
          title: "Add files",
          description: "Add at least one photo or PI before marking Partial Approved.",
          variant: "destructive",
        })
        return
      }
    } else {
      const missingFields = requiredFields.filter(
        (field) => !(filesByField[field.key] && filesByField[field.key]!.length > 0),
      )
      if (missingFields.length > 0) {
        toast({
          title: "Images required",
          description: `Please upload all required images. Missing: ${missingFields.map((f) => f.label).join(", ")}.`,
          variant: "destructive",
        })
        return
      }
    }
    const backCm = dimensions.length.trim()
    const frontCm = dimensions.height.trim()
    const midCmRaw = dimensions.width.trim()
    const backN = backCm === "" ? undefined : parseFloat(backCm)
    const frontN = frontCm === "" ? undefined : parseFloat(frontCm)
    if (backCm !== "" && (!Number.isFinite(backN) || (backN as number) <= 0)) {
      toast({
        title: "Invalid back leg",
        description: "Back leg must be a valid number greater than zero, or leave it empty.",
        variant: "destructive",
      })
      return
    }
    if (frontCm !== "" && (!Number.isFinite(frontN) || (frontN as number) <= 0)) {
      toast({
        title: "Invalid front leg",
        description: "Front leg must be a valid number greater than zero, or leave it empty.",
        variant: "destructive",
      })
      return
    }
    let midN: number | undefined
    if (midCmRaw !== "") {
      midN = parseFloat(midCmRaw)
      if (!Number.isFinite(midN) || midN <= 0) {
        toast({
          title: "Invalid mid leg",
          description: "Mid leg must be a valid number greater than zero, or leave it empty.",
          variant: "destructive",
        })
        return
      }
    }
    if (
      expenseLines.some(
        (l) =>
          !l.amount.trim() ||
          Number.isNaN(parseFloat(l.amount)) ||
          parseFloat(l.amount) < 0,
      )
    ) {
      toast({
        title: "Extra expenses",
        description: "Each expense line with a description must have a valid amount (≥ 0).",
        variant: "destructive",
      })
      return
    }

    const cmToFeet = (cm: number) => Number((cm / CM_PER_FT).toFixed(4))

    setSavingId(quotation.id)
    let apiSaved = false
    let uploadErrorMessage: string | undefined
    try {
      if (useApi) {
        const formData = new FormData()
        // Backends that only allow `installerCompletionImages` + `piUpload` reject per-field
        // keys (`homeFrontPhoto`, …) with "Unexpected or too many file fields".
        const fieldOrder: string[] = []
        const retainedUrls: Record<string, string[]> = {}
        INSTALLATION_IMAGE_FIELDS.forEach((field) => {
          const fieldFiles = filesByField[field.key] || []
          const kept: string[] = []
          fieldFiles.forEach((file) => {
            if (file.localFile) {
              formData.append("installerCompletionImages", file.localFile)
              fieldOrder.push(field.key)
            } else if (file.url && !file.url.startsWith("blob:")) {
              kept.push(file.url)
            }
          })
          if (kept.length) retainedUrls[field.key] = kept
        })
        if (Object.keys(retainedUrls).length > 0) {
          formData.append("existingInstallationImageUrlsJson", JSON.stringify(retainedUrls))
        }
        if (fieldOrder.length > 0) {
          formData.append("installerCompletionImageFieldOrderJson", JSON.stringify(fieldOrder))
        }
        const existingPiUrls: string[] = []
        for (const pi of piUploads) {
          if (pi?.localFile) formData.append("piUpload", pi.localFile)
          else if (pi?.url && !pi.url.startsWith("blob:")) existingPiUrls.push(pi.url)
        }
        if (existingPiUrls.length === 1) {
          formData.append("existingPiUploadUrl", existingPiUrls[0])
        }
        if (existingPiUrls.length > 0) {
          formData.append("existingPiUploadUrlsJson", JSON.stringify(existingPiUrls))
        }
        if (expenseLines.length > 0) {
          const payload = expenseLines.map(({ description, amount }) => ({
            description: description.trim(),
            amount: parseFloat(amount),
          }))
          formData.append("extraExpensesJson", JSON.stringify(payload))
          formData.append(
            "extraExpensesTotal",
            String(payload.reduce((s, row) => s + (Number.isFinite(row.amount) ? row.amount : 0), 0)),
          )
        }
        formData.append("siteLength", backCm)
        formData.append("siteWidth", midCmRaw === "" ? "" : midCmRaw)
        formData.append("siteHeight", frontCm)
        if (backCm !== "") formData.append("backLegCm", backCm)
        if (midCmRaw !== "") formData.append("midLegCm", midCmRaw)
        if (frontCm !== "") formData.append("frontLegCm", frontCm)
        if (backN != null) formData.append("backLegFeet", String(cmToFeet(backN)))
        if (midN != null) formData.append("midLegFeet", String(cmToFeet(midN)))
        if (frontN != null) formData.append("frontLegFeet", String(cmToFeet(frontN)))
        formData.append("installerRemarks", notes)
        formData.append(
          "installationStatus",
          isPartial ? "installer_partial_approved" : "installer_approved",
        )
        formData.append("installation_partial_approved", isPartial ? "true" : "false")
        formData.append("force", "true")
        formData.append("allowFromPendingInstaller", "true")

        const currentInstallStatus = String(
          (quotation as any).installationStatus || (quotation as any).installation_status || "",
        )
          .trim()
          .toLowerCase()
        const needsStart =
          !currentInstallStatus ||
          currentInstallStatus === "pending_installer" ||
          currentInstallStatus === "pending"

        const runUpload = () => api.installer.uploadCompletionDocuments(quotation.id, formData)

        try {
          if (needsStart) {
            try {
              await api.admin.quotations.updateOperationalStatus(quotation.id, "installer_in_progress")
            } catch {
              /* installer JWT may not have admin route — upload with force flags */
            }
          }
          await runUpload()
        } catch (firstError) {
          const msg =
            firstError instanceof ApiError
              ? firstError.message
              : firstError instanceof Error
                ? firstError.message
                : String(firstError || "")
          if (!/upload not allowed for this quotation state/i.test(msg)) throw firstError
          try {
            await api.admin.quotations.updateOperationalStatus(quotation.id, "installer_in_progress")
          } catch {
            /* retry anyway */
          }
          await runUpload()
        }
        apiSaved = true

        let visitIdToPatch = (quotation as InstallerQuotation & { visitId?: string }).visitId
        if (!visitIdToPatch) {
          try {
            const visitResp = await api.visits.getByQuotation(quotation.id)
            const visitList = Array.isArray((visitResp as any)?.visits)
              ? (visitResp as any).visits
              : Array.isArray(visitResp)
                ? (visitResp as any[])
                : []
            visitIdToPatch = visitList[0]?.id
          } catch {
            visitIdToPatch = undefined
          }
        }
        if (visitIdToPatch) {
          const patchBody: Record<string, unknown> = { unit: "cm" }
          if (backN != null) {
            patchBody.length = backN
            patchBody.siteLength = backN
            patchBody.backLegFeet = cmToFeet(backN)
          }
          if (frontN != null) {
            patchBody.height = frontN
            patchBody.siteHeight = frontN
            patchBody.frontLegFeet = cmToFeet(frontN)
          }
          if (midN != null) {
            patchBody.width = midN
            patchBody.siteWidth = midN
            patchBody.midLegFeet = cmToFeet(midN)
          }
          try {
            await api.visits.patch(visitIdToPatch, patchBody)
            setQuotations((prev) =>
              prev.map((it) => (it.id === quotation.id ? { ...it, visitId: visitIdToPatch } : it)),
            )
          } catch {
            /* optional backend support */
          }
        }
      } else {
        apiSaved = true
      }
    } catch (err) {
      apiSaved = false
      uploadErrorMessage = apiErrorToUserMessage(err)
    } finally {
      setSavingId(null)
      const backNum = dimensions.length.trim() === "" ? undefined : parseFloat(dimensions.length)
      const frontNum = dimensions.height.trim() === "" ? undefined : parseFloat(dimensions.height)
      const midStr = dimensions.width.trim()
      const midNum = midStr === "" ? undefined : parseFloat(midStr)

      if (apiSaved) {
        setQuotations((prev) =>
          prev.map((it) => {
            if (it.id !== quotation.id) return it
            return {
              ...it,
              installationStatus: isPartial ? "installer_partial_approved" : "installer_approved",
              installation_status: isPartial ? "installer_partial_approved" : "installer_approved",
              installationPartialApproved: isPartial,
              installation_partial_approved: isPartial,
              ...(backNum != null && Number.isFinite(backNum)
                ? { length: backNum, siteLength: backNum, backLegFeet: cmToFeet(backNum) }
                : {}),
              ...(frontNum != null && Number.isFinite(frontNum)
                ? { height: frontNum, siteHeight: frontNum, frontLegFeet: cmToFeet(frontNum) }
                : {}),
              ...(midNum != null && Number.isFinite(midNum)
                ? { width: midNum, siteWidth: midNum, midLegFeet: cmToFeet(midNum) }
                : {}),
            }
          }),
        )
        if (!isPartial) {
          setInstallerQueueApprovedIds((prev) => new Set([...prev, quotation.id]))
        }
        setWorkflowMap((prev) => ({
          ...prev,
          [quotation.id]: {
            status: isPartial ? "inprogress" : "approved",
            notes,
            imageNames: [
              ...uploadedFiles.map((f) => f.name),
              ...piUploads.map((f) => f.name),
            ],
            updatedAt: new Date().toISOString(),
          },
        }))
        setExpandedQuotationId(null)
        setActiveTab(isPartial ? "partial" : "done")
        toast({
          title: isPartial ? "Partial Approved" : "Installation complete",
          description: isPartial
            ? "Saved under Partial Approved — finish remaining photos to move to Approved Installation."
            : "Moved to Approved Installation.",
        })
      } else if (useApi) {
        toast({
          title: "Upload failed",
          description:
            uploadErrorMessage ||
            "Could not save installation completion. Check the network response or ask the backend team to deploy POST /api/installer/quotations/{id}/documents.",
          variant: "destructive",
        })
      }
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AccessSwitchBar current="installation" title="Installation" />
      {getAccessOptions(access).length <= 1 ? (
        <header className="border-b border-border bg-card">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <button onClick={() => router.push("/")} className="flex items-center">
              <SolarLogo size="md" />
            </button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await logout()
                router.push("/")
              }}
              className="gap-2"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
        </header>
      ) : null}

      <main className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Wrench className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">
            {role === "installation-team" ? "Installation team" : "Installer Dashboard"}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {role === "installation-team" ? (
            <>
              Signed in as <span className="font-medium text-foreground">{installationTeamUser?.teamName || installationTeamUser?.username}</span>
              . You only see jobs assigned to your team by admin.
            </>
          ) : (
            <>
              Welcome, {installer?.firstName || "Installer"}. Process pending jobs, assign teams, and upload completion proof.
            </>
          )}
        </p>

        <div className="mb-3 w-full rounded-lg border border-border/70 bg-muted/30 p-1 flex flex-wrap gap-1">
          {(
            [
              { key: "all" as const, label: "All" },
              { key: "pending" as const, label: "Pending Installation" },
              { key: "partial" as const, label: "Partial Approved" },
              { key: "done" as const, label: "Approved Installation" },
            ] as const
          ).map((item) => (
            <Button
              key={item.key}
              type="button"
              size="sm"
              variant={activeTab === item.key ? "default" : "ghost"}
              className={cn("h-8", activeTab === item.key && "shadow-sm")}
              onClick={() => setActiveTab(item.key)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <DebouncedSearchInput
              placeholder="Search by name, mobile, email, or ID..."
              value={searchTerm}
              onDebouncedChange={setSearchTerm}
              className="pl-9"
              delayMs={200}
            />
          </div>
          {canManageInstallationTeams ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => setInstallationTeamsDialogOpen(true)}
            >
              <Users className="w-4 h-4 mr-2" />
              Installation teams
            </Button>
          ) : null}
        </div>
        {activeTab !== "done" ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mr-1">
              Overdue
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
                  activeClass: "bg-amber-400 text-amber-950 hover:bg-amber-400 border-amber-400",
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
                className={cn("h-7 text-xs", filterInstallOverdue === chip.key && chip.activeClass)}
                onClick={() => setFilterInstallOverdue((prev) => (prev === chip.key ? "all" : chip.key))}
              >
                {chip.label}
              </Button>
            ))}
          </div>
        ) : null}

        {canManageInstallationTeams ? (
          <InstallationTeamsDialog
            open={installationTeamsDialogOpen}
            onOpenChange={setInstallationTeamsDialogOpen}
            useApi={useApi}
            createdBy={installer?.username || installer?.firstName}
            onTeamsChanged={() => {
              setInstallationTeamsRefresh((n) => n + 1)
              void (async () => {
                const teams = await loadInstallationTeamsList(useApi)
                setInstallationTeams(teams)
                const teamIds = new Set(teams.map((t) => t.id))
                setQuotations((prev) =>
                  prev.map((q) => {
                    const tid = getInstallationTeamIdForQuotation(q.id, q as Record<string, unknown>)
                    if (tid && !teamIds.has(tid)) {
                      const next = { ...q } as InstallerQuotation
                      delete (next as Record<string, unknown>).installationTeamId
                      delete (next as Record<string, unknown>).installation_team_id
                      return next
                    }
                    return q
                  }),
                )
              })()
            }}
          />
        ) : null}

        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground text-center">
              Loading installer records...
            </CardContent>
          </Card>
        ) : activeInstallationList.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground text-center">
              No installer records found
            </CardContent>
          </Card>
        ) : (
          <div className="native-scroll-list max-h-[min(70vh,820px)] overflow-y-auto overscroll-y-contain">
            <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-sm">
              <table className="w-full min-w-[78rem] border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur supports-[backdrop-filter]:bg-muted/70">
                  <tr className="border-b border-border/70 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2.5 whitespace-nowrap">Customer</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Dealer</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Sent</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Install date</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Team</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Status</th>
                    <th className="px-3 py-2.5 whitespace-nowrap text-right md:sticky md:right-0 md:bg-muted/90 md:z-10 md:shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeInstallationList.map((q) => {
              const installerStatus = getInstallerStatus(q)
              const qAny = q as Record<string, unknown>
              const dealer = getDealerDisplay(q)
              const sentToInstallationAt =
                qAny.installationReleasedAt || qAny.installation_released_at || getAdminApprovedDate(q)
              const installationListDate =
                sentToInstallationAt ||
                qAny.approvedAt ||
                qAny.approvedDate ||
                qAny.statusUpdatedAt ||
                q.createdAt
              const sentBaseStr = installationListDate ? String(installationListDate) : ""
              const sentParsedOk = sentBaseStr ? !Number.isNaN(new Date(sentBaseStr).getTime()) : false
              const defaultInstallYmd = sentParsedOk ? addCalendarDaysFromDateString(sentBaseStr, 7) : ""
              const storedInstallYmd = toYmdFromStored(
                (qAny.installationScheduledAt || qAny.installation_scheduled_at) as string | undefined,
              )
              const installationDateInputValue = storedInstallYmd || defaultInstallYmd
              const overdueTone = installationOverdueTone(installationDateInputValue, installerStatus)
              const overdueUi = overdueRowClasses(overdueTone)
              const statusLabel = installerQueueStatusDisplayLabel(installerStatus)
              const revertFromInstallation = getAdminInstallationTabRevertState(
                q as Record<string, unknown>,
                installerStatus,
                readInstallerReleaseMap(),
              )
              const showExpanded = expandedQuotationId === q.id

              return (
                <Fragment key={q.id}>
                  <tr
                    className={cn("border-b border-border/50 transition-colors", overdueUi.row)}
                    title={overdueUi.title}
                  >
                    <td className="px-3 py-2.5 align-middle">
                      <div className="min-w-[11rem] max-w-[14rem]">
                        <p className="text-sm font-semibold leading-tight truncate">
                          {formatPersonName(q.customer?.firstName, q.customer?.lastName, "Unknown")}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {q.customer?.mobile || "No mobile"}
                        </p>
                        <p className="text-[10px] font-medium text-muted-foreground/90 truncate">{q.id}</p>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      <div className="min-w-[8.5rem] max-w-[11rem]">
                        <p className="text-xs font-medium leading-tight truncate text-primary" title={dealer.name}>
                          {dealer.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">{dealer.mobile}</p>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                      <p className="text-xs font-medium inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                        {installationListDate
                          ? new Date(installationListDate as string).toLocaleDateString("en-IN")
                          : "N/A"}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      <div className="min-w-[9.5rem]">
                        <Input
                          id={`install-date-${q.id}`}
                          type="date"
                          className="h-8 text-xs w-[9.5rem]"
                          value={installationDateInputValue}
                          disabled={!sentParsedOk || installationReadOnly}
                          onChange={(e) => {
                            const v = e.target.value
                            const id = q.id
                            setQuotations((prev) =>
                              prev.map((row) =>
                                row.id === id ? { ...row, installationScheduledAt: v || undefined } : row,
                              ),
                            )
                            setInstallationScheduledDateInLocalMap(id, v || undefined)
                            void (async () => {
                              if (!useApi) return
                              try {
                                await api.admin.quotations.updateInstallationScheduledDate(id, v || null)
                              } catch {
                                // local map already updated
                              }
                            })()
                          }}
                        />
                        {!sentParsedOk ? (
                          <p className="text-[10px] text-muted-foreground mt-0.5">Set release first</p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      {canManageInstallationTeams ? (
                        <Select
                          key={`inst-team-${q.id}-${installationTeamsRefresh}`}
                          value={getInstallationTeamIdForQuotation(q.id, qAny) || "__none__"}
                          onValueChange={(v) =>
                            void handlePersistInstallationTeamAssignment(q.id, v === "__none__" ? "" : v)
                          }
                          disabled={installationReadOnly}
                        >
                          <SelectTrigger className="h-8 text-xs w-[9.5rem]">
                            <SelectValue placeholder="Unassigned" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Unassigned</SelectItem>
                            {installationTeams.map((t) => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-xs font-medium">{getTeamDisplayName(q)}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] capitalize font-medium", installerStageBadgeTone(installerStatus))}
                      >
                        {statusLabel}
                      </Badge>
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 align-middle text-right md:sticky md:right-0 md:z-10 md:shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]",
                        overdueUi.sticky,
                      )}
                    >
                      <div className="flex flex-nowrap items-center justify-end gap-1.5">
                        {installerStatus === "pending" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 shrink-0 p-0"
                              title="Start"
                              disabled={installationReadOnly}
                              onClick={() => startInstallationInProgress(q)}
                            >
                              <Clock3 className="w-3.5 h-3.5" />
                              <span className="sr-only">Start</span>
                            </Button>
                            <Button
                              size="sm"
                              className="h-8 w-8 shrink-0 p-0"
                              title="Upload"
                              disabled={installationReadOnly}
                              onClick={() => openUploadPanel(q)}
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                              <span className="sr-only">Upload</span>
                            </Button>
                          </>
                        ) : null}
                        {installerStatus === "inprogress" || installerStatus === "partial" ? (
                          <Button
                            size="sm"
                            className="h-8 w-8 shrink-0 p-0"
                            title={installerStatus === "partial" ? "Continue" : "Upload"}
                            disabled={installationReadOnly}
                            onClick={() => openUploadPanel(q)}
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                            <span className="sr-only">{installerStatus === "partial" ? "Continue" : "Upload"}</span>
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 shrink-0 p-0"
                          title="Timeline"
                          onClick={() => setStatusHistoryQuotation(q)}
                        >
                          <History className="w-3.5 h-3.5" />
                          <span className="sr-only">Timeline</span>
                        </Button>
                        {installerStatus !== "approved" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={cn(
                              "h-8 w-8 shrink-0 p-0 border-amber-800/40 text-amber-950 dark:text-amber-100",
                              !revertFromInstallation.enabled || retrievingFromInstallationId === q.id
                                ? "opacity-60"
                                : "",
                            )}
                            title={revertFromInstallation.hint || "Revert to Accounts"}
                            disabled={
                              installationReadOnly ||
                              !revertFromInstallation.enabled ||
                              retrievingFromInstallationId === q.id
                            }
                            onClick={() => void handleRetrieveFromInstallation(q)}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span className="sr-only">Revert</span>
                          </Button>
                        ) : null}
                        {installerStatus === "approved" || installerStatus === "partial" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 shrink-0 p-0"
                            title="View uploaded installation photos"
                            onClick={() => openInstallPhotosViewer(q)}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="sr-only">View photos</span>
                          </Button>
                        ) : null}
                        {installerStatus === "approved" ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-8 w-8 shrink-0 p-0"
                              title="Edit"
                              disabled={installationReadOnly}
                              onClick={() => openUploadPanel(q)}
                            >
                              <Edit className="w-3.5 h-3.5" />
                              <span className="sr-only">Edit</span>
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 shrink-0 p-0 border-amber-800/40 text-amber-950 dark:text-amber-100"
                              title="Revert"
                              disabled={installationReadOnly}
                              onClick={() =>
                                setInstallRevertTarget({
                                  id: q.id,
                                  label: formatPersonName(q.customer?.firstName, q.customer?.lastName, q.id),
                                })
                              }
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span className="sr-only">Revert</span>
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {showExpanded ? (
                    <tr className="border-b border-border/50 bg-muted/15">
                      <td colSpan={7} className="px-3 py-4">
                        <InstallationCompletionPanel
                          loadingText={loadingDetailsForId === q.id ? "Loading full customer/quotation details..." : undefined}
                          imageFields={INSTALLATION_IMAGE_FIELDS}
                          filesByField={uploadFilesByQuotation[q.id] || {}}
                          onFilesChange={(fieldKey, files) =>
                            uploadInstallerFieldFiles(q.id, fieldKey as InstallationImageFieldKey, files)
                          }
                          piFiles={piUploadByQuotation[q.id] || []}
                          onPiFilesChange={(files) => void uploadInstallerPiFiles(q.id, files)}
                          onRemovePiFile={(index) =>
                            setPiUploadByQuotation((prev) => ({
                              ...prev,
                              [q.id]: (prev[q.id] || []).filter((_, i) => i !== index),
                            }))
                          }
                          uploadingKey={
                            uploadingAssetKey?.startsWith(`${q.id}:`)
                              ? uploadingAssetKey.slice(`${q.id}:`.length)
                              : null
                          }
                          extraExpenses={extraExpenseLinesByQuotation[q.id] || []}
                          onAddExpense={() =>
                            setExtraExpenseLinesByQuotation((prev) => ({
                              ...prev,
                              [q.id]: [...(prev[q.id] || []), { id: newExpenseLineId(), description: "", amount: "" }],
                            }))
                          }
                          onExpenseChange={(id, patch) =>
                            setExtraExpenseLinesByQuotation((prev) => ({
                              ...prev,
                              [q.id]: (prev[q.id] || []).map((line) => (line.id === id ? { ...line, ...patch } : line)),
                            }))
                          }
                          onRemoveExpense={(id) =>
                            setExtraExpenseLinesByQuotation((prev) => ({
                              ...prev,
                              [q.id]: (prev[q.id] || []).filter((line) => line.id !== id),
                            }))
                          }
                          dimensions={dimensionsByQuotation[q.id] || { length: "", width: "", height: "" }}
                          onDimensionsChange={(next) =>
                            setDimensionsByQuotation((prev) => ({
                              ...prev,
                              [q.id]: {
                                ...(prev[q.id] || { length: "", width: "", height: "" }),
                                ...(next.length !== undefined ? { length: next.length } : {}),
                                ...(next.width !== undefined ? { width: next.width } : {}),
                                ...(next.height !== undefined ? { height: next.height } : {}),
                              },
                            }))
                          }
                          notes={uploadNotes[q.id] || ""}
                          onNotesChange={(value) => setUploadNotes((prev) => ({ ...prev, [q.id]: value }))}
                          infoSections={[
                            {
                              title: "Customer Details",
                              rows: getCustomerInfoRows(q).map((row) => ({ label: row.label, value: String(row.value) })),
                              emptyText: "No customer details available.",
                            },
                            {
                              title: "Visitor / Location Details",
                              rows: [...getVisitorDetailsRows(q), ...getVisitorLegRows(q, dimensionsByQuotation[q.id])].map(
                                (row) => ({
                                  label: row.label,
                                  value:
                                    row.label === "Location Link" ? (
                                      <a
                                        href={String(row.value)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-medium text-right text-primary hover:underline break-all"
                                      >
                                        {String(row.value)}
                                      </a>
                                    ) : (
                                      String(row.value)
                                    ),
                                }),
                              ),
                              emptyText: "No visitor/location details available.",
                            },
                            {
                              title: "Product Specification",
                              rows: getProductSpecRows(q).map((row) => ({ label: row.label, value: String(row.value) })),
                              emptyText: "No product specification available.",
                            },
                          ]}
                          saveLabel={installerStatus === "approved" ? "Save changes" : "Complete & Mark as Approved"}
                          secondarySaveLabel={
                            installerStatus === "approved" ? undefined : "Partial Approved"
                          }
                          saving={savingId === q.id}
                          readOnly={installationReadOnly}
                          onCancel={() => setExpandedQuotationId(null)}
                          onSave={() => void handleApproveInstallation(q, "full")}
                          onSecondarySave={() => void handleApproveInstallation(q, "partial")}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <InstallationStatusTimelineDialog
          open={!!statusHistoryQuotation}
          onOpenChange={(open) => !open && setStatusHistoryQuotation(null)}
          quotationId={statusHistoryQuotation?.id}
          createdAt={statusHistoryQuotation?.createdAt}
          fileLoginAt={(statusHistoryQuotation as Record<string, unknown>)?.fileLoginAt as string | undefined}
          statusApprovedAt={(statusHistoryQuotation as Record<string, unknown>)?.statusApprovedAt as string | undefined}
          status={statusHistoryQuotation?.status}
          statusHistory={(statusHistoryQuotation as Record<string, unknown>)?.statusHistory as import("@/lib/quotation-context").StatusHistoryEntry[] | undefined}
        />
        <InstallationPhotosViewerDialog
          open={!!installPhotosViewer}
          onOpenChange={(open) => {
            if (!open) {
              setInstallPhotosViewer(null)
              setInstallPhotoUrls([])
              setInstallPhotosLoading(false)
            }
          }}
          quotationId={installPhotosViewer?.id}
          title={
            installPhotosViewer
              ? `${formatPersonName(
                  installPhotosViewer.customer?.firstName,
                  installPhotosViewer.customer?.lastName,
                  "Customer",
                )} · ${installPhotosViewer.id}`
              : undefined
          }
          photoUrls={installPhotoUrls}
          loading={installPhotosLoading}
        />
        <Dialog open={!!installRevertTarget} onOpenChange={(open) => !open && setInstallRevertTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Revert to pending installation?</DialogTitle>
              <DialogDescription>
                {installRevertTarget ? (
                  <>
                    <span className="font-medium text-foreground">{installRevertTarget.label}</span> will move back to{" "}
                    <strong>Pending Installation</strong>.
                  </>
                ) : null}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setInstallRevertTarget(null)} disabled={installRevertSaving}>
                Cancel
              </Button>
              <Button type="button" variant="default" onClick={() => void confirmRevertInstallationToPending()} disabled={installRevertSaving}>
                {installRevertSaving ? "Reverting…" : "Yes, revert"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
