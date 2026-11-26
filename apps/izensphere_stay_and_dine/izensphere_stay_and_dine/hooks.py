app_name = "izensphere_stay_and_dine"
app_title = "Izensphere Stay and Dine"
app_publisher = "Izensphere"
app_description = (
	"Izensphere Stay and Dine — A World of Flavours. "
	"Hotel PMS, Restaurant POS, Kitchen Display System, room & table management, orders, "
	"reservations, folios and GST billing."
)
app_email = "dine@izensphere.com"
app_license = "agpl-3.0"

# Branding shown in the Desk navbar, app switcher and marketplace listing.
app_logo_url = "/files/izensphere-stay-and-dine-logo.svg"
app_icon = "octicon octicon-home"
app_color = "#142B49"

# The product UI is the React SPA at /izensphere-stay-and-dine; surface it in the Apps launcher
# (and the /apps grid) so users land on it instead of the Desk.
add_to_apps_screen = [
	{
		"name": "izensphere_stay_and_dine",
		"logo": "/files/izensphere-stay-and-dine-logo.svg",
		"title": "Izensphere Stay and Dine",
		"route": "/izensphere-stay-and-dine",
	}
]

# Automated end-of-day: post room charges, flag no-shows, per property.
scheduler_events = {
	"cron": {
		"0 * * * *": [
			"izensphere_stay_and_dine.channel_manager.push_all_ari",
			# custom reports with Daily/Weekly email schedule
			"izensphere_stay_and_dine.custom_reports.run_scheduled_custom_reports",
			# online exchange rates for the business date (off unless a
			# property turns on fx_auto_fetch; only fills missing rates)
			"izensphere_stay_and_dine.ledger.auto_fetch_exchange_rates",
		],
		# 09:00 - send self check-in links to upcoming arrivals, for properties
		# that turned the setting on (a plain automation, not an agent)
		# (and company payment reminders, off unless a property turns them on)
		"0 9 * * *": ["izensphere_stay_and_dine.prearrival.run_prearrival_outreach",
		              "izensphere_stay_and_dine.statements.run_payment_reminders"],
		# every 15 min - escalate overdue housekeeping tasks up the ladder;
		# also release expired Held / Pending Payment reservations (ADR-006)
		# and, past the property's release time, today's non-guaranteed
		# arrivals (no-show policy, off unless a release time is set)
		# also close the day: the night audit runs per property at its own
		# night_audit_time on its own clock (default 03:00), one date a tick
		"*/15 * * * *": [
			"izensphere_stay_and_dine.folio.nightly_audit_all_properties",
			"izensphere_stay_and_dine.housekeeping.escalate_overdue_tasks",
			"izensphere_stay_and_dine.reservation_state.expire_holds",
			# group blocks past their cutoff give unpicked rooms back to sale
			"izensphere_stay_and_dine.group_blocks.release_expired_blocks",
			"izensphere_stay_and_dine.no_show.release_non_guaranteed_arrivals",
		],
		# 04:15 - wipe the public demo so it cannot be used as a live PMS
		# (no-op unless kamra_demo_mode is on and the site is a playground)
		"15 4 * * *": ["izensphere_stay_and_dine.scripts.reset_demo.scheduled"],
		# 03:30 - storage limitation (DPDP s.8(7)): erase guests idle past
		# their property's retention period
		"30 3 * * *": ["izensphere_stay_and_dine.privacy.apply_retention"],
		# 03:40 - the same for conversations: WhatsApp message text and AI
		# assistant chats past the property's message retention period
		"40 3 * * *": ["izensphere_stay_and_dine.privacy.apply_message_retention"],
		# 03:50 - finished kitchen print jobs (guest names on the ticket)
		# are kept a week for reprints, then dropped
		"50 3 * * *": ["izensphere_stay_and_dine.printing.purge_old_jobs"],
		# 04:45 - drop old kamrapms.com Hosting Enquiry leads (default 24 months;
		# Won / converted stays; site_config hosting_enquiry_retention_months)
		"45 4 * * *": ["izensphere_stay_and_dine.hosting_enquiry_retention.purge_expired_hosting_enquiries"],
		# 06:00 and 18:00 - warm the GitHub latest-release cache for the update nag
		"0 6,18 * * *": ["izensphere_stay_and_dine.health.poll_github_releases"],
		# every minute - outbound webhook retries that are due (backoff)
		"* * * * *": ["izensphere_stay_and_dine.webhooks.retry_due"],
	},
}

