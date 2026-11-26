/*  Rooms screen + Today layout: typed calls to izensphere_stay_and_dine.rooms.* and
    izensphere_stay_and_dine.today_layout.*. Reads only; room changes go through the existing
    writers (set_housekeeping_status, room blocks, check-in/out, moves). */

import { call, getCurrentProperty } from "./api"

export type HkStatus =
  | "Clean"
  | "Dirty"
  | "Cleaning in Progress"
  | "Inspected"
  | "Ready"
  | "Out of Order"
  | "Maintenance"

export interface RoomPermissions {
  supervise: boolean
  block: boolean
  desk: boolean
  money: boolean
}

export type ReservationStatus =
  | "Available"
  | "Temporary Hold"
  | "Reserved"
  | "Occupied"
  | "Blocked"
  | "Out of Service"

export interface ReservationDetailInfo {
  name: string
  guest_name: string
  guest_phone: string
  guest_email: string
  source: string
  source_label: string
  status: string
  check_in_date: string
  check_out_date: string
  is_check_in: boolean
  is_check_out: boolean
  advance_paid: number
  amount_after_tax: number
}

export interface DayStatusInfo {
  date: string
  reservation_status: ReservationStatus
  housekeeping_status: HkStatus
  is_check_in: boolean
  is_check_out: boolean
  reservation?: ReservationDetailInfo
}

export interface BoardRoom {
  name: string
  room_number: string
  room_type: string
  room_type_name: string
  floor: string | null
  housekeeping_status: HkStatus
  occupancy_status: "Vacant" | "Occupied" | "Reserved"
  reservation_status: ReservationStatus
  reservation_details?: ReservationDetailInfo | null
  days?: Record<string, DayStatusInfo>
  stay: {
    reservation: string
    guest_name: string
    surname: string | null
    check_in_date: string
    check_out_date: string
    departing_today: boolean
    day_use: boolean
  } | null
  arrival: {
    reservation: string
    guest_name: string
    surname: string | null
    eta: string | null
  } | null
  block: {
    name: string
    reason: string
    from_date: string
    to_date: string
    note: string | null
  } | null
  task: {
    name: string
    type: string
    status: string
    priority: string
    assignee: string | null
  } | null
}

export interface RoomsSummary {
  total: number
  available: number
  reserved: number
  occupied: number
  temporary_hold: number
  blocked: number
  out_of_service: number
  arrivals: number
  departures: number
  dirty: number
  clean: number
  inspected: number
  cleaning: number
  maintenance: number
}

export interface RoomsBoard {
  from_date?: string
  date: string
  to_date?: string
  today?: string
  view?: string
  dates?: string[]
  rooms: BoardRoom[]
  room_types: { name: string; room_type_name: string }[]
  summary?: RoomsSummary
  can: RoomPermissions
}

export const getRoomsBoard = (
  date?: string,
  toDate?: string,
  view: string = "daily",
  fromDate?: string,
) =>
  call<RoomsBoard>("izensphere_stay_and_dine.rooms.rooms_board", {
    property: getCurrentProperty(),
    from_date: fromDate || date || undefined,
    date: date || fromDate || undefined,
    to_date: toDate || undefined,
    view: view || undefined,
  })

export interface RoomDetail {
  date: string
  room: {
    name: string
    property: string
    room_number: string
    room_type: string
    room_type_name: string
    floor: string | null
    housekeeping_status: HkStatus
    occupancy_status: "Vacant" | "Occupied" | "Reserved"
    notes: string | null
  }
  room_type: {
    name?: string
    room_type_name?: string
    room_category?: string | null
    description?: string | null
    bed_type?: string | null
    room_view?: string | null
    amenities?: string | null
    air_conditioning?: string | null
    bathroom?: string | null
    smoking_allowed?: number
    kitchen?: number
    adults_capacity?: number
    children_capacity?: number
    max_extra_beds?: number
  }
  photos: string[]
  stay: {
    name: string
    guest: string
    guest_name: string
    check_in_date: string
    check_out_date: string
    nights: number
    adults: number
    children: number
    company: string | null
    departing_today: boolean
    total?: number
    paid?: number
    balance_due?: number
  } | null
  next_arrival: {
    name: string
    guest_name: string
    check_in_date: string
    check_out_date: string
    nights: number
    adults: number
    children: number
    eta: string | null
    arriving_today: boolean
  } | null
  blocks: {
    name: string
    reason: string
    from_date: string
    to_date: string
    note: string | null
    current: boolean
  }[]
  tasks: {
    name: string
    task_type: string
    status: string
    priority: string
    assignee: string | null
    due_by: string | null
    notes: string | null
  }[]
  can: RoomPermissions
}

export const getRoomDetail = (room: string) =>
  call<RoomDetail>("izensphere_stay_and_dine.rooms.room_detail", { room })

export interface AvailabilityCell {
  date: string
  state: "free" | "booked" | "blocked"
  reservation?: string
  guest_name?: string
  status?: string
  arrives?: boolean
  reason?: string
  note?: string | null
}

