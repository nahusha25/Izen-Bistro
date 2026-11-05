// Copyright (c) 2026, Nahusha and contributors
// For license information, please see license.txt

frappe.provide('frappe.restaurant');

$(document).on('app_ready', function () {
	// Global route guard to redirect any generic 'point-of-sale' route to the connected restaurant POS
	frappe.router.on('change', function () {
		let route = frappe.get_route();
		if (route && route[0] === 'point-of-sale') {
			frappe.set_route('restaurant-order-management', 'new-order');
		}
	});

	// If page was loaded directly on point-of-sale
	let currentRoute = frappe.get_route();
	if (currentRoute && currentRoute[0] === 'point-of-sale') {
		frappe.set_route('restaurant-order-management', 'new-order');
	}
});

/**
 * Unified Shared Point of Sale (POS) Order Creation & Add-on Dialog
 * Single shared component used by both Floor & Table Management and Order Management.
 *
 * @param {Object} options
 * @param {string} [options.target_table_no] - Pre-selected table number (e.g. 'T-01')
 * @param {string} [options.existing_order_id] - ID of existing order if adding dishes to active visit
 * @param {Object} [options.existing_table] - Table metadata object if opened from Floor
 * @param {Function} [options.on_success] - Callback invoked when order/round is confirmed & dispatched
 */
frappe.restaurant.open_pos_dialog = function (options = {}) {
	let target_table_no = options.target_table_no || null;
	let existing_order_id = options.existing_order_id || null;
	let existing_table = options.existing_table || null;

	let isAddon = Boolean(existing_order_id);

	// Fetch fresh, synchronized store data from central RestaurantStore
	frappe.call({
		method: 'restaurant_management.restaurant_management.page.restaurant_order_management.restaurant_order_management.get_order_data',
		freeze: true,
		freeze_message: __('Loading POS Menu & Tables...'),
		callback: function (r) {
			if (!r.message) {
				frappe.msgprint(__('Unable to load menu catalog from RestaurantStore.'));
				return;
			}
			let storeData = r.message;
			frappe.restaurant._render_pos_dialog_modal(storeData, options);
		},
		error: function (err) {
			console.error("Failed to load POS data from RestaurantStore:", err);
			frappe.msgprint(__('Error connecting to POS services. Please try again.'));
		}
	});
};

