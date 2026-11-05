// Copyright (c) 2026, Nahusha and contributors
// For license information, please see license.txt

frappe.pages['restaurant-floor-management'].on_page_load = function (wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __('Floor & Table Management'),
		single_column: true
	});

	frappe.breadcrumbs.add('Restaurant Management');

	// Top Section Actions
	page.set_primary_action(__('New Order (POS)'), function () {
		if (wrapper.floor_mgmt) {
			let selected = wrapper.floor_mgmt.get_table(wrapper.floor_mgmt.selected_table_no);
			let is_available = selected && selected.status === 'Available';
			wrapper.floor_mgmt.open_order_modal(is_available ? selected : null);
		} else if (frappe.restaurant && typeof frappe.restaurant.open_pos_dialog === 'function') {
			frappe.restaurant.open_pos_dialog({
				on_success: function () {
					if (wrapper.floor_mgmt) wrapper.floor_mgmt.refresh();
				}
			});
		}
	}, 'fa fa-plus');

	page.add_button(__('Refresh'), function () {
		if (wrapper.floor_mgmt) {
			wrapper.floor_mgmt.refresh();
		}
	}, 'fa fa-refresh');

	page.add_menu_item(__('Reset Demo Tables'), function () {
		frappe.confirm(
			__('Are you sure you want to reset all tables back to the initial demo state?'),
			function () {
				frappe.call({
					method: 'restaurant_management.restaurant_management.page.restaurant_floor_management.restaurant_floor_management.reset_floor_data',
					callback: function (r) {
						if (r.message && wrapper.floor_mgmt) {
							wrapper.floor_mgmt.data = r.message;
							wrapper.floor_mgmt.render_all();
							frappe.show_alert({
								message: __('Floor plan reset to default state.'),
								indicator: 'green'
							});
						}
					}
				});
			}
		);
	});

	wrapper.floor_mgmt = new FloorManagement(wrapper, page);
};

frappe.pages['restaurant-floor-management'].on_page_show = function (wrapper) {
	if (wrapper.floor_mgmt) {
		wrapper.floor_mgmt.refresh();
	}
};

class FloorManagement {
	constructor(wrapper, page) {
		this.wrapper = wrapper;
		this.page = page;
		this.data = null;
		this.current_area = 'Main Dining Hall'; // Default to primary dining area
		this.current_status = 'All'; // Strictly: 'All', 'Available', 'Occupied', 'Reserved'
		this.selected_table_no = 'T-02';
		this.search_query = '';

		// 2D Pan & Zoom Navigation State
		this.zoom = 1.0;
		this.panX = 0;
		this.panY = 0;
		this.is_dragging = false;
		this.drag_start_x = 0;
		this.drag_start_y = 0;

		// Menu items for ordering modals
		this.menu_items = [];
		this.cart = [];
		this.selected_category = 'All';

		this.init();
	}

	init() {
		this.render_skeleton();
		this.fetch_data();
	}

	render_skeleton() {
		this.page.main.empty();
		this.container = $(`
			<div class="floor-management-wrapper">
				<!-- Top Header Section -->
				<div class="floor-header">
					<div class="floor-header-left">
						<p class="floor-subtitle">
							<span class="live-indicator-pill">
								<span class="pulse-dot"></span>
								${__('Live Floor Monitor')}
							</span>
							${__('Real-time table occupancy, architectural 2D floor plan & seating assignments')}
						</p>
					</div>
					<div>
						<span class="text-muted" style="font-size: 0.8rem;">
							<i class="fa fa-clock-o"></i> ${__('Last updated:')} <span class="floor-last-updated">${frappe.datetime.now_time()}</span>
						</span>
					</div>
				</div>

				<!-- Summary KPI Cards Grid (Strictly 3 Statuses: Available, Occupied, Reserved) -->
				<div class="floor-kpi-grid">
					<div class="floor-kpi-card kpi-total clickable-kpi" title="${__('Filter All Tables')}">
						<div class="floor-kpi-header">
							<span class="floor-kpi-title">${__('Total Tables')}</span>
							<div class="floor-kpi-icon"><i class="fa fa-th"></i></div>
						</div>
						<div class="floor-kpi-value" id="kpi-floor-total">--</div>
						<div class="floor-kpi-footer">
							<span style="font-weight: 700; color: #ea580c;" id="kpi-floor-occupancy">0%</span>
							<span>${__('overall occupancy')}</span>
						</div>
					</div>

					<div class="floor-kpi-card kpi-available clickable-kpi" title="${__('Filter Available Tables')}">
						<div class="floor-kpi-header">
							<span class="floor-kpi-title">${__('Available')}</span>
							<div class="floor-kpi-icon"><i class="fa fa-check-circle"></i></div>
						</div>
						<div class="floor-kpi-value" id="kpi-floor-available" style="color: #059669;">--</div>
						<div class="floor-kpi-footer">
							<span style="color: #059669; font-weight: 600;">${__('Ready to seat')}</span>
						</div>
					</div>

					<div class="floor-kpi-card kpi-reserved clickable-kpi" title="${__('Filter Reserved Tables')}">
						<div class="floor-kpi-header">
							<span class="floor-kpi-title">${__('Reserved')}</span>
							<div class="floor-kpi-icon"><i class="fa fa-calendar-check-o"></i></div>
						</div>
						<div class="floor-kpi-value" id="kpi-floor-reserved" style="color: #d97706;">--</div>
						<div class="floor-kpi-footer">
							<span style="color: #d97706; font-weight: 600;">${__('Booked for today')}</span>
						</div>
					</div>

					<div class="floor-kpi-card kpi-occupied clickable-kpi" title="${__('Filter Occupied Tables')}">
						<div class="floor-kpi-header">
							<span class="floor-kpi-title">${__('Occupied')}</span>
							<div class="floor-kpi-icon"><i class="fa fa-users"></i></div>
						</div>
						<div class="floor-kpi-value" id="kpi-floor-occupied" style="color: #1e293b;">--</div>
						<div class="floor-kpi-footer">
							<span style="color: #1e293b; font-weight: 600;">${__('Currently dining')}</span>
						</div>
					</div>
				</div>

				<!-- Toolbar: Area Tabs, Status Filters & Table Search -->
				<div class="floor-controls-bar">
					<div class="floor-controls-left">
						<div class="floor-area-tabs" id="floor-area-tabs">
							<!-- Dynamically populated -->
						</div>

						<div class="floor-status-filters" id="floor-status-filters">
							<button class="status-filter-btn active" data-status="All">
								<span>${__('All')}</span>
								<span class="filter-count-badge" id="filter-count-all">--</span>
							</button>
							<button class="status-filter-btn" data-status="Available">
								<span class="status-filter-dot dot-available"></span>
								<span>${__('Available')}</span>
								<span class="filter-count-badge" id="filter-count-available">--</span>
							</button>
							<button class="status-filter-btn" data-status="Reserved">
								<span class="status-filter-dot dot-reserved"></span>
								<span>${__('Reserved')}</span>
								<span class="filter-count-badge" id="filter-count-reserved">--</span>
							</button>
							<button class="status-filter-btn" data-status="Occupied">
								<span class="status-filter-dot dot-occupied"></span>
								<span>${__('Occupied')}</span>
								<span class="filter-count-badge" id="filter-count-occupied">--</span>
							</button>
						</div>
					</div>

					<div class="floor-controls-right">
						<div class="floor-search-box">
							<i class="fa fa-search search-icon"></i>
							<input type="text" class="floor-search-input" id="floor-table-search" placeholder="${__('Search table (e.g. T-04)...')}" />
							<button type="button" class="btn-clear-search" id="btn-clear-search" style="display: none;"><i class="fa fa-times"></i></button>
						</div>
					</div>
				</div>

				<!-- Main 2D Floor Plan Layout: 2D Canvas + Right Details Panel -->
				<div class="floor-workspace-layout" id="floor-workspace-layout">
					<!-- Left: Large Realistic 2D Architectural Floor Plan -->
					<div class="floor-2d-viewport" id="floor-2d-viewport">
						<!-- Strict 3-Status Legend (Top Left) -->
						<div class="floor-2d-legend">
							<div class="legend-item">
								<span class="legend-swatch swatch-available"></span>
								<span>${__('Available')}</span>
							</div>
							<div class="legend-item">
								<span class="legend-swatch swatch-reserved"></span>
								<span>${__('Reserved')}</span>
							</div>
							<div class="legend-item">
								<span class="legend-swatch swatch-occupied"></span>
								<span>${__('Occupied')}</span>
							</div>
						</div>

						<!-- Navigation Controls Overlay (Top Right) -->
						<div class="floor-2d-controls">
							<button class="floor-ctrl-btn" id="ctrl-zoom-in" title="${__('Zoom In')}">
								<i class="fa fa-plus"></i>
							</button>
							<button class="floor-ctrl-btn" id="ctrl-zoom-out" title="${__('Zoom Out')}">
								<i class="fa fa-minus"></i>
							</button>
							<button class="floor-ctrl-btn" id="ctrl-zoom-reset" title="${__('Reset View')}">
								<i class="fa fa-arrows-alt"></i> ${__('Reset')}
							</button>
							<button class="floor-ctrl-btn" id="ctrl-fullscreen" title="${__('Toggle Fullscreen')}">
								<i class="fa fa-expand"></i>
							</button>
						</div>

						<!-- 2D Floor Canvas (Pan & Zoom Container) -->
						<div class="floor-2d-canvas" id="floor-2d-canvas">
							<div class="floor-2d-stage" id="floor-2d-stage">
								<!-- Architectural 2D room & tables rendered here -->
							</div>
						</div>

						<!-- Bottom Pan/Zoom Hint -->
						<div class="floor-2d-hint">
							<i class="fa fa-hand-pointer-o"></i> ${__('Click table to select &bull; Drag to pan &bull; Scroll to zoom')}
						</div>
					</div>

					<!-- Right: Selected Table Details Panel -->
					<div class="floor-detail-panel" id="floor-detail-panel">
						<!-- Dynamically populated based on selected table -->
					</div>
				</div>
			</div>
		`).appendTo(this.page.main);

		this.bind_events();
	}

	get_table(table_no) {
		return (this.data && this.data.tables) ? this.data.tables.find(t => t.table_no === table_no) : null;
	}

	bind_events() {
		let me = this;

		// 1. Status Filter Buttons
		this.container.on('click', '.status-filter-btn', function (e) {
			e.preventDefault();
			$('.status-filter-btn').removeClass('active');
			$(this).addClass('active');
			me.current_status = $(this).data('status');
			me.render_2d_floor_plan();
		});

		// 1b. Interactive KPI Cards (Click to filter status)
		this.container.on('click', '.clickable-kpi', function (e) {
			e.preventDefault();
			let $card = $(this);
			let target = 'All';
			if ($card.hasClass('kpi-available')) target = 'Available';
			else if ($card.hasClass('kpi-reserved')) target = 'Reserved';
			else if ($card.hasClass('kpi-occupied')) target = 'Occupied';
			else if ($card.hasClass('kpi-total')) target = 'All';

			$('.status-filter-btn').removeClass('active');
			$(`.status-filter-btn[data-status="${target}"]`).addClass('active');
			me.current_status = target;
			me.render_2d_floor_plan();
		});

		// 2. Area Selection Tabs
		this.container.on('click', '.area-tab-btn', function (e) {
			e.preventDefault();
			$('.area-tab-btn').removeClass('active');
			$(this).addClass('active');
			me.current_area = $(this).data('area');

			// If current selected table is not in this area, select the first table of this area
			let areaTables = (me.data && me.data.tables) ? me.data.tables.filter(t => t.area === me.current_area) : [];
			if (areaTables.length > 0 && (!me.get_table(me.selected_table_no) || me.get_table(me.selected_table_no).area !== me.current_area)) {
				me.selected_table_no = areaTables[0].table_no;
			}

			me.reset_view();
			me.render_2d_floor_plan();
			me.render_detail_panel();
		});

		// 3. Search Table Input
		this.container.on('input', '#floor-table-search', function () {
			let val = $(this).val().trim();
			me.search_query = val.toLowerCase();
			if (val) {
				$('#btn-clear-search').show();
			} else {
				$('#btn-clear-search').hide();
			}

			if (me.search_query && me.data && me.data.tables) {
				let matched = me.data.tables.find(t =>
					t.table_no.toLowerCase() === me.search_query ||
					t.table_no.toLowerCase().replace('-', '') === me.search_query.replace('-', '') ||
					t.table_no.toLowerCase().endsWith(me.search_query)
				);
				if (matched) {
					// Switch to matching table's area if needed
					if (matched.area !== me.current_area) {
						me.current_area = matched.area;
						$(`.area-tab-btn`).removeClass('active');
						$(`.area-tab-btn[data-area="${matched.area}"]`).addClass('active');
					}
					me.selected_table_no = matched.table_no;
					me.render_2d_floor_plan();
					me.render_detail_panel();
				}
			}
		});

		this.container.on('click', '#btn-clear-search', function () {
			$('#floor-table-search').val('');
			me.search_query = '';
			$(this).hide();
			me.render_2d_floor_plan();
		});

		// 4. Viewport Navigation: Zoom In, Out, Reset, Fullscreen
		this.container.on('click', '#ctrl-zoom-in', function (e) {
			e.preventDefault();
			me.zoom_in();
		});

		this.container.on('click', '#ctrl-zoom-out', function (e) {
			e.preventDefault();
			me.zoom_out();
		});

		this.container.on('click', '#ctrl-zoom-reset', function (e) {
			e.preventDefault();
			me.reset_view();
		});

		this.container.on('click', '#ctrl-fullscreen', function (e) {
			e.preventDefault();
			me.toggle_fullscreen();
		});

		// 5. 2D Table Selection Click
		this.container.on('click', '.t2d-table-wrapper', function (e) {
			e.stopPropagation();
			let table_no = $(this).data('table-no');
			me.selected_table_no = table_no;
			me.highlight_selected_table();
			me.render_detail_panel();
		});

		// 6. Mouse Drag Panning on 2D Canvas
		this.container.on('mousedown', '#floor-2d-canvas', function (e) {
			if ($(e.target).closest('.t2d-table-wrapper, .floor-2d-controls, .floor-2d-legend').length) {
				return;
			}
			me.is_dragging = true;
			me.drag_start_x = e.clientX - me.panX;
			me.drag_start_y = e.clientY - me.panY;
			$(this).addClass('is-panning');
		});

		$(document).on('mousemove.floor2d', function (e) {
			if (!me.is_dragging) return;
			me.panX = e.clientX - me.drag_start_x;
			me.panY = e.clientY - me.drag_start_y;
			me.apply_transform();
		});

		$(document).on('mouseup.floor2d', function () {
			if (me.is_dragging) {
				me.is_dragging = false;
				$('#floor-2d-canvas').removeClass('is-panning');
			}
		});

		// 7. Mouse Wheel Zoom on 2D Canvas
		this.container.on('wheel', '#floor-2d-canvas', function (e) {
			e.preventDefault();
			let delta = e.originalEvent.deltaY;
			if (delta < 0) {
				me.zoom = Math.min(1.85, me.zoom + 0.08);
			} else {
				me.zoom = Math.max(0.55, me.zoom - 0.08);
			}
			me.apply_transform();
		});

		// 8. Selected Table Detail Panel Actions
		this.container.on('click', '.btn-panel-seat', function () {
			let table = me.get_table(me.selected_table_no);
			if (table) me.open_table_dialog(table, 'seat');
		});

		this.container.on('click', '.btn-panel-seat-reserved', function () {
			let table = me.get_table(me.selected_table_no);
			if (table) me.open_table_dialog(table, 'checkin');
		});

		this.container.on('click', '.btn-panel-details', function () {
			let table = me.get_table(me.selected_table_no);
			if (table) {
				let mode = (table.status === 'Occupied')
					? 'manage'
					: ((table.status === 'Reserved') ? 'checkin' : 'seat');
				me.open_table_dialog(table, mode);
			}
		});

		this.container.on('click', '.btn-panel-manage', function () {
			let table = me.get_table(me.selected_table_no);
			if (table) me.open_table_dialog(table, 'manage');
		});

		this.container.on('click', '.btn-panel-order', function () {
			let table = me.get_table(me.selected_table_no);
			if (table) {
				let is_addon = Boolean(table.order_id);
				me.open_order_modal(table, is_addon);
			}
		});

		this.container.on('click', '.btn-panel-transfer', function () {
			let table = me.get_table(me.selected_table_no);
			if (table) me.open_table_transfer_dialog(table);
		});

		this.container.on('click', '.btn-panel-bill', function () {
			let table = me.get_table(me.selected_table_no);
			if (table && table.order_id) {
				me.open_receipt_dialog(table.order_id);
			}
		});

		this.container.on('click', '.btn-panel-cust-history', function () {
			let cust_id = $(this).data('cust-id');
			let mobile = $(this).data('mobile');
			if (cust_id || mobile) {
				me.open_customer_history_dialog(cust_id || mobile);
			}
		});
	}

