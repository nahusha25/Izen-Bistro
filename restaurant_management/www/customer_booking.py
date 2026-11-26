# Copyright (c) 2026, Nahusha and contributors
# For license information, please see license.txt

import frappe

no_cache = 1


def get_context(context):
	context.no_cache = 1
	context.show_sidebar = False
	context.full_width = True
	context.title = "Customer Booking | Izen Stay & Dine · Izen Bistro"
	return context
