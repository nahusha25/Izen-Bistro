// Copyright (c) 2026, Nahusha and contributors
// For license information, please see license.txt

frappe.pages['restaurant-customers'].on_page_load = function (wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __('Customers — Izen Bistro'),
		single_column: true
	});

	frappe.breadcrumbs.add('Restaurant Management');

	page.set_primary_action(__('Register New Customer'), function () {
		if (wrapper.customers_page) {
			wrapper.customers_page.open_register_dialog();
		}
	}, 'fa fa-user-plus');

	page.add_button(__('Refresh'), function () {
		if (wrapper.customers_page) {
			wrapper.customers_page.fetch_data();
		}
	}, 'fa fa-refresh');

	wrapper.customers_page = new RestaurantCustomersPage(wrapper, page);
};

frappe.pages['restaurant-customers'].on_page_show = function (wrapper) {
	if (wrapper.customers_page) {
		wrapper.customers_page.fetch_data();
	}
};

class RestaurantCustomersPage {
	constructor(wrapper, page) {
		this.wrapper = wrapper;
		this.page = page;
		this.customers_data = null;
		this.active_filter = 'all';

		this.init();
	}

	init() {
		this.render_skeleton();
		this.bind_events();
		this.fetch_data();
	}

	render_skeleton() {
		this.page.main.empty();
		this.container = $(`
			<div class="restaurant-customers-wrapper">
				<!-- Branded Header -->
				<header class="rc-brand-header">
					<div class="rc-brand-left">
						<div class="rc-brand-logo-frame">
							<span class="rc-monogram">IB</span>
						</div>
						<div class="rc-brand-meta">
							<div class="rc-brand-title-row">
								<h1 class="rc-brand-name">IZEN BISTRO</h1>
								<span class="rc-badge-pill">
									<i class="fa fa-users"></i> ${__("Customer Directory")}
								</span>
							</div>
							<p class="rc-brand-subtitle">${__("Centralized Guest Registry, Dining History & Loyalty")}</p>
							<div class="rc-brand-location">
								<i class="fa fa-map-marker text-danger"></i>
								<span>${__("Nagarbhavi, Bengaluru, Karnataka")}</span>
							</div>
						</div>
					</div>

					<div class="rc-brand-right">
						<div class="rc-header-chips">
							<div class="rc-info-chip">
								<i class="fa fa-clock-o text-muted"></i>
								<span>${__("Updated")} <strong class="rc-last-updated">${frappe.datetime.now_time()}</strong></span>
							</div>
							<button type="button" class="btn btn-sm btn-default btn-rc-refresh" id="btn-rc-refresh">
								<i class="fa fa-refresh"></i> ${__("Refresh")}
							</button>
						</div>
					</div>
				</header>

				<!-- KPI Metrics Grid -->
				<div class="rc-kpi-grid">
					<div class="rc-kpi-card kpi-total">
						<div class="rc-kpi-header">
							<span class="rc-kpi-title">${__("Total Registered Guests")}</span>
							<div class="rc-kpi-icon"><i class="fa fa-users"></i></div>
						</div>
						<div class="rc-kpi-value" id="kpi-total-customers">0</div>
						<div class="rc-kpi-footer">
							<span class="rc-kpi-badge badge-positive" id="kpi-repeat-count">--</span>
							<span>${__("repeat diners")}</span>
						</div>
					</div>

					<div class="rc-kpi-card kpi-repeat">
						<div class="rc-kpi-header">
							<span class="rc-kpi-title">${__("Repeat Guests")}</span>
							<div class="rc-kpi-icon"><i class="fa fa-heart"></i></div>
						</div>
						<div class="rc-kpi-value" id="kpi-repeat-guests">0</div>
						<div class="rc-kpi-footer">
							<span class="rc-kpi-badge badge-neutral" id="kpi-repeat-rate">--</span>
							<span>${__("loyalty retention")}</span>
						</div>
					</div>

					<div class="rc-kpi-card kpi-visits">
						<div class="rc-kpi-header">
							<span class="rc-kpi-title">${__("Total Guest Visits")}</span>
							<div class="rc-kpi-icon"><i class="fa fa-calendar-check-o"></i></div>
						</div>
						<div class="rc-kpi-value" id="kpi-total-visits">0</div>
						<div class="rc-kpi-footer">
							<span class="rc-kpi-badge badge-neutral">${__("Recorded visits")}</span>
							<span>${__("across all tables")}</span>
						</div>
					</div>

					<div class="rc-kpi-card kpi-spend">
						<div class="rc-kpi-header">
							<span class="rc-kpi-title">${__("Total Customer Spending")}</span>
							<div class="rc-kpi-icon"><i class="fa fa-inr"></i></div>
						</div>
						<div class="rc-kpi-value" id="kpi-total-spent">₹0</div>
						<div class="rc-kpi-footer">
							<span class="rc-kpi-badge badge-positive" id="kpi-avg-spend">--</span>
							<span>${__("average spend / guest")}</span>
						</div>
					</div>
				</div>

				<!-- Search, Filter & Action Bar -->
				<div class="rc-toolbar-card">
					<div class="rc-search-box">
						<i class="fa fa-search rc-search-icon"></i>
						<input type="text" class="form-control rc-search-input" id="rc-search-input" placeholder="${__('Search customer by name, mobile number, or ID...')}">
						<button type="button" class="btn btn-sm btn-link rc-clear-search" id="rc-clear-search" style="display: none;">
							<i class="fa fa-times"></i>
						</button>
					</div>

					<div class="rc-filter-chips">
						<button type="button" class="rc-chip active" data-filter="all">${__("All Guests")}</button>
						<button type="button" class="rc-chip" data-filter="repeat">${__("Repeat (>1 Visit)")}</button>
						<button type="button" class="rc-chip" data-filter="spenders">${__("Top Spenders")}</button>
					</div>
				</div>

				<!-- Customer Records Table Card -->
				<div class="rc-table-card">
					<div class="rc-table-header">
						<div class="rc-table-title-area">
							<h3 class="rc-table-title"><i class="fa fa-address-book-o text-primary"></i> ${__("Customer Registry")}</h3>
							<span class="rc-count-badge" id="rc-result-count">0 ${__("guests")}</span>
						</div>
						<button type="button" class="btn btn-sm btn-primary rc-btn-add-customer" id="rc-btn-add-customer">
							<i class="fa fa-plus"></i> ${__("Add Guest")}
						</button>
					</div>

					<div class="rc-table-responsive">
						<table class="rc-customers-table">
							<thead>
								<tr>
									<th>${__("Customer ID")}</th>
									<th>${__("Guest Name")}</th>
									<th>${__("Mobile Number")}</th>
									<th>${__("Visits")}</th>
									<th>${__("Total Spent")}</th>
									<th>${__("Last Visit")}</th>
									<th class="text-right">${__("Actions")}</th>
								</tr>
							</thead>
							<tbody id="rc-table-tbody">
								<tr>
									<td colspan="7" class="text-center text-muted" style="padding: 2.5rem;">
										<i class="fa fa-spinner fa-spin"></i> ${__("Loading customer records...")}
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>
			</div>
		`).appendTo(this.page.main);
	}

