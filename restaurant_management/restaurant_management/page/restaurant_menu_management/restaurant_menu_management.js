// Copyright (c) 2026, Nahusha and contributors
// For license information, please see license.txt

frappe.pages['restaurant-menu-management'].on_page_load = function (wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __('Menu & Recipe Management'),
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
			wrapper.menu_mgmt.refresh_current_view();
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
		wrapper.menu_mgmt.refresh_current_view();
	}
};

class MenuManagement {
	constructor(wrapper, page) {
		this.wrapper = wrapper;
		this.page = page;
		this.current_view = 'catalog'; // 'catalog' | 'recipes'
		this.data = null;
		this.recipe_data = null;
		
		// Catalog filters
		this.current_category = 'All';
		this.current_availability = 'All';
		this.search_query = '';
		this.search_timer = null;

		// Recipe filters
		this.recipe_category = 'All';
		this.recipe_status = 'All';
		this.recipe_search = '';
		this.recipe_search_timer = null;

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
							${__('Live Menu & Recipe System')}
						</span>
						${__('Recipe portion costing, raw material consumption & inventory synchronization')}
					</p>
					<div>
						<span class="text-muted" style="font-size: 0.8rem;">
							<i class="fa fa-clock-o"></i> ${__('Last updated:')} <span class="menu-last-updated">${frappe.datetime.now_time()}</span>
						</span>
					</div>
				</div>

				<!-- View Switcher Tabs -->
				<div class="menu-view-switcher">
					<button type="button" class="view-switch-btn active" data-view="catalog">
						<i class="fa fa-cutlery"></i> ${__('Menu Catalog')}
					</button>
					<button type="button" class="view-switch-btn" data-view="recipes">
						<i class="fa fa-book"></i> ${__('Recipe & Portion Management')}
						<span class="badge badge-info recipe-tab-count-badge" id="recipe-nav-kpi-badge">--</span>
					</button>
				</div>

				<!-- ======================================================== -->
				<!-- VIEW 1: MENU CATALOG VIEW                                -->
				<!-- ======================================================== -->
				<div class="view-panel" id="view-catalog-panel">
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

				<!-- ======================================================== -->
				<!-- VIEW 2: RECIPE & PORTION MANAGEMENT VIEW                 -->
				<!-- ======================================================== -->
				<div class="view-panel" id="view-recipes-panel" style="display: none;">
					<!-- Recipe Dashboard Overview Grid (6 KPIs) -->
					<div class="recipe-kpi-grid">
						<div class="recipe-kpi-card rkpi-total">
							<div class="rkpi-header">
								<span class="rkpi-title">${__('Total Menu Dishes')}</span>
								<i class="fa fa-cutlery rkpi-icon"></i>
							</div>
							<div class="rkpi-value" id="rkpi-total-dishes">--</div>
							<div class="rkpi-subtitle">${__('all culinary catalog items')}</div>
						</div>

						<div class="recipe-kpi-card rkpi-approved">
							<div class="rkpi-header">
								<span class="rkpi-title">${__('Approved Recipes')}</span>
								<i class="fa fa-check-circle rkpi-icon" style="color: #10b981;"></i>
							</div>
							<div class="rkpi-value" id="rkpi-approved" style="color: #059669;">--</div>
							<div class="rkpi-subtitle">${__('synced with stock deduction')}</div>
						</div>

						<div class="recipe-kpi-card rkpi-pending">
							<div class="rkpi-header">
								<span class="rkpi-title">${__('Awaiting Approval')}</span>
								<i class="fa fa-clock-o rkpi-icon" style="color: #f59e0b;"></i>
							</div>
							<div class="rkpi-value" id="rkpi-pending" style="color: #d97706;">--</div>
							<div class="rkpi-subtitle">${__('pending chef / manager sign-off')}</div>
						</div>

						<div class="recipe-kpi-card rkpi-draft">
							<div class="rkpi-header">
								<span class="rkpi-title">${__('Draft / No Recipe')}</span>
								<i class="fa fa-pencil-square-o rkpi-icon" style="color: #64748b;"></i>
							</div>
							<div class="rkpi-value" id="rkpi-draft" style="color: #475569;">--</div>
							<div class="rkpi-subtitle">${__('unverified measurements')}</div>
						</div>

						<div class="recipe-kpi-card rkpi-unmapped">
							<div class="rkpi-header">
								<span class="rkpi-title">${__('Unmapped Ingredients')}</span>
								<i class="fa fa-chain-broken rkpi-icon" style="color: #ef4444;"></i>
							</div>
							<div class="rkpi-value" id="rkpi-unmapped" style="color: #dc2626;">--</div>
							<div class="rkpi-subtitle">${__('flagged for inventory link')}</div>
						</div>

						<div class="recipe-kpi-card rkpi-incomplete">
							<div class="rkpi-header">
								<span class="rkpi-title">${__('Incomplete Recipes')}</span>
								<i class="fa fa-exclamation-triangle rkpi-icon" style="color: #eab308;"></i>
							</div>
							<div class="rkpi-value" id="rkpi-incomplete" style="color: #ca8a04;">--</div>
							<div class="rkpi-subtitle">${__('missing unit or raw materials')}</div>
						</div>
					</div>

					<!-- Recipe Controls & Filters -->
					<div class="menu-controls-panel">
						<div class="menu-search-action-row">
							<div class="menu-search-box">
								<i class="fa fa-search"></i>
								<input type="text" class="menu-search-input" id="recipe-search-input" placeholder="${__('Search dish name, ingredient, or recipe...')}" />
							</div>

							<div class="menu-actions-group">
								<select class="menu-select-filter" id="recipe-status-filter">
									<option value="All">${__('All Recipe Statuses')}</option>
									<option value="Approved">${__('Approved Only')}</option>
									<option value="Pending Approval">${__('Pending Approval Only')}</option>
									<option value="Draft">${__('Draft / Unverified Only')}</option>
									<option value="Incomplete">${__('Incomplete Recipes Only')}</option>
								</select>

								<select class="menu-select-filter" id="recipe-category-filter">
									<option value="All">${__('All Categories')}</option>
									<option value="Starters">${__('Starters')}</option>
									<option value="Soups">${__('Soups')}</option>
									<option value="Main Course – Veg">${__('Main Course – Veg')}</option>
									<option value="Main Course – Non-Veg">${__('Main Course – Non-Veg')}</option>
									<option value="Rice & Biryani">${__('Rice & Biryani')}</option>
									<option value="Breads">${__('Breads')}</option>
									<option value="Desserts">${__('Desserts')}</option>
									<option value="Beverages">${__('Beverages')}</option>
								</select>

								<button type="button" class="btn btn-default btn-sm btn-refresh-recipes">
									<i class="fa fa-refresh"></i> ${__('Refresh')}
								</button>
							</div>
						</div>
					</div>

					<!-- Recipe Dish List Table / Grid -->
					<div class="recipe-dishes-container" id="recipe-dishes-container">
						<div class="menu-empty-state">
							<i class="fa fa-spinner fa-spin fa-2x"></i>
							<p>${__('Loading recipe catalog...')}</p>
						</div>
					</div>
				</div>
			</div>
		`).appendTo(this.page.main);
	}

	bind_events() {
		let me = this;

		// 1. View Switcher
		this.container.on('click', '.view-switch-btn', function () {
			let targetView = $(this).data('view');
			me.container.find('.view-switch-btn').removeClass('active');
			$(this).addClass('active');
			me.current_view = targetView;

			if (targetView === 'catalog') {
				me.container.find('#view-catalog-panel').show();
				me.container.find('#view-recipes-panel').hide();
				me.fetch_data();
			} else {
				me.container.find('#view-catalog-panel').hide();
				me.container.find('#view-recipes-panel').show();
				me.fetch_recipe_dashboard_data();
			}
		});

		// 2. Category Tabs (Catalog)
		this.container.on('click', '.category-tab-btn', function () {
			let cat = $(this).data('category');
			me.container.find('.category-tab-btn').removeClass('active');
			$(this).addClass('active');
			me.current_category = cat;
			me.fetch_data();
		});

		// 3. Search Input (Catalog)
		this.container.on('input', '#menu-search-input', function () {
			clearTimeout(me.search_timer);
			let query = $(this).val();
			me.search_timer = setTimeout(() => {
				me.search_query = query;
				me.fetch_data();
			}, 250);
		});

		// 4. Availability Filter (Catalog)
		this.container.on('change', '#menu-availability-filter', function () {
			me.current_availability = $(this).val();
			me.fetch_data();
		});

		// 5. Add New Dish
		this.container.on('click', '.btn-add-new-dish', function () {
			me.open_item_dialog(null);
		});

		// 6. Toggle Item Availability
		this.container.on('click', '.availability-toggle-group', function (e) {
			e.stopPropagation();
			let item_id = $(this).data('item-id');
			me.toggle_item_availability(item_id);
		});

		// 7. Edit Item Dialog
		this.container.on('click', '.btn-edit-item', function (e) {
			e.stopPropagation();
			let item_id = $(this).data('item-id');
			let item = me.get_item(item_id);
			if (item) {
				me.open_item_dialog(item);
			}
		});

		// 8. Open Recipe Dialog from Catalog Card
		this.container.on('click', '.btn-manage-recipe-card', function (e) {
			e.stopPropagation();
			let item_id = $(this).data('item-id');
			me.open_recipe_dialog(item_id);
		});

		// 9. Recipe View Search
		this.container.on('input', '#recipe-search-input', function () {
			clearTimeout(me.recipe_search_timer);
			let q = $(this).val();
			me.recipe_search_timer = setTimeout(() => {
				me.recipe_search = q;
				me.fetch_recipe_dashboard_data();
			}, 250);
		});

		// 10. Recipe View Filters
		this.container.on('change', '#recipe-status-filter', function () {
			me.recipe_status = $(this).val();
			me.fetch_recipe_dashboard_data();
		});

		this.container.on('change', '#recipe-category-filter', function () {
			me.recipe_category = $(this).val();
			me.fetch_recipe_dashboard_data();
		});

		this.container.on('click', '.btn-refresh-recipes', function () {
			me.fetch_recipe_dashboard_data();
		});

		// 11. Recipe View Card Actions
		this.container.on('click', '.btn-manage-dish-recipe', function () {
			let item_id = $(this).data('item-id');
			me.open_recipe_dialog(item_id);
		});

		this.container.on('click', '.btn-quick-approve-dish', function () {
			let item_id = $(this).data('item-id');
			let dishName = $(this).data('dish-name') || item_id;
			frappe.confirm(
				__('Approve recipe for "{0}"? Once approved, raw materials will automatically synchronize and deduct from Inventory on order confirmation.', [dishName]),
				function () {
					frappe.call({
						method: 'restaurant_management.restaurant_management.page.restaurant_menu_management.restaurant_menu_management.approve_dish_recipe',
						args: { item_id: item_id },
						callback: function (r) {
							if (r.message) {
								frappe.show_alert({
									message: __('Recipe for "{0}" approved successfully.', [dishName]),
									indicator: 'green'
								});
								me.fetch_recipe_dashboard_data();
								me.fetch_data();
							}
						}
					});
				}
			);
		});

		// 12. Clear Filters
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

	refresh_current_view() {
		if (this.current_view === 'recipes') {
			this.fetch_recipe_dashboard_data();
		} else {
			this.fetch_data();
		}
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

	fetch_recipe_dashboard_data() {
		let me = this;
		frappe.call({
			method: 'restaurant_management.restaurant_management.page.restaurant_menu_management.restaurant_menu_management.get_recipe_dashboard_data',
			args: {
				category: this.recipe_category,
				status: this.recipe_status,
				search: this.recipe_search
			},
			callback: function (r) {
				if (r.message) {
					me.recipe_data = r.message;
					me.render_recipe_dashboard();
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

		// Recipe status badge
		let recStatus = item.recipe_status || 'Draft';
		let recipeBadgeHtml = '';
		if (recStatus === 'Approved') {
			recipeBadgeHtml = `<span class="badge" style="background: #ecfdf5; color: #047857; font-weight: 600; padding: 2px 7px; border-radius: 4px; font-size: 0.75rem;"><i class="fa fa-check"></i> ${__('Approved Recipe')}</span>`;
		} else if (recStatus === 'Pending Approval') {
			recipeBadgeHtml = `<span class="badge" style="background: #fffbeb; color: #b45309; font-weight: 600; padding: 2px 7px; border-radius: 4px; font-size: 0.75rem;"><i class="fa fa-clock-o"></i> ${__('Pending Approval')}</span>`;
		} else {
			recipeBadgeHtml = `<span class="badge" style="background: #f1f5f9; color: #475569; font-weight: 600; padding: 2px 7px; border-radius: 4px; font-size: 0.75rem;"><i class="fa fa-pencil"></i> ${__('Draft Recipe')}</span>`;
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
						<div class="item-recipe-header" style="display: flex; justify-content: space-between; align-items: center;">
							<div style="display: flex; align-items: center; gap: 6px;">
								<span><i class="fa fa-flask"></i> ${__('Recipe:')}</span>
								${recipeBadgeHtml}
							</div>
							${stockHtml}
						</div>
						<div class="item-recipe-tags" style="margin-top: 6px; font-size: 0.8rem; color: #475569;">
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

					<div style="display: flex; gap: 6px;">
						<button type="button" class="btn btn-default btn-xs btn-manage-recipe-card" data-item-id="${item.item_id}" title="${__('Manage portions and recipe ingredients')}">
							<i class="fa fa-book"></i> ${__('Recipe')}
						</button>
						<button type="button" class="btn-edit-item" data-item-id="${item.item_id}">
							<i class="fa fa-pencil"></i> ${__('Edit Dish')}
						</button>
					</div>
				</div>
			</div>
		`;
	}

