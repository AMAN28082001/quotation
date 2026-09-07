"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import {
  api,
  ApiError,
  isApiAuthFailure,
  markApiSignOutInProgress,
  clearApiSignOutInProgress,
} from "./api"
import { readInstallationTeams } from "./installation-teams"
import { disconnectRealtime, initRealtime } from "./realtime"
import { mapBackendRoleToAdminUserRole, buildInventoryAuthUserFromQuotationSession } from "./admin-access"
import { authService as inventoryAuthService } from "@/inventory-sa/lib/auth"
import {
  type UserAccessKey,
  clearSessionAccess,
  primaryAppRoleFromAccess,
  readSessionAccess,
  resolveUserAccess,
  writeSessionAccess,
} from "./user-access"
import {
  resolveUserModulePermissions,
  resolveUserOfficeLocation,
  type ModuleFieldPermissions,
  type OfficeLocation,
} from "./module-field-permissions"

// asd

export interface Dealer {
  id: string
  username: string
  firstName: string
  lastName: string
  mobile: string
  email: string
  gender: string
  dateOfBirth: string
  fatherName: string
  fatherContact: string
  governmentIdType: string
  governmentIdNumber: string
  address: {
    street: string
    city: string
    state: string
    pincode: string
  }
  isActive?: boolean
  createdAt?: string
  emailVerified?: boolean
  /** Admin dashboard access checkboxes (when API / edit provides them). */
  access?: UserAccessKey[]
  permissions?: UserAccessKey[]
  officeLocation?: OfficeLocation | string
  office_location?: string
  moduleFieldPermissions?: ModuleFieldPermissions
  modulePermissions?: ModuleFieldPermissions
}

export interface Visitor {
  id: string
  username: string
  password: string
  firstName: string
  lastName: string
  mobile: string
  email: string
  employeeId?: string
  isActive?: boolean
  createdBy?: string
  createdAt?: string
  updatedAt?: string
  access?: UserAccessKey[]
  permissions?: UserAccessKey[]
  officeLocation?: OfficeLocation | string
  office_location?: string
  moduleFieldPermissions?: ModuleFieldPermissions
  modulePermissions?: ModuleFieldPermissions
}

export interface AccountManager {
  id: string
  username: string
  firstName: string
  lastName: string
  mobile: string
  email: string
  isActive?: boolean
  createdAt?: string
  emailVerified?: boolean
  role?: string
  access?: UserAccessKey[]
  permissions?: UserAccessKey[]
  officeLocation?: OfficeLocation | string
  office_location?: string
  moduleFieldPermissions?: ModuleFieldPermissions
  modulePermissions?: ModuleFieldPermissions
}

export interface InstallerUser {
  id: string
  username: string
  firstName: string
  lastName: string
  mobile: string
  email: string
  isActive?: boolean
  createdAt?: string
}

export interface MeteringUser {
  id: string
  username: string
  firstName: string
  lastName: string
  mobile: string
  email: string
  isActive?: boolean
  createdAt?: string
}

export interface BaldevUser {
  id: string
  username: string
  firstName: string
  lastName: string
  mobile: string
  email: string
  isActive?: boolean
  createdAt?: string
}

export interface HrUser {
  id: string
  username: string
  firstName: string
  lastName: string
  mobile: string
  email: string
  isActive?: boolean
  createdAt?: string
}

/** Logged-in field installation team (separate from legacy installer users). */
export interface InstallationTeamUser {
  id: string
  teamId: string
  teamName: string
  username: string
  firstName: string
  lastName: string
  isActive?: boolean
}

export type UserRole =
  | "dealer"
  | "visitor"
  | "admin"
  | "super-admin"
  | "account-management"
  | "installer"
  | "installation-team"
  | "metering"
  | "baldev"
  | "hr"

interface AuthContextType {
  dealer: Dealer | null
  visitor: Visitor | null
  accountManager: AccountManager | null
  installer: InstallerUser | null
  installationTeamUser: InstallationTeamUser | null
  meteringUser: MeteringUser | null
  baldev: BaldevUser | null
  hrUser: HrUser | null
  role: UserRole | null
  /** Dashboard sections granted by Admin (checkboxes). */
  access: UserAccessKey[]
  /** Installation / Metering read vs write (separate from dashboard access). */
  modulePermissions: ModuleFieldPermissions
  officeLocation: OfficeLocation | ""
  isAuthenticated: boolean
  /** False until localStorage session has been read (avoids refresh redirect races). */
  authReady: boolean
  login: (username: string, password: string) => Promise<boolean>
  loginAccountManagement: (username: string, password: string) => Promise<boolean>
  loginInstaller: (username: string, password: string) => Promise<boolean>
  loginInstallationTeam: (username: string, password: string) => Promise<boolean>
  loginMetering: (username: string, password: string) => Promise<boolean>
  loginBaldev: (username: string, password: string) => Promise<boolean>
  loginHr: (username: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  register: (dealerData: Dealer & { password: string }) => Promise<boolean>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [dealer, setDealer] = useState<Dealer | null>(null)
  const [visitor, setVisitor] = useState<Visitor | null>(null)
  const [accountManager, setAccountManager] = useState<AccountManager | null>(null)
  const [installer, setInstaller] = useState<InstallerUser | null>(null)
  const [installationTeamUser, setInstallationTeamUser] = useState<InstallationTeamUser | null>(null)
  const [meteringUser, setMeteringUser] = useState<MeteringUser | null>(null)
  const [baldev, setBaldev] = useState<BaldevUser | null>(null)
  const [hrUser, setHrUser] = useState<HrUser | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [access, setAccess] = useState<UserAccessKey[]>([])
  const [modulePermissions, setModulePermissions] = useState<ModuleFieldPermissions>({})
  const [officeLocation, setOfficeLocation] = useState<OfficeLocation | "">("")
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authReady, setAuthReady] = useState(false)

