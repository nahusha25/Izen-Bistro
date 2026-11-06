// Copyright (c) 2026, Nahusha and contributors
// For license information, please see license.txt

frappe.pages['restaurant-kitchen-display'].on_page_load = function (wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __('Kitchen Display System'),
		single_column: true
	});

	frappe.breadcrumbs.add('Restaurant Management');

	page.add_button(__('Refresh'), function () {
		if (wrapper.kds) {
			wrapper.kds.fetch_data(false);
		}
	}, 'fa fa-refresh');

	page.add_menu_item(__('Reset Demo Orders'), function () {
		frappe.confirm(
			__('Are you sure you want to reset all kitchen orders back to baseline?'),
			function () {
				frappe.call({
					method: 'restaurant_management.restaurant_management.page.restaurant_kitchen_display.restaurant_kitchen_display.reset_demo_data',
					callback: function (r) {
						if (r.message && wrapper.kds) {
							wrapper.kds.data = r.message;
							wrapper.kds.render_all();
							frappe.show_alert({
								message: __('Kitchen orders reset to baseline.'),
								indicator: 'green'
							});
						}
					}
				});
			}
		);
	});

	wrapper.kds = new KitchenDisplaySystem(wrapper, page);
};

frappe.pages['restaurant-kitchen-display'].on_page_show = function (wrapper) {
	if (wrapper.kds) {
		wrapper.kds.start_timers();
		wrapper.kds.fetch_data(false);
	}
};

frappe.pages['restaurant-kitchen-display'].on_page_hide = function (wrapper) {
	if (wrapper.kds) {
		wrapper.kds.stop_timers();
	}
};

class KitchenDisplaySystem {
	constructor(wrapper, page) {
		this.wrapper = wrapper;
		this.page = page;
		this.data = null;
		this.current_area = 'All Areas';
		this.search_query = '';
		this.sound_enabled = true;
		this.known_ticket_ids = new Set();
		this.audio_ctx = null;
		this.poll_interval = null;
		this.clock_interval = null;

		this.init();
	}

	init() {
		this.render_skeleton();
		this.bind_events();
		this.start_timers();
		this.fetch_data(false);
	}

	start_timers() {
		let me = this;
		this.stop_timers();

		// 1. Clock and timer tick every 1000ms
		this.clock_interval = setInterval(() => {
			me.update_clock_and_timers();
		}, 1000);

		// 2. Auto-polling every 8 seconds for new orders confirmed in Order Management
		this.poll_interval = setInterval(() => {
			me.fetch_data(true);
		}, 8000);
	}

	stop_timers() {
		if (this.clock_interval) clearInterval(this.clock_interval);
		if (this.poll_interval) clearInterval(this.poll_interval);
	}

	render_skeleton() {
		this.page.main.empty();
		this.container = $(`
			<div class="kds-wrapper">
				<!-- Header with Live System Indicator & Controls -->
				<div class="kds-header">
					<div class="kds-title-group">
						<h1 class="kds-main-title">
							<i class="fa fa-cutlery" style="color: #4f46e5;"></i>
							${__('Kitchen Display System')}
						</h1>
						<span class="kds-live-pill">
							<span class="kds-pulse-dot"></span>
							${__('Live KDS')}
						</span>
					</div>

					<div class="kds-clock-controls">
						<div class="kds-live-clock" id="kds-live-clock">
							<i class="fa fa-clock-o"></i>
							<span class="clock-digits">--:--:--</span>
						</div>

						<button type="button" class="kds-btn-tool" id="btn-kds-kitchen-stock" title="${__('View kitchen stock and transfer from warehouse')}">
							<i class="fa fa-cubes"></i>
							<span>${__('Kitchen Stock')}</span>
						</button>

						<button type="button" class="kds-btn-tool active-toggle" id="btn-kds-sound" title="${__('Toggle audible kitchen bell on new ticket')}">
							<i class="fa fa-volume-up"></i>
							<span class="sound-label">${__('Sound ON')}</span>
						</button>

						<button type="button" class="kds-btn-tool" id="btn-kds-fullscreen" title="${__('Toggle full screen display mode')}">
							<i class="fa fa-arrows-alt"></i>
							<span>${__('Fullscreen')}</span>
						</button>

						<button type="button" class="kds-btn-tool" id="btn-kds-refresh" title="${__('Refresh live tickets')}">
							<i class="fa fa-refresh"></i>
						</button>
					</div>
				</div>

				<!-- Top Summary KPI Grid -->
				<div class="kds-kpi-grid">
					<div class="kds-kpi-card kpi-new">
						<div class="kds-kpi-meta">
							<span class="kds-kpi-label">${__('New Orders')}</span>
							<span class="kds-kpi-num" id="kpi-kds-new">0</span>
						</div>
						<div class="kds-kpi-icon"><i class="fa fa-bell-o"></i></div>
					</div>

					<div class="kds-kpi-card kpi-prep">
						<div class="kds-kpi-meta">
							<span class="kds-kpi-label">${__('Preparing')}</span>
							<span class="kds-kpi-num" id="kpi-kds-prep">0</span>
						</div>
						<div class="kds-kpi-icon"><i class="fa fa-fire"></i></div>
					</div>

					<div class="kds-kpi-card kpi-ready">
						<div class="kds-kpi-meta">
							<span class="kds-kpi-label">${__('Ready to Serve')}</span>
							<span class="kds-kpi-num" id="kpi-kds-ready">0</span>
						</div>
						<div class="kds-kpi-icon"><i class="fa fa-check-circle-o"></i></div>
					</div>

					<div class="kds-kpi-card kpi-served">
						<div class="kds-kpi-meta">
							<span class="kds-kpi-label">${__('Served Today')}</span>
							<span class="kds-kpi-num" id="kpi-kds-served">0</span>
						</div>
						<div class="kds-kpi-icon"><i class="fa fa-history"></i></div>
					</div>
				</div>

				<!-- Filter & Search Bar -->
				<div class="kds-filter-panel">
					<div class="kds-search-wrapper">
						<i class="fa fa-search"></i>
						<input type="text" class="kds-search-input" id="kds-search-input" placeholder="${__('Search ticket, table, dish...')}" />
					</div>

					<div>
						<select class="kds-select-area" id="kds-area-filter">
							<option value="All Areas">${__('All Dining Areas')}</option>
							<option value="Main Dining Hall">${__('Main Dining Hall')}</option>
							<option value="Garden Patio">${__('Garden Patio')}</option>
							<option value="Rooftop Terrace">${__('Rooftop Terrace')}</option>
						</select>
					</div>
				</div>

				<!-- Three Kitchen Order Columns -->
				<div class="kds-columns-grid">
					<!-- 1. NEW / CONFIRMED COLUMN -->
					<div class="kds-column col-new" data-column="confirmed">
						<div class="kds-column-header">
							<h3 class="kds-col-title">
								<i class="fa fa-inbox" style="color: #3b82f6;"></i>
								${__('New / Confirmed')}
							</h3>
							<span class="kds-col-badge" id="col-count-confirmed">0</span>
						</div>
						<div class="kds-tickets-container" id="tickets-confirmed"></div>
					</div>

					<!-- 2. PREPARING COLUMN -->
					<div class="kds-column col-prep" data-column="preparing">
						<div class="kds-column-header">
							<h3 class="kds-col-title">
								<i class="fa fa-fire" style="color: #d97706;"></i>
								${__('Preparing')}
							</h3>
							<span class="kds-col-badge" id="col-count-preparing">0</span>
						</div>
						<div class="kds-tickets-container" id="tickets-preparing"></div>
					</div>

					<!-- 3. READY TO SERVE COLUMN -->
					<div class="kds-column col-ready" data-column="ready">
						<div class="kds-column-header">
							<h3 class="kds-col-title">
								<i class="fa fa-check-circle" style="color: #059669;"></i>
								${__('Ready to Serve')}
							</h3>
							<span class="kds-col-badge" id="col-count-ready">0</span>
						</div>
						<div class="kds-tickets-container" id="tickets-ready"></div>
					</div>
				</div>
			</div>
		`).appendTo(this.page.main);
	}