	render_recipe_dashboard() {
		if (!this.recipe_data) return;

		let summary = this.recipe_data.summary || {};
		this.container.find('#rkpi-total-dishes').text(summary.total_dishes || 0);
		this.container.find('#rkpi-approved').text(summary.approved_recipes || 0);
		this.container.find('#rkpi-pending').text(summary.awaiting_approval || 0);
		this.container.find('#rkpi-draft').text(summary.draft_recipes || 0);
		this.container.find('#rkpi-unmapped').text(summary.unmapped_ingredients || 0);
		this.container.find('#rkpi-incomplete').text(summary.incomplete_recipes || 0);

		// Nav badge
		let pendingTotal = (summary.awaiting_approval || 0) + (summary.draft_recipes || 0);
		this.container.find('#recipe-nav-kpi-badge').text(pendingTotal > 0 ? `${summary.approved_recipes}/${summary.total_dishes}` : 'All Approved');

		let $list = this.container.find('#recipe-dishes-container').empty();
		let dishes = this.recipe_data.dishes || [];

		if (dishes.length === 0) {
			$(`
				<div class="menu-empty-state">
					<i class="fa fa-search fa-3x"></i>
					<h4>${__('No Dishes Found')}</h4>
					<p>${__('No dishes match category "{0}" with status "{1}".', [this.recipe_category, this.recipe_status])}</p>
				</div>
			`).appendTo($list);
			return;
		}

		let html = `
			<div class="recipe-table-wrap">
				<table class="table recipe-dishes-table">
					<thead>
						<tr>
							<th style="width: 25%;">${__('Dish')}</th>
							<th style="width: 14%;">${__('Category')}</th>
							<th style="width: 14%;">${__('Portions Configured')}</th>
							<th style="width: 14%;">${__('Recipe Status')}</th>
							<th style="width: 21%;">${__('Raw Materials & Stock')}</th>
							<th style="width: 12%; text-align: right;">${__('Actions')}</th>
						</tr>
					</thead>
					<tbody>
		`;

		dishes.forEach(d => {
			let isVeg = d.is_veg;
			let dietMark = isVeg 
				? `<span style="display: inline-block; width: 10px; height: 10px; border-radius: 2px; border: 1.5px solid #16a34a; background: #fff; padding: 1px;"><span style="display: block; width: 4px; height: 4px; border-radius: 50%; background: #16a34a; margin: 1px auto;"></span></span>`
				: `<span style="display: inline-block; width: 10px; height: 10px; border-radius: 2px; border: 1.5px solid #dc2626; background: #fff; padding: 1px;"><span style="display: block; width: 4px; height: 4px; border-radius: 50%; background: #dc2626; margin: 1px auto;"></span></span>`;

			let statusPill = '';
			if (d.recipe_status === 'Approved') {
				statusPill = `<span class="badge" style="background: #ecfdf5; color: #047857; font-weight: 700; padding: 4px 9px; border-radius: 5px; font-size: 0.78rem;"><i class="fa fa-check"></i> Approved</span>`;
			} else if (d.recipe_status === 'Pending Approval') {
				statusPill = `<span class="badge" style="background: #fffbeb; color: #b45309; font-weight: 700; padding: 4px 9px; border-radius: 5px; font-size: 0.78rem; border: 1px dashed #f59e0b;"><i class="fa fa-clock-o"></i> Pending Approval</span>`;
			} else {
				statusPill = `<span class="badge" style="background: #f1f5f9; color: #475569; font-weight: 700; padding: 4px 9px; border-radius: 5px; font-size: 0.78rem; border: 1px solid #cbd5e1;"><i class="fa fa-pencil"></i> Draft (Unverified)</span>`;
			}

			let portionsPills = (d.portions || ['Regular']).map(p => `
				<span class="badge badge-light" style="background: #eef2ff; color: #4f46e5; font-weight: 600; padding: 2px 7px; border-radius: 4px; margin-right: 3px; font-size: 0.75rem;">${p}</span>
			`).join('');

			let unmappedPill = d.unmapped_count > 0 ? `<span class="badge badge-danger" style="background: #fef2f2; color: #b91c1c; font-size: 0.72rem; margin-left: 4px;">${d.unmapped_count} unmapped</span>` : '';

			let approveBtn = (d.recipe_status !== 'Approved' && d.has_ingredients) ? `
				<button type="button" class="btn btn-success btn-xs btn-quick-approve-dish" data-item-id="${d.item_id}" data-dish-name="${frappe.utils.escape_html(d.name)}" title="${__('Approve and activate stock deduction')}">
					<i class="fa fa-check"></i> Approve
				</button>
			` : '';

			html += `
				<tr class="recipe-row ${d.recipe_status === 'Approved' ? 'row-approved' : 'row-draft'}">
					<td>
						<div style="display: flex; align-items: center; gap: 10px;">
							<img src="${d.image || '/assets/restaurant_management/images/dishes/placeholder.jpg'}" style="width: 36px; height: 36px; border-radius: 6px; object-fit: cover;" onerror="this.onerror=null; this.src='/assets/restaurant_management/images/dishes/placeholder.jpg';" />
							<div>
								<div style="font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 5px;">
									${dietMark}
									<span>${frappe.utils.escape_html(d.name)}</span>
								</div>
								<div style="font-size: 0.75rem; color: #64748b;">${d.item_id} • ${d.formatted_price}</div>
							</div>
						</div>
					</td>
					<td>
						<span class="badge badge-secondary" style="background: #f8fafc; color: #334155; border: 1px solid #e2e8f0; font-size: 0.75rem; padding: 3px 7px;">${d.category}</span>
					</td>
					<td>
						${portionsPills}
					</td>
					<td>
						${statusPill}
					</td>
					<td>
						<div style="font-size: 0.8rem; color: #334155; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${frappe.utils.escape_html(d.ingredients_summary)}">
							${frappe.utils.escape_html(d.ingredients_summary)}
						</div>
						${unmappedPill}
					</td>
					<td style="text-align: right;">
						<div style="display: inline-flex; gap: 5px; align-items: center;">
							${approveBtn}
							<button type="button" class="btn btn-primary btn-xs btn-manage-dish-recipe" data-item-id="${d.item_id}" title="${__('Edit portions and recipe ingredients')}">
								<i class="fa fa-sliders"></i> ${__('Recipe & Portions')}
							</button>
						</div>
					</td>
				</tr>
			`;
		});

		html += `
					</tbody>
				</table>
			</div>
		`;

		$list.html(html);
	}

