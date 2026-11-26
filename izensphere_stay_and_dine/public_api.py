"""Guest-facing booking engine API - the only allow_guest surface.

Read: property showcase + live availability with real quotes.
Write: one endpoint, create a Website booking. Everything else stays
behind auth. Money still comes only from the pricing engine.
"""

import re

import frappe
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, date_diff

from izensphere_stay_and_dine.authz import act_as
from izensphere_stay_and_dine.booking_slugs import resolve_public_slug, slugify
from izensphere_stay_and_dine.install import AGENT_EMAIL


def _room_type_filters(property: str, listing_slug: str | None = None,
                       location_slug: str | None = None) -> dict:
	filters: dict = {"property": property, "disabled": 0}
	if listing_slug:
		filters["listing_slug"] = listing_slug
	if location_slug:
		filters["location_slug"] = location_slug
	return filters


def _room_type_payload(rt) -> dict:
	return {
		"name": rt.name,
		"room_type_name": rt.room_type_name,
		"listing_slug": rt.get("listing_slug"),
		"location_slug": rt.get("location_slug"),
		"description": rt.description,
		"base_price": float(rt.base_price),
		"base_occupancy": rt.base_occupancy,
		"adults_capacity": rt.adults_capacity,
		"children_capacity": rt.children_capacity,
		"bed_type": rt.bed_type,
		"room_view": rt.room_view,
		"room_category": rt.get("room_category"),
		"amenities": [a.strip() for a in re.split(r"[,\n]", rt.amenities or "") if a.strip()],
		"media": [
			{"media_type": m.media_type, "url": m.url, "caption": m.caption}
			for m in (rt.get("media") or [])
		] or ([{"media_type": "Image", "url": rt.image, "caption": rt.room_type_name}] if rt.get("image") else []),
		"location_name": rt.get("location_name"),
		"location_address": rt.get("location_address"),
		"google_maps_url": rt.get("google_maps_url"),
		"latitude": rt.get("latitude"),
		"longitude": rt.get("longitude"),
	}


def _property_payload(prop) -> dict:
	return {
		"name": prop.name,
		"property_name": prop.property_name,
		"property_slug": prop.get("page_slug") or slugify(prop.property_name),
		"description": prop.get("showcase_description"),
		"logo_url": prop.get("logo_url"),
		"hero_image": prop.get("hero_image"),
		"brand_accent": prop.get("brand_accent") or "Emerald",
		"star_category": prop.get("star_category"),
		"address_line": prop.address_line,
		"city": prop.city, "state": prop.state,
		"pincode": prop.pincode,
		"country": prop.get("country") or "India",
		"phone": prop.phone, "email": prop.email,
		"website": prop.website,
		"google_reviews_url": prop.get("google_reviews_url"),
		"tripadvisor_url": prop.get("tripadvisor_url"),
		"amenities": [a.strip() for a in re.split(r"[,\n]", prop.get("property_amenities") or "") if a.strip()],
		"checkin_time": str(prop.checkin_time or ""),
		"checkout_time": str(prop.checkout_time or ""),
		"privacy_contact": prop.get("privacy_contact") or prop.email or prop.phone,
		"guest_retention_months": prop.get("guest_retention_months") or 0,
		"driving_directions": prop.get("driving_directions"),
		"latitude": prop.get("latitude"),
		"longitude": prop.get("longitude"),
		"gallery": [
			{"url": m.url, "caption": m.caption}
			for m in (prop.get("gallery") or [])
		],
		"faqs": [
			{"question": f.question, "answer": f.answer}
			for f in (prop.get("faqs") or [])
		],
		"house_rules": prop.get("house_rules"),
		"pets_policy": prop.get("pets_policy"),
		"children_policy": prop.get("children_policy"),
		"extra_bed_policy": prop.get("extra_bed_policy"),
		"meta_title": prop.get("meta_title"),
		"meta_description": prop.get("meta_description"),
		"og_image": prop.get("og_image"),
		"page_slug": prop.get("page_slug"),
		"booking_engine_enabled": prop.get("booking_engine_enabled"),
		"payment_mode": prop.get("booking_payment_mode") or "Pay at hotel",
		"advance_percent": float(prop.get("advance_percent") or 0),
		"registration_fee": float(prop.get("registration_fee") or 0),
		"cleaning_fee": float(prop.get("cleaning_fee") or 0),
		"pets_allowed": int(prop.get("pets_allowed") or 0),
		"pet_charge": float(prop.get("pet_charge") or 0),
		"pet_charge_basis": prop.get("pet_charge_basis") or "Per stay",
		"security_deposit_amount": float(prop.get("security_deposit_amount") or 0),
		"minimum_nights": int(prop.get("minimum_nights") or 1),
		"free_cancel_days": int(prop.get("free_cancel_days") or 0),
		"cancellation_fee": prop.get("cancellation_fee") or "None",
		"has_cancellation_tiers": bool(prop.get("cancellation_tiers")),
		"cancellation_policy": _property_cancellation_policy_summary(prop.name),
		"booking_mode": prop.get("booking_mode") or "Instant",
		"property_kind": prop.get("property_kind") or "Hotel",
	}


def _property_cancellation_policy_summary(property: str) -> dict:
	from izensphere_stay_and_dine.cancellation import get_hotel_cancellation_policy
	cp = get_hotel_cancellation_policy(property)
	if not cp:
		return {
			"policy_name": "Standard Policy",
			"policy_type": "Free Cancellation",
			"description": "Free cancellation.",
			"free_cancel_deadline_hours": 24,
			"fixed_fee": 0,
			"percentage_fee": 0,
		}
	return {
		"name": cp.get("name") if isinstance(cp, dict) else cp.name,
		"policy_name": cp.get("policy_name") if isinstance(cp, dict) else cp.policy_name,
		"policy_type": cp.get("policy_type") if isinstance(cp, dict) else cp.policy_type,
		"description": cp.get("description") if isinstance(cp, dict) else cp.description,
		"free_cancel_deadline_hours": int((cp.get("free_cancel_deadline_hours") if isinstance(cp, dict) else cp.free_cancel_deadline_hours) or 0),
		"fixed_fee": float((cp.get("fixed_fee") if isinstance(cp, dict) else cp.fixed_fee) or 0),
		"percentage_fee": float((cp.get("percentage_fee") if isinstance(cp, dict) else cp.percentage_fee) or 0),
	}


def _build_locations(prop, room_types: list[dict]) -> list[dict]:
	"""Group room types into shareable site/property cards for the catalog."""
	locations = []
	seen = {}
	for rt in room_types:
		key = rt["location_slug"] or rt["location_name"] or "__property__"
		if key not in seen:
			cover = None
			for m in rt.get("media") or []:
				if m.get("url"):
					cover = m["url"]
					break
			seen[key] = {
				"name": rt["location_name"] or prop.property_name,
				"slug": rt["location_slug"] or None,
				"address": rt["location_address"] or prop.address_line,
				"google_maps_url": rt["google_maps_url"],
				"latitude": rt["latitude"] if rt["location_name"] else prop.get("latitude"),
				"longitude": rt["longitude"] if rt["location_name"] else prop.get("longitude"),
				"phone": prop.get("phone"),
				"cover_image": cover or prop.get("hero_image"),
				"city": prop.city,
				"state": prop.state,
				"room_types": [],
				"listing_count": 0,
				"from_rate": rt["base_price"],
			}
			locations.append(seen[key])
		seen[key]["room_types"].append(rt["name"])
		seen[key]["listing_count"] = len(seen[key]["room_types"])
		seen[key]["from_rate"] = min(seen[key]["from_rate"], rt["base_price"])
		if not seen[key].get("cover_image"):
			for m in rt.get("media") or []:
				if m.get("url"):
					seen[key]["cover_image"] = m["url"]
					break
		# Prefer a maps pin from any listing that has one.
		if not seen[key].get("google_maps_url") and rt.get("google_maps_url"):
			seen[key]["google_maps_url"] = rt["google_maps_url"]
		if seen[key].get("latitude") is None and rt.get("latitude") is not None:
			seen[key]["latitude"] = rt["latitude"]
			seen[key]["longitude"] = rt["longitude"]
	return locations


