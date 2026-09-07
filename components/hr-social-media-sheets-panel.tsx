"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { api, ApiError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import {
  DEFAULT_SOCIAL_LEADS_SPREADSHEET_ID,
  DEFAULT_SOCIAL_SHEET_TAB_NAMES,
  defaultSheetSourcesForSpreadsheet,
  extractUploadBatchesList,
  extractUploadRowsFromBatchResponse,
  filterSourcesToDiscoveredTabs,
  getSocialLeadStatusDisplay,
  isGoogleSheetsCredentialsPendingError,
  mapHrUploadRowToSocialLead,
  matchSocialSheetUploadBatch,
  normalizeDiscoverTabsResponse,
  normalizeSheetSourcesResponse,
  normalizeSocialLeadsResponse,
  readHrSheetSourcesFromStorage,
  reconcileSheetSourcesWithDiscoveredTabs,
  SOCIAL_LEAD_STATUS_TABS,
  type SocialLeadStatusBucket,
  type SocialMediaLeadRow,
  type SocialMediaLeadSource,
  writeDiscoveredSheetTabsToStorage,
  writeHrSheetSourcesToStorage,
} from "@/lib/google-sheets-social-leads"
import { Loader2, RefreshCw, Sheet } from "lucide-react"

type DealerOption = {
  id: string
  firstName: string
  lastName: string
  mobile: string
  email: string
}

type HrSocialMediaSheetsPanelProps = {
  dealers: DealerOption[]
  realtimeTick?: number
  onSyncComplete?: () => void
}

const SPREADSHEET_URL =
  "https://docs.google.com/spreadsheets/d/18zqPIpa3fcjRvfNqdm3FPC10bszPIPHbv5F3-TMk0A0/edit"

/** Soft UI refresh if backend cron ran but socket was missed. */
const SHEET_AUTO_REFRESH_MS = 15 * 60 * 1000

const isRealSheetSourceId = (id: string) => id && !id.startsWith("local-")

