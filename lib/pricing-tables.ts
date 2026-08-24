// Pricing Tables for Solar Systems
// Based on system type: DCR, NON DCR, and BOTH (DCR + NON DCR)
// Pricing data can come from backend API or use hardcoded fallback values

export interface SystemPricing {
  systemSize: string
  phase: "1-Phase" | "3-Phase"
  inverterSize: string
  panelType: string
  price: number
  notes?: string
}

// Component Pricing Interfaces
export interface PanelPricing {
  brand: string
  size: string // e.g., "440W", "550W"
  price: number // Price per panel
}

export interface InverterPricing {
  brand: string
  size: string // e.g., "3kW", "5kW"
  price: number
}

export interface StructurePricing {
  type: string // e.g., "GI Structure", "Aluminum Structure"
  size: string // e.g., "1kW", "5kW"
  price: number // Price per kW or total
}

export interface MeterPricing {
  brand: string
  price: number
}

export interface CablePricing {
  brand: string
  size: string // e.g., "4 sq mm", "6 sq mm"
  type: "AC" | "DC"
  price: number // Price per meter or fixed price
}

export interface ACDBPricing {
  brand: string // e.g., "Havells", "L&T"
  phase: "1-Phase" | "3-Phase"
  price: number
}

export interface DCDBPricing {
  brand: string // e.g., "Havells", "L&T"
  phase: "1-Phase" | "3-Phase"
  price: number
}

// System Configuration Preset - Default product selections for a system
export interface SystemConfigurationPreset {
  systemType: "dcr" | "non-dcr" | "both"
  systemSize: string // e.g., "3kW", "5kW"
  phase: string
  panelBrand: string
  panelSize: string
  inverterBrand: string
  inverterSize: string
  inverterType: string
  structureType: string
  structureSize: string
  meterBrand: string
  acCableBrand: string
  acCableSize: string
  dcCableBrand: string
  dcCableSize: string
  acdb: string
  dcdb: string
  /** Optional preset earthing wire (2mm / 4mm / 6mm / As per the set / custom). */
  earthingWireSize?: string
  /** Optional earthing wire brand (JMP / Polycab / … / As per the set / custom). */
  earthingWireBrand?: string
  // Subsidies (optional - DCR systems have fixed central subsidy of 78000)
  centralSubsidy?: number
  stateSubsidy?: number
}

// Pricing tables data structure (from API or fallback)
export interface PricingTablesData {
  // System pricing (DCR, NON DCR, BOTH)
  dcr?: SystemPricing[]
  nonDcr?: SystemPricing[]
  both?: BothSystemPricing[]
  
  // Component pricing
  panels?: PanelPricing[]
  inverters?: InverterPricing[]
  structures?: StructurePricing[]
  meters?: MeterPricing[]
  cables?: CablePricing[]
  acdb?: ACDBPricing[]
  dcdb?: DCDBPricing[]
  
  // System configuration presets (default product selections)
  systemConfigs?: SystemConfigurationPreset[]
}

// Global variable to store API pricing data (set by usePricingTables hook)
let apiPricingData: PricingTablesData | null = null

// Function to set pricing data from API
export function setPricingData(data: PricingTablesData | null) {
  apiPricingData = data
}

// Default component pricing (fallback values)
// Comprehensive list of panel sizes available in the market
export const defaultPanelPricing: PanelPricing[] = [
  // Adani panels - full range
  { brand: "Adani", size: "320W", price: 18000 },
  { brand: "Adani", size: "330W", price: 18500 },
  { brand: "Adani", size: "340W", price: 19000 },
  { brand: "Adani", size: "350W", price: 19500 },
  { brand: "Adani", size: "360W", price: 20000 },
  { brand: "Adani", size: "370W", price: 20500 },
  { brand: "Adani", size: "380W", price: 21000 },
  { brand: "Adani", size: "390W", price: 21500 },
  { brand: "Adani", size: "400W", price: 22000 },
  { brand: "Adani", size: "410W", price: 22500 },
  { brand: "Adani", size: "420W", price: 23000 },
  { brand: "Adani", size: "430W", price: 23500 },
  { brand: "Adani", size: "440W", price: 25000 },
  { brand: "Adani", size: "445W", price: 25500 },
  { brand: "Adani", size: "450W", price: 26000 },
  { brand: "Adani", size: "455W", price: 26500 },
  { brand: "Adani", size: "460W", price: 27000 },
  { brand: "Adani", size: "470W", price: 27500 },
  { brand: "Adani", size: "480W", price: 28000 },
  { brand: "Adani", size: "490W", price: 28500 },
  { brand: "Adani", size: "500W", price: 29000 },
  { brand: "Adani", size: "510W", price: 29500 },
  { brand: "Adani", size: "520W", price: 30000 },
  { brand: "Adani", size: "530W", price: 30500 },
  { brand: "Adani", size: "540W", price: 30800 },
  { brand: "Adani", size: "550W", price: 31000 },
  { brand: "Adani", size: "550W", price: 31200 },
  { brand: "Adani", size: "555W", price: 31500 },
  { brand: "Adani", size: "560W", price: 31800 },
  { brand: "Adani", size: "570W", price: 32200 },
  { brand: "Adani", size: "580W", price: 32600 },
  { brand: "Adani", size: "590W", price: 33000 },
  { brand: "Adani", size: "600W", price: 33500 },
  { brand: "Adani", size: "610W", price: 34000 },
  { brand: "Adani", size: "620W", price: 35000 },
  { brand: "Adani", size: "630W", price: 36000 },
  { brand: "Adani", size: "640W", price: 37000 },
  { brand: "Adani", size: "650W", price: 38000 },
  { brand: "Adani", size: "660W", price: 39000 },
  { brand: "Adani", size: "670W", price: 40000 },
  { brand: "Adani", size: "680W", price: 41000 },
  { brand: "Adani", size: "690W", price: 42000 },
  { brand: "Adani", size: "700W", price: 43000 },
  { brand: "Adani", size: "720W", price: 45000 },
  { brand: "Adani", size: "750W", price: 48000 },

  // Tata panels - full range
  { brand: "Tata", size: "320W", price: 19000 },
  { brand: "Tata", size: "330W", price: 19500 },
  { brand: "Tata", size: "340W", price: 20000 },
  { brand: "Tata", size: "350W", price: 20500 },
  { brand: "Tata", size: "360W", price: 21000 },
  { brand: "Tata", size: "370W", price: 21500 },
  { brand: "Tata", size: "380W", price: 22000 },
  { brand: "Tata", size: "390W", price: 22500 },
  { brand: "Tata", size: "400W", price: 23000 },
  { brand: "Tata", size: "410W", price: 23500 },
  { brand: "Tata", size: "420W", price: 24000 },
  { brand: "Tata", size: "430W", price: 24500 },
  { brand: "Tata", size: "440W", price: 26000 },
  { brand: "Tata", size: "445W", price: 26500 },
  { brand: "Tata", size: "450W", price: 27000 },
  { brand: "Tata", size: "455W", price: 27500 },
  { brand: "Tata", size: "460W", price: 28000 },
  { brand: "Tata", size: "470W", price: 28500 },
  { brand: "Tata", size: "480W", price: 29000 },
  { brand: "Tata", size: "490W", price: 29500 },
  { brand: "Tata", size: "500W", price: 30000 },
  { brand: "Tata", size: "510W", price: 30500 },
  { brand: "Tata", size: "520W", price: 31000 },
  { brand: "Tata", size: "530W", price: 31500 },
  { brand: "Tata", size: "540W", price: 31800 },
  { brand: "Tata", size: "550W", price: 32000 },
  { brand: "Tata", size: "550W", price: 32200 },
  { brand: "Tata", size: "555W", price: 32500 },
  { brand: "Tata", size: "560W", price: 32800 },
  { brand: "Tata", size: "570W", price: 33200 },
  { brand: "Tata", size: "580W", price: 33600 },
  { brand: "Tata", size: "590W", price: 34000 },
  { brand: "Tata", size: "600W", price: 34500 },
  { brand: "Tata", size: "610W", price: 35000 },
  { brand: "Tata", size: "620W", price: 36000 },
  { brand: "Tata", size: "630W", price: 37000 },
  { brand: "Tata", size: "640W", price: 38000 },
  { brand: "Tata", size: "650W", price: 39000 },
  { brand: "Tata", size: "660W", price: 40000 },
  { brand: "Tata", size: "670W", price: 41000 },
  { brand: "Tata", size: "680W", price: 42000 },
  { brand: "Tata", size: "690W", price: 43000 },
  { brand: "Tata", size: "700W", price: 44000 },
  { brand: "Tata", size: "720W", price: 46000 },
  { brand: "Tata", size: "750W", price: 49000 },

  // Waaree panels - full range
  { brand: "Waaree", size: "320W", price: 17500 },
  { brand: "Waaree", size: "330W", price: 18000 },
  { brand: "Waaree", size: "340W", price: 18500 },
  { brand: "Waaree", size: "350W", price: 19000 },
  { brand: "Waaree", size: "360W", price: 19500 },
  { brand: "Waaree", size: "370W", price: 20000 },
  { brand: "Waaree", size: "380W", price: 20500 },
  { brand: "Waaree", size: "390W", price: 21000 },
  { brand: "Waaree", size: "400W", price: 21500 },
  { brand: "Waaree", size: "410W", price: 22000 },
  { brand: "Waaree", size: "420W", price: 22500 },
  { brand: "Waaree", size: "430W", price: 23000 },
  { brand: "Waaree", size: "440W", price: 24000 },
  { brand: "Waaree", size: "445W", price: 24500 },
  { brand: "Waaree", size: "450W", price: 25000 },
  { brand: "Waaree", size: "455W", price: 25500 },
  { brand: "Waaree", size: "460W", price: 26000 },
  { brand: "Waaree", size: "470W", price: 26500 },
  { brand: "Waaree", size: "480W", price: 27000 },
  { brand: "Waaree", size: "490W", price: 27500 },
  { brand: "Waaree", size: "500W", price: 28000 },
  { brand: "Waaree", size: "510W", price: 28500 },
  { brand: "Waaree", size: "520W", price: 29000 },
  { brand: "Waaree", size: "530W", price: 29500 },
  { brand: "Waaree", size: "540W", price: 29800 },
  { brand: "Waaree", size: "550W", price: 30000 },
  { brand: "Waaree", size: "550W", price: 30200 },
  { brand: "Waaree", size: "555W", price: 30500 },
  { brand: "Waaree", size: "560W", price: 30800 },
  { brand: "Waaree", size: "570W", price: 31200 },
  { brand: "Waaree", size: "580W", price: 31600 },
  { brand: "Waaree", size: "590W", price: 32000 },
  { brand: "Waaree", size: "600W", price: 32500 },
  { brand: "Waaree", size: "610W", price: 33000 },
  { brand: "Waaree", size: "620W", price: 34000 },
  { brand: "Waaree", size: "630W", price: 35000 },
  { brand: "Waaree", size: "640W", price: 36000 },
  { brand: "Waaree", size: "650W", price: 37000 },
  { brand: "Waaree", size: "660W", price: 38000 },
  { brand: "Waaree", size: "670W", price: 39000 },
  { brand: "Waaree", size: "680W", price: 40000 },
  { brand: "Waaree", size: "690W", price: 41000 },
  { brand: "Waaree", size: "700W", price: 42000 },
  { brand: "Waaree", size: "720W", price: 44000 },
  { brand: "Waaree", size: "750W", price: 47000 },

  // Vikram Solar panels - full range
  { brand: "Vikram Solar", size: "320W", price: 18000 },
  { brand: "Vikram Solar", size: "330W", price: 18500 },
  { brand: "Vikram Solar", size: "340W", price: 19000 },
  { brand: "Vikram Solar", size: "350W", price: 19500 },
  { brand: "Vikram Solar", size: "360W", price: 20000 },
  { brand: "Vikram Solar", size: "370W", price: 20500 },
  { brand: "Vikram Solar", size: "380W", price: 21000 },
  { brand: "Vikram Solar", size: "390W", price: 21500 },
  { brand: "Vikram Solar", size: "400W", price: 22000 },
  { brand: "Vikram Solar", size: "410W", price: 22500 },
  { brand: "Vikram Solar", size: "420W", price: 23000 },
  { brand: "Vikram Solar", size: "430W", price: 23500 },
  { brand: "Vikram Solar", size: "440W", price: 24500 },
  { brand: "Vikram Solar", size: "445W", price: 25000 },
  { brand: "Vikram Solar", size: "450W", price: 25500 },
  { brand: "Vikram Solar", size: "455W", price: 26000 },
  { brand: "Vikram Solar", size: "460W", price: 26500 },
  { brand: "Vikram Solar", size: "470W", price: 27000 },
  { brand: "Vikram Solar", size: "480W", price: 27500 },
  { brand: "Vikram Solar", size: "490W", price: 28000 },
  { brand: "Vikram Solar", size: "500W", price: 28500 },
  { brand: "Vikram Solar", size: "510W", price: 29000 },
  { brand: "Vikram Solar", size: "520W", price: 29500 },
  { brand: "Vikram Solar", size: "530W", price: 30000 },
  { brand: "Vikram Solar", size: "540W", price: 30300 },
  { brand: "Vikram Solar", size: "550W", price: 30500 },
  { brand: "Vikram Solar", size: "550W", price: 30700 },
  { brand: "Vikram Solar", size: "555W", price: 31000 },
  { brand: "Vikram Solar", size: "560W", price: 31300 },
  { brand: "Vikram Solar", size: "570W", price: 31700 },
  { brand: "Vikram Solar", size: "580W", price: 32100 },
  { brand: "Vikram Solar", size: "590W", price: 32500 },
  { brand: "Vikram Solar", size: "600W", price: 33000 },
  { brand: "Vikram Solar", size: "610W", price: 33500 },
  { brand: "Vikram Solar", size: "620W", price: 34500 },
  { brand: "Vikram Solar", size: "630W", price: 35500 },
  { brand: "Vikram Solar", size: "640W", price: 36500 },
  { brand: "Vikram Solar", size: "650W", price: 37500 },
  { brand: "Vikram Solar", size: "660W", price: 38500 },
  { brand: "Vikram Solar", size: "670W", price: 39500 },
  { brand: "Vikram Solar", size: "680W", price: 40500 },
  { brand: "Vikram Solar", size: "690W", price: 41500 },
  { brand: "Vikram Solar", size: "700W", price: 42500 },
  { brand: "Vikram Solar", size: "720W", price: 44500 },
  { brand: "Vikram Solar", size: "750W", price: 47500 },

  // RenewSys panels - full range
  { brand: "RenewSys", size: "320W", price: 17000 },
  { brand: "RenewSys", size: "330W", price: 17500 },
  { brand: "RenewSys", size: "340W", price: 18000 },
  { brand: "RenewSys", size: "350W", price: 18500 },
  { brand: "RenewSys", size: "360W", price: 19000 },
  { brand: "RenewSys", size: "370W", price: 19500 },
  { brand: "RenewSys", size: "380W", price: 20000 },
  { brand: "RenewSys", size: "390W", price: 20500 },
  { brand: "RenewSys", size: "400W", price: 21000 },
  { brand: "RenewSys", size: "410W", price: 21500 },
  { brand: "RenewSys", size: "420W", price: 22000 },
  { brand: "RenewSys", size: "430W", price: 22500 },
  { brand: "RenewSys", size: "440W", price: 23500 },
  { brand: "RenewSys", size: "445W", price: 24000 },
  { brand: "RenewSys", size: "450W", price: 24500 },
  { brand: "RenewSys", size: "455W", price: 25000 },
  { brand: "RenewSys", size: "460W", price: 25500 },
  { brand: "RenewSys", size: "470W", price: 26000 },
  { brand: "RenewSys", size: "480W", price: 26500 },
  { brand: "RenewSys", size: "490W", price: 27000 },
  { brand: "RenewSys", size: "500W", price: 27500 },
  { brand: "RenewSys", size: "510W", price: 28000 },
  { brand: "RenewSys", size: "520W", price: 28500 },
  { brand: "RenewSys", size: "530W", price: 29000 },
  { brand: "RenewSys", size: "540W", price: 29300 },
  { brand: "RenewSys", size: "550W", price: 29500 },
  { brand: "RenewSys", size: "550W", price: 29700 },
  { brand: "RenewSys", size: "555W", price: 30000 },
  { brand: "RenewSys", size: "560W", price: 30300 },
  { brand: "RenewSys", size: "570W", price: 30700 },
  { brand: "RenewSys", size: "580W", price: 31100 },
  { brand: "RenewSys", size: "590W", price: 31500 },
  { brand: "RenewSys", size: "600W", price: 32000 },
  { brand: "RenewSys", size: "610W", price: 32500 },
  { brand: "RenewSys", size: "620W", price: 33500 },
  { brand: "RenewSys", size: "630W", price: 34500 },
  { brand: "RenewSys", size: "640W", price: 35500 },
  { brand: "RenewSys", size: "650W", price: 36500 },
  { brand: "RenewSys", size: "660W", price: 37500 },
  { brand: "RenewSys", size: "670W", price: 38500 },
  { brand: "RenewSys", size: "680W", price: 39500 },
  { brand: "RenewSys", size: "690W", price: 40500 },
  { brand: "RenewSys", size: "700W", price: 41500 },
  { brand: "RenewSys", size: "720W", price: 43500 },
  { brand: "RenewSys", size: "750W", price: 46500 },

  // INA panels — DCR package range 500W–600W
  { brand: "INA", size: "500W", price: 27800 },
  { brand: "INA", size: "510W", price: 28200 },
  { brand: "INA", size: "520W", price: 28600 },
  { brand: "INA", size: "530W", price: 29000 },
  { brand: "INA", size: "540W", price: 29400 },
  { brand: "INA", size: "550W", price: 29800 },
  { brand: "INA", size: "560W", price: 30200 },
  { brand: "INA", size: "570W", price: 30600 },
  { brand: "INA", size: "580W", price: 31000 },
  { brand: "INA", size: "590W", price: 31400 },
  { brand: "INA", size: "600W", price: 31800 },

  // Premier Energy panels used by DCR “Crompton set” (600W–610W)
  { brand: "Premier Energy", size: "600W", price: 32800 },
  { brand: "Premier Energy", size: "605W", price: 33000 },
  { brand: "Premier Energy", size: "610W", price: 33200 },
]

