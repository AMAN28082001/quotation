"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { Quotation } from "@/lib/quotation-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ChevronDown, ChevronRight, Filter, Search } from "lucide-react"
import { formatYmdLocal } from "@/lib/calling-report-date-range"
import { formatPersonName } from "@/lib/name-display"
import type { JourneyDateRangeFilter, JourneyStageStatus } from "@/lib/customer-journey"
import {
  buildFullCustomerJourneyRows,
  formatFullJourneyStageLabel,
  formatJourneyStageDateTime,
  FULL_JOURNEY_STAGE_LABELS,
  matchesFullJourneyDateRange,
  matchesFullJourneySearch,
  matchesJourneyCallingSourceFilter,
  matchesJourneyConnectionFilter,
  matchesJourneyDealerFilter,
  matchesJourneyOutcomeFilter,
  type FullJourneyStageKey,
  type JourneyCallingAction,
  type JourneyCallingSourceFilter,
  type JourneyConnectionFilter,
  type JourneyOutcomeFilter,
} from "@/lib/full-customer-journey"
import {
  CALLING_CONNECTION_LABELS,
  CALLING_SUMMARY_BUCKET_LABELS,
} from "@/lib/calling-action-summary"
import { useIncrementalList } from "@/hooks/use-incremental-list"
import { IncrementalListSentinel } from "@/components/incremental-list-sentinel"

function statusBadgeClass(status: JourneyStageStatus) {
  if (status === "completed") return "bg-green-600 text-white"
  if (status === "in_progress") return "bg-amber-500 text-white"
  return "bg-muted text-muted-foreground"
}

const STAGE_ORDER: FullJourneyStageKey[] = [
  "callingData",
  "callingAction",
  "quotation",
  "adminApproval",
  "installation",
  "metering",
  "finalConfirmation",
]

type JourneyDealerOption = {
  id: string
  label: string
}

type FullCustomerJourneyPanelProps = {
  quotations: Quotation[]
  callingActions: JourneyCallingAction[]
  title?: string
  description?: string
  emptyMessage?: string
  maxHeightClassName?: string
  showDealerDetails?: boolean
  /** When provided, shows an All dealers / dealer dropdown filter (admin). */
  dealers?: JourneyDealerOption[]
  resolveDealerDetails?: (quotation: Quotation | undefined, rowDealerId?: string) => {
    name: string
    mobile?: string
  } | null
  isLoading?: boolean
  /** Parent can fetch extra calling-actions for this search (e.g. by mobile). */
  onSearchChange?: (term: string) => void
}

