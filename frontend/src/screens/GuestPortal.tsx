import { useState, useEffect, useCallback } from "react"
import { Link, useSearchParams } from "react-router-dom"
import {
  Calendar,
  Phone,
  Wifi,
  Clock,
  BedDouble,
  ShieldCheck,
  Building2,
  Printer,
  Download,
  Edit,
  X,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Utensils,
  FileText,
  ChevronDown,
  ChevronUp,
  Layers,
  History,
  User,
  LogIn,
  LogOut,
} from "lucide-react"
import { call } from "../lib/api"
import { useAuth } from "../lib/auth"
import CustomerAuthModal from "../components/CustomerAuthModal"
import { Button } from "../components/ui/button"
import { useT } from "../lib/i18n"
import { moneyLocale } from "../lib/money"
import {
  recordCustomerBooking,
} from "../lib/customerSession"

export interface BookingSummary {
  reservation: string
  property: string
  property_name: string
  property_slug: string
  city: string
  phone: string
  wifi_ssid: string
  wifi_password: string
  checkin_time: string
  checkout_time: string
  guest_name: string
  guest_phone?: string
  guest_email?: string
  room_type: string
  room: string
  room_number: string
  check_in_date: string
  check_out_date: string
  nights: number
  adults: number
  children: number
  meal_plan: string
  meal_plan_name: string
  status: string
  payment_status: "Paid" | "Partially Paid" | "Unpaid" | string
  category: "upcoming" | "current" | "completed" | "cancelled"
  precheckin_status: string
  precheckin_token: string
  cancellation_number?: string
  cancellation_reason?: string
  cancellation_policy?: string
  cancellation_policy_type?: string
  cancellation_deadline?: string
  cancellation_fee_rule?: string
  cancellation_policy_description?: string
  cancellation_fee?: number
  eligible_refund?: number
  refund_amount?: number
  refund_status?: string
  special_requests?: string
  created_at?: string
  grand_total: number
  paid_amount: number
  balance: number
  currency_symbol: string
}

interface HistoryResponse {
  found: boolean
  authenticated: boolean
  reason?: string
  guest_name?: string
  bookings: BookingSummary[]
  categories: {
    upcoming: BookingSummary[]
    current: BookingSummary[]
    completed: BookingSummary[]
    cancelled: BookingSummary[]
  }
  counts: {
    all: number
    upcoming: number
    current: number
    completed: number
    cancelled: number
  }
  message?: string
}

type TabType = "all" | "upcoming" | "current" | "completed" | "cancelled"