# DPDP Rules: keep logs of access to personal data for at least one year
# (Frappe's own defaults are 30 and 90 days).
default_log_clearing_doctypes = {
	"Access Log": [365],
	"Activity Log": [365],
}

# Apps
# ------------------

required_apps = ["payments"]

# Localization packs by country (regional_overrides style). A future
# kamra_uae APP declares its own to claim "United Arab Emirates".
kamra_localization = {
	"India": "izensphere_stay_and_dine.localization.india",
	"Indonesia": "izensphere_stay_and_dine.localization.indonesia",
	"Thailand": "izensphere_stay_and_dine.localization.thailand",
	"Malaysia": "izensphere_stay_and_dine.localization.malaysia",
	"United Arab Emirates": "izensphere_stay_and_dine.localization.uae",
	"Saudi Arabia": "izensphere_stay_and_dine.localization.saudi",
	"Brazil": "izensphere_stay_and_dine.localization.brazil",
	"Brasil": "izensphere_stay_and_dine.localization.brazil",
	"Nicaragua": "izensphere_stay_and_dine.localization.nicaragua",
}

# Served single-page app
# -----------------------
# The React front-end mounts at /kamra and owns all client-side routes
# (front desk, booking engine, housekeeping, self check-in). The `kamra` www
# page (kamra/www/izensphere_stay_and_dine.py) serves the built shell with the CSRF token
# injected; every deep link falls through to it so browser refresh works.
website_route_rules = [
	{"from_route": "/izensphere-stay-and-dine/<path:app_path>", "to_route": "izensphere-stay-and-dine"},
	{"from_route": "/stay-and-dine/<path:app_path>", "to_route": "izensphere-stay-and-dine"},
	{"from_route": "/kamra/<path:app_path>", "to_route": "kamra"},
]

# Clean, shareable guest URLs redirect into the SPA's routes.
website_redirects = [
	{"source": r"/hotel-book$", "target": "/izensphere-stay-and-dine/book"},
	{"source": r"/hotel-book/(.*)", "target": r"/izensphere-stay-and-dine/book/\1"},
	{"source": r"/stay$", "target": "/izensphere-stay-and-dine/stay"},
	{"source": r"/stay/(.*)", "target": r"/izensphere-stay-and-dine/stay/\1"},
	{"source": r"/hk$", "target": "/izensphere-stay-and-dine/hk"},
	{"source": r"/checkin/(.*)", "target": r"/izensphere-stay-and-dine/checkin/\1"},
	{"source": r"/room-board$", "target": "/izensphere-stay-and-dine/room-board"},
	{"source": r"/room-board/(.*)", "target": r"/izensphere-stay-and-dine/room-board/\1"},
	{"source": r"/housekeeping-board$", "target": "/izensphere-stay-and-dine/housekeeping-board"},
	{"source": r"/housekeeping$", "target": "/izensphere-stay-and-dine/housekeeping"},
	{"source": r"/lost-found$", "target": "/izensphere-stay-and-dine/lost-found"},
	{"source": r"/lost-and-found$", "target": "/izensphere-stay-and-dine/lost-found"},
]

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "izensphere_stay_and_dine",
# 		"logo": "/assets/izensphere_stay_and_dine/logo.png",
# 		"title": "Kamra",
# 		"route": "/kamra",
# 		"has_permission": "izensphere_stay_and_dine.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/izensphere_stay_and_dine/css/izensphere_stay_and_dine.css"
# app_include_js = "/assets/izensphere_stay_and_dine/js/izensphere_stay_and_dine.js"

