export interface CustomerBookingSession {
  reservation: string
  token?: string
  timestamp: number
}

const STORAGE_KEY = "izensphere_customer_session"

export function getCustomerBookings(): CustomerBookingSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
    return []
  } catch {
    return []
  }
}

export function recordCustomerBooking(reservation: string, token?: string): void {
  try {
    if (!reservation) return
    const current = getCustomerBookings()
    // Dedup by reservation name
    const filtered = current.filter((b) => b.reservation !== reservation)
    const updated: CustomerBookingSession[] = [
      {
        reservation,
        token: token || undefined,
        timestamp: Date.now(),
      },
      ...filtered,
    ]
    // Keep up to 50 bookings
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated.slice(0, 50)))
  } catch {
    // Private browsing or quota exceeded
  }
}

export function clearCustomerBookings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore
  }
}

export function getVerifiedTokens(): string[] {
  return getCustomerBookings()
    .map((b) => b.token)
    .filter((t): t is string => Boolean(t && t.length >= 20))
}

export function getVerifiedReferences(): string[] {
  return getCustomerBookings()
    .map((b) => b.reservation)
    .filter(Boolean)
}
