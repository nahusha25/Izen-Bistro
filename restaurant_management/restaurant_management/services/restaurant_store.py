# Copyright (c) 2026, Nahusha and contributors
# For license information, please see license.txt

import json
import os
import copy
import re
import datetime
import frappe
from frappe import _

STORE_FILENAME = "demo_restaurant_store.json"

DEFAULT_DATA = {
	"areas": [
		{"name": "Main Dining Hall", "capacity": 12},
		{"name": "Garden Patio", "capacity": 4},
		{"name": "Rooftop Terrace", "capacity": 4},
	],
	"customers": [],
	"menu_items": [
		# --- Starters ---
		{
			"item_id": "ITEM-002",
			"name": "Paneer Tikka",
			"category": "Starters",
			"price": 320,
			"is_veg": True,
			"image": "/assets/restaurant_management/images/dishes/paneer_tikka.jpg",
			"description": "Chargrilled cottage cheese cubes marinated in mustard oil, ajwain and spiced hung curd with bell peppers.",
			"available": True,
			"recipe": {"Paneer": 0.25, "Spices & Masala": 0.05, "Cooking Oil": 0.05},
		},
		{
			"item_id": "ITEM-011",
			"name": "Chicken Tikka",
			"category": "Starters",
			"price": 340,
			"is_veg": False,
			"image": "/assets/restaurant_management/images/dishes/chicken_tikka.jpg",
			"description": "Tender boneless chicken morsels marinated in Kashmiri spices, yogurt and roasted over clay tandoor coals.",
			"available": True,
			"recipe": {},
		},
		{
			"item_id": "ITEM-009",
			"name": "Veg Spring Rolls",
			"category": "Starters",
			"price": 240,
			"is_veg": True,
			"image": "/assets/restaurant_management/images/dishes/spring_rolls.jpg",
			"description": "Golden wonton wrappers stuffed with julienned vegetables and ginger served with sweet chili sauce.",
			"available": True,
			"recipe": {"Flour (Maida/Atta)": 0.15, "Cooking Oil": 0.05},
		},

		# --- Soups ---
		{
			"item_id": "ITEM-012",
			"name": "Tomato Soup",
			"category": "Soups",
			"price": 160,
			"is_veg": True,
			"image": "/assets/restaurant_management/images/dishes/tomato_soup.jpg",
			"description": "Velvety roasted vine tomato soup finished with herb croutons, cracked black pepper and fresh cream.",
			"available": True,
			"recipe": {},
		},
		{
			"item_id": "ITEM-013",
			"name": "Sweet Corn Soup",
			"category": "Soups",
			"price": 170,
			"is_veg": True,
			"image": "/assets/restaurant_management/images/dishes/sweet_corn_soup.jpg",
			"description": "Comforting golden corn broth infused with crushed sweet kernel corn, seasonal vegetables and white pepper.",
			"available": True,
			"recipe": {},
		},

		# --- Main Course – Veg ---
		{
			"item_id": "ITEM-014",
			"name": "Paneer Butter Masala",
			"category": "Main Course – Veg",
			"price": 330,
			"is_veg": True,
			"image": "/assets/restaurant_management/images/dishes/paneer_butter_masala.jpg",
			"description": "Fresh cottage cheese simmered in a luscious butter tomato gravy lightly spiced with crushed fenugreek leaves.",
			"available": True,
			"recipe": {},
		},
		{
			"item_id": "ITEM-003",
			"name": "Dal Makhani",
			"category": "Main Course – Veg",
			"price": 280,
			"is_veg": True,
			"image": "/assets/restaurant_management/images/dishes/dal_makhani.jpg",
			"description": "Slow-cooked black lentils and kidney beans simmered overnight with tomatoes, butter and fresh cream.",
			"available": True,
			"recipe": {"Cream & Butter": 0.1, "Spices & Masala": 0.05},
		},
		{
			"item_id": "ITEM-015",
			"name": "Kadai Paneer",
			"category": "Main Course – Veg",
			"price": 320,
			"is_veg": True,
			"image": "/assets/restaurant_management/images/dishes/kadai_paneer.jpg",
			"description": "Wok-tossed paneer batons with crisp bell peppers, coriander seeds and roasted kadai masala.",
			"available": True,
			"recipe": {},
		},

		# --- Main Course – Non-Veg ---
		{
			"item_id": "ITEM-001",
			"name": "Butter Chicken",
			"category": "Main Course – Non-Veg",
			"price": 380,
			"is_veg": False,
			"image": "/assets/restaurant_management/images/dishes/butter_chicken.jpg",
			"description": "Succulent chicken morsels in velvety makhani gravy enriched with fresh butter, cream and kasuri methi.",
			"available": True,
			"recipe": {"Chicken": 0.3, "Cream & Butter": 0.1, "Spices & Masala": 0.05},
		},
		{
			"item_id": "ITEM-016",
			"name": "Chicken Curry",
			"category": "Main Course – Non-Veg",
			"price": 350,
			"is_veg": False,
			"image": "/assets/restaurant_management/images/dishes/chicken_curry.jpg",
			"description": "Homestyle aromatic chicken curry prepared with slow-caramelized onions, ginger and rustic garam masala.",
			"available": True,
			"recipe": {},
		},
		{
			"item_id": "ITEM-017",
			"name": "Kadai Chicken",
			"category": "Main Course – Non-Veg",
			"price": 360,
			"is_veg": False,
			"image": "/assets/restaurant_management/images/dishes/kadai_chicken.jpg",
			"description": "Braised chicken pieces cooked in cast-iron kadai with crunchy bell peppers, whole spices and rich gravy.",
			"available": True,
			"recipe": {},
		},

		# --- Rice & Biryani ---
		{
			"item_id": "ITEM-018",
			"name": "Veg Biryani",
			"category": "Rice & Biryani",
			"price": 290,
			"is_veg": True,
			"image": "/assets/restaurant_management/images/dishes/veg_biryani.jpg",
			"description": "Fragrant basmati rice layered with garden vegetables, saffron milk, mint and caramelized onions.",
			"available": True,
			"recipe": {},
		},
		{
			"item_id": "ITEM-004",
			"name": "Chicken Biryani",
			"category": "Rice & Biryani",
			"price": 370,
			"is_veg": False,
			"image": "/assets/restaurant_management/images/dishes/biryani_bowl.jpg",
			"description": "Long-grain basmati rice layered with spiced chicken, caramelized onions, mint and saffron in sealed dum.",
			"available": True,
			"recipe": {"Chicken": 0.2, "Basmati Rice": 0.25, "Spices & Masala": 0.05},
		},
		{
			"item_id": "ITEM-019",
			"name": "Jeera Rice",
			"category": "Rice & Biryani",
			"price": 180,
			"is_veg": True,
			"image": "/assets/restaurant_management/images/dishes/jeera_rice.jpg",
			"description": "Steamed fluffy basmati rice tempered with ghee-roasted cumin seeds and fresh coriander.",
			"available": True,
			"recipe": {},
		},

		# --- Breads ---
		{
			"item_id": "ITEM-020",
			"name": "Butter Naan",
			"category": "Breads",
			"price": 70,
			"is_veg": True,
			"image": "/assets/restaurant_management/images/dishes/butter_naan.jpg",
			"description": "Soft, pillowy clay-oven baked leavened flatbread brushed generously with pure butter.",
			"available": True,
			"recipe": {},
		},
		{
			"item_id": "ITEM-005",
			"name": "Garlic Naan",
			"category": "Breads",
			"price": 100,
			"is_veg": True,
			"image": "/assets/restaurant_management/images/dishes/garlic_naan.jpg",
			"description": "Clay-oven baked leavened flatbread topped with toasted minced garlic, coriander and warm butter.",
			"available": True,
			"recipe": {"Flour (Maida/Atta)": 0.3, "Cream & Butter": 0.05},
		},
		{
			"item_id": "ITEM-006",
			"name": "Tandoori Roti",
			"category": "Breads",
			"price": 80,
			"is_veg": True,
			"image": "/assets/restaurant_management/images/dishes/tandoori_roti.jpg",
			"description": "Traditional stone-ground whole wheat flatbreads baked crisp on the clay oven walls.",
			"available": True,
			"recipe": {"Flour (Maida/Atta)": 0.2},
		},

		# --- Desserts ---
		{
			"item_id": "ITEM-007",
			"name": "Gulab Jamun",
			"category": "Desserts",
			"price": 140,
			"is_veg": True,
			"image": "/assets/restaurant_management/images/dishes/gulab_jamun.jpg",
			"description": "Golden evaporated milk dumplings soaked in green cardamom, saffron and rose petal sugar syrup.",
			"available": True,
			"recipe": {"Dairy Milk": 0.15, "Cooking Oil": 0.05},
		},
		{
			"item_id": "ITEM-021",
			"name": "Chocolate Brownie",
			"category": "Desserts",
			"price": 210,
			"is_veg": True,
			"image": "/assets/restaurant_management/images/dishes/chocolate_brownie.jpg",
			"description": "Warm, fudgy dark chocolate walnut brownie with a rich melted chocolate drizzle.",
			"available": True,
			"recipe": {},
		},

		# --- Beverages ---
		{
			"item_id": "ITEM-010",
			"name": "Masala Chai",
			"category": "Beverages",
			"price": 70,
			"is_veg": True,
			"image": "/assets/restaurant_management/images/dishes/masala_chai.jpg",
			"description": "Assam black tea brewed with crushed ginger, cardamom, cinnamon and creamy dairy milk.",
			"available": True,
			"recipe": {"Dairy Milk": 0.2, "Spices & Masala": 0.02},
		},
		{
			"item_id": "ITEM-008",
			"name": "Fresh Lime Soda",
			"category": "Beverages",
			"price": 90,
			"is_veg": True,
			"image": "/assets/restaurant_management/images/dishes/mint_limeade.jpg",
			"description": "Sparkling fresh lime cooler muddled with organic mint leaves, rock salt and cane sugar.",
			"available": True,
			"recipe": {},
		},
		{
			"item_id": "ITEM-022",
			"name": "Sweet Lassi",
			"category": "Beverages",
			"price": 110,
			"is_veg": True,
			"image": "/assets/restaurant_management/images/dishes/sweet_lassi.jpg",
			"description": "Thick chilled traditional Punjabi yogurt drink churned with cardamom, saffron and crushed pistachios.",
			"available": True,
			"recipe": {},
		},
	],
	"inventory": [
		# Meat & Poultry
		{"item_code": "INV-001", "name": "Chicken", "category": "Meat & Poultry", "quantity": 25.0, "unit": "kg", "reorder_level": 5.0, "location": "Cold Storage", "cost_price": 240.0, "last_updated": "2026-11-03 10:00:00"},
		# Dairy Products
		{"item_code": "INV-002", "name": "Paneer", "category": "Dairy Products", "quantity": 15.0, "unit": "kg", "reorder_level": 3.0, "location": "Cold Storage", "cost_price": 320.0, "last_updated": "2026-11-03 10:00:00"},
		{"item_code": "INV-003", "name": "Cream & Butter", "category": "Dairy Products", "quantity": 12.0, "unit": "kg", "reorder_level": 2.5, "location": "Cold Storage", "cost_price": 450.0, "last_updated": "2026-11-03 10:00:00"},
		{"item_code": "INV-008", "name": "Dairy Milk", "category": "Dairy Products", "quantity": 18.0, "unit": "ltr", "reorder_level": 4.0, "location": "Cold Storage", "cost_price": 62.0, "last_updated": "2026-11-03 10:00:00"},
		# Grains & Rice
		{"item_code": "INV-004", "name": "Basmati Rice", "category": "Grains & Rice", "quantity": 40.0, "unit": "kg", "reorder_level": 10.0, "location": "Dry Storage", "cost_price": 95.0, "last_updated": "2026-11-03 10:00:00"},
		{"item_code": "INV-005", "name": "Flour (Maida/Atta)", "category": "Grains & Rice", "quantity": 35.0, "unit": "kg", "reorder_level": 8.0, "location": "Dry Storage", "cost_price": 42.0, "last_updated": "2026-11-03 10:00:00"},
		# Pulses & Dal
		{"item_code": "INV-009", "name": "Black Lentils (Urad)", "category": "Pulses & Dal", "quantity": 25.0, "unit": "kg", "reorder_level": 5.0, "location": "Dry Storage", "cost_price": 130.0, "last_updated": "2026-11-03 10:00:00"},
		{"item_code": "INV-010", "name": "Yellow Moong Dal", "category": "Pulses & Dal", "quantity": 20.0, "unit": "kg", "reorder_level": 4.0, "location": "Dry Storage", "cost_price": 115.0, "last_updated": "2026-11-03 10:00:00"},
		# Vegetables
		{"item_code": "INV-011", "name": "Fresh Onions", "category": "Vegetables", "quantity": 40.0, "unit": "kg", "reorder_level": 8.0, "location": "Fresh Produce Storage", "cost_price": 35.0, "last_updated": "2026-11-03 10:00:00"},
		{"item_code": "INV-012", "name": "Ripe Tomatoes", "category": "Vegetables", "quantity": 30.0, "unit": "kg", "reorder_level": 6.0, "location": "Fresh Produce Storage", "cost_price": 40.0, "last_updated": "2026-11-03 10:00:00"},
		{"item_code": "INV-013", "name": "Potatoes", "category": "Vegetables", "quantity": 35.0, "unit": "kg", "reorder_level": 7.0, "location": "Fresh Produce Storage", "cost_price": 30.0, "last_updated": "2026-11-03 10:00:00"},
		# Fruits
		{"item_code": "INV-014", "name": "Fresh Lemons", "category": "Fruits", "quantity": 12.0, "unit": "kg", "reorder_level": 2.5, "location": "Fresh Produce Storage", "cost_price": 90.0, "last_updated": "2026-11-03 10:00:00"},
		{"item_code": "INV-015", "name": "Fresh Mint & Coriander", "category": "Fruits", "quantity": 5.0, "unit": "kg", "reorder_level": 1.0, "location": "Fresh Produce Storage", "cost_price": 50.0, "last_updated": "2026-11-03 10:00:00"},
		# Spices & Masala
		{"item_code": "INV-006", "name": "Spices & Masala", "category": "Spices & Masala", "quantity": 8.0, "unit": "kg", "reorder_level": 1.5, "location": "Dry Storage", "cost_price": 580.0, "last_updated": "2026-11-03 10:00:00"},
		# Cooking Essentials
		{"item_code": "INV-007", "name": "Cooking Oil", "category": "Cooking Essentials", "quantity": 20.0, "unit": "ltr", "reorder_level": 5.0, "location": "Dry Storage", "cost_price": 145.0, "last_updated": "2026-11-03 10:00:00"},
		{"item_code": "INV-016", "name": "Refined Sugar", "category": "Cooking Essentials", "quantity": 25.0, "unit": "kg", "reorder_level": 5.0, "location": "Dry Storage", "cost_price": 48.0, "last_updated": "2026-11-03 10:00:00"},
		# Beverages
		{"item_code": "INV-017", "name": "Assam CTC Tea", "category": "Beverages", "quantity": 10.0, "unit": "kg", "reorder_level": 2.0, "location": "Dry Storage", "cost_price": 340.0, "last_updated": "2026-11-03 10:00:00"},
		{"item_code": "INV-018", "name": "Filter Coffee Powder", "category": "Beverages", "quantity": 6.0, "unit": "kg", "reorder_level": 1.5, "location": "Dry Storage", "cost_price": 480.0, "last_updated": "2026-11-03 10:00:00"},
		# Packaging Materials
		{"item_code": "INV-019", "name": "Meal Delivery Boxes", "category": "Packaging Materials", "quantity": 250.0, "unit": "pcs", "reorder_level": 50.0, "location": "Dry Storage", "cost_price": 12.0, "last_updated": "2026-11-03 10:00:00"},
		{"item_code": "INV-020", "name": "Paper Carry Bags", "category": "Packaging Materials", "quantity": 400.0, "unit": "pcs", "reorder_level": 80.0, "location": "Dry Storage", "cost_price": 6.0, "last_updated": "2026-11-03 10:00:00"},
	],
	"tables": [
		# Main Dining Hall (12 Tables)
		{
			"table_no": "T-01",
			"area": "Main Dining Hall",
			"capacity": 2,
			"status": "Available",
			"customer": "",
			"guests": 0,
			"seated_time": "",
			"order_id": "",
			"order_amount": "",
			"reservation_time": "",
			"notes": "",
		},
		{
			"table_no": "T-02",
			"area": "Main Dining Hall",
			"capacity": 4,
			"status": "Available",
			"customer": "",
			"guests": 0,
			"seated_time": "",
			"order_id": "",
			"order_amount": "",
			"reservation_time": "",
			"notes": "",
		},
		{
			"table_no": "T-03",
			"area": "Main Dining Hall",
			"capacity": 4,
			"status": "Available",
			"customer": "",
			"guests": 0,
			"seated_time": "",
			"order_id": "",
			"order_amount": "",
			"reservation_time": "",
			"notes": "",
		},
		{
			"table_no": "T-04",
			"area": "Main Dining Hall",
			"capacity": 6,
			"status": "Available",
			"customer": "",
			"guests": 0,
			"seated_time": "",
			"order_id": "",
			"order_amount": "",
			"reservation_time": "",
			"notes": "",
		},
		{
			"table_no": "T-05",
			"area": "Main Dining Hall",
			"capacity": 2,
			"status": "Available",
			"customer": "",
			"guests": 0,
			"seated_time": "",
			"order_id": "",
			"order_amount": "",
			"reservation_time": "",
			"notes": "",
		},
		{
			"table_no": "T-06",
			"area": "Main Dining Hall",
			"capacity": 4,
			"status": "Available",
			"customer": "",
			"guests": 0,
			"seated_time": "",
			"order_id": "",
			"order_amount": "",
			"reservation_time": "",
			"notes": "",
		},
		{
			"table_no": "T-07",
			"area": "Main Dining Hall",
			"capacity": 4,
			"status": "Available",
			"customer": "",
			"guests": 0,
			"seated_time": "",
			"order_id": "",
			"order_amount": "",
			"reservation_time": "",
			"notes": "",
		},
		{
			"table_no": "T-08",
			"area": "Main Dining Hall",
			"capacity": 6,
			"status": "Available",
			"customer": "",
			"guests": 0,
			"seated_time": "",
			"order_id": "",
			"order_amount": "",
			"reservation_time": "",
			"notes": "",
		},
		{
			"table_no": "T-09",
			"area": "Main Dining Hall",
			"capacity": 2,
			"status": "Available",
			"customer": "",
			"guests": 0,
			"seated_time": "",
			"order_id": "",
			"order_amount": "",
			"reservation_time": "",
			"notes": "",
		},
		{
			"table_no": "T-10",
			"area": "Main Dining Hall",
			"capacity": 4,
			"status": "Available",
			"customer": "",
			"guests": 0,
			"seated_time": "",
			"order_id": "",
			"order_amount": "",
			"reservation_time": "",
			"notes": "",
		},
		{
			"table_no": "T-11",
			"area": "Main Dining Hall",
			"capacity": 4,
			"status": "Available",
			"customer": "",
			"guests": 0,
			"seated_time": "",
			"order_id": "",
			"order_amount": "",
			"reservation_time": "",
			"notes": "",
		},
		{
			"table_no": "T-12",
			"area": "Main Dining Hall",
			"capacity": 6,
			"status": "Available",
			"customer": "",
			"guests": 0,
			"seated_time": "",
			"order_id": "",
			"order_amount": "",
			"reservation_time": "",
			"notes": "",
		},
		# Garden Patio (4 Tables)
		{
			"table_no": "T-13",
			"area": "Garden Patio",
			"capacity": 2,
			"status": "Available",
			"customer": "",
			"guests": 0,
			"seated_time": "",
			"order_id": "",
			"order_amount": "",
			"reservation_time": "",
			"notes": "",
		},
		{
			"table_no": "T-14",
			"area": "Garden Patio",
			"capacity": 4,
			"status": "Available",
			"customer": "",
			"guests": 0,
			"seated_time": "",
			"order_id": "",
			"order_amount": "",
			"reservation_time": "",
			"notes": "",
		},
		{
			"table_no": "T-15",
			"area": "Garden Patio",
			"capacity": 4,
			"status": "Available",
			"customer": "",
			"guests": 0,
			"seated_time": "",
			"order_id": "",
			"order_amount": "",
			"reservation_time": "",
			"notes": "",
		},
		{
			"table_no": "T-16",
			"area": "Garden Patio",
			"capacity": 6,
			"status": "Available",
			"customer": "",
			"guests": 0,
			"seated_time": "",
			"order_id": "",
			"order_amount": "",
			"reservation_time": "",
			"notes": "",
		},
		# Rooftop Terrace (4 Tables)
		{
			"table_no": "T-17",
			"area": "Rooftop Terrace",
			"capacity": 2,
			"status": "Available",
			"customer": "",
			"guests": 0,
			"seated_time": "",
			"order_id": "",
			"order_amount": "",
			"reservation_time": "",
			"notes": "",
		},
		{
			"table_no": "T-18",
			"area": "Rooftop Terrace",
			"capacity": 4,
			"status": "Available",
			"customer": "",
			"guests": 0,
			"seated_time": "",
			"order_id": "",
			"order_amount": "",
			"reservation_time": "",
			"notes": "",
		},
		{
			"table_no": "T-19",
			"area": "Rooftop Terrace",
			"capacity": 4,
			"status": "Available",
			"customer": "",
			"guests": 0,
			"seated_time": "",
			"order_id": "",
			"order_amount": "",
			"reservation_time": "",
			"notes": "",
		},
		{
			"table_no": "T-20",
			"area": "Rooftop Terrace",
			"capacity": 6,
			"status": "Available",
			"customer": "",
			"guests": 0,
			"seated_time": "",
			"order_id": "",
			"order_amount": "",
			"reservation_time": "",
			"notes": "",
		},
	],
	"orders": [],
	"historical_summary": {
		"base_today_revenue": 0,
		"base_today_orders": 0,
		"base_weekly_sales": [0, 0, 0, 0, 0, 0],
		"dishes_base": {},
	},
	"bills": [],
	"restaurant_info": {
		"name": "IZEN BISTRO",
		"tagline": "",
		"address": "2nd Floor, 779, 4th Cross, 11th Block,\nPapreddy Palya, 2nd Stage, Nagarbhavi,\nBengaluru, Karnataka - 560072",
		"address_lines": [
			"2nd Floor, 779, 4th Cross, 11th Block,",
			"Papreddy Palya, 2nd Stage, Nagarbhavi,",
			"Bengaluru, Karnataka - 560072"
		],
		"phone": "",
		"email": "",
		"gstin": "",
		"fssai": "",
		"website": "",
	},
	"suppliers": [
		{
			"supplier_id": "SUP-001",
			"name": "Bengaluru Dairy Cooperative (Nandini)",
			"contact_person": "S. R. Kumar",
			"phone": "+91 80 2839 4011",
			"email": "procurement@nandinidairy.com",
			"address": "Dr. Rajkumar Road, Rajajinagar, Bengaluru, Karnataka 560010",
			"categories": ["Dairy Products"],
			"supplied_items": ["Dairy Milk", "Paneer", "Cream & Butter"],
		},
		{
			"supplier_id": "SUP-002",
			"name": "Metro Cash & Carry India",
			"contact_person": "Arun Prasad",
			"phone": "+91 80 4911 2233",
			"email": "b2b.orders@metro.co.in",
			"address": "Yeshwantpur Industrial Suburb, Bengaluru, Karnataka 560022",
			"categories": ["Grains & Rice", "Cooking Essentials", "Packaging Materials"],
			"supplied_items": ["Basmati Rice", "Flour (Maida/Atta)", "Cooking Oil", "Refined Sugar", "Meal Delivery Boxes", "Paper Carry Bags"],
		},
		{
			"supplier_id": "SUP-003",
			"name": "City Spice & Provisions Traders",
			"contact_person": "Manjunath Gowda",
			"phone": "+91 80 2670 1199",
			"email": "orders@cityspicetraders.in",
			"address": "APMC Yard, Yeshwanthpura, Bengaluru, Karnataka 560022",
			"categories": ["Spices & Masala", "Pulses & Dal", "Beverages"],
			"supplied_items": ["Spices & Masala", "Black Lentils (Urad)", "Yellow Moong Dal", "Assam CTC Tea", "Filter Coffee Powder"],
		},
		{
			"supplier_id": "SUP-004",
			"name": "Green Valley Farm Fresh Produce",
			"contact_person": "Ramesh Venkat",
			"phone": "+91 80 2345 8877",
			"email": "contact@greenvalleyfarm.in",
			"address": "Hunsur Road Wholesale Market, Bengaluru, Karnataka 560091",
			"categories": ["Vegetables", "Fruits"],
			"supplied_items": ["Fresh Onions", "Ripe Tomatoes", "Potatoes", "Fresh Lemons", "Fresh Mint & Coriander"],
		},
		{
			"supplier_id": "SUP-005",
			"name": "Royal Broiler & Poultry Supplies",
			"contact_person": "Imran Pasha",
			"phone": "+91 80 2553 1980",
			"email": "supply@royalpoultryblr.com",
			"address": "Shivajinagar Market, Bengaluru, Karnataka 560051",
			"categories": ["Meat & Poultry"],
			"supplied_items": ["Chicken"],
		},
	],
	"purchase_orders": [
		{
			"po_number": "PO-2026-0001",
			"supplier_id": "SUP-001",
			"supplier_name": "Bengaluru Dairy Cooperative (Nandini)",
			"date": "2026-11-02",
			"invoice_ref": "INV-NAN-8821",
			"status": "Received",
			"items": [
				{"item_name": "Dairy Milk", "qty": 15.0, "unit": "ltr", "rate": 60.0, "amount": 900.0},
				{"item_name": "Paneer", "qty": 10.0, "unit": "kg", "rate": 310.0, "amount": 3100.0},
			],
			"total_amount": 4000.0,
			"received_at": "2026-11-02 08:30:00",
			"notes": "Daily morning dairy replenishment",
		},
		{
			"po_number": "PO-2026-0002",
			"supplier_id": "SUP-002",
			"supplier_name": "Metro Cash & Carry India",
			"date": "2026-11-03",
			"invoice_ref": "METRO-BLR-4019",
			"status": "Draft",
			"items": [
				{"item_name": "Basmati Rice", "qty": 20.0, "unit": "kg", "rate": 92.0, "amount": 1840.0},
				{"item_name": "Cooking Oil", "qty": 15.0, "unit": "ltr", "rate": 140.0, "amount": 2100.0},
			],
			"total_amount": 3940.0,
			"received_at": "",
			"notes": "Weekly staple dry goods replenishment order",
		},
	],
	"batches": [
		{
			"batch_no": "BAT-2026-1101",
			"item_name": "Dairy Milk",
			"item_code": "INV-008",
			"mfg_date": "2026-11-01",
			"expiry_date": "2026-11-06",
			"qty": 8.0,
			"unit": "ltr",
			"location": "Cold Storage",
			"status": "Expiring Soon",
		},
		{
			"batch_no": "BAT-2026-1025",
			"item_name": "Paneer",
			"item_code": "INV-002",
			"mfg_date": "2026-10-25",
			"expiry_date": "2026-11-08",
			"qty": 5.0,
			"unit": "kg",
			"location": "Cold Storage",
			"status": "Expiring Soon",
		},
		{
			"batch_no": "BAT-2026-1102",
			"item_name": "Chicken",
			"item_code": "INV-001",
			"mfg_date": "2026-11-02",
			"expiry_date": "2026-11-07",
			"qty": 12.0,
			"unit": "kg",
			"location": "Cold Storage",
			"status": "Expiring Soon",
		},
		{
			"batch_no": "BAT-2026-1015",
			"item_name": "Basmati Rice",
			"item_code": "INV-004",
			"mfg_date": "2026-10-15",
			"expiry_date": "2027-04-15",
			"qty": 40.0,
			"unit": "kg",
			"location": "Dry Storage",
			"status": "Active",
		},
		{
			"batch_no": "BAT-2026-1020",
			"item_name": "Cooking Oil",
			"item_code": "INV-007",
			"mfg_date": "2026-10-20",
			"expiry_date": "2027-10-20",
			"qty": 20.0,
			"unit": "ltr",
			"location": "Dry Storage",
			"status": "Active",
		},
	],
	"wastage_records": [
		{
			"wastage_id": "WST-2026-0001",
			"item_name": "Dairy Milk",
			"item_code": "INV-008",
			"qty": 1.0,
			"unit": "ltr",
			"reason": "Spoilage",
			"date": "2026-11-02",
			"batch_no": "BAT-2026-1101",
			"location": "Cold Storage",
			"cost_impact": 62.0,
			"notes": "Curdled packet detected during morning opening prep",
			"movement_id": "MOV-2026-0002",
			"recorded_by": "Administrator",
		},
		{
			"wastage_id": "WST-2026-0002",
			"item_name": "Ripe Tomatoes",
			"item_code": "INV-012",
			"qty": 1.5,
			"unit": "kg",
			"reason": "Preparation waste",
			"date": "2026-11-02",
			"batch_no": "",
			"location": "Fresh Produce Storage",
			"cost_impact": 60.0,
			"notes": "Trimmings and overripe sorting during curry prep",
			"movement_id": "MOV-2026-0003",
			"recorded_by": "Administrator",
		},
	],
	"stock_movements": [
		{
			"movement_id": "MOV-2026-0001",
			"timestamp": "2026-11-02 08:35:00",
			"item_name": "Dairy Milk",
			"item_code": "INV-008",
			"movement_type": "Goods Receipt",
			"qty": 15.0,
			"unit": "ltr",
			"from_location": "Nandini Dairy Delivery",
			"to_location": "Cold Storage",
			"reason": "PO-2026-0001 Receipt Confirmation",
			"reference": "PO-2026-0001",
			"user": "Administrator",
		},
		{
			"movement_id": "MOV-2026-0002",
			"timestamp": "2026-11-02 09:15:00",
			"item_name": "Dairy Milk",
			"item_code": "INV-008",
			"movement_type": "Wastage",
			"qty": 1.0,
			"unit": "ltr",
			"from_location": "Cold Storage",
			"to_location": "Wastage Bin",
			"reason": "Spoilage: Curdled packet detected during morning opening prep",
			"reference": "WST-2026-0001",
			"user": "Administrator",
		},
		{
			"movement_id": "MOV-2026-0003",
			"timestamp": "2026-11-02 11:30:00",
			"item_name": "Ripe Tomatoes",
			"item_code": "INV-012",
			"movement_type": "Wastage",
			"qty": 1.5,
			"unit": "kg",
			"from_location": "Fresh Produce Storage",
			"to_location": "Wastage Bin",
			"reason": "Preparation waste: Trimmings and overripe sorting",
			"reference": "WST-2026-0002",
			"user": "Administrator",
		},
	],
}


