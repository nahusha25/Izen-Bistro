// Copyright (c) 2026, Nahusha and contributors
// For license information, please see license.txt

frappe.pages['restaurant-reports'].on_page_load = function (wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __('Reports & Analytics — Izen Bistro'),
		single_column: true
	});

	frappe.breadcrumbs.add('Restaurant Management');

	page.add_button(__('Refresh'), function () {
		if (wrapper.reports_page) {
			wrapper.reports_page.fetch_data();
		}
	}, 'fa fa-refresh');

	page.add_button(__('Export CSV'), function () {
		if (wrapper.reports_page) {
			wrapper.reports_page.export_csv();
		}
	}, 'fa fa-download');

	page.add_button(__('Print Report'), function () {
		if (wrapper.reports_page) {
			wrapper.reports_page.print_report();
		}
	}, 'fa fa-print');

	wrapper.reports_page = new RestaurantReportsPage(wrapper, page);
};

frappe.pages['restaurant-reports'].on_page_show = function (wrapper) {
	if (wrapper.reports_page) {
		wrapper.reports_page.fetch_data();
	}
};

class RestaurantReportsPage {
	constructor(wrapper, page) {
		this.wrapper = wrapper;
		this.page = page;
		this.active_period = 'today';
		this.from_date = null;
		this.to_date = null;
		this.data = null;

		this.init();
	}

	init() {
		this.render_skeleton();
		this.bind_events();
		this.fetch_data();
	}