	refresh() {
		this.fetch_data();
	}

	fetch_data() {
		let me = this;
		frappe.call({
			method: 'restaurant_management.restaurant_management.page.restaurant_floor_management.restaurant_floor_management.get_floor_data',
			callback: function (r) {
				if (r.message) {
					me.data = r.message;
					if (r.message.menu_items) {
						me.menu_items = r.message.menu_items;
					}
					// Ensure valid selected table
					if (me.data.tables && me.data.tables.length) {
						if (!me.get_table(me.selected_table_no)) {
							me.selected_table_no = me.data.tables[0].table_no;
						}
					}
					me.render_all();
				}
			},
			error: function (err) {
				frappe.msgprint(__('Failed to load floor layout data.'));
				console.error(err);
			}
		});
	}

	render_all() {
		if (!this.data) return;
		this.container.find('.floor-last-updated').text(frappe.datetime.now_time());
		this.render_summary(this.data.summary);
		this.render_area_tabs(this.data.areas);
		this.render_2d_floor_plan();
		this.render_detail_panel();
	}

	render_summary(summary) {
		const allTables = (this.data && this.data.tables) ? this.data.tables : [];
		const total = allTables.length || (summary && summary.total != null ? summary.total : 0);
		const occupied = allTables.filter(t => t.status === 'Occupied').length;
		const reserved = allTables.filter(t => t.status === 'Reserved').length;
		const available = Math.max(0, total - occupied - reserved);
		const occupancy_pct = total > 0 ? Math.round((occupied / total) * 100) + '%' : '0%';

		$('#kpi-floor-total').text(total);
		$('#kpi-floor-available').text(available);
		$('#kpi-floor-reserved').text(reserved);
		$('#kpi-floor-occupied').text(occupied);
		$('#kpi-floor-occupancy').text(`${occupancy_pct} ${__('occupancy')}`);

		$('#filter-count-all').text(total);
		$('#filter-count-available').text(available);
		$('#filter-count-reserved').text(reserved);
		$('#filter-count-occupied').text(occupied);
	}

	render_area_tabs(areas) {
		let $tabs = $('#floor-area-tabs').empty();
		if (!areas || !areas.length) return;

		// Filter out 'All Areas' from primary room tabs or keep specific 3 dining areas
		let roomAreas = areas.filter(a => a.name !== 'All Areas');
		if (roomAreas.length === 0) roomAreas = areas;

		roomAreas.forEach(area => {
			let isActive = (area.name === this.current_area) ? 'active' : '';
			$(`
				<button class="area-tab-btn ${isActive}" data-area="${area.name}">
					<span>${__(area.name)}</span>
					<span class="area-tab-badge">${area.count}</span>
				</button>
			`).appendTo($tabs);
		});
	}

	// =========================================================================
	// Realistic Top-Down 2D Architectural Floor Plan Rendering
	// =========================================================================
	render_2d_floor_plan() {
		let $stage = $('#floor-2d-stage').empty();
		let allTables = (this.data && this.data.tables) ? this.data.tables : [];

		if (this.current_area === 'Garden Patio') {
			this.render_garden_patio_2d($stage, allTables);
		} else if (this.current_area === 'Rooftop Terrace') {
			this.render_rooftop_terrace_2d($stage, allTables);
		} else {
			// Default: Main Dining Hall
			this.render_main_dining_hall_2d($stage, allTables);
		}

		this.apply_transform();
	}

	// --- Area 1: Main Dining Hall 2D Architectural Layout (12 Tables: T-01 to T-12) ---
	render_main_dining_hall_2d($stage, allTables) {
		let $room = $(`
			<div class="floor-plan-room room-main-dining">
				<!-- Luxury Top-Down Architectural Interior Visualization (CAD Reference Blueprint) -->
				<!-- Architectural Zone Callouts -->
				<div class="zone-callout" style="top: 242px; left: 140px;">
					<i class="fa fa-coffee"></i> ${__('Sunlit Lounge Bay')}
				</div>
				<div class="zone-callout" style="top: 242px; left: 470px;">
					<i class="fa fa-cutlery"></i> ${__('Chef Pass & Service Bar')}
				</div>
				<div class="zone-callout" style="top: 235px; left: 690px;">
					<i class="fa fa-star" style="color: #f59e0b;"></i> ${__('VIP Private Dining Suite')}
				</div>
				<div class="zone-callout" style="top: 590px; left: 380px;">
					<i class="fa fa-leaf" style="color: #10b981;"></i> ${__('Illuminated Garden Aisle')}
				</div>

				<!-- Dining Tables Layer (Precise Architectural Alignment) -->
				<div class="tables-layer" id="tables-layer-main"></div>
			</div>
		`).appendTo($stage);

		// 12 Dining Tables (T-01 to T-12) Exactly Aligned to the Architectural Interior Layout
		let coords = {
			'T-01': { x: 192, y: 330, w: 76, h: 76, shape: 'round' }, // Sunlit Lounge Round Table
			'T-02': { x: 180, y: 430, w: 76, h: 50, shape: 'rect' },  // Sunlit Lounge Table with Green Armchairs & Sofa
			'T-03': { x: 550, y: 335, w: 66, h: 66, shape: 'round' }, // Main Hall Upper Center 4-Seater
			'T-04': { x: 695, y: 290, w: 64, h: 72, shape: 'rect' },  // VIP Private Suite 6-Seater (Top-Left)
			'T-05': { x: 328, y: 318, w: 46, h: 64, shape: 'rect' },  // Lounge Alcove 2-Seater Table
			'T-06': { x: 422, y: 315, w: 74, h: 52, shape: 'rect' },  // Chef Counter View Table with Green Armchairs
			'T-07': { x: 550, y: 475, w: 66, h: 66, shape: 'round' }, // Main Hall Lower Center 4-Seater
			'T-08': { x: 785, y: 315, w: 74, h: 52, shape: 'rect' },  // VIP Private Suite 6-Seater (Top-Right)
			'T-09': { x: 335, y: 565, w: 56, h: 56, shape: 'round' }, // Garden Aisle Cozy 2-Seater
			'T-10': { x: 440, y: 475, w: 64, h: 78, shape: 'rect' },  // Center Dining 4-Seater with Cognac Leather Armchairs
			'T-11': { x: 445, y: 565, w: 74, h: 52, shape: 'rect' },  // Garden Aisle 4-Seater against Greenery Hedge
			'T-12': { x: 740, y: 430, w: 82, h: 58, shape: 'rect' },  // VIP Private Suite 6-Seater (Lower Suite)
		};

		let $tablesLayer = $room.find('#tables-layer-main');
		let areaTables = allTables.filter(t => t.area === 'Main Dining Hall');

		areaTables.forEach(table => {
			let c = coords[table.table_no];
			if (!c) return;
			$tablesLayer.append(this.create_2d_table_html(table, c));
		});
	}

