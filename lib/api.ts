// API Configuration and Service Layer
import { API_CONFIG } from "./api-config"
import { buildFinalConfirmationDocumentsFormData } from "./final-confirmation-documents"
import { parseQuotationDocumentUploadUrl } from "./quotation-documents-form"
import {
  extractQuotationListFromApiResponse,
  flattenQuotationListRow,
  isQuotationSentToInstaller,
  readInstallerReleaseMap,
} from "./operational-install-queue"

const getApiBaseUrl = () => API_CONFIG.baseURL

interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: Array<{ field: string; message: string }>
  }
  message?: string
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: any
  headers?: Record<string, string>
  requiresAuth?: boolean
  /** Skip loud console.error for expected failures (optional endpoints, sign-out races). */
  suppressErrorLog?: boolean
}

let apiSignOutInProgress = false

/** Set before clearing tokens so in-flight requests do not spam the console on logout. */
export function markApiSignOutInProgress(): void {
  apiSignOutInProgress = true
}

export function clearApiSignOutInProgress(): void {
  apiSignOutInProgress = false
}

function shouldQuietApiLog(
  options: RequestOptions,
  requiresAuth: boolean,
  status?: number,
  errorCode?: string,
  errorMessage?: string,
): boolean {
  if (options.suppressErrorLog) return true
  if (typeof window !== "undefined" && apiSignOutInProgress) return true
  const signedOut = typeof window !== "undefined" && requiresAuth && !getAuthToken()
  if (signedOut) return true
  return isApiAuthFailure(status, errorCode, errorMessage)
}

class ApiError extends Error {
  code: string
  details?: Array<{ field: string; message: string }>

  constructor(message: string, code: string = "API_ERROR", details?: Array<{ field: string; message: string }>) {
    super(message)
    this.name = "ApiError"
    this.code = code
    this.details = details
  }
}

/** Short user-facing text for toasts (includes validation details when present). */
function apiErrorToUserMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const bits: string[] = [error.message]
    if (error.details?.length) {
      bits.push(error.details.map((d) => `${d.field}: ${d.message}`).join(" · "))
    }
    return bits.join(" — ")
  }
  if (error instanceof Error) return error.message
  return "Something went wrong."
}

// Get auth token from localStorage
const getAuthToken = (): string | null => {
  if (typeof window === "undefined") return null
  return localStorage.getItem("authToken")
}

// Get refresh token from localStorage
const getRefreshToken = (): string | null => {
  if (typeof window === "undefined") return null
  return localStorage.getItem("refreshToken")
}

// Save auth tokens
const saveAuthTokens = (token: string, refreshToken?: string) => {
  if (typeof window === "undefined") return
  clearApiSignOutInProgress()
  localStorage.setItem("authToken", token)
  if (refreshToken) {
    localStorage.setItem("refreshToken", refreshToken)
  }
}

// Clear auth tokens
const clearAuthTokens = () => {
  if (typeof window === "undefined") return
  localStorage.removeItem("authToken")
  localStorage.removeItem("refreshToken")
}

/** True for 401/403 and auth error codes/messages (including after logout). */
export function isApiAuthFailure(
  status: number | undefined,
  errorCode: string | undefined,
  errorMessage: string | undefined,
): boolean {
  const code = String(errorCode || "").toUpperCase()
  const msg = String(errorMessage || "").toLowerCase()
  if (status === 401 || status === 403) return true
  if (code === "HTTP_401" || code === "HTTP_403") return true
  if (code.startsWith("AUTH_")) return true
  if (
    msg.includes("not authenticated") ||
    msg.includes("unauthorized") ||
    msg.includes("session expired") ||
    msg.includes("invalid token") ||
    msg.includes("token expired") ||
    msg.includes("please login") ||
    msg.includes("access denied") ||
    msg.includes("authentication required") ||
    msg.includes("jwt expired")
  ) {
    return true
  }
  return false
}

/** Clear stored session only for expired/invalid auth — not role-forbidden (403) responses. */
export function shouldClearSessionOnApiFailure(
  status: number | undefined,
  errorCode: string | undefined,
  errorMessage: string | undefined,
): boolean {
  const code = String(errorCode || "").toUpperCase()
  const msg = String(errorMessage || "").toLowerCase()

  // Wrong role / insufficient permission — keep the dealer logged in.
  if (status === 403 || code === "HTTP_403" || code === "AUTH_004") return false
  if (msg.includes("insufficient permissions") || msg.includes("access denied")) return false

  if (status === 401 || code === "HTTP_401" || code === "AUTH_001" || code === "AUTH_002" || code === "AUTH_003") {
    return true
  }

  if (
    msg.includes("session expired") ||
    msg.includes("token expired") ||
    msg.includes("invalid token") ||
    msg.includes("jwt expired") ||
    msg.includes("please login again")
  ) {
    return true
  }

  return false
}

/** Prefer `data`; if absent, return other top-level fields (e.g. `uploads`) for legacy backends. */
function unwrapApiResponseBody<T>(payload: ApiResponse<T>): T {
  if (payload.data !== undefined && payload.data !== null) {
    return payload.data as T
  }
  const { success: _success, error: _error, message: _message, ...rest } = payload as unknown as Record<string, unknown>
  if (Object.keys(rest).length > 0) {
    return rest as T
  }
  return payload as T
}

// Main API request function
async function apiRequest<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  console.log('[API] ========================================')
  console.log('[API] Starting API request')
  console.log('[API] Endpoint:', endpoint)
  console.log('[API] Method:', options.method || 'GET')
  console.log('[API] Requires Auth:', options.requiresAuth !== false)
  
  const { method = "GET", body, headers = {}, requiresAuth = true } = options

  const url = `${getApiBaseUrl()}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`
  console.log('[API] Full URL:', url)

  const requestHeaders: HeadersInit = {
    "Content-Type": "application/json",
    ...headers,
  }
  console.log('[API] Request headers (before auth):', { ...requestHeaders, Authorization: '***' })

  // Add auth token if required
  if (requiresAuth) {
    const token = getAuthToken()
    if (token) {
      requestHeaders.Authorization = `Bearer ${token}`
      console.log('[API] Auth token added (length):', token.length)
    } else {
      console.debug("[API] Skipped — auth required but no token (signed out?)", { endpoint, method })
      throw new ApiError("Unauthorized. Please login again.", "AUTH_003")
    }
  } else {
    console.log('[API] Auth not required for this request')
  }

  const config: RequestInit = {
    method,
    headers: requestHeaders,
  }

  if (body && method !== "GET") {
    console.log('[API] Request body present:', {
      type: typeof body,
      isObject: typeof body === 'object',
      keys: typeof body === 'object' ? Object.keys(body) : 'N/A'
    })
    
    // Log request body for quotation creation (for debugging)
    if (endpoint.includes('/quotations') && method === 'POST' && body) {
      console.log('[API] ===== QUOTATION CREATION REQUEST =====')
      console.log('[API] Quotation creation request body:', {
        hasSubtotal: 'subtotal' in body,
        subtotalValue: (body as any).subtotal,
        subtotalType: typeof (body as any).subtotal,
        hasTotalAmount: 'totalAmount' in body,
        totalAmountValue: (body as any).totalAmount,
        totalAmountType: typeof (body as any).totalAmount,
        hasFinalAmount: 'finalAmount' in body,
        finalAmountValue: (body as any).finalAmount,
        finalAmountType: typeof (body as any).finalAmount,
        rootLevelKeys: Object.keys(body),
        fullBody: JSON.stringify(body, null, 2)
      })
      console.log('[API] ========================================')
    }
    
    config.body = JSON.stringify(body)
    console.log('[API] Body serialized to JSON, length:', config.body.length)
    console.log('[API] Serialized body preview:', config.body.substring(0, 200) + (config.body.length > 200 ? '...' : ''))
  } else {
    console.log('[API] No request body (GET request or body not provided)')
  }

  console.log('[API] Final request config:', {
    method: config.method,
    url: url,
    hasBody: !!config.body,
    bodyLength: config.body && typeof config.body === 'string' ? config.body.length : 0,
    headersCount: Object.keys(config.headers || {}).length
  })

  try {
    console.log('[API] Sending fetch request...')
    const response = await fetch(url, config)
    console.log('[API] Response received:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries())
    })

    // Handle non-JSON responses
    const contentType = response.headers.get("content-type")
    console.log('[API] Response content-type:', contentType)
    
    if (!contentType?.includes("application/json")) {
      console.log('[API] Non-JSON response detected')
      if (response.ok) {
        console.log('[API] Response OK, returning as-is')
        return response as any
      }
      // For non-JSON error responses, extract text if possible
      console.log('[API] Non-JSON error response, extracting text...')
      const errorText = await response.text().catch(() => response.statusText)
      if (
        shouldQuietApiLog(options, requiresAuth, response.status, `HTTP_${response.status}`, errorText)
      ) {
        console.debug("[API] Non-JSON error (quiet):", { endpoint, method, status: response.status, errorText })
      } else {
        console.error("[API] Non-JSON error:", errorText)
      }
      throw new ApiError(
        errorText || `HTTP ${response.status}: ${response.statusText}`,
        `HTTP_${response.status}`
      )
    }

    console.log('[API] Parsing JSON response...')
    const data: ApiResponse<T> = await response.json()
    console.log('[API] Parsed response data:', {
      success: data.success,
      hasData: !!data.data,
      hasError: !!data.error,
      errorCode: data.error?.code,
      errorMessage: data.error?.message
    })

    // Handle API errors (success: false in response body)
    // Check this FIRST, even if response.ok is false, because API returns error structure in body
    if (!data.success || !response.ok) {
      const errorMessage = data.error?.message || `HTTP ${response.status}: ${response.statusText}` || "An error occurred"
      const errorCode = data.error?.code || (response.status === 401 ? "AUTH_001" : `HTTP_${response.status}`) || "API_ERROR"
      const errorDetails = data.error?.details || undefined
      const isUnauthorized = isApiAuthFailure(response.status, errorCode, errorMessage)
      const quietLog = shouldQuietApiLog(
        options,
        requiresAuth,
        response.status,
        errorCode,
        errorMessage,
      )

      // Expected after logout / expired session / optional endpoints — avoid scary console noise.
      if (quietLog) {
        console.debug("[API] Request failed (quiet)", {
          endpoint,
          method,
          errorMessage,
          errorCode,
          status: response.status,
        })
      } else {
        console.error("[API] ===== API ERROR DETECTED =====")
        // Log for debugging
        console.error("[API] API Error Response:", {
          status: response.status,
          statusText: response.statusText,
          message: errorMessage,
          code: errorCode,
          details: errorDetails,
          fullData: data,
        })
      }

      // Expired access token — refresh once, then retry the original request.
      if (
        response.status === 401 &&
        requiresAuth &&
        isUnauthorized &&
        !endpoint.includes("/auth/refresh") &&
        !endpoint.includes("/auth/login")
      ) {
        const refreshToken = getRefreshToken()
        if (refreshToken) {
          try {
            const refreshResponse = await apiRequest<{ token: string; expiresIn: number }>(
              "/auth/refresh",
              {
                method: "POST",
                requiresAuth: false,
                headers: {
                  Authorization: `Bearer ${refreshToken}`,
                },
                suppressErrorLog: true,
              },
            )
            saveAuthTokens(refreshResponse.token)
            return apiRequest<T>(endpoint, options)
          } catch (refreshError) {
            if (!quietLog) {
              console.error("[API] Token refresh failed:", refreshError)
            }
            clearAuthTokens()
            if (typeof window !== "undefined") {
              window.location.href = "/login"
            }
            throw new ApiError("Session expired. Please login again.", "AUTH_002")
          }
        }
      }

      if (requiresAuth && shouldClearSessionOnApiFailure(response.status, errorCode, errorMessage)) {
        clearAuthTokens()
      }

      // Special logging for quotation creation errors (skip noise for quiet failures)
      if (!quietLog && endpoint.includes("/quotations") && method === "POST") {
        console.error("[API] QUOTATION CREATION ERROR DETAILS:")
        if (errorDetails && Array.isArray(errorDetails)) {
          errorDetails.forEach((detail: any, index: number) => {
            console.error(`[API]   Error Detail ${index + 1}:`, {
              field: detail.field,
              message: detail.message,
            })
          })
        }
        console.error("[API] Request that failed:", {
          endpoint,
          method,
          bodyKeys: body && typeof body === "object" ? Object.keys(body) : "N/A",
          hasSubtotal: body && typeof body === "object" ? "subtotal" in body : false,
          hasTotalAmount: body && typeof body === "object" ? "totalAmount" in body : false,
          hasFinalAmount: body && typeof body === "object" ? "finalAmount" in body : false,
        })
      }
      if (!quietLog) {
        console.error("[API] =================================")
      }

      throw new ApiError(errorMessage, errorCode, errorDetails)
    }
    
    console.log('[API] Request successful, returning data')
    console.log('[API] Request completed successfully')
    console.log('[API] ========================================')
    return unwrapApiResponseBody<T>(data)
  } catch (error) {
    const quietLog =
      options.suppressErrorLog ||
      apiSignOutInProgress ||
      (typeof window !== "undefined" && requiresAuth && !getAuthToken()) ||
      (error instanceof ApiError &&
        isApiAuthFailure(undefined, error.code, error.message))

    if (quietLog) {
      console.debug("[API] Request failed (quiet, catch):", {
        endpoint,
        method,
        ...(error instanceof ApiError
          ? { code: error.code, message: error.message }
          : { message: error instanceof Error ? error.message : String(error) }),
      })
      if (error instanceof ApiError) throw error
      if (typeof window !== "undefined" && requiresAuth && !getAuthToken()) {
        throw new ApiError("Unauthorized. Please login again.", "AUTH_003")
      }
      throw error
    }

    console.error('[API] ===== EXCEPTION CAUGHT =====')
    console.error('[API] Error type:', error instanceof Error ? error.constructor.name : typeof error)
    console.error('[API] Error message:', error instanceof Error ? error.message : String(error))
    
    if (error instanceof ApiError) {
      console.error('[API] ApiError detected, re-throwing:', {
        message: error.message,
        code: error.code,
        hasDetails: !!error.details
      })
      console.error('[API] =================================')
      throw error
    }
    if (error instanceof Error) {
      console.error('[API] Generic Error detected')
      // Handle network/connection errors
      if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError") || error.message.includes("ERR_CONNECTION_REFUSED")) {
        console.error('[API] Network error detected:', error.message)
        console.error('[API] =================================')
        throw new ApiError(
          `Cannot connect to the server (${getApiBaseUrl()}). Check your internet connection.`,
          "NETWORK_ERROR"
        )
      }
      console.error('[API] Converting to ApiError with message:', error.message)
      console.error('[API] =================================')
      throw new ApiError(error.message, "NETWORK_ERROR")
    }
    console.error('[API] Unknown error type, converting to ApiError')
    console.error('[API] =================================')
    throw new ApiError("An unexpected error occurred", "UNKNOWN_ERROR")
  }
}

/** Clone multipart body so a second HTTP attempt does not reuse a consumed stream. */
function cloneFormData(formData: FormData): FormData {
  const next = new FormData()
  for (const [key, value] of formData.entries()) {
    next.append(key, value)
  }
  return next
}

const INSTALLATION_COMPLETION_PER_FIELD_KEYS = new Set([
  "homeFrontPhoto",
  "homeWithPersonPhoto",
  "inverterWithCustomerPhoto",
  "plantWithCustomerPhoto",
  "inverterSerialNumberPhoto",
  "panelSerialNumberPhoto",
  "geoTagPlantPhoto",
  "otherImages",
  "piUpload",
])

/**
 * Some backends only allow per-field Multer names (`homeFrontPhoto`, …) and reject
 * aggregate `installerCompletionImages` with "Unexpected or too many file fields".
 * Rebuild: map aggregate files via installerCompletionImageFieldOrderJson → field keys.
 */
function rebuildInstallationCompletionFormDataAsPerField(source: FormData): FormData {
  const next = new FormData()
  const aggregateFiles: File[] = []
  let order: string[] = []

  const orderRaw = source.get("installerCompletionImageFieldOrderJson")
  if (typeof orderRaw === "string" && orderRaw.trim()) {
    try {
      const parsed = JSON.parse(orderRaw)
      if (Array.isArray(parsed)) order = parsed.map((v) => String(v || "").trim()).filter(Boolean)
    } catch {
      order = []
    }
  }

  for (const [key, value] of source.entries()) {
    if (key === "installerCompletionImages" && value instanceof File) {
      aggregateFiles.push(value)
      continue
    }
    if (key === "installerCompletionImageFieldOrderJson") continue
    next.append(key, value)
  }

  aggregateFiles.forEach((file, index) => {
    const fieldKey = order[index] || "otherImages"
    next.append(fieldKey, file)
  })

  return next
}

/** Drop file parts that are not in the strict Multer allow-list (keep text + allowed files). */
function rebuildInstallationCompletionFormDataStrictAllowed(source: FormData): FormData {
  const next = new FormData()
  for (const [key, value] of source.entries()) {
    if (value instanceof File) {
      if (INSTALLATION_COMPLETION_PER_FIELD_KEYS.has(key) || key === "installerCompletionImages") {
        next.append(key, value)
      }
      continue
    }
    next.append(key, value)
  }
  return next
}