	bind_events() {
		let me = this;

		// 1. Sound Toggle
		this.container.on('click', '#btn-kds-sound', function () {
			me.sound_enabled = !me.sound_enabled;
			let $btn = $(this);
			if (me.sound_enabled) {
				$btn.addClass('active-toggle');
				$btn.find('i').attr('class', 'fa fa-volume-up');
				$btn.find('.sound-label').text(__('Sound ON'));
				me.play_chime();
				frappe.show_alert({ message: __('Kitchen bell enabled'), indicator: 'green' });
			} else {
				$btn.removeClass('active-toggle');
				$btn.find('i').attr('class', 'fa fa-volume-off');
				$btn.find('.sound-label').text(__('Sound OFF'));
				frappe.show_alert({ message: __('Kitchen bell muted'), indicator: 'orange' });
			}
		});

		// 2. Fullscreen Toggle
		this.container.on('click', '#btn-kds-fullscreen', function () {
			if (!document.fullscreenElement) {
				document.documentElement.requestFullscreen().catch(err => {
					console.warn('Fullscreen request failed:', err);
				});
			} else {
				if (document.exitFullscreen) {
					document.exitFullscreen();
				}
			}
		});

		// 3. Manual Refresh Button
		this.container.on('click', '#btn-kds-refresh', function () {
			me.fetch_data(false);
		});

		// 4. Area Filter Change
		this.container.on('change', '#kds-area-filter', function () {
			me.current_area = $(this).val();
			me.fetch_data(false);
		});

		// 5. Search Input
		this.container.on('input', '#kds-search-input', function () {
			me.search_query = $(this).val();
			me.fetch_data(false);
		});

		// 6. Kitchen Ticket Action Button Click
		this.container.on('click', '.btn-kds-action', function (e) {
			e.stopPropagation();
			let order_id = $(this).data('order-id');
			let next_status = $(this).data('next-status');
			me.update_ticket_status(order_id, next_status);
		});

		// 7. Ticket Recipe & Ingredient Consumption Modal Click
		this.container.on('click', '.btn-view-recipe, .ticket-header-banner', function (e) {
			e.stopPropagation();
			let ticket_id = $(this).closest('.kds-ticket-card').data('order-id');
			me.show_ingredient_details_dialog(ticket_id);
		});

		// 8. Kitchen Stock and Warehouse Transfers Modal Click
		this.container.on('click', '#btn-kds-kitchen-stock', function () {
			me.show_kitchen_stock_dialog();
		});

		// 9. Inline Transfer Action on Ticket
		this.container.on('click', '.btn-inline-transfer', function (e) {
			e.stopPropagation();
			let orderId = $(this).data('order-id');
			let ticket = null;
			if (me.data && me.data.columns) {
				for (let col of ['confirmed', 'preparing', 'ready']) {
					ticket = (me.data.columns[col] || []).find(t => t.order_id === orderId);
					if (ticket) break;
				}
			}
			if (ticket) {
				me.show_ticket_stock_prep_dialog(ticket);
			} else {
				me.show_kitchen_stock_dialog();
			}
		});
	}

	fetch_data(silent = false) {
		let me = this;
		frappe.call({
			method: 'restaurant_management.restaurant_management.page.restaurant_kitchen_display.restaurant_kitchen_display.get_kds_data',
			args: {
				area: this.current_area,
				search: this.search_query
			},
			callback: function (r) {
				if (r.message) {
					let prevData = me.data;
					me.data = r.message;

					// Check for newly arrived tickets in Confirmed column
					if (silent && prevData) {
						me.check_new_arrivals();
					} else {
						// Populate initial known ticket IDs
						let cols = me.data.columns || {};
						(cols.confirmed || []).forEach(o => me.known_ticket_ids.add(o.order_id));
						(cols.preparing || []).forEach(o => me.known_ticket_ids.add(o.order_id));
						(cols.ready || []).forEach(o => me.known_ticket_ids.add(o.order_id));
					}

					me.render_all();
				}
			}
		});
	}

	check_new_arrivals() {
		let confirmedList = (this.data.columns && this.data.columns.confirmed) ? this.data.columns.confirmed : [];
		let newArrivalCount = 0;

		confirmedList.forEach(order => {
			if (!this.known_ticket_ids.has(order.order_id)) {
				this.known_ticket_ids.add(order.order_id);
				newArrivalCount += 1;
				order._is_new_arrival = true;
			}
		});

		if (newArrivalCount > 0) {
			if (this.sound_enabled) {
				this.play_chime();
			}
			frappe.show_alert({
				message: __('🔔 {0} new kitchen ticket(s) received!', [newArrivalCount]),
				indicator: 'blue'
			});
		}
	}