class RestaurantStore:
	_cached_data = None

	MASTER_INVENTORY = DEFAULT_DATA["inventory"]
	DEFAULT_SUPPLIERS = DEFAULT_DATA["suppliers"]
	DEFAULT_PURCHASE_ORDERS = DEFAULT_DATA["purchase_orders"]
	DEFAULT_BATCHES = DEFAULT_DATA["batches"]
	DEFAULT_WASTAGE_RECORDS = DEFAULT_DATA["wastage_records"]
	DEFAULT_STOCK_MOVEMENTS = DEFAULT_DATA["stock_movements"]

	DEFAULT_DISH_RECIPES = {
		"ITEM-001": { # Butter Chicken
			"status": "Approved",
			"is_unverified": False,
			"approved_at": "2026-11-04 10:00:00",
			"approved_by": "Head Chef",
			"wastage_pct": 0.0,
			"portions": {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": 0.0,
					"ingredients": [
						{"ingredient_name": "Chicken", "inventory_item_code": "INV-001", "inventory_item_name": "Chicken", "quantity": 300.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Cream & Butter", "inventory_item_code": "INV-003", "inventory_item_name": "Cream & Butter", "quantity": 100.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Spices & Masala", "inventory_item_code": "INV-006", "inventory_item_name": "Spices & Masala", "quantity": 50.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
					]
				}
			}
		},
		"ITEM-002": { # Paneer Tikka
			"status": "Approved",
			"is_unverified": False,
			"approved_at": "2026-11-04 10:00:00",
			"approved_by": "Head Chef",
			"wastage_pct": 0.0,
			"portions": {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": 0.0,
					"ingredients": [
						{"ingredient_name": "Paneer", "inventory_item_code": "INV-002", "inventory_item_name": "Paneer", "quantity": 250.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Spices & Masala", "inventory_item_code": "INV-006", "inventory_item_name": "Spices & Masala", "quantity": 50.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Cooking Oil", "inventory_item_code": "INV-007", "inventory_item_name": "Cooking Oil", "quantity": 50.0, "unit": "ml", "wastage_pct": 0.0, "is_mapped": True},
					]
				}
			}
		},
		"ITEM-003": { # Dal Makhani
			"status": "Approved",
			"is_unverified": False,
			"approved_at": "2026-11-04 10:00:00",
			"approved_by": "Head Chef",
			"wastage_pct": 0.0,
			"portions": {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": 0.0,
					"ingredients": [
						{"ingredient_name": "Cream & Butter", "inventory_item_code": "INV-003", "inventory_item_name": "Cream & Butter", "quantity": 100.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Spices & Masala", "inventory_item_code": "INV-006", "inventory_item_name": "Spices & Masala", "quantity": 50.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
					]
				}
			}
		},
		"ITEM-004": { # Chicken Biryani
			"status": "Approved",
			"is_unverified": False,
			"approved_at": "2026-11-04 10:00:00",
			"approved_by": "Head Chef",
			"wastage_pct": 0.0,
			"portions": {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": 0.0,
					"ingredients": [
						{"ingredient_name": "Chicken", "inventory_item_code": "INV-001", "inventory_item_name": "Chicken", "quantity": 200.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Basmati Rice", "inventory_item_code": "INV-004", "inventory_item_name": "Basmati Rice", "quantity": 250.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Spices & Masala", "inventory_item_code": "INV-006", "inventory_item_name": "Spices & Masala", "quantity": 50.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
					]
				}
			}
		},
		"ITEM-005": { # Garlic Naan
			"status": "Approved",
			"is_unverified": False,
			"approved_at": "2026-11-04 10:00:00",
			"approved_by": "Head Chef",
			"wastage_pct": 0.0,
			"portions": {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": 0.0,
					"ingredients": [
						{"ingredient_name": "Flour (Maida/Atta)", "inventory_item_code": "INV-005", "inventory_item_name": "Flour (Maida/Atta)", "quantity": 300.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Cream & Butter", "inventory_item_code": "INV-003", "inventory_item_name": "Cream & Butter", "quantity": 50.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
					]
				}
			}
		},
		"ITEM-006": { # Tandoori Roti
			"status": "Approved",
			"is_unverified": False,
			"approved_at": "2026-11-04 10:00:00",
			"approved_by": "Head Chef",
			"wastage_pct": 0.0,
			"portions": {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": 0.0,
					"ingredients": [
						{"ingredient_name": "Flour (Maida/Atta)", "inventory_item_code": "INV-005", "inventory_item_name": "Flour (Maida/Atta)", "quantity": 200.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
					]
				}
			}
		},
		"ITEM-007": { # Gulab Jamun
			"status": "Approved",
			"is_unverified": False,
			"approved_at": "2026-11-04 10:00:00",
			"approved_by": "Head Chef",
			"wastage_pct": 0.0,
			"portions": {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": 0.0,
					"ingredients": [
						{"ingredient_name": "Dairy Milk", "inventory_item_code": "INV-008", "inventory_item_name": "Dairy Milk", "quantity": 150.0, "unit": "ml", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Cooking Oil", "inventory_item_code": "INV-007", "inventory_item_name": "Cooking Oil", "quantity": 50.0, "unit": "ml", "wastage_pct": 0.0, "is_mapped": True},
					]
				}
			}
		},
		"ITEM-008": { # Fresh Lime Soda
			"status": "Draft",
			"is_unverified": True,
			"wastage_pct": 0.0,
			"portions": {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": 0.0,
					"ingredients": [
						{"ingredient_name": "Fresh Lemons", "inventory_item_code": "INV-014", "inventory_item_name": "Fresh Lemons", "quantity": 20.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Refined Sugar", "inventory_item_code": "INV-016", "inventory_item_name": "Refined Sugar", "quantity": 15.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Soda Water", "inventory_item_code": "", "inventory_item_name": "", "quantity": 200.0, "unit": "ml", "wastage_pct": 0.0, "is_mapped": False},
					]
				}
			}
		},
		"ITEM-009": { # Veg Spring Rolls
			"status": "Approved",
			"is_unverified": False,
			"approved_at": "2026-11-04 10:00:00",
			"approved_by": "Head Chef",
			"wastage_pct": 0.0,
			"portions": {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": 0.0,
					"ingredients": [
						{"ingredient_name": "Flour (Maida/Atta)", "inventory_item_code": "INV-005", "inventory_item_name": "Flour (Maida/Atta)", "quantity": 150.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Cooking Oil", "inventory_item_code": "INV-007", "inventory_item_name": "Cooking Oil", "quantity": 50.0, "unit": "ml", "wastage_pct": 0.0, "is_mapped": True},
					]
				}
			}
		},
		"ITEM-010": { # Masala Chai
			"status": "Approved",
			"is_unverified": False,
			"approved_at": "2026-11-04 10:00:00",
			"approved_by": "Head Chef",
			"wastage_pct": 0.0,
			"portions": {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": 0.0,
					"ingredients": [
						{"ingredient_name": "Dairy Milk", "inventory_item_code": "INV-008", "inventory_item_name": "Dairy Milk", "quantity": 200.0, "unit": "ml", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Spices & Masala", "inventory_item_code": "INV-006", "inventory_item_name": "Spices & Masala", "quantity": 20.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
					]
				}
			}
		},
		"ITEM-011": { # Chicken Tikka
			"status": "Draft",
			"is_unverified": True,
			"wastage_pct": 0.0,
			"portions": {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": 0.0,
					"ingredients": [
						{"ingredient_name": "Chicken", "inventory_item_code": "INV-001", "inventory_item_name": "Chicken", "quantity": 250.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Spices & Masala", "inventory_item_code": "INV-006", "inventory_item_name": "Spices & Masala", "quantity": 40.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Cooking Oil", "inventory_item_code": "INV-007", "inventory_item_name": "Cooking Oil", "quantity": 30.0, "unit": "ml", "wastage_pct": 0.0, "is_mapped": True},
					]
				}
			}
		},
		"ITEM-012": { # Tomato Soup
			"status": "Draft",
			"is_unverified": True,
			"wastage_pct": 0.0,
			"portions": {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": 0.0,
					"ingredients": [
						{"ingredient_name": "Ripe Tomatoes", "inventory_item_code": "INV-012", "inventory_item_name": "Ripe Tomatoes", "quantity": 200.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Cream & Butter", "inventory_item_code": "INV-003", "inventory_item_name": "Cream & Butter", "quantity": 30.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Spices & Masala", "inventory_item_code": "INV-006", "inventory_item_name": "Spices & Masala", "quantity": 15.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
					]
				}
			}
		},
		"ITEM-013": { # Sweet Corn Soup
			"status": "Draft",
			"is_unverified": True,
			"wastage_pct": 0.0,
			"portions": {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": 0.0,
					"ingredients": [
						{"ingredient_name": "Sweet Corn", "inventory_item_code": "", "inventory_item_name": "", "quantity": 150.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": False},
						{"ingredient_name": "Spices & Masala", "inventory_item_code": "INV-006", "inventory_item_name": "Spices & Masala", "quantity": 15.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Refined Sugar", "inventory_item_code": "INV-016", "inventory_item_name": "Refined Sugar", "quantity": 5.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
					]
				}
			}
		},
		"ITEM-014": { # Paneer Butter Masala
			"status": "Draft",
			"is_unverified": True,
			"wastage_pct": 0.0,
			"portions": {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": 0.0,
					"ingredients": [
						{"ingredient_name": "Paneer", "inventory_item_code": "INV-002", "inventory_item_name": "Paneer", "quantity": 250.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Cream & Butter", "inventory_item_code": "INV-003", "inventory_item_name": "Cream & Butter", "quantity": 80.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Ripe Tomatoes", "inventory_item_code": "INV-012", "inventory_item_name": "Ripe Tomatoes", "quantity": 120.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Fresh Onions", "inventory_item_code": "INV-011", "inventory_item_name": "Fresh Onions", "quantity": 80.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Spices & Masala", "inventory_item_code": "INV-006", "inventory_item_name": "Spices & Masala", "quantity": 40.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
					]
				}
			}
		},
		"ITEM-015": { # Kadai Paneer
			"status": "Draft",
			"is_unverified": True,
			"wastage_pct": 0.0,
			"portions": {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": 0.0,
					"ingredients": [
						{"ingredient_name": "Paneer", "inventory_item_code": "INV-002", "inventory_item_name": "Paneer", "quantity": 250.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Fresh Onions", "inventory_item_code": "INV-011", "inventory_item_name": "Fresh Onions", "quantity": 100.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Ripe Tomatoes", "inventory_item_code": "INV-012", "inventory_item_name": "Ripe Tomatoes", "quantity": 100.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Spices & Masala", "inventory_item_code": "INV-006", "inventory_item_name": "Spices & Masala", "quantity": 50.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Cooking Oil", "inventory_item_code": "INV-007", "inventory_item_name": "Cooking Oil", "quantity": 30.0, "unit": "ml", "wastage_pct": 0.0, "is_mapped": True},
					]
				}
			}
		},
		"ITEM-016": { # Chicken Curry
			"status": "Draft",
			"is_unverified": True,
			"wastage_pct": 0.0,
			"portions": {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": 0.0,
					"ingredients": [
						{"ingredient_name": "Chicken", "inventory_item_code": "INV-001", "inventory_item_name": "Chicken", "quantity": 300.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Fresh Onions", "inventory_item_code": "INV-011", "inventory_item_name": "Fresh Onions", "quantity": 120.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Ripe Tomatoes", "inventory_item_code": "INV-012", "inventory_item_name": "Ripe Tomatoes", "quantity": 100.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Spices & Masala", "inventory_item_code": "INV-006", "inventory_item_name": "Spices & Masala", "quantity": 45.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Cooking Oil", "inventory_item_code": "INV-007", "inventory_item_name": "Cooking Oil", "quantity": 40.0, "unit": "ml", "wastage_pct": 0.0, "is_mapped": True},
					]
				}
			}
		},
		"ITEM-017": { # Kadai Chicken
			"status": "Draft",
			"is_unverified": True,
			"wastage_pct": 0.0,
			"portions": {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": 0.0,
					"ingredients": [
						{"ingredient_name": "Chicken", "inventory_item_code": "INV-001", "inventory_item_name": "Chicken", "quantity": 300.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Fresh Onions", "inventory_item_code": "INV-011", "inventory_item_name": "Fresh Onions", "quantity": 100.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Spices & Masala", "inventory_item_code": "INV-006", "inventory_item_name": "Spices & Masala", "quantity": 50.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Cooking Oil", "inventory_item_code": "INV-007", "inventory_item_name": "Cooking Oil", "quantity": 40.0, "unit": "ml", "wastage_pct": 0.0, "is_mapped": True},
					]
				}
			}
		},
		"ITEM-018": { # Veg Biryani
			"status": "Draft",
			"is_unverified": True,
			"wastage_pct": 0.0,
			"portions": {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": 0.0,
					"ingredients": [
						{"ingredient_name": "Basmati Rice", "inventory_item_code": "INV-004", "inventory_item_name": "Basmati Rice", "quantity": 250.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Potatoes", "inventory_item_code": "INV-013", "inventory_item_name": "Potatoes", "quantity": 80.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Fresh Onions", "inventory_item_code": "INV-011", "inventory_item_name": "Fresh Onions", "quantity": 80.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Spices & Masala", "inventory_item_code": "INV-006", "inventory_item_name": "Spices & Masala", "quantity": 40.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Cooking Oil", "inventory_item_code": "INV-007", "inventory_item_name": "Cooking Oil", "quantity": 30.0, "unit": "ml", "wastage_pct": 0.0, "is_mapped": True},
					]
				}
			}
		},
		"ITEM-019": { # Jeera Rice
			"status": "Draft",
			"is_unverified": True,
			"wastage_pct": 0.0,
			"portions": {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": 0.0,
					"ingredients": [
						{"ingredient_name": "Basmati Rice", "inventory_item_code": "INV-004", "inventory_item_name": "Basmati Rice", "quantity": 200.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Cream & Butter", "inventory_item_code": "INV-003", "inventory_item_name": "Cream & Butter", "quantity": 30.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Spices & Masala", "inventory_item_code": "INV-006", "inventory_item_name": "Spices & Masala", "quantity": 20.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
					]
				}
			}
		},
		"ITEM-020": { # Butter Naan
			"status": "Draft",
			"is_unverified": True,
			"wastage_pct": 0.0,
			"portions": {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": 0.0,
					"ingredients": [
						{"ingredient_name": "Maida", "inventory_item_code": "INV-005", "inventory_item_name": "Flour (Maida/Atta)", "quantity": 120.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Curd", "inventory_item_code": "", "inventory_item_name": "", "quantity": 20.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": False},
						{"ingredient_name": "Butter", "inventory_item_code": "INV-003", "inventory_item_name": "Cream & Butter", "quantity": 15.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Sugar", "inventory_item_code": "INV-016", "inventory_item_name": "Refined Sugar", "quantity": 5.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
					]
				}
			}
		},
		"ITEM-021": { # Chocolate Brownie
			"status": "Draft",
			"is_unverified": True,
			"wastage_pct": 0.0,
			"portions": {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": 0.0,
					"ingredients": [
						{"ingredient_name": "Flour (Maida/Atta)", "inventory_item_code": "INV-005", "inventory_item_name": "Flour (Maida/Atta)", "quantity": 80.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Refined Sugar", "inventory_item_code": "INV-016", "inventory_item_name": "Refined Sugar", "quantity": 60.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Cream & Butter", "inventory_item_code": "INV-003", "inventory_item_name": "Cream & Butter", "quantity": 50.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Cocoa Powder", "inventory_item_code": "", "inventory_item_name": "", "quantity": 30.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": False},
					]
				}
			}
		},
		"ITEM-022": { # Sweet Lassi
			"status": "Draft",
			"is_unverified": True,
			"wastage_pct": 0.0,
			"portions": {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": 0.0,
					"ingredients": [
						{"ingredient_name": "Curd", "inventory_item_code": "", "inventory_item_name": "", "quantity": 200.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": False},
						{"ingredient_name": "Dairy Milk", "inventory_item_code": "INV-008", "inventory_item_name": "Dairy Milk", "quantity": 50.0, "unit": "ml", "wastage_pct": 0.0, "is_mapped": True},
						{"ingredient_name": "Refined Sugar", "inventory_item_code": "INV-016", "inventory_item_name": "Refined Sugar", "quantity": 30.0, "unit": "g", "wastage_pct": 0.0, "is_mapped": True},
					]
				}
			}
		},
	}

	DEFAULT_RESTAURANT_INFO = {
		"name": "IZEN BISTRO",
		"tagline": "",
		"address": "2nd Floor, 779, 4th Cross, 11th Block,\nPapreddy Palya, 2nd Stage, Nagarbhavi,\nBengaluru, Karnataka - 560072",
		"address_lines": [
			"2nd Floor, 779, 4th Cross, 11th Block,",
			"Papreddy Palya, 2nd Stage, Nagarbhavi,",
			"Bengaluru, Karnataka - 560072"
		],
		"phone": "",
		"email": "",
		"gstin": "",
		"fssai": "",
		"website": "",
	}

	@classmethod
	def get_restaurant_info(cls):
		"""
		Returns centralized restaurant identity and configuration.
		All customer bills, receipts, prints and PDF templates read from this single source.
		"""
		data = cls.get_data()
		info = data.get("restaurant_info")
		if not info or not isinstance(info, dict) or not info.get("name"):
			info = copy.deepcopy(cls.DEFAULT_RESTAURANT_INFO)
			data["restaurant_info"] = info
			cls.save_data(data)
		else:
			if not info.get("name") or info.get("name") != "IZEN BISTRO":
				info["name"] = "IZEN BISTRO"
			if not info.get("address"):
				info["address"] = cls.DEFAULT_RESTAURANT_INFO["address"]
			if not info.get("address_lines"):
				info["address_lines"] = [line.strip() for line in info["address"].split("\n") if line.strip()]
		return info

	@classmethod
	def update_restaurant_info(cls, **kwargs):
		"""
		Updates the centralized restaurant configuration.
		"""
		data = cls.get_data()
		info = cls.get_restaurant_info()
		for k, v in kwargs.items():
			if v is not None:
				info[k] = v
		if "address" in kwargs and kwargs["address"]:
			info["address_lines"] = [line.strip() for line in kwargs["address"].split("\n") if line.strip()]
		data["restaurant_info"] = info
		cls.save_data(data)
		return info

	@classmethod
	def get_file_path(cls):
		return frappe.get_site_path(STORE_FILENAME)

	@classmethod
	def get_data(cls):
		"""
		Loads persistent demo data from the site-level JSON file.
		Initializes from DEFAULT_DATA if file does not exist.
		Ensures customers and tables are harmonized with rich customer objects.
		"""
		path = cls.get_file_path()
		data = None
		if os.path.exists(path):
			try:
				with open(path, "r", encoding="utf-8") as f:
					data = json.load(f)
			except Exception as e:
				frappe.log_error(f"Error reading {STORE_FILENAME}: {str(e)}")

		if not data:
			data = copy.deepcopy(DEFAULT_DATA)
			cls.save_data(data)
			return data

		# Self-healing & schema validation for customer objects
		customers = data.get("customers", [])
		needs_save = False

		rich_customers = []
		cust_lookup = {}
		for i, c in enumerate(customers):
			if isinstance(c, str):
				default_match = next((dc for dc in DEFAULT_DATA.get("customers", []) if dc["name"].lower() == c.lower()), None)
				if default_match:
					rich_c = copy.deepcopy(default_match)
				else:
					rich_c = {
						"customer_id": f"CUST-{i+1:04d}",
						"name": c,
						"mobile": f"982001{i+1:04d}",
						"created_at": "2026-10-15 12:00:00",
						"last_visit": "2026-11-02 18:00:00",
						"total_visits": 1,
					}
				rich_customers.append(rich_c)
				cust_lookup[rich_c["name"].lower()] = rich_c
				needs_save = True
			elif isinstance(c, dict):
				rich_customers.append(c)
				if c.get("name"):
					cust_lookup[c["name"].lower()] = c

		data["customers"] = rich_customers

		# Harmonize tables
		for t in data.get("tables", []):
			c_name = t.get("customer")
			if c_name and (not t.get("customer_id") or not t.get("customer_mobile")):
				match = cust_lookup.get(c_name.lower())
				if match:
					t["customer_id"] = match.get("customer_id", "")
					t["customer_mobile"] = match.get("mobile", "")
					needs_save = True

		# Harmonize orders
		for o in data.get("orders", []):
			c_name = o.get("customer")
			if c_name and (not o.get("customer_id") or not o.get("customer_mobile")):
				match = cust_lookup.get(c_name.lower())
				if match:
					o["customer_id"] = match.get("customer_id", "")
					o["customer_mobile"] = match.get("mobile", "")
					needs_save = True

		# Harmonize restaurant_info branding
		rest_info = data.get("restaurant_info")
		if not rest_info or not isinstance(rest_info, dict) or rest_info.get("name") != "IZEN BISTRO":
			data["restaurant_info"] = copy.deepcopy(cls.DEFAULT_RESTAURANT_INFO)
			needs_save = True

		# Harmonize bills list
		bills = data.setdefault("bills", [])
		existing_bill_orders = {b.get("order_id") for b in bills if b.get("order_id")}
		for o in data.get("orders", []):
			if o.get("status") in ["Billed", "Paid"] and o.get("order_id") not in existing_bill_orders:
				subtotal = o.get("subtotal", 0)
				tax = o.get("tax", 0)
				total = o.get("total", 0)
				cgst = round(tax / 2.0, 2)
				sgst = round(tax - cgst, 2)
				existing_nums = []
				for b in bills:
					b_no = b.get("bill_no", "")
					if b_no.startswith("BILL-2026-"):
						try:
							existing_nums.append(int(b_no.split("-")[-1]))
						except ValueError:
							pass
				b_num = (max(existing_nums) + 1) if existing_nums else 1
				bill_obj = {
					"bill_no": f"BILL-2026-{b_num:04d}",
					"order_id": o.get("order_id"),
					"table_no": o.get("table_no", ""),
					"area": o.get("area", "Main Dining Hall"),
					"customer_id": o.get("customer_id", ""),
					"customer_name": o.get("customer", "Guest"),
					"customer_mobile": o.get("customer_mobile", ""),
					"bill_date": o.get("created_at", "").split(" ")[0] if " " in o.get("created_at", "") else frappe.utils.nowdate(),
					"bill_time": o.get("created_time_str") or "07:00 PM",
					"created_at": o.get("created_at") or frappe.utils.now_datetime().strftime("%Y-%m-%d %H:%M:%S"),
					"items": copy.deepcopy(o.get("items", [])),
					"subtotal": subtotal,
					"formatted_subtotal": f"₹{subtotal:,}",
					"cgst": cgst,
					"formatted_cgst": f"₹{cgst:,}",
					"sgst": sgst,
					"formatted_sgst": f"₹{sgst:,}",
					"tax": tax,
					"formatted_tax": f"₹{tax:,}",
					"total": total,
					"formatted_total": o.get("formatted_amount", f"₹{total:,}"),
					"payment_status": o.get("payment_status", "Unpaid"),
					"payment_method": o.get("payment_method", ""),
					"payment_reference": o.get("payment_reference", ""),
					"paid_at": o.get("paid_at", ""),
					"notes": o.get("notes", ""),
				}
				o["bill_no"] = bill_obj["bill_no"]
				bills.append(bill_obj)
				existing_bill_orders.add(o.get("order_id"))
				needs_save = True

		# Harmonize menu items to the 8 professional categories & images
		category_updates = {
			"ITEM-001": ("Butter Chicken", "Main Course – Non-Veg"),
			"ITEM-002": ("Paneer Tikka", "Starters"),
			"ITEM-003": ("Dal Makhani", "Main Course – Veg"),
			"ITEM-004": ("Chicken Biryani", "Rice & Biryani"),
			"ITEM-005": ("Garlic Naan", "Breads"),
			"ITEM-006": ("Tandoori Roti", "Breads"),
			"ITEM-007": ("Gulab Jamun", "Desserts"),
			"ITEM-008": ("Fresh Lime Soda", "Beverages"),
			"ITEM-009": ("Veg Spring Rolls", "Starters"),
			"ITEM-010": ("Masala Chai", "Beverages"),
		}
		default_images = {
			"ITEM-001": "/assets/restaurant_management/images/dishes/butter_chicken.jpg",
			"ITEM-002": "/assets/restaurant_management/images/dishes/paneer_tikka.jpg",
			"ITEM-003": "/assets/restaurant_management/images/dishes/dal_makhani.jpg",
			"ITEM-004": "/assets/restaurant_management/images/dishes/biryani_bowl.jpg",
			"ITEM-005": "/assets/restaurant_management/images/dishes/garlic_naan.jpg",
			"ITEM-006": "/assets/restaurant_management/images/dishes/tandoori_roti.jpg",
			"ITEM-007": "/assets/restaurant_management/images/dishes/gulab_jamun.jpg",
			"ITEM-008": "/assets/restaurant_management/images/dishes/mint_limeade.jpg",
			"ITEM-009": "/assets/restaurant_management/images/dishes/spring_rolls.jpg",
			"ITEM-010": "/assets/restaurant_management/images/dishes/masala_chai.jpg",
			"ITEM-011": "/assets/restaurant_management/images/dishes/chicken_tikka.jpg",
			"ITEM-012": "/assets/restaurant_management/images/dishes/tomato_soup.jpg",
			"ITEM-013": "/assets/restaurant_management/images/dishes/sweet_corn_soup.jpg",
			"ITEM-014": "/assets/restaurant_management/images/dishes/paneer_butter_masala.jpg",
			"ITEM-015": "/assets/restaurant_management/images/dishes/kadai_paneer.jpg",
			"ITEM-016": "/assets/restaurant_management/images/dishes/chicken_curry.jpg",
			"ITEM-017": "/assets/restaurant_management/images/dishes/kadai_chicken.jpg",
			"ITEM-018": "/assets/restaurant_management/images/dishes/veg_biryani.jpg",
			"ITEM-019": "/assets/restaurant_management/images/dishes/jeera_rice.jpg",
			"ITEM-020": "/assets/restaurant_management/images/dishes/butter_naan.jpg",
			"ITEM-021": "/assets/restaurant_management/images/dishes/chocolate_brownie.jpg",
			"ITEM-022": "/assets/restaurant_management/images/dishes/sweet_lassi.jpg",
		}

		current_menu_items = data.setdefault("menu_items", [])
		current_item_map = {m.get("item_id"): m for m in current_menu_items}

		# Update existing items with migrated categories and names
		for m_id, (m_name, m_cat) in category_updates.items():
			if m_id in current_item_map:
				it = current_item_map[m_id]
				if it.get("category") != m_cat:
					it["category"] = m_cat
					needs_save = True
				if it.get("name") != m_name:
					it["name"] = m_name
					needs_save = True

		# Ensure all items have their images, recipes, and structured recipe_details
		for it in current_menu_items:
			m_id = it.get("item_id")
			if not it.get("image") and m_id in default_images:
				it["image"] = default_images[m_id]
				needs_save = True
			
			rec_det = it.get("recipe_details")
			if not rec_det or not isinstance(rec_det, dict) or not rec_det.get("portions"):
				if hasattr(cls, "DEFAULT_DISH_RECIPES") and m_id in cls.DEFAULT_DISH_RECIPES:
					it["recipe_details"] = copy.deepcopy(cls.DEFAULT_DISH_RECIPES[m_id])
					needs_save = True
				else:
					it["recipe_details"] = {
						"status": "Draft",
						"is_unverified": True,
						"wastage_pct": 0.0,
						"portions": {
							"Regular": {
								"portion_name": "Regular",
								"is_default": True,
								"wastage_pct": 0.0,
								"ingredients": []
							}
						}
					}
					needs_save = True

			# Synchronize legacy recipe dictionary with default Approved portion
			if it.get("recipe_details", {}).get("status") == "Approved":
				reg_p = it["recipe_details"]["portions"].get("Regular") or next(iter(it["recipe_details"]["portions"].values()), None)
				if reg_p:
					clean_legacy = {}
					for ing in reg_p.get("ingredients", []):
						if ing.get("is_mapped") and ing.get("quantity"):
							iv_match = next((iv for iv in data.get("inventory", []) if iv.get("item_code") == ing.get("inventory_item_code") or iv.get("name") == ing.get("ingredient_name")), None)
							if iv_match:
								target_u = iv_match.get("unit", "kg")
								conv = cls.convert_quantity(float(ing.get("quantity", 0)), ing.get("unit", "g"), target_u)
								clean_legacy[iv_match["name"]] = round(conv, 3)
					if clean_legacy:
						it["recipe"] = clean_legacy
			else:
				it["recipe"] = {}

		# Add any missing default items (e.g. ITEM-011 through ITEM-022)
		for def_item in DEFAULT_DATA["menu_items"]:
			def_id = def_item["item_id"]
			if def_id not in current_item_map:
				current_menu_items.append(copy.deepcopy(def_item))
				current_item_map[def_id] = def_item
				needs_save = True

		# Harmonize Inventory, Movements, Suppliers, Batches, POs, Wastage
		inv_items = data.setdefault("inventory", [])
		inv_name_map = {item.get("name"): item for item in inv_items if item.get("name")}

		for master_item in cls.MASTER_INVENTORY:
			name = master_item["name"]
			if name in inv_name_map:
				curr = inv_name_map[name]
				for key in ["item_code", "category", "location", "cost_price", "reorder_level", "unit"]:
					if key not in curr or curr[key] is None or (key in ["item_code", "category", "location"] and not curr[key]):
						curr[key] = master_item[key]
						needs_save = True
				if not curr.get("last_updated"):
					curr["last_updated"] = "2026-11-03 10:00:00"
					needs_save = True
			else:
				new_item = copy.deepcopy(master_item)
				new_item["last_updated"] = "2026-11-03 10:00:00"
				inv_items.append(new_item)
				inv_name_map[name] = new_item
				needs_save = True

		if not data.get("suppliers"):
			data["suppliers"] = copy.deepcopy(cls.DEFAULT_SUPPLIERS)
			needs_save = True

		if not data.get("purchase_orders"):
			data["purchase_orders"] = copy.deepcopy(cls.DEFAULT_PURCHASE_ORDERS)
			needs_save = True

		if not data.get("batches"):
			data["batches"] = copy.deepcopy(cls.DEFAULT_BATCHES)
			needs_save = True

		if not data.get("wastage_records"):
			data["wastage_records"] = copy.deepcopy(cls.DEFAULT_WASTAGE_RECORDS)
			needs_save = True

		if not data.get("stock_movements"):
			data["stock_movements"] = copy.deepcopy(cls.DEFAULT_STOCK_MOVEMENTS)
			needs_save = True

		if needs_save:
			cls.save_data(data)

		cls._cached_data = data
		return data

	@classmethod
	def save_data(cls, data):
		"""
		Persists demo data atomically to disk.
		"""
		cls._cached_data = data
		path = cls.get_file_path()
		tmp_path = path + ".tmp"
		with open(tmp_path, "w", encoding="utf-8") as f:
			json.dump(data, f, indent=2, ensure_ascii=False)
		os.replace(tmp_path, path)

	@classmethod
	def reset_to_default(cls):
		"""
		Resets shared store back to default demo state.
		"""
		data = copy.deepcopy(DEFAULT_DATA)
		cls.save_data(data)
		return data

	# =========================================================================
	# Customer Operations & Registry
	# =========================================================================
	@staticmethod
	def normalize_and_validate_mobile(mobile):
		if not mobile:
			frappe.throw(_("Customer mobile number is required."))
		digits = re.sub(r"\D", "", str(mobile))
		if len(digits) == 12 and digits.startswith("91"):
			digits = digits[2:]
		elif len(digits) == 11 and digits.startswith("0"):
			digits = digits[1:]
		if len(digits) != 10:
			frappe.throw(_("Invalid mobile number '{0}'. Mobile number must be 10 digits.").format(mobile))
		return digits

	@classmethod
	def lookup_customer(cls, mobile=None, customer_id=None):
		data = cls.get_data()
		customers = data.get("customers", [])
		target = None

		if customer_id:
			cid = str(customer_id).strip().upper()
			for c in customers:
				if isinstance(c, dict) and c.get("customer_id") == cid:
					target = c
					break
		elif mobile:
			try:
				clean_mobile = cls.normalize_and_validate_mobile(mobile)
				for c in customers:
					if isinstance(c, dict) and c.get("mobile") == clean_mobile:
						target = c
						break
			except Exception:
				target = None

		if not target:
			return None

		orders = data.get("orders", [])
		cust_orders = [
			o for o in orders
			if (o.get("customer_id") and o.get("customer_id") == target.get("customer_id"))
			or (o.get("customer_mobile") and o.get("customer_mobile") == target.get("mobile"))
			or (o.get("customer") and o.get("customer").lower() == target.get("name", "").lower())
		]

		total_spent = sum(o.get("total", 0) for o in cust_orders)
		res = copy.deepcopy(target)
		res["order_count"] = len(cust_orders)
		res["total_spent"] = total_spent
		res["formatted_spent"] = f"₹{total_spent:,}"
		res["recent_orders"] = [
			{
				"order_id": o.get("order_id"),
				"table_no": o.get("table_no"),
				"total": o.get("total"),
				"formatted_amount": o.get("formatted_amount", f"₹{o.get('total', 0):,}"),
				"status": o.get("status"),
				"payment_status": o.get("payment_status"),
				"time_ago": o.get("time_ago", "Recently"),
				"items_count": sum(it.get("qty", 1) for it in o.get("items", [])),
			}
			for o in cust_orders[:5]
		]
		return res

	@classmethod
	def get_or_create_customer(cls, name, mobile, update_visit=False):
		data = cls.get_data()
		customers = data.get("customers", [])
		clean_mobile = cls.normalize_and_validate_mobile(mobile)
		now_str = frappe.utils.now_datetime().strftime("%Y-%m-%d %H:%M:%S")

		target = None
		for c in customers:
			if isinstance(c, dict) and c.get("mobile") == clean_mobile:
				target = c
				break

		if target:
			clean_name = (name or "").strip()
			if clean_name and clean_name not in ["Walk-in Guest", "Guest Party", "Reserved Party"] and target.get("name") in ["", "Walk-in Guest", "Guest Party"]:
				target["name"] = clean_name
			if update_visit:
				target["total_visits"] = target.get("total_visits", 0) + 1
				target["last_visit"] = now_str
			cls.save_data(data)
			return target

		clean_name = (name or "").strip()
		if not clean_name or clean_name in ["Walk-in Guest", "Guest Party", "Reserved Party"]:
			frappe.throw(_("Customer name is required to register a new customer with mobile {0}.").format(clean_mobile))

		existing_nums = []
		for c in customers:
			if isinstance(c, dict):
				m = re.search(r"CUST-(\d+)", c.get("customer_id", ""))
				if m:
					existing_nums.append(int(m.group(1)))
		next_num = max(existing_nums, default=0) + 1
		new_id = f"CUST-{next_num:04d}"

		new_cust = {
			"customer_id": new_id,
			"name": clean_name,
			"mobile": clean_mobile,
			"created_at": now_str,
			"last_visit": now_str if update_visit else "",
			"total_visits": 1 if update_visit else 0,
		}
		customers.append(new_cust)
		cls.save_data(data)
		return new_cust

	@classmethod
	def get_customer_history(cls, customer_id_or_mobile):
		identifier = str(customer_id_or_mobile or "").strip()
		cust = None
		if identifier.upper().startswith("CUST-"):
			cust = cls.lookup_customer(customer_id=identifier)
		else:
			try:
				cust = cls.lookup_customer(mobile=identifier)
			except Exception:
				cust = None
			if not cust:
				cust = cls.lookup_customer(customer_id=identifier)

		if not cust:
			for c in cls.get_data().get("customers", []):
				if isinstance(c, dict) and c.get("name", "").strip().lower() == identifier.lower():
					cust = cls.lookup_customer(customer_id=c.get("customer_id"))
					break

		if not cust:
			frappe.throw(_("Customer '{0}' not found").format(customer_id_or_mobile))

		data = cls.get_data()
		orders = data.get("orders", [])
		cust_orders = [
			o for o in orders
			if (o.get("customer_id") and o.get("customer_id") == cust["customer_id"])
			or (o.get("customer_mobile") and o.get("customer_mobile") == cust["mobile"])
			or (o.get("customer") and o.get("customer").lower() == cust["name"].lower())
		]

		dish_counts = {}
		for o in cust_orders:
			for it in o.get("items", []):
				dname = it.get("name")
				dish_counts[dname] = dish_counts.get(dname, 0) + it.get("qty", 1)

		sorted_dishes = sorted(dish_counts.items(), key=lambda x: x[1], reverse=True)[:5]
		favorites = [{"name": d[0], "count": d[1]} for d in sorted_dishes]

		return {
			"customer": cust,
			"total_orders": len(cust_orders),
			"total_spent": sum(o.get("total", 0) for o in cust_orders),
			"formatted_total_spent": f"₹{sum(o.get('total', 0) for o in cust_orders):,}",
			"orders": cust_orders,
			"favorite_dishes": favorites,
		}

	@classmethod
	def get_customers_list(cls, search=None):
		"""
		Returns all customers in the registry with visit and spending statistics.
		"""
		data = cls.get_data()
		customers = data.get("customers", [])
		orders = data.get("orders", [])

		customer_stats = {}
		for o in orders:
			cid = o.get("customer_id")
			cmob = o.get("customer_mobile")
			cname = o.get("customer")
			tot = o.get("total", 0)
			for key in [cid, cmob, cname.lower() if cname else None]:
				if key:
					if key not in customer_stats:
						customer_stats[key] = {"orders": 0, "spent": 0}
					customer_stats[key]["orders"] += 1
					customer_stats[key]["spent"] += tot

		res = []
		for c in customers:
			if not isinstance(c, dict):
				continue
			cid = c.get("customer_id", "")
			mob = c.get("mobile", "")
			name = c.get("name", "")

			if search:
				s = search.lower().strip()
				if s not in cid.lower() and s not in mob and s not in name.lower():
					continue

			stat = customer_stats.get(cid) or customer_stats.get(mob) or customer_stats.get(name.lower()) or {}
			spent = stat.get("spent", 0)
			orders_count = stat.get("orders", 0)

			res.append({
				"customer_id": cid,
				"name": name,
				"mobile": mob,
				"total_visits": c.get("total_visits", max(1, orders_count)),
				"last_visit": c.get("last_visit", "Recent"),
				"total_spent": spent,
				"formatted_spent": f"₹{spent:,}",
				"created_at": c.get("created_at", ""),
			})

		return sorted(res, key=lambda x: str(x.get("last_visit", "")), reverse=True)

	@classmethod
	def get_bill_receipt_data(cls, order_id_or_bill_no):
		data = cls.get_data()
		# Find bill
		bill = next((b for b in data.get("bills", []) if b.get("bill_no") == order_id_or_bill_no or b.get("order_id") == order_id_or_bill_no), None)

		# Find order
		order_id = bill.get("order_id") if bill else order_id_or_bill_no
		order = next((o for o in data.get("orders", []) if o.get("order_id") == order_id), None)

		if not order and not bill:
			frappe.throw(_("Bill or order {0} not found").format(order_id_or_bill_no))

		source = bill if bill else order
		subtotal = source.get("subtotal", 0)
		tax = source.get("tax", 0)
		total = source.get("total", 0)
		cgst = source.get("cgst", round(tax / 2.0, 2))
		sgst = source.get("sgst", round(tax - cgst, 2))

		bill_no = (bill.get("bill_no") if bill else None) or (order.get("bill_no") if order else None) or f"BILL-{str(order_id).replace('ORD-', '')}"
		receipt_no = f"REC-{str(order_id).replace('ORD-', '')}"
		now_str = frappe.utils.now_datetime().strftime("%Y-%m-%d %H:%M:%S")
		created_at = source.get("created_at") or now_str
		date_str = source.get("bill_date") or (created_at.split(" ")[0] if " " in created_at else frappe.utils.nowdate())
		time_str = source.get("bill_time") or source.get("created_time_str") or (created_at.split(" ")[1] if " " in created_at else frappe.utils.nowtime())

		receipt_data = {
			"restaurant": cls.get_restaurant_info(),
			"bill_no": bill_no,
			"receipt_no": receipt_no,
			"order_id": source.get("order_id", order_id),
			"date": date_str,
			"time": time_str,
			"table_no": source.get("table_no", ""),
			"area": source.get("area", "Main Dining Hall"),
			"customer_name": source.get("customer_name") or source.get("customer", "Guest"),
			"customer_mobile": source.get("customer_mobile", ""),
			"customer_id": source.get("customer_id", ""),
			"items": [
				{
					"item_id": it.get("item_id"),
					"name": it.get("name"),
					"qty": it.get("qty", 1),
					"price": it.get("price", 0),
					"amount": it.get("amount", it.get("price", 0) * it.get("qty", 1)),
					"formatted_price": f"₹{it.get('price', 0):,}",
					"formatted_amount": f"₹{it.get('amount', it.get('price', 0) * it.get('qty', 1)):,}",
				}
				for it in source.get("items", [])
			],
			"subtotal": subtotal,
			"formatted_subtotal": f"₹{subtotal:,}",
			"cgst": cgst,
			"formatted_cgst": f"₹{cgst:,}",
			"sgst": sgst,
			"formatted_sgst": f"₹{sgst:,}",
			"tax": tax,
			"formatted_tax": f"₹{tax:,}",
			"total": total,
			"formatted_total": source.get("formatted_amount", f"₹{total:,}"),
			"payment_status": source.get("payment_status", "Unpaid"),
			"payment_method": source.get("payment_method") or ("Pending" if source.get("payment_status") != "Paid" else "Cash"),
			"payment_reference": source.get("payment_reference", ""),
			"paid_at": source.get("paid_at", ""),
			"notes": source.get("notes", ""),
		}
		receipt_data["receipt_html"] = cls.render_receipt_html(receipt_data)
		return receipt_data

	@classmethod
	def render_receipt_html(cls, receipt):
		"""
		Renders the complete printable customer-facing receipt / bill HTML.
		Guarantees consistent branding across Bill preview, Print, and PDF download.
		"""
		rest = receipt.get("restaurant") or cls.get_restaurant_info()
		name = rest.get("name") or "IZEN BISTRO"
		tagline = rest.get("tagline") or ""
		address = rest.get("address") or ""
		address_lines = rest.get("address_lines") or ([line.strip() for line in address.split("\n") if line.strip()] if address else [])
		address_html = "<br>".join(frappe.utils.escape_html(line) for line in address_lines) if address_lines else frappe.utils.escape_html(address)
		phone = rest.get("phone") or ""
		gstin = rest.get("gstin") or ""
		fssai = rest.get("fssai") or ""
		is_paid = receipt.get("payment_status") == "Paid"

		phone_html = f'<div style="font-size: 0.74rem; color: #64748b; margin-top: 0.15rem;">Tel: {frappe.utils.escape_html(phone)}</div>' if phone else ""
		gstin_fssai_parts = []
		if gstin:
			gstin_fssai_parts.append(f"GSTIN: {frappe.utils.escape_html(gstin)}")
		if fssai:
			gstin_fssai_parts.append(f"FSSAI: {frappe.utils.escape_html(fssai)}")
		gstin_fssai_html = f'<div style="font-size: 0.72rem; color: #64748b; margin-top: 0.25rem; font-weight: 600;">{" | ".join(gstin_fssai_parts)}</div>' if gstin_fssai_parts else ""
		tagline_html = f'<div style="font-size: 0.78rem; color: #475569; margin-top: 0.2rem;">{frappe.utils.escape_html(tagline)}</div>' if tagline else ""

		items_rows = ""
		for it in receipt.get("items", []):
			name_esc = frappe.utils.escape_html(str(it.get("name", "")))
			item_id_esc = frappe.utils.escape_html(str(it.get("item_id", "")))
			price_fmt = it.get("formatted_price") or f"₹{it.get('price', 0):,}"
			amt_fmt = it.get("formatted_amount") or f"₹{it.get('amount', 0):,}"
			qty = it.get("qty", 1)
			items_rows += f"""
				<tr>
					<td style="padding: 6px 0; border-bottom: 1px dashed #e2e8f0;">
						<div style="font-weight: 600;">{name_esc}</div>
						<div style="font-size: 0.74rem; color: #64748b;">{item_id_esc} &bull; {price_fmt} &times; {qty}</div>
					</td>
					<td style="text-align: center; vertical-align: middle; padding: 6px 8px; border-bottom: 1px dashed #e2e8f0;">{qty}</td>
					<td style="text-align: right; vertical-align: middle; padding: 6px 0; border-bottom: 1px dashed #e2e8f0; font-weight: 600;">{amt_fmt}</td>
				</tr>
			"""

		customer_name = frappe.utils.escape_html(str(receipt.get("customer_name") or "Guest"))
		customer_id = receipt.get("customer_id") or ""
		cust_display = f"{customer_name} ({customer_id})" if customer_id else customer_name
		mobile_html = f'<div><strong>Mobile:</strong> +91 {frappe.utils.escape_html(str(receipt.get("customer_mobile")))}</div>' if receipt.get("customer_mobile") else ""

		badge_bg = "#ecfdf5" if is_paid else "#fff7ed"
		badge_color = "#047857" if is_paid else "#c2410c"
		badge_border = "#a7f3d0" if is_paid else "#fed7aa"
		badge_text = "PAID" if is_paid else "PAYMENT PENDING"

		subtotal_fmt = receipt.get("formatted_subtotal") or f"₹{receipt.get('subtotal', 0):,}"
		cgst_fmt = receipt.get("formatted_cgst") or f"₹{receipt.get('cgst', 0):,}"
		sgst_fmt = receipt.get("formatted_sgst") or f"₹{receipt.get('sgst', 0):,}"
		tax_fmt = receipt.get("formatted_tax") or f"₹{receipt.get('tax', 0):,}"
		total_fmt = receipt.get("formatted_total") or f"₹{receipt.get('total', 0):,}"
		payment_method = receipt.get("payment_method") or "Cash"

		return f"""
			<div class="restaurant-receipt-printable" id="printable-receipt-container" style="font-family: 'Courier New', Courier, monospace; max-width: 440px; margin: 0 auto; background: #ffffff; color: #0f172a; padding: 1.25rem; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
				<!-- Restaurant Header -->
				<div style="text-align: center; border-bottom: 1px dashed #94a3b8; padding-bottom: 0.75rem; margin-bottom: 0.75rem;">
					<h2 style="margin: 0; font-size: 1.25rem; font-weight: 800; letter-spacing: 1px; color: #0f172a; text-transform: uppercase;">{frappe.utils.escape_html(name)}</h2>
					{tagline_html}
					<div style="font-size: 0.74rem; color: #64748b; margin-top: 0.25rem; line-height: 1.4;">{address_html}</div>
					{phone_html}
					{gstin_fssai_html}
				</div>

				<!-- Receipt Metadata -->
				<div style="font-size: 0.78rem; border-bottom: 1px dashed #94a3b8; padding-bottom: 0.6rem; margin-bottom: 0.75rem;">
					<div style="display: flex; justify-content: space-between;">
						<span><strong>Bill No:</strong> {receipt.get('bill_no') or receipt.get('receipt_no', '')}</span>
						<span><strong>Date:</strong> {receipt.get('date', '')} {receipt.get('time', '')}</span>
					</div>
					<div style="display: flex; justify-content: space-between; margin-top: 0.2rem;">
						<span><strong>Table:</strong> {receipt.get('table_no', '')} ({receipt.get('area', '')})</span>
						<span><strong>Order ID:</strong> {receipt.get('order_id', '')}</span>
					</div>
					<div style="margin-top: 0.35rem; padding-top: 0.35rem; border-top: 1px dotted #cbd5e1; display: flex; justify-content: space-between; align-items: center;">
						<div>
							<div><strong>Customer:</strong> {cust_display}</div>
							{mobile_html}
						</div>
						<span class="badge" style="font-family: inherit; font-size: 0.75rem; background: {badge_bg}; color: {badge_color}; border: 1px solid {badge_border}; padding: 3px 6px;">
							{badge_text}
						</span>
					</div>
				</div>

				<!-- Items Table -->
				<table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-bottom: 0.75rem;">
					<thead>
						<tr style="border-bottom: 1px solid #94a3b8; font-weight: 700;">
							<th style="text-align: left; padding-bottom: 4px;">Item Description</th>
							<th style="text-align: center; padding-bottom: 4px; width: 45px;">Qty</th>
							<th style="text-align: right; padding-bottom: 4px; width: 75px;">Amount</th>
						</tr>
					</thead>
					<tbody>
						{items_rows}
					</tbody>
				</table>

				<!-- Totals Breakdown -->
				<div style="border-top: 1px dashed #94a3b8; padding-top: 0.6rem; font-size: 0.82rem;">
					<div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
						<span>Subtotal (Item Total):</span>
						<span style="font-weight: 600;">{subtotal_fmt}</span>
					</div>
					<div style="display: flex; justify-content: space-between; margin-bottom: 0.2rem; color: #475569; font-size: 0.78rem;">
						<span>CGST (2.5%):</span>
						<span>{cgst_fmt}</span>
					</div>
					<div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem; color: #475569; font-size: 0.78rem;">
						<span>SGST (2.5%):</span>
						<span>{sgst_fmt}</span>
					</div>
					<div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-weight: 600; color: #334155;">
						<span>Total GST (5%):</span>
						<span>{tax_fmt}</span>
					</div>
					<div style="display: flex; justify-content: space-between; padding-top: 0.5rem; border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a; font-size: 1.15rem; font-weight: 800; margin-bottom: 0.75rem;">
						<span>GRAND TOTAL:</span>
						<span>{total_fmt}</span>
					</div>
					<div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.25rem;">
						<span>Payment Mode:</span>
						<span style="font-weight: 600;">{payment_method}</span>
					</div>
					{f"""<div style="display: flex; justify-content: space-between; font-size: 0.78rem; margin-bottom: 0.25rem; color: #475569;">
						<span>Payment Ref:</span>
						<span style="font-weight: 600; font-family: monospace;">{frappe.utils.escape_html(str(receipt.get("payment_reference")))}</span>
					</div>""" if receipt.get("payment_reference") else ""}
					{f"""<div style="display: flex; justify-content: space-between; font-size: 0.76rem; margin-bottom: 0.25rem; color: #64748b;">
						<span>Paid At:</span>
						<span>{frappe.utils.escape_html(str(receipt.get("paid_at")))}</span>
					</div>""" if receipt.get("paid_at") else ""}
				</div>

				<!-- Footer Note -->
				<div style="text-align: center; border-top: 1px dashed #94a3b8; padding-top: 0.75rem; margin-top: 0.75rem; font-size: 0.74rem; color: #64748b;">
					<div style="font-weight: 600; color: #334155; margin-bottom: 0.2rem;">Thank you for dining with us!</div>
					<div>Please visit again</div>
					<div style="font-size: 0.68rem; margin-top: 0.35rem; color: #94a3b8;">*** Computer Generated Tax Invoice ***</div>
				</div>
			</div>
		"""

	@classmethod
	def download_bill_pdf(cls, order_id_or_bill_no):
		"""
		Generates and serves a downloadable PDF of the customer bill/receipt.
		Falls back cleanly to printable HTML if wkhtmltopdf is not installed.
		"""
		receipt_data = cls.get_bill_receipt_data(order_id_or_bill_no)
		file_label = receipt_data.get("bill_no") or receipt_data.get("receipt_no") or str(order_id_or_bill_no)
		html = f"""
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="utf-8">
				<title>Bill_{file_label}</title>
				<style>
					body {{ font-family: 'Courier New', Courier, monospace; padding: 20px; color: #0f172a; background: #ffffff; }}
					@media print {{ body {{ padding: 0; }} }}
				</style>
			</head>
			<body>
				{receipt_data["receipt_html"]}
			</body>
			</html>
		"""
		try:
			from frappe.utils.pdf import get_pdf
			pdf_bytes = get_pdf(html)
			frappe.local.response.filename = f"Bill_{file_label}.pdf"
			frappe.local.response.filecontent = pdf_bytes
			frappe.local.response.type = "download"
		except Exception:
			frappe.local.response.filename = f"Bill_{file_label}.html"
			frappe.local.response.filecontent = html.encode("utf-8")
			frappe.local.response.type = "download"

	# =========================================================================
	# Floor & Table Operations
	# =========================================================================
	@classmethod
	def get_floor_data(cls):
		data = cls.get_data()
		tables = data.get("tables", [])

		# Ensure all tables have shape defined (Round or Rectangular)
		round_tables = {"T-01", "T-03", "T-05", "T-07", "T-09", "T-13", "T-14", "T-17"}
		for t in tables:
			if not t.get("shape"):
				t["shape"] = "Round" if (t.get("capacity") == 2 or t.get("table_no") in round_tables) else "Rectangular"

		# Self-healing synchronization: Ensure table status matches actual state
		# If any table is marked Reserved without customer/reservation details, reset to Available
		# If any table is marked Occupied without customer/guest/order details, reset to Available
		changed = False
		for t in tables:
			st = t.get("status", "Available")
			if st == "Reserved":
				if not t.get("customer") and not t.get("reservation_time") and not t.get("reservation_id"):
					t["status"] = "Available"
					t["customer"] = ""
					t["customer_id"] = ""
					t["customer_mobile"] = ""
					t["guests"] = 0
					t["reservation_time"] = ""
					t["reservation_id"] = ""
					t["notes"] = ""
					changed = True
			elif st == "Occupied":
				if not t.get("customer") and not t.get("guests") and not t.get("order_id"):
					t["status"] = "Available"
					t["customer"] = ""
					t["customer_id"] = ""
					t["customer_mobile"] = ""
					t["guests"] = 0
					t["seated_time"] = ""
					t["seated_at"] = ""
					t["order_id"] = ""
					t["order_amount"] = ""
					t["order_status"] = ""
					t["notes"] = ""
					changed = True

		if changed:
			cls.save_data(data)

		total = len(tables)
		occupied = sum(1 for t in tables if t.get("status") == "Occupied")
		reserved = sum(1 for t in tables if t.get("status") == "Reserved")
		available = max(0, total - occupied - reserved)
		occupancy_pct = f"{round((occupied / total) * 100)}%" if total else "0%"

		areas_map = {
			"All Areas": {"count": total, "occupied": occupied, "reserved": reserved, "available": available},
			"Main Dining Hall": {"count": 0, "occupied": 0, "reserved": 0, "available": 0},
			"Garden Patio": {"count": 0, "occupied": 0, "reserved": 0, "available": 0},
			"Rooftop Terrace": {"count": 0, "occupied": 0, "reserved": 0, "available": 0},
		}

		for t in tables:
			area = t.get("area")
			if area in areas_map:
				areas_map[area]["count"] += 1
				if t.get("status") == "Occupied":
					areas_map[area]["occupied"] += 1
				elif t.get("status") == "Reserved":
					areas_map[area]["reserved"] += 1

		for area_name, a_info in areas_map.items():
			if area_name != "All Areas":
				a_info["available"] = max(0, a_info["count"] - a_info["occupied"] - a_info["reserved"])

		areas_list = [
			{
				"name": "All Areas",
				"count": total,
				"occupied": occupied,
				"reserved": reserved,
				"available": available,
			},
			{
				"name": "Main Dining Hall",
				"count": areas_map["Main Dining Hall"]["count"],
				"occupied": areas_map["Main Dining Hall"]["occupied"],
				"reserved": areas_map["Main Dining Hall"]["reserved"],
				"available": areas_map["Main Dining Hall"]["available"],
			},
			{
				"name": "Garden Patio",
				"count": areas_map["Garden Patio"]["count"],
				"occupied": areas_map["Garden Patio"]["occupied"],
				"reserved": areas_map["Garden Patio"]["reserved"],
				"available": areas_map["Garden Patio"]["available"],
			},
			{
				"name": "Rooftop Terrace",
				"count": areas_map["Rooftop Terrace"]["count"],
				"occupied": areas_map["Rooftop Terrace"]["occupied"],
				"reserved": areas_map["Rooftop Terrace"]["reserved"],
				"available": areas_map["Rooftop Terrace"]["available"],
			},
		]

		customers_data = data.get("customers", [])
		sample_customers = [c["name"] if isinstance(c, dict) else c for c in customers_data]
		customers_list = [c for c in customers_data if isinstance(c, dict)]

		return {
			"summary": {
				"total": total,
				"available": available,
				"occupied": occupied,
				"reserved": reserved,
				"occupancy_pct": occupancy_pct,
			},
			"areas": areas_list,
			"tables": tables,
			"sample_customers": sample_customers,
			"customers": customers_list,
			"menu_items": data.get("menu_items", []),
			"orders": data.get("orders", []),
		}

	@classmethod
	def update_table_status(
		cls,
		table_no,
		status,
		customer="",
		customer_mobile="",
		guests=0,
		reservation_time="",
		notes="",
	):
		data = cls.get_data()
		tables = data.get("tables", [])
		target = None

		for t in tables:
			if t["table_no"] == table_no:
				target = t
				break

		if not target:
			frappe.throw(_("Table {0} not found").format(table_no))

		target["status"] = status

		if status == "Occupied":
			cust_record = None
			if customer_mobile:
				cust_record = cls.get_or_create_customer(name=customer, mobile=customer_mobile, update_visit=True)
				data["customers"] = cls.get_data().get("customers", [])
			elif customer:
				for c in data.get("customers", []):
					if isinstance(c, dict) and c.get("name").strip().lower() == customer.strip().lower():
						cust_record = c
						cust_record["total_visits"] = cust_record.get("total_visits", 0) + 1
						cust_record["last_visit"] = frappe.utils.now_datetime().strftime("%Y-%m-%d %H:%M:%S")
						break

			target["customer"] = cust_record["name"] if cust_record else (customer or "Guest Party")
			target["customer_id"] = cust_record["customer_id"] if cust_record else ""
			target["customer_mobile"] = cust_record["mobile"] if cust_record else (customer_mobile or "")
			target["guests"] = int(guests) if guests else target.get("capacity", 2)
			target["seated_time"] = "Just now"
			target["reservation_time"] = ""
			target["notes"] = notes or ""

			# Seating a customer MUST NOT automatically create orders, dishes, or bills
			if not target.get("order_id"):
				target["order_id"] = ""
				target["order_amount"] = ""
				target["order_status"] = "Awaiting Order"

		elif status == "Reserved":
			cust_record = None
			if customer_mobile:
				cust_record = cls.get_or_create_customer(name=customer, mobile=customer_mobile, update_visit=False)
				data["customers"] = cls.get_data().get("customers", [])
			elif customer:
				for c in data.get("customers", []):
					if isinstance(c, dict) and c.get("name").strip().lower() == customer.strip().lower():
						cust_record = c
						break

			target["customer"] = cust_record["name"] if cust_record else (customer or "Reserved Party")
			target["customer_id"] = cust_record["customer_id"] if cust_record else ""
			target["customer_mobile"] = cust_record["mobile"] if cust_record else (customer_mobile or "")
			target["guests"] = int(guests) if guests else target.get("capacity", 2)
			target["seated_time"] = ""
			target["reservation_time"] = reservation_time or "Today"
			target["notes"] = notes or ""
			target["order_id"] = ""
			target["order_amount"] = ""
			target["order_status"] = ""

		elif status == "Available":
			target["customer"] = ""
			target["customer_id"] = ""
			target["customer_mobile"] = ""
			target["guests"] = 0
			target["seated_time"] = ""
			target["reservation_time"] = ""
			target["notes"] = ""
			target["order_id"] = ""
			target["order_amount"] = ""
			target["order_status"] = ""

		cls.save_data(data)
		return cls.get_floor_data()

	@classmethod
	def transfer_table(cls, from_table_no, to_table_no, reason=""):
		"""
		Transfers an occupied table (including guest details, customer ID,
		active orders, and KDS tickets) to an available table.
		Preserves prep statuses, avoids duplicate orders or extra stock deductions.
		"""
		data = cls.get_data()
		tables = data.get("tables", [])
		from_table = next((t for t in tables if t["table_no"] == from_table_no), None)
		to_table = next((t for t in tables if t["table_no"] == to_table_no), None)

		if not from_table:
			frappe.throw(_("Source table {0} not found").format(from_table_no))
		if not to_table:
			frappe.throw(_("Target table {0} not found").format(to_table_no))
		if from_table["status"] != "Occupied":
			frappe.throw(_("Source table {0} is not currently occupied").format(from_table_no))
		if to_table["status"] != "Available":
			frappe.throw(_("Target table {0} is not available (Current status: {1})").format(to_table_no, to_table["status"]))

		# Move guest and seating details
		to_table["status"] = "Occupied"
		to_table["customer"] = from_table.get("customer", "")
		to_table["customer_id"] = from_table.get("customer_id", "")
		to_table["customer_mobile"] = from_table.get("customer_mobile", "")
		to_table["guests"] = from_table.get("guests", 0)
		to_table["seated_time"] = from_table.get("seated_time", "")
		to_table["order_id"] = from_table.get("order_id", "")
		to_table["order_amount"] = from_table.get("order_amount", "")
		to_table["order_status"] = from_table.get("order_status", "")

		transfer_note = f"Transferred from {from_table_no}"
		if reason:
			transfer_note += f": {reason}"
		existing_notes = from_table.get("notes", "")
		to_table["notes"] = f"{existing_notes} [{transfer_note}]" if existing_notes else f"[{transfer_note}]"

		# Reset from_table to Available
		from_table["status"] = "Available"
		from_table["customer"] = ""
		from_table["customer_id"] = ""
		from_table["customer_mobile"] = ""
		from_table["guests"] = 0
		from_table["seated_time"] = ""
		from_table["order_id"] = ""
		from_table["order_amount"] = ""
		from_table["order_status"] = ""
		from_table["reservation_time"] = ""
		from_table["notes"] = ""

		# Update active order reference (if any)
		active_order_id = to_table.get("order_id")
		if active_order_id:
			for o in data.get("orders", []):
				if o.get("order_id") == active_order_id:
					o["table_no"] = to_table_no
					o["area"] = to_table.get("area", "")
					break

		# Update active KDS tickets / kitchen batches (if any)
		for kds in data.get("kds_tickets", []):
			if kds.get("order_id") == active_order_id or kds.get("table_no") == from_table_no:
				kds["table_no"] = to_table_no
				kds["area"] = to_table.get("area", "")

		cls.save_data(data)
		return {
			"success": True,
			"from_table": from_table_no,
			"to_table": to_table_no,
			"floor_data": cls.get_floor_data(),
		}

	# =========================================================================
	# Dashboard Operations (Directly computed from shared data)
	# =========================================================================
	@classmethod
	def get_dashboard_data(cls):
		"""
		Returns operational dashboard metrics, weekly sales trend, popular dishes,
		table occupancy, and recent orders.

		All live operational metrics derive directly from the centralized, shared
		RestaurantStore records used by Order Management, Floor Management, and KDS.
		No artificial/historical demo counts or revenues are mixed into today's operational totals.
		"""
		data = cls.get_data()
		tables = data.get("tables", [])
		orders = data.get("orders", [])
		hist = data.get("historical_summary", {})
		bills = data.get("bills", [])

		total_tables = len(tables)
		occupied_tables = [t for t in tables if t.get("status") == "Occupied"]
		available_tables = [t for t in tables if t.get("status") == "Available"]
		reserved_tables = [t for t in tables if t.get("status") == "Reserved"]

		occupied_count = len(occupied_tables)
		available_count = len(available_tables)
		reserved_count = len(reserved_tables)
		occupancy_pct = f"{round((occupied_count / total_tables) * 100)}%" if total_tables else "0%"

		# Operational Order & Revenue Metrics derived 100% from shared orders & bills
		total_orders_count = len(orders)
		active_statuses = ["Confirmed", "Preparing", "Ready", "Served"]
		active_orders_count = sum(1 for o in orders if o.get("status") in active_statuses)
		pending_kitchen_statuses = ["Confirmed", "Preparing"]
		pending_kitchen_count = sum(1 for o in orders if o.get("status") in pending_kitchen_statuses)

		completed_statuses = ["Served", "Billed", "Paid"]
		completed_orders_count = sum(1 for o in orders if o.get("status") in completed_statuses)

		paid_bills_count = sum(1 for b in bills if b.get("payment_status") == "Paid")
		pending_bills_count = sum(1 for b in bills if b.get("payment_status") != "Paid")
		paid_bills_revenue = sum(b.get("total", 0) for b in bills if b.get("payment_status") == "Paid")

		paid_order_ids_in_bills = {b.get("order_id") for b in bills if b.get("payment_status") == "Paid"}
		paid_orders_revenue = sum(o.get("total", 0) for o in orders if o.get("payment_status") == "Paid" and o.get("order_id") not in paid_order_ids_in_bills)
		today_revenue = paid_bills_revenue + paid_orders_revenue

		# Live Kitchen Queue: orders currently in Confirmed or Preparing status
		kitchen_queue = []
		for o in orders:
			if o.get("status") in pending_kitchen_statuses:
				items_list = [f"{it.get('qty', 1)}x {it.get('name')}" for it in o.get("items", [])]
				kitchen_queue.append({
					"order_id": o.get("order_id"),
					"table": o.get("table_no"),
					"area": o.get("area"),
					"customer": o.get("customer", "Guest"),
					"status": o.get("status"),
					"items_count": sum(it.get("qty", 1) for it in o.get("items", [])),
					"items_summary": ", ".join(items_list),
					"items": items_list,
					"time_ago": o.get("time_ago", "Recently"),
					"elapsed_mins": o.get("elapsed_mins", 10),
					"badge_class": o.get("badge_class", "badge-preparing"),
				})

		# Weekly Sales Analytics: Previous 6 days (Mon-Sat) historical baseline + Today's live revenue
		base_weekly = list(hist.get("base_weekly_sales", [0, 0, 0, 0, 0, 0]))
		weekly_values = base_weekly + [today_revenue]
		weekly_total = sum(weekly_values)

		yesterday_base = base_weekly[-1] if base_weekly else 0
		if today_revenue > 0 and yesterday_base > 0:
			diff_pct = round(((today_revenue - yesterday_base) / yesterday_base) * 100, 1)
			revenue_growth = f"{'+' if diff_pct >= 0 else ''}{diff_pct}%"
		elif today_revenue > 0 and yesterday_base == 0:
			revenue_growth = "+100%"
		else:
			revenue_growth = "0%"

		# Popular Dishes: Dynamically computed from actual order item quantities in the shared store
		dishes_tally = {}
		total_items_ordered = 0
		for order in orders:
			if order.get("status") == "Cancelled":
				continue
			for item in order.get("items", []):
				name = item.get("name")
				qty = int(item.get("qty", 1))
				amt = item.get("amount", item.get("price", 0) * qty)
				total_items_ordered += qty
				if name not in dishes_tally:
					menu_item = next(
						(m for m in data.get("menu_items", []) if m.get("name") == name or m.get("item_id") == item.get("item_id")),
						{}
					)
					dishes_tally[name] = {
						"category": menu_item.get("category", "Main Course"),
						"orders": 0,
						"revenue": 0,
					}
				dishes_tally[name]["orders"] += qty
				dishes_tally[name]["revenue"] += amt

		sorted_dishes = sorted(dishes_tally.items(), key=lambda x: x[1]["orders"], reverse=True)[:5]
		popular_dishes = []
		rank = 1
		for dish_name, dish_info in sorted_dishes:
			share = round((dish_info["orders"] / total_items_ordered) * 100) if total_items_ordered else 0
			popular_dishes.append({
				"rank": rank,
				"name": dish_name,
				"category": dish_info.get("category", "Main Course"),
				"orders": dish_info.get("orders", 0),
				"revenue": dish_info.get("revenue", 0),
				"formatted_revenue": f"₹{dish_info.get('revenue', 0):,}",
				"share_percentage": share,
			})
			rank += 1

		occupied_pct = f"{round((occupied_count / total_tables) * 100)}%" if total_tables else "0%"
		available_pct = f"{round((available_count / total_tables) * 100)}%" if total_tables else "0%"
		reserved_pct = f"{round((reserved_count / total_tables) * 100)}%" if total_tables else "0%"

		table_breakdown = [
			{
				"status": _("Occupied"),
				"count": occupied_count,
				"percentage": occupied_pct,
				"color": "#EF4444",
				"class": "occupied",
			},
			{
				"status": _("Available"),
				"count": available_count,
				"percentage": available_pct,
				"color": "#10B981",
				"class": "available",
			},
			{
				"status": _("Reserved"),
				"count": reserved_count,
				"percentage": reserved_pct,
				"color": "#F59E0B",
				"class": "reserved",
			},
		]

		zones_map = {
			"Main Dining Hall": {"occupied": 0, "reserved": 0, "total": 12},
			"Garden Patio": {"occupied": 0, "reserved": 0, "total": 4},
			"Rooftop Terrace": {"occupied": 0, "reserved": 0, "total": 4},
		}
		for t in tables:
			area = t.get("area")
			if area in zones_map:
				if t.get("status") == "Occupied":
					zones_map[area]["occupied"] += 1
				elif t.get("status") == "Reserved":
					zones_map[area]["reserved"] += 1

		zones_list = [
			{
				"name": _(k),
				"occupied": v["occupied"],
				"reserved": v.get("reserved", 0),
				"total": v["total"],
				"available": max(0, v["total"] - v["occupied"] - v.get("reserved", 0)),
				"occupancy_pct": f"{round((v['occupied'] / v['total']) * 100)}%" if v["total"] else "0%",
			}
			for k, v in zones_map.items()
		]

		recent_orders = []
		for o in orders[:8]:
			recent_orders.append({
				"order_id": o.get("order_id"),
				"table": o.get("table_no"),
				"section": o.get("area"),
				"customer": o.get("customer"),
				"customer_mobile": o.get("customer_mobile", ""),
				"items": sum(it.get("qty", 1) for it in o.get("items", [])),
				"amount": o.get("total"),
				"formatted_amount": o.get("formatted_amount", f"₹{o.get('total', 0):,}"),
				"status": o.get("status"),
				"payment_status": o.get("payment_status", "Unpaid"),
				"badge_class": o.get("badge_class", "badge-preparing"),
				"time_ago": o.get("time_ago", "Recently"),
			})

		restaurant_info = cls.get_restaurant_info()
		restaurant_info["location"] = "Nagarbhavi, Bengaluru, Karnataka"
		restaurant_info["subtitle"] = "Restaurant Management Dashboard"

		return {
			"restaurant_info": restaurant_info,
			"kpis": {
				"today_revenue": today_revenue,
				"formatted_revenue": f"₹{int(today_revenue):,}" if today_revenue == int(today_revenue) else f"₹{today_revenue:,.2f}",
				"revenue_growth": revenue_growth,
				"today_orders": total_orders_count,
				"total_orders": total_orders_count,
				"active_orders": active_orders_count,
				"completed_orders": completed_orders_count,
				"active_tables": occupied_count,
				"active_tables_display": f"{occupied_count} / {total_tables}",
				"available_tables": available_count,
				"total_tables": total_tables,
				"occupancy_rate": occupancy_pct,
				"pending_kitchen_orders": pending_kitchen_count,
				"paid_bills": paid_bills_count,
				"pending_payments": pending_bills_count,
				"avg_prep_time": "14 mins",
			},
			"sales_analytics": {
				"labels": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
				"datasets": [
					{
						"name": _("Daily Revenue"),
						"values": weekly_values,
					}
				],
				"total_weekly_revenue": weekly_total,
				"formatted_weekly_revenue": f"₹{weekly_total:,}",
			},
			"popular_dishes": popular_dishes,
			"kitchen_queue": kitchen_queue,
			"table_status": {
				"total": total_tables,
				"available": available_count,
				"occupied": occupied_count,
				"reserved": reserved_count,
				"breakdown": table_breakdown,
				"zones": zones_list,
			},
			"recent_orders": recent_orders,
		}

	# =========================================================================
	# Menu Management Operations
	# =========================================================================
	@classmethod
	def get_menu_management_data(cls, category=None, search=None, availability=None):
		"""
		Returns enriched menu items with live ingredient stock indicators,
		categories with counts, and stock warnings.
		"""
		data = cls.get_data()
		menu_items = data.get("menu_items", [])
		inv_map = {i["name"]: i for i in data.get("inventory", [])}

		# Available categories
		standard_categories = [
			"Starters",
			"Soups",
			"Main Course – Veg",
			"Main Course – Non-Veg",
			"Rice & Biryani",
			"Breads",
			"Desserts",
			"Beverages",
		]

		# Enrich each item with live ingredient stock info and warnings
		enriched_items = []
		low_stock_count = 0
		available_count = 0

		for item in menu_items:
			it = copy.deepcopy(item)
			it["formatted_price"] = f"₹{it.get('price', 0):,}"

			recipe = it.get("recipe", {})
			ingredients_list = []
			stock_status = "in_stock"
			stock_warning = ""

			for ing_name, req_qty in recipe.items():
				inv_item = inv_map.get(ing_name)
				if inv_item:
					curr_qty = inv_item.get("quantity", 0)
					reorder = inv_item.get("reorder_level", 0)
					unit = inv_item.get("unit", "kg")
					ingredients_list.append(f"{ing_name} ({req_qty} {unit})")

					if curr_qty <= 0:
						stock_status = "out_of_stock"
						stock_warning = f"Out of stock: {ing_name} is depleted"
					elif curr_qty <= reorder and stock_status != "out_of_stock":
						stock_status = "low_stock"
						stock_warning = f"Low stock: {ing_name} ({curr_qty} {unit} left)"
				else:
					ingredients_list.append(f"{ing_name} ({req_qty})")

			rec = it.get("recipe_details") or {}
			it["recipe_status"] = rec.get("status") or ("Approved" if it.get("recipe") else "Draft")
			it["is_unverified"] = rec.get("is_unverified", it["recipe_status"] != "Approved")
			it["portions_count"] = len(rec.get("portions", {}))
			it["ingredients_summary"] = ", ".join(ingredients_list) if ingredients_list else "No stock required"
			it["stock_status"] = stock_status
			it["stock_warning"] = stock_warning

			if stock_status in ["low_stock", "out_of_stock"]:
				low_stock_count += 1

			if it.get("available", True):
				available_count += 1

			# Apply filters with normalized category comparison (handles en-dash and hyphen)
			if category and category != "All":
				norm_filter = category.replace("—", "-").replace("–", "-").strip().lower()
				norm_item_cat = it.get("category", "").replace("—", "-").replace("–", "-").strip().lower()
				if norm_filter != norm_item_cat:
					continue

			if availability == "Available" and not it.get("available", True):
				continue
			elif availability == "Unavailable" and it.get("available", True):
				continue

			if search:
				query = search.strip().lower()
				name_match = query in it.get("name", "").lower()
				desc_match = query in it.get("description", "").lower()
				id_match = query in it.get("item_id", "").lower()
				cat_match = query in it.get("category", "").lower()
				if not (name_match or desc_match or id_match or cat_match):
					continue

			enriched_items.append(it)

		# Calculate category counts across all items
		category_counts = [{"name": "All", "count": len(menu_items)}]
		for cat in standard_categories:
			norm_cat = cat.replace("—", "-").replace("–", "-").strip().lower()
			cnt = sum(
				1 for item in menu_items
				if item.get("category", "").replace("—", "-").replace("–", "-").strip().lower() == norm_cat
			)
			category_counts.append({"name": cat, "count": cnt})

		# Inventory list for recipe mapping dropdowns
		available_ingredients = [
			{"name": i["name"], "unit": i.get("unit", "kg"), "current_qty": i.get("quantity", 0)}
			for i in data.get("inventory", [])
		]

		return {
			"categories": category_counts,
			"items": enriched_items,
			"summary": {
				"total_items": len(menu_items),
				"available_items": available_count,
				"unavailable_items": len(menu_items) - available_count,
				"low_stock_items": low_stock_count,
			},
			"available_ingredients": available_ingredients,
		}

	@classmethod
	def toggle_menu_item_availability(cls, item_id, available=None):
		"""
		Enables or disables item availability. Changes persist in RestaurantStore.
		"""
		data = cls.get_data()
		item = next((it for it in data.get("menu_items", []) if it["item_id"] == item_id), None)
		if not item:
			frappe.throw(_("Menu Item {0} not found").format(item_id))

		if available is None:
			item["available"] = not item.get("available", True)
		else:
			item["available"] = bool(available)

		cls.save_data(data)
		return item

	@classmethod
	def save_menu_item(
		cls,
		item_id=None,
		name="",
		category="Main Course – Veg",
		price=0,
		is_veg=True,
		description="",
		recipe=None,
		available=True,
		image=None,
	):
		"""
		Adds a new menu item or updates an existing item.
		Uses stable ITEM-XXX IDs and validates price, category, recipe and image.
		"""
		if not name or not name.strip():
			frappe.throw(_("Menu item name is required"))

		try:
			price = float(price)
			if price <= 0:
				frappe.throw(_("Price must be greater than zero"))
		except (ValueError, TypeError):
			frappe.throw(_("Valid price is required"))

		data = cls.get_data()
		menu_items = data.setdefault("menu_items", [])

		# Validate recipe mapping
		clean_recipe = {}
		if recipe:
			inv_names = {i["name"] for i in data.get("inventory", [])}
			for ing_name, qty in recipe.items():
				if ing_name in inv_names:
					try:
						qty_val = float(qty)
						if qty_val > 0:
							clean_recipe[ing_name] = round(qty_val, 3)
					except (ValueError, TypeError):
						pass

		clean_image = (image.strip() if isinstance(image, str) else "") if image is not None else None

		if item_id:
			# Update existing
			target = next((it for it in menu_items if it["item_id"] == item_id), None)
			if not target:
				frappe.throw(_("Menu item {0} not found").format(item_id))

			target["name"] = name.strip()
			target["category"] = category
			target["price"] = int(price)
			target["is_veg"] = bool(is_veg)
			target["description"] = description.strip()
			target["recipe"] = clean_recipe
			target["available"] = bool(available)
			if clean_image is not None:
				target["image"] = clean_image
			res_item = target
		else:
			# Generate next stable ITEM-XXX id
			existing_nums = []
			for it in menu_items:
				m = re.search(r"ITEM-(\d+)", it.get("item_id", ""))
				if m:
					existing_nums.append(int(m.group(1)))
			next_num = max(existing_nums, default=0) + 1
			new_id = f"ITEM-{next_num:03d}"

			res_item = {
				"item_id": new_id,
				"name": name.strip(),
				"category": category,
				"price": int(price),
				"is_veg": bool(is_veg),
				"image": clean_image if clean_image is not None else "",
				"description": description.strip(),
				"recipe": clean_recipe,
				"available": bool(available),
			}
			menu_items.append(res_item)

		cls.save_data(data)
		return res_item

	# =========================================================================
	# Recipe & Portion Management (Feature: Complete Recipe & Portion Integration)
	# =========================================================================
	@classmethod
	def get_dish_recipe_definition(cls, item_id_or_name):
		"""
		Returns full recipe definition for a menu item including portions, ingredients,
		wastage percentage, approval status, and inventory lookup mappings.
		"""
		data = cls.get_data()
		menu_items = data.get("menu_items", [])
		target = None
		for it in menu_items:
			if it.get("item_id") == item_id_or_name or str(it.get("name", "")).lower() == str(item_id_or_name).lower():
				target = it
				break
		if not target:
			frappe.throw(_("Menu item {0} not found").format(item_id_or_name))

		rec = target.get("recipe_details")
		if not rec or not isinstance(rec, dict) or not rec.get("portions"):
			rec = {
				"status": "Draft",
				"is_unverified": True,
				"wastage_pct": 0.0,
				"portions": {
					"Regular": {
						"portion_name": "Regular",
						"is_default": True,
						"wastage_pct": 0.0,
						"ingredients": []
					}
				}
			}

		inv_items = [
			{
				"item_code": iv.get("item_code"),
				"name": iv.get("name"),
				"unit": iv.get("unit", "kg"),
				"stock_qty": iv.get("quantity", 0),
				"location": iv.get("location", "Cold Storage")
			}
			for iv in data.get("inventory", [])
		]

		return {
			"item_id": target.get("item_id"),
			"name": target.get("name"),
			"category": target.get("category"),
			"price": target.get("price"),
			"is_veg": target.get("is_veg"),
			"image": target.get("image"),
			"description": target.get("description"),
			"recipe_details": rec,
			"available_inventory": inv_items
		}

	@classmethod
	def save_dish_recipe_definition(cls, item_id, recipe_data, approve=False):
		"""
		Saves portions, ingredients, units, wastage_pct and recipe status for a dish.
		If approve is True or recipe_data status is 'Approved', marks status as Approved.
		Updates the persistent RestaurantStore and syncs legacy recipe dict for POS/orders.
		"""
		data = cls.get_data()
		menu_items = data.get("menu_items", [])
		target = next((it for it in menu_items if it.get("item_id") == item_id), None)
		if not target:
			frappe.throw(_("Menu item {0} not found").format(item_id))

		now_str = frappe.utils.now_datetime().strftime("%Y-%m-%d %H:%M:%S")
		current_user = frappe.session.user if hasattr(frappe, "session") and frappe.session and frappe.session.user else "Administrator"

		if isinstance(recipe_data, str):
			try:
				recipe_data = json.loads(recipe_data)
			except Exception:
				recipe_data = {}

		raw_portions = recipe_data.get("portions") or {}
		if not raw_portions:
			raw_portions = {
				"Regular": {
					"portion_name": "Regular",
					"is_default": True,
					"wastage_pct": float(recipe_data.get("wastage_pct", 0) or 0),
					"ingredients": recipe_data.get("ingredients", [])
				}
			}

		inv_by_name = {iv.get("name").lower(): iv for iv in data.get("inventory", []) if iv.get("name")}
		inv_by_code = {iv.get("item_code"): iv for iv in data.get("inventory", []) if iv.get("item_code")}

		clean_portions = {}
		has_any_ingredients = False

		for p_key, p_val in raw_portions.items():
			p_name = str(p_val.get("portion_name") or p_key).strip()
			p_wastage = max(0.0, min(100.0, float(p_val.get("wastage_pct", 0) or 0)))
			p_default = bool(p_val.get("is_default", False)) or (p_name.lower() == "regular")
			
			clean_ingredients = []
			for ing in p_val.get("ingredients", []):
				ing_name = str(ing.get("ingredient_name") or ing.get("name") or "").strip()
				if not ing_name:
					continue
				
				try:
					qty = round(float(ing.get("quantity", 0)), 3)
				except (ValueError, TypeError):
					qty = 0.0

				unit = str(ing.get("unit") or "g").strip().lower()
				wastage_pct = max(0.0, min(100.0, float(ing.get("wastage_pct", 0) or 0)))

				# Match with inventory item
				inv_code = ing.get("inventory_item_code") or ""
				inv_item = inv_by_code.get(inv_code) or inv_by_name.get(ing_name.lower())
				if not inv_item and ing.get("inventory_item_name"):
					inv_item = inv_by_name.get(str(ing.get("inventory_item_name")).lower())

				is_mapped = bool(inv_item)
				clean_ingredients.append({
					"ingredient_name": ing_name,
					"inventory_item_code": inv_item.get("item_code", "") if inv_item else "",
					"inventory_item_name": inv_item.get("name", "") if inv_item else "",
					"quantity": qty,
					"unit": unit,
					"wastage_pct": wastage_pct,
					"is_mapped": is_mapped
				})
				has_any_ingredients = True

			clean_portions[p_name] = {
				"portion_name": p_name,
				"is_default": p_default,
				"wastage_pct": p_wastage,
				"ingredients": clean_ingredients
			}

		if "Regular" not in clean_portions and clean_portions:
			first_k = next(iter(clean_portions.keys()))
			clean_portions[first_k]["is_default"] = True

		desired_status = recipe_data.get("status") or ("Approved" if approve else "Draft")
		if approve:
			desired_status = "Approved"

		if desired_status == "Approved" and not has_any_ingredients:
			frappe.throw(_("Cannot approve recipe with no ingredients configured."))

		is_approved = (desired_status == "Approved")
		target["recipe_details"] = {
			"status": desired_status,
			"is_unverified": not is_approved,
			"approved_at": now_str if is_approved else target.get("recipe_details", {}).get("approved_at"),
			"approved_by": current_user if is_approved else target.get("recipe_details", {}).get("approved_by"),
			"last_updated": now_str,
			"wastage_pct": float(recipe_data.get("wastage_pct", 0) or 0),
			"notes": str(recipe_data.get("notes") or "").strip(),
			"portions": clean_portions
		}

		# Synchronize legacy recipe dict
		if is_approved:
			reg_p = clean_portions.get("Regular") or next(iter(clean_portions.values()), None)
			if reg_p:
				clean_legacy = {}
				for ing in reg_p.get("ingredients", []):
					if ing.get("is_mapped") and ing.get("quantity"):
						iv_match = inv_by_code.get(ing.get("inventory_item_code")) or inv_by_name.get(ing.get("ingredient_name", "").lower())
						if iv_match:
							target_u = iv_match.get("unit", "kg")
							conv = cls.convert_quantity(float(ing.get("quantity", 0)), ing.get("unit", "g"), target_u)
							clean_legacy[iv_match["name"]] = round(conv, 3)
				target["recipe"] = clean_legacy
		else:
			target["recipe"] = {}

		cls.save_data(data)
		return target

	@classmethod
	def approve_dish_recipe(cls, item_id):
		"""
		Approves recipe for a dish, validating ingredients and enabling inventory consumption.
		"""
		data = cls.get_data()
		menu_items = data.get("menu_items", [])
		target = next((it for it in menu_items if it.get("item_id") == item_id), None)
		if not target:
			frappe.throw(_("Menu item {0} not found").format(item_id))

		rec = target.get("recipe_details")
		if not rec or not rec.get("portions"):
			frappe.throw(_("Cannot approve dish without a configured recipe."))

		# Check if any portion has ingredients
		has_ing = any(len(p.get("ingredients", [])) > 0 for p in rec.get("portions", {}).values())
		if not has_ing:
			frappe.throw(_("Cannot approve recipe with zero ingredients."))

		return cls.save_dish_recipe_definition(item_id, rec, approve=True)

	@classmethod
	def get_recipe_dashboard_data(cls, category=None, status=None, search=None):
		"""
		Returns complete Recipe Management Dashboard payload:
		- 6 KPI metrics (total dishes, approved, awaiting approval, draft, unmapped ingredients, incomplete recipes)
		- category & status tallies
		- list of all dishes with recipe status, portion list, ingredient breakdown, and mapping health
		- inventory items list
		"""
		data = cls.get_data()
		menu_items = data.get("menu_items", [])
		inv_items = data.get("inventory", [])
		inv_map = {iv["name"].lower(): iv for iv in inv_items if iv.get("name")}
		inv_by_code = {iv["item_code"]: iv for iv in inv_items if iv.get("item_code")}

		total_dishes = len(menu_items)
		approved_count = 0
		pending_count = 0
		draft_count = 0
		unmapped_ingredients_set = set()
		incomplete_recipes_count = 0

		dishes_data = []

		for it in menu_items:
			rec = it.get("recipe_details") or {}
			st = rec.get("status") or ("Approved" if it.get("recipe") else "Draft")
			is_unverified = rec.get("is_unverified", st != "Approved")
			portions = rec.get("portions") or {}

			if st == "Approved":
				approved_count += 1
			elif st == "Pending Approval":
				pending_count += 1
			else:
				draft_count += 1

			# Check completeness and unmapped ingredients
			has_ingredients = False
			is_incomplete = False
			ingredients_summary_list = []
			mapped_count = 0
			unmapped_count = 0

			for p_name, p_info in portions.items():
				for ing in p_info.get("ingredients", []):
					has_ingredients = True
					ing_name = ing.get("ingredient_name", "")
					qty = float(ing.get("quantity", 0))
					unit = ing.get("unit", "")
					
					iv_match = inv_by_code.get(ing.get("inventory_item_code")) or inv_map.get(ing_name.lower())
					if iv_match:
						mapped_count += 1
					else:
						unmapped_count += 1
						unmapped_ingredients_set.add(ing_name)

					if qty <= 0 or not unit or not iv_match:
						is_incomplete = True

					ingredients_summary_list.append(f"{ing_name} ({qty} {unit})")

			if not has_ingredients or is_incomplete:
				incomplete_recipes_count += 1

			dish_row = {
				"item_id": it.get("item_id"),
				"name": it.get("name"),
				"category": it.get("category"),
				"price": it.get("price"),
				"formatted_price": f"₹{it.get('price', 0):,}",
				"is_veg": it.get("is_veg"),
				"image": it.get("image"),
				"description": it.get("description"),
				"available": it.get("available", True),
				"recipe_status": st,
				"is_unverified": is_unverified,
				"approved_at": rec.get("approved_at"),
				"approved_by": rec.get("approved_by"),
				"portions": list(portions.keys()),
				"portions_count": len(portions),
				"has_ingredients": has_ingredients,
				"mapped_count": mapped_count,
				"unmapped_count": unmapped_count,
				"is_incomplete": is_incomplete,
				"ingredients_summary": ", ".join(ingredients_summary_list) if ingredients_summary_list else "No ingredients configured",
				"recipe_details": rec
			}

			# Filters
			if category and category != "All":
				norm_f = category.replace("—", "-").replace("–", "-").strip().lower()
				norm_c = it.get("category", "").replace("—", "-").replace("–", "-").strip().lower()
				if norm_f != norm_c:
					continue

			if status and status != "All":
				if status == "Approved" and st != "Approved":
					continue
				elif status == "Pending Approval" and st != "Pending Approval":
					continue
				elif status == "Draft" and st != "Draft":
					continue
				elif status == "Incomplete" and not is_incomplete:
					continue

			if search:
				q = search.strip().lower()
				m_name = q in it.get("name", "").lower()
				m_cat = q in it.get("category", "").lower()
				m_desc = q in it.get("description", "").lower()
				m_ing = any(q in ing_str.lower() for ing_str in ingredients_summary_list)
				if not (m_name or m_cat or m_desc or m_ing):
					continue

			dishes_data.append(dish_row)

		# Category counts
		standard_cats = ["Starters", "Soups", "Main Course – Veg", "Main Course – Non-Veg", "Rice & Biryani", "Breads", "Desserts", "Beverages"]
		cat_counts = [{"name": "All", "count": total_dishes}]
		for c in standard_cats:
			norm_c = c.replace("—", "-").replace("–", "-").strip().lower()
			cnt = sum(1 for it in menu_items if it.get("category", "").replace("—", "-").replace("–", "-").strip().lower() == norm_c)
			cat_counts.append({"name": c, "count": cnt})

		return {
			"summary": {
				"total_dishes": total_dishes,
				"approved_recipes": approved_count,
				"awaiting_approval": pending_count,
				"draft_recipes": draft_count,
				"unmapped_ingredients": len(unmapped_ingredients_set),
				"incomplete_recipes": incomplete_recipes_count
			},
			"dishes": dishes_data,
			"categories": cat_counts,
			"statuses": [
				{"name": "All", "count": total_dishes},
				{"name": "Approved", "count": approved_count},
				{"name": "Pending Approval", "count": pending_count},
				{"name": "Draft", "count": draft_count},
				{"name": "Incomplete", "count": incomplete_recipes_count}
			],
			"inventory_items": [
				{
					"item_code": iv.get("item_code"),
					"name": iv.get("name"),
					"unit": iv.get("unit", "kg"),
					"quantity": iv.get("quantity", 0),
					"location": iv.get("location", "Cold Storage")
				}
				for iv in inv_items
			]
		}

	# =========================================================================
	# Order Management (Strict Menu, Table & Inventory Integration)
	# =========================================================================
	@classmethod
	def create_order(
		cls,
		table_no,
		customer="",
		items=None,
		notes="",
		initial_status="Confirmed",
		customer_mobile="",
		customer_id="",
	):
		"""
		Creates a new restaurant order using current menu item IDs and prices.
		Enforces:
		- Only available tables can receive a new order; occupied tables with active orders are blocked.
		- Unavailable menu items CANNOT be ordered.
		- Quantities must be positive.
		- Ingredients must have sufficient inventory before confirmation.
		- Inventory is deducted exactly once upon confirmation.
		- Table is updated to Occupied with active order reference.
		- Links order and table to central customer registry.
		"""
		data = cls.get_data()
		menu = {it["item_id"]: it for it in data.get("menu_items", [])}

		table = next((t for t in data.get("tables", []) if t["table_no"] == table_no), None)
		if not table:
			frappe.throw(_("Table {0} not found").format(table_no))

		# Prevent duplicate active orders on already occupied tables
		if table.get("status") == "Occupied" and table.get("order_id"):
			frappe.throw(
				_("Table {0} already has an active order ({1}) and is currently occupied.").format(
					table_no, table["order_id"]
				)
			)

		# Auto-resolve customer from table if occupied or available
		if not customer_mobile and table.get("customer_mobile"):
			customer_mobile = table.get("customer_mobile")
		if not customer_id and table.get("customer_id"):
			customer_id = table.get("customer_id")
		if not customer and table.get("customer"):
			customer = table.get("customer")

		if customer_mobile:
			cust = cls.get_or_create_customer(name=customer, mobile=customer_mobile, update_visit=False)
			data["customers"] = cls.get_data().get("customers", [])
			customer = cust["name"]
			customer_id = cust["customer_id"]
			customer_mobile = cust["mobile"]
		elif customer:
			for c in data.get("customers", []):
				if isinstance(c, dict) and c.get("name").strip().lower() == customer.strip().lower():
					customer_id = c.get("customer_id", "")
					customer_mobile = c.get("mobile", "")
					break

		if not items:
			frappe.throw(_("Order must contain at least one valid item"))

		order_items = []
		subtotal = 0
		inv_map = {inv["name"]: inv for inv in data.get("inventory", [])}

		# Pre-validation & Recipe Stock Verification across all items
		ingredient_needs = {}

		for it in items:
			item_id = it.get("item_id")
			try:
				qty = int(it.get("qty", 1))
			except (ValueError, TypeError):
				qty = 1
			if qty <= 0:
				frappe.throw(_("Item quantity must be greater than zero"))

			menu_item = menu.get(item_id)
			if not menu_item:
				frappe.throw(_("Menu item with ID {0} does not exist").format(item_id))

			# Critical Integration Check: Unavailable items cannot be ordered!
			if not menu_item.get("available", True):
				frappe.throw(
					_("Item '{0}' ({1}) is currently marked unavailable and cannot be ordered.").format(
						menu_item["name"], item_id
					)
				)

			# Tally ingredient requirements for stock check
			recipe = menu_item.get("recipe", {})
			for ing_name, per_unit_qty in recipe.items():
				total_req = round(per_unit_qty * qty, 3)
				ingredient_needs[ing_name] = ingredient_needs.get(ing_name, 0.0) + total_req

			amt = menu_item["price"] * qty
			subtotal += amt
			item_note = it.get("notes") or it.get("special_instructions") or ""
			item_dict = {
				"item_id": item_id,
				"name": menu_item["name"],
				"qty": qty,
				"price": menu_item["price"],
				"amount": amt,
				"round": 1,
			}
			if item_note:
				item_dict["notes"] = item_note
			order_items.append(item_dict)

		# Check stock availability using recipe validator
		cls.validate_order_ingredients(data, order_items)

		tax = round(subtotal * 0.05)
		total = subtotal + tax

		# Deterministic sequential order ID generation (ORD-2026-XXXX)
		existing_order_nums = []
		for o in data.get("orders", []):
			m = re.search(r"ORD-2026-(\d+)", o.get("order_id", ""))
			if m:
				existing_order_nums.append(int(m.group(1)))
		next_num = max(existing_order_nums, default=132) + 1
		order_id = f"ORD-2026-{next_num:04d}"

		status_badge_map = {
			"Confirmed": "badge-info",
			"Preparing": "badge-preparing",
			"Ready": "badge-warning",
			"Served": "badge-served",
			"Billed": "badge-billed",
			"Paid": "badge-positive",
			"Cancelled": "badge-neutral",
		}

		st = initial_status if initial_status in status_badge_map else "Confirmed"
		now_dt = frappe.utils.now_datetime()
		created_at_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")
		created_time_str = now_dt.strftime("%I:%M %p")

		order = {
			"order_id": order_id,
			"table_no": table_no,
			"area": table.get("area", "Main Dining Hall"),
			"customer": customer or "Walk-in Guest",
			"customer_id": customer_id or "",
			"customer_mobile": customer_mobile or "",
			"items": order_items,
			"subtotal": subtotal,
			"tax": tax,
			"total": total,
			"formatted_amount": f"₹{total:,}",
			"status": st,
			"badge_class": status_badge_map.get(st, "badge-info"),
			"created_at": created_at_str,
			"created_time_str": created_time_str,
			"time_ago": "Just now",
			"inventory_deducted": False,
			"payment_status": "Unpaid",
			"payment_method": "",
			"notes": notes or "",
			"batches": [
				{
					"batch_id": f"{order_id}-R1",
					"round": 1,
					"round_name": "Round 1",
					"items": copy.deepcopy(order_items),
					"status": st,
					"created_at": created_at_str,
					"created_time_str": created_time_str,
					"notes": notes or "",
				}
			],
		}

		# Deduct stock exactly once on confirmation
		cls._deduct_inventory_for_order(data, order, batch_id=f"{order_id}-R1")

		data.setdefault("orders", []).insert(0, order)

		# Associate order with table and set status to Occupied
		table["status"] = "Occupied"
		table["customer"] = order["customer"]
		table["customer_id"] = order.get("customer_id", "")
		table["customer_mobile"] = order.get("customer_mobile", "")
		table["order_id"] = order_id
		table["order_amount"] = order["formatted_amount"]
		table["order_status"] = order["status"]
		table["seated_time"] = table.get("seated_time") or "Just now"
		table["notes"] = notes or ""

		cls.save_data(data)
		return order

	@classmethod
	def add_items_to_order(cls, order_id=None, table_no=None, items=None, notes=""):
		"""
		Appends additional dishes to an active order (Incremental Ordering).
		Enforces:
		- Preserves previously ordered dishes.
		- Appends new items tagged with round number.
		- Dispatches ONLY the newly added items to KDS as a distinct round ticket (e.g. ORD-2026-0150-R2).
		- Deducts inventory ingredients ONLY for the newly added items.
		- Recalculates order subtotal, 5% GST tax, and total.
		- Updates table order amount.
		- Synchronizes existing bill if already generated pre-payment.
		- Prohibits adding items to Paid or Cancelled orders.
		"""
		data = cls.get_data()
		orders = data.get("orders", [])

		target_order = None
		if order_id:
			target_order = next((o for o in orders if o.get("order_id") == order_id), None)
		elif table_no:
			target_table = next((t for t in data.get("tables", []) if t.get("table_no") == table_no), None)
			if target_table and target_table.get("order_id"):
				target_order = next((o for o in orders if o.get("order_id") == target_table.get("order_id")), None)

		if not target_order:
			frappe.throw(_("Active order not found for order '{0}' / table '{1}'.").format(order_id, table_no))

		if target_order.get("payment_status") == "Paid" or target_order.get("status") in ["Paid", "Cancelled"]:
			frappe.throw(_("Cannot add items to order {0} because it is already paid or cancelled.").format(target_order["order_id"]))

		if isinstance(items, str):
			try:
				items = json.loads(items)
			except Exception:
				items = []

		if not items:
			frappe.throw(_("Please select at least one dish to add."))

		menu = {it["item_id"]: it for it in data.get("menu_items", [])}
		inv_map = {inv["name"]: inv for inv in data.get("inventory", [])}

		# Ensure batches structure exists on target_order
		batches = target_order.setdefault("batches", [])
		if not batches and target_order.get("items"):
			batches.append({
				"batch_id": f"{target_order['order_id']}-R1",
				"round": 1,
				"round_name": "Round 1",
				"items": copy.deepcopy(target_order.get("items", [])),
				"status": target_order.get("status", "Confirmed"),
				"created_at": target_order.get("created_at"),
				"created_time_str": target_order.get("created_time_str", "Earlier"),
				"notes": target_order.get("notes", ""),
			})

		round_num = len(batches) + 1
		batch_id = f"{target_order['order_id']}-R{round_num}"

		ingredient_needs = {}
		new_order_items = []

		for it in items:
			item_id = it.get("item_id")
			try:
				qty = int(it.get("qty", 1))
			except (ValueError, TypeError):
				qty = 1
			if qty <= 0:
				frappe.throw(_("Item quantity must be greater than zero."))

			menu_item = menu.get(item_id)
			if not menu_item:
				frappe.throw(_("Menu item with ID {0} does not exist.").format(item_id))

			if not menu_item.get("available", True):
				frappe.throw(
					_("Item '{0}' ({1}) is currently marked unavailable and cannot be ordered.").format(
						menu_item["name"], item_id
					)
				)

			recipe = menu_item.get("recipe", {})
			for ing_name, per_unit_qty in recipe.items():
				total_req = round(per_unit_qty * qty, 3)
				ingredient_needs[ing_name] = ingredient_needs.get(ing_name, 0.0) + total_req

			amt = menu_item["price"] * qty
			item_note = it.get("notes") or it.get("special_instructions") or ""
			item_dict = {
				"item_id": item_id,
				"name": menu_item["name"],
				"qty": qty,
				"price": menu_item["price"],
				"amount": amt,
				"round": round_num,
			}
			if item_note:
				item_dict["notes"] = item_note
			new_order_items.append(item_dict)

		# Check stock availability for new items only
		cls.validate_order_ingredients(data, new_order_items)

		# Deduct inventory ONLY for the new items
		cls._deduct_inventory_for_order(data, {
			"order_id": target_order.get("order_id"),
			"table_no": target_order.get("table_no"),
			"items": new_order_items,
			"inventory_deducted": False,
		}, batch_id=batch_id)

		now_dt = frappe.utils.now_datetime()
		created_at_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")
		created_time_str = now_dt.strftime("%I:%M %p")

		# Append new batch for KDS
		new_batch = {
			"batch_id": batch_id,
			"round": round_num,
			"round_name": f"Round {round_num}",
			"items": copy.deepcopy(new_order_items),
			"status": "Confirmed",
			"created_at": created_at_str,
			"created_time_str": created_time_str,
			"notes": notes or "",
		}
		batches.append(new_batch)

		# Append new items to order items
		target_order.setdefault("items", []).extend(new_order_items)

		# Recalculate totals across all items
		subtotal = sum(int(it.get("amount", it.get("qty", 1) * it.get("price", 0))) for it in target_order["items"])
		tax = round(subtotal * 0.05)
		total = subtotal + tax

		target_order["subtotal"] = subtotal
		target_order["tax"] = tax
		target_order["total"] = total
		target_order["formatted_amount"] = f"₹{total:,}"

		# If overall order was Served or Billed, reset status to Preparing since new batch is cooking
		if target_order.get("status") in ["Served", "Billed"]:
			target_order["status"] = "Preparing"
			target_order["badge_class"] = "badge-preparing"

		# Update Table
		table = next((t for t in data.get("tables", []) if t.get("table_no") == target_order.get("table_no")), None)
		if table:
			table["order_amount"] = target_order["formatted_amount"]
			table["order_status"] = target_order["status"]

		# If bill exists, update bill records in sync
		bills = data.get("bills", [])
		bill = next((b for b in bills if b.get("order_id") == target_order["order_id"]), None)
		if bill and bill.get("payment_status") != "Paid":
			bill_subtotal = subtotal
			bill_tax = round(bill_subtotal * 0.05, 2)
			bill_cgst = round(bill_tax / 2.0, 2)
			bill_sgst = round(bill_tax - bill_cgst, 2)
			bill_total = round(bill_subtotal + bill_tax, 2)
			bill["items"] = [
				{
					"item_id": it.get("item_id"),
					"name": it.get("name"),
					"qty": int(it.get("qty", 1)),
					"price": int(it.get("price", 0)),
					"amount": int(it.get("qty", 1)) * int(it.get("price", 0)),
					"formatted_price": f"₹{int(it.get('price', 0)):,}",
					"formatted_amount": f"₹{int(it.get('qty', 1)) * int(it.get('price', 0)):,}",
					"round": it.get("round", 1),
				}
				for it in target_order["items"]
			]
			bill["subtotal"] = bill_subtotal
			bill["formatted_subtotal"] = f"₹{bill_subtotal:,}"
			bill["cgst"] = bill_cgst
			bill["formatted_cgst"] = f"₹{bill_cgst:,}"
			bill["sgst"] = bill_sgst
			bill["formatted_sgst"] = f"₹{bill_sgst:,}"
			bill["tax"] = bill_tax
			bill["formatted_tax"] = f"₹{bill_tax:,}"
			bill["total"] = bill_total
			bill["formatted_total"] = f"₹{bill_total:,}"

		cls.save_data(data)
		return {
			"order": target_order,
			"new_batch": new_batch,
			"round": round_num,
			"message": _("Added {0} item(s) to order {1} (Round {2}).").format(len(new_order_items), target_order["order_id"], round_num),
		}

	@classmethod
	def get_orders(cls, status=None, table_no=None):
		data = cls.get_data()
		orders = data.get("orders", [])
		if status:
			orders = [o for o in orders if o.get("status") == status]
		if table_no:
			orders = [o for o in orders if o.get("table_no") == table_no]
		return orders

	@classmethod
	def get_order_management_data(cls, status=None, area=None, search=None):
		"""
		Returns aggregated order list, KPI summaries, status tallies,
		available tables, and menu catalog for Order Management.
		"""
		data = cls.get_data()
		all_orders = data.get("orders", [])

		active_statuses = ["Confirmed", "Preparing", "Ready", "Served"]
		pending_kitchen_statuses = ["Confirmed", "Preparing"]

		active_count = sum(1 for o in all_orders if o.get("status") in active_statuses)
		pending_kitchen_count = sum(1 for o in all_orders if o.get("status") in pending_kitchen_statuses)
		paid_count = sum(1 for o in all_orders if o.get("payment_status") == "Paid")
		today_revenue = sum(o.get("total", 0) for o in all_orders if o.get("payment_status") == "Paid")

		standard_statuses = ["All", "Confirmed", "Preparing", "Ready", "Served", "Billed", "Paid", "Cancelled"]
		status_counts = [{"name": "All", "count": len(all_orders)}]
		for s in standard_statuses[1:]:
			cnt = sum(1 for o in all_orders if o.get("status") == s)
			status_counts.append({"name": s, "count": cnt})

		areas = ["All Areas", "Main Dining Hall", "Garden Patio", "Rooftop Terrace"]

		filtered_orders = []
		for o in all_orders:
			if status and status != "All" and o.get("status") != status:
				continue
			if area and area != "All Areas" and o.get("area") != area:
				continue
			if search:
				q = search.strip().lower()
				m_id = q in o.get("order_id", "").lower()
				m_tbl = q in o.get("table_no", "").lower()
				m_cust = q in o.get("customer", "").lower()
				m_dishes = any(q in it.get("name", "").lower() for it in o.get("items", []))
				if not (m_id or m_tbl or m_cust or m_dishes):
					continue

			ord_copy = copy.deepcopy(o)
			curr_st = ord_copy.get("status")
			valid_transitions = []
			if curr_st == "Confirmed":
				valid_transitions = ["Preparing", "Cancelled"]
			elif curr_st == "Preparing":
				valid_transitions = ["Ready", "Cancelled"]
			elif curr_st == "Ready":
				valid_transitions = ["Served", "Cancelled"]
			elif curr_st == "Served":
				valid_transitions = ["Billed"]
			elif curr_st == "Billed":
				valid_transitions = ["Paid"]
			ord_copy["valid_transitions"] = valid_transitions
			filtered_orders.append(ord_copy)

		orderable_tables = [
			{
				"table_no": t["table_no"],
				"area": t.get("area", ""),
				"capacity": t.get("capacity", 2),
				"status": t.get("status", "Available"),
				"customer": t.get("customer", ""),
				"customer_mobile": t.get("customer_mobile", ""),
				"customer_id": t.get("customer_id", ""),
			}
			for t in data.get("tables", [])
			if t.get("status") == "Available" or (t.get("status") == "Occupied" and not t.get("order_id"))
		]

		menu_data = cls.get_menu_management_data()
		menu_items = menu_data.get("items", [])
		menu_categories = [c["name"] for c in menu_data.get("categories", []) if c["name"] != "All"]

		return {
			"orders": filtered_orders,
			"summary": {
				"active_orders": active_count,
				"today_orders": len(all_orders),
				"pending_kitchen": pending_kitchen_count,
				"today_revenue": f"₹{today_revenue:,}",
				"paid_orders": paid_count,
			},
			"status_counts": status_counts,
			"areas": areas,
			"available_tables": orderable_tables,
			"all_tables": data.get("tables", []),
			"menu_items": menu_items,
			"menu_categories": menu_categories,
			"sample_customers": [c["name"] if isinstance(c, dict) else c for c in data.get("customers", [])],
			"customers": [c for c in data.get("customers", []) if isinstance(c, dict)],
		}

	@classmethod
	def get_order_details(cls, order_id):
		data = cls.get_data()
		order = next((o for o in data.get("orders", []) if o["order_id"] == order_id), None)
		if not order:
			frappe.throw(_("Order {0} not found").format(order_id))
		return order

	@classmethod
	def update_order_status(cls, order_id, new_status, reason=""):
		"""
		Unified lifecycle status updater across Order Management, KDS, and Billing.
		Handles status transitions, inventory reversals, and table releases.
		"""
		data = cls.get_data()
		order = next((o for o in data.get("orders", []) if o["order_id"] == order_id), None)
		if not order:
			frappe.throw(_("Order {0} not found").format(order_id))

		status_badge_map = {
			"Confirmed": "badge-info",
			"Preparing": "badge-preparing",
			"Ready": "badge-warning",
			"Served": "badge-served",
			"Billed": "badge-billed",
			"Paid": "badge-positive",
			"Cancelled": "badge-neutral",
		}

		if new_status not in status_badge_map:
			frappe.throw(_("Invalid order status: {0}").format(new_status))

		old_status = order.get("status")
		order["status"] = new_status
		order["badge_class"] = status_badge_map.get(new_status, "badge-neutral")

		table_no = order.get("table_no")
		table = next((t for t in data.get("tables", []) if t["table_no"] == table_no), None)

		if new_status == "Cancelled" and old_status != "Cancelled":
			# Safe inventory reversal
			cls._reverse_inventory_for_order(data, order)
			order["cancellation_reason"] = reason or "Cancelled by user"
			if table and table.get("order_id") == order_id:
				table["status"] = "Available"
				table["customer"] = ""
				table["order_id"] = ""
				table["order_amount"] = ""
				table["seated_time"] = ""
				table["notes"] = ""

		elif new_status == "Paid":
			order["payment_status"] = "Paid"
			if table and table.get("order_id") == order_id:
				table["status"] = "Available"
				table["customer"] = ""
				table["guests"] = 0
				table["seated_time"] = ""
				table["order_id"] = ""
				table["order_amount"] = ""
				table["notes"] = ""

		elif new_status == "Billed":
			order["status"] = "Billed"

		cls.save_data(data)
		return order

	# =========================================================================
	# Kitchen Display System (KDS)
	# =========================================================================
	@classmethod
	def get_kitchen_orders(cls):
		data = cls.get_data()
		orders = data.get("orders", [])
		return [o for o in orders if o.get("status") in ["Confirmed", "Preparing", "Ready", "Served"]]

	@classmethod
	def get_kds_data(cls, area=None, search=None):
		"""
		Returns active kitchen tickets grouped into 3 columns (Confirmed, Preparing, Ready),
		live kitchen KPIs (New Orders, Preparing, Ready, Served Today), and filter options.
		"""
		data = cls.get_data()
		all_orders = data.get("orders", [])
		now = frappe.utils.now_datetime()

		for o in all_orders:
			if not o.get("created_at"):
				time_ago = o.get("time_ago", "")
				minutes = 5
				if "min" in time_ago:
					m = re.search(r"(\d+)\s*min", time_ago)
					if m:
						minutes = int(m.group(1))
				elif "hr" in time_ago:
					m = re.search(r"(\d+)\s*hr", time_ago)
					if m:
						minutes = int(m.group(1)) * 60
				created_dt = now - datetime.timedelta(minutes=minutes)
				o["created_at"] = created_dt.strftime("%Y-%m-%d %H:%M:%S")
				o["created_time_str"] = created_dt.strftime("%I:%M %p")
			elif "created_time_str" not in o:
				try:
					dt = frappe.utils.get_datetime(o["created_at"])
					o["created_time_str"] = dt.strftime("%I:%M %p")
				except Exception:
					o["created_time_str"] = "Just now"

			try:
				dt = frappe.utils.get_datetime(o.get("created_at"))
				o["elapsed_seconds"] = max(0, int((now - dt).total_seconds()))
			except Exception:
				o["elapsed_seconds"] = 0

		active_tickets = []
		for o in all_orders:
			batches = o.get("batches")
			if batches and isinstance(batches, list):
				for b in batches:
					b_status = b.get("status", "Confirmed")
					if b_status in ["Confirmed", "Preparing", "Ready"]:
						b_dt_str = b.get("created_at") or o.get("created_at") or now.strftime("%Y-%m-%d %H:%M:%S")
						b_time_str = b.get("created_time_str") or o.get("created_time_str") or "Just now"
						try:
							dt = frappe.utils.get_datetime(b_dt_str)
							elapsed = max(0, int((now - dt).total_seconds()))
						except Exception:
							elapsed = 0
						active_tickets.append({
							"order_id": b.get("batch_id", f"{o['order_id']}-R{b.get('round', 1)}"),
							"batch_id": b.get("batch_id", f"{o['order_id']}-R{b.get('round', 1)}"),
							"parent_order_id": o["order_id"],
							"round": b.get("round", 1),
							"round_name": b.get("round_name", f"Round {b.get('round', 1)}"),
							"display_order_id": f"{o['order_id']} • Round {b.get('round', 1)}",
							"table_no": o["table_no"],
							"area": o.get("area", "Main Dining Hall"),
							"customer": o.get("customer", "Guest"),
							"customer_id": o.get("customer_id", ""),
							"customer_mobile": o.get("customer_mobile", ""),
							"items": b.get("items", []),
							"status": b_status,
							"created_at": b_dt_str,
							"created_time_str": b_time_str,
							"elapsed_seconds": elapsed,
							"notes": b.get("notes") or o.get("notes", ""),
						})
			else:
				if o.get("status") in ["Confirmed", "Preparing", "Ready"]:
					try:
						dt = frappe.utils.get_datetime(o.get("created_at"))
						elapsed = max(0, int((now - dt).total_seconds()))
					except Exception:
						elapsed = 0
					active_tickets.append({
						"order_id": o["order_id"],
						"batch_id": f"{o['order_id']}-R1",
						"parent_order_id": o["order_id"],
						"round": 1,
						"round_name": "Round 1",
						"display_order_id": o["order_id"],
						"table_no": o["table_no"],
						"area": o.get("area", "Main Dining Hall"),
						"customer": o.get("customer", "Guest"),
						"customer_id": o.get("customer_id", ""),
						"customer_mobile": o.get("customer_mobile", ""),
						"items": o.get("items", []),
						"status": o.get("status"),
						"created_at": o.get("created_at"),
						"created_time_str": o.get("created_time_str"),
						"elapsed_seconds": elapsed,
						"notes": o.get("notes", ""),
					})

		# Enrich tickets with recipe details, ingredient breakdown, and stock availability
		menu_lookup = {it["item_id"]: it for it in data.get("menu_items", [])}
		for it in data.get("menu_items", []):
			menu_lookup[it["name"].lower()] = it
		inv_lookup = {inv["name"]: inv for inv in data.get("inventory", [])}

		for t in active_tickets:
			enriched_items = []
			ticket_ingredients = {}
			unconfigured_dishes = []
			unapproved_dishes = []

			for it in t.get("items", []):
				item_id_or_name = it.get("item_id") or it.get("name")
				qty = int(it.get("qty", 1))
				portion = it.get("portion", "Regular")
				recipe_info = cls.get_item_recipe_requirements(
					item_id_or_name=item_id_or_name,
					ordered_qty=qty,
					portion=portion,
					inv_map=inv_lookup,
					menu=menu_lookup,
					data=data,
				)
				it_copy = dict(it)
				it_copy["portion"] = portion
				it_copy["has_recipe"] = recipe_info["has_recipe"]
				it_copy["is_approved"] = recipe_info.get("is_approved", False)
				it_copy["recipe_status"] = recipe_info["recipe_status"]
				it_copy["is_unverified"] = recipe_info.get("is_unverified", True)
				it_copy["ingredients"] = recipe_info["ingredients"]

				if not recipe_info["has_recipe"]:
					unconfigured_dishes.append(it.get("name", "Unknown Dish"))
				elif not recipe_info.get("is_approved", False):
					unapproved_dishes.append(it.get("name", "Unknown Dish"))
				else:
					# Strictly tally confirmed ingredient requirements ONLY from approved recipes!
					for ing in recipe_info["ingredients"]:
						ing_name = ing["ingredient_name"]
						if ing_name not in ticket_ingredients:
							ticket_ingredients[ing_name] = {
								"ingredient_name": ing_name,
								"item_code": ing["item_code"],
								"required_qty": 0.0,
								"unit": ing["unit"],
								"available_qty": ing["available_qty"],
								"available_display": ing["available_display"],
								"location": ing.get("location", ""),
							}
						ticket_ingredients[ing_name]["required_qty"] = round(
							ticket_ingredients[ing_name]["required_qty"] + ing["required_qty"], 3
						)

				enriched_items.append(it_copy)

			consumption_list = []
			for ing in ticket_ingredients.values():
				ing["required_display"] = cls.format_ingredient_qty(ing["required_qty"], ing["unit"])
				ing["in_stock"] = ing["available_qty"] >= ing["required_qty"]
				ing["missing_qty"] = round(max(0.0, ing["required_qty"] - ing["available_qty"]), 3)
				consumption_list.append(ing)

			t["items"] = enriched_items
			t["ingredient_consumption"] = consumption_list
			t["has_unconfigured_recipes"] = len(unconfigured_dishes) > 0
			t["unconfigured_dishes"] = unconfigured_dishes
			t["has_unapproved_recipes"] = len(unapproved_dishes) > 0
			t["unapproved_dishes"] = unapproved_dishes

		confirmed_tickets = [t for t in active_tickets if t.get("status") == "Confirmed"]
		preparing_tickets = [t for t in active_tickets if t.get("status") == "Preparing"]
		ready_tickets = [t for t in active_tickets if t.get("status") == "Ready"]
		served_today = [o for o in all_orders if o.get("status") in ["Served", "Billed", "Paid"]]

		filtered_active = []
		for t in active_tickets:
			if area and area != "All Areas" and t.get("area") != area:
				continue
			if search:
				q = search.strip().lower()
				m_id = q in t.get("order_id", "").lower() or q in t.get("parent_order_id", "").lower()
				m_tbl = q in t.get("table_no", "").lower()
				m_cust = q in t.get("customer", "").lower()
				m_dishes = any(q in it.get("name", "").lower() for it in t.get("items", []))
				if not (m_id or m_tbl or m_cust or m_dishes):
					continue
			filtered_active.append(t)

		return {
			"kpis": {
				"new_orders": len(confirmed_tickets),
				"preparing": len(preparing_tickets),
				"ready": len(ready_tickets),
				"served_today": len(served_today),
			},
			"columns": {
				"confirmed": [t for t in filtered_active if t.get("status") == "Confirmed"],
				"preparing": [t for t in filtered_active if t.get("status") == "Preparing"],
				"ready": [t for t in filtered_active if t.get("status") == "Ready"],
			},
			"areas": ["All Areas", "Main Dining Hall", "Garden Patio", "Rooftop Terrace"],
			"server_time": frappe.utils.now(),
		}

	@classmethod
	def update_kitchen_status(cls, order_id_or_batch_id=None, new_status=None, order_id=None, status=None):
		order_id_or_batch_id = order_id_or_batch_id or order_id
		new_status = new_status or status
		data = cls.get_data()
		all_orders = data.get("orders", [])

		target_order = None
		target_batch = None

		for o in all_orders:
			for b in o.get("batches", []):
				if b.get("batch_id") == order_id_or_batch_id:
					target_order = o
					target_batch = b
					break
			if target_batch:
				break

		if not target_order:
			target_order = next((o for o in all_orders if o.get("order_id") == order_id_or_batch_id), None)

		if not target_order:
			frappe.throw(_("Ticket or Order {0} not found").format(order_id_or_batch_id))

		status_badge_map = {
			"Confirmed": "badge-info",
			"Preparing": "badge-preparing",
			"Ready": "badge-warning",
			"Served": "badge-served",
			"Billed": "badge-billed",
			"Paid": "badge-positive",
			"Cancelled": "badge-neutral",
		}

		if target_batch:
			target_batch["status"] = new_status
			all_b = target_order.get("batches", [])
			if all(b.get("status") == "Served" for b in all_b):
				target_order["status"] = "Served"
				target_order["badge_class"] = status_badge_map["Served"]
			elif any(b.get("status") == "Ready" for b in all_b) and not any(b.get("status") in ["Confirmed", "Preparing"] for b in all_b):
				target_order["status"] = "Ready"
				target_order["badge_class"] = status_badge_map["Ready"]
			elif any(b.get("status") == "Preparing" for b in all_b):
				target_order["status"] = "Preparing"
				target_order["badge_class"] = status_badge_map["Preparing"]
			else:
				target_order["status"] = new_status
				target_order["badge_class"] = status_badge_map.get(new_status, "badge-info")
		else:
			target_order["status"] = new_status
			target_order["badge_class"] = status_badge_map.get(new_status, "badge-info")
			for b in target_order.get("batches", []):
				b["status"] = new_status

		# Sync table order_status
		table = next((t for t in data.get("tables", []) if t.get("order_id") == target_order.get("order_id")), None)
		if table:
			table["order_status"] = target_order["status"]

		cls.save_data(data)
		return target_order

	# =========================================================================
	# Billing & Payments
	# =========================================================================
	@classmethod
	def get_bill_for_table(cls, table_no):
		data = cls.get_data()
		table = next((t for t in data.get("tables", []) if t["table_no"] == table_no), None)
		if not table:
			frappe.throw(_("Table {0} not found").format(table_no))

		order_id = table.get("order_id")
		order = next((o for o in data.get("orders", []) if o["order_id"] == order_id), None)
		if not order:
			return {
				"table_no": table_no,
				"has_order": False,
				"customer": table.get("customer", ""),
			}

		bill = next((b for b in data.get("bills", []) if b.get("order_id") == order_id), None)
		receipt_data = cls.get_bill_receipt_data(order_id)

		return {
			"has_order": True,
			"order": order,
			"bill": bill,
			"bill_no": bill.get("bill_no") if bill else order.get("bill_no"),
			"subtotal": order.get("subtotal", 0),
			"tax": order.get("tax", 0),
			"total": order.get("total", 0),
			"formatted_amount": order.get("formatted_amount", ""),
			"receipt": receipt_data,
			"receipt_html": receipt_data.get("receipt_html"),
		}

	@classmethod
	def generate_bill(cls, order_id):
		"""
		Generates a formal bill record for an eligible order in RestaurantStore.
		Rules:
		- Only 'Served' orders can be billed.
		- 'Preparing', 'Ready', or 'Confirmed' orders raise frappe.ValidationError.
		- If bill already exists for order_id, returns existing bill (duplicate prevention).
		- Calculates totals on backend with 5% GST (2.5% CGST + 2.5% SGST).
		- Never re-deducts inventory.
		- Updates order status to 'Billed'.
		"""
		data = cls.get_data()
		orders = data.get("orders", [])
		order = next((o for o in orders if o.get("order_id") == order_id), None)
		if not order:
			frappe.throw(_("Order {0} not found").format(order_id))

		# Check if bill already exists for this order
		bills = data.setdefault("bills", [])
		existing_bill = next((b for b in bills if b.get("order_id") == order_id), None)
		if existing_bill:
			# Resync existing bill in case incremental items were added
			subtotal = sum(int(it.get("amount", it.get("qty", 1) * it.get("price", 0))) for it in order.get("items", []))
			tax = round(subtotal * 0.05, 2)
			cgst = round(tax / 2.0, 2)
			sgst = round(tax - cgst, 2)
			total = round(subtotal + tax, 2)
			existing_bill["subtotal"] = subtotal
			existing_bill["formatted_subtotal"] = f"₹{subtotal:,}"
			existing_bill["cgst"] = cgst
			existing_bill["formatted_cgst"] = f"₹{cgst:,}"
			existing_bill["sgst"] = sgst
			existing_bill["formatted_sgst"] = f"₹{sgst:,}"
			existing_bill["tax"] = tax
			existing_bill["formatted_tax"] = f"₹{tax:,}"
			existing_bill["total"] = total
			existing_bill["formatted_total"] = f"₹{total:,}"
			existing_bill["items"] = [
				{
					"item_id": it.get("item_id"),
					"name": it.get("name"),
					"qty": int(it.get("qty", 1)),
					"price": int(it.get("price", 0)),
					"amount": int(it.get("qty", 1)) * int(it.get("price", 0)),
					"formatted_price": f"₹{int(it.get('price', 0)):,}",
					"formatted_amount": f"₹{int(it.get('qty', 1)) * int(it.get('price', 0)):,}",
					"round": it.get("round", 1),
				}
				for it in order.get("items", [])
			]
			cls.save_data(data)
			return existing_bill

		# Check order status - Only 'Served' orders can be billed
		current_status = order.get("status")
		if current_status != "Served":
			frappe.throw(
				_("Only Served orders can be billed. Order {0} is currently '{1}'.").format(
					order_id, current_status
				),
				frappe.ValidationError
			)

		# Generate unique bill number: BILL-2026-XXXX
		existing_nums = []
		for b in bills:
			b_no = b.get("bill_no", "")
			if b_no.startswith("BILL-2026-"):
				try:
					existing_nums.append(int(b_no.split("-")[-1]))
				except ValueError:
					pass
		next_num = (max(existing_nums) + 1) if existing_nums else 1
		bill_no = f"BILL-2026-{next_num:04d}"

		# Calculate backend verified totals
		subtotal = 0
		bill_items = []
		for it in order.get("items", []):
			qty = int(it.get("qty", 1))
			price = int(it.get("price", 0))
			amount = qty * price
			subtotal += amount
			bill_items.append({
				"item_id": it.get("item_id"),
				"name": it.get("name"),
				"qty": qty,
				"price": price,
				"amount": amount,
				"formatted_price": f"₹{price:,}",
				"formatted_amount": f"₹{amount:,}",
			})

		tax = round(subtotal * 0.05, 2)
		cgst = round(tax / 2.0, 2)
		sgst = round(tax - cgst, 2)
		total = round(subtotal + tax, 2)

		now_dt = frappe.utils.now_datetime()
		bill_date = now_dt.strftime("%Y-%m-%d")
		bill_time = now_dt.strftime("%I:%M %p")

		bill = {
			"bill_no": bill_no,
			"order_id": order_id,
			"table_no": order.get("table_no", ""),
			"area": order.get("area", "Main Dining Hall"),
			"customer_id": order.get("customer_id", ""),
			"customer_name": order.get("customer", "Guest"),
			"customer_mobile": order.get("customer_mobile", ""),
			"bill_date": bill_date,
			"bill_time": bill_time,
			"created_at": now_dt.strftime("%Y-%m-%d %H:%M:%S"),
			"items": bill_items,
			"subtotal": subtotal,
			"formatted_subtotal": f"₹{subtotal:,}",
			"cgst": cgst,
			"formatted_cgst": f"₹{cgst:,}",
			"sgst": sgst,
			"formatted_sgst": f"₹{sgst:,}",
			"tax": tax,
			"formatted_tax": f"₹{tax:,}",
			"total": total,
			"formatted_total": f"₹{total:,}",
			"payment_status": "Unpaid",
			"payment_method": "",
			"payment_reference": "",
			"paid_at": "",
			"notes": order.get("notes", ""),
		}

		# Transition order status to 'Billed'
		order["status"] = "Billed"
		order["badge_class"] = "badge-billed"
		order["bill_no"] = bill_no
		order["subtotal"] = subtotal
		order["tax"] = tax
		order["total"] = total
		order["formatted_amount"] = f"₹{total:,}"

		bills.append(bill)
		cls.save_data(data)
		return bill

	@classmethod
	def process_payment(cls, order_id_or_bill_no, payment_method="Cash", payment_reference="", discount=0):
		"""
		Records a payment against a bill or order.
		Rules:
		- Methods: Cash, UPI, Card.
		- UPI and Card require a non-empty payment_reference / transaction reference.
		- Cash payment reference is optional.
		- Blocks duplicate payment on already-paid bills.
		- Updates bill payment status to Paid.
		- Updates order status to Paid.
		- Releases the occupied table back to Available.
		- Updates Dashboard revenue automatically.
		- Preserves payment history.
		- Does NOT deduct inventory.
		"""
		data = cls.get_data()
		bills = data.setdefault("bills", [])
		orders = data.get("orders", [])

		# Find bill by bill_no or order_id
		bill = next((b for b in bills if b.get("bill_no") == order_id_or_bill_no or b.get("order_id") == order_id_or_bill_no), None)
		order = None
		if bill:
			order = next((o for o in orders if o.get("order_id") == bill.get("order_id")), None)
		else:
			order = next((o for o in orders if o.get("order_id") == order_id_or_bill_no), None)

		if not order and not bill:
			frappe.throw(_("No bill or order found for identifier: {0}").format(order_id_or_bill_no))

		# If bill does not exist yet for this order, check if eligible and generate
		if not bill and order:
			if order.get("status") in ["Served", "Billed"]:
				bill = cls.generate_bill(order.get("order_id"))
				data = cls.get_data()
				bills = data.get("bills", [])
				orders = data.get("orders", [])
				order = next((o for o in orders if o.get("order_id") == bill.get("order_id")), order)
			else:
				frappe.throw(_("Order {0} has no bill and cannot be paid until served").format(order.get("order_id")))

		# Check duplicate payment
		if bill and bill.get("payment_status") == "Paid":
			frappe.throw(_("Bill {0} has already been paid.").format(bill.get("bill_no")), frappe.ValidationError)
		if order and order.get("payment_status") == "Paid":
			frappe.throw(_("Order {0} has already been paid.").format(order.get("order_id")), frappe.ValidationError)

		# Validate payment method
		valid_methods = {"cash": "Cash", "upi": "UPI", "card": "Card"}
		raw_method = (payment_method or "").strip().lower()
		norm_method = valid_methods.get(raw_method)
		if not norm_method:
			frappe.throw(
				_("Invalid payment method '{0}'. Allowed methods: Cash, UPI, Card.").format(payment_method),
				frappe.ValidationError
			)

		# Validate reference
		ref = (payment_reference or "").strip()
		if norm_method in ["UPI", "Card"] and not ref:
			frappe.throw(
				_("Transaction reference is required for {0} payments.").format(norm_method),
				frappe.ValidationError
			)

		now_dt = frappe.utils.now_datetime()
		paid_at = now_dt.strftime("%Y-%m-%d %H:%M:%S")

		if bill:
			bill["payment_status"] = "Paid"
			bill["payment_method"] = norm_method
			bill["payment_reference"] = ref
			bill["paid_at"] = paid_at

		if order:
			order["payment_status"] = "Paid"
			order["status"] = "Paid"
			order["badge_class"] = "badge-positive"
			order["payment_method"] = norm_method
			order["payment_reference"] = ref
			order["paid_at"] = paid_at

		# Release table
		table_no = order.get("table_no") if order else (bill.get("table_no") if bill else None)
		released_table = None
		if table_no:
			table = next((t for t in data.get("tables", []) if t.get("table_no") == table_no), None)
			if table:
				table["status"] = "Available"
				table["customer"] = ""
				table["customer_id"] = ""
				table["customer_mobile"] = ""
				table["guests"] = 0
				table["seated_time"] = ""
				table["seated_at"] = ""
				table["order_id"] = ""
				table["order_amount"] = ""
				table["reservation_time"] = ""
				table["reservation_id"] = ""
				table["notes"] = ""
				table["order_status"] = ""
				released_table = table_no

		cls.save_data(data)
		return {
			"success": True,
			"bill": bill,
			"order": order,
			"released_table": released_table,
			"message": _("Payment of {0} recorded via {1}").format(
				bill.get("formatted_total") if bill else (order.get("formatted_amount") if order else ""),
				norm_method
			),
		}

	@classmethod
	def get_billing_data(cls, status=None, area=None, search=None, date_filter=None):
		"""
		Returns summary KPIs, filtered bills list, and served orders ready for billing.
		"""
		data = cls.get_data()
		bills = data.get("bills", [])
		orders = data.get("orders", [])

		# Calculate KPIs
		todays_bills_count = len(bills)
		paid_bills_count = sum(1 for b in bills if b.get("payment_status") == "Paid")
		pending_bills_count = sum(1 for b in bills if b.get("payment_status") != "Paid")
		todays_revenue = sum(b.get("total", 0) for b in bills if b.get("payment_status") == "Paid")

		# Served orders ready to bill
		served_orders = [o for o in orders if o.get("status") == "Served"]

		# Filter bills
		filtered = []
		for b in bills:
			# Status filter
			if status and status != "All":
				if status == "Paid" and b.get("payment_status") != "Paid":
					continue
				if status in ["Unpaid", "Pending"] and b.get("payment_status") == "Paid":
					continue

			# Area filter
			if area and area != "All" and b.get("area") != area:
				continue

			# Date filter
			if date_filter and b.get("bill_date") != date_filter:
				continue

			# Search filter
			if search:
				q = search.lower().strip()
				haystack = f"{b.get('bill_no', '')} {b.get('order_id', '')} {b.get('table_no', '')} {b.get('customer_name', '')} {b.get('customer_mobile', '')}".lower()
				if q not in haystack:
					continue

			filtered.append(b)

		# Sort bills by created_at descending (newest first)
		filtered.sort(key=lambda x: x.get("created_at", ""), reverse=True)

		areas = [a.get("name") for a in data.get("areas", [])]

		return {
			"summary": {
				"todays_bills": todays_bills_count,
				"paid_bills": paid_bills_count,
				"pending_payments": pending_bills_count,
				"todays_revenue": todays_revenue,
				"formatted_revenue": f"₹{todays_revenue:,}",
			},
			"bills": filtered,
			"served_orders": served_orders,
			"areas": areas,
			"restaurant_info": cls.get_restaurant_info(),
		}

	# =========================================================================
	# Inventory & Warehouse Management (Feature 9)
	# =========================================================================
	@classmethod
	def convert_quantity(cls, qty, from_unit, to_unit):
		"""
		Converts quantity between compatible units:
		- Mass: kg <-> g, gram, grams, gm, gms, kilogram, kilograms
		- Volume: ltr <-> ml, milliliter, milliliters, litre, litres, l, liter
		- Count: piece, pieces, pc, pcs, nos
		- Spoons: tbsp (15g / 15ml), tsp (5g / 5ml)
		"""
		if not qty or from_unit == to_unit:
			return qty
		u_from = (from_unit or "").lower().strip()
		u_to = (to_unit or "").lower().strip()
		if u_from == u_to:
			return qty

		# Mass
		if u_from in ["g", "gram", "grams", "gm", "gms"] and u_to in ["kg", "kilogram", "kilograms"]:
			return qty / 1000.0
		if u_from in ["kg", "kilogram", "kilograms"] and u_to in ["g", "gram", "grams", "gm", "gms"]:
			return qty * 1000.0

		# Volume
		if u_from in ["ml", "milliliter", "milliliters", "millilitre", "millilitres"] and u_to in ["ltr", "l", "liter", "litres", "litre"]:
			return qty / 1000.0
		if u_from in ["ltr", "l", "liter", "litres", "litre"] and u_to in ["ml", "milliliter", "milliliters", "millilitre", "millilitres"]:
			return qty * 1000.0

		# Spoons
		if u_from == "tbsp":
			if u_to in ["g", "gm", "ml"]: return qty * 15.0
			if u_to in ["kg", "ltr", "l", "litre"]: return qty * 0.015
		if u_from == "tsp":
			if u_to in ["g", "gm", "ml"]: return qty * 5.0
			if u_to in ["kg", "ltr", "l", "litre"]: return qty * 0.005

		# Count
		if u_from in ["piece", "pieces", "pc", "pcs", "nos"] and u_to in ["piece", "pieces", "pc", "pcs", "nos"]:
			return qty

		return qty

	@classmethod
	def format_ingredient_qty(cls, qty, unit):
		"""
		Formats ingredient quantity for display with appropriate units.
		Shows gram/ml for amounts below 1.0 (e.g. 600 g (0.6 kg)) for kitchen clarity.
		"""
		u = (unit or "").lower().strip()
		if u in ["kg", "kilogram"]:
			if 0 < qty < 1.0:
				g = qty * 1000.0
				g_str = f"{int(g)}" if g.is_integer() else f"{round(g, 1)}"
				return f"{g_str} g ({qty} kg)"
			return f"{round(qty, 2)} kg"
		if u in ["ltr", "l", "liter"]:
			if 0 < qty < 1.0:
				ml = qty * 1000.0
				ml_str = f"{int(ml)}" if ml.is_integer() else f"{round(ml, 1)}"
				return f"{ml_str} ml ({qty} ltr)"
			return f"{round(qty, 2)} ltr"
		if u in ["pcs", "pieces"]:
			return f"{int(qty) if float(qty).is_integer() else qty} pcs"
		return f"{qty} {unit}"

	@classmethod
	def get_item_recipe_requirements(cls, item_id_or_name, ordered_qty=1, portion="Regular", inv_map=None, menu=None, data=None):
		"""
		Computes detailed recipe ingredient requirements for an ordered dish and portion.
		Enforces:
		- Portion awareness (e.g. Regular, Half, Full).
		- Unit conversion (g <-> kg, ml <-> ltr).
		- Preparation wastage percentage calculation.
		- Strict Approval Verification: Only 'Approved' recipes can participate in inventory deduction!
		- Unapproved (Draft / Pending) recipes return is_unverified=True and can_deduct_inventory=False.
		- Unmapped ingredients are flagged cleanly without duplicate inventory creation.
		"""
		if data is None and (inv_map is None or menu is None):
			data = cls.get_data()

		if menu is None:
			menu = {it["item_id"]: it for it in data.get("menu_items", [])}
			for it in data.get("menu_items", []):
				menu[it["name"].lower()] = it

		if inv_map is None:
			inv_map = {inv["name"].lower(): inv for inv in data.get("inventory", []) if inv.get("name")}
		
		inv_by_code = {inv["item_code"]: inv for inv in data.get("inventory", []) if inv.get("item_code")}

		# Find menu item
		menu_item = menu.get(item_id_or_name) or menu.get(str(item_id_or_name).lower())
		if not menu_item:
			for it in menu.values():
				if it.get("item_id") == item_id_or_name or it.get("name", "").lower() == str(item_id_or_name).lower():
					menu_item = it
					break

		if not menu_item:
			return {
				"has_recipe": False,
				"recipe_status": "Recipe Not Configured",
				"is_approved": False,
				"can_deduct_inventory": False,
				"portion": portion or "Regular",
				"ingredients": [],
				"is_configured": False,
			}

		rec_details = menu_item.get("recipe_details") or {}
		status = rec_details.get("status") or ("Approved" if menu_item.get("recipe") else "Draft")
		is_approved = (status == "Approved")
		can_deduct = is_approved

		portions = rec_details.get("portions") or {}
		# Select requested portion or fallback to Regular or first portion
		p_data = portions.get(portion) or portions.get("Regular")
		if not p_data and portions:
			p_data = next(iter(portions.values()), None)

		raw_ingredients = p_data.get("ingredients", []) if p_data else []
		
		# If no structured ingredients, fallback to legacy recipe dict if Approved
		if not raw_ingredients and menu_item.get("recipe") and isinstance(menu_item.get("recipe"), dict):
			raw_ingredients = [
				{
					"ingredient_name": ing_k,
					"quantity": float(ing_v),
					"unit": "kg",
					"is_mapped": True
				}
				for ing_k, ing_v in menu_item.get("recipe").items()
			]
			status = "Approved"
			is_approved = True
			can_deduct = True

		if not raw_ingredients:
			return {
				"has_recipe": False,
				"recipe_status": "Recipe Not Configured",
				"is_approved": False,
				"can_deduct_inventory": False,
				"portion": portion or "Regular",
				"ingredients": [],
				"is_configured": False,
			}

		ingredients = []
		ordered_qty = max(1, int(ordered_qty))
		portion_wastage = float(p_data.get("wastage_pct", 0) if p_data else 0)

		for ing in raw_ingredients:
			ing_name = ing.get("ingredient_name") or ing.get("name", "")
			qty_per_portion = float(ing.get("quantity", 0))
			unit = ing.get("unit", "g")
			ing_wastage = float(ing.get("wastage_pct", 0) or portion_wastage)

			net_req = round(qty_per_portion * ordered_qty, 3)
			gross_req = round(net_req * (1.0 + ing_wastage / 100.0), 3)

			# Inventory item lookup
			inv_code = ing.get("inventory_item_code") or ""
			inv_item = inv_by_code.get(inv_code) or inv_map.get(ing_name.lower())
			if not inv_item and ing.get("inventory_item_name"):
				inv_item = inv_map.get(str(ing.get("inventory_item_name")).lower())

			if inv_item:
				inv_unit = inv_item.get("unit", "kg")
				avail_qty = float(inv_item.get("quantity", 0.0))
				item_code = inv_item.get("item_code", "")
				stock_deduct_qty = round(cls.convert_quantity(gross_req, unit, inv_unit), 3)
				in_stock = avail_qty >= stock_deduct_qty
				missing_stock = round(max(0.0, stock_deduct_qty - avail_qty), 3)
				is_mapped = True
				location = inv_item.get("location", "Cold Storage")
			else:
				inv_unit = unit
				avail_qty = 0.0
				item_code = ""
				stock_deduct_qty = 0.0
				in_stock = True # Not stock tracked
				missing_stock = 0.0
				is_mapped = False
				location = "Unmapped"

			ingredients.append({
				"ingredient_name": ing_name,
				"item_code": item_code,
				"inventory_item_name": inv_item.get("name") if inv_item else "",
				"per_serving": qty_per_portion,
				"per_serving_unit": unit,
				"per_serving_display": f"{qty_per_portion} {unit}",
				"ordered_qty": ordered_qty,
				"required_qty": gross_req,
				"unit": unit,
				"required_display": f"{gross_req} {unit}",
				"stock_deduct_qty": stock_deduct_qty,
				"stock_unit": inv_unit,
				"available_qty": avail_qty,
				"available_display": f"{avail_qty} {inv_unit}" if is_mapped else "Unmapped",
				"in_stock": in_stock,
				"missing_qty": missing_stock,
				"missing_display": f"{missing_stock} {inv_unit}" if missing_stock > 0 else "0",
				"is_mapped": is_mapped,
				"is_unverified": not is_approved,
				"wastage_pct": ing_wastage,
				"location": location,
			})

		return {
			"has_recipe": True,
			"recipe_status": status,
			"is_approved": is_approved,
			"can_deduct_inventory": can_deduct,
			"portion": portion or (p_data.get("portion_name") if p_data else "Regular"),
			"is_unverified": not is_approved,
			"ingredients": ingredients,
			"is_configured": True,
		}

	@classmethod
	def validate_order_ingredients(cls, data, items):
		"""
		Validates that sufficient inventory exists for all approved recipe ingredients in items.
		Strictly applies only to approved recipes. Reports shortages clearly and prevents negative stock.
		"""
		menu = {it["item_id"]: it for it in data.get("menu_items", [])}
		for it in data.get("menu_items", []):
			menu[it["name"].lower()] = it

		inv_map = {inv["name"].lower(): inv for inv in data.get("inventory", []) if inv.get("name")}
		inv_by_code = {inv["item_code"]: inv for inv in data.get("inventory", []) if inv.get("item_code")}

		ingredient_needs = {}
		for it in items:
			item_id_or_name = it.get("item_id") or it.get("name")
			qty = int(it.get("qty", 1))
			portion = it.get("portion", "Regular")
			req_info = cls.get_item_recipe_requirements(
				item_id_or_name=item_id_or_name,
				ordered_qty=qty,
				portion=portion,
				inv_map=inv_map,
				menu=menu,
				data=data,
			)
			# Only approved recipes participate in inventory validation and deduction
			if not req_info.get("can_deduct_inventory"):
				continue

			for ing in req_info.get("ingredients", []):
				if not ing.get("is_mapped"):
					continue
				inv_code = ing.get("item_code")
				inv_item = inv_by_code.get(inv_code) or inv_map.get(ing.get("inventory_item_name", "").lower()) or inv_map.get(ing.get("ingredient_name", "").lower())
				if not inv_item:
					continue
				deduct_qty = float(ing.get("stock_deduct_qty", 0.0))
				ing_key = inv_item["name"]
				ingredient_needs[ing_key] = round(ingredient_needs.get(ing_key, 0.0) + deduct_qty, 3)

		shortages = []
		for ing_name, total_needed in ingredient_needs.items():
			inv_item = next((iv for iv in data.get("inventory", []) if iv.get("name") == ing_name), None)
			avail = float(inv_item.get("quantity", 0.0)) if inv_item else 0.0
			unit = inv_item.get("unit", "kg") if inv_item else "kg"
			if avail < total_needed:
				missing = round(total_needed - avail, 3)
				shortages.append({
					"ingredient": ing_name,
					"required": total_needed,
					"available": avail,
					"missing": missing,
					"unit": unit,
				})

		if shortages:
			err_msgs = [_("Insufficient inventory stock to fulfill order:")]
			for s in shortages:
				err_msgs.append(
					_("• {ingredient}: requires {required} {unit}, but only {available} {unit} available (shortage of {missing} {unit})").format(
						**s
					)
				)
			frappe.throw("\n".join(err_msgs))

		return ingredient_needs

	@classmethod
	def _record_movement_internal(cls, data, item_name, movement_type, qty, unit="kg", from_location="", to_location="", reason="", reference="", user="Administrator"):
		"""
		Records an immutable, persistent stock movement entry with unique MOV-YYYY-XXXX ID.
		"""
		movements = data.setdefault("stock_movements", [])
		existing_ids = []
		for m in movements:
			mid = m.get("movement_id", "")
			if mid.startswith("MOV-2026-"):
				try:
					existing_ids.append(int(mid.split("-")[-1]))
				except ValueError:
					pass
		next_num = (max(existing_ids) + 1) if existing_ids else 1
		movement_id = f"MOV-2026-{next_num:04d}"

		item_code = ""
		for inv in data.get("inventory", []):
			if inv.get("name") == item_name:
				item_code = inv.get("item_code", "")
				break

		mov = {
			"movement_id": movement_id,
			"timestamp": frappe.utils.now_datetime().strftime("%Y-%m-%d %H:%M:%S"),
			"item_name": item_name,
			"item_code": item_code,
			"movement_type": movement_type,
			"qty": round(float(qty), 3),
			"unit": unit,
			"from_location": from_location,
			"to_location": to_location,
			"reason": reason,
			"reference": reference,
			"user": user or "Administrator",
		}
		movements.append(mov)
		return mov

	@classmethod
	def get_inventory(cls):
		"""
		Returns raw inventory items list with computed warnings.
		"""
		data = cls.get_data()
		inventory = data.get("inventory", [])
		for item in inventory:
			qty = item.get("quantity", 0)
			reorder = item.get("reorder_level", 0)
			item["low_stock_warning"] = qty <= reorder and qty > 0
			item["out_of_stock"] = qty <= 0
		return inventory

	@classmethod
	def _deduct_inventory_for_order(cls, data, order, batch_id=None):
		"""
		Deducts inventory for order recipes exactly once upon confirmation.
		Enforces:
		- Portion & unit-aware stock deduction.
		- Only approved recipes participate in inventory deduction.
		- Unmapped ingredients are skipped from physical deduction without duplication.
		- Logs persistent Order Consumption movements with order/batch reference.
		"""
		if order.get("inventory_deducted") and batch_id is None:
			return

		menu = {it["item_id"]: it for it in data.get("menu_items", [])}
		for it in data.get("menu_items", []):
			menu[it["name"].lower()] = it

		inv_map = {inv["name"].lower(): inv for inv in data.get("inventory", []) if inv.get("name")}
		inv_by_code = {inv["item_code"]: inv for inv in data.get("inventory", []) if inv.get("item_code")}

		consumed_log = []
		ref_id = batch_id or order.get("order_id")
		round_label = batch_id.split("-")[-1] if (batch_id and "-" in batch_id) else "Round 1"

		for item in order.get("items", []):
			item_id_or_name = item.get("item_id") or item.get("name")
			qty = int(item.get("qty", 1))
			portion = item.get("portion", "Regular")

			req_info = cls.get_item_recipe_requirements(
				item_id_or_name=item_id_or_name,
				ordered_qty=qty,
				portion=portion,
				inv_map=inv_map,
				menu=menu,
				data=data,
			)

			# Only approved recipes participate in inventory deduction
			if not req_info.get("can_deduct_inventory"):
				continue

			for ing in req_info.get("ingredients", []):
				if not ing.get("is_mapped"):
					continue
				inv_code = ing.get("item_code")
				inv_item = inv_by_code.get(inv_code) or inv_map.get(ing.get("inventory_item_name", "").lower()) or inv_map.get(ing.get("ingredient_name", "").lower())
				if not inv_item:
					continue
				
				deduct_qty = float(ing.get("stock_deduct_qty", 0.0))
				if deduct_qty <= 0:
					continue

				inv_item["quantity"] = round(max(0.0, inv_item["quantity"] - deduct_qty), 3)
				inv_item["last_updated"] = frappe.utils.now_datetime().strftime("%Y-%m-%d %H:%M:%S")
				cls._record_movement_internal(
					data,
					item_name=inv_item["name"],
					movement_type="Order Consumption",
					qty=deduct_qty,
					unit=inv_item.get("unit", "kg"),
					from_location=inv_item.get("location", "Cold Storage"),
					to_location="Kitchen",
					reason=f"Order {order.get('order_id')} ({round_label}) prep for Table {order.get('table_no')}",
					reference=ref_id,
				)
				consumed_log.append({
					"ingredient": inv_item["name"],
					"qty": deduct_qty,
					"unit": inv_item.get("unit", "kg"),
					"dish": item.get("name"),
					"portion": portion,
				})

		order["inventory_deducted"] = True
		if "consumed_ingredients" not in order:
			order["consumed_ingredients"] = []
		order["consumed_ingredients"].extend(consumed_log)

	@classmethod
	def _reverse_inventory_for_order(cls, data, order):
		"""
		Reverses inventory deduction once when order is cancelled.
		Logs persistent Order Cancellation Reversal movements with order reference.
		"""
		if not order.get("inventory_deducted"):
			return

		menu = {it["item_id"]: it for it in data.get("menu_items", [])}
		for it in data.get("menu_items", []):
			menu[it["name"].lower()] = it

		inv_map = {inv["name"].lower(): inv for inv in data.get("inventory", []) if inv.get("name")}
		inv_by_code = {inv["item_code"]: inv for inv in data.get("inventory", []) if inv.get("item_code")}

		for item in order.get("items", []):
			item_id_or_name = item.get("item_id") or item.get("name")
			qty = int(item.get("qty", 1))
			portion = item.get("portion", "Regular")

			req_info = cls.get_item_recipe_requirements(
				item_id_or_name=item_id_or_name,
				ordered_qty=qty,
				portion=portion,
				inv_map=inv_map,
				menu=menu,
				data=data,
			)

			if not req_info.get("can_deduct_inventory"):
				continue

			for ing in req_info.get("ingredients", []):
				if not ing.get("is_mapped"):
					continue
				inv_code = ing.get("item_code")
				inv_item = inv_by_code.get(inv_code) or inv_map.get(ing.get("inventory_item_name", "").lower()) or inv_map.get(ing.get("ingredient_name", "").lower())
				if not inv_item:
					continue
				
				return_qty = float(ing.get("stock_deduct_qty", 0.0))
				if return_qty <= 0:
					continue

				inv_item["quantity"] = round(inv_item["quantity"] + return_qty, 3)
				inv_item["last_updated"] = frappe.utils.now_datetime().strftime("%Y-%m-%d %H:%M:%S")
				cls._record_movement_internal(
					data,
					item_name=inv_item["name"],
					movement_type="Order Cancellation Reversal",
					qty=return_qty,
					unit=inv_item.get("unit", "kg"),
					from_location="Kitchen",
					to_location=inv_item.get("location", "Cold Storage"),
					reason=f"Cancelled order {order.get('order_id')} stock restoration",
					reference=order.get("order_id"),
				)

		order["inventory_deducted"] = False
		for b in order.get("batches", []):
			b["inventory_deducted"] = False

	@classmethod
	def get_inventory_dashboard_data(cls, category=None, location=None, status=None, search=None):
		"""
		Returns complete inventory dashboard data with KPI metrics, categorized items,
		suppliers, batches, purchase orders, wastage, and recent movements.
		"""
		data = cls.get_data()
		raw_items = data.get("inventory", [])
		batches = data.get("batches", [])
		today = datetime.date.today()

		# Update batch status dynamically
		expiring_soon_count = 0
		for b in batches:
			exp_str = b.get("expiry_date", "")
			if exp_str:
				try:
					exp_date = datetime.date.fromisoformat(exp_str)
					days_left = (exp_date - today).days
					b["days_left"] = days_left
					if days_left < 0:
						b["status"] = "Expired"
					elif days_left <= 7:
						b["status"] = "Expiring Soon"
						expiring_soon_count += 1
					else:
						b["status"] = "Active"
				except Exception:
					b["status"] = "Active"
					b["days_left"] = 999

		# Calculate total stock valuation and metrics
		total_items = len(raw_items)
		total_val = 0.0
		low_stock_count = 0
		out_of_stock_count = 0
		cat_counts = {}
		loc_counts = {"Dry Storage": 0, "Cold Storage": 0, "Fresh Produce Storage": 0}

		processed_items = []
		for item in raw_items:
			qty = float(item.get("quantity", 0))
			reorder = float(item.get("reorder_level", 0))
			cost = float(item.get("cost_price", 0))
			item_val = round(qty * cost, 2)
			total_val += item_val

			cat = item.get("category", "Uncategorized")
			cat_counts[cat] = cat_counts.get(cat, 0) + 1

			loc = item.get("location", "Dry Storage")
			loc_counts[loc] = loc_counts.get(loc, 0) + 1

			if qty <= 0:
				stock_status = "Out of Stock"
				out_of_stock_count += 1
			elif qty <= reorder:
				stock_status = "Low Stock"
				low_stock_count += 1
			else:
				stock_status = "In Stock"

			p_item = copy.deepcopy(item)
			p_item["stock_status"] = stock_status
			p_item["stock_value"] = item_val
			p_item["formatted_stock_value"] = f"₹{item_val:,.2f}"
			p_item["formatted_qty"] = f"{qty:g} {item.get('unit', '')}"
			p_item["formatted_cost"] = f"₹{cost:,.2f}"
			processed_items.append(p_item)

		# Filter items
		filtered_items = processed_items
		if category and category != "All":
			filtered_items = [i for i in filtered_items if i.get("category") == category]
		if location and location != "All":
			filtered_items = [i for i in filtered_items if i.get("location") == location]
		if status and status != "All":
			filtered_items = [i for i in filtered_items if i.get("stock_status") == status]
		if search:
			q = search.strip().lower()
			filtered_items = [
				i for i in filtered_items
				if q in i.get("name", "").lower()
				or q in i.get("item_code", "").lower()
				or q in i.get("category", "").lower()
			]

		movements = data.get("stock_movements", [])
		sorted_movements = sorted(movements, key=lambda m: m.get("timestamp", ""), reverse=True)

		return {
			"summary": {
				"total_items": total_items,
				"total_stock_value": round(total_val, 2),
				"formatted_stock_value": f"₹{total_val:,.2f}",
				"low_stock_count": low_stock_count,
				"out_of_stock_count": out_of_stock_count,
				"expiring_soon_count": expiring_soon_count,
				"movements_count": len(movements),
			},
			"items": filtered_items,
			"category_counts": cat_counts,
			"location_counts": loc_counts,
			"suppliers": data.get("suppliers", []),
			"purchase_orders": sorted(data.get("purchase_orders", []), key=lambda p: p.get("date", ""), reverse=True),
			"batches": sorted(batches, key=lambda b: b.get("days_left", 999)),
			"wastage_records": sorted(data.get("wastage_records", []), key=lambda w: w.get("date", ""), reverse=True),
			"recent_movements": sorted_movements[:30],
			"restaurant_info": cls.get_restaurant_info(),
		}

	@classmethod
	def perform_stock_in(cls, item_name, qty, location=None, reason="", reference=""):
		"""
		Increases stock for an item with full movement logging.
		"""
		data = cls.get_data()
		item = next((i for i in data.get("inventory", []) if i.get("name") == item_name), None)
		if not item:
			frappe.throw(_("Inventory item '{0}' not found.").format(item_name))

		try:
			qty_val = float(qty)
		except (ValueError, TypeError):
			frappe.throw(_("Invalid quantity value."))

		if qty_val <= 0:
			frappe.throw(_("Quantity must be greater than zero."))

		item["quantity"] = round(item.get("quantity", 0) + qty_val, 3)
		if location:
			item["location"] = location
		item["last_updated"] = frappe.utils.now_datetime().strftime("%Y-%m-%d %H:%M:%S")

		mov = cls._record_movement_internal(
			data,
			item_name=item_name,
			movement_type="Stock In",
			qty=qty_val,
			unit=item.get("unit", "kg"),
			from_location="Supplier / Inward",
			to_location=item.get("location", "Dry Storage"),
			reason=reason or "Manual stock replenishment",
			reference=reference,
		)
		cls.save_data(data)
		return {"item": item, "movement": mov}

	@classmethod
	def perform_stock_out(cls, item_name, qty, location=None, reason="", reference=""):
		"""
		Decreases stock with strict non-negative stock validation.
		"""
		data = cls.get_data()
		item = next((i for i in data.get("inventory", []) if i.get("name") == item_name), None)
		if not item:
			frappe.throw(_("Inventory item '{0}' not found.").format(item_name))

		try:
			qty_val = float(qty)
		except (ValueError, TypeError):
			frappe.throw(_("Invalid quantity value."))

		if qty_val <= 0:
			frappe.throw(_("Quantity must be greater than zero."))

		current_qty = item.get("quantity", 0)
		if current_qty < qty_val:
			frappe.throw(
				_("Insufficient stock for {0}: Available {1} {2}, requested {3} {2}.").format(
					item_name, current_qty, item.get("unit", ""), qty_val
				)
			)

		item["quantity"] = round(current_qty - qty_val, 3)
		item["last_updated"] = frappe.utils.now_datetime().strftime("%Y-%m-%d %H:%M:%S")

		mov = cls._record_movement_internal(
			data,
			item_name=item_name,
			movement_type="Stock Out",
			qty=qty_val,
			unit=item.get("unit", "kg"),
			from_location=item.get("location", "Dry Storage"),
			to_location="Kitchen / Outward",
			reason=reason or "Manual issue",
			reference=reference,
		)
		cls.save_data(data)
		return {"item": item, "movement": mov}

	@classmethod
	def perform_stock_adjustment(cls, item_name, new_qty, reason="", reference=""):
		"""
		Adjusts physical inventory count with delta movement tracking.
		"""
		data = cls.get_data()
		item = next((i for i in data.get("inventory", []) if i.get("name") == item_name), None)
		if not item:
			frappe.throw(_("Inventory item '{0}' not found.").format(item_name))

		try:
			n_qty = round(float(new_qty), 3)
		except (ValueError, TypeError):
			frappe.throw(_("Invalid new quantity value."))

		if n_qty < 0:
			frappe.throw(_("Stock quantity cannot be negative."))

		old_qty = item.get("quantity", 0)
		delta = round(n_qty - old_qty, 3)
		item["quantity"] = n_qty
		item["last_updated"] = frappe.utils.now_datetime().strftime("%Y-%m-%d %H:%M:%S")

		mov = cls._record_movement_internal(
			data,
			item_name=item_name,
			movement_type="Stock Adjustment",
			qty=abs(delta),
			unit=item.get("unit", "kg"),
			from_location=item.get("location", "Dry Storage"),
			to_location=item.get("location", "Dry Storage"),
			reason=f"Physical count adjustment: {delta:+g} ({reason or 'Audit discrepancy'})",
			reference=reference or "AUDIT-ADJ",
		)
		cls.save_data(data)
		return {"item": item, "movement": mov, "delta": delta}

	@classmethod
	def perform_stock_transfer(cls, item_name, qty, from_location, to_location, reason=""):
		"""
		Transfers stock between logical storage locations.
		"""
		valid_locs = {"Dry Storage", "Cold Storage", "Fresh Produce Storage"}
		if from_location not in valid_locs or to_location not in valid_locs:
			frappe.throw(_("Valid locations are: Dry Storage, Cold Storage, Fresh Produce Storage."))

		if from_location == to_location:
			frappe.throw(_("Source and destination storage locations cannot be the same."))

		data = cls.get_data()
		item = next((i for i in data.get("inventory", []) if i.get("name") == item_name), None)
		if not item:
			frappe.throw(_("Inventory item '{0}' not found.").format(item_name))

		try:
			qty_val = float(qty)
		except (ValueError, TypeError):
			frappe.throw(_("Invalid quantity value."))

		if qty_val <= 0:
			frappe.throw(_("Quantity must be greater than zero."))

		if item.get("quantity", 0) < qty_val:
			frappe.throw(_("Insufficient stock to transfer."))

		item["location"] = to_location
		item["last_updated"] = frappe.utils.now_datetime().strftime("%Y-%m-%d %H:%M:%S")

		mov = cls._record_movement_internal(
			data,
			item_name=item_name,
			movement_type="Stock Transfer",
			qty=qty_val,
			unit=item.get("unit", "kg"),
			from_location=from_location,
			to_location=to_location,
			reason=reason or f"Transfer from {from_location} to {to_location}",
		)
		cls.save_data(data)
		return {"item": item, "movement": mov}

	@classmethod
	def record_wastage(cls, item_name, qty, reason="Spoilage", date=None, batch_no="", notes=""):
		"""
		Records inventory wastage, deducts stock, and logs cost impact.
		"""
		data = cls.get_data()
		item = next((i for i in data.get("inventory", []) if i.get("name") == item_name), None)
		if not item:
			frappe.throw(_("Inventory item '{0}' not found.").format(item_name))

		try:
			qty_val = float(qty)
		except (ValueError, TypeError):
			frappe.throw(_("Invalid quantity value."))

		if qty_val <= 0:
			frappe.throw(_("Quantity must be greater than zero."))

		current_qty = item.get("quantity", 0)
		if current_qty < qty_val:
			frappe.throw(_("Cannot record wastage exceeding current stock."))

		item["quantity"] = round(current_qty - qty_val, 3)
		item["last_updated"] = frappe.utils.now_datetime().strftime("%Y-%m-%d %H:%M:%S")

		mov = cls._record_movement_internal(
			data,
			item_name=item_name,
			movement_type="Wastage",
			qty=qty_val,
			unit=item.get("unit", "kg"),
			from_location=item.get("location", "Cold Storage"),
			to_location="Wastage Bin",
			reason=f"{reason}: {notes}" if notes else reason,
			reference=batch_no or "WASTAGE",
		)

		wastage_list = data.setdefault("wastage_records", [])
		existing_ids = []
		for w in wastage_list:
			wid = w.get("wastage_id", "")
			if wid.startswith("WST-2026-"):
				try:
					existing_ids.append(int(wid.split("-")[-1]))
				except ValueError:
					pass
		next_num = (max(existing_ids) + 1) if existing_ids else 1
		wastage_id = f"WST-2026-{next_num:04d}"

		cost_impact = round(qty_val * float(item.get("cost_price", 0)), 2)

		wst = {
			"wastage_id": wastage_id,
			"item_name": item_name,
			"item_code": item.get("item_code", ""),
			"qty": qty_val,
			"unit": item.get("unit", "kg"),
			"reason": reason,
			"date": date or frappe.utils.nowdate(),
			"batch_no": batch_no,
			"location": item.get("location", "Cold Storage"),
			"cost_impact": cost_impact,
			"formatted_cost_impact": f"₹{cost_impact:,.2f}",
			"notes": notes,
			"movement_id": mov["movement_id"],
			"recorded_by": "Administrator",
		}
		wastage_list.append(wst)
		cls.save_data(data)
		return wst

	@classmethod
	def create_supplier(cls, name, contact_person="", phone="", email="", address="", categories=None, supplied_items=None):
		"""
		Adds a new supplier with duplicate name validation.
		"""
		if not name or not name.strip():
			frappe.throw(_("Supplier name is required."))

		clean_name = name.strip()
		data = cls.get_data()
		suppliers = data.setdefault("suppliers", [])

		for s in suppliers:
			if s.get("name", "").strip().lower() == clean_name.lower():
				frappe.throw(_("A supplier with name '{0}' already exists.").format(clean_name))

		existing_ids = []
		for s in suppliers:
			sid = s.get("supplier_id", "")
			if sid.startswith("SUP-"):
				try:
					existing_ids.append(int(sid.split("-")[-1]))
				except ValueError:
					pass
		next_num = (max(existing_ids) + 1) if existing_ids else 1
		supplier_id = f"SUP-{next_num:03d}"

		sup = {
			"supplier_id": supplier_id,
			"name": clean_name,
			"contact_person": contact_person.strip(),
			"phone": phone.strip(),
			"email": email.strip(),
			"address": address.strip(),
			"categories": categories or [],
			"supplied_items": supplied_items or [],
		}
		suppliers.append(sup)
		cls.save_data(data)
		return sup

	@classmethod
	def create_purchase_order(cls, supplier_id, items, invoice_ref="", date=None, notes="", auto_receive=False):
		"""
		Creates a Purchase Order. If auto_receive is True, immediately confirms goods receipt.
		"""
		data = cls.get_data()
		suppliers = data.get("suppliers", [])
		sup = next((s for s in suppliers if s.get("supplier_id") == supplier_id), None)
		if not sup:
			frappe.throw(_("Supplier not found."))

		if not items or not isinstance(items, list):
			frappe.throw(_("Purchase Order items list cannot be empty."))

		inv_map = {i["name"]: i for i in data.get("inventory", [])}
		pos = data.setdefault("purchase_orders", [])
		existing_ids = []
		for p in pos:
			pno = p.get("po_number", "")
			if pno.startswith("PO-2026-"):
				try:
					existing_ids.append(int(pno.split("-")[-1]))
				except ValueError:
					pass
		next_num = (max(existing_ids) + 1) if existing_ids else 1
		po_number = f"PO-2026-{next_num:04d}"

		clean_items = []
		total_amt = 0.0
		for it in items:
			iname = it.get("item_name")
			if not iname or iname not in inv_map:
				frappe.throw(_("Item '{0}' does not exist in inventory.").format(iname))
			inv_item = inv_map[iname]
			q = float(it.get("qty", 0))
			if q <= 0:
				frappe.throw(_("Quantity must be greater than zero for {0}.").format(iname))
			rate = float(it.get("rate") or inv_item.get("cost_price", 0))
			amt = round(q * rate, 2)
			total_amt += amt
			clean_items.append({
				"item_name": iname,
				"qty": q,
				"unit": inv_item.get("unit", "kg"),
				"rate": rate,
				"amount": amt,
			})

		po = {
			"po_number": po_number,
			"supplier_id": supplier_id,
			"supplier_name": sup.get("name"),
			"date": date or frappe.utils.nowdate(),
			"invoice_ref": invoice_ref.strip(),
			"status": "Draft",
			"items": clean_items,
			"total_amount": round(total_amt, 2),
			"formatted_total": f"₹{total_amt:,.2f}",
			"received_at": "",
			"notes": notes.strip(),
		}
		pos.append(po)

		if auto_receive:
			po["status"] = "Received"
			po["received_at"] = frappe.utils.now_datetime().strftime("%Y-%m-%d %H:%M:%S")
			for it in clean_items:
				iname = it["item_name"]
				inv_item = inv_map[iname]
				inv_item["quantity"] = round(inv_item.get("quantity", 0) + it["qty"], 3)
				inv_item["last_updated"] = frappe.utils.now_datetime().strftime("%Y-%m-%d %H:%M:%S")
				cls._record_movement_internal(
					data,
					item_name=iname,
					movement_type="Goods Receipt",
					qty=it["qty"],
					unit=inv_item.get("unit", "kg"),
					from_location=sup.get("name"),
					to_location=inv_item.get("location", "Dry Storage"),
					reason=f"Goods Receipt for {po_number} ({sup.get('name')})",
					reference=po_number,
				)

		cls.save_data(data)
		return po

	@classmethod
	def confirm_goods_receipt(cls, po_number):
		"""
		Confirms goods receipt for a Purchase Order, updates stock once, and prevents duplicate receipt.
		"""
		data = cls.get_data()
		pos = data.get("purchase_orders", [])
		po = next((p for p in pos if p.get("po_number") == po_number), None)
		if not po:
			frappe.throw(_("Purchase Order '{0}' not found.").format(po_number))

		if po.get("status") == "Received":
			frappe.throw(_("Purchase Order '{0}' is already received. Duplicate goods receipt prevented.").format(po_number))

		inv_map = {i["name"]: i for i in data.get("inventory", [])}
		for it in po.get("items", []):
			iname = it.get("item_name")
			if iname in inv_map:
				inv_item = inv_map[iname]
				inv_item["quantity"] = round(inv_item.get("quantity", 0) + it.get("qty", 0), 3)
				inv_item["last_updated"] = frappe.utils.now_datetime().strftime("%Y-%m-%d %H:%M:%S")
				cls._record_movement_internal(
					data,
					item_name=iname,
					movement_type="Goods Receipt",
					qty=it.get("qty", 0),
					unit=inv_item.get("unit", "kg"),
					from_location=po.get("supplier_name", "Supplier Delivery"),
					to_location=inv_item.get("location", "Dry Storage"),
					reason=f"Confirmed Goods Receipt for {po_number}",
					reference=po_number,
				)

		po["status"] = "Received"
		po["received_at"] = frappe.utils.now_datetime().strftime("%Y-%m-%d %H:%M:%S")
		cls.save_data(data)
		return po

	@classmethod
	def add_batch_record(cls, item_name, batch_no, mfg_date, expiry_date, qty, location=None):
		"""
		Creates or updates a batch record for expiry tracking.
		"""
		data = cls.get_data()
		item = next((i for i in data.get("inventory", []) if i.get("name") == item_name), None)
		if not item:
			frappe.throw(_("Inventory item '{0}' not found.").format(item_name))

		if not batch_no or not batch_no.strip():
			frappe.throw(_("Batch number is required."))

		batches = data.setdefault("batches", [])
		today = datetime.date.today()
		try:
			exp_date = datetime.date.fromisoformat(expiry_date)
			days_left = (exp_date - today).days
			if days_left < 0:
				status = "Expired"
			elif days_left <= 7:
				status = "Expiring Soon"
			else:
				status = "Active"
		except Exception:
			status = "Active"
			days_left = 999

		batch = {
			"batch_no": batch_no.strip(),
			"item_name": item_name,
			"item_code": item.get("item_code", ""),
			"mfg_date": mfg_date,
			"expiry_date": expiry_date,
			"qty": float(qty),
			"unit": item.get("unit", "kg"),
			"location": location or item.get("location", "Cold Storage"),
			"status": status,
			"days_left": days_left,
		}
		batches.append(batch)
		cls.save_data(data)
		return batch

	@classmethod
	def get_inventory_reports(cls, report_type="stock_balance", from_date=None, to_date=None, category=None, location=None):
		"""
		Generates comprehensive inventory reports:
		- stock_balance
		- low_stock
		- movements
		- purchases
		- wastage
		- expiry
		- usage (recipe consumption by menu orders)
		"""
		data = cls.get_data()
		items = data.get("inventory", [])
		today = datetime.date.today()

		if report_type == "stock_balance":
			rows = []
			for i in items:
				if category and category != "All" and i.get("category") != category:
					continue
				if location and location != "All" and i.get("location") != location:
					continue
				q = float(i.get("quantity", 0))
				r = float(i.get("reorder_level", 0))
				c = float(i.get("cost_price", 0))
				val = round(q * c, 2)
				stat = "Out of Stock" if q <= 0 else ("Low Stock" if q <= r else "In Stock")
				rows.append({
					"item_code": i.get("item_code"),
					"item_name": i.get("name"),
					"category": i.get("category"),
					"location": i.get("location"),
					"quantity": q,
					"unit": i.get("unit"),
					"reorder_level": r,
					"cost_price": c,
					"valuation": val,
					"status": stat,
				})
			return {"title": "Stock Balance & Valuation Report", "rows": rows}

		elif report_type == "low_stock":
			rows = []
			for i in items:
				q = float(i.get("quantity", 0))
				r = float(i.get("reorder_level", 0))
				if q <= r:
					c = float(i.get("cost_price", 0))
					rows.append({
						"item_code": i.get("item_code"),
						"item_name": i.get("name"),
						"category": i.get("category"),
						"location": i.get("location"),
						"current_stock": q,
						"reorder_level": r,
						"deficit": round(r - q, 3) if r > q else 0.0,
						"unit": i.get("unit"),
						"cost_price": c,
						"status": "Out of Stock" if q <= 0 else "Low Stock",
					})
			rows.sort(key=lambda x: x["deficit"], reverse=True)
			return {"title": "Low Stock & Reorder Alert Report", "rows": rows}

		elif report_type == "movements":
			movs = data.get("stock_movements", [])
			rows = []
			for m in sorted(movs, key=lambda x: x.get("timestamp", ""), reverse=True):
				ts = m.get("timestamp", "").split(" ")[0]
				if from_date and ts < from_date:
					continue
				if to_date and ts > to_date:
					continue
				rows.append(m)
			return {"title": "Stock Movement Audit Ledger", "rows": rows}

		elif report_type == "purchases":
			pos = data.get("purchase_orders", [])
			rows = []
			for p in sorted(pos, key=lambda x: x.get("date", ""), reverse=True):
				d = p.get("date", "")
				if from_date and d < from_date:
					continue
				if to_date and d > to_date:
					continue
				rows.append({
					"po_number": p.get("po_number"),
					"supplier_name": p.get("supplier_name"),
					"date": p.get("date"),
					"invoice_ref": p.get("invoice_ref"),
					"status": p.get("status"),
					"items_count": len(p.get("items", [])),
					"total_amount": p.get("total_amount"),
					"received_at": p.get("received_at") or "Pending",
				})
			return {"title": "Purchase History & Receipts", "rows": rows}

		elif report_type == "wastage":
			wsts = data.get("wastage_records", [])
			rows = []
			for w in sorted(wsts, key=lambda x: x.get("date", ""), reverse=True):
				d = w.get("date", "")
				if from_date and d < from_date:
					continue
				if to_date and d > to_date:
					continue
				rows.append(w)
			return {"title": "Wastage & Spoilage Log", "rows": rows}

		elif report_type == "expiry":
			batches = data.get("batches", [])
			rows = []
			for b in batches:
				exp_str = b.get("expiry_date", "")
				days_left = 999
				stat = "Active"
				if exp_str:
					try:
						exp_date = datetime.date.fromisoformat(exp_str)
						days_left = (exp_date - today).days
						if days_left < 0:
							stat = "Expired"
						elif days_left <= 7:
							stat = "Expiring Soon"
					except Exception:
						pass
				rows.append({
					"batch_no": b.get("batch_no"),
					"item_name": b.get("item_name"),
					"mfg_date": b.get("mfg_date"),
					"expiry_date": b.get("expiry_date"),
					"quantity": b.get("qty"),
					"unit": b.get("unit"),
					"location": b.get("location"),
					"days_left": days_left,
					"status": stat,
				})
			rows.sort(key=lambda x: x["days_left"])
			return {"title": "Batch Expiry & Shelf Life Report", "rows": rows}

		elif report_type == "usage":
			# Item-wise recipe consumption tally derived from actual confirmed orders
			menu = {it["item_id"]: it for it in data.get("menu_items", [])}
			usage_tally = {}
			for o in data.get("orders", []):
				odate = o.get("created_at", "").split(" ")[0]
				if from_date and odate < from_date:
					continue
				if to_date and odate > to_date:
					continue
				if o.get("status") in ["Served", "Billed", "Paid"] or o.get("inventory_deducted"):
					for item in o.get("items", []):
						m_item = menu.get(item.get("item_id"))
						if not m_item:
							continue
						recipe = m_item.get("recipe", {})
						q = item.get("qty", 1)
						for ing, per_unit in recipe.items():
							usage_tally[ing] = round(usage_tally.get(ing, 0.0) + (per_unit * q), 3)

			rows = []
			for iname, tot_qty in usage_tally.items():
				inv_item = next((i for i in items if i.get("name") == iname), {})
				cost = float(inv_item.get("cost_price", 0))
				val = round(tot_qty * cost, 2)
				rows.append({
					"item_name": iname,
					"category": inv_item.get("category", "Uncategorized"),
					"total_consumed": tot_qty,
					"unit": inv_item.get("unit", "kg"),
					"unit_cost": cost,
					"total_ingredient_cost": val,
				})
			rows.sort(key=lambda x: x["total_ingredient_cost"], reverse=True)
			return {"title": "Recipe Ingredient Consumption Report", "rows": rows}

		return {"title": "Report", "rows": []}

	# =========================================================================
	# Reports & Analytics (Feature 8)
	# =========================================================================
	@classmethod
	def get_reports_analytics(cls, period="today", from_date=None, to_date=None):
		"""
		Generates comprehensive analytical and operational reports for Izen Bistro.
		Single source of truth: reads actual orders, bills, payments, menu items,
		customers, and tables from the shared RestaurantStore.

		Revenue Rule:
		Counts only successfully recorded payments (paid bills).
		Excludes unpaid bills, pending orders, and cancelled orders.
		GST is strictly 5% (2.5% CGST + 2.5% SGST) matching Billing.
		"""
		data = cls.get_data()
		orders = data.get("orders", [])
		bills = data.get("bills", [])
		customers = data.get("customers", [])
		tables = data.get("tables", [])
		menu_items = data.get("menu_items", [])
		restaurant_info = cls.get_restaurant_info()

		now_dt = frappe.utils.now_datetime()
		today_str = now_dt.strftime("%Y-%m-%d")

		# Ensure every order has a valid created_at date string for robust filtering
		for o in orders:
			if not o.get("created_at"):
				time_ago = o.get("time_ago", "")
				minutes = 15
				if "min" in time_ago:
					m = re.search(r"(\d+)\s*min", time_ago)
					if m:
						minutes = int(m.group(1))
				elif "hr" in time_ago:
					m = re.search(r"(\d+)\s*hr", time_ago)
					if m:
						minutes = int(m.group(1)) * 60
				created_dt = now_dt - datetime.timedelta(minutes=minutes)
				o["created_at"] = created_dt.strftime("%Y-%m-%d %H:%M:%S")

		# 1. Determine date range
		norm_period = (period or "today").strip().lower()
		if norm_period == "yesterday":
			y_dt = now_dt - datetime.timedelta(days=1)
			start_date = y_dt.strftime("%Y-%m-%d")
			end_date = y_dt.strftime("%Y-%m-%d")
			period_label = f"Yesterday ({y_dt.strftime('%d %b %Y')})"
		elif norm_period in ["7_days", "last_7_days", "7days"]:
			norm_period = "7_days"
			s_dt = now_dt - datetime.timedelta(days=6)
			start_date = s_dt.strftime("%Y-%m-%d")
			end_date = today_str
			period_label = f"Last 7 Days ({s_dt.strftime('%d %b')} – {now_dt.strftime('%d %b %Y')})"
		elif norm_period in ["30_days", "last_30_days", "30days"]:
			norm_period = "30_days"
			s_dt = now_dt - datetime.timedelta(days=29)
			start_date = s_dt.strftime("%Y-%m-%d")
			end_date = today_str
			period_label = f"Last 30 Days ({s_dt.strftime('%d %b')} – {now_dt.strftime('%d %b %Y')})"
		elif norm_period in ["this_month", "month"]:
			norm_period = "this_month"
			start_date = today_str[:8] + "01"
			end_date = today_str
			period_label = f"This Month ({now_dt.strftime('%B %Y')})"
		elif norm_period == "custom" and from_date and to_date:
			start_date = str(from_date).strip()
			end_date = str(to_date).strip()
			period_label = f"Custom Range ({start_date} to {end_date})"
		else:
			norm_period = "today"
			start_date = today_str
			end_date = today_str
			period_label = f"Today ({now_dt.strftime('%d %b %Y')})"

		# 2. Filter Bills
		filtered_bills = []
		for b in bills:
			b_date = b.get("bill_date") or (b.get("created_at")[:10] if b.get("created_at") else today_str)
			if start_date <= b_date <= end_date:
				filtered_bills.append(b)

		# 3. Filter Orders
		filtered_orders = []
		for o in orders:
			o_date = (o.get("created_at")[:10] if o.get("created_at") else today_str)
			if start_date <= o_date <= end_date:
				filtered_orders.append(o)

		# Revenue Calculations: ONLY successfully recorded payments
		paid_bills = [b for b in filtered_bills if b.get("payment_status") == "Paid"]
		unpaid_bills = [b for b in filtered_bills if b.get("payment_status") != "Paid"]

		total_revenue = sum(b.get("total", 0) for b in paid_bills)
		paid_bills_count = len(paid_bills)
		pending_bills_count = len(unpaid_bills)
		pending_amount = sum(b.get("total", 0) for b in unpaid_bills)

		total_orders = len(filtered_orders)
		cancelled_orders = [o for o in filtered_orders if o.get("status") == "Cancelled"]
		cancelled_count = len(cancelled_orders)
		non_cancelled_orders = [o for o in filtered_orders if o.get("status") != "Cancelled"]

		# Gross Sales: value of all non-cancelled orders
		gross_sales = sum(o.get("total", 0) for o in non_cancelled_orders)

		# Average Order Value (AOV): Revenue / Paid Orders (or 0 if no paid bills)
		aov = round(total_revenue / paid_bills_count, 2) if paid_bills_count > 0 else 0.0

		# 4. GST Breakdown: 5% GST (2.5% CGST + 2.5% SGST)
		taxable_subtotal = sum(b.get("subtotal", 0) for b in paid_bills)
		cgst_amount = sum(b.get("cgst", round(b.get("tax", 0) / 2.0, 2)) for b in paid_bills)
		sgst_amount = sum(b.get("sgst", round(b.get("tax", 0) - round(b.get("tax", 0) / 2.0, 2), 2)) for b in paid_bills)
		total_gst = cgst_amount + sgst_amount

		# 5. Payment Methods Breakdown
		pm_tally = {
			"Cash": {"count": 0, "amount": 0},
			"UPI": {"count": 0, "amount": 0},
			"Card": {"count": 0, "amount": 0},
		}
		for b in paid_bills:
			m = (b.get("payment_method") or "Cash").strip()
			if "UPI" in m:
				norm_m = "UPI"
			elif "Card" in m:
				norm_m = "Card"
			else:
				norm_m = "Cash"
			amt = b.get("total", 0)
			pm_tally[norm_m]["count"] += 1
			pm_tally[norm_m]["amount"] += amt

		pm_list = []
		for m_name in ["Cash", "UPI", "Card"]:
			c = pm_tally[m_name]["count"]
			amt = pm_tally[m_name]["amount"]
			share = round((amt / total_revenue) * 100, 1) if total_revenue > 0 else 0
			pm_list.append({
				"method": m_name,
				"count": c,
				"amount": amt,
				"formatted_amount": f"₹{amt:,.2f}",
				"share_pct": f"{share}%",
				"share_num": share,
			})

		# 6. Orders Breakdown by Status
		status_list = ["Confirmed", "Preparing", "Ready", "Served", "Billed", "Paid", "Cancelled"]
		status_badge_map = {
			"Confirmed": "badge-info",
			"Preparing": "badge-preparing",
			"Ready": "badge-ready",
			"Served": "badge-served",
			"Billed": "badge-billed",
			"Paid": "badge-paid",
			"Cancelled": "badge-cancelled",
		}
		status_counts = {st: 0 for st in status_list}
		for o in filtered_orders:
			st = o.get("status", "Confirmed")
			if st in status_counts:
				status_counts[st] += 1
			else:
				status_counts["Confirmed"] += 1

		status_breakdown = []
		for st in status_list:
			cnt = status_counts[st]
			pct = round((cnt / total_orders) * 100, 1) if total_orders > 0 else 0
			status_breakdown.append({
				"status": st,
				"count": cnt,
				"percentage": f"{pct}%",
				"percentage_num": pct,
				"badge_class": status_badge_map.get(st, "badge-neutral"),
			})

		# 7. Dine-in Area & Table Breakdown
		area_stats = {
			"Main Dining Hall": {"orders": 0, "gross": 0, "paid": 0, "capacity": 12, "occupied": 0},
			"Garden Patio": {"orders": 0, "gross": 0, "paid": 0, "capacity": 4, "occupied": 0},
			"Rooftop Terrace": {"orders": 0, "gross": 0, "paid": 0, "capacity": 4, "occupied": 0},
		}
		for t in tables:
			ar = t.get("area", "Main Dining Hall")
			if ar in area_stats and t.get("status") == "Occupied":
				area_stats[ar]["occupied"] += 1

		for o in non_cancelled_orders:
			ar = o.get("area", "Main Dining Hall")
			if ar not in area_stats:
				ar = "Main Dining Hall"
			area_stats[ar]["orders"] += 1
			area_stats[ar]["gross"] += o.get("total", 0)
			if o.get("payment_status") == "Paid":
				area_stats[ar]["paid"] += o.get("total", 0)

		area_breakdown = []
		for ar, s in area_stats.items():
			area_breakdown.append({
				"area": ar,
				"orders_count": s["orders"],
				"gross_amount": s["gross"],
				"formatted_gross": f"₹{s['gross']:,.2f}",
				"paid_amount": s["paid"],
				"formatted_paid": f"₹{s['paid']:,.2f}",
				"total_tables": s["capacity"],
				"occupied_tables": s["occupied"],
				"occupancy_pct": f"{round((s['occupied'] / s['capacity']) * 100)}%" if s["capacity"] else "0%",
			})

		# Table Breakdown
		tbl_orders_map = {}
		for o in non_cancelled_orders:
			t_no = o.get("table_no", "")
			if t_no:
				if t_no not in tbl_orders_map:
					tbl_orders_map[t_no] = {"count": 0, "revenue": 0}
				tbl_orders_map[t_no]["count"] += 1
				tbl_orders_map[t_no]["revenue"] += o.get("total", 0)

		table_breakdown = []
		for t in tables:
			t_no = t.get("table_no")
			t_stat = tbl_orders_map.get(t_no, {"count": 0, "revenue": 0})
			table_breakdown.append({
				"table_no": t_no,
				"area": t.get("area"),
				"capacity": t.get("capacity"),
				"status": t.get("status"),
				"customer": t.get("customer") or "--",
				"orders_count": t_stat["count"],
				"revenue": t_stat["revenue"],
				"formatted_revenue": f"₹{t_stat['revenue']:,.2f}",
			})

		# 8. Menu Performance (Dish Breakdown & Category Breakdown)
		dishes_map = {}
		total_items_sold = 0
		gross_menu_sales = 0

		# Initialize all menu items so least-selling dishes can be found
		for m in menu_items:
			dishes_map[m["name"]] = {
				"item_id": m.get("item_id"),
				"name": m.get("name"),
				"category": m.get("category", "Main Course"),
				"price": m.get("price", 0),
				"qty_sold": 0,
				"gross_revenue": 0,
				"paid_revenue": 0,
			}

		for o in non_cancelled_orders:
			is_paid = (o.get("payment_status") == "Paid")
			for it in o.get("items", []):
				name = it.get("name")
				qty = int(it.get("qty", 1))
				amt = it.get("amount", it.get("price", 0) * qty)
				total_items_sold += qty
				gross_menu_sales += amt

				if name not in dishes_map:
					dishes_map[name] = {
						"item_id": it.get("item_id"),
						"name": name,
						"category": "Main Course",
						"price": it.get("price", 0),
						"qty_sold": 0,
						"gross_revenue": 0,
						"paid_revenue": 0,
					}
				dishes_map[name]["qty_sold"] += qty
				dishes_map[name]["gross_revenue"] += amt
				if is_paid:
					dishes_map[name]["paid_revenue"] += amt

		# Sort dishes
		all_dishes_list = list(dishes_map.values())
		best_selling = sorted([d for d in all_dishes_list if d["qty_sold"] > 0], key=lambda x: x["qty_sold"], reverse=True)
		least_selling = sorted(all_dishes_list, key=lambda x: x["qty_sold"])[:6]

		for d in all_dishes_list:
			d["formatted_price"] = f"₹{d['price']:,}"
			d["formatted_gross"] = f"₹{d['gross_revenue']:,}"
			d["formatted_paid"] = f"₹{d['paid_revenue']:,}"
			d["share_pct"] = f"{round((d['qty_sold'] / total_items_sold) * 100, 1)}%" if total_items_sold else "0%"

		# Category-wise sales
		cat_stats = {}
		for d in all_dishes_list:
			cat = d["category"]
			if cat not in cat_stats:
				cat_stats[cat] = {"category": cat, "items_count": 0, "quantity_sold": 0, "gross_revenue": 0, "paid_revenue": 0}
			cat_stats[cat]["items_count"] += 1
			cat_stats[cat]["quantity_sold"] += d["qty_sold"]
			cat_stats[cat]["gross_revenue"] += d["gross_revenue"]
			cat_stats[cat]["paid_revenue"] += d["paid_revenue"]

		category_sales = sorted(cat_stats.values(), key=lambda x: x["gross_revenue"], reverse=True)
		for cs in category_sales:
			cs["formatted_gross"] = f"₹{cs['gross_revenue']:,}"
			cs["formatted_paid"] = f"₹{cs['paid_revenue']:,}"
			cs["share_pct"] = f"{round((cs['gross_revenue'] / gross_menu_sales) * 100, 1)}%" if gross_menu_sales else "0%"

		# 9. Customer Reports
		total_registered_customers = len(customers)
		new_customers_in_period = 0
		repeat_customers_count = 0
		for c in customers:
			if isinstance(c, dict):
				c_created = c.get("created_at", "")[:10]
				if start_date <= c_created <= end_date:
					new_customers_in_period += 1
				if c.get("total_visits", 0) > 1:
					repeat_customers_count += 1

		# Most frequent customers
		top_customers = []
		for c in sorted([c for c in customers if isinstance(c, dict)], key=lambda x: x.get("total_visits", 0), reverse=True)[:8]:
			raw_mob = c.get("mobile", "")
			masked_mob = (raw_mob[:2] + "****" + raw_mob[-4:]) if len(raw_mob) >= 8 else raw_mob

			c_orders = [o for o in filtered_orders if o.get("customer_id") == c.get("customer_id") or o.get("customer") == c.get("name")]
			c_spent = sum(o.get("total", 0) for o in c_orders if o.get("payment_status") == "Paid")

			top_customers.append({
				"customer_id": c.get("customer_id"),
				"name": c.get("name"),
				"masked_mobile": masked_mob,
				"total_visits": c.get("total_visits", 1),
				"orders_in_period": len(c_orders),
				"period_spent": c_spent,
				"formatted_spent": f"₹{c_spent:,}",
				"last_visit": c.get("last_visit") or "Recent",
			})

		# 10. Operational Metrics
		total_tables_count = len(tables)
		occupied_tbl_count = sum(1 for t in tables if t.get("status") == "Occupied")
		available_tbl_count = sum(1 for t in tables if t.get("status") == "Available")
		reserved_tbl_count = sum(1 for t in tables if t.get("status") == "Reserved")
		overall_occ_pct = f"{round((occupied_tbl_count / total_tables_count) * 100)}%" if total_tables_count else "0%"

		# 11. Day-by-Day Sales & Volume Trend
		s_d = datetime.datetime.strptime(start_date, "%Y-%m-%d").date()
		e_d = datetime.datetime.strptime(end_date, "%Y-%m-%d").date()
		delta_days = (e_d - s_d).days + 1

		daily_sales_records = []
		num_days = min(delta_days, 31)
		for i in range(num_days):
			cur_date = s_d + datetime.timedelta(days=i)
			cur_date_str = cur_date.strftime("%Y-%m-%d")
			cur_label = cur_date.strftime("%d %b")

			day_orders = [o for o in filtered_orders if (o.get("created_at") or "")[:10] == cur_date_str]
			day_bills = [b for b in paid_bills if (b.get("bill_date") or b.get("created_at") or "")[:10] == cur_date_str]

			d_rev = sum(b.get("total", 0) for b in day_bills)
			d_subtotal = sum(b.get("subtotal", 0) for b in day_bills)
			d_cgst = sum(b.get("cgst", round(b.get("tax", 0) / 2.0, 2)) for b in day_bills)
			d_sgst = sum(b.get("sgst", round(b.get("tax", 0) - round(b.get("tax", 0) / 2.0, 2), 2)) for b in day_bills)
			d_orders = len(day_orders)
			d_paid_orders = len(day_bills)
			d_cash = sum(b.get("total", 0) for b in day_bills if "cash" in (b.get("payment_method") or "").lower())
			d_upi = sum(b.get("total", 0) for b in day_bills if "upi" in (b.get("payment_method") or "").lower())
			d_card = sum(b.get("total", 0) for b in day_bills if "card" in (b.get("payment_method") or "").lower())

			daily_sales_records.append({
				"date": cur_date_str,
				"date_label": cur_label,
				"day_name": cur_date.strftime("%a"),
				"orders_count": d_orders,
				"paid_orders_count": d_paid_orders,
				"gross_sales": sum(o.get("total", 0) for o in day_orders if o.get("status") != "Cancelled"),
				"subtotal": d_subtotal,
				"cgst": d_cgst,
				"sgst": d_sgst,
				"total_revenue": d_rev,
				"formatted_revenue": f"₹{d_rev:,.2f}",
				"cash": d_cash,
				"upi": d_upi,
				"card": d_card,
			})

		# Settlements Audit List
		settlements_list = []
		for b in filtered_bills:
			settlements_list.append({
				"bill_no": b.get("bill_no"),
				"order_id": b.get("order_id"),
				"table_no": b.get("table_no"),
				"customer_name": b.get("customer_name") or b.get("customer", "Guest"),
				"payment_status": b.get("payment_status", "Unpaid"),
				"payment_method": b.get("payment_method") or "--",
				"payment_reference": b.get("payment_reference") or "--",
				"subtotal": b.get("subtotal", 0),
				"formatted_subtotal": b.get("formatted_subtotal", f"₹{b.get('subtotal', 0):,}"),
				"cgst": b.get("cgst", 0),
				"formatted_cgst": b.get("formatted_cgst", f"₹{b.get('cgst', 0):,}"),
				"sgst": b.get("sgst", 0),
				"formatted_sgst": b.get("formatted_sgst", f"₹{b.get('sgst', 0):,}"),
				"tax": b.get("tax", 0),
				"formatted_tax": b.get("formatted_tax", f"₹{b.get('tax', 0):,}"),
				"total": b.get("total", 0),
				"formatted_total": b.get("formatted_total", f"₹{b.get('total', 0):,}"),
				"paid_at": b.get("paid_at") or b.get("created_at") or "--",
				"bill_date": b.get("bill_date", today_str),
			})

		return {
			"restaurant_info": restaurant_info,
			"period": norm_period,
			"period_label": period_label,
			"start_date": start_date,
			"end_date": end_date,
			"summary": {
				"total_revenue": total_revenue,
				"formatted_revenue": f"₹{total_revenue:,.2f}",
				"total_orders": total_orders,
				"average_order_value": aov,
				"formatted_aov": f"₹{aov:,.2f}",
				"paid_bills": paid_bills_count,
				"pending_payments_count": pending_bills_count,
				"pending_payments_amount": pending_amount,
				"formatted_pending": f"₹{pending_amount:,.2f}",
				"cancelled_orders": cancelled_count,
				"gross_sales": gross_sales,
				"formatted_gross_sales": f"₹{gross_sales:,.2f}",
			},
			"sales": {
				"daily_sales": daily_sales_records,
				"payment_methods": pm_list,
				"gst_breakdown": {
					"taxable_subtotal": taxable_subtotal,
					"formatted_subtotal": f"₹{taxable_subtotal:,.2f}",
					"cgst_rate": "2.5%",
					"cgst_amount": cgst_amount,
					"formatted_cgst": f"₹{cgst_amount:,.2f}",
					"sgst_rate": "2.5%",
					"sgst_amount": sgst_amount,
					"formatted_sgst": f"₹{sgst_amount:,.2f}",
					"total_gst_rate": "5.0%",
					"total_gst_amount": total_gst,
					"formatted_gst": f"₹{total_gst:,.2f}",
					"gross_settled": total_revenue,
					"formatted_gross_settled": f"₹{total_revenue:,.2f}",
				},
			},
			"orders": {
				"total_orders": total_orders,
				"status_breakdown": status_breakdown,
				"area_breakdown": area_breakdown,
				"table_breakdown": table_breakdown,
				"recent_orders": filtered_orders[:15],
			},
			"menu": {
				"best_selling": best_selling[:6],
				"least_selling": least_selling,
				"category_sales": category_sales,
				"all_items": all_dishes_list,
			},
			"customers": {
				"total_registered": total_registered_customers,
				"repeat_customers": repeat_customers_count,
				"repeat_pct": f"{round((repeat_customers_count / total_registered_customers) * 100)}%" if total_registered_customers else "0%",
				"new_customers_in_period": new_customers_in_period,
				"top_customers": top_customers,
			},
			"operations": {
				"total_tables": total_tables_count,
				"occupied_tables": occupied_tbl_count,
				"available_tables": available_tbl_count,
				"reserved_tables": reserved_tbl_count,
				"occupancy_pct": overall_occ_pct,
				"area_breakdown": area_breakdown,
			},
			"settlements": settlements_list,
		}


