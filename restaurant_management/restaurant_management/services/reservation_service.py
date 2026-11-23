# Copyright (c) 2026, Nahusha and contributors
# For license information, please see license.txt

import datetime
import hashlib
import re
import secrets
import frappe
from frappe import _


class ReservationService:
	OPENING_TIME = "12:00 PM"
	CLOSING_TIME = "11:00 PM"
	DURATION_MINUTES = 90
	SLOT_INTERVAL_MINUTES = 30
	ADVANCE_DAYS = 7
	TIMEZONE = "Asia/Kolkata"

	# Slots offered every 30 minutes from 12 noon through 9:30 PM (ends at 11:00 PM)
	VALID_SLOTS = [
		"12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM",
		"02:00 PM", "02:30 PM", "03:00 PM", "03:30 PM",
		"04:00 PM", "04:30 PM", "05:00 PM", "05:30 PM",
		"06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM",
		"08:00 PM", "08:30 PM", "09:00 PM", "09:30 PM"
	]

	@classmethod
	def get_operating_rules(cls):
		return {
			"opening_time": cls.OPENING_TIME,
			"closing_time": cls.CLOSING_TIME,
			"duration_minutes": cls.DURATION_MINUTES,
			"slot_interval_minutes": cls.SLOT_INTERVAL_MINUTES,
			"advance_days": cls.ADVANCE_DAYS,
			"timezone": cls.TIMEZONE,
			"slots": cls.VALID_SLOTS,
			"max_capacity": cls.get_max_party_capacity()
		}

	@classmethod
	def get_max_party_capacity(cls):
		"""
		Reads the maximum capacity dynamically from active tables so staff can modify table capacities later.
		"""
		from restaurant_management.restaurant_management.services.restaurant_store import RestaurantStore
		tables = RestaurantStore.get_floor_data().get("tables", [])
		capacities = [t.get("capacity", 0) for t in tables if t.get("capacity")]
		return max(capacities) if capacities else 6

	@classmethod
	def normalize_booking_time(cls, time_str):
		"""
		Normalizes any standard time input to 'hh:mm AM/PM' matching VALID_SLOTS.
		Supports formats: '7:00 PM', '07:00 PM', '19:00', '19:00:00', '7 PM', etc.
		"""
		if not time_str:
			frappe.throw(_("Reservation time is required."))
		raw = str(time_str).strip()

		# Standardize spacing before AM/PM
		cleaned = re.sub(r"([0-9])([AP]M)", r"\1 \2", raw, flags=re.IGNORECASE)

		parsed_dt = None
		for fmt in ("%I:%M %p", "%I:%M%p", "%I %p", "%I%p", "%H:%M:%S", "%H:%M"):
			try:
				parsed_dt = datetime.datetime.strptime(cleaned.upper(), fmt)
				break
			except ValueError:
				pass

		if not parsed_dt:
			frappe.throw(_("Invalid time format '{0}'. Please specify time like '7:00 PM' or '19:00'.").format(time_str))

		normalized = parsed_dt.strftime("%I:%M %p")
		if normalized not in cls.VALID_SLOTS:
			frappe.throw(
				_("Time '{0}' is outside booking hours. Bookings are accepted from {1} through {2} daily.").format(
					normalized, cls.VALID_SLOTS[0], cls.VALID_SLOTS[-1]
				)
			)
		return normalized

	@classmethod
	def get_slot_datetimes(cls, booking_date_str, normalized_time_str):
		"""
		Calculates (start_datetime, end_datetime) for a booking given date and slot.
		End time is start_datetime + 90 minutes.
		"""
		start_dt = datetime.datetime.strptime(f"{booking_date_str} {normalized_time_str}", "%Y-%m-%d %I:%M %p")
		end_dt = start_dt + datetime.timedelta(minutes=cls.DURATION_MINUTES)
		return start_dt, end_dt

	@classmethod
	def validate_booking_request(cls, booking_date, booking_time, party_size, customer_name, customer_mobile):
		"""
		Strict validation for date, time, party size, name, and mobile.
		"""
		from restaurant_management.restaurant_management.services.restaurant_store import RestaurantStore

		# 1. Customer Name
		clean_name = (customer_name or "").strip()
		if not clean_name:
			frappe.throw(_("Please enter your name."))
		if len(clean_name) < 2:
			frappe.throw(_("Name must be at least 2 characters."))

		# 2. Customer Mobile
		clean_mobile = RestaurantStore.normalize_and_validate_mobile(customer_mobile)

		# 3. Date Validation
		if not booking_date:
			frappe.throw(_("Please select a reservation date."))
		try:
			req_date = datetime.date.fromisoformat(str(booking_date).strip())
		except Exception:
			frappe.throw(_("Invalid date format '{0}'. Use YYYY-MM-DD.").format(booking_date))

		today_str = frappe.utils.nowdate()
		today_date = datetime.date.fromisoformat(today_str)
		max_date = today_date + datetime.timedelta(days=cls.ADVANCE_DAYS)

		if req_date < today_date:
			frappe.throw(_("Cannot book a date in the past."))
		if req_date > max_date:
			frappe.throw(_("Bookings can only be made up to 7 calendar days in advance (until {0}).").format(max_date.strftime("%d %b %Y")))

		# 4. Party Size Validation
		try:
			size = int(party_size)
		except Exception:
			frappe.throw(_("Party size must be a valid number."))

		max_cap = cls.get_max_party_capacity()
		if size < 1:
			frappe.throw(_("Party size must be at least 1 guest."))
		if size > max_cap:
			frappe.throw(_("Party size of {0} exceeds the maximum table capacity of {1} seats.").format(size, max_cap))

		# 5. Time Validation
		norm_time = cls.normalize_booking_time(booking_time)
		start_dt, end_dt = cls.get_slot_datetimes(req_date.isoformat(), norm_time)

		# If booking for today, slot must be in the future
		if req_date == today_date:
			now_dt = frappe.utils.now_datetime()
			# Allow a small 1-minute grace margin or strict future
			if start_dt <= now_dt:
				frappe.throw(_("Time slot '{0}' has already passed for today. Please select a future time slot.").format(norm_time))

		return {
			"customer_name": clean_name,
			"customer_mobile": clean_mobile,
			"booking_date": req_date.isoformat(),
			"booking_time": norm_time,
			"party_size": size,
			"start_dt": start_dt,
			"end_dt": end_dt
		}

	@classmethod
	def get_availability(cls, booking_date, party_size):
		"""
		Returns available time slots for the given date and party size.
		Guest-safe: only returns time and availability flag, no guest data.
		"""
		from restaurant_management.restaurant_management.services.restaurant_store import RestaurantStore

		try:
			req_date = datetime.date.fromisoformat(str(booking_date).strip())
		except Exception:
			frappe.throw(_("Invalid date format '{0}'. Use YYYY-MM-DD.").format(booking_date))

		today_date = datetime.date.fromisoformat(frappe.utils.nowdate())
		max_date = today_date + datetime.timedelta(days=cls.ADVANCE_DAYS)

		if req_date < today_date:
			frappe.throw(_("Cannot check availability for a past date."))
		if req_date > max_date:
			frappe.throw(_("Date is beyond the 7-day advance booking window."))

		try:
			size = int(party_size)
		except Exception:
			size = 2

		max_cap = cls.get_max_party_capacity()
		if size < 1 or size > max_cap:
			frappe.throw(_("Party size must be between 1 and {0}.").format(max_cap))

		tables = RestaurantStore.get_floor_data().get("tables", [])
		suitable_tables = [t for t in tables if t.get("capacity", 0) >= size]

		if not suitable_tables:
			return {
				"date": req_date.isoformat(),
				"party_size": size,
				"max_capacity": max_cap,
				"slots": [{"time": slot, "available": False, "reason": "No tables of this size"} for slot in cls.VALID_SLOTS]
			}

		# Fetch all active reservations for that date in one query
		active_reservations = frappe.db.sql(
			"""
			SELECT table_no, start_time, end_time
			FROM `tabRestaurant Reservation`
			WHERE booking_date = %s
			  AND status IN ('Confirmed', 'Seated')
			""",
			(req_date.isoformat(),),
			as_dict=True
		)

		now_dt = frappe.utils.now_datetime()
		slots_status = []

		for slot in cls.VALID_SLOTS:
			start_dt, end_dt = cls.get_slot_datetimes(req_date.isoformat(), slot)

			# If today and slot has already passed
			if req_date == today_date and start_dt <= now_dt:
				slots_status.append({
					"time": slot,
					"available": False,
					"reason": "Past time"
				})
				continue

			# Find booked tables that overlap with [start_dt, end_dt)
			booked_tables = set()
			for res in active_reservations:
				res_start = frappe.utils.get_datetime(res["start_time"])
				res_end = frappe.utils.get_datetime(res["end_time"])
				# Overlap condition: start_A < end_B AND start_B < end_A
				if start_dt < res_end and res_start < end_dt:
					booked_tables.add(res["table_no"])

			# Count available suitable tables
			free_suitable = [t for t in suitable_tables if t["table_no"] not in booked_tables]

			slots_status.append({
				"time": slot,
				"available": len(free_suitable) > 0,
				"free_count": len(free_suitable),
				"reason": "" if free_suitable else "Fully booked"
			})

		return {
			"date": req_date.isoformat(),
			"party_size": size,
			"max_capacity": max_cap,
			"slots": slots_status
		}

	@classmethod
	def create_reservation(
		cls,
		booking_date,
		booking_time,
		party_size,
		customer_name,
		customer_mobile,
		notes="",
		table_no=None,
		source="Website",
		idempotency_key=None
	):
		"""
		Unified transactional reservation creation for both Website and Staff.
		Enforces:
		- Database-level locking to prevent race conditions for the last table.
		- Idempotency key to return original booking on retry / double tap.
		- Capacity and overlapping interval validation.
		- Synchronizes live floor status for today's reservations.
		"""
		from restaurant_management.restaurant_management.services.restaurant_store import RestaurantStore

		# 1. Validation
		val = cls.validate_booking_request(
			booking_date=booking_date,
			booking_time=booking_time,
			party_size=party_size,
			customer_name=customer_name,
			customer_mobile=customer_mobile
		)
		clean_name = val["customer_name"]
		clean_mobile = val["customer_mobile"]
		booking_date = val["booking_date"]
		normalized_time = val["booking_time"]
		party_size = val["party_size"]
		start_dt = val["start_dt"]
		end_dt = val["end_dt"]

		# 2. Idempotency Check
		if not idempotency_key:
			raw_key = f"{clean_mobile}:{booking_date}:{normalized_time}:{party_size}"
			idempotency_key = hashlib.sha256(raw_key.strip().lower().encode("utf-8")).hexdigest()

		existing_booking = frappe.db.sql(
			"""
			SELECT name, booking_ref, customer_name, customer_mobile, customer_id,
			       booking_date, booking_time, party_size, table_no, table_area,
			       status, notes, source, creation, cancel_token
			FROM `tabRestaurant Reservation`
			WHERE idempotency_key = %s
			  AND status IN ('Confirmed', 'Seated')
			LIMIT 1
			""",
			(idempotency_key,),
			as_dict=True
		)
		if existing_booking:
			b = existing_booking[0]
			c_tok = b.get("cancel_token") or ""
			if not c_tok:
				c_tok = secrets.token_urlsafe(32)
				frappe.db.sql("UPDATE `tabRestaurant Reservation` SET cancel_token = %s WHERE name = %s", (c_tok, b["name"]))
				frappe.db.commit()
			return {
				"booking_ref": b["booking_ref"],
				"status": b["status"],
				"message": _("Booking confirmed"),
				"booking_date": str(b["booking_date"]),
				"booking_time": b["booking_time"],
				"party_size": b["party_size"],
				"customer_name": b["customer_name"],
				"customer_mobile": b["customer_mobile"],
				"table_no": b["table_no"],
				"table_area": b.get("table_area", ""),
				"notes": b.get("notes", ""),
				"cancel_token": c_tok,
				"manage_url": f"/book?ref={b['booking_ref']}&token={c_tok}",
				"is_retry": True
			}

		# 3. Database Mutex Lock for Concurrency Safety
		# MariaDB GET_LOCK serializes table assignment across all concurrent requests
		lock_res = frappe.db.sql("SELECT GET_LOCK('restaurant_reservation_mutex', 10)")
		if not lock_res or not lock_res[0][0]:
			frappe.throw(_("Server is busy processing reservations. Please try again in a moment."))

		try:
			# Double-check idempotency inside lock
			double_check = frappe.db.sql(
				"""
				SELECT name, booking_ref, customer_name, customer_mobile, customer_id,
				       booking_date, booking_time, party_size, table_no, table_area,
				       status, notes, source, cancel_token
				FROM `tabRestaurant Reservation`
				WHERE idempotency_key = %s
				  AND status IN ('Confirmed', 'Seated')
				LIMIT 1
				""",
				(idempotency_key,),
				as_dict=True
			)
			if double_check:
				b = double_check[0]
				c_tok = b.get("cancel_token") or ""
				if not c_tok:
					c_tok = secrets.token_urlsafe(32)
					frappe.db.sql("UPDATE `tabRestaurant Reservation` SET cancel_token = %s WHERE name = %s", (c_tok, b["name"]))
					frappe.db.commit()
				return {
					"booking_ref": b["booking_ref"],
					"status": b["status"],
					"message": _("Booking confirmed"),
					"booking_date": str(b["booking_date"]),
					"booking_time": b["booking_time"],
					"party_size": b["party_size"],
					"customer_name": b["customer_name"],
					"customer_mobile": b["customer_mobile"],
					"table_no": b["table_no"],
					"table_area": b.get("table_area", ""),
					"notes": b.get("notes", ""),
					"cancel_token": c_tok,
					"manage_url": f"/book?ref={b['booking_ref']}&token={c_tok}",
					"is_retry": True
				}

			tables = RestaurantStore.get_floor_data().get("tables", [])

			# Query all overlapping reservations for that date
			start_str = start_dt.strftime("%Y-%m-%d %H:%M:%S")
			end_str = end_dt.strftime("%Y-%m-%d %H:%M:%S")

			overlapping_rows = frappe.db.sql(
				"""
				SELECT table_no, booking_ref
				FROM `tabRestaurant Reservation`
				WHERE booking_date = %s
				  AND status IN ('Confirmed', 'Seated')
				  AND start_time < %s
				  AND end_time > %s
				FOR UPDATE
				""",
				(booking_date, end_str, start_str),
				as_dict=True
			)
			booked_table_set = {row["table_no"] for row in overlapping_rows}

			# Filter candidate tables
			candidate_tables = [
				t for t in tables
				if t["table_no"] not in booked_table_set
				and t.get("capacity", 0) >= party_size
			]

			# Sort candidates: best fit capacity first, then table number
			candidate_tables.sort(key=lambda t: (t.get("capacity", 0), t.get("table_no", "")))

			assigned_table_obj = None

			if table_no:
				# Explicit table requested (staff action)
				target = next((t for t in tables if t["table_no"] == table_no), None)
				if not target:
					frappe.throw(_("Table {0} not found.").format(table_no))
				if target.get("capacity", 0) < party_size:
					frappe.throw(_("Table {0} capacity ({1}) is less than party size ({2}).").format(
						table_no, target.get("capacity"), party_size
					))
				if table_no in booked_table_set:
					frappe.throw(_("Table {0} is already reserved for an overlapping time on {1}.").format(
						table_no, booking_date
					))
				assigned_table_obj = target
			else:
				# Automatic table assignment (website customer)
				if not candidate_tables:
					frappe.throw(
						_("No suitable tables available for a party of {0} at {1} on {2}.").format(
							party_size, normalized_time, booking_date
						)
					)
				assigned_table_obj = candidate_tables[0]

			assigned_table_no = assigned_table_obj["table_no"]
			assigned_table_area = assigned_table_obj.get("area", "Main Dining Hall")

			# Customer profile lookup or creation
			cust = RestaurantStore.get_or_create_customer(name=clean_name, mobile=clean_mobile, update_visit=False)

			# Generate unique Booking Reference and unguessable cancellation token
			booking_ref = cls.generate_booking_reference(booking_date)
			cancel_token = secrets.token_urlsafe(32)

			# Insert into persistent MariaDB table
			res_doc = frappe.get_doc({
				"doctype": "Restaurant Reservation",
				"booking_ref": booking_ref,
				"customer_name": clean_name,
				"customer_mobile": clean_mobile,
				"customer_id": cust.get("customer_id", ""),
				"booking_date": booking_date,
				"booking_time": normalized_time,
				"start_time": start_str,
				"end_time": end_str,
				"party_size": party_size,
				"table_no": assigned_table_no,
				"table_area": assigned_table_area,
				"status": "Confirmed",
				"notes": (notes or "").strip(),
				"cancel_token": cancel_token,
				"idempotency_key": idempotency_key,
				"source": source
			})
			res_doc.insert(ignore_permissions=True)
			# Ensure cancel_token is persisted even if doctype schema cache lags
			frappe.db.sql(
				"UPDATE `tabRestaurant Reservation` SET cancel_token = %s WHERE name = %s",
				(cancel_token, res_doc.name)
			)
			frappe.db.commit()

			# Floor management dynamically reads confirmed reservations from persistent DB.
			# Creating a reservation does not overwrite physical table status or interfere with current walk-ins.
			return {
				"booking_ref": booking_ref,
				"status": "Confirmed",
				"message": _("Booking confirmed"),
				"booking_date": booking_date,
				"booking_time": normalized_time,
				"party_size": party_size,
				"customer_name": clean_name,
				"customer_mobile": clean_mobile,
				"table_no": assigned_table_no,
				"table_area": assigned_table_area,
				"notes": (notes or "").strip(),
				"cancel_token": cancel_token,
				"manage_url": f"/book?ref={booking_ref}&token={cancel_token}",
				"is_retry": False
			}

		finally:
			frappe.db.sql("SELECT RELEASE_LOCK('restaurant_reservation_mutex')")

	@classmethod
	def generate_booking_reference(cls, booking_date):
		"""
		Generates unique booking reference BK-YYYYMMDD-XXXX.
		"""
		clean_date = booking_date.replace("-", "")
		# Count today's reservations for sequential numbering
		count = frappe.db.sql(
			"SELECT COUNT(*) FROM `tabRestaurant Reservation` WHERE booking_date = %s",
			(booking_date,)
		)[0][0]
		seq = count + 1
		ref = f"BK-{clean_date}-{seq:04d}"
		# Ensure uniqueness
		while frappe.db.exists("Restaurant Reservation", {"booking_ref": ref}):
			seq += 1
			ref = f"BK-{clean_date}-{seq:04d}"
		return ref

	@classmethod
	def sync_today_reservation_to_floor(cls, table_no, customer, customer_mobile, customer_id, guests, reservation_time, reservation_id, notes):
		"""
		Synchronizes today's reservation onto the live floor table in demo_restaurant_store.json.
		Does NOT mark table as Occupied! Marks as 'Reserved'.
		"""
		from restaurant_management.restaurant_management.services.restaurant_store import RestaurantStore
		data = RestaurantStore.get_data()
		tables = data.get("tables", [])
		for t in tables:
			if t["table_no"] == table_no:
				# Only set to Reserved if not currently Occupied by seated guests
				if t.get("status") != "Occupied":
					t["status"] = "Reserved"
					t["customer"] = customer
					t["customer_mobile"] = customer_mobile
					t["customer_id"] = customer_id
					t["guests"] = int(guests)
					t["reservation_time"] = reservation_time
					t["reservation_id"] = reservation_id
					t["notes"] = notes or ""
				break
		RestaurantStore.save_data(data)

	@classmethod
	def cancel_reservation(cls, booking_ref):
		"""
		Cancels an explicit reservation by booking reference.
		Only this specific reservation is marked Cancelled in tabRestaurant Reservation.
		"""
		from restaurant_management.restaurant_management.services.restaurant_store import RestaurantStore
		clean_ref = (booking_ref or "").strip()
		res_name = frappe.db.get_value("Restaurant Reservation", {"booking_ref": clean_ref}, "name")
		if not res_name:
			frappe.throw(_("Reservation '{0}' not found.").format(clean_ref))

		doc = frappe.get_doc("Restaurant Reservation", res_name)
		doc.status = "Cancelled"
		doc.save(ignore_permissions=True)
		frappe.db.commit()

		# If table on floor is currently occupied under this specific booking reference, release it
		data = RestaurantStore.get_data()
		for t in data.get("tables", []):
			if (t.get("current_booking_ref") == clean_ref or t.get("reservation_id") == clean_ref):
				RestaurantStore.release_table(t["table_no"])
				break
		return {"message": _("Reservation {0} cancelled.").format(clean_ref)}

	@classmethod
	def seat_reservation(cls, booking_ref):
		"""
		Marks a reservation as 'Seated' when guests arrive.
		Row-locked to prevent check-in of a cancelled reservation.
		"""
		rows = frappe.db.sql(
			"SELECT name, status FROM `tabRestaurant Reservation` WHERE booking_ref = %s FOR UPDATE",
			(booking_ref,),
			as_dict=True
		)
		if not rows:
			frappe.throw(_("Reservation '{0}' not found.").format(booking_ref))
		res = rows[0]
		if res["status"] == "Cancelled":
			frappe.throw(_("Cannot check in reservation {0} as it has been cancelled.").format(booking_ref))
		if res["status"] != "Seated":
			frappe.db.set_value("Restaurant Reservation", res["name"], "status", "Seated")
			frappe.db.commit()

	@classmethod
	def get_booking_by_token(cls, booking_ref, cancel_token):
		"""
		Retrieves reservation details strictly authenticated by booking_ref and unguessable cancel_token.
		"""
		clean_ref = (booking_ref or "").strip()
		clean_token = (cancel_token or "").strip()
		if not clean_ref or not clean_token:
			frappe.throw(_("Invalid booking reference or authorization token."), frappe.PermissionError)

		b = frappe.db.get_value(
			"Restaurant Reservation",
			{"booking_ref": clean_ref},
			["name", "booking_ref", "customer_name", "customer_mobile", "booking_date",
			 "booking_time", "party_size", "table_no", "table_area", "status", "cancel_token"],
			as_dict=True
		)
		if not b:
			frappe.throw(_("Reservation not found."))

		expected_token = b.get("cancel_token") or ""
		if not expected_token or not secrets.compare_digest(expected_token, clean_token):
			frappe.throw(_("Invalid management token. Access denied."), frappe.PermissionError)

		return {
			"booking_ref": b["booking_ref"],
			"customer_name": b["customer_name"],
			"customer_mobile": b["customer_mobile"],
			"booking_date": str(b["booking_date"]),
			"booking_time": b["booking_time"],
			"party_size": b["party_size"],
			"table_no": b["table_no"],
			"table_area": b.get("table_area", "Main Dining Hall"),
			"status": b["status"],
			"cancel_token": clean_token,
			"can_cancel": b["status"] == "Confirmed",
		}

	@classmethod
	def cancel_customer_booking(cls, booking_ref, cancel_token, reason=""):
		"""
		Cancels an eligible Confirmed booking on behalf of the customer.
		Enforces:
		- Authorized by unguessable cancel_token.
		- Atomic status transition from 'Confirmed' -> 'Cancelled' via row-level locking.
		- If staff checked in the booking simultaneously (race condition), reports actual final status 'Seated'.
		- Preserves current occupants and any other reservations on the table.
		- Recalculates public availability and updates Floor & Tables.
		"""
		from restaurant_management.restaurant_management.services.restaurant_store import RestaurantStore

		clean_ref = (booking_ref or "").strip()
		clean_token = (cancel_token or "").strip()
		if not clean_ref or not clean_token:
			frappe.throw(_("Invalid booking reference or authorization token."), frappe.PermissionError)

		# Row lock to prevent race condition with staff check-in
		rows = frappe.db.sql(
			"""
			SELECT name, booking_ref, status, cancel_token, table_no, booking_date, booking_time, party_size, customer_name
			FROM `tabRestaurant Reservation`
			WHERE booking_ref = %s
			FOR UPDATE
			""",
			(clean_ref,),
			as_dict=True
		)
		if not rows:
			frappe.throw(_("Reservation not found."))

		res = rows[0]
		expected_token = res.get("cancel_token") or ""
		if not expected_token or not secrets.compare_digest(expected_token, clean_token):
			frappe.throw(_("Invalid management token. Action unauthorized."), frappe.PermissionError)

		current_status = res["status"]
		if current_status == "Cancelled":
			return {
				"success": True,
				"status": "Cancelled",
				"booking_ref": clean_ref,
				"message": _("Booking {0} is already cancelled.").format(clean_ref),
				"table_no": res["table_no"],
				"booking_date": str(res["booking_date"]),
				"booking_time": res["booking_time"],
				"party_size": res["party_size"],
			}

		if current_status == "Seated":
			frappe.throw(
				_("Reservation {0} has already been checked in by staff and cannot be cancelled.").format(clean_ref)
			)

		if current_status != "Confirmed":
			frappe.throw(_("Reservation {0} cannot be cancelled in status '{1}'.").format(clean_ref, current_status))

		# Update status atomically
		frappe.db.sql(
			"""
			UPDATE `tabRestaurant Reservation`
			SET status = 'Cancelled', modified = NOW(), notes = CONCAT(IFNULL(notes, ''), ' [Customer cancelled]')
			WHERE name = %s AND status = 'Confirmed'
			""",
			(res["name"],)
		)
		frappe.db.commit()

		# Also clear floor store if table had this reservation staged
		data = RestaurantStore.get_data()
		tables = data.get("tables", [])
		changed = False
		for t in tables:
			if t.get("current_booking_ref") == clean_ref or t.get("reservation_id") == clean_ref:
				# Only if table isn't physically Occupied
				if t.get("status") != "Occupied":
					t["reservation_id"] = ""
					t["reservation_time"] = ""
					t["current_booking_ref"] = ""
					changed = True
		if changed:
			RestaurantStore.save_data(data)

		return {
			"success": True,
			"status": "Cancelled",
			"booking_ref": clean_ref,
			"message": _("Booking cancelled"),
			"table_no": res["table_no"],
			"booking_date": str(res["booking_date"]),
			"booking_time": res["booking_time"],
			"party_size": res["party_size"],
		}

	@classmethod
	def check_rate_limit(cls, customer_mobile):
		"""
		Rate limiting: max 10 submissions per minute per IP or mobile.
		"""
		req = getattr(frappe.local, "request", None)
		ip = getattr(frappe.local, "request_ip", None) or "127.0.0.1"
		cache_key = f"rate_limit_book_{ip}_{customer_mobile}"
		attempts = frappe.cache.get_value(cache_key) or 0
		if attempts >= 10:
			frappe.throw(
				_("Too many booking requests from this device. Please wait a minute before trying again."),
				frappe.TooManyRequestsError
			)
		frappe.cache.set_value(cache_key, attempts + 1, expires_in_sec=60)
