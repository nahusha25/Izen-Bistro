/*  The Izensphere Stay and Dine app suite.
    Standardized Phase 1 Navigation Architecture.
    Organized into 10 core business operations:
    1. Dashboard
    2. Front Desk & Reservations
    3. Guest Management
    4. Room Board & Housekeeping
    5. Billing & Accounting
    6. Restaurant POS
    7. Kitchen Management
    8. Revenue & Reports
    9. Direct Booking
    10. Settings & Administration
*/

import { toFullPath } from "./routing"
import {
  BadgePercent,
  BedDouble,
  Building2,
  CalendarDays,
  ClipboardList,
  Clock,
  ExternalLink,
  HeartPulse,
  Home,
  Landmark,
  LayoutGrid,
  ListChecks,
  ListTodo,
  PackageSearch,
  Boxes,
  Printer,
  Receipt,
  Settings as SettingsIcon,
  Smartphone,
  Store,
  Tags,
  Ticket,
  Compass,
  TrendingUp,
  UserCog,
  Users,
  UtensilsCrossed,
  ConciergeBell,
  BarChart3,
  ChartLine,
  Globe,
  Lock,
  LayoutDashboard,
  Wallet,
  BookOpen,
  History,
  Banknote,
  MoonStar,
  FileUp,
  DoorOpen,
  Hash,
  ListOrdered,
  HandCoins,
} from "lucide-react"

/** "Night audit" is what most hotels call End of Day; EOD is what they type. */
const EOD_KEYWORDS = ["End of day", "EOD", "Close the day", "Roll the date"]

/** Shared tile treatment for switcher and launcher. One quiet system, not a rainbow. */
export const APP_TILE =
  "border border-zinc-200 bg-zinc-50 text-zinc-700"

export interface AppNavItem {
  to?: string
  href?: string // external (Frappe Desk, HK mobile app) - opens a new tab
  label: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  roles?: string[] // per-item gate on top of the app's gate
  /** Sidebar section label within an app (e.g. Cashier / Billing / Books). */
  group?: string
  /** Other words search (Ctrl/Cmd+K) finds this page by. */
  keywords?: string[]
  /** Drawn as a highlighted entry in the sidebar. */
  featured?: boolean
}

export interface AppDef {
  id: string
  name: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  /** @deprecated kept for callers; all apps share APP_TILE */
  tint: string
  description: string
  roles: string[] // any of these roles can see the app
  items: AppNavItem[]
  /** extra route prefixes that belong to this app (detail pages etc.) */
  extraPrefixes?: string[]
}

const DESK = import.meta.env.PROD ? "" : "http://localhost:8000"

