/**
 * ============================================================
 * 11 AVATAR SMEs CRM - SPA ROUTER
 * ============================================================
 * 
 * @file       js/router.js
 * @path       C:\Users\rudra\Downloads\11 Avatar\11-Avatar-SMEs-CRM-main\js\router.js
 * @author     11 Avatar Digital Hub
 * @email      info@11avatardigitalhub.cloud
 * @repo       https://github.com/11avatardigitalhub/11Avatar-SMEs-CRM.git
 * 
 * PURPOSE:
 * Hash-based Single Page Application router for internal app.
 * Handles module navigation, sub-routes, query parameters,
 * route guards (auth/RBAC), lazy module loading, breadcrumbs,
 * and browser history management.
 * 
 * DEPENDENCIES:
 * - js/config.js (CRM_Config)
 * - js/auth.js (CRM_Auth) - for route guards
 * - js/tenant.js (CRM_Tenant) - optional, for RBAC
 * 
 * RULES COMPLIANCE:
 * ✅ Rule #1  - Enterprise Grade
 * ✅ Rule #2  - One File At A Time
 * ✅ Rule #5  - Deep Detailing: full JSDoc
 * ✅ Rule #6  - Error Handling: try/catch everywhere
 * ✅ Rule #10 - Page-Specific Sub Menu (dynamic per route)
 * ✅ Rule #17 - Multi-Tenant RBAC route guards
 * ✅ Rule #20 - Export All: window.CRM_Router
 * ✅ Rule #21 - Path First
 * ✅ Rule #23 - 300+ lines
 * ✅ Rule #25 - Full File Replacement
 * ============================================================
 */

'use strict';

/**
 * @namespace CRM_Router
 * @description Hash-based SPA Router for 11 Avatar SMEs CRM
 */
