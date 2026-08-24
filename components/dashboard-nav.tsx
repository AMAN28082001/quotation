"use client"

import { useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { SolarLogo } from "@/components/solar-logo"
import { PricingSheetViewDialog } from "@/components/pricing-sheet-view-dialog"
import { PRICING_PDF_SCOPE_OPTIONS, type PricingPdfScope } from "@/lib/download-dcr-pricing-pdf"
import { usePricingTables } from "@/lib/use-pricing-tables"
import { Menu, Home, Users, FileText, LogOut, User, Shield, PhoneCall, Eye, ChevronDown, Wallet, Route } from "lucide-react"
import { isQuotationAdminAccess } from "@/lib/admin-access"
import { canOpenSection, getAccessOptions, type UserAccessKey } from "@/lib/user-access"
import { cn } from "@/lib/utils"

const isQuotationAppPath = (pathname: string) =>
  pathname === "/dashboard" ||
  pathname.startsWith("/dashboard/customers") ||
  pathname.startsWith("/dashboard/quotations") ||
  pathname.startsWith("/dashboard/payments") ||
  pathname.startsWith("/dashboard/calling-data") ||
  pathname.startsWith("/dashboard/customer-journey") ||
  pathname.startsWith("/dashboard/new-quotation")

const isAccessSectionActive = (key: UserAccessKey, pathname: string) => {
  if (key === "quotation") return isQuotationAppPath(pathname)
  const href = getAccessOptions([key])[0]?.href
  if (!href) return false
  return pathname === href || pathname.startsWith(href + "/")
}

const dealerNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/dashboard/customers", label: "Customers", icon: Users },
  { href: "/dashboard/quotations", label: "Quotations", icon: FileText },
  { href: "/dashboard/payments", label: "Payments", icon: Wallet },
  { href: "/dashboard/calling-data", label: "Calling Data", icon: PhoneCall },
  { href: "/dashboard/customer-journey", label: "Customer Journey", icon: Route },
]

const getNavItems = (isAdmin: boolean, role: string | null, access: UserAccessKey[], pathname: string) => {
  // Admin chrome: logo + profile only (no Workspace / Dealer / Admin links)
  if (isAdmin) {
    return []
  }

  const canUseDealer = canOpenSection(access, role, "quotation") || role === "dealer"

  // On Dealer surfaces, always show dealer tools when Dealer access is granted
  // (even if primary role is HR / metering / etc.)
  if (canUseDealer && isQuotationAppPath(pathname)) {
    return dealerNavItems
  }

  const options = getAccessOptions(access)
  if (options.length > 1) {
    const items = [
      { href: "/dashboard/workspace", label: "Workspace", icon: Home },
      ...options.map((o) => ({
        href: o.href,
        label: o.label,
        icon:
          o.key === "admin"
            ? Shield
            : o.key === "quotation"
              ? FileText
              : o.key === "accounts"
                ? Wallet
                : Users,
      })),
    ]
    if (canUseDealer && !items.some((item) => item.href === "/dashboard/calling-data")) {
      items.push({ href: "/dashboard/calling-data", label: "Calling Data", icon: PhoneCall })
    }
    return items
  }

  // Account Management users should not see regular navigation (they have their own header)
  if (
    role === "account-management" ||
    role === "installer" ||
    role === "installation-team" ||
    role === "metering" ||
    role === "baldev" ||
    role === "hr"
  ) {
    return []
  }

  // Non-admin with admin access key only (rare) — Admin Panel link
  if (access.includes("admin")) {
    return [{ href: "/dashboard/admin", label: "Admin Panel", icon: Shield }]
  }

  // For regular dealers, show standard navigation
  return dealerNavItems
}

