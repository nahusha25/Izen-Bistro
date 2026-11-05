// Copyright (c) 2026, Nahusha and contributors
// For license information, please see license.txt

frappe.pages['restaurant-order-management'].on_page_load = function (wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __('Order Management'),
		single_column: true
	});

	frappe.breadcrumbs.add('Restaurant Management');

	// Primary Action: New Order (POS)
	page.set_primary_action(__('New Order (POS)'), function () {
		let mgr = wrapper.order_mgmt || (page.wrapper && page.wrapper.order_mgmt) || window.restaurant_order_mgmt;
		if (mgr && typeof mgr.open_new_order_dialog === 'function') {
			mgr.open_new_order_dialog();
		} else if (frappe.restaurant && typeof frappe.restaurant.open_pos_dialog === 'function') {
			frappe.restaurant.open_pos_dialog({
				on_success: function () {
					if (mgr) mgr.fetch_data();
				}
			});
		}
	}, 'fa fa-plus');

	// Secondary Action: Refresh
	page.add_button(__('Refresh'), function () {
		if (wrapper.order_mgmt) {
			wrapper.order_mgmt.fetch_data();
		}
	}, 'fa fa-refresh');

	// Menu Action: Reset Demo Orders
	page.add_menu_item(__('Reset Demo Orders'), function () {
		frappe.confirm(
			__('Are you sure you want to reset all orders and table statuses back to baseline?'),
			function () {
				frappe.call({
					method: 'restaurant_management.restaurant_management.page.restaurant_order_management.restaurant_order_management.reset_demo_data',
					callback: function (r) {
						if (r.message && wrapper.order_mgmt) {
							wrapper.order_mgmt.data = r.message;
							wrapper.order_mgmt.render_all();
							frappe.show_alert({
								message: __('Orders reset to baseline.'),
								indicator: 'green'
							});
						}
					}
				});
			}
		);
	});

	wrapper.order_mgmt = new OrderManagement(wrapper, page);
};

frappe.pages['restaurant-order-management'].on_page_show = function (wrapper) {
	let mgr = wrapper.order_mgmt || (wrapper.page && wrapper.page.order_mgmt) || window.restaurant_order_mgmt;
	if (mgr) {
		mgr.fetch_data();
	}
	let route = frappe.get_route();
	if (route && (route[1] === 'new-order' || route[1] === 'new' || route[1] === 'pos')) {
		let preselectedTable = route[2] || null;
		frappe.set_route('restaurant-order-management');
		setTimeout(() => {
			let currentMgr = wrapper.order_mgmt || window.restaurant_order_mgmt;
			if (currentMgr && typeof currentMgr.open_new_order_dialog === 'function') {
				currentMgr.open_new_order_dialog(preselectedTable);
			} else if (frappe.restaurant && typeof frappe.restaurant.open_pos_dialog === 'function') {
				frappe.restaurant.open_pos_dialog({
					target_table_no: preselectedTable,
					on_success: function () {
						if (currentMgr) currentMgr.fetch_data();
					}
				});
			}
		}, 150);
	}
};

