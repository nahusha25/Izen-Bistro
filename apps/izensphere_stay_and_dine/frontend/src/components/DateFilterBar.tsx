import { useMemo, useState, useEffect } from "react"
import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react"
import { useT, uiDateLocale } from "../lib/i18n"
import { cn } from "../lib/utils"
import { parseDate, shiftDate, isoDate } from "../lib/stay"

export interface DateFieldOption {
  id: string
  label: string
}

export type PresetKey =
  | "today"
  | "yesterday"
  | "tomorrow"
  | "this_week"
  | "last_week"
  | "next_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "last_year"

export interface DateFilterBarProps {
  /** "single" for day-wise view (e.g. Room Status Board, Ledgers, Dashboard),
   *  "range" for date intervals (e.g. Reservations, Folios, Tickets, Reports) */
  mode?: "single" | "range"

  /** Allow user to toggle between Single Day and From Date - To Date range */
  allowModeToggle?: boolean

  /** Callback when mode is toggled between single and range */
  onModeChange?: (mode: "single" | "range") => void

  /** Currently selected date in YYYY-MM-DD (single mode) */
  date?: string
  onDateChange?: (date: string) => void

  /** Currently selected range in YYYY-MM-DD (range mode) */
  fromDate?: string
  toDate?: string
  onRangeChange?: (from: string, to: string) => void

  /** Currently selected field name (when multiple fields are applicable) */
  selectedField?: string
  fieldOptions?: DateFieldOption[]
  onFieldChange?: (field: string) => void

  /** Custom title or section label */
  label?: string
  className?: string
  compact?: boolean

  /** Quick navigation buttons (Prev / Next) */
  showNavigation?: boolean

  /** Quick preset chips */
  showPresets?: boolean

  /** Clear button */
  showClear?: boolean

  /** List of presets to display (defaults to common set) */
  customPresets?: PresetKey[]
}

const pad = (n: number) => String(n).padStart(2, "0")

export function getToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function calculateDateRange(preset: PresetKey): { from: string; to: string } {
  const now = new Date()
  const todayStr = getToday()

  switch (preset) {
    case "today":
      return { from: todayStr, to: todayStr }

    case "yesterday": {
      const y = new Date(now)
      y.setDate(now.getDate() - 1)
      const s = isoDate(y)
      return { from: s, to: s }
    }

    case "tomorrow": {
      const t = new Date(now)
      t.setDate(now.getDate() + 1)
      const s = isoDate(t)
      return { from: s, to: s }
    }

    case "this_week": {
      const dayOfWeek = (now.getDay() + 6) % 7 // 0=Mon, 6=Sun
      const mon = new Date(now)
      mon.setDate(now.getDate() - dayOfWeek)
      const sun = new Date(mon)
      sun.setDate(mon.getDate() + 6)
      return { from: isoDate(mon), to: isoDate(sun) }
    }

    case "last_week": {
      const dayOfWeek = (now.getDay() + 6) % 7
      const mon = new Date(now)
      mon.setDate(now.getDate() - dayOfWeek - 7)
      const sun = new Date(mon)
      sun.setDate(mon.getDate() + 6)
      return { from: isoDate(mon), to: isoDate(sun) }
    }

    case "next_week": {
      const dayOfWeek = (now.getDay() + 6) % 7
      const mon = new Date(now)
      mon.setDate(now.getDate() - dayOfWeek + 7)
      const sun = new Date(mon)
      sun.setDate(mon.getDate() + 6)
      return { from: isoDate(mon), to: isoDate(sun) }
    }

    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { from: isoDate(start), to: isoDate(end) }
    }

    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: isoDate(start), to: isoDate(end) }
    }

    case "this_quarter": {
      const q = Math.floor(now.getMonth() / 3)
      const start = new Date(now.getFullYear(), q * 3, 1)
      const end = new Date(now.getFullYear(), (q + 1) * 3, 0)
      return { from: isoDate(start), to: isoDate(end) }
    }

    case "last_quarter": {
      const q = Math.floor(now.getMonth() / 3)
      const prevQYear = q === 0 ? now.getFullYear() - 1 : now.getFullYear()
      const prevQ = q === 0 ? 3 : q - 1
      const start = new Date(prevQYear, prevQ * 3, 1)
      const end = new Date(prevQYear, (prevQ + 1) * 3, 0)
      return { from: isoDate(start), to: isoDate(end) }
    }

    case "this_year": {
      const start = new Date(now.getFullYear(), 0, 1)
      const end = new Date(now.getFullYear(), 11, 31)
      return { from: isoDate(start), to: isoDate(end) }
    }

    case "last_year": {
      const start = new Date(now.getFullYear() - 1, 0, 1)
      const end = new Date(now.getFullYear() - 1, 11, 31)
      return { from: isoDate(start), to: isoDate(end) }
    }

    default:
      return { from: todayStr, to: todayStr }
  }
}