# =============================================================================
# Whitelisted API Endpoints for Centralized Service Layer
# =============================================================================

@frappe.whitelist()
def api_get_menu(category=None):
	return RestaurantStore.get_menu_management_data(category=category)


@frappe.whitelist()
def api_create_order(table_no, customer="", items=None, notes="", customer_mobile="", customer_id=""):
	if isinstance(items, str):
		items = json.loads(items)
	return RestaurantStore.create_order(
		table_no=table_no,
		customer=customer,
		items=items,
		notes=notes,
		customer_mobile=customer_mobile,
		customer_id=customer_id,
	)


@frappe.whitelist()
def api_lookup_customer(mobile=None, customer_id=None):
	return RestaurantStore.lookup_customer(mobile=mobile, customer_id=customer_id)


@frappe.whitelist()
def api_register_customer(name, mobile):
	return RestaurantStore.get_or_create_customer(name=name, mobile=mobile, update_visit=False)


@frappe.whitelist()
def api_get_customer_history(customer_id_or_mobile):
	return RestaurantStore.get_customer_history(customer_id_or_mobile)


@frappe.whitelist()
def api_get_customers(search=None):
	return RestaurantStore.get_customers_list(search=search)


@frappe.whitelist()
def api_get_receipt_data(order_id):
	return RestaurantStore.get_bill_receipt_data(order_id)


