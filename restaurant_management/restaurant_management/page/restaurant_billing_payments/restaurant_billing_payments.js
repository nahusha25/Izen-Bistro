// Copyright (c) 2026, Nahusha and contributors
// For license information, please see license.txt

frappe.pages['restaurant-billing-payments'].on_page_load = function (wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __('Billing & Payments'),
		single_column: true
	});

	frappe.breadcrumbs.add('Restaurant Management');

	// Primary Action: Generate Bill
	page.set_primary_action(__('Generate Bill'), function () {
		if (wrapper.billing_mgmt) {
			wrapper.billing_mgmt.open_generate_bill_dialog();
		}
	}, 'fa fa-plus');

	// Secondary Action: Refresh
	page.add_button(__('Refresh'), function () {
		if (wrapper.billing_mgmt) {
			wrapper.billing_mgmt.fetch_data();
		}
	}, 'fa fa-refresh');

	wrapper.billing_mgmt = new BillingPayments(wrapper, page);
};

class BillingPayments {
	constructor(wrapper, page) {
		this.wrapper = wrapper;
		this.page = page;
		this.$container = $(this.wrapper).find('.layout-main-section');
		this.data = null;
		this.active_tab = 'All'; // 'All', 'Unpaid', 'Paid'
		this.selected_area = 'All';
		this.search_query = '';
		this.date_filter = '';

		this.init();
	}

	init() {
		this.$container.html(`
			<div class="billing-payments-wrapper">
				<div class="billing-header">
					<div class="brand-title-wrap">
						<span class="brand-badge"><i class="fa fa-cutlery"></i> IZEN BISTRO</span>
						<h2 class="billing-title"><i class="fa fa-credit-card text-primary"></i> ${__('Billing & Payments')}</h2>
						<p class="billing-subtitle">${__('Manage guest bills, process payments, and record revenues from the centralized restaurant store.')}</p>
					</div>
					<div class="billing-header-actions">
						<button class="btn btn-default btn-sm btn-refresh-billing">
							<i class="fa fa-refresh"></i> ${__('Refresh')}
						</button>
						<button class="btn btn-primary btn-sm btn-quick-generate-bill">
							<i class="fa fa-plus"></i> ${__('Generate Bill')}
						</button>
					</div>
				</div>

				<div class="billing-kpi-grid"></div>

				<div class="served-orders-container"></div>

				<div class="billing-filter-bar"></div>

				<div class="billing-table-card">
					<div class="billing-table-container"></div>
				</div>
			</div>
		`);

		this.bind_global_events();
		this.fetch_data();
	}

	bind_global_events() {
		let self = this;
		this.$container.on('click', '.btn-refresh-billing', function () {
			self.fetch_data();
		});

		this.$container.on('click', '.btn-quick-generate-bill', function () {
			self.open_generate_bill_dialog();
		});
	}

	fetch_data() {
		let self = this;
		frappe.call({
			method: 'restaurant_management.restaurant_management.page.restaurant_billing_payments.restaurant_billing_payments.get_billing_data',
			args: {
				status: self.active_tab,
				area: self.selected_area,
				search: self.search_query,
				date_filter: self.date_filter
			},
			callback: function (r) {
				if (r.message) {
					self.data = r.message;
					self.render_all();
				}
			}
		});
	}

	render_all() {
		this.render_kpis();
		this.render_served_orders();
		this.render_filters();
		this.render_bills_table();
	}

