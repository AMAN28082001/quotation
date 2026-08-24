import type { Customer, ProductSelection } from "@/lib/quotation-context"
import { isInaPanelPackage, restoreDcrPackageDisplayForForm } from "@/lib/quotation-api-payload"
import { formatPersonName, sanitizeNamePart } from "@/lib/name-display"
  import {
  calculateSystemSize,
  formatQuotationPhaseLabel,
  resolveQuotationPhase,
} from "@/lib/pricing-tables"
import { getQuotationSystemKwLabelForPdf } from "@/lib/quotation-system-kw"
import { buildPanelTechnologyNote } from "@/lib/quotation-panel-technology-notes"
import {
  formatPanelSizeWithQuantityForPdf,
  getMountingStructurePdfBrandModel,
  getMountingStructurePdfSpecification,
  getPanelPdfRangeLabel,
  INA_DCR_PANEL_RANGE_KEY,
  isAsPerTheSetLabel,
  normalizeInverterBrandForDisplay,
  QUOTATION_AS_PER_THE_SET_LABEL,
  resolvePdfPanelRangeKey,
  defaultPdfPanelRangeKeyForNonDcr80KwPackage,
  type PdfPanelRangeKey,
  isPdfCommercialSet,
} from "@/lib/quotation-pdf-display"

/** Quotation offer validity from date of issue. */
export const PROPOSAL_VALIDITY_DAYS = 7

export type ProposalDateSource = {
  createdAt?: string | null
  updatedAt?: string | null
  validUntil?: string | null
  created_at?: string | null
  updated_at?: string | null
  valid_until?: string | null
}

function parseProposalDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function pickIsoTimestamp(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue
    const parsed = new Date(String(value))
    if (!Number.isNaN(parsed.getTime())) return String(value)
  }
  return undefined
}

/** Normalize quotation timestamps from API (camelCase or snake_case). */
export function normalizeQuotationTimestamps(raw: unknown): {
  createdAt?: string
  updatedAt?: string
  validUntil?: string
} {
  const record = (raw || {}) as Record<string, unknown>
  return {
    createdAt: pickIsoTimestamp(record.createdAt, record.created_at),
    updatedAt: pickIsoTimestamp(record.updatedAt, record.updated_at),
    validUntil: pickIsoTimestamp(record.validUntil, record.valid_until),
  }
}

/** PDF + dialog: quotation date = last updated (fallback created). Valid until = +7 days. */
export function resolveProposalQuotationDates(source?: ProposalDateSource | null): {
  quotationDate: Date
  validityDate: Date
} {
  const norm = normalizeQuotationTimestamps(source)
  let quotationDate =
    parseProposalDate(norm.updatedAt) ?? parseProposalDate(norm.createdAt) ?? null

  // Backend may only expose validUntil (= updatedAt + 7 days)
  if (!quotationDate && norm.validUntil) {
    const fromValidUntil = parseProposalDate(norm.validUntil)
    if (fromValidUntil) {
      quotationDate = new Date(fromValidUntil)
      quotationDate.setDate(quotationDate.getDate() - PROPOSAL_VALIDITY_DAYS)
    }
  }

  const resolvedQuotationDate = quotationDate ?? new Date()
  const validityDate = new Date(resolvedQuotationDate)
  validityDate.setDate(validityDate.getDate() + PROPOSAL_VALIDITY_DAYS)
  return { quotationDate: resolvedQuotationDate, validityDate }
}

/** Timestamp fields from API response (for UI + PDF after save/PATCH). */
export function mergeQuotationTimestampsFromApi(
  quotation?: ProposalDateSource | null,
  apiResponse?: unknown,
  options?: { fallbackToNow?: boolean },
): { createdAt?: string; updatedAt?: string; validUntil?: string } {
  const fromApi = normalizeQuotationTimestamps(apiResponse)
  const existing = normalizeQuotationTimestamps(quotation)
  const updatedAt =
    fromApi.updatedAt ??
    existing.updatedAt ??
    (options?.fallbackToNow !== false ? new Date().toISOString() : undefined)

  return {
    createdAt: fromApi.createdAt ?? existing.createdAt,
    updatedAt,
    validUntil: fromApi.validUntil ?? existing.validUntil,
  }
}

/** Payment terms shown in PDF Terms & Conditions (page 3). */
export const PROPOSAL_PAYMENT_TERMS_DETAIL = [
  "Token Money (Cash/UPI/Netbanking): 10–20% of total system cost to secure the contract and cover initial costs (design, permits, equipment ordering).",
  "For Cash: 75–85% of the system cost must be cleared in cash before material dispatch, before installation work starts.",
  "For Loan: 70% of the system cost must be cleared before installation work starts, with the remaining 30% payable after installation.",
  "Material Delivery: Once 70% is paid (loan) or 75–85% is paid (cash, before material dispatch), equipment is dispatched to the site and installation must start within 7–10 days.",
  "Metering & Closure: After successful installation, only 5% remains and the rest of the amount must be cleared before metering work and commissioning finalize.",
].join("\n")

