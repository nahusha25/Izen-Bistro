// Thin client for Kamra's whitelisted API. Session-cookie auth via
// Frappe's /api/method/login; unauthenticated calls surface as 401/403
// and the shell shows the login screen.

// The served boot page injects the session's CSRF token as window.csrf_token
// (see kamra/www/izensphere_stay_and_dine.py). Frappe enforces it on POSTs from a logged-in
// session; guests and the dev server (ignore_csrf) don't need it.
import { htmlToText } from "./utils"
import { t as translate } from "./i18n"

function csrfToken(): string | undefined {
  const t = (window as unknown as { csrf_token?: string }).csrf_token
  return t && t !== "None" ? t : undefined
}

/** Marks errors where the request never reached the server (offline, server
 * restarting). Callers keep the user's session and data intact for these. */
export function isNetworkError(err: unknown): boolean {
  return Boolean((err as { network?: boolean }).network)
}

async function doFetch(path: string, init?: RequestInit) {
  const token = csrfToken()
  const request = () =>
    fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "X-Frappe-CSRF-Token": token } : {}),
        ...(init?.headers as Record<string, string> | undefined),
      },
      credentials: "include",
    })
  let res: Response
  try {
    res = await request()
  } catch {
    // the request never left: wifi blip, server restarting. One quiet retry
    // covers most of these without the user ever seeing an error.
    await new Promise((r) => setTimeout(r, 800))
    try {
      res = await request()
    } catch (err) {
      console.warn(`[kamra] network failure calling ${path}`, err)
      window.dispatchEvent(new Event("izensphere_stay_and_dine:offline"))
      throw Object.assign(
        new Error("Can't reach Izensphere Stay and Dine right now. Check your connection - we'll reconnect automatically."),
        { network: true },
      )
    }
  }
  window.dispatchEvent(new Event("izensphere_stay_and_dine:online"))
  if (!res.ok) {
    const body = await res.text()
    // A 401/403 on anything other than the auth endpoints means the session may
    // be gone. Signal the auth layer to re-check (and redirect to /login if so)
    // instead of leaving a dead screen. Login's own 401 (wrong password) is
    // excluded so it doesn't trigger a session re-check.
    if (
      (res.status === 401 || res.status === 403) &&
      !path.includes("/api/method/login")
    ) {
      window.dispatchEvent(new Event("izensphere_stay_and_dine:auth-error"))
    }
    throw httpError(res.status, body, res.headers.get("Retry-After"))
  }
  return res.json()
}

/** An HTTP failure whose message is already safe to show (see serverError);
 *  status and raw body ride along for callers that branch on them. */
function httpError(status: number, body: string, retryAfter?: string | null): Error {
  const err = Object.assign(new Error(), { status, body, retryAfter: retryAfter || undefined })
  err.message = serverError(err)
  if (status >= 500) console.warn(`[kamra] server error ${status}`, body.slice(0, 2000))
  return err
}

/** Turn any API failure into one short sentence for a person. Messages from
 *  frappe.throw are written for users and pass through; tracebacks, Python
 *  exception names and raw status lines never do. */
