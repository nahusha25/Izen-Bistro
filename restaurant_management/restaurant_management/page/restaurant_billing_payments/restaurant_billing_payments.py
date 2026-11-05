# Copyright (c) 2026, Nahusha and contributors
# For license information, please see license.txt

import frappe
from restaurant_management.restaurant_management.services.restaurant_store import RestaurantStore


@frappe.whitelist()
def get_billing_data(status=None, area=None, search=None, date_filter=None):
	"""
	Returns KPI metrics (Today's Bills, Paid Bills, Pending Payments, Today's Collected Revenue),
	filtered list of bills, and served orders ready for billing from the centralized RestaurantStore.
	"""
	return RestaurantStore.get_billing_data(status=status, area=area, search=search, date_filter=date_filter)


@frappe.whitelist()
def generate_bill(order_id):
	"""
	Generates a bill for an eligible order (must be in 'Served' status).
	Prevents duplicate bill generation and preserves single source of truth.
	"""
	return RestaurantStore.generate_bill(order_id)


@frappe.whitelist()
def process_bill_payment(bill_no=None, order_id=None, payment_method="Cash", payment_reference="", discount=0):
	"""
	Records payment (Cash, UPI, Card), releases table, marks bill & order Paid,
	and automatically updates dashboard revenue.
	"""
	ident = bill_no or order_id
	return RestaurantStore.process_payment(
		ident,
		payment_method=payment_method,
		payment_reference=payment_reference,
		discount=discount,
	)


@frappe.whitelist()
def get_receipt(bill_no=None, order_id=None):
	"""
	Returns structured receipt data with clean Izen Bistro branded HTML.
	"""
	ident = bill_no or order_id
	return RestaurantStore.get_bill_receipt_data(ident)


@frappe.whitelist()
def download_bill_pdf(bill_no=None, order_id=None):
	"""
	Serves downloadable PDF or standalone HTML tax invoice for Izen Bistro.
	"""
	ident = bill_no or order_id
	return RestaurantStore.download_bill_pdf(ident)