export default function GuestPortal() {
  const { t } = useT()
  const [searchParams] = useSearchParams()
  const urlRef = searchParams.get("ref") || ""
  const urlToken = searchParams.get("token") || ""

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>("all")
  const [bookings, setBookings] = useState<BookingSummary[]>([])
  const [categories, setCategories] = useState<{
    upcoming: BookingSummary[]
    current: BookingSummary[]
    completed: BookingSummary[]
    cancelled: BookingSummary[]
  }>({
    upcoming: [],
    current: [],
    completed: [],
    cancelled: [],
  })
  const [counts, setCounts] = useState({
    all: 0,
    upcoming: 0,
    current: 0,
    completed: 0,
    cancelled: 0,
  })
  const [guestName, setGuestName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Expandable details state per reservation
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({})

  // Modals state
  const [voucherBooking, setVoucherBooking] = useState<BookingSummary | null>(null)
  const [modifyingBooking, setModifyingBooking] = useState<BookingSummary | null>(null)
  const [cancellingBooking, setCancellingBooking] = useState<BookingSummary | null>(null)

  // Modification form
  const [modDetails, setModDetails] = useState("")
  const [modDates, setModDates] = useState("")
  const [modSubmitting, setModSubmitting] = useState(false)
  const [modError, setModError] = useState<string | null>(null)

  // Cancellation form
  const [cxlReason, setCxlReason] = useState("Guest request")
  const [cxlNote, setCxlNote] = useState("")
  const [cxlSubmitting, setCxlSubmitting] = useState(false)
  const [cxlError, setCxlError] = useState<string | null>(null)
  interface CxlPreview {
    booking_amount: number
    amount_paid: number
    cancellation_fee: number
    effective_penalty: number
    eligible_refund: number
    is_before_deadline: boolean
    cancellation_deadline: string | null
    policy_name: string
    policy_type: string
    policy_description: string
    fee_basis: string
    currency_symbol: string
  }
  const [cxlPreview, setCxlPreview] = useState<CxlPreview | null>(null)
  const [cxlPreviewLoading, setCxlPreviewLoading] = useState(false)

  useEffect(() => {
    if (!cancellingBooking) {
      setCxlPreview(null)
      return
    }
    setCxlPreviewLoading(true)
    call<CxlPreview>("izensphere_stay_and_dine.public_api.preview_guest_cancellation", {
      reference: cancellingBooking.reservation,
      phone: cancellingBooking.guest_phone || "",
      token: cancellingBooking.precheckin_token || "",
    })
      .then(setCxlPreview)
      .catch(() => setCxlPreview(null))
      .finally(() => setCxlPreviewLoading(false))
  }, [cancellingBooking])

  const auth = useAuth()
  const [showAuthModal, setShowAuthModal] = useState(false)

  const loadBookingHistory = useCallback(async (isRefresh = false) => {
    if (auth.status === "loading") return
    if (auth.status === "anon") {
      setLoading(false)
      setBookings([])
      return
    }

    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)

    // Check URL parameters and persist them
    if (urlRef || urlToken) {
      recordCustomerBooking(urlRef, urlToken)
    }

    try {
      const res = await call<HistoryResponse>(
        "izensphere_stay_and_dine.public_api.get_customer_booking_history",
        {},
      )

      if (res.found && res.bookings.length > 0) {
        setBookings(res.bookings)
        setCategories(res.categories)
        setCounts(res.counts)
        if (res.guest_name) setGuestName(res.guest_name)
      } else {
        setBookings([])
        setCategories({ upcoming: [], current: [], completed: [], cancelled: [] })
        setCounts({ all: 0, upcoming: 0, current: 0, completed: 0, cancelled: 0 })
        if (res.message && res.reason !== "no_bookings") {
          setError(res.message)
        }
      }
    } catch (e: unknown) {
      setError((e as Error).message || t("Could not load your booking history."))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [t, auth.status, urlRef, urlToken])

  useEffect(() => {
    loadBookingHistory()
  }, [loadBookingHistory])

  const toggleDetails = (resName: string) => {
    setExpandedDetails((prev) => ({
      ...prev,
      [resName]: !prev[resName],
    }))
  }

  const handleModificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!modifyingBooking || !modDetails.trim()) {
      setModError(t("Please describe your requested changes."))
      return
    }
    setModSubmitting(true)
    setModError(null)
    try {
      const res = await call<{ ok: boolean; message: string }>(
        "izensphere_stay_and_dine.public_api.request_booking_change",
        {
          reference: modifyingBooking.reservation,
          phone: modifyingBooking.guest_phone || "",
          token: modifyingBooking.precheckin_token || "",
          change_details: modDetails.trim(),
          preferred_dates: modDates.trim(),
        },
      )
      setSuccessMsg(res.message || t("Modification request submitted successfully."))
      setModifyingBooking(null)
      setModDetails("")
      setModDates("")
      loadBookingHistory(true)
    } catch (err: unknown) {
      setModError((err as Error).message || t("Failed to submit change request."))
    } finally {
      setModSubmitting(false)
    }
  }

  const handleCancellationSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cancellingBooking) return
    setCxlSubmitting(true)
    setCxlError(null)
    try {
      const res = await call<{ ok: boolean; message: string; cancellation_number: string }>(
        "izensphere_stay_and_dine.public_api.cancel_booking",
        {
          reference: cancellingBooking.reservation,
          phone: cancellingBooking.guest_phone || "",
          token: cancellingBooking.precheckin_token || "",
          reason: cxlReason,
          note: cxlNote.trim(),
        },
      )
      setSuccessMsg(
        t("Reservation {ref} cancelled. Cancellation reference: {cxl}", {
          ref: cancellingBooking.reservation,
          cxl: res.cancellation_number,
        }),
      )
      setCancellingBooking(null)
      setCxlNote("")
      loadBookingHistory(true)
    } catch (err: unknown) {
      setCxlError((err as Error).message || t("Failed to cancel reservation."))
    } finally {
      setCxlSubmitting(false)
    }
  }

  const statusBadgeVariant = (status: string) => {
    switch (status) {
      case "Confirmed":
      case "Checked In":
        return "bg-emerald-100 text-emerald-800 border-emerald-200"
      case "Checked Out":
        return "bg-zinc-100 text-zinc-800 border-zinc-200"
      case "Cancelled":
        return "bg-rose-100 text-rose-800 border-rose-200"
      default:
        return "bg-amber-100 text-amber-800 border-amber-200"
    }
  }

  const paymentBadgeVariant = (paymentStatus: string) => {
    switch (paymentStatus) {
      case "Paid":
        return "bg-emerald-100 text-emerald-800 border-emerald-200"
      case "Partially Paid":
        return "bg-amber-100 text-amber-800 border-amber-200"
      default:
        return "bg-rose-100 text-rose-800 border-rose-200"
    }
  }

  // Filter bookings based on active tab
  const displayedBookings =
    activeTab === "all"
      ? bookings
      : categories[activeTab] || []

  return (
    <div className="min-h-screen bg-zinc-50/60 pb-16">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm font-bold text-lg">
              IS
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900 tracking-tight">
                Izensphere Stay &amp; Dine
              </h1>
              <p className="text-xs text-zinc-500">
                {guestName ? t("Welcome back, {name}", { name: guestName }) : t("My Bookings & Stay History")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/book">
              <Button variant="outline" className="text-xs sm:text-sm">
                {t("Book a Stay")}
              </Button>
            </Link>
            {auth.status === "authed" ? (
              <Button
                variant="outline"
                onClick={() => auth.signOut()}
                className="text-xs sm:text-sm text-zinc-600 hover:text-zinc-900"
              >
                <LogOut className="size-3.5 mr-1.5" />
                {t("Sign out")}
              </Button>
            ) : (
              <Button
                onClick={() => setShowAuthModal(true)}
                className="text-xs sm:text-sm bg-emerald-700 hover:bg-emerald-800 text-white"
              >
                <LogIn className="size-3.5 mr-1.5" />
                {t("Sign In")}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6">
        {/* Global Success Notification */}
        {successMsg && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button
              onClick={() => setSuccessMsg(null)}
              className="rounded-lg p-1 text-emerald-600 hover:bg-emerald-100"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* Global Error Notification */}
        {error && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-sm">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="size-5 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="rounded-lg p-1 text-rose-600 hover:bg-rose-100"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* Header Title with 1-Click Refresh */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
              {t("My Bookings")}
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              {t("Automatic booking history, room assignments, stay details and printable vouchers.")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadBookingHistory(true)}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span>{refreshing ? t("Updating…") : t("Refresh")}</span>
            </button>
          </div>
        </div>

        {/* Category Tabs */}
        {bookings.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2 border-b border-zinc-200 pb-3">
            <button
              onClick={() => setActiveTab("all")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${activeTab === "all"
                ? "bg-zinc-900 text-white shadow-sm"
                : "bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50"
                }`}
            >
              {t("All Bookings")} ({counts.all})
            </button>
            <button
              onClick={() => setActiveTab("upcoming")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${activeTab === "upcoming"
                ? "bg-zinc-900 text-white shadow-sm"
                : "bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50"
                }`}
            >
              {t("Upcoming")} ({counts.upcoming})
            </button>
            <button
              onClick={() => setActiveTab("current")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${activeTab === "current"
                ? "bg-zinc-900 text-white shadow-sm"
                : "bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50"
                }`}
            >
              {t("Current Stays")} ({counts.current})
            </button>
            <button
              onClick={() => setActiveTab("completed")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${activeTab === "completed"
                ? "bg-zinc-900 text-white shadow-sm"
                : "bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50"
                }`}
            >
              {t("Completed")} ({counts.completed})
            </button>
            <button
              onClick={() => setActiveTab("cancelled")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${activeTab === "cancelled"
                ? "bg-zinc-900 text-white shadow-sm"
                : "bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50"
                }`}
            >
              {t("Cancelled")} ({counts.cancelled})
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="mt-12 flex flex-col items-center justify-center py-12">
            <RefreshCw className="size-8 animate-spin text-brand-600" />
            <p className="mt-3 text-sm text-zinc-500 font-medium">
              {t("Retrieving your booking history…")}
            </p>
          </div>
        )}

        {/* Unauthenticated State */}
        {!loading && auth.status === "anon" && (
          <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-8 sm:p-10 text-center shadow-sm">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <User className="size-7" />
            </div>
            <h3 className="mt-4 text-xl font-bold text-zinc-900">
              {t("Sign In to View Your Bookings")}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500 leading-relaxed">
              {t("Sign in or create an account to view your past and upcoming reservations, download booking vouchers, and access online check-in.")}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button
                onClick={() => setShowAuthModal(true)}
                className="bg-emerald-700 hover:bg-emerald-800 text-white px-6 py-2.5 text-sm font-semibold rounded-xl"
              >
                <LogIn className="size-4 mr-2" />
                {t("Sign In / Create Account")}
              </Button>
              <Link to="/book">
                <Button variant="outline" className="px-5 py-2.5 text-sm rounded-xl">
                  {t("Browse & Book Rooms")}
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Empty State when Authenticated but No Bookings Found */}
        {!loading && auth.status === "authed" && bookings.length === 0 && (
          <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-zinc-100">
              <History className="size-7 text-zinc-400" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-zinc-900">
              {t("No Bookings Found")}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-xs text-zinc-500 leading-relaxed">
              {t("You don't have any reservations linked to your account yet. When you book a room, your stay will appear here automatically.")}
            </p>
            <div className="mt-6 flex justify-center">
              <Link to="/book">
                <Button className="bg-emerald-700 hover:bg-emerald-800 text-white px-6 py-2.5 text-sm font-semibold rounded-xl">
                  {t("Book a Stay Now")}
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Empty state for filtered tab */}
        {!loading && bookings.length > 0 && displayedBookings.length === 0 && (
          <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
            <Layers className="mx-auto size-10 text-zinc-300" />
            <h3 className="mt-3 text-sm font-semibold text-zinc-800">
              {t("No bookings in this category")}
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              {t("You have no {tab} reservations at this time.", { tab: activeTab })}
            </p>
          </div>
        )}

        {/* Booking History List */}
        {!loading && displayedBookings.length > 0 && (
          <div className="mt-6 space-y-6">
            {displayedBookings.map((b) => {
              const isExpanded = Boolean(expandedDetails[b.reservation])
              return (
                <div
                  key={b.reservation}
                  className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:border-zinc-300"
                >
                  {/* Card Top Banner */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 bg-zinc-50/60 px-5 py-3.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-sm font-bold text-zinc-900">
                        {b.reservation}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeVariant(
                          b.status,
                        )}`}
                      >
                        {b.status}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${paymentBadgeVariant(
                          b.payment_status || "Unpaid",
                        )}`}
                      >
                        {t(b.payment_status || "Unpaid")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Building2 className="size-3.5 text-zinc-400" />
                      <span className="font-medium text-zinc-700">{b.property_name}</span>
                      {b.city && <span>· {b.city}</span>}
                    </div>
                  </div>

                  {/* Cancelled Banner if applicable */}
                  {b.status === "Cancelled" && (
                    <div className="border-b border-rose-200 bg-rose-50/70 px-5 py-2.5 text-xs text-rose-800 space-y-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <b>{t("Reservation Cancelled")}</b>
                          {b.cancellation_number && (
                            <span> · {t("Cancellation Ref")}: <span className="font-mono font-semibold">{b.cancellation_number}</span></span>
                          )}
                        </div>
                        {b.cancellation_reason && (
                          <span className="text-rose-600 font-medium">{b.cancellation_reason}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-zinc-600">
                        {b.cancellation_fee !== undefined && (
                          <span>{t("Fee Charged")}: <b className="text-zinc-800">₹{b.cancellation_fee.toLocaleString()}</b></span>
                        )}
                        {b.eligible_refund !== undefined && b.eligible_refund > 0 && (
                          <span className="text-emerald-700 font-semibold">
                            · {t("Eligible Refund")}: ₹{b.eligible_refund.toLocaleString()} ({b.refund_status || "Pending"})
                          </span>
                        )}
                        {b.cancellation_policy_type && (
                          <span className="text-zinc-400">· {b.cancellation_policy_type}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Policy Info for Active Bookings */}
                  {b.status !== "Cancelled" && b.cancellation_policy_description && (
                    <div className="border-b border-zinc-100 bg-zinc-50/50 px-5 py-1.5 text-[11px] text-zinc-500 flex items-center justify-between">
                      <span className="truncate">{b.cancellation_policy_description}</span>
                      {b.cancellation_deadline && (
                        <span className="text-zinc-400 shrink-0 font-mono text-[10px]">{t("Deadline")}: {b.cancellation_deadline.slice(0, 16)}</span>
                      )}
                    </div>
                  )}

                  {/* Modification Request Banner if applicable */}
                  {b.status !== "Cancelled" && b.special_requests && b.special_requests.includes("[Guest Change Request") && (
                    <div className="border-b border-amber-200 bg-amber-50/80 px-5 py-2.5 text-xs text-amber-900 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <Clock className="mt-0.5 size-4 shrink-0 text-amber-600" />
                        <div>
                          <span className="font-bold text-amber-900">{t("Stay Modification Requested")}:</span>{" "}
                          <span className="text-amber-800 font-medium">
                            {b.special_requests
                              .split("\n")
                              .filter((l) => l.trim() && !l.startsWith("[Guest Change Request"))
                              .slice(-2)
                              .join(" · ")}
                          </span>
                          <span className="ms-2 text-amber-700/80 italic">({t("Pending Front Desk review & approval")})</span>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-md bg-amber-100/90 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                        {t("Under Review")}
                      </span>
                    </div>
                  )}

                  {/* Card Content Grid (All 11 Core Fields Displayed) */}
                  <div className="grid grid-cols-1 gap-6 p-5 sm:grid-cols-2 lg:grid-cols-4">
                    {/* 1. Stay Dates */}
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                        {t("Stay Dates")}
                      </span>
                      <div className="mt-1.5 flex items-start gap-2 text-sm font-semibold text-zinc-900">
                        <Calendar className="mt-0.5 size-4 text-brand-600 shrink-0" />
                        <div>
                          <div>{b.check_in_date} → {b.check_out_date}</div>
                          <div className="text-xs font-normal text-zinc-500">
                            {b.nights} {b.nights === 1 ? t("night") : t("nights")}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 2. Room Category & Assigned Room Number */}
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                        {t("Room & Accommodation")}
                      </span>
                      <div className="mt-1.5 flex items-start gap-2 text-sm font-semibold text-zinc-900">
                        <BedDouble className="mt-0.5 size-4 text-brand-600 shrink-0" />
                        <div>
                          <div className="font-semibold">{b.room_type}</div>
                          <div className="text-xs font-medium text-brand-700">
                            {b.room_number || b.room ? (
                              <span className="inline-flex items-center gap-1">
                                <span className="rounded bg-brand-50 px-1.5 py-0.5 text-brand-800 font-semibold border border-brand-200">
                                  {t("Room {num}", { num: b.room_number || b.room })}
                                </span>
                              </span>
                            ) : (
                              <span className="text-zinc-500 font-normal">{t("Room assigned on arrival")}</span>
                            )}
                          </div>
                          <div className="text-xs font-normal text-zinc-500 mt-0.5">
                            {b.adults} {t("Adults")}{b.children > 0 ? `, ${b.children} ${t("Children")}` : ""}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 3. Meal Plan */}
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                        {t("Meal Plan")}
                      </span>
                      <div className="mt-1.5 flex items-start gap-2 text-sm font-semibold text-zinc-900">
                        <Utensils className="mt-0.5 size-4 text-brand-600 shrink-0" />
                        <div>
                          <div>{b.meal_plan_name || t("Room only")}</div>
                          <div className="text-xs font-normal text-zinc-500">
                            {b.meal_plan ? t("Included in rate") : t("Standard stay")}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 4. Total Amount & Payment Breakdown */}
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                        {t("Payment Summary")}
                      </span>
                      <div className="mt-1.5 text-sm">
                        <div className="flex items-baseline justify-between font-semibold text-zinc-900">
                          <span>{t("Total")}:</span>
                          <span>{b.currency_symbol}{b.grand_total.toLocaleString(moneyLocale())}</span>
                        </div>
                        <div className="mt-1 flex items-baseline justify-between text-xs text-zinc-500">
                          <span>{t("Paid")}:</span>
                          <span>{b.currency_symbol}{b.paid_amount.toLocaleString(moneyLocale())}</span>
                        </div>
                        <div className="mt-1 flex items-baseline justify-between font-semibold text-xs text-emerald-700">
                          <span>{t("Balance")}:</span>
                          <span>{b.currency_symbol}{b.balance.toLocaleString(moneyLocale())}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expandable Details Section */}
                  {isExpanded && (
                    <div className="border-t border-zinc-100 bg-zinc-50/60 p-5 text-xs text-zinc-600 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="flex items-center gap-2">
                          <Clock className="size-4 text-zinc-400 shrink-0" />
                          <span>{t("Check-in: {in} · Check-out: {out}", { in: b.checkin_time.slice(0, 5), out: b.checkout_time.slice(0, 5) })}</span>
                        </div>
                        {b.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="size-4 text-zinc-400 shrink-0" />
                            <span>{t("Desk")}: {b.phone}</span>
                          </div>
                        )}
                        {b.wifi_ssid && (
                          <div className="flex items-center gap-2">
                            <Wifi className="size-4 text-zinc-400 shrink-0" />
                            <span>Wi-Fi: <b>{b.wifi_ssid}</b> {b.wifi_password ? `(Key: ${b.wifi_password})` : ""}</span>
                          </div>
                        )}
                      </div>

                      {b.special_requests && (
                        <div className="rounded-lg bg-amber-50/70 p-3 border border-amber-200/60">
                          <span className="font-semibold text-zinc-800">{t("Special Requests / Stay Preferences")}: </span>
                          <span className="whitespace-pre-line text-zinc-700">{b.special_requests}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions & View Details Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 p-4 bg-zinc-50/20">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleDetails(b.reservation)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800"
                      >
                        <span>{isExpanded ? t("Hide Details") : t("View Details")}</span>
                        {isExpanded ? (
                          <ChevronUp className="size-3.5" />
                        ) : (
                          <ChevronDown className="size-3.5" />
                        )}
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Download Booking Voucher */}
                      <Button
                        variant="outline"
                        onClick={() => setVoucherBooking(b)}
                        className="gap-1.5 px-3 py-1.5 text-xs font-medium"
                      >
                        <Download className="size-3.5 text-zinc-500" />
                        {t("Booking Voucher")}
                      </Button>

                      {/* Request Modification */}
                      {b.status !== "Cancelled" && b.status !== "Checked Out" && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setModifyingBooking(b)
                            setModDetails("")
                            setModDates("")
                            setModError(null)
                          }}
                          className="gap-1.5 px-3 py-1.5 text-xs font-medium"
                        >
                          <Edit className="size-3.5 text-zinc-500" />
                          {t("Modify Stay")}
                        </Button>
                      )}

                      {/* Request Cancellation */}
                      {["Confirmed", "Draft", "Pending Payment"].includes(b.status) && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setCancellingBooking(b)
                            setCxlReason("Guest request")
                            setCxlNote("")
                            setCxlError(null)
                          }}
                          className="gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                        >
                          <X className="size-3.5 text-rose-500" />
                          {t("Cancel")}
                        </Button>
                      )}

                      {/* Online Pre-Check-in */}
                      {b.precheckin_token && b.status !== "Cancelled" && b.status !== "Checked Out" && (
                        <Link to={`/checkin/${b.precheckin_token}`}>
                          <Button className="gap-1.5 px-3 py-1.5 text-xs font-medium">
                            <ShieldCheck className="size-3.5" />
                            {b.precheckin_status === "Completed"
                              ? t("View Check-in Pass")
                              : t("Online Check-in")}
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ---------------- MODAL 1: BOOKING VOUCHER (PRINTABLE) ---------------- */}
      {voucherBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm overflow-y-auto">
          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              #printable-voucher, #printable-voucher * { visibility: visible !important; }
              #printable-voucher {
                position: fixed !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                max-width: 100% !important;
                margin: 0 !important;
                padding: 24px !important;
                border: none !important;
                box-shadow: none !important;
                background: white !important;
                z-index: 999999 !important;
              }
              .no-print { display: none !important; }
            }
          `}</style>
          <div
            id="printable-voucher"
            className="relative w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl sm:p-8 max-h-[90vh] overflow-y-auto"
          >
            {/* Modal Controls */}
            <div className="no-print mb-6 flex items-center justify-between border-b border-zinc-100 pb-4">
              <div className="flex items-center gap-2">
                <FileText className="size-5 text-brand-600" />
                <h3 className="text-base font-bold text-zinc-900">{t("Booking Voucher")}</h3>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => window.print()}
                  className="gap-1.5 px-3 py-1.5 text-xs font-semibold"
                >
                  <Printer className="size-3.5" />
                  {t("Print / Save as PDF")}
                </Button>
                <button
                  onClick={() => setVoucherBooking(null)}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>

            {/* Voucher Document Header */}
            <div className="border-b-2 border-zinc-900 pb-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-black tracking-tight text-zinc-900 sm:text-2xl">
                    {voucherBooking.property_name}
                  </h2>
                  <p className="text-xs text-zinc-600 mt-1">
                    {voucherBooking.city} {voucherBooking.phone ? `· Direct: ${voucherBooking.phone}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-block rounded border border-brand-300 bg-brand-50 px-2.5 py-1 font-mono text-xs font-bold text-brand-900">
                    {voucherBooking.reservation}
                  </span>
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">
                    {t("Official Confirmation")}
                  </p>
                </div>
              </div>
            </div>

            {/* Guest & Reservation Metadata */}
            <div className="mt-6 grid grid-cols-2 gap-4 border-b border-zinc-200 pb-6 text-xs sm:grid-cols-4">
              <div>
                <span className="text-zinc-500 font-medium uppercase tracking-wider">{t("Guest Name")}</span>
                <p className="mt-1 font-bold text-zinc-900 text-sm">{voucherBooking.guest_name}</p>
                {voucherBooking.guest_phone && (
                  <p className="text-zinc-600 mt-0.5">{voucherBooking.guest_phone}</p>
                )}
              </div>
              <div>
                <span className="text-zinc-500 font-medium uppercase tracking-wider">{t("Stay Status")}</span>
                <p className="mt-1">
                  <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeVariant(voucherBooking.status)}`}>
                    {voucherBooking.status}
                  </span>
                </p>
              </div>
              <div>
                <span className="text-zinc-500 font-medium uppercase tracking-wider">{t("Payment Status")}</span>
                <p className="mt-1">
                  <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${paymentBadgeVariant(voucherBooking.payment_status || "Unpaid")}`}>
                    {voucherBooking.payment_status || "Unpaid"}
                  </span>
                </p>
              </div>
              <div>
                <span className="text-zinc-500 font-medium uppercase tracking-wider">{t("Occupancy")}</span>
                <p className="mt-1 font-bold text-zinc-900 text-sm">
                  {voucherBooking.adults} {t("Adults")}{voucherBooking.children > 0 ? `, ${voucherBooking.children} ${t("Children")}` : ""}
                </p>
              </div>
            </div>

            {/* Accommodation Details */}
            <div className="mt-6 space-y-4 border-b border-zinc-200 pb-6 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-zinc-50 p-4 rounded-xl border border-zinc-200/60">
                <div>
                  <span className="text-xs font-medium text-zinc-500">{t("Check-in Date & Time")}</span>
                  <p className="font-bold text-zinc-900">{voucherBooking.check_in_date}</p>
                  <p className="text-xs text-zinc-600">{t("From {time}", { time: voucherBooking.checkin_time.slice(0, 5) })}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-zinc-500">{t("Check-out Date & Time")}</span>
                  <p className="font-bold text-zinc-900">{voucherBooking.check_out_date}</p>
                  <p className="text-xs text-zinc-600">{t("Until {time}", { time: voucherBooking.checkout_time.slice(0, 5) })} ({voucherBooking.nights} {voucherBooking.nights === 1 ? t("night") : t("nights")})</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-medium text-zinc-500">{t("Room Category")}</span>
                  <p className="font-bold text-zinc-900">{voucherBooking.room_type}</p>
                  <p className="text-xs text-brand-700 font-medium mt-0.5">
                    {voucherBooking.room_number || voucherBooking.room ? `${t("Room")} ${voucherBooking.room_number || voucherBooking.room}` : t("Room assigned on arrival")}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium text-zinc-500">{t("Meal Plan")}</span>
                  <p className="font-bold text-zinc-900">{voucherBooking.meal_plan_name || t("Room only")}</p>
                </div>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="mt-6 border-b border-zinc-200 pb-6">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">{t("Billing Summary")}</h4>
              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-zinc-700">
                  <span>{t("Total Amount (incl. taxes)")}</span>
                  <span className="font-semibold text-zinc-900">
                    {voucherBooking.currency_symbol}{voucherBooking.grand_total.toLocaleString(moneyLocale())}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>{t("Advance Paid")}</span>
                  <span>{voucherBooking.currency_symbol}{voucherBooking.paid_amount.toLocaleString(moneyLocale())}</span>
                </div>
                <div className="flex justify-between border-t border-zinc-200 pt-2 font-bold text-emerald-800">
                  <span>{t("Balance Due at Check-in")}</span>
                  <span>{voucherBooking.currency_symbol}{voucherBooking.balance.toLocaleString(moneyLocale())}</span>
                </div>
              </div>
            </div>

            {/* Check-in Guidelines */}
            <div className="mt-6 rounded-xl bg-zinc-50 p-4 text-xs text-zinc-600 border border-zinc-200/60 space-y-2">
              <p className="font-semibold text-zinc-800">{t("Guest Information & Check-in Rules")}:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>{t("All adult guests must carry a valid government-approved Photo ID (Passport, Aadhaar, Voter Card, or Driver's License) for check-in registration.")}</li>
                <li>{t("Standard Check-in starts at {in} and Check-out is by {out}.", { in: voucherBooking.checkin_time.slice(0, 5), out: voucherBooking.checkout_time.slice(0, 5) })}</li>
                {voucherBooking.wifi_ssid && (
                  <li>{t("Wi-Fi network")}: <b>{voucherBooking.wifi_ssid}</b> {voucherBooking.wifi_password ? `(Password: ${voucherBooking.wifi_password})` : ""}</li>
                )}
              </ul>
            </div>

            <div className="no-print mt-6 flex justify-end">
              <Button onClick={() => setVoucherBooking(null)} variant="outline" className="px-3 py-1.5 text-xs">
                {t("Close")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- MODAL 2: REQUEST MODIFICATION ---------------- */}
      {modifyingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <Edit className="size-5 text-brand-600" />
                <h3 className="text-base font-bold text-zinc-900">{t("Request Stay Modification")}</h3>
              </div>
              <button
                onClick={() => setModifyingBooking(null)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                <X className="size-5" />
              </button>
            </div>

            <p className="mt-3 text-xs text-zinc-500">
              {t("Request date adjustments, occupancy changes or special arrangements for booking")} <b className="font-mono text-zinc-800">{modifyingBooking.reservation}</b>. {t("Our Front Desk will review availability and confirm your request.")}
            </p>

            <form onSubmit={handleModificationSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700">
                  {t("Preferred Dates / Stay Extension (Optional)")}
                </label>
                <input
                  type="text"
                  placeholder={t("e.g. Change check-in to 2026-12-01 or extend 1 night")}
                  value={modDates}
                  onChange={(e) => setModDates(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-300 bg-zinc-50/50 px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-brand-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700">
                  {t("Modification Details & Special Preferences")} *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder={t("Describe the changes you would like to request (e.g. extra adult, twin beds setup, early check-in at 11am)...")}
                  value={modDetails}
                  onChange={(e) => setModDetails(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-300 bg-zinc-50/50 p-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-brand-600 focus:bg-white focus:outline-none"
                />
              </div>

              {modError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {modError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModifyingBooking(null)}
                  disabled={modSubmitting}
                >
                  {t("Cancel")}
                </Button>
                <Button type="submit" disabled={modSubmitting || !modDetails.trim()}>
                  {modSubmitting ? t("Submitting…") : t("Submit Request")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- MODAL 3: REQUEST CANCELLATION ---------------- */}
      {cancellingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-rose-600" />
                <h3 className="text-base font-bold text-zinc-900">{t("Cancel Reservation")}</h3>
              </div>
              <button
                onClick={() => setCancellingBooking(null)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                <X className="size-5" />
              </button>
            </div>

            {cxlPreviewLoading ? (
              <div className="py-6 text-center text-xs text-zinc-500 animate-pulse">
                {t("Loading cancellation policy and refund details…")}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3.5 text-xs text-zinc-700 space-y-2.5">
                <div className="flex items-center justify-between font-semibold text-zinc-900">
                  <span>{cxlPreview?.policy_name || t("Hotel Cancellation Policy")}</span>
                  <span className="text-[11px] text-brand-700 font-medium">{cxlPreview?.policy_type}</span>
                </div>
                <p className="leading-relaxed text-zinc-600">
                  {cxlPreview?.policy_description || t("Applicable hotel cancellation policies and rules will be enforced.")}
                </p>
                {cxlPreview?.cancellation_deadline && (
                  <p className="text-[11px] text-zinc-500">
                    {cxlPreview.is_before_deadline
                      ? t("Free cancellation available until {d}", { d: cxlPreview.cancellation_deadline })
                      : t("Free cancellation deadline ended on {d}", { d: cxlPreview.cancellation_deadline })}
                  </p>
                )}

                {/* Refund & Fee Breakdown */}
                {cxlPreview && (
                  <div className="grid grid-cols-3 gap-2 border-t border-zinc-200/80 pt-2 text-center text-[11px]">
                    <div className="rounded-lg bg-white p-2 border border-zinc-100">
                      <span className="block text-zinc-400">{t("Amount Paid")}</span>
                      <span className="font-semibold text-zinc-900">{cxlPreview.currency_symbol}{cxlPreview.amount_paid.toLocaleString()}</span>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-zinc-100">
                      <span className="block text-zinc-400">{t("Cancel Fee")}</span>
                      <span className={`font-semibold ${cxlPreview.cancellation_fee > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                        {cxlPreview.currency_symbol}{cxlPreview.cancellation_fee.toLocaleString()}
                      </span>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-zinc-100">
                      <span className="block text-zinc-400">{t("Eligible Refund")}</span>
                      <span className="font-semibold text-emerald-700">
                        {cxlPreview.currency_symbol}{cxlPreview.eligible_refund.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                {cxlPreview && cxlPreview.eligible_refund > 0 && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
                    <b>{t("Eligible Refund: {amt}", { amt: `${cxlPreview.currency_symbol}${cxlPreview.eligible_refund.toLocaleString()}` })}</b>
                    <p className="mt-0.5 text-[10px] text-emerald-700">{t("Refund will be processed according to the hotel's payment workflow.")}</p>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleCancellationSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700">
                  {t("Reason for Cancellation")}
                </label>
                <select
                  value={cxlReason}
                  onChange={(e) => setCxlReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-300 bg-zinc-50/50 px-3.5 py-2.5 text-sm text-zinc-900 focus:border-brand-600 focus:bg-white focus:outline-none"
                >
                  <option value="Guest request">{t("Guest request")}</option>
                  <option value="Change of plans">{t("Change of plans")}</option>
                  <option value="Duplicate booking">{t("Duplicate booking")}</option>
                  <option value="Weather / travel disruption">{t("Weather / travel disruption")}</option>
                  <option value="Payment failed">{t("Payment failed")}</option>
                  <option value="Other">{t("Other reason")}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700">
                  {t("Optional Note for Hotel Staff")}
                </label>
                <textarea
                  rows={2}
                  placeholder={t("Any feedback or notes...")}
                  value={cxlNote}
                  onChange={(e) => setCxlNote(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-300 bg-zinc-50/50 p-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-brand-600 focus:bg-white focus:outline-none"
                />
              </div>

              {cxlError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {cxlError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCancellingBooking(null)}
                  disabled={cxlSubmitting}
                >
                  {t("Keep Booking")}
                </Button>
                <Button
                  type="submit"
                  disabled={cxlSubmitting}
                  className="bg-rose-600 hover:bg-rose-700 text-white"
                >
                  {cxlSubmitting ? t("Processing…") : t("Confirm Cancellation")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <CustomerAuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => {
          setShowAuthModal(false)
          loadBookingHistory(true)
        }}
        title={t("Customer Account")}
        subtitle={t("Sign in or create an account to view your bookings.")}
      />
    </div>
  )
}