@frappe.whitelist(allow_guest=True)
def catalog_index(property_slug: str | None = None):
	"""Entry point for /book — how many properties, sites, or listings to show.

	Several properties live: mode "properties" lists them, and the guest
	picks one - /book?property=<slug> (or /stay/<slug>) calls back with
	that property's slug and gets its own sites / listings / catalog."""
	from izensphere_stay_and_dine.booking_slugs import property_for_slug

	if property_slug:
		chosen = property_for_slug(property_slug)
		if not chosen:
			frappe.throw("Property not found.", frappe.DoesNotExistError)
		properties = [frappe._dict(name=chosen)]
	else:
		properties = frappe.get_all(
			"Property",
			filters={"booking_engine_enabled": 1, "disabled": 0},
			fields=["name", "property_name", "page_slug", "city", "state",
			        "hero_image", "logo_url", "property_kind",
			        "showcase_description"],
			order_by="property_name asc",
		)
	if len(properties) > 1:
		for p in properties:
			p["property_slug"] = p.get("page_slug") or slugify(p["property_name"])
			p["description"] = p.pop("showcase_description", None)
			# a card needs a "from" price and a photo even when the
			# property never set a hero image
			p["from_rate"] = float(frappe.db.sql(
				"""SELECT MIN(base_price) FROM `tabRoom Type`
				WHERE property = %s AND disabled = 0""", p.name)[0][0] or 0)
			if not p.get("hero_image"):
				cover = frappe.db.sql(
					"""SELECT m.url FROM `tabRoom Type Media` m
					JOIN `tabRoom Type` rt ON rt.name = m.parent
					WHERE m.parenttype = 'Room Type' AND rt.property = %s
					  AND rt.disabled = 0 AND IFNULL(m.url, '') != ''
					ORDER BY rt.base_price, m.idx LIMIT 1""", p.name)
				p["hero_image"] = cover[0][0] if cover else None
		return {"mode": "properties", "properties": properties,
		        "ui_locale": _public_locale(properties[0].name)}

	property_name = properties[0].name if properties else default_property()
	prop = frappe.get_doc("Property", property_name)
	room_types = []
	for rt_name in frappe.get_all(
		"Room Type", filters={"property": property_name, "disabled": 0},
		pluck="name", order_by="base_price asc",
	):
		room_types.append(_room_type_payload(frappe.get_doc("Room Type", rt_name)))
	locations = _build_locations(prop, room_types)
	sites = [loc for loc in locations if loc.get("slug")]

	if len(sites) > 1:
		return {
			"mode": "sites",
			"property": property_name,
			"sites": sites,
			"ui_locale": _public_locale(property_name),
		}
	if len(room_types) == 1 and room_types[0].get("listing_slug"):
		return {
			"mode": "single_listing",
			"property": property_name,
			"listing_slug": room_types[0]["listing_slug"],
		}
	return {
		"mode": "catalog",
		"property": property_name,
		"listing_count": len(room_types),
		"ui_locale": _public_locale(property_name),
	}


@frappe.whitelist(allow_guest=True)
def resolve_slug(slug: str):
	"""Resolve /stay/:slug to a listing or multi-listing site."""
	return resolve_public_slug(slug)


@frappe.whitelist(allow_guest=True)
def site_info():
	"""Public site metadata for the login/boot screen.

	demo_mode is true only on the seeded demo site (seed_demo sets the
	`kamra_demo_mode` default), so a real install never advertises the
	demo login accounts. The running version is public on purpose: it is
	what a bug report and the login screen quote.
	"""
	from izensphere_stay_and_dine import __version__
	return {
		"demo_mode": frappe.db.get_default("kamra_demo_mode") == "1",
		"app": "Izensphere Stay and Dine",
		"version": __version__,
		# `bench --site <site> set-config kamra_channel nightly` labels a
		# channel build so it isn't mistaken for the last stable release;
		# kamra_build (a short commit id) is optional.
		"channel": (frappe.conf.get("kamra_channel") or "")[:20] or None,
		"build": (frappe.conf.get("kamra_build") or "")[:12] or None,
		**_brand(),
	}


def _brand() -> dict:
	"""A hotel's or partner's own name and logo, shown next to Kamra's
	(co-branding, as ERPNext does). Read from Frappe's own Website and Navbar
	Settings; Frappe's stock app name "Frappe" counts as not set."""
	name = (frappe.get_website_settings("app_name") or "").strip()
	logo = (frappe.get_website_settings("app_logo")
	        or frappe.db.get_single_value("Navbar Settings", "app_logo"))
	return {"brand_name": None if name in ("", "Frappe") else name,
	        "brand_logo": logo or None}


@frappe.whitelist(allow_guest=True)
def default_property():
	"""Which Property the public booking engine (``/book``) should show.

	Each Kamra deploy is single-tenant: one site = one hotel/villa. The
	frontend used to hardcode the demo property name, which only worked
	on the seeded demo site and broke the booking engine on every other
	tenant (``Property <name> not found`` / permission error for Guest).

	Picks the Property with booking_engine_enabled=1; if none are flagged
	(fresh install) or several are, falls back to the first Property so
	the page still renders instead of hanging on a guest permission error.
	"""
	enabled = frappe.get_all(
		"Property", filters={"booking_engine_enabled": 1}, pluck="name", limit=1,
	)
	if enabled:
		return enabled[0]
	any_property = frappe.get_all("Property", pluck="name", limit=1)
	if any_property:
		return any_property[0]
	frappe.throw("No property configured for this site.")
	raise  # frappe.throw always raises; CodeQL does not treat it as noreturn


def _public_locale(property: str) -> dict:
	from izensphere_stay_and_dine.localization import pack_for, privacy_terms
	prop = frappe.get_cached_doc("Property", property)
	pack = pack_for(property)
	loc = pack.locale(prop)
	# "" is a valid symbol (generic pack shows bare numbers)
	return {"currency_symbol": loc.get("currency_symbol") or "",
	        "locale": loc.get("locale") or "en",
	        "currency": loc.get("currency") or "",
	        "default_language": prop.get("booking_language") or None,
	        **privacy_terms(pack)}


@frappe.whitelist(allow_guest=True)
def showcase(property: str, listing_slug: str | None = None,
             location_slug: str | None = None):
	"""Everything the public booking page needs to render."""
	prop = frappe.get_doc("Property", property)
	if not prop.get("booking_engine_enabled"):
		frappe.throw("Online booking is not enabled for this property.")

	room_types = []
	for rt_name in frappe.get_all(
		"Room Type",
		filters=_room_type_filters(property, listing_slug, location_slug),
		pluck="name", order_by="base_price asc",
	):
		room_types.append(_room_type_payload(frappe.get_doc("Room Type", rt_name)))

	locations = _build_locations(prop, room_types)

	experiences = frappe.get_all(
		"Experience",
		filters={"property": property, "disabled": 0,
		         "show_on_booking_page": 1},
		fields=["name", "experience_name", "category", "price", "duration",
		        "description", "image_url", "gst_rate"],
		order_by="category asc",
	)

	meal_plans = frappe.get_all(
		"Meal Plan", filters={"property": property, "disabled": 0},
		fields=["name", "code", "label", "price_per_adult"],
		order_by="price_per_adult asc",
	)

	return {
		"ui_locale": _public_locale(property),
		"property": _property_payload(prop),
		"room_types": room_types,
		"locations": locations,
		"meal_plans": meal_plans,
		"experiences": experiences,
		"scope": {
			"listing_slug": listing_slug,
			"location_slug": location_slug,
		},
	}