# include js, css files in header of web template
# web_include_css = "/assets/izensphere_stay_and_dine/css/izensphere_stay_and_dine.css"
# web_include_js = "/assets/izensphere_stay_and_dine/js/izensphere_stay_and_dine.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "kamra/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "kamra/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "izensphere_stay_and_dine.utils.jinja_methods",
# 	"filters": "izensphere_stay_and_dine.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "izensphere_stay_and_dine.install.before_install"
after_install = "izensphere_stay_and_dine.install.after_install"
after_migrate = ["izensphere_stay_and_dine.install.after_migrate"]

# Uninstallation
# ------------

# before_uninstall = "izensphere_stay_and_dine.uninstall.before_uninstall"
# after_uninstall = "izensphere_stay_and_dine.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "izensphere_stay_and_dine.utils.before_app_install"
# after_app_install = "izensphere_stay_and_dine.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "izensphere_stay_and_dine.utils.before_app_uninstall"
# after_app_uninstall = "izensphere_stay_and_dine.utils.after_app_uninstall"

# Build
# ------------------
# To hook into the build process

# after_build = "izensphere_stay_and_dine.build.after_build"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "izensphere_stay_and_dine.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# Guest has no property link, so Property User Permissions can't limit it;
# these apply Kamra's stay-history rule to Frappe's own REST, Desk and
# private file downloads too (see izensphere_stay_and_dine.authz.guest_query_conditions).
# Every Kamra DocType linking a Property fails closed under the opt-in
# kamra_strict_property_scope site setting; with it off these add nothing.
_PROPERTY_SCOPED = (
	"Agent Action Log", "AI Assistant Settings", "Allowance Request",
	"Cancelled Invoice", "Cash Transfer", "Cashier", "Cashier Session", "Cashier Terminal",
	"Cashier Transaction", "Channel Manager Connection",
	"Channel Provider Connection", "City Ledger Account", "City Ledger Entry",
	"Cancellation Policy",
	"Copilot Conversation", "Credit Note", "Discount Voucher", "Exchange Rate",
	"Exchange Transaction", "Experience", "External POS Charge", "Folio", "Folio Ledger Entry",
	"Folio Reprint", "Group Booking", "Housekeeping Task", "Hurdle Rate",
	"Ingredient", "Ingredient Ledger Entry", "Ingredient Stock", "Kamra Custom Report", "Kitchen Printer",
	"Laundry Order", "Laundry Rate", "Lost And Found Item", "MCP OAuth Grant",
	"Meal Plan", "Menu Item", "Night Audit Log", "Night Audit Run", "Outbound Webhook",
	"Outbound Webhook Delivery", "Payment Gateway Settings",
	"Petty Cash Voucher", "POS Order", "POS Outlet", "POS Table Reservation",
	"Print Job",
	"Proforma Folio", "Property Setting", "Rate Guardrail", "Rate Plan",
	"Reservation",
	"Long Stay Discount", "Revenue Budget", "Room", "Room Block", "Room Type", "Season",
	"Security Deposit", "Sellable Unit", "Service Ticket", "Shift Handover", "SOP Template", "Ticket Event",
	"Transaction Code", "Turnover Profile", "Vendor", "Vendor Bill",
	"WhatsApp Message", "ZATCA Invoice", "ZATCA Settings",
)

permission_query_conditions = {
	"Guest": "izensphere_stay_and_dine.authz.guest_query_conditions",
	"Itinerary": "izensphere_stay_and_dine.authz.itinerary_query_conditions",
	**{dt: "izensphere_stay_and_dine.authz.property_query_conditions" for dt in _PROPERTY_SCOPED},
}

