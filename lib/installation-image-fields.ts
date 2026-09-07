/** Shared with Admin → Installation upload panel (`InstallationCompletionPanel`). */
export const INSTALLATION_IMAGE_FIELDS = [
  { key: "homeFrontPhoto", label: "Front Photo of Home", required: false },
  { key: "homeWithPersonPhoto", label: "Front Photo of Home with person", required: false },
  { key: "inverterWithCustomerPhoto", label: "Inverter Photo with customer", required: false },
  { key: "plantWithCustomerPhoto", label: "Plant photo with Customer", required: false },
  { key: "inverterSerialNumberPhoto", label: "Inverter Photo with Serial No", required: false },
  { key: "panelSerialNumberPhoto", label: "Panels photo with Serial No", multiple: true, required: false },
  { key: "geoTagPlantPhoto", label: "GeoTag photo with plants", required: false },
  { key: "otherImages", label: "Others Images", multiple: true, required: false },
] as const

export type InstallationImageFieldKey = (typeof INSTALLATION_IMAGE_FIELDS)[number]["key"]

type ImageFieldConfig = (typeof INSTALLATION_IMAGE_FIELDS)[number] & { required?: boolean; multiple?: boolean }

export const isInstallationImageFieldRequired = (field: (typeof INSTALLATION_IMAGE_FIELDS)[number]) =>
  (field as ImageFieldConfig).required !== false

export const isInstallationImageFieldMultiple = (field: (typeof INSTALLATION_IMAGE_FIELDS)[number]) =>
  (field as ImageFieldConfig).multiple === true