export function serverError(e: unknown): string {
  const { status, body, network, retryAfter } = e as { status?: number; body?: string; network?: boolean; retryAfter?: string }
  if (network) return translate((e as Error).message)
  let parsed: { exc_type?: string; exception?: string; _server_messages?: string } = {}
  try {
    parsed = body ? JSON.parse(body) : {}
  } catch {
    /* not JSON (proxy error page) */
  }
  if (status === 401 || parsed.exc_type === "SessionExpired")
    return translate("Your session ended. Please sign in again.")
  // 5xx is an unhandled crash (frappe.throw answers 4xx): the text is internals
  if (!status || status < 500) {
    try {
      const msgs = JSON.parse(parsed._server_messages ?? "[]")
      const text = msgs.length ? htmlToText(String(JSON.parse(msgs[0]).message)).trim() : ""
      if (text && !/Traceback|File ".*", line \d+/.test(text)) return translate(text)
    } catch {
      /* fall through */
    }
    // "frappe.exceptions.ValidationError: Room is occupied" -> "Room is occupied"
    const exc = String(parsed.exception ?? "").replace(/^[\w.]+(Error|Exception):\s*/, "").trim()
    if (exc && !/^[\w.]+$/.test(exc) && !exc.includes("Traceback")) return translate(exc)
  }
  if (status === 403)
    return translate("You don't have permission for that, or your session ended - sign in again if this persists.")
  if (status === 404) return translate("That record wasn't found - it may have been removed.")
  if (status === 429) {
    if (retryAfter) {
      const secs = Number(retryAfter)
      if (Number.isFinite(secs) && secs > 0) {
        const mins = Math.ceil(secs / 60)
        return secs >= 60
          ? translate("Too many booking requests. Please try again in {n} minutes.", { n: mins })
          : translate("Too many booking requests. Please try again in {n} seconds.", { n: secs })
      }
      return translate("Too many booking requests. Please try again after {time}.", { time: retryAfter })
    }
    return translate("Too many requests - give it a few seconds and try again.")
  }
  if (status && status >= 500)
    return translate("Something went wrong on the server. Try again in a moment.")
  if (status) return translate("That didn't go through. Please try again.")
  console.warn("[kamra] unexpected error", e)
  return translate("Something unexpected went wrong. Try again - if it keeps happening, let your admin know.")
}

export async function login(usr: string, pwd: string) {
  await doFetch("/api/method/login", {
    method: "POST",
    body: JSON.stringify({ usr, pwd }),
  })
}

export async function logout() {
  await doFetch("/api/method/logout", { method: "POST" })
}

/** Upload an image to Frappe's public files; resolves to its served URL.
 *  Pass doctype/docname/fieldname so Attach Image fields keep a real File
 *  link - otherwise the URL shows in the form but is easy to lose on save. */
export async function uploadFile(
  file: File,
  opts?: { doctype?: string; docname?: string; fieldname?: string },
): Promise<string> {
  const token = csrfToken()
  const fd = new FormData()
  fd.append("file", file, file.name)
  fd.append("is_private", "0")
  if (opts?.doctype) fd.append("doctype", opts.doctype)
  if (opts?.docname) fd.append("docname", opts.docname)
  if (opts?.fieldname) fd.append("fieldname", opts.fieldname)
  const res = await fetch("/api/method/upload_file", {
    method: "POST",
    // no Content-Type header: the browser sets the multipart boundary
    headers: token ? { "X-Frappe-CSRF-Token": token } : undefined,
    body: fd,
    credentials: "include",
  })
  if (!res.ok) throw httpError(res.status, await res.text())
  const out = (await res.json()) as { message?: { file_url?: string } }
  const url = out.message?.file_url
  if (!url) throw new Error("upload returned no file URL")
  return url
}

/** Upload a file to a custom Kamra endpoint (multipart), returning its result.
 *  Unlike uploadFile (Frappe's built-in upload_file, which authorises against
 *  the target doctype's own perms), this posts to a @require_roles endpoint that
 *  handles the File itself - the pattern the rest of Izensphere Stay and Dine uses. */
export async function uploadTo(
  method: string,
  file: File,
  fields: Record<string, string> = {},
): Promise<{ file_url: string; file_name: string }> {
  const token = csrfToken()
  const fd = new FormData()
  fd.append("file", file, file.name)
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  const res = await fetch(`/api/method/${method}`, {
    method: "POST",
    headers: token ? { "X-Frappe-CSRF-Token": token } : undefined,
    body: fd,
    credentials: "include",
  })
  if (!res.ok) throw httpError(res.status, await res.text())
  const out = (await res.json()) as {
    message?: { file_url?: string; file_name?: string }
  }
  if (!out.message?.file_url) throw new Error("upload returned no file URL")
  return out.message as { file_url: string; file_name: string }
}

export async function frappeFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  return (await doFetch(path, init)) as T
}

/** A fresh idempotency key: one per money action, reused on its retries. */
export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function call<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const data = await frappeFetch<{ message: T }>(`/api/method/${method}`, {
    method: "POST",
    body: JSON.stringify(params),
  })
  return data.message
}

/** Call an allow_guest endpoint as a guest, whoever is logged in.
 *  Public pages (booking, listings) must not ride the staff session: a CSRF
 *  token captured at page load goes stale the moment someone logs in or out
 *  in another tab, and Frappe then rejects every POST with a 400. Without
 *  the cookie there is no session, so no CSRF check and no auth redirect. */
