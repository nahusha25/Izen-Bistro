// Copyright (c) 2026, Nahusha and contributors
// For license information, please see license.txt

frappe.pages["restaurant-inventory"].on_page_load = function (wrapper) {
	frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Inventory & Warehouse"),
		single_column: true,
	});

	frappe.breadcrumbs.add("Restaurant Management");

	wrapper.inventory_view = new RestaurantInventoryView(wrapper);
};

frappe.pages["restaurant-inventory"].on_page_show = function (wrapper) {
	frappe.breadcrumbs.add("Restaurant Management");
	if (wrapper.inventory_view) {
		wrapper.inventory_view.refresh();
	}
};

class RestaurantInventoryView {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = wrapper.page;
		this.active_tab = "inventory";
		this.active_category = "All";
		this.active_location = "All";
		this.active_status = "All";
		this.search_query = "";
		this.data = null;
		this.active_report_type = "stock_balance";
		this.report_data = null;

		this.init();
	}

	init() {
		if (this.page.clear_primary_action) this.page.clear_primary_action();
		if (this.page.clear_actions) this.page.clear_actions();
		this.render_skeleton();
		this.refresh();
	}

	render_skeleton() {
		const $container = $(this.wrapper).find(".page-content");
		$container.empty().html(`
			<div class="restaurant-inventory-wrapper">
				<!-- 1. Header & Actions -->
				<header class="ri-brand-header">
					<div class="ri-brand-left">
						<div class="ri-brand-logo">
							<i class="fa fa-cubes"></i>
						</div>
						<div class="ri-brand-text">
							<h2><span>IZEN BISTRO</span> • ${__("Inventory & Warehouse")}</h2>
							<p>${__("Centralized stock control, multi-location storage, purchase receipts & batch tracking")}</p>
						</div>
					</div>
					<div class="ri-header-actions">
						<button class="ri-btn ri-btn-success" id="btn-top-stock-in">
							<i class="fa fa-plus"></i> ${__("Stock In")}
						</button>
						<button class="ri-btn" id="btn-top-stock-out">
							<i class="fa fa-minus"></i> ${__("Stock Out")}
						</button>
						<button class="ri-btn" id="btn-top-transfer">
							<i class="fa fa-exchange"></i> ${__("Transfer")}
						</button>
						<button class="ri-btn ri-btn-primary" id="btn-top-new-po">
							<i class="fa fa-shopping-cart"></i> ${__("New PO")}
						</button>
						<button class="ri-btn ri-btn-danger" id="btn-top-wastage">
							<i class="fa fa-trash"></i> ${__("Wastage")}
						</button>
						<button class="ri-btn" id="btn-top-refresh" title="${__('Refresh Data')}">
							<i class="fa fa-refresh"></i>
						</button>
					</div>
				</header>

				<!-- 2. KPI Metrics Grid -->
				<div class="ri-kpi-grid">
					<div class="ri-kpi-card" data-tab="inventory">
						<div class="ri-kpi-header">
							<span class="ri-kpi-title">${__("Total Items")}</span>
							<div class="ri-kpi-icon icon-items"><i class="fa fa-cubes"></i></div>
						</div>
						<div class="ri-kpi-value" id="kpi-total-items">--</div>
						<div class="ri-kpi-sub">Across 10 Categories</div>
					</div>

					<div class="ri-kpi-card" data-tab="inventory">
						<div class="ri-kpi-header">
							<span class="ri-kpi-title">${__("Stock Valuation")}</span>
							<div class="ri-kpi-icon icon-val"><i class="fa fa-inr"></i></div>
						</div>
						<div class="ri-kpi-value" id="kpi-stock-val">₹0.00</div>
						<div class="ri-kpi-sub">Total On-Hand Value</div>
					</div>

					<div class="ri-kpi-card" data-tab="inventory" data-status-filter="Low Stock">
						<div class="ri-kpi-header">
							<span class="ri-kpi-title">${__("Low Stock")}</span>
							<div class="ri-kpi-icon icon-low"><i class="fa fa-exclamation-triangle"></i></div>
						</div>
						<div class="ri-kpi-value text-warning" id="kpi-low-stock">0</div>
						<div class="ri-kpi-sub">At or below reorder level</div>
					</div>

					<div class="ri-kpi-card" data-tab="inventory" data-status-filter="Out of Stock">
						<div class="ri-kpi-header">
							<span class="ri-kpi-title">${__("Out of Stock")}</span>
							<div class="ri-kpi-icon icon-out"><i class="fa fa-times-circle"></i></div>
						</div>
						<div class="ri-kpi-value text-danger" id="kpi-out-stock">0</div>
						<div class="ri-kpi-sub">Immediate reorder required</div>
					</div>

					<div class="ri-kpi-card" data-tab="batches">
						<div class="ri-kpi-header">
							<span class="ri-kpi-title">${__("Expiring Soon")}</span>
							<div class="ri-kpi-icon icon-exp"><i class="fa fa-clock-o"></i></div>
						</div>
						<div class="ri-kpi-value text-warning" id="kpi-expiring-soon">0</div>
						<div class="ri-kpi-sub">Batches expiring in ≤ 7 days</div>
					</div>

					<div class="ri-kpi-card" data-tab="movements">
						<div class="ri-kpi-header">
							<span class="ri-kpi-title">${__("Stock Movements")}</span>
							<div class="ri-kpi-icon icon-mov"><i class="fa fa-history"></i></div>
						</div>
						<div class="ri-kpi-value" id="kpi-movements-count">0</div>
						<div class="ri-kpi-sub">Audit trail ledger entries</div>
					</div>
				</div>

				<!-- 3. Main Navigation Tabs -->
				<nav class="ri-tabs-nav">
					<button class="ri-tab-btn active" data-tab="inventory">
						<i class="fa fa-list"></i> ${__("Stock Inventory")} <span class="ri-tab-badge" id="tab-count-inv">0</span>
					</button>
					<button class="ri-tab-btn" data-tab="movements">
						<i class="fa fa-history"></i> ${__("Movement Ledger")} <span class="ri-tab-badge" id="tab-count-mov">0</span>
					</button>
					<button class="ri-tab-btn" data-tab="purchase_orders">
						<i class="fa fa-shopping-cart"></i> ${__("Purchase Orders")} <span class="ri-tab-badge" id="tab-count-po">0</span>
					</button>
					<button class="ri-tab-btn" data-tab="suppliers">
						<i class="fa fa-truck"></i> ${__("Suppliers Registry")} <span class="ri-tab-badge" id="tab-count-sup">0</span>
					</button>
					<button class="ri-tab-btn" data-tab="batches">
						<i class="fa fa-tags"></i> ${__("Batch & Expiry")} <span class="ri-tab-badge" id="tab-count-batch">0</span>
					</button>
					<button class="ri-tab-btn" data-tab="wastage">
						<i class="fa fa-trash-o"></i> ${__("Wastage Log")} <span class="ri-tab-badge" id="tab-count-wst">0</span>
					</button>
					<button class="ri-tab-btn" data-tab="reports">
						<i class="fa fa-bar-chart"></i> ${__("Reports & Export")}
					</button>
				</nav>

				<!-- 4. Tab Contents Viewport -->
				<main class="ri-tab-content-area" id="ri-tab-content">
					<div class="ri-loading text-center p-5">
						<i class="fa fa-spinner fa-spin fa-2x text-muted"></i>
						<p class="text-muted mt-2">${__("Loading Izen Bistro inventory...")}</p>
					</div>
				</main>
			</div>
		`);

		this.bind_global_events();
	}

	bind_global_events() {
		const me = this;

		// Top quick actions
		$("#btn-top-refresh").on("click", () => me.refresh());
		$("#btn-top-stock-in").on("click", () => me.showStockInDialog());
		$("#btn-top-stock-out").on("click", () => me.showStockOutDialog());
		$("#btn-top-transfer").on("click", () => me.showStockTransferDialog());
		$("#btn-top-new-po").on("click", () => me.showPurchaseOrderDialog());
		$("#btn-top-wastage").on("click", () => me.showWastageDialog());

		// Tabs navigation
		$(this.wrapper).on("click", ".ri-tab-btn", function () {
			const targetTab = $(this).data("tab");
			me.switch_tab(targetTab);
		});

		// KPI click filters
		$(this.wrapper).on("click", ".ri-kpi-card", function () {
			const tab = $(this).data("tab");
			const stat = $(this).data("status-filter");
			if (stat) {
				me.active_status = stat;
			}
			me.switch_tab(tab);
		});
	}

	switch_tab(tabName) {
		this.active_tab = tabName;
		$(this.wrapper).find(".ri-tab-btn").removeClass("active");
		$(this.wrapper).find(`.ri-tab-btn[data-tab="${tabName}"]`).addClass("active");
		this.render_active_tab();
	}

	refresh() {
		const me = this;
		frappe.call({
			method: "restaurant_management.restaurant_management.page.restaurant_inventory.restaurant_inventory.get_inventory_dashboard_data",
			args: {
				category: me.active_category,
				location: me.active_location,
				status: me.active_status,
				search: me.search_query,
			},
			callback: function (r) {
				if (r.message) {
					me.data = r.message;
					me.update_kpis();
					me.render_active_tab();
				}
			},
		});
	}

	update_kpis() {
		if (!this.data || !this.data.summary) return;
		const s = this.data.summary;
		$("#kpi-total-items").text(s.total_items);
		$("#kpi-stock-val").text(s.formatted_stock_value);
		$("#kpi-low-stock").text(s.low_stock_count);
		$("#kpi-out-stock").text(s.out_of_stock_count);
		$("#kpi-expiring-soon").text(s.expiring_soon_count);
		$("#kpi-movements-count").text(s.movements_count);

		$("#tab-count-inv").text(s.total_items);
		$("#tab-count-mov").text(s.movements_count);
		$("#tab-count-po").text(this.data.purchase_orders ? this.data.purchase_orders.length : 0);
		$("#tab-count-sup").text(this.data.suppliers ? this.data.suppliers.length : 0);
		$("#tab-count-batch").text(this.data.batches ? this.data.batches.length : 0);
		$("#tab-count-wst").text(this.data.wastage_records ? this.data.wastage_records.length : 0);
	}

	render_active_tab() {
		const $content = $("#ri-tab-content");
		if (!this.data) return;

		switch (this.active_tab) {
			case "inventory":
				this.render_inventory_tab($content);
				break;
			case "movements":
				this.render_movements_tab($content);
				break;
			case "purchase_orders":
				this.render_purchase_orders_tab($content);
				break;
			case "suppliers":
				this.render_suppliers_tab($content);
				break;
			case "batches":
				this.render_batches_tab($content);
				break;
			case "wastage":
				this.render_wastage_tab($content);
				break;
			case "reports":
				this.render_reports_tab($content);
				break;
			default:
				this.render_inventory_tab($content);
		}
	}

	// =========================================================================
	// TAB 1: Stock Inventory
	// =========================================================================
	render_inventory_tab($container) {
		const me = this;
		const items = this.data.items || [];
		const catCounts = this.data.category_counts || {};
		const locCounts = this.data.location_counts || {};

		const categories = [
			"All",
			"Grains & Rice",
			"Pulses & Dal",
			"Vegetables",
			"Fruits",
			"Dairy Products",
			"Meat & Poultry",
			"Spices & Masala",
			"Cooking Essentials",
			"Beverages",
			"Packaging Materials",
		];

		const locations = ["All", "Dry Storage", "Cold Storage", "Fresh Produce Storage"];
		const statuses = ["All", "In Stock", "Low Stock", "Out of Stock"];

		let catPillsHtml = categories
			.map((c) => {
				const active = me.active_category === c ? "active" : "";
				const count = c === "All" ? me.data.summary.total_items : catCounts[c] || 0;
				return `<button class="ri-pill ${active}" data-type="category" data-val="${c}">${c} <span class="ri-pill-count">(${count})</span></button>`;
			})
			.join("");

		let locPillsHtml = locations
			.map((l) => {
				const active = me.active_location === l ? "active" : "";
				const count = l === "All" ? me.data.summary.total_items : locCounts[l] || 0;
				return `<button class="ri-pill ${active}" data-type="location" data-val="${l}"><i class="fa fa-map-marker"></i> ${l} <span class="ri-pill-count">(${count})</span></button>`;
			})
			.join("");

		let statPillsHtml = statuses
			.map((s) => {
				const active = me.active_status === s ? "active" : "";
				return `<button class="ri-pill ${active}" data-type="status" data-val="${s}">${s}</button>`;
			})
			.join("");

		let rowsHtml = "";
		if (items.length === 0) {
			rowsHtml = `
				<tr>
					<td colspan="9" class="ri-empty-state">
						<i class="fa fa-inbox"></i>
						<div>${__("No inventory items found matching the selected filters.")}</div>
					</td>
				</tr>
			`;
		} else {
			rowsHtml = items
				.map((i) => {
					let badgeClass = "ri-badge-success";
					if (i.stock_status === "Low Stock") badgeClass = "ri-badge-warning";
					if (i.stock_status === "Out of Stock") badgeClass = "ri-badge-danger";

					return `
					<tr data-item-name="${frappe.utils.escape_html(i.name)}">
						<td><span class="font-weight-bold">${frappe.utils.escape_html(i.item_code || "--")}</span></td>
						<td>
							<div class="font-weight-bold text-dark">${frappe.utils.escape_html(i.name)}</div>
							<div class="text-muted small">${frappe.utils.escape_html(i.category || "")}</div>
						</td>
						<td><span class="ri-loc-tag"><i class="fa fa-archive"></i> ${frappe.utils.escape_html(i.location || "Dry Storage")}</span></td>
						<td>
							<div class="font-weight-bold">${i.formatted_qty}</div>
						</td>
						<td>${i.formatted_cost}</td>
						<td><span class="font-weight-bold">${i.formatted_stock_value}</span></td>
						<td>${i.reorder_level} ${i.unit}</td>
						<td><span class="ri-badge ${badgeClass}"><i class="fa fa-circle"></i> ${i.stock_status}</span></td>
						<td>
							<div class="ri-action-btns">
								<button class="ri-row-btn btn-in btn-action-in" title="${__('Stock In')}"><i class="fa fa-plus"></i></button>
								<button class="ri-row-btn btn-out btn-action-out" title="${__('Stock Out')}"><i class="fa fa-minus"></i></button>
								<button class="ri-row-btn btn-adj btn-action-adj" title="${__('Adjust Count')}"><i class="fa fa-sliders"></i></button>
								<button class="ri-row-btn btn-action-transfer" title="${__('Transfer Storage')}"><i class="fa fa-exchange"></i></button>
								<button class="ri-row-btn text-danger btn-action-waste" title="${__('Record Wastage')}"><i class="fa fa-trash"></i></button>
							</div>
						</td>
					</tr>
				`;
				})
				.join("");
		}

		$container.html(`
			<div class="ri-filter-panel">
				<div class="ri-filter-row">
					<div class="ri-search-box">
						<i class="fa fa-search"></i>
						<input type="text" class="ri-search-input" id="ri-inv-search" placeholder="${__('Search by item name or code...')}" value="${frappe.utils.escape_html(me.search_query)}">
					</div>
					<div class="ri-pills-row">
						<span class="text-muted small font-weight-bold mr-1">${__('Status:')}</span>
						${statPillsHtml}
					</div>
				</div>

				<div class="ri-filter-row">
					<div class="ri-pills-row">
						<span class="text-muted small font-weight-bold mr-1">${__('Category:')}</span>
						${catPillsHtml}
					</div>
				</div>

				<div class="ri-filter-row">
					<div class="ri-pills-row">
						<span class="text-muted small font-weight-bold mr-1">${__('Storage:')}</span>
						${locPillsHtml}
					</div>
				</div>
			</div>

			<div class="ri-table-card">
				<div class="ri-table-wrapper">
					<table class="ri-data-table">
						<thead>
							<tr>
								<th>${__("Item Code")}</th>
								<th>${__("Item Name & Category")}</th>
								<th>${__("Storage Location")}</th>
								<th>${__("Current Stock")}</th>
								<th>${__("Unit Rate")}</th>
								<th>${__("Valuation")}</th>
								<th>${__("Reorder Level")}</th>
								<th>${__("Status")}</th>
								<th>${__("Actions")}</th>
							</tr>
						</thead>
						<tbody>
							${rowsHtml}
						</tbody>
					</table>
				</div>
			</div>
		`);

		// Bind events
		$("#ri-inv-search").on("input", function () {
			me.search_query = $(this).val();
			me.refresh();
		});

		$container.find(".ri-pill").on("click", function () {
			const type = $(this).data("type");
			const val = $(this).data("val");
			if (type === "category") me.active_category = val;
			if (type === "location") me.active_location = val;
			if (type === "status") me.active_status = val;
			me.refresh();
		});

		$container.find(".btn-action-in").on("click", function () {
			const iname = $(this).closest("tr").data("item-name");
			me.showStockInDialog(iname);
		});

		$container.find(".btn-action-out").on("click", function () {
			const iname = $(this).closest("tr").data("item-name");
			me.showStockOutDialog(iname);
		});

		$container.find(".btn-action-adj").on("click", function () {
			const iname = $(this).closest("tr").data("item-name");
			me.showStockAdjustDialog(iname);
		});

		$container.find(".btn-action-transfer").on("click", function () {
			const iname = $(this).closest("tr").data("item-name");
			me.showStockTransferDialog(iname);
		});

		$container.find(".btn-action-waste").on("click", function () {
			const iname = $(this).closest("tr").data("item-name");
			me.showWastageDialog(iname);
		});
	}

	// =========================================================================
	// TAB 2: Movement Ledger
	// =========================================================================
	render_movements_tab($container) {
		const movs = this.data.recent_movements || [];

		let rowsHtml = "";
		if (movs.length === 0) {
			rowsHtml = `
				<tr>
					<td colspan="8" class="ri-empty-state">
						<i class="fa fa-history"></i>
						<div>${__("No stock movements recorded yet.")}</div>
					</td>
				</tr>
			`;
		} else {
			rowsHtml = movs
				.map((m) => {
					let typeBadge = "ri-badge-info";
					if (m.movement_type === "Stock In" || m.movement_type === "Goods Receipt") typeBadge = "ri-badge-success";
					if (m.movement_type === "Stock Out" || m.movement_type === "Order Consumption") typeBadge = "ri-badge-warning";
					if (m.movement_type === "Wastage") typeBadge = "ri-badge-danger";
					if (m.movement_type === "Stock Transfer") typeBadge = "ri-badge-purple";

					return `
					<tr>
						<td><span class="font-weight-bold text-dark">${frappe.utils.escape_html(m.movement_id)}</span></td>
						<td class="text-muted small">${frappe.utils.escape_html(m.timestamp)}</td>
						<td>
							<div class="font-weight-bold">${frappe.utils.escape_html(m.item_name)}</div>
							<div class="text-muted small">${frappe.utils.escape_html(m.item_code || "")}</div>
						</td>
						<td><span class="ri-badge ${typeBadge}">${frappe.utils.escape_html(m.movement_type)}</span></td>
						<td><span class="font-weight-bold">${m.qty} ${frappe.utils.escape_html(m.unit)}</span></td>
						<td>${frappe.utils.escape_html(m.from_location || "--")}</td>
						<td>${frappe.utils.escape_html(m.to_location || "--")}</td>
						<td>
							<div>${frappe.utils.escape_html(m.reason || "--")}</div>
							${m.reference ? `<span class="badge badge-light text-muted small">${frappe.utils.escape_html(m.reference)}</span>` : ""}
						</td>
					</tr>
				`;
				})
				.join("");
		}

		$container.html(`
			<div class="ri-table-card">
				<div class="p-3 border-bottom d-flex justify-content-between align-items-center">
					<h5 class="m-0 font-weight-bold"><i class="fa fa-history text-primary mr-2"></i> ${__("Persistent Stock Movements Audit Trail")}</h5>
					<span class="text-muted small">${__("Immutable ledger tracking every movement, purchase, recipe deduction and audit")}</span>
				</div>
				<div class="ri-table-wrapper">
					<table class="ri-data-table">
						<thead>
							<tr>
								<th>${__("Movement ID")}</th>
								<th>${__("Date & Time")}</th>
								<th>${__("Item")}</th>
								<th>${__("Movement Type")}</th>
								<th>${__("Quantity")}</th>
								<th>${__("From Location")}</th>
								<th>${__("To Location")}</th>
								<th>${__("Reason / Reference")}</th>
							</tr>
						</thead>
						<tbody>
							${rowsHtml}
						</tbody>
					</table>
				</div>
			</div>
		`);
	}

	// =========================================================================
	// TAB 3: Purchase Orders
	// =========================================================================
	render_purchase_orders_tab($container) {
		const me = this;
		const pos = this.data.purchase_orders || [];

		let rowsHtml = "";
		if (pos.length === 0) {
			rowsHtml = `
				<tr>
					<td colspan="7" class="ri-empty-state">
						<i class="fa fa-shopping-cart"></i>
						<div>${__("No purchase orders created yet.")}</div>
					</td>
				</tr>
			`;
		} else {
			rowsHtml = pos
				.map((p) => {
					const isReceived = p.status === "Received";
					const statBadge = isReceived ? "ri-badge-success" : "ri-badge-warning";
					const itemsSummary = (p.items || []).map((it) => `${it.qty} ${it.unit} ${it.item_name}`).join(", ");

					return `
					<tr data-po-number="${frappe.utils.escape_html(p.po_number)}">
						<td><span class="font-weight-bold">${frappe.utils.escape_html(p.po_number)}</span></td>
						<td>
							<div class="font-weight-bold text-dark">${frappe.utils.escape_html(p.supplier_name)}</div>
							<div class="text-muted small">${frappe.utils.escape_html(p.invoice_ref ? "Inv: " + p.invoice_ref : "")}</div>
						</td>
						<td class="text-muted">${frappe.utils.escape_html(p.date)}</td>
						<td><span class="text-muted small">${frappe.utils.escape_html(itemsSummary)}</span></td>
						<td><span class="font-weight-bold text-dark">₹${(p.total_amount || 0).toLocaleString()}</span></td>
						<td><span class="ri-badge ${statBadge}"><i class="fa fa-circle"></i> ${p.status}</span></td>
						<td>
							${
								!isReceived
									? `<button class="ri-btn ri-btn-success btn-receive-goods" style="padding: 0.3rem 0.65rem; font-size: 0.78rem;">
										<i class="fa fa-check"></i> ${__("Confirm Goods Receipt")}
									   </button>`
									: `<span class="text-success small font-weight-bold"><i class="fa fa-check-circle"></i> Received ${frappe.utils.escape_html(p.received_at || "")}</span>`
							}
						</td>
					</tr>
				`;
				})
				.join("");
		}

		$container.html(`
			<div class="ri-table-card">
				<div class="p-3 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
					<div>
						<h5 class="m-0 font-weight-bold"><i class="fa fa-shopping-cart text-primary mr-2"></i> ${__("Purchase Orders & Goods Receipts")}</h5>
						<span class="text-muted small">${__("Stock increases strictly upon confirmed goods receipt — duplicate receipts prevented")}</span>
					</div>
					<button class="ri-btn ri-btn-primary" id="btn-create-po-tab">
						<i class="fa fa-plus"></i> ${__("Create Purchase Order")}
					</button>
				</div>
				<div class="ri-table-wrapper">
					<table class="ri-data-table">
						<thead>
							<tr>
								<th>${__("PO Number")}</th>
								<th>${__("Supplier & Invoice Ref")}</th>
								<th>${__("PO Date")}</th>
								<th>${__("Ordered Items")}</th>
								<th>${__("Total Amount")}</th>
								<th>${__("Status")}</th>
								<th>${__("Actions")}</th>
							</tr>
						</thead>
						<tbody>
							${rowsHtml}
						</tbody>
					</table>
				</div>
			</div>
		`);

		$("#btn-create-po-tab").on("click", () => me.showPurchaseOrderDialog());

		$container.find(".btn-receive-goods").on("click", function () {
			const poNum = $(this).closest("tr").data("po-number");
			me.confirmGoodsReceipt(poNum);
		});
	}

	// =========================================================================
	// TAB 4: Suppliers Registry
	// =========================================================================
	render_suppliers_tab($container) {
		const me = this;
		const sups = this.data.suppliers || [];

		let rowsHtml = "";
		if (sups.length === 0) {
			rowsHtml = `
				<tr>
					<td colspan="6" class="ri-empty-state">
						<i class="fa fa-truck"></i>
						<div>${__("No suppliers registered yet.")}</div>
					</td>
				</tr>
			`;
		} else {
			rowsHtml = sups
				.map((s) => {
					const cats = (s.categories || []).map((c) => `<span class="ri-badge ri-badge-purple mr-1">${frappe.utils.escape_html(c)}</span>`).join(" ");
					const items = (s.supplied_items || []).join(", ");

					return `
					<tr>
						<td><span class="font-weight-bold text-dark">${frappe.utils.escape_html(s.supplier_id)}</span></td>
						<td>
							<div class="font-weight-bold text-dark">${frappe.utils.escape_html(s.name)}</div>
							<div class="text-muted small">${frappe.utils.escape_html(s.address || "")}</div>
						</td>
						<td>
							<div class="font-weight-bold">${frappe.utils.escape_html(s.contact_person || "--")}</div>
							<div class="text-muted small">${frappe.utils.escape_html(s.phone || "")} ${s.email ? `• ${frappe.utils.escape_html(s.email)}` : ""}</div>
						</td>
						<td>${cats}</td>
						<td><span class="text-muted small">${frappe.utils.escape_html(items || "--")}</span></td>
						<td>
							<button class="ri-row-btn btn-sup-create-po" data-supplier-id="${frappe.utils.escape_html(s.supplier_id)}" title="${__('Create PO')}">
								<i class="fa fa-plus"></i> ${__("PO")}
							</button>
						</td>
					</tr>
				`;
				})
				.join("");
		}

		$container.html(`
			<div class="ri-table-card">
				<div class="p-3 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
					<div>
						<h5 class="m-0 font-weight-bold"><i class="fa fa-truck text-primary mr-2"></i> ${__("Registered Suppliers Directory")}</h5>
						<span class="text-muted small">${__("Verified restaurant vendors supplying dairy, poultry, dry staples and fresh vegetables")}</span>
					</div>
					<button class="ri-btn ri-btn-primary" id="btn-add-supplier-tab">
						<i class="fa fa-plus"></i> ${__("Add Supplier")}
					</button>
				</div>
				<div class="ri-table-wrapper">
					<table class="ri-data-table">
						<thead>
							<tr>
								<th>${__("Supplier ID")}</th>
								<th>${__("Vendor Name & Location")}</th>
								<th>${__("Contact Person & Phone")}</th>
								<th>${__("Categories")}</th>
								<th>${__("Supplied Items")}</th>
								<th>${__("Actions")}</th>
							</tr>
						</thead>
						<tbody>
							${rowsHtml}
						</tbody>
					</table>
				</div>
			</div>
		`);

		$("#btn-add-supplier-tab").on("click", () => me.showSupplierDialog());

		$container.find(".btn-sup-create-po").on("click", function () {
			const supId = $(this).data("supplier-id");
			me.showPurchaseOrderDialog(supId);
		});
	}

	// =========================================================================
	// TAB 5: Batch & Expiry Tracking
	// =========================================================================
	render_batches_tab($container) {
		const me = this;
		const batches = this.data.batches || [];

		let rowsHtml = "";
		if (batches.length === 0) {
			rowsHtml = `
				<tr>
					<td colspan="8" class="ri-empty-state">
						<i class="fa fa-tags"></i>
						<div>${__("No batches tracked yet.")}</div>
					</td>
				</tr>
			`;
		} else {
			rowsHtml = batches
				.map((b) => {
					let statBadge = "ri-badge-success";
					if (b.status === "Expiring Soon") statBadge = "ri-badge-warning";
					if (b.status === "Expired") statBadge = "ri-badge-danger";

					let daysText = `${b.days_left} days left`;
					if (b.days_left < 0) daysText = `Expired ${Math.abs(b.days_left)} days ago`;
					if (b.days_left === 0) daysText = `Expires today!`;

					return `
					<tr>
						<td><span class="font-weight-bold text-dark">${frappe.utils.escape_html(b.batch_no)}</span></td>
						<td>
							<div class="font-weight-bold text-dark">${frappe.utils.escape_html(b.item_name)}</div>
							<div class="text-muted small">${frappe.utils.escape_html(b.item_code || "")}</div>
						</td>
						<td><span class="ri-loc-tag">${frappe.utils.escape_html(b.location || "Cold Storage")}</span></td>
						<td>${frappe.utils.escape_html(b.mfg_date || "--")}</td>
						<td class="font-weight-bold">${frappe.utils.escape_html(b.expiry_date || "--")}</td>
						<td><span class="font-weight-bold text-dark">${b.qty} ${frappe.utils.escape_html(b.unit || "kg")}</span></td>
						<td><span class="ri-badge ${statBadge}"><i class="fa fa-clock-o"></i> ${b.status} (${daysText})</span></td>
						<td>
							<button class="ri-row-btn text-danger btn-batch-waste" data-item-name="${frappe.utils.escape_html(b.item_name)}" data-batch-no="${frappe.utils.escape_html(b.batch_no)}" title="${__('Record Spoilage / Wastage')}">
								<i class="fa fa-trash"></i> ${__("Wastage")}
							</button>
						</td>
					</tr>
				`;
				})
				.join("");
		}

		$container.html(`
			<div class="ri-table-card">
				<div class="p-3 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
					<div>
						<h5 class="m-0 font-weight-bold"><i class="fa fa-tags text-primary mr-2"></i> ${__("Batch Tracking & Shelf Life Expiry")}</h5>
						<span class="text-muted small">${__("Monitors perishable dairy, poultry and dry ingredients with automated expiration warnings")}</span>
					</div>
					<button class="ri-btn ri-btn-primary" id="btn-add-batch-tab">
						<i class="fa fa-plus"></i> ${__("Register New Batch")}
					</button>
				</div>
				<div class="ri-table-wrapper">
					<table class="ri-data-table">
						<thead>
							<tr>
								<th>${__("Batch No")}</th>
								<th>${__("Item Name")}</th>
								<th>${__("Storage Location")}</th>
								<th>${__("Mfg Date")}</th>
								<th>${__("Expiry Date")}</th>
								<th>${__("Batch Qty")}</th>
								<th>${__("Status & Countdown")}</th>
								<th>${__("Actions")}</th>
							</tr>
						</thead>
						<tbody>
							${rowsHtml}
						</tbody>
					</table>
				</div>
			</div>
		`);

		$("#btn-add-batch-tab").on("click", () => me.showBatchDialog());

		$container.find(".btn-batch-waste").on("click", function () {
			const iname = $(this).data("item-name");
			const bno = $(this).data("batch-no");
			me.showWastageDialog(iname, bno);
		});
	}

	// =========================================================================
	// TAB 6: Wastage Log
	// =========================================================================
	render_wastage_tab($container) {
		const me = this;
		const wsts = this.data.wastage_records || [];

		let rowsHtml = "";
		if (wsts.length === 0) {
			rowsHtml = `
				<tr>
					<td colspan="8" class="ri-empty-state">
						<i class="fa fa-trash-o"></i>
						<div>${__("No wastage records logged yet.")}</div>
					</td>
				</tr>
			`;
		} else {
			rowsHtml = wsts
				.map((w) => {
					return `
					<tr>
						<td><span class="font-weight-bold text-dark">${frappe.utils.escape_html(w.wastage_id)}</span></td>
						<td class="text-muted small">${frappe.utils.escape_html(w.date)}</td>
						<td>
							<div class="font-weight-bold text-dark">${frappe.utils.escape_html(w.item_name)}</div>
							<div class="text-muted small">${frappe.utils.escape_html(w.item_code || "")}</div>
						</td>
						<td><span class="ri-badge ri-badge-danger">${frappe.utils.escape_html(w.reason)}</span></td>
						<td><span class="font-weight-bold">${w.qty} ${frappe.utils.escape_html(w.unit)}</span></td>
						<td><span class="font-weight-bold text-danger">${frappe.utils.escape_html(w.formatted_cost_impact || "₹" + (w.cost_impact || 0).toLocaleString())}</span></td>
						<td><span class="text-muted small">${frappe.utils.escape_html(w.notes || "--")}</span></td>
						<td><span class="badge badge-light text-muted small">${frappe.utils.escape_html(w.movement_id || "")}</span></td>
					</tr>
				`;
				})
				.join("");
		}

		$container.html(`
			<div class="ri-table-card">
				<div class="p-3 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
					<div>
						<h5 class="m-0 font-weight-bold"><i class="fa fa-trash text-danger mr-2"></i> ${__("Wastage & Spoilage Log")}</h5>
						<span class="text-muted small">${__("Records spoilage, expired goods, prep trimming waste and tracks financial impact")}</span>
					</div>
					<button class="ri-btn ri-btn-danger" id="btn-record-waste-tab">
						<i class="fa fa-plus"></i> ${__("Record Wastage")}
					</button>
				</div>
				<div class="ri-table-wrapper">
					<table class="ri-data-table">
						<thead>
							<tr>
								<th>${__("Wastage ID")}</th>
								<th>${__("Date")}</th>
								<th>${__("Item Name")}</th>
								<th>${__("Reason")}</th>
								<th>${__("Qty Lost")}</th>
								<th>${__("Cost Impact")}</th>
								<th>${__("Notes & Observations")}</th>
								<th>${__("Movement Ref")}</th>
							</tr>
						</thead>
						<tbody>
							${rowsHtml}
						</tbody>
					</table>
				</div>
			</div>
		`);

		$("#btn-record-waste-tab").on("click", () => me.showWastageDialog());
	}

	// =========================================================================
	// TAB 7: Reports & Analytics
	// =========================================================================
	render_reports_tab($container) {
		const me = this;

		$container.html(`
			<div class="ri-report-controls">
				<div class="ri-report-selects">
					<label class="font-weight-bold small text-muted m-0">${__("Report:")}</label>
					<select class="ri-select" id="ri-report-type-select">
						<option value="stock_balance">${__("Stock Balance & Valuation Report")}</option>
						<option value="low_stock">${__("Low Stock & Reorder Alert Report")}</option>
						<option value="movements">${__("Stock Movement Audit Ledger")}</option>
						<option value="purchases">${__("Purchase History & Goods Receipts")}</option>
						<option value="wastage">${__("Wastage & Spoilage Log")}</option>
						<option value="expiry">${__("Batch Shelf-Life & Expiry Report")}</option>
						<option value="usage">${__("Recipe Ingredient Consumption Usage")}</option>
					</select>

					<label class="font-weight-bold small text-muted m-0 ml-2">${__("From:")}</label>
					<input type="date" class="ri-select" id="ri-report-from-date">

					<label class="font-weight-bold small text-muted m-0">${__("To:")}</label>
					<input type="date" class="ri-select" id="ri-report-to-date">

					<button class="ri-btn ri-btn-primary" id="btn-run-report">
						<i class="fa fa-play"></i> ${__("Generate")}
					</button>
				</div>

				<div>
					<button class="ri-btn ri-btn-success" id="btn-export-report-csv">
						<i class="fa fa-download"></i> ${__("Export CSV")}
					</button>
				</div>
			</div>

			<div class="ri-table-card" id="ri-report-result-card">
				<div class="p-3 border-bottom d-flex justify-content-between align-items-center">
					<h5 class="m-0 font-weight-bold" id="ri-report-title">${__("Report")}</h5>
					<span class="text-muted small" id="ri-report-timestamp">Generated live from RestaurantStore</span>
				</div>
				<div class="ri-table-wrapper" id="ri-report-table-box">
					<div class="p-5 text-center text-muted">
						<i class="fa fa-bar-chart fa-2x mb-2 opacity-50"></i>
						<div>${__("Click Generate to view report")}</div>
					</div>
				</div>
			</div>
		`);

		$("#ri-report-type-select").val(me.active_report_type);

		$("#btn-run-report").on("click", function () {
			me.run_report();
		});

		$("#btn-export-report-csv").on("click", function () {
			me.export_report_csv();
		});

		// Auto run default report
		me.run_report();
	}

	run_report() {
		const me = this;
		const rType = $("#ri-report-type-select").val();
		const fromDate = $("#ri-report-from-date").val();
		const toDate = $("#ri-report-to-date").val();
		me.active_report_type = rType;

		frappe.call({
			method: "restaurant_management.restaurant_management.page.restaurant_inventory.restaurant_inventory.get_inventory_reports",
			args: {
				report_type: rType,
				from_date: fromDate || null,
				to_date: toDate || null,
				category: me.active_category !== "All" ? me.active_category : null,
				location: me.active_location !== "All" ? me.active_location : null,
			},
			callback: function (r) {
				if (r.message) {
					me.report_data = r.message;
					$("#ri-report-title").text(r.message.title || __("Inventory Report"));
					$("#ri-report-timestamp").text(`Generated at ${frappe.datetime.now_datetime()}`);
					me.render_report_table(r.message.rows || []);
				}
			},
		});
	}

	render_report_table(rows) {
		const $box = $("#ri-report-table-box");
		if (!rows || rows.length === 0) {
			$box.html(`
				<div class="ri-empty-state">
					<i class="fa fa-file-text-o"></i>
					<div>${__("No matching records found for the selected criteria.")}</div>
				</div>
			`);
			return;
		}

		const keys = Object.keys(rows[0]);
		const ths = keys.map((k) => `<th>${frappe.model.unscrub(k)}</th>`).join("");

		const trs = rows
			.map((row) => {
				const tds = keys
					.map((k) => {
						let val = row[k];
						if (val === null || val === undefined) val = "";
						if (typeof val === "number") {
							val = Number.isInteger(val) ? val : val.toFixed(2);
						}
						return `<td>${frappe.utils.escape_html(String(val))}</td>`;
					})
					.join("");
				return `<tr>${tds}</tr>`;
			})
			.join("");

		$box.html(`
			<table class="ri-data-table">
				<thead><tr>${ths}</tr></thead>
				<tbody>${trs}</tbody>
			</table>
		`);
	}

	export_report_csv() {
		if (!this.report_data || !this.report_data.rows || this.report_data.rows.length === 0) {
			frappe.msgprint(__("No report data available to export. Please generate a report first."));
			return;
		}

		const rows = this.report_data.rows;
		const headers = Object.keys(rows[0]);

		let csvContent = headers.map((h) => `"${frappe.model.unscrub(h)}"`).join(",") + "\n";

		rows.forEach((r) => {
			const line = headers
				.map((h) => {
					let v = r[h];
					if (v === null || v === undefined) v = "";
					v = String(v).replace(/"/g, '""');
					return `"${v}"`;
				})
				.join(",");
			csvContent += line + "\n";
		});

		const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.setAttribute("href", url);
		const filename = `${this.active_report_type}_report_${frappe.datetime.now_date()}.csv`;
		link.setAttribute("download", filename);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);

		frappe.show_alert({
			message: __("CSV report exported successfully!"),
			indicator: "green",
		});
	}

	// =========================================================================
	// DIALOGS & ACTIONS
	// =========================================================================
	getItemOptions() {
		if (!this.data || !this.data.items) return [];
		return this.data.items.map((i) => ({
			label: `${i.name} (${i.quantity} ${i.unit} in ${i.location})`,
			value: i.name,
		}));
	}

	showStockInDialog(defaultItem) {
		const me = this;
		const options = this.getItemOptions();

		const d = new frappe.ui.Dialog({
			title: __("Stock In — Replenish Inventory"),
			fields: [
				{
					fieldname: "item_name",
					label: __("Item"),
					fieldtype: "Select",
					options: options,
					default: defaultItem || (options[0] ? options[0].value : ""),
					reqd: 1,
				},
				{
					fieldname: "qty",
					label: __("Quantity to Add"),
					fieldtype: "Float",
					default: 5.0,
					reqd: 1,
				},
				{
					fieldname: "location",
					label: __("Storage Location"),
					fieldtype: "Select",
					options: ["Dry Storage", "Cold Storage", "Fresh Produce Storage"],
					default: "Dry Storage",
				},
				{
					fieldname: "reason",
					label: __("Reason / Notes"),
					fieldtype: "Data",
					default: "Routine replenishment",
				},
				{
					fieldname: "reference",
					label: __("Reference / Delivery Bill No"),
					fieldtype: "Data",
					default: "",
				},
			],
			primary_action_label: __("Confirm Stock In"),
			primary_action: function (values) {
				frappe.call({
					method: "restaurant_management.restaurant_management.page.restaurant_inventory.restaurant_inventory.perform_stock_in",
					args: values,
					callback: function (r) {
						if (!r.exc) {
							frappe.show_alert({
								message: __("Stock In recorded successfully!"),
								indicator: "green",
							});
							d.hide();
							me.refresh();
						}
					},
				});
			},
		});

		d.show();
	}

	showStockOutDialog(defaultItem) {
		const me = this;
		const options = this.getItemOptions();

		const d = new frappe.ui.Dialog({
			title: __("Stock Out — Issue to Kitchen"),
			fields: [
				{
					fieldname: "item_name",
					label: __("Item"),
					fieldtype: "Select",
					options: options,
					default: defaultItem || (options[0] ? options[0].value : ""),
					reqd: 1,
				},
				{
					fieldname: "qty",
					label: __("Quantity to Issue"),
					fieldtype: "Float",
					default: 2.0,
					reqd: 1,
				},
				{
					fieldname: "reason",
					label: __("Reason / Department"),
					fieldtype: "Data",
					default: "Issue to Main Kitchen",
					reqd: 1,
				},
				{
					fieldname: "reference",
					label: __("Reference / Requisition No"),
					fieldtype: "Data",
					default: "",
				},
			],
			primary_action_label: __("Confirm Stock Out"),
			primary_action: function (values) {
				frappe.call({
					method: "restaurant_management.restaurant_management.page.restaurant_inventory.restaurant_inventory.perform_stock_out",
					args: values,
					callback: function (r) {
						if (!r.exc) {
							frappe.show_alert({
								message: __("Stock Out recorded successfully!"),
								indicator: "green",
							});
							d.hide();
							me.refresh();
						}
					},
				});
			},
		});

		d.show();
	}

	showStockAdjustDialog(defaultItem) {
		const me = this;
		const options = this.getItemOptions();
		const currentItem = this.data.items.find((i) => i.name === defaultItem) || this.data.items[0];

		const d = new frappe.ui.Dialog({
			title: __("Stock Adjustment — Physical Audit"),
			fields: [
				{
					fieldname: "item_name",
					label: __("Item"),
					fieldtype: "Select",
					options: options,
					default: defaultItem || (currentItem ? currentItem.name : ""),
					reqd: 1,
				},
				{
					fieldname: "new_qty",
					label: __("New Physical Count"),
					fieldtype: "Float",
					default: currentItem ? currentItem.quantity : 0,
					reqd: 1,
					description: __("Enter the exact physically counted quantity."),
				},
				{
					fieldname: "reason",
					label: __("Reason for Adjustment"),
					fieldtype: "Data",
					default: "Physical inventory audit count",
					reqd: 1,
				},
				{
					fieldname: "reference",
					label: __("Audit Reference"),
					fieldtype: "Data",
					default: "AUDIT-2026",
				},
			],
			primary_action_label: __("Save Adjustment"),
			primary_action: function (values) {
				frappe.call({
					method: "restaurant_management.restaurant_management.page.restaurant_inventory.restaurant_inventory.perform_stock_adjustment",
					args: values,
					callback: function (r) {
						if (!r.exc) {
							frappe.show_alert({
								message: __("Stock adjustment saved!"),
								indicator: "green",
							});
							d.hide();
							me.refresh();
						}
					},
				});
			},
		});

		d.show();
	}

	showStockTransferDialog(defaultItem) {
		const me = this;
		const options = this.getItemOptions();
		const locs = ["Dry Storage", "Cold Storage", "Fresh Produce Storage"];

		const d = new frappe.ui.Dialog({
			title: __("Stock Transfer — Between Storage Locations"),
			fields: [
				{
					fieldname: "item_name",
					label: __("Item"),
					fieldtype: "Select",
					options: options,
					default: defaultItem || (options[0] ? options[0].value : ""),
					reqd: 1,
				},
				{
					fieldname: "qty",
					label: __("Quantity to Transfer"),
					fieldtype: "Float",
					default: 5.0,
					reqd: 1,
				},
				{
					fieldname: "from_location",
					label: __("Source Location"),
					fieldtype: "Select",
					options: locs,
					default: "Dry Storage",
					reqd: 1,
				},
				{
					fieldname: "to_location",
					label: __("Destination Location"),
					fieldtype: "Select",
					options: locs,
					default: "Cold Storage",
					reqd: 1,
				},
				{
					fieldname: "reason",
					label: __("Reason for Transfer"),
					fieldtype: "Data",
					default: "Kitchen daily prep relocation",
				},
			],
			primary_action_label: __("Transfer Stock"),
			primary_action: function (values) {
				frappe.call({
					method: "restaurant_management.restaurant_management.page.restaurant_inventory.restaurant_inventory.perform_stock_transfer",
					args: values,
					callback: function (r) {
						if (!r.exc) {
							frappe.show_alert({
								message: __("Stock transfer completed!"),
								indicator: "green",
							});
							d.hide();
							me.refresh();
						}
					},
				});
			},
		});

		d.show();
	}

	showPurchaseOrderDialog(defaultSupplierId) {
		const me = this;
		const sups = (this.data.suppliers || []).map((s) => ({
			label: `${s.name} (${(s.categories || []).join(", ")})`,
			value: s.supplier_id,
		}));

		const itemOptions = this.getItemOptions();

		const d = new frappe.ui.Dialog({
			title: __("Create Purchase Order"),
			fields: [
				{
					fieldname: "supplier_id",
					label: __("Supplier"),
					fieldtype: "Select",
					options: sups,
					default: defaultSupplierId || (sups[0] ? sups[0].value : ""),
					reqd: 1,
				},
				{
					fieldname: "invoice_ref",
					label: __("Supplier Invoice / Reference"),
					fieldtype: "Data",
					default: "",
				},
				{
					fieldname: "date",
					label: __("PO Date"),
					fieldtype: "Date",
					default: frappe.datetime.now_date(),
					reqd: 1,
				},
				{
					fieldname: "item_1",
					label: __("Item 1"),
					fieldtype: "Select",
					options: itemOptions,
					default: itemOptions[0] ? itemOptions[0].value : "",
					reqd: 1,
				},
				{
					fieldname: "qty_1",
					label: __("Quantity 1"),
					fieldtype: "Float",
					default: 10.0,
					reqd: 1,
				},
				{
					fieldname: "rate_1",
					label: __("Unit Rate 1 (₹)"),
					fieldtype: "Float",
					default: 0.0,
				},
				{
					fieldname: "auto_receive",
					label: __("Confirm Goods Receipt Immediately (Update Stock Now)"),
					fieldtype: "Check",
					default: 0,
				},
				{
					fieldname: "notes",
					label: __("Notes"),
					fieldtype: "Small Text",
					default: "Standard kitchen restock",
				},
			],
			primary_action_label: __("Save Purchase Order"),
			primary_action: function (values) {
				const items = [
					{
						item_name: values.item_1,
						qty: values.qty_1,
						rate: values.rate_1 || 0,
					},
				];

				frappe.call({
					method: "restaurant_management.restaurant_management.page.restaurant_inventory.restaurant_inventory.create_purchase_order",
					args: {
						supplier_id: values.supplier_id,
						items: JSON.stringify(items),
						invoice_ref: values.invoice_ref || "",
						date: values.date,
						notes: values.notes || "",
						auto_receive: values.auto_receive ? 1 : 0,
					},
					callback: function (r) {
						if (!r.exc) {
							frappe.show_alert({
								message: __("Purchase Order created successfully!"),
								indicator: "green",
							});
							d.hide();
							me.active_tab = "purchase_orders";
							me.refresh();
						}
					},
				});
			},
		});

		d.show();
	}

	confirmGoodsReceipt(poNumber) {
		const me = this;
		frappe.confirm(
			__("Are you sure you want to confirm goods receipt for {0}? Stock will be updated immediately.", [poNumber]),
			function () {
				frappe.call({
					method: "restaurant_management.restaurant_management.page.restaurant_inventory.restaurant_inventory.confirm_goods_receipt",
					args: { po_number: poNumber },
					callback: function (r) {
						if (!r.exc) {
							frappe.show_alert({
								message: __("Goods Receipt confirmed! Inventory has been updated."),
								indicator: "green",
							});
							me.refresh();
						}
					},
				});
			}
		);
	}

	showSupplierDialog() {
		const me = this;
		const categories = [
			"Grains & Rice",
			"Pulses & Dal",
			"Vegetables",
			"Fruits",
			"Dairy Products",
			"Meat & Poultry",
			"Spices & Masala",
			"Cooking Essentials",
			"Beverages",
			"Packaging Materials",
		];

		const d = new frappe.ui.Dialog({
			title: __("Register New Supplier"),
			fields: [
				{
					fieldname: "name",
					label: __("Supplier / Company Name"),
					fieldtype: "Data",
					reqd: 1,
				},
				{
					fieldname: "contact_person",
					label: __("Contact Person"),
					fieldtype: "Data",
				},
				{
					fieldname: "phone",
					label: __("Phone Number"),
					fieldtype: "Data",
				},
				{
					fieldname: "email",
					label: __("Email"),
					fieldtype: "Data",
				},
				{
					fieldname: "address",
					label: __("Address"),
					fieldtype: "Small Text",
				},
				{
					fieldname: "category",
					label: __("Main Category"),
					fieldtype: "Select",
					options: categories,
					default: "Vegetables",
				},
				{
					fieldname: "supplied_items_str",
					label: __("Supplied Items (Comma separated)"),
					fieldtype: "Data",
					placeholder: "e.g. Onions, Tomatoes, Potatoes",
				},
			],
			primary_action_label: __("Register Supplier"),
			primary_action: function (values) {
				const items = (values.supplied_items_str || "").split(",").map((s) => s.strip ? s.strip() : s.trim()).filter(Boolean);
				frappe.call({
					method: "restaurant_management.restaurant_management.page.restaurant_inventory.restaurant_inventory.create_supplier",
					args: {
						name: values.name,
						contact_person: values.contact_person || "",
						phone: values.phone || "",
						email: values.email || "",
						address: values.address || "",
						categories: JSON.stringify([values.category]),
						supplied_items: JSON.stringify(items),
					},
					callback: function (r) {
						if (!r.exc) {
							frappe.show_alert({
								message: __("Supplier registered successfully!"),
								indicator: "green",
							});
							d.hide();
							me.active_tab = "suppliers";
							me.refresh();
						}
					},
				});
			},
		});

		d.show();
	}

	showBatchDialog(defaultItem) {
		const me = this;
		const options = this.getItemOptions();

		const d = new frappe.ui.Dialog({
			title: __("Register New Inventory Batch"),
			fields: [
				{
					fieldname: "item_name",
					label: __("Item"),
					fieldtype: "Select",
					options: options,
					default: defaultItem || (options[0] ? options[0].value : ""),
					reqd: 1,
				},
				{
					fieldname: "batch_no",
					label: __("Batch Number"),
					fieldtype: "Data",
					default: `BAT-2026-${Math.floor(1000 + Math.random() * 9000)}`,
					reqd: 1,
				},
				{
					fieldname: "qty",
					label: __("Batch Quantity"),
					fieldtype: "Float",
					default: 10.0,
					reqd: 1,
				},
				{
					fieldname: "mfg_date",
					label: __("Manufacturing Date"),
					fieldtype: "Date",
					default: frappe.datetime.now_date(),
					reqd: 1,
				},
				{
					fieldname: "expiry_date",
					label: __("Expiry Date"),
					fieldtype: "Date",
					default: frappe.datetime.add_days(frappe.datetime.now_date(), 7),
					reqd: 1,
				},
				{
					fieldname: "location",
					label: __("Storage Location"),
					fieldtype: "Select",
					options: ["Dry Storage", "Cold Storage", "Fresh Produce Storage"],
					default: "Cold Storage",
				},
			],
			primary_action_label: __("Register Batch"),
			primary_action: function (values) {
				frappe.call({
					method: "restaurant_management.restaurant_management.page.restaurant_inventory.restaurant_inventory.add_batch_record",
					args: values,
					callback: function (r) {
						if (!r.exc) {
							frappe.show_alert({
								message: __("Batch registered successfully!"),
								indicator: "green",
							});
							d.hide();
							me.active_tab = "batches";
							me.refresh();
						}
					},
				});
			},
		});

		d.show();
	}

	showWastageDialog(defaultItem, defaultBatch) {
		const me = this;
		const options = this.getItemOptions();
		const reasons = ["Spoilage", "Expired goods", "Preparation waste", "Damaged goods", "Other"];

		const d = new frappe.ui.Dialog({
			title: __("Record Stock Wastage & Spoilage"),
			fields: [
				{
					fieldname: "item_name",
					label: __("Item"),
					fieldtype: "Select",
					options: options,
					default: defaultItem || (options[0] ? options[0].value : ""),
					reqd: 1,
				},
				{
					fieldname: "qty",
					label: __("Wastage Quantity"),
					fieldtype: "Float",
					default: 1.0,
					reqd: 1,
				},
				{
					fieldname: "reason",
					label: __("Wastage Reason"),
					fieldtype: "Select",
					options: reasons,
					default: "Spoilage",
					reqd: 1,
				},
				{
					fieldname: "date",
					label: __("Date"),
					fieldtype: "Date",
					default: frappe.datetime.now_date(),
					reqd: 1,
				},
				{
					fieldname: "batch_no",
					label: __("Batch Reference (Optional)"),
					fieldtype: "Data",
					default: defaultBatch || "",
				},
				{
					fieldname: "notes",
					label: __("Notes / Explanation"),
					fieldtype: "Small Text",
					placeholder: "e.g. Curdled milk packet found during morning prep",
				},
			],
			primary_action_label: __("Confirm Wastage"),
			primary_action: function (values) {
				frappe.call({
					method: "restaurant_management.restaurant_management.page.restaurant_inventory.restaurant_inventory.record_wastage",
					args: values,
					callback: function (r) {
						if (!r.exc) {
							frappe.show_alert({
								message: __("Wastage recorded and stock deducted!"),
								indicator: "orange",
							});
							d.hide();
							me.active_tab = "wastage";
							me.refresh();
						}
					},
				});
			},
		});

		d.show();
	}
}
