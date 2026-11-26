# Copyright (c) 2026, HeyKoala and contributors
# For license information, please see license.txt

import json
import re
from datetime import datetime, timedelta
import frappe
from frappe import _
from frappe.model.naming import make_autoname
from frappe.utils import (
	add_days,
	cint,
	date_diff,
	flt,
	get_datetime,
	getdate,
	now_datetime,
	nowdate,
	today,
)


def get_hotel_cancellation_policy(property: str, policy_name: str | None = None):
	"""Retrieve the applicable cancellation policy for a given hotel/property.

	Lookup order:
	1. Explicit policy_name if provided and belongs to this property.
	2. Active default policy for this property.
	3. Any active policy for this property.
	4. If none exists, auto-provision a default policy for this hotel from its
	   Property-level settings so legacy properties work seamlessly.
	"""
	if not property:
		return None

	if policy_name:
		doc = frappe.db.get_value(
			"Cancellation Policy",
			{"name": policy_name, "property": property, "is_active": 1},
			["name", "policy_name", "policy_code", "policy_type", "property",
			 "free_cancel_deadline_hours", "fixed_fee", "percentage_fee",
			 "no_show_fee_type", "no_show_fee_amount", "allow_hotel_cancellation_waiver",
			 "description", "is_default", "is_active"],
			as_dict=True,
		)
		if doc:
			return doc

	# Find active default policy for property
	doc = frappe.db.get_value(
		"Cancellation Policy",
		{"property": property, "is_active": 1, "is_default": 1},
		["name", "policy_name", "policy_code", "policy_type", "property",
		 "free_cancel_deadline_hours", "fixed_fee", "percentage_fee",
		 "no_show_fee_type", "no_show_fee_amount", "allow_hotel_cancellation_waiver",
		 "description", "is_default", "is_active"],
		as_dict=True,
	)
	if doc:
		return doc

	# Find any active policy for property
	doc = frappe.db.get_value(
		"Cancellation Policy",
		{"property": property, "is_active": 1},
		["name", "policy_name", "policy_code", "policy_type", "property",
		 "free_cancel_deadline_hours", "fixed_fee", "percentage_fee",
		 "no_show_fee_type", "no_show_fee_amount", "allow_hotel_cancellation_waiver",
		 "description", "is_default", "is_active"],
		order_by="creation desc",
		as_dict=True,
	)
	if doc:
		return doc

	# Auto-provision from legacy property fields to ensure hotel isolation without breaking existing setup
	return _auto_provision_default_policy(property)


def _auto_provision_default_policy(property: str):
	"""Create a default Cancellation Policy for a hotel based on its Property config."""
	prop = frappe.get_doc("Property", property)
	free_days = cint(prop.get("free_cancel_days") or 0)
	fee_type = prop.get("cancellation_fee") or "First Night"
	free_hours = free_days * 24 if free_days > 0 else 24

	if fee_type == "None":
		policy_type = "Free Cancellation"
		code = "DEFAULT-FREE"
		name = f"{property} - Free Cancellation"
	elif fee_type == "First Night":
		policy_type = "One Night Tariff"
		code = "DEFAULT-ONENIGHT"
		name = f"{property} - Standard Policy"
	elif fee_type == "Full Stay":
		if free_days == 0:
			policy_type = "Non-Refundable"
			code = "DEFAULT-NONREF"
			name = f"{property} - Non-Refundable"
			free_hours = 0
		else:
			policy_type = "Percentage"
			code = "DEFAULT-FULLSTAY"
			name = f"{property} - 100% Policy"
	else:
		policy_type = "Free Cancellation"
		code = "DEFAULT-FREE"
		name = f"{property} - Free Cancellation"

	doc = frappe.get_doc({
		"doctype": "Cancellation Policy",
		"property": property,
		"policy_name": name,
		"policy_code": code,
		"policy_type": policy_type,
		"is_active": 1,
		"is_default": 1,
		"free_cancel_deadline_hours": free_hours,
		"fixed_fee": 0,
		"percentage_fee": 100 if policy_type == "Percentage" else 0,
		"no_show_fee_type": "One Night Tariff",
		"no_show_fee_amount": 0,
		"allow_hotel_cancellation_waiver": 1,
	})
	doc.insert(ignore_permissions=True)
	return doc.as_dict()