export function formatFriendlyDate(isoStr?: string): string {
  if (!isoStr) return ""
  const d = parseDate(isoStr)
  if (!d) return isoStr
  return d.toLocaleDateString(uiDateLocale(undefined), {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function formatFriendlyRange(from?: string, to?: string): string {
  if (!from && !to) return ""
  if (from && !to) return `From ${formatFriendlyDate(from)}`
  if (!from && to) return `Until ${formatFriendlyDate(to)}`
  if (from === to) return formatFriendlyDate(from)
  const dFrom = parseDate(from)
  const dTo = parseDate(to)
  let spanText = ""
  if (dFrom && dTo) {
    const span = Math.round((dTo.getTime() - dFrom.getTime()) / 86400000) + 1
    if (span > 0) {
      spanText = ` (${span} day${span === 1 ? "" : "s"})`
    }
  }
  return `${formatFriendlyDate(from)} – ${formatFriendlyDate(to)}${spanText}`
}

export default function DateFilterBar({
  mode = "range",
  allowModeToggle,
  onModeChange,
  date = "",
  onDateChange,
  fromDate = "",
  toDate = "",
  onRangeChange,
  selectedField,
  fieldOptions,
  onFieldChange,
  label,
  className,
  compact = false,
  showNavigation = true,
  showPresets = true,
  showClear = true,
  customPresets,
}: DateFilterBarProps) {
  const { t } = useT()
  const todayStr = useMemo(() => getToday(), [])
  const [activeMode, setActiveMode] = useState<"single" | "range">(mode)

  // Local independent variables for input date-pickers so custom selections work seamlessly
  const [localFrom, setLocalFrom] = useState<string>(fromDate || date || todayStr)
  const [localTo, setLocalTo] = useState<string>(
    toDate || (fromDate ? shiftDate(fromDate, 1) : shiftDate(todayStr, 1)),
  )
  const [localSingleDate, setLocalSingleDate] = useState<string>(date || todayStr)

  useEffect(() => {
    setActiveMode(mode)
  }, [mode])

  useEffect(() => {
    const f = fromDate || date || todayStr
    setLocalFrom(f)
  }, [fromDate, date, todayStr])

  useEffect(() => {
    const to = toDate || (fromDate ? shiftDate(fromDate, 1) : shiftDate(todayStr, 1))
    setLocalTo(to)
  }, [toDate, fromDate, todayStr])

  useEffect(() => {
    if (date) setLocalSingleDate(date)
    else setLocalSingleDate(todayStr)
  }, [date, todayStr])

  const isInvalidRange = useMemo(() => {
    if (activeMode !== "range") return false
    if (!localFrom || !localTo) return false
    return localFrom > localTo
  }, [activeMode, localFrom, localTo])

  // Only allow toggle if allowModeToggle is explicitly true,
  // or if both onDateChange and onRangeChange are provided and allowModeToggle is not false
  const canToggleMode =
    allowModeToggle === true ||
    (allowModeToggle !== false && Boolean(onDateChange && onRangeChange))

  const singlePresets: { key: PresetKey; label: string }[] = useMemo(
    () => [
      { key: "yesterday", label: t("Yesterday") },
      { key: "today", label: t("Today") },
      { key: "tomorrow", label: t("Tomorrow") },
    ],
    [t],
  )

  const defaultRangePresets: { key: PresetKey; label: string }[] = useMemo(
    () => [
      { key: "today", label: t("Today") },
      { key: "yesterday", label: t("Yesterday") },
      { key: "this_week", label: t("This Week") },
      { key: "last_week", label: t("Last Week") },
      { key: "this_month", label: t("This Month") },
      { key: "last_month", label: t("Last Month") },
      { key: "this_quarter", label: t("This Quarter") },
      { key: "this_year", label: t("This Year") },
    ],
    [t],
  )

  const activeRangePreset = useMemo(() => {
    if (!localFrom && !localTo) return null
    for (const p of defaultRangePresets) {
      const r = calculateDateRange(p.key)
      if (r.from === localFrom && r.to === localTo) {
        return p.key
      }
    }
    return null
  }, [localFrom, localTo, defaultRangePresets])

  // Single date navigation
  const handlePrevDay = () => {
    const cur = localSingleDate || todayStr
    const prev = shiftDate(cur, -1)
    if (prev) {
      setLocalSingleDate(prev)
      if (onDateChange) onDateChange(prev)
      else if (onRangeChange) onRangeChange(prev, shiftDate(prev, 1))
    }
  }

  const handleNextDay = () => {
    const cur = localSingleDate || todayStr
    const next = shiftDate(cur, 1)
    if (next) {
      setLocalSingleDate(next)
      if (onDateChange) onDateChange(next)
      else if (onRangeChange) onRangeChange(next, shiftDate(next, 1))
    }
  }

  const handleSinglePreset = (preset: PresetKey) => {
    const r = calculateDateRange(preset)
    setLocalSingleDate(r.from)
    if (onDateChange) onDateChange(r.from)
    else if (onRangeChange) onRangeChange(r.from, r.to)
  }

  // Range navigation (shifts range by its span in days, minimum 1 day)
  const handleShiftRange = (direction: -1 | 1) => {
    const f = parseDate(localFrom || todayStr)
    const tDate = parseDate(localTo || localFrom || todayStr)
    if (!f || !tDate) return
    const spanDays = Math.max(
      1,
      Math.round((tDate.getTime() - f.getTime()) / 86400000) + 1,
    )
    const newFrom = shiftDate(isoDate(f), direction * spanDays)
    const newTo = shiftDate(isoDate(tDate), direction * spanDays)
    setLocalFrom(newFrom)
    setLocalTo(newTo)
    if (onRangeChange) onRangeChange(newFrom, newTo)
    else if (onDateChange) onDateChange(newFrom)
  }

  const handleRangePreset = (preset: PresetKey) => {
    const r = calculateDateRange(preset)
    setLocalFrom(r.from)
    setLocalTo(r.to)
    if (onRangeChange) onRangeChange(r.from, r.to)
    else if (onDateChange) onDateChange(r.from)
  }

  const handleApplyRange = () => {
    if (localFrom && localTo && localFrom <= localTo) {
      if (onRangeChange) onRangeChange(localFrom, localTo)
      else if (onDateChange) onDateChange(localFrom)
    }
  }

  const handleApplySingle = () => {
    if (localSingleDate) {
      if (onDateChange) onDateChange(localSingleDate)
      else if (onRangeChange) onRangeChange(localSingleDate, shiftDate(localSingleDate, 1))
    }
  }

  const handleClear = () => {
    if (activeMode === "single") {
      setLocalSingleDate(todayStr)
      if (onDateChange) onDateChange(todayStr)
      else if (onRangeChange) onRangeChange(todayStr, shiftDate(todayStr, 1))
    } else {
      setLocalFrom(todayStr)
      const nextD = shiftDate(todayStr, 1)
      setLocalTo(nextD)
      if (onRangeChange) onRangeChange(todayStr, nextD)
      else if (onDateChange) onDateChange(todayStr)
    }
  }

  const inputCls =
    "min-h-9 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-800 shadow-xs " +
    "focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 cursor-pointer"

  const btnCls = (active: boolean) =>
    cn(
      "inline-flex items-center justify-center rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors shadow-xs cursor-pointer",
      active
        ? "border-brand-600 bg-brand-50 text-brand-800 font-semibold"
        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900",
    )

  if (activeMode === "single") {
    const isToday = (date || todayStr) === todayStr

    return (
      <div
        className={cn(
          "flex flex-wrap items-center rounded-xl border border-zinc-200/80 bg-zinc-50/60 shadow-xs",
          compact ? "gap-1 p-1.5 text-[11px]" : "gap-2 p-2 text-xs",
          className,
        )}
      >
        {/* Optional Mode Toggle Switch: Single Day vs From - To Date */}
        {canToggleMode && (
          <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-100/90 p-0.5 text-xs font-medium mr-1 select-none">
            <button
              type="button"
              onClick={() => setActiveMode("single")}
              className="rounded-md px-2 py-0.5 text-xs transition-colors cursor-pointer bg-white text-zinc-900 shadow-xs font-semibold"
            >
              {t("Day")}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMode("range")
                onModeChange?.("range")
                const curFrom = localFrom || fromDate || date || todayStr
                const curTo = localTo && localTo >= curFrom ? localTo : shiftDate(curFrom, 1)
                setLocalFrom(curFrom)
                setLocalTo(curTo)
                if (onRangeChange) {
                  onRangeChange(curFrom, curTo)
                } else if (onDateChange) {
                  onDateChange(curFrom)
                }
              }}
              className="rounded-md px-2 py-0.5 text-xs transition-colors cursor-pointer text-zinc-600 hover:text-zinc-900"
            >
              {t("From - To")}
            </button>
          </div>
        )}

        {label && (
          <div className="flex items-center gap-1 font-semibold text-zinc-700 mr-1 select-none">
            <Calendar className="size-3.5 text-brand-600" />
            <span>{t(label)}</span>
          </div>
        )}

        {/* Quick Presets */}
        {showPresets && (
          <div className="flex items-center gap-1">
            {singlePresets.map((sp) => {
              const r = calculateDateRange(sp.key)
              const isMatch = (date || todayStr) === r.from
              return (
                <button
                  key={sp.key}
                  type="button"
                  onClick={() => handleSinglePreset(sp.key)}
                  className={btnCls(isMatch)}
                >
                  {sp.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Date Stepper and Picker with explicit Date label */}
        <div className="flex items-center gap-1">
          {showNavigation && (
            <button
              type="button"
              onClick={handlePrevDay}
              title={t("Previous day")}
              aria-label={t("Previous day")}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 shadow-xs hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <ChevronLeft className="size-4" />
            </button>
          )}

          <div className="flex items-center rounded-lg border border-zinc-200 bg-white shadow-xs focus-within:border-brand-600 focus-within:ring-1 focus-within:ring-brand-600">
            <span className="rounded-l-lg border-r border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-600 select-none">
              {t("Date")}
            </span>
            <input
              type="date"
              aria-label={t("Select date")}
              className="rounded-r-lg bg-transparent px-2.5 py-1 text-xs text-zinc-800 focus:outline-none cursor-pointer"
              value={localSingleDate}
              onChange={(e) => {
                const d = e.target.value
                setLocalSingleDate(d)
                if (d) {
                  if (onDateChange) onDateChange(d)
                  else if (onRangeChange) onRangeChange(d, shiftDate(d, 1))
                }
              }}
            />
          </div>

          {showNavigation && (
            <button
              type="button"
              onClick={handleNextDay}
              title={t("Next day")}
              aria-label={t("Next day")}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 shadow-xs hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <ChevronRight className="size-4" />
            </button>
          )}

          <button
            type="button"
            onClick={handleApplySingle}
            className="inline-flex items-center gap-1 rounded-lg border border-brand-600 bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-brand-700 active:bg-brand-800 transition-colors cursor-pointer"
            title={t("Apply chosen date")}
          >
            <Check className="size-3.5" />
            <span>{t("Apply")}</span>
          </button>
        </div>

        {/* Display friendly date string */}
        <span className="font-medium text-zinc-600 ml-1 select-none">
          {formatFriendlyDate(date || todayStr)}
        </span>

        {/* Clear/Reset to Today */}
        {showClear && !isToday && (
          <button
            type="button"
            onClick={handleClear}
            className="ml-auto inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 cursor-pointer"
            title={t("Reset to Today")}
          >
            <RotateCcw className="size-3" />
            {t("Reset")}
          </button>
        )}
      </div>
    )
  }

  // Range Mode ("From Date - To Date")
  const rangePresets = customPresets
    ? defaultRangePresets.filter((p) => customPresets.includes(p.key))
    : defaultRangePresets

  return (
    <div
      className={cn(
        "flex flex-wrap items-center rounded-xl border border-zinc-200/80 bg-zinc-50/60 shadow-xs",
        compact ? "gap-1 p-1.5 text-[11px]" : "gap-2 p-2 text-xs",
        className,
      )}
    >
      {/* Optional Mode Toggle Switch: Single Day vs From - To Date */}
      {canToggleMode && (
        <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-100/90 p-0.5 text-xs font-medium mr-1 select-none">
          <button
            type="button"
            onClick={() => {
              setActiveMode("single")
              onModeChange?.("single")
              const d = localSingleDate || localFrom || fromDate || date || todayStr
              setLocalSingleDate(d)
              if (onDateChange) onDateChange(d)
              else if (onRangeChange) onRangeChange(d, shiftDate(d, 1))
            }}
            className="rounded-md px-2 py-0.5 text-xs transition-colors cursor-pointer text-zinc-600 hover:text-zinc-900"
          >
            {t("Day")}
          </button>
          <button
            type="button"
            onClick={() => setActiveMode("range")}
            className="rounded-md px-2 py-0.5 text-xs transition-colors cursor-pointer bg-white text-zinc-900 shadow-xs font-semibold"
          >
            {t("From - To")}
          </button>
        </div>
      )}

      {/* Optional Section / Filter Label */}
      {label && (
        <div className="flex items-center gap-1 font-semibold text-zinc-700 mr-1 select-none">
          <Calendar className="size-3.5 text-brand-600" />
          <span>{t(label)}</span>
        </div>
      )}

      {/* Optional Field Selector */}
      {fieldOptions && fieldOptions.length > 0 && onFieldChange && (
        <div className="flex items-center gap-1 mr-1">
          <SlidersHorizontal className="size-3.5 text-zinc-400" />
          <select
            className={cn(inputCls, "font-medium text-zinc-700")}
            value={selectedField || fieldOptions[0]?.id}
            onChange={(e) => onFieldChange(e.target.value)}
            aria-label={t("Date field to filter by")}
          >
            {fieldOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {t(opt.label)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Preset Chips */}
      {showPresets && (
        <div className="flex flex-wrap items-center gap-1">
          {rangePresets.map((p) => {
            const isMatch = activeRangePreset === p.key
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => handleRangePreset(p.key)}
                className={btnCls(isMatch)}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Range inputs with stepper, explicit From Date - To Date labels, and Apply action */}
      <div className="flex flex-wrap items-center gap-1.5">
        {showNavigation && (localFrom || localTo) && (
          <button
            type="button"
            onClick={() => handleShiftRange(-1)}
            title={t("Previous period")}
            aria-label={t("Previous period")}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 shadow-xs hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <ChevronLeft className="size-4" />
          </button>
        )}

        {/* From Date with explicit visible label badge */}
        <div
          className={cn(
            "flex items-center rounded-lg border bg-white shadow-xs focus-within:ring-1",
            isInvalidRange
              ? "border-rose-400 focus-within:border-rose-500 focus-within:ring-rose-500"
              : "border-zinc-200 focus-within:border-brand-600 focus-within:ring-brand-600",
          )}
        >
          <span className="rounded-l-lg border-r border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-600 select-none">
            {t("From Date")}
          </span>
          <input
            type="date"
            aria-label={t("From Date")}
            className="rounded-r-lg bg-transparent px-2.5 py-1 text-xs text-zinc-800 focus:outline-none cursor-pointer"
            value={localFrom}
            onChange={(e) => {
              const newFrom = e.target.value
              setLocalFrom(newFrom)
              if (newFrom && localTo && newFrom <= localTo) {
                if (onRangeChange) onRangeChange(newFrom, localTo)
                else if (onDateChange) onDateChange(newFrom)
              }
            }}
          />
        </div>

        <span className="text-xs font-semibold text-zinc-400 select-none">→</span>

        {/* To Date with explicit visible label badge */}
        <div
          className={cn(
            "flex items-center rounded-lg border bg-white shadow-xs focus-within:ring-1",
            isInvalidRange
              ? "border-rose-400 focus-within:border-rose-500 focus-within:ring-rose-500"
              : "border-zinc-200 focus-within:border-brand-600 focus-within:ring-brand-600",
          )}
        >
          <span className="rounded-l-lg border-r border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-600 select-none">
            {t("To Date")}
          </span>
          <input
            type="date"
            aria-label={t("To Date")}
            className="rounded-r-lg bg-transparent px-2.5 py-1 text-xs text-zinc-800 focus:outline-none cursor-pointer"
            value={localTo}
            onChange={(e) => {
              const newTo = e.target.value
              setLocalTo(newTo)
              if (newTo && localFrom && localFrom <= newTo) {
                if (onRangeChange) onRangeChange(localFrom, newTo)
                else if (onDateChange) onDateChange(localFrom)
              }
            }}
          />
        </div>

        {showNavigation && (localFrom || localTo) && (
          <button
            type="button"
            onClick={() => handleShiftRange(1)}
            title={t("Next period")}
            aria-label={t("Next period")}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 shadow-xs hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <ChevronRight className="size-4" />
          </button>
        )}

        {/* Explicit Apply Button for Custom Range Choice */}
        <button
          type="button"
          onClick={handleApplyRange}
          disabled={!localFrom || !localTo || isInvalidRange}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold shadow-xs transition-colors cursor-pointer",
            !localFrom || !localTo || isInvalidRange
              ? "border-zinc-200 bg-zinc-100 text-zinc-400 cursor-not-allowed"
              : "border-brand-600 bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800",
          )}
          title={t("Apply chosen date filter")}
        >
          <Check className="size-3.5" />
          <span>{t("Apply")}</span>
        </button>

        {isInvalidRange && (
          <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 border border-rose-200">
            ⚠️ {t("To Date must be greater than or equal to From Date")}
          </span>
        )}
      </div>

      {/* Friendly range label with days count */}
      {(localFrom || localTo) && !isInvalidRange && (
        <span className="font-medium text-zinc-600 text-xs ml-1 select-none flex items-center gap-1.5">
          <span>{formatFriendlyRange(localFrom, localTo)}</span>
          {!activeRangePreset && (
            <span className="rounded bg-zinc-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700">
              {t("Custom")}
            </span>
          )}
        </span>
      )}

      {/* Clear button */}
      {showClear && (localFrom || localTo) && (
        <button
          type="button"
          onClick={handleClear}
          className="ml-auto inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 cursor-pointer"
          title={t("Clear date filter")}
        >
          <X className="size-3" />
          {t("Clear")}
        </button>
      )}
    </div>
  )
}
