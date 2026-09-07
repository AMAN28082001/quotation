"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  BadgeCheck,
  Calendar,
  CheckCircle2,
  ChevronDown,
  FileCheck2,
  FileText,
  Search,
  ShieldCheck,
} from "lucide-react"
import { api } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { formatPersonName } from "@/lib/name-display"
import { getQuotationSystemKw } from "@/lib/quotation-system-kw"
import { StoredMediaPreview } from "@/components/stored-media-preview"
import { useAuth } from "@/lib/auth-context"
import {
  canWriteWorkflowModule,
  filterQuotationsByWorkflowPermission,
  isWorkflowModuleReadOnly,
  shouldLoadAllWorkflowQuotations,
} from "@/lib/module-field-permissions"
import {
  countFinalConfirmationDocsUploaded,
  FINAL_CONFIRMATION_DOC_FIELDS,
  getConfirmationStage,
  isConfirmationVisible,
  isDcrGenerated,
  persistDcrGeneratedIds,
  readDcrGeneratedMap,
  readFinalConfirmationDoc,
} from "@/lib/final-confirmation-ui"
import { extractQuotationListFromApiResponse } from "@/lib/operational-install-queue"

type FinalConfirmationQuotation = {
  id: string
  status?: string
  customer?: { firstName?: string; lastName?: string; mobile?: string }
  createdAt?: string
  pricing?: { subtotal?: number; totalAmount?: number; finalAmount?: number }
  subtotal?: number
  totalAmount?: number
  finalAmount?: number
  installationStatus?: string
  installation_status?: string
  installerApprovedAt?: string
  installer_approved_at?: string
  products?: Record<string, unknown>
}

type FinalConfirmationWorkflowPanelProps = {
  description?: string | null
  showDescription?: boolean
}