	render_kpis() {
		let summary = (this.data && this.data.summary) || {};
		let todays_bills = summary.todays_bills || 0;
		let paid_bills = summary.paid_bills || 0;
		let pending_payments = summary.pending_payments || 0;
		let todays_revenue = summary.formatted_revenue || '₹0';

		let html = `
			<div class="billing-kpi-card kpi-today">
				<div class="billing-kpi-header">
					<span class="billing-kpi-title">${__("Today's Bills")}</span>
					<div class="billing-kpi-icon"><i class="fa fa-file-text-o"></i></div>
				</div>
				<div class="billing-kpi-value">${todays_bills}</div>
				<div class="billing-kpi-subtext">${__('Total bills generated today')}</div>
			</div>

			<div class="billing-kpi-card kpi-paid">
				<div class="billing-kpi-header">
					<span class="billing-kpi-title">${__('Paid Bills')}</span>
					<div class="billing-kpi-icon"><i class="fa fa-check-circle"></i></div>
				</div>
				<div class="billing-kpi-value text-success">${paid_bills}</div>
				<div class="billing-kpi-subtext">${__('Fully settled transactions')}</div>
			</div>

			<div class="billing-kpi-card kpi-pending">
				<div class="billing-kpi-header">
					<span class="billing-kpi-title">${__('Pending Payments')}</span>
					<div class="billing-kpi-icon"><i class="fa fa-clock-o"></i></div>
				</div>
				<div class="billing-kpi-value text-warning">${pending_payments}</div>
				<div class="billing-kpi-subtext">${__('Awaiting guest settlement')}</div>
			</div>

			<div class="billing-kpi-card kpi-revenue">
				<div class="billing-kpi-header">
					<span class="billing-kpi-title">${__("Today's Collected Revenue")}</span>
					<div class="billing-kpi-icon"><i class="fa fa-inr"></i></div>
				</div>
				<div class="billing-kpi-value text-primary">${todays_revenue}</div>
				<div class="billing-kpi-subtext">${__('Exact settled revenue')}</div>
			</div>
		`;

		this.$container.find('.billing-kpi-grid').html(html);
	}

	render_served_orders() {
		let served = (this.data && this.data.served_orders) || [];
		let $container = this.$container.find('.served-orders-container');

		if (!served.length) {
			$container.html('');
			return;
		}

		let cards_html = served.map(order => {
			let order_id = frappe.utils.escape_html(order.order_id);
			let table_no = frappe.utils.escape_html(order.table_no || 'T-??');
			let customer = frappe.utils.escape_html(order.customer || 'Walk-in Guest');
			let amount = frappe.utils.escape_html(order.formatted_amount || `₹${order.total}`);
			let items_count = (order.items && order.items.length) || 0;

			return `
				<div class="served-order-card" data-order-id="${order_id}">
					<div class="served-order-info">
						<div class="served-order-top">
							<span class="served-order-table"><i class="fa fa-table text-muted"></i> ${table_no}</span>
							<span class="served-order-id">${order_id}</span>
						</div>
						<div class="served-order-customer"><i class="fa fa-user-o text-muted"></i> ${customer} &bull; ${items_count} items</div>
						<div class="served-order-amount">${amount}</div>
					</div>
					<div>
						<button class="btn btn-primary btn-xs btn-generate-bill-direct" data-order-id="${order_id}">
							<i class="fa fa-file-text-o"></i> ${__('Generate Bill')}
						</button>
					</div>
				</div>
			`;
		}).join('');

		let banner_html = `
			<div class="served-orders-banner">
				<div class="served-orders-header">
					<div class="served-orders-title">
						<i class="fa fa-bell-o text-primary"></i> ${__('Orders Ready to Bill (Served)')}
						<span class="served-orders-count-badge">${served.length}</span>
					</div>
					<div style="font-size: 0.8rem; color: #64748b;">
						${__('Kitchen preparation finished & food served to guests')}
					</div>
				</div>
				<div class="served-orders-grid">
					${cards_html}
				</div>
			</div>
		`;

		$container.html(banner_html);

		let self = this;
		$container.find('.btn-generate-bill-direct').on('click', function () {
			let order_id = $(this).data('order-id');
			self.execute_generate_bill(order_id);
		});
	}