	render_skeleton() {
		this.page.main.empty();
		const todayFormatted = frappe.datetime.str_to_user(frappe.datetime.get_today());

		this.container = $(`
			<div class="restaurant-reports-wrapper">
				<!-- Brand Header -->
				<header class="rr-brand-header">
					<div class="rr-brand-left">
						<div class="rr-brand-logo-frame" title="Izen Bistro">
							<span class="rr-monogram">IB</span>
						</div>
						<div class="rr-brand-meta">
							<div class="rr-brand-title-row">
								<h1 class="rr-brand-name" id="rr-brand-name">IZEN BISTRO</h1>
								<span class="rr-badge-pill">
									<i class="fa fa-line-chart"></i> ${__("Reports & Analytics")}
								</span>
							</div>
							<p class="rr-brand-subtitle">${__("Comprehensive Sales, GST Reconciliation, Menu Movement & Operational Audits")}</p>
							<div class="rr-brand-location">
								<i class="fa fa-map-marker text-danger"></i>
								<span id="rr-brand-location">${__("Nagarbhavi, Bengaluru, Karnataka")}</span>
							</div>
						</div>
					</div>

					<div class="rr-brand-right">
						<div class="rr-header-chips">
							<div class="rr-info-chip" title="${__('Report Period')}">
								<i class="fa fa-calendar text-muted"></i>
								<span id="rr-active-period-label">${__("Today")}</span>
							</div>
							<div class="rr-info-chip" title="${__('Last Updated')}">
								<i class="fa fa-clock-o text-muted"></i>
								<span>${__("Updated")} <strong class="rr-last-updated" id="rr-last-updated">${frappe.datetime.now_time()}</strong></span>
							</div>
							<button type="button" class="btn-rr-action btn-rr-primary" id="btn-export-csv" title="${__('Download Filtered CSV Report')}">
								<i class="fa fa-download"></i> ${__("Export CSV")}
							</button>
							<button type="button" class="btn-rr-action" id="btn-print-report" title="${__('Print or Save as PDF')}">
								<i class="fa fa-print"></i> ${__("Print / PDF")}
							</button>
							<button type="button" class="btn-rr-action" id="btn-rr-refresh" title="${__('Refresh Live Data')}">
								<i class="fa fa-refresh"></i>
							</button>
						</div>
					</div>
				</header>

				<!-- Filter Toolbar Bar -->
				<div class="rr-filter-toolbar">
					<div class="rr-filter-group-left">
						<span class="rr-filter-label"><i class="fa fa-filter"></i> ${__("Period:")}</span>
						<button type="button" class="rr-period-btn active" data-period="today">${__("Today")}</button>
						<button type="button" class="rr-period-btn" data-period="yesterday">${__("Yesterday")}</button>
						<button type="button" class="rr-period-btn" data-period="7_days">${__("Last 7 Days")}</button>
						<button type="button" class="rr-period-btn" data-period="30_days">${__("Last 30 Days")}</button>
						<button type="button" class="rr-period-btn" data-period="this_month">${__("This Month")}</button>
						<button type="button" class="rr-period-btn" data-period="custom">${__("Custom")}</button>

						<div class="rr-custom-inputs-row" id="rr-custom-inputs">
							<input type="date" class="rr-date-input" id="rr-custom-from" value="${frappe.datetime.get_today()}">
							<span class="text-muted" style="font-size: 0.8rem;">to</span>
							<input type="date" class="rr-date-input" id="rr-custom-to" value="${frappe.datetime.get_today()}">
							<button type="button" class="btn-rr-action btn-rr-primary" id="btn-apply-custom" style="padding: 0.35rem 0.75rem;">
								${__("Apply")}
							</button>
						</div>
					</div>

					<div class="rr-filter-group-right">
						<span class="rr-period-display-badge">
							<i class="fa fa-check-circle text-success"></i>
							<span id="rr-period-summary-text">${__("Live Shared Store Data")}</span>
						</span>
					</div>
				</div>

				<!-- Section 2: Summary KPI Cards (6 Cards Grid) -->
				<section class="rr-section-block">
					<div class="rr-kpi-grid">
						<!-- 1. Total Revenue -->
						<div class="rr-kpi-card kpi-revenue" title="${__('Successfully recorded payments only')}">
							<div class="rr-kpi-header">
								<span class="rr-kpi-title">${__("Total Revenue")}</span>
								<div class="rr-kpi-icon"><i class="fa fa-inr"></i></div>
							</div>
							<div class="rr-kpi-value" id="kpi-total-revenue">₹0</div>
							<div class="rr-kpi-footer">
								<span class="rr-kpi-badge badge-positive">${__("Successful payments")}</span>
								<span>${__("reconciled")}</span>
							</div>
						</div>

						<!-- 2. Total Orders -->
						<div class="rr-kpi-card kpi-orders" title="${__('Dining room order tickets in period')}">
							<div class="rr-kpi-header">
								<span class="rr-kpi-title">${__("Total Orders")}</span>
								<div class="rr-kpi-icon"><i class="fa fa-cutlery"></i></div>
							</div>
							<div class="rr-kpi-value" id="kpi-total-orders">0</div>
							<div class="rr-kpi-footer">
								<span class="rr-kpi-badge badge-neutral" id="kpi-gross-orders-badge">0 gross</span>
								<span>${__("tickets")}</span>
							</div>
						</div>

						<!-- 3. Average Order Value -->
						<div class="rr-kpi-card kpi-aov" title="${__('Revenue divided by settled bills')}">
							<div class="rr-kpi-header">
								<span class="rr-kpi-title">${__("Average Order Value")}</span>
								<div class="rr-kpi-icon"><i class="fa fa-line-chart"></i></div>
							</div>
							<div class="rr-kpi-value" id="kpi-aov">₹0</div>
							<div class="rr-kpi-footer">
								<span class="rr-kpi-badge badge-neutral">${__("Per paid bill")}</span>
								<span>${__("AOV metric")}</span>
							</div>
						</div>

						<!-- 4. Paid Bills -->
						<div class="rr-kpi-card kpi-paid-bills" title="${__('Total successfully settled customer bills')}">
							<div class="rr-kpi-header">
								<span class="rr-kpi-title">${__("Paid Bills")}</span>
								<div class="rr-kpi-icon"><i class="fa fa-check-square-o"></i></div>
							</div>
							<div class="rr-kpi-value" id="kpi-paid-bills">0</div>
							<div class="rr-kpi-footer">
								<span class="rr-kpi-badge badge-positive">${__("Settled")}</span>
								<span>${__("closed accounts")}</span>
							</div>
						</div>

						<!-- 5. Pending Payments -->
						<div class="rr-kpi-card kpi-pending" title="${__('Unpaid dining room bills')}">
							<div class="rr-kpi-header">
								<span class="rr-kpi-title">${__("Pending Payments")}</span>
								<div class="rr-kpi-icon"><i class="fa fa-clock-o"></i></div>
							</div>
							<div class="rr-kpi-value" id="kpi-pending-count">0</div>
							<div class="rr-kpi-footer">
								<span class="rr-kpi-badge badge-warning" id="kpi-pending-amt">₹0</span>
								<span>${__("unsettled")}</span>
							</div>
						</div>

						<!-- 6. Cancelled Orders -->
						<div class="rr-kpi-card kpi-cancelled" title="${__('Orders cancelled with inventory reversed')}">
							<div class="rr-kpi-header">
								<span class="rr-kpi-title">${__("Cancelled Orders")}</span>
								<div class="rr-kpi-icon"><i class="fa fa-times-circle-o"></i></div>
							</div>
							<div class="rr-kpi-value" id="kpi-cancelled-count">0</div>
							<div class="rr-kpi-footer">
								<span class="rr-kpi-badge badge-danger">${__("Excluded")}</span>
								<span>${__("from revenue")}</span>
							</div>
						</div>
					</div>
				</section>

				<!-- Section 3: Sales Analytics & Revenue Trend -->
				<section class="rr-section-block">
					<div class="rr-section-header">
						<span class="rr-section-title"><i class="fa fa-area-chart text-primary"></i> ${__("Sales & Revenue Trend")}</span>
						<span class="rr-section-hint">${__("Live day-by-day revenue, order volume, and payment reconciliations")}</span>
					</div>

					<div class="rr-two-col-grid">
						<!-- Revenue Trend Bar Chart Card -->
						<div class="rr-card">
							<div class="rr-card-header">
								<div>
									<h3 class="rr-card-title"><i class="fa fa-bar-chart text-primary"></i> ${__("Daily Revenue & Order Volume")}</h3>
									<p class="rr-card-subtitle">${__("Period breakdown derived from verified billing settlements")}</p>
								</div>
								<span class="rr-card-badge" id="rr-trend-period-badge">${__("Period Trend")}</span>
							</div>
							<div class="rr-card-body">
								<div class="rr-chart-container" id="rr-chart-container">
									<div class="text-center text-muted" style="padding: 2.5rem;">${__("Loading sales trend...")}</div>
								</div>
							</div>
						</div>

						<!-- Payment Method Breakdown & 5% GST Audit -->
						<div class="rr-card">
							<div class="rr-card-header">
								<div>
									<h3 class="rr-card-title"><i class="fa fa-calculator text-success"></i> ${__("Payment Modes & 5% GST Tax Audit")}</h3>
									<p class="rr-card-subtitle">${__("2.5% CGST + 2.5% SGST audit matching centralized Billing")}</p>
								</div>
								<span class="rr-card-badge">${__("5% Statutory GST")}</span>
							</div>
							<div class="rr-card-body">
								<!-- Payment Methods Breakdown -->
								<div style="margin-bottom: 1.25rem;">
									<div style="font-size: 0.82rem; font-weight: 700; text-transform: uppercase; color: var(--rr-text-muted); margin-bottom: 0.65rem;">
										${__("Payment Method Settlement")}
									</div>
									<div id="rr-payment-methods-list">
										<div class="text-muted text-center" style="padding: 1rem;">${__("Loading payment modes...")}</div>
									</div>
								</div>

								<!-- 5% GST Box -->
								<div class="rr-gst-box">
									<div class="rr-gst-row">
										<span class="rr-gst-label"><i class="fa fa-tag text-muted"></i> ${__("Taxable Subtotal (Base Sales)")}</span>
										<span class="rr-gst-val" id="gst-subtotal">₹0.00</span>
									</div>
									<div class="rr-gst-row">
										<span class="rr-gst-label"><i class="fa fa-percent text-muted"></i> ${__("CGST (2.5%)")}</span>
										<span class="rr-gst-val" id="gst-cgst">₹0.00</span>
									</div>
									<div class="rr-gst-row">
										<span class="rr-gst-label"><i class="fa fa-percent text-muted"></i> ${__("SGST (2.5%)")}</span>
										<span class="rr-gst-val" id="gst-sgst">₹0.00</span>
									</div>
									<div class="rr-gst-row">
										<span class="rr-gst-label"><i class="fa fa-shield text-primary"></i> ${__("Total GST Collected (5.0%)")}</span>
										<span class="rr-gst-val" style="color: var(--rr-primary);" id="gst-total-tax">₹0.00</span>
									</div>
									<div class="rr-gst-row">
										<span class="rr-gst-label"><i class="fa fa-check-circle text-success"></i> ${__("Gross Reconciled Revenue")}</span>
										<span class="rr-gst-val" style="color: var(--rr-success);" id="gst-gross-total">₹0.00</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				</section>

				<!-- Section 4: Order Reports & Dining Areas -->
				<section class="rr-section-block">
					<div class="rr-section-header">
						<span class="rr-section-title"><i class="fa fa-th-list text-primary"></i> ${__("Order Lifecycle & Dining Room Breakdown")}</span>
						<span class="rr-section-hint">${__("Status pipeline, dining areas, and live table usage")}</span>
					</div>

					<div class="rr-two-col-grid">
						<!-- Order Status Distribution -->
						<div class="rr-card">
							<div class="rr-card-header">
								<div>
									<h3 class="rr-card-title"><i class="fa fa-tasks text-primary"></i> ${__("Order Status Distribution")}</h3>
									<p class="rr-card-subtitle">${__("Pipeline status of all customer orders in period")}</p>
								</div>
								<span class="rr-card-badge" id="rr-orders-count-badge">0 orders</span>
							</div>
							<div class="rr-card-body">
								<div id="rr-order-status-list">
									<div class="text-center text-muted" style="padding: 1.5rem;">${__("Loading status breakdown...")}</div>
								</div>
							</div>
						</div>

						<!-- Dining Area Breakdown -->
						<div class="rr-card">
							<div class="rr-card-header">
								<div>
									<h3 class="rr-card-title"><i class="fa fa-building-o text-warning"></i> ${__("Dine-In Area Breakdown")}</h3>
									<p class="rr-card-subtitle">${__("Seating distribution across 3 restaurant dining zones")}</p>
								</div>
								<span class="rr-card-badge">${__("20 Total Tables")}</span>
							</div>
							<div class="rr-card-body" style="padding: 0;">
								<div class="rr-table-responsive">
									<table class="rr-table">
										<thead>
											<tr>
												<th>${__("Area")}</th>
												<th>${__("Capacity")}</th>
												<th>${__("Active / Total")}</th>
												<th>${__("Occupancy")}</th>
												<th>${__("Orders")}</th>
												<th>${__("Revenue")}</th>
											</tr>
										</thead>
										<tbody id="rr-area-breakdown-tbody">
											<tr><td colspan="6" class="text-center text-muted" style="padding: 1.5rem;">${__("Loading area breakdown...")}</td></tr>
										</tbody>
									</table>
								</div>
							</div>
						</div>
					</div>
				</section>

				<!-- Section 5: Menu Performance Reports -->
				<section class="rr-section-block">
					<div class="rr-section-header">
						<span class="rr-section-title"><i class="fa fa-cutlery text-primary"></i> ${__("Menu Performance & Item Sales")}</span>
						<span class="rr-section-hint">${__("Best-sellers, low movement dishes, and category volume")}</span>
					</div>

					<div class="rr-two-col-grid">
						<!-- Best-Selling Dishes -->
						<div class="rr-card">
							<div class="rr-card-header">
								<div>
									<h3 class="rr-card-title"><i class="fa fa-star text-warning"></i> ${__("Best-Selling Dishes")}</h3>
									<p class="rr-card-subtitle">${__("Highest volume items ordered by dining guests")}</p>
								</div>
								<span class="rr-card-badge">${__("Top Movement")}</span>
							</div>
							<div class="rr-card-body" style="padding: 0;">
								<div class="rr-table-responsive">
									<table class="rr-table">
										<thead>
											<tr>
												<th>#</th>
												<th>${__("Dish Name")}</th>
												<th>${__("Category")}</th>
												<th>${__("Price")}</th>
												<th>${__("Qty Sold")}</th>
												<th>${__("Gross Revenue")}</th>
												<th>${__("Paid Revenue")}</th>
											</tr>
										</thead>
										<tbody id="rr-bestsellers-tbody">
											<tr><td colspan="7" class="text-center text-muted" style="padding: 1.5rem;">${__("Loading best sellers...")}</td></tr>
										</tbody>
									</table>
								</div>
							</div>
						</div>

						<!-- Category Sales Breakdown -->
						<div class="rr-card">
							<div class="rr-card-header">
								<div>
									<h3 class="rr-card-title"><i class="fa fa-pie-chart text-info"></i> ${__("Category-Wise Sales")}</h3>
									<p class="rr-card-subtitle">${__("Revenue share across cuisine categories")}</p>
								</div>
								<span class="rr-card-badge">${__("Category Analysis")}</span>
							</div>
							<div class="rr-card-body" style="padding: 0;">
								<div class="rr-table-responsive">
									<table class="rr-table">
										<thead>
											<tr>
												<th>${__("Category")}</th>
												<th>${__("Dishes")}</th>
												<th>${__("Qty Sold")}</th>
												<th>${__("Gross Sales")}</th>
												<th>${__("Paid Revenue")}</th>
												<th>${__("Share %")}</th>
											</tr>
										</thead>
										<tbody id="rr-category-sales-tbody">
											<tr><td colspan="6" class="text-center text-muted" style="padding: 1.5rem;">${__("Loading category sales...")}</td></tr>
										</tbody>
									</table>
								</div>
							</div>
						</div>
					</div>

					<!-- Least-Selling Dishes Card -->
					<div class="rr-card" style="margin-top: 1.25rem;">
						<div class="rr-card-header">
							<div>
								<h3 class="rr-card-title"><i class="fa fa-arrow-down text-danger"></i> ${__("Least-Selling Dishes (Low Movement Stock)")}</h3>
								<p class="rr-card-subtitle">${__("Menu dishes with zero or low demand to help kitchen inventory planning")}</p>
							</div>
							<span class="rr-card-badge">${__("Stock Optimization")}</span>
						</div>
						<div class="rr-card-body" style="padding: 0;">
							<div class="rr-table-responsive">
								<table class="rr-table">
									<thead>
										<tr>
											<th>${__("Dish ID")}</th>
											<th>${__("Dish Name")}</th>
											<th>${__("Category")}</th>
											<th>${__("Price")}</th>
											<th>${__("Qty Sold")}</th>
											<th>${__("Gross Sales")}</th>
											<th>${__("Status")}</th>
										</tr>
									</thead>
									<tbody id="rr-leastsellers-tbody">
										<tr><td colspan="7" class="text-center text-muted" style="padding: 1.5rem;">${__("Loading low movement dishes...")}</td></tr>
									</tbody>
								</table>
							</div>
						</div>
					</div>
				</section>

				<!-- Section 6: Customer Intelligence & Spending -->
				<section class="rr-section-block">
					<div class="rr-section-header">
						<span class="rr-section-title"><i class="fa fa-users text-primary"></i> ${__("Customer Analytics & Loyalty")}</span>
						<span class="rr-section-hint">${__("Repeat visits, new registrations, and guest order history (privacy protected)")}</span>
					</div>

					<div class="rr-card">
						<div class="rr-card-header">
							<div style="display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap;">
								<div>
									<h3 class="rr-card-title"><i class="fa fa-heart text-danger"></i> ${__("Frequent & Loyal Diners")}</h3>
									<p class="rr-card-subtitle">${__("Customer history, total visits, and period spending based on actual records")}</p>
								</div>
								<div style="display: flex; gap: 0.75rem;">
									<div class="rr-info-chip">
										<span>${__("Total Registered:")} <strong id="cust-stat-total">0</strong></span>
									</div>
									<div class="rr-info-chip">
										<span>${__("Repeat Diners:")} <strong id="cust-stat-repeat" style="color: var(--rr-primary);">0</strong> (<span id="cust-stat-repeat-pct">0%</span>)</span>
									</div>
									<div class="rr-info-chip">
										<span>${__("New in Period:")} <strong id="cust-stat-new" style="color: var(--rr-success);">0</strong></span>
									</div>
								</div>
							</div>
							<a href="/desk/restaurant-customers" class="rr-card-badge" style="text-decoration: none;">
								${__("Open Registry")} <i class="fa fa-arrow-right"></i>
							</a>
						</div>
						<div class="rr-card-body" style="padding: 0;">
							<div class="rr-table-responsive">
								<table class="rr-table">
									<thead>
										<tr>
											<th>${__("Customer ID")}</th>
											<th>${__("Customer Name")}</th>
											<th>${__("Contact (Masked)")}</th>
											<th>${__("Total Visits")}</th>
											<th>${__("Orders in Period")}</th>
											<th>${__("Period Spent")}</th>
											<th>${__("Last Visit")}</th>
										</tr>
									</thead>
									<tbody id="rr-customers-tbody">
										<tr><td colspan="7" class="text-center text-muted" style="padding: 1.5rem;">${__("Loading customer loyalty records...")}</td></tr>
									</tbody>
								</table>
							</div>
						</div>
					</div>
				</section>

				<!-- Section 7 & 9: Detailed Settlement & Audit Log -->
				<section class="rr-section-block">
					<div class="rr-section-header">
						<span class="rr-section-title"><i class="fa fa-list-alt text-primary"></i> ${__("Detailed Settlement & Invoicing Audit Ledger")}</span>
						<span class="rr-section-hint">${__("Every settled and pending dining bill with audit timestamps and transaction references")}</span>
					</div>

					<div class="rr-card">
						<div class="rr-card-header">
							<div>
								<h3 class="rr-card-title"><i class="fa fa-file-text-o text-primary"></i> ${__("Settlement Ledger")}</h3>
								<p class="rr-card-subtitle">${__("Direct audit log for reconciled cashier reports and accountant statements")}</p>
							</div>
							<span class="rr-card-badge" id="rr-settlements-count-badge">0 bills</span>
						</div>
						<div class="rr-card-body" style="padding: 0;">
							<div class="rr-table-responsive">
								<table class="rr-table">
									<thead>
										<tr>
											<th>${__("Bill No")}</th>
											<th>${__("Order ID")}</th>
											<th>${__("Table")}</th>
											<th>${__("Customer")}</th>
											<th>${__("Mode")}</th>
											<th>${__("Reference")}</th>
											<th>${__("Subtotal")}</th>
											<th>${__("Tax (5%)")}</th>
											<th>${__("Total Settled")}</th>
											<th>${__("Status")}</th>
											<th>${__("Time / Date")}</th>
										</tr>
									</thead>
									<tbody id="rr-settlements-tbody">
										<tr><td colspan="11" class="text-center text-muted" style="padding: 2rem;">${__("Loading settlement ledger...")}</td></tr>
									</tbody>
								</table>
							</div>
						</div>
					</div>
				</section>
			</div>
		`).appendTo(this.page.main);
	}

