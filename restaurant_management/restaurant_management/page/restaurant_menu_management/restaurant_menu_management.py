# Copyright (c) 2026, Nahusha and contributors
# For license information, please see license.txt

import base64
import json
import os
import re
import frappe
from restaurant_management.restaurant_management.services.restaurant_store import RestaurantStore


@frappe.whitelist()
def get_menu_data(category=None, search=None, availability=None):
	"""
	Returns menu items, category tallies, KPI metrics, and available ingredients
	from the centralized, persistent RestaurantStore.
	"""
	return RestaurantStore.get_menu_management_data(
		category=category,
		search=search,
		availability=availability,
	)


@frappe.whitelist()
def toggle_availability(item_id, available=None):
	"""
	Toggles or sets the availability state of a menu item.
	Updates the persistent RestaurantStore and propagates immediately.
	"""
	if available is not None:
		if isinstance(available, str):
			available = available.lower() in ["1", "true", "yes"]
		else:
			available = bool(available)

	return RestaurantStore.toggle_menu_item_availability(
		item_id=item_id,
		available=available,
	)


@frappe.whitelist()
def save_item(
	item_id=None,
	name="",
	category="Main Course – Veg",
	price=0,
	is_veg=1,
	description="",
	recipe=None,
	available=1,
	image=None,
):
	"""
	Creates or updates a menu item in the persistent RestaurantStore.
	Links recipe ingredients with existing demo inventory.
	"""
	if isinstance(is_veg, str):
		is_veg = is_veg.lower() in ["1", "true", "yes"]
	else:
		is_veg = bool(is_veg)

	if isinstance(available, str):
		available = available.lower() in ["1", "true", "yes"]
	else:
		available = bool(available)

	if isinstance(recipe, str):
		try:
			recipe = json.loads(recipe)
		except Exception:
			recipe = {}

	return RestaurantStore.save_menu_item(
		item_id=item_id if item_id else None,
		name=name,
		category=category,
		price=price,
		is_veg=is_veg,
		description=description,
		recipe=recipe,
		available=available,
		image=image,
	)


@frappe.whitelist()
def upload_dish_image(filename, filedata):
	"""
	Saves an uploaded dish image into public files and returns the public asset URL.
	filedata can be a base64 string or data URL.
	"""
	if not filedata:
		frappe.throw(frappe._("No image data provided"))

	if "," in filedata:
		filedata = filedata.split(",", 1)[1]

	try:
		raw_bytes = base64.b64decode(filedata)
	except Exception as e:
		frappe.throw(frappe._("Invalid image data: {0}").format(str(e)))

	clean_filename = re.sub(r"[^a-zA-Z0-9_\.-]", "_", filename or "dish_image.jpg")
	if not clean_filename.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
		clean_filename += ".jpg"

	# Prefix with timestamp to prevent cache collision
	timestamp = frappe.utils.now_datetime().strftime("%Y%m%d%H%M%S")
	unique_filename = f"{timestamp}_{clean_filename}"

	files_dir = frappe.get_site_path("public", "files")
	os.makedirs(files_dir, exist_ok=True)
	file_path = os.path.join(files_dir, unique_filename)

	with open(file_path, "wb") as f:
		f.write(raw_bytes)

	return f"/files/{unique_filename}"


@frappe.whitelist()
def reset_menu_data():
	"""
	Resets the entire shared RestaurantStore to demo baseline.
	"""
	RestaurantStore.reset_to_default()
	return RestaurantStore.get_menu_management_data()


@frappe.whitelist()
def get_recipe_dashboard_data(category=None, status=None, search=None):
	"""
	Returns complete Recipe Management Dashboard summary, filtered dish list,
	and available inventory items for ingredient mapping.
	"""
	return RestaurantStore.get_recipe_dashboard_data(
		category=category,
		status=status,
		search=search,
	)


@frappe.whitelist()
def get_dish_recipe(item_id):
	"""
	Returns full recipe configuration (portions, ingredients, wastage, approval status)
	for a single dish.
	"""
	return RestaurantStore.get_dish_recipe_definition(item_id)


@frappe.whitelist()
def save_dish_recipe(item_id, recipe_data=None, approve=0):
	"""
	Saves or approves recipe definition for a dish.
	"""
	if isinstance(recipe_data, str):
		try:
			recipe_data = json.loads(recipe_data)
		except Exception:
			recipe_data = {}

	approve_bool = bool(int(approve)) if isinstance(approve, (int, str)) and str(approve).isdigit() else bool(approve)
	return RestaurantStore.save_dish_recipe_definition(
		item_id=item_id,
		recipe_data=recipe_data,
		approve=approve_bool,
	)


@frappe.whitelist()
def approve_dish_recipe(item_id):
	"""
	Approves recipe for a dish, validating ingredients and enabling inventory consumption.
	"""
	return RestaurantStore.approve_dish_recipe(item_id)


