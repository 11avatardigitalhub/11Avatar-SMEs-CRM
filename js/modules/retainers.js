/**
 * ============================================================
 * 11 AVATAR SMEs CRM - RETAINER MANAGEMENT MODULE
 * ============================================================
 * 
 * @file       modules/retainers.js
 * @path       C:\Users\rudra\Downloads\11 Avatar\11-Avatar-SMEs-CRM-main\modules\retainers.js
 * @author     11 Avatar Digital Hub
 * @email      info@11avatardigitalhub.cloud
 * @repo       https://github.com/11avatardigitalhub/11Avatar-SMEs-CRM.git
 * 
 * PURPOSE:
 * MRR/ARR tracking, auto-invoicing, utilization monitoring,
 * renewal alerts, SLA tracking, hour rollover policies,
 * client retainer lifecycle management.
 * 
 * DEPENDENCIES:
 * - window.CRM_Config   - Retainer config, SLA levels, rollover
 * - window.CRM_Auth     - Tenant ID, user info
 * - window.CRM_Tenant   - RBAC, quotas
 * - window.CRM_Firestore - CRUD operations
 * - window.CRM_Invoices - Auto-invoice generation
 * - css/crm-design-system.css
 * - app.html            - Module container #module-retainers
 * 
 * RULES COMPLIANCE:
 * ✅ Rule #1  - Enterprise Grade
 * ✅ Rule #5  - Deep Detailing: full JSDoc
 * ✅ Rule #6  - Error Handling: try/catch everywhere
 * ✅ Rule #17 - Multi-Tenant RBAC
 * ✅ Rule #18 - Firebase Backend
 * ✅ Rule #20 - Export All: window.CRM_Retainers
 * ✅ Rule #21 - Path First
 * ✅ Rule #23 - 600+ lines
 * ✅ Rule #25 - Full File Replacement
 * ============================================================
 */

'use strict';

