"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { api, ApiError } from "@/lib/api"
import { getRealtime } from "@/lib/realtime"
import { SolarLogo } from "@/components/solar-logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Upload, LogOut, Users, FileSpreadsheet, Eye, Loader2, Search, UserRoundPlus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { AccessSwitchBar } from "@/components/access-switch-bar"
import {
  canOpenSection,
  getAccessOptions,
  getPostLoginPath,
  listedUserHasAccess,
  resolveUserAccess,
  type UserAccessKey,
} from "@/lib/user-access"
import {
  buildCallingActionsQueryDates,
  formatYmdLocal,
  getCustomBoundsFromYmd,
  getPresetBounds,
} from "@/lib/calling-report-date-range"
import {
  HR_UPLOAD_COUNT_LEGEND,
  getHrLeadRowDisplay,
  resolveHrUploadBatchCounts,
} from "@/lib/hr-upload-lead-display"
import {
  buildCallingActionSummary,
  buildCallingConnectionSummary,
  classifyCallingConnection,
} from "@/lib/calling-action-summary"
import { filterActiveDealers } from "@/lib/active-dealers"
import { listAssignableQuotationFromDirectory } from "@/lib/quotation-assignable-directory"
import { HrSocialMediaSheetsPanel } from "@/components/hr-social-media-sheets-panel"

type DealerOption = {
  id: string
  firstName: string
  lastName: string
  mobile: string
  email: string
  isActive: boolean
  username?: string
  role?: string
  access: UserAccessKey[]
}

/** Dealers eligible for HR lead pools: active + Quotation access checked (Admin Users). */
function hasQuotationAccessForLeadPool(dealer: DealerOption): boolean {
  return listedUserHasAccess(
    {
      username: dealer.username,
      role: dealer.role || "dealer",
      access: dealer.access,
      isActive: dealer.isActive,
    },
    "quotation",
  )
}

function pickUserRows(response: any): any[] {
  if (Array.isArray(response)) return response
  if (Array.isArray(response?.dealers)) return response.dealers
  if (Array.isArray(response?.visitors)) return response.visitors
  if (Array.isArray(response?.accountManagers)) return response.accountManagers
  if (Array.isArray(response?.items)) return response.items
  if (Array.isArray(response?.data?.dealers)) return response.data.dealers
  if (Array.isArray(response?.data?.visitors)) return response.data.visitors
  if (Array.isArray(response?.data?.accountManagers)) return response.data.accountManagers
  if (Array.isArray(response?.data?.items)) return response.data.items
  if (Array.isArray(response?.data)) return response.data
  return []
}

type ParsedCsvRow = {
  name: string
  mobile: string
  altMobile?: string
  kNumber?: string
  address?: string
  customerNote?: string
  city?: string
  state?: string
  assignedDealerId?: string
  assignedDealerName?: string
  assignmentStatus?: string
  raw: Record<string, string>
}

type CallingActionRecord = {
  id: string
  leadId: string
  dealerId: string
  dealerName: string
  customerName: string
  customerMobile: string
  customerAddress: string
  action: string
  callRemark: string
  actionAt: string
  nextFollowUpAt?: string
}

type UploadedLeadBatch = {
  id: string
  uploadedAt: string
  fileName: string
  rowCount: number
  assignedCount: number
  unassignedCount: number
  completedCount: number
  /** Display names for the eligible dealer pool on this upload. */
  dealers: string[]
  /** Dealer IDs in the eligible pool (when API provides them). */
  dealerIds: string[]
  rows: ParsedCsvRow[]
}

type GlobalMobileSearchHit = ParsedCsvRow & {
  uploadId?: string
  fileName?: string
  uploadedAt?: string
}

const extractUploadedLeadBatchesList = (response: unknown): any[] => {
  if (!response) return []
  if (Array.isArray(response)) return response

  const root = response as Record<string, unknown>
  const nested = root.data
  if (Array.isArray(nested)) return nested
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const inner = nested as Record<string, unknown>
    for (const key of ["uploads", "batches", "items", "results", "callingUploads", "calling_uploads"]) {
      if (Array.isArray(inner[key])) return inner[key] as any[]
    }
  }

  for (const key of ["uploads", "batches", "items", "results", "callingUploads", "calling_uploads"]) {
    if (Array.isArray(root[key])) return root[key] as any[]
  }

  return []
}

/** Per-dealer open-lead cap sent on upload (backend Zod max is 50). Keep at 1 — same as earlier working assign. */
const DEFAULT_ACTIVE_LIMIT = 1
/**
 * Upload uses active_cap (proven backend path). Drain leftover Unassigned via
 * Manage dealers → replace pool + assign-unassigned API. Do NOT send
 * round_robin_all on upload (oversized limits → "expected number to be <=50").
 */
const HR_UPLOAD_ASSIGNMENT_MODE = "active_cap" as const

const ACTION_LABEL_MAP: Record<string, string> = {
  called: "Called",
  follow_up: "Follow Up",
  not_interested: "Not Interested",
  interested: "Interested",
}

const normalizeHeaderKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "")

const parseDelimitedLine = (line: string, delimiter: string): string[] => {
  const cols: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === delimiter && !inQuotes) {
      cols.push(current.trim())
      current = ""
      continue
    }
    current += ch
  }
  cols.push(current.trim())
  return cols
}

const getFromRaw = (raw: Record<string, string>, aliases: string[]) => {
  for (const alias of aliases) {
    const value = raw[normalizeHeaderKey(alias)]
    if (value) return value
  }
  return ""
}

const normalizeMobile = (value: string) => {
  const digits = value.replace(/\D/g, "")
  return digits.length > 10 ? digits.slice(-10) : digits
}

const splitCityState = (value: string) => {
  if (!value) return { city: "", state: "" }
  const parts = value
    .split("/")
    .join(",")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return { city: "", state: "" }
  if (parts.length === 1) return { city: parts[0], state: "" }
  return { city: parts[0], state: parts[parts.length - 1] }
}

const parseCallRemarkParts = (remark: string) => {
  const text = (remark || "").trim()
  if (!text) return { statusCategory: "", status: "", remark: "" }
  // Supports: [category] Status | free remark
  const m = text.match(/^\[([^\]]+)\]\s*([^|]*?)\s*(?:\|\s*(.*))?$/)
  if (!m) return { statusCategory: "", status: "", remark: text }
  return {
    statusCategory: (m[1] || "").trim(),
    status: (m[2] || "").trim(),
    remark: (m[3] || "").trim(),
  }
}

const parseActionDate = (value?: string) => {
  if (!value) return null
  const raw = String(value).trim()
  if (!raw) return null

  // Epoch support (seconds / milliseconds)
  if (/^\d{10,13}$/.test(raw)) {
    const n = Number(raw)
    const ms = raw.length === 10 ? n * 1000 : n
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d
  }

  // Native parse for ISO / common formats
  let d = new Date(raw)
  if (!Number.isNaN(d.getTime())) return d

  // MySQL-like "YYYY-MM-DD HH:mm:ss"
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw)) {
    d = new Date(raw.replace(" ", "T"))
    if (!Number.isNaN(d.getTime())) return d
  }

  // Indian UI-like "DD/MM/YYYY, HH:mm:ss"
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (m) {
    const dd = Number(m[1])
    const mm = Number(m[2]) - 1
    const yyyy = Number(m[3])
    const hh = Number(m[4] || 0)
    const mi = Number(m[5] || 0)
    const ss = Number(m[6] || 0)
    d = new Date(yyyy, mm, dd, hh, mi, ss)
    if (!Number.isNaN(d.getTime())) return d
  }

  return null
}