export const defaultInverterPricing: InverterPricing[] = [
  { brand: "Crompton", size: "3.6kW", price: 42000 },
  { brand: "Growatt", size: "3kW", price: 35000 },
  { brand: "Growatt", size: "5kW", price: 58000 },
  { brand: "Growatt", size: "6kW", price: 70000 },
  { brand: "Growatt", size: "8kW", price: 93000 },
  { brand: "Growatt", size: "10kW", price: 117000 },
  { brand: "Solis", size: "3kW", price: 32000 },
  { brand: "Solis", size: "5kW", price: 53000 },
  { brand: "Solis", size: "6kW", price: 64000 },
  { brand: "Fronius", size: "3kW", price: 45000 },
  { brand: "Fronius", size: "5kW", price: 75000 },
  { brand: "Fronius", size: "6kW", price: 90000 },
  { brand: "Havells", size: "3kW", price: 38000 },
  { brand: "Havells", size: "5kW", price: 63000 },
  { brand: "Polycab", size: "3kW", price: 36000 },
  { brand: "Polycab", size: "5kW", price: 60000 },
  { brand: "Delta", size: "3kW", price: 40000 },
  { brand: "Delta", size: "5kW", price: 67000 },
]

export const defaultStructurePricing: StructurePricing[] = [
  { type: "GI Structure", size: "1kW", price: 8000 },
  { type: "GI Structure", size: "3kW", price: 24000 },
  { type: "GI Structure", size: "5kW", price: 40000 },
  { type: "GI Structure", size: "10kW", price: 80000 },
  { type: "Aluminum Structure", size: "1kW", price: 10000 },
  { type: "Aluminum Structure", size: "3kW", price: 30000 },
  { type: "Aluminum Structure", size: "5kW", price: 50000 },
  { type: "MS Structure", size: "1kW", price: 9000 },
  { type: "MS Structure", size: "3kW", price: 27000 },
  { type: "MS Structure", size: "5kW", price: 45000 },
]

export const defaultMeterPricing: MeterPricing[] = [
  { brand: "L&T", price: 5000 },
  { brand: "HPL", price: 4800 },
  { brand: "Havells", price: 5200 },
  { brand: "Genus", price: 4900 },
  { brand: "Secure", price: 5100 },
]

export const defaultCablePricing: CablePricing[] = [
  { brand: "Polycab", size: "4 sq mm", type: "AC", price: 3000 },
  { brand: "Polycab", size: "6 sq mm", type: "AC", price: 3500 },
  { brand: "Polycab", size: "4 sq mm", type: "DC", price: 3000 },
  { brand: "Polycab", size: "6 sq mm", type: "DC", price: 3500 },
  { brand: "Havells", size: "4 sq mm", type: "AC", price: 3200 },
  { brand: "Havells", size: "6 sq mm", type: "AC", price: 3800 },
  { brand: "Havells", size: "4 sq mm", type: "DC", price: 3200 },
  { brand: "KEI", size: "4 sq mm", type: "DC", price: 3100 },
  { brand: "KEI", size: "6 sq mm", type: "DC", price: 3600 },
  { brand: "Finolex", size: "6 sq mm", type: "AC", price: 3400 },
  { brand: "RR Kabel", size: "6 sq mm", type: "AC", price: 3600 },
  { brand: "RR Kabel", size: "10 sq mm", type: "AC", price: 4500 },
]

export const defaultACDBPricing: ACDBPricing[] = [
  // 1-Phase ACDB
  { brand: "Havells+Elmex", phase: "1-Phase", price: 2500 },
  { brand: "L&T", phase: "1-Phase", price: 2800 },
  { brand: "Polycab", phase: "1-Phase", price: 2300 },
  { brand: "HPL", phase: "1-Phase", price: 2400 },
  { brand: "Crompton", phase: "1-Phase", price: 2500 },
  // 3-Phase ACDB
  { brand: "Havells+Elmex", phase: "3-Phase", price: 5000 },
  { brand: "L&T", phase: "3-Phase", price: 5500 },
  { brand: "Polycab", phase: "3-Phase", price: 4800 },
  { brand: "HPL", phase: "3-Phase", price: 4900 },
  { brand: "Crompton", phase: "3-Phase", price: 5000 },
]

export const defaultDCDBPricing: DCDBPricing[] = [
  // 1-Phase DCDB
  { brand: "Elmex", phase: "1-Phase", price: 2500 },
  { brand: "L&T", phase: "1-Phase", price: 2800 },
  { brand: "Polycab", phase: "1-Phase", price: 2300 },
  { brand: "HPL", phase: "1-Phase", price: 2400 },
  { brand: "Crompton", phase: "1-Phase", price: 2500 },
  // 3-Phase DCDB
  { brand: "Elmex", phase: "3-Phase", price: 5000 },
  { brand: "L&T", phase: "3-Phase", price: 5500 },
  { brand: "Polycab", phase: "3-Phase", price: 4800 },
  { brand: "HPL", phase: "3-Phase", price: 4900 },
  { brand: "Crompton", phase: "3-Phase", price: 5000 },
]

// Helper function to get available panel sizes from pricing tables
export function getAvailablePanelSizes(pricingData?: PricingTablesData): string[] {
  const data = pricingData || getPricingData()
  const pricingTable = data.panels || defaultPanelPricing
  
  // Extract unique panel sizes from pricing table
  const sizes = new Set<string>()
  pricingTable.forEach((panel) => {
    if (panel.size) {
      sizes.add(panel.size)
    }
  })
  
  // Return sorted sizes
  return Array.from(sizes).sort((a, b) => {
    const aSize = Number.parseInt(a.replace("W", "")) || 0
    const bSize = Number.parseInt(b.replace("W", "")) || 0
    return aSize - bSize
  })
}

// Helper function to get available structure sizes from pricing tables
export function getAvailableStructureSizes(pricingData?: PricingTablesData): string[] {
  const data = pricingData || getPricingData()
  const pricingTable = data.structures || defaultStructurePricing
  
  // Extract unique structure sizes from pricing table
  const sizes = new Set<string>()
  pricingTable.forEach((structure) => {
    if (structure.size) {
      sizes.add(structure.size)
    }
  })
  
  // Return sorted sizes
  return Array.from(sizes).sort((a, b) => {
    const aSize = Number.parseInt(a.replace("kW", "")) || 0
    const bSize = Number.parseInt(b.replace("kW", "")) || 0
    return aSize - bSize
  })
}

