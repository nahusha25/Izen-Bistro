# Copyright (c) 2026, Nahusha and contributors
# For license information, please see license.txt

import frappe
from restaurant_management.restaurant_management.services.restaurant_store import RestaurantStore


@frappe.whitelist()
def get_kds_data(area=None, search=None):
	"""
	Returns active kitchen tickets grouped into 3 columns (Confirmed, Preparing, Ready),
	live kitchen KPIs (New Orders, Preparing, Ready, Served Today), and filter options.
	"""
	return RestaurantStore.get_kds_data(area=area, search=search)


@frappe.whitelist()
def update_order_status(order_id, status):
	"""
	Updates kitchen order lifecycle status:
	- Confirmed -> Preparing (Start Preparing)
	- Preparing -> Ready (Mark Ready)
	- Ready -> Served (Mark Served)
	Propagates instantly to Order Management, Floor & Tables, and Dashboard.
	"""
	return RestaurantStore.update_kitchen_status(order_id_or_batch_id=order_id, new_status=status)


@frappe.whitelist()
def reset_demo_data():
	"""
	Resets demo data to baseline.
	"""
	RestaurantStore.reset_to_default()
	return RestaurantStore.get_kds_data()