frappe.restaurant._render_pos_dialog_modal = function (data, options = {}) {
	// Clean up any existing POS dialog in DOM to avoid duplicate IDs & stale event listeners
	if (frappe.restaurant._current_pos_dialog) {
		try {
			frappe.restaurant._current_pos_dialog.$wrapper.remove();
			frappe.restaurant._current_pos_dialog = null;
		} catch (e) {}
	}
	$('.modal.show:contains("Point of Sale")').each(function () {
		try { $(this).modal('hide').remove(); } catch (e) {}
	});
	let target_table_no = options.target_table_no || null;
	let existing_order_id = options.existing_order_id || null;
	let existing_table = options.existing_table || null;
	let isAddon = Boolean(existing_order_id);

	let cart = [];
	let selected_category = 'All';
	let modal_dish_search = '';

	let availableTables = data.available_tables || [];
	let allTables = data.all_tables || [];
	let menuItems = data.menu_items || [];
	let customers = data.customers || [];
	let orders = data.orders || [];

	let existingOrder = isAddon
		? orders.find(o => o.order_id === existing_order_id)
		: null;

	// If addon, resolve target table from order
	if (isAddon && !target_table_no && existingOrder) {
		target_table_no = existingOrder.table_no;
	}

	// Validate available tables if starting a new order without preselected table
	if (!isAddon && !target_table_no && availableTables.length === 0) {
		frappe.msgprint({
			title: __('No Available Tables'),
			message: __('All tables are currently occupied or reserved. Please vacate or check-in a table in Floor & Table Management before creating a new dine-in order.'),
			indicator: 'orange'
		});
		return;
	}

	let dialogTitle = isAddon
		? __('Point of Sale (POS) — Add More Items &bull; {0}', [existing_order_id])
		: (target_table_no
			? __('Point of Sale (POS) — New Order &bull; Table {0}', [target_table_no])
			: __('Point of Sale (POS) — New Restaurant Order'));

	let primaryBtnLabel = isAddon
		? __('Send Round to Kitchen')
		: __('Confirm & Dispatch Order');

	let d = new frappe.ui.Dialog({
		title: dialogTitle,
		size: 'extra-large',
		fields: [
			{
				fieldtype: 'HTML',
				fieldname: 'pos_html'
			}
		],
		primary_action_label: primaryBtnLabel,
		primary_action: function () {
			let table_no = isAddon
				? (target_table_no || (existingOrder ? existingOrder.table_no : ''))
				: (target_table_no || $wrapper.find('#pos-table-select').val());

			let customer = $wrapper.find('#pos-customer-input').val();
			let customer_mobile = $wrapper.find('#pos-customer-mobile').val();
			let customer_id = $wrapper.find('#pos-customer-select').data('customer-id') || '';
			let notes = $wrapper.find('#pos-notes-input').val();

			if (!table_no) {
				frappe.msgprint(__('Please select an available dining table.'));
				return;
			}

			if (cart.length === 0) {
				frappe.msgprint(__('Cart is empty. Please add at least one dish to the order.'));
				return;
			}

			let itemsPayload = cart.map(c => ({
				item_id: c.item_id,
				name: c.name,
				qty: c.qty,
				notes: c.notes || ''
			}));

			let $primaryBtn = d.get_primary_btn();
			$primaryBtn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> ' + __('Dispatching...'));

			if (isAddon) {
				frappe.call({
					method: 'restaurant_management.restaurant_management.page.restaurant_order_management.restaurant_order_management.add_items_to_order',
					args: {
						order_id: existing_order_id,
						table_no: table_no,
						items: JSON.stringify(itemsPayload),
						notes: notes || ''
					},
					freeze: true,
					freeze_message: __('Dispatching items to kitchen...'),
					callback: function (r) {
						d.hide();
						if (r.message) {
							frappe.show_alert({
								message: __('Dishes added to Table {0} and dispatched to KDS.', [table_no]),
								indicator: 'green'
							});
							if (typeof options.on_success === 'function') {
								options.on_success(r.message);
							}
						}
					},
					error: function () {
						$primaryBtn.prop('disabled', false).html(primaryBtnLabel);
					}
				});
			} else {
				frappe.call({
					method: 'restaurant_management.restaurant_management.page.restaurant_order_management.restaurant_order_management.create_order',
					args: {
						table_no: table_no,
						customer: customer || 'Walk-in Guest',
						customer_mobile: customer_mobile || '',
						customer_id: customer_id || '',
						items: JSON.stringify(itemsPayload),
						notes: notes || ''
					},
					freeze: true,
					freeze_message: __('Creating order and firing KDS ticket...'),
					callback: function (r) {
						d.hide();
						if (r.message) {
							let newOrder = r.message;
							frappe.show_alert({
								message: __('Order {0} confirmed for Table {1} and dispatched to KDS!', [newOrder.order_id, newOrder.table_no]),
								indicator: 'green'
							});
							if (typeof options.on_success === 'function') {
								options.on_success(newOrder);
							}
						}
					},
					error: function () {
						$primaryBtn.prop('disabled', false).html(primaryBtnLabel);
					}
				});
			}
		}
	});

	let $wrapper = d.get_field('pos_html').$wrapper;

	// Table dropdown options
	let tableOptionsHtml = '';
	if (target_table_no) {
		let tObj = allTables.find(t => t.table_no === target_table_no) || existing_table || { table_no: target_table_no, area: 'Dining Area', capacity: 4 };
		tableOptionsHtml = `<option value="${target_table_no}" selected>Table ${target_table_no} &bull; ${tObj.area || 'Dining Area'} (Capacity: ${tObj.capacity || 4} Seats) — Selected</option>`;
	} else {
		tableOptionsHtml = '<option value="">-- Select Available Dining Table --</option>';
		availableTables.forEach(t => {
			let seatedInfo = (t.status === 'Occupied' && t.customer) ? ` [Seated: ${t.customer}]` : '';
			tableOptionsHtml += `<option value="${t.table_no}">Table ${t.table_no} &bull; ${t.area} (Capacity: ${t.capacity} Seats)${seatedInfo}</option>`;
		});
	}

	// Customer dropdown options
	let customerDropdownOptions = '<option value="">-- Quick Select Existing Guest --</option>';
	customers.forEach(c => {
		customerDropdownOptions += `<option value="${c.mobile}" data-id="${c.customer_id}" data-name="${c.name}">${c.name} (+91 ${c.mobile}) [${c.customer_id}]</option>`;
	});

	// Categories tabs
	let categories = [
		'All',
		'Starters',
		'Soups',
		'Main Course – Veg',
		'Main Course – Non-Veg',
		'Rice & Biryani',
		'Breads',
		'Desserts',
		'Beverages'
	];
	let categoryPillsHtml = categories.map(cat => `
		<button type="button" class="pos-cat-pill ${cat === 'All' ? 'active' : ''}" data-cat="${cat}">${cat}</button>
	`).join('');

	let posLayout = `
		<div class="pos-order-container">
			<!-- Left Pane: Menu Catalog & Table Selection -->
			<div class="pos-left-pane">
				<div class="pos-header-inputs" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem; margin-bottom: 0.25rem;">
					<div class="pos-input-group">
						<label><i class="fa fa-cutlery"></i> ${__('Dining Table')}</label>
						<select id="pos-table-select" style="width: 100%; padding: 0.35rem 0.65rem; border: 1px solid var(--border-color); border-radius: 6px; font-weight: 600;" ${target_table_no ? 'disabled' : ''}>
							${tableOptionsHtml}
						</select>
					</div>

					<div class="pos-input-group">
						<label><i class="fa fa-id-card-o"></i> ${__('Registered Guest')}</label>
						<select id="pos-customer-select" style="width: 100%; padding: 0.35rem 0.65rem; border: 1px solid var(--border-color); border-radius: 6px;">
							${customerDropdownOptions}
						</select>
					</div>

					<div class="pos-input-group">
						<label><i class="fa fa-phone"></i> ${__('Customer Mobile')}</label>
						<input type="text" id="pos-customer-mobile" placeholder="${__('10-digit mobile number')}" maxlength="10" />
					</div>

					<div class="pos-input-group">
						<label><i class="fa fa-user"></i> ${__('Customer Full Name')}</label>
						<input type="text" id="pos-customer-input" placeholder="${__('Walk-in Guest')}" style="width: 100%; padding: 0.35rem 0.65rem; border: 1px solid var(--border-color); border-radius: 6px;" />
					</div>

					<div class="pos-cust-status" id="pos-cust-status" style="grid-column: 1 / -1;"></div>
				</div>

				<div class="pos-menu-filters">
					<input type="text" id="pos-dish-search" placeholder="${__('Search dishes by name or code...')}" style="flex: 1; padding: 0.35rem 0.65rem; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.85rem;" />
					<div class="pos-category-pills" id="pos-category-pills">
						${categoryPillsHtml}
					</div>
				</div>

				<!-- Dishes Grid -->
				<div class="pos-dishes-grid" id="pos-dishes-grid"></div>
			</div>

			<!-- Right Pane: Live Cart -->
			<div class="pos-right-pane">
				<div>
					<div class="pos-cart-title">
						<span><i class="fa fa-shopping-cart"></i> ${isAddon ? __('Additional Items (Round 2+)') : __('Current Order Cart')}</span>
						<span class="badge badge-info" id="pos-cart-badge" style="background: #e0e7ff; color: #4338ca; font-weight: 700; border-radius: 4px; padding: 3px 8px;">0 items</span>
					</div>

					<div class="pos-cart-items" id="pos-cart-items">
						<div class="pos-cart-empty">
							<i class="fa fa-cutlery fa-2x" style="margin-bottom: 0.5rem; opacity: 0.4;"></i>
							<div>${__('No dishes added yet')}</div>
							<div style="font-size: 0.75rem; margin-top: 0.25rem;">${__('Click any available dish or "+ Add"')}</div>
						</div>
					</div>
				</div>

				<div>
					<div class="pos-input-group" style="margin-top: 0.75rem;">
						<label><i class="fa fa-pencil"></i> ${__('Special Instructions for Kitchen')}</label>
						<input type="text" id="pos-notes-input" placeholder="${__('e.g. Less spicy, extra butter on naan...')}" style="font-size: 0.8rem;" />
					</div>

					<div class="pos-cart-totals">
						<div class="pos-totals-row">
							<span>${__('Subtotal')}</span>
							<span id="pos-cart-subtotal" style="font-weight: 600;">₹0</span>
						</div>
						<div class="pos-totals-row">
							<span>${__('Taxes (GST 5%)')}</span>
							<span id="pos-cart-tax" style="font-weight: 600;">₹0</span>
						</div>
						<div class="pos-totals-row final-total">
							<span>${__('Grand Total')}</span>
							<span id="pos-cart-total" style="color: #ea580c; font-weight: 800;">₹0</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	`;

	$wrapper.html(posLayout);

	let $mobileInput = $wrapper.find('#pos-customer-mobile');
	let $nameInput = $wrapper.find('#pos-customer-input');
	let $selectGuest = $wrapper.find('#pos-customer-select');
	let $custStatus = $wrapper.find('#pos-cust-status');

	// Pre-fill existing customer if table is already occupied
	if (existing_table && existing_table.customer) {
		$nameInput.val(existing_table.customer);
		if (existing_table.customer_mobile) {
			$mobileInput.val(existing_table.customer_mobile);
		}
	} else if (existingOrder && existingOrder.customer) {
		$nameInput.val(existingOrder.customer);
		if (existingOrder.customer_mobile) {
			$mobileInput.val(existingOrder.customer_mobile);
		}
	}

	// Customer Lookup function
	let performCustomerLookup = function (mob) {
		if (!mob || mob.length !== 10 || !/^\d{10}$/.test(mob)) {
			$custStatus.empty();
			$selectGuest.val('');
			return;
		}

		frappe.call({
			method: 'restaurant_management.restaurant_management.page.restaurant_order_management.restaurant_order_management.lookup_customer',
			args: { mobile: mob },
			callback: function (r) {
				if (r.message) {
					let c = r.message;
					$nameInput.val(c.name || '').prop('readonly', true);
					$selectGuest.val(mob);
					$selectGuest.data('customer-id', c.customer_id || '');
					$custStatus.html(`
						<span class="badge badge-success" style="background: #ecfdf5; color: #047857; font-weight: 600; padding: 3px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 6px;">
							<i class="fa fa-check-circle"></i> ${__('Registered Guest')} &bull; ${c.customer_id} &bull; ${c.total_visits || 1} ${__('Visits')} (₹${(c.total_spend || 0).toLocaleString()})
						</span>
					`);
				} else {
					$nameInput.prop('readonly', false);
					$selectGuest.val('');
					$selectGuest.data('customer-id', '');
					$custStatus.html(`
						<span class="badge badge-info" style="background: #eff6ff; color: #1d4ed8; font-weight: 600; padding: 3px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 6px;">
							<i class="fa fa-user-plus"></i> ${__('New Guest Registration')}
						</span>
					`);
				}
			}
		});
	};

	$mobileInput.on('input', function () {
		let val = $(this).val().replace(/\D/g, '');
		$(this).val(val);
		if (val.length === 10) {
			performCustomerLookup(val);
		} else {
			$nameInput.prop('readonly', false);
			$selectGuest.val('');
			$selectGuest.data('customer-id', '');
			$custStatus.empty();
		}
	});

	$selectGuest.on('change', function () {
		let mob = $(this).val();
		if (mob) {
			$mobileInput.val(mob);
			let opt = $(this).find(':selected');
			$selectGuest.data('customer-id', opt.data('id') || '');
			performCustomerLookup(mob);
		} else {
			$mobileInput.val('');
			$nameInput.val('').prop('readonly', false);
			$selectGuest.data('customer-id', '');
			$custStatus.empty();
		}
	});

	// Add to Cart function
	let add_to_cart = function (item) {
		if (!item || !item.item_id) return;
		if (item.available === false || item.stock_status === 'out_of_stock') {
			frappe.show_alert({
				message: __('Item "{0}" is out of stock or unavailable.', [item.name || item.item_id]),
				indicator: 'orange'
			});
			return;
		}

		let itemName = item.name || item.item_name || item.dish_name || item.item_id;
		let existing = cart.find(c => c.item_id === item.item_id);
		if (existing) {
			existing.qty += 1;
		} else {
			cart.push({
				item_id: item.item_id,
				name: itemName,
				price: item.price || 0,
				qty: 1,
				is_veg: item.is_veg
			});
		}
	};

	// Render Dishes in Left Pane
	let renderDishes = function () {
		let $grid = $wrapper.find('#pos-dishes-grid').empty();
		let filtered = menuItems.filter(item => {
			if (selected_category !== 'All') {
				let normSelected = (selected_category || '').replace('—', '-').replace('–', '-').trim().toLowerCase();
				let normItemCat = (item.category || '').replace('—', '-').replace('–', '-').trim().toLowerCase();
				if (normSelected !== normItemCat) return false;
			}
			if (modal_dish_search) {
				let q = modal_dish_search.toLowerCase();
				let itemName = (item.name || item.item_name || '').toLowerCase();
				let itemId = (item.item_id || '').toLowerCase();
				return itemName.includes(q) || itemId.includes(q);
			}
			return true;
		});

		if (filtered.length === 0) {
			$grid.html(`
				<div style="grid-column: 1 / -1; text-align: center; color: #94a3b8; padding: 2.5rem 0; font-size: 0.85rem;">
					<i class="fa fa-search fa-2x" style="opacity: 0.3; margin-bottom: 0.5rem;"></i>
					<div>${__('No dishes found in this category')}</div>
				</div>
			`);
			return;
		}

		filtered.forEach(item => {
			let isAvailable = item.available !== false && item.stock_status !== 'out_of_stock';
			let dietDot = item.is_veg
				? '<span style="color: #16a34a; font-weight: bold;" title="Vegetarian">🟢</span>'
				: '<span style="color: #dc2626; font-weight: bold;" title="Non-Vegetarian">🔴</span>';

			let stockAlert = '';
			if (item.stock_status === 'low_stock') {
				stockAlert = `<span style="font-size: 0.68rem; color: #d97706; display: block; font-weight: 600;"><i class="fa fa-warning"></i> Low stock</span>`;
			} else if (item.stock_status === 'out_of_stock') {
				stockAlert = `<span style="font-size: 0.68rem; color: #dc2626; display: block; font-weight: 600;"><i class="fa fa-ban"></i> Out of stock</span>`;
			} else if (item.available === false) {
				stockAlert = `<span style="font-size: 0.68rem; color: #9ca3af; display: block; font-weight: 600;">Unavailable</span>`;
			}

			let displayName = item.name || item.item_name || item.dish_name || item.item_id;

			let $dish = $(`
				<div class="pos-dish-item ${isAvailable ? '' : 'disabled'}" data-item-id="${item.item_id}">
					<div>
						<div class="pos-dish-title">${dietDot} ${frappe.utils.escape_html(displayName)}</div>
						<div style="font-size: 0.725rem; color: var(--text-muted);">${frappe.utils.escape_html(item.category || '')}</div>
						${stockAlert}
					</div>
					<div class="pos-dish-meta">
						<span class="pos-dish-price">${item.formatted_price || ('₹' + item.price)}</span>
						<button type="button" class="btn btn-xs ${isAvailable ? 'btn-primary' : 'btn-default'} btn-pos-add" data-item-id="${item.item_id}" ${isAvailable ? '' : 'disabled'}>
							${isAvailable ? '<i class="fa fa-plus"></i> ' + __('Add') : __('Unavailable')}
						</button>
					</div>
				</div>
			`);

			if (isAvailable) {
				$dish.on('click', function () {
					add_to_cart(item);
					renderCart();
				});
			}

			$grid.append($dish);
		});
	};

	// Render Cart in Right Pane
	let renderCart = function () {
		let $cartItems = $wrapper.find('#pos-cart-items').empty();
		let subtotal = 0;
		let totalCount = 0;

		if (cart.length === 0) {
			$cartItems.html(`
				<div class="pos-cart-empty">
					<i class="fa fa-cutlery fa-2x" style="margin-bottom: 0.5rem; opacity: 0.4;"></i>
					<div>${__('No dishes added yet')}</div>
					<div style="font-size: 0.75rem; margin-top: 0.25rem;">${__('Click any dish or "+ Add" to begin')}</div>
				</div>
			`);
			$wrapper.find('#pos-cart-badge').text('0 items');
			$wrapper.find('#pos-cart-subtotal').text('₹0');
			$wrapper.find('#pos-cart-tax').text('₹0');
			$wrapper.find('#pos-cart-total').text('₹0');
			return;
		}

		cart.forEach((cItem, idx) => {
			let lineAmt = cItem.price * cItem.qty;
			subtotal += lineAmt;
			totalCount += cItem.qty;

			let $row = $(`
				<div class="pos-cart-row">
					<div style="flex: 1; padding-right: 0.5rem;">
						<div style="font-weight: 600; color: #0f172a;">${frappe.utils.escape_html(cItem.name)}</div>
						<div style="font-size: 0.725rem; color: #64748b;">₹${cItem.price} each</div>
					</div>
					<div class="pos-qty-controls">
						<button type="button" class="pos-qty-btn btn-dec" data-idx="${idx}" title="${__('Decrease quantity')}">-</button>
						<span style="font-weight: 700; min-width: 18px; text-align: center;">${cItem.qty}</span>
						<button type="button" class="pos-qty-btn btn-inc" data-idx="${idx}" title="${__('Increase quantity')}">+</button>
						<button type="button" class="btn btn-xs btn-link text-danger btn-del" data-idx="${idx}" style="margin-left: 0.25rem;" title="${__('Remove line')}"><i class="fa fa-trash"></i></button>
					</div>
					<div style="width: 60px; text-align: right; font-weight: 700; color: #0f172a;">
						₹${lineAmt.toLocaleString()}
					</div>
				</div>
			`);

			$row.find('.btn-dec').on('click', function (e) {
				e.stopPropagation();
				if (cItem.qty > 1) {
					cItem.qty -= 1;
				} else {
					cart.splice(idx, 1);
				}
				renderCart();
			});

			$row.find('.btn-inc').on('click', function (e) {
				e.stopPropagation();
				cItem.qty += 1;
				renderCart();
			});

			$row.find('.btn-del').on('click', function (e) {
				e.stopPropagation();
				cart.splice(idx, 1);
				renderCart();
			});

			$cartItems.append($row);
		});

		let tax = Math.round(subtotal * 0.05);
		let grandTotal = subtotal + tax;

		$wrapper.find('#pos-cart-badge').text(`${totalCount} items`);
		$wrapper.find('#pos-cart-subtotal').text(`₹${subtotal.toLocaleString()}`);
		$wrapper.find('#pos-cart-tax').text(`₹${tax.toLocaleString()}`);
		$wrapper.find('#pos-cart-total').text(`₹${grandTotal.toLocaleString()}`);
	};

	// Event Handlers for Categories and Search
	$wrapper.on('click', '.pos-cat-pill', function () {
		let cat = $(this).data('cat');
		$wrapper.find('.pos-cat-pill').removeClass('active');
		$(this).addClass('active');
		selected_category = cat;
		renderDishes();
	});

	$wrapper.on('input', '#pos-dish-search', function () {
		modal_dish_search = $(this).val();
		renderDishes();
	});

	renderDishes();
	renderCart();

	frappe.restaurant._current_pos_dialog = d;
	d.onhide = function () {
		if (frappe.restaurant._current_pos_dialog === d) {
			frappe.restaurant._current_pos_dialog = null;
		}
		setTimeout(() => {
			try { d.$wrapper.remove(); } catch (e) {}
		}, 300);
	};

	d.show();
};
