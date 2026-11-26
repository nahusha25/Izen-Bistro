/*  Room Board: every room today. Every room as a tile by floor, with what is
    happening in it today. Tap a room for its full story (RoomDrawer);
    Insights shows which rooms sell, earn and get cleaned, and how fast.
    For the desk and housekeeping supervisors; sized for a tablet. */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useOutletContext, useSearchParams } from "react-router-dom"
import {
  BedDouble,
  ChevronLeft,
  ChevronRight,
  Globe,
  Lock,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  User,
} from "lucide-react"
import type { ShellContext } from "../AppShell"
import {
  getRoomsBoard,
  type BoardRoom,
  type RoomsBoard,
} from "../lib/rooms"
import { serverError } from "../lib/resource"
import { useT, t as translate } from "../lib/i18n"
import { cn } from "../lib/utils"
import { Button } from "../components/ui/button"
import RoomDrawer from "../components/RoomDrawer"
import RoomInsights from "../components/RoomInsights"
import CheckOutDialog from "../components/CheckOutDialog"
import CheckInDialog from "../components/CheckInDialog"
import RoomChangeDialog from "../components/RoomChangeDialog"
import DateFilterBar from "../components/DateFilterBar"

const NO_FLOOR = "__none__"

function formatYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function parseYMD(str: string): Date {
  const [y, m, d] = str.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function addDaysYMD(ymd: string, days: number): string {
  const dt = parseYMD(ymd)
  dt.setDate(dt.getDate() + days)
  return formatYMD(dt)
}

function formatDateDisplay(ymd: string): string {
  try {
    const dt = parseYMD(ymd)
    return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  } catch {
    return ymd
  }
}

function formatDayOfWeek(ymd: string): string {
  try {
    const dt = parseYMD(ymd)
    return dt.toLocaleDateString(undefined, { weekday: "short" })
  } catch {
    return ""
  }
}

type StatusFilter =
  | "all"
  | "available"
  | "reserved"
  | "occupied"
  | "temporary_hold"
  | "blocked"
  | "online"
  | "direct"
  | "walk_in"
  | "dirty"
  | "cleaning"
  | "clean"
  | "inspected"
  | "out_of_order"
  | "maintenance"
  | "arriving"
  | "departing"
  | "task"

function matches(r: BoardRoom, f: StatusFilter) {
  switch (f) {
    case "available":
      return r.reservation_status === "Available"
    case "reserved":
      return r.reservation_status === "Reserved" || (!!r.arrival && r.reservation_status !== "Occupied")
    case "occupied":
      return r.reservation_status === "Occupied"
    case "temporary_hold":
      return r.reservation_status === "Temporary Hold"
    case "blocked":
      return r.reservation_status === "Blocked" || !!r.block
    case "online":
      return (
        r.reservation_details?.source_label === "Online" ||
        r.reservation_details?.source === "Website"
      )
    case "direct":
      return r.reservation_details?.source_label === "Direct"
    case "walk_in":
      return r.reservation_details?.source_label === "Walk-in"
    case "dirty":
      return r.housekeeping_status === "Dirty"
    case "cleaning":
      return (
        r.housekeeping_status === "Cleaning in Progress" ||
        (!!r.task && r.task.status === "In Progress")
      )
    case "clean":
      return r.housekeeping_status === "Clean"
    case "inspected":
      return r.housekeeping_status === "Inspected" || r.housekeeping_status === "Ready"
    case "out_of_order":
      return r.reservation_status === "Out of Service" || !!r.block || r.housekeeping_status === "Out of Order"
    case "maintenance":
      return (
        r.housekeeping_status === "Maintenance" ||
        (!!r.task && r.task.type === "Maintenance")
      )
    case "departing":
      return !!r.stay?.departing_today || !!r.reservation_details?.is_check_out
    case "arriving":
      return !!r.arrival || !!r.reservation_details?.is_check_in
    case "task":
      return !!r.task
    default:
      return true
  }
}

function SourceBadge({ source }: { source: string }) {
  const { t } = useT()
  if (source === "Online" || source === "Website") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 border border-emerald-200">
        <Globe className="size-2.5" />
        {t("Online")}
      </span>
    )
  }
  if (source === "Walk-in") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-800 border border-purple-200">
        <User className="size-2.5" />
        {t("Walk-in")}
      </span>
    )
  }
  if (source.startsWith("OTA")) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
        {source}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800 border border-sky-200">
      {t("Direct")}
    </span>
  )
}