  const clearProfiles = () => {
    setDealer(null)
    setVisitor(null)
    setAccountManager(null)
    setInstaller(null)
    setInstallationTeamUser(null)
    setMeteringUser(null)
    setBaldev(null)
    setHrUser(null)
  }

  /** Fill profile slots for every granted access so each dashboard can show the user name. */
  const applyAccessProfiles = (user: any, granted: UserAccessKey[]) => {
    const base = {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      mobile: user.mobile || "",
      isActive: user.isActive ?? true,
      createdAt: user.createdAt,
      emailVerified: user.emailVerified ?? false,
    }
    clearProfiles()
    if (granted.includes("quotation") || granted.includes("admin")) {
      setDealer({
        ...base,
        gender: user.gender || "",
        dateOfBirth: user.dateOfBirth || "",
        fatherName: user.fatherName || "",
        fatherContact: user.fatherContact || "",
        governmentIdType: user.governmentIdType || "",
        governmentIdNumber: user.governmentIdNumber || "",
        address: user.address || { street: "", city: "", state: "", pincode: "" },
      })
    }
    if (granted.includes("accounts")) setAccountManager(base)
    if (granted.includes("installation")) setInstaller(base)
    if (granted.includes("metering")) setMeteringUser(base)
    if (granted.includes("final_confirmation")) setBaldev(base)
    if (granted.includes("hr")) setHrUser(base)
    if (granted.includes("visitor")) {
      setVisitor({
        ...base,
        password: "",
        employeeId: user.employeeId,
      })
    }
  }