@frappe.whitelist(allow_guest=True)
def search_stay(property: str, check_in_date: str, check_out_date: str,
                adults: int = 2, children: int = 0,
                listing_slug: str | None = None,
                location_slug: str | None = None, pets: int = 0,
                child_ages=None, voucher_code: str | None = None):
	"""Availability + real quoted price per room type for the stay.

	Each available row also carries `plans`: the stay quoted room only
	(first) and with each meal plan, so the page lists real totals per plan. A valid
	`voucher_code` discounts every quote, and each plan then keeps its
	undiscounted `list_amount` for the strike-through; an invalid one is
	ignored here (check_voucher tells the guest why).

	`child_ages` (e.g. [3, 8, 13]) lets each room type's age bands decide who
	is free, a child or an adult; without it `children` are all children.
	Each row says whether the room type can take the party: `available`, a
	`reason` when it cannot, and `needs_confirmation` when the party is above
	what it sleeps but within the extra guests it allows by arrangement."""
	# available_rooms is staff-only (@require_roles) since it's also an
	# MCP / Kamra Agent tool; guests need the same availability math without
	# role gate, so this calls the same underlying helpers directly.
	from izensphere_stay_and_dine.api import _available_rooms_raw, _block_hold
	from izensphere_stay_and_dine.pricing import capacity_overflow, quote
	from izensphere_stay_and_dine.siu.availability import has_active_sius, sellable_count

	nights = date_diff(check_out_date, check_in_date)
	if nights < 1:
		frappe.throw("Check-out must be after check-in.")
	if nights > 30:
		frappe.throw("Stays longer than 30 nights: please contact the hotel.")
	ages = _child_ages(child_ages)
	_party(None, adults, children, None)  # at least one adult, before any work

	prop = frappe.get_cached_doc("Property", property)
	voucher = _usable_voucher(property, voucher_code, nights)
	# the first plan is the room-only price: a free plan (EP) when the
	# property has one, else no meal plan at all
	mps = frappe.get_all(
		"Meal Plan", filters={"property": property, "disabled": 0},
		fields=["name", "price_per_adult", "price_per_child"],
		order_by="price_per_adult asc")
	free = [m.name for m in mps if not (m.price_per_adult or m.price_per_child)]
	meal_plans = [free[0] if free else ""] + [m.name for m in mps if m.name not in free]
	results = []
	for rt in frappe.get_all(
		"Room Type",
		filters=_room_type_filters(property, listing_slug, location_slug),
		pluck="name", order_by="base_price asc",
	):
		hold = _block_hold(property, rt, check_in_date, check_out_date)
		if has_active_sius(property, rt):
			left = max(0, sellable_count(
				property, rt, check_in_date, check_out_date) - (hold or 0))
		else:
			free = _available_rooms_raw(
				property, rt, check_in_date, check_out_date)
			if hold:
				free = free[:max(0, len(free) - hold)]
			left = len(free)
		rtd = frappe.get_cached_doc("Room Type", rt)
		a, c, infants = _party(rtd, adults, children, ages)
		above, beds = capacity_overflow(rtd, a, c)
		row = {"room_type": rt, "rooms_left": left, "quote": None,
		       "available": bool(left), "adults": a, "children": c,
		       "infants": infants}
		if above > beds:
			row.update(available=False, reason=TOO_MANY_GUESTS)
			results.append(row)
			continue
		if above:
			row.update(needs_confirmation=True,
			           confirmation_reason=_over_capacity_note(above))
		if left:
			try:
				plans = []
				for mp in meal_plans:
					pq = quote(property, rt, check_in_date, check_out_date,
					           a, c, mp or None, voucher_code=voucher,
					           pets=int(pets or 0))
					plan = {"meal_plan": mp, "amount_after_tax": pq["amount_after_tax"],
					        **_payment_split(prop, pq["amount_after_tax"],
					                         pq.get("stay_rules"))}
					if voucher:
						plan["list_amount"] = quote(
							property, rt, check_in_date, check_out_date, a, c,
							mp or None, pets=int(pets or 0))["amount_after_tax"]
					if not plans:
						q = pq
					plans.append(plan)
				rules = q.get("stay_rules") or {}
				q.update(_payment_split(prop, q.get("amount_after_tax"), rules))
				row["quote"] = q
				row["plans"] = plans
				need = max(int(rules.get("minimum_nights") or 0),
				           int(prop.get("minimum_nights") or 1))
				if nights < need:
					row.update(available=False, reason=(
						f"These dates need a stay of at least {need} nights"
						+ (f" ({rules['season']})." if rules.get("season") else ".")))
			except Exception:
				pass  # still list the room type even if this date range cannot be quoted
		results.append(row)
	return results


def _usable_voucher(property: str, code: str | None, nights: int) -> str | None:
	"""The code when it is valid for this stay, else None."""
	if not (code or "").strip():
		return None
	from izensphere_stay_and_dine.pricing import validate_voucher
	try:
		validate_voucher(property, code, nights)
	except frappe.ValidationError:
		return None
	return code.strip()


def _res_by_token(token: str):
	if not token or len(token) < 20:
		frappe.throw("Invalid link.")
	name = frappe.db.get_value("Reservation", {"precheckin_token": token})
	if not name:
		frappe.throw("This check-in link is not valid anymore.")
	return frappe.get_doc("Reservation", name)


@frappe.whitelist(allow_guest=True)
def precheckin_info(token: str):
	"""Stay summary for the pre-arrival check-in page."""
	res = _res_by_token(token)
	if res.status not in ("Confirmed", "Checked In", "Pending Payment", "Requested"):
		frappe.throw("This booking is no longer active.")
	prop = frappe.get_doc("Property", res.property)
	guest = frappe.get_doc("Guest", res.guest)
	from izensphere_stay_and_dine.localization import front_desk_vocabulary, pack_for
	vocab = front_desk_vocabulary(pack_for(res.property))
	return {
		"ui_locale": _public_locale(res.property),
		# which IDs this country accepts, and the likely nationality
		"id_types": vocab["id_types"],
		"id_type_hints": vocab["id_type_hints"],
		"default_nationality": vocab["default_nationality"],
		"property": {
			"property_name": prop.property_name,
			"logo_url": prop.get("logo_url"),
			"city": prop.city,
			"checkin_time": str(prop.checkin_time or ""),
			"phone": prop.phone,
			"house_rules": prop.get("house_rules"),
			"pets_policy": prop.get("pets_policy"),
			"children_policy": prop.get("children_policy"),
			"extra_bed_policy": prop.get("extra_bed_policy"),
			# drives what the guest is promised about their ID photo; the
			# page must not claim "deleted at checkout" under Store mode
			"id_retention": prop.get("id_retention") or "Store",
			"privacy_contact": prop.get("privacy_contact") or prop.get("email") or prop.phone,
			"guest_retention_months": prop.get("guest_retention_months") or 0,
		},
		"stay": {
			"reservation": res.name,
			"room_type": res.room_type.split("-")[-1],
			"check_in_date": str(res.check_in_date),
			"check_out_date": str(res.check_out_date),
			"nights": res.nights,
			"adults": res.adults,
			"children": res.children,
			"status": res.precheckin_status,
		},
		"guest": {
			"full_name": guest.full_name,
			"phone": guest.phone,
			"email": guest.email,
			"id_type": guest.id_type,
			"has_id_file": bool(guest.get("id_file")),
			"has_address_file": bool(guest.get("address_proof_file")),
			"nationality": guest.nationality,
			# a boolean, never a URL: Frappe refuses a Guest session any
			# private file, so the guest cannot see their own scan back and a
			# read-back endpoint would only be a brute-force oracle for the
			# token. "We have it" is all the page needs to say.
			"has_id_document": bool(res.get("id_document")),
			"id_document_on": str(res.get("id_document_on") or ""),
		},
		# the others staying, as named at booking: name and age only - their
		# ID details are never sent back to the link. A row the desk has
		# confirmed (an age or an ID) is locked: the guest cannot change it.
		"occupants": [{"row": o.name, "full_name": o.full_name,
		               "age": o.age or o.get("guest_stated_age") or None,
		               "has_id": bool(o.id_number or o.get("id_file")),
		               "locked": bool(o.age or o.id_number or o.get("id_file"))}
		              for o in res.get("occupants") or []],
	}


def _merge_precheckin_occupants(res, rows) -> None:
	"""The people staying with the guest, from the pre-check-in page. The
	list is the guest's own: a row left out is removed, and a row sent back
	is edited in place. Only rows the desk has not confirmed can change.

	An age from this page is only what the guest says: it goes in
	guest_stated_age, never in `age`, because `age` decides who stays free
	and the price must not move on an unverified word. The desk confirms it
	at check-in. A child's ID is not kept unless the register needs it."""
	from izensphere_stay_and_dine.localization import is_minor, minor_id_kept, pack_for, validate_id_type
	if isinstance(rows, str):
		rows = frappe.parse_json(rows) if rows.strip() else []

	def locked(row) -> bool:
		return bool(row.age or row.id_number or row.get("id_file"))

	doc = frappe.get_doc("Reservation", res.name)
	pack = pack_for(doc.property)
	default_nat = getattr(pack, "DEFAULT_NATIONALITY", "")
	by_row = {o.name: o for o in doc.get("occupants") or []}
	by_name = {(o.full_name or "").strip().lower(): o for o in doc.get("occupants") or []}
	kept = set()
	for o in (rows or [])[:20]:
		name = str(o.get("full_name") or "").strip()[:140]
		if not name or name.lower() == (doc.guest_name or "").strip().lower():
			continue
		# a blank or 0 age is not given (a baby's age is entered as 1)
		age = cint(o.get("age")) or None
		if age is not None and not 0 < age <= 120:
			age = None
		id_type = str(o.get("id_type") or "").strip()[:60]
		id_number = str(o.get("id_number") or "").strip()[:40]
		if is_minor(pack, age) and not minor_id_kept(pack, default_nat):
			id_type = id_number = ""
		if id_type and id_number:
			validate_id_type(doc.property, id_type)
		else:
			id_type = id_number = ""
		row = by_row.get(o.get("row")) or by_name.get(name.lower())
		if row is None:
			row = doc.append("occupants", {"full_name": name, "nationality": default_nat})
			by_name[name.lower()] = row
		elif not locked(row):
			row.full_name = name
		kept.add(id(row))
		if not row.age and age is not None:
			row.guest_stated_age = age
		if id_number and not row.id_number:
			row.id_type, row.id_number = id_type, id_number
	for row in list(doc.get("occupants") or []):
		if id(row) not in kept and not locked(row):
			doc.remove(row)
	doc.save(ignore_permissions=True)