export const DEFAULT_PROPOSAL_SUPPORT_FORM_URL = "https://www.chairbord.com/support"
export const DEFAULT_PROPOSAL_SUPPORT_PHONE = "+91 9785230023"
export const DEFAULT_PROPOSAL_SUPPORT_EMAIL = "info@chairbord.com"

export type ProposalOfficeLocation = {
  label: string
  address: string
}

export const PROPOSAL_OFFICE_LOCATIONS: ProposalOfficeLocation[] = [
  {
    label: "Jaipur (Head Office)",
    address:
      "Plot No. 10, Ground Floor, Shri Shyam Vihar, Kalwar Road, Jhotwara, Jaipur, Rajasthan, India - 302012",
  },
  {
    label: "Ajmer",
    address:
      "2nd Floor, Miraj Cinema Mall, Gaurav Path, Apna Nagar, Vaishali Nagar, Ajmer, Rajasthan 305001",
  },
  {
    label: "Chomu",
    address: "Radha Swami Bagh, Jaipur Rd, behind MRF Showroom, Chomu, Rajasthan 303702",
  },
]

export type ProposalCompanyInfo = {
  name: string
  address: string
  phone: string
  email: string
  gst: string
  logoUrl: string
  supportFormUrl?: string
  /** Office lines in PDF footer; defaults to PROPOSAL_OFFICE_LOCATIONS. */
  offices?: ProposalOfficeLocation[]
}

export function getProposalOfficeLocations(company: ProposalCompanyInfo): ProposalOfficeLocation[] {
  if (company.offices?.length) return company.offices
  if (company.address?.trim()) {
    return [
      { label: "Jaipur (Head Office)", address: company.address.trim() },
      ...PROPOSAL_OFFICE_LOCATIONS.filter((o) => o.label !== "Jaipur (Head Office)"),
    ]
  }
  return PROPOSAL_OFFICE_LOCATIONS
}

export type ProposalDealerContactSource = {
  firstName?: string
  lastName?: string
  email?: string
  mobile?: string
}

export type ProposalDealerInfo = {
  name: string
  contact: string
  email: string
}

export function buildProposalDealerInfo(
  source?: ProposalDealerContactSource | null,
  company?: Pick<ProposalCompanyInfo, "name" | "phone" | "email">,
): ProposalDealerInfo {
  const name = formatPersonName(source?.firstName, source?.lastName, "")
  return {
    name: name || company?.name || "—",
    contact: source?.mobile?.trim() || company?.phone?.trim() || "—",
    email: source?.email?.trim() || company?.email?.trim() || "—",
  }
}

export type ProposalBankAccount = {
  bankName: string
  accountName: string
  accountNumber: string
  ifscCode: string
}

export type SpecRow = {
  component: string
  specification: string
  brandModel: string
  qty: string
}

export type PricingRow = {
  description: string
  rate: string
  capacity: string
  amount: string
  highlight?: boolean
}

export type PaymentRow = {
  stage: string
  when: string
  percentage: string
  amount: string
  highlight?: boolean
}

export type WarrantyRow = {
  component: string
  period: string
  coverage: string
}

export type TermsRow = {
  category: string
  detail: string
}

export type QuotationProposalDocumentData = {
  quotationId: string
  quotationDate: Date
  validityDate: Date
  customer: Customer
  products: ProductSelection
  company: ProposalCompanyInfo
  dealer: ProposalDealerInfo
  banks: { icici: ProposalBankAccount; sbi: ProposalBankAccount }
  subtotal: number
  totalAmount: number
  systemKwLabel: string
  phaseLabel: string
  systemTypeLabel: string
  specRows: SpecRow[]
  panelNote?: string
  /** Rate column in pricing table — Non-DCR only. */
  showPricingRateColumn: boolean
  pricingRows: PricingRow[]
  /** Pricing breakdown footer label (after subsidy when applicable). */
  pricingTotalLabel: string
  /** Pricing breakdown footer amount (after subsidy when applicable). */
  pricingTotalAmount: number
  paymentRows: PaymentRow[]
  warrantyRows: WarrantyRow[]
  supportLine: string
  termsRows: TermsRow[]
  /** BOTH system: page 2 PDF typography is 1px smaller to fit extra content. */
  page2CompactFont: boolean
}