const normalizeName = (value?: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")

export default function HrDashboardPage() {
  const router = useRouter()
  const { isAuthenticated, role, logout, access } = useAuth()
  const { toast } = useToast()
  const [dealers, setDealers] = useState<DealerOption[]>([])
  const [selectedDealerIds, setSelectedDealerIds] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<ParsedCsvRow[]>([])
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvFileName, setCsvFileName] = useState("")
  const [isLoadingDealers, setIsLoadingDealers] = useState(false)
  const [isAssigning, setIsAssigning] = useState(false)
  const [activeTab, setActiveTab] = useState("assignment")
  const [realtimeTick, setRealtimeTick] = useState(0)
  const [uploadedLeadBatches, setUploadedLeadBatches] = useState<UploadedLeadBatch[]>([])
  const [isLoadingUploadedBatches, setIsLoadingUploadedBatches] = useState(false)
  const [uploadedBatchesLoadError, setUploadedBatchesLoadError] = useState<string | null>(null)
  const [addDealersBatch, setAddDealersBatch] = useState<UploadedLeadBatch | null>(null)
  const [addDealerIds, setAddDealerIds] = useState<string[]>([])
  const [isSavingDealers, setIsSavingDealers] = useState(false)
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false)
  const [activeBatch, setActiveBatch] = useState<UploadedLeadBatch | null>(null)
  const [activeBatchRows, setActiveBatchRows] = useState<ParsedCsvRow[]>([])
  const [activeBatchPage, setActiveBatchPage] = useState(1)
  const [activeBatchLimit, setActiveBatchLimit] = useState(50)
  const [activeBatchTotalRows, setActiveBatchTotalRows] = useState(0)
  const [isLoadingBatchRows, setIsLoadingBatchRows] = useState(false)
  const [batchMobileQuery, setBatchMobileQuery] = useState("")
  const [globalMobileQuery, setGlobalMobileQuery] = useState("")
  const [globalMobileHits, setGlobalMobileHits] = useState<GlobalMobileSearchHit[]>([])
  const [isSearchingGlobalMobile, setIsSearchingGlobalMobile] = useState(false)
  const [globalMobileSearchError, setGlobalMobileSearchError] = useState<string | null>(null)
  const [globalMobileSearched, setGlobalMobileSearched] = useState(false)
  const [callingActions, setCallingActions] = useState<CallingActionRecord[]>([])
  const [callingRange, setCallingRange] = useState<
    "daily" | "weekly" | "monthly" | "last_month" | "custom" | "all"
  >("daily")
  const [callingCustomFromDate, setCallingCustomFromDate] = useState("")
  const [callingCustomToDate, setCallingCustomToDate] = useState("")
  const [callingDealerFilter, setCallingDealerFilter] = useState("all")
  const [callingActionsUnavailable, setCallingActionsUnavailable] = useState(false)
  const useApi = process.env.NEXT_PUBLIC_USE_API !== "false"

  const normalizeDealerList = (list: any[]): DealerOption[] => {
    const byUsername = new Map<string, DealerOption>()
    const orphans: DealerOption[] = []

    const score = (d: DealerOption) => {
      let s = 0
      if (hasQuotationAccessForLeadPool(d)) s += 10
      if (d.firstName || d.lastName) s += 2
      if (d.mobile) s += 1
      if (d.email) s += 1
      return s
    }

    for (const d of list) {
      if (!d?.id) continue
      const username = String(d.username || d.userName || "")
        .trim()
        .replace(/@+$/, "")
      const role = String(d.role || d.sourceRole || "").trim()
      const access = resolveUserAccess({
        username,
        role: role || (d.sourceRole === "visitor" || role === "visitor" ? "visitor" : "dealer"),
        access: d.access,
        permissions: d.permissions,
      })
      const row: DealerOption = {
        id: String(d.id),
        firstName: d.firstName || "",
        lastName: d.lastName || "",
        mobile: d.mobile || "",
        email: d.email || "",
        isActive: d.isActive !== false,
        username: username || undefined,
        role: role || undefined,
        access,
      }

      const key = username.toLowerCase()
      if (!key) {
        orphans.push(row)
        continue
      }
      const prev = byUsername.get(key)
      if (!prev || score(row) >= score(prev)) byUsername.set(key, row)
    }

    const result = Array.from(byUsername.values())
    const usedIds = new Set(result.map((d) => d.id))
    for (const row of orphans) {
      if (usedIds.has(row.id)) continue
      usedIds.add(row.id)
      result.push(row)
    }
    return result
  }

  const getLocalDealers = (): DealerOption[] => {
    const localDealers = JSON.parse(localStorage.getItem("dealers") || "[]")
    const localVisitors = JSON.parse(localStorage.getItem("visitors") || "[]").map((v: any) => ({
      ...v,
      role: v.role || "visitor",
      sourceRole: "visitor",
    }))
    const localOps = JSON.parse(localStorage.getItem("accountManagers") || "[]")
    return filterActiveDealers(
      normalizeDealerList([...localDealers, ...localVisitors, ...localOps, ...listAssignableQuotationFromDirectory()]),
    ).filter(hasQuotationAccessForLeadPool)
  }

  /** All active users with Quotation checkbox — dealers + visitors + ops (not dealers table only). */
  const getAllDealersFromAdmin = async (): Promise<DealerOption[]> => {
    const pageSize = 200
    const merged: any[] = []

    const pushRows = (rows: any[], sourceRole?: string) => {
      for (const row of rows) {
        if (!row?.id && !row?.username) continue
        merged.push({
          ...row,
          id: row.id || row.username,
          role: row.role || sourceRole,
          sourceRole: sourceRole || row.role,
          isActive: row.isActive !== false,
        })
      }
    }

    const loadPagedDealers = async () => {
      let page = 1
      let totalPages = Number.POSITIVE_INFINITY
      while (page <= totalPages && page <= 100) {
        const response = await api.hr.dealers.getAll({ page, limit: pageSize, isActive: true })
        const list = pickUserRows(response)
        const before = merged.length
        pushRows(list, "dealer")
        const responseTotalPages = Number(
          response?.pagination?.totalPages ||
            response?.meta?.totalPages ||
            response?.data?.pagination?.totalPages ||
            0,
        )
        if (responseTotalPages > 0) totalPages = responseTotalPages
        if (list.length < pageSize && !Number.isFinite(totalPages)) break
        if (list.length === 0) break
        if (merged.length === before && page > 1) break
        page += 1
      }
    }

    await loadPagedDealers()

    // Soft-merge every source that can carry Quotation-checkbox users (visitor-kind like Jagdish)
    await Promise.all([
      (async () => {
        try {
          const res = await api.admin.visitors.getAll({ isActive: true, limit: 1000 } as any)
          pushRows(pickUserRows(res), "visitor")
        } catch {
          /* HR token may 403 */
        }
      })(),
      (async () => {
        try {
          const res = await api.admin.accountManagers.getAll({ page: 1, limit: 1000 } as any)
          pushRows(pickUserRows(res), "account-management")
        } catch {
          /* ignore */
        }
      })(),
      (async () => {
        try {
          // Dealer-facing visitors list (often allowed for multi-access HR+Quotation)
          const res = await api.dealers.getVisitors({ isActive: true } as any)
          pushRows(pickUserRows(res), "visitor")
        } catch {
          /* ignore */
        }
      })(),
    ])

    // Local caches + Admin-synced Quotation directory (same browser)
    try {
      pushRows(JSON.parse(localStorage.getItem("visitors") || "[]"), "visitor")
    } catch {
      /* ignore */
    }
    try {
      pushRows(JSON.parse(localStorage.getItem("dealers") || "[]"), "dealer")
    } catch {
      /* ignore */
    }
    try {
      pushRows(JSON.parse(localStorage.getItem("accountManagers") || "[]"), "account-management")
    } catch {
      /* ignore */
    }

    pushRows(
      listAssignableQuotationFromDirectory().map((u) => ({
        id: u.id,
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        mobile: u.mobile,
        isActive: u.isActive !== false,
        role: u.role || "visitor",
        access: u.access,
        permissions: u.access,
      })),
      "directory",
    )

    return filterActiveDealers(normalizeDealerList(merged)).filter(hasQuotationAccessForLeadPool)
  }

  const normalizeCallingAction = (item: any, fallbackDealers: DealerOption[], index: number): CallingActionRecord => {
    const dealerId = item?.dealerId || item?.assignedDealerId || item?.dealer?.id || ""
    const fallbackDealer = fallbackDealers.find((d) => d.id === dealerId)
    const dealerNameFromObject =
      item?.dealerName ||
      item?.assignedDealerName ||
      (item?.dealer ? `${item.dealer.firstName || ""} ${item.dealer.lastName || ""}`.trim() : "")
    const dealerName =
      dealerNameFromObject || (fallbackDealer ? `${fallbackDealer.firstName} ${fallbackDealer.lastName}` : "Unknown Employee")
    const actionAt = item?.actionAt || item?.updatedAt || item?.createdAt || ""
    const leadId = item?.leadId || item?.lead?.id || item?.id || ""
    const rawAddress =
      item?.address ||
      item?.customerAddress ||
      item?.lead?.address ||
      item?.customer?.address ||
      ""
    const compactAddress = String(rawAddress)
      .replace(/\s+/g, " ")
      .replace(/,\s*,+/g, ", ")
      .trim()
    return {
      id: item?.id || `${leadId || "lead"}-${actionAt || "na"}-${index}`,
      leadId,
      dealerId,
      dealerName,
      customerName:
        item?.name ||
        item?.customerName ||
        item?.lead?.name ||
        `${item?.customer?.firstName || ""} ${item?.customer?.lastName || ""}`.trim(),
      customerMobile: item?.mobile || item?.customerMobile || item?.lead?.mobile || item?.customer?.mobile || "",
      customerAddress: compactAddress,
      action: item?.action || item?.status || "unknown",
      callRemark: item?.callRemark || item?.remark || "",
      actionAt,
      nextFollowUpAt: item?.nextFollowUpAt,
    }
  }

  const normalizeBatchRows = (rows: any[]): ParsedCsvRow[] => {
    if (!Array.isArray(rows)) return []
    return rows.map((row: any) => {
      const raw = row?.raw && typeof row.raw === "object" ? row.raw : {}
      const assignedDealerId =
        row?.assignedDealerId ||
        row?.assigned_dealer_id ||
        row?.dealerId ||
        row?.dealer_id ||
        ""
      const assignedDealerNameRaw =
        row?.assignedDealerName ||
        row?.assigned_dealer_name ||
        row?.dealerName ||
        row?.dealer_name ||
        row?.assignedTo ||
        row?.assigned_to ||
        ""
      const assignmentStatusRaw =
        row?.assignmentStatus ||
        row?.assignment_status ||
        row?.status ||
        row?.leadStatus ||
        row?.lead_status ||
        ""
      return {
        name: row?.name || row?.customerName || "",
        mobile: normalizeMobile(String(row?.mobile || row?.customerMobile || "")),
        altMobile: normalizeMobile(String(row?.altMobile || row?.alternateMobile || "")),
        kNumber: row?.kNumber || row?.kno || "",
        address: row?.address || row?.customerAddress || "",
        customerNote: row?.customerNote || row?.note || "",
        city: row?.city || "",
        state: row?.state || "",
        assignedDealerId: assignedDealerId || undefined,
        assignedDealerName: assignedDealerNameRaw || undefined,
        assignmentStatus: assignmentStatusRaw || undefined,
        raw,
      }
    })
  }

  const normalizeUploadedLeadBatch = (item: any, fallbackDealers: DealerOption[], index: number): UploadedLeadBatch => {
    const fallbackRows = item?.rows || item?.leads || item?.items || []
    const rows = normalizeBatchRows(fallbackRows).map((row) => {
      const byId = row.assignedDealerId ? fallbackDealers.find((d) => d.id === row.assignedDealerId) : undefined
      const dealerName = row.assignedDealerName || (byId ? `${byId.firstName} ${byId.lastName}`.trim() : "")
      return {
        ...row,
        assignedDealerName: dealerName || undefined,
      }
    })
    const dealerValues: unknown[] = Array.isArray(item?.dealers)
      ? item.dealers
      : Array.isArray(item?.dealerIds)
        ? item.dealerIds
        : Array.isArray(item?.assignedDealers)
          ? item.assignedDealers
          : item?.dealerId
            ? [item.dealerId]
            : []

    const dealerIdSet = new Set<string>()
    const normalizedDealers: string[] = []

    for (const value of dealerValues) {
      if (typeof value === "string") {
        const dealer = fallbackDealers.find((d) => d.id === value)
        if (dealer) {
          dealerIdSet.add(dealer.id)
          const name = `${dealer.firstName} ${dealer.lastName}`.trim()
          if (name && !normalizedDealers.includes(name)) normalizedDealers.push(name)
        } else {
          // May be a bare name when API only returns display names
          const byName = fallbackDealers.find(
            (d) => normalizeName(`${d.firstName} ${d.lastName}`) === normalizeName(value),
          )
          if (byName) {
            dealerIdSet.add(byName.id)
            const name = `${byName.firstName} ${byName.lastName}`.trim()
            if (name && !normalizedDealers.includes(name)) normalizedDealers.push(name)
          } else if (value.trim() && !normalizedDealers.includes(value.trim())) {
            normalizedDealers.push(value.trim())
          }
        }
        continue
      }
      if (value && typeof value === "object") {
        const obj = value as Record<string, unknown>
        const id = String(obj.id || obj.dealerId || obj.dealer_id || "").trim()
        const fullName =
          `${obj.firstName || ""} ${obj.lastName || ""}`.trim() ||
          String(obj.name || "").trim()
        if (id) dealerIdSet.add(id)
        else if (fullName) {
          const byName = fallbackDealers.find(
            (d) => normalizeName(`${d.firstName} ${d.lastName}`) === normalizeName(fullName),
          )
          if (byName) dealerIdSet.add(byName.id)
        }
        if (fullName && !normalizedDealers.includes(fullName)) normalizedDealers.push(fullName)
        else if (id) {
          const dealer = fallbackDealers.find((d) => d.id === id)
          const name = dealer ? `${dealer.firstName} ${dealer.lastName}`.trim() : id
          if (name && !normalizedDealers.includes(name)) normalizedDealers.push(name)
        }
      }
    }

    // Also accept explicit dealerIds array alongside dealers[]
    if (Array.isArray(item?.dealerIds)) {
      for (const rawId of item.dealerIds) {
        const id = String(rawId || "").trim()
        if (id) dealerIdSet.add(id)
      }
    }

    const rowCountFromApi = Number(item?.rowCount || item?.totalRows || item?.count || 0)
    const resolvedCounts = resolveHrUploadBatchCounts(rows, rowCountFromApi, item)

    return {
      id: item?.id || item?.batchId || item?.uploadId || `batch-${index}`,
      uploadedAt: item?.uploadedAt || item?.createdAt || item?.updatedAt || new Date().toISOString(),
      fileName: item?.fileName || item?.originalFileName || item?.csvFileName || "uploaded.csv",
      rowCount: resolvedCounts.rowCount,
      assignedCount: resolvedCounts.assigned,
      unassignedCount: resolvedCounts.unassigned,
      completedCount: resolvedCounts.completed,
      dealers: normalizedDealers,
      dealerIds: Array.from(dealerIdSet),
      rows,
    }
  }

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login")
      return
    }
    if (role !== "hr" && !canOpenSection(access, role, "hr")) {
      router.push(getPostLoginPath(access.length ? access : []))
    }
  }, [isAuthenticated, role, access, router])

  useEffect(() => {
    const loadDealers = async () => {
      setIsLoadingDealers(true)
      try {
        if (useApi) {
          // Use backend dealer directory as single source of truth (same as Admin).
          const loadedDealers = await getAllDealersFromAdmin()
          setDealers(loadedDealers)
        } else {
          setDealers(getLocalDealers())
        }
      } catch {
        setDealers([])
        toast({
          title: "Failed to load dealers",
          description: "Could not load dealer list from API for assignment.",
          variant: "destructive",
        })
      } finally {
        setIsLoadingDealers(false)
      }
    }
    loadDealers()
  }, [toast, useApi, realtimeTick])

  useEffect(() => {
    // Keep selected IDs valid when dealer directory refreshes (Quotation access only).
    setSelectedDealerIds((prev) =>
      prev.filter((id) => {
        const d = dealers.find((x) => x.id === id)
        return Boolean(d && d.isActive === true && hasQuotationAccessForLeadPool(d))
      }),
    )
  }, [dealers])

  useEffect(() => {
    const loadUploadedLeadBatches = async () => {
      if (!useApi) {
        setUploadedLeadBatches([])
        setUploadedBatchesLoadError(null)
        return
      }
      setIsLoadingUploadedBatches(true)
      setUploadedBatchesLoadError(null)
      try {
        const response = await api.hr.uploadedLeads.getAll({ limit: 200 })
        const source = extractUploadedLeadBatchesList(response)
        const normalized = source.map((item: any, index: number) => normalizeUploadedLeadBatch(item, dealers, index))
        const sorted = normalized.sort(
          (a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime(),
        )
        setUploadedLeadBatches(sorted)
      } catch (error) {
        setUploadedLeadBatches([])
        const message =
          error instanceof ApiError
            ? error.details?.[0]?.message || error.message
            : error instanceof Error
              ? error.message
              : "Failed to load uploaded lead data."
        setUploadedBatchesLoadError(message)
        console.error("Failed to load HR uploaded lead batches:", error)
      } finally {
        setIsLoadingUploadedBatches(false)
      }
    }
    loadUploadedLeadBatches()
  }, [dealers, useApi, realtimeTick])

  useEffect(() => {
    if (callingRange !== "custom") return
    if (callingCustomFromDate || callingCustomToDate) return
    const t = formatYmdLocal(new Date())
    setCallingCustomFromDate(t)
    setCallingCustomToDate(t)
  }, [callingRange, callingCustomFromDate, callingCustomToDate])

  useEffect(() => {
    const loadCallingActions = async () => {
      const localCallingActions = JSON.parse(localStorage.getItem("callingActionHistory") || "[]")
      const normalizedLocal = Array.isArray(localCallingActions)
        ? localCallingActions
            .map((item: any, index: number) => normalizeCallingAction(item, dealers, index))
            .sort(
              (a, b) =>
                (parseActionDate(b.actionAt)?.getTime() || 0) - (parseActionDate(a.actionAt)?.getTime() || 0),
            )
        : []

      if (!useApi) {
        setCallingActions(normalizedLocal)
        setCallingActionsUnavailable(normalizedLocal.length === 0)
        return
      }

      try {
        const dealerIdParam = !callingDealerFilter || callingDealerFilter === "all" || callingDealerFilter.startsWith("name:")
          ? undefined
          : callingDealerFilter
        const dateRangeParams = buildCallingActionsQueryDates(callingRange, callingCustomFromDate, callingCustomToDate)
        const response = await api.hr.callingActions.getAll({
          limit: 2000,
          range: callingRange,
          ...(dealerIdParam ? { dealerId: dealerIdParam } : {}),
          ...dateRangeParams,
        })
        const source =
          response?.actions ||
          response?.callingActions ||
          response?.items ||
          response?.logs ||
          response?.data ||
          []
        const normalizedFromApi = Array.isArray(source)
          ? source
              .map((item: any, index: number) => normalizeCallingAction(item, dealers, index))
              .sort(
                (a, b) =>
                  (parseActionDate(b.actionAt)?.getTime() || 0) - (parseActionDate(a.actionAt)?.getTime() || 0),
              )
          : []
        const mergedById = new Map<string, CallingActionRecord>()
        ;[...normalizedFromApi, ...normalizedLocal].forEach((item) => {
          if (!item?.id) return
          if (!mergedById.has(item.id)) mergedById.set(item.id, item)
        })
        const merged = Array.from(mergedById.values()).sort(
          (a, b) => (parseActionDate(b.actionAt)?.getTime() || 0) - (parseActionDate(a.actionAt)?.getTime() || 0),
        )
        setCallingActions(merged)
        setCallingActionsUnavailable(merged.length === 0)
      } catch {
        setCallingActions(normalizedLocal)
        setCallingActionsUnavailable(normalizedLocal.length === 0)
      }
    }
    loadCallingActions()
  }, [dealers, useApi, realtimeTick, callingRange, callingDealerFilter, callingCustomFromDate, callingCustomToDate])

  useEffect(() => {
    const socket = getRealtime()
    if (!socket) return

    const triggerRealtimeRefetch = () => {
      setRealtimeTick((prev) => prev + 1)
    }

    const onBackendMutation = (evt: any) => {
      const domain = String(evt?.domain || "").toLowerCase()
      const path = String(evt?.path || "").toLowerCase()
      if (
        domain === "hr" ||
        domain === "admin" ||
        domain === "dealers" ||
        domain === "dealer" ||
        path.includes("calling") ||
        path.includes("leads")
      ) {
        triggerRealtimeRefetch()
      }
    }

    socket.on("dealer:directory-updated", triggerRealtimeRefetch)
    socket.on("calling:actions-updated", triggerRealtimeRefetch)
    socket.on("calling:uploads-updated", triggerRealtimeRefetch)
    socket.on("backend:mutation", onBackendMutation)

    return () => {
      socket.off("dealer:directory-updated", triggerRealtimeRefetch)
      socket.off("calling:actions-updated", triggerRealtimeRefetch)
      socket.off("calling:uploads-updated", triggerRealtimeRefetch)
      socket.off("backend:mutation", onBackendMutation)
    }
  }, [])

  const toggleDealer = (dealerId: string) => {
    setSelectedDealerIds((prev) => (prev.includes(dealerId) ? prev.filter((id) => id !== dealerId) : [...prev, dealerId]))
  }

  const parseCsvText = (text: string): ParsedCsvRow[] => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    if (lines.length <= 1) return []

    const delimiter = lines[0].includes("\t") ? "\t" : ","
    const headerCols = parseDelimitedLine(lines[0], delimiter)
    const headers = headerCols.map((h) => normalizeHeaderKey(h))
    const rows: ParsedCsvRow[] = []
    for (let i = 1; i < lines.length; i += 1) {
      const cols = parseDelimitedLine(lines[i], delimiter)
      const raw: Record<string, string> = {}
      headers.forEach((header, idx) => {
        raw[header] = cols[idx] || ""
      })

      const name = getFromRaw(raw, ["name", "customer", "customer name", "customername", "full name", "fullname"])
      const mobile = normalizeMobile(getFromRaw(raw, ["mobile", "phone", "contact", "contact no", "contact number", "contactno", "contactnumber"]))
      if (!mobile) continue

      const altMobile = normalizeMobile(getFromRaw(raw, ["alt mobile", "altmobile", "alternate", "alternate phone", "alternatephone"]))
      const kNumber = getFromRaw(raw, ["k number", "knumber", "k no", "kno"])
      const address = getFromRaw(raw, ["address", "full address"])
      const customerNote = getFromRaw(raw, ["note", "notes", "remark", "remarks", "comment", "comments"])
      const dataRefState = getFromRaw(raw, ["data ref", "data ref state", "data ref / state", "dataref", "datarefstate"])
      const cityValue = getFromRaw(raw, ["city"])
      const stateValue = getFromRaw(raw, ["state"])
      const inferredFromDataRef = splitCityState(dataRefState)

      rows.push({
        name,
        mobile,
        altMobile: altMobile || "",
        kNumber,
        address,
        customerNote,
        city: cityValue || inferredFromDataRef.city,
        state: stateValue || inferredFromDataRef.state,
        raw,
      })
    }
    return rows
  }

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFile(file)
    setCsvFileName(file.name)
    const text = await file.text()
    const parsedRows = parseCsvText(text)
    setCsvRows(parsedRows)
    toast({
      title: "CSV parsed",
      description: `${parsedRows.length} valid rows detected.`,
    })
  }

  const assignLeads = async () => {
    if (selectedDealerIds.length === 0) {
      toast({
        title: "Select dealers",
        description: "Please select at least one dealer checkbox.",
        variant: "destructive",
      })
      return
    }
    if (csvRows.length === 0) {
      toast({
        title: "Upload CSV",
        description: "Please upload a valid CSV with lead rows.",
        variant: "destructive",
      })
      return
    }

    setIsAssigning(true)
    try {
      if (!useApi) {
        toast({
          title: "API mode required",
          description: "Enable backend API mode to assign leads to database.",
          variant: "destructive",
        })
        return
      }

      if (!csvFile) {
        toast({
          title: "Re-upload CSV file",
          description: "Please choose the CSV file again before assigning to database.",
          variant: "destructive",
        })
        return
      }

      const result = await api.hr.uploadLeadsCsv(csvFile, selectedDealerIds, {
        assignmentMode: HR_UPLOAD_ASSIGNMENT_MODE,
        activeLimitPerDealer: DEFAULT_ACTIVE_LIMIT,
      })
      const parsed = Number(result?.parsed || result?.total || csvRows.length)
      const created = Number(result?.created || result?.inserted || 0)
      const skippedDuplicate = Number(result?.skippedDuplicate || result?.skipped || 0)
      const assignedAtUpload = Number(
        result?.assignedAtUpload ?? result?.assigned ?? result?.data?.assignedAtUpload ?? created ?? 0,
      )
      const queuedAtUpload = Number(result?.queuedAtUpload ?? result?.queued ?? result?.data?.queuedAtUpload ?? 0)
      const uploadId = result?.uploadId || result?.batchId || result?.data?.uploadId || result?.data?.batchId

      setCsvRows([])
      setCsvFile(null)
      setCsvFileName("")
      setRealtimeTick((prev) => prev + 1)
      toast({
        title: "Saved to database",
        description: `Parsed ${parsed}, created ${created}, assigned at upload ${assignedAtUpload}, queued at upload ${queuedAtUpload}, duplicates ${skippedDuplicate}${uploadId ? ` (batch ${String(uploadId).slice(0, 8)}…)` : ""}.`,
      })
    } catch (error) {
      let message = "Failed to assign leads in database."
      if (error instanceof ApiError) {
        message = error.details?.[0]?.message || error.message || message
      } else if (error instanceof Error && error.message) {
        message = error.message
      }
      toast({
        title: "Assignment failed",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsAssigning(false)
    }
  }

  const loadBatchPreviewPage = async (
    batch: UploadedLeadBatch,
    page: number,
    limit: number,
    mobileFilter?: string,
  ) => {
    setIsLoadingBatchRows(true)
    const mobileDigits = normalizeMobile(mobileFilter ?? batchMobileQuery)
    try {
      if (!useApi) {
        const allRows = (batch.rows || []).filter((row) => {
          if (!mobileDigits) return true
          const rowMobile = normalizeMobile(row.mobile || "")
          const alt = normalizeMobile(row.altMobile || "")
          return rowMobile.includes(mobileDigits) || alt.includes(mobileDigits)
        })
        const start = (page - 1) * limit
        const pagedRows = allRows.slice(start, start + limit)
        setActiveBatchRows(pagedRows)
        setActiveBatchTotalRows(allRows.length)
        return
      }
      const response = await api.hr.uploadedLeads.getById(batch.id, {
        page,
        limit,
        ...(mobileDigits ? { mobile: mobileDigits, q: mobileDigits, search: mobileDigits } : {}),
      })
      const rawBatch =
        response?.batch ||
        response?.upload ||
        response?.item ||
        response?.data?.batch ||
        response?.data?.upload ||
        response?.data ||
        null
      const rowsSource =
        response?.rows ||
        response?.items ||
        response?.leads ||
        response?.data?.rows ||
        response?.data?.items ||
        response?.data?.leads ||
        null
      const paginationTotal = Number(
        response?.pagination?.total ??
          response?.data?.pagination?.total ??
          response?.meta?.total ??
          0,
      )
      const totalRowsFromResponse = Number(
        response?.totalRows ||
          response?.data?.totalRows ||
          rawBatch?.rowCount ||
          response?.data?.batch?.rowCount ||
          paginationTotal ||
          response?.total ||
          response?.data?.total ||
          0,
      )
      if (rawBatch) {
        const totalRows =
          totalRowsFromResponse > 0
            ? totalRowsFromResponse
            : Number(rawBatch?.rowCount || rawBatch?.totalRows || rawBatch?.count || 0)
        const countSource = {
          ...rawBatch,
          rowCount: totalRows || rawBatch?.rowCount,
          assignedCount:
            rawBatch?.assignedCount ??
            response?.assignedCount ??
            response?.data?.batch?.assignedCount,
          unassignedCount:
            rawBatch?.unassignedCount ??
            response?.unassignedCount ??
            response?.data?.batch?.unassignedCount,
          completedCount:
            rawBatch?.completedCount ??
            response?.completedCount ??
            response?.data?.batch?.completedCount,
          counts: rawBatch?.counts ?? response?.counts ?? response?.data?.batch?.counts,
        }
        const normalized = normalizeUploadedLeadBatch(countSource, dealers, 0)
        let pageRows = Array.isArray(rowsSource)
          ? normalizeBatchRows(rowsSource)
          : normalized.rows || []
        // Client-side mobile filter when backend ignored the query param
        if (mobileDigits) {
          pageRows = pageRows.filter((row) => {
            const rowMobile = normalizeMobile(row.mobile || "")
            const alt = normalizeMobile(row.altMobile || "")
            return rowMobile.includes(mobileDigits) || alt.includes(mobileDigits)
          })
        }
        const displayCounts = resolveHrUploadBatchCounts(
          Array.isArray(rowsSource) ? normalizeBatchRows(rowsSource) : normalized.rows || [],
          totalRows || normalized.rowCount,
          countSource,
        )
        setActiveBatch((prev) => {
          const base = prev || batch
          return {
            ...base,
            ...normalized,
            id: base.id || batch.id,
            fileName: base.fileName || batch.fileName,
            uploadedAt: base.uploadedAt || batch.uploadedAt,
            rowCount: displayCounts.rowCount,
            assignedCount: displayCounts.assigned,
            unassignedCount: displayCounts.unassigned,
            completedCount: displayCounts.completed,
          }
        })
        setActiveBatchRows(pageRows)
        // When filtering by mobile, prefer match count over full batch size if backend didn't filter totals
        if (mobileDigits && paginationTotal <= 0 && pageRows.length >= 0 && pageRows.length < limit) {
          setActiveBatchTotalRows(pageRows.length)
        } else {
          const rowsForPaging =
            paginationTotal > 0
              ? paginationTotal
              : totalRows > 0
                ? totalRows
                : normalized.rowCount || normalized.rows.length
          setActiveBatchTotalRows(mobileDigits && pageRows.length < rowsForPaging && paginationTotal <= 0 ? pageRows.length : rowsForPaging)
        }
      } else {
        if (Array.isArray(rowsSource)) {
          let normalizedRows = normalizeBatchRows(rowsSource)
          if (mobileDigits) {
            normalizedRows = normalizedRows.filter((row) => {
              const rowMobile = normalizeMobile(row.mobile || "")
              const alt = normalizeMobile(row.altMobile || "")
              return rowMobile.includes(mobileDigits) || alt.includes(mobileDigits)
            })
          }
          setActiveBatchRows(normalizedRows)
          setActiveBatchTotalRows(
            mobileDigits
              ? normalizedRows.length
              : totalRowsFromResponse > 0
                ? totalRowsFromResponse
                : normalizedRows.length,
          )
        } else {
          const allRows = (batch.rows || []).filter((row) => {
            if (!mobileDigits) return true
            const rowMobile = normalizeMobile(row.mobile || "")
            const alt = normalizeMobile(row.altMobile || "")
            return rowMobile.includes(mobileDigits) || alt.includes(mobileDigits)
          })
          const start = (page - 1) * limit
          setActiveBatchRows(allRows.slice(start, start + limit))
          setActiveBatchTotalRows(allRows.length)
        }
      }
    } catch {
      // Fallback: if detail endpoint is unavailable, show already available rows.
      const allRows = (batch.rows || []).filter((row) => {
        if (!mobileDigits) return true
        const rowMobile = normalizeMobile(row.mobile || "")
        const alt = normalizeMobile(row.altMobile || "")
        return rowMobile.includes(mobileDigits) || alt.includes(mobileDigits)
      })
      const start = (page - 1) * limit
      setActiveBatchRows(allRows.slice(start, start + limit))
      setActiveBatchTotalRows(allRows.length)
    } finally {
      setIsLoadingBatchRows(false)
    }
  }

  const openBatchPreview = async (batch: UploadedLeadBatch) => {
    const firstPage = 1
    setIsBatchModalOpen(true)
    setActiveBatch(batch)
    setActiveBatchRows([])
    setActiveBatchPage(firstPage)
    setBatchMobileQuery("")
    setActiveBatchTotalRows(batch.rowCount || batch.rows.length || 0)
    await loadBatchPreviewPage(batch, firstPage, activeBatchLimit, "")
  }

  const applyBatchMobileSearch = async () => {
    if (!activeBatch) return
    setActiveBatchPage(1)
    await loadBatchPreviewPage(activeBatch, 1, activeBatchLimit, batchMobileQuery)
  }

  const searchLeadsByMobileGlobal = async () => {
    const mobileDigits = normalizeMobile(globalMobileQuery)
    if (!mobileDigits) {
      toast({
        title: "Enter mobile number",
        description: "Type a mobile number to search across all uploaded lead data.",
        variant: "destructive",
      })
      return
    }
    if (!useApi) {
      toast({
        title: "API mode required",
        description: "Enable backend API mode to search leads by mobile.",
        variant: "destructive",
      })
      return
    }

    setIsSearchingGlobalMobile(true)
    setGlobalMobileSearchError(null)
    setGlobalMobileSearched(true)
    try {
      try {
        const response = await api.hr.uploadedLeads.searchByMobile(mobileDigits, { limit: 100 })
        const source = (response?.leads || response?.rows || (response as any)?.items || []) as any[]
        if (Array.isArray(source) && source.length > 0) {
          const hits: GlobalMobileSearchHit[] = normalizeBatchRows(source).map((row, index) => {
            const raw = source[index] || {}
            return {
              ...row,
              uploadId: String(raw.uploadId || raw.upload_id || raw.batchId || raw.uploadBatchId || ""),
              fileName: String(raw.fileName || raw.uploadFileName || raw.batchFileName || ""),
              uploadedAt: String(raw.uploadedAt || raw.uploadUploadedAt || ""),
            }
          })
          setGlobalMobileHits(hits)
          return
        }
      } catch (error) {
        // Fall through to per-batch scan when dedicated search route is missing.
        const isMissing =
          error instanceof ApiError &&
          (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
        if (!isMissing) throw error
      }

      // Fallback: query each upload with mobile filter (oldest → newest for stable order)
      const hits: GlobalMobileSearchHit[] = []
      const batches = [...uploadedLeadBatches].sort(
        (a, b) => new Date(a.uploadedAt || 0).getTime() - new Date(b.uploadedAt || 0).getTime(),
      )
      for (const batch of batches) {
        try {
          const response = await api.hr.uploadedLeads.getById(batch.id, {
            page: 1,
            limit: 50,
            mobile: mobileDigits,
            q: mobileDigits,
            search: mobileDigits,
          })
          const rowsSource =
            response?.rows ||
            response?.items ||
            response?.leads ||
            response?.data?.rows ||
            response?.data?.items ||
            response?.data?.leads ||
            []
          const rows = normalizeBatchRows(Array.isArray(rowsSource) ? rowsSource : []).filter((row) => {
            const rowMobile = normalizeMobile(row.mobile || "")
            const alt = normalizeMobile(row.altMobile || "")
            return rowMobile.includes(mobileDigits) || alt.includes(mobileDigits)
          })
          for (const row of rows) {
            hits.push({
              ...row,
              uploadId: batch.id,
              fileName: batch.fileName,
              uploadedAt: batch.uploadedAt,
            })
          }
        } catch {
          // skip batch if detail endpoint fails
        }
      }
      setGlobalMobileHits(hits)
      if (hits.length === 0) {
        setGlobalMobileSearchError(
          "No leads found for this mobile. If you expected a match, backend may need GET /hr/leads/search?mobile=…",
        )
      }
    } catch (error) {
      setGlobalMobileHits([])
      const message =
        error instanceof ApiError
          ? error.details?.[0]?.message || error.message
          : error instanceof Error
            ? error.message
            : "Mobile search failed."
      setGlobalMobileSearchError(message)
    } finally {
      setIsSearchingGlobalMobile(false)
    }
  }

  const resolveBatchDealerIds = (batch: UploadedLeadBatch): string[] => {
    const quotationIds = new Set(
      filterActiveDealers(dealers).filter(hasQuotationAccessForLeadPool).map((d) => d.id),
    )
    if (batch.dealerIds.length > 0) {
      return batch.dealerIds.filter((id) => quotationIds.has(id))
    }
    const ids: string[] = []
    const active = filterActiveDealers(dealers).filter(hasQuotationAccessForLeadPool)
    for (const name of batch.dealers) {
      const match = active.find(
        (d) => normalizeName(`${d.firstName} ${d.lastName}`) === normalizeName(name),
      )
      if (match && !ids.includes(match.id)) ids.push(match.id)
    }
    return ids
  }

  const openManageDealersDialog = (batch: UploadedLeadBatch) => {
    setAddDealersBatch(batch)
    setAddDealerIds(resolveBatchDealerIds(batch))
  }

  const toggleManageDealer = (dealerId: string) => {
    setAddDealerIds((prev) =>
      prev.includes(dealerId) ? prev.filter((id) => id !== dealerId) : [...prev, dealerId],
    )
  }

  const saveManagedDealers = async () => {
    if (!addDealersBatch) return
    if (!useApi) {
      toast({
        title: "API mode required",
        description: "Enable backend API mode to manage dealers on a batch.",
        variant: "destructive",
      })
      return
    }
    if (addDealerIds.length === 0) {
      toast({
        title: "Select dealers",
        description: "Keep at least one Quotation-access dealer selected for this batch pool.",
        variant: "destructive",
      })
      return
    }

    const batchId = addDealersBatch.id
    const quotationIdSet = new Set(quotationDealers.map((d) => d.id))
    const selectedIds = addDealerIds.filter((id) => quotationIdSet.has(id))
    if (selectedIds.length === 0) {
      toast({
        title: "Select dealers",
        description: "Only users with Dealer access can be in the pool.",
        variant: "destructive",
      })
      return
    }
    const selectedNames = selectedIds
      .map((id) => {
        const d = dealers.find((x) => x.id === id)
        return d ? `${d.firstName} ${d.lastName}`.trim() : id
      })
      .filter(Boolean)

    setIsSavingDealers(true)
    try {
      // Pool replace only — keep Save fast.
      await api.hr.updateUploadDealerPool(batchId, selectedIds, {
        mode: "replace",
        existingDealerIds: [],
      })

      setAddDealersBatch(null)
      setAddDealerIds([])
      setIsSavingDealers(false)
      setRealtimeTick((prev) => prev + 1)

      toast({
        title: "Dealers updated",
        description: `Pool set to ${selectedNames.join(", ")}. Ensuring each dealer has at most 1 active lead (rest stay Unassigned)…`,
      })

      // Always rebalance: 1 open lead per dealer; excess Assigned → Unassigned; top up from Unassigned.
      void (async () => {
        try {
          const result = (await api.hr.assignUnassignedLeads(batchId, {
            assignmentMode: "active_cap",
            activeLimitPerDealer: DEFAULT_ACTIVE_LIMIT,
            rebalance: true,
          })) as any
          const assigned = Number(
            result?.assigned ?? result?.assignedCount ?? result?.data?.assigned ?? result?.data?.assignedCount ?? 0,
          )
          const released = Number(
            result?.released ?? result?.unassignedFromAssigned ?? result?.data?.released ?? 0,
          )
          const unassignedRemaining = Number(
            result?.unassignedRemaining ??
              result?.unassignedCount ??
              result?.data?.unassignedRemaining ??
              result?.data?.unassignedCount,
          )
          setRealtimeTick((prev) => prev + 1)
          toast({
            title: "Active leads balanced",
            description:
              Number.isFinite(unassignedRemaining)
                ? `Seeded ~${assigned} lead(s)${released ? `, returned ~${released} excess to Unassigned` : ""}. Unassigned now ~${unassignedRemaining}; each dealer keeps 1 until they Complete.`
                : `Each selected dealer gets up to ${DEFAULT_ACTIVE_LIMIT} active lead; the rest stay Unassigned until Complete.`,
          })
        } catch {
          toast({
            title: "Pool saved — balance still pending",
            description:
              "Dealer pool was updated, but active-cap assign failed. Backend must honor assignmentMode=active_cap + rebalance (1 lead per dealer).",
            variant: "destructive",
          })
        }
      })()
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.details?.[0]?.message || error.message
          : error instanceof Error
            ? error.message
            : "Failed to update dealers."
      const missingEndpoint =
        error instanceof ApiError &&
        (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
      toast({
        title: "Could not update dealers",
        description: missingEndpoint
          ? `${message} Backend needs PATCH /hr/leads/uploads/:id/dealers with full dealerIds[].`
          : message,
        variant: "destructive",
      })
      setIsSavingDealers(false)
    }
  }

  const activeBatchTotalPages = Math.max(1, Math.ceil(activeBatchTotalRows / activeBatchLimit))

  const getCallingRangeBounds = () => {
    if (callingRange === "all") return null
    if (callingRange === "custom") return getCustomBoundsFromYmd(callingCustomFromDate, callingCustomToDate)
    return getPresetBounds(callingRange)
  }

  const isWithinCallingRange = (actionAt?: string) => {
    if (callingRange === "all") return true
    const bounds = getCallingRangeBounds()
    if (!bounds) return false
    if (!actionAt) return false
    const actionDate = parseActionDate(actionAt)
    if (!actionDate) return false
    return actionDate >= bounds.start && actionDate <= bounds.end
  }

  const filteredCallingActions = useMemo(() => {
    return callingActions.filter((item) => {
      const isNameFilter = callingDealerFilter.startsWith("name:")
      const normalizedNameFilter = normalizeName(callingDealerFilter.replace(/^name:/, ""))
      const normalizedItemDealerName = normalizeName(item.dealerName)
      const matchesDealer =
        callingDealerFilter === "all" ||
        item.dealerId === callingDealerFilter ||
        normalizedItemDealerName === normalizeName(callingDealerFilter) ||
        (isNameFilter && normalizedItemDealerName === normalizedNameFilter)
      return matchesDealer && isWithinCallingRange(item.actionAt)
    })
  }, [callingActions, callingDealerFilter, callingRange, callingCustomFromDate, callingCustomToDate])

  const activeDealers = useMemo(() => filterActiveDealers(dealers), [dealers])

  /** Manage dealers / Assignment Select Dealers — Quotation checkbox only. */
  const quotationDealers = useMemo(
    () => activeDealers.filter(hasQuotationAccessForLeadPool),
    [activeDealers],
  )

  const dealerFilterOptions = useMemo(() => {
    return activeDealers
      .map((d) => ({
        value: d.id,
        label: `${d.firstName} ${d.lastName}`.trim() || d.email || d.mobile || d.id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [activeDealers])

  useEffect(() => {
    if (callingDealerFilter === "all") return
    if (callingDealerFilter.startsWith("name:")) {
      setCallingDealerFilter("all")
      return
    }
    if (!activeDealers.some((d) => d.id === callingDealerFilter)) {
      setCallingDealerFilter("all")
    }
  }, [activeDealers, callingDealerFilter])

  const connectionSummary = useMemo(
    () => buildCallingConnectionSummary(filteredCallingActions),
    [filteredCallingActions],
  )
  const connectedOutcomeSummary = useMemo(
    () =>
      buildCallingActionSummary(
        filteredCallingActions.filter((item) => classifyCallingConnection(item) === "connected"),
      ),
    [filteredCallingActions],
  )

  const multiAccess = getAccessOptions(access).length > 1

  return (
    <div className="min-h-screen bg-background">
      <AccessSwitchBar current="hr" title="HR" />
      {!multiAccess ? (
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
            <Users className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">HR Calling Assignment</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Upload CSV leads and choose dealer pool. Leads stay in a shared FIFO work queue —
          next free dealer in the pool gets the next unassigned lead (first-come-first-serve).
          Goal: Unassigned → 0 and Assigned → 0 as dealers finish calls (Completed grows to row count).
        </p>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto gap-1 p-1">
            <TabsTrigger value="assignment" className="text-xs sm:text-sm">
              Assignment
            </TabsTrigger>
            <TabsTrigger value="social-media" className="text-xs sm:text-sm">
              Social Media
            </TabsTrigger>
            <TabsTrigger value="uploaded-data" className="text-xs sm:text-sm">
              Uploaded Data
            </TabsTrigger>
            <TabsTrigger value="dealer-actions" className="text-xs sm:text-sm">
              Dealer Actions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="assignment" className="space-y-4">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-primary" />
                  CSV Upload
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input type="file" accept=".csv,text/csv" onChange={handleCsvUpload} />
                <div className="text-xs text-muted-foreground">
                  {csvFileName
                    ? `File: ${csvFileName} (${csvRows.length} valid rows)`
                    : "Upload CSV. Supported headers include Name, Contact No., K Number, Address, Data Ref. / State."}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Select Dealers</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingDealers ? (
                  <p className="text-sm text-muted-foreground">Loading dealers...</p>
                ) : quotationDealers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No dealers with Dealer access. Enable Dealer in Admin → Users.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {quotationDealers.map((dealer) => (
                      <label key={dealer.id} className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 cursor-pointer hover:bg-muted/40">
                        <Checkbox checked={selectedDealerIds.includes(dealer.id)} onCheckedChange={() => toggleDealer(dealer.id)} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{dealer.firstName} {dealer.lastName}</p>
                          <p className="text-xs text-muted-foreground truncate">{dealer.mobile} • {dealer.email}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                {selectedDealerIds.length > 0 && csvRows.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {selectedDealerIds.map((id) => {
                        const dealer = dealers.find((d) => d.id === id)
                        if (!dealer) return null
                        return (
                          <Badge key={id} variant="outline">
                            {dealer.firstName} {dealer.lastName}
                          </Badge>
                        )
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Leads are saved and seeded to the selected dealers on upload (1 active lead per dealer). To
                      change the pool or rebalance active leads, use{" "}
                      <span className="font-medium text-foreground">Add dealers</span> on the batch in Uploaded Data.
                      Dealers then work that one lead in Calling Data; after Complete, the next Unassigned lead is
                      assigned.
                    </p>
                  </div>
                )}

                <div className="mt-4 flex justify-end">
                  <Button onClick={assignLeads} disabled={isAssigning || selectedDealerIds.length === 0 || csvRows.length === 0} className="gap-2">
                    <Upload className="w-4 h-4" />
                    {isAssigning ? "Assigning..." : "Assign Leads"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="social-media" className="space-y-4">
            <HrSocialMediaSheetsPanel
              dealers={quotationDealers}
              realtimeTick={realtimeTick}
              onSyncComplete={() => setRealtimeTick((t) => t + 1)}
            />
          </TabsContent>

          <TabsContent value="uploaded-data">
            <Card className="border-border/60">
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <CardTitle className="text-base">Uploaded Lead Data</CardTitle>
                    <CardDescription>
                      Use <span className="font-medium text-foreground">Add dealers</span> on a file to choose who is
                      in that batch&apos;s pool. Each dealer gets <span className="font-medium text-foreground">1 active
                      lead</span> at a time; the rest stay Unassigned until they Complete, then the next one is
                      assigned. Dealers work Assigned → Completed in Calling Data.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center rounded-md border border-border/60 bg-muted/20 p-3">
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium">Global search by mobile</p>
                    <p className="text-xs text-muted-foreground">
                      Find a lead across every uploaded CSV by mobile number (exact or partial last digits).
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={globalMobileQuery}
                      onChange={(e) => setGlobalMobileQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void searchLeadsByMobileGlobal()
                      }}
                      placeholder="e.g. 9602209955"
                      inputMode="numeric"
                      className="w-[180px] h-9"
                    />
                    <Button
                      size="sm"
                      className="gap-1"
                      disabled={isSearchingGlobalMobile}
                      onClick={() => void searchLeadsByMobileGlobal()}
                    >
                      {isSearchingGlobalMobile ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                      Search
                    </Button>
                    {globalMobileSearched ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setGlobalMobileQuery("")
                          setGlobalMobileHits([])
                          setGlobalMobileSearched(false)
                          setGlobalMobileSearchError(null)
                        }}
                      >
                        Clear
                      </Button>
                    ) : null}
                  </div>
                </div>

                {globalMobileSearched ? (
                  <div className="rounded-md border border-border/70 overflow-hidden">
                    {isSearchingGlobalMobile ? (
                      <div className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Searching by mobile…
                      </div>
                    ) : globalMobileHits.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        {globalMobileSearchError || "No leads found for this mobile number."}
                      </p>
                    ) : (
                      <div className="overflow-auto max-h-[360px]">
                        <table className="w-full table-fixed text-sm">
                          <thead className="sticky top-0 bg-background z-10">
                            <tr className="text-left text-muted-foreground border-b">
                              <th className="py-2 px-3 w-[14%]">Upload</th>
                              <th className="py-2 px-3 w-[14%]">Name</th>
                              <th className="py-2 px-3 w-[11%]">Mobile</th>
                              <th className="py-2 px-3 w-[12%]">K Number</th>
                              <th className="py-2 px-3 w-[24%]">Address</th>
                              <th className="py-2 px-3 w-[14%]">Assigned Dealer</th>
                              <th className="py-2 px-3 w-[11%]">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {globalMobileHits.map((row, idx) => {
                              const display = getHrLeadRowDisplay(row)
                              return (
                                <tr
                                  key={`global-mobile-${row.mobile}-${row.uploadId || idx}-${idx}`}
                                  className="border-t border-border/40"
                                >
                                  <td className="py-2 px-3 break-words whitespace-normal text-xs text-muted-foreground">
                                    {row.fileName || row.uploadId || "—"}
                                  </td>
                                  <td className="py-2 px-3 break-words whitespace-normal">{row.name || "N/A"}</td>
                                  <td className="py-2 px-3 break-all whitespace-normal">{row.mobile || "N/A"}</td>
                                  <td className="py-2 px-3 break-all whitespace-normal">{row.kNumber || "N/A"}</td>
                                  <td className="py-2 px-3 break-words whitespace-normal">{row.address || "N/A"}</td>
                                  <td className="py-2 px-3 break-words whitespace-normal">{display.dealerLabel}</td>
                                  <td className="py-2 px-3">
                                    <Badge variant="outline" className={display.statusBadgeClassName}>
                                      {display.statusLabel}
                                    </Badge>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                        <p className="px-3 py-2 text-xs text-muted-foreground border-t">
                          {globalMobileHits.length} match{globalMobileHits.length === 1 ? "" : "es"} for mobile containing{" "}
                          {normalizeMobile(globalMobileQuery)}
                        </p>
                      </div>
                    )}
                  </div>
                ) : null}

                {isLoadingUploadedBatches ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading uploaded data...
                  </div>
                ) : uploadedBatchesLoadError ? (
                  <p className="text-sm text-destructive">{uploadedBatchesLoadError}</p>
                ) : uploadedLeadBatches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No uploaded lead data found yet.</p>
                ) : (
                  <div className="space-y-4">
                    {uploadedLeadBatches.map((batch) => (
                      <div key={batch.id} className="rounded-md border border-border/70 p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium text-sm">{batch.fileName}</p>
                            <p className="text-xs text-muted-foreground">
                              Uploaded: {new Date(batch.uploadedAt).toLocaleString()} • Rows: {batch.rowCount}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              <Badge
                                variant="outline"
                                className="text-[10px] font-normal border-amber-200 text-amber-900 bg-amber-50"
                              >
                                Unassigned: {batch.unassignedCount}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="text-[10px] font-normal border-sky-200 text-sky-900 bg-sky-50"
                              >
                                Assigned: {batch.assignedCount}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="text-[10px] font-normal border-emerald-200 text-emerald-800 bg-emerald-50"
                              >
                                Completed: {batch.completedCount}
                              </Badge>
                            </div>
                          </div>
                          <div className="ml-auto flex items-center gap-2">
                            <div className="flex flex-wrap gap-1 justify-end items-center">
                              {batch.dealers.map((name) => (
                                <Badge key={`${batch.id}-${name}`} variant="outline">
                                  {name}
                                </Badge>
                              ))}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 shrink-0"
                                onClick={() => openManageDealersDialog(batch)}
                              >
                                <UserRoundPlus className="w-3.5 h-3.5" />
                                Add dealers
                              </Button>
                            </div>
                            <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={() => openBatchPreview(batch)}>
                              <Eye className="w-4 h-4" />
                              View
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dealer-actions" className="space-y-4">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Dealer Calling Actions</CardTitle>
                <CardDescription>
                  Use the dealer dropdown to see one salesperson&apos;s actions. Date filters apply to action time.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                  <Select
                    value={callingRange}
                    onValueChange={(value: "daily" | "weekly" | "monthly" | "last_month" | "custom" | "all") =>
                      setCallingRange(value)
                    }
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select report range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="last_month">Last Month</SelectItem>
                      <SelectItem value="custom">Custom date range</SelectItem>
                      <SelectItem value="all">All Time</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={callingDealerFilter} onValueChange={setCallingDealerFilter}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Filter by dealer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Dealers</SelectItem>
                      {dealerFilterOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {callingRange === "custom" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">From</p>
                      <Input
                        type="date"
                        className="bg-background"
                        value={callingCustomFromDate}
                        onChange={(e) => setCallingCustomFromDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">To</p>
                      <Input
                        type="date"
                        className="bg-background"
                        value={callingCustomToDate}
                        onChange={(e) => setCallingCustomToDate(e.target.value)}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Card className="border-border/60 bg-muted/20">
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="text-xl font-semibold">{filteredCallingActions.length}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-slate-300 bg-slate-50/80">
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">Not Connected</p>
                      <p className="text-xl font-semibold">{connectionSummary.notConnected}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-emerald-200 bg-emerald-50/40">
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">Connected</p>
                      <p className="text-xl font-semibold">{connectionSummary.connected}</p>
                    </CardContent>
                  </Card>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Card className="border-rose-100 bg-rose-50/20">
                    <CardContent className="pt-3 pb-3">
                      <p className="text-xs text-muted-foreground">Connected — Not Interested</p>
                      <p className="text-lg font-semibold">{connectedOutcomeSummary.notInterested}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-emerald-100 bg-emerald-50/20">
                    <CardContent className="pt-3 pb-3">
                      <p className="text-xs text-muted-foreground">Connected — Interested</p>
                      <p className="text-lg font-semibold">{connectedOutcomeSummary.interested}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-blue-100 bg-blue-50/20">
                    <CardContent className="pt-3 pb-3">
                      <p className="text-xs text-muted-foreground">Connected — Follow Up</p>
                      <p className="text-lg font-semibold">{connectedOutcomeSummary.followUp}</p>
                    </CardContent>
                  </Card>
                </div>

                {callingActionsUnavailable ? (
                  <p className="text-sm text-muted-foreground">No dealer actions found yet.</p>
                ) : filteredCallingActions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No calling actions found for selected filters.</p>
                ) : (
                  <div className="space-y-2">
                    {filteredCallingActions.slice(0, 300).map((item) => {
                      const parsedRemark = parseCallRemarkParts(item.callRemark || "")
                      const statusLabel = ACTION_LABEL_MAP[item.action] || item.action || "N/A"
                      return (
                        <div key={item.id} className="rounded-lg border border-border/70 bg-card p-3 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm break-words">{item.dealerName || "Unknown Employee"}</p>
                            <p className="text-xs text-muted-foreground break-all">Lead: {item.leadId || "N/A"}</p>
                            <p className="text-xs text-muted-foreground break-words">Customer: {item.customerName || "N/A"}</p>
                            <p className="text-xs text-muted-foreground break-all">Phone: {item.customerMobile || "N/A"}</p>
                            <p className="text-xs text-muted-foreground break-words">Address: {item.customerAddress || "N/A"}</p>
                          </div>
                          <div className="flex items-center gap-2 max-w-full">
                            <Badge
                              variant="outline"
                              className={
                                item.action === "not_interested"
                                  ? "border-rose-200 text-rose-700 bg-rose-50"
                                  : item.action === "follow_up"
                                    ? "border-blue-200 text-blue-700 bg-blue-50"
                                    : item.action === "called"
                                      ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                                      : "border-border text-foreground"
                              }
                            >
                              {statusLabel}
                            </Badge>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {item.actionAt ? new Date(item.actionAt).toLocaleString() : "N/A"}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 space-y-1 text-sm">
                          {parsedRemark.statusCategory ? (
                            <p className="break-words">
                              <span className="font-medium">Status Category:</span> {parsedRemark.statusCategory}
                            </p>
                          ) : null}
                          <p className="break-words">
                            <span className="font-medium">Status:</span> {parsedRemark.status || statusLabel}
                          </p>
                          {parsedRemark.remark ? (
                            <p className="break-words">
                              <span className="font-medium">Remark:</span> {parsedRemark.remark}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    )})}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={isBatchModalOpen} onOpenChange={setIsBatchModalOpen}>
        <DialogContent className="!w-[96vw] !max-w-[96vw] sm:!max-w-[96vw] max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{activeBatch?.fileName || "Batch details"}</DialogTitle>
            <DialogDescription className="space-y-1">
              <span className="block">
                Uploaded {activeBatch?.uploadedAt ? new Date(activeBatch.uploadedAt).toLocaleString() : "N/A"} • Rows:{" "}
                {activeBatch?.rowCount ?? 0} • Unassigned: {activeBatch?.unassignedCount ?? 0} • Assigned:{" "}
                {activeBatch?.assignedCount ?? 0} • Completed: {activeBatch?.completedCount ?? 0}
              </span>
              <span className="block text-xs text-muted-foreground">{HR_UPLOAD_COUNT_LEGEND}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={batchMobileQuery}
              onChange={(e) => setBatchMobileQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void applyBatchMobileSearch()
              }}
              placeholder="Search this file by mobile…"
              inputMode="numeric"
              className="w-[220px] h-9"
            />
            <Button size="sm" className="gap-1" disabled={isLoadingBatchRows || !activeBatch} onClick={() => void applyBatchMobileSearch()}>
              {isLoadingBatchRows ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search mobile
            </Button>
            {batchMobileQuery ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={isLoadingBatchRows || !activeBatch}
                onClick={async () => {
                  setBatchMobileQuery("")
                  if (!activeBatch) return
                  setActiveBatchPage(1)
                  await loadBatchPreviewPage(activeBatch, 1, activeBatchLimit, "")
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
          <div className="border rounded-md">
            {isLoadingBatchRows ? (
              <div className="py-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading batch rows...
              </div>
            ) : activeBatchRows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No rows found for this batch.</p>
            ) : (
              <table className="w-full table-fixed text-sm">
                <thead className="sticky top-0 bg-background z-10">
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 px-3 w-[16%]">Name</th>
                    <th className="py-2 px-3 w-[12%]">Mobile</th>
                    <th className="py-2 px-3 w-[14%]">K Number</th>
                    <th className="py-2 px-3 w-[34%]">Address</th>
                    <th className="py-2 px-3 w-[14%]">Assigned Dealer</th>
                    <th className="py-2 px-3 w-[10%]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activeBatchRows.map((row, idx) => (
                    <tr key={`${activeBatch?.id || "batch"}-${row.mobile}-${idx}`} className="border-t border-border/40">
                      {(() => {
                        const display = getHrLeadRowDisplay(row)
                        return (
                          <>
                            <td className="py-2 px-3 break-words whitespace-normal">{row.name || "N/A"}</td>
                            <td className="py-2 px-3 break-all whitespace-normal">{row.mobile || "N/A"}</td>
                            <td className="py-2 px-3 break-all whitespace-normal">{row.kNumber || "N/A"}</td>
                            <td className="py-2 px-3 break-words whitespace-normal">{row.address || "N/A"}</td>
                            <td className="py-2 px-3 break-words whitespace-normal">{display.dealerLabel}</td>
                            <td className="py-2 px-3 break-words whitespace-normal">
                              <Badge variant="outline" className={display.statusBadgeClassName}>
                                {display.statusLabel}
                              </Badge>
                            </td>
                          </>
                        )
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {activeBatch ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-muted-foreground">
                Showing page {activeBatchPage} of {activeBatchTotalPages} • Total rows: {activeBatchTotalRows}
              </p>
              <div className="flex items-center gap-2">
                <Select
                  value={String(activeBatchLimit)}
                  onValueChange={async (value) => {
                    const nextLimit = Number(value)
                    setActiveBatchLimit(nextLimit)
                    setActiveBatchPage(1)
                    await loadBatchPreviewPage(activeBatch, 1, nextLimit)
                  }}
                >
                  <SelectTrigger className="w-24 h-8">
                    <SelectValue placeholder="Rows" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={activeBatchPage <= 1 || isLoadingBatchRows}
                  onClick={async () => {
                    const nextPage = Math.max(1, activeBatchPage - 1)
                    setActiveBatchPage(nextPage)
                    await loadBatchPreviewPage(activeBatch, nextPage, activeBatchLimit)
                  }}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={activeBatchPage >= activeBatchTotalPages || isLoadingBatchRows}
                  onClick={async () => {
                    const nextPage = Math.min(activeBatchTotalPages, activeBatchPage + 1)
                    setActiveBatchPage(nextPage)
                    await loadBatchPreviewPage(activeBatch, nextPage, activeBatchLimit)
                  }}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(addDealersBatch)}
        onOpenChange={(open) => {
          if (!open) {
            setAddDealersBatch(null)
            setAddDealerIds([])
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Manage dealers</DialogTitle>
            <DialogDescription>
              {addDealersBatch
                ? `Choose which Quotation-access dealers are in the pool for “${addDealersBatch.fileName}”. Checked = assigned to this batch; unchecked = removed.`
                : "Select dealers for this batch."}
            </DialogDescription>
          </DialogHeader>

          {addDealersBatch ? (
            <div className="space-y-3 overflow-hidden flex flex-col min-h-0">
              {addDealersBatch.unassignedCount > 0 || addDealersBatch.assignedCount > 0 ? (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  After save, each selected dealer keeps at most 1 active lead. Extra Assigned leads return to
                  Unassigned; Completed is unchanged. Only dealers with Dealer access are listed.
                  {addDealersBatch.unassignedCount > 0
                    ? ` Currently ${addDealersBatch.unassignedCount} unassigned.`
                    : ""}
                </p>
              ) : null}

              <div className="overflow-y-auto max-h-[42vh] space-y-2 pr-1">
                {quotationDealers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    No dealers with Dealer access. Enable Dealer in Admin → Users.
                  </p>
                ) : (
                  quotationDealers.map((dealer) => (
                    <label
                      key={dealer.id}
                      className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 cursor-pointer hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={addDealerIds.includes(dealer.id)}
                        onCheckedChange={() => toggleManageDealer(dealer.id)}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {dealer.firstName} {dealer.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {dealer.mobile} • {dealer.email}
                        </p>
                      </div>
                    </label>
                  ))
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1 border-t">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSavingDealers}
                  onClick={() => {
                    setAddDealersBatch(null)
                    setAddDealerIds([])
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isSavingDealers || addDealerIds.length === 0}
                  onClick={() => void saveManagedDealers()}
                  className="gap-1.5"
                >
                  {isSavingDealers ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserRoundPlus className="w-4 h-4" />}
                  Save dealers
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
