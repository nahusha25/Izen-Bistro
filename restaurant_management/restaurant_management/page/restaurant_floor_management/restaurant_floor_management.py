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
def update_table_status(
	table_no,
	status,
	customer="",
	customer_mobile="",
	guests=0,
	reservation_time="",
	notes="",
):
	"""
	Updates the state of a specific table (Seat, Reserve, or Release/Vacate)
	in the centralized shared RestaurantStore. Updates are immediately visible
	across the Restaurant Dashboard, Orders, and KDS.
	"""
	return RestaurantStore.update_table_status(
		table_no=table_no,
		status=status,
		customer=customer,
		customer_mobile=customer_mobile,
		guests=guests,
		reservation_time=reservation_time,
		notes=notes,
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
def reset_floor_data():
	"""
	Resets floor tables back to standard initial demo state in the shared store.
	"""
	RestaurantStore.reset_to_default()
	return RestaurantStore.get_floor_data()