export function formatProposalDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function formatInr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`
}

type ProductsLike = ProductSelection & Record<string, unknown>

function pickNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? "").trim()
    if (text) return text
  }
  return ""
}

/** Resolve panel brand for PDF from DCR / non-DCR / API field aliases. */
export function resolvePanelBrandForPdf(products: ProductsLike): string {
  if (isInaPanelPackage(products)) {
    return "INA"
  }
  if (resolvePdfPanelRangeKey(products, "primary") === INA_DCR_PANEL_RANGE_KEY) {
    return "INA"
  }
  if (resolvePdfPanelRangeKey(products, "dcr") === INA_DCR_PANEL_RANGE_KEY) {
    return "INA"
  }
  if (String(products.panelType || (products as Record<string, unknown>).panel_type || "").trim().toLowerCase() === "ina") {
    return "INA"
  }
  const raw = products as Record<string, unknown>
  const systemType = pickNonEmpty(products.systemType, raw.system_type).toLowerCase()
  const panelType = pickNonEmpty(raw.panelType, raw.panel_type)
  const panelBrand = pickNonEmpty(products.panelBrand, raw.panel_brand)
  const dcrBrand = pickNonEmpty(products.dcrPanelBrand, raw.dcr_panel_brand, panelType)
  const nonDcrBrand = pickNonEmpty(products.nonDcrPanelBrand, raw.non_dcr_panel_brand)
  const customDcrBrand = Array.isArray(products.customPanels)
    ? pickNonEmpty(products.customPanels.find((p) => String(p.type || "").toLowerCase() === "dcr")?.brand)
    : ""

  if (systemType === "dcr") {
    return dcrBrand || customDcrBrand || panelBrand
  }
  if (systemType === "both") {
    if (dcrBrand && nonDcrBrand) return `${dcrBrand} / ${nonDcrBrand}`
    return dcrBrand || nonDcrBrand || panelBrand
  }
  const hasDcrPanels = Boolean(
    products.dcrPanelQuantity ||
      Number(raw.dcr_panel_quantity) > 0 ||
      pickNonEmpty(products.dcrPanelSize, raw.dcr_panel_size),
  )
  if (hasDcrPanels && dcrBrand) return dcrBrand
  return panelBrand || nonDcrBrand || dcrBrand
}

export function getSystemKwLabel(products: ProductSelection): string {
  const source = products as ProductSelection & Record<string, unknown>
  const systemType = String(products.systemType || source.system_type || "").toLowerCase()

  // Prefer panel W × qty for system size even when a PDF panel range is selected.
  // Range only affects panel row display; structureSize must not override DC capacity.
  if (systemType !== "both") {
    const primary = resolvePrimaryPanelFields(products as ProductsLike)
    if (primary.size && primary.quantity > 0 && !isAsPerTheSetLabel(primary.size)) {
      const fromPanels = calculateSystemSize(primary.size, primary.quantity)
      if (fromPanels && fromPanels !== "0kW") {
        return fromPanels.replace(/kW/i, " kW").replace(/\s+/g, " ").trim()
      }
    }
  }

  return getQuotationSystemKwLabelForPdf(products)
}

export function getSystemTypeLabel(systemType: string): string {
  const map: Record<string, string> = {
    dcr: "On-Grid DCR Solar System",
    "non-dcr": "On-Grid Non-DCR Solar System",
    both: "On-Grid DCR + Non-DCR Solar System",
    customize: "Customized Solar System",
  }
  return map[systemType] || "On-Grid Solar System"
}

function getPanelGradeLabel(systemType: string | undefined): string {
  if (systemType === "dcr") return "DCR Grade"
  if (systemType === "non-dcr") return "Non-DCR Grade"
  if (systemType === "both") return "DCR / Non-DCR Grade"
  return "Non-DCR Grade"
}

function resolvePrimaryPanelFields(products: ProductsLike) {
  const raw = products as Record<string, unknown>
  if (String(products.systemType || raw.system_type || "").toLowerCase() === "dcr") {
    // Standard DCR flow saves panelSize/panelQuantity; prefer those over stale dcrPanel* copies.
    return {
      size: pickNonEmpty(products.panelSize, raw.panel_size, products.dcrPanelSize, raw.dcr_panel_size),
      quantity:
        products.panelQuantity ||
        Number(raw.panel_quantity) ||
        products.dcrPanelQuantity ||
        Number(raw.dcr_panel_quantity) ||
        0,
      brand: resolvePanelBrandForPdf(products),
    }
  }
  return {
    size: pickNonEmpty(products.panelSize, raw.panel_size, products.nonDcrPanelSize, raw.non_dcr_panel_size),
    quantity:
      products.panelQuantity ||
      Number(raw.panel_quantity) ||
      products.nonDcrPanelQuantity ||
      Number(raw.non_dcr_panel_quantity) ||
      0,
    brand: resolvePanelBrandForPdf(products),
  }
}

export function buildSpecRows(products: ProductSelection | ProductsLike): SpecRow[] {
  const p = products as ProductsLike
  if (!p?.systemType && !(p as Record<string, unknown>).system_type) {
    return [
      {
        component: "Solar Panels",
        specification: "As per BOM",
        brandModel: "—",
        qty: "As Per BOM",
      },
    ]
  }
  const systemType = String(p.systemType || (p as Record<string, unknown>).system_type || "")
  const gradeLabel = getPanelGradeLabel(systemType)
  const primary = resolvePrimaryPanelFields(p)
  const systemKwForPackage =
    Number.parseFloat(getSystemKwLabel(p as ProductSelection).replace(/[^0-9.]/g, "")) ||
    Number.parseFloat(String(p.inverterSize || "").replace(/[^0-9.]/g, "")) ||
    0
  const isNonDcr80KwPackage =
    systemType.toLowerCase().replace(/_/g, "-") === "non-dcr" && systemKwForPackage >= 79.5
  const primaryRange =
    resolvePdfPanelRangeKey(p, "primary") ||
    (isNonDcr80KwPackage
      ? defaultPdfPanelRangeKeyForNonDcr80KwPackage(primary.brand || String(p.panelBrand || ""))
      : null)
  const dcrRange = resolvePdfPanelRangeKey(p, "dcr")
  const nonDcrRange = resolvePdfPanelRangeKey(p, "nonDcr")

  const buildPanelSpecText = (
    size: string,
    grade: string,
    rangeKey: PdfPanelRangeKey | null,
    brand?: string,
  ) => {
    const brandLower = String(brand || "").trim().toLowerCase()
    const panelWatts = Number.parseFloat(String(size || "").replace(/[^0-9.]/g, "")) || 0
    // Waaree above 580W → Topcon Bifacial on PDF, keep the selected wattage (e.g. 705W).
    if (brandLower.includes("waaree") && panelWatts > 580) {
      const rawSize = String(size || "").trim()
      const sizeLabel = rawSize
        ? rawSize.replace(/w$/i, "W")
        : `${Math.round(panelWatts)}W`
      return `${sizeLabel} Topcon Bifacial, ${grade}`
    }
    if (rangeKey) {
      const rangeLabel = getPanelPdfRangeLabel(rangeKey) ?? QUOTATION_AS_PER_THE_SET_LABEL
      return `${rangeLabel}, ${grade}`
    }
    if (isAsPerTheSetLabel(size)) return `${QUOTATION_AS_PER_THE_SET_LABEL}, ${grade}`
    return `${size || "—"} Mono PERC Bifacial Technology, ${grade}`
  }

  const buildPanelQty = (quantity: number, rangeKey: PdfPanelRangeKey | null) => {
    if (rangeKey) return "As Per BOM"
    return quantity ? `${quantity} Pcs` : "As Per BOM"
  }

  const panelBrand = primary.brand || "—"
  const panelSpec = buildPanelSpecText(primary.size || "", gradeLabel, primaryRange, panelBrand)
  const panelQty = buildPanelQty(primary.quantity, primaryRange)

  const invSizeForSpec = isAsPerTheSetLabel(p.inverterSize)
    ? QUOTATION_AS_PER_THE_SET_LABEL
    : p.inverterSize || "—"
  const invSpec = `${invSizeForSpec} ${p.inverterType || "String Inverter"}, ${formatQuotationPhaseLabel(resolveQuotationPhase(p))}, MPPT, IP65, Wi-Fi Monitoring`
  const invBrand =
    isAsPerTheSetLabel(p.inverterBrand) || isAsPerTheSetLabel(p.inverterSize)
      ? QUOTATION_AS_PER_THE_SET_LABEL
      : normalizeInverterBrandForDisplay(p.inverterBrand) || "Vsole/Xwatt"
  const dcrBrandForBoth = pickNonEmpty(
    p.dcrPanelBrand,
    (p as Record<string, unknown>).dcr_panel_brand,
    (p as Record<string, unknown>).panelType,
    (p as Record<string, unknown>).panel_type,
  )

  const panelRows: SpecRow[] =
    systemType === "both" && dcrBrandForBoth
      ? [
          {
            component: "DCR Panels",
            specification: buildPanelSpecText(
              p.dcrPanelSize || "",
              "DCR Grade",
              dcrRange,
              dcrBrandForBoth,
            ),
            brandModel: dcrBrandForBoth,
            qty: buildPanelQty(p.dcrPanelQuantity || 0, dcrRange),
          },
          ...(pickNonEmpty(p.nonDcrPanelBrand, (p as Record<string, unknown>).non_dcr_panel_brand)
            ? [
                {
                  component: "Non-DCR Panels",
                  specification: buildPanelSpecText(
                    p.nonDcrPanelSize || "",
                    "Non-DCR Grade",
                    nonDcrRange,
                    pickNonEmpty(p.nonDcrPanelBrand, (p as Record<string, unknown>).non_dcr_panel_brand),
                  ),
                  brandModel: pickNonEmpty(p.nonDcrPanelBrand, (p as Record<string, unknown>).non_dcr_panel_brand),
                  qty: buildPanelQty(p.nonDcrPanelQuantity || 0, nonDcrRange),
                } satisfies SpecRow,
              ]
            : []),
        ]
      : [
          {
            component: "Solar Panels",
            specification: panelSpec,
            brandModel: panelBrand,
            qty: panelQty,
          },
        ]

  const showTataDcrAsPerSetForAcdbDcdb =
    systemType === "dcr" &&
    String(p.panelBrand || (p as Record<string, unknown>).dcr_panel_brand || "").trim().toLowerCase() === "tata" &&
    (isAsPerTheSetLabel(String(p.panelSize || "")) ||
      isAsPerTheSetLabel(String(p.dcrPanelSize || "")) ||
      isAsPerTheSetLabel(String(p.inverterSize || "")) ||
      isAsPerTheSetLabel(String(p.inverterBrand || "")))

  // 20kW and above: PDF shows CT / BT instead of ACDB / DCDB (e.g. 80kW commercial sites)
  const useCtBtLabels = systemKwForPackage >= 20

  const rows: SpecRow[] = [
    ...panelRows,
    {
      component: "Solar Inverter",
      specification: invSpec,
      brandModel: invBrand,
      qty: "1 Unit",
    },
    {
      component: "Mounting Structure",
      specification: getMountingStructurePdfSpecification(),
      brandModel: getMountingStructurePdfBrandModel(p),
      qty: "As Required",
    },
    {
      component: "DC Cables",
      specification: `${p.dcCableSize || "4mm²/6mm²"} DC Solar Cable`,
      brandModel: p.dcCableBrand || "Polycab / Standard",
      qty: "As Per BOM",
    },
    {
      component: "AC Cables",
      specification: `AC Output Cables, ${formatQuotationPhaseLabel(resolveQuotationPhase(p))}`,
      brandModel: p.acCableBrand || "Polycab / Standard",
      qty: "As Per BOM",
    },
    {
      component: useCtBtLabels ? "CT / BT" : "ACDB / DCDB",
      specification: useCtBtLabels ? "CT & BT Distribution" : "AC & DC Distribution Box",
      brandModel: useCtBtLabels
        ? `${QUOTATION_AS_PER_THE_SET_LABEL} / ${QUOTATION_AS_PER_THE_SET_LABEL}`
        : showTataDcrAsPerSetForAcdbDcdb
          ? `${QUOTATION_AS_PER_THE_SET_LABEL} / ${QUOTATION_AS_PER_THE_SET_LABEL}`
          : p.acdb || p.dcdb
            ? `${p.acdb || ""} ${p.dcdb || ""}`.trim()
            : "Havells+Elmex / Elmex",
      qty: "1 Set",
    },
    {
      component: "Lightning Arrestor & Earthing",
      specification: (() => {
        const wire = String(p.earthingWireSize || p.earthing_wire_size || "").trim()
        if (!wire || isAsPerTheSetLabel(wire)) {
          return "Copper-bonded lightning protection with green earthing wire (As per the set)"
        }
        return `Copper-bonded lightning protection with green earthing wire (${wire})`
      })(),
      brandModel: (() => {
        const brand = String(p.earthingWireBrand || p.earthing_wire_brand || "").trim()
        const wire = String(p.earthingWireSize || p.earthing_wire_size || "").trim()
        const brandLabel =
          !brand || isAsPerTheSetLabel(brand)
            ? `JMP / ${QUOTATION_AS_PER_THE_SET_LABEL}`
            : brand
        if (!wire || isAsPerTheSetLabel(wire)) {
          return `${brandLabel} Green Earthing Wire`
        }
        return `${brandLabel} Green Earthing Wire ${wire}`
      })(),
      qty: "1 Set",
    },
    {
      component: "Net Meter",
      specification: "Bi-Directional Energy Meter",
      brandModel: p.meterBrand || "L&T/HPL/Genus/Secure",
      qty: "1 Unit",
    },
  ]

  return rows
}

export function shouldUseCompactPage2PdfFont(products?: ProductsLike | null): boolean {
  return resolveProductsSystemType(products) === "both"
}

/** Normalize system type from products (camelCase or API snake_case). */
export function resolveProductsSystemType(products?: ProductsLike | null): string {
  if (!products) return ""
  const raw = products as Record<string, unknown>
  return pickNonEmpty(products.systemType, raw.system_type)
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-")
}

/** Subsidy T&C row — shown for DCR and BOTH only; hidden for Non-DCR and commercial sets. */
export function shouldShowSubsidyTermsInPdf(products: ProductsLike): boolean {
  if (isPdfCommercialSet(products)) return false
  const systemType = resolveProductsSystemType(products)
  return systemType === "dcr" || systemType === "both"
}

/** Rate column in pricing PDF table — visible for Non-DCR only. */
export function shouldShowPricingRateColumn(
  systemType?: string,
  products?: ProductsLike | null,
): boolean {
  const type = (systemType || resolveProductsSystemType(products)).toLowerCase().replace(/_/g, "-")
  return type === "non-dcr"
}

/** Actual subsidy amounts for pricing table (no T&C defaults). */
export function resolveActualSubsidyForPricing(products?: ProductsLike | null): {
  central: number
  state: number
} {
  if (!products || !shouldShowSubsidyTermsInPdf(products)) {
    return { central: 0, state: 0 }
  }
  const raw = products as Record<string, unknown>
  const central = Math.max(0, Number(products.centralSubsidy ?? raw.central_subsidy ?? 0) || 0)
  const state = Math.max(0, Number(products.stateSubsidy ?? raw.state_subsidy ?? 0) || 0)
  return { central, state }
}

export function getPricingTotalForPdf(
  subtotal: number,
  products?: ProductsLike | null,
): { label: string; amount: number } {
  const { central } = resolveActualSubsidyForPricing(products)
  if (central > 0) {
    return {
      label: "Total price After subsidy",
      amount: Math.max(0, Math.round(subtotal - central)),
    }
  }
  return {
    label: "TOTAL PROJECT COST (Including GST & All Charges)",
    amount: Math.round(subtotal),
  }
}

export function buildPricingRows(
  subtotal: number,
  systemKwLabel: string,
  products?: ProductsLike | null,
): PricingRow[] {
  const kwNum = Number.parseFloat(systemKwLabel.replace(/[^0-9.]/g, "")) || 0
  const watts = Math.round(kwNum * 1000)
  const ratePerWatt = watts > 0 ? subtotal / watts : 0
  const { central } = resolveActualSubsidyForPricing(products)
  const rows: PricingRow[] = [
    {
      description: `${systemKwLabel.replace(/\s*kW/i, " KW")} Solar System`,
      rate: ratePerWatt > 0 ? `${ratePerWatt.toFixed(2)} per Watt` : "As quoted",
      capacity: watts > 0 ? `${watts} W` : "—",
      amount: formatInr(subtotal),
      highlight: true,
    },
    { description: "GST & Taxes", rate: "Included", capacity: "Included", amount: "Included" },
    {
      description: "Transportation & Logistics",
      rate: "Included",
      capacity: "Included",
      amount: "Included",
    },
    {
      description: "Installation & Commissioning",
      rate: "Included",
      capacity: "Included",
      amount: "Included",
    },
  ]
  if (central > 0) {
    rows.push({
      description: "Central Subsidy",
      rate: "—",
      capacity: "—",
      amount: `−${formatInr(central)}`,
    })
  }
  return rows
}

/** Page-2 payment schedule summary (full policy text is in Terms & Conditions). */
export function buildPaymentRows(subtotal: number): PaymentRow[] {
  return [
    {
      stage: "Token Money",
      when: "At Order Confirmation (Cash/UPI/Netbanking)",
      percentage: "10–20%",
      amount: "As per T&C",
      highlight: true,
    },
    {
      stage: "Before Dispatch(Cash)",
      when: "Before when Material Dispatch",
      percentage: "75–85%",
      amount: "As per T&C",
    },
    {
      stage: "Pre-Installation (Loan)",
      when: "Before Installation Starts",
      percentage: "70%",
      amount: "As per T&C",
    },
    {
      stage: "Post-Installation (Loan)",
      when: "After Installation",
      percentage: "30%",
      amount: "As per T&C",
    },
    {
      stage: "Metering & Closure",
      when: "Before Metering & Commissioning",
      percentage: "Balance (~5%)",
      amount: "As per T&C",
    },
    {
      stage: "TOTAL PROJECT COST",
      when: "",
      percentage: "100%",
      amount: formatInr(subtotal),
    },
  ]
}

/** Normal DCR residential central subsidy (MNRE). */
export const PROPOSAL_DEFAULT_CENTRAL_SUBSIDY = 78000
/** Additional state subsidy — Rajasthan 100 Units Free Scheme only. */
export const PROPOSAL_DEFAULT_STATE_SUBSIDY = 17000

function resolveSubsidyAmountsForPdf(products: ProductsLike): { central: number; state: number } {
  const raw = products as Record<string, unknown>
  const centralRaw = Number(products.centralSubsidy ?? raw.central_subsidy ?? 0)
  const stateRaw = Number(products.stateSubsidy ?? raw.state_subsidy ?? 0)
  return {
    central: centralRaw > 0 ? centralRaw : PROPOSAL_DEFAULT_CENTRAL_SUBSIDY,
    state: stateRaw > 0 ? stateRaw : PROPOSAL_DEFAULT_STATE_SUBSIDY,
  }
}

const SUBSIDY_TERMS_DISCLAIMER =
  "All benefits depend on MNRE/state eligibility. Subsidy sanction, delay, denial, or disbursement is solely at government discretion. ChairBord Solar is not responsible for subsidy approval or payment; the balance is payable per the payment terms below."

/** Separate T&C rows: central (₹78,000 residential) vs state (₹17,000 — 100 Units Free Scheme only). */
export function buildSubsidyTermsRows(products: ProductsLike): TermsRow[] {
  const { central, state } = resolveSubsidyAmountsForPdf(products)
  const combined = central + state
  return [
    {
      category: "Central Subsidy",
      detail: `Eligible DCR residential customers may receive up to ${formatInr(central)} Central Government subsidy under normal residential MNRE/state norms.`,
    },
    {
      category: "State Subsidy",
      detail:
        `Under the Rajasthan 100 Units Free Scheme only, qualifying customers may additionally receive up to ${formatInr(state)} State Government subsidy ` +
        `(combined with ${formatInr(central)} central subsidy = ${formatInr(combined)} maximum).`,
    },
    {
      category: "Subsidy",
      detail: SUBSIDY_TERMS_DISCLAIMER,
    },
  ]
}

/** @deprecated Use buildSubsidyTermsRows — kept for single-block callers. */
export function buildSubsidyTermsDetail(products: ProductsLike): string {
  return buildSubsidyTermsRows(products)
    .map((row) => row.detail)
    .join("\n\n")
}

export function buildWarrantyRows(panelBrand: string): WarrantyRow[] {
  const brandLabel = panelBrand || "Selected brand"
  return [
    {
      component: `Solar Panels (${brandLabel})`,
      period: "30 Years",
      coverage: "Linear Power Output Guarantee",
    },
    {
      component: "GTI Inverter (Vsol/Xwatt)",
      period: "8–10 Years",
      coverage: "Manufacturing Defects",
    },
    {
      component: "Complete System",
      period: "5 Years",
      coverage: "Comprehensive System Warranty",
    },
  ]
}

export function buildAfterSalesSupportLine(company: ProposalCompanyInfo): string {
  const formUrl = company.supportFormUrl?.trim() || DEFAULT_PROPOSAL_SUPPORT_FORM_URL
  return [
    `Support No: ${DEFAULT_PROPOSAL_SUPPORT_PHONE}`,
    `Support Email: ${DEFAULT_PROPOSAL_SUPPORT_EMAIL}`,
    `Support Form: ${formUrl}`,
  ].join("  |  ")
}

export function getProposalConsentText(companyName: string, products?: ProductsLike | null): string {
  const subsidyClause =
    products && isPdfCommercialSet(products) ? "and other clauses" : "subsidy, and other clauses"
  return `I have read, understood, and agree to all Terms & Conditions stated in this proposal (including payment schedule, project timeline, validity, on-grid operation, net metering, ${subsidyClause}). I authorize ${companyName} to proceed as per this quotation.`
}

export const DEFAULT_TERMS_ROWS: TermsRow[] = [
  {
    category: "Payment",
    detail: PROPOSAL_PAYMENT_TERMS_DETAIL,
  },
  {
    category: "Project Timeline",
    detail:
      "15–20 days from receipt of Solar NOC from DISCOM, commercially clear order, and advance payment.",
  },
  {
    category: "Validity",
    detail: `${PROPOSAL_VALIDITY_DAYS} days from the date of offer. After this period, confirmation must be obtained.`,
  },
  {
    category: "Client Scope",
    detail:
      "Module cleaning, rooftop access, electricity/water during construction, safe storage, LT panel connection space, and internet for monitoring (if applicable) — client scope.",
  },
  {
    category: "Transport",
    detail: "Transportation of BOM to the installation site is included in the quoted price.",
  },
  {
    category: "Net Meter",
    detail:
      "Net metering application, approval, meter issue, testing, and grid synchronization are processed solely by the DISCOM; timelines and outcomes are outside Chairbord Solar's control and are not part of our project commitment. All DISCOM charges (file charges, demand charges, net-meter testing, electrical inspector report, etc.) shall be paid by the client directly to the DISCOM.",
  },
  {
    category: "On-Grid Operation",
    detail:
      "This is an on-grid solar plant. The system will generate and supply power only when grid electricity is available; during a power cut or grid outage, the plant will not work and will not provide backup power to the premises.",
  },
  {
    category: "Subsidy",
    detail:
      "Subsidy amounts and eligibility are governed by the 100 Units Free Scheme and government authorities only; ChairBord Solar is not responsible for subsidy approval or payment.",
  },
  {
    category: "Inverter",
    detail: "Grid-tie inverter as per specification; manufacturer warranty (typically 8–10 years) applies.",
  },
]

function buildTermsRows(products: ProductsLike, panelBrand: string): TermsRow[] {
  const brandLabel = panelBrand || "selected brand"
  const showSubsidyTerms = shouldShowSubsidyTermsInPdf(products)

  const panelsRow: TermsRow = {
    category: "Panels",
    detail: `${brandLabel} bifacial modules with manufacturer performance warranty as per BOM.`,
  }

  const rows: TermsRow[] = []
  for (const row of DEFAULT_TERMS_ROWS) {
    if (row.category === "Subsidy") {
      if (showSubsidyTerms) rows.push(...buildSubsidyTermsRows(products))
      continue
    }
    if (row.category === "Payment") {
      rows.push({ ...row, detail: PROPOSAL_PAYMENT_TERMS_DETAIL })
      continue
    }
    rows.push(row)
  }

  const inverterIndex = rows.findIndex((row) => row.category === "Inverter")
  if (inverterIndex === -1) return [...rows, panelsRow]
  return [...rows.slice(0, inverterIndex), panelsRow, ...rows.slice(inverterIndex)]
}

export function buildQuotationProposalDocumentData(params: {
  quotationId: string
  customer: Customer
  products: ProductSelection | null | undefined
  company: ProposalCompanyInfo
  dealer?: ProposalDealerContactSource | null
  banks: { icici: ProposalBankAccount; sbi: ProposalBankAccount }
  subtotal: number
  totalAmount: number
  quotationDate?: Date
  validityDate?: Date
}): QuotationProposalDocumentData {
  const products = restoreDcrPackageDisplayForForm(
    (params.products || { systemType: "dcr", phase: "1-Phase" }) as ProductSelection,
  ) as ProductsLike
  const quotationDate = params.quotationDate ?? new Date()
  const validityDate =
    params.validityDate ??
    new Date(quotationDate.getTime() + PROPOSAL_VALIDITY_DAYS * 24 * 60 * 60 * 1000)
  const phaseLabel = formatQuotationPhaseLabel(resolveQuotationPhase(products))
  const systemKwLabel = getSystemKwLabel(products)
  const panelBrand = resolvePanelBrandForPdf(products)
  const pricingTotal = getPricingTotalForPdf(params.subtotal, products)

  return {
    quotationId: params.quotationId,
    quotationDate,
    validityDate,
    customer: {
      ...params.customer,
      firstName:
        sanitizeNamePart(params.customer.firstName) ||
        String(params.customer.firstName ?? "").trim(),
      lastName: sanitizeNamePart(params.customer.lastName),
    },
    products,
    company: params.company,
    dealer: buildProposalDealerInfo(params.dealer, params.company),
    banks: params.banks,
    subtotal: params.subtotal,
    totalAmount: params.totalAmount,
    systemKwLabel,
    phaseLabel,
    systemTypeLabel: getSystemTypeLabel(products.systemType),
    specRows: buildSpecRows(products),
    panelNote: buildPanelTechnologyNote(products),
    showPricingRateColumn: shouldShowPricingRateColumn(undefined, products),
    pricingRows: buildPricingRows(params.subtotal, systemKwLabel, products),
    pricingTotalLabel: pricingTotal.label,
    pricingTotalAmount: pricingTotal.amount,
    paymentRows: buildPaymentRows(params.subtotal),
    warrantyRows: buildWarrantyRows(panelBrand),
    supportLine: buildAfterSalesSupportLine(params.company),
    termsRows: buildTermsRows(products, panelBrand),
    page2CompactFont: shouldUseCompactPage2PdfFont(products),
  }
}