	render_filters() {
		let areas = (this.data && this.data.areas) || ['Main Dining Hall', 'Garden Patio', 'Rooftop Terrace'];
		let self = this;

		let area_options = `<option value="All">${__('All Dining Areas')}</option>`;
		areas.forEach(a => {
			let sel = self.selected_area === a ? 'selected' : '';
			area_options += `<option value="${frappe.utils.escape_html(a)}" ${sel}>${frappe.utils.escape_html(a)}</option>`;
		});

		let html = `
			<div class="billing-filter-tabs">
				<button class="billing-tab-btn ${self.active_tab === 'All' ? 'active' : ''}" data-tab="All">
					<i class="fa fa-list"></i> ${__('All Bills')}
				</button>
				<button class="billing-tab-btn ${self.active_tab === 'Unpaid' ? 'active' : ''}" data-tab="Unpaid">
					<i class="fa fa-clock-o text-warning"></i> ${__('Pending Payments')}
				</button>
				<button class="billing-tab-btn ${self.active_tab === 'Paid' ? 'active' : ''}" data-tab="Paid">
					<i class="fa fa-check-circle text-success"></i> ${__('Paid Bills')}
				</button>
			</div>

			<div class="billing-filter-controls">
				<div class="billing-search-box">
					<i class="fa fa-search billing-search-icon"></i>
					<input type="text" class="billing-search-input" placeholder="${__('Search bill #, order #, table, customer...')}" value="${frappe.utils.escape_html(self.search_query)}">
				</div>

				<select class="billing-select billing-area-select">
					${area_options}
				</select>
			</div>
		`;

		let $bar = this.$container.find('.billing-filter-bar');
		$bar.html(html);

		// Events
		$bar.find('.billing-tab-btn').on('click', function () {
			self.active_tab = $(this).data('tab');
			self.fetch_data();
		});

		$bar.find('.billing-area-select').on('change', function () {
			self.selected_area = $(this).val();
			self.fetch_data();
		});

		let search_timer = null;
		$bar.find('.billing-search-input').on('input', function () {
			let val = $(this).val();
			clearTimeout(search_timer);
			search_timer = setTimeout(() => {
				self.search_query = val;
				self.fetch_data();
			}, 300);
		});
	}