def _save_id_image(guest: str, data_url: str,
                   field: str = "id_file") -> str | None:
	"""Store a guest document (ID or address proof) as a PRIVATE file
	attached to their profile (upload or camera capture). Replaces any
	earlier copy in the same slot; deleted at checkout under
	Verify & Discard."""
	import base64
	import re as _re
	m = _re.match(r"^data:image/(jpeg|jpg|png|webp);base64,(.+)$",
	              data_url or "", _re.S)
	if not m:
		frappe.throw("The ID photo must be a JPEG, PNG or WebP image.")
	if len(m.group(2)) > 8_000_000:  # ~6 MB decoded
		frappe.throw("The ID photo is too large - please retake it.")
	content = base64.b64decode(m.group(2))
	# replace, never accumulate: one current ID document per guest
	for f in frappe.get_all("File", filters={
			"attached_to_doctype": "Guest", "attached_to_name": guest,
			"attached_to_field": field}, pluck="name"):
		frappe.delete_doc("File", f, force=True, ignore_permissions=True)
	ext = "jpg" if m.group(1) in ("jpeg", "jpg") else m.group(1)
	fdoc = frappe.get_doc({
		"doctype": "File",
		"file_name": f"{'address' if field == 'address_proof_file' else 'id'}-{guest}.{ext}",
		"attached_to_doctype": "Guest",
		"attached_to_name": guest,
		"attached_to_field": field,
		"is_private": 1,
		"content": content,
	}).insert(ignore_permissions=True)
	return fdoc.file_url


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=20, seconds=3600)
def precheckin_submit(token: str, id_type: str, id_number: str,
                      email: str = "", nationality: str = "",
                      address_line: str = "", city: str = "",
                      eta: str = "", special_requests: str = "",
                      signature: str = "", consent: int = 0,
                      id_image: str = "", address_image: str = "",
                      occupants: str = ""):
	"""Guest completes pre-arrival check-in and signs the registration card
	(PRD FR-20 - details + declaration + e-signature; the signed card becomes
	the paperless GRC the desk views at arrival). The guest can attach a
	photo of their ID - camera capture or upload - stored privately."""
	if not id_type or not id_number.strip():
		frappe.throw("ID type and number are required.")
	res = _res_by_token(token)
	if res.precheckin_status == "Verified":
		frappe.throw("Check-in details were already verified by the desk.")
	if id_type != frappe.db.get_value("Guest", res.guest, "id_type"):
		from izensphere_stay_and_dine.localization import validate_id_type
		validate_id_type(res.property, id_type)

	# a signed card requires the declaration to be accepted
	signed = bool(signature and str(signature).startswith("data:image"))
	if signed and not int(consent or 0):
		frappe.throw("Please accept the registration declaration to sign.")

	id_file = _save_id_image(res.guest, id_image) if id_image else None
	addr_file = (_save_id_image(res.guest, address_image,
	                            "address_proof_file")
	             if address_image else None)
	frappe.db.set_value("Guest", res.guest, {
		"id_type": id_type,
		"id_number": id_number.strip(),
		"email": email or None,
		"nationality": nationality or None,
		"address_line": address_line or None,
		"city": city or None,
		**({"id_file": id_file} if id_file else {}),
		**({"address_proof_file": addr_file} if addr_file else {}),
	})
	frappe.db.set_value("Reservation", res.name, {
		"precheckin_status": "Submitted",
		"precheckin_on": frappe.utils.now_datetime(),
		"eta": eta or None,
		"special_requests": special_requests or res.special_requests,
		"precheckin_signature": signature if signed else None,
		"precheckin_consent": 1 if int(consent or 0) else 0,
	})
	if occupants:
		_merge_precheckin_occupants(res, occupants)

	from izensphere_stay_and_dine.savings import log_action
	log_action(
		action_type="self_checkin",
		reference_doctype="Reservation",
		reference_name=res.name,
		property=res.property,
		minutes_saved=8,
		rationale="Guest completed pre-arrival check-in online",
		agent_name="Self Check-in",
		channel="API",
	)
	frappe.db.commit()  # nosemgrep: frappe-manual-commit -- persists the completed operation before returning to an external/public caller; reviewed as intentional
	return {"ok": True, "reservation": res.name}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=3600)
def precheckin_upload_id(token: str, data: str):
	"""The guest photographs their ID during pre-arrival check-in.

	Deliberately NOT Frappe's upload_file. That endpoint would need the
	site-wide `allow_guests_to_upload_files` setting, which opens
	unauthenticated upload to the whole site; on its guest branch it sets
	ignore_permissions and never sees a token, so it cannot tell whether this
	guest owns this booking; and it takes is_private from the client - i.e.
	it trusts the browser to protect an Aadhaar scan. Here the token is the
	gate, the rate limit is real, and privacy is not negotiable.

	Optional by design: nothing downstream requires a document. A guest with
	a cracked camera or a bad lobby connection must still be able to
	pre-register, so the submit gate never mentions this.
	"""
	from izensphere_stay_and_dine.id_documents import store_id_document

	res = _res_by_token(token)
	if res.precheckin_status == "Verified":
		frappe.throw("The desk has already verified your check-in details.")

	with act_as(GUEST_AGENT):
		# owning the File as the agent matters: File.has_permission short-
		# circuits True for doc.owner, so a human owner would hand that
		# person a way in that skips the booking's own permission check
		store_id_document(res, data, source="Guest")

	from izensphere_stay_and_dine.savings import log_action
	log_action(
		action_type="id_document_upload",
		reference_doctype="Reservation",
		reference_name=res.name,
		property=res.property,
		minutes_saved=3,
		rationale="Guest uploaded their ID photo at self check-in",
		agent_name="Self Check-in",
		channel="API",
	)
	frappe.db.commit()  # nosemgrep: frappe-manual-commit -- persists the completed operation before returning to an external/public caller; reviewed as intentional
	return {"ok": True}


# The governed writer: guest-initiated actions are always written as this user
# so a guest can never post directly.
GUEST_AGENT = AGENT_EMAIL


@frappe.whitelist(allow_guest=True)
def laundry_info(token: str):
	"""Laundry price list + stay context for the in-stay guest page.
	Read-only — the guest sees what things cost, never a folio."""
	res = _res_by_token(token)
	if res.status != "Checked In":
		frappe.throw("Laundry pickup is available once you're checked in.")
	guest = frappe.get_doc("Guest", res.guest)
	rates = frappe.get_all(
		"Laundry Rate",
		filters={"property": res.property, "disabled": 0},
		fields=["item_name", "service_type", "rate", "express_rate"],
		order_by="item_name asc, service_type asc",
	)
	from izensphere_stay_and_dine.laundry import express_multiplier
	for r in rates:
		r["express_rate"] = r["express_rate"] or round(
			(r["rate"] or 0) * express_multiplier(res.property), 0)
	# is there already an open pickup for this room? (so the page can say so)
	pending = frappe.db.exists(
		"Laundry Order",
		{"room": res.room, "status": ["in", ["Requested", "Collected",
		                                     "In Process", "Ready"]]})
	return {
		"reservation": res.name,
		"room": res.room,
		"room_no": (res.room or "").split("-")[-1],
		"guest_name": guest.full_name,
		"property": res.property,
		"rates": rates,
		"has_open_order": bool(pending),
	}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=3600)
def request_guest_laundry(token: str, notes: str = "", express: int = 0):
	"""In-house guest asks housekeeping to pick their laundry up. Written on
	the guest's behalf by the governed agent — the guest never touches pricing
	or the folio; staff count and price the bag at the door (status
	'Requested', exactly where a staff-logged pickup lands)."""
	res = _res_by_token(token)
	if res.status != "Checked In":
		frappe.throw("Laundry pickup is available once you're checked in.")
	# don't stack duplicate open requests for the same room
	existing = frappe.db.exists(
		"Laundry Order", {"room": res.room, "status": "Requested"})
	if existing:
		return {"ok": True, "order": existing, "already": True}

	with act_as(GUEST_AGENT):
		doc = frappe.get_doc({
			"doctype": "Laundry Order",
			"property": res.property,
			"room": res.room,
			"reservation": res.name,
			"status": "Requested",
			"express": 1 if int(express or 0) else 0,
			"notes": (notes or "").strip()[:200] or None,
		})
		doc.insert()

	from izensphere_stay_and_dine.savings import log_action
	log_action(
		action_type="guest_laundry_request",
		reference_doctype="Laundry Order",
		reference_name=doc.name,
		property=res.property,
		rationale=f"Guest requested laundry pickup for {res.room}",
		agent_name="Guest Self-Service",
		channel="API",
	)
	frappe.db.commit()  # nosemgrep: frappe-manual-commit -- persists the completed operation before returning to an external/public caller; reviewed as intentional
	return {"ok": True, "order": doc.name}


TOO_MANY_GUESTS = "The property cannot accommodate the number of people requested."


def _child_ages(child_ages) -> list[int] | None:
	"""Ages from the request - a list, a JSON list or "3,8,13". None when the
	caller sent only a children count."""
	if child_ages in (None, "", []):
		return None
	if isinstance(child_ages, str):
		raw = child_ages.strip()
		child_ages = frappe.parse_json(raw) if raw.startswith("[") else raw.split(",")
	ages = []
	for a in child_ages:
		if str(a).strip() == "":
			continue
		age = cint(a)
		if age < 0 or age > 17:
			frappe.throw("Child ages must be between 0 and 17.")
		ages.append(age)
	return ages