	play_chime() {
		try {
			let AudioCtx = window.AudioContext || window.webkitAudioContext;
			if (!AudioCtx) return;
			if (!this.audio_ctx) {
				this.audio_ctx = new AudioCtx();
			}
			if (this.audio_ctx.state === 'suspended') {
				this.audio_ctx.resume();
			}

			let ctx = this.audio_ctx;
			let now = ctx.currentTime;

			// Dual-tone harmonic chime (587.33 Hz [D5] and 880 Hz [A5])
			let osc1 = ctx.createOscillator();
			let osc2 = ctx.createOscillator();
			let gain = ctx.createGain();

			osc1.type = 'sine';
			osc1.frequency.setValueAtTime(587.33, now);
			osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15);

			osc2.type = 'triangle';
			osc2.frequency.setValueAtTime(880, now);

			gain.gain.setValueAtTime(0.3, now);
			gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

			osc1.connect(gain);
			osc2.connect(gain);
			gain.connect(ctx.destination);

			osc1.start(now);
			osc2.start(now);
			osc1.stop(now + 0.45);
			osc2.stop(now + 0.45);
		} catch (e) {
			console.warn('Audio chime playback omitted:', e);
		}
	}

	update_clock_and_timers() {
		// Update Live Header Clock
		let now = new Date();
		let timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
		let dateStr = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
		this.container.find('.clock-digits').text(`${timeStr} • ${dateStr}`);

		// Update Elapsed Preparation Timers for all visible tickets
		let me = this;
		this.container.find('.ticket-timer-pill').each(function () {
			let $pill = $(this);
			let createdAt = $pill.data('created-at');
			if (!createdAt) return;

			let createdDate = new Date(createdAt);
			let elapsedSeconds = Math.max(0, Math.floor((now.getTime() - createdDate.getTime()) / 1000));

			let mins = Math.floor(elapsedSeconds / 60);
			let secs = elapsedSeconds % 60;
			let formatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

			$pill.find('.timer-value').text(formatted);

			// Warning and Urgent thresholds
			$pill.removeClass('timer-warn timer-urgent');
			if (mins >= 25) {
				$pill.addClass('timer-urgent');
			} else if (mins >= 15) {
				$pill.addClass('timer-warn');
			}
		});
	}

	render_all() {
		if (!this.data) return;

		let kpis = this.data.kpis || {};
		this.container.find('#kpi-kds-new').text(kpis.new_orders || 0);
		this.container.find('#kpi-kds-prep').text(kpis.preparing || 0);
		this.container.find('#kpi-kds-ready').text(kpis.ready || 0);
		this.container.find('#kpi-kds-served').text(kpis.served_today || 0);

		let columns = this.data.columns || {};
		let confirmed = columns.confirmed || [];
		let preparing = columns.preparing || [];
		let ready = columns.ready || [];

		this.container.find('#col-count-confirmed').text(confirmed.length);
		this.container.find('#col-count-preparing').text(preparing.length);
		this.container.find('#col-count-ready').text(ready.length);

		this.render_column('#tickets-confirmed', confirmed, 'confirmed');
		this.render_column('#tickets-preparing', preparing, 'preparing');
		this.render_column('#tickets-ready', ready, 'ready');

		this.update_clock_and_timers();
	}

	render_column(selector, tickets, colType) {
		let $container = this.container.find(selector).empty();

		if (tickets.length === 0) {
			let emptyMsg = '';
			let icon = '';
			if (colType === 'confirmed') {
				icon = 'fa-check-circle-o';
				emptyMsg = __('No new orders waiting');
			} else if (colType === 'preparing') {
				icon = 'fa-fire';
				emptyMsg = __('No dishes currently cooking');
			} else {
				icon = 'fa-bell-slash-o';
				emptyMsg = __('No orders waiting for pickup');
			}

			$(`
				<div class="kds-column-empty">
					<i class="fa ${icon}"></i>
					<p>${emptyMsg}</p>
				</div>
			`).appendTo($container);
			return;
		}

		tickets.forEach(order => {
			$container.append(this.create_ticket_card(order, colType));
		});
	}

	create_ticket_card(order, colType) {
		let isNewArrival = !!order._is_new_arrival;
		let arrivalClass = isNewArrival ? 'ticket-new-arrival' : '';

		// Items List with Recipe Breakdown
		let itemsHtml = '';
		(order.items || []).forEach(it => {
			let subnote = it.notes ? `<div class="ticket-item-subnote"><i class="fa fa-pencil"></i> ${frappe.utils.escape_html(it.notes)}</div>` : '';
			let portionName = it.portion || 'Regular';
			let portionBadge = `<span class="portion-badge" style="display: inline-block; font-size: 0.72rem; font-weight: 600; background: #e0e7ff; color: #4338ca; padding: 1px 6px; border-radius: 4px; margin-left: 6px;">${frappe.utils.escape_html(portionName)}</span>`;

			let recipeBreakdownHtml = '';
			if (it.has_recipe && it.is_approved && it.ingredients && it.ingredients.length > 0) {
				let chips = it.ingredients.map(ing => {
					let stockColor = ing.in_stock ? '#059669' : '#dc2626';
					let stockTitle = `${ing.ingredient_name}: ${ing.required_display} required. Stock: ${ing.available_display}`;
					return `<span class="ticket-ing-chip" title="${stockTitle}" style="border-left: 2px solid ${stockColor};">
						<span class="ing-name">${frappe.utils.escape_html(ing.ingredient_name)}</span>
						<span class="ing-req">${ing.required_display}</span>
					</span>`;
				}).join('');
				recipeBreakdownHtml = `<div class="ticket-item-ingredients-strip">${chips}</div>`;
			} else if (it.has_recipe && !it.is_approved) {
				recipeBreakdownHtml = `<div class="ticket-recipe-warning-strip" style="background: #fffbeb; border: 1px dashed #f59e0b; color: #b45309; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; margin-top: 4px;" title="${__('Recipe is in Draft / Pending Approval. Quantities are unverified and stock was not deducted.')}">
					<i class="fa fa-clock-o"></i>
					<span>${__('Draft Recipe — Awaiting Approval (Unverified, No Stock Deducted)')}</span>
				</div>`;
			} else if (it.has_recipe === false) {
				recipeBreakdownHtml = `<div class="ticket-recipe-warning-strip" title="${__('No recipe mapped in Menu Management. No inventory deducted.')}">
					<i class="fa fa-exclamation-triangle"></i>
					<span>${__('Recipe Not Configured')}</span>
				</div>`;
			}

			itemsHtml += `
				<div class="ticket-item-row">
					<div class="ticket-item-header" style="display: flex; align-items: center; justify-content: space-between;">
						<div>
							<span class="ticket-item-qty">${it.qty}&times;</span>
							<span class="ticket-item-name">${frappe.utils.escape_html(it.name)}</span>
							${portionBadge}
						</div>
					</div>
					${subnote}
					${recipeBreakdownHtml}
				</div>
			`;
		});

		// Notes Callout
		let notesHtml = '';
		if (order.notes) {
			notesHtml = `
				<div class="ticket-notes-box">
					<i class="fa fa-exclamation-triangle"></i>
					<span>${order.notes}</span>
				</div>
			`;
		}

		// Action Button by Column
		let actionBtnHtml = '';
		if (colType === 'confirmed') {
			let stockWarning = order.needs_kitchen_transfer ? `
				<div class="ticket-stock-warning" style="background: #fffbeb; border: 1px solid #fde68a; color: #b45309; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; margin-bottom: 8px; font-weight: 600; display: flex; align-items: center; justify-content: space-between;">
					<span><i class="fa fa-exclamation-circle"></i> ${__('Needs Kitchen Stock')}</span>
					<button type="button" class="btn btn-xs btn-default btn-inline-transfer" data-order-id="${order.order_id}" style="padding: 1px 6px; font-size: 0.7rem; font-weight: 700; color: #b45309; border-color: #f59e0b; background: #fff;">
						<i class="fa fa-arrow-right"></i> ${__('Transfer')}
					</button>
				</div>
			` : `
				<div class="ticket-stock-ready" style="background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; padding: 3px 8px; border-radius: 4px; font-size: 0.72rem; margin-bottom: 8px; font-weight: 600;">
					<i class="fa fa-check-circle"></i> ${__('Kitchen Stock Ready')}
				</div>
			`;

			actionBtnHtml = `
				${stockWarning}
				<button type="button" class="btn-kds-action btn-start-prep" data-order-id="${order.order_id}" data-next-status="Preparing">
					<i class="fa fa-fire"></i> ${__('Start Preparing')}
				</button>
			`;
		} else if (colType === 'preparing') {
			actionBtnHtml = `
				<button type="button" class="btn-kds-action btn-mark-ready" data-order-id="${order.order_id}" data-next-status="Ready">
					<i class="fa fa-bell-o"></i> ${__('Mark Ready')}
				</button>
			`;
		} else if (colType === 'ready') {
			actionBtnHtml = `
				<button type="button" class="btn-kds-action btn-mark-served" data-order-id="${order.order_id}" data-next-status="Served">
					<i class="fa fa-check"></i> ${__('Mark Served')}
				</button>
			`;
		}

		return `
			<div class="kds-ticket-card ${arrivalClass}" data-order-id="${order.order_id}">
				<div class="ticket-header-banner">
					<div class="ticket-table-badge">
						<span>${order.table_no}</span>
						<span class="ticket-area-tag">${order.area}</span>
					</div>

					<div class="ticket-timer-pill" data-created-at="${order.created_at || ''}">
						<i class="fa fa-hourglass-half"></i>
						<span class="timer-value">00:00</span>
					</div>
				</div>

				<div class="ticket-sub-meta">
					<span class="ticket-order-num">
						${order.display_order_id || order.order_id}
						${order.round && order.round > 1 ? `<span class="badge badge-warning" style="background: #fef3c7; color: #b45309; font-weight: 700; font-size: 0.7rem; margin-left: 4px; padding: 2px 6px; border-radius: 4px;">${order.round_name || ('Round ' + order.round)}</span>` : ''}
					</span>
					<span title="${order.customer_id || ''}"><i class="fa fa-user-circle"></i> ${order.customer || __('Guest')} ${order.customer_id ? `<small style="opacity: 0.8;">(${order.customer_id})</small>` : ''}</span>
					${order.customer_mobile ? `<span><i class="fa fa-phone"></i> ${order.customer_mobile}</span>` : ''}
					<span><i class="fa fa-clock-o"></i> ${order.created_time_str || order.time_ago || __('Now')}</span>
				</div>

				<div class="ticket-items-list">
					${itemsHtml}
				</div>

				${notesHtml}

				<div class="ticket-action-footer">
					<button type="button" class="btn-kds-subaction btn-view-recipe" data-order-id="${order.order_id}">
						<i class="fa fa-cutlery"></i> ${__('Ingredients')}
					</button>
					${actionBtnHtml}
				</div>
			</div>
		`;
	}

	update_ticket_status(order_id, next_status) {
		let me = this;
		let ticket = null;
		if (this.data && this.data.columns) {
			for (let col of ['confirmed', 'preparing', 'ready']) {
				ticket = (this.data.columns[col] || []).find(t => t.order_id === order_id);
				if (ticket) break;
			}
		}

		// Intercept Start Preparing if kitchen stock is missing
		if (next_status === 'Preparing' && ticket && ticket.needs_kitchen_transfer) {
			me.show_ticket_stock_prep_dialog(ticket);
			return;
		}

		frappe.call({
			method: 'restaurant_management.restaurant_management.page.restaurant_kitchen_display.restaurant_kitchen_display.update_order_status',
			args: {
				order_id: order_id,
				status: next_status
			},
			callback: function (r) {
				if (r.message) {
					let actionLabels = {
						'Preparing': __('started preparing in kitchen (kitchen stock consumed)'),
						'Ready': __('marked ready for pickup'),
						'Served': __('marked served & routed to billing')
					};
					let label = actionLabels[next_status] || next_status;
					frappe.show_alert({
						message: __('Ticket {0} {1}', [order_id, label]),
						indicator: 'green'
					});
					me.fetch_data(false);
				}
			}
		});
	}

	show_ingredient_details_dialog(ticket_id) {
		let ticket = null;
		if (this.data && this.data.columns) {
			for (let col of ['confirmed', 'preparing', 'ready']) {
				ticket = (this.data.columns[col] || []).find(t => t.order_id === ticket_id || t.batch_id === ticket_id || t.parent_order_id === ticket_id);
				if (ticket) break;
			}
		}

		if (!ticket) {
			frappe.msgprint(__('Ticket details not found.'));
			return;
		}

		let unconfiguredAlert = '';
		if (ticket.has_unconfigured_recipes && ticket.unconfigured_dishes && ticket.unconfigured_dishes.length > 0) {
			unconfiguredAlert += `
				<div class="alert alert-warning" style="background: #fffbeb; border: 1px solid #fef3c7; color: #92400e; padding: 10px 14px; border-radius: 6px; margin-bottom: 12px;">
					<div style="font-weight: 700; margin-bottom: 4px;">
						<i class="fa fa-exclamation-triangle"></i> ${__('Recipe Configuration Notice')}
					</div>
					<div style="font-size: 0.85rem;">
						${__('The following dishes have no recipe configured:')} <strong>${frappe.utils.escape_html(ticket.unconfigured_dishes.join(', '))}</strong>.
						${__('No inventory was deducted for these items.')}
					</div>
				</div>
			`;
		}
		if (ticket.has_unapproved_recipes && ticket.unapproved_dishes && ticket.unapproved_dishes.length > 0) {
			unconfiguredAlert += `
				<div class="alert alert-info" style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 10px 14px; border-radius: 6px; margin-bottom: 12px; border-left: 4px solid #f59e0b; background: #fffbeb; border-color: #fde68a; color: #92400e;">
					<div style="font-weight: 700; margin-bottom: 4px;">
						<i class="fa fa-clock-o"></i> ${__('Unapproved Recipe Notice (Awaiting Sign-Off)')}
					</div>
					<div style="font-size: 0.85rem;">
						${__('The following dishes have draft or unapproved recipes:')} <strong>${frappe.utils.escape_html(ticket.unapproved_dishes.join(', '))}</strong>.
						${__('Quantities are unverified suggestions; stock is NOT deducted until approved in Menu Management.')}
					</div>
				</div>
			`;
		}

		// Table Rows
		let tableRows = '';
		(ticket.items || []).forEach(it => {
			let portionName = it.portion || 'Regular';
			if (it.has_recipe && it.is_approved && it.ingredients && it.ingredients.length > 0) {
				it.ingredients.forEach((ing, idx) => {
					let dishCol = idx === 0 ? `
						<td rowspan="${it.ingredients.length}" style="vertical-align: middle; font-weight: 600; background: #fafafa;">
							${frappe.utils.escape_html(it.name)}
							<div style="font-size: 0.75rem; color: #6366f1; font-weight: 500;">Portion: ${frappe.utils.escape_html(portionName)}</div>
						</td>
						<td rowspan="${it.ingredients.length}" style="vertical-align: middle; text-align: center; font-weight: 700; background: #fafafa;">${it.qty}</td>
					` : '';
					
					let inKitchen = ing.in_kitchen_stock;
					let stockUnit = ing.stock_unit || ing.unit;
					let statusBadge = inKitchen
						? `<span class="badge badge-success" style="background: #ecfdf5; color: #047857; font-weight: 700; padding: 3px 8px; border-radius: 4px;"><i class="fa fa-check"></i> Ready</span>`
						: `<span class="badge badge-danger" style="background: #fef2f2; color: #b91c1c; font-weight: 700; padding: 3px 8px; border-radius: 4px;"><i class="fa fa-times"></i> Shortage (${ing.kitchen_missing_display || (ing.kitchen_missing_qty + ' ' + stockUnit)})</span>`;

					let actionCell = inKitchen 
						? `<span class="text-muted small">--</span>`
						: `<button type="button" class="btn btn-xs btn-primary btn-dialog-transfer" data-ticket-id="${ticket.order_id}" data-item="${frappe.utils.escape_html(ing.ingredient_name)}" data-code="${ing.item_code}" data-unit="${stockUnit}" data-needed="${ing.kitchen_missing_qty}" data-warehouse="${ing.warehouse_stock}" style="font-weight: 700; padding: 2px 8px;"><i class="fa fa-arrow-right"></i> ${__('Transfer')}</button>`;

					tableRows += `
						<tr>
							${dishCol}
							<td style="font-weight: 500;">
								${frappe.utils.escape_html(ing.ingredient_name)}
								${ing.item_code ? `<small style="color: #64748b; margin-left: 4px;">(${ing.item_code})</small>` : ''}
							</td>
							<td style="text-align: right; color: #64748b;">${ing.per_serving_display}</td>
							<td style="text-align: right; font-weight: 700; color: #1e293b;">${ing.required_display}</td>
							<td style="text-align: right; font-weight: 700; color: #4338ca;">${ing.kitchen_display || (ing.kitchen_stock + ' ' + stockUnit)}</td>
							<td style="text-align: right; color: #64748b;">${ing.warehouse_display || (ing.warehouse_stock + ' ' + stockUnit)}</td>
							<td style="text-align: center;">${statusBadge}</td>
							<td style="text-align: center;">${actionCell}</td>
						</tr>
					`;
				});
			} else if (it.has_recipe && !it.is_approved) {
				tableRows += `
					<tr style="background: #fffdf5;">
						<td style="font-weight: 600;">
							${frappe.utils.escape_html(it.name)}
							<div style="font-size: 0.75rem; color: #b45309; font-weight: 500;">Portion: ${frappe.utils.escape_html(portionName)}</div>
						</td>
						<td style="text-align: center; font-weight: 700;">${it.qty}</td>
						<td colspan="4" style="color: #b45309; font-style: italic;">
							<i class="fa fa-clock-o"></i> ${__('Draft Recipe — Awaiting Approval. Unverified raw material requirement (no stock deducted).')}
						</td>
						<td style="text-align: center;">
							<span class="badge" style="background: #fef3c7; color: #92400e; font-weight: 600; padding: 3px 8px; border-radius: 4px; border: 1px dashed #f59e0b;">Draft (Unverified)</span>
						</td>
					</tr>
				`;
			} else {
				tableRows += `
					<tr style="background: #fffbeb;">
						<td style="font-weight: 600;">
							${frappe.utils.escape_html(it.name)}
							<div style="font-size: 0.75rem; color: #64748b; font-weight: 500;">Portion: ${frappe.utils.escape_html(portionName)}</div>
						</td>
						<td style="text-align: center; font-weight: 700;">${it.qty}</td>
						<td colspan="4" style="color: #b45309; font-style: italic;">
							<i class="fa fa-exclamation-triangle"></i> ${__('Recipe Not Configured — No ingredient consumption tracked')}
						</td>
						<td style="text-align: center;">
							<span class="badge badge-warning" style="background: #fef3c7; color: #b45309; font-weight: 600; padding: 3px 8px; border-radius: 4px;">No Recipe</span>
						</td>
					</tr>
				`;
			}
		});

		// Aggregated Summary List
		let summaryChips = '';
		if (ticket.ingredient_consumption && ticket.ingredient_consumption.length > 0) {
			summaryChips = ticket.ingredient_consumption.map(c => `
				<div style="background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; margin: 4px; display: inline-flex; align-items: center; gap: 8px;">
					<i class="fa fa-cube" style="color: #6366f1;"></i>
					<span style="font-weight: 600; color: #1e293b;">${frappe.utils.escape_html(c.ingredient_name)}:</span>
					<span style="font-weight: 700; color: #0f172a;">${c.required_display}</span>
					<span style="font-size: 0.75rem; color: #64748b;">(Stock: ${c.available_display})</span>
				</div>
			`).join('');
		} else {
			summaryChips = `<p style="color: #64748b; font-style: italic; margin: 0;">${__('No ingredients tracked for this ticket.')}</p>`;
		}

		let html = `
			<div class="kds-ingredient-details-dialog" style="padding: 4px;">
				${unconfiguredAlert}

				<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px;">
					<div>
						<div style="font-size: 0.8rem; color: #64748b; text-transform: uppercase; font-weight: 700;">${__('Order / Ticket')}</div>
						<div style="font-size: 1.1rem; font-weight: 800; color: #0f172a;">${ticket.display_order_id || ticket.order_id}</div>
					</div>
					<div>
						<div style="font-size: 0.8rem; color: #64748b; text-transform: uppercase; font-weight: 700;">${__('Table & Area')}</div>
						<div style="font-size: 1rem; font-weight: 700; color: #0f172a;">Table ${ticket.table_no} &bull; ${ticket.area}</div>
					</div>
					<div>
						<div style="font-size: 0.8rem; color: #64748b; text-transform: uppercase; font-weight: 700;">${__('Customer')}</div>
						<div style="font-size: 1rem; font-weight: 700; color: #0f172a;">${frappe.utils.escape_html(ticket.customer || 'Guest')}</div>
					</div>
					<div>
						<div style="font-size: 0.8rem; color: #64748b; text-transform: uppercase; font-weight: 700;">${__('Status')}</div>
						<div><span class="badge" style="background: #e0e7ff; color: #4338ca; font-weight: 700; padding: 4px 10px; border-radius: 4px;">${ticket.status}</span></div>
					</div>
				</div>

				<div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 8px; color: #1e293b;">
					<i class="fa fa-list-alt" style="color: #4f46e5;"></i> ${__('Dish-by-Dish Recipe Requirements')}
				</div>

				<div style="overflow-x: auto; margin-bottom: 16px;">
					<table class="table table-bordered" style="width: 100%; font-size: 0.85rem; margin-bottom: 0;">
						<thead style="background: #f1f5f9; color: #334155; font-size: 0.8rem; text-transform: uppercase;">
							<tr>
								<th>${__('Dish')}</th>
								<th style="text-align: center;">${__('Qty')}</th>
								<th>${__('Ingredient Name')}</th>
								<th style="text-align: right;">${__('Per Serving')}</th>
								<th style="text-align: right;">${__('Required Total')}</th>
								<th style="text-align: right;">${__('Kitchen Stock')}</th>
								<th style="text-align: right;">${__('Warehouse Stock')}</th>
								<th style="text-align: center;">${__('Kitchen Status')}</th>
								<th style="text-align: center;">${__('Action')}</th>
							</tr>
						</thead>
						<tbody>
							${tableRows}
						</tbody>
					</table>
				</div>

				<div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 8px; color: #1e293b;">
					<i class="fa fa-calculator" style="color: #4f46e5;"></i> ${__('Aggregated Ingredient Consumption')}
				</div>
				<div style="display: flex; flex-wrap: wrap; gap: 4px;">
					${summaryChips}
				</div>
			</div>
		`;

		let d = new frappe.ui.Dialog({
			title: __('Ingredient Consumption & Inventory Availability'),
			size: 'large',
			fields: [
				{
					fieldtype: 'HTML',
					fieldname: 'details_html',
					options: html
				}
			],
			primary_action_label: __('Close'),
			primary_action: function () {
				d.hide();
			}
		});

		d.fields_dict.details_html.$wrapper.find('.btn-dialog-transfer').on('click', function () {
			let itemName = $(this).data('item');
			let itemCode = $(this).data('code');
			let unit = $(this).data('unit');
			let needed = parseFloat($(this).data('needed'));
			let wStock = parseFloat($(this).data('warehouse'));

			frappe.prompt([
				{
					fieldname: 'qty',
					fieldtype: 'Float',
					label: __('Quantity to Transfer ({0})', [unit]),
					reqd: 1,
					default: needed,
					description: __('Required: {0} {1} | Warehouse available: {2} {1}', [needed, unit, wStock, unit])
				},
				{
					fieldname: 'staff_name',
					fieldtype: 'Data',
					label: __('Staff Member'),
					default: frappe.session.user_fullname || frappe.session.user || 'Head Chef'
				}
			], function (values) {
				frappe.call({
					method: 'restaurant_management.restaurant_management.page.restaurant_kitchen_display.restaurant_kitchen_display.transfer_warehouse_to_kitchen',
					args: {
						item_name: itemName,
						item_code: itemCode,
						qty: values.qty,
						staff_name: values.staff_name,
						reason: `Direct Transfer for Ticket ${ticket.order_id}`
					},
					callback: function (r) {
						if (r.message && r.message.success) {
							frappe.show_alert({ message: r.message.message, indicator: 'green' });
							d.hide();
							me.fetch_data(false);
						}
					}
				});
			}, __('Transfer {0} to Kitchen', [itemName]), __('Confirm Transfer'));
		});

		d.show();
	}

	show_ticket_stock_prep_dialog(ticket) {
		let me = this;
		let shortages = (ticket.ingredient_consumption || []).filter(c => !c.in_kitchen_stock);
		if (!shortages.length) {
			// No shortage, proceed to prep
			frappe.call({
				method: 'restaurant_management.restaurant_management.page.restaurant_kitchen_display.restaurant_kitchen_display.update_order_status',
				args: { order_id: ticket.order_id, status: 'Preparing' },
				callback: function (r) {
					if (r.message) {
						frappe.show_alert({ message: __('Started preparing {0}', [ticket.order_id]), indicator: 'green' });
						me.fetch_data(false);
					}
				}
			});
			return;
		}

		let rows = shortages.map(s => {
			let stockUnit = s.stock_unit || s.unit;
			let reqDisp = s.stock_required_display ? `${s.required_display} (${s.stock_required_display})` : s.required_display;
			return `
			<tr>
				<td style="font-weight: 700;">${frappe.utils.escape_html(s.ingredient_name)}</td>
				<td style="text-align: right; font-weight: 700; color: #1e293b;">${reqDisp}</td>
				<td style="text-align: right; color: #dc2626; font-weight: 700;">${s.kitchen_stock} ${stockUnit}</td>
				<td style="text-align: right; color: #16a34a; font-weight: 700;">${s.warehouse_stock} ${stockUnit}</td>
				<td style="text-align: right; font-weight: 800; color: #d97706;">${s.kitchen_missing_qty} ${stockUnit}</td>
			</tr>
			`;
		}).join('');

		let html = `
			<div style="padding: 4px;">
				<div class="alert alert-warning" style="background: #fffbeb; border: 1px solid #fef3c7; color: #92400e; padding: 10px 14px; border-radius: 6px; margin-bottom: 14px;">
					<i class="fa fa-exclamation-triangle"></i>
					<strong>${__('Kitchen Stock Required Before Cooking')}</strong>
					<div style="font-size: 0.85rem; margin-top: 4px;">
						${__('The kitchen does not have enough stock to prepare this ticket. Confirm transfer from warehouse storage to kitchen below.')}
					</div>
				</div>

				<table class="table table-bordered" style="width: 100%; font-size: 0.85rem; margin-bottom: 14px;">
					<thead style="background: #f1f5f9;">
						<tr>
							<th>${__('Ingredient')}</th>
							<th style="text-align: right;">${__('Required')}</th>
							<th style="text-align: right;">${__('In Kitchen')}</th>
							<th style="text-align: right;">${__('In Warehouse')}</th>
							<th style="text-align: right;">${__('Transfer Needed')}</th>
						</tr>
					</thead>
					<tbody>${rows}</tbody>
				</table>
			</div>
		`;

		let d = new frappe.ui.Dialog({
			title: __('Transfer Required Ingredients & Start Preparing ({0})', [ticket.display_order_id || ticket.order_id]),
			size: 'large',
			fields: [{ fieldtype: 'HTML', fieldname: 'html', options: html }],
			primary_action_label: __('Transfer Stock & Start Preparing'),
			primary_action: function () {
				d.hide();
				// Transfer each shortage in sequence then start prep
				let promises = shortages.map(s => {
					let transferQty = s.kitchen_missing_qty;
					if (s.warehouse_stock < transferQty) transferQty = s.warehouse_stock;
					return new Promise((resolve, reject) => {
						frappe.call({
							method: 'restaurant_management.restaurant_management.page.restaurant_kitchen_display.restaurant_kitchen_display.transfer_warehouse_to_kitchen',
							args: {
								item_name: s.ingredient_name,
								item_code: s.item_code,
								qty: transferQty,
								reason: `Transferred for ${ticket.order_id} food prep`
							},
							callback: function (r) {
								if (r.message && r.message.success) resolve();
								else reject();
							}
						});
					});
				});

				Promise.all(promises).then(() => {
					frappe.call({
						method: 'restaurant_management.restaurant_management.page.restaurant_kitchen_display.restaurant_kitchen_display.update_order_status',
						args: { order_id: ticket.order_id, status: 'Preparing' },
						callback: function (r) {
							if (r.message) {
								frappe.show_alert({
									message: __('Transferred stock to kitchen and started preparing {0}!', [ticket.order_id]),
									indicator: 'green'
								});
								me.fetch_data(false);
							}
						}
					});
				}).catch(() => {
					me.fetch_data(false);
				});
			},
			secondary_action_label: __('Manage Kitchen Stock'),
			secondary_action: function () {
				d.hide();
				me.show_kitchen_stock_dialog();
			}
		});
		d.show();
	}

	show_kitchen_stock_dialog() {
		let me = this;
		let d = new frappe.ui.Dialog({
			title: __('Kitchen Stock & Warehouse Transfers'),
			size: 'extra-large',
			fields: [
				{
					fieldtype: 'HTML',
					fieldname: 'stock_html'
				}
			],
			primary_action_label: __('Close'),
			primary_action: function () {
				d.hide();
				me.fetch_data(false);
			}
		});

		function loadSummary() {
			frappe.call({
				method: 'restaurant_management.restaurant_management.page.restaurant_kitchen_display.restaurant_kitchen_display.get_kitchen_stock_summary',
				callback: function (r) {
					if (r.message) {
						renderStockUI(r.message);
					}
				}
			});
		}

		function renderStockUI(data) {
			let items = data.items || [];
			let movements = data.movements || [];

			let itemOptions = items.map(i => `<option value="${frappe.utils.escape_html(i.name)}" data-unit="${i.unit}" data-warehouse="${i.warehouse_stock}" data-kitchen="${i.kitchen_stock}">${frappe.utils.escape_html(i.name)} (${i.item_code}) — Warehouse: ${i.warehouse_stock} ${i.unit}</option>`).join('');

			let rows = items.map(i => {
				let kBadge = i.kitchen_stock > 0 
					? `<span class="badge badge-success" style="background: #ecfdf5; color: #047857; font-weight: 700; padding: 4px 8px; border-radius: 4px;">${i.kitchen_stock} ${i.unit}</span>`
					: `<span class="badge badge-danger" style="background: #fef2f2; color: #b91c1c; font-weight: 700; padding: 4px 8px; border-radius: 4px;">0 ${i.unit} (Empty)</span>`;

				let wBadge = `<span style="font-weight: 700; color: #1e293b;">${i.warehouse_stock} ${i.unit}</span>`;

				return `
					<tr>
						<td style="font-weight: 700; color: #4f46e5;">${frappe.utils.escape_html(i.item_code)}</td>
						<td>
							<div style="font-weight: 700; color: #0f172a;">${frappe.utils.escape_html(i.name)}</div>
							<div style="font-size: 0.75rem; color: #64748b;">${frappe.utils.escape_html(i.category)} &bull; ${frappe.utils.escape_html(i.location)}</div>
						</td>
						<td style="text-align: right;">${wBadge}</td>
						<td style="text-align: right;">${kBadge}</td>
						<td style="text-align: right; font-weight: 600; color: #64748b;">${i.quantity} ${i.unit}</td>
						<td style="text-align: center;">
							<button type="button" class="btn btn-xs btn-primary btn-quick-transfer" data-item="${frappe.utils.escape_html(i.name)}" data-unit="${i.unit}" data-warehouse="${i.warehouse_stock}" style="font-weight: 700; padding: 2px 8px;">
								<i class="fa fa-arrow-right"></i> ${__('Transfer to Kitchen')}
							</button>
							${i.kitchen_stock > 0 ? `
								<button type="button" class="btn btn-xs btn-default btn-quick-return" data-item="${frappe.utils.escape_html(i.name)}" data-unit="${i.unit}" data-kitchen="${i.kitchen_stock}" style="font-weight: 600; padding: 2px 8px; margin-left: 4px;">
									<i class="fa fa-undo"></i> ${__('Return')}
								</button>
							` : ''}
						</td>
					</tr>
				`;
			}).join('');

			let movRows = movements.map(m => `
				<tr>
					<td style="font-size: 0.8rem; color: #64748b;">${m.timestamp}</td>
					<td style="font-weight: 700;">${frappe.utils.escape_html(m.item_name)}</td>
					<td><span class="badge" style="background: #eff6ff; color: #1d4ed8; font-weight: 600; padding: 3px 6px;">${m.movement_type}</span></td>
					<td style="text-align: right; font-weight: 700;">${m.qty} ${m.unit}</td>
					<td>${frappe.utils.escape_html(m.from_location)} &rarr; ${frappe.utils.escape_html(m.to_location)}</td>
					<td><span style="font-size: 0.8rem; color: #475569;">${frappe.utils.escape_html(m.user || 'Chef')}</span></td>
					<td style="font-size: 0.8rem; color: #64748b;">${frappe.utils.escape_html(m.reason || '')}</td>
				</tr>
			`).join('');

			let html = `
				<div class="kds-kitchen-stock-container" style="padding: 4px;">
					<!-- Top Transfer Form -->
					<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px;">
						<div style="font-weight: 800; font-size: 0.95rem; margin-bottom: 10px; color: #0f172a; display: flex; align-items: center; justify-content: space-between;">
							<span><i class="fa fa-exchange" style="color: #4f46e5;"></i> ${__('Warehouse to Kitchen Stock Movement')}</span>
							<span style="font-size: 0.8rem; color: #64748b; font-weight: 500;">${__('Stock moves from warehouse storage to kitchen counter')}</span>
						</div>
						<div class="row" style="margin-bottom: 0;">
							<div class="col-sm-4">
								<label style="font-size: 0.8rem; font-weight: 700; color: #475569; margin-bottom: 4px;">${__('Select Ingredient')}</label>
								<select class="form-control input-sm" id="kds-trans-item">${itemOptions}</select>
							</div>
							<div class="col-sm-2">
								<label style="font-size: 0.8rem; font-weight: 700; color: #475569; margin-bottom: 4px;">${__('Transfer Qty')}</label>
								<input type="number" step="0.1" min="0.1" class="form-control input-sm" id="kds-trans-qty" placeholder="1.0" value="1.0">
							</div>
							<div class="col-sm-3">
								<label style="font-size: 0.8rem; font-weight: 700; color: #475569; margin-bottom: 4px;">${__('Staff Member')}</label>
								<input type="text" class="form-control input-sm" id="kds-trans-staff" value="${frappe.session.user_fullname || frappe.session.user || 'Head Chef'}">
							</div>
							<div class="col-sm-3" style="display: flex; align-items: flex-end;">
								<button type="button" class="btn btn-sm btn-primary btn-block" id="btn-exec-transfer" style="font-weight: 700; height: 30px;">
									<i class="fa fa-check"></i> ${__('Confirm Transfer')}
								</button>
							</div>
						</div>
					</div>

					<!-- Navigation Tabs -->
					<ul class="nav nav-tabs" style="margin-bottom: 12px;">
						<li class="active"><a data-toggle="tab" href="#tab-kds-stock-inventory" style="font-weight: 700;"><i class="fa fa-cubes"></i> ${__('Current Stock (Kitchen vs Warehouse)')}</a></li>
						<li><a data-toggle="tab" href="#tab-kds-stock-movements" style="font-weight: 700;"><i class="fa fa-history"></i> ${__('Movement History')}</a></li>
					</ul>

					<div class="tab-content">
						<div id="tab-kds-stock-inventory" class="tab-pane active">
							<div style="overflow-x: auto; max-height: 380px;">
								<table class="table table-bordered table-hover" style="font-size: 0.85rem; margin-bottom: 0;">
									<thead style="background: #f1f5f9; position: sticky; top: 0; z-index: 2;">
										<tr>
											<th>${__('Code')}</th>
											<th>${__('Ingredient Name & Location')}</th>
											<th style="text-align: right;">${__('Warehouse Stock')}</th>
											<th style="text-align: right;">${__('Kitchen Stock')}</th>
											<th style="text-align: right;">${__('Total Restaurant Stock')}</th>
											<th style="text-align: center;">${__('Actions')}</th>
										</tr>
									</thead>
									<tbody>${rows}</tbody>
								</table>
							</div>
						</div>

						<div id="tab-kds-stock-movements" class="tab-pane">
							<div style="overflow-x: auto; max-height: 380px;">
								<table class="table table-bordered table-striped" style="font-size: 0.8rem; margin-bottom: 0;">
									<thead style="background: #f1f5f9; position: sticky; top: 0; z-index: 2;">
										<tr>
											<th>${__('Date & Time')}</th>
											<th>${__('Item Name')}</th>
											<th>${__('Movement Type')}</th>
											<th style="text-align: right;">${__('Quantity')}</th>
											<th>${__('Source &rarr; Destination')}</th>
											<th>${__('Staff Member')}</th>
											<th>${__('Notes / Reason')}</th>
										</tr>
									</thead>
									<tbody>${movRows.length ? movRows : `<tr><td colspan="7" class="text-center text-muted" style="padding: 20px;">${__('No movements recorded yet.')}</td></tr>`}</tbody>
								</table>
							</div>
						</div>
					</div>
				</div>
			`;

			d.fields_dict.stock_html.$wrapper.html(html);

			// Bind Transfer Execution
			d.fields_dict.stock_html.$wrapper.find('#btn-exec-transfer').on('click', function () {
				let itemName = $('#kds-trans-item').val();
				let qty = parseFloat($('#kds-trans-qty').val());
				let staff = $('#kds-trans-staff').val();

				if (!itemName || isNaN(qty) || qty <= 0) {
					frappe.msgprint(__('Please select an item and enter a valid transfer quantity (> 0).'));
					return;
				}

				frappe.call({
					method: 'restaurant_management.restaurant_management.page.restaurant_kitchen_display.restaurant_kitchen_display.transfer_warehouse_to_kitchen',
					args: {
						item_name: itemName,
						qty: qty,
						staff_name: staff,
						reason: 'KDS Manual Transfer to Kitchen'
					},
					callback: function (r) {
						if (r.message && r.message.success) {
							frappe.show_alert({
								message: r.message.message || __('Transferred successfully'),
								indicator: 'green'
							});
							loadSummary();
						}
					}
				});
			});

			// Quick Transfer button in table
			d.fields_dict.stock_html.$wrapper.find('.btn-quick-transfer').on('click', function () {
				let itemName = $(this).data('item');
				let unit = $(this).data('unit');
				let wStock = parseFloat($(this).data('warehouse'));

				frappe.prompt([
					{
						fieldname: 'qty',
						fieldtype: 'Float',
						label: __('Quantity to Transfer ({0})', [unit]),
						reqd: 1,
						default: 1.0,
						description: __('Available in warehouse: {0} {1}', [wStock, unit])
					},
					{
						fieldname: 'staff_name',
						fieldtype: 'Data',
						label: __('Staff Member'),
						default: frappe.session.user_fullname || frappe.session.user || 'Head Chef'
					}
				], function (values) {
					frappe.call({
						method: 'restaurant_management.restaurant_management.page.restaurant_kitchen_display.restaurant_kitchen_display.transfer_warehouse_to_kitchen',
						args: {
							item_name: itemName,
							qty: values.qty,
							staff_name: values.staff_name
						},
						callback: function (r) {
							if (r.message && r.message.success) {
								frappe.show_alert({ message: r.message.message, indicator: 'green' });
								loadSummary();
							}
						}
					});
				}, __('Transfer {0} to Kitchen', [itemName]), __('Confirm Transfer'));
			});

			// Quick Return button in table
			d.fields_dict.stock_html.$wrapper.find('.btn-quick-return').on('click', function () {
				let itemName = $(this).data('item');
				let unit = $(this).data('unit');
				let kStock = parseFloat($(this).data('kitchen'));

				frappe.prompt([
					{
						fieldname: 'qty',
						fieldtype: 'Float',
						label: __('Quantity to Return ({0})', [unit]),
						reqd: 1,
						default: Math.min(1.0, kStock),
						description: __('Available in kitchen: {0} {1}', [kStock, unit])
					},
					{
						fieldname: 'staff_name',
						fieldtype: 'Data',
						label: __('Staff Member'),
						default: frappe.session.user_fullname || frappe.session.user || 'Kitchen Staff'
					}
				], function (values) {
					frappe.call({
						method: 'restaurant_management.restaurant_management.page.restaurant_kitchen_display.restaurant_kitchen_display.transfer_kitchen_to_warehouse',
						args: {
							item_name: itemName,
							qty: values.qty,
							staff_name: values.staff_name
						},
						callback: function (r) {
							if (r.message && r.message.success) {
								frappe.show_alert({ message: r.message.message, indicator: 'green' });
								loadSummary();
							}
						}
					});
				}, __('Return {0} to Warehouse', [itemName]), __('Confirm Return'));
			});
		}

		d.show();
		loadSummary();
	}

}
