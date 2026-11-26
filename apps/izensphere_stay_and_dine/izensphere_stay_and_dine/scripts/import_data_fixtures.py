import json
import os
import frappe

def import_all():
	"""Import data fixtures into the current site."""
	fixtures_dir = "/apps/frappe-bench/apps/izensphere_stay_and_dine/data/fixtures"
	if not os.path.exists(fixtures_dir):
		# Fallback to relative path
		fixtures_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "fixtures"))

	doctypes_order = [
		("Property", "property.json"),
		("Property Setting", "property_setting.json"),
		("Room Type", "room_type.json"),
		("Room Type Media", "room_type_media.json"),
		("Room", "room.json"),
		("Rate Plan", "rate_plan.json"),
		("POS Outlet", "pos_outlet.json"),
		("Ingredient", "ingredient.json"),
		("Menu Item", "menu_item.json"),
		("Lost And Found Item", "lost_and_found_item.json"),
		("Vendor", "vendor.json"),
		("Transaction Code", "transaction_code.json"),
		("Reason Code", "reason_code.json"),
	]

	for dt, filename in doctypes_order:
		path = os.path.join(fixtures_dir, filename)
		if not os.path.exists(path):
			continue
		with open(path, "r", encoding="utf-8") as f:
			records = json.load(f)
		imported = 0
		for rec in records:
			name = rec.get("name")
			if not name:
				continue
			target_name = name
			if dt == "Property Setting" and rec.get("property") and rec.get("setting_key"):
				target_name = f"{rec.get('property')}::{rec.get('setting_key')}"
				rec["name"] = target_name
			if frappe.db.exists(dt, target_name):
				doc = frappe.get_doc(dt, target_name)
				update_data = {k: v for k, v in rec.items() if k not in ("creation", "modified", "modified_by", "owner")}
				doc.update(update_data)
				doc.save(ignore_permissions=True, ignore_version=True)
			else:
				try:
					doc = frappe.get_doc(rec)
					doc.insert(ignore_permissions=True, ignore_links=True, set_name=target_name)
				except frappe.DuplicateEntryError:
					doc = frappe.get_doc(dt, target_name)
					update_data = {k: v for k, v in rec.items() if k not in ("creation", "modified", "modified_by", "owner")}
					doc.update(update_data)
					doc.save(ignore_permissions=True, ignore_version=True)
			imported += 1
		frappe.db.commit()
		print(f"Imported/updated {imported} records for {dt}")