	bind_events() {
		let me = this;

		// Period Filter buttons
		this.container.on('click', '.rr-period-btn', function () {
			let $btn = $(this);
			let period = $btn.data('period');

			me.container.find('.rr-period-btn').removeClass('active');
			$btn.addClass('active');

			if (period === 'custom') {
				me.container.find('#rr-custom-inputs').addClass('show');
			} else {
				me.container.find('#rr-custom-inputs').removeClass('show');
				me.active_period = period;
				me.from_date = null;
				me.to_date = null;
				me.fetch_data();
			}
		});

		// Custom date Apply button
		this.container.on('click', '#btn-apply-custom', function () {
			let fromD = me.container.find('#rr-custom-from').val();
			let toD = me.container.find('#rr-custom-to').val();
			if (!fromD || !toD) {
				frappe.msgprint(__('Please choose both from and to dates.'));
				return;
			}
			me.active_period = 'custom';
			me.from_date = fromD;
			me.to_date = toD;
			me.fetch_data();
		});

		// Refresh button
		this.container.on('click', '#btn-rr-refresh', function () {
			let $btn = $(this);
			$btn.prop('disabled', true).find('i').addClass('fa-spin');
			me.fetch_data(() => {
				$btn.prop('disabled', false).find('i').removeClass('fa-spin');
			});
		});

		// Export CSV
		this.container.on('click', '#btn-export-csv', function () {
			me.export_csv();
		});

		// Print Report
		this.container.on('click', '#btn-print-report', function () {
			me.print_report();
		});
	}