has_permission = {
	"Guest": "izensphere_stay_and_dine.authz.guest_has_permission",
	"Itinerary": "izensphere_stay_and_dine.authz.itinerary_has_permission",
	**{dt: "izensphere_stay_and_dine.authz.property_has_permission" for dt in _PROPERTY_SCOPED},
}

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
	doctype: {
		"on_update": "izensphere_stay_and_dine.realtime.notify",
		"after_insert": "izensphere_stay_and_dine.realtime.notify",
		"on_trash": "izensphere_stay_and_dine.realtime.notify",
	}
	for doctype in ("Reservation", "Folio", "Room", "Housekeeping Task",
	                "Group Booking", "POS Order",
	                "Service Ticket", "Agent Action Log")
}

# A reservation booked/modified/cancelled moves availability, so fan the new
# numbers out to the channel manager (Pipeline 1). Runs alongside the realtime
# notify; best-effort and after-commit so it never affects the booking itself.
# The same changes are offered to integrators as outbound webhooks
# (reservation.*, guest.checked_in/out): queued in the transaction, sent
# after commit (izensphere_stay_and_dine.webhooks).
doc_events["Reservation"] = {
	"after_insert": ["izensphere_stay_and_dine.realtime.notify",
	                 "izensphere_stay_and_dine.channel_manager.on_reservation_change",
	                 "izensphere_stay_and_dine.webhooks.on_reservation_insert"],
	"on_update": ["izensphere_stay_and_dine.realtime.notify",
	              "izensphere_stay_and_dine.channel_manager.on_reservation_change",
	              "izensphere_stay_and_dine.webhooks.on_reservation_update"],
	"on_trash": "izensphere_stay_and_dine.realtime.notify",
}

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"izensphere_stay_and_dine.tasks.all"
# 	],
# 	"daily": [
# 		"izensphere_stay_and_dine.tasks.daily"
# 	],
# 	"hourly": [
# 		"izensphere_stay_and_dine.tasks.hourly"
# 	],
# 	"weekly": [
# 		"izensphere_stay_and_dine.tasks.weekly"
# 	],
# 	"monthly": [
# 		"izensphere_stay_and_dine.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "izensphere_stay_and_dine.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "izensphere_stay_and_dine.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# Frappe's setup wizard writes settings and a System Manager user; on a Kamra
# site only a System Manager may call it (see izensphere_stay_and_dine.setup_guard).
override_whitelisted_methods = {
	"frappe.desk.page.setup_wizard.setup_wizard.setup_complete":
		"izensphere_stay_and_dine.setup_guard.setup_complete",
	"frappe.desk.page.setup_wizard.setup_wizard.initialize_system_settings_and_user":
		"izensphere_stay_and_dine.setup_guard.initialize_system_settings_and_user",
}
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "izensphere_stay_and_dine.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Door lock connectors (izensphere_stay_and_dine.door_lock). A vendor app adds its own:
# kamra_door_lock_adapters = {"acme": "acme_izensphere_stay_and_dine.locks.AcmeAdapter"}
kamra_door_lock_adapters = {"manual": "izensphere_stay_and_dine.door_lock.ManualAdapter"}

# Remote MCP + OAuth live at /mcp and /mcp/oauth/* (not the SPA).
page_renderer = ["izensphere_stay_and_dine.mcp_http.MCPPageRenderer"]

# Request Events
# ----------------
# Preserve AioSell's Basic-auth header for the channel webhook before Frappe's
# own api-key auth rejects it (see izensphere_stay_and_dine.channels.aiosell.preserve_webhook_auth).
before_request = [
	"izensphere_stay_and_dine.channels.aiosell.preserve_webhook_auth",
	# the public demo shows the maintenance page while it rebuilds
	"izensphere_stay_and_dine.demo_guard.block_while_rebuilding",
]
after_request = ["izensphere_stay_and_dine.mcp_http.after_request"]

# Job Events
# ----------
# before_job = ["izensphere_stay_and_dine.utils.before_job"]
# after_job = ["izensphere_stay_and_dine.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

auth_hooks = ["izensphere_stay_and_dine.mcp_http.authenticate"]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