def calculate_cancellation_deadline(policy, check_in_date, planned_check_in_time=None, property=None) -> datetime | None:
	"""Calculate the exact datetime deadline for free cancellation relative to check-in."""
	policy_type = policy.get("policy_type") if isinstance(policy, dict) else policy.policy_type
	if policy_type == "Non-Refundable":
		return None

	hours = cint(policy.get("free_cancel_deadline_hours") if isinstance(policy, dict) else policy.free_cancel_deadline_hours)

	# Determine check-in datetime
	t_str = planned_check_in_time
	if not t_str and (property or (isinstance(policy, dict) and policy.get("property"))):
		prop_name = property or policy.get("property")
		t_str = frappe.db.get_value("Property", prop_name, "checkin_time")
	t_str = str(t_str or "14:00:00")[:8]
	if len(t_str) == 5:
		t_str += ":00"

	try:
		check_in_dt = get_datetime(f"{check_in_date} {t_str}")
	except Exception:
		check_in_dt = get_datetime(f"{check_in_date} 14:00:00")

	if hours <= 0:
		if policy_type == "Free Cancellation":
			return check_in_dt
		return None

	return check_in_dt - timedelta(hours=hours)


def snapshot_cancellation_policy(reservation):
	"""Snapshot the hotel's cancellation policy on a confirmed reservation.

	Preserves:
	- Cancellation policy link and code
	- Policy type (Free, Fixed Fee, Percentage, One Night Tariff, Non-Refundable)
	- Cancellation deadline timestamp
	- Fee rule description
	- Full policy JSON snapshot

	Changes to hotel cancellation policies must affect future bookings only.
	Existing confirmed bookings retain their snapshot.
	"""
	if reservation.get("cancellation_policy_snapshot"):
		# Never overwrite an existing snapshot on a confirmed booking
		return

	policy = get_hotel_cancellation_policy(
		reservation.property,
		reservation.get("cancellation_policy"),
	)
	if not policy:
		return

	deadline = calculate_cancellation_deadline(
		policy,
		reservation.check_in_date,
		reservation.get("planned_check_in_time"),
		property=reservation.property,
	)

	pol_type = policy.get("policy_type")
	if pol_type == "Free Cancellation":
		fee_rule = "Free Cancellation"
	elif pol_type == "Fixed Fee":
		fee_rule = f"Fixed ₹{flt(policy.get('fixed_fee') or 0):,.0f}"
	elif pol_type == "Percentage":
		fee_rule = f"{flt(policy.get('percentage_fee') or 0):g}% of booking"
	elif pol_type == "One Night Tariff":
		fee_rule = "One Night Tariff"
	elif pol_type == "Non-Refundable":
		fee_rule = "100% Non-Refundable"
	else:
		fee_rule = pol_type

	desc = policy.get("description")
	if not (desc or "").strip():
		# Format description
		hours = cint(policy.get("free_cancel_deadline_hours") or 0)
		time_str = f"{hours} hours" if hours % 24 != 0 or hours == 0 else f"{hours // 24} day(s)"
		if pol_type == "Non-Refundable":
			desc = "This booking is non-refundable."
		elif pol_type == "Free Cancellation":
			desc = f"Free cancellation until {time_str} before check-in." if hours > 0 else "Free cancellation."
		elif pol_type == "Fixed Fee":
			desc = f"Free cancellation until {time_str} before check-in. ₹{flt(policy.get('fixed_fee')):,.0f} cancellation fee applies." if hours > 0 else f"₹{flt(policy.get('fixed_fee')):,.0f} cancellation fee applies."
		elif pol_type == "Percentage":
			desc = f"Free cancellation until {time_str} before check-in. {flt(policy.get('percentage_fee')):g}% cancellation fee applies." if hours > 0 else f"{flt(policy.get('percentage_fee')):g}% cancellation fee applies."
		elif pol_type == "One Night Tariff":
			desc = f"Free cancellation until {time_str} before check-in. One night's room tariff will be charged for cancellation after the free cancellation deadline." if hours > 0 else "One night's room tariff will be charged for cancellation."
		else:
			desc = "Hotel cancellation policy applies."

	snapshot = {
		"policy": policy.get("name"),
		"policy_name": policy.get("policy_name"),
		"policy_code": policy.get("policy_code"),
		"policy_type": pol_type,
		"property": policy.get("property"),
		"free_cancel_deadline_hours": cint(policy.get("free_cancel_deadline_hours") or 0),
		"fixed_fee": flt(policy.get("fixed_fee") or 0),
		"percentage_fee": flt(policy.get("percentage_fee") or 0),
		"no_show_fee_type": policy.get("no_show_fee_type"),
		"no_show_fee_amount": flt(policy.get("no_show_fee_amount") or 0),
		"allow_hotel_cancellation_waiver": cint(policy.get("allow_hotel_cancellation_waiver", 1)),
		"description": desc,
		"fee_rule": fee_rule,
		"cancellation_deadline": str(deadline) if deadline else None,
		"snapshotted_at": str(now_datetime()),
	}

	reservation.cancellation_policy = policy.get("name")
	reservation.cancellation_policy_type = pol_type
	reservation.cancellation_deadline = deadline
	reservation.cancellation_fee_rule = fee_rule
	reservation.cancellation_policy_description = desc
	reservation.cancellation_policy_snapshot = frappe.as_json(snapshot)