export async function callGuest<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const path = `/api/method/${method}`
  let res: Response
  try {
    // no auto-retry here: guest calls include book/pay, which must not repeat
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      credentials: "omit",
    })
  } catch (err) {
    console.warn(`[kamra] network failure calling ${path}`, err)
    window.dispatchEvent(new Event("izensphere_stay_and_dine:offline"))
    throw Object.assign(
      new Error("You seem to be offline. Check your connection and try again."),
      { network: true },
    )
  }
  window.dispatchEvent(new Event("izensphere_stay_and_dine:online"))
  if (!res.ok) throw httpError(res.status, await res.text())
  return ((await res.json()) as { message: T }).message
}

export interface WhoAmI {
  user: string
  full_name: string
  email?: string
  phone?: string
  roles: string[]
}

export const whoami = () => call<WhoAmI>("izensphere_stay_and_dine.api.whoami")

/** Which parts of Izensphere Stay and Dine this property runs. Empty on the server means
 *  "all of them", so an existing property is untouched. */
export const enabledModules = () =>
  call<string[]>("izensphere_stay_and_dine.api.enabled_modules", {
    property: getCurrentProperty(),
  })

export interface ReservationRow {
  name: string
  guest_name: string
  room_type: string
  room: string | null
  status: string
  source: string
  check_in_date: string
  check_out_date: string
  nights: number
  adults: number
  children: number
  special_requests: string | null
  channel: string | null
  precheckin_status: "Not Started" | "Submitted" | "Verified" | null
  eta: string | null
  precheckin_token: string | null
  booked_by_name: string | null
  booked_by_phone: string | null
  booker_relation: string | null
  contact_preference: "Guest" | "Booker" | "Both" | null
  company: string | null
  paid_total: number
  balance_due: number
}

export interface RoomRow {
  name: string
  room_number: string
  room_type: string
  floor: string | null
  housekeeping_status: "Clean" | "Dirty" | "Inspected" | "Out of Order"
  occupancy_status: "Vacant" | "Occupied"
}

export interface Snapshot {
  date: string
  arrivals: ReservationRow[]
  departures: ReservationRow[]
  in_house: ReservationRow[]
  rooms: RoomRow[]
  minutes_saved_30d: number
}

export interface CalendarCell {
  date: string
  available: number
  rate: number
}

export interface CalendarRow {
  room_type: string
  room_type_name: string
  total_rooms: number
  cells: CalendarCell[]
}

export interface CalendarData {
  start: string
  days: number
  dates: string[]
  room_types: CalendarRow[]
}

export interface BookingOptions {
  room_types: {
    name: string
    room_type_name: string
    room_type_code?: string
    room_category?: string | null
    base_price: number
    adults_capacity: number
    children_capacity: number
    max_extra_beds?: number
    image?: string | null
    description?: string | null
    bed_type?: string | null
    room_view?: string | null
    media?: { media_type: string; url: string; caption?: string | null }[]
  }[]
  meal_plans: {
    name: string
    code: string
    label: string
    price_per_adult: number
    is_default: 0 | 1
  }[]
  rate_plans: {
    name: string
    rate_plan_name: string
    code: string
    is_default?: 0 | 1
  }[]
  companies: {
    name: string
    company_name: string
    negotiated_rate_plan?: string | null
  }[]
  travel_agents: { name: string; agent_name: string; commission_pct: number }[]
  ota_channels?: string[]
  /** each OTA's default commission % (its Travel Agent record of type OTA) */
  ota_commission?: Record<string, number>
  experiences: {
    name: string
    experience_name: string
    category: string | null
    price: number
    gst_rate: number
  }[]
  property: {
    sell_message: string | null
    free_cancel_days: number
    cancellation_fee: "None" | "First Night" | "Full Stay"
    no_show_charge: "None" | "First Night" | "Full Stay"
    deposit_pct: number
    country: string
    pets_allowed: 0 | 1
    pet_charge: number
    pet_charge_basis: "Per stay" | "Per night"
  }
}