function isMulterUnexpectedFileError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  const msg = String(error.message || "").toLowerCase()
  const code = String(error.code || "").toUpperCase()
  return (
    code === "LIMIT_UNEXPECTED_FILE" ||
    code === "LIMIT_FILE_COUNT" ||
    msg.includes("unexpected field") ||
    msg.includes("unexpected or too many file") ||
    msg.includes("too many file") ||
    (msg.includes("unexpected") && msg.includes("file")) ||
    (code.includes("400") &&
      (msg.includes("file field") || msg.includes("multer") || msg.includes("too many")))
  )
}

// Multipart helper for file uploads through backend
async function multipartRequest<T = any>(endpoint: string, method: "POST" | "PATCH", formData: FormData): Promise<T> {
  const token = getAuthToken()
  const url = `${getApiBaseUrl()}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
    body: formData,
  })

  const contentType = response.headers.get("content-type")
  if (contentType?.includes("application/json")) {
    const data = await response.json()
    if (!response.ok || data?.success === false) {
      const message = data?.error?.message || response.statusText
      throw new ApiError(message, data?.error?.code || `HTTP_${response.status}`)
    }
    return data?.data || data
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText)
    throw new ApiError(errorText || `HTTP_${response.status}`)
  }

  return response as any
}

function parseUploadUrlCandidate(payload: any, preferredKeys: string[] = []): string | null {
  const root = payload?.data ?? payload
  if (!root || typeof root !== "object") return null

  const directKeys = [
    "url",
    "fileUrl",
    "file_url",
    "location",
    "path",
    ...preferredKeys,
  ]
  for (const key of directKeys) {
    const value = root[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }

  const nestedDocs = [root.documents, root.document, root.file]
  for (const nested of nestedDocs) {
    if (!nested || typeof nested !== "object") continue
    for (const key of preferredKeys) {
      const value = nested[key]
      if (typeof value === "string" && value.trim()) return value.trim()
      const urlValue = nested[`${key}Url`]
      if (typeof urlValue === "string" && urlValue.trim()) return urlValue.trim()
    }
  }

  return null
}

function operationalWorkflowBody(status: string, action?: string) {
  const body: Record<string, string | boolean> = {
    status,
    installationStatus: status,
    installation_status: status,
    meteringStatus: status,
    metering_status: status,
    // Admin Quotations → Metering may jump from pending_installer; backends that
    // gate the transition should honour any of these override flags.
    force: true,
    adminOverride: true,
    allowFromPendingInstaller: true,
    source: "admin",
  }
  if (action) body.action = action
  return body
}

async function trySilentApiStep(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn()
    return true
  } catch {
    return false
  }
}

async function patchOperationalWorkflowStatus(quotationId: string, status: string): Promise<boolean> {
  const body = operationalWorkflowBody(status)
  const endpoints = [
    `/admin/quotations/${quotationId}/installation-status`,
    `/admin/quotations/${quotationId}/workflow-status`,
    `/installer/quotations/${quotationId}/installation-status`,
    `/installer/quotations/${quotationId}/send-to-metering`,
    `/installer/quotations/${quotationId}/metering-handoff`,
    `/quotations/${quotationId}/metering-status`,
    `/quotations/${quotationId}/status`,
    `/metering/quotations/${quotationId}/status`,
  ]
  for (const endpoint of endpoints) {
    if (await trySilentApiStep(() => apiRequest(endpoint, { method: "PATCH", body }))) {
      return true
    }
  }
  return false
}

async function patchMeteringWorkflowAction(
  quotationId: string,
  action: "start" | "approve" | "send_to_mco",
): Promise<boolean> {
  const body = { action }
  const endpoints = [
    `/metering/quotations/${quotationId}/status`,
    `/metering/quotations/${quotationId}/decision`,
    `/quotations/${quotationId}/metering-status`,
  ]
  for (const endpoint of endpoints) {
    if (await trySilentApiStep(() => apiRequest(endpoint, { method: "PATCH", body }))) {
      return true
    }
  }
  return false
}

/**
 * Admin handoff: move quotation into metering queue as `pending_metering`.
 * Tries dedicated send-to-metering routes first, then generic workflow status.
 * When currently `pending_installer`, also tries a 2-step promote
 * (installer_approved → pending_metering) for backends that reject a direct jump.
 */
export async function sendQuotationToMetering(quotationId: string): Promise<boolean> {
  // Dedicated admin/installer handoff endpoints (preferred).
  const handoffBody = {
    ...operationalWorkflowBody("pending_metering"),
    target: "pending_metering",
    handoff: "metering",
  }
  const handoffEndpoints = [
    `/admin/quotations/${quotationId}/send-to-metering`,
    `/admin/quotations/${quotationId}/metering-handoff`,
    `/installer/quotations/${quotationId}/send-to-metering`,
    `/installer/quotations/${quotationId}/metering-handoff`,
  ]
  for (const endpoint of handoffEndpoints) {
    if (await trySilentApiStep(() => apiRequest(endpoint, { method: "PATCH", body: handoffBody }))) {
      return true
    }
    if (await trySilentApiStep(() => apiRequest(endpoint, { method: "POST", body: handoffBody }))) {
      return true
    }
  }

  if (await patchOperationalWorkflowStatus(quotationId, "pending_metering")) {
    return true
  }

  // Backends that reject pending_installer → pending_metering: step through.
  const stepped =
    (await patchOperationalWorkflowStatus(quotationId, "installer_approved")) &&
    (await patchOperationalWorkflowStatus(quotationId, "pending_metering"))
  return stepped
}

/** Try every admin/metering path to reach MCO; returns true if any call succeeded. */
export async function forceAdvanceQuotationToMco(quotationId: string): Promise<boolean> {
  let ok = false
  ok = (await patchOperationalWorkflowStatus(quotationId, "pending_metering")) || ok
  ok = (await patchMeteringWorkflowAction(quotationId, "start")) || ok
  ok = (await patchMeteringWorkflowAction(quotationId, "approve")) || ok
  ok = (await patchOperationalWorkflowStatus(quotationId, "metering_approved")) || ok
  ok = (await patchMeteringWorkflowAction(quotationId, "send_to_mco")) || ok
  ok = (await patchOperationalWorkflowStatus(quotationId, "mco")) || ok
  return ok
}

/** Load rows sent from Payment Management — tries account + admin list endpoints. */
export async function fetchSentToInstallerQuotationRows(): Promise<any[]> {
  const queryAttempts = [
    "/admin/quotations?limit=1000&installationReadyForInstaller=true",
    "/admin/quotations?limit=1000&status=approved",
    "/quotations?status=approved&limit=1000",
    "/admin/quotations?limit=1000",
  ]
  let best: any[] = []
  for (const path of queryAttempts) {
    try {
      const response = await apiRequest(path, { suppressErrorLog: true })
      const rows = extractQuotationListFromApiResponse(response)
      if (rows.length === 0) continue
      const releaseMap = readInstallerReleaseMap()
      const sent = rows.filter((row) => {
        const flat = flattenQuotationListRow(row)
        return isQuotationSentToInstaller(flat, releaseMap)
      })
      if (sent.length > 0) return sent
      if (rows.length > best.length) best = rows
    } catch {
      // try next endpoint
    }
  }
  // Fallback: full list — caller filters with release map
  return best
}

// API Service Methods
export const api = {
  // Authentication
  auth: {
    login: async (username: string, password: string) => {
      const response = await apiRequest<{
        token: string
        refreshToken: string
        user: {
          id: string
          username: string
          firstName: string
          lastName: string
          email: string
          role: string
        }
        expiresIn: number
      }>("/auth/login", {
        method: "POST",
        body: { username, password },
        requiresAuth: false,
      })

      saveAuthTokens(response.token, response.refreshToken)
      return response
    },

    logout: async () => {
      const token = getAuthToken()
      // Clear tokens immediately so no new apiRequest attaches Authorization while navigation runs.
      clearAuthTokens()
      if (!token) return
      try {
        const url = `${getApiBaseUrl()}/auth/logout`
        await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
      } catch {
        // Ignore network errors on logout
      }
    },

    refreshToken: async () => {
      const refreshToken = getRefreshToken()
      if (!refreshToken) throw new ApiError("No refresh token available", "AUTH_002")

      const response = await apiRequest<{ token: string; expiresIn: number }>("/auth/refresh", {
        method: "POST",
        requiresAuth: false,
        headers: {
          Authorization: `Bearer ${refreshToken}`,
        },
      })

      saveAuthTokens(response.token)
      return response
    },

    changePassword: async (currentPassword: string, newPassword: string) => {
      return apiRequest("/auth/change-password", {
        method: "PUT",
        body: { currentPassword, newPassword },
      })
    },

    resetPassword: async (username: string, oldPassword: string, newPassword: string) => {
      return apiRequest("/auth/reset-password", {
        method: "POST",
        body: { username, oldPassword, newPassword },
        requiresAuth: false,
      })
    },

    forgotPassword: async (username: string, dateOfBirth: string, newPassword: string) => {
      return apiRequest("/auth/forgot-password", {
        method: "POST",
        body: { username, dateOfBirth, newPassword },
        requiresAuth: false,
      })
    },
  },

  // Dealers
  dealers: {
    register: async (dealerData: any) => {
      return apiRequest("/dealers/register", {
        method: "POST",
        body: dealerData,
        requiresAuth: false,
      })
    },

    getProfile: async () => {
      return apiRequest("/dealers/me")
    },

    updateProfile: async (profileData: any) => {
      return apiRequest("/dealers/me", {
        method: "PUT",
        body: profileData,
      })
    },

    getStatistics: async (startDate?: string, endDate?: string) => {
      const params = new URLSearchParams()
      if (startDate) params.append("startDate", startDate)
      if (endDate) params.append("endDate", endDate)
      const query = params.toString()
      return apiRequest(`/dealers/me/statistics${query ? `?${query}` : ""}`)
    },

    getVisitors: async (params?: {
      search?: string
      isActive?: boolean
    }) => {
      const queryParams = new URLSearchParams()
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined) queryParams.append(key, String(value))
        })
      }
      // Ask backends that support it to include dealers/ops with Visitor access checkbox
      if (!queryParams.has("includeAccessUsers")) queryParams.set("includeAccessUsers", "true")
      if (!queryParams.has("access")) queryParams.set("access", "visitor")
      const query = queryParams.toString()
      const paths = [
        `/dealers/visitors?${query}`,
        `/dealers/me/visitors?${query}`,
        `/visitors/assignable?${query}`,
        `/visitors?${query}`,
      ]
      let lastError: unknown = null
      for (const path of paths) {
        try {
          return await apiRequest(path, { suppressErrorLog: path !== paths[0] })
        } catch (error) {
          lastError = error
          if (!(error instanceof ApiError)) throw error
          const retryable =
            error.code === "HTTP_404" ||
            error.code === "HTTP_405" ||
            error.code === "HTTP_501" ||
            error.code === "AUTH_004" ||
            error.code === "HTTP_403"
          if (!retryable) throw error
        }
      }
      throw lastError instanceof Error ? lastError : new ApiError("Visitors list unavailable", "HTTP_404")
    },

    getCallingQueueNext: async () => {
      const tryPaths = [
        "/dealers/me/calling-queue/next",
        "/dealers/me/lead-queue/next",
        "/dealers/me/calling-queue/current",
        "/dealers/me/lead-queue/current",
      ]
      let lastError: unknown = null
      for (const path of tryPaths) {
        try {
          return await apiRequest(path, { suppressErrorLog: path !== tryPaths[0] })
        } catch (error) {
          lastError = error
          if (!(error instanceof ApiError)) throw error
          // Try next alias on missing/broken routes (500 SYS_001 on /current is common).
          const retryable =
            error.code === "HTTP_404" ||
            error.code === "HTTP_405" ||
            error.code === "HTTP_500" ||
            error.code === "HTTP_501" ||
            error.code === "SYS_001" ||
            /internal server error/i.test(error.message)
          if (!retryable) throw error
        }
      }
      throw lastError instanceof Error ? lastError : new ApiError("Calling queue unavailable", "SYS_001")
    },

    getCallingQueueCurrent: async () => {
      const tryPaths = [
        "/dealers/me/calling-queue/current",
        "/dealers/me/lead-queue/current",
        "/dealers/me/calling-queue/next",
        "/dealers/me/lead-queue/next",
      ]
      let lastError: unknown = null
      for (const path of tryPaths) {
        try {
          return await apiRequest(path, { suppressErrorLog: path !== tryPaths[0] })
        } catch (error) {
          lastError = error
          if (!(error instanceof ApiError)) throw error
          const retryable =
            error.code === "HTTP_404" ||
            error.code === "HTTP_405" ||
            error.code === "HTTP_500" ||
            error.code === "HTTP_501" ||
            error.code === "SYS_001" ||
            /internal server error/i.test(error.message)
          if (!retryable) throw error
        }
      }
      throw lastError instanceof Error ? lastError : new ApiError("Calling queue unavailable", "SYS_001")
    },

    updateCallingLeadAction: async (
      leadId: string,
      payload: {
        action: "start" | "called" | "follow_up" | "not_interested" | "rescheduled"
        callRemark?: string
        call_remark?: string
        statusCategory?: string
        status_category?: string
        statusText?: string
        status_text?: string
        remark?: string
        nextFollowUpAt?: string
        actionAt?: string
        /** Optional: backends that auto-assign pool leads on start */
        claim?: boolean
        autoAssign?: boolean
        assignedDealerId?: string
      },
    ) => {
      return apiRequest(`/dealers/me/calling-queue/${leadId}/action`, {
        method: "PATCH",
        body: payload,
      })
    },

    /** Claim a pool lead before start (404 = endpoint not implemented — caller may retry action only). */
    claimCallingLead: async (leadId: string) => {
      try {
        return await apiRequest(`/dealers/me/calling-queue/${leadId}/claim`, { method: "POST" })
      } catch (error) {
        if (error instanceof ApiError && (error.code === "HTTP_404" || error.code === "HTTP_405")) {
          return null
        }
        throw error
      }
    },

    /** Try common backend paths to assign a pool lead to the logged-in dealer. */
    assignCallingLeadToMe: async (leadId: string, dealerId: string) => {
      const body = { assignedDealerId: dealerId, dealerId, status: "assigned" }
      const attempts: Array<() => Promise<unknown>> = [
        () => apiRequest(`/dealers/me/calling-queue/${leadId}/claim`, { method: "POST", body }),
        () => apiRequest(`/dealers/me/calling-queue/${leadId}/assign`, { method: "POST", body }),
        () =>
          apiRequest(`/dealers/me/calling-queue/${leadId}`, {
            method: "PATCH",
            body,
          }),
        () =>
          apiRequest(`/dealers/me/calling-queue/${leadId}/action`, {
            method: "PATCH",
            body: { action: "start", claim: true, autoAssign: true, assignedDealerId: dealerId },
          }),
      ]
      for (const run of attempts) {
        try {
          return await run()
        } catch (error) {
          if (error instanceof ApiError && (error.code === "HTTP_404" || error.code === "HTTP_405")) {
            continue
          }
        }
      }
      return null
    },

    /** Dealer-scoped calling action history (same data as Admin Calling Reports for this login). */
    callingActions: {
      getAll: async (params?: {
        page?: number
        limit?: number
        dealerId?: string
        search?: string
        startDate?: string
        endDate?: string
        range?: "daily" | "weekly" | "monthly" | "last_month" | "all" | "custom"
      }) => {
        const queryParams = new URLSearchParams()
        if (params) {
          Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) queryParams.append(key, String(value))
          })
        }
        const query = queryParams.toString()
        const querySuffix = query ? `?${query}` : ""

        const endpoints = [
          `/dealers/me/calling-actions${querySuffix}`,
          `/dealers/me/calling-queue/actions${querySuffix}`,
          `/dealers/calling-actions${querySuffix}`,
        ]

        let lastError: unknown = null
        for (const endpoint of endpoints) {
          try {
            return await apiRequest(endpoint)
          } catch (error) {
            lastError = error
            const isMissingOrForbidden =
              error instanceof ApiError &&
              (error.code === "HTTP_404" ||
                error.code === "HTTP_405" ||
                error.code === "HTTP_501" ||
                error.code === "HTTP_403")
            if (!isMissingOrForbidden) throw error
          }
        }

        throw lastError
      },
    },
  },

  // Customers
  customers: {
    create: async (customerData: any) => {
      return apiRequest("/customers", {
        method: "POST",
        body: customerData,
      })
    },

    getAll: async (params?: {
      page?: number
      limit?: number
      search?: string
      sortBy?: string
      sortOrder?: "asc" | "desc"
    }) => {
      const queryParams = new URLSearchParams()
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined) queryParams.append(key, String(value))
        })
      }
      const query = queryParams.toString()
      return apiRequest(`/customers${query ? `?${query}` : ""}`)
    },

    getById: async (customerId: string) => {
      return apiRequest(`/customers/${customerId}`)
    },

    update: async (customerId: string, customerData: any) => {
      return apiRequest(`/customers/${customerId}`, {
        method: "PUT",
        body: customerData,
      })
    },
  },

  // Quotations
  quotations: {
    create: async (quotationData: any) => {
      return apiRequest("/quotations", {
        method: "POST",
        body: quotationData,
      })
    },

    getProductCatalog: async () => {
      return apiRequest("/quotations/product-catalog", {
        method: "GET",
        requiresAuth: true,
      })
    },

    getPricingTables: async () => {
      return apiRequest("/quotations/pricing-tables", {
        method: "GET",
        requiresAuth: true,
        suppressErrorLog: true,
      })
    },

    /** Admin: replace catalog set prices (dcr / nonDcr / both / components). See BACKEND_PRICING_TABLES_API.md */
    updatePricingTables: async (pricingTables: Record<string, unknown>) => {
      return apiRequest("/quotations/pricing-tables", {
        method: "PUT",
        body: pricingTables,
        requiresAuth: true,
      })
    },

    getAll: async (params?: {
      page?: number
      limit?: number
      status?: string
      search?: string
      startDate?: string
      endDate?: string
      sortBy?: string
      sortOrder?: "asc" | "desc"
    }) => {
      const queryParams = new URLSearchParams()
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined) queryParams.append(key, String(value))
        })
      }
      const query = queryParams.toString()
      return apiRequest(`/quotations${query ? `?${query}` : ""}`)
    },

    getById: async (quotationId: string) => {
      return apiRequest(`/quotations/${quotationId}`)
    },

    /**
     * Mark this quotation as the current one for its customer.
     * Other quotations for the same customer become previous (is_current=false).
     * Backend: POST /quotations/:id/restore-current (see §23).
     */
    restoreAsCurrent: async (quotationId: string) => {
      const attempts = [
        { method: "POST" as const, path: `/quotations/${quotationId}/restore-current` },
        { method: "POST" as const, path: `/quotations/${quotationId}/set-current` },
        {
          method: "PATCH" as const,
          path: `/quotations/${quotationId}`,
          body: { isCurrent: true, is_current: true },
        },
      ]
      let lastError: unknown
      for (const attempt of attempts) {
        try {
          return await apiRequest(attempt.path, {
            method: attempt.method,
            ...(attempt.body ? { body: attempt.body } : {}),
          })
        } catch (error) {
          lastError = error
          const retryable =
            error instanceof ApiError &&
            (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
          if (!retryable) throw error
        }
      }
      throw lastError
    },

    updateDiscount: async (quotationId: string, discount: number | string) => {
      return apiRequest(`/quotations/${quotationId}/discount`, {
        method: "PATCH",
        body: { discount },
      })
    },

    updatePaymentDetails: async (
      quotationId: string,
      paymentData: {
        paymentType?: string
        paymentMode?: string
        paymentStatus?: "pending" | "partial" | "completed"
        phases?: Array<{
          phaseNumber: number
          phaseName: string
          amount: number
          paidAmount: number
          status: "pending" | "partial" | "completed"
          dueDate?: string
          paymentDate?: string
          paymentMode?: string
          transactionId?: string
          note?: string
        }>
        /** Account Management subsidy cheque audit (optional; backend should persist JSON). */
        subsidyCheques?: Array<{
          id: string
          details: string
          amount: number
          status: "pending" | "cleared"
          clearedAt?: string
        }>
        /** Manual site cost (INR) — Account Management profit = subtotal − siteCost. */
        siteCost?: number
        site_cost?: number
        /** When true, backend must replace all installment rows with `phases` (not merge). */
        replaceInstallments?: boolean
        /** Final settlement write-off (INR). Backend should add to discountAmount and set remaining=0. */
        finalSettlementAmount?: number
        finalSettlementApplied?: boolean
        remaining?: number
        remainingAmount?: number
      },
    ) => {
      const hasPhases = Array.isArray(paymentData.phases)
      const replaceInstallments = hasPhases
        ? (paymentData.replaceInstallments ?? true)
        : false

      const siteCostPayload =
        paymentData.siteCost != null || paymentData.site_cost != null
          ? {
              siteCost: Math.max(
                0,
                Math.round(Number(paymentData.siteCost ?? paymentData.site_cost) || 0),
              ),
              site_cost: Math.max(
                0,
                Math.round(Number(paymentData.siteCost ?? paymentData.site_cost) || 0),
              ),
            }
          : {}

      // Status / settlement-only update — do not touch installment rows (avoids
      // "paid cannot exceed payable after discount" when AM cap ≠ pricing payable).
      if (!hasPhases) {
        const statusBody: Record<string, unknown> = {
          paymentStatus: paymentData.paymentStatus,
          paymentType: paymentData.paymentType,
          paymentMode: paymentData.paymentMode,
          replaceInstallments: false,
          ...siteCostPayload,
          ...(paymentData.finalSettlementAmount != null
            ? { finalSettlementAmount: paymentData.finalSettlementAmount }
            : {}),
          ...(paymentData.finalSettlementApplied != null
            ? { finalSettlementApplied: paymentData.finalSettlementApplied }
            : {}),
          ...(paymentData.remaining != null ? { remaining: paymentData.remaining } : {}),
          ...(paymentData.remainingAmount != null
            ? { remainingAmount: paymentData.remainingAmount }
            : {}),
          ...(paymentData.subsidyCheques?.length
            ? { subsidyCheques: paymentData.subsidyCheques }
            : {}),
        }
        const statusAttempts: Array<{
          endpoint: string
          method: "PATCH" | "PUT" | "POST"
          body: Record<string, unknown>
        }> = [
          {
            endpoint: `/quotations/${quotationId}/payment-details`,
            method: "PATCH",
            body: statusBody,
          },
          {
            endpoint: `/quotations/${quotationId}/final-settlement`,
            method: "POST",
            body: {
              amount: paymentData.finalSettlementAmount,
              paymentStatus: paymentData.paymentStatus ?? "completed",
            },
          },
          {
            endpoint: `/quotations/${quotationId}/payment-mode`,
            method: "PATCH",
            body: {
              paymentMode: paymentData.paymentMode,
              paymentStatus: paymentData.paymentStatus,
            },
          },
        ]

        let lastStatusError: unknown = null
        for (const attempt of statusAttempts) {
          try {
            return await apiRequest(attempt.endpoint, {
              method: attempt.method,
              body: attempt.body,
            })
          } catch (error) {
            lastStatusError = error
            const retryableMissingEndpoint =
              error instanceof ApiError &&
              (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
            if (!retryableMissingEndpoint) throw error
          }
        }
        throw lastStatusError
      }

      const bodyWithReplace = {
        ...paymentData,
        ...siteCostPayload,
        replaceInstallments,
        installments: paymentData.phases,
      }
      const attempts: Array<{ endpoint: string; method: "PATCH" | "PUT"; body: Record<string, any> }> = [
        {
          endpoint: `/quotations/${quotationId}/installments`,
          method: "PUT",
          body: {
            installments: paymentData.phases,
            replace: true,
            replaceInstallments: true,
            paymentStatus: paymentData.paymentStatus,
            paymentType: paymentData.paymentType,
            paymentMode: paymentData.paymentMode,
            ...siteCostPayload,
            ...(paymentData.subsidyCheques?.length ? { subsidyCheques: paymentData.subsidyCheques } : {}),
          },
        },
        {
          endpoint: `/quotations/${quotationId}/payment-details`,
          method: "PATCH",
          body: bodyWithReplace,
        },
        {
          endpoint: `/quotations/${quotationId}/installments`,
          method: "PATCH",
          body: {
            installments: paymentData.phases,
            replace: true,
            replaceInstallments: true,
            paymentStatus: paymentData.paymentStatus,
            ...siteCostPayload,
            ...(paymentData.subsidyCheques?.length ? { subsidyCheques: paymentData.subsidyCheques } : {}),
          },
        },
        {
          endpoint: `/quotations/${quotationId}/payment-mode`,
          method: "PATCH",
          body: { paymentMode: paymentData.paymentMode },
        },
      ]

      let lastError: unknown = null
      for (const attempt of attempts) {
        try {
          return await apiRequest(attempt.endpoint, {
            method: attempt.method,
            body: attempt.body,
          })
        } catch (error) {
          lastError = error
          const retryableMissingEndpoint =
            error instanceof ApiError &&
            (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
          if (!retryableMissingEndpoint) throw error
        }
      }

      throw lastError
    },

    /**
     * Persist Account Management “Cost of site” (INR) without touching installments.
     * PATCH /quotations/:id/payment-details { siteCost, site_cost, replaceInstallments: false }
     */
    updateSiteCost: async (quotationId: string, siteCost: number) => {
      const amount = Math.max(0, Math.round(Number(siteCost) || 0))
      const body = {
        siteCost: amount,
        site_cost: amount,
        costOfSite: amount,
        cost_of_site: amount,
        replaceInstallments: false,
      }
      const endpoints = [
        `/quotations/${quotationId}/payment-details`,
        `/quotations/${quotationId}/site-cost`,
        `/admin/quotations/${quotationId}/payment-details`,
        `/admin/quotations/${quotationId}/site-cost`,
      ]
      let lastError: unknown = null
      for (const endpoint of endpoints) {
        try {
          return await apiRequest(endpoint, { method: "PATCH", body })
        } catch (error) {
          lastError = error
          const retryable =
            error instanceof ApiError &&
            (error.code === "HTTP_404" ||
              error.code === "HTTP_405" ||
              error.code === "HTTP_501" ||
              error.code === "HTTP_400")
          // Some stacks 400 on unknown fields — try next alias endpoint.
          if (!retryable) {
            const msg = String((error as Error)?.message || "").toLowerCase()
            if (msg.includes("site") || msg.includes("unknown") || msg.includes("not allowed")) {
              continue
            }
            throw error
          }
        }
      }
      throw lastError
    },

    /**
     * Account Management — upload PI / proforma documents (PDF, images; multiple).
     * Multipart: repeated `piUpload` file parts.
     * Retained URLs: `existingPiUploadUrlsJson` (+ singular `existingPiUploadUrl` when length === 1).
     * `replacePiUploads=true` when syncing removals (set list to existingUrls only).
     */
    uploadPiDocuments: async (
      quotationId: string,
      files: File[],
      existingUrls: string[] = [],
      options?: { replace?: boolean },
    ) => {
      const formData = new FormData()
      for (const file of files) {
        formData.append("piUpload", file)
      }
      const retained = existingUrls.map(String).map((s) => s.trim()).filter(Boolean)
      if (retained.length === 1) {
        formData.append("existingPiUploadUrl", retained[0])
      }
      if (retained.length > 0) {
        formData.append("existingPiUploadUrlsJson", JSON.stringify(retained))
      }
      const replace = options?.replace === true || (files.length === 0 && options?.replace !== false)
      formData.append("replacePiUploads", replace ? "true" : "false")
      formData.append("replace_pi_uploads", replace ? "true" : "false")

      const endpoints = [
        `/quotations/${quotationId}/pi-upload`,
        `/quotations/${quotationId}/pi-documents`,
        `/account-management/quotations/${quotationId}/pi-upload`,
        `/admin/quotations/${quotationId}/pi-upload`,
        `/admin/quotations/${quotationId}/installer-documents`,
        `/quotations/${quotationId}/documents`,
        `/installer/quotations/${quotationId}/documents`,
      ]

      let lastError: unknown = null
      for (const endpoint of endpoints) {
        try {
          return await multipartRequest(endpoint, "POST", cloneFormData(formData))
        } catch (error) {
          lastError = error
          const retryable =
            error instanceof ApiError &&
            (error.code === "HTTP_404" ||
              error.code === "HTTP_405" ||
              error.code === "HTTP_501" ||
              error.code === "HTTP_403" ||
              error.code === "AUTH_004" ||
              isMulterUnexpectedFileError(error))
          if (!retryable) throw error
        }
      }

      // Fallback: single-file asset uploads then merge retained URLs.
      if (files.length > 0) {
        const uploadedUrls: string[] = []
        for (const file of files) {
          try {
            const url = await api.installer.uploadCompletionAsset(quotationId, "piUpload", file)
            if (url) uploadedUrls.push(url)
          } catch {
            /* try next */
          }
        }
        if (uploadedUrls.length > 0) {
          return {
            success: true,
            piUploadUrls: replace ? [...retained, ...uploadedUrls] : [...retained, ...uploadedUrls],
            piUploadUrl: retained[0] || uploadedUrls[0],
          }
        }
      }

      // Removal-only sync with no new files — some stacks accept empty multipart + JSON list.
      if (files.length === 0 && replace) {
        try {
          return await apiRequest(`/quotations/${quotationId}/pi-upload`, {
            method: "PATCH",
            body: {
              piUploadUrls: retained,
              pi_upload_urls: retained,
              piUploadUrl: retained[0] || null,
              replacePiUploads: true,
            },
          })
        } catch (error) {
          lastError = error
        }
      }

      throw lastError instanceof ApiError
        ? lastError
        : new ApiError(
            "PI upload endpoint is not available. Backend needs POST /quotations/:id/pi-upload (multipart piUpload, multiple).",
            "HTTP_404",
          )
    },

    /**
     * Final Settlement — persist to DB. Settlement amount (Remaining) becomes discount `d`,
     * paymentStatus=completed, remaining=0. Tries an atomic endpoint first, then
     * pricing + status-only payment-details. Throws if nothing persisted server-side.
     *
     * Returns the server payload (updated quotation slice) on success.
     */
    finalizeSettlement: async (
      quotationId: string,
      payload: {
        /** Remaining written off (the discount `d`), in INR. */
        settlementAmount: number
        /** Total discount to persist on the quotation (existing + settlementAmount), in INR. */
        discountAmount: number
        /** amountAfterSubsidy - discountAmount (payable after discount). */
        finalAmount: number
        paymentType?: string
        paymentMode?: string
        /** Existing installments (unchanged) — used to persist via the proven payment-details path. */
        phases?: Array<{
          phaseNumber: number
          phaseName: string
          amount: number
          paidAmount: number
          status: "pending" | "partial" | "completed"
          dueDate?: string
          paymentDate?: string
          paymentMode?: string
          transactionId?: string
          note?: string
        }>
      },
    ) => {
      // Diagnostics: record every attempt so we can see exactly what the backend returns.
      const attemptLog: Array<{ endpoint: string; ok: boolean; code?: string; message?: string }> = []
      const logAttempt = (endpoint: string, error?: unknown) => {
        if (!error) {
          attemptLog.push({ endpoint, ok: true })
        } else {
          attemptLog.push({
            endpoint,
            ok: false,
            code: error instanceof ApiError ? error.code : "UNKNOWN",
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }
      const atomicBody = {
        amount: payload.settlementAmount,
        settlementAmount: payload.settlementAmount,
        discountAmount: payload.discountAmount,
        finalAmount: payload.finalAmount,
        paymentStatus: "completed" as const,
        remaining: 0,
        remainingAmount: 0,
        finalSettlementApplied: true,
      }

      const isMissingEndpoint = (error: unknown) =>
        error instanceof ApiError &&
        (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")

      // A 5xx on one endpoint (buggy handler) shouldn't stop us trying the others.
      const isServerError = (error: unknown) =>
        error instanceof ApiError &&
        (error.code === "HTTP_500" ||
          error.code === "HTTP_502" ||
          error.code === "HTTP_503" ||
          error.code === "HTTP_504")

      // Server already considers the balance cleared (its amountAfterSubsidy < AM subtotal),
      // so it rejects a write-off it thinks is unnecessary. That's still "settled" —
      // fall through to persist the completed/settled FLAG so all logins see it.
      const isServerAlreadyCleared = (error: unknown) => {
        if (!(error instanceof ApiError)) return false
        const m = String(error.message || "").toLowerCase()
        return (
          m.includes("cannot exceed remaining") ||
          m.includes("remaining (0)") ||
          m.includes("remaining 0") ||
          m.includes("already settled") ||
          m.includes("already completed") ||
          m.includes("nothing to settle") ||
          m.includes("paid") && m.includes("exceed")
        )
      }

      let lastError: unknown = null

      const dumpDiagnostics = () => {
        try {
          console.warn("[Final settlement] attempts:", JSON.stringify(attemptLog, null, 2))
        } catch {
          console.warn("[Final settlement] attempts:", attemptLog)
        }
      }

      const pickVerificationPayload = (raw: any): Record<string, any> => {
        if (!raw || typeof raw !== "object") return {}
        if (raw.data && typeof raw.data === "object") return raw.data as Record<string, any>
        return raw as Record<string, any>
      }

      const verifyPersistedOnServer = async (): Promise<{ ok: boolean; reason?: string }> => {
        try {
          const fresh = await apiRequest(`/quotations/${quotationId}?_settle_verify=${Date.now()}`, {
            suppressErrorLog: true,
          })
          const p = pickVerificationPayload(fresh)
          const pricing = (p.pricing || {}) as Record<string, any>
          const discount = Number(
            p.discountAmount ?? pricing.discountAmount ?? p.discount ?? 0,
          )
          const remaining = Number(p.remaining ?? p.remainingAmount ?? NaN)
          const paymentStatus = String(p.paymentStatus ?? p.payment_status ?? "").toLowerCase()
          const finalSettlementApplied =
            p.finalSettlementApplied === true ||
            p.final_settlement_applied === true ||
            pricing.finalSettlementApplied === true
          const finalSettlementAmount = Number(
            p.finalSettlementAmount ?? p.final_settlement_amount ?? 0,
          )

          const settled =
            finalSettlementApplied ||
            finalSettlementAmount >= Math.max(1, payload.settlementAmount - 0.5) ||
            (paymentStatus === "completed" &&
              Number.isFinite(remaining) &&
              remaining <= 0 &&
              discount >= payload.discountAmount - 0.5)

          if (settled) return { ok: true }
          return {
            ok: false,
            reason: `verify failed: discount=${discount}, remaining=${remaining}, paymentStatus=${paymentStatus}, finalSettlementApplied=${finalSettlementApplied}, finalSettlementAmount=${finalSettlementAmount}`,
          }
        } catch (error) {
          return {
            ok: false,
            reason: error instanceof Error ? error.message : String(error),
          }
        }
      }

      // 1) Preferred: single atomic endpoint that persists discount + status + remaining.
      try {
        const res = await apiRequest(`/quotations/${quotationId}/final-settlement`, {
          method: "POST",
          body: atomicBody,
        })
        const verified = await verifyPersistedOnServer()
        if (verified.ok) {
          logAttempt("POST /final-settlement")
          return res
        }
        logAttempt("POST /final-settlement", new ApiError(verified.reason || "Verify failed", "VERIFY_FAILED"))
        lastError = new ApiError(
          `Server accepted /final-settlement but data not persisted (${verified.reason || "unknown"})`,
          "VERIFY_FAILED",
        )
      } catch (error) {
        logAttempt("POST /final-settlement", error)
        if (!isMissingEndpoint(error) && !isServerAlreadyCleared(error) && !isServerError(error)) {
          dumpDiagnostics()
          throw error
        }
        lastError = error
      }

      // 2) Persist discount via pricing, then complete payment (no installment rewrite).
      try {
        const res = await apiRequest(`/quotations/${quotationId}/pricing`, {
          method: "PATCH",
          body: {
            discountAmount: payload.discountAmount,
            totalAmount: payload.finalAmount,
            finalAmount: payload.finalAmount,
          },
        })
        logAttempt("PATCH /pricing")
        try {
          await apiRequest(`/quotations/${quotationId}/payment-details`, {
            method: "PATCH",
            body: {
              paymentType: payload.paymentType,
              paymentMode: payload.paymentMode,
              paymentStatus: "completed",
              replaceInstallments: false,
              finalSettlementApplied: true,
              finalSettlementAmount: payload.settlementAmount,
              remaining: 0,
              remainingAmount: 0,
            },
          })
          logAttempt("PATCH /payment-details (status)")
        } catch (statusErr) {
          logAttempt("PATCH /payment-details (status)", statusErr)
        }
        const verified = await verifyPersistedOnServer()
        if (verified.ok) {
          dumpDiagnostics()
          return res
        }
        logAttempt("VERIFY after PATCH /pricing", new ApiError(verified.reason || "Verify failed", "VERIFY_FAILED"))
        lastError = new ApiError(
          `Server accepted /pricing but data not persisted (${verified.reason || "unknown"})`,
          "VERIFY_FAILED",
        )
      } catch (error) {
        logAttempt("PATCH /pricing", error)
        if (!isServerAlreadyCleared(error)) lastError = error
      }

      // 3) Discount endpoint (absolute INR) — core quotation feature, most likely to work.
      try {
        const res = await apiRequest(`/quotations/${quotationId}/discount`, {
          method: "PATCH",
          body: { discount: payload.discountAmount },
        })
        logAttempt("PATCH /discount")
        const verified = await verifyPersistedOnServer()
        if (verified.ok) {
          dumpDiagnostics()
          return res
        }
        logAttempt("VERIFY after PATCH /discount", new ApiError(verified.reason || "Verify failed", "VERIFY_FAILED"))
        lastError = new ApiError(
          `Server accepted /discount but data not persisted (${verified.reason || "unknown"})`,
          "VERIFY_FAILED",
        )
      } catch (error) {
        logAttempt("PATCH /discount", error)
        if (!isServerAlreadyCleared(error)) lastError = error
      }

      // 4) PROVEN PATH — payment-details WITH installments. This is the same call the normal
      // "Submit installments" uses and that the backend already persists reliably. Send the
      // existing (unchanged) phases plus the settlement fields so status + flags land in the DB.
      if (Array.isArray(payload.phases)) {
        try {
          const res = await apiRequest(`/quotations/${quotationId}/payment-details`, {
            method: "PATCH",
            body: {
              paymentType: payload.paymentType,
              paymentMode: payload.paymentMode,
              paymentStatus: "completed",
              replaceInstallments: true,
              installments: payload.phases,
              phases: payload.phases,
              discountAmount: payload.discountAmount,
              finalSettlementApplied: true,
              finalSettlementAmount: payload.settlementAmount,
              remaining: 0,
              remainingAmount: 0,
            },
          })
          logAttempt("PATCH /payment-details (phases)")
          const verified = await verifyPersistedOnServer()
          if (verified.ok) {
            dumpDiagnostics()
            return res
          }
          logAttempt(
            "VERIFY after PATCH /payment-details (phases)",
            new ApiError(verified.reason || "Verify failed", "VERIFY_FAILED"),
          )
          lastError = new ApiError(
            `Server accepted /payment-details(phases) but data not persisted (${verified.reason || "unknown"})`,
            "VERIFY_FAILED",
          )
        } catch (error) {
          logAttempt("PATCH /payment-details (phases)", error)
          if (!isServerAlreadyCleared(error)) lastError = error
        }
      }

      // 5) Last resort — flag-only payment-details (no discount, no phases).
      try {
        const res = await apiRequest(`/quotations/${quotationId}/payment-details`, {
          method: "PATCH",
          body: {
            paymentType: payload.paymentType,
            paymentMode: payload.paymentMode,
            paymentStatus: "completed",
            replaceInstallments: false,
            finalSettlementApplied: true,
            finalSettlementAmount: payload.settlementAmount,
            remaining: 0,
            remainingAmount: 0,
          },
        })
        logAttempt("PATCH /payment-details (flag-only)")
        const verified = await verifyPersistedOnServer()
        if (verified.ok) {
          dumpDiagnostics()
          return res
        }
        logAttempt(
          "VERIFY after PATCH /payment-details (flag-only)",
          new ApiError(verified.reason || "Verify failed", "VERIFY_FAILED"),
        )
        lastError = new ApiError(
          `Server accepted /payment-details(flag-only) but data not persisted (${verified.reason || "unknown"})`,
          "VERIFY_FAILED",
        )
      } catch (error) {
        logAttempt("PATCH /payment-details (flag-only)", error)
        if (!isMissingEndpoint(error) && !isServerAlreadyCleared(error)) lastError = error
      }

      dumpDiagnostics()

      throw (
        lastError ??
        new ApiError("Final settlement could not be saved to the server.", "SETTLEMENT_FAILED")
      )
    },

    /**
     * Revert Final Settlement — undo mistaken write-off.
     * Subtracts settlementAmount from discount, clears finalSettlementApplied,
     * restores remaining + paymentStatus. Prefer POST /revert-final-settlement.
     */
    revertSettlement: async (
      quotationId: string,
      payload: {
        settlementAmount: number
        discountAmount: number
        finalAmount: number
        remaining: number
        paymentStatus: "pending" | "partial" | "completed"
        paymentType?: string
        paymentMode?: string
      },
    ) => {
      const attemptLog: Array<{ endpoint: string; ok: boolean; code?: string; message?: string }> = []
      const logAttempt = (endpoint: string, error?: unknown) => {
        if (!error) {
          attemptLog.push({ endpoint, ok: true })
        } else {
          attemptLog.push({
            endpoint,
            ok: false,
            code: error instanceof ApiError ? error.code : "UNKNOWN",
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }

      const isMissingEndpoint = (error: unknown) =>
        error instanceof ApiError &&
        (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")

      const isServerError = (error: unknown) =>
        error instanceof ApiError &&
        (error.code === "HTTP_500" ||
          error.code === "HTTP_502" ||
          error.code === "HTTP_503" ||
          error.code === "HTTP_504")

      const dumpDiagnostics = () => {
        try {
          console.warn("[Revert settlement] attempts:", JSON.stringify(attemptLog, null, 2))
        } catch {
          console.warn("[Revert settlement] attempts:", attemptLog)
        }
      }

      const pickVerificationPayload = (raw: any): Record<string, any> => {
        if (!raw || typeof raw !== "object") return {}
        if (raw.data && typeof raw.data === "object") return raw.data as Record<string, any>
        return raw as Record<string, any>
      }

      const verifyRevertedOnServer = async (): Promise<{ ok: boolean; reason?: string }> => {
        try {
          const fresh = await apiRequest(`/quotations/${quotationId}?_revert_verify=${Date.now()}`, {
            suppressErrorLog: true,
          })
          const p = pickVerificationPayload(fresh)
          const pricing = (p.pricing || {}) as Record<string, any>
          const discount = Number(p.discountAmount ?? pricing.discountAmount ?? p.discount ?? 0)
          const finalSettlementApplied =
            p.finalSettlementApplied === true ||
            p.final_settlement_applied === true ||
            pricing.finalSettlementApplied === true
          const finalSettlementAmount = Number(
            p.finalSettlementAmount ?? p.final_settlement_amount ?? 0,
          )

          const reverted =
            !finalSettlementApplied &&
            finalSettlementAmount <= 0.5 &&
            discount <= payload.discountAmount + 0.5

          if (reverted) return { ok: true }
          return {
            ok: false,
            reason: `verify failed: discount=${discount}, finalSettlementApplied=${finalSettlementApplied}, finalSettlementAmount=${finalSettlementAmount}`,
          }
        } catch (error) {
          return {
            ok: false,
            reason: error instanceof Error ? error.message : String(error),
          }
        }
      }

      const revertBody = {
        amount: payload.settlementAmount,
        settlementAmount: payload.settlementAmount,
        discountAmount: payload.discountAmount,
        finalAmount: payload.finalAmount,
        paymentStatus: payload.paymentStatus,
        remaining: payload.remaining,
        remainingAmount: payload.remaining,
        finalSettlementApplied: false,
        finalSettlementAmount: 0,
      }

      let lastError: unknown = null

      // 1) Preferred atomic revert
      try {
        const res = await apiRequest(`/quotations/${quotationId}/revert-final-settlement`, {
          method: "POST",
          body: revertBody,
        })
        const verified = await verifyRevertedOnServer()
        if (verified.ok) {
          logAttempt("POST /revert-final-settlement")
          return res
        }
        logAttempt(
          "POST /revert-final-settlement",
          new ApiError(verified.reason || "Verify failed", "VERIFY_FAILED"),
        )
        lastError = new ApiError(
          `Server accepted /revert-final-settlement but data not persisted (${verified.reason || "unknown"})`,
          "VERIFY_FAILED",
        )
      } catch (error) {
        logAttempt("POST /revert-final-settlement", error)
        if (!isMissingEndpoint(error) && !isServerError(error)) {
          dumpDiagnostics()
          throw error
        }
        lastError = error
      }

      // Also try DELETE on the apply endpoint
      try {
        const res = await apiRequest(`/quotations/${quotationId}/final-settlement`, {
          method: "DELETE",
          body: revertBody,
        })
        const verified = await verifyRevertedOnServer()
        if (verified.ok) {
          logAttempt("DELETE /final-settlement")
          return res
        }
        logAttempt("DELETE /final-settlement", new ApiError(verified.reason || "Verify failed", "VERIFY_FAILED"))
        lastError = new ApiError(
          `Server accepted DELETE /final-settlement but data not persisted (${verified.reason || "unknown"})`,
          "VERIFY_FAILED",
        )
      } catch (error) {
        logAttempt("DELETE /final-settlement", error)
        if (!isMissingEndpoint(error) && !isServerError(error)) {
          // continue to fallbacks
        }
        lastError = error
      }

      // 2) Fallback: pricing + payment-details status
      try {
        await apiRequest(`/quotations/${quotationId}/pricing`, {
          method: "PATCH",
          body: {
            discountAmount: payload.discountAmount,
            totalAmount: payload.finalAmount,
            finalAmount: payload.finalAmount,
          },
        })
        logAttempt("PATCH /pricing (revert)")
        try {
          await apiRequest(`/quotations/${quotationId}/payment-details`, {
            method: "PATCH",
            body: {
              paymentType: payload.paymentType,
              paymentMode: payload.paymentMode,
              paymentStatus: payload.paymentStatus,
              replaceInstallments: false,
              finalSettlementApplied: false,
              finalSettlementAmount: 0,
              remaining: payload.remaining,
              remainingAmount: payload.remaining,
            },
          })
          logAttempt("PATCH /payment-details (revert)")
        } catch (statusErr) {
          logAttempt("PATCH /payment-details (revert)", statusErr)
        }
        const verified = await verifyRevertedOnServer()
        if (verified.ok) {
          return { success: true }
        }
        lastError = new ApiError(
          verified.reason || "Pricing/payment-details revert did not persist",
          "VERIFY_FAILED",
        )
      } catch (error) {
        logAttempt("PATCH /pricing (revert)", error)
        lastError = error
      }

      // 3) Last: absolute discount patch
      try {
        await apiRequest(`/quotations/${quotationId}/discount`, {
          method: "PATCH",
          body: {
            discountAmount: payload.discountAmount,
            discount: payload.discountAmount,
            finalSettlementApplied: false,
            finalSettlementAmount: 0,
            remaining: payload.remaining,
            paymentStatus: payload.paymentStatus,
          },
        })
        logAttempt("PATCH /discount (revert)")
        const verified = await verifyRevertedOnServer()
        if (verified.ok) return { success: true }
        lastError = new ApiError(verified.reason || "Discount revert did not persist", "VERIFY_FAILED")
      } catch (error) {
        logAttempt("PATCH /discount (revert)", error)
        lastError = error
      }

      dumpDiagnostics()
      throw (
        lastError ??
        new ApiError("Settlement revert could not be saved to the server.", "SETTLEMENT_REVERT_FAILED")
      )
    },

    /**
     * Account Management gate for installer queue.
     * Backend can implement any one endpoint below; client will fallback safely.
     */
    releaseForInstallation: async (
      quotationId: string,
      payload: {
        installationReadyForInstaller: boolean
        installationReleasedAt?: string
        installationStatus?: string
        installation_status?: string
      },
    ) => {
      const body = {
        installationReadyForInstaller: payload.installationReadyForInstaller,
        installation_ready_for_installer: payload.installationReadyForInstaller,
        installationReleasedAt: payload.installationReleasedAt,
        installation_released_at: payload.installationReleasedAt,
        installationStatus: payload.installationStatus || "pending_installer",
        installation_status: payload.installation_status || payload.installationStatus || "pending_installer",
      }
      const attempts: Array<{ endpoint: string; method: "PATCH"; body: Record<string, any> }> = [
        {
          endpoint: `/quotations/${quotationId}/installation-release`,
          method: "PATCH",
          body,
        },
        {
          endpoint: `/quotations/${quotationId}/installation/ready`,
          method: "PATCH",
          body,
        },
        {
          endpoint: `/quotations/${quotationId}/payment-details`,
          method: "PATCH",
          body,
        },
        {
          endpoint: `/admin/quotations/${quotationId}/installation-status`,
          method: "PATCH",
          body: {
            status: "pending_installer",
            installationReadyForInstaller: body.installationReadyForInstaller,
            installationReleasedAt: body.installationReleasedAt,
          },
        },
      ]

      let lastError: unknown = null
      for (const attempt of attempts) {
        try {
          return await apiRequest(attempt.endpoint, {
            method: attempt.method,
            body: attempt.body,
          })
        } catch (error) {
          lastError = error
          const retryableMissingEndpoint =
            error instanceof ApiError &&
            (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
          if (!retryableMissingEndpoint) throw error
        }
      }

      throw lastError
    },

    updateProducts: async (quotationId: string, products: any) => {
      return apiRequest(`/quotations/${quotationId}/products`, {
        method: "PATCH",
        body: { products },
      })
    },

    updatePricing: async (quotationId: string, pricing: {
      subtotal?: number
      stateSubsidy?: number
      centralSubsidy?: number
      discountAmount?: number
      totalAmount?: number
      finalAmount?: number
      // Commercial set (DCR/BOTH without subsidy): backend must skip the centralSubsidy
      // requirement and not deduct subsidy.
      pdfCommercialSet?: boolean
      pdf_commercial_set?: boolean
      isCommercial?: boolean
    }) => {
      return apiRequest(`/quotations/${quotationId}/pricing`, {
        method: "PATCH",
        body: pricing,
      })
    },

    updateDocuments: async (quotationId: string, formData: FormData) => {
      const token = getAuthToken()
      const url = `${getApiBaseUrl()}/quotations/${quotationId}/documents`
      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: formData,
      })

      const raw = await response.text().catch(() => "")
      let payload: any = null
      if (raw) {
        try {
          payload = JSON.parse(raw)
        } catch {
          payload = null
        }
      }

      const success = response.ok && (payload == null || payload.success !== false)
      if (success) {
        return payload?.data ?? payload ?? {}
      }

      const errObj =
        payload && typeof payload === "object" && payload.error && typeof payload.error === "object"
          ? payload.error
          : null
      const jsonMessage =
        (typeof errObj?.message === "string" && errObj.message) ||
        (typeof payload?.message === "string" && payload.message) ||
        (typeof payload?.error === "string" && payload.error) ||
        undefined
      const details = Array.isArray(errObj?.details) ? errObj.details : undefined
      const code = (typeof errObj?.code === "string" && errObj.code) || `HTTP_${response.status}`

      const compact = raw.replace(/\s+/g, " ").trim()
      const looksLikeHtml = /^<!DOCTYPE/i.test(compact) || /^<html/i.test(compact)

      let message = jsonMessage
      if (!message) {
        if (response.status >= 500) {
          message =
            "Server error while saving documents. Your API logs for PATCH /quotations/…/documents will show the cause (often S3 credentials, bucket policy, or an unhandled exception in the upload handler)."
        } else if (looksLikeHtml || compact.length > 400) {
          message = `${response.statusText || "Request failed"} (${response.status})`
        } else {
          message = compact || response.statusText || `HTTP_${response.status}`
        }
      }

      throw new ApiError(String(message), code, details)
    },

    /**
     * Upload one KYC / property file to the server (server stores on S3 and returns a public or presigned URL).
     * Expected route: POST /quotations/:quotationId/documents/upload — multipart field `field` (logical key) + `file`.
     */
    uploadQuotationDocumentFile: async (quotationId: string, field: string, file: File): Promise<string> => {
      const formData = new FormData()
      formData.append("field", field)
      formData.append("file", file)
      const token = getAuthToken()
      const url = `${getApiBaseUrl()}/quotations/${quotationId}/documents/upload`
      const response = await fetch(url, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      })

      const raw = await response.text().catch(() => "")
      let payload: any = null
      if (raw) {
        try {
          payload = JSON.parse(raw)
        } catch {
          payload = null
        }
      }

      const success = response.ok && (payload == null || payload.success !== false)
      if (success) {
        const parsedUrl = parseQuotationDocumentUploadUrl(payload, field)
        if (parsedUrl) return parsedUrl
        throw new ApiError(
          "Upload succeeded but the response did not include a file URL. Check POST /quotations/…/documents/upload response shape.",
          "MISSING_UPLOAD_URL",
        )
      }

      const errObj =
        payload && typeof payload === "object" && payload.error && typeof payload.error === "object"
          ? payload.error
          : null
      const jsonMessage =
        (typeof errObj?.message === "string" && errObj.message) ||
        (typeof payload?.message === "string" && payload.message) ||
        undefined
      const details = Array.isArray(errObj?.details) ? errObj.details : undefined
      const code = (typeof errObj?.code === "string" && errObj.code) || `HTTP_${response.status}`
      const message =
        jsonMessage ||
        (response.status === 404
          ? "Document upload endpoint not found (POST /quotations/{id}/documents/upload)."
          : raw.replace(/\s+/g, " ").trim().slice(0, 400) || response.statusText || `HTTP_${response.status}`)

      throw new ApiError(String(message), code, details)
    },

    /**
     * Final confirmation uploads (admin / baldev). Do not use PATCH /quotations/…/documents —
     * that route allowlists KYC fields only and returns "Invalid quotation document payload".
     */
    uploadFinalConfirmationDocuments: async (
      quotationId: string,
      files: Parameters<typeof buildFinalConfirmationDocumentsFormData>[0],
    ) => {
      const formData = buildFinalConfirmationDocumentsFormData(files)
      if (!formData) {
        throw new ApiError("Please upload at least one PDF/JPG document.", "VAL_001")
      }

      const isRetryableUploadError = (error: unknown) =>
        error instanceof ApiError &&
        (error.code === "HTTP_404" ||
          error.code === "HTTP_405" ||
          error.code === "HTTP_501" ||
          error.code === "HTTP_403" ||
          error.code === "AUTH_004")

      const isInvalidKycDocumentsPayload = (error: unknown) =>
        error instanceof ApiError &&
        (error.code === "HTTP_400" || error.code === "VAL_001") &&
        error.message.toLowerCase().includes("invalid quotation document payload")

      const batchEndpoints = [
        `/admin/quotations/${quotationId}/final-confirmation-documents`,
        `/admin/quotations/${quotationId}/documents`,
        `/quotations/${quotationId}/final-confirmation-documents`,
        `/baldev/quotations/${quotationId}/final-confirmation-documents`,
        `/quotations/${quotationId}/documents`,
      ]

      let lastError: unknown = null
      for (const endpoint of batchEndpoints) {
        try {
          return await multipartRequest(endpoint, "POST", cloneFormData(formData))
        } catch (error) {
          lastError = error
          if (!isRetryableUploadError(error) && !isInvalidKycDocumentsPayload(error)) throw error
        }
      }

      const fileEntries: Array<[string, File]> = []
      for (const [key, value] of formData.entries()) {
        if (value instanceof File) fileEntries.push([key, value])
      }

      const perFileEndpoints = [
        `/admin/quotations/${quotationId}/documents/upload`,
        `/quotations/${quotationId}/documents/upload`,
        `/baldev/quotations/${quotationId}/documents/upload`,
      ]

      const uploaded: Record<string, string> = {}
      for (const [field, file] of fileEntries) {
        let fieldUploaded = false
        for (const endpoint of perFileEndpoints) {
          try {
            const single = new FormData()
            single.append("field", field)
            single.append("file", file)
            const payload = await multipartRequest(endpoint, "POST", single)
            const url =
              parseQuotationDocumentUploadUrl(payload, field) ||
              parseUploadUrlCandidate(payload, [field, `${field}Url`, `${field}_url`])
            if (!url) {
              throw new ApiError(
                `Upload succeeded but no URL was returned for ${field}.`,
                "MISSING_UPLOAD_URL",
              )
            }
            uploaded[field] = url
            fieldUploaded = true
            break
          } catch (error) {
            lastError = error
            if (!isRetryableUploadError(error) && !isInvalidKycDocumentsPayload(error)) throw error
          }
        }
        if (!fieldUploaded) {
          throw lastError instanceof ApiError
            ? lastError
            : new ApiError(`Could not upload ${field}.`, "UPLOAD_FAILED")
        }
      }

      return uploaded
    },

    downloadPDF: async (quotationId: string) => {
      const token = getAuthToken()
      const url = `${getApiBaseUrl()}/quotations/${quotationId}/pdf`
      const response = await fetch(url, {
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
      })
      if (!response.ok) throw new ApiError(`Failed to download PDF: ${response.statusText}`)
      const blob = await response.blob()
      return blob
    },

    downloadDocumentsZip: async (quotationId: string) => {
      const token = getAuthToken()
      const url = `${getApiBaseUrl()}/quotations/${quotationId}/documents/zip`
      const response = await fetch(url, {
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
      })
      if (!response.ok) throw new ApiError(`Failed to download documents ZIP: ${response.statusText}`)
      return response.blob()
    },
  },

  // Visits
  visits: {
    create: async (visitData: any) => {
      return apiRequest("/visits", {
        method: "POST",
        body: visitData,
      })
    },

    getAll: async (params?: {
      page?: number
      limit?: number
      status?: string
      visitorId?: string
      startDate?: string
      endDate?: string
      search?: string
    }) => {
      const queryParams = new URLSearchParams()
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined) queryParams.append(key, String(value))
        })
      }
      const query = queryParams.toString()
      return apiRequest(`/visits${query ? `?${query}` : ""}`)
    },

    getByQuotation: async (quotationId: string) => {
      return apiRequest(`/quotations/${quotationId}/visits`)
    },

    approve: async (visitId: string) => {
      return apiRequest(`/visits/${visitId}/approve`, {
        method: "PATCH",
      })
    },

    complete: async (
      visitId: string,
      completeData: {
        length: number
        width: number
        height: number
        images: string[]
        notes?: string
        /** Dimensions in feet (visitor complete flow). */
        unit?: "feet" | "cm"
        backLegFeet?: number
        midLegFeet?: number
        frontLegFeet?: number
        rowDiagramImage?: string
        meterImage?: string
      },
    ) => {
      return apiRequest(`/visits/${visitId}/complete`, {
        method: "PATCH",
        body: completeData,
      })
    },

    /**
     * Preferred complete endpoint mode when backend uploads files to S3.
     * Sends multipart/form-data with dimensions + image files.
     * Backend can return image URL(s) after successful S3 upload.
     */
    completeWithFiles: async (
      visitId: string,
      completeData: {
        length: number
        width: number
        height: number
        notes?: string
        unit?: "feet" | "cm"
        backLegFeet?: number
        midLegFeet?: number
        frontLegFeet?: number
        existingImages?: string[]
        existingRowDiagramImage?: string
        existingMeterImage?: string
      },
      siteImageFiles: File[],
      rowDiagramFile?: File | null,
      meterImageFile?: File | null,
    ) => {
      const formData = new FormData()
      formData.append("length", String(completeData.length))
      formData.append("width", String(completeData.width))
      formData.append("height", String(completeData.height))
      if (completeData.notes?.trim()) formData.append("notes", completeData.notes.trim())
      if (completeData.unit) formData.append("unit", completeData.unit)
      if (typeof completeData.backLegFeet === "number") formData.append("backLegFeet", String(completeData.backLegFeet))
      if (typeof completeData.midLegFeet === "number") formData.append("midLegFeet", String(completeData.midLegFeet))
      if (typeof completeData.frontLegFeet === "number") formData.append("frontLegFeet", String(completeData.frontLegFeet))

      // Keep already-uploaded images when editing/re-completing a visit.
      if (Array.isArray(completeData.existingImages) && completeData.existingImages.length > 0) {
        formData.append("existingImages", JSON.stringify(completeData.existingImages))
      }
      if (completeData.existingRowDiagramImage) {
        formData.append("existingRowDiagramImage", completeData.existingRowDiagramImage)
      }
      if (completeData.existingMeterImage) {
        formData.append("existingMeterImage", completeData.existingMeterImage)
      }

      siteImageFiles.forEach((file) => {
        formData.append("images", file)
      })
      if (rowDiagramFile) {
        formData.append("rowDiagramImage", rowDiagramFile)
      }
      if (meterImageFile) {
        formData.append("meterImage", meterImageFile)
      }

      const attempts = [
        `/visits/${visitId}/complete`,
        `/visitors/visits/${visitId}/complete`,
        `/visitors/me/visits/${visitId}/complete`,
      ]

      let lastError: unknown = null
      for (const endpoint of attempts) {
        try {
          return await multipartRequest(endpoint, "PATCH", cloneFormData(formData))
        } catch (error) {
          lastError = error
          const retryable =
            error instanceof ApiError &&
            (error.code === "HTTP_404" ||
              error.code === "HTTP_405" ||
              error.code === "HTTP_501" ||
              error.code === "HTTP_403" ||
              error.code === "AUTH_004")
          if (!retryable) throw error
        }
      }
      throw lastError
    },

    uploadCompletionAsset: async (
      visitId: string,
      field: "images" | "rowDiagramImage" | "meterImage",
      file: File,
    ): Promise<string> => {
      const formData = new FormData()
      formData.append("field", field)
      formData.append("file", file)

      const attempts = [
        `/visits/${visitId}/upload`,
        `/visits/${visitId}/media-upload`,
        `/visits/${visitId}/complete/upload`,
        `/visitors/visits/${visitId}/upload`,
        `/visitors/me/visits/${visitId}/upload`,
      ]

      let lastError: unknown = null
      for (const endpoint of attempts) {
        try {
          const payload = await multipartRequest(endpoint, "POST", cloneFormData(formData))
          const url = parseUploadUrlCandidate(payload, [field, `${field}Url`, `${field}_url`])
          if (url) return url
          throw new ApiError(
            "Upload succeeded but no file URL was returned by the visit upload endpoint.",
            "MISSING_UPLOAD_URL",
          )
        } catch (error) {
          lastError = error
          const retryable =
            error instanceof ApiError &&
            (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
          if (!retryable) throw error
        }
      }

      throw lastError
    },

    incomplete: async (visitId: string, reason: string) => {
      return apiRequest(`/visits/${visitId}/incomplete`, {
        method: "PATCH",
        body: { reason },
      })
    },

    /**
     * Reschedule a visit. Tries role-scoped routes: generic `/visits/...` (often visitor-only),
     * then dealer routes, then quotation-nested reschedule when `quotationId` is provided.
     */
    reschedule: async (
      visitId: string,
      rescheduleData:
        | string
        | {
            reason: string
            visitDate?: string
            visitTime?: string
            visitStartTime?: string
            visitEndTime?: string
            visitTimeRange?: string
          },
      ctx?: { quotationId?: string },
    ) => {
      const src = typeof rescheduleData === "string" ? { reason: rescheduleData } : rescheduleData
      const body: Record<string, unknown> = { reason: src.reason }
      if (src.visitDate) {
        body.visitDate = src.visitDate
        body.visit_date = src.visitDate
      }
      if (src.visitTime) {
        body.visitTime = src.visitTime
        body.visit_time = src.visitTime
      }
      if (src.visitStartTime) {
        body.visitStartTime = src.visitStartTime
        body.visit_start_time = src.visitStartTime
      }
      if (src.visitEndTime) {
        body.visitEndTime = src.visitEndTime
        body.visit_end_time = src.visitEndTime
      }
      if (src.visitTimeRange) {
        body.visitTimeRange = src.visitTimeRange
        body.visit_time_range = src.visitTimeRange
      }

      const attempts: string[] = [
        `/visits/${visitId}/reschedule`,
        `/dealers/visits/${visitId}/reschedule`,
        `/dealers/me/visits/${visitId}/reschedule`,
      ]
      if (ctx?.quotationId) {
        attempts.push(`/quotations/${ctx.quotationId}/visits/${visitId}/reschedule`)
      }

      let lastError: unknown = null
      for (const endpoint of attempts) {
        try {
          return await apiRequest(endpoint, { method: "PATCH", body })
        } catch (error) {
          lastError = error
          const retryable =
            error instanceof ApiError &&
            (error.code === "HTTP_404" ||
              error.code === "HTTP_405" ||
              error.code === "HTTP_501" ||
              error.code === "HTTP_403" ||
              error.code === "AUTH_004")
          if (!retryable) throw error
        }
      }
      throw lastError
    },

    reject: async (visitId: string, rejectionReason: string) => {
      return apiRequest(`/visits/${visitId}/reject`, {
        method: "PATCH",
        body: { rejectionReason },
      })
    },

    /** Transfer / reassign visit to another visitor (single assignee). */
    transfer: async (
      visitId: string,
      payload: {
        visitorId: string
        visitorName?: string
        visitors?: Array<{ visitorId: string; visitorName?: string }>
        reason?: string
      },
    ) => {
      const body = {
        visitorId: payload.visitorId,
        visitor_id: payload.visitorId,
        visitorName: payload.visitorName,
        visitors: payload.visitors || [
          { visitorId: payload.visitorId, visitorName: payload.visitorName || "" },
        ],
        reason: payload.reason,
      }
      const paths = [
        `/visits/${visitId}/transfer`,
        `/visits/${visitId}/reassign`,
        `/dealers/visits/${visitId}/transfer`,
        `/dealers/me/visits/${visitId}/transfer`,
      ]
      let lastError: unknown = null
      for (const path of paths) {
        try {
          return await apiRequest(path, { method: "PATCH", body, suppressErrorLog: true })
        } catch (error) {
          lastError = error
          if (!(error instanceof ApiError)) throw error
          const retryable =
            error.code === "HTTP_404" ||
            error.code === "HTTP_405" ||
            error.code === "HTTP_501"
          if (!retryable) throw error
        }
      }
      // Fallback: patch visitors array on the visit
      try {
        return await apiRequest(`/visits/${visitId}`, {
          method: "PATCH",
          body: {
            visitors: body.visitors,
            visitorId: body.visitorId,
          },
        })
      } catch {
        throw lastError instanceof Error
          ? lastError
          : new ApiError("Visit transfer unavailable", "HTTP_404")
      }
    },

    delete: async (visitId: string) => {
      return apiRequest(`/visits/${visitId}`, {
        method: "DELETE",
      })
    },

    /** Optional: persist site / leg dimensions on the visit record (backend may implement PATCH /visits/:id). */
    patch: async (visitId: string, body: Record<string, unknown>) => {
      return apiRequest(`/visits/${visitId}`, {
        method: "PATCH",
        body,
      })
    },
  },

  // Visitors
  visitors: {
    getAssignedVisits: async (params?: {
      status?: string
      startDate?: string
      endDate?: string
      search?: string
    }) => {
      const queryParams = new URLSearchParams()
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined) queryParams.append(key, String(value))
        })
      }
      const query = queryParams.toString()
      return apiRequest(`/visitors/me/visits${query ? `?${query}` : ""}`)
    },

    getStatistics: async () => {
      return apiRequest("/visitors/me/statistics")
    },
  },

  // Installer APIs
  installer: {
    /** Fetch installer queue with endpoint fallbacks for live backend variations. */
    getQueue: async (params?: {
      page?: number
      limit?: number
      status?: string
      search?: string
      sortBy?: string
      sortOrder?: "asc" | "desc"
    }) => {
      const queryParams = new URLSearchParams()
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined) queryParams.append(key, String(value))
        })
      }
      const query = queryParams.toString()
      const suffix = query ? `?${query}` : ""
      const endpoints = [
        `/installer/quotations${suffix}`,
        `/installer/queue${suffix}`,
        `/quotations${suffix}`,
      ]

      let lastError: unknown = null
      for (const endpoint of endpoints) {
        try {
          return await apiRequest(endpoint)
        } catch (error) {
          lastError = error
          const retryable =
            error instanceof ApiError &&
            (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
          if (!retryable) throw error
        }
      }
      throw lastError
    },

    /**
     * Uploads installer completion images + site legs + extra expenses + status.
     * Do not fall back to PATCH /quotations/{id}/documents — that route is for customer KYC
     * (aadhaar, PAN, etc.); sending installer multipart there causes 500 / SYS_001 on many servers.
     *
     * @param options.caller — Use `"admin"` from the admin panel: many gateways only allow the
     *   installer JWT on `POST /installer/quotations/.../documents` (403 AUTH_004 for admin).
     *   Admin callers try `/admin/...` and `POST /quotations/.../documents` before the installer path.
     */
    uploadCompletionDocuments: async (
      quotationId: string,
      formData: FormData,
      options?: { caller?: "installer" | "admin" },
    ) => {
      const tried: string[] = []
      const tryNextEndpoint = (error: unknown) =>
        error instanceof ApiError &&
        (error.code === "HTTP_404" ||
          error.code === "HTTP_405" ||
          error.code === "HTTP_501" ||
          error.code === "HTTP_403" ||
          error.code === "AUTH_004" ||
          // Wrong documents route / Multer field allow-list mismatch
          isMulterUnexpectedFileError(error))

      const installerPath = `/installer/quotations/${quotationId}/documents`
      const quotationsPath = `/quotations/${quotationId}/documents`

      // Prefer installer-completion routes. Generic quotation documents routes often reject
      // installer completion fields with Multer LIMIT_UNEXPECTED_FILE.
      const adminScoped: string[] =
        options?.caller === "admin"
          ? [
              `/admin/quotations/${quotationId}/installer-documents`,
              `/admin/installer/quotations/${quotationId}/documents`,
              installerPath,
              `/admin/quotations/${quotationId}/documents`,
            ]
          : []

      const endpoints =
        options?.caller === "admin"
          ? [...adminScoped, quotationsPath].filter((path, index, all) => all.indexOf(path) === index)
          : [installerPath, quotationsPath]

      // Shape A: aggregate installerCompletionImages (preferred / documented).
      // Shape B: per-field homeFrontPhoto… (older Multer allow-lists).
      // Shape C: strip any unexpected file keys then retry A/B logic via B.
      const formShapes: { label: string; body: FormData }[] = [
        { label: "aggregate", body: formData },
        { label: "per-field", body: rebuildInstallationCompletionFormDataAsPerField(formData) },
        {
          label: "strict-allowed",
          body: rebuildInstallationCompletionFormDataStrictAllowed(
            rebuildInstallationCompletionFormDataAsPerField(formData),
          ),
        },
      ]

      let lastError: unknown = null
      let sawMulterMismatch = false

      for (const shape of formShapes) {
        for (const endpoint of endpoints) {
          try {
            tried.push(`POST ${endpoint} [${shape.label}]`)
            return await multipartRequest(endpoint, "POST", cloneFormData(shape.body))
          } catch (error) {
            lastError = error
            if (isMulterUnexpectedFileError(error)) sawMulterMismatch = true
            if (!tryNextEndpoint(error)) throw error
          }
        }
        // Only continue to the next FormData shape after Multer field mismatches.
        if (!sawMulterMismatch) break
      }

      // Last resort (admin): upload each file via single-file endpoint, then POST text-only status body.
      if (options?.caller === "admin" && sawMulterMismatch) {
        try {
          const orderRaw = formData.get("installerCompletionImageFieldOrderJson")
          let order: string[] = []
          if (typeof orderRaw === "string" && orderRaw.trim()) {
            try {
              const parsed = JSON.parse(orderRaw)
              if (Array.isArray(parsed)) order = parsed.map((v) => String(v || "").trim()).filter(Boolean)
            } catch {
              order = []
            }
          }
          const aggregateFiles: File[] = []
          for (const [key, value] of formData.entries()) {
            if (key === "installerCompletionImages" && value instanceof File) aggregateFiles.push(value)
          }
          for (let i = 0; i < aggregateFiles.length; i++) {
            const fieldKey = order[i] || "otherImages"
            tried.push(`POST uploadCompletionAsset:${fieldKey}`)
            await api.installer.uploadCompletionAsset(quotationId, fieldKey, aggregateFiles[i])
          }
          for (const [key, value] of formData.entries()) {
            if (key === "piUpload" && value instanceof File) {
              tried.push("POST uploadCompletionAsset:piUpload")
              await api.installer.uploadCompletionAsset(quotationId, "piUpload", value)
            }
          }
          const textOnly = new FormData()
          for (const [key, value] of formData.entries()) {
            if (value instanceof File) continue
            if (key === "installerCompletionImageFieldOrderJson") continue
            textOnly.append(key, value)
          }
          for (const endpoint of endpoints) {
            try {
              tried.push(`POST ${endpoint} [text-only-after-assets]`)
              return await multipartRequest(endpoint, "POST", cloneFormData(textOnly))
            } catch (error) {
              lastError = error
              if (!tryNextEndpoint(error)) throw error
            }
          }
        } catch (error) {
          lastError = error
        }
      }

      if (lastError instanceof ApiError) throw lastError
      throw new ApiError(
        `Installer completion upload is not available on this API (tried: ${tried.join(
          " → ",
        )}). Deploy a dedicated route, e.g. POST /api/installer/quotations/{quotationId}/documents (installer) or POST /api/admin/quotations/{quotationId}/installer-documents with the same multipart fields documented in BACKEND_CHANGES_REQUIRED.md (section 6.4.C). Avoid using PATCH /api/quotations/{quotationId}/documents for this flow — it expects a different document shape and often returns 500 (SYS_001).`,
        "HTTP_404",
      )
    },

    uploadCompletionAsset: async (
      quotationId: string,
      field: string,
      file: File,
    ): Promise<string> => {
      const formData = new FormData()
      formData.append("field", field)
      formData.append("file", file)

      const endpoints = [
        `/installer/quotations/${quotationId}/documents/upload`,
        `/installer/quotations/${quotationId}/upload`,
        `/quotations/${quotationId}/installer-documents/upload`,
      ]

      let lastError: unknown = null
      for (const endpoint of endpoints) {
        try {
          const payload = await multipartRequest(endpoint, "POST", cloneFormData(formData))
          const url = parseUploadUrlCandidate(payload, [field, `${field}Url`, `${field}_url`])
          if (url) return url
          throw new ApiError(
            "Upload succeeded but no file URL was returned by the installer upload endpoint.",
            "MISSING_UPLOAD_URL",
          )
        } catch (error) {
          lastError = error
          const retryable =
            error instanceof ApiError &&
            (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
          if (!retryable) throw error
        }
      }

      throw lastError
    },
  },

  // Metering APIs
  metering: {
    /** Update metering workflow status/stage. */
    updateStatus: async (
      quotationId: string,
      action: "start" | "approve" | "send_to_mco" | "mark_completed" | "move_back",
      remarks?: string,
    ) => {
      const body: Record<string, any> = { action }
      if (remarks && remarks.trim()) body.remarks = remarks.trim()

      const endpoints: Array<{ endpoint: string; method: "PATCH" | "POST" }> = [
        { endpoint: `/metering/quotations/${quotationId}/status`, method: "PATCH" },
        { endpoint: `/metering/quotations/${quotationId}/decision`, method: "PATCH" },
        { endpoint: `/quotations/${quotationId}/metering-status`, method: "PATCH" },
      ]

      let lastError: unknown = null
      for (const attempt of endpoints) {
        try {
          return await apiRequest(attempt.endpoint, { method: attempt.method, body })
        } catch (error) {
          lastError = error
          const retryable =
            error instanceof ApiError &&
            (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
          if (!retryable) throw error
        }
      }
      throw lastError
    },

    /** Force set metering status for backends that don't support action-based transition yet. */
    forceSetStatus: async (quotationId: string, status: "metering_approved" | "mco") => {
      const body = {
        status,
        installationStatus: status,
        meteringStatus: status,
      }

      const endpoints: Array<{ endpoint: string; method: "PATCH" | "POST" }> = [
        { endpoint: `/metering/quotations/${quotationId}/status`, method: "PATCH" },
        { endpoint: `/quotations/${quotationId}/metering-status`, method: "PATCH" },
        { endpoint: `/quotations/${quotationId}/status`, method: "PATCH" },
      ]

      let lastError: unknown = null
      for (const attempt of endpoints) {
        try {
          return await apiRequest(attempt.endpoint, { method: attempt.method, body })
        } catch (error) {
          lastError = error
          const retryable =
            error instanceof ApiError &&
            (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
          if (!retryable) throw error
        }
      }
      throw lastError
    },

    /** Save metering details (discom/meter fields + optional meter document image). */
    saveDetails: async (
      quotationId: string,
      payload: {
        discomName?: string
        meterType?: "solar" | "net" | "both"
        meterNo?: string
        solarMeterNo?: string
        netMeterNo?: string
        remarks?: string
        authorizedRepresentative?: string
        /** Optional DISCOM office / site location for WCC Pending. */
        discomLocation?: string
        /** Meter Installation Pending photos. */
        meterInstallationPhoto?: File | null
        plantLivePhoto?: File | null
      },
      meterDocumentFile?: File | null,
    ) => {
      const formData = new FormData()
      if (payload.discomName) formData.append("discomName", payload.discomName)
      if (payload.meterType) formData.append("meterType", payload.meterType)
      if (payload.meterNo) formData.append("meterNo", payload.meterNo)
      if (payload.solarMeterNo) formData.append("solarMeterNo", payload.solarMeterNo)
      if (payload.netMeterNo) formData.append("netMeterNo", payload.netMeterNo)
      if (payload.remarks) {
        formData.append("remarks", payload.remarks)
      }
      if (payload.authorizedRepresentative) {
        formData.append("authorizedRepresentative", payload.authorizedRepresentative)
        formData.append("authorized_representative", payload.authorizedRepresentative)
      }
      if (payload.discomLocation) {
        formData.append("discomLocation", payload.discomLocation)
        formData.append("discom_location", payload.discomLocation)
      }
      if (meterDocumentFile) {
        formData.append("meterDocumentImage", meterDocumentFile)
        formData.append("meter_document_image", meterDocumentFile)
        formData.append("meterDocument", meterDocumentFile)
        formData.append("meter_document", meterDocumentFile)
        formData.append("meterDocumentFile", meterDocumentFile)
        formData.append("file", meterDocumentFile)
      }
      if (payload.meterInstallationPhoto) {
        formData.append("meterInstallationPhoto", payload.meterInstallationPhoto)
        formData.append("meter_installation_photo", payload.meterInstallationPhoto)
      }
      if (payload.plantLivePhoto) {
        formData.append("plantLivePhoto", payload.plantLivePhoto)
        formData.append("plant_live_photo", payload.plantLivePhoto)
      }

      const isMissingRoute = (error: unknown) =>
        error instanceof ApiError &&
        (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")

      const isForbidden = (error: unknown) =>
        error instanceof ApiError && error.code === "HTTP_403"

      let firstError: unknown
      try {
        return await multipartRequest(`/metering/quotations/${quotationId}/details`, "POST", formData)
      } catch (e) {
        firstError = e
        if (!isMissingRoute(e) && !isForbidden(e)) throw e
      }

      let secondError: unknown
      try {
        return await multipartRequest(`/quotations/${quotationId}/metering-details`, "POST", cloneFormData(formData))
      } catch (e) {
        secondError = e
        if (!isMissingRoute(e) && !isForbidden(e)) throw e
      }

      if (isForbidden(firstError) || isForbidden(secondError)) {
        throw new ApiError(
          "Insufficient permissions (AUTH_004): allow JWT role `metering` on POST /api/metering/quotations/{id}/details (or grant the same on POST /api/quotations/{id}/metering-details). Admin-only middleware on these routes causes this for metering logins.",
          "AUTH_004",
        )
      }

      throw new ApiError(
        "Metering details save endpoint is not available. Expected POST /api/metering/quotations/{id}/details (or compatible fallback).",
        "HTTP_404",
      )
    },

    /** Upload MCO completion docs required before moving to Baldev confirmation. */
    uploadMcoDocuments: async (
      quotationId: string,
      files: {
        workCompleteReportImage?: File | null
        meterInstalledPhoto?: File | null
        completeDcrReportImage?: File | null
      },
    ) => {
      const formData = new FormData()
      if (files.workCompleteReportImage) {
        formData.append("workCompleteReportImage", files.workCompleteReportImage)
      }
      if (files.meterInstalledPhoto) {
        formData.append("meterInstalledPhoto", files.meterInstalledPhoto)
      }
      if (files.completeDcrReportImage) {
        formData.append("completeDcrReportImage", files.completeDcrReportImage)
      }

      const isRetryable = (error: unknown) =>
        error instanceof ApiError &&
        (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501" || error.code === "HTTP_403")

      const attempts: Array<{ endpoint: string; method: "POST" | "PATCH" }> = [
        { endpoint: `/metering/quotations/${quotationId}/mco-documents`, method: "POST" },
        { endpoint: `/metering/quotations/${quotationId}/documents`, method: "POST" },
        { endpoint: `/quotations/${quotationId}/metering-mco-documents`, method: "POST" },
      ]

      let lastError: unknown = null
      for (const attempt of attempts) {
        try {
          return await multipartRequest(attempt.endpoint, attempt.method, cloneFormData(formData))
        } catch (error) {
          lastError = error
          if (!isRetryable(error)) throw error
        }
      }

      throw new ApiError(
        "MCO completion upload endpoint is not available. Expected POST /api/metering/quotations/{id}/mco-documents (or compatible fallback).",
        (lastError instanceof ApiError && lastError.code) || "HTTP_404",
      )
    },
  },

  // HR APIs
  hr: {
    dealers: {
      getAll: async (params?: {
        page?: number
        limit?: number
        search?: string
        includeInactive?: boolean
        isActive?: boolean
      }) => {
        const queryParams = new URLSearchParams()
        if (params) {
          Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) queryParams.append(key, String(value))
          })
        }
        const query = queryParams.toString()
        const querySuffix = query ? `?${query}` : ""

        const endpoints = [
          `/hr/dealers${querySuffix}`,
          `/hr/dealer-pool${querySuffix}`,
          `/hr/assignment/dealers${querySuffix}`,
          `/admin/dealers${querySuffix}`,
        ]

        let lastError: unknown = null
        for (const endpoint of endpoints) {
          try {
            return await apiRequest(endpoint)
          } catch (error) {
            lastError = error
            const isRetryable =
              error instanceof ApiError &&
              (error.code === "HTTP_404" ||
                error.code === "HTTP_405" ||
                error.code === "HTTP_501" ||
                error.code === "HTTP_403")
            if (!isRetryable) throw error
          }
        }

        throw lastError
      },
    },

    uploadedLeads: {
      getAll: async (params?: { page?: number; limit?: number }) => {
        const queryParams = new URLSearchParams()
        if (params) {
          Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) queryParams.append(key, String(value))
          })
        }
        const query = queryParams.toString()
        const querySuffix = query ? `?${query}` : ""

        const endpoints = [
          `/hr/leads/uploads${querySuffix}`,
          `/hr/calling-uploads${querySuffix}`,
          `/hr/uploads${querySuffix}`,
          `/admin/leads/uploads${querySuffix}`,
        ]

        let lastError: unknown = null
        for (const endpoint of endpoints) {
          try {
            const body = await apiRequest<Record<string, unknown>>(endpoint)
            const nested =
              body?.data && typeof body.data === "object" && !Array.isArray(body.data)
                ? (body.data as Record<string, unknown>)
                : null
            return {
              ...body,
              uploads: body.uploads ?? nested?.uploads,
              batches: body.batches ?? nested?.batches,
              pagination: body.pagination ?? nested?.pagination,
            }
          } catch (error) {
            lastError = error
            const isMissingEndpoint =
              error instanceof ApiError &&
              (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
            if (!isMissingEndpoint) throw error
          }
        }

        throw lastError
      },
      getById: async (
        batchId: string,
        params?: { page?: number; limit?: number; mobile?: string; q?: string; search?: string },
      ): Promise<any> => {
        const safeBatchId = encodeURIComponent(batchId)
        const queryParams = new URLSearchParams()
        if (params) {
          Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== "") queryParams.append(key, String(value))
          })
        }
        const query = queryParams.toString()
        const querySuffix = query ? `?${query}` : ""
        const endpoints = [
          `/hr/leads/uploads/${safeBatchId}${querySuffix}`,
          `/hr/calling-uploads/${safeBatchId}${querySuffix}`,
          `/hr/uploads/${safeBatchId}${querySuffix}`,
          `/admin/leads/uploads/${safeBatchId}${querySuffix}`,
        ]

        let lastError: unknown = null
        for (const endpoint of endpoints) {
          try {
            const body = await apiRequest<Record<string, unknown>>(endpoint)
            const nested =
              body?.data && typeof body.data === "object" && !Array.isArray(body.data)
                ? (body.data as Record<string, unknown>)
                : null
            const batch = body.batch ?? nested?.batch ?? nested?.upload
            return {
              ...body,
              batch,
              rows: body.rows ?? nested?.rows,
              pagination: body.pagination ?? nested?.pagination,
              totalRows: body.totalRows ?? nested?.totalRows,
            }
          } catch (error) {
            lastError = error
            const isMissingEndpoint =
              error instanceof ApiError &&
              (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
            if (!isMissingEndpoint) throw error
          }
        }

        throw lastError
      },

      /**
       * Global lead lookup by mobile across all HR uploads.
       * GET /hr/leads/search?mobile=XXXXXXXXXX (aliases tried below).
       */
      searchByMobile: async (mobile: string, params?: { limit?: number }): Promise<any> => {
        const digits = String(mobile || "").replace(/\D/g, "")
        const normalized = digits.length > 10 ? digits.slice(-10) : digits
        if (!normalized) {
          throw new ApiError("Enter a mobile number to search", "VAL_001")
        }

        const queryParams = new URLSearchParams()
        queryParams.set("mobile", normalized)
        if (params?.limit != null) queryParams.set("limit", String(params.limit))
        // Some backends accept q/search instead of mobile
        queryParams.set("q", normalized)
        queryParams.set("search", normalized)
        const querySuffix = `?${queryParams.toString()}`

        const endpoints = [
          `/hr/leads/search${querySuffix}`,
          `/hr/calling-leads/search${querySuffix}`,
          `/hr/leads${querySuffix}`,
          `/admin/leads/search${querySuffix}`,
        ]

        let lastError: unknown = null
        for (const endpoint of endpoints) {
          try {
            const body = await apiRequest<Record<string, unknown>>(endpoint)
            const nested =
              body?.data && typeof body.data === "object" && !Array.isArray(body.data)
                ? (body.data as Record<string, unknown>)
                : null
            return {
              ...body,
              leads: body.leads ?? body.rows ?? body.items ?? nested?.leads ?? nested?.rows ?? nested?.items,
              rows: body.rows ?? body.leads ?? nested?.rows ?? nested?.leads,
              total:
                body.total ??
                nested?.total ??
                (body.pagination as { total?: number } | undefined)?.total ??
                (nested?.pagination as { total?: number } | undefined)?.total,
            }
          } catch (error) {
            lastError = error
            const isMissingEndpoint =
              error instanceof ApiError &&
              (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
            if (!isMissingEndpoint) throw error
          }
        }

        throw lastError
      },
    },

    callingActions: {
      getAll: async (params?: {
        page?: number
        limit?: number
        dealerId?: string
        search?: string
        startDate?: string
        endDate?: string
        range?: "daily" | "weekly" | "monthly" | "last_month" | "all" | "custom"
      }) => {
        const queryParams = new URLSearchParams()
        if (params) {
          Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) queryParams.append(key, String(value))
          })
        }
        const query = queryParams.toString()
        const querySuffix = query ? `?${query}` : ""

        const endpoints = [
          `/hr/calling-actions${querySuffix}`,
          `/hr/calling-queue/actions${querySuffix}`,
          `/admin/calling-actions${querySuffix}`,
        ]

        let lastError: unknown = null
        for (const endpoint of endpoints) {
          try {
            return await apiRequest(endpoint)
          } catch (error) {
            lastError = error
            const isMissingEndpoint =
              error instanceof ApiError &&
              (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
            if (!isMissingEndpoint) throw error
          }
        }

        throw lastError
      },
    },

    uploadLeadsCsv: async (
      file: File,
      dealerIds: string[],
      options?:
        | number
        | {
            activeLimitPerDealer?: number
            assignmentMode?: "round_robin_all" | "active_cap"
          },
    ) => {
      const opts =
        typeof options === "number"
          ? { activeLimitPerDealer: options, assignmentMode: "active_cap" as const }
          : {
              activeLimitPerDealer: options?.activeLimitPerDealer ?? 1,
              assignmentMode: options?.assignmentMode ?? "active_cap",
            }
      const assignAll = opts.assignmentMode === "round_robin_all"

      // Backend Zod: activeLimitPerDealer / activeLeadsLimit must be <= 50.
      // Never send MAX_SAFE_INTEGER / row counts — that causes:
      // "Assignment failed: Too big: expected number to be <=50"
      const BACKEND_LIMIT_MAX = 50
      const limitValue = (() => {
        const raw = Number(opts.activeLimitPerDealer)
        const n = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1
        return Math.min(Math.max(1, n), BACKEND_LIMIT_MAX)
      })()

      const buildFormData = (config: {
        fileKey: "file" | "csvFile"
        dealerMode: "array-brackets" | "repeat-key" | "json-string"
        limitKey?: "activeLimitPerDealer" | "activeLeadsLimit"
      }) => {
        const formData = new FormData()
        formData.append(config.fileKey, file)

        // Only send assignmentMode when explicitly round_robin_all (optional backend flag).
        // Default active_cap matches the earlier working upload (file + dealers + limit=1).
        if (assignAll) {
          formData.append("assignmentMode", "round_robin_all")
        }

        if (config.dealerMode === "array-brackets") {
          dealerIds.forEach((dealerId) => formData.append("dealerIds[]", dealerId))
        } else if (config.dealerMode === "repeat-key") {
          dealerIds.forEach((dealerId) => formData.append("dealerIds", dealerId))
        } else {
          formData.append("dealerIds", JSON.stringify(dealerIds))
        }

        if (config.limitKey) {
          formData.append(config.limitKey, String(limitValue))
        }

        return formData
      }

      const attempts: Array<{
        fileKey: "file" | "csvFile"
        dealerMode: "array-brackets" | "repeat-key" | "json-string"
        limitKey?: "activeLimitPerDealer" | "activeLeadsLimit"
      }> = [
        { fileKey: "file", dealerMode: "array-brackets", limitKey: "activeLimitPerDealer" },
        { fileKey: "file", dealerMode: "repeat-key", limitKey: "activeLeadsLimit" },
        { fileKey: "csvFile", dealerMode: "json-string", limitKey: "activeLeadsLimit" },
      ]

      let lastError: unknown = null
      for (const attempt of attempts) {
        try {
          const formData = buildFormData(attempt)
          return await multipartRequest("/hr/leads/upload-csv", "POST", formData)
        } catch (error) {
          lastError = error
          // Retry the next multipart shape on validation OR server errors.
          // A different field layout (file vs csvFile, dealerIds[] vs JSON,
          // activeLimitPerDealer vs activeLeadsLimit) can dodge a backend
          // parser/allocator bug that 500s ("Internal server error").
          const isRetryable =
            error instanceof ApiError &&
            (error.code === "VAL_001" ||
              error.code === "VAL_002" ||
              error.code === "HTTP_400" ||
              error.code === "HTTP_422" ||
              error.code === "HTTP_500" ||
              error.code === "SYS_001" ||
              error.message.toLowerCase().includes("validation"))
          if (!isRetryable) throw error
        }
      }

      // All shapes failed. If the server kept 500-ing, make the cause explicit
      // so it's clear this is a backend upload/allocator bug, not a client one.
      if (
        lastError instanceof ApiError &&
        (lastError.code === "HTTP_500" || lastError.code === "SYS_001")
      ) {
        throw new ApiError(
          `Lead upload failed on the server (500). POST /hr/leads/upload-csv threw while parsing the CSV or assigning leads. Backend must return 400 (not 500) for bad rows and guard the round-robin allocator. See BACKEND_ASSIGN_UNASSIGNED.ts / handoff §15-C.`,
          lastError.code,
          (lastError as ApiError).details,
        )
      }

      throw lastError
    },

    /**
     * Top up Unassigned → Assigned for one upload using active_cap (1 open lead per dealer).
     * Does NOT dump every row into Assigned (that was round_robin_all — wrong for Calling FIFO).
     * rebalance:true asks backend to demote excess Assigned (>1 per dealer) back to Unassigned.
     */
    assignUnassignedLeads: async (
      batchId: string,
      options?: {
        assignmentMode?: "active_cap" | "round_robin_all"
        activeLimitPerDealer?: number
        rebalance?: boolean
      },
    ): Promise<any> => {
      const safeBatchId = encodeURIComponent(batchId)
      const endpoints = [
        `/hr/leads/uploads/${safeBatchId}/assign-unassigned`,
        `/hr/calling-uploads/${safeBatchId}/assign-unassigned`,
        `/hr/uploads/${safeBatchId}/assign-unassigned`,
        `/admin/leads/uploads/${safeBatchId}/assign-unassigned`,
      ]

      // Pass a plain object — apiRequest already JSON.stringify's the body.
      const limit = Math.min(50, Math.max(1, Number(options?.activeLimitPerDealer ?? 1) || 1))
      const requestBody = {
        assignmentMode: options?.assignmentMode ?? ("active_cap" as const),
        activeLimitPerDealer: limit,
        activeLeadsLimit: limit,
        rebalance: options?.rebalance !== false,
      }

      let lastError: unknown = null
      for (const endpoint of endpoints) {
        try {
          return await apiRequest<Record<string, unknown>>(endpoint, {
            method: "POST",
            body: requestBody,
          })
        } catch (error) {
          lastError = error
          const isMissingEndpoint =
            error instanceof ApiError &&
            (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
          if (!isMissingEndpoint) throw error
        }
      }

      throw lastError
    },

    /**
     * Set or expand the eligible dealer pool on an existing upload batch.
     * mode "add": merge new ids into existing (POST …/add-dealers preferred).
     * mode "replace": full pool replace (PATCH …/dealers preferred; avoids merge-only add endpoints).
     */
    updateUploadDealerPool: async (
      batchId: string,
      dealerIds: string[],
      options?: { mode?: "add" | "replace"; existingDealerIds?: string[] },
    ): Promise<any> => {
      const safeBatchId = encodeURIComponent(batchId)
      const mode = options?.mode ?? "add"
      const existing = (options?.existingDealerIds || []).map(String).filter(Boolean)
      const incoming = dealerIds.map(String).filter(Boolean)
      const merged =
        mode === "replace"
          ? Array.from(new Set(incoming))
          : Array.from(new Set([...existing, ...incoming]))

      if (incoming.length === 0) {
        throw new ApiError("Select at least one dealer.", "VAL_002")
      }

      const replaceAttempts: Array<{
        endpoint: string
        method: "POST" | "PATCH" | "PUT"
        body: Record<string, unknown>
      }> = [
        // Prefer routes most likely already live (add-dealers was shipped first).
        {
          endpoint: `/hr/leads/uploads/${safeBatchId}/add-dealers`,
          method: "POST",
          body: { dealerIds: merged, mode: "replace" },
        },
        {
          endpoint: `/hr/leads/uploads/${safeBatchId}/dealers`,
          method: "PATCH",
          body: { dealerIds: merged, mode: "replace" },
        },
        {
          endpoint: `/hr/calling-uploads/${safeBatchId}/add-dealers`,
          method: "POST",
          body: { dealerIds: merged, mode: "replace" },
        },
        {
          endpoint: `/hr/calling-uploads/${safeBatchId}/dealers`,
          method: "PATCH",
          body: { dealerIds: merged, mode: "replace" },
        },
        {
          endpoint: `/hr/leads/uploads/${safeBatchId}`,
          method: "PATCH",
          body: { dealerIds: merged },
        },
        {
          endpoint: `/hr/uploads/${safeBatchId}/dealers`,
          method: "PUT",
          body: { dealerIds: merged },
        },
        {
          endpoint: `/admin/leads/uploads/${safeBatchId}/dealers`,
          method: "PATCH",
          body: { dealerIds: merged, mode: "replace" },
        },
      ]

      const addAttempts: Array<{
        endpoint: string
        method: "POST" | "PATCH" | "PUT"
        body: Record<string, unknown>
      }> = [
        {
          endpoint: `/hr/leads/uploads/${safeBatchId}/add-dealers`,
          method: "POST",
          body: { dealerIds: incoming, mode: "add" },
        },
        {
          endpoint: `/hr/calling-uploads/${safeBatchId}/add-dealers`,
          method: "POST",
          body: { dealerIds: incoming, mode: "add" },
        },
        ...replaceAttempts,
      ]

      const attempts = mode === "replace" ? replaceAttempts : addAttempts

      let lastError: unknown = null
      for (const attempt of attempts) {
        try {
          return await apiRequest(attempt.endpoint, {
            method: attempt.method,
            body: attempt.body,
          })
        } catch (error) {
          lastError = error
          const isMissingEndpoint =
            error instanceof ApiError &&
            (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
          if (!isMissingEndpoint) throw error
        }
      }

      throw lastError instanceof ApiError
        ? lastError
        : new ApiError(
            "Add-dealers endpoint is not available. Backend needs POST /hr/leads/uploads/:id/add-dealers (or PATCH …/dealers).",
            "HTTP_404",
          )
    },
  },

  // Admin APIs
  admin: {
    callingActions: {
      getAll: async (params?: {
        page?: number
        limit?: number
        dealerId?: string
        search?: string
        startDate?: string
        endDate?: string
        range?: "daily" | "weekly" | "monthly" | "last_month" | "all" | "custom"
      }) => {
        const queryParams = new URLSearchParams()
        if (params) {
          Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) queryParams.append(key, String(value))
          })
        }
        const query = queryParams.toString()
        const querySuffix = query ? `?${query}` : ""

        const endpoints = [
          `/admin/calling-actions${querySuffix}`,
          `/admin/calling-queue/actions${querySuffix}`,
          `/admin/leads/actions${querySuffix}`,
        ]

        let lastError: unknown = null
        for (const endpoint of endpoints) {
          try {
            return await apiRequest(endpoint)
          } catch (error) {
            lastError = error
            const isMissingEndpoint =
              error instanceof ApiError &&
              (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
            if (!isMissingEndpoint) throw error
          }
        }

        throw lastError
      },
    },

    quotations: {
      getAll: async (params?: {
        page?: number
        limit?: number
        status?: string
        search?: string
        startDate?: string
        endDate?: string
        dealerId?: string
      }) => {
        const queryParams = new URLSearchParams()
        if (params) {
          Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) queryParams.append(key, String(value))
          })
        }
        const query = queryParams.toString()
        return apiRequest(`/admin/quotations${query ? `?${query}` : ""}`)
      },

      /** Full quotation row (products / quotationProduct join). Tries admin route first. */
      getById: async (quotationId: string) => {
        const id = String(quotationId || "").trim()
        if (!id) throw new Error("Quotation id is required")
        const endpoints = [`/admin/quotations/${id}`, `/quotations/${id}`]
        let lastError: unknown = null
        for (const endpoint of endpoints) {
          try {
            return await apiRequest(endpoint)
          } catch (error) {
            lastError = error
          }
        }
        throw lastError
      },

      updateStatus: async (
        quotationId: string,
        status: string,
        approval?: {
          paymentType: "loan" | "cash" | "mix"
          bankName?: string
          bankIfsc?: string
          /** Subsidy cheque (cash or cash + loan) */
          subsidyChequeDetails?: string
          statusApprovedAt?: string
          loanAmount?: number
          cashAmount?: number
        },
      ) => {
        return apiRequest(`/admin/quotations/${quotationId}/status`, {
          method: "PATCH",
          body: {
            status,
            ...(approval
              ? {
                  paymentType: approval.paymentType,
                  paymentMode: approval.paymentType,
                  ...(approval.bankName ? { bankName: approval.bankName } : {}),
                  ...(approval.bankIfsc ? { bankIfsc: approval.bankIfsc } : {}),
                  ...(approval.subsidyChequeDetails?.trim()
                    ? { subsidyChequeDetails: approval.subsidyChequeDetails.trim() }
                    : {}),
                  ...(approval.statusApprovedAt
                    ? {
                        statusApprovedAt: approval.statusApprovedAt,
                        status_approved_at: approval.statusApprovedAt,
                      }
                    : {}),
                  ...(approval.loanAmount != null && approval.loanAmount > 0
                    ? { loanAmount: approval.loanAmount, loan_amount: approval.loanAmount }
                    : {}),
                  ...(approval.cashAmount != null && approval.cashAmount > 0
                    ? { cashAmount: approval.cashAmount, cash_amount: approval.cashAmount }
                    : {}),
                }
              : {}),
          },
        })
      },

      /**
       * Admin override for operational workflow stages (installer/metering/baldev confirmation).
       * Always sends force/adminOverride so admin can hand off pending_installer → pending_metering.
       */
      updateOperationalStatus: async (quotationId: string, installationStatus: string) => {
        const body = {
          installationStatus,
          installation_status: installationStatus,
          meteringStatus: installationStatus,
          metering_status: installationStatus,
          status: installationStatus,
          force: true,
          adminOverride: true,
          allowFromPendingInstaller: true,
          source: "admin",
        }

        const endpoints: Array<{ endpoint: string; method: "PATCH" | "POST" }> = [
          { endpoint: `/admin/quotations/${quotationId}/installation-status`, method: "PATCH" },
          { endpoint: `/admin/quotations/${quotationId}/workflow-status`, method: "PATCH" },
          { endpoint: `/installer/quotations/${quotationId}/installation-status`, method: "PATCH" },
          { endpoint: `/quotations/${quotationId}/status`, method: "PATCH" },
          { endpoint: `/quotations/${quotationId}/metering-status`, method: "PATCH" },
        ]

        let lastError: unknown = null
        for (const attempt of endpoints) {
          try {
            return await apiRequest(attempt.endpoint, { method: attempt.method, body })
          } catch (error) {
            lastError = error
            const isRetryable =
              error instanceof ApiError &&
              (error.code === "HTTP_404" ||
                error.code === "HTTP_405" ||
                error.code === "HTTP_501" ||
                error.code === "HTTP_403" ||
                error.code === "AUTH_004" ||
                // Transition guards: try next route (some accept adminOverride, some don't).
                /cannot send to metering/i.test(error.message) ||
                /pending_installer/i.test(error.message) ||
                /not allowed for this quotation state/i.test(error.message))
            if (!isRetryable) throw error
          }
        }
        throw lastError
      },

      /**
       * Meter in Discom → WCC Pending flag (server-backed; no localStorage).
       * Prefer dedicated route; fall back to installation-status PATCH with flag fields.
       */
      setMeteringWccAfterDiscom: async (quotationId: string, value: boolean) => {
        const flagBody = {
          meteringWccAfterDiscom: value,
          metering_wcc_after_discom: value,
        }
        const statusBody = {
          installationStatus: "metering_approved",
          installation_status: "metering_approved",
          meteringStatus: "metering_approved",
          metering_status: "metering_approved",
          ...flagBody,
        }

        const endpoints: Array<{ endpoint: string; method: "PATCH" | "POST"; body: Record<string, unknown> }> = [
          {
            endpoint: `/admin/quotations/${quotationId}/metering-wcc-after-discom`,
            method: "PATCH",
            body: flagBody,
          },
          {
            endpoint: `/admin/quotations/${quotationId}/installation-status`,
            method: "PATCH",
            body: statusBody,
          },
          {
            endpoint: `/admin/quotations/${quotationId}/workflow-status`,
            method: "PATCH",
            body: statusBody,
          },
          {
            endpoint: `/quotations/${quotationId}/metering-status`,
            method: "PATCH",
            body: statusBody,
          },
        ]

        let lastError: unknown = null
        for (const attempt of endpoints) {
          try {
            return await apiRequest(attempt.endpoint, {
              method: attempt.method,
              body: attempt.body,
            })
          } catch (error) {
            lastError = error
            const isRetryable =
              error instanceof ApiError &&
              (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
            if (!isRetryable) throw error
          }
        }
        throw lastError
      },

      /** Best-effort: advance quotation to MCO through admin + metering routes (ignores WF_003). */
      forceAdvanceToMco: forceAdvanceQuotationToMco,

      /**
       * Persist file-login workflow (portal filing). Backend should store fileLoginAt, file payment type,
       * optional bank + subsidy cheque, and return these fields on quotation GET/list.
       * Send `{ reset: true }` to clear file-login fields (backend should interpret `resetFileLogin: true` in body).
       */
      updateFileLogin: async (
        quotationId: string,
        payload:
          | { reset: true }
          | {
              fileLoginStatus: "already_login" | "login_now"
              filePaymentType: "loan" | "cash" | "mix"
              bankName?: string
              bankIfsc?: string
              fileSubsidyChequeDetails?: string
              fileLoginAt?: string
            },
      ) => {
        let body: Record<string, unknown>
        if ("reset" in payload && payload.reset) {
          body = { resetFileLogin: true }
        } else {
          const p = payload as {
            fileLoginStatus: "already_login" | "login_now"
            filePaymentType: "loan" | "cash" | "mix"
            bankName?: string
            bankIfsc?: string
            fileSubsidyChequeDetails?: string
            fileLoginAt?: string
          }
          body = {
            fileLoginStatus: p.fileLoginStatus,
            filePaymentType: p.filePaymentType,
            paymentMode: p.filePaymentType,
            ...(p.bankName ? { fileBankName: p.bankName, bankName: p.bankName } : {}),
            ...(p.bankIfsc ? { fileBankIfsc: p.bankIfsc, bankIfsc: p.bankIfsc } : {}),
            ...(p.fileSubsidyChequeDetails?.trim()
              ? { fileSubsidyChequeDetails: p.fileSubsidyChequeDetails.trim() }
              : {}),
            ...(p.fileLoginAt ? { fileLoginAt: p.fileLoginAt, file_login_at: p.fileLoginAt } : {}),
          }
        }
        return apiRequest(`/admin/quotations/${quotationId}/file-login`, {
          method: "PATCH",
          body,
        })
      },

      /**
       * Planned installation date (YYYY-MM-DD). Retries alternate paths until backend exposes one.
       */
      updateInstallationScheduledDate: async (quotationId: string, installationScheduledAt: string | null) => {
        const body =
          installationScheduledAt === null || installationScheduledAt === ""
            ? { installationScheduledAt: null, installation_scheduled_at: null }
            : { installationScheduledAt, installation_scheduled_at: installationScheduledAt }
        const endpoints = [
          `/admin/quotations/${quotationId}/installation-scheduled-at`,
          `/quotations/${quotationId}/installation-scheduled-at`,
          `/admin/quotations/${quotationId}/installation-schedule`,
          `/quotations/${quotationId}/installation-schedule`,
        ]
        let lastError: unknown = null
        for (const endpoint of endpoints) {
          try {
            return await apiRequest(endpoint, { method: "PATCH", body })
          } catch (error) {
            lastError = error
            const retry =
              error instanceof ApiError &&
              (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
            if (!retry) throw error
          }
        }
        throw lastError
      },

      /**
       * Persist which installation team owns a quotation row. Required for `/installation-team-login`:
       * installer queue is loaded from the API on the team device — localStorage assignments from admin do not sync.
       */
      updateInstallationTeamAssignment: async (quotationId: string, installationTeamId: string | null | undefined) => {
        const hasTeam = Boolean(installationTeamId && String(installationTeamId).trim())
        const id = hasTeam ? String(installationTeamId).trim() : ""
        const body = hasTeam
          ? { installationTeamId: id, installation_team_id: id }
          : { installationTeamId: null, installation_team_id: null }
        const endpoints = [
          `/admin/quotations/${quotationId}/installation-team`,
          `/admin/quotations/${quotationId}/installation_team`,
          `/quotations/${quotationId}/installation-team`,
          `/quotations/${quotationId}/installation_team`,
        ]
        let lastError: unknown = null
        for (const endpoint of endpoints) {
          try {
            return await apiRequest(endpoint, { method: "PATCH", body })
          } catch (error) {
            lastError = error
            const retry =
              error instanceof ApiError &&
              (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
            if (!retry) throw error
          }
        }
        throw lastError
      },
    },

    dealers: {
      getAll: async (params?: {
        page?: number
        limit?: number
        search?: string
        isActive?: boolean
        includeInactive?: boolean
      }) => {
        const queryParams = new URLSearchParams()
        if (params) {
          Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) queryParams.append(key, String(value))
          })
        }
        const query = queryParams.toString()
        return apiRequest(`/admin/dealers${query ? `?${query}` : ""}`)
      },
      
      update: async (dealerId: string, dealerData: any) => {
        return apiRequest(`/admin/dealers/${dealerId}`, {
          method: "PUT",
          body: dealerData,
        })
      },
      
      activate: async (dealerId: string) => {
        return apiRequest(`/admin/dealers/${dealerId}/activate`, {
          method: "PATCH",
        })
      },
    },

    installationTeams: {
      list: async () => {
        const endpoints = [
          "/admin/installation-teams",
          "/admin/installation/team-logins",
          "/admin/installation-team-logins",
        ]
        let lastError: unknown = null
        for (const endpoint of endpoints) {
          try {
            return await apiRequest(endpoint)
          } catch (error) {
            lastError = error
            const retry =
              error instanceof ApiError &&
              (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
            if (!retry) throw error
          }
        }
        throw lastError
      },

      create: async (payload: { name: string; username: string; password: string }) => {
        const body = {
          name: payload.name,
          teamName: payload.name,
          team_name: payload.name,
          username: payload.username,
          password: payload.password,
          role: "installation-team",
        }
        const endpoints = [
          "/admin/installation-teams",
          "/admin/installation/team-logins",
          "/admin/installation-team-logins",
        ]
        let lastError: unknown = null
        for (const endpoint of endpoints) {
          try {
            return await apiRequest(endpoint, { method: "POST", body })
          } catch (error) {
            lastError = error
            const retry =
              error instanceof ApiError &&
              (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
            if (!retry) throw error
          }
        }
        throw lastError
      },

      resetPassword: async (teamId: string, newPassword: string) => {
        const body = {
          password: newPassword,
          newPassword,
        }
        const endpoints = [
          `/admin/installation-teams/${teamId}/password`,
          `/admin/installation-teams/${teamId}/reset-password`,
          `/admin/installation/team-logins/${teamId}/password`,
        ]
        let lastError: unknown = null
        for (const endpoint of endpoints) {
          try {
            return await apiRequest(endpoint, { method: "PATCH", body })
          } catch (error) {
            lastError = error
            const retry =
              error instanceof ApiError &&
              (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
            if (!retry) throw error
          }
        }
        throw lastError
      },

      remove: async (teamId: string) => {
        const endpoints = [
          `/admin/installation-teams/${teamId}`,
          `/admin/installation/team-logins/${teamId}`,
          `/admin/installation-team-logins/${teamId}`,
        ]
        let lastError: unknown = null
        for (const endpoint of endpoints) {
          try {
            return await apiRequest(endpoint, { method: "DELETE" })
          } catch (error) {
            lastError = error
            const retry =
              error instanceof ApiError &&
              (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
            if (!retry) throw error
          }
        }
        throw lastError
      },
    },

    statistics: async (startDate?: string, endDate?: string) => {
      const params = new URLSearchParams()
      if (startDate) params.append("startDate", startDate)
      if (endDate) params.append("endDate", endDate)
      const query = params.toString()
      return apiRequest(`/admin/statistics${query ? `?${query}` : ""}`)
    },

    productNeeded: {
      getAll: async (params?: {
        scope?: "installation_pending" | "file_login"
        tab?: "file_login"
        page?: number
        limit?: number
        dealerId?: string
        search?: string
        startDate?: string
        endDate?: string
        dateField?: "installation_released" | "created" | "file_login" | "approved"
      }, options?: { suppressErrorLog?: boolean }) => {
        const queryParams = new URLSearchParams()
        if (params) {
          Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) queryParams.append(key, String(value))
          })
        }
        const query = queryParams.toString()
        return apiRequest(`/admin/product-needed${query ? `?${query}` : ""}`, {
          suppressErrorLog: Boolean(options?.suppressErrorLog),
        })
      },
    },

    visits: {
      getAll: async (params?: {
        page?: number
        limit?: number
        status?: string
        visitorId?: string
        startDate?: string
        endDate?: string
        search?: string
      }) => {
        const queryParams = new URLSearchParams()
        if (params) {
          Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) queryParams.append(key, String(value))
          })
        }
        const query = queryParams.toString()
        try {
          return await apiRequest(`/admin/visits${query ? `?${query}` : ""}`)
        } catch (error) {
          if (error instanceof ApiError && (error.code === "HTTP_404" || error.code === "HTTP_405")) {
            return apiRequest(`/visits${query ? `?${query}` : ""}`)
          }
          throw error
        }
      },
    },

    visitors: {
      create: async (visitorData: any) => {
        return apiRequest("/admin/visitors", {
          method: "POST",
          body: visitorData,
        })
      },

      getAll: async (params?: {
        page?: number
        limit?: number
        search?: string
        isActive?: boolean
        sortBy?: string
        sortOrder?: "asc" | "desc"
      }) => {
        const queryParams = new URLSearchParams()
        if (params) {
          Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) queryParams.append(key, String(value))
          })
        }
        const query = queryParams.toString()
        return apiRequest(`/admin/visitors${query ? `?${query}` : ""}`)
      },

      getById: async (visitorId: string) => {
        return apiRequest(`/admin/visitors/${visitorId}`)
      },

      update: async (visitorId: string, visitorData: any) => {
        return apiRequest(`/admin/visitors/${visitorId}`, {
          method: "PUT",
          body: visitorData,
        })
      },

      updatePassword: async (visitorId: string, newPassword: string) => {
        return apiRequest(`/admin/visitors/${visitorId}/password`, {
          method: "PUT",
          body: { newPassword },
        })
      },

      delete: async (visitorId: string) => {
        return apiRequest(`/admin/visitors/${visitorId}`, {
          method: "DELETE",
        })
      },
    },

    accountManagers: {
      create: async (accountManagerData: any) => {
        return apiRequest("/admin/account-managers", {
          method: "POST",
          body: accountManagerData,
        })
      },

      getAll: async (params?: {
        page?: number
        limit?: number
        search?: string
        isActive?: boolean
        sortBy?: string
        sortOrder?: "asc" | "desc"
      }) => {
        const queryParams = new URLSearchParams()
        if (params) {
          Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) queryParams.append(key, String(value))
          })
        }
        const query = queryParams.toString()
        return apiRequest(`/admin/account-managers${query ? `?${query}` : ""}`)
      },

      getById: async (accountManagerId: string) => {
        return apiRequest(`/admin/account-managers/${accountManagerId}`)
      },

      getHistory: async (accountManagerId: string, params?: {
        page?: number
        limit?: number
        startDate?: string
        endDate?: string
      }) => {
        const queryParams = new URLSearchParams()
        if (params) {
          Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) queryParams.append(key, String(value))
          })
        }
        const query = queryParams.toString()
        return apiRequest(`/admin/account-managers/${accountManagerId}/history${query ? `?${query}` : ""}`)
      },

      update: async (accountManagerId: string, accountManagerData: any) => {
        return apiRequest(`/admin/account-managers/${accountManagerId}`, {
          method: "PUT",
          body: accountManagerData,
        })
      },

      updatePassword: async (accountManagerId: string, newPassword: string) => {
        return apiRequest(`/admin/account-managers/${accountManagerId}/password`, {
          method: "PUT",
          body: { newPassword },
        })
      },

      activate: async (accountManagerId: string) => {
        return apiRequest(`/admin/account-managers/${accountManagerId}/activate`, {
          method: "PATCH",
        })
      },

      deactivate: async (accountManagerId: string) => {
        return apiRequest(`/admin/account-managers/${accountManagerId}/deactivate`, {
          method: "PATCH",
        })
      },

      delete: async (accountManagerId: string) => {
        return apiRequest(`/admin/account-managers/${accountManagerId}`, {
          method: "DELETE",
        })
      },
    },
  },

  // System Config
  config: {
    getProducts: async (category?: string) => {
      const query = category ? `?category=${category}` : ""
      return apiRequest(`/config/products${query}`)
    },

    getStates: async () => {
      return apiRequest("/config/states")
    },
  },

  // Admin Product Management
  adminProducts: {
    updateProducts: async (productData: any) => {
      // Note: This endpoint needs to be implemented on the backend
      // See BACKEND_PRODUCT_CATALOG_API.md for implementation details
      return apiRequest("/config/products", {
        method: "PUT",
        body: productData,
        requiresAuth: true,
      })
    },

    getProducts: async () => {
      return apiRequest("/config/products", {
        requiresAuth: true,
      })
    },
  },

  /** Presigned / public view URLs for private S3 objects (installation photos, documents). */
  media: {
    fetchPresignedUrl: async (endpoint: string) => {
      return apiRequest(endpoint, { requiresAuth: true })
    },

    /**
     * Ask API for a browser-openable URL for a private S3 or internal file URL.
     * Backend should implement one of the paths tried in `resolvePublicOpenMediaUrl`.
     */
    resolvePublicUrl: async (sourceUrl: string, quotationId?: string): Promise<string | null> => {
      const encoded = encodeURIComponent(sourceUrl.trim())
      const endpoints: string[] = []
      if (quotationId) {
        endpoints.push(
          `/quotations/${quotationId}/documents/view-url?url=${encoded}`,
          `/quotations/${quotationId}/documents/presign-url?url=${encoded}`,
          `/admin/quotations/${quotationId}/documents/view-url?url=${encoded}`,
        )
      }
      endpoints.push(`/media/presign-url?url=${encoded}`, `/files/presigned-url?url=${encoded}`)

      for (const endpoint of endpoints) {
        try {
          const payload = await apiRequest(endpoint, { requiresAuth: true })
          const root = (payload as { data?: unknown })?.data ?? payload
          if (!root || typeof root !== "object") continue
          const o = root as Record<string, unknown>
          for (const k of ["publicUrl", "public_url", "signedUrl", "signed_url", "viewUrl", "url"]) {
            const v = o[k]
            if (typeof v === "string" && v.trim()) return v.trim()
          }
        } catch {
          continue
        }
      }
      return null
    },
  },
}

// api is already exported above, so we only export the other items here
export { ApiError, getAuthToken, clearAuthTokens, apiErrorToUserMessage }
export type { ApiResponse }



