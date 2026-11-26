# Izen Bistro & Izensphere Stay & Dine

Integrated Frappe v16 hospitality platform combining **Izen Bistro** (`restaurant_management`, repository root) and **Izensphere Stay & Dine** (`apps/izensphere_stay_and_dine/`, hotel PMS).

## Repository Layout

- **`restaurant_management/`** (root package) — Izen Bistro floor & table management, table reservations (`/book`), table QR & room-service ordering (`/order`), Kitchen Display System (KDS), menu & recipes, and warehouse/kitchen inventory.
- **`apps/izensphere_stay_and_dine/`** — Izensphere Stay & Dine Hotel PMS (multi-property rooms, rates, reservations, pre-check-in, housekeeping, folios, GST billing, reports, and React SPA frontend).

## Key Routes

| Flow | Route |
|---|---|
| Unified Customer Booking Portal | `/customer-booking` |
| Hotel Room Booking (`Izensphere Stay & Dine`) | `/hotel-book` → `/izensphere-stay-and-dine/book` |
| Bistro Table Reservation (`Izen Bistro`) | `/book` |
| In-Room Dining (Enter Room No) | `/order?mode=room` (or `/order?room=<room_no>&token=<token>`) |
| Bistro Table QR Ordering | `/order?table=T-03` |
| Hotel Staff Dashboard | `/izensphere-stay-and-dine` |
| Bistro Floor & Tables | `/desk/restaurant-floor-management` |
| Bistro Kitchen Display (KDS) | `/desk/restaurant-kitchen-display` |
| Bistro Inventory & Warehouse | `/desk/restaurant-inventory` |

## Integration Highlights

- **Unified Booking & Sync:** `/customer-booking` offers room booking, table reservation, and in-room dining entry. Hotel bookings sync to Reception (`Reservations`, `Reservation Calendar`, `Today's Overview`) via Socket.IO with `sync_pulse` fallback polling.
- **Room Service → Bistro KDS → Hotel Folio:** Room-service orders (from Reception or `/order?mode=room` / room QR) are scoped to the exact property, room, and active stay, routed to the live Bistro KDS, deduct recipe ingredients from Bistro kitchen stock upon preparation, and post charges idempotently to the guest's hotel folio upon delivery.
- **Staff Check-in & Permissions:** Staff can confirm pending-advance bookings and check guests in directly from the Reservation drawer (`Confirm booking` / `Confirm & Check in`), and hotel staff roles have access to Bistro Floor, KDS, Menu, Orders, and Inventory pages.

## Installation

### 1. Install Izen Bistro (`restaurant_management`)

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app https://github.com/nahusha25/Izen-Bistro.git --branch version-16
bench --site <your-site> install-app restaurant_management
```

### 2. Install Izensphere Stay & Dine (`apps/izensphere_stay_and_dine`)

Install the `izensphere_stay_and_dine` app from `apps/izensphere_stay_and_dine/` in this repository (requires `payments`):

```bash
# From your bench apps directory, link or copy apps/izensphere_stay_and_dine
bench --site <your-site> install-app izensphere_stay_and_dine
bench --site <your-site> migrate
```

To rebuild the Hotel SPA frontend:

```bash
cd apps/izensphere_stay_and_dine/frontend
npm ci
npm run build
```

## Contributing

This app uses `pre-commit` for code formatting and linting (`ruff`, `eslint`, `prettier`, `pyupgrade`):

```bash
cd apps/restaurant_management
pre-commit install
```

### CI

- **CI:** Installs the app and runs unit tests on push to `develop`.
- **Linters:** Runs [Frappe Semgrep Rules](https://github.com/frappe/semgrep-rules) and `pip-audit` on pull requests.

## License

- `restaurant_management`: MIT
- `izensphere_stay_and_dine`: See `apps/izensphere_stay_and_dine/license.txt` (AGPL-3.0)