def calculate_cancellation(reservation, cancellation_time=None, waive_fee: bool = False,
                           reason: str | None = None, is_no_show: bool = False) -> dict:
	"""Calculate cancellation charges and refund eligibility for a reservation.

	Calculates charges using:
	- Hotel-specific policy (from confirmed reservation snapshot or active hotel policy)
	- Scheduled check-in datetime
	- Actual cancellation request timestamp
	- Free cancellation deadline
	- Applicable booking value
	- Actual successful payments made
	- Previous refunds issued

	Guarantees:
	- Refunds are never calculated using total booking value when paid only partially.
	- Cancellation penalty retained cannot exceed actual payments made.
	- Security deposits remain separate from room cancellation penalties.
	"""
	if isinstance(reservation, str):
		reservation = frappe.get_doc("Reservation", reservation)

	cxl_dt = get_datetime(cancellation_time) if cancellation_time else now_datetime()

	# Resolve policy from reservation snapshot if exists (immutable snapshot rule)
	if reservation.get("cancellation_policy_snapshot"):
		try:
			pol = json.loads(reservation.cancellation_policy_snapshot)
		except Exception:
			pol = {}
	else:
		p = get_hotel_cancellation_policy(reservation.property, reservation.get("cancellation_policy"))
		pol = p if isinstance(p, dict) else (p.as_dict() if p else {})

	policy_type = pol.get("policy_type") or reservation.get("cancellation_policy_type") or "Free Cancellation"

	# Deadline resolution
	deadline = reservation.get("cancellation_deadline")
	if not deadline and pol.get("cancellation_deadline"):
		deadline = pol.get("cancellation_deadline")
	if isinstance(deadline, str):
		try:
			deadline = get_datetime(deadline)
		except Exception:
			deadline = None
	if not deadline:
		deadline = calculate_cancellation_deadline(
			pol, reservation.check_in_date, reservation.get("planned_check_in_time"),
			property=reservation.property,
		)

	# Deadline evaluation
	if is_no_show:
		is_before_deadline = False
	elif policy_type == "Non-Refundable":
		is_before_deadline = False
	elif not deadline:
		if policy_type == "Free Cancellation":
			is_before_deadline = True
		else:
			is_before_deadline = False
	else:
		is_before_deadline = (cxl_dt <= deadline)

	booking_val = flt(reservation.get("amount_before_tax") or reservation.get("amount_after_tax") or 0.0)

	# Fee calculation
	if waive_fee:
		fee = 0.0
		basis = "Fee waived by hotel"
	elif is_no_show:
		ns_type = pol.get("no_show_fee_type") or "One Night Tariff"
		if ns_type == "One Night Tariff":
			from izensphere_stay_and_dine.folio import _nightly_room_rate
			fee = flt(_nightly_room_rate(reservation, reservation.check_in_date))
			basis = "No-Show (One Night Tariff)"
		elif ns_type == "Full Stay":
			fee = booking_val
			basis = "No-Show (Full Stay)"
		elif ns_type == "Percentage":
			pct = flt(pol.get("no_show_fee_amount") or 100)
			fee = round(booking_val * (pct / 100.0), 2)
			basis = f"No-Show ({pct:g}% of stay)"
		elif ns_type == "Fixed Fee":
			fee = flt(pol.get("no_show_fee_amount") or 0)
			basis = f"No-Show (Fixed ₹{fee:,.0f})"
		else:
			fee = 0.0
			basis = "No-Show (None)"
	elif is_before_deadline:
		fee = 0.0
		basis = "Free cancellation (before deadline)"
	else:
		# After deadline fee
		if policy_type == "Free Cancellation":
			fee = 0.0
			basis = "Free Cancellation"
		elif policy_type == "Fixed Fee":
			fee = flt(pol.get("fixed_fee") or 0.0)
			basis = f"Fixed fee ₹{fee:,.0f}"
		elif policy_type == "Percentage":
			pct = flt(pol.get("percentage_fee") or 0.0)
			fee = round(booking_val * (pct / 100.0), 2)
			basis = f"{pct:g}% of booking"
		elif policy_type == "One Night Tariff":
			from izensphere_stay_and_dine.folio import _nightly_room_rate
			fee = flt(_nightly_room_rate(reservation, reservation.check_in_date))
			if fee <= 0 and cint(reservation.get("nights") or 1) > 0:
				fee = round(booking_val / max(1, cint(reservation.get("nights"))), 2)
			basis = "One night room tariff"
		elif policy_type == "Non-Refundable":
			fee = booking_val
			basis = "100% Non-Refundable"
		else:
			fee = 0.0
			basis = "None"

	# Payment & Refund calculation
	paid = flt(reservation.get("advance_paid") or 0.0)

	# Check folio payments if guest folio exists
	folio_name = frappe.db.get_value("Folio", {"reservation": reservation.name, "folio_type": "Guest"}, "name")
	if folio_name:
		fp = frappe.get_all("Folio Payment", filters={"parent": folio_name}, fields=["amount"])
		f_received = sum(flt(p.amount) for p in fp if flt(p.amount) > 0)
		f_refunded = -sum(flt(p.amount) for p in fp if flt(p.amount) < 0)
		net_folio = max(0.0, f_received - f_refunded)
		total_paid = max(paid, net_folio)
	else:
		total_paid = paid

	previous_refunds = flt(reservation.get("refund_amount") or 0.0)
	available_payment = max(0.0, total_paid - previous_refunds)

	# Eligible refund formula:
	# Customer paid total_paid. If fee is charged, fee is deducted from the paid amount.
	# Eligible refund = max(0.0, available_payment - fee)
	# Never calculate refunds using only the total booking value when customer has paid only partially.
	eligible_refund = max(0.0, round(available_payment - fee, 2))
	retained_penalty = min(fee, available_payment)

	return {
		"reservation": reservation.name,
		"property": reservation.property,
		"policy_name": pol.get("policy") or pol.get("policy_name") or reservation.get("cancellation_policy"),
		"policy_type": policy_type,
		"policy_description": pol.get("description") or reservation.get("cancellation_policy_description") or "",
		"fee_basis": basis,
		"fee_waived": bool(waive_fee),
		"cancellation_fee": fee,
		"effective_penalty": retained_penalty,
		"is_before_deadline": is_before_deadline,
		"cancellation_deadline": str(deadline) if deadline else None,
		"booking_amount": booking_val,
		"amount_paid": total_paid,
		"previous_refunds": previous_refunds,
		"eligible_refund": eligible_refund,
		"allow_hotel_cancellation_waiver": cint(pol.get("allow_hotel_cancellation_waiver", 1)),
	}


