"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { api, ApiError } from "./api"
import { useAuth } from "./auth-context"
import { calculateSystemSize, determinePhase } from "./pricing-tables"
import {
  buildCustomerCreatePayload,
  buildCustomerCreatePayloadWithNotes,
  buildPdfDisplayFlagsPayload,
  productsWithPdfDisplayFlags,
  restoreDcrPackageDisplayForForm,
  persistQuotationProducts,
  syncDcrPanelFieldsFromPrimary,
  findQuotationRowByMobile,
  formatDuplicateQuotationError,
  formatExistingCustomerAssignedError,
  normalizeCustomersListResponse,
  normalizeMobileForMatch,
  normalizeQuotationsListResponse,
  resolveDealerNameFromCustomerRow,
  resolveDealerNameFromQuotationRow,
  stripPdfDisplayFlags,
  toCatalogCompatibleProducts,
} from "./quotation-api-payload"
import { isInverterInfoComplete, isPanelRowComplete, isPdfCommercialSet } from "./quotation-pdf-display"
import { mergeQuotationTimestampsFromApi } from "@/lib/quotation-proposal-document"
import {
  buildSystemSnapshotFromQuotation,
  pushSystemHistory,
} from "@/lib/quotation-system-history"
import { setCurrentQuotationForMobile } from "@/lib/quotation-current"

export interface Customer {
  firstName: string
  lastName: string
  mobile: string
  email: string
  address: {
    street: string
    city: string
    state: string
    pincode: string
  }
  /** Free-text notes (e.g. from Calling Data remarks / customer note). */
  remarks?: string
}

export interface ProductSelection {
  phase: string
  systemType: string
  panelBrand: string
  panelSize: string
  panelQuantity: number
  inverterType: string
  inverterBrand: string
  inverterSize: string
  structureType: string
  structureSize: string
  meterBrand: string
  acCableBrand: string
  acCableSize: string
  dcCableBrand: string
  dcCableSize: string
  acdb: string
  dcdb: string
  /**
   * Earthing wire size for the quotation.
   * Presets: "As per the set" | "2mm" | "4mm" | "6mm", or a free-text custom size.
   */
  earthingWireSize?: string
  /**
   * Earthing wire brand.
   * Presets: "As per the set" | "JMP" | "Polycab" | "Havells" | …, or custom.
   */
  earthingWireBrand?: string
  // DCR specific
  centralSubsidy?: number
  stateSubsidy?: number
  // System price (for DCR, NON DCR, BOTH - complete set price)
  systemPrice?: number
  // Hybrid specific
  hybridInverter?: string
  batteryCapacity?: string
  batteryPrice?: number
  // Customize
  customPanels?: Array<{ brand: string; size: string; quantity: number; type: string }>
  dcrPanelBrand?: string
  dcrPanelSize?: string
  dcrPanelQuantity?: number
  nonDcrPanelBrand?: string
  nonDcrPanelSize?: string
  nonDcrPanelQuantity?: number
  /** PDF panel range option for DCR / NON DCR (see quotation-pdf-display). */
  pdfPanelRangeKey?: string
  /** PDF panel range for BOTH — DCR panels. */
  pdfDcrPanelRangeKey?: string
  /** PDF panel range for BOTH — Non-DCR panels. */
  pdfNonDcrPanelRangeKey?: string
  /** @deprecated use pdfPanelRangeKey */
  pdfUsePanelSizeRange?: boolean
  /** @deprecated inverter brand is chosen in dropdown */
  pdfUseInverterBrandOptions?: boolean
  /** Commercial DCR/BOTH set — hide subsidy clauses on proposal PDF. */
  pdfCommercialSet?: boolean
  /** DCR pricing column id — e.g. INA when API stores Adani/Waaree catalog brand. */
  panelType?: string
  /** True when dealer selected INA DCR package (survives catalog brand alias on API). */
  inaDcrPackage?: boolean
  /** 3kW + 580W: false = 2,900W (5 panels), true = 3,480W (6 panels). */
  allow3480W?: boolean
  /** BOTH Non-DCR 3kW + 580W: 6 panels / 3,480W. */
  allowNonDcr3480W?: boolean
}

export type QuotationStatus = "pending" | "approved" | "rejected" | "completed"

// Dealer/Admin information included in quotation responses
export interface DealerInfo {
  id: string
  firstName: string
  lastName: string
  email: string
  mobile: string
  username: string
  role: "dealer" | "admin"
}

/** Admin file-login workflow (subsidy / portal filing). */
export type FileLoginStatus = "already_login" | "login_now"

export type StatusHistoryEntry = {
  status: string
  at: string
}

export interface Quotation {
  pricing?: any
  id: string
  customer: Customer
  products: ProductSelection
  discount: number
  /** Set-price / package price used as payment cap (align with backend `subtotal`). */
  subtotal?: number
  /**
   * Server-computed balance remaining (either field may be present).
   * Prefer these over recomputing from installment allocation rows when present.
   */
  remaining?: number
  remainingAmount?: number
  totalAmount: number
  finalAmount: number
  createdAt: string
  updatedAt?: string
  dealerId: string
  dealer?: DealerInfo | null // NEW: Dealer/admin information from backend
  status?: QuotationStatus
  /** True when this is the active quotation for the customer (among revisions). */
  isCurrent?: boolean
  is_current?: boolean
  /** Older quotation this was revised from (additional quotation flow). */
  sourceQuotationId?: string
  source_quotation_id?: string
  previousQuotationId?: string
  paymentMode?: string
  /** Set when admin approves with loan / mix */
  bankName?: string
  bankIfsc?: string
  /** Loan portion when payment type is loan or cash + loan */
  loanAmount?: number
  /** Cash portion when payment type is cash + loan */
  cashAmount?: number
  /** Payment installments (Account Management); used in metering for I2 amount. */
  paymentPhases?: Array<{ phaseNumber: number; amount: number }>
  /** Subsidy cheque details when approval payment is cash or cash + loan */
  subsidyChequeDetails?: string
  /** File login: already filed vs mark as login now */
  fileLoginStatus?: FileLoginStatus
  /** Payment type recorded at file-login step (loan / cash / mix). Mix = cash + loan in UI. */
  filePaymentType?: "loan" | "cash" | "mix"
  fileBankName?: string
  fileBankIfsc?: string
  /** Subsidy cheque for file login when payment is cash or cash + loan */
  fileSubsidyChequeDetails?: string
  fileLoginAt?: string
  /** Account Management release flag: shown in installer queue only after this is true. */
  installationReadyForInstaller?: boolean
  installationReleasedAt?: string
  /** Planned installation date (YYYY-MM-DD). Default UI: 7 days after sent-to-installation until overridden. */
  installationScheduledAt?: string
  /** Admin-assigned installation team (id); team logins only see matching rows. */
  installationTeamId?: string
  /** When quotation became approved (server or admin action) */
  statusApprovedAt?: string
  /** Ordered status transitions for admin audit */
  statusHistory?: StatusHistoryEntry[]
  /** Cross-team operational workflow status (installer/metering/baldev). */
  installationStatus?: string
  installation_status?: string
  meteringStatus?: string
  metering_status?: string
  mcoStatus?: string
  mco_status?: string
  meteringApprovedAt?: string
  metering_approved_at?: string
  mcoAt?: string
  mco_at?: string
  paymentStatus?: "pending" | "completed" | "partial"
  validUntil?: string // Optional: quotation validity date
}

