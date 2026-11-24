# Copyright (c) 2026, Nahusha and contributors
# For license information, please see license.txt

import frappe


def before_request():
	"""
	Runs before every web request.
	1. Neutralizes cross-app route hijacking on /book by preventing website_redirects cache
	   from redirecting customer booking to other installed apps (e.g. kamra).
	2. Ensures the duplicate 'Restaurant Management' desktop icon remains hidden if present.
	"""
	try:
		req = getattr(frappe.local, "request", None)
		if req:
			path = (getattr(req, "path", None) or "").strip("/ ")
			# Intercept /book or /book/ to neutralize cross-app redirects
			if path in ("book", "book/"):
				# Block cached redirect in Redis so path_resolver skips website_redirects
				try:
					frappe.cache.hset("website_redirects", "book", False)
					frappe.cache.hset("website_redirects", "book/", False)
					frappe.cache.hset("website_redirects", "/book", False)
				except Exception:
					pass

				# Filter out any cross-app redirect rules for book in active site_hooks
				site_hooks = getattr(frappe.local, "site_hooks", None)
				if site_hooks and "website_redirects" in site_hooks:
					filtered = []
					for r in site_hooks.get("website_redirects", []):
						src = r.get("source", "") if isinstance(r, dict) else ""
						tgt = r.get("target", "") if isinstance(r, dict) else ""
						if "book" in src and ("izensphere" in tgt or "kamra" in tgt):
							continue
						filtered.append(r)
					site_hooks["website_redirects"] = filtered
	except Exception:
		pass
