"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { Quotation } from "@/lib/quotation-context"
import type { Dealer } from "@/lib/auth-context"
import {
  aggregateProductNeededDashboard,
  formatProductNeededDate,
  type ProductNeededDateRange,
  type ProductNeededRow,
  type ProductNeededScope,
} from "@/lib/admin-product-needed"
import { downloadProductNeededExcel, PRODUCT_NEEDED_EXCEL_COLUMN_OPTIONS } from "@/lib/admin-product-needed-excel"
import {
  ExcelColumnPickerDialog,
  readRememberedExcelColumns,
  rememberExcelColumns,
} from "@/components/excel-column-picker-dialog"
import { formatYmdLocal } from "@/lib/calling-report-date-range"
import { loadAdminProductNeededRows } from "@/lib/load-admin-product-needed"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Download, Loader2, Package, RotateCcw, Search, Zap } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

type Props = {
  quotations: Quotation[]
  dealers: Dealer[]
  getDealerName: (dealerId: string, quotation?: Quotation) => string
  useApi: boolean
  enabled?: boolean
  refreshToken?: number
}

const DATE_RANGE_OPTIONS: { value: ProductNeededDateRange; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "custom", label: "Custom range" },
]

const SCOPE_OPTIONS: { value: ProductNeededScope; label: string }[] = [
  { value: "installation_pending", label: "Installation pending" },
  { value: "file_login", label: "File login (not approved)" },
]

