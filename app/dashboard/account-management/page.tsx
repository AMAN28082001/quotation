"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  LogOut,
  User,
  Wallet,
  CheckCircle2,
  Clock,
  AlertCircle,
  Download,
  FileText,
  Search,
  Eye,
  IndianRupee,
  Calendar as CalendarIcon,
  ChevronDown,
  Send,
  RotateCcw,
  Users,
  Loader2,
  Filter,
  Upload,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { SolarLogo } from "@/components/solar-logo"
import { AccessSwitchBar } from "@/components/access-switch-bar"
import { canOpenSection, getAccessOptions, getPostLoginPath } from "@/lib/user-access"
import {
  filterQuotationsByWorkflowPermission,
  isWorkflowModuleReadOnly,
  shouldLoadAllAccountsQuotations,
} from "@/lib/module-field-permissions"
import { CityMultiSelectFilter } from "@/components/city-multi-select-filter"
import { matchesCityFilter } from "@/lib/service-cities"
import { useToast } from "@/hooks/use-toast"
import { useIncrementalList } from "@/hooks/use-incremental-list"
import { IncrementalListSentinel } from "@/components/incremental-list-sentinel"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { format } from "date-fns"
import type { DateRange } from "react-day-picker"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { Quotation } from "@/lib/quotation-context"
import { QuotationDetailsDialog } from "@/components/quotation-details-dialog"
import { api, ApiError, retrieveQuotationFromInstallation } from "@/lib/api"
import { calculateSystemSize } from "@/lib/pricing-tables"
import { formatPersonName } from "@/lib/name-display"
import {
  getCurrentQuotationIds,
  groupQuotationsByCustomerCurrentFirst,
  keepCurrentQuotationsOnly,
} from "@/lib/quotation-current"
import { confirmSave } from "@/lib/confirm-save"
import {
  formatJourneyStageStatusLabel,
  getJourneyFileStatusStages,
  getJourneyHoldInfo,
  getJourneyStageProgress,
  journeyStageStatusBadgeClass,
  paymentMatchesFileStatusFilter,
  type FileStatusFilter,
} from "@/lib/customer-journey"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  INSTALLER_RELEASE_MAP_KEY,
  extractQuotationListFromApiResponse,
  flattenWrappedQuotationRow,
  isQuotationSentToInstaller,
  getRetrieveFromInstallationState,
  clearInstallerReleaseInLocalMap,
  mergeInstallationMediaSources,
  mergeInstallerReleaseOntoQuotation,
  readInstallerReleaseMap,
} from "@/lib/operational-install-queue"
import { extractPiUploadUrls } from "@/lib/installation-public-images"
import { toPublicOpenHref } from "@/lib/media-url"


// Payment Phase Interface
interface PaymentPhase {
  phaseNumber: number
  phaseName: string
  amount: number
  dueDate?: string
  status: "pending" | "partial" | "completed"
  paidAmount: number
  paymentDate?: string
  paymentMode?: string
  transactionId?: string
  note?: string
}

interface SubsidyChequeRecord {
  id: string
  details: string
  amount: number
  status: "pending" | "cleared"
  clearedAt?: string
}

interface CustomerPayment {
  quotationId: string
  customerName: string
  customerMobile: string
  dealerName?: string
  dealerMobile?: string
  dealerId?: string
  /** Payment cap: quotation subtotal / set price (not installment sum). */
  subtotal: number
  /** Original subtotal before settlement discount (for list display). */
  originalSubtotal: number
  /** Discount amount in INR (includes final settlement). */
  discountAmount: number
  /** Set when remaining balance was written off via final settlement. */
  finalSettlementApplied?: boolean
  /** INR written off by final settlement (shown as `d` on Paid hover). */
  finalSettlementDiscount?: number
  totalAmount: number
  finalAmount: number
  /** When API sends remaining or remainingAmount, prefer for list/export display. */
  remainingFromApi?: number
  paymentType?: string
  paymentMode?: string
  bankName?: string
  bankIfsc?: string
  loanAmount?: number
  cashAmount?: number
  /** Manual site cost (INR) — profit = subtotal − siteCost. */
  siteCost?: number
  paymentStatus?: "pending" | "completed" | "partial"
  phases: PaymentPhase[]
  quotation: Quotation
  statusApprovedAt?: string
  fileLoginAt?: string
  fileLoginStatus?: string
  /** Subsidy cheques (cash / cash + loan); cleared amounts are applied into installment paidAmounts. */
  subsidyCheques: SubsidyChequeRecord[]
}

const PAYMENT_PLANS_KEY = "quotationPaymentPlans"
const SUBSIDY_CHEQUES_KEY = "quotationSubsidyCheques"
/** Durable Cost of site until GET approved list echoes `site_cost` from DB. */
const SITE_COST_KEY = "quotationSiteCosts"

const PAYMENT_MODE_SELECT_VALUES = [
  "cash",
  "upi",
  "loan",
  "netbanking",
  "bank_transfer",
  "cheque",
  "card",
] as const

type PaymentModeSelectValue = (typeof PAYMENT_MODE_SELECT_VALUES)[number]

const CASH_SIDE_PAYMENT_MODE_OPTIONS: { value: PaymentModeSelectValue; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "cheque", label: "Cheque" },
]

const LOAN_SIDE_PAYMENT_MODE_OPTIONS: { value: PaymentModeSelectValue; label: string }[] = [
  { value: "loan", label: "Loan" },
]

/** Map API / human labels to Select values so Radix Select matches and PATCH passes backend validation. */
function normalizePaymentMode(raw?: string | null): PaymentModeSelectValue | undefined {
  if (raw == null) return undefined
  const s = String(raw).trim()
  if (!s) return undefined
  const key = s.toLowerCase().replace(/[\s-]+/g, "_")
  const aliases: Record<string, PaymentModeSelectValue> = {
    cash: "cash",
    upi: "upi",
    loan: "loan",
    netbanking: "netbanking",
    net_banking: "netbanking",
    bank_transfer: "bank_transfer",
    banktransfer: "bank_transfer",
    neft: "bank_transfer",
    rtgs: "bank_transfer",
    imps: "bank_transfer",
    cheque: "cheque",
    check: "cheque",
    card: "card",
    debit_card: "card",
    credit_card: "card",
  }
  if (aliases[key]) return aliases[key]
  const simple = s.toLowerCase()
  if ((PAYMENT_MODE_SELECT_VALUES as readonly string[]).includes(simple)) return simple as PaymentModeSelectValue
  return undefined
}

function pickFirstFiniteNumber(...vals: unknown[]): number {
  for (const v of vals) {
    if (v === undefined || v === null || v === "") continue
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return 0
}

function optionalFiniteNumber(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function pickApiRemainingFromPayload(q: Record<string, unknown>): number | undefined {
  return optionalFiniteNumber(q.remaining) ?? optionalFiniteNumber(q.remainingAmount)
}

function getTotalPaidPhases(phases: PaymentPhase[]): number {
  return phases.reduce((sum, phase) => sum + (Number(phase.paidAmount) || 0), 0)
}

function getComputedRemaining(payment: CustomerPayment): number {
  return Math.max(getPaymentEffectiveCap(payment) - getTotalPaidPhases(payment.phases), 0)
}

function getQuotationDiscountAmount(q: Quotation): number {
  const qx = q as Quotation & Record<string, unknown>
  const pricing = qx.pricing as Record<string, unknown> | undefined
  const fromPricing = optionalFiniteNumber(
    pricing?.discountAmount ?? qx.discountAmount ?? qx.discount_amount,
  )
  if (fromPricing != null && fromPricing > 0) return fromPricing
  const discount = Number(q.discount) || 0
  if (discount > 100) return discount
  if (discount > 0 && discount <= 100) {
    const subtotal = pickFirstFiniteNumber(q.subtotal, q.totalAmount, q.finalAmount)
    return Math.round(subtotal * (discount / 100))
  }
  return 0
}

/** Amount after subsidy — used for pricing PATCH validation (finalAmount ≤ this). */
function getQuotationAmountAfterSubsidy(q: Quotation): number {
  const qx = q as Quotation & Record<string, unknown>
  const pricing = (qx.pricing || {}) as Record<string, unknown>
  const products = (qx.products || {}) as unknown as Record<string, unknown>
  const fromPricing = optionalFiniteNumber(
    pricing.amountAfterSubsidy ?? qx.amountAfterSubsidy ?? qx.amount_after_subsidy,
  )
  if (fromPricing != null) return fromPricing

  const subtotal = pickFirstFiniteNumber(pricing.subtotal, qx.subtotal, qx.totalAmount, qx.finalAmount)
  const central = pickFirstFiniteNumber(
    pricing.centralSubsidy,
    products.centralSubsidy,
    qx.centralSubsidy,
    0,
  )
  const state = pickFirstFiniteNumber(pricing.stateSubsidy, products.stateSubsidy, qx.stateSubsidy, 0)
  return Math.max(0, subtotal - central - state)
}

function getPaymentOriginalSubtotal(payment: CustomerPayment): number {
  return payment.originalSubtotal ?? payment.subtotal
}

function getPaymentDiscountAmount(payment: CustomerPayment): number {
  return Math.max(0, Number(payment.discountAmount) || 0)
}

/** Settlement-only discount `d` (prefer explicit backend settlement amount). */
function getSettlementDiscountAmount(payment: CustomerPayment): number {
  const localTracked = Number(payment.finalSettlementDiscount) || 0
  if (localTracked > 0) return Math.max(0, localTracked)
  const qx = payment.quotation as Quotation & Record<string, unknown>
  const pricing = (qx.pricing || {}) as Record<string, unknown>
  const fromApi =
    Number(
      qx.finalSettlementAmount ??
        qx.final_settlement_amount ??
        pricing.finalSettlementAmount ??
        pricing.final_settlement_amount ??
        0,
    ) || 0
  if (fromApi > 0) return Math.max(0, fromApi)
  if (isFinalSettlementApplied(payment)) return getPaymentDiscountAmount(payment)
  return 0
}

function getPaymentEffectiveCap(payment: CustomerPayment): number {
  return Math.max(0, getPaymentOriginalSubtotal(payment) - getPaymentDiscountAmount(payment))
}

function isLoanSidePaymentMode(mode?: string | null): boolean {
  return normalizePaymentMode(mode) === "loan"
}

/** Loan bucket cap for Cash + loan (falls back to subtotal − cashAmount when loanAmount missing). */
function getMixLoanCap(payment: CustomerPayment): number {
  const cap = getPaymentEffectiveCap(payment)
  const loan = Math.max(0, Math.round(Number(payment.loanAmount) || 0))
  if (loan > 0) return Math.min(loan, cap)
  const cash = Math.max(0, Math.round(Number(payment.cashAmount) || 0))
  if (cash > 0 && cash < cap) return Math.max(0, cap - cash)
  return 0
}

/** Cash bucket cap for Cash + loan (falls back to subtotal − loanAmount when cashAmount missing). */
function getMixCashCap(payment: CustomerPayment): number {
  const cap = getPaymentEffectiveCap(payment)
  const cash = Math.max(0, Math.round(Number(payment.cashAmount) || 0))
  if (cash > 0) return Math.min(cash, cap)
  const loan = Math.max(0, Math.round(Number(payment.loanAmount) || 0))
  if (loan > 0 && loan < cap) return Math.max(0, cap - loan)
  // Both missing — do not treat full subtotal as "cash" (that made mix look like Cash ₹total).
  return 0
}

function getTotalPaidForSide(phases: PaymentPhase[], side: "loan" | "cash"): number {
  return phases.reduce((sum, phase) => {
    const paid = Number(phase.paidAmount) || 0
    if (paid <= 0) return sum
    const isLoan = isLoanSidePaymentMode(phase.paymentMode)
    if (side === "loan") return isLoan ? sum + paid : sum
    return !isLoan ? sum + paid : sum
  }, 0)
}

function getRemainingForSide(payment: CustomerPayment, side: "loan" | "cash"): number {
  const paid = getTotalPaidForSide(payment.phases, side)
  const bucket = side === "loan" ? getMixLoanCap(payment) : getMixCashCap(payment)
  return Math.max(0, bucket - paid)
}

function paymentTypeOf(payment: CustomerPayment): string {
  return String(payment.paymentType || payment.paymentMode || "").toLowerCase()
}

/** Remaining on the relevant bucket before this installment (mix uses loan vs cash by payment mode). */
function getRemainingBeforeInstallment(payment: CustomerPayment, phase: PaymentPhase): number {
  if (paymentTypeOf(payment) === "mix") {
    const side: "loan" | "cash" = isLoanSidePaymentMode(phase.paymentMode) ? "loan" : "cash"
    const sideCap = side === "loan" ? getMixLoanCap(payment) : getMixCashCap(payment)
    const paidBefore = payment.phases
      .filter((p) => {
        if (p.phaseNumber >= phase.phaseNumber) return false
        const loan = isLoanSidePaymentMode(p.paymentMode)
        return side === "loan" ? loan : !loan
      })
      .reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0)
    return Math.max(sideCap - paidBefore, 0)
  }
  const paidBefore = payment.phases
    .filter((p) => p.phaseNumber < phase.phaseNumber)
    .reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0)
  return Math.max(getPaymentEffectiveCap(payment) - paidBefore, 0)
}

function defaultInstallmentPaymentMode(payment: CustomerPayment): PaymentModeSelectValue {
  const t = paymentTypeOf(payment)
  if (t === "loan") return "loan"
  if (t === "mix") {
    // Prefer the side that still has remaining balance
    if (getRemainingForSide(payment, "loan") > 0 && getRemainingForSide(payment, "cash") <= 0) return "loan"
    if (getRemainingForSide(payment, "cash") > 0) return "cash"
    return "loan"
  }
  return "cash"
}

function paymentModeOptionsForSide(
  paymentType: string,
  side?: "loan" | "cash",
): { value: PaymentModeSelectValue; label: string }[] {
  const t = String(paymentType || "").toLowerCase()
  if (t === "loan" || side === "loan") return LOAN_SIDE_PAYMENT_MODE_OPTIONS
  if (t === "cash" || side === "cash") return CASH_SIDE_PAYMENT_MODE_OPTIONS
  // mix without explicit side — show both groups
  return [...LOAN_SIDE_PAYMENT_MODE_OPTIONS, ...CASH_SIDE_PAYMENT_MODE_OPTIONS]
}

function appendInstallmentWithMode(
  phases: PaymentPhase[],
  subtotal: number,
  paymentMode: PaymentModeSelectValue,
): PaymentPhase[] {
  const sorted = [...phases].sort((a, b) => a.phaseNumber - b.phaseNumber)
  const next = redistributeInstallmentAmounts(subtotal, sorted.length + 1, sorted)
  if (next.length === 0) return next
  const last = next[next.length - 1]
  next[next.length - 1] = { ...last, paymentMode }
  return next
}

/** One installment for the full payable cap (subtotal − discount). */
function buildFullPaymentSingleInstallment(payment: CustomerPayment, markPaid = false): PaymentPhase[] {
  const cap = Math.round(getPaymentEffectiveCap(payment))
  const mode = defaultInstallmentPaymentMode(payment)
  const paid = markPaid ? cap : 0
  const status: PaymentPhase["status"] =
    markPaid ? "completed" : paid > 0 ? "partial" : "pending"
  return [
    {
      phaseNumber: 1,
      phaseName: "Installment 1",
      amount: cap,
      paidAmount: paid,
      status,
      paymentDate: markPaid ? new Date().toISOString() : undefined,
      paymentMode: mode,
    },
  ]
}

/** Persisted settlement flag from the backend (survives refresh; keeps button hidden). */
function getQuotationFinalSettlementApplied(q: Quotation): boolean {
  const qx = q as Quotation & Record<string, unknown>
  const pricing = (qx.pricing || {}) as Record<string, unknown>
  return (
    qx.finalSettlementApplied === true ||
    qx.final_settlement_applied === true ||
    pricing.finalSettlementApplied === true ||
    (Number(qx.finalSettlementAmount ?? qx.final_settlement_amount ?? 0) || 0) > 0
  )
}

function isFinalSettlementApplied(payment: CustomerPayment): boolean {
  // Persisted flag (from DB) or local optimistic flag is authoritative.
  if (payment.finalSettlementApplied) return true
  const original = getPaymentOriginalSubtotal(payment)
  const discount = getPaymentDiscountAmount(payment)
  const paid = getTotalPaidPhases(payment.phases)
  const unpaidGap = Math.max(0, original - paid)
  // Settlement also counts when discount actually covers the unpaid gap.
  if (discount > 0 && unpaidGap <= discount + 0.5) return true
  return false
}

/**
 * Remaining = Subtotal (net of settlement discount) − Paid.
 * Always use AM installment/subtotal math — never prefer API remaining alone
 * (API remaining is often after-subsidy and then Paid ₹0 shows Remaining ≠ Subtotal).
 */
function getDisplayRemaining(payment: CustomerPayment): number {
  if (isFinalSettlementApplied(payment)) return 0
  const phasePaid = getTotalPaidPhases(payment.phases)
  return Math.max(0, getPaymentEffectiveCap(payment) - phasePaid)
}

/** Derive payment status from amounts so UI matches Remaining (not stale API "completed"). */
function getEffectivePaymentStatus(
  payment: CustomerPayment,
): NonNullable<CustomerPayment["paymentStatus"]> {
  const paid = getTotalPaidPhases(payment.phases)
  const remaining = getDisplayRemaining(payment)
  if (remaining <= 0 && (paid > 0 || getPaymentDiscountAmount(payment) > 0 || isFinalSettlementApplied(payment))) {
    return "completed"
  }
  if (paid > 0) return "partial"
  return "pending"
}

const PAYMENT_ACTIVITY_WINDOW_DAYS = 30

type PaymentSectionTab = "active" | "overdue" | "completed"

function parseOptionalPaymentDate(value?: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function getLastPaymentReceivedDate(payment: CustomerPayment): Date | null {
  let latest: Date | null = null
  for (const phase of payment.phases) {
    if ((phase.paidAmount || 0) <= 0) continue
    const d = parseOptionalPaymentDate(phase.paymentDate)
    if (!d) continue
    if (!latest || d > latest) latest = d
  }
  return latest
}

function getUnpaidPhaseDueDates(payment: CustomerPayment): Date[] {
  const dates: Date[] = []
  for (const phase of payment.phases) {
    const unpaid = Math.max(0, Math.round(phase.amount || 0) - Math.round(phase.paidAmount || 0))
    if (unpaid <= 0) continue
    const due = parseOptionalPaymentDate(phase.dueDate)
    if (due) dates.push(due)
  }
  return dates
}

/** Pending/partial with due, last payment, or approve activity in the last 30 days. */
function matchesActivePaymentActivityWindow(payment: CustomerPayment, now = new Date()): boolean {
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - PAYMENT_ACTIVITY_WINDOW_DAYS)
  const cutoffMs = cutoff.getTime()

  const lastPayment = getLastPaymentReceivedDate(payment)
  if (lastPayment && lastPayment.getTime() >= cutoffMs) return true

  for (const due of getUnpaidPhaseDueDates(payment)) {
    if (due.getTime() >= cutoffMs) return true
  }

  const approved = parseOptionalPaymentDate(payment.statusApprovedAt)
  if (approved && approved.getTime() >= cutoffMs && getTotalPaidPhases(payment.phases) <= 0) {
    return true
  }

  return false
}

/** Pending/partial with remaining balance and no activity in the last 30 days. */
function matchesOverdueOutstandingPayment(payment: CustomerPayment): boolean {
  const status = getEffectivePaymentStatus(payment)
  if (status !== "pending" && status !== "partial") return false
  if (getDisplayRemaining(payment) <= 0) return false
  return !matchesActivePaymentActivityWindow(payment)
}

function splitPaymentsBySection(payments: CustomerPayment[]): {
  activePayments: CustomerPayment[]
  overduePayments: CustomerPayment[]
  completedPayments: CustomerPayment[]
} {
  const activePayments: CustomerPayment[] = []
  const overduePayments: CustomerPayment[] = []
  const completedPayments: CustomerPayment[] = []
  for (const payment of payments) {
    const status = getEffectivePaymentStatus(payment)
    if (status === "completed") {
      completedPayments.push(payment)
      continue
    }
    if (status === "pending" || status === "partial") {
      activePayments.push(payment)
      if (matchesOverdueOutstandingPayment(payment)) overduePayments.push(payment)
    }
  }
  return { activePayments, overduePayments, completedPayments }
}

