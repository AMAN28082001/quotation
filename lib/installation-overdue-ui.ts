import { addCalendarDaysFromDateString, toYmdFromStored } from "@/lib/operational-install-queue"

export type InstallOverdueFilter = "all" | "lt5" | "gte5" | "gte10"

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

/** Pending/in-progress install rows: yellow from day 5 overdue, red from day 10. */
export function installationOverdueTone(
  installYmd: string,
  installerStatus: "pending" | "inprogress" | "partial" | "approved",
): "none" | "yellow" | "red" {
  if (installerStatus === "approved") return "none"
  return overdueToneFromDays(getInstallationDateOverdueDays(installYmd))
}

export function resolveInstallationScheduleYmd(
  q: Record<string, unknown>,
  sentBaseStr?: string,
): string {
  const stored = toYmdFromStored(
    (q.installationScheduledAt || q.installation_scheduled_at) as string | undefined,
  )
  if (stored) return stored
  if (sentBaseStr) {
    const sentParsedOk = !Number.isNaN(new Date(sentBaseStr).getTime())
    if (sentParsedOk) return addCalendarDaysFromDateString(sentBaseStr, 7)
  }
  return ""
}

export function matchesOverdueToneFilter(
  tone: "none" | "yellow" | "red",
  filter: InstallOverdueFilter,
): boolean {
  if (filter === "all") return true
  if (filter === "lt5") return tone === "none"
  if (filter === "gte5") return tone === "yellow" || tone === "red"
  if (filter === "gte10") return tone === "red"
  return true
}

export function overdueRowClasses(tone: "none" | "yellow" | "red"): {
  row: string
  sticky: string
  title?: string
} {
  if (tone === "red") {
    return {
      row: "bg-red-100/95 hover:bg-red-200/80",
      sticky: "bg-red-100",
      title: "Date overdue by 10 days or more",
    }
  }
  if (tone === "yellow") {
    return {
      row: "bg-amber-100/95 hover:bg-amber-200/70",
      sticky: "bg-amber-100",
      title: "Date overdue by 5 days or more",
    }
  }
  return { row: "hover:bg-muted/35", sticky: "bg-card" }
}

export function installerStageBadgeTone(status: string): string {
  if (status === "approved") return "border-green-300/80 bg-green-50 text-green-800"
  if (status === "partial" || status === "inprogress") return "border-sky-300/80 bg-sky-50 text-sky-800"
  return "border-amber-300/80 bg-amber-50 text-amber-800"
}

export function installerQueueStatusDisplayLabel(
  status: "pending" | "inprogress" | "partial" | "approved",
): string {
  if (status === "approved") return "Approved"
  if (status === "partial") return "In Progress"
  return "Pending"
}