export function FinalConfirmationWorkflowPanel({
  description,
  showDescription = true,
}: FinalConfirmationWorkflowPanelProps) {
  const { toast } = useToast()
  const { modulePermissions, officeLocation, role, baldev, accountManager } = useAuth()
  const sessionUserId = baldev?.id ?? accountManager?.id
  const permissionCtx = useMemo(
    () => ({
      userId: sessionUserId,
      officeLocation,
      viewerIsDealer: role === "dealer",
      viewerIsAdmin: role === "admin" || role === "super-admin",
    }),
    [sessionUserId, officeLocation, role],
  )
  const readOnly = isWorkflowModuleReadOnly(modulePermissions, "final_confirmation", permissionCtx)
  const canWrite = canWriteWorkflowModule(modulePermissions, "final_confirmation", permissionCtx)
  const useApi = process.env.NEXT_PUBLIC_USE_API !== "false"

  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"all" | "dcr" | "pending" | "done">("dcr")
  const [searchTerm, setSearchTerm] = useState("")
  const [quotations, setQuotations] = useState<FinalConfirmationQuotation[]>([])
  const [dcrGeneratedIds, setDcrGeneratedIds] = useState<Record<string, boolean>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [savingDocsId, setSavingDocsId] = useState<string | null>(null)
  const [finalBillFileByQuotation, setFinalBillFileByQuotation] = useState<Record<string, File | null>>({})
  const [panelWarrantyFileByQuotation, setPanelWarrantyFileByQuotation] = useState<Record<string, File | null>>({})
  const [inverterWarrantyFileByQuotation, setInverterWarrantyFileByQuotation] = useState<Record<string, File | null>>({})
  const [workCompletionWarrantyFileByQuotation, setWorkCompletionWarrantyFileByQuotation] = useState<
    Record<string, File | null>
  >({})

  useEffect(() => {
    setDcrGeneratedIds(readDcrGeneratedMap())
  }, [])

  useEffect(() => {
    persistDcrGeneratedIds(dcrGeneratedIds)
  }, [dcrGeneratedIds])

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        if (useApi) {
          const loadAll = shouldLoadAllWorkflowQuotations(
            modulePermissions,
            "final_confirmation",
            permissionCtx,
          )
          let list: unknown[] = []
          if (loadAll) {
            try {
              const adminResp = await api.quotations.getWorkflowDashboardList({ page: 1, limit: 1000 })
              list = extractQuotationListFromApiResponse(adminResp)
            } catch {
              list = []
            }
          }
          if (list.length === 0) {
            const response = await api.quotations.getAll(
              { status: "approved", page: 1, limit: 1000 },
              { suppressErrorLog: true },
            )
            list = extractQuotationListFromApiResponse(response)
          }
          setQuotations(
            list
              .map((row) => row as FinalConfirmationQuotation)
              .filter((q) => isConfirmationVisible(q as Record<string, unknown>)),
          )
        } else {
          const localQuotations = JSON.parse(localStorage.getItem("quotations") || "[]")
          const approved = (Array.isArray(localQuotations) ? localQuotations : [])
            .filter((q: FinalConfirmationQuotation) => String(q.status || "").toLowerCase() === "approved")
            .filter((q: FinalConfirmationQuotation) => isConfirmationVisible(q as Record<string, unknown>))
          setQuotations(approved)
        }
      } catch {
        toast({
          title: "Failed to load queue",
          description: "Could not load final confirmation records.",
          variant: "destructive",
        })
        setQuotations([])
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [toast, useApi, modulePermissions, permissionCtx])

  const normalizedSearch = searchTerm.trim().toLowerCase()

  const visibleQuotations = useMemo(
    () =>
      filterQuotationsByWorkflowPermission(
        quotations as Record<string, unknown>[],
        modulePermissions,
        "final_confirmation",
        permissionCtx,
      ) as FinalConfirmationQuotation[],
    [quotations, modulePermissions, permissionCtx],
  )

  const getAmount = (q: FinalConfirmationQuotation) =>
    Math.abs(q.pricing?.subtotal ?? q.subtotal ?? q.totalAmount ?? q.finalAmount ?? q.pricing?.totalAmount ?? 0)

  const toTimestamp = (date?: string) => {
    if (!date) return 0
    const parsed = new Date(date).getTime()
    return Number.isNaN(parsed) ? 0 : parsed
  }

  const getInstallerApprovedDate = (q: FinalConfirmationQuotation) =>
    q.installerApprovedAt ||
    q.installer_approved_at ||
    (q as Record<string, unknown>).approvedAt ||
    (q as Record<string, unknown>).approvedDate ||
    (q as Record<string, unknown>).updatedAt ||
    q.createdAt

  const queueQuotations = useMemo(() => {
    return visibleQuotations
      .filter((q) => getConfirmationStage(q as Record<string, unknown>) === "queue")
      .filter((q) => {
        if (!normalizedSearch) return true
        const name = `${q.customer?.firstName || ""} ${q.customer?.lastName || ""}`.toLowerCase()
        return (
          name.includes(normalizedSearch) ||
          (q.customer?.mobile || "").includes(normalizedSearch) ||
          q.id.toLowerCase().includes(normalizedSearch)
        )
      })
      .sort((a, b) => toTimestamp(getInstallerApprovedDate(a)) - toTimestamp(getInstallerApprovedDate(b)))
  }, [visibleQuotations, normalizedSearch])

  const dcrQuotations = useMemo(
    () => queueQuotations.filter((q) => !isDcrGenerated(q as Record<string, unknown>, dcrGeneratedIds)),
    [queueQuotations, dcrGeneratedIds],
  )

  const finalProcessQuotations = useMemo(
    () => queueQuotations.filter((q) => isDcrGenerated(q as Record<string, unknown>, dcrGeneratedIds)),
    [queueQuotations, dcrGeneratedIds],
  )

  const finalClosedQuotations = useMemo(() => {
    return visibleQuotations
      .filter((q) => getConfirmationStage(q as Record<string, unknown>) === "final")
      .filter((q) => {
        if (!normalizedSearch) return true
        const name = `${q.customer?.firstName || ""} ${q.customer?.lastName || ""}`.toLowerCase()
        return (
          name.includes(normalizedSearch) ||
          (q.customer?.mobile || "").includes(normalizedSearch) ||
          q.id.toLowerCase().includes(normalizedSearch)
        )
      })
      .sort((a, b) => toTimestamp(getInstallerApprovedDate(b)) - toTimestamp(getInstallerApprovedDate(a)))
  }, [visibleQuotations, normalizedSearch])

  const activeList = useMemo(() => {
    if (activeTab === "dcr") return dcrQuotations
    if (activeTab === "pending") return finalProcessQuotations
    if (activeTab === "done") return finalClosedQuotations
    return [...queueQuotations, ...finalClosedQuotations]
  }, [activeTab, dcrQuotations, finalProcessQuotations, finalClosedQuotations, queueQuotations])

  const markDcrGenerated = (quotationId: string) => {
    setDcrGeneratedIds((prev) => ({ ...prev, [quotationId]: true }))
    setActiveTab("pending")
    toast({ title: "DCR generated", description: "Moved to Final process." })
  }

  const markFinalApproved = async (quotationId: string) => {
    setSavingId(quotationId)
    try {
      if (useApi) {
        await api.admin.quotations.updateOperationalStatus(quotationId, "baldev_approved")
        setQuotations((prev) =>
          prev.map((q) =>
            q.id === quotationId
              ? ({
                  ...q,
                  installationStatus: "baldev_approved",
                  installation_status: "baldev_approved",
                } as FinalConfirmationQuotation)
              : q,
          ),
        )
      }
      toast({ title: "Final approval done", description: "Moved to Done." })
      setActiveTab("done")
    } catch (error) {
      toast({
        title: "Approval failed",
        description: error instanceof Error ? error.message : "Could not mark final approved.",
        variant: "destructive",
      })
    } finally {
      setSavingId(null)
    }
  }

  const toggleExpanded = (quotationId: string) => {
    setExpandedId((prev) => (prev === quotationId ? null : quotationId))
  }

  const getLocalFile = (quotationId: string, fileStateKey: string): File | null => {
    if (fileStateKey === "customerFinalBillFile") return finalBillFileByQuotation[quotationId] || null
    if (fileStateKey === "panelWarrantyFile") return panelWarrantyFileByQuotation[quotationId] || null
    if (fileStateKey === "inverterWarrantyFile") return inverterWarrantyFileByQuotation[quotationId] || null
    return workCompletionWarrantyFileByQuotation[quotationId] || null
  }

  const setLocalFile = (quotationId: string, fileStateKey: string, file: File | null) => {
    if (fileStateKey === "customerFinalBillFile") {
      setFinalBillFileByQuotation((prev) => ({ ...prev, [quotationId]: file }))
    } else if (fileStateKey === "panelWarrantyFile") {
      setPanelWarrantyFileByQuotation((prev) => ({ ...prev, [quotationId]: file }))
    } else if (fileStateKey === "inverterWarrantyFile") {
      setInverterWarrantyFileByQuotation((prev) => ({ ...prev, [quotationId]: file }))
    } else {
      setWorkCompletionWarrantyFileByQuotation((prev) => ({ ...prev, [quotationId]: file }))
    }
  }

  const saveFinalDocuments = async (quotationId: string) => {
    const files = {
      customerFinalBillFile: finalBillFileByQuotation[quotationId] || null,
      panelWarrantyFile: panelWarrantyFileByQuotation[quotationId] || null,
      inverterWarrantyFile: inverterWarrantyFileByQuotation[quotationId] || null,
      workCompletionWarrantyFile: workCompletionWarrantyFileByQuotation[quotationId] || null,
    }
    if (!files.customerFinalBillFile && !files.panelWarrantyFile && !files.inverterWarrantyFile && !files.workCompletionWarrantyFile) {
      toast({
        title: "Upload required",
        description: "Please upload at least one PDF/JPG document to save.",
        variant: "destructive",
      })
      return
    }
    try {
      setSavingDocsId(quotationId)
      if (useApi) {
        const uploadResult = await api.quotations.uploadFinalConfirmationDocuments(quotationId, files)
        const payload =
          uploadResult && typeof uploadResult === "object"
            ? ((uploadResult as Record<string, unknown>).quotation as Record<string, unknown>) ||
              ((uploadResult as Record<string, unknown>).data as Record<string, unknown>) ||
              (uploadResult as Record<string, unknown>)
            : {}
        if (payload && Object.keys(payload).length > 0) {
          setQuotations((prev) =>
            prev.map((q) => (q.id === quotationId ? { ...q, ...payload } as FinalConfirmationQuotation : q)),
          )
        }
      }
      toast({ title: "Saved", description: "Final confirmation documents updated." })
      setExpandedId(null)
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save final confirmation documents.",
        variant: "destructive",
      })
    } finally {
      setSavingDocsId(null)
    }
  }

  return (
    <div className="space-y-4">
      {showDescription && description !== null && (
        <p className="text-sm text-muted-foreground">
          {description ||
            "DCR Generation → Final process → Done. Same stages as Admin → Final confirmation."}
        </p>
      )}

      <Card className="border-border/60 bg-card/90 shadow-sm">
        <CardContent className="pt-5 space-y-3">
          <div className="mb-3 w-full rounded-lg border border-border/70 bg-muted/30 p-1 flex flex-wrap gap-1">
            {(
              [
                { key: "all" as const, label: "All" },
                { key: "dcr" as const, label: `DCR Generation (${dcrQuotations.length})` },
                { key: "pending" as const, label: `Final process (${finalProcessQuotations.length})` },
                { key: "done" as const, label: `Done (${finalClosedQuotations.length})` },
              ] as const
            ).map((item) => (
              <Button
                key={item.key}
                type="button"
                size="sm"
                variant={activeTab === item.key ? "default" : "ghost"}
                className={cn("h-8 text-xs", activeTab === item.key && "shadow-sm")}
                onClick={() => setActiveTab(item.key)}
              >
                {item.key === "dcr" ? <FileCheck2 className="w-3.5 h-3.5 mr-1" /> : null}
                {item.key === "pending" ? <ShieldCheck className="w-3.5 h-3.5 mr-1" /> : null}
                {item.key === "done" ? <BadgeCheck className="w-3.5 h-3.5 mr-1" /> : null}
                {item.label}
              </Button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, mobile, email, or ID..."
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-sm text-muted-foreground text-center">
            Loading confirmation records...
          </CardContent>
        </Card>
      ) : activeList.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No records in this stage.</p>
        </div>
      ) : (
        <div className="native-scroll-list max-h-[min(70vh,820px)] space-y-3 overflow-y-auto overscroll-y-contain pr-1">
          {activeList.map((q) => {
            const qRecord = q as Record<string, unknown>
            const stage = getConfirmationStage(qRecord)
            const isDone = stage === "final"
            const needsDcr = !isDone && !isDcrGenerated(qRecord, dcrGeneratedIds)
            const installerApprovedDate = getInstallerApprovedDate(q)
            const systemKw = getQuotationSystemKw(q)
            const docs = countFinalConfirmationDocsUploaded(qRecord)
            const showDocSummary =
              expandedId !== q.id && (isDone || docs.uploaded > 0)

            return (
              <Card
                key={q.id}
                className={
                  isDone
                    ? "border-green-200/70 bg-gradient-to-r from-green-50/40 to-card shadow-sm"
                    : "border-border/60 bg-gradient-to-r from-card to-muted/20 shadow-sm"
                }
              >
                <CardContent className="p-4">
                  <div className="flex flex-wrap md:flex-nowrap items-center gap-3">
                    <div className="min-w-[180px] flex-1">
                      <p className="text-sm font-semibold leading-tight">
                        {formatPersonName(q.customer?.firstName, q.customer?.lastName, "Unknown")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {q.customer?.mobile || "No mobile"} • {q.id}
                      </p>
                    </div>
                    <div className="min-w-[120px]">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {isDone ? "Closed On" : "Installer Approved"}
                      </p>
                      <p className="text-xs font-medium flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-muted-foreground" />
                        {installerApprovedDate
                          ? new Date(String(installerApprovedDate)).toLocaleDateString("en-IN")
                          : "N/A"}
                      </p>
                    </div>
                    {needsDcr ? (
                      <div className="min-w-[90px]">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">System</p>
                        <p className="text-sm font-semibold">{systemKw > 0 ? `${systemKw} kW` : "N/A"}</p>
                      </div>
                    ) : null}
                    <div className="min-w-[120px]">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Subtotal</p>
                      <p className="text-sm font-semibold">₹{getAmount(q).toLocaleString()}</p>
                    </div>
                    <div className="min-w-[130px]">
                      {isDone ? (
                        <Badge className="bg-green-600 text-white text-xs">Final Closure</Badge>
                      ) : needsDcr ? (
                        <Badge variant="outline" className="text-xs">DCR pending</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Pending Baldev</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                      {needsDcr && canWrite ? (
                        <Button size="sm" onClick={() => markDcrGenerated(q.id)} disabled={readOnly}>
                          Generate DCR
                        </Button>
                      ) : null}
                      {!isDone ? (
                        <>
                          {docs.uploaded > 0 ? (
                            <Badge className="bg-emerald-600 text-white text-[10px]">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              {docs.uploaded}/{docs.total} uploaded
                            </Badge>
                          ) : null}
                          <Button variant="outline" size="sm" onClick={() => toggleExpanded(q.id)} disabled={readOnly}>
                            <ChevronDown className="w-3.5 h-3.5 mr-1" />
                            Update Final Details
                          </Button>
                          {!needsDcr && canWrite ? (
                            <Button size="sm" onClick={() => void markFinalApproved(q.id)} disabled={savingId === q.id || readOnly}>
                              {savingId === q.id ? "Saving..." : "Mark Final Approved"}
                            </Button>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {docs.uploaded <= 0 ? (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              Docs pending
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-600 text-white text-[10px]">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              {docs.uploaded}/{docs.total} uploaded
                            </Badge>
                          )}
                          <Button variant="outline" size="sm" onClick={() => toggleExpanded(q.id)} disabled={readOnly}>
                            <ChevronDown className="w-3.5 h-3.5 mr-1" />
                            Update Final Details
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {showDocSummary ? (
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                      {FINAL_CONFIRMATION_DOC_FIELDS.map((field) => {
                        const saved = readFinalConfirmationDoc(qRecord, field.key)
                        const shortLabel = field.label.replace(" (PDF/JPG)", "")
                        return (
                          <div key={field.key} className="rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
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

                  {expandedId === q.id ? (
                    <div className="mt-4 rounded-md border border-border/70 p-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {FINAL_CONFIRMATION_DOC_FIELDS.map((field) => {
                          const saved = readFinalConfirmationDoc(qRecord, field.key)
                          const localFile = getLocalFile(q.id, field.fileStateKey)
                          const isUploaded = Boolean(saved.url || saved.name || localFile)
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
                                  quotationId={q.id}
                                  fileName={localFile?.name || saved.name || undefined}
                                />
                              ) : null}
                              <Input
                                type="file"
                                accept="image/*,.heic,.heif,.pdf"
                                className="h-9 text-sm"
                                disabled={readOnly}
                                onChange={(e) => setLocalFile(q.id, field.fileStateKey, e.target.files?.[0] || null)}
                              />
                            </div>
                          )
                        })}
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setExpandedId(null)}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => void saveFinalDocuments(q.id)}
                          disabled={savingDocsId === q.id || readOnly}
                        >
                          {savingDocsId === q.id ? "Saving..." : "Save Details"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