interface QuotationContextType {
  currentCustomer: Customer | null
  currentProducts: ProductSelection | null
  quotations: Quotation[]
  isLoading: boolean
  error: string | null
  setCurrentCustomer: (customer: Customer) => void
  setCurrentProducts: (products: ProductSelection) => void
  saveQuotation: (
    discount: number,
    subtotalValue: number,
    options?: {
      /** Create another quotation for same customer (revise flow). Keeps the old row. */
      allowAdditionalForCustomer?: boolean
      sourceQuotationId?: string
    },
  ) => Promise<Quotation>
  /** @deprecated Prefer saveQuotation with allowAdditionalForCustomer — kept for in-place product replace. */
  reviseQuotationSystem: (
    quotationId: string,
    discount: number,
    subtotalValue: number,
  ) => Promise<Quotation>
  loadQuotations: () => Promise<void>
  clearCurrent: () => void
}

const QuotationContext = createContext<QuotationContextType | undefined>(undefined)

function isDuplicateCustomerError(err: unknown): boolean {
  if (err instanceof ApiError) {
    if (err.code === "HTTP_409") return true
    const detailsText = err.details?.map((d) => d.message).join(" ") || ""
    const msg = `${err.message} ${detailsText}`.toLowerCase()
    return /already exist|duplicate|mobile.*taken|customer.*exist|assigned to/.test(msg)
  }
  if (err instanceof Error) {
    return /already exist|duplicate|mobile.*taken|customer.*exist|assigned to/i.test(err.message)
  }
  return false
}

async function resolveDealerNameForExistingMobile(mobile: string): Promise<string> {
  const normalized = normalizeMobileForMatch(mobile)
  try {
    const existingQuotationsResponse = await api.quotations.getAll({
      search: mobile,
      page: 1,
      limit: 1000,
    })
    const list = normalizeQuotationsListResponse(existingQuotationsResponse)
    const match = findQuotationRowByMobile(list, mobile)
    if (match) return resolveDealerNameFromQuotationRow(match)
  } catch {
    // Fall through to customer lookup.
  }

  try {
    const customersResponse = await api.customers.getAll({ search: mobile })
    const customersList = normalizeCustomersListResponse(customersResponse)
    const existingCustomer = customersList.find(
      (c) => normalizeMobileForMatch(c.mobile || "") === normalized,
    )
    if (existingCustomer) {
      const dealerName = resolveDealerNameFromCustomerRow(existingCustomer)
      if (dealerName) return dealerName
    }
  } catch {
    // Ignore lookup failures.
  }

  return "Unknown Dealer"
}

function throwDuplicateQuotationError(list: unknown[], mobile: string): never {
  const match = findQuotationRowByMobile(list, mobile)
  const dealerName = match ? resolveDealerNameFromQuotationRow(match) : "Unknown Dealer"
  throw new Error(formatDuplicateQuotationError(dealerName))
}