export function AdminProductNeededPanel({
  quotations,
  dealers,
  getDealerName,
  useApi,
  enabled = true,
  refreshToken = 0,
}: Props) {
  const { toast } = useToast()
  const [search, setSearch] = useState("")
  const [searchDebounced, setSearchDebounced] = useState("")
  const [dealerFilter, setDealerFilter] = useState("all")
  const [dateRange, setDateRange] = useState<ProductNeededDateRange>("all")
  const [scope, setScope] = useState<ProductNeededScope>("installation_pending")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [rows, setRows] = useState<ProductNeededRow[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [customRangePending, setCustomRangePending] = useState(false)
  const [loadSource, setLoadSource] = useState<string | null>(null)
  const [showJobs, setShowJobs] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [excelColumnsOpen, setExcelColumnsOpen] = useState(false)
  const [excelRememberedIds, setExcelRememberedIds] = useState<string[] | null>(null)
  const excelColumnsStorageKey = "excel-columns:product-needed"

  useEffect(() => {
    if (dateRange !== "custom") return
    if (customFrom || customTo) return
    const today = formatYmdLocal(new Date())
    setCustomFrom(today)
    setCustomTo(today)
  }, [dateRange, customFrom, customTo])

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchDebounced(search), 350)
    return () => window.clearTimeout(timer)
  }, [search])

  const loadRows = useCallback(
    async (options?: { background?: boolean }) => {
      if (!enabled) return
      if (options?.background) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      try {
        const result = await loadAdminProductNeededRows({
          quotations,
          dealers,
          useApi,
          getDealerName,
          dealerId: dealerFilter,
          search: searchDebounced,
          dateRange,
          customFrom,
          customTo,
          scope,
        })
        setRows(result.rows)
        setUnavailable(result.unavailable)
        setCustomRangePending(result.customRangePending)
        setLoadSource(result.source)
      } catch (error) {
        console.error("Error loading product needed rows:", error)
        if (!options?.background) {
          setRows([])
          setLoadSource(null)
        }
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [
      customFrom,
      customTo,
      dateRange,
      dealerFilter,
      dealers,
      scope,
      enabled,
      getDealerName,
      quotations,
      searchDebounced,
      useApi,
    ],
  )

  useEffect(() => {
    if (!enabled) return
    void loadRows()
  }, [enabled, loadRows])

  useEffect(() => {
    if (!enabled || refreshToken === 0) return
    void loadRows({ background: true })
  }, [enabled, loadRows, refreshToken])

  const dashboard = useMemo(() => aggregateProductNeededDashboard(rows), [rows])

  const downloadExcel = async (selectedColumnIds: string[]) => {
    if (dashboard.jobCount === 0) {
      toast({
        title: "No data to export",
        description:
          scope === "file_login"
            ? "Adjust filters to include at least one file-login job that is not approved."
            : "Adjust filters to include at least one installation-pending job.",
        variant: "destructive",
      })
      return
    }
    setExporting(true)
    try {
      rememberExcelColumns(excelColumnsStorageKey, selectedColumnIds)
      await downloadProductNeededExcel(dashboard, { selectedColumnIds })
      toast({
        title: "Excel downloaded",
        description: `Created brand-wise sheets and DCR, Non-DCR, Both customer sheets for ${dashboard.jobCount} job(s) with ${selectedColumnIds.length} selected column(s).`,
      })
    } catch (error) {
      console.error("Error exporting Product Needed Excel:", error)
      toast({
        title: "Could not export Excel",
        description: "Please try again.",
        variant: "destructive",
      })
    } finally {
      setExporting(false)
    }
  }

  const sourceHint = useMemo(() => {
    if (!useApi) return "Local quotations"
    if (loadSource === "admin_product_needed") return "Loaded from API"
    if (loadSource === "quotations") return "Built from quotation list (API fallback)"
    return null
  }, [loadSource, useApi])

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              Product Needed
              {refreshing ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : null}
            </CardTitle>
            <CardDescription className="mt-1">
              {scope === "file_login"
                ? "Procurement dashboard for file-login jobs that are not yet approved. Rejected quotations are excluded."
                : "Procurement dashboard for installation-pending jobs."}{" "}
              Totals are rolled up by panel brand + wattage and inverter brand + rating.
              {sourceHint ? (
                <span className="block text-xs mt-1 text-muted-foreground/80">{sourceHint}</span>
              ) : null}
            </CardDescription>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadRows()}
              disabled={loading}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (dashboard.jobCount === 0) {
                  toast({
                    title: "No data to export",
                    description:
                      scope === "file_login"
                        ? "Adjust filters to include at least one file-login job that is not approved."
                        : "Adjust filters to include at least one installation-pending job.",
                    variant: "destructive",
                  })
                  return
                }
                setExcelRememberedIds(readRememberedExcelColumns(excelColumnsStorageKey))
                setExcelColumnsOpen(true)
              }}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Download Excel
            </Button>
          </div>
        </div>
      </CardHeader>
      <ExcelColumnPickerDialog
        open={excelColumnsOpen}
        onOpenChange={setExcelColumnsOpen}
        title="Select Excel columns"
        description="Check only the fields you want to download. Then click Download."
        columns={PRODUCT_NEEDED_EXCEL_COLUMN_OPTIONS}
        initialSelectedIds={excelRememberedIds}
        rowCount={dashboard.jobCount}
        confirmLabel="Download Excel"
        onConfirm={(ids) => void downloadExcel(ids)}
      />
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search ID, customer, mobile, brand…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={dealerFilter} onValueChange={setDealerFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Dealer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All dealers</SelectItem>
              {dealers.map((dealer) => (
                <SelectItem key={dealer.id} value={dealer.id}>
                  {dealer.firstName} {dealer.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as ProductNeededDateRange)}>
            <SelectTrigger>
              <SelectValue
                placeholder={
                  scope === "file_login" ? "Filter by file login date" : "Filter by release date"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : null}
            <Select value={scope} onValueChange={(v) => setScope(v as ProductNeededScope)}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {SCOPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {dateRange === "custom" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          </div>
        ) : null}

        {!loading && customRangePending ? (
          <div className="text-center py-12 text-muted-foreground border rounded-lg border-dashed">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>Select a from and to date for the custom range.</p>
          </div>
        ) : loading && rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border rounded-lg border-dashed">
            <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-60" />
            <p>Loading product needed totals…</p>
          </div>
        ) : !loading && dashboard.jobCount === 0 ? (
          <div className="text-center py-12 text-muted-foreground border rounded-lg border-dashed">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>
              {scope === "file_login"
                ? "No file-login (not approved) jobs match these filters."
                : "No installation-pending jobs match these filters."}
            </p>
            <p className="text-xs mt-2">
              {scope === "file_login"
                ? "Only jobs with file login recorded, and quotation status not approved or rejected, are counted."
                : "Only jobs still in Pending Installation (sent to installer, not yet approved) are counted."}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Jobs pending</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">{dashboard.jobCount}</p>
              </div>
              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Panels needed</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">{dashboard.totalPanels}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {dashboard.panels.length} brand{dashboard.panels.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Inverters needed
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">{dashboard.totalInverters}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {dashboard.inverters.length} brand{dashboard.inverters.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">Panels by brand</h3>
              </div>
              {dashboard.panels.length === 0 ? (
                <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-4">
                  No panel lines found on these jobs.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {dashboard.panels.map((card) => (
                    <div
                      key={card.key}
                      className="rounded-xl border p-4 bg-background hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-lg font-semibold leading-tight">{card.brand}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {card.jobCount} job{card.jobCount === 1 ? "" : "s"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-semibold tabular-nums">{card.totalQuantity}</p>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            total
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 space-y-1.5 border-t pt-3">
                        {card.sizes.map((line) => (
                          <div
                            key={`${card.key}-${line.size}`}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span className="text-muted-foreground truncate">{line.size}</span>
                            <span className="font-semibold tabular-nums whitespace-nowrap">
                              {line.quantity}
                              <span className="ml-1 text-[10px] font-normal uppercase text-muted-foreground">
                                {line.unit === "sets" ? "sets" : "pcs"}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">Inverters by brand</h3>
              </div>
              {dashboard.inverters.length === 0 ? (
                <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-4">
                  No inverter lines found on these jobs.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {dashboard.inverters.map((card) => (
                    <div
                      key={card.key}
                      className="rounded-xl border p-4 bg-background hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-lg font-semibold leading-tight">{card.brand}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {card.jobCount} job{card.jobCount === 1 ? "" : "s"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-semibold tabular-nums">{card.totalQuantity}</p>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            total
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 space-y-1.5 border-t pt-3">
                        {card.sizes.map((line) => (
                          <div
                            key={`${card.key}-${line.size}`}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span className="text-muted-foreground truncate">{line.size}</span>
                            <span className="font-semibold tabular-nums whitespace-nowrap">
                              {line.quantity}
                              <span className="ml-1 text-[10px] font-normal uppercase text-muted-foreground">
                                {line.unit === "sets" ? "sets" : "pcs"}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Jobs included</h3>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowJobs((v) => !v)}>
                  {showJobs ? "Hide list" : `Show ${dashboard.jobCount} jobs`}
                </Button>
              </div>
              {showJobs ? (
                <div className="rounded-lg border overflow-auto max-h-[min(50vh,480px)] w-full min-w-0">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
                      <tr className="border-b text-left">
                        <th className="p-3 font-medium whitespace-nowrap">Quotation</th>
                        <th className="p-3 font-medium whitespace-nowrap">Customer</th>
                        <th className="p-3 font-medium whitespace-nowrap">Dealer</th>
                        <th className="p-3 font-medium whitespace-nowrap">kW</th>
                        <th className="p-3 font-medium min-w-[200px]">Panels</th>
                        <th className="p-3 font-medium min-w-[140px]">Inverter</th>
                        <th className="p-3 font-medium whitespace-nowrap">
                          {scope === "file_login" ? "File login" : "Released"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.rows.map((row) => (
                        <tr key={row.quotationId} className="border-b last:border-0 align-top">
                          <td className="p-3 font-mono text-xs whitespace-nowrap">{row.quotationId}</td>
                          <td className="p-3 whitespace-nowrap">
                            <div className="font-medium">{row.customerName}</div>
                            <div className="text-xs text-muted-foreground">{row.customerMobile}</div>
                          </td>
                          <td className="p-3 whitespace-nowrap">{row.dealerName}</td>
                          <td className="p-3 whitespace-nowrap">{row.systemKw}</td>
                          <td className="p-3 text-xs leading-relaxed">{row.panels}</td>
                          <td className="p-3 text-xs whitespace-nowrap">{row.inverter}</td>
                          <td className="p-3 text-xs whitespace-nowrap">
                            {formatProductNeededDate(
                              scope === "file_login"
                                ? row.fileLoginAt || row.installationReleasedAt
                                : row.installationReleasedAt,
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