export interface Quote {
  nights: number
  /** same-day stay: nights is 0 and one date is billed */
  day_use?: boolean
  nightly: { date: string; rate: number }[]
  room_total: number
  meal_total: number
  /** the rate plan the price is on - picked, or the company's negotiated one */
  rate_plan?: string | null
  /** guests above the room's capacity, at the price agreed on the booking */
  over_capacity_total?: number
  pet_charge?: number
  discount: number
  /** long-stay discount already taken off room_total */
  long_stay?: { rule: string; min_nights: number; percent: number; amount: number } | null
  /** advance the stay's dates ask for: a season's %, else the property's */
  advance?: { percent: number; season: string | null; amount: number }
  amount_before_tax: number
  tax_percent: number
  tax_amount: number
  amount_after_tax: number
  /** what cancelling would cost, judged from today by the same rules as
   * cancellation_preview - free_until is never in the past */
  cancellation?: CancellationOutlook
}

export interface CancellationOutlook {
  free_now: boolean
  /** last free date; null while free_now means free up to arrival */
  free_until: string | null
  fee_basis: string
  /** "the first night", "50% of the stay" */
  fee_label: string
  non_refundable_season: string | null
}

export const DEMO_PROPERTY = "Izensphere Stay and Dine"

// Every Izensphere Stay and Dine site hosts exactly one Property. The public booking engine
// (/book) has no logged-in session to read a chosen property from, so it
// asks the site which one to show instead of assuming the demo property.
export const getDefaultProperty = () =>
  callGuest<string>("izensphere_stay_and_dine.public_api.default_property")

// Active property - set by the header switcher, read at call time.
let currentProperty =
  localStorage.getItem("kamra_property") || DEMO_PROPERTY

export function getCurrentProperty() {
  return currentProperty
}

export function setCurrentProperty(p: string) {
  currentProperty = p
  localStorage.setItem("kamra_property", p)
}

export interface PropertyRow {
  name: string
  property_name: string
  city: string | null
}

export const myProperties = () =>
  call<PropertyRow[]>("izensphere_stay_and_dine.api.my_properties")

export const getSnapshot = (date?: string, toDate?: string) =>
  call<Snapshot>("izensphere_stay_and_dine.api.front_desk_snapshot", {
    property: getCurrentProperty(),
    ...(date ? { date } : {}),
    ...(toDate ? { to_date: toDate } : {}),
  })

export const getCalendar = (days = 14, startDate?: string) =>
  call<CalendarData>("izensphere_stay_and_dine.api.availability_calendar", {
    property: getCurrentProperty(),
    days,
    start_date: startDate ?? null,
  })

export const getBookingOptions = () =>
  call<BookingOptions>("izensphere_stay_and_dine.api.booking_options", {
    property: getCurrentProperty(),
  })

export interface RoomAvailabilitySummaryItem {
  room_type: string
  room_type_name: string
  room_type_code?: string
  total: number
  available: number
  booked: number
  maintenance: number
  out_of_service: number
  base_price: number
  adults_capacity: number
  children_capacity: number
  max_extra_beds: number
  image?: string | null
  description?: string | null
  bed_type?: string | null
  room_view?: string | null
  media?: { media_type: string; url: string; caption?: string | null }[]
}

export interface AvailableRoomItem {
  name: string
  room_number: string
  room_type: string
  floor?: string
  housekeeping_status: string
  status: "Available" | "Occupied" | "Maintenance" | "Out of Service"
  is_available: boolean
  conflict_reason?: string | null
  guest_name?: string | null
}

export interface BookingAvailabilityResult {
  property: string
  check_in_date: string
  check_out_date: string
  is_day_use: number
  summary: RoomAvailabilitySummaryItem[]
  rooms: AvailableRoomItem[]
}

export const getBookingAvailability = (params: {
  property?: string
  check_in_date: string
  check_out_date: string
  room_type?: string
  adults?: number
  children?: number
  is_day_use?: number
  check_in_time?: string
  check_out_time?: string
  ready_now?: number
}) =>
  call<BookingAvailabilityResult>("izensphere_stay_and_dine.api.get_booking_availability", {
    property: params.property || getCurrentProperty(),
    ...params,
  })