export interface RoomAvailability {
  room: string
  room_number: string
  start: string
  days: number
  cells: AvailabilityCell[]
  summary: { free: number; booked: number; blocked: number }
}

export const getRoomAvailability = (room: string, days: number) =>
  call<RoomAvailability>("izensphere_stay_and_dine.rooms.room_availability", { room, days })

export interface RoomHistory {
  room: string
  room_number: string
  money: boolean
  stays: {
    name: string
    guest_name: string
    status: string
    check_in_date: string
    check_out_date: string
    nights: number
    revenue?: number
    revenue_source?: "posted" | "booked"
    room_assigned_by_name: string | null
    room_assigned_at: string | null
    checked_in_by_name: string | null
  }[]
  housekeeping: {
    task: string
    type: string
    status: string
    priority: string
    assigned_to: string | null
    created: string
    started_by: string | null
    started_at: string | null
    cleaned_by: string | null
    cleaned_at: string | null
    inspected_by: string | null
    inspected_at: string | null
    minutes: number | null
    notes: string | null
  }[]
  status_changes: { by: string; at: string; change: string }[]
  tickets: {
    name: string
    subject: string
    category: string
    priority: string
    status: string
    assigned_to: string | null
    creation: string
    resolved_on: string | null
    resolution_note: string | null
  }[]
  moves: {
    reservation: string
    guest_name: string | null
    by: string
    at: string
    direction: "in" | "out"
    other_room: string | null
    other_room_number: string | null
    note: string | null
  }[]
}

export const getRoomHistory = (room: string) =>
  call<RoomHistory>("izensphere_stay_and_dine.rooms.room_history", { room })

export interface InsightRoom {
  room: string
  room_number: string
  room_type_name: string
  floor: string | null
  nights: number
  stays: number
  revenue: number | null
  out_of_service_nights: number
  sellable_nights: number
  occupancy_pct: number
  cleans: number
  avg_clean_minutes: number | null
}

export interface RoomInsights {
  property: string
  days: number
  from_date: string
  to_date: string
  money: boolean
  summary: {
    rooms: number
    room_nights: number
    occupancy_pct: number
    revenue: number | null
    out_of_service_nights: number
    avg_clean_minutes: number | null
    timed_cleans: number
  }
  most_used: InsightRoom[]
  least_used: InsightRoom[]
  rooms: InsightRoom[]
}

export const getRoomInsights = (days: number, from_date?: string, to_date?: string) =>
  call<RoomInsights>("izensphere_stay_and_dine.rooms.room_insights", {
    property: getCurrentProperty(),
    days,
    from_date,
    to_date,
  })

// --- Today layout -------------------------------------------------------------

export type WidgetId =
  | "kpis"
  | "booking_requests"
  | "arrivals"
  | "departures"
  | "room_board"
  | "in_house"
  | "housekeeping"
  | "open_tasks"

export interface TodayLayout {
  top: WidgetId[]
  left: WidgetId[]
  right: WidgetId[]
  hidden: WidgetId[]
}

export interface TodayLayoutInfo {
  layout: TodayLayout
  source: "user" | "property" | "default"
  property_default: TodayLayout
  built_in: TodayLayout
  can_set_default: boolean
}

/** The classic Today, used until the server answers (and if it can't). */
export const DEFAULT_TODAY_LAYOUT: TodayLayout = {
  top: ["kpis"],
  left: ["booking_requests", "arrivals", "departures"],
  right: ["room_board", "in_house", "housekeeping", "open_tasks"],
  hidden: ["open_tasks"],
}

const LS_KEY = "kamra_today_layout"

/** Last layout seen, so Today paints in the right shape before the server
 * answers, and still works if the preference call fails. */
export function cachedLayout(): TodayLayout | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as TodayLayout) : null
  } catch {
    return null
  }
}

function remember(info: TodayLayoutInfo) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(info.layout))
  } catch {
    /* private mode: the server copy is the real one */
  }
  return info
}

export const getTodayLayout = () =>
  call<TodayLayoutInfo>("izensphere_stay_and_dine.today_layout.get_today_layout", {
    property: getCurrentProperty(),
  }).then(remember)

export const saveTodayLayout = (layout: TodayLayout) =>
  call<TodayLayoutInfo>("izensphere_stay_and_dine.today_layout.save_today_layout", {
    layout,
    property: getCurrentProperty(),
  }).then(remember)

export const resetTodayLayout = () =>
  call<TodayLayoutInfo>("izensphere_stay_and_dine.today_layout.reset_today_layout", {
    property: getCurrentProperty(),
  }).then(remember)

export const saveTodayLayoutDefault = (layout: TodayLayout | null) =>
  call<TodayLayoutInfo>("izensphere_stay_and_dine.today_layout.save_today_layout_default", {
    property: getCurrentProperty(),
    layout,
  }).then(remember)