function formatInstallmentShortLabel(phase: PaymentPhase): string {
  const raw = String(phase.phaseName || "").trim()
  const matchedNumber = raw.match(/(\d+)/)
  if (matchedNumber) return `I${matchedNumber[1]}`
  return `I${phase.phaseNumber}`
}

type PaymentInstallmentFilter = "all" | "1" | "2" | "3" | "4" | "5"

/** Yes = already sent (badge). No = still shows Send to Installer button. */
type SendToInstallationFilter = "all" | "yes" | "no"

type PaymentTypeFilterValue = "loan" | "cash" | "mix" | "unknown"

const PAYMENT_TYPE_FILTER_OPTIONS: { value: PaymentTypeFilterValue; label: string }[] = [
  { value: "loan", label: "Loan" },
  { value: "cash", label: "Cash" },
  { value: "mix", label: "Cash + loan" },
  { value: "unknown", label: "Not Set" },
]

/** Keep dropdowns inside Filters dialog — avoids portal z-index / transform mis-positioning. */
const PAYMENT_FILTER_SELECT_CONTENT_PROPS = {
  disablePortal: true,
  position: "popper" as const,
  sideOffset: 4,
  className: "max-h-60",
}

function getPaymentTypeFilterTriggerLabel(selected: PaymentTypeFilterValue[]): string {
  if (selected.length === 0 || selected.length === PAYMENT_TYPE_FILTER_OPTIONS.length) {
    return "All Payment Types"
  }
  if (selected.length === 1) {
    return PAYMENT_TYPE_FILTER_OPTIONS.find((o) => o.value === selected[0])?.label ?? "1 type"
  }
  const labels = selected
    .map((v) => PAYMENT_TYPE_FILTER_OPTIONS.find((o) => o.value === v)?.label)
    .filter(Boolean)
  return labels.join(", ")
}

function paymentMatchesInstallmentFilter(
  payment: CustomerPayment,
  filter: PaymentInstallmentFilter,
): boolean {
  if (filter === "all") return true
  const expectedInstallmentCount = Number(filter)
  if (!Number.isFinite(expectedInstallmentCount) || expectedInstallmentCount < 1) return true
  return payment.phases.length === expectedInstallmentCount
}

function getStoredSubsidyChequesMap(): Record<string, SubsidyChequeRecord[]> {
  try {
    const raw = localStorage.getItem(SUBSIDY_CHEQUES_KEY)
    if (!raw) return {}
    const p = JSON.parse(raw)
    return p && typeof p === "object" ? p : {}
  } catch {
    return {}
  }
}

function saveSubsidyChequesMap(map: Record<string, SubsidyChequeRecord[]>) {
  localStorage.setItem(SUBSIDY_CHEQUES_KEY, JSON.stringify(map))
}

function getStoredSiteCostMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SITE_COST_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return {}
    const out: Record<string, number> = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const n = Math.max(0, Math.round(Number(value) || 0))
      if (id && n > 0) out[id] = n
    }
    return out
  } catch {
    return {}
  }
}

function persistSiteCostForQuotation(quotationId: string, siteCost: number) {
  if (!quotationId) return
  const map = getStoredSiteCostMap()
  const amount = Math.max(0, Math.round(Number(siteCost) || 0))
  if (amount > 0) map[quotationId] = amount
  else delete map[quotationId]
  localStorage.setItem(SITE_COST_KEY, JSON.stringify(map))
}

/** Read site cost from flat / nested API quotation payloads. */
function pickSiteCostFromQuotation(q: Record<string, unknown>): number {
  const pricing = (q.pricing || {}) as Record<string, unknown>
  const paymentDetails = (q.paymentDetails || q.payment_details || {}) as Record<string, unknown>
  return Math.max(
    0,
    Math.round(
      pickFirstFiniteNumber(
        q.siteCost,
        q.site_cost,
        q.costOfSite,
        q.cost_of_site,
        pricing.siteCost,
        pricing.site_cost,
        paymentDetails.siteCost,
        paymentDetails.site_cost,
      ),
    ),
  )
}

function persistSubsidyChequesForQuotation(quotationId: string, cheques: SubsidyChequeRecord[]) {
  const map = getStoredSubsidyChequesMap()
  map[quotationId] = cheques
  saveSubsidyChequesMap(map)
}

/** Profit for a payment row: subtotal − site cost; 0 when site cost is unset/0. */
function getPaymentSiteProfit(payment: CustomerPayment, siteCostOverride?: number): number {
  const siteCost = Math.max(
    0,
    Math.round(Number(siteCostOverride != null ? siteCostOverride : payment.siteCost) || 0),
  )
  if (siteCost <= 0) return 0
  const subtotal = getPaymentEffectiveCap(payment)
  return Math.round(subtotal - siteCost)
}

function parseSiteCostInput(raw: string): number {
  const cleaned = String(raw ?? "").replace(/[₹,\s]/g, "").trim()
  if (cleaned === "") return 0
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0
}

/** Apply cleared subsidy amount across installments in order (does not exceed phase caps). */
function applySubsidyAmountToPhases(phases: PaymentPhase[], amountToApply: number): PaymentPhase[] {
  let left = Math.round(Number(amountToApply) || 0)
  if (left <= 0) return phases
  const sorted = [...phases].sort((a, b) => a.phaseNumber - b.phaseNumber)
  return sorted.map((ph) => {
    const amountCap = Math.max(Math.round(Number(ph.amount) || 0), Math.round(Number(ph.paidAmount) || 0))
    const paidNow = Math.round(Number(ph.paidAmount) || 0)
    const room = Math.max(0, amountCap - paidNow)
    const add = Math.min(room, left)
    left -= add
    const paid = paidNow + add
    const amount = Math.max(amountCap, paid)
    const status: PaymentPhase["status"] =
      paid >= amount ? "completed" : paid > 0 ? "partial" : "pending"
    return { ...ph, paidAmount: paid, amount, status }
  })
}

/** Parse API / DB date strings that are not always ISO-8601 (e.g. MySQL `YYYY-MM-DD HH:mm:ss`). */
function parseFlexibleAdminDate(input: string): Date | null {
  const s = input.trim()
  if (!s) return null
  let d = new Date(s)
  if (!Number.isNaN(d.getTime())) return d
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) {
    d = new Date(s.replace(" ", "T"))
    if (!Number.isNaN(d.getTime())) return d
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    d = new Date(`${s}T00:00:00`)
    if (!Number.isNaN(d.getTime())) return d
  }
  return null
}

function formatAdminDate(iso?: string | null) {
  if (!iso) return "—"
  const d = parseFlexibleAdminDate(String(iso))
  return d ? d.toLocaleString("en-IN") : "—"
}

/** Normalize API date / epoch / Date for display pipeline. */
function pickIsoOrString(v: unknown): string | undefined {
  if (v == null) return undefined
  if (typeof v === "object" && v !== null && "$date" in (v as object)) {
    return pickIsoOrString((v as { $date?: unknown }).$date)
  }
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v.toISOString()
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v < 1e12 ? v * 1000 : v
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  const s = String(v).trim()
  return s || undefined
}

/** Flatten list rows like `{ quotation: {...} }` or Sequelize `{ attributes: {...} }`. */
function quotationListRowToFlatRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {}
  const r = raw as Record<string, unknown>
  let base: Record<string, unknown> = { ...r }
  const nested = r.quotation
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    base = { ...(nested as Record<string, unknown>), ...r }
  }
  const attrs = base.attributes
  if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
    base = { ...(attrs as Record<string, unknown>), ...base }
  }
  return base
}

/**
 * Approve date: explicit fields first, then last "approved" entry in status history
 * (statusHistory / status_history / statusChanges), matching admin dashboard shapes.
 */
function pickApprovalTimestampFromQuotation(q: Record<string, unknown>): string | undefined {
  const direct = pickIsoOrString(
    q.statusApprovedAt ?? q.status_approved_at ?? q.approvedAt ?? q.approved_at,
  )
  if (direct) return direct
  const rawHist = q.statusHistory ?? q.status_history ?? q.statusChanges
  if (!Array.isArray(rawHist)) return undefined
  for (let i = rawHist.length - 1; i >= 0; i--) {
    const e = rawHist[i] as Record<string, unknown> | null
    if (!e || typeof e !== "object") continue
    const st = String(e.status ?? e.to ?? e.newStatus ?? "")
      .trim()
      .toLowerCase()
    if (st !== "approved") continue
    const at = pickIsoOrString(e.at ?? e.changedAt ?? e.timestamp ?? e.createdAt)
    if (at) return at
  }
  return undefined
}

function pickFileLoginTimestampFromQuotation(q: Record<string, unknown>): string | undefined {
  const direct = pickIsoOrString(
    q.fileLoginAt ??
      q.file_login_at ??
      q.fileLoggedInAt ??
      q.file_logged_in_at ??
      q.fileLoginDate ??
      q.file_login_date,
  )
  if (direct) return direct

  const nested = q.fileLogin
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const n = nested as Record<string, unknown>
    const fromNested = pickIsoOrString(n.at ?? n.loggedAt ?? n.logged_at ?? n.date ?? n.timestamp)
    if (fromNested) return fromNested
  }

  const rawHist = q.statusHistory ?? q.status_history ?? q.statusChanges
  if (Array.isArray(rawHist)) {
    for (let i = rawHist.length - 1; i >= 0; i--) {
      const e = rawHist[i] as Record<string, unknown> | null
      if (!e || typeof e !== "object") continue
      const st = String(e.status ?? e.to ?? e.newStatus ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
      const isFileLogin =
        st === "file_login" ||
        st === "filelogin" ||
        st === "portal_login" ||
        st === "login_filed" ||
        st.includes("file_login")
      if (!isFileLogin) continue
      const at = pickIsoOrString(e.at ?? e.changedAt ?? e.timestamp ?? e.createdAt)
      if (at) return at
    }
  }

  return undefined
}

function fileLoginStatusLabel(raw?: string | null) {
  if (!raw) return ""
  const s = String(raw).toLowerCase()
  if (s === "already_login") return "Already logged in"
  if (s === "login_now") return "Login now"
  return raw
}