	fetch_data(callback) {
		let me = this;
		frappe.call({
			method: 'restaurant_management.restaurant_management.page.restaurant_reports.restaurant_reports.get_reports_data',
			args: {
				period: me.active_period,
				from_date: me.from_date,
				to_date: me.to_date
			},
			callback: function (r) {
				if (r.message) {
					me.data = r.message;
					me.render_reports();
				}
				if (callback) callback();
			}
		});
	}

	render_reports() {
		if (!this.data) return;
		const d = this.data;

		// 1. Header & Period Info
		this.container.find('#rr-brand-name').text(d.restaurant_info.name || 'IZEN BISTRO');
		const loc = d.restaurant_info.address_lines ? d.restaurant_info.address_lines.slice(1).join(', ') : 'Nagarbhavi, Bengaluru, Karnataka';
		this.container.find('#rr-brand-location').text(loc);
		this.container.find('#rr-active-period-label').text(d.period_label || 'Today');
		this.container.find('#rr-last-updated').text(frappe.datetime.now_time());
		this.container.find('#rr-period-summary-text').text(`${d.period_label} (${d.start_date} to ${d.end_date})`);
		this.container.find('#rr-trend-period-badge').text(d.period_label);

		// 2. Summary KPIs
		const s = d.summary;
		this.container.find('#kpi-total-revenue').text(s.formatted_revenue);
		this.container.find('#kpi-total-orders').text(s.total_orders);
		this.container.find('#kpi-gross-orders-badge').text(`${s.total_orders} total`);
		this.container.find('#kpi-aov').text(s.formatted_aov);
		this.container.find('#kpi-paid-bills').text(s.paid_bills);
		this.container.find('#kpi-pending-count').text(s.pending_payments_count);
		this.container.find('#kpi-pending-amt').text(s.formatted_pending);
		this.container.find('#kpi-cancelled-count').text(s.cancelled_orders);

		// 3. Sales Trend Bar Chart
		this.render_trend_chart(d.sales.daily_sales);

		// 4. Payment Methods List
		this.render_payment_methods(d.sales.payment_methods, s.total_revenue);

		// 5. 5% GST Box
		const gst = d.sales.gst_breakdown;
		this.container.find('#gst-subtotal').text(gst.formatted_subtotal);
		this.container.find('#gst-cgst').text(gst.formatted_cgst);
		this.container.find('#gst-sgst').text(gst.formatted_sgst);
		this.container.find('#gst-total-tax').text(gst.formatted_gst);
		this.container.find('#gst-gross-total').text(gst.formatted_gross_settled);

		// 6. Order Status Distribution
		this.render_order_statuses(d.orders.status_breakdown, d.orders.total_orders);
		this.container.find('#rr-orders-count-badge').text(`${d.orders.total_orders} ${__("orders")}`);

		// 7. Area Breakdown Table
		this.render_area_breakdown(d.orders.area_breakdown);

		// 8. Menu Performance Tables
		this.render_menu_performance(d.menu);

		// 9. Customer Loyalty
		const cust = d.customers;
		this.container.find('#cust-stat-total').text(cust.total_registered);
		this.container.find('#cust-stat-repeat').text(cust.repeat_customers);
		this.container.find('#cust-stat-repeat-pct').text(cust.repeat_pct);
		this.container.find('#cust-stat-new').text(cust.new_customers_in_period);
		this.render_customers_table(cust.top_customers);

		// 10. Settlements Audit Ledger Table
		this.render_settlements_table(d.settlements);
		this.container.find('#rr-settlements-count-badge').text(`${d.settlements.length} ${__("bills")}`);
	}