export function HrSocialMediaSheetsPanel({
  dealers,
  realtimeTick = 0,
  onSyncComplete,
}: HrSocialMediaSheetsPanelProps) {
  const { toast } = useToast()
  const [sources, setSources] = useState<SocialMediaLeadSource[]>([])
  const [activeSheetTab, setActiveSheetTab] = useState("")
  const [isLoadingSources, setIsLoadingSources] = useState(true)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [leads, setLeads] = useState<SocialMediaLeadRow[]>([])
  const [leadStatusFilter, setLeadStatusFilter] = useState<SocialLeadStatusBucket | "all">("all")
  const [isLoadingLeads, setIsLoadingLeads] = useState(false)
  const [apiUnavailable, setApiUnavailable] = useState(false)
  const [googleCredentialsPending, setGoogleCredentialsPending] = useState(false)
  const [pendingDealerIds, setPendingDealerIds] = useState<Record<string, string[]>>({})

  const activeSource = useMemo(
    () => sources.find((s) => s.sheetTabName === activeSheetTab) ?? sources[0],
    [sources, activeSheetTab],
  )

  /** Keep spreadsheet tab order from Discover / defaults. */
  const orderedSources = useMemo(() => {
    const preferred = DEFAULT_SOCIAL_SHEET_TAB_NAMES.map((name) =>
      name.toLowerCase().replace(/[\s_-]+/g, ""),
    )
    const score = (source: SocialMediaLeadSource) => {
      const key = source.sheetTabName.toLowerCase().replace(/[\s_-]+/g, "")
      const idx = preferred.indexOf(key)
      if (idx >= 0) return idx
      if (source.enabled) return 100
      return 200
    }
    return [...sources].sort((a, b) => {
      const diff = score(a) - score(b)
      if (diff !== 0) return diff
      return a.displayName.localeCompare(b.displayName)
    })
  }, [sources])

  const leadStatusCounts = useMemo(() => {
    const counts: Record<SocialLeadStatusBucket | "all", number> = {
      all: leads.length,
      new: 0,
      pending: 0,
      not_interested: 0,
      interested: 0,
    }
    for (const row of leads) {
      counts[getSocialLeadStatusDisplay(row).bucket] += 1
    }
    return counts
  }, [leads])

  const filteredLeads = useMemo(() => {
    if (leadStatusFilter === "all") return leads
    return leads.filter((row) => getSocialLeadStatusDisplay(row).bucket === leadStatusFilter)
  }, [leads, leadStatusFilter])

  const loadSources = useCallback(async (): Promise<SocialMediaLeadSource[]> => {
    setIsLoadingSources(true)
    try {
      const response = await api.hr.sheetSources.getAll()
      const normalized = filterSourcesToDiscoveredTabs(normalizeSheetSourcesResponse(response))
      if (normalized.length > 0) {
        setSources(normalized)
        writeHrSheetSourcesToStorage(normalized)
        setApiUnavailable(false)
        if (normalized.some((s) => isRealSheetSourceId(s.id) && (s.rowCount ?? 0) > 0)) {
          setGoogleCredentialsPending(false)
        }
        setActiveSheetTab((prev) => {
          if (prev && normalized.some((s) => s.sheetTabName === prev)) return prev
          return normalized[0].sheetTabName
        })
        return normalized
      }
      throw new Error("Empty sheet sources response")
    } catch (error) {
      const missing =
        error instanceof ApiError &&
        (error.code === "HTTP_404" || error.code === "HTTP_405" || error.code === "HTTP_501")
      const stored = filterSourcesToDiscoveredTabs(readHrSheetSourcesFromStorage())
      const fallback =
        stored.length > 0
          ? stored
          : defaultSheetSourcesForSpreadsheet(DEFAULT_SOCIAL_LEADS_SPREADSHEET_ID)
      setSources(fallback)
      setApiUnavailable(missing)
      setActiveSheetTab((prev) => {
        if (prev && fallback.some((s) => s.sheetTabName === prev)) return prev
        return fallback[0]?.sheetTabName || ""
      })
      return fallback
    } finally {
      setIsLoadingSources(false)
    }
  }, [])

  const loadLeadsFromUploadBatch = useCallback(async (uploadId: string, sourceTab: string) => {
    const response = await api.hr.uploadedLeads.getById(uploadId, { limit: 200 })
    const rows = extractUploadRowsFromBatchResponse(response)
    return rows.map((row) => mapHrUploadRowToSocialLead(row, sourceTab))
  }, [])

  const resolveUploadIdForSource = useCallback(async (source: SocialMediaLeadSource) => {
    if (source.uploadId) return source.uploadId

    const uploadsResponse = await api.hr.uploadedLeads.getAll({ limit: 200 })
    const batches = extractUploadBatchesList(uploadsResponse)
    const match = matchSocialSheetUploadBatch(batches, source.sheetTabName)
    const id = match?.id || match?.batchId || match?.uploadId
    return id ? String(id) : ""
  }, [])

  const loadLeads = useCallback(
    async (source: SocialMediaLeadSource | undefined) => {
      if (!source?.sheetTabName) {
        setLeads([])
        return
      }

      setIsLoadingLeads(true)
      try {
        let loaded: SocialMediaLeadRow[] = []

        if (isRealSheetSourceId(source.id)) {
          try {
            const response = await api.hr.sheetSources.getLeads(source.id, { limit: 200 })
            loaded = normalizeSocialLeadsResponse(response)
          } catch {
            // Fall through to upload batch
          }
        }

        if (loaded.length === 0) {
          const uploadId = await resolveUploadIdForSource(source)
          if (uploadId) {
            loaded = await loadLeadsFromUploadBatch(uploadId, source.sheetTabName)
          }
        }

        setLeads(loaded)
      } catch {
        setLeads([])
      } finally {
        setIsLoadingLeads(false)
      }
    },
    [loadLeadsFromUploadBatch, resolveUploadIdForSource],
  )

  useEffect(() => {
    void loadSources()
  }, [loadSources, realtimeTick])

  // Fallback refresh every 15 min — primary path is backend cron + calling:uploads-updated socket.
  useEffect(() => {
    if (typeof window === "undefined") return
    const timer = window.setInterval(() => {
      void loadSources()
    }, SHEET_AUTO_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [loadSources])

  useEffect(() => {
    setLeadStatusFilter("all")
  }, [activeSheetTab])

  useEffect(() => {
    if (activeSource) void loadLeads(activeSource)
  }, [activeSource, loadLeads, realtimeTick])

  useEffect(() => {
    if (!activeSource) return
    setPendingDealerIds((prev) => {
      if (prev[activeSource.id]) return prev
      return { ...prev, [activeSource.id]: [...activeSource.dealerIds] }
    })
  }, [activeSource])

  const handleDiscover = async () => {
    setIsDiscovering(true)
    try {
      const response = await api.hr.sheetSources.discover(DEFAULT_SOCIAL_LEADS_SPREADSHEET_ID)
      const tabs = normalizeDiscoverTabsResponse(response)
      const discovered = tabs.length > 0 ? tabs : DEFAULT_SOCIAL_SHEET_TAB_NAMES
      const reconciled = reconcileSheetSourcesWithDiscoveredTabs(
        sources,
        discovered,
        DEFAULT_SOCIAL_LEADS_SPREADSHEET_ID,
      )
      writeDiscoveredSheetTabsToStorage(discovered)
      setSources(reconciled)
      writeHrSheetSourcesToStorage(reconciled)
      setGoogleCredentialsPending(false)
      setApiUnavailable(false)
      setActiveSheetTab((prev) => {
        if (prev && reconciled.some((s) => s.sheetTabName === prev)) return prev
        return reconciled[0]?.sheetTabName || ""
      })
      toast({
        title: "Sheets discovered",
        description:
          tabs.length > 0
            ? `${tabs.length} tab(s) from spreadsheet — UI updated to match.`
            : "No tabs returned; showing default list.",
      })
    } catch (error) {
      const credentialsPending = isGoogleSheetsCredentialsPendingError(error)
      const discovered = DEFAULT_SOCIAL_SHEET_TAB_NAMES
      const reconciled = reconcileSheetSourcesWithDiscoveredTabs(
        sources.length > 0 ? sources : defaultSheetSourcesForSpreadsheet(DEFAULT_SOCIAL_LEADS_SPREADSHEET_ID),
        discovered,
        DEFAULT_SOCIAL_LEADS_SPREADSHEET_ID,
      )
      writeDiscoveredSheetTabsToStorage(discovered)
      setSources(reconciled)
      writeHrSheetSourcesToStorage(reconciled)
      setActiveSheetTab((prev) => {
        if (prev && reconciled.some((s) => s.sheetTabName === prev)) return prev
        return reconciled[0]?.sheetTabName || ""
      })

      if (credentialsPending) {
        setGoogleCredentialsPending(true)
        toast({
          title: "Google credentials pending",
          description:
            "Backend Google Sheets env is not set yet. Showing the 4 default sheet tabs. Add GOOGLE_SERVICE_ACCOUNT_JSON to server .env, then Discover again.",
        })
      } else {
        toast({
          title: "Using default tabs",
          description:
            error instanceof ApiError
              ? error.message
              : "Could not reach Google Sheets. Default tab list is loaded for configuration.",
        })
      }
    } finally {
      setIsDiscovering(false)
    }
  }

  const saveSourceConfig = async (source: SocialMediaLeadSource, patch: Partial<SocialMediaLeadSource>) => {
    const next = { ...source, ...patch }
    setSources((prev) => {
      const updated = prev.map((s) => (s.id === source.id ? next : s))
      writeHrSheetSourcesToStorage(updated)
      return updated
    })

    if (!isRealSheetSourceId(source.id) || apiUnavailable) return next

    setIsSaving(true)
    try {
      const response = await api.hr.sheetSources.update(source.id, {
        enabled: next.enabled,
        dealerIds: next.dealerIds,
        activeLimitPerDealer: next.activeLimitPerDealer,
        displayName: next.displayName,
      })
      const updated = normalizeSheetSourcesResponse(response)
      if (updated.length === 1) {
        setSources((prev) => {
          const merged = prev.map((s) => (s.id === source.id ? { ...s, ...updated[0] } : s))
          writeHrSheetSourcesToStorage(merged)
          return merged
        })
        return { ...next, ...updated[0] }
      }
      return next
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof ApiError ? error.message : "Could not save sheet source config.",
        variant: "destructive",
      })
      return next
    } finally {
      setIsSaving(false)
    }
  }

  const runAssignUnassignedForSource = async (source: SocialMediaLeadSource) => {
    const uploadId = source.uploadId || (await resolveUploadIdForSource(source))
    if (!uploadId) return false

    try {
      await api.hr.assignUnassignedLeads(uploadId, {
        assignmentMode: "active_cap",
        activeLimitPerDealer: source.activeLimitPerDealer || 1,
        rebalance: true,
      })
      return true
    } catch {
      return false
    }
  }

  const toggleEnabled = async (source: SocialMediaLeadSource, enabled: boolean) => {
    await saveSourceConfig(source, { enabled })
  }

  const toggleDealer = (sourceId: string, dealerId: string) => {
    setPendingDealerIds((prev) => {
      const current = prev[sourceId] || []
      const next = current.includes(dealerId)
        ? current.filter((id) => id !== dealerId)
        : [...current, dealerId]
      return { ...prev, [sourceId]: next }
    })
  }

  const applyDealerPool = async (source: SocialMediaLeadSource) => {
    const dealerIds = pendingDealerIds[source.id] || []
    if (source.enabled && dealerIds.length === 0) {
      toast({
        title: "Select dealers",
        description: "Turn on a sheet tab and pick at least one dealer for round-robin assignment.",
        variant: "destructive",
      })
      return
    }
    const saved = await saveSourceConfig(source, { dealerIds })
    const assigned = await runAssignUnassignedForSource(saved)
    await loadLeads(saved)
    onSyncComplete?.()

    if (assigned) {
      toast({
        title: "Dealer pool saved & assigned",
        description: `${dealerIds.length} dealer(s) in pool. Unassigned leads distributed (1 active per dealer).`,
      })
    } else {
      toast({
        title: "Dealer pool saved",
        description: `${dealerIds.length} dealer(s) in pool. Run Sync now if leads are not visible yet.`,
      })
    }
  }

  const syncSource = async (source: SocialMediaLeadSource) => {
    if (!isRealSheetSourceId(source.id)) {
      toast({
        title: "Discover tabs first",
        description:
          "Click Discover tabs so this sheet gets a server id, or wait until backend Google credentials are configured.",
      })
      return
    }
    if (apiUnavailable) {
      toast({
        title: "Sync not available yet",
        description: "Backend sheet sync route is not ready.",
      })
      return
    }

    const dealerIds = pendingDealerIds[source.id] || source.dealerIds
    if (source.enabled && dealerIds.length === 0) {
      toast({
        title: "Select dealers first",
        description: "Check dealers in the pool and click Save dealer pool before syncing.",
        variant: "destructive",
      })
      return
    }

    setSyncingId(source.id)
    try {
      await api.hr.sheetSources.sync(source.id)
      setGoogleCredentialsPending(false)
      toast({
        title: "Sync complete",
        description: `${source.displayName} — leads imported. Assigning to dealer pool…`,
      })
      await loadSources()
      const refreshed =
        (await api.hr.sheetSources.getAll().then((r) => normalizeSheetSourcesResponse(r).find((s) => s.id === source.id))) ??
        source
      await runAssignUnassignedForSource(refreshed)
      await loadLeads(refreshed)
      onSyncComplete?.()
    } catch (error) {
      if (isGoogleSheetsCredentialsPendingError(error)) {
        setGoogleCredentialsPending(true)
        toast({
          title: "Google credentials pending",
          description: "Add GOOGLE_SERVICE_ACCOUNT_JSON to backend .env, then retry Sync now.",
        })
      } else {
        toast({
          title: "Sync failed",
          description: error instanceof ApiError ? error.message : "Could not sync sheet.",
          variant: "destructive",
        })
      }
    } finally {
      setSyncingId(null)
    }
  }

  if (isLoadingSources) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading social media sheet sources…
      </div>
    )
  }

  if (sources.length === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="py-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">No sheet tabs configured.</p>
          <Button onClick={() => void handleDiscover()} disabled={isDiscovering} className="gap-2">
            {isDiscovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Discover spreadsheet tabs
          </Button>
        </CardContent>
      </Card>
    )
  }

  const currentTab = activeSource?.sheetTabName || sources[0].sheetTabName

  return (
    <div className="space-y-4">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sheet className="w-4 h-4 text-primary" />
            Meta / Social Media Leads (Google Sheet)
          </CardTitle>
          <CardDescription>
            Sub-tabs match the live spreadsheet. Enable a tab, pick dealers, then sync once — backend should
            auto-sync enabled tabs about every <span className="font-medium text-foreground">15 minutes</span> and
            push updates over socket (<span className="font-medium text-foreground">calling:uploads-updated</span>).
            Use <span className="font-medium text-foreground">Sync now</span> for an immediate pull.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => void handleDiscover()}
            disabled={isDiscovering}
          >
            {isDiscovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Discover tabs
          </Button>
          <a
            href={SPREADSHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            Open spreadsheet
          </a>
          <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
            Auto-sync ~15 min + socket refresh
          </Badge>
          {googleCredentialsPending ? (
            <Badge variant="outline" className="text-sky-800 border-sky-200 bg-sky-50">
              Google credentials pending — default tabs loaded; sync after backend .env
            </Badge>
          ) : apiUnavailable ? (
            <Badge variant="outline" className="text-amber-800 border-amber-200 bg-amber-50">
              API pending — config saved locally until backend ships
            </Badge>
          ) : null}
        </CardContent>
      </Card>

      <Tabs value={currentTab} onValueChange={setActiveSheetTab} className="space-y-4">
        <TabsList className="flex w-full justify-start overflow-x-auto whitespace-nowrap">
          {orderedSources.map((source) => (
            <TabsTrigger key={source.id} value={source.sheetTabName} className="shrink-0 text-xs sm:text-sm gap-1">
              {source.displayName}
              {source.enabled ? (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        {orderedSources.map((source) => {
          const dealerIds = pendingDealerIds[source.id] || source.dealerIds
          const isSyncing = syncingId === source.id

          return (
            <TabsContent key={source.id} value={source.sheetTabName} className="space-y-4">
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{source.displayName}</CardTitle>
                      <CardDescription className="text-xs mt-1">
                        Sheet tab: <code className="text-foreground">{source.sheetTabName}</code>
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={source.enabled}
                          onCheckedChange={(checked) => void toggleEnabled(source, checked)}
                        />
                        Enabled
                      </label>
                      <Button
                        size="sm"
                        className="gap-2"
                        disabled={!source.enabled || isSyncing}
                        onClick={() => void syncSource(source)}
                      >
                        {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Sync now
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2 text-xs">
                    {source.rowCount != null ? (
                      <Badge variant="outline">{source.rowCount} rows</Badge>
                    ) : null}
                    {source.assignedCount != null ? (
                      <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-900">
                        Assigned {source.assignedCount}
                      </Badge>
                    ) : null}
                    {source.unassignedCount != null ? (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
                        Unassigned {source.unassignedCount}
                      </Badge>
                    ) : null}
                    {source.completedCount != null ? (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-900">
                        Completed {source.completedCount}
                      </Badge>
                    ) : null}
                    {source.lastSyncedAt ? (
                      <span className="text-muted-foreground">
                        Last sync: {new Date(source.lastSyncedAt).toLocaleString()}
                      </span>
                    ) : null}
                    {source.lastSyncStatus === "error" && source.lastSyncError ? (
                      <span className="text-rose-600">{source.lastSyncError}</span>
                    ) : null}
                  </div>

                  {source.enabled ? (
                    <div className="space-y-3 rounded-md border border-border/60 p-3">
                      <p className="text-sm font-medium">Dealer pool (round-robin, 1 active lead each)</p>
                      {dealers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No dealers with Quotation access.</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {dealers.map((dealer) => (
                            <label
                              key={dealer.id}
                              className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 cursor-pointer hover:bg-muted/40"
                            >
                              <Checkbox
                                checked={dealerIds.includes(dealer.id)}
                                onCheckedChange={() => toggleDealer(source.id, dealer.id)}
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
                          ))}
                        </div>
                      )}
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          disabled={isSaving}
                          onClick={() => void applyDealerPool(source)}
                        >
                          {isSaving ? "Saving…" : "Save dealer pool"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Turn on <span className="font-medium text-foreground">Enabled</span> to configure dealers and
                      sync leads from this sheet tab.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="text-base">Leads from sheet</CardTitle>
                  <CardDescription>
                    Filter by status: New (sky), Pending (amber), Not interested (rose), Interested / Visit (green).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {SOCIAL_LEAD_STATUS_TABS.map((tab) => {
                      const active = leadStatusFilter === tab.key
                      const count = leadStatusCounts[tab.key]
                      return (
                        <Button
                          key={tab.key}
                          type="button"
                          size="sm"
                          variant="outline"
                          className={`h-8 text-xs ${active ? tab.activeClass : ""}`}
                          onClick={() => setLeadStatusFilter(tab.key)}
                        >
                          {tab.label}
                          <span className="ml-1 tabular-nums opacity-80">({count})</span>
                        </Button>
                      )
                    })}
                  </div>
                  {isLoadingLeads ? (
                    <div className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading leads…
                    </div>
                  ) : leads.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-6 text-center space-y-2">
                      <p>
                        {googleCredentialsPending
                          ? "Leads appear after backend Google credentials are set and Sync now runs."
                          : "No leads in this tab yet."}
                      </p>
                      <p className="text-xs">
                        Steps: (1) check dealers → <span className="font-medium text-foreground">Save dealer pool</span>
                        → (2) <span className="font-medium text-foreground">Sync now</span> to pull from Google Sheet.
                        Synced leads also show under <span className="font-medium text-foreground">Uploaded Data</span>.
                      </p>
                    </div>
                  ) : filteredLeads.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      No leads in this status. Try another filter tab.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[480px] overflow-auto pr-1">
                      {filteredLeads.map((row, idx) => {
                        const display = getSocialLeadStatusDisplay(row)
                        return (
                          <div
                            key={row.id || `${row.mobile}-${idx}`}
                            className={`rounded-md border border-border/60 border-l-4 ${display.cardAccentClassName} p-3 space-y-1`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium">{row.name || "—"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {row.mobile}
                                  {row.platform ? ` · ${row.platform}` : ""}
                                  {row.campaignName ? ` · ${row.campaignName}` : ""}
                                </p>
                              </div>
                              <Badge variant="outline" className={display.badgeClassName}>
                                {display.label}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                              {row.address ? (
                                <p><span className="text-muted-foreground">Address:</span> {row.address}</p>
                              ) : null}
                              {row.kw ? (
                                <p><span className="text-muted-foreground">KW:</span> {row.kw}</p>
                              ) : null}
                              {row.assignedPersonName ? (
                                <p><span className="text-muted-foreground">Sheet assignee:</span> {row.assignedPersonName}</p>
                              ) : null}
                              {row.assignedDealerName ? (
                                <p><span className="text-muted-foreground">Dealer:</span> {row.assignedDealerName}</p>
                              ) : null}
                              {row.firstCallResponse ? (
                                <p><span className="text-muted-foreground">1st call:</span> {row.firstCallResponse}</p>
                              ) : null}
                              {row.secondCallResponse ? (
                                <p><span className="text-muted-foreground">2nd call:</span> {row.secondCallResponse}</p>
                              ) : null}
                              {row.remarks ? (
                                <p><span className="text-muted-foreground">Remarks:</span> {row.remarks}</p>
                              ) : null}
                              {row.finalDecision ? (
                                <p><span className="text-muted-foreground">Final:</span> {row.finalDecision}</p>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
