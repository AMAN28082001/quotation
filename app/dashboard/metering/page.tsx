"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { SolarLogo } from "@/components/solar-logo"
import { LogOut, Gauge } from "lucide-react"
import { MeteringWorkflowPanel } from "@/components/metering/metering-workflow-panel"
import { AccessSwitchBar } from "@/components/access-switch-bar"
import { canOpenSection, getAccessOptions, getPostLoginPath } from "@/lib/user-access"
import { isWorkflowModuleReadOnly } from "@/lib/module-field-permissions"

export default function MeteringDashboardPage() {
  const router = useRouter()
  const {
    isAuthenticated,
    role,
    meteringUser,
    logout,
    modulePermissions,
    officeLocation,
    accountManager,
    dealer,
    installer,
    access,
  } = useAuth()

  const meteringReadOnly = isWorkflowModuleReadOnly(modulePermissions, "metering", {
    userId: meteringUser?.id ?? accountManager?.id ?? dealer?.id ?? installer?.id,
    officeLocation,
    viewerIsDealer: role === "dealer",
    viewerIsAdmin: role === "admin" || role === "super-admin",
  })

  const displayName =
    meteringUser?.firstName ||
    accountManager?.firstName ||
    installer?.firstName ||
    dealer?.firstName ||
    "Metering"

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login")
      return
    }
    if (role !== "metering" && !canOpenSection(access, role, "metering")) {
      router.push(getPostLoginPath(access.length ? access : []))
    }
  }, [isAuthenticated, role, access, router])

  return (
    <div className="min-h-screen bg-background">
      <AccessSwitchBar current="metering" title="Metering" />
      {getAccessOptions(access).length <= 1 ? (
        <header className="border-b border-border bg-card">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <button onClick={() => router.push(getPostLoginPath(access))} className="flex items-center">
              <SolarLogo size="md" />
            </button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await logout()
                router.push("/")
              }}
              className="gap-2"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
        </header>
      ) : null}

      <main className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Gauge className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">Metering Dashboard</h1>
        </div>

        <MeteringWorkflowPanel
          readOnly={meteringReadOnly}
          description={`Welcome, ${displayName}. Meter process: Meter Pending → Meter in Discom → WCC Pending → Meter Installation Pending → Final Step — same flow as Admin → Metering.`}
        />
      </main>
    </div>
  )
}