export function QuotationProvider({ children }: { children: ReactNode }) {
  const { dealer } = useAuth()
  const useApi = process.env.NEXT_PUBLIC_USE_API !== "false"
  
  // Load from localStorage on mount (for form state only, not data)
  const [currentCustomer, setCurrentCustomerState] = useState<Customer | null>(() => {
    if (typeof window !== "undefined" && !useApi) {
      const stored = localStorage.getItem("currentCustomer")
      return stored ? JSON.parse(stored) : null
    }
    return null
  })
  
  const [currentProducts, setCurrentProductsState] = useState<ProductSelection | null>(() => {
    if (typeof window !== "undefined" && !useApi) {
      const stored = localStorage.getItem("currentProducts")
      return stored ? JSON.parse(stored) : null
    }
    return null
  })
  
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Persist form state to localStorage when not using API
  useEffect(() => {
    if (!useApi) {
      if (currentCustomer) {
        localStorage.setItem("currentCustomer", JSON.stringify(currentCustomer))
      } else {
        localStorage.removeItem("currentCustomer")
      }
    }
  }, [currentCustomer, useApi])

  useEffect(() => {
    if (!useApi) {
      if (currentProducts) {
        localStorage.setItem("currentProducts", JSON.stringify(currentProducts))
      } else {
        localStorage.removeItem("currentProducts")
      }
    }
  }, [currentProducts, useApi])

  const setCurrentCustomer = useCallback((customer: Customer) => {
    setCurrentCustomerState(customer)
  }, [])

  const setCurrentProducts = useCallback((products: ProductSelection) => {
    setCurrentProductsState(products)
  }, [])

  const loadQuotations = async () => {
    if (!dealer?.id) return
    
    setIsLoading(true)
    setError(null)
    
    try {
      if (useApi) {
        const response = await api.quotations.getAll()
        const dealerQuotations = (response.quotations || []).map((q: any) => ({
          ...q,
          status: q.status || "pending",
        }))
        setQuotations(dealerQuotations)
      } else {
        // Fallback to localStorage
        const all = JSON.parse(localStorage.getItem("quotations") || "[]")
        const dealerQuotations = all
          .filter((q: Quotation) => q.dealerId === dealer.id)
          .map((q: Quotation) => ({ ...q, status: q.status || "pending" }))
        setQuotations(dealerQuotations)
      }
    } catch (err) {
      console.error("Error loading quotations:", err)
      setError(err instanceof ApiError ? err.message : "Failed to load quotations")
    } finally {
      setIsLoading(false)
    }
  }

  const saveQuotation = async (
    discount: number,
    subtotalValue: number,
    options?: {
      allowAdditionalForCustomer?: boolean
      sourceQuotationId?: string
    },
  ): Promise<Quotation> => {
    if (!currentCustomer || !currentProducts || !dealer?.id) {
      throw new Error("Missing customer, products, or dealer information")
    }

    const allowAdditional = Boolean(options?.allowAdditionalForCustomer || options?.sourceQuotationId)
    const sourceQuotationId = String(options?.sourceQuotationId || "").trim()

    // CRITICAL: Validate subtotalValue before proceeding
    // Note: Parameter is named subtotalValue to avoid conflict with calculated totalAmount
    console.log("[saveQuotation] === RECEIVED VALUES ===")
    console.log("[saveQuotation] Received values:", {
      discount,
      subtotalValue,
      type: typeof subtotalValue,
      isFinite: Number.isFinite(subtotalValue),
      isZero: subtotalValue === 0,
      isNull: subtotalValue === null,
      isUndefined: subtotalValue === undefined,
      currentProductsSystemPrice: currentProducts.systemPrice,
      currentProductsSystemPriceType: typeof currentProducts.systemPrice,
      allowAdditional,
      sourceQuotationId: sourceQuotationId || null,
    })
    console.log("[saveQuotation] =======================")

    let normalizedSubtotal = subtotalValue
    if (
      (normalizedSubtotal === null || normalizedSubtotal === undefined || !Number.isFinite(normalizedSubtotal) || normalizedSubtotal <= 0) &&
      Number.isFinite(Number(currentProducts.systemPrice)) &&
      Number(currentProducts.systemPrice) > 0
    ) {
      normalizedSubtotal = Number(currentProducts.systemPrice)
    }

    // STRICT validation - must be > 0, not just truthy
    if (normalizedSubtotal === null || normalizedSubtotal === undefined || !Number.isFinite(normalizedSubtotal) || normalizedSubtotal <= 0) {
      console.error("[saveQuotation] === INVALID SUBTOTAL VALUE ===")
      console.error("[saveQuotation] Invalid subtotalValue received:", {
        subtotalValue,
        normalizedSubtotal,
        type: typeof subtotalValue,
        isFinite: Number.isFinite(subtotalValue),
        isZero: subtotalValue === 0,
        isNull: subtotalValue === null,
        isUndefined: subtotalValue === undefined,
        currentProductsSystemPrice: currentProducts.systemPrice,
        currentProductsData: {
          systemType: currentProducts.systemType,
          panelBrand: currentProducts.panelBrand,
          panelSize: currentProducts.panelSize,
          panelQuantity: currentProducts.panelQuantity,
        }
      })
      console.error("[saveQuotation] ==============================")
      throw new Error(`Invalid subtotal value: ${subtotalValue}. Subtotal must be greater than 0. Please ensure a valid system configuration is selected or enter a valid amount in the Subtotal field.`)
    }
    
    // Double-check after conversion
    const validatedSubtotalValue = Number(normalizedSubtotal)
    if (!Number.isFinite(validatedSubtotalValue) || validatedSubtotalValue <= 0) {
      console.error("[saveQuotation] Subtotal validation failed after Number conversion:", validatedSubtotalValue)
      throw new Error(`Subtotal validation failed: ${validatedSubtotalValue}. Subtotal must be greater than 0.`)
    }

    setIsLoading(true)
    setError(null)

    try {
      if (useApi) {
        const normalizeMobile = normalizeMobileForMatch
        const currentMobileNormalized = normalizeMobile(currentCustomer.mobile)

        // First, create or get customer
        let customerId: string
        try {
          // Try to find existing customer by mobile
          const customersResponse = await api.customers.getAll({ search: currentCustomer.mobile })
          const customersList = normalizeCustomersListResponse(customersResponse)
          const existingCustomer = customersList.find(
            (c) => c.mobile === currentCustomer.mobile,
          )

          if (existingCustomer) {
            if (existingCustomer.dealerId && existingCustomer.dealerId !== dealer.id) {
              const dealerName =
                resolveDealerNameFromCustomerRow(existingCustomer) || "Unknown Dealer"
              throw new Error(formatExistingCustomerAssignedError(dealerName))
            }
            customerId = existingCustomer.id
          } else {
            const createCustomer = async (payload: Record<string, unknown>) => {
              const created = (await api.customers.create(payload)) as Record<string, unknown>
              const id =
                (typeof created?.id === "string" && created.id) ||
                (typeof (created?.customer as Record<string, unknown>)?.id === "string" &&
                  (created.customer as Record<string, unknown>).id) ||
                ""
              if (!id) throw new Error("Customer created but no id was returned from the API")
              return id
            }

            try {
              customerId = await createCustomer(buildCustomerCreatePayloadWithNotes(currentCustomer))
            } catch (notesErr) {
              const shouldRetryWithoutNotes =
                currentCustomer.remarks?.trim() &&
                (notesErr instanceof ApiError
                  ? notesErr.code === "SYS_001" || notesErr.code.startsWith("HTTP_5")
                  : true)
              if (!shouldRetryWithoutNotes) throw notesErr
              console.warn(
                "[saveQuotation] Customer create with notes failed; retrying without notes/remarks",
                notesErr,
              )
              customerId = await createCustomer(buildCustomerCreatePayload(currentCustomer))
            }
          }
        } catch (err: any) {
          console.error("Error creating customer:", err)

          if (isDuplicateCustomerError(err)) {
            const dealerName = await resolveDealerNameForExistingMobile(currentCustomer.mobile)
            throw new Error(formatExistingCustomerAssignedError(dealerName))
          }

          // Provide more detailed error message
          let errorMessage = "Failed to create customer"
          if (err instanceof Error) {
            errorMessage = err.message || errorMessage
          } else if (err?.message) {
            errorMessage = err.message
          } else if (typeof err === "string") {
            errorMessage = err
          }
          
          // If it's an API error with details, include them
          if (err?.details && Array.isArray(err.details)) {
            const details = err.details.map((d: any) => `${d.field}: ${d.message}`).join(", ")
            errorMessage += `. Details: ${details}`
          }
          
          throw new Error(errorMessage)
        }

        // Prevent duplicate fresh quotation for same mobile — unless revising (keep old + create new).
        if (!allowAdditional) {
          try {
            const existingQuotationsResponse = await api.quotations.getAll({
              search: currentCustomer.mobile,
              page: 1,
              limit: 1000,
            })
            const list = normalizeQuotationsListResponse(existingQuotationsResponse)
            const hasSameMobileQuotation = list.some((row) => {
              const rowMobile = normalizeMobile(
                String(
                  (row as any)?.customer?.mobile ||
                    row?.mobile ||
                    row?.customerMobile ||
                    row?.customer_mobile ||
                    "",
                ),
              )
              return rowMobile && rowMobile === currentMobileNormalized
            })
            if (hasSameMobileQuotation) {
              throwDuplicateQuotationError(list, currentCustomer.mobile)
            }
          } catch (dupErr) {
            if (dupErr instanceof Error && dupErr.message.includes("assigned to")) {
              throw dupErr
            }
            // If duplicate-check endpoint behavior is unavailable, fail-safe with loaded dealer quotations.
            const duplicateInLoaded = quotations.find(
              (q) => normalizeMobile(q.customer?.mobile || "") === currentMobileNormalized,
            )
            if (duplicateInLoaded) {
              const dealerName = duplicateInLoaded.dealer
                ? `${duplicateInLoaded.dealer.firstName || ""} ${duplicateInLoaded.dealer.lastName || ""}`.trim() ||
                  duplicateInLoaded.dealer.username ||
                  "Unknown Dealer"
                : "Unknown Dealer"
              throw new Error(formatDuplicateQuotationError(dealerName))
            }
          }
        }

        // Calculate pricing values - matching backend controller logic
        // subtotalValue parameter = Subtotal (set price - complete package price)
        // Backend expects: subtotal, totalAmount, finalAmount at root level
        const subtotal = Number(validatedSubtotalValue) // Subtotal is the set price (complete package price)
        
        // Double-check subtotal is still valid after conversion
        if (!subtotal || subtotal <= 0 || !Number.isFinite(subtotal)) {
          console.error("[saveQuotation] Subtotal became invalid after conversion:", {
            originalSubtotalValue: subtotalValue,
            convertedSubtotal: subtotal,
            currentProductsSystemPrice: currentProducts.systemPrice,
          })
          throw new Error(`Subtotal validation failed: ${subtotal}. Cannot proceed with quotation creation.`)
        }
        
        // Commercial set: no subsidy applies (DCR/BOTH commercial → central & state subsidy are 0).
        const isCommercialSet = isPdfCommercialSet(currentProducts)
        // Calculate subsidy amounts (matching backend variable names)
        const centralSubsidy = isCommercialSet ? 0 : Number(currentProducts.centralSubsidy || 0)
        const stateSubsidy = isCommercialSet ? 0 : Number(currentProducts.stateSubsidy || 0)
        const totalSubsidy = centralSubsidy + stateSubsidy
        
        // Calculate derived amounts (matching backend calculations)
        const amountAfterSubsidy = subtotal - totalSubsidy
        const requestedDiscountAmount = Math.max(0, Number(discount) || 0)
        const discountCap = Math.max(amountAfterSubsidy, 0)
        const finalDiscountAmount = Math.min(requestedDiscountAmount, discountCap)
        
        // totalAmount = Amount after discount (Subtotal - Subsidy - Discount)
        const totalAmount = Math.max(amountAfterSubsidy - finalDiscountAmount, 0)
        
        // finalAmount now equals totalAmount (after discount)
        const finalAmount = totalAmount

        // Clean and validate products data before sending
        // Remove empty strings and ensure required fields are present
        const cleanedProducts: ProductSelection = {
          systemType: currentProducts.systemType,
          phase: currentProducts.phase || "",
          panelBrand: currentProducts.panelBrand || "",
          panelSize: currentProducts.panelSize || "",
          panelQuantity: currentProducts.panelQuantity || 0,
          inverterType: currentProducts.inverterType || "",
          inverterBrand: currentProducts.inverterBrand || "",
          inverterSize: currentProducts.inverterSize || "",
          structureType: currentProducts.structureType || "",
          structureSize: currentProducts.structureSize || "",
          meterBrand: currentProducts.meterBrand || "",
          acCableBrand: currentProducts.acCableBrand || "",
          acCableSize: currentProducts.acCableSize || "",
          dcCableBrand: currentProducts.dcCableBrand || "",
          dcCableSize: currentProducts.dcCableSize || "",
          acdb: currentProducts.acdb || "",
          dcdb: currentProducts.dcdb || "",
          earthingWireSize: currentProducts.earthingWireSize || "",
          earthingWireBrand: currentProducts.earthingWireBrand || "",
        }

        if (!cleanedProducts.phase || cleanedProducts.phase.trim() === "") {
          if (cleanedProducts.systemType === "both") {
            cleanedProducts.phase = "3-Phase"
          } else if (cleanedProducts.panelSize && cleanedProducts.panelQuantity && cleanedProducts.inverterSize) {
            const systemSize = calculateSystemSize(cleanedProducts.panelSize, cleanedProducts.panelQuantity)
            if (systemSize !== "0kW") {
              cleanedProducts.phase = determinePhase(systemSize, cleanedProducts.inverterSize)
            }
          }
          if (!cleanedProducts.phase || cleanedProducts.phase.trim() === "") {
            cleanedProducts.phase = "1-Phase"
          }
        }

        // Add optional fields if they exist
        if (currentProducts.centralSubsidy !== undefined) {
          cleanedProducts.centralSubsidy = currentProducts.centralSubsidy
        }
        if (currentProducts.stateSubsidy !== undefined) {
          cleanedProducts.stateSubsidy = currentProducts.stateSubsidy
        }
        if (currentProducts.systemPrice !== undefined) {
          cleanedProducts.systemPrice = currentProducts.systemPrice
        }
        if (currentProducts.dcrPanelBrand) {
          cleanedProducts.dcrPanelBrand = currentProducts.dcrPanelBrand
          cleanedProducts.dcrPanelSize = currentProducts.dcrPanelSize || ""
          cleanedProducts.dcrPanelQuantity = currentProducts.dcrPanelQuantity || 0
        }
        if (currentProducts.nonDcrPanelBrand) {
          cleanedProducts.nonDcrPanelBrand = currentProducts.nonDcrPanelBrand
          cleanedProducts.nonDcrPanelSize = currentProducts.nonDcrPanelSize || ""
          cleanedProducts.nonDcrPanelQuantity = currentProducts.nonDcrPanelQuantity || 0
        }
        if (currentProducts.batteryCapacity) {
          cleanedProducts.batteryCapacity = currentProducts.batteryCapacity
        }
        if (currentProducts.batteryPrice !== undefined) {
          cleanedProducts.batteryPrice = currentProducts.batteryPrice
        }
        if (currentProducts.hybridInverter) {
          cleanedProducts.hybridInverter = currentProducts.hybridInverter
        }
        const syncedProducts = syncDcrPanelFieldsFromPrimary({
          ...currentProducts,
          ...cleanedProducts,
        })
        const productsForApi = stripPdfDisplayFlags(toCatalogCompatibleProducts(syncedProducts))
        // Commercial flag must survive to the create payload so the backend can skip the
        // "centralSubsidy is required for dcr/both" rule for commercial DCR/BOTH quotations.
        if (isCommercialSet) {
          const productsForApiRecord = productsForApi as unknown as Record<string, unknown>
          productsForApiRecord.pdfCommercialSet = true
          productsForApiRecord.pdf_commercial_set = true
          productsForApiRecord.isCommercial = true
          productsForApiRecord.centralSubsidy = 0
          productsForApiRecord.stateSubsidy = 0
        }

        // Validate required fields (use syncedProducts — PDF range keys stripped from productsForApi)
        if (productsForApi.systemType === "both") {
          if (
            !isPanelRowComplete(
              syncedProducts.dcrPanelBrand || "",
              syncedProducts.dcrPanelSize || "",
              syncedProducts.dcrPanelQuantity || 0,
              syncedProducts.pdfDcrPanelRangeKey,
            )
          ) {
            throw new Error("DCR panel information is required for BOTH system type")
          }
          if (
            !isPanelRowComplete(
              syncedProducts.nonDcrPanelBrand || "",
              syncedProducts.nonDcrPanelSize || "",
              syncedProducts.nonDcrPanelQuantity || 0,
              syncedProducts.pdfNonDcrPanelRangeKey,
            )
          ) {
            throw new Error("Non-DCR panel information is required for BOTH system type")
          }
        } else if (productsForApi.systemType !== "customize") {
          if (
            !isPanelRowComplete(
              syncedProducts.panelBrand || "",
              syncedProducts.panelSize || "",
              syncedProducts.panelQuantity || 0,
              syncedProducts.pdfPanelRangeKey,
            )
          ) {
            throw new Error("Panel information is required")
          }
        }

        if (!isInverterInfoComplete(productsForApi.inverterBrand, productsForApi.inverterSize)) {
          throw new Error("Inverter information is required")
        }
        if (!productsForApi.structureType || !productsForApi.structureSize) {
          throw new Error("Structure information is required")
        }
        if (!productsForApi.meterBrand) {
          throw new Error("Meter brand is required")
        }
        if (!productsForApi.acCableBrand || !productsForApi.acCableSize || !productsForApi.dcCableBrand || !productsForApi.dcCableSize) {
          throw new Error("Cable information is required")
        }
        if (!productsForApi.acdb || !productsForApi.dcdb) {
          throw new Error("ACDB and DCDB are required")
        }

        // Validate all pricing values (matching backend validation logic)
        // Log the raw values first to debug
        console.log("[saveQuotation] Raw pricing values before validation:", {
          subtotal,
          centralSubsidy,
          stateSubsidy,
          totalSubsidy,
          amountAfterSubsidy,
          discountAmount: finalDiscountAmount,
          totalAmount,
          finalAmount,
        })

        // Validate subtotal - must be > 0 (matching backend validation)
        if (!Number.isFinite(subtotal) || subtotal <= 0) {
          console.error("[saveQuotation] Invalid subtotal value:", subtotal, {
            subtotal,
            type: typeof subtotal,
            isNaN: Number.isNaN(subtotal),
            isFinite: Number.isFinite(subtotal),
          })
          throw new Error(`Invalid subtotal: ${subtotal}. Subtotal must be greater than 0. Please ensure the system price is set correctly or enter a valid subtotal amount in the input field.`)
        }
        
        // Ensure all values are valid numbers (matching backend validation)
        const validatedSubtotal = Number(subtotal)
        if (!Number.isFinite(validatedSubtotal) || validatedSubtotal <= 0) {
          console.error("[saveQuotation] Subtotal validation failed:", validatedSubtotal)
          throw new Error(`Invalid subtotal calculation: ${validatedSubtotal}. Please check the system configuration or enter a valid subtotal.`)
        }

        // Validate totalAmount - must be a valid number (can be 0)
        const validatedTotalAmount = Number(totalAmount)
        if (!Number.isFinite(validatedTotalAmount) || validatedTotalAmount < 0) {
          console.error("[saveQuotation] Invalid totalAmount:", validatedTotalAmount)
          throw new Error(`Invalid total amount: ${validatedTotalAmount}. Cannot proceed with quotation creation.`)
        }
        
        // Validate finalAmount - must be a valid number (can be 0 if subsidy equals subtotal)
        const validatedFinalAmount = validatedTotalAmount
        if (!Number.isFinite(validatedFinalAmount) || validatedFinalAmount < 0) {
          console.error("[saveQuotation] Invalid finalAmount:", validatedFinalAmount)
          throw new Error(`Invalid final amount: ${validatedFinalAmount}. Cannot proceed with quotation creation.`)
        }

        // Ensure all numeric values are properly converted
        const validatedCentralSubsidy = Number(centralSubsidy) || 0
        const validatedStateSubsidy = Number(stateSubsidy) || 0
        const validatedTotalSubsidy = Number(totalSubsidy) || 0
        const validatedAmountAfterSubsidy = Number(amountAfterSubsidy) || (validatedSubtotal - validatedTotalSubsidy)
        const validatedDiscountAmount = Number(finalDiscountAmount) || 0

        // Log the data being sent for debugging (matching backend log format)
        console.log("[saveQuotation] Sending quotation data with pricing:", {
          customerId,
          discount,
          subtotal: validatedSubtotal, // Set price (complete package price)
          centralSubsidy: validatedCentralSubsidy,
          stateSubsidy: validatedStateSubsidy,
          totalSubsidy: validatedTotalSubsidy,
          amountAfterSubsidy: validatedAmountAfterSubsidy,
          discountAmount: validatedDiscountAmount,
          totalAmount: validatedTotalAmount, // Amount after discount (Subtotal - Subsidy - Discount)
          finalAmount: validatedFinalAmount, // Subtotal - Subsidy (discount not applied)
        })
        
        // Log panel size specifically for debugging
        if (cleanedProducts.panelSize) {
          console.log("Panel Size being sent:", cleanedProducts.panelSize)
        }
        if (cleanedProducts.dcrPanelSize) {
          console.log("DCR Panel Size being sent:", cleanedProducts.dcrPanelSize)
        }
        if (cleanedProducts.nonDcrPanelSize) {
          console.log("Non-DCR Panel Size being sent:", cleanedProducts.nonDcrPanelSize)
        }

        // Create quotation payload - matching backend controller expectations
        // Backend expects these fields at root level: subtotal, totalAmount, finalAmount
        // Variable names must match backend exactly
        const prefillLeadId =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("prefillLeadId")?.trim() || ""
            : ""
        const quotationData = {
          customerId,
          customer: currentCustomer,
          products: productsForApi,
          // REQUIRED FIELDS (at root level - matching backend destructuring)
          subtotal: validatedSubtotal, // Set price (complete package price) - REQUIRED
          totalAmount: validatedTotalAmount, // Amount after discount (Subtotal - Subsidy - Discount) - REQUIRED
          finalAmount: validatedFinalAmount, // Final amount (Subtotal - Subsidy, discount NOT applied) - REQUIRED
          // Optional but recommended fields (matching backend variable names)
          centralSubsidy: validatedCentralSubsidy, // Individual central subsidy amount
          stateSubsidy: validatedStateSubsidy, // Individual state subsidy amount
          totalSubsidy: validatedTotalSubsidy, // Total subsidy (central + state)
          amountAfterSubsidy: validatedAmountAfterSubsidy, // Amount after subsidy
          discountAmount: validatedDiscountAmount, // Discount amount
          // Customer Journey (§AE): link quotation to Calling Data lead
          ...(prefillLeadId
            ? {
                callingLeadId: prefillLeadId,
                calling_lead_id: prefillLeadId,
                prefillLeadId,
                leadId: prefillLeadId,
              }
            : {}),
          // Commercial set (DCR/BOTH without subsidy): backend must skip the centralSubsidy
          // requirement and not deduct subsidy (finalAmount = subtotal - discount).
          ...(isCommercialSet
            ? { pdfCommercialSet: true, pdf_commercial_set: true, isCommercial: true }
            : {}),
          // Revise flow: create NEW quotation; keep source (old) quotation unchanged.
          ...(allowAdditional
            ? {
                allowAdditionalQuotation: true,
                allow_additional_quotation: true,
                allowDuplicateMobile: true,
                isCurrent: true,
                is_current: true,
                setAsCurrent: true,
                sourceQuotationId: sourceQuotationId || undefined,
                source_quotation_id: sourceQuotationId || undefined,
                previousQuotationId: sourceQuotationId || undefined,
                previous_quotation_id: sourceQuotationId || undefined,
                notes: sourceQuotationId
                  ? `Additional quotation revised from ${sourceQuotationId}`
                  : "Additional quotation for existing customer",
              }
            : {}),
        }
        
        // Final validation - ensure all required fields are present and valid
        // Matching backend validation logic exactly
        if (!quotationData.subtotal || quotationData.subtotal <= 0) {
          console.error("[saveQuotation] Final validation failed - subtotal is invalid:", quotationData)
          throw new Error(`Subtotal is missing or invalid: ${quotationData.subtotal}. Cannot create quotation.`)
        }
        
        if (quotationData.totalAmount === undefined || quotationData.totalAmount === null || !Number.isFinite(quotationData.totalAmount)) {
          console.error("[saveQuotation] Final validation failed - totalAmount is invalid:", quotationData)
          throw new Error(`Total amount is missing or invalid: ${quotationData.totalAmount}. Cannot create quotation.`)
        }
        
        if (quotationData.finalAmount === undefined || quotationData.finalAmount === null || !Number.isFinite(quotationData.finalAmount)) {
          console.error("[saveQuotation] Final validation failed - finalAmount is invalid:", quotationData)
          throw new Error(`Final amount is missing or invalid: ${quotationData.finalAmount}. Cannot create quotation.`)
        }

        // Log the complete payload being sent (matching backend log format)
        console.log("[saveQuotation] === FINAL PAYLOAD BEING SENT TO BACKEND ===")
        console.log("[saveQuotation] Complete quotation payload:", JSON.stringify(quotationData, null, 2))
        console.log("[saveQuotation] Required fields validation (matching backend checks):", {
          subtotal: {
            value: quotationData.subtotal,
            type: typeof quotationData.subtotal,
            isFinite: Number.isFinite(quotationData.subtotal),
            isValid: quotationData.subtotal > 0,
            isAtRoot: 'subtotal' in quotationData && !('subtotal' in (quotationData.products || {}))
          },
          totalAmount: {
            value: quotationData.totalAmount,
            type: typeof quotationData.totalAmount,
            isFinite: Number.isFinite(quotationData.totalAmount),
            isValid: Number.isFinite(quotationData.totalAmount),
            isAtRoot: 'totalAmount' in quotationData && !('totalAmount' in (quotationData.products || {}))
          },
          finalAmount: {
            value: quotationData.finalAmount,
            type: typeof quotationData.finalAmount,
            isFinite: Number.isFinite(quotationData.finalAmount),
            isValid: Number.isFinite(quotationData.finalAmount),
            isAtRoot: 'finalAmount' in quotationData && !('finalAmount' in (quotationData.products || {}))
          }
        })
        console.log("[saveQuotation] Payload keys at root level:", Object.keys(quotationData))
        console.log("[saveQuotation] Backend will receive these fields at req.body:", {
          subtotal: quotationData.subtotal,
          totalAmount: quotationData.totalAmount,
          finalAmount: quotationData.finalAmount,
          centralSubsidy: quotationData.centralSubsidy,
          stateSubsidy: quotationData.stateSubsidy,
          totalSubsidy: quotationData.totalSubsidy,
          amountAfterSubsidy: quotationData.amountAfterSubsidy,
          discountAmount: quotationData.discountAmount
        })
        console.log("[saveQuotation] ===========================================")

        let quotation = await api.quotations.create(quotationData)
        let savedProductsForUi: ProductSelection = currentProducts
        let lastApiResponse: unknown = quotation

        if (quotation?.id) {
          try {
            const patched = await persistQuotationProducts(
              (payload) => api.quotations.updateProducts(quotation.id, payload),
              { ...productsForApi, ...currentProducts },
              { quotationId: quotation.id },
            )
            lastApiResponse = patched ?? quotation
            savedProductsForUi = restoreDcrPackageDisplayForForm({
              ...currentProducts,
              ...buildPdfDisplayFlagsPayload(currentProducts),
            })
          } catch (patchErr) {
            console.warn("[saveQuotation] Could not persist PDF display flags (non-fatal):", patchErr)
          }
          // New / revised quotation becomes current for this customer (old stays listed).
          setCurrentQuotationForMobile(currentCustomer.mobile, quotation.id)
        }

        const withTimestamps = mergeQuotationTimestampsFromApi(quotation, lastApiResponse)

        // Reload quotations
        await loadQuotations()
        
        // Backend returns pricing object with all saved values
        // Use backend pricing values (they are the source of truth)
        const backendPricing = quotation.pricing
        
        // Fallback calculations (should not be needed if backend returns pricing)
        const calculatedSubtotal = subtotalValue // subtotalValue parameter is the subtotal
        const calculatedSubsidy = (currentProducts.centralSubsidy || 0) + (currentProducts.stateSubsidy || 0)
        const calculatedAmountAfterSubsidy = calculatedSubtotal - calculatedSubsidy
        const calculatedRequestedDiscount = Math.max(0, Number(discount) || 0)
        const calculatedDiscountCap = Math.max(calculatedAmountAfterSubsidy, 0)
        const calculatedDiscountAmount = Math.min(calculatedRequestedDiscount, calculatedDiscountCap)
        const calculatedTotalAmount = Math.max(calculatedAmountAfterSubsidy - calculatedDiscountAmount, 0)
        const calculatedFinalAmount = calculatedTotalAmount
        
        return {
          id: quotation.id,
          customer: currentCustomer,
          products: savedProductsForUi,
          discount: quotation.discount || validatedDiscountAmount,
          // Use backend pricing values (from database) as source of truth
          totalAmount: backendPricing?.totalAmount ?? calculatedTotalAmount,
          finalAmount: backendPricing?.finalAmount ?? calculatedFinalAmount,
          createdAt: withTimestamps.createdAt ?? quotation.createdAt,
          updatedAt: withTimestamps.updatedAt,
          validUntil: withTimestamps.validUntil,
          dealerId: quotation.dealerId || dealer.id,
          status: quotation.status || "pending",
        }
      } else {
        // Fallback to localStorage
        const normalizeMobile = normalizeMobileForMatch
        const currentMobileNormalized = normalizeMobile(currentCustomer.mobile)
        const existingAllQuotations: Quotation[] = JSON.parse(localStorage.getItem("quotations") || "[]")
        if (!allowAdditional) {
          const duplicateQuotation = existingAllQuotations.find(
            (q) => normalizeMobile(q.customer?.mobile || "") === currentMobileNormalized,
          )
          if (duplicateQuotation) {
            const dealerName = duplicateQuotation.dealer
              ? `${duplicateQuotation.dealer.firstName || ""} ${duplicateQuotation.dealer.lastName || ""}`.trim() ||
                duplicateQuotation.dealer.username ||
                "Unknown Dealer"
              : duplicateQuotation.dealerId === dealer.id
                ? `${dealer.firstName || ""} ${dealer.lastName || ""}`.trim() || dealer.username || "Unknown Dealer"
                : "Unknown Dealer"
            throw new Error(formatDuplicateQuotationError(dealerName))
          }
        }

        // totalAmount is now subtotal (total project cost)
        const totalProjectCost = validatedSubtotalValue
        const centralSubsidy = currentProducts.centralSubsidy || 0
        const stateSubsidy = currentProducts.stateSubsidy || 0
        const totalSubsidy = centralSubsidy + stateSubsidy
        const amountAfterSubsidy = totalProjectCost - totalSubsidy
        const requestedDiscountAmount = Math.max(0, Number(discount) || 0)
        const discountCap = Math.max(amountAfterSubsidy, 0)
        const discountAmount = Math.min(requestedDiscountAmount, discountCap)
        const totalAmount = Math.max(amountAfterSubsidy - discountAmount, 0)
        // Final Amount = Amount after discount (matches totalAmount)
        const finalAmount = totalAmount
        
        const now = new Date().toISOString()
        const quotation: Quotation = {
          id: `QT-${Date.now()}`,
          customer: currentCustomer,
          products: currentProducts,
          discount: discountAmount,
          totalAmount,
          finalAmount,
          createdAt: now,
          updatedAt: now,
          dealerId: dealer.id,
          status: "pending",
          ...(sourceQuotationId
            ? ({ sourceQuotationId, previousQuotationId: sourceQuotationId } as Partial<Quotation>)
            : {}),
        } as Quotation

        const existing = existingAllQuotations
        existing.push(quotation)
        localStorage.setItem("quotations", JSON.stringify(existing))
        setCurrentQuotationForMobile(currentCustomer.mobile, quotation.id)
        setQuotations(existing.filter((q: Quotation) => q.dealerId === dealer.id))
        return quotation
      }
    } catch (err) {
      console.error("Error saving quotation:", err)
      const errorMessage = err instanceof ApiError ? err.message : "Failed to save quotation"
      setError(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const reviseQuotationSystem = async (
    quotationId: string,
    discount: number,
    subtotalValue: number,
  ): Promise<Quotation> => {
    if (!dealer) throw new Error("Not authenticated")
    if (!currentCustomer || !currentProducts) {
      throw new Error("Customer and products required")
    }
    if (!quotationId) throw new Error("Quotation id is required to revise system")

    const validatedSubtotalValue = Number(subtotalValue)
    if (!Number.isFinite(validatedSubtotalValue) || validatedSubtotalValue <= 0) {
      throw new Error("Subtotal must be greater than 0")
    }

    setIsLoading(true)
    setError(null)
    try {
      const isCommercialSet = isPdfCommercialSet(currentProducts)
      const stateSubsidy = isCommercialSet ? 0 : Number(currentProducts.stateSubsidy || 0)
      const centralSubsidy = isCommercialSet ? 0 : Number(currentProducts.centralSubsidy || 0)
      const totalSubsidy = stateSubsidy + centralSubsidy
      const amountAfterSubsidy = validatedSubtotalValue - totalSubsidy
      const requestedDiscount = Math.max(0, Number(discount) || 0)
      const discountAmount = Math.min(requestedDiscount, Math.max(0, amountAfterSubsidy))
      const finalAmount = Math.max(0, amountAfterSubsidy - discountAmount)

      let existingRaw: unknown = null
      if (useApi) {
        existingRaw = await api.quotations.getById(quotationId)
      } else {
        const all: Quotation[] = JSON.parse(localStorage.getItem("quotations") || "[]")
        existingRaw = all.find((q) => q.id === quotationId) || null
      }
      if (!existingRaw) throw new Error("Quotation not found")

      // Store older system (e.g. Adani) before applying new (e.g. Waaree).
      pushSystemHistory(quotationId, buildSystemSnapshotFromQuotation(existingRaw))

      const productsForApi = {
        ...currentProducts,
        systemPrice: validatedSubtotalValue,
        stateSubsidy,
        centralSubsidy,
      }
      const displayProducts = restoreDcrPackageDisplayForForm({
        ...productsForApi,
        ...buildPdfDisplayFlagsPayload(productsForApi),
      })

      if (useApi) {
        await persistQuotationProducts(
          (payload) => api.quotations.updateProducts(quotationId, payload),
          productsForApi,
          { quotationId },
        )
        const pricingResponse = await api.quotations.updatePricing(quotationId, {
          subtotal: validatedSubtotalValue,
          stateSubsidy,
          centralSubsidy,
          discountAmount,
          totalAmount: finalAmount,
          finalAmount,
          ...(isCommercialSet
            ? { pdfCommercialSet: true, pdf_commercial_set: true, isCommercial: true }
            : {}),
        })
        await loadQuotations()
        const refreshed = await api.quotations.getById(quotationId).catch(() => pricingResponse)
        const withTimestamps = mergeQuotationTimestampsFromApi(
          existingRaw as Quotation,
          refreshed ?? pricingResponse,
        )
        return {
          id: quotationId,
          customer: currentCustomer,
          products: displayProducts,
          discount: discountAmount,
          totalAmount:
            Number((refreshed as any)?.pricing?.totalAmount ?? (refreshed as any)?.totalAmount) ||
            finalAmount,
          finalAmount:
            Number((refreshed as any)?.pricing?.finalAmount ?? (refreshed as any)?.finalAmount) ||
            finalAmount,
          createdAt: withTimestamps.createdAt || (existingRaw as Quotation).createdAt,
          updatedAt: withTimestamps.updatedAt,
          dealerId: (existingRaw as Quotation).dealerId || dealer.id,
          status: (existingRaw as Quotation).status || "pending",
        }
      }

      const all: Quotation[] = JSON.parse(localStorage.getItem("quotations") || "[]")
      const idx = all.findIndex((q) => q.id === quotationId)
      if (idx < 0) throw new Error("Quotation not found")
      const updated: Quotation = {
        ...all[idx]!,
        customer: currentCustomer,
        products: displayProducts,
        discount: discountAmount,
        subtotal: validatedSubtotalValue,
        totalAmount: finalAmount,
        finalAmount,
        updatedAt: new Date().toISOString(),
      }
      all[idx] = updated
      localStorage.setItem("quotations", JSON.stringify(all))
      setQuotations(all.filter((q) => q.dealerId === dealer.id))
      return updated
    } catch (err) {
      console.error("Error revising quotation system:", err)
      const errorMessage = err instanceof ApiError ? err.message : "Failed to revise quotation"
      setError(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const clearCurrent = () => {
    setCurrentCustomerState(null)
    setCurrentProductsState(null)
    if (!useApi) {
      localStorage.removeItem("currentCustomer")
      localStorage.removeItem("currentProducts")
    }
  }

  // Load quotations on mount if dealer is available
  useEffect(() => {
    if (dealer?.id) {
      loadQuotations()
    }
  }, [dealer?.id])

  return (
    <QuotationContext.Provider
      value={{
        currentCustomer,
        currentProducts,
        quotations,
        isLoading,
        error,
        setCurrentCustomer,
        setCurrentProducts,
        saveQuotation,
        reviseQuotationSystem,
        loadQuotations,
        clearCurrent,
      }}
    >
      {children}
    </QuotationContext.Provider>
  )
}

export function useQuotation() {
  const context = useContext(QuotationContext)
  if (!context) {
    throw new Error("useQuotation must be used within a QuotationProvider")
  }
  return context
}