export function FullCustomerJourneyPanel({
  quotations,
  callingActions,
  title = "Customer Journey",
  description = "Full path from Calling Data → Calling Action → Quotation → Final Confirmation.",
  emptyMessage = "No customer journey records found.",
  maxHeightClassName = "max-h-[640px]",
  showDealerDetails = false,
  dealers,
  resolveDealerDetails,
  isLoading = false,
  onSearchChange,
}: FullCustomerJourneyPanelProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [dateFilter, setDateFilter] = useState<JourneyDateRangeFilter>("all")
  const [customFromDate, setCustomFromDate] = useState("")
  const [customToDate, setCustomToDate] = useState("")
  const [callingSourceFilter, setCallingSourceFilter] = useState<JourneyCallingSourceFilter>("all")
  const [connectionFilter, setConnectionFilter] = useState<JourneyConnectionFilter>("all")
  const [outcomeFilter, setOutcomeFilter] = useState<JourneyOutcomeFilter>("all")
  const [dealerFilter, setDealerFilter] = useState("all")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const scrollRootRef = useRef<HTMLDivElement | null>(null)

  const showDealerFilter = Array.isArray(dealers) && dealers.length > 0

  useEffect(() => {
    onSearchChange?.(searchTerm)
  }, [searchTerm, onSearchChange])

  useEffect(() => {
    if (!showDealerFilter) return
    if (dealerFilter === "all") return
    if (dealers.some((d) => d.id === dealerFilter)) return
    setDealerFilter("all")
  }, [dealers, dealerFilter, showDealerFilter])

  useEffect(() => {
    if (dateFilter !== "custom") return
    if (customFromDate && customToDate) return
    const today = formatYmdLocal(new Date())
    setCustomFromDate(today)
    setCustomToDate(today)
  }, [dateFilter, customFromDate, customToDate])

  const rows = useMemo(() => {
    return buildFullCustomerJourneyRows({ quotations, callingActions })
      .filter((row) => matchesFullJourneyDateRange(row, dateFilter, customFromDate, customToDate))
      .filter((row) => matchesJourneyCallingSourceFilter(row, callingSourceFilter))
      .filter((row) => matchesJourneyConnectionFilter(row, connectionFilter))
      .filter((row) => matchesJourneyOutcomeFilter(row, outcomeFilter))
      .filter((row) => matchesJourneyDealerFilter(row, dealerFilter))
      .filter((row) => matchesFullJourneySearch(row, searchTerm))
  }, [
    quotations,
    callingActions,
    searchTerm,
    dateFilter,
    customFromDate,
    customToDate,
    callingSourceFilter,
    connectionFilter,
    outcomeFilter,
    dealerFilter,
  ])

  const listResetKey = [
    searchTerm,
    dateFilter,
    customFromDate,
    customToDate,
    callingSourceFilter,
    connectionFilter,
    outcomeFilter,
    dealerFilter,
    rows.length,
  ].join("|")

  const {
    visibleItems,
    visibleCount,
    totalCount,
    hasMore,
    loadMore,
    sentinelRef,
  } = useIncrementalList(rows, {
    batchSize: 15,
    resetKey: listResetKey,
    rootRef: scrollRootRef,
    enabled: !isLoading && rows.length > 0,
  })

  const hasActiveFilters =
    dateFilter !== "all" ||
    callingSourceFilter !== "all" ||
    connectionFilter !== "all" ||
    outcomeFilter !== "all" ||
    dealerFilter !== "all" ||
    Boolean(searchTerm.trim())

  const hasModalFilters =
    dateFilter !== "all" ||
    callingSourceFilter !== "all" ||
    connectionFilter !== "all" ||
    outcomeFilter !== "all" ||
    dealerFilter !== "all"

  const activeModalFilterCount = [
    dateFilter !== "all",
    callingSourceFilter !== "all",
    connectionFilter !== "all",
    outcomeFilter !== "all",
    dealerFilter !== "all",
  ].filter(Boolean).length

  const clearFilters = () => {
    setSearchTerm("")
    setDateFilter("all")
    setCustomFromDate("")
    setCustomToDate("")
    setCallingSourceFilter("all")
    setConnectionFilter("all")
    setOutcomeFilter("all")
    setDealerFilter("all")
  }

  const clearModalFilters = () => {
    setDateFilter("all")
    setCustomFromDate("")
    setCustomToDate("")
    setCallingSourceFilter("all")
    setConnectionFilter("all")
    setOutcomeFilter("all")
    setDealerFilter("all")
  }

  const selectedDealerLabel =
    dealerFilter === "all"
      ? "All dealers"
      : dealers?.find((d) => d.id === dealerFilter)?.label || "Dealer"

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 mb-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, mobile, quotation, lead, stage..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto shrink-0"
              onClick={() => setFiltersOpen(true)}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
              {activeModalFilterCount > 0 ? (
                <Badge className="ml-2 h-5 min-w-5 justify-center px-1.5 text-[10px]">
                  {activeModalFilterCount}
                </Badge>
              ) : null}
            </Button>
          </div>
          {hasModalFilters ? (
            <div className="flex flex-wrap items-center gap-2">
              {dateFilter !== "all" ? (
                <Badge variant="secondary" className="text-xs font-normal">
                  Date:{" "}
                  {dateFilter === "all"
                    ? "All time"
                    : dateFilter === "custom"
                      ? "Custom"
                      : dateFilter.replace(/_/g, " ")}
                </Badge>
              ) : null}
              {showDealerFilter && dealerFilter !== "all" ? (
                <Badge variant="secondary" className="text-xs font-normal">
                  Dealer: {selectedDealerLabel}
                </Badge>
              ) : null}
              {callingSourceFilter !== "all" ? (
                <Badge variant="secondary" className="text-xs font-normal">
                  {callingSourceFilter === "calling_data" ? "Calling Data" : "Not Calling Data"}
                </Badge>
              ) : null}
              {connectionFilter !== "all" ? (
                <Badge variant="secondary" className="text-xs font-normal">
                  {CALLING_CONNECTION_LABELS[connectionFilter]}
                </Badge>
              ) : null}
              {outcomeFilter !== "all" ? (
                <Badge variant="secondary" className="text-xs font-normal">
                  {CALLING_SUMMARY_BUCKET_LABELS[outcomeFilter]}
                </Badge>
              ) : null}
              <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={clearModalFilters}>
                Clear filters
              </Button>
            </div>
          ) : null}
        </div>

        <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
          <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Customer Journey Filters</DialogTitle>
              <DialogDescription>
                Filter by date, dealer, calling source, connection, and calling action.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Date range</Label>
                <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as JourneyDateRangeFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Date range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="week">This week</SelectItem>
                    <SelectItem value="this_month">This month</SelectItem>
                    <SelectItem value="last_month">Last month</SelectItem>
                    <SelectItem value="year">This year</SelectItem>
                    <SelectItem value="custom">Custom date range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {dateFilter === "custom" ? (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">From</Label>
                    <Input type="date" value={customFromDate} onChange={(e) => setCustomFromDate(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <Input type="date" value={customToDate} onChange={(e) => setCustomToDate(e.target.value)} />
                  </div>
                </>
              ) : null}
              {showDealerFilter ? (
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Dealer</Label>
                  <Select value={dealerFilter} onValueChange={setDealerFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Dealer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All dealers</SelectItem>
                      {dealers.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Source</Label>
                <Select
                  value={callingSourceFilter}
                  onValueChange={(v) => setCallingSourceFilter(v as JourneyCallingSourceFilter)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Calling data" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sources</SelectItem>
                    <SelectItem value="calling_data">Calling Data</SelectItem>
                    <SelectItem value="not_calling_data">Not Calling Data</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Connection</Label>
                <Select
                  value={connectionFilter}
                  onValueChange={(v) => setConnectionFilter(v as JourneyConnectionFilter)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Connection" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All connections</SelectItem>
                    <SelectItem value="connected">{CALLING_CONNECTION_LABELS.connected}</SelectItem>
                    <SelectItem value="not_connected">{CALLING_CONNECTION_LABELS.not_connected}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Calling action</Label>
                <Select
                  value={outcomeFilter}
                  onValueChange={(v) => setOutcomeFilter(v as JourneyOutcomeFilter)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Calling action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All calling actions</SelectItem>
                    <SelectItem value="interested">{CALLING_SUMMARY_BUCKET_LABELS.interested}</SelectItem>
                    <SelectItem value="followUp">{CALLING_SUMMARY_BUCKET_LABELS.followUp}</SelectItem>
                    <SelectItem value="notInterested">{CALLING_SUMMARY_BUCKET_LABELS.notInterested}</SelectItem>
                    <SelectItem value="others">{CALLING_SUMMARY_BUCKET_LABELS.others}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={clearModalFilters}>
                Clear
              </Button>
              <Button type="button" onClick={() => setFiltersOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading customer journey…</p>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground space-y-2">
            <p>{emptyMessage}</p>
            {hasActiveFilters ? (
              <Button type="button" variant="link" className="h-auto p-0" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
        ) : (
          <div ref={scrollRootRef} className={`${maxHeightClassName} overflow-y-auto space-y-2 pr-1`}>
            {visibleItems.map((row) => {
              const expanded = expandedId === row.id
              const resolved = resolveDealerDetails?.(row.quotation, row.dealerId)
              const dealerName =
                resolved?.name ||
                row.dealerName ||
                (row.quotation
                  ? formatPersonName(
                      (row.quotation as any).dealer?.firstName,
                      (row.quotation as any).dealer?.lastName,
                      "",
                    )
                  : "") ||
                "—"
              const dealerMobile = resolved?.mobile || "—"

              return (
                <div key={row.id} className="rounded-md border border-border/60 px-3 py-2 space-y-2">
                  <button
                    type="button"
                    className="w-full text-left flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                    onClick={() => setExpandedId(expanded ? null : row.id)}
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      {expanded ? (
                        <ChevronDown className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{row.customerName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {row.customerMobile || "No mobile"}
                          {row.quotationId ? ` • ${row.quotationId}` : ""}
                          {row.leadId ? ` • Lead ${row.leadId}` : ""}
                        </p>
                        {showDealerDetails ? (
                          <p className="text-xs text-muted-foreground">
                            Dealer: {dealerName} • {dealerMobile}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      {row.fileLoginLabel ? (
                        <Badge variant="secondary" className="text-xs">
                          File login: {row.fileLoginLabel}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          Calling
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {row.holdHolder}
                      </Badge>
                      <Badge className="text-xs">{row.holdLabel}</Badge>
                    </div>
                  </button>

                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                    {STAGE_ORDER.map((key) => (
                      <div
                        key={key}
                        className="rounded border border-border/60 px-2 py-1.5 flex flex-col gap-1 min-w-0"
                      >
                        <span className="text-[10px] text-muted-foreground leading-tight">
                          {FULL_JOURNEY_STAGE_LABELS[key]}
                        </span>
                        <Badge className={`text-[10px] w-fit ${statusBadgeClass(row.stages[key])}`}>
                          {formatFullJourneyStageLabel(row.stages[key], key)}
                        </Badge>
                        <span
                          className="text-[10px] text-muted-foreground leading-snug break-words"
                          title={row.stageDates[key] ? new Date(row.stageDates[key]!).toLocaleString() : undefined}
                        >
                          {formatJourneyStageDateTime(row.stageDates[key])}
                        </span>
                      </div>
                    ))}
                  </div>

                  {expanded ? (
                    <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-2 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Stored journey timeline</p>
                      {row.timeline.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No timeline events yet.</p>
                      ) : (
                        <ol className="space-y-2">
                          {row.timeline.map((event) => (
                            <li key={event.id} className="flex gap-2 text-xs">
                              <span className="shrink-0 w-36 text-muted-foreground">
                                {new Date(event.at).toLocaleString()}
                              </span>
                              <div className="min-w-0">
                                <p className="font-medium text-foreground">{event.label}</p>
                                {event.detail ? (
                                  <p className="text-muted-foreground break-words">{event.detail}</p>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
            <IncrementalListSentinel
              sentinelRef={sentinelRef}
              visibleCount={visibleCount}
              totalCount={totalCount}
              hasMore={hasMore}
              onLoadMore={loadMore}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