	render_bills_table() {
		let bills = (this.data && this.data.bills) || [];
		let $tableContainer = this.$container.find('.billing-table-container');

		if (!bills.length) {
			$tableContainer.html(`
				<div class="billing-empty-state">
					<div class="billing-empty-icon"><i class="fa fa-file-text-o"></i></div>
					<div class="billing-empty-title">${__('No Bills Found')}</div>
					<div style="font-size: 0.85rem;">${__('There are no bills matching your current filter criteria.')}</div>
				</div>
			`);
			return;
		}

		let rows_html = bills.map(bill => {
			let bill_no = frappe.utils.escape_html(bill.bill_no);
			let order_id = frappe.utils.escape_html(bill.order_id);
			let table_no = frappe.utils.escape_html(bill.table_no);
			let area = frappe.utils.escape_html(bill.area || 'Main Dining Hall');
			let cust_name = frappe.utils.escape_html(bill.customer_name || 'Guest');
			let cust_mobile = bill.customer_mobile ? `+91 ${frappe.utils.escape_html(bill.customer_mobile)}` : '<span class="text-muted">-</span>';
			let cust_id = bill.customer_id ? `<span class="badge" style="font-size: 0.7rem; background: #f1f5f9; color: #475569;">${frappe.utils.escape_html(bill.customer_id)}</span>` : '';
			let date_time = `${frappe.utils.escape_html(bill.bill_date || '')} ${frappe.utils.escape_html(bill.bill_time || '')}`;
			let total_fmt = frappe.utils.escape_html(bill.formatted_total || `₹${bill.total}`);
			let is_paid = bill.payment_status === 'Paid';

			let status_badge = is_paid
				? `<span class="badge-bill-paid"><i class="fa fa-check"></i> ${__('Paid')}</span>`
				: `<span class="badge-bill-unpaid"><i class="fa fa-clock-o"></i> ${__('Pending Payment')}</span>`;

			let payment_info = '-';
			if (is_paid) {
				let mode = frappe.utils.escape_html(bill.payment_method || 'Cash');
				let ref = bill.payment_reference ? `<div style="font-size: 0.72rem; color: #64748b; font-family: monospace;">Ref: ${frappe.utils.escape_html(bill.payment_reference)}</div>` : '';
				payment_info = `
					<div>
						<span class="badge-payment-mode"><i class="fa fa-credit-card"></i> ${mode}</span>
						${ref}
					</div>
				`;
			}

			let action_buttons = `
				<div class="bill-actions">
					<button class="bill-action-btn btn-view btn-view-receipt" data-bill-no="${bill_no}" title="${__('View Bill Receipt')}">
						<i class="fa fa-eye"></i> ${__('View')}
					</button>
					${!is_paid ? `
						<button class="bill-action-btn btn-pay btn-process-payment" data-bill-no="${bill_no}" title="${__('Record Payment')}">
							<i class="fa fa-check"></i> ${__('Pay')}
						</button>
					` : ''}
					<button class="bill-action-btn btn-print-receipt" data-bill-no="${bill_no}" title="${__('Print Tax Invoice')}">
						<i class="fa fa-print"></i>
					</button>
					<button class="bill-action-btn btn-download-pdf" data-bill-no="${bill_no}" title="${__('Download PDF / Tax Invoice')}">
						<i class="fa fa-download"></i>
					</button>
				</div>
			`;

			return `
				<tr data-bill-no="${bill_no}">
					<td>
						<strong style="color: #0f172a; font-family: monospace; font-size: 0.9rem;">${bill_no}</strong>
						<div style="font-size: 0.74rem; color: #64748b;">${order_id}</div>
					</td>
					<td>
						<strong style="color: #0f172a;"><i class="fa fa-table text-muted"></i> ${table_no}</strong>
						<div style="font-size: 0.74rem; color: #64748b;">${area}</div>
					</td>
					<td>
						<div><strong>${cust_name}</strong> ${cust_id}</div>
						<div style="font-size: 0.75rem; color: #64748b;">${cust_mobile}</div>
					</td>
					<td>
						<div style="font-size: 0.8rem; color: #334155;">${date_time}</div>
					</td>
					<td>
						<strong style="font-size: 0.95rem; color: #0f172a;">${total_fmt}</strong>
						<div style="font-size: 0.72rem; color: #64748b;">(incl. 5% GST)</div>
					</td>
					<td>${status_badge}</td>
					<td>${payment_info}</td>
					<td style="text-align: right;">${action_buttons}</td>
				</tr>
			`;
		}).join('');

		let table_html = `
			<table class="billing-table">
				<thead>
					<tr>
						<th>${__('Bill / Order')}</th>
						<th>${__('Table & Area')}</th>
						<th>${__('Customer')}</th>
						<th>${__('Date & Time')}</th>
						<th>${__('Total Amount')}</th>
						<th>${__('Payment Status')}</th>
						<th>${__('Settlement')}</th>
						<th style="text-align: right;">${__('Actions')}</th>
					</tr>
				</thead>
				<tbody>
					${rows_html}
				</tbody>
			</table>
		`;

		$tableContainer.html(table_html);

		let self = this;
		$tableContainer.find('.btn-view-receipt').on('click', function () {
			let bill_no = $(this).data('bill-no');
			self.open_receipt_dialog(bill_no);
		});

		$tableContainer.find('.btn-process-payment').on('click', function () {
			let bill_no = $(this).data('bill-no');
			let bill = bills.find(b => b.bill_no === bill_no);
			if (bill) {
				self.open_payment_dialog(bill);
			}
		});

		$tableContainer.find('.btn-print-receipt').on('click', function () {
			let bill_no = $(this).data('bill-no');
			self.print_receipt(bill_no);
		});

		$tableContainer.find('.btn-download-pdf').on('click', function () {
			let bill_no = $(this).data('bill-no');
			self.download_pdf(bill_no);
		});
	}