// Default System Configuration Presets
// These define default product selections for each system type, size, and panel brand
// Each preset matches the pricing table entries (lines 372-515) with fixed component configurations
// When a user selects a configuration, all product selection fields are auto-filled
export const defaultSystemConfigs: SystemConfigurationPreset[] = [
  // ========== DCR SYSTEMS (1-Phase) ==========
  // Adani DCR 1-Phase
  { systemType: "dcr", systemSize: "3kW", phase: "1-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "3kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "3kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "4kW", phase: "1-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "4kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "5kW", phase: "1-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "5kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "6kW", phase: "1-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "6kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "6kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)", centralSubsidy: 78000 },
  // Waaree DCR 1-Phase
  { systemType: "dcr", systemSize: "3kW", phase: "1-Phase", panelBrand: "Waaree", panelSize: "540W", inverterBrand: "Vsole/Xwatt", inverterSize: "3kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "3kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "4kW", phase: "1-Phase", panelBrand: "Waaree", panelSize: "540W", inverterBrand: "Vsole/Xwatt", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "4kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "5kW", phase: "1-Phase", panelBrand: "Waaree", panelSize: "540W", inverterBrand: "Vsole/Xwatt", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "5kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "6kW", phase: "1-Phase", panelBrand: "Waaree", panelSize: "540W", inverterBrand: "Vsole/Xwatt", inverterSize: "6kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "6kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)", centralSubsidy: 78000 },
  
  // Tata DCR 1-Phase (Jun 2026 — panel + inverter as per the set)
  { systemType: "dcr", systemSize: "3.1kW", phase: "1-Phase", panelBrand: "Tata", panelSize: "As per the set", inverterBrand: "As per the set", inverterSize: "As per the set", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "3.1kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "5.1kW", phase: "1-Phase", panelBrand: "Tata", panelSize: "As per the set", inverterBrand: "As per the set", inverterSize: "As per the set", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "5.1kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "6kW", phase: "1-Phase", panelBrand: "Tata", panelSize: "As per the set", inverterBrand: "As per the set", inverterSize: "As per the set", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "6kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)", centralSubsidy: 78000 },

  // Crompton set (DCR, 1-Phase) — Premier Energy 600–610W panels, Crompton 3.6kW inverter + ACDB/DCDB
  { systemType: "dcr", systemSize: "3kW", phase: "1-Phase", panelBrand: "Crompton set", panelSize: "610W", inverterBrand: "Crompton", inverterSize: "3.6kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "3kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Crompton (1-Phase)", dcdb: "Crompton (1-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "5kW", phase: "1-Phase", panelBrand: "Crompton set", panelSize: "610W", inverterBrand: "Crompton", inverterSize: "3.6kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "5kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Crompton (1-Phase)", dcdb: "Crompton (1-Phase)", centralSubsidy: 78000 },
  
  // ========== DCR SYSTEMS (3-Phase) ==========
  // Adani DCR 3-Phase
  { systemType: "dcr", systemSize: "3kW", phase: "3-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "3kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "4kW", phase: "3-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "4kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "5kW", phase: "3-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "5kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "6kW", phase: "3-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "6kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "6kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "7kW", phase: "3-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "8kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "7kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "8kW", phase: "3-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "8kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "8kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "10kW", phase: "3-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "10kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "10kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "12kW", phase: "3-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "12kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "12kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "15kW", phase: "3-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "15kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "15kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "20kW", phase: "3-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "20kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "20kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "25kW", phase: "3-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "25kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "25kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "30kW", phase: "3-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "30kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "30kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  
  // Waaree DCR 3-Phase
  { systemType: "dcr", systemSize: "3kW", phase: "3-Phase", panelBrand: "Waaree", panelSize: "540W", inverterBrand: "Vsole/Xwatt", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "3kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "4kW", phase: "3-Phase", panelBrand: "Waaree", panelSize: "540W", inverterBrand: "Vsole/Xwatt", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "4kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "5kW", phase: "3-Phase", panelBrand: "Waaree", panelSize: "540W", inverterBrand: "Vsole/Xwatt", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "5kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "6kW", phase: "3-Phase", panelBrand: "Waaree", panelSize: "540W", inverterBrand: "Vsole/Xwatt", inverterSize: "6kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "6kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "7kW", phase: "3-Phase", panelBrand: "Waaree", panelSize: "540W", inverterBrand: "Vsole/Xwatt", inverterSize: "8kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "7kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "8kW", phase: "3-Phase", panelBrand: "Waaree", panelSize: "540W", inverterBrand: "Vsole/Xwatt", inverterSize: "8kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "8kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "10kW", phase: "3-Phase", panelBrand: "Waaree", panelSize: "540W", inverterBrand: "Vsole/Xwatt", inverterSize: "10kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "10kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "12kW", phase: "3-Phase", panelBrand: "Waaree", panelSize: "540W", inverterBrand: "Vsole/Xwatt", inverterSize: "12kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "12kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "15kW", phase: "3-Phase", panelBrand: "Waaree", panelSize: "540W", inverterBrand: "Vsole/Xwatt", inverterSize: "15kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "15kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "20kW", phase: "3-Phase", panelBrand: "Waaree", panelSize: "540W", inverterBrand: "Vsole/Xwatt", inverterSize: "20kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "20kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "25kW", phase: "3-Phase", panelBrand: "Waaree", panelSize: "540W", inverterBrand: "Vsole/Xwatt", inverterSize: "25kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "25kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "30kW", phase: "3-Phase", panelBrand: "Waaree", panelSize: "540W", inverterBrand: "Vsole/Xwatt", inverterSize: "30kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "30kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  
  // Tata DCR 3-Phase (Jun 2026)
  { systemType: "dcr", systemSize: "5.1kW", phase: "3-Phase", panelBrand: "Tata", panelSize: "As per the set", inverterBrand: "As per the set", inverterSize: "As per the set", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "5.1kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "6kW", phase: "3-Phase", panelBrand: "Tata", panelSize: "As per the set", inverterBrand: "As per the set", inverterSize: "As per the set", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "6kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "8kW", phase: "3-Phase", panelBrand: "Tata", panelSize: "As per the set", inverterBrand: "As per the set", inverterSize: "As per the set", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "8kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  { systemType: "dcr", systemSize: "10kW", phase: "3-Phase", panelBrand: "Tata", panelSize: "As per the set", inverterBrand: "As per the set", inverterSize: "As per the set", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "10kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)", centralSubsidy: 78000 },
  
  // ========== NON DCR SYSTEMS (1-Phase) ==========
  // Adani NON DCR 1-Phase
  { systemType: "non-dcr", systemSize: "3kW", phase:"1-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "3kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "3kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)" },
  { systemType: "non-dcr", systemSize: "4kW", phase:"1-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "4kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)" },
  { systemType: "non-dcr", systemSize: "5kW", phase:"1-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "5kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)" },
  { systemType: "non-dcr", systemSize: "6kW", phase:"1-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "6kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "6kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)" },
  
  // Waaree NON DCR 1-Phase
  { systemType: "non-dcr", systemSize: "3kW", phase:"1-Phase", panelBrand: "Waaree", panelSize: "540W", inverterBrand: "Vsole/Xwatt", inverterSize: "3kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "3kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)" },
  { systemType: "non-dcr", systemSize: "4kW", phase:"1-Phase", panelBrand: "Waaree", panelSize: "540W", inverterBrand: "Vsole/Xwatt", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "4kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)" },
  { systemType: "non-dcr", systemSize: "5kW", phase:"1-Phase", panelBrand: "Waaree", panelSize: "540W", inverterBrand: "Vsole/Xwatt", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "5kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)" },
  { systemType: "non-dcr", systemSize: "6kW", phase:"1-Phase", panelBrand: "Waaree", panelSize: "540W", inverterBrand: "Vsole/Xwatt", inverterSize: "6kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "6kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)" },
  
  // Tata NON DCR 1-Phase
  { systemType: "non-dcr", systemSize: "3kW", phase:"1-Phase", panelBrand: "Tata", panelSize: "610W", inverterBrand: "GoodWe", inverterSize: "3kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "3kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)" },
  { systemType: "non-dcr", systemSize: "4kW", phase:"1-Phase", panelBrand: "Tata", panelSize: "610W", inverterBrand: "GoodWe", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "4kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)" },
  { systemType: "non-dcr", systemSize: "5kW", phase:"1-Phase", panelBrand: "Tata", panelSize: "610W", inverterBrand: "GoodWe", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "5kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)" },
  { systemType: "non-dcr", systemSize: "6kW", phase:"1-Phase", panelBrand: "Tata", panelSize: "610W", inverterBrand: "GoodWe", inverterSize: "6kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "6kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (1-Phase)", dcdb: "Elmex (1-Phase)" },
  
  // ========== NON DCR SYSTEMS (3-Phase) ==========
  // Adani NON DCR 3-Phase
  { systemType: "non-dcr", systemSize: "3kW", phase:"3-Phase", panelBrand: "Adani", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "3kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "4kW", phase:"3-Phase", panelBrand: "Adani", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "4kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "5kW", phase:"3-Phase", panelBrand: "Adani", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "5kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "6kW", phase:"3-Phase", panelBrand: "Adani", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "6kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "6kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "7kW", phase:"3-Phase", panelBrand: "Adani", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "8kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "7kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "8kW", phase:"3-Phase", panelBrand: "Adani", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "8kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "8kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "10kW", phase:"3-Phase", panelBrand: "Adani", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "10kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "10kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "12kW", phase:"3-Phase", panelBrand: "Adani", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "12kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "12kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "15kW", phase:"3-Phase", panelBrand: "Adani", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "15kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "15kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "20kW", phase:"3-Phase", panelBrand: "Adani", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "20kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "20kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "25kW", phase:"3-Phase", panelBrand: "Adani", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "25kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "25kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "30kW", phase:"3-Phase", panelBrand: "Adani", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "30kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "30kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "80kW", phase:"3-Phase", panelBrand: "Adani", panelSize: "600W", inverterBrand: "Vsole/Xwatt", inverterSize: "80kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "80kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  
  // Waaree NON DCR 3-Phase
  { systemType: "non-dcr", systemSize: "3kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "3kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "4kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "4kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "5kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "5kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "6kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "6kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "6kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "7kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "8kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "7kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "8kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "8kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "8kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "10kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "10kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "10kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "12kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "12kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "12kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "15kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "15kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "15kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "20kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "20kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "20kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "25kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "25kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "25kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "30kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "550W", inverterBrand: "Vsole/Xwatt", inverterSize: "30kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "30kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "80kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "580W", inverterBrand: "Vsole/Xwatt", inverterSize: "80kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "80kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "125kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "580W", inverterBrand: "Vsole/Xwatt", inverterSize: "125kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "125kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  
  // Renew Energy NON DCR 3-Phase (80kW Vsole/Xwatt set)
  { systemType: "non-dcr", systemSize: "80kW", phase:"3-Phase", panelBrand: "Renew Energy", panelSize: "600W", inverterBrand: "Vsole/Xwatt", inverterSize: "80kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "80kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  
  // Tata NON DCR 3-Phase
  { systemType: "non-dcr", systemSize: "3kW", phase:"3-Phase", panelBrand: "Tata", panelSize: "550W", inverterBrand: "GoodWe", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "3kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "4kW", phase:"3-Phase", panelBrand: "Tata", panelSize: "550W", inverterBrand: "GoodWe", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "4kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "5kW", phase:"3-Phase", panelBrand: "Tata", panelSize: "550W", inverterBrand: "GoodWe", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "5kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "6kW", phase:"3-Phase", panelBrand: "Tata", panelSize: "610W", inverterBrand: "GoodWe", inverterSize: "6kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "6kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "7kW", phase:"3-Phase", panelBrand: "Tata", panelSize: "610W", inverterBrand: "GoodWe", inverterSize: "8kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "7kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "8kW", phase:"3-Phase", panelBrand: "Tata", panelSize: "610W", inverterBrand: "GoodWe", inverterSize: "8kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "8kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "10kW", phase:"3-Phase", panelBrand: "Tata", panelSize: "610W", inverterBrand: "GoodWe", inverterSize: "10kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "10kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "12kW", phase:"3-Phase", panelBrand: "Tata", panelSize: "610W", inverterBrand: "GoodWe", inverterSize: "12kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "12kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "15kW", phase:"3-Phase", panelBrand: "Tata", panelSize: "610W", inverterBrand: "GoodWe", inverterSize: "15kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "15kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "20kW", phase:"3-Phase", panelBrand: "Tata", panelSize: "610W", inverterBrand: "GoodWe", inverterSize: "20kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "20kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "25kW", phase:"3-Phase", panelBrand: "Tata", panelSize: "610W", inverterBrand: "GoodWe", inverterSize: "25kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "25kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "non-dcr", systemSize: "30kW", phase:"3-Phase", panelBrand: "Tata", panelSize: "610W", inverterBrand: "GoodWe", inverterSize: "30kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "30kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  
  // ========== BOTH SYSTEMS (DCR + NON DCR) - 3-Phase Only ==========
  // Adani BOTH 3-Phase
  { systemType: "both", systemSize: "5kW", phase:"3-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "5kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "both", systemSize: "6kW", phase:"3-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "6kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "6kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "both", systemSize: "8kW", phase:"3-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "8kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "8kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "both", systemSize: "10kW", phase:"3-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "10kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "10kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "both", systemSize: "12kW", phase:"3-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "12kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "12kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "both", systemSize: "15kW", phase:"3-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "15kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "15kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "both", systemSize: "20kW", phase:"3-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "20kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "20kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "both", systemSize: "25kW", phase:"3-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "25kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "25kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "both", systemSize: "30kW", phase:"3-Phase", panelBrand: "Adani", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "30kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "30kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  
  // Waaree BOTH 3-Phase
  { systemType: "both", systemSize: "5kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "5kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "5kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "both", systemSize: "6kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "6kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "6kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "both", systemSize: "8kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "8kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "8kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "both", systemSize: "10kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "10kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "10kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "both", systemSize: "12kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "12kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "12kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "both", systemSize: "15kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "15kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "15kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "both", systemSize: "20kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "20kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "20kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "both", systemSize: "25kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "25kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "25kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
  { systemType: "both", systemSize: "30kW", phase:"3-Phase", panelBrand: "Waaree", panelSize: "555W", inverterBrand: "Vsole/Xwatt", inverterSize: "30kW", inverterType: "String Inverter", structureType: "GI Structure", structureSize: "30kW", meterBrand: "L&T", acCableBrand: "Polycab", acCableSize: "As per Set", dcCableBrand: "Polycab", dcCableSize: "As per Set", acdb: "Havells+Elmex (3-Phase)", dcdb: "Elmex (3-Phase)" },
]

function systemConfigPresetKey(config: SystemConfigurationPreset): string {
  return `${config.systemType}|${config.systemSize}|${config.phase ?? ""}|${config.panelBrand}`
}

/** Merge API presets with local defaults; keep canonical DCR panel sizes (555W, 540W, etc.). */
export function mergeSystemConfigsWithDefaults(
  apiConfigs?: SystemConfigurationPreset[],
): SystemConfigurationPreset[] {
  if (!apiConfigs?.length) return defaultSystemConfigs

  const byKey = new Map<string, SystemConfigurationPreset>()
  for (const preset of defaultSystemConfigs) {
    byKey.set(systemConfigPresetKey(preset), preset)
  }

  for (const apiPreset of apiConfigs) {
    const key = systemConfigPresetKey(apiPreset)
    const base = byKey.get(key)
    if (!base) {
      byKey.set(key, apiPreset)
      continue
    }

    const merged: SystemConfigurationPreset = { ...base, ...apiPreset }
    if (!apiPreset.acdb?.trim()) merged.acdb = base.acdb
    if (!apiPreset.dcdb?.trim()) merged.dcdb = base.dcdb
    if (apiPreset.systemType === "dcr") {
      const pricingType = resolveDcrPricingPanelType(apiPreset.panelBrand)
      const canonicalSize = dcrPanelSizeForPricingType(pricingType)
      if (canonicalSize !== DCR_AS_PER_THE_SET) {
        merged.panelSize = canonicalSize
      }
      // Keep Crompton set as the preset key; form maps to Premier Energy on select.
      merged.panelBrand =
        pricingType === CROMPTON_DCR_SET_NAME
          ? CROMPTON_DCR_SET_NAME
          : dcrFormPanelBrandForPricingType(pricingType)
    }
    byKey.set(key, merged)
  }

  return Array.from(byKey.values())
}

function nonDcrPricingRowKey(row: SystemPricing): string {
  return [
    String(row.systemSize || "").trim().toLowerCase(),
    String(row.phase || "").trim().toLowerCase(),
    String(row.inverterSize || "").trim().toLowerCase(),
    String(row.panelType || "").trim().toLowerCase(),
  ].join("|")
}

/**
 * Keep API Non-DCR rows, and append local FE packages the API does not have yet
 * (e.g. Waaree 125kW @ ₹35,62,500).
 */
export function mergeNonDcrPricingWithDefaults(apiRows?: SystemPricing[]): SystemPricing[] {
  if (!apiRows?.length) return nonDcrPricing

  const byKey = new Map<string, SystemPricing>()
  for (const row of apiRows) {
    byKey.set(nonDcrPricingRowKey(row), row)
  }
  for (const local of nonDcrPricing) {
    const key = nonDcrPricingRowKey(local)
    if (!byKey.has(key)) byKey.set(key, local)
  }
  return Array.from(byKey.values())
}

// Function to get current pricing data (API or fallback)
export function getPricingData(): PricingTablesData {
  if (!apiPricingData) {
    return {
      dcr: dcrPricing,
      nonDcr: nonDcrPricing,
      both: bothPricing,
      panels: defaultPanelPricing,
      inverters: defaultInverterPricing,
      structures: defaultStructurePricing,
      meters: defaultMeterPricing,
      cables: defaultCablePricing,
      acdb: defaultACDBPricing,
      dcdb: defaultDCDBPricing,
      systemConfigs: defaultSystemConfigs,
    }
  }

  return {
    ...apiPricingData,
    dcr: apiPricingData.dcr?.length ? apiPricingData.dcr : dcrPricing,
    nonDcr: mergeNonDcrPricingWithDefaults(apiPricingData.nonDcr),
    both: apiPricingData.both?.length ? apiPricingData.both : bothPricing,
    panels: apiPricingData.panels?.length ? apiPricingData.panels : defaultPanelPricing,
    inverters: apiPricingData.inverters?.length ? apiPricingData.inverters : defaultInverterPricing,
    structures: apiPricingData.structures?.length ? apiPricingData.structures : defaultStructurePricing,
    meters: apiPricingData.meters?.length ? apiPricingData.meters : defaultMeterPricing,
    cables: apiPricingData.cables?.length ? apiPricingData.cables : defaultCablePricing,
    acdb: apiPricingData.acdb?.length ? apiPricingData.acdb : defaultACDBPricing,
    dcdb: apiPricingData.dcdb?.length ? apiPricingData.dcdb : defaultDCDBPricing,
    systemConfigs: mergeSystemConfigsWithDefaults(apiPricingData.systemConfigs),
  }
}

// Function to get system configuration preset
// Returns default product selections for a given system type, size, and panel brand
export function getSystemConfiguration(
  systemType: "dcr" | "non-dcr" | "both",
  systemSize: string,
  panelBrand: string,
  pricingData?: PricingTablesData,
  phase?: "1-Phase" | "3-Phase",
): SystemConfigurationPreset | null {
  const data = pricingData || getPricingData()
  const configs = mergeSystemConfigsWithDefaults(data.systemConfigs)

  const rawBrand = panelBrand.trim()
  const pricingType = systemType === "dcr" ? resolveDcrPricingPanelType(rawBrand) : ""
  // DCR packages map browse columns → form brands; Non-DCR keeps catalog brands (e.g. Renew Energy).
  const brandKey =
    systemType === "dcr"
      ? dcrFormPanelBrandForPricingType(pricingType)
      : rawBrand.toLowerCase().includes("renew")
        ? "Renew Energy"
        : rawBrand
  // Crompton presets stay keyed as "Crompton set"; form brand is Premier Energy.
  const lookupBrand =
    systemType === "dcr" && pricingType === CROMPTON_DCR_SET_NAME
      ? CROMPTON_DCR_SET_NAME
      : brandKey

  // Exact match — include phase when provided (e.g. 6kW Tata 1-Phase vs 3-Phase)
  let config: SystemConfigurationPreset | undefined
  if (phase) {
    config = configs.find(
      (c) =>
        c.systemType === systemType &&
        c.systemSize === systemSize &&
        c.panelBrand === lookupBrand &&
        c.phase === phase,
    )
  }
  if (!config) {
    config = configs.find(
      (c) => c.systemType === systemType && c.systemSize === systemSize && c.panelBrand === lookupBrand,
    )
  }

  // DCR: same structure/meter preset may be shared across panel columns — match size + phase only
  if (!config && systemType === "dcr") {
    config = configs.find(
      (c) =>
        c.systemType === systemType &&
        c.systemSize === systemSize &&
        (!phase || c.phase === phase),
    )
  }

  if (!config) return null

  if (systemType === "dcr") {
    const canonicalSize = dcrPanelSizeForPricingType(pricingType)
    return {
      ...config,
      panelBrand: brandKey,
      ...(canonicalSize !== DCR_AS_PER_THE_SET ? { panelSize: canonicalSize } : {}),
    }
  }

  return config
}

// System Configuration Dropdown Option
export interface SystemConfigOption {
  id: string // Unique identifier for the config
  label: string // Display label for dropdown
  value: SystemConfigurationPreset // The actual configuration
}

// Function to get all available system configurations as dropdown options
// Returns formatted options that can be used in a Select component
export function getSystemConfigOptions(
  pricingData?: PricingTablesData
): SystemConfigOption[] {
  const data = pricingData || getPricingData()
  const configs = data.systemConfigs || defaultSystemConfigs
  
  return configs.map((config, index) => {
    // Create a readable label for the dropdown
    const systemTypeLabel = config.systemType === "dcr" 
      ? "DCR" 
      : config.systemType === "non-dcr" 
      ? "NON DCR" 
      : "BOTH"
    
    const label = `${systemTypeLabel} - ${config.systemSize} - ${config.panelBrand} (${config.panelSize}, ${config.inverterBrand} ${config.inverterSize})`
    
    return {
      id: `config-${config.systemType}-${config.systemSize}-${config.panelBrand}-${index}`,
      label,
      value: config,
    }
  })
}

// Function to get system configurations filtered by system type
export function getSystemConfigOptionsByType(
  systemType: "dcr" | "non-dcr" | "both",
  pricingData?: PricingTablesData
): SystemConfigOption[] {
  const allOptions = getSystemConfigOptions(pricingData)
  return allOptions.filter((option) => option.value.systemType === systemType)
}

// Function to get system configurations filtered by panel brand
export function getSystemConfigOptionsByBrand(
  panelBrand: string,
  pricingData?: PricingTablesData
): SystemConfigOption[] {
  const allOptions = getSystemConfigOptions(pricingData)
  return allOptions.filter((option) => option.value.panelBrand === panelBrand)
}

// Function to convert system configuration preset to ProductSelection format
// This can be used to auto-populate form fields
export function configToProductSelection(
  config: SystemConfigurationPreset,
  panelQuantity?: number
): Partial<import("./quotation-context").ProductSelection> {
  // Calculate panel quantity if not provided — never exceed nominal package kW
  let calculatedQuantity = panelQuantity || 0
  if (calculatedQuantity === 0) {
    const systemKw = Number.parseFloat(config.systemSize.replace("kW", ""))
    calculatedQuantity = panelQuantityForNominalSystemKw(systemKw, config.panelSize)
  }
  
  return {
    systemType: config.systemType,
    phase: config.phase,
    panelBrand: config.panelBrand,
    panelSize: config.panelSize,
    panelQuantity: calculatedQuantity,
    inverterType: config.inverterType,
    inverterBrand: config.inverterBrand,
    inverterSize: config.inverterSize,
    structureType: config.structureType,
    structureSize: config.structureSize,
    meterBrand: config.meterBrand,
    acCableBrand: config.acCableBrand,
    acCableSize: config.acCableSize,
    dcCableBrand: config.dcCableBrand,
    dcCableSize: config.dcCableSize,
    acdb: config.acdb,
    dcdb: config.dcdb,
    earthingWireSize: config.earthingWireSize || "As per Set",
    earthingWireBrand: config.earthingWireBrand || "JMP",
    // Include subsidies if present in config
    ...(config.centralSubsidy !== undefined && { centralSubsidy: config.centralSubsidy }),
    ...(config.stateSubsidy !== undefined && { stateSubsidy: config.stateSubsidy }),
  }
}

// Function to find system configuration by ID (from dropdown selection)
export function getSystemConfigById(
  configId: string,
  pricingData?: PricingTablesData
): SystemConfigurationPreset | null {
  const options = getSystemConfigOptions(pricingData)
  const option = options.find((opt) => opt.id === configId)
  return option ? option.value : null
}

/** DCR package pricing — effective 04 Aug 2026, valid till 31 Aug 2026 */
export const DCR_PRICING_EFFECTIVE_FROM = "2026-08-04"
export const DCR_PRICING_VALID_TILL = "2026-08-31"

/** Inverter / panel size on package sheets (Tata and catalog display). */
export const DCR_AS_PER_THE_SET = "As per the set"

export const DCR_PRICING_PANEL_TYPES = [
  "Adani",
  "Adani Topcon",
  "Waaree",
  "Waaree Topcon",
  "Premier Energies",
  "INA",
  "Tata",
  "Crompton set",
] as const

/** INA DCR packages: auto-pick panel size within 500W–600W per nominal kW slab. */
export const INA_DCR_PANEL_SIZES_WATTS = [
  600, 590, 580, 570, 560, 550, 540, 530, 520, 510, 500,
] as const

/** Crompton set (DCR): Premier Energy panels within 600W–610W. */
export const CROMPTON_SET_PANEL_SIZES_WATTS = [610, 605, 600] as const

/** Display / package name for the Crompton DCR column. */
export const CROMPTON_DCR_SET_NAME = "Crompton set"

function dcrInverterSizeForPackage(systemSize: string, phase: "1-Phase" | "3-Phase"): string {
  const kw = Number.parseFloat(systemSize.replace(/kW/i, ""))
  if (Number.isNaN(kw)) return systemSize
  if (phase === "1-Phase") return systemSize
  if (kw <= 4) return "5kW"
  if (kw === 7) return "8kW"
  return systemSize
}

type DcrPricingMatrixRow = {
  systemSize: string
  phase: "1-Phase" | "3-Phase"
  adani555?: number
  adaniTopcon620?: number
  waaree540?: number
  waareeTopcon610?: number
  premierTopcon?: number
  ina?: number
}

/** Tata DCR — Jun 2026 sheet (inverter + panel type as per the set). */
const DCR_TATA_PRICING_ROWS: { systemSize: string; phase: "1-Phase" | "3-Phase"; tata: number }[] = [
  { systemSize: "3.1kW", phase: "1-Phase", tata: 220000 },
  { systemSize: "5.1kW", phase: "1-Phase", tata: 310000 },
  { systemSize: "5.1kW", phase: "3-Phase", tata: 335000 },
  { systemSize: "6kW", phase: "1-Phase", tata: 360000 },
  { systemSize: "6kW", phase: "3-Phase", tata: 380000 },
  { systemSize: "8kW", phase: "3-Phase", tata: 470000 },
  { systemSize: "10kW", phase: "3-Phase", tata: 550000 },
]

/** Crompton set — DCR 1-Phase only (Premier Energy 600–610W + Crompton 3.6kW). */
const DCR_CROMPTON_SET_PRICING_ROWS: {
  systemSize: string
  phase: "1-Phase"
  price: number
}[] = [
  { systemSize: "3kW", phase: "1-Phase", price: 210000 },
  { systemSize: "5kW", phase: "1-Phase", price: 295000 },
]

/** Aug 2026 sheet for Adani / Adani Topcon / Waaree / Waaree Topcon; other brands keep prior package prices. */
const DCR_PRICING_MATRIX: DcrPricingMatrixRow[] = [
  {
    systemSize: "3kW",
    phase: "1-Phase",
    adani555: 186000,
    adaniTopcon620: 190000,
    waaree540: 185000,
    waareeTopcon610: 190000,
    premierTopcon: 189000,
  },
  {
    systemSize: "3kW",
    phase: "3-Phase",
    adani555: 221000,
    adaniTopcon620: 221000,
    waaree540: 215000,
    waareeTopcon610: 221000,
    premierTopcon: 221000,
  },
  { systemSize: "4kW", phase: "1-Phase", premierTopcon: 250000 },
  { systemSize: "4kW", phase: "3-Phase", premierTopcon: 270000 },
  {
    systemSize: "5kW",
    phase: "1-Phase",
    adani555: 272000,
    adaniTopcon620: 280000,
    waaree540: 270000,
    waareeTopcon610: 280000,
    premierTopcon: 272000,
  },
  {
    systemSize: "5kW",
    phase: "3-Phase",
    adani555: 299000,
    adaniTopcon620: 305000,
    waaree540: 299000,
    waareeTopcon610: 305000,
    premierTopcon: 289000,
  },
  {
    systemSize: "6kW",
    phase: "1-Phase",
    adani555: 310000,
    adaniTopcon620: 320000,
    waaree540: 305000,
    waareeTopcon610: 320000,
    premierTopcon: 299000,
  },
  {
    systemSize: "6kW",
    phase: "3-Phase",
    adani555: 330000,
    adaniTopcon620: 340000,
    waaree540: 320000,
    waareeTopcon610: 340000,
    premierTopcon: 330000,
  },
  { systemSize: "7kW", phase: "3-Phase", premierTopcon: 370000 },
  {
    systemSize: "8kW",
    phase: "3-Phase",
    adani555: 425000,
    adaniTopcon620: 435000,
    waaree540: 405000,
    waareeTopcon610: 435000,
    premierTopcon: 412000,
  },
  {
    systemSize: "10kW",
    phase: "3-Phase",
    adani555: 499000,
    adaniTopcon620: 515000,
    waaree540: 480000,
    waareeTopcon610: 515000,
    premierTopcon: 474000,
  },
  {
    systemSize: "12kW",
    phase: "3-Phase",
    adani555: 595000,
    adaniTopcon620: 625000,
    waaree540: 570000,
    waareeTopcon610: 625000,
  },
  {
    systemSize: "15kW",
    phase: "3-Phase",
    adani555: 710000,
    adaniTopcon620: 740000,
    waaree540: 680000,
    waareeTopcon610: 740000,
  },
  { systemSize: "20kW", phase: "3-Phase", adani555: 940000, adaniTopcon620: 995000, waaree540: 900000 },
  { systemSize: "25kW", phase: "3-Phase", adani555: 1145000, adaniTopcon620: 1210000, waaree540: 1090000 },
  { systemSize: "30kW", phase: "3-Phase", adani555: 1350000, adaniTopcon620: 1420000, waaree540: 1350000 },
  { systemSize: "40kW", phase: "3-Phase", adani555: 1760000, adaniTopcon620: 1870000, waaree540: 1760000 },
  { systemSize: "50kW", phase: "3-Phase", adani555: 2150000, adaniTopcon620: 2280000, waaree540: 2150000, premierTopcon: 2010000 },
  { systemSize: "60kW", phase: "3-Phase", adani555: 2600000, adaniTopcon620: 2760000, waaree540: 2600000 },
  { systemSize: "80kW", phase: "3-Phase", adani555: 3450000, adaniTopcon620: 3660000, waaree540: 3450000 },
  { systemSize: "100kW", phase: "3-Phase", adani555: 4200000, adaniTopcon620: 4465000, waaree540: 4200000 },
]

function buildDcrPricingFromMatrix(): SystemPricing[] {
  const out: SystemPricing[] = []
  for (const row of DCR_PRICING_MATRIX) {
    const inverterSize = dcrInverterSizeForPackage(row.systemSize, row.phase)
    const base = { systemSize: row.systemSize, phase: row.phase, inverterSize }
    if (row.adani555 != null) out.push({ ...base, panelType: "Adani", price: row.adani555 })
    if (row.adaniTopcon620 != null) out.push({ ...base, panelType: "Adani Topcon", price: row.adaniTopcon620 })
    if (row.waaree540 != null) out.push({ ...base, panelType: "Waaree", price: row.waaree540 })
    if (row.waareeTopcon610 != null) out.push({ ...base, panelType: "Waaree Topcon", price: row.waareeTopcon610 })
    if (row.premierTopcon != null) out.push({ ...base, panelType: "Premier Energies", price: row.premierTopcon })
    const inaPrice = row.ina ?? row.premierTopcon
    if (inaPrice != null) out.push({ ...base, panelType: "INA", price: inaPrice })
  }
  for (const row of DCR_TATA_PRICING_ROWS) {
    out.push({
      systemSize: row.systemSize,
      phase: row.phase,
      inverterSize: DCR_AS_PER_THE_SET,
      panelType: "Tata",
      price: row.tata,
    })
  }
  for (const row of DCR_CROMPTON_SET_PRICING_ROWS) {
    out.push({
      systemSize: row.systemSize,
      phase: row.phase,
      inverterSize: "3.6kW",
      panelType: CROMPTON_DCR_SET_NAME,
      price: row.price,
      notes: "Premier Energy 600W–610W panels; Crompton 3.6kW inverter + ACDB/DCDB",
    })
  }
  return out
}

// DCR System Pricing — Adani, Adani Topcon, Waaree, Waaree Topcon, Premier Energies, INA, Tata, Crompton set
export const dcrPricing: SystemPricing[] = buildDcrPricingFromMatrix()

/** Map form/catalog panel brand to DCR pricing table `panelType`. */
export function resolveDcrPricingPanelType(panelBrand: string, panelTypeHint?: string): string {
  const hint = String(panelTypeHint || "")
    .trim()
    .toLowerCase()
  if (hint.includes("crompton")) return CROMPTON_DCR_SET_NAME
  if (hint.includes("waaree") && hint.includes("topcon")) return "Waaree Topcon"
  if (hint.includes("adani") && hint.includes("topcon")) return "Adani Topcon"

  const brand = panelBrand.trim()
  if (!brand) return "Adani"
  if (brand.toLowerCase().includes("crompton")) return CROMPTON_DCR_SET_NAME
  if (brand === "Premier" || brand.startsWith("Premier")) return "Premier Energies"
  if (brand === "INA" || brand.toUpperCase() === "INA") return "INA"
  if (brand === "Adani Topcon") return "Adani Topcon"
  if (brand === "Waaree Topcon") return "Waaree Topcon"
  if (brand === "Tata") return "Tata"
  if (DCR_PRICING_PANEL_TYPES.includes(brand as (typeof DCR_PRICING_PANEL_TYPES)[number])) return brand
  if (brand.toLowerCase().includes("topcon") && brand.toLowerCase().includes("waaree")) return "Waaree Topcon"
  if (brand.toLowerCase().includes("topcon") && brand.toLowerCase().includes("adani")) return "Adani Topcon"
  if (brand.toLowerCase().includes("premier")) return "Premier Energies"
  if (brand.toLowerCase() === "ina") return "INA"
  if (brand === "Waaree") return "Waaree"
  return "Adani"
}

/** Default panel watt label per DCR pricing column (browse-config fallback). */
export function dcrPanelSizeForPricingType(panelType: string): string {
  switch (panelType) {
    case "Adani Topcon":
      return "620W"
    case "Waaree Topcon":
      return "610W"
    case "Waaree":
      return "540W"
    case "Premier Energies":
    case "Premier":
      return "610W"
    case CROMPTON_DCR_SET_NAME:
    case "Crompton":
      return "610W"
    case "INA":
      return "550W"
    case "Tata":
      return DCR_AS_PER_THE_SET
    default:
      return "555W"
  }
}

/** Panel brand stored on quotation when a DCR package column is selected. */
export function dcrFormPanelBrandForPricingType(panelType: string): string {
  if (panelType === "Adani Topcon") return "Adani"
  if (panelType === "Waaree Topcon") return "Waaree"
  if (panelType === "Premier Energies" || panelType === "Premier") return "Premier Energies"
  if (panelType === "INA") return "INA"
  // Crompton set uses Premier Energy panels; package identity stays in `panelType`.
  if (panelType === CROMPTON_DCR_SET_NAME || panelType === "Crompton") return "Premier Energy"
  return panelType
}

/** Panel size + quantity for a DCR pricing-table row (fixed watt per column, not “best fit”). */
export function dcrPanelPackageForPricingRow(config: SystemPricing): {
  pricingPanelType: string
  panelBrand: string
  panelSize: string
  panelQuantity: number
} {
  const pricingPanelType = (config.panelType || "Adani").trim()
  const isTata = pricingPanelType === "Tata"
  const isIna = pricingPanelType === "INA"
  const isCromptonSet =
    pricingPanelType === CROMPTON_DCR_SET_NAME || pricingPanelType.toLowerCase().includes("crompton")
  const systemKw = Number.parseFloat(config.systemSize.replace(/kW/i, ""))

  if (isIna && Number.isFinite(systemKw) && systemKw > 0) {
    const best = bestPanelConfigWithinSystemKw(systemKw, { panelSizesToTry: INA_DCR_PANEL_SIZES_WATTS })
    return {
      pricingPanelType,
      panelBrand: "INA",
      panelSize: `${best.panelSizeW}W`,
      panelQuantity: best.quantity,
    }
  }

  if (isCromptonSet && Number.isFinite(systemKw) && systemKw > 0) {
    const best = bestPanelConfigWithinSystemKw(systemKw, {
      panelSizesToTry: CROMPTON_SET_PANEL_SIZES_WATTS,
      preferredPanelSize: "610W",
    })
    return {
      pricingPanelType: CROMPTON_DCR_SET_NAME,
      panelBrand: "Premier Energy",
      panelSize: `${best.panelSizeW}W`,
      panelQuantity: best.quantity,
    }
  }

  const panelSize = isTata ? DCR_AS_PER_THE_SET : dcrPanelSizeForPricingType(pricingPanelType)
  const panelQuantity =
    isTata || !Number.isFinite(systemKw) || systemKw <= 0
      ? 0
      : panelQuantityForNominalSystemKw(systemKw, panelSize)

  return {
    pricingPanelType,
    panelBrand: dcrFormPanelBrandForPricingType(pricingPanelType),
    panelSize,
    panelQuantity,
  }
}

// NON DCR System Pricing (Without Subsidy - Adani and Waaree panels separated)
export const nonDcrPricing: SystemPricing[] = [
  // Aug 2026 sheet — Pricings (Non DCR), Adani / Waaree (same package price)
  { systemSize: "3kW", phase: "1-Phase", inverterSize: "3kW", panelType: "Adani", price: 142000 },
  { systemSize: "3kW", phase: "1-Phase", inverterSize: "3kW", panelType: "Waaree", price: 142000 },
  { systemSize: "3kW", phase: "3-Phase", inverterSize: "5kW", panelType: "Adani", price: 180000 },
  { systemSize: "3kW", phase: "3-Phase", inverterSize: "5kW", panelType: "Waaree", price: 180000 },
  { systemSize: "5kW", phase: "1-Phase", inverterSize: "5kW", panelType: "Adani", price: 210000 },
  { systemSize: "5kW", phase: "1-Phase", inverterSize: "5kW", panelType: "Waaree", price: 210000 },
  { systemSize: "5kW", phase: "3-Phase", inverterSize: "5kW", panelType: "Adani", price: 245000 },
  { systemSize: "5kW", phase: "3-Phase", inverterSize: "5kW", panelType: "Waaree", price: 245000 },
  { systemSize: "6kW", phase: "1-Phase", inverterSize: "6kW", panelType: "Adani", price: 245000 },
  { systemSize: "6kW", phase: "1-Phase", inverterSize: "6kW", panelType: "Waaree", price: 245000 },
  { systemSize: "6kW", phase: "3-Phase", inverterSize: "6kW", panelType: "Adani", price: 280000 },
  { systemSize: "6kW", phase: "3-Phase", inverterSize: "6kW", panelType: "Waaree", price: 280000 },
  { systemSize: "8kW", phase: "3-Phase", inverterSize: "8kW", panelType: "Adani", price: 330000 },
  { systemSize: "8kW", phase: "3-Phase", inverterSize: "8kW", panelType: "Waaree", price: 330000 },
  { systemSize: "10kW", phase: "3-Phase", inverterSize: "10kW", panelType: "Adani", price: 395000 },
  { systemSize: "10kW", phase: "3-Phase", inverterSize: "10kW", panelType: "Waaree", price: 395000 },
  { systemSize: "12kW", phase: "3-Phase", inverterSize: "12kW", panelType: "Adani", price: 465000 },
  { systemSize: "12kW", phase: "3-Phase", inverterSize: "12kW", panelType: "Waaree", price: 465000 },
  { systemSize: "15kW", phase: "3-Phase", inverterSize: "15kW", panelType: "Adani", price: 535000 },
  { systemSize: "15kW", phase: "3-Phase", inverterSize: "15kW", panelType: "Waaree", price: 535000 },
  { systemSize: "20kW", phase: "3-Phase", inverterSize: "20kW", panelType: "Adani", price: 710000 },
  { systemSize: "20kW", phase: "3-Phase", inverterSize: "20kW", panelType: "Waaree", price: 710000 },
  { systemSize: "25kW", phase: "3-Phase", inverterSize: "25kW", panelType: "Adani", price: 830000 },
  { systemSize: "25kW", phase: "3-Phase", inverterSize: "25kW", panelType: "Waaree", price: 830000 },
  { systemSize: "30kW", phase: "3-Phase", inverterSize: "30kW", panelType: "Adani", price: 995000 },
  { systemSize: "30kW", phase: "3-Phase", inverterSize: "30kW", panelType: "Waaree", price: 995000 },
  { systemSize: "40kW", phase: "3-Phase", inverterSize: "40kW", panelType: "Adani", price: 1255000 },
  { systemSize: "40kW", phase: "3-Phase", inverterSize: "40kW", panelType: "Waaree", price: 1255000 },
  { systemSize: "50kW", phase: "3-Phase", inverterSize: "50kW", panelType: "Adani", price: 1498000 },
  { systemSize: "50kW", phase: "3-Phase", inverterSize: "50kW", panelType: "Waaree", price: 1498000 },
  { systemSize: "60kW", phase: "3-Phase", inverterSize: "60kW", panelType: "Adani", price: 1750000 },
  { systemSize: "60kW", phase: "3-Phase", inverterSize: "60kW", panelType: "Waaree", price: 1750000 },
  { systemSize: "80kW", phase: "3-Phase", inverterSize: "80kW", panelType: "Adani", price: 2350000 },
  { systemSize: "80kW", phase: "3-Phase", inverterSize: "80kW", panelType: "Waaree", price: 2350000 },
  { systemSize: "100kW", phase: "3-Phase", inverterSize: "100kW", panelType: "Adani", price: 2890000 },
  { systemSize: "100kW", phase: "3-Phase", inverterSize: "100kW", panelType: "Waaree", price: 2890000 },
  { systemSize: "125kW", phase: "3-Phase", inverterSize: "125kW", panelType: "Waaree", price: 3562500 },
]

// BOTH (DCR + NON DCR) System Pricing
// Format: "XkW (DCR) + YkW (Non DCR)" = Total System Size
export interface BothSystemPricing {
  systemSize: string
  phase: "1-Phase" | "3-Phase"
  inverterSize: string
  dcrCapacity: string // e.g., "3kW"
  nonDcrCapacity: string // e.g., "2kW"
  panelType: string
  price: number
}

export const bothPricing: BothSystemPricing[] = [
  // Aug 2026 sheet — Pricings (DCR + Non DCR), Adani / Waaree 620W (same package price)
  { systemSize: "5kW", phase: "1-Phase", inverterSize: "5kW", dcrCapacity: "3kW", nonDcrCapacity: "2kW", panelType: "Adani", price: 250000 },
  { systemSize: "5kW", phase: "1-Phase", inverterSize: "5kW", dcrCapacity: "3kW", nonDcrCapacity: "2kW", panelType: "Waaree", price: 250000 },
  { systemSize: "5kW", phase: "3-Phase", inverterSize: "5kW", dcrCapacity: "3kW", nonDcrCapacity: "2kW", panelType: "Adani", price: 272000 },
  { systemSize: "5kW", phase: "3-Phase", inverterSize: "5kW", dcrCapacity: "3kW", nonDcrCapacity: "2kW", panelType: "Waaree", price: 272000 },
  { systemSize: "6kW", phase: "1-Phase", inverterSize: "6kW", dcrCapacity: "3kW", nonDcrCapacity: "3kW", panelType: "Adani", price: 275000 },
  { systemSize: "6kW", phase: "1-Phase", inverterSize: "6kW", dcrCapacity: "3kW", nonDcrCapacity: "3kW", panelType: "Waaree", price: 275000 },
  { systemSize: "6kW", phase: "3-Phase", inverterSize: "6kW", dcrCapacity: "3kW", nonDcrCapacity: "3kW", panelType: "Adani", price: 305000 },
  { systemSize: "6kW", phase: "3-Phase", inverterSize: "6kW", dcrCapacity: "3kW", nonDcrCapacity: "3kW", panelType: "Waaree", price: 305000 },
  { systemSize: "8kW", phase: "3-Phase", inverterSize: "8kW", dcrCapacity: "3kW", nonDcrCapacity: "5kW", panelType: "Adani", price: 360000 },
  { systemSize: "8kW", phase: "3-Phase", inverterSize: "8kW", dcrCapacity: "3kW", nonDcrCapacity: "5kW", panelType: "Waaree", price: 360000 },
  { systemSize: "10kW", phase: "3-Phase", inverterSize: "10kW", dcrCapacity: "3kW", nonDcrCapacity: "7kW", panelType: "Adani", price: 425000 },
  { systemSize: "10kW", phase: "3-Phase", inverterSize: "10kW", dcrCapacity: "3kW", nonDcrCapacity: "7kW", panelType: "Waaree", price: 425000 },
  { systemSize: "12kW", phase: "3-Phase", inverterSize: "12kW", dcrCapacity: "3kW", nonDcrCapacity: "9kW", panelType: "Adani", price: 510000 },
  { systemSize: "12kW", phase: "3-Phase", inverterSize: "12kW", dcrCapacity: "3kW", nonDcrCapacity: "9kW", panelType: "Waaree", price: 510000 },
  { systemSize: "15kW", phase: "3-Phase", inverterSize: "15kW", dcrCapacity: "3kW", nonDcrCapacity: "12kW", panelType: "Adani", price: 570000 },
  { systemSize: "15kW", phase: "3-Phase", inverterSize: "15kW", dcrCapacity: "3kW", nonDcrCapacity: "12kW", panelType: "Waaree", price: 570000 },

  // Larger BOTH packages (not on Aug sheet — keep prior commercial prices)
  { systemSize: "20kW", phase: "3-Phase", inverterSize: "20kW", dcrCapacity: "3kW", nonDcrCapacity: "17kW", panelType: "Adani", price: 793100 },
  { systemSize: "20kW", phase: "3-Phase", inverterSize: "20kW", dcrCapacity: "3kW", nonDcrCapacity: "17kW", panelType: "Waaree", price: 793100 },
  { systemSize: "25kW", phase: "3-Phase", inverterSize: "25kW", dcrCapacity: "3kW", nonDcrCapacity: "22kW", panelType: "Adani", price: 988800 },
  { systemSize: "25kW", phase: "3-Phase", inverterSize: "25kW", dcrCapacity: "3kW", nonDcrCapacity: "22kW", panelType: "Waaree", price: 988800 },
  { systemSize: "30kW", phase: "3-Phase", inverterSize: "30kW", dcrCapacity: "3kW", nonDcrCapacity: "27kW", panelType: "Adani", price: 1184500 },
  { systemSize: "30kW", phase: "3-Phase", inverterSize: "30kW", dcrCapacity: "3kW", nonDcrCapacity: "27kW", panelType: "Waaree", price: 1184500 },
]

// Helper function to get DCR pricing
// Uses API data if available, otherwise falls back to hardcoded values
export function getDcrPrice(
  systemSize: string,
  phase: string,
  inverterSize: string,
  panelBrand: string,
  pricingData?: PricingTablesData,
  panelTypeHint?: string,
): number | null {
  // Use provided pricing data, API data, or fallback to hardcoded
  const data = pricingData || getPricingData()
  const pricingTable = data.dcr || dcrPricing
  const panelType = resolveDcrPricingPanelType(panelBrand, panelTypeHint)

  let pricing = pricingTable.find(
    (p) =>
      p.systemSize === systemSize &&
      p.phase === phase &&
      p.inverterSize === inverterSize &&
      p.panelType === panelType,
  )

  if (!pricing && panelType === "Tata") {
    pricing = pricingTable.find(
      (p) => p.systemSize === systemSize && p.phase === phase && p.panelType === "Tata",
    )
  }

  if (!pricing && panelType === CROMPTON_DCR_SET_NAME) {
    pricing = pricingTable.find(
      (p) =>
        p.systemSize === systemSize &&
        p.phase === phase &&
        p.panelType === CROMPTON_DCR_SET_NAME,
    )
  }

  const inv = inverterSize.trim().toLowerCase()
  if (
    !pricing &&
    (inv === DCR_AS_PER_THE_SET.toLowerCase() || inv === "as per set" || inv === "as per the set")
  ) {
    pricing = pricingTable.find(
      (p) => p.systemSize === systemSize && p.phase === phase && p.panelType === panelType,
    )
  }

  return pricing ? pricing.price : null
}

// Helper function to get NON DCR pricing
// Uses API data if available, otherwise falls back to hardcoded values
export function getNonDcrPrice(
  systemSize: string,
  phase: "1-Phase" | "3-Phase",
  inverterSize: string,
  panelBrand: string,
  pricingData?: PricingTablesData
): number | null {
  // Use provided pricing data, API data, or fallback to hardcoded
  const data = pricingData || getPricingData()
  const pricingTable = data.nonDcr || nonDcrPricing
  
  // Use panel brand directly (Adani, Waaree, Tata, Renew Energy)
  // If brand is not in pricing table, try to find closest match
  let panelType = panelBrand

  // Map panel brands to pricing table types
  const brandLower = panelBrand.trim().toLowerCase()
  if (brandLower.includes("renew")) {
    panelType = "Renew Energy" // RenewSys / Renew Energy → same Non-DCR set price
  } else if (
    panelBrand !== "Tata" &&
    panelBrand !== "Adani" &&
    panelBrand !== "Waaree" &&
    panelBrand !== "Renew Energy"
  ) {
    // Default to Adani for unknown brands (legacy support)
    panelType = "Adani"
  }

  const pricing = pricingTable.find(
    (p) =>
      p.systemSize === systemSize &&
      p.phase === phase &&
      p.inverterSize === inverterSize &&
      p.panelType === panelType,
  )
  if (pricing) return pricing.price

  // Aug 2026 Non-DCR sheet is Adani/Waaree only — fall back to Adani package price
  if (panelType !== "Adani") {
    const adani = pricingTable.find(
      (p) =>
        p.systemSize === systemSize &&
        p.phase === phase &&
        p.inverterSize === inverterSize &&
        p.panelType === "Adani",
    )
    if (adani) return adani.price
  }

  return null
}

// Helper function to get BOTH (DCR + NON DCR) pricing
// Uses API data if available, otherwise falls back to hardcoded values
export function getBothPrice(
  systemSize: string,
  phase: "1-Phase" | "3-Phase",
  inverterSize: string,
  dcrCapacity: string,
  nonDcrCapacity: string,
  panelBrand: string,
  pricingData?: PricingTablesData
): number | null {
  // Use provided pricing data, API data, or fallback to hardcoded
  const data = pricingData || getPricingData()
  const pricingTable = data.both || bothPricing
  
  // Use panel brand directly (Adani, Waaree, or Tata)
  // If brand is not in pricing table, try to find closest match
  let panelType = panelBrand
  
  // Map panel brands to pricing table types
  if (panelBrand !== "Tata" && panelBrand !== "Adani" && panelBrand !== "Waaree") {
    // Default to Adani for unknown brands (legacy support)
    panelType = "Adani"
  }
  
  const pricing = pricingTable.find(
    (p) =>
      p.systemSize === systemSize &&
      p.phase === phase &&
      p.inverterSize === inverterSize &&
      p.dcrCapacity === dcrCapacity &&
      p.nonDcrCapacity === nonDcrCapacity &&
      p.panelType === panelType
  )
  
  return pricing ? pricing.price : null
}

// Helper function to determine phase from system size and inverter
// Can optionally check pricing tables for exact phase match
export function determinePhase(
  systemSize: string, 
  inverterSize: string,
  pricingData?: PricingTablesData
): "1-Phase" | "3-Phase" {
  const systemKw = Number.parseInt(systemSize.replace("kW", ""))
  const inverterKw = Number.parseInt(inverterSize.replace("kW", ""))
  
  // If pricing data is available, check for exact match first
  if (pricingData) {
    // Check DCR pricing
    const dcrMatch = pricingData.dcr?.find(
      (p) => p.systemSize === systemSize && p.inverterSize === inverterSize
    )
    if (dcrMatch) {
      return dcrMatch.phase
    }
    
    // Check NON DCR pricing
    const nonDcrMatch = pricingData.nonDcr?.find(
      (p) => p.systemSize === systemSize && p.inverterSize === inverterSize
    )
    if (nonDcrMatch) {
      return nonDcrMatch.phase
    }
    
    const bothMatches = pricingData.both?.filter(
      (p) => p.systemSize === systemSize && p.inverterSize === inverterSize
    )
    if (bothMatches && bothMatches.length === 1) {
      return bothMatches[0].phase
    }
    if (bothMatches && bothMatches.length > 1) {
      const three = bothMatches.find((p) => p.phase === "3-Phase")
      return three ? "3-Phase" : bothMatches[0].phase
    }
  }
  
  // Fallback logic: Systems 7kW and above are typically 3-Phase
  // Also if inverter is larger than system, it's likely 3-Phase
  // For 3-6kW systems: if inverter matches system size exactly, it's likely 1-Phase
  // If inverter is larger (e.g., 3kW system with 5kW inverter), it's 3-Phase
  if (systemKw >= 7) {
    return "3-Phase"
  }
  
  if (inverterKw > systemKw) {
    return "3-Phase"
  }
  
  // For 3-6kW systems where inverter matches system size, default to 1-Phase
  // But this could also be 3-Phase, so we check pricing tables if available
  if (systemKw >= 3 && systemKw <= 6 && inverterKw === systemKw) {
    // Default to 1-Phase, but this should ideally come from pricing tables
    return "1-Phase"
  }
  
  // Default to 1-Phase for smaller systems
  return "1-Phase"
}

/** Parse panel label (e.g. `550W`, `540W-620W`) to watts for one panel. */
export function parsePanelSizeWatts(panelSize: string | number | undefined | null): number {
  if (panelSize === null || panelSize === undefined) return 0
  if (typeof panelSize === "number" && panelSize > 0) return panelSize

  const text = String(panelSize).trim()
  if (!text) return 0

  const rangeMatch = text.match(/(\d+(?:\.\d+)?)\s*w?\s*[-–—]\s*(\d+(?:\.\d+)?)\s*w?/i)
  if (rangeMatch) {
    const low = Number.parseFloat(rangeMatch[1])
    const high = Number.parseFloat(rangeMatch[2])
    if (!Number.isNaN(low) && !Number.isNaN(high) && low > 0 && high > 0) {
      return (low + high) / 2
    }
  }

  const wattMatch = text.match(/(\d+(?:\.\d+)?)\s*w/i)
  if (wattMatch) {
    const w = Number.parseFloat(wattMatch[1])
    if (!Number.isNaN(w) && w > 0) return w
  }

  const digitsOnly = text.replace(/[^0-9.]/g, "")
  if (digitsOnly.includes(".")) {
    const w = Number.parseFloat(digitsOnly)
    if (!Number.isNaN(w) && w > 0) return w
  }

  const asInt = Number.parseInt(text.replace(/[^0-9]/g, ""), 10)
  return Number.isNaN(asInt) || asInt <= 0 ? 0 : asInt
}

/** Common panel wattages tried when auto-filling quantity from a package kW size. */
export const COMMON_PANEL_SIZES_WATTS = [
  620, 600, 590, 580, 570, 560, 555, 550, 545, 540, 530, 520, 510, 500, 490, 480, 470,
  460, 455, 450, 445, 440, 430, 420, 410, 400, 390, 380, 370, 360, 350, 340, 330, 320,
] as const

/** Max watts above nominal package kW before reducing panel count (e.g. 8kW → up to 8400W). */
export const MAX_PACKAGE_OVERSHOOT_WATTS = 400

/** 3kW + 580W default (5 panels) vs optional 6-panel total. */
export const PANEL_CAPACITY_580W = 580
export const PANEL_CAPACITY_DEFAULT_W = 2900
export const PANEL_CAPACITY_EXTENDED_W = 3480
export const PANEL_CAPACITY_DEFAULT_QTY = 5
export const PANEL_CAPACITY_EXTENDED_QTY = 6

export type PanelQuantityCapOptions = {
  allow3480W?: boolean
  panelSize?: string | number | null
}

export function isThreeKwPackage(systemKw: number): boolean {
  return Number.isFinite(systemKw) && systemKw >= 2.9 && systemKw <= 3.15
}

/** 5×580W (2,900W) vs 6×580W (3,480W) on 3kW packages. */
export function canUse3480WPanelOption(
  systemKw: number,
  panelSize: string | number | undefined | null,
): boolean {
  return isThreeKwPackage(systemKw) && parsePanelSizeWatts(panelSize) === PANEL_CAPACITY_580W
}

export function maxAllowedWattsForNominalSystemKw(
  systemKw: number,
  options?: PanelQuantityCapOptions,
): number {
  if (!Number.isFinite(systemKw) || systemKw <= 0) return 0
  const base = systemKw * 1000 + MAX_PACKAGE_OVERSHOOT_WATTS
  if (options?.allow3480W && canUse3480WPanelOption(systemKw, options.panelSize ?? PANEL_CAPACITY_580W)) {
    return Math.max(base, PANEL_CAPACITY_EXTENDED_W)
  }
  return base
}

export function isPanelCapacityWithinPackageTolerance(
  systemKw: number,
  panelSize: string | number | undefined | null,
  panelQuantity: number,
  options?: Pick<PanelQuantityCapOptions, "allow3480W">,
): boolean {
  const panelW = parsePanelSizeWatts(panelSize)
  if (panelW <= 0 || panelQuantity <= 0) return false
  return (
    panelW * panelQuantity <=
    maxAllowedWattsForNominalSystemKw(systemKw, { ...options, panelSize }) + 0.5
  )
}

/**
 * Panel count for a pricing slab: actual DC watts may exceed nominal by at most {@link MAX_PACKAGE_OVERSHOOT_WATTS}.
 * Example: 8kW + 610W → 13 panels (7930W), not 14 (8540W).
 * 3kW + 580W defaults to 5 panels (2,900W); pass allow3480W for 6 panels (3,480W).
 */
export function panelQuantityForNominalSystemKw(
  systemKw: number,
  panelSize: string | number | undefined | null,
  options?: Pick<PanelQuantityCapOptions, "allow3480W">,
): number {
  const panelW = parsePanelSizeWatts(panelSize)
  if (!Number.isFinite(systemKw) || systemKw <= 0 || panelW <= 0) return 0
  const maxAllowedW = maxAllowedWattsForNominalSystemKw(systemKw, { ...options, panelSize })
  const qty = Math.floor(maxAllowedW / panelW)
  return Math.max(1, qty)
}

/** Reduce quantity when it would exceed nominal + 400W (e.g. manual entry). */
export function clampPanelQuantityToNominalSystemKw(
  systemKw: number,
  panelSize: string | number | undefined | null,
  panelQuantity: number,
  options?: Pick<PanelQuantityCapOptions, "allow3480W">,
): number {
  const capped = panelQuantityForNominalSystemKw(systemKw, panelSize, options)
  if (capped <= 0) return panelQuantity
  return Math.min(Math.max(1, panelQuantity), capped)
}

export function actualSystemKwFromPanels(
  panelSize: string | number | undefined | null,
  panelQuantity: number,
): number {
  const panelW = parsePanelSizeWatts(panelSize)
  if (panelW <= 0 || panelQuantity <= 0) return 0
  return (panelW * panelQuantity) / 1000
}

/**
 * Pick panel size + quantity: highest actual kW that stays within nominal + {@link MAX_PACKAGE_OVERSHOOT_WATTS}.
 */
export function bestPanelConfigWithinSystemKw(
  targetSystemKw: number,
  options?: {
    panelSizesToTry?: readonly number[]
    preferredPanelSize?: string | number
  },
): { panelSizeW: number; quantity: number; actualKw: number } {
  const targetW = targetSystemKw * 1000
  const maxAllowedW = maxAllowedWattsForNominalSystemKw(targetSystemKw)
  if (!Number.isFinite(targetSystemKw) || targetSystemKw <= 0 || targetW <= 0) {
    return { panelSizeW: 0, quantity: 0, actualKw: 0 }
  }

  const preferredW = options?.preferredPanelSize
    ? parsePanelSizeWatts(options.preferredPanelSize)
    : 0
  if (preferredW > 0) {
    const qty = panelQuantityForNominalSystemKw(targetSystemKw, preferredW)
    const actualW = qty * preferredW
    return {
      panelSizeW: preferredW,
      quantity: qty,
      actualKw: actualW / 1000,
    }
  }

  let sizes: number[] = [...(options?.panelSizesToTry ?? COMMON_PANEL_SIZES_WATTS)]

  let best = { panelSizeW: sizes[0] || 550, quantity: 1, actualKw: 0 }

  for (const sizeW of sizes) {
    if (sizeW <= 0) continue
    const qty = panelQuantityForNominalSystemKw(targetSystemKw, sizeW)
    const actualW = qty * sizeW
    if (actualW > maxAllowedW + 0.5) continue
    const actualKw = actualW / 1000
    if (actualKw > best.actualKw) {
      best = { panelSizeW: sizeW, quantity: qty, actualKw }
    }
  }

  return best
}

// Helper function to calculate system size from panel configuration
export function calculateSystemSize(
  panelSize: string | number | undefined | null,
  panelQuantity: number | string | undefined | null
): string {
  const qty =
    typeof panelQuantity === "string"
      ? Number.parseFloat(panelQuantity.replace(/,/g, ""))
      : panelQuantity

  if (qty === undefined || qty === null || Number.isNaN(qty) || qty <= 0) {
    return "0kW"
  }

  try {
    const sizeW = parsePanelSizeWatts(panelSize)
    if (sizeW <= 0) return "0kW"
    const totalKw = (sizeW * qty) / 1000
    return `${totalKw}kW`
  } catch (error) {
    console.error("Error calculating system size:", error)
    return "0kW"
  }
}

export type QuotationProductsPhaseInput = {
  phase?: string
  systemType?: string
  panelSize?: string
  panelQuantity?: number
  inverterSize?: string
  structureSize?: string
  dcrPanelSize?: string
  dcrPanelQuantity?: number
  nonDcrPanelSize?: string
  nonDcrPanelQuantity?: number
  customPanels?: Array<{ brand: string; size: string; quantity: number; type?: string }>
}

/** 1-Phase vs 3-Phase for PDF/display when `products.phase` is empty or legacy. */
export function resolveQuotationPhase(products: QuotationProductsPhaseInput): "1-Phase" | "3-Phase" {
  const explicit = products.phase
  if (explicit === "1-Phase" || explicit === "3-Phase") {
    return explicit
  }

  let systemSizeForPhase = ""

  if (products.systemType === "both") {
    const dcrSize = calculateSystemSize(products.dcrPanelSize || "", products.dcrPanelQuantity || 0)
    const nonDcrSize = calculateSystemSize(products.nonDcrPanelSize || "", products.nonDcrPanelQuantity || 0)
    if (dcrSize !== "0kW" && nonDcrSize !== "0kW") {
      const dcrKw = Number.parseFloat(dcrSize.replace("kW", "")) || 0
      const nonDcrKw = Number.parseFloat(nonDcrSize.replace("kW", "")) || 0
      const totalKw = dcrKw + nonDcrKw
      if (!Number.isNaN(totalKw) && totalKw > 0) {
        systemSizeForPhase = `${totalKw}kW`
      }
    }
  } else if (products.panelSize && products.panelQuantity) {
    systemSizeForPhase = calculateSystemSize(products.panelSize, products.panelQuantity)
  } else if (products.dcrPanelSize && products.dcrPanelQuantity) {
    systemSizeForPhase = calculateSystemSize(products.dcrPanelSize, products.dcrPanelQuantity)
  } else if (products.nonDcrPanelSize && products.nonDcrPanelQuantity) {
    systemSizeForPhase = calculateSystemSize(products.nonDcrPanelSize, products.nonDcrPanelQuantity)
  } else if (products.customPanels && products.customPanels.length > 0) {
    const totalKw = products.customPanels.reduce((sum, panel) => {
      const kw = Number.parseFloat(panel.size.replace("W", "")) / 1000
      return sum + (Number.isNaN(kw) ? 0 : kw * (panel.quantity || 0))
    }, 0)
    if (!Number.isNaN(totalKw) && totalKw > 0) {
      systemSizeForPhase = `${totalKw}kW`
    }
  }

  if (products.inverterSize && systemSizeForPhase && systemSizeForPhase !== "0kW") {
    return determinePhase(systemSizeForPhase, products.inverterSize)
  }

  if (products.inverterSize) {
    const inverterKw = Number.parseFloat(products.inverterSize.replace("kW", ""))
    if (!Number.isNaN(inverterKw) && inverterKw >= 7) {
      return "3-Phase"
    }
  }

  return "1-Phase"
}

export function formatQuotationPhaseLabel(phase: "1-Phase" | "3-Phase"): string {
  return phase === "1-Phase" ? "Single phase (1-Phase)" : "Three phase (3-Phase)"
}

// Component Pricing Helper Functions
// These functions use API data if available, otherwise fall back to hardcoded values

export function getPanelPrice(
  brand: string,
  size: string,
  pricingData?: PricingTablesData
): number {
  // Handle null/undefined/empty values
  if (!brand || !size) {
    console.warn(`[getPanelPrice] Missing brand or size. Brand: ${brand}, Size: ${size}`)
    return 0
  }

  const data = pricingData || getPricingData()
  const pricingTable = data.panels || defaultPanelPricing
  
  // Try exact match first
  let pricing = pricingTable.find(
    (p) => p.brand === brand && p.size === size
  )
  
  // If no exact match, try to find by brand and calculate based on size
  if (!pricing) {
    const brandPricing = pricingTable.find((p) => p.brand === brand)
    if (brandPricing && brandPricing.size) {
      const baseSize = Number.parseInt(brandPricing.size.replace("W", ""))
      const targetSize = Number.parseInt(size.replace("W", ""))
      if (!Number.isNaN(baseSize) && !Number.isNaN(targetSize) && baseSize > 0 && targetSize > 0) {
        return (brandPricing.price * targetSize) / baseSize
      }
    }
  }
  
  // Fallback to default calculation if no pricing found
  if (!pricing) {
    const basePrices: Record<string, number> = {
      Adani: 25000,
      Tata: 26000,
      Waaree: 24000,
      "Vikram Solar": 24500,
      RenewSys: 23500,
    }
    // Safely parse size, default to 440W if invalid
    const sizeValue = Number.parseInt(size.replace("W", ""))
    if (Number.isNaN(sizeValue) || sizeValue <= 0) {
      console.warn(`[getPanelPrice] Invalid size value: ${size}, using default 440W`)
      return basePrices[brand] || 24000
    }
    const sizeMultiplier = sizeValue / 440
    return (basePrices[brand] || 24000) * sizeMultiplier
  }
  
  return pricing.price
}

export function getInverterPrice(
  brand: string,
  size: string,
  pricingData?: PricingTablesData
): number {
  // Handle null/undefined/empty values
  if (!brand || !size) {
    console.warn(`[getInverterPrice] Missing brand or size. Brand: ${brand}, Size: ${size}`)
    return 0
  }

  const data = pricingData || getPricingData()
  const pricingTable = data.inverters || defaultInverterPricing
  
  // Try exact match first
  const pricing = pricingTable.find(
    (p) => p.brand === brand && p.size === size
  )
  
  // If no exact match, try to interpolate based on size
  if (!pricing) {
    const brandPricings = pricingTable.filter((p) => p.brand === brand).sort((a, b) => {
      const aSize = Number.parseInt(a.size?.replace("kW", "") || "0")
      const bSize = Number.parseInt(b.size?.replace("kW", "") || "0")
      return aSize - bSize
    })
    
    if (brandPricings.length > 0) {
      const targetSize = Number.parseInt(size.replace("kW", ""))
      if (!Number.isNaN(targetSize) && targetSize > 0) {
        const closest = brandPricings.reduce((prev, curr) => {
          const prevSize = Number.parseInt(prev.size?.replace("kW", "") || "0")
          const currSize = Number.parseInt(curr.size?.replace("kW", "") || "0")
          return Math.abs(currSize - targetSize) < Math.abs(prevSize - targetSize) ? curr : prev
        })
        
        const closestSize = Number.parseInt(closest.size?.replace("kW", "") || "0")
        if (!Number.isNaN(closestSize) && closestSize > 0) {
          return (closest.price * targetSize) / closestSize
        }
      }
    }
  }
  
  // Fallback to default calculation
  if (!pricing) {
    const basePrices: Record<string, number> = {
      Growatt: 35000,
      Solis: 32000,
      Fronius: 45000,
      Havells: 38000,
      Polycab: 36000,
      Delta: 40000,
    }
    const sizeKw = Number.parseInt(size.replace("kW", ""))
    if (Number.isNaN(sizeKw) || sizeKw <= 0) {
      console.warn(`[getInverterPrice] Invalid size value: ${size}, using default 3kW`)
      return basePrices[brand] || 35000
    }
    return (basePrices[brand] || 35000) * (sizeKw / 3)
  }
  
  return pricing.price
}

export function getStructurePrice(
  type: string,
  size: string,
  pricingData?: PricingTablesData
): number {
  // Handle null/undefined/empty values
  if (!type || !size) {
    console.warn(`[getStructurePrice] Missing type or size. Type: ${type}, Size: ${size}`)
    return 0
  }

  const data = pricingData || getPricingData()
  const pricingTable = data.structures || defaultStructurePricing
  
  // Try exact match first
  let pricing = pricingTable.find(
    (p) => p.type === type && p.size === size
  )
  
  // If no exact match, calculate based on size (price per kW)
  if (!pricing) {
    const typePricing = pricingTable.find((p) => p.type === type)
    if (typePricing && typePricing.size) {
      const baseSize = Number.parseInt(typePricing.size.replace("kW", ""))
      const targetSize = Number.parseInt(size.replace("kW", ""))
      if (!Number.isNaN(baseSize) && !Number.isNaN(targetSize) && baseSize > 0 && targetSize > 0) {
        return (typePricing.price * targetSize) / baseSize
      }
    }
  }
  
  // Fallback to default calculation (8000 per kW)
  if (!pricing) {
    const sizeKw = Number.parseInt(size.replace("kW", ""))
    if (Number.isNaN(sizeKw) || sizeKw <= 0) {
      console.warn(`[getStructurePrice] Invalid size value: ${size}, returning 0`)
      return 0
    }
    return sizeKw * 8000
  }
  
  return pricing.price
}

export function getMeterPrice(
  brand: string,
  pricingData?: PricingTablesData
): number {
  const data = pricingData || getPricingData()
  const pricingTable = data.meters || defaultMeterPricing
  
  const pricing = pricingTable.find((p) => p.brand === brand)
  
  // Fallback to default price
  return pricing?.price || 5000
}

export function getCablePrice(
  brand: string,
  size: string,
  type: "AC" | "DC",
  pricingData?: PricingTablesData
): number {
  const data = pricingData || getPricingData()
  const pricingTable = data.cables || defaultCablePricing
  
  // Try exact match first
  let pricing = pricingTable.find(
    (p) => p.brand === brand && p.size === size && p.type === type
  )
  
  // If no exact match, try to find by brand and type
  if (!pricing) {
    pricing = pricingTable.find((p) => p.brand === brand && p.type === type)
  }
  
  // Fallback to default price
  return pricing?.price || 3000
}

// Helper function to get ACDB options filtered by phase
export function getACDBOptions(
  phase: "1-Phase" | "3-Phase",
  pricingData?: PricingTablesData
): ACDBPricing[] {
  const data = pricingData || getPricingData()
  const pricingTable = data.acdb || defaultACDBPricing
  
  return pricingTable.filter((p) => p.phase === phase)
}

// Helper function to get DCDB options filtered by phase
export function getDCDBOptions(
  phase: "1-Phase" | "3-Phase",
  pricingData?: PricingTablesData
): DCDBPricing[] {
  const data = pricingData || getPricingData()
  const pricingTable = data.dcdb || defaultDCDBPricing
  
  return pricingTable.filter((p) => p.phase === phase)
}

// Helper function to format ACDB/DCDB option for display
export function formatACDBOption(brand: string, phase: "1-Phase" | "3-Phase"): string {
  return `${brand} (${phase})`
}

// Helper function to format DCDB option for display
export function formatDCDBOption(brand: string, phase: "1-Phase" | "3-Phase"): string {
  return `${brand} (${phase})`
}

export const DEFAULT_ACDB_BRAND = "Havells+Elmex"
export const DEFAULT_DCDB_BRAND = "Elmex"

function migrateAcdbBrand(brand: string): string {
  return brand === "Havells" ? DEFAULT_ACDB_BRAND : brand
}

function migrateDcdbBrand(brand: string): string {
  return brand === "Havells" ? DEFAULT_DCDB_BRAND : brand
}

/** Ensure ACDB/DCDB labels match the package phase (e.g. 3-Phase → Havells+Elmex (3-Phase) / Elmex (3-Phase)). */
export function acdbDcdbLabelsForPhase(
  phase: "1-Phase" | "3-Phase",
  acdb?: string,
  dcdb?: string,
  defaultBrand?: string,
): { acdb: string; dcdb: string } {
  const acdbParsed = acdb?.trim() ? parseACDBOption(acdb) : null
  const dcdbParsed = dcdb?.trim() ? parseACDBOption(dcdb) : null
  const acdbBrand = migrateAcdbBrand(acdbParsed?.brand || defaultBrand || DEFAULT_ACDB_BRAND)
  const dcdbBrand = migrateDcdbBrand(dcdbParsed?.brand || defaultBrand || DEFAULT_DCDB_BRAND)
  return {
    acdb: formatACDBOption(acdbBrand, phase),
    dcdb: formatDCDBOption(dcdbBrand, phase),
  }
}

/** Default ACDB/DCDB for a package phase (1-Phase → Havells+Elmex / Elmex). */
export function defaultAcdbDcdbForPhase(phase: "1-Phase" | "3-Phase"): { acdb: string; dcdb: string } {
  return acdbDcdbLabelsForPhase(phase)
}

/** Dropdown labels for ACDB/DCDB — API options plus local defaults so Select always has items. */
export function listAcdbDcdbOptionsForPhase(
  phase: "1-Phase" | "3-Phase",
  pricingData?: PricingTablesData,
): { acdb: string[]; dcdb: string[] } {
  const acdbFromApi = getACDBOptions(phase, pricingData).map((opt) => formatACDBOption(opt.brand, opt.phase))
  const dcdbFromApi = getDCDBOptions(phase, pricingData).map((opt) => formatDCDBOption(opt.brand, opt.phase))
  const acdbFallback = defaultACDBPricing
    .filter((p) => p.phase === phase)
    .map((p) => formatACDBOption(p.brand, p.phase))
  const dcdbFallback = defaultDCDBPricing
    .filter((p) => p.phase === phase)
    .map((p) => formatDCDBOption(p.brand, p.phase))

  return {
    acdb: [...new Set([...acdbFromApi, ...acdbFallback])],
    dcdb: [...new Set([...dcdbFromApi, ...dcdbFallback])],
  }
}

// Helper function to parse ACDB/DCDB option string
export function parseACDBOption(option: string): { brand: string; phase: "1-Phase" | "3-Phase" } | null {
  const match = option.match(/^(.+?)\s*\((.+?)\)$/)
  if (match) {
    const brand = match[1].trim()
    const phase = match[2].trim() as "1-Phase" | "3-Phase"
    if (phase === "1-Phase" || phase === "3-Phase") {
      return { brand, phase }
    }
  }
  return null
}

function findBrandPhasePrice(
  pricingTable: Array<{ brand: string; phase: "1-Phase" | "3-Phase"; price: number }>,
  brands: string[],
  phase: "1-Phase" | "3-Phase",
): number | undefined {
  for (const brand of brands) {
    const pricing = pricingTable.find((p) => p.brand === brand && p.phase === phase)
    if (pricing) return pricing.price
  }
  return undefined
}

export function getACDBPrice(
  brand: string,
  phase: "1-Phase" | "3-Phase",
  pricingData?: PricingTablesData
): number {
  const data = pricingData || getPricingData()
  const pricingTable = data.acdb || defaultACDBPricing
  const brands = brand === "Havells+Elmex" || brand === "Havells" ? ["Havells+Elmex", "Havells"] : [brand]
  return findBrandPhasePrice(pricingTable, brands, phase) || 2500
}

export function getDCDBPrice(
  brand: string,
  phase: "1-Phase" | "3-Phase",
  pricingData?: PricingTablesData
): number {
  const data = pricingData || getPricingData()
  const pricingTable = data.dcdb || defaultDCDBPricing
  const brands = brand === "Elmex" || brand === "Havells" ? ["Elmex", "Havells"] : [brand]
  return findBrandPhasePrice(pricingTable, brands, phase) || 2500
}


