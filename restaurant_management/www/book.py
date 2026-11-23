# Copyright (c) 2026, Nahusha and contributors
# For license information, please see license.txt

import datetime
import frappe
from restaurant_management.restaurant_management.services.restaurant_store import RestaurantStore
from restaurant_management.restaurant_management.services.reservation_service import ReservationService

no_cache = 1


def get_context(context):
	context.no_cache = 1
	context.show_sidebar = False
	context.full_width = True
	context.title = "Book a table | Izen Bistro"

	rest_info = RestaurantStore.get_restaurant_info()
	rules = ReservationService.get_operating_rules()
	today_str = frappe.utils.nowdate()
	today_date = datetime.date.fromisoformat(today_str)
	tomorrow_str = (today_date + datetime.timedelta(days=1)).isoformat()

	# Generate 8 calendar dates (today + 7 advance days, inclusive)
	date_list = []
	for i in range(rules["advance_days"] + 1):
		d = today_date + datetime.timedelta(days=i)
		d_str = d.isoformat()
		if i == 0:
			label = "Today"
			sub = d.strftime("%d %b")
		elif i == 1:
			label = "Tomorrow"
			sub = d.strftime("%d %b")
		else:
			label = d.strftime("%a")
			sub = d.strftime("%d %b")

		date_list.append({
			"date": d_str,
			"day_label": label,
			"sub_label": sub,
			"full_label": d.strftime("%A, %d %B %Y"),
			"is_today": (i == 0),
			"is_tomorrow": (i == 1)
		})

	context.restaurant_info = rest_info
	context.rules = rules
	context.date_list = date_list
	context.today = today_str
	context.tomorrow = tomorrow_str
	context.max_capacity = rules["max_capacity"]
	context.dish_image = "/assets/restaurant_management/images/dishes/biryani_bowl.jpg"
	csrf = ""
	try:
		csrf = frappe.session.csrf_token
	except Exception:
		pass
	context.csrf_token = csrf

	# Support direct booking management link: /book?ref=BK-...&token=...
	booking_ref = frappe.form_dict.get("ref") or frappe.form_dict.get("booking_ref")
	cancel_token = frappe.form_dict.get("token") or frappe.form_dict.get("cancel_token")
	manage_booking = None
	if booking_ref and cancel_token:
		try:
			manage_booking = ReservationService.get_booking_by_token(booking_ref, cancel_token)
		except Exception as e:
			context.manage_error = str(e)

	context.manage_booking = manage_booking
	context.manage_booking_json = frappe.as_json(manage_booking) if manage_booking else "null"
	context.booking_ref = booking_ref
	context.cancel_token = cancel_token

	return context
