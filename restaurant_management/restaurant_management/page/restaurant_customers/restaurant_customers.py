# Copyright (c) 2026, Nahusha and contributors
# For license information, please see license.txt

import frappe
from restaurant_management.restaurant_management.services.restaurant_store import RestaurantStore


@frappe.whitelist()
def get_customers_data(search=None):
	"""
	Returns centralized customer registry records along with high-level summary KPIs.
	"""
	customers = RestaurantStore.get_customers_list(search=search)
	
	total_cust = len(customers)
	total_visits = sum(c.get("total_visits", 1) for c in customers)
	total_spent = sum(c.get("total_spent", 0) for c in customers)
	repeat_count = sum(1 for c in customers if c.get("total_visits", 1) > 1)
	avg_spend = round(total_spent / total_cust, 2) if total_cust else 0
	
	restaurant_info = RestaurantStore.get_restaurant_info()

	return {
		"restaurant_info": restaurant_info,
		"kpis": {
			"total_customers": total_cust,
			"repeat_guests": repeat_count,
			"total_visits": total_visits,
			"total_spent": total_spent,
			"formatted_total_spent": f"₹{total_spent:,}",
			"avg_spend": avg_spend,
			"formatted_avg_spend": f"₹{avg_spend:,}",
		},
		"customers": customers,
	}


@frappe.whitelist()
def register_customer(name, mobile):
	"""
	Registers a new customer into the centralized registry.
	"""
	return RestaurantStore.get_or_create_customer(name=name, mobile=mobile, update_visit=False)


@frappe.whitelist()
def get_customer_history(customer_id_or_mobile):
	"""
	Fetches complete order history and favorite dishes for a customer.
	"""
	return RestaurantStore.get_customer_history(customer_id_or_mobile)