@frappe.whitelist()
def api_get_kitchen_orders():
	return RestaurantStore.get_kitchen_orders()


@frappe.whitelist()
def api_update_kitchen_status(order_id, status):
	return RestaurantStore.update_kitchen_status(order_id, status)


@frappe.whitelist()
def api_get_bill(table_no):
	return RestaurantStore.get_bill_for_table(table_no)


@frappe.whitelist()
def api_process_payment(order_id, payment_method="Cash", payment_reference="", discount=0):
	return RestaurantStore.process_payment(order_id, payment_method=payment_method, payment_reference=payment_reference, discount=discount)


@frappe.whitelist()
def api_get_billing_data(status=None, area=None, search=None, date_filter=None):
	return RestaurantStore.get_billing_data(status=status, area=area, search=search, date_filter=date_filter)


@frappe.whitelist()
def api_generate_bill(order_id):
	return RestaurantStore.generate_bill(order_id)


@frappe.whitelist()
def api_process_bill_payment(bill_no=None, order_id=None, payment_method="Cash", payment_reference="", discount=0):
	ident = bill_no or order_id
	return RestaurantStore.process_payment(ident, payment_method=payment_method, payment_reference=payment_reference, discount=discount)


@frappe.whitelist()
def api_download_bill_pdf(order_id=None, bill_no=None):
	ident = bill_no or order_id
	return RestaurantStore.download_bill_pdf(ident)