	// --- Area 2: Garden Patio 2D Architectural Layout (4 Tables: T-13 to T-16) ---
	render_garden_patio_2d($stage, allTables) {
		let $room = $(`
			<div class="floor-plan-room room-garden-patio">
				<!-- Background Architectural Canvas (SVG): Natural Flagstone Pavers, Perimeter Biophilia & Pergola Rafters -->
				<svg class="room-floor-svg" width="987" height="736" viewBox="0 0 987 736" xmlns="http://www.w3.org/2000/svg">
					<defs>
						<!-- Rich Sandstone & Flagstone Paving Pattern -->
						<pattern id="flagstone-pattern" width="80" height="80" patternUnits="userSpaceOnUse">
							<rect width="80" height="80" fill="#cfc8b8" />
							<rect x="2" y="2" width="36" height="24" fill="#dfd8cb" stroke="#7e7465" stroke-width="1.8" rx="3" />
							<rect x="40" y="2" width="38" height="36" fill="#c7bfae" stroke="#7e7465" stroke-width="1.8" rx="3" />
							<rect x="2" y="28" width="36" height="50" fill="#e8e2d4" stroke="#7e7465" stroke-width="1.8" rx="3" />
							<rect x="40" y="40" width="38" height="38" fill="#d5cdbc" stroke="#7e7465" stroke-width="1.8" rx="3" />
							<circle cx="20" cy="14" r="1.5" fill="#52644e" opacity="0.35" />
							<circle cx="62" cy="18" r="1.2" fill="#52644e" opacity="0.35" />
							<circle cx="18" cy="54" r="1.5" fill="#52644e" opacity="0.35" />
							<circle cx="60" cy="62" r="1.2" fill="#52644e" opacity="0.35" />
						</pattern>

						<radialGradient id="sunlight-patio" cx="30%" cy="30%" r="75%">
							<stop offset="0%" stop-color="#fffbeb" stop-opacity="0.35" />
							<stop offset="55%" stop-color="#ffffff" stop-opacity="0.08" />
							<stop offset="100%" stop-color="#022c22" stop-opacity="0.22" />
						</radialGradient>

						<filter id="foliage-shadow" x="-20%" y="-20%" width="140%" height="140%">
							<feGaussianBlur in="SourceAlpha" stdDeviation="4" />
							<feOffset dx="2" dy="5" result="offsetblur" />
							<feComponentTransfer><feFuncA type="linear" slope="0.45" /></feComponentTransfer>
							<feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
						</filter>

						<radialGradient id="fairy-glow" cx="50%" cy="50%" r="50%">
							<stop offset="0%" stop-color="#fff" stop-opacity="1" />
							<stop offset="25%" stop-color="#fef08a" stop-opacity="0.9" />
							<stop offset="50%" stop-color="#f59e0b" stop-opacity="0.45" />
							<stop offset="100%" stop-color="#f59e0b" stop-opacity="0" />
						</radialGradient>
					</defs>

					<!-- Base Flagstone Floor -->
					<rect x="0" y="0" width="987" height="736" fill="url(#flagstone-pattern)" />

					<!-- Dappled Tree Leaf Shadows -->
					<g fill="#000000" opacity="0.07">
						<circle cx="140" cy="180" r="45" filter="blur(8px)" />
						<circle cx="180" cy="220" r="35" filter="blur(8px)" />
						<circle cx="280" cy="140" r="50" filter="blur(8px)" />
						<circle cx="780" cy="260" r="60" filter="blur(8px)" />
						<circle cx="820" cy="210" r="45" filter="blur(8px)" />
						<circle cx="340" cy="580" r="55" filter="blur(8px)" />
						<circle cx="750" cy="560" r="65" filter="blur(8px)" />
					</g>

					<rect x="0" y="0" width="987" height="736" fill="url(#sunlight-patio)" pointer-events="none" />

					<!-- Solid Wall Boundary (Access from Dining Hall) -->
					<rect x="0" y="0" width="16" height="736" fill="#0f172a" />
					<line x1="16" y1="0" x2="16" y2="736" stroke="#475569" stroke-width="2" />

					<!-- Perimeter Stone Retaining Wall with Ashlar Cap -->
					<rect x="16" y="0" width="971" height="18" fill="#1e293b" stroke="#475569" stroke-width="1.5" />
					<rect x="969" y="0" width="18" height="736" fill="#1e293b" stroke="#475569" stroke-width="1.5" />
					<rect x="16" y="718" width="971" height="18" fill="#1e293b" stroke="#475569" stroke-width="1.5" />

					<!-- Perimeter Planters with Dense Foliage & Flowering Plants -->
					<!-- Top Planters -->
					<g filter="url(#foliage-shadow)">
						<rect x="24" y="18" width="600" height="22" rx="3" fill="#334155" stroke="#475569" stroke-width="1" />
						<ellipse cx="60" cy="28" rx="28" ry="12" fill="#15803d" />
						<ellipse cx="120" cy="28" rx="32" ry="13" fill="#166534" />
						<ellipse cx="180" cy="28" rx="26" ry="12" fill="#15803d" />
						<ellipse cx="240" cy="28" rx="34" ry="14" fill="#166534" />
						<ellipse cx="300" cy="28" rx="30" ry="12" fill="#15803d" />
						<ellipse cx="360" cy="28" rx="32" ry="13" fill="#166534" />
						<ellipse cx="420" cy="28" rx="28" ry="12" fill="#15803d" />
						<ellipse cx="480" cy="28" rx="34" ry="14" fill="#166534" />
						<ellipse cx="540" cy="28" rx="30" ry="12" fill="#15803d" />
						<ellipse cx="600" cy="28" rx="26" ry="12" fill="#166534" />
						<circle cx="85" cy="25" r="2" fill="#fef08a" />
						<circle cx="150" cy="30" r="2" fill="#ffffff" />
						<circle cx="215" cy="24" r="2" fill="#fef08a" />
						<circle cx="330" cy="26" r="2" fill="#ffffff" />
						<circle cx="450" cy="29" r="2" fill="#fef08a" />
						<circle cx="570" cy="24" r="2" fill="#ffffff" />
					</g>

					<!-- Right Vertical Planters -->
					<g filter="url(#foliage-shadow)">
						<rect x="942" y="32" width="24" height="680" rx="3" fill="#334155" stroke="#475569" stroke-width="1" />
						<ellipse cx="954" cy="70" rx="13" ry="30" fill="#15803d" />
						<ellipse cx="954" cy="140" rx="14" ry="35" fill="#166534" />
						<ellipse cx="954" cy="210" rx="13" ry="30" fill="#15803d" />
						<ellipse cx="954" cy="280" rx="14" ry="35" fill="#166534" />
						<ellipse cx="954" cy="350" rx="13" ry="30" fill="#15803d" />
						<ellipse cx="954" cy="420" rx="14" ry="35" fill="#166534" />
						<ellipse cx="954" cy="490" rx="13" ry="30" fill="#15803d" />
						<ellipse cx="954" cy="560" rx="14" ry="35" fill="#166534" />
						<ellipse cx="954" cy="630" rx="13" ry="30" fill="#15803d" />
						<circle cx="952" cy="110" r="2" fill="#ffffff" />
						<circle cx="956" cy="250" r="2" fill="#fef08a" />
						<circle cx="952" cy="390" r="2" fill="#ffffff" />
						<circle cx="956" cy="530" r="2" fill="#fef08a" />
					</g>

					<!-- Bottom Planters -->
					<g filter="url(#foliage-shadow)">
						<rect x="24" y="692" width="920" height="22" rx="3" fill="#334155" stroke="#475569" stroke-width="1" />
						<ellipse cx="60" cy="704" rx="30" ry="13" fill="#15803d" />
						<ellipse cx="140" cy="704" rx="34" ry="14" fill="#166534" />
						<ellipse cx="220" cy="704" rx="30" ry="13" fill="#15803d" />
						<ellipse cx="300" cy="704" rx="34" ry="14" fill="#166534" />
						<ellipse cx="380" cy="704" rx="30" ry="13" fill="#15803d" />
						<ellipse cx="460" cy="704" rx="34" ry="14" fill="#166534" />
						<ellipse cx="540" cy="704" rx="30" ry="13" fill="#15803d" />
						<ellipse cx="620" cy="704" rx="34" ry="14" fill="#166534" />
						<ellipse cx="700" cy="704" rx="30" ry="13" fill="#15803d" />
						<ellipse cx="780" cy="704" rx="34" ry="14" fill="#166534" />
						<ellipse cx="860" cy="704" rx="30" ry="13" fill="#15803d" />
						<circle cx="100" cy="704" r="2" fill="#ffffff" />
						<circle cx="260" cy="704" r="2" fill="#fef08a" />
						<circle cx="420" cy="704" r="2" fill="#ffffff" />
						<circle cx="580" cy="704" r="2" fill="#fef08a" />
						<circle cx="740" cy="704" r="2" fill="#ffffff" />
					</g>

					<!-- Potted Olive Trees in Terracotta Urns -->
					<g filter="url(#foliage-shadow)">
						<circle cx="58" cy="72" r="24" fill="#15803d" />
						<circle cx="54" cy="68" r="18" fill="#166534" />
						<circle cx="62" cy="74" r="14" fill="#14532d" />
						<circle cx="58" cy="72" r="7" fill="#b45309" stroke="#78350f" stroke-width="2" />
						
						<circle cx="58" cy="635" r="24" fill="#15803d" />
						<circle cx="54" cy="631" r="18" fill="#166534" />
						<circle cx="62" cy="639" r="14" fill="#14532d" />
						<circle cx="58" cy="635" r="7" fill="#b45309" stroke="#78350f" stroke-width="2" />
						
						<circle cx="910" cy="355" r="25" fill="#15803d" />
						<circle cx="906" cy="351" r="19" fill="#166534" />
						<circle cx="914" cy="359" r="14" fill="#14532d" />
						<circle cx="910" cy="355" r="7" fill="#b45309" stroke="#78350f" stroke-width="2" />
					</g>

					<!-- Organic Sandstone Walkway Pathway -->
					<path d="M 16 320 Q 240 320, 440 350 T 938 350" fill="none" stroke="#b4aa96" stroke-width="48" stroke-linecap="round" opacity="0.3" />
					<path d="M 16 320 Q 240 320, 440 350 T 938 350" fill="none" stroke="#8c816d" stroke-width="50" stroke-linecap="round" stroke-dasharray="2 6" opacity="0.25" />

					<!-- Cedar Wood Pergola Timber Canopy Beams -->
					<g fill="#000000" opacity="0.28" filter="blur(4px)">
						<rect x="135" y="88" width="770" height="12" rx="2" />
						<rect x="135" y="308" width="770" height="12" rx="2" />
						<rect x="135" y="528" width="770" height="12" rx="2" />
					</g>

					<rect x="130" y="82" width="770" height="12" fill="#78350f" stroke="#451a03" stroke-width="1" rx="2" />
					<rect x="130" y="302" width="770" height="12" fill="#78350f" stroke="#451a03" stroke-width="1" rx="2" />
					<rect x="130" y="522" width="770" height="12" fill="#78350f" stroke="#451a03" stroke-width="1" rx="2" />

					<!-- Pergola Transverse Rafters -->
					<g stroke="#92400e" stroke-width="6" opacity="0.85">
						<line x1="170" y1="65" x2="170" y2="550" />
						<line x1="290" y1="65" x2="290" y2="550" />
						<line x1="410" y1="65" x2="410" y2="550" />
						<line x1="530" y1="65" x2="530" y2="550" />
						<line x1="650" y1="65" x2="650" y2="550" />
						<line x1="770" y1="65" x2="770" y2="550" />
						<line x1="870" y1="65" x2="870" y2="550" />
					</g>

					<!-- Warm Fairy Light Nodes along Pergola Rafters -->
					<g>
						<circle cx="170" cy="88" r="16" fill="url(#fairy-glow)" />
						<circle cx="290" cy="88" r="16" fill="url(#fairy-glow)" />
						<circle cx="410" cy="88" r="16" fill="url(#fairy-glow)" />
						<circle cx="530" cy="88" r="16" fill="url(#fairy-glow)" />
						<circle cx="650" cy="88" r="16" fill="url(#fairy-glow)" />
						<circle cx="770" cy="88" r="16" fill="url(#fairy-glow)" />
						<circle cx="170" cy="88" r="3" fill="#ffffff" />
						<circle cx="290" cy="88" r="3" fill="#ffffff" />
						<circle cx="410" cy="88" r="3" fill="#ffffff" />
						<circle cx="530" cy="88" r="3" fill="#ffffff" />
						<circle cx="650" cy="88" r="3" fill="#ffffff" />
						<circle cx="770" cy="88" r="3" fill="#ffffff" />

						<circle cx="170" cy="308" r="16" fill="url(#fairy-glow)" />
						<circle cx="290" cy="308" r="16" fill="url(#fairy-glow)" />
						<circle cx="410" cy="308" r="16" fill="url(#fairy-glow)" />
						<circle cx="530" cy="308" r="16" fill="url(#fairy-glow)" />
						<circle cx="650" cy="308" r="16" fill="url(#fairy-glow)" />
						<circle cx="770" cy="308" r="16" fill="url(#fairy-glow)" />
						<circle cx="170" cy="308" r="3" fill="#ffffff" />
						<circle cx="290" cy="308" r="3" fill="#ffffff" />
						<circle cx="410" cy="308" r="3" fill="#ffffff" />
						<circle cx="530" cy="308" r="3" fill="#ffffff" />
						<circle cx="650" cy="308" r="3" fill="#ffffff" />
						<circle cx="770" cy="308" r="3" fill="#ffffff" />

						<circle cx="170" cy="528" r="16" fill="url(#fairy-glow)" />
						<circle cx="290" cy="528" r="16" fill="url(#fairy-glow)" />
						<circle cx="410" cy="528" r="16" fill="url(#fairy-glow)" />
						<circle cx="530" cy="528" r="16" fill="url(#fairy-glow)" />
						<circle cx="650" cy="528" r="16" fill="url(#fairy-glow)" />
						<circle cx="770" cy="528" r="16" fill="url(#fairy-glow)" />
						<circle cx="170" cy="528" r="3" fill="#ffffff" />
						<circle cx="290" cy="528" r="3" fill="#ffffff" />
						<circle cx="410" cy="528" r="3" fill="#ffffff" />
						<circle cx="530" cy="528" r="3" fill="#ffffff" />
						<circle cx="650" cy="528" r="3" fill="#ffffff" />
						<circle cx="770" cy="528" r="3" fill="#ffffff" />
					</g>
				</svg>

				<!-- Architectural Zone Callouts -->
				<div class="zone-callout" style="top: 32px; left: 160px;">
					<i class="fa fa-sun-o" style="color: #f59e0b;"></i> ${__('Sunlit Pergola Terrace')}
				</div>
				<div class="zone-callout" style="top: 32px; left: 470px;">
					<i class="fa fa-glass" style="color: #10b981;"></i> ${__('Patio Beverage & Cocktail Bar')}
				</div>
				<div class="zone-callout" style="bottom: 32px; left: 380px;">
					<i class="fa fa-leaf" style="color: #16a34a;"></i> ${__('Botanical Garden Aisle')}
				</div>
				<div class="zone-callout" style="top: 265px; left: 28px;">
					<i class="fa fa-exchange" style="color: #60a5fa;"></i> ${__('Patio Entrance')}
				</div>

				<!-- Double Sliding Glass Patio Doors on Left Wall -->
				<div class="arch-doorway" style="top: 260px; left: 0; width: 60px; height: 110px;">
					<div style="position: absolute; top: 10px; left: 14px; width: 4px; height: 42px; background: #60a5fa; border-radius: 2px; box-shadow: 0 0 6px rgba(96, 165, 250, 0.8);"></div>
					<div style="position: absolute; bottom: 10px; left: 14px; width: 4px; height: 42px; background: #60a5fa; border-radius: 2px; box-shadow: 0 0 6px rgba(96, 165, 250, 0.8);"></div>
					<svg width="40" height="96" style="position: absolute; left: 16px; top: 7px;">
						<path d="M 0 0 A 35 35 0 0 1 35 35" fill="none" stroke="#cbd5e1" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.6"/>
						<path d="M 0 94 A 35 35 0 0 0 35 59" fill="none" stroke="#cbd5e1" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.6"/>
					</svg>
				</div>

				<!-- Outdoor Beverage Bar / Refreshment Station (Top-Right) -->
				<div class="arch-service-bar patio-bar-counter" style="top: 24px; right: 35px; width: 235px; height: 52px; background: #1e293b; border: 1.5px solid #475569; color: #f8fafc;">
					<div class="service-bar-title">
						<i class="fa fa-glass" style="color: #22c55e;"></i>
						<span>${__('Beverage Station')}</span>
					</div>
					<div style="width: 22px; height: 18px; background: #64748b; border-radius: 2px; border: 1px solid #94a3b8; margin-left: auto;"></div>
					<div class="bar-stools-row" style="bottom: -20px; left: 24px;">
						<div class="arch-bar-stool" style="background: #713f12; border: 2px solid #a16207;"></div>
						<div class="arch-bar-stool" style="background: #713f12; border: 2px solid #a16207;"></div>
						<div class="arch-bar-stool" style="background: #713f12; border: 2px solid #a16207;"></div>
						<div class="arch-bar-stool" style="background: #713f12; border: 2px solid #a16207;"></div>
					</div>
				</div>

				<!-- Tables Layer -->
				<div class="tables-layer" id="tables-layer-garden"></div>
			</div>
		`).appendTo($stage);

		let coords = {
			'T-13': { x: 250, y: 195, shape: 'round' },
			'T-14': { x: 650, y: 195, shape: 'round' },
			'T-15': { x: 250, y: 435, shape: 'rect' },
			'T-16': { x: 650, y: 435, shape: 'rect' },
		};

		let $tablesLayer = $room.find('#tables-layer-garden');
		let areaTables = allTables.filter(t => t.area === 'Garden Patio');

		areaTables.forEach(table => {
			let c = coords[table.table_no];
			if (!c) return;
			$tablesLayer.append(this.create_2d_table_html(table, c));
		});
	}