	render_trend_chart(dailySales) {
		const $chartContainer = this.container.find('#rr-chart-container').empty();
		if (!dailySales || dailySales.length === 0) {
			$chartContainer.html(`<div class="text-center text-muted" style="padding: 2.5rem;">${__("No sales recorded for this date range.")}</div>`);
			return;
		}

		// Find maximum revenue to scale bars
		let maxRevenue = 1000;
		dailySales.forEach(d => {
			if (d.total_revenue > maxRevenue) maxRevenue = d.total_revenue;
		});

		let barsHtml = dailySales.map(d => {
			const heightPct = Math.max(8, Math.round((d.total_revenue / maxRevenue) * 100));
			const isToday = d.date === frappe.datetime.get_today();
			return `
				<div class="rr-chart-bar-group" title="${d.date_label} (${d.day_name}): ${d.formatted_revenue} | ${d.orders_count} orders">
					<div class="rr-bar-tooltip">
						<div><strong>${d.formatted_revenue}</strong></div>
						<div style="font-size: 0.68rem; opacity: 0.85;">${d.orders_count} orders, ${d.paid_orders_count} paid</div>
						<div style="font-size: 0.68rem; opacity: 0.85;">CGST: ₹${d.cgst} | SGST: ₹${d.sgst}</div>
					</div>
					<div class="rr-chart-bar ${isToday ? 'bar-today' : ''}" style="height: ${heightPct}%;"></div>
					<div class="rr-bar-x-label">${d.date_label}</div>
				</div>
			`;
		}).join('');

		$chartContainer.html(`
			<div class="rr-bar-chart">
				${barsHtml}
			</div>
			<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.75rem; font-size: 0.76rem; color: var(--rr-text-muted);">
				<span><i class="fa fa-info-circle"></i> ${__("Hover over bars for daily tax & settlement breakdown")}</span>
				<span>${__("Max daily revenue:")} <strong>₹${maxRevenue.toLocaleString()}</strong></span>
			</div>
		`);
	}

