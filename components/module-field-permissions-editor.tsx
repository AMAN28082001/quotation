"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  getScopeOptionsForModule,
  OFFICE_LOCATIONS,
  normalizeModulePermissionScope,
  type ModuleFieldPermissions,
  type ModulePermissionLevel,
  type ModulePermissionRule,
  type ModulePermissionScope,
  type OfficeLocation,
  type WorkflowModuleKey,
} from "@/lib/module-field-permissions"

type UserOption = { id: string; label: string }

export function patchModuleFieldPermission(
  permissions: ModuleFieldPermissions,
  module: WorkflowModuleKey,
  patch: Partial<ModulePermissionRule>,
): ModuleFieldPermissions {
  const current = permissions[module] ?? {
    level: "none" as ModulePermissionLevel,
    scope: "everyone" as ModulePermissionScope,
    selectedUserIds: [],
  }
  return {
    ...permissions,
    [module]: { ...current, ...patch },
  }
}

function defaultRule(): ModulePermissionRule {
  return {
    level: "none",
    scope: "everyone",
    selectedUserIds: [],
  }
}

export function OfficeLocationSelect({
  officeLocation,
  onOfficeLocationChange,
}: {
  officeLocation: OfficeLocation | ""
  onOfficeLocationChange: (value: OfficeLocation | "") => void
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="office-location">Office location</Label>
      <p className="text-xs text-muted-foreground">
        Which office this employee belongs to (Jaipur, Ajmer, or Chomu). Used with &quot;Only there&quot; on dashboard rows above.
      </p>
      <Select
        value={officeLocation || "__none__"}
        onValueChange={(value) =>
          onOfficeLocationChange(value === "__none__" ? "" : (value as OfficeLocation))
        }
      >
        <SelectTrigger id="office-location" className="h-9 w-full max-w-xs">
          <SelectValue placeholder="Select office" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Not set</SelectItem>
          {OFFICE_LOCATIONS.map((loc) => (
            <SelectItem key={loc} value={loc}>{loc}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function WorkflowModuleInlineControls({
  module,
  permissions,
  onChange,
  userOptions,
  enabled,
}: {
  module: WorkflowModuleKey
  permissions: ModuleFieldPermissions
  onChange: (next: ModuleFieldPermissions) => void
  userOptions: UserOption[]
  enabled: boolean
}) {
  const rule = permissions[module] ?? defaultRule()
  const scopeOptions = getScopeOptionsForModule(module)

  return (
    <div className="mt-1.5 flex flex-col gap-2 sm:pl-6">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Label className="text-[11px] text-muted-foreground shrink-0">Field access</Label>
          <Select
            value={rule.level}
            onValueChange={(value) =>
              onChange(patchModuleFieldPermission(permissions, module, { level: value as ModulePermissionLevel }))
            }
            disabled={!enabled}
          >
            <SelectTrigger className="h-8 w-full sm:w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No access</SelectItem>
              <SelectItem value="read">Read only</SelectItem>
              <SelectItem value="write">Read &amp; write</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <Label className="text-[11px] text-muted-foreground shrink-0">Which to access</Label>
          <Select
            value={normalizeModulePermissionScope(rule.scope)}
            onValueChange={(value) =>
              onChange(
                patchModuleFieldPermission(permissions, module, {
                  scope: value as ModulePermissionScope,
                  selectedUserIds: value === "selected_users" ? rule.selectedUserIds : [],
                }),
              )
            }
            disabled={!enabled || rule.level === "none"}
          >
            <SelectTrigger className="h-8 w-full sm:w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scopeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {enabled && rule.scope === "selected_users" && rule.level !== "none" ? (
        <div className="space-y-1 max-h-28 overflow-y-auto rounded border border-border/40 p-2 sm:ml-6">
          <p className="text-[10px] text-muted-foreground">Selected one</p>
          {userOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No users loaded.</p>
          ) : (
            userOptions.map((user) => {
              const checked = rule.selectedUserIds.includes(user.id)
              return (
                <label
                  key={user.id}
                  className="flex items-center gap-2 rounded-sm px-1 py-0.5 text-xs hover:bg-accent cursor-pointer"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(next) => {
                      const on = next === true
                      const ids = on
                        ? [...rule.selectedUserIds, user.id]
                        : rule.selectedUserIds.filter((id) => id !== user.id)
                      onChange(patchModuleFieldPermission(permissions, module, { selectedUserIds: ids }))
                    }}
                  />
                  <span className="truncate">{user.label}</span>
                </label>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}

export function isWorkflowAccessKey(key: string): key is WorkflowModuleKey {
  return (
    key === "accounts" ||
    key === "installation" ||
    key === "metering" ||
    key === "final_confirmation"
  )
}
