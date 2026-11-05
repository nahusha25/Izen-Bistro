# Copyright (c) 2026, Nahusha and contributors
# For license information, please see license.txt

import frappe
from restaurant_management.restaurant_management.services.restaurant_store import RestaurantStore


@frappe.whitelist()
def get_dashboard_data():
	"""
	Returns analytical KPI metrics, weekly revenue trend, popular dishes,
	recent orders, kitchen queue, and floor table occupancy for the Restaurant Dashboard.

	All metrics are computed in real time from the centralized, persistent
	shared RestaurantStore, ensuring full cross-module consistency with
	Floor & Table Management, Kitchen Orders, and Billing.
	"""
	return RestaurantStore.get_dashboard_data()


@frappe.whitelist()
def get_customers(search=None):
	"""
	Returns customer registry for the Dashboard Customer Management dialog.
	"""
	return RestaurantStore.get_customers_list(search=search)