def execute_cancellation(reservation, reason: str = "Guest request", note: str | None = None,
                         waive_fee: int = 0, issue_credit_note: int = 0,
                         execute_refund: int = 0, refund_mode: str = "Cash",
                         pin: str | None = None, supervisor_pin: str | None = None,
                         cancellation_time: datetime | str | None = None) -> dict:
	"""Execute the cancellation of a reservation with policy calculation, folio posting,
	and audit logging."""
	if isinstance(reservation, str):
		res = frappe.get_doc("Reservation", reservation)
	else:
		res = reservation

	if res.status != "Confirmed":
		frappe.throw(_("Only confirmed bookings can be cancelled - checked-in stays check out."))

	calc = calculate_cancellation(
		res,
		cancellation_time=cancellation_time,
		waive_fee=bool(int(waive_fee or 0)),
		reason=reason,
	)
	fee = calc["cancellation_fee"]
	eligible_refund = calc["eligible_refund"]
	summary = (f"Cancel {res.name} · {reason}"
	           + (" · fee waived" if int(waive_fee or 0) else "")
	           + (f" · fee ₹{fee:,.0f}" if fee > 0 else "")
	           + (f" · eligible refund ₹{eligible_refund:,.0f}" if eligible_refund > 0 else ""))

	# Post cancellation fee to folio if fee > 0 and not waived
	if fee > 0 and not int(waive_fee or 0):
		from izensphere_stay_and_dine.folio import post_policy_fee
		try:
			post_policy_fee(res, calc["fee_basis"], f"Cancellation fee ({calc['fee_basis']})")
		except Exception as e:
			frappe.log_error(f"Failed to post cancellation fee on folio for {res.name}: {e}")

	cxl_number = make_autoname("CXL-.YYYY.-.#####")
	res.status = "Cancelled"
	res.cancellation_reason = reason
	res.cancellation_note = note or ""
	res.cancellation_number = cxl_number
	res.cancellation_fee = fee
	res.cancelled_on = now_datetime()
	res.eligible_refund = eligible_refund

	# Credit note handling
	voucher_code = None
	if int(issue_credit_note or 0) == 1 and eligible_refund > 0:
		import random
		import string
		code_suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
		voucher_code = f"CN-{res.name.split('-')[-1]}-{code_suffix}"
		voucher = frappe.get_doc({
			"doctype": "Discount Voucher",
			"property": res.property,
			"voucher_code": voucher_code,
			"discount_type": "Amount",
			"value": eligible_refund,
			"valid_from": today(),
			"valid_to": add_days(today(), 180),
			"max_uses": 1,
			"disabled": 0,
		})
		voucher.insert(ignore_permissions=True)
		res.refund_status = "Credit Note Issued"
	elif eligible_refund > 0:
		res.refund_status = "Pending"
	else:
		res.refund_status = "Not Applicable"

	# Immediate authorized payment refund if requested by authorized desk staff
	refund_executed = 0.0
	if int(execute_refund or 0) == 1 and eligible_refund > 0:
		try:
			folio_name = frappe.db.get_value("Folio", {"reservation": res.name, "folio_type": "Guest"}, "name")
			if folio_name:
				from izensphere_stay_and_dine.api import _refund_folio_payment
				_refund_folio_payment(
					folio=folio_name,
					amount=eligible_refund,
					mode=refund_mode,
					reason=f"Cancellation refund {cxl_number}",
					pin=pin,
					supervisor_pin=supervisor_pin,
				)
				res.refund_amount = eligible_refund
				res.refund_status = "Processed"
				refund_executed = eligible_refund
		except Exception as e:
			frappe.log_error(f"Error processing cancellation refund for {res.name}: {e}")

	frappe.flags.kamra_cancelling = True
	try:
		res.save(ignore_permissions=True)
	finally:
		frappe.flags.kamra_cancelling = False

	from izensphere_stay_and_dine.savings import log_action
	log_action("cancel_reservation", "Reservation", res.name, res.property,
	           minutes_saved=8, rationale=summary)

	return {
		"reservation": res.name,
		"cancellation_number": cxl_number,
		"fee": fee,
		"fee_basis": calc["fee_basis"],
		"waived": bool(int(waive_fee or 0)),
		"amount_paid": calc["amount_paid"],
		"eligible_refund": eligible_refund,
		"refund_status": res.refund_status,
		"credit_note_voucher": voucher_code,
		"refund_executed": refund_executed,
		"policy_type": calc["policy_type"],
		"policy_description": calc["policy_description"],
	}


