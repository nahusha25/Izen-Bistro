# Copyright (c) 2026, HeyKoala and contributors
# For license information, please see license.txt

import json
from datetime import datetime, timedelta
import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, get_datetime, now_datetime, nowdate, today

from izensphere_stay_and_dine.cancellation import (
	calculate_cancellation,
	calculate_cancellation_deadline,
	execute_cancellation,
	get_cancellation_analytics,
	get_hotel_cancellation_policy,
	get_policy_bookings,
	process_cancellation_refund,
	snapshot_cancellation_policy,
)


class TestHotelCancellationPolicy(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.prop_a = "Test Hotel A - Free"
		cls.prop_b = "Test Hotel B - Fixed500"
		cls.prop_c = "Test Hotel C - OneNight"
		cls.prop_d = "Test Hotel D - NonRef"

		for p_name in (cls.prop_a, cls.prop_b, cls.prop_c, cls.prop_d):
			if not frappe.db.exists("Property", p_name):
				p = frappe.get_doc({
					"doctype": "Property",
					"property_name": p_name,
					"checkin_time": "14:00:00",
					"checkout_time": "11:00:00",
				})
				p.insert(ignore_permissions=True)

		# Clean up any old policies
		frappe.db.delete("Cancellation Policy", {
			"property": ["in", [cls.prop_a, cls.prop_b, cls.prop_c, cls.prop_d]]
		})

		# 1. Hotel A: Free cancellation
		cls.pol_a = frappe.get_doc({
			"doctype": "Cancellation Policy",
			"property": cls.prop_a,
			"policy_name": "Hotel A Free Cancellation",
			"policy_code": "POL-FREE",
			"policy_type": "Free Cancellation",
			"free_cancel_deadline_hours": 24,
			"is_active": 1,
			"is_default": 1,
		}).insert(ignore_permissions=True)

		# 2. Hotel B: Fixed ₹500 cancellation charge
		cls.pol_b = frappe.get_doc({
			"doctype": "Cancellation Policy",
			"property": cls.prop_b,
			"policy_name": "Hotel B Fixed Fee",
			"policy_code": "POL-FIXED500",
			"policy_type": "Fixed Fee",
			"fixed_fee": 500.0,
			"free_cancel_deadline_hours": 24,
			"is_active": 1,
			"is_default": 1,
		}).insert(ignore_permissions=True)

		# 3. Hotel C: One night tariff cancellation charge
		cls.pol_c = frappe.get_doc({
			"doctype": "Cancellation Policy",
			"property": cls.prop_c,
			"policy_name": "Hotel C One Night Tariff",
			"policy_code": "POL-ONENIGHT",
			"policy_type": "One Night Tariff",
			"free_cancel_deadline_hours": 24,
			"no_show_fee_type": "One Night Tariff",
			"is_active": 1,
			"is_default": 1,
		}).insert(ignore_permissions=True)

		# 4. Hotel D: Non-refundable bookings
		cls.pol_d = frappe.get_doc({
			"doctype": "Cancellation Policy",
			"property": cls.prop_d,
			"policy_name": "Hotel D Non-Refundable",
			"policy_code": "POL-NONREF",
			"policy_type": "Non-Refundable",
			"free_cancel_deadline_hours": 0,
			"no_show_fee_type": "Full Stay",
			"is_active": 1,
			"is_default": 1,
		}).insert(ignore_permissions=True)

		cls.rts = {}
		for p_name in (cls.prop_a, cls.prop_b, cls.prop_c, cls.prop_d):
			code = "DLX-" + p_name.replace(" ", "-")[-10:]
			rt = frappe.db.get_value("Room Type", {"property": p_name, "room_type_code": code}, "name")
			if not rt:
				rt_doc = frappe.get_doc({
					"doctype": "Room Type",
					"property": p_name,
					"room_type_code": code,
					"room_type_name": f"Deluxe {p_name}",
					"base_price": 2000.0,
					"adults_capacity": 3,
				}).insert(ignore_permissions=True)
				cls.rts[p_name] = rt_doc.name
			else:
				cls.rts[p_name] = rt

		# Create a test guest
		if not frappe.db.exists("Guest", {"phone": "+919999900001"}):
			cls.guest = frappe.get_doc({
				"doctype": "Guest",
				"first_name": "Cancellation",
				"last_name": "Tester",
				"phone": "+919999900001",
				"email": "cxl.tester@test.com",
			}).insert(ignore_permissions=True).name
		else:
			cls.guest = frappe.db.get_value("Guest", {"phone": "+919999900001"})

	def _create_res(self, prop, check_in_offset=5, nights=3, amount=3000.0, advance_paid=0.0):
		cin = add_days(nowdate(), check_in_offset)
		cout = add_days(cin, nights)
		res = frappe.get_doc({
			"doctype": "Reservation",
			"property": prop,
			"guest": self.guest,
			"room_type": self.rts[prop],
			"status": "Confirmed",
			"check_in_date": cin,
			"check_out_date": cout,
			"nights": nights,
			"amount_before_tax": amount,
			"amount_after_tax": amount,
			"advance_paid": advance_paid,
			"planned_check_in_time": "14:00:00",
		})
		res.insert(ignore_permissions=True)
		return res

	def test_01_hotel_a_free_cancellation(self):
		"""Scenario 1: Hotel A with Free Cancellation.
		Fee must be 0 and full paid amount eligible for refund."""
		res = self._create_res(self.prop_a, check_in_offset=5, amount=4000.0, advance_paid=1500.0)
		self.assertEqual(res.cancellation_policy_type, "Free Cancellation")
		self.assertIn("Free cancellation", res.cancellation_policy_description)

		# Cancel after deadline
		cancel_time = get_datetime(f"{res.check_in_date} 12:00:00")
		calc = calculate_cancellation(res, cancellation_time=cancel_time)
		self.assertEqual(calc["cancellation_fee"], 0.0)
		self.assertEqual(calc["eligible_refund"], 1500.0)

		# Execute cancellation
		out = execute_cancellation(res, reason="Guest request")
		self.assertEqual(out["fee"], 0.0)
		self.assertEqual(out["eligible_refund"], 1500.0)
		self.assertEqual(res.status, "Cancelled")

	def test_02_hotel_b_fixed_500_cancellation_fee(self):
		"""Scenario 2: Hotel B with ₹500 Fixed Cancellation Fee."""
		res = self._create_res(self.prop_b, check_in_offset=5, amount=5000.0, advance_paid=2000.0)
		self.assertEqual(res.cancellation_policy_type, "Fixed Fee")
		self.assertIn("500", res.cancellation_fee_rule)

		# Cancellation after deadline (inside 24h window)
		cancel_time = get_datetime(f"{res.check_in_date} 10:00:00")
		calc = calculate_cancellation(res, cancellation_time=cancel_time)
		self.assertEqual(calc["cancellation_fee"], 500.0)
		self.assertEqual(calc["eligible_refund"], 1500.0)  # 2000 - 500 = 1500

		out = execute_cancellation(res, cancellation_time=cancel_time)
		self.assertEqual(out["fee"], 500.0)
		self.assertEqual(out["eligible_refund"], 1500.0)

	def test_03_hotel_c_one_night_cancellation_charge(self):
		"""Scenario 3: Hotel C with One-Night Cancellation Charge."""
		# 3 nights for ₹6,000 => 1 night = ₹2,000
		res = self._create_res(self.prop_c, check_in_offset=5, nights=3, amount=6000.0, advance_paid=3000.0)
		self.assertEqual(res.cancellation_policy_type, "One Night Tariff")

		# Cancellation after deadline
		cancel_time = get_datetime(f"{res.check_in_date} 13:00:00")
		calc = calculate_cancellation(res, cancellation_time=cancel_time)
		self.assertEqual(calc["cancellation_fee"], 2000.0)  # 1 night tariff
		self.assertEqual(calc["eligible_refund"], 1000.0)  # 3000 paid - 2000 fee = 1000

		out = execute_cancellation(res, cancellation_time=cancel_time)
		self.assertEqual(out["fee"], 2000.0)
		self.assertEqual(out["eligible_refund"], 1000.0)

	def test_04_hotel_d_non_refundable_booking(self):
		"""Scenario 4: Hotel D with Non-Refundable Booking."""
		res = self._create_res(self.prop_d, check_in_offset=5, amount=6000.0, advance_paid=6000.0)
		self.assertEqual(res.cancellation_policy_type, "Non-Refundable")
		self.assertIn("non-refundable", res.cancellation_policy_description.lower())

		# Cancelling anytime should charge 100% and result in ₹0 refund
		now_dt = now_datetime()
		calc = calculate_cancellation(res, cancellation_time=now_dt)
		self.assertEqual(calc["cancellation_fee"], 6000.0)
		self.assertEqual(calc["eligible_refund"], 0.0)
		self.assertFalse(calc["is_before_deadline"])

		out = execute_cancellation(res, cancellation_time=now_dt)
		self.assertEqual(out["fee"], 6000.0)
		self.assertEqual(out["eligible_refund"], 0.0)

	def test_05_cancellation_before_deadline(self):
		"""Scenario 5: Cancellation BEFORE the deadline.
		Hotel B has 24h deadline with ₹500 fee. Cancelling 48h before check-in must incur ₹0 fee."""
		res = self._create_res(self.prop_b, check_in_offset=5, amount=3000.0, advance_paid=1000.0)

		# 48 hours before check-in
		early_cancel_time = get_datetime(f"{res.check_in_date} 14:00:00") - timedelta(hours=48)
		calc = calculate_cancellation(res, cancellation_time=early_cancel_time)
		self.assertTrue(calc["is_before_deadline"])
		self.assertEqual(calc["cancellation_fee"], 0.0)
		self.assertEqual(calc["eligible_refund"], 1000.0)  # Full advance refunded

	def test_06_cancellation_after_deadline(self):
		"""Scenario 6: Cancellation AFTER the deadline.
		Hotel B: Cancelling 12h before check-in (after 24h deadline) must incur ₹500 fee."""
		res = self._create_res(self.prop_b, check_in_offset=5, amount=3000.0, advance_paid=1000.0)

		# 12 hours before check-in (after 24h deadline)
		late_cancel_time = get_datetime(f"{res.check_in_date} 14:00:00") - timedelta(hours=12)
		calc = calculate_cancellation(res, cancellation_time=late_cancel_time)
		self.assertFalse(calc["is_before_deadline"])
		self.assertEqual(calc["cancellation_fee"], 500.0)
		self.assertEqual(calc["eligible_refund"], 500.0)  # 1000 - 500 = 500

	def test_07_partial_payment_refund_calculation(self):
		"""Scenario 7: Partial Payment.
		Crucial requirement: Never calculate refunds using only the total booking value
		when customer has paid only part of the amount."""
		# Total booking = ₹5,000, but customer paid only ₹800 advance.
		# Hotel B: Fee = ₹500.
		res = self._create_res(self.prop_b, check_in_offset=5, amount=5000.0, advance_paid=800.0)
		late_cancel_time = get_datetime(f"{res.check_in_date} 10:00:00")
		calc = calculate_cancellation(res, cancellation_time=late_cancel_time)

		# Correct calculation: Paid (800) - Fee (500) = ₹300 refund
		# Flawed calculation would be: Total (5000) - Fee (500) = ₹4500 (WRONG)
		self.assertEqual(calc["eligible_refund"], 300.0)
		self.assertNotEqual(calc["eligible_refund"], 4500.0)

		# Case B: Customer paid ₹300, Fee is ₹500.
		# Eligible refund must be ₹0.0 (never negative)
		res2 = self._create_res(self.prop_b, check_in_offset=5, amount=5000.0, advance_paid=300.0)
		calc2 = calculate_cancellation(res2, cancellation_time=late_cancel_time)
		self.assertEqual(calc2["eligible_refund"], 0.0)
		self.assertEqual(calc2["effective_penalty"], 300.0)  # Retained amount cannot exceed amount paid

	def test_08_full_payment_refund_calculation(self):
		"""Scenario 8: Full Payment.
		Total booking = ₹4,000, Full paid = ₹4,000.
		Fee = ₹500. Eligible refund = ₹3,500."""
		res = self._create_res(self.prop_b, check_in_offset=5, amount=4000.0, advance_paid=4000.0)
		late_cancel_time = get_datetime(f"{res.check_in_date} 10:00:00")
		calc = calculate_cancellation(res, cancellation_time=late_cancel_time)
		self.assertEqual(calc["cancellation_fee"], 500.0)
		self.assertEqual(calc["eligible_refund"], 3500.0)

		out = execute_cancellation(res, cancellation_time=late_cancel_time)
		self.assertEqual(out["eligible_refund"], 3500.0)

	def test_09_no_show_calculation(self):
		"""Scenario 9: No-Show charges based on policy.
		Hotel C no-show fee type is One Night Tariff."""
		res = self._create_res(self.prop_c, check_in_offset=0, nights=2, amount=4000.0, advance_paid=4000.0)
		calc = calculate_cancellation(res, is_no_show=True)
		self.assertEqual(calc["cancellation_fee"], 2000.0)  # 1 night tariff
		self.assertEqual(calc["eligible_refund"], 2000.0)  # 4000 - 2000 = 2000

	def test_10_hotel_initiated_cancellation_waiver(self):
		"""Scenario 10: Hotel-initiated cancellation with fee waiver."""
		res = self._create_res(self.prop_b, check_in_offset=5, amount=3000.0, advance_paid=1000.0)
		# Late cancellation, but staff waives fee (waive_fee=1)
		late_time = get_datetime(f"{res.check_in_date} 10:00:00")
		calc = calculate_cancellation(res, cancellation_time=late_time, waive_fee=True)
		self.assertEqual(calc["cancellation_fee"], 0.0)
		self.assertTrue(calc["fee_waived"])
		self.assertEqual(calc["eligible_refund"], 1000.0)

		out = execute_cancellation(res, waive_fee=1)
		self.assertEqual(out["fee"], 0.0)
		self.assertTrue(out["waived"])
		self.assertEqual(out["eligible_refund"], 1000.0)

	def test_11_refundable_security_deposit_isolation(self):
		"""Scenario 11: Refundable security deposit is kept separate from cancellation penalties."""
		res = self._create_res(self.prop_b, check_in_offset=5, amount=2000.0, advance_paid=1000.0)
		# Customer paid ₹1,000 room advance, plus ₹1,500 security deposit
		existing_dep = frappe.db.get_value("Security Deposit", {"reservation": res.name}, "name")
		if existing_dep:
			sec_dep = frappe.get_doc("Security Deposit", existing_dep)
			sec_dep.balance = 1500.0
			sec_dep.collected_amount = 1500.0
			sec_dep.status = "Held"
			sec_dep.save(ignore_permissions=True)
		else:
			sec_dep = frappe.get_doc({
				"doctype": "Security Deposit",
				"reservation": res.name,
				"property": res.property,
				"guest": res.guest,
				"required_amount": 1500.0,
				"collected_amount": 1500.0,
				"balance": 1500.0,
				"status": "Held",
			}).insert(ignore_permissions=True)

		late_time = get_datetime(f"{res.check_in_date} 10:00:00")
		calc = calculate_cancellation(res, cancellation_time=late_time)
		# Room fee is ₹500, deduction is from room advance ₹1,000 => room refund ₹500
		self.assertEqual(calc["cancellation_fee"], 500.0)
		self.assertEqual(calc["eligible_refund"], 500.0)

		# The security deposit remains 100% intact and held separately
		dep_balance = frappe.db.get_value("Security Deposit", sec_dep.name, "balance")
		self.assertEqual(float(dep_balance), 1500.0)

	def test_12_modification_of_policy_after_booking_confirmation(self):
		"""Scenario 12: Modification of policy after booking confirmation.
		Existing confirmed bookings must retain their original policy snapshot."""
		# Create booking under Hotel B (Fixed ₹500 fee)
		res = self._create_res(self.prop_b, check_in_offset=5, amount=3000.0, advance_paid=1500.0)
		self.assertEqual(res.cancellation_policy_type, "Fixed Fee")
		self.assertIn("500", res.cancellation_fee_rule)

		# Hotel administrator modifies Hotel B's policy to Fixed ₹1,500 fee
		pol_b_doc = frappe.get_doc("Cancellation Policy", self.pol_b.name)
		pol_b_doc.fixed_fee = 1500.0
		pol_b_doc.description = "New policy: Fixed ₹1,500 cancellation fee"
		pol_b_doc.save(ignore_permissions=True)

		# Verify that the existing booking's snapshot is STILL ₹500
		res_reloaded = frappe.get_doc("Reservation", res.name)
		self.assertIn("500", res_reloaded.cancellation_fee_rule)

		# Cancel the existing booking: must charge ₹500 (not ₹1,500)
		late_time = get_datetime(f"{res.check_in_date} 10:00:00")
		calc = calculate_cancellation(res_reloaded, cancellation_time=late_time)
		self.assertEqual(calc["cancellation_fee"], 500.0)
		self.assertEqual(calc["eligible_refund"], 1000.0)  # 1500 - 500 = 1000

		# Revert policy back for consistency
		pol_b_doc.fixed_fee = 500.0
		pol_b_doc.save(ignore_permissions=True)

	def test_13_multiple_hotels_using_different_policies_and_permissions(self):
		"""Scenario 13: Multiple hotels using different policies and property-level permissions."""
		# Verify each hotel resolves its own policy independently
		p_a = get_hotel_cancellation_policy(self.prop_a)
		p_b = get_hotel_cancellation_policy(self.prop_b)
		p_c = get_hotel_cancellation_policy(self.prop_c)
		p_d = get_hotel_cancellation_policy(self.prop_d)

		self.assertEqual(p_a.get("policy_type"), "Free Cancellation")
		self.assertEqual(p_b.get("policy_type"), "Fixed Fee")
		self.assertEqual(p_c.get("policy_type"), "One Night Tariff")
		self.assertEqual(p_d.get("policy_type"), "Non-Refundable")

		# Verify analytics per hotel are isolated
		analytics_a = get_cancellation_analytics(self.prop_a)
		self.assertEqual(analytics_a["property"], self.prop_a)
		for cxl in analytics_a["cancellations"]:
			self.assertEqual(cxl["cancellation_policy_type"], "Free Cancellation")
