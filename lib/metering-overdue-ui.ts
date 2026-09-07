import { toYmdFromStored } from "@/lib/operational-install-queue"
import {
  matchesOverdueToneFilter,
  overdueRowClasses,
  type InstallOverdueFilter,
} from "@/lib/installation-overdue-ui"

export type { InstallOverdueFilter }

function getInstallationDateOverdueDays(ymd: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const [y, m, d] = ymd.split("-").map(Number)
  const installLocal = new Date(y, m - 1, d)
  if (Number.isNaN(installLocal.getTime())) return null
  const now = new Date()
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.floor((todayLocal.getTime() - installLocal.getTime()) / 86_400_000)
}

function overdueToneFromDays(overdueDays: number | null): "none" | "yellow" | "red" {
  if (overdueDays == null) return "none"
  if (overdueDays >= 10) return "red"
  if (overdueDays >= 5) return "yellow"
  return "none"
}

function toYmdFromAnyDate(raw: unknown): string {
  if (!raw) return ""
  if (typeof raw === "string") {
    const stored = toYmdFromStored(raw)
    if (stored) return stored
  }
  const d = new Date(raw as string)
  if (Number.isNaN(d.getTime())) return ""
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Date column + overdue filter for metering rows (aligned with Admin Metering). */
export function resolveMeteringReferenceYmd(
  quotation: Record<string, unknown>,
  meteringStage: "processing" | "approved" | "meter_install" | "mco" | null,
): string {
  if (meteringStage === "mco") {
    return (
      toYmdFromAnyDate(quotation.mcoAt) ||
      toYmdFromAnyDate(quotation.mco_at) ||
      toYmdFromAnyDate(quotation.meteringApprovedAt) ||
      toYmdFromAnyDate(quotation.metering_approved_at) ||
      toYmdFromAnyDate(quotation.approvedAt) ||
      toYmdFromAnyDate(quotation.approvedDate) ||
      toYmdFromAnyDate(quotation.statusUpdatedAt) ||
      toYmdFromAnyDate(quotation.createdAt)
    )
  }
  if (meteringStage === "approved" || meteringStage === "meter_install") {
    return (
      toYmdFromAnyDate(quotation.meteringApprovedAt) ||
      toYmdFromAnyDate(quotation.metering_approved_at) ||
      toYmdFromAnyDate(quotation.approvedAt) ||
      toYmdFromAnyDate(quotation.approvedDate) ||
      toYmdFromAnyDate(quotation.statusUpdatedAt) ||
      toYmdFromAnyDate(quotation.createdAt)
    )
  }
  return (
    toYmdFromAnyDate(quotation.approvedAt) ||
    toYmdFromAnyDate(quotation.approvedDate) ||
    toYmdFromAnyDate(quotation.statusUpdatedAt) ||
    toYmdFromAnyDate(quotation.createdAt)
  )
}

/** Meter Pending / Meter in Discom: same overdue colours as Installation (skip MCO). */
export function meteringOverdueTone(
  referenceYmd: string,
  meteringStage: "processing" | "approved" | "meter_install" | "mco" | null,
): "none" | "yellow" | "red" {
  if (meteringStage === "mco" || !meteringStage) return "none"
  return overdueToneFromDays(getInstallationDateOverdueDays(referenceYmd))
}

export function meteringOverdueRowClasses(tone: "none" | "yellow" | "red") {
  return overdueRowClasses(tone)
}

export function matchesMeteringOverdueFilter(
  tone: "none" | "yellow" | "red",
  filter: InstallOverdueFilter,
): boolean {
  return matchesOverdueToneFilter(tone, filter)
}
