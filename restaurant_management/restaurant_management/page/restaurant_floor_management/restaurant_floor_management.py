# Copyright (c) 2026, Nahusha and contributors
# For license information, please see license.txt

import json
import frappe
from restaurant_management.restaurant_management.services.restaurant_store import RestaurantStore


@frappe.whitelist()
def get_floor_data():
	"""
	Returns analytical floor summary, dining area counts, and list of 20 tables
	from the centralized, persistent shared RestaurantStore.
	"""
	return RestaurantStore.get_floor_data()


@frappe.whitelist()
def get_menu_catalog():
	"""
	Returns menu items and categories for ordering modals.
	"""
	return RestaurantStore.get_menu_management_data()


@frappe.whitelist()
def create_order(table_no, customer="", items=None, notes="", customer_mobile="", customer_id=""):
	"""
	Creates a new order for a table.
	"""
	if isinstance(items, str):
		items = json.loads(items)

	return RestaurantStore.create_order(
		table_no=table_no,
		customer=customer,
		items=items,
		notes=notes,
		initial_status="Confirmed",
		customer_mobile=customer_mobile,
		customer_id=customer_id,
	)


@frappe.whitelist()
def add_items_to_order(order_id=None, table_no=None, items=None, notes=""):
	"""
	Appends dishes to an existing order (Incremental Ordering).
	"""
	if isinstance(items, str):
		items = json.loads(items)

	return RestaurantStore.add_items_to_order(
		order_id=order_id,
		table_no=table_no,
		items=items,
		notes=notes,
	)


@frappe.whitelist()
def seat_walk_in(table_no, customer="", customer_mobile="", guests=0, notes=""):
	"""
	Seats a walk-in party at the table without affecting any existing reservations.
	"""
	return RestaurantStore.seat_walk_in(
		table_no=table_no,
		customer=customer,
		customer_mobile=customer_mobile,
		guests=guests,
		notes=notes,
	)


@frappe.whitelist()
def checkin_reservation(table_no, booking_ref, notes=""):
	"""
	Checks in an existing reservation by exact booking reference.
	Validates table assignment and eligibility on server.
	"""
	return RestaurantStore.checkin_reservation(
		table_no=table_no,
		booking_ref=booking_ref,
		notes=notes,
	)


@frappe.whitelist()
def release_table(table_no):
	"""
	Releases the current seated visit on a table and marks it Available.
	Never cancels future reservations.
	"""
	return RestaurantStore.release_table(table_no=table_no)


@frappe.whitelist()
def get_table_qr(table_no):
	"""
	Returns printable QR details and SVG for a table stand.
	"""
	return RestaurantStore.get_table_qr(table_no=table_no)


@frappe.whitelist()
def cancel_reservation(booking_ref, reason=""):
	"""
	Explicitly cancels a specific reservation by booking reference.
	"""
	from restaurant_management.restaurant_management.services.reservation_service import ReservationService
	return ReservationService.cancel_reservation(booking_ref=booking_ref)


@frappe.whitelist()
def update_table_status(
	table_no,
	status,
	customer="",
	customer_mobile="",
	guests=0,
	reservation_time="",
	notes="",
	booking_ref="",
):
	"""
	Updates table status (backward-compatible wrapper).
	"""
	return RestaurantStore.update_table_status(
		table_no=table_no,
		status=status,
		customer=customer,
		customer_mobile=customer_mobile,
		guests=guests,
		reservation_time=reservation_time,
		notes=notes,
		booking_ref=booking_ref,
	)


@frappe.whitelist()
def transfer_table(from_table_no, to_table_no, reason=""):
	"""
	Transfers an active seated party / order to an available table.
	"""
	return RestaurantStore.transfer_table(from_table_no=from_table_no, to_table_no=to_table_no, reason=reason)


@frappe.whitelist()
def lookup_customer(mobile=None, customer_id=None):
	"""
	Performs instant customer lookup by 10-digit mobile number or customer ID.
	"""
	return RestaurantStore.lookup_customer(mobile=mobile, customer_id=customer_id)


@frappe.whitelist()
def get_customer_history(customer_id_or_mobile):
	"""
	Returns customer profile, visit count, spend stats, and past orders.
	"""
	return RestaurantStore.get_customer_history(customer_id_or_mobile)


@frappe.whitelist()
def get_receipt_data(order_id):
	"""
	Returns customer-facing bill and receipt data.
	"""
	return RestaurantStore.get_bill_receipt_data(order_id)


@frappe.whitelist()
def download_bill_pdf(order_id):
	"""
	Downloads customer-facing bill and receipt PDF.
	"""
	return RestaurantStore.download_bill_pdf(order_id)


@frappe.whitelist()
def mark_waiter_handled(table_no):
	"""
	Marks a table's waiter call as handled.
	"""
	return RestaurantStore.mark_waiter_handled(table_no=table_no)


@frappe.whitelist()
def mark_bill_handled(table_no):
	"""
	Marks a table's bill request as handled.
	"""
	return RestaurantStore.mark_bill_handled(table_no=table_no)


@frappe.whitelist()
def reset_floor_data():
	"""
	Resets floor tables back to standard initial demo state in the shared store.
	"""
	RestaurantStore.reset_to_default()
	return RestaurantStore.get_floor_data()