export interface QuoteParams {
  room_type: string
  check_in_date: string
  check_out_date: string
  adults: number
  children: number
  meal_plan?: string
  /** blank: the company's negotiated plan applies (server-side) */
  rate_plan?: string
  /** the Corporate Account the stay is for - prices on its negotiated plan */
  company?: string
  voucher_code?: string
  over_capacity_charge?: number
  pets?: number
}

export const getQuote = (params: QuoteParams) =>
  call<Quote>("izensphere_stay_and_dine.api.get_quote", { property: getCurrentProperty(), ...params })

export interface GuestHit {
  name: string
  full_name: string
  phone: string | null
  email: string | null
  vip: 0 | 1
  blacklisted: 0 | 1
  blacklist_reason?: string | null
  stays: number
  last_stay: string | null
}

export const guestSearch = (q: string) =>
  call<GuestHit[]>("izensphere_stay_and_dine.api.guest_search", { q })

/** Server-side blacklist check for the guest a booking would attach to:
 *  the picked profile, else the profile matching this phone. */
export interface GuestAlert {
  guest: string | null
  full_name?: string | null
  blacklisted: 0 | 1
  blacklist_reason: string | null
  can_override?: 0 | 1
}

export const guestAlert = (params: { guest?: string; phone?: string }) =>
  call<GuestAlert>("izensphere_stay_and_dine.api.guest_alert", params)

export const setGuestBlacklist = (guest: string, blacklisted: boolean, reason: string) =>
  call<{ guest: string; blacklisted: 0 | 1; blacklist_reason: string | null }>(
    "izensphere_stay_and_dine.api.set_guest_blacklist",
    { guest, blacklisted: blacklisted ? 1 : 0, reason },
  )

export const createBooking = (
  params: QuoteParams & {
    guest_name: string
    phone?: string
    guest?: string
    room?: string
    company?: string
    travel_agent?: string
    booking_type?: string
    booked_by_name?: string
    booked_by_phone?: string
    booker_relation?: string
    contact_preference?: string
    waitlist?: number
    over_capacity_reason?: string
    over_capacity_guests?: number
    over_capacity_charge?: number
    addons?: { experience: string; qty: number }[]
    guest_category?: string
    stay_details?: Record<string, unknown>
    instructions?: { department: string; instruction: string }[]
    /** HH:MM - a day-use slot, or the ETA / ETD of an overnight stay */
    check_in_time?: string
    check_out_time?: string
    blacklist_override_reason?: string
    /** Finance / Hotel Admin only: book past a company credit block (logged) */
    credit_override_reason?: string
    booked_via?: string
    ota_ref?: string
    ota_total?: number
    ota_commission_pct?: number
    marketing_consent?: number
    market_segment?: string
  },
) =>
  call<{
    reservation: string
    room: string | null
    amount_after_tax: number
    status?: string
    credit_warning?: { company: string; reasons: string[]; overridden: boolean }
  }>("izensphere_stay_and_dine.api.create_booking", { property: getCurrentProperty(), ...params })

/** Request to Book: confirm the stay and take a room (refused, with the
 * reason, when the dates sold out meanwhile). */
export const acceptBookingRequest = (reservation: string, room?: string) =>
  call<{ reservation: string; status: string; room: string | null; notified: string[] }>(
    "izensphere_stay_and_dine.booking_requests.accept_booking_request",
    { reservation, ...(room ? { room } : {}) },
  )

/** Request to Book: decline with a reason (sent to the guest), no fee. */
export const declineBookingRequest = (reservation: string, reason: string) =>
  call<{ reservation: string; status: string; notified: string[]; note?: string }>(
    "izensphere_stay_and_dine.booking_requests.decline_booking_request",
    { reservation, reason },
  )

export const promoteWaitlist = (reservation: string) =>
  call<{ ok: boolean; reservation: string; room: string }>(
    "izensphere_stay_and_dine.api.promote_waitlist",
    { reservation },
  )

// --- Assistant conversations (full-page module) ---
export interface ChatMsg {
  role: "user" | "assistant"
  content: string
  actions?: { tool: string; ok: boolean }[]
  /** Stays and quotes the turn touched (izensphere_stay_and_dine.assistant._turn_cards). */
  cards?: import("../components/AgentCards").AgentCard[]
}
export interface ConversationSummary {
  name: string
  title: string
  modified: string
}
export const listConversations = () =>
  call<ConversationSummary[]>("izensphere_stay_and_dine.assistant.list_conversations", {
    property: getCurrentProperty(),
  })