def _party(rt_doc, adults, children, ages) -> tuple[int, int, int]:
	"""(adults, children, infants) for this room type: with ages, its own age
	bands decide; with only a count, every child is a child."""
	from izensphere_stay_and_dine.pricing import party_by_age

	if cint(adults) < 1:
		frappe.throw("At least one adult is required.")
	if ages is None:
		return cint(adults), cint(children), 0
	return party_by_age(rt_doc, cint(adults), ages)


def _over_capacity_note(above: int) -> str:
	return (f"{above} guest{'s' if above != 1 else ''} above what it sleeps: "
	        "possible only if the group is happy to share beds. The property "
	        "confirms the arrangement and the price for them.")


def _advance_terms(prop, total: float, rules: dict | None = None) -> tuple[float, str]:
	"""What the guest pays online now, and a human label - computed from the
	property's CURRENT booking-payment policy. Snapshotted onto the booking so
	a later policy change never re-bills an existing guest. A season marked
	full payment (holidays, December) takes the whole amount whatever the
	usual advance; a season with its own advance % (25, 50) asks that % for
	these dates. `rules` is the quote's stay_rules."""
	rules = rules or {}
	mode = prop.get("booking_payment_mode") or "Pay at hotel"
	total = float(total or 0)
	sym = _public_locale(prop.name).get("currency_symbol", "") if prop.get("name") else ""
	season_pct = float(rules.get("advance_percent") or 0)
	if rules.get("full_payment") and mode != "Pay at hotel":
		return total, f"Full payment ({sym}{total:,.0f}) on booking for these dates"
	if mode == "Advance percent" or (season_pct and mode != "Pay at hotel"):
		pct = season_pct or float(prop.get("advance_percent") or 0)
		due = round(total * pct / 100, 2)
		return due, f"{pct:g}% advance ({sym}{due:,.0f}) now, rest at the hotel"
	if mode == "Registration fee":
		due = min(float(prop.get("registration_fee") or 0), total)
		return due, f"{sym}{due:,.0f} registration fee now, rest at the hotel"
	if mode == "Full online":
		return total, "Full amount paid online"
	return 0.0, "Pay at the hotel"


def _payment_split(prop, total: float, rules: dict | None = None) -> dict:
	"""Server-computed split the booking page shows: what is due now and
	what is left to pay at the hotel. The browser never derives these."""
	total = float(total or 0)
	due, policy = _advance_terms(prop, total, rules)
	return {
		"advance_due": due,
		"balance_at_hotel": round(max(0.0, total - due), 2),
		"payment_policy": policy,
	}


@frappe.whitelist(allow_guest=True)
def customer_register(full_name: str, email: str, password: str, phone: str = ""):
	"""Register a new customer account, create or link Guest/Customer records,
	and authenticate the session.
	"""
	email = (email or "").strip().lower()
	full_name = (full_name or "").strip()
	phone = (phone or "").strip()
	password = (password or "").strip()

	if not email or "@" not in email:
		frappe.throw("A valid email address is required.")
	if not full_name:
		frappe.throw("Full name is required.")
	if len(password) < 6:
		frappe.throw("Password must be at least 6 characters.")
	if frappe.db.exists("User", email):
		frappe.throw("An account with this email already exists. Please sign in.")

	parts = full_name.split(" ", 1)
	first_name = parts[0]
	last_name = parts[1] if len(parts) > 1 else ""

	user = frappe.get_doc({
		"doctype": "User",
		"email": email,
		"first_name": first_name,
		"last_name": last_name,
		"full_name": full_name,
		"phone": phone,
		"enabled": 1,
		"new_password": password,
		"user_type": "Website User",
		"send_welcome_email": 0,
		"roles": [{"doctype": "Has Role", "role": "Customer"}],
	})
	user.flags.ignore_password_policy = True
	user.insert(ignore_permissions=True)

	# Create or link Guest
	guest_name = frappe.db.get_value("Guest", {"email": email})
	if not guest_name and phone:
		guest_name = frappe.db.get_value("Guest", {"phone": phone})
	if not guest_name:
		guest = frappe.get_doc({
			"doctype": "Guest",
			"first_name": first_name,
			"last_name": last_name,
			"full_name": full_name,
			"email": email,
			"phone": phone,
		}).insert(ignore_permissions=True)
		guest_name = guest.name
	else:
		frappe.db.set_value("Guest", guest_name, {
			"full_name": full_name,
			"email": email,
			"phone": phone or frappe.db.get_value("Guest", guest_name, "phone"),
		})

	# If ERPNext Customer exists, ensure Customer record exists
	if frappe.db.exists("DocType", "Customer"):
		cust_name = frappe.db.get_value("Customer", {"email_id": email})
		if not cust_name:
			try:
				frappe.get_doc({
					"doctype": "Customer",
					"customer_name": full_name,
					"customer_type": "Individual",
					"email_id": email,
					"mobile_no": phone,
				}).insert(ignore_permissions=True)
			except Exception:
				pass

	frappe.db.commit()

	if getattr(frappe.local, "request", None):
		try:
			from frappe.auth import LoginManager
			login_manager = LoginManager()
			login_manager.login_as(user.name)
		except Exception:
			pass

	return {
		"success": True,
		"user": user.name,
		"full_name": full_name,
		"email": email,
		"phone": phone,
	}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=3600)
