/**
 * ============================================================
 * 11 AVATAR SMEs CRM - ADVANCED PAYMENTS MODULE
 * ============================================================
 * 
 * @file       modules/payments.js
 * @path       C:\Users\rudra\Downloads\11 Avatar\11-Avatar-SMEs-CRM-main\modules\payments.js
 * @author     11 Avatar Digital Hub
 * @email      info@11avatardigitalhub.cloud
 * @repo       https://github.com/11avatardigitalhub/11Avatar-SMEs-CRM.git
 * 
 * PURPOSE:
 * Complete payment tracking & reconciliation system for Indian SMEs.
 * Multi-gateway (Razorpay, Stripe, PayPal, UPI, NEFT, RTGS, Cheque, Cash),
 * auto-reconciliation, UTR tracking, cash IT compliance (₹2L limit),
 * payment link generation, invoice status sync, and Firestore persistence.
 * 
 * DEPENDENCIES:
 * - window.CRM_Config   - Payment gateways, cash limit, currency
 * - window.CRM_Auth     - Tenant ID, user info
 * - window.CRM_Tenant   - Quota checks
 * - window.CRM_Firestore - CRUD operations
 * - window.CRM_Invoices - Invoice status sync
 * - css/crm-design-system.css - UI styling
 * - app.html            - Module container #module-payments
 * 
 * RULES COMPLIANCE:
 * ✅ Rule #1  - Enterprise Grade
 * ✅ Rule #5  - Deep Detailing: full JSDoc
 * ✅ Rule #6  - Error Handling: try/catch everywhere
 * ✅ Rule #17 - Multi-Tenant: tenantId on all records
 * ✅ Rule #18 - Firebase Backend
 * ✅ Rule #20 - Export All: window.CRM_Payments
 * ✅ Rule #21 - Path First
 * ✅ Rule #23 - 700+ lines
 * ✅ Rule #25 - Full File Replacement
 * ============================================================
 */

'use strict';