	bind_events() {
		let me = this;

		// Search input
		this.container.on('input', '#rc-search-input', function () {
			let val = $(this).val().trim();
			$('#rc-clear-search').toggle(Boolean(val));
			me.filter_and_render();
		});

		this.container.on('click', '#rc-clear-search', function () {
			$('#rc-search-input').val('');
			$(this).hide();
			me.filter_and_render();
		});

		// Filter chips
		this.container.on('click', '.rc-chip', function () {
			$('.rc-chip').removeClass('active');
			$(this).addClass('active');
			me.active_filter = $(this).data('filter');
			me.filter_and_render();
		});

		// Refresh button
		this.container.on('click', '#btn-rc-refresh', function () {
			let $btn = $(this);
			$btn.prop('disabled', true).find('i').addClass('fa-spin');
			me.fetch_data(() => {
				$btn.prop('disabled', false).find('i').removeClass('fa-spin');
			});
		});

		// Add customer
		this.container.on('click', '#rc-btn-add-customer', function () {
			me.open_register_dialog();
		});

		// Table Actions
		this.container.on('click', '.btn-view-customer-history', function () {
			let cid = $(this).data('id');
			let cname = $(this).data('name');
			me.view_customer_history(cid, cname);
		});

		this.container.on('click', '.btn-seat-guest', function () {
			frappe.set_route('restaurant-floor-management');
		});
	}

