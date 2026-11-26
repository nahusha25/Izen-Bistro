/*  Owner view: the hotel on a phone. One column of cards, thumb-sized
    controls, one call (izensphere_stay_and_dine.dashboards.owner_snapshot) per period. The
    figures are the manager flash's; the server decides who sees them. */

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Link, useOutletContext, useSearchParams } from "react-router-dom"
import { Calendar, ChevronRight, FileText } from "lucide-react"
import { call, getCurrentProperty, myProperties, setCurrentProperty, type PropertyRow } from "../lib/api"
import { serverError } from "../lib/resource"
import { cur, moneyLocale, useLocale } from "../lib/money"
import { getLang } from "../lib/dir"
import { useRealtime } from "../lib/realtime"
import { useAuth } from "../lib/auth"
import { visibleApps } from "../lib/apps"
import { isoDate } from "../lib/stay"
import type { ShellContext } from "../AppShell"
import { useT } from "../lib/i18n"
import { cn } from "../lib/utils"

interface Day {
  rooms_sold: number
  occupancy_pct: number
  adr: number
  revpar: number
  room_revenue: number
  fnb_revenue: number
  other_revenue: number
  total_revenue: number
}

interface Snapshot {
  property_name: string
  date: string
  from_date?: string
  total_rooms: number
  today: Day
  movement: { arrivals: number; departures: number; in_house: number; no_shows: number }
  collections: { grand_total: number; modes: { mode: string; total: number }[] }
  outlook: { date: string; booked: number; occupancy_pct: number }[]
  guest_balances: number
  open_folios: number
  city_ledger: number
  city_ledger_overdue: number
  audits: { name: string; business_date: string; status: string; has_pack: boolean }[] | null
}

interface PortfolioRow {
  property: string
  property_name: string
  occupancy_pct: number
  revenue_today: number
  collections_today: number
  outstanding: number
}

type Period = "today" | "yesterday" | "month" | "custom"
type PresetKey = "last_7" | "this_week" | "last_week" | "this_month" | "last_month"

function getPresetRange(preset: PresetKey, baseDateStr?: string): { from: string; to: string } {
  const base = baseDateStr ? new Date(baseDateStr + "T00:00:00") : new Date()
  const y = base.getFullYear()
  const m = base.getMonth()
  const d = base.getDate()

  switch (preset) {
    case "last_7": {
      const from = new Date(y, m, d - 6)
      return { from: isoDate(from), to: isoDate(base) }
    }
    case "this_week": {
      const dayOfWeek = base.getDay() // 0 is Sunday
      const diff = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek
      const monday = new Date(y, m, d + diff)
      return { from: isoDate(monday), to: isoDate(base) }
    }
    case "last_week": {
      const dayOfWeek = base.getDay()
      const diff = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek - 7
      const lastMonday = new Date(y, m, d + diff)
      const lastSunday = new Date(y, m, d + diff + 6)
      return { from: isoDate(lastMonday), to: isoDate(lastSunday) }
    }
    case "this_month": {
      const firstDay = new Date(y, m, 1)
      return { from: isoDate(firstDay), to: isoDate(base) }
    }
    case "last_month": {
      const firstDayLastMonth = new Date(y, m - 1, 1)
      const lastDayLastMonth = new Date(y, m, 0)
      return { from: isoDate(firstDayLastMonth), to: isoDate(lastDayLastMonth) }
    }
    default:
      return { from: isoDate(base), to: isoDate(base) }
  }
}

const money = (n: unknown) =>
  cur() + Number(n ?? 0).toLocaleString(moneyLocale(), { maximumFractionDigits: 0 })

const day = (d: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(d + "T00:00:00").toLocaleDateString(getLang(), opts)

function Section({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm", className)}>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">{title}</h2>
      {children}
    </section>
  )
}

function Figure({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-xs text-zinc-500">{label}</div>
      <div className="mt-0.5 truncate text-lg font-semibold tabular-nums text-zinc-900">{value}</div>
    </div>
  )
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
      <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  )
}

function Line({ label, value, tone, to }: { label: string; value: ReactNode; tone?: string; to?: string }) {
  const body = (
    <>
      <span className="text-zinc-600">{label}</span>
      <span className={cn("ms-auto font-semibold tabular-nums", tone ?? "text-zinc-900")}>{value}</span>
      {to && <ChevronRight className="size-4 shrink-0 text-zinc-400 rtl:rotate-180" aria-hidden />}
    </>
  )
  const cls = "flex min-h-11 items-center gap-2 text-sm"
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>
}