	// --- Area 3: Rooftop Terrace 2D Architectural Layout (4 Tables: T-17 to T-20) ---
	render_rooftop_terrace_2d($stage, allTables) {
		let $room = $(`
			<div class="floor-plan-room room-rooftop-terrace">
				<!-- Background Architectural Canvas (SVG): Weathered Teak Timber Deck, Skyline Vista & Frameless Glass Balustrades -->
				<svg class="room-floor-svg" width="987" height="736" viewBox="0 0 987 736" xmlns="http://www.w3.org/2000/svg">
					<defs>
						<!-- Teak Wood Decking Timber Planks Pattern -->
						<pattern id="teak-deck-pattern" width="64" height="22" patternUnits="userSpaceOnUse">
							<rect width="64" height="22" fill="#935b29" />
							<rect x="0" y="0" width="62" height="10" fill="#a46933" />
							<rect x="0" y="11" width="62" height="10" fill="#8d5423" />
							<line x1="0" y1="10.5" x2="64" y2="10.5" stroke="#3d1f08" stroke-width="1.2" />
							<line x1="0" y1="21.5" x2="64" y2="21.5" stroke="#3d1f08" stroke-width="1.2" />
							<line x1="62.5" y1="0" x2="62.5" y2="11" stroke="#3d1f08" stroke-width="1.2" />
							<circle cx="5" cy="5" r="0.8" fill="#d97706" opacity="0.6" />
							<circle cx="57" cy="5" r="0.8" fill="#d97706" opacity="0.6" />
							<circle cx="5" cy="16" r="0.8" fill="#d97706" opacity="0.6" />
							<circle cx="57" cy="16" r="0.8" fill="#d97706" opacity="0.6" />
						</pattern>

						<linearGradient id="skyline-twilight" x1="0%" y1="0%" x2="0%" y2="100%">
							<stop offset="0%" stop-color="#070c18" />
							<stop offset="45%" stop-color="#0f172a" />
							<stop offset="85%" stop-color="#1e293b" />
							<stop offset="100%" stop-color="#334155" />
						</linearGradient>

						<radialGradient id="deck-uplight" cx="50%" cy="50%" r="50%">
							<stop offset="0%" stop-color="#fef08a" stop-opacity="0.9" />
							<stop offset="35%" stop-color="#f59e0b" stop-opacity="0.35" />
							<stop offset="100%" stop-color="#f59e0b" stop-opacity="0" />
						</radialGradient>

						<linearGradient id="glass-edge-glow" x1="0%" y1="0%" x2="100%" y2="0%">
							<stop offset="0%" stop-color="#38bdf8" stop-opacity="0.9" />
							<stop offset="50%" stop-color="#f0f9ff" stop-opacity="0.85" />
							<stop offset="100%" stop-color="#38bdf8" stop-opacity="0.9" />
						</linearGradient>
					</defs>

					<!-- Outer Skyline Vista Band (Behind Balustrade: Top and Right) -->
					<rect x="0" y="0" width="987" height="736" fill="url(#skyline-twilight)" />
					
					<!-- Distant City Skyline Silhouettes with Glowing Windows -->
					<g fill="#020617" opacity="0.85">
						<rect x="25" y="10" width="45" height="24" />
						<rect x="75" y="4" width="40" height="30" />
						<rect x="120" y="14" width="55" height="20" />
						<rect x="180" y="2" width="45" height="32" />
						<rect x="230" y="12" width="60" height="22" />
						<rect x="295" y="6" width="50" height="28" />
						<rect x="350" y="16" width="65" height="18" />
						<rect x="420" y="4" width="50" height="30" />
						<rect x="475" y="12" width="70" height="22" />
						<rect x="550" y="2" width="48" height="32" />
						<rect x="605" y="10" width="55" height="24" />
						<rect x="665" y="6" width="50" height="28" />
						<rect x="720" y="14" width="60" height="20" />
						<rect x="785" y="4" width="45" height="30" />
						<rect x="835" y="10" width="55" height="24" />
						<rect x="895" y="2" width="65" height="32" />
						<rect x="948" y="45" width="35" height="120" />
						<rect x="948" y="180" width="35" height="160" />
						<rect x="948" y="360" width="35" height="180" />
						<rect x="948" y="560" width="35" height="140" />
					</g>

					<!-- Twinkling Skyscraper Windows -->
					<g fill="#fef08a" opacity="0.85">
						<rect x="85" y="8" width="2" height="2" />
						<rect x="92" y="14" width="2" height="2" />
						<rect x="195" y="6" width="2" height="2" />
						<rect x="205" y="12" width="2" height="2" />
						<rect x="310" y="10" width="2" height="2" />
						<rect x="435" y="8" width="2" height="2" />
						<rect x="565" y="6" width="2" height="2" />
						<rect x="680" y="10" width="2" height="2" />
						<rect x="800" y="8" width="2" height="2" />
						<rect x="915" y="6" width="2" height="2" />
						<rect x="960" y="80" width="2" height="2" />
						<rect x="965" y="120" width="2" height="2" />
						<rect x="960" y="220" width="2" height="2" />
						<rect x="965" y="390" width="2" height="2" />
						<rect x="960" y="480" width="2" height="2" />
					</g>

					<!-- Teak Decking Area with Framing Margin Planks -->
					<rect x="16" y="32" width="928" height="674" fill="#6c3c13" rx="4" />
					<rect x="22" y="38" width="916" height="662" fill="url(#teak-deck-pattern)" rx="2" />

					<!-- Solid Service Wall (Left) -->
					<rect x="0" y="0" width="16" height="736" fill="#090d16" />
					<line x1="16" y1="0" x2="16" y2="736" stroke="#334155" stroke-width="2" />

					<!-- Frameless Architectural Glass Balustrade (Top, Right, Bottom) -->
					<line x1="16" y1="34" x2="944" y2="34" stroke="url(#glass-edge-glow)" stroke-width="5" filter="drop-shadow(0 2px 8px rgba(56, 189, 248, 0.7))" />
					<line x1="944" y1="34" x2="944" y2="706" stroke="url(#glass-edge-glow)" stroke-width="5" filter="drop-shadow(0 2px 8px rgba(56, 189, 248, 0.7))" />
					<line x1="16" y1="706" x2="944" y2="706" stroke="url(#glass-edge-glow)" stroke-width="5" filter="drop-shadow(0 2px 8px rgba(56, 189, 248, 0.7))" />

					<!-- Stainless Steel Standoff Spigots along Balustrade -->
					<g fill="#e2e8f0" stroke="#475569" stroke-width="1">
						<rect x="120" y="30" width="6" height="8" rx="1" />
						<rect x="260" y="30" width="6" height="8" rx="1" />
						<rect x="400" y="30" width="6" height="8" rx="1" />
						<rect x="540" y="30" width="6" height="8" rx="1" />
						<rect x="680" y="30" width="6" height="8" rx="1" />
						<rect x="820" y="30" width="6" height="8" rx="1" />
						<rect x="940" y="160" width="8" height="6" rx="1" />
						<rect x="940" y="320" width="8" height="6" rx="1" />
						<rect x="940" y="480" width="8" height="6" rx="1" />
						<rect x="940" y="640" width="8" height="6" rx="1" />
					</g>

					<!-- Modern Geometric Planters with Greenery -->
					<g fill="#18181b" stroke="#3f3f46" stroke-width="1">
						<rect x="28" y="44" width="150" height="12" rx="2" />
						<rect x="190" y="44" width="150" height="12" rx="2" />
						<rect x="922" y="65" width="12" height="150" rx="2" />
						<rect x="922" y="490" width="12" height="150" rx="2" />
					</g>
					<g fill="#166534">
						<ellipse cx="65" cy="48" rx="30" ry="6" />
						<ellipse cx="135" cy="48" rx="35" ry="6" />
						<ellipse cx="230" cy="48" rx="32" ry="6" />
						<ellipse cx="300" cy="48" rx="35" ry="6" />
						<ellipse cx="928" cy="110" rx="6" ry="35" />
						<ellipse cx="928" cy="175" rx="6" ry="30" />
						<ellipse cx="928" cy="535" rx="6" ry="35" />
						<ellipse cx="928" cy="600" rx="6" ry="30" />
					</g>

					<!-- Recessed Warm Deck Uplights -->
					<circle cx="120" cy="52" r="18" fill="url(#deck-uplight)" />
					<circle cx="120" cy="52" r="3.5" fill="#fde047" stroke="#b45309" stroke-width="1" />
					<circle cx="400" cy="52" r="18" fill="url(#deck-uplight)" />
					<circle cx="400" cy="52" r="3.5" fill="#fde047" stroke="#b45309" stroke-width="1" />
					<circle cx="928" cy="240" r="18" fill="url(#deck-uplight)" />
					<circle cx="928" cy="240" r="3.5" fill="#fde047" stroke="#b45309" stroke-width="1" />
					<circle cx="928" cy="430" r="18" fill="url(#deck-uplight)" />
					<circle cx="928" cy="430" r="3.5" fill="#fde047" stroke="#b45309" stroke-width="1" />
					<circle cx="440" cy="688" r="18" fill="url(#deck-uplight)" />
					<circle cx="440" cy="688" r="3.5" fill="#fde047" stroke="#b45309" stroke-width="1" />
					<circle cx="720" cy="688" r="18" fill="url(#deck-uplight)" />
					<circle cx="720" cy="688" r="3.5" fill="#fde047" stroke="#b45309" stroke-width="1" />
				</svg>

				<!-- Architectural Zone Callouts -->
				<div class="zone-callout" style="top: 48px; left: 160px;">
					<i class="fa fa-binoculars" style="color: #38bdf8;"></i> ${__('Panoramic Vista Deck')}
				</div>
				<div class="zone-callout" style="top: 48px; left: 470px;">
					<i class="fa fa-glass" style="color: #f59e0b;"></i> ${__('Sky Lounge & Rooftop Cocktail Bar')}
				</div>
				<div class="zone-callout" style="bottom: 48px; left: 240px;">
					<i class="fa fa-coffee" style="color: #fdba74;"></i> ${__('Sunset VIP Lounge Sectional')}
				</div>
				<div class="zone-callout" style="top: 265px; left: 28px;">
					<i class="fa fa-building" style="color: #a855f7;"></i> ${__('Express Elevator Lobby')}
				</div>

				<!-- Express Elevator Lobby Entrance (Left Wall) -->
				<div class="arch-doorway" style="top: 260px; left: 0; width: 70px; height: 110px;">
					<div style="position: absolute; top: 12px; left: 16px; width: 6px; height: 38px; background: #94a3b8; border-radius: 2px; border: 1px solid #cbd5e1;"></div>
					<div style="position: absolute; bottom: 12px; left: 16px; width: 6px; height: 38px; background: #94a3b8; border-radius: 2px; border: 1px solid #cbd5e1;"></div>
					<div style="position: absolute; top: 48px; left: 24px; font-size: 8px; font-weight: 800; color: #38bdf8; background: #0f172a; padding: 2px 4px; border-radius: 2px;">▲ 18F</div>
				</div>

				<!-- Sky Lounge & Rooftop Cocktail Bar (Top Right) -->
				<div class="arch-service-bar rooftop-cocktail-bar" style="top: 42px; right: 40px; width: 230px; height: 54px; background: #18181b; border: 1.5px solid #b45309; color: #f8fafc; box-shadow: 0 0 20px rgba(245, 158, 11, 0.25);">
					<div class="service-bar-title">
						<i class="fa fa-glass" style="color: #f59e0b;"></i>
						<span>${__('Skyline Cocktail Bar')}</span>
					</div>
					<div style="width: 32px; height: 20px; background: radial-gradient(circle, #fef08a 0%, #d97706 100%); border-radius: 2px; box-shadow: 0 0 8px #f59e0b; margin-left: auto;"></div>
					<div class="bar-stools-row" style="bottom: -20px; left: 20px;">
						<div class="arch-bar-stool" style="background: #18181b; border: 2px solid #b45309;"></div>
						<div class="arch-bar-stool" style="background: #18181b; border: 2px solid #b45309;"></div>
						<div class="arch-bar-stool" style="background: #18181b; border: 2px solid #b45309;"></div>
						<div class="arch-bar-stool" style="background: #18181b; border: 2px solid #b45309;"></div>
					</div>
				</div>

				<!-- VIP Lounge Sectional Sofa (Bottom Left) -->
				<div class="rooftop-sectional-lounge" style="left: 35px; bottom: 45px; width: 190px; height: 130px;">
					<div class="sectional-bench" style="left: 0; bottom: 0; width: 180px; height: 40px;">
						<div class="sectional-cushion"></div>
						<div class="accent-pillow" style="left: 10px; top: -4px; background: #ea580c;"></div>
						<div class="accent-pillow" style="left: 55px; top: -4px; background: #059669;"></div>
						<div class="accent-pillow" style="left: 115px; top: -4px; background: #ea580c;"></div>
					</div>
					<div class="sectional-bench" style="left: 0; bottom: 40px; width: 40px; height: 80px;">
						<div class="sectional-cushion"></div>
						<div class="accent-pillow" style="left: -4px; top: 15px; background: #059669;"></div>
					</div>
					<div class="coffee-table-marble" style="left: 60px; bottom: 52px; width: 70px; height: 36px;">
						<div style="width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; box-shadow: 0 0 6px #f59e0b;"></div>
					</div>
				</div>

				<!-- Tables Layer -->
				<div class="tables-layer" id="tables-layer-rooftop"></div>
			</div>
		`).appendTo($stage);

		let coords = {
			'T-17': { x: 260, y: 195, shape: 'round' },
			'T-18': { x: 650, y: 195, shape: 'rect' },
			'T-19': { x: 260, y: 435, shape: 'rect' },
			'T-20': { x: 650, y: 435, shape: 'rect' },
		};

		let $tablesLayer = $room.find('#tables-layer-rooftop');
		let areaTables = allTables.filter(t => t.area === 'Rooftop Terrace');

		areaTables.forEach(table => {
			let c = coords[table.table_no];
			if (!c) return;
			$tablesLayer.append(this.create_2d_table_html(table, c));
		});
	}