@frappe.whitelist()
def api_get_order_management_data(status=None, area=None, search=None):
	return RestaurantStore.get_order_management_data(status=status, area=area, search=search)


@frappe.whitelist()
def api_update_order_status(order_id, status, reason=""):
	return RestaurantStore.update_order_status(order_id, status, reason=reason)


@frappe.whitelist()
def api_get_order_details(order_id):
	return RestaurantStore.get_order_details(order_id)


@frappe.whitelist()
def api_get_kds_data(area=None, search=None):
	return RestaurantStore.get_kds_data(area=area, search=search)


@frappe.whitelist()
def api_get_inventory():
	return RestaurantStore.get_inventory()


@frappe.whitelist()
def api_get_restaurant_info():
	return RestaurantStore.get_restaurant_info()


@frappe.whitelist()
def api_download_bill_pdf(order_id):
	return RestaurantStore.download_bill_pdf(order_id)


@frappe.whitelist()
def api_get_reports_analytics(period="today", from_date=None, to_date=None):
	return RestaurantStore.get_reports_analytics(period=period, from_date=from_date, to_date=to_date)

@frappe.whitelist()
def api_get_inventory_dashboard_data(category=None, location=None, status=None, search=None):
	return RestaurantStore.get_inventory_dashboard_data(category=category, location=location, status=status, search=search)


