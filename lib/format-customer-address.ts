/** Format API address objects or plain strings for display in tables. */
export function formatCustomerAddress(address: unknown, fallback = "N/A"): string {
  if (typeof address === "string") {
    const trimmed = address.trim()
    return trimmed || fallback
  }
  if (!address || typeof address !== "object" || Array.isArray(address)) return fallback
  const value = address as Record<string, unknown>
  const parts = [value.street, value.city, value.state, value.pincode]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
  return parts.length > 0 ? parts.join(", ") : fallback
}

export function formatQuotationVisitLocation(
  q: {
    visitLocation?: unknown
    visit_location?: unknown
    location?: unknown
    customer?: { address?: unknown; location?: unknown } | null
  },
  fallback = "N/A",
): string {
  const visit = String(q.visitLocation || q.visit_location || q.location || "").trim()
  if (visit) return visit
  const customer = q.customer
  if (customer?.location && typeof customer.location === "string" && customer.location.trim()) {
    return customer.location.trim()
  }
  return formatCustomerAddress(customer?.address, fallback)
}