export const getConversation = (name: string) =>
  call<{ name: string; title: string; messages: ChatMsg[] }>(
    "izensphere_stay_and_dine.assistant.get_conversation",
    { name },
  )
export const createConversation = (title?: string) =>
  call<{ name: string; title: string }>("izensphere_stay_and_dine.assistant.create_conversation", {
    property: getCurrentProperty(),
    title: title ?? "New chat",
  })
export const saveConversation = (
  name: string,
  messages: ChatMsg[],
  title?: string,
) =>
  call<{ ok: boolean }>("izensphere_stay_and_dine.assistant.save_conversation", {
    name,
    messages,
    title: title ?? null,
  })
export const deleteConversation = (name: string) =>
  call<{ ok: boolean }>("izensphere_stay_and_dine.assistant.delete_conversation", { name })

export const checkIn = (reservation: string) =>
  call("izensphere_stay_and_dine.api.check_in", { reservation })

export const checkOut = (reservation: string) =>
  call("izensphere_stay_and_dine.api.check_out", { reservation })

export const setHousekeepingStatus = (room: string, status: string) =>
  call("izensphere_stay_and_dine.api.set_housekeeping_status", { room, status })

export interface ReservationDetail {
  name: string
  /** set when the stay is one room of a group booking */
  group: { name: string; group_name: string; rooms: number; to_check_in: number } | null
  status: string
  source: string | null
  channel: string | null
  booking_type: string | null
  property: string
  check_in_date: string
  check_out_date: string
  nights: number
  adults: number
  children: number
  room: string | null
  room_type: string | null
  room_type_name: string | null
  meal_plan: string | null
  /** The meal plan's label - meal_plan is its internal ID. */
  meal_plan_name?: string | null
  rate_plan: string | null
  special_requests: string | null
  eta: string | null
  /** Flagged late: the night audit holds it as Due In, not a no-show. */
  late_arrival?: number
  /** Everyone on the register and when each arrived / left */
  occupants?: { full_name: string; arrived_at: string | null; left_at: string | null }[]
  /** Set when an early check-out shortened the stay */
  booked_check_out_date?: string | null
  early_departure_reason?: string | null
  /** Room rate confirmed per night at booking - what the folio bills. */
  night_rates?: { date: string; rate: number; demand_premium_pct: number }[]
  precheckin_status: string | null
  precheckin_token: string | null
  amount_after_tax: number
  advance_paid: number
  company: string | null
  travel_agent: string | null
  room_number: string | null
  folio_name: string | null
  money: {
    total: number
    paid: number
    due: number
    has_folio: boolean
    // "folio" once the stay has started or ended with a folio; "none" when
    // a no-show / cancellation never opened one (nothing owed)
    source?: "folio" | "booking" | "none"
    /** No-show / cancelled with no folio: the advance to hand back. */
    refund_due?: number
  }
  /** Deposit before arrival (#114): expected by policy, received, still due. */
  deposit: import("../components/DepositPanel").DepositState
  /** the refundable security (damage) deposit; null if it could not be read */
  security_deposit: import("../components/SecurityDepositPanel").SecurityDepositState | null
  guest: {
    name: string
    full_name: string
    phone: string | null
    email: string | null
    vip: 0 | 1
    blacklisted: 0 | 1
    stays: number
    last_stay: string | null
  } | null
  booker: {
    name: string
    phone: string | null
    relation: string | null
    contact_preference: string | null
  } | null
  cancellation: {
    reason: string | null
    note: string | null
    number: string | null
    fee: number
    cancelled_on: string | null
  } | null
  id_document: string | null
  id_document_source: string | null
  id_document_on: string | null
  id_document_discarded: 0 | 1
  precheckin_verified_by: string | null
  precheckin_verified_on: string | null
  actions: {
    can_check_in: boolean
    can_check_out: boolean
    can_cancel: boolean
    can_amend: boolean
    can_reinstate: boolean
  }
  /** Things the desk should see but which must never gate an arrival. Kept
   *  apart from `actions` on purpose: a missing ID is a warning, not a
   *  capability, and conflating the two is how check-in quietly gets blocked. */
  warnings: {
    id_document_missing: boolean
    id_unverified: boolean
  }
  /** Soft-required check-in steps still open (finish after the guest is in). */
  checkin_backfill: { step: string; title: string; tip: string }[]
}

