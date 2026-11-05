// Copyright (c) 2026, Nahusha and contributors
// For license information, please see license.txt

frappe.pages['restaurant-menu-management'].on_page_load = function (wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __('Menu Management'),
		single_column: true
	});

	frappe.breadcrumbs.add('Restaurant Management');

	// Primary Action: Add Menu Item
	page.set_primary_action(__('Add Menu Item'), function () {
		if (wrapper.menu_mgmt) {
			wrapper.menu_mgmt.open_item_dialog(null);
		}
	}, 'fa fa-plus');

	// Secondary Action: Refresh
	page.add_button(__('Refresh'), function () {
		if (wrapper.menu_mgmt) {
			wrapper.menu_mgmt.fetch_data();
		}
	}, 'fa fa-refresh');

	// Menu Action: Reset Demo Menu
	page.add_menu_item(__('Reset Demo Menu'), function () {
		frappe.confirm(
			__('Are you sure you want to reset all menu items and recipes back to the initial demo baseline?'),
			function () {
				frappe.call({
					method: 'restaurant_management.restaurant_management.page.restaurant_menu_management.restaurant_menu_management.reset_menu_data',
					callback: function (r) {
						if (r.message && wrapper.menu_mgmt) {
							wrapper.menu_mgmt.data = r.message;
							wrapper.menu_mgmt.render_all();
							frappe.show_alert({
								message: __('Menu items reset to demo baseline.'),
								indicator: 'green'
							});
						}
					}
				});
			}
		);
	});

	wrapper.menu_mgmt = new MenuManagement(wrapper, page);
};

frappe.pages['restaurant-menu-management'].on_page_show = function (wrapper) {
	if (wrapper.menu_mgmt) {
		wrapper.menu_mgmt.fetch_data();
	}
};

