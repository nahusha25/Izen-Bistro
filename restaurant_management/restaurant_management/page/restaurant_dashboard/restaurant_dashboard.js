// Copyright (c) 2026, Nahusha and contributors
// For license information, please see license.txt

frappe.pages['restaurant-dashboard'].on_page_load = function (wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __('Izen Bistro — Dashboard'),
		single_column: true
	});

	frappe.breadcrumbs.add('Restaurant Management');

	// Primary Page Actions
	page.set_primary_action(__('New Order (POS)'), function () {
		if (frappe.restaurant && typeof frappe.restaurant.open_pos_dialog === 'function') {
			frappe.restaurant.open_pos_dialog({
				on_success: function () {
					if (wrapper.dashboard) wrapper.dashboard.refresh();
				}
			});
		} else {
			frappe.set_route('restaurant-order-management', 'new-order');
		}
	}, 'fa fa-plus');

	page.add_button(__('Refresh'), function () {
		if (wrapper.dashboard) {
			wrapper.dashboard.refresh();
		}
	}, 'fa fa-refresh');

	wrapper.dashboard = new RestaurantDashboard(wrapper, page);
};

frappe.pages['restaurant-dashboard'].on_page_show = function (wrapper) {
	if (wrapper.dashboard) {
		wrapper.dashboard.refresh();
		wrapper.dashboard.start_auto_refresh();
	}
};

frappe.pages['restaurant-dashboard'].on_page_hide = function (wrapper) {
	if (wrapper.dashboard) {
		wrapper.dashboard.stop_auto_refresh();
	}
};

class RestaurantDashboard {
	constructor(wrapper, page) {
		this.wrapper = wrapper;
		this.page = page;
		this.sales_chart = null;
		this.table_chart = null;
		this.refresh_interval = null;
		this.cached_data = null;

		this.init();
	}

	init() {
		this.render_skeleton();
		this.bind_events();
		this.fetch_data();
		this.start_auto_refresh();
	}

	start_auto_refresh() {
		this.stop_auto_refresh();
		let me = this;
		this.refresh_interval = setInterval(() => {
			me.fetch_data(true);
		}, 10000);
	}

	stop_auto_refresh() {
		if (this.refresh_interval) {
			clearInterval(this.refresh_interval);
			this.refresh_interval = null;
		}
	}