	execute_generate_bill(order_id) {
		let self = this;
		frappe.call({
			method: 'restaurant_management.restaurant_management.page.restaurant_billing_payments.restaurant_billing_payments.generate_bill',
			args: { order_id: order_id },
			freeze: true,
			freeze_message: __('Generating Bill for {0}...', [order_id]),
			callback: function (r) {
				if (r.message) {
					frappe.show_alert({
						message: __('Bill {0} generated successfully!', [r.message.bill_no]),
						indicator: 'green'
					});
					self.fetch_data();
					self.open_receipt_dialog(r.message.bill_no);
				}
			}
		});
	}

	open_generate_bill_dialog() {
		let self = this;
		let served = (this.data && this.data.served_orders) || [];

		if (!served.length) {
			frappe.msgprint({
				title: __('No Eligible Orders'),
				message: __('There are currently no orders in <b>Served</b> status ready to be billed.<br><br>Orders in <i>Preparing</i> or <i>Ready</i> status cannot be billed prematurely according to kitchen operations policy.'),
				indicator: 'orange'
			});
			return;
		}

		let options = served.map(o => ({
			label: `${o.order_id} - Table ${o.table_no} (${o.customer || 'Guest'}) - ${o.formatted_amount || '₹' + o.total}`,
			value: o.order_id
		}));

		let d = new frappe.ui.Dialog({
			title: __('Generate Guest Bill'),
			fields: [
				{
					fieldname: 'order_id',
					label: __('Select Served Order'),
					fieldtype: 'Select',
					options: options,
					default: options[0].value,
					reqd: 1
				},
				{
					fieldname: 'order_preview_html',
					fieldtype: 'HTML',
					options: ''
				}
			],
			primary_action_label: __('Generate Bill'),
			primary_action: function (values) {
				d.hide();
				self.execute_generate_bill(values.order_id);
			}
		});

		function update_preview(oid) {
			let order = served.find(o => o.order_id === oid);
			if (!order) return;
			let items_list = (order.items || []).map(it => `
				<div style="display: flex; justify-content: space-between; font-size: 0.82rem; padding: 4px 0; border-bottom: 1px dashed #e2e8f0;">
					<span>${frappe.utils.escape_html(it.name)} &times; ${it.qty}</span>
					<strong style="color: #0f172a;">${it.formatted_amount || '₹' + it.amount}</strong>
				</div>
			`).join('');

			let html = `
				<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-top: 10px;">
					<div style="display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 8px;">
						<span>Table ${frappe.utils.escape_html(order.table_no)} &bull; ${frappe.utils.escape_html(order.customer)}</span>
						<span class="text-primary">${order.formatted_amount}</span>
					</div>
					<div style="max-height: 180px; overflow-y: auto;">
						${items_list}
					</div>
					<div style="margin-top: 8px; font-size: 0.78rem; color: #64748b;">
						Tax: ₹${order.tax} (5% GST) &bull; Subtotal: ₹${order.subtotal}
					</div>
				</div>
			`;
			d.fields_dict.order_preview_html.$wrapper.html(html);
		}

		d.fields_dict.order_id.$input.on('change', function () {
			update_preview($(this).val());
		});

		d.show();
		update_preview(options[0].value);
	}

