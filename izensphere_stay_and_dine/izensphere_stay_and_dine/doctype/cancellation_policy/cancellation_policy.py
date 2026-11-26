# Copyright (c) 2026, HeyKoala and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
import re


class CancellationPolicy(Document):
	def validate(self):
		if not self.property:
			frappe.throw(_("Property is required for Cancellation Policy."))

		# Normalize code
		if self.policy_code:
			self.policy_code = re.sub(r"[^A-Za-z0-9_-]", "-", self.policy_code.strip()).upper()
		else:
			self.policy_code = re.sub(r"[^A-Za-z0-9_-]", "-", self.policy_name.strip()).upper()

		# Enforce property-level permissions: a hotel admin must not modify another hotel's policy
		from izensphere_stay_and_dine.crs import assert_property_access
		assert_property_access(self.property)

		# Validate fee requirements
		if self.policy_type == "Fixed Fee":
			if float(self.fixed_fee or 0) <= 0:
				frappe.throw(_("Fixed cancellation fee must be greater than 0."))
		elif self.policy_type == "Percentage":
			pct = float(self.percentage_fee or 0)
			if pct <= 0 or pct > 100:
				frappe.throw(_("Percentage fee must be between 0.1% and 100%."))
		elif self.policy_type == "Non-Refundable":
			self.free_cancel_deadline_hours = 0

		# Manage default uniqueness per property
		if self.is_default:
			frappe.db.sql(
				"""UPDATE `tabCancellation Policy`
				   SET is_default = 0
				   WHERE property = %s AND name != %s""",
				(self.property, self.name or ""),
			)

		# Generate guest-facing description if omitted
		if not (self.description or "").strip():
			self.description = self.generate_description()

	def generate_description(self) -> str:
		hours = int(self.free_cancel_deadline_hours or 0)
		time_str = f"{hours} hours" if hours % 24 != 0 or hours == 0 else f"{hours // 24} day(s)"

		if self.policy_type == "Non-Refundable":
			return "This booking is non-refundable."
		elif self.policy_type == "Free Cancellation":
			if hours > 0:
				return f"Free cancellation until {time_str} before check-in."
			return "Free cancellation."
		elif self.policy_type == "Fixed Fee":
			fee_val = float(self.fixed_fee or 0)
			fee_str = f"₹{fee_val:,.0f}" if fee_val.is_integer() else f"₹{fee_val:,.2f}"
			if hours > 0:
				return f"Free cancellation until {time_str} before check-in. {fee_str} cancellation fee applies."
			return f"{fee_str} cancellation fee applies."
		elif self.policy_type == "Percentage":
			pct_str = f"{float(self.percentage_fee or 0):g}%"
			if hours > 0:
				return f"Free cancellation until {time_str} before check-in. {pct_str} cancellation fee applies."
			return f"{pct_str} cancellation fee applies."
		elif self.policy_type == "One Night Tariff":
			if hours > 0:
				return f"Free cancellation until {time_str} before check-in. One night's room tariff will be charged for cancellation after the free cancellation deadline."
			return "One night's room tariff will be charged for cancellation."
		return "Hotel cancellation policy applies."

	def get_summary(self) -> str:
		return self.description or self.generate_description()

