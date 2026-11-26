import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { call } from "../lib/api"
import { serverError } from "../lib/resource"
import type { Row } from "../lib/resource"
import { Button } from "./ui/button"
import { cur, moneyLocale } from "../lib/money"
import { useT, t as translate } from "../lib/i18n"


/** Cancel a stay the right way: see what it costs, say why, get a
 * cancellation number the guest can keep. Lives in the reservation
 * drawer - the status field itself refuses direct flips to Cancelled. */

const REASONS = [
  "Guest request",
  "Change of plans",
  "Duplicate booking",
  "Payment failed",
  "Weather / travel disruption",
  "Booked elsewhere",
  "Other",
]

interface Preview {
  days_before_arrival: number
  free_cancel_days: number
  inside_window: boolean
  fee_basis: string
  estimated_fee: number
  eligible_refund?: number
  amount_paid?: number
  booking_amount?: number
  cancellation_policy?: string
  cancellation_policy_type?: string
  cancellation_deadline?: string
  policy_description?: string
  allow_hotel_cancellation_waiver?: number
}

const inr = (n: number) =>
  Number(n).toLocaleString(moneyLocale(), { maximumFractionDigits: 0 })

export default function CancelPanel({ row, reload }: { row: Row; reload: () => void }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [reason, setReason] = useState(REASONS[0])
  const [note, setNote] = useState("")
  const [waive, setWaive] = useState(false)
  const [issueCreditNote, setIssueCreditNote] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{
    cancellation_number: string
    fee: number
    eligible_refund?: number
    refund_status?: string
    credit_note_voucher?: string
  } | null>(null)

  useEffect(() => {
    if (open && !preview)
      call<Preview>("izensphere_stay_and_dine.api.cancellation_preview", {
        reservation: row.name,
      })
        .then(setPreview)
        .catch((e) => setError(serverError(e)))
  }, [open, preview, row.name])

  if (row.status !== "Confirmed" && !done) return null

  if (done)
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <p className="font-semibold">
          {t("Cancelled - {n}", { n: done.cancellation_number })}
        </p>
        <p className="mt-0.5">
          {done.fee > 0
            ? t("Cancellation fee {amount} posted to the folio.", {
                amount: `${cur()}${inr(done.fee)}`,
              })
            : t("No fee applied.")}{" "}
          {done.eligible_refund && done.eligible_refund > 0 ? (
            <span className="font-semibold text-emerald-950">
              · {t("Eligible refund: {amount} ({status})", {
                amount: `${cur()}${inr(done.eligible_refund)}`,
                status: done.refund_status || "Pending",
              })}
            </span>
          ) : null}
        </p>
        {done.credit_note_voucher && (
          <p className="mt-1 text-xs font-mono text-emerald-900">
            {t("Credit voucher: {code}", { code: done.credit_note_voucher })}
          </p>
        )}
        <p className="mt-1 text-xs text-emerald-700">
          {t("Give the guest the cancellation number.")}
        </p>
        <Link
          to={`/cancelled/${encodeURIComponent(String(row.name))}`}
          className="mt-1.5 inline-block font-medium text-emerald-900 underline"
        >
          {t("Print / share the confirmation letter")}
        </Link>
      </div>
    )

  return (
    <div className="border-t border-zinc-200 pt-4">
      {!open ? (
        <Button variant="outline" onClick={() => setOpen(true)}>
          {t("Cancel this stay…")}
        </Button>
      ) : (
        <div className="space-y-3">
          {preview && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5 text-xs text-zinc-700 space-y-2">
              <div className="flex items-center justify-between font-semibold text-zinc-900">
                <span>{preview.cancellation_policy_type || t("Hotel Policy")}</span>
                <span>{preview.inside_window ? t("Penalty Applies") : t("Free Cancellation Window")}</span>
              </div>
              <p className="leading-relaxed text-zinc-600">
                {preview.policy_description ||
                  (preview.inside_window && preview.fee_basis !== "None"
                    ? t("Cancellation fee applies after deadline.")
                    : t("Cancellation is free before the deadline."))}
              </p>
              {preview.cancellation_deadline && (
                <p className="text-[11px] text-zinc-500">
                  {t("Free cancellation deadline")}: <b className="font-mono text-zinc-800">{preview.cancellation_deadline}</b>
                </p>
              )}
              <div className="grid grid-cols-3 gap-2 border-t border-zinc-200/80 pt-2 text-center text-[11px]">
                <div className="rounded-lg bg-white p-2 border border-zinc-100">
                  <span className="block text-zinc-400">{t("Amount Paid")}</span>
                  <span className="font-semibold text-zinc-900">{cur()}{inr(preview.amount_paid || 0)}</span>
                </div>
                <div className="rounded-lg bg-white p-2 border border-zinc-100">
                  <span className="block text-zinc-400">{t("Cancel Fee")}</span>
                  <span className={`font-semibold ${preview.estimated_fee > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {cur()}{inr(preview.estimated_fee)}
                  </span>
                </div>
                <div className="rounded-lg bg-white p-2 border border-zinc-100">
                  <span className="block text-zinc-400">{t("Eligible Refund")}</span>
                  <span className="font-semibold text-emerald-700">{cur()}{inr(preview.eligible_refund || 0)}</span>
                </div>
              </div>
            </div>
          )}
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-600">
              {t("Reason")}
            </span>
            <select
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:outline-2 focus:outline-offset-1 focus:outline-brand-600"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {REASONS.map((r) => (
                <option key={r}>{t(r)}</option>
              ))}
            </select>
          </label>
          <textarea
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:outline-2 focus:outline-offset-1 focus:outline-brand-600"
            placeholder={t("Anything worth remembering (optional)")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {preview?.inside_window && preview.fee_basis !== "None" && (
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <input
                type="checkbox"
                className="size-4 accent-brand-600"
                checked={waive}
                onChange={(e) => setWaive(e.target.checked)}
              />
              {t("Waive the fee (logged - manager's call)")}
            </label>
          )}
          {preview && (preview.eligible_refund || 0) > 0 && (
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <input
                type="checkbox"
                className="size-4 accent-brand-600"
                checked={issueCreditNote}
                onChange={(e) => setIssueCreditNote(e.target.checked)}
              />
              {t("Issue credit note voucher instead of cash/bank refund")}
            </label>
          )}
          <div className="flex items-center gap-2">
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setError(null)
                try {
                  const out = await call<{
                    cancellation_number: string
                    fee: number
                    eligible_refund?: number
                    refund_status?: string
                    credit_note_voucher?: string
                  }>("izensphere_stay_and_dine.api.cancel_reservation", {
                    reservation: row.name,
                    reason,
                    note: note || undefined,
                    waive_fee: waive ? 1 : 0,
                    issue_credit_note: issueCreditNote ? 1 : 0,
                  })
                  setDone(out)
                  reload()
                } catch (e) {
                  setError(serverError(e))
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? t("Cancelling…") : t("Confirm cancellation")}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("Keep the booking")}
            </Button>
          </div>
          {error && <p className="text-xs text-rose-600">{translate(error)}</p>}
        </div>
      )}
    </div>
  )
}
