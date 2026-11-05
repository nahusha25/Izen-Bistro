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

