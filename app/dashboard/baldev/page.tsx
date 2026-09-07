"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { SolarLogo } from "@/components/solar-logo"
import { LogOut, BadgeCheck } from "lucide-react"
import { AccessSwitchBar } from "@/components/access-switch-bar"
import { canOpenSection, getAccessOptions, getPostLoginPath } from "@/lib/user-access"
import { FinalConfirmationWorkflowPanel } from "@/components/final-confirmation-workflow-panel"

export default function BaldevDashboardPage() {
  const router = useRouter()
  const { isAuthenticated, role, baldev, logout, access } = useAuth()

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login")
      return
    }
    if (role !== "baldev" && !canOpenSection(access, role, "final_confirmation")) {
      router.push(getPostLoginPath(access.length ? access : []))
    }
  }, [isAuthenticated, role, access, router])

  return (
    <div className="min-h-screen bg-background">
      <AccessSwitchBar current="final_confirmation" title="Final confirmation" />
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
            <BadgeCheck className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">Final confirmation</h1>
        </div>

        <FinalConfirmationWorkflowPanel
          description={`Welcome, ${baldev?.firstName || "User"}. Same workflow as Admin → Final confirmation.`}
        />
      </main>
    </div>
  )
}