@frappe.whitelist()
def api_perform_stock_in(item_name, qty, location=None, reason="", reference=""):
	return RestaurantStore.perform_stock_in(item_name, qty, location=location, reason=reason, reference=reference)


@frappe.whitelist()
def api_perform_stock_out(item_name, qty, location=None, reason="", reference=""):
	return RestaurantStore.perform_stock_out(item_name, qty, location=location, reason=reason, reference=reference)


@frappe.whitelist()
def api_perform_stock_adjustment(item_name, new_qty, reason="", reference=""):
	return RestaurantStore.perform_stock_adjustment(item_name, new_qty, reason=reason, reference=reference)


@frappe.whitelist()
def api_perform_stock_transfer(item_name, qty, from_location, to_location, reason=""):
	return RestaurantStore.perform_stock_transfer(item_name, qty, from_location, to_location, reason=reason)


@frappe.whitelist()
def api_record_wastage(item_name, qty, reason="Spoilage", date=None, batch_no="", notes=""):
	return RestaurantStore.record_wastage(item_name, qty, reason=reason, date=date, batch_no=batch_no, notes=notes)


@frappe.whitelist()
def api_create_supplier(name, contact_person="", phone="", email="", address="", categories=None, supplied_items=None):
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
	return RestaurantStore.create_supplier(name, contact_person=contact_person, phone=phone, email=email, address=address, categories=categories, supplied_items=supplied_items)


@frappe.whitelist()
def api_create_purchase_order(supplier_id, items, invoice_ref="", date=None, notes="", auto_receive=False):
	if isinstance(items, str):
		items = json.loads(items)
	if isinstance(auto_receive, str):
		auto_receive = auto_receive.lower() in ("true", "1", "yes")
	return RestaurantStore.create_purchase_order(supplier_id, items, invoice_ref=invoice_ref, date=date, notes=notes, auto_receive=auto_receive)


@frappe.whitelist()
def api_confirm_goods_receipt(po_number):
	return RestaurantStore.confirm_goods_receipt(po_number)


@frappe.whitelist()
def api_add_batch_record(item_name, batch_no, mfg_date, expiry_date, qty, location=None):
	return RestaurantStore.add_batch_record(item_name, batch_no, mfg_date, expiry_date, qty, location=location)


@frappe.whitelist()
def api_get_inventory_reports(report_type="stock_balance", from_date=None, to_date=None, category=None, location=None):
	return RestaurantStore.get_inventory_reports(report_type=report_type, from_date=from_date, to_date=to_date, category=category, location=location)