	open_payment_dialog(bill) {
		let self = this;
		let bill_no = bill.bill_no;
		let amount = bill.formatted_total || `₹${bill.total}`;
		let customer = bill.customer_name || 'Guest';
		let table_no = bill.table_no || '';

		let selected_method = 'Cash';

		let d = new frappe.ui.Dialog({
			title: __('Process Bill Payment'),
			fields: [
				{
					fieldname: 'summary_html',
					fieldtype: 'HTML'
				},
				{
					fieldname: 'payment_method_html',
					fieldtype: 'HTML'
				},
				{
					fieldname: 'payment_reference',
					label: __('Payment Reference / Transaction ID'),
					fieldtype: 'Data',
					description: __('Optional for Cash. Required for UPI and Card.')
				}
			],
			primary_action_label: __('Confirm & Record Payment'),
			primary_action: function (values) {
				let ref = (values.payment_reference || '').trim();

				if ((selected_method === 'UPI' || selected_method === 'Card') && !ref) {
					frappe.msgprint({
						title: __('Reference Required'),
						message: __('Please enter a valid Transaction ID / Reference for <b>{0}</b> payment.', [selected_method]),
						indicator: 'orange'
					});
					return;
				}

				frappe.call({
					method: 'restaurant_management.restaurant_management.page.restaurant_billing_payments.restaurant_billing_payments.process_bill_payment',
					args: {
						bill_no: bill_no,
						payment_method: selected_method,
						payment_reference: ref
					},
					freeze: true,
					freeze_message: __('Recording {0} payment...', [selected_method]),
					callback: function (r) {
						if (r.message && r.message.success) {
							d.hide();
							frappe.show_alert({
								message: __('Payment recorded successfully! Table {0} has been released.', [r.message.released_table || table_no]),
								indicator: 'green'
							});
							self.fetch_data();
							self.open_receipt_dialog(bill_no);
						}
					}
				});
			}
		});

		let summary_html = `
			<div class="payment-modal-summary">
				<div class="payment-summary-row">
					<span class="text-muted">${__('Bill Number')}:</span>
					<strong style="font-family: monospace;">${frappe.utils.escape_html(bill_no)}</strong>
				</div>
				<div class="payment-summary-row">
					<span class="text-muted">${__('Guest & Table')}:</span>
					<strong>${frappe.utils.escape_html(customer)} &bull; Table ${frappe.utils.escape_html(table_no)}</strong>
				</div>
				<div class="payment-summary-row total-row">
					<span>${__('Amount Payable')}:</span>
					<span class="text-primary">${frappe.utils.escape_html(amount)}</span>
				</div>
			</div>
		`;
		d.fields_dict.summary_html.$wrapper.html(summary_html);

		let method_html = `
			<label class="control-label" style="font-weight: 600; font-size: 0.82rem; margin-bottom: 0.4rem; display: block;">${__('Select Payment Method')}</label>
			<div class="payment-method-selector">
				<div class="payment-method-card selected" data-method="Cash">
					<div class="method-icon"><i class="fa fa-money text-success"></i></div>
					<div class="method-name">${__('Cash')}</div>
				</div>
				<div class="payment-method-card" data-method="UPI">
					<div class="method-icon"><i class="fa fa-mobile text-primary" style="font-size: 1.5rem;"></i></div>
					<div class="method-name">${__('UPI / QR')}</div>
				</div>
				<div class="payment-method-card" data-method="Card">
					<div class="method-icon"><i class="fa fa-credit-card text-warning"></i></div>
					<div class="method-name">${__('Card')}</div>
				</div>
			</div>
		`;
		d.fields_dict.payment_method_html.$wrapper.html(method_html);

		let $wrapper = d.fields_dict.payment_method_html.$wrapper;
		$wrapper.find('.payment-method-card').on('click', function () {
			$wrapper.find('.payment-method-card').removeClass('selected');
			$(this).addClass('selected');
			selected_method = $(this).data('method');

			let $refField = d.fields_dict.payment_reference;
			if (selected_method === 'UPI') {
				$refField.df.label = __('UPI Transaction Reference / UTR');
				$refField.df.reqd = 1;
				$refField.set_description(__('Enter the 12-digit UTR or UPI confirmation reference.'));
			} else if (selected_method === 'Card') {
				$refField.df.label = __('Card Auth Code / Terminal Ref');
				$refField.df.reqd = 1;
				$refField.set_description(__('Enter POS terminal authorization reference.'));
			} else {
				$refField.df.label = __('Payment Reference / Note');
				$refField.df.reqd = 0;
				$refField.set_description(__('Optional for Cash payments.'));
			}
			$refField.refresh();
		});

		d.show();
	}