  const commitSessionAccess = (username: string, backendRole: string, user: any): UserAccessKey[] => {
    const granted = resolveUserAccess({
      username,
      role: backendRole,
      access: user?.access,
      permissions: user?.permissions,
    })
    writeSessionAccess(granted)
    setAccess(granted)
    const perms = resolveUserModulePermissions(
      username,
      user?.moduleFieldPermissions ?? user?.modulePermissions,
    )
    const office = resolveUserOfficeLocation(username, user?.officeLocation ?? user?.office_location)
    setModulePermissions(perms)
    setOfficeLocation(office)
    return granted
  }

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectRealtime()
      return
    }

    const token = localStorage.getItem("authToken")
    if (!token) {
      disconnectRealtime()
      return
    }

    initRealtime(token)
  }, [isAuthenticated])

  useEffect(() => {
    if (isAuthenticated) clearApiSignOutInProgress()
  }, [isAuthenticated])

  useEffect(() => {
    const useApi = process.env.NEXT_PUBLIC_USE_API !== "false"

    try {
    // Check for existing session from API token
    const token = localStorage.getItem("authToken")
    const savedUser = localStorage.getItem("user")
    const savedRole = localStorage.getItem("userRole") as UserRole | null

    if (token && savedUser) {
      try {
        const user = JSON.parse(savedUser)
        const sessionAccess = resolveUserAccess({
          username: user.username,
          role: savedRole || user.role,
          access: user.access,
          permissions: user.permissions,
        })
        if (sessionAccess.length > 0) {
          writeSessionAccess(sessionAccess)
          setAccess(sessionAccess)
        }
        const perms = resolveUserModulePermissions(
          user.username,
          user.moduleFieldPermissions ?? user.modulePermissions,
        )
        const office = resolveUserOfficeLocation(user.username, user.officeLocation ?? user.office_location)
        setModulePermissions(perms)
        setOfficeLocation(office)
        setInstallationTeamUser(null)
        if (sessionAccess.length > 1) {
          applyAccessProfiles(user, sessionAccess)
          const appRole = primaryAppRoleFromAccess(sessionAccess) as UserRole
          setRole((savedRole as UserRole) || appRole)
          setIsAuthenticated(true)
        } else if (user.role === "visitor") {
          setVisitor(user)
          setRole("visitor")
          setAccountManager(null)
          setInstaller(null)
          setMeteringUser(null)
          setBaldev(null)
          setHrUser(null)
          setDealer(null)
        } else if (user.role === "hr" || user.role === "human-resources") {
          setHrUser(user)
          setRole("hr")
          setAccountManager(null)
          setInstaller(null)
          setMeteringUser(null)
          setBaldev(null)
          setVisitor(null)
          setDealer(null)
        } else if (user.role === "installation-team" || user.role === "installation_team") {
          const itData: InstallationTeamUser = {
            id: String(user.id || user.teamId || ""),
            teamId: String(user.teamId || user.installationTeamId || user.installation_team_id || user.id || ""),
            teamName: String(user.teamName || user.team_name || user.username || "Team"),
            username: user.username,
            firstName: user.firstName || String(user.teamName || user.team_name || ""),
            lastName: user.lastName || "",
            isActive: user.isActive !== false,
          }
          setInstallationTeamUser(itData)
          setRole("installation-team")
          setInstaller(null)
          setDealer(null)
          setVisitor(null)
          setAccountManager(null)
          setMeteringUser(null)
          setBaldev(null)
          setHrUser(null)
        } else if (user.role === "installer") {
          setInstaller(user)
          setRole("installer")
          setAccountManager(null)
          setVisitor(null)
          setMeteringUser(null)
          setBaldev(null)
          setHrUser(null)
          setDealer(null)
        } else if (user.role === "metering" || user.role === "meter" || user.role === "metering-team") {
          setMeteringUser({
            id: user.id,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            mobile: (user as any).mobile || "",
            isActive: (user as any).isActive ?? true,
            createdAt: (user as any).createdAt,
          })
          setRole("metering")
          setAccountManager(null)
          setVisitor(null)
          setInstaller(null)
          setBaldev(null)
          setHrUser(null)
          setDealer(null)
        } else if (user.role === "baldev" || user.role === "confirmation") {
          setBaldev(user)
          setRole("baldev")
          setAccountManager(null)
          setVisitor(null)
          setInstaller(null)
          setMeteringUser(null)
          setHrUser(null)
          setDealer(null)
        } else if (user.role === "account-management" || user.role === "accountManager") {
          setAccountManager(user)
          setRole("account-management")
          setVisitor(null)
          setInstaller(null)
          setMeteringUser(null)
          setBaldev(null)
          setHrUser(null)
          setDealer(null)
        } else {
          const adminMapped = mapBackendRoleToAdminUserRole(user.role) || mapBackendRoleToAdminUserRole(savedRole)
          setDealer(user)
          setRole(adminMapped || (savedRole === "admin" || user.role === "admin" ? "admin" : "dealer"))
          setAccountManager(null)
          setVisitor(null)
          setInstaller(null)
          setMeteringUser(null)
          setBaldev(null)
          setHrUser(null)
          if (token && adminMapped) {
            inventoryAuthService.setToken(token)
            inventoryAuthService.setUser(
              buildInventoryAuthUserFromQuotationSession({
                id: user.id,
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                role: adminMapped,
                isActive: (user as any).isActive ?? true,
                loginUser: user as any,
              })
            )
          }
        }
        setIsAuthenticated(true)
      } catch {
        // Invalid saved data, clear it
        localStorage.removeItem("authToken")
        localStorage.removeItem("refreshToken")
        localStorage.removeItem("user")
        localStorage.removeItem("userRole")
        localStorage.removeItem("accountManager")
        localStorage.removeItem("installerUser")
        localStorage.removeItem("installationTeamUser")
        localStorage.removeItem("meteringUser")
        localStorage.removeItem("baldevUser")
        localStorage.removeItem("hrUser")
      }
    } else if (!useApi) {
      // Fallback to localStorage for development (only if API is disabled)
      const savedDealer = localStorage.getItem("dealer")
      const savedVisitor = localStorage.getItem("visitor")
      const savedAccountManager = localStorage.getItem("accountManager")
      const savedInstaller = localStorage.getItem("installerUser")
      const savedInstallationTeam = localStorage.getItem("installationTeamUser")
      const savedMeteringUser = localStorage.getItem("meteringUser")
      const savedBaldev = localStorage.getItem("baldevUser")
      const savedHrUser = localStorage.getItem("hrUser")

      if (savedAccountManager) {
        setAccountManager(JSON.parse(savedAccountManager))
        setRole("account-management")
        setIsAuthenticated(true)
        setDealer(null)
        setVisitor(null)
        setInstaller(null)
        setMeteringUser(null)
        setBaldev(null)
        setHrUser(null)
      } else if (savedHrUser) {
        setHrUser(JSON.parse(savedHrUser))
        setRole("hr")
        setIsAuthenticated(true)
        setDealer(null)
        setVisitor(null)
        setAccountManager(null)
        setInstaller(null)
        setMeteringUser(null)
        setBaldev(null)
      } else if (savedInstallationTeam) {
        setInstallationTeamUser(JSON.parse(savedInstallationTeam))
        setRole("installation-team")
        setIsAuthenticated(true)
        setDealer(null)
        setVisitor(null)
        setAccountManager(null)
        setInstaller(null)
        setMeteringUser(null)
        setBaldev(null)
        setHrUser(null)
      } else if (savedInstaller) {
        setInstaller(JSON.parse(savedInstaller))
        setRole("installer")
        setIsAuthenticated(true)
        setDealer(null)
        setVisitor(null)
        setAccountManager(null)
        setInstallationTeamUser(null)
        setMeteringUser(null)
        setBaldev(null)
        setHrUser(null)
      } else if (savedMeteringUser) {
        setMeteringUser(JSON.parse(savedMeteringUser))
        setRole("metering")
        setIsAuthenticated(true)
        setDealer(null)
        setVisitor(null)
        setAccountManager(null)
        setInstaller(null)
        setBaldev(null)
        setHrUser(null)
      } else if (savedBaldev) {
        setBaldev(JSON.parse(savedBaldev))
        setRole("baldev")
        setIsAuthenticated(true)
        setDealer(null)
        setVisitor(null)
        setAccountManager(null)
        setInstaller(null)
        setMeteringUser(null)
        setHrUser(null)
      } else if (savedDealer) {
        setDealer(JSON.parse(savedDealer))
        setRole(savedRole || "dealer")
        setIsAuthenticated(true)
        setAccountManager(null)
        setVisitor(null)
        setInstaller(null)
        setMeteringUser(null)
        setBaldev(null)
        setHrUser(null)
      } else if (savedVisitor) {
        setVisitor(JSON.parse(savedVisitor))
        setRole("visitor")
        setIsAuthenticated(true)
        setAccountManager(null)
        setDealer(null)
        setInstaller(null)
        setMeteringUser(null)
        setBaldev(null)
        setHrUser(null)
      }
    }
    } finally {
      setAuthReady(true)
    }
  }, [])

  const login = async (username: string, password: string): Promise<boolean> => {
    const useApi = process.env.NEXT_PUBLIC_USE_API !== "false"

    if (useApi) {
      try {
        const response = await api.auth.login(username, password)
        const user = response.user
        const backendRole = String(user.role || "").toLowerCase()
        const adminMapped = mapBackendRoleToAdminUserRole(backendRole)

        const normalizedBackendRole =
          adminMapped ||
          (backendRole === "visitor"
            ? "visitor"
            : backendRole === "hr" || backendRole === "human-resources"
              ? "hr"
              : backendRole === "account-management" ||
                  backendRole === "accountmanager" ||
                  backendRole === "account_manager"
                ? "account-management"
                : backendRole === "installer" || backendRole === "installation"
                  ? "installer"
                  : backendRole === "installation-team" || backendRole === "installation_team"
                    ? "installation-team"
                    : backendRole === "metering" ||
                        backendRole === "meter" ||
                        backendRole === "metering-team" ||
                        backendRole === "mco"
                      ? "metering"
                      : backendRole === "baldev" || backendRole === "confirmation"
                        ? "baldev"
                        : "dealer")

        const granted = commitSessionAccess(user.username || username, normalizedBackendRole, user)
        const userRole = (
          granted.length > 0 ? primaryAppRoleFromAccess(granted) : normalizedBackendRole
        ) as UserRole

        // Store tokens
        if (response.token) {
          localStorage.setItem("authToken", response.token)
          // Keep inventory SA client in sync so Super Admin Inventory can load all data
          inventoryAuthService.setToken(response.token)
        }
        if (response.refreshToken) {
          localStorage.setItem("refreshToken", response.refreshToken)
        }

        if (adminMapped || granted.includes("admin")) {
          inventoryAuthService.setUser(
            buildInventoryAuthUserFromQuotationSession({
              id: user.id,
              username: user.username,
              firstName: user.firstName,
              lastName: user.lastName,
              role: adminMapped || "admin",
              isActive: (user as any).isActive ?? true,
              loginUser: user as any,
            })
          )
        }

        applyAccessProfiles(user, granted.length > 0 ? granted : resolveUserAccess({ role: userRole }))

        // Keep installation-team shape when that is the only / primary role
        if (userRole === "installation-team" || normalizedBackendRole === "installation-team") {
          const u = user as any
          setInstallationTeamUser({
            id: String(u.id || u.teamId || ""),
            teamId: String(u.teamId || u.installationTeamId || u.installation_team_id || u.id || ""),
            teamName: String(u.teamName || u.team_name || u.username || "Team"),
            username: u.username,
            firstName: u.firstName || String(u.teamName || u.team_name || ""),
            lastName: u.lastName || "",
            isActive: u.isActive !== false,
          })
        }

        setRole(userRole)
        setIsAuthenticated(true)
        localStorage.setItem("user", JSON.stringify({ ...user, access: granted }))
        localStorage.setItem("userRole", userRole)
        return true
      } catch (error) {
        console.error("Login error:", error)
        if (error instanceof ApiError) {
          console.error("API Error Code:", error.code)
          console.error("API Error Message:", error.message)
          throw error
        }
        if (error instanceof TypeError) {
          throw new ApiError(
            "Cannot reach the server. Check your internet connection and try again.",
            "NETWORK_ERROR",
          )
        }
        return false
      }
    } else {
      // Fallback to localStorage for development
      const dealers = JSON.parse(localStorage.getItem("dealers") || "[]")
      const foundDealer = dealers.find((d: Dealer & { password: string }) => d.username === username && d.password === password)

      if (foundDealer) {
        const { password: _, ...dealerData } = foundDealer
        const userRole: UserRole = username === "admin" ? "admin" : "dealer"
        const granted = commitSessionAccess(username, userRole, { ...dealerData, access: (foundDealer as any).access })
        applyAccessProfiles(dealerData, granted.length ? granted : resolveUserAccess({ role: userRole, username }))
        setRole(userRole)
        setIsAuthenticated(true)
        localStorage.setItem("dealer", JSON.stringify(dealerData))
        localStorage.setItem("userRole", userRole)
        localStorage.setItem("user", JSON.stringify({ ...dealerData, role: userRole, access: granted }))
        localStorage.removeItem("visitor")
        return true
      }

      // Operational users stored under accountManagers / installers / etc.
      const opsPools = [
        { listKey: "accountManagers", role: "account-management" as UserRole },
        { listKey: "installers", role: "installer" as UserRole },
        { listKey: "meteringUsers", role: "metering" as UserRole },
        { listKey: "baldevUsers", role: "baldev" as UserRole },
        { listKey: "hrUsers", role: "hr" as UserRole },
      ]
      for (const pool of opsPools) {
        const list = JSON.parse(localStorage.getItem(pool.listKey) || "[]")
        const found = list.find((u: any) => u.username === username && u.password === password)
        if (found) {
          const { password: _, ...userData } = found
          const roleHint = (found as any).role || pool.role
          const granted = commitSessionAccess(username, roleHint, found)
          applyAccessProfiles(userData, granted.length ? granted : resolveUserAccess({ role: roleHint, username }))
          const userRole = (granted.length ? primaryAppRoleFromAccess(granted) : pool.role) as UserRole
          setRole(userRole)
          setIsAuthenticated(true)
          localStorage.setItem("userRole", userRole)
          localStorage.setItem("user", JSON.stringify({ ...userData, role: userRole, access: granted }))
          return true
        }
      }

      // Check visitors
      const visitors = JSON.parse(localStorage.getItem("visitors") || "[]")
      const foundVisitor = visitors.find((v: Visitor & { password?: string }) => {
        return v.username === username && v.password === password
      })

      if (foundVisitor) {
        const { password: _, ...visitorData } = foundVisitor
        const granted = commitSessionAccess(username, "visitor", foundVisitor)
        applyAccessProfiles(visitorData, granted.length ? granted : ["visitor"])
        setRole("visitor")
        setIsAuthenticated(true)
        localStorage.setItem("visitor", JSON.stringify(visitorData))
        localStorage.setItem("userRole", "visitor")
        localStorage.setItem("user", JSON.stringify({ ...visitorData, role: "visitor", access: granted }))
        localStorage.removeItem("dealer")
        return true
      }

      const hrUsers = JSON.parse(localStorage.getItem("hrUsers") || "[]")
      const foundHrUser = hrUsers.find((u: HrUser & { password?: string }) => u.username === username && u.password === password)
      if (foundHrUser && foundHrUser.isActive !== false) {
        const { password: _, ...hrData } = foundHrUser
        setHrUser(hrData as HrUser)
        setDealer(null)
        setVisitor(null)
        setAccountManager(null)
        setInstaller(null)
        setMeteringUser(null)
        setBaldev(null)
        setRole("hr")
        setIsAuthenticated(true)
        localStorage.setItem("hrUser", JSON.stringify(hrData))
        localStorage.setItem("userRole", "hr")
        localStorage.setItem("user", JSON.stringify({ ...hrData, role: "hr" }))
        localStorage.removeItem("dealer")
        localStorage.removeItem("visitor")
        localStorage.removeItem("accountManager")
        localStorage.removeItem("installerUser")
        localStorage.removeItem("meteringUser")
        localStorage.removeItem("baldevUser")
        return true
      }

      return false
    }
  }

  const logout = async () => {
    const useApi = process.env.NEXT_PUBLIC_USE_API !== "false"

    markApiSignOutInProgress()
    disconnectRealtime()

    // Stop dashboard effects from starting new authenticated fetches before tokens are cleared.
    setIsAuthenticated(false)
    setDealer(null)
    setVisitor(null)
    setAccountManager(null)
    setInstaller(null)
    setInstallationTeamUser(null)
    setMeteringUser(null)
    setBaldev(null)
    setHrUser(null)
    setRole(null)
    setAccess([])
    setModulePermissions({})
    setOfficeLocation("")

    localStorage.removeItem("authToken")
    localStorage.removeItem("refreshToken")
    inventoryAuthService.clearAuth()
    localStorage.removeItem("dealer")
    localStorage.removeItem("visitor")
    localStorage.removeItem("accountManager")
    localStorage.removeItem("installerUser")
    localStorage.removeItem("installationTeamUser")
    localStorage.removeItem("meteringUser")
    localStorage.removeItem("baldevUser")
    localStorage.removeItem("hrUser")
    localStorage.removeItem("userRole")
    localStorage.removeItem("user")
    clearSessionAccess()

    if (useApi) {
      try {
        await api.auth.logout()
      } catch (error) {
        if (!(error instanceof ApiError && isApiAuthFailure(undefined, error.code, error.message))) {
          console.error("Logout error:", error)
        }
      }
    }
  }

  const loginAccountManagement = async (username: string, password: string): Promise<boolean> => {
    const useApi = process.env.NEXT_PUBLIC_USE_API !== "false"

    if (useApi) {
      try {
        // For account management, use same login endpoint but check for account-management role
        const response = await api.auth.login(username, password)
        const user = response.user
        const userRole = user.role === "account-management" || user.role === "accountManager" ? "account-management" : user.role

        // Only allow account-management role users
        if (userRole !== "account-management") {
          // Not an account management user, reject login
          console.error("Login rejected: User role is not account-management")
          return false
        }

        // Store tokens
        if (response.token) {
          localStorage.setItem("authToken", response.token)
        }
        if (response.refreshToken) {
          localStorage.setItem("refreshToken", response.refreshToken)
        }

        setAccountManager({
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          mobile: (user as any).mobile || "",
          isActive: (user as any).isActive ?? true,
          emailVerified: (user as any).emailVerified ?? false,
          createdAt: (user as any).createdAt,
        })
        setDealer(null)
        setVisitor(null)
        setInstaller(null)
        setMeteringUser(null)
        setBaldev(null)
        setHrUser(null)

        setRole("account-management")
        setIsAuthenticated(true)
        localStorage.setItem("user", JSON.stringify(user))
        localStorage.setItem("userRole", "account-management")
        localStorage.setItem("accountManager", JSON.stringify({
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          mobile: (user as any).mobile || "",
        }))
        localStorage.removeItem("installerUser")
        localStorage.removeItem("meteringUser")
        localStorage.removeItem("baldevUser")
        localStorage.removeItem("hrUser")
        return true
      } catch (error) {
        console.error("Account Management login error:", error)
        if (error instanceof ApiError) {
          console.error("API Error Code:", error.code)
          console.error("API Error Message:", error.message)
        }
        return false
      }
    } else {
      // Fallback to localStorage for development
      // Check for account management users (stored in separate localStorage key or with special prefix)
      const accountManagers = JSON.parse(localStorage.getItem("accountManagers") || "[]")
      
      // Dummy-data seeding removed: only existing local/API users are allowed.
      
      const foundAccountManager = accountManagers.find((am: AccountManager & { password: string }) => 
        am.username === username && am.password === password
      )

      if (foundAccountManager) {
        // Check if account manager is active
        if (foundAccountManager.isActive === false) {
          console.error("Account manager is inactive")
          return false
        }
        
        const { password: _, ...accountManagerData } = foundAccountManager
        setAccountManager(accountManagerData)
        setDealer(null)
        setVisitor(null)
        setInstaller(null)
        setMeteringUser(null)
        setBaldev(null)
        setHrUser(null)
        setRole("account-management")
        setIsAuthenticated(true)
        
        // Persist to localStorage
        localStorage.setItem("accountManager", JSON.stringify(accountManagerData))
        localStorage.setItem("userRole", "account-management")
        localStorage.setItem("user", JSON.stringify({
          ...accountManagerData,
          role: "account-management"
        }))
        localStorage.removeItem("dealer")
        localStorage.removeItem("visitor")
        localStorage.removeItem("installerUser")
        localStorage.removeItem("meteringUser")
        localStorage.removeItem("baldevUser")
        localStorage.removeItem("hrUser")
        localStorage.removeItem("authToken")
        localStorage.removeItem("refreshToken")
        
        console.log("Account Management login successful:", accountManagerData.username)
        return true
      }

      console.error("Account manager not found with username:", username)
      return false
    }
  }

  const loginInstaller = async (username: string, password: string): Promise<boolean> => {
    const useApi = process.env.NEXT_PUBLIC_USE_API !== "false"

    if (useApi) {
      try {
        const response = await api.auth.login(username, password)
        const user = response.user

        const backendRole = String(user.role || "").toLowerCase()
        // Temporary compatibility: some backends still return account-management for operational users.
        const allowedInstallerRoles = ["installer", "installation", "account-management", "accountmanager"]
        if (!allowedInstallerRoles.includes(backendRole)) {
          console.error("Login rejected: User role is not installer")
          return false
        }

        if (response.token) {
          localStorage.setItem("authToken", response.token)
        }
        if (response.refreshToken) {
          localStorage.setItem("refreshToken", response.refreshToken)
        }

        const installerData: InstallerUser = {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          mobile: (user as any).mobile || "",
          isActive: (user as any).isActive ?? true,
          createdAt: (user as any).createdAt,
        }

        setInstaller(installerData)
        setInstallationTeamUser(null)
        setDealer(null)
        setVisitor(null)
        setAccountManager(null)
        setMeteringUser(null)
        setBaldev(null)
        setHrUser(null)
        setRole("installer")
        setIsAuthenticated(true)

        localStorage.setItem("user", JSON.stringify({ ...user, role: "installer" }))
        localStorage.setItem("userRole", "installer")
        localStorage.setItem("installerUser", JSON.stringify(installerData))
        localStorage.removeItem("installationTeamUser")
        localStorage.removeItem("accountManager")
        localStorage.removeItem("meteringUser")
        localStorage.removeItem("baldevUser")
        localStorage.removeItem("hrUser")
        localStorage.removeItem("dealer")
        localStorage.removeItem("visitor")
        return true
      } catch (error) {
        console.error("Installer login error:", error)
        if (error instanceof ApiError) {
          console.error("API Error Code:", error.code)
          console.error("API Error Message:", error.message)
        }
        return false
      }
    }

    const installers = JSON.parse(localStorage.getItem("installers") || "[]")
    const foundInstaller = installers.find((u: InstallerUser & { password: string }) => u.username === username && u.password === password)

    if (!foundInstaller || foundInstaller.isActive === false) {
      return false
    }

    const { password: _, ...installerData } = foundInstaller
    setInstaller(installerData)
    setInstallationTeamUser(null)
    setDealer(null)
    setVisitor(null)
    setAccountManager(null)
    setMeteringUser(null)
    setBaldev(null)
    setHrUser(null)
    setRole("installer")
    setIsAuthenticated(true)
    localStorage.setItem("installerUser", JSON.stringify(installerData))
    localStorage.setItem("userRole", "installer")
    localStorage.setItem("user", JSON.stringify({ ...installerData, role: "installer" }))
    localStorage.removeItem("installationTeamUser")
    localStorage.removeItem("accountManager")
    localStorage.removeItem("meteringUser")
    localStorage.removeItem("baldevUser")
    localStorage.removeItem("hrUser")
    localStorage.removeItem("dealer")
    localStorage.removeItem("visitor")
    return true
  }

  const loginInstallationTeam = async (username: string, password: string): Promise<boolean> => {
    const useApi = process.env.NEXT_PUBLIC_USE_API !== "false"

    if (useApi) {
      try {
        const response = await api.auth.login(username, password)
        const user = response.user
        const backendRole = String(user.role || "").toLowerCase()
        const allowed = ["installation-team", "installation_team", "installationteam", "field_team", "field-team"]
        if (!allowed.includes(backendRole)) {
          console.error("Login rejected: User role is not installation-team")
          return false
        }

        if (response.token) {
          localStorage.setItem("authToken", response.token)
        }
        if (response.refreshToken) {
          localStorage.setItem("refreshToken", response.refreshToken)
        }

        const itData: InstallationTeamUser = {
          id: String(user.id || ""),
          teamId: String((user as any).installationTeamId || (user as any).installation_team_id || user.id || ""),
          teamName: String((user as any).teamName || (user as any).team_name || user.username || "Installation team"),
          username: user.username,
          firstName: user.firstName || String((user as any).teamName || ""),
          lastName: user.lastName || "",
          isActive: (user as any).isActive !== false,
        }

        setInstallationTeamUser(itData)
        setInstaller(null)
        setDealer(null)
        setVisitor(null)
        setAccountManager(null)
        setMeteringUser(null)
        setBaldev(null)
        setHrUser(null)
        setRole("installation-team")
        setIsAuthenticated(true)

        localStorage.setItem("user", JSON.stringify({ ...user, role: "installation-team", teamId: itData.teamId, teamName: itData.teamName }))
        localStorage.setItem("userRole", "installation-team")
        localStorage.setItem("installationTeamUser", JSON.stringify(itData))
        localStorage.removeItem("installerUser")
        localStorage.removeItem("accountManager")
        localStorage.removeItem("meteringUser")
        localStorage.removeItem("baldevUser")
        localStorage.removeItem("hrUser")
        localStorage.removeItem("dealer")
        localStorage.removeItem("visitor")
        return true
      } catch (error) {
        console.error("Installation team login error:", error)
        return false
      }
    }

    const teams = readInstallationTeams()
    const found = teams.find(
      (t) => String(t.username || "").toLowerCase() === username.trim().toLowerCase() && t.password === password && t.isActive !== false,
    )
    if (!found) return false

    const itData: InstallationTeamUser = {
      id: found.id,
      teamId: found.id,
      teamName: found.name,
      username: found.username,
      firstName: found.name,
      lastName: "Team",
      isActive: true,
    }

    setInstallationTeamUser(itData)
    setInstaller(null)
    setDealer(null)
    setVisitor(null)
    setAccountManager(null)
    setMeteringUser(null)
    setBaldev(null)
    setHrUser(null)
    setRole("installation-team")
    setIsAuthenticated(true)
    localStorage.setItem("installationTeamUser", JSON.stringify(itData))
    localStorage.setItem("userRole", "installation-team")
    localStorage.setItem("user", JSON.stringify({ ...itData, role: "installation-team" }))
    localStorage.removeItem("installerUser")
    localStorage.removeItem("accountManager")
    localStorage.removeItem("meteringUser")
    localStorage.removeItem("baldevUser")
    localStorage.removeItem("hrUser")
    localStorage.removeItem("dealer")
    localStorage.removeItem("visitor")
    return true
  }

  const loginMetering = async (username: string, password: string): Promise<boolean> => {
    const useApi = process.env.NEXT_PUBLIC_USE_API !== "false"

    if (useApi) {
      try {
        const response = await api.auth.login(username, password)
        const user = response.user
        const backendRole = String(user.role || "").toLowerCase()
        const allowedMeteringRoles = [
          "metering",
          "meter",
          "metering-team",
          "metering_team",
          "mco",
          "account-management",
          "accountmanager",
        ]
        if (!allowedMeteringRoles.includes(backendRole)) {
          console.error("Login rejected: User role is not metering")
          return false
        }

        if (response.token) {
          localStorage.setItem("authToken", response.token)
        }
        if (response.refreshToken) {
          localStorage.setItem("refreshToken", response.refreshToken)
        }

        const meteringData: MeteringUser = {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          mobile: (user as any).mobile || "",
          isActive: (user as any).isActive ?? true,
          createdAt: (user as any).createdAt,
        }

        setMeteringUser(meteringData)
        setDealer(null)
        setVisitor(null)
        setAccountManager(null)
        setInstaller(null)
        setInstallationTeamUser(null)
        setBaldev(null)
        setHrUser(null)
        setRole("metering")
        setIsAuthenticated(true)

        localStorage.setItem("user", JSON.stringify({ ...user, role: "metering" }))
        localStorage.setItem("userRole", "metering")
        localStorage.setItem("meteringUser", JSON.stringify(meteringData))
        localStorage.removeItem("accountManager")
        localStorage.removeItem("installerUser")
        localStorage.removeItem("installationTeamUser")
        localStorage.removeItem("baldevUser")
        localStorage.removeItem("hrUser")
        localStorage.removeItem("dealer")
        localStorage.removeItem("visitor")
        return true
      } catch (error) {
        console.error("Metering login error:", error)
        if (error instanceof ApiError) {
          console.error("API Error Code:", error.code)
          console.error("API Error Message:", error.message)
        }
        return false
      }
    }

    const meteringUsers = JSON.parse(localStorage.getItem("meteringUsers") || "[]")
    const found = meteringUsers.find((u: MeteringUser & { password: string }) => u.username === username && u.password === password)

    if (!found || found.isActive === false) {
      return false
    }

    const { password: _, ...meteringData } = found
    setMeteringUser(meteringData)
    setDealer(null)
    setVisitor(null)
    setAccountManager(null)
    setInstaller(null)
    setInstallationTeamUser(null)
    setBaldev(null)
    setHrUser(null)
    setRole("metering")
    setIsAuthenticated(true)
    localStorage.setItem("meteringUser", JSON.stringify(meteringData))
    localStorage.setItem("userRole", "metering")
    localStorage.setItem("user", JSON.stringify({ ...meteringData, role: "metering" }))
    localStorage.removeItem("accountManager")
    localStorage.removeItem("installerUser")
    localStorage.removeItem("installationTeamUser")
    localStorage.removeItem("baldevUser")
    localStorage.removeItem("hrUser")
    localStorage.removeItem("dealer")
    localStorage.removeItem("visitor")
    return true
  }

  const loginBaldev = async (username: string, password: string): Promise<boolean> => {
    const useApi = process.env.NEXT_PUBLIC_USE_API !== "false"

    if (useApi) {
      try {
        const response = await api.auth.login(username, password)
        const user = response.user
        const backendRole = String(user.role || "").toLowerCase()
        const allowedBaldevRoles = ["baldev", "confirmation", "account-management", "accountmanager"]
        if (!allowedBaldevRoles.includes(backendRole)) {
          console.error("Login rejected: User role is not baldev/confirmation")
          return false
        }

        if (response.token) {
          localStorage.setItem("authToken", response.token)
        }
        if (response.refreshToken) {
          localStorage.setItem("refreshToken", response.refreshToken)
        }

        const baldevData: BaldevUser = {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          mobile: (user as any).mobile || "",
          isActive: (user as any).isActive ?? true,
          createdAt: (user as any).createdAt,
        }

        setBaldev(baldevData)
        setDealer(null)
        setVisitor(null)
        setAccountManager(null)
        setInstaller(null)
        setMeteringUser(null)
        setHrUser(null)
        commitSessionAccess(user.username, backendRole, user)
        setRole("baldev")
        setIsAuthenticated(true)

        localStorage.setItem("user", JSON.stringify({ ...user, role: "baldev" }))
        localStorage.setItem("userRole", "baldev")
        localStorage.setItem("baldevUser", JSON.stringify(baldevData))
        localStorage.removeItem("accountManager")
        localStorage.removeItem("installerUser")
        localStorage.removeItem("meteringUser")
        localStorage.removeItem("hrUser")
        localStorage.removeItem("dealer")
        localStorage.removeItem("visitor")
        return true
      } catch (error) {
        console.error("Baldev login error:", error)
        if (error instanceof ApiError) {
          console.error("API Error Code:", error.code)
          console.error("API Error Message:", error.message)
        }
        return false
      }
    }

    const baldevUsers = JSON.parse(localStorage.getItem("baldevUsers") || "[]")
    const foundBaldev = baldevUsers.find((u: BaldevUser & { password: string }) => u.username === username && u.password === password)

    if (!foundBaldev || foundBaldev.isActive === false) {
      return false
    }

    const { password: _, ...baldevData } = foundBaldev
    setBaldev(baldevData)
    setDealer(null)
    setVisitor(null)
    setAccountManager(null)
    setInstaller(null)
    setMeteringUser(null)
    setHrUser(null)
    commitSessionAccess(foundBaldev.username, "baldev", foundBaldev)
    setRole("baldev")
    setIsAuthenticated(true)
    localStorage.setItem("baldevUser", JSON.stringify(baldevData))
    localStorage.setItem("userRole", "baldev")
    localStorage.setItem("user", JSON.stringify({ ...baldevData, role: "baldev" }))
    localStorage.removeItem("accountManager")
    localStorage.removeItem("installerUser")
    localStorage.removeItem("meteringUser")
    localStorage.removeItem("hrUser")
    localStorage.removeItem("dealer")
    localStorage.removeItem("visitor")
    return true
  }

  const loginHr = async (username: string, password: string): Promise<boolean> => {
    const useApi = process.env.NEXT_PUBLIC_USE_API !== "false"

    if (useApi) {
      try {
        const response = await api.auth.login(username, password)
        const user = response.user
        const backendRole = String(user.role || "").toLowerCase()
        const allowedHrRoles = ["hr", "human-resources"]
        if (!allowedHrRoles.includes(backendRole)) {
          console.error("Login rejected: User role is not HR")
          return false
        }

        if (response.token) {
          localStorage.setItem("authToken", response.token)
        }
        if (response.refreshToken) {
          localStorage.setItem("refreshToken", response.refreshToken)
        }

        const hrData: HrUser = {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          mobile: (user as any).mobile || "",
          isActive: (user as any).isActive ?? true,
          createdAt: (user as any).createdAt,
        }

        setHrUser(hrData)
        setDealer(null)
        setVisitor(null)
        setAccountManager(null)
        setInstaller(null)
        setMeteringUser(null)
        setBaldev(null)
        setRole("hr")
        setIsAuthenticated(true)

        localStorage.setItem("user", JSON.stringify({ ...user, role: "hr" }))
        localStorage.setItem("userRole", "hr")
        localStorage.setItem("hrUser", JSON.stringify(hrData))
        localStorage.removeItem("accountManager")
        localStorage.removeItem("installerUser")
        localStorage.removeItem("meteringUser")
        localStorage.removeItem("baldevUser")
        localStorage.removeItem("dealer")
        localStorage.removeItem("visitor")
        return true
      } catch (error) {
        console.error("HR login error:", error)
        if (error instanceof ApiError) {
          console.error("API Error Code:", error.code)
          console.error("API Error Message:", error.message)
        }
        return false
      }
    }

    const hrUsers = JSON.parse(localStorage.getItem("hrUsers") || "[]")
    const foundHr = hrUsers.find((u: HrUser & { password: string }) => u.username === username && u.password === password)

    if (!foundHr || foundHr.isActive === false) {
      return false
    }

    const { password: _, ...hrData } = foundHr
    setHrUser(hrData)
    setDealer(null)
    setVisitor(null)
    setAccountManager(null)
    setInstaller(null)
    setMeteringUser(null)
    setBaldev(null)
    setRole("hr")
    setIsAuthenticated(true)
    localStorage.setItem("hrUser", JSON.stringify(hrData))
    localStorage.setItem("userRole", "hr")
    localStorage.setItem("user", JSON.stringify({ ...hrData, role: "hr" }))
    localStorage.removeItem("accountManager")
    localStorage.removeItem("installerUser")
    localStorage.removeItem("meteringUser")
    localStorage.removeItem("baldevUser")
    localStorage.removeItem("dealer")
    localStorage.removeItem("visitor")
    return true
  }

  const register = async (dealerData: Dealer & { password: string }): Promise<boolean> => {
    const useApi = process.env.NEXT_PUBLIC_USE_API !== "false"

    if (useApi) {
      try {
        const registrationData: any = {
          username: dealerData.username,
          password: dealerData.password,
          firstName: dealerData.firstName,
          lastName: dealerData.lastName,
          email: dealerData.email,
          mobile: dealerData.mobile,
          gender: dealerData.gender,
          dateOfBirth: dealerData.dateOfBirth,
          fatherName: dealerData.fatherName,
          fatherContact: dealerData.fatherContact,
          governmentIdType: dealerData.governmentIdType,
          governmentIdNumber: dealerData.governmentIdNumber,
          address: dealerData.address,
        }
        
        // Only include governmentIdImage if it exists and is not empty
        // Note: governmentIdImage is optional according to API spec
        // If the field exists in dealerData but is empty, we omit it
        if ((dealerData as any).governmentIdImage && (dealerData as any).governmentIdImage.trim() !== "") {
          registrationData.governmentIdImage = (dealerData as any).governmentIdImage
        }
        
        await api.dealers.register(registrationData)
        return true
      } catch (error) {
        console.error("Registration error:", error)
        // Re-throw error so it can be handled in the component with proper error messages
        throw error
      }
    } else {
      // Fallback to localStorage for development
      const dealers = JSON.parse(localStorage.getItem("dealers") || "[]")
      const exists = dealers.find((d: Dealer) => d.username === dealerData.username || d.email === dealerData.email)

      if (exists) {
        return false
      }

      dealers.push(dealerData)
      localStorage.setItem("dealers", JSON.stringify(dealers))
      return true
    }
  }

  return (
    <AuthContext.Provider
      value={{
        dealer,
        visitor,
        accountManager,
        installer,
        installationTeamUser,
        meteringUser,
        baldev,
        hrUser,
        role,
        access,
        modulePermissions,
        officeLocation,
        isAuthenticated,
        authReady,
        login,
        loginAccountManagement,
        loginInstaller,
        loginInstallationTeam,
        loginMetering,
        loginBaldev,
        loginHr,
        logout,
        register,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