	fetch_data(callback) {
		let me = this;
		frappe.call({
			method: 'restaurant_management.restaurant_management.page.restaurant_customers.restaurant_customers.get_customers_data',
			callback: function (r) {
				if (r.message) {
					me.customers_data = r.message;
					me.render_kpis(r.message.kpis);
					me.filter_and_render();
				}
				if (callback) callback();
			},
			error: function (err) {
				frappe.msgprint(__('Failed to load Customer data.'));
				console.error(err);
				if (callback) callback();
			}
		});
	}

	render_kpis(kpis) {
		if (!kpis) return;
		$('#kpi-total-customers').text(kpis.total_customers || 0);
		$('#kpi-repeat-count').text(`${kpis.repeat_guests || 0}`);
		$('#kpi-repeat-guests').text(kpis.repeat_guests || 0);

		let rate = (kpis.total_customers > 0) ? Math.round((kpis.repeat_guests / kpis.total_customers) * 100) : 0;
		$('#kpi-repeat-rate').text(`${rate}%`);

		$('#kpi-total-visits').text(kpis.total_visits || 0);
		$('#kpi-total-spent').text(kpis.formatted_total_spent || '₹0');
		$('#kpi-avg-spend').text(kpis.formatted_avg_spend || '₹0');
		$('.rc-last-updated').text(frappe.datetime.now_time());
	}