class OrderManagement {
	constructor(wrapper, page) {
		this.wrapper = wrapper;
		this.page = page;
		window.restaurant_order_mgmt = this;
		wrapper.order_mgmt = this;
		if (page && page.wrapper) page.wrapper.order_mgmt = this;
		this.data = null;
		this.current_status = 'All';
		this.current_area = 'All Areas';
		this.search_query = '';
		this.search_timer = null;

		// Draft cart state for New Order modal
		this.cart = [];
		this.selected_table = null;
		this.selected_category = 'All';
		this.modal_dish_search = '';

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
			<div class="order-management-wrapper">
				<!-- Header with Live System Indicator -->
				<div class="order-header">
					<p class="order-subtitle">
						<span class="live-indicator-pill">
							<span class="pulse-dot"></span>
							${__('Live Order Dispatch')}
						</span>
						${__('Real-time order workflow, kitchen synchronization & table billing')}
					</p>
					<div>
						<span class="text-muted" style="font-size: 0.8rem;">
							<i class="fa fa-clock-o"></i> ${__('Last updated:')} <span class="order-last-updated">${frappe.datetime.now_time()}</span>
						</span>
					</div>
				</div>

				<!-- Top Summary KPI Grid -->
				<div class="order-kpi-grid">
					<div class="order-kpi-card kpi-active">
						<div class="order-kpi-header">
							<span class="order-kpi-title">${__('Active Orders')}</span>
							<div class="order-kpi-icon"><i class="fa fa-fire"></i></div>
						</div>
						<div class="order-kpi-value" id="kpi-order-active">--</div>
						<div class="order-kpi-footer">
							<span>${__('in prep, ready, or served')}</span>
						</div>
					</div>

					<div class="order-kpi-card kpi-today">
						<div class="order-kpi-header">
							<span class="order-kpi-title">${__('Today\'s Orders')}</span>
							<div class="order-kpi-icon"><i class="fa fa-list-alt"></i></div>
						</div>
						<div class="order-kpi-value" id="kpi-order-today">--</div>
						<div class="order-kpi-footer">
							<span>${__('total tickets logged today')}</span>
						</div>
					</div>

					<div class="order-kpi-card kpi-kitchen">
						<div class="order-kpi-header">
							<span class="order-kpi-title">${__('Pending Kitchen')}</span>
							<div class="order-kpi-icon"><i class="fa fa-clock-o"></i></div>
						</div>
						<div class="order-kpi-value" id="kpi-order-kitchen">--</div>
						<div class="order-kpi-footer">
							<span>${__('orders in preparation')}</span>
						</div>
					</div>

					<div class="order-kpi-card kpi-revenue">
						<div class="order-kpi-header">
							<span class="order-kpi-title">${__('Recorded Revenue')}</span>
							<div class="order-kpi-icon"><i class="fa fa-inr"></i></div>
						</div>
						<div class="order-kpi-value" id="kpi-order-revenue">--</div>
						<div class="order-kpi-footer">
							<span>${__('from settled paid orders')}</span>
						</div>
					</div>
				</div>

				<!-- Controls & Filter Panel -->
				<div class="order-controls-panel">
					<div class="order-search-action-row">
						<div class="order-search-box">
							<i class="fa fa-search"></i>
							<input type="text" class="order-search-input" id="order-search-input" placeholder="${__('Search Order ID, Table, Customer, or Dish...')}" />
						</div>

						<div class="order-actions-group">
							<select class="order-select-filter" id="order-area-filter">
								<option value="All Areas">${__('All Dining Areas')}</option>
								<option value="Main Dining Hall">${__('Main Dining Hall')}</option>
								<option value="Garden Patio">${__('Garden Patio')}</option>
								<option value="Rooftop Terrace">${__('Rooftop Terrace')}</option>
							</select>

							<button type="button" class="order-btn-primary btn-trigger-new-order">
								<i class="fa fa-plus"></i> ${__('New Order')}
							</button>
						</div>
					</div>

					<!-- Status Tabs -->
					<div class="order-status-tabs" id="order-status-tabs">
						<button type="button" class="status-tab-btn active" data-status="All">
							${__('All')} <span class="tab-count-badge">0</span>
						</button>
						<button type="button" class="status-tab-btn" data-status="Confirmed">
							${__('Confirmed')} <span class="tab-count-badge">0</span>
						</button>
						<button type="button" class="status-tab-btn" data-status="Preparing">
							${__('Preparing')} <span class="tab-count-badge">0</span>
						</button>
						<button type="button" class="status-tab-btn" data-status="Ready">
							${__('Ready')} <span class="tab-count-badge">0</span>
						</button>
						<button type="button" class="status-tab-btn" data-status="Served">
							${__('Served')} <span class="tab-count-badge">0</span>
						</button>
						<button type="button" class="status-tab-btn" data-status="Billed">
							${__('Billed')} <span class="tab-count-badge">0</span>
						</button>
						<button type="button" class="status-tab-btn" data-status="Paid">
							${__('Paid')} <span class="tab-count-badge">0</span>
						</button>
						<button type="button" class="status-tab-btn" data-status="Cancelled">
							${__('Cancelled')} <span class="tab-count-badge">0</span>
						</button>
					</div>
				</div>

				<!-- Orders Grid -->
				<div class="orders-cards-grid" id="orders-cards-grid">
					<div class="order-empty-state">
						<i class="fa fa-spinner fa-spin fa-2x"></i>
						<p>${__('Loading restaurant orders from centralized store...')}</p>
					</div>
				</div>
			</div>
		`).appendTo(this.page.main);
	}

	bind_events() {
		let me = this;

		// 1. Status Tabs Click
		this.container.on('click', '.status-tab-btn', function () {
			let st = $(this).data('status');
			me.container.find('.status-tab-btn').removeClass('active');
			$(this).addClass('active');
			me.current_status = st;
			me.fetch_data();
		});

		// 2. Search Input with Debounce
		this.container.on('input', '#order-search-input', function () {
			clearTimeout(me.search_timer);
			let query = $(this).val();
			me.search_timer = setTimeout(() => {
				me.search_query = query;
				me.fetch_data();
			}, 250);
		});

		// 3. Area Filter Change
		this.container.on('change', '#order-area-filter', function () {
			me.current_area = $(this).val();
			me.fetch_data();
		});

		// 4. Trigger New Order
		this.container.on('click', '.btn-trigger-new-order', function (e) {
			e.preventDefault();
			me.open_new_order_dialog();
		});

		// Document level fail-safe for New Order button
		$(document).off('click.btn_trigger_new_order').on('click.btn_trigger_new_order', '.btn-trigger-new-order', function (e) {
			e.preventDefault();
			let mgr = (wrapper && wrapper.order_mgmt) || window.restaurant_order_mgmt;
			if (mgr && typeof mgr.open_new_order_dialog === 'function') {
				mgr.open_new_order_dialog();
			} else if (frappe.restaurant && typeof frappe.restaurant.open_pos_dialog === 'function') {
				frappe.restaurant.open_pos_dialog({
					on_success: function () {
						if (mgr) mgr.fetch_data();
					}
				});
			}
		});

		// 5. View Order Details (Read-only order & KDS synchronization view)
		this.container.on('click', '.btn-view-details', function (e) {
			e.stopPropagation();
			let order_id = $(this).data('order-id');
			me.open_details_dialog(order_id);
		});

		// 6. Add More Items to Active Order (Incremental Ordering)
		this.container.on('click', '.btn-add-more-items', function (e) {
			e.stopPropagation();
			let order_id = $(this).data('order-id');
			let table_no = $(this).data('table-no');
			me.open_new_order_dialog(table_no, order_id);
		});

		// 7. View Customer Profile & History
		this.container.on('click', '.btn-order-cust-history', function (e) {
			e.stopPropagation();
			let cust_id = $(this).data('cust-id');
			let mobile = $(this).data('mobile');
			if (cust_id || mobile) {
				me.open_customer_history_dialog(cust_id || mobile);
			}
		});

		// 8. Clear Filters in Empty State
		this.container.on('click', '.btn-clear-order-filters', function () {
			me.current_status = 'All';
			me.current_area = 'All Areas';
			me.search_query = '';
			me.container.find('#order-search-input').val('');
			me.container.find('#order-area-filter').val('All Areas');
			me.container.find('.status-tab-btn').removeClass('active');
			me.container.find('.status-tab-btn[data-status="All"]').addClass('active');
			me.fetch_data();
		});
	}

	fetch_data() {
		let me = this;
		frappe.call({
			method: 'restaurant_management.restaurant_management.page.restaurant_order_management.restaurant_order_management.get_order_data',
			args: {
				status: this.current_status,
				area: this.current_area,
				search: this.search_query
			},
			callback: function (r) {
				if (r.message) {
					me.data = r.message;
					me.render_all();
				}
			}
		});
	}

	render_all() {
		if (!this.data) return;

		let summary = this.data.summary || {};
		this.container.find('#kpi-order-active').text(summary.active_orders || 0);
		this.container.find('#kpi-order-today').text(summary.today_orders || 0);
		this.container.find('#kpi-order-kitchen').text(summary.pending_kitchen || 0);
		this.container.find('#kpi-order-revenue').text(summary.today_revenue || '₹0');

		this.container.find('.order-last-updated').text(frappe.datetime.now_time());

		// Update Status Tabs Counts
		let statusCounts = this.data.status_counts || [];
		statusCounts.forEach(sc => {
			let $btn = this.container.find(`.status-tab-btn[data-status="${sc.name}"]`);
			if ($btn.length) {
				$btn.find('.tab-count-badge').text(sc.count);
			}
		});

		// Render Orders
		let $grid = this.container.find('#orders-cards-grid').empty();
		let orders = this.data.orders || [];

		if (orders.length === 0) {
			$(`
				<div class="order-empty-state">
					<i class="fa fa-filter fa-3x"></i>
					<h4>${__('No Orders Found')}</h4>
					<p>${__('No orders match status "{0}" and area "{1}".', [this.current_status, this.current_area])}</p>
					<button type="button" class="btn btn-sm btn-default btn-clear-order-filters">
						<i class="fa fa-refresh"></i> ${__('Clear All Filters')}
					</button>
				</div>
			`).appendTo($grid);
			return;
		}

		orders.forEach(order => {
			$grid.append(this.create_order_card(order));
		});
	}

	create_order_card(order) {
		let statusClass = `status-${(order.status || 'confirmed').toLowerCase()}`;
		let badgeClass = order.badge_class || 'badge-neutral';
		let canAddItems = !['Paid', 'Cancelled'].includes(order.status);

		// Items list preview (show dishes and quantities)
		let items = order.items || [];
		let itemsHtml = '';
		items.slice(0, 4).forEach(it => {
			itemsHtml += `
				<div class="order-item-row">
					<span class="order-item-qty">${it.qty}&times;</span>
					<span class="order-item-name">${frappe.utils.escape_html(it.name)}</span>
					<span class="order-item-price">₹${it.amount}</span>
				</div>
			`;
		});

		if (items.length > 4) {
			itemsHtml += `
				<div class="order-more-items-hint">
					+ ${items.length - 4} ${__('more items')}
				</div>
			`;
		}

		// Available actions: ONLY View Details and Add More Items (when permitted)
		let actionButtonsHtml = `
			<button type="button" class="btn-order-action btn-view-details" data-order-id="${order.order_id}" title="${__('View order details & rounds')}">
				<i class="fa fa-info-circle"></i> ${__('View Details')}
			</button>
		`;

		if (canAddItems) {
			actionButtonsHtml = `
				<button type="button" class="btn-order-action btn-add-more-items" data-order-id="${order.order_id}" data-table-no="${order.table_no}" title="${__('Add more dishes to this order')}">
					<i class="fa fa-plus"></i> ${__('Add More Items')}
				</button>
			` + actionButtonsHtml;
		}

		let roundBadge = '';
		if (order.batches && order.batches.length > 1) {
			roundBadge = `<span class="order-round-indicator" title="${__('Order has {0} kitchen batches/rounds', [order.batches.length])}">Round ${order.batches.length}</span>`;
		}

		return `
			<div class="restaurant-order-card ${statusClass}" data-order-id="${order.order_id}">
				<div class="order-card-header">
					<div class="order-id-group">
						<h3 class="order-id-title">${order.order_id}</h3>
						<span class="order-time-ago"><i class="fa fa-clock-o"></i> ${order.created_time_str || order.time_ago || __('Just now')}</span>
					</div>
					<div class="order-card-status-wrap">
						${roundBadge}
						<span class="order-status-pill ${badgeClass}">
							${__(order.status)}
						</span>
					</div>
				</div>

				<div class="order-card-body">
					<div class="order-meta-row">
						<span class="order-table-badge"><i class="fa fa-map-marker"></i> ${order.table_no} &bull; ${order.area}</span>
						<span class="order-customer-label btn-order-cust-history" data-cust-id="${order.customer_id || ''}" data-mobile="${order.customer_mobile || ''}" style="cursor: pointer;" title="${__('View Customer Profile')}">
							<i class="fa fa-user-circle"></i> ${frappe.utils.escape_html(order.customer || __('Walk-in Guest'))}
							${order.customer_mobile ? `<small style="margin-left: 0.25rem; font-weight: normal; opacity: 0.85;">(${frappe.utils.escape_html(order.customer_mobile)})</small>` : ''}
						</span>
					</div>

					<div class="order-items-preview">
						${itemsHtml}
					</div>

					${order.notes ? `<div class="order-notes-tag"><i class="fa fa-sticky-note-o"></i> "${frappe.utils.escape_html(order.notes)}"</div>` : ''}
				</div>

				<div class="order-card-footer">
					<div class="order-amount-display">
						<span class="order-amount-label">${__('Total (incl. 5% GST)')}</span>
						<span class="order-amount-value">${order.formatted_amount || ('₹' + order.total)}</span>
					</div>

					<div class="order-card-actions">
						${actionButtonsHtml}
					</div>
				</div>
			</div>
		`;
	}

	open_details_dialog(order_id) {
		let me = this;
		frappe.call({
			method: 'restaurant_management.restaurant_management.page.restaurant_order_management.restaurant_order_management.get_order_details',
			args: { order_id: order_id },
			callback: function (r) {
				if (!r.message) return;
				let order = r.message;

				// Batches / rounds breakdown
				let batchesHtml = '';
				let batches = order.batches || [];
				if (batches.length > 0) {
					batches.forEach(b => {
						let bRows = (b.items || []).map(it => `
							<tr>
								<td><strong>${frappe.utils.escape_html(it.name)}</strong> <small class="text-muted">(${it.item_id})</small></td>
								<td style="text-align: center;">${it.qty}</td>
								<td style="text-align: right;">₹${it.price}</td>
								<td style="text-align: right; font-weight: 600;">₹${it.amount}</td>
							</tr>
						`).join('');

						batchesHtml += `
							<div class="order-detail-round-box">
								<div class="order-detail-round-header">
									<div>
										<strong style="color: #1e293b;">${frappe.utils.escape_html(b.round_name || ('Round ' + b.round))}</strong>
										<span class="text-muted" style="margin-left: 0.4rem; font-size: 0.75rem;">(${b.batch_id})</span>
									</div>
									<div>
										<span class="order-status-pill ${order.badge_class}" style="font-size: 0.7rem; padding: 2px 6px;">${b.status || order.status}</span>
										<span class="text-muted" style="margin-left: 0.4rem; font-size: 0.74rem;"><i class="fa fa-clock-o"></i> ${b.created_time_str || ''}</span>
									</div>
								</div>
								<table class="order-modal-details-table" style="margin: 0; width: 100%;">
									<thead>
										<tr style="background: #ffffff; font-size: 0.75rem; text-transform: uppercase; color: #64748b;">
											<th>${__('Dish / Item')}</th>
											<th style="text-align: center;">${__('Qty')}</th>
											<th style="text-align: right;">${__('Price')}</th>
											<th style="text-align: right;">${__('Total')}</th>
										</tr>
									</thead>
									<tbody>
										${bRows}
									</tbody>
								</table>
								${b.notes ? `<div style="padding: 0.35rem 0.75rem; background: #fffbeb; font-size: 0.75rem; color: #92400e; border-top: 1px dashed #fde68a;"><i class="fa fa-comment-o"></i> ${frappe.utils.escape_html(b.notes)}</div>` : ''}
							</div>
						`;
					});
				} else {
					let rowsHtml = '';
					(order.items || []).forEach(it => {
						rowsHtml += `
							<tr>
								<td><strong>${frappe.utils.escape_html(it.name)}</strong> <small class="text-muted">(${it.item_id})</small></td>
								<td style="text-align: center;">${it.qty}</td>
								<td style="text-align: right;">₹${it.price}</td>
								<td style="text-align: right; font-weight: 600;">₹${it.amount}</td>
							</tr>
						`;
					});
					batchesHtml = `
						<table class="order-modal-details-table">
							<thead>
								<tr>
									<th>${__('Dish / Item')}</th>
									<th style="text-align: center;">${__('Qty')}</th>
									<th style="text-align: right;">${__('Price')}</th>
									<th style="text-align: right;">${__('Total')}</th>
								</tr>
							</thead>
							<tbody>
								${rowsHtml}
							</tbody>
						</table>
					`;
				}

				let canAddItems = !['Paid', 'Cancelled'].includes(order.status);

				let content = `
					<div style="font-size: 0.88rem;">
						<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.85rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-color);">
							<div>
								<div style="font-size: 1.1rem; font-weight: 700; color: #0f172a;">${order.order_id}</div>
								<div style="color: #475569; margin-top: 0.2rem;">
									<i class="fa fa-map-marker text-muted"></i> <strong>Table ${frappe.utils.escape_html(order.table_no)}</strong> &bull; ${frappe.utils.escape_html(order.area)}
								</div>
								<div style="color: #475569; margin-top: 0.15rem;">
									<i class="fa fa-user-circle text-muted"></i> ${frappe.utils.escape_html(order.customer)}
									${order.customer_mobile ? `<span class="text-muted" style="margin-left: 0.25rem;">(+91 ${frappe.utils.escape_html(order.customer_mobile)})</span>` : ''}
								</div>
							</div>
							<div style="text-align: right;">
								<div><span class="order-status-pill ${order.badge_class}">${order.status}</span></div>
								<div style="color: var(--text-muted); font-size: 0.78rem; margin-top: 0.35rem;"><i class="fa fa-clock-o"></i> ${order.created_time_str || order.time_ago || __('Today')}</div>
								<div style="margin-top: 0.35rem; font-size: 0.78rem;">
									<strong>${__('Payment:')}</strong>
									<span class="order-pay-status-pill ${order.payment_status === 'Paid' ? 'pay-paid' : 'pay-unpaid'}">${order.payment_status || 'Unpaid'}</span>
								</div>
							</div>
						</div>