	open_recipe_dialog(itemId) {
		let me = this;
		frappe.call({
			method: 'restaurant_management.restaurant_management.page.restaurant_menu_management.restaurant_menu_management.get_dish_recipe',
			args: { item_id: itemId },
			callback: function (r) {
				if (r.message) {
					me.build_recipe_editor_dialog(r.message);
				}
			}
		});
	}

	build_recipe_editor_dialog(dish) {
		let me = this;
		let rec = dish.recipe_details || {};
		let currentStatus = rec.status || 'Draft';
		let availableInventory = dish.available_inventory || [];
		let portions = rec.portions || {};

		// Ensure Regular portion exists
		if (!portions['Regular']) {
			portions['Regular'] = {
				portion_name: 'Regular',
				is_default: true,
				wastage_pct: 0.0,
				ingredients: []
			};
		}

		let activePortion = 'Regular';

		let d = new frappe.ui.Dialog({
			title: __('Recipe & Portion Management: {0}', [dish.name]),
			size: 'large',
			fields: [
				{
					fieldname: 'recipe_header_html',
					fieldtype: 'HTML'
				},
				{
					fieldname: 'status_selector',
					fieldtype: 'Select',
					label: __('Recipe Approval Status'),
					options: ['Draft', 'Pending Approval', 'Approved'].join('\n'),
					default: currentStatus,
					reqd: 1
				},
				{
					fieldname: 'status_banner_html',
					fieldtype: 'HTML'
				},
				{
					fieldname: 'portions_editor_html',
					fieldtype: 'HTML'
				}
			],
			primary_action_label: __('Save & Approve Recipe'),
			primary_action: function () {
				saveRecipe(true);
			}
		});

		// Add secondary action buttons in dialog footer
		d.set_secondary_action(function () {
			saveRecipe(false);
		});
		d.get_close_btn().before(`
			<button type="button" class="btn btn-default btn-sm btn-save-draft" style="margin-right: 6px;">
				<i class="fa fa-save"></i> ${__('Save as Draft')}
			</button>
		`);

		d.$wrapper.find('.btn-save-draft').on('click', function () {
			d.set_value('status_selector', 'Draft');
			saveRecipe(false);
		});

		// Header HTML
		let $header = d.get_field('recipe_header_html').$wrapper;
		$header.html(`
			<div style="display: flex; align-items: center; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px;">
				<div style="display: flex; align-items: center; gap: 12px;">
					<img src="${dish.image || '/assets/restaurant_management/images/dishes/placeholder.jpg'}" style="width: 48px; height: 48px; border-radius: 6px; object-fit: cover;" onerror="this.onerror=null; this.src='/assets/restaurant_management/images/dishes/placeholder.jpg';" />
					<div>
						<h4 style="margin: 0; font-weight: 700; color: #1e293b;">${dish.name}</h4>
						<div style="font-size: 0.8rem; color: #64748b;">${dish.category} • ₹${dish.price} • ID: ${dish.item_id}</div>
					</div>
				</div>
				<div>
					<span class="badge" style="background: #e0e7ff; color: #4338ca; padding: 4px 8px; font-weight: 600; border-radius: 4px;">
						<i class="fa fa-database"></i> ${__('Connected to Inventory')}
					</span>
				</div>
			</div>
		`);

		// Status Banner Update
		let $banner = d.get_field('status_banner_html').$wrapper;
		function updateBanner(st) {
			if (st === 'Approved') {
				$banner.html(`
					<div class="alert alert-success" style="background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; padding: 8px 14px; border-radius: 6px; margin-bottom: 14px; font-size: 0.82rem;">
						<i class="fa fa-check-circle" style="color: #059669;"></i> <strong>Approved Recipe:</strong> Raw materials are confirmed. This recipe will automatically deduct exact quantities from Inventory and appear as confirmed requirements in KDS.
					</div>
				`);
				d.get_primary_btn().text(__('Save & Keep Approved'));
			} else if (st === 'Pending Approval') {
				$banner.html(`
					<div class="alert alert-warning" style="background: #fffbeb; border: 1px solid #fde68a; color: #92400e; padding: 8px 14px; border-radius: 6px; margin-bottom: 14px; font-size: 0.82rem;">
						<i class="fa fa-clock-o" style="color: #d97706;"></i> <strong>Pending Approval:</strong> Recipe measurements are undergoing culinary review. Inventory will NOT be deducted until signed off.
					</div>
				`);
				d.get_primary_btn().text(__('Approve Recipe'));
			} else {
				$banner.html(`
					<div class="alert alert-info" style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #334155; padding: 8px 14px; border-radius: 6px; margin-bottom: 14px; font-size: 0.82rem;">
						<i class="fa fa-pencil" style="color: #64748b;"></i> <strong>Draft Recipe:</strong> Suggested quantities are unverified. Inventory deduction is strictly blocked until approved.
					</div>
				`);
				d.get_primary_btn().text(__('Approve Recipe'));
			}
		}

		d.fields_dict.status_selector.$input.on('change', function () {
			updateBanner($(this).val());
		});
		updateBanner(currentStatus);

		// Portions Editor HTML
		let $editor = d.get_field('portions_editor_html').$wrapper;
		function renderPortionsUi() {
			let portionKeys = Object.keys(portions);
			let portionTabsHtml = portionKeys.map(k => `
				<button type="button" class="btn btn-sm ${k === activePortion ? 'btn-primary' : 'btn-default'} btn-portion-tab" data-portion="${k}" style="margin-right: 4px; font-weight: 600;">
					${k} ${portions[k].is_default ? '<span style="font-size: 0.7rem; opacity: 0.8;">(Default)</span>' : ''}
				</button>
			`).join('');

			let pData = portions[activePortion] || { ingredients: [], wastage_pct: 0.0 };

			// Build ingredient rows
			let ingRowsHtml = '';
			(pData.ingredients || []).forEach((ing, idx) => {
				let invOptions = `<option value="">-- ${__('Unmapped Ingredient')} --</option>`;
				availableInventory.forEach(iv => {
					let isSelected = (ing.inventory_item_code === iv.item_code) || (ing.ingredient_name && ing.ingredient_name.toLowerCase() === iv.name.toLowerCase());
					invOptions += `<option value="${iv.item_code}" data-name="${frappe.utils.escape_html(iv.name)}" data-unit="${iv.unit}" ${isSelected ? 'selected' : ''}>[${iv.item_code}] ${iv.name} (${iv.stock_qty} ${iv.unit} in stock)</option>`;
				});

				let unitOptions = ['g', 'kg', 'ml', 'litre', 'piece', 'pcs'].map(u => `
					<option value="${u}" ${ing.unit === u ? 'selected' : ''}>${u}</option>
				`).join('');

				let mapPill = ing.is_mapped 
					? `<span class="badge badge-success" style="background: #ecfdf5; color: #047857; font-size: 0.72rem;"><i class="fa fa-link"></i> Mapped</span>`
					: `<span class="badge badge-warning" style="background: #fffbeb; color: #b45309; font-size: 0.72rem;"><i class="fa fa-chain-broken"></i> Unmapped</span>`;

				ingRowsHtml += `
					<tr class="recipe-ing-row" data-idx="${idx}">
						<td>
							<input type="text" class="form-control ing-name-input input-sm" placeholder="Ingredient name (e.g. Maida)" value="${frappe.utils.escape_html(ing.ingredient_name || '')}" />
						</td>
						<td>
							<select class="form-control ing-inv-select input-sm">
								${invOptions}
							</select>
						</td>
						<td>
							<input type="number" step="0.001" min="0" class="form-control ing-qty-input input-sm" placeholder="Qty" value="${ing.quantity || 0}" />
						</td>
						<td>
							<select class="form-control ing-unit-select input-sm">
								${unitOptions}
							</select>
						</td>
						<td>
							<input type="number" step="0.1" min="0" max="100" class="form-control ing-wastage-input input-sm" placeholder="0%" value="${ing.wastage_pct || 0}" />
						</td>
						<td style="text-align: center; vertical-align: middle;">
							${mapPill}
						</td>
						<td style="text-align: center; vertical-align: middle;">
							<button type="button" class="btn btn-default btn-xs btn-remove-ing" style="color: #dc2626;" title="${__('Remove ingredient')}">
								<i class="fa fa-trash"></i>
							</button>
						</td>
					</tr>
				`;
			});

			$editor.html(`
				<div class="recipe-portion-editor-box" style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
					<!-- Portion Bar -->
					<div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 14px;">
						<div style="display: flex; align-items: center; gap: 4px;">
							<strong style="color: #475569; font-size: 0.85rem; margin-right: 6px;">${__('Portions:')}</strong>
							${portionTabsHtml}
							<button type="button" class="btn btn-default btn-xs btn-add-portion" style="margin-left: 6px;">
								<i class="fa fa-plus"></i> ${__('Add Portion')}
							</button>
						</div>
						<div style="display: flex; align-items: center; gap: 8px;">
							<label style="font-size: 0.8rem; color: #475569; margin: 0;">${__('Prep Wastage %:')}</label>
							<input type="number" step="0.5" min="0" max="100" class="form-control portion-wastage-input input-sm" style="width: 70px; display: inline-block;" value="${pData.wastage_pct || 0}" />
						</div>
					</div>

					<!-- Ingredients Table -->
					<table class="table table-bordered table-condensed recipe-ingredients-table" style="font-size: 0.82rem; margin-bottom: 10px;">
						<thead>
							<tr style="background: #f8fafc; color: #475569;">
								<th style="width: 25%;">${__('Ingredient Name')}</th>
								<th style="width: 33%;">${__('Linked Inventory Item')}</th>
								<th style="width: 12%;">${__('Qty')}</th>
								<th style="width: 12%;">${__('Unit')}</th>
								<th style="width: 8%;">${__('Wastage %')}</th>
								<th style="width: 6%; text-align: center;">${__('Status')}</th>
								<th style="width: 4%; text-align: center;"></th>
							</tr>
						</thead>
						<tbody class="recipe-ingredients-tbody">
							${ingRowsHtml || `<tr><td colspan="7" style="text-align: center; color: #94a3b8; font-style: italic; padding: 16px;">${__('No ingredients added for this portion yet. Click "+ Add Ingredient" below.')}</td></tr>`}
						</tbody>
					</table>

					<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
						<button type="button" class="btn btn-default btn-sm btn-add-ing-row" style="color: #4f46e5; font-weight: 600;">
							<i class="fa fa-plus"></i> ${__('Add Ingredient')}
						</button>
						<span style="font-size: 0.75rem; color: #64748b;">
							<i class="fa fa-info-circle"></i> ${__('Unit conversions (e.g. 120 g -> 0.12 kg) are calculated automatically on inventory deduction.')}
						</span>
					</div>
				</div>
			`);

			// Bind Events inside editor
			$editor.find('.btn-portion-tab').on('click', function () {
				collectActivePortionData();
				activePortion = $(this).data('portion');
				renderPortionsUi();
			});

			$editor.find('.btn-add-portion').on('click', function () {
				frappe.prompt(
					{
						label: __('Portion Name (e.g. Half, Full, Single, Large)'),
						fieldname: 'portion_name',
						fieldtype: 'Data',
						reqd: 1
					},
					function (val) {
						let name = (val.portion_name || '').trim();
						if (name && !portions[name]) {
							collectActivePortionData();
							// Clone ingredients from active portion as starter
							let currentIngs = copyIngredients(portions[activePortion].ingredients);
							portions[name] = {
								portion_name: name,
								is_default: false,
								wastage_pct: portions[activePortion].wastage_pct || 0.0,
								ingredients: currentIngs
							};
							activePortion = name;
							renderPortionsUi();
						}
					},
					__('Add New Portion')
				);
			});

			$editor.find('.btn-add-ing-row').on('click', function () {
				collectActivePortionData();
				portions[activePortion].ingredients.push({
					ingredient_name: '',
					inventory_item_code: '',
					quantity: 10.0,
					unit: 'g',
					wastage_pct: 0.0,
					is_mapped: false
				});
				renderPortionsUi();
			});

			$editor.find('.btn-remove-ing').on('click', function () {
				let idx = $(this).closest('.recipe-ing-row').data('idx');
				portions[activePortion].ingredients.splice(idx, 1);
				renderPortionsUi();
			});

			// Auto-fill ingredient name when inventory item selected
			$editor.find('.ing-inv-select').on('change', function () {
				let $row = $(this).closest('.recipe-ing-row');
				let $opt = $(this).find('option:selected');
				let optName = $opt.data('name');
				let optUnit = $opt.data('unit');
				if (optName && !$row.find('.ing-name-input').val().trim()) {
					$row.find('.ing-name-input').val(optName);
				}
				if (optUnit) {
					$row.find('.ing-unit-select').val(optUnit === 'kg' ? 'g' : (optUnit === 'ltr' ? 'ml' : optUnit));
				}
			});
		}

		function copyIngredients(ings) {
			return (ings || []).map(i => Object.assign({}, i));
		}

		function collectActivePortionData() {
			if (!portions[activePortion]) return;
			let p = portions[activePortion];
			p.wastage_pct = parseFloat($editor.find('.portion-wastage-input').val() || 0);

			let ings = [];
			$editor.find('.recipe-ing-row').each(function () {
				let name = $(this).find('.ing-name-input').val().trim();
				let code = $(this).find('.ing-inv-select').val();
				let qty = parseFloat($(this).find('.ing-qty-input').val() || 0);
				let unit = $(this).find('.ing-unit-select').val();
				let wastage = parseFloat($(this).find('.ing-wastage-input').val() || 0);
				if (name) {
					ings.push({
						ingredient_name: name,
						inventory_item_code: code || '',
						quantity: qty,
						unit: unit || 'g',
						wastage_pct: wastage,
						is_mapped: !!code
					});
				}
			});
			p.ingredients = ings;
		}

		function saveRecipe(isApprove) {
			collectActivePortionData();
			let selectedStatus = isApprove ? 'Approved' : d.get_value('status_selector');

			// Validate if approving
			let hasAnyIng = false;
			Object.values(portions).forEach(p => {
				if (p.ingredients && p.ingredients.length > 0) hasAnyIng = true;
			});

			if (selectedStatus === 'Approved' && !hasAnyIng) {
				frappe.msgprint(__('Cannot approve a recipe with zero ingredients. Please add at least one ingredient.'));
				return;
			}

			let recipeData = {
				status: selectedStatus,
				portions: portions,
				wastage_pct: parseFloat($editor.find('.portion-wastage-input').val() || 0)
			};

			frappe.call({
				method: 'restaurant_management.restaurant_management.page.restaurant_menu_management.restaurant_menu_management.save_dish_recipe',
				args: {
					item_id: dish.item_id,
					recipe_data: JSON.stringify(recipeData),
					approve: selectedStatus === 'Approved' ? 1 : 0
				},
				callback: function (r) {
					if (r.message) {
						frappe.show_alert({
							message: selectedStatus === 'Approved'
								? __('Recipe for "{0}" approved and synchronized.', [dish.name])
								: __('Recipe for "{0}" saved as {1}.', [dish.name, selectedStatus]),
							indicator: selectedStatus === 'Approved' ? 'green' : 'blue'
						});
						d.hide();
						me.fetch_recipe_dashboard_data();
						me.fetch_data();
					}
				}
			});
		}

		renderPortionsUi();
		d.show();
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
			}
		];

		let d = new frappe.ui.Dialog({
			title: isEdit ? __('Edit Menu Item: {0}', [item.item_id]) : __('Add New Menu Item'),
			fields: fields,
			primary_action_label: isEdit ? __('Save Changes') : __('Add Dish'),
			primary_action: function (values) {
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
						recipe: isEdit ? JSON.stringify(item.recipe || {}) : '{}',
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
						<i class="fa fa-camera fa-2x text-muted"></i>
						<span class="text-muted small">${__('No image uploaded')}</span>
					</div>
				</div>
				<div class="dish-dialog-photo-controls">
					<input type="text" class="form-control" id="dish-dialog-image-url" placeholder="${__('Paste image asset path or URL...')}" value="${currentImage}" />
					<div class="dish-dialog-btn-row">
						<label class="btn btn-default btn-sm btn-file-upload">
							<i class="fa fa-upload"></i> ${__('Upload Local File')}
							<input type="file" id="dish-file-input" accept="image/*" style="display: none;" />
						</label>
						<button type="button" class="btn btn-default btn-sm btn-clear-photo" style="${currentImage ? '' : 'display:none;'}">
							<i class="fa fa-trash"></i> ${__('Remove')}
						</button>
					</div>
					<small class="text-muted">${__('Supports JPG, PNG, WEBP. Local files are uploaded and saved to site assets.')}</small>
				</div>
			</div>
		`;
		$photoWrapper.html(photoHtml);

		// Event handlers for photo upload
		let $previewImg = $photoWrapper.find('#dish-dialog-preview-img');
		let $placeholder = $photoWrapper.find('#dish-dialog-preview-placeholder');
		let $urlInput = $photoWrapper.find('#dish-dialog-image-url');
		let $clearBtn = $photoWrapper.find('.btn-clear-photo');

		$urlInput.on('input', function () {
			let val = $(this).val().trim();
			if (val) {
				$previewImg.attr('src', val).show();
				$placeholder.hide();
				$clearBtn.show();
			} else {
				$previewImg.hide();
				$placeholder.show();
				$clearBtn.hide();
			}
		});

		$photoWrapper.find('#dish-file-input').on('change', function (e) {
			let file = e.target.files[0];
			if (!file) return;

			let reader = new FileReader();
			reader.onload = function (uploadEvent) {
				let dataUrl = uploadEvent.target.result;
				frappe.call({
					method: 'restaurant_management.restaurant_management.page.restaurant_menu_management.restaurant_menu_management.upload_dish_image',
					args: {
						filename: file.name,
						filedata: dataUrl
					},
					callback: function (r) {
						if (r.message) {
							let newUrl = r.message;
							$urlInput.val(newUrl);
							$previewImg.attr('src', newUrl).show();
							$placeholder.hide();
							$clearBtn.show();
							frappe.show_alert({
								message: __('Image uploaded successfully.'),
								indicator: 'green'
							});
						}
					}
				});
			};
			reader.readAsDataURL(file);
		});

		$clearBtn.on('click', function () {
			$urlInput.val('');
			$previewImg.hide();
			$placeholder.show();
			$(this).hide();
		});

		d.show();
	}
}