	filter_and_render() {
		if (!this.customers_data) return;

		let search = ($('#rc-search-input').val() || '').toLowerCase().trim();
		let list = (this.customers_data.customers || []).slice();

		// Apply Search
		if (search) {
			list = list.filter(c => {
				let nameMatch = (c.name || '').toLowerCase().includes(search);
				let mobMatch = (c.mobile || '').includes(search);
				let idMatch = (c.customer_id || '').toLowerCase().includes(search);
				return nameMatch || mobMatch || idMatch;
			});
		}

		// Apply Category Filter
		if (this.active_filter === 'repeat') {
			list = list.filter(c => (c.total_visits || 1) > 1);
		} else if (this.active_filter === 'spenders') {
			list = list.filter(c => (c.total_spent || 0) > 0);
			list.sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0));
		}

		$('#rc-result-count').text(`${list.length} ${__("guests")}`);
		this.render_table(list);
	}

	render_table(list) {
		let $tbody = $('#rc-table-tbody').empty();
		if (!list || !list.length) {
			$(`
				<tr>
					<td colspan="7" class="text-center text-muted" style="padding: 3rem 1rem;">
						<i class="fa fa-user-times" style="font-size: 2.2rem; display: block; margin-bottom: 0.5rem; opacity: 0.4;"></i>
						${__("No matching customer records found.")}
					</td>
				</tr>
			`).appendTo($tbody);
			return;
		}

		list.forEach(c => {
			let initials = (c.name || 'G').split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase();
			$(`
				<tr>
					<td>
						<strong class="rc-cust-id">${c.customer_id}</strong>
					</td>
					<td>
						<div class="rc-user-cell">
							<span class="rc-user-avatar">${initials}</span>
							<span class="rc-user-name">${frappe.utils.escape_html(c.name)}</span>
						</div>
					</td>
					<td>
						<span class="rc-mobile-num">${c.mobile}</span>
					</td>
					<td>
						<span class="rc-visit-badge ${c.total_visits > 1 ? 'repeat' : ''}">
							${c.total_visits} ${c.total_visits === 1 ? __('visit') : __('visits')}
						</span>
					</td>
					<td>
						<strong class="rc-spent-amount">${c.formatted_spent}</strong>
					</td>
					<td>
						<span class="rc-last-visit">${c.last_visit || '--'}</span>
					</td>
					<td class="text-right">
						<button type="button" class="btn btn-xs btn-default btn-view-customer-history" data-id="${c.customer_id}" data-name="${frappe.utils.escape_html(c.name)}" title="${__('View Order History')}">
							<i class="fa fa-history"></i> ${__("History")}
						</button>
						<button type="button" class="btn btn-xs btn-primary btn-seat-guest" title="${__('Seat Guest on Floor')}">
							<i class="fa fa-cutlery"></i> ${__("Seat")}
						</button>
					</td>
				</tr>
			`).appendTo($tbody);
		});
	}

	open_register_dialog() {
		let me = this;
		let d = new frappe.ui.Dialog({
			title: __('Register New Guest — Izen Bistro'),
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
					method: 'restaurant_management.restaurant_management.page.restaurant_customers.restaurant_customers.register_customer',
					args: {
						name: values.name,
						mobile: values.mobile
					},
					callback: function (r) {
						if (r.message) {
							frappe.show_alert({
								message: __('Guest {0} registered successfully!', [r.message.name]),
								indicator: 'green'
							});
							d.hide();
							me.fetch_data();
						}
					}
				});
			}
		});
		d.show();
	}

	view_customer_history(customerId, customerName) {
		frappe.call({
			method: 'restaurant_management.restaurant_management.page.restaurant_customers.restaurant_customers.get_customer_history',
			args: { customer_id_or_mobile: customerId },
			callback: function (r) {
				let history = r.message;
				if (!history) return;

				let ordersHtml = (history.orders || []).map(o => `
					<div style="display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 0; border-bottom: 1px solid #f1f5f9;">
						<div>
							<strong style="color: #0f172a;">${o.order_id}</strong>
							<span style="margin-left: 0.5rem; font-size: 0.8rem; color: #64748b;">Table ${o.table_no}</span>
							<div style="font-size: 0.78rem; color: #64748b; margin-top: 0.15rem;">
								${(o.items || []).map(i => i.qty + 'x ' + i.name).join(', ')}
							</div>
						</div>
						<div style="text-align: right;">
							<div style="font-weight: 700; color: #0f172a;">${o.formatted_amount}</div>
							<span class="rc-badge-pill" style="font-size: 0.7rem; background: #f1f5f9; color: #475569;">${o.status}</span>
						</div>
					</div>
				`).join('');

				let favoritesHtml = (history.favorite_dishes || []).map(f => `
					<span class="badge badge-light" style="margin-right: 0.35rem; margin-bottom: 0.35rem; padding: 0.35rem 0.6rem; border: 1px solid #e2e8f0;">
						${f.name} <strong style="color: #4f46e5;">(${f.count})</strong>
					</span>
				`).join('');

				let d = new frappe.ui.Dialog({
					title: __('Dining History: {0}', [customerName]),
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
								<div style="font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 600;">${__("Orders")}</div>
								<div style="font-size: 1.25rem; font-weight: 700; color: #0f172a;">${history.total_orders}</div>
							</div>
							<div style="flex: 1; background: #f8fafc; padding: 0.75rem; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
								<div style="font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 600;">${__("Visits")}</div>
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
							${__("Dining Tickets")}
						</div>
						<div style="max-height: 240px; overflow-y: auto;">
							${ordersHtml || `<div class="text-muted text-center" style="padding: 1.5rem;">${__("No previous dining orders.")}</div>`}
						</div>
					</div>
				`);
				d.show();
			}
		});
	}
}

