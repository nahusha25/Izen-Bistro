# Copyright (c) 2026, Nahusha and contributors
# For license information, please see license.txt

import json
import frappe
from restaurant_management.restaurant_management.services.restaurant_store import RestaurantStore

no_cache = 1


def get_context(context):
	context.no_cache = 1
	context.show_sidebar = False
	context.full_width = True

	table_no = frappe.form_dict.get("table") or "T-03"
	code_param = frappe.form_dict.get("code") or ""

	data = RestaurantStore.get_data()
	tables = data.get("tables", [])
	target_table = next((t for t in tables if t.get("table_no") == table_no), None)

	if not target_table:
		# Fallback to T-03 if not found
		target_table = next((t for t in tables if t.get("table_no") == "T-03"), None)
		if target_table:
			table_no = "T-03"

	table_status = target_table.get("status", "Available") if target_table else "Available"
	table_area = target_table.get("area", "Main Dining Hall") if target_table else "Main Dining Hall"
	table_capacity = target_table.get("capacity", 4) if target_table else 4
	is_seated = (table_status == "Occupied")

	# Prepare menu items
	menu_items = []
	for it in data.get("menu_items", []):
		menu_items.append({
			"item_id": it.get("item_id"),
			"name": it.get("name"),
			"category": it.get("category"),
			"price": it.get("price"),
			"is_veg": it.get("is_veg", True),
			"image": it.get("image", "/assets/restaurant_management/images/dishes/placeholder.jpg"),
			"description": it.get("description", ""),
			"available": it.get("available", True),
		})

	category_order = ["Starters", "Main Course", "Breads", "Rice & Biryani", "Desserts", "Beverages"]
	raw_cats = set(i.get("category") for i in menu_items if i.get("category"))
	ordered_cats = [c for c in category_order if c in raw_cats] + [c for c in sorted(raw_cats) if c not in category_order]

	rest_info = RestaurantStore.get_restaurant_info()

	context.title = f"Dine-in Menu • Table {table_no} | Izen Bistro"
	context.table_no = table_no
	context.table_area = table_area
	context.table_capacity = table_capacity
	context.table_status = table_status
	context.is_seated = is_seated
	context.initial_code = code_param
	context.categories = ordered_cats
	context.menu_items = menu_items
	context.menu_items_json = json.dumps(menu_items)
	context.restaurant_info = rest_info
