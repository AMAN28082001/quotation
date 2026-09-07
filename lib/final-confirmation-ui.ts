export type FinalConfirmationDocKey =
  | "customerFinalBill"
  | "panelWarranty"
  | "inverterWarranty"
  | "workCompletionWarranty"

export type FinalConfirmationDocField = {
  key: FinalConfirmationDocKey
  label: string
  urlKeys: string[]
  nameKeys: string[]
  fileStateKey:
    | "customerFinalBillFile"
    | "panelWarrantyFile"
    | "inverterWarrantyFile"
    | "workCompletionWarrantyFile"
}

export const FINAL_CONFIRMATION_DOC_FIELDS: FinalConfirmationDocField[] = [
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

const DCR_LOCAL_STORAGE_KEYS = [
  "finalConfirmationDcrGenerated",
  "adminDcrGenerated",
  "baldevDcrGenerated",
] as const

function pickFirstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? "").trim()
    if (text) return text
  }
  return ""
}

export function getConfirmationStage(
  quotation: Record<string, unknown>,
): "queue" | "final" | null {
  if (String(quotation.status || "").toLowerCase() !== "approved") return null
  const backendStatus = String(
    quotation.installationStatus || quotation.installation_status || "",
  ).toLowerCase()
  if (
    backendStatus === "installer_approved" ||
    backendStatus === "pending_baldev" ||
    backendStatus === "installer_in_progress"
  ) {
    return "queue"
  }
  if (backendStatus === "baldev_approved" || backendStatus === "completed") {
    return "final"
  }
  return null
}

export function isConfirmationVisible(quotation: Record<string, unknown>): boolean {
  return getConfirmationStage(quotation) !== null
}

export function readFinalConfirmationDoc(
  quotation: Record<string, unknown>,
  key: FinalConfirmationDocKey,
): { url: string; name: string } {
  const field = FINAL_CONFIRMATION_DOC_FIELDS.find((item) => item.key === key)
  if (!field) return { url: "", name: "" }
  const docs =
    quotation.documents && typeof quotation.documents === "object" && !Array.isArray(quotation.documents)
      ? (quotation.documents as Record<string, unknown>)
      : quotation.document && typeof quotation.document === "object" && !Array.isArray(quotation.document)
        ? (quotation.document as Record<string, unknown>)
        : null
  const sources = docs ? [quotation, docs] : [quotation]
  let url = ""
  let name = ""
  for (const source of sources) {
    if (!url) url = pickFirstNonEmptyString(...field.urlKeys.map((k) => source[k]))
    if (!name) name = pickFirstNonEmptyString(...field.nameKeys.map((k) => source[k]))
  }
  return { url, name }
}

export function countFinalConfirmationDocsUploaded(
  quotation: Record<string, unknown>,
): { uploaded: number; total: number } {
  let uploaded = 0
  for (const field of FINAL_CONFIRMATION_DOC_FIELDS) {
    const saved = readFinalConfirmationDoc(quotation, field.key)
    if (saved.url || saved.name) uploaded += 1
  }
  return { uploaded, total: FINAL_CONFIRMATION_DOC_FIELDS.length }
}

export function readDcrGeneratedMap(): Record<string, boolean> {
  const map: Record<string, boolean> = {}
  for (const storageKey of DCR_LOCAL_STORAGE_KEYS) {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) || "[]")
      if (!Array.isArray(raw)) continue
      for (const id of raw) {
        if (typeof id === "string" && id.trim()) map[id.trim()] = true
      }
    } catch {
      // ignore
    }
  }
  return map
}

export function persistDcrGeneratedIds(ids: Record<string, boolean>) {
  const list = Object.keys(ids).filter((id) => ids[id])
  try {
    localStorage.setItem("finalConfirmationDcrGenerated", JSON.stringify(list))
    localStorage.setItem("adminDcrGenerated", JSON.stringify(list))
    localStorage.setItem("baldevDcrGenerated", JSON.stringify(list))
  } catch {
    // ignore
  }
}

export function isDcrGenerated(
  quotation: Record<string, unknown>,
  localMap: Record<string, boolean>,
): boolean {
  return Boolean(
    quotation.dcrGenerated ||
      quotation.dcr_generated ||
      localMap[String(quotation.id || "")],
  )
}