	render_payment_methods(methods, totalRevenue) {
		const $list = this.container.find('#rr-payment-methods-list').empty();
		if (!methods || methods.length === 0) {
			$list.html(`<div class="text-muted text-center" style="padding: 1rem;">${__("No payments recorded.")}</div>`);
			return;
		}

		let html = methods.map(m => `
			<div style="margin-bottom: 0.85rem;">
				<div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
					<div>
						<strong style="color: var(--rr-text-dark);">${m.method}</strong>
						<span style="color: var(--rr-text-muted); font-size: 0.76rem; margin-left: 0.4rem;">(${m.count} ${__("txns")})</span>
					</div>
					<div>
						<strong style="color: var(--rr-text-dark);">${m.formatted_amount}</strong>
						<span class="rr-kpi-badge badge-neutral" style="margin-left: 0.35rem;">${m.share_pct}</span>
					</div>
				</div>
				<div class="rr-progress-bar-wrap">
					<div class="rr-progress-fill" style="width: ${m.share_num}%;"></div>
				</div>
			</div>
		`).join('');

		$list.html(html);
	}

	render_order_statuses(statuses, totalOrders) {
		const $list = this.container.find('#rr-order-status-list').empty();
		if (!statuses || statuses.length === 0) {
			$list.html(`<div class="text-center text-muted" style="padding: 1.5rem;">${__("No orders in this period.")}</div>`);
			return;
		}

		let html = statuses.map(st => `
			<div style="margin-bottom: 0.75rem;">
				<div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
					<div style="display: flex; align-items: center; gap: 0.5rem;">
						<span class="rr-status-badge ${st.badge_class}">${st.status}</span>
					</div>
					<div>
						<strong style="color: var(--rr-text-dark);">${st.count}</strong>
						<span style="font-size: 0.76rem; color: var(--rr-text-muted); margin-left: 0.35rem;">(${st.percentage})</span>
					</div>
				</div>
				<div class="rr-progress-bar-wrap">
					<div class="rr-progress-fill" style="width: ${st.percentage_num}%;"></div>
				</div>
			</div>
		`).join('');

		$list.html(html);
	}

	render_area_breakdown(areas) {
		const $tbody = this.container.find('#rr-area-breakdown-tbody').empty();
		if (!areas || areas.length === 0) {
			$tbody.html(`<tr><td colspan="6" class="text-center text-muted" style="padding: 1.5rem;">${__("No area records found.")}</td></tr>`);
			return;
		}

		let html = areas.map(ar => `
			<tr>
				<td><strong>${ar.area}</strong></td>
				<td>${ar.total_tables} ${__("tables")}</td>
				<td>${ar.occupied_tables} / ${ar.total_tables}</td>
				<td><span class="rr-status-badge badge-neutral">${ar.occupancy_pct}</span></td>
				<td>${ar.orders_count} ${__("orders")}</td>
				<td><strong style="color: var(--rr-success);">${ar.formatted_paid}</strong></td>
			</tr>
		`).join('');

		$tbody.html(html);
	}