function normalizeSubsidyChequesFromApi(raw: unknown): SubsidyChequeRecord[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(Boolean)
    .map((c: any) => ({
      id: String(c.id || `sc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
      details: String(c.details || c.chequeDetails || ""),
      amount: Math.max(0, Math.round(Number(c.amount) || 0)),
      status: c.status === "cleared" ? ("cleared" as const) : ("pending" as const),
      clearedAt: c.clearedAt || c.cleared_at,
    }))
}

/**
 * API rule: paidAmount <= amount per phase. Default equal-split "amount" is often < paidAmount
 * after real collections. Rebuild each amount as paid + fair share of (subtotal − sum(paid)),
 * then fix row status from paid vs amount.
 */
function normalizePhaseAmountsForApi(phases: PaymentPhase[], subtotal: number): PaymentPhase[] {
  const n = phases.length
  if (n === 0) return phases
  const S = Math.max(0, Math.round(Number(subtotal) || 0))
  const paidRounded = phases.map((p) => Math.max(0, Math.round(Number(p.paidAmount) || 0)))
  const sumPaid = paidRounded.reduce((a, b) => a + b, 0)

  if (sumPaid > S) {
    return phases.map((p, i) => {
      const paid = paidRounded[i]
      const amount = Math.max(Math.round(Number(p.amount) || 0), paid)
      const status: PaymentPhase["status"] =
        paid >= amount ? "completed" : paid > 0 ? "partial" : "pending"
      return { ...p, paidAmount: paid, amount, status }
    })
  }

  const pool = S - sumPaid
  const base = Math.floor(pool / n)
  const extraOnes = pool - base * n
  return phases.map((p, i) => {
    const paid = paidRounded[i]
    const extra = base + (i < extraOnes ? 1 : 0)
    const amount = paid + extra
    const status: PaymentPhase["status"] =
      paid >= amount ? "completed" : paid > 0 ? "partial" : "pending"
    return { ...p, paidAmount: paid, amount, status }
  })
}

function redistributeInstallmentAmounts(
  total: number,
  count: number,
  existing?: PaymentPhase[],
): PaymentPhase[] {
  const safeCount = Math.max(1, count)
  const baseAmount = Math.floor(total / safeCount)
  const remainder = Math.round(total - baseAmount * safeCount)
  return Array.from({ length: safeCount }, (_, index) => {
    const existingPhase = existing?.[index]
    const amount = baseAmount + (index === safeCount - 1 ? remainder : 0)
    const paidAmount = existingPhase?.paidAmount ?? 0
    const status: PaymentPhase["status"] =
      paidAmount >= amount ? "completed" : paidAmount > 0 ? "partial" : "pending"
    return {
      phaseNumber: index + 1,
      phaseName: `Installment ${index + 1}`,
      amount,
      status,
      paidAmount,
      dueDate: existingPhase?.dueDate,
      paymentDate: existingPhase?.paymentDate,
      paymentMode: normalizePaymentMode(
        existingPhase?.paymentMode || (existingPhase as any)?.mode || (existingPhase as any)?.payment_method,
      ),
      transactionId: existingPhase?.transactionId,
      note: (existingPhase as any)?.note || (existingPhase as any)?.remarks || "",
    }
  })
}

function removePaymentPhase(
  phases: PaymentPhase[],
  phaseNumberToRemove: number,
  subtotal: number,
): PaymentPhase[] {
  const remaining = [...phases]
    .filter((phase) => phase.phaseNumber !== phaseNumberToRemove)
    .sort((a, b) => a.phaseNumber - b.phaseNumber)
    .map((phase, index) => ({
      ...phase,
      phaseNumber: index + 1,
      phaseName: `Installment ${index + 1}`,
    }))

  if (remaining.length === 0) return []

  return redistributeInstallmentAmounts(subtotal, remaining.length, remaining)
}

function extractPhasesFromPaymentUpdateResponse(response: unknown): PaymentPhase[] | null {
  if (!response || typeof response !== "object") return null
  const body = response as Record<string, unknown>
  const nested =
    body.data && typeof body.data === "object" && !Array.isArray(body.data)
      ? (body.data as Record<string, unknown>)
      : body
  const quotation =
    nested.quotation && typeof nested.quotation === "object"
      ? (nested.quotation as Record<string, unknown>)
      : nested
  const raw =
    quotation.installments ||
    quotation.paymentPhases ||
    quotation.payment_phases ||
    quotation.phases ||
    null
  if (!Array.isArray(raw)) return null
  return coercePhasesPaymentModes(
    raw.map((phase: any, index: number) => ({
      phaseNumber: Number(phase.phaseNumber || index + 1),
      phaseName: phase.phaseName || `Installment ${index + 1}`,
      amount: Number(phase.amount || 0),
      dueDate: phase.dueDate,
      status: (phase.status || "pending") as PaymentPhase["status"],
      paidAmount: Number(phase.paidAmount || 0),
      paymentDate: phase.paymentDate,
      paymentMode: normalizePaymentMode(phase.paymentMode || phase.mode || phase.payment_method),
      transactionId: phase.transactionId,
      note: phase.note || phase.remarks || "",
    })),
  )
}

function coercePhasesPaymentModes(phases: PaymentPhase[]): PaymentPhase[] {
  let last: PaymentModeSelectValue | undefined
  return phases.map((phase) => {
    const fromField = normalizePaymentMode(
      phase.paymentMode || (phase as any).mode || (phase as any).payment_method,
    )
    let paymentMode = fromField
    if (paymentMode) last = paymentMode
    const paid = Number(phase.paidAmount) || 0
    const hasPaymentActivity = paid > 0 || phase.status === "partial" || phase.status === "completed"
    if (hasPaymentActivity && !paymentMode) {
      paymentMode = last || "cash"
      last = paymentMode
    }
    return { ...phase, paymentMode }
  })
}

function calendarDateLocalYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function paymentDateRangeToFilterStrings(range?: DateRange) {
  return {
    from: range?.from ? calendarDateLocalYmd(range.from) : "",
    to: range?.to ? calendarDateLocalYmd(range.to) : "",
  }
}

function PaymentDateRangeFilter({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string
  label: string
  value: DateRange | undefined
  onChange: (next: DateRange | undefined) => void
  placeholder: string
}) {
  const text = (() => {
    if (!value?.from) return placeholder
    const a = format(value.from, "dd/MM/yyyy")
    if (!value.to) return `${a} → …`
    const b = format(value.to, "dd/MM/yyyy")
    return a === b ? a : `${a} → ${b}`
  })()

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Popover modal={false}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className="h-9 w-full justify-start gap-2 px-3 text-left text-sm font-normal"
          >
            <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{text}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="z-[200] w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={value}
            onSelect={onChange}
            defaultMonth={value?.from ?? new Date()}
            numberOfMonths={1}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

export default function AccountManagementPage() {
  const { isAuthenticated, role, logout, accountManager, dealer, access, modulePermissions, officeLocation } = useAuth()
  const router = useRouter()
  const { toast } = useToast()
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [filterCities, setFilterCities] = useState<string[]>([])
  const [paymentSearchTerm, setPaymentSearchTerm] = useState("")
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<PaymentTypeFilterValue[]>([])
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<"all" | "pending" | "partial" | "completed">("all")
  const [paymentInstallmentFilter, setPaymentInstallmentFilter] = useState<PaymentInstallmentFilter>("all")
  const [fileStatusFilter, setFileStatusFilter] = useState<FileStatusFilter>("all")
  const [sendToInstallationFilter, setSendToInstallationFilter] =
    useState<SendToInstallationFilter>("all")
  const [paymentDealerFilter, setPaymentDealerFilter] = useState("all")
  /** Approve date filter as calendar range (local YYYY-MM-DD derived for row matching). */
  const [approveDateRange, setApproveDateRange] = useState<DateRange | undefined>()
  const [paymentFiltersOpen, setPaymentFiltersOpen] = useState(false)
  const [paymentSectionTab, setPaymentSectionTab] = useState<PaymentSectionTab>("active")
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [activeTab, setActiveTab] = useState("payments")
  const [installmentDialogOpen, setInstallmentDialogOpen] = useState(false)
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null)
  const [isSavingInstallments, setIsSavingInstallments] = useState(false)
  const [isSavingFinalSettlement, setIsSavingFinalSettlement] = useState(false)
  const [isRevertingFinalSettlement, setIsRevertingFinalSettlement] = useState(false)
  const [releasingInstallationId, setReleasingInstallationId] = useState<string | null>(null)
  const [retrievingInstallationId, setRetrievingInstallationId] = useState<string | null>(null)
  /** Draft Cost of site values while typing; flushed to backend on blur. */
  const [siteCostDrafts, setSiteCostDrafts] = useState<Record<string, string>>({})
  const [savingSiteCostId, setSavingSiteCostId] = useState<string | null>(null)
  /** Session PI URLs after upload when GET list omits piUploadUrls. */
  const [piUrlsByQuotation, setPiUrlsByQuotation] = useState<Record<string, string[]>>({})
  const [uploadingPiId, setUploadingPiId] = useState<string | null>(null)
  /**
   * Session overrides when GET approved list omits siteCost after a successful save.
   * Not localStorage — cleared on full page reload (backend GET must echo siteCost).
   */
  const siteCostSessionRef = useRef<Record<string, number>>({})
  const sessionUserId = accountManager?.id ?? dealer?.id
  const accountsReadOnly = isWorkflowModuleReadOnly(modulePermissions, "accounts", {
    userId: sessionUserId,
    officeLocation,
    viewerIsDealer: role === "dealer",
    viewerIsAdmin: role === "admin" || role === "super-admin",
  })
  const permissionVisibleQuotations = useMemo(
    () =>
      filterQuotationsByWorkflowPermission(
        quotations as unknown as Record<string, unknown>[],
        modulePermissions,
        "accounts",
        {
          userId: sessionUserId,
          officeLocation,
          viewerIsDealer: role === "dealer",
          viewerIsAdmin: role === "admin" || role === "super-admin",
        },
      ) as unknown as Quotation[],
    [quotations, modulePermissions, sessionUserId, officeLocation, role],
  )
  const [subsidyDraftDetails, setSubsidyDraftDetails] = useState("")
  const [subsidyDraftAmount, setSubsidyDraftAmount] = useState("")
  const useApi = process.env.NEXT_PUBLIC_USE_API !== "false"
  const accountDisplayName = accountManager
    ? formatPersonName(accountManager.firstName, accountManager.lastName, "") ||
      accountManager.username ||
      accountManager.email ||
      "Account Manager"
    : "Account Manager"

  const getStoredPaymentPlans = (): Record<string, any> => {
    try {
      const stored = localStorage.getItem(PAYMENT_PLANS_KEY)
      if (!stored) return {}
      const parsed = JSON.parse(stored)
      return parsed && typeof parsed === "object" ? parsed : {}
    } catch {
      return {}
    }
  }

  const saveStoredPaymentPlan = (quotationId: string, payload: any) => {
    const current = getStoredPaymentPlans()
    current[quotationId] = payload
    localStorage.setItem(PAYMENT_PLANS_KEY, JSON.stringify(current))
  }

  const buildInstallments = (total: number, count: number, existing?: PaymentPhase[]) =>
    redistributeInstallmentAmounts(total, count, existing)

  const activePayment = activePaymentId
    ? customerPayments.find((payment) => payment.quotationId === activePaymentId) || null
    : null

  useEffect(() => {
    if (installmentDialogOpen) {
      setSubsidyDraftDetails("")
      setSubsidyDraftAmount("")
    }
  }, [installmentDialogOpen])

  useEffect(() => {
    // Initialize on mount - wait for auth state
    const timer = setTimeout(() => {
      setIsInitialLoad(false)
    }, 100)

    return () => clearTimeout(timer)
  }, [])

  const loadApprovedQuotations = useCallback(async () => {
    const useApi = process.env.NEXT_PUBLIC_USE_API !== "false"
    const permCtx = {
      userId: accountManager?.id ?? dealer?.id,
      officeLocation,
      viewerIsDealer: role === "dealer",
      viewerIsAdmin: role === "admin" || role === "super-admin",
    }
    const loadAllApproved =
      role === "account-management" ||
      shouldLoadAllAccountsQuotations(modulePermissions, permCtx)

    setIsLoading(true)
    try {
      if (useApi) {
        // Check if we have an auth token
        const token = localStorage.getItem("authToken")
        if (!token) {
          // No token available - user needs to login again
          toast({
            title: "Authentication Required",
            description: "Your session has expired. Please login again.",
            variant: "destructive",
          })
          // Redirect to login after a short delay
          setTimeout(() => {
            router.push("/account-management-login")
          }, 2000)
          setIsLoading(false)
          return
        }

        const listParams = {
          status: "approved" as const,
          page: 1,
          limit: 1000,
        }
        const response = loadAllApproved
          ? await api.quotations.getApprovedForAccounts(listParams)
          : await api.quotations.getAll(listParams)
        
        // Handle different response structures
        // apiRequest returns data.data, so response might be { quotations: [...] } or just array
        let quotationsList: any[] = []
        if (Array.isArray(response)) {
          quotationsList = response
        } else if (response?.quotations && Array.isArray(response.quotations)) {
          quotationsList = response.quotations
        } else if (response?.data?.quotations && Array.isArray(response.data.quotations)) {
          quotationsList = response.data.quotations
        } else if (response?.items && Array.isArray(response.items)) {
          quotationsList = response.items
        } else if (response?.results && Array.isArray(response.results)) {
          quotationsList = response.results
        }
        
        // Backend should return only approved quotations, but filter again as safety measure
        const approvedQuotations = quotationsList
          .filter((q: any) => {
            const flat = quotationListRowToFlatRecord(q)
            return String(flat.status || "").toLowerCase() === "approved"
          })
          .map((q: any) => {
            const flat = quotationListRowToFlatRecord(q)
            const pricing = flat.pricing as Record<string, unknown> | undefined
            const phasesFromApi =
              flat.installments ||
              flat.paymentPhases ||
              flat.quotationPaymentPhases ||
              flat.payment_phases ||
              flat.quotation_payment_phases ||
              []
            const subtotalVal = pickFirstFiniteNumber(
              flat.subtotal,
              pricing?.subtotal as number | undefined,
              pricing?.totalAmount as number | undefined,
              flat.totalAmount,
              flat.finalAmount,
            )
            const rem = optionalFiniteNumber(flat.remaining)
            const remAmt = optionalFiniteNumber(flat.remainingAmount)
            const fileLoginStatusRaw = flat.fileLoginStatus ?? flat.file_login_status
            const mapped = {
              id: String(flat.id ?? ""),
              customer: (flat.customer as Quotation["customer"]) || {},
              products: (flat.products as Quotation["products"]) || {},
              discount: Number(flat.discount) || 0,
              subtotal: subtotalVal,
              totalAmount:
                (pricing?.subtotal as number) ??
                (pricing?.totalAmount as number) ??
                (flat.totalAmount as number) ??
                (flat.finalAmount as number) ??
                0,
              finalAmount:
                (pricing?.finalAmount as number) ??
                (flat.finalAmount as number) ??
                (pricing?.totalAmount as number) ??
                0,
              createdAt: String(flat.createdAt ?? new Date().toISOString()),
              dealerId: String(flat.dealerId ?? ""),
              dealer: (flat.dealer as Quotation["dealer"]) || null,
              status: "approved" as const,
              paymentMode: (flat.paymentMode ?? flat.payment_mode) as string | undefined,
              paymentType: (flat.paymentType ?? flat.payment_type) as string | undefined,
              paymentStatus: flat.paymentStatus as Quotation["paymentStatus"],
              bankName: (flat.bankName ?? flat.bank_name) as string | undefined,
              bankIfsc: (flat.bankIfsc ?? flat.bank_ifsc) as string | undefined,
              loanAmount: pickFirstFiniteNumber(flat.loanAmount, flat.loan_amount) || undefined,
              cashAmount: pickFirstFiniteNumber(flat.cashAmount, flat.cash_amount) || undefined,
              ...(rem !== undefined ? { remaining: rem } : {}),
              ...(remAmt !== undefined ? { remainingAmount: remAmt } : {}),
              installments: Array.isArray(phasesFromApi) ? phasesFromApi : [],
              paymentPhases: Array.isArray(phasesFromApi) ? phasesFromApi : [],
              validUntil: flat.validUntil as string | undefined,
              statusApprovedAt: pickApprovalTimestampFromQuotation(flat),
              fileLoginAt: pickFileLoginTimestampFromQuotation(flat),
              installationReadyForInstaller: isQuotationSentToInstaller(flat, readInstallerReleaseMap()),
              installationReleasedAt: (flat.installationReleasedAt ?? flat.installation_released_at) as string | undefined,
              fileLoginStatus:
                fileLoginStatusRaw === "already_login" || fileLoginStatusRaw === "login_now"
                  ? fileLoginStatusRaw
                  : undefined,
              installationStatus: (flat.installationStatus ?? flat.installation_status) as string | undefined,
              installation_status: (flat.installationStatus ?? flat.installation_status) as string | undefined,
              meteringStage: (flat.meteringStage ?? flat.metering_stage) as string | undefined,
              meteringStatus: (flat.meteringStatus ?? flat.metering_status) as string | undefined,
              mcoStatus: (flat.mcoStatus ?? flat.mco_status) as string | undefined,
              meteringWccAfterDiscom: (flat.meteringWccAfterDiscom ?? flat.metering_wcc_after_discom) as
                | boolean
                | undefined,
              installerApprovedAt: (flat.installerApprovedAt ?? flat.installer_approved_at) as string | undefined,
              installer_approved_at: (flat.installerApprovedAt ?? flat.installer_approved_at) as string | undefined,
              installationPartialApproved: (flat.installationPartialApproved ??
                flat.installation_partial_approved) as boolean | undefined,
              documents: flat.documents ?? flat.document,
              document: flat.documents ?? flat.document,
              installation: flat.installation,
              installerInstallation: flat.installerInstallation,
              installationCompletion: flat.installationCompletion,
              installerCompletion: flat.installerCompletion,
              homeFrontPhoto: flat.homeFrontPhoto ?? flat.home_front_photo,
              homeWithPersonPhoto: flat.homeWithPersonPhoto ?? flat.home_with_person_photo,
              inverterWithCustomerPhoto: flat.inverterWithCustomerPhoto ?? flat.inverter_with_customer_photo,
              plantWithCustomerPhoto: flat.plantWithCustomerPhoto ?? flat.plant_with_customer_photo,
              inverterSerialNumberPhoto: flat.inverterSerialNumberPhoto ?? flat.inverter_serial_number_photo,
              panelSerialNumberPhoto: flat.panelSerialNumberPhoto ?? flat.panel_serial_number_photo,
              geoTagPlantPhoto: flat.geoTagPlantPhoto ?? flat.geo_tag_plant_photo,
              otherImages: flat.otherImages ?? flat.other_images,
              installationImageUrls: flat.installationImageUrls ?? flat.installation_image_urls,
              siteCompletionImages: flat.siteCompletionImages ?? flat.site_completion_images,
            }
            return mergeInstallerReleaseOntoQuotation(mapped, readInstallerReleaseMap()) as typeof mapped
          })

        // Align FILE STATUS with Admin Approved Installation: merge installer-queue
        // approved rows (status + photos) when Account role can read the queue.
        try {
          const approvedQueueRows = extractQuotationListFromApiResponse(
            await api.installer.getQueue({ status: "approved", page: 1, limit: 1000 }),
          )
          const queueById = new Map<string, Record<string, unknown>>()
          for (const row of approvedQueueRows) {
            const flat = flattenWrappedQuotationRow(row) as Record<string, unknown>
            const id = String(flat.id || "").trim()
            if (!id) continue
            queueById.set(id, mergeInstallationMediaSources(queueById.get(id) || {}, flat))
          }
          if (queueById.size > 0) {
            for (let i = 0; i < approvedQuotations.length; i++) {
              const q = approvedQuotations[i] as Record<string, unknown>
              const id = String(q.id || "").trim()
              const queueRow = queueById.get(id)
              if (!queueRow) continue
              approvedQuotations[i] = mergeInstallationMediaSources(
                {
                  ...q,
                  installationStatus:
                    q.installationStatus ||
                    q.installation_status ||
                    queueRow.installationStatus ||
                    queueRow.installation_status ||
                    "installer_approved",
                  installation_status:
                    q.installation_status ||
                    q.installationStatus ||
                    queueRow.installation_status ||
                    queueRow.installationStatus ||
                    "installer_approved",
                  installerApprovedAt:
                    q.installerApprovedAt ||
                    q.installer_approved_at ||
                    queueRow.installerApprovedAt ||
                    queueRow.installer_approved_at,
                } as Record<string, unknown>,
                queueRow,
              ) as (typeof approvedQuotations)[number]
            }
          }
        } catch {
          // Account role may not have installer queue access — status fields above still apply.
        }

        setQuotations(approvedQuotations as Quotation[])
      } else {
        // Fallback to localStorage for development
        try {
          const allQuotations = JSON.parse(localStorage.getItem("quotations") || "[]")
          const approvedQuotations = allQuotations
            .filter((q: Quotation) => String(q.status || "").toLowerCase() === "approved")
            .map((q: Quotation) => {
              const mapped = {
              ...q, 
              status: "approved" as const,
              id: q.id || `QT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              customer: q.customer || {},
              products: q.products || {},
              discount: q.discount || 0,
              totalAmount: (q as any).pricing?.subtotal ?? (q as any).pricing?.totalAmount ?? q.totalAmount ?? q.finalAmount ?? 0,
              finalAmount: q.finalAmount ?? (q as any).pricing?.finalAmount ?? q.totalAmount ?? 0,
              createdAt: q.createdAt || new Date().toISOString(),
              dealerId: q.dealerId || null,
              installationReadyForInstaller: isQuotationSentToInstaller(q as Record<string, any>, readInstallerReleaseMap()),
              installationReleasedAt:
                ((q as any).installationReleasedAt as string | undefined) ||
                ((q as any).installation_released_at as string | undefined),
            }
              return mergeInstallerReleaseOntoQuotation(mapped, readInstallerReleaseMap()) as typeof mapped
            })
          
          setQuotations(approvedQuotations)
          
          console.log(`Loaded ${approvedQuotations.length} approved quotations from localStorage`)
        } catch (parseError) {
          console.error("Error parsing localStorage quotations:", parseError)
          setQuotations([])
          toast({
            title: "Error Loading Data",
            description: "Failed to load quotations from local storage. Please check the data format.",
            variant: "destructive",
          })
        }
      }
    } catch (error) {
      console.error("Error loading approved quotations:", error)
      setQuotations([])
      
      // Show error toast with specific handling for permission errors
      if (error instanceof ApiError) {
        // Check for authentication errors
        if (error.code === "AUTH_001" || 
            error.code === "AUTH_003" || 
            error.message?.toLowerCase().includes("not authenticated") ||
            error.message?.toLowerCase().includes("unauthorized") ||
            error.message?.toLowerCase().includes("user not authenticated")) {
          toast({
            title: "Authentication Error",
            description: "Your session has expired or you are not authenticated. Please login again.",
            variant: "destructive",
          })
          // Clear any stale auth data
          localStorage.removeItem("authToken")
          localStorage.removeItem("refreshToken")
          // Redirect to login after a short delay
          setTimeout(() => {
            router.push("/account-management-login")
            router.refresh()
          }, 2000)
        } else if (error.code === "AUTH_004" || error.message?.toLowerCase().includes("insufficient permissions") || error.message?.toLowerCase().includes("permission")) {
          toast({
            title: "Permission Error",
            description: "You don't have permission to access this resource. Please contact your administrator.",
            variant: "destructive",
          })
        } else {
          toast({
            title: "Error Loading Data",
            description: error.message || "Failed to load approved quotations. Please check your connection and try again.",
            variant: "destructive",
          })
        }
      } else {
        console.warn("Non-API error loading quotations:", error)
        // Don't show toast for development mode errors - just log
        if (useApi) {
          toast({
            title: "Connection Error",
            description: "Unable to connect to server. Please check your internet connection.",
            variant: "destructive",
          })
        }
      }
    } finally {
      setIsLoading(false)
    }
  }, [toast, modulePermissions, officeLocation, role, accountManager?.id, dealer?.id, router])

  useEffect(() => {
    // Skip if still initializing
    if (isInitialLoad) return

    // Only account-management role can access this page
    if (!isAuthenticated) {
      router.push("/login")
      return
    }
    
    // Allow account-management, admin, or users granted Accounts access
    const canAccess =
      role === "account-management" ||
      role === "admin" ||
      dealer?.username === "admin" ||
      canOpenSection(access, role, "accounts")
    if (!canAccess) {
      if (role === "visitor") {
        router.push("/visitor/dashboard")
      } else {
        router.push(getPostLoginPath(access.length ? access : []))
      }
      return
    }
    
    if (isAuthenticated && canAccess) {
      loadApprovedQuotations()
    }
  }, [isAuthenticated, role, dealer, access, router, isInitialLoad, loadApprovedQuotations])

  // Initialize payment phases for quotations
  useEffect(() => {
    if (quotations.length > 0) {
      const payments: CustomerPayment[] = quotations.map((q) => {
        const qx = q as Quotation & { remaining?: number; remainingAmount?: number }
        const flatQx = quotationListRowToFlatRecord(qx as unknown)
        const subtotal = pickFirstFiniteNumber(
          qx.subtotal,
          qx.pricing?.subtotal,
          qx.pricing?.totalAmount,
          qx.totalAmount,
          qx.finalAmount,
        )
        const totalAmount = q.totalAmount || q.finalAmount || subtotal || 0
        const existingPhases =
          (q as any).installments ||
          (q as any).paymentPhases ||
          (q as any).quotationPaymentPhases ||
          (q as any).payment_phases ||
          (q as any).quotation_payment_phases ||
          []
        // When backend is enabled, treat backend response as source-of-truth.
        // Local storage fallback is only used when API mode is off.
        const storedPlans = useApi ? {} : getStoredPaymentPlans()
        const storedPlan = storedPlans[q.id || ""]
        const storedPhases = storedPlan?.phases || []
        const sourcePhases = useApi
          ? existingPhases
          : Array.isArray(existingPhases) && existingPhases.length > 0
            ? existingPhases
            : storedPhases
        const phases: PaymentPhase[] = Array.isArray(sourcePhases)
          ? coercePhasesPaymentModes(
              sourcePhases.map((phase: any, index: number) => ({
                phaseNumber: Number(phase.phaseNumber || index + 1),
                phaseName: phase.phaseName || `Installment ${index + 1}`,
                amount: Number(phase.amount || 0),
                dueDate: phase.dueDate,
                status: (phase.status || "pending") as PaymentPhase["status"],
                paidAmount: Number(phase.paidAmount || 0),
                paymentDate: phase.paymentDate,
                paymentMode: normalizePaymentMode(
                  phase.paymentMode || phase.mode || phase.payment_method,
                ),
                transactionId: phase.transactionId,
                note: phase.note || phase.remarks || "",
              })),
            )
          : []

        const subsidyMap = getStoredSubsidyChequesMap()
        const fromApiCheques = normalizeSubsidyChequesFromApi((qx as any).subsidyCheques)
        const mergedSubsidy: SubsidyChequeRecord[] =
          fromApiCheques.length > 0 ? fromApiCheques : subsidyMap[q.id || ""] || []

        // Settlement state comes ONLY from the database (no cache / local / session storage).
        const discountAmount = getQuotationDiscountAmount(q)
        const apiSettled = getQuotationFinalSettlementApplied(q)
        const originalSubtotal = Math.round(subtotal)
        const effectiveSubtotal = Math.max(0, originalSubtotal - discountAmount)
        const remFromApi = pickApiRemainingFromPayload(qx as unknown as Record<string, unknown>)
        const settlementApplied =
          apiSettled ||
          (discountAmount > 0 &&
            Math.max(0, originalSubtotal - getTotalPaidPhases(phases)) <= discountAmount + 0.5)

        const apiSiteCost = pickSiteCostFromQuotation(qx as unknown as Record<string, unknown>)
        const storedSiteCost = getStoredSiteCostMap()[q.id || ""] || 0
        const sessionSiteCost = siteCostSessionRef.current[q.id || ""] || 0
        // Prefer API; fall back to durable store / session when GET omits site_cost.
        const siteCost =
          apiSiteCost > 0
            ? Math.round(apiSiteCost)
            : storedSiteCost > 0
              ? Math.round(storedSiteCost)
              : sessionSiteCost > 0
                ? Math.round(sessionSiteCost)
                : undefined
        if (apiSiteCost > 0 && q.id) {
          persistSiteCostForQuotation(q.id, apiSiteCost)
          delete siteCostSessionRef.current[q.id]
        }

        return {
          quotationId: q.id || "",
          customerName: formatPersonName(q.customer?.firstName, q.customer?.lastName, "Unknown"),
          customerMobile: q.customer?.mobile || "",
          dealerName: q.dealer
            ? formatPersonName(q.dealer.firstName, q.dealer.lastName, "Unassigned")
            : "Unassigned",
          dealerMobile: q.dealer?.mobile || "",
          dealerId: String(q.dealerId || q.dealer?.id || "").trim() || undefined,
          subtotal: effectiveSubtotal,
          originalSubtotal,
          discountAmount,
          finalSettlementApplied: settlementApplied,
          finalSettlementDiscount: settlementApplied
            ? Number(
                (q as Quotation & Record<string, unknown>).finalSettlementAmount ??
                  (q as Quotation & Record<string, unknown>).final_settlement_amount ??
                  ((q as Quotation & Record<string, unknown>).pricing as Record<string, unknown> | undefined)
                    ?.finalSettlementAmount ??
                  0,
              ) || undefined
            : undefined,
          totalAmount: q.totalAmount || 0,
          finalAmount: q.finalAmount || q.totalAmount || 0,
          remainingFromApi: remFromApi,
          paymentType:
            (q as any).paymentType ||
            (useApi ? q.paymentMode : q.paymentMode || storedPlan?.paymentMode) ||
            undefined,
          paymentMode: normalizePaymentMode(q.paymentMode) || (!useApi ? normalizePaymentMode(storedPlan?.paymentMode) : undefined) || undefined,
          bankName: String((qx as any).bankName ?? (qx as any).bank_name ?? "").trim() || undefined,
          bankIfsc: String((qx as any).bankIfsc ?? (qx as any).bank_ifsc ?? "").trim() || undefined,
          loanAmount: pickFirstFiniteNumber((qx as any).loanAmount, (qx as any).loan_amount) || undefined,
          cashAmount: pickFirstFiniteNumber((qx as any).cashAmount, (qx as any).cash_amount) || undefined,
          siteCost,
          paymentStatus:
            q.paymentStatus ??
            (!useApi ? (storedPlan?.paymentStatus as CustomerPayment["paymentStatus"]) : undefined) ??
            "pending",
          phases,
          quotation: q,
          statusApprovedAt: pickApprovalTimestampFromQuotation(flatQx),
          fileLoginAt: pickFileLoginTimestampFromQuotation(flatQx),
          fileLoginStatus: (qx as any).fileLoginStatus ?? (qx as any).file_login_status,
          subsidyCheques: mergedSubsidy,
        }
      })
      setCustomerPayments(payments)
    }
  }, [quotations, useApi])

  const paymentDealerOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const payment of customerPayments) {
      const id = payment.dealerId?.trim()
      const name = payment.dealerName?.trim() || "Unassigned"
      if (!id) {
        byId.set("__unassigned__", "Unassigned")
      } else {
        byId.set(id, name)
      }
    }
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: "base" }))
  }, [customerPayments])

  useEffect(() => {
    if (paymentDealerFilter === "all") return
    if (paymentDealerOptions.some(([id]) => id === paymentDealerFilter)) return
    setPaymentDealerFilter("all")
  }, [paymentDealerFilter, paymentDealerOptions])

  useEffect(() => {
    if (paymentSectionTab !== "completed" && paymentStatusFilter === "completed") {
      setPaymentStatusFilter("all")
    }
    if (
      paymentSectionTab === "completed" &&
      paymentStatusFilter !== "all" &&
      paymentStatusFilter !== "completed"
    ) {
      setPaymentStatusFilter("all")
    }
  }, [paymentSectionTab, paymentStatusFilter])

  const filteredQuotations = permissionVisibleQuotations.filter(
    (q) =>
      ((q.customer?.firstName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (q.customer?.lastName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (q.customer?.mobile || "").includes(searchTerm) ||
        (q.id || "").toLowerCase().includes(searchTerm.toLowerCase())) &&
      matchesCityFilter(q, filterCities),
  )

  // One row per customer — same as dealer Quotations (current version only).
  const sortedQuotations = keepCurrentQuotationsOnly(
    [...filteredQuotations].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
    permissionVisibleQuotations,
  )

  const accountOlderCountById = useMemo(() => {
    const map = new Map<string, number>()
    for (const group of groupQuotationsByCustomerCurrentFirst(permissionVisibleQuotations)) {
      map.set(group.current.id, group.history.length)
    }
    return map
  }, [permissionVisibleQuotations])

  const totalApprovedValue = permissionVisibleQuotations.reduce((sum, q) => sum + Math.abs(q.finalAmount || q.totalAmount || 0), 0)

  const getPaymentTypeValue = (payment: CustomerPayment) => {
    return String(payment.paymentType || payment.paymentMode || "").toLowerCase()
  }

  /** Final settlement is for Cash and Cash + loan only — not Loan-only. */
  const isFinalSettlementEligible = (payment: CustomerPayment) => {
    const t = getPaymentTypeValue(payment)
    return t === "cash" || t === "mix"
  }

  const getFinancingBankDisplay = (payment: CustomerPayment): string => {
    const t = getPaymentTypeValue(payment)
    if (t !== "loan" && t !== "mix") return "—"
    const bank = String(payment.bankName || "").trim()
    const ifsc = String(payment.bankIfsc || "").trim().toUpperCase()
    if (!bank && !ifsc) return "—"
    if (bank && ifsc) return `${bank} · ${ifsc}`
    return bank || ifsc
  }

  const getPaymentTypeLabel = (paymentType?: string) => {
    const normalized = String(paymentType || "").toLowerCase()
    if (normalized === "loan") return "Loan"
    if (normalized === "cash") return "Cash"
    if (normalized === "mix") return "Cash + loan"
    return "N/A"
  }

  const toLocalCalendarDateString = (iso?: string | null) => {
    if (!iso) return null
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }

  const calendarDateInRange = (ymd: string | null, from: string, to: string) => {
    if (!from.trim() && !to.trim()) return true
    if (!ymd) return false
    if (from.trim() && ymd < from.trim()) return false
    if (to.trim() && ymd > to.trim()) return false
    return true
  }

  const currentQuotationIdsForPayments = useMemo(
    () => getCurrentQuotationIds(quotations),
    [quotations],
  )

  const installerReleaseMapForPayments = useMemo(() => readInstallerReleaseMap(), [customerPayments, quotations])

  const paymentMatchesRowFilters = useCallback(
    (payment: CustomerPayment, fileStatus: FileStatusFilter = fileStatusFilter) => {
      // One row per customer for normal payments — but keep every Send-to-Installer
      // row so Account FILE STATUS matches Admin Installation counts (e.g. Pending 27).
      if (
        currentQuotationIdsForPayments.size > 0 &&
        payment.quotationId &&
        !currentQuotationIdsForPayments.has(payment.quotationId)
      ) {
        const q = payment.quotation as unknown as Record<string, unknown>
        if (!isQuotationSentToInstaller(q, installerReleaseMapForPayments)) {
          return false
        }
      }
      const matchesSearch =
        payment.customerName.toLowerCase().includes(paymentSearchTerm.toLowerCase()) ||
        payment.customerMobile.includes(paymentSearchTerm) ||
        payment.quotationId.toLowerCase().includes(paymentSearchTerm.toLowerCase())
      const paymentTypeValue = getPaymentTypeValue(payment)
      const matchesPaymentType =
        paymentTypeFilter.length === 0 ||
        paymentTypeFilter.length === PAYMENT_TYPE_FILTER_OPTIONS.length ||
        paymentTypeFilter.some((selected) =>
          selected === "unknown" ? !paymentTypeValue : paymentTypeValue === selected,
        )
      const paymentStatusValue = getEffectivePaymentStatus(payment)
      const matchesPaymentStatus = paymentStatusFilter === "all" || paymentStatusValue === paymentStatusFilter
      const approveYmd = toLocalCalendarDateString(payment.statusApprovedAt)
      const approveBounds = paymentDateRangeToFilterStrings(approveDateRange)
      const matchesApproveDateRange = calendarDateInRange(approveYmd, approveBounds.from, approveBounds.to)
      const matchesInstallment = paymentMatchesInstallmentFilter(payment, paymentInstallmentFilter)
      const matchesFileStatus = paymentMatchesFileStatusFilter(payment.quotation, fileStatus)
      const sentToInstaller = isQuotationSentToInstaller(
        payment.quotation as unknown as Record<string, unknown>,
        installerReleaseMapForPayments,
      )
      const matchesSendToInstallation =
        sendToInstallationFilter === "all" ||
        (sendToInstallationFilter === "yes" && sentToInstaller) ||
        (sendToInstallationFilter === "no" && !sentToInstaller)
      const matchesDealer =
        paymentDealerFilter === "all" ||
        (paymentDealerFilter === "__unassigned__"
          ? !payment.dealerId
          : payment.dealerId === paymentDealerFilter)
      return (
        matchesSearch &&
        matchesPaymentType &&
        matchesPaymentStatus &&
        matchesInstallment &&
        matchesFileStatus &&
        matchesSendToInstallation &&
        matchesDealer &&
        matchesApproveDateRange
      )
    },
    [
      currentQuotationIdsForPayments,
      installerReleaseMapForPayments,
      paymentSearchTerm,
      paymentTypeFilter,
      paymentStatusFilter,
      paymentInstallmentFilter,
      fileStatusFilter,
      sendToInstallationFilter,
      paymentDealerFilter,
      approveDateRange,
    ],
  )

  const visibleQuotationIds = useMemo(
    () => new Set(permissionVisibleQuotations.map((q) => q.id).filter(Boolean)),
    [permissionVisibleQuotations],
  )

  const filteredCustomerPayments = useMemo(
    () =>
      customerPayments
        .filter((payment) => visibleQuotationIds.has(payment.quotationId))
        .filter((payment) => paymentMatchesRowFilters(payment, fileStatusFilter))
        // Recent approve date first; missing dates at the bottom
        .sort((a, b) => {
          const aTime = a.statusApprovedAt ? new Date(a.statusApprovedAt).getTime() : 0
          const bTime = b.statusApprovedAt ? new Date(b.statusApprovedAt).getTime() : 0
          const aValid = Number.isFinite(aTime) && aTime > 0
          const bValid = Number.isFinite(bTime) && bTime > 0
          if (aValid && bValid) return bTime - aTime
          if (aValid) return -1
          if (bValid) return 1
          return 0
        }),
    [customerPayments, visibleQuotationIds, paymentMatchesRowFilters, fileStatusFilter],
  )

  const paymentSectionBuckets = useMemo(
    () => splitPaymentsBySection(filteredCustomerPayments),
    [filteredCustomerPayments],
  )

  const displayedCustomerPayments = useMemo(() => {
    if (paymentSectionTab === "completed") return paymentSectionBuckets.completedPayments
    if (paymentSectionTab === "overdue") return paymentSectionBuckets.overduePayments
    return paymentSectionBuckets.activePayments
  }, [paymentSectionTab, paymentSectionBuckets])

  const paymentDashboardStats = useMemo(() => {
    let totalAmount = 0
    let pendingAmount = 0
    let totalProfit = 0
    for (const payment of displayedCustomerPayments) {
      // Net payable after discount/settlement (so Total drops by the settlement `d`).
      // Invariant: Total = Paid + Pending.
      totalAmount += getPaymentEffectiveCap(payment)
      pendingAmount += getDisplayRemaining(payment)
      const draftRaw = siteCostDrafts[payment.quotationId]
      const liveSiteCost =
        draftRaw !== undefined ? parseSiteCostInput(draftRaw) : undefined
      totalProfit += getPaymentSiteProfit(payment, liveSiteCost)
    }

    // Remaining only for Installation · Approved (completed), independent of File status filter.
    let installationCompletedRemaining = 0
    let installationCompletedCount = 0
    for (const payment of customerPayments) {
      if (!paymentMatchesRowFilters(payment, "installation:completed")) continue
      installationCompletedRemaining += getDisplayRemaining(payment)
      installationCompletedCount += 1
    }

    return {
      totalAmount,
      pendingAmount,
      totalProfit,
      customerCount: displayedCustomerPayments.length,
      installationCompletedRemaining,
      installationCompletedCount,
    }
  }, [displayedCustomerPayments, customerPayments, paymentMatchesRowFilters, siteCostDrafts])

  const updatePaymentSiteCost = async (quotationId: string, raw: string) => {
    const siteCost = parseSiteCostInput(raw)
    const previous = customerPayments.find((p) => p.quotationId === quotationId)?.siteCost

    setCustomerPayments((prev) =>
      prev.map((p) =>
        p.quotationId === quotationId
          ? { ...p, siteCost: siteCost > 0 ? siteCost : undefined }
          : p,
      ),
    )
    setSiteCostDrafts((prev) => {
      const next = { ...prev }
      delete next[quotationId]
      return next
    })

    // Keep across page refresh even when GET does not yet echo site_cost.
    persistSiteCostForQuotation(quotationId, siteCost)
    if (siteCost > 0) siteCostSessionRef.current[quotationId] = siteCost
    else delete siteCostSessionRef.current[quotationId]

    if (!useApi) {
      toast({
        title: "Cost of site saved",
        description: "Saved for this browser. Enable API mode to sync to server.",
      })
      return
    }

    if ((previous || 0) === siteCost) return

    setSavingSiteCostId(quotationId)
    try {
      await api.quotations.updateSiteCost(quotationId, siteCost)
      setQuotations((prev) =>
        prev.map((q) =>
          q.id === quotationId
            ? ({
                ...q,
                siteCost,
                site_cost: siteCost,
              } as Quotation)
            : q,
        ),
      )
      toast({
        title: "Cost of site saved",
        description:
          siteCost > 0
            ? `₹${siteCost.toLocaleString("en-IN")} saved. Profit updated.`
            : "Cost of site cleared. Profit updated.",
      })
    } catch (error) {
      // Keep durable store so refresh still shows the amount; warn that server may lag.
      toast({
        title: "Cost of site saved on this device",
        description:
          error instanceof ApiError
            ? `${error.message} — value kept after refresh until backend site_cost is live.`
            : "Backend must persist siteCost. Value kept after refresh on this browser.",
        variant: "destructive",
      })
    } finally {
      setSavingSiteCostId(null)
    }
  }

  const getActivePaymentPiUrls = (payment: CustomerPayment): string[] => {
    const session = piUrlsByQuotation[payment.quotationId]
    if (session) return session
    return extractPiUploadUrls(payment.quotation as unknown as Record<string, unknown>)
  }

  const uploadPaymentPiFiles = async (quotationId: string, files: File[]) => {
    if (files.length === 0) return
    const payment = customerPayments.find((p) => p.quotationId === quotationId)
    const existing = payment ? getActivePaymentPiUrls(payment) : piUrlsByQuotation[quotationId] || []

    if (!useApi) {
      toast({
        title: "API mode required",
        description: "Enable backend API mode to upload PI documents.",
        variant: "destructive",
      })
      return
    }

    setUploadingPiId(quotationId)
    try {
      const response = (await api.quotations.uploadPiDocuments(quotationId, files, existing)) as Record<
        string,
        unknown
      >
      const fromResponse = extractPiUploadUrls({
        ...response,
        documents: (response.documents as Record<string, unknown>) || response,
        piUploadUrls:
          (response.piUploadUrls as string[]) ||
          (response.pi_upload_urls as string[]) ||
          ((response.data as Record<string, unknown> | undefined)?.piUploadUrls as string[]),
      })
      const nextUrls =
        fromResponse.length > 0
          ? fromResponse
          : existing

      setPiUrlsByQuotation((prev) => ({
        ...prev,
        [quotationId]: fromResponse.length > 0 ? nextUrls : existing,
      }))
      if (fromResponse.length > 0) {
        setQuotations((prev) =>
          prev.map((q) =>
            q.id === quotationId
              ? ({
                  ...q,
                  piUploadUrls: nextUrls,
                  pi_upload_urls: nextUrls,
                  piUploadUrl: nextUrls[0],
                  pi_upload_url: nextUrls[0],
                } as Quotation)
              : q,
          ),
        )
      }
      toast({
        title: "PI uploaded",
        description:
          fromResponse.length > 0
            ? `${files.length} file(s) saved for this quotation.`
            : `${files.length} file(s) uploaded. Refresh if the list does not update yet.`,
      })
    } catch (error) {
      toast({
        title: "PI upload failed",
        description:
          error instanceof ApiError
            ? error.message
            : "Could not upload PI. Backend needs POST /quotations/:id/pi-upload.",
        variant: "destructive",
      })
    } finally {
      setUploadingPiId(null)
    }
  }

  const removePaymentPiUrl = async (quotationId: string, urlToRemove: string) => {
    const payment = customerPayments.find((p) => p.quotationId === quotationId)
    const existing = payment ? getActivePaymentPiUrls(payment) : piUrlsByQuotation[quotationId] || []
    const nextUrls = existing.filter((u) => u !== urlToRemove)

    setPiUrlsByQuotation((prev) => ({ ...prev, [quotationId]: nextUrls }))
    setQuotations((prev) =>
      prev.map((q) =>
        q.id === quotationId
          ? ({
              ...q,
              piUploadUrls: nextUrls,
              pi_upload_urls: nextUrls,
              piUploadUrl: nextUrls[0],
              pi_upload_url: nextUrls[0],
            } as Quotation)
          : q,
      ),
    )

    if (!useApi) return

    setUploadingPiId(quotationId)
    try {
      await api.quotations.uploadPiDocuments(quotationId, [], nextUrls, { replace: true })
      toast({
        title: "PI removed",
        description: "Document list updated.",
      })
    } catch (error) {
      toast({
        title: "Could not sync PI removal",
        description:
          error instanceof ApiError
            ? `${error.message} — removed locally; refresh may restore until backend supports replace.`
            : "Removed locally. Backend may still keep the old file.",
        variant: "destructive",
      })
    } finally {
      setUploadingPiId(null)
    }
  }

  const paymentListResetKey = [
    paymentSearchTerm,
    paymentTypeFilter.slice().sort().join(","),
    paymentStatusFilter,
    paymentInstallmentFilter,
    fileStatusFilter,
    sendToInstallationFilter,
    paymentDealerFilter,
    approveDateRange?.from?.toISOString() ?? "",
    approveDateRange?.to?.toISOString() ?? "",
    paymentSectionTab,
    displayedCustomerPayments.length,
  ].join("|")

  const {
    visibleItems: visibleCustomerPayments,
    hasMore: hasMoreCustomerPayments,
    loadMore: loadMoreCustomerPayments,
    sentinelRef: paymentListSentinelRef,
    visibleCount: visiblePaymentCount,
    totalCount: filteredPaymentTotal,
  } = useIncrementalList(displayedCustomerPayments, {
    batchSize: 15,
    resetKey: paymentListResetKey,
    enabled: activeTab === "payments",
  })

  // Show loading state while checking authentication (after all hooks)
  if (isInitialLoad) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <FileText className="w-8 h-8 text-primary opacity-50" />
          </div>
          <p className="text-muted-foreground">Loading Account Management...</p>
        </div>
      </div>
    )
  }

  const canAccess =
    role === "account-management" ||
    role === "admin" ||
    dealer?.username === "admin" ||
    canOpenSection(access, role, "accounts")
  if (!isAuthenticated || !canAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 opacity-50" />
          </div>
          <p className="text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  const downloadFilteredPaymentsExcel = () => {
    if (displayedCustomerPayments.length === 0) {
      toast({
        title: "No data to export",
        description: "Adjust filters to include at least one payment row.",
        variant: "destructive",
      })
      return
    }

    const escapeCsv = (value: string | number) => {
      const raw = String(value ?? "")
      if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
        return `"${raw.replace(/"/g, "\"\"")}"`
      }
      return raw
    }

    const headers = [
      "Quotation ID",
      "Customer Name",
      "Customer Mobile",
      "Payment Type",
      "Bank & IFSC",
      "Payment Status",
      "Approve date",
      "File login date",
      "File login status",
      "Subtotal",
      "Cost of Site",
      "Profit",
      "Loan Amount",
      "Cash Amount",
      "Discount",
      "Paid Amount",
      "Loan Paid",
      "Cash Paid",
      "Remaining Amount",
      "Loan Remaining",
      "Cash Remaining",
      "Installment Count",
      "Admin Approval Status",
      "Installation Status",
      "Metering Status",
      "Final Confirmation Status",
      "File Status",
    ]

    const rows = displayedCustomerPayments.map((payment) => {
      const paidAmount = getTotalPaidPhases(payment.phases)
      const remainingAmount = getDisplayRemaining(payment)
      const bankCell = getFinancingBankDisplay(payment)
      const journey = getJourneyStageProgress(payment.quotation)
      const fileStatus = getJourneyHoldInfo(payment.quotation).stageLabel
      const paymentTypeValue = getPaymentTypeValue(payment)
      const isMix = paymentTypeValue === "mix"
      const isLoan = paymentTypeValue === "loan"
      const loanAmt = isMix || isLoan ? getMixLoanCap(payment) || payment.loanAmount || "" : ""
      const cashAmt = isMix ? getMixCashCap(payment) || payment.cashAmount || "" : ""
      const loanPaid = isMix || isLoan ? getTotalPaidForSide(payment.phases, "loan") : ""
      const cashPaid = isMix || paymentTypeValue === "cash" ? getTotalPaidForSide(payment.phases, "cash") : ""
      const loanRem = isMix || isLoan ? getRemainingForSide(payment, "loan") : ""
      const cashRem = isMix || paymentTypeValue === "cash" ? getRemainingForSide(payment, "cash") : ""
      return [
        payment.quotationId,
        payment.customerName,
        payment.customerMobile,
        getPaymentTypeLabel(payment.paymentType || payment.paymentMode),
        bankCell === "—" ? "" : bankCell,
        (getEffectivePaymentStatus(payment) || "pending").toUpperCase(),
        payment.statusApprovedAt ? formatAdminDate(payment.statusApprovedAt) : "",
        payment.fileLoginAt ? formatAdminDate(payment.fileLoginAt) : "",
        fileLoginStatusLabel(payment.fileLoginStatus) || "",
        getPaymentOriginalSubtotal(payment),
        payment.siteCost || 0,
        getPaymentSiteProfit(payment),
        loanAmt,
        cashAmt,
        getPaymentDiscountAmount(payment),
        paidAmount,
        loanPaid,
        cashPaid,
        remainingAmount,
        loanRem,
        cashRem,
        payment.phases.length,
        formatJourneyStageStatusLabel(journey.adminApproval, "adminApproval"),
        formatJourneyStageStatusLabel(journey.installation, "installation"),
        formatJourneyStageStatusLabel(journey.metering, "metering"),
        formatJourneyStageStatusLabel(journey.finalConfirmation, "finalConfirmation"),
        fileStatus,
      ]
    })

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => escapeCsv(cell)).join(","))
      .join("\n")

    const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement("a")
    const stamp = new Date().toISOString().slice(0, 10)
    link.href = url
    link.download = `payment-management-${stamp}.csv`
    link.click()
    window.URL.revokeObjectURL(url)
  }

  const getSystemSize = (quotation: Quotation): string => {
    const products = quotation.products
    if (!products) return "N/A"

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
      const systemType = products.systemType.toLowerCase()
      if (systemType === "dcr") return "DCR"
      if (systemType === "non-dcr") return "NON DCR"
      if (systemType === "both") return "BOTH"
      if (systemType === "customize") return "CUSTOMIZE"
      return products.systemType.toUpperCase()
    }

    return "N/A"
  }

  const handleAddSubsidyCheque = () => {
    if (!activePayment) return
    const amt = Math.round(Number(subsidyDraftAmount) || 0)
    if (!subsidyDraftDetails.trim() || amt <= 0) {
      toast({
        title: "Cheque details required",
        description: "Enter subsidy cheque details and a positive amount.",
        variant: "destructive",
      })
      return
    }
    if (!confirmSave("Add this subsidy cheque and save?")) return
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `sc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const row: SubsidyChequeRecord = {
      id,
      details: subsidyDraftDetails.trim(),
      amount: amt,
      status: "pending",
    }
    const newCheques = [...(activePayment.subsidyCheques || []), row]
    setCustomerPayments((prev) =>
      prev.map((p) => (p.quotationId === activePayment.quotationId ? { ...p, subsidyCheques: newCheques } : p)),
    )
    persistSubsidyChequesForQuotation(activePayment.quotationId, newCheques)
    setSubsidyDraftDetails("")
    setSubsidyDraftAmount("")
    toast({ title: "Subsidy cheque recorded", description: "Mark as cleared when the cheque is honored." })
  }

  const handleMarkSubsidyChequeCleared = (chequeId: string) => {
    if (!activePayment) return
    const ch = activePayment.subsidyCheques.find((c) => c.id === chequeId)
    if (!ch || ch.status !== "pending") return
    if (!confirmSave(`Apply subsidy cheque of ₹${ch.amount.toLocaleString("en-IN")} to paid and save?`)) return
    const amt = Math.round(Number(ch.amount) || 0)
    if (amt <= 0) return

    let phases = activePayment.phases
    const paymentCap = getPaymentEffectiveCap(activePayment)
    if (phases.length === 0) {
      phases = buildInstallments(paymentCap, 1)
    }
    const paidBefore = getTotalPaidPhases(phases)
    const nextPhases = applySubsidyAmountToPhases(phases, amt)
    const paidAfter = getTotalPaidPhases(nextPhases)
    const applied = paidAfter - paidBefore
    if (applied <= 0) {
      toast({
        title: "Could not apply amount",
        description: "Create installments or raise phase caps so the subsidy can be allocated.",
        variant: "destructive",
      })
      return
    }
    if (paidAfter > paymentCap + 0.5) {
      toast({
        title: "Would exceed subtotal",
        description: "Reduce the cheque amount or adjust installments.",
        variant: "destructive",
      })
      return
    }
    if (applied < amt) {
      toast({
        title: "Partially applied",
        description: `₹${applied.toLocaleString("en-IN")} applied to installments (₹${(amt - applied).toLocaleString("en-IN")} unallocated — add installments or increase amounts).`,
      })
    }
    const newCheques = activePayment.subsidyCheques.map((c) =>
      c.id === chequeId ? { ...c, status: "cleared" as const, clearedAt: new Date().toISOString() } : c,
    )
    const updated = customerPayments.map((p) =>
      p.quotationId === activePayment.quotationId ? { ...p, phases: nextPhases, subsidyCheques: newCheques } : p,
    )
    setCustomerPayments(updated)
    persistSubsidyChequesForQuotation(activePayment.quotationId, newCheques)

    if (!useApi) {
      const p = updated.find((x) => x.quotationId === activePayment.quotationId)
      if (p) {
        const coerced = coercePhasesPaymentModes(p.phases)
        const phasesForStore = normalizePhaseAmountsForApi(coerced, getPaymentEffectiveCap(p))
        const totalPaid = getTotalPaidPhases(phasesForStore)
        const cap = getPaymentEffectiveCap(p)
        const paymentStatus: CustomerPayment["paymentStatus"] =
          totalPaid <= 0 ? "pending" : totalPaid >= cap ? "completed" : "partial"
        saveStoredPaymentPlan(activePayment.quotationId, {
          paymentType: p.paymentType,
          paymentMode: p.paymentMode || "cash",
          paymentStatus,
          phases: phasesForStore,
        })
      }
    }

    toast({
      title: "Cheque cleared",
      description: useApi
        ? "Amount added to installments. Click Submit to save to the server."
        : "Amount applied to installments and saved locally.",
    })
  }

  const submitFinalSettlement = async () => {
    if (!activePayment) return

    if (!isFinalSettlementEligible(activePayment)) {
      toast({
        title: "Settlement not available",
        description: "Final settlement is only for Cash and Cash + loan payments (not Loan-only).",
        variant: "destructive",
      })
      return
    }

    // Settlement amount = Remaining only (e.g. ₹2,000) — that becomes discount `d`.
    const settlementDiscount = Math.round(getDisplayRemaining(activePayment))
    if (settlementDiscount <= 0) {
      toast({
        title: "Nothing to settle",
        description: "There is no remaining balance to write off.",
        variant: "destructive",
      })
      return
    }
    if (isFinalSettlementApplied(activePayment)) {
      toast({
        title: "Already settled",
        description: "Final settlement has already been applied for this customer.",
        variant: "destructive",
      })
      return
    }

    if (
      !confirmSave(
        `Apply final settlement of ₹${settlementDiscount.toLocaleString("en-IN")} and save?`,
      )
    ) {
      return
    }

    const originalSubtotal = getPaymentOriginalSubtotal(activePayment)
    const currentDiscount = getPaymentDiscountAmount(activePayment)
    const newDiscount = currentDiscount + settlementDiscount
    const newEffectiveCap = Math.max(0, originalSubtotal - newDiscount)
    const totalPaid = getTotalPaidPhases(activePayment.phases)

    // Pricing: add only the settlement write-off to existing quotation discount.
    // Do not rewrite subtotal (that caused amount-after-subsidy errors).
    const existingPricingDiscount = getQuotationDiscountAmount(activePayment.quotation)
    const amountAfterSubsidy = getQuotationAmountAfterSubsidy(activePayment.quotation)
    const pricingDiscount = existingPricingDiscount + settlementDiscount
    const pricingFinalAmount = Math.max(0, amountAfterSubsidy - pricingDiscount)

    setIsSavingFinalSettlement(true)
    try {
      if (!useApi) {
        const allQuotations = JSON.parse(localStorage.getItem("quotations") || "[]")
        const updatedQuotations = allQuotations.map((q: Quotation) =>
          q.id === activePayment.quotationId
            ? ({
                ...q,
                discount: newDiscount,
                discountAmount: newDiscount,
                paymentStatus: "completed",
                remaining: 0,
                remainingAmount: 0,
                pricing: {
                  ...(q as Quotation & { pricing?: Record<string, unknown> }).pricing,
                  discountAmount: newDiscount,
                  amountAfterSubsidy,
                  totalAmount: Math.max(0, originalSubtotal - newDiscount),
                  finalAmount: Math.max(0, originalSubtotal - newDiscount),
                },
              } as Quotation)
            : q,
        )
        localStorage.setItem("quotations", JSON.stringify(updatedQuotations))
        setQuotations(
          updatedQuotations.filter((q: Quotation) => String(q.status || "").toLowerCase() === "approved"),
        )
        const coercedPhases = coercePhasesPaymentModes(activePayment.phases)
        saveStoredPaymentPlan(activePayment.quotationId, {
          paymentType: activePayment.paymentType,
          paymentMode: activePayment.paymentMode || "cash",
          paymentStatus: "completed",
          phases: normalizePhaseAmountsForApi(coercedPhases, newEffectiveCap),
        })
      } else {
        // Persist to DB. Throws if nothing saved server-side — we must NOT silently
        // fall back to localStorage when the API is on (button would reappear on refresh).
        try {
          await api.quotations.finalizeSettlement(activePayment.quotationId, {
            settlementAmount: settlementDiscount,
            discountAmount: pricingDiscount,
            finalAmount: pricingFinalAmount,
            paymentType: activePayment.paymentType,
            paymentMode: activePayment.paymentMode,
            phases: normalizePhaseAmountsForApi(
              coercePhasesPaymentModes(activePayment.phases),
              getPaymentEffectiveCap(activePayment),
            ),
          })
        } catch (settleError) {
          // The server may already consider the balance cleared — its amountAfterSubsidy
          // (e.g. 189,000) can be lower than the AM subtotal (190,000), so it reports
          // remaining 0 and rejects the write-off. That IS effectively settled: reconcile
          // the AM-side gap locally instead of failing.
          const msg = settleError instanceof ApiError ? String(settleError.message || "").toLowerCase() : ""
          const serverAlreadyCleared =
            msg.includes("cannot exceed remaining") ||
            msg.includes("remaining (0)") ||
            msg.includes("remaining 0") ||
            msg.includes("already settled") ||
            msg.includes("already completed") ||
            msg.includes("nothing to settle")
          if (!serverAlreadyCleared) throw settleError
        }

        // Re-fetch from server so the settled state (and hidden button) reflects the DB.
        // The database is the single source of truth — no local/cache/session storage.
        try {
          await loadApprovedQuotations()
        } catch {
          // Non-fatal: in-memory optimistic update below keeps the current view correct.
        }
      }

      // In-memory optimistic update only. The database is the source of truth
      // (loadApprovedQuotations above already re-fetched the settled state).
      setCustomerPayments((prev) =>
        prev.map((payment) =>
          payment.quotationId === activePayment.quotationId
            ? {
                ...payment,
                subtotal: newEffectiveCap,
                originalSubtotal,
                discountAmount: newDiscount,
                paymentStatus: "completed",
                remainingFromApi: 0,
                finalSettlementApplied: true,
                finalSettlementDiscount:
                  (Number(payment.finalSettlementDiscount) || 0) + settlementDiscount,
                quotation: {
                  ...payment.quotation,
                  discount: newDiscount,
                  discountAmount: newDiscount,
                  paymentStatus: "completed",
                } as Quotation,
              }
            : payment,
        ),
      )

      toast({
        title: "Final settlement applied",
        description: `Settlement discount d: ₹${settlementDiscount.toLocaleString("en-IN")} (paid ₹${Math.round(totalPaid).toLocaleString("en-IN")}). Remaining is now ₹0.`,
      })
      setInstallmentDialogOpen(false)
      setActivePaymentId(null)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to apply final settlement."
      // Database-only: NO local / cache / session fallback. If the server did not save it,
      // nothing is settled and the button stays visible so it can be retried.
      toast({
        title: "Settlement not saved",
        description: `Could not save to the database, so nothing was settled. ${message}`,
        variant: "destructive",
      })
    } finally {
      setIsSavingFinalSettlement(false)
    }
  }

  /** Undo mistaken final settlement / discount `d` — restores payable and remaining. */
  const revertFinalSettlement = async () => {
    if (!activePayment) return

    const currentDiscount = getPaymentDiscountAmount(activePayment)
    const settlementDiscount =
      Math.round(getSettlementDiscountAmount(activePayment)) || Math.round(currentDiscount)
    if (settlementDiscount <= 0 && currentDiscount <= 0) {
      toast({
        title: "Nothing to revert",
        description: "There is no settlement discount to remove.",
        variant: "destructive",
      })
      return
    }

    const amountToRevert = settlementDiscount > 0 ? settlementDiscount : currentDiscount
    const confirmed = window.confirm(
      `Revert settlement discount d of ₹${amountToRevert.toLocaleString("en-IN")}?\n\nThis was marked by mistake — the payable subtotal and remaining balance will be restored.`,
    )
    if (!confirmed) return

    const originalSubtotal = getPaymentOriginalSubtotal(activePayment)
    const newDiscount = Math.max(0, currentDiscount - amountToRevert)
    const newEffectiveCap = Math.max(0, originalSubtotal - newDiscount)
    const totalPaid = getTotalPaidPhases(activePayment.phases)
    const restoredRemaining = Math.max(0, newEffectiveCap - totalPaid)
    const restoredStatus: NonNullable<CustomerPayment["paymentStatus"]> =
      restoredRemaining <= 0 && totalPaid > 0
        ? "completed"
        : totalPaid > 0
          ? "partial"
          : "pending"

    const existingPricingDiscount = getQuotationDiscountAmount(activePayment.quotation)
    const amountAfterSubsidy = getQuotationAmountAfterSubsidy(activePayment.quotation)
    // Prefer subtracting from pricing discount; fall back to absolute newDiscount.
    const pricingDiscount = Math.max(
      0,
      Math.min(existingPricingDiscount, Math.max(0, existingPricingDiscount - amountToRevert)),
    )
    // If quotation discount tracked the full AM discount, use newDiscount instead.
    const pricingDiscountFinal =
      Math.abs(existingPricingDiscount - currentDiscount) < 1 ? newDiscount : pricingDiscount
    const pricingFinalAmount = Math.max(0, amountAfterSubsidy - pricingDiscountFinal)

    setIsRevertingFinalSettlement(true)
    try {
      if (!useApi) {
        const allQuotations = JSON.parse(localStorage.getItem("quotations") || "[]")
        const updatedQuotations = allQuotations.map((q: Quotation) =>
          q.id === activePayment.quotationId
            ? ({
                ...q,
                discount: newDiscount,
                discountAmount: newDiscount,
                paymentStatus: restoredStatus,
                remaining: restoredRemaining,
                remainingAmount: restoredRemaining,
                finalSettlementApplied: false,
                finalSettlementAmount: 0,
                final_settlement_applied: false,
                final_settlement_amount: 0,
                pricing: {
                  ...(q as Quotation & { pricing?: Record<string, unknown> }).pricing,
                  discountAmount: newDiscount,
                  amountAfterSubsidy,
                  totalAmount: newEffectiveCap,
                  finalAmount: newEffectiveCap,
                  finalSettlementApplied: false,
                  finalSettlementAmount: 0,
                },
              } as Quotation)
            : q,
        )
        localStorage.setItem("quotations", JSON.stringify(updatedQuotations))
        setQuotations(
          updatedQuotations.filter((q: Quotation) => String(q.status || "").toLowerCase() === "approved"),
        )
        const coercedPhases = coercePhasesPaymentModes(activePayment.phases)
        saveStoredPaymentPlan(activePayment.quotationId, {
          paymentType: activePayment.paymentType,
          paymentMode: activePayment.paymentMode || "cash",
          paymentStatus: restoredStatus,
          phases: normalizePhaseAmountsForApi(coercedPhases, newEffectiveCap),
        })
      } else {
        await api.quotations.revertSettlement(activePayment.quotationId, {
          settlementAmount: amountToRevert,
          discountAmount: pricingDiscountFinal,
          finalAmount: pricingFinalAmount,
          remaining: restoredRemaining,
          paymentStatus: restoredStatus,
          paymentType: activePayment.paymentType,
          paymentMode: activePayment.paymentMode,
        })
        try {
          await loadApprovedQuotations()
        } catch {
          // Non-fatal — optimistic update below.
        }
      }

      setCustomerPayments((prev) =>
        prev.map((payment) =>
          payment.quotationId === activePayment.quotationId
            ? {
                ...payment,
                subtotal: newEffectiveCap,
                originalSubtotal,
                discountAmount: newDiscount,
                paymentStatus: restoredStatus,
                remainingFromApi: restoredRemaining,
                finalSettlementApplied: false,
                finalSettlementDiscount: 0,
                quotation: {
                  ...payment.quotation,
                  discount: newDiscount,
                  discountAmount: newDiscount,
                  paymentStatus: restoredStatus,
                  finalSettlementApplied: false,
                  finalSettlementAmount: 0,
                  final_settlement_applied: false,
                  final_settlement_amount: 0,
                } as Quotation,
              }
            : payment,
        ),
      )

      toast({
        title: "Settlement reverted",
        description: `Removed discount d: ₹${amountToRevert.toLocaleString("en-IN")}. Remaining is now ₹${Math.round(restoredRemaining).toLocaleString("en-IN")}.`,
      })
      setInstallmentDialogOpen(false)
      setActivePaymentId(null)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to revert settlement."
      toast({
        title: "Revert not saved",
        description: `Could not save to the database. ${message}`,
        variant: "destructive",
      })
    } finally {
      setIsRevertingFinalSettlement(false)
    }
  }

  const applyFullPaymentSingleInstallment = (quotationId: string) => {
    const payment = customerPayments.find((p) => p.quotationId === quotationId)
    if (!payment) return
    if (getDisplayRemaining(payment) <= 0 && getEffectivePaymentStatus(payment) === "completed") {
      toast({
        title: "Payment already completed",
        description: "No remaining balance to record.",
      })
      return
    }
    const cap = Math.round(getPaymentEffectiveCap(payment))
    if (cap <= 0) {
      toast({
        title: "Cannot record payment",
        description: "Subtotal is zero after discount.",
        variant: "destructive",
      })
      return
    }
    const hasExisting = payment.phases.length > 0
    const confirmMessage = hasExisting
      ? `Replace ${payment.phases.length} installment(s) with one full payment of ₹${cap.toLocaleString("en-IN")}?`
      : `Record full payment of ₹${cap.toLocaleString("en-IN")} in a single installment?`
    if (!confirmSave(confirmMessage)) return

    const phases = buildFullPaymentSingleInstallment(payment, true)
    setCustomerPayments((prev) =>
      prev.map((p) => (p.quotationId === quotationId ? { ...p, phases } : p)),
    )
    toast({
      title: "Full payment in 1 installment",
      description: "Marked Installment 1 as fully paid. Click Submit to save.",
    })
  }

  const applySingleInstallmentPlan = (quotationId: string) => {
    const payment = customerPayments.find((p) => p.quotationId === quotationId)
    if (!payment) return
    const cap = Math.round(getPaymentEffectiveCap(payment))
    if (cap <= 0) return
    if (payment.phases.length > 0) {
      if (!confirmSave(`Replace current installments with one installment of ₹${cap.toLocaleString("en-IN")}?`)) {
        return
      }
    }
    const phases = buildFullPaymentSingleInstallment(payment, false)
    setCustomerPayments((prev) =>
      prev.map((p) => (p.quotationId === quotationId ? { ...p, phases } : p)),
    )
    toast({
      title: "Single installment created",
      description: "Enter paid amount or use Pay full in 1 installment.",
    })
  }

  const submitInstallments = async () => {
    if (!activePayment) return

    // Use draft Cost of site if user typed but didn't blur yet.
    const draftRaw = siteCostDrafts[activePayment.quotationId]
    const resolvedSiteCost =
      draftRaw !== undefined
        ? parseSiteCostInput(draftRaw)
        : Math.max(0, Math.round(Number(activePayment.siteCost) || 0))

    if (draftRaw !== undefined) {
      setCustomerPayments((prev) =>
        prev.map((p) =>
          p.quotationId === activePayment.quotationId
            ? { ...p, siteCost: resolvedSiteCost > 0 ? resolvedSiteCost : undefined }
            : p,
        ),
      )
      setSiteCostDrafts((prev) => {
        const next = { ...prev }
        delete next[activePayment.quotationId]
        return next
      })
    }

    const totalPaid = getTotalPaidPhases(activePayment.phases)
    const paymentCap = getPaymentEffectiveCap(activePayment)
    if (totalPaid > paymentCap + 0.5) {
      toast({
        title: "Cannot save",
        description: `Total paid (₹${Math.round(totalPaid).toLocaleString("en-IN")}) cannot exceed subtotal (₹${Math.round(paymentCap).toLocaleString("en-IN")}).`,
        variant: "destructive",
      })
      return
    }
    if (!confirmSave("Save installment / payment details?")) return
    const paymentStatus: CustomerPayment["paymentStatus"] =
      totalPaid <= 0
        ? "pending"
        : totalPaid >= paymentCap
          ? "completed"
          : "partial"
    const coercedPhases = coercePhasesPaymentModes(activePayment.phases)
    const phasesForApi = normalizePhaseAmountsForApi(coercedPhases, paymentCap)
    const paymentModeFromPhases =
      phasesForApi.map((p) => normalizePaymentMode(p.paymentMode)).find(Boolean) ||
      normalizePaymentMode(activePayment.paymentMode) ||
      "cash"

    const payload = {
      paymentType: activePayment.paymentType,
      paymentMode: paymentModeFromPhases,
      paymentStatus: paymentStatus || "pending",
      replaceInstallments: true,
      siteCost: resolvedSiteCost,
      site_cost: resolvedSiteCost,
      ...(activePayment.subsidyCheques?.length
        ? { subsidyCheques: activePayment.subsidyCheques }
        : {}),
      phases: phasesForApi.map((phase) => {
        const modeNorm = normalizePaymentMode(phase.paymentMode)
        const needsMode =
          (Number(phase.paidAmount) || 0) > 0 ||
          phase.status === "partial" ||
          phase.status === "completed"
        return {
          phaseNumber: phase.phaseNumber,
          phaseName: phase.phaseName,
          amount: Number(phase.amount) || 0,
          paidAmount: Number(phase.paidAmount) || 0,
          status: phase.status,
          dueDate: phase.dueDate || undefined,
          paymentDate: phase.paymentDate || undefined,
          paymentMode: modeNorm || (needsMode ? paymentModeFromPhases : undefined),
          transactionId: phase.transactionId || undefined,
          note: phase.note?.trim() || undefined,
        }
      }),
    }

    setIsSavingInstallments(true)
    try {
      let phasesToApply = payload.phases as PaymentPhase[]

      if (!useApi) {
        saveStoredPaymentPlan(activePayment.quotationId, payload)
        persistSiteCostForQuotation(activePayment.quotationId, resolvedSiteCost)
      } else {
        const response = await api.quotations.updatePaymentDetails(activePayment.quotationId, payload)
        const phasesFromResponse = extractPhasesFromPaymentUpdateResponse(response)
        phasesToApply = phasesFromResponse ?? phasesToApply
        if (resolvedSiteCost > 0) {
          siteCostSessionRef.current[activePayment.quotationId] = resolvedSiteCost
        } else {
          delete siteCostSessionRef.current[activePayment.quotationId]
        }
        persistSiteCostForQuotation(activePayment.quotationId, resolvedSiteCost)
        await loadApprovedQuotations()
        setQuotations((prev) =>
          prev.map((q) =>
            q.id === activePayment.quotationId
              ? ({
                  ...q,
                  installments: phasesToApply,
                  paymentPhases: phasesToApply,
                  paymentStatus: payload.paymentStatus,
                  paymentMode: payload.paymentMode,
                  siteCost: resolvedSiteCost,
                  site_cost: resolvedSiteCost,
                } as Quotation)
              : q,
          ),
        )
      }

      setCustomerPayments((prev) =>
        prev.map((payment) =>
          payment.quotationId === activePayment.quotationId
            ? {
                ...payment,
                paymentType: payload.paymentType,
                paymentMode: payload.paymentMode,
                paymentStatus: payload.paymentStatus,
                phases: phasesToApply,
                siteCost: resolvedSiteCost > 0 ? resolvedSiteCost : undefined,
              }
            : payment,
        ),
      )

      persistSubsidyChequesForQuotation(activePayment.quotationId, activePayment.subsidyCheques || [])

      toast({
        title: "Payment details saved",
        description: "Installments, cost of site, and profit updated successfully.",
      })
      setInstallmentDialogOpen(false)
      setActivePaymentId(null)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to save payment details."
      toast({
        title: "Save failed",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsSavingInstallments(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    toast({
      title: "Logged Out",
      description: "You have been successfully logged out",
    })
    // Clear any cached data
    setQuotations([])
    setSearchTerm("")
    setSelectedQuotation(null)
    // Navigate to landing page
    router.push("/")
    router.refresh()
  }

  const handleReleaseToInstaller = async (quotation: Quotation) => {
    if (!quotation?.id) return
    if (isQuotationSentToInstaller(quotation as unknown as Record<string, unknown>, readInstallerReleaseMap())) {
      toast({
        title: "Already sent",
        description: "This quotation is already visible in installer dashboard.",
      })
      return
    }

    if (
      !confirmSave(
        `Send ${quotation.id} to Installation?\n\nIt will appear under Pending Installation.`,
      )
    ) {
      return
    }

    const releasedAt = new Date().toISOString()
    setReleasingInstallationId(quotation.id)
    const applyReleaseLocally = () => {
      setQuotations((prev) =>
        prev.map((q) =>
          q.id === quotation.id
            ? {
                ...q,
                installationReadyForInstaller: true,
                installationReleasedAt: releasedAt,
                installationStatus: "pending_installer",
                installation_status: "pending_installer",
              }
            : q,
        ),
      )
      setCustomerPayments((prev) =>
        prev.map((payment) =>
          payment.quotationId === quotation.id
            ? {
                ...payment,
                quotation: {
                  ...payment.quotation,
                  installationReadyForInstaller: true,
                  installationReleasedAt: releasedAt,
                  installationStatus: "pending_installer",
                  installation_status: "pending_installer",
                },
              }
            : payment,
        ),
      )

      // Keep local fallback in sync so installer dashboard reflects immediately when API is disabled.
      try {
        const localAll = JSON.parse(localStorage.getItem("quotations") || "[]")
        const next = Array.isArray(localAll)
          ? localAll.map((q: any) =>
              q?.id === quotation.id
                ? {
                    ...q,
                    installationReadyForInstaller: true,
                    installationReleasedAt: releasedAt,
                    installationStatus: "pending_installer",
                    installation_status: "pending_installer",
                  }
                : q,
            )
          : localAll
        localStorage.setItem("quotations", JSON.stringify(next))
      } catch {
        // no-op
      }
      try {
        const current = JSON.parse(localStorage.getItem(INSTALLER_RELEASE_MAP_KEY) || "{}")
        const next = {
          ...(current && typeof current === "object" ? current : {}),
          [quotation.id]: {
            installationReadyForInstaller: true,
            installationReleasedAt: releasedAt,
          },
        }
        localStorage.setItem(INSTALLER_RELEASE_MAP_KEY, JSON.stringify(next))
      } catch {
        // no-op
      }
    }
    try {
      if (useApi) {
        await api.quotations.releaseForInstallation(quotation.id, {
          installationReadyForInstaller: true,
          installationReleasedAt: releasedAt,
          installationStatus: "pending_installer",
          installation_status: "pending_installer",
        } as any)
      }
      applyReleaseLocally()

      toast({
        title: "Sent to installer",
        description: "Quotation is now in Installation → Pending Installation.",
      })
    } catch (error) {
      const errorText = (error instanceof ApiError ? error.message : String(error || "")).toLowerCase()
      const permissionDenied =
        (error instanceof ApiError && (error.code === "AUTH_004" || error.code === "HTTP_403")) ||
        errorText.includes("insufficient permissions") ||
        errorText.includes("forbidden") ||
        errorText.includes("not authorized")

      if (permissionDenied) {
        // In API mode, local-only marking causes false success across users/devices.
        // Keep local fallback only when API is disabled.
        if (!useApi) {
          applyReleaseLocally()
          toast({
            title: "Sent to installer",
            description: "Marked successfully.",
          })
        } else {
          toast({
            title: "Send failed",
            description:
              "Backend denied this action (403). Please grant Account Management permission for installation release endpoint so installer dashboard can see it for all users.",
            variant: "destructive",
          })
        }
        return
      }

      const message = error instanceof ApiError ? error.message : "Could not send quotation to installer."
      toast({
        title: "Send failed",
        description: message,
        variant: "destructive",
      })
    } finally {
      setReleasingInstallationId(null)
    }
  }

  const handleRetrieveFromInstallation = async (quotation: Quotation) => {
    if (!quotation?.id) return
    const releaseMap = readInstallerReleaseMap()
    const retrieveState = getRetrieveFromInstallationState(
      quotation as unknown as Record<string, unknown>,
      releaseMap,
    )
    if (!retrieveState.enabled) {
      toast({
        title: "Cannot retrieve",
        description:
          retrieveState.hint || "This quotation is already in Metering and cannot be pulled back from Installation.",
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

    setRetrievingInstallationId(quotation.id)
    const applyRetrieveLocally = () => {
      setQuotations((prev) =>
        prev.map((q) =>
          q.id === quotation.id
            ? {
                ...q,
                installationReadyForInstaller: false,
                installation_ready_for_installer: false,
                installationReleasedAt: undefined,
                installation_released_at: undefined,
                installationStatus: undefined,
                installation_status: undefined,
              }
            : q,
        ),
      )
      setCustomerPayments((prev) =>
        prev.map((payment) =>
          payment.quotationId === quotation.id
            ? {
                ...payment,
                quotation: {
                  ...payment.quotation,
                  installationReadyForInstaller: false,
                  installation_ready_for_installer: false,
                  installationReleasedAt: undefined,
                  installation_released_at: undefined,
                  installationStatus: undefined,
                  installation_status: undefined,
                },
              }
            : payment,
        ),
      )
      clearInstallerReleaseInLocalMap(quotation.id)
      try {
        const localAll = JSON.parse(localStorage.getItem("quotations") || "[]")
        const next = Array.isArray(localAll)
          ? localAll.map((q: any) =>
              q?.id === quotation.id
                ? {
                    ...q,
                    installationReadyForInstaller: false,
                    installation_ready_for_installer: false,
                    installationReleasedAt: undefined,
                    installation_released_at: undefined,
                    installationStatus: undefined,
                    installation_status: undefined,
                  }
                : q,
            )
          : localAll
        localStorage.setItem("quotations", JSON.stringify(next))
      } catch {
        // no-op
      }
    }

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
      applyRetrieveLocally()
      toast({
        title: "Reverted from Installation",
        description: "You can Send to Installer again when ready.",
      })
    } catch (error) {
      toast({
        title: "Retrieve failed",
        description: error instanceof ApiError ? error.message : "Could not retrieve from Installation.",
        variant: "destructive",
      })
    } finally {
      setRetrievingInstallationId(null)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AccessSwitchBar current="accounts" title="Accounts" />
      {getAccessOptions(access).length <= 1 ? (
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 shadow-sm">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {(role === "admin" || dealer?.username === "admin") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/dashboard/admin")}
                  className="gap-2 text-muted-foreground hover:text-foreground px-2 sm:px-3 shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Back to Admin</span>
                </Button>
              )}
              <button onClick={() => router.push("/dashboard/account-management")} className="flex items-center">
                <SolarLogo size="md" />
              </button>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {accountManager && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary/5 border border-primary/20">
                  <User className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground hidden sm:inline">
                    {accountDisplayName}
                  </span>
                  <span className="text-sm font-semibold text-foreground sm:hidden">
                    {accountDisplayName
                      .split(" ")
                      .filter(Boolean)
                      .map((part) => part.charAt(0))
                      .slice(0, 2)
                      .join("") || "AM"}
                  </span>
                  {accountManager.username && (
                    <span className="hidden lg:inline text-xs text-muted-foreground">
                      ({accountManager.username})
                    </span>
                  )}
                </div>
              )}
              <span className="text-sm font-medium text-muted-foreground hidden lg:inline">Account Management</span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleLogout} 
                className="gap-2 border-border hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors shrink-0 font-medium px-2 sm:px-3"
                title="Logout from Account Management"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </header>
      ) : null}

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-5">
        <div className="mb-5">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                Account Management
                {accountManager && (
                  <span className="text-sm font-normal text-muted-foreground ml-1.5">
                    - Welcome, {accountDisplayName}!
                  </span>
                )}
              </h1>
              <p className="text-sm text-muted-foreground">Approved quotations from admin panel - ready for processing</p>
            </div>
          </div>
        </div>

        {/* Tabbed Interface */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="mb-3 w-full">
            <TabsList className="h-auto w-full justify-start bg-muted/40 p-1 gap-1 flex-wrap rounded-lg">
              <TabsTrigger value="payments" className="gap-1.5 text-xs px-3 py-1.5 data-[state=active]:shadow-sm">
                <Wallet className="w-4 h-4" />
                Payment Management
              </TabsTrigger>
              <TabsTrigger value="approved" className="gap-1.5 text-xs px-3 py-1.5 data-[state=active]:shadow-sm">
                <FileText className="w-4 h-4" />
                Approved Quotations
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Approved Quotations Tab */}
          <TabsContent value="approved" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Approved Quotations</CardTitle>
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-green-500" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{quotations.length}</div>
                  <p className="text-xs text-muted-foreground mt-1">Total approved</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Value</CardTitle>
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <IndianRupee className="w-5 h-5 text-amber-500" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">₹{(totalApprovedValue / 100000).toFixed(1)}L</div>
                  <p className="text-xs text-muted-foreground mt-1">Approved quotation value</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Last Updated</CardTitle>
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <CalendarIcon className="w-5 h-5 text-blue-500" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-sm font-bold">
                    {quotations.length > 0 
                      ? new Date(quotations[0]?.createdAt || Date.now()).toLocaleDateString("en-IN")
                      : "N/A"}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Most recent approval</p>
                </CardContent>
              </Card>
            </div>

            {/* Approved Quotations Table */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg">Approved Quotations</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">Only quotations approved by admin are visible here</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <div className="relative w-full sm:w-72">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name, mobile, ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 h-10"
                      />
                    </div>
                    <CityMultiSelectFilter
                      value={filterCities}
                      onChange={setFilterCities}
                      className="w-full sm:w-48"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 animate-pulse">
                      <FileText className="w-8 h-8 text-primary opacity-50" />
                    </div>
                    <p className="font-medium text-foreground">Loading approved quotations...</p>
                    <p className="text-sm mt-1">Fetching only approved quotations from admin panel</p>
                  </div>
                ) : sortedQuotations.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                      <FileText className="w-8 h-8 opacity-50" />
                    </div>
                    <p className="font-medium">No approved quotations</p>
                    <p className="text-sm mt-1">Only quotations approved by admin will appear here</p>
                    <p className="text-xs mt-2 text-muted-foreground/80">Waiting for admin approval...</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Quotation ID
                          </th>
                          <th className="text-left py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Customer Information
                          </th>
                          <th className="text-left py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">
                            Dealer/Admin
                          </th>
                          <th className="text-left py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                            System
                          </th>
                          <th className="text-right py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Amount
                          </th>
                          <th className="text-left py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Status
                          </th>
                          <th className="text-right py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                            Approved Date
                          </th>
                          <th className="text-right py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedQuotations.map((quotation) => (
                          <tr
                            key={quotation.id}
                            className="border-b border-border last:border-0 hover:bg-green-50 dark:hover:bg-green-950/20 transition-colors bg-green-50/50 dark:bg-green-950/10"
                          >
                            <td className="py-4 px-3 text-sm font-mono text-muted-foreground font-semibold">
                              <div className="flex flex-col gap-1">
                                <span>{quotation.id || "N/A"}</span>
                                {(accountOlderCountById.get(quotation.id) || 0) > 0 ? (
                                  <Badge variant="outline" className="w-fit text-[10px]">
                                    {accountOlderCountById.get(quotation.id)} older
                                  </Badge>
                                ) : null}
                              </div>
                            </td>
                            <td className="py-4 px-3">
                              <div>
                                <p className="text-sm font-semibold text-foreground">
                                  {formatPersonName(quotation.customer?.firstName, quotation.customer?.lastName, "Unknown")}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">{quotation.customer?.mobile || "No mobile"}</p>
                                {quotation.customer?.email && (
                                  <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{quotation.customer.email}</p>
                                )}
                              </div>
                            </td>
                            <td className="py-4 px-3 text-sm hidden lg:table-cell">
                              {quotation.dealer ? (
                                <div>
                                  <p className="text-sm font-medium text-foreground">
                                    {formatPersonName(quotation.dealer.firstName, quotation.dealer.lastName, "Unknown")}
                                  </p>
                                  <Badge 
                                    variant="outline" 
                                    className={`text-xs mt-1 ${
                                      quotation.dealer.role === "admin" 
                                        ? "border-purple-500 text-purple-700 dark:text-purple-400" 
                                        : "border-blue-500 text-blue-700 dark:text-blue-400"
                                    }`}
                                  >
                                    {quotation.dealer.role === "admin" ? "Admin" : "Dealer"}
                                  </Badge>
                                  <p className="text-xs text-muted-foreground mt-1 truncate max-w-xs">
                                    {quotation.dealer.email}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">N/A</span>
                              )}
                            </td>
                            <td className="py-4 px-3 text-sm hidden sm:table-cell">
                              <span className="px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium uppercase">
                                {getSystemSize(quotation)}
                              </span>
                            </td>
                            <td className="py-4 px-3 text-sm text-right font-semibold text-foreground">
                              ₹{Math.abs(
                                quotation.pricing?.subtotal ??
                                  quotation.subtotal ??
                                  quotation.totalAmount ??
                                  quotation.finalAmount ??
                                  0,
                              ).toLocaleString()}
                            </td>
                            <td className="py-4 px-3 text-sm">
                              <Badge className="text-xs bg-green-600 text-white">
                                Approved
                              </Badge>
                            </td>
                            <td className="py-4 px-3 text-sm text-right text-muted-foreground hidden md:table-cell">
                              {new Date(quotation.createdAt).toLocaleDateString("en-IN")}
                            </td>
                            <td className="py-4 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => {
                                    setSelectedQuotation(quotation)
                                    setDialogOpen(true)
                                  }}
                                  className="h-8 w-8 p-0 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
                                  title="View Details"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payment Management Tab */}
          <TabsContent value="payments" className="space-y-4">
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 shrink-0">
                    <CardTitle className="text-base">Payment Management</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      Installments, subsidy cheques (cash / cash + loan), and balances
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap lg:justify-end w-full lg:w-auto min-w-0">
                    <div className="relative w-full sm:w-56 min-w-0">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search by customer name, mobile..."
                        value={paymentSearchTerm}
                        onChange={(e) => setPaymentSearchTerm(e.target.value)}
                        className="pl-8 h-9 text-sm"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 w-full sm:w-auto"
                      onClick={() => setPaymentFiltersOpen(true)}
                    >
                      <Filter className="w-3.5 h-3.5" />
                      Filters
                      {(() => {
                        const activeCount =
                          (paymentTypeFilter.length > 0 ? 1 : 0) +
                          (paymentStatusFilter !== "all" ? 1 : 0) +
                          (paymentInstallmentFilter !== "all" ? 1 : 0) +
                          (fileStatusFilter !== "all" ? 1 : 0) +
                          (sendToInstallationFilter !== "all" ? 1 : 0) +
                          (paymentDealerFilter !== "all" ? 1 : 0) +
                          (approveDateRange?.from || approveDateRange?.to ? 1 : 0)
                        return activeCount > 0 ? (
                          <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">
                            {activeCount}
                          </Badge>
                        ) : null
                      })()}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 w-full sm:w-auto"
                      onClick={downloadFilteredPaymentsExcel}
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Excel
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 px-2 sm:px-6 space-y-3">
                <Tabs
                  value={paymentSectionTab}
                  onValueChange={(value) => setPaymentSectionTab(value as PaymentSectionTab)}
                  className="space-y-3"
                >
                  <TabsList className="h-auto w-full justify-start bg-muted/40 p-1 gap-1 flex-wrap">
                    <TabsTrigger
                      value="active"
                      className="gap-1.5 text-xs px-3 py-1.5 data-[state=active]:shadow-sm"
                    >
                      Pending & Partial
                      <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">
                        {paymentSectionBuckets.activePayments.length}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger
                      value="overdue"
                      className="gap-1.5 text-xs px-3 py-1.5 data-[state=active]:shadow-sm"
                    >
                      Outstanding 30+ days
                      <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">
                        {paymentSectionBuckets.overduePayments.length}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger
                      value="completed"
                      className="gap-1.5 text-xs px-3 py-1.5 data-[state=active]:shadow-sm"
                    >
                      Completed
                      <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">
                        {paymentSectionBuckets.completedPayments.length}
                      </Badge>
                    </TabsTrigger>
                  </TabsList>
                  <p className="text-[11px] text-muted-foreground px-0.5">
                    {paymentSectionTab === "completed"
                      ? "Fully paid files — installments complete or final settlement applied."
                      : paymentSectionTab === "overdue"
                        ? "Pending or partial with remaining balance · no due date, payment, or approve activity in the last 30 days."
                        : "All pending and partial payments — not limited to the last 30 days."}
                  </p>
                </Tabs>
                {!isLoading && customerPayments.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                    <Card className="border-border/60 bg-card shadow-sm">
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <IndianRupee className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground/70">Total Amount</p>
                          <p className="text-xl font-bold text-foreground truncate">
                            ₹{paymentDashboardStats.totalAmount.toLocaleString()}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Sum of subtotals (net of settlement)</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-border/60 bg-card shadow-sm">
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                          <Clock className="w-5 h-5 text-amber-700" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground/70">Pending Amount</p>
                          <p className="text-xl font-bold text-primary truncate">
                            ₹{paymentDashboardStats.pendingAmount.toLocaleString()}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Sum of remaining</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card
                      className={cn(
                        "border-border/60 bg-card shadow-sm cursor-pointer transition-colors hover:border-emerald-400/80",
                        fileStatusFilter === "installation:completed" && "border-emerald-500 ring-1 ring-emerald-500/30",
                      )}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setFileStatusFilter((prev) =>
                          prev === "installation:completed" ? "all" : "installation:completed",
                        )
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          setFileStatusFilter((prev) =>
                            prev === "installation:completed" ? "all" : "installation:completed",
                          )
                        }
                      }}
                    >
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground/70">Installation completed</p>
                          <p className="text-xl font-bold text-emerald-700 truncate">
                            ₹{paymentDashboardStats.installationCompletedRemaining.toLocaleString()}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Remaining · {paymentDashboardStats.installationCompletedCount.toLocaleString()}{" "}
                            {paymentDashboardStats.installationCompletedCount === 1 ? "customer" : "customers"}
                            {fileStatusFilter === "installation:completed" ? " · filter on" : " · click to filter"}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-border/60 bg-card shadow-sm">
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                          <IndianRupee className="w-5 h-5 text-emerald-700" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground/70">Total Profit</p>
                          <p
                            className={`text-xl font-bold truncate ${
                              paymentDashboardStats.totalProfit >= 0
                                ? "text-emerald-700"
                                : "text-red-700"
                            }`}
                          >
                            ₹{paymentDashboardStats.totalProfit.toLocaleString()}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Sum of (subtotal − cost of site); 0 if cost unset
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-border/60 bg-card shadow-sm">
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
                          <Users className="w-5 h-5 text-sky-700" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground/70">No. of Customers</p>
                          <p className="text-xl font-bold text-foreground">
                            {paymentDashboardStats.customerCount.toLocaleString()}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Matching current section & filters</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
                {isLoading ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 animate-pulse">
                      <Wallet className="w-8 h-8 text-primary opacity-50" />
                    </div>
                    <p className="font-medium text-foreground">Loading payment data...</p>
                  </div>
                ) : customerPayments.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                      <Wallet className="w-8 h-8 opacity-50" />
                    </div>
                    <p className="font-medium">No payment data available</p>
                    <p className="text-sm mt-1">Approved quotations will appear here for payment management</p>
                  </div>
                ) : (
                  <div className="native-scroll-list max-h-[min(70vh,820px)] space-y-2.5 overflow-y-auto overscroll-y-contain pr-1">
                    {displayedCustomerPayments.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-md">
                        {paymentSectionTab === "completed"
                          ? "No completed payments match current filters."
                          : paymentSectionTab === "overdue"
                            ? "No outstanding payments older than 30 days match current filters."
                            : "No pending or partial payments match current filters."}
                      </div>
                    ) : (
                      visibleCustomerPayments.map((payment) => {
                        const paidAmount = getTotalPaidPhases(payment.phases)
                        const remainingAmount = getDisplayRemaining(payment)
                        const effectiveStatus = getEffectivePaymentStatus(payment)
                        const isZeroPaid = paidAmount <= 0 && remainingAmount > 0
                        const isCompletedPayment = effectiveStatus === "completed"
                        const isPartialPayment = effectiveStatus === "partial"
                        const paymentType = getPaymentTypeValue(payment)
                        const statusLabel =
                          effectiveStatus === "completed"
                            ? "Completed"
                            : effectiveStatus === "partial"
                              ? "Partial"
                              : "Pending"
                        const sentToInstaller = isQuotationSentToInstaller(
                          payment.quotation as unknown as Record<string, unknown>,
                          readInstallerReleaseMap(),
                        )
                        const revertFromInstallation = getRetrieveFromInstallationState(
                          payment.quotation as unknown as Record<string, unknown>,
                          readInstallerReleaseMap(),
                        )

                        return (
                          <Card
                            key={payment.quotationId}
                            className={cn(
                              "shadow-none px-3 py-2.5 border border-border/70 border-l-4 overflow-hidden",
                              isCompletedPayment
                                ? "border-l-emerald-500 bg-card"
                                : isPartialPayment
                                  ? "border-l-amber-500 bg-card"
                                  : isZeroPaid
                                    ? "border-l-rose-500 bg-card"
                                    : "border-l-border bg-card",
                            )}
                          >
                            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-[minmax(10rem,1.15fr)_minmax(4.25rem,0.55fr)_minmax(4.25rem,0.55fr)_minmax(4.75rem,0.6fr)_minmax(5.25rem,0.65fr)_minmax(5.75rem,0.7fr)_minmax(9rem,auto)_minmax(6rem,auto)_minmax(4.25rem,0.5fr)_minmax(4.25rem,0.5fr)_minmax(6.75rem,7.25rem)] gap-x-2 gap-y-2 items-center">
                              <div className="col-span-2 sm:col-span-3 xl:col-span-1 min-w-0">
                                <p className="text-sm font-semibold leading-tight break-words">
                                  {payment.customerName}
                                  <span className="font-normal text-muted-foreground">
                                    {" "}
                                    ({payment.customerMobile || "N/A"})
                                  </span>
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5 break-words">
                                  Dealer: {payment.dealerName || "Unassigned"} •{" "}
                                  {payment.dealerMobile || "No contact"}
                                </p>
                              </div>

                              <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Subtotal</p>
                                {getPaymentDiscountAmount(payment) > 0 ? (
                                  <>
                                    <p className="text-xs line-through text-muted-foreground">
                                      ₹{getPaymentOriginalSubtotal(payment).toLocaleString()}
                                    </p>
                                    <p className="text-sm font-semibold tabular-nums">
                                      ₹{getPaymentEffectiveCap(payment).toLocaleString()}
                                    </p>
                                  </>
                                ) : (
                                  <p className="text-sm font-semibold tabular-nums">
                                    ₹{getPaymentOriginalSubtotal(payment).toLocaleString()}
                                  </p>
                                )}
                              </div>

                              <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Paid</p>
                                {payment.phases.length > 0 ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <p
                                      className={cn(
                                        "text-sm font-semibold tabular-nums cursor-help underline decoration-dotted underline-offset-2 inline-block",
                                        paidAmount <= 0 ? "text-rose-700" : "text-foreground",
                                      )}
                                    >
                                      ₹{paidAmount.toLocaleString()}
                                    </p>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-[300px]">
                                    <div className="space-y-1.5">
                                      <p className="font-semibold">Breakdown</p>
                                      {payment.phases
                                        .slice()
                                        .sort((a, b) => a.phaseNumber - b.phaseNumber)
                                        .map((phase) => (
                                          <p key={`${payment.quotationId}-${phase.phaseNumber}`}>
                                            {formatInstallmentShortLabel(phase).toLowerCase()}
                                            {phase.paymentMode
                                              ? ` (${String(phase.paymentMode)})`
                                              : ""}
                                            : ₹
                                            {Math.round(phase.paidAmount || 0).toLocaleString("en-IN")}
                                          </p>
                                        ))}
                                      {paymentType === "mix" ? (
                                        <div className="border-t border-border/40 pt-1.5 mt-1 space-y-0.5">
                                          <p>
                                            Loan paid: ₹
                                            {getTotalPaidForSide(payment.phases, "loan").toLocaleString("en-IN")}
                                          </p>
                                          <p>
                                            Cash paid: ₹
                                            {getTotalPaidForSide(payment.phases, "cash").toLocaleString("en-IN")}
                                          </p>
                                        </div>
                                      ) : null}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                                ) : (
                                  <p
                                    className={cn(
                                      "text-sm font-semibold tabular-nums inline-block",
                                      paidAmount <= 0 ? "text-rose-700" : "text-foreground",
                                    )}
                                  >
                                    ₹{paidAmount.toLocaleString()}
                                  </p>
                                )}
                                {paymentType === "mix" ? (
                                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                                    L ₹{getTotalPaidForSide(payment.phases, "loan").toLocaleString("en-IN")}
                                    {" · "}
                                    C ₹{getTotalPaidForSide(payment.phases, "cash").toLocaleString("en-IN")}
                                  </p>
                                ) : null}
                              </div>

                              <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Remaining</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <p
                                      className={cn(
                                        "text-sm font-semibold tabular-nums cursor-help underline decoration-dotted underline-offset-2 inline-block",
                                        remainingAmount <= 0 ? "text-emerald-700" : "text-amber-700",
                                      )}
                                    >
                                      ₹{Math.max(remainingAmount, 0).toLocaleString()}
                                    </p>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-[300px]">
                                    <div className="space-y-1.5">
                                      <p className="font-semibold">Breakdown</p>
                                      {paymentType === "mix" ? (
                                        <>
                                          <p>
                                            Loan remaining: ₹
                                            {getRemainingForSide(payment, "loan").toLocaleString("en-IN")}
                                          </p>
                                          <p>
                                            Cash remaining: ₹
                                            {getRemainingForSide(payment, "cash").toLocaleString("en-IN")}
                                          </p>
                                        </>
                                      ) : (
                                        <p>
                                          Remaining: ₹
                                          {Math.max(remainingAmount, 0).toLocaleString("en-IN")}
                                        </p>
                                      )}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                                {paymentType === "mix" ? (
                                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                                    L ₹{getRemainingForSide(payment, "loan").toLocaleString("en-IN")}
                                    {" · "}
                                    C ₹{getRemainingForSide(payment, "cash").toLocaleString("en-IN")}
                                  </p>
                                ) : null}
                              </div>

                              <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Approve date</p>
                                <p className="text-xs font-medium leading-snug">
                                  {formatAdminDate(payment.statusApprovedAt)}
                                </p>
                              </div>

                              <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Payment</p>
                                <p className="text-sm font-semibold leading-tight">
                                  {getPaymentTypeLabel(payment.paymentType || payment.paymentMode)}
                                </p>
                                {paymentType === "mix" ? (
                                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                                    L ₹
                                    {(getMixLoanCap(payment) || payment.loanAmount || 0).toLocaleString("en-IN")}
                                    {" · "}
                                    C ₹
                                    {(getMixCashCap(payment) || payment.cashAmount || 0).toLocaleString("en-IN")}
                                  </p>
                                ) : paymentType === "loan" &&
                                  (payment.loanAmount || getMixLoanCap(payment)) ? (
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    Loan ₹
                                    {(payment.loanAmount || getMixLoanCap(payment)).toLocaleString("en-IN")}
                                  </p>
                                ) : null}
                                <p
                                  className={cn(
                                    "text-[11px] mt-0.5 font-medium",
                                    effectiveStatus === "completed"
                                      ? "text-emerald-700"
                                      : effectiveStatus === "partial"
                                        ? "text-amber-700"
                                        : "text-rose-700",
                                  )}
                                >
                                  {statusLabel}
                                </p>
                              </div>

                              <div className="min-w-[10.5rem]">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">File status</p>
                                <div className="mt-0.5 space-y-0.5">
                                  {getJourneyFileStatusStages(payment.quotation).map((item) => {
                                    const stageLabel =
                                      item.label === "Final confirmation"
                                        ? "Final approval"
                                        : item.label
                                    return (
                                      <div
                                        key={item.label}
                                        className="flex items-center gap-1.5 whitespace-nowrap"
                                      >
                                        <span className="text-[10px] text-muted-foreground shrink-0">
                                          {stageLabel}
                                        </span>
                                        <Badge
                                          variant="outline"
                                          className={cn(
                                            "text-[9px] px-1.5 py-0 h-4 shrink-0 font-medium",
                                            journeyStageStatusBadgeClass(item.status),
                                          )}
                                        >
                                          {item.statusLabel}
                                        </Badge>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>

                              <div className="min-w-0 max-w-[9rem]">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Bank · IFSC</p>
                                <p className="text-[10px] font-medium leading-snug break-words text-muted-foreground">
                                  {getFinancingBankDisplay(payment)}
                                </p>
                              </div>

                              <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                  Cost of site
                                </p>
                                <p className="text-sm font-semibold tabular-nums">
                                  ₹{Math.max(0, Math.round(Number(payment.siteCost) || 0)).toLocaleString("en-IN")}
                                </p>
                              </div>

                              <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Profit</p>
                                <p
                                  className={cn(
                                    "text-sm font-semibold tabular-nums",
                                    getPaymentSiteProfit(payment) >= 0
                                      ? "text-emerald-700"
                                      : "text-rose-700",
                                  )}
                                >
                                  ₹{getPaymentSiteProfit(payment).toLocaleString("en-IN")}
                                </p>
                              </div>

                              <div className="col-span-2 sm:col-span-3 xl:col-span-1 min-w-0 flex xl:justify-end">
                                <div className="flex flex-col items-stretch gap-1 w-full max-w-[7.25rem] min-w-0">
                                  {sentToInstaller ? (
                                    <>
                                      <Badge
                                        variant="outline"
                                        className="justify-center text-[9px] px-1.5 h-6 border-emerald-500 text-emerald-700 whitespace-nowrap truncate"
                                      >
                                        Sent to installer
                                      </Badge>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-6 px-1.5 text-[10px] leading-none w-full font-medium border-amber-800/40"
                                        onClick={() => void handleRetrieveFromInstallation(payment.quotation)}
                                        disabled={
                                          accountsReadOnly ||
                                          !revertFromInstallation.enabled ||
                                          retrievingInstallationId === payment.quotationId
                                        }
                                        title={
                                          revertFromInstallation.hint ||
                                          "Revert to Accounts (undo Send to Installer)"
                                        }
                                      >
                                        <RotateCcw className="w-3 h-3 mr-1 shrink-0" />
                                        <span className="truncate">
                                          {retrievingInstallationId === payment.quotationId
                                            ? "Reverting..."
                                            : "Revert"}
                                        </span>
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-6 px-1.5 text-[10px] leading-none w-full font-medium"
                                      onClick={() => void handleReleaseToInstaller(payment.quotation)}
                                      disabled={accountsReadOnly || releasingInstallationId === payment.quotationId}
                                      title="Send this quotation to installer dashboard"
                                    >
                                      <Send className="w-3 h-3 mr-1 shrink-0" />
                                      <span className="truncate">
                                        {releasingInstallationId === payment.quotationId
                                          ? "Sending..."
                                          : "Send to Installer"}
                                      </span>
                                    </Button>
                                  )}
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-6 px-1.5 text-[10px] leading-none w-full font-medium"
                                    onClick={async () => {
                                      if (useApi) {
                                        await loadApprovedQuotations()
                                      }
                                      setActivePaymentId(payment.quotationId)
                                      setInstallmentDialogOpen(true)
                                    }}
                                  >
                                    Manage
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </Card>
                        )
                      })
                    )}
                    {displayedCustomerPayments.length > 0 ? (
                      <IncrementalListSentinel
                        sentinelRef={paymentListSentinelRef}
                        visibleCount={visiblePaymentCount}
                        totalCount={filteredPaymentTotal}
                        hasMore={hasMoreCustomerPayments}
                        onLoadMore={loadMoreCustomerPayments}
                      />
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Payment filters modal */}
      <Dialog open={paymentFiltersOpen} onOpenChange={setPaymentFiltersOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden p-0 gap-0">
          <div className="flex flex-col max-h-[85vh]">
            <div className="px-6 pt-6 pb-2 shrink-0">
              <DialogHeader>
                <DialogTitle>Filters</DialogTitle>
              </DialogHeader>
            </div>
            <div className="space-y-4 px-6 pb-6 overflow-y-auto flex-1 min-h-0">
            <PaymentDateRangeFilter
              id="approve-date-range"
              label="Approve date range"
              value={approveDateRange}
              onChange={setApproveDateRange}
              placeholder="All approve dates"
            />
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Payment type</Label>
              <Popover modal={false}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 w-full justify-between px-3 text-sm font-normal"
                  >
                    <span className="truncate">{getPaymentTypeFilterTriggerLabel(paymentTypeFilter)}</span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="z-[200] w-[var(--radix-popover-trigger-width)] min-w-48 p-2"
                  align="start"
                >
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                        paymentTypeFilter.length === 0 && "bg-accent",
                      )}
                      onClick={() => setPaymentTypeFilter([])}
                    >
                      All Payment Types
                    </button>
                    {PAYMENT_TYPE_FILTER_OPTIONS.map((option) => {
                      const checked = paymentTypeFilter.includes(option.value)
                      return (
                        <label
                          key={option.value}
                          className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) => {
                              setPaymentTypeFilter((prev) => {
                                if (next === true) {
                                  const merged = prev.includes(option.value)
                                    ? prev
                                    : [...prev, option.value]
                                  return merged.length === PAYMENT_TYPE_FILTER_OPTIONS.length
                                    ? []
                                    : merged
                                }
                                return prev.filter((v) => v !== option.value)
                              })
                            }}
                          />
                          <span>{option.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Payment status</Label>
              <Select
                value={paymentStatusFilter}
                onValueChange={(value) => setPaymentStatusFilter(value as typeof paymentStatusFilter)}
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue placeholder="Filter payment status" />
                </SelectTrigger>
                <SelectContent {...PAYMENT_FILTER_SELECT_CONTENT_PROPS}>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  {paymentSectionTab === "completed" ? (
                    <SelectItem value="completed">Completed</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Installments</Label>
              <Select
                value={paymentInstallmentFilter}
                onValueChange={(value) => setPaymentInstallmentFilter(value as PaymentInstallmentFilter)}
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue placeholder="Installment" />
                </SelectTrigger>
                <SelectContent {...PAYMENT_FILTER_SELECT_CONTENT_PROPS}>
                  <SelectItem value="all">All installments</SelectItem>
                  <SelectItem value="1">1 installment</SelectItem>
                  <SelectItem value="2">2 installments</SelectItem>
                  <SelectItem value="3">3 installments</SelectItem>
                  <SelectItem value="4">4 installments</SelectItem>
                  <SelectItem value="5">5 installments</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">File status</Label>
              <Select
                value={fileStatusFilter}
                onValueChange={(value) => setFileStatusFilter(value as FileStatusFilter)}
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue placeholder="File status" />
                </SelectTrigger>
                <SelectContent {...PAYMENT_FILTER_SELECT_CONTENT_PROPS}>
                  <SelectItem value="all">All file statuses</SelectItem>
                  <SelectItem value="installation:completed">Installation · Approved</SelectItem>
                  <SelectItem value="installation:in_progress">Installation · In Progress</SelectItem>
                  <SelectItem value="installation:pending">Installation · Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Send to installation</Label>
              <Select
                value={sendToInstallationFilter}
                onValueChange={(value) =>
                  setSendToInstallationFilter(value as SendToInstallationFilter)
                }
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue placeholder="Send to installation" />
                </SelectTrigger>
                <SelectContent {...PAYMENT_FILTER_SELECT_CONTENT_PROPS}>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Dealer</Label>
              <Select value={paymentDealerFilter} onValueChange={setPaymentDealerFilter}>
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue placeholder="Filter by dealer" />
                </SelectTrigger>
                <SelectContent {...PAYMENT_FILTER_SELECT_CONTENT_PROPS}>
                  <SelectItem value="all">All Dealers</SelectItem>
                  {paymentDealerOptions.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={() => {
                  setApproveDateRange(undefined)
                  setPaymentTypeFilter([])
                  setPaymentStatusFilter("all")
                  setPaymentInstallmentFilter("all")
                  setFileStatusFilter("all")
                  setSendToInstallationFilter("all")
                  setPaymentDealerFilter("all")
                }}
              >
                Clear filters
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9"
                onClick={() => setPaymentFiltersOpen(false)}
              >
                Done
              </Button>
            </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quotation Details Dialog */}
      <QuotationDetailsDialog
        quotation={selectedQuotation}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      {/* Installments Modal */}
      <Dialog
        open={installmentDialogOpen}
        onOpenChange={(open) => {
          if (!open && activePaymentId) {
            const draft = siteCostDrafts[activePaymentId]
            if (draft !== undefined) {
              void updatePaymentSiteCost(activePaymentId, draft)
            }
          }
          setInstallmentDialogOpen(open)
          if (!open) {
            setActivePaymentId(null)
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pr-8">
            <DialogTitle>Payment management</DialogTitle>
            {activePayment ? (
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                onClick={submitInstallments}
                disabled={isSavingInstallments || isSavingFinalSettlement || isRevertingFinalSettlement}
              >
                {isSavingInstallments ? "Submitting..." : "Submit"}
              </Button>
            ) : null}
          </DialogHeader>
          {activePayment && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">{activePayment.customerName}</p>
                  <p className="text-xs text-muted-foreground">
                    Customer No: {activePayment.customerMobile || "N/A"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Dealer: {activePayment.dealerName || "Unassigned"} • {activePayment.dealerMobile || "No contact"}
                  </p>
                 
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Subtotal</p>
                  <p className="text-base font-semibold">
                    ₹{getPaymentOriginalSubtotal(activePayment).toLocaleString()}
                  </p>
                  {getPaymentDiscountAmount(activePayment) > 0 && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                      − ₹{getPaymentDiscountAmount(activePayment).toLocaleString()} discount
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Remaining: ₹
                    {getDisplayRemaining(activePayment).toLocaleString("en-IN")}
                  </p>
                  <p className="text-[11px] mt-1">
                    <span className="text-muted-foreground">Payment status: </span>
                    <span
                      className={
                        getEffectivePaymentStatus(activePayment) === "completed"
                          ? "font-semibold text-green-700"
                          : getEffectivePaymentStatus(activePayment) === "partial"
                            ? "font-semibold text-amber-700"
                            : "font-semibold text-red-700"
                      }
                    >
                      {getEffectivePaymentStatus(activePayment) === "completed"
                        ? "Completed"
                        : getEffectivePaymentStatus(activePayment) === "partial"
                          ? "Partial"
                          : "Pending"}
                    </span>
                  </p>
                </div>
              </div>
              {["loan", "mix"].includes(getPaymentTypeValue(activePayment)) && (
                <div className="rounded-md border border-border/50 bg-muted/30 px-4 py-2 text-sm space-y-2">
                  <div>
                    <span className="text-muted-foreground">Bank · IFSC </span>
                    <span className="font-medium break-words">{getFinancingBankDisplay(activePayment)}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    <span>
                      <span className="text-muted-foreground">Loan amount: </span>
                      <span className="font-medium">
                        {getMixLoanCap(activePayment) > 0
                          ? `₹${getMixLoanCap(activePayment).toLocaleString("en-IN")}`
                          : activePayment.loanAmount != null && activePayment.loanAmount > 0
                            ? `₹${activePayment.loanAmount.toLocaleString("en-IN")}`
                            : "—"}
                      </span>
                    </span>
                    {getPaymentTypeValue(activePayment) === "mix" && (
                      <>
                        <span>
                          <span className="text-muted-foreground">Cash amount: </span>
                          <span className="font-medium">
                            {getMixCashCap(activePayment) > 0
                              ? `₹${getMixCashCap(activePayment).toLocaleString("en-IN")}`
                              : activePayment.cashAmount != null && activePayment.cashAmount > 0
                                ? `₹${activePayment.cashAmount.toLocaleString("en-IN")}`
                                : "—"}
                          </span>
                        </span>
                        <span>
                          <span className="text-muted-foreground">Loan remaining: </span>
                          <span className="font-medium text-amber-700 dark:text-amber-400">
                            ₹{getRemainingForSide(activePayment, "loan").toLocaleString("en-IN")}
                          </span>
                        </span>
                        <span>
                          <span className="text-muted-foreground">Cash remaining: </span>
                          <span className="font-medium text-amber-700 dark:text-amber-400">
                            ₹{getRemainingForSide(activePayment, "cash").toLocaleString("en-IN")}
                          </span>
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {activePayment.phases.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/70 bg-muted/10 py-8">
                  <p className="text-sm text-muted-foreground">No installments created yet.</p>
                  {getPaymentTypeValue(activePayment) === "mix" ? (
                    <p className="text-xs text-muted-foreground text-center max-w-md px-4">
                      Add one installment at a time, or record the{" "}
                      <strong>full payment in 1 installment</strong> when the customer pays everything upfront.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center max-w-md px-4">
                      Use <strong>Pay full in 1 installment</strong> when the customer pays the complete amount in the
                      first installment.
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button
                      type="button"
                      onClick={() => applyFullPaymentSingleInstallment(activePayment.quotationId)}
                      disabled={isSavingInstallments || isSavingFinalSettlement}
                    >
                      Pay full in 1 installment
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => applySingleInstallmentPlan(activePayment.quotationId)}
                      disabled={isSavingInstallments || isSavingFinalSettlement}
                    >
                      1 installment (enter paid later)
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const updated = customerPayments.map((p) =>
                          p.quotationId === activePayment.quotationId
                            ? {
                                ...p,
                                phases: appendInstallmentWithMode(
                                  p.phases,
                                  getPaymentEffectiveCap(p),
                                  defaultInstallmentPaymentMode(p),
                                ),
                              }
                            : p,
                        )
                        setCustomerPayments(updated)
                      }}
                    >
                      Add installment (split)
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Installments</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {getDisplayRemaining(activePayment) > 0 ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => applyFullPaymentSingleInstallment(activePayment.quotationId)}
                          disabled={isSavingInstallments || isSavingFinalSettlement}
                        >
                          Pay full in 1 installment
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const updated = customerPayments.map((p) =>
                            p.quotationId === activePayment.quotationId
                              ? {
                                  ...p,
                                  phases: appendInstallmentWithMode(
                                    p.phases,
                                    getPaymentEffectiveCap(p),
                                    defaultInstallmentPaymentMode(p),
                                  ),
                                }
                              : p,
                          )
                          setCustomerPayments(updated)
                        }}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                              
                  <div className="space-y-3">
                    {[...activePayment.phases]
                      .sort((a, b) => b.phaseNumber - a.phaseNumber)
                      .map((phase) => {
                                  const isCompleted = phase.status === "completed"
                                  const isPartial = phase.status === "partial"
                                  const isPending = phase.status === "pending"
                      const remainingBefore = getRemainingBeforeInstallment(activePayment, phase)
                      const isMix = getPaymentTypeValue(activePayment) === "mix"
                      const sideLabel = isLoanSidePaymentMode(phase.paymentMode) ? "Loan" : "Cash"
                      const modeOptions = paymentModeOptionsForSide(getPaymentTypeValue(activePayment))
                                  
                                  return (
                                    <div
                                      key={phase.phaseNumber}
                          className={`rounded-lg border px-4 py-3 ${
                                        isCompleted
                                          ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                                          : isPartial
                                          ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
                                          : "bg-gray-50 dark:bg-gray-950/20 border-border"
                                      }`}
                                    >
                                      <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                          <div
                                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                              isCompleted
                                                ? "bg-green-500 text-white"
                                                : isPartial
                                                ? "bg-amber-500 text-white"
                                                : "bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                                            }`}
                                          >
                                            {phase.phaseNumber}
                                          </div>
                                          <div>
                                            <p className="text-sm font-semibold">{phase.phaseName}</p>
                                            <p className="text-xs text-muted-foreground">
                                  {isMix ? `${sideLabel} remaining` : "Remaining"} before this installment: ₹
                                  {remainingBefore.toLocaleString()}
                                            </p>
                                          </div>
                                        </div>
                                        <Badge
                                          className={
                                            isCompleted
                                              ? "bg-green-600 text-white"
                                              : isPartial
                                              ? "bg-amber-600 text-white"
                                              : "bg-gray-500 text-white"
                                          }
                                        >
                                          {isCompleted ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 mr-1" /> Completed
                                </>
                                          ) : isPartial ? (
                                <>
                                  <Clock className="w-3 h-3 mr-1" /> Partial
                                </>
                                          ) : (
                                <>
                                  <AlertCircle className="w-3 h-3 mr-1" /> Pending
                                </>
                                          )}
                                        </Badge>
                                      </div>
                                      
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                          <Label className="text-xs text-muted-foreground">Paid Amount</Label>
                                          <Input
                                            type="number"
                                            value={phase.paidAmount}
                                            onChange={(e) => {
                                              const paid = Number.parseFloat(e.target.value) || 0
                                              const updated = customerPayments.map((p) =>
                                                p.quotationId === activePayment.quotationId
                                                  ? {
                                                      ...p,
                                                      phases: coercePhasesPaymentModes(
                                                        p.phases.map((ph) =>
                                                          ph.phaseNumber === phase.phaseNumber
                                                            ? (() => {
                                                                const nextStatus: PaymentPhase["status"] =
                                                                  paid >= ph.amount
                                                                    ? "completed"
                                                                    : paid > 0
                                                                      ? "partial"
                                                                      : "pending"
                                                                return {
                                                                  ...ph,
                                                                  paidAmount: paid,
                                                                  status: nextStatus,
                                                                  paymentDate:
                                                                    paid > 0 ? new Date().toISOString() : undefined,
                                                                }
                                                              })()
                                                            : ph,
                                                        ),
                                                      ),
                                                    }
                                                  : p,
                                              )
                                              setCustomerPayments(updated)
                                            }}
                                            className="mt-1"
                                            placeholder="0"
                                          />
                                        </div>
                                        <div>
                                          <Label className="text-xs text-muted-foreground">Due Date</Label>
                                          <Input
                                            type="date"
                                            value={phase.dueDate ? new Date(phase.dueDate).toISOString().split("T")[0] : ""}
                                            onChange={(e) => {
                                              const updated = customerPayments.map((p) =>
                                    p.quotationId === activePayment.quotationId
                                                  ? {
                                                      ...p,
                                                      phases: p.phases.map((ph) =>
                                                        ph.phaseNumber === phase.phaseNumber
                                                          ? { ...ph, dueDate: e.target.value }
                                                          : ph
                                                      ),
                                                    }
                                                  : p
                                              )
                                              setCustomerPayments(updated)
                                            }}
                                            className="mt-1"
                                          />
                                        </div>
                                      </div>
                                      
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                            <div>
                              <Label className="text-xs text-muted-foreground">Payment Mode</Label>
                              <Select
                                value={
                                  normalizePaymentMode(phase.paymentMode) ||
                                  defaultInstallmentPaymentMode(activePayment)
                                }
                                onValueChange={(value) => {
                                  const updated = customerPayments.map((p) =>
                                    p.quotationId === activePayment.quotationId
                                      ? {
                                          ...p,
                                          phases: p.phases.map((ph) =>
                                            ph.phaseNumber === phase.phaseNumber ? { ...ph, paymentMode: value } : ph
                                          ),
                                        }
                                      : p
                                  )
                                  setCustomerPayments(updated)
                                }}
                              >
                                <SelectTrigger className="mt-1">
                                  <SelectValue placeholder="Select payment mode" />
                                </SelectTrigger>
                                <SelectContent>
                                  {modeOptions.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                                        </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Notes</Label>
                              <Input
                                value={phase.note || ""}
                                onChange={(e) => {
                                  const updated = customerPayments.map((p) =>
                                    p.quotationId === activePayment.quotationId
                                      ? {
                                          ...p,
                                          phases: p.phases.map((ph) =>
                                            ph.phaseNumber === phase.phaseNumber ? { ...ph, note: e.target.value } : ph,
                                          ),
                                        }
                                      : p,
                                  )
                                  setCustomerPayments(updated)
                                }}
                                className="mt-1"
                                placeholder="Installment notes (optional)"
                              />
                            </div>
                          </div>

                          <div className="mt-3">
                            <Label className="text-xs text-muted-foreground">Transaction ID</Label>
                            <Textarea
                              value={phase.transactionId || ""}
                              onChange={(e) => {
                                const updated = customerPayments.map((p) =>
                                  p.quotationId === activePayment.quotationId
                                    ? {
                                        ...p,
                                        phases: p.phases.map((ph) =>
                                          ph.phaseNumber === phase.phaseNumber
                                            ? { ...ph, transactionId: e.target.value }
                                            : ph,
                                        ),
                                      }
                                    : p,
                                )
                                setCustomerPayments(updated)
                              }}
                              className="mt-1 resize-y min-h-[64px]"
                              rows={2}
                              placeholder="Optional"
                            />
                          </div>
                              
                          <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
                            <p className="text-xs text-muted-foreground">
                              {isMix ? `${sideLabel} remaining` : "Remaining"} after this installment: ₹
                              {Math.max(remainingBefore - phase.paidAmount, 0).toLocaleString()}
                            </p>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const updated = customerPayments.map((p) =>
                                  p.quotationId === activePayment.quotationId
                                    ? {
                                        ...p,
                                        phases: removePaymentPhase(
                                          p.phases,
                                          phase.phaseNumber,
                                          p.subtotal,
                                        ),
                                      }
                                    : p,
                                )
                                setCustomerPayments(updated)
                              }}
                              className="text-destructive"
                            >
                              Remove installment
                            </Button>
                                  </div>
                                  </div>
                      )
                    })}
                                </div>
                </>
              )}
              {["cash", "mix"].includes(getPaymentTypeValue(activePayment)) && (
                <div className="rounded-lg border border-amber-200/80 bg-amber-50/40 dark:bg-amber-950/20 px-4 py-3 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">Subsidy cheques</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Cheque details</Label>
                      <Textarea
                        value={subsidyDraftDetails}
                        onChange={(e) => setSubsidyDraftDetails(e.target.value)}
                        placeholder="Cheque no., bank, date, customer note…"
                        rows={2}
                        className="mt-1 resize-y min-h-[52px]"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Amount (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={subsidyDraftAmount}
                        onChange={(e) => setSubsidyDraftAmount(e.target.value)}
                        placeholder="e.g. 78000"
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <Button type="button" size="sm" variant="secondary" onClick={handleAddSubsidyCheque}>
                    Add pending cheque
                  </Button>
                  {(activePayment.subsidyCheques || []).length > 0 ? (
                    <ul className="space-y-2 border-t border-amber-200/60 pt-3">
                      {activePayment.subsidyCheques.map((sc) => (
                        <li
                          key={sc.id}
                          className="rounded-md border border-border/60 bg-background/90 px-3 py-2 text-sm"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium">₹{sc.amount.toLocaleString("en-IN")}</p>
                              <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                                {sc.details || "—"}
                              </p>
                              {sc.status === "cleared" && sc.clearedAt ? (
                                <p className="text-[10px] text-muted-foreground mt-1">
                                  Cleared {formatAdminDate(sc.clearedAt)}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant={sc.status === "cleared" ? "default" : "outline"}>
                                {sc.status === "cleared" ? "Cleared" : "Pending"}
                              </Badge>
                              {sc.status === "pending" ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="default"
                                  onClick={() => handleMarkSubsidyChequeCleared(sc.id)}
                                >
                                  Apply to paid
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground border-t border-amber-200/60 pt-2">
                      No subsidy cheques recorded yet.
                    </p>
                  )}
                </div>
              )}
              <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Cost of site</p>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        ₹
                      </span>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        className="h-9 pl-6 pr-9 text-sm font-medium tabular-nums bg-background"
                        placeholder="0"
                        disabled={savingSiteCostId === activePayment.quotationId}
                        value={
                          siteCostDrafts[activePayment.quotationId] ??
                          (activePayment.siteCost && activePayment.siteCost > 0
                            ? String(activePayment.siteCost)
                            : "")
                        }
                        onChange={(e) => {
                          const raw = e.target.value
                          setSiteCostDrafts((prev) => ({
                            ...prev,
                            [activePayment.quotationId]: raw,
                          }))
                        }}
                        onBlur={(e) =>
                          void updatePaymentSiteCost(activePayment.quotationId, e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur()
                        }}
                      />
                      {savingSiteCostId === activePayment.quotationId ? (
                        <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                      ) : null}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Saves on blur, close, or Submit — kept after refresh
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Profit</p>
                    {(() => {
                      const draftRaw = siteCostDrafts[activePayment.quotationId]
                      const liveSiteCost =
                        draftRaw !== undefined
                          ? parseSiteCostInput(draftRaw)
                          : Math.max(0, Math.round(Number(activePayment.siteCost) || 0))
                      const liveProfit = getPaymentSiteProfit(activePayment, liveSiteCost)
                      return (
                        <>
                          <p
                            className={cn(
                              "text-lg font-semibold tabular-nums",
                              liveProfit >= 0 ? "text-emerald-700" : "text-rose-700",
                            )}
                          >
                            ₹{liveProfit.toLocaleString("en-IN")}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Subtotal − cost of site (₹0 when cost is unset)
                          </p>
                        </>
                      )
                    })()}
                  </div>
                </div>

                <div className="border-t border-border/50 pt-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">PI upload</p>
                      <p className="text-[11px] text-muted-foreground">
                        Upload multiple PDFs or images (JPG, PNG, WEBP, HEIC). Select several files at once.
                      </p>
                    </div>
                    <div>
                      <Input
                        id={`am-pi-upload-${activePayment.quotationId}`}
                        type="file"
                        accept="application/pdf,image/*,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.gif"
                        multiple
                        className="hidden"
                        disabled={uploadingPiId === activePayment.quotationId}
                        onChange={(e) => {
                          const files = Array.from(e.target.files || [])
                          e.currentTarget.value = ""
                          void uploadPaymentPiFiles(activePayment.quotationId, files)
                        }}
                      />
                      <Label
                        htmlFor={`am-pi-upload-${activePayment.quotationId}`}
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium",
                          uploadingPiId === activePayment.quotationId
                            ? "cursor-not-allowed opacity-60"
                            : "cursor-pointer hover:bg-muted/40",
                        )}
                      >
                        {uploadingPiId === activePayment.quotationId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        {uploadingPiId === activePayment.quotationId ? "Uploading…" : "Upload PI (multiple)"}
                      </Label>
                    </div>
                  </div>
                  {(() => {
                    const piUrls = getActivePaymentPiUrls(activePayment)
                    if (piUrls.length === 0) {
                      return (
                        <p className="text-xs text-muted-foreground">No PI documents uploaded yet.</p>
                      )
                    }
                    return (
                      <ul className="space-y-1.5">
                        {piUrls.map((url, index) => {
                          const href = toPublicOpenHref(url) || url
                          const label =
                            url.split("/").pop()?.split("?")[0] || `PI document ${index + 1}`
                          return (
                            <li
                              key={`${activePayment.quotationId}-pi-${index}-${url}`}
                              className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5"
                            >
                              <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-w-0 flex-1 truncate text-xs text-primary underline-offset-2 hover:underline"
                                title={label}
                              >
                                {decodeURIComponent(label)}
                              </a>
                              <button
                                type="button"
                                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                                aria-label={`Remove ${label}`}
                                disabled={uploadingPiId === activePayment.quotationId}
                                onClick={() => void removePaymentPiUrl(activePayment.quotationId, url)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )
                  })()}
                </div>
              </div>

              {isFinalSettlementEligible(activePayment) &&
                getDisplayRemaining(activePayment) > 0 &&
                !isFinalSettlementApplied(activePayment) && (
                <div className="rounded-lg border border-amber-200/80 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20 px-4 py-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Final settlement</p>
                      <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                        Settlement amount (d): ₹{Math.round(getDisplayRemaining(activePayment)).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="default"
                      className="shrink-0"
                      onClick={submitFinalSettlement}
                      disabled={isSavingFinalSettlement || isRevertingFinalSettlement || isSavingInstallments}
                    >
                      {isSavingFinalSettlement ? "Applying..." : "Submit final settlement"}
                    </Button>
                  </div>
                </div>
              )}
              {(getPaymentDiscountAmount(activePayment) > 0 ||
                isFinalSettlementApplied(activePayment) ||
                getSettlementDiscountAmount(activePayment) > 0) && (
                <div className="rounded-lg border border-rose-200/80 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/20 px-4 py-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Revert settlement</p>
                      <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
                        Discount to remove (d): ₹
                        {(
                          Math.round(getSettlementDiscountAmount(activePayment)) ||
                          Math.round(getPaymentDiscountAmount(activePayment))
                        ).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      className="shrink-0"
                      onClick={() => void revertFinalSettlement()}
                      disabled={
                        isRevertingFinalSettlement || isSavingFinalSettlement || isSavingInstallments
                      }
                    >
                      {isRevertingFinalSettlement ? "Reverting..." : "Revert settlement"}
                    </Button>
                  </div>
                </div>
              )}
                  </div>
                )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
