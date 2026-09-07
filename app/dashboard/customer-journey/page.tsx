"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { DashboardNav } from "@/components/dashboard-nav"
import { FullCustomerJourneyPanel } from "@/components/full-customer-journey-panel"
import { api, ApiError } from "@/lib/api"
import type { Quotation } from "@/lib/quotation-context"
import { canOpenSection, getPostLoginPath } from "@/lib/user-access"
import type { JourneyCallingAction } from "@/lib/full-customer-journey"
import { normalizeJourneyCallingActions } from "@/lib/journey-calling-actions"
import { readDealerCallingActions } from "@/lib/dealer-calling-action-history"
import { isQuotationAdminAccess } from "@/lib/admin-access"

function mergeJourneyCallingActions(lists: JourneyCallingAction[][]): JourneyCallingAction[] {
  const byId = new Map<string, JourneyCallingAction>()
  for (const list of lists) {
    for (const action of list) {
      const key =
        action.id ||
        `${action.leadId || ""}|${action.actionAt || ""}|${action.action || ""}|${action.customerMobile || ""}`
      const existing = byId.get(key)
      if (!existing) {
        byId.set(key, action)
        continue
      }
      const richer =
        (action.callRemark || "").length >= (existing.callRemark || "").length ? action : existing
      byId.set(key, {
        ...existing,
        ...richer,
        customerMobile: richer.customerMobile || existing.customerMobile,
        statusText: richer.statusText || existing.statusText,
        statusCategory: richer.statusCategory || existing.statusCategory,
        actionAt: richer.actionAt || existing.actionAt,
      })
    }
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.actionAt || 0).getTime() - new Date(a.actionAt || 0).getTime(),
  )
}

export default function CustomerJourneyPage() {
  const { isAuthenticated, dealer, role, access } = useAuth()
  const router = useRouter()
  const useApi = process.env.NEXT_PUBLIC_USE_API !== "false"
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [callingActions, setCallingActions] = useState<JourneyCallingAction[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const searchFetchRef = useRef(0)
  const searchTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login")
      return
    }
    if (isQuotationAdminAccess({ role, username: dealer?.username })) {
      router.push("/dashboard/admin")
      return
    }
    if (!canOpenSection(access, role, "quotation") && role !== "dealer") {
      router.push(getPostLoginPath(access))
    }
  }, [isAuthenticated, router, dealer, role, access])

  const localCallingActions = useCallback((): JourneyCallingAction[] => {
    const dealerId = String(dealer?.id || "").trim()
    if (!dealerId) return []
    return normalizeJourneyCallingActions(
      readDealerCallingActions(dealerId).map((row) => ({
        id: row.id,
        leadId: row.leadId,
        dealerId: row.dealerId,
        name: row.name,
        mobile: row.mobile,
        action: row.action,
        actionAt: row.actionAt,
        callRemark: row.callRemark,
        nextFollowUpAt: row.nextFollowUpAt,
        statusCategory: row.statusCategory,
        statusText: row.statusText,
      })),
    )
  }, [dealer?.id])

  const fetchCallingActionsForQuery = useCallback(async (search: string): Promise<JourneyCallingAction[]> => {
    const trimmed = search.trim()
    if (trimmed.length < 3) return []
    const digits = trimmed.replace(/\D/g, "")
    const query = {
      limit: 200,
      search: digits.length >= 8 ? digits.slice(-10) : trimmed,
      range: "all" as const,
    }
    let rows: JourneyCallingAction[] = []
    try {
      const response = await api.dealers.callingActions.getAll(query)
      rows = normalizeJourneyCallingActions(response)
    } catch {
      rows = []
    }
    if (rows.length === 0) {
      try {
        const response = await api.hr.callingActions.getAll(query)
        rows = normalizeJourneyCallingActions(response)
      } catch {
        rows = []
      }
    }
    return rows
  }, [])

  const loadJourney = useCallback(async () => {
    if (!useApi || !isAuthenticated) return
    setIsLoading(true)
    try {
      const localActions = localCallingActions()

      const [quotationsRes, actionsRes, queueRes] = await Promise.all([
        api.quotations.getAll({ limit: 500 }).catch(() => null),
        api.dealers.callingActions.getAll({ limit: 500, range: "daily" }).catch(() => null),
        api.dealers.getCallingQueueCurrent().catch(() => null),
      ])

      const quotationRows =
        (quotationsRes as any)?.quotations ||
        (quotationsRes as any)?.data?.quotations ||
        (Array.isArray(quotationsRes) ? quotationsRes : [])
      const quotationsList = Array.isArray(quotationRows) ? quotationRows : []
      setQuotations(quotationsList)

      const merged = mergeJourneyCallingActions([
        normalizeJourneyCallingActions(actionsRes),
        normalizeJourneyCallingActions(queueRes),
        localActions,
      ])

      // Show the list from bulk calling-actions + queue. Per-mobile search is skipped
      // because that endpoint often 400s and floods the console.
      setCallingActions(merged)
      setIsLoading(false)
    } catch (error) {
      console.error("Failed to load customer journey:", error instanceof ApiError ? error.message : error)
      setQuotations([])
      setCallingActions([])
      setIsLoading(false)
    }
  }, [useApi, isAuthenticated, localCallingActions])

  useEffect(() => {
    void loadJourney()
  }, [loadJourney])

  const handleSearchChange = useCallback(
    (term: string) => {
      if (!useApi || !isAuthenticated) return
      const trimmed = term.trim()
      if (trimmed.length < 3) return

      const requestId = ++searchFetchRef.current
      window.clearTimeout(searchTimerRef.current)
      searchTimerRef.current = window.setTimeout(() => {
        void (async () => {
          const found = await fetchCallingActionsForQuery(trimmed)
          if (requestId !== searchFetchRef.current || found.length === 0) return
          setCallingActions((prev) => mergeJourneyCallingActions([prev, found]))
        })()
      }, 350)
    },
    [useApi, isAuthenticated, fetchCallingActionsForQuery],
  )

  if (!isAuthenticated) return null

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />
      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Customer Journey</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Calling Data → Calling Action → Quotation → Final Confirmation
          </p>
        </div>
        <FullCustomerJourneyPanel
          quotations={quotations}
          callingActions={callingActions}
          title="Customer Journey"
          description="Full stored journey for each customer from first call through final confirmation. Defaults to Today — loads 20 rows at a time; scroll for more."
          emptyMessage="No journey records yet for this date filter. Start from Calling Data — submitted call actions and quotations will appear here."
          maxHeightClassName="max-h-[70vh]"
          isLoading={isLoading}
          initialDateFilter="today"
          onSearchChange={handleSearchChange}
        />
      </main>
    </div>
  )
}