	// =========================================================================
	// 2D Dining Table Furniture HTML Generator (Realistic Top-Down Visualization)
	// =========================================================================
	create_2d_table_html(table, coords) {
		let isSelected = (table.table_no === this.selected_table_no);
		let shape = coords.shape || (table.shape ? table.shape.toLowerCase() : 'rect');
		let shapeClass = `t2d-shape-${shape === 'round' ? 'round' : 'rectangular'}`;
		let capClass = `t2d-cap-${table.capacity}`;
		let statusClass = `t2d-status-${table.status.toLowerCase()}`;

		// Filter status check
		let isMatch = true;
		if (this.current_status !== 'All' && table.status !== this.current_status) {
			isMatch = false;
		}
		if (this.search_query && !table.table_no.toLowerCase().includes(this.search_query) && !(table.customer && table.customer.toLowerCase().includes(this.search_query))) {
			isMatch = false;
		}

		let opacityStyle = isMatch ? '' : 'opacity: 0.22; filter: grayscale(90%); pointer-events: none;';
		let sizeStyle = coords.w ? `width: ${coords.w}px; height: ${coords.h}px;` : '';

		// Uniform luxury architectural tabletop status content across ALL areas
		let statusContentHtml = '';
		if (table.status === 'Occupied') {
			let namePart = table.customer ? table.customer.split(' ')[0] : __('Occupied');
			let guestsCount = table.guests || table.capacity || 2;
			statusContentHtml = `
				<span class="plaque-id">${table.table_no}</span>
				<span class="plaque-cap">${table.capacity} ${__('Seats')}</span>
				<span class="status-occ-label"><i class="fa fa-user"></i> ${namePart} (${guestsCount})</span>
			`;
		} else if (table.status === 'Reserved') {
			statusContentHtml = `
				<span class="plaque-id">${table.table_no}</span>
				<span class="plaque-cap">${table.capacity} ${__('Seats')}</span>
				<span class="status-res-label"><i class="fa fa-clock-o"></i> ${table.reservation_time || '8:00 PM'}</span>
			`;
		} else {
			statusContentHtml = `
				<span class="plaque-id">${table.table_no}</span>
				<span class="plaque-cap">${table.capacity} ${__('Seats')}</span>
				<span class="status-avail-label"><span class="presence-dot"></span> ${__('Available')}</span>
			`;
		}

		let selectedBadgeHtml = isSelected ? `<span class="t2d-selected-badge"><i class="fa fa-check"></i> ${__('Selected')}</span>` : '';

		// If Main Dining Hall, use the sleek architectural plaque directly aligned with the CAD drawing
		if (this.current_area === 'Main Dining Hall') {
			return `
				<div class="t2d-table-wrapper ${shapeClass} ${capClass} ${statusClass} ${isSelected ? 'is-selected' : ''}" 
					 data-table-no="${table.table_no}" 
					 title="${table.table_no} (${table.capacity} Seats) • ${table.status}${table.customer ? ' • ' + table.customer : ''}"
					 style="left: ${coords.x}px; top: ${coords.y}px; ${sizeStyle} ${opacityStyle}">
					
					${selectedBadgeHtml}

					<!-- Architectural Tabletop Plaque -->
					<div class="table-plaque">
						${statusContentHtml}
					</div>
				</div>
			`;
		}

		// Otherwise (Garden Patio & Rooftop Terrace) - Render realistic outdoor dining furniture with chairs & place settings
		let chairsHtml = this.generate_2d_chairs_html(shape === 'round' ? 'Round' : 'Rectangular', table.capacity, false);
		let placeSettingsHtml = this.generate_place_settings_html(shape === 'round' ? 'Round' : 'Rectangular', table.capacity);
		let centerpieceHtml = `<div class="t2d-centerpiece"></div>`;

		return `
			<div class="t2d-table-wrapper ${shapeClass} ${capClass} ${statusClass} ${isSelected ? 'is-selected' : ''}" 
				 data-table-no="${table.table_no}" 
				 title="${table.table_no} (${table.capacity} Seats) • ${table.status}${table.customer ? ' • ' + table.customer : ''}"
				 style="left: ${coords.x}px; top: ${coords.y}px; ${opacityStyle}">
				
				${selectedBadgeHtml}

				${chairsHtml}

				<div class="t2d-table-top">
					${placeSettingsHtml}
					${centerpieceHtml}

					<div class="table-plaque">
						${statusContentHtml}
					</div>
				</div>
			</div>
		`;
	}

	generate_place_settings_html(shape, capacity) {
		let isRound = (shape === 'Round');
		let cap = parseInt(capacity) || 4;

		if (isRound && cap === 2) {
			return `
				<div class="t2d-place-setting plate-round-top"><div class="plate-inner"></div><div class="table-glass"></div></div>
				<div class="t2d-place-setting plate-round-bottom"><div class="plate-inner"></div><div class="table-glass"></div></div>
			`;
		} else if (isRound && cap >= 4) {
			return `
				<div class="t2d-place-setting plate-round-top"><div class="plate-inner"></div><div class="table-glass"></div></div>
				<div class="t2d-place-setting plate-round-bottom"><div class="plate-inner"></div><div class="table-glass"></div></div>
				<div class="t2d-place-setting plate-round-left"><div class="plate-inner"></div><div class="table-glass"></div></div>
				<div class="t2d-place-setting plate-round-right"><div class="plate-inner"></div><div class="table-glass"></div></div>
			`;
		} else if (!isRound && cap === 4) {
			return `
				<div class="t2d-place-setting plate-top-1"><div class="plate-inner"></div><div class="table-glass"></div></div>
				<div class="t2d-place-setting plate-top-2"><div class="plate-inner"></div><div class="table-glass"></div></div>
				<div class="t2d-place-setting plate-bottom-1"><div class="plate-inner"></div><div class="table-glass"></div></div>
				<div class="t2d-place-setting plate-bottom-2"><div class="plate-inner"></div><div class="table-glass"></div></div>
			`;
		} else if (!isRound && cap === 2) {
			return `
				<div class="t2d-place-setting plate-top-1" style="left: 50%; transform: translateX(-50%);"><div class="plate-inner"></div><div class="table-glass"></div></div>
				<div class="t2d-place-setting plate-bottom-1" style="left: 50%; transform: translateX(-50%);"><div class="plate-inner"></div><div class="table-glass"></div></div>
			`;
		} else {
			// Rectangular 6-seater
			return `
				<div class="t2d-place-setting plate-top-1"><div class="plate-inner"></div><div class="table-glass"></div></div>
				<div class="t2d-place-setting plate-top-2"><div class="plate-inner"></div><div class="table-glass"></div></div>
				<div class="t2d-place-setting plate-top-3"><div class="plate-inner"></div><div class="table-glass"></div></div>
				<div class="t2d-place-setting plate-bottom-1"><div class="plate-inner"></div><div class="table-glass"></div></div>
				<div class="t2d-place-setting plate-bottom-2"><div class="plate-inner"></div><div class="table-glass"></div></div>
				<div class="t2d-place-setting plate-bottom-3"><div class="plate-inner"></div><div class="table-glass"></div></div>
			`;
		}
	}

	generate_2d_chairs_html(shape, capacity, isBooth) {
		let isRound = (shape === 'Round');
		let cap = parseInt(capacity) || 4;

		if (isBooth && cap === 6) {
			// 6-seater booth: sofa along top side, 3 armchairs along bottom side
			return `
				<div class="t2d-chairs-container">
					<div class="t2d-chair chair-bottom-1"><div class="t2d-chair-back"></div><div class="t2d-chair-cushion"></div></div>
					<div class="t2d-chair chair-bottom-2"><div class="t2d-chair-back"></div><div class="t2d-chair-cushion"></div></div>
					<div class="t2d-chair chair-bottom-3"><div class="t2d-chair-back"></div><div class="t2d-chair-cushion"></div></div>
				</div>
			`;
		} else if (isBooth && cap === 2) {
			return `
				<div class="t2d-chairs-container">
					<div class="t2d-chair chair-bottom-1" style="left: 50%; transform: translateX(-50%);"><div class="t2d-chair-back"></div><div class="t2d-chair-cushion"></div></div>
				</div>
			`;
		} else if (isRound && cap === 2) {
			return `
				<div class="t2d-chairs-container">
					<div class="t2d-chair chair-pos-top"><div class="t2d-chair-back"></div><div class="t2d-chair-cushion"></div></div>
					<div class="t2d-chair chair-pos-bottom"><div class="t2d-chair-back"></div><div class="t2d-chair-cushion"></div></div>
				</div>
			`;
		} else if (isRound && cap >= 4) {
			return `
				<div class="t2d-chairs-container">
					<div class="t2d-chair chair-pos-top"><div class="t2d-chair-back"></div><div class="t2d-chair-cushion"></div></div>
					<div class="t2d-chair chair-pos-bottom"><div class="t2d-chair-back"></div><div class="t2d-chair-cushion"></div></div>
					<div class="t2d-chair chair-pos-left"><div class="t2d-chair-back"></div><div class="t2d-chair-cushion"></div></div>
					<div class="t2d-chair chair-pos-right"><div class="t2d-chair-back"></div><div class="t2d-chair-cushion"></div></div>
				</div>
			`;
		} else if (!isRound && cap === 4) {
			return `
				<div class="t2d-chairs-container">
					<div class="t2d-chair chair-top-1"><div class="t2d-chair-back"></div><div class="t2d-chair-cushion"></div></div>
					<div class="t2d-chair chair-top-2"><div class="t2d-chair-back"></div><div class="t2d-chair-cushion"></div></div>
					<div class="t2d-chair chair-bottom-1"><div class="t2d-chair-back"></div><div class="t2d-chair-cushion"></div></div>
					<div class="t2d-chair chair-bottom-2"><div class="t2d-chair-back"></div><div class="t2d-chair-cushion"></div></div>
				</div>
			`;
		} else {
			// Rectangular 6-seater non-booth
			return `
				<div class="t2d-chairs-container">
					<div class="t2d-chair chair-top-1"><div class="t2d-chair-back"></div><div class="t2d-chair-cushion"></div></div>
					<div class="t2d-chair chair-top-2"><div class="t2d-chair-back"></div><div class="t2d-chair-cushion"></div></div>
					<div class="t2d-chair chair-top-3"><div class="t2d-chair-back"></div><div class="t2d-chair-cushion"></div></div>
					<div class="t2d-chair chair-bottom-1"><div class="t2d-chair-back"></div><div class="t2d-chair-cushion"></div></div>
					<div class="t2d-chair chair-bottom-2"><div class="t2d-chair-back"></div><div class="t2d-chair-cushion"></div></div>
					<div class="t2d-chair chair-bottom-3"><div class="t2d-chair-back"></div><div class="t2d-chair-cushion"></div></div>
				</div>
			`;
		}
	}

	highlight_selected_table() {
		$('.t2d-table-wrapper').removeClass('is-selected');
		$('.t2d-selected-badge').remove();

		let $target = $(`.t2d-table-wrapper[data-table-no="${this.selected_table_no}"]`);
		if ($target.length) {
			$target.addClass('is-selected');
			$target.append(`<span class="t2d-selected-badge"><i class="fa fa-check"></i> ${__('Selected')}</span>`);
		}
	}

	apply_transform() {
		let $stage = $('#floor-2d-stage');
		if (!$stage.length) return;
		$stage.css({
			'transform': `translate3d(${this.panX}px, ${this.panY}px, 0) scale(${this.zoom})`
		});
	}

	zoom_in() {
		this.zoom = Math.min(1.85, +(this.zoom + 0.15).toFixed(2));
		this.apply_transform();
	}

	zoom_out() {
		this.zoom = Math.max(0.55, +(this.zoom - 0.15).toFixed(2));
		this.apply_transform();
	}

	reset_view() {
		this.zoom = 1.0;
		this.panX = 0;
		this.panY = 0;
		this.apply_transform();
	}

	toggle_fullscreen() {
		let elem = document.getElementById('floor-2d-viewport');
		if (!elem) return;

		if (!document.fullscreenElement) {
			elem.requestFullscreen().catch(err => {
				console.error(`Fullscreen error: ${err.message}`);
			});
			$('#ctrl-fullscreen').html('<i class="fa fa-compress"></i>');
		} else {
			document.exitFullscreen();
			$('#ctrl-fullscreen').html('<i class="fa fa-expand"></i>');
		}
	}

