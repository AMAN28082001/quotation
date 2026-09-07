"use client"

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { DashboardNav } from "@/components/dashboard-nav"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Search,
  Loader2,
  Clock3,
  FileText,
  Users,
  IndianRupee,
  Calendar,
  TrendingUp,
  Eye,
  Building,
  Edit,
  Save,
  X,
  CheckCircle2,
  Plus,
  UserPlus,
  Trash2,
  UserCheck,
  UserX,
  Wallet,
  Package,
  History,
  SlidersHorizontal,
  Download,
  ChevronDown,
  RotateCcw,
  Gauge,
  ClipboardList,
  MapPin,
  Upload,
} from "lucide-react"
import type { FileLoginStatus, Quotation, QuotationStatus, StatusHistoryEntry } from "@/lib/quotation-context"
import type { Dealer, Visitor, AccountManager } from "@/lib/auth-context"
import { QuotationDetailsDialog } from "@/components/quotation-details-dialog"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  ExcelColumnPickerDialog,
  readRememberedExcelColumns,
  rememberExcelColumns,
} from "@/components/excel-column-picker-dialog"
import {
  columnOptionsFromHeaders,
  downloadCsvFile,
  filterRowsByColumnIds,
} from "@/lib/excel-column-export"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { api, ApiError, apiErrorToUserMessage, fetchSentToInstallerQuotationRows, getAuthToken, isApiAuthFailure, retrieveQuotationFromInstallation, retrieveQuotationFromMetering, sendQuotationToMetering } from "@/lib/api"
import { isQuotationAdminAccess } from "@/lib/admin-access"
import {
  ASSIGNABLE_USER_ACCESS_OPTIONS,
  accessLabels,
  getAccessOverride,
  hasAccess,
  listedUserHasAccess,
  normalizeAccessList,
  primaryBackendRoleFromAccess,
  resolveUserAccess,
  saveAccessOverride,
  type UserAccessKey,
} from "@/lib/user-access"
import {
  resolveUserModulePermissions,
  resolveUserOfficeLocation,
  saveModulePermissionOverride,
  saveOfficeLocationOverride,
  type ModuleFieldPermissions,
  type OfficeLocation,
} from "@/lib/module-field-permissions"
import {
  OfficeLocationSelect,
  WorkflowModuleInlineControls,
  isWorkflowAccessKey,
  patchModuleFieldPermission,
} from "@/components/module-field-permissions-editor"
import { syncAssignableVisitorsFromUsers } from "@/lib/visitor-assignable-directory"
import { syncAssignableQuotationFromUsers } from "@/lib/quotation-assignable-directory"
import { useQuotationDocumentFileUpload } from "@/hooks/use-quotation-document-file-upload"
import { buildDocumentsMultipartFormData, firstPendingDocumentFileField } from "@/lib/quotation-documents-form"
import { getRealtime } from "@/lib/realtime"
import { governmentIds, indianStates } from "@/lib/quotation-data"
import { AdminProductManagement } from "@/components/admin-product-management"
import { AdminPricingTablesManagement } from "@/components/admin-pricing-tables-management"
import { AdminProductNeededPanel } from "@/components/admin-product-needed-panel"
import { CustomerJourneyPanel } from "@/components/customer-journey-panel"
import { FullCustomerJourneyPanel } from "@/components/full-customer-journey-panel"
import { DealersByRevenueCharts } from "@/components/dealers-by-revenue-charts"
import { getJourneyDateRangeBounds, getJourneyHoldInfo, getJourneyStageProgress, formatJourneyStageStatusLabel, type JourneyDateRangeFilter } from "@/lib/customer-journey"
import {
  getQuotationApprovalDate,
  matchesQuotationApprovalDateFilter,
} from "@/lib/quotation-approval-date"
import { InstallationCompletionPanel, type InstallationUploadedFile } from "@/components/installation-completion-panel"
import { calculateSystemSize, setPricingData } from "@/lib/pricing-tables"
import { useToast } from "@/hooks/use-toast"
import { useIncrementalList } from "@/hooks/use-incremental-list"
import { IncrementalListSentinel } from "@/components/incremental-list-sentinel"
import { formatPersonName } from "@/lib/name-display"
import {
  callingActionRowKey,
  extractCallingActionsFromApiResponse,
  formatYmdLocal,
  getCustomBoundsFromYmd,
  getPresetBounds,
  isCallingActionInBounds,
  latestCallingActionPerContact,
  parseCallingActionAt,
} from "@/lib/calling-report-date-range"
import {
  buildCallingActionSummary,
  buildCallingConnectionSummary,
  CALLING_CONNECTION_LABELS,
  CALLING_SUMMARY_BUCKET_LABELS,
  classifyCallingActionSummaryBucket,
  classifyCallingConnection,
  getCallingActionSummaryBadgeClass,
  getCallingConnectionBadgeClass,
  resolveCallingActionFields,
} from "@/lib/calling-action-summary"
import { filterActiveDealers } from "@/lib/active-dealers"
import { AdminVisitDetailsDialog } from "@/components/admin-visit-details-dialog"
import { loadAdminVisitorReportRows } from "@/lib/load-admin-visitor-reports"
import { fetchAllPaginatedQuotationListPages } from "@/lib/fetch-paginated-quotation-list"
import {
  buildVisitStatusSummary,
  getVisitStatusBadgeClass,
  getVisitStatusLabel,
  type AdminVisitReportRow,
  type VisitStatusFilter,
  VISIT_STATUS_FILTER_OPTIONS,
  visitMatchesDateRange,
  visitMatchesSearch,
  visitMatchesStatusFilter,
  visitMatchesVisitorFilter,
} from "@/lib/visit-report"
import {
  formatOverviewKw,
  getQuotationSystemKw,
  resolveQuotationProductsForKw,
  sumQuotationsSystemKw,
} from "@/lib/quotation-system-kw"
import { mergeQuotationProductSources, omitEmptyProductsField } from "@/lib/merge-quotation-products"
import { applyQuotationDetailToRow } from "@/lib/apply-quotation-detail-to-row"
import { downloadQuotationDocumentsZip } from "@/lib/documents-zip-download"
import { openQuotationDocumentPreview } from "@/lib/open-quotation-document-preview"
import { CityMultiSelectFilter } from "@/components/city-multi-select-filter"
import { matchesCityFilter } from "@/lib/service-cities"
import { cn } from "@/lib/utils"
import { confirmSave } from "@/lib/confirm-save"
import {
  annotateQuotationsWithCurrent,
  getCustomerMobileFromQuotation,
  groupQuotationsByCustomerCurrentFirst,
  keepCurrentQuotationsOnly,
  setCurrentQuotationForMobile,
} from "@/lib/quotation-current"
import {
  getInstallationWorkflowStatus,
  getMeteringWorkflowRaw,
  isAwaitingManualMeteringHandoff,
  getQuotationOpsStageLabel,
  getSendToMeteringMenuState,
  getAdminQuotationsTabSendToMeteringState,
  getAdminQuotationsTabRetrieveState,
  getRetrieveFromInstallationState,
  getAdminInstallationTabRevertState,
  clearInstallerReleaseInLocalMap,
  getMeteringWorkflowStage,
  isMeteringApprovedForTransition,
  readInstallationScheduledMap,
  readInstallerReleaseMap,
  isQuotationSentToInstaller,
  shouldShowInAdminInstallationTab,
  mergeInstallerReleaseOntoQuotation,
  mergeAdminMeteringHandoffOntoQuotation,
  readAdminMeteringHandoffMap,
  markAdminMeteringHandoff,
  clearAdminMeteringHandoff,
  syncAdminMeteringHandoffMapFromRows,
  isInstallationApprovedForAdminTab,
  isInstallationPartialApproved,
  getInstallationAdminTabProgress,
  setInstallationScheduledDateInLocalMap,
  extractQuotationListFromApiResponse,
  extractQuotationListTotalFromApiResponse,
  type OperationalQuotationRecord,
  flattenWrappedQuotationRow,
  flattenQuotationListRow,
  stampInstallerReleaseFromMap,
  syncInstallerReleaseMapFromRows,
  mergeInstallationMediaSources,
} from "@/lib/operational-install-queue"
import { normalizeMediaUrl, pickMediaUrlFromValue, toPublicOpenHref } from "@/lib/media-url"
import { InstallationPublicPhoto } from "@/components/installation-public-photo"
import {
  gatherInstallationPublicImageUrls,
} from "@/lib/installation-public-images"
import { StoredMediaPreview } from "@/components/stored-media-preview"
import { parseMeterDocumentNameFromApiPayload, parseMeterDocumentUrlFromApiPayload, readQuotationMeterDocument, toMeterDocumentPublicViewUrl } from "@/lib/parse-api-media"
import {
  createInstallationTeam,
  deleteInstallationTeam,
  getInstallationTeamIdForQuotation,
  type InstallationTeamRecord,
  readInstallationTeams,
  readTeamAssignments,
  setTeamAssignment,
  writeInstallationTeams,
} from "@/lib/installation-teams"

// Admin username check
const ADMIN_USERNAME = "admin"

/** Same basis as dealer dashboard / quotation AMOUNT column. */
function getQuotationDisplayAmount(quotation: {
  subtotal?: number
  totalAmount?: number
  finalAmount?: number
}): number {
  return Math.abs(quotation.subtotal ?? quotation.totalAmount ?? quotation.finalAmount ?? 0)
}

function getQuotationSubtotalValue(quotation: {
  subtotal?: number
  totalAmount?: number
  finalAmount?: number
  pricing?: { subtotal?: number; finalAmount?: number } | null
}): number {
  return Math.abs(
    quotation.pricing?.subtotal ??
      quotation.pricing?.finalAmount ??
      quotation.subtotal ??
      quotation.totalAmount ??
      quotation.finalAmount ??
      0,
  )
}

function formatQuotationAmountInr(quotation: {
  subtotal?: number
  totalAmount?: number
  finalAmount?: number
  pricing?: { subtotal?: number; finalAmount?: number } | null
}): string {
  return `₹${getQuotationSubtotalValue(quotation).toLocaleString("en-IN")}`
}

function parseInrAmountInput(raw: string): number | null {
  const cleaned = raw.replace(/[₹,\s]/g, "").trim()
  if (!cleaned) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value)
}

function readQuotationLoanCashAmounts(q: Quotation | Record<string, unknown>): {
  loan?: number
  cash?: number
} {
  const r = q as Record<string, unknown>
  const loanRaw = Number(r.loanAmount ?? r.loan_amount)
  const cashRaw = Number(r.cashAmount ?? r.cash_amount)
  return {
    loan: Number.isFinite(loanRaw) && loanRaw > 0 ? Math.round(loanRaw) : undefined,
    cash: Number.isFinite(cashRaw) && cashRaw > 0 ? Math.round(cashRaw) : undefined,
  }
}

function getMeteringAssignedPersonName(q: Quotation | Record<string, unknown>): string {
  const r = q as Record<string, unknown>
  return String(
    r.authorizedRepresentative ||
      r.authorized_representative ||
      r.assignedPersonName ||
      r.assigned_person_name ||
      "",
  ).trim()
}

function meteringStageBadgeTone(stage: "processing" | "approved" | "meter_install" | "mco" | null): string {
  if (stage === "processing") return "border-amber-300/80 bg-amber-50 text-amber-800"
  if (stage === "approved") return "border-sky-300/80 bg-sky-50 text-sky-800"
  if (stage === "meter_install") return "border-violet-300/80 bg-violet-50 text-violet-800"
  if (stage === "mco") return "border-emerald-300/80 bg-emerald-50 text-emerald-800"
  return "border-border bg-muted/40 text-muted-foreground"
}

function installerStageBadgeTone(status: string): string {
  if (status === "approved") return "border-green-300/80 bg-green-50 text-green-800"
  // Partial Approved tab → show as In Progress
  if (status === "partial" || status === "inprogress") return "border-sky-300/80 bg-sky-50 text-sky-800"
  return "border-amber-300/80 bg-amber-50 text-amber-800"
}

/** STATUS column labels aligned with Installation sub-tabs. */
function installerQueueStatusDisplayLabel(
  status: "pending" | "inprogress" | "partial" | "approved",
): string {
  if (status === "approved") return "Approved"
  if (status === "partial") return "In Progress"
  // Pending Installation tab (includes started / in-progress uploads not yet partial)
  return "Pending"
}

/**
 * Prefer approval-time payment type / mode over file-login draft.
 * File login is only a preliminary choice — after approve, paymentMode/paymentType is source of truth.
 * (Preferring filePaymentType made Cash+loan rows still render as full "Loan ₹total".)
 */
function getQuotationPaymentTypeRaw(q: Quotation | Record<string, unknown>): string {
  const r = q as Record<string, unknown>
  const approved = String(r.paymentType || r.payment_type || r.paymentMode || r.payment_mode || "")
    .trim()
    .toLowerCase()
  if (approved === "loan" || approved === "cash" || approved === "mix") return approved
  return String(r.filePaymentType || r.file_payment_type || "")
    .trim()
    .toLowerCase()
}

function readQuotationPaymentPhases(
  q: Quotation | Record<string, unknown>,
): Array<{ phaseNumber: number; amount: number }> {
  const r = q as Record<string, unknown>
  const raw =
    r.paymentPhases ||
    r.payment_phases ||
    r.installments ||
    r.phases ||
    null
  if (!Array.isArray(raw)) return []
  return raw.map((phase: any, index: number) => ({
    phaseNumber: Number(phase?.phaseNumber ?? phase?.phase_number ?? index + 1),
    amount: Math.round(Number(phase?.amount ?? 0)) || 0,
  }))
}

function getSecondInstallmentAmount(q: Quotation | Record<string, unknown>): number | undefined {
  const phases = readQuotationPaymentPhases(q)
  if (phases.length === 0) return undefined
  const byNumber = phases.find((p) => p.phaseNumber === 2)
  if (byNumber && byNumber.amount > 0) return byNumber.amount
  const sorted = [...phases].sort((a, b) => a.phaseNumber - b.phaseNumber)
  const second = sorted[1]
  return second && second.amount > 0 ? second.amount : undefined
}

function getMeteringBankDetailsLabel(q: Quotation | Record<string, unknown>): string {
  const r = q as Record<string, unknown>
  const bank = String(r.fileBankName || r.file_bank_name || r.bankName || r.bank_name || "").trim()
  const ifsc = String(r.fileBankIfsc || r.file_bank_ifsc || r.bankIfsc || r.bank_ifsc || "")
    .trim()
    .toUpperCase()
  if (!bank && !ifsc) return ""
  if (bank && ifsc) return `${bank} · ${ifsc}`
  return bank || ifsc
}

/** Pure loan files (payment type loan). */
function isMeteringLoanOnlyQuotation(q: Quotation | Record<string, unknown>): boolean {
  return getQuotationPaymentTypeRaw(q) === "loan"
}

/** Cash + loan files (payment type mix). */
function isMeteringLoanMixQuotation(q: Quotation | Record<string, unknown>): boolean {
  return getQuotationPaymentTypeRaw(q) === "mix"
}

/** Loan or Cash + loan — Bank process / Pending payment tabs. */
function isMeteringBankProcessEligible(q: Quotation | Record<string, unknown>): boolean {
  return isMeteringLoanOnlyQuotation(q) || isMeteringLoanMixQuotation(q)
}

/**
 * Metering amount cell:
 * - Loan: primary = loan amount; I2 + bank under it.
 * - Cash + loan: primary = total; Loan + Cash lines under it; I2 + bank.
 * - Other types: quotation subtotal only.
 */
function getMeteringAmountDisplay(quotation: Quotation | Record<string, unknown>): {
  primaryLabel: string
  secondInstallmentLabel?: string
  bankLabel?: string
  /** @deprecated use primaryLabel */
  totalLabel: string
  loanLabel?: string
  cashLabel?: string
} {
  const paymentType = getQuotationPaymentTypeRaw(quotation)
  const { loan, cash } = readQuotationLoanCashAmounts(quotation)
  const subtotalLabel = formatQuotationAmountInr(quotation as Quotation)
  const bankLabel = getMeteringBankDetailsLabel(quotation) || undefined
  const i2 = getSecondInstallmentAmount(quotation)

  if (paymentType === "loan") {
    const primaryLabel = loan != null ? `₹${loan.toLocaleString("en-IN")}` : subtotalLabel
    return {
      primaryLabel,
      totalLabel: primaryLabel,
      secondInstallmentLabel: i2 != null ? `I2 ₹${i2.toLocaleString("en-IN")}` : "I2 —",
      bankLabel,
      loanLabel: loan != null ? `Loan ₹${loan.toLocaleString("en-IN")}` : undefined,
    }
  }

  if (paymentType === "mix") {
    const subtotal = getQuotationSubtotalValue(quotation as Quotation)
    // Incomplete split (loan == full total, cash missing) — don't label full amount as loan.
    const showLoan = loan != null && (cash != null || loan < subtotal)
    return {
      primaryLabel: subtotalLabel,
      totalLabel: subtotalLabel,
      secondInstallmentLabel: i2 != null ? `I2 ₹${i2.toLocaleString("en-IN")}` : "I2 —",
      bankLabel,
      loanLabel: showLoan ? `Loan ₹${loan!.toLocaleString("en-IN")}` : undefined,
      cashLabel: cash != null ? `Cash ₹${cash.toLocaleString("en-IN")}` : undefined,
    }
  }

  return { primaryLabel: subtotalLabel, totalLabel: subtotalLabel }
}

function MeteringAmountCell({
  quotation,
  primaryClassName = "text-xs font-semibold",
  secondaryClassName = "text-[10px] text-muted-foreground",
}: {
  quotation: Quotation | Record<string, unknown>
  primaryClassName?: string
  secondaryClassName?: string
}) {
  const amt = getMeteringAmountDisplay(quotation)
  return (
    <div>
      <p className={primaryClassName}>{amt.primaryLabel}</p>
      {amt.loanLabel ? <p className={secondaryClassName}>{amt.loanLabel}</p> : null}
      {amt.cashLabel ? <p className={secondaryClassName}>{amt.cashLabel}</p> : null}
      {amt.secondInstallmentLabel ? (
        <p className={secondaryClassName}>{amt.secondInstallmentLabel}</p>
      ) : null}
      {amt.bankLabel ? (
        <p className={cn(secondaryClassName, "max-w-[11rem] truncate")} title={amt.bankLabel}>
          {amt.bankLabel}
        </p>
      ) : null}
    </div>
  )
}

/** Approved quotations list / CSV — show loan & cash separately for Cash + loan. */
function QuotationApprovedAmountLines(quotation: Quotation | Record<string, unknown>): {
  total: number
  paymentType: string
  loan?: number
  cash?: number
} {
  const paymentType = getQuotationPaymentTypeRaw(quotation)
  let { loan, cash } = readQuotationLoanCashAmounts(quotation)
  const total = getQuotationSubtotalValue(quotation as Quotation)
  // Incomplete mix split (cash missing, loan == full total) — hide misleading "Loan ₹total".
  if (paymentType === "mix" && cash == null && loan != null && total > 0 && loan >= total) {
    loan = undefined
  }
  return { total, paymentType, loan, cash }
}

function formatOverviewRevenueLakh(amount: number): string {
  return `₹${(amount / 100000).toFixed(1)}L`
}

function toDateTimeLocalValue(input?: string | null): string {
  if (!input) return ""
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  const yyyy = d.getFullYear()
  const mm = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const hh = pad(d.getHours())
  const min = pad(d.getMinutes())
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

function parseDateTimeLocalToIso(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const dt = new Date(trimmed)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString()
}

function matchesOverviewTopDealersApprovalDate(
  quotation: Quotation,
  filter: JourneyDateRangeFilter,
  customFromYmd: string,
  customToYmd: string,
): boolean {
  return matchesQuotationApprovalDateFilter(quotation, filter, customFromYmd, customToYmd)
}

const INSTALLATION_APPROVED_MEDIA_STATUSES = new Set([
  "installer_approved",
  "pending_metering",
  "metering_in_progress",
  "metering_approved",
  "meter_installation_pending",
  "mco",
  "pending_baldev",
  "baldev_approved",
  "completed",
])

/** Dealers by Revenue list: visible viewport fits this many rows before scrolling. */
const DEALERS_BY_REVENUE_VISIBLE_ROWS = 5

const ADMIN_OPERATIONAL_STAGES = [
  "pending_installer",
  "installer_in_progress",
  "installer_partial_approved",
  "installer_approved",
  "pending_metering",
  "metering_in_progress",
  "metering_approved",
  "meter_installation_pending",
  "mco",
  "pending_baldev",
  "baldev_approved",
  "completed",
] as const
type AdminOperationalStage = (typeof ADMIN_OPERATIONAL_STAGES)[number]
type AdminOperationalTab = "all" | "installation" | "metering" | "confirmation"
type AdminOperationalProgressTab =
  | "all"
  | "pending"
  | "partial"
  | "done"
  | "mco"
  | "wcc"
  | "meter_install"
  | "dcr"
  | "bank_process"
  | "pending_payment"
  | "metering_send"
  | "metering_retrieve"
type AdminMeteringModalDraft = {
  discomName: string
  meterType: "" | "solar" | "net" | "both"
  meterNo: string
  solarMeterNo: string
  netMeterNo: string
  remarks: string
  authorizedRepresentative: string
  discomLocation: string
}
const ADMIN_INSTALLATION_IMAGE_FIELDS = [
  { key: "homeFrontPhoto", label: "Front Photo of Home", required: false },
  { key: "homeWithPersonPhoto", label: "Front Photo of Home with person", required: false },
  { key: "inverterWithCustomerPhoto", label: "Inverter Photo with customer", required: false },
  { key: "plantWithCustomerPhoto", label: "Plant photo with Customer", required: false },
  { key: "inverterSerialNumberPhoto", label: "Inverter Photo with Serial No", required: false },
  { key: "panelSerialNumberPhoto", label: "Panels photo with Serial No", multiple: true, required: false },
  { key: "geoTagPlantPhoto", label: "GeoTag photo with plants", required: false },
  { key: "otherImages", label: "Others Images", multiple: true, required: false },
] as const

/** WCC modal only shows inverter + plant-with-customer photos. */
const ADMIN_WCC_IMAGE_FIELDS = ADMIN_INSTALLATION_IMAGE_FIELDS.filter(
  (f) => f.key === "inverterWithCustomerPhoto" || f.key === "plantWithCustomerPhoto",
)

type AdminInstallationImageFieldKey = (typeof ADMIN_INSTALLATION_IMAGE_FIELDS)[number]["key"]
type AdminImageFieldConfig = (typeof ADMIN_INSTALLATION_IMAGE_FIELDS)[number] & { required?: boolean; multiple?: boolean }
const isAdminImageFieldRequired = (field: (typeof ADMIN_INSTALLATION_IMAGE_FIELDS)[number]) =>
  (field as AdminImageFieldConfig).required !== false
const isAdminImageFieldMultiple = (field: (typeof ADMIN_INSTALLATION_IMAGE_FIELDS)[number]) =>
  (field as AdminImageFieldConfig).multiple === true
type AdminExtraExpenseLine = { id: string; description: string; amount: string }
const newAdminExpenseLineId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `exp-${Date.now()}-${Math.random().toString(16).slice(2)}`

/** Slot = saved URL from API and/or a new `File` chosen in the panel (`localFile`). */
type AdminInstallMedia = InstallationUploadedFile & { localFile?: File }

function pickNonEmptyString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim()
  return undefined
}

function collectUrlsForInstallField(fieldKey: string, ...containers: unknown[]): string[] {
  const snake = fieldKey.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
  const urls: string[] = []
  const addValue = (value: unknown) => {
    if (value == null) return
    if (Array.isArray(value)) {
      for (const item of value) addValue(item)
      return
    }
    const normalized =
      toPublicOpenHref(typeof value === "string" ? value : pickMediaUrlFromValue(value) || value) ||
      (typeof value === "string" && value.trim() ? value.trim() : undefined)
    if (normalized && !urls.includes(normalized)) urls.push(normalized)
  }
  for (const raw of containers) {
    const o = raw as Record<string, unknown> | null | undefined
    if (!o || typeof o !== "object" || Array.isArray(o)) continue
    addValue(o[`${fieldKey}PublicUrl`])
    addValue(o[`${fieldKey}_public_url`])
    addValue(o[`${snake}_public_url`])
    addValue(o[`${fieldKey}Url`])
    addValue(o[`${fieldKey}_url`])
    addValue(o[`${snake}_url`])
    addValue(o[fieldKey])
    addValue(o[snake])
    const arrKeys = [`${fieldKey}s`, `${fieldKey}Urls`, `${fieldKey}_urls`, `${snake}s`, `${snake}_urls`]
    for (const k of arrKeys) addValue(o[k])
    const bags = [o.installationPhotos, o.installation_photos, o.completionPhotos, o.completion_photos, o.images, o.photos]
    for (const bag of bags) {
      if (bag && typeof bag === "object" && !Array.isArray(bag)) {
        const b = bag as Record<string, unknown>
        addValue(b[fieldKey])
        addValue(b[snake])
      }
    }
  }
  return urls
}

function extractAdminInstallationMediaFromQuotation(q: Record<string, unknown>): Partial<Record<AdminInstallationImageFieldKey, AdminInstallMedia[]>> {
  const doc = (q.documents || q.document || q.installationDocuments || q.quotationDocuments || {}) as Record<string, unknown>
  const inst = (q.installation || q.installerInstallation || q.installationCompletion || q.installerCompletion || {}) as Record<string, unknown>
  const extra = [
    (doc as Record<string, unknown>).installation,
    (doc as Record<string, unknown>).installerCompletion,
    (inst as Record<string, unknown>).documents,
    (inst as Record<string, unknown>).images,
    (inst as Record<string, unknown>).photos,
  ]
  const out: Partial<Record<AdminInstallationImageFieldKey, AdminInstallMedia[]>> = {}
  for (const f of ADMIN_INSTALLATION_IMAGE_FIELDS) {
    const urls = collectUrlsForInstallField(f.key, doc, q, inst, ...extra)
    if (urls.length)
      out[f.key] = urls.map((url, i) => ({
        name: url.split("/").pop()?.split("?")[0] || `${f.key}-${i + 1}`,
        url: toPublicOpenHref(url) || url,
      }))
  }
  return out
}

function extractPiMediaListFromQuotation(q: Record<string, unknown>): AdminInstallMedia[] {
  const doc = (q.documents || q.document || {}) as Record<string, unknown>
  const urls: string[] = []
  const add = (s?: string) => {
    const normalized = toPublicOpenHref(s) || (s && s.trim() ? s.trim() : "")
    if (normalized && !urls.includes(normalized)) urls.push(normalized)
  }

  const arrayCandidates = [
    doc.piUploadUrls,
    doc.pi_upload_urls,
    doc.piUploads,
    doc.pi_uploads,
    q.piUploadUrls,
    q.pi_upload_urls,
    q.piUploads,
    q.pi_uploads,
  ]
  for (const arr of arrayCandidates) {
    if (!Array.isArray(arr)) continue
    for (const item of arr) {
      if (typeof item === "string") add(item)
      else if (item && typeof item === "object") add(pickMediaUrlFromValue(item))
    }
  }

  add(pickNonEmptyString(doc.piUploadUrl))
  add(pickNonEmptyString(doc.pi_upload_url))
  add(pickNonEmptyString(q.piUploadUrl))
  add(pickNonEmptyString(q.pi_upload_url))

  return urls.map((url, i) => ({
    name:
      pickNonEmptyString(doc.piUploadFileName) ||
      pickNonEmptyString(doc.pi_upload_file_name) ||
      url.split("/").pop()?.split("?")[0] ||
      `PI-${i + 1}`,
    url,
  }))
}

function extractPiMediaFromQuotation(q: Record<string, unknown>): AdminInstallMedia | null {
  return extractPiMediaListFromQuotation(q)[0] || null
}

function addDedupedUrl(sink: string[], max: number, s?: string) {
  const normalized = toPublicOpenHref(s)
  if (!normalized || sink.includes(normalized) || sink.length >= max) return
  sink.push(normalized)
}

/** Installation photos uploaded, or workflow advanced past installer completion. */
function isInstallationUploadComplete(quotation: Quotation, approvedQueueIds?: Set<string>): boolean {
  const q = quotation as unknown as Record<string, unknown>
  const inApprovedQueue = approvedQueueIds?.has(quotation.id) ?? false
  const imageCount = gatherInstallationPublicImageUrls(q).length
  return isInstallationApprovedForAdminTab(q, {
    imageUrlCount: imageCount,
    inInstallerApprovedQueue: inApprovedQueue,
  })
}

function AdminQuotationDealerBlock({
  quotation,
  dealers,
}: {
  quotation: Quotation
  dealers: Dealer[]
}) {
  const q = quotation as unknown as Record<string, unknown>
  const nested = q.dealer as Record<string, unknown> | null | undefined
  const fromList = dealers.find((d) => d.id === quotation.dealerId)
  const name =
    (nested && typeof nested === "object"
      ? formatPersonName(
          String(nested.firstName || ""),
          String(nested.lastName || ""),
          String(nested.username || "").trim() || "Dealer",
        )
      : "") ||
    (fromList ? formatPersonName(fromList.firstName, fromList.lastName, "Dealer") : "Unknown Dealer")
  const mobile =
    (nested && typeof nested === "object" ? String(nested.mobile || nested.phone || "").trim() : "") ||
    fromList?.mobile ||
    "—"

  return (
    <div className="mt-2 border-t border-dashed border-border/60 pt-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/90">Dealer</p>
      <p className="text-xs font-medium leading-snug text-foreground">{name}</p>
      <p className="text-[11px] text-muted-foreground">{mobile}</p>
    </div>
  )
}

type CallingActionRecord = {
  id: string
  leadId: string
  dealerId: string
  dealerName: string
  customerName: string
  customerMobile: string
  action: string
  callRemark: string
  statusCategory?: string
  statusText?: string
  actionAt: string
  nextFollowUpAt?: string
}

type ApprovalPaymentType = "loan" | "cash" | "mix"

/** YYYY-MM-DD, local calendar (avoids UTC shifting calendar day). */
function addCalendarDaysFromDateString(dateStr: string, days: number): string {
  const base = new Date(dateStr)
  if (Number.isNaN(base.getTime())) return ""
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function toYmdFromStored(stored: string | undefined): string {
  if (!stored) return ""
  const t = stored.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return ""
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Calendar days past a YYYY-MM-DD date (local). Negative = still upcoming. */
function getInstallationDateOverdueDays(ymd: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const [y, m, d] = ymd.split("-").map(Number)
  const installLocal = new Date(y, m - 1, d)
  if (Number.isNaN(installLocal.getTime())) return null
  const now = new Date()
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.floor((todayLocal.getTime() - installLocal.getTime()) / 86_400_000)
}

function overdueToneFromDays(overdueDays: number | null): "none" | "yellow" | "red" {
  if (overdueDays == null) return "none"
  if (overdueDays >= 10) return "red"
  if (overdueDays >= 5) return "yellow"
  return "none"
}

/** Pending/in-progress install rows: yellow from day 5 overdue, red from day 10. */
function installationOverdueTone(
  installYmd: string,
  installerStatus: "pending" | "inprogress" | "partial" | "approved",
): "none" | "yellow" | "red" {
  if (installerStatus === "approved") return "none"
  return overdueToneFromDays(getInstallationDateOverdueDays(installYmd))
}

function toYmdFromAnyDate(raw: unknown): string {
  if (!raw) return ""
  if (typeof raw === "string") {
    const stored = toYmdFromStored(raw)
    if (stored) return stored
  }
  const d = new Date(raw as string)
  if (Number.isNaN(d.getTime())) return ""
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/**
 * Date shown in Admin Metering DATE column — colour + overdue filter use this same value.
 */
function resolveAdminMeteringReferenceYmd(
  quotation: Quotation,
  meteringStage: "processing" | "approved" | "meter_install" | "mco" | null,
): string {
  const qAny = quotation as unknown as Record<string, unknown>
  if (meteringStage === "mco") {
    return (
      toYmdFromAnyDate(qAny.mcoAt) ||
      toYmdFromAnyDate(qAny.mco_at) ||
      toYmdFromAnyDate(qAny.meteringApprovedAt) ||
      toYmdFromAnyDate(qAny.metering_approved_at) ||
      toYmdFromAnyDate(qAny.approvedAt) ||
      toYmdFromAnyDate(qAny.approvedDate) ||
      toYmdFromAnyDate(qAny.statusUpdatedAt) ||
      toYmdFromAnyDate(quotation.createdAt)
    )
  }
  if (meteringStage === "approved" || meteringStage === "meter_install") {
    return (
      toYmdFromAnyDate(qAny.meteringApprovedAt) ||
      toYmdFromAnyDate(qAny.metering_approved_at) ||
      toYmdFromAnyDate(qAny.approvedAt) ||
      toYmdFromAnyDate(qAny.approvedDate) ||
      toYmdFromAnyDate(qAny.statusUpdatedAt) ||
      toYmdFromAnyDate(quotation.createdAt)
    )
  }
  // Meter Pending: same fields as the previous DATE column.
  return (
    toYmdFromAnyDate(qAny.approvedAt) ||
    toYmdFromAnyDate(qAny.approvedDate) ||
    toYmdFromAnyDate(qAny.statusUpdatedAt) ||
    toYmdFromAnyDate(quotation.createdAt)
  )
}

function formatYmdEnIn(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ""
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-IN")
}

/** True when Work Completion Certificate / Warranty (WCC) is already on the quotation. */
function hasWorkCompletionWarrantyFile(q: Quotation | Record<string, unknown>): boolean {
  const r = q as Record<string, unknown>
  return Boolean(
    String(r.workCompletionWarrantyFileUrl || r.work_completion_warranty_file_url || "").trim() ||
      String(r.workCompletionWarrantyFileName || r.work_completion_warranty_file_name || "").trim(),
  )
}

type AdminFinalConfirmationDocKey =
  | "customerFinalBill"
  | "panelWarranty"
  | "inverterWarranty"
  | "workCompletionWarranty"

const ADMIN_FINAL_CONFIRMATION_DOC_FIELDS: Array<{
  key: AdminFinalConfirmationDocKey
  label: string
  urlKeys: string[]
  nameKeys: string[]
  fileStateKey:
    | "customerFinalBillFile"
    | "panelWarrantyFile"
    | "inverterWarrantyFile"
    | "workCompletionWarrantyFile"
}> = [
  {
    key: "customerFinalBill",
    label: "Customer Final Bill (PDF/JPG)",
    urlKeys: [
      "customerFinalBillFileUrl",
      "customer_final_bill_file_url",
      "customerFinalBillUrl",
      "customer_final_bill_url",
    ],
    nameKeys: ["customerFinalBillFileName", "customer_final_bill_file_name"],
    fileStateKey: "customerFinalBillFile",
  },
  {
    key: "panelWarranty",
    label: "Panel Warranty (PDF/JPG)",
    urlKeys: ["panelWarrantyFileUrl", "panel_warranty_file_url", "panelWarrantyUrl", "panel_warranty_url"],
    nameKeys: ["panelWarrantyFileName", "panel_warranty_file_name"],
    fileStateKey: "panelWarrantyFile",
  },
  {
    key: "inverterWarranty",
    label: "Inverter Warranty (PDF/JPG)",
    urlKeys: [
      "inverterWarrantyFileUrl",
      "inverter_warranty_file_url",
      "inverterWarrantyUrl",
      "inverter_warranty_url",
    ],
    nameKeys: ["inverterWarrantyFileName", "inverter_warranty_file_name"],
    fileStateKey: "inverterWarrantyFile",
  },
  {
    key: "workCompletionWarranty",
    label: "Work Completion Warranty (PDF/JPG)",
    urlKeys: [
      "workCompletionWarrantyFileUrl",
      "work_completion_warranty_file_url",
      "workCompletionWarrantyUrl",
      "work_completion_warranty_url",
    ],
    nameKeys: ["workCompletionWarrantyFileName", "work_completion_warranty_file_name"],
    fileStateKey: "workCompletionWarrantyFile",
  },
]

function pickFirstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? "").trim()
    if (text) return text
  }
  return ""
}

/** Read saved Final confirmation doc URL/name from quotation / nested documents. */
function readAdminFinalConfirmationDoc(
  quotation: Quotation | Record<string, unknown>,
  key: AdminFinalConfirmationDocKey,
): { url: string; name: string } {
  const field = ADMIN_FINAL_CONFIRMATION_DOC_FIELDS.find((item) => item.key === key)
  if (!field) return { url: "", name: "" }
  const root = quotation as Record<string, unknown>
  const docs =
    root.documents && typeof root.documents === "object" && !Array.isArray(root.documents)
      ? (root.documents as Record<string, unknown>)
      : root.document && typeof root.document === "object" && !Array.isArray(root.document)
        ? (root.document as Record<string, unknown>)
        : null
  const sources = docs ? [root, docs] : [root]
  let url = ""
  let name = ""
  for (const source of sources) {
    if (!url) url = pickFirstNonEmptyString(...field.urlKeys.map((k) => source[k]))
    if (!name) name = pickFirstNonEmptyString(...field.nameKeys.map((k) => source[k]))
  }
  return { url, name }
}

function countAdminFinalConfirmationDocsUploaded(
  quotation: Quotation | Record<string, unknown>,
): { uploaded: number; total: number } {
  let uploaded = 0
  for (const field of ADMIN_FINAL_CONFIRMATION_DOC_FIELDS) {
    const saved = readAdminFinalConfirmationDoc(quotation, field.key)
    if (saved.url || saved.name) uploaded += 1
  }
  return { uploaded, total: ADMIN_FINAL_CONFIRMATION_DOC_FIELDS.length }
}

function mergeAdminFinalConfirmationUploadIntoQuotation(
  quotation: Quotation,
  uploadResult: unknown,
  localFiles: {
    customerFinalBillFile?: File | null
    panelWarrantyFile?: File | null
    inverterWarrantyFile?: File | null
    workCompletionWarrantyFile?: File | null
  },
): Quotation {
  const payload =
    uploadResult && typeof uploadResult === "object"
      ? ((uploadResult as Record<string, unknown>).quotation as Record<string, unknown> | undefined) ||
        ((uploadResult as Record<string, unknown>).data as Record<string, unknown> | undefined) ||
        (uploadResult as Record<string, unknown>)
      : {}
  const next: Record<string, unknown> = { ...(quotation as unknown as Record<string, unknown>) }

  const applyField = (
    key: AdminFinalConfirmationDocKey,
    localFile: File | null | undefined,
    formField: string,
  ) => {
    const field = ADMIN_FINAL_CONFIRMATION_DOC_FIELDS.find((item) => item.key === key)!
    const fromPayloadUrl = pickFirstNonEmptyString(
      ...field.urlKeys.map((k) => payload[k]),
      (payload as Record<string, unknown>)[formField],
      (payload as Record<string, unknown>)[`${formField}Url`],
      (payload as Record<string, unknown>)[`${formField}_url`],
    )
    const fromPayloadName = pickFirstNonEmptyString(
      ...field.nameKeys.map((k) => payload[k]),
      localFile?.name,
    )
    if (fromPayloadUrl) {
      next[field.urlKeys[0]] = fromPayloadUrl
      next[field.urlKeys[1]] = fromPayloadUrl
    }
    if (fromPayloadName) {
      next[field.nameKeys[0]] = fromPayloadName
      next[field.nameKeys[1]] = fromPayloadName
    } else if (localFile && !fromPayloadUrl) {
      // Optimistic: mark uploaded by file name until list refresh returns URL.
      next[field.nameKeys[0]] = localFile.name
      next[field.nameKeys[1]] = localFile.name
    }
  }

  applyField("customerFinalBill", localFiles.customerFinalBillFile, "customerFinalBillFile")
  applyField("panelWarranty", localFiles.panelWarrantyFile, "panelWarrantyFile")
  applyField("inverterWarranty", localFiles.inverterWarrantyFile, "inverterWarrantyFile")
  applyField("workCompletionWarranty", localFiles.workCompletionWarrantyFile, "workCompletionWarrantyFile")

  return next as unknown as Quotation
}

/** Metering → WCC Pending: Discom name + Assigned person required to leave the tab. */
function hasAdminMeteringWccPack(q: Quotation | Record<string, unknown>): boolean {
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

/** Server flag: Meter in Discom → WCC Pending (before Meter Installation Pending). */
function isMeteringWccAfterDiscomFlag(q: Quotation | Record<string, unknown>): boolean {
  const r = q as Record<string, unknown>
  const v = r.meteringWccAfterDiscom ?? r.metering_wcc_after_discom
  return v === true || v === "true" || v === 1 || v === "1"
}

function withMeteringWccAfterDiscomFlag(quotation: Quotation, value: boolean): Quotation {
  return {
    ...quotation,
    meteringWccAfterDiscom: value,
    metering_wcc_after_discom: value,
  } as Quotation
}

/** Meter Installation Pending: both site photos already saved. */
function hasAdminMeterInstallPack(q: Quotation | Record<string, unknown>): boolean {
  const r = q as Record<string, unknown>
  const meterPhoto = String(
    r.meterInstallationPhotoUrl ||
      r.meter_installation_photo_url ||
      r.meterInstallationPhotoPublicUrl ||
      r.meter_installation_photo_public_url ||
      "",
  ).trim()
  const plantPhoto = String(
    r.plantLivePhotoUrl ||
      r.plant_live_photo_url ||
      r.plantLivePhotoPublicUrl ||
      r.plant_live_photo_public_url ||
      "",
  ).trim()
  return Boolean(meterPhoto && plantPhoto)
}

function formatQuotationCustomerLocation(q: Quotation | Record<string, unknown>): string {
  const r = q as Record<string, unknown>
  const visit = String(r.visitLocation || r.visit_location || r.location || "").trim()
  if (visit) return visit
  const customer = (r.customer && typeof r.customer === "object" ? r.customer : null) as Record<
    string,
    unknown
  > | null
  const rawAddress = customer?.address
  if (rawAddress && typeof rawAddress === "object") {
    const a = rawAddress as Record<string, unknown>
    return [a.street, a.city, a.state, a.pincode].map((x) => String(x || "").trim()).filter(Boolean).join(", ")
  }
  if (typeof rawAddress === "string" && rawAddress.trim()) return rawAddress.trim()
  const loc = customer?.location
  if (typeof loc === "string" && loc.trim()) return loc.trim()
  return ""
}

function getDiscomLocationText(q: Quotation | Record<string, unknown>): string {
  const r = q as Record<string, unknown>
  return String(r.discomLocation || r.discom_location || "").trim()
}

/** Meter Pending / Meter in Discom: same overdue colours as Installation (skip MCO). */
function meteringOverdueTone(
  referenceYmd: string,
  meteringStage: "processing" | "approved" | "meter_install" | "mco" | null,
): "none" | "yellow" | "red" {
  if (meteringStage === "mco" || !meteringStage) return "none"
  return overdueToneFromDays(getInstallationDateOverdueDays(referenceYmd))
}

type InstallOverdueFilter = "all" | "lt5" | "gte5" | "gte10"

/** Match overdue chips to the same tone used for row background colours. */
function matchesOverdueToneFilter(
  tone: "none" | "yellow" | "red",
  filter: InstallOverdueFilter,
): boolean {
  if (filter === "all") return true
  if (filter === "lt5") return tone === "none"
  if (filter === "gte5") return tone === "yellow" || tone === "red"
  if (filter === "gte10") return tone === "red"
  return true
}

function overdueRowClasses(tone: "none" | "yellow" | "red"): {
  row: string
  sticky: string
  title?: string
} {
  if (tone === "red") {
    return {
      row: "bg-red-100/95 hover:bg-red-200/80",
      sticky: "bg-red-100",
      title: "Date overdue by 10 days or more",
    }
  }
  if (tone === "yellow") {
    return {
      row: "bg-amber-100/95 hover:bg-amber-200/70",
      sticky: "bg-amber-100",
      title: "Date overdue by 5 days or more",
    }
  }
  return { row: "hover:bg-muted/35", sticky: "bg-card" }
}

/** Keeps typing snappy: local value updates immediately; parent filter updates after pause. */
function DebouncedSearchInput({
  value,
  onDebouncedChange,
  placeholder,
  className,
  delayMs = 200,
}: {
  value: string
  onDebouncedChange: (next: string) => void
  placeholder?: string
  className?: string
  delayMs?: number
}) {
  const [localValue, setLocalValue] = useState(value)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  useEffect(() => {
    if (localValue === value) return
    const timer = window.setTimeout(() => {
      onDebouncedChange(localValue)
    }, delayMs)
    return () => window.clearTimeout(timer)
  }, [localValue, value, onDebouncedChange, delayMs])

  return (
    <Input
      placeholder={placeholder}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      className={className}
    />
  )
}

/** Fast client-side match for Quotation search (name / mobile / email / ID / dealer). */
function quotationMatchesQuickSearch(quotation: Quotation, rawTerm: string): boolean {
  const trimmed = rawTerm.trim()
  if (!trimmed) return true
  const needle = trimmed.toLowerCase()
  const customer = quotation.customer
  const first = String(customer?.firstName || "").toLowerCase()
  const last = String(customer?.lastName || "").toLowerCase()
  const email = String(customer?.email || "").toLowerCase()
  const mobile = String(customer?.mobile || "")
  const id = String(quotation.id || "").toLowerCase()
  if (
    first.includes(needle) ||
    last.includes(needle) ||
    email.includes(needle) ||
    id.includes(needle) ||
    mobile.includes(trimmed) ||
    mobile.toLowerCase().includes(needle)
  ) {
    return true
  }
  const nested = (quotation as unknown as { dealer?: Record<string, unknown> }).dealer
  if (nested && typeof nested === "object") {
    const dealerName = `${nested.firstName || ""} ${nested.lastName || ""}`.trim().toLowerCase()
    const dealerMobile = String(nested.mobile || nested.phone || "")
    if (dealerName.includes(needle)) return true
    if (dealerMobile.includes(trimmed) || dealerMobile.toLowerCase().includes(needle)) return true
  }
  return false
}

/** Same install-date resolution as the Installation grid row (scheduled, then sent+7). */
function resolveAdminInstallationScheduleYmd(quotation: Quotation): string {
  const qAny = quotation as unknown as Record<string, unknown>
  const scheduledMap = typeof window !== "undefined" ? readInstallationScheduledMap() : {}
  const fromMap = toYmdFromStored(scheduledMap[String(quotation.id || "").trim()])
  const stored =
    toYmdFromStored(qAny.installationScheduledAt as string | undefined) ||
    toYmdFromStored(qAny.installation_scheduled_at as string | undefined)
  if (fromMap || stored) return fromMap || stored

  const sentToInstallationAt = qAny.installationReleasedAt || qAny.installation_released_at
  const installationListDate =
    sentToInstallationAt ||
    qAny.approvedAt ||
    qAny.approvedDate ||
    qAny.statusUpdatedAt ||
    quotation.createdAt
  const sentBaseStr = installationListDate ? String(installationListDate) : ""
  const sentParsedOk = sentBaseStr ? !Number.isNaN(new Date(sentBaseStr).getTime()) : false
  return sentParsedOk ? addCalendarDaysFromDateString(sentBaseStr, 7) : ""
}

const GOVERNMENT_BANK_OPTIONS = [
  "State Bank of India",
  "Punjab National Bank",
  "Bank of Baroda",
  "Canara Bank",
  "Union Bank of India",
  "Bank of India",
  "Indian Bank",
  "Central Bank of India",
  "UCO Bank",
  "Bank of Maharashtra",
  "Indian Overseas Bank",
  "Punjab & Sind Bank",
  "RMGB Bank",
  "HDFC Bank",
] as const

function getOperationalStageForQuotation(quotation: Quotation): AdminOperationalStage | "" {
  const raw = String(
    (quotation as any).installationStatus ||
      (quotation as any).installation_status ||
      (quotation as any).meteringStatus ||
      (quotation as any).metering_status ||
      (quotation as any).mcoStatus ||
      (quotation as any).mco_status ||
      "",
  ).toLowerCase()
  if (ADMIN_OPERATIONAL_STAGES.includes(raw as AdminOperationalStage)) return raw as AdminOperationalStage
  return ""
}

function AdminQuotationRowActions({
  quotation,
  sendingToMeteringId,
  retrievingFromMeteringId,
  meteringStageOverride,
  olderCount = 0,
  onSendToMetering,
  onRetrieveFromMetering,
  onTimeline,
  onQuotationHistory,
  onDocuments,
  onView,
}: {
  quotation: Quotation
  sendingToMeteringId: string | null
  retrievingFromMeteringId: string | null
  meteringStageOverride?: "processing" | "approved" | "meter_install" | "mco" | null
  olderCount?: number
  onSendToMetering: (quotation: Quotation) => void
  onRetrieveFromMetering: (quotation: Quotation) => void
  onTimeline: (quotation: Quotation) => void
  onQuotationHistory?: (quotation: Quotation) => void
  onDocuments: (quotation: Quotation) => void
  onView: (quotation: Quotation) => void
}) {
  const sendToMetering = getAdminQuotationsTabSendToMeteringState(quotation)
  const retrieveFromMetering = getAdminQuotationsTabRetrieveState(quotation, meteringStageOverride)
  const isSending = sendingToMeteringId === quotation.id
  const isRetrieving = retrievingFromMeteringId === quotation.id

  return (
    <div className="flex flex-nowrap items-center justify-end gap-1">
        {olderCount > 0 && onQuotationHistory ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => onQuotationHistory(quotation)}
            title={`Quotation history (${olderCount} older)`}
          >
            <History className="w-4 h-4" />
          </Button>
        ) : null}
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onTimeline(quotation)} title="Status timeline">
          <Clock3 className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onDocuments(quotation)} title="Document Submission">
          <FileText className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onView(quotation)} title="View Details">
          <Eye className="w-4 h-4" />
        </Button>
      {sendToMetering.visible ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-8 text-[10px] px-2 whitespace-nowrap shrink-0",
            !sendToMetering.enabled || isSending ? "opacity-60" : "",
          )}
          title={sendToMetering.hint || "Send to Metering team"}
          onClick={() => onSendToMetering(quotation)}
          disabled={!sendToMetering.enabled || isSending}
        >
          <Gauge className="w-3 h-3 mr-1 shrink-0" />
          {isSending ? "Sending..." : "Send to Metering"}
        </Button>
      ) : null}
      {retrieveFromMetering.visible ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-8 text-[10px] px-2 whitespace-nowrap shrink-0 border-amber-800/40",
            !retrieveFromMetering.enabled || isRetrieving ? "opacity-60" : "",
          )}
          title={retrieveFromMetering.hint || "Retrieve from Metering"}
          onClick={() => onRetrieveFromMetering(quotation)}
          disabled={!retrieveFromMetering.enabled || isRetrieving}
        >
          <RotateCcw className="w-3 h-3 mr-1 shrink-0" />
          {isRetrieving ? "Retrieving..." : "Retrieve"}
        </Button>
      ) : null}
    </div>
  )
}

function createEmptyDocumentsForm(): Record<string, any> {
  return {
    isCompliantSenior: false,
    aadharNumber: "",
    aadharFront: null,
    aadharBack: null,
    compliantAadharNumber: "",
    compliantAadharFront: null,
    compliantAadharBack: null,
    compliantContactPhone: "",
    compliantPanNumber: "",
    compliantPanImage: null,
    compliantBankAccountNumber: "",
    compliantBankIfsc: "",
    compliantBankName: "",
    compliantBankBranch: "",
    compliantBankPassbookImage: null,
    panNumber: "",
    panImage: null,
    electricityKno: "",
    electricityBillImage: null,
    bankAccountNumber: "",
    bankIfsc: "",
    bankName: "",
    bankBranch: "",
    bankPassbookImage: null,
    geotagRoofPhoto: null,
    customerWithHousePhoto: null,
    propertyDocumentPdf: null,
    contactPhone: "",
    contactEmail: "",
  }
}

export default function AdminPanelPage() {
  const { isAuthenticated, dealer, role } = useAuth()
  const router = useRouter()
  const { toast } = useToast()
  const [quotations, setQuotations] = useState<Quotation[]>([])
  /** Server-side total when list fetch is paginated (e.g. limit 1000). */
  const [quotationsListTotal, setQuotationsListTotal] = useState<number | null>(null)
  const [thisMonthQuotationsFromStats, setThisMonthQuotationsFromStats] = useState<number | null>(null)
  /** Overview cards from GET /admin/statistics — avoids waiting on full quotation list. */
  const [overviewStatsFromApi, setOverviewStatsFromApi] = useState<{
    totalRevenue: number | null
    thisMonthRevenue: number | null
    thisMonthApproved: number | null
    thisMonthApprovedCustomers: number | null
    thisMonthKw: number | null
  }>({
    totalRevenue: null,
    thisMonthRevenue: null,
    thisMonthApproved: null,
    thisMonthApprovedCustomers: null,
    thisMonthKw: null,
  })
  const [isAdminDataLoading, setIsAdminDataLoading] = useState(false)
  const [adminLoadError, setAdminLoadError] = useState<string | null>(null)
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [accountManagers, setAccountManagers] = useState<AccountManager[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [customerSearchTerm, setCustomerSearchTerm] = useState("")
  const [customerFilterCities, setCustomerFilterCities] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [filterDealer, setFilterDealer] = useState("all")
  const [filterCities, setFilterCities] = useState<string[]>([])
  const [filterMonth, setFilterMonth] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterFileLogin, setFilterFileLogin] = useState("all")
  const [filterPaymentType, setFilterPaymentType] = useState("all")
  const [filterBankDetails, setFilterBankDetails] = useState("all")
  const [filterInstallOverdue, setFilterInstallOverdue] = useState<InstallOverdueFilter>("all")
  const [quotationFiltersOpen, setQuotationFiltersOpen] = useState(false)
  const [quotationExcelColumnsOpen, setQuotationExcelColumnsOpen] = useState(false)
  const [visitorExcelColumnsOpen, setVisitorExcelColumnsOpen] = useState(false)
  const [quotationExcelRememberedIds, setQuotationExcelRememberedIds] = useState<string[] | null>(null)
  const [visitorExcelRememberedIds, setVisitorExcelRememberedIds] = useState<string[] | null>(null)
  const visitorExcelColumnsStorageKey = "excel-columns:admin-visitor-reports"
  const [operationalTab, setOperationalTab] = useState<AdminOperationalTab>("all")
  const [operationalProgressTab, setOperationalProgressTab] = useState<AdminOperationalProgressTab>("all")
  const [installationTeamsDialogOpen, setInstallationTeamsDialogOpen] = useState(false)
  const [installationTeamForm, setInstallationTeamForm] = useState({ name: "", username: "", password: "" })
  const [installationTeams, setInstallationTeams] = useState<InstallationTeamRecord[]>([])
  const [installationTeamResetPasswordById, setInstallationTeamResetPasswordById] = useState<Record<string, string>>({})
  const [installationTeamSubmitting, setInstallationTeamSubmitting] = useState(false)
  const [installationTeamsRefresh, setInstallationTeamsRefresh] = useState(0)
  const [installerQueueIds, setInstallerQueueIds] = useState<Set<string>>(new Set())
  const [installerQueueApprovedIds, setInstallerQueueApprovedIds] = useState<Set<string>>(new Set())
  const [adminInstallExpandedId, setAdminInstallExpandedId] = useState<string | null>(null)
  const [adminInstallQuotation, setAdminInstallQuotation] = useState<Quotation | null>(null)
  const [adminInstallMediaByField, setAdminInstallMediaByField] = useState<
    Partial<Record<AdminInstallationImageFieldKey, AdminInstallMedia[]>>
  >({})
  const [adminInstallPiMedia, setAdminInstallPiMedia] = useState<AdminInstallMedia[]>([])
  const [installRevertTarget, setInstallRevertTarget] = useState<{ id: string; label: string } | null>(null)
  const [installRevertSaving, setInstallRevertSaving] = useState(false)
  const [installPhotosViewer, setInstallPhotosViewer] = useState<Quotation | null>(null)
  const [installPhotoUrls, setInstallPhotoUrls] = useState<string[]>([])
  const [installPhotosLoading, setInstallPhotosLoading] = useState(false)
  const [adminInstallExtraExpenses, setAdminInstallExtraExpenses] = useState<AdminExtraExpenseLine[]>([])
  const [adminInstallNotes, setAdminInstallNotes] = useState("")
  const [adminInstallDimensions, setAdminInstallDimensions] = useState({ length: "", width: "", height: "" })
  const [adminInstallSaving, setAdminInstallSaving] = useState(false)
  const [adminMeteringModalOpen, setAdminMeteringModalOpen] = useState(false)
  const [adminMeteringQuotationId, setAdminMeteringQuotationId] = useState<string | null>(null)
  /** After Details save, advance Meter Pending → Meter in Discom. */
  const [adminMeteringAdvanceToDiscomAfterSave, setAdminMeteringAdvanceToDiscomAfterSave] = useState(false)
  const [adminMeteringDraft, setAdminMeteringDraft] = useState<AdminMeteringModalDraft>({
    discomName: "",
    meterType: "",
    meterNo: "",
    solarMeterNo: "",
    netMeterNo: "",
    remarks: "",
    authorizedRepresentative: "",
    discomLocation: "",
  })
  /** Per-row drafts for Metering → WCC Pending (installation-approved jobs). */
  const [adminWccDraftByQuotation, setAdminWccDraftByQuotation] = useState<
    Record<
      string,
      {
        discomName: string
        remarks: string
        assignedPersonName: string
        discomLocation: string
      }
    >
  >({})
  const [adminWccSavingId, setAdminWccSavingId] = useState<string | null>(null)
  const [adminWccModalQuotationId, setAdminWccModalQuotationId] = useState<string | null>(null)
  const [adminMeterInstallModalQuotationId, setAdminMeterInstallModalQuotationId] = useState<string | null>(null)
  const [adminMeterInstallSavingId, setAdminMeterInstallSavingId] = useState<string | null>(null)
  const [adminMeterInstallPhotoByQuotation, setAdminMeterInstallPhotoByQuotation] = useState<
    Record<string, { file?: File | null; url?: string; name?: string }>
  >({})
  const [adminPlantLivePhotoByQuotation, setAdminPlantLivePhotoByQuotation] = useState<
    Record<string, { file?: File | null; url?: string; name?: string }>
  >({})
  const [adminMeterInstallDraftByQuotation, setAdminMeterInstallDraftByQuotation] = useState<
    Record<string, { assignedPersonName: string; remarks: string }>
  >({})
  const [adminMeteringDocByQuotation, setAdminMeteringDocByQuotation] = useState<Record<string, File | null>>({})
  const [adminMeteringSaving, setAdminMeteringSaving] = useState(false)
  const [adminMcoDocsModalOpen, setAdminMcoDocsModalOpen] = useState(false)
  const [adminMcoDocsQuotationId, setAdminMcoDocsQuotationId] = useState<string | null>(null)
  const [adminMcoDocsSaving, setAdminMcoDocsSaving] = useState(false)
  const [adminWorkCompleteReportByQuotation, setAdminWorkCompleteReportByQuotation] = useState<Record<string, File | null>>({})
  const [adminMeterInstalledPhotoByQuotation, setAdminMeterInstalledPhotoByQuotation] = useState<Record<string, File | null>>({})
  const [adminCompleteDcrReportByQuotation, setAdminCompleteDcrReportByQuotation] = useState<Record<string, File | null>>({})
  const [adminBaldevSavingId, setAdminBaldevSavingId] = useState<string | null>(null)
  const [adminFinalExpandedId, setAdminFinalExpandedId] = useState<string | null>(null)
  const [adminFinalBillFileByQuotation, setAdminFinalBillFileByQuotation] = useState<Record<string, File | null>>({})
  const [adminPanelWarrantyFileByQuotation, setAdminPanelWarrantyFileByQuotation] = useState<Record<string, File | null>>({})
  const [adminInverterWarrantyFileByQuotation, setAdminInverterWarrantyFileByQuotation] = useState<Record<string, File | null>>({})
  const [adminWorkCompletionWarrantyFileByQuotation, setAdminWorkCompletionWarrantyFileByQuotation] = useState<Record<string, File | null>>({})
  const [adminFinalSavingId, setAdminFinalSavingId] = useState<string | null>(null)
  /** Local DCR-generated flag (persisted) — splits Final confirmation into DCR Generation vs Final process. */
  const [adminDcrGeneratedIds, setAdminDcrGeneratedIds] = useState<Record<string, boolean>>({})
  /** Bank process done → moves Loan / Cash+loan rows into Pending payment (persisted). */
  const [adminBankProcessDoneIds, setAdminBankProcessDoneIds] = useState<Record<string, boolean>>({})
  const [adminBankProcessModalQuotationId, setAdminBankProcessModalQuotationId] = useState<string | null>(null)
  const [adminBankProcessSavingId, setAdminBankProcessSavingId] = useState<string | null>(null)
  const [adminBankProcessDraftByQuotation, setAdminBankProcessDraftByQuotation] = useState<
    Record<
      string,
      {
        assignedPersonName: string
        remarks: string
        bankLocation: string
      }
    >
  >({})
  const [adminBankDocumentsByQuotation, setAdminBankDocumentsByQuotation] = useState<
    Record<string, Array<{ file?: File; url: string; name: string }>>
  >({})
  /** Keeps row in Final Step (MCO) tab when API list still returns installer_approved / WF_003. */
  const [adminMeteringStageOverride, setAdminMeteringStageOverride] = useState<
    Record<string, "processing" | "approved" | "meter_install" | "mco">
  >({})
  const [sendingToMeteringId, setSendingToMeteringId] = useState<string | null>(null)
  const [retrievingFromMeteringId, setRetrievingFromMeteringId] = useState<string | null>(null)
  const [retrievingFromInstallationId, setRetrievingFromInstallationId] = useState<string | null>(null)
  const QUOTATIONS_LIST_BATCH_SIZE = 12
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [documentsDialogOpen, setDocumentsDialogOpen] = useState(false)
  const [documentsQuotation, setDocumentsQuotation] = useState<Quotation | null>(null)
  const [documentsFormById, setDocumentsFormById] = useState<Record<string, any>>({})
  const [isSubmittingDocuments, setIsSubmittingDocuments] = useState(false)
  const [documentsZipDownloading, setDocumentsZipDownloading] = useState(false)
  const [activeTab, setActiveTab] = useState("overview")
  const [catalogSubTab, setCatalogSubTab] = useState<"products" | "pricing">("products")
  const [callingActions, setCallingActions] = useState<CallingActionRecord[]>([])
  const [journeyCallingActions, setJourneyCallingActions] = useState<CallingActionRecord[]>([])
  const [isJourneyCallingActionsLoading, setIsJourneyCallingActionsLoading] = useState(false)
  const [callingRange, setCallingRange] = useState<
    "daily" | "weekly" | "monthly" | "last_month" | "custom" | "all"
  >("daily")
  const [callingCustomFromDate, setCallingCustomFromDate] = useState("")
  const [callingCustomToDate, setCallingCustomToDate] = useState("")
  const [callingActionDealerFilter, setCallingActionDealerFilter] = useState("all")
  const [callingConnectionFilter, setCallingConnectionFilter] = useState<"all" | "connected" | "not_connected">("all")
  const [isCallingActionsLoading, setIsCallingActionsLoading] = useState(false)
  const [topDealersDateFilter, setTopDealersDateFilter] = useState<JourneyDateRangeFilter>("this_month")
  const [topDealersDealerFilter, setTopDealersDealerFilter] = useState("all")
  const [topDealersCustomFromDate, setTopDealersCustomFromDate] = useState("")
  const [topDealersCustomToDate, setTopDealersCustomToDate] = useState("")
  const [callingActionsUnavailable, setCallingActionsUnavailable] = useState(false)
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false)
  const [approvingQuotationId, setApprovingQuotationId] = useState<string | null>(null)
  const [approvalPaymentType, setApprovalPaymentType] = useState<ApprovalPaymentType>("cash")
  const [approvalBankName, setApprovalBankName] = useState("")
  const [approvalBankIfsc, setApprovalBankIfsc] = useState("")
  const [approvalSubsidyCheque, setApprovalSubsidyCheque] = useState("")
  const [approvalLoanAmount, setApprovalLoanAmount] = useState("")
  const [approvalCashAmount, setApprovalCashAmount] = useState("")
  const [approvalAtInput, setApprovalAtInput] = useState("")
  /** Keeps approve-time loan/cash split when GET list omits or overwrites with full subtotal. */
  const approvalLoanCashOverlayRef = useRef<
    Record<
      string,
      {
        paymentType: ApprovalPaymentType
        loanAmount?: number
        cashAmount?: number
      }
    >
  >(
    (() => {
      if (typeof window === "undefined") return {}
      try {
        const raw = sessionStorage.getItem("adminApprovalLoanCashOverlay")
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === "object" ? parsed : {}
      } catch {
        return {}
      }
    })(),
  )
  const persistApprovalLoanCashOverlay = () => {
    if (typeof window === "undefined") return
    try {
      sessionStorage.setItem(
        "adminApprovalLoanCashOverlay",
        JSON.stringify(approvalLoanCashOverlayRef.current),
      )
    } catch {
      /* ignore */
    }
  }
  const [fileLoginDialogOpen, setFileLoginDialogOpen] = useState(false)
  const [fileLoginQuotationId, setFileLoginQuotationId] = useState<string | null>(null)
  const [fileLoginStatusChoice, setFileLoginStatusChoice] = useState<FileLoginStatus>("login_now")
  const [fileLoginPaymentType, setFileLoginPaymentType] = useState<ApprovalPaymentType>("cash")
  const [fileLoginBankName, setFileLoginBankName] = useState("")
  const [fileLoginBankIfsc, setFileLoginBankIfsc] = useState("")
  const [fileLoginSubsidyCheque, setFileLoginSubsidyCheque] = useState("")
  const [fileLoginAtInput, setFileLoginAtInput] = useState("")
  const [optimisticFileLoginSelect, setOptimisticFileLoginSelect] = useState<Record<string, string>>({})
  const [isSavingFileLogin, setIsSavingFileLogin] = useState(false)
  const [statusHistoryQuotation, setStatusHistoryQuotation] = useState<Quotation | null>(null)
  const [quotationVersionHistoryOpen, setQuotationVersionHistoryOpen] = useState(false)
  const [quotationVersionHistoryGroup, setQuotationVersionHistoryGroup] = useState<{
    current: Quotation
    history: Quotation[]
    all: Quotation[]
  } | null>(null)
  const [restoringQuotationId, setRestoringQuotationId] = useState<string | null>(null)
  const [isLoadingQuotationDetails, setIsLoadingQuotationDetails] = useState(false)
  const [visitorSearchTerm, setVisitorSearchTerm] = useState("")
  const [visitorDialogOpen, setVisitorDialogOpen] = useState(false)
  const [editingVisitor, setEditingVisitor] = useState<Visitor | null>(null)
  const [visitorReportRows, setVisitorReportRows] = useState<AdminVisitReportRow[]>([])
  const [visitorReportLoading, setVisitorReportLoading] = useState(false)
  const [visitorReportUnavailable, setVisitorReportUnavailable] = useState(false)
  const [visitorReportLoadSource, setVisitorReportLoadSource] = useState<string | null>(null)
  const [visitorReportVisitorFilter, setVisitorReportVisitorFilter] = useState("all")
  const [visitorReportStatusFilter, setVisitorReportStatusFilter] = useState<VisitStatusFilter>("all")
  const [visitorReportSearch, setVisitorReportSearch] = useState("")
  const [visitorReportRange, setVisitorReportRange] = useState<
    "daily" | "weekly" | "monthly" | "last_month" | "custom" | "all"
  >("monthly")
  const [visitorReportCustomFromDate, setVisitorReportCustomFromDate] = useState("")
  const [visitorReportCustomToDate, setVisitorReportCustomToDate] = useState("")
  const [visitorReportSearchDebounced, setVisitorReportSearchDebounced] = useState("")
  const [visitorReportRefreshing, setVisitorReportRefreshing] = useState(false)
  const [visitorReportDetailsRow, setVisitorReportDetailsRow] = useState<AdminVisitReportRow | null>(null)
  const [visitorReportDetailsOpen, setVisitorReportDetailsOpen] = useState(false)
  const [productNeededRefreshToken, setProductNeededRefreshToken] = useState(0)
  const [accountManagerSearchTerm, setAccountManagerSearchTerm] = useState("")
  const [accountManagerDialogOpen, setAccountManagerDialogOpen] = useState(false)
  const [editingAccountManager, setEditingAccountManager] = useState<AccountManager | null>(null)
  const [editingManagedKind, setEditingManagedKind] = useState<"dealer" | "operations" | "visitor" | null>(null)
  const [accountManagerHistoryDialogOpen, setAccountManagerHistoryDialogOpen] = useState(false)
  const [selectedAccountManagerForHistory, setSelectedAccountManagerForHistory] = useState<AccountManager | null>(null)
  const [accountManagerHistory, setAccountManagerHistory] = useState<any[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const emptyUnifiedUserForm = () => ({
    role: "",
    access: ["quotation"] as UserAccessKey[],
    username: "",
    password: "",
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    gender: "",
    dateOfBirth: "",
    fatherName: "",
    fatherContact: "",
    governmentIdType: "",
    governmentIdNumber: "",
    address: {
      street: "",
      city: "",
      state: "",
      pincode: "",
    },
    employeeId: "",
    isActive: true,
    emailVerified: false,
    officeLocation: "" as OfficeLocation | "",
    moduleFieldPermissions: {} as ModuleFieldPermissions,
  })
  const [newAccountManager, setNewAccountManager] = useState(emptyUnifiedUserForm)
  const [dealerSearchTerm, setDealerSearchTerm] = useState("")
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null)
  const [customerEditDialogOpen, setCustomerEditDialogOpen] = useState(false)
  const [customerEditForm, setCustomerEditForm] = useState({
    firstName: "",
    lastName: "",
    mobile: "",
    email: "",
    address: {
      street: "",
      city: "",
      state: "",
      pincode: "",
    },
  })
  const [selectedDealer, setSelectedDealer] = useState<Dealer | null>(null)
  const [dealerDialogOpen, setDealerDialogOpen] = useState(false)
  const [editingDealer, setEditingDealer] = useState<Dealer | null>(null)
  const [dealerEditDialogOpen, setDealerEditDialogOpen] = useState(false)
  const [dealerEditForm, setDealerEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    gender: "",
    dateOfBirth: "",
    fatherName: "",
    fatherContact: "",
    governmentIdType: "",
    governmentIdNumber: "",
    address: {
      street: "",
      city: "",
      state: "",
      pincode: "",
    },
    isActive: true,
    emailVerified: false,
    access: ["quotation"] as UserAccessKey[],
  })
  const [newVisitor, setNewVisitor] = useState({
    username: "",
    password: "",
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    employeeId: "",
  })

  const useApi = process.env.NEXT_PUBLIC_USE_API !== "false"

  const getDocumentsForm = (quotationId: string) => documentsFormById[quotationId] || createEmptyDocumentsForm()

  const updateDocumentsForm = useCallback((quotationId: string, updates: Record<string, any>) => {
    setDocumentsFormById((prev) => ({
      ...prev,
      [quotationId]: {
        ...(prev[quotationId] || createEmptyDocumentsForm()),
        ...updates,
      },
    }))
  }, [])

  const { uploadingField, onDocumentFileSelected } = useQuotationDocumentFileUpload(useApi, updateDocumentsForm)

  const normalizeInstallationTeamRow = (row: any): InstallationTeamRecord => ({
    id: String(row?.id || row?._id || row?.teamId || row?.team_id || ""),
    name: String(row?.name || row?.teamName || row?.team_name || row?.firstName || row?.username || "Installation team"),
    username: String(row?.username || row?.login || "").trim().toLowerCase(),
    password: String(row?.password || ""),
    createdAt: String(row?.createdAt || row?.created_at || new Date().toISOString()),
    createdBy: row?.createdBy || row?.created_by || "",
    isActive: row?.isActive !== false,
  })
  const readInstallationTeamsFromBackendResponse = (response: any): InstallationTeamRecord[] => {
    const raw = Array.isArray(response)
      ? response
      : Array.isArray(response?.teams)
        ? response.teams
        : Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response?.items)
            ? response.items
            : []
    return raw.map(normalizeInstallationTeamRow).filter((t: InstallationTeamRecord) => t.id && t.username)
  }
  const loadInstallationTeams = async () => {
    if (!useApi) {
      setInstallationTeams(readInstallationTeams())
      return
    }
    try {
      const response = await api.admin.installationTeams.list()
      const rows = readInstallationTeamsFromBackendResponse(response)
      if (rows.length > 0) {
        setInstallationTeams(rows)
        return
      }
      setInstallationTeams(readInstallationTeams())
    } catch {
      setInstallationTeams(readInstallationTeams())
    }
  }
  const getOperationsRoleOverrides = (): Record<string, string> => {
    try {
      return JSON.parse(localStorage.getItem("operationsRoleOverrides") || "{}")
    } catch {
      return {}
    }
  }
  const saveOperationsRoleOverride = (username: string, roleValue: string) => {
    const key = username.trim().toLowerCase()
    if (!key) return
    const current = getOperationsRoleOverrides()
    current[key] = roleValue
    localStorage.setItem("operationsRoleOverrides", JSON.stringify(current))
  }

  useEffect(() => {
    void loadInstallationTeams()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useApi])

  useEffect(() => {
    try {
      const raw = localStorage.getItem("adminDcrGenerated")
      if (!raw) return
      const ids = JSON.parse(raw) as string[]
      if (!Array.isArray(ids)) return
      const map: Record<string, boolean> = {}
      ids.forEach((id) => {
        if (typeof id === "string" && id) map[id] = true
      })
      setAdminDcrGeneratedIds(map)
    } catch {
      // ignore malformed local storage
    }
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem("adminBankProcessDone")
      if (!raw) return
      const ids = JSON.parse(raw) as string[]
      if (!Array.isArray(ids)) return
      const map: Record<string, boolean> = {}
      ids.forEach((id) => {
        if (typeof id === "string" && id) map[id] = true
      })
      setAdminBankProcessDoneIds(map)
    } catch {
      // ignore malformed local storage
    }
  }, [])

  useEffect(() => {
    if (!installationTeamsDialogOpen) return
    void loadInstallationTeams()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installationTeamsDialogOpen, useApi])

  const handleCreateInstallationTeam = async () => {
    const name = installationTeamForm.name.trim()
    const username = installationTeamForm.username.trim().toLowerCase()
    const password = installationTeamForm.password
    if (!name || !username || !password) {
      toast({
        title: "Could not create team",
        description: "Fill all fields and use a unique username.",
        variant: "destructive",
      })
      return
    }
    setInstallationTeamSubmitting(true)
    try {
      if (useApi) {
        try {
          await api.admin.installationTeams.create({ name, username, password })
          await loadInstallationTeams()
        } catch {
          const created = createInstallationTeam({
            name,
            username,
            password,
            createdBy: dealer?.username,
          })
          if (!created) throw new Error("local_create_failed")
          setInstallationTeams(readInstallationTeams())
        }
      } else {
        const created = createInstallationTeam({
          name,
          username,
          password,
          createdBy: dealer?.username,
        })
        if (!created) throw new Error("local_create_failed")
        setInstallationTeams(readInstallationTeams())
      }
      setInstallationTeamForm({ name: "", username: "", password: "" })
      setInstallationTeamsRefresh((n) => n + 1)
      toast({
        title: "Team created",
        description: "Credentials are saved. Team can login from /installation-team-login.",
      })
    } catch {
      toast({
        title: "Could not create team",
        description: "Fill all fields and use a unique username.",
        variant: "destructive",
      })
    } finally {
      setInstallationTeamSubmitting(false)
    }
  }

  const handleDeleteInstallationTeam = async (team: InstallationTeamRecord) => {
    try {
      if (useApi) {
        try {
          await api.admin.installationTeams.remove(team.id)
        } catch {
          deleteInstallationTeam(team.id)
        }
      } else {
        deleteInstallationTeam(team.id)
      }
      setInstallationTeams((prev) => prev.filter((t) => t.id !== team.id))
      setInstallationTeamsRefresh((n) => n + 1)
      setQuotations((prev) =>
        prev.map((q) => {
          const tid = getInstallationTeamIdForQuotation(q.id, q as any)
          if (tid === team.id) {
            const next = { ...q } as any
            delete next.installationTeamId
            return next as Quotation
          }
          return q
        }),
      )
      toast({
        title: "Team removed",
        description: "Assignments to this team were cleared.",
      })
    } catch {
      toast({
        title: "Could not remove team",
        description: "Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleResetInstallationTeamPassword = async (team: InstallationTeamRecord) => {
    const raw = installationTeamResetPasswordById[team.id] || ""
    const nextPassword = raw.trim()
    if (!nextPassword) {
      toast({ title: "Enter new password", description: `Type a new password for ${team.name}.`, variant: "destructive" })
      return
    }
    try {
      if (useApi) {
        await api.admin.installationTeams.resetPassword(team.id, nextPassword)
      } else {
        const local = readInstallationTeams()
        const next = local.map((t) => (t.id === team.id ? { ...t, password: nextPassword } : t))
        writeInstallationTeams(next)
      }
      setInstallationTeamResetPasswordById((prev) => ({ ...prev, [team.id]: "" }))
      toast({ title: "Password reset", description: "Team can login with the new password now." })
    } catch {
      toast({
        title: "Password reset failed",
        description: "Backend reset endpoint is not available yet.",
        variant: "destructive",
      })
    }
  }

  const persistInstallationTeamAssignment = async (quotationId: string, teamId: string) => {
    const normalized = teamId.trim() || undefined
    setTeamAssignment(quotationId, normalized)
    setQuotations((prev) =>
      prev.map((q) => (q.id === quotationId ? ({ ...q, installationTeamId: normalized } as Quotation) : q)),
    )
    try {
      const all = JSON.parse(localStorage.getItem("quotations") || "[]")
      const next = Array.isArray(all)
        ? all.map((row: any) => (row?.id === quotationId ? { ...row, installationTeamId: normalized } : row))
        : all
      localStorage.setItem("quotations", JSON.stringify(next))
    } catch {
      // no-op
    }
    if (useApi) {
      try {
        await api.admin.quotations.updateInstallationTeamAssignment(quotationId, normalized ?? null)
      } catch (err) {
        toast({
          title: "Not saved on server",
          description:
            err instanceof ApiError
              ? `${err.message} Add PATCH /admin/quotations/{id}/installation-team (BACKEND_CHANGES_REQUIRED.md). Until then, assignment exists only in this browser.`
              : "Could not persist team on the server. Assignment exists only in this browser.",
          variant: "destructive",
        })
        return
      }
    }
    toast({
      title: "Team assignment updated",
      description: normalized ? "This installation is linked to a team." : "Team unassigned for this row.",
    })
  }

  const normalizeCallingAction = (item: any, fallbackDealers: Dealer[], index: number): CallingActionRecord => {
    const dealerId = item?.dealerId || item?.assignedDealerId || item?.dealer?.id || ""
    const fallbackDealer = fallbackDealers.find((d) => d.id === dealerId)
    const dealerNameFromObject =
      item?.dealerName ||
      item?.assignedDealerName ||
      (item?.dealer ? `${item.dealer.firstName || ""} ${item.dealer.lastName || ""}`.trim() : "")
    const dealerName =
      dealerNameFromObject || (fallbackDealer ? `${fallbackDealer.firstName} ${fallbackDealer.lastName}` : "Unknown Employee")
    const actionAt = item?.actionAt || item?.action_at || item?.updatedAt || ""
    const leadId = item?.leadId || item?.lead?.id || item?.id || ""
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
      action: item?.action || item?.status || "unknown",
      callRemark: item?.callRemark || item?.call_remark || item?.remark || "",
      statusCategory: item?.statusCategory || item?.status_category || "",
      statusText: item?.statusText || item?.status_text || "",
      actionAt,
      nextFollowUpAt: item?.nextFollowUpAt,
    }
  }

  const loadCallingActionsForReports = useCallback(async () => {
    if (!useApi || !isAuthenticated || !getAuthToken()) return

    const requestId = ++callingActionsRequestRef.current
    setIsCallingActionsLoading(true)

    try {
      const params: {
        page?: number
        limit: number
        range?: "daily" | "weekly" | "monthly" | "last_month" | "all" | "custom"
        dealerId?: string
        startDate?: string
        endDate?: string
        fromDate?: string
        toDate?: string
      } = { limit: 250 }

      if (callingRange === "custom") {
        const customBounds = getCustomBoundsFromYmd(callingCustomFromDate, callingCustomToDate)
        if (!customBounds) {
          setCallingActions([])
          setCallingActionsUnavailable(false)
          return
        }
        params.range = "custom"
        params.startDate = customBounds.start.toISOString()
        params.endDate = customBounds.end.toISOString()
        params.fromDate = formatYmdLocal(customBounds.start)
        params.toDate = formatYmdLocal(customBounds.end)
      } else if (callingRange !== "all") {
        const bounds = getPresetBounds(callingRange)
        params.range = callingRange
        params.startDate = bounds.start.toISOString()
        params.endDate = bounds.end.toISOString()
        params.fromDate = formatYmdLocal(bounds.start)
        params.toDate = formatYmdLocal(bounds.end)
      } else {
        params.range = "all"
      }

      if (callingActionDealerFilter !== "all") {
        params.dealerId = callingActionDealerFilter
      }

      const collected: unknown[] = []
      const seenKeys = new Set<string>()
      let page = 1
      const maxPages = callingRange === "all" ? 80 : 40
      while (page <= maxPages) {
        const response = await api.admin.callingActions.getAll({ ...params, page })
        if (requestId !== callingActionsRequestRef.current) return
        const { rows, total } = extractCallingActionsFromApiResponse(response)
        if (rows.length === 0) break
        let newOnPage = 0
        for (const row of rows) {
          const rec = row as Record<string, unknown>
          const key = callingActionRowKey({
            id: String(rec.id || rec._id || ""),
            leadId: String(rec.leadId || rec.lead_id || (rec.lead as { id?: string } | undefined)?.id || ""),
            customerMobile: String(rec.mobile || rec.customerMobile || ""),
            action: String(rec.action || rec.status || ""),
            actionAt: String(rec.actionAt || rec.action_at || rec.updatedAt || ""),
          })
          if (seenKeys.has(key)) continue
          seenKeys.add(key)
          collected.push(row)
          newOnPage += 1
        }
        if (newOnPage === 0) break
        if (rows.length < params.limit) break
        if (total != null && collected.length >= total) break
        page += 1
      }

      const normalized = collected
        .map((item: any, index: number) => normalizeCallingAction(item, dealers as Dealer[], index))
        .sort(
          (a, b) =>
            (parseCallingActionAt(b.actionAt)?.getTime() || 0) - (parseCallingActionAt(a.actionAt)?.getTime() || 0),
        )

      setCallingActions(normalized)
      setCallingActionsUnavailable(false)
    } catch (error) {
      if (requestId !== callingActionsRequestRef.current) return
      console.error("Calling actions endpoint unavailable:", error)
      setCallingActions([])
      setCallingActionsUnavailable(true)
    } finally {
      if (requestId === callingActionsRequestRef.current) {
        setIsCallingActionsLoading(false)
      }
    }
  }, [
    useApi,
    isAuthenticated,
    callingRange,
    callingCustomFromDate,
    callingCustomToDate,
    callingActionDealerFilter,
    dealers,
  ])

  const journeyCallingActionsRequestRef = useRef(0)
  const journeySearchFetchRef = useRef(0)
  const journeySearchTimerRef = useRef<number | undefined>(undefined)
  const [journeyDateFilter, setJourneyDateFilter] = useState<JourneyDateRangeFilter>("today")
  const [journeyCustomFromDate, setJourneyCustomFromDate] = useState("")
  const [journeyCustomToDate, setJourneyCustomToDate] = useState("")

  const loadJourneyCallingActions = useCallback(async () => {
    if (!useApi || !isAuthenticated || !getAuthToken()) return
    if (journeyDateFilter === "custom" && (!journeyCustomFromDate || !journeyCustomToDate)) return

    const requestId = ++journeyCallingActionsRequestRef.current
    setIsJourneyCallingActionsLoading(true)

    try {
      const { loadJourneyCallingActionsForAdmin } = await import("@/lib/journey-calling-actions")
      const dealerIds = (dealers as Dealer[]).map((d) => d.id).filter(Boolean)

      const bounds = getJourneyDateRangeBounds(journeyDateFilter, journeyCustomFromDate, journeyCustomToDate)
      const rangeParam:
        | "daily"
        | "weekly"
        | "monthly"
        | "last_month"
        | "all"
        | "custom" =
        journeyDateFilter === "today"
          ? "daily"
          : journeyDateFilter === "week"
            ? "weekly"
            : journeyDateFilter === "this_month"
              ? "monthly"
              : journeyDateFilter === "last_month"
                ? "last_month"
                : journeyDateFilter === "all"
                  ? "all"
                  : "custom"

      const loadOptions = {
        range: rangeParam,
        ...(bounds
          ? {
              startDate: bounds.start.toISOString(),
              endDate: bounds.end.toISOString(),
              fromDate: formatYmdLocal(bounds.start),
              toDate: formatYmdLocal(bounds.end),
            }
          : {}),
        maxPages: journeyDateFilter === "all" ? 40 : 8,
        onProgress: (partial, done) => {
          if (requestId !== journeyCallingActionsRequestRef.current) return
          const withDealerName = partial.map((item) => {
            if ((item as CallingActionRecord).dealerName) return item
            const fallbackDealer = (dealers as Dealer[]).find((d) => d.id === item.dealerId)
            if (!fallbackDealer) return item
            return {
              ...item,
              dealerName: `${fallbackDealer.firstName || ""} ${fallbackDealer.lastName || ""}`.trim(),
            }
          })
          setJourneyCallingActions(withDealerName as CallingActionRecord[])
          if (!done && withDealerName.length > 0) {
            setIsJourneyCallingActionsLoading(false)
          }
        },
      }

      const normalized = await loadJourneyCallingActionsForAdmin(dealerIds, loadOptions)
      if (requestId !== journeyCallingActionsRequestRef.current) return

      const withDealerName = normalized.map((item) => {
        if (item.dealerName) return item
        const fallbackDealer = (dealers as Dealer[]).find((d) => d.id === item.dealerId)
        if (!fallbackDealer) return item
        return {
          ...item,
          dealerName: `${fallbackDealer.firstName || ""} ${fallbackDealer.lastName || ""}`.trim(),
        }
      })

      setJourneyCallingActions(withDealerName as CallingActionRecord[])
      setIsJourneyCallingActionsLoading(false)
    } catch (error) {
      if (requestId !== journeyCallingActionsRequestRef.current) return
      if (
        error instanceof ApiError &&
        (error.code === "AUTH_004" || error.code === "HTTP_403")
      ) {
        setJourneyCallingActions([])
      } else {
        console.debug("Journey calling actions unavailable:", error)
        setJourneyCallingActions([])
      }
      setIsJourneyCallingActionsLoading(false)
    }
  }, [
    useApi,
    isAuthenticated,
    dealers,
    journeyDateFilter,
    journeyCustomFromDate,
    journeyCustomToDate,
  ])

  const handleJourneyDateRangeChange = useCallback(
    (range: { dateFilter: JourneyDateRangeFilter; customFromDate: string; customToDate: string }) => {
      setJourneyDateFilter(range.dateFilter)
      setJourneyCustomFromDate(range.customFromDate)
      setJourneyCustomToDate(range.customToDate)
    },
    [],
  )

  const handleJourneySearchChange = useCallback(
    (term: string) => {
      if (!useApi || !isAuthenticated || !getAuthToken()) return
      const trimmed = term.trim()
      if (trimmed.length < 3) return

      const requestId = ++journeySearchFetchRef.current
      window.clearTimeout(journeySearchTimerRef.current)
      journeySearchTimerRef.current = window.setTimeout(() => {
        void (async () => {
          try {
            const { searchJourneyCallingActionsForAdmin } = await import("@/lib/journey-calling-actions")
            const found = await searchJourneyCallingActionsForAdmin(trimmed)
            if (requestId !== journeySearchFetchRef.current) return
            if (found.length === 0) return
            setJourneyCallingActions((prev) => {
              const byId = new Map(prev.map((a) => [a.id, a]))
              for (const item of found) {
                byId.set(item.id, { ...(byId.get(item.id) || {}), ...item } as CallingActionRecord)
              }
              return [...byId.values()].sort(
                (a, b) => new Date(b.actionAt || 0).getTime() - new Date(a.actionAt || 0).getTime(),
              )
            })
          } catch {
            // ignore search enrichment failures
          }
        })()
      }, 350)
    },
    [useApi, isAuthenticated],
  )

  useEffect(() => {
    if (!isAuthenticated) {
      adminLoadRequestRef.current += 1
      router.push("/login")
      return
    }

    // Admin or Super Admin may use the Admin Panel (not username===admin only)
    if (!isQuotationAdminAccess({ role, username: dealer?.username })) {
      router.push("/dashboard")
      return
    }

    const requestId = ++adminLoadRequestRef.current
    void loadData(requestId)

    return () => {
      adminLoadRequestRef.current += 1
    }
  }, [isAuthenticated, router, dealer, role])

  useEffect(() => {
    if (!isAuthenticated || !useApi) return
    if (activeTab !== "calling-reports") return
    void loadCallingActionsForReports()
  }, [
    isAuthenticated,
    useApi,
    activeTab,
    loadCallingActionsForReports,
  ])

  useEffect(() => {
    if (!isAuthenticated || !useApi) return
    if (activeTab !== "customer-journey") return
    void loadJourneyCallingActions()
  }, [isAuthenticated, useApi, activeTab, loadJourneyCallingActions])

  useEffect(() => {
    setOperationalProgressTab(operationalTab === "installation" || operationalTab === "metering" ? "pending" : "all")
  }, [operationalTab])

  const openInstallPanelSeqRef = useRef(0)
  const productKwEnrichAttemptedRef = useRef(new Set<string>())
  const productKwEnrichInFlightRef = useRef(new Set<string>())
  const productKwEnrichAttemptsRef = useRef(new Map<string, number>())
  const productKwEnrichScopeRef = useRef("")
  const PRODUCT_KW_ENRICH_MAX_ATTEMPTS = 3
  const adminLoadRequestRef = useRef(0)
  const callingActionsRequestRef = useRef(0)

  // Admin list often omits panel fields; fetch detail for approved rows still at 0 kW (Dealers by Revenue).
  useEffect(() => {
    if (!useApi) return

    const scopeKey = [
      topDealersDateFilter,
      topDealersDealerFilter,
      topDealersCustomFromDate,
      topDealersCustomToDate,
    ].join("|")

    if (productKwEnrichScopeRef.current !== scopeKey) {
      productKwEnrichScopeRef.current = scopeKey
      productKwEnrichAttemptedRef.current.clear()
      productKwEnrichAttemptsRef.current.clear()
    }

    const candidates = quotations
      .filter((q) => {
        const id = String(q.id || "").trim()
        if (!id) return false
        if (String(q.status || "").toLowerCase() !== "approved") return false
        if (
          !matchesOverviewTopDealersApprovalDate(
            q,
            topDealersDateFilter,
            topDealersCustomFromDate,
            topDealersCustomToDate,
          )
        ) {
          return false
        }
        if (topDealersDealerFilter !== "all" && q.dealerId !== topDealersDealerFilter) return false
        if (productKwEnrichAttemptedRef.current.has(id) || productKwEnrichInFlightRef.current.has(id)) {
          return false
        }
        const attempts = productKwEnrichAttemptsRef.current.get(id) || 0
        if (attempts >= PRODUCT_KW_ENRICH_MAX_ATTEMPTS) return false
        return getQuotationSystemKw(q) <= 0
      })
      .slice(0, 40)

    if (candidates.length === 0) return

    let cancelled = false
    void (async () => {
      for (const q of candidates) {
        if (cancelled) break
        const id = String(q.id || "").trim()
        productKwEnrichInFlightRef.current.add(id)
        try {
          const detail = await api.admin.quotations.getById(id)
          if (cancelled) break
          setQuotations((prev) =>
            prev.map((row) => {
              if (row.id !== id) return row
              const merged = applyQuotationDetailToRow(row, detail)
              if (getQuotationSystemKw(merged) > 0) {
                productKwEnrichAttemptedRef.current.add(id)
              }
              return merged
            }),
          )
        } catch {
          // Detail fetch failed — backend must return product fields on list/detail
        } finally {
          productKwEnrichInFlightRef.current.delete(id)
          const attempts = (productKwEnrichAttemptsRef.current.get(id) || 0) + 1
          productKwEnrichAttemptsRef.current.set(id, attempts)
          if (attempts >= PRODUCT_KW_ENRICH_MAX_ATTEMPTS) {
            productKwEnrichAttemptedRef.current.add(id)
          }
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    useApi,
    quotations,
    topDealersDateFilter,
    topDealersDealerFilter,
    topDealersCustomFromDate,
    topDealersCustomToDate,
  ])

  // Fetch full quotation details when edit dialog opens
  useEffect(() => {
    if (editingQuotation && editDialogOpen && useApi) {
      // Check if customer data is incomplete (missing email or address)
      const hasIncompleteCustomer = !editingQuotation.customer?.email || !editingQuotation.customer?.address?.street
      
      if (hasIncompleteCustomer) {
        setIsLoadingQuotationDetails(true)
        // Fetch full quotation details to get complete customer information
        api.quotations.getById(editingQuotation.id)
          .then((response) => {
            // apiRequest returns data.data, so response is already the quotation object
            const fullData = response
            if (fullData && fullData.customer) {
              // Ensure customer address is properly structured
              const customerData = fullData.customer
              const address = customerData.address || {}
              
              setEditingQuotation({
                ...editingQuotation,
                customer: {
                  firstName: customerData.firstName || editingQuotation.customer?.firstName || "",
                  lastName: customerData.lastName || editingQuotation.customer?.lastName || "",
                  mobile: customerData.mobile || editingQuotation.customer?.mobile || "",
                  email: customerData.email || editingQuotation.customer?.email || "",
                  address: {
                    street: address.street || "",
                    city: address.city || "",
                    state: address.state || "",
                    pincode: address.pincode || "",
                  },
                },
                products: fullData.products || editingQuotation.products,
                discount: fullData.discount ?? editingQuotation.discount,
                totalAmount: fullData.pricing?.totalAmount ?? editingQuotation.totalAmount,
                finalAmount: fullData.pricing?.finalAmount ?? fullData.finalAmount ?? editingQuotation.finalAmount,
              })
            }
          })
          .catch((error) => {
            console.error("Error loading full quotation details:", error)
            // Keep the original quotation data on error
          })
          .finally(() => {
            setIsLoadingQuotationDetails(false)
          })
      }
    }
  }, [editingQuotation, editDialogOpen, useApi])

  const normalizeStatusHistoryFromApi = (raw: unknown): StatusHistoryEntry[] => {
    if (!Array.isArray(raw)) return []
    return raw
      .map((e: any) => ({
        status: String(e.status ?? e.to ?? e.newStatus ?? "").trim(),
        at: String(e.at ?? e.changedAt ?? e.timestamp ?? e.createdAt ?? "").trim(),
      }))
      .filter((e) => e.status && e.at)
  }

  const paymentTypeUiLabel = (t: string | undefined) => {
    const x = String(t || "").toLowerCase()
    if (x === "loan") return "Loan"
    if (x === "cash") return "Cash"
    if (x === "mix") return "Cash + loan"
    return t ? String(t) : "—"
  }

  const fileLoginRowSummary = (q: Quotation) => {
    if (!q.fileLoginStatus) return "Not set"
    const pt = paymentTypeUiLabel(q.filePaymentType)
    return q.fileLoginStatus === "already_login" ? `Already logged in · ${pt}` : `Login now · ${pt}`
  }

  const loadData = async (requestId?: number) => {
    const loadId = requestId ?? adminLoadRequestRef.current
    const isStale = () => loadId !== adminLoadRequestRef.current || !getAuthToken()

    if (isStale()) return

    setIsAdminDataLoading(true)
    setAdminLoadError(null)

    try {
      if (useApi) {
        // Overview stats first (cards), pricing in parallel — don't block cards on pricing tables.
        let statsTotalHint: number | null = null
        const pricingPromise = api.quotations.getPricingTables().then(
          (pricingTables) => {
            setPricingData(pricingTables)
          },
          () => {
            // Uses hardcoded pricing fallback in getPricingData()
          },
        )
        try {
          const statsResponse = await api.admin.statistics()
          const statsRoot =
            statsResponse && typeof statsResponse === "object"
              ? (statsResponse as Record<string, unknown>)
              : null
          const statsData =
            statsRoot?.data && typeof statsRoot.data === "object" && !Array.isArray(statsRoot.data)
              ? (statsRoot.data as Record<string, unknown>)
              : statsRoot
          const overview =
            statsData?.overview && typeof statsData.overview === "object"
              ? (statsData.overview as Record<string, unknown>)
              : null
          const thisMonth =
            statsData?.thisMonth && typeof statsData.thisMonth === "object"
              ? (statsData.thisMonth as Record<string, unknown>)
              : null
          const statsTotal = Number(overview?.totalQuotations)
          if (Number.isFinite(statsTotal) && statsTotal >= 0) {
            statsTotalHint = statsTotal
            setQuotationsListTotal((prev) => Math.max(prev ?? 0, statsTotal))
          }
          const monthTotal = Number(thisMonth?.quotations)
          setThisMonthQuotationsFromStats(
            Number.isFinite(monthTotal) && monthTotal >= 0 ? monthTotal : null,
          )
          const numOrNull = (v: unknown) => {
            const n = Number(v)
            return Number.isFinite(n) && n >= 0 ? n : null
          }
          setOverviewStatsFromApi({
            totalRevenue: numOrNull(
              overview?.totalRevenue ?? overview?.total_revenue ?? overview?.revenue,
            ),
            thisMonthRevenue: numOrNull(
              thisMonth?.revenue ?? thisMonth?.totalRevenue ?? thisMonth?.total_revenue,
            ),
            thisMonthApproved: numOrNull(
              thisMonth?.approvedQuotations ??
                thisMonth?.approved ??
                thisMonth?.approvedCount,
            ),
            thisMonthApprovedCustomers: numOrNull(
              thisMonth?.approvedCustomers ??
                thisMonth?.approved_customers ??
                thisMonth?.uniqueCustomers,
            ),
            thisMonthKw: numOrNull(
              thisMonth?.totalKw ?? thisMonth?.total_kw ?? thisMonth?.capacityKw,
            ),
          })
        } catch {
          setThisMonthQuotationsFromStats(null)
          setOverviewStatsFromApi({
            totalRevenue: null,
            thisMonthRevenue: null,
            thisMonthApproved: null,
            thisMonthApprovedCustomers: null,
            thisMonthKw: null,
          })
        }
        await pricingPromise
        if (isStale()) return

        let adminQuotationRows: unknown[] = []
        let paginatedQuotationsTotal: number | null = null
        let releaseLocal = readInstallerReleaseMap()
        const handoffLocal = readAdminMeteringHandoffMap()
        const installerQueueById: Record<string, Record<string, unknown>> = {}
        const ingestInstallerQueueRows = (rows: unknown[]) => {
          rows.forEach((row: unknown) => {
            const flat = flattenWrappedQuotationRow(row) as Record<string, unknown>
            const id = String(flat.id || "").trim()
            if (!id) return
            installerQueueById[id] = mergeInstallationMediaSources(
              installerQueueById[id] || {},
              flat,
            ) as Record<string, unknown>
          })
        }

        let installerQueueIdSet = new Set<string>()
        let installerQueueApprovedIdSet = new Set<string>()
        let paymentSentRows: unknown[] = []

        // Parallel bootstrap: admin list + installer queues + payment-sent rows.
        // Installation / Metering tabs need queue+release flags — don't wait serially.
        const loadInstallerQueues = async () => {
          try {
            const [pendingResp, approvedResp] = await Promise.all([
              api.installer.getQueue({ status: "pending_installer", page: 1, limit: 1000 }),
              api.installer.getQueue({ status: "approved", page: 1, limit: 1000 }),
            ])
            const pending = extractQuotationListFromApiResponse(pendingResp)
            const approvedQ = extractQuotationListFromApiResponse(approvedResp)
            ingestInstallerQueueRows(pending)
            ingestInstallerQueueRows(approvedQ)
            ;[...pending, ...approvedQ].forEach((row: unknown) => {
              const flat = flattenWrappedQuotationRow(row)
              const id = String(flat.id || "").trim()
              if (id) installerQueueIdSet.add(id)
            })
            approvedQ.forEach((row: unknown) => {
              const flat = flattenWrappedQuotationRow(row)
              const id = String(flat.id || "").trim()
              if (id) installerQueueApprovedIdSet.add(id)
            })
            if (installerQueueIdSet.size === 0) {
              const fallback = extractQuotationListFromApiResponse(
                await api.installer.getQueue({ page: 1, limit: 1000 }),
              )
              ingestInstallerQueueRows(fallback)
              fallback.forEach((row: unknown) => {
                const flat = flattenWrappedQuotationRow(row)
                const id = String(flat.id || "").trim()
                if (id) installerQueueIdSet.add(id)
              })
            }
          } catch {
            installerQueueIdSet = new Set()
          }
        }

        try {
          const [listResult] = await Promise.all([
            fetchAllPaginatedQuotationListPages((page, limit) =>
              api.admin.quotations.getAll({ page, limit }),
            ),
            loadInstallerQueues(),
            fetchSentToInstallerQuotationRows()
              .then((rows) => {
                paymentSentRows = rows
              })
              .catch(() => {
                paymentSentRows = []
              }),
          ])
          adminQuotationRows = listResult.rows
          paginatedQuotationsTotal = listResult.total
          // Fast first paint for Quotations tab: show lightweight rows immediately,
          // then enrich with installer/payment/doc details in later steps.
          if (adminQuotationRows.length > 0) {
            const earlyRelease = syncInstallerReleaseMapFromRows([
              ...adminQuotationRows,
              ...paymentSentRows,
              ...Object.values(installerQueueById),
            ])
            const previewRows = adminQuotationRows.map((row) => {
              const flat = stampInstallerReleaseFromMap(
                flattenQuotationListRow(row),
                earlyRelease,
              ) as Record<string, unknown>
              const customerData = (flat.customer || {}) as Record<string, unknown>
              return {
                ...flat,
                id: String(flat.id || ""),
                customer: {
                  firstName: String(customerData.firstName || ""),
                  lastName: String(customerData.lastName || ""),
                  mobile: String(customerData.mobile || ""),
                  email: String(customerData.email || ""),
                  address: (customerData.address as any) || {
                    street: "",
                    city: "",
                    state: "",
                    pincode: "",
                  },
                },
                products: mergeQuotationProductSources(flat),
                subtotal: Number((flat as any).pricing?.subtotal ?? flat.subtotal ?? flat.totalAmount ?? 0) || 0,
                totalAmount: Number((flat as any).pricing?.totalAmount ?? flat.totalAmount ?? 0) || 0,
                finalAmount: Number((flat as any).pricing?.finalAmount ?? flat.finalAmount ?? 0) || 0,
                status: ((flat.status as QuotationStatus) || "pending") as QuotationStatus,
                createdAt: String(flat.createdAt || flat.created_at || ""),
                updatedAt: String(flat.updatedAt || flat.updated_at || ""),
                validUntil: (flat as any).validUntil || (flat as any).valid_until,
                dealerId: (flat as any).dealer?.id || (flat as any).dealerId,
                dealer: (flat as any).dealer || null,
                installationStatus: (flat as any).installationStatus ?? (flat as any).installation_status,
                installation_status: (flat as any).installation_status ?? (flat as any).installationStatus,
              } as Quotation
            })
            if (!isStale()) {
              setQuotations((prev) => (prev.length > 0 && activeTab !== "quotations" ? prev : previewRows))
              setQuotationsListTotal((prev) => Math.max(prev ?? 0, paginatedQuotationsTotal ?? previewRows.length))
            }
          }
        } catch (quotationsError) {
          if (isStale()) return
          if (
            quotationsError instanceof ApiError &&
            isApiAuthFailure(undefined, quotationsError.code, quotationsError.message)
          ) {
            return
          }
          throw quotationsError
        }
        let resolvedQuotationsTotal = paginatedQuotationsTotal
        if (Number.isFinite(statsTotalHint) && (statsTotalHint as number) >= 0) {
          resolvedQuotationsTotal = Math.max(resolvedQuotationsTotal ?? 0, statsTotalHint as number)
        }
        if (isStale()) return
        setQuotationsListTotal(resolvedQuotationsTotal)
        setOptimisticFileLoginSelect({})
        setInstallerQueueIds(installerQueueIdSet)
        setInstallerQueueApprovedIds(installerQueueApprovedIdSet)

        let localQuotationsBackup: Quotation[] = []
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

        const adminRowsRaw: any[] = adminQuotationRows
        releaseLocal = syncInstallerReleaseMapFromRows([
          ...adminRowsRaw,
          ...paymentSentRows,
          ...Object.values(installerQueueById),
        ])

        const adminById = new Map<string, Record<string, unknown>>()
        adminRowsRaw.forEach((row: Record<string, unknown>) => {
          const id = String(row?.id || "").trim()
          if (id) adminById.set(id, stampInstallerReleaseFromMap(row, releaseLocal) as Record<string, unknown>)
        })
        Object.entries(installerQueueById).forEach(([id, queueRow]) => {
          if (!id) return
          const rowWithStatus = installerQueueApprovedIdSet.has(id)
            ? ({
                ...queueRow,
                installationStatus: queueRow.installationStatus ?? queueRow.installation_status ?? "installer_approved",
                installation_status: queueRow.installation_status ?? queueRow.installationStatus ?? "installer_approved",
              } as Record<string, unknown>)
            : queueRow
          const existing = adminById.get(id)
          if (existing) {
            adminById.set(
              id,
              stampInstallerReleaseFromMap(
                mergeInstallationMediaSources(existing, rowWithStatus) as OperationalQuotationRecord,
                releaseLocal,
              ) as Record<string, unknown>,
            )
            return
          }
          if (isQuotationSentToInstaller(rowWithStatus, releaseLocal) || releaseLocal[id]) {
            adminById.set(id, stampInstallerReleaseFromMap(rowWithStatus, releaseLocal) as Record<string, unknown>)
          }
        })
        // Payment Management source — all approved rows with Send to Installer (API or release map)
        const paymentRowsToMerge =
          paymentSentRows.length > 0
            ? paymentSentRows
            : (await (async () => {
                try {
                  const approvedResp = await api.quotations.getAll({ status: "approved", page: 1, limit: 1000 })
                  return extractQuotationListFromApiResponse(approvedResp)
                } catch {
                  return [] as unknown[]
                }
              })())
        if (isStale()) return
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
          const existing = adminById.get(id)
          const merged = stampInstallerReleaseFromMap(
            existing
              ? (mergeInstallationMediaSources(existing, flat) as OperationalQuotationRecord)
              : flat,
            releaseLocal,
          )
          adminById.set(id, merged as Record<string, unknown>)
        })
        // Browser release map (Payment Management) — local backup then detail fetch
        Object.entries(releaseLocal).forEach(([id, entry]) => {
          if (!id || adminById.has(id)) return
          const localRow = localByIdEarly.get(id)
          if (localRow) {
            adminById.set(
              id,
              stampInstallerReleaseFromMap(localRow as unknown as OperationalQuotationRecord, releaseLocal) as Record<
                string,
                unknown
              >,
            )
          }
        })

        // Paint Installation / Quotations rows before slow per-id detail fetches.
        const missingReleaseIds = Object.keys(releaseLocal)
          .filter((id) => id.trim() && !adminById.has(id))
          .slice(0, 24)

        const mapAdminByIdToQuotations = () =>
          Array.from(adminById.values()).map((q: any) => {
          const customerData = q.customer || {}
          const rawFileLogin = q.fileLoginStatus ?? q.file_login_status
          const fileLoginStatusNorm =
            rawFileLogin === "already_login" || rawFileLogin === "login_now" ? rawFileLogin : undefined
          const queueExtra = installerQueueById[String(q.id || "").trim()]
          const productSource = queueExtra ? { ...q, ...queueExtra } : q
          const mappedBase = {
            ...q,
            id: q.id,
            customer: {
              firstName: customerData.firstName || "",
              lastName: customerData.lastName || "",
              mobile: customerData.mobile || "",
              email: customerData.email || "",
              address: customerData.address || {
                street: "",
                city: "",
                state: "",
                pincode: "",
              },
            },
            // Merge products from JSON, QuotationProduct row, installer queue, and flattened API fields
            products: mergeQuotationProductSources(productSource),
            discount: q.discount || 0,
            subtotal: q.pricing?.subtotal ?? q.subtotal ?? q.totalAmount ?? 0,
            totalAmount: q.pricing?.totalAmount || 0,
            finalAmount: q.pricing?.finalAmount || q.finalAmount || 0,
            createdAt: q.createdAt ?? q.created_at,
            updatedAt: q.updatedAt ?? q.updated_at,
            validUntil: q.validUntil ?? q.valid_until,
            dealerId: q.dealer?.id || q.dealerId,
            dealer: q.dealer || null,
            status: (q.status || "pending") as QuotationStatus,
            paymentMode: (() => {
              const overlay = approvalLoanCashOverlayRef.current[String(q.id || "").trim()]
              return overlay?.paymentType ?? q.paymentMode ?? q.payment_mode
            })(),
            bankName: q.bankName ?? q.bank_name,
            bankIfsc: q.bankIfsc ?? q.bank_ifsc,
            loanAmount: (() => {
              const overlay = approvalLoanCashOverlayRef.current[String(q.id || "").trim()]
              if (overlay?.loanAmount != null && overlay.loanAmount > 0) return overlay.loanAmount
              const n = Number(q.loanAmount ?? q.loan_amount)
              return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
            })(),
            cashAmount: (() => {
              const overlay = approvalLoanCashOverlayRef.current[String(q.id || "").trim()]
              if (overlay?.cashAmount != null && overlay.cashAmount > 0) return overlay.cashAmount
              const n = Number(q.cashAmount ?? q.cash_amount)
              return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
            })(),
            paymentPhases: readQuotationPaymentPhases(q),
            subsidyChequeDetails: q.subsidyChequeDetails ?? q.subsidy_cheque_details,
            fileLoginStatus: fileLoginStatusNorm as FileLoginStatus | undefined,
            filePaymentType: (() => {
              const overlay = approvalLoanCashOverlayRef.current[String(q.id || "").trim()]
              const fromApi = (q.filePaymentType ?? q.file_payment_type) as ApprovalPaymentType | undefined
              return overlay?.paymentType || fromApi
            })(),
            paymentType: (() => {
              const overlay = approvalLoanCashOverlayRef.current[String(q.id || "").trim()]
              const fromApi = (q.paymentType ?? q.payment_type ?? q.paymentMode ?? q.payment_mode) as
                | ApprovalPaymentType
                | undefined
              return overlay?.paymentType || fromApi
            })(),
            fileBankName: q.fileBankName ?? q.file_bank_name,
            fileBankIfsc: q.fileBankIfsc ?? q.file_bank_ifsc,
            fileSubsidyChequeDetails: q.fileSubsidyChequeDetails ?? q.file_subsidy_cheque_details,
            fileLoginAt: q.fileLoginAt ?? q.file_login_at,
            statusApprovedAt: q.statusApprovedAt ?? q.status_approved_at ?? q.approvedAt,
            statusHistory: normalizeStatusHistoryFromApi(q.statusHistory ?? q.status_history ?? q.statusChanges),
            installationStatus: q.installationStatus ?? q.installation_status,
            installation_status: q.installation_status ?? q.installationStatus,
            meteringStatus: q.meteringStatus ?? q.metering_status,
            metering_status: q.metering_status ?? q.meteringStatus,
            mcoStatus: q.mcoStatus ?? q.mco_status,
            mco_status: q.mco_status ?? q.mcoStatus,
            meteringApprovedAt: q.meteringApprovedAt ?? q.metering_approved_at,
            metering_approved_at: q.metering_approved_at ?? q.meteringApprovedAt,
            mcoAt: q.mcoAt ?? q.mco_at,
            mco_at: q.mco_at ?? q.mcoAt,
            discomName: q.discomName ?? q.discom_name,
            discom_name: q.discom_name ?? q.discomName,
            discomLocation: q.discomLocation ?? q.discom_location,
            discom_location: q.discom_location ?? q.discomLocation,
            remarks: q.remarks ?? q.meteringRemarks ?? q.metering_remarks,
            authorizedRepresentative: q.authorizedRepresentative ?? q.authorized_representative,
            authorized_representative: q.authorized_representative ?? q.authorizedRepresentative,
            assignedPersonName: q.assignedPersonName ?? q.assigned_person_name,
            assigned_person_name: q.assigned_person_name ?? q.assignedPersonName,
            visitLocation: q.visitLocation ?? q.visit_location ?? q.location,
            visit_location: q.visit_location ?? q.visitLocation ?? q.location,
            meteringWccAfterDiscom: q.meteringWccAfterDiscom ?? q.metering_wcc_after_discom,
            metering_wcc_after_discom: q.metering_wcc_after_discom ?? q.meteringWccAfterDiscom,
            meterType: q.meterType ?? q.meter_type,
            meter_type: q.meter_type ?? q.meterType,
            meterNo: q.meterNo ?? q.meter_no,
            meter_no: q.meter_no ?? q.meterNo,
            statusUpdatedAt: q.statusUpdatedAt ?? q.status_updated_at,
            status_updated_at: q.status_updated_at ?? q.statusUpdatedAt,
            installationReadyForInstaller: q.installationReadyForInstaller ?? q.installation_ready_for_installer,
            installationReleasedAt: q.installationReleasedAt ?? q.installation_released_at,
            installationScheduledAt: q.installationScheduledAt ?? q.installation_scheduled_at,
            installationTeamId: q.installationTeamId ?? q.installation_team_id,
          }
          const mapped = queueExtra
            ? (mergeInstallationMediaSources(mappedBase, queueExtra) as typeof mappedBase)
            : mappedBase
          return mergeAdminMeteringHandoffOntoQuotation(
            mergeInstallerReleaseOntoQuotation(mapped, releaseLocal),
            handoffLocal,
          )
        })

        const publishQuotationsFromAdminById = () => {
          const nextList = mapAdminByIdToQuotations()
          const scheduledLocal = readInstallationScheduledMap()
          const teamAssignLocal = readTeamAssignments()
          const localById = localByIdEarly

          setQuotations(
            nextList.map((q: any) => {
              const localRow = localById.get(String(q.id || ""))
              const withRelease = mergeInstallerReleaseOntoQuotation(q, releaseLocal, localRow ?? null)
              const withHandoff = mergeAdminMeteringHandoffOntoQuotation(withRelease, handoffLocal)
              const withSchedule = {
                ...withHandoff,
                installationScheduledAt: withHandoff.installationScheduledAt || scheduledLocal[q.id],
                installationTeamId: withHandoff.installationTeamId || teamAssignLocal[q.id],
              }
              if (!localRow) return withSchedule
              const apiKw = getQuotationSystemKw(withSchedule)
              const localSource = omitEmptyProductsField({
                ...withSchedule,
                products: localRow.products,
                quotationProduct: (localRow as unknown as Record<string, unknown>).quotationProduct,
              })
              const localKw = getQuotationSystemKw({
                ...withSchedule,
                products: mergeQuotationProductSources(localSource),
              })
              if (localKw <= apiKw) return withSchedule
              return {
                ...withSchedule,
                products: mergeQuotationProductSources(localSource),
              }
            }),
          )
          setQuotationsListTotal((prev) => Math.max(prev ?? 0, nextList.length))
          return nextList
        }

        // First paint for Installation / Quotations — before slow per-id fetches.
        let quotationsList = publishQuotationsFromAdminById()
        syncAdminMeteringHandoffMapFromRows(quotationsList as OperationalQuotationRecord[])
        // Unblock Overview / tab switches while dealers/visitors continue loading.
        if (!isStale()) setIsAdminDataLoading(false)

        if (missingReleaseIds.length > 0) {
          await Promise.all(
            missingReleaseIds.map(async (id) => {
              if (isStale()) return
              try {
                const detail = await api.admin.quotations.getById(id)
                const payload =
                  (detail as Record<string, unknown>)?.quotation ??
                  (detail as Record<string, unknown>)?.data ??
                  detail
                const flat = flattenQuotationListRow(payload)
                if (!String(flat.id || "").trim()) return
                adminById.set(
                  id,
                  stampInstallerReleaseFromMap(flat, releaseLocal) as Record<string, unknown>,
                )
              } catch {
                // Row stays missing until backend persists release flags
              }
            }),
          )
          if (!isStale()) {
            quotationsList = publishQuotationsFromAdminById()
          }
        }

        let dealersList: Dealer[] = []
        try {
          const dealerRows: any[] = []
          const firstDealersResponse: any = await api.admin.dealers.getAll({
            page: 1,
            limit: 1000,
            includeInactive: true,
          })
          dealerRows.push(...(firstDealersResponse?.dealers || []))
          const totalPages = Number(firstDealersResponse?.pagination?.totalPages || 1)
          if (totalPages > 1) {
            for (let page = 2; page <= totalPages; page += 1) {
              const pageResponse: any = await api.admin.dealers.getAll({
                page,
                limit: 1000,
                includeInactive: true,
              })
              dealerRows.push(...(pageResponse?.dealers || []))
            }
          }
          const dedupedDealerRows = Array.from(
            new Map(dealerRows.map((row) => [String(row?.id || row?._id || ""), row])).values(),
          ).filter((row) => String(row?.id || row?._id || "").trim())
          dealersList = dedupedDealerRows.map((d: any) => ({
            id: d.id || d._id,
            username: d.username,
            firstName: d.firstName,
            lastName: d.lastName,
            email: d.email,
            mobile: d.mobile,
            gender: d.gender || "",
            dateOfBirth: d.dateOfBirth || "",
            fatherName: d.fatherName || "",
            fatherContact: d.fatherContact || "",
            governmentIdType: d.governmentIdType || "",
            governmentIdNumber: d.governmentIdNumber || "",
            address: d.address || {
              street: "",
              city: "",
              state: "",
              pincode: "",
            },
            isActive: d.isActive ?? false,
            createdAt: d.createdAt,
            emailVerified: d.emailVerified ?? false,
            access: normalizeAccessList(d.access ?? d.permissions),
            permissions: normalizeAccessList(d.permissions ?? d.access),
          }))
          setDealers(dealersList)
        } catch (dealersError) {
          console.error("Error loading dealers:", dealersError)
        }

        try {
          const visitorsResponse = await api.admin.visitors.getAll()
          const visitorsList = visitorsResponse.visitors || []
          setVisitors(visitorsList.map((v: any) => ({
            id: v.id,
            username: v.username || "",
            password: "",
            firstName: v.firstName || "",
            lastName: v.lastName || "",
            email: v.email || "",
            mobile: v.mobile || "",
            employeeId: v.employeeId,
            isActive: v.isActive ?? true,
            createdBy: v.createdBy,
            createdAt: v.createdAt,
            updatedAt: v.updatedAt,
            visitCount: v.visitCount || 0,
            access: normalizeAccessList(v.access ?? v.permissions),
            permissions: normalizeAccessList(v.permissions ?? v.access),
          })))
        } catch (visitorsError) {
          console.error("Error loading visitors:", visitorsError)
        }

        // Load account managers
        try {
          const accountManagersResponse = await api.admin.accountManagers.getAll()
          const accountManagersList = accountManagersResponse.accountManagers || accountManagersResponse || []
          const roleOverrides = getOperationsRoleOverrides()
          setAccountManagers(accountManagersList.map((am: any) => ({
            id: am.id,
            username: am.username || "",
            firstName: am.firstName || "",
            lastName: am.lastName || "",
            email: am.email || "",
            mobile: am.mobile || "",
            role: am.role || roleOverrides[String(am.username || "").toLowerCase()] || "account-management",
            isActive: am.isActive ?? true,
            emailVerified: am.emailVerified ?? false,
            createdAt: am.createdAt,
            loginCount: am.loginCount || 0,
            lastLogin: am.lastLogin,
            access: normalizeAccessList(am.access ?? am.permissions),
            permissions: normalizeAccessList(am.permissions ?? am.access),
          })))
        } catch (error) {
          console.error("Error loading account managers:", error)
          // If endpoint doesn't exist yet, use empty array
          setAccountManagers([])
        }

        // Load customers from quotations data (after dealers are loaded)
        const customerMap = new Map<string, any>()
        quotationsList.forEach((q: any) => {
          const customer = q.customer
          if (customer && customer.mobile) {
            const mobile = customer.mobile
            if (!customerMap.has(mobile)) {
              customerMap.set(mobile, {
                id: customer.id,
                firstName: customer.firstName || "",
                lastName: customer.lastName || "",
                mobile: customer.mobile || "",
                email: customer.email || "",
                address: customer.address || {
                  street: "",
                  city: "",
                  state: "",
                  pincode: "",
                },
                quotationCount: 0,
                totalAmount: 0,
                lastQuotation: "",
                dealerIds: new Set<string>(),
              })
            }
            const customerData = customerMap.get(mobile)
            customerData.quotationCount += 1
            customerData.totalAmount += (q.pricing?.finalAmount || q.finalAmount || 0)
            const dealerId = q.dealer?.id || q.dealerId
            if (dealerId) {
              customerData.dealerIds.add(dealerId)
            }
            const qDate = q.createdAt
            if (!customerData.lastQuotation || (qDate && new Date(qDate) > new Date(customerData.lastQuotation))) {
              customerData.lastQuotation = qDate
            }
          }
        })
        // Convert dealerIds Set to array and get dealer names
        const customersList = Array.from(customerMap.values()).map((c: any) => ({
          ...c,
          dealerIds: Array.from(c.dealerIds) as string[],
          dealers: (Array.from(c.dealerIds) as string[]).map((dealerId) => {
            const dealer = dealersList.find((d: any) => d.id === dealerId)
            return dealer ? `${dealer.firstName} ${dealer.lastName}` : "Unknown"
          }),
        }))
        setCustomers(customersList)

        // Calling Reports now loads through a dedicated fast path (`loadCallingActionsForReports`)
        // so this heavy admin bootstrap does not block that tab.
      } else {
        // Fallback to localStorage
        // Load all quotations and ensure they have status
        const allQuotations = JSON.parse(localStorage.getItem("quotations") || "[]")
        const scheduledLocalFallback = readInstallationScheduledMap()
        const teamAssignFallback = readTeamAssignments()
        const quotationsWithStatus = allQuotations.map((q: Quotation) => ({
          ...q,
          status: q.status || "pending",
          subtotal: (q as any).subtotal ?? q.totalAmount ?? 0,
          installationScheduledAt:
            (q as any).installationScheduledAt || scheduledLocalFallback[q.id],
          installationTeamId: (q as any).installationTeamId || teamAssignFallback[q.id],
        }))
        setQuotations(quotationsWithStatus)
        setQuotationsListTotal(quotationsWithStatus.length)
        setThisMonthQuotationsFromStats(null)
        setInstallerQueueIds(new Set(quotationsWithStatus.map((q: Quotation) => q.id)))
        // Update localStorage with status if needed
        if (allQuotations.some((q: Quotation) => !q.status)) {
          localStorage.setItem("quotations", JSON.stringify(quotationsWithStatus))
        }

        // Load all dealers
        const allDealers = JSON.parse(localStorage.getItem("dealers") || "[]")
        // Remove password field
        const dealersWithoutPassword = allDealers.map((d: Dealer & { password?: string }) => {
          const { password: _, ...dealerData } = d
          return dealerData
        })
        setDealers(dealersWithoutPassword)

        // Load account managers from localStorage
        try {
          const allAccountManagers = JSON.parse(localStorage.getItem("accountManagers") || "[]")
          const allInstallers = JSON.parse(localStorage.getItem("installers") || "[]")
          const allMeteringUsers = JSON.parse(localStorage.getItem("meteringUsers") || "[]")
          const allBaldevUsers = JSON.parse(localStorage.getItem("baldevUsers") || "[]")
          const allHrUsers = JSON.parse(localStorage.getItem("hrUsers") || "[]")
          const mergedOperationUsers = [
            ...allAccountManagers.map((u: any) => ({ ...u, role: "account-management" })),
            ...allInstallers.map((u: any) => ({ ...u, role: "installer" })),
            ...allMeteringUsers.map((u: any) => ({ ...u, role: "metering" })),
            ...allBaldevUsers.map((u: any) => ({ ...u, role: "baldev" })),
            ...allHrUsers.map((u: any) => ({ ...u, role: "hr" })),
          ]
          const accountManagersWithoutPassword = mergedOperationUsers.map((am: AccountManager & { password?: string }) => {
            const { password: _, ...accountManagerData } = am
            return accountManagerData
          })
          setAccountManagers(accountManagersWithoutPassword)
        } catch (error) {
          console.error("Error loading account managers from localStorage:", error)
          setAccountManagers([])
        }

        // Load all visitors
        const allVisitors = JSON.parse(localStorage.getItem("visitors") || "[]")
        // Remove password field for display
        const visitorsWithoutPassword = allVisitors.map((v: Visitor & { password?: string }) => {
          const { password: _, ...visitorData } = v
          return visitorData
        })
        setVisitors(visitorsWithoutPassword)

        // Load customers from quotations (localStorage fallback)
        const customerMap = new Map<string, any>()
        quotationsWithStatus.forEach((q: Quotation) => {
          const customer = q.customer
          if (customer && customer.mobile) {
            const mobile = customer.mobile
            if (!customerMap.has(mobile)) {
              customerMap.set(mobile, {
                id: (customer as any).id,
                firstName: customer.firstName || "",
                lastName: customer.lastName || "",
                mobile: customer.mobile || "",
                email: customer.email || "",
                address: customer.address || {
                  street: "",
                  city: "",
                  state: "",
                  pincode: "",
                },
                quotationCount: 0,
                totalAmount: 0,
                lastQuotation: "",
                dealerIds: new Set<string>(),
              })
            }
            const customerData = customerMap.get(mobile)
            customerData.quotationCount += 1
            customerData.totalAmount += q.finalAmount || 0
            if (q.dealerId) {
              customerData.dealerIds.add(q.dealerId)
            }
            const qDate = q.createdAt
            if (!customerData.lastQuotation || (qDate && new Date(qDate) > new Date(customerData.lastQuotation))) {
              customerData.lastQuotation = qDate
            }
          }
        })
        // Get dealer names from localStorage dealers
        const customersList = Array.from(customerMap.values()).map((c: any) => ({
          ...c,
          dealerIds: Array.from(c.dealerIds) as string[],
          dealers: (Array.from(c.dealerIds) as string[]).map((dealerId) => {
            const dealer = dealersWithoutPassword.find((d: Dealer) => d.id === dealerId)
            return dealer ? `${dealer.firstName} ${dealer.lastName}` : "Unknown"
          }),
        }))
        setCustomers(customersList)

        // Local fallback keeps legacy flows, but calling reports API is preferred in useApi mode.
      }
    } catch (error) {
      if (isStale()) return
      if (error instanceof ApiError && isApiAuthFailure(undefined, error.code, error.message)) {
        return
      }
      console.error("Error loading admin data:", error)
      setAdminLoadError(apiErrorToUserMessage(error))
      toast({
        title: "Could not load admin data",
        description: apiErrorToUserMessage(error),
        variant: "destructive",
      })
    } finally {
      if (!isStale()) setIsAdminDataLoading(false)
    }
  }

  const buildVisitorReportApiFilters = useCallback(() => {
    let startDate: string | undefined
    let endDate: string | undefined
    if (visitorReportRange === "custom") {
      const bounds = getCustomBoundsFromYmd(visitorReportCustomFromDate, visitorReportCustomToDate)
      if (bounds) {
        startDate = formatYmdLocal(bounds.start)
        endDate = formatYmdLocal(bounds.end)
      }
    } else if (visitorReportRange !== "all") {
      const bounds = getPresetBounds(visitorReportRange)
      startDate = formatYmdLocal(bounds.start)
      endDate = formatYmdLocal(bounds.end)
    }
    return {
      status: visitorReportStatusFilter,
      visitorId: visitorReportVisitorFilter,
      startDate,
      endDate,
      search: visitorReportSearchDebounced,
    }
  }, [
    visitorReportCustomFromDate,
    visitorReportCustomToDate,
    visitorReportRange,
    visitorReportSearchDebounced,
    visitorReportStatusFilter,
    visitorReportVisitorFilter,
  ])

  const loadVisitorReports = useCallback(
    async (options?: { background?: boolean }) => {
      if (options?.background) {
        setVisitorReportRefreshing(true)
      } else {
        setVisitorReportLoading(true)
      }
      try {
        const result = await loadAdminVisitorReportRows({
          quotations,
          dealers,
          visitors,
          useApi,
          filters: buildVisitorReportApiFilters(),
        })
        setVisitorReportRows(result.rows)
        setVisitorReportUnavailable(result.unavailable)
        setVisitorReportLoadSource(result.source)
      } catch (error) {
        console.error("Error loading visitor reports:", error)
        if (!options?.background) {
          setVisitorReportRows([])
          setVisitorReportUnavailable(true)
          setVisitorReportLoadSource(null)
        }
      } finally {
        setVisitorReportLoading(false)
        setVisitorReportRefreshing(false)
      }
    },
    [buildVisitorReportApiFilters, dealers, quotations, useApi, visitors],
  )

  useEffect(() => {
    if (!isAuthenticated || activeTab !== "visitor-reports") return
    void loadVisitorReports()
  }, [activeTab, isAuthenticated, loadVisitorReports])

  useEffect(() => {
    if (activeTab === "visitors" || activeTab === "account-management") {
      setActiveTab("dealers")
    }
  }, [activeTab])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisitorReportSearchDebounced(visitorReportSearch)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [visitorReportSearch])

  useEffect(() => {
    if (activeTab !== "visitor-reports") return
    if (visitorReportLoadSource !== "admin_visits" && visitorReportLoadSource !== "visits") return
    void loadVisitorReports({ background: true })
  }, [
    activeTab,
    buildVisitorReportApiFilters,
    loadVisitorReports,
    visitorReportLoadSource,
  ])

  useEffect(() => {
    const socket = getRealtime()
    if (!socket || !isAuthenticated) return

    const refetchAdminData = () => {
      if (!getAuthToken()) return
      void loadData(++adminLoadRequestRef.current)
    }

    const onBackendMutation = (evt: any) => {
      const domain = String(evt?.domain || "").toLowerCase()
      const path = String(evt?.path || "").toLowerCase()
      if (domain === "admin" || domain === "hr" || domain === "dealers" || path.includes("calling")) {
        refetchAdminData()
      }
      if (activeTab === "visitor-reports" && (path.includes("visit") || domain === "visitors")) {
        void loadVisitorReports()
      }
      if (
        activeTab === "overview" &&
        (path.includes("file-login") ||
          path.includes("product-needed") ||
          path.includes("quotations") ||
          path.includes("installation") ||
          path.includes("installer") ||
          domain === "quotations")
      ) {
        setProductNeededRefreshToken((token) => token + 1)
      }
    }

    socket.on("calling:actions-updated", refetchAdminData)
    socket.on("dealer:directory-updated", refetchAdminData)
    socket.on("backend:mutation", onBackendMutation)

    return () => {
      socket.off("calling:actions-updated", refetchAdminData)
      socket.off("dealer:directory-updated", refetchAdminData)
      socket.off("backend:mutation", onBackendMutation)
    }
  }, [activeTab, isAuthenticated, loadVisitorReports])

  useEffect(() => {
    if (callingRange !== "custom") return
    if (callingCustomFromDate || callingCustomToDate) return
    const t = formatYmdLocal(new Date())
    setCallingCustomFromDate(t)
    setCallingCustomToDate(t)
  }, [callingRange, callingCustomFromDate, callingCustomToDate])

  useEffect(() => {
    if (visitorReportRange !== "custom") return
    if (visitorReportCustomFromDate || visitorReportCustomToDate) return
    const t = formatYmdLocal(new Date())
    setVisitorReportCustomFromDate(t)
    setVisitorReportCustomToDate(t)
  }, [visitorReportRange, visitorReportCustomFromDate, visitorReportCustomToDate])

  /**
   * Dealer dropdowns / charts: active users with Quotation checkbox
   * (not every row from the old dealers table).
   */
  const activeDealers = useMemo(() => {
    return filterActiveDealers(dealers).filter((d) =>
      listedUserHasAccess(
        {
          username: d.username,
          role: d.username === ADMIN_USERNAME ? "admin" : "dealer",
          access: d.access,
          permissions: d.permissions,
          isActive: d.isActive,
        },
        "quotation",
      ),
    )
  }, [dealers])

  /** Users tab: dealers + operations users + visitors. */
  type ManagedUserRow = {
    id: string
    kind: "dealer" | "operations" | "visitor"
    username: string
    firstName: string
    lastName: string
    email: string
    mobile: string
    isActive?: boolean
    emailVerified?: boolean
    roleLabel: string
    access: UserAccessKey[]
    accessLabelList?: string[]
    searchText?: string
    dealer?: Dealer
    operations?: AccountManager & { role?: string }
    visitor?: Visitor
  }

  const managedUsers = useMemo((): ManagedUserRow[] => {
    const finishRow = (
      row: Omit<ManagedUserRow, "accessLabelList" | "searchText">,
    ): ManagedUserRow => {
      const accessLabelList = accessLabels(row.access)
      return {
        ...row,
        accessLabelList,
        searchText: [
          row.firstName,
          row.lastName,
          row.email,
          row.mobile,
          row.username,
          row.roleLabel,
          row.visitor?.employeeId,
          ...accessLabelList,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      }
    }
    const dealerRows: ManagedUserRow[] = dealers.map((d) =>
      finishRow({
        id: `dealer:${d.id}`,
        kind: "dealer",
        username: d.username,
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email,
        mobile: d.mobile,
        isActive: d.isActive,
        emailVerified: d.emailVerified,
        roleLabel: d.username === ADMIN_USERNAME ? "Admin" : "Dealer",
        access: resolveUserAccess({
          username: d.username,
          role: d.username === ADMIN_USERNAME ? "admin" : "dealer",
          access: d.access,
          permissions: d.permissions,
        }),
        dealer: d,
      }),
    )

    const dealerUsernames = new Set(dealers.map((d) => d.username.trim().toLowerCase()))
    const opsRows: ManagedUserRow[] = accountManagers
      .filter((am) => !dealerUsernames.has(String(am.username || "").trim().toLowerCase()))
      .map((am) => {
        const roleValue = String((am as any).role || "account-management")
        const access = resolveUserAccess({
          username: am.username,
          role: roleValue,
          access: am.access,
          permissions: am.permissions,
        })
        return finishRow({
          id: `ops:${am.id}`,
          kind: "operations",
          username: am.username,
          firstName: am.firstName,
          lastName: am.lastName,
          email: am.email,
          mobile: am.mobile,
          isActive: am.isActive,
          emailVerified: am.emailVerified,
          roleLabel: roleValue.replace(/-/g, " "),
          access,
          operations: am,
        })
      })

    const takenUsernames = new Set([
      ...dealers.map((d) => d.username.trim().toLowerCase()),
      ...accountManagers.map((am) => String(am.username || "").trim().toLowerCase()),
    ])
    const visitorRows: ManagedUserRow[] = visitors
      .filter((v) => !takenUsernames.has(String(v.username || "").trim().toLowerCase()))
      .map((v) => {
        const access = resolveUserAccess({
          username: v.username,
          role: "visitor",
          access: v.access,
          permissions: v.permissions,
        })
        return finishRow({
          id: `visitor:${v.id}`,
          kind: "visitor" as const,
          username: v.username,
          firstName: v.firstName,
          lastName: v.lastName,
          email: v.email,
          mobile: v.mobile,
          isActive: v.isActive,
          roleLabel: "Visitor",
          access,
          visitor: v,
        })
      })

    return [...dealerRows, ...opsRows, ...visitorRows].sort((a, b) => {
      const an = `${a.firstName} ${a.lastName}`.toLowerCase()
      const bn = `${b.firstName} ${b.lastName}`.toLowerCase()
      return an.localeCompare(bn)
    })
  }, [dealers, accountManagers, visitors])

  const modulePermissionUserOptions = useMemo(
    () =>
      managedUsers.map((row) => ({
        id: row.dealer?.id ?? row.operations?.id ?? row.visitor?.id ?? row.id,
        label: `${row.firstName || ""} ${row.lastName || ""}`.trim() || row.username || row.id,
      })),
    [managedUsers],
  )

  const dealerQuotationStatsById = useMemo(() => {
    const map = new Map<string, { count: number; revenue: number }>()
    for (const q of quotations) {
      const id = String(q.dealerId || "").trim()
      if (!id) continue
      const amount = getQuotationDisplayAmount(q)
      const prev = map.get(id)
      if (prev) {
        prev.count += 1
        prev.revenue += amount
      } else {
        map.set(id, { count: 1, revenue: amount })
      }
    }
    return map
  }, [quotations])

  const filteredManagedUsers = useMemo(() => {
    const search = dealerSearchTerm.trim().toLowerCase()
    if (!search) return managedUsers
    return managedUsers.filter((u) => u.searchText?.includes(search))
  }, [managedUsers, dealerSearchTerm])

  const managedUsersListResetKey = `${dealerSearchTerm}|${filteredManagedUsers.length}|${filteredManagedUsers[0]?.id ?? ""}`

  const {
    visibleItems: visibleManagedUsers,
    hasMore: hasMoreManagedUsers,
    loadMore: loadMoreManagedUsers,
    sentinelRef: managedUsersSentinelRef,
    visibleCount: visibleManagedUsersCount,
    totalCount: filteredManagedUsersTotal,
  } = useIncrementalList(filteredManagedUsers, {
    batchSize: 15,
    resetKey: managedUsersListResetKey,
    enabled: activeTab === "dealers",
  })

  /** Visitors tab / visit filters: anyone with Visitor checkbox (dealers + ops + visitors). */
  const visitorAccessUsers = useMemo(() => {
    return managedUsers
      .filter((u) => hasAccess(u.access, "visitor"))
      .map((u) => ({
        rowId: u.id,
        entityId: u.dealer?.id || u.operations?.id || u.visitor?.id || u.id,
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        mobile: u.mobile,
        employeeId: u.visitor?.employeeId,
        isActive: u.isActive,
        access: u.access,
        kind: u.kind,
        managed: u,
        visitCount: (u.visitor as any)?.visitCount || 0,
      }))
  }, [managedUsers])

  // Keep Schedule Visit + HR dealer lists in sync with Admin access checkboxes
  useEffect(() => {
    if (managedUsers.length === 0) return
    const profiles = managedUsers.map((u) => ({
      id: u.dealer?.id || u.operations?.id || u.visitor?.id || u.id,
      username: u.username,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      mobile: u.mobile,
      employeeId: u.visitor?.employeeId,
      isActive: u.isActive,
      role: u.kind === "dealer" ? "dealer" : u.kind === "visitor" ? "visitor" : u.roleLabel,
      access: u.access,
    }))
    syncAssignableVisitorsFromUsers(profiles)
    syncAssignableQuotationFromUsers(profiles)
  }, [managedUsers])

  useEffect(() => {
    if (
      visitorReportVisitorFilter !== "all" &&
      !visitorAccessUsers.some((v) => v.entityId === visitorReportVisitorFilter)
    ) {
      setVisitorReportVisitorFilter("all")
    }
  }, [visitorReportVisitorFilter, visitorAccessUsers])

  const openManagedUserEdit = (row: ManagedUserRow) => {
    const base = emptyUnifiedUserForm()
    const access = row.access.length ? row.access : (["quotation"] as UserAccessKey[])

    if (row.kind === "operations" && row.operations) {
      const am = row.operations
      setEditingManagedKind("operations")
      setEditingAccountManager(am)
      setEditingDealer(null)
      setEditingVisitor(null)
      setNewAccountManager({
        ...base,
        role: (am as any).role || primaryBackendRoleFromAccess(access),
        access,
        username: am.username || "",
        password: "",
        firstName: am.firstName || "",
        lastName: am.lastName || "",
        email: am.email || "",
        mobile: am.mobile || "",
        gender: (am as any).gender || "",
        dateOfBirth: (am as any).dateOfBirth || "",
        fatherName: (am as any).fatherName || "",
        fatherContact: (am as any).fatherContact || "",
        governmentIdType: (am as any).governmentIdType || "",
        governmentIdNumber: (am as any).governmentIdNumber || "",
        address: {
          street: (am as any).address?.street || "",
          city: (am as any).address?.city || "",
          state: (am as any).address?.state || "",
          pincode: (am as any).address?.pincode || "",
        },
        employeeId: (am as any).employeeId || "",
        isActive: am.isActive ?? true,
        emailVerified: am.emailVerified ?? false,
        officeLocation: resolveUserOfficeLocation(
          am.username,
          (am as any).officeLocation ?? (am as any).office_location,
        ),
        moduleFieldPermissions: resolveUserModulePermissions(
          am.username,
          (am as any).moduleFieldPermissions ?? (am as any).modulePermissions,
        ),
      })
      setAccountManagerDialogOpen(true)
      return
    }

    if (row.kind === "visitor" && row.visitor) {
      const visitor = row.visitor
      setEditingManagedKind("visitor")
      setEditingVisitor(visitor)
      setEditingDealer(null)
      setEditingAccountManager(null)
      setNewAccountManager({
        ...base,
        role: "visitor",
        access: access.length ? access : (["visitor"] as UserAccessKey[]),
        username: visitor.username || "",
        password: "",
        firstName: visitor.firstName || "",
        lastName: visitor.lastName || "",
        email: visitor.email || "",
        mobile: visitor.mobile || "",
        gender: (visitor as any).gender || "",
        dateOfBirth: (visitor as any).dateOfBirth || "",
        fatherName: (visitor as any).fatherName || "",
        fatherContact: (visitor as any).fatherContact || "",
        governmentIdType: (visitor as any).governmentIdType || "",
        governmentIdNumber: (visitor as any).governmentIdNumber || "",
        address: {
          street: (visitor as any).address?.street || "",
          city: (visitor as any).address?.city || "",
          state: (visitor as any).address?.state || "",
          pincode: (visitor as any).address?.pincode || "",
        },
        employeeId: visitor.employeeId || "",
        isActive: visitor.isActive ?? true,
        emailVerified: (visitor as any).emailVerified ?? false,
        officeLocation: resolveUserOfficeLocation(
          visitor.username,
          (visitor as any).officeLocation ?? (visitor as any).office_location,
        ),
        moduleFieldPermissions: resolveUserModulePermissions(
          visitor.username,
          (visitor as any).moduleFieldPermissions ?? (visitor as any).modulePermissions,
        ),
      })
      setAccountManagerDialogOpen(true)
      return
    }

    const d = row.dealer
    if (!d) return
    setEditingManagedKind("dealer")
    setEditingDealer(d)
    setEditingAccountManager(null)
    setEditingVisitor(null)
    setNewAccountManager({
      ...base,
      role: d.username === ADMIN_USERNAME ? "admin" : "dealer",
      access,
      username: d.username || "",
      password: "",
      firstName: d.firstName || "",
      lastName: d.lastName || "",
      email: d.email || "",
      mobile: d.mobile || "",
      gender: d.gender || "",
      dateOfBirth: d.dateOfBirth || "",
      fatherName: d.fatherName || "",
      fatherContact: d.fatherContact || "",
      governmentIdType: d.governmentIdType || "",
      governmentIdNumber: d.governmentIdNumber || "",
      address: {
        street: d.address?.street || "",
        city: d.address?.city || "",
        state: d.address?.state || "",
        pincode: d.address?.pincode || "",
      },
      employeeId: (d as any).employeeId || "",
      isActive: d.isActive ?? true,
      emailVerified: d.emailVerified ?? false,
      officeLocation: resolveUserOfficeLocation(
        d.username,
        (d as any).officeLocation ?? (d as any).office_location,
      ),
      moduleFieldPermissions: resolveUserModulePermissions(
        d.username,
        (d as any).moduleFieldPermissions ?? (d as any).modulePermissions,
      ),
    })
    setAccountManagerDialogOpen(true)
  }

  const openCreateUnifiedUser = (presetAccess: UserAccessKey[] = ["quotation"]) => {
    setEditingManagedKind(null)
    setEditingAccountManager(null)
    setEditingDealer(null)
    setEditingVisitor(null)
    setNewAccountManager({
      ...emptyUnifiedUserForm(),
      access: presetAccess,
      role: primaryBackendRoleFromAccess(presetAccess),
    })
    setAccountManagerDialogOpen(true)
  }

  useEffect(() => {
    if (filterDealer !== "all" && !activeDealers.some((d) => d.id === filterDealer)) {
      setFilterDealer("all")
    }
  }, [activeDealers, filterDealer])

  useEffect(() => {
    if (
      callingActionDealerFilter !== "all" &&
      !activeDealers.some((d) => d.id === callingActionDealerFilter)
    ) {
      setCallingActionDealerFilter("all")
    }
  }, [activeDealers, callingActionDealerFilter])

  useEffect(() => {
    if (topDealersDealerFilter !== "all" && !activeDealers.some((d) => d.id === topDealersDealerFilter)) {
      setTopDealersDealerFilter("all")
    }
  }, [activeDealers, topDealersDealerFilter])

  useEffect(() => {
    if (topDealersDateFilter !== "custom") return
    if (topDealersCustomFromDate || topDealersCustomToDate) return
    const t = formatYmdLocal(new Date())
    setTopDealersCustomFromDate(t)
    setTopDealersCustomToDate(t)
  }, [topDealersDateFilter, topDealersCustomFromDate, topDealersCustomToDate])

  const dealerStats = useMemo(() => {
    if (activeTab !== "overview") return []
    const dealersForStats =
      topDealersDealerFilter === "all"
        ? activeDealers
        : activeDealers.filter((d) => d.id === topDealersDealerFilter)

    return dealersForStats.map((d) => {
      const dealerApprovedQuotations = quotations.filter(
        (q) =>
          q.dealerId === d.id &&
          matchesOverviewTopDealersApprovalDate(
            q,
            topDealersDateFilter,
            topDealersCustomFromDate,
            topDealersCustomToDate,
          ),
      )
      const dealerRevenue = dealerApprovedQuotations.reduce((sum, q) => sum + getQuotationDisplayAmount(q), 0)
      const totalKw = dealerApprovedQuotations.reduce(
        (sum, q) =>
          sum +
          getQuotationSystemKw({
            ...q,
            products: mergeQuotationProductSources(q),
          }),
        0,
      )
      return {
        dealer: d,
        quotationCount: dealerApprovedQuotations.length,
        revenue: dealerRevenue,
        totalKw,
      }
    })
  }, [
    activeTab,
    activeDealers,
    quotations,
    topDealersDateFilter,
    topDealersDealerFilter,
    topDealersCustomFromDate,
    topDealersCustomToDate,
  ])

  const overviewPeriodApprovedQuotations = useMemo(
    () =>
      quotations.filter(
        (q) =>
          String(q.status || "").toLowerCase() === "approved" &&
          matchesOverviewTopDealersApprovalDate(
            q,
            topDealersDateFilter,
            topDealersCustomFromDate,
            topDealersCustomToDate,
          ) &&
          (topDealersDealerFilter === "all" || q.dealerId === topDealersDealerFilter),
      ),
    [
      quotations,
      topDealersDateFilter,
      topDealersDealerFilter,
      topDealersCustomFromDate,
      topDealersCustomToDate,
    ],
  )

  const filteredOverviewTotalKw = useMemo(
    () =>
      overviewPeriodApprovedQuotations.reduce(
        (sum, q) =>
          sum +
          getQuotationSystemKw({
            ...q,
            products: mergeQuotationProductSources(q),
          }),
        0,
      ),
    [overviewPeriodApprovedQuotations],
  )

  const filteredOverviewTotalRevenue = useMemo(
    () => overviewPeriodApprovedQuotations.reduce((sum, q) => sum + getQuotationDisplayAmount(q), 0),
    [overviewPeriodApprovedQuotations],
  )

  const dealersWithPeriodActivity = useMemo(
    () =>
      dealerStats.filter(
        (stat) => stat.revenue > 0 || stat.totalKw > 0 || stat.quotationCount > 0,
      ),
    [dealerStats],
  )

  const adminMobileNavValue =
    activeTab === "quotations"
      ? `quotations__${operationalTab}`
      : activeTab === "catalog"
        ? `catalog__${catalogSubTab}`
        : activeTab

  const quotationSubTabTriggerClass = (sub: AdminOperationalTab) =>
    cn(
      activeTab === "quotations" &&
        operationalTab !== sub &&
        "!bg-transparent !text-muted-foreground !shadow-none !border-transparent hover:!bg-muted/50 hover:!text-foreground",
    )

  const onAdminMobileNavChange = (value: string) => {
    startTransition(() => {
      if (value.startsWith("quotations__")) {
        const sub = value.replace("quotations__", "") as AdminOperationalTab
        setActiveTab("quotations")
        setOperationalTab(sub)
        return
      }
      if (value.startsWith("catalog__")) {
        const sub = value.replace("catalog__", "") as "products" | "pricing"
        setActiveTab("catalog")
        setCatalogSubTab(sub === "pricing" ? "pricing" : "products")
        return
      }
      // Legacy deep-links
      if (value === "products" || value === "pricing") {
        setActiveTab("catalog")
        setCatalogSubTab(value)
        return
      }
      setActiveTab(value)
      if (value !== "quotations") setOperationalTab("all")
    })
  }

  const onAdminDesktopTabChange = (value: string) => {
    startTransition(() => {
      if (value === "visitors" || value === "account-management") {
        setActiveTab("dealers")
        return
      }
      if (value === "products" || value === "pricing") {
        setActiveTab("catalog")
        setCatalogSubTab(value)
        return
      }
      setActiveTab(value)
      if (value !== "quotations") setOperationalTab("all")
    })
  }

  // Calculate statistics
  const totalQuotations = Math.max(quotationsListTotal ?? quotations.length, quotations.length)
  const overviewListReady = quotations.length > 0
  const approvedQuotations = overviewListReady
    ? quotations.filter((q) => q.status === "approved")
    : []
  const totalRevenueFromList = approvedQuotations.reduce((sum, q) => sum + getQuotationDisplayAmount(q), 0)
  const totalRevenue =
    overviewListReady || overviewStatsFromApi.totalRevenue == null
      ? totalRevenueFromList
      : overviewStatsFromApi.totalRevenue

  const thisMonthBounds = getJourneyDateRangeBounds("this_month", "", "")
  const isInCurrentCalendarMonth = (date: Date) => {
    if (!thisMonthBounds) return false
    const t = date.getTime()
    return t >= thisMonthBounds.start.getTime() && t <= thisMonthBounds.end.getTime()
  }

  const thisMonthAllQuotations = overviewListReady
    ? quotations.filter((q) => {
        const created = new Date(q.createdAt)
        return !Number.isNaN(created.getTime()) && isInCurrentCalendarMonth(created)
      })
    : []
  const thisMonthQuotationCount = thisMonthQuotationsFromStats ?? thisMonthAllQuotations.length
  const thisMonthApprovedQuotations = overviewListReady
    ? approvedQuotations.filter((q) => {
        const approvedDate = getQuotationApprovalDate(q)
        return approvedDate ? isInCurrentCalendarMonth(approvedDate) : false
      })
    : []
  const thisMonthRevenueFromList = thisMonthApprovedQuotations.reduce(
    (sum, q) => sum + getQuotationDisplayAmount(q),
    0,
  )
  const thisMonthRevenue =
    overviewListReady || overviewStatsFromApi.thisMonthRevenue == null
      ? thisMonthRevenueFromList
      : overviewStatsFromApi.thisMonthRevenue
  const thisMonthTotalKwFromList = sumQuotationsSystemKw(thisMonthApprovedQuotations)
  const thisMonthTotalKw =
    overviewListReady || overviewStatsFromApi.thisMonthKw == null
      ? thisMonthTotalKwFromList
      : overviewStatsFromApi.thisMonthKw
  const thisMonthApprovedCustomersFromList = new Set(
    thisMonthApprovedQuotations.map((q) => String(q.customer.mobile || "").trim()).filter(Boolean),
  ).size
  const thisMonthApprovedCustomers =
    overviewListReady || overviewStatsFromApi.thisMonthApprovedCustomers == null
      ? thisMonthApprovedCustomersFromList
      : overviewStatsFromApi.thisMonthApprovedCustomers
  const thisMonthApprovedCountDisplay = overviewListReady
    ? thisMonthApprovedQuotations.length
    : overviewStatsFromApi.thisMonthApproved ?? thisMonthApprovedQuotations.length
  const isOverviewInitialLoading =
    isAdminDataLoading &&
    !overviewListReady &&
    quotationsListTotal == null &&
    thisMonthQuotationsFromStats == null
  const isOverviewDetailsLoading = isAdminDataLoading && !overviewListReady
  const quotationWorkspaceActive = activeTab === "quotations"

  // Filter quotations by all active conditions together.
  const normalizedSearchTerm = searchTerm.trim().toLowerCase()
  const filteredQuotations = (quotationWorkspaceActive ? quotations : []).filter((q) => {
    // Cheap search only (name / mobile / email / ID / nested dealer) — avoid
    // payment/bank/stage/date string builds on every row for every keystroke.
    if (!quotationMatchesQuickSearch(q, searchTerm)) return false

    const matchesDealer = filterDealer === "all" || q.dealerId === filterDealer
    const matchesCity = matchesCityFilter(q, filterCities)
    const normalizedStatus = String(q.status || "pending").toLowerCase()
    const normalizedFileLogin = String(q.fileLoginStatus || "unset").toLowerCase()
    const normalizedPaymentType = String((q as any).paymentType || q.paymentMode || "").toLowerCase()
    const hasBankDetails = Boolean(String(q.bankName || "").trim() || String(q.bankIfsc || "").trim())
    const matchesStatus = filterStatus === "all" || normalizedStatus === filterStatus
    const matchesFileLogin = filterFileLogin === "all" || normalizedFileLogin === filterFileLogin
    const matchesPaymentType =
      filterPaymentType === "all" ||
      (filterPaymentType === "unknown" ? !normalizedPaymentType : normalizedPaymentType === filterPaymentType)
    const matchesBankDetails =
      filterBankDetails === "all" ||
      (filterBankDetails === "with_bank" ? hasBankDetails : !hasBankDetails)
    const matchesDateOverdue = (() => {
      if (filterInstallOverdue === "all") return true
      if (operationalTab === "installation") {
        // Overdue chips apply to open install jobs, not Approved Installation.
        if (operationalProgressTab === "done") return true
        let installerStatus: "pending" | "inprogress" | "partial" | "approved" = "pending"
        if (isInstallationPartialApproved(q as any)) installerStatus = "partial"
        else if (isInstallationUploadComplete(q, installerQueueApprovedIds)) installerStatus = "approved"
        else {
          const backendStatus = getInstallationWorkflowStatus(q as any)
          if (backendStatus === "installer_in_progress" || backendStatus === "in_progress") {
            installerStatus = "inprogress"
          }
        }
        // Fully approved installation jobs are complete — hide when overdue filter is active.
        if (installerStatus === "approved") return false
        const installYmd = resolveAdminInstallationScheduleYmd(q)
        const tone = installationOverdueTone(installYmd, installerStatus)
        return matchesOverdueToneFilter(tone, filterInstallOverdue)
      }
      if (operationalTab === "metering") {
        // WCC Pending is form/data entry — overdue chips do not apply.
        if (
          operationalProgressTab === "wcc" ||
          operationalProgressTab === "meter_install" ||
          operationalProgressTab === "bank_process" ||
          operationalProgressTab === "pending_payment" ||
          isAdminMeteringWccPending(q)
        )
          return true
        const meteringStage = getAdminMeteringStage(q)
        // MCO is complete for overdue tracking — hide when overdue filter is active.
        if (meteringStage === "mco" || !meteringStage) return false
        const referenceYmd = resolveAdminMeteringReferenceYmd(q, meteringStage)
        const tone = meteringOverdueTone(referenceYmd, meteringStage)
        return matchesOverdueToneFilter(tone, filterInstallOverdue)
      }
      // Other tabs ignore the overdue filter.
      return true
    })()
    const matchesOperationalTab = (() => {
      if (operationalTab === "all") return true
      if (operationalTab === "installation") {
        if (!isInstallerVisible(q)) return false
        const progress = getOperationalProgressState(q, operationalTab)
        if (operationalProgressTab === "all") return progress !== null
        if (operationalProgressTab === "pending") return progress === "pending"
        if (operationalProgressTab === "partial") return progress === "partial"
        return progress === "done"
      }
      if (operationalTab === "metering") {
        // Keep all metering-visible rows here so sub-tab counts (WCC / Meter Install)
        // stay correct regardless of which progress chip is selected. activeQuotationList
        // narrows to the active sub-tab.
        return isMeteringVisible(q)
      }
      if (!isConfirmationVisible(q)) return false
      const progress = getOperationalProgressState(q, operationalTab)
      if (operationalProgressTab === "all") return progress !== null
      // DCR Generation + Final process are both subsets of the confirmation queue ("pending").
      if (operationalProgressTab === "pending" || operationalProgressTab === "dcr")
        return progress === "pending"
      return progress === "done"
    })()

    const date = new Date(q.createdAt)
    const currentDate = new Date()
    let matchesMonth = true

    if (filterMonth === "current") {
      matchesMonth = date.getMonth() === currentDate.getMonth() && date.getFullYear() === currentDate.getFullYear()
    } else if (filterMonth === "previous") {
      const prevMonth = currentDate.getMonth() === 0 ? 11 : currentDate.getMonth() - 1
      const prevYear = currentDate.getMonth() === 0 ? currentDate.getFullYear() - 1 : currentDate.getFullYear()
      matchesMonth = date.getMonth() === prevMonth && date.getFullYear() === prevYear
    }

    return (
      matchesDealer &&
      matchesCity &&
      matchesMonth &&
      matchesStatus &&
      matchesFileLogin &&
      matchesPaymentType &&
      matchesBankDetails &&
      matchesDateOverdue &&
      matchesOperationalTab
    )
  })

  const operationalCounts = quotationWorkspaceActive
    ? quotations.reduce(
        (acc, quotation) => {
          if (isInstallerVisible(quotation)) acc.installation += 1
          if (isMeteringVisible(quotation)) acc.metering += 1
          if (isConfirmationVisible(quotation)) acc.confirmation += 1
          return acc
        },
        { installation: 0, metering: 0, confirmation: 0 },
      )
    : { installation: 0, metering: 0, confirmation: 0 }

  const operationalProgressCounts =
    quotationWorkspaceActive && operationalTab !== "all" && operationalTab !== "metering"
      ? quotations.reduce(
          (acc, quotation) => {
            if (operationalTab === "installation" && !isInstallerVisible(quotation)) return acc
            if (operationalTab === "confirmation" && !isConfirmationVisible(quotation)) return acc
            const progress = getOperationalProgressState(quotation, operationalTab)
            if (progress === "pending") acc.pending += 1
            if (progress === "done") acc.done += 1
            return acc
          },
          { pending: 0, done: 0 },
        )
      : { pending: 0, done: 0 }

  const operationalMeteringCounts =
    quotationWorkspaceActive && operationalTab === "metering"
      ? quotations.reduce(
          (acc, quotation) => {
            const stage = getAdminMeteringStage(quotation)
            if (!stage) return acc
            if (stage === "processing") acc.processing += 1
            if (stage === "approved") acc.approved += 1
            if (stage === "mco") acc.mco += 1
            return acc
          },
          { processing: 0, approved: 0, mco: 0 },
        )
      : { processing: 0, approved: 0, mco: 0 }

  /** Installation sub-tab bucket: pending / inprogress / partial / approved. */
  const getInstallerQueueStatusForAdmin = (
    quotation: Quotation,
  ): "pending" | "inprogress" | "partial" | "approved" => {
    const backendStatus = getInstallationWorkflowStatus(quotation as any)
    if (backendStatus === "pending_installer") return "pending"
    if (backendStatus === "installer_in_progress" || backendStatus === "in_progress") {
      return "inprogress"
    }
    if (isInstallationPartialApproved(quotation as any)) return "partial"
    if (isInstallationUploadComplete(quotation, installerQueueApprovedIds)) return "approved"
    return "pending"
  }

  const getApprovedSortTime = (quotation: Quotation): number => {
    const qAny = quotation as any
    const approvedRaw =
      quotation.statusApprovedAt ||
      qAny.status_approved_at ||
      qAny.approvedAt ||
      qAny.approved_at ||
      qAny.approvedDate ||
      qAny.approved_date
    const approvedTime = approvedRaw ? new Date(approvedRaw).getTime() : Number.NaN
    if (!Number.isNaN(approvedTime)) return approvedTime
    return new Date(quotation.createdAt || 0).getTime()
  }

  const sortedQuotations = annotateQuotationsWithCurrent([...filteredQuotations]).sort(
    (a, b) => getApprovedSortTime(b) - getApprovedSortTime(a),
  )

  const quotationsMeteringActionCounts = useMemo(() => {
    if (!quotationWorkspaceActive || operationalTab !== "all") {
      return { send: 0, retrieve: 0 }
    }
    const currentRows = groupQuotationsByCustomerCurrentFirst(sortedQuotations).map(
      (g) => g.current as Quotation,
    )
    let send = 0
    let retrieve = 0
    for (const q of currentRows) {
      if (getAdminQuotationsTabSendToMeteringState(q).visible) send += 1
      if (getAdminQuotationsTabRetrieveState(q, adminMeteringStageOverride[q.id]).visible) retrieve += 1
    }
    return { send, retrieve }
  }, [quotationWorkspaceActive, operationalTab, sortedQuotations, adminMeteringStageOverride])

  // Full unfiltered groups (for History / Restore) — prefer API is_current, else newest.
  const adminCustomerQuotationGroups = useMemo(
    () => groupQuotationsByCustomerCurrentFirst(quotations),
    [quotations],
  )

  const adminOlderCountByMobile = useMemo(() => {
    const map = new Map<string, number>()
    for (const group of adminCustomerQuotationGroups) {
      map.set(group.key, group.history.length)
    }
    return map
  }, [adminCustomerQuotationGroups])

  const getAdminOlderCount = (quotation: Quotation) => {
    const mobile = getCustomerMobileFromQuotation(quotation)
    if (mobile) return adminOlderCountByMobile.get(mobile) || 0
    return adminOlderCountByMobile.get(`__id:${quotation.id}`) || 0
  }

  const openAdminQuotationHistory = (quotation: Quotation) => {
    const mobile = getCustomerMobileFromQuotation(quotation)
    const group =
      adminCustomerQuotationGroups.find((g) => g.key === mobile || g.key === `__id:${quotation.id}`) ||
      groupQuotationsByCustomerCurrentFirst(
        quotations.filter((q) => getCustomerMobileFromQuotation(q) === mobile || q.id === quotation.id),
      )[0]
    if (!group) return
    setQuotationVersionHistoryGroup({
      current: group.current as Quotation,
      history: group.history as Quotation[],
      all: group.all as Quotation[],
    })
    setQuotationVersionHistoryOpen(true)
  }

  const restoreAdminQuotationAsCurrent = async (quotation: Quotation) => {
    const mobile = getCustomerMobileFromQuotation(quotation)
    const name = formatPersonName(quotation.customer?.firstName, quotation.customer?.lastName, quotation.id)
    if (
      !window.confirm(
        `Restore ${quotation.id} as the current quotation for ${name}?\n\nAdmin list will show this version; older ones stay in History.`,
      )
    ) {
      return
    }
    setRestoringQuotationId(quotation.id)
    try {
      try {
        await api.quotations.restoreAsCurrent(quotation.id)
      } catch (apiErr) {
        console.warn("[admin] restoreAsCurrent API unavailable:", apiErr)
      }
      if (mobile) setCurrentQuotationForMobile(mobile, quotation.id)
      setQuotations((prev) =>
        annotateQuotationsWithCurrent(
          prev.map((q) => {
            const sameCustomer = getCustomerMobileFromQuotation(q) === mobile
            if (!sameCustomer) return q
            return {
              ...q,
              isCurrent: q.id === quotation.id,
              is_current: q.id === quotation.id,
            }
          }),
        ),
      )
      setQuotationVersionHistoryOpen(false)
      setQuotationVersionHistoryGroup(null)
      toast({
        title: "Restored as current",
        description: `${quotation.id} is now shown for ${name} in Admin.`,
      })
    } catch (error) {
      toast({
        title: "Restore failed",
        description: apiErrorToUserMessage(error) || "Could not restore quotation",
        variant: "destructive",
      })
    } finally {
      setRestoringQuotationId(null)
    }
  }
  // Only build the buckets needed for the active ops tab — Metering/Installation switches stay light.
  const installationPendingQuotations =
    operationalTab === "installation"
      ? sortedQuotations.filter((q) => {
          const status = getInstallerQueueStatusForAdmin(q)
          return status === "pending" || status === "inprogress"
        })
      : []
  const installationPartialQuotations =
    operationalTab === "installation"
      ? sortedQuotations.filter((q) => getInstallerQueueStatusForAdmin(q) === "partial")
      : []
  const installationApprovedQuotations =
    operationalTab === "installation"
      ? sortedQuotations.filter((q) => getInstallerQueueStatusForAdmin(q) === "approved")
      : []
  const meteringWccPendingQuotations =
    operationalTab === "metering" ? sortedQuotations.filter((q) => isAdminMeteringWccPending(q)) : []
  const meteringProcessingQuotations =
    operationalTab === "metering"
      ? sortedQuotations.filter(
          (q) => getAdminMeteringStage(q) === "processing" && !isAdminMeteringWccPending(q),
        )
      : []
  const meteringApprovedQuotations =
    operationalTab === "metering"
      ? sortedQuotations.filter(
          (q) => getAdminMeteringStage(q) === "approved" && !isAdminMeteringPostDiscomWcc(q),
        )
      : []
  const meteringMeterInstallQuotations =
    operationalTab === "metering" ? sortedQuotations.filter((q) => isAdminMeterInstallationPending(q)) : []
  const meteringMcoQuotations =
    operationalTab === "metering" ? sortedQuotations.filter((q) => getAdminMeteringStage(q) === "mco") : []
  /** Metering → Bank process: loan + cash+loan already in meter pipeline (not Installation Approved-only). */
  const meteringBankProcessQuotations =
    operationalTab === "metering"
      ? sortedQuotations.filter(
          (q) =>
            isMeteringBankPipelineVisible(q) &&
            isMeteringBankProcessEligible(q) &&
            !isAdminBankProcessDone(q),
        )
      : []
  /** Metering → Pending payment: loan + cash+loan after bank process is done. */
  const meteringPendingPaymentQuotations =
    operationalTab === "metering"
      ? sortedQuotations.filter(
          (q) =>
            isMeteringBankPipelineVisible(q) &&
            isMeteringBankProcessEligible(q) &&
            isAdminBankProcessDone(q),
        )
      : []
  const confirmationQueueQuotations =
    operationalTab === "confirmation"
      ? sortedQuotations.filter((q) => getAdminConfirmationStage(q) === "queue")
      : []
  const confirmationFinalQuotations =
    operationalTab === "confirmation"
      ? sortedQuotations.filter((q) => getAdminConfirmationStage(q) === "final")
      : []
  // Final confirmation queue splits into DCR Generation (not yet generated) → Final process (DCR done).
  const confirmationDcrQuotations =
    operationalTab === "confirmation"
      ? confirmationQueueQuotations.filter((q) => !isAdminDcrGenerated(q))
      : []
  const confirmationFinalProcessQuotations =
    operationalTab === "confirmation"
      ? confirmationQueueQuotations.filter((q) => isAdminDcrGenerated(q))
      : []
  const adminMeteringSelectedQuotation = adminMeteringQuotationId
    ? sortedQuotations.find((quotation) => quotation.id === adminMeteringQuotationId) || null
    : null

  const activeQuotationList = useMemo((): Quotation[] => {
    let list: Quotation[]
    if (operationalTab === "installation") {
      if (operationalProgressTab === "pending") list = installationPendingQuotations
      else if (operationalProgressTab === "partial") list = installationPartialQuotations
      else if (operationalProgressTab === "done") list = installationApprovedQuotations
      else list = sortedQuotations
      // Keep every Account → Send to Installer row (including after metering).
      // Do not collapse to "current quotation only" here.
    } else if (operationalTab === "metering") {
      if (operationalProgressTab === "wcc") list = meteringWccPendingQuotations
      else if (operationalProgressTab === "meter_install") list = meteringMeterInstallQuotations
      else if (operationalProgressTab === "done") list = meteringApprovedQuotations
      else if (operationalProgressTab === "mco") list = meteringMcoQuotations
      else if (operationalProgressTab === "bank_process") list = meteringBankProcessQuotations
      else if (operationalProgressTab === "pending_payment") list = meteringPendingPaymentQuotations
      else list = meteringProcessingQuotations // Meter Pending (default; no All tab)
      // Same as personal Metering: one current quotation per customer.
      list = keepCurrentQuotationsOnly(list, quotations)
    } else if (operationalTab === "confirmation") {
      if (operationalProgressTab === "dcr") list = confirmationDcrQuotations
      else if (operationalProgressTab === "pending") list = confirmationFinalProcessQuotations
      else if (operationalProgressTab === "done") list = confirmationFinalQuotations
      else list = sortedQuotations
      list = keepCurrentQuotationsOnly(list, quotations)
    } else {
      // Main Quotations tab: one row per customer (current version only).
      list = groupQuotationsByCustomerCurrentFirst(sortedQuotations).map(
        (g) => g.current as Quotation,
      )
      if (operationalProgressTab === "metering_send") {
        list = list.filter((q) => getAdminQuotationsTabSendToMeteringState(q).visible)
      } else if (operationalProgressTab === "metering_retrieve") {
        list = list.filter(
          (q) =>
            adminMeteringStageOverride[q.id] === "processing" ||
            getAdminQuotationsTabRetrieveState(q, adminMeteringStageOverride[q.id]).visible,
        )
      }
    }

    // Re-apply overdue chips against the active sub-tab list (All / Pending / etc.)
    // so Metering → All never skips colour filters that already ran on sortedQuotations.
    if (
      filterInstallOverdue !== "all" &&
      operationalTab === "metering" &&
      operationalProgressTab !== "wcc" &&
      operationalProgressTab !== "meter_install" &&
      operationalProgressTab !== "bank_process" &&
      operationalProgressTab !== "pending_payment"
    ) {
      list = list.filter((q) => {
        if (isAdminMeteringWccPending(q)) return true
        const meteringStage = getAdminMeteringStage(q)
        if (meteringStage === "mco" || !meteringStage) return false
        const referenceYmd = resolveAdminMeteringReferenceYmd(q, meteringStage)
        return matchesOverdueToneFilter(
          meteringOverdueTone(referenceYmd, meteringStage),
          filterInstallOverdue,
        )
      })
    }
    if (filterInstallOverdue !== "all" && operationalTab === "installation") {
      // Overdue chips apply to open install jobs only — not Approved Installation.
      if (operationalProgressTab !== "done") {
        list = list.filter((q) => {
          const status = getInstallerQueueStatusForAdmin(q)
          if (status === "approved") return false
          const installYmd = resolveAdminInstallationScheduleYmd(q)
          return matchesOverdueToneFilter(
            installationOverdueTone(installYmd, status),
            filterInstallOverdue,
          )
        })
      }
    }
    return list
  }, [
    operationalTab,
    operationalProgressTab,
    filterInstallOverdue,
    sortedQuotations,
    quotations,
    installationPendingQuotations,
    installationPartialQuotations,
    installationApprovedQuotations,
    meteringWccPendingQuotations,
    meteringMeterInstallQuotations,
    meteringProcessingQuotations,
    meteringApprovedQuotations,
    meteringMcoQuotations,
    meteringBankProcessQuotations,
    meteringPendingPaymentQuotations,
    confirmationQueueQuotations,
    confirmationFinalQuotations,
    confirmationDcrQuotations,
    confirmationFinalProcessQuotations,
    adminMeteringStageOverride,
  ])

  const quotationListUsesServerTotal =
    operationalTab === "all" &&
    (operationalProgressTab === "all" ||
      operationalProgressTab === "metering_send" ||
      operationalProgressTab === "metering_retrieve") &&
    normalizedSearchTerm.length === 0 &&
    filterDealer === "all" &&
    filterCities.length === 0 &&
    filterMonth === "all" &&
    filterStatus === "all" &&
    filterFileLogin === "all" &&
    filterPaymentType === "all" &&
    filterBankDetails === "all" &&
    filterInstallOverdue === "all"

  const quotationListResetKey = [
    operationalTab,
    operationalProgressTab,
    searchTerm,
    filterDealer,
    filterCities.join(","),
    filterMonth,
    filterStatus,
    filterFileLogin,
    filterPaymentType,
    filterBankDetails,
    filterInstallOverdue,
    activeQuotationList.length,
    activeQuotationList[0]?.id ?? "",
    activeQuotationList[activeQuotationList.length - 1]?.id ?? "",
    quotationsListTotal,
  ].join("|")

  const {
    visibleItems: visibleQuotationList,
    hasMore: hasMoreQuotationList,
    loadMore: loadMoreQuotationList,
    sentinelRef: quotationListSentinelRef,
    visibleCount: visibleQuotationCount,
    totalCount: activeQuotationListTotal,
  } = useIncrementalList(activeQuotationList, {
    batchSize: QUOTATIONS_LIST_BATCH_SIZE,
    resetKey: quotationListResetKey,
    enabled: activeTab === "quotations",
    totalCount:
      quotationListUsesServerTotal && quotationsListTotal != null
        ? Math.max(quotationsListTotal, activeQuotationList.length)
        : undefined,
  })

  const activeQuotationFilterCount = [
    filterDealer,
    filterMonth,
    filterStatus,
    filterFileLogin,
    filterPaymentType,
    filterBankDetails,
    filterInstallOverdue,
  ].filter((v) => v !== "all").length + (filterCities.length > 0 ? 1 : 0)

  function findDealerById(dealerId?: string) {
    const normalizedId = String(dealerId || "").trim()
    if (!normalizedId) return undefined
    return dealers.find((d) => {
      const dAny = d as unknown as Record<string, unknown>
      const candidateIds = [d.id, dAny._id, dAny.dealerId].map((value) => String(value || "").trim())
      return candidateIds.includes(normalizedId)
    })
  }

  // Get dealer details with fallback to quotation nested dealer object.
  function getDealerName(dealerId: string, quotation?: Quotation) {
    const qAny = quotation as unknown as Record<string, unknown> | undefined
    const nested = qAny?.dealer as Record<string, unknown> | undefined
    const nestedName =
      nested && typeof nested === "object"
        ? formatPersonName(
            String(nested.firstName || ""),
            String(nested.lastName || ""),
            String(nested.username || "").trim() || "Dealer",
          )
        : ""
    if (nestedName) return nestedName

    const dealer = findDealerById(dealerId || quotation?.dealerId)
    return dealer ? formatPersonName(dealer.firstName, dealer.lastName, "Dealer") : "Unknown Dealer"
  }

  function getDealerMobile(dealerId: string, quotation?: Quotation) {
    const qAny = quotation as unknown as Record<string, unknown> | undefined
    const nested = qAny?.dealer as Record<string, unknown> | undefined
    const nestedMobile = nested && typeof nested === "object" ? String(nested.mobile || nested.phone || "").trim() : ""
    if (nestedMobile) return nestedMobile

    const dealer = findDealerById(dealerId || quotation?.dealerId)
    return dealer?.mobile || "—"
  }

  function getQuotationPaymentTypeLabel(quotation: Quotation) {
    // Prefer file-login payment type; approval-time type is now fallback only.
    const raw = String(
      (quotation as any).filePaymentType || (quotation as any).paymentType || quotation.paymentMode || "",
    ).toLowerCase()
    if (raw === "loan") return "Loan"
    if (raw === "cash") return "Cash"
    if (raw === "mix") return "Cash + loan"
    return "—"
  }

  function getQuotationBankDetails(quotation: Quotation) {
    // Prefer file-login banking (latest filing step). Fallback to approval-time banking.
    const bank = String((quotation.fileBankName as string | undefined) || quotation.bankName || "").trim()
    const ifsc = String((quotation.fileBankIfsc as string | undefined) || quotation.bankIfsc || "")
      .trim()
      .toUpperCase()
    if (!bank && !ifsc) return "—"
    if (bank && ifsc) return `${bank} · ${ifsc}`
    return bank || ifsc
  }

  const QUOTATION_EXCEL_BASE_HEADERS = [
    "Quotation ID",
    "Customer Name",
    "Customer Mobile",
    "Customer Email",
    "Dealer Name",
    "Dealer Contact",
    "Amount",
    "Loan Amount",
    "Cash Amount",
    "Status",
    "File Login",
    "Payment Type",
    "Bank Details",
    "Created At",
    "File Login At",
    "Approved At",
  ] as const

  const QUOTATION_EXCEL_INSTALL_HEADERS = [
    "Sent To Installation",
    "Install Date",
    "Installation Team",
    "Installation Status",
  ] as const

  const QUOTATION_EXCEL_METERING_HEADERS = [
    "Metering Stage",
    "Metering Status",
    "Metering Approved At",
    "MCO At",
    "WCC After Discom",
  ] as const

  const QUOTATION_EXCEL_CONFIRMATION_HEADERS = [
    "Final Confirmation Stage",
    "Final Confirmation Status",
    "DCR Generated",
    "File Status",
  ] as const

  const VISITOR_EXCEL_HEADERS = [
    "Visit ID",
    "Quotation ID",
    "Customer Name",
    "Customer Mobile",
    "Visitor",
    "Agent",
    "Status",
    "Visit Date",
    "Visit Time",
    "Location",
    "Notes",
    "Rejection Reason",
    "Created At",
  ] as const

  const quotationExcelHeadersForTab = useMemo(() => {
    const base = [...QUOTATION_EXCEL_BASE_HEADERS]
    if (operationalTab === "metering") {
      return [...base, ...QUOTATION_EXCEL_INSTALL_HEADERS, ...QUOTATION_EXCEL_METERING_HEADERS]
    }
    if (operationalTab === "confirmation") {
      return [
        ...base,
        ...QUOTATION_EXCEL_INSTALL_HEADERS,
        ...QUOTATION_EXCEL_METERING_HEADERS,
        ...QUOTATION_EXCEL_CONFIRMATION_HEADERS,
      ]
    }
    // Installation + Quotations (all)
    return [...base, ...QUOTATION_EXCEL_INSTALL_HEADERS]
  }, [operationalTab])

  const quotationExcelColumns = useMemo(
    () => columnOptionsFromHeaders(quotationExcelHeadersForTab),
    [quotationExcelHeadersForTab],
  )
  const visitorExcelColumns = useMemo(
    () => columnOptionsFromHeaders([...VISITOR_EXCEL_HEADERS]),
    [],
  )

  const quotationExcelStorageKeyForTab = useMemo(() => {
    if (operationalTab === "metering") return "excel-columns:admin-metering"
    if (operationalTab === "confirmation") return "excel-columns:admin-final-confirmation"
    if (operationalTab === "installation") return "excel-columns:admin-installation"
    return "excel-columns:admin-quotations"
  }, [operationalTab])

  const openQuotationExcelColumnPicker = () => {
    if (activeQuotationList.length === 0) {
      toast({
        title: "No data to download",
        description: "Apply different filters or search to include quotations.",
      })
      return
    }
    setQuotationExcelRememberedIds(readRememberedExcelColumns(quotationExcelStorageKeyForTab))
    setQuotationExcelColumnsOpen(true)
  }

  const downloadFilteredQuotationsCsv = (selectedColumnIds: string[]) => {
    const exportList = activeQuotationList
    if (exportList.length === 0) {
      toast({
        title: "No data to download",
        description: "Apply different filters or search to include quotations.",
      })
      return
    }

    const headers = [...quotationExcelHeadersForTab]
    const rows = exportList.map((quotation) => {
      const customerName = formatPersonName(quotation.customer.firstName, quotation.customer.lastName, "Unknown")
      const amt = QuotationApprovedAmountLines(quotation)
      const qAny = quotation as any
      const sentToInstallationAt =
        qAny.installationReleasedAt || qAny.installation_released_at || ""
      const installDate =
        toYmdFromStored(qAny.installationScheduledAt as string | undefined) ||
        (sentToInstallationAt && !Number.isNaN(new Date(String(sentToInstallationAt)).getTime())
          ? addCalendarDaysFromDateString(String(sentToInstallationAt), 7)
          : "")
      const teamId = getInstallationTeamIdForQuotation(quotation.id, qAny)
      const teamName =
        installationTeams.find((t) => t.id === teamId)?.name || (teamId ? teamId : "Unassigned")
      const installStatus = installerQueueStatusDisplayLabel(getInstallerQueueStatusForAdmin(quotation))
      const journey = getJourneyStageProgress(quotation)
      const meteringStage = getAdminMeteringStage(quotation)
      const meteringStageLabel =
        meteringStage === "processing"
          ? "Meter Pending"
          : meteringStage === "approved"
            ? "Meter in Discom"
            : meteringStage === "meter_install"
              ? "Meter Installation Pending"
              : meteringStage === "mco"
                ? "Final Step (MCO)"
                : isAdminMeteringWccPending(quotation)
                  ? "WCC Pending"
                  : "—"
      const confirmationStage = getAdminConfirmationStage(quotation)
      const confirmationStageLabel =
        confirmationStage === "queue"
          ? isAdminDcrGenerated(quotation)
            ? "Final process"
            : "DCR Generation"
          : confirmationStage === "final"
            ? "Final Approved"
            : "—"
      const cellByHeader: Record<string, string | number> = {
        "Quotation ID": quotation.id,
        "Customer Name": customerName,
        "Customer Mobile": quotation.customer.mobile || "",
        "Customer Email": quotation.customer.email || "",
        "Dealer Name": getDealerName(quotation.dealerId),
        "Dealer Contact": getDealerMobile(quotation.dealerId),
        Amount: amt.total,
        "Loan Amount": amt.loan ?? "",
        "Cash Amount": amt.cash ?? "",
        Status: quotation.status || "pending",
        "File Login": fileLoginRowSummary(quotation),
        "Payment Type": getQuotationPaymentTypeLabel(quotation),
        "Bank Details": getQuotationBankDetails(quotation),
        "Created At": quotation.createdAt ? new Date(quotation.createdAt).toLocaleString() : "",
        "File Login At": quotation.fileLoginAt ? new Date(quotation.fileLoginAt).toLocaleString() : "",
        "Approved At": quotation.statusApprovedAt
          ? new Date(quotation.statusApprovedAt).toLocaleString()
          : "",
        "Sent To Installation": sentToInstallationAt
          ? new Date(String(sentToInstallationAt)).toLocaleDateString("en-IN")
          : "",
        "Install Date": installDate || "",
        "Installation Team": teamName,
        "Installation Status": installStatus,
        "Metering Stage": meteringStageLabel,
        "Metering Status": formatJourneyStageStatusLabel(journey.metering, "metering"),
        "Metering Approved At": quotation.meteringApprovedAt
          ? new Date(quotation.meteringApprovedAt).toLocaleString()
          : qAny.metering_approved_at
            ? new Date(String(qAny.metering_approved_at)).toLocaleString()
            : "",
        "MCO At": quotation.mcoAt
          ? new Date(quotation.mcoAt).toLocaleString()
          : qAny.mco_at
            ? new Date(String(qAny.mco_at)).toLocaleString()
            : "",
        "WCC After Discom": isAdminMeteringWccPending(quotation)
          ? "Yes"
          : isAdminMeteringPostDiscomWcc(quotation)
            ? "Done / flagged"
            : "No",
        "Final Confirmation Stage": confirmationStageLabel,
        "Final Confirmation Status": formatJourneyStageStatusLabel(
          journey.finalConfirmation,
          "finalConfirmation",
        ),
        "DCR Generated": isAdminDcrGenerated(quotation) ? "Yes" : "No",
        "File Status": getJourneyHoldInfo(quotation).stageLabel,
      }
      return headers.map((header) => cellByHeader[header] ?? "")
    })

    const filtered = filterRowsByColumnIds(headers, rows, selectedColumnIds)
    if (!filtered.headers.length) {
      toast({
        title: "Select at least one column",
        description: "Choose the fields you want in the Excel download.",
      })
      return
    }

    rememberExcelColumns(quotationExcelStorageKeyForTab, filtered.headers)
    const dateStamp = new Date().toISOString().slice(0, 10)
    const filePrefix =
      operationalTab === "metering"
        ? "metering"
        : operationalTab === "confirmation"
          ? "final-confirmation"
          : operationalTab === "installation"
            ? "installation"
            : "quotations"
    downloadCsvFile({
      filename: `${filePrefix}-filtered-${dateStamp}.csv`,
      headers: filtered.headers,
      rows: filtered.rows,
      withBom: true,
    })

    toast({
      title: "Download started",
      description: `Exported ${exportList.length} rows (${filtered.headers.length} columns).`,
    })
  }

  const openVisitorExcelColumnPicker = () => {
    if (filteredVisitorReportRows.length === 0) {
      toast({
        title: "No data to download",
        description: "Apply different filters or search to include visitor reports.",
      })
      return
    }
    setVisitorExcelRememberedIds(readRememberedExcelColumns(visitorExcelColumnsStorageKey))
    setVisitorExcelColumnsOpen(true)
  }

  const downloadFilteredVisitorReportsCsv = (selectedColumnIds: string[]) => {
    const exportList = filteredVisitorReportRows
    if (exportList.length === 0) {
      toast({
        title: "No data to download",
        description: "Apply different filters or search to include visitor reports.",
      })
      return
    }

    const headers = [...VISITOR_EXCEL_HEADERS]
    const rows = exportList.map((row) => [
      row.id,
      row.quotationId || "",
      row.customerName || "",
      row.customerMobile || "",
      row.visitorNames || "",
      row.dealerName || "",
      getVisitStatusLabel(row.status),
      row.date || "",
      row.time || "",
      row.location || "",
      row.notes || "",
      row.rejectionReason || "",
      row.createdAt ? new Date(row.createdAt).toLocaleString() : "",
    ])

    const filtered = filterRowsByColumnIds(headers, rows, selectedColumnIds)
    if (!filtered.headers.length) {
      toast({
        title: "Select at least one column",
        description: "Choose the fields you want in the Excel download.",
      })
      return
    }

    rememberExcelColumns(visitorExcelColumnsStorageKey, filtered.headers)
    const dateStamp = new Date().toISOString().slice(0, 10)
    downloadCsvFile({
      filename: `visitor-reports-filtered-${dateStamp}.csv`,
      headers: filtered.headers,
      rows: filtered.rows,
      withBom: true,
    })

    toast({
      title: "Download started",
      description: `Exported ${exportList.length} filtered visitor report${exportList.length === 1 ? "" : "s"} (${filtered.headers.length} columns).`,
    })
  }

  const isWithinCallingRange = (actionAt?: string) => {
    if (callingRange === "all") return true
    if (callingRange === "custom") {
      const b = getCustomBoundsFromYmd(callingCustomFromDate, callingCustomToDate)
      if (!b) return false
      return isCallingActionInBounds(actionAt, b)
    }
    return isCallingActionInBounds(actionAt, getPresetBounds(callingRange))
  }

  const filteredCallingActions = latestCallingActionPerContact(
    callingActions.filter((item) => {
      if (String(item.action || "").toLowerCase().trim() === "start") return false
      const matchesEmployee =
        callingActionDealerFilter === "all" ||
        item.dealerId === callingActionDealerFilter ||
        item.dealerName === callingActionDealerFilter
      return matchesEmployee && isWithinCallingRange(item.actionAt)
    }),
  )

  const connectionSummary = buildCallingConnectionSummary(filteredCallingActions)
  const connectedOutcomeSummary = buildCallingActionSummary(
    filteredCallingActions.filter((item) => classifyCallingConnection(item) === "connected"),
  )
  const isCallingReportsInitialLoading = isCallingActionsLoading && callingActions.length === 0
  const displayCallingActions =
    callingConnectionFilter === "all"
      ? filteredCallingActions
      : filteredCallingActions.filter((item) => classifyCallingConnection(item) === callingConnectionFilter)

  const visitorReportDateBounds = useMemo(() => {
    if (visitorReportRange === "all") return null
    if (visitorReportRange === "custom") {
      return getCustomBoundsFromYmd(visitorReportCustomFromDate, visitorReportCustomToDate)
    }
    return getPresetBounds(visitorReportRange)
  }, [visitorReportCustomFromDate, visitorReportCustomToDate, visitorReportRange])

  const filteredVisitorReportRows = useMemo(() => {
    const startDate = visitorReportDateBounds ? formatYmdLocal(visitorReportDateBounds.start) : undefined
    const endDate = visitorReportDateBounds ? formatYmdLocal(visitorReportDateBounds.end) : undefined
    const useClientFilters =
      visitorReportLoadSource === "quotations" ||
      visitorReportLoadSource === "local" ||
      visitorReportLoadSource === null
    return visitorReportRows.filter((row) => {
      if (!useClientFilters) return true
      if (!visitMatchesVisitorFilter(row, visitorReportVisitorFilter)) return false
      if (!visitMatchesStatusFilter(row, visitorReportStatusFilter)) return false
      if (!visitMatchesSearch(row, visitorReportSearchDebounced)) return false
      if (!visitMatchesDateRange(row, startDate, endDate)) return false
      return true
    })
  }, [
    visitorReportDateBounds,
    visitorReportLoadSource,
    visitorReportRows,
    visitorReportSearchDebounced,
    visitorReportStatusFilter,
    visitorReportVisitorFilter,
  ])

  const visitorReportSummary = useMemo(
    () => buildVisitStatusSummary(filteredVisitorReportRows),
    [filteredVisitorReportRows],
  )

  const visitorReportListResetKey = useMemo(
    () =>
      [
        visitorReportVisitorFilter,
        visitorReportStatusFilter,
        visitorReportRange,
        visitorReportCustomFromDate,
        visitorReportCustomToDate,
        visitorReportSearchDebounced,
        visitorReportRows.length,
      ].join("|"),
    [
      visitorReportCustomFromDate,
      visitorReportCustomToDate,
      visitorReportRange,
      visitorReportRows.length,
      visitorReportSearchDebounced,
      visitorReportStatusFilter,
      visitorReportVisitorFilter,
    ],
  )

  const {
    visibleItems: visibleVisitorReportRows,
    visibleCount: visibleVisitorReportCount,
    totalCount: filteredVisitorReportTotal,
    hasMore: visitorReportHasMore,
    loadMore: loadMoreVisitorReports,
    sentinelRef: visitorReportSentinelRef,
  } = useIncrementalList(filteredVisitorReportRows, {
    batchSize: 15,
    resetKey: visitorReportListResetKey,
    enabled: activeTab === "visitor-reports",
  })

  if (!isAuthenticated || !isQuotationAdminAccess({ role, username: dealer?.username })) return null

  // Update quotation status
  const updateQuotationStatus = async (
    quotationId: string,
    status: QuotationStatus,
    approval?: {
      paymentType: ApprovalPaymentType
      bankName?: string
      bankIfsc?: string
      subsidyChequeDetails?: string
      statusApprovedAt?: string
      loanAmount?: number
      cashAmount?: number
    },
  ) => {
    try {
      if (useApi) {
        if (status === "approved" && approval) {
          await api.admin.quotations.updateStatus(quotationId, status, approval)
          if (approval.loanAmount != null || approval.cashAmount != null || approval.paymentType) {
            approvalLoanCashOverlayRef.current[quotationId] = {
              paymentType: approval.paymentType,
              ...(approval.loanAmount != null && approval.loanAmount > 0
                ? { loanAmount: approval.loanAmount }
                : {}),
              ...(approval.cashAmount != null && approval.cashAmount > 0
                ? { cashAmount: approval.cashAmount }
                : {}),
            }
            persistApprovalLoanCashOverlay()
          }
        } else {
          await api.admin.quotations.updateStatus(quotationId, status)
        }
        await loadData()
      } else {
        // Fallback to localStorage
        const at = approval?.statusApprovedAt || new Date().toISOString()
        const updated = quotations.map((q) => {
          if (q.id !== quotationId) return q
          const nextHistory: StatusHistoryEntry[] = [
            ...(q.statusHistory || []),
            { status, at },
          ]
          return {
            ...q,
            status,
            statusHistory: nextHistory,
            ...(status === "approved" ? { statusApprovedAt: at } : {}),
            ...(approval
              ? {
                  paymentMode: approval.paymentType,
                  paymentType: approval.paymentType,
                  bankName: approval.bankName,
                  bankIfsc: approval.bankIfsc,
                  ...(approval.loanAmount != null && approval.loanAmount > 0
                    ? { loanAmount: approval.loanAmount }
                    : { loanAmount: undefined }),
                  ...(approval.cashAmount != null && approval.cashAmount > 0
                    ? { cashAmount: approval.cashAmount }
                    : { cashAmount: undefined }),
                  ...(approval.subsidyChequeDetails?.trim()
                    ? { subsidyChequeDetails: approval.subsidyChequeDetails.trim() }
                    : {}),
                }
              : {}),
          }
        })
        setQuotations(updated)
        localStorage.setItem("quotations", JSON.stringify(updated))
      }
      
      // Note: Account Management has separate login, so we don't redirect automatically
      // Approved quotations will be visible when account management users log in
    } catch (error) {
      console.error("Error updating quotation status:", error)
      alert(error instanceof ApiError ? error.message : "Failed to update quotation status")
    }
  }

  const handleQuotationStatusChange = (quotationId: string, status: QuotationStatus) => {
    if (status === "approved") {
      const q = quotations.find((x) => x.id === quotationId)
      const paymentTypeRaw = String(
        q?.filePaymentType || (q as any)?.paymentType || q?.paymentMode || "",
      ).toLowerCase()
      const paymentType =
        paymentTypeRaw === "loan" || paymentTypeRaw === "cash" || paymentTypeRaw === "mix"
          ? (paymentTypeRaw as ApprovalPaymentType)
          : undefined

      if (!paymentType) {
        toast({
          title: "File login payment type required",
          description: "Set payment type in File Login first, then approve the quotation.",
          variant: "destructive",
        })
        return
      }
      setApprovingQuotationId(quotationId)
      setApprovalPaymentType(paymentType)
      setApprovalBankName(q?.fileBankName || q?.bankName || "")
      setApprovalBankIfsc(q?.fileBankIfsc || q?.bankIfsc || "")
      setApprovalSubsidyCheque(q?.fileSubsidyChequeDetails || q?.subsidyChequeDetails || "")
      const { loan, cash } = readQuotationLoanCashAmounts(q || {})
      const quotationTotal = q ? getQuotationSubtotalValue(q) : 0
      if (paymentType === "loan") {
        setApprovalLoanAmount(loan != null ? String(loan) : quotationTotal > 0 ? String(quotationTotal) : "")
        setApprovalCashAmount("")
      } else if (paymentType === "mix") {
        setApprovalLoanAmount(loan != null ? String(loan) : "")
        setApprovalCashAmount(cash != null ? String(cash) : "")
      } else {
        setApprovalLoanAmount("")
        setApprovalCashAmount("")
      }
      setApprovalAtInput(toDateTimeLocalValue(q?.statusApprovedAt || new Date().toISOString()))
      setApprovalDialogOpen(true)
      return
    }
    void updateQuotationStatus(quotationId, status)
  }

  function getOperationalStage(quotation: Quotation): AdminOperationalStage | "" {
    return getOperationalStageForQuotation(quotation)
  }

  function isInstallerVisible(quotation: Quotation) {
    return shouldShowInAdminInstallationTab(quotation as any, readInstallerReleaseMap())
  }

  /**
   * Metering → WCC Pending:
   * 1) Entry: Installation → Approved, not yet in metering pipeline — until WCC saved → Meter Installation Pending.
   * 2) After Meter in Discom: server flag `meteringWccAfterDiscom`, then → Meter Installation Pending.
   * Send to Metering (`pending_metering`) with no Discom action → Meter Pending only.
   */
  function isAdminMeteringPostDiscomWcc(quotation: Quotation): boolean {
    return isMeteringWccAfterDiscomFlag(quotation)
  }

  function applyMeteringWccAfterDiscomLocal(quotationId: string, value: boolean) {
    setQuotations((prev) =>
      prev.map((q) => (q.id === quotationId ? withMeteringWccAfterDiscomFlag(q, value) : q)),
    )
  }

  function isAdminMeteringWccPending(quotation: Quotation): boolean {
    const stage = getAdminMeteringStage(quotation)

    // Post Meter in Discom → WCC (before Meter Installation Pending)
    if (isAdminMeteringPostDiscomWcc(quotation)) {
      if (!isInstallationUploadComplete(quotation, installerQueueApprovedIds)) return false
      if (stage === "meter_install" || stage === "mco") return false
      return true
    }

    // Send to Metering with no Discom/WCC action yet → Meter Pending only (not WCC)
    if (stage === "processing") return false

    // Entry: Installation approved, not yet sent into metering pipeline
    if (isInstallationPartialApproved(quotation as any)) return false
    if (!shouldShowInAdminInstallationTab(quotation as any, readInstallerReleaseMap())) return false
    if (!isInstallationUploadComplete(quotation, installerQueueApprovedIds)) return false
    if (hasAdminMeteringWccPack(quotation)) return false
    return true
  }

  /** Meter Installation Pending: after WCC Pending (post-Discom path). */
  function isAdminMeterInstallationPending(quotation: Quotation): boolean {
    return getAdminMeteringStage(quotation) === "meter_install"
  }

  function isMeteringVisible(quotation: Quotation) {
    return getAdminMeteringStage(quotation) !== null || isAdminMeteringWccPending(quotation)
  }

  /**
   * Bank Process / Pending Payment: only files already in the meter pipeline.
   * Do NOT include Installation → Approved rows waiting on WCC entry
   * (those are WCC Pending on the meter track, not bank work yet).
   */
  function isMeteringBankPipelineVisible(quotation: Quotation) {
    return getAdminMeteringStage(quotation) !== null || isAdminMeteringPostDiscomWcc(quotation)
  }

  function isConfirmationVisible(quotation: Quotation) {
    return getAdminConfirmationStage(quotation) !== null
  }

  function getOperationalProgressState(
    quotation: Quotation,
    tab: AdminOperationalTab,
  ): "pending" | "partial" | "done" | "mco" | "wcc" | "meter_install" | null {
    if (tab === "installation") {
      if (!shouldShowInAdminInstallationTab(quotation as any, readInstallerReleaseMap())) return null
      return getInstallationAdminTabProgress(
        quotation as any,
        isInstallationUploadComplete(quotation, installerQueueApprovedIds),
      )
    }
    if (tab === "metering") {
      if (isAdminMeteringWccPending(quotation)) return "wcc"
      const mStage = getAdminMeteringStage(quotation)
      if (mStage === "processing") return "pending"
      if (mStage === "approved") return "done"
      if (mStage === "meter_install") return "meter_install"
      if (mStage === "mco") return "mco"
      return null
    }
    if (tab === "confirmation") {
      const stage = getAdminConfirmationStage(quotation)
      if (stage === "queue") return "pending"
      if (stage === "final") return "done"
      return null
    }
    return null
  }

  function getAdminConfirmationStage(quotation: Quotation): "queue" | "final" | null {
    if (String(quotation.status || "").toLowerCase() !== "approved") return null
    const backendStatus = String((quotation as any).installationStatus || (quotation as any).installation_status || "").toLowerCase()
    if (backendStatus === "installer_approved" || backendStatus === "pending_baldev" || backendStatus === "installer_in_progress") {
      return "queue"
    }
    if (backendStatus === "baldev_approved" || backendStatus === "completed") {
      return "final"
    }
    return null
  }

  /** DCR generated (from backend flag or local persisted flag). */
  function isAdminDcrGenerated(quotation: Quotation): boolean {
    const r = quotation as unknown as Record<string, unknown>
    return Boolean(r.dcrGenerated || r.dcr_generated || adminDcrGeneratedIds[quotation.id])
  }

  function markAdminDcrGenerated(quotationId: string) {
    setAdminDcrGeneratedIds((prev) => {
      const next = { ...prev, [quotationId]: true }
      try {
        localStorage.setItem(
          "adminDcrGenerated",
          JSON.stringify(Object.keys(next).filter((id) => next[id])),
        )
      } catch {
        // ignore persistence failure
      }
      return next
    })
  }

  /** Bank process completed (backend flag or local persisted). */
  function isAdminBankProcessDone(quotation: Quotation): boolean {
    const r = quotation as unknown as Record<string, unknown>
    return Boolean(
      r.bankProcessDone ||
        r.bank_process_done ||
        r.pendingPayment ||
        r.pending_payment ||
        adminBankProcessDoneIds[quotation.id],
    )
  }

  function markAdminBankProcessDone(quotationId: string) {
    setAdminBankProcessDoneIds((prev) => {
      const next = { ...prev, [quotationId]: true }
      try {
        localStorage.setItem(
          "adminBankProcessDone",
          JSON.stringify(Object.keys(next).filter((id) => next[id])),
        )
      } catch {
        // ignore persistence failure
      }
      return next
    })
  }

  const seedAdminBankProcessDraft = (quotation: Quotation) => {
    const q = quotation as unknown as Record<string, unknown>
    return {
      assignedPersonName: String(
        q.bankAssignedPersonName ||
          q.bank_assigned_person_name ||
          q.authorizedRepresentative ||
          q.authorized_representative ||
          q.assignedPersonName ||
          q.assigned_person_name ||
          "",
      ),
      remarks: String(q.bankRemarks || q.bank_remarks || q.remarks || ""),
      bankLocation: String(q.bankLocation || q.bank_location || ""),
    }
  }

  const getAdminBankProcessDraft = (quotation: Quotation) =>
    adminBankProcessDraftByQuotation[quotation.id] || seedAdminBankProcessDraft(quotation)

  const patchAdminBankProcessDraft = (
    quotationId: string,
    patch: Partial<{ assignedPersonName: string; remarks: string; bankLocation: string }>,
  ) => {
    setAdminBankProcessDraftByQuotation((prev) => {
      const quotation = quotations.find((q) => q.id === quotationId)
      const base =
        prev[quotationId] ||
        (quotation
          ? seedAdminBankProcessDraft(quotation)
          : { assignedPersonName: "", remarks: "", bankLocation: "" })
      return { ...prev, [quotationId]: { ...base, ...patch } }
    })
  }

  const getAdminBankDocuments = (quotationId: string) =>
    adminBankDocumentsByQuotation[quotationId] || []

  const addAdminBankDocuments = (quotationId: string, files: FileList | File[]) => {
    const list = Array.from(files || []).filter(Boolean)
    if (list.length === 0) return
    setAdminBankDocumentsByQuotation((prev) => {
      const existing = prev[quotationId] || []
      const nextItems = list.map((file) => ({
        file,
        url: URL.createObjectURL(file),
        name: file.name,
      }))
      return { ...prev, [quotationId]: [...existing, ...nextItems] }
    })
  }

  const removeAdminBankDocument = (quotationId: string, index: number) => {
    setAdminBankDocumentsByQuotation((prev) => {
      const existing = [...(prev[quotationId] || [])]
      const [removed] = existing.splice(index, 1)
      if (removed?.url?.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(removed.url)
        } catch {
          // ignore
        }
      }
      return { ...prev, [quotationId]: existing }
    })
  }

  const adminBankProcessSelectedQuotation = adminBankProcessModalQuotationId
    ? sortedQuotations.find((q) => q.id === adminBankProcessModalQuotationId) || null
    : null

  const openAdminBankProcessModal = (quotation: Quotation) => {
    setAdminBankProcessModalQuotationId(quotation.id)
    setAdminBankProcessDraftByQuotation((prev) => ({
      ...prev,
      [quotation.id]: prev[quotation.id] || seedAdminBankProcessDraft(quotation),
    }))
  }

  const saveAdminBankProcessDetails = async (quotation: Quotation, moveToPendingPayment: boolean) => {
    const draft = getAdminBankProcessDraft(quotation)
    setAdminBankProcessSavingId(quotation.id)
    try {
      const docs = getAdminBankDocuments(quotation.id)
      setQuotations((prev) =>
        prev.map((q) =>
          q.id === quotation.id
            ? ({
                ...q,
                bankAssignedPersonName: draft.assignedPersonName.trim(),
                bankRemarks: draft.remarks.trim(),
                bankLocation: draft.bankLocation.trim(),
                bankDocumentNames: docs.map((d) => d.name),
                assignedPersonName: draft.assignedPersonName.trim() || (q as any).assignedPersonName,
                remarks: draft.remarks.trim() || (q as any).remarks,
              } as Quotation)
            : q,
        ),
      )
      if (moveToPendingPayment) {
        markAdminBankProcessDone(quotation.id)
      }
      toast({
        title: moveToPendingPayment ? "Saved & moved to Pending payment" : "Bank details saved",
        description: `${quotation.id} updated for bank process.`,
      })
      setAdminBankProcessModalQuotationId(null)
    } finally {
      setAdminBankProcessSavingId(null)
    }
  }

  function patchQuotationMeteringStageLocal(
    quotation: Quotation,
    stage: "processing" | "approved" | "meter_install" | "mco",
  ): Quotation {
    const now = new Date().toISOString()
    const base = { ...quotation } as Quotation & Record<string, unknown>
    if (stage === "mco") {
      return {
        ...base,
        installationStatus: "mco",
        installation_status: "mco",
        meteringStatus: "mco",
        metering_status: "mco",
        mcoAt: now,
        mco_at: now,
        meteringApprovedAt: (base.meteringApprovedAt as string) || (base.metering_approved_at as string) || now,
        metering_approved_at: (base.metering_approved_at as string) || (base.meteringApprovedAt as string) || now,
      } as Quotation
    }
    if (stage === "meter_install") {
      return {
        ...base,
        installationStatus: "meter_installation_pending",
        installation_status: "meter_installation_pending",
        meteringStatus: "meter_installation_pending",
        metering_status: "meter_installation_pending",
        meteringApprovedAt: (base.meteringApprovedAt as string) || (base.metering_approved_at as string) || now,
        metering_approved_at: (base.metering_approved_at as string) || (base.meteringApprovedAt as string) || now,
      } as Quotation
    }
    if (stage === "approved") {
      return {
        ...base,
        installationStatus: "metering_approved",
        installation_status: "metering_approved",
        meteringStatus: "metering_approved",
        metering_status: "metering_approved",
        meteringApprovedAt: now,
        metering_approved_at: now,
      } as Quotation
    }
    return {
      ...base,
      installationStatus: "pending_metering",
      installation_status: "pending_metering",
      meteringStatus: "pending_metering",
      metering_status: "pending_metering",
    } as Quotation
  }

  function patchQuotationRetrieveFromInstallationLocal(quotation: Quotation): Quotation {
    return {
      ...quotation,
      installationReadyForInstaller: false,
      installation_ready_for_installer: false,
      installationReleasedAt: undefined,
      installation_released_at: undefined,
      installationStatus: undefined,
      installation_status: undefined,
    } as Quotation
  }

  function patchQuotationRetrieveFromMeteringLocal(quotation: Quotation): Quotation {
    const base = { ...quotation } as Quotation & Record<string, unknown>
    return {
      ...base,
      installationStatus: "installer_approved",
      installation_status: "installer_approved",
      meteringStatus: "",
      metering_status: "",
      meteringStage: "",
      metering_stage: "",
      mcoStatus: "",
      mco_status: "",
    } as Quotation
  }

  function getAdminMeteringStage(quotation: Quotation): "processing" | "approved" | "meter_install" | "mco" | null {
    const override = adminMeteringStageOverride[quotation.id]
    if (override) return override
    return getMeteringWorkflowStage(quotation as unknown as Record<string, unknown>)
  }

  const applyAdminMeteringStageLocal = (
    quotationId: string,
    stage: "processing" | "approved" | "meter_install" | "mco",
  ) => {
    setAdminMeteringStageOverride((prev) => ({ ...prev, [quotationId]: stage }))
    setQuotations((prev) =>
      prev.map((q) => (q.id === quotationId ? patchQuotationMeteringStageLocal(q, stage) : q)),
    )
  }

  const ensureAdminMeteringApproved = async (quotation: Quotation) => {
    const q = quotation as unknown as Record<string, unknown>
    if (isMeteringApprovedForTransition(q)) return

    const installRaw = getInstallationWorkflowStatus(q)
    if (installRaw === "installer_approved") {
      try {
        await api.admin.quotations.updateOperationalStatus(quotation.id, "pending_metering")
      } catch {
        // continue with metering actions
      }
    }

    try {
      await api.metering.updateStatus(quotation.id, "start")
    } catch {
      // start may be optional when already in progress
    }

    try {
      await api.metering.updateStatus(quotation.id, "approve")
    } catch (error) {
      if (error instanceof ApiError && (error.code === "WF_003" || error.code === "HTTP_409")) {
        try {
          await api.metering.forceSetStatus(quotation.id, "metering_approved")
        } catch {
          await api.admin.quotations.updateOperationalStatus(quotation.id, "metering_approved")
        }
      } else {
        throw error
      }
    }
  }

  function hasRequiredAdminMeteringDetails(quotation: Quotation) {
    const q: any = quotation
    const draft =
      adminMeteringQuotationId === quotation.id
        ? adminMeteringDraft
        : {
            discomName: "",
            meterType: "" as AdminMeteringModalDraft["meterType"],
            meterNo: "",
            solarMeterNo: "",
            netMeterNo: "",
          }
    const discom = String(draft.discomName || q.discomName || q.discom_name || "").trim()
    const meterType = (draft.meterType || q.meterType || q.meter_type || "") as AdminMeteringModalDraft["meterType"]
    const meterNo =
      meterType === "both"
        ? String(draft.solarMeterNo || q.solarMeterNo || q.solar_meter_no || "").trim().length > 0 &&
          String(draft.netMeterNo || q.netMeterNo || q.net_meter_no || "").trim().length > 0
        : String(draft.meterNo || q.meterNo || q.meter_no || "").trim().length > 0
    const meterDoc =
      !!adminMeteringDocByQuotation[quotation.id] ||
      String(q.meterDocumentUrl || q.meter_document_url || q.meterDocumentPublicUrl || q.meter_document_public_url || "").trim()
        .length > 0 ||
      String(q.meterDocumentName || q.meter_document_name || "").trim().length > 0
    return discom.length > 0 && !!meterType && meterNo && meterDoc
  }

  function hasRequiredAdminMcoDocuments(quotation: Quotation) {
    const q: any = quotation
    return (
      (!!adminWorkCompleteReportByQuotation[quotation.id] ||
        !!q.workCompleteReportImageUrl ||
        !!q.work_complete_report_image_url) &&
      (!!adminMeterInstalledPhotoByQuotation[quotation.id] ||
        !!q.meterInstalledPhotoUrl ||
        !!q.meter_installed_photo_url) &&
      (!!adminCompleteDcrReportByQuotation[quotation.id] ||
        !!q.completeDcrReportImageUrl ||
        !!q.complete_dcr_report_image_url)
    )
  }

  const openAdminMeteringDetails = (
    quotation: Quotation,
    options?: { advanceToDiscomAfterSave?: boolean },
  ) => {
    const q: any = quotation
    const mipDraft = getAdminMeterInstallDraft(quotation)
    setAdminMeteringAdvanceToDiscomAfterSave(Boolean(options?.advanceToDiscomAfterSave))
    setAdminMeteringQuotationId(quotation.id)
    setAdminMeteringDraft({
      discomName: q.discomName || q.discom_name || "",
      meterType: (q.meterType || q.meter_type || "") as AdminMeteringModalDraft["meterType"],
      meterNo: q.meterNo || q.meter_no || "",
      solarMeterNo: q.solarMeterNo || q.solar_meter_no || "",
      netMeterNo: q.netMeterNo || q.net_meter_no || "",
      remarks: q.remarks || mipDraft.remarks || "",
      authorizedRepresentative:
        q.authorizedRepresentative ||
        q.authorized_representative ||
        mipDraft.assignedPersonName ||
        "",
      discomLocation: q.discomLocation || q.discom_location || "",
    })
    setAdminMeteringModalOpen(true)
  }

  const saveAdminMeteringDetails = async (options?: { moveToDiscom?: boolean }) => {
    if (!adminMeteringQuotationId) return
    const quotationBeforeSave = quotations.find((q) => q.id === adminMeteringQuotationId) || null
    const shouldMoveToDiscom =
      Boolean(options?.moveToDiscom) || adminMeteringAdvanceToDiscomAfterSave
    try {
      setAdminMeteringSaving(true)
      const discomName = adminMeteringDraft.discomName.trim()
      const remarks = adminMeteringDraft.remarks.trim()
      const authorizedRepresentative = adminMeteringDraft.authorizedRepresentative.trim()
      const meterType = adminMeteringDraft.meterType || undefined
      const meterNo = adminMeteringDraft.meterNo.trim()
      const solarMeterNo = adminMeteringDraft.solarMeterNo.trim()
      const netMeterNo = adminMeteringDraft.netMeterNo.trim()
      const localDoc = adminMeteringDocByQuotation[adminMeteringQuotationId] || null
      const saveResp = await api.metering.saveDetails(
        adminMeteringQuotationId,
        {
          discomName,
          meterType,
          meterNo,
          solarMeterNo,
          netMeterNo,
          remarks,
          authorizedRepresentative,
          discomLocation: adminMeteringDraft.discomLocation.trim() || undefined,
        },
        localDoc,
      )
      let meterDocUrl =
        toMeterDocumentPublicViewUrl(parseMeterDocumentUrlFromApiPayload(saveResp)) ||
        parseMeterDocumentUrlFromApiPayload(saveResp)
      const meterDocName =
        parseMeterDocumentNameFromApiPayload(saveResp) || localDoc?.name || undefined

      // If API returned a private/key URL, ask for a browser-openable public link.
      if (meterDocUrl) {
        try {
          const { resolvePublicOpenMediaUrl } = await import("@/lib/resolve-public-media-url")
          const opened = await resolvePublicOpenMediaUrl(meterDocUrl, adminMeteringQuotationId)
          if (opened) meterDocUrl = toMeterDocumentPublicViewUrl(opened) || opened
        } catch {
          // keep parsed url
        }
      }

      const id = adminMeteringQuotationId
      const meterDocPatch =
        meterDocUrl || meterDocName
          ? {
              ...(meterDocUrl
                ? {
                    meterDocumentUrl: meterDocUrl,
                    meter_document_url: meterDocUrl,
                    meterDocumentPublicUrl: meterDocUrl,
                    meter_document_public_url: meterDocUrl,
                  }
                : {}),
              ...(meterDocName
                ? {
                    meterDocumentName: meterDocName,
                    meter_document_name: meterDocName,
                  }
                : {}),
            }
          : {}

      setQuotations((prev) =>
        prev.map((q) =>
          q.id === id
            ? ({
                ...q,
                discomName,
                discom_name: discomName,
                meterType,
                meter_type: meterType,
                meterNo,
                meter_no: meterNo,
                solarMeterNo,
                solar_meter_no: solarMeterNo,
                netMeterNo,
                net_meter_no: netMeterNo,
                remarks,
                authorizedRepresentative,
                authorized_representative: authorizedRepresentative,
                discomLocation: adminMeteringDraft.discomLocation.trim() || undefined,
                discom_location: adminMeteringDraft.discomLocation.trim() || undefined,
                ...meterDocPatch,
              } as unknown as Quotation)
            : q,
        ),
      )

      // Keep local file until we have a public URL so the modal can still preview after save+reopen in-session.
      if (meterDocUrl) {
        setAdminMeteringDocByQuotation((prev) => ({ ...prev, [id]: null }))
      }

      setAdminMeteringModalOpen(false)
      setAdminMeteringAdvanceToDiscomAfterSave(false)
      toast({
        title: "Saved",
        description: shouldMoveToDiscom
          ? "Metering details saved. Moving to Meter in Discom…"
          : meterDocUrl
            ? "Metering details saved. Document link is ready to view."
            : "Metering details saved.",
      })
      if (shouldMoveToDiscom) {
        const latest =
          quotations.find((q) => q.id === id) ||
          quotationBeforeSave ||
          ({ id } as Quotation)
        const patched = {
          ...latest,
          discomName,
          discom_name: discomName,
          meterType,
          meter_type: meterType,
          meterNo,
          meter_no: meterNo,
          solarMeterNo,
          solar_meter_no: solarMeterNo,
          netMeterNo,
          net_meter_no: netMeterNo,
          remarks,
          authorizedRepresentative,
          authorized_representative: authorizedRepresentative,
          ...meterDocPatch,
        } as unknown as Quotation
        await setAdminMeteringStage(patched, "approved")
      } else {
        void loadData(++adminLoadRequestRef.current)
      }
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save metering details.",
        variant: "destructive",
      })
    } finally {
      setAdminMeteringSaving(false)
    }
  }

  const openAdminMcoDocsModal = (quotation: Quotation) => {
    setAdminMcoDocsQuotationId(quotation.id)
    setAdminMcoDocsModalOpen(true)
  }

  const saveAdminMcoDocuments = async () => {
    if (!adminMcoDocsQuotationId) return
    const workFile = adminWorkCompleteReportByQuotation[adminMcoDocsQuotationId] || null
    const meterFile = adminMeterInstalledPhotoByQuotation[adminMcoDocsQuotationId] || null
    const dcrFile = adminCompleteDcrReportByQuotation[adminMcoDocsQuotationId] || null
    if (!workFile && !meterFile && !dcrFile) {
      toast({
        title: "Upload required",
        description: "Please upload at least one MCO document to save changes.",
        variant: "destructive",
      })
      return
    }
    try {
      setAdminMcoDocsSaving(true)
      await api.metering.uploadMcoDocuments(adminMcoDocsQuotationId, {
        workCompleteReportImage: workFile,
        meterInstalledPhoto: meterFile,
        completeDcrReportImage: dcrFile,
      })
      await loadData()
      toast({ title: "Saved", description: "MCO documents uploaded." })
      setAdminMcoDocsModalOpen(false)
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Could not upload MCO documents.",
        variant: "destructive",
      })
    } finally {
      setAdminMcoDocsSaving(false)
    }
  }

  const moveAdminToBaldevConfirmation = async (quotation: Quotation) => {
    if (!hasRequiredAdminMeteringDetails(quotation) || !hasRequiredAdminMcoDocuments(quotation)) {
      toast({
        title: "Required data missing",
        description: "Complete Metering Details and all 3 MCO documents before moving to Confirmation.",
        variant: "destructive",
      })
      return
    }
    try {
      await api.metering.updateStatus(quotation.id, "mark_completed")
      await loadData()
      toast({ title: "Moved", description: "Quotation moved to Confirmation (Baldev)." })
    } catch (error) {
      toast({
        title: "Status update failed",
        description: error instanceof Error ? error.message : "Could not move quotation to confirmation.",
        variant: "destructive",
      })
    }
  }

  const markAdminFinalApproved = async (quotation: Quotation) => {
    try {
      setAdminBaldevSavingId(quotation.id)
      await updateOperationalStage(quotation.id, "baldev_approved")
    } finally {
      setAdminBaldevSavingId(null)
    }
  }

  const toggleAdminFinalUpdate = (quotation: Quotation) => {
    setAdminFinalExpandedId((prev) => (prev === quotation.id ? null : quotation.id))
  }

  const saveAdminFinalConfirmationDetails = async (quotation: Quotation) => {
    try {
      setAdminFinalSavingId(quotation.id)
      const finalBillFile = adminFinalBillFileByQuotation[quotation.id]
      const panelWarrantyFile = adminPanelWarrantyFileByQuotation[quotation.id]
      const inverterWarrantyFile = adminInverterWarrantyFileByQuotation[quotation.id]
      const workCompletionWarrantyFile = adminWorkCompletionWarrantyFileByQuotation[quotation.id]
      if (!finalBillFile && !panelWarrantyFile && !inverterWarrantyFile && !workCompletionWarrantyFile) {
        toast({
          title: "Upload required",
          description: "Please upload at least one PDF/JPG document to save.",
          variant: "destructive",
        })
        return
      }
      let uploadResult: unknown = null
      if (useApi) {
        uploadResult = await api.quotations.uploadFinalConfirmationDocuments(quotation.id, {
          customerFinalBillFile: finalBillFile,
          panelWarrantyFile,
          inverterWarrantyFile,
          workCompletionWarrantyFile,
        })
      }
      const merged = mergeAdminFinalConfirmationUploadIntoQuotation(quotation, uploadResult, {
        customerFinalBillFile: finalBillFile,
        panelWarrantyFile,
        inverterWarrantyFile,
        workCompletionWarrantyFile,
      })
      setQuotations((prev) => prev.map((row) => (row.id === quotation.id ? { ...row, ...merged } : row)))
      // Clear local picks only when a saved URL exists; otherwise keep File for preview.
      const clearIfUrl = (key: AdminFinalConfirmationDocKey, setter: typeof setAdminFinalBillFileByQuotation) => {
        const saved = readAdminFinalConfirmationDoc(merged, key)
        if (saved.url) setter((prev) => ({ ...prev, [quotation.id]: null }))
      }
      clearIfUrl("customerFinalBill", setAdminFinalBillFileByQuotation)
      clearIfUrl("panelWarranty", setAdminPanelWarrantyFileByQuotation)
      clearIfUrl("inverterWarranty", setAdminInverterWarrantyFileByQuotation)
      clearIfUrl("workCompletionWarranty", setAdminWorkCompletionWarrantyFileByQuotation)
      // Background refresh — UI already shows Uploaded + preview from merged state.
      void loadData(++adminLoadRequestRef.current)
      toast({
        title: "Saved",
        description: "Final confirmation documents updated.",
      })
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save final confirmation details.",
        variant: "destructive",
      })
    } finally {
      setAdminFinalSavingId(null)
    }
  }

  const seedAdminWccDraftFromQuotation = (quotation: Quotation) => {
    const q = quotation as unknown as Record<string, unknown>
    return {
      discomName: String(q.discomName || q.discom_name || ""),
      remarks: String(q.remarks || ""),
      assignedPersonName: String(
        q.authorizedRepresentative ||
          q.authorized_representative ||
          q.assignedPersonName ||
          q.assigned_person_name ||
          "",
      ),
      discomLocation: getDiscomLocationText(q),
    }
  }

  const getAdminWccDraft = (quotation: Quotation) =>
    adminWccDraftByQuotation[quotation.id] || seedAdminWccDraftFromQuotation(quotation)

  const patchAdminWccDraft = (
    quotationId: string,
    patch: Partial<{
      discomName: string
      remarks: string
      assignedPersonName: string
      discomLocation: string
    }>,
  ) => {
    setAdminWccDraftByQuotation((prev) => {
      const quotation = quotations.find((q) => q.id === quotationId)
      const base =
        prev[quotationId] ||
        (quotation ? seedAdminWccDraftFromQuotation(quotation) : {
          discomName: "",
          remarks: "",
          assignedPersonName: "",
          discomLocation: "",
        })
      return { ...prev, [quotationId]: { ...base, ...patch } }
    })
  }


  const seedAdminMeterInstallDraft = (quotation: Quotation) => {
    const q = quotation as unknown as Record<string, unknown>
    return {
      remarks: String(q.remarks || ""),
      assignedPersonName: String(
        q.authorizedRepresentative ||
          q.authorized_representative ||
          q.assignedPersonName ||
          q.assigned_person_name ||
          "",
      ),
    }
  }

  const getAdminMeterInstallDraft = (quotation: Quotation) =>
    adminMeterInstallDraftByQuotation[quotation.id] || seedAdminMeterInstallDraft(quotation)

  const patchAdminMeterInstallDraft = (
    quotationId: string,
    patch: Partial<{ assignedPersonName: string; remarks: string }>,
  ) => {
    setAdminMeterInstallDraftByQuotation((prev) => {
      const quotation = quotations.find((q) => q.id === quotationId)
      const base =
        prev[quotationId] ||
        (quotation ? seedAdminMeterInstallDraft(quotation) : { assignedPersonName: "", remarks: "" })
      return { ...prev, [quotationId]: { ...base, ...patch } }
    })
  }

  const resolveMeterInstallPhotoSlot = (quotation: Quotation) => {
    const local = adminMeterInstallPhotoByQuotation[quotation.id]
    if (local?.file || local?.url) return local
    const q = quotation as unknown as Record<string, unknown>
    const url = String(
      q.meterInstallationPhotoUrl ||
        q.meter_installation_photo_url ||
        q.meterInstallationPhotoPublicUrl ||
        q.meter_installation_photo_public_url ||
        "",
    ).trim()
    const name = String(
      q.meterInstallationPhotoName || q.meter_installation_photo_name || "",
    ).trim()
    return url ? { url, name: name || "Meter installation photo" } : {}
  }

  const resolvePlantLivePhotoSlot = (quotation: Quotation) => {
    const local = adminPlantLivePhotoByQuotation[quotation.id]
    if (local?.file || local?.url) return local
    const q = quotation as unknown as Record<string, unknown>
    const url = String(
      q.plantLivePhotoUrl ||
        q.plant_live_photo_url ||
        q.plantLivePhotoPublicUrl ||
        q.plant_live_photo_public_url ||
        "",
    ).trim()
    const name = String(q.plantLivePhotoName || q.plant_live_photo_name || "").trim()
    return url ? { url, name: name || "Plant live photo" } : {}
  }

  const openAdminMeterInstallModal = (quotation: Quotation) => {
    setAdminMeterInstallDraftByQuotation((prev) => ({
      ...prev,
      [quotation.id]: seedAdminMeterInstallDraft(quotation),
    }))
    const meter = resolveMeterInstallPhotoSlot(quotation)
    const plant = resolvePlantLivePhotoSlot(quotation)
    if (meter.url || meter.file) {
      setAdminMeterInstallPhotoByQuotation((prev) => ({ ...prev, [quotation.id]: meter }))
    }
    if (plant.url || plant.file) {
      setAdminPlantLivePhotoByQuotation((prev) => ({ ...prev, [quotation.id]: plant }))
    }
    setAdminMeterInstallModalQuotationId(quotation.id)
  }

  const saveAdminMeterInstallDetails = async (quotation: Quotation) => {
    const draft = getAdminMeterInstallDraft(quotation)
    const assignedPersonName = draft.assignedPersonName.trim()
    const remarks = draft.remarks.trim()
    const meterSlot = resolveMeterInstallPhotoSlot(quotation)
    const plantSlot = resolvePlantLivePhotoSlot(quotation)
    const meterFile = meterSlot.file || null
    const plantFile = plantSlot.file || null
    const hasMeter = Boolean(meterFile || meterSlot.url)
    const hasPlant = Boolean(plantFile || plantSlot.url)
    if (!assignedPersonName) {
      toast({
        title: "Required fields",
        description: "Assigned person name is required.",
        variant: "destructive",
      })
      return
    }
    if (!hasMeter || !hasPlant) {
      toast({
        title: "Photos required",
        description: "Upload Meter installation photo and Plant live photo.",
        variant: "destructive",
      })
      return
    }
    try {
      setAdminMeterInstallSavingId(quotation.id)
      let meterUrl = meterSlot.url || ""
      let plantUrl = plantSlot.url || ""
      if (useApi) {
        const resp = await api.metering.saveDetails(quotation.id, {
          remarks,
          authorizedRepresentative: assignedPersonName,
          meterInstallationPhoto: meterFile,
          plantLivePhoto: plantFile,
        })
        const r = (resp || {}) as Record<string, unknown>
        meterUrl =
          String(
            r.meterInstallationPhotoUrl ||
              r.meter_installation_photo_url ||
              r.meterInstallationPhotoPublicUrl ||
              "",
          ).trim() || meterUrl
        plantUrl =
          String(
            r.plantLivePhotoUrl || r.plant_live_photo_url || r.plantLivePhotoPublicUrl || "",
          ).trim() || plantUrl
        if (meterFile && !meterUrl) meterUrl = URL.createObjectURL(meterFile)
        if (plantFile && !plantUrl) plantUrl = URL.createObjectURL(plantFile)
      } else {
        if (meterFile) meterUrl = URL.createObjectURL(meterFile)
        if (plantFile) plantUrl = URL.createObjectURL(plantFile)
      }
      setQuotations((prev) =>
        prev.map((q) =>
          q.id === quotation.id
            ? ({
                ...q,
                remarks,
                authorizedRepresentative: assignedPersonName,
                authorized_representative: assignedPersonName,
                assignedPersonName,
                assigned_person_name: assignedPersonName,
                meterInstallationPhotoUrl: meterUrl || undefined,
                meter_installation_photo_url: meterUrl || undefined,
                plantLivePhotoUrl: plantUrl || undefined,
                plant_live_photo_url: plantUrl || undefined,
                meterInstallationPhotoName: meterFile?.name || meterSlot.name,
                plantLivePhotoName: plantFile?.name || plantSlot.name,
              } as Quotation)
            : q,
        ),
      )
      setAdminMeterInstallPhotoByQuotation((prev) => {
        const next = { ...prev }
        delete next[quotation.id]
        return next
      })
      setAdminPlantLivePhotoByQuotation((prev) => {
        const next = { ...prev }
        delete next[quotation.id]
        return next
      })
      setAdminMeterInstallDraftByQuotation((prev) => {
        const next = { ...prev }
        delete next[quotation.id]
        return next
      })
      try {
        await loadData()
      } catch {
        // local optimistic update already applied
      }
      toast({
        title: "Meter installation saved",
        description: "Photos and assigned person updated.",
      })
      setAdminMeterInstallModalQuotationId(null)
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save meter installation details.",
        variant: "destructive",
      })
    } finally {
      setAdminMeterInstallSavingId(null)
    }
  }

  const openAdminWccModal = async (quotation: Quotation) => {
    let mergedQuotation = quotation
    if (useApi) {
      try {
        const full = await api.quotations.getById(quotation.id)
        mergedQuotation = { ...(quotation as any), ...(full as any) } as Quotation
      } catch {
        mergedQuotation = quotation
      }
    }
    const qm = mergedQuotation as any
    setAdminInstallQuotation(mergedQuotation)
    setAdminInstallMediaByField(extractAdminInstallationMediaFromQuotation(qm))
    setAdminInstallPiMedia(extractPiMediaListFromQuotation(qm))
    setAdminWccDraftByQuotation((prev) => ({
      ...prev,
      [quotation.id]: seedAdminWccDraftFromQuotation(mergedQuotation),
    }))
    setAdminWccModalQuotationId(quotation.id)
  }


  const saveAdminWccMeteringDetails = async (quotation: Quotation) => {
    const draft = getAdminWccDraft(quotation)
    const discomName = draft.discomName.trim()
    const remarks = draft.remarks.trim()
    const assignedPersonName = draft.assignedPersonName.trim()
    const discomLocation = draft.discomLocation.trim()
    if (!discomName || !assignedPersonName) {
      toast({
        title: "Required fields",
        description: "Discom name and Assigned person name are required. Discom location is optional.",
        variant: "destructive",
      })
      return
    }
    try {
      setAdminWccSavingId(quotation.id)
      if (useApi) {
        await api.metering.saveDetails(quotation.id, {
          discomName,
          remarks,
          authorizedRepresentative: assignedPersonName,
          discomLocation: discomLocation || undefined,
        })
        try {
          await api.admin.quotations.updateOperationalStatus(
            quotation.id,
            "meter_installation_pending",
          )
        } catch {
          // Details saved; stage transition may be optional if already in metering.
        }
        try {
          await api.admin.quotations.setMeteringWccAfterDiscom(quotation.id, false)
        } catch {
          // Flag clear is best-effort when route is missing.
        }
      }
      applyMeteringWccAfterDiscomLocal(quotation.id, false)
      applyAdminMeteringStageLocal(quotation.id, "meter_install")
      setQuotations((prev) =>
        prev.map((q) =>
          q.id === quotation.id
            ? ({
                ...withMeteringWccAfterDiscomFlag(q, false),
                discomName,
                discom_name: discomName,
                remarks,
                authorizedRepresentative: assignedPersonName,
                authorized_representative: assignedPersonName,
                assignedPersonName,
                assigned_person_name: assignedPersonName,
                discomLocation: discomLocation || undefined,
                discom_location: discomLocation || undefined,
                installationStatus: "meter_installation_pending",
                installation_status: "meter_installation_pending",
                meteringStatus: "meter_installation_pending",
                metering_status: "meter_installation_pending",
              } as Quotation)
            : q,
        ),
      )
      setAdminWccDraftByQuotation((prev) => {
        const next = { ...prev }
        delete next[quotation.id]
        return next
      })
      try {
        await loadData()
      } catch {
        // local optimistic update already applied
      }
      applyAdminMeteringStageLocal(quotation.id, "meter_install")
      applyMeteringWccAfterDiscomLocal(quotation.id, false)
      toast({
        title: "WCC details saved",
        description: "Moved to Meter Installation Pending.",
      })
      setAdminWccModalQuotationId(null)
      setAdminInstallQuotation(null)
      setAdminInstallMediaByField({})
      setAdminInstallPiMedia([])
      setOperationalTab("metering")
      setOperationalProgressTab("meter_install")
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save WCC details.",
        variant: "destructive",
      })
    } finally {
      setAdminWccSavingId(null)
    }
  }

  /** Meter in Discom → WCC Pending only when Installation is approved (server flag). */
  const moveAdminMeteringFromDiscomToWcc = async (quotation: Quotation) => {
    if (!isInstallationUploadComplete(quotation, installerQueueApprovedIds)) {
      toast({
        title: "Installation not approved",
        description:
          "Customer installation must be completed and approved before moving to WCC Pending.",
        variant: "destructive",
      })
      return
    }
    try {
      if (useApi) {
        await api.admin.quotations.setMeteringWccAfterDiscom(quotation.id, true)
      }
      applyMeteringWccAfterDiscomLocal(quotation.id, true)
      try {
        await loadData()
      } catch {
        // optimistic flag already applied
      }
      applyMeteringWccAfterDiscomLocal(quotation.id, true)
      setOperationalProgressTab("wcc")
      toast({
        title: "Moved to WCC Pending",
        description: "Complete WCC details, then the row moves to Meter Installation Pending.",
      })
    } catch (error) {
      toast({
        title: "Could not move to WCC Pending",
        description: error instanceof Error ? error.message : "Failed to update metering WCC flag.",
        variant: "destructive",
      })
    }
  }

  const setAdminMeteringStage = async (
    quotation: Quotation,
    target: "approved" | "meter_install" | "mco" | "processing",
  ) => {
    try {
      if (target === "approved") {
        if (!hasRequiredAdminMeteringDetails(quotation)) {
          openAdminMeteringDetails(quotation, { advanceToDiscomAfterSave: true })
          toast({
            title: "Complete metering details",
            description: "Fill required fields, then Save & To Discom — the row will appear under Meter in Discom.",
          })
          return
        }
        await ensureAdminMeteringApproved(quotation)
        applyMeteringWccAfterDiscomLocal(quotation.id, false)
        applyAdminMeteringStageLocal(quotation.id, "approved")
        setOperationalTab("metering")
        setOperationalProgressTab("done")
        try {
          await loadData(++adminLoadRequestRef.current)
        } catch {
          // keep local stage if refresh fails
        }
        applyAdminMeteringStageLocal(quotation.id, "approved")
        applyMeteringWccAfterDiscomLocal(quotation.id, false)
        toast({
          title: "Moved to Meter in Discom",
          description:
            "Row is now visible under Meter in Discom. When installation is approved, move it to WCC Pending.",
        })
        return
      } else if (target === "meter_install") {
        applyMeteringWccAfterDiscomLocal(quotation.id, false)
        applyAdminMeteringStageLocal(quotation.id, "meter_install")
        setOperationalProgressTab("meter_install")
        try {
          if (useApi) {
            await api.admin.quotations.updateOperationalStatus(
              quotation.id,
              "meter_installation_pending",
            )
          }
        } catch {
          // Local tab placement still applies if backend does not know this stage yet.
        }
        try {
          await loadData()
        } catch {
          // no-op
        }
        applyAdminMeteringStageLocal(quotation.id, "meter_install")
        applyMeteringWccAfterDiscomLocal(quotation.id, false)
        toast({
          title: "Moved to Meter Installation Pending",
          description: "Upload meter installation and plant live photos in this tab.",
        })
        return
      } else if (target === "mco") {
        applyMeteringWccAfterDiscomLocal(quotation.id, false)
        // Carry Meter Installation Pending draft fields into Final Step before stage change.
        const mipDraft = getAdminMeterInstallDraft(quotation)
        const assignedPersonName = mipDraft.assignedPersonName.trim()
        const remarks = mipDraft.remarks.trim()
        const meterSlot = resolveMeterInstallPhotoSlot(quotation)
        const plantSlot = resolvePlantLivePhotoSlot(quotation)
        if (assignedPersonName || remarks || meterSlot.url || plantSlot.url) {
          setQuotations((prev) =>
            prev.map((q) =>
              q.id === quotation.id
                ? ({
                    ...q,
                    ...(assignedPersonName
                      ? {
                          authorizedRepresentative: assignedPersonName,
                          authorized_representative: assignedPersonName,
                          assignedPersonName,
                          assigned_person_name: assignedPersonName,
                        }
                      : {}),
                    ...(remarks ? { remarks } : {}),
                    ...(meterSlot.url
                      ? {
                          meterInstallationPhotoUrl: meterSlot.url,
                          meter_installation_photo_url: meterSlot.url,
                          meterInstallationPhotoName: meterSlot.name,
                        }
                      : {}),
                    ...(plantSlot.url
                      ? {
                          plantLivePhotoUrl: plantSlot.url,
                          plant_live_photo_url: plantSlot.url,
                          plantLivePhotoName: plantSlot.name,
                        }
                      : {}),
                  } as Quotation)
                : q,
            ),
          )
        }

        applyAdminMeteringStageLocal(quotation.id, "mco")
        setOperationalProgressTab("mco")

        let persisted = false
        try {
          if (hasRequiredAdminMeteringDetails(quotation)) {
            await ensureAdminMeteringApproved(quotation)
          }
          persisted = await api.admin.quotations.forceAdvanceToMco(quotation.id)
        } catch {
          // keep local MCO tab placement
        }

        try {
          await loadData()
        } catch {
          // no-op
        }

        applyAdminMeteringStageLocal(quotation.id, "mco")

        toast({
          title: "Moved to Final Step",
          description: persisted
            ? "Quotation is in the Final Step tab with Meter Installation Pending details."
            : "Shown in Final Step with local Meter Installation Pending details. Server may still show the previous stage until backend accepts the MCO transition.",
        })
        return
      } else {
        applyMeteringWccAfterDiscomLocal(quotation.id, false)
        await api.metering.updateStatus(quotation.id, "move_back")
        applyAdminMeteringStageLocal(quotation.id, "processing")
        setOperationalProgressTab("pending")
        await loadData()
        applyAdminMeteringStageLocal(quotation.id, "processing")
        applyMeteringWccAfterDiscomLocal(quotation.id, false)
        toast({ title: "Stage updated", description: "Moved back to Meter Pending." })
        return
      }
    } catch (error) {
      toast({
        title: "Status update failed",
        description: error instanceof Error ? error.message : "Could not update metering stage.",
        variant: "destructive",
      })
    }
  }

  const updateOperationalStage = async (
    quotationId: string,
    stage: AdminOperationalStage,
    options?: { suppressSuccessToast?: boolean },
  ): Promise<boolean> => {
    try {
      if (useApi) {
        await api.admin.quotations.updateOperationalStatus(quotationId, stage)
        await loadData()
      } else {
        const updated = quotations.map((q) =>
          q.id === quotationId
            ? {
                ...q,
                installationStatus: stage,
                installation_status: stage,
                meteringStatus: stage,
                metering_status: stage,
              }
            : q,
        )
        setQuotations(updated)
        localStorage.setItem("quotations", JSON.stringify(updated))
      }
      if (!options?.suppressSuccessToast) {
        toast({
          title: "Operational stage updated",
          description: `Quotation moved to ${stage.replaceAll("_", " ")}.`,
        })
      }
      return true
    } catch (error) {
      console.error("Error updating operational stage:", error)
      toast({
        title: "Update failed",
        description: error instanceof ApiError ? error.message : "Failed to update installation/metering/confirmation stage.",
        variant: "destructive",
      })
      return false
    }
  }

  const handleSendToMetering = async (quotation: Quotation) => {
    const menuState =
      operationalTab === "all"
        ? getAdminQuotationsTabSendToMeteringState(quotation)
        : getSendToMeteringMenuState(quotation)
    if (sendingToMeteringId === quotation.id) return
    if (!menuState.enabled) {
      toast({
        title: "Cannot send to metering",
        description: menuState.hint || "Approve the quotation and complete installation first.",
        variant: "destructive",
      })
      return
    }

    if (!confirmSave(`Send ${quotation.id} to Metering and save?`)) return

    setSendingToMeteringId(quotation.id)
    try {
      let ok = false
      if (useApi) {
        const installRaw = getInstallationWorkflowStatus(quotation as unknown as Record<string, unknown>)
        if (installRaw === "pending_installer" || installRaw === "installer_in_progress") {
          try {
            await api.admin.quotations.updateOperationalStatus(quotation.id, "installer_approved")
          } catch {
            /* sendQuotationToMetering may still step through */
          }
        }
        ok = await sendQuotationToMetering(quotation.id)

        if (!ok) {
          try {
            await api.admin.quotations.updateOperationalStatus(quotation.id, "pending_metering")
            ok = true
          } catch (error) {
            const message = error instanceof ApiError ? error.message : String(error || "")
            const blockedFromPending =
              /cannot send to metering/i.test(message) || /pending_installer/i.test(message)

            if (blockedFromPending) {
              try {
                console.warn(
                  "[Send to Metering] blocked from pending_installer — stepping through installer_approved → pending_metering",
                  { quotationId: quotation.id, message },
                )
                await api.admin.quotations.updateOperationalStatus(quotation.id, "installer_approved")
                await api.admin.quotations.updateOperationalStatus(quotation.id, "pending_metering")
                ok = true
              } catch (stepError) {
                console.error("Send to metering (step-through) failed:", stepError)
                toast({
                  title: "Send to metering failed",
                  description:
                    stepError instanceof ApiError
                      ? stepError.message
                      : "Could not update metering status on the server.",
                  variant: "destructive",
                })
                return
              }
            } else {
              console.error("Send to metering failed:", error)
              toast({
                title: "Send to metering failed",
                description:
                  error instanceof ApiError
                    ? error.message
                    : "Could not update metering status on the server.",
                variant: "destructive",
              })
              return
            }
          }
        }

        if (!ok) return

        applyAdminMeteringStageLocal(quotation.id, "processing")
        markAdminMeteringHandoff(quotation.id)
        await loadData()
      } else {
        applyAdminMeteringStageLocal(quotation.id, "processing")
        markAdminMeteringHandoff(quotation.id)
        setQuotations((prev) => {
          const updated = prev.map((q) =>
            q.id === quotation.id ? patchQuotationMeteringStageLocal(q, "processing") : q,
          )
          localStorage.setItem("quotations", JSON.stringify(updated))
          return updated
        })
        ok = true
      }

      if (ok) {
        toast({
          title: "Sent to Metering",
          description: `${quotation.id} is now in Metering → Meter Pending. Use Retrieve here if you need to pull it back.`,
        })
      }
    } finally {
      setSendingToMeteringId(null)
    }
  }

  const handleRetrieveFromMetering = async (quotation: Quotation) => {
    const override = adminMeteringStageOverride[quotation.id]
    const retrieveState =
      override === "processing"
        ? { visible: true, enabled: true, hint: "", sent: false }
        : getAdminQuotationsTabRetrieveState(quotation, override)
    if (retrievingFromMeteringId === quotation.id) return
    if (!retrieveState.enabled) {
      toast({
        title: "Cannot retrieve",
        description: retrieveState.hint || "This quotation is not in early Meter Pending.",
        variant: "destructive",
      })
      return
    }
    if (!confirmSave(`Retrieve ${quotation.id} from Metering back to Installation approved?`)) return

    setRetrievingFromMeteringId(quotation.id)
    try {
      if (useApi) {
        let ok = await retrieveQuotationFromMetering(quotation.id)
        if (!ok) {
          try {
            await api.admin.quotations.updateOperationalStatus(quotation.id, "installer_approved")
            ok = true
          } catch (error) {
            toast({
              title: "Retrieve failed",
              description:
                error instanceof ApiError ? error.message : "Could not update status on the server.",
              variant: "destructive",
            })
            return
          }
        }
        if (ok) await loadData()
      }

      clearAdminMeteringHandoff(quotation.id)
      setAdminMeteringStageOverride((prev) => {
        const next = { ...prev }
        delete next[quotation.id]
        return next
      })
      setQuotations((prev) =>
        prev.map((q) => (q.id === quotation.id ? patchQuotationRetrieveFromMeteringLocal(q) : q)),
      )
      if (!useApi) {
        const updated = quotations.map((q) =>
          q.id === quotation.id ? patchQuotationRetrieveFromMeteringLocal(q) : q,
        )
        localStorage.setItem("quotations", JSON.stringify(updated))
      }

      toast({
        title: "Retrieved from Metering",
        description: `${quotation.id} is back on Quotations — you can send to Metering again when ready.`,
      })
    } finally {
      setRetrievingFromMeteringId(null)
    }
  }

  const handleRetrieveFromInstallation = async (quotation: Quotation) => {
    const retrieveState = getAdminInstallationTabRevertState(
      quotation as unknown as Record<string, unknown>,
      getInstallerQueueStatusForAdmin(quotation),
      readInstallerReleaseMap(),
    )
    if (retrievingFromInstallationId === quotation.id) return
    if (!retrieveState.enabled) {
      toast({
        title: "Cannot retrieve",
        description:
          retrieveState.hint || "This quotation is already in Metering or cannot be pulled back to Accounts.",
        variant: "destructive",
      })
      return
    }
    if (
      !confirmSave(
        `Retrieve ${quotation.id} from Installation back to Accounts?\n\nThis undoes Send to Installer.`,
      )
    ) {
      return
    }

    setRetrievingFromInstallationId(quotation.id)
    try {
      if (useApi) {
        let ok = await retrieveQuotationFromInstallation(quotation.id)
        if (!ok) {
          toast({
            title: "Retrieve failed",
            description: "Could not clear installation release on the server.",
            variant: "destructive",
          })
          return
        }
        await loadData()
      }

      clearInstallerReleaseInLocalMap(quotation.id)
      setInstallerQueueApprovedIds((prev) => {
        const next = new Set(prev)
        next.delete(quotation.id)
        return next
      })
      setQuotations((prev) =>
        prev.map((q) => (q.id === quotation.id ? patchQuotationRetrieveFromInstallationLocal(q) : q)),
      )
      if (!useApi) {
        const updated = quotations.map((q) =>
          q.id === quotation.id ? patchQuotationRetrieveFromInstallationLocal(q) : q,
        )
        localStorage.setItem("quotations", JSON.stringify(updated))
      }

      toast({
        title: "Reverted from Installation",
        description: `${quotation.id} is back on Accounts — you can Send to Installer again when ready.`,
      })
    } finally {
      setRetrievingFromInstallationId(null)
    }
  }

  const confirmRevertInstallationToPending = async () => {
    if (!installRevertTarget) return
    const { id } = installRevertTarget
    setInstallRevertSaving(true)

    const stampPending = (row: Quotation): Quotation =>
      ({
        ...row,
        installationStatus: "pending_installer",
        installation_status: "pending_installer",
        installerApprovedAt: undefined,
        installer_approved_at: undefined,
        installationPartialApproved: false,
        installation_partial_approved: false,
      }) as Quotation

    const applyLocalRevert = () => {
      setInstallerQueueApprovedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setQuotations((prev) => prev.map((q) => (q.id === id ? stampPending(q) : q)))
      setAdminInstallExpandedId((prev) => (prev === id ? null : prev))
    }

    try {
      if (useApi) {
        try {
          await api.admin.quotations.revertInstallationToPending(id)
        } catch (error) {
          try {
            await api.admin.quotations.updateOperationalStatus(id, "pending_installer")
          } catch {
            toast({
              title: "Server did not accept revert",
              description:
                error instanceof ApiError
                  ? error.message
                  : "Moved to Pending Installation on this screen. Ask backend to allow installer_approved → pending_installer.",
              variant: "destructive",
            })
          }
        }
      }
      applyLocalRevert()
      setInstallRevertTarget(null)
      setOperationalProgressTab("pending")
      toast({
        title: "Reverted to pending",
        description: "This job is back under Pending Installation. You can upload or edit photos again from there.",
      })
      if (useApi) {
        try {
          await loadData()
        } catch {
          // keep local pending stamp
        }
        applyLocalRevert()
      }
    } finally {
      setInstallRevertSaving(false)
    }
  }

  const openAdminInstallDialog = (quotation: Quotation) => {
    if (adminInstallExpandedId === quotation.id) {
      openInstallPanelSeqRef.current += 1
      setAdminInstallExpandedId(null)
      setAdminInstallQuotation(null)
      return
    }

    const seq = ++openInstallPanelSeqRef.current
    const qAny = quotation as unknown as Record<string, unknown>
    setAdminInstallExpandedId(quotation.id)
    setAdminInstallQuotation(quotation)
    setAdminInstallMediaByField(extractAdminInstallationMediaFromQuotation(qAny))
    setAdminInstallPiMedia(extractPiMediaListFromQuotation(qAny))
    setAdminInstallExtraExpenses([])
    setAdminInstallNotes(String(qAny.installerRemarks ?? qAny.installer_remarks ?? "").trim())
    setAdminInstallDimensions({
      length: String(qAny.siteLength ?? qAny.site_length ?? qAny.backLegCm ?? qAny.back_leg_cm ?? "").trim(),
      width: String(qAny.siteWidth ?? qAny.site_width ?? qAny.midLegCm ?? qAny.mid_leg_cm ?? "").trim(),
      height: String(qAny.siteHeight ?? qAny.site_height ?? qAny.frontLegCm ?? qAny.front_leg_cm ?? "").trim(),
    })

    if (!useApi) return
    void (async () => {
      try {
        const full = flattenWrappedQuotationRow(await api.quotations.getById(quotation.id))
        if (seq !== openInstallPanelSeqRef.current) return
        const merged = mergeInstallationMediaSources(qAny, full) as Quotation
        const mergedAny = merged as unknown as Record<string, unknown>
        setAdminInstallQuotation(merged)
        setAdminInstallMediaByField(extractAdminInstallationMediaFromQuotation(mergedAny))
        setAdminInstallPiMedia(extractPiMediaListFromQuotation(mergedAny))
        setAdminInstallNotes(String(mergedAny.installerRemarks ?? mergedAny.installer_remarks ?? "").trim())
        setAdminInstallDimensions({
          length: String(mergedAny.siteLength ?? mergedAny.site_length ?? mergedAny.backLegCm ?? mergedAny.back_leg_cm ?? "").trim(),
          width: String(mergedAny.siteWidth ?? mergedAny.site_width ?? mergedAny.midLegCm ?? mergedAny.mid_leg_cm ?? "").trim(),
          height: String(
            mergedAny.siteHeight ?? mergedAny.site_height ?? mergedAny.frontLegCm ?? mergedAny.front_leg_cm ?? "",
          ).trim(),
        })
        setQuotations((prev) =>
          prev.map((row) =>
            row.id === quotation.id ? (mergeInstallationMediaSources(row as unknown as Record<string, unknown>, full) as Quotation) : row,
          ),
        )
      } catch {
        // Keep the panel open with list-row data if detail fetch fails.
      }
    })()
  }

  const openInstallPhotosViewer = (quotation: Quotation) => {
    setInstallPhotosViewer(quotation)
    setInstallPhotoUrls(gatherInstallationPublicImageUrls(quotation as unknown as Record<string, unknown>, 24))
    setInstallPhotosLoading(true)
    if (!useApi) {
      setInstallPhotosLoading(false)
      return
    }
    void (async () => {
      try {
        const full = flattenWrappedQuotationRow(await api.quotations.getById(quotation.id))
        const merged = mergeInstallationMediaSources(quotation as unknown as Record<string, unknown>, full)
        setInstallPhotoUrls(gatherInstallationPublicImageUrls(merged as Record<string, unknown>, 24))
      } catch {
        // keep any URLs already on the list row
      } finally {
        setInstallPhotosLoading(false)
      }
    })()
  }

  const submitAdminInstallationUpload = async (mode: "approved" | "partial" = "approved") => {
    if (!adminInstallQuotation) return
    const isPartial = mode === "partial"
    if (!isPartial) {
    const requiredFields = ADMIN_INSTALLATION_IMAGE_FIELDS.filter((f) => isAdminImageFieldRequired(f))
    const missingFields = requiredFields.filter(
      (field) => !(adminInstallMediaByField[field.key] && adminInstallMediaByField[field.key]!.length > 0),
    )
    if (missingFields.length > 0) {
      toast({
        title: "Images required",
        description: `Please upload all required images. Missing: ${missingFields.map((f) => f.label).join(", ")}.`,
        variant: "destructive",
      })
      return
      }
    } else {
      const hasAnyImage =
        Object.values(adminInstallMediaByField).some((slots) => (slots?.length ?? 0) > 0) ||
        Boolean(adminInstallPiMedia.some((m) => m.localFile || m.url))
      if (!hasAnyImage) {
        toast({
          title: "Upload required",
          description: "Add at least one photo or PI before marking Partial Approved.",
          variant: "destructive",
        })
        return
      }
    }

    const backCm = adminInstallDimensions.length.trim()
    const frontCm = adminInstallDimensions.height.trim()
    const midCmRaw = adminInstallDimensions.width.trim()
    const backN = backCm ? Number(backCm) : undefined
    const frontN = frontCm ? Number(frontCm) : undefined
    if (backCm && (!Number.isFinite(backN) || (backN as number) <= 0)) {
      toast({
        title: "Invalid back leg",
        description: "Back leg must be a valid number greater than zero, or leave it empty.",
        variant: "destructive",
      })
      return
    }
    if (frontCm && (!Number.isFinite(frontN) || (frontN as number) <= 0)) {
      toast({
        title: "Invalid front leg",
        description: "Front leg must be a valid number greater than zero, or leave it empty.",
        variant: "destructive",
      })
      return
    }
    if (midCmRaw) {
      const midN = Number(midCmRaw)
      if (!Number.isFinite(midN) || midN <= 0) {
        toast({
          title: "Invalid mid leg",
          description: "Mid leg must be a valid number greater than zero, or leave it empty.",
          variant: "destructive",
        })
        return
      }
    }

    const expenseLines = adminInstallExtraExpenses.filter((l) => l.description.trim() !== "" || l.amount.trim() !== "")
    if (expenseLines.some((l) => !l.amount.trim() || Number.isNaN(parseFloat(l.amount)) || parseFloat(l.amount) < 0)) {
      toast({
        title: "Extra expenses",
        description: "Each expense line with a description must have a valid amount (>= 0).",
        variant: "destructive",
      })
      return
    }

    const cmToFeet = (cm: number) => Number((cm / 30.48).toFixed(4))
    const targetStatus: AdminOperationalStage = isPartial
      ? "installer_partial_approved"
      : "installer_approved"

    const isInstallUploadStateBlocked = (error: unknown) => {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error || "")
      return /upload not allowed for this quotation state/i.test(message)
    }

    const currentInstallStatus = String(
      (adminInstallQuotation as any).installationStatus ||
        (adminInstallQuotation as any).installation_status ||
        "",
    )
      .trim()
      .toLowerCase()
    const needsStartBeforeUpload =
      !currentInstallStatus ||
      currentInstallStatus === "pending_installer" ||
      currentInstallStatus === "pending" ||
      currentInstallStatus === "released" ||
      currentInstallStatus === "sent_to_installer"

    try {
      setAdminInstallSaving(true)

      // Backend often rejects completion upload while still pending_installer.
      // Same as clicking Start — promote first so Complete / Partial Approved works.
      if (useApi && needsStartBeforeUpload) {
        try {
          await api.admin.quotations.updateOperationalStatus(
            adminInstallQuotation.id,
            "installer_in_progress",
          )
          setQuotations((prev) =>
            prev.map((row) =>
              row.id === adminInstallQuotation.id
                ? ({
                    ...row,
                    installationStatus: "installer_in_progress",
                    installation_status: "installer_in_progress",
                  } as Quotation)
                : row,
            ),
          )
        } catch {
          // Upload may still succeed with force flags below.
        }
      }

      const formData = new FormData()
      // Many backends (Multer `.fields`) only allow `installerCompletionImages` + `piUpload` as file parts;
      // per-field keys (`homeFrontPhoto`, …) trigger "Unexpected or too many file fields". Send every
      // image once under the aggregate key; optional JSON maps each part index → field key for labeling.
      const fieldOrder: string[] = []
      ADMIN_INSTALLATION_IMAGE_FIELDS.forEach((field) => {
        const slots = adminInstallMediaByField[field.key] || []
        slots.forEach((slot) => {
          if (slot.localFile) {
            formData.append("installerCompletionImages", slot.localFile)
            fieldOrder.push(field.key)
          }
        })
      })
      const retainedUrls: Record<string, string[]> = {}
      ADMIN_INSTALLATION_IMAGE_FIELDS.forEach((field) => {
        const urls = (adminInstallMediaByField[field.key] || [])
          .filter((s) => !s.localFile && s.url)
          .map((s) => s.url)
        if (urls.length) retainedUrls[field.key] = urls
      })
      if (Object.keys(retainedUrls).length > 0) {
        formData.append("existingInstallationImageUrlsJson", JSON.stringify(retainedUrls))
      }
      if (fieldOrder.length > 0) {
        formData.append("installerCompletionImageFieldOrderJson", JSON.stringify(fieldOrder))
      }
      const newPiFiles = adminInstallPiMedia.filter((m) => m.localFile).map((m) => m.localFile!)
      const existingPiUrls = adminInstallPiMedia
        .filter((m) => !m.localFile && m.url)
        .map((m) => m.url)
      for (const file of newPiFiles) {
        formData.append("piUpload", file)
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
      if (backCm) formData.append("backLegCm", backCm)
      if (midCmRaw) formData.append("midLegCm", midCmRaw)
      if (frontCm) formData.append("frontLegCm", frontCm)
      if (backN != null) formData.append("backLegFeet", String(cmToFeet(backN)))
      if (midCmRaw) formData.append("midLegFeet", String(cmToFeet(Number(midCmRaw))))
      if (frontN != null) formData.append("frontLegFeet", String(cmToFeet(frontN)))
      formData.append("installerRemarks", adminInstallNotes)
      formData.append("installationStatus", targetStatus)
      // Admin completion from Pending Installation — backends that gate on stage should honor these.
      formData.append("force", "true")
      formData.append("adminOverride", "true")
      formData.append("allowFromPendingInstaller", "true")
      formData.append("source", "admin")
      if (isPartial) {
        formData.append("installationPartialApproved", "true")
        formData.append("installation_partial_approved", "true")
      } else {
        formData.append("installationPartialApproved", "false")
        formData.append("installation_partial_approved", "false")
      }

      const runUpload = () =>
        api.installer.uploadCompletionDocuments(adminInstallQuotation.id, formData, {
          caller: "admin",
        })

      let uploadResult: Awaited<ReturnType<typeof api.installer.uploadCompletionDocuments>>
      try {
        uploadResult = await runUpload()
      } catch (error) {
        if (!useApi || !isInstallUploadStateBlocked(error)) throw error
        // Retry once after forcing Start (in progress) if first attempt still hit the state gate.
        try {
          await api.admin.quotations.updateOperationalStatus(
            adminInstallQuotation.id,
            "installer_in_progress",
          )
        } catch {
          /* retry upload anyway */
        }
        uploadResult = await runUpload()
      }
        const uploadedId = adminInstallQuotation.id
      const applyLocalPartialOrApproved = () => {
        const now = new Date().toISOString()
          setQuotations((prev) =>
          prev.map((row) => {
            if (row.id !== uploadedId) return row
            const merged =
              uploadResult && typeof uploadResult === "object"
                ? (mergeInstallationMediaSources(
                    row as unknown as Record<string, unknown>,
                    uploadResult as Record<string, unknown>,
                  ) as Quotation)
                : row
            return {
              ...merged,
              installationStatus: targetStatus,
              installation_status: targetStatus,
              installationPartialApproved: isPartial,
              installation_partial_approved: isPartial,
              ...(isPartial
                ? {}
                : {
                    installerApprovedAt: now,
                    installer_approved_at: now,
                    installationPartialApproved: false,
                    installation_partial_approved: false,
                  }),
            } as Quotation
          }),
        )
        if (!isPartial) {
          setInstallerQueueApprovedIds((prev) => {
            const next = new Set(prev)
            next.add(uploadedId)
            return next
          })
        }
      }

      let stageOk = false
      if (isPartial) {
        // Prefer API when supported; keep local tab placement if backend does not know this stage yet.
        try {
          if (useApi) {
            await api.admin.quotations.updateOperationalStatus(uploadedId, targetStatus)
            try {
              await loadData()
            } catch {
              // keep local merge below
            }
          }
          stageOk = true
        } catch {
          stageOk = true
        }
        applyLocalPartialOrApproved()
      } else {
        stageOk = await updateOperationalStage(adminInstallQuotation.id, targetStatus, {
          suppressSuccessToast: true,
        })
        if (stageOk) applyLocalPartialOrApproved()
      }

      if (stageOk) {
        setOperationalTab(isPartial ? "installation" : "metering")
        setOperationalProgressTab(isPartial ? "partial" : "wcc")
        setAdminInstallExpandedId(null)
        setAdminInstallQuotation(null)
        setAdminInstallMediaByField({})
        setAdminInstallPiMedia([])
        toast({
          title: "Saved",
          description: isPartial
            ? "Partial upload saved. Showing Partial Approved — this quotation is not in Approved Installation."
            : "Installation approved — moved to Metering → WCC Pending. Fill Discom name, remarks, and assigned person.",
        })
      } else {
        toast({
          title: "Stage update failed",
          description:
            "Upload may have succeeded, but the installation stage could not be saved. Try again or check the API.",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: apiErrorToUserMessage(error),
        variant: "destructive",
      })
    } finally {
      setAdminInstallSaving(false)
    }
  }

  const confirmApprovalWithPaymentType = async () => {
    if (!approvingQuotationId) return
    const approvedAtIso = parseDateTimeLocalToIso(approvalAtInput)
    if (!approvedAtIso) {
      toast({
        title: "Approve date/time required",
        description: "Choose a valid approve date and time.",
        variant: "destructive",
      })
      return
    }
    const approvingQuotation = quotations.find((q) => q.id === approvingQuotationId)
    const quotationTotal = approvingQuotation ? getQuotationSubtotalValue(approvingQuotation) : 0
    const needsLoanAmount = approvalPaymentType === "loan" || approvalPaymentType === "mix"
    const needsCashAmount = approvalPaymentType === "mix"
    let loanAmount: number | undefined
    let cashAmount: number | undefined
    if (needsLoanAmount) {
      const parsedLoan = parseInrAmountInput(approvalLoanAmount)
      if (parsedLoan == null || parsedLoan <= 0) {
        toast({
          title: "Loan amount required",
          description: "Enter the loan portion in rupees.",
          variant: "destructive",
        })
        return
      }
      loanAmount = parsedLoan
    }
    if (needsCashAmount) {
      const parsedCash = parseInrAmountInput(approvalCashAmount)
      if (parsedCash == null || parsedCash <= 0) {
        toast({
          title: "Cash amount required",
          description: "Enter the cash portion in rupees for Cash + loan.",
          variant: "destructive",
        })
        return
      }
      cashAmount = parsedCash
    }
    if (approvalPaymentType === "mix" && quotationTotal > 0 && loanAmount != null && cashAmount != null) {
      if (loanAmount + cashAmount !== quotationTotal) {
        toast({
          title: "Amounts must match quotation total",
          description: `Loan + cash must equal ${formatQuotationAmountInr(approvingQuotation!)}.`,
          variant: "destructive",
        })
        return
      }
    }
    const needsBank = approvalPaymentType === "loan" || approvalPaymentType === "mix"
    const subsidyTrim = approvalSubsidyCheque.trim()
    const subsidyPayload =
      (approvalPaymentType === "cash" || approvalPaymentType === "mix") && subsidyTrim
        ? { subsidyChequeDetails: subsidyTrim }
        : {}
    const amountPayload =
      loanAmount != null || cashAmount != null ? { loanAmount, cashAmount } : {}
    if (needsBank) {
      const bankName = approvalBankName.trim()
      const ifscRaw = approvalBankIfsc.trim().toUpperCase().replace(/\s/g, "")
      if (!bankName) {
        toast({
          title: "Bank name required",
          description: "Enter the customer’s bank for loan or cash + loan approval.",
          variant: "destructive",
        })
        return
      }
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscRaw)) {
        toast({
          title: "Invalid IFSC",
          description: "Use 11 characters: 4 letters, 0, then 6 letters or digits (e.g. SBIN0001234).",
          variant: "destructive",
        })
        return
      }
      await updateQuotationStatus(approvingQuotationId, "approved", {
        paymentType: approvalPaymentType,
        bankName,
        bankIfsc: ifscRaw,
        ...subsidyPayload,
        ...amountPayload,
        statusApprovedAt: approvedAtIso,
      })
    } else {
      await updateQuotationStatus(approvingQuotationId, "approved", {
        paymentType: approvalPaymentType,
        ...subsidyPayload,
        statusApprovedAt: approvedAtIso,
      })
    }
    setApprovalDialogOpen(false)
    setApprovingQuotationId(null)
    setApprovalBankName("")
    setApprovalBankIfsc("")
    setApprovalSubsidyCheque("")
    setApprovalLoanAmount("")
    setApprovalCashAmount("")
  }

  const resetFileLoginFormFields = () => {
    setFileLoginBankName("")
    setFileLoginBankIfsc("")
    setFileLoginSubsidyCheque("")
  }

  const openFileLoginDialog = (q: Quotation, status: FileLoginStatus) => {
    setFileLoginQuotationId(q.id)
    setFileLoginStatusChoice(status)
    setFileLoginPaymentType((q.filePaymentType as ApprovalPaymentType) || "cash")
    setFileLoginBankName(q.fileBankName || "")
    setFileLoginBankIfsc(q.fileBankIfsc || "")
    setFileLoginSubsidyCheque(q.fileSubsidyChequeDetails || "")
    setFileLoginAtInput(toDateTimeLocalValue(q.fileLoginAt || new Date().toISOString()))
    setFileLoginDialogOpen(true)
  }

  const handleFileLoginSelectChange = async (quotation: Quotation, value: string) => {
    if (value === "unset") {
      setOptimisticFileLoginSelect((prev) => {
        const next = { ...prev }
        delete next[quotation.id]
        return next
      })
      try {
        if (useApi) {
          await api.admin.quotations.updateFileLogin(quotation.id, { reset: true })
          await loadData()
        } else {
          const updated = quotations.map((q) =>
            q.id === quotation.id
              ? {
                  ...q,
                  fileLoginStatus: undefined,
                  filePaymentType: undefined,
                  fileBankName: undefined,
                  fileBankIfsc: undefined,
                  fileSubsidyChequeDetails: undefined,
                  fileLoginAt: undefined,
                }
              : q,
          )
          setQuotations(updated)
          localStorage.setItem("quotations", JSON.stringify(updated))
        }
      } catch (error) {
        console.error(error)
        toast({
          title: "Could not clear file login",
          description: error instanceof ApiError ? error.message : "Try again or update the backend endpoint.",
          variant: "destructive",
        })
      }
      return
    }
    if (value === "already_login" || value === "login_now") {
      setOptimisticFileLoginSelect((prev) => ({ ...prev, [quotation.id]: value }))
      openFileLoginDialog(quotation, value as FileLoginStatus)
    }
  }

  const confirmSaveFileLogin = async () => {
    if (!fileLoginQuotationId) return
    const needsBank = fileLoginPaymentType === "loan" || fileLoginPaymentType === "mix"
    const subsidyTrim = fileLoginSubsidyCheque.trim()
    if (needsBank) {
      const bankName = fileLoginBankName.trim()
      const ifscRaw = fileLoginBankIfsc.trim().toUpperCase().replace(/\s/g, "")
      if (!bankName) {
        toast({
          title: "Bank name required",
          description: "Enter the customer’s bank for loan or cash + loan file login.",
          variant: "destructive",
        })
        return
      }
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscRaw)) {
        toast({
          title: "Invalid IFSC",
          description: "Use 11 characters: 4 letters, 0, then 6 letters or digits (e.g. SBIN0001234).",
          variant: "destructive",
        })
        return
      }
    }
    setIsSavingFileLogin(true)
    try {
      const at = parseDateTimeLocalToIso(fileLoginAtInput)
      if (!at) {
        toast({
          title: "File login date/time required",
          description: "Choose a valid file login date and time.",
          variant: "destructive",
        })
        setIsSavingFileLogin(false)
        return
      }
      if (useApi) {
        const bankName = fileLoginBankName.trim()
        const ifscRaw = fileLoginBankIfsc.trim().toUpperCase().replace(/\s/g, "")
        await api.admin.quotations.updateFileLogin(fileLoginQuotationId, {
          fileLoginStatus: fileLoginStatusChoice,
          filePaymentType: fileLoginPaymentType,
          fileLoginAt: at,
          ...(needsBank ? { bankName, bankIfsc: ifscRaw } : {}),
          ...(subsidyTrim ? { fileSubsidyChequeDetails: subsidyTrim } : {}),
        })
        await loadData()
      } else {
        const bankName = fileLoginBankName.trim()
        const ifscRaw = fileLoginBankIfsc.trim().toUpperCase().replace(/\s/g, "")
        const updated = quotations.map((q) =>
          q.id === fileLoginQuotationId
            ? {
                ...q,
                fileLoginStatus: fileLoginStatusChoice,
                filePaymentType: fileLoginPaymentType,
                fileBankName: needsBank ? bankName : undefined,
                fileBankIfsc: needsBank ? ifscRaw : undefined,
                fileSubsidyChequeDetails: subsidyTrim || undefined,
                fileLoginAt: at,
              }
            : q,
        )
        setQuotations(updated)
        localStorage.setItem("quotations", JSON.stringify(updated))
      }
      setOptimisticFileLoginSelect((prev) => {
        const next = { ...prev }
        delete next[fileLoginQuotationId]
        return next
      })
      setFileLoginDialogOpen(false)
      setFileLoginQuotationId(null)
      resetFileLoginFormFields()
      toast({ title: "File login saved" })
    } catch (error) {
      console.error(error)
      toast({
        title: "Save failed",
        description: error instanceof ApiError ? error.message : "Could not save file login.",
        variant: "destructive",
      })
    } finally {
      setIsSavingFileLogin(false)
    }
  }

  // Update quotation data
  const updateQuotation = async (updatedQuotation: Quotation) => {
    try {
      if (useApi) {
        // Note: Full quotation update endpoint may not exist in API spec
        // For now, we'll update discount if changed
        if (updatedQuotation.discount !== undefined) {
          await api.quotations.updateDiscount(updatedQuotation.id, updatedQuotation.discount)
        }
        await loadData()
      } else {
        // Fallback to localStorage
        const updated = quotations.map((q) => (q.id === updatedQuotation.id ? updatedQuotation : q))
        setQuotations(updated)
        localStorage.setItem("quotations", JSON.stringify(updated))
      }
      setEditDialogOpen(false)
      setEditingQuotation(null)
    } catch (error) {
      console.error("Error updating quotation:", error)
      alert(error instanceof ApiError ? error.message : "Failed to update quotation")
    }
  }

  // Get status color
  const getStatusColor = (status: QuotationStatus | undefined) => {
    switch (status) {
      case "approved":
        return "bg-green-50 border-green-200 hover:bg-green-100"
      case "rejected":
        return "bg-red-50 border-red-200 hover:bg-red-100"
      case "completed":
        return "bg-blue-50 border-blue-200 hover:bg-blue-100"
      default:
        return "bg-yellow-50 border-yellow-200 hover:bg-yellow-100"
    }
  }

  // Get status badge color
  const getStatusBadgeColor = (status: QuotationStatus | undefined) => {
    switch (status) {
      case "approved":
        return "bg-green-500 text-white"
      case "rejected":
        return "bg-red-500 text-white"
      case "completed":
        return "bg-blue-500 text-white"
      default:
        return "bg-yellow-500 text-white"
    }
  }

  // Get system size display
  const getSystemSize = (quotation: Quotation): string => {
    const products = resolveQuotationProductsForKw(quotation)
    if (!products || Object.keys(products).length === 0) {
      return "N/A"
    }

    // For BOTH system type
    if (products.systemType === "both") {
      const dcrSize = products.dcrPanelSize && products.dcrPanelQuantity
        ? calculateSystemSize(products.dcrPanelSize, products.dcrPanelQuantity)
        : null
      const nonDcrSize = products.nonDcrPanelSize && products.nonDcrPanelQuantity
        ? calculateSystemSize(products.nonDcrPanelSize, products.nonDcrPanelQuantity)
        : null
      
      if (dcrSize && nonDcrSize && dcrSize !== "0kW" && nonDcrSize !== "0kW") {
        const dcrKw = Number.parseFloat(dcrSize.replace("kW", ""))
        const nonDcrKw = Number.parseFloat(nonDcrSize.replace("kW", ""))
        if (!Number.isNaN(dcrKw) && !Number.isNaN(nonDcrKw)) {
          return `${dcrKw + nonDcrKw}kW`
        }
      }
      if (dcrSize && dcrSize !== "0kW") return dcrSize
      if (nonDcrSize && nonDcrSize !== "0kW") return nonDcrSize
      // If BOTH type but can't calculate, show system type
      return "BOTH"
    }

    // For CUSTOMIZE system type
    if (products.systemType === "customize" && products.customPanels && products.customPanels.length > 0) {
      const totalKw = products.customPanels.reduce((sum, panel) => {
        if (!panel.size || !panel.quantity) return sum
        try {
          const sizeW = Number.parseInt(panel.size.replace("W", ""))
          if (Number.isNaN(sizeW)) return sum
          return sum + (sizeW * panel.quantity)
        } catch {
          return sum
        }
      }, 0) / 1000
      if (totalKw > 0) return `${totalKw}kW`
      return "CUSTOMIZE"
    }

    // For DCR, NON DCR, or other system types
    if (products.panelSize && products.panelQuantity && products.panelQuantity > 0) {
      const systemSize = calculateSystemSize(products.panelSize, products.panelQuantity)
      if (systemSize !== "0kW") return systemSize
    }

    // Fallback: Show system type if available
    if (products.systemType && products.systemType !== "N/A" && products.systemType.trim() !== "") {
      // Format system type for display
      const systemType = products.systemType.toLowerCase()
      if (systemType === "dcr") return "DCR"
      if (systemType === "non-dcr") return "NON DCR"
      if (systemType === "both") return "BOTH"
      if (systemType === "customize") return "CUSTOMIZE"
      return products.systemType.toUpperCase()
    }

    return "N/A"
  }

  const getAdminInstallProductSpec = (quotation: Quotation) => {
    const q: any = quotation
    const nestedProduct = q.quotationProduct && typeof q.quotationProduct === "object" ? q.quotationProduct : {}
    const merged = {
      ...(q.products && typeof q.products === "object" ? q.products : {}),
      ...nestedProduct,
      // fallback to flattened row fields when products object is missing
      systemType: q.products?.systemType || q.systemType || nestedProduct.systemType,
      panelBrand: q.products?.panelBrand || q.panelBrand || nestedProduct.panelBrand,
      panelSize: q.products?.panelSize || q.panelSize || nestedProduct.panelSize,
      panelQuantity: q.products?.panelQuantity || q.panelQuantity || nestedProduct.panelQuantity,
      inverterBrand: q.products?.inverterBrand || q.inverterBrand || nestedProduct.inverterBrand,
      inverterSize: q.products?.inverterSize || q.inverterSize || nestedProduct.inverterSize,
      phase: q.products?.phase || q.phase || nestedProduct.phase,
      structureType: q.products?.structureType || q.structureType || nestedProduct.structureType,
      structureSize: q.products?.structureSize || q.structureSize || nestedProduct.structureSize,
    }
    return merged
  }

  const getQuotationPhaseText = (quotation: Quotation) => {
    const productSpec = getAdminInstallProductSpec(quotation) as any
    return String(
      productSpec?.phase ||
        (quotation as any)?.phase ||
        (quotation as any)?.quotationProduct?.phase ||
        (quotation as any)?.product?.phase ||
        "N/A",
    )
  }

  const getQuotationAddressText = (quotation: Quotation) => {
    const q: any = quotation
    const rawAddress = q?.customer?.address
    const addressText =
      rawAddress && typeof rawAddress === "object"
        ? [rawAddress.street, rawAddress.city, rawAddress.state, rawAddress.pincode].filter(Boolean).join(", ")
        : String(rawAddress || "")
    return (
      q.visitLocation ||
      q.visit_location ||
      q.location ||
      q.customerAddress ||
      q.customer_address ||
      addressText ||
      "N/A"
    )
  }

  const getExistingFileRef = (documents: Record<string, any>, key: string) => {
    const candidates = [
      documents[`${key}PublicUrl`],
      documents[`${key}publicUrl`],
      documents[`${key}_public_url`],
      documents[key],
      documents[`${key}Url`],
      documents[`${key}_url`],
      documents[`${key}Path`],
      documents[`${key}_path`],
    ]
    const fileRef = candidates.find((value) => typeof value === "string" && value.trim() !== "")
    return fileRef || null
  }

  const mapDocumentsToForm = (documents: Record<string, any>) => ({
    isCompliantSenior: documents.isCompliantSenior === true || documents.isCompliantSenior === "true",
    aadharNumber: documents.aadharNumber || "",
    aadharFront: getExistingFileRef(documents, "aadharFront"),
    aadharBack: getExistingFileRef(documents, "aadharBack"),
    compliantAadharNumber: documents.compliantAadharNumber || "",
    compliantAadharFront: getExistingFileRef(documents, "compliantAadharFront"),
    compliantAadharBack: getExistingFileRef(documents, "compliantAadharBack"),
    compliantContactPhone: documents.compliantContactPhone || "",
    compliantPanNumber: documents.compliantPanNumber || "",
    compliantPanImage: getExistingFileRef(documents, "compliantPanImage"),
    compliantBankAccountNumber: documents.compliantBankAccountNumber || "",
    compliantBankIfsc: documents.compliantBankIfsc || "",
    compliantBankName: documents.compliantBankName || "",
    compliantBankBranch: documents.compliantBankBranch || "",
    compliantBankPassbookImage: getExistingFileRef(documents, "compliantBankPassbookImage"),
    panNumber: documents.panNumber || "",
    panImage: getExistingFileRef(documents, "panImage"),
    electricityKno: documents.electricityKno || "",
    electricityBillImage: getExistingFileRef(documents, "electricityBillImage"),
    bankAccountNumber: documents.bankAccountNumber || "",
    bankIfsc: documents.bankIfsc || "",
    bankName: documents.bankName || "",
    bankBranch: documents.bankBranch || "",
    bankPassbookImage: getExistingFileRef(documents, "bankPassbookImage"),
    geotagRoofPhoto: getExistingFileRef(documents, "geotagRoofPhoto"),
    customerWithHousePhoto: getExistingFileRef(documents, "customerWithHousePhoto"),
    propertyDocumentPdf: getExistingFileRef(documents, "propertyDocumentPdf"),
    contactPhone: documents.phoneNumber || documents.contactPhone || "",
    contactEmail: documents.emailId || documents.contactEmail || "",
  })

  const getUploadedImagePreviews = (form: Record<string, any>) => {
    const previews = [
      { label: "Aadhar Front", value: form.aadharFront },
      { label: "Aadhar Back", value: form.aadharBack },
      { label: "Compliant Aadhar Front", value: form.compliantAadharFront },
      { label: "Compliant Aadhar Back", value: form.compliantAadharBack },
      { label: "PAN Image", value: form.panImage },
      { label: "Compliant PAN Image", value: form.compliantPanImage },
      { label: "Electricity Bill PDF", value: form.electricityBillImage },
      { label: "Bank Passbook Image", value: form.bankPassbookImage },
      { label: "Geotag Roof Photo", value: form.geotagRoofPhoto },
      { label: "Customer Photo with House", value: form.customerWithHousePhoto },
      { label: "Property Documents (PDF)", value: form.propertyDocumentPdf },
      { label: "Compliant Bank Passbook", value: form.compliantBankPassbookImage },
    ]

    return previews.filter((item) => typeof item.value === "string" && item.value.trim() !== "")
  }

  const openDocumentPreview = (value: unknown) => {
    openQuotationDocumentPreview(value, documentsQuotation?.id)
  }

  const openDocumentsDialog = async (quotation: Quotation) => {
    try {
      let quotationWithDocuments: any = quotation
      if (useApi) {
        const fullQuotation = await api.quotations.getById(quotation.id)
        quotationWithDocuments = { ...quotation, ...fullQuotation }
      }

      const documents =
        quotationWithDocuments?.documents ||
        quotationWithDocuments?.documentDetails ||
        quotationWithDocuments?.quotationDocuments ||
        {}

      const contactPhoneFallback =
        quotationWithDocuments?.documents?.phoneNumber ||
        quotationWithDocuments?.documents?.contactPhone ||
        quotationWithDocuments?.documents?.phone_number ||
        quotationWithDocuments?.customer?.mobile ||
        quotationWithDocuments?.phoneNumber ||
        quotationWithDocuments?.phone_number ||
        ""
      const contactEmailFallback =
        quotationWithDocuments?.documents?.emailId ||
        quotationWithDocuments?.documents?.contactEmail ||
        quotationWithDocuments?.documents?.email_id ||
        quotationWithDocuments?.customer?.email ||
        quotationWithDocuments?.emailId ||
        quotationWithDocuments?.email_id ||
        ""
      const electricityKnoFallback =
        quotationWithDocuments?.documents?.electricityKno ||
        quotationWithDocuments?.electricityKno ||
        quotationWithDocuments?.electricity_kno ||
        ""

      const mapped = mapDocumentsToForm(documents)

      setDocumentsFormById((prev) => ({
        ...prev,
        [quotation.id]: {
          ...getDocumentsForm(quotation.id),
          ...mapped,
          // Fallback prefill for B2C/inventory flows where backend may not echo KYC docs payload
          contactPhone: String((mapped.contactPhone || contactPhoneFallback) || ""),
          contactEmail: String((mapped.contactEmail || contactEmailFallback) || ""),
          electricityKno: String((mapped.electricityKno || documents.electricityKno || electricityKnoFallback) || ""),
          ...(prev[quotation.id] || {}),
        },
      }))
      setDocumentsQuotation(quotationWithDocuments)
      setDocumentsDialogOpen(true)
    } catch (error) {
      console.error("Error loading documents:", error)
      toast({
        title: "Could not load existing documents",
        description: "You can still upload new files.",
        variant: "destructive",
      })
      setDocumentsQuotation(quotation)
      setDocumentsDialogOpen(true)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Admin Panel</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">View and manage all system data</p>
        </div>

        <Tabs value={activeTab} onValueChange={onAdminDesktopTabChange} className="space-y-6">
          <div className="md:hidden">
            <div className="text-xs font-medium text-muted-foreground mb-2">Select Section</div>
            <Select value={adminMobileNavValue} onValueChange={onAdminMobileNavChange}>
              <SelectTrigger className="w-full h-10 rounded-xl border-border/70 bg-card shadow-sm">
                <SelectValue placeholder="Select section" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="overview">Overview</SelectItem>
                <SelectItem value="customer-journey">Customer Journey</SelectItem>
                <SelectItem value="calling-reports">Calling Reports</SelectItem>
                <SelectItem value="visitor-reports">Visitor Reports</SelectItem>
                <SelectItem value="quotations__all">Quotations (all)</SelectItem>
                <SelectItem value="payments">Accounts</SelectItem>
                <SelectItem value="quotations__installation">Installation</SelectItem>
                <SelectItem value="quotations__metering">Metering</SelectItem>
                <SelectItem value="quotations__confirmation">Final confirmation</SelectItem>
                <SelectItem value="dealers">Users</SelectItem>
                <SelectItem value="customers">Customers</SelectItem>
                <SelectItem value="catalog__products">Catalog — Products</SelectItem>
                <SelectItem value="catalog__pricing">Catalog — Pricing</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="hidden md:block w-full pb-1">
            <TabsList className="flex h-auto min-h-11 w-full flex-wrap gap-1 rounded-xl border border-border/70 bg-muted/30 p-1 shadow-sm [&_[data-slot=tabs-trigger]]:h-9 [&_[data-slot=tabs-trigger]]:shrink-0 [&_[data-slot=tabs-trigger]]:px-2 [&_[data-slot=tabs-trigger]]:text-sm [&_[data-slot=tabs-trigger]]:font-medium [&_[data-slot=tabs-trigger]]:text-muted-foreground [&_[data-slot=tabs-trigger][data-state=active]]:bg-background [&_[data-slot=tabs-trigger][data-state=active]]:text-foreground [&_[data-slot=tabs-trigger][data-state=active]]:border-border/80">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="customer-journey">Customer Journey</TabsTrigger>
            <TabsTrigger value="calling-reports">Calling Reports</TabsTrigger>
            <TabsTrigger value="visitor-reports">Visitor Reports</TabsTrigger>
            <TabsTrigger
              value="quotations"
              className={quotationSubTabTriggerClass("all")}
              onPointerDown={() => {
                startTransition(() => setOperationalTab("all"))
              }}
            >
              Quotations
            </TabsTrigger>
            <TabsTrigger value="payments">Accounts</TabsTrigger>
            <TabsTrigger
              value="quotations"
              className={quotationSubTabTriggerClass("installation")}
              onPointerDown={() => {
                startTransition(() => setOperationalTab("installation"))
              }}
            >
              Installation
            </TabsTrigger>
            <TabsTrigger
              value="quotations"
              className={quotationSubTabTriggerClass("metering")}
              onPointerDown={() => {
                startTransition(() => setOperationalTab("metering"))
              }}
            >
              Metering
            </TabsTrigger>
            <TabsTrigger
              value="quotations"
              className={quotationSubTabTriggerClass("confirmation")}
              onPointerDown={() => {
                startTransition(() => setOperationalTab("confirmation"))
              }}
            >
              Final confirmation
            </TabsTrigger>
            <TabsTrigger value="dealers">Users</TabsTrigger>
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
            </TabsList>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {adminLoadError ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="font-medium text-destructive">Could not load data from API</p>
                  <p className="text-sm text-muted-foreground mt-1">{adminLoadError}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void loadData(++adminLoadRequestRef.current)}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Retry
                </Button>
              </div>
            ) : null}
            {isOverviewInitialLoading ? (
              <p className="text-sm text-muted-foreground">Loading overview from API…</p>
            ) : isOverviewDetailsLoading ? (
              <p className="text-sm text-muted-foreground">Refreshing quotation details…</p>
            ) : null}
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Quotations</CardTitle>
                  <FileText className="w-5 h-5 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {isOverviewInitialLoading ? "—" : totalQuotations.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">All time</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
                  <IndianRupee className="w-5 h-5 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {isOverviewInitialLoading ? "—" : formatOverviewRevenueLakh(totalRevenue)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Approved quotations · all time</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">This Month</CardTitle>
                  <TrendingUp className="w-5 h-5 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {isOverviewInitialLoading ? "—" : formatOverviewRevenueLakh(thisMonthRevenue)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isOverviewInitialLoading
                      ? "Loading approved/capacity…"
                      : `${thisMonthApprovedCountDisplay} approved · ${formatOverviewKw(thisMonthTotalKw)} capacity`}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">This Month Quotation</CardTitle>
                  <Calendar className="w-5 h-5 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {isOverviewInitialLoading ? "—" : thisMonthQuotationCount.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Created this month</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Approved Customers (Month)</CardTitle>
                  <UserCheck className="w-5 h-5 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{isOverviewInitialLoading ? "—" : thisMonthApprovedCustomers}</div>
                  <p className="text-xs text-muted-foreground mt-1">Unique customers approved this month</p>
                </CardContent>
              </Card>
            </div>

            {/* Top Dealers  */}
            <Card>
              <CardHeader className="space-y-4">
                <div className="space-y-1">
                  <CardTitle>Dealers by Revenue</CardTitle>
                  <CardDescription>
                    Ranked by revenue from quotations approved in the selected period (approval date only — not
                    creation date). Defaults to this month.
                  </CardDescription>
                  <p className="text-sm font-semibold text-foreground pt-1">
                    Total revenue (filtered):{" "}
                    <span className="text-primary">{formatOverviewRevenueLakh(filteredOverviewTotalRevenue)}</span>
                    <span className="text-muted-foreground font-normal mx-2">·</span>
                    Total capacity (filtered):{" "}
                    <span className="text-primary">{formatOverviewKw(filteredOverviewTotalKw)}</span>
                    <span className="text-muted-foreground font-normal text-xs ml-1">
                      ({overviewPeriodApprovedQuotations.length} approved quotation
                      {overviewPeriodApprovedQuotations.length === 1 ? "" : "s"})
                    </span>
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select
                    value={topDealersDateFilter}
                    onValueChange={(value) => setTopDealersDateFilter(value as JourneyDateRangeFilter)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Date range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="this_month">This month</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="yesterday">Yesterday</SelectItem>
                      <SelectItem value="week">This week</SelectItem>
                      <SelectItem value="last_month">Last month</SelectItem>
                      <SelectItem value="year">This year</SelectItem>
                      <SelectItem value="custom">Custom date range</SelectItem>
                      <SelectItem value="all">All time</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={topDealersDealerFilter} onValueChange={setTopDealersDealerFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by dealer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Dealers</SelectItem>
                      {activeDealers.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.firstName} {d.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {topDealersDateFilter === "custom" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">From</Label>
                      <Input
                        type="date"
                        value={topDealersCustomFromDate}
                        onChange={(e) => setTopDealersCustomFromDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">To</Label>
                      <Input
                        type="date"
                        value={topDealersCustomToDate}
                        onChange={(e) => setTopDealersCustomToDate(e.target.value)}
                      />
                    </div>
                  </div>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-6">
                <DealersByRevenueCharts stats={dealersWithPeriodActivity} />
                {dealerStats.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No active dealers match the selected filter.
                  </p>
                ) : dealersWithPeriodActivity.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg">
                    No approved quotations in this period for the selected dealers.
                  </p>
                ) : (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-3">Dealer breakdown</p>
                    <div
                      className="native-scroll-list space-y-4 overflow-y-auto overscroll-y-contain pr-1"
                      style={{
                        maxHeight: `calc(${DEALERS_BY_REVENUE_VISIBLE_ROWS} * (5.5rem + 1rem) - 1rem)`,
                      }}
                    >
                      {[...dealersWithPeriodActivity]
                        .sort((a, b) => b.revenue - a.revenue || b.quotationCount - a.quotationCount)
                        .map((stat) => (
                          <div
                            key={stat.dealer.id}
                            className="flex items-center justify-between p-4 border rounded-lg shrink-0"
                          >
                            <div>
                              <p className="font-semibold">
                                {stat.dealer.firstName} {stat.dealer.lastName}
                              </p>
                              <p className="text-sm text-muted-foreground">{stat.dealer.email}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">{formatOverviewRevenueLakh(stat.revenue)}</p>
                              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                                {formatOverviewKw(stat.totalKw)}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {stat.quotationCount} approved quotation
                                {stat.quotationCount === 1 ? "" : "s"}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <CustomerJourneyPanel
              quotations={quotations}
              title="Customer Journey (Current Hold)"
              description="Shows who currently holds each customer file in the workflow."
              showDealerDetails
              resolveDealerDetails={(quotation) => ({
                name: getDealerName(quotation.dealerId, quotation),
                mobile: getDealerMobile(quotation.dealerId, quotation),
              })}
            />

            <AdminProductNeededPanel
              quotations={quotations}
              dealers={activeDealers}
              getDealerName={getDealerName}
              useApi={useApi}
              enabled={activeTab === "overview"}
              refreshToken={productNeededRefreshToken}
            />
          </TabsContent>

          <TabsContent value="customer-journey" className="space-y-4">
            <FullCustomerJourneyPanel
              quotations={quotations}
              callingActions={journeyCallingActions}
              title="Customer Journey"
              description="Stores and shows the full path: Calling Data → Calling Action → Quotation → Admin Approval → Installation → Metering → Final Confirmation. Expand a row for the timeline. Loads 20 rows at a time — scroll for more. Defaults to Today."
              emptyMessage="No journey records yet for this date filter. Try All time, or wait for calling actions and quotations."
              showDealerDetails
              dealers={activeDealers.map((d) => ({
                id: d.id,
                label: `${d.firstName || ""} ${d.lastName || ""}`.trim() || d.username || d.id,
              }))}
              isLoading={isJourneyCallingActionsLoading && journeyCallingActions.length === 0}
              onSearchChange={handleJourneySearchChange}
              onDateRangeChange={handleJourneyDateRangeChange}
              initialDateFilter="today"
              resolveDealerDetails={(quotation, rowDealerId) => {
                const dealerId = quotation?.dealerId || rowDealerId || ""
                return {
                  name: getDealerName(dealerId, quotation),
                  mobile: getDealerMobile(dealerId, quotation),
                }
              }}
            />
          </TabsContent>

          <TabsContent value="calling-reports" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Employee Calling Actions</CardTitle>
                <CardDescription>
                  Track actions by employee (dealer) and date: daily, weekly, monthly, last month, custom range, or all
                  time. Custom range uses each action&apos;s timestamp.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Select
                    value={callingRange}
                    onValueChange={(value: "daily" | "weekly" | "monthly" | "last_month" | "custom" | "all") =>
                      setCallingRange(value)
                    }
                  >
                    <SelectTrigger>
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

                  <Select value={callingActionDealerFilter} onValueChange={setCallingActionDealerFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by employee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Employees</SelectItem>
                      {activeDealers.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.firstName} {d.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {callingRange === "custom" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">From</Label>
                      <Input
                        type="date"
                        value={callingCustomFromDate}
                        onChange={(e) => setCallingCustomFromDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">To</Label>
                      <Input
                        type="date"
                        value={callingCustomToDate}
                        onChange={(e) => setCallingCustomToDate(e.target.value)}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Card className="border-border/60">
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">Total Calls</p>
                      <p className="text-xl font-semibold">
                        {isCallingReportsInitialLoading ? "—" : filteredCallingActions.length}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-slate-300 bg-slate-50/80">
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">Not Connected</p>
                      <p className="text-xl font-semibold">
                        {isCallingReportsInitialLoading ? "—" : connectionSummary.notConnected}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-emerald-200 bg-emerald-50/40">
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">Connected</p>
                      <p className="text-xl font-semibold">
                        {isCallingReportsInitialLoading ? "—" : connectionSummary.connected}
                      </p>
                    </CardContent>
                  </Card>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Card className="border-rose-100 bg-rose-50/20">
                    <CardContent className="pt-3 pb-3">
                      <p className="text-xs text-muted-foreground">Connected — Not Interested</p>
                      <p className="text-lg font-semibold">
                        {isCallingReportsInitialLoading ? "—" : connectedOutcomeSummary.notInterested}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-emerald-100 bg-emerald-50/20">
                    <CardContent className="pt-3 pb-3">
                      <p className="text-xs text-muted-foreground">Connected — Interested</p>
                      <p className="text-lg font-semibold">
                        {isCallingReportsInitialLoading ? "—" : connectedOutcomeSummary.interested}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-blue-100 bg-blue-50/20">
                    <CardContent className="pt-3 pb-3">
                      <p className="text-xs text-muted-foreground">Connected — Follow Up</p>
                      <p className="text-lg font-semibold">
                        {isCallingReportsInitialLoading ? "—" : connectedOutcomeSummary.followUp}
                      </p>
                    </CardContent>
                  </Card>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Select
                    value={callingConnectionFilter}
                    onValueChange={(value: "all" | "connected" | "not_connected") => setCallingConnectionFilter(value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Connection" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All (Connected + Not Connected)</SelectItem>
                      <SelectItem value="connected">Connected only</SelectItem>
                      <SelectItem value="not_connected">Not Connected only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {isCallingReportsInitialLoading ? (
                  <p className="text-sm text-muted-foreground">Loading calling actions from API…</p>
                ) : callingActionsUnavailable ? (
                  <p className="text-sm text-muted-foreground">
                    Calling actions endpoint is not available on backend yet. Once enabled, all employee actions will appear here.
                  </p>
                ) : displayCallingActions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No calling actions found for selected filters.</p>
                ) : (
                  <div className="space-y-2">
                    {displayCallingActions.slice(0, 300).map((item) => {
                      const parsed = resolveCallingActionFields(item)
                      const connectionKind = classifyCallingConnection(item)
                      const summaryBucket = classifyCallingActionSummaryBucket(item)
                      return (
                      <div key={item.id} className="rounded-md border border-border/70 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm break-words">{item.dealerName || "Unknown Employee"}</p>
                            <p className="text-xs text-muted-foreground break-all">Lead: {item.leadId || "N/A"}</p>
                            <p className="text-xs text-muted-foreground break-words">Customer: {item.customerName || "N/A"}</p>
                            <p className="text-xs text-muted-foreground break-all">Phone: {item.customerMobile || "N/A"}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            <Badge variant="outline" className={getCallingConnectionBadgeClass(connectionKind)}>
                              {CALLING_CONNECTION_LABELS[connectionKind]}
                            </Badge>
                            {connectionKind === "connected" ? (
                              <Badge variant="outline" className={getCallingActionSummaryBadgeClass(summaryBucket)}>
                                {CALLING_SUMMARY_BUCKET_LABELS[summaryBucket]}
                              </Badge>
                            ) : null}
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {item.actionAt
                                ? parseCallingActionAt(item.actionAt)?.toLocaleString("en-IN") || item.actionAt
                                : "N/A"}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 space-y-1 text-sm">
                          <p className="break-words">
                            <span className="font-medium">Status:</span>{" "}
                            {parsed.status || item.action || "N/A"}
                          </p>
                          {parsed.remark ? (
                            <p className="break-words">
                              <span className="font-medium">Remark:</span> {parsed.remark}
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

          <TabsContent value="visitor-reports" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Visitor Reports</CardTitle>
                <CardDescription>
                  All site visits assigned to visitors with live status. Filter by visitor, status, date range, or search.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  <Select
                    value={visitorReportRange}
                    onValueChange={(value: "daily" | "weekly" | "monthly" | "last_month" | "custom" | "all") =>
                      setVisitorReportRange(value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Date range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Today</SelectItem>
                      <SelectItem value="weekly">This week</SelectItem>
                      <SelectItem value="monthly">This month</SelectItem>
                      <SelectItem value="last_month">Last month</SelectItem>
                      <SelectItem value="custom">Custom date range</SelectItem>
                      <SelectItem value="all">All time</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={visitorReportVisitorFilter} onValueChange={setVisitorReportVisitorFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by visitor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All visitors</SelectItem>
                      {visitorAccessUsers.map((visitor) => (
                        <SelectItem key={visitor.entityId} value={visitor.entityId}>
                          {visitor.firstName} {visitor.lastName}
                          {visitor.isActive === false ? " (inactive)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={visitorReportStatusFilter}
                    onValueChange={(value) => setVisitorReportStatusFilter(value as VisitStatusFilter)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      {VISIT_STATUS_FILTER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search customer, quotation, location..."
                      value={visitorReportSearch}
                      onChange={(e) => setVisitorReportSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                {visitorReportRange === "custom" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">From</Label>
                      <Input
                        type="date"
                        value={visitorReportCustomFromDate}
                        onChange={(e) => setVisitorReportCustomFromDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">To</Label>
                      <Input
                        type="date"
                        value={visitorReportCustomToDate}
                        onChange={(e) => setVisitorReportCustomToDate(e.target.value)}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
                  <Card className="border-border/60">
                    <CardContent className="pt-4 pb-4">
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="text-xl font-semibold">{visitorReportSummary.total}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-yellow-200 bg-yellow-50/30">
                    <CardContent className="pt-4 pb-4">
                      <p className="text-xs text-muted-foreground">Pending</p>
                      <p className="text-xl font-semibold">{visitorReportSummary.pending}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-green-200 bg-green-50/30">
                    <CardContent className="pt-4 pb-4">
                      <p className="text-xs text-muted-foreground">Approved</p>
                      <p className="text-xl font-semibold">{visitorReportSummary.approved}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-blue-200 bg-blue-50/30">
                    <CardContent className="pt-4 pb-4">
                      <p className="text-xs text-muted-foreground">Completed</p>
                      <p className="text-xl font-semibold">{visitorReportSummary.completed}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-orange-200 bg-orange-50/30">
                    <CardContent className="pt-4 pb-4">
                      <p className="text-xs text-muted-foreground">Incomplete</p>
                      <p className="text-xl font-semibold">{visitorReportSummary.incomplete}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-purple-200 bg-purple-50/30">
                    <CardContent className="pt-4 pb-4">
                      <p className="text-xs text-muted-foreground">Rescheduled</p>
                      <p className="text-xl font-semibold">{visitorReportSummary.rescheduled}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-rose-200 bg-rose-50/30">
                    <CardContent className="pt-4 pb-4">
                      <p className="text-xs text-muted-foreground">Rejected</p>
                      <p className="text-xl font-semibold">{visitorReportSummary.rejected}</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    {filteredVisitorReportTotal} visit{filteredVisitorReportTotal === 1 ? "" : "s"} match filters
                    {visitorReportLoadSource === "quotations"
                      ? ` (${visitorReportRows.length} loaded from all quotations)`
                      : null}
                    {visitorReportRefreshing ? " — updating…" : null}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        openVisitorExcelColumnPicker()
                      }}
                      disabled={filteredVisitorReportTotal === 0 || visitorReportLoading}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download Excel
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void loadVisitorReports()}
                      disabled={visitorReportLoading || visitorReportRefreshing}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Refresh
                    </Button>
                  </div>
                </div>

                {visitorReportLoading && visitorReportRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Loading visitor reports from all visitors...</p>
                ) : visitorReportUnavailable ? (
                  <p className="text-sm text-muted-foreground">
                    Could not load visits. Enable{" "}
                    <code className="text-xs">GET /admin/visits</code>, <code className="text-xs">GET /visits</code>{" "}
                    (admin), or <code className="text-xs">GET /quotations/&#123;id&#125;/visits</code> for quotation
                    lookups.
                  </p>
                ) : filteredVisitorReportTotal === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No visits found for selected filters.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {visibleVisitorReportRows.map((row) => (
                      <div key={row.id} className="rounded-md border border-border/70 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-sm break-words">{row.customerName}</p>
                              <Badge className={getVisitStatusBadgeClass(row.status)}>
                                {getVisitStatusLabel(row.status)}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground break-all">Quotation: {row.quotationId || "N/A"}</p>
                            <p className="text-xs text-muted-foreground break-words">
                              Visitor: {row.visitorNames}
                            </p>
                            <p className="text-xs text-muted-foreground break-words">Agent: {row.dealerName}</p>
                            {row.customerMobile ? (
                              <p className="text-xs text-muted-foreground break-all">Customer mobile: {row.customerMobile}</p>
                            ) : null}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <div className="text-xs text-muted-foreground text-right space-y-1">
                              <div className="flex items-center justify-end gap-1">
                                <Calendar className="w-3.5 h-3.5" />
                                <span>{row.date || "N/A"}</span>
                              </div>
                              {row.time ? (
                                <div className="flex items-center justify-end gap-1">
                                  <Clock3 className="w-3.5 h-3.5" />
                                  <span>{row.time}</span>
                                </div>
                              ) : null}
                            </div>
                            {row.status === "completed" ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8"
                                onClick={() => {
                                  setVisitorReportDetailsRow(row)
                                  setVisitorReportDetailsOpen(true)
                                }}
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                Details
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        {row.location ? (
                          <p className="mt-2 text-sm break-words flex items-start gap-1.5">
                            <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                            <span>{row.location}</span>
                          </p>
                        ) : null}
                        {row.rejectionReason ? (
                          <p className="mt-2 text-sm break-words text-muted-foreground">
                            <span className="font-medium text-foreground">Reason:</span> {row.rejectionReason}
                          </p>
                        ) : null}
                        {row.notes ? (
                          <p className="mt-1 text-sm break-words text-muted-foreground">
                            <span className="font-medium text-foreground">Notes:</span> {row.notes}
                          </p>
                        ) : null}
                      </div>
                    ))}
                    <IncrementalListSentinel
                      sentinelRef={visitorReportSentinelRef}
                      visibleCount={visibleVisitorReportCount}
                      totalCount={filteredVisitorReportTotal}
                      hasMore={visitorReportHasMore}
                      onLoadMore={loadMoreVisitorReports}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
            <AdminVisitDetailsDialog
              row={visitorReportDetailsRow}
              open={visitorReportDetailsOpen}
              onOpenChange={setVisitorReportDetailsOpen}
              useApi={useApi}
            />
          </TabsContent>

          {/* All Quotations Tab */}
          <TabsContent value="quotations" className="space-y-4">
            <Card>
              <Dialog open={quotationFiltersOpen} onOpenChange={setQuotationFiltersOpen}>
                <DialogContent className="sm:max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Quotation Filters</DialogTitle>
                    <DialogDescription>
                      Filter by dealer, city, time, status, file login, payment type, bank details, and install overdue.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <Select value={filterDealer} onValueChange={setFilterDealer}>
                      <SelectTrigger>
                        <SelectValue placeholder="Filter by dealer" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Dealers</SelectItem>
                        {activeDealers.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.firstName} {d.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <CityMultiSelectFilter
                      value={filterCities}
                      onChange={setFilterCities}
                      className="w-full"
                    />
                    <Select value={filterMonth} onValueChange={setFilterMonth}>
                      <SelectTrigger>
                        <SelectValue placeholder="Filter by month" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Time</SelectItem>
                        <SelectItem value="current">Current Month</SelectItem>
                        <SelectItem value="previous">Previous Month</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger>
                        <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={filterFileLogin} onValueChange={setFilterFileLogin}>
                      <SelectTrigger>
                        <SelectValue placeholder="Filter by file login" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All File Login</SelectItem>
                        <SelectItem value="unset">Not set</SelectItem>
                        <SelectItem value="already_login">Already logged in</SelectItem>
                        <SelectItem value="login_now">Login now</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={filterPaymentType} onValueChange={setFilterPaymentType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Filter by payment type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Payment Type</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="loan">Loan</SelectItem>
                        <SelectItem value="mix">Cash + loan</SelectItem>
                        <SelectItem value="unknown">Not set</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={filterBankDetails} onValueChange={setFilterBankDetails}>
                      <SelectTrigger>
                        <SelectValue placeholder="Filter by bank details" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Bank Details</SelectItem>
                        <SelectItem value="with_bank">With Bank</SelectItem>
                        <SelectItem value="without_bank">Without Bank</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={filterInstallOverdue}
                      onValueChange={(v) => setFilterInstallOverdue(v as InstallOverdueFilter)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Filter by date overdue" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Dates</SelectItem>
                        <SelectItem value="lt5">Less than 5 days</SelectItem>
                        <SelectItem value="gte5">5 equal and more</SelectItem>
                        <SelectItem value="gte10">10 equal and more</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setFilterDealer("all")
                        setFilterCities([])
                        setFilterMonth("all")
                        setFilterStatus("all")
                        setFilterFileLogin("all")
                        setFilterPaymentType("all")
                        setFilterBankDetails("all")
                        setFilterInstallOverdue("all")
                      }}
                    >
                      Reset
                    </Button>
                    <Button type="button" onClick={() => setQuotationFiltersOpen(false)}>
                      Apply
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <CardHeader>
                {operationalTab === "all" ? (
                  <div className="mb-3 w-full rounded-lg border border-border/70 bg-muted/30 p-1 flex flex-wrap gap-1">
                    {(
                      [
                        { key: "all" as const, label: "All quotations" },
                        {
                          key: "metering_send" as const,
                          label: `Send to Metering (${quotationsMeteringActionCounts.send})`,
                        },
                        {
                          key: "metering_retrieve" as const,
                          label: `In Metering — Retrieve (${quotationsMeteringActionCounts.retrieve})`,
                        },
                      ] as const
                    ).map((item) => (
                      <Button
                        key={item.key}
                        type="button"
                        size="sm"
                        variant={operationalProgressTab === item.key ? "default" : "ghost"}
                        className={cn("h-8", operationalProgressTab === item.key && "shadow-sm")}
                        onClick={() => setOperationalProgressTab(item.key)}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>
                ) : (
                  operationalTab === "metering" ? (
                    <div className="mb-3 flex flex-col lg:flex-row gap-2 lg:items-stretch">
                      <div className="flex-1 min-w-0 rounded-lg border-2 border-sky-300/80 bg-sky-50/40 p-1.5">
                        <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-sky-800/80">
                          Meter process
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {(
                            [
                              {
                                key: "pending" as const,
                                label: `Meter Pending (${meteringProcessingQuotations.length})`,
                              },
                              {
                                key: "done" as const,
                                label: `Meter in Discom (${meteringApprovedQuotations.length})`,
                              },
                              {
                                key: "wcc" as const,
                                label: `WCC Pending (${meteringWccPendingQuotations.length})`,
                              },
                              {
                                key: "meter_install" as const,
                                label: `Meter Installation Pending (${meteringMeterInstallQuotations.length})`,
                              },
                              {
                                key: "mco" as const,
                                label: `Final Step (${meteringMcoQuotations.length})`,
                              },
                            ] as const
                          ).map((item) => (
                            <Button
                              key={item.key}
                              type="button"
                              size="sm"
                              variant={operationalProgressTab === item.key ? "default" : "ghost"}
                              className={cn("h-8", operationalProgressTab === item.key && "shadow-sm")}
                              onClick={() => setOperationalProgressTab(item.key)}
                            >
                              {item.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                      {/* Bank process UI temporarily commented out
                      <div className="lg:w-auto shrink-0 rounded-lg border-2 border-amber-300/80 bg-amber-50/40 p-1.5">
                        <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-900/80">
                          Bank process
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {(
                            [
                              {
                                key: "bank_process" as const,
                                label: `Bank Process (${meteringBankProcessQuotations.length})`,
                              },
                              {
                                key: "pending_payment" as const,
                                label: `Pending Payment (${meteringPendingPaymentQuotations.length})`,
                              },
                            ] as const
                          ).map((item) => (
                            <Button
                              key={item.key}
                              type="button"
                              size="sm"
                              variant={operationalProgressTab === item.key ? "default" : "ghost"}
                              className={cn("h-8", operationalProgressTab === item.key && "shadow-sm")}
                              onClick={() => setOperationalProgressTab(item.key)}
                            >
                              {item.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                      */}
                    </div>
                  ) : (
                  <div className="mb-3 w-full rounded-lg border border-border/70 bg-muted/30 p-1 flex flex-wrap gap-1">
                    {(operationalTab === "installation"
                        ? ([
                            { key: "all" as const, label: "All" },
                            { key: "pending" as const, label: "Pending Installation" },
                            { key: "partial" as const, label: "Partial Approved" },
                            { key: "done" as const, label: "Approved Installation" },
                          ] as const)
                        : ([
                            { key: "all" as const, label: "All" },
                            {
                              key: "dcr" as const,
                              label: `DCR Generation (${confirmationDcrQuotations.length})`,
                            },
                            { key: "pending" as const, label: "Final process" },
                            { key: "done" as const, label: "Done" },
                          ] as const)
                    ).map((item) => (
                      <Button
                        key={item.key}
                        type="button"
                        size="sm"
                        variant={operationalProgressTab === item.key ? "default" : "ghost"}
                        className={cn("h-8", operationalProgressTab === item.key && "shadow-sm")}
                        onClick={() => setOperationalProgressTab(item.key)}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>
                  )
                )}
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
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => setQuotationFiltersOpen(true)}
                  >
                    <SlidersHorizontal className="w-4 h-4 mr-2" />
                    Filters
                    {activeQuotationFilterCount > 0 ? ` (${activeQuotationFilterCount})` : ""}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      openQuotationExcelColumnPicker()
                    }}
                    disabled={activeQuotationList.length === 0}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download (
                    {activeQuotationList.length}
                    )
                  </Button>
                  {operationalTab === "installation" ? (
                    <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setInstallationTeamsDialogOpen(true)}>
                      <Users className="w-4 h-4 mr-2" />
                      Installation teams
                    </Button>
                  ) : null}
                </div>
                {(operationalTab === "metering" &&
                  operationalProgressTab !== "wcc" &&
                  operationalProgressTab !== "meter_install" &&
                  operationalProgressTab !== "bank_process" &&
                  operationalProgressTab !== "pending_payment") ||
                (operationalTab === "installation" && operationalProgressTab !== "done") ? (
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
                    ).map((item) => {
                      const isActive = filterInstallOverdue === item.key
                      return (
                        <Button
                          key={item.key}
                          type="button"
                          size="sm"
                          variant={isActive ? "default" : "outline"}
                          aria-pressed={isActive}
                          className={cn("h-7 text-xs", isActive && item.activeClass)}
                          onClick={() =>
                            setFilterInstallOverdue((prev) => (prev === item.key ? "all" : item.key))
                          }
                        >
                          {item.label}
                        </Button>
                      )
                    })}
                    {filterInstallOverdue !== "all" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground"
                        onClick={() => setFilterInstallOverdue("all")}
                      >
                        Clear ({activeQuotationList.length})
                      </Button>
                    ) : (
                      <span className="text-[10px] text-muted-foreground ml-1">
                        {operationalTab === "metering"
                          ? "Based on metering Date column"
                          : "Based on Install date"}
                      </span>
                    )}
                  </div>
                ) : null}
              </CardHeader>
              <Dialog open={installationTeamsDialogOpen} onOpenChange={setInstallationTeamsDialogOpen}>
                <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Installation teams</DialogTitle>
                    <DialogDescription>
                      Create team logins and assign each installation row to a team. Teams sign in at{" "}
                      <span className="font-mono text-xs">/installation-team-login</span> and only see jobs assigned to them.
                      Admins and the main admin account continue to see all installations here.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div className="rounded-md border border-border p-3 space-y-2">
                      <p className="text-xs font-semibold">Create team</p>
                      <div className="space-y-2">
                        <Label className="text-xs">Team name</Label>
                        <Input
                          value={installationTeamForm.name}
                          onChange={(e) => setInstallationTeamForm((p) => ({ ...p, name: e.target.value }))}
                          placeholder="e.g. North Zone Crew"
                        />
                        <Label className="text-xs">Login username</Label>
                        <Input
                          value={installationTeamForm.username}
                          onChange={(e) => setInstallationTeamForm((p) => ({ ...p, username: e.target.value }))}
                          placeholder="Unique login id"
                        />
                        <Label className="text-xs">Password</Label>
                        <Input
                          type="password"
                          value={installationTeamForm.password}
                          onChange={(e) => setInstallationTeamForm((p) => ({ ...p, password: e.target.value }))}
                          placeholder="Team password"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void handleCreateInstallationTeam()}
                          disabled={installationTeamSubmitting}
                        >
                          {installationTeamSubmitting ? "Creating..." : "Create team"}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2" key={installationTeamsRefresh}>
                      <p className="text-xs font-semibold">Existing teams</p>
                      {installationTeams.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No teams yet.</p>
                      ) : (
                        installationTeams.map((t) => (
                          <div key={t.id} className="space-y-2 rounded-md border border-border px-3 py-2 text-sm">
                            <div>
                              <p className="font-medium">{t.name}</p>
                              <p className="text-xs text-muted-foreground">@{t.username}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Input
                                type="password"
                                value={installationTeamResetPasswordById[t.id] || ""}
                                onChange={(e) =>
                                  setInstallationTeamResetPasswordById((prev) => ({
                                    ...prev,
                                    [t.id]: e.target.value,
                                  }))
                                }
                                placeholder="New password"
                                className="h-8 text-xs"
                              />
                              <Button type="button" variant="outline" size="sm" onClick={() => void handleResetInstallationTeamPassword(t)}>
                                Reset
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => void handleDeleteInstallationTeam(t)}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <CardContent>
                {operationalTab === "metering" ? (
                  (() => {
                    const meteringStageBadgeClass = (stage: "processing" | "approved" | "meter_install" | "mco" | null) => {
                      if (stage === "processing") return "border-amber-300/80 bg-amber-50 text-amber-800"
                      if (stage === "approved") return "border-sky-300/80 bg-sky-50 text-sky-800"
                      if (stage === "meter_install") return "border-violet-300/80 bg-violet-50 text-violet-800"
                      if (stage === "mco") return "border-emerald-300/80 bg-emerald-50 text-emerald-800"
                      return "border-border bg-muted/40 text-muted-foreground"
                    }

                    if (operationalProgressTab === "wcc") {
                    return activeQuotationList.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>No WCC pending records</p>
                          <p className="text-xs mt-1">
                            Installation-approved jobs and rows sent from Meter in Discom appear here. Saving WCC
                            moves them to Meter Installation Pending.
                          </p>
                      </div>
                    ) : (
                        <div className="native-scroll-list max-h-[min(70vh,820px)] overflow-y-auto overscroll-y-contain">
                          <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-sm">
                            <table className="w-full min-w-[64rem] border-collapse text-left">
                              <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur supports-[backdrop-filter]:bg-muted/70">
                                <tr className="border-b border-border/70 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  <th className="px-3 py-2.5 whitespace-nowrap">Customer</th>
                                  <th className="px-3 py-2.5 whitespace-nowrap">Dealer</th>
                                  <th className="px-3 py-2.5 whitespace-nowrap">Install approved</th>
                                  <th className="px-3 py-2.5 whitespace-nowrap">Discom name</th>
                                  <th className="px-3 py-2.5 whitespace-nowrap">Assigned person</th>
                                  <th className="px-3 py-2.5 whitespace-nowrap text-right md:sticky md:right-0 md:bg-muted/90 md:z-10 md:shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                                    Actions
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                        {visibleQuotationList.map((quotation) => {
                          const qAny = quotation as unknown as Record<string, unknown>
                                  const nestedDealer = qAny.dealer as Record<string, unknown> | null | undefined
                                  const fromList = dealers.find((d) => d.id === quotation.dealerId)
                                  const dealerName =
                                    (nestedDealer && typeof nestedDealer === "object"
                                      ? formatPersonName(
                                          String(nestedDealer.firstName || ""),
                                          String(nestedDealer.lastName || ""),
                                          String(nestedDealer.username || "").trim() || "Dealer",
                                        )
                                      : "") ||
                                    (fromList
                                      ? formatPersonName(fromList.firstName, fromList.lastName, "Dealer")
                                      : "Unknown Dealer")
                                  const approvedAt =
                                    qAny.installerApprovedAt ||
                                    qAny.installer_approved_at ||
                                    qAny.approvedAt ||
                                    qAny.approvedDate ||
                                    quotation.createdAt
                                  const draft = getAdminWccDraft(quotation)
                                  const discomName = draft.discomName.trim()
                                  const assignedPerson = draft.assignedPersonName.trim()
                                  return (
                                    <tr
                                      key={quotation.id}
                                      className="border-b border-border/50 transition-colors hover:bg-muted/35 last:border-b-0"
                                    >
                                      <td className="px-3 py-2.5 align-middle">
                                        <div className="min-w-[11rem] max-w-[14rem]">
                                          <p className="text-sm font-semibold leading-tight truncate">
                                            {formatPersonName(
                                              quotation.customer.firstName,
                                              quotation.customer.lastName,
                                              "Unknown",
                                            )}
                                          </p>
                                          <p className="text-[11px] text-muted-foreground truncate">
                                            {quotation.customer.mobile || "No mobile"}
                                          </p>
                                          <p className="text-[10px] font-medium text-muted-foreground/90 truncate">
                                            {quotation.id}
                                          </p>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2.5 align-middle">
                                        <p className="text-xs font-medium max-w-[11rem] truncate" title={dealerName}>
                                          {dealerName}
                                        </p>
                                      </td>
                                      <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                                        <p className="text-xs font-medium inline-flex items-center gap-1">
                                          <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                                          {approvedAt
                                            ? new Date(String(approvedAt)).toLocaleDateString("en-IN")
                                            : "N/A"}
                                        </p>
                                      </td>
                                      <td className="px-3 py-2.5 align-middle">
                                        <p
                                          className="text-xs font-medium max-w-[10rem] truncate"
                                          title={discomName || undefined}
                                        >
                                          {discomName || (
                                            <span className="text-muted-foreground font-normal">—</span>
                                          )}
                                        </p>
                                      </td>
                                      <td className="px-3 py-2.5 align-middle">
                                        <p
                                          className="text-xs font-medium max-w-[10rem] truncate"
                                          title={assignedPerson || undefined}
                                        >
                                          {assignedPerson || (
                                            <span className="text-muted-foreground font-normal">—</span>
                                          )}
                                        </p>
                                      </td>
                                      <td className="px-3 py-2.5 align-middle text-right md:sticky md:right-0 md:bg-card md:z-10 md:shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                                        <Button
                                          size="sm"
                                          className="h-8 shrink-0"
                                          onClick={() => void openAdminWccModal(quotation)}
                                        >
                                          Update WCC
                                        </Button>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                          <IncrementalListSentinel
                            sentinelRef={quotationListSentinelRef}
                            visibleCount={visibleQuotationCount}
                            totalCount={activeQuotationListTotal}
                            hasMore={hasMoreQuotationList}
                            onLoadMore={loadMoreQuotationList}
                          />
                        </div>
                      )
                    }

                    if (operationalProgressTab === "meter_install") {
                      return activeQuotationList.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>No meter installation pending records</p>
                          <p className="text-xs mt-1">
                            Move rows here from WCC Pending (after Meter in Discom when installation is
                            approved). Use To Final Step to send them to Final Step.
                          </p>
                        </div>
                      ) : (
                        <div className="native-scroll-list max-h-[min(70vh,820px)] overflow-y-auto overscroll-y-contain">
                          <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-sm">
                            <table className="w-full min-w-[56rem] border-collapse text-left">
                              <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur supports-[backdrop-filter]:bg-muted/70">
                                <tr className="border-b border-border/70 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  <th className="px-3 py-2.5 whitespace-nowrap">Customer</th>
                                  <th className="px-3 py-2.5 whitespace-nowrap">Location</th>
                                  <th className="px-3 py-2.5 whitespace-nowrap">Assigned person</th>
                                  <th className="px-3 py-2.5 whitespace-nowrap">Remarks</th>
                                  <th className="px-3 py-2.5 whitespace-nowrap text-right md:sticky md:right-0 md:bg-muted/90 md:z-10 md:shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                                    Actions
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {visibleQuotationList.map((quotation) => {
                                  const draft = getAdminMeterInstallDraft(quotation)
                                  const location = formatQuotationCustomerLocation(quotation) || "—"
                                  return (
                                    <tr
                                      key={quotation.id}
                                      className="border-b border-border/50 transition-colors hover:bg-muted/35 last:border-b-0"
                                    >
                                      <td className="px-3 py-2.5 align-middle">
                                        <div className="min-w-[11rem] max-w-[14rem]">
                                          <p className="text-sm font-semibold leading-tight truncate">
                                            {formatPersonName(
                                              quotation.customer.firstName,
                                              quotation.customer.lastName,
                                              "Unknown",
                                            )}
                                          </p>
                                          <p className="text-[11px] text-muted-foreground truncate">
                                            {quotation.customer.mobile || "No mobile"}
                                          </p>
                                          <p className="text-[10px] font-medium text-muted-foreground/90 truncate">
                                            {quotation.id}
                                          </p>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2.5 align-middle">
                                        <p className="text-xs max-w-[12rem] truncate" title={location}>
                                          {location}
                                        </p>
                                      </td>
                                      <td className="px-3 py-2.5 align-middle">
                                        <p className="text-xs font-medium max-w-[10rem] truncate">
                                          {draft.assignedPersonName.trim() ||
                                            getMeteringAssignedPersonName(quotation) || (
                                            <span className="text-muted-foreground font-normal">—</span>
                                          )}
                                        </p>
                                      </td>
                                      <td className="px-3 py-2.5 align-middle">
                                        <p className="text-xs max-w-[10rem] truncate" title={draft.remarks}>
                                          {draft.remarks.trim() || (
                                            <span className="text-muted-foreground font-normal">—</span>
                                          )}
                                        </p>
                                      </td>
                                      <td className="px-3 py-2.5 align-middle text-right md:sticky md:right-0 md:bg-card md:z-10 md:shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 shrink-0"
                                            onClick={() => openAdminMeterInstallModal(quotation)}
                                          >
                                            Update
                                          </Button>
                                          <Button
                                            size="sm"
                                            className="h-8 shrink-0"
                                            onClick={() => void setAdminMeteringStage(quotation, "mco")}
                                          >
                                            To Final Step
                                          </Button>
                                        </div>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                          <IncrementalListSentinel
                            sentinelRef={quotationListSentinelRef}
                            visibleCount={visibleQuotationCount}
                            totalCount={activeQuotationListTotal}
                            hasMore={hasMoreQuotationList}
                            onLoadMore={loadMoreQuotationList}
                          />
                        </div>
                      )
                    }

                    // Bank process / Pending Payment table UI temporarily commented out
                    if (
                      false &&
                      (operationalProgressTab === "bank_process" ||
                        operationalProgressTab === "pending_payment")
                    ) {
                      const isPendingPaymentTab = operationalProgressTab === "pending_payment"
                      return activeQuotationList.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>
                            {isPendingPaymentTab
                              ? "No pending payment records"
                              : "No bank process records"}
                          </p>
                          <p className="text-xs mt-1">
                            {isPendingPaymentTab
                              ? "After Bank process is done for Loan / Cash + loan files, they appear here."
                              : "Loan and Cash + loan metering files appear here with loan amount, 2nd installment, and bank. Mark done to move to Pending payment."}
                          </p>
                        </div>
                      ) : (
                        <div className="native-scroll-list max-h-[min(70vh,820px)] overflow-y-auto overscroll-y-contain">
                          <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-sm">
                            <table className="w-full min-w-[72rem] border-collapse text-left">
                              <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur supports-[backdrop-filter]:bg-muted/70">
                                <tr className="border-b border-border/70 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  <th className="px-3 py-2.5 whitespace-nowrap">Customer</th>
                                  <th className="px-3 py-2.5 whitespace-nowrap">Dealer</th>
                                  <th className="px-3 py-2.5 whitespace-nowrap">Payment</th>
                                  <th className="px-3 py-2.5 whitespace-nowrap">Loan amount</th>
                                  <th className="px-3 py-2.5 whitespace-nowrap">2nd installment</th>
                                  <th className="px-3 py-2.5 whitespace-nowrap">Bank</th>
                                  <th className="px-3 py-2.5 whitespace-nowrap">Stage</th>
                                  <th className="px-3 py-2.5 whitespace-nowrap">Assigned person</th>
                                  <th className="px-3 py-2.5 whitespace-nowrap text-right md:sticky md:right-0 md:bg-muted/90 md:z-10 md:shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                                    Actions
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {visibleQuotationList.map((quotation) => {
                                  const qAny = quotation as unknown as Record<string, unknown>
                                  const nestedDealer = qAny.dealer as Record<string, unknown> | null | undefined
                                  const fromList = dealers.find((d) => d.id === quotation.dealerId)
                                  const dealerName =
                                    (nestedDealer && typeof nestedDealer === "object"
                                      ? formatPersonName(
                                          String(nestedDealer.firstName || ""),
                                          String(nestedDealer.lastName || ""),
                                          String(nestedDealer.username || "").trim() || "Dealer",
                                        )
                                      : "") ||
                                    (fromList
                                      ? formatPersonName(fromList.firstName, fromList.lastName, "Dealer")
                                      : "Unknown Dealer")
                                  const paymentType = getQuotationPaymentTypeRaw(quotation)
                                  const paymentLabel =
                                    paymentType === "mix"
                                      ? "Cash + loan"
                                      : paymentType === "loan"
                                        ? "Loan"
                                        : getQuotationPaymentTypeLabel(quotation)
                                  const { loan } = readQuotationLoanCashAmounts(quotation)
                                  const loanDisplay =
                                    loan ??
                                    (paymentType === "loan"
                                      ? getQuotationSubtotalValue(quotation) || undefined
                                      : undefined)
                                  const i2 = getSecondInstallmentAmount(quotation)
                                  const bankLabel = getMeteringBankDetailsLabel(quotation) || "—"
                          const meteringStage = getAdminMeteringStage(quotation)
                                  const stageLabel =
                                    meteringStage === "mco"
                                      ? "Final Step"
                                      : meteringStage === "approved"
                                        ? isAdminMeteringPostDiscomWcc(quotation)
                                          ? "WCC Pending"
                                          : "Meter in Discom"
                                        : meteringStage === "processing"
                                          ? isAdminMeteringWccPending(quotation)
                                            ? "WCC Pending"
                                            : "Meter Pending"
                                          : meteringStage === "meter_install"
                                            ? "Meter Installation Pending"
                                            : isAdminMeteringPostDiscomWcc(quotation)
                                              ? "WCC Pending"
                                              : "—"
                                  const assignedPerson =
                                    getAdminBankProcessDraft(quotation).assignedPersonName.trim() ||
                                    getMeteringAssignedPersonName(quotation) ||
                                    "—"
                                  const bankLocationDraft =
                                    getAdminBankProcessDraft(quotation).bankLocation.trim() || "—"
                                  const bankRemarksDraft =
                                    getAdminBankProcessDraft(quotation).remarks.trim() || "—"
                          return (
                                    <tr
                                      key={quotation.id}
                                      className="border-b border-border/50 transition-colors hover:bg-muted/35 last:border-b-0"
                                    >
                                      <td className="px-3 py-2.5 align-middle">
                                        <div className="min-w-[11rem] max-w-[14rem]">
                                          <p className="text-sm font-semibold leading-tight truncate">
                                            {formatPersonName(
                                              quotation.customer.firstName,
                                              quotation.customer.lastName,
                                              "Unknown",
                                            )}
                                          </p>
                                          <p className="text-[11px] text-muted-foreground truncate">
                                            {quotation.customer.mobile || "No mobile"}
                                          </p>
                                          <p className="text-[10px] font-medium text-muted-foreground/90 truncate">
                                            {quotation.id}
                                          </p>
                                  </div>
                                      </td>
                                      <td className="px-3 py-2.5 align-middle">
                                        <p className="text-xs font-medium max-w-[11rem] truncate" title={dealerName}>
                                          {dealerName}
                                        </p>
                                      </td>
                                      <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                                        <span className="inline-flex rounded-md bg-muted/60 px-2 py-0.5 text-xs font-medium">
                                          {paymentLabel}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                                        <p className="text-xs font-semibold">
                                          {loanDisplay != null && loanDisplay > 0
                                            ? `₹${loanDisplay.toLocaleString("en-IN")}`
                                            : "—"}
                                        </p>
                                      </td>
                                      <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                                        <p className="text-xs font-medium">
                                          {i2 != null ? `₹${i2.toLocaleString("en-IN")}` : "—"}
                                        </p>
                                      </td>
                                      <td className="px-3 py-2.5 align-middle">
                                        <p
                                          className="text-xs font-medium max-w-[14rem] truncate"
                                          title={bankLabel !== "—" ? bankLabel : undefined}
                                        >
                                          {bankLabel}
                                        </p>
                                        <p
                                          className="text-[10px] text-muted-foreground max-w-[14rem] truncate"
                                          title={bankLocationDraft !== "—" ? bankLocationDraft : undefined}
                                        >
                                          Loc: {bankLocationDraft}
                                        </p>
                                      </td>
                                      <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                                        <span className="inline-flex rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] font-medium">
                                          {stageLabel}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2.5 align-middle">
                                        <p className="text-xs font-medium max-w-[10rem] truncate">{assignedPerson}</p>
                                        <p
                                          className="text-[10px] text-muted-foreground max-w-[10rem] truncate"
                                          title={bankRemarksDraft !== "—" ? bankRemarksDraft : undefined}
                                        >
                                          {bankRemarksDraft}
                                        </p>
                                      </td>
                                      <td className="px-3 py-2.5 align-middle text-right md:sticky md:right-0 md:bg-card md:z-10 md:shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8"
                                            onClick={() => openAdminBankProcessModal(quotation)}
                                          >
                                            Details
                                          </Button>
                                          {!isPendingPaymentTab ? (
                                            <Button
                                              size="sm"
                                              className="h-8"
                                              onClick={() => {
                                                void saveAdminBankProcessDetails(quotation, true)
                                              }}
                                            >
                                              To Pending payment
                                            </Button>
                                          ) : null}
                                  </div>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                                  </div>
                          <IncrementalListSentinel
                            sentinelRef={quotationListSentinelRef}
                            visibleCount={visibleQuotationCount}
                            totalCount={activeQuotationListTotal}
                            hasMore={hasMoreQuotationList}
                            onLoadMore={loadMoreQuotationList}
                          />
                                  </div>
                      )
                    }

                    if (operationalProgressTab === "mco") {
                      return activeQuotationList.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>No Final Step records</p>
                          <p className="text-xs mt-1">
                            Send rows here from Meter Installation Pending with To Final Step. Complete
                            installation images, metering steps, and dealer details show on each card.
                          </p>
                        </div>
                      ) : (
                        <div className="native-scroll-list max-h-[min(70vh,820px)] space-y-3 overflow-y-auto overscroll-y-contain pr-1">
                          {visibleQuotationList.map((quotation) => {
                            const qAny = quotation as unknown as Record<string, unknown>
                            const nestedDealer = qAny.dealer as Record<string, unknown> | null | undefined
                            const fromList = dealers.find((d) => d.id === quotation.dealerId)
                            const dealerName =
                              (nestedDealer && typeof nestedDealer === "object"
                                ? formatPersonName(
                                    String(nestedDealer.firstName || ""),
                                    String(nestedDealer.lastName || ""),
                                    String(nestedDealer.username || "").trim() || "Dealer",
                                  )
                                : "") ||
                              (fromList
                                ? formatPersonName(fromList.firstName, fromList.lastName, "Dealer")
                                : "Unknown Dealer")
                            const dealerMobile =
                              (nestedDealer && typeof nestedDealer === "object"
                                ? String(nestedDealer.mobile || nestedDealer.phone || "").trim()
                                : "") ||
                              fromList?.mobile ||
                              "—"
                            const discomName =
                              String(qAny.discomName || qAny.discom_name || "").trim() || "—"
                            const assignedPerson =
                              getMeteringAssignedPersonName(qAny) ||
                              getAdminMeterInstallDraft(quotation).assignedPersonName.trim() ||
                              "—"
                            const remarks =
                              String(qAny.remarks || "").trim() ||
                              getAdminMeterInstallDraft(quotation).remarks.trim() ||
                              "—"
                            const meterSlot = resolveMeterInstallPhotoSlot(quotation)
                            const plantSlot = resolvePlantLivePhotoSlot(quotation)
                            const allImages: string[] = []
                            addDedupedUrl(allImages, 24, meterSlot.url)
                            addDedupedUrl(allImages, 24, plantSlot.url)
                            addDedupedUrl(
                              allImages,
                              24,
                              String(
                                qAny.meterDocumentPublicUrl ||
                                  qAny.meter_document_public_url ||
                                  qAny.meterDocumentUrl ||
                                  qAny.meter_document_url ||
                                  "",
                              ),
                            )
                            addDedupedUrl(
                              allImages,
                              24,
                              String(
                                qAny.workCompleteReportImagePublicUrl ||
                                  qAny.work_complete_report_image_public_url ||
                                  qAny.workCompleteReportImageUrl ||
                                  qAny.work_complete_report_image_url ||
                                  qAny.workCompleteReportImage ||
                                  "",
                              ),
                            )
                            addDedupedUrl(
                              allImages,
                              24,
                              String(
                                qAny.meterInstalledPhotoPublicUrl ||
                                  qAny.meter_installed_photo_public_url ||
                                  qAny.meterInstalledPhotoUrl ||
                                  qAny.meter_installed_photo_url ||
                                  qAny.meterInstalledPhoto ||
                                  "",
                              ),
                            )
                            addDedupedUrl(
                              allImages,
                              24,
                              String(
                                qAny.completeDcrReportImagePublicUrl ||
                                  qAny.complete_dcr_report_image_public_url ||
                                  qAny.completeDcrReportImageUrl ||
                                  qAny.complete_dcr_report_image_url ||
                                  qAny.completeDcrReportImage ||
                                  "",
                              ),
                            )
                            const meteringSteps = [
                              "Meter Pending",
                              "Meter in Discom",
                              "WCC Pending",
                              "Meter Installation",
                              "Final Step",
                            ]
                            return (
                              <div
                                key={quotation.id}
                                className="rounded-xl border border-border/70 bg-card p-4 shadow-sm space-y-3"
                              >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-sm font-semibold leading-tight truncate">
                                        {formatPersonName(
                                          quotation.customer.firstName,
                                          quotation.customer.lastName,
                                          "Unknown",
                                        )}
                                      </p>
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] border-emerald-300/80 bg-emerald-50 text-emerald-800"
                                      >
                                        Final Step
                                      </Badge>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground truncate">
                                      {quotation.customer.mobile || "No mobile"} • {quotation.id}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Amount {getMeteringAmountDisplay(quotation).primaryLabel}
                                      <span className="mx-1.5 text-border">|</span>
                                      Discom {discomName}
                                      <span className="mx-1.5 text-border">|</span>
                                      Assigned {assignedPerson}
                                    </p>
                                    {remarks !== "—" ? (
                                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                                        Remarks: {remarks}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 min-w-[10rem] shrink-0">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/90">
                                      Dealer
                                    </p>
                                    <p className="text-xs font-medium leading-snug">{dealerName}</p>
                                    <p className="text-[11px] text-muted-foreground">{dealerMobile}</p>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                                  {meteringSteps.map((label, index) => (
                                    <div
                                      key={label}
                                      className="rounded-md border border-emerald-200/80 bg-emerald-50/80 px-2 py-1.5 flex items-center gap-1.5"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      <div className="min-w-0">
                                        <p className="text-[9px] uppercase tracking-wide text-emerald-700/80">
                                          Step {index + 1}
                                        </p>
                                        <p className="text-[11px] font-medium text-emerald-900 truncate">
                                          {label}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                    Metering flow images ({allImages.length})
                                  </p>
                                  {allImages.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">
                                      No metering flow images available on this quotation yet.
                                    </p>
                                  ) : (
                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                      {allImages.map((url, idx) => (
                                        <div
                                          key={`${quotation.id}-img-${idx}`}
                                          className="relative aspect-square overflow-hidden rounded-md border border-border/70 bg-muted/20"
                                        >
                                          <StoredMediaPreview
                                            rawUrl={url}
                                            quotationId={quotation.id}
                                            fileName={`final-step-${idx + 1}`}
                                            className="absolute inset-0 h-full w-full object-cover"
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                <div className="flex justify-end">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8"
                                    onClick={() => openAdminMeteringDetails(quotation)}
                                  >
                                    Details
                                  </Button>
                                </div>
                              </div>
                            )
                          })}
                          <IncrementalListSentinel
                            sentinelRef={quotationListSentinelRef}
                            visibleCount={visibleQuotationCount}
                            totalCount={activeQuotationListTotal}
                            hasMore={hasMoreQuotationList}
                            onLoadMore={loadMoreQuotationList}
                          />
                        </div>
                      )
                    }

                    return activeQuotationList.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>
                          {isAdminDataLoading
                            ? "Loading metering records..."
                            : filterInstallOverdue !== "all"
                            ? "No metering records match this overdue filter"
                            : operationalProgressTab === "pending"
                                ? "No Meter Pending records"
                                : "No metering records found"}
                        </p>
                        {operationalProgressTab === "pending" && filterInstallOverdue === "all" ? (
                          <p className="text-xs mt-1">
                            Rows appear here after Send to Metering until you move them to Discom or complete WCC.
                          </p>
                        ) : null}
                        {filterInstallOverdue !== "all" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            onClick={() => setFilterInstallOverdue("all")}
                          >
                            Clear overdue filter
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="native-scroll-list max-h-[min(70vh,820px)] overflow-y-auto overscroll-y-contain">
                        <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-sm">
                          <table className="w-full min-w-[94rem] border-collapse text-left">
                            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur supports-[backdrop-filter]:bg-muted/70">
                              <tr className="border-b border-border/70 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                <th className="px-3 py-2.5 whitespace-nowrap">Customer</th>
                                <th className="px-3 py-2.5 whitespace-nowrap">Dealer</th>
                                <th className="px-3 py-2.5 whitespace-nowrap">Date</th>
                                <th className="px-3 py-2.5 whitespace-nowrap">Phase</th>
                                <th className="px-3 py-2.5 whitespace-nowrap">Address</th>
                                <th className="px-3 py-2.5 whitespace-nowrap">Discom Name</th>
                                <th className="px-3 py-2.5 whitespace-nowrap">Remarks</th>
                                <th className="px-3 py-2.5 whitespace-nowrap">Assigned person</th>
                                <th className="px-3 py-2.5 whitespace-nowrap">Status</th>
                                <th className="px-3 py-2.5 whitespace-nowrap text-right md:sticky md:right-0 md:bg-muted/90 md:z-10 md:shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {visibleQuotationList.map((quotation) => {
                                const qAny = quotation as unknown as Record<string, unknown>
                                const meteringStage = getAdminMeteringStage(quotation)
                                const meteringReferenceYmd = resolveAdminMeteringReferenceYmd(
                                  quotation,
                                  meteringStage,
                                )
                                const overdueTone = meteringOverdueTone(meteringReferenceYmd, meteringStage)
                                const overdueUi = overdueRowClasses(overdueTone)
                                const dateLabel = formatYmdEnIn(meteringReferenceYmd) || "N/A"
                                const nestedDealer = qAny.dealer as Record<string, unknown> | null | undefined
                                const fromList = dealers.find((d) => d.id === quotation.dealerId)
                                const dealerName =
                                  (nestedDealer && typeof nestedDealer === "object"
                                    ? formatPersonName(
                                        String(nestedDealer.firstName || ""),
                                        String(nestedDealer.lastName || ""),
                                        String(nestedDealer.username || "").trim() || "Dealer",
                                      )
                                    : "") ||
                                  (fromList
                                    ? formatPersonName(fromList.firstName, fromList.lastName, "Dealer")
                                    : "Unknown Dealer")
                                const dealerMobile =
                                  (nestedDealer && typeof nestedDealer === "object"
                                    ? String(nestedDealer.mobile || nestedDealer.phone || "").trim()
                                    : "") ||
                                  fromList?.mobile ||
                                  "—"
                                const discomName =
                                  String(qAny.discomName || qAny.discom_name || "").trim() || "N/A"
                                const remarks =
                                  String(qAny.remarks || "").trim() ||
                                  getAdminMeterInstallDraft(quotation).remarks.trim() ||
                                  "N/A"
                                const assignedPerson =
                                  getMeteringAssignedPersonName(qAny) ||
                                  getAdminMeterInstallDraft(quotation).assignedPersonName.trim() ||
                                  "N/A"
                                const address = getQuotationAddressText(quotation)
                                const statusLabel =
                                  meteringStage === "mco"
                                    ? "Final Step"
                                    : meteringStage === "approved"
                                      ? "Meter in Discom"
                                      : meteringStage === "processing"
                                        ? "Meter Pending"
                                        : meteringStage === "meter_install"
                                          ? "Meter Installation Pending"
                                          : getMeteringWorkflowRaw(qAny) ||
                                        getInstallationWorkflowStatus(qAny) ||
                                            "—"
                                return (
                                  <tr
                                    key={quotation.id}
                                    className={cn(
                                      "border-b border-border/50 transition-colors last:border-b-0",
                                      overdueUi.row,
                                    )}
                                    title={overdueUi.title}
                                  >
                                    <td className="px-3 py-2.5 align-middle">
                                      <div className="min-w-[11rem] max-w-[14rem]">
                                        <p className="text-sm font-semibold leading-tight truncate">
                                          {formatPersonName(
                                            quotation.customer.firstName,
                                            quotation.customer.lastName,
                                            "Unknown",
                                          )}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground truncate">
                                          {quotation.customer.mobile || "No mobile"}
                                        </p>
                                        <p className="text-[10px] font-medium text-muted-foreground/90 truncate">
                                          {quotation.id}
                                        </p>
                                  </div>
                                    </td>
                                    <td className="px-3 py-2.5 align-middle">
                                      <div className="min-w-[8.5rem] max-w-[11rem]">
                                        <p className="text-xs font-medium leading-tight truncate" title={dealerName}>
                                          {dealerName}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground truncate">{dealerMobile}</p>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                                      <p className="text-xs font-medium inline-flex items-center gap-1">
                                        <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                                        {dateLabel}
                                      </p>
                                      <p className="text-[10px] text-muted-foreground">
                                        {meteringStage === "mco"
                                          ? "Final Step"
                                          : meteringStage === "processing"
                                            ? "Meter Pending"
                                            : "Meter in Discom"}
                                      </p>
                                    </td>
                                    <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                                      <span className="inline-flex rounded-md bg-muted/60 px-2 py-0.5 text-xs font-medium">
                                        {getQuotationPhaseText(quotation)}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2.5 align-middle">
                                      <p
                                        className="text-xs font-medium max-w-[10rem] truncate"
                                        title={address || "N/A"}
                                      >
                                        {address || "N/A"}
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
                                      <p className="text-xs font-medium max-w-[9rem] truncate" title={assignedPerson}>
                                        {assignedPerson}
                                      </p>
                                    </td>
                                    <td className="px-3 py-2.5 align-middle">
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          "text-[10px] capitalize font-medium",
                                          meteringStageBadgeTone(meteringStage),
                                        )}
                                      >
                                        {String(statusLabel).replace(/_/g, " ")}
                                      </Badge>
                                    </td>
                                    <td
                                      className={cn(
                                        "px-3 py-2.5 align-middle text-right md:sticky md:right-0 md:z-10 md:shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]",
                                        overdueUi.sticky,
                                      )}
                                    >
                                      <div className="flex flex-nowrap items-center justify-end gap-1.5">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-8 shrink-0"
                                          onClick={() => openAdminMeteringDetails(quotation)}
                                        >
                                          Details
                                    </Button>
                                    {meteringStage === "processing" && (
                                      <>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-8 shrink-0 border-amber-800/40"
                                          onClick={() => void handleRetrieveFromMetering(quotation)}
                                          disabled={retrievingFromMeteringId === quotation.id}
                                          title="Retrieve to Quotations / Installation"
                                        >
                                          <RotateCcw className="w-3 h-3 mr-1" />
                                          {retrievingFromMeteringId === quotation.id ? "Retrieving..." : "Retrieve"}
                                        </Button>
                                        <Button
                                          size="sm"
                                            className="h-8 shrink-0"
                                          onClick={() => void setAdminMeteringStage(quotation, "approved")}
                                        >
                                            To Discom
                                      </Button>
                                      </>
                                    )}
                                    {meteringStage === "approved" && (
                                      <>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                              className="h-8 shrink-0"
                                          onClick={() => void setAdminMeteringStage(quotation, "processing")}
                                        >
                                              To Pending
                                        </Button>
                                            <Button
                                              size="sm"
                                              className="h-8 shrink-0"
                                              onClick={() => void moveAdminMeteringFromDiscomToWcc(quotation)}
                                            >
                                              To WCC Pending
                                        </Button>
                                      </>
                                    )}
                                    {meteringStage === "mco" && (
                                      <>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="h-8 shrink-0"
                                              onClick={() => openAdminMcoDocsModal(quotation)}
                                            >
                                              MCO Docs
                                        </Button>
                                        <Button
                                          size="sm"
                                              className="h-8 shrink-0"
                                          onClick={() => void moveAdminToBaldevConfirmation(quotation)}
                                              disabled={
                                                !hasRequiredAdminMeteringDetails(quotation) ||
                                                !hasRequiredAdminMcoDocuments(quotation)
                                              }
                                        >
                                              To Confirmation
                                        </Button>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="h-8 shrink-0"
                                              onClick={() => void setAdminMeteringStage(quotation, "approved")}
                                            >
                                              To Discom
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                        <IncrementalListSentinel
                          sentinelRef={quotationListSentinelRef}
                          visibleCount={visibleQuotationCount}
                          totalCount={activeQuotationListTotal}
                          hasMore={hasMoreQuotationList}
                          onLoadMore={loadMoreQuotationList}
                        />
                      </div>
                    )
                  })()
                ) : operationalTab === "confirmation" ? (
                  (() => {
                    if (operationalProgressTab === "dcr") {
                      return activeQuotationList.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>No DCR generation pending</p>
                          <p className="text-xs mt-1">
                            Records arrive here from Installation approved. Generate DCR to send them to Final process.
                          </p>
                        </div>
                      ) : (
                        <div className="native-scroll-list max-h-[min(70vh,820px)] space-y-3 overflow-y-auto overscroll-y-contain pr-1">
                          {visibleQuotationList.map((quotation) => {
                            const installerApprovedDate =
                              (quotation as any).installerApprovedAt ||
                              (quotation as any).installer_approved_at ||
                              (quotation as any).approvedAt ||
                              (quotation as any).approvedDate ||
                              quotation.createdAt
                            const systemKw = getQuotationSystemKw(quotation as any)
                            return (
                              <Card
                                key={quotation.id}
                                className="border-border/60 bg-gradient-to-r from-card to-muted/20 shadow-sm"
                              >
                                <CardContent className="p-4">
                                  <div className="flex flex-wrap md:flex-nowrap items-center gap-3">
                                    <div className="min-w-[180px] flex-1">
                                      <p className="text-sm font-semibold leading-tight">
                                        {formatPersonName(
                                          quotation.customer.firstName,
                                          quotation.customer.lastName,
                                          "Unknown",
                                        )}
                                      </p>
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        {quotation.customer.mobile || "No mobile"} • {quotation.id}
                                      </p>
                                    </div>
                                    <div className="min-w-[120px]">
                                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                        Installer Approved
                                      </p>
                                      <p className="text-xs font-medium flex items-center gap-1">
                                        <Calendar className="w-3 h-3 text-muted-foreground" />
                                        {installerApprovedDate
                                          ? new Date(installerApprovedDate as string).toLocaleDateString("en-IN")
                                          : "N/A"}
                                      </p>
                                    </div>
                                    <div className="min-w-[90px]">
                                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                        System
                                      </p>
                                      <p className="text-sm font-semibold">
                                        {systemKw > 0 ? `${systemKw} kW` : "N/A"}
                                      </p>
                                    </div>
                                    <div className="min-w-[120px]">
                                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                        Subtotal
                                      </p>
                                      <p className="text-sm font-semibold">
                                        ₹
                                        {Math.abs(
                                          (quotation as any).pricing?.subtotal ?? quotation.subtotal ?? 0,
                                        ).toLocaleString()}
                                      </p>
                                    </div>
                                    <div className="min-w-[130px]">
                                      <Badge variant="outline" className="text-xs">
                                        DCR pending
                                      </Badge>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          markAdminDcrGenerated(quotation.id)
                                          toast({
                                            title: "DCR generated",
                                            description: "Moved to Final process.",
                                          })
                                        }}
                                      >
                                        Generate DCR
                                      </Button>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            )
                          })}
                          <IncrementalListSentinel
                            sentinelRef={quotationListSentinelRef}
                            visibleCount={visibleQuotationCount}
                            totalCount={activeQuotationListTotal}
                            hasMore={hasMoreQuotationList}
                            onLoadMore={loadMoreQuotationList}
                          />
                        </div>
                      )
                    }
                    return activeQuotationList.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>
                          {isAdminDataLoading
                            ? "Loading confirmation records..."
                            : "No confirmation records found"}
                        </p>
                      </div>
                    ) : (
                      <div className="native-scroll-list max-h-[min(70vh,820px)] space-y-3 overflow-y-auto overscroll-y-contain pr-1">
                        {visibleQuotationList.map((quotation) => {
                          const confirmationStage = getAdminConfirmationStage(quotation)
                          const installerApprovedDate =
                            (quotation as any).installerApprovedAt ||
                            (quotation as any).installer_approved_at ||
                            (quotation as any).approvedAt ||
                            (quotation as any).approvedDate ||
                            quotation.createdAt
                          return (
                            <Card
                              key={quotation.id}
                              className={
                                confirmationStage === "final"
                                  ? "border-green-200/70 bg-gradient-to-r from-green-50/40 to-card shadow-sm"
                                  : "border-border/60 bg-gradient-to-r from-card to-muted/20 shadow-sm"
                              }
                            >
                              <CardContent className="p-4">
                                <div className="flex flex-wrap md:flex-nowrap items-center gap-3">
                                  <div className="min-w-[180px] flex-1">
                                    <p className="text-sm font-semibold leading-tight">
                                      {formatPersonName(quotation.customer.firstName, quotation.customer.lastName, "Unknown")}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{quotation.customer.mobile || "No mobile"} • {quotation.id}</p>
                                  </div>
                                  <div className="min-w-[120px]">
                                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                      {confirmationStage === "final" ? "Closed On" : "Installer Approved"}
                                    </p>
                                    <p className="text-xs font-medium flex items-center gap-1">
                                      <Calendar className="w-3 h-3 text-muted-foreground" />
                                      {installerApprovedDate ? new Date(installerApprovedDate as string).toLocaleDateString("en-IN") : "N/A"}
                                    </p>
                                  </div>
                                  <div className="min-w-[120px]">
                                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Subtotal</p>
                                    <p className="text-sm font-semibold">₹{Math.abs((quotation as any).pricing?.subtotal ?? quotation.subtotal ?? 0).toLocaleString()}</p>
                                  </div>
                                  <div className="min-w-[130px]">
                                    {confirmationStage === "final" ? (
                                      <Badge className="bg-green-600 text-white text-xs">Final Closure</Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs">Pending Baldev</Badge>
                                    )}
                                  </div>
                                  {confirmationStage === "queue" ? (
                                    <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                                      {(() => {
                                        const docs = countAdminFinalConfirmationDocsUploaded(quotation)
                                        if (docs.uploaded <= 0) return null
                                        return (
                                          <Badge className="bg-emerald-600 text-white text-[10px]">
                                            <CheckCircle2 className="w-3 h-3 mr-1" />
                                            {docs.uploaded}/{docs.total} uploaded
                                          </Badge>
                                        )
                                      })()}
                                      <Button variant="outline" size="sm" onClick={() => toggleAdminFinalUpdate(quotation)}>
                                        <ChevronDown className="w-3.5 h-3.5 mr-1" />
                                        Update Final Details
                                      </Button>
                                      <Button size="sm" onClick={() => void markAdminFinalApproved(quotation)} disabled={adminBaldevSavingId === quotation.id}>
                                        {adminBaldevSavingId === quotation.id ? "Saving..." : "Mark Final Approved"}
                                      </Button>
                                    </div>
                                  ) : null}
                                  {confirmationStage === "final" ? (
                                    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                                      {(() => {
                                        const docs = countAdminFinalConfirmationDocsUploaded(quotation)
                                        if (docs.uploaded <= 0) {
                                          return (
                                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                              Docs pending
                                            </Badge>
                                          )
                                        }
                                        return (
                                          <Badge className="bg-emerald-600 text-white text-[10px]">
                                            <CheckCircle2 className="w-3 h-3 mr-1" />
                                            {docs.uploaded}/{docs.total} uploaded
                                          </Badge>
                                        )
                                      })()}
                                      <Button variant="outline" size="sm" onClick={() => toggleAdminFinalUpdate(quotation)}>
                                        <ChevronDown className="w-3.5 h-3.5 mr-1" />
                                        Update Final Details
                                      </Button>
                                    </div>
                                  ) : null}
                                </div>
                                {adminFinalExpandedId !== quotation.id &&
                                (confirmationStage === "final" ||
                                  countAdminFinalConfirmationDocsUploaded(quotation).uploaded > 0) ? (
                                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {ADMIN_FINAL_CONFIRMATION_DOC_FIELDS.map((field) => {
                                      const saved = readAdminFinalConfirmationDoc(quotation, field.key)
                                      const shortLabel = field.label.replace(" (PDF/JPG)", "")
                                      return (
                                        <div
                                          key={field.key}
                                          className="rounded-md border border-border/60 bg-muted/20 px-2 py-1.5"
                                        >
                                          <p className="text-[10px] text-muted-foreground truncate">{shortLabel}</p>
                                          {saved.url || saved.name ? (
                                            <p className="text-[11px] font-medium text-emerald-700 flex items-center gap-1">
                                              <CheckCircle2 className="w-3 h-3 shrink-0" />
                                              Uploaded
                                            </p>
                                          ) : (
                                            <p className="text-[11px] text-muted-foreground">Not uploaded</p>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                ) : null}
                                {adminFinalExpandedId === quotation.id ? (
                                  <div className="mt-4 rounded-md border border-border/70 p-3">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                      {ADMIN_FINAL_CONFIRMATION_DOC_FIELDS.map((field) => {
                                        const saved = readAdminFinalConfirmationDoc(quotation, field.key)
                                        const localFile =
                                          field.fileStateKey === "customerFinalBillFile"
                                            ? adminFinalBillFileByQuotation[quotation.id] || null
                                            : field.fileStateKey === "panelWarrantyFile"
                                              ? adminPanelWarrantyFileByQuotation[quotation.id] || null
                                              : field.fileStateKey === "inverterWarrantyFile"
                                                ? adminInverterWarrantyFileByQuotation[quotation.id] || null
                                                : adminWorkCompletionWarrantyFileByQuotation[quotation.id] || null
                                        const isUploaded = Boolean(saved.url || saved.name || localFile)
                                        const setLocalFile = (file: File | null) => {
                                          if (field.fileStateKey === "customerFinalBillFile") {
                                            setAdminFinalBillFileByQuotation((prev) => ({
                                              ...prev,
                                              [quotation.id]: file,
                                            }))
                                          } else if (field.fileStateKey === "panelWarrantyFile") {
                                            setAdminPanelWarrantyFileByQuotation((prev) => ({
                                              ...prev,
                                              [quotation.id]: file,
                                            }))
                                          } else if (field.fileStateKey === "inverterWarrantyFile") {
                                            setAdminInverterWarrantyFileByQuotation((prev) => ({
                                              ...prev,
                                              [quotation.id]: file,
                                            }))
                                          } else {
                                            setAdminWorkCompletionWarrantyFileByQuotation((prev) => ({
                                              ...prev,
                                              [quotation.id]: file,
                                            }))
                                          }
                                        }
                                        return (
                                          <div className="space-y-1.5" key={field.key}>
                                            <div className="flex items-center justify-between gap-2">
                                              <Label className="text-xs">{field.label}</Label>
                                              {isUploaded ? (
                                                <Badge className="bg-emerald-600 text-white text-[10px]">
                                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                                  Uploaded
                                                </Badge>
                                              ) : (
                                                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                                  Pending
                                                </Badge>
                                              )}
                                            </div>
                                            {saved.url || localFile ? (
                                              <StoredMediaPreview
                                                rawUrl={saved.url || null}
                                                localFile={localFile}
                                                quotationId={quotation.id}
                                                fileName={localFile?.name || saved.name || undefined}
                                              />
                                            ) : saved.name ? (
                                              <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                                                <FileText className="w-3.5 h-3.5 shrink-0" />
                                                <span className="truncate">{saved.name}</span>
                                              </div>
                                            ) : null}
                                            <Input
                                              type="file"
                                              accept="image/*,.heic,.heif,.pdf"
                                              className="h-9 text-sm"
                                              onChange={(e) => setLocalFile(e.target.files?.[0] || null)}
                                            />
                                            {isUploaded ? (
                                              <p className="text-[10px] text-muted-foreground">
                                                Choose a new file to replace the uploaded document.
                                              </p>
                                            ) : null}
                                          </div>
                                        )
                                      })}
                                    </div>
                                    <div className="mt-3 flex justify-end gap-2">
                                      <Button variant="outline" size="sm" onClick={() => setAdminFinalExpandedId(null)}>
                                        Cancel
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={() => void saveAdminFinalConfirmationDetails(quotation)}
                                        disabled={adminFinalSavingId === quotation.id}
                                      >
                                        {adminFinalSavingId === quotation.id ? "Saving..." : "Save Details"}
                                      </Button>
                                    </div>
                                  </div>
                                ) : null}
                              </CardContent>
                            </Card>
                          )
                        })}
                        <IncrementalListSentinel
                          sentinelRef={quotationListSentinelRef}
                          visibleCount={visibleQuotationCount}
                          totalCount={activeQuotationListTotal}
                          hasMore={hasMoreQuotationList}
                          onLoadMore={loadMoreQuotationList}
                        />
                      </div>
                    )
                  })()
                ) : operationalTab === "installation" ? (
                  (() => {
                    const installerBadgeClass = (status: string) => {
                      if (status === "approved") return "border-emerald-300/80 bg-emerald-50 text-emerald-800"
                      if (status === "partial") return "border-violet-300/80 bg-violet-50 text-violet-800"
                      if (status === "inprogress") return "border-sky-300/80 bg-sky-50 text-sky-800"
                      return "border-amber-300/80 bg-amber-50 text-amber-800"
                    }
                    return activeQuotationList.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>
                          {isAdminDataLoading
                            ? "Loading installer records..."
                            : "No installer records found"}
                        </p>
                      </div>
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
                        {visibleQuotationList.map((quotation) => {
                          const installerStatus = getInstallerQueueStatusForAdmin(quotation)
                          const qAny = quotation as any
                          const sentToInstallationAt =
                            qAny.installationReleasedAt || qAny.installation_released_at
                          const installationListDate =
                            sentToInstallationAt ||
                            qAny.approvedAt ||
                            qAny.approvedDate ||
                            qAny.statusUpdatedAt ||
                            quotation.createdAt
                          const sentBaseStr = installationListDate ? String(installationListDate) : ""
                                const sentParsedOk = sentBaseStr
                                  ? !Number.isNaN(new Date(sentBaseStr).getTime())
                                  : false
                                const defaultInstallYmd = sentParsedOk
                                  ? addCalendarDaysFromDateString(sentBaseStr, 7)
                                  : ""
                                const storedInstallYmd = toYmdFromStored(
                                  qAny.installationScheduledAt as string | undefined,
                                )
                          const installationDateInputValue = storedInstallYmd || defaultInstallYmd
                                const overdueTone = installationOverdueTone(
                                  installationDateInputValue,
                                  installerStatus,
                                )
                                const overdueUi = overdueRowClasses(overdueTone)
                                const nestedDealer = qAny.dealer as Record<string, unknown> | null | undefined
                                const fromList = dealers.find((d) => d.id === quotation.dealerId)
                                const dealerName =
                                  (nestedDealer && typeof nestedDealer === "object"
                                    ? formatPersonName(
                                        String(nestedDealer.firstName || ""),
                                        String(nestedDealer.lastName || ""),
                                        String(nestedDealer.username || "").trim() || "Dealer",
                                      )
                                    : "") ||
                                  (fromList
                                    ? formatPersonName(fromList.firstName, fromList.lastName, "Dealer")
                                    : "Unknown Dealer")
                                const dealerMobile =
                                  (nestedDealer && typeof nestedDealer === "object"
                                    ? String(nestedDealer.mobile || nestedDealer.phone || "").trim()
                                    : "") ||
                                  fromList?.mobile ||
                                  "—"
                                const statusLabel = installerQueueStatusDisplayLabel(installerStatus)
                                const revertFromInstallation = getAdminInstallationTabRevertState(
                                  quotation as unknown as Record<string, unknown>,
                                  installerStatus,
                                  readInstallerReleaseMap(),
                                )
                                const showExpanded =
                                  adminInstallExpandedId === quotation.id &&
                                  adminInstallQuotation?.id === quotation.id
                                const showDetailRow = showExpanded
                          return (
                                  <Fragment key={quotation.id}>
                                    <tr
                                      className={cn(
                                        "border-b border-border/50 transition-colors",
                                        overdueUi.row,
                                      )}
                                      title={overdueUi.title}
                                    >
                                      <td className="px-3 py-2.5 align-middle">
                                        <div className="min-w-[11rem] max-w-[14rem]">
                                          <p className="text-sm font-semibold leading-tight truncate">
                                            {formatPersonName(
                                              quotation.customer.firstName,
                                              quotation.customer.lastName,
                                              "Unknown",
                                            )}
                                          </p>
                                          <p className="text-[11px] text-muted-foreground truncate">
                                            {quotation.customer.mobile || "No mobile"}
                                          </p>
                                          <p className="text-[10px] font-medium text-muted-foreground/90 truncate">
                                            {quotation.id}
                                          </p>
                                  </div>
                                      </td>
                                      <td className="px-3 py-2.5 align-middle">
                                        <div className="min-w-[8.5rem] max-w-[11rem]">
                                          <p
                                            className="text-xs font-medium leading-tight truncate text-primary"
                                            title={dealerName}
                                          >
                                            {dealerName}
                                          </p>
                                          <p className="text-[11px] text-muted-foreground truncate">
                                            {dealerMobile}
                                          </p>
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
                                      id={`install-date-${quotation.id}`}
                                      type="date"
                                            className="h-8 text-xs w-[9.5rem]"
                                      value={installationDateInputValue}
                                      disabled={!sentParsedOk}
                                      onChange={(e) => {
                                        const v = e.target.value
                                        const id = quotation.id
                                        setQuotations((prev) =>
                                          prev.map((q) =>
                                            q.id === id ? { ...q, installationScheduledAt: v || undefined } : q,
                                          ),
                                        )
                                        setInstallationScheduledDateInLocalMap(id, v || undefined)
                                        try {
                                          const all = JSON.parse(localStorage.getItem("quotations") || "[]")
                                          const next = Array.isArray(all)
                                            ? all.map((qRow: any) =>
                                                qRow?.id === id
                                                  ? { ...qRow, installationScheduledAt: v || undefined }
                                                  : qRow,
                                              )
                                            : all
                                          localStorage.setItem("quotations", JSON.stringify(next))
                                        } catch {
                                          // no-op
                                        }
                                        void (async () => {
                                          if (!useApi) return
                                          try {
                                                  await api.admin.quotations.updateInstallationScheduledDate(
                                                    id,
                                                    v || null,
                                                  )
                                          } catch {
                                            // Local map + quotations JSON already updated; API route may not exist yet.
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
                                    <Select
                                      key={`inst-team-${quotation.id}-${installationTeamsRefresh}`}
                                      value={getInstallationTeamIdForQuotation(quotation.id, qAny) || "__none__"}
                                      onValueChange={(v) =>
                                            void persistInstallationTeamAssignment(
                                              quotation.id,
                                              v === "__none__" ? "" : v,
                                            )
                                      }
                                    >
                                          <SelectTrigger className="h-8 text-xs w-[9.5rem]">
                                        <SelectValue placeholder="Unassigned" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__none__">Unassigned</SelectItem>
                                        {installationTeams.map((t) => (
                                          <SelectItem key={t.id} value={t.id}>
                                            {t.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                      </td>
                                      <td className="px-3 py-2.5 align-middle">
                                        <Badge
                                          variant="outline"
                                          className={cn(
                                            "text-[10px] capitalize font-medium",
                                            installerStageBadgeTone(installerStatus),
                                          )}
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
                                                onClick={() =>
                                                  void updateOperationalStage(quotation.id, "installer_in_progress")
                                                }
                                              >
                                          <Clock3 className="w-3.5 h-3.5" />
                                          <span className="sr-only">Start</span>
                                        </Button>
                                              <Button
                                                size="sm"
                                                className="h-8 w-8 shrink-0 p-0"
                                                title="Upload"
                                                onClick={() => void openAdminInstallDialog(quotation)}
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
                                              onClick={() => void openAdminInstallDialog(quotation)}
                                            >
                                        <ChevronDown className="w-3.5 h-3.5" />
                                              <span className="sr-only">
                                                {installerStatus === "partial" ? "Continue" : "Upload"}
                                              </span>
                                      </Button>
                                    ) : null}
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 w-8 shrink-0 p-0"
                                            title="Timeline"
                                            onClick={() => setStatusHistoryQuotation(quotation)}
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
                                          !revertFromInstallation.enabled ||
                                            retrievingFromInstallationId === quotation.id
                                            ? "opacity-60"
                                            : "",
                                        )}
                                        title={revertFromInstallation.hint || "Revert to Accounts"}
                                        disabled={
                                          !revertFromInstallation.enabled ||
                                          retrievingFromInstallationId === quotation.id
                                        }
                                        onClick={() => void handleRetrieveFromInstallation(quotation)}
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        <span className="sr-only">
                                          {retrievingFromInstallationId === quotation.id
                                            ? "Reverting..."
                                            : "Revert"}
                                        </span>
                                      </Button>
                                    ) : null}
                                    {installerStatus === "approved" || installerStatus === "partial" ? (
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="h-8 w-8 shrink-0 p-0"
                                          title="View uploaded installation photos"
                                          onClick={() => openInstallPhotosViewer(quotation)}
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
                                          onClick={() => void openAdminInstallDialog(quotation)}
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
                                          onClick={() =>
                                            setInstallRevertTarget({
                                              id: quotation.id,
                                              label: formatPersonName(
                                                quotation.customer.firstName,
                                                quotation.customer.lastName,
                                                quotation.id,
                                              ),
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
                                    {showDetailRow ? (
                                      <tr className="border-b border-border/50 bg-muted/15">
                                        <td colSpan={7} className="px-3 py-3">
                                          {showExpanded && adminInstallQuotation ? (
                                    <InstallationCompletionPanel
                                      imageFields={
                                        ADMIN_INSTALLATION_IMAGE_FIELDS as readonly {
                                          key: string
                                          label: string
                                          required?: boolean
                                          multiple?: boolean
                                        }[]
                                      }
                                              filesByField={
                                                adminInstallMediaByField as Record<
                                                  string,
                                                  InstallationUploadedFile[] | undefined
                                                >
                                              }
                                      onFilesChange={(fieldKey, files) =>
                                        setAdminInstallMediaByField((prev) => ({
                                          ...prev,
                                          [fieldKey]: files.map((f) => ({
                                            name: f.name,
                                            url: URL.createObjectURL(f),
                                            localFile: f,
                                          })),
                                        }))
                                      }
                                              piFiles={adminInstallPiMedia}
                                              onPiFilesChange={(files) => {
                                                if (!files.length) return
                                                setAdminInstallPiMedia((prev) => [
                                                  ...prev,
                                                  ...files.map((f) => ({
                                                    name: f.name,
                                                    url: URL.createObjectURL(f),
                                                    localFile: f,
                                                  })),
                                                ])
                                              }}
                                              onRemovePiFile={(index) =>
                                                setAdminInstallPiMedia((prev) => prev.filter((_, i) => i !== index))
                                      }
                                      extraExpenses={adminInstallExtraExpenses}
                                      onAddExpense={() =>
                                        setAdminInstallExtraExpenses((prev) => [
                                          ...prev,
                                          { id: newAdminExpenseLineId(), description: "", amount: "" },
                                        ])
                                      }
                                      onExpenseChange={(id, patch) =>
                                        setAdminInstallExtraExpenses((prev) =>
                                          prev.map((line) => (line.id === id ? { ...line, ...patch } : line)),
                                        )
                                      }
                                      onRemoveExpense={(id) =>
                                                setAdminInstallExtraExpenses((prev) =>
                                                  prev.filter((line) => line.id !== id),
                                                )
                                      }
                                      dimensions={adminInstallDimensions}
                                      onDimensionsChange={(next) =>
                                        setAdminInstallDimensions((prev) => ({
                                          ...prev,
                                          ...(next.length !== undefined ? { length: next.length } : {}),
                                          ...(next.width !== undefined ? { width: next.width } : {}),
                                          ...(next.height !== undefined ? { height: next.height } : {}),
                                        }))
                                      }
                                      notes={adminInstallNotes}
                                      onNotesChange={setAdminInstallNotes}
                                      infoSections={[
                                        {
                                          title: "Customer Details",
                                          rows: [
                                            {
                                              label: "Customer",
                                              value: formatPersonName(
                                                adminInstallQuotation.customer.firstName,
                                                adminInstallQuotation.customer.lastName,
                                                "N/A",
                                              ),
                                            },
                                                    {
                                                      label: "Mobile",
                                                      value: adminInstallQuotation.customer.mobile || "N/A",
                                                    },
                                                    {
                                                      label: "Agent",
                                                      value: getDealerName(adminInstallQuotation.dealerId),
                                                    },
                                                    {
                                                      label: "Agent Mobile",
                                                      value: getDealerMobile(adminInstallQuotation.dealerId),
                                                    },
                                          ],
                                        },
                                        {
                                          title: "Visitor / Location Details",
                                          rows: [
                                            {
                                              label: "Visit Location",
                                              value: (() => {
                                                const rawAddress = adminInstallQuotation.customer.address
                                                const addressText =
                                                  rawAddress && typeof rawAddress === "object"
                                                            ? [
                                                                rawAddress.street,
                                                                rawAddress.city,
                                                                rawAddress.state,
                                                                rawAddress.pincode,
                                                              ]
                                                        .filter(Boolean)
                                                        .join(", ")
                                                    : String(rawAddress || "")
                                                        return (
                                                          (adminInstallQuotation as any).visitLocation ||
                                                          (adminInstallQuotation as any).location ||
                                                          addressText ||
                                                          "N/A"
                                                        )
                                              })(),
                                            },
                                          ],
                                        },
                                        {
                                          title: "Product Specification",
                                          rows: (() => {
                                                    const productSpec =
                                                      getAdminInstallProductSpec(adminInstallQuotation)
                                            return [
                                                      {
                                                        label: "System Type",
                                                        value: String(productSpec.systemType || "N/A"),
                                                      },
                                              {
                                                label: "Panel Configuration",
                                                value: `${String(productSpec.panelBrand || "N/A")} ${String(productSpec.panelSize || "")} x ${String(productSpec.panelQuantity || "0")}`,
                                              },
                                              {
                                                label: "Inverter",
                                                value: `${String(productSpec.inverterBrand || "N/A")} - ${String(productSpec.inverterSize || "N/A")}`,
                                              },
                                                      {
                                                        label: "Phase",
                                                        value: String(productSpec.phase || "N/A"),
                                                      },
                                              {
                                                label: "Structure",
                                                value: `${String(productSpec.structureType || "N/A")} - ${String(productSpec.structureSize || "N/A")}`,
                                              },
                                            ]
                                          })(),
                                        },
                                      ]}
                                      saveLabel="Complete & Mark as Approved"
                                              secondarySaveLabel="Partial Approved"
                                      saving={adminInstallSaving}
                                      onCancel={() => setAdminInstallExpandedId(null)}
                                              onSave={() => void submitAdminInstallationUpload("approved")}
                                              onSecondarySave={() => void submitAdminInstallationUpload("partial")}
                                    />
                                ) : null}
                                        </td>
                                      </tr>
                                    ) : null}
                                  </Fragment>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                        <IncrementalListSentinel
                          sentinelRef={quotationListSentinelRef}
                          visibleCount={visibleQuotationCount}
                          totalCount={activeQuotationListTotal}
                          hasMore={hasMoreQuotationList}
                          onLoadMore={loadMoreQuotationList}
                        />
                      </div>
                    )
                  })()
                ) : isAdminDataLoading && quotations.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Loading quotations from API...</p>
                  </div>
                ) : activeQuotationList.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No quotations found</p>
                  </div>
                ) : (
                  <>
                    {/* Mobile Card View */}
                    <div className="block md:hidden space-y-3 native-scroll-list max-h-[min(70vh,820px)] overflow-y-auto overscroll-y-contain pr-1">
                      {visibleQuotationList.map((quotation) => (
                        <div
                          key={quotation.id}
                          className={`p-4 rounded-lg border-2 ${getStatusColor(quotation.status)}`}
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                              <p className="text-xs font-mono text-muted-foreground mb-1">{quotation.id}</p>
                              {getAdminOlderCount(quotation) > 0 ? (
                                <Badge variant="outline" className="mb-1 text-[10px]">
                                  {getAdminOlderCount(quotation)} older
                                </Badge>
                              ) : null}
                              <p className="font-semibold text-sm">
                                {formatPersonName(quotation.customer.firstName, quotation.customer.lastName, "Unknown")}
                              </p>
                              <p className="text-xs text-muted-foreground">{quotation.customer.mobile}</p>
                            </div>
                            <Badge className={`text-xs ${getStatusBadgeColor(quotation.status)}`}>
                              {(quotation.status || "pending").charAt(0).toUpperCase() +
                                (quotation.status || "pending").slice(1)}
                            </Badge>
                          </div>
                          
                          <div className="space-y-2 mb-3">
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Agent:</span>
                              <span className="font-medium">{getDealerName(quotation.dealerId)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Amount:</span>
                              {(() => {
                                const amt = QuotationApprovedAmountLines(quotation)
                                return (
                                  <span className="text-right font-semibold">
                                    <span className="block">₹{amt.total.toLocaleString("en-IN")}</span>
                                    {amt.paymentType === "mix" && amt.loan != null ? (
                                      <span className="block text-[10px] font-normal text-muted-foreground">
                                        Loan ₹{amt.loan.toLocaleString("en-IN")}
                                      </span>
                                    ) : null}
                                    {amt.paymentType === "mix" && amt.cash != null ? (
                                      <span className="block text-[10px] font-normal text-muted-foreground">
                                        Cash ₹{amt.cash.toLocaleString("en-IN")}
                                      </span>
                                    ) : null}
                                    {amt.paymentType === "loan" && amt.loan != null ? (
                                      <span className="block text-[10px] font-normal text-muted-foreground">
                                        Loan ₹{amt.loan.toLocaleString("en-IN")}
                                      </span>
                                    ) : null}
                                  </span>
                                )
                              })()}
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">System:</span>
                              <Badge variant="outline" className="text-xs">{getSystemSize(quotation)}</Badge>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Created:</span>
                              <span className="text-xs">{new Date(quotation.createdAt).toLocaleString()}</span>
                            </div>
                            {quotation.fileLoginAt ? (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">File login:</span>
                                <span className="text-xs">{new Date(quotation.fileLoginAt).toLocaleString()}</span>
                              </div>
                            ) : null}
                            {quotation.statusApprovedAt ? (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Approved:</span>
                                <span className="text-xs">{new Date(quotation.statusApprovedAt).toLocaleString()}</span>
                              </div>
                            ) : null}
                          </div>

                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">File login</p>
                            <Select
                              value={
                                optimisticFileLoginSelect[quotation.id] ??
                                quotation.fileLoginStatus ??
                                "unset"
                              }
                              onValueChange={(value) => void handleFileLoginSelectChange(quotation, value)}
                            >
                              <SelectTrigger className="w-full h-9 text-xs">
                                <SelectValue placeholder="File login" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unset">Not set</SelectItem>
                                <SelectItem value="already_login">Already logged in</SelectItem>
                                <SelectItem value="login_now">Login now</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-[10px] text-muted-foreground leading-snug">{fileLoginRowSummary(quotation)}</p>
                          </div>

                          <div className="space-y-2">
                            <Select
                              value={quotation.status || "pending"}
                              onValueChange={(value) => handleQuotationStatusChange(quotation.id, value as QuotationStatus)}
                            >
                              <SelectTrigger className="w-full h-9 text-xs">
                                <SelectValue placeholder="Change Status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="approved">Approved</SelectItem>
                                <SelectItem value="rejected">Rejected</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                              </SelectContent>
                            </Select>
                            <div className="h-9 rounded-md border border-border/70 px-2 flex items-center text-xs capitalize bg-muted/30">
                              {getQuotationOpsStageLabel(quotation)}
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-snug">
                              Ops: {getQuotationOpsStageLabel(quotation)}
                            </p>

                            <div className="flex gap-2 flex-wrap">
                              {getAdminOlderCount(quotation) > 0 ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openAdminQuotationHistory(quotation)}
                                  className="flex-1"
                                  title="Quotation history"
                                >
                                  <History className="w-3 h-3 mr-1" />
                                  History
                                </Button>
                              ) : null}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingQuotation(quotation)
                                  setEditDialogOpen(true)
                                }}
                                className="flex-1"
                              >
                                <Edit className="w-3 h-3 mr-1" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  openDocumentsDialog(quotation)
                                }}
                                className="flex-1"
                              >
                                <FileText className="w-3 h-3 mr-1" />
                                Docs
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedQuotation(quotation)
                                  setDialogOpen(true)
                                }}
                                className="flex-1"
                              >
                                <Eye className="w-3 h-3 mr-1" />
                                View
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setStatusHistoryQuotation(quotation)}
                                className="flex-1"
                                title="Status timeline"
                              >
                                <Clock3 className="w-3 h-3 mr-1" />
                                Timeline
                              </Button>
                              {(() => {
                                const sendToMetering = getAdminQuotationsTabSendToMeteringState(quotation)
                                const retrieveFromMetering = getAdminQuotationsTabRetrieveState(
                                  quotation,
                                  adminMeteringStageOverride[quotation.id],
                                )
                                if (sendToMetering.visible) {
                                  return (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className={`flex-1 ${!sendToMetering.enabled || sendingToMeteringId === quotation.id ? "opacity-60" : ""}`}
                                      onClick={() => void handleSendToMetering(quotation)}
                                      disabled={!sendToMetering.enabled || sendingToMeteringId === quotation.id}
                                      title={sendToMetering.hint || "Send to Metering"}
                                    >
                                      <Gauge className="w-3 h-3 mr-1" />
                                      {sendingToMeteringId === quotation.id ? "Sending..." : "Send to Metering"}
                                    </Button>
                                  )
                                }
                                if (retrieveFromMetering.visible) {
                                  return (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className={`flex-1 ${!retrieveFromMetering.enabled || retrievingFromMeteringId === quotation.id ? "opacity-60" : ""}`}
                                      onClick={() => void handleRetrieveFromMetering(quotation)}
                                      disabled={!retrieveFromMetering.enabled || retrievingFromMeteringId === quotation.id}
                                      title={retrieveFromMetering.hint || "Retrieve from Metering"}
                                    >
                                      <RotateCcw className="w-3 h-3 mr-1" />
                                      {retrievingFromMeteringId === quotation.id ? "Retrieving..." : "Retrieve"}
                                    </Button>
                                  )
                                }
                                return null
                              })()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto rounded-xl border border-border/70 bg-card shadow-sm">
                      <table className="w-full min-w-[72rem] border-collapse text-left">
                        <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur supports-[backdrop-filter]:bg-muted/70">
                          <tr className="border-b border-border/70 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <th className="text-left py-2.5 px-2 whitespace-nowrap">Quotation ID</th>
                            <th className="text-left py-2.5 px-2 whitespace-nowrap">Customer</th>
                            <th className="text-left py-2.5 px-2 whitespace-nowrap">Agent/Dealer</th>
                            <th className="text-right py-2.5 px-2 whitespace-nowrap">Amount</th>
                            <th className="text-left py-2.5 px-2 whitespace-nowrap">Status</th>
                            <th className="text-left py-2.5 px-2 whitespace-nowrap">Ops</th>
                            <th className="text-left py-2.5 px-2 whitespace-nowrap">File login</th>
                            <th className="text-left py-2.5 px-2 whitespace-nowrap">Payment</th>
                            <th className="text-left py-2.5 px-2 whitespace-nowrap">Bank</th>
                            <th className="text-right py-2.5 px-2 whitespace-nowrap">Created</th>
                            <th className="text-right py-2.5 px-2 whitespace-nowrap md:sticky md:right-0 md:bg-muted/90 md:z-10 md:shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleQuotationList.map((quotation) => {
                            const customerName = formatPersonName(
                              quotation.customer.firstName,
                              quotation.customer.lastName,
                              "Unknown",
                            )
                            const dealerName = getDealerName(quotation.dealerId, quotation)
                            const dealerMobile = getDealerMobile(quotation.dealerId, quotation)
                            const opsLabel = getQuotationOpsStageLabel(quotation)
                            const fileLoginSummary = fileLoginRowSummary(quotation)
                            const amountLines = QuotationApprovedAmountLines(quotation)
                            const createdLabel = new Date(quotation.createdAt).toLocaleDateString("en-IN")
                            const datesTitle = [
                              `Created ${new Date(quotation.createdAt).toLocaleString("en-IN")}`,
                              quotation.fileLoginAt
                                ? `File login ${new Date(quotation.fileLoginAt).toLocaleString("en-IN")}`
                                : null,
                              quotation.statusApprovedAt
                                ? `Approved ${new Date(quotation.statusApprovedAt).toLocaleString("en-IN")}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")
                            return (
                            <tr
                              key={quotation.id}
                              className={cn(
                                "border-b border-border/50 last:border-0 transition-colors hover:bg-muted/30",
                                getStatusColor(quotation.status),
                              )}
                            >
                              <td className="py-2 px-2 align-middle whitespace-nowrap">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-xs font-mono font-medium">{quotation.id}</span>
                                  {getAdminOlderCount(quotation) > 0 ? (
                                    <Badge variant="outline" className="w-fit text-[10px]">
                                      {getAdminOlderCount(quotation)} older
                                    </Badge>
                                  ) : null}
                                </div>
                              </td>
                              <td className="py-2 px-2 align-middle">
                                <div className="min-w-[9rem] max-w-[12rem]">
                                  <p className="text-sm font-semibold leading-tight truncate" title={customerName}>
                                    {customerName}
                                  </p>
                                  <p
                                    className="text-[11px] text-muted-foreground truncate"
                                    title={quotation.customer.mobile || quotation.customer.email || undefined}
                                  >
                                    {quotation.customer.mobile || quotation.customer.email || "—"}
                                  </p>
                                </div>
                              </td>
                              <td className="py-2 px-2 align-middle">
                                <div className="min-w-[8rem] max-w-[11rem]">
                                  <p className="text-xs font-medium leading-tight truncate" title={dealerName}>
                                    {dealerName}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground truncate" title={dealerMobile}>
                                    {dealerMobile}
                                  </p>
                                </div>
                              </td>
                              <td className="py-2 px-2 text-right align-middle whitespace-nowrap">
                                <p className="text-sm font-semibold">
                                  ₹{amountLines.total.toLocaleString("en-IN")}
                                </p>
                                {amountLines.paymentType === "mix" && amountLines.loan != null ? (
                                  <p className="text-[10px] text-muted-foreground">
                                    Loan ₹{amountLines.loan.toLocaleString("en-IN")}
                                  </p>
                                ) : null}
                                {amountLines.paymentType === "mix" && amountLines.cash != null ? (
                                  <p className="text-[10px] text-muted-foreground">
                                    Cash ₹{amountLines.cash.toLocaleString("en-IN")}
                                  </p>
                                ) : null}
                                {amountLines.paymentType === "loan" && amountLines.loan != null ? (
                                  <p className="text-[10px] text-muted-foreground">
                                    Loan ₹{amountLines.loan.toLocaleString("en-IN")}
                                  </p>
                                ) : null}
                              </td>
                              <td className="py-2 px-2 align-middle">
                                  <Select
                                    value={quotation.status || "pending"}
                                  onValueChange={(value) =>
                                    handleQuotationStatusChange(quotation.id, value as QuotationStatus)
                                  }
                                  >
                                  <SelectTrigger className="h-8 w-[7.5rem] text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="pending">Pending</SelectItem>
                                      <SelectItem value="approved">Approved</SelectItem>
                                      <SelectItem value="rejected">Rejected</SelectItem>
                                      <SelectItem value="completed">Completed</SelectItem>
                                    </SelectContent>
                                  </Select>
                              </td>
                              <td className="py-2 px-2 align-middle">
                                  <Badge
                                  variant="outline"
                                  className="text-[10px] capitalize font-medium max-w-[8.5rem] truncate"
                                  title={opsLabel}
                                  >
                                  {opsLabel}
                                  </Badge>
                              </td>
                              <td className="py-2 px-2 align-middle">
                                  <Select
                                    value={
                                      optimisticFileLoginSelect[quotation.id] ??
                                      quotation.fileLoginStatus ??
                                      "unset"
                                    }
                                    onValueChange={(value) => void handleFileLoginSelectChange(quotation, value)}
                                  >
                                  <SelectTrigger
                                    className="h-8 w-[8.5rem] text-xs"
                                    title={fileLoginSummary}
                                  >
                                      <SelectValue placeholder="File login" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="unset">Not set</SelectItem>
                                      <SelectItem value="already_login">Already logged in</SelectItem>
                                      <SelectItem value="login_now">Login now</SelectItem>
                                    </SelectContent>
                                  </Select>
                              </td>
                              <td className="py-2 px-2 align-middle">
                                <p
                                  className="text-xs font-medium max-w-[6.5rem] truncate"
                                  title={getQuotationPaymentTypeLabel(quotation)}
                                >
                                  {getQuotationPaymentTypeLabel(quotation)}
                                </p>
                              </td>
                              <td className="py-2 px-2 align-middle">
                                <p
                                  className="text-xs max-w-[8rem] truncate"
                                  title={getQuotationBankDetails(quotation)}
                                >
                                  {getQuotationBankDetails(quotation)}
                                </p>
                              </td>
                              <td className="py-2 px-2 text-right align-middle whitespace-nowrap">
                                <p className="text-xs text-muted-foreground" title={datesTitle}>
                                  {createdLabel}
                                </p>
                              </td>
                              <td className="py-2 px-2 text-right align-middle md:sticky md:right-0 md:bg-inherit md:z-10 md:shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                                <AdminQuotationRowActions
                                  quotation={quotation}
                                  sendingToMeteringId={sendingToMeteringId}
                                  retrievingFromMeteringId={retrievingFromMeteringId}
                                  meteringStageOverride={adminMeteringStageOverride[quotation.id]}
                                  olderCount={getAdminOlderCount(quotation)}
                                  onSendToMetering={(q) => void handleSendToMetering(q)}
                                  onRetrieveFromMetering={(q) => void handleRetrieveFromMetering(q)}
                                  onTimeline={setStatusHistoryQuotation}
                                  onQuotationHistory={openAdminQuotationHistory}
                                  onDocuments={openDocumentsDialog}
                                  onView={(q) => {
                                    setSelectedQuotation(q)
                                    setDialogOpen(true)
                                  }}
                                />
                              </td>
                            </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <IncrementalListSentinel
                      sentinelRef={quotationListSentinelRef}
                      visibleCount={visibleQuotationCount}
                      totalCount={activeQuotationListTotal}
                      hasMore={hasMoreQuotationList}
                      onLoadMore={loadMoreQuotationList}
                      className="pt-4"
                    />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Tab (formerly Dealers) */}
          <TabsContent value="dealers" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                  <div>
                    <CardTitle>Users ({managedUsers.length})</CardTitle>
                    <CardDescription className="mt-1">
                      All dealers, operations users, and visitors. Edit to update details and dashboard access.
                    </CardDescription>
                  </div>
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => openCreateUnifiedUser(["quotation"])}
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Create User ID
                  </Button>
                </div>
                <div className="mt-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, email, mobile, username, access..."
                      value={dealerSearchTerm}
                      onChange={(e) => setDealerSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {filteredManagedUsers.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Building className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No users found</p>
                    </div>
                  ) : (
                    <>
                      {visibleManagedUsers.map((row) => {
                      const d = row.dealer
                      const v = row.visitor
                      const dealerStats = d ? dealerQuotationStatsById.get(d.id) : undefined
                      const dealerRevenue = dealerStats?.revenue ?? 0
                      const dealerQuotationCount = dealerStats?.count ?? 0
                      const visitCount = v ? Number((v as any).visitCount || 0) : 0
                      const isPending = row.kind === "dealer" && row.isActive === false
                      const isInactive = row.isActive === false
                      return (
                        <div
                          key={row.id}
                          className={`p-4 border rounded-lg ${isPending || (row.kind === "visitor" && isInactive) ? "opacity-75 bg-muted/30 border-orange-200" : ""}`}
                        >
                          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <h3 className="font-semibold text-lg">
                                  {row.firstName} {row.lastName}
                                </h3>
                                <Badge variant="outline" className="text-xs capitalize">
                                  {row.roleLabel}
                                </Badge>
                                {row.kind === "dealer" && row.username === ADMIN_USERNAME ? (
                                  <Badge variant="default">Admin</Badge>
                                ) : null}
                                {isPending ? (
                                  <Badge variant="secondary" className="bg-orange-500">Pending Approval</Badge>
                                ) : isInactive ? (
                                  <Badge variant="secondary">Inactive</Badge>
                                ) : (
                                  <Badge className="bg-green-500">Active</Badge>
                                )}
                                {row.accessLabelList?.map((label) => (
                                  <Badge key={label} variant="secondary" className="text-xs">
                                    {label}
                                  </Badge>
                                ))}
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground break-words">
                                <div>
                                  <span className="font-medium">Email:</span> <span className="break-all">{row.email}</span>
                                  {row.emailVerified === false ? <Badge variant="outline" className="ml-2 text-xs">Unverified</Badge> : null}
                                </div>
                                <div>
                                  <span className="font-medium">Mobile:</span> {row.mobile}
                                </div>
                                <div>
                                  <span className="font-medium">Username:</span> {row.username}
                                </div>
                                {v?.employeeId ? (
                                  <div>
                                    <span className="font-medium">Employee ID:</span> {v.employeeId}
                                  </div>
                                ) : null}
                                {d?.gender ? (
                                  <div>
                                    <span className="font-medium">Gender:</span> {d.gender}
                                  </div>
                                ) : null}
                                {d?.address ? (
                                  <div className="md:col-span-2">
                                    <span className="font-medium">Address:</span>{" "}
                                    <span className="break-words">
                                      {[d.address.street, d.address.city, d.address.state, d.address.pincode]
                                        .filter(Boolean)
                                        .join(", ")}
                                    </span>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <div className="w-full lg:w-auto lg:ml-4 space-y-2 text-left lg:text-right">
                              {row.kind === "dealer" ? (
                                <div>
                                  <div className="text-lg font-semibold">₹{(dealerRevenue / 100000).toFixed(1)}L</div>
                                  <div className="text-sm text-muted-foreground">{dealerQuotationCount} quotations</div>
                                </div>
                              ) : null}
                              {row.kind === "visitor" ? (
                                <div>
                                  <div className="text-lg font-semibold">{visitCount}</div>
                                  <div className="text-sm text-muted-foreground">visits assigned</div>
                                </div>
                              ) : null}
                              {row.kind === "dealer" && isPending && d ? (
                                <Button
                                  size="sm"
                                  className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
                                  onClick={async () => {
                                    if (!confirm(`Are you sure you want to approve and activate ${d.firstName} ${d.lastName}?`)) return
                                    try {
                                      if (useApi) {
                                        try {
                                          await api.admin.dealers.activate(d.id)
                                        } catch {
                                          await api.admin.dealers.update(d.id, { isActive: true })
                                        }
                                        await loadData()
                                      } else {
                                        const updated = dealers.map((dealer) =>
                                          dealer.id === d.id ? { ...dealer, isActive: true } : dealer
                                        )
                                        setDealers(updated)
                                      }
                                    } catch (error) {
                                      console.error("Error activating dealer:", error)
                                      alert(error instanceof ApiError ? error.message : "Failed to activate dealer")
                                    }
                                  }}
                                >
                                  <UserCheck className="w-3 h-3 mr-1" />
                                  Approve
                                </Button>
                              ) : null}
                              {row.kind === "dealer" && d ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full sm:w-auto"
                                  onClick={() => {
                                    setSelectedDealer(d)
                                    setDealerDialogOpen(true)
                                  }}
                                >
                                  <Eye className="w-3 h-3 mr-1" />
                                  View Details
                                </Button>
                              ) : null}
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full sm:w-auto"
                                onClick={() => openManagedUserEdit(row)}
                              >
                                <Edit className="w-3 h-3 mr-1" />
                                Edit
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                      })}
                      <IncrementalListSentinel
                        sentinelRef={managedUsersSentinelRef}
                        visibleCount={visibleManagedUsersCount}
                        totalCount={filteredManagedUsersTotal}
                        hasMore={hasMoreManagedUsers}
                        onLoadMore={loadMoreManagedUsers}
                      />
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Customers Tab */}
          <TabsContent value="customers" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle>All Customers ({customers.length})</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">Customers from all dealers</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search customers by name, mobile, email, or dealer..."
                      value={customerSearchTerm}
                      onChange={(e) => setCustomerSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <CityMultiSelectFilter
                    value={customerFilterCities}
                    onChange={setCustomerFilterCities}
                    className="w-full sm:w-52"
                  />
                </div>
                {(() => {
                  const filteredCustomers = customers.filter((c) => {
                    if (!matchesCityFilter(c, customerFilterCities)) return false
                    if (!customerSearchTerm.trim()) return true
                    const searchLower = customerSearchTerm.toLowerCase()
                    return (
                      c.firstName.toLowerCase().includes(searchLower) ||
                      c.lastName.toLowerCase().includes(searchLower) ||
                      c.mobile.includes(customerSearchTerm) ||
                      c.email.toLowerCase().includes(searchLower) ||
                      c.dealers.some((d: string) => d.toLowerCase().includes(searchLower))
                    )
                  })

                  if (filteredCustomers.length === 0) {
                    return (
                      <div className="text-center py-12 text-muted-foreground">
                        <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No customers found</p>
                        {customerSearchTerm || customerFilterCities.length > 0 ? (
                          <Button
                            variant="link"
                            onClick={() => {
                              setCustomerSearchTerm("")
                              setCustomerFilterCities([])
                            }}
                            className="mt-2"
                          >
                            Clear filters
                          </Button>
                        ) : null}
                      </div>
                    )
                  }

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredCustomers.map((customer) => (
                        <div
                          key={customer.mobile}
                          className="border border-border rounded-lg p-4 hover:border-primary/50 transition-colors"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <h3 className="font-medium">
                                {customer.firstName} {customer.lastName}
                              </h3>
                              <p className="text-sm text-muted-foreground">{customer.mobile}</p>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <FileText className="w-3 h-3" />
                              {customer.quotationCount}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">{customer.email}</p>
                          {customer.dealers && customer.dealers.length > 0 && (
                            <div className="mb-2">
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium">Dealers:</span> {customer.dealers.join(", ")}
                              </p>
                            </div>
                          )}
                          <div className="mb-2">
                            <div className="text-xs text-muted-foreground mb-1">
                              {customer.address?.street && (
                                <div className="mb-1">{customer.address.street}</div>
                              )}
                              <div>
                                {[
                                  customer.address?.city,
                                  customer.address?.state,
                                  customer.address?.pincode
                                ].filter(Boolean).join(", ")}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-sm mb-2">
                            <span className="text-muted-foreground text-xs">
                              Total Spent
                            </span>
                            <span className="font-medium text-primary">₹{Math.abs(customer.totalAmount || 0).toLocaleString()}</span>
                          </div>
                          {customer.lastQuotation && customer.lastQuotation !== "" && !isNaN(new Date(customer.lastQuotation).getTime()) && (
                            <p className="text-xs text-muted-foreground mb-3">
                              Last: {new Date(customer.lastQuotation).toLocaleDateString()}
                            </p>
                          )}
                          <div className="flex gap-2 mt-3">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={async () => {
                                // Load full customer details if we have an ID
                                if (customer.id && useApi) {
                                  try {
                                    const response = await api.customers.getById(customer.id)
                                    const fullCustomer = response.customer || response.data || response
                                    setEditingCustomer({
                                      ...customer,
                                      ...fullCustomer,
                                      address: {
                                        street: fullCustomer.address?.street || customer.address?.street || "",
                                        city: fullCustomer.address?.city || customer.address?.city || "",
                                        state: fullCustomer.address?.state || customer.address?.state || "",
                                        pincode: fullCustomer.address?.pincode || customer.address?.pincode || "",
                                      },
                                    })
                                  } catch (error) {
                                    console.error("Error loading customer details:", error)
                                    setEditingCustomer(customer)
                                  }
                                } else {
                                  setEditingCustomer(customer)
                                }
                                setCustomerEditForm({
                                  firstName: customer.firstName || "",
                                  lastName: customer.lastName || "",
                                  mobile: customer.mobile || "",
                                  email: customer.email || "",
                                  address: {
                                    street: customer.address?.street || "",
                                    city: customer.address?.city || "",
                                    state: customer.address?.state || "",
                                    pincode: customer.address?.pincode || "",
                                  },
                                })
                                setCustomerEditDialogOpen(true)
                              }}
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              Edit
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Visitors Tab — Admin Visitor checkbox users (not legacy visitors table only) */}
          <TabsContent value="visitors" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                  <CardTitle>All Visitors ({visitorAccessUsers.length})</CardTitle>
                  <Button
                    onClick={() => openCreateUnifiedUser(["visitor"])}
                    className="w-full sm:w-auto"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Create Visitor
                  </Button>
                </div>
                <CardDescription className="mt-1">
                  Users with the Visitor checkbox in Admin → Users (dealers, ops, and visitors).
                </CardDescription>
                <div className="mt-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, email, mobile, employee ID..."
                      value={visitorSearchTerm}
                      onChange={(e) => setVisitorSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {(() => {
                  const filteredVisitors = visitorAccessUsers.filter((v) => {
                    if (!visitorSearchTerm.trim()) return true
                    const search = visitorSearchTerm.toLowerCase()
                    return (
                      v.firstName.toLowerCase().includes(search) ||
                      v.lastName.toLowerCase().includes(search) ||
                      v.email.toLowerCase().includes(search) ||
                      v.mobile.includes(search) ||
                      (v.employeeId && v.employeeId.toLowerCase().includes(search)) ||
                      v.username.toLowerCase().includes(search)
                    )
                  })

                  if (filteredVisitors.length === 0) {
                    return (
                      <div className="text-center py-12 text-muted-foreground">
                        <UserCheck className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No users with Visitor access found</p>
                      </div>
                    )
                  }

                  return (
                    <div className="space-y-4">
                      {filteredVisitors.map((visitor) => {
                        const visitCount = visitor.visitCount || 0

                        return (
                          <div
                            key={visitor.rowId}
                            className={`p-4 border rounded-lg ${visitor.isActive === false ? "opacity-60 bg-muted/30" : ""}`}
                          >
                            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  <h3 className="font-semibold text-lg">
                                    {visitor.firstName} {visitor.lastName}
                                  </h3>
                                  {visitor.isActive === false ? (
                                    <Badge variant="secondary">Inactive</Badge>
                                  ) : (
                                    <Badge className="bg-green-500">Active</Badge>
                                  )}
                                  <Badge variant="outline">{visitor.managed.roleLabel}</Badge>
                                  {accessLabels(visitor.access).map((label) => (
                                    <Badge key={label} variant="secondary" className="text-xs">
                                      {label}
                                    </Badge>
                                  ))}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground break-words">
                                  <div>
                                    <span className="font-medium">Email:</span>{" "}
                                    <span className="break-all">{visitor.email}</span>
                                  </div>
                                  <div>
                                    <span className="font-medium">Mobile:</span> {visitor.mobile}
                                  </div>
                                  <div>
                                    <span className="font-medium">Username:</span> {visitor.username}
                                  </div>
                                  {visitor.employeeId ? (
                                    <div>
                                      <span className="font-medium">Employee ID:</span> {visitor.employeeId}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                              <div className="w-full lg:w-auto lg:ml-4 text-left lg:text-right">
                                <div className="text-lg font-semibold">{visitCount}</div>
                                <div className="text-sm text-muted-foreground">visits assigned</div>
                                <div className="flex flex-wrap gap-2 mt-2 lg:justify-end">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full sm:w-auto"
                                    onClick={() => openManagedUserEdit(visitor.managed)}
                                  >
                                    <Edit className="w-3 h-3 mr-1" />
                                    Edit
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Account Management Tab */}
          <TabsContent value="account-management" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                  <CardTitle>Operations User IDs ({accountManagers.length})</CardTitle>
                  <Button
                    onClick={() => openCreateUnifiedUser(["quotation"])}
                    className="w-full sm:w-auto"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Create User ID
                  </Button>
                </div>
                <div className="mt-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, email, mobile, username..."
                      value={accountManagerSearchTerm}
                      onChange={(e) => setAccountManagerSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {(() => {
                  const filteredAccountManagers = accountManagers.filter((am) => {
                    if (!accountManagerSearchTerm.trim()) return true
                    const search = accountManagerSearchTerm.toLowerCase()
                    return (
                      am.firstName.toLowerCase().includes(search) ||
                      am.lastName.toLowerCase().includes(search) ||
                      am.email.toLowerCase().includes(search) ||
                      am.mobile.includes(search) ||
                      am.username.toLowerCase().includes(search)
                    )
                  })

                  if (filteredAccountManagers.length === 0) {
                    return (
                      <div className="text-center py-12 text-muted-foreground">
                        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                          <Wallet className="w-8 h-8 opacity-50" />
                        </div>
                        <p className="font-medium mb-1">
                          {accountManagerSearchTerm ? "No matching account managers found" : "No account management users found"}
                        </p>
                        {!accountManagerSearchTerm && (
                          <p className="text-sm mt-1">
                            Click &quot;Create User ID&quot; and check the dashboards this user can open (Admin, Quotation, Metering, …).
                          </p>
                        )}
                      </div>
                    )
                  }

                  return (
                    <div className="space-y-4">
                      {filteredAccountManagers.map((am) => {
                        const loginCount = (am as any).loginCount || 0
                        const lastLogin = (am as any).lastLogin
                        return (
                          <div
                            key={am.id}
                            className={`p-4 border rounded-lg transition-colors hover:bg-muted/50 ${am.isActive === false ? "opacity-60 bg-muted/30" : "bg-card"}`}
                          >
                            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-3 flex-wrap">
                                  <h3 className="font-semibold text-lg text-foreground">
                                    {am.firstName} {am.lastName}
                                  </h3>
                                  {am.isActive === false ? (
                                    <Badge variant="secondary" className="text-xs">Inactive</Badge>
                                  ) : (
                                    <Badge className="bg-green-500 text-white text-xs">Active</Badge>
                                  )}
                                  {am.emailVerified && (
                                    <Badge variant="outline" className="text-xs border-blue-500 text-blue-700 dark:text-blue-400">Verified</Badge>
                                  )}
                                  <Badge variant="outline" className="text-xs capitalize">
                                    {((am as any).role || "account-management").replace("-", " ")}
                                  </Badge>
                                  {accessLabels(
                                    normalizeAccessList(
                                      (am as any).access ||
                                        (am as any).permissions ||
                                        getAccessOverride(am.username),
                                    ),
                                  ).map((label) => (
                                    <Badge key={label} variant="secondary" className="text-xs">
                                      {label}
                                    </Badge>
                                  ))}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-muted-foreground">Email:</span>
                                    <span className="text-foreground break-all">{am.email}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-muted-foreground">Mobile:</span>
                                    <span className="text-foreground">{am.mobile}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-muted-foreground">Username:</span>
                                    <span className="text-foreground font-mono text-xs">{am.username}</span>
                                  </div>
                                  {am.createdAt && (
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-muted-foreground">Created:</span>
                                      <span className="text-foreground">{new Date(am.createdAt).toLocaleDateString()}</span>
                                    </div>
                                  )}
                                  {lastLogin && (
                                    <div className="md:col-span-2 flex items-center gap-2">
                                      <span className="font-medium text-muted-foreground">Last Login:</span>
                                      <span className="text-foreground">{new Date(lastLogin).toLocaleString()}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col lg:items-end gap-3 w-full lg:w-auto shrink-0">
                                <div className="text-center p-2 bg-primary/10 rounded-lg min-w-[60px] w-fit">
                                  <div className="text-xl font-bold text-primary">{loginCount}</div>
                                  <div className="text-xs text-muted-foreground mt-1">logins</div>
                                </div>
                                <div className="flex gap-2 flex-wrap justify-start lg:justify-end">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={async () => {
                                      setIsLoadingHistory(true)
                                      setSelectedAccountManagerForHistory(am)
                                      setAccountManagerHistoryDialogOpen(true)
                                      
                                      try {
                                        if (useApi) {
                                          const historyResponse = await api.admin.accountManagers.getHistory(am.id)
                                          setAccountManagerHistory(historyResponse.history || historyResponse || [])
                                        } else {
                                          // Fallback to localStorage - create mock history
                                          setAccountManagerHistory([
                                            {
                                              id: "hist-1",
                                              action: "login",
                                              timestamp: new Date().toISOString(),
                                              details: "User logged in successfully",
                                              ipAddress: "192.168.1.100",
                                            },
                                            {
                                              id: "hist-2",
                                              action: "view_quotations",
                                              timestamp: new Date(Date.now() - 86400000).toISOString(),
                                              details: "Viewed approved quotations list",
                                              ipAddress: "192.168.1.100",
                                            },
                                          ])
                                        }
                                      } catch (error) {
                                        console.error("Error loading account manager history:", error)
                                        toast({
                                          title: "Error",
                                          description: error instanceof ApiError ? error.message : "Failed to load history. Please try again.",
                                          variant: "destructive",
                                        })
                                        setAccountManagerHistory([])
                                      } finally {
                                        setIsLoadingHistory(false)
                                      }
                                    }}
                                  >
                                    <History className="w-3 h-3 mr-1" />
                                    History
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const roleValue = (am as any).role || "account-management"
                                      const fromStored = normalizeAccessList(
                                        (am as any).access || (am as any).permissions,
                                      )
                                      const fromOverride = getAccessOverride(am.username)
                                      const accessValue =
                                        fromStored.length > 0
                                          ? fromStored
                                          : fromOverride.length > 0
                                            ? fromOverride
                                            : roleValue === "installer"
                                              ? (["installation"] as UserAccessKey[])
                                              : roleValue === "metering"
                                                ? (["metering"] as UserAccessKey[])
                                                : roleValue === "baldev"
                                                  ? (["final_confirmation"] as UserAccessKey[])
                                                  : roleValue === "hr"
                                                    ? (["hr"] as UserAccessKey[])
                                                    : (["accounts"] as UserAccessKey[])
                                      openManagedUserEdit({
                                        id: `ops:${am.id}`,
                                        kind: "operations",
                                        username: am.username,
                                        firstName: am.firstName,
                                        lastName: am.lastName,
                                        email: am.email,
                                        mobile: am.mobile,
                                        isActive: am.isActive,
                                        emailVerified: am.emailVerified,
                                        roleLabel: String(roleValue).replace(/-/g, " "),
                                        access: accessValue,
                                        operations: am,
                                      })
                                    }}
                                  >
                                    <Edit className="w-3 h-3 mr-1" />
                                    Edit
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={async () => {
                                      if (!confirm(`Are you sure you want to ${am.isActive === false ? "activate" : "deactivate"} this account manager?`)) return
                                      
                                      try {
                                        if (useApi) {
                                          if (am.isActive === false) {
                                            await api.admin.accountManagers.activate(am.id)
                                          } else {
                                            await api.admin.accountManagers.deactivate(am.id)
                                          }
                                          await loadData()
                                          toast({
                                            title: "Success",
                                            description: `User ${am.isActive === false ? "activated" : "deactivated"} successfully!`,
                                          })
                                        } else {
                                          // Fallback to localStorage
                                          const roleKey = (am as any).role || "account-management"
                                          const key =
                                            roleKey === "installer"
                                              ? "installers"
                                              : roleKey === "metering"
                                                ? "meteringUsers"
                                                : roleKey === "baldev"
                                                  ? "baldevUsers"
                                                  : roleKey === "hr"
                                                    ? "hrUsers"
                                                    : "accountManagers"
                                          const roleUsers = JSON.parse(localStorage.getItem(key) || "[]")
                                          const updated = roleUsers.map((accountManager: AccountManager & { password?: string }) =>
                                            accountManager.id === am.id ? { ...accountManager, isActive: am.isActive === false ? true : false } : accountManager
                                          )
                                          localStorage.setItem(key, JSON.stringify(updated))
                                          const allAccountManagers = JSON.parse(localStorage.getItem("accountManagers") || "[]")
                                          const allInstallers = JSON.parse(localStorage.getItem("installers") || "[]")
                                          const allMeteringUsers = JSON.parse(localStorage.getItem("meteringUsers") || "[]")
                                          const allBaldevUsers = JSON.parse(localStorage.getItem("baldevUsers") || "[]")
                                          const allHrUsers = JSON.parse(localStorage.getItem("hrUsers") || "[]")
                                          const mergedUsers = [
                                            ...allAccountManagers.map((u: any) => ({ ...u, role: "account-management" })),
                                            ...allInstallers.map((u: any) => ({ ...u, role: "installer" })),
                                            ...allMeteringUsers.map((u: any) => ({ ...u, role: "metering" })),
                                            ...allBaldevUsers.map((u: any) => ({ ...u, role: "baldev" })),
                                            ...allHrUsers.map((u: any) => ({ ...u, role: "hr" })),
                                          ]
                                          const accountManagersWithoutPassword = mergedUsers.map((am: AccountManager & { password?: string }) => {
                                            const { password: _, ...accountManagerData } = am
                                            return accountManagerData
                                          })
                                          setAccountManagers(accountManagersWithoutPassword)
                                          toast({
                                            title: "Success",
                                            description: `User ${am.isActive === false ? "activated" : "deactivated"} successfully!`,
                                          })
                                        }
                                      } catch (error) {
                                        console.error("Error updating account manager status:", error)
                                        toast({
                                          title: "Error",
                                          description: error instanceof ApiError ? error.message : "Failed to update account manager status",
                                          variant: "destructive",
                                        })
                                      }
                                    }}
                                  >
                                    {am.isActive === false ? (
                                      <>
                                        <UserCheck className="w-3 h-3 mr-1" />
                                        Activate
                                      </>
                                    ) : (
                                      <>
                                        <UserX className="w-3 h-3 mr-1" />
                                        Deactivate
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Accounts Tab — Payment Management + Super Admin Inventory */}
          <TabsContent value="payments" className="space-y-6">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-primary" />
                  Payment Management
                </CardTitle>
                <CardDescription>
                  Payment management uses the same Account Management page. Use it when account managers are unavailable.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => router.push("/dashboard/account-management")}>
                  Open Account Management
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="w-5 h-5 text-primary" />
                  Super Admin
                </CardTitle>
                <CardDescription>
                  Same Super Admin Dashboard as inventory — all tabs, products, requests, approvals, agents, admins, returns, pricing, and users.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => router.push("/dashboard/inventory")}>
                  Open Super Admin
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Catalog Tab — Products + Pricing */}
          <TabsContent value="catalog" className="space-y-6">
            <Tabs
              value={catalogSubTab}
              onValueChange={(value) =>
                startTransition(() => setCatalogSubTab(value === "pricing" ? "pricing" : "products"))
              }
              className="space-y-4"
            >
              <TabsList>
                <TabsTrigger value="products">Products</TabsTrigger>
                <TabsTrigger value="pricing">Pricing</TabsTrigger>
              </TabsList>
              <TabsContent value="products" className="space-y-6 mt-0">
                <AdminProductManagement />
              </TabsContent>
              <TabsContent value="pricing" className="space-y-6 mt-0">
                <AdminPricingTablesManagement />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>

        {/* Quotation Details Dialog */}
        <QuotationDetailsDialog
          quotation={selectedQuotation}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />

        {/* Document Submission Dialog */}
        <Dialog
          open={documentsDialogOpen}
          onOpenChange={(open) => {
            setDocumentsDialogOpen(open)
            if (!open) {
              setDocumentsQuotation(null)
            }
          }}
        >
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Document Submission</DialogTitle>
              <DialogDescription>
                Upload customer documents and payment details for this quotation.
              </DialogDescription>
            </DialogHeader>
            {documentsQuotation && (
              <div className="space-y-6">
                <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
                  <p className="text-sm font-semibold">
                    {formatPersonName(documentsQuotation.customer?.firstName, documentsQuotation.customer?.lastName, "Customer")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {documentsQuotation.customer?.mobile || ""} • {documentsQuotation.id}
                  </p>
                </div>

                {(() => {
                  const form = getDocumentsForm(documentsQuotation.id)
                  const isCompliant = Boolean(form.isCompliantSenior)
                  const uploadedImagePreviews = getUploadedImagePreviews(form)

                  return (
                    <>
                      {uploadedImagePreviews.length > 0 && (
                        <div className="rounded-lg border border-border/60 bg-background p-4 space-y-3">
                          <p className="text-sm font-semibold">Uploaded Images</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {uploadedImagePreviews.map((item) => (
                              <a
                                key={item.label}
                                href={String(item.value)}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-md border border-border/60 p-3 hover:bg-muted/30 transition-colors"
                              >
                                <p className="text-xs text-muted-foreground mb-2">{item.label}</p>
                                <img
                                  src={String(item.value)}
                                  alt={item.label}
                                  className="w-full h-24 object-cover rounded-md border border-border/60"
                                />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="rounded-lg border border-border/60 bg-muted/10 p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <input
                            id="admin-compliant-senior"
                            type="checkbox"
                            checked={isCompliant}
                            onChange={(e) =>
                              updateDocumentsForm(documentsQuotation.id, { isCompliantSenior: e.target.checked })
                            }
                            className="h-4 w-4 mt-1"
                          />
                          <div>
                            <Label htmlFor="admin-compliant-senior" className="text-sm font-medium">
                              Compliant (age &gt; 60)
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              When checked, compliant contact number, Aadhar front/back images, PAN image, and bank passbook image are required.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/60 bg-background p-4 space-y-4">
                        <p className="text-sm font-semibold">Aadhar Details</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Aadhar Number</Label>
                            <Input
                              value={form.aadharNumber}
                              onChange={(e) => updateDocumentsForm(documentsQuotation.id, { aadharNumber: e.target.value })}
                              placeholder="Enter Aadhar number"
                            />
                          </div>
                          <div>
                            <Label>Phone Number *</Label>
                            <Input
                              value={form.contactPhone}
                              onChange={(e) => updateDocumentsForm(documentsQuotation.id, { contactPhone: e.target.value })}
                              placeholder="Enter phone number"
                            />
                          </div>
                          <div>
                            <Label>Aadhar Front Image *</Label>
                            <Input
                              type="file"
                              accept="image/*,.heic,.heif"
                              disabled={!!uploadingField}
                              onChange={(e) =>
                                void onDocumentFileSelected(
                                  documentsQuotation.id,
                                  "aadharFront",
                                  e.target.files?.[0] ?? null,
                                )
                              }
                            />
                          </div>
                          <div>
                            <Label>Aadhar Back Image *</Label>
                            <Input
                              type="file"
                              accept="image/*,.heic,.heif"
                              disabled={!!uploadingField}
                              onChange={(e) =>
                                void onDocumentFileSelected(
                                  documentsQuotation.id,
                                  "aadharBack",
                                  e.target.files?.[0] ?? null,
                                )
                              }
                            />
                          </div>
                        </div>
                      </div>

                      {isCompliant && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 md:p-5 space-y-4">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-amber-900">Compliant Details (Mandatory)</p>
                            <p className="text-xs text-amber-800/80">
                              Only the fields marked with * are required to submit.
                            </p>
                          </div>

                          <div className="rounded-md border border-amber-200/80 bg-background p-4 space-y-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Compliant Aadhar</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <Label className="text-sm font-medium">Compliant Aadhar No</Label>
                                <Input
                                  value={form.compliantAadharNumber}
                                  onChange={(e) =>
                                    updateDocumentsForm(documentsQuotation.id, { compliantAadharNumber: e.target.value })
                                  }
                                  placeholder="Enter compliant Aadhar number"
                                />
                              </div>
                              <div>
                                <Label className="text-sm font-medium">Compliant Contact No *</Label>
                                <Input
                                  value={form.compliantContactPhone}
                                  onChange={(e) =>
                                    updateDocumentsForm(documentsQuotation.id, { compliantContactPhone: e.target.value })
                                  }
                                  placeholder="Enter compliant contact number"
                                />
                              </div>
                              <div>
                                <Label className="text-sm font-medium">Compliant Aadhar Front Image *</Label>
                                <Input
                                  type="file"
                                  accept="image/*,.heic,.heif"
                                  disabled={!!uploadingField}
                                  onChange={(e) =>
                                    void onDocumentFileSelected(
                                      documentsQuotation.id,
                                      "compliantAadharFront",
                                      e.target.files?.[0] ?? null,
                                    )
                                  }
                                />
                              </div>
                              <div>
                                <Label className="text-sm font-medium">Compliant Aadhar Back Image *</Label>
                                <Input
                                  type="file"
                                  accept="image/*,.heic,.heif"
                                  disabled={!!uploadingField}
                                  onChange={(e) =>
                                    void onDocumentFileSelected(
                                      documentsQuotation.id,
                                      "compliantAadharBack",
                                      e.target.files?.[0] ?? null,
                                    )
                                  }
                                />
                              </div>
                            </div>
                          </div>

                          <div className="rounded-md border border-amber-200/80 bg-background p-4 space-y-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Compliant PAN</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <Label className="text-sm font-medium">Compliant PAN Number</Label>
                                <Input
                                  value={form.compliantPanNumber}
                                  onChange={(e) =>
                                    updateDocumentsForm(documentsQuotation.id, { compliantPanNumber: e.target.value.toUpperCase() })
                                  }
                                  placeholder="Enter compliant PAN number"
                                />
                              </div>
                              <div>
                                <Label className="text-sm font-medium">Compliant PAN Image *</Label>
                                <Input
                                  type="file"
                                  accept="image/*,.heic,.heif"
                                  disabled={!!uploadingField}
                                  onChange={(e) =>
                                    void onDocumentFileSelected(
                                      documentsQuotation.id,
                                      "compliantPanImage",
                                      e.target.files?.[0] ?? null,
                                    )
                                  }
                                />
                              </div>
                            </div>
                          </div>

                          <div className="rounded-md border border-amber-200/80 bg-background p-4 space-y-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Compliant Bank</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <Label className="text-sm font-medium">Compliant Account No</Label>
                                <Input
                                  value={form.compliantBankAccountNumber}
                                  onChange={(e) =>
                                    updateDocumentsForm(documentsQuotation.id, { compliantBankAccountNumber: e.target.value })
                                  }
                                  placeholder="Enter compliant bank account number"
                                />
                              </div>
                              <div>
                                <Label className="text-sm font-medium">Compliant IFSC Code</Label>
                                <Input
                                  value={form.compliantBankIfsc}
                                  onChange={(e) =>
                                    updateDocumentsForm(documentsQuotation.id, { compliantBankIfsc: e.target.value.toUpperCase() })
                                  }
                                  placeholder="Enter compliant IFSC code"
                                />
                              </div>
                              <div>
                                <Label className="text-sm font-medium">Compliant Bank Name</Label>
                                <Input
                                  value={form.compliantBankName}
                                  onChange={(e) =>
                                    updateDocumentsForm(documentsQuotation.id, { compliantBankName: e.target.value })
                                  }
                                  placeholder="Enter compliant bank name"
                                />
                              </div>
                              <div>
                                <Label className="text-sm font-medium">Compliant Branch</Label>
                                <Input
                                  value={form.compliantBankBranch}
                                  onChange={(e) =>
                                    updateDocumentsForm(documentsQuotation.id, { compliantBankBranch: e.target.value })
                                  }
                                  placeholder="Enter compliant branch name"
                                />
                              </div>
                              <div className="md:col-span-2">
                                <Label className="text-sm font-medium">Compliant Bank Passbook Image *</Label>
                                <Input
                                  type="file"
                                  accept="image/*,.heic,.heif"
                                  disabled={!!uploadingField}
                                  onChange={(e) =>
                                    void onDocumentFileSelected(
                                      documentsQuotation.id,
                                      "compliantBankPassbookImage",
                                      e.target.files?.[0] ?? null,
                                    )
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="rounded-lg border border-border/60 bg-background p-4 space-y-4">
                        <p className="text-sm font-semibold">PAN Details</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>PAN Number</Label>
                            <Input
                              value={form.panNumber}
                              onChange={(e) => updateDocumentsForm(documentsQuotation.id, { panNumber: e.target.value })}
                              placeholder="Enter PAN number"
                            />
                          </div>
                          <div>
                            <Label>PAN Image *</Label>
                            <Input
                              type="file"
                              accept="image/*,.heic,.heif"
                              disabled={!!uploadingField}
                              onChange={(e) =>
                                void onDocumentFileSelected(
                                  documentsQuotation.id,
                                  "panImage",
                                  e.target.files?.[0] ?? null,
                                )
                              }
                            />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/60 bg-background p-4 space-y-4">
                        <p className="text-sm font-semibold">Electricity Bill</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Electricity Bill KNO *</Label>
                            <Input
                              value={form.electricityKno}
                              onChange={(e) =>
                                updateDocumentsForm(documentsQuotation.id, { electricityKno: e.target.value })
                              }
                              placeholder="Enter KNO"
                            />
                          </div>
                          <div>
                            <Label>Electricity Bill PDF *</Label>
                            <Input
                              type="file"
                              accept="application/pdf,.pdf"
                              disabled={!!uploadingField}
                              onChange={(e) =>
                                void onDocumentFileSelected(
                                  documentsQuotation.id,
                                  "electricityBillImage",
                                  e.target.files?.[0] ?? null,
                                )
                              }
                            />
                            {form.electricityBillImage ? (
                              <Button
                                type="button"
                                variant="link"
                                className="h-auto p-0 mt-1 text-xs"
                                onClick={() => openDocumentPreview(form.electricityBillImage)}
                              >
                                View uploaded file
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/60 bg-background p-4 space-y-4">
                        <p className="text-sm font-semibold">Bank Details</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Bank Account Number</Label>
                            <Input
                              value={form.bankAccountNumber}
                              onChange={(e) =>
                                updateDocumentsForm(documentsQuotation.id, { bankAccountNumber: e.target.value })
                              }
                              placeholder="Enter account number"
                            />
                          </div>
                          <div>
                            <Label>IFSC Code</Label>
                            <Input
                              value={form.bankIfsc}
                              onChange={(e) => updateDocumentsForm(documentsQuotation.id, { bankIfsc: e.target.value })}
                              placeholder="Enter IFSC code"
                            />
                          </div>
                          <div>
                            <Label>Bank Name</Label>
                            <Input
                              value={form.bankName}
                              onChange={(e) => updateDocumentsForm(documentsQuotation.id, { bankName: e.target.value })}
                              placeholder="Enter bank name"
                            />
                          </div>
                          <div>
                            <Label>Branch</Label>
                            <Input
                              value={form.bankBranch}
                              onChange={(e) => updateDocumentsForm(documentsQuotation.id, { bankBranch: e.target.value })}
                              placeholder="Enter branch name"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <Label>Bank Passbook Image *</Label>
                            <Input
                              type="file"
                              accept="image/*,.heic,.heif"
                              disabled={!!uploadingField}
                              onChange={(e) =>
                                void onDocumentFileSelected(
                                  documentsQuotation.id,
                                  "bankPassbookImage",
                                  e.target.files?.[0] ?? null,
                                )
                              }
                            />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/60 bg-background p-4 space-y-4">
                        <p className="text-sm font-semibold">Contact Details</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Email ID *</Label>
                            <Input
                              type="email"
                              value={form.contactEmail}
                              onChange={(e) => updateDocumentsForm(documentsQuotation.id, { contactEmail: e.target.value })}
                              placeholder="Enter email"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/60 bg-background p-4 space-y-4">
                        <p className="text-sm font-semibold">Additional Documents</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Geotag Roof Photo</Label>
                            <Input
                              type="file"
                              accept="image/*,.heic,.heif"
                              disabled={!!uploadingField}
                              onChange={(e) =>
                                void onDocumentFileSelected(
                                  documentsQuotation.id,
                                  "geotagRoofPhoto",
                                  e.target.files?.[0] ?? null,
                                )
                              }
                            />
                            {form.geotagRoofPhoto ? (
                              <Button
                                type="button"
                                variant="link"
                                className="h-auto p-0 mt-1 text-xs"
                                onClick={() => openDocumentPreview(form.geotagRoofPhoto)}
                              >
                                View uploaded file
                              </Button>
                            ) : null}
                          </div>
                          <div>
                            <Label>Customer Photo with House</Label>
                            <Input
                              type="file"
                              accept="image/*,.heic,.heif"
                              disabled={!!uploadingField}
                              onChange={(e) =>
                                void onDocumentFileSelected(
                                  documentsQuotation.id,
                                  "customerWithHousePhoto",
                                  e.target.files?.[0] ?? null,
                                )
                              }
                            />
                            {form.customerWithHousePhoto ? (
                              <Button
                                type="button"
                                variant="link"
                                className="h-auto p-0 mt-1 text-xs"
                                onClick={() => openDocumentPreview(form.customerWithHousePhoto)}
                              >
                                View uploaded file
                              </Button>
                            ) : null}
                          </div>
                          <div className="md:col-span-2">
                            <Label>Property Documents (PDF)</Label>
                            <Input
                              type="file"
                              accept="application/pdf,.pdf"
                              disabled={!!uploadingField}
                              onChange={(e) =>
                                void onDocumentFileSelected(
                                  documentsQuotation.id,
                                  "propertyDocumentPdf",
                                  e.target.files?.[0] ?? null,
                                )
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )
                })()}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDocumentsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!documentsQuotation || documentsZipDownloading}
                    onClick={async () => {
                      if (!documentsQuotation) return
                      setDocumentsZipDownloading(true)
                      try {
                        const customerName = formatPersonName(
                          documentsQuotation.customer?.firstName,
                          documentsQuotation.customer?.lastName,
                          "Customer",
                        )
                        const safeName = customerName.replace(/\s+/g, "-")
                        const fileName = `${safeName}-${documentsQuotation.id}.zip`
                        try {
                          const blob = await api.quotations.downloadDocumentsZip(documentsQuotation.id)
                          const url = window.URL.createObjectURL(blob)
                          const link = document.createElement("a")
                          link.href = url
                          link.download = fileName
                          document.body.appendChild(link)
                          link.click()
                          link.remove()
                          window.URL.revokeObjectURL(url)
                          toast({
                            title: "Download ready",
                            description: "ZIP downloaded from backend.",
                          })
                          return
                        } catch (backendError) {
                          console.warn("Backend ZIP failed, falling back to client ZIP:", backendError)
                        }

                        const form = getDocumentsForm(documentsQuotation.id)
                        const result = await downloadQuotationDocumentsZip({
                          customerName,
                          quotationId: documentsQuotation.id,
                          form,
                        })
                        if (!result.ok) {
                          toast({
                            title: "Download failed",
                            description: result.message,
                            variant: "destructive",
                          })
                        } else {
                          toast({
                            title: "Download ready",
                            description: "ZIP includes uploaded files and document-details.txt.",
                          })
                        }
                      } finally {
                        setDocumentsZipDownloading(false)
                      }
                    }}
                  >
                    <Download className="w-4 h-4 mr-2 shrink-0" />
                    {documentsZipDownloading ? "Preparing…" : "Download ZIP"}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      if (!documentsQuotation) return
                      const form = getDocumentsForm(documentsQuotation.id)
                      const isCompliant = Boolean(form.isCompliantSenior)
                      const aadharPattern = /^\d{12}$/
                      const panPattern = /^[A-Z]{5}\d{4}[A-Z]{1}$/
                      const phonePattern = /^\d{10}$/

                      if (form.aadharNumber && !aadharPattern.test(form.aadharNumber)) {
                        toast({
                          title: "Invalid Aadhar",
                          description: "Aadhar number must be 12 digits.",
                          variant: "destructive",
                        })
                        return
                      }

                      if (form.panNumber && !panPattern.test(form.panNumber.toUpperCase())) {
                        toast({
                          title: "Invalid PAN",
                          description: "PAN must be in format ABCDE1234F.",
                          variant: "destructive",
                        })
                        return
                      }

                      if (form.contactPhone && !phonePattern.test(form.contactPhone)) {
                        toast({
                          title: "Invalid phone number",
                          description: "Phone number must be 10 digits.",
                          variant: "destructive",
                        })
                        return
                      }

                      if (isCompliant) {
                        if (form.compliantAadharNumber && !aadharPattern.test(form.compliantAadharNumber)) {
                          toast({
                            title: "Invalid compliant Aadhar",
                            description: "Aadhar number must be 12 digits.",
                            variant: "destructive",
                          })
                          return
                        }

                        if (form.compliantContactPhone && !phonePattern.test(form.compliantContactPhone)) {
                          toast({
                            title: "Invalid compliant phone",
                            description: "Phone number must be 10 digits.",
                            variant: "destructive",
                          })
                          return
                        }

                        if (form.compliantPanNumber && !panPattern.test(form.compliantPanNumber.toUpperCase())) {
                          toast({
                            title: "Invalid compliant PAN",
                            description: "PAN must be in format ABCDE1234F.",
                            variant: "destructive",
                          })
                          return
                        }

                        const missing =
                          !form.compliantContactPhone ||
                          !form.compliantAadharFront ||
                          !form.compliantAadharBack ||
                          !form.compliantPanImage ||
                          !form.compliantBankPassbookImage
                        if (missing) {
                          toast({
                            title: "Missing compliant details",
                            description:
                              "Please add compliant contact number, Aadhar front/back images, PAN image, and Bank Passbook image.",
                            variant: "destructive",
                          })
                          return
                        }
                      }

                      if (useApi) {
                        const pendingFile = firstPendingDocumentFileField(form)
                        if (pendingFile) {
                          toast({
                            title: "Files still uploading",
                            description: "Wait for each file to finish uploading before submitting.",
                            variant: "destructive",
                          })
                          return
                        }
                      }

                      setIsSubmittingDocuments(true)
                      const formData = buildDocumentsMultipartFormData(form)
                      api.quotations
                        .updateDocuments(documentsQuotation.id, formData)
                        .then(() => {
                          toast({
                            title: "Document details saved",
                            description: useApi
                              ? "Details saved to the server."
                              : "Documents saved.",
                          })
                          setDocumentsDialogOpen(false)
                        })
                        .catch((error: unknown) => {
                          toast({
                            title: "Save failed",
                            description: apiErrorToUserMessage(error),
                            variant: "destructive",
                          })
                        })
                        .finally(() => setIsSubmittingDocuments(false))
                    }}
                    disabled={isSubmittingDocuments || !!uploadingField}
                  >
                    {isSubmittingDocuments ? "Submitting..." : "Submit"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Customer Dialog */}
        <Dialog open={customerEditDialogOpen} onOpenChange={setCustomerEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Customer - {editingCustomer?.firstName} {editingCustomer?.lastName}</DialogTitle>
              <DialogDescription>
                Update customer information
              </DialogDescription>
            </DialogHeader>

            {editingCustomer && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="admin-customer-firstName">First Name *</Label>
                    <Input
                      id="admin-customer-firstName"
                      value={customerEditForm.firstName || ""}
                      onChange={(e) => setCustomerEditForm({ ...customerEditForm, firstName: e.target.value })}
                      placeholder="Enter first name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-customer-lastName">Last Name *</Label>
                    <Input
                      id="admin-customer-lastName"
                      value={customerEditForm.lastName || ""}
                      onChange={(e) => setCustomerEditForm({ ...customerEditForm, lastName: e.target.value })}
                      placeholder="Enter last name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="admin-customer-email">Email *</Label>
                    <Input
                      id="admin-customer-email"
                      type="email"
                      value={customerEditForm.email || ""}
                      onChange={(e) => setCustomerEditForm({ ...customerEditForm, email: e.target.value })}
                      placeholder="Enter email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-customer-mobile">Mobile *</Label>
                    <Input
                      id="admin-customer-mobile"
                      value={customerEditForm.mobile || ""}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/\D/g, "").slice(0, 10)
                        setCustomerEditForm({ ...customerEditForm, mobile: cleaned })
                      }}
                      placeholder="Enter 10-digit mobile number"
                      maxLength={10}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin-customer-street">Street Address *</Label>
                  <Textarea
                    id="admin-customer-street"
                    value={customerEditForm.address.street || ""}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCustomerEditForm({
                      ...customerEditForm,
                      address: { ...customerEditForm.address, street: e.target.value }
                    })}
                    placeholder="Enter street address"
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="admin-customer-city">City *</Label>
                    <Input
                      id="admin-customer-city"
                      value={customerEditForm.address.city || ""}
                      onChange={(e) => setCustomerEditForm({
                        ...customerEditForm,
                        address: { ...customerEditForm.address, city: e.target.value }
                      })}
                      placeholder="Enter city"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-customer-state">State *</Label>
                    <Select
                      value={customerEditForm.address.state || ""}
                      onValueChange={(value) => setCustomerEditForm({
                        ...customerEditForm,
                        address: { ...customerEditForm.address, state: value }
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {indianStates.map((state) => (
                          <SelectItem key={state} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin-customer-pincode">Pincode *</Label>
                  <Input
                    id="admin-customer-pincode"
                    value={customerEditForm.address.pincode || ""}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/\D/g, "").slice(0, 6)
                      setCustomerEditForm({
                        ...customerEditForm,
                        address: { ...customerEditForm.address, pincode: cleaned }
                      })
                    }}
                    placeholder="Enter 6-digit pincode"
                    maxLength={6}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setCustomerEditDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={async () => {
                      // Validation
                      if (!customerEditForm.firstName || !customerEditForm.lastName || !customerEditForm.email ||
                          !customerEditForm.mobile || !customerEditForm.address.street ||
                          !customerEditForm.address.city || !customerEditForm.address.state ||
                          !customerEditForm.address.pincode) {
                        alert("Please fill in all required fields")
                        return
                      }

                      if (customerEditForm.mobile.length !== 10) {
                        alert("Mobile number must be 10 digits")
                        return
                      }

                      if (customerEditForm.address.pincode.length !== 6) {
                        alert("Pincode must be 6 digits")
                        return
                      }

                      if (!editingCustomer.id) {
                        alert("Cannot update customer: Customer ID is missing. This customer may not exist in the database.")
                        return
                      }

                      try {
                        if (useApi) {
                          await api.customers.update(editingCustomer.id, {
                            firstName: customerEditForm.firstName.trim(),
                            lastName: customerEditForm.lastName.trim(),
                            email: customerEditForm.email.trim(),
                            mobile: customerEditForm.mobile,
                            address: {
                              street: customerEditForm.address.street.trim(),
                              city: customerEditForm.address.city.trim(),
                              state: customerEditForm.address.state,
                              pincode: customerEditForm.address.pincode,
                            },
                          })
                          await loadData()
                        } else {
                          alert("Customer editing is only available when using the API")
                        }
                        setCustomerEditDialogOpen(false)
                      } catch (error) {
                        console.error("Error updating customer:", error)
                        alert(error instanceof ApiError ? error.message : "Failed to update customer")
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Quotation Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Quotation - {editingQuotation?.id}</DialogTitle>
              <DialogDescription>Update quotation details and status</DialogDescription>
            </DialogHeader>

            {isLoadingQuotationDetails ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">Loading quotation details...</p>
              </div>
            ) : editingQuotation ? (
              <div className="space-y-4">
                {/* Status */}
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={editingQuotation.status || "pending"}
                    onValueChange={(value) =>
                      setEditingQuotation({ ...editingQuotation, status: value as QuotationStatus })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Customer Information */}
                <div className="space-y-4 border-t pt-4">
                  <h3 className="font-semibold">Customer Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>First Name</Label>
                      <Input
                        value={editingQuotation.customer.firstName}
                        onChange={(e) =>
                          setEditingQuotation({
                            ...editingQuotation,
                            customer: { ...editingQuotation.customer, firstName: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Last Name</Label>
                      <Input
                        value={editingQuotation.customer.lastName}
                        onChange={(e) =>
                          setEditingQuotation({
                            ...editingQuotation,
                            customer: { ...editingQuotation.customer, lastName: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Mobile</Label>
                      <Input
                        value={editingQuotation.customer.mobile}
                        onChange={(e) =>
                          setEditingQuotation({
                            ...editingQuotation,
                            customer: { ...editingQuotation.customer, mobile: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={editingQuotation.customer.email}
                        onChange={(e) =>
                          setEditingQuotation({
                            ...editingQuotation,
                            customer: { ...editingQuotation.customer, email: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Street Address</Label>
                      <Input
                        value={editingQuotation.customer?.address?.street || ""}
                        onChange={(e) =>
                          setEditingQuotation({
                            ...editingQuotation,
                            customer: {
                              ...editingQuotation.customer,
                              address: { 
                                ...(editingQuotation.customer?.address || { street: "", city: "", state: "", pincode: "" }), 
                                street: e.target.value 
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>City</Label>
                      <Input
                        value={editingQuotation.customer?.address?.city || ""}
                        onChange={(e) =>
                          setEditingQuotation({
                            ...editingQuotation,
                            customer: {
                              ...editingQuotation.customer,
                              address: { 
                                ...(editingQuotation.customer?.address || { street: "", city: "", state: "", pincode: "" }), 
                                city: e.target.value 
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>State</Label>
                      <Input
                        value={editingQuotation.customer?.address?.state || ""}
                        onChange={(e) =>
                          setEditingQuotation({
                            ...editingQuotation,
                            customer: {
                              ...editingQuotation.customer,
                              address: { 
                                ...(editingQuotation.customer?.address || { street: "", city: "", state: "", pincode: "" }), 
                                state: e.target.value 
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Pincode</Label>
                      <Input
                        value={editingQuotation.customer?.address?.pincode || ""}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/\D/g, "").slice(0, 6)
                          setEditingQuotation({
                            ...editingQuotation,
                            customer: {
                              ...editingQuotation.customer,
                              address: { 
                                ...(editingQuotation.customer?.address || { street: "", city: "", state: "", pincode: "" }), 
                                pincode: cleaned 
                              },
                            },
                          })
                        }}
                        maxLength={6}
                      />
                    </div>
                  </div>
                </div>

                {/* Pricing */}
                <div className="space-y-4 border-t pt-4">
                  <h3 className="font-semibold">Pricing</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Total Amount (₹)</Label>
                      <Input
                        type="number"
                        value={editingQuotation.totalAmount}
                        onChange={(e) =>
                          setEditingQuotation({
                            ...editingQuotation,
                            totalAmount: Number.parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Discount (%)</Label>
                      <Input
                        type="number"
                        value={editingQuotation.discount}
                        onChange={(e) => {
                          const discount = Number.parseFloat(e.target.value) || 0
                          const finalAmount =
                            editingQuotation.totalAmount - (editingQuotation.totalAmount * discount) / 100
                          setEditingQuotation({
                            ...editingQuotation,
                            discount,
                            finalAmount,
                          })
                        }}
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Final Amount (₹)</Label>
                      <Input
                        type="number"
                        value={editingQuotation.finalAmount}
                        onChange={(e) =>
                          setEditingQuotation({
                            ...editingQuotation,
                            finalAmount: Number.parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Agent/Dealer */}
                <div className="space-y-2 border-t pt-4">
                  <Label>Created By (Agent/Dealer)</Label>
                  <Select
                    value={editingQuotation.dealerId}
                    onValueChange={(value) =>
                      setEditingQuotation({ ...editingQuotation, dealerId: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {activeDealers.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.firstName} {d.lastName} ({d.username})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    onClick={() => updateQuotation(editingQuotation)}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        {/* Dealer Details Dialog */}
        <Dialog open={dealerDialogOpen} onOpenChange={setDealerDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Dealer Details</DialogTitle>
              <DialogDescription>
                Complete registration information for {selectedDealer?.firstName} {selectedDealer?.lastName}
              </DialogDescription>
            </DialogHeader>

            {selectedDealer && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-semibold">Personal Information</Label>
                    <div className="mt-2 space-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Full Name:</span>{" "}
                        <span className="font-medium">
                          {selectedDealer.firstName} {selectedDealer.lastName}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Username:</span>{" "}
                        <span className="font-medium">{selectedDealer.username}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Email:</span>{" "}
                        <span className="font-medium">{selectedDealer.email}</span>
                        {selectedDealer.emailVerified === false && (
                          <Badge variant="outline" className="ml-2">Unverified</Badge>
                        )}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Mobile:</span>{" "}
                        <span className="font-medium">{selectedDealer.mobile}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Gender:</span>{" "}
                        <span className="font-medium">{selectedDealer.gender}</span>
                      </div>
                      {selectedDealer.dateOfBirth && (
                        <div>
                          <span className="text-muted-foreground">Date of Birth:</span>{" "}
                          <span className="font-medium">
                            {new Date(selectedDealer.dateOfBirth).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-semibold">Family Information</Label>
                    <div className="mt-2 space-y-2 text-sm">
                      {selectedDealer.fatherName && (
                        <div>
                          <span className="text-muted-foreground">Father&apos;s Name:</span>{" "}
                          <span className="font-medium">{selectedDealer.fatherName}</span>
                        </div>
                      )}
                      {selectedDealer.fatherContact && (
                        <div>
                          <span className="text-muted-foreground">Father&apos;s Contact:</span>{" "}
                          <span className="font-medium">{selectedDealer.fatherContact}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-semibold">Government ID</Label>
                    <div className="mt-2 space-y-2 text-sm">
                      {selectedDealer.governmentIdType && (
                        <div>
                          <span className="text-muted-foreground">ID Type:</span>{" "}
                          <span className="font-medium">{selectedDealer.governmentIdType}</span>
                        </div>
                      )}
                      {selectedDealer.governmentIdNumber && (
                        <div>
                          <span className="text-muted-foreground">ID Number:</span>{" "}
                          <span className="font-medium font-mono">{selectedDealer.governmentIdNumber}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-semibold">Address</Label>
                    <div className="mt-2 space-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Street:</span>{" "}
                        <span className="font-medium">{selectedDealer.address.street}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">City:</span>{" "}
                        <span className="font-medium">{selectedDealer.address.city}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">State:</span>{" "}
                        <span className="font-medium">{selectedDealer.address.state}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Pincode:</span>{" "}
                        <span className="font-medium">{selectedDealer.address.pincode}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {selectedDealer.createdAt && (
                  <div className="pt-4 border-t">
                    <div className="text-sm text-muted-foreground">
                      <span className="font-medium">Registered:</span>{" "}
                      {new Date(selectedDealer.createdAt).toLocaleString()}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDealerDialogOpen(false)
                      const fromStored = normalizeAccessList(
                        (selectedDealer as any).access || (selectedDealer as any).permissions,
                      )
                      const fromOverride = getAccessOverride(selectedDealer.username)
                      const access =
                        fromStored.length > 0
                          ? fromStored
                          : fromOverride.length > 0
                            ? fromOverride
                            : selectedDealer.username === ADMIN_USERNAME
                              ? (["admin"] as UserAccessKey[])
                              : (["quotation"] as UserAccessKey[])
                      openManagedUserEdit({
                        id: `dealer:${selectedDealer.id}`,
                        kind: "dealer",
                        username: selectedDealer.username,
                        firstName: selectedDealer.firstName,
                        lastName: selectedDealer.lastName,
                        email: selectedDealer.email,
                        mobile: selectedDealer.mobile,
                        isActive: selectedDealer.isActive,
                        emailVerified: selectedDealer.emailVerified,
                        roleLabel: selectedDealer.username === ADMIN_USERNAME ? "Admin" : "Dealer",
                        access,
                        dealer: selectedDealer,
                      })
                    }}
                    className="flex-1"
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit User
                  </Button>
                  {selectedDealer.isActive === false && (
                    <Button
                      onClick={async () => {
                        if (!confirm(`Are you sure you want to approve and activate ${selectedDealer.firstName} ${selectedDealer.lastName}?`)) return
                        
                        try {
                          if (useApi) {
                            try {
                              await api.admin.dealers.activate(selectedDealer.id)
                            } catch {
                              await api.admin.dealers.update(selectedDealer.id, { isActive: true })
                            }
                            await loadData()
                            setDealerDialogOpen(false)
                          } else {
                            const updated = dealers.map((dealer) =>
                              dealer.id === selectedDealer.id ? { ...dealer, isActive: true } : dealer
                            )
                            setDealers(updated)
                            setDealerDialogOpen(false)
                          }
                        } catch (error) {
                          console.error("Error activating dealer:", error)
                          alert(error instanceof ApiError ? error.message : "Failed to activate dealer")
                        }
                      }}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      <UserCheck className="w-4 h-4 mr-2" />
                      Approve & Activate
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog (dealer profile + access) */}
        <Dialog open={dealerEditDialogOpen} onOpenChange={setDealerEditDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit User - {editingDealer?.firstName} {editingDealer?.lastName}</DialogTitle>
              <DialogDescription>
                Update user information and dashboard access. Username cannot be changed.
              </DialogDescription>
            </DialogHeader>

            {editingDealer && (
              <div className="space-y-4">
                <div className="space-y-2 rounded-lg border border-border/70 p-3">
                  <Label className="text-base font-semibold">Dashboard access *</Label>
                  <p className="text-xs text-muted-foreground">
                    Check the dashboards this user can open after login.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ASSIGNABLE_USER_ACCESS_OPTIONS.map((opt) => {
                      const checked = dealerEditForm.access.includes(opt.key)
                      return (
                        <label
                          key={opt.key}
                          className="flex items-start gap-2 rounded-md p-2 hover:bg-muted/40 cursor-pointer"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => {
                              const on = value === true
                              setDealerEditForm((prev) => {
                                const next = on
                                  ? [...prev.access, opt.key]
                                  : prev.access.filter((k) => k !== opt.key)
                                return {
                                  ...prev,
                                  access: Array.from(new Set(next)) as UserAccessKey[],
                                }
                              })
                            }}
                            className="mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium leading-tight">{opt.label}</span>
                            <span className="block text-[11px] text-muted-foreground leading-snug">{opt.description}</span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                  {dealerEditForm.access.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Selected: {accessLabels(dealerEditForm.access).join(", ")}
                    </p>
                  ) : null}
                </div>

                {/* Personal Information */}
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Personal Information</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dealer-firstName">First Name *</Label>
                      <Input
                        id="dealer-firstName"
                        value={dealerEditForm.firstName || ""}
                        onChange={(e) => setDealerEditForm({ ...dealerEditForm, firstName: e.target.value })}
                        placeholder="Enter first name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dealer-lastName">Last Name *</Label>
                      <Input
                        id="dealer-lastName"
                        value={dealerEditForm.lastName || ""}
                        onChange={(e) => setDealerEditForm({ ...dealerEditForm, lastName: e.target.value })}
                        placeholder="Enter last name"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dealer-email">Email *</Label>
                    <Input
                      id="dealer-email"
                      type="email"
                      value={dealerEditForm.email || ""}
                      onChange={(e) => setDealerEditForm({ ...dealerEditForm, email: e.target.value })}
                      placeholder="Enter email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dealer-mobile">Mobile *</Label>
                    <Input
                      id="dealer-mobile"
                      value={dealerEditForm.mobile || ""}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/\D/g, "").slice(0, 10)
                        setDealerEditForm({ ...dealerEditForm, mobile: cleaned })
                      }}
                      placeholder="Enter 10-digit mobile number"
                      maxLength={10}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dealer-gender">Gender *</Label>
                      <Select
                        value={dealerEditForm.gender || ""}
                        onValueChange={(value) => setDealerEditForm({ ...dealerEditForm, gender: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dealer-dateOfBirth">Date of Birth *</Label>
                      <Input
                        id="dealer-dateOfBirth"
                        type="date"
                        value={dealerEditForm.dateOfBirth || ""}
                        onChange={(e) => setDealerEditForm({ ...dealerEditForm, dateOfBirth: e.target.value })}
                        max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
                      />
                    </div>
                  </div>
                </div>

                {/* Family Information */}
                <div className="space-y-4 pt-4 border-t">
                  <Label className="text-base font-semibold">Family Information</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dealer-fatherName">Father&apos;s Name *</Label>
                      <Input
                        id="dealer-fatherName"
                        value={dealerEditForm.fatherName || ""}
                        onChange={(e) => setDealerEditForm({ ...dealerEditForm, fatherName: e.target.value })}
                        placeholder="Enter father's name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dealer-fatherContact">Father&apos;s Contact *</Label>
                      <Input
                        id="dealer-fatherContact"
                        value={dealerEditForm.fatherContact || ""}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/\D/g, "").slice(0, 10)
                          setDealerEditForm({ ...dealerEditForm, fatherContact: cleaned })
                        }}
                        placeholder="Enter 10-digit contact"
                        maxLength={10}
                      />
                    </div>
                  </div>
                </div>

                {/* Government ID */}
                <div className="space-y-4 pt-4 border-t">
                  <Label className="text-base font-semibold">Government ID</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dealer-governmentIdType">ID Type *</Label>
                      <Select
                        value={dealerEditForm.governmentIdType || ""}
                        onValueChange={(value) => setDealerEditForm({ ...dealerEditForm, governmentIdType: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select ID type" />
                        </SelectTrigger>
                        <SelectContent>
                          {governmentIds.map((id) => (
                            <SelectItem key={id} value={id}>
                              {id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dealer-governmentIdNumber">ID Number *</Label>
                      <Input
                        id="dealer-governmentIdNumber"
                        value={dealerEditForm.governmentIdNumber || ""}
                        onChange={(e) => setDealerEditForm({ ...dealerEditForm, governmentIdNumber: e.target.value })}
                        placeholder="Enter ID number"
                      />
                    </div>
                  </div>
                </div>

                {/* Address */}
                <div className="space-y-4 pt-4 border-t">
                  <Label className="text-base font-semibold">Address</Label>
                  <div className="space-y-2">
                    <Label htmlFor="dealer-street">Street *</Label>
                    <Input
                      id="dealer-street"
                      value={dealerEditForm.address.street}
                      onChange={(e) => setDealerEditForm({
                        ...dealerEditForm,
                        address: { ...dealerEditForm.address, street: e.target.value }
                      })}
                      placeholder="Enter street address"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dealer-city">City *</Label>
                      <Input
                        id="dealer-city"
                        value={dealerEditForm.address?.city || ""}
                        onChange={(e) => setDealerEditForm({
                          ...dealerEditForm,
                          address: { ...dealerEditForm.address, city: e.target.value }
                        })}
                        placeholder="Enter city"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dealer-state">State *</Label>
                      <Select
                        value={dealerEditForm.address.state}
                        onValueChange={(value) => setDealerEditForm({
                          ...dealerEditForm,
                          address: { ...dealerEditForm.address, state: value }
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select state" />
                        </SelectTrigger>
                        <SelectContent>
                          {indianStates.map((state) => (
                            <SelectItem key={state} value={state}>
                              {state}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dealer-pincode">Pincode *</Label>
                    <Input
                      id="dealer-pincode"
                      value={dealerEditForm.address?.pincode || ""}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/\D/g, "").slice(0, 6)
                        setDealerEditForm({
                          ...dealerEditForm,
                          address: { ...dealerEditForm.address, pincode: cleaned }
                        })
                      }}
                      placeholder="Enter 6-digit pincode"
                      maxLength={6}
                    />
                  </div>
                </div>

                {/* Status */}
                <div className="space-y-4 pt-4 border-t">
                  <Label className="text-base font-semibold">Account Status</Label>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="dealer-isActive"
                        checked={dealerEditForm.isActive}
                        onChange={(e) => setDealerEditForm({ ...dealerEditForm, isActive: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <Label htmlFor="dealer-isActive" className="font-normal cursor-pointer">
                        Active Account
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="dealer-emailVerified"
                        checked={dealerEditForm.emailVerified}
                        onChange={(e) => setDealerEditForm({ ...dealerEditForm, emailVerified: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <Label htmlFor="dealer-emailVerified" className="font-normal cursor-pointer">
                        Email Verified
                      </Label>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setDealerEditDialogOpen(false)}>
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    onClick={async () => {
                      const selectedAccess = normalizeAccessList(dealerEditForm.access)
                      if (selectedAccess.length === 0) {
                        alert("Select at least one dashboard access")
                        return
                      }

                      // Validation
                      if (!dealerEditForm.firstName || !dealerEditForm.lastName || !dealerEditForm.email ||
                          !dealerEditForm.mobile || !dealerEditForm.gender || !dealerEditForm.dateOfBirth ||
                          !dealerEditForm.fatherName || !dealerEditForm.fatherContact ||
                          !dealerEditForm.governmentIdType || !dealerEditForm.governmentIdNumber ||
                          !dealerEditForm.address.street || !dealerEditForm.address.city ||
                          !dealerEditForm.address.state || !dealerEditForm.address.pincode) {
                        alert("Please fill in all required fields")
                        return
                      }

                      if (dealerEditForm.mobile.length !== 10) {
                        alert("Mobile number must be 10 digits")
                        return
                      }

                      if (dealerEditForm.fatherContact.length !== 10) {
                        alert("Father's contact must be 10 digits")
                        return
                      }

                      if (dealerEditForm.address.pincode.length !== 6) {
                        alert("Pincode must be 6 digits")
                        return
                      }

                      try {
                        if (useApi) {
                          const updatePayload: any = {
                            firstName: dealerEditForm.firstName.trim(),
                            lastName: dealerEditForm.lastName.trim(),
                            email: dealerEditForm.email.trim(),
                            mobile: dealerEditForm.mobile,
                            gender: dealerEditForm.gender,
                            dateOfBirth: dealerEditForm.dateOfBirth,
                            fatherName: dealerEditForm.fatherName.trim(),
                            fatherContact: dealerEditForm.fatherContact,
                            governmentIdType: dealerEditForm.governmentIdType,
                            governmentIdNumber: dealerEditForm.governmentIdNumber.trim(),
                            address: {
                              street: dealerEditForm.address.street.trim(),
                              city: dealerEditForm.address.city.trim(),
                              state: dealerEditForm.address.state,
                              pincode: dealerEditForm.address.pincode,
                            },
                            isActive: dealerEditForm.isActive,
                            emailVerified: dealerEditForm.emailVerified,
                            access: selectedAccess,
                            permissions: selectedAccess,
                          }
                          try {
                            await api.admin.dealers.update(editingDealer.id, updatePayload)
                          } catch {
                            const { access: _a, permissions: _p, ...withoutAccess } = updatePayload
                            await api.admin.dealers.update(editingDealer.id, withoutAccess)
                          }
                          saveAccessOverride(editingDealer.username, selectedAccess)
                          await loadData()
                        } else {
                          // Fallback to localStorage
                          const allDealers = JSON.parse(localStorage.getItem("dealers") || "[]")
                          const updated = allDealers.map((d: Dealer & { password?: string }) => {
                            if (d.id === editingDealer.id) {
                              return {
                                ...d,
                                firstName: dealerEditForm.firstName.trim(),
                                lastName: dealerEditForm.lastName.trim(),
                                email: dealerEditForm.email.trim(),
                                mobile: dealerEditForm.mobile,
                                gender: dealerEditForm.gender,
                                dateOfBirth: dealerEditForm.dateOfBirth,
                                fatherName: dealerEditForm.fatherName.trim(),
                                fatherContact: dealerEditForm.fatherContact,
                                governmentIdType: dealerEditForm.governmentIdType,
                                governmentIdNumber: dealerEditForm.governmentIdNumber.trim(),
                                address: {
                                  street: dealerEditForm.address.street.trim(),
                                  city: dealerEditForm.address.city.trim(),
                                  state: dealerEditForm.address.state,
                                  pincode: dealerEditForm.address.pincode,
                                },
                                isActive: dealerEditForm.isActive,
                                emailVerified: dealerEditForm.emailVerified,
                                access: selectedAccess,
                              }
                            }
                            return d
                          })
                          localStorage.setItem("dealers", JSON.stringify(updated))
                          saveAccessOverride(editingDealer.username, selectedAccess)
                          setDealers(
                            updated.map((d: Dealer & { password?: string }) => {
                              const { password: _, ...rest } = d
                              return rest
                            }),
                          )
                        }
                        setDealerEditDialogOpen(false)
                        setSelectedDealer(null)
                        setDealerDialogOpen(false)
                        toast({
                          title: "Saved",
                          description: "User details and dashboard access updated.",
                        })
                      } catch (error) {
                        console.error("Error updating dealer:", error)
                        alert(error instanceof ApiError ? error.message : "Failed to update user")
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Visitor Create/Edit Dialog */}
        <Dialog open={visitorDialogOpen} onOpenChange={setVisitorDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingVisitor ? "Edit Visitor" : "Create New Visitor"}</DialogTitle>
              <DialogDescription>
                {editingVisitor ? "Update visitor information" : "Add a new visitor to the system"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="visitor-firstName">First Name *</Label>
                  <Input
                    id="visitor-firstName"
                    value={newVisitor.firstName}
                    onChange={(e) => setNewVisitor({ ...newVisitor, firstName: e.target.value })}
                    placeholder="Enter first name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="visitor-lastName">Last Name *</Label>
                  <Input
                    id="visitor-lastName"
                    value={newVisitor.lastName}
                    onChange={(e) => setNewVisitor({ ...newVisitor, lastName: e.target.value })}
                    placeholder="Enter last name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="visitor-username">Username *</Label>
                <Input
                  id="visitor-username"
                  value={newVisitor.username}
                  onChange={(e) => setNewVisitor({ ...newVisitor, username: e.target.value })}
                  placeholder="Enter username"
                  disabled={!!editingVisitor}
                />
                {editingVisitor && (
                  <p className="text-xs text-muted-foreground">Username cannot be changed</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="visitor-password">
                  {editingVisitor ? "New Password (leave blank to keep current)" : "Password *"}
                </Label>
                <Input
                  id="visitor-password"
                  type="password"
                  value={newVisitor.password}
                  onChange={(e) => setNewVisitor({ ...newVisitor, password: e.target.value })}
                  placeholder={editingVisitor ? "Enter new password" : "Enter password"}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="visitor-email">Email *</Label>
                  <Input
                    id="visitor-email"
                    type="email"
                    value={newVisitor.email}
                    onChange={(e) => setNewVisitor({ ...newVisitor, email: e.target.value })}
                    placeholder="Enter email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="visitor-mobile">Mobile *</Label>
                  <Input
                    id="visitor-mobile"
                    value={newVisitor.mobile}
                    onChange={(e) => setNewVisitor({ ...newVisitor, mobile: e.target.value })}
                    placeholder="Enter mobile number"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="visitor-employeeId">Employee ID (Optional)</Label>
                <Input
                  id="visitor-employeeId"
                  value={newVisitor.employeeId}
                  onChange={(e) => setNewVisitor({ ...newVisitor, employeeId: e.target.value })}
                  placeholder="Enter employee ID"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setVisitorDialogOpen(false)}>
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    if (!newVisitor.firstName || !newVisitor.lastName || !newVisitor.username || !newVisitor.email || !newVisitor.mobile) {
                      alert("Please fill in all required fields")
                      return
                    }

                    if (!editingVisitor && !newVisitor.password) {
                      alert("Password is required for new visitors")
                      return
                    }

                    try {
                      if (useApi) {
                        if (editingVisitor) {
                          // Update existing visitor
                          const updateData: any = {
                            firstName: newVisitor.firstName,
                            lastName: newVisitor.lastName,
                            email: newVisitor.email,
                            mobile: newVisitor.mobile,
                            employeeId: newVisitor.employeeId || undefined,
                            isActive: editingVisitor.isActive !== false,
                          }
                          await api.admin.visitors.update(editingVisitor.id, updateData)
                          
                          // Update password if provided
                          if (newVisitor.password) {
                            await api.admin.visitors.updatePassword(editingVisitor.id, newVisitor.password)
                          }
                        } else {
                          // Create new visitor
                          await api.admin.visitors.create({
                            username: newVisitor.username,
                            password: newVisitor.password,
                            firstName: newVisitor.firstName,
                            lastName: newVisitor.lastName,
                            email: newVisitor.email,
                            mobile: newVisitor.mobile,
                            employeeId: newVisitor.employeeId || undefined,
                          })
                        }
                        await loadData()
                      } else {
                        // Fallback to localStorage
                        const allVisitors = JSON.parse(localStorage.getItem("visitors") || "[]")

                        if (editingVisitor) {
                          // Update existing visitor
                          const updated = allVisitors.map((v: Visitor & { password?: string }) => {
                            if (v.id === editingVisitor.id) {
                              return {
                                ...v,
                                firstName: newVisitor.firstName,
                                lastName: newVisitor.lastName,
                                email: newVisitor.email,
                                mobile: newVisitor.mobile,
                                employeeId: newVisitor.employeeId || undefined,
                                password: newVisitor.password || v.password,
                                updatedAt: new Date().toISOString(),
                              }
                            }
                            return v
                          })
                          localStorage.setItem("visitors", JSON.stringify(updated))
                        } else {
                          // Create new visitor
                          const newVisitorData: Visitor & { password: string } = {
                            id: `visitor_${Date.now()}`,
                            username: newVisitor.username,
                            password: newVisitor.password,
                            firstName: newVisitor.firstName,
                            lastName: newVisitor.lastName,
                            email: newVisitor.email,
                            mobile: newVisitor.mobile,
                            employeeId: newVisitor.employeeId || undefined,
                            isActive: true,
                            createdAt: new Date().toISOString(),
                            createdBy: dealer?.id,
                          }

                          // Check if username or email already exists
                          const usernameExists = allVisitors.some((v: Visitor) => v.username === newVisitor.username)
                          const emailExists = allVisitors.some((v: Visitor) => v.email === newVisitor.email)

                          if (usernameExists) {
                            alert("Username already exists")
                            return
                          }

                          if (emailExists) {
                            alert("Email already exists")
                            return
                          }

                          allVisitors.push(newVisitorData)
                          localStorage.setItem("visitors", JSON.stringify(allVisitors))
                        }

                        // Reload visitors
                        const updatedVisitors = JSON.parse(localStorage.getItem("visitors") || "[]")
                        const visitorsWithoutPassword = updatedVisitors.map((v: Visitor & { password?: string }) => {
                          const { password: _, ...visitorData } = v
                          return visitorData
                        })
                        setVisitors(visitorsWithoutPassword)
                      }

                      setVisitorDialogOpen(false)
                      setEditingVisitor(null)
                      setNewVisitor({
                        username: "",
                        password: "",
                        firstName: "",
                        lastName: "",
                        email: "",
                        mobile: "",
                        employeeId: "",
                      })
                    } catch (error) {
                      console.error("Error saving visitor:", error)
                      alert(error instanceof ApiError ? error.message : "Failed to save visitor")
                    }
                  }}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {editingVisitor ? "Update Visitor" : "Create Visitor"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Unified Create/Edit User Dialog (same registration fields for all) */}
        <Dialog
          open={accountManagerDialogOpen}
          onOpenChange={(open) => {
            setAccountManagerDialogOpen(open)
            if (!open) {
              setEditingManagedKind(null)
              setEditingAccountManager(null)
              setEditingDealer(null)
              setEditingVisitor(null)
              setNewAccountManager(emptyUnifiedUserForm())
            }
          }}
        >
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingManagedKind
                  ? `Edit User — ${newAccountManager.firstName} ${newAccountManager.lastName}`.trim()
                  : "Create New User ID"}
              </DialogTitle>
              <DialogDescription>
                Same registration form for dealers, operations, and visitors. Check dashboard access and fill profile details.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2 rounded-lg border border-border/70 p-3">
                <Label className="text-base font-semibold">Dashboard access *</Label>
                <p className="text-xs text-muted-foreground">
                  Check dashboards to open after login. Accounts, Installation, Metering, and Final confirmation
                  include field read/write and &quot;Which to access&quot; on the same row. Dealer is checkbox only —
                  dealers always get full access when that box is checked.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ASSIGNABLE_USER_ACCESS_OPTIONS.map((opt) => {
                    const checked = newAccountManager.access.includes(opt.key)
                    const workflowModule = isWorkflowAccessKey(opt.key) ? opt.key : null
                    return (
                      <div
                        key={opt.key}
                        className={
                          workflowModule
                            ? "sm:col-span-2 rounded-md border border-border/50 p-2.5"
                            : "rounded-md p-2 hover:bg-muted/40"
                        }
                      >
                        <label className="flex items-start gap-2 cursor-pointer">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => {
                              const on = value === true
                              setNewAccountManager((prev) => {
                                const next = on
                                  ? [...prev.access, opt.key]
                                  : prev.access.filter((k) => k !== opt.key)
                                const unique = Array.from(new Set(next)) as UserAccessKey[]
                                let moduleFieldPermissions = prev.moduleFieldPermissions
                                if (workflowModule) {
                                  if (on) {
                                    const current = moduleFieldPermissions[workflowModule]
                                    if (!current || current.level === "none") {
                                      moduleFieldPermissions = patchModuleFieldPermission(
                                        moduleFieldPermissions,
                                        workflowModule,
                                        { level: "write", scope: "everyone" },
                                      )
                                    }
                                  } else {
                                    moduleFieldPermissions = patchModuleFieldPermission(
                                      moduleFieldPermissions,
                                      workflowModule,
                                      { level: "none" },
                                    )
                                  }
                                }
                                return {
                                  ...prev,
                                  access: unique,
                                  role: unique.length ? primaryBackendRoleFromAccess(unique) : "",
                                  moduleFieldPermissions,
                                }
                              })
                            }}
                            className="mt-0.5"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium leading-tight">{opt.label}</span>
                            <span className="block text-[11px] text-muted-foreground leading-snug">{opt.description}</span>
                          </span>
                        </label>
                        {workflowModule ? (
                          <WorkflowModuleInlineControls
                            module={workflowModule}
                            permissions={newAccountManager.moduleFieldPermissions}
                            onChange={(next) =>
                              setNewAccountManager((prev) => ({ ...prev, moduleFieldPermissions: next }))
                            }
                            userOptions={modulePermissionUserOptions}
                            enabled={checked}
                          />
                        ) : null}
                      </div>
                    )
                  })}
                </div>
                {newAccountManager.access.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Selected: {accessLabels(newAccountManager.access).join(", ")}
                  </p>
                ) : null}
              </div>

              <div className="space-y-4">
                <Label className="text-base font-semibold">Login</Label>
                <div className="space-y-2">
                  <Label htmlFor="am-username">Username *</Label>
                  <Input
                    id="am-username"
                    value={newAccountManager.username}
                    onChange={(e) => setNewAccountManager({ ...newAccountManager, username: e.target.value })}
                    placeholder="Enter username"
                    disabled={!!editingManagedKind}
                  />
                  {editingManagedKind ? (
                    <p className="text-xs text-muted-foreground">Username cannot be changed</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="am-password">
                    {editingManagedKind ? "New Password (leave blank to keep current)" : "Password *"}
                  </Label>
                  <Input
                    id="am-password"
                    type="password"
                    value={newAccountManager.password}
                    onChange={(e) => setNewAccountManager({ ...newAccountManager, password: e.target.value })}
                    placeholder={editingManagedKind ? "Enter new password" : "Enter password"}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <Label className="text-base font-semibold">Personal Information</Label>
                <OfficeLocationSelect
                  officeLocation={newAccountManager.officeLocation}
                  onOfficeLocationChange={(value) =>
                    setNewAccountManager((prev) => ({ ...prev, officeLocation: value }))
                  }
                />
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="am-firstName">First Name *</Label>
                    <Input
                      id="am-firstName"
                      value={newAccountManager.firstName}
                      onChange={(e) => setNewAccountManager({ ...newAccountManager, firstName: e.target.value })}
                      placeholder="Enter first name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="am-lastName">Last Name *</Label>
                    <Input
                      id="am-lastName"
                      value={newAccountManager.lastName}
                      onChange={(e) => setNewAccountManager({ ...newAccountManager, lastName: e.target.value })}
                      placeholder="Enter last name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="am-email">Email *</Label>
                    <Input
                      id="am-email"
                      type="email"
                      value={newAccountManager.email}
                      onChange={(e) => setNewAccountManager({ ...newAccountManager, email: e.target.value })}
                      placeholder="Enter email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="am-mobile">Mobile *</Label>
                    <Input
                      id="am-mobile"
                      type="tel"
                      value={newAccountManager.mobile}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/\D/g, "").slice(0, 10)
                        setNewAccountManager({ ...newAccountManager, mobile: cleaned })
                      }}
                      placeholder="Enter 10-digit mobile number"
                      maxLength={10}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="am-gender">Gender *</Label>
                    <Select
                      value={newAccountManager.gender || ""}
                      onValueChange={(value) => setNewAccountManager({ ...newAccountManager, gender: value })}
                    >
                      <SelectTrigger id="am-gender">
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="am-dob">Date of Birth *</Label>
                    <Input
                      id="am-dob"
                      type="date"
                      value={newAccountManager.dateOfBirth || ""}
                      onChange={(e) => setNewAccountManager({ ...newAccountManager, dateOfBirth: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="am-fatherName">Father Name *</Label>
                    <Input
                      id="am-fatherName"
                      value={newAccountManager.fatherName}
                      onChange={(e) => setNewAccountManager({ ...newAccountManager, fatherName: e.target.value })}
                      placeholder="Enter father name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="am-fatherContact">Father Contact *</Label>
                    <Input
                      id="am-fatherContact"
                      value={newAccountManager.fatherContact}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/\D/g, "").slice(0, 10)
                        setNewAccountManager({ ...newAccountManager, fatherContact: cleaned })
                      }}
                      placeholder="Enter 10-digit mobile"
                      maxLength={10}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="am-govType">Government ID Type *</Label>
                    <Select
                      value={newAccountManager.governmentIdType || ""}
                      onValueChange={(value) => setNewAccountManager({ ...newAccountManager, governmentIdType: value })}
                    >
                      <SelectTrigger id="am-govType">
                        <SelectValue placeholder="Select ID type" />
                      </SelectTrigger>
                      <SelectContent>
                        {governmentIds.map((idType) => (
                          <SelectItem key={idType} value={idType}>
                            {idType}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="am-govNumber">Government ID Number *</Label>
                    <Input
                      id="am-govNumber"
                      value={newAccountManager.governmentIdNumber}
                      onChange={(e) => setNewAccountManager({ ...newAccountManager, governmentIdNumber: e.target.value })}
                      placeholder="Enter ID number"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="am-employeeId">Employee ID</Label>
                  <Input
                    id="am-employeeId"
                    value={newAccountManager.employeeId}
                    onChange={(e) => setNewAccountManager({ ...newAccountManager, employeeId: e.target.value })}
                    placeholder="Optional — used for visitors / staff"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <Label className="text-base font-semibold">Address</Label>
                <div className="space-y-2">
                  <Label htmlFor="am-street">Street *</Label>
                  <Input
                    id="am-street"
                    value={newAccountManager.address.street}
                    onChange={(e) =>
                      setNewAccountManager({
                        ...newAccountManager,
                        address: { ...newAccountManager.address, street: e.target.value },
                      })
                    }
                    placeholder="Street address"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="am-city">City *</Label>
                    <Input
                      id="am-city"
                      value={newAccountManager.address.city}
                      onChange={(e) =>
                        setNewAccountManager({
                          ...newAccountManager,
                          address: { ...newAccountManager.address, city: e.target.value },
                        })
                      }
                      placeholder="City"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="am-state">State *</Label>
                    <Select
                      value={newAccountManager.address.state || ""}
                      onValueChange={(value) =>
                        setNewAccountManager({
                          ...newAccountManager,
                          address: { ...newAccountManager.address, state: value },
                        })
                      }
                    >
                      <SelectTrigger id="am-state">
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {indianStates.map((state) => (
                          <SelectItem key={state} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="am-pincode">Pincode *</Label>
                  <Input
                    id="am-pincode"
                    value={newAccountManager.address.pincode}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/\D/g, "").slice(0, 6)
                      setNewAccountManager({
                        ...newAccountManager,
                        address: { ...newAccountManager.address, pincode: cleaned },
                      })
                    }}
                    placeholder="6-digit pincode"
                    maxLength={6}
                  />
                </div>
              </div>

              {editingManagedKind ? (
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={newAccountManager.isActive}
                      onCheckedChange={(v) =>
                        setNewAccountManager({ ...newAccountManager, isActive: v === true })
                      }
                    />
                    Active
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={newAccountManager.emailVerified}
                      onCheckedChange={(v) =>
                        setNewAccountManager({ ...newAccountManager, emailVerified: v === true })
                      }
                    />
                    Email verified
                  </label>
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAccountManagerDialogOpen(false)
                    setEditingManagedKind(null)
                    setEditingAccountManager(null)
                    setEditingDealer(null)
                    setEditingVisitor(null)
                    setNewAccountManager(emptyUnifiedUserForm())
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={async () => {
                    const selectedAccess = normalizeAccessList(newAccountManager.access)
                    if (selectedAccess.length === 0) {
                      toast({
                        title: "Validation Error",
                        description: "Select at least one dashboard access.",
                        variant: "destructive",
                      })
                      return
                    }
                    const primaryRole = primaryBackendRoleFromAccess(selectedAccess)
                    const isEditing = Boolean(editingManagedKind)
                    const coreMissing =
                      !newAccountManager.firstName.trim() ||
                      !newAccountManager.lastName.trim() ||
                      !newAccountManager.username.trim() ||
                      !newAccountManager.email.trim() ||
                      !newAccountManager.mobile.trim()
                    const profileMissing =
                      !newAccountManager.gender ||
                      !newAccountManager.dateOfBirth ||
                      !newAccountManager.fatherName.trim() ||
                      !newAccountManager.fatherContact.trim() ||
                      !newAccountManager.governmentIdType ||
                      !newAccountManager.governmentIdNumber.trim() ||
                      !newAccountManager.address.street.trim() ||
                      !newAccountManager.address.city.trim() ||
                      !newAccountManager.address.state ||
                      !newAccountManager.address.pincode.trim()

                    if (coreMissing || (!isEditing && profileMissing)) {
                      toast({
                        title: "Validation Error",
                        description: "Please fill in all required registration fields.",
                        variant: "destructive",
                      })
                      return
                    }
                    if (!isEditing && !newAccountManager.password) {
                      toast({
                        title: "Validation Error",
                        description: "Password is required for new users.",
                        variant: "destructive",
                      })
                      return
                    }
                    if (newAccountManager.mobile.length !== 10) {
                      toast({
                        title: "Validation Error",
                        description: "Mobile must be 10 digits.",
                        variant: "destructive",
                      })
                      return
                    }
                    if (newAccountManager.fatherContact && newAccountManager.fatherContact.length !== 10) {
                      toast({
                        title: "Validation Error",
                        description: "Father contact must be 10 digits.",
                        variant: "destructive",
                      })
                      return
                    }
                    if (newAccountManager.address.pincode && newAccountManager.address.pincode.length !== 6) {
                      toast({
                        title: "Validation Error",
                        description: "Pincode must be 6 digits.",
                        variant: "destructive",
                      })
                      return
                    }

                    const profilePayload = {
                      firstName: newAccountManager.firstName.trim(),
                      lastName: newAccountManager.lastName.trim(),
                      email: newAccountManager.email.trim(),
                      mobile: newAccountManager.mobile,
                      gender: newAccountManager.gender || undefined,
                      dateOfBirth: newAccountManager.dateOfBirth || undefined,
                      fatherName: newAccountManager.fatherName.trim() || undefined,
                      fatherContact: newAccountManager.fatherContact || undefined,
                      governmentIdType: newAccountManager.governmentIdType || undefined,
                      governmentIdNumber: newAccountManager.governmentIdNumber.trim() || undefined,
                      address: {
                        street: newAccountManager.address.street.trim(),
                        city: newAccountManager.address.city.trim(),
                        state: newAccountManager.address.state,
                        pincode: newAccountManager.address.pincode,
                      },
                      employeeId: newAccountManager.employeeId.trim() || undefined,
                      access: selectedAccess,
                      permissions: selectedAccess,
                      role: primaryRole,
                      isActive: newAccountManager.isActive,
                      emailVerified: newAccountManager.emailVerified,
                      officeLocation: newAccountManager.officeLocation || undefined,
                      office_location: newAccountManager.officeLocation || undefined,
                      moduleFieldPermissions: newAccountManager.moduleFieldPermissions,
                      modulePermissions: newAccountManager.moduleFieldPermissions,
                    }

                    try {
                      if (useApi) {
                        if (editingManagedKind === "dealer" && editingDealer) {
                          try {
                            await api.admin.dealers.update(editingDealer.id, profilePayload)
                          } catch {
                            await api.admin.dealers.update(editingDealer.id, {
                              firstName: profilePayload.firstName,
                              lastName: profilePayload.lastName,
                              email: profilePayload.email,
                              mobile: profilePayload.mobile,
                              gender: profilePayload.gender,
                              dateOfBirth: profilePayload.dateOfBirth,
                              fatherName: profilePayload.fatherName,
                              fatherContact: profilePayload.fatherContact,
                              governmentIdType: profilePayload.governmentIdType,
                              governmentIdNumber: profilePayload.governmentIdNumber,
                              address: profilePayload.address,
                              isActive: profilePayload.isActive,
                              emailVerified: profilePayload.emailVerified,
                              access: selectedAccess,
                              permissions: selectedAccess,
                            })
                          }
                          saveAccessOverride(newAccountManager.username, selectedAccess)
                        } else if (editingManagedKind === "visitor" && editingVisitor) {
                          await api.admin.visitors.update(editingVisitor.id, {
                            ...profilePayload,
                            employeeId: newAccountManager.employeeId.trim() || undefined,
                          })
                          if (newAccountManager.password) {
                            await api.admin.visitors.updatePassword(editingVisitor.id, newAccountManager.password)
                          }
                          saveAccessOverride(newAccountManager.username, selectedAccess)
                        } else if (editingManagedKind === "operations" && editingAccountManager) {
                          try {
                            await api.admin.accountManagers.update(editingAccountManager.id, profilePayload)
                          } catch {
                            await api.admin.accountManagers.update(editingAccountManager.id, {
                              firstName: profilePayload.firstName,
                              lastName: profilePayload.lastName,
                              email: profilePayload.email,
                              mobile: profilePayload.mobile,
                              access: selectedAccess,
                              permissions: selectedAccess,
                              role: primaryRole,
                            })
                          }
                          if (newAccountManager.password) {
                            await api.admin.accountManagers.updatePassword(
                              editingAccountManager.id,
                              newAccountManager.password,
                            )
                          }
                          saveAccessOverride(newAccountManager.username, selectedAccess)
                          saveOperationsRoleOverride(newAccountManager.username, primaryRole)
                        } else if (!isEditing) {
                          if (primaryRole === "visitor" || (selectedAccess.length === 1 && selectedAccess[0] === "visitor")) {
                            await api.admin.visitors.create({
                              username: newAccountManager.username.trim(),
                              password: newAccountManager.password,
                              ...profilePayload,
                            })
                          } else if (primaryRole === "dealer") {
                            await api.dealers.register({
                              username: newAccountManager.username.trim(),
                              password: newAccountManager.password,
                              firstName: profilePayload.firstName,
                              lastName: profilePayload.lastName,
                              email: profilePayload.email,
                              mobile: profilePayload.mobile,
                              gender: profilePayload.gender,
                              dateOfBirth: profilePayload.dateOfBirth,
                              fatherName: profilePayload.fatherName,
                              fatherContact: profilePayload.fatherContact,
                              governmentIdType: profilePayload.governmentIdType,
                              governmentIdNumber: profilePayload.governmentIdNumber,
                              address: profilePayload.address,
                            })
                            // Best-effort: activate + persist access after self-register path
                            try {
                              const dealersRes = await api.admin.dealers.getAll({
                                page: 1,
                                limit: 1000,
                                includeInactive: true,
                                search: newAccountManager.username.trim(),
                              } as any)
                              const created = (dealersRes.dealers || dealersRes || []).find(
                                (d: any) =>
                                  String(d.username || "").toLowerCase() ===
                                  newAccountManager.username.trim().toLowerCase(),
                              )
                              if (created?.id) {
                                try {
                                  await api.admin.dealers.activate(created.id)
                                } catch {
                                  /* optional */
                                }
                                try {
                                  await api.admin.dealers.update(created.id, {
                                    access: selectedAccess,
                                    permissions: selectedAccess,
                                    isActive: true,
                                  })
                                } catch {
                                  /* optional */
                                }
                              }
                            } catch {
                              /* list may differ by backend */
                            }
                          } else {
                            const createPayload = {
                              username: newAccountManager.username.trim(),
                              password: newAccountManager.password,
                              ...profilePayload,
                            }
                            try {
                              await api.admin.accountManagers.create(createPayload)
                            } catch (createError) {
                              if (
                                createError instanceof ApiError &&
                                (createError.code === "VAL_001" || createError.code === "HTTP_400")
                              ) {
                                await api.admin.accountManagers.create({
                                  role: primaryRole,
                                  username: createPayload.username,
                                  password: createPayload.password,
                                  firstName: createPayload.firstName,
                                  lastName: createPayload.lastName,
                                  email: createPayload.email,
                                  mobile: createPayload.mobile,
                                })
                                toast({
                                  title: "Created with compatibility mode",
                                  description:
                                    "Full profile/access saved locally until backend accepts extended fields.",
                                })
                              } else {
                                throw createError
                              }
                            }
                            saveOperationsRoleOverride(newAccountManager.username, primaryRole)
                          }
                          saveAccessOverride(newAccountManager.username, selectedAccess)
                        }
                        await loadData()
                      } else {
                        // localStorage fallback — mirror previous behaviour for ops; dealers/visitors too
                        if (editingManagedKind === "dealer" && editingDealer) {
                          const allDealers = JSON.parse(localStorage.getItem("dealers") || "[]")
                          const updated = allDealers.map((d: any) =>
                            d.id === editingDealer.id
                              ? { ...d, ...profilePayload, username: d.username, password: d.password }
                              : d,
                          )
                          localStorage.setItem("dealers", JSON.stringify(updated))
                          saveAccessOverride(newAccountManager.username, selectedAccess)
                        } else if (editingManagedKind === "visitor" && editingVisitor) {
                          const allVisitors = JSON.parse(localStorage.getItem("visitors") || "[]")
                          const updated = allVisitors.map((v: any) =>
                            v.id === editingVisitor.id
                              ? {
                                  ...v,
                                  ...profilePayload,
                                  password: newAccountManager.password || v.password,
                                }
                              : v,
                          )
                          localStorage.setItem("visitors", JSON.stringify(updated))
                          saveAccessOverride(newAccountManager.username, selectedAccess)
                        } else if (!isEditing && primaryRole === "visitor") {
                          const allVisitors = JSON.parse(localStorage.getItem("visitors") || "[]")
                          allVisitors.push({
                            id: `visitor-${Date.now()}`,
                            username: newAccountManager.username.trim(),
                            password: newAccountManager.password,
                            ...profilePayload,
                            createdAt: new Date().toISOString(),
                          })
                          localStorage.setItem("visitors", JSON.stringify(allVisitors))
                          saveAccessOverride(newAccountManager.username, selectedAccess)
                        } else if (!isEditing && primaryRole === "dealer") {
                          const allDealers = JSON.parse(localStorage.getItem("dealers") || "[]")
                          allDealers.push({
                            id: `dealer-${Date.now()}`,
                            username: newAccountManager.username.trim(),
                            password: newAccountManager.password,
                            ...profilePayload,
                            isActive: true,
                            emailVerified: false,
                            createdAt: new Date().toISOString(),
                          })
                          localStorage.setItem("dealers", JSON.stringify(allDealers))
                          saveAccessOverride(newAccountManager.username, selectedAccess)
                        } else {
                          const storageKey =
                            primaryRole === "installer"
                              ? "installers"
                              : primaryRole === "metering"
                                ? "meteringUsers"
                                : primaryRole === "baldev"
                                  ? "baldevUsers"
                                  : primaryRole === "hr"
                                    ? "hrUsers"
                                    : "accountManagers"
                          const list = JSON.parse(localStorage.getItem(storageKey) || "[]")
                          if (editingManagedKind === "operations" && editingAccountManager) {
                            const updated = list.map((am: any) =>
                              am.id === editingAccountManager.id
                                ? {
                                    ...am,
                                    ...profilePayload,
                                    password: newAccountManager.password || am.password,
                                  }
                                : am,
                            )
                            localStorage.setItem(storageKey, JSON.stringify(updated))
                          } else {
                            list.push({
                              id: `ops-${Date.now()}`,
                              username: newAccountManager.username.trim(),
                              password: newAccountManager.password,
                              ...profilePayload,
                              createdAt: new Date().toISOString(),
                            })
                            localStorage.setItem(storageKey, JSON.stringify(list))
                          }
                          saveAccessOverride(newAccountManager.username, selectedAccess)
                          saveOperationsRoleOverride(newAccountManager.username, primaryRole)
                        }
                        await loadData()
                      }

                      saveModulePermissionOverride(
                        newAccountManager.username,
                        newAccountManager.moduleFieldPermissions,
                      )
                      saveOfficeLocationOverride(newAccountManager.username, newAccountManager.officeLocation)

                      setAccountManagerDialogOpen(false)
                      setEditingManagedKind(null)
                      setEditingAccountManager(null)
                      setEditingDealer(null)
                      setEditingVisitor(null)
                      setNewAccountManager(emptyUnifiedUserForm())
                      toast({
                        title: "Success",
                        description: isEditing ? "User updated successfully!" : "User created successfully!",
                      })
                    } catch (error) {
                      console.error("Error saving user:", error)
                      let detailedMessage = "Failed to save user"
                      if (error instanceof ApiError) {
                        const firstDetail = error.details?.[0]
                        detailedMessage = firstDetail?.message || error.message || detailedMessage
                      }
                      toast({
                        title: "Error",
                        description: detailedMessage,
                        variant: "destructive",
                      })
                    }
                  }}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {editingManagedKind ? "Update User" : "Create User ID"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Account Manager History Dialog */}
        <Dialog open={accountManagerHistoryDialogOpen} onOpenChange={setAccountManagerHistoryDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-xl">
                    {selectedAccountManagerForHistory?.firstName} {selectedAccountManagerForHistory?.lastName}
                  </DialogTitle>
                  <DialogDescription className="mt-1">
                    Activity and login history for this account manager
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 mt-4">
              {isLoadingHistory ? (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4 animate-pulse">
                    <History className="w-8 h-8 opacity-50" />
                  </div>
                  <p className="font-medium">Loading history...</p>
                </div>
              ) : accountManagerHistory.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <History className="w-8 h-8 opacity-50" />
                  </div>
                  <p className="font-medium">No history available</p>
                  <p className="text-sm mt-1">Activity history will appear here once the account manager logs in</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {accountManagerHistory.map((historyItem: any, index: number) => {
                    const getActionColor = (action: string) => {
                      switch (action) {
                        case "login":
                          return "bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400 dark:bg-green-500/20"
                        case "logout":
                          return "bg-orange-500/10 text-orange-700 border-orange-500/20 dark:text-orange-400 dark:bg-orange-500/20"
                        case "view_quotations":
                        case "view_quotation_details":
                          return "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-400 dark:bg-blue-500/20"
                        case "password_change":
                          return "bg-purple-500/10 text-purple-700 border-purple-500/20 dark:text-purple-400 dark:bg-purple-500/20"
                        case "profile_update":
                          return "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400 dark:bg-amber-500/20"
                        default:
                          return "bg-gray-500/10 text-gray-700 border-gray-500/20 dark:text-gray-400 dark:bg-gray-500/20"
                      }
                    }
                    
                    const actionColor = getActionColor(historyItem.action || "")
                    
                    return (
                      <div key={historyItem.id || historyItem.timestamp || index} className="p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <Badge variant="outline" className={`${actionColor} font-medium capitalize text-xs`}>
                                {historyItem.action?.replace(/_/g, " ") || "activity"}
                              </Badge>
                              <span className="text-xs text-muted-foreground font-medium">
                                {historyItem.timestamp ? new Date(historyItem.timestamp).toLocaleString("en-IN", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                }) : "N/A"}
                              </span>
                            </div>
                            <p className="text-sm text-foreground mb-2 font-medium">
                              {historyItem.details || historyItem.description || "No details available"}
                            </p>
                            {(historyItem.ipAddress || historyItem.userAgent) && (
                              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                                {historyItem.ipAddress && (
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-muted-foreground">IP Address:</span>
                                    <span className="font-mono bg-muted px-2 py-0.5 rounded">{historyItem.ipAddress}</span>
                                  </div>
                                )}
                                {historyItem.userAgent && (
                                  <div className="flex items-center gap-2 max-w-md">
                                    <span className="font-semibold text-muted-foreground">Device:</span>
                                    <span className="truncate bg-muted px-2 py-0.5 rounded">{historyItem.userAgent}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-border mt-4">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <History className="w-4 h-4" />
                <span>Total activities: <span className="font-semibold text-foreground">{accountManagerHistory.length}</span></span>
              </div>
              <Button variant="outline" onClick={() => {
                setAccountManagerHistoryDialogOpen(false)
                setAccountManagerHistory([])
                setSelectedAccountManagerForHistory(null)
                setIsLoadingHistory(false)
              }}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={approvalDialogOpen}
          onOpenChange={(open) => {
            setApprovalDialogOpen(open)
            if (!open) {
              setApprovingQuotationId(null)
              setApprovalBankName("")
              setApprovalBankIfsc("")
              setApprovalSubsidyCheque("")
              setApprovalLoanAmount("")
              setApprovalCashAmount("")
              setApprovalAtInput("")
            }
          }}
        >
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Select Payment Type</DialogTitle>
              <DialogDescription>
                For Loan or Cash + loan, enter loan/cash amounts and the customer&apos;s bank and IFSC. For Cash or Cash + loan, you can record subsidy cheque details. The same details appear in Payment Management after approval.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="approval-payment-type">Payment Type</Label>
                <Select
                  value={approvalPaymentType}
                  onValueChange={(value) => {
                    const v = value as ApprovalPaymentType
                    setApprovalPaymentType(v)
                    const q = approvingQuotationId
                      ? quotations.find((x) => x.id === approvingQuotationId)
                      : undefined
                    const quotationTotal = q ? getQuotationSubtotalValue(q) : 0
                    if (v === "cash") {
                      setApprovalBankName("")
                      setApprovalBankIfsc("")
                      setApprovalLoanAmount("")
                      setApprovalCashAmount("")
                    } else if (v === "loan") {
                      setApprovalCashAmount("")
                      if (!approvalLoanAmount.trim() && quotationTotal > 0) {
                        setApprovalLoanAmount(String(quotationTotal))
                      }
                    } else if (v === "mix") {
                      if (!approvalLoanAmount.trim() && !approvalCashAmount.trim() && quotationTotal > 0) {
                        setApprovalLoanAmount("")
                        setApprovalCashAmount("")
                      }
                    }
                  }}
                >
                  <SelectTrigger id="approval-payment-type">
                    <SelectValue placeholder="Select payment type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="loan">Loan</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="mix">Cash + loan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="approval-at">Approve date & time</Label>
                <Input
                  id="approval-at"
                  type="datetime-local"
                  value={approvalAtInput}
                  onChange={(e) => setApprovalAtInput(e.target.value)}
                />
              </div>

              {(approvalPaymentType === "loan" || approvalPaymentType === "mix") && (
                <div className="space-y-3 rounded-lg border border-border/70 bg-muted/30 p-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Payment amounts (required)</p>
                    {approvingQuotationId && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Quotation total:{" "}
                        {formatQuotationAmountInr(
                          quotations.find((x) => x.id === approvingQuotationId) || {},
                        )}
                        {approvalPaymentType === "mix" ? " — loan + cash must match this total." : ""}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="approval-loan-amount">Loan amount (₹)</Label>
                    <Input
                      id="approval-loan-amount"
                      type="number"
                      min={0}
                      step={1}
                      value={approvalLoanAmount}
                      onChange={(e) => setApprovalLoanAmount(e.target.value)}
                      placeholder="e.g. 500000"
                    />
                  </div>
                  {approvalPaymentType === "mix" && (
                    <div className="space-y-2">
                      <Label htmlFor="approval-cash-amount">Cash amount (₹)</Label>
                      <Input
                        id="approval-cash-amount"
                        type="number"
                        min={0}
                        step={1}
                        value={approvalCashAmount}
                        onChange={(e) => setApprovalCashAmount(e.target.value)}
                        placeholder="e.g. 250000"
                      />
                    </div>
                  )}
                </div>
              )}

              {(approvalPaymentType === "loan" || approvalPaymentType === "mix") && (
                <div className="space-y-3 rounded-lg border border-border/70 bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Customer financing bank (required)</p>
                  <div className="space-y-2">
                    <Label htmlFor="approval-bank-name">Bank name</Label>
                    <Input
                      id="approval-bank-name"
                      list="government-bank-options"
                      value={approvalBankName}
                      onChange={(e) => setApprovalBankName(e.target.value)}
                      placeholder="e.g. State Bank of India"
                      autoComplete="organization"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Search/select a government bank, or type a new bank name.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="approval-bank-ifsc">IFSC code</Label>
                    <Input
                      id="approval-bank-ifsc"
                      value={approvalBankIfsc}
                      onChange={(e) => setApprovalBankIfsc(e.target.value.toUpperCase())}
                      placeholder="e.g. SBIN0001234"
                      maxLength={11}
                      className="font-mono uppercase"
                      autoComplete="off"
                    />
                  </div>
                </div>
              )}

              {(approvalPaymentType === "cash" || approvalPaymentType === "mix") && (
                <div className="space-y-2">
                  <Label htmlFor="approval-subsidy-cheque">Subsidy cheque details</Label>
                  <Textarea
                    id="approval-subsidy-cheque"
                    value={approvalSubsidyCheque}
                    onChange={(e) => setApprovalSubsidyCheque(e.target.value)}
                    placeholder="Cheque number, bank, amount, date (if provided by customer)"
                    rows={3}
                    className="resize-y min-h-[72px]"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setApprovalDialogOpen(false)
                  setApprovingQuotationId(null)
                  setApprovalBankName("")
                  setApprovalBankIfsc("")
                  setApprovalSubsidyCheque("")
                  setApprovalLoanAmount("")
                  setApprovalCashAmount("")
                  setApprovalAtInput("")
                }}
              >
                Cancel
              </Button>
              <Button onClick={confirmApprovalWithPaymentType}>Approve Quotation</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={fileLoginDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              const qid = fileLoginQuotationId
              if (qid) {
                setOptimisticFileLoginSelect((prev) => {
                  const next = { ...prev }
                  delete next[qid]
                  return next
                })
              }
              setFileLoginQuotationId(null)
              resetFileLoginFormFields()
              setFileLoginAtInput("")
            }
            setFileLoginDialogOpen(open)
          }}
        >
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>File login</DialogTitle>
              <DialogDescription>
                Choose how the file is logged on the subsidy portal. Payment type matches the Approve flow. Cash + loan uses the same rules as Loan for bank details.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>File login status</Label>
                <Select
                  value={fileLoginStatusChoice}
                  onValueChange={(v) => setFileLoginStatusChoice(v as FileLoginStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="already_login">Already logged in</SelectItem>
                    <SelectItem value="login_now">Login now</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="file-login-at">File login date & time</Label>
                <Input
                  id="file-login-at"
                  type="datetime-local"
                  value={fileLoginAtInput}
                  onChange={(e) => setFileLoginAtInput(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="file-login-payment-type">File payment type</Label>
                <Select
                  value={fileLoginPaymentType}
                  onValueChange={(v) => {
                    const val = v as ApprovalPaymentType
                    setFileLoginPaymentType(val)
                    if (val === "cash") {
                      setFileLoginBankName("")
                      setFileLoginBankIfsc("")
                    }
                  }}
                >
                  <SelectTrigger id="file-login-payment-type">
                    <SelectValue placeholder="Select payment type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="loan">Loan</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="mix">Cash + loan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(fileLoginPaymentType === "loan" || fileLoginPaymentType === "mix") && (
                <div className="space-y-3 rounded-lg border border-border/70 bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Customer financing bank (required)</p>
                  <div className="space-y-2">
                    <Label htmlFor="file-login-bank-name">Bank name</Label>
                    <Input
                      id="file-login-bank-name"
                      list="government-bank-options"
                      value={fileLoginBankName}
                      onChange={(e) => setFileLoginBankName(e.target.value)}
                      placeholder="e.g. State Bank of India"
                      autoComplete="organization"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Search/select a government bank, or type a new bank name.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="file-login-bank-ifsc">IFSC code</Label>
                    <Input
                      id="file-login-bank-ifsc"
                      value={fileLoginBankIfsc}
                      onChange={(e) => setFileLoginBankIfsc(e.target.value.toUpperCase())}
                      placeholder="e.g. SBIN0001234"
                      maxLength={11}
                      className="font-mono uppercase"
                    />
                  </div>
                </div>
              )}
              {(fileLoginPaymentType === "cash" || fileLoginPaymentType === "mix") && (
                <div className="space-y-2">
                  <Label htmlFor="file-login-subsidy-cheque">Subsidy cheque details</Label>
                  <Textarea
                    id="file-login-subsidy-cheque"
                    value={fileLoginSubsidyCheque}
                    onChange={(e) => setFileLoginSubsidyCheque(e.target.value)}
                    placeholder="Cheque number, bank, amount, date (if provided by customer)"
                    rows={3}
                    className="resize-y min-h-[72px]"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setFileLoginDialogOpen(false)}
                disabled={isSavingFileLogin}
              >
                Cancel
              </Button>
              <Button onClick={() => void confirmSaveFileLogin()} disabled={isSavingFileLogin}>
                {isSavingFileLogin ? "Saving…" : "Save"}
              </Button>
            </div>
            <datalist id="government-bank-options">
              {GOVERNMENT_BANK_OPTIONS.map((bank) => (
                <option key={bank} value={bank} />
              ))}
            </datalist>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!adminWccModalQuotationId}
          onOpenChange={(open) => {
            if (!open) {
              setAdminWccModalQuotationId(null)
              setAdminInstallQuotation(null)
              setAdminInstallMediaByField({})
              setAdminInstallPiMedia([])
            }
          }}
        >
          <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col gap-0 p-0">
            {(() => {
              const quotation =
                (adminWccModalQuotationId
                  ? (adminInstallQuotation?.id === adminWccModalQuotationId
                      ? adminInstallQuotation
                      : null) ||
                    quotations.find((q) => q.id === adminWccModalQuotationId) ||
                    meteringWccPendingQuotations.find((q) => q.id === adminWccModalQuotationId) ||
                    sortedQuotations.find((q) => q.id === adminWccModalQuotationId)
                  : null) || null
              if (!quotation) {
                return (
                  <div className="p-6">
                    <DialogHeader>
                      <DialogTitle>WCC details</DialogTitle>
                      <DialogDescription>Record not found.</DialogDescription>
                    </DialogHeader>
                  </div>
                )
              }
              const qAny = quotation as unknown as Record<string, unknown>
              const draft = getAdminWccDraft(quotation)
              const nestedDealer = qAny.dealer as Record<string, unknown> | null | undefined
              const fromList = dealers.find((d) => d.id === quotation.dealerId)
              const dealerName =
                (nestedDealer && typeof nestedDealer === "object"
                  ? formatPersonName(
                      String(nestedDealer.firstName || ""),
                      String(nestedDealer.lastName || ""),
                      String(nestedDealer.username || "").trim() || "Dealer",
                    )
                  : "") ||
                (fromList
                  ? formatPersonName(fromList.firstName, fromList.lastName, "Dealer")
                  : "Unknown Dealer")
              const approvedAt =
                qAny.installerApprovedAt ||
                qAny.installer_approved_at ||
                qAny.approvedAt ||
                qAny.approvedDate ||
                quotation.createdAt
              return (
                <>
                  <div className="shrink-0 border-b border-border/70 px-5 pt-5 pb-3 pr-12">
                    <DialogHeader className="space-y-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <DialogTitle className="text-base leading-tight">
                          {formatPersonName(
                            quotation.customer.firstName,
                            quotation.customer.lastName,
                            "Unknown",
                          )}
                        </DialogTitle>
                        <Badge
                          variant="outline"
                          className="text-[10px] border-violet-300/80 bg-violet-50 text-violet-800 shrink-0"
                        >
                          WCC Pending
                        </Badge>
                      </div>
                      <DialogDescription className="text-xs">
                        {quotation.customer.mobile || "No mobile"} • {quotation.id} • {dealerName}
                        <span className="mx-1.5 text-border">|</span>
                        Amount {getMeteringAmountDisplay(quotation).primaryLabel}
                        <span className="mx-1.5 text-border">|</span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Approved{" "}
                          {approvedAt ? new Date(String(approvedAt)).toLocaleDateString("en-IN") : "N/A"}
                        </span>
                      </DialogDescription>
                    </DialogHeader>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-md border border-border/70 bg-muted/15 p-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Discom name *</Label>
                        <Input
                          className="h-9 text-sm"
                          value={draft.discomName}
                          onChange={(e) => patchAdminWccDraft(quotation.id, { discomName: e.target.value })}
                          placeholder="Enter discom name"
                          autoFocus
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Assigned person name *</Label>
                        <Input
                          className="h-9 text-sm"
                          value={draft.assignedPersonName}
                          onChange={(e) =>
                            patchAdminWccDraft(quotation.id, { assignedPersonName: e.target.value })
                          }
                          placeholder="Person assigned for WCC / discom"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Remarks</Label>
                        <Input
                          className="h-9 text-sm"
                          value={draft.remarks}
                          onChange={(e) => patchAdminWccDraft(quotation.id, { remarks: e.target.value })}
                          placeholder="Notes / remarks"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Discom location (optional)</Label>
                        <Input
                          className="h-9 text-sm"
                          value={draft.discomLocation}
                          onChange={(e) =>
                            patchAdminWccDraft(quotation.id, { discomLocation: e.target.value })
                          }
                          placeholder="Office / site location"
                        />
                      </div>
                    </div>

                    <InstallationCompletionPanel
                      uploadsOnly
                      hideFooter
                      compact
                      hidePi
                      imageFields={
                        ADMIN_WCC_IMAGE_FIELDS as readonly {
                          key: string
                          label: string
                          required?: boolean
                          multiple?: boolean
                        }[]
                      }
                      filesByField={
                        adminInstallMediaByField as Record<string, InstallationUploadedFile[] | undefined>
                      }
                      onFilesChange={(fieldKey, files) =>
                        setAdminInstallMediaByField((prev) => ({
                          ...prev,
                          [fieldKey]: files.map((f) => ({
                            name: f.name,
                            url: URL.createObjectURL(f),
                            localFile: f,
                          })),
                        }))
                      }
                      piFiles={adminInstallPiMedia}
                      onPiFilesChange={(files) => {
                        if (!files.length) return
                        setAdminInstallPiMedia((prev) => [
                          ...prev,
                          ...files.map((f) => ({
                            name: f.name,
                            url: URL.createObjectURL(f),
                            localFile: f,
                          })),
                        ])
                      }}
                      onRemovePiFile={(index) =>
                        setAdminInstallPiMedia((prev) => prev.filter((_, i) => i !== index))
                      }
                      extraExpenses={[]}
                      onAddExpense={() => {}}
                      onExpenseChange={() => {}}
                      onRemoveExpense={() => {}}
                      dimensions={{ length: "", width: "", height: "" }}
                      onDimensionsChange={() => {}}
                      notes=""
                      onNotesChange={() => {}}
                      infoSections={[]}
                      saveLabel="Save"
                      saving={false}
                      onCancel={() => setAdminWccModalQuotationId(null)}
                      onSave={() => {}}
                    />
                  </div>

                  <div className="shrink-0 flex justify-end gap-2 border-t border-border/70 bg-background px-5 py-3">
                    <Button type="button" variant="outline" onClick={() => setAdminWccModalQuotationId(null)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={adminWccSavingId === quotation.id}
                      onClick={() => void saveAdminWccMeteringDetails(quotation)}
                    >
                      {adminWccSavingId === quotation.id
                        ? "Saving..."
                        : "Save & move to Meter Installation Pending"}
                    </Button>
                  </div>
                </>
              )
            })()}
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!adminMeterInstallModalQuotationId}
          onOpenChange={(open) => {
            if (!open) setAdminMeterInstallModalQuotationId(null)
          }}
        >
          <DialogContent className="max-w-2xl max-h-[92vh] overflow-hidden flex flex-col gap-0 p-0">
            {(() => {
              const quotation =
                (adminMeterInstallModalQuotationId
                  ? quotations.find((q) => q.id === adminMeterInstallModalQuotationId) ||
                    meteringMeterInstallQuotations.find((q) => q.id === adminMeterInstallModalQuotationId) ||
                    sortedQuotations.find((q) => q.id === adminMeterInstallModalQuotationId)
                  : null) || null
              if (!quotation) {
                return (
                  <div className="p-6">
                    <DialogHeader>
                      <DialogTitle>Meter installation</DialogTitle>
                      <DialogDescription>Record not found.</DialogDescription>
                    </DialogHeader>
                  </div>
                )
              }
              const draft = getAdminMeterInstallDraft(quotation)
              const location = formatQuotationCustomerLocation(quotation) || "No location on quotation"
              const meterSlot = resolveMeterInstallPhotoSlot(quotation)
              const plantSlot = resolvePlantLivePhotoSlot(quotation)
              const meterPreview = meterSlot.url || ""
              const plantPreview = plantSlot.url || ""
              return (
                <>
                  <div className="shrink-0 border-b border-border/70 px-5 pt-5 pb-3 pr-12">
                    <DialogHeader className="space-y-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <DialogTitle className="text-base leading-tight">
                          {formatPersonName(
                            quotation.customer.firstName,
                            quotation.customer.lastName,
                            "Unknown",
                          )}
                        </DialogTitle>
                        <Badge
                          variant="outline"
                          className="text-[10px] border-violet-300/80 bg-violet-50 text-violet-800 shrink-0"
                        >
                          Meter Installation Pending
                        </Badge>
                      </div>
                      <DialogDescription className="text-xs">
                        {quotation.customer.mobile || "No mobile"} • {quotation.id}
                        <span className="mx-1.5 text-border">|</span>
                        Amount {getMeteringAmountDisplay(quotation).primaryLabel}
                      </DialogDescription>
                    </DialogHeader>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 space-y-3">
                    <div className="rounded-md border border-border/70 bg-muted/15 p-3 space-y-1">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Customer location
                      </p>
                      <p className="text-sm font-medium leading-snug">{location}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Meter installation photo *</Label>
                        <div className="relative overflow-hidden rounded-md border border-dashed border-border/70 aspect-[4/3] bg-muted/20">
                          {meterPreview ? (
                            <img
                              src={meterPreview}
                              alt="Meter installation"
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                          ) : null}
                          <div className="absolute inset-x-0 bottom-2 flex justify-center">
                            <Label
                              htmlFor={`meter-install-photo-${quotation.id}`}
                              className="h-8 cursor-pointer inline-flex items-center gap-1.5 rounded-md border border-border bg-background/90 px-3 text-xs font-medium"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              Upload
                            </Label>
                          </div>
                        </div>
                        <Input
                          id={`meter-install-photo-${quotation.id}`}
                          type="file"
                          accept="image/*,.heic,.heif"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null
                            setAdminMeterInstallPhotoByQuotation((prev) => ({
                              ...prev,
                              [quotation.id]: file
                                ? { file, url: URL.createObjectURL(file), name: file.name }
                                : {},
                            }))
                            e.currentTarget.value = ""
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Plant live photo *</Label>
                        <div className="relative overflow-hidden rounded-md border border-dashed border-border/70 aspect-[4/3] bg-muted/20">
                          {plantPreview ? (
                            <img
                              src={plantPreview}
                              alt="Plant live"
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                          ) : null}
                          <div className="absolute inset-x-0 bottom-2 flex justify-center">
                            <Label
                              htmlFor={`plant-live-photo-${quotation.id}`}
                              className="h-8 cursor-pointer inline-flex items-center gap-1.5 rounded-md border border-border bg-background/90 px-3 text-xs font-medium"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              Upload
                            </Label>
                          </div>
                        </div>
                        <Input
                          id={`plant-live-photo-${quotation.id}`}
                          type="file"
                          accept="image/*,.heic,.heif"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null
                            setAdminPlantLivePhotoByQuotation((prev) => ({
                              ...prev,
                              [quotation.id]: file
                                ? { file, url: URL.createObjectURL(file), name: file.name }
                                : {},
                            }))
                            e.currentTarget.value = ""
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-md border border-border/70 bg-muted/15 p-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Assigned person name *</Label>
                        <Input
                          className="h-9 text-sm"
                          value={draft.assignedPersonName}
                          onChange={(e) =>
                            patchAdminMeterInstallDraft(quotation.id, {
                              assignedPersonName: e.target.value,
                            })
                          }
                          placeholder="Person assigned"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Remarks</Label>
                        <Input
                          className="h-9 text-sm"
                          value={draft.remarks}
                          onChange={(e) =>
                            patchAdminMeterInstallDraft(quotation.id, { remarks: e.target.value })
                          }
                          placeholder="Notes / remarks"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex justify-end gap-2 border-t border-border/70 bg-background px-5 py-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAdminMeterInstallModalQuotationId(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={adminMeterInstallSavingId === quotation.id}
                      onClick={() => void saveAdminMeterInstallDetails(quotation)}
                    >
                      {adminMeterInstallSavingId === quotation.id ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </>
              )
            })()}
          </DialogContent>
        </Dialog>

        {/* Bank process details dialog UI temporarily commented out */}
        <Dialog
          open={false && Boolean(adminBankProcessModalQuotationId)}
          onOpenChange={(open) => {
            if (!open) setAdminBankProcessModalQuotationId(null)
          }}
        >
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Bank process details</DialogTitle>
              <DialogDescription>
                Customer, dealer, assigned person, remarks, bank location, and bank documents (multiple upload).
                This is separate from metering Discom details.
              </DialogDescription>
            </DialogHeader>
            {adminBankProcessSelectedQuotation ? (
              (() => {
                const quotation = adminBankProcessSelectedQuotation
                const draft = getAdminBankProcessDraft(quotation)
                const docs = getAdminBankDocuments(quotation.id)
                const qAny = quotation as unknown as Record<string, unknown>
                const nestedDealer = qAny.dealer as Record<string, unknown> | null | undefined
                const fromList = dealers.find((d) => d.id === quotation.dealerId)
                const dealerName =
                  (nestedDealer && typeof nestedDealer === "object"
                    ? formatPersonName(
                        String(nestedDealer.firstName || ""),
                        String(nestedDealer.lastName || ""),
                        String(nestedDealer.username || "").trim() || "Dealer",
                      )
                    : "") ||
                  (fromList
                    ? formatPersonName(fromList.firstName, fromList.lastName, "Dealer")
                    : "Unknown Dealer")
                const dealerMobile =
                  (nestedDealer && typeof nestedDealer === "object"
                    ? String(nestedDealer.mobile || nestedDealer.phone || "").trim()
                    : "") ||
                  fromList?.mobile ||
                  "—"
                const paymentType = getQuotationPaymentTypeRaw(quotation)
                const paymentLabel =
                  paymentType === "mix" ? "Cash + loan" : paymentType === "loan" ? "Loan" : "—"
                const { loan, cash } = readQuotationLoanCashAmounts(quotation)
                const bankLabel = getMeteringBankDetailsLabel(quotation) || "—"
                const customerLocation = formatQuotationCustomerLocation(quotation) || "—"
                const isPendingAlready = isAdminBankProcessDone(quotation)
                return (
                  <div className="space-y-4">
                    <div className="rounded-md border border-border/70 bg-muted/20 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Customer details
                        </p>
                        <p className="font-semibold">
                          {formatPersonName(
                            quotation.customer.firstName,
                            quotation.customer.lastName,
                            "Unknown",
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {quotation.customer.mobile || "No mobile"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{quotation.id}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">{customerLocation}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Dealer details
                        </p>
                        <p className="font-semibold">{dealerName}</p>
                        <p className="text-xs text-muted-foreground">{dealerMobile}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {paymentLabel}
                          {loan != null ? ` · Loan ₹${loan.toLocaleString("en-IN")}` : ""}
                          {paymentType === "mix" && cash != null
                            ? ` · Cash ₹${cash.toLocaleString("en-IN")}`
                            : ""}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate" title={bankLabel}>
                          {bankLabel}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="bank-assigned-person">Assigned person</Label>
                        <Input
                          id="bank-assigned-person"
                          value={draft.assignedPersonName}
                          onChange={(e) =>
                            patchAdminBankProcessDraft(quotation.id, {
                              assignedPersonName: e.target.value,
                            })
                          }
                          placeholder="Assigned person name"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="bank-location">Bank location</Label>
                        <Input
                          id="bank-location"
                          value={draft.bankLocation}
                          onChange={(e) =>
                            patchAdminBankProcessDraft(quotation.id, {
                              bankLocation: e.target.value,
                            })
                          }
                          placeholder="Branch / bank office location"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="bank-remarks">Remarks</Label>
                        <Textarea
                          id="bank-remarks"
                          value={draft.remarks}
                          onChange={(e) =>
                            patchAdminBankProcessDraft(quotation.id, { remarks: e.target.value })
                          }
                          placeholder="Enter remarks"
                          rows={3}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bank-documents">Bank document (multiple upload)</Label>
                        <Input
                          id="bank-documents"
                          type="file"
                          multiple
                          accept="image/*,.pdf,application/pdf"
                          onChange={(e) => {
                            if (e.target.files?.length) {
                              addAdminBankDocuments(quotation.id, e.target.files)
                              e.target.value = ""
                            }
                          }}
                        />
                        {docs.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No bank documents uploaded yet.</p>
                        ) : (
                          <ul className="space-y-1.5 rounded-md border border-border/60 p-2">
                            {docs.map((doc, index) => (
                              <li
                                key={`${doc.name}-${index}`}
                                className="flex items-center justify-between gap-2 text-xs"
                              >
                                <a
                                  href={doc.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="truncate text-primary underline-offset-2 hover:underline"
                                  title={doc.name}
                                >
                                  {doc.name}
                                </a>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 shrink-0"
                                  onClick={() => removeAdminBankDocument(quotation.id, index)}
                                >
                                  Remove
                                </Button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setAdminBankProcessModalQuotationId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={adminBankProcessSavingId === quotation.id}
                        onClick={() => void saveAdminBankProcessDetails(quotation, false)}
                      >
                        {adminBankProcessSavingId === quotation.id ? "Saving..." : "Save"}
                      </Button>
                      {!isPendingAlready ? (
                        <Button
                          type="button"
                          disabled={adminBankProcessSavingId === quotation.id}
                          onClick={() => void saveAdminBankProcessDetails(quotation, true)}
                        >
                          Save &amp; to Pending payment
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )
              })()
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog
          open={adminMeteringModalOpen}
          onOpenChange={(open) => {
            setAdminMeteringModalOpen(open)
            if (!open) setAdminMeteringAdvanceToDiscomAfterSave(false)
          }}
        >
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Metering Details</DialogTitle>
              <DialogDescription>
                Amount, Assigned person, and Meter Installation Pending photos carry through Meter Pending → Discom → Final Step.
              </DialogDescription>
            </DialogHeader>
            {adminMeteringSelectedQuotation ? (
              <div className="space-y-4">
                {(() => {
                  const q = adminMeteringSelectedQuotation
                  const meterSlot = resolveMeterInstallPhotoSlot(q)
                  const plantSlot = resolvePlantLivePhotoSlot(q)
                  const location = formatQuotationCustomerLocation(q) || "—"
                  return (
                    <>
                      <div className="rounded-md border border-border/70 bg-muted/20 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Amount</p>
                          <MeteringAmountCell
                            quotation={q}
                            primaryClassName="font-semibold"
                            secondaryClassName="text-[11px] text-muted-foreground"
                          />
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Customer location
                          </p>
                          <p className="font-medium leading-snug">{location}</p>
                        </div>
                      </div>
                      {(meterSlot.url || plantSlot.url) && (
                        <div className="space-y-2 rounded-md border border-border/70 p-3">
                          <p className="text-xs font-medium text-muted-foreground">
                            From Meter Installation Pending
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {meterSlot.url ? (
                              <div className="space-y-1">
                                <p className="text-[11px] text-muted-foreground">Meter installation photo</p>
                                <div className="relative overflow-hidden rounded-md border aspect-[4/3] bg-muted/20">
                                  <img
                                    src={meterSlot.url}
                                    alt="Meter installation"
                                    className="absolute inset-0 h-full w-full object-cover"
                                  />
                                </div>
                              </div>
                            ) : null}
                            {plantSlot.url ? (
                              <div className="space-y-1">
                                <p className="text-[11px] text-muted-foreground">Plant live photo</p>
                                <div className="relative overflow-hidden rounded-md border aspect-[4/3] bg-muted/20">
                                  <img
                                    src={plantSlot.url}
                                    alt="Plant live"
                                    className="absolute inset-0 h-full w-full object-cover"
                                  />
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Discom Name</Label>
                    <Input
                      value={adminMeteringDraft.discomName}
                      onChange={(e) =>
                        setAdminMeteringDraft((prev) => ({ ...prev, discomName: e.target.value }))
                      }
                      placeholder="Enter discom name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Meter Type</Label>
                    <Select
                      value={adminMeteringDraft.meterType || "__none__"}
                      onValueChange={(value) =>
                        setAdminMeteringDraft((prev) => ({
                          ...prev,
                          meterType: value === "__none__" ? "" : (value as AdminMeteringModalDraft["meterType"]),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select meter type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select meter type</SelectItem>
                        <SelectItem value="solar">Solar</SelectItem>
                        <SelectItem value="net">Net</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {adminMeteringDraft.meterType === "both" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Solar Meter No</Label>
                      <Input
                        value={adminMeteringDraft.solarMeterNo}
                        onChange={(e) =>
                          setAdminMeteringDraft((prev) => ({ ...prev, solarMeterNo: e.target.value }))
                        }
                        placeholder="Enter solar meter number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Net Meter No</Label>
                      <Input
                        value={adminMeteringDraft.netMeterNo}
                        onChange={(e) =>
                          setAdminMeteringDraft((prev) => ({ ...prev, netMeterNo: e.target.value }))
                        }
                        placeholder="Enter net meter number"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Meter No</Label>
                    <Input
                      value={adminMeteringDraft.meterNo}
                      onChange={(e) =>
                        setAdminMeteringDraft((prev) => ({ ...prev, meterNo: e.target.value }))
                      }
                      placeholder="Enter meter number"
                    />
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Assigned person</Label>
                    <Input
                      value={adminMeteringDraft.authorizedRepresentative}
                      onChange={(e) =>
                        setAdminMeteringDraft((prev) => ({
                          ...prev,
                          authorizedRepresentative: e.target.value,
                        }))
                      }
                      placeholder="Assigned person name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Discom location (optional)</Label>
                    <Input
                      value={adminMeteringDraft.discomLocation}
                      onChange={(e) =>
                        setAdminMeteringDraft((prev) => ({
                          ...prev,
                          discomLocation: e.target.value,
                        }))
                      }
                      placeholder="Office / site location"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Remarks</Label>
                    <Textarea
                      value={adminMeteringDraft.remarks}
                      onChange={(e) =>
                        setAdminMeteringDraft((prev) => ({ ...prev, remarks: e.target.value }))
                      }
                      placeholder="Enter remarks"
                      rows={3}
                      className="resize-y min-h-[72px]"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Meter Document (image/pdf)</Label>
                  <Input
                    type="file"
                    accept="image/*,.heic,.heif,.pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null
                      if (!adminMeteringQuotationId) return
                      setAdminMeteringDocByQuotation((prev) => ({ ...prev, [adminMeteringQuotationId]: file }))
                    }}
                  />
                  {(() => {
                    const q = adminMeteringSelectedQuotation as any
                    const fromRow = readQuotationMeterDocument(q)
                    const savedUrl =
                      fromRow.url ||
                      toMeterDocumentPublicViewUrl(
                        q?.meterDocumentPublicUrl ||
                          q?.meter_document_public_url ||
                          q?.meterDocumentUrl ||
                          q?.meter_document_url,
                      )
                    const savedName = fromRow.name || q?.meterDocumentName || q?.meter_document_name
                    const localFile = adminMeteringQuotationId
                      ? adminMeteringDocByQuotation[adminMeteringQuotationId]
                      : null
                    if (!savedUrl && !localFile) {
                      return (
                        <p className="text-[11px] text-muted-foreground">No meter document on file yet.</p>
                      )
                    }
                    return (
                      <div className="space-y-1">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Uploaded meter document
                        </p>
                        <StoredMediaPreview
                          rawUrl={savedUrl}
                          localFile={localFile}
                          quotationId={adminMeteringQuotationId || undefined}
                          fileName={localFile?.name || savedName}
                        />
                      </div>
                    )
                  })()}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAdminMeteringAdvanceToDiscomAfterSave(false)
                      setAdminMeteringModalOpen(false)
                    }}
                    disabled={adminMeteringSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => void saveAdminMeteringDetails({ moveToDiscom: false })}
                    disabled={adminMeteringSaving}
                  >
                    {adminMeteringSaving ? "Saving..." : "Save Details"}
                  </Button>
                  {adminMeteringAdvanceToDiscomAfterSave ||
                  (adminMeteringQuotationId &&
                    getAdminMeteringStage(
                      quotations.find((q) => q.id === adminMeteringQuotationId) ||
                        ({ id: adminMeteringQuotationId } as Quotation),
                    ) === "processing") ? (
                    <Button
                      onClick={() => void saveAdminMeteringDetails({ moveToDiscom: true })}
                      disabled={adminMeteringSaving}
                    >
                      {adminMeteringSaving ? "Moving..." : "Save & To Discom"}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog open={adminMcoDocsModalOpen} onOpenChange={setAdminMcoDocsModalOpen}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>MCO Completion Documents</DialogTitle>
              <DialogDescription>
                Upload Work Complete Report, Meter Installed Photo, and Complete DCR Report.
              </DialogDescription>
            </DialogHeader>
            {adminMcoDocsQuotationId ? (
              <div className="space-y-3">
                {[
                  { key: "work", label: "Work Complete Report", accept: "image/*" },
                  { key: "meter", label: "Meter Installed Photo", accept: "image/*" },
                  { key: "dcr", label: "Complete DCR Report", accept: "image/*" },
                ].map((item) => {
                  const row = sortedQuotations.find((q) => q.id === adminMcoDocsQuotationId) as any
                  const currentName =
                    item.key === "work"
                      ? adminWorkCompleteReportByQuotation[adminMcoDocsQuotationId]?.name ||
                        row?.workCompleteReportImageName ||
                        row?.work_complete_report_image_name
                      : item.key === "meter"
                        ? adminMeterInstalledPhotoByQuotation[adminMcoDocsQuotationId]?.name ||
                          row?.meterInstalledPhotoName ||
                          row?.meter_installed_photo_name
                        : adminCompleteDcrReportByQuotation[adminMcoDocsQuotationId]?.name ||
                          row?.completeDcrReportImageName ||
                          row?.complete_dcr_report_image_name
                  return (
                    <div className="space-y-2" key={item.key}>
                      <Label>{item.label}</Label>
                      <Input
                        type="file"
                        accept={item.accept}
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null
                          if (!adminMcoDocsQuotationId) return
                          if (item.key === "work") {
                            setAdminWorkCompleteReportByQuotation((prev) => ({ ...prev, [adminMcoDocsQuotationId]: file }))
                          } else if (item.key === "meter") {
                            setAdminMeterInstalledPhotoByQuotation((prev) => ({ ...prev, [adminMcoDocsQuotationId]: file }))
                          } else {
                            setAdminCompleteDcrReportByQuotation((prev) => ({ ...prev, [adminMcoDocsQuotationId]: file }))
                          }
                        }}
                      />
                      <p className="text-[11px] text-muted-foreground truncate">{currentName || "No file selected"}</p>
                    </div>
                  )
                })}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setAdminMcoDocsModalOpen(false)} disabled={adminMcoDocsSaving}>
                    Cancel
                  </Button>
                  <Button onClick={() => void saveAdminMcoDocuments()} disabled={adminMcoDocsSaving || !adminMcoDocsQuotationId}>
                    {adminMcoDocsSaving ? "Saving..." : "Save Documents"}
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog open={!!statusHistoryQuotation} onOpenChange={(open) => !open && setStatusHistoryQuotation(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Status timeline</DialogTitle>
              <DialogDescription>
                {statusHistoryQuotation ? (
                  <>
                    Quotation <span className="font-mono">{statusHistoryQuotation.id}</span> — each status change with
                    date and time (from server when available).
                  </>
                ) : null}
              </DialogDescription>
            </DialogHeader>
            {statusHistoryQuotation ? (
              <div className="space-y-3 text-sm">
                <div className="rounded-md border border-border/70 bg-muted/20 p-3 space-y-1 text-xs">
                  <p>
                    <span className="font-medium text-foreground">Created: </span>
                    {statusHistoryQuotation.createdAt
                      ? new Date(statusHistoryQuotation.createdAt).toLocaleString()
                      : "—"}
                  </p>
                  {statusHistoryQuotation.fileLoginAt ? (
                    <p>
                      <span className="font-medium text-foreground">File login: </span>
                      {new Date(statusHistoryQuotation.fileLoginAt).toLocaleString()}
                    </p>
                  ) : null}
                  {statusHistoryQuotation.statusApprovedAt ? (
                    <p>
                      <span className="font-medium text-foreground">Last approved: </span>
                      {new Date(statusHistoryQuotation.statusApprovedAt).toLocaleString()}
                    </p>
                  ) : null}
                </div>
                {statusHistoryQuotation.statusHistory && statusHistoryQuotation.statusHistory.length > 0 ? (
                  <ul className="space-y-2">
                    {statusHistoryQuotation.statusHistory.map((entry, idx) => (
                      <li
                        key={`${entry.at}-${entry.status}-${idx}`}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 rounded-md border border-border/60 px-3 py-2"
                      >
                        <Badge variant="outline" className="w-fit capitalize">
                          {entry.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {entry.at ? new Date(entry.at).toLocaleString() : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No status history from the server yet. After backend stores transitions on each status change,
                    they will appear here. Current status:{" "}
                    <span className="font-medium capitalize">{statusHistoryQuotation.status || "pending"}</span>.
                  </p>
                )}
              </div>
            ) : null}
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setStatusHistoryQuotation(null)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={quotationVersionHistoryOpen}
          onOpenChange={(open) => {
            setQuotationVersionHistoryOpen(open)
            if (!open) setQuotationVersionHistoryGroup(null)
          }}
        >
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Quotation history</DialogTitle>
              <DialogDescription>
                {quotationVersionHistoryGroup
                  ? `${formatPersonName(
                      quotationVersionHistoryGroup.current.customer?.firstName,
                      quotationVersionHistoryGroup.current.customer?.lastName,
                      "Customer",
                    )} — restore an older version as current for Admin.`
                  : "Older quotations for this customer."}
              </DialogDescription>
            </DialogHeader>
            {quotationVersionHistoryGroup ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-emerald-800">Current</p>
                      <p className="text-sm font-mono">{quotationVersionHistoryGroup.current.id}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        ₹
                        {Math.abs(
                          (quotationVersionHistoryGroup.current as any).pricing?.subtotal ??
                            quotationVersionHistoryGroup.current.subtotal ??
                            quotationVersionHistoryGroup.current.totalAmount ??
                            0,
                        ).toLocaleString()}{" "}
                        · {new Date(quotationVersionHistoryGroup.current.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedQuotation(quotationVersionHistoryGroup.current)
                        setDialogOpen(true)
                      }}
                      title="View details"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {quotationVersionHistoryGroup.history.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No older versions.</p>
                ) : (
                  quotationVersionHistoryGroup.history.map((older) => (
                    <div key={older.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">Previous</p>
                          <p className="text-sm font-mono">{older.id}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            ₹
                            {Math.abs(
                              (older as any).pricing?.subtotal ?? older.subtotal ?? older.totalAmount ?? 0,
                            ).toLocaleString()}{" "}
                            · {new Date(older.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedQuotation(older)
                              setDialogOpen(true)
                            }}
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            disabled={restoringQuotationId === older.id}
                            onClick={() => void restoreAdminQuotationAsCurrent(older)}
                            title="Restore as current"
                          >
                            <RotateCcw
                              className={`w-3.5 h-3.5 ${
                                restoringQuotationId === older.id ? "animate-spin" : ""
                              }`}
                            />
                            Restore
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!installPhotosViewer}
          onOpenChange={(open) => {
            if (!open) {
              setInstallPhotosViewer(null)
              setInstallPhotoUrls([])
              setInstallPhotosLoading(false)
            }
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Uploaded installation photos</DialogTitle>
              <DialogDescription>
                {installPhotosViewer
                  ? `${formatPersonName(
                      installPhotosViewer.customer.firstName,
                      installPhotosViewer.customer.lastName,
                      "Customer",
                    )} · ${installPhotosViewer.id}`
                  : null}
              </DialogDescription>
            </DialogHeader>
            {installPhotosLoading && installPhotoUrls.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading photos…
              </div>
            ) : installPhotoUrls.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No photos on this quotation yet. Use Edit to add images.
              </p>
            ) : (
              <div className="flex max-h-[70vh] flex-wrap gap-3 overflow-y-auto">
                {installPhotoUrls.map((url, idx) => (
                  <InstallationPublicPhoto
                    key={`${installPhotosViewer?.id || "photo"}-${idx}`}
                    rawUrl={url}
                    quotationId={installPhotosViewer?.id}
                  />
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={!!installRevertTarget} onOpenChange={(open) => !open && setInstallRevertTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Revert to pending installation?</DialogTitle>
              <DialogDescription>
                {installRevertTarget ? (
                  <>
                    <span className="font-medium text-foreground">{installRevertTarget.label}</span> will move back to{" "}
                    <strong>Pending Installation</strong>. Use this if photos need to be re-done or the job was approved by mistake.
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

        <ExcelColumnPickerDialog
          key={`quotation-excel-${operationalTab}`}
          open={quotationExcelColumnsOpen}
          onOpenChange={setQuotationExcelColumnsOpen}
          title={
            operationalTab === "metering"
              ? "Select Metering Excel columns"
              : operationalTab === "confirmation"
                ? "Select Final Confirmation Excel columns"
                : operationalTab === "installation"
                  ? "Select Installation Excel columns"
                  : "Select Excel columns"
          }
          description="Check only the fields you want to download. Then click Download."
          columns={quotationExcelColumns}
          initialSelectedIds={quotationExcelRememberedIds}
          rowCount={activeQuotationList.length}
          confirmLabel="Download Excel"
          onConfirm={downloadFilteredQuotationsCsv}
        />

        <ExcelColumnPickerDialog
          open={visitorExcelColumnsOpen}
          onOpenChange={setVisitorExcelColumnsOpen}
          title="Select Excel columns"
          description="Check only the fields you want to download. Then click Download."
          columns={visitorExcelColumns}
          initialSelectedIds={visitorExcelRememberedIds}
          rowCount={filteredVisitorReportRows.length}
          confirmLabel="Download Excel"
          onConfirm={downloadFilteredVisitorReportsCsv}
        />
      </main>
    </div>
  )
}