export const APPS: AppDef[] = [
  // 1. Dashboard
  {
    id: "dashboard",
    name: "Dashboard",
    icon: LayoutDashboard,
    tint: APP_TILE,
    description: "Operational overview, today's snapshot, and executive KPIs.",
    roles: [
      "Front Desk", "Hotel Admin", "System Manager", "Administrator",
      "Revenue Manager", "Finance", "Night Auditor",
    ],
    items: [
      { to: "/", label: "Today's Overview", icon: Home,
        keywords: ["Today", "Front Desk overview", "Arrivals today", "Departures today"] },
      { to: "/dashboard", label: "Executive Dashboard", icon: LayoutDashboard,
        keywords: ["Dashboard", "KPIs", "ADR", "RevPAR", "Occupancy", "Revenue"] },
      { to: "/owner", label: "Owner Mobile View", icon: Smartphone,
        keywords: ["Phone", "Mobile", "Owner", "Flash report", "MTD"] },
    ],
    extraPrefixes: ["/dashboard", "/owner"],
  },

  // 2. Front Desk & Reservations
  {
    id: "front-desk",
    name: "Front Desk & Reservations",
    icon: Building2,
    tint: APP_TILE,
    description: "Arrivals, departures, tape chart, room availability, and calendar.",
    roles: ["Front Desk", "Night Auditor", "Hotel Admin", "System Manager", "Administrator"],
    items: [
      { to: "/in-house", label: "Arrivals & Departures", icon: BedDouble,
        keywords: ["Arrivals", "Departures", "In-house guests", "Due out", "Who is in"] },
      { to: "/reservations", label: "Reservations", icon: ClipboardList,
        keywords: ["Bookings", "Reservation list", "Modify booking", "Cancel booking"] },
      { to: "/tape", label: "Tape Chart", icon: LayoutGrid,
        keywords: ["Room availability", "Tape chart", "Grid", "Timeline"] },
      { to: "/calendar", label: "Reservation Calendar", icon: CalendarDays,
        keywords: ["Calendar", "Monthly view", "Availability calendar"] },
      { to: "/room-blocks", label: "Room Blocks", icon: Lock,
        keywords: ["Blocks", "Out of order", "Maintenance block", "Hold"] },
      { to: "/groups", label: "Group Bookings", icon: Users,
        keywords: ["Groups", "Group bookings", "Rooming list", "Blocks"] },
    ],
    extraPrefixes: ["/grc", "/cancelled", "/trip", "/in-house", "/tape", "/calendar", "/room-blocks"],
  },

  // 3. Guest Management
  {
    id: "guests",
    name: "Guest Management",
    icon: Users,
    tint: APP_TILE,
    description: "Guest directory, guest profiles, preferences, and service requests.",
    roles: ["Front Desk", "Hotel Admin", "System Manager", "Administrator"],
    items: [
      { to: "/guests", label: "Guest Directory", icon: Users,
        keywords: ["Guests", "Guest profiles", "Past guests", "Loyalty", "Search guest"] },
      { to: "/tickets", label: "Service Requests", icon: Ticket,
        keywords: ["Tickets", "Guest request", "Complaints", "SLA", "Room service ticket"] },
      { to: "/ops-sla", label: "Operations SLA", icon: ListTodo,
        keywords: ["SLA", "Response time", "Ticket performance"] },
    ],
    extraPrefixes: ["/guests", "/tickets", "/ops-sla"],
  },

  // 4. Room Board & Housekeeping
  {
    id: "housekeeping",
    name: "Room Board & Housekeeping",
    icon: DoorOpen,
    tint: APP_TILE,
    description: "Live room statuses, housekeeping board, task queues, and staff phone app.",
    roles: [
      "Housekeeping", "Housekeeping Supervisor", "Front Desk", "Hotel Admin",
      "System Manager", "Administrator",
    ],
    items: [
      { to: "/room-board", label: "Room Status Board", icon: DoorOpen,
        keywords: ["Rooms", "Clean", "Dirty", "Inspected", "Out of order", "Maintenance"] },
      { to: "/housekeeping-board", label: "Housekeeping Board", icon: LayoutGrid,
        roles: ["Housekeeping Supervisor", "Front Desk", "Hotel Admin", "System Manager", "Administrator"],
        keywords: ["HK board", "Supervisor", "Assign attendants", "Room status"] },
      { to: "/housekeeping", label: "Cleaning Tasks", icon: ListChecks,
        keywords: ["Tasks", "Checkout clean", "Stayover clean", "Priority"] },
      { href: toFullPath("/hk"), label: "Staff Phone App", icon: Smartphone,
        keywords: ["Phone", "Mobile app", "Attendant login", "Room cleaning progress"] },
      { to: "/lost-found", label: "Lost & Found", icon: PackageSearch,
        roles: ["Housekeeping Supervisor", "Hotel Admin", "System Manager", "Administrator"],
        keywords: ["Lost", "Found", "Guest belongings", "Items"] },
    ],
    extraPrefixes: ["/room-board", "/housekeeping-board", "/housekeeping", "/lost-found"],
  },

  // 5. Billing & Accounting
  {
    id: "billing",
    name: "Billing & Accounting",
    icon: Receipt,
    tint: APP_TILE,
    description: "Guest folios, payment collection, cashier tills, shifts, and night audit.",
    roles: [
      "Finance", "Front Desk", "Night Auditor", "Hotel Admin", "System Manager",
      "Administrator",
    ],
    items: [
      // Folios & Billing
      { to: "/billing", label: "Guest Folios", icon: Receipt, group: "Billing",
        keywords: ["Folios", "Bills", "Charges", "Invoices", "Settle"] },
      { to: "/folio-history", label: "Folio History", icon: History, group: "Billing",
        keywords: ["Closed folios", "Reprint invoice", "Historical bills"] },
      { to: "/allowances", label: "Allowances & Voids", icon: ListChecks, group: "Billing",
        keywords: ["Allowance approval", "Write-off", "Manager discount approval"] },
      // Cashier
      { to: "/cashier", label: "My Cashier Till", icon: Wallet, group: "Cashier",
        keywords: ["Till", "Cash drawer", "Opening float", "Drop cash", "Pay out"] },
      { to: "/cashier/board", label: "All Cashier Tills", icon: Landmark, group: "Cashier",
        roles: ["Finance", "Hotel Admin", "System Manager", "Administrator"],
        keywords: ["Cashier oversight", "All tills", "Floating balance"] },
      { to: "/cashier/sessions", label: "Till Sessions & Reports", icon: Clock, group: "Cashier",
        keywords: ["Shift reports", "Closing till", "Z-report", "Collections"] },
      { to: "/cashier/petty-cash", label: "Petty Cash", icon: Banknote, group: "Cashier",
        keywords: ["Petty cash", "Disbursements", "Cash voucher"] },
      { to: "/shifts", label: "Shift Handover", icon: Clock, group: "Cashier",
        keywords: ["Handover notes", "Cash tally", "Shift report"] },
      // Accounts & Night Audit
      { to: "/receivables", label: "Accounts Receivable", icon: Building2, group: "Accounts",
        keywords: ["AR", "City ledger", "Corporate accounts", "Direct billing", "Aging"] },
      { to: "/ledgers", label: "Audit Ledgers", icon: BookOpen, group: "Accounts",
        keywords: ["Sub-ledger", "Journal entries", "Audit trail"] },
      { to: "/payables", label: "Vendor Payables", icon: HandCoins, group: "Accounts",
        roles: ["Finance", "Hotel Admin", "System Manager", "Administrator"],
        keywords: ["AP", "Suppliers", "Vendor invoices", "Bills"] },
      { to: "/end-of-day", label: "Night Audit (EOD)", icon: MoonStar, group: "Audit",
        keywords: EOD_KEYWORDS },
      { to: "/transaction-codes", label: "Transaction Codes", icon: Hash, group: "Configuration",
        roles: ["Finance", "Hotel Admin", "System Manager", "Administrator"],
        keywords: ["Txn codes", "Revenue department", "Charge codes"] },
      { to: "/reason-codes", label: "Reason Codes", icon: ListOrdered, group: "Configuration",
        roles: ["Finance", "Hotel Admin", "System Manager", "Administrator"],
        keywords: ["Void reasons", "Discount reasons", "Refund reasons"] },
    ],
    extraPrefixes: ["/billing", "/cashier", "/end-of-day", "/receivables", "/ledgers", "/payables", "/shifts"],
  },

  // 6. Restaurant POS
  {
    id: "pos",
    name: "Restaurant POS",
    icon: UtensilsCrossed,
    tint: APP_TILE,
    description: "Dine-in, takeaway, and room-service ordering, tables, and billing.",
    roles: ["Front Desk", "Finance", "F&B Manager", "Hotel Admin", "System Manager", "Administrator"],
    items: [
      { href: "/desk/restaurant-floor-management", label: "Restaurant POS Terminal", icon: UtensilsCrossed,
        keywords: ["POS", "Dine-in", "Takeaway", "Room service order", "Table billing"] },
      { href: "/desk/restaurant-order-management", label: "Restaurant Orders (Izen Bistro)", icon: TrendingUp,
        keywords: ["POS dashboard", "F&B sales", "Covers", "Daily sales"] },
      { to: "/outlets", label: "Dining Outlets", icon: Store,
        keywords: ["Outlets", "Restaurants", "Bars", "Cafes", "Dining rooms"] },
    ],
    extraPrefixes: ["/pos", "/pos-dashboard", "/outlets"],
  },

  // 7. Kitchen Management
  {
    id: "kitchen",
    name: "Kitchen Management",
    icon: ConciergeBell,
    tint: APP_TILE,
    description: "Kitchen display system, recipes, stock deductions, and printers.",
    roles: ["F&B Manager", "Finance", "Hotel Admin", "System Manager", "Administrator"],
    items: [
      { href: "/desk/restaurant-kitchen-display", label: "Kitchen Display (KDS)", icon: ConciergeBell,
        keywords: ["KDS", "Order tickets", "Preparation", "Ready", "Pass", "Chef display"] },
      { href: "/desk/restaurant-menu-management", label: "Menu Management", icon: ClipboardList,
        keywords: ["Dishes", "Menu items", "Prices", "Categories", "Food menu"] },
      { href: "/desk/restaurant-inventory", label: "Kitchen Inventory & Stock", icon: PackageSearch,
        keywords: ["Stock", "Inventory", "Store room", "Low stock alerts", "Stock deduction"] },
      { href: "/desk/restaurant-inventory", label: "Ingredients & Recipes", icon: Boxes,
        keywords: ["Ingredients", "Recipes", "Food cost", "Raw materials", "UOM"] },
      { to: "/printers", label: "Kitchen Printers (KOT)", icon: Printer,
        keywords: ["KOT printers", "Thermal printing", "Kitchen station"] },
    ],
    extraPrefixes: ["/kitchen", "/menu-items", "/inventory", "/ingredients", "/printers"],
  },

  // 8. Revenue & Reports
  {
    id: "revenue",
    name: "Revenue & Reports",
    icon: BarChart3,
    tint: APP_TILE,
    description: "Operational and financial reports, rate plans, seasons, and yield.",
    roles: ["Revenue Manager", "Hotel Admin", "System Manager", "Administrator"],
    items: [
      { to: "/reports", label: "Reports Hub", icon: ChartLine, group: "Reports",
        keywords: ["Reports", "Occupancy report", "ADR", "RevPAR", "Room revenue", "GST report"] },
      { to: "/revenue-reports", label: "Revenue Analytics", icon: BarChart3, group: "Reports",
        keywords: ["Financial analytics", "Monthly revenue", "Year over year"] },
      { to: "/rate-calendar", label: "Rate Calendar", icon: CalendarDays, group: "Pricing",
        keywords: ["BAR", "Base rate", "Daily tariff", "Seasonal rate"] },
      { to: "/rate-plans", label: "Rate Plans", icon: Tags, group: "Pricing",
        keywords: ["EP", "CP", "MAP", "AP", "Corporate rate", "Direct rate"] },
      { to: "/cancellation-policies", label: "Cancellation Policies", icon: ClipboardList, group: "Pricing",
        keywords: ["Cancellation policy", "Refund rules", "No-show fees", "Deadlines"] },
      { to: "/seasons", label: "Seasons", icon: CalendarDays, group: "Pricing",
        keywords: ["High season", "Peak", "Monsoon", "Holiday season"] },
      { to: "/vouchers", label: "Discount Vouchers", icon: BadgePercent, group: "Offers",
        keywords: ["Promo code", "Discounts", "Coupons"] },
      { to: "/long-stay", label: "Long-stay Discounts", icon: BadgePercent, group: "Offers",
        keywords: ["Extended stay", "Weekly", "Monthly discount"] },
      { to: "/meal-plans", label: "Meal Plans", icon: UtensilsCrossed, group: "Packages",
        keywords: ["Breakfast included", "Half board", "Full board"] },
      { to: "/experiences", label: "Guest Experiences", icon: Compass, group: "Packages",
        keywords: ["Add-ons", "Activities", "Tours"] },
    ],
    extraPrefixes: ["/reports", "/revenue-reports", "/rate-calendar", "/rate-plans", "/cancellation-policies", "/seasons", "/vouchers", "/long-stay", "/meal-plans", "/experiences"],
  },

  // 9. Direct Booking
  {
    id: "direct-booking",
    name: "Direct Booking",
    icon: Globe,
    tint: APP_TILE,
    description: "Public direct booking engine (/book) and guest stay portal (/stay).",
    roles: ["Front Desk", "Revenue Manager", "Hotel Admin", "System Manager", "Administrator"],
    items: [
      { to: "/booking-settings", label: "Booking Engine Setup", icon: SettingsIcon,
        keywords: ["Public booking settings", "Deposit policy", "Showcase"] },
      { href: toFullPath("/book"), label: "Customer Booking Page", icon: Globe,
        keywords: ["Book online", "Guest booking engine", "Reservation website"] },
      { to: "/stay", label: "Guest Stay Portal", icon: Smartphone,
        keywords: ["Stay portal", "Guest self check-in", "Digital folio"] },
    ],
    extraPrefixes: ["/booking-settings"],
  },

  // 10. Settings & Administration
  {
    id: "admin",
    name: "Settings & Administration",
    icon: SettingsIcon,
    tint: APP_TILE,
    description: "Property setup, room inventory, system health, and staff permissions.",
    roles: ["Hotel Admin", "System Manager", "Administrator"],
    items: [
      { to: "/settings", label: "System Settings", icon: SettingsIcon, group: "Setup",
        keywords: ["Company", "Branding", "Tax settings", "GSTIN", "Payment gateways"] },
      { to: "/room-types", label: "Room Types", icon: LayoutGrid, group: "Inventory",
        keywords: ["Room categories", "Deluxe", "Suite", "Amenities", "Max guests"] },
      { to: "/rooms", label: "Physical Rooms", icon: DoorOpen, group: "Inventory",
        keywords: ["Room inventory", "Floors", "Room numbers"] },
      { to: "/health", label: "System Health", icon: HeartPulse, group: "System",
        keywords: ["Diagnostics", "Database", "Redis status", "Background jobs"] },
      { to: "/settings/staff", label: "Staff & User Roles", icon: UserCog, group: "System",
        keywords: ["Users", "Roles", "Permissions", "Access control"] },
      { to: "/go-live", label: "Data Import & Migration", icon: FileUp, group: "System",
        keywords: ["Import rooms", "Import guests", "Historical migration"] },
      { href: `${DESK}/app/build`, label: "Frappe Desk Backend", icon: ExternalLink,
        roles: ["Administrator", "System Manager"],
        keywords: ["Frappe desk", "ERPNext desk", "Admin portal"] },
    ],
    extraPrefixes: ["/settings", "/room-types", "/rooms", "/health", "/go-live"],
  },
]