class MenuManagement {
	constructor(wrapper, page) {
		this.wrapper = wrapper;
		this.page = page;
		this.data = null;
		this.current_category = 'All';
		this.current_availability = 'All';
		this.search_query = '';
		this.search_timer = null;

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
			<div class="menu-management-wrapper">
				<!-- Header with Live System Indicator -->
				<div class="menu-header">
					<p class="menu-subtitle">
						<span class="live-indicator-pill">
							<span class="pulse-dot"></span>
							${__('Live Menu Catalog')}
						</span>
						${__('Recipe costing, stock-aware menu items & POS ordering integration')}
					</p>
					<div>
						<span class="text-muted" style="font-size: 0.8rem;">
							<i class="fa fa-clock-o"></i> ${__('Last updated:')} <span class="menu-last-updated">${frappe.datetime.now_time()}</span>
						</span>
					</div>
				</div>

				<!-- Top Summary KPI Grid -->
				<div class="menu-kpi-grid">
					<div class="menu-kpi-card kpi-total">
						<div class="menu-kpi-header">
							<span class="menu-kpi-title">${__('Total Dishes')}</span>
							<div class="menu-kpi-icon"><i class="fa fa-cutlery"></i></div>
						</div>
						<div class="menu-kpi-value" id="kpi-menu-total">--</div>
						<div class="menu-kpi-footer">
							<span>${__('across 8 culinary categories')}</span>
						</div>
					</div>

					<div class="menu-kpi-card kpi-available">
						<div class="menu-kpi-header">
							<span class="menu-kpi-title">${__('Available for Ordering')}</span>
							<div class="menu-kpi-icon"><i class="fa fa-check-circle"></i></div>
						</div>
						<div class="menu-kpi-value" id="kpi-menu-available">--</div>
						<div class="menu-kpi-footer">
							<span>${__('active on POS & kitchen')}</span>
						</div>
					</div>

					<div class="menu-kpi-card kpi-unavailable">
						<div class="menu-kpi-header">
							<span class="menu-kpi-title">${__('Currently Unavailable')}</span>
							<div class="menu-kpi-icon"><i class="fa fa-ban"></i></div>
						</div>
						<div class="menu-kpi-value" id="kpi-menu-unavailable">--</div>
						<div class="menu-kpi-footer">
							<span>${__('orders blocked at checkout')}</span>
						</div>
					</div>

					<div class="menu-kpi-card kpi-low-stock">
						<div class="menu-kpi-header">
							<span class="menu-kpi-title">${__('Low Stock Alerts')}</span>
							<div class="menu-kpi-icon"><i class="fa fa-exclamation-triangle"></i></div>
						</div>
						<div class="menu-kpi-value" id="kpi-menu-low-stock">--</div>
						<div class="menu-kpi-footer">
							<span>${__('dishes with low recipe stock')}</span>
						</div>
					</div>
				</div>

				<!-- Controls & Filters Panel -->
				<div class="menu-controls-panel">
					<div class="menu-search-action-row">
						<div class="menu-search-box">
							<i class="fa fa-search"></i>
							<input type="text" class="menu-search-input" id="menu-search-input" placeholder="${__('Search dish name, ID, or description...')}" />
						</div>

						<div class="menu-actions-group">
							<select class="menu-select-filter" id="menu-availability-filter">
								<option value="All">${__('All Statuses')}</option>
								<option value="Available">${__('Available Only')}</option>
								<option value="Unavailable">${__('Unavailable Only')}</option>
							</select>

							<button type="button" class="menu-btn-primary btn-add-new-dish">
								<i class="fa fa-plus"></i> ${__('Add New Dish')}
							</button>
						</div>
					</div>

					<!-- Category Tabs -->
					<div class="menu-category-tabs" id="menu-category-tabs">
						<button type="button" class="category-tab-btn active" data-category="All">
							${__('All')} <span class="tab-count-badge">0</span>
						</button>
						<button type="button" class="category-tab-btn" data-category="Starters">
							${__('Starters')} <span class="tab-count-badge">0</span>
						</button>
						<button type="button" class="category-tab-btn" data-category="Soups">
							${__('Soups')} <span class="tab-count-badge">0</span>
						</button>
						<button type="button" class="category-tab-btn" data-category="Main Course – Veg">
							${__('Main Course – Veg')} <span class="tab-count-badge">0</span>
						</button>
						<button type="button" class="category-tab-btn" data-category="Main Course – Non-Veg">
							${__('Main Course – Non-Veg')} <span class="tab-count-badge">0</span>
						</button>
						<button type="button" class="category-tab-btn" data-category="Rice & Biryani">
							${__('Rice & Biryani')} <span class="tab-count-badge">0</span>
						</button>
						<button type="button" class="category-tab-btn" data-category="Breads">
							${__('Breads')} <span class="tab-count-badge">0</span>
						</button>
						<button type="button" class="category-tab-btn" data-category="Desserts">
							${__('Desserts')} <span class="tab-count-badge">0</span>
						</button>
						<button type="button" class="category-tab-btn" data-category="Beverages">
							${__('Beverages')} <span class="tab-count-badge">0</span>
						</button>
					</div>
				</div>

				<!-- Menu Items Grid -->
				<div class="menu-items-grid" id="menu-items-grid">
					<div class="menu-empty-state">
						<i class="fa fa-spinner fa-spin fa-2x"></i>
						<p>${__('Loading menu items from centralized store...')}</p>
					</div>
				</div>
			</div>
		`).appendTo(this.page.main);
	}

	bind_events() {
		let me = this;

		// 1. Category Tabs
		this.container.on('click', '.category-tab-btn', function () {
			let cat = $(this).data('category');
			me.container.find('.category-tab-btn').removeClass('active');
			$(this).addClass('active');
			me.current_category = cat;
			me.fetch_data();
		});

		// 2. Search Input with Debounce
		this.container.on('input', '#menu-search-input', function () {
			clearTimeout(me.search_timer);
			let query = $(this).val();
			me.search_timer = setTimeout(() => {
				me.search_query = query;
				me.fetch_data();
			}, 250);
		});

		// 3. Availability Filter Dropdown
		this.container.on('change', '#menu-availability-filter', function () {
			me.current_availability = $(this).val();
			me.fetch_data();
		});

		// 4. Add New Dish Button
		this.container.on('click', '.btn-add-new-dish', function () {
			me.open_item_dialog(null);
		});

		// 5. Toggle Item Availability Switch
		this.container.on('click', '.availability-toggle-group', function (e) {
			e.stopPropagation();
			let item_id = $(this).data('item-id');
			me.toggle_item_availability(item_id);
		});

		// 6. Edit Item Button
		this.container.on('click', '.btn-edit-item', function (e) {
			e.stopPropagation();
			let item_id = $(this).data('item-id');
			let item = me.get_item(item_id);
			if (item) {
				me.open_item_dialog(item);
			}
		});

		// 7. Clear Filters in Empty State
		this.container.on('click', '.btn-clear-filters', function () {
			me.current_category = 'All';
			me.current_availability = 'All';
			me.search_query = '';
			me.container.find('#menu-search-input').val('');
			me.container.find('#menu-availability-filter').val('All');
			me.container.find('.category-tab-btn').removeClass('active');
			me.container.find('.category-tab-btn[data-category="All"]').addClass('active');
			me.fetch_data();
		});
	}

	fetch_data() {
		let me = this;
		frappe.call({
			method: 'restaurant_management.restaurant_management.page.restaurant_menu_management.restaurant_menu_management.get_menu_data',
			args: {
				category: this.current_category,
				search: this.search_query,
				availability: this.current_availability
			},
			callback: function (r) {
				if (r.message) {
					me.data = r.message;
					me.render_all();
				}
			}
		});
	}

	get_item(item_id) {
		if (!this.data || !this.data.items) return null;
		return this.data.items.find(i => i.item_id === item_id);
	}

	render_all() {
		if (!this.data) return;

		let summary = this.data.summary || {};
		this.container.find('#kpi-menu-total').text(summary.total_items || 0);
		this.container.find('#kpi-menu-available').text(summary.available_items || 0);
		this.container.find('#kpi-menu-unavailable').text(summary.unavailable_items || 0);
		this.container.find('#kpi-menu-low-stock').text(summary.low_stock_items || 0);

		this.container.find('.menu-last-updated').text(frappe.datetime.now_time());

		// Render Category Counts
		let categories = this.data.categories || [];
		categories.forEach(cat => {
			let $btn = this.container.find('.category-tab-btn').filter((_, el) => $(el).attr('data-category') === cat.name);
			if ($btn.length) {
				$btn.find('.tab-count-badge').text(cat.count);
			}
		});

		// Render Items Grid
		let $grid = this.container.find('#menu-items-grid').empty();
		let items = this.data.items || [];

		if (items.length === 0) {
			$(`
				<div class="menu-empty-state">
					<i class="fa fa-filter fa-3x"></i>
					<h4>${__('No Menu Items Found')}</h4>
					<p>${__('No dishes match category "{0}" with search query "{1}".', [this.current_category, this.search_query || ''])}</p>
					<button type="button" class="btn btn-sm btn-default btn-clear-filters">
						<i class="fa fa-refresh"></i> ${__('Clear All Filters')}
					</button>
				</div>
			`).appendTo($grid);
			return;
		}

		items.forEach(item => {
			$grid.append(this.create_item_card(item));
		});
	}

	create_item_card(item) {
		let isVeg = item.is_veg;
		let dietClass = isVeg ? 'diet-veg' : 'diet-nonveg';
		let dietTitle = isVeg ? __('Vegetarian') : __('Non-Vegetarian');
		let isAvailable = item.available !== false;
		let cardClass = isAvailable ? '' : 'is-unavailable';
		let imageUrl = item.image || '/assets/restaurant_management/images/dishes/placeholder.jpg';

		// Stock status badge
		let stockHtml = '';
		if (item.stock_status === 'out_of_stock') {
			stockHtml = `<div class="stock-warning-pill stock-out"><i class="fa fa-times-circle"></i> ${item.stock_warning || __('Out of Stock')}</div>`;
		} else if (item.stock_status === 'low_stock') {
			stockHtml = `<div class="stock-warning-pill stock-low"><i class="fa fa-exclamation-triangle"></i> ${item.stock_warning || __('Low Stock Alert')}</div>`;
		} else {
			stockHtml = `<div class="stock-warning-pill stock-ok"><i class="fa fa-check-circle"></i> ${__('Ingredients In Stock')}</div>`;
		}

		// Unavailable banner if toggled off
		let unavailableBanner = '';
		if (!isAvailable) {
			unavailableBanner = `
				<div class="unavailable-badge-banner">
					<i class="fa fa-ban"></i> ${__('Unavailable — Hidden from active orders')}
				</div>
			`;
		}

		return `
			<div class="menu-item-card ${cardClass}" data-item-id="${item.item_id}">
				<!-- Food Photograph Header -->
				<div class="item-card-image-wrap">
					<img src="${imageUrl}"
						alt="${item.name}"
						class="item-card-image"
						loading="lazy"
						onerror="this.onerror=null; this.src='/assets/restaurant_management/images/dishes/placeholder.jpg';" />
					<div class="item-card-image-gradient"></div>
					<div class="item-card-image-badges">
						<span class="item-id-pill">${item.item_id}</span>
						<span class="item-category-pill">${item.category}</span>
					</div>
				</div>

				<!-- Card Header -->
				<div class="item-card-header">
					<div class="item-title-group">
						<div class="food-diet-mark ${dietClass}" title="${dietTitle}"></div>
						<div>
							<h3 class="item-main-title">${item.name}</h3>
						</div>
					</div>
					<div class="item-price-tag">${item.formatted_price || ('₹' + item.price)}</div>
				</div>

				<!-- Card Body -->
				<div class="item-card-body">
					${unavailableBanner}

					<p class="item-description" title="${item.description || ''}">
						${item.description || __('No recipe description provided.')}
					</p>

					<!-- Recipe Ingredients & Stock -->
					<div class="item-recipe-box">
						<div class="item-recipe-header">
							<span><i class="fa fa-flask"></i> ${__('Recipe & Inventory')}</span>
							${stockHtml}
						</div>
						<div class="item-recipe-tags">
							<strong>${__('Portions:')}</strong> ${item.ingredients_summary || __('No stock required')}
						</div>
					</div>
				</div>

				<!-- Card Footer -->
				<div class="item-card-footer">
					<div class="availability-toggle-group ${isAvailable ? 'active' : ''}" data-item-id="${item.item_id}" title="${__('Toggle item availability for ordering')}">
						<div class="toggle-switch-ui"></div>
						<span class="availability-label">${isAvailable ? __('Available') : __('Unavailable')}</span>
					</div>

					<button type="button" class="btn-edit-item" data-item-id="${item.item_id}">
						<i class="fa fa-pencil"></i> ${__('Edit Dish')}
					</button>
				</div>
			</div>
		`;
	}

	toggle_item_availability(item_id) {
		let me = this;
		frappe.call({
			method: 'restaurant_management.restaurant_management.page.restaurant_menu_management.restaurant_menu_management.toggle_availability',
			args: { item_id: item_id },
			callback: function (r) {
				if (r.message) {
					let updatedItem = r.message;
					let stateText = updatedItem.available ? __('Available') : __('Unavailable');
					frappe.show_alert({
						message: __('"{0}" is now marked {1}', [updatedItem.name, stateText]),
						indicator: updatedItem.available ? 'green' : 'orange'
					});
					me.fetch_data();
				}
			}
		});
	}

	open_item_dialog(item) {
		let me = this;
		let isEdit = !!item;
		let availableIngredients = (this.data && this.data.available_ingredients) ? this.data.available_ingredients : [];
		let currentImage = isEdit ? (item.image || '') : '';
		let currentRecipe = isEdit ? (item.recipe || {}) : {};

		let fields = [
			{
				label: __('Dish / Item Name'),
				fieldname: 'name',
				fieldtype: 'Data',
				reqd: 1,
				default: isEdit ? item.name : ''
			},
			{
				label: __('Category'),
				fieldname: 'category',
				fieldtype: 'Select',
				options: [
					'Starters',
					'Soups',
					'Main Course – Veg',
					'Main Course – Non-Veg',
					'Rice & Biryani',
					'Breads',
					'Desserts',
					'Beverages'
				].join('\n'),
				reqd: 1,
				default: isEdit ? item.category : 'Main Course – Veg'
			},
			{
				label: __('Price (₹)'),
				fieldname: 'price',
				fieldtype: 'Currency',
				reqd: 1,
				default: isEdit ? item.price : 150
			},
			{
				fieldtype: 'Column Break'
			},
			{
				label: __('Is Vegetarian (Veg Dot Mark)'),
				fieldname: 'is_veg',
				fieldtype: 'Check',
				default: isEdit ? (item.is_veg ? 1 : 0) : 1
			},
			{
				label: __('Available for Ordering (POS / Kitchen)'),
				fieldname: 'available',
				fieldtype: 'Check',
				default: isEdit ? (item.available ? 1 : 0) : 1
			},
			{
				fieldtype: 'Section Break',
				label: __('Food Photograph')
			},
			{
				fieldname: 'photo_html',
				fieldtype: 'HTML'
			},
			{
				fieldtype: 'Section Break',
				label: __('Description & Culinary Notes')
			},
			{
				label: __('Description'),
				fieldname: 'description',
				fieldtype: 'Small Text',
				default: isEdit ? (item.description || '') : ''
			},
			{
				fieldtype: 'Section Break',
				label: __('Recipe Ingredients & Inventory Mapping (Per Serving)')
			},
			{
				fieldname: 'recipe_html',
				fieldtype: 'HTML'
			}
		];

		let d = new frappe.ui.Dialog({
			title: isEdit ? __('Edit Menu Item: {0}', [item.item_id]) : __('Add New Menu Item'),
			fields: fields,
			primary_action_label: isEdit ? __('Save Changes') : __('Add Dish'),
			primary_action: function (values) {
				// Collect recipe ingredients from HTML table
				let recipeObj = {};
				let $wrapper = d.get_field('recipe_html').$wrapper;
				$wrapper.find('.recipe-builder-row').each(function () {
					let ing = $(this).find('.recipe-ing-select').val();
					let qty = parseFloat($(this).find('.recipe-qty-input').val());
					if (ing && qty > 0) {
						recipeObj[ing] = qty;
					}
				});

				let imageUrl = d.get_field('photo_html').$wrapper.find('#dish-dialog-image-url').val().trim();

				d.hide();
				frappe.call({
					method: 'restaurant_management.restaurant_management.page.restaurant_menu_management.restaurant_menu_management.save_item',
					args: {
						item_id: isEdit ? item.item_id : null,
						name: values.name,
						category: values.category,
						price: values.price,
						is_veg: values.is_veg ? 1 : 0,
						image: imageUrl,
						description: values.description || '',
						recipe: JSON.stringify(recipeObj),
						available: values.available ? 1 : 0
					},
					callback: function (r) {
						if (r.message) {
							frappe.show_alert({
								message: isEdit
									? __('Menu item "{0}" updated successfully.', [values.name])
									: __('New menu item "{0}" created.', [values.name]),
								indicator: 'green'
							});
							me.fetch_data();
						}
					}
				});
			}
		});

		// Build photo upload & preview inside photo_html
		let $photoWrapper = d.get_field('photo_html').$wrapper;
		let photoHtml = `
			<div class="dish-dialog-photo-box">
				<div class="dish-dialog-photo-preview" id="dish-dialog-preview-container">
					<img id="dish-dialog-preview-img" src="${currentImage || ''}" style="${currentImage ? '' : 'display:none;'}" alt="Dish Preview" />
					<div id="dish-dialog-preview-placeholder" style="${currentImage ? 'display:none;' : ''}">
						<i class="fa fa-camera fa-2x" style="color: #94a3b8; margin-bottom: 0.35rem;"></i>
						<span style="font-size: 0.72rem; color: #94a3b8;">${__('No image selected')}</span>
					</div>
				</div>
				<div class="dish-dialog-photo-controls">
					<div class="dish-dialog-input-group">
						<label style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 0.35rem;">
							${__('Dish Image URL or Asset Path')}
						</label>
						<input type="text" class="form-control" id="dish-dialog-image-url" placeholder="/assets/restaurant_management/images/dishes/... or https://..." value="${currentImage || ''}" />
					</div>
					<div class="dish-dialog-btn-row">
						<label class="btn btn-sm btn-default btn-upload-dish-file" style="margin: 0; cursor: pointer;">
							<i class="fa fa-cloud-upload"></i> ${__('Upload Image File')}
							<input type="file" id="dish-dialog-file-input" accept="image/*" style="display:none;" />
						</label>
						<button type="button" class="btn btn-sm btn-default text-danger btn-remove-dish-image" id="btn-remove-dish-image" style="${currentImage ? '' : 'display:none;'}">
							<i class="fa fa-trash"></i> ${__('Remove Image')}
						</button>
						<span id="dish-upload-status" style="font-size: 0.8rem; font-weight: 500;"></span>
					</div>
					<div style="font-size: 0.72rem; color: var(--text-muted);">
						${__('Supported formats: JPG, PNG, WEBP. Stored persistently in app assets/files.')}
					</div>
				</div>
			</div>
		`;
		$photoWrapper.html(photoHtml);

		// Event handlers for photo input
		$photoWrapper.on('input', '#dish-dialog-image-url', function () {
			let val = $(this).val().trim();
			if (val) {
				$photoWrapper.find('#dish-dialog-preview-img').attr('src', val).show();
				$photoWrapper.find('#dish-dialog-preview-placeholder').hide();
				$photoWrapper.find('#btn-remove-dish-image').show();
			} else {
				$photoWrapper.find('#dish-dialog-preview-img').hide().attr('src', '');
				$photoWrapper.find('#dish-dialog-preview-placeholder').show();
				$photoWrapper.find('#btn-remove-dish-image').hide();
			}
		});

		$photoWrapper.on('change', '#dish-dialog-file-input', function (e) {
			let file = e.target.files[0];
			if (!file) return;

			let $status = $photoWrapper.find('#dish-upload-status');
			$status.html('<i class="fa fa-spinner fa-spin"></i> Uploading...').css('color', '#4f46e5');

			let reader = new FileReader();
			reader.onload = function (evt) {
				let dataUrl = evt.target.result;
				// Immediate preview
				$photoWrapper.find('#dish-dialog-preview-img').attr('src', dataUrl).show();
				$photoWrapper.find('#dish-dialog-preview-placeholder').hide();
				$photoWrapper.find('#btn-remove-dish-image').show();

				frappe.call({
					method: 'restaurant_management.restaurant_management.page.restaurant_menu_management.restaurant_menu_management.upload_dish_image',
					args: {
						filename: file.name,
						filedata: dataUrl
					},
					callback: function (r) {
						if (r.message) {
							$photoWrapper.find('#dish-dialog-image-url').val(r.message);
							$status.html('<i class="fa fa-check"></i> Uploaded!').css('color', '#10b981');
							setTimeout(() => $status.empty(), 3000);
						} else {
							$status.html('<i class="fa fa-times"></i> Upload failed').css('color', '#ef4444');
						}
					},
					error: function () {
						$status.html('<i class="fa fa-times"></i> Upload error').css('color', '#ef4444');
					}
				});
			};
			reader.readAsDataURL(file);
		});

		$photoWrapper.on('click', '#btn-remove-dish-image', function () {
			$photoWrapper.find('#dish-dialog-image-url').val('');
			$photoWrapper.find('#dish-dialog-preview-img').hide().attr('src', '');
			$photoWrapper.find('#dish-dialog-preview-placeholder').show();
			$(this).hide();
		});

		// Build recipe table inside HTML field
		let $wrapper = d.get_field('recipe_html').$wrapper;

		let buildRow = function (selectedIng = '', selectedQty = '') {
			let ingOptions = `<option value="">-- ${__('Select Ingredient')} --</option>`;
			availableIngredients.forEach(ing => {
				let sel = (ing.name === selectedIng) ? 'selected' : '';
				ingOptions += `<option value="${ing.name}" ${sel}>${ing.name} (${ing.current_qty} ${ing.unit} available)</option>`;
			});

			return `
				<tr class="recipe-builder-row">
					<td style="width: 60%;">
						<select class="recipe-ing-select form-control">${ingOptions}</select>
					</td>
					<td style="width: 30%;">
						<input type="number" step="0.01" min="0" class="recipe-qty-input form-control" placeholder="Qty (e.g. 0.2)" value="${selectedQty}" />
					</td>
					<td style="width: 10%; text-align: center;">
						<button type="button" class="btn-remove-ingredient" title="${__('Remove Ingredient')}"><i class="fa fa-trash"></i></button>
					</td>
				</tr>
			`;
		};

		let initialRowsHtml = '';
		if (Object.keys(currentRecipe).length > 0) {
			for (let [ing, qty] of Object.entries(currentRecipe)) {
				initialRowsHtml += buildRow(ing, qty);
			}
		} else {
			initialRowsHtml += buildRow('', '');
		}

		let builderHtml = `
			<div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem;">
				${__('Map inventory items consumed each time this dish is ordered. Stock automatically updates upon order confirmation.')}
			</div>
			<table class="recipe-builder-table">
				<thead>
					<tr>
						<th>${__('Inventory Ingredient')}</th>
						<th>${__('Consumption Per Serving')}</th>
						<th></th>
					</tr>
				</thead>
				<tbody class="recipe-builder-tbody">
					${initialRowsHtml}
				</tbody>
			</table>
			<button type="button" class="btn-add-ingredient-row">
				<i class="fa fa-plus"></i> ${__('Add Another Ingredient')}
			</button>
		`;

		$wrapper.html(builderHtml);

		// Event handlers for recipe builder inside dialog
		$wrapper.on('click', '.btn-add-ingredient-row', function () {
			$wrapper.find('.recipe-builder-tbody').append(buildRow('', ''));
		});

		$wrapper.on('click', '.btn-remove-ingredient', function () {
			$(this).closest('tr').remove();
		});

		d.show();
	}
}