	render_menu_performance(menu) {
		// 1. Best-Selling Dishes
		const $bestTbody = this.container.find('#rr-bestsellers-tbody').empty();
		if (!menu.best_selling || menu.best_selling.length === 0) {
			$bestTbody.html(`<tr><td colspan="7" class="text-center text-muted" style="padding: 1.5rem;">${__("No dish sales in this period.")}</td></tr>`);
		} else {
			let bestHtml = menu.best_selling.map((d, idx) => `
				<tr>
					<td><span class="badge badge-light" style="font-weight: 700;">#${idx + 1}</span></td>
					<td><strong style="color: var(--rr-text-dark);">${d.name}</strong></td>
					<td><span class="badge badge-light">${d.category}</span></td>
					<td>${d.formatted_price}</td>
					<td><strong style="color: var(--rr-primary); font-size: 0.95rem;">${d.qty_sold}</strong></td>
					<td>${d.formatted_gross}</td>
					<td><strong style="color: var(--rr-success);">${d.formatted_paid}</strong></td>
				</tr>
			`).join('');
			$bestTbody.html(bestHtml);
		}

		// 2. Category Sales
		const $catTbody = this.container.find('#rr-category-sales-tbody').empty();
		if (!menu.category_sales || menu.category_sales.length === 0) {
			$catTbody.html(`<tr><td colspan="6" class="text-center text-muted" style="padding: 1.5rem;">${__("No category sales in this period.")}</td></tr>`);
		} else {
			let catHtml = menu.category_sales.map(cs => `
				<tr>
					<td><strong>${cs.category}</strong></td>
					<td>${cs.items_count} ${__("items")}</td>
					<td><strong>${cs.quantity_sold}</strong></td>
					<td>${cs.formatted_gross}</td>
					<td><strong style="color: var(--rr-success);">${cs.formatted_paid}</strong></td>
					<td><span class="rr-status-badge badge-neutral">${cs.share_pct}</span></td>
				</tr>
			`).join('');
			$catTbody.html(catHtml);
		}

		// 3. Least-Selling Dishes
		const $leastTbody = this.container.find('#rr-leastsellers-tbody').empty();
		if (!menu.least_selling || menu.least_selling.length === 0) {
			$leastTbody.html(`<tr><td colspan="7" class="text-center text-muted" style="padding: 1.5rem;">${__("All dishes moving steadily.")}</td></tr>`);
		} else {
			let leastHtml = menu.least_selling.map(d => `
				<tr>
					<td><code style="color: #64748b;">${d.item_id || '--'}</code></td>
					<td><strong style="color: var(--rr-text-dark);">${d.name}</strong></td>
					<td><span class="badge badge-light">${d.category}</span></td>
					<td>${d.formatted_price}</td>
					<td><span style="font-weight: 700; color: ${d.qty_sold === 0 ? 'var(--rr-danger)' : 'var(--rr-text-dark)'};">${d.qty_sold}</span></td>
					<td>${d.formatted_gross}</td>
					<td>
						<span class="rr-status-badge ${d.qty_sold === 0 ? 'badge-cancelled' : 'badge-neutral'}">
							${d.qty_sold === 0 ? __('Zero Demand') : __('Low Movement')}
						</span>
					</td>
				</tr>
			`).join('');
			$leastTbody.html(leastHtml);
		}
	}

	render_customers_table(topCustomers) {
		const $tbody = this.container.find('#rr-customers-tbody').empty();
		if (!topCustomers || topCustomers.length === 0) {
			$tbody.html(`<tr><td colspan="7" class="text-center text-muted" style="padding: 1.5rem;">${__("No customer records found.")}</td></tr>`);
			return;
		}

		let html = topCustomers.map(c => `
			<tr>
				<td><code>${c.customer_id}</code></td>
				<td><strong>${c.name}</strong></td>
				<td><span class="text-muted"><i class="fa fa-lock"></i> ${c.masked_mobile}</span></td>
				<td><span class="badge badge-light" style="font-weight: 700; color: var(--rr-primary);">${c.total_visits} ${__("visits")}</span></td>
				<td>${c.orders_in_period}</td>
				<td><strong style="color: var(--rr-success);">${c.formatted_spent}</strong></td>
				<td><span class="text-muted" style="font-size: 0.8rem;">${c.last_visit}</span></td>
			</tr>
		`).join('');

		$tbody.html(html);
	}

	render_settlements_table(settlements) {
		const $tbody = this.container.find('#rr-settlements-tbody').empty();
		if (!settlements || settlements.length === 0) {
			$tbody.html(`<tr><td colspan="11" class="text-center text-muted" style="padding: 2rem;">${__("No bills generated for this period.")}</td></tr>`);
			return;
		}

		let html = settlements.map(b => `
			<tr>
				<td><strong style="color: var(--rr-primary);">${b.bill_no}</strong></td>
				<td><code>${b.order_id}</code></td>
				<td><span class="badge badge-light" style="font-weight: 600;">${b.table_no}</span></td>
				<td>${b.customer_name}</td>
				<td><strong>${b.payment_method}</strong></td>
				<td><span class="text-muted" style="font-size: 0.8rem;">${b.payment_reference}</span></td>
				<td>${b.formatted_subtotal}</td>
				<td>${b.formatted_tax}</td>
				<td><strong style="color: var(--rr-success); font-size: 0.95rem;">${b.formatted_total}</strong></td>
				<td>
					<span class="rr-status-badge ${b.payment_status === 'Paid' ? 'badge-paid' : 'badge-billed'}">
						${b.payment_status}
					</span>
				</td>
				<td><span class="text-muted" style="font-size: 0.78rem;">${b.paid_at}</span></td>
			</tr>
		`).join('');

		$tbody.html(html);
	}