def book(property: str, room_type: str, check_in_date: str,
         check_out_date: str, guest_name: str, phone: str,
         email: str = "", adults: int = 2, children: int = 0,
         meal_plan: str = "", special_requests: str = "", addons=None,
         voucher_code: str = "", idempotency_key: str = "", pets: int = 0,
         child_ages=None, marketing_consent: int = 0):
	"""Create a Website booking. Guest identity is the phone number; staff
	verify at check-in. The advance owed is computed from the property's
	current payment policy and snapshotted onto the booking.

	Instant mode (default): Confirmed when nothing is due now, else
	Pending Payment with a hold window. Request to Book: Requested (no
	inventory) until the host approves. A party above what the room sleeps,
	within the extra guests it allows, is also Requested: the host confirms
	the sleeping arrangement and agrees the price for them.
	"""
	if frappe.session.user == "Guest":
		frappe.throw(
			"Login is required to complete a booking. Please sign in or create an account.",
			frappe.PermissionError,
		)

	if not guest_name.strip() or not phone.strip():
		frappe.throw("Name and phone are required.")

	customer_user = frappe.session.user

	with act_as(GUEST_AGENT):
		if not frappe.db.exists("Property", property):
			from izensphere_stay_and_dine.booking_slugs import property_for_slug
			resolved_p = property_for_slug(property)
			if resolved_p and frappe.db.exists("Property", resolved_p):
				property = resolved_p

		if not frappe.db.exists("Room Type", room_type):
			resolved_rt = frappe.db.get_value(
				"Room Type", {"listing_slug": room_type, "disabled": 0}, "name"
			)
			if not resolved_rt:
				resolved_rt = frappe.db.get_value(
					"Room Type", {"room_type_name": room_type, "disabled": 0}, "name"
				)
			if resolved_rt:
				room_type = resolved_rt

		from izensphere_stay_and_dine.pricing import capacity_overflow

		prop = frappe.get_cached_doc("Property", property)
		rtd = frappe.get_cached_doc("Room Type", room_type)
		adults, children, infants = _party(rtd, adults, children, _child_ages(child_ages))
		above, beds = capacity_overflow(rtd, adults, children)
		if above > beds:
			frappe.throw(TOO_MANY_GUESTS)

		# a guest may only add experiences the hotel actually publishes for this
		# property - never a private, disabled or another property's experience,
		# and always at the hotel's own price (qty is all the guest controls)
		if isinstance(addons, str):
			addons = frappe.parse_json(addons)
		public_ids = set(frappe.get_all(
			"Experience",
			filters={"property": property, "disabled": 0, "show_on_booking_page": 1},
			pluck="name",
		))
		safe_addons = [
			{"experience": a["experience"], "qty": max(1, int(a.get("qty") or 1))}
			for a in (addons or [])
			if a.get("experience") in public_ids
		]

		from izensphere_stay_and_dine.api import create_booking
		from izensphere_stay_and_dine.pricing import quote as price_quote
		from izensphere_stay_and_dine.reservation_state import resolve_instant_status

		mode = getattr(prop, "booking_mode", None) or "Instant"
		hold_minutes = cint(getattr(prop, "hold_minutes", None) or 120)
		key = (idempotency_key or "").strip() or None

		# Peek at payment terms before insert so Instant can choose status.
		q = price_quote(
			property, room_type, check_in_date, check_out_date,
			int(adults), int(children), meal_plan or None,
			voucher_code=voucher_code or None, pets=int(pets or 0),
		)
		stay_rules = q.get("stay_rules") or {}
		advance_due, policy = _advance_terms(
			prop, float(q["amount_after_tax"] or 0), stay_rules)

		status = None
		hold_expires_on = None
		assign_room = 1
		if mode == "Request to Book" or above:
			status = "Requested"
			assign_room = 0
		else:
			status, hold_expires_on = resolve_instant_status(
				advance_due=advance_due, hold_minutes=hold_minutes,
			)

		result = create_booking(
			property=property,
			room_type=room_type,
			check_in_date=check_in_date,
			check_out_date=check_out_date,
			guest_name=guest_name,
			phone=phone,
			adults=adults,
			# infants are on the booking but free and take no bed
			children=children + infants,
			stay_details={"infants": infants} if infants else None,
			over_capacity_guests=above,
			over_capacity_reason=(
				f"Booked online for {above} above capacity - the property "
				"confirms the sleeping arrangement and price") if above else None,
			pets=int(pets or 0),
			meal_plan=meal_plan or None,
			voucher_code=voucher_code or None,
			source="Website",
			addons=safe_addons or None,
			assign_room=assign_room,
			status=status,
			idempotency_key=key,
			hold_expires_on=str(hold_expires_on) if hold_expires_on else None,
		)
		# snapshot the advance owed from the policy in force RIGHT NOW, so a
		# later change to the property's payment config never re-bills this guest
		total = float(result["amount_after_tax"] or 0)
		# Recompute against the saved total (voucher / engine may differ).
		advance_due, policy = _advance_terms(prop, total, stay_rules)
		updates = {
			"advance_due": advance_due,
			"payment_policy": policy,
			"is_pay_at_hotel": 1 if advance_due < total else 0,
		}
		if special_requests:
			updates["special_requests"] = special_requests
		# Instant + pay-at-hotel: if pre-insert peek overestimated advance,
		# promote Pending Payment → Confirmed.
		if (
			mode == "Instant"
			and not result.get("idempotent_replay")
			and result.get("status") == "Pending Payment"
			and advance_due <= 0
		):
			frappe.flags.kamra_status_transition = True
			try:
				updates["status"] = "Confirmed"
				updates["hold_expires_on"] = None
			finally:
				frappe.flags.kamra_status_transition = False
		frappe.db.set_value("Reservation", result["reservation"], updates)
		frappe.db.set_value("Reservation", result["reservation"], "owner", customer_user)
		user_email = frappe.db.get_value("User", customer_user, "email") or customer_user
		effective_email = email or user_email
		if effective_email:
			frappe.db.set_value("Guest", result["guest"], "email", effective_email)
		if frappe.db.exists("DocType", "Customer"):
			cust_name = frappe.db.get_value("Customer", {"email_id": effective_email})
			if not cust_name and guest_name:
				try:
					frappe.get_doc({
						"doctype": "Customer",
						"customer_name": guest_name,
						"customer_type": "Individual",
						"email_id": effective_email,
						"mobile_no": phone,
					}).insert(ignore_permissions=True)
				except Exception:
					pass
		if cint(marketing_consent):
			# the guest ticked the (unticked by default) offers box
			from izensphere_stay_and_dine.privacy import set_marketing_consent
			set_marketing_consent(result["guest"], 1, "Booking Page", property)
		frappe.db.commit()  # nosemgrep: frappe-manual-commit -- persists the completed operation before returning to an external/public caller; reviewed as intentional

	final_status = frappe.db.get_value(
		"Reservation", result["reservation"], "status")
	precheckin_token = frappe.db.get_value("Reservation", result["reservation"], "precheckin_token") or ""
	return {
		"reservation": result["reservation"],
		"precheckin_token": precheckin_token,
		"amount_after_tax": result["amount_after_tax"],
		"advance_due": advance_due,
		"balance_at_hotel": round(
			max(0.0, float(result["amount_after_tax"] or 0) - advance_due), 2),
		"payment_policy": policy,
		"pay_at_hotel": advance_due <= 0,
		"status": final_status,
		"needs_confirmation": bool(above),
		"confirmation_reason": _over_capacity_note(above) if above else None,
		"is_holiday": bool(q.get("is_holiday")),
		"idempotent_replay": int(result.get("idempotent_replay") or 0),
		"cleaning_fee": float(
			frappe.db.get_value("Property", property, "cleaning_fee") or 0
		),
		"security_deposit_amount": float(
			frappe.db.get_value("Property", property, "security_deposit_amount") or 0
		),
	}


@frappe.whitelist(allow_guest=True)
def access_info(token: str):
	"""Guest access instructions when gates pass (precheckin token)."""
	from izensphere_stay_and_dine.access import guest_access_info
	return guest_access_info(token)


@frappe.whitelist(allow_guest=True)
def check_voucher(property: str, code: str, nights: int = 1):
	"""Live promo-code feedback on the booking page. Never throws - returns
	{ok, message, discount_type, value} so the guest sees a friendly note."""
	from izensphere_stay_and_dine.pricing import validate_voucher
	code = (code or "").strip()
	if not code:
		return {"ok": False, "message": "Enter a code."}
	try:
		v = validate_voucher(property, code, int(nights or 1))
	except Exception as e:
		return {"ok": False, "message": str(e)}
	from izensphere_stay_and_dine.localization import money_text
	label = (f"{v.value:g}% off" if v.discount_type == "Percent"
	         else f"{money_text(property, round(v.value))} off")
	return {"ok": True, "message": f"'{v.voucher_code}' applied - {label}.",
	        "discount_type": v.discount_type, "value": float(v.value)}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=3600)