	get_formatted_today_date() {
		try {
			const options = { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' };
			return new Date().toLocaleDateString('en-IN', options);
		} catch (e) {
			return frappe.datetime.now_date();
		}
	}

	render_skeleton() {
		this.page.main.empty();
		const todayFormatted = this.get_formatted_today_date();

		this.container = $(`
			<div class="restaurant-dashboard-wrapper">
				<!-- Brand Header -->
				<header class="rm-dashboard-brand-header">
					<div class="rm-brand-left">
						<div class="rm-brand-logo-frame" title="Izen Bistro">
							<span class="rm-monogram">IB</span>
						</div>
						<div class="rm-brand-meta">
							<div class="rm-brand-title-row">
								<h1 class="rm-brand-name" id="dash-restaurant-name">IZEN BISTRO</h1>
								<span class="rm-live-badge">
									<span class="rm-pulse-dot"></span>
									${__("Live Operations")}
								</span>
							</div>
							<p class="rm-brand-subtitle" id="dash-restaurant-subtitle">${__("Restaurant Management Dashboard")}</p>
							<div class="rm-brand-location" id="dash-restaurant-location">
								<i class="fa fa-map-marker"></i>
								<span class="location-text">${__("Nagarbhavi, Bengaluru, Karnataka")}</span>
							</div>
						</div>
					</div>

					<div class="rm-brand-right">
						<div class="rm-header-info-chips">
							<div class="rm-info-chip" title="${__('Today\'s Date')}">
								<i class="fa fa-calendar text-muted"></i>
								<span id="dash-current-date">${todayFormatted}</span>
							</div>
							<div class="rm-info-chip" title="${__('Last Synced with Store')}">
								<i class="fa fa-clock-o text-muted"></i>
								<span>${__("Updated")} <strong class="rm-last-updated" id="dash-last-updated">${frappe.datetime.now_time()}</strong></span>
							</div>
							<button type="button" class="btn btn-sm btn-default rm-btn-refresh-dash" id="dash-btn-refresh">
								<i class="fa fa-refresh"></i>
								<span>${__("Refresh")}</span>
							</button>
						</div>
					</div>
				</header>

				<!-- Quick Actions Navigation Bar -->
				<section class="rm-section-block">
					<div class="rm-section-header">
						<span class="rm-section-title"><i class="fa fa-bolt text-warning"></i> ${__("Quick Actions")}</span>
						<span class="rm-section-hint">${__("Fast navigation across all restaurant modules")}</span>
					</div>
					<div class="rm-quick-actions-grid">
						<div class="rm-action-card action-new-order" data-action="new-order" title="${__('Open POS / Place New Order')}">
							<div class="action-icon-wrapper"><i class="fa fa-plus-circle"></i></div>
							<div class="action-text">
								<div class="action-title">${__("New Order")}</div>
								<div class="action-desc">${__("POS Checkout")}</div>
							</div>
						</div>

						<div class="rm-action-card action-floor" data-action="floor-management" title="${__('Floor & Table Management')}">
							<div class="action-icon-wrapper"><i class="fa fa-th-large"></i></div>
							<div class="action-text">
								<div class="action-title">${__("Floor & Tables")}</div>
								<div class="action-desc">${__("20 Tables Map")}</div>
							</div>
						</div>

						<div class="rm-action-card action-menu" data-action="menu-management" title="${__('Menu & Recipe Stock')}">
							<div class="action-icon-wrapper"><i class="fa fa-book"></i></div>
							<div class="action-text">
								<div class="action-title">${__("Menu Management")}</div>
								<div class="action-desc">${__("Dishes & Stock")}</div>
							</div>
						</div>

						<div class="rm-action-card action-orders" data-action="order-management" title="${__('Live Order Management')}">
							<div class="action-icon-wrapper"><i class="fa fa-list-alt"></i></div>
							<div class="action-text">
								<div class="action-title">${__("Order Management")}</div>
								<div class="action-desc">${__("Dining Tickets")}</div>
							</div>
						</div>

						<div class="rm-action-card action-kds" data-action="kitchen-display" title="${__('Kitchen Display System')}">
							<div class="action-icon-wrapper"><i class="fa fa-fire"></i></div>
							<div class="action-text">
								<div class="action-title">${__("Kitchen Display")}</div>
								<div class="action-desc">${__("Live KDS Queue")}</div>
							</div>
						</div>

						<div class="rm-action-card action-billing" data-action="billing-payments" title="${__('Billing & Cash/UPI Payments')}">
							<div class="action-icon-wrapper"><i class="fa fa-credit-card"></i></div>
							<div class="action-text">
								<div class="action-title">${__("Billing & Payments")}</div>
								<div class="action-desc">${__("Invoicing & Cash/UPI")}</div>
							</div>
						</div>

						<div class="rm-action-card action-customers" data-action="customer-management" title="${__('Centralized Customer Registry')}">
							<div class="action-icon-wrapper"><i class="fa fa-users"></i></div>
							<div class="action-text">
								<div class="action-title">${__("Customer Management")}</div>
								<div class="action-desc">${__("Registry & Visits")}</div>
							</div>
						</div>

						<div class="rm-action-card action-reports" data-action="reports" title="${__('Restaurant Reports & Analytics')}">
							<div class="action-icon-wrapper"><i class="fa fa-bar-chart"></i></div>
							<div class="action-text">
								<div class="action-title">${__("Reports")}</div>
								<div class="action-desc">${__("Sales & POS Register")}</div>
							</div>
						</div>

						<div class="rm-action-card action-inventory" data-action="inventory" title="${__('Inventory & Warehouse Management')}">
							<div class="action-icon-wrapper"><i class="fa fa-cubes"></i></div>
							<div class="action-text">
								<div class="action-title">${__("Inventory")}</div>
								<div class="action-desc">${__("Stock & Batches")}</div>
							</div>
						</div>
					</div>
				</section>

				<!-- Operations KPIs 8-Card Grid -->
				<section class="rm-section-block">
					<div class="rm-section-header">
						<span class="rm-section-title"><i class="fa fa-dashboard text-primary"></i> ${__("Restaurant Operations KPIs")}</span>
						<span class="rm-section-hint">${__("Live operational metrics derived directly from RestaurantStore")}</span>
					</div>
					<div class="rm-kpi-grid">
						<!-- 1. Today's Revenue -->
						<div class="rm-kpi-card kpi-revenue" data-action="billing-payments" title="${__('Click to view Billing & Payments')}">
							<div class="rm-kpi-header">
								<span class="rm-kpi-title">${__("Today's Revenue")}</span>
								<div class="rm-kpi-icon"><i class="fa fa-inr"></i></div>
							</div>
							<div class="rm-kpi-value" id="kpi-today-revenue">₹0</div>
							<div class="rm-kpi-footer">
								<span class="rm-kpi-badge badge-positive" id="kpi-revenue-growth">--</span>
								<span>${__("vs yesterday")}</span>
							</div>
						</div>

						<!-- 2. Today's Orders -->
						<div class="rm-kpi-card kpi-orders" data-action="order-management" title="${__('Click to view Order Management')}">
							<div class="rm-kpi-header">
								<span class="rm-kpi-title">${__("Today's Orders")}</span>
								<div class="rm-kpi-icon"><i class="fa fa-shopping-bag"></i></div>
							</div>
							<div class="rm-kpi-value" id="kpi-today-orders">0</div>
							<div class="rm-kpi-footer">
								<span class="rm-kpi-badge badge-neutral" id="kpi-completed-orders">--</span>
								<span>${__("served/completed")}</span>
							</div>
						</div>

						<!-- 3. Active Orders -->
						<div class="rm-kpi-card kpi-active-orders" data-action="order-management" title="${__('Click to view Active Orders')}">
							<div class="rm-kpi-header">
								<span class="rm-kpi-title">${__("Active Orders")}</span>
								<div class="rm-kpi-icon"><i class="fa fa-clock-o"></i></div>
							</div>
							<div class="rm-kpi-value" id="kpi-active-orders">0</div>
							<div class="rm-kpi-footer">
								<span class="rm-kpi-badge badge-neutral">${__("In dining room")}</span>
								<span>${__("cooking / dining")}</span>
							</div>
						</div>

						<!-- 4. Active Tables -->
						<div class="rm-kpi-card kpi-tables" data-action="floor-management" title="${__('Click to view Floor Plan')}">
							<div class="rm-kpi-header">
								<span class="rm-kpi-title">${__("Active Tables")}</span>
								<div class="rm-kpi-icon"><i class="fa fa-cutlery"></i></div>
							</div>
							<div class="rm-kpi-value" id="kpi-active-tables">0</div>
							<div class="rm-kpi-footer">
								<span class="rm-kpi-badge badge-neutral" id="kpi-occupancy-rate">--</span>
								<span>${__("occupancy rate")}</span>
							</div>
						</div>

						<!-- 5. Available Tables -->
						<div class="rm-kpi-card kpi-avail-tables" data-action="floor-management" title="${__('Click to view Floor Plan')}">
							<div class="rm-kpi-header">
								<span class="rm-kpi-title">${__("Available Tables")}</span>
								<div class="rm-kpi-icon"><i class="fa fa-check-circle"></i></div>
							</div>
							<div class="rm-kpi-value" id="kpi-available-tables">0</div>
							<div class="rm-kpi-footer">
								<span class="rm-kpi-badge badge-positive" id="kpi-available-display">${__("Ready to seat")}</span>
								<span>${__("out of 20 total")}</span>
							</div>
						</div>

						<!-- 6. Pending Kitchen Orders -->
						<div class="rm-kpi-card kpi-kitchen" data-action="kitchen-display" title="${__('Click to view Kitchen Display System')}">
							<div class="rm-kpi-header">
								<span class="rm-kpi-title">${__("Pending Kitchen")}</span>
								<div class="rm-kpi-icon"><i class="fa fa-fire"></i></div>
							</div>
							<div class="rm-kpi-value" id="kpi-kitchen-orders">0</div>
							<div class="rm-kpi-footer">
								<span class="rm-kpi-badge badge-neutral" id="kpi-avg-prep-time">14 mins</span>
								<span>${__("in kitchen queue")}</span>
							</div>
						</div>

						<!-- 7. Paid Bills -->
						<div class="rm-kpi-card kpi-paid-bills" data-action="billing-payments" title="${__('Click to view Paid Bills')}">
							<div class="rm-kpi-header">
								<span class="rm-kpi-title">${__("Paid Bills")}</span>
								<div class="rm-kpi-icon"><i class="fa fa-check-square-o"></i></div>
							</div>
							<div class="rm-kpi-value" id="kpi-paid-bills">0</div>
							<div class="rm-kpi-footer">
								<span class="rm-kpi-badge badge-positive">${__("Cleared")}</span>
								<span>${__("settled bills")}</span>
							</div>
						</div>

						<!-- 8. Pending Payments -->
						<div class="rm-kpi-card kpi-pending-bills" data-action="billing-payments" title="${__('Click to view Pending Payments')}">
							<div class="rm-kpi-header">
								<span class="rm-kpi-title">${__("Pending Payments")}</span>
								<div class="rm-kpi-icon"><i class="fa fa-hourglass-half"></i></div>
							</div>
							<div class="rm-kpi-value" id="kpi-pending-payments">0</div>
							<div class="rm-kpi-footer">
								<span class="rm-kpi-badge badge-neutral">${__("Unsettled")}</span>
								<span>${__("awaiting bill / pay")}</span>
							</div>
						</div>
					</div>
				</section>

				<!-- Analytics Row 1: Weekly Sales & Table Occupancy Breakdown -->
				<div class="rm-dashboard-row">
					<!-- Sales Analytics Card -->
					<div class="rm-card">
						<div class="rm-card-header">
							<div class="rm-card-header-left">
								<h3 class="rm-card-title">
									<i class="fa fa-bar-chart" style="color: #4f46e5;"></i>
									${__("Weekly Sales Analytics")}
								</h3>
								<p class="rm-card-subtitle">${__("Historical baseline + live today revenue across 7 days")}</p>
							</div>
							<span class="rm-card-badge" id="sales-weekly-total">₹0 Total</span>
						</div>
						<div class="rm-card-body">
							<div class="rm-sales-chart-container" id="rm-sales-chart"></div>
						</div>
					</div>

					<!-- Table Status & Floor Sections Breakdown -->
					<div class="rm-card">
						<div class="rm-card-header">
							<div class="rm-card-header-left">
								<h3 class="rm-card-title">
									<i class="fa fa-pie-chart" style="color: #059669;"></i>
									${__("Table Occupancy & Sections")}
								</h3>
								<p class="rm-card-subtitle">${__("Seating distribution across Main Hall, Patio & Terrace")}</p>
							</div>
							<a class="rm-card-badge" href="/desk/restaurant-floor-management" style="text-decoration: none;" id="tables-total-badge">
								20 Tables &bull; ${__("Floor Plan")} <i class="fa fa-arrow-right"></i>
							</a>
						</div>
						<div class="rm-card-body">
							<div class="rm-table-status-container">
								<div class="rm-donut-chart-container" id="rm-table-chart"></div>
								<div class="rm-table-meters" id="rm-table-meters"></div>
								<div class="rm-zones-list" id="rm-zones-list"></div>
							</div>
						</div>
					</div>
				</div>

				<!-- Analytics Row 2: Live Kitchen Queue & Popular Dishes -->
				<div class="rm-dashboard-row">
					<!-- Kitchen Queue Card -->
					<div class="rm-card">
						<div class="rm-card-header">
							<div class="rm-card-header-left">
								<h3 class="rm-card-title">
									<i class="fa fa-fire" style="color: #ea580c;"></i>
									${__("Kitchen Queue")}
								</h3>
								<p class="rm-card-subtitle">${__("Live tickets currently being prepared in the kitchen")}</p>
							</div>
							<a class="rm-card-badge" href="/desk/restaurant-kitchen-display" style="text-decoration: none;">
								${__("Open KDS")} <i class="fa fa-arrow-right"></i>
							</a>
						</div>
						<div class="rm-card-body" style="padding: 0;">
							<div class="rm-kitchen-queue-container" id="rm-kitchen-queue-list">
								<div class="text-center text-muted" style="padding: 2rem;">
									${__("Loading kitchen queue...")}
								</div>
							</div>
						</div>
					</div>

					<!-- Popular Dishes Card -->
					<div class="rm-card">
						<div class="rm-card-header">
							<div class="rm-card-header-left">
								<h3 class="rm-card-title">
									<i class="fa fa-star" style="color: #d97706;"></i>
									${__("Popular Dishes")}
								</h3>
								<p class="rm-card-subtitle">${__("Top highest selling menu items computed from shared orders")}</p>
							</div>
							<span class="rm-card-badge">${__("Top 5")}</span>
						</div>
						<div class="rm-card-body">
							<div class="rm-dishes-list" id="rm-dishes-list">
								<div class="text-center text-muted" style="padding: 2rem;">
									${__("Loading popular dishes...")}
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Analytics Row 3: Recent Orders Table -->
				<div class="rm-section-block">
					<div class="rm-card">
						<div class="rm-card-header">
							<div class="rm-card-header-left">
								<h3 class="rm-card-title">
									<i class="fa fa-list-alt" style="color: #0284c7;"></i>
									${__("Recent Orders")}
								</h3>
								<p class="rm-card-subtitle">${__("Live dining room order tickets, guest info, and settlement status")}</p>
							</div>
							<a class="rm-card-badge" href="/desk/restaurant-order-management" style="text-decoration: none;">
								${__("View All Orders")} <i class="fa fa-arrow-right"></i>
							</a>
						</div>
						<div class="rm-card-body" style="padding: 0;">
							<div class="rm-table-wrapper">
								<table class="rm-orders-table">
									<thead>
										<tr>
											<th>${__("Order ID")}</th>
											<th>${__("Table / Area")}</th>
											<th>${__("Customer")}</th>
											<th>${__("Items & Amount")}</th>
											<th>${__("Order Status")}</th>
											<th>${__("Payment")}</th>
											<th>${__("Time")}</th>
										</tr>
									</thead>
									<tbody id="rm-orders-tbody">
										<tr>
											<td colspan="7" class="text-center text-muted" style="padding: 2rem;">
												${__("Loading recent orders...")}
											</td>
										</tr>
									</tbody>
								</table>
							</div>
						</div>
					</div>
				</div>
			</div>
		`).appendTo(this.page.main);
	}

	bind_events() {
		let me = this;

		// Refresh button
		this.container.on('click', '#dash-btn-refresh', function () {
			let $btn = $(this);
			$btn.prop('disabled', true).find('i').addClass('fa-spin');
			me.fetch_data(false, () => {
				$btn.prop('disabled', false).find('i').removeClass('fa-spin');
			});
		});

		// Quick Actions click handlers
		this.container.on('click', '.rm-action-card', function () {
			let action = $(this).data('action');
			me.handle_quick_action(action);
		});

		// KPI Cards click handlers
		this.container.on('click', '.rm-kpi-card', function () {
			let action = $(this).data('action');
			if (action) {
				me.handle_quick_action(action);
			}
		});
	}

	handle_quick_action(action) {
		switch (action) {
			case 'new-order':
				if (frappe.restaurant && typeof frappe.restaurant.open_pos_dialog === 'function') {
					frappe.restaurant.open_pos_dialog({
						on_success: function () {
							me.refresh();
						}
					});
				} else {
					frappe.set_route('restaurant-order-management', 'new-order');
				}
				break;
			case 'floor-management':
				frappe.set_route('restaurant-floor-management');
				break;
			case 'menu-management':
				frappe.set_route('restaurant-menu-management');
				break;
			case 'order-management':
				frappe.set_route('restaurant-order-management');
				break;
			case 'kitchen-display':
				frappe.set_route('restaurant-kitchen-display');
				break;
			case 'billing-payments':
				frappe.set_route('restaurant-billing-payments');
				break;
			case 'customer-management':
				this.open_customer_registry_dialog();
				break;
			case 'reports':
				frappe.set_route('restaurant-reports');
				break;
			case 'inventory':
				frappe.set_route('restaurant-inventory');
				break;
			default:
				console.warn('Unknown quick action:', action);
		}
	}

	open_customer_registry_dialog() {
		let me = this;
		let d = new frappe.ui.Dialog({
			title: __('Izen Bistro — Customer Registry'),
			size: 'large',
			fields: [
				{
					fieldname: 'search_query',
					label: __('Search Customer'),
					fieldtype: 'Data',
					placeholder: __('Search by Name or 10-digit Mobile...'),
					onchange: function () {
						load_customer_data(this.get_value());
					}
				},
				{
					fieldname: 'customers_html',
					fieldtype: 'HTML'
				}
			],
			primary_action_label: __('Register New Customer'),
			primary_action: function () {
				d.hide();
				me.open_register_customer_dialog(() => {
					me.open_customer_registry_dialog();
				});
			}
		});

		function load_customer_data(query) {
			let $wrapper = d.get_field('customers_html').$wrapper;
			$wrapper.html(`
				<div class="text-center text-muted" style="padding: 2rem;">
					<i class="fa fa-spinner fa-spin"></i> ${__('Loading customer records...')}
				</div>
			`);

			frappe.call({
				method: 'restaurant_management.restaurant_management.page.restaurant_dashboard.restaurant_dashboard.get_customers',
				args: { search: query || '' },
				callback: function (r) {
					let list = r.message || [];
					if (!list.length) {
						$wrapper.html(`
							<div class="text-center text-muted" style="padding: 2.5rem 1rem;">
								<i class="fa fa-user-times" style="font-size: 2rem; margin-bottom: 0.5rem; display: block; opacity: 0.4;"></i>
								${__('No customer records found.')}
							</div>
						`);
						return;
					}

					let rowsHtml = list.map(c => `
						<tr>
							<td><strong style="color: #0f172a;">${c.customer_id}</strong></td>
							<td><span style="font-weight: 500;">${frappe.utils.escape_html(c.name)}</span></td>
							<td><span style="font-family: monospace; font-size: 0.9rem;">${c.mobile}</span></td>
							<td><span class="badge badge-light" style="font-weight: 600;">${c.total_visits} ${__('visits')}</span></td>
							<td><strong style="color: #059669;">${c.formatted_spent}</strong></td>
							<td><span class="text-muted" style="font-size: 0.8rem;">${c.last_visit || '--'}</span></td>
							<td class="text-right">
								<button type="button" class="btn btn-xs btn-default btn-view-history" data-id="${c.customer_id}" data-name="${frappe.utils.escape_html(c.name)}">
									<i class="fa fa-history"></i> ${__('Orders')}
								</button>
							</td>
						</tr>
					`).join('');

					$wrapper.html(`
						<div style="max-height: 380px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
							<table class="table table-hover table-condensed" style="margin-bottom: 0; font-size: 0.85rem;">
								<thead style="background: #f8fafc; position: sticky; top: 0; z-index: 1;">
									<tr>
										<th>${__('ID')}</th>
										<th>${__('Customer Name')}</th>
										<th>${__('Mobile Number')}</th>
										<th>${__('Visits')}</th>
										<th>${__('Total Spent')}</th>
										<th>${__('Last Visit')}</th>
										<th class="text-right">${__('Action')}</th>
									</tr>
								</thead>
								<tbody>
									${rowsHtml}
								</tbody>
							</table>
						</div>
					`);

					$wrapper.find('.btn-view-history').on('click', function () {
						let cid = $(this).data('id');
						let cname = $(this).data('name');
						me.view_customer_history(cid, cname);
					});
				}
			});
		}

		d.show();
		load_customer_data('');
	}

	open_register_customer_dialog(callback) {
		let d = new frappe.ui.Dialog({
			title: __('Register New Customer — Izen Bistro'),
			fields: [
				{
					fieldname: 'name',
					label: __('Full Name'),
					fieldtype: 'Data',
					reqd: 1,
					placeholder: __('e.g. Vikram Sharma')
				},
				{
					fieldname: 'mobile',
					label: __('Mobile Number (10 digits)'),
					fieldtype: 'Data',
					reqd: 1,
					placeholder: __('e.g. 9876543210')
				}
			],
			primary_action_label: __('Save Customer'),
			primary_action: function (values) {
				frappe.call({
					method: 'restaurant_management.restaurant_management.services.restaurant_store.api_register_customer',
					args: {
						name: values.name,
						mobile: values.mobile
					},
					callback: function (r) {
						if (r.message) {
							frappe.show_alert({
								message: __('Customer {0} registered successfully!', [r.message.name]),
								indicator: 'green'
							});
							d.hide();
							if (callback) callback();
						}
					}
				});
			}
		});
		d.show();
	}

	view_customer_history(customerId, customerName) {
		frappe.call({
			method: 'restaurant_management.restaurant_management.services.restaurant_store.api_get_customer_history',
			args: { customer_id_or_mobile: customerId },
			callback: function (r) {
				let history = r.message;
				if (!history) return;

				let ordersHtml = (history.orders || []).map(o => `
					<div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0; border-bottom: 1px solid #f1f5f9;">
						<div>
							<strong style="color: #0f172a;">${o.order_id}</strong>
							<span style="margin-left: 0.5rem; font-size: 0.8rem; color: #64748b;">Table ${o.table_no}</span>
							<div style="font-size: 0.78rem; color: #64748b;">${(o.items || []).map(i => i.qty + 'x ' + i.name).join(', ')}</div>
						</div>
						<div style="text-align: right;">
							<div style="font-weight: 700; color: #0f172a;">${o.formatted_amount}</div>
							<span class="rm-status-badge ${o.badge_class || 'badge-neutral'}" style="font-size: 0.7rem;">${o.status}</span>
						</div>
					</div>
				`).join('');

				let favoritesHtml = (history.favorite_dishes || []).map(f => `
					<span class="badge badge-light" style="margin-right: 0.35rem; margin-bottom: 0.35rem; padding: 0.35rem 0.6rem; border: 1px solid #e2e8f0;">
						${f.name} <strong style="color: #4f46e5;">(${f.count})</strong>
					</span>
				`).join('');

				let d = new frappe.ui.Dialog({
					title: __('Customer History: {0}', [customerName]),
					fields: [
						{
							fieldname: 'summary_html',
							fieldtype: 'HTML'
						}
					]
				});

				d.get_field('summary_html').$wrapper.html(`
					<div style="padding: 0.5rem 0;">
						<div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
							<div style="flex: 1; background: #f8fafc; padding: 0.75rem; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
								<div style="font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 600;">${__("Total Spent")}</div>
								<div style="font-size: 1.25rem; font-weight: 700; color: #059669;">${history.formatted_total_spent}</div>
							</div>
							<div style="flex: 1; background: #f8fafc; padding: 0.75rem; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
								<div style="font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 600;">${__("Total Orders")}</div>
								<div style="font-size: 1.25rem; font-weight: 700; color: #0f172a;">${history.total_orders}</div>
							</div>
							<div style="flex: 1; background: #f8fafc; padding: 0.75rem; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
								<div style="font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 600;">${__("Total Visits")}</div>
								<div style="font-size: 1.25rem; font-weight: 700; color: #4f46e5;">${history.customer.total_visits || 1}</div>
							</div>
						</div>

						${favoritesHtml ? `
							<div style="margin-bottom: 1rem;">
								<div style="font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 600; margin-bottom: 0.4rem;">
									${__("Favorite Dishes")}
								</div>
								<div>${favoritesHtml}</div>
							</div>
						` : ''}

						<div style="font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 600; margin-bottom: 0.4rem;">
							${__("Order History")}
						</div>
						<div style="max-height: 240px; overflow-y: auto;">
							${ordersHtml || `<div class="text-muted text-center" style="padding: 1rem;">${__("No previous orders found.")}</div>`}
						</div>
					</div>
				`);
				d.show();
			}
		});
	}

	open_reports_dialog() {
		let d = new frappe.ui.Dialog({
			title: __('Restaurant Reports & Audits'),
			fields: [
				{
					fieldname: 'reports_html',
					fieldtype: 'HTML'
				}
			]
		});

		d.get_field('reports_html').$wrapper.html(`
			<div style="display: flex; flex-direction: column; gap: 0.75rem; padding: 0.5rem 0;">
				<div class="rm-report-link-card" onclick="frappe.set_route('query-report', 'POS Register');" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1.1rem; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff; transition: all 0.15s ease;">
					<div style="display: flex; align-items: center; gap: 0.85rem;">
						<div style="width: 38px; height: 38px; border-radius: 8px; background: #ede9fe; color: #6d28d9; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">
							<i class="fa fa-book"></i>
						</div>
						<div>
							<strong style="color: #0f172a; font-size: 0.95rem;">${__("POS Register Report")}</strong>
							<div style="font-size: 0.8rem; color: #64748b;">${__("Official cashier register and reconciled daily sales")}</div>
						</div>
					</div>
					<i class="fa fa-chevron-right text-muted"></i>
				</div>

				<div class="rm-report-link-card" onclick="frappe.set_route('restaurant-billing-payments');" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1.1rem; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff; transition: all 0.15s ease;">
					<div style="display: flex; align-items: center; gap: 0.85rem;">
						<div style="width: 38px; height: 38px; border-radius: 8px; background: #d1fae5; color: #059669; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">
							<i class="fa fa-money"></i>
						</div>
						<div>
							<strong style="color: #0f172a; font-size: 0.95rem;">${__("Billing & Invoicing Ledger")}</strong>
							<div style="font-size: 0.8rem; color: #64748b;">${__("Breakdown by Cash, UPI, and Card transactions")}</div>
						</div>
					</div>
					<i class="fa fa-chevron-right text-muted"></i>
				</div>

				<div class="rm-report-link-card" onclick="frappe.set_route('restaurant-management');" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1.1rem; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff; transition: all 0.15s ease;">
					<div style="display: flex; align-items: center; gap: 0.85rem;">
						<div style="width: 38px; height: 38px; border-radius: 8px; background: #e0f2fe; color: #0284c7; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">
							<i class="fa fa-th"></i>
						</div>
						<div>
							<strong style="color: #0f172a; font-size: 0.95rem;">${__("Restaurant Workspace Hub")}</strong>
							<div style="font-size: 0.8rem; color: #64748b;">${__("System shortcuts, master doctypes, and analytics")}</div>
						</div>
					</div>
					<i class="fa fa-chevron-right text-muted"></i>
				</div>
			</div>
		`);
		d.show();
	}

	refresh() {
		this.fetch_data();
	}

	fetch_data(silent = false, onComplete = null) {
		let me = this;
		frappe.call({
			method: 'restaurant_management.restaurant_management.page.restaurant_dashboard.restaurant_dashboard.get_dashboard_data',
			callback: function (r) {
				if (r.message) {
					me.cached_data = r.message;
					me.render_dashboard(r.message);
				}
				if (onComplete) onComplete();
			},
			error: function (err) {
				if (!silent) {
					frappe.msgprint(__('Failed to load Restaurant Dashboard data.'));
				}
				console.error(err);
				if (onComplete) onComplete();
			}
		});
	}

	render_dashboard(data) {
		this.container.find('#dash-last-updated').text(frappe.datetime.now_time());
		this.container.find('#dash-current-date').text(this.get_formatted_today_date());

		// Restaurant Info
		if (data.restaurant_info) {
			$('#dash-restaurant-name').text(data.restaurant_info.name || 'IZEN BISTRO');
			if (data.restaurant_info.subtitle) {
				$('#dash-restaurant-subtitle').text(data.restaurant_info.subtitle);
			}
			if (data.restaurant_info.location) {
				$('#dash-restaurant-location .location-text').text(data.restaurant_info.location);
			}
		}

		this.render_kpis(data.kpis);
		this.render_sales_chart(data.sales_analytics);
		this.render_table_status(data.table_status);
		this.render_kitchen_queue(data.kitchen_queue);
		this.render_popular_dishes(data.popular_dishes);
		this.render_recent_orders(data.recent_orders);
	}

	render_kpis(kpis) {
		if (!kpis) return;
		// 1. Today's Revenue
		$('#kpi-today-revenue').text(kpis.formatted_revenue || '₹0');
		const growthVal = kpis.revenue_growth;
		const $growthBadge = $('#kpi-revenue-growth');
		if ($growthBadge.length) {
			$growthBadge.removeClass('badge-positive badge-negative badge-neutral');
			if (growthVal === null || growthVal === undefined || growthVal === '') {
				$growthBadge.text('--').addClass('badge-neutral');
			} else {
				$growthBadge.text(growthVal);
				const strGrowth = String(growthVal);
				if (strGrowth.startsWith('+')) {
					$growthBadge.addClass('badge-positive');
				} else if (strGrowth.startsWith('-')) {
					$growthBadge.addClass('badge-negative');
				} else {
					$growthBadge.addClass('badge-neutral');
				}
			}
		}

		// 2. Today's Orders
		$('#kpi-today-orders').text(kpis.today_orders || kpis.total_orders || 0);
		$('#kpi-completed-orders').text(`${kpis.completed_orders || 0} ${__('served')}`);

		// 3. Active Orders
		$('#kpi-active-orders').text(kpis.active_orders || 0);

		// 4. Active Tables
		$('#kpi-active-tables').text(kpis.active_tables !== undefined ? kpis.active_tables : 0);
		$('#kpi-occupancy-rate').text(kpis.occupancy_rate || '--');

		// 5. Available Tables
		$('#kpi-available-tables').text(kpis.available_tables !== undefined ? kpis.available_tables : 0);
		$('#kpi-available-display').text(`${kpis.available_tables || 0} / ${kpis.total_tables || 20} ${__('free')}`);

		// 6. Pending Kitchen Orders
		$('#kpi-kitchen-orders').text(kpis.pending_kitchen_orders || 0);
		$('#kpi-avg-prep-time').text(kpis.avg_prep_time || '14 mins');

		// 7. Paid Bills
		$('#kpi-paid-bills').text(kpis.paid_bills !== undefined ? kpis.paid_bills : 0);

		// 8. Pending Payments
		$('#kpi-pending-payments').text(kpis.pending_payments !== undefined ? kpis.pending_payments : 0);
	}

	render_sales_chart(sales) {
		if (!sales) return;
		$('#sales-weekly-total').text(`${sales.formatted_weekly_revenue || '₹0'} ${__("Total")}`);

		const chart_container = document.getElementById('rm-sales-chart');
		if (!chart_container) return;
		$(chart_container).empty();

		this.sales_chart = new frappe.Chart(chart_container, {
			data: {
				labels: sales.labels,
				datasets: sales.datasets
			},
			type: 'bar',
			height: 260,
			colors: ['#4f46e5'],
			axisOptions: {
				xIsSeries: true,
				shortenYAxisNumbers: 1
			},
			tooltipOptions: {
				formatTooltipY: function (d) {
					return '₹' + Number(d).toLocaleString('en-IN');
				}
			}
		});
	}

	render_table_status(table_status) {
		if (!table_status) return;
		$('#tables-total-badge').html(`${table_status.total || 20} ${__("Tables")} &bull; ${__("Floor Plan")} <i class="fa fa-arrow-right"></i>`);

		// Render donut chart
		const chart_container = document.getElementById('rm-table-chart');
		if (chart_container) {
			$(chart_container).empty();

			let labels = [];
			let values = [];
			let colors = [];

			(table_status.breakdown || []).forEach(item => {
				labels.push(item.status);
				values.push(item.count);
				colors.push(item.color);
			});

			this.table_chart = new frappe.Chart(chart_container, {
				data: {
					labels: labels,
					datasets: [{ values: values }]
				},
				type: 'donut',
				height: 170,
				colors: colors,
				tooltipOptions: {
					formatTooltipY: function (d) {
						return d + ' ' + __('Tables');
					}
				}
			});
		}

		// Render table meters
		let $meters = $('#rm-table-meters').empty();
		(table_status.breakdown || []).forEach(item => {
			$(`
				<div class="rm-table-meter meter-${item.class}">
					<div class="rm-table-meter-count" style="color: ${item.color}">${item.count}</div>
					<div class="rm-table-meter-label">${item.status}</div>
					<div class="rm-table-meter-pct">${item.percentage}</div>
				</div>
			`).appendTo($meters);
		});

		// Render floor zones breakdown
		let $zones = $('#rm-zones-list').empty();
		$(`
			<div style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.35rem; display: flex; justify-content: space-between;">
				<span>${__("Floor Sections Breakdown")}</span>
				<span>${__("Occupancy")}</span>
			</div>
		`).appendTo($zones);

		(table_status.zones || []).forEach(zone => {
			let occupied = zone.occupied || 0;
			let total = zone.total || 1;
			let pct = Math.round((occupied / total) * 100);
			$(`
				<div class="rm-zone-item">
					<div class="rm-zone-info">
						<span class="rm-zone-name">${zone.name}</span>
						<span class="rm-zone-occupancy">${occupied} / ${total} ${__("tables")} (${pct}%)</span>
					</div>
					<div class="rm-zone-progress">
						<div class="rm-zone-progress-bar" style="width: ${pct}%"></div>
					</div>
				</div>
			`).appendTo($zones);
		});
	}

	render_kitchen_queue(queue) {
		let $container = $('#rm-kitchen-queue-list').empty();
		if (!queue || !queue.length) {
			$(`
				<div class="text-center text-muted" style="padding: 2.5rem 1rem;">
					<i class="fa fa-check-circle" style="font-size: 2rem; color: #10b981; margin-bottom: 0.5rem; display: block;"></i>
					${__("Kitchen queue is all caught up! No pending orders.")}
				</div>
			`).appendTo($container);
			return;
		}

		let html = queue.map(q => `
			<div class="rm-kitchen-ticket">
				<div class="rm-kt-header">
					<div class="rm-kt-id-table">
						<span class="rm-kt-id">${q.order_id}</span>
						<span class="rm-kt-table">${q.table}</span>
						<span class="rm-kt-area">${q.area}</span>
					</div>
					<div class="rm-kt-time-status">
						<span class="rm-kt-time"><i class="fa fa-clock-o"></i> ${q.time_ago}</span>
						<span class="rm-status-badge ${q.badge_class || 'badge-preparing'}">${q.status}</span>
					</div>
				</div>
				<div class="rm-kt-items">
					${q.items_summary}
				</div>
			</div>
		`).join('');

		$(`
			<div class="rm-kitchen-queue-scroll">
				${html}
			</div>
		`).appendTo($container);
	}

	render_popular_dishes(dishes) {
		let $list = $('#rm-dishes-list').empty();
		if (!dishes || !dishes.length) {
			$(`
				<div class="text-center text-muted" style="padding: 2rem;">
					${__("No dishes data recorded today.")}
				</div>
			`).appendTo($list);
			return;
		}

		dishes.forEach(dish => {
			$(`
				<div class="rm-dish-item">
					<div class="rm-dish-row">
						<div class="rm-dish-info">
							<div class="rm-dish-rank rank-${dish.rank}">${dish.rank}</div>
							<div class="rm-dish-details">
								<span class="rm-dish-name">${dish.name}</span>
								<span class="rm-dish-category">${dish.category}</span>
							</div>
						</div>
						<div class="rm-dish-metrics">
							<div class="rm-dish-revenue">${dish.formatted_revenue}</div>
							<div class="rm-dish-orders">${dish.orders} ${__("orders")}</div>
						</div>
					</div>
					<div class="rm-dish-progress">
						<div class="rm-dish-progress-bar" style="width: ${Math.min(100, Math.max(8, (dish.share_percentage || 0) * 2.5))}%"></div>
					</div>
				</div>
			`).appendTo($list);
		});
	}

	render_recent_orders(orders) {
		let $tbody = $('#rm-orders-tbody').empty();
		if (!orders || !orders.length) {
			$(`
				<tr>
					<td colspan="7" class="text-center text-muted" style="padding: 2rem;">
						${__("No recent orders recorded.")}
					</td>
				</tr>
			`).appendTo($tbody);
			return;
		}

		orders.forEach(order => {
			let paymentBadgeClass = (order.payment_status === 'Paid') ? 'badge-positive' : 'badge-neutral';
			$(`
				<tr>
					<td>
						<strong class="rm-order-id">${order.order_id}</strong>
					</td>
					<td>
						<span class="rm-order-table-badge">${order.table}</span>
						<span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 0.35rem;">${order.section || ''}</span>
					</td>
					<td>
						<div style="font-weight: 500;">${order.customer}</div>
						${order.customer_mobile ? `<div style="font-size: 0.72rem; color: #64748b; font-family: monospace;">${order.customer_mobile}</div>` : ''}
					</td>
					<td>
						<span class="rm-order-amount">${order.formatted_amount}</span>
						<span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 0.25rem;">(${order.items} ${__("items")})</span>
					</td>
					<td>
						<span class="rm-status-badge ${order.badge_class || 'badge-preparing'}">
							${__(order.status)}
						</span>
					</td>
					<td>
						<span class="rm-kpi-badge ${paymentBadgeClass}" style="font-size: 0.72rem; text-transform: uppercase;">
							${__(order.payment_status || 'Unpaid')}
						</span>
					</td>
					<td>
						<span class="rm-order-time">${order.time_ago}</span>
					</td>
				</tr>
			`).appendTo($tbody);
		});
	}
}