	export_csv() {
		if (!this.data) {
			frappe.msgprint(__('No report data available to export.'));
			return;
		}
		const d = this.data;
		const s = d.summary;
		const gst = d.sales.gst_breakdown;

		let csvRows = [];

		// Header
		csvRows.push([`"IZEN BISTRO - FINANCIAL & OPERATIONAL REPORT"`]);
		csvRows.push([`"Address: ${d.restaurant_info.address.replace(/\n/g, ', ')}"`]);
		csvRows.push([`"Generated At: ${frappe.datetime.now_datetime()}"`]);
		csvRows.push([`"Report Period: ${d.period_label} (${d.start_date} to ${d.end_date})"`]);
		csvRows.push([]);

		// 1. Executive Summary
		csvRows.push([`"EXECUTIVE SUMMARY"`]);
		csvRows.push([`"Metric"`, `"Value"`]);
		csvRows.push([`"Total Reconciled Revenue"`, `"${s.total_revenue}"`]);
		csvRows.push([`"Total Orders"`, `"${s.total_orders}"`]);
		csvRows.push([`"Average Order Value (AOV)"`, `"${s.average_order_value}"`]);
		csvRows.push([`"Paid Bills Count"`, `"${s.paid_bills}"`]);
		csvRows.push([`"Pending Payments Count"`, `"${s.pending_payments_count}"`]);
		csvRows.push([`"Pending Payments Amount"`, `"${s.pending_payments_amount}"`]);
		csvRows.push([`"Cancelled Orders Count"`, `"${s.cancelled_orders}"`]);
		csvRows.push([`"Gross Order Value"`, `"${s.gross_sales}"`]);
		csvRows.push([]);

		// 2. GST Reconciliation
		csvRows.push([`"5% GST STATUTORY RECONCILIATION"`]);
		csvRows.push([`"GST Component"`, `"Rate"`, `"Amount (INR)"`]);
		csvRows.push([`"Taxable Base Subtotal"`, `""`, `"${gst.taxable_subtotal}"`]);
		csvRows.push([`"CGST"`, `"${gst.cgst_rate}"`, `"${gst.cgst_amount}"`]);
		csvRows.push([`"SGST"`, `"${gst.sgst_rate}"`, `"${gst.sgst_amount}"`]);
		csvRows.push([`"Total GST (5%)"`, `"${gst.total_gst_rate}"`, `"${gst.total_gst_amount}"`]);
		csvRows.push([`"Gross Reconciled Revenue"`, `""`, `"${gst.gross_settled}"`]);
		csvRows.push([]);

		// 3. Payment Method Breakdown
		csvRows.push([`"PAYMENT METHOD RECONCILIATION"`]);
		csvRows.push([`"Method"`, `"Transactions"`, `"Settled Amount"`, `"Share %"`]);
		d.sales.payment_methods.forEach(pm => {
			csvRows.push([`"${pm.method}"`, `"${pm.count}"`, `"${pm.amount}"`, `"${pm.share_pct}"`]);
		});
		csvRows.push([]);

		// 4. Daily Sales
		csvRows.push([`"DAILY SALES BREAKDOWN"`]);
		csvRows.push([`"Date"`, `"Day"`, `"Orders"`, `"Paid Bills"`, `"Subtotal"`, `"CGST"`, `"SGST"`, `"Total Revenue"`, `"Cash"`, `"UPI"`, `"Card"`]);
		d.sales.daily_sales.forEach(ds => {
			csvRows.push([`"${ds.date}"`, `"${ds.day_name}"`, `"${ds.orders_count}"`, `"${ds.paid_orders_count}"`, `"${ds.subtotal}"`, `"${ds.cgst}"`, `"${ds.sgst}"`, `"${ds.total_revenue}"`, `"${ds.cash}"`, `"${ds.upi}"`, `"${ds.card}"`]);
		});
		csvRows.push([]);

		// 5. Menu Best Sellers
		csvRows.push([`"BEST-SELLING MENU DISHES"`]);
		csvRows.push([`"Rank"`, `"Item Name"`, `"Category"`, `"Price"`, `"Qty Sold"`, `"Gross Revenue"`, `"Paid Revenue"`]);
		d.menu.best_selling.forEach((bs, i) => {
			csvRows.push([`"${i+1}"`, `"${bs.name}"`, `"${bs.category}"`, `"${bs.price}"`, `"${bs.qty_sold}"`, `"${bs.gross_revenue}"`, `"${bs.paid_revenue}"`]);
		});
		csvRows.push([]);

		// 6. Category Sales
		csvRows.push([`"CATEGORY SALES BREAKDOWN"`]);
		csvRows.push([`"Category"`, `"Items Count"`, `"Quantity Sold"`, `"Gross Revenue"`, `"Paid Revenue"`, `"Share %"`]);
		d.menu.category_sales.forEach(cs => {
			csvRows.push([`"${cs.category}"`, `"${cs.items_count}"`, `"${cs.quantity_sold}"`, `"${cs.gross_revenue}"`, `"${cs.paid_revenue}"`, `"${cs.share_pct}"`]);
		});
		csvRows.push([]);

		// 7. Settlement Ledger Audit
		csvRows.push([`"DETAILED SETTLEMENT LEDGER"`]);
		csvRows.push([`"Bill No"`, `"Order ID"`, `"Table"`, `"Customer"`, `"Payment Mode"`, `"Reference"`, `"Subtotal"`, `"Tax"`, `"Total"`, `"Status"`, `"Timestamp"`]);
		d.settlements.forEach(st => {
			csvRows.push([`"${st.bill_no}"`, `"${st.order_id}"`, `"${st.table_no}"`, `"${st.customer_name}"`, `"${st.payment_method}"`, `"${st.payment_reference}"`, `"${st.subtotal}"`, `"${st.tax}"`, `"${st.total}"`, `"${st.payment_status}"`, `"${st.paid_at}"`]);
		});

		// Build CSV content with UTF-8 BOM
		const csvContent = "\uFEFF" + csvRows.map(e => e.join(",")).join("\n");
		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.setAttribute("href", url);
		link.setAttribute("download", `Izen_Bistro_Report_${d.period}_${d.end_date}.csv`);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);

		frappe.show_alert({
			message: __('Report exported to CSV successfully!'),
			indicator: 'green'
		});
	}

	print_report() {
		window.print();
	}
}
