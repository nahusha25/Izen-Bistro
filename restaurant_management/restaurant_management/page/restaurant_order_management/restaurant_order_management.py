# Copyright (c) 2026, Nahusha and contributors
# For license information, please see license.txt

import json
import frappe
from frappe import _
from restaurant_management.restaurant_management.services.restaurant_store import RestaurantStore


@frappe.whitelist()
def get_order_data(status=None, area=None, search=None):
	"""
	Returns orders, KPI summaries, status breakdown counts, available tables,
	and menu items from the centralized shared RestaurantStore.
	"""
	return RestaurantStore.get_order_management_data(status=status, area=area, search=search)


@frappe.whitelist()
def create_order(table_no, customer="", items=None, notes="", customer_mobile="", customer_id=""):
	"""
	Creates a new order, validates table availability, validates dish availability
	and recipe stock, deducts inventory once, associates order with table,
	and links with the customer registry.
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
def lookup_customer(mobile=None, customer_id=None):
	"""
	Instant customer lookup by mobile or ID.
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
def process_payment(order_id, payment_method="Cash", discount=0):
	"""
	Order Management does not process payments or independently mark orders as paid.
	Billing & Payments exclusively handles bill generation and payment processing.
	"""
	frappe.throw(_("Payment processing and Paid status must be managed exclusively through Billing & Payments."))


@frappe.whitelist()
def update_order_status(order_id, status, reason=""):
	"""
	Kitchen statuses (Preparing, Ready, Served) must be controlled exclusively through KDS.
	Payment statuses (Paid) must be controlled exclusively through Billing & Payments.
	Order Management only displays synchronized status received from KDS.
	"""
	if status in ["Preparing", "Ready", "Served"]:
		frappe.throw(
			_("Kitchen statuses ({0}) must be managed exclusively through the Kitchen Display System (KDS).").format(status)
		)
	if status == "Paid":
		frappe.throw(_("Payment processing and Paid status must be managed exclusively through Billing & Payments."))

	return RestaurantStore.update_order_status(order_id=order_id, new_status=status, reason=reason)


@frappe.whitelist()
def get_order_details(order_id):
	"""
	Returns full line-item details, pricing, time elapsed, and payment status for an order.
	"""
	return RestaurantStore.get_order_details(order_id)


@frappe.whitelist()
def reset_demo_data():
	"""
	Resets the demo store to baseline.
	"""
	RestaurantStore.reset_to_default()
	return RestaurantStore.get_order_management_data()

