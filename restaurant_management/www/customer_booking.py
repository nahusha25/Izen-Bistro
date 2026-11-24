# Copyright (c) 2026, Nahusha and contributors
# For license information, please see license.txt

import frappe
from restaurant_management.www.book import get_context as book_get_context

no_cache = 1


def get_context(context):
	return book_get_context(context)