/** Alias mapping to preserve full backwards compatibility with existing properties' enabled_modules setting */
const MODULE_ALIASES: Record<string, string[]> = {
  "dashboard": ["dashboard", "front-desk", "admin"],
  "front-desk": ["front-desk"],
  "guests": ["guests", "front-desk", "operations"],
  "housekeeping": ["housekeeping"],
  "billing": ["billing", "finance"],
  "pos": ["pos", "fnb"],
  "kitchen": ["kitchen", "fnb"],
  "revenue": ["revenue"],
  "direct-booking": ["direct-booking", "booking-engine"],
  "admin": ["admin"],
}

/** Which app owns a path? Longest matching item route wins; "/" only exact. */
export function appForPath(pathname: string, among: AppDef[] = APPS, keep?: string): AppDef {
  const pool = among.length ? among : APPS
  const kept = keep ? pool.find((a) => a.id === keep) : undefined
  if (kept) {
    const owns = (a: AppDef) =>
      [...a.items.filter((i) => i.to).map((i) => i.to!), ...(a.extraPrefixes ?? [])].some(
        (p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(p.endsWith("/") ? p : p + "/")),
      )
    if (owns(kept)) return kept
    const menuApp = pool.find((a) => a.items.some((i) => i.to === pathname))
    return menuApp ?? kept
  }
  let best: { app: AppDef; len: number } | null = null
  for (const app of pool) {
    const prefixes = [
      ...app.items.filter((i) => i.to).map((i) => i.to!),
      ...(app.extraPrefixes ?? []),
    ]
    for (const p of prefixes) {
      const hit =
        p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p)
      if (hit && (!best || p.length > best.len))
        best = { app, len: p.length }
    }
  }
  return best?.app ?? APPS[0]
}

/** The apps this user can reach based on role access and property module configuration. */
export function visibleApps(roles: string[], modules?: string[]): AppDef[] {
  return APPS.filter((a) => {
    // 1. Role verification
    const hasRole = a.roles.some((r) => roles.includes(r))
    if (!hasRole) return false

    // 2. Module verification
    if (!modules || modules.length === 0) return true
    const aliases = MODULE_ALIASES[a.id] || [a.id]
    return aliases.some((alias) => modules.includes(alias))
  })
}
