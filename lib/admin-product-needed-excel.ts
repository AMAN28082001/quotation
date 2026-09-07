import {
  formatProductNeededDate,
  type ProductNeededDashboard,
  type ProductNeededRow,
} from "@/lib/admin-product-needed"

type CellValue = string | number

function safeSheetBaseName(value: string): string {
  return value.replace(/[\\/?*:[\]]/g, " ").replace(/\s+/g, " ").trim() || "Unknown"
}

function uniqueSheetName(base: string, used: Set<string>): string {
  const cleaned = safeSheetBaseName(base).slice(0, 31)
  let candidate = cleaned
  let suffix = 2
  while (used.has(candidate.toLowerCase())) {
    const ending = ` ${suffix}`
    candidate = `${cleaned.slice(0, 31 - ending.length)}${ending}`
    suffix += 1
  }
  used.add(candidate.toLowerCase())
  return candidate
}

function customerSheetType(systemType: string): "DCR" | "Non-DCR" | "Both" | null {
  const normalized = String(systemType || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-")
  if (normalized === "both" || normalized.includes("dcr-+-non-dcr")) return "Both"
  if (normalized === "non-dcr" || normalized === "nondcr") return "Non-DCR"
  if (normalized === "dcr") return "DCR"
  return null
}

function customerRow(row: ProductNeededRow): CellValue[] {
  return [
    row.quotationId,
    row.customerName,
    row.customerMobile,
    row.customerAddress || "—",
    row.dealerName,
    row.systemKw,
    row.systemType,
    row.panels,
    row.inverter,
    formatProductNeededDate(row.fileLoginAt),
    formatProductNeededDate(row.statusApprovedAt),
    formatProductNeededDate(row.installationReleasedAt),
  ]
}

const CUSTOMER_HEADERS = [
  "Quotation ID",
  "Customer",
  "Mobile",
  "Address",
  "Dealer",
  "System kW",
  "System Type",
  "Panels",
  "Inverter",
  "File Login At",
  "Approved At",
  "Released To Installation",
]

/** Columns offered in the Excel column picker for Product Needed downloads. */
export const PRODUCT_NEEDED_EXCEL_COLUMN_OPTIONS = [
  ...CUSTOMER_HEADERS,
  "Panel Brand",
  "Panel Size",
  "Quantity",
  "Unit",
  "Inverter Brand",
  "Inverter Rating",
  "Released",
  "Category",
  "Brand",
  "Size / Rating",
  "Jobs",
].map((label) => ({ id: label, label }))

/**
 * One workbook for the currently visible, login-scoped Product Needed rows:
 * summary, one sheet per panel/inverter brand, and customer sheets by system type.
 * When `selectedColumnIds` is set, each sheet keeps only matching header labels
 * (summary sheet always keeps its own headers unless you also select those labels).
 */
export async function downloadProductNeededExcel(
  dashboard: ProductNeededDashboard,
  options?: { selectedColumnIds?: string[] },
): Promise<void> {
  const XLSX = await import("xlsx")
  const workbook = XLSX.utils.book_new()
  const usedNames = new Set<string>()
  const selectedSet =
    options?.selectedColumnIds && options.selectedColumnIds.length > 0
      ? new Set(options.selectedColumnIds)
      : null

  const filterSheet = (headers: string[], rows: CellValue[][]) => {
    if (!selectedSet) return { headers, rows }
    const indices = headers
      .map((header, index) => ({ header, index }))
      .filter(({ header }) => selectedSet.has(header))
    // If no overlap (e.g. Summary sheet vs customer columns), keep full sheet.
    if (indices.length === 0) return { headers, rows }
    return {
      headers: indices.map((item) => item.header),
      rows: rows.map((row) => indices.map(({ index }) => row[index] ?? "")),
    }
  }

  const appendSheet = (name: string, headers: string[], rows: CellValue[][]) => {
    const filtered = filterSheet(headers, rows)
    if (!filtered.headers.length) return
    const sheet = XLSX.utils.aoa_to_sheet([filtered.headers, ...filtered.rows])
    sheet["!autofilter"] = {
      ref: `A1:${XLSX.utils.encode_col(filtered.headers.length - 1)}1`,
    }
    sheet["!freeze"] = { xSplit: 0, ySplit: 1 }
    sheet["!cols"] = filtered.headers.map((header, index) => {
      const maxContent = filtered.rows.reduce(
        (max, row) => Math.max(max, String(row[index] ?? "").length),
        header.length,
      )
      return { wch: Math.min(Math.max(maxContent + 2, 12), 42) }
    })
    XLSX.utils.book_append_sheet(workbook, sheet, uniqueSheetName(name, usedNames))
  }

  const summaryRows: CellValue[][] = []
  for (const card of dashboard.panels) {
    for (const size of card.sizes) {
      summaryRows.push([
        "Panel",
        card.brand,
        size.size,
        size.quantity,
        size.unit,
        size.jobCount,
      ])
    }
  }
  for (const card of dashboard.inverters) {
    for (const size of card.sizes) {
      summaryRows.push([
        "Inverter",
        card.brand,
        size.size,
        size.quantity,
        size.unit,
        size.jobCount,
      ])
    }
  }
  appendSheet(
    "Summary",
    ["Category", "Brand", "Size / Rating", "Quantity", "Unit", "Jobs"],
    summaryRows,
  )

  for (const card of dashboard.panels) {
    const brandRows: CellValue[][] = []
    for (const row of dashboard.rows) {
      for (const panel of row.panelLines) {
        if (panel.brand.toLowerCase() !== card.brand.toLowerCase()) continue
        brandRows.push([
          row.quotationId,
          row.customerName,
          row.customerMobile,
          row.dealerName,
          row.systemType,
          row.systemKw,
          panel.brand,
          panel.size,
          panel.quantity > 0 ? panel.quantity : 1,
          panel.quantity > 0 ? "panels" : "set",
          row.inverter,
          formatProductNeededDate(row.installationReleasedAt),
        ])
      }
    }
    appendSheet(
      `Panel - ${card.brand}`,
      [
        "Quotation ID",
        "Customer",
        "Mobile",
        "Dealer",
        "System Type",
        "System kW",
        "Panel Brand",
        "Panel Size",
        "Quantity",
        "Unit",
        "Inverter",
        "Released",
      ],
      brandRows,
    )
  }

  for (const card of dashboard.inverters) {
    const brandRows = dashboard.rows
      .filter((row) => row.inverterBrand.toLowerCase() === card.brand.toLowerCase())
      .map((row): CellValue[] => [
        row.quotationId,
        row.customerName,
        row.customerMobile,
        row.dealerName,
        row.systemType,
        row.systemKw,
        row.inverterBrand,
        row.inverterSize,
        row.inverterQuantity || 1,
        row.panels,
        formatProductNeededDate(row.installationReleasedAt),
      ])
    appendSheet(
      `Inverter - ${card.brand}`,
      [
        "Quotation ID",
        "Customer",
        "Mobile",
        "Dealer",
        "System Type",
        "System kW",
        "Inverter Brand",
        "Inverter Rating",
        "Quantity",
        "Panels",
        "Released",
      ],
      brandRows,
    )
  }

  for (const type of ["DCR", "Non-DCR", "Both"] as const) {
    appendSheet(
      `Customers - ${type}`,
      CUSTOMER_HEADERS,
      dashboard.rows.filter((row) => customerSheetType(row.systemType) === type).map(customerRow),
    )
  }

  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(workbook, `product-needed-installation-pending-${stamp}.xlsx`, {
    compression: true,
  })
}
