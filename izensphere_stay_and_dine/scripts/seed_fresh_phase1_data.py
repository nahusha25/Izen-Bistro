import frappe
from frappe.utils import today, add_days, now_datetime, nowdate, now
import random

def seed():
    frappe.set_user("Administrator")
    current_date = today()
    prop_name = "Izensphere Stay and Dine"
    outlet_name = "Izensphere Dine-Main Branch"
    
    print(f"--- Seeding Fresh Data for {prop_name} on {current_date} ---")

    # 1. Clean up existing operational data for this property
    frappe.db.sql("DELETE FROM `tabFolio Ledger Entry` WHERE property = %s", prop_name)
    frappe.db.sql("DELETE FROM `tabFolio Payment` WHERE parent IN (SELECT name FROM `tabFolio` WHERE property = %s)", prop_name)
    frappe.db.sql("DELETE FROM `tabFolio Charge` WHERE parent IN (SELECT name FROM `tabFolio` WHERE property = %s)", prop_name)
    frappe.db.sql("DELETE FROM `tabFolio` WHERE property = %s", prop_name)
    frappe.db.sql("DELETE FROM `tabPOS Order Item` WHERE parent IN (SELECT name FROM `tabPOS Order` WHERE property = %s)", prop_name)
    frappe.db.sql("DELETE FROM `tabPOS Order` WHERE property = %s", prop_name)
    frappe.db.sql("DELETE FROM `tabHousekeeping Task` WHERE property = %s", prop_name)
    frappe.db.sql("DELETE FROM `tabReservation Night Rate` WHERE parent IN (SELECT name FROM `tabReservation` WHERE property = %s)", prop_name)
    frappe.db.sql("DELETE FROM `tabReservation` WHERE property = %s", prop_name)
    
    # Reset rooms for Izensphere Stay and Dine to Vacant & Clean
    frappe.db.sql("""
        UPDATE `tabRoom`
        SET occupancy_status = 'Vacant', housekeeping_status = 'Clean'
        WHERE property = %s
    """, prop_name)
    
    # 2. Ensure standard realistic guests
    guest_data = [
        {"name": "Rahul Sharma", "phone": "+91 98101 23456", "email": "rahul.sharma@example.com"},
        {"name": "Ananya Verma", "phone": "+91 98202 34567", "email": "ananya.verma@example.com"},
        {"name": "Vikram Malhotra", "phone": "+91 98303 45678", "email": "vikram.malhotra@example.com"},
        {"name": "Sneha Patel", "phone": "+91 98404 56789", "email": "sneha.patel@example.com"},
        {"name": "Rajesh Iyer", "phone": "+91 98505 67890", "email": "rajesh.iyer@example.com"},
        {"name": "Pooja Nair", "phone": "+91 98606 78901", "email": "pooja.nair@example.com"},
    ]
    
    guests = {}
    for g in guest_data:
        parts = g["name"].split(" ", 1)
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else ""
        existing = frappe.db.get_value("Guest", {"phone": g["phone"]}, "name")
        if existing:
            doc = frappe.get_doc("Guest", existing)
            doc.first_name = first_name
            doc.last_name = last_name
            doc.full_name = g["name"]
            doc.email = g["email"]
            doc.save(ignore_permissions=True)
            guests[g["name"]] = doc.name
        else:
            doc = frappe.get_doc({
                "doctype": "Guest",
                "first_name": first_name,
                "last_name": last_name,
                "full_name": g["name"],
                "phone": g["phone"],
                "email": g["email"],
                "id_type": "Aadhaar",
                "nationality": "Indian"
            }).insert(ignore_permissions=True)
            guests[g["name"]] = doc.name
    print(f"Guests ready: {guests}")

    # Helper to create reservation
    from izensphere_stay_and_dine.folio import open_folio, post_room_night
    from izensphere_stay_and_dine.ledger import save_folio

    # --- RESERVATION 1: In-House Guest (Checked in yesterday, leaving in 2 days) ---
    r1 = frappe.get_doc({
        "doctype": "Reservation",
        "property": prop_name,
        "guest": guests["Rahul Sharma"],
        "guest_name": "Rahul Sharma",
        "phone": "+91 98101 23456",
        "room_type": "Izensphere Dine-STD",
        "room": "Izensphere Dine-101",
        "check_in_date": add_days(current_date, -1),
        "check_out_date": add_days(current_date, 2),
        "adults": 2,
        "children": 0,
        "source": "Website",
        "status": "Checked In",
        "base_rate": 2800.0,
        "amount_before_tax": 8400.0,
        "amount_after_tax": 8820.0,
    })
    r1.flags.allow_past_check_in = True
    r1.insert(ignore_permissions=True)
    
    # Create Folio for R1
    f1_name = open_folio(r1)
    f1 = frappe.get_doc("Folio", f1_name)
    # Post night rate for yesterday
    post_room_night(r1, add_days(current_date, -1))
    # Post advance deposit payment
    f1 = frappe.get_doc("Folio", f1_name)
    f1.append("payments", {
        "posting_date": add_days(current_date, -1),
        "payment_kind": "Advance",
        "mode": "UPI",
        "amount": 2940.0,
        "currency": "INR",
        "reference": "UPI/20261119/883921"
    })
    from izensphere_stay_and_dine.folio import _recalculate
    _recalculate(f1)
    f1.save(ignore_permissions=True)
    
    # Set Room 101 Occupied
    frappe.db.set_value("Room", "Izensphere Dine-101", {
        "occupancy_status": "Occupied",
        "housekeeping_status": "Clean"
    })
    print(f"Created In-House Res 1: {r1.name} in Room 101 (Folio: {f1_name})")

    # --- RESERVATION 2: In-House Guest (Checked in 2 days ago, leaving tomorrow) ---
    r2 = frappe.get_doc({
        "doctype": "Reservation",
        "property": prop_name,
        "guest": guests["Ananya Verma"],
        "guest_name": "Ananya Verma",
        "phone": "+91 98202 34567",
        "room_type": "Izensphere Dine-DLX",
        "room": "Izensphere Dine-201",
        "check_in_date": add_days(current_date, -2),
        "check_out_date": add_days(current_date, 1),
        "adults": 2,
        "children": 1,
        "source": "Website",
        "status": "Checked In",
        "base_rate": 4200.0,
        "amount_before_tax": 12600.0,
        "amount_after_tax": 13230.0,
    })
    r2.flags.allow_past_check_in = True
    r2.insert(ignore_permissions=True)
    
    f2_name = open_folio(r2)
    post_room_night(r2, add_days(current_date, -2))
    post_room_night(r2, add_days(current_date, -1))
    f2 = frappe.get_doc("Folio", f2_name)
    f2.append("payments", {
        "posting_date": add_days(current_date, -2),
        "payment_kind": "Payment",
        "mode": "Card",
        "amount": 5000.0,
        "currency": "INR",
        "reference": "CC-9018"
    })
    _recalculate(f2)
    f2.save(ignore_permissions=True)
    
    frappe.db.set_value("Room", "Izensphere Dine-201", {
        "occupancy_status": "Occupied",
        "housekeeping_status": "Clean"
    })
    print(f"Created In-House Res 2: {r2.name} in Room 201 (Folio: {f2_name})")

    # --- RESERVATION 3: Today's Departure (Checked in 2 days ago, leaving TODAY) ---
    r3 = frappe.get_doc({
        "doctype": "Reservation",
        "property": prop_name,
        "guest": guests["Vikram Malhotra"],
        "guest_name": "Vikram Malhotra",
        "phone": "+91 98303 45678",
        "room_type": "Izensphere Dine-STD",
        "room": "Izensphere Dine-103",
        "check_in_date": add_days(current_date, -2),
        "check_out_date": current_date,
        "adults": 1,
        "children": 0,
        "source": "Phone",
        "status": "Checked In",
        "base_rate": 2800.0,
        "amount_before_tax": 5600.0,
        "amount_after_tax": 5880.0,
    })
    r3.flags.allow_past_check_in = True
    r3.insert(ignore_permissions=True)
    
    f3_name = open_folio(r3)
    post_room_night(r3, add_days(current_date, -2))
    post_room_night(r3, add_days(current_date, -1))
    f3 = frappe.get_doc("Folio", f3_name)
    f3.append("payments", {
        "posting_date": add_days(current_date, -2),
        "payment_kind": "Advance",
        "mode": "UPI",
        "amount": 2940.0,
        "currency": "INR",
        "reference": "UPI/DEP/3921"
    })
    _recalculate(f3)
    f3.save(ignore_permissions=True)
    
    frappe.db.set_value("Room", "Izensphere Dine-103", {
        "occupancy_status": "Occupied",
        "housekeeping_status": "Clean"
    })
    print(f"Created Departure Res 3: {r3.name} in Room 103 (Folio: {f3_name})")

    # --- RESERVATION 4: Today's Arrival (Check-in TODAY, leaving in 2 days) ---
    r4 = frappe.get_doc({
        "doctype": "Reservation",
        "property": prop_name,
        "guest": guests["Sneha Patel"],
        "guest_name": "Sneha Patel",
        "phone": "+91 98404 56789",
        "room_type": "Izensphere Dine-STD",
        "room": "Izensphere Dine-102",
        "check_in_date": current_date,
        "check_out_date": add_days(current_date, 2),
        "adults": 2,
        "children": 0,
        "source": "Website",
        "status": "Confirmed",
        "base_rate": 2800.0,
        "amount_before_tax": 5600.0,
        "amount_after_tax": 5880.0,
    }).insert(ignore_permissions=True)
    print(f"Created Arrival Res 4: {r4.name} for Room 102")

    # --- RESERVATION 5: Today's Arrival #2 (Check-in TODAY, leaving tomorrow) ---
    r5 = frappe.get_doc({
        "doctype": "Reservation",
        "property": prop_name,
        "guest": guests["Rajesh Iyer"],
        "guest_name": "Rajesh Iyer",
        "phone": "+91 98505 67890",
        "room_type": "Izensphere Dine-DLX",
        "room": "Izensphere Dine-202",
        "check_in_date": current_date,
        "check_out_date": add_days(current_date, 1),
        "adults": 2,
        "children": 0,
        "source": "Walk-in",
        "status": "Confirmed",
        "base_rate": 4200.0,
        "amount_before_tax": 4200.0,
        "amount_after_tax": 4410.0,
    }).insert(ignore_permissions=True)
    frappe.db.set_value("Room", "Izensphere Dine-202", {
        "occupancy_status": "Vacant",
        "housekeeping_status": "Inspected"
    })
    print(f"Created Arrival Res 5: {r5.name} for Room 202")

    # --- RESERVATION 6: Future Booking ---
    r6 = frappe.get_doc({
        "doctype": "Reservation",
        "property": prop_name,
        "guest": guests["Pooja Nair"],
        "guest_name": "Pooja Nair",
        "phone": "+91 98606 78901",
        "room_type": "Izensphere Dine-STE",
        "room": "Izensphere Dine-301",
        "check_in_date": add_days(current_date, 3),
        "check_out_date": add_days(current_date, 6),
        "adults": 2,
        "children": 1,
        "source": "OTA",
        "status": "Confirmed",
        "base_rate": 7500.0,
        "amount_before_tax": 22500.0,
        "amount_after_tax": 23625.0,
    }).insert(ignore_permissions=True)
    print(f"Created Future Res 6: {r6.name} for Room 301")

    # 4. Set additional realistic Room statuses
    frappe.db.set_value("Room", "Izensphere Dine-104", {"occupancy_status": "Vacant", "housekeeping_status": "Dirty"})
    frappe.db.set_value("Room", "Izensphere Dine-105", {"occupancy_status": "Vacant", "housekeeping_status": "Cleaning in Progress"})

    # 5. Housekeeping Tasks
    hk_tasks = [
        {
            "room": "Izensphere Dine-103",
            "task_type": "Checkout Clean",
            "priority": "High",
            "status": "In Progress",
            "assignment_status": "Accepted",
            "assigned_to_user": "admin@stayanddine.local",
            "notes": "Guest departs today at 11:00 AM"
        },
        {
            "room": "Izensphere Dine-104",
            "task_type": "Stayover Clean",
            "priority": "Medium",
            "status": "Pending",
            "assignment_status": "Assigned",
            "assigned_to_user": "admin@stayanddine.local",
            "notes": "Linen change & bathroom replenishment requested"
        },
        {
            "room": "Izensphere Dine-105",
            "task_type": "Deep Clean",
            "priority": "High",
            "status": "Pending",
            "assignment_status": "Unassigned",
            "assigned_to_user": None,
            "notes": "Deep carpet shampoo & AC filter check"
        },
    ]
    for ht in hk_tasks:
        frappe.get_doc({
            "doctype": "Housekeeping Task",
            "property": prop_name,
            "room": ht["room"],
            "task_type": ht["task_type"],
            "priority": ht["priority"],
            "status": ht["status"],
            "notes": ht["notes"],
            "assignment_status": ht["assignment_status"],
            "assigned_to_user": ht["assigned_to_user"],
            "due_by": now_datetime(),
        }).insert(ignore_permissions=True)
    print("Housekeeping tasks seeded.")

    # 6. Restaurant Orders & KDS
    # Order 1: Active in Kitchen (Table 01 - Preparing)
    menu_items = frappe.get_all("Menu Item", filters={"outlet": outlet_name}, fields=["name", "item_name", "price"])
    mi_by_name = {m.item_name: m for m in menu_items}

    # Pick 3 items
    item1 = mi_by_name.get("Chicken Tikka") or menu_items[0]
    item2 = mi_by_name.get("Butter Naan") or menu_items[1]
    item3 = mi_by_name.get("Chilled Cold Coffee") or menu_items[2]

    ord1 = frappe.get_doc({
        "doctype": "POS Order",
        "property": prop_name,
        "outlet": outlet_name,
        "status": "Preparing",
        "order_type": "Dine In",
        "table_no": "Table 01",
        "guests": 2,
        "source": "Manual",
        "captain": "admin@stayanddine.local",
        "kot_fired": 1,
        "kot_no": 1,
        "accepted_at": now_datetime(),
        "notes": "Table 01 near window. Spice medium.",
        "items": [
            {
                "menu_item": item1.name,
                "item_name": item1.item_name,
                "qty": 1,
                "rate": item1.price,
                "amount": item1.price,
                "kot_status": "Fired",
                "fired_at": now(),
                "started_at": now(),
                "instructions": "Medium spice"
            },
            {
                "menu_item": item2.name,
                "item_name": item2.item_name,
                "qty": 2,
                "rate": item2.price,
                "amount": item2.price * 2,
                "kot_status": "Fired",
                "fired_at": now(),
                "started_at": now(),
                "instructions": "Crispy butter naan"
            },
            {
                "menu_item": item3.name,
                "item_name": item3.item_name,
                "qty": 2,
                "rate": item3.price,
                "amount": item3.price * 2,
                "kot_status": "Fired",
                "fired_at": now(),
                "started_at": now(),
                "instructions": "Extra chilled"
            }
        ]
    })
    ord1.subtotal = sum(i.amount for i in ord1.items)
    ord1.order_total = round(ord1.subtotal * 1.05, 2)
    ord1.insert(ignore_permissions=True)
    print(f"Seeded KDS Order on Table 01: {ord1.name} (Total: ₹{ord1.order_total})")

    # Order 2: Room Service delivered to Room 101 and charged to Folio!
    ord2 = frappe.get_doc({
        "doctype": "POS Order",
        "property": prop_name,
        "outlet": outlet_name,
        "status": "Delivered",
        "order_type": "Room Service",
        "room": "Izensphere Dine-101",
        "reservation": r1.name,
        "source": "Phone",
        "captain": "admin@stayanddine.local",
        "kot_fired": 1,
        "kot_no": 2,
        "posted_to_folio": 1,
        "notes": "Deliver to Room 101",
        "items": [
            {
                "menu_item": item1.name,
                "item_name": item1.item_name,
                "qty": 1,
                "rate": item1.price,
                "amount": item1.price,
                "kot_status": "Prepared",
                "fired_at": add_days(now(), -1),
                "started_at": add_days(now(), -1),
                "prepared_at": add_days(now(), -1),
                "picked_up_at": add_days(now(), -1),
            }
        ]
    })
    ord2.subtotal = item1.price
    ord2.order_total = round(item1.price * 1.05, 2)
    ord2.insert(ignore_permissions=True)

    # Post this charge to Folio 1
    f1 = frappe.get_doc("Folio", f1_name)
    f1.append("charges", {
        "posting_date": current_date,
        "charge_type": "Food & Beverage",
        "description": f"Main Restaurant · {item1.item_name} (Order {ord2.name})",
        "qty": 1,
        "rate": item1.price,
        "amount": item1.price,
        "gst_rate": 5.0,
        "auto_posted": 1,
    })
    _recalculate(f1)
    f1.save(ignore_permissions=True)
    print(f"Posted F&B Order {ord2.name} to Folio {f1_name}")

    frappe.db.commit()
    print("--- SUCCESS: All Phase 1 fresh operational data committed cleanly! ---")

if __name__ == "__main__":
    frappe.init(site="stayanddine.localhost", sites_path="/apps/frappe-bench/sites")
    frappe.connect()
    seed()