						<div style="margin-bottom: 0.5rem; font-weight: 600; color: #334155; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.03em;">
							<i class="fa fa-cutlery"></i> ${__('Dispatched Kitchen Items & Batches')}
						</div>

						${batchesHtml}

						<div style="margin-top: 0.85rem; border-top: 1px solid var(--border-color); padding-top: 0.65rem; text-align: right; font-size: 0.85rem;">
							<div style="color: #475569;">${__('Subtotal:')} ₹${order.subtotal}</div>
							<div style="color: #64748b; font-size: 0.8rem;">${__('GST (5%):')} ₹${order.tax}</div>
							<div style="font-size: 1.15rem; font-weight: 800; color: #0f172a; margin-top: 0.25rem;">${__('Grand Total:')} ${order.formatted_amount}</div>
						</div>

						${order.notes ? `<div style="margin-top: 0.75rem; background: #f8fafc; padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.8rem; border-left: 3px solid #6366f1;"><strong>${__('Special Instructions:')}</strong> ${frappe.utils.escape_html(order.notes)}</div>` : ''}

						<div class="order-readonly-notice">
							<i class="fa fa-info-circle fa-lg" style="color: #0284c7;"></i>
							<span>${__('Kitchen preparation and ready status are managed live in <b>Kitchen Display System</b>. Invoicing and payments are processed in <b>Billing & Payments</b>.')}</span>
						</div>
					</div>
				`;

				let d = new frappe.ui.Dialog({
					title: __('Order Details: {0}', [order.order_id]),
					fields: [{ fieldtype: 'HTML', fieldname: 'details_html', options: content }],
					primary_action_label: __('Close'),
					primary_action: () => d.hide()
				});

				if (canAddItems) {
					d.add_custom_action(__('Add More Items'), function () {
						d.hide();
						me.open_new_order_dialog(order.table_no, order.order_id);
					}, 'btn-primary');
				}

				if (order.customer_id || order.customer_mobile) {
					d.add_custom_action(__('Customer History'), function () {
						d.hide();
						me.open_customer_history_dialog(order.customer_id || order.customer_mobile);
					});
				}

				d.show();
			}
		});
	}

	open_new_order_dialog(target_table_no = null, existing_order_id = null) {
		let me = this;
		frappe.restaurant.open_pos_dialog({
			target_table_no: target_table_no,
			existing_order_id: existing_order_id,
			on_success: function (newOrder) {
				me.fetch_data();
			}
		});
	}

	open_customer_history_dialog(customer_id_or_mobile) {
		let me = this;
		frappe.call({
			method: 'restaurant_management.restaurant_management.page.restaurant_order_management.restaurant_order_management.get_customer_history',
			args: { customer_id_or_mobile: customer_id_or_mobile },
			freeze: true,
			freeze_message: __('Loading Customer History...'),
			callback: function (r) {
				if (!r.message) return;
				let hist = r.message;
				let cust = hist.customer;
				let orders = hist.orders || [];
				let favs = hist.favorite_dishes || [];

				let favsHtml = favs.length
					? favs.map(f => `<span class="badge badge-light" style="font-size: 0.78rem; padding: 4px 8px; margin-right: 5px; margin-bottom: 5px; background: #f8fafc; border: 1px solid #e2e8f0;"><i class="fa fa-cutlery" style="color: #f59e0b;"></i> ${f.name} <strong style="color: var(--text-color);">(${f.count}x)</strong></span>`).join('')
					: `<span style="color: var(--text-muted); font-size: 0.8rem;">${__('No order history yet')}</span>`;

				let ordersHtml = '';
				if (orders.length === 0) {
					ordersHtml = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 1rem;">${__('No past orders found.')}</td></tr>`;
				} else {
					orders.forEach(o => {
						let badgeClass = o.badge_class || 'badge-neutral';
						let isPaid = o.payment_status === 'Paid';
						ordersHtml += `
							<tr>
								<td><strong>${o.order_id}</strong></td>
								<td>${o.table_no} (${o.area})</td>
								<td>${o.created_at || o.time_ago || __('Today')}</td>
								<td style="text-align: center;">${(o.items || []).reduce((acc, it) => acc + (it.qty || 1), 0)}</td>
								<td style="text-align: right; font-weight: 600;">${o.formatted_amount || ('₹' + o.total)}</td>
								<td style="text-align: center;"><span class="order-status-pill ${badgeClass}">${o.status}</span></td>
								<td style="text-align: center;"><span style="font-weight: 600; color: ${isPaid ? '#059669' : '#ea580c'};">${o.payment_status || 'Unpaid'}</span></td>
								<td style="text-align: center;">
									<button type="button" class="btn btn-xs btn-default btn-view-hist-details" data-order-id="${o.order_id}">
										<i class="fa fa-info-circle"></i> ${__('Details')}
									</button>
								</td>
							</tr>
						`;
					});
				}

				let html = `
					<div class="cust-history-wrapper" style="font-size: 0.88rem;">
						<!-- Customer Profile Card -->
						<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; margin-bottom: 1.25rem;">
							<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem;">
								<div>
									<h3 style="margin: 0; font-size: 1.2rem; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 0.5rem;">
										<i class="fa fa-user-circle" style="color: #4f46e5;"></i> ${cust.name}
										<span class="badge badge-info" style="font-size: 0.75rem; vertical-align: middle;">${cust.customer_id}</span>
									</h3>
									<div style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.25rem;">
										<i class="fa fa-phone"></i> +91 ${cust.mobile} &bull; 
										<i class="fa fa-calendar-o"></i> ${__('Registered')}: ${cust.created_at ? cust.created_at.split(' ')[0] : '2026-10-15'}
									</div>
								</div>
								<div style="text-align: right;">
									<span class="badge" style="background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; padding: 4px 8px; font-weight: 600;">
										<i class="fa fa-check-circle"></i> ${__('Verified Guest')}
									</span>
									<div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.25rem;">
										${__('Last Visit')}: <strong>${cust.last_visit || __('Today')}</strong>
									</div>
								</div>
							</div>

							<!-- 3 KPI Cards -->
							<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-top: 1rem;">
								<div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.65rem 0.85rem; text-align: center;">
									<div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">${__('Total Visits')}</div>
									<div style="font-size: 1.3rem; font-weight: 700; color: #4f46e5; margin-top: 0.15rem;">${cust.total_visits || 1}</div>
								</div>
								<div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.65rem 0.85rem; text-align: center;">
									<div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">${__('Lifetime Orders')}</div>
									<div style="font-size: 1.3rem; font-weight: 700; color: #059669; margin-top: 0.15rem;">${hist.total_orders || 0}</div>
								</div>
								<div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.65rem 0.85rem; text-align: center;">
									<div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">${__('Total Spend')}</div>
									<div style="font-size: 1.3rem; font-weight: 700; color: #0f172a; margin-top: 0.15rem;">${hist.formatted_total_spent}</div>
								</div>
							</div>
						</div>

						<!-- Favorite Dishes -->
						<div style="margin-bottom: 1.25rem;">
							<h4 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 0.4rem; color: var(--text-color);">${__('Favorite Dishes / Most Ordered')}</h4>
							<div style="display: flex; flex-wrap: wrap;">
								${favsHtml}
							</div>
						</div>

						<!-- Orders History -->
						<div>
							<h4 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-color);">${__('Visit & Order History')}</h4>
							<div style="max-height: 250px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px;">
								<table class="table table-bordered table-hover" style="margin: 0; font-size: 0.82rem;">
									<thead style="background: #f8fafc; position: sticky; top: 0;">
										<tr>
											<th>${__('Order ID')}</th>
											<th>${__('Table')}</th>
											<th>${__('Date & Time')}</th>
											<th style="text-align: center;">${__('Dishes')}</th>
											<th style="text-align: right;">${__('Amount')}</th>
											<th style="text-align: center;">${__('Status')}</th>
											<th style="text-align: center;">${__('Payment')}</th>
											<th style="text-align: center;">${__('Details')}</th>
										</tr>
									</thead>
									<tbody>
										${ordersHtml}
									</tbody>
								</table>
							</div>
						</div>
					</div>
				`;

				let histDialog = new frappe.ui.Dialog({
					title: __('Customer Profile: {0} ({1})', [cust.name, cust.customer_id]),
					size: 'large',
					fields: [{ fieldtype: 'HTML', fieldname: 'history_html', options: html }],
					primary_action_label: __('Close'),
					primary_action: () => histDialog.hide()
				});

				histDialog.$wrapper.on('click', '.btn-view-hist-details', function () {
					let oid = $(this).data('order-id');
					histDialog.hide();
					me.open_details_dialog(oid);
				});

				histDialog.show();
			}
		});
	}

}