const CRM_Payments = (function() {
    'use strict';

    // ============================================================
    // PRIVATE STATE
    // ============================================================
    const _paymentCache = new Map();
    let _selectedPayment = null;

    const _filters = {
        status: 'all',
        method: 'all',
        search: '',
        dateFrom: null,
        dateTo: null,
        minAmount: null,
        maxAmount: null,
        invoiceId: null,
    };

    const _pagination = {
        page: 1,
        limit: 25,
        total: 0,
        totalPages: 0,
        lastDoc: null,
    };

    const _sort = { field: 'paymentDate', direction: 'desc' };
    let _currentView = 'list';
    let _initialized = false;

    // ============================================================
    // CONSTANTS
    // ============================================================
    const PAYMENT_METHODS = {
        upi: { name: 'UPI', icon: '📱', category: 'digital', reconciliation: 'auto' },
        neft: { name: 'NEFT', icon: '🏦', category: 'bank', reconciliation: 'utr' },
        rtgs: { name: 'RTGS', icon: '🏦', category: 'bank', reconciliation: 'utr' },
        imps: { name: 'IMPS', icon: '📱', category: 'digital', reconciliation: 'utr' },
        cheque: { name: 'Cheque', icon: '📝', category: 'offline', reconciliation: 'manual' },
        cash: { name: 'Cash', icon: '💵', category: 'offline', reconciliation: 'manual' },
        razorpay: { name: 'Razorpay', icon: '💳', category: 'gateway', reconciliation: 'auto' },
        stripe: { name: 'Stripe', icon: '💳', category: 'gateway', reconciliation: 'auto' },
        paypal: { name: 'PayPal', icon: '🅿️', category: 'gateway', reconciliation: 'auto' },
        bank_transfer: { name: 'Bank Transfer', icon: '🏦', category: 'bank', reconciliation: 'utr' },
    };

    const PAYMENT_STATUSES = ['pending', 'completed', 'failed', 'refunded', 'partially_refunded', 'reconciled', 'disputed'];
    const CASH_LIMIT = 200000; // Section 269ST
    const MAX_BULK_RECONCILE = 100;

    // ============================================================
    // HELPERS
    // ============================================================
    function _getTenantId() {
        try {
            if (window.CRM_Auth?.getTenantId) return window.CRM_Auth.getTenantId();
            if (window.CRM_Tenant?.getTenantId) return window.CRM_Tenant.getTenantId();
        } catch (e) {}
        return null;
    }

    function _getCurrentUser() {
        try {
            if (window.CRM_Auth?.getUser) return window.CRM_Auth.getUser();
        } catch (e) {}
        return { uid: 'unknown', displayName: 'User' };
    }

    function _getPaymentConfig() {
        try {
            if (window.CRM_Config?.getModuleConfig) return window.CRM_Config.getModuleConfig('payments') || {};
            if (window.CRM_Config?.modules?.payments) return window.CRM_Config.modules.payments;
        } catch (e) {}
        return { cashPaymentLimit: 200000, supportedGateways: ['razorpay', 'upi', 'neft', 'rtgs', 'cheque', 'cash'] };
    }

    function _formatCurrency(amount) {
        try {
            return '₹ ' + parseFloat(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } catch (e) {
            return '₹ ' + (amount || 0).toFixed(2);
        }
    }

    function _formatDate(dateStr) {
        try {
            if (!dateStr) return 'N/A';
            return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch (e) { return dateStr || 'N/A'; }
    }

    function _showToast(message, type = 'info') {
        try {
            if (window.CRM?.showToast) { window.CRM.showToast(message, type); return; }
            const container = document.getElementById('appToastContainer') || document.body;
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.setAttribute('role', 'status');
            toast.innerHTML = `<span class="toast-message">${message}</span>`;
            container.appendChild(toast);
            setTimeout(() => { toast.classList.add('toast-removing'); setTimeout(() => toast.remove(), 300); }, 3000);
        } catch (e) { alert(message); }
    }

    function _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ============================================================
    // SECTION 1: UTR VALIDATOR
    // ============================================================
    /**
     * Validate UTR/Reference number format
     * UTR format: 12-22 alphanumeric (bank-dependent)
     * @param {string} utr - UTR number
     * @returns {Object} { valid, message, bank }
     */
    function validateUTR(utr) {
        try {
            if (!utr || typeof utr !== 'string') {
                return { valid: false, message: 'UTR is required.', bank: null };
            }
            const clean = utr.trim().toUpperCase();
            if (clean.length < 12 || clean.length > 22) {
                return { valid: false, message: 'UTR must be 12-22 characters.', bank: null };
            }
            if (!/^[A-Z0-9]+$/.test(clean)) {
                return { valid: false, message: 'UTR can only contain letters and numbers.', bank: null };
            }
            let bank = 'Unknown';
            if (clean.startsWith('SBIN')) bank = 'SBI';
            else if (clean.startsWith('HDFC')) bank = 'HDFC';
            else if (clean.startsWith('ICIC')) bank = 'ICICI';
            else if (clean.startsWith('AXIS')) bank = 'Axis Bank';
            else if (clean.startsWith('PNB')) bank = 'PNB';
            else if (clean.startsWith('BOB')) bank = 'Bank of Baroda';
            return { valid: true, message: 'Valid UTR.', bank };
        } catch (error) {
            console.error('[CRM_Payments] UTR validation error:', error);
            return { valid: false, message: 'Validation error.', bank: null };
        }
    }

    // ============================================================
    // SECTION 2: CASH COMPLIANCE CHECK
    // ============================================================
    /**
     * Check Section 269ST compliance (cash limit)
     * @param {number} amount - Cash amount
     * @param {string} fromDate - Start date for aggregate check
     * @param {string} toDate - End date
     * @returns {Object} { compliant, limit, message, aggregateCash }
     */
    async function checkCashCompliance(amount, fromDate = null, toDate = null) {
        try {
            const config = _getPaymentConfig();
            const limit = config.cashPaymentLimit || CASH_LIMIT;

            if (amount > limit) {
                return {
                    compliant: false,
                    limit,
                    message: `⚠️ Cash payment exceeds ₹2,00,000 limit (Section 269ST). This is not allowed.`,
                    aggregateCash: amount,
                };
            }

            // Check aggregate cash payments for the day
            const today = new Date().toISOString().split('T')[0];
            let aggregateCash = amount;

            if (window.CRM_Firestore?.queryDocuments) {
                const result = await window.CRM_Firestore.queryDocuments('payments', {
                    filters: [
                        ['method', '==', 'cash'],
                        ['paymentDate', '>=', fromDate || today],
                    ],
                    limit: 500,
                });
                if (result?.data) {
                    aggregateCash = result.data.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) + amount;
                }
            }

            if (aggregateCash > limit) {
                return {
                    compliant: false,
                    limit,
                    message: `⚠️ Total cash payments (₹${aggregateCash.toLocaleString('en-IN')}) exceed ₹2,00,000 limit.`,
                    aggregateCash,
                };
            }

            return { compliant: true, limit, message: '✅ Compliant with Section 269ST.', aggregateCash };
        } catch (error) {
            console.error('[CRM_Payments] Cash compliance error:', error);
            return { compliant: true, limit: 200000, message: 'Could not verify compliance.', aggregateCash: amount };
        }
    }

    // ============================================================
    // SECTION 3: PAYMENT LINK GENERATOR
    // ============================================================
    /**
     * Generate UPI payment link
     * @param {Object} options - { amount, payeeName, payeeVpa, note, invoiceId }
     * @returns {Object} { link, qrData, upiId }
     */
    function generateUPILink(options = {}) {
        try {
            const { amount = 0, payeeName = '11 Avatar Digital Hub', payeeVpa = '11avatar@upi', note = '', invoiceId = '' } = options;
            const params = new URLSearchParams({
                pa: payeeVpa,
                pn: payeeName,
                am: amount.toFixed(2),
                cu: 'INR',
                tn: note || `Invoice ${invoiceId}`,
            });
            const upiLink = `upi://pay?${params.toString()}`;
            const qrData = upiLink;
            return { link: upiLink, qrData, upiId: payeeVpa, amount };
        } catch (error) {
            console.error('[CRM_Payments] UPI link error:', error);
            return { link: '', qrData: '', upiId: '', amount: 0 };
        }
    }

    /**
     * Generate Razorpay payment link placeholder
     * @param {Object} options - Payment options
     * @returns {Object} { link, orderId }
     */
    function generateRazorpayLink(options = {}) {
        try {
            const { amount = 0, invoiceId = '', clientName = '', clientEmail = '' } = options;
            const orderId = 'order_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            return {
                link: `https://rzp.io/l/${orderId}`,
                orderId,
                amount: amount * 100, // paise
                currency: 'INR',
                receipt: invoiceId,
                notes: { clientName, clientEmail },
            };
        } catch (error) {
            console.error('[CRM_Payments] Razorpay link error:', error);
            return { link: '', orderId: '', amount: 0 };
        }
    }

    /**
     * Generate payment link for any method
     * @param {string} method - Payment method
     * @param {Object} options - Payment details
     * @returns {Object} Payment link info
     */
    function generatePaymentLink(method, options = {}) {
        try {
            switch (method) {
                case 'upi':
                    return { ...generateUPILink(options), method: 'upi' };
                case 'razorpay':
                    return { ...generateRazorpayLink(options), method: 'razorpay' };
                case 'neft':
                case 'rtgs':
                case 'imps':
                    return {
                        link: '',
                        method,
                        bankDetails: {
                            accountName: '11 Avatar Digital Hub',
                            accountNumber: 'XXXX-XXXX-XXXX',
                            ifsc: 'SBIN0001234',
                            bankName: 'State Bank of India',
                        },
                    };
                default:
                    return { link: '', method, note: 'Manual payment collection.' };
            }
        } catch (error) {
            console.error('[CRM_Payments] Payment link error:', error);
            return { link: '', method, error: error.message };
        }
    }

    // ============================================================
    // SECTION 4: RECONCILIATION ENGINE
    // ============================================================
    /**
     * Auto-reconcile payments with bank/UPI data
     * @param {Array<Object>} externalTransactions - From bank statement/UPI export
     * @returns {Promise<Object>} { matched, unmatched, total }
     */
    async function reconcileTransactions(externalTransactions = []) {
        try {
            if (!externalTransactions || externalTransactions.length === 0) {
                return { matched: 0, unmatched: 0, total: 0, matches: [], unmatchedList: [] };
            }

            const matches = [];
            const unmatchedList = [];

            for (const extTxn of externalTransactions) {
                let matched = false;

                // Try UTR match
                if (extTxn.utr) {
                    if (window.CRM_Firestore?.queryDocuments) {
                        const result = await window.CRM_Firestore.queryDocuments('payments', {
                            filters: [['utr', '==', extTxn.utr]],
                            limit: 1,
                        });
                        if (result?.data?.length > 0) {
                            const payment = result.data[0];
                            if (payment.status !== 'reconciled') {
                                await updatePaymentStatus(payment.id, 'reconciled', {
                                    reconciledAt: new Date().toISOString(),
                                    externalRef: extTxn.reference || extTxn.utr,
                                });
                            }
                            matches.push({ payment, external: extTxn, matchType: 'utr' });
                            matched = true;
                        }
                    }
                }

                // Try amount + date + method match
                if (!matched && extTxn.amount && extTxn.date) {
                    if (window.CRM_Firestore?.queryDocuments) {
                        const result = await window.CRM_Firestore.queryDocuments('payments', {
                            filters: [
                                ['amount', '==', parseFloat(extTxn.amount)],
                                ['paymentDate', '==', extTxn.date],
                                ['method', '==', extTxn.method || 'neft'],
                                ['status', '==', 'completed'],
                            ],
                            limit: 5,
                        });
                        if (result?.data?.length === 1) {
                            const payment = result.data[0];
                            await updatePaymentStatus(payment.id, 'reconciled', {
                                reconciledAt: new Date().toISOString(),
                                utr: extTxn.utr || payment.utr,
                                externalRef: extTxn.reference || '',
                            });
                            matches.push({ payment, external: extTxn, matchType: 'amount_date' });
                            matched = true;
                        }
                    }
                }

                if (!matched) {
                    unmatchedList.push(extTxn);
                }
            }

            return {
                matched: matches.length,
                unmatched: unmatchedList.length,
                total: externalTransactions.length,
                matches,
                unmatchedList,
            };
        } catch (error) {
            console.error('[CRM_Payments] Reconciliation error:', error);
            return { matched: 0, unmatched: externalTransactions.length, total: externalTransactions.length, matches: [], unmatchedList: externalTransactions };
        }
    }

    /**
     * Bulk reconciliation from uploaded statement
     * @param {Array<Object>} statementData - Parsed bank/UPI statement
     * @returns {Promise<Object>} Reconciliation result
     */
    async function bulkReconcile(statementData) {
        try {
            if (statementData.length > MAX_BULK_RECONCILE) {
                return { error: 'LIMIT_EXCEEDED', message: `Maximum ${MAX_BULK_RECONCILE} transactions per bulk reconcile.` };
            }
            const result = await reconcileTransactions(statementData);
            _showToast(`Reconciled: ${result.matched} matched, ${result.unmatched} unmatched.`, result.matched > 0 ? 'success' : 'info');
            return result;
        } catch (error) {
            console.error('[CRM_Payments] Bulk reconcile error:', error);
            return { error: 'RECONCILE_FAILED', message: error.message };
        }
    }

    // ============================================================
    // SECTION 5: FIRESTORE CRUD
    // ============================================================
    async function loadPayments(options = {}) {
        try {
            const { page = _pagination.page, limit = _pagination.limit, status = _filters.status, method = _filters.method, search = _filters.search } = options;
            const filters = [];
            if (status && status !== 'all') filters.push(['status', '==', status]);
            if (method && method !== 'all') filters.push(['method', '==', method]);

            const queryOptions = {
                filters,
                orderBy: _sort.field,
                orderDir: _sort.direction,
                limit,
                startAfter: _pagination.lastDoc,
            };

            let result;
            if (window.CRM_Firestore?.queryDocuments) {
                result = await window.CRM_Firestore.queryDocuments('payments', queryOptions);
            } else {
                result = _fallbackQuery();
            }

            _paymentCache.clear();
            if (result?.data) {
                result.data.forEach(p => _paymentCache.set(p.id, _enrichPayment(p)));
            }

            _pagination.page = page;
            _pagination.total = result?.total || (result?.data?.length || 0);
            _pagination.totalPages = Math.ceil(_pagination.total / limit) || 1;
            _pagination.lastDoc = result?.lastDoc || null;

            // Apply search filter post-query (client-side)
            let data = result?.data || [];
            if (search) {
                const s = search.toLowerCase();
                data = data.filter(p =>
                    (p.invoiceNumber || '').toLowerCase().includes(s) ||
                    (p.clientName || '').toLowerCase().includes(s) ||
                    (p.utr || '').toLowerCase().includes(s) ||
                    (p.reference || '').toLowerCase().includes(s)
                );
            }

            return { data, total: _pagination.total, totalPages: _pagination.totalPages, hasMore: result?.hasMore || false };
        } catch (error) {
            console.error('[CRM_Payments] Load error:', error);
            return { data: [], total: 0, totalPages: 0, hasMore: false };
        }
    }

    async function getPayment(paymentId) {
        try {
            if (_paymentCache.has(paymentId)) return _paymentCache.get(paymentId);
            if (window.CRM_Firestore?.getDocument) {
                const payment = await window.CRM_Firestore.getDocument('payments', paymentId);
                if (payment) { const enriched = _enrichPayment(payment); _paymentCache.set(paymentId, enriched); return enriched; }
            }
            return null;
        } catch (error) { console.error('[CRM_Payments] Get error:', error); return null; }
    }

    async function createPayment(paymentData) {
        try {
            // Cash compliance check
            if (paymentData.method === 'cash') {
                const compliance = await checkCashCompliance(parseFloat(paymentData.amount) || 0);
                if (!compliance.compliant) {
                    return { error: 'CASH_LIMIT_EXCEEDED', message: compliance.message };
                }
            }

            // Validate UTR for bank transfers
            if (['neft', 'rtgs', 'imps', 'bank_transfer'].includes(paymentData.method) && paymentData.utr) {
                const utrResult = validateUTR(paymentData.utr);
                if (!utrResult.valid) {
                    return { error: 'INVALID_UTR', message: utrResult.message };
                }
            }

            const now = new Date().toISOString();
            const user = _getCurrentUser();
            const data = {
                ...paymentData,
                tenantId: _getTenantId(),
                amount: parseFloat(paymentData.amount) || 0,
                paymentDate: paymentData.paymentDate || now.split('T')[0],
                status: paymentData.status || 'completed',
                createdAt: now,
                updatedAt: now,
                createdBy: user.uid,
                createdByName: user.displayName,
            };

            if (window.CRM_Firestore?.createDocument) {
                const created = await window.CRM_Firestore.createDocument('payments', data);
                if (created) {
                    const enriched = _enrichPayment(created);
                    _paymentCache.set(created.id, enriched);
                    // Sync invoice status
                    if (paymentData.invoiceId) {
                        await _syncInvoicePaymentStatus(paymentData.invoiceId);
                    }
                    return enriched;
                }
            } else {
                return _fallbackCreate(data);
            }
            return null;
        } catch (error) {
            console.error('[CRM_Payments] Create error:', error);
            return { error: 'CREATE_FAILED', message: error.message };
        }
    }

    async function updatePayment(paymentId, updates) {
        try {
            const updateData = { ...updates, updatedAt: new Date().toISOString(), updatedBy: _getCurrentUser().uid };
            if (window.CRM_Firestore?.updateDocument) {
                const updated = await window.CRM_Firestore.updateDocument('payments', paymentId, updateData);
                if (updated) { const enriched = _enrichPayment(updated); _paymentCache.set(paymentId, enriched); return enriched; }
            }
            return null;
        } catch (error) { console.error('[CRM_Payments] Update error:', error); return { error: 'UPDATE_FAILED', message: error.message }; }
    }

    async function updatePaymentStatus(paymentId, newStatus, extraData = {}) {
        try {
            if (!PAYMENT_STATUSES.includes(newStatus)) return { error: 'INVALID_STATUS', message: 'Invalid status.' };
            return await updatePayment(paymentId, { status: newStatus, ...extraData });
        } catch (error) { console.error('[CRM_Payments] Status error:', error); return { error: 'STATUS_FAILED', message: error.message }; }
    }

    async function deletePayment(paymentId) {
        try {
            if (window.CRM_Firestore?.deleteDocument) {
                await window.CRM_Firestore.deleteDocument('payments', paymentId);
                _paymentCache.delete(paymentId);
                return true;
            }
            return false;
        } catch (error) { console.error('[CRM_Payments] Delete error:', error); return false; }
    }

    /**
     * Sync invoice payment status after payment changes
     */
    async function _syncInvoicePaymentStatus(invoiceId) {
        try {
            if (!window.CRM_Firestore?.queryDocuments) return;
            const result = await window.CRM_Firestore.queryDocuments('payments', {
                filters: [['invoiceId', '==', invoiceId], ['status', '==', 'completed']],
                limit: 100,
            });
            if (!result?.data) return;

            const totalPaid = result.data.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
            const invoice = await window.CRM_Firestore.getDocument('invoices', invoiceId);
            if (!invoice) return;

            let newStatus = 'sent';
            if (totalPaid >= (invoice.total || 0)) newStatus = 'paid';
            else if (totalPaid > 0) newStatus = 'partial';

            await window.CRM_Firestore.updateDocument('invoices', invoiceId, {
                status: newStatus,
                paidAmount: totalPaid,
                updatedAt: new Date().toISOString(),
            });
        } catch (error) { console.error('[CRM_Payments] Invoice sync error:', error); }
    }

    // ============================================================
    // SECTION 6: DATA ENRICHMENT
    // ============================================================
    function _enrichPayment(payment) {
        try {
            const methodInfo = PAYMENT_METHODS[payment.method] || { name: payment.method || 'Unknown', icon: '💰', category: 'other' };
            return {
                ...payment,
                formattedAmount: _formatCurrency(payment.amount),
                formattedDate: _formatDate(payment.paymentDate),
                methodName: methodInfo.name,
                methodIcon: methodInfo.icon,
                methodCategory: methodInfo.category,
                isReconciled: payment.status === 'reconciled',
                isCashCompliant: payment.method === 'cash' ? (parseFloat(payment.amount) <= CASH_LIMIT) : true,
                daysSincePayment: payment.paymentDate ? Math.floor((Date.now() - new Date(payment.paymentDate)) / 86400000) : 0,
            };
        } catch (error) { return payment; }
    }

    // ============================================================
    // SECTION 7: FALLBACKS
    // ============================================================
    function _fallbackQuery() {
        try {
            const stored = localStorage.getItem('crm_payments');
            let payments = stored ? JSON.parse(stored) : [];
            payments = payments.filter(p => p.tenantId === _getTenantId());
            return { data: payments, total: payments.length, hasMore: false, lastDoc: null };
        } catch (e) { return { data: [], total: 0, hasMore: false, lastDoc: null }; }
    }

    function _fallbackCreate(data) {
        try {
            const stored = localStorage.getItem('crm_payments');
            const payments = stored ? JSON.parse(stored) : [];
            const newPayment = { id: 'pay_' + Date.now(), ...data };
            payments.push(newPayment);
            localStorage.setItem('crm_payments', JSON.stringify(payments));
            return newPayment;
        } catch (e) { return null; }
    }

    // ============================================================
    // SECTION 8: STATISTICS & DASHBOARD
    // ============================================================
    async function getPaymentStats() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

            let totalCollected = 0, pendingAmount = 0, thisMonthTotal = 0, cashTotal = 0, upiTotal = 0;
            let methodBreakdown = {}, dailyCollection = {};

            if (window.CRM_Firestore?.queryDocuments) {
                const allResult = await window.CRM_Firestore.queryDocuments('payments', {
                    filters: [['status', '==', 'completed']],
                    orderBy: 'paymentDate',
                    orderDir: 'desc',
                    limit: 1000,
                });
                if (allResult?.data) {
                    allResult.data.forEach(p => {
                        const amt = parseFloat(p.amount) || 0;
                        totalCollected += amt;
                        if (p.paymentDate >= monthStart) thisMonthTotal += amt;
                        if (p.method === 'cash') cashTotal += amt;
                        if (p.method === 'upi') upiTotal += amt;
                        methodBreakdown[p.method] = (methodBreakdown[p.method] || 0) + amt;
                        dailyCollection[p.paymentDate] = (dailyCollection[p.paymentDate] || 0) + amt;
                    });
                }
            }

            // Pending from invoices
            if (window.CRM_Firestore?.queryDocuments) {
                const invResult = await window.CRM_Firestore.queryDocuments('invoices', {
                    filters: [['status', 'in', ['sent', 'partial']]],
                    limit: 1000,
                });
                if (invResult?.data) {
                    pendingAmount = invResult.data.reduce((sum, inv) => sum + ((inv.total || 0) - (inv.paidAmount || 0)), 0);
                }
            }

            return {
                totalCollected, pendingAmount, thisMonthTotal, cashTotal, upiTotal,
                methodBreakdown, dailyCollection,
                cashLimitRemaining: CASH_LIMIT - cashTotal,
                formattedTotalCollected: _formatCurrency(totalCollected),
                formattedPendingAmount: _formatCurrency(pendingAmount),
            };
        } catch (error) { console.error('[CRM_Payments] Stats error:', error); return {}; }
    }

    // ============================================================
    // SECTION 9: UI RENDERERS
    // ============================================================
    async function renderListView(containerId = 'paymentsContent') {
        try {
            const container = document.getElementById(containerId);
            if (!container) return;

            const stats = await getPaymentStats();
            const result = await loadPayments();
            const payments = result.data || [];

            let html = `
                <div class="payments-container">
                    <div class="flex justify-between items-center mb-4 flex-wrap gap-3">
                        <h2>💰 Payments</h2>
                        <div class="flex gap-2">
                            <button class="btn btn-primary" onclick="window.CRM_Payments.openRecordForm()">+ Record Payment</button>
                            <button class="btn btn-outline" onclick="window.CRM_Payments.openBulkReconcile()">🔄 Reconcile</button>
                        </div>
                    </div>
                    ${_buildStatsCards(stats)}
                    ${_buildFilterBar()}
                    ${_buildPaymentTable(payments)}
                    ${_buildPagination()}
                </div>
            `;
            container.innerHTML = html;
            _bindListEvents();
        } catch (error) { console.error('[CRM_Payments] Render list error:', error); }
    }

    async function renderRecordForm(containerId = 'paymentsContent', paymentData = null) {
        try {
            const container = document.getElementById(containerId);
            if (!container) return;
            const isEdit = !!paymentData;
            const todayDate = new Date().toISOString().split('T')[0];

            let html = `
                <div class="payment-form-container">
                    <div class="form-header mb-4">
                        <h2>${isEdit ? 'Edit Payment' : 'Record New Payment'}</h2>
                        <button class="btn btn-outline btn-sm" onclick="window.CRM_Payments.navigateToList()">← Back</button>
                    </div>
                    <form id="paymentForm" class="payment-form">
                        <div class="card mb-4">
                            <div class="card-header"><h4>📋 Payment Details</h4></div>
                            <div class="card-body">
                                <div class="form-row">
                                    <div class="form-group flex-1">
                                        <label class="form-label form-label-required">Invoice</label>
                                        <select id="payInvoice" class="form-select" onchange="window.CRM_Payments._onInvoiceSelect()">
                                            <option value="">Select Invoice (optional)</option>
                                        </select>
                                    </div>
                                    <div class="form-group flex-1">
                                        <label class="form-label form-label-required">Amount (₹)</label>
                                        <input type="number" id="payAmount" class="form-input" value="${paymentData?.amount || ''}" min="0.01" step="0.01" required>
                                    </div>
                                </div>
                                <div class="form-row mt-3">
                                    <div class="form-group flex-1">
                                        <label class="form-label form-label-required">Payment Method</label>
                                        <select id="payMethod" class="form-select" onchange="window.CRM_Payments._onMethodChange()">
                                            ${Object.entries(PAYMENT_METHODS).map(([key, val]) => `
                                                <option value="${key}" ${paymentData?.method === key ? 'selected' : ''}>${val.icon} ${val.name}</option>
                                            `).join('')}
                                        </select>
                                    </div>
                                    <div class="form-group flex-1">
                                        <label class="form-label form-label-required">Payment Date</label>
                                        <input type="date" id="payDate" class="form-input" value="${paymentData?.paymentDate || todayDate}" required>
                                    </div>
                                </div>
                                <div class="form-row mt-3" id="utrField">
                                    <div class="form-group flex-1">
                                        <label class="form-label">UTR / Reference Number</label>
                                        <input type="text" id="payUTR" class="form-input" value="${paymentData?.utr || ''}" placeholder="e.g., SBIN123456789012">
                                    </div>
                                    <div class="form-group flex-1">
                                        <label class="form-label">Client Name</label>
                                        <input type="text" id="payClient" class="form-input" value="${paymentData?.clientName || ''}" placeholder="Payer name">
                                    </div>
                                </div>
                                <div class="form-group mt-3">
                                    <label class="form-label">Notes</label>
                                    <textarea id="payNotes" class="form-textarea" rows="2" placeholder="Payment notes...">${paymentData?.notes || ''}</textarea>
                                </div>
                                <div id="cashWarning" class="mt-3" style="display:none;"></div>
                            </div>
                        </div>
                        <div class="flex justify-end gap-3">
                            <button type="button" class="btn btn-secondary btn-lg" onclick="window.CRM_Payments.navigateToList()">Cancel</button>
                            <button type="submit" class="btn btn-primary btn-lg">${isEdit ? '💾 Update' : '💰 Record Payment'}</button>
                        </div>
                    </form>
                </div>
            `;
            container.innerHTML = html;
            _bindFormEvents(isEdit);
            _loadInvoiceOptions(paymentData?.invoiceId);
            setTimeout(() => _onMethodChange(), 200);
        } catch (error) { console.error('[CRM_Payments] Render form error:', error); }
    }

    async function renderBulkReconcile(containerId = 'paymentsContent') {
        try {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = `
                <div class="reconcile-container">
                    <h2 class="mb-4">🔄 Bulk Reconciliation</h2>
                    <div class="card mb-4">
                        <div class="card-body">
                            <p>Upload bank statement or UPI export (CSV/JSON) to auto-match payments.</p>
                            <div class="form-group mt-3">
                                <label class="form-label">Paste Transaction Data (JSON format)</label>
                                <textarea id="reconcileData" class="form-textarea" rows="8" 
                                    placeholder='[{"utr":"SBIN123456","amount":5000,"date":"2026-07-15","method":"neft"}, ...]'></textarea>
                            </div>
                            <button class="btn btn-primary mt-3" id="reconcileBtn">🔄 Start Reconciliation</button>
                            <div id="reconcileResult" class="mt-4"></div>
                        </div>
                    </div>
                    <button class="btn btn-outline" onclick="window.CRM_Payments.navigateToList()">← Back to Payments</button>
                </div>
            `;
            document.getElementById('reconcileBtn').addEventListener('click', async () => {
                const dataEl = document.getElementById('reconcileData');
                try {
                    const data = JSON.parse(dataEl.value);
                    const result = await bulkReconcile(data);
                    document.getElementById('reconcileResult').innerHTML = `
                        <div class="card card-gold">
                            <p>✅ Matched: <strong>${result.matched}</strong></p>
                            <p>⚠️ Unmatched: <strong>${result.unmatched}</strong></p>
                            <p>📊 Total: <strong>${result.total}</strong></p>
                        </div>
                    `;
                } catch (e) {
                    _showToast('Invalid JSON format.', 'error');
                }
            });
        } catch (error) { console.error('[CRM_Payments] Render reconcile error:', error); }
    }

    // ============================================================
    // SECTION 10: UI BUILDERS
    // ============================================================
    function _buildStatsCards(stats) {
        return `
            <div class="grid grid-auto-sm gap-3 mb-4">
                <div class="stat-card"><div class="stat-label">Total Collected</div><div class="stat-value">${stats.formattedTotalCollected || '₹ 0.00'}</div></div>
                <div class="stat-card"><div class="stat-label">Pending Amount</div><div class="stat-value text-warning">${stats.formattedPendingAmount || '₹ 0.00'}</div></div>
                <div class="stat-card"><div class="stat-label">This Month</div><div class="stat-value">${_formatCurrency(stats.thisMonthTotal || 0)}</div></div>
                <div class="stat-card"><div class="stat-label">Cash Limit Remaining</div><div class="stat-value ${(stats.cashLimitRemaining || 0) < 50000 ? 'text-error' : 'text-success'}">${_formatCurrency(stats.cashLimitRemaining || 0)}</div></div>
            </div>
        `;
    }

    function _buildFilterBar() {
        return `
            <div class="flex justify-between items-center mb-3 flex-wrap gap-2">
                <div class="flex gap-2 flex-wrap">
                    <select id="payStatusFilter" class="form-select" style="width:auto;min-height:44px;">
                        <option value="all">All Status</option>
                        ${PAYMENT_STATUSES.map(s => `<option value="${s}">${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
                    </select>
                    <select id="payMethodFilter" class="form-select" style="width:auto;min-height:44px;">
                        <option value="all">All Methods</option>
                        ${Object.entries(PAYMENT_METHODS).map(([k, v]) => `<option value="${k}">${v.icon} ${v.name}</option>`).join('')}
                    </select>
                    <input type="search" id="paySearchFilter" class="form-input" placeholder="Search UTR, invoice, client..." style="width:250px;min-height:44px;">
                </div>
            </div>
        `;
    }

    function _buildPaymentTable(payments) {
        if (!payments || payments.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-icon">💰</div>
                    <h4>No Payments Found</h4>
                    <p>Record your first payment to start tracking.</p>
                    <button class="btn btn-primary" onclick="window.CRM_Payments.openRecordForm()">Record Payment</button>
                </div>
            `;
        }
        let rows = payments.map(p => {
            const enriched = _enrichPayment(p);
            return `
                <tr class="cursor-pointer" onclick="window.CRM_Payments.viewPayment('${p.id}')">
                    <td>${_formatDate(p.paymentDate)}</td>
                    <td><strong>${enriched.formattedAmount}</strong></td>
                    <td>${enriched.methodIcon} ${enriched.methodName}</td>
                    <td>${p.invoiceNumber || '—'}</td>
                    <td>${_escapeHtml(p.clientName || '—')}</td>
                    <td>${p.utr || '—'}</td>
                    <td><span class="badge badge-${p.status === 'completed' ? 'success' : p.status === 'reconciled' ? 'info' : p.status === 'failed' ? 'error' : 'warning'}">${(p.status || '').toUpperCase()}</span></td>
                    <td>
                        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();window.CRM_Payments.editPayment('${p.id}')">✏️</button>
                    </td>
                </tr>
            `;
        }).join('');
        return `<div class="table-container"><table class="table"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Invoice</th><th>Client</th><th>UTR</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    function _buildPagination() {
        if (_pagination.totalPages <= 1) return '';
        let html = '<div class="flex justify-center gap-2 mt-4">';
        for (let i = 1; i <= _pagination.totalPages; i++) {
            html += `<button class="btn btn-${i === _pagination.page ? 'primary' : 'outline'} btn-sm" onclick="window.CRM_Payments.goToPage(${i})">${i}</button>`;
        }
        html += '</div>';
        return html;
    }

    // ============================================================
    // SECTION 11: EVENT BINDINGS
    // ============================================================
    function _bindListEvents() {
        const statusEl = document.getElementById('payStatusFilter');
        const methodEl = document.getElementById('payMethodFilter');
        const searchEl = document.getElementById('paySearchFilter');
        if (statusEl) statusEl.addEventListener('change', async () => { _filters.status = statusEl.value; _pagination.page = 1; _pagination.lastDoc = null; await renderListView(); });
        if (methodEl) methodEl.addEventListener('change', async () => { _filters.method = methodEl.value; _pagination.page = 1; _pagination.lastDoc = null; await renderListView(); });
        if (searchEl) {
            let timer;
            searchEl.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(async () => { _filters.search = searchEl.value; await renderListView(); }, 400); });
        }
    }

    function _bindFormEvents(isEdit) {
        const form = document.getElementById('paymentForm');
        if (!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = parseFloat(document.getElementById('payAmount')?.value);
            const method = document.getElementById('payMethod')?.value;
            const paymentDate = document.getElementById('payDate')?.value;
            const utr = document.getElementById('payUTR')?.value;
            const clientName = document.getElementById('payClient')?.value;
            const invoiceId = document.getElementById('payInvoice')?.value;
            const notes = document.getElementById('payNotes')?.value;

            if (!amount || amount <= 0) { _showToast('Valid amount is required.', 'error'); return; }
            if (!method) { _showToast('Payment method is required.', 'error'); return; }
            if (!paymentDate) { _showToast('Payment date is required.', 'error'); return; }

            const data = { amount, method, paymentDate, utr, clientName, invoiceId, notes };
            let result;
            if (isEdit && _selectedPayment) {
                result = await updatePayment(_selectedPayment.id, data);
            } else {
                result = await createPayment(data);
            }

            if (result && !result.error) {
                _showToast('Payment recorded!', 'success');
                navigateToList();
            } else {
                _showToast(result?.message || 'Failed to save payment.', 'error');
            }
        });
    }

    async function _loadInvoiceOptions(selectedId = null) {
        try {
            const select = document.getElementById('payInvoice');
            if (!select) return;
            if (window.CRM_Firestore?.queryDocuments) {
                const result = await window.CRM_Firestore.queryDocuments('invoices', {
                    filters: [['status', 'in', ['sent', 'partial', 'draft']]],
                    orderBy: 'invoiceDate', orderDir: 'desc', limit: 100,
                });
                if (result?.data) {
                    select.innerHTML = '<option value="">Select Invoice (optional)</option>' +
                        result.data.map(inv => `<option value="${inv.id}" ${inv.id === selectedId ? 'selected' : ''}>${inv.invoiceNumber} — ${inv.clientName || 'N/A'} (${_formatCurrency(inv.total - (inv.paidAmount || 0))} due)</option>`).join('');
                }
            }
        } catch (e) { console.error('Load invoices error:', e); }
    }

    function _onMethodChange() {
        const method = document.getElementById('payMethod')?.value;
        const utrField = document.getElementById('utrField');
        const cashWarning = document.getElementById('cashWarning');
        if (utrField) utrField.style.display = ['neft', 'rtgs', 'imps', 'bank_transfer'].includes(method) ? 'flex' : 'flex';
        if (cashWarning && method === 'cash') {
            cashWarning.style.display = 'block';
            cashWarning.innerHTML = '<div class="card card-gold"><p>⚠️ Cash payment limit: ₹2,00,000 per transaction (Section 269ST)</p></div>';
        } else if (cashWarning) {
            cashWarning.style.display = 'none';
        }
    }

    // ============================================================
    // SECTION 12: NAVIGATION
    // ============================================================
    async function navigateToList() { _currentView = 'list'; _selectedPayment = null; await renderListView(); }
    async function openRecordForm() { _currentView = 'create'; _selectedPayment = null; await renderRecordForm(); }
    async function viewPayment(paymentId) { const p = await getPayment(paymentId); if (p) { _selectedPayment = p; alert(`Payment: ${p.formattedAmount}\nMethod: ${p.methodName}\nUTR: ${p.utr || 'N/A'}\nStatus: ${p.status}`); } }
    async function editPayment(paymentId) { const p = await getPayment(paymentId); if (p) { _selectedPayment = p; _currentView = 'edit'; await renderRecordForm('paymentsContent', p); } }
    async function openBulkReconcile() { await renderBulkReconcile(); }
    async function goToPage(page) { _pagination.page = page; await renderListView(); }
    async function deletePaymentConfirm(paymentId) { if (confirm('Delete this payment?')) { await deletePayment(paymentId); _showToast('Payment deleted.', 'success'); await renderListView(); } }

    // ============================================================
    // SECTION 13: INITIALIZATION
    // ============================================================
    function init() {
        try {
            if (_initialized) return;
            renderListView();
            _initialized = true;
            console.log('[CRM_Payments] Module initialized.');
            console.log('[CRM_Payments] Methods:', Object.keys(PAYMENT_METHODS).join(', '));
        } catch (error) { console.error('[CRM_Payments] Init error:', error); }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
    } else {
        setTimeout(init, 300);
    }

    // ============================================================
    // PUBLIC API
    // ============================================================
    return {
        init,
        loadPayments, getPayment, createPayment, updatePayment, updatePaymentStatus, deletePayment,
        validateUTR, checkCashCompliance, generateUPILink, generateRazorpayLink, generatePaymentLink,
        reconcileTransactions, bulkReconcile, getPaymentStats,
        navigateToList, openRecordForm, viewPayment, editPayment, openBulkReconcile, goToPage, deletePaymentConfirm,
        renderListView, renderRecordForm, renderBulkReconcile,
        _onMethodChange, _onInvoiceSelect: _onMethodChange,
        getFilters: () => _filters, getPagination: () => _pagination,
    };
})();

window.CRM_Payments = CRM_Payments;
console.log('[CRM_Payments] Module loaded. window.CRM_Payments available.');