export function DashboardNav() {
  const router = useRouter()
  const pathname = usePathname()
  const { dealer, logout, role, accountManager, access } = useAuth()
  const isAdmin = isQuotationAdminAccess({ role, username: dealer?.username })
  const navItems = getNavItems(isAdmin, role, access, pathname)
  const accessOptions = getAccessOptions(access)
  const [pricingViewScope, setPricingViewScope] = useState<PricingPdfScope | null>(null)
  usePricingTables()

  const canUseDealer = canOpenSection(access, role, "quotation") || role === "dealer"
  const onQuotationSurface = isQuotationAppPath(pathname)

  // Ops dashboards have their own headers / AccessSwitchBar
  if (
    pathname.startsWith("/dashboard/account-management") ||
    pathname.startsWith("/dashboard/installer") ||
    pathname.startsWith("/dashboard/metering") ||
    pathname.startsWith("/dashboard/baldev") ||
    pathname.startsWith("/dashboard/hr") ||
    pathname.startsWith("/dashboard/workspace") ||
    pathname.startsWith("/visitor/")
  ) {
    return null
  }

  // Hide dealer nav for ops-only sessions that are not on Dealer
  if (
    !isAdmin &&
    (role === "account-management" ||
      role === "installer" ||
      role === "installation-team" ||
      role === "metering" ||
      role === "baldev" ||
      role === "hr" ||
      accountManager) &&
    !(onQuotationSurface && canUseDealer)
  ) {
    return null
  }

  // Admin always renders logo + profile; others need at least one nav link
  if (!isAdmin && navItems.length === 0) return null

  const handleLogout = async () => {
    await logout()
    router.push("/")
  }

  const showDealerActions = !isAdmin && canUseDealer && onQuotationSurface && navItems.length > 0
  // Admin stays on Admin Panel only — no multi-access switcher / Dealer entry
  const showAccessSwitcher = !isAdmin && accessOptions.length > 1
  const currentAccessLabel =
    accessOptions.find((o) => isAccessSectionActive(o.key, pathname))?.label || "Workspace"
  const logoHref = isAdmin ? "/dashboard/admin" : "/dashboard"
  const showMobileNav = showAccessSwitcher || navItems.length > 0 || showDealerActions

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 shadow-sm">
        <div className="container mx-auto px-4">
          <div className="flex h-14 items-center gap-2 sm:gap-3">
            {/* Logo */}
            <button onClick={() => router.push(logoHref)} className="flex items-center shrink-0">
              <SolarLogo size="md" />
            </button>

            {showAccessSwitcher ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 shrink-0 text-[11px] px-2"
                  >
                    {currentAccessLabel}
                    <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {accessOptions.map((item) => (
                    <DropdownMenuItem
                      key={item.key}
                      onSelect={() => router.push(item.href)}
                      className={cn(isAccessSectionActive(item.key, pathname) && "bg-accent")}
                    >
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            {/* Page links — compact so all items fit without horizontal scroll */}
            <nav className="hidden md:flex items-center gap-0.5 min-w-0 flex-1 overflow-x-hidden">
              {navItems.map((item) => (
                <Button
                  key={item.href}
                  variant={pathname === item.href ? "default" : "ghost"}
                  size="sm"
                  onClick={() => router.push(item.href)}
                  className={cn(
                    "gap-1 shrink-0 h-7 px-2 text-[11px] font-medium leading-none",
                    pathname === item.href ? "" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <item.icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </Button>
              ))}
              {showDealerActions ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-muted-foreground hover:text-foreground shrink-0 h-7 px-2 text-[11px] font-medium leading-none"
                    >
                      <Eye className="w-3.5 h-3.5 shrink-0" />
                      Pricing
                      <ChevronDown className="w-3 h-3 opacity-70 shrink-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {PRICING_PDF_SCOPE_OPTIONS.map((opt) => (
                      <DropdownMenuItem
                        key={`nav-view-${opt.value}`}
                        onSelect={() => setPricingViewScope(opt.value as PricingPdfScope)}
                      >
                        <Eye className="w-3.5 h-3.5 mr-2 opacity-70" />
                        View {opt.shortLabel}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </nav>

            {/* User Menu */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 h-7 px-2">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                      <User className="w-3 h-3 text-primary" />
                    </div>
                    <span className="hidden xl:block font-medium text-[11px]">
                      {dealer?.firstName} {dealer?.lastName}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">
                      {dealer?.firstName} {dealer?.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">{dealer?.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Mobile Menu Toggle — skipped for admin (logo + profile only) */}
              {showMobileNav ? (
                <div className="md:hidden">
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open navigation menu">
                        <Menu className="w-5 h-5" />
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="right" className="w-[85vw] max-w-sm">
                      <SheetHeader>
                        <SheetTitle>Navigation</SheetTitle>
                        <SheetDescription>Move quickly across dashboard sections.</SheetDescription>
                      </SheetHeader>
                      <div className="px-4 pb-4 space-y-2">
                        {showAccessSwitcher ? (
                          <>
                            <p className="text-xs font-medium text-muted-foreground px-1">Your access</p>
                            {accessOptions.map((item) => (
                              <SheetClose asChild key={item.key}>
                                <Button
                                  variant={isAccessSectionActive(item.key, pathname) ? "default" : "ghost"}
                                  className="w-full justify-start"
                                  onClick={() => router.push(item.href)}
                                >
                                  {item.label}
                                </Button>
                              </SheetClose>
                            ))}
                            <div className="h-px bg-border my-2" />
                          </>
                        ) : null}
                        {navItems.map((item) => (
                          <SheetClose asChild key={item.href}>
                            <Button
                              variant={pathname === item.href ? "default" : "ghost"}
                              className="w-full justify-start gap-2"
                              onClick={() => router.push(item.href)}
                            >
                              <item.icon className="w-4 h-4" />
                              {item.label}
                            </Button>
                          </SheetClose>
                        ))}
                        {showDealerActions ? (
                          <>
                            <p className="text-xs font-medium text-muted-foreground pt-2 px-1">View pricing</p>
                            {PRICING_PDF_SCOPE_OPTIONS.map((opt) => (
                              <SheetClose asChild key={`mobile-view-${opt.value}`}>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="w-full justify-start gap-2"
                                  onClick={() => setPricingViewScope(opt.value as PricingPdfScope)}
                                >
                                  <Eye className="w-4 h-4" />
                                  {opt.label}
                                </Button>
                              </SheetClose>
                            ))}
                          </>
                        ) : null}
                        <SheetClose asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-start gap-2 text-destructive border-destructive/30 hover:text-destructive"
                            onClick={handleLogout}
                          >
                            <LogOut className="w-4 h-4" />
                            Logout
                          </Button>
                        </SheetClose>
                      </div>
                    </SheetContent>
                  </Sheet>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {pricingViewScope ? (
        <PricingSheetViewDialog
          open={Boolean(pricingViewScope)}
          onOpenChange={(open) => {
            if (!open) setPricingViewScope(null)
          }}
          scope={pricingViewScope}
        />
      ) : null}
    </>
  )
}