	// =========================================================================
	// Right-Side Details Panel
	// =========================================================================
	render_detail_panel() {
		let $panel = $('#floor-detail-panel');
		if (!$panel.length) return;

		$panel.empty();
		let table = this.get_table(this.selected_table_no);

		if (!table) {
			$panel.html(`
				<div class="detail-panel-empty">
					<i class="fa fa-hand-pointer-o"></i>
					<h4>${__('No Table Selected')}</h4>
					<p>${__('Click any table on the architectural floor plan to view seating status, active tickets, and manage guests.')}</p>
				</div>
			`);
			return;
		}

		let statusBadgeClass = `badge-status-${table.status.toLowerCase()}`;
		let shapeIcon = (table.shape === 'Round') ? 'fa fa-circle-o' : 'fa fa-square-o';

		let bodyHtml = '';
		let actionsHtml = '';

		if (table.status === 'Occupied') {
			let custName = table.customer || __('Guest Party');
			let mobileHtml = table.customer_mobile ? `
				<div class="detail-info-row">
					<span class="detail-info-label">${__('Mobile')}</span>
					<span class="detail-info-val">
						<span class="btn-panel-cust-history" data-cust-id="${table.customer_id || ''}" data-mobile="${table.customer_mobile}" style="cursor: pointer; text-decoration: underline;" title="${__('View Guest History')}">
							+91 ${table.customer_mobile}
						</span>
					</span>
				</div>
			` : '';

			let orderInfoHtml = table.order_id ? `
				<div class="detail-info-row">
					<span class="detail-info-label">${__('Active Ticket')}</span>
					<span class="detail-info-val" style="color: #ea580c; font-weight: 700;">${table.order_id}</span>
				</div>
				<div class="detail-info-row">
					<span class="detail-info-label">${__('Order Total')}</span>
					<span class="detail-info-val" style="color: #0f172a; font-weight: 700;">${table.order_amount || '₹0'}</span>
				</div>
			` : `
				<div class="detail-info-row">
					<span class="detail-info-label">${__('Order State')}</span>
					<span class="detail-info-val" style="color: #d97706; font-weight: 600;">
						<i class="fa fa-clock-o"></i> ${__('Awaiting Order')}
					</span>
				</div>
			`;

			bodyHtml = `
				<div class="detail-info-card card-occupied">
					<div class="detail-guest-title">
						<span><i class="fa fa-user-circle" style="color: #ef4444;"></i> ${custName}</span>
						${table.customer_id ? `<span class="badge badge-light" style="font-size: 0.72rem;">${table.customer_id}</span>` : ''}
					</div>
					${mobileHtml}
					<div class="detail-info-row">
						<span class="detail-info-label">${__('Seated Guests')}</span>
						<span class="detail-info-val">${table.guests || table.capacity} ${__('of')} ${table.capacity} ${__('Seats')}</span>
					</div>
					<div class="detail-info-row">
						<span class="detail-info-label">${__('Elapsed Time')}</span>
						<span class="detail-info-val"><i class="fa fa-clock-o"></i> ${table.seated_time || __('Active')}</span>
					</div>
					${orderInfoHtml}
					${table.notes ? `
						<div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed #cbd5e1; font-size: 0.78rem; color: #475569; font-style: italic;">
							"${table.notes}"
						</div>
					` : ''}
				</div>
			`;

			let orderBtnText = table.order_id ? __('+ Add Items') : __('Start Order');
			actionsHtml = `
				<div class="actions-row-2">
					<button type="button" class="btn-action-primary btn-panel-order" style="background: #ea580c; border-color: #ea580c;">
						<i class="fa fa-cutlery"></i> ${orderBtnText}
					</button>
					<button type="button" class="btn-action-primary btn-panel-manage">
						<i class="fa fa-sliders"></i> ${__('Manage Table')}
					</button>
				</div>
				<div class="actions-row-2">
					<button type="button" class="btn-action-secondary btn-panel-details">
						<i class="fa fa-info-circle"></i> ${__('View Details')}
					</button>
					<button type="button" class="btn-action-secondary btn-panel-transfer" title="${__('Transfer seating and orders to another table')}">
						<i class="fa fa-exchange"></i> ${__('Transfer Table')}
					</button>
				</div>
				${table.order_id ? `
					<div class="actions-row-2">
						<button type="button" class="btn-action-secondary btn-panel-bill" title="${__('Print Bill / Receipt')}">
							<i class="fa fa-print"></i> ${__('Bill / Receipt')}
						</button>
					</div>
				` : `
					<div class="actions-row-2">
						<button type="button" class="btn-action-secondary btn-panel-cust-history" data-cust-id="${table.customer_id || ''}" data-mobile="${table.customer_mobile || ''}">
							<i class="fa fa-history"></i> ${__('Guest History')}
						</button>
					</div>
				`}
			`;

		} else if (table.status === 'Reserved') {
			let custName = table.customer || __('Reserved Guest');
			let mobileHtml = table.customer_mobile ? `
				<div class="detail-info-row">
					<span class="detail-info-label">${__('Mobile')}</span>
					<span class="detail-info-val">+91 ${table.customer_mobile}</span>
				</div>
			` : '';

			bodyHtml = `
				<div class="detail-info-card card-reserved">
					<div class="detail-guest-title">
						<span><i class="fa fa-bookmark" style="color: #d97706;"></i> ${custName}</span>
						${table.customer_id ? `<span class="badge badge-light" style="font-size: 0.72rem;">${table.customer_id}</span>` : ''}
					</div>
					${mobileHtml}
					<div class="detail-info-row">
						<span class="detail-info-label">${__('Reservation Time')}</span>
						<span class="detail-info-val" style="color: #d97706; font-weight: 700;">
							<i class="fa fa-calendar-check-o"></i> ${table.reservation_time || __('Today')}
						</span>
					</div>
					<div class="detail-info-row">
						<span class="detail-info-label">${__('Party Size')}</span>
						<span class="detail-info-val">${table.guests || table.capacity} ${__('Guests')}</span>
					</div>
					${table.notes ? `
						<div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed #fde68a; font-size: 0.78rem; color: #92400e; font-style: italic;">
							"${table.notes}"
						</div>
					` : ''}
				</div>
			`;

			actionsHtml = `
				<div class="actions-row-2">
					<button type="button" class="btn-action-primary btn-panel-seat-reserved">
						<i class="fa fa-check"></i> ${__('Seat Guests (Check-in)')}
					</button>
					<button type="button" class="btn-action-secondary btn-panel-order" title="${__('Start POS Order for Table')}">
						<i class="fa fa-cutlery"></i> ${__('Start Order')}
					</button>
				</div>
				<button type="button" class="btn-action-secondary btn-panel-details">
					<i class="fa fa-bookmark"></i> ${__('View Reservation')}
				</button>
			`;

		} else {
			// Available Table
			bodyHtml = `
				<div class="detail-info-card card-available">
					<div style="display: flex; align-items: center; gap: 8px; color: #334155; font-weight: 700; font-size: 0.95rem; margin-bottom: 0.5rem;">
						<i class="fa fa-check-circle" style="color: #64748b; font-size: 1.1rem;"></i>
						<span>${__('Ready for Guests')}</span>
					</div>
					<div class="detail-info-row">
						<span class="detail-info-label">${__('Capacity')}</span>
						<span class="detail-info-val">${table.capacity} ${__('Seats')}</span>
					</div>
					<div class="detail-info-row">
						<span class="detail-info-label">${__('Dining Area')}</span>
						<span class="detail-info-val">${table.area}</span>
					</div>
					<div class="detail-info-row">
						<span class="detail-info-label">${__('Table Shape')}</span>
						<span class="detail-info-val">${table.shape || 'Rectangular'}</span>
					</div>
				</div>
			`;

			actionsHtml = `
				<button type="button" class="btn-action-primary btn-panel-order" style="background: #ea580c; border-color: #ea580c; margin-bottom: 0.5rem;">
					<i class="fa fa-cutlery"></i> ${__('Start Order')}
				</button>
				<div class="actions-row-2">
					<button type="button" class="btn-action-secondary btn-panel-seat">
						<i class="fa fa-user-plus"></i> ${__('Seat Guests')}
					</button>
					<button type="button" class="btn-action-secondary btn-panel-details">
						<i class="fa fa-info-circle"></i> ${__('View Details / Reserve')}
					</button>
				</div>
			`;
		}

		let html = `
			<div class="detail-panel-header">
				<div class="detail-table-title-row">
					<span class="detail-table-number">${table.table_no}</span>
					<span class="${statusBadgeClass}">${__(table.status)}</span>
				</div>
				<div class="detail-table-area">
					<i class="fa fa-map-marker" style="color: #ea580c;"></i> ${table.area}
				</div>
				<div class="detail-table-badges">
					<span class="badge-spec"><i class="fa fa-user"></i> ${table.capacity} ${__('Seats')}</span>
					<span class="badge-spec"><i class="${shapeIcon}"></i> ${table.shape || 'Rectangular'}</span>
				</div>
			</div>

			<div class="detail-panel-body">
				${bodyHtml}
			</div>

			<div class="detail-panel-actions">
				${actionsHtml}
			</div>
		`;

		$panel.html(html);
	}

	// =========================================================================
	// Table Transfer Modal
	// =========================================================================
	open_table_transfer_dialog(table) {
		let me = this;
		let allTables = (this.data && this.data.tables) ? this.data.tables : [];
		let availableTables = allTables.filter(t => t.status === 'Available');

		if (availableTables.length === 0) {
			frappe.msgprint(__('No available tables found for transfer. Please vacate a table first.'));
			return;
		}

		let options = availableTables.map(t => ({
			label: `${t.table_no} — ${t.area} (${t.capacity} Seats, ${t.shape || 'Rectangular'})`,
			value: t.table_no
		}));

		let d = new frappe.ui.Dialog({
			title: __('Transfer Table {0}', [table.table_no]),
			fields: [
				{
					fieldtype: 'HTML',
					fieldname: 'transfer_summary',
					options: `
						<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.85rem; margin-bottom: 1rem;">
							<div style="font-weight: 700; font-size: 0.95rem; color: #0f172a; margin-bottom: 0.35rem;">
								<i class="fa fa-arrow-right" style="color: #ea580c;"></i> ${__('Transfer Source:')} <strong>${table.table_no}</strong> (${table.area})
							</div>
							<div style="font-size: 0.82rem; color: #475569; display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem; margin-top: 0.5rem;">
								<div><strong>${__('Guest Party:')}</strong> ${table.customer || __('Guest Party')}</div>
								<div><strong>${__('Guests:')}</strong> ${table.guests || table.capacity} seated</div>
								<div><strong>${__('Active Ticket:')}</strong> ${table.order_id || __('None')}</div>
								<div><strong>${__('Order Total:')}</strong> ${table.order_amount || '—'}</div>
							</div>
						</div>
					`
				},
				{
					fieldtype: 'Select',
					fieldname: 'target_table',
					label: __('Destination Table (Available Only)'),
					options: options.map(o => o.value).join('\n'),
					reqd: 1,
					description: __('Party, active orders, and kitchen tickets will move to the selected table.')
				},
				{
					fieldtype: 'Small Text',
					fieldname: 'reason',
					label: __('Reason for Transfer (Optional)'),
					default: 'Guest requested table change'
				}
			],
			primary_action_label: __('Confirm Transfer'),
			primary_action: function (values) {
				if (!values || !values.target_table) return;
				d.hide();
				frappe.call({
					method: 'restaurant_management.restaurant_management.page.restaurant_floor_management.restaurant_floor_management.transfer_table',
					args: {
						from_table_no: table.table_no,
						to_table_no: values.target_table,
						reason: values.reason || ''
					},
					freeze: true,
					freeze_message: __('Transferring table and active orders...'),
					callback: function (r) {
						if (r.message && r.message.success) {
							frappe.show_alert({
								message: __('Table {0} transferred to {1} successfully.', [table.table_no, values.target_table]),
								indicator: 'green'
							});
							me.data = r.message.floor_data;
							let targetT = me.get_table(values.target_table);
							if (targetT && targetT.area !== me.current_area) {
								me.current_area = targetT.area;
								$(`.area-tab-btn`).removeClass('active');
								$(`.area-tab-btn[data-area="${targetT.area}"]`).addClass('active');
							}
							me.selected_table_no = values.target_table;
							me.render_all();
						}
					}
				});
			}
		});

		d.show();
	}

	confirm_release_table(table_no) {
		let me = this;
		frappe.confirm(
			__('Are you sure you want to release Table {0} and mark it Available?', [table_no]),
			function () {
				me.submit_table_update(table_no, 'Available');
			}
		);
	}