def hosting_enquiry(full_name: str, email: str, phone: str = "",
                    property_name: str = "", rooms: int = 0, city: str = "",
                    message: str = "", country: str = "",
                    interest: str = ""):
	"""Hosting / implementation enquiry from kamrapms.com. Stored first (a lead is
	never lost even without SMTP), then a best-effort email to the team.

	Leads are System Manager–only and purged after
	``hosting_enquiry_retention_months`` (default 24) unless status is Won.
	"""
	if not (full_name or "").strip() or not (email or "").strip():
		frappe.throw("Name and email are required.")
	doc = frappe.get_doc({
		"doctype": "Hosting Enquiry",
		"full_name": full_name.strip()[:140],
		"email": email.strip()[:140],
		"phone": (phone or "").strip()[:40] or None,
		"property_name": (property_name or "").strip()[:140] or None,
		"rooms": int(rooms or 0),
		"city": (city or "").strip()[:80] or None,
		"country": (country or "").strip()[:80] or None,
		"interest": (interest or "").strip()[:40]
		            if (interest or "").strip() in
		            ("Hosting", "Implementation", "Support AMC", "Partnership")
		            else None,
		"message": (message or "").strip()[:2000] or None,
		"status": "New",
	})
	doc.insert(ignore_permissions=True)
	frappe.db.commit()  # nosemgrep: frappe-manual-commit -- persists the completed operation before returning to an external/public caller; reviewed as intentional
	try:
		frappe.sendmail(
			recipients=["hello@kamrapms.com"],
			subject=f"Kamra {doc.interest or 'Cloud'} enquiry: {doc.full_name}"
			        + (f" ({doc.property_name})" if doc.property_name else ""),
			message=(
				f"<p><b>{doc.full_name}</b> &lt;{doc.email}&gt;"
				+ (f" · {doc.phone}" if doc.phone else "") + "</p>"
				+ (f"<p>Property: {doc.property_name}"
				   + (f", {doc.rooms} rooms" if doc.rooms else "")
				   + (f", {doc.city}" if doc.city else "") + "</p>"
				   if doc.property_name else "")
				+ (f"<p>{doc.message}</p>" if doc.message else "")
				+ f"<p>Ref: {doc.name}</p>"
			),
		)
	except Exception:
		pass  # no SMTP yet - the enquiry is already saved
	return {"ok": True,
	        "message": "Thanks - we'll get back to you within a day."}


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=20, seconds=300)
def lookup_booking(reference: str = "", phone: str = "", token: str = ""):
	"""Public endpoint for guest stay portal: look up reservation securely.

	Security rules:
	1. Unauthenticated (Guest) users MUST supply:
	   - Either a valid cryptographic token (length >= 20), OR
	   - BOTH reference (e.g. RES-2026-00030) AND the matching phone number used when booking.
	   Searching by phone alone or reference alone without phone verification is strictly
	   forbidden for guest users to prevent enumeration of sequential IDs or phone numbers.
	2. Authenticated staff with front desk or administrative roles may search by reference or phone.
	"""
	ref = (reference or "").strip()
	ph = (phone or "").strip()
	tok = (token or "").strip()
	is_staff = frappe.session.user != "Guest" and any(
		r in ("Front Desk", "Hotel Admin", "System Manager", "Administrator", "Kamra Agent")
		for r in frappe.get_roles()
	)

	if not is_staff:
		if tok:
			if len(tok) < 20:
				frappe.throw("Invalid booking token.")
		elif not ref or not ph:
			frappe.throw("Please enter both your Booking Reference and the Phone Number used during booking.")

	def _digits(s: str) -> str:
		return "".join(c for c in str(s or "") if c.isdigit())

	res_names = []
	if tok:
		name = frappe.db.get_value("Reservation", {"precheckin_token": tok})
		if name:
			res_names.append(name)
	elif ref:
		names = frappe.db.sql_list(
			"""SELECT name FROM `tabReservation`
			   WHERE name = %(ref)s OR ota_ref = %(ref)s OR precheckin_token = %(ref)s""",
			{"ref": ref}
		)
		res_names.extend(names)

	if is_staff and ph and not res_names:
		clean_ph = _digits(ph)
		suffix = clean_ph[-10:] if len(clean_ph) >= 10 else clean_ph
		guest_names = frappe.db.sql_list(
			"""SELECT name FROM `tabGuest` WHERE REPLACE(REPLACE(REPLACE(phone, '-', ''), ' ', ''), '+', '') LIKE %(ph)s""",
			{"ph": f"%{suffix}%"}
		)
		if guest_names:
			names = frappe.db.sql_list(
				"""SELECT name FROM `tabReservation` WHERE guest IN %(guests)s ORDER BY check_in_date DESC LIMIT 10""",
				{"guests": tuple(guest_names)}
			)
			res_names.extend(names)

	res_names = sorted(list(set(res_names)), reverse=True)
	if not res_names:
		return {"found": False, "bookings": []}

	bookings = []
	for rname in res_names[:10]:
		res = frappe.get_doc("Reservation", rname)
		guest_doc = frappe.get_cached_doc("Guest", res.guest)

		# Security verification for unauthenticated users:
		# If looking up by reference (not token), verify that phone matches the guest's record!
		if not is_staff and not tok:
			input_digits = _digits(ph)
			stored_digits = _digits(guest_doc.phone)
			match = False
			if input_digits and stored_digits:
				if input_digits == stored_digits:
					match = True
				elif len(input_digits) >= 8 and len(stored_digits) >= 8 and input_digits[-8:] == stored_digits[-8:]:
					match = True
			if not match:
				# Do not reveal whether reference exists or not
				continue

		prop = frappe.get_cached_doc("Property", res.property)
		guest_name = guest_doc.full_name or guest_doc.guest_name or "Guest"

		folio_info = frappe.db.get_value(
			"Folio", {"reservation": res.name},
			["name", "grand_total", "payments_total", "balance", "status"],
			as_dict=True
		)

		grand_total = float(folio_info.grand_total if folio_info else (res.amount_after_tax or 0.0))
		paid = float(folio_info.payments_total if folio_info else 0.0)
		balance = float(folio_info.balance if folio_info else max(0.0, grand_total - paid))

		rt_name = res.room_type
		if "-" in rt_name:
			rt_name = rt_name.split("-", 1)[1]

		room_num = ""
		if res.room:
			room_num = frappe.db.get_value("Room", res.room, "room_number") or res.room

		meal_plan_label = "Room only"
		if res.meal_plan:
			meal_plan_label = frappe.db.get_value("Meal Plan", res.meal_plan, "label") or res.meal_plan

		payment_status = "Paid" if balance <= 0.001 else ("Partially Paid" if paid > 0 else "Unpaid")

		bookings.append({
			"reservation": res.name,
			"property": prop.property_name,
			"property_name": prop.property_name,
			"property_slug": prop.name.lower().replace(" ", "-"),
			"city": prop.city or "",
			"phone": prop.phone or "",
			"wifi_ssid": prop.get("wifi_ssid") or "",
			"wifi_password": prop.get("wifi_password") or "",
			"checkin_time": str(prop.checkin_time or "14:00"),
			"checkout_time": str(prop.checkout_time or "11:00"),
			"guest_name": guest_name,
			"guest_phone": guest_doc.phone or "",
			"guest_email": guest_doc.email or "",
			"room_type": rt_name,
			"room": res.room or "",
			"room_number": room_num,
			"check_in_date": str(res.check_in_date),
			"check_out_date": str(res.check_out_date),
			"nights": int(res.nights or 1),
			"adults": int(res.adults or 1),
			"children": int(res.children or 0),
			"meal_plan": res.meal_plan or "",
			"meal_plan_name": meal_plan_label,
			"status": res.status,
			"payment_status": payment_status,
			"precheckin_status": res.precheckin_status or "Pending",
			"precheckin_token": res.precheckin_token or "",
			"cancellation_number": res.cancellation_number or "",
			"cancellation_reason": res.cancellation_reason or "",
			"cancellation_policy": res.cancellation_policy or "",
			"cancellation_policy_type": res.cancellation_policy_type or "",
			"cancellation_deadline": str(res.cancellation_deadline) if res.cancellation_deadline else "",
			"cancellation_fee_rule": res.cancellation_fee_rule or "",
			"cancellation_policy_description": res.cancellation_policy_description or "",
			"cancellation_fee": float(res.cancellation_fee or 0),
			"eligible_refund": float(res.eligible_refund or 0),
			"refund_amount": float(res.refund_amount or 0),
			"refund_status": res.refund_status or "Not Applicable",
			"special_requests": res.special_requests or "",
			"created_at": str(res.creation),
			"grand_total": grand_total,
			"paid_amount": paid,
			"balance": balance,
			"currency_symbol": "₹",
		})

	if not bookings:
		return {"found": False, "bookings": []}

	return {"found": True, "bookings": bookings}


