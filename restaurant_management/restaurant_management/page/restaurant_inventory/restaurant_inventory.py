# Copyright (c) 2026, Nahusha and contributors
# For license information, please see license.txt

import json
import frappe
from restaurant_management.restaurant_management.services.restaurant_store import RestaurantStore


@frappe.whitelist()
def get_inventory_dashboard_data(category=None, location=None, status=None, search=None):
	"""
	Returns complete inventory data, KPIs, suppliers, batches, and movements
	from the single source of truth RestaurantStore.
	"""
	return RestaurantStore.get_inventory_dashboard_data(
		category=category, location=location, status=status, search=search
	)


@frappe.whitelist()
def perform_stock_in(item_name, qty, location=None, reason="", reference=""):
	"""
	Increases stock for an item with full movement logging.
	"""
	return RestaurantStore.perform_stock_in(
		item_name=item_name, qty=qty, location=location, reason=reason, reference=reference
	)


@frappe.whitelist()
def perform_stock_out(item_name, qty, location=None, reason="", reference=""):
	"""
	Decreases stock with strict non-negative validation.
	"""
	return RestaurantStore.perform_stock_out(
		item_name=item_name, qty=qty, location=location, reason=reason, reference=reference
	)


@frappe.whitelist()
def perform_stock_adjustment(item_name, new_qty, reason="", reference=""):
	"""
	Sets physical stock count with delta movement logging.
	"""
	return RestaurantStore.perform_stock_adjustment(
		item_name=item_name, new_qty=new_qty, reason=reason, reference=reference
	)


@frappe.whitelist()
def perform_stock_transfer(item_name, qty, from_location, to_location, reason=""):
	"""
	Transfers quantity between logical storage locations.
	"""
	return RestaurantStore.perform_stock_transfer(
		item_name=item_name, qty=qty, from_location=from_location, to_location=to_location, reason=reason
	)


@frappe.whitelist()
def record_wastage(item_name, qty, reason="Spoilage", date=None, batch_no="", notes=""):
	"""
	Records stock wastage, decrements inventory, and logs cost impact.
	"""
	return RestaurantStore.record_wastage(
		item_name=item_name, qty=qty, reason=reason, date=date, batch_no=batch_no, notes=notes
	)


@frappe.whitelist()
def create_supplier(name, contact_person="", phone="", email="", address="", categories=None, supplied_items=None):
	"""
	Adds a new supplier with duplicate name validation.
	"""
	if isinstance(categories, str):
		try:
			categories = json.loads(categories)
		except Exception:
			categories = [c.strip() for c in categories.split(",") if c.strip()]
	if isinstance(supplied_items, str):
		try:
			supplied_items = json.loads(supplied_items)
		except Exception:
			supplied_items = [s.strip() for s in supplied_items.split(",") if s.strip()]
	return RestaurantStore.create_supplier(
		name=name,
		contact_person=contact_person,
		phone=phone,
		email=email,
		address=address,
		categories=categories,
		supplied_items=supplied_items,
	)


@frappe.whitelist()
def create_purchase_order(supplier_id, items, invoice_ref="", date=None, notes="", auto_receive=False):
	"""
	Creates a new Purchase Order with optional immediate goods receipt.
	"""
	if isinstance(items, str):
		items = json.loads(items)
	if isinstance(auto_receive, str):
		auto_receive = auto_receive.lower() in ("true", "1", "yes")
	return RestaurantStore.create_purchase_order(
		supplier_id=supplier_id,
		items=items,
		invoice_ref=invoice_ref,
		date=date,
		notes=notes,
		auto_receive=auto_receive,
	)


@frappe.whitelist()
def confirm_goods_receipt(po_number):
	"""
	Confirms receipt of goods for a PO, increments stock once, and prevents duplicate receipts.
	"""
	return RestaurantStore.confirm_goods_receipt(po_number=po_number)


@frappe.whitelist()
def add_batch_record(item_name, batch_no, mfg_date, expiry_date, qty, location=None):
	"""
	Creates/updates a batch record for expiry tracking.
	"""
	return RestaurantStore.add_batch_record(
		item_name=item_name,
		batch_no=batch_no,
		mfg_date=mfg_date,
		expiry_date=expiry_date,
		qty=qty,
		location=location,
	)


@frappe.whitelist()
def get_inventory_reports(report_type="stock_balance", from_date=None, to_date=None, category=None, location=None):
	"""
	Generates inventory reports (stock balance, low stock, movements, purchases, wastage, expiry, usage).
	"""
	return RestaurantStore.get_inventory_reports(
		report_type=report_type, from_date=from_date, to_date=to_date, category=category, location=location
	)