	// =========================================================================
	// Table Dialog: Seating, Reservation & Management (Preserved)
	// =========================================================================
	open_table_dialog(table, action_type = 'seat') {
		let me = this;
		let fields = [];

		let header_html = `
			<div class="table-dialog-summary">
				<div class="table-dialog-info-left">
					<div class="table-dialog-num" style="display: flex; align-items: baseline; gap: 0.5rem;">
						<span style="font-weight: 800; font-size: 1.25rem; color: #0f172a;">${table.table_no}</span>
						<span class="badge badge-light" style="font-size: 0.75rem; font-weight: 600; background: #f1f5f9; color: #475569; padding: 2px 7px; border-radius: 4px; border: 1px solid #cbd5e1;">${table.capacity} ${__('Seats')}</span>
						<span class="badge badge-light" style="font-size: 0.75rem; font-weight: 600; background: #f1f5f9; color: #475569; padding: 2px 7px; border-radius: 4px; border: 1px solid #cbd5e1;">${table.shape || 'Rectangular'}</span>
					</div>
					<div class="table-dialog-area"><i class="fa fa-map-marker" style="color: #ea580c;"></i> ${table.area}</div>
				</div>
				<div>
					<span class="table-status-pill status-pill-${table.status.toLowerCase()}">
						${__(table.status)}
					</span>
				</div>
			</div>
		`;

		if (table.status === 'Occupied') {
			header_html += `
				<div class="table-occupied-preview">
					<div style="font-weight: 600; font-size: 1rem; margin-bottom: 0.35rem; display: flex; justify-content: space-between; align-items: center;">
						<span><i class="fa fa-user-circle"></i> ${table.customer || __('Guest Party')}</span>
						${table.customer_id ? `<span class="badge badge-light" style="font-size: 0.72rem;">${table.customer_id}</span>` : ''}
					</div>
					${table.customer_mobile ? `<div><strong>${__('Mobile:')}</strong> +91 ${table.customer_mobile}</div>` : ''}
					<div><strong>${__('Seated Guests:')}</strong> ${table.guests || table.capacity} of ${table.capacity} seats</div>
					<div><strong>${__('Elapsed Time:')}</strong> ${table.seated_time || __('Active')}</div>
					${table.order_id ? `<div><strong>${__('Active Ticket:')}</strong> ${table.order_id} (${table.order_amount || 'Pending'})</div>` : ''}
					${table.notes ? `<div style="margin-top: 0.4rem; font-style: italic;">"${table.notes}"</div>` : ''}
				</div>
			`;
		} else if (table.status === 'Reserved') {
			header_html += `
				<div class="table-reserved-preview">
					<div style="font-weight: 600; font-size: 1rem; margin-bottom: 0.35rem; display: flex; justify-content: space-between; align-items: center;">
						<span><i class="fa fa-bookmark" style="color: #d97706;"></i> ${table.customer || __('Reserved Party')}</span>
						${table.customer_id ? `<span class="badge badge-light" style="font-size: 0.72rem;">${table.customer_id}</span>` : ''}
					</div>
					${table.customer_mobile ? `<div><strong>${__('Mobile:')}</strong> +91 ${table.customer_mobile}</div>` : ''}
					<div><strong>${__('Reservation Time:')}</strong> ${table.reservation_time || __('Today')}</div>
					<div><strong>${__('Party Size:')}</strong> ${table.guests || table.capacity} guests</div>
					${table.notes ? `<div style="margin-top: 0.4rem; font-style: italic;">"${table.notes}"</div>` : ''}
				</div>
			`;
		}

		fields.push({
			fieldtype: 'HTML',
			fieldname: 'summary_html',
			options: header_html
		});

		if (table.status === 'Available') {
			let is_reserve = (action_type === 'reserve');
			let title_label = is_reserve
				? __('Reserve Table {0} ({1})', [table.table_no, table.area])
				: __('Seat Guests at Table {0} ({1})', [table.table_no, table.area]);

			let cust_options = [''];
			(this.data.customers || []).forEach(c => {
				cust_options.push(`${c.name} (${c.mobile})`);
			});

			fields.push(
				{
					fieldtype: 'Section Break',
					label: is_reserve ? __('Guest & Reservation Details') : __('Guest & Seating Assignment')
				},
				{
					fieldtype: 'Data',
					fieldname: 'customer_mobile',
					label: __('Customer Mobile (10 Digits)'),
					reqd: 1,
					default: '',
					description: __('Enter mobile to search registered guests or register a new one')
				},
				{
					fieldtype: 'HTML',
					fieldname: 'customer_status_html'
				},
				{
					fieldtype: 'Select',
					fieldname: 'customer_select',
					label: __('Quick Select Registered Guest'),
					options: cust_options.join('\n'),
					default: ''
				},
				{
					fieldtype: 'Data',
					fieldname: 'customer_name',
					label: __('Customer Full Name'),
					reqd: 1,
					default: ''
				},
				{
					fieldtype: 'Int',
					fieldname: 'guests_count',
					label: __('Guest Count'),
					reqd: 1,
					default: table.capacity,
					description: __('Max table capacity: {0} seats', [table.capacity])
				}
			);

			if (is_reserve) {
				fields.push({
					fieldtype: 'Data',
					fieldname: 'reservation_time',
					label: __('Reservation Time'),
					reqd: 1,
					default: '8:00 PM'
				});
			}

			fields.push({
				fieldtype: 'Small Text',
				fieldname: 'notes',
				label: __('Special Requests / Server Notes'),
				default: is_reserve ? 'Window seat preferred' : ''
			});

			let d = new frappe.ui.Dialog({
				title: title_label,
				fields: fields,
				primary_action_label: is_reserve ? __('Confirm Reservation') : __('Occupy Table (Seat Guests)'),
				primary_action: function (values) {
					if (!values) return;
					let clean_mobile = (values.customer_mobile || '').replace(/\D/g, '');
					if (clean_mobile.length === 12 && clean_mobile.startsWith('91')) clean_mobile = clean_mobile.substring(2);
					if (clean_mobile.length === 11 && clean_mobile.startsWith('0')) clean_mobile = clean_mobile.substring(1);

					if (clean_mobile.length !== 10) {
						frappe.msgprint(__('Please enter a valid 10-digit mobile number.'));
						return;
					}

					let clean_name = (values.customer_name || '').trim();
					if (!clean_name) {
						frappe.msgprint(__('Please enter customer name.'));
						d.get_field('customer_name').$input.focus();
						return;
					}

					d.hide();
					let status = is_reserve ? 'Reserved' : 'Occupied';
					me.submit_table_update(
						table.table_no,
						status,
						clean_name,
						clean_mobile,
						values.guests_count,
						values.reservation_time || '',
						values.notes || ''
					);
				}
			});

			let $mobile_input = d.get_field('customer_mobile').$input;
			let $name_input = d.get_field('customer_name').$input;
			let $status_wrapper = d.get_field('customer_status_html').$wrapper;
			let selected_customer_id = '';
			let last_looked_up_mobile = '';
			let syncing_inputs = false;
			let lookup_timer = null;

			let perform_lookup = function (val, force = false) {
				let clean = (val || '').replace(/\D/g, '');
				if (clean.length === 12 && clean.startsWith('91')) clean = clean.substring(2);
				if (clean.length === 11 && clean.startsWith('0')) clean = clean.substring(1);

				if (clean.length === 10) {
					if (!force && clean === last_looked_up_mobile) return;
					last_looked_up_mobile = clean;

					$status_wrapper.html(`
						<div style="font-size: 0.8rem; color: #64748b; padding: 0.25rem 0;">
							<i class="fa fa-spinner fa-spin"></i> ${__('Searching customer registry...')}
						</div>
					`);
					frappe.call({
						method: 'restaurant_management.restaurant_management.page.restaurant_floor_management.restaurant_floor_management.lookup_customer',
						args: { mobile: clean },
						callback: function (r) {
							let current_clean = (d.get_value('customer_mobile') || '').replace(/\D/g, '');
							if (current_clean.length === 12 && current_clean.startsWith('91')) current_clean = current_clean.substring(2);
							if (current_clean.length === 11 && current_clean.startsWith('0')) current_clean = current_clean.substring(1);
							if (current_clean !== clean) return;

							if (r.message) {
								let c = r.message;
								selected_customer_id = c.customer_id;

								syncing_inputs = true;
								d.set_value('customer_name', c.name);

								let customers = me.data.customers || [];
								let match = customers.find(x => x.mobile === c.mobile || x.customer_id === c.customer_id);
								if (match) {
									d.set_value('customer_select', `${match.name} (${match.mobile})`);
								} else {
									d.set_value('customer_select', `${c.name} (${c.mobile})`);
								}
								syncing_inputs = false;

								$name_input.prop('readonly', false);

								$status_wrapper.html(`
									<div class="customer-lookup-status returning-guest" style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 0.5rem 0.75rem; margin-top: 0.25rem; font-size: 0.82rem; color: #166534;">
										<div style="font-weight: 600; display: flex; justify-content: space-between; align-items: center;">
											<span><i class="fa fa-check-circle" style="color: #16a34a;"></i> ${__('Returning Guest')}: <strong>${c.name}</strong> (${c.customer_id})</span>
											<button type="button" class="btn btn-xs btn-default btn-lookup-history" data-cust-id="${c.customer_id}">
												<i class="fa fa-history"></i> ${__('View History')}
											</button>
										</div>
										<div style="font-size: 0.76rem; color: #15803d; margin-top: 0.25rem;">
											<span><i class="fa fa-calendar-check-o"></i> ${c.total_visits} ${__('Visits')}</span> &bull; 
											<span><i class="fa fa-inr"></i> ${__('Total Spent')}: ${c.formatted_spent}</span> &bull; 
											<span>${__('Last Visit')}: ${c.last_visit || __('Recently')}</span>
										</div>
									</div>
								`);
								$status_wrapper.find('.btn-lookup-history').on('click', function () {
									me.open_customer_history_dialog(c.customer_id);
								});
							} else {
								// Mobile not found -> New Guest Registration
								selected_customer_id = '';

								syncing_inputs = true;
								d.set_value('customer_select', '');
								d.set_value('customer_name', '');
								syncing_inputs = false;

								$name_input.prop('readonly', false);

								$status_wrapper.html(`
									<div class="customer-lookup-status new-guest" style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px; padding: 0.5rem 0.75rem; margin-top: 0.25rem; font-size: 0.82rem; color: #9a3412;">
										<div><i class="fa fa-user-plus" style="color: #ea580c;"></i> <strong>${__('New Guest Registration')}:</strong> ${__('Mobile')} ${clean} ${__('is not in the registry. Enter guest name below.')}</div>
									</div>
								`);

								setTimeout(() => {
									$name_input.focus();
								}, 50);
							}
						}
					});
				} else {
					last_looked_up_mobile = '';
					if (selected_customer_id) {
						selected_customer_id = '';
						syncing_inputs = true;
						d.set_value('customer_select', '');
						d.set_value('customer_name', '');
						syncing_inputs = false;
					}
					if (clean.length > 0) {
						$status_wrapper.html(`
							<div style="font-size: 0.78rem; color: #64748b; margin-top: 0.2rem;">
								<i class="fa fa-info-circle"></i> ${__('Enter 10 digits for instant customer lookup')} (${clean.length}/10)
							</div>
						`);
					} else {
						$status_wrapper.html('');
					}
				}
			};

			$mobile_input.on('input change blur paste keyup', function () {
				if (syncing_inputs) return;
				clearTimeout(lookup_timer);
				let val = $(this).val();
				let clean = (val || '').replace(/\D/g, '');
				if (clean.length === 12 && clean.startsWith('91')) clean = clean.substring(2);
				if (clean.length === 11 && clean.startsWith('0')) clean = clean.substring(1);

				if (selected_customer_id && clean !== last_looked_up_mobile) {
					selected_customer_id = '';
					syncing_inputs = true;
					d.set_value('customer_select', '');
					d.set_value('customer_name', '');
					syncing_inputs = false;
				}

				if (clean.length === 10) {
					if (clean === last_looked_up_mobile) return;
					lookup_timer = setTimeout(function () {
						perform_lookup(clean);
					}, 200);
				} else {
					last_looked_up_mobile = '';
					if (clean.length > 0) {
						$status_wrapper.html(`
							<div style="font-size: 0.78rem; color: #64748b; margin-top: 0.2rem;">
								<i class="fa fa-info-circle"></i> ${__('Enter 10 digits for instant customer lookup')} (${clean.length}/10)
							</div>
						`);
					} else {
						$status_wrapper.html('');
					}
				}
			});

			d.get_field('customer_select').$input.on('change', function () {
				if (syncing_inputs) return;
				let val = d.get_value('customer_select');
				if (!val) {
					selected_customer_id = '';
					last_looked_up_mobile = '';
					syncing_inputs = true;
					d.set_value('customer_mobile', '');
					d.set_value('customer_name', '');
					syncing_inputs = false;
					$status_wrapper.html('');
					return;
				}
				let customers = me.data.customers || [];
				let match = customers.find(c => `${c.name} (${c.mobile})` === val || c.name === val || c.mobile === val);
				if (match) {
					selected_customer_id = match.customer_id;
					syncing_inputs = true;
					d.set_value('customer_mobile', match.mobile);
					d.set_value('customer_name', match.name);
					syncing_inputs = false;
					perform_lookup(match.mobile, true);
				}
			});

			let init_mobile = d.get_value('customer_mobile');
			if (init_mobile) {
				setTimeout(() => {
					perform_lookup(init_mobile);
				}, 100);
			}

			if (is_reserve) {
				d.add_custom_action(__('Switch to Seat Now'), function () {
					d.hide();
					me.open_table_dialog(table, 'seat');
				});
			} else {
				d.add_custom_action(__('Switch to Reserve'), function () {
					d.hide();
					me.open_table_dialog(table, 'reserve');
				});
			}

			d.show();

		} else if (table.status === 'Occupied') {
			fields.push(
				{
					fieldtype: 'Section Break',
					label: __('Update Table Details')
				},
				{
					fieldtype: 'Small Text',
					fieldname: 'notes',
					label: __('Notes / Special Requests'),
					default: table.notes || ''
				}
			);

			let d = new frappe.ui.Dialog({
				title: __('Manage Table {0} - {1}', [table.table_no, table.area]),
				fields: fields,
				primary_action_label: __('Release / Vacate Table'),
				primary_action: function () {
					d.hide();
					me.confirm_release_table(table.table_no);
				}
			});

			if (!table.order_id) {
				d.add_custom_action(__('Start Order'), function () {
					d.hide();
					me.open_order_modal(table, false);
				});
			} else {
				d.add_custom_action(__('Add More Items'), function () {
					d.hide();
					me.open_order_modal(table, true);
				});
				d.add_custom_action(__('View Bill / Receipt'), function () {
					d.hide();
					me.open_receipt_dialog(table.order_id);
				});
			}

			d.add_custom_action(__('Transfer Table'), function () {
				d.hide();
				me.open_table_transfer_dialog(table);
			});

			if (table.customer_id || table.customer_mobile) {
				d.add_custom_action(__('Guest Profile & History'), function () {
					d.hide();
					me.open_customer_history_dialog(table.customer_id || table.customer_mobile);
				});
			}

			d.add_custom_action(__('Save Notes'), function () {
				let values = d.get_values();
				d.hide();
				me.submit_table_update(
					table.table_no,
					'Occupied',
					table.customer,
					table.customer_mobile,
					table.guests,
					'',
					values ? values.notes : table.notes
				);
			});

			d.show();

		} else if (table.status === 'Reserved') {
			let d = new frappe.ui.Dialog({
				title: __('Reservation Details - Table {0}', [table.table_no]),
				fields: fields,
				primary_action_label: __('Check-in & Seat Guests'),
				primary_action: function () {
					d.hide();
					me.submit_table_update(
						table.table_no,
						'Occupied',
						table.customer,
						table.customer_mobile,
						table.guests || table.capacity,
						'',
						table.notes
					);
				}
			});

			if (table.customer_id || table.customer_mobile) {
				d.add_custom_action(__('Guest History'), function () {
					d.hide();
					me.open_customer_history_dialog(table.customer_id || table.customer_mobile);
				});
			}

			d.add_custom_action(__('Cancel Reservation'), function () {
				d.hide();
				frappe.confirm(
					__('Are you sure you want to cancel the reservation for Table {0}?', [table.table_no]),
					function () {
						me.submit_table_update(table.table_no, 'Available');
					}
				);
			});

			d.show();
		}
	}