	open_receipt_dialog(bill_no) {
		let self = this;
		if (this.receipt_dialog) {
			try { this.receipt_dialog.hide(); this.receipt_dialog.$wrapper.remove(); } catch (e) { }
			this.receipt_dialog = null;
		}

		frappe.call({
			method: 'restaurant_management.restaurant_management.page.restaurant_billing_payments.restaurant_billing_payments.get_receipt',
			args: { bill_no: bill_no },
			callback: function (r) {
				if (!r.message) return;
				let receipt = r.message;
				let is_paid = receipt.payment_status === 'Paid';

				self.receipt_dialog = new frappe.ui.Dialog({
					title: `${__('Guest Bill Receipt')} — ${frappe.utils.escape_html(bill_no)}`,
					fields: [
						{
							fieldname: 'receipt_html_area',
							fieldtype: 'HTML'
						}
					],
					primary_action_label: __('Print Bill'),
					primary_action: function () {
						self.print_receipt(bill_no, receipt.receipt_html);
					}
				});

				self.receipt_dialog.add_custom_action(__('Download PDF'), function () {
					self.download_pdf(bill_no);
				});

				if (!is_paid) {
					self.receipt_dialog.add_custom_action(__('Process Payment'), function () {
						self.receipt_dialog.hide();
						let bill = (self.data && self.data.bills || []).find(b => b.bill_no === bill_no) || receipt;
						self.open_payment_dialog(bill);
					}, 'btn-success');
				}

				self.receipt_dialog.fields_dict.receipt_html_area.$wrapper.html(`
					<div style="background: #f1f5f9; padding: 1.25rem; border-radius: 8px; max-height: 520px; overflow-y: auto;">
						${receipt.receipt_html}
					</div>
				`);

				self.receipt_dialog.show();
			}
		});
	}

	print_receipt(bill_no, receipt_html) {
		if (receipt_html) {
			this._trigger_print(receipt_html);
			return;
		}

		let self = this;
		frappe.call({
			method: 'restaurant_management.restaurant_management.page.restaurant_billing_payments.restaurant_billing_payments.get_receipt',
			args: { bill_no: bill_no },
			callback: function (r) {
				if (r.message && r.message.receipt_html) {
					self._trigger_print(r.message.receipt_html);
				}
			}
		});
	}

	_trigger_print(receipt_html) {
		let printWindow = window.open('', '_blank', 'width=600,height=750');
		if (!printWindow) {
			frappe.msgprint(__('Please allow popups to print the guest bill receipt.'));
			return;
		}
		printWindow.document.write(`
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="utf-8">
				<title>Izen_Bistro_Bill</title>
				<style>
					body { font-family: 'Courier New', Courier, monospace; padding: 20px; margin: 0; background: #ffffff; }
					@media print {
						body { padding: 0; }
						#printable-receipt-container { box-shadow: none !important; border: none !important; }
					}
				</style>
			</head>
			<body>
				${receipt_html}
				<script>
					window.onload = function() {
						window.focus();
						window.print();
					};
				</script>
			</body>
			</html>
		`);
		printWindow.document.close();
	}

	download_pdf(bill_no) {
		let url = `/api/method/restaurant_management.restaurant_management.page.restaurant_billing_payments.restaurant_billing_payments.download_bill_pdf?bill_no=${encodeURIComponent(bill_no)}`;
		window.open(url, '_blank');
	}
}