def _verify_guest_reservation(reference: str = "", phone: str = "", token: str = ""):
	"""Helper to securely authenticate guest for sensitive operations like modification/cancellation."""
	ref = (reference or "").strip()
	ph = (phone or "").strip()
	tok = (token or "").strip()

	is_staff = frappe.session.user != "Guest" and any(
		r in ("Front Desk", "Hotel Admin", "System Manager", "Administrator", "Kamra Agent")
		for r in frappe.get_roles()
	)
	is_authed_customer = frappe.session.user != "Guest" and not is_staff

	if not is_staff and not is_authed_customer:
		if tok:
			if len(tok) < 20:
				frappe.throw("Invalid booking token.")
		elif not ref or not ph:
			frappe.throw("Please enter both your Booking Reference and the Phone Number used during booking.")

	def _digits(s: str) -> str:
		return "".join(c for c in str(s or "") if c.isdigit())

	res_name = None
	if tok:
		res_name = frappe.db.get_value("Reservation", {"precheckin_token": tok})
	elif ref:
		res_name = (
			frappe.db.get_value("Reservation", {"name": ref})
			or frappe.db.get_value("Reservation", {"ota_ref": ref})
			or frappe.db.get_value("Reservation", {"precheckin_token": ref})
		)

	if not res_name:
		frappe.throw("Reservation not found or verification failed.")

	res = frappe.get_doc("Reservation", res_name)
	guest_doc = frappe.get_cached_doc("Guest", res.guest)

	if is_authed_customer:
		# Enforce strict customer ownership check
		user_email = frappe.db.get_value("User", frappe.session.user, "email") or frappe.session.user
		if res.owner != frappe.session.user and guest_doc.email != user_email and guest_doc.email != frappe.session.user:
			frappe.throw("You do not have permission to access or modify this reservation.", frappe.PermissionError)
	elif not is_staff and not tok:
		input_digits = _digits(ph)
		stored_digits = _digits(guest_doc.phone)
		match = False
		if input_digits and stored_digits:
			if input_digits == stored_digits:
				match = True
			elif len(input_digits) >= 8 and len(stored_digits) >= 8 and input_digits[-8:] == stored_digits[-8:]:
				match = True
		if not match:
			frappe.throw("Reservation not found or verification failed.")

	return res, guest_doc


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=10, seconds=300)
def request_booking_change(reference: str = "", phone: str = "", token: str = "", change_details: str = "", preferred_dates: str = ""):
	"""Allow verified guest to submit a modification request."""
	details = (change_details or "").strip()
	if not details:
		frappe.throw("Please describe your requested changes.")

	res, guest = _verify_guest_reservation(reference, phone, token)
	if res.status in ("Cancelled", "Checked Out"):
		frappe.throw(f"Modifications cannot be requested for {res.status.lower()} stays.")

	timestamp = frappe.utils.now_datetime().strftime("%Y-%m-%d %H:%M")
	req_lines = [f"[Guest Change Request - {timestamp}]", details]
	if preferred_dates:
		req_lines.append(f"Preferred Dates: {preferred_dates.strip()}")

	change_entry = "\n".join(req_lines)
	existing_requests = res.special_requests or ""
	res.special_requests = (existing_requests + "\n\n" + change_entry).strip() if existing_requests else change_entry
	res.save(ignore_permissions=True)

	try:
		res.add_comment("Comment", text=f"Guest submitted change request via Stay Portal:\n{change_entry}")
	except Exception:
		pass

	return {
		"ok": True,
		"message": "Your modification request has been submitted to our Front Desk team. We will review and reach out to you shortly.",
		"reservation": res.name,
	}


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=20, seconds=300)
def preview_guest_cancellation(reference: str = "", phone: str = "", token: str = ""):
	"""Allow verified guest to preview cancellation charges, refund eligibility, and policy details before confirming."""
	res, guest = _verify_guest_reservation(reference, phone, token)
	from izensphere_stay_and_dine.cancellation import calculate_cancellation
	calc = calculate_cancellation(res)
	return {
		"ok": True,
		"reservation": res.name,
		"property_name": frappe.db.get_value("Property", res.property, "property_name") or res.property,
		"check_in_date": str(res.check_in_date),
		"check_out_date": str(res.check_out_date),
		"booking_amount": calc["booking_amount"],
		"amount_paid": calc["amount_paid"],
		"cancellation_fee": calc["cancellation_fee"],
		"effective_penalty": calc["effective_penalty"],
		"eligible_refund": calc["eligible_refund"],
		"is_before_deadline": calc["is_before_deadline"],
		"cancellation_deadline": calc["cancellation_deadline"],
		"policy_name": calc["policy_name"],
		"policy_type": calc["policy_type"],
		"policy_description": calc["policy_description"],
		"fee_basis": calc["fee_basis"],
		"currency_symbol": "₹",
	}


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=10, seconds=300)
def cancel_booking(reference: str = "", phone: str = "", token: str = "", reason: str = "Guest request", note: str = ""):
	"""Allow verified guest to cancel their reservation per cancellation policy."""
	res, guest = _verify_guest_reservation(reference, phone, token)
	if res.status not in ("Confirmed", "Draft", "Pending Payment"):
		frappe.throw(f"Stays with status '{res.status}' cannot be cancelled online. Please contact the front desk directly.")

	from izensphere_stay_and_dine.api import _do_cancel
	cancel_res = _do_cancel(
		res,
		reason=reason or "Guest request",
		note=note or "Cancelled by guest via Stay Portal"
	)
	return {
		"ok": True,
		"message": "Your reservation has been cancelled.",
		"reservation": res.name,
		"cancellation_number": cancel_res.get("cancellation_number"),
		"cancellation_fee": cancel_res.get("fee", 0.0),
		"eligible_refund": cancel_res.get("eligible_refund", 0.0),
		"amount_paid": cancel_res.get("amount_paid", 0.0),
		"refund_status": cancel_res.get("refund_status", "Not Applicable"),
		"policy_type": cancel_res.get("policy_type"),
		"policy_description": cancel_res.get("policy_description"),
		"status": "Cancelled",
	}


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=30, seconds=300)
def get_customer_booking_history(verified_tokens=None, verified_references=None):
	"""Automatically retrieve all current and historical bookings for an authenticated customer.

	Security & Ownership:
	- If unauthenticated (Guest), returns login_required status.
	- If authenticated, queries reservations where owner == frappe.session.user
	  OR guest is linked to the user's email/phone.
	- Never exposes other customers' bookings or trusts client-supplied IDs.
	"""
	from frappe.utils import today

	if frappe.session.user == "Guest":
		return {
			"found": False,
			"authenticated": False,
			"reason": "login_required",
			"message": "Please sign in to view your bookings.",
			"bookings": [],
			"categories": {"upcoming": [], "current": [], "completed": [], "cancelled": []},
			"counts": {"all": 0, "upcoming": 0, "current": 0, "completed": 0, "cancelled": 0},
		}

	user = frappe.session.user
	user_email = frappe.db.get_value("User", user, "email") or user
	user_phone = frappe.db.get_value("User", user, "phone") or ""

	guest_ids = set()
	if user_email:
		for gid in frappe.db.sql_list("SELECT name FROM `tabGuest` WHERE email = %(email)s", {"email": user_email}):
			guest_ids.add(gid)
	if user_phone:
		for gid in frappe.db.sql_list("SELECT name FROM `tabGuest` WHERE phone = %(phone)s", {"phone": user_phone}):
			guest_ids.add(gid)

	# Direct reservations created by or owned by this user
	res_by_owner = set(frappe.db.sql_list("SELECT name FROM `tabReservation` WHERE owner = %(user)s", {"user": user}))
	# Reservations linked to user's guest profile
	res_by_guest = set()
	if guest_ids:
		res_by_guest = set(frappe.db.sql_list(
			"SELECT name FROM `tabReservation` WHERE guest IN %(guests)s",
			{"guests": tuple(guest_ids)}
		))

	all_res_names = res_by_owner | res_by_guest
	if not all_res_names:
		return {
			"found": False,
			"authenticated": True,
			"reason": "no_bookings",
			"message": "You do not have any bookings yet.",
			"bookings": [],
			"categories": {"upcoming": [], "current": [], "completed": [], "cancelled": []},
			"counts": {"all": 0, "upcoming": 0, "current": 0, "completed": 0, "cancelled": 0},
		}

	# Retrieve all reservations for the customer ordered by check_in_date DESC
	res_names = frappe.db.sql_list(
		"""SELECT name FROM `tabReservation`
		   WHERE name IN %(names)s
		   ORDER BY check_in_date DESC""",
		{"names": tuple(all_res_names)}
	)

	t_today = today()
	bookings = []
	categories = {
		"upcoming": [],
		"current": [],
		"completed": [],
		"cancelled": []
	}

	for rname in res_names:
		res = frappe.get_doc("Reservation", rname)
		if not res.guest or not frappe.db.exists("Guest", res.guest):
			continue
		prop = frappe.get_cached_doc("Property", res.property)
		guest_doc = frappe.get_cached_doc("Guest", res.guest)

		folio_info = frappe.db.get_value(
			"Folio", {"reservation": res.name},
			["name", "grand_total", "payments_total", "balance", "status"],
			as_dict=True
		)

		grand_total = float(folio_info.grand_total if folio_info else (res.amount_after_tax or 0.0))
		paid = float(folio_info.payments_total if folio_info else 0.0)
		balance = float(folio_info.balance if folio_info else max(0.0, grand_total - paid))

		rt_name = res.room_type
		if "-" in rt_name:
			rt_name = rt_name.split("-", 1)[1]

		room_num = ""
		if res.room:
			room_num = frappe.db.get_value("Room", res.room, "room_number") or res.room

		meal_plan_label = "Room only"
		if res.meal_plan:
			meal_plan_label = frappe.db.get_value("Meal Plan", res.meal_plan, "label") or res.meal_plan

		payment_status = "Paid" if balance <= 0.001 else ("Partially Paid" if paid > 0 else "Unpaid")

		cin = str(res.check_in_date)
		cout = str(res.check_out_date)
		st = res.status

		# Categorize
		if st == "Cancelled":
			category = "cancelled"
		elif st == "Checked In" or (cin <= t_today <= cout and st != "Checked Out"):
			category = "current"
		elif cin > t_today and st in ("Confirmed", "Draft", "Pending Payment", "Requested"):
			category = "upcoming"
		else:
			category = "completed"

		b_item = {
			"reservation": res.name,
			"property": prop.property_name,
			"property_name": prop.property_name,
			"property_slug": prop.name.lower().replace(" ", "-"),
			"city": prop.city or "",
			"phone": prop.phone or "",
			"wifi_ssid": prop.get("wifi_ssid") or "",
			"wifi_password": prop.get("wifi_password") or "",
			"checkin_time": str(prop.checkin_time or "14:00"),
			"checkout_time": str(prop.checkout_time or "11:00"),
			"guest_name": guest_doc.full_name or guest_doc.first_name or "Guest",
			"guest_phone": guest_doc.phone or "",
			"guest_email": guest_doc.email or "",
			"room_type": rt_name,
			"room": res.room or "",
			"room_number": room_num,
			"check_in_date": cin,
			"check_out_date": cout,
			"nights": int(res.nights or 1),
			"adults": int(res.adults or 1),
			"children": int(res.children or 0),
			"meal_plan": res.meal_plan or "",
			"meal_plan_name": meal_plan_label,
			"status": st,
			"payment_status": payment_status,
			"category": category,
			"precheckin_status": res.precheckin_status or "Pending",
			"precheckin_token": res.precheckin_token or "",
			"cancellation_number": res.cancellation_number or "",
			"cancellation_reason": res.cancellation_reason or "",
			"cancellation_policy": res.cancellation_policy or "",
			"cancellation_policy_type": res.cancellation_policy_type or "",
			"cancellation_deadline": str(res.cancellation_deadline) if res.cancellation_deadline else "",
			"cancellation_fee_rule": res.cancellation_fee_rule or "",
			"cancellation_policy_description": res.cancellation_policy_description or "",
			"cancellation_fee": float(res.cancellation_fee or 0),
			"eligible_refund": float(res.eligible_refund or 0),
			"refund_amount": float(res.refund_amount or 0),
			"refund_status": res.refund_status or "Not Applicable",
			"special_requests": res.special_requests or "",
			"created_at": str(res.creation),
			"grand_total": grand_total,
			"paid_amount": paid,
			"balance": balance,
			"currency_symbol": "₹",
		}

		bookings.append(b_item)
		categories[category].append(b_item)

	return {
		"found": True,
		"authenticated": True,
		"guest_name": bookings[0]["guest_name"] if bookings else "Guest",
		"bookings": bookings,
		"categories": categories,
		"counts": {
			"all": len(bookings),
			"upcoming": len(categories["upcoming"]),
			"current": len(categories["current"]),
			"completed": len(categories["completed"]),
			"cancelled": len(categories["cancelled"]),
		},
	}