export default function Owner() {
  const { t } = useT()
  useLocale()
  const { roles } = useAuth()
  const shell = useOutletContext<ShellContext | undefined>()
  const apps = new Set(visibleApps(roles, shell?.modules).map((a) => a.id))
  // izensphere_stay_and_dine.dashboards.portfolio_dashboard's roles: a night auditor gets one hotel at a time
  const chainWide = ["Finance", "Revenue Manager", "Hotel Admin", "System Manager", "Administrator"]
    .some((r) => roles.includes(r))

  const [searchParams, setSearchParams] = useSearchParams()
  const paramPeriod = (searchParams.get("period") as Period) || ""
  const paramFrom = searchParams.get("from_date") || searchParams.get("from") || ""
  const paramTo = searchParams.get("to_date") || searchParams.get("to") || searchParams.get("date") || ""

  const [period, setPeriod] = useState<Period>(() => {
    if (paramFrom && paramTo) return "custom"
    if (paramPeriod && ["today", "yesterday", "month", "custom"].includes(paramPeriod)) return paramPeriod
    return "today"
  })
  const [fromDate, setFromDate] = useState<string>(() => paramFrom || "")
  const [toDate, setToDate] = useState<string>(() => paramTo || "")

  const [scope, setScope] = useState<"property" | "all">("property")
  const [props, setProps] = useState<PropertyRow[]>([])
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [port, setPort] = useState<PortfolioRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    myProperties().then(setProps).catch(() => setProps([]))
  }, [])

  const load = useCallback(() => {
    setError(null)
    if (scope === "all") {
      call<{ properties: PortfolioRow[] }>("izensphere_stay_and_dine.dashboards.portfolio_dashboard", {})
        .then((r) => setPort(r.properties))
        .catch((e) => setError(serverError(e)))
      return
    }

    const prop = getCurrentProperty()
    if (!prop) return

    if (period === "custom") {
      if (!fromDate || !toDate) return
      if (fromDate > toDate) {
        setError(t("From date cannot be after To date"))
        return
      }
      call<Snapshot>("izensphere_stay_and_dine.dashboards.owner_snapshot", {
        property: prop,
        from_date: fromDate,
        date: toDate,
        to_date: toDate,
        period: "custom",
      })
        .then((s) => {
          setSnap(s)
          if (!fromDate && s.from_date) setFromDate(s.from_date)
          if (!toDate && s.date) setToDate(s.date)
        })
        .catch((e) => setError(serverError(e)))
      return
    }

    // the server counts the period from the property's business date, never the phone's clock
    call<Snapshot>("izensphere_stay_and_dine.dashboards.owner_snapshot", { property: prop, period })
      .then((s) => {
        setSnap(s)
        if (!fromDate && s.from_date) setFromDate(s.from_date)
        if (!toDate && s.date) setToDate(s.date)
      })
      .catch((e) => setError(serverError(e)))
  }, [period, scope, fromDate, toDate, t])
  useEffect(load, [load])
  useRealtime(load)

  const handlePeriodChange = (p: Period) => {
    setPeriod(p)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (p === "custom") {
          const f = fromDate || snap?.from_date || snap?.date || ""
          const to = toDate || snap?.date || ""
          if (f) {
            setFromDate(f)
            next.set("from_date", f)
          }
          if (to) {
            setToDate(to)
            next.set("to_date", to)
          }
          next.set("period", "custom")
        } else {
          next.set("period", p)
          next.delete("from_date")
          next.delete("to_date")
        }
        return next
      },
      { replace: true }
    )
  }

  const handleRangeChange = (from: string, to: string) => {
    setFromDate(from)
    setToDate(to)
    setPeriod("custom")
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set("period", "custom")
        if (from) next.set("from_date", from)
        else next.delete("from_date")
        if (to) next.set("to_date", to)
        else next.delete("to_date")
        return next
      },
      { replace: true }
    )
  }

  const periods: [Period, string][] = [
    ["today", t("Today")],
    ["yesterday", t("Yesterday")],
    ["month", t("Month to date")],
    ["custom", t("Custom")],
  ]

  const customPresets: { key: PresetKey; label: string }[] = [
    { key: "last_7", label: t("Last 7 days") },
    { key: "this_week", label: t("This week") },
    { key: "last_week", label: t("Last week") },
    { key: "this_month", label: t("This month") },
    { key: "last_month", label: t("Last month") },
  ]
  const d = snap?.today
  const depts = d
    ? [
        [t("Rooms"), d.room_revenue],
        [t("Food and beverage"), d.fnb_revenue],
        [t("Other"), d.other_revenue],
      ] as [string, number][]
    : []
  const top = Math.max(1, ...depts.map(([, v]) => v))

  return (
    <div className="mx-auto max-w-lg space-y-3 pb-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">{t("Owner view")}</h1>
        {props.length > 1 ? (
          <select
            aria-label={t("Property")}
            value={scope === "all" ? "" : getCurrentProperty()}
            onChange={(e) => {
              const p = e.target.value
              if (!p) return setScope("all")
              setCurrentProperty(p)
              // the header switcher follows (AppShell listens), which remounts this screen
              window.dispatchEvent(new CustomEvent("izensphere_stay_and_dine:property", { detail: p }))
              setScope("property")
            }}
            className="mt-2 min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-base font-medium"
          >
            {props.map((p) => <option key={p.name} value={p.name}>{p.property_name}</option>)}
            {chainWide && <option value="">{t("All properties, today")}</option>}
          </select>
        ) : (
          <p className="truncate text-sm text-zinc-500">{snap?.property_name}</p>
        )}
      </div>

      {scope === "property" && (
        <div className="space-y-2">
          <div role="tablist" className="grid grid-cols-4 rounded-xl border border-zinc-200 bg-white p-1 text-sm shadow-xs">
            {periods.map(([p, label]) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={period === p}
                onClick={() => handlePeriodChange(p)}
                className={cn(
                  "min-h-10 rounded-lg px-1 font-medium transition-colors text-center text-xs sm:text-sm cursor-pointer",
                  period === p ? "bg-brand-600 text-white shadow-xs" : "text-zinc-600 hover:text-zinc-900",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {period === "custom" && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-zinc-700">
                  <Calendar className="size-3.5 text-brand-600" />
                  <span>{t("Custom Date Range")}</span>
                </div>
                {snap?.from_date && snap?.date && (
                  <span className="font-medium text-zinc-500">
                    {snap.from_date === snap.date ? snap.date : `${snap.from_date} → ${snap.date}`}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                    {t("From date")}
                  </label>
                  <input
                    type="date"
                    aria-label={t("From date")}
                    value={fromDate}
                    max={toDate || undefined}
                    onChange={(e) => handleRangeChange(e.target.value, toDate)}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium text-zinc-900 focus:bg-white focus:border-brand-500 focus:outline-none cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                    {t("To date")}
                  </label>
                  <input
                    type="date"
                    aria-label={t("To date")}
                    value={toDate}
                    min={fromDate || undefined}
                    onChange={(e) => handleRangeChange(fromDate, e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium text-zinc-900 focus:bg-white focus:border-brand-500 focus:outline-none cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-zinc-100">
                <span className="text-[11px] text-zinc-400 me-1">{t("Presets")}:</span>
                {customPresets.map((p) => {
                  const r = getPresetRange(p.key, snap?.date)
                  const isActive = fromDate === r.from && toDate === r.to
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => handleRangeChange(r.from, r.to)}
                      className={cn(
                        "rounded-lg border px-2 py-0.5 text-xs font-medium transition-colors cursor-pointer",
                        isActive
                          ? "border-brand-600 bg-brand-50 text-brand-800 font-semibold"
                          : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
                      )}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>

              {fromDate && toDate && fromDate > toDate && (
                <p className="text-xs text-rose-600 font-medium">
                  {t("The end date is before the start date.")}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {scope === "all" && port && (
        <div className="space-y-3">
          {port.map((p) => (
            <Section key={p.property} title={p.property_name}>
              <div className="grid grid-cols-2 gap-3">
                <Figure label={t("Occupancy")} value={`${p.occupancy_pct}%`} />
                <Figure label={t("Revenue")} value={money(p.revenue_today)} />
                <Figure label={t("Collected")} value={money(p.collections_today)} />
                <Figure label={t("Outstanding")} value={money(p.outstanding)} />
              </div>
            </Section>
          ))}
        </div>
      )}

      {scope === "property" && !snap && !error && <p className="py-10 text-center text-sm text-zinc-400">{t("Loading…")}</p>}

      {scope === "property" && snap && d && (
        <>
          <Section
            title={
              <span className="inline-flex items-center gap-1">
                <span>{t("Revenue")}</span>
                {snap && (
                  <span className="ms-1 font-normal lowercase tracking-normal text-zinc-400 font-sans">
                    ({snap.from_date && snap.from_date !== snap.date ? `${snap.from_date} → ${snap.date}` : snap.date})
                  </span>
                )}
              </span>
            }
          >
            <div className="text-3xl font-semibold tabular-nums text-zinc-900">{money(d.total_revenue)}</div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
              <Figure label={t("Occupancy")} value={`${d.occupancy_pct}%`} />
              <Figure
                label={t("Rooms sold")}
                value={
                  period === "month" || period === "custom" || (snap.from_date && snap.from_date !== snap.date)
                    ? d.rooms_sold
                    : <span dir="ltr">{d.rooms_sold} / {snap.total_rooms}</span>
                }
              />
              <Figure label={t("ADR")} value={money(d.adr)} />
              <Figure label={t("RevPAR")} value={money(d.revpar)} />
            </div>
            <div className="mt-4 space-y-2">
              {depts.map(([label, v]) => (
                <div key={label} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 truncate text-zinc-600">{label}</span>
                  <Bar pct={(100 * v) / top} />
                  <span className="w-20 shrink-0 text-end font-medium tabular-nums">{money(v)}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title={t("Guests")}>
            <div className="grid grid-cols-4 gap-2 text-center">
              {([
                [t("Arrivals"), snap.movement.arrivals, "/in-house?tab=arrivals"],
                [t("Departures"), snap.movement.departures, "/in-house?tab=departures"],
                [t("In house"), snap.movement.in_house, "/in-house?tab=in-house"],
                [t("No-shows"), snap.movement.no_shows, undefined],
              ] as [string, number, string | undefined][]).map(([label, n, to]) => {
                const inner = (
                  <>
                    <div className="text-xl font-semibold tabular-nums text-zinc-900">{n}</div>
                    <div className="truncate text-[11px] text-zinc-500">{label}</div>
                  </>
                )
                const cls = "rounded-xl bg-zinc-50 px-1 py-2"
                return to && apps.has("front-desk")
                  ? <Link key={label} to={to} className={cls}>{inner}</Link>
                  : <div key={label} className={cls}>{inner}</div>
              })}
            </div>
          </Section>

          <Section title={t("Money")}>
            <Line label={t("Collected")} value={money(snap.collections.grand_total)} />
            {snap.collections.modes.map((m) => (
              <div key={m.mode} className="flex items-center ps-3 text-xs text-zinc-500">
                <span>{t(m.mode)}</span>
                <span className="ms-auto tabular-nums">{money(m.total)}</span>
              </div>
            ))}
            <div className="my-2 border-t border-zinc-100" />
            <div className="text-xs text-zinc-400">{t("Balances as of now")}</div>
            <Line
              label={t("Guest balances ({n} open bills)", { n: snap.open_folios })}
              value={money(snap.guest_balances)}
              to={apps.has("finance") ? "/billing" : undefined}
            />
            <Line
              label={t("Company accounts (city ledger)")}
              value={money(snap.city_ledger)}
              to={apps.has("finance") ? "/ledgers" : undefined}
            />
            {snap.city_ledger_overdue > 0 && (
              <Line label={t("Overdue")} value={money(snap.city_ledger_overdue)} tone="text-rose-600" />
            )}
          </Section>

          <Section title={t("Next 7 days")}>
            <div className="space-y-2">
              {snap.outlook.map((o) => (
                <div key={o.date} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 text-zinc-600">{day(o.date, { weekday: "short", day: "numeric", month: "short" })}</span>
                  <Bar pct={o.occupancy_pct} />
                  <span className="w-20 shrink-0 text-end tabular-nums">
                    {o.occupancy_pct}% <span className="text-xs text-zinc-400">({o.booked})</span>
                  </span>
                </div>
              ))}
            </div>
          </Section>

          {snap.audits && (
            <Section title={t("Night audits")}>
              {snap.audits.length === 0 && <p className="text-sm text-zinc-400">{t("No night audits yet.")}</p>}
              {snap.audits.map((a) => (
                <Line
                  key={a.name}
                  label={day(a.business_date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                  value={a.has_pack
                    ? <span className="inline-flex items-center gap-1 text-brand-700"><FileText className="size-4" aria-hidden />{t("Audit pack")}</span>
                    : t(a.status)}
                  to={a.has_pack ? `/end-of-day/pack/${encodeURIComponent(a.name)}` : undefined}
                />
              ))}
            </Section>
          )}

          <Section title={t("More reports")}>
            {apps.has("finance") && <Line label={t("Manager flash")} value="" to="/reports/flash" />}
            {apps.has("revenue") && <Line label={t("Revenue dashboard")} value="" to="/dashboard" />}
            <Line label={t("All reports")} value="" to="/reports" />
          </Section>
        </>
      )}
    </div>
  )
}