export default function Rooms() {
  const { t } = useT()
  const { refreshKey } = useOutletContext<ShellContext>()
  const [params, setParams] = useSearchParams()
  const view = params.get("view") === "insights" ? "insights" : "board"
  const open = params.get("room")

  const todayStr = useMemo(() => formatYMD(new Date()), [])
  const tomorrowStr = useMemo(() => addDaysYMD(todayStr, 1), [todayStr])

  const fromDateParam = params.get("from_date") || params.get("date") || ""
  const toDateParam = params.get("to_date") || ""
  const boardViewParam = (params.get("board_view") as "daily" | "weekly" | "monthly") || "daily"

  // Two independent variables for From Date and To Date
  const [fromDate, setFromDate] = useState<string>(fromDateParam || todayStr)
  const [toDate, setToDate] = useState<string>(
    toDateParam || (fromDateParam ? addDaysYMD(fromDateParam, 1) : tomorrowStr),
  )
  const [boardView, setBoardView] = useState<"daily" | "weekly" | "monthly">(boardViewParam)
  const [dateError, setDateError] = useState<string | null>(null)

  const [board, setBoard] = useState<RoomsBoard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [floor, setFloor] = useState("all")
  const [type, setType] = useState("all")
  const [status, setStatus] = useState<StatusFilter>("all")

  // dialogs the drawer hands off to (the drawer hides while one is open)
  const [checkingOut, setCheckingOut] = useState<string | null>(null)
  const [checkingIn, setCheckingIn] = useState<string | null>(null)
  const [moving, setMoving] = useState<{ res: string; number: string } | null>(null)
  const [drawerKey, setDrawerKey] = useState(0)

  const load = useCallback(
    (targetFrom?: string, targetTo?: string, targetView?: "daily" | "weekly" | "monthly") => {
      const f = targetFrom !== undefined ? targetFrom : fromDate
      const to = targetTo !== undefined ? targetTo : toDate
      const v = targetView !== undefined ? targetView : boardView

      // If invalid date range, halt backend API request
      if (f && to && f > to) {
        return
      }

      getRoomsBoard(f || undefined, to || undefined, v, f || undefined)
        .then((b) => {
          setBoard(b)
          setError(null)
        })
        .catch((e) => setError(serverError(e)))
    },
    [fromDate, toDate, boardView],
  )

  useEffect(() => {
    load()
    const id = setInterval(() => load(), 30_000)
    return () => clearInterval(id)
  }, [load, refreshKey])

  const setParam = (k: string, v: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (v === null) n.delete(k)
        else n.set(k, v)
        return n
      },
      { replace: k !== "room" },
    )

  const updateUrlDates = useCallback(
    (newFrom?: string, newTo?: string, viewMode?: string) => {
      setParams(
        (p) => {
          const n = new URLSearchParams(p)
          if (newFrom) {
            n.set("from_date", newFrom)
            n.set("date", newFrom)
          } else {
            n.delete("from_date")
            n.delete("date")
          }
          if (newTo) {
            n.set("to_date", newTo)
          } else {
            n.delete("to_date")
          }
          if (viewMode && viewMode !== "daily") {
            n.set("board_view", viewMode)
          } else {
            n.delete("board_view")
          }
          return n
        },
        { replace: true },
      )
    },
    [setParams],
  )

  useEffect(() => {
    const f = params.get("from_date") || params.get("date")
    const to = params.get("to_date")
    const v = (params.get("board_view") as "daily" | "weekly" | "monthly") || "daily"

    let changed = false
    if (f && f !== fromDate) {
      setFromDate(f)
      changed = true
    }
    if (to && to !== toDate) {
      setToDate(to)
      changed = true
    }
    if (v !== boardView) {
      setBoardView(v)
      changed = true
    }
    if (changed) {
      const activeF = f || fromDate
      const activeTo = to || toDate
      if (activeF && activeTo && activeF <= activeTo) {
        setDateError(null)
        load(activeF, activeTo, v)
      }
    }
  }, [params])

  const currentDate = fromDate || todayStr
  const isToday = currentDate === todayStr

  const handleRangeChange = (newFrom: string, newTo: string) => {
    setFromDate(newFrom)
    setToDate(newTo)

    if (newFrom && newTo && newFrom > newTo) {
      setDateError(translate("To Date must be greater than or equal to From Date."))
      return
    }

    setDateError(null)
    updateUrlDates(newFrom, newTo, boardView)
    load(newFrom, newTo, boardView)
  }

  const handleSelectDate = (newDate: string) => {
    const newFrom = newDate
    const newTo = toDate && toDate >= newFrom ? toDate : addDaysYMD(newFrom, 1)
    setFromDate(newFrom)
    setToDate(newTo)
    setDateError(null)
    updateUrlDates(newFrom, newTo, boardView)
    load(newFrom, newTo, boardView)
  }

  const handleViewChange = (v: "daily" | "weekly" | "monthly") => {
    setBoardView(v)
    updateUrlDates(fromDate, toDate, v)
    load(fromDate, toDate, v)
  }

  const shiftDate = (days: number) => {
    const nextFrom = addDaysYMD(fromDate, days)
    const span = Math.max(
      1,
      Math.round((parseYMD(toDate).getTime() - parseYMD(fromDate).getTime()) / 86400000),
    )
    const nextTo = addDaysYMD(nextFrom, span)
    handleRangeChange(nextFrom, nextTo)
  }

  const rooms = board?.rooms ?? []
  const floorOf = (r: BoardRoom) => (r.floor || "").trim() || NO_FLOOR
  const floors = useMemo(
    () =>
      Array.from(new Set(rooms.map(floorOf))).sort((a, b) =>
        a === NO_FLOOR ? 1 : b === NO_FLOOR ? -1 : a.localeCompare(b, undefined, { numeric: true }),
      ),
    [rooms],
  )
  const shown = rooms.filter(
    (r) =>
      (floor === "all" || floorOf(r) === floor) &&
      (type === "all" || r.room_type === type) &&
      matches(r, status) &&
      (!q.trim() ||
        r.room_number.toLowerCase().includes(q.trim().toLowerCase()) ||
        (r.stay?.guest_name ?? "").toLowerCase().includes(q.trim().toLowerCase()) ||
        (r.arrival?.guest_name ?? "").toLowerCase().includes(q.trim().toLowerCase()) ||
        (r.reservation_details?.guest_name ?? "").toLowerCase().includes(q.trim().toLowerCase()) ||
        (r.reservation_details?.name ?? "").toLowerCase().includes(q.trim().toLowerCase())),
  )

  const count = (f: StatusFilter) => {
    if (board?.summary) {
      switch (f) {
        case "all":
          return board.summary.total
        case "available":
          return board.summary.available
        case "reserved":
          return board.summary.reserved
        case "occupied":
          return board.summary.occupied
        case "temporary_hold":
          return board.summary.temporary_hold
        case "blocked":
          return board.summary.blocked
        case "arriving":
          return board.summary.arrivals
        case "departing":
          return board.summary.departures
        case "dirty":
          return board.summary.dirty
        case "clean":
          return board.summary.clean
        case "inspected":
          return board.summary.inspected
        case "cleaning":
          return board.summary.cleaning
        case "maintenance":
          return board.summary.maintenance
        case "out_of_order":
          return board.summary.out_of_service
      }
    }
    return rooms.filter((r) => matches(r, f)).length
  }

  const chips: { id: StatusFilter; label: string }[] = [
    { id: "all", label: t("All rooms") },
    { id: "available", label: t("Available") },
    { id: "reserved", label: t("Reserved") },
    { id: "occupied", label: t("Occupied") },
    { id: "temporary_hold", label: t("Temporary Hold") },
    { id: "blocked", label: t("Blocked") },
    { id: "online", label: t("Online Bookings") },
    { id: "arriving", label: t("Expected Arrivals") },
    { id: "departing", label: t("Expected Departures") },
    { id: "dirty", label: t("Dirty") },
    { id: "clean", label: t("Clean") },
    { id: "inspected", label: t("Inspected") },
    { id: "cleaning", label: t("Cleaning in Progress") },
    { id: "maintenance", label: t("Maintenance") },
    { id: "out_of_order", label: t("Out of Service") },
  ]

  const floorLabel = (f: string) =>
    f === NO_FLOOR ? t("No floor set") : /floor/i.test(f) ? f : t("Floor {f}", { f })
  const dialogOpen = !!(checkingOut || checkingIn || moving)

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-zinc-900">{t("Room Board")}</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {t(
              "Real-time reservation availability, housekeeping status, online bookings, and room lifecycle management.",
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Main Board vs Insights switcher */}
          <div role="tablist" className="flex rounded-lg border border-zinc-200 bg-white p-0.5">
            {(["board", "insights"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setParam("view", v === "board" ? null : v)}
                className={cn(
                  "min-h-10 rounded-md px-4 text-sm font-medium",
                  view === v ? "bg-brand-600 text-white" : "text-zinc-600 hover:bg-zinc-50",
                )}
              >
                {v === "board" ? t("Board") : t("Insights")}
              </button>
            ))}
          </div>

          <Button variant="outline" className="min-h-10" onClick={() => load()} aria-label={t("Refresh")}>
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {translate(error)}
        </div>
      )}

      {view === "insights" ? (
        <RoomInsights onOpenRoom={(r) => setParam("room", r)} />
      ) : (
        <>
          {/* View Mode Controls: Daily | Weekly | Monthly */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {t("View Mode")}:
              </span>
              <div className="flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5">
                {(["daily", "weekly", "monthly"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleViewChange(m)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition",
                      boardView === m
                        ? "bg-white text-brand-700 shadow-sm"
                        : "text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900",
                    )}
                  >
                    {t(m)}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick date navigators for Weekly/Monthly view */}
            {boardView !== "daily" ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => shiftDate(boardView === "weekly" ? -7 : -30)}
                  className="h-8 gap-1 px-2.5 text-xs"
                >
                  <ChevronLeft className="size-3.5" />
                  {boardView === "weekly" ? t("Prev Week") : t("Prev Month")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleSelectDate(todayStr)}
                  className={cn("h-8 px-2.5 text-xs", isToday && "border-brand-600 text-brand-700 font-semibold")}
                >
                  {t("Today")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => shiftDate(boardView === "weekly" ? 7 : 30)}
                  className="h-8 gap-1 px-2.5 text-xs"
                >
                  {boardView === "weekly" ? t("Next Week") : t("Next Month")}
                  <ChevronRight className="size-3.5" />
                </Button>
                <span className="ms-2 text-xs font-medium text-zinc-600">
                  {board?.dates && board.dates.length > 0 && (
                    <>
                      {formatDateDisplay(board.dates[0])} – {formatDateDisplay(board.dates[board.dates.length - 1])}
                      {" "}({board.dates.length} {t("days")})
                    </>
                  )}
                </span>
              </div>
            ) : (
              <div className="text-xs text-zinc-500 font-medium">
                {isToday ? t("Showing status for Today") : t("Showing status for {d}", { d: currentDate })}
              </div>
            )}
          </div>

          {/* Unified Date Filter Control with Single Day and From Date - To Date support */}
          {boardView === "daily" && (
            <div className="mb-4 space-y-1">
              <DateFilterBar
                mode="range"
                allowModeToggle
                date={fromDate}
                onDateChange={handleSelectDate}
                fromDate={fromDate}
                toDate={toDate}
                onRangeChange={handleRangeChange}
                label="Room Status Date"
              />
              {dateError && (
                <div className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
                  <span aria-hidden>⚠️</span>
                  <span>{dateError}</span>
                </div>
              )}
            </div>
          )}

          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="relative block min-w-0">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("Room number, guest, or booking ref")}
                aria-label={t("Room number, guest, or booking ref")}
                className="min-h-11 w-full rounded-lg border border-zinc-300 bg-white ps-9 pe-3 text-base"
              />
            </label>
            <select
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              aria-label={t("Floor")}
              className="min-h-11 w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 text-base"
            >
              <option value="all">{t("All floors")}</option>
              {floors.map((f) => (
                <option key={f} value={f}>
                  {floorLabel(f)}
                </option>
              ))}
            </select>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              aria-label={t("Room type")}
              className="min-h-11 w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 text-base"
            >
              <option value="all">{t("All room types")}</option>
              {(board?.room_types ?? []).map((rt) => (
                <option key={rt.name} value={rt.name}>
                  {rt.room_type_name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={c.id}
                onClick={() => setStatus(c.id)}
                aria-pressed={status === c.id}
                className={cn(
                  "min-h-10 rounded-full border px-3 text-sm font-medium transition",
                  status === c.id
                    ? "border-brand-600 bg-brand-600 text-white shadow-xs"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400",
                )}
              >
                {translate(c.label)}
                <span className="ms-1.5 tabular-nums opacity-85 font-semibold">({count(c.id)})</span>
              </button>
            ))}
          </div>

          {!board ? (
            !error && <p className="text-sm text-zinc-400">{t("Loading…")}</p>
          ) : shown.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
              {t("No room matches these filters.")}
            </p>
          ) : boardView === "daily" ? (
            /* Daily View: Floor-by-floor Room Cards */
            <div className="space-y-5">
              {floors
                .filter((f) => shown.some((r) => floorOf(r) === f))
                .map((f) => (
                  <section key={f} className="min-w-0">
                    <h2 className="mb-2 text-sm font-semibold text-zinc-600">{floorLabel(f)}</h2>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2.5">
                      {shown
                        .filter((r) => floorOf(r) === f)
                        .map((r) => (
                          <RoomTile key={r.name} r={r} onOpen={() => setParam("room", r.name)} />
                        ))}
                    </div>
                  </section>
                ))}
            </div>
          ) : (
            /* Weekly / Monthly Matrix Grid View */
            <MatrixView
              board={board}
              dates={board.dates || [currentDate]}
              rooms={shown}
              onOpenRoom={(roomName) => setParam("room", roomName)}
            />
          )}

          <Legend isToday={isToday} />
        </>
      )}

      {open && !dialogOpen && (
        <RoomDrawer
          room={open}
          reloadKey={drawerKey}
          onClose={() => setParam("room", null)}
          onChanged={load}
          onCheckOut={setCheckingOut}
          onCheckIn={setCheckingIn}
          onMove={(res, number) => setMoving({ res, number })}
        />
      )}
      {checkingOut && (
        <CheckOutDialog
          reservation={checkingOut}
          onClose={() => setCheckingOut(null)}
          onDone={() => {
            setCheckingOut(null)
            setDrawerKey((k) => k + 1)
            load()
          }}
          onOpenReservation={(name) => setCheckingOut(name)}
        />
      )}
      {checkingIn && (
        <CheckInDialog
          reservation={checkingIn}
          onClose={() => setCheckingIn(null)}
          onDone={() => {
            setCheckingIn(null)
            setDrawerKey((k) => k + 1)
            load()
          }}
        />
      )}
      {moving && (
        <RoomChangeDialog
          reservation={moving.res}
          currentRoomNumber={moving.number}
          onClose={() => setMoving(null)}
          onMoved={() => {
            setMoving(null)
            setDrawerKey((k) => k + 1)
            load()
          }}
        />
      )}
    </div>
  )
}