def process_cancellation_refund(reservation: str, amount: float | None = None,
                                mode: str = "Cash", reason: str = "Cancellation refund",
                                pin: str | None = None, supervisor_pin: str | None = None) -> dict:
	"""Authorized payment refund execution for a cancelled reservation.

	- Verifies reservation is Cancelled
	- Verifies remaining eligible refund amount
	- Executes ledgered refund on folio
	- Updates Reservation.refund_amount and refund_status
	- Prevents duplicate refunds
	"""
	res = frappe.get_doc("Reservation", reservation)
	if res.status != "Cancelled":
		frappe.throw(_("Refund can only be processed on a cancelled reservation."))

	eligible = flt(res.eligible_refund or 0.0)
	already_refunded = flt(res.refund_amount or 0.0)
	remaining = max(0.0, eligible - already_refunded)

	if remaining <= 0:
		frappe.throw(_("No remaining refund is due for this reservation."))

	refund_amt = flt(amount) if amount is not None and flt(amount) > 0 else remaining
	if refund_amt > remaining + 0.01:
		frappe.throw(_("Refund amount ₹{0:,.2f} exceeds remaining eligible refund ₹{1:,.2f}.").format(refund_amt, remaining))

	folio_name = frappe.db.get_value("Folio", {"reservation": res.name, "folio_type": "Guest"}, "name")
	if not folio_name:
		frappe.throw(_("No guest folio found to process refund."))

	from izensphere_stay_and_dine.api import _refund_folio_payment
	_refund_folio_payment(
		folio=folio_name,
		amount=refund_amt,
		mode=mode,
		reason=f"{reason} ({res.cancellation_number or res.name})",
		pin=pin,
		supervisor_pin=supervisor_pin,
	)

	new_refunded = already_refunded + refund_amt
	res.refund_amount = new_refunded
	if new_refunded >= eligible - 0.01:
		res.refund_status = "Processed"
	else:
		res.refund_status = "Pending"
	res.save(ignore_permissions=True)

	return {
		"reservation": res.name,
		"refund_amount": refund_amt,
		"total_refunded": new_refunded,
		"remaining_eligible": max(0.0, eligible - new_refunded),
		"refund_status": res.refund_status,
	}


