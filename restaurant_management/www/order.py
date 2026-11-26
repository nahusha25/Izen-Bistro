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

	table_param = frappe.form_dict.get("table")
	room_param = frappe.form_dict.get("room")
	mode_param = frappe.form_dict.get("mode")
	code_param = frappe.form_dict.get("code") or frappe.form_dict.get("token") or ""
	clean_code = str(code_param or "").strip()

	is_room_service = False
	room_entry_mode = False
	room_number = None

	if room_param:
		is_room_service = True
		room_number = str(room_param).replace("Room", "").replace("room", "").strip()
		table_no = f"Room {room_number}"
	elif table_param and (str(table_param).lower().startswith("room") or str(table_param).isdigit()):
		is_room_service = True
		room_number = str(table_param).replace("Room", "").replace("room", "").strip()
		table_no = f"Room {room_number}"
	elif mode_param == "room":
		is_room_service = True
		room_entry_mode = True
		table_no = ""
	else:
		table_no = table_param or "T-03"

	data = RestaurantStore.get_data()
	tables = data.get("tables", [])

	guest_name = ""
	checked_out = False

	if room_entry_mode:
		table_area = "Room Service"
		table_capacity = 2
		table_status = "Vacant"
		is_seated = False
	elif is_room_service:
		prop_param = frappe.form_dict.get("property")
		res = RestaurantStore.get_active_room_reservation(room_number, property=prop_param, token=clean_code)
		table_area = "Room Service"
		table_capacity = 2
		is_staff = (getattr(frappe.session, "user", None) != "Guest")
		expected_token = str((res or {}).get("precheckin_token") or "").strip()
		token_matches = bool(res and clean_code and expected_token and (clean_code == expected_token or clean_code == expected_token[:4]))
		if res and (is_staff or token_matches or not clean_code):
			table_status = "Occupied"
			is_seated = True
			guest_name = res.get("guest_name", "") if (is_staff or token_matches) else ""
			if is_staff or token_matches:
				code_param = expected_token
		else:
			table_status = "Vacant"
			is_seated = False
			checked_out = True
			guest_name = ""
			code_param = ""
	else:
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

	if room_entry_mode:
		context.title = "In-Room Dining | Izen Bistro"
	elif is_room_service:
		context.title = f"In-Room Dining • Room {room_number} | Izen Bistro"
	else:
		context.title = f"Dine-in Menu • Table {table_no} | Izen Bistro"

	context.table_no = table_no
	context.table_area = table_area
	context.table_capacity = table_capacity
	context.table_status = table_status
	context.is_seated = is_seated
	context.is_room_service = is_room_service
	context.room_entry_mode = room_entry_mode
	context.room_number = room_number
	context.guest_name = guest_name
	context.checked_out = checked_out
	context.initial_code = code_param
	context.categories = ordered_cats
	context.menu_items = menu_items
	context.menu_items_json = json.dumps(menu_items)
	context.restaurant_info = rest_info
