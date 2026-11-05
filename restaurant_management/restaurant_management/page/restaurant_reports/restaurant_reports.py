# Copyright (c) 2026, Nahusha and contributors
# For license information, please see license.txt

import frappe
from restaurant_management.restaurant_management.services.restaurant_store import RestaurantStore


@frappe.whitelist()
def get_reports_data(period="today", from_date=None, to_date=None):
	"""
	Returns comprehensive analytical and operational reports for Izen Bistro.
	Single source of truth: reads actual orders, bills, payments, menu items,
	customers, and tables directly from RestaurantStore.
	"""
	return RestaurantStore.get_reports_analytics(period=period, from_date=from_date, to_date=to_date)