def get_cancellation_analytics(property: str) -> dict:
	"""Retrieve comprehensive cancellation and refund history for hotel administrators."""
	from izensphere_stay_and_dine.crs import assert_property_access
	assert_property_access(property)

	cancellations = frappe.db.sql(
		"""SELECT name, guest_name, check_in_date, check_out_date,
		          cancellation_number, cancellation_reason, cancellation_fee,
		          eligible_refund, refund_amount, refund_status,
		          cancellation_policy, cancellation_policy_type,
		          cancellation_policy_description, cancelled_on, advance_paid
		   FROM `tabReservation`
		   WHERE property = %s AND status = 'Cancelled'
		   ORDER BY cancelled_on DESC""",
		property, as_dict=True,
	)

	total_cxl = len(cancellations)
	total_fees = sum(flt(c.get("cancellation_fee") or 0) for c in cancellations)
	total_eligible = sum(flt(c.get("eligible_refund") or 0) for c in cancellations)
	total_refunded = sum(flt(c.get("refund_amount") or 0) for c in cancellations)

	by_policy_type = {}
	for c in cancellations:
		pt = c.get("cancellation_policy_type") or "Unclassified"
		by_policy_type[pt] = by_policy_type.get(pt, 0) + 1

	return {
		"property": property,
		"total_cancellations": total_cxl,
		"total_cancellation_fees_collected": total_fees,
		"total_eligible_refunds": total_eligible,
		"total_refunds_processed": total_refunded,
		"by_policy_type": by_policy_type,
		"cancellations": cancellations,
	}


def get_policy_bookings(cancellation_policy: str) -> list[dict]:
	"""List all bookings using a specific cancellation policy."""
	pol = frappe.get_doc("Cancellation Policy", cancellation_policy)
	from izensphere_stay_and_dine.crs import assert_property_access
	assert_property_access(pol.property)

	return frappe.get_all(
		"Reservation",
		filters={"cancellation_policy": cancellation_policy},
		fields=["name", "guest_name", "status", "check_in_date", "check_out_date",
		        "cancellation_deadline", "cancellation_fee", "eligible_refund",
		        "refund_status", "advance_paid", "amount_after_tax"],
		order_by="creation desc",
	)