export const reservationDetail = (name: string) =>
  call<ReservationDetail>("izensphere_stay_and_dine.api.reservation_detail", { reservation: name })

/** The ID scan as a data URL. Served through a role-gated endpoint rather than
 *  its /private/files/ URL: Frappe would authorise that via the Reservation's
 *  doctype perms, which this site's Custom DocPerm rows deny to Front Desk. */
export const idDocumentImage = (reservation: string) =>
  call<{ data: string; captured_on: string }>("izensphere_stay_and_dine.api.id_document_image", { reservation })

/** Images kept on the guest profile: an optional photo, the ID, the address proof. */
export type GuestFileKind = "photo" | "id" | "address"
export const guestFile = (guest: string, kind: GuestFileKind) =>
  call<{ data: string; is_image: boolean }>("izensphere_stay_and_dine.guest_documents.guest_file", { guest, kind })
export const saveGuestFile = (guest: string, kind: GuestFileKind, data: string) =>
  call<{ ok: boolean }>("izensphere_stay_and_dine.guest_documents.save_guest_file", { guest, kind, data })
export const removeGuestFile = (guest: string, kind: GuestFileKind) =>
  call<{ ok: boolean }>("izensphere_stay_and_dine.guest_documents.remove_guest_file", { guest, kind })

export const verifyPrecheckin = (reservation: string) =>
  call<{ ok: boolean; status: string }>("izensphere_stay_and_dine.api.verify_precheckin", { reservation })

export const developerInfo = () =>
  call<{ user: string; has_key: boolean; base_url: string }>(
    "izensphere_stay_and_dine.api.developer_info",
  )

export const generateApiKey = () =>
  call<{ api_key: string; api_secret: string }>("izensphere_stay_and_dine.api.generate_api_key")

/** What an amendment would do to the bill (amend_stay_preview /
 * room_move_preview). A booking bills the nightly rates confirmed at
 * booking; a change to what is sold re-quotes them, and the server refuses
 * the change unless the new price is confirmed. */
export interface RepricePreview {
  current_amount: number
  new_amount: number
  difference: number
  needs_confirmation: boolean
  nights: { date: string; rate: number; demand_premium_pct: number }[]
  /** a stay in house: what the rate-change policy does to nights already
   * on the folio (kept at their charged rate, or credited by Kamra) */
  charged_nights?: {
    policy: string
    nights: { date: string; charged: number; new: number; action: string }[]
    kept_difference: number
    credit_total: number
  }
}

export const amendStayPreview = (
  reservation: string,
  check_in_date: string,
  check_out_date: string,
) =>
  call<RepricePreview>("izensphere_stay_and_dine.api.amend_stay_preview", {
    reservation,
    check_in_date,
    check_out_date,
  })

export const amendStay = (
  reservation: string,
  check_in_date: string,
  check_out_date: string,
  confirm_price = 0,
) =>
  call<{ nights: number; amount_after_tax: number }>("izensphere_stay_and_dine.api.amend_stay", {
    reservation,
    check_in_date,
    check_out_date,
    confirm_price,
  })

/** Preview the new price, ask the user when it changes, then amend with the
 * price confirmed. Resolves null when the user declines. */
export async function amendStayConfirmed(
  reservation: string,
  check_in_date: string,
  check_out_date: string,
  ask: (p: RepricePreview) => boolean,
) {
  const p = await amendStayPreview(reservation, check_in_date, check_out_date)
  if (p.needs_confirmation && !ask(p)) return null
  return amendStay(reservation, check_in_date, check_out_date, p.needs_confirmation ? 1 : 0)
}

export const setLateArrival = (reservation: string, late_arrival: boolean, eta?: string) =>
  call<{ ok: boolean }>("izensphere_stay_and_dine.api.set_late_arrival", {
    reservation,
    late_arrival: late_arrival ? 1 : 0,
    ...(eta !== undefined ? { eta } : {}),
  })
