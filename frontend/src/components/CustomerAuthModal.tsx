import { useState, useEffect } from "react"
import { X, Lock, Mail, User, Phone, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { call, login } from "../lib/api"
import { useAuth } from "../lib/auth"
import { useT } from "../lib/i18n"
import { Button } from "./ui/button"

interface CustomerAuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (userData?: { user: string; fullName: string; email: string; phone: string }) => void
  title?: string
  subtitle?: string
  initialTab?: "login" | "register"
  initialEmail?: string
}

export default function CustomerAuthModal({
  isOpen,
  onClose,
  onSuccess,
  title,
  subtitle,
  initialTab = "login",
  initialEmail = "",
}: CustomerAuthModalProps) {
  const { t } = useT()
  const auth = useAuth()
  const [tab, setTab] = useState<"login" | "register">(initialTab)

  // Login form state
  const [loginEmail, setLoginEmail] = useState(initialEmail || "")
  const [loginPassword, setLoginPassword] = useState("")

  // Register form state
  const [regName, setRegName] = useState("")
  const [regEmail, setRegEmail] = useState(initialEmail || "")
  const [regPhone, setRegPhone] = useState("")
  const [regPassword, setRegPassword] = useState("")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialEmail && initialEmail.trim()) {
      setLoginEmail(initialEmail.trim())
      setRegEmail(initialEmail.trim())
    }
  }, [initialEmail, isOpen])

  if (!isOpen) return null

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setError(t("Please enter your email and password."))
      return
    }

    setLoading(true)
    setError(null)
    try {
      await login(loginEmail.trim(), loginPassword)
      await auth.refresh()
      onSuccess({
        user: loginEmail.trim(),
        fullName: loginEmail.trim(),
        email: loginEmail.trim(),
        phone: "",
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes("wrong") || msg.toLowerCase().includes("invalid") || msg.includes("401")) {
        setError(t("Incorrect email or password. Please try again."))
      } else {
        setError(msg || t("Login failed. Please verify your credentials."))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regName.trim()) {
      setError(t("Please enter your full name."))
      return
    }
    if (!regEmail.trim() || !regEmail.includes("@")) {
      setError(t("Please enter a valid email address."))
      return
    }
    if (!regPhone.trim()) {
      setError(t("Please enter your mobile phone number."))
      return
    }
    if (regPassword.length < 6) {
      setError(t("Password must be at least 6 characters."))
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await call<{
        success: boolean
        user: string
        full_name: string
        email: string
        phone: string
      }>("izensphere_stay_and_dine.public_api.customer_register", {
        full_name: regName.trim(),
        email: regEmail.trim(),
        password: regPassword,
        phone: regPhone.trim(),
      })

      // Also ensure official Frappe login session is authenticated
      try {
        await login(regEmail.trim(), regPassword)
      } catch {
        // Ignored if session already set by registration endpoint
      }

      await auth.refresh()
      onSuccess({
        user: res.user || regEmail.trim(),
        fullName: res.full_name || regName.trim(),
        email: res.email || regEmail.trim(),
        phone: res.phone || regPhone.trim(),
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || t("Registration failed. Please check the information entered."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={() => !loading && onClose()}
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-md transform overflow-hidden rounded-2xl bg-white shadow-2xl transition-all border border-zinc-200">
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4 border-b border-zinc-100 bg-zinc-50/50">
          <button
            onClick={() => !loading && onClose()}
            className="absolute top-5 right-5 p-1 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 transition"
            aria-label={t("Close")}
          >
            <X className="size-5" />
          </button>
          <div className="pr-6">
            <h3 className="text-lg font-bold text-zinc-900">
              {title || (tab === "login" ? t("Sign in to continue") : t("Create customer account"))}
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              {subtitle || t("Your selected room, dates, and rate are saved.")}
            </p>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-zinc-200 mt-4 -mb-4">
            <button
              type="button"
              onClick={() => {
                setTab("login")
                setError(null)
              }}
              className={`flex-1 py-2.5 text-center text-sm font-semibold border-b-2 transition ${
                tab === "login"
                  ? "border-emerald-600 text-emerald-700"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {t("Sign In")}
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("register")
                setError(null)
              }}
              className={`flex-1 py-2.5 text-center text-sm font-semibold border-b-2 transition ${
                tab === "register"
                  ? "border-emerald-600 text-emerald-700"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {t("Create Account")}
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6">
          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="size-4 shrink-0 mt-0.5 text-red-600" />
                <div className="flex-1 font-medium">{error}</div>
              </div>
              {error.toLowerCase().includes("already exists") && (
                <div className="mt-2 text-end">
                  <button
                    type="button"
                    onClick={() => {
                      setTab("login")
                      if (regEmail) setLoginEmail(regEmail)
                      setError(null)
                    }}
                    className="inline-flex items-center gap-1 font-bold text-emerald-800 hover:underline"
                  >
                    {t("Switch to Sign In →")}
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  {t("Email address or Username")}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 size-4 text-zinc-400" />
                  <input
                    type="text"
                    required
                    autoFocus
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-zinc-300 pl-9 pr-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  {t("Password")}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 size-4 text-zinc-400" />
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-zinc-300 pl-9 pr-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading || !loginEmail.trim() || !loginPassword.trim()}
                className="w-full justify-center py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-semibold shadow-sm text-sm"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    {t("Signing in...")}
                  </span>
                ) : (
                  t("Sign in & Continue Booking")
                )}
              </Button>

              <div className="text-center pt-2">
                <p className="text-xs text-zinc-500">
                  {t("Don't have an account?")}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setTab("register")
                      setError(null)
                    }}
                    className="font-semibold text-emerald-700 hover:underline"
                  >
                    {t("Create one in seconds")}
                  </button>
                </p>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  {t("Full Name")}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 size-4 text-zinc-400" />
                  <input
                    type="text"
                    required
                    autoFocus
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full rounded-xl border border-zinc-300 pl-9 pr-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  {t("Email Address")}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 size-4 text-zinc-400" />
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-zinc-300 pl-9 pr-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  {t("Mobile Phone Number")}
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 size-4 text-zinc-400" />
                  <input
                    type="tel"
                    required
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full rounded-xl border border-zinc-300 pl-9 pr-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  {t("Create Password")}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 size-4 text-zinc-400" />
                  <input
                    type="password"
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder={t("At least 6 characters")}
                    className="w-full rounded-xl border border-zinc-300 pl-9 pr-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading || !regName.trim() || !regEmail.trim() || !regPhone.trim() || regPassword.length < 6}
                className="w-full justify-center py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-semibold shadow-sm text-sm mt-2"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    {t("Creating account...")}
                  </span>
                ) : (
                  t("Register & Continue Booking")
                )}
              </Button>

              <div className="text-center pt-2">
                <p className="text-xs text-zinc-500">
                  {t("Already have an account?")}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setTab("login")
                      setError(null)
                    }}
                    className="font-semibold text-emerald-700 hover:underline"
                  >
                    {t("Sign in")}
                  </button>
                </p>
              </div>
            </form>
          )}

          <div className="mt-5 pt-4 border-t border-zinc-100 flex items-center justify-center gap-2 text-[11px] text-zinc-400">
            <CheckCircle2 className="size-3.5 text-emerald-600" />
            <span>{t("Secure connection · Instant confirmation")}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