function RoomTile({ r, onOpen }: { r: BoardRoom; onOpen: () => void }) {
  const { t } = useT()
  const resStatus = r.reservation_status || "Available"
  const occupied = resStatus === "Occupied"
  const out = resStatus === "Out of Service" || !!r.block || r.housekeeping_status === "Out of Order"
  const reserved = resStatus === "Reserved"
  const hold = resStatus === "Temporary Hold"
  const blocked = resStatus === "Blocked"

  // Guest & Reservation info
  const resDetail = r.reservation_details
  const guestName = resDetail?.guest_name || r.stay?.guest_name || r.arrival?.guest_name
  const bookingRef = resDetail?.name || r.stay?.reservation || r.arrival?.reservation
  const sourceLabel = resDetail?.source_label || (r.stay || r.arrival ? "Direct" : null)
  const isCheckIn = resDetail?.is_check_in ?? !!r.arrival
  const isCheckOut = resDetail?.is_check_out ?? !!r.stay?.departing_today

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen()
        }
      }}
      aria-label={t("Room {n} - {status}", { n: r.room_number, status: resStatus })}
      className={cn(
        "group relative flex min-h-[9.5rem] w-full min-w-0 flex-col rounded-xl border-2 p-3 text-start transition-all cursor-pointer shadow-xs",
        "hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
        occupied
          ? "border-indigo-400 bg-indigo-50/40"
          : reserved
            ? "border-sky-400 bg-sky-50/40"
            : hold
              ? "border-amber-400 bg-amber-50/40"
              : blocked
                ? "border-rose-400 bg-rose-50/50"
                : out
                  ? "border-zinc-400 bg-zinc-100"
                  : "border-zinc-200 bg-white hover:border-zinc-300",
      )}
    >
      {/* Top row: Room Number, Room Type, Out/Occupied Icon */}
      <div className="flex w-full items-start justify-between gap-1.5">
        <div>
          <span className="text-xl font-bold leading-none tracking-tight text-zinc-900 tabular-nums">
            {r.room_number}
          </span>
          <div className="mt-0.5 truncate text-[11px] font-medium text-zinc-500 max-w-[7rem]">
            {r.room_type_name}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {out && <Lock className="size-3.5 text-zinc-600" aria-label={t("Out of service")} />}
          {occupied && <BedDouble className="size-3.5 text-indigo-700" aria-label={t("Occupied")} />}
        </div>
      </div>

      {/* Primary Badges: Reservation Status & Housekeeping Status */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {/* Reservation Status Pill */}
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border",
            resStatus === "Available" && "bg-emerald-100 text-emerald-800 border-emerald-300",
            resStatus === "Reserved" && "bg-sky-100 text-sky-800 border-sky-300",
            resStatus === "Occupied" && "bg-indigo-100 text-indigo-900 border-indigo-300",
            resStatus === "Temporary Hold" && "bg-amber-100 text-amber-900 border-amber-300",
            resStatus === "Blocked" && "bg-rose-100 text-rose-900 border-rose-300",
            resStatus === "Out of Service" && "bg-zinc-200 text-zinc-800 border-zinc-400",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full shrink-0",
              resStatus === "Available" && "bg-emerald-600",
              resStatus === "Reserved" && "bg-sky-600",
              resStatus === "Occupied" && "bg-indigo-600",
              resStatus === "Temporary Hold" && "bg-amber-600",
              resStatus === "Blocked" && "bg-rose-600",
              resStatus === "Out of Service" && "bg-zinc-600",
            )}
          />
          {t(resStatus)}
        </span>

        {/* Housekeeping Status Pill (Always distinct and separate) */}
        <span
          className={cn(
            "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium border",
            r.housekeeping_status === "Clean" && "bg-emerald-50 text-emerald-700 border-emerald-200",
            r.housekeeping_status === "Dirty" && "bg-amber-50 text-amber-700 border-amber-200",
            (r.housekeeping_status === "Inspected" || r.housekeeping_status === "Ready") &&
              "bg-sky-50 text-sky-700 border-sky-200",
            r.housekeeping_status === "Cleaning in Progress" && "bg-blue-50 text-blue-700 border-blue-200",
            r.housekeeping_status === "Maintenance" && "bg-purple-50 text-purple-700 border-purple-200",
            r.housekeeping_status === "Out of Order" && "bg-rose-50 text-rose-700 border-rose-200",
          )}
        >
          {t(r.housekeeping_status)}
        </span>
      </div>

      {/* Guest / Reservation Information */}
      <div className="mt-auto w-full pt-2">
        {guestName ? (
          <div className="space-y-0.5">
            <div className="truncate text-xs font-semibold text-zinc-900" title={guestName}>
              {guestName}
            </div>
            {bookingRef && (
              <div className="truncate text-[10px] text-zinc-500 font-mono" title={bookingRef}>
                {bookingRef}
              </div>
            )}
          </div>
        ) : blocked ? (
          <div className="text-[11px] font-medium text-rose-700 truncate">
            {r.block?.reason || t("Room Blocked")}
          </div>
        ) : out ? (
          <div className="text-[11px] font-medium text-zinc-600 truncate">{t("Out of Service")}</div>
        ) : null}

        {/* Bottom row: Source Indicator & Check-in/Check-out indicators */}
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1">
          {sourceLabel ? (
            <SourceBadge source={sourceLabel} />
          ) : (
            <span className="text-[10px] text-zinc-400">{t("Free")}</span>
          )}

          <div className="flex items-center gap-1 ms-auto">
            {isCheckIn && (
              <span className="inline-flex items-center gap-0.5 rounded bg-sky-100 border border-sky-300 px-1 text-[9px] font-bold text-sky-800">
                <LogIn className="size-2.5" />
                {t("Arr")}
              </span>
            )}
            {isCheckOut && (
              <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 border border-amber-300 px-1 text-[9px] font-bold text-amber-900">
                <LogOut className="size-2.5" />
                {t("Dep")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MatrixView({
  board,
  dates,
  rooms,
  onOpenRoom,
}: {
  board: RoomsBoard
  dates: string[]
  rooms: BoardRoom[]
  onOpenRoom: (name: string) => void
}) {
  const { t } = useT()
  const todayStr = board.today || formatYMD(new Date())

  return (
    <div className="w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-20 bg-zinc-50 border-b border-zinc-200 shadow-xs">
            <tr>
              <th className="sticky start-0 z-30 min-w-[10rem] bg-zinc-50 px-3 py-2.5 font-semibold text-zinc-700 border-e border-zinc-200">
                {t("Room")}
              </th>
              {dates.map((d) => {
                const isT = d === todayStr
                return (
                  <th
                    key={d}
                    className={cn(
                      "min-w-[6.5rem] px-2 py-2 text-center font-medium border-e border-zinc-200 last:border-e-0",
                      isT ? "bg-brand-50/70 text-brand-900 font-bold" : "text-zinc-600",
                    )}
                  >
                    <div className="text-[10px] uppercase tracking-wider">{formatDayOfWeek(d)}</div>
                    <div className="text-xs font-semibold tabular-nums">{formatDateDisplay(d)}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 font-sans">
            {rooms.map((r) => (
              <tr key={r.name} className="hover:bg-zinc-50/60 transition-colors">
                <td
                  onClick={() => onOpenRoom(r.name)}
                  className="sticky start-0 z-10 bg-white px-3 py-2 border-e border-zinc-200 cursor-pointer hover:bg-zinc-100"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-bold text-zinc-900">{r.room_number}</span>
                    <span className="text-[10px] text-zinc-400 font-normal truncate max-w-[5.5rem]">
                      {r.room_type_name}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-500 font-medium">
                    {r.housekeeping_status}
                  </div>
                </td>
                {dates.map((d) => {
                  const day = r.days?.[d]
                  const status = day?.reservation_status || "Available"
                  const res = day?.reservation
                  const isCheckIn = day?.is_check_in
                  const isCheckOut = day?.is_check_out
                  const isT = d === todayStr

                  return (
                    <td
                      key={d}
                      onClick={() => onOpenRoom(r.name)}
                      title={`${r.room_number} (${d}): ${status}${
                        res ? ` - ${res.guest_name} [${res.source_label || res.source}] (${res.name})` : ""
                      }`}
                      className={cn(
                        "p-1.5 border-e border-zinc-200 last:border-e-0 cursor-pointer text-center align-top transition-colors",
                        isT && "bg-brand-50/20",
                        status === "Available" && "hover:bg-emerald-50/50",
                        status === "Reserved" && "bg-sky-50/60 hover:bg-sky-100/60",
                        status === "Occupied" && "bg-indigo-50/60 hover:bg-indigo-100/60",
                        status === "Temporary Hold" && "bg-amber-50/60 hover:bg-amber-100/60",
                        status === "Blocked" && "bg-rose-50/60 hover:bg-rose-100/60",
                        status === "Out of Service" && "bg-zinc-100 hover:bg-zinc-200/60",
                      )}
                    >
                      <div
                        className={cn(
                          "flex flex-col gap-0.5 rounded p-1 text-[10px] h-full min-h-[3.25rem] border",
                          status === "Available" &&
                            "border-dashed border-emerald-300 text-emerald-700 bg-emerald-50/40",
                          status === "Reserved" && "border-sky-300 text-sky-900 bg-sky-100/80 font-medium",
                          status === "Occupied" && "border-indigo-300 text-indigo-900 bg-indigo-100/80 font-medium",
                          status === "Temporary Hold" &&
                            "border-amber-300 text-amber-900 bg-amber-100/80 font-medium",
                          status === "Blocked" && "border-rose-300 text-rose-900 bg-rose-100/80",
                          status === "Out of Service" && "border-zinc-300 text-zinc-700 bg-zinc-200",
                        )}
                      >
                        <div className="flex items-center justify-between gap-0.5">
                          <span className="font-bold text-[9px] uppercase tracking-wider truncate">
                            {status === "Available"
                              ? "Avail"
                              : status === "Temporary Hold"
                                ? "Hold"
                                : status}
                          </span>
                          <div className="flex items-center gap-0.5 shrink-0">
                            {isCheckIn && (
                              <span className="rounded bg-sky-200 px-0.5 text-[8px] font-bold text-sky-900">
                                Arr
                              </span>
                            )}
                            {isCheckOut && (
                              <span className="rounded bg-amber-200 px-0.5 text-[8px] font-bold text-amber-900">
                                Dep
                              </span>
                            )}
                          </div>
                        </div>

                        {res && (
                          <div className="mt-0.5 truncate text-[10px] font-semibold text-start">
                            {res.guest_name}
                          </div>
                        )}

                        {res && (
                          <div className="mt-auto flex items-center justify-between text-[9px]">
                            <span className="opacity-75">{res.source_label}</span>
                            <span className="font-mono text-[8px] opacity-60">
                              {res.name.replace(/^RES-/, "")}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-20 bg-zinc-50 border-t-2 border-zinc-300 font-semibold text-[11px]">
            <tr>
              <td className="sticky start-0 z-30 bg-zinc-50 px-3 py-2 text-zinc-700 border-e border-zinc-200">
                {t("Total Occupied / Total")}
              </td>
              {dates.map((d) => {
                const total = rooms.length
                const occ = rooms.filter(
                  (r) => r.days?.[d]?.reservation_status === "Occupied",
                ).length
                const res = rooms.filter(
                  (r) => r.days?.[d]?.reservation_status === "Reserved",
                ).length
                const avail = rooms.filter(
                  (r) => r.days?.[d]?.reservation_status === "Available",
                ).length

                return (
                  <td key={d} className="px-2 py-1.5 text-center border-e border-zinc-200 last:border-e-0">
                    <div className="text-zinc-900 font-bold tabular-nums">
                      {occ + res} / {total}
                    </div>
                    <div className="text-[9px] text-zinc-500 font-normal">
                      {res > 0 && <span className="text-sky-700 font-medium">{res} res · </span>}
                      <span className="text-emerald-700 font-medium">{avail} free</span>
                    </div>
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function Legend({ isToday }: { isToday: boolean }) {
  const { t } = useT()
  const resItems: [string, string][] = [
    [t("Available"), "bg-emerald-100 border-emerald-300 text-emerald-800"],
    [t("Reserved"), "bg-sky-100 border-sky-300 text-sky-800"],
    [t("Occupied"), "bg-indigo-100 border-indigo-300 text-indigo-900"],
    [t("Temporary Hold"), "bg-amber-100 border-amber-300 text-amber-900"],
    [t("Blocked"), "bg-rose-100 border-rose-300 text-rose-800"],
    [t("Out of Service"), "bg-zinc-200 border-zinc-400 text-zinc-800"],
  ]
  const hkItems: [string, string][] = [
    [t("Clean"), "bg-emerald-50 border-emerald-200"],
    [t("Dirty"), "bg-amber-50 border-amber-200"],
    [t("Inspected"), "bg-sky-50 border-sky-200"],
    [t("Cleaning in Progress"), "bg-blue-50 border-blue-200"],
    [t("Maintenance"), "bg-purple-50 border-purple-200"],
  ]

  return (
    <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-xs space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-600">
        <span className="font-semibold text-zinc-700">{t("Reservation Status")}:</span>
        {resItems.map(([label, cls]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span className={cn("size-3 rounded border", cls)} />
            {translate(label)}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-600 border-t border-zinc-100 pt-2.5">
        <span className="font-semibold text-zinc-700">{t("Housekeeping Status")}:</span>
        {hkItems.map(([label, cls]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span className={cn("size-3 rounded border", cls)} />
            {translate(label)}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-500 border-t border-zinc-100 pt-2.5">
        <span className="font-semibold text-zinc-700">{t("Indicators")}:</span>
        <span className="inline-flex items-center gap-1 rounded bg-sky-100 border border-sky-300 px-1.5 py-0.5 font-bold text-sky-800 text-[10px]">
          <LogIn className="size-3" /> {isToday ? t("Arr = Arriving Today") : t("Arr = Check-in Date")}
        </span>
        <span className="inline-flex items-center gap-1 rounded bg-amber-100 border border-amber-300 px-1.5 py-0.5 font-bold text-amber-900 text-[10px]">
          <LogOut className="size-3" /> {isToday ? t("Dep = Departing Today") : t("Dep = Check-out Date")}
        </span>
        <span className="inline-flex items-center gap-1 rounded bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 font-semibold text-emerald-800 text-[10px]">
          <Globe className="size-3" /> {t("Online Booking")}
        </span>
        <span className="inline-flex items-center gap-1 rounded bg-purple-100 border border-purple-200 px-1.5 py-0.5 font-semibold text-purple-800 text-[10px]">
          <User className="size-3" /> {t("Walk-in")}
        </span>
      </div>
    </div>
  )
}
