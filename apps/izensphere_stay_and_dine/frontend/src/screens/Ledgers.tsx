import { useCallback, useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { call, getCurrentProperty } from "../lib/api"
import { serverError } from "../lib/resource"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { fmtAmount } from "../lib/money"
import { useAuth } from "../lib/auth"
import CityLedgerPayment from "./CityLedgerPayment"
import { t as translate, useUILanguage } from "../lib/i18n"
import DateFilterBar from "../components/DateFilterBar"

// recording a company's payment is a Finance action (the server gates it too)
const CAN_SETTLE = ["Finance", "Hotel Admin", "System Manager", "Administrator"]

const inr = fmtAmount

function getLedgerDisplay(l: Ledger) {
  if (l.ledger === "Deposit") {
    // Deposit ledger is a liability: Cr > Dr means customer deposits are held
    const held = l.credit - l.debit
    if (held >= 0) {
      return {
        amount: inr(held),
        badge: held > 0 ? translate("Deposits held") : undefined,
        detail: translate("Cr ") + inr(l.credit) + translate(" · Dr ") + inr(l.debit),
      }
    }
    return {
      amount: inr(Math.abs(held)),
      badge: translate("Over-applied"),
      detail: translate("Dr ") + inr(l.debit) + translate(" · Cr ") + inr(l.credit),
    }
  }

  // Guest, AR, Package: positive is receivable, negative is customer credit
  if (l.balance < 0) {
    return {
      amount: inr(Math.abs(l.balance)),
      badge: translate("Guest credit"),
      detail: translate("Cr ") + inr(l.credit) + translate(" · Dr ") + inr(l.debit),
    }
  }

  return {
    amount: inr(l.balance),
    badge: l.balance > 0 ? translate("Receivable") : undefined,
    detail: translate("Dr ") + inr(l.debit) + translate(" · Cr ") + inr(l.credit),
  }
}

type Ledger = {
  ledger: string
  debit: number
  credit: number
  balance: number
}

/** Guest + Deposit ledger postings per folio against each folio's balance
 *  (izensphere_stay_and_dine.ledger.folio_reconciliation). */
type Recon = {
  in_balance: boolean
  ledger_net: number
  folios_net: number
  difference: number
  folios_out: number
  folios: { folio: string; folio_type: string; status: string; balance: number; ledger: number; difference: number }[]
}

export default function Ledgers() {
  const language = useUILanguage()
  const [params, setParams] = useSearchParams()
  const [date, setDate] = useState(() => params.get("date") || "")
  const [fromDate, setFromDate] = useState(() => params.get("from_date") || "")
  const [toDate, setToDate] = useState(() => params.get("to_date") || "")
  const initialMode = Boolean(fromDate && toDate && fromDate !== toDate) ? "range" : "single"
  const [filterMode, setFilterMode] = useState<"single" | "range">(initialMode)

  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [inBalance, setInBalance] = useState<boolean | null>(true)
  const [recon, setRecon] = useState<Recon | null>(null)
  const [totals, setTotals] = useState({ debit: 0, credit: 0 })
  const [journal, setJournal] = useState<
    { transaction_code: string; description: string; debit: number; credit: number; entries: number }[]
  >([])
  const [aging, setAging] = useState<Record<string, unknown>[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [paying, setPaying] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { roles } = useAuth()
  const canSettle = roles.some((r) => CAN_SETTLE.includes(r))

  const handleDateChange = (newDate: string) => {
    setDate(newDate)
    setFromDate(newDate)
    setToDate(newDate)
    setFilterMode("single")
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        next.set("date", newDate)
        next.delete("from_date")
        next.delete("to_date")
        return next
      },
      { replace: true },
    )
  }

  const handleRangeChange = (from: string, to: string) => {
    setFromDate(from)
    setToDate(to)
    setDate(to)
    setFilterMode("range")
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        next.set("from_date", from)
        next.set("to_date", to)
        next.delete("date")
        return next
      },
      { replace: true },
    )
  }

  const load = useCallback(async () => {
    try {
      const isRange = filterMode === "range" || Boolean(fromDate && toDate && fromDate !== toDate)
      const bal = await call<{
        business_date: string
        ledgers: Ledger[]
        total_debit: number
        total_credit: number
        in_balance: boolean | null
        reconciliation: Recon | null
      }>("izensphere_stay_and_dine.ledger.ledger_balances", {
        property: getCurrentProperty(),
        business_date: (isRange ? toDate : date) || undefined,
      })
      setLedgers(bal.ledgers)
      setInBalance(bal.in_balance)
      setRecon(bal.reconciliation)
      setTotals({ debit: bal.total_debit, credit: bal.total_credit })
      if (!date && !toDate) setDate(bal.business_date)
      const j = await call<{ rows: typeof journal }>(
        "izensphere_stay_and_dine.ledger.journal_by_transaction_code",
        {
          property: getCurrentProperty(),
          business_date: bal.business_date,
          from_date: isRange ? fromDate : undefined,
          to_date: isRange ? toDate : undefined,
        },
      )
      setJournal(j.rows)
      const a = await call<{ accounts: Record<string, unknown>[] }>(
        "izensphere_stay_and_dine.ledger.city_ledger_aging",
        { property: getCurrentProperty() },
      )
      setAging(a.accounts)
    } catch (e) {
      setErr(serverError(e))
    }
  }, [date, fromDate, toDate, filterMode])

  useEffect(() => {
    void load()
  }, [load])

  // the statement is an HTML page: the browser prints it or saves it as PDF
  const openStatement = async (account: string) => {
    try {
      const res = await call<{ content: string }>("izensphere_stay_and_dine.statements.company_statement", {
        account, format: "html", lang: language,
      })
      const w = window.open("", "_blank")
      if (w) {
        w.document.write(res.content)
        w.document.close()
        w.print()
      }
    } catch (e) {
      setErr(serverError(e))
    }
  }

  const emailStatement = async (account: string) => {
    const to = window.prompt(translate("Send the statement to (comma-separated). Leave blank for the company's billing contact."), "")
    if (to === null) return
    try {
      const res = await call<{ sent_to: string[] }>("izensphere_stay_and_dine.statements.email_company_statement", {
        account, recipients: to.trim() || undefined, lang: language,
      })
      setNotice(translate("Statement sent to {v0}", { v0: res.sent_to.join(", ") }))
    } catch (e) {
      setErr(serverError(e))
    }
  }

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{translate("Books")}</p>
          <h1 className="text-2xl font-semibold">{translate("Ledgers")}</h1>
          <p className="text-sm text-zinc-500">{translate("Guest · Deposit · AR · Package trial balance")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateFilterBar
            mode={filterMode}
            allowModeToggle
            date={date}
            onDateChange={handleDateChange}
            fromDate={fromDate || date}
            toDate={toDate || date}
            onRangeChange={handleRangeChange}
            label="Date"
            compact
          />
          <Button variant="outline" onClick={() => void load()}>{translate("Refresh")}</Button>
        </div>
      </div>
      {err ? <p className="text-sm text-rose-600">{translate(err)}</p> : null}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}

      {/* These are subsidiary ledgers: a charge's revenue side and a
          payment's cash side live in the books the accounting export feeds,
          so debits exceed credits by what guests owe. The real check is that
          the Guest + Deposit ledgers agree with every folio's balance. */}
      <div
        className={`rounded-lg border px-4 py-2 text-sm ${
          inBalance === null
            ? "border-zinc-200 bg-zinc-50 text-zinc-700"
            : inBalance
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        {inBalance === null ? (
          translate("Ledgers as of {v0}. Debits {v1} · credits {v2}. The check against folio balances runs for the current business date.", { v0: String(date), v1: String(inr(totals.debit)), v2: String(inr(totals.credit)) })
        ) : inBalance ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-emerald-900">
                {translate("All ledgers in balance")}
              </p>
              <p className="mt-0.5 text-xs text-emerald-700">
                {translate("Guest and Deposit ledgers match active folio balances exactly ({v0} customer funds held).", {
                  v0: inr(Math.abs(recon?.ledger_net ?? 0)),
                })}
              </p>
            </div>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              {translate("Reconciled")}
            </span>
          </div>
        ) : (
          <div>
            <p className="font-medium">
              {translate("Ledger differs from folios on {v0} folio(s) by {v1}.", { v0: String(recon?.folios_out ?? 0), v1: String(inr(Math.abs(recon?.difference ?? 0))) })}
            </p>
            <p className="mt-0.5 text-xs">{translate("A posting reached the folio but not the ledger, or the other way round.")}</p>
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {(recon?.folios ?? []).map((f) => (
                <li key={f.folio}>
                  <Link className="underline" to={`/billing/${encodeURIComponent(f.folio)}`}>
                    {f.folio}
                  </Link>{" "}{translate("folio ")}{inr(Math.abs(f.balance))}{f.balance < 0 ? " Cr" : ""}{translate(" · ledger ")}{inr(Math.abs(f.ledger))}{f.ledger < 0 ? " Cr" : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ledgers.map((l) => {
          const display = getLedgerDisplay(l)
          return (
            <Card key={l.ledger}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-zinc-500">
                  {l.ledger}{translate(" ledger")}
                </CardTitle>
                {display.badge && (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                    {display.badge}
                  </span>
                )}
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums text-zinc-900">
                  {display.amount}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  {display.detail}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{translate("Journal by transaction code")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-zinc-400">
              <tr>
                <th className="py-2 pr-3">{translate("Code")}</th>
                <th className="py-2 pr-3">{translate("Description")}</th>
                <th className="py-2 pr-3">{translate("Debit")}</th>
                <th className="py-2 pr-3">{translate("Credit")}</th>
                <th className="py-2">{translate("Entries")}</th>
              </tr>
            </thead>
            <tbody>
              {journal.map((r) => (
                <tr key={r.transaction_code} className="border-t border-zinc-100">
                  <td className="py-2 pr-3 font-mono text-xs">
                    {r.transaction_code}
                  </td>
                  <td className="py-2 pr-3">{r.description}</td>
                  <td className="py-2 pr-3 tabular-nums">{inr(r.debit)}</td>
                  <td className="py-2 pr-3 tabular-nums">{inr(r.credit)}</td>
                  <td className="py-2">{r.entries}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{translate("City ledger aging")}</CardTitle>
          <span className="text-xs text-zinc-400">{translate("By due date - invoice date + the company's credit days")}</span>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-zinc-400">
              <tr>
                <th className="py-2 pr-3">{translate("Company")}</th>
                <th className="py-2 pr-3">{translate("Terms")}</th>
                <th className="py-2 pr-3">{translate("Balance")}</th>
                <th className="py-2 pr-3">{translate("Not due")}</th>
                <th className="py-2 pr-3">{translate("1 to 30")}</th>
                <th className="py-2 pr-3">{translate("31 to 60")}</th>
                <th className="py-2 pr-3">{translate("61 to 90")}</th>
                <th className="py-2 pr-3">90+</th>
                <th className="py-2 pr-3">{translate("Overdue")}</th>
                <th className="py-2 pr-3">{translate("Credit")}</th>
                {canSettle ? <th className="py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {aging.map((a) => {
                const overdue = Number(a.overdue || 0)
                const limit = Number(a.credit_limit || 0)
                const over = limit > 0 && Number(a.balance || 0) > limit
                return (
                  <tr key={String(a.name)} className="border-t border-zinc-100">
                    <td className="py-2 pr-3">
                      {String(a.company)}
                      {over ? (
                        <span className="ml-2 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">{translate("Over limit")}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-xs text-zinc-500">
                      {Number(a.credit_days ?? 0)}{translate(" days")}</td>
                    <td className="py-2 pr-3 tabular-nums">{inr(a.balance)}</td>
                    <td className="py-2 pr-3 tabular-nums">{inr(a.not_due)}</td>
                    <td className="py-2 pr-3 tabular-nums">{inr(a.d1_30)}</td>
                    <td className="py-2 pr-3 tabular-nums">{inr(a.d31_60)}</td>
                    <td className="py-2 pr-3 tabular-nums">{inr(a.d61_90)}</td>
                    <td className="py-2 pr-3 tabular-nums">{inr(a.d90p)}</td>
                    <td
                      className={`py-2 pr-3 tabular-nums ${overdue ? "font-medium text-rose-700" : ""}`}
                    >
                      {overdue ? inr(overdue) : "-"}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {Number(a.unapplied_credit || 0) ? inr(a.unapplied_credit) : "-"}
                    </td>
                    {canSettle ? (
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button variant="outline" onClick={() => void openStatement(String(a.name))}>{translate("Statement")}</Button>
                          <Button variant="outline" onClick={() => void emailStatement(String(a.name))}>{translate("Email statement")}</Button>
                          <Button variant="outline" onClick={() => setPaying(String(a.name))}>{translate("Record payment")}</Button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                )
              })}
              {!aging.length ? (
                <tr>
                  <td colSpan={canSettle ? 11 : 10} className="py-6 text-center text-zinc-400">{translate("No city ledger accounts yet.")}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {paying ? (
        <CityLedgerPayment
          account={paying}
          onClose={() => setPaying(null)}
          onPosted={() => void load()}
        />
      ) : null}
    </div>
  )
}