	submit_table_update(table_no, status, customer, customer_mobile, guests, reservation_time, notes) {
		let me = this;
		frappe.call({
			method: 'restaurant_management.restaurant_management.page.restaurant_floor_management.restaurant_floor_management.update_table_status',
			args: {
				table_no: table_no,
				status: status,
				customer: customer || '',
				customer_mobile: customer_mobile || '',
				guests: guests || 0,
				reservation_time: reservation_time || '',
				notes: notes || ''
			},
			freeze: true,
			freeze_message: __('Updating table status...'),
			callback: function (r) {
				if (r.message) {
					me.data = r.message;
					me.selected_table_no = table_no;
					me.render_all();
					frappe.show_alert({
						message: __('Table {0} updated to {1}.', [table_no, status]),
						indicator: (status === 'Occupied' ? 'blue' : (status === 'Reserved' ? 'orange' : 'green'))
					});
				}
			}
		});
	}

	// =========================================================================
	// Customer History Modal
	// =========================================================================
	open_customer_history_dialog(customer_id_or_mobile) {
		let me = this;
		frappe.call({
			method: 'restaurant_management.restaurant_management.page.restaurant_floor_management.restaurant_floor_management.get_customer_history',
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
					? favs.map(f => `<span class="badge badge-light" style="font-size: 0.78rem; padding: 4px 8px; margin-right: 5px; margin-bottom: 5px; background: #f8fafc; border: 1px solid #e2e8f0;"><i class="fa fa-cutlery" style="color: #ea580c;"></i> ${f.name} <strong style="color: #0f172a;">(${f.count}x)</strong></span>`).join('')
					: `<span style="color: #64748b; font-size: 0.8rem;">${__('No order history yet')}</span>`;

				let ordersHtml = '';
				if (orders.length === 0) {
					ordersHtml = `<tr><td colspan="8" style="text-align: center; color: #64748b; padding: 1rem;">${__('No past orders found.')}</td></tr>`;
				} else {
					orders.forEach(o => {
						let isPaid = o.payment_status === 'Paid';
						ordersHtml += `
							<tr>
								<td><strong>${o.order_id}</strong></td>
								<td>${o.table_no} (${o.area})</td>
								<td>${o.created_at || o.time_ago || __('Today')}</td>
								<td style="text-align: center;">${(o.items || []).reduce((acc, it) => acc + (it.qty || 1), 0)}</td>
								<td style="text-align: right; font-weight: 600;">${o.formatted_amount || ('₹' + o.total)}</td>
								<td style="text-align: center;"><span class="badge badge-light">${o.status}</span></td>
								<td style="text-align: center;"><span style="font-weight: 600; color: ${isPaid ? '#059669' : '#ea580c'};">${o.payment_status || 'Unpaid'}</span></td>
								<td style="text-align: center;">
									<button type="button" class="btn btn-xs btn-default btn-view-hist-receipt" data-order-id="${o.order_id}">
										<i class="fa fa-file-text-o"></i> ${__('Bill')}
									</button>
								</td>
							</tr>
						`;
					});
				}

				let html = `
					<div class="cust-history-wrapper" style="font-size: 0.88rem;">
						<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; margin-bottom: 1.25rem;">
							<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem;">
								<div>
									<h3 style="margin: 0; font-size: 1.2rem; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 0.5rem;">
										<i class="fa fa-user-circle" style="color: #ea580c;"></i> ${cust.name}
										<span class="badge badge-info" style="font-size: 0.75rem; vertical-align: middle;">${cust.customer_id}</span>
									</h3>
									<div style="color: #64748b; font-size: 0.85rem; margin-top: 0.25rem;">
										<i class="fa fa-phone"></i> +91 ${cust.mobile} &bull; 
										<i class="fa fa-calendar-o"></i> ${__('Registered')}: ${cust.created_at ? cust.created_at.split(' ')[0] : '2026-10-15'}
									</div>
								</div>
								<div style="text-align: right;">
									<span class="badge" style="background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; padding: 4px 8px; font-weight: 600;">
										<i class="fa fa-check-circle"></i> ${__('Verified Guest')}
									</span>
									<div style="font-size: 0.78rem; color: #64748b; margin-top: 0.25rem;">
										${__('Last Visit')}: <strong>${cust.last_visit || __('Today')}</strong>
									</div>
								</div>
							</div>

							<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-top: 1rem;">
								<div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.65rem 0.85rem; text-align: center;">
									<div style="font-size: 0.75rem; color: #64748b; text-transform: uppercase;">${__('Total Visits')}</div>
									<div style="font-size: 1.3rem; font-weight: 700; color: #ea580c; margin-top: 0.15rem;">${cust.total_visits || 1}</div>
								</div>
								<div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.65rem 0.85rem; text-align: center;">
									<div style="font-size: 0.75rem; color: #64748b; text-transform: uppercase;">${__('Lifetime Orders')}</div>
									<div style="font-size: 1.3rem; font-weight: 700; color: #059669; margin-top: 0.15rem;">${hist.total_orders || 0}</div>
								</div>
								<div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.65rem 0.85rem; text-align: center;">
									<div style="font-size: 0.75rem; color: #64748b; text-transform: uppercase;">${__('Total Spend')}</div>
									<div style="font-size: 1.3rem; font-weight: 700; color: #0f172a; margin-top: 0.15rem;">${hist.formatted_total_spent}</div>
								</div>
							</div>
						</div>

						<div style="margin-bottom: 1.25rem;">
							<h4 style="margin: 0 0 0.5rem 0; font-size: 0.92rem; font-weight: 700; color: #0f172a;">
								<i class="fa fa-heart" style="color: #ef4444;"></i> ${__('Favorite Dishes')}
							</h4>
							<div style="display: flex; flex-wrap: wrap;">
								${favsHtml}
							</div>
						</div>

						<div>
							<h4 style="margin: 0 0 0.5rem 0; font-size: 0.92rem; font-weight: 700; color: #0f172a;">
								<i class="fa fa-list-alt" style="color: #ea580c;"></i> ${__('Order History')}
							</h4>
							<div class="table-responsive" style="max-height: 240px; overflow-y: auto;">
								<table class="table table-bordered table-hover" style="font-size: 0.82rem; margin: 0;">
									<thead style="background: #f8fafc; position: sticky; top: 0; z-index: 2;">
										<tr>
											<th>${__('Order ID')}</th>
											<th>${__('Table')}</th>
											<th>${__('Date & Time')}</th>
											<th style="text-align: center;">${__('Items')}</th>
											<th style="text-align: right;">${__('Amount')}</th>
											<th style="text-align: center;">${__('Status')}</th>
											<th style="text-align: center;">${__('Payment')}</th>
											<th style="text-align: center;">${__('Action')}</th>
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

				let d = new frappe.ui.Dialog({
					title: __('Customer Profile & History — {0}', [cust.name]),
					fields: [{ fieldtype: 'HTML', fieldname: 'html', options: html }],
					primary_action_label: __('Close'),
					primary_action: function () { d.hide(); }
				});

				d.$wrapper.find('.btn-view-hist-receipt').on('click', function () {
					let oId = $(this).data('order-id');
					if (oId) me.open_receipt_dialog(oId);
				});

				d.show();
			}
		});
	}

	// =========================================================================
	// Bill & Receipt Modal
	// =========================================================================
	open_receipt_dialog(order_id) {
		let me = this;
		frappe.call({
			method: 'restaurant_management.restaurant_management.page.restaurant_floor_management.restaurant_floor_management.get_receipt_data',
			args: { order_id: order_id },
			freeze: true,
			freeze_message: __('Generating bill receipt...'),
			callback: function (r) {
				if (!r.message) return;
				let b = r.message;
				let itemsHtml = (b.items || []).map(it => `
					<tr>
						<td style="padding: 4px 0;">${it.dish}</td>
						<td style="padding: 4px 0; text-align: center;">${it.qty}</td>
						<td style="padding: 4px 0; text-align: right;">${it.rate}</td>
						<td style="padding: 4px 0; text-align: right; font-weight: 600;">${it.amount}</td>
					</tr>
				`).join('');

				let html = `
					<div class="receipt-printable-container" style="max-width: 360px; margin: 0 auto; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 1.25rem; font-family: monospace; font-size: 0.85rem; color: #0f172a;">
						<div style="text-align: center; border-bottom: 1px dashed #cbd5e1; padding-bottom: 0.75rem; margin-bottom: 0.75rem;">
							<div style="font-size: 1.15rem; font-weight: 800; letter-spacing: 0.05em;">${b.restaurant_name}</div>
							<div style="font-size: 0.75rem; color: #64748b;">${b.address}</div>
							<div style="font-size: 0.75rem; color: #64748b;">GSTIN: ${b.gstin} &bull; Ph: ${b.phone}</div>
						</div>
						<div style="font-size: 0.8rem; margin-bottom: 0.75rem;">
							<div style="display: flex; justify-content: space-between;"><span>${__('Bill No:')}</span><strong>${b.bill_no}</strong></div>
							<div style="display: flex; justify-content: space-between;"><span>${__('Order Ref:')}</span><span>${b.order_id}</span></div>
							<div style="display: flex; justify-content: space-between;"><span>${__('Date & Time:')}</span><span>${b.date_time}</span></div>
							<div style="display: flex; justify-content: space-between;"><span>${__('Table:')}</span><strong>${b.table_no} (${b.area})</strong></div>
							<div style="display: flex; justify-content: space-between;"><span>${__('Guest:')}</span><strong>${b.customer}</strong></div>
							${b.customer_mobile ? `<div style="display: flex; justify-content: space-between;"><span>${__('Mobile:')}</span><span>+91 ${b.customer_mobile}</span></div>` : ''}
						</div>
						<table style="width: 100%; border-top: 1px dashed #cbd5e1; border-bottom: 1px dashed #cbd5e1; margin-bottom: 0.75rem; font-size: 0.8rem;">
							<thead>
								<tr style="border-bottom: 1px dashed #e2e8f0; font-weight: 700;">
									<th style="padding: 4px 0; text-align: left;">Item</th>
									<th style="padding: 4px 0; text-align: center;">Qty</th>
									<th style="padding: 4px 0; text-align: right;">Rate</th>
									<th style="padding: 4px 0; text-align: right;">Amt</th>
								</tr>
							</thead>
							<tbody>
								${itemsHtml}
							</tbody>
						</table>
						<div style="font-size: 0.82rem; margin-bottom: 0.75rem;">
							<div style="display: flex; justify-content: space-between; margin-bottom: 2px;"><span>Subtotal:</span><span>${b.subtotal}</span></div>
							<div style="display: flex; justify-content: space-between; margin-bottom: 2px;"><span>CGST (2.5%):</span><span>${b.cgst}</span></div>
							<div style="display: flex; justify-content: space-between; margin-bottom: 2px;"><span>SGST (2.5%):</span><span>${b.sgst}</span></div>
							<div style="display: flex; justify-content: space-between; margin-bottom: 2px;"><span>Service Charge (5%):</span><span>${b.service_charge}</span></div>
							<div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 1rem; border-top: 1px solid #0f172a; padding-top: 4px; margin-top: 4px;">
								<span>TOTAL:</span><span>${b.grand_total}</span>
							</div>
						</div>
						<div style="text-align: center; border-top: 1px dashed #cbd5e1; padding-top: 0.5rem; font-size: 0.75rem; color: #64748b;">
							<div>Payment: <strong>${b.payment_status}</strong> via ${b.payment_method}</div>
							<div style="margin-top: 4px;">Thank you for dining with us!</div>
						</div>
					</div>
				`;

				let d = new frappe.ui.Dialog({
					title: __('Customer Bill & Receipt — {0}', [order_id]),
					fields: [{ fieldtype: 'HTML', fieldname: 'receipt_html', options: html }],
					primary_action_label: __('Print Receipt'),
					primary_action: function () {
						let win = window.open('', '', 'width=450,height=600');
						win.document.write(`<html><head><title>Receipt ${b.bill_no}</title></head><body>${html}</body></html>`);
						win.document.close();
						win.print();
					}
				});

				d.add_custom_action(__('Download PDF'), function () {
					window.open(frappe.urllib.get_full_url(
						`/api/method/restaurant_management.restaurant_management.page.restaurant_floor_management.restaurant_floor_management.download_bill_pdf?order_id=${order_id}`
					));
				});

				d.show();
			}
		});
	}

	// =========================================================================
	// Order Creation & Add Items Modal (POS Ordering)
	// =========================================================================
	open_order_modal(table, is_addon = false) {
		let me = this;
		frappe.restaurant.open_pos_dialog({
			target_table_no: table ? table.table_no : null,
			existing_order_id: is_addon ? (table ? table.order_id : null) : null,
			existing_table: table,
			on_success: function (newOrder) {
				me.refresh();
			}
		});
	}
}