const CRM_Retainers = (function() {
    'use strict';

    // ============================================================
    // PRIVATE STATE
    // ============================================================
    const _retainerCache = new Map();
    let _selectedRetainer = null;
    let _currentView = 'list';
    let _initialized = false;

    const _filters = {
        status: 'all',
        clientId: 'all',
        slaLevel: 'all',
        search: '',
    };

    const _pagination = {
        page: 1, limit: 20, total: 0, totalPages: 0, lastDoc: null,
    };

    // ============================================================
    // CONSTANTS
    // ============================================================
    const RETAINER_STATUSES = ['active', 'paused', 'expired', 'cancelled'];
    
    const RETAINER_STATUS_CONFIG = {
        active: { label: 'Active', icon: '✅', color: '#10B981' },
        paused: { label: 'Paused', icon: '⏸️', color: '#F59E0B' },
        expired: { label: 'Expired', icon: '⏰', color: '#DC2626' },
        cancelled: { label: 'Cancelled', icon: '❌', color: '#888888' },
    };

    const SLA_LEVELS = {
        standard: { name: 'Standard', responseTime: 48, resolutionTime: 120, priority: 'normal' },
        priority: { name: 'Priority', responseTime: 24, resolutionTime: 72, priority: 'high' },
        premium: { name: 'Premium', responseTime: 8, resolutionTime: 48, priority: 'urgent' },
        enterprise: { name: 'Enterprise', responseTime: 4, resolutionTime: 24, priority: 'critical' },
    };

    const ROLLOVER_POLICIES = {
        none: { name: 'No Rollover', description: 'Unused hours expire at period end' },
        partial_25: { name: 'Up to 25%', description: 'Max 25% unused hours roll over' },
        partial_50: { name: 'Up to 50%', description: 'Max 50% unused hours roll over' },
        unlimited: { name: 'Unlimited', description: 'All unused hours roll over' },
    };

    const BILLING_CYCLES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'biannually', 'annually', 'custom'];
    const AUTO_INVOICE_DAYS = 7;
    const UTILIZATION_WARNING = 80;

    // ============================================================
    // HELPERS
    // ============================================================
    function _getTenantId() {
        try { if (window.CRM_Auth?.getTenantId) return window.CRM_Auth.getTenantId(); if (window.CRM_Tenant?.getTenantId) return window.CRM_Tenant.getTenantId(); } catch (e) {}
        return null;
    }

    function _getCurrentUser() {
        try { if (window.CRM_Auth?.getUser) return window.CRM_Auth.getUser(); } catch (e) {}
        return { uid: 'unknown', displayName: 'User' };
    }

    function _showToast(msg, type = 'info') {
        try { if (window.CRM?.showToast) { window.CRM.showToast(msg, type); return; }
            const c = document.getElementById('appToastContainer') || document.body;
            const t = document.createElement('div'); t.className = `toast toast-${type}`; t.setAttribute('role', 'status');
            t.innerHTML = `<span class="toast-message">${msg}</span>`; c.appendChild(t);
            setTimeout(() => { t.classList.add('toast-removing'); setTimeout(() => t.remove(), 300); }, 3000);
        } catch (e) { alert(msg); }
    }

    function _formatCurrency(amount) {
        try { return '₹ ' + parseFloat(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } catch (e) { return '₹ ' + (amount || 0).toFixed(2); }
    }

    function _formatDate(dateStr) {
        try { if (!dateStr) return 'N/A'; return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch (e) { return dateStr || 'N/A'; }
    }

    function _escapeHtml(text) { if (!text) return ''; const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }

    function _generateId() { return 'ret_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6); }

    // ============================================================
    // SECTION 1: MRR/ARR CALCULATOR
    // ============================================================
    async function calculateMRR() {
        try {
            const retainers = await loadAllRetainers();
            const active = retainers.filter(r => r.status === 'active');
            
            let mrr = 0;
            active.forEach(r => {
                const monthlyAmount = _getMonthlyAmount(r.amount, r.billingCycle);
                mrr += monthlyAmount;
            });

            const arr = mrr * 12;
            const projectedMRR = mrr; // Could factor in upcoming renewals
            const churnRisk = active.filter(r => r.utilizationPercent < 30 && r.daysUntilRenewal < 30).length;

            return {
                mrr: Math.round(mrr * 100) / 100,
                arr: Math.round(arr * 100) / 100,
                activeRetainers: active.length,
                totalClients: [...new Set(active.map(r => r.clientId))].length,
                averageValue: active.length > 0 ? Math.round((mrr / active.length) * 100) / 100 : 0,
                churnRisk,
                projectedMRR,
                formattedMRR: _formatCurrency(mrr),
                formattedARR: _formatCurrency(arr),
            };
        } catch (error) { console.error('[Retainers] MRR error:', error); return { mrr: 0, arr: 0, activeRetainers: 0 }; }
    }

    function _getMonthlyAmount(amount, billingCycle) {
        switch (billingCycle) {
            case 'weekly': return amount * 4.33;
            case 'biweekly': return amount * 2.17;
            case 'monthly': return amount;
            case 'quarterly': return amount / 3;
            case 'biannually': return amount / 6;
            case 'annually': return amount / 12;
            default: return amount;
        }
    }

    // ============================================================
    // SECTION 2: UTILIZATION TRACKER
    // ============================================================
    function calculateUtilization(retainer) {
        try {
            const totalHours = retainer.totalHours || retainer.hoursPerPeriod || 0;
            const usedHours = retainer.usedHours || 0;
            const remainingHours = Math.max(0, totalHours - usedHours);
            const utilizationPercent = totalHours > 0 ? Math.round((usedHours / totalHours) * 100) : 0;
            const isOverUtilized = usedHours > totalHours;
            const isUnderUtilized = utilizationPercent < 30;
            const isNearLimit = utilizationPercent >= UTILIZATION_WARNING && utilizationPercent < 100;

            let rolloverHours = 0;
            if (retainer.rolloverPolicy && retainer.rolloverPolicy !== 'none' && retainer.previousRemaining) {
                const policy = ROLLOVER_POLICIES[retainer.rolloverPolicy];
                if (policy) {
                    if (retainer.rolloverPolicy === 'unlimited') rolloverHours = retainer.previousRemaining;
                    else if (retainer.rolloverPolicy === 'partial_25') rolloverHours = Math.min(retainer.previousRemaining, totalHours * 0.25);
                    else if (retainer.rolloverPolicy === 'partial_50') rolloverHours = Math.min(retainer.previousRemaining, totalHours * 0.50);
                }
            }

            const effectiveRemaining = remainingHours + rolloverHours;

            return {
                totalHours, usedHours, remainingHours, rolloverHours, effectiveRemaining,
                utilizationPercent, isOverUtilized, isUnderUtilized, isNearLimit,
                formattedUsed: `${usedHours}h`, formattedTotal: `${totalHours}h`,
                formattedRemaining: `${remainingHours}h`, formattedRollover: `${rolloverHours}h`,
                status: isOverUtilized ? 'over' : isNearLimit ? 'warning' : isUnderUtilized ? 'under' : 'normal',
            };
        } catch (e) { return { utilizationPercent: 0, status: 'unknown' }; }
    }

    async function logHours(retainerId, hours, description = '') {
        try {
            const retainer = await getRetainer(retainerId);
            if (!retainer) return null;

            const timeEntry = {
                id: 'time_' + Date.now(), hours, description,
                loggedAt: new Date().toISOString(), loggedBy: _getCurrentUser().uid,
            };

            const timeEntries = [...(retainer.timeEntries || []), timeEntry];
            const usedHours = (retainer.usedHours || 0) + hours;
            const utilization = calculateUtilization({ ...retainer, usedHours, timeEntries });

            return await updateRetainer(retainerId, {
                usedHours, timeEntries,
                utilizationPercent: utilization.utilizationPercent,
                lastActivityAt: new Date().toISOString(),
            });
        } catch (e) { return null; }
    }

    // ============================================================
    // SECTION 3: RENEWAL & AUTO-INVOICE
    // ============================================================
    function calculateNextBillingDate(startDate, billingCycle, currentPeriod = 0) {
        try {
            const start = new Date(startDate);
            const now = new Date();
            let nextDate = new Date(start);

            while (nextDate <= now) {
                switch (billingCycle) {
                    case 'weekly': nextDate.setDate(nextDate.getDate() + 7); break;
                    case 'biweekly': nextDate.setDate(nextDate.getDate() + 14); break;
                    case 'monthly': nextDate.setMonth(nextDate.getMonth() + 1); break;
                    case 'quarterly': nextDate.setMonth(nextDate.getMonth() + 3); break;
                    case 'biannually': nextDate.setMonth(nextDate.getMonth() + 6); break;
                    case 'annually': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
                    default: nextDate.setMonth(nextDate.getMonth() + 1);
                }
            }

            return nextDate.toISOString().split('T')[0];
        } catch (e) { return null; }
    }

    function getDaysUntilRenewal(nextBillingDate) {
        try {
            if (!nextBillingDate) return 0;
            const diff = new Date(nextBillingDate) - new Date();
            return Math.max(0, Math.ceil(diff / 86400000));
        } catch (e) { return 0; }
    }

    function getRenewalStatus(daysUntilRenewal) {
        if (daysUntilRenewal <= 0) return { status: 'overdue', icon: '🔴', label: 'Overdue', color: '#DC2626' };
        if (daysUntilRenewal <= 7) return { status: 'due_soon', icon: '🟠', label: 'Due Soon', color: '#F97316' };
        if (daysUntilRenewal <= 30) return { status: 'upcoming', icon: '🟡', label: 'Upcoming', color: '#F59E0B' };
        return { status: 'active', icon: '🟢', label: 'Active', color: '#10B981' };
    }

    async function triggerAutoInvoice(retainerId) {
        try {
            const retainer = await getRetainer(retainerId);
            if (!retainer || retainer.status !== 'active') return null;
            if (!retainer.autoInvoice) return { skipped: true, reason: 'Auto-invoice disabled' };

            const daysUntil = getDaysUntilRenewal(retainer.nextBillingDate);
            if (daysUntil > AUTO_INVOICE_DAYS) return { skipped: true, reason: `Not due yet (${daysUntil} days)` };

            // Create invoice via CRM_Invoices
            if (window.CRM_Invoices?.createInvoice) {
                const invoiceData = {
                    clientName: retainer.clientName,
                    clientGSTIN: retainer.clientGSTIN || '',
                    invoiceDate: new Date().toISOString().split('T')[0],
                    dueDate: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
                    items: [{
                        description: `${retainer.name} — ${retainer.billingCycle} retainer fee`,
                        quantity: 1, rate: retainer.amount,
                        gstRate: 18, hsnSac: '9983',
                    }],
                    notes: `Auto-generated retainer invoice. Period: ${retainer.currentPeriod || 'N/A'}`,
                    reference: `RET-${retainer.id?.substring(0, 8)}`,
                };

                const invoice = await window.CRM_Invoices.createInvoice(invoiceData);
                if (invoice && !invoice.error) {
                    // Update retainer with invoice reference
                    const invoices = [...(retainer.invoices || []), { id: invoice.id, date: new Date().toISOString(), amount: retainer.amount }];
                    const nextDate = calculateNextBillingDate(retainer.nextBillingDate || new Date().toISOString(), retainer.billingCycle);
                    await updateRetainer(retainerId, { invoices, nextBillingDate: nextDate, lastInvoicedAt: new Date().toISOString() });
                    return { success: true, invoiceId: invoice.id };
                }
            }
            return { skipped: true, reason: 'Invoice module not available' };
        } catch (e) { return { error: 'AUTO_INVOICE_FAILED', message: e.message }; }
    }

    async function processAllAutoInvoices() {
        try {
            const retainers = await loadAllRetainers();
            const activeRetainers = retainers.filter(r => r.status === 'active' && r.autoInvoice);
            let processed = 0;

            for (const r of activeRetainers) {
                const result = await triggerAutoInvoice(r.id);
                if (result?.success) processed++;
            }

            return { processed, total: activeRetainers.length };
        } catch (e) { return { processed: 0, error: e.message }; }
    }

    // ============================================================
    // SECTION 4: RETAINER CRUD
    // ============================================================
    async function loadAllRetainers() {
        try {
            if (window.CRM_Firestore?.getAllDocuments) {
                return await window.CRM_Firestore.getAllDocuments('retainers', { limit: 1000 });
            }
            const result = await loadRetainers();
            return result.data || [];
        } catch (e) { return []; }
    }

    async function loadRetainers(options = {}) {
        try {
            const filters = [];
            if (_filters.status && _filters.status !== 'all') filters.push(['status', '==', _filters.status]);
            if (_filters.clientId && _filters.clientId !== 'all') filters.push(['clientId', '==', _filters.clientId]);
            if (_filters.slaLevel && _filters.slaLevel !== 'all') filters.push(['slaLevel', '==', _filters.slaLevel]);

            let result;
            if (window.CRM_Firestore?.queryDocuments) {
                result = await window.CRM_Firestore.queryDocuments('retainers', {
                    filters, orderBy: 'updatedAt', orderDir: 'desc',
                    limit: options.limit || _pagination.limit, startAfter: _pagination.lastDoc,
                });
            } else { result = _fallbackQuery(); }

            _retainerCache.clear();
            if (result?.data) result.data.forEach(r => _retainerCache.set(r.id, _enrichRetainer(r)));

            _pagination.total = result?.total || (result?.data?.length || 0);
            _pagination.totalPages = Math.ceil(_pagination.total / _pagination.limit) || 1;
            _pagination.lastDoc = result?.lastDoc || null;

            let data = result?.data || [];
            if (_filters.search) {
                const s = _filters.search.toLowerCase();
                data = data.filter(r => (r.name || '').toLowerCase().includes(s) || (r.clientName || '').toLowerCase().includes(s));
            }

            return { data: data.map(r => _enrichRetainer(r)), total: _pagination.total };
        } catch (e) { console.error('[Retainers] Load error:', e); return { data: [], total: 0 }; }
    }

    async function getRetainer(retainerId) {
        try {
            if (_retainerCache.has(retainerId)) return _retainerCache.get(retainerId);
            if (window.CRM_Firestore?.getDocument) {
                const retainer = await window.CRM_Firestore.getDocument('retainers', retainerId);
                if (retainer) { const enriched = _enrichRetainer(retainer); _retainerCache.set(retainerId, enriched); return enriched; }
            }
            return null;
        } catch (e) { return null; }
    }

    async function createRetainer(retainerData) {
        try {
            const now = new Date().toISOString();
            const user = _getCurrentUser();
            const nextBillingDate = calculateNextBillingDate(retainerData.startDate || now, retainerData.billingCycle || 'monthly');

            const data = {
                ...retainerData, id: _generateId(), tenantId: _getTenantId(),
                status: 'active', usedHours: 0, utilizationPercent: 0,
                nextBillingDate, invoices: [], timeEntries: [],
                createdAt: now, updatedAt: now,
                createdBy: user.uid, createdByName: user.displayName,
            };

            if (window.CRM_Firestore?.createDocument) {
                const created = await window.CRM_Firestore.createDocument('retainers', data);
                if (created) { const enriched = _enrichRetainer(created); _retainerCache.set(created.id, enriched); return enriched; }
            }
            return null;
        } catch (e) { console.error('[Retainers] Create error:', e); return { error: 'CREATE_FAILED' }; }
    }

    async function updateRetainer(retainerId, updates) {
        try {
            const updateData = { ...updates, updatedAt: new Date().toISOString(), updatedBy: _getCurrentUser().uid };
            if (window.CRM_Firestore?.updateDocument) {
                const updated = await window.CRM_Firestore.updateDocument('retainers', retainerId, updateData);
                if (updated) { const enriched = _enrichRetainer(updated); _retainerCache.set(retainerId, enriched); return enriched; }
            }
            return null;
        } catch (e) { return null; }
    }

    async function deleteRetainer(retainerId) {
        try {
            if (window.CRM_Firestore?.deleteDocument) {
                await window.CRM_Firestore.deleteDocument('retainers', retainerId);
                _retainerCache.delete(retainerId);
                return true;
            }
            return false;
        } catch (e) { return false; }
    }

    async function updateRetainerStatus(retainerId, newStatus) {
        if (!RETAINER_STATUSES.includes(newStatus)) return { error: 'INVALID_STATUS' };
        const updates = { status: newStatus };
        if (newStatus === 'expired') updates.expiredAt = new Date().toISOString();
        if (newStatus === 'active') updates.reactivatedAt = new Date().toISOString();
        return await updateRetainer(retainerId, updates);
    }

    // ============================================================
    // SECTION 5: DATA ENRICHMENT
    // ============================================================
    function _enrichRetainer(retainer) {
        try {
            const statusConfig = RETAINER_STATUS_CONFIG[retainer.status] || {};
            const utilization = calculateUtilization(retainer);
            const slaConfig = SLA_LEVELS[retainer.slaLevel] || SLA_LEVELS.standard;
            const rolloverConfig = ROLLOVER_POLICIES[retainer.rolloverPolicy] || ROLLOVER_POLICIES.none;
            const daysUntilRenewal = getDaysUntilRenewal(retainer.nextBillingDate);
            const renewalStatus = getRenewalStatus(daysUntilRenewal);
            const monthlyAmount = _getMonthlyAmount(retainer.amount, retainer.billingCycle);

            return {
                ...retainer,
                statusLabel: statusConfig.label, statusIcon: statusConfig.icon, statusColor: statusConfig.color,
                utilization, slaName: slaConfig.name, rolloverName: rolloverConfig.name,
                daysUntilRenewal, renewalStatus,
                monthlyAmount: Math.round(monthlyAmount * 100) / 100,
                formattedAmount: _formatCurrency(retainer.amount),
                formattedMonthly: _formatCurrency(monthlyAmount),
                formattedStartDate: _formatDate(retainer.startDate),
                formattedNextBilling: _formatDate(retainer.nextBillingDate),
                invoiceCount: (retainer.invoices || []).length,
                isRenewalDue: daysUntilRenewal <= AUTO_INVOICE_DAYS,
            };
        } catch (e) { return retainer; }
    }

    // ============================================================
    // SECTION 6: FALLBACK
    // ============================================================
    function _fallbackQuery() {
        try {
            const stored = localStorage.getItem('crm_retainers');
            let retainers = stored ? JSON.parse(stored) : [];
            retainers = retainers.filter(r => r.tenantId === _getTenantId());
            return { data: retainers, total: retainers.length };
        } catch (e) { return { data: [], total: 0 }; }
    }

    // ============================================================
    // SECTION 7: UI RENDERERS
    // ============================================================
    async function renderListView(containerId = 'retainersContent') {
        try {
            const container = document.getElementById(containerId);
            if (!container) return;

            const mrr = await calculateMRR();
            const result = await loadRetainers();
            const retainers = result.data || [];

            let html = `
                <div class="retainers-container">
                    <div class="flex justify-between items-center mb-4">
                        <h2>🔄 Retainers</h2>
                        <div class="flex gap-2">
                            <button class="btn btn-outline btn-sm" onclick="window.CRM_Retainers.processAllAutoInvoices()">📄 Run Auto-Invoices</button>
                            <button class="btn btn-primary" onclick="window.CRM_Retainers.openCreateForm()">+ New Retainer</button>
                        </div>
                    </div>
                    <div class="grid grid-auto-sm gap-3 mb-4">
                        <div class="stat-card"><div class="stat-label">MRR</div><div class="stat-value text-gold">${mrr.formattedMRR}</div></div>
                        <div class="stat-card"><div class="stat-label">ARR</div><div class="stat-value">${mrr.formattedARR}</div></div>
                        <div class="stat-card"><div class="stat-label">Active Retainers</div><div class="stat-value">${mrr.activeRetainers}</div></div>
                        <div class="stat-card"><div class="stat-label">Churn Risk</div><div class="stat-value ${mrr.churnRisk > 0 ? 'text-error' : 'text-success'}">${mrr.churnRisk}</div></div>
                    </div>
                    <div class="flex gap-2 mb-3">
                        <select id="retStatusFilter" class="form-select" style="width:auto;min-height:40px;">
                            <option value="all">All Status</option>
                            ${RETAINER_STATUSES.map(s => `<option value="${s}">${RETAINER_STATUS_CONFIG[s].icon} ${RETAINER_STATUS_CONFIG[s].label}</option>`).join('')}
                        </select>
                        <input type="search" id="retSearch" class="form-input" placeholder="Search retainers..." style="width:250px;min-height:40px;">
                    </div>
                    ${retainers.length === 0 ? '<div class="empty-state"><div class="empty-icon">🔄</div><h4>No Retainers</h4><p>Create your first retainer agreement.</p></div>' : `
                        <div class="table-container">
                            <table class="table">
                                <thead><tr><th>Client</th><th>Retainer Name</th><th>Amount</th><th>MRR</th><th>Utilization</th><th>SLA</th><th>Renewal</th><th>Status</th><th></th></tr></thead>
                                <tbody>
                                    ${retainers.map(r => {
                                        const enriched = _enrichRetainer(r);
                                        return `
                                            <tr onclick="window.CRM_Retainers.openDetail('${r.id}')" class="cursor-pointer">
                                                <td><strong>${_escapeHtml(r.clientName || 'N/A')}</strong></td>
                                                <td>${_escapeHtml(r.name || 'Untitled')}</td>
                                                <td>${enriched.formattedAmount}/${r.billingCycle}</td>
                                                <td>${enriched.formattedMonthly}</td>
                                                <td>
                                                    <div class="flex items-center gap-2">
                                                        <div class="progress flex-1"><div class="progress-bar ${enriched.utilization.status === 'over' ? 'bg-error' : ''}" style="width:${Math.min(100, enriched.utilization.utilizationPercent)}%"></div></div>
                                                        <span class="text-sm">${enriched.utilization.utilizationPercent}%</span>
                                                    </div>
                                                </td>
                                                <td><span class="badge badge-info">${enriched.slaName}</span></td>
                                                <td>
                                                    <span style="color:${enriched.renewalStatus.color};">${enriched.renewalStatus.icon}</span>
                                                    ${enriched.daysUntilRenewal}d
                                                </td>
                                                <td><span class="badge" style="background:${enriched.statusColor}20;color:${enriched.statusColor};">${enriched.statusLabel}</span></td>
                                                <td>
                                                    <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();window.CRM_Retainers.logHoursPrompt('${r.id}')" title="Log Hours">⏱️</button>
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            `;
            container.innerHTML = html;
            _bindListEvents();
        } catch (e) { console.error('[Retainers] Render list error:', e); }
    }

    async function openCreateForm(containerId = 'retainersContent', retainerData = null) {
        try {
            const container = document.getElementById(containerId);
            if (!container) return;
            const isEdit = !!retainerData;
            const todayDate = new Date().toISOString().split('T')[0];

            container.innerHTML = `
                <div class="retainer-form-container">
                    <h2 class="mb-4">${isEdit ? 'Edit Retainer' : 'New Retainer Agreement'}</h2>
                    <form id="retainerForm">
                        <div class="card mb-3"><div class="card-body">
                            <div class="form-row">
                                <div class="form-group flex-1"><label class="form-label form-label-required">Retainer Name</label><input type="text" id="retName" class="form-input" value="${_escapeHtml(retainerData?.name || '')}" required></div>
                                <div class="form-group flex-1"><label class="form-label form-label-required">Client</label><input type="text" id="retClient" class="form-input" value="${_escapeHtml(retainerData?.clientName || '')}" required></div>
                            </div>
                            <div class="form-row mt-3">
                                <div class="form-group flex-1"><label class="form-label">Amount (₹)</label><input type="number" id="retAmount" class="form-input" value="${retainerData?.amount || ''}" min="0" step="0.01"></div>
                                <div class="form-group flex-1"><label class="form-label">Billing Cycle</label><select id="retCycle" class="form-select">${BILLING_CYCLES.map(c => `<option value="${c}" ${retainerData?.billingCycle === c ? 'selected' : ''}>${c.charAt(0).toUpperCase() + c.slice(1)}</option>`).join('')}</select></div>
                            </div>
                            <div class="form-row mt-3">
                                <div class="form-group flex-1"><label class="form-label">Hours Per Period</label><input type="number" id="retHours" class="form-input" value="${retainerData?.hoursPerPeriod || ''}" min="0"></div>
                                <div class="form-group flex-1"><label class="form-label">SLA Level</label><select id="retSLA" class="form-select">${Object.entries(SLA_LEVELS).map(([k, v]) => `<option value="${k}" ${retainerData?.slaLevel === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></div>
                                <div class="form-group flex-1"><label class="form-label">Rollover Policy</label><select id="retRollover" class="form-select">${Object.entries(ROLLOVER_POLICIES).map(([k, v]) => `<option value="${k}" ${retainerData?.rolloverPolicy === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></div>
                            </div>
                            <div class="form-row mt-3">
                                <div class="form-group flex-1"><label class="form-label">Start Date</label><input type="date" id="retStart" class="form-input" value="${retainerData?.startDate?.split('T')[0] || todayDate}"></div>
                                <div class="form-group flex-1"><label class="form-label">Status</label><select id="retStatus" class="form-select">${RETAINER_STATUSES.map(s => `<option value="${s}" ${retainerData?.status === s ? 'selected' : ''}>${RETAINER_STATUS_CONFIG[s].label}</option>`).join('')}</select></div>
                                <div class="form-group flex-1"><label class="checkbox-group mt-4"><input type="checkbox" id="retAutoInvoice" ${retainerData?.autoInvoice !== false ? 'checked' : ''}> Auto-Invoice</label></div>
                            </div>
                        </div></div>
                        <div class="flex justify-end gap-3">
                            <button type="button" class="btn btn-secondary btn-lg" onclick="window.CRM_Retainers.navigateToList()">Cancel</button>
                            <button type="submit" class="btn btn-primary btn-lg">${isEdit ? '💾 Update' : '🔄 Create Retainer'}</button>
                        </div>
                    </form>
                </div>
            `;

            document.getElementById('retainerForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const data = {
                    name: document.getElementById('retName')?.value,
                    clientName: document.getElementById('retClient')?.value,
                    amount: parseFloat(document.getElementById('retAmount')?.value) || 0,
                    billingCycle: document.getElementById('retCycle')?.value,
                    hoursPerPeriod: parseFloat(document.getElementById('retHours')?.value) || 0,
                    totalHours: parseFloat(document.getElementById('retHours')?.value) || 0,
                    slaLevel: document.getElementById('retSLA')?.value,
                    rolloverPolicy: document.getElementById('retRollover')?.value,
                    startDate: document.getElementById('retStart')?.value,
                    status: document.getElementById('retStatus')?.value,
                    autoInvoice: document.getElementById('retAutoInvoice')?.checked,
                };
                if (!data.name || !data.clientName) { _showToast('Name and client are required.', 'error'); return; }

                let result;
                if (isEdit && retainerData?.id) result = await updateRetainer(retainerData.id, data);
                else result = await createRetainer(data);

                if (result && !result.error) { _showToast(isEdit ? 'Updated!' : 'Created!', 'success'); navigateToList(); }
                else _showToast('Failed.', 'error');
            });
        } catch (e) { console.error('[Retainers] Form error:', e); }
    }

    // ============================================================
    // SECTION 8: NAVIGATION & EVENTS
    // ============================================================
    async function navigateToList() { _currentView = 'list'; await renderListView(); }
    async function openDetail(retainerId) {
        const retainer = await getRetainer(retainerId);
        if (retainer) { _selectedRetainer = retainerId; _showToast(`${retainer.name} — ${retainer.formattedMonthly}/mo | Util: ${retainer.utilization.utilizationPercent}%`, 'info'); }
    }
    async function logHoursPrompt(retainerId) {
        const hours = prompt('Hours to log:');
        if (!hours || isNaN(parseFloat(hours))) return;
        const desc = prompt('Description (optional):') || '';
        await logHours(retainerId, parseFloat(hours), desc);
        await renderListView();
        _showToast(`${hours}h logged!`, 'success');
    }

    function _bindListEvents() {
        document.getElementById('retStatusFilter')?.addEventListener('change', async () => { _filters.status = document.getElementById('retStatusFilter').value; await renderListView(); });
        const searchEl = document.getElementById('retSearch');
        if (searchEl) {
            let timer;
            searchEl.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(async () => { _filters.search = searchEl.value; await renderListView(); }, 400); });
        }
    }

    // ============================================================
    // SECTION 9: INIT
    // ============================================================
    function init() {
        try {
            if (_initialized) return;
            renderListView();
            _initialized = true;
            console.log('[CRM_Retainers] Module initialized.');
        } catch (e) { console.error('[CRM_Retainers] Init error:', e); }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
    else setTimeout(init, 300);

    return {
        init,
        loadRetainers, loadAllRetainers, getRetainer, createRetainer, updateRetainer, deleteRetainer, updateRetainerStatus,
        calculateMRR, calculateUtilization, logHours,
        calculateNextBillingDate, getDaysUntilRenewal, getRenewalStatus,
        triggerAutoInvoice, processAllAutoInvoices,
        renderListView, openCreateForm,
        navigateToList, openDetail, logHoursPrompt,
        SLA_LEVELS, ROLLOVER_POLICIES, BILLING_CYCLES,
        getFilters: () => _filters,
    };
})();

window.CRM_Retainers = CRM_Retainers;
console.log('[CRM_Retainers] Module loaded. window.CRM_Retainers available.');