const CRM_Router = (function() {
    'use strict';

    // ============================================================
    // PRIVATE STATE
    // ============================================================
    /** @type {Array<Object>} Registered routes */
    const _routes = [];

    /** @type {Object|null} Current active route */
    let _currentRoute = null;

    /** @type {Object|null} Previous route */
    let _previousRoute = null;

    /** @type {Array<Object>} Navigation history stack */
    const _historyStack = [];

    /** @type {Array<Function>} Route change listeners */
    const _routeListeners = [];

    /** @type {Array<Function>} Route guards */
    const _globalGuards = [];

    /** @type {boolean} Whether router is initialized */
    let _initialized = false;

    /** @type {boolean} Whether a navigation is in progress */
    let _navigating = false;

    /** @type {Object} Route param regex cache */
    const _paramRegexCache = {};

    // ============================================================
    // CONSTANTS
    // ============================================================
    const ROUTER_MODE = 'hash'; // 'hash' | 'history'
    const DEFAULT_ROUTE = '/dashboard';
    const NOT_FOUND_ROUTE = '/404';
    const UNAUTHORIZED_ROUTE = '/unauthorized';
    const LOGIN_ROUTE = '/login';

    // ============================================================
    // ROUTE DEFINITIONS
    // ============================================================
    /**
     * Default route definitions for all 15 modules
     * Each module can register additional sub-routes
     */
    const DEFAULT_ROUTES = [
        // Dashboard
        { path: '/dashboard', module: 'dashboard', title: 'Dashboard', icon: '📊', authRequired: true, roles: ['*'] },
        { path: '/', redirect: '/dashboard' },

        // Leads
        { path: '/leads', module: 'leads', title: 'Leads', icon: '👥', authRequired: true },
        { path: '/leads/new', module: 'leads', title: 'New Lead', action: 'new', authRequired: true },
        { path: '/leads/:id', module: 'leads', title: 'Lead Detail', action: 'view', authRequired: true },
        { path: '/leads/:id/edit', module: 'leads', title: 'Edit Lead', action: 'edit', authRequired: true },
        { path: '/leads/import', module: 'leads', title: 'Import Leads', action: 'import', authRequired: true, roles: ['TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER'] },

        // Pipeline
        { path: '/pipeline', module: 'pipeline', title: 'Pipeline', icon: '📈', authRequired: true },
        { path: '/pipeline/board', module: 'pipeline', title: 'Kanban Board', action: 'board', authRequired: true },
        { path: '/pipeline/list', module: 'pipeline', title: 'List View', action: 'list', authRequired: true },

        // Clients
        { path: '/clients', module: 'clients', title: 'Clients', icon: '🏢', authRequired: true },
        { path: '/clients/:id', module: 'clients', title: 'Client Detail', action: 'view', authRequired: true },

        // Invoices
        { path: '/invoices', module: 'invoices', title: 'Invoices', icon: '🧾', authRequired: true },
        { path: '/invoices/new', module: 'invoices', title: 'New Invoice', action: 'new', authRequired: true },
        { path: '/invoices/:id', module: 'invoices', title: 'Invoice Detail', action: 'view', authRequired: true },
        { path: '/invoices/:id/edit', module: 'invoices', title: 'Edit Invoice', action: 'edit', authRequired: true },

        // Payments
        { path: '/payments', module: 'payments', title: 'Payments', icon: '💰', authRequired: true },
        { path: '/payments/new', module: 'payments', title: 'Record Payment', action: 'new', authRequired: true },

        // Tasks
        { path: '/tasks', module: 'tasks', title: 'Tasks', icon: '✅', authRequired: true },
        { path: '/tasks/kanban', module: 'tasks', title: 'Task Board', action: 'kanban', authRequired: true },
        { path: '/tasks/calendar', module: 'tasks', title: 'Task Calendar', action: 'calendar', authRequired: true },

        // Projects
        { path: '/projects', module: 'projects', title: 'Projects', icon: '🚀', authRequired: true },
        { path: '/projects/:id', module: 'projects', title: 'Project Detail', action: 'view', authRequired: true },

        // Retainers
        { path: '/retainers', module: 'retainers', title: 'Retainers', icon: '🔄', authRequired: true },

        // WhatsApp
        { path: '/whatsapp', module: 'whatsapp', title: 'WhatsApp', icon: '💬', authRequired: true },
        { path: '/whatsapp/chat/:id', module: 'whatsapp', title: 'Chat', action: 'chat', authRequired: true },
        { path: '/whatsapp/templates', module: 'whatsapp', title: 'Templates', action: 'templates', authRequired: true },

        // Training
        { path: '/training', module: 'training', title: 'Training', icon: '🎓', authRequired: true },
        { path: '/training/courses/:id', module: 'training', title: 'Course Detail', action: 'view', authRequired: true },

        // Referrals
        { path: '/referrals', module: 'referrals', title: 'Referrals', icon: '🔗', authRequired: true },

        // Reports
        { path: '/reports', module: 'reports', title: 'Reports', icon: '📋', authRequired: true },
        { path: '/reports/:type', module: 'reports', title: 'Report', action: 'view', authRequired: true },

        // Notifications
        { path: '/notifications', module: 'notifications', title: 'Notifications', icon: '🔔', authRequired: true },

        // Appointments
        { path: '/appointments', module: 'appointments', title: 'Appointments', icon: '📅', authRequired: true },

        // Settings
        { path: '/settings', module: 'settings', title: 'Settings', icon: '⚙️', authRequired: true, roles: ['TENANT_ADMIN', 'SUB_ADMIN'] },
        { path: '/settings/organization', module: 'settings', title: 'Organization', action: 'org', authRequired: true, roles: ['TENANT_ADMIN'] },
        { path: '/settings/team', module: 'settings', title: 'Team Management', action: 'team', authRequired: true, roles: ['TENANT_ADMIN', 'SUB_ADMIN'] },
        { path: '/settings/billing', module: 'settings', title: 'Billing', action: 'billing', authRequired: true, roles: ['TENANT_ADMIN'] },
        { path: '/settings/integrations', module: 'settings', title: 'Integrations', action: 'integrations', authRequired: true, roles: ['TENANT_ADMIN'] },

        // System
        { path: '/404', module: null, title: 'Page Not Found', authRequired: false },
        { path: '/unauthorized', module: null, title: 'Unauthorized', authRequired: false },
        { path: '*', redirect: '/404' },
    ];

    // ============================================================
    // SUB-MENU DEFINITIONS (Rule #10)
    // ============================================================
    /**
     * Module-specific sub-menu items
     * Keyed by module name, displayed in app submenu bar
     */
    const SUBMENUS = {
        dashboard: [
            { label: 'Overview', action: 'overview', icon: '📊' },
            { label: 'Recent Activity', action: 'recent', icon: '🕐' },
            { label: 'Quick Actions', action: 'actions', icon: '⚡' },
        ],
        leads: [
            { label: 'All Leads', action: 'list', icon: '📋' },
            { label: 'Add Lead', action: 'new', icon: '➕' },
            { label: 'Import', action: 'import', icon: '📥' },
            { label: 'Export', action: 'export', icon: '📤' },
            { label: 'Bulk Actions', action: 'bulk', icon: '📦' },
        ],
        pipeline: [
            { label: 'Kanban Board', action: 'board', icon: '📋' },
            { label: 'List View', action: 'list', icon: '📄' },
            { label: 'Forecast', action: 'forecast', icon: '📈' },
            { label: 'Deal Analytics', action: 'analytics', icon: '📊' },
        ],
        clients: [
            { label: 'All Clients', action: 'list', icon: '👥' },
            { label: 'Active', action: 'active', icon: '✅' },
            { label: 'Inactive', action: 'inactive', icon: '⏸️' },
            { label: 'Add Client', action: 'new', icon: '➕' },
        ],
        invoices: [
            { label: 'All Invoices', action: 'list', icon: '📋' },
            { label: 'Create New', action: 'new', icon: '➕' },
            { label: 'Pending', action: 'pending', icon: '⏳' },
            { label: 'Paid', action: 'paid', icon: '✅' },
            { label: 'Overdue', action: 'overdue', icon: '⚠️' },
        ],
        payments: [
            { label: 'All Payments', action: 'list', icon: '📋' },
            { label: 'Record Payment', action: 'new', icon: '➕' },
            { label: 'UPI Transactions', action: 'upi', icon: '📱' },
            { label: 'Reconciliation', action: 'reconcile', icon: '🔄' },
        ],
        tasks: [
            { label: 'My Tasks', action: 'mine', icon: '👤' },
            { label: 'Team Tasks', action: 'team', icon: '👥' },
            { label: 'Calendar View', action: 'calendar', icon: '📅' },
            { label: 'Kanban Board', action: 'kanban', icon: '📋' },
        ],
        projects: [
            { label: 'All Projects', action: 'list', icon: '📋' },
            { label: 'Gantt Chart', action: 'gantt', icon: '📊' },
            { label: 'Milestones', action: 'milestones', icon: '🎯' },
        ],
        retainers: [
            { label: 'Active', action: 'active', icon: '✅' },
            { label: 'Expiring Soon', action: 'expiring', icon: '⚠️' },
            { label: 'Auto-Invoice Log', action: 'invoices', icon: '📄' },
        ],
        whatsapp: [
            { label: 'Chat', action: 'chat', icon: '💬' },
            { label: 'Templates', action: 'templates', icon: '📝' },
            { label: 'Broadcast', action: 'broadcast', icon: '📢' },
            { label: 'Automation', action: 'automation', icon: '🤖' },
        ],
        training: [
            { label: 'Courses', action: 'courses', icon: '📚' },
            { label: 'Students', action: 'students', icon: '👨‍🎓' },
            { label: 'Assessments', action: 'assessments', icon: '📝' },
            { label: 'Certificates', action: 'certificates', icon: '🏆' },
        ],
        referrals: [
            { label: 'Partners', action: 'partners', icon: '🤝' },
            { label: 'Commissions', action: 'commissions', icon: '💰' },
            { label: 'Payouts', action: 'payouts', icon: '💸' },
        ],
        reports: [
            { label: 'Revenue Report', action: 'revenue', icon: '💰' },
            { label: 'Lead Report', action: 'leads', icon: '👥' },
            { label: 'Team Report', action: 'team', icon: '👥' },
            { label: 'Custom Report', action: 'custom', icon: '⚙️' },
            { label: 'Scheduled', action: 'scheduled', icon: '🕐' },
        ],
        notifications: [
            { label: 'Inbox', action: 'inbox', icon: '📥' },
            { label: 'Settings', action: 'settings', icon: '⚙️' },
            { label: 'Channels', action: 'channels', icon: '📡' },
        ],
        appointments: [
            { label: 'Calendar', action: 'calendar', icon: '📅' },
            { label: 'Schedule New', action: 'new', icon: '➕' },
            { label: 'Pending', action: 'pending', icon: '⏳' },
            { label: 'History', action: 'history', icon: '📜' },
        ],
        settings: [
            { label: 'Organization', action: 'org', icon: '🏢' },
            { label: 'Team & Roles', action: 'team', icon: '👥' },
            { label: 'Billing', action: 'billing', icon: '💳' },
            { label: 'Integrations', action: 'integrations', icon: '🔌' },
            { label: 'Security', action: 'security', icon: '🔒' },
            { label: 'API Keys', action: 'api', icon: '🔑' },
        ],
    };

    // ============================================================
    // BREADCRUMB GENERATOR
    // ============================================================
    /**
     * Generate breadcrumbs from current path
     * @param {string} path - Current route path
     * @returns {Array<Object>} Breadcrumb items
     */
    function _generateBreadcrumbs(path) {
        try {
            const parts = path.split('/').filter(Boolean);
            const breadcrumbs = [];
            let accumulatedPath = '';

            // Always start with Dashboard
            breadcrumbs.push({
                label: 'Dashboard',
                path: '/dashboard',
                icon: '📊',
            });

            if (parts.length === 0 || (parts.length === 1 && parts[0] === 'dashboard')) {
                return breadcrumbs;
            }

            parts.forEach((part, index) => {
                accumulatedPath += '/' + part;
                const route = _findRoute(accumulatedPath);

                // Skip if it's a dynamic param
                if (route) {
                    breadcrumbs.push({
                        label: route.title || part,
                        path: accumulatedPath,
                        icon: route.icon || null,
                    });
                } else {
                    // Check if it's an ID (numeric or alphanumeric hash)
                    const isId = /^[a-zA-Z0-9_-]{6,}$/.test(part) || /^\d+$/.test(part);
                    breadcrumbs.push({
                        label: isId ? `#${part.substring(0, 8)}...` : part.charAt(0).toUpperCase() + part.slice(1),
                        path: accumulatedPath,
                        icon: null,
                    });
                }
            });

            return breadcrumbs;
        } catch (error) {
            console.error('[CRM_Router] Breadcrumb error:', error);
            return [{ label: 'Dashboard', path: '/dashboard', icon: '📊' }];
        }
    }

    // ============================================================
    // ROUTE MATCHING
    // ============================================================
    /**
     * Convert route path pattern to regex
     * @param {string} path - Route path like '/leads/:id'
     * @returns {RegExp} Compiled regex
     */
    function _pathToRegex(path) {
        if (_paramRegexCache[path]) return _paramRegexCache[path];
        const pattern = path
            .replace(/\//g, '\\/')
            .replace(/:(\w+)/g, '(?<$1>[^/]+)')
            .replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        _paramRegexCache[path] = regex;
        return regex;
    }

    /**
     * Extract params from matched route
     * @param {string} path - Route path pattern
     * @param {string} currentPath - Current URL path
     * @returns {Object} Extracted params
     */
    function _extractParams(path, currentPath) {
        try {
            const regex = _pathToRegex(path);
            const match = currentPath.match(regex);
            if (!match) return {};
            return match.groups || {};
        } catch (error) {
            console.error('[CRM_Router] Param extraction error:', error);
            return {};
        }
    }

    /**
     * Find matching route for a given path
     * @param {string} path - URL path to match
     * @returns {Object|null} Matched route or null
     */
    function _findRoute(path) {
        // Normalize path
        const normalizedPath = path === '/' ? DEFAULT_ROUTE : path;

        // Sort routes: static paths first, then dynamic, then wildcards
        const sortedRoutes = [..._routes].sort((a, b) => {
            const aDynamic = a.path.includes(':') ? 1 : 0;
            const bDynamic = b.path.includes(':') ? 1 : 0;
            const aWildcard = a.path.includes('*') ? 2 : 0;
            const bWildcard = b.path.includes('*') ? 2 : 0;
            return (aDynamic + aWildcard) - (bDynamic + bWildcard);
        });

        for (const route of sortedRoutes) {
            if (route.path === normalizedPath) {
                return { ...route, params: {} };
            }
            if (route.path.includes(':') || route.path.includes('*')) {
                const regex = _pathToRegex(route.path);
                if (regex.test(normalizedPath)) {
                    const params = _extractParams(route.path, normalizedPath);
                    return { ...route, params };
                }
            }
        }
        return null;
    }

    // ============================================================
    // ROUTE GUARDS
    // ============================================================
    /**
     * Check if user can access a route
     * @param {Object} route - Route object
     * @returns {boolean} Whether access is allowed
     */
    function _checkRouteAccess(route) {
        try {
            // No auth required
            if (!route.authRequired) return true;

            // Check if CRM_Auth is available
            if (!window.CRM_Auth) {
                console.warn('[CRM_Router] CRM_Auth not loaded - allowing access.');
                return true;
            }

            // Check authentication
            if (!window.CRM_Auth.isAuthenticated()) {
                return false;
            }

            // Check role restrictions
            if (route.roles && route.roles.length > 0 && !route.roles.includes('*')) {
                const userRole = window.CRM_Auth.getUserRole();
                if (!route.roles.includes(userRole)) {
                    return false;
                }
            }

            // Check module access via RBAC
            if (route.module && window.CRM_Auth.canAccessModule) {
                if (!window.CRM_Auth.canAccessModule(route.module)) {
                    return false;
                }
            }

            return true;
        } catch (error) {
            console.error('[CRM_Router] Route access check error:', error);
            return true; // Fail open in case of error
        }
    }

    /**
     * Run global route guards
     * @param {Object} to - Target route
     * @param {Object} from - Current route
     * @returns {boolean} Whether navigation is allowed
     */
    function _runGuards(to, from) {
        for (const guard of _globalGuards) {
            try {
                const result = guard(to, from);
                if (result === false) return false;
                if (typeof result === 'string') {
                    // Redirect
                    navigate(result);
                    return false;
                }
            } catch (error) {
                console.error('[CRM_Router] Guard error:', error);
            }
        }
        return true;
    }

    // ============================================================
    // NAVIGATION ENGINE
    // ============================================================
    /**
     * Navigate to a route
     * @param {string} path - Target path (e.g., '/leads/new')
     * @param {Object} [options] - Navigation options
     * @param {Object} [options.query] - Query parameters
     * @param {boolean} [options.replace=false] - Replace history instead of push
     * @param {boolean} [options.silent=false] - Don't trigger listeners
     * @param {Object} [options.state] - Additional state data
     * @returns {Promise<boolean>} Whether navigation was successful
     */
    async function navigate(path, options = {}) {
        try {
            if (_navigating) {
                console.warn('[CRM_Router] Navigation already in progress.');
                return false;
            }

            _navigating = true;
            const { query = {}, replace = false, silent = false, state = {} } = options;

            // Normalize path
            let targetPath = path;
            if (!targetPath.startsWith('/')) targetPath = '/' + targetPath;

            // Find route
            let route = _findRoute(targetPath);

            // Handle redirects
            if (route && route.redirect) {
                _navigating = false;
                return navigate(route.redirect, options);
            }

            // Handle 404
            if (!route) {
                route = _findRoute(NOT_FOUND_ROUTE) || { path: NOT_FOUND_ROUTE, module: null, title: 'Page Not Found', params: {} };
            }

            // Merge params
            route = { ...route, query, state };

            // Run guards
            if (!_runGuards(route, _currentRoute)) {
                _navigating = false;
                return false;
            }

            // Check auth
            if (route.authRequired && window.CRM_Auth && !window.CRM_Auth.isAuthenticated()) {
                _navigating = false;
                navigate(LOGIN_ROUTE, { query: { redirect: targetPath } });
                return false;
            }

            // Check route access
            if (!_checkRouteAccess(route)) {
                _navigating = false;
                navigate(UNAUTHORIZED_ROUTE);
                return false;
            }

            // Build full URL with query
            let fullPath = route.path;
            if (Object.keys(query).length > 0) {
                const queryString = Object.entries(query)
                    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
                    .join('&');
                fullPath += '?' + queryString;
            }

            // Update browser URL
            if (ROUTER_MODE === 'hash') {
                const hash = '#!' + fullPath;
                if (replace) {
                    window.history.replaceState({ route: fullPath, ...state }, '', hash);
                } else {
                    window.history.pushState({ route: fullPath, ...state }, '', hash);
                }
            } else {
                if (replace) {
                    window.history.replaceState({ route: fullPath, ...state }, '', fullPath);
                } else {
                    window.history.pushState({ route: fullPath, ...state }, '', fullPath);
                }
            }

            // Update state
            _previousRoute = _currentRoute;
            _currentRoute = route;

            // Update history stack
            if (!replace) {
                _historyStack.push({ path: fullPath, route, timestamp: Date.now() });
                // Limit history stack
                if (_historyStack.length > 100) _historyStack.shift();
            }

            // Update document title
            document.title = `${route.title || 'CRM'} - 11 Avatar SMEs CRM`;

            // Update breadcrumbs
            const breadcrumbs = _generateBreadcrumbs(route.path);
            _updateBreadcrumbUI(breadcrumbs);

            // Update submenu
            _updateSubmenuUI(route);

            // Update sidebar active state
            _updateSidebarActive(route);

            // Update module content
            await _loadModuleContent(route);

            // Notify listeners
            if (!silent) {
                _notifyListeners(route, _previousRoute);
            }

            _navigating = false;
            return true;
        } catch (error) {
            console.error('[CRM_Router] Navigation error:', error);
            _navigating = false;
            return false;
        }
    }

    /**
     * Navigate back in history
     * @returns {boolean} Whether back navigation was possible
     */
    function goBack() {
        if (_historyStack.length > 1) {
            window.history.back();
            return true;
        }
        navigate(DEFAULT_ROUTE);
        return false;
    }

    /**
     * Navigate forward in history
     */
    function goForward() {
        window.history.forward();
    }

    /**
     * Replace current route without adding to history
     * @param {string} path - Target path
     * @param {Object} options - Navigation options
     */
    function replace(path, options = {}) {
        return navigate(path, { ...options, replace: true });
    }

    // ============================================================
    // UI UPDATES
    // ============================================================
    /**
     * Update breadcrumb UI in the app shell
     * @param {Array} breadcrumbs - Breadcrumb items
     */
    function _updateBreadcrumbUI(breadcrumbs) {
        try {
            const breadcrumbEl = document.getElementById('breadcrumbNav');
            if (!breadcrumbEl) return;

            breadcrumbEl.innerHTML = breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                const separator = !isLast ? '<span class="breadcrumb-separator">/</span>' : '';
                return `
                    <a href="${crumb.path}" class="breadcrumb-item${isLast ? ' active' : ''}" 
                       ${isLast ? 'aria-current="page"' : ''}>
                        ${crumb.icon ? `<span>${crumb.icon}</span>` : ''}
                        ${crumb.label}
                    </a>
                    ${separator}
                `;
            }).join('');
        } catch (error) {
            console.error('[CRM_Router] Breadcrumb UI error:', error);
        }
    }

    /**
     * Update submenu based on current route's module
     * @param {Object} route - Current route
     */
    function _updateSubmenuUI(route) {
        try {
            const submenuInner = document.getElementById('submenuInner');
            if (!submenuInner) return;

            const moduleName = route.module;
            const submenuItems = SUBMENUS[moduleName];

            if (!submenuItems || submenuItems.length === 0) {
                submenuInner.innerHTML = '';
                return;
            }

            submenuInner.innerHTML = submenuItems.map(item => {
                const isActive = route.action === item.action;
                return `
                    <button class="app-submenu-link${isActive ? ' active' : ''}" 
                            data-action="${item.action}"
                            data-module="${moduleName}">
                        ${item.icon} ${item.label}
                    </button>
                `;
            }).join('');

            // Add click handlers
            submenuInner.querySelectorAll('.app-submenu-link').forEach(link => {
                link.addEventListener('click', function() {
                    const action = this.dataset.action;
                    const mod = this.dataset.module;
                    navigate(`/${mod}/${action === 'list' || action === 'overview' ? '' : action}`);
                });
            });
        } catch (error) {
            console.error('[CRM_Router] Submenu UI error:', error);
        }
    }

    /**
     * Update sidebar active state
     * @param {Object} route - Current route
     */
    function _updateSidebarActive(route) {
        try {
            const sidebarNav = document.getElementById('sidebarNav');
            if (!sidebarNav) return;

            sidebarNav.querySelectorAll('.nav-item').forEach(item => {
                const itemModule = item.dataset.module;
                item.classList.toggle('active', itemModule === route.module);
                if (itemModule === route.module) {
                    item.setAttribute('aria-current', 'page');
                } else {
                    item.removeAttribute('aria-current');
                }
            });
        } catch (error) {
            console.error('[CRM_Router] Sidebar update error:', error);
        }
    }

    /**
     * Load module content dynamically
     * @param {Object} route - Current route
     */
    async function _loadModuleContent(route) {
        try {
            if (!route.module) return;

            // Show module container
            const appContent = document.getElementById('appContent');
            if (!appContent) return;

            const moduleContainer = document.getElementById(`module-${route.module}`);
            if (!moduleContainer) {
                console.warn(`[CRM_Router] Module container not found: module-${route.module}`);
                return;
            }

            // Hide all containers, show current
            appContent.querySelectorAll('.module-container').forEach(c => c.classList.remove('active'));
            moduleContainer.classList.add('active');

            // If CRM module loader exists, call it
            if (window.CRM && typeof window.CRM.loadModule === 'function') {
                await window.CRM.loadModule(route.module, route);
            }

            // Dispatch module loaded event
            const event = new CustomEvent('crm:module-loaded', {
                detail: { module: route.module, route },
            });
            document.dispatchEvent(event);
        } catch (error) {
            console.error('[CRM_Router] Module load error:', error);
        }
    }

    // ============================================================
    // ROUTE REGISTRATION
    // ============================================================
    /**
     * Register a new route
     * @param {Object} routeConfig - Route configuration
     * @param {string} routeConfig.path - URL path pattern
     * @param {string} routeConfig.module - Module name
     * @param {string} routeConfig.title - Page title
     * @param {boolean} [routeConfig.authRequired=true] - Require authentication
     * @param {Array<string>} [routeConfig.roles] - Allowed roles
     * @param {Function} [routeConfig.handler] - Custom route handler
     */
    function registerRoute(routeConfig) {
        try {
            // Check for duplicate
            const existing = _routes.find(r => r.path === routeConfig.path);
            if (existing) {
                console.warn(`[CRM_Router] Route already registered: ${routeConfig.path}. Updating.`);
                Object.assign(existing, routeConfig);
                return;
            }
            _routes.push({
                path: routeConfig.path,
                module: routeConfig.module || null,
                title: routeConfig.title || '',
                icon: routeConfig.icon || null,
                authRequired: routeConfig.authRequired !== false,
                roles: routeConfig.roles || null,
                action: routeConfig.action || null,
                handler: routeConfig.handler || null,
                redirect: routeConfig.redirect || null,
                meta: routeConfig.meta || {},
            });
        } catch (error) {
            console.error('[CRM_Router] Route registration error:', error);
        }
    }

    /**
     * Register multiple routes at once
     * @param {Array<Object>} routes - Array of route configs
     */
    function registerRoutes(routes) {
        routes.forEach(registerRoute);
    }

    /**
     * Add a global route guard
     * @param {Function} guard - Guard function(to, from) => boolean|string
     */
    function addGuard(guard) {
        if (typeof guard === 'function') {
            _globalGuards.push(guard);
        }
    }

    // ============================================================
    // EVENT LISTENERS
    // ============================================================
    /**
     * Handle popstate (back/forward browser buttons)
     */
    function _handlePopState(event) {
        try {
            const state = event.state;
            let path = DEFAULT_ROUTE;

            if (state && state.route) {
                path = state.route;
            } else {
                // Extract from URL
                if (ROUTER_MODE === 'hash') {
                    const hash = window.location.hash.replace('#!', '');
                    path = hash || DEFAULT_ROUTE;
                } else {
                    path = window.location.pathname || DEFAULT_ROUTE;
                }
            }

            navigate(path, { silent: false, replace: true });
        } catch (error) {
            console.error('[CRM_Router] PopState error:', error);
        }
    }

    /**
     * Subscribe to route changes
     * @param {Function} listener - Callback(route, previousRoute)
     * @returns {Function} Unsubscribe function
     */
    function onRouteChange(listener) {
        _routeListeners.push(listener);
        // Immediately call with current route
        if (_currentRoute) {
            listener(_currentRoute, _previousRoute);
        }
        return () => {
            const index = _routeListeners.indexOf(listener);
            if (index > -1) _routeListeners.splice(index, 1);
        };
    }

    /**
     * Notify all route listeners
     * @param {Object} route - Current route
     * @param {Object} prevRoute - Previous route
     */
    function _notifyListeners(route, prevRoute) {
        _routeListeners.forEach(listener => {
            try {
                listener(route, prevRoute);
            } catch (error) {
                console.error('[CRM_Router] Listener error:', error);
            }
        });

        // Dispatch global event
        window.dispatchEvent(new CustomEvent('crm:route-changed', {
            detail: { route, previousRoute: prevRoute },
        }));
    }

    // ============================================================
    // INITIALIZATION
    // ============================================================
    /**
     * Initialize the router
     */
    function init() {
        try {
            if (_initialized) {
                console.warn('[CRM_Router] Already initialized.');
                return;
            }

            // Register default routes
            registerRoutes(DEFAULT_ROUTES);

            // Listen for popstate
            window.addEventListener('popstate', _handlePopState);

            // Handle initial route
            let initialPath = DEFAULT_ROUTE;
            if (ROUTER_MODE === 'hash') {
                const hash = window.location.hash.replace('#!', '');
                if (hash) initialPath = hash;
            } else {
                initialPath = window.location.pathname || DEFAULT_ROUTE;
            }

            // Navigate to initial route
            navigate(initialPath, { replace: true, silent: false });

            _initialized = true;
            console.log('[CRM_Router] Router initialized.');
            console.log(`[CRM_Router] Initial route: ${initialPath}`);
            console.log(`[CRM_Router] ${_routes.length} routes registered.`);
        } catch (error) {
            console.error('[CRM_Router] Init error:', error);
        }
    }

    // ============================================================
    // PUBLIC GETTERS
    // ============================================================
    /** @returns {Object|null} Current active route */
    function getCurrentRoute() { return _currentRoute; }

    /** @returns {Object|null} Previous route */
    function getPreviousRoute() { return _previousRoute; }

    /** @returns {Array} All registered routes */
    function getRoutes() { return [..._routes]; }

    /** @returns {Array} Navigation history */
    function getHistory() { return [..._historyStack]; }

    /** @returns {Object} Submenu definitions */
    function getSubmenus() { return SUBMENUS; }

    /** @returns {boolean} Whether router is initialized */
    function isInitialized() { return _initialized; }

    /**
     * Generate URL for a route with params
     * @param {string} path - Route path
     * @param {Object} params - Route params
     * @param {Object} query - Query params
     * @returns {string} Generated URL
     */
    function generateUrl(path, params = {}, query = {}) {
        let url = path;
        Object.entries(params).forEach(([key, value]) => {
            url = url.replace(`:${key}`, encodeURIComponent(value));
        });
        if (Object.keys(query).length > 0) {
            const qs = Object.entries(query)
                .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
                .join('&');
            url += '?' + qs;
        }
        return ROUTER_MODE === 'hash' ? `#!${url}` : url;
    }

    // ============================================================
    // AUTO-INIT
    // ============================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // Delay slightly to let other modules load
        setTimeout(init, 100);
    }

    // ============================================================
    // PUBLIC API EXPORT
    // ============================================================
    return {
        // Core
        init,
        navigate,
        goBack,
        goForward,
        replace,

        // Route Management
        registerRoute,
        registerRoutes,
        addGuard,

        // State
        getCurrentRoute,
        getPreviousRoute,
        getRoutes,
        getHistory,
        getSubmenus,
        isInitialized,

        // Utilities
        generateUrl,
        onRouteChange,
        getBreadcrumbs: _generateBreadcrumbs,

        // Constants
        DEFAULT_ROUTE,
        NOT_FOUND_ROUTE,
        SUBMENUS,
    };
})();

// ============================================================
// EXPORT TO GLOBAL (Rule #20)
// ============================================================
window.CRM_Router = CRM_Router;

// ES Module export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CRM_Router;
}

console.log('[CRM_Router] Module loaded. window.CRM_Router available.');
console.log('[CRM_Router] Usage: CRM_Router.navigate("/leads/new")');
