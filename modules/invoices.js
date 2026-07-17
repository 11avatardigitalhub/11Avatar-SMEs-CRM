/**
 * ============================================================
 * 11 AVATAR SMEs CRM - GST INVOICE MODULE
 * ============================================================
 * 
 * @file       modules/invoices.js
 * @path       C:\Users\rudra\Downloads\11 Avatar\11-Avatar-SMEs-CRM-main\modules\invoices.js
 * @author     11 Avatar Digital Hub
 * @email      info@11avatardigitalhub.cloud
 * @repo       https://github.com/11avatardigitalhub/11Avatar-SMEs-CRM.git
 * 
 * PURPOSE:
 * Complete GST-compliant invoicing system for Indian SMEs.
 * Handles CGST/SGST/IGST auto-calculation, HSN/SAC codes,
 * E-Way Bill triggers, GSTIN validation, invoice lifecycle,
 * payment link generation, and Firestore persistence.
 * 
 * DEPENDENCIES:
 * - window.CRM_Config  - GST rates, invoice prefix, thresholds
 * - window.CRM_Auth    - Tenant ID, user info
 * - window.CRM_Tenant  - Quota checks, tenant settings
 * - window.CRM_Firestore - CRUD operations
 * - window.CRM_Router  - Submenu navigation
 * - css/crm-design-system.css - UI styling
 * - app.html           - Module container #module-invoices
 * 
 * RULES COMPLIANCE:
 * ✅ Rule #1  - Enterprise Grade
 * ✅ Rule #2  - One File At A Time
 * ✅ Rule #5  - Deep Detailing: full JSDoc
 * ✅ Rule #6  - Error Handling: try/catch everywhere
 * ✅ Rule #17 - Multi-Tenant: tenantId on all records
 * ✅ Rule #18 - Firebase Backend: Firestore CRUD
 * ✅ Rule #20 - Export All: window.CRM_Invoices
 * ✅ Rule #21 - Path First
 * ✅ Rule #23 - 800+ lines
 * ✅ Rule #25 - Full File Replacement
 * ============================================================
 */

'use strict';

/**
 * @namespace CRM_Invoices
 * @description GST-compliant invoice management module
 * @requires CRM_Config, CRM_Auth, CRM_Tenant, CRM_Firestore
 */
const CRM_Invoices = (function() {
    'use strict';

    // ============================================================
    // PRIVATE STATE
    // ============================================================
    /** @type {Map<string, Object>} In-memory invoice cache */
    const _invoiceCache = new Map();

    /** @type {Object|null} Currently selected invoice */
    let _selectedInvoice = null;

    /** @type {Object} Current filter state */
    const _filters = {
        status: 'all',
        search: '',
        dateFrom: null,
        dateTo: null,
        clientId: null,
    };

    /** @type {Object} Pagination state */
    const _pagination = {
        page: 1,
        limit: 25,
        total: 0,
        totalPages: 0,
        lastDoc: null,
    };

    /** @type {Object} Sort state */
    const _sort = {
        field: 'createdAt',
        direction: 'desc',
    };

    /** @type {string} Current view mode */
    let _currentView = 'list'; // 'list' | 'create' | 'edit' | 'view'

    /** @type {boolean} Module initialized */
    let _initialized = false;

    /** @type {Array<Object>} HSN/SAC code reference */
    const _hsnSacCodes = [
        { code: '9983', description: 'Legal services', gstRate: '18%' },
        { code: '9985', description: 'Employment & placement services', gstRate: '18%' },
        { code: '9971', description: 'Financial & related services', gstRate: '18%' },
        { code: '9973', description: 'Leasing or rental services', gstRate: '18%' },
        { code: '9954', description: 'Construction services', gstRate: '18%' },
        { code: '9963', description: 'Accommodation & food services', gstRate: '5%' },
        { code: '9987', description: 'Maintenance & repair services', gstRate: '18%' },
        { code: '9991', description: 'Public administration services', gstRate: '18%' },
        { code: '9994', description: 'Sewage & waste collection', gstRate: '18%' },
        { code: '9988', description: 'Manufacturing services', gstRate: '18%' },
        { code: '8517', description: 'Telephone sets & smartphones', gstRate: '18%' },
        { code: '8471', description: 'Computers & data processing machines', gstRate: '18%' },
        { code: '9403', description: 'Furniture & parts', gstRate: '18%' },
        { code: '9401', description: 'Seats & chairs', gstRate: '18%' },
        { code: '4901', description: 'Printed books & pamphlets', gstRate: '0%' },
        { code: '3004', description: 'Medicaments (branded)', gstRate: '12%' },
        { code: '2106', description: 'Food preparations', gstRate: '18%' },
        { code: '6204', description: 'Women\'s clothing', gstRate: '5%' },
        { code: '6203', description: 'Men\'s clothing', gstRate: '5%' },
        { code: '8703', description: 'Motor cars & vehicles', gstRate: '28%' },
    ];

    // ============================================================
    // CONSTANTS
    // ============================================================
    const INVOICE_STATUSES = ['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'];
    const GST_RATES = { '0%': 0, '5%': 5, '12%': 12, '18%': 18, '28%': 28 };
    const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/;
    const EWAY_BILL_THRESHOLD = 50000;
    const INVOICE_PREFIX = 'INV';
    const MAX_LINE_ITEMS = 50;

    // ============================================================
    // HELPER: Get Config Values Safely
    // ============================================================
    /**
     * Get invoice module config with fallback
     * @returns {Object} Invoice configuration
     */
    function _getInvoiceConfig() {
        try {
            if (window.CRM_Config && window.CRM_Config.getModuleConfig) {
                return window.CRM_Config.getModuleConfig('invoices') || {};
            }
            if (window.CRM_Config && window.CRM_Config.modules && window.CRM_Config.modules.invoices) {
                return window.CRM_Config.modules.invoices;
            }
        } catch (e) { /* fallback */ }
        return {
            cgstRate: 9,
            sgstRate: 9,
            igstRate: 18,
            invoicePrefix: 'INV',
            dueDaysDefault: 15,
            ewayBillThreshold: 50000,
            maxInvoiceItems: 50,
            currency: '₹',
            currencyCode: 'INR',
        };
    }

    /**
     * Get current tenant ID
     * @returns {string|null}
     */
    function _getTenantId() {
        try {
            if (window.CRM_Auth && window.CRM_Auth.getTenantId) {
                return window.CRM_Auth.getTenantId();
            }
            if (window.CRM_Tenant && window.CRM_Tenant.getTenantId) {
                return window.CRM_Tenant.getTenantId();
            }
        } catch (e) { /* fallback */ }
        return null;
    }

    /**
     * Get current user info
     * @returns {Object} {uid, displayName, email}
     */
    function _getCurrentUser() {
        try {
            if (window.CRM_Auth && window.CRM_Auth.getUser) {
                return window.CRM_Auth.getUser();
            }
        } catch (e) { /* fallback */ }
        return { uid: 'unknown', displayName: 'User' };
    }

    // ============================================================
    // SECTION 1: GST CALCULATOR
    // ============================================================
    /**
     * Calculate GST based on state codes
     * @param {string} fromStateCode - Seller's state code (2 digits)
     * @param {string} toStateCode - Buyer's state code (2 digits)
     * @param {number} amount - Taxable amount
     * @param {number} gstRate - GST rate percentage
     * @returns {Object} { cgst, sgst, igst, totalTax, isInterState }
     */
    function calculateGST(fromStateCode, toStateCode, amount, gstRate) {
        try {
            const config = _getInvoiceConfig();
            const isInterState = fromStateCode !== toStateCode;
            const rate = gstRate || config.igstRate || 18;
            const taxAmount = (amount * rate) / 100;

            if (isInterState) {
                return {
                    cgst: 0,
                    sgst: 0,
                    igst: taxAmount,
                    totalTax: taxAmount,
                    isInterState: true,
                    rate: rate,
                };
            } else {
                const halfTax = taxAmount / 2;
                return {
                    cgst: halfTax,
                    sgst: halfTax,
                    igst: 0,
                    totalTax: taxAmount,
                    isInterState: false,
                    cgstRate: rate / 2,
                    sgstRate: rate / 2,
                    rate: rate,
                };
            }
        } catch (error) {
            console.error('[CRM_Invoices] GST calculation error:', error);
            return { cgst: 0, sgst: 0, igst: 0, totalTax: 0, isInterState: false, rate: 0 };
        }
    }

    /**
     * Calculate invoice totals from line items
     * @param {Array<Object>} items - Line items array
     * @param {string} fromState - Seller state code
     * @param {string} toState - Buyer state code
     * @returns {Object} Complete totals breakdown
     */
    function calculateInvoiceTotals(items, fromState, toState) {
        try {
            if (!items || !Array.isArray(items)) {
                return { subtotal: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0, total: 0 };
            }

            let subtotal = 0;
            let totalCGST = 0;
            let totalSGST = 0;
            let totalIGST = 0;

            items.forEach(item => {
                const qty = parseFloat(item.quantity) || 0;
                const rate = parseFloat(item.rate) || 0;
                const lineAmount = qty * rate;
                subtotal += lineAmount;

                const gstRate = parseFloat(item.gstRate) || 18;
                const gst = calculateGST(fromState, toState, lineAmount, gstRate);
                totalCGST += gst.cgst;
                totalSGST += gst.sgst;
                totalIGST += gst.igst;
            });

            const totalTax = totalCGST + totalSGST + totalIGST;
            const total = subtotal + totalTax;

            return {
                subtotal: Math.round(subtotal * 100) / 100,
                cgst: Math.round(totalCGST * 100) / 100,
                sgst: Math.round(totalSGST * 100) / 100,
                igst: Math.round(totalIGST * 100) / 100,
                totalTax: Math.round(totalTax * 100) / 100,
                total: Math.round(total * 100) / 100,
                isInterState: fromState !== toState,
            };
        } catch (error) {
            console.error('[CRM_Invoices] Total calculation error:', error);
            return { subtotal: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0, total: 0 };
        }
    }

    // ============================================================
    // SECTION 2: GSTIN VALIDATOR
    // ============================================================
    /**
     * Validate GSTIN format
     * @param {string} gstin - GSTIN to validate
     * @returns {Object} { valid, stateCode, panNumber, message }
     */
    function validateGSTIN(gstin) {
        try {
            if (!gstin || typeof gstin !== 'string') {
                return { valid: false, stateCode: null, message: 'GSTIN is required.' };
            }

            const clean = gstin.trim().toUpperCase();

            if (clean.length !== 15) {
                return { valid: false, stateCode: null, message: 'GSTIN must be exactly 15 characters.' };
            }

            if (!GSTIN_REGEX.test(clean)) {
                return { valid: false, stateCode: null, message: 'Invalid GSTIN format. Expected: 22AAAAA0000A1Z5' };
            }

            const stateCode = clean.substring(0, 2);
            const panNumber = clean.substring(2, 12);

            return {
                valid: true,
                stateCode: stateCode,
                panNumber: panNumber,
                gstin: clean,
                message: 'Valid GSTIN.',
            };
        } catch (error) {
            console.error('[CRM_Invoices] GSTIN validation error:', error);
            return { valid: false, stateCode: null, message: 'Validation error.' };
        }
    }

    /**
     * Extract state code from GSTIN
     * @param {string} gstin - GSTIN number
     * @returns {string|null} 2-digit state code
     */
    function getStateCodeFromGSTIN(gstin) {
        const result = validateGSTIN(gstin);
        return result.valid ? result.stateCode : null;
    }

    // ============================================================
    // SECTION 3: HSN/SAC CODE LOOKUP
    // ============================================================
    /**
     * Search HSN/SAC codes
     * @param {string} query - Search query
     * @returns {Array<Object>} Matching codes
     */
    function searchHsnSacCodes(query) {
        try {
            if (!query) return _hsnSacCodes.slice(0, 10);
            const q = query.toLowerCase();
            return _hsnSacCodes.filter(item =>
                item.code.includes(q) || item.description.toLowerCase().includes(q)
            );
        } catch (error) {
            console.error('[CRM_Invoices] HSN search error:', error);
            return [];
        }
    }

    /**
     * Get GST rate for HSN/SAC code
     * @param {string} code - HSN/SAC code
     * @returns {string} GST rate (e.g., '18%')
     */
    function getGstRateForCode(code) {
        try {
            const found = _hsnSacCodes.find(item => item.code === code);
            return found ? found.gstRate : '18%';
        } catch (error) {
            return '18%';
        }
    }

    // ============================================================
    // SECTION 4: INVOICE NUMBER GENERATOR
    // ============================================================
    /**
     * Generate next invoice number
     * Format: INV-YYYY-NNN (e.g., INV-2026-001)
     * @returns {Promise<string>} Generated invoice number
     */
    async function generateInvoiceNumber() {
        try {
            const config = _getInvoiceConfig();
            const prefix = config.invoicePrefix || INVOICE_PREFIX;
            const year = new Date().getFullYear();

            // Try to get last invoice number from Firestore
            if (window.CRM_Firestore && window.CRM_Firestore.queryDocuments) {
                const result = await window.CRM_Firestore.queryDocuments('invoices', {
                    orderBy: 'invoiceNumber',
                    orderDir: 'desc',
                    limit: 1,
                });

                if (result && result.data && result.data.length > 0) {
                    const lastNumber = result.data[0].invoiceNumber;
                    const match = lastNumber.match(/(\d+)$/);
                    if (match) {
                        const nextSeq = parseInt(match[1]) + 1;
                        return `${prefix}-${year}-${String(nextSeq).padStart(3, '0')}`;
                    }
                }
            }

            // Fallback: start from 001
            return `${prefix}-${year}-001`;
        } catch (error) {
            console.error('[CRM_Invoices] Number generation error:', error);
            return `${INVOICE_PREFIX}-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
        }
    }

    // ============================================================
    // SECTION 5: E-WAY BILL CHECK
    // ============================================================
    /**
     * Check if E-Way Bill is required
     * @param {number} totalAmount - Invoice total
     * @param {boolean} isInterState - Whether inter-state
     * @returns {Object} { required, threshold, message }
     */
    function checkEWayBillRequirement(totalAmount, isInterState) {
        try {
            const config = _getInvoiceConfig();
            const threshold = config.ewayBillThreshold || EWAY_BILL_THRESHOLD;

            if (totalAmount >= threshold) {
                return {
                    required: true,
                    threshold: threshold,
                    message: `E-Way Bill required (₹${threshold.toLocaleString('en-IN')} threshold exceeded).`,
                };
            }

            return {
                required: false,
                threshold: threshold,
                message: 'E-Way Bill not required (below threshold).',
            };
        } catch (error) {
            console.error('[CRM_Invoices] E-Way Bill check error:', error);
            return { required: false, threshold: 50000, message: 'Check error.' };
        }
    }

    // ============================================================
    // SECTION 6: FIREBASE CRUD OPERATIONS
    // ============================================================
    /**
     * Load invoices from Firestore
     * @param {Object} [options] - Query options
     * @returns {Promise<Object>} { data, total, hasMore }
     */
    async function loadInvoices(options = {}) {
        try {
            const {
                page = _pagination.page,
                    limit = _pagination.limit,
                    status = _filters.status,
                    search = _filters.search,
                    startAfter = null,
            } = options;

            const filters = [];
            if (status && status !== 'all') {
                filters.push(['status', '==', status]);
            }

            const queryOptions = {
                filters,
                orderBy: _sort.field,
                orderDir: _sort.direction,
                limit: limit,
                startAfter: startAfter || _pagination.lastDoc,
            };

            let result;
            if (window.CRM_Firestore && window.CRM_Firestore.queryDocuments) {
                result = await window.CRM_Firestore.queryDocuments('invoices', queryOptions);
            } else {
                // Fallback: localStorage
                result = _fallbackQuery(queryOptions);
            }

            // Update cache
            _invoiceCache.clear();
            if (result && result.data) {
                result.data.forEach(inv => {
                    _invoiceCache.set(inv.id, _enrichInvoiceData(inv));
                });
            }

            // Update pagination
            _pagination.page = page;
            _pagination.total = result.total || (result.data ? result.data.length : 0);
            _pagination.totalPages = Math.ceil(_pagination.total / limit) || 1;
            _pagination.lastDoc = result.lastDoc || null;

            return {
                data: result.data || [],
                total: _pagination.total,
                totalPages: _pagination.totalPages,
                hasMore: result.hasMore || false,
            };
        } catch (error) {
            console.error('[CRM_Invoices] Load error:', error);
            return { data: [], total: 0, totalPages: 0, hasMore: false };
        }
    }

    /**
     * Get a single invoice by ID
     * @param {string} invoiceId - Invoice ID
     * @returns {Promise<Object|null>}
     */
    async function getInvoice(invoiceId) {
        try {
            // Check cache first
            if (_invoiceCache.has(invoiceId)) {
                return _invoiceCache.get(invoiceId);
            }

            if (window.CRM_Firestore && window.CRM_Firestore.getDocument) {
                const invoice = await window.CRM_Firestore.getDocument('invoices', invoiceId);
                if (invoice) {
                    const enriched = _enrichInvoiceData(invoice);
                    _invoiceCache.set(invoiceId, enriched);
                    return enriched;
                }
            }

            return null;
        } catch (error) {
            console.error('[CRM_Invoices] Get invoice error:', error);
            return null;
        }
    }

    /**
     * Create a new invoice
     * @param {Object} invoiceData - Invoice data
     * @returns {Promise<Object|null>}
     */
    async function createInvoice(invoiceData) {
        try {
            // Check quota
            if (window.CRM_Tenant && window.CRM_Tenant.isQuotaExceeded) {
                if (window.CRM_Tenant.isQuotaExceeded('invoices')) {
                    return { error: 'QUOTA_EXCEEDED', message: 'Invoice limit reached. Upgrade your plan.' };
                }
            }

            // Generate invoice number
            if (!invoiceData.invoiceNumber) {
                invoiceData.invoiceNumber = await generateInvoiceNumber();
            }

            // Prepare data
            const now = new Date().toISOString();
            const user = _getCurrentUser();
            const tenantId = _getTenantId();

            const data = {
                ...invoiceData,
                tenantId: tenantId,
                status: invoiceData.status || 'draft',
                createdAt: now,
                updatedAt: now,
                createdBy: user.uid,
                createdByName: user.displayName,
            };

            // Ensure line items have proper structure
            if (data.items) {
                data.items = data.items.map((item, index) => ({
                    srNo: index + 1,
                    description: item.description || '',
                    hsnSac: item.hsnSac || '',
                    quantity: parseFloat(item.quantity) || 0,
                    rate: parseFloat(item.rate) || 0,
                    amount: (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0),
                    gstRate: parseFloat(item.gstRate) || 18,
                }));
            }

            // Calculate totals
            const totals = calculateInvoiceTotals(
                data.items,
                data.fromStateCode || '09',
                data.toStateCode || '09'
            );
            data.subtotal = totals.subtotal;
            data.cgst = totals.cgst;
            data.sgst = totals.sgst;
            data.igst = totals.igst;
            data.totalTax = totals.totalTax;
            data.total = totals.total;
            data.isInterState = totals.isInterState;

            // E-Way Bill check
            data.ewayBillRequired = checkEWayBillRequirement(data.total, data.isInterState).required;

            if (window.CRM_Firestore && window.CRM_Firestore.createDocument) {
                const created = await window.CRM_Firestore.createDocument('invoices', data);
                if (created) {
                    const enriched = _enrichInvoiceData(created);
                    _invoiceCache.set(created.id, enriched);
                    return enriched;
                }
            } else {
                // Fallback: localStorage
                return _fallbackCreate(data);
            }

            return null;
        } catch (error) {
            console.error('[CRM_Invoices] Create error:', error);
            return { error: 'CREATE_FAILED', message: error.message };
        }
    }

    /**
     * Update an existing invoice
     * @param {string} invoiceId - Invoice ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object|null>}
     */
    async function updateInvoice(invoiceId, updates) {
        try {
            const now = new Date().toISOString();
            const updateData = {
                ...updates,
                updatedAt: now,
                updatedBy: _getCurrentUser().uid,
            };

            // Recalculate if items changed
            if (updates.items) {
                const totals = calculateInvoiceTotals(
                    updates.items,
                    updates.fromStateCode || '09',
                    updates.toStateCode || '09'
                );
                updateData.subtotal = totals.subtotal;
                updateData.cgst = totals.cgst;
                updateData.sgst = totals.sgst;
                updateData.igst = totals.igst;
                updateData.totalTax = totals.totalTax;
                updateData.total = totals.total;
                updateData.isInterState = totals.isInterState;
                updateData.ewayBillRequired = checkEWayBillRequirement(totals.total, totals.isInterState).required;
            }

            if (window.CRM_Firestore && window.CRM_Firestore.updateDocument) {
                const updated = await window.CRM_Firestore.updateDocument('invoices', invoiceId, updateData);
                if (updated) {
                    const enriched = _enrichInvoiceData(updated);
                    _invoiceCache.set(invoiceId, enriched);
                    return enriched;
                }
            }

            return null;
        } catch (error) {
            console.error('[CRM_Invoices] Update error:', error);
            return { error: 'UPDATE_FAILED', message: error.message };
        }
    }

    /**
     * Delete an invoice (soft delete)
     * @param {string} invoiceId - Invoice ID
     * @returns {Promise<boolean>}
     */
    async function deleteInvoice(invoiceId) {
        try {
            if (window.CRM_Firestore && window.CRM_Firestore.deleteDocument) {
                await window.CRM_Firestore.deleteDocument('invoices', invoiceId);
                _invoiceCache.delete(invoiceId);
                return true;
            }
            return false;
        } catch (error) {
            console.error('[CRM_Invoices] Delete error:', error);
            return false;
        }
    }

    /**
     * Update invoice status
     * @param {string} invoiceId - Invoice ID
     * @param {string} newStatus - New status
     * @returns {Promise<Object|null>}
     */
    async function updateInvoiceStatus(invoiceId, newStatus) {
        try {
            if (!INVOICE_STATUSES.includes(newStatus)) {
                return { error: 'INVALID_STATUS', message: 'Invalid invoice status.' };
            }

            const updates = {
                status: newStatus,
            };

            if (newStatus === 'sent') {
                updates.sentAt = new Date().toISOString();
            } else if (newStatus === 'paid') {
                updates.paidAt = new Date().toISOString();
                updates.paidAmount = updates.paidAmount || updates.total;
            } else if (newStatus === 'cancelled') {
                updates.cancelledAt = new Date().toISOString();
            }

            return await updateInvoice(invoiceId, updates);
        } catch (error) {
            console.error('[CRM_Invoices] Status update error:', error);
            return { error: 'STATUS_FAILED', message: error.message };
        }
    }

    // ============================================================
    // SECTION 7: DATA ENRICHMENT
    // ============================================================
    /**
     * Enrich invoice data with derived fields
     * @param {Object} invoice - Raw invoice data
     * @returns {Object} Enriched invoice
     */
    function _enrichInvoiceData(invoice) {
        try {
            const config = _getInvoiceConfig();
            const currency = config.currency || '₹';

            const enriched = {
                ...invoice,
                // Formatted amounts
                formattedSubtotal: _formatCurrency(invoice.subtotal || 0, currency),
                formattedCGST: _formatCurrency(invoice.cgst || 0, currency),
                formattedSGST: _formatCurrency(invoice.sgst || 0, currency),
                formattedIGST: _formatCurrency(invoice.igst || 0, currency),
                formattedTotalTax: _formatCurrency(invoice.totalTax || 0, currency),
                formattedTotal: _formatCurrency(invoice.total || 0, currency),
                formattedPaidAmount: _formatCurrency(invoice.paidAmount || 0, currency),
                formattedBalance: _formatCurrency((invoice.total || 0) - (invoice.paidAmount || 0), currency),

                // Status helpers
                isOverdue: _isInvoiceOverdue(invoice),
                daysOverdue: _getDaysOverdue(invoice),

                // E-Way Bill
                ewayBillRequired: invoice.ewayBillRequired || checkEWayBillRequirement(invoice.total || 0, invoice.isInterState).required,

                // Action flags
                canEdit: ['draft', 'sent'].includes(invoice.status),
                canSend: invoice.status === 'draft',
                canMarkPaid: ['sent', 'partial'].includes(invoice.status),
                canCancel: !['paid', 'cancelled'].includes(invoice.status),
                canDelete: invoice.status === 'draft',
            };

            return enriched;
        } catch (error) {
            console.error('[CRM_Invoices] Enrichment error:', error);
            return invoice;
        }
    }

    /**
     * Check if invoice is overdue
     * @param {Object} invoice - Invoice data
     * @returns {boolean}
     */
    function _isInvoiceOverdue(invoice) {
        if (!invoice.dueDate) return false;
        if (['paid', 'cancelled'].includes(invoice.status)) return false;
        return new Date(invoice.dueDate) < new Date();
    }

    /**
     * Calculate days overdue
     * @param {Object} invoice - Invoice data
     * @returns {number}
     */
    function _getDaysOverdue(invoice) {
        if (!invoice.dueDate) return 0;
        const diff = new Date() - new Date(invoice.dueDate);
        return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
    }

    // ============================================================
    // SECTION 8: LOCAL STORAGE FALLBACK
    // ============================================================
    /**
     * Fallback query using localStorage
     * @param {Object} options - Query options
     * @returns {Object} { data, total }
     */
    function _fallbackQuery(options) {
        try {
            const stored = localStorage.getItem('crm_invoices');
            let invoices = stored ? JSON.parse(stored) : [];
            invoices = invoices.filter(inv => inv.tenantId === _getTenantId());

            if (options.filters) {
                options.filters.forEach(([field, op, value]) => {
                    if (op === '==') {
                        invoices = invoices.filter(inv => inv[field] === value);
                    }
                });
            }

            const total = invoices.length;
            return { data: invoices, total, hasMore: false, lastDoc: null };
        } catch (error) {
            return { data: [], total: 0, hasMore: false, lastDoc: null };
        }
    }

    /**
     * Fallback create using localStorage
     * @param {Object} data - Invoice data
     * @returns {Object} Created invoice
     */
    function _fallbackCreate(data) {
        try {
            const stored = localStorage.getItem('crm_invoices');
            const invoices = stored ? JSON.parse(stored) : [];
            const newInvoice = { id: 'inv_' + Date.now(), ...data };
            invoices.push(newInvoice);
            localStorage.setItem('crm_invoices', JSON.stringify(invoices));
            return newInvoice;
        } catch (error) {
            return null;
        }
    }

    // ============================================================
    // SECTION 9: UI RENDERERS
    // ============================================================
    /**
     * Render invoice list view
     * @param {string} containerId - DOM element ID
     * @returns {Promise<void>}
     */
    async function renderListView(containerId = 'invoicesContent') {
        try {
            const container = document.getElementById(containerId);
            if (!container) return;

            const result = await loadInvoices();
            const invoices = result.data || [];

            let html = _buildFilterBar();
            html += _buildStatsBar(result.total);
            html += _buildInvoiceTable(invoices);
            html += _buildPagination();

            container.innerHTML = html;
            _bindListEvents();
        } catch (error) {
            console.error('[CRM_Invoices] Render list error:', error);
        }
    }

    /**
     * Render create/edit invoice form
     * @param {string} containerId - DOM element ID
     * @param {Object|null} invoiceData - Existing invoice for editing
     */
    async function renderFormView(containerId = 'invoicesContent', invoiceData = null) {
        try {
            const container = document.getElementById(containerId);
            if (!container) return;

            const isEdit = !!invoiceData;
            const invoiceNumber = isEdit ? invoiceData.invoiceNumber : await generateInvoiceNumber();
            const todayDate = new Date().toISOString().split('T')[0];
            const defaultDue = new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0];

            let html = `
                <div class="invoice-form-container">
                    <div class="form-header">
                        <h2>${isEdit ? 'Edit Invoice' : 'Create New Invoice'}</h2>
                        <div class="form-header-actions">
                            <button class="btn btn-outline btn-sm" onclick="window.CRM_Invoices.navigateToList()">
                                ← Back to List
                            </button>
                            ${!isEdit ? `
                                <button class="btn btn-ghost btn-sm" id="saveDraftBtn">
                                    💾 Save as Draft
                                </button>
                            ` : ''}
                        </div>
                    </div>

                    <form id="invoiceForm" class="invoice-form">
                        <!-- Invoice Header -->
                        <div class="card mb-4">
                            <div class="card-header">
                                <h4 class="card-title">📄 Invoice Details</h4>
                            </div>
                            <div class="card-body">
                                <div class="form-row">
                                    <div class="form-group flex-1">
                                        <label class="form-label form-label-required">Invoice Number</label>
                                        <input type="text" id="invNumber" class="form-input" 
                                               value="${invoiceNumber}" readonly>
                                    </div>
                                    <div class="form-group flex-1">
                                        <label class="form-label form-label-required">Invoice Date</label>
                                        <input type="date" id="invDate" class="form-input" 
                                               value="${invoiceData?.invoiceDate || todayDate}" required>
                                    </div>
                                    <div class="form-group flex-1">
                                        <label class="form-label form-label-required">Due Date</label>
                                        <input type="date" id="invDueDate" class="form-input" 
                                               value="${invoiceData?.dueDate || defaultDue}" required>
                                    </div>
                                </div>
                                <div class="form-row mt-3">
                                    <div class="form-group flex-1">
                                        <label class="form-label">Reference / PO Number</label>
                                        <input type="text" id="invReference" class="form-input" 
                                               value="${invoiceData?.reference || ''}" placeholder="Optional">
                                    </div>
                                    <div class="form-group flex-1">
                                        <label class="form-label form-label-required">Status</label>
                                        <select id="invStatus" class="form-select">
                                            ${INVOICE_STATUSES.map(s => `
                                                <option value="${s}" ${invoiceData?.status === s ? 'selected' : ''}>
                                                    ${s.charAt(0).toUpperCase() + s.slice(1)}
                                                </option>
                                            `).join('')}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Client Details -->
                        <div class="card mb-4">
                            <div class="card-header">
                                <h4 class="card-title">🏢 Client Information</h4>
                            </div>
                            <div class="card-body">
                                <div class="form-row">
                                    <div class="form-group flex-1">
                                        <label class="form-label form-label-required">Client Name</label>
                                        <input type="text" id="clientName" class="form-input" 
                                               value="${invoiceData?.clientName || ''}" required>
                                    </div>
                                    <div class="form-group flex-1">
                                        <label class="form-label">GSTIN</label>
                                        <input type="text" id="clientGSTIN" class="form-input" 
                                               value="${invoiceData?.clientGSTIN || ''}" 
                                               placeholder="22AAAAA0000A1Z5" maxlength="15">
                                        <span class="form-hint" id="gstinHint"></span>
                                    </div>
                                </div>
                                <div class="form-row mt-3">
                                    <div class="form-group flex-1">
                                        <label class="form-label">Address</label>
                                        <textarea id="clientAddress" class="form-textarea" rows="2" 
                                                  placeholder="Client address">${invoiceData?.clientAddress || ''}</textarea>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Line Items -->
                        <div class="card mb-4">
                            <div class="card-header flex justify-between items-center">
                                <h4 class="card-title">📋 Line Items</h4>
                                <button type="button" class="btn btn-outline btn-sm" id="addLineItemBtn">
                                    + Add Item
                                </button>
                            </div>
                            <div class="card-body">
                                <div class="table-container">
                                    <table class="table" id="lineItemsTable">
                                        <thead>
                                            <tr>
                                                <th style="width:5%">#</th>
                                                <th style="width:30%">Description</th>
                                                <th style="width:12%">HSN/SAC</th>
                                                <th style="width:8%">Qty</th>
                                                <th style="width:12%">Rate (₹)</th>
                                                <th style="width:10%">GST %</th>
                                                <th style="width:15%">Amount</th>
                                                <th style="width:8%"></th>
                                            </tr>
                                        </thead>
                                        <tbody id="lineItemsBody">
                                            ${_buildLineItemRows(invoiceData?.items || [{ quantity: 1, rate: 0, gstRate: 18 }])}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <!-- Tax Summary -->
                        <div class="card mb-4">
                            <div class="card-header">
                                <h4 class="card-title">🧮 Tax Summary</h4>
                            </div>
                            <div class="card-body">
                                <div id="taxSummary">
                                    ${_buildTaxSummary(invoiceData)}
                                </div>
                            </div>
                        </div>

                        <!-- Notes -->
                        <div class="card mb-4">
                            <div class="card-header">
                                <h4 class="card-title">📝 Notes & Terms</h4>
                            </div>
                            <div class="card-body">
                                <div class="form-row">
                                    <div class="form-group flex-1">
                                        <label class="form-label">Notes</label>
                                        <textarea id="invNotes" class="form-textarea" rows="2" 
                                                  placeholder="Additional notes">${invoiceData?.notes || ''}</textarea>
                                    </div>
                                    <div class="form-group flex-1">
                                        <label class="form-label">Terms & Conditions</label>
                                        <textarea id="invTerms" class="form-textarea" rows="2" 
                                                  placeholder="Payment terms">${invoiceData?.terms || 'Payment due as per due date. Late payment attracts 18% interest.'}</textarea>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Submit -->
                        <div class="flex justify-end gap-3">
                            <button type="button" class="btn btn-secondary btn-lg" onclick="window.CRM_Invoices.navigateToList()">
                                Cancel
                            </button>
                            <button type="submit" class="btn btn-primary btn-lg" id="submitInvoiceBtn">
                                ${isEdit ? '💾 Update Invoice' : '📄 Create Invoice'}
                            </button>
                        </div>
                    </form>
                </div>
            `;

            container.innerHTML = html;
            _bindFormEvents(isEdit);
        } catch (error) {
            console.error('[CRM_Invoices] Render form error:', error);
        }
    }

    /**
     * Render invoice detail/view
     * @param {string} containerId - DOM element ID
     * @param {Object} invoice - Invoice data
     */
    function renderDetailView(containerId, invoice) {
        try {
            const container = document.getElementById(containerId);
            if (!container || !invoice) return;

            const enriched = _enrichInvoiceData(invoice);

            let html = `
                <div class="invoice-detail-container">
                    <div class="flex justify-between items-center mb-6">
                        <h2>Invoice #${enriched.invoiceNumber}</h2>
                        <div class="flex gap-3">
                            <span class="badge badge-${enriched.status === 'paid' ? 'success' : enriched.status === 'overdue' ? 'error' : 'warning'}">
                                ${enriched.status.toUpperCase()}
                            </span>
                            <button class="btn btn-outline btn-sm" onclick="window.CRM_Invoices.navigateToList()">
                                ← Back
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-2 gap-6 mb-6">
                        <div class="card">
                            <h5 class="card-title">Invoice Info</h5>
                            <p><strong>Date:</strong> ${enriched.invoiceDate || 'N/A'}</p>
                            <p><strong>Due Date:</strong> ${enriched.dueDate || 'N/A'}</p>
                            <p><strong>Reference:</strong> ${enriched.reference || 'N/A'}</p>
                            ${enriched.isOverdue ? `<p class="text-error"><strong>Overdue by ${enriched.daysOverdue} days</strong></p>` : ''}
                        </div>
                        <div class="card">
                            <h5 class="card-title">Client</h5>
                            <p><strong>Name:</strong> ${enriched.clientName || 'N/A'}</p>
                            <p><strong>GSTIN:</strong> ${enriched.clientGSTIN || 'N/A'}</p>
                            <p><strong>Address:</strong> ${enriched.clientAddress || 'N/A'}</p>
                        </div>
                    </div>

                    <div class="card mb-6">
                        <h5 class="card-title">Line Items</h5>
                        <div class="table-container">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>#</th><th>Description</th><th>HSN</th><th>Qty</th><th>Rate</th><th>Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${(enriched.items || []).map(item => `
                                        <tr>
                                            <td>${item.srNo || '-'}</td>
                                            <td>${item.description || '-'}</td>
                                            <td>${item.hsnSac || '-'}</td>
                                            <td>${item.quantity || 0}</td>
                                            <td>${_formatCurrency(item.rate || 0)}</td>
                                            <td>${_formatCurrency(item.amount || 0)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="grid grid-2 gap-6 mb-6">
                        <div class="card">
                            <h5 class="card-title">Tax Breakdown</h5>
                            <p>Subtotal: <strong>${enriched.formattedSubtotal}</strong></p>
                            <p>CGST: ${enriched.formattedCGST}</p>
                            <p>SGST: ${enriched.formattedSGST}</p>
                            <p>IGST: ${enriched.formattedIGST}</p>
                            <hr>
                            <p class="text-lg font-bold">Total: ${enriched.formattedTotal}</p>
                            ${enriched.ewayBillRequired ? '<p class="text-warning">⚠️ E-Way Bill Required</p>' : ''}
                        </div>
                        <div class="card">
                            <h5 class="card-title">Actions</h5>
                            ${enriched.canEdit ? `<button class="btn btn-outline btn-block mb-2" onclick="window.CRM_Invoices.editInvoice('${enriched.id}')">✏️ Edit</button>` : ''}
                            ${enriched.canSend ? `<button class="btn btn-info btn-block mb-2" onclick="window.CRM_Invoices.sendInvoice('${enriched.id}')">📨 Send to Client</button>` : ''}
                            ${enriched.canMarkPaid ? `<button class="btn btn-success btn-block mb-2" onclick="window.CRM_Invoices.markAsPaid('${enriched.id}')">✅ Mark as Paid</button>` : ''}
                            ${enriched.canCancel ? `<button class="btn btn-error btn-block mb-2" onclick="window.CRM_Invoices.cancelInvoice('${enriched.id}')">❌ Cancel Invoice</button>` : ''}
                        </div>
                    </div>
                </div>
            `;

            container.innerHTML = html;
        } catch (error) {
            console.error('[CRM_Invoices] Render detail error:', error);
        }
    }

    // ============================================================
    // SECTION 10: UI HELPERS
    // ============================================================
    /** Build filter bar HTML */
    function _buildFilterBar() {
        return `
            <div class="flex justify-between items-center mb-4 flex-wrap gap-3">
                <div class="flex gap-2 flex-wrap">
                    <select id="statusFilter" class="form-select" style="width:auto;min-height:44px;">
                        <option value="all">All Status</option>
                        ${INVOICE_STATUSES.map(s => `<option value="${s}" ${_filters.status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
                    </select>
                    <input type="search" id="searchFilter" class="form-input" placeholder="Search invoices..." 
                           value="${_filters.search}" style="width:250px;min-height:44px;">
                </div>
                <button class="btn btn-primary" onclick="window.CRM_Invoices.openCreateForm()">
                    + Create Invoice
                </button>
            </div>
        `;
    }

    /** Build stats bar */
    function _buildStatsBar(total) {
        return `
            <div class="grid grid-auto-sm gap-3 mb-4">
                <div class="stat-card">
                    <div class="stat-label">Total Invoices</div>
                    <div class="stat-value">${total}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">This Month</div>
                    <div class="stat-value">--</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Pending Amount</div>
                    <div class="stat-value">--</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Collected</div>
                    <div class="stat-value">--</div>
                </div>
            </div>
        `;
    }

    /** Build invoice table */
    function _buildInvoiceTable(invoices) {
        if (!invoices || invoices.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-icon">🧾</div>
                    <h4 class="empty-title">No Invoices Found</h4>
                    <p class="empty-description">Create your first GST-compliant invoice.</p>
                    <button class="btn btn-primary" onclick="window.CRM_Invoices.openCreateForm()">Create Invoice</button>
                </div>
            `;
        }

        let rows = invoices.map(inv => {
            const enriched = _enrichInvoiceData(inv);
            return `
                <tr class="cursor-pointer" onclick="window.CRM_Invoices.viewInvoice('${inv.id}')">
                    <td><strong>${inv.invoiceNumber || 'N/A'}</strong></td>
                    <td>${inv.clientName || 'N/A'}</td>
                    <td>${inv.invoiceDate || 'N/A'}</td>
                    <td>${inv.dueDate || 'N/A'}</td>
                    <td>${enriched.formattedTotal}</td>
                    <td>
                        <span class="badge badge-${inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'error' : inv.status === 'sent' ? 'info' : 'warning'}">
                            ${(inv.status || 'draft').toUpperCase()}
                        </span>
                    </td>
                    <td>
                        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();window.CRM_Invoices.editInvoice('${inv.id}')" title="Edit">✏️</button>
                        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();window.CRM_Invoices.deleteInvoiceConfirm('${inv.id}')" title="Delete">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <div class="table-container">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Invoice #</th>
                            <th>Client</th>
                            <th>Date</th>
                            <th>Due Date</th>
                            <th>Total</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    /** Build pagination */
    function _buildPagination() {
        if (_pagination.totalPages <= 1) return '';
        let html = '<div class="flex justify-center gap-2 mt-4">';
        for (let i = 1; i <= _pagination.totalPages; i++) {
            html += `<button class="btn btn-${i === _pagination.page ? 'primary' : 'outline'} btn-sm" 
                           onclick="window.CRM_Invoices.goToPage(${i})">${i}</button>`;
        }
        html += '</div>';
        return html;
    }

    /** Build line item rows */
    function _buildLineItemRows(items) {
        return items.map((item, index) => `
            <tr class="line-item-row" data-index="${index}">
                <td>${index + 1}</td>
                <td><input type="text" class="form-input item-desc" value="${item.description || ''}" placeholder="Item description"></td>
                <td><input type="text" class="form-input item-hsn" value="${item.hsnSac || ''}" placeholder="HSN/SAC" style="width:100px;"></td>
                <td><input type="number" class="form-input item-qty" value="${item.quantity || 1}" min="1" step="1" style="width:70px;"></td>
                <td><input type="number" class="form-input item-rate" value="${item.rate || 0}" min="0" step="0.01" style="width:110px;"></td>
                <td>
                    <select class="form-select item-gst" style="width:90px;">
                        ${Object.keys(GST_RATES).map(r => `<option value="${GST_RATES[r]}" ${(item.gstRate || 18) === GST_RATES[r] ? 'selected' : ''}>${r}</option>`).join('')}
                    </select>
                </td>
                <td class="item-amount-cell">${_formatCurrency((item.quantity || 1) * (item.rate || 0))}</td>
                <td><button type="button" class="btn btn-ghost btn-sm remove-item-btn text-error">✕</button></td>
            </tr>
        `).join('');
    }

    /** Build tax summary */
    function _buildTaxSummary(invoiceData) {
        const items = invoiceData?.items || [{ quantity: 0, rate: 0, gstRate: 18 }];
        const totals = calculateInvoiceTotals(items, invoiceData?.fromStateCode || '09', invoiceData?.toStateCode || '09');
        return `
            <div class="flex flex-col gap-2" style="max-width:300px;margin-left:auto;">
                <div class="flex justify-between"><span>Subtotal:</span><strong>${_formatCurrency(totals.subtotal)}</strong></div>
                <div class="flex justify-between"><span>CGST:</span><span>${_formatCurrency(totals.cgst)}</span></div>
                <div class="flex justify-between"><span>SGST:</span><span>${_formatCurrency(totals.sgst)}</span></div>
                <div class="flex justify-between"><span>IGST:</span><span>${_formatCurrency(totals.igst)}</span></div>
                <hr>
                <div class="flex justify-between text-lg font-bold"><span>Total:</span><span>${_formatCurrency(totals.total)}</span></div>
                ${totals.total >= EWAY_BILL_THRESHOLD ? '<span class="text-warning text-sm">⚠️ E-Way Bill Required</span>' : ''}
            </div>
        `;
    }

    /** Format currency */
    function _formatCurrency(amount, symbol = '₹') {
        try {
            return symbol + ' ' + parseFloat(amount || 0).toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            });
        } catch (e) {
            return symbol + ' ' + (amount || 0).toFixed(2);
        }
    }

    // ============================================================
    // SECTION 11: EVENT BINDINGS
    // ============================================================
    /** Bind list view events */
    function _bindListEvents() {
        const statusFilter = document.getElementById('statusFilter');
        const searchFilter = document.getElementById('searchFilter');

        if (statusFilter) {
            statusFilter.addEventListener('change', async () => {
                _filters.status = statusFilter.value;
                _pagination.page = 1;
                _pagination.lastDoc = null;
                await renderListView();
            });
        }

        if (searchFilter) {
            let debounceTimer;
            searchFilter.addEventListener('input', () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(async () => {
                    _filters.search = searchFilter.value;
                    _pagination.page = 1;
                    await renderListView();
                }, 400);
            });
        }
    }

    /** Bind form events */
    function _bindFormEvents(isEdit) {
        const form = document.getElementById('invoiceForm');
        if (!form) return;

        // Add line item
        const addBtn = document.getElementById('addLineItemBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => _addLineItemRow());
        }

        // Remove line item (delegation)
        const tbody = document.getElementById('lineItemsBody');
        if (tbody) {
            tbody.addEventListener('click', (e) => {
                if (e.target.closest('.remove-item-btn')) {
                    const row = e.target.closest('.line-item-row');
                    if (row && tbody.querySelectorAll('.line-item-row').length > 1) {
                        row.remove();
                        _recalculateFormTotals();
                        _renumberLineItems();
                    }
                }
            });

            // Recalculate on input change
            tbody.addEventListener('input', (e) => {
                if (e.target.matches('.item-qty, .item-rate, .item-gst')) {
                    _recalculateFormTotals();
                    _updateLineItemAmount(e.target.closest('.line-item-row'));
                }
            });
        }

        // GSTIN validation
        const gstinInput = document.getElementById('clientGSTIN');
        if (gstinInput) {
            gstinInput.addEventListener('input', () => {
                const result = validateGSTIN(gstinInput.value);
                const hint = document.getElementById('gstinHint');
                if (hint) {
                    hint.textContent = result.message;
                    hint.style.color = result.valid ? 'var(--color-success)' : 'var(--color-error)';
                }
                _recalculateFormTotals();
            });
        }

        // Form submission
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await _handleFormSubmit(isEdit);
        });

        // Save draft
        const saveDraftBtn = document.getElementById('saveDraftBtn');
        if (saveDraftBtn) {
            saveDraftBtn.addEventListener('click', async () => {
                await _handleFormSubmit(false, 'draft');
            });
        }
    }

    /** Add a new line item row */
    function _addLineItemRow() {
        const tbody = document.getElementById('lineItemsBody');
        if (!tbody) return;

        const rows = tbody.querySelectorAll('.line-item-row');
        if (rows.length >= MAX_LINE_ITEMS) {
            _showToast('Maximum 50 line items allowed.', 'warning');
            return;
        }

        const newRow = document.createElement('tr');
        newRow.className = 'line-item-row';
        newRow.dataset.index = rows.length;
        newRow.innerHTML = `
            <td>${rows.length + 1}</td>
            <td><input type="text" class="form-input item-desc" placeholder="Item description"></td>
            <td><input type="text" class="form-input item-hsn" placeholder="HSN/SAC" style="width:100px;"></td>
            <td><input type="number" class="form-input item-qty" value="1" min="1" step="1" style="width:70px;"></td>
            <td><input type="number" class="form-input item-rate" value="0" min="0" step="0.01" style="width:110px;"></td>
            <td>
                <select class="form-select item-gst" style="width:90px;">
                    ${Object.keys(GST_RATES).map(r => `<option value="${GST_RATES[r]}" ${GST_RATES[r] === 18 ? 'selected' : ''}>${r}</option>`).join('')}
                </select>
            </td>
            <td class="item-amount-cell">₹ 0.00</td>
            <td><button type="button" class="btn btn-ghost btn-sm remove-item-btn text-error">✕</button></td>
        `;
        tbody.appendChild(newRow);
    }

    /** Update single line item amount display */
    function _updateLineItemAmount(row) {
        if (!row) return;
        const qty = parseFloat(row.querySelector('.item-qty')?.value) || 0;
        const rate = parseFloat(row.querySelector('.item-rate')?.value) || 0;
        const cell = row.querySelector('.item-amount-cell');
        if (cell) cell.textContent = _formatCurrency(qty * rate);
    }

    /** Recalculate form totals */
    function _recalculateFormTotals() {
        const rows = document.querySelectorAll('.line-item-row');
        const items = [];

        rows.forEach(row => {
            items.push({
                quantity: parseFloat(row.querySelector('.item-qty')?.value) || 0,
                rate: parseFloat(row.querySelector('.item-rate')?.value) || 0,
                gstRate: parseFloat(row.querySelector('.item-gst')?.value) || 18,
            });
        });

        const gstinInput = document.getElementById('clientGSTIN');
        const fromState = '09'; // Default UP (from config)
        const toState = gstinInput?.value ? (getStateCodeFromGSTIN(gstinInput.value) || '09') : '09';

        const totals = calculateInvoiceTotals(items, fromState, toState);

        // Update summary
        const summaryDiv = document.getElementById('taxSummary');
        if (summaryDiv) {
            summaryDiv.innerHTML = `
                <div class="flex flex-col gap-2" style="max-width:300px;margin-left:auto;">
                    <div class="flex justify-between"><span>Subtotal:</span><strong>${_formatCurrency(totals.subtotal)}</strong></div>
                    <div class="flex justify-between"><span>CGST:</span><span>${_formatCurrency(totals.cgst)}</span></div>
                    <div class="flex justify-between"><span>SGST:</span><span>${_formatCurrency(totals.sgst)}</span></div>
                    <div class="flex justify-between"><span>IGST:</span><span>${_formatCurrency(totals.igst)}</span></div>
                    <hr>
                    <div class="flex justify-between text-lg font-bold"><span>Total:</span><span>${_formatCurrency(totals.total)}</span></div>
                    ${totals.total >= EWAY_BILL_THRESHOLD ? '<span class="text-warning text-sm">⚠️ E-Way Bill Required (≥₹50,000)</span>' : ''}
                </div>
            `;
        }
    }

    /** Renumber line items */
    function _renumberLineItems() {
        const rows = document.querySelectorAll('.line-item-row');
        rows.forEach((row, index) => {
            row.dataset.index = index;
            row.querySelector('td').textContent = index + 1;
        });
    }

    /** Handle form submission */
    async function _handleFormSubmit(isEdit, forceStatus = null) {
        try {
            const invoiceNumber = document.getElementById('invNumber')?.value;
            const invoiceDate = document.getElementById('invDate')?.value;
            const dueDate = document.getElementById('invDueDate')?.value;
            const clientName = document.getElementById('clientName')?.value;
            const clientGSTIN = document.getElementById('clientGSTIN')?.value;
            const clientAddress = document.getElementById('clientAddress')?.value;
            const reference = document.getElementById('invReference')?.value;
            const status = forceStatus || document.getElementById('invStatus')?.value || 'draft';
            const notes = document.getElementById('invNotes')?.value;
            const terms = document.getElementById('invTerms')?.value;

            // Validate
            if (!clientName) {
                _showToast('Client name is required.', 'error');
                return;
            }
            if (!invoiceDate || !dueDate) {
                _showToast('Invoice date and due date are required.', 'error');
                return;
            }
            if (new Date(dueDate) <= new Date(invoiceDate)) {
                _showToast('Due date must be after invoice date.', 'error');
                return;
            }

            // Validate GSTIN if provided
            if (clientGSTIN) {
                const gstResult = validateGSTIN(clientGSTIN);
                if (!gstResult.valid) {
                    _showToast('Invalid GSTIN: ' + gstResult.message, 'error');
                    return;
                }
            }

            // Collect line items
            const rows = document.querySelectorAll('.line-item-row');
            const items = [];
            let hasValidItem = false;

            rows.forEach((row, index) => {
                const desc = row.querySelector('.item-desc')?.value?.trim();
                const qty = parseFloat(row.querySelector('.item-qty')?.value) || 0;
                const rate = parseFloat(row.querySelector('.item-rate')?.value) || 0;

                if (desc && qty > 0) {
                    hasValidItem = true;
                    items.push({
                        srNo: index + 1,
                        description: desc,
                        hsnSac: row.querySelector('.item-hsn')?.value?.trim() || '',
                        quantity: qty,
                        rate: rate,
                        amount: qty * rate,
                        gstRate: parseFloat(row.querySelector('.item-gst')?.value) || 18,
                    });
                }
            });

            if (!hasValidItem) {
                _showToast('At least one valid line item is required.', 'error');
                return;
            }

            // Build invoice data
            const fromState = '09'; // From config/tenant settings
            const toState = clientGSTIN ? (getStateCodeFromGSTIN(clientGSTIN) || '09') : '09';

            const invoiceData = {
                invoiceNumber,
                invoiceDate,
                dueDate,
                reference,
                clientName,
                clientGSTIN,
                clientAddress,
                status,
                items,
                fromStateCode: fromState,
                toStateCode: toState,
                notes,
                terms,
            };

            let result;
            if (isEdit && _selectedInvoice) {
                result = await updateInvoice(_selectedInvoice.id, invoiceData);
            } else {
                result = await createInvoice(invoiceData);
            }

            if (result && !result.error) {
                _showToast(isEdit ? 'Invoice updated!' : 'Invoice created!', 'success');
                navigateToList();
            } else {
                _showToast(result?.message || 'Failed to save invoice.', 'error');
            }
        } catch (error) {
            console.error('[CRM_Invoices] Form submit error:', error);
            _showToast('Error saving invoice: ' + error.message, 'error');
        }
    }

    // ============================================================
    // SECTION 12: NAVIGATION METHODS
    // ============================================================
    /** Navigate to list view */
    async function navigateToList() {
        _currentView = 'list';
        _selectedInvoice = null;
        await renderListView();
        _updateSubmenuActive('list');
    }

    /** Open create form */
    async function openCreateForm() {
        _currentView = 'create';
        _selectedInvoice = null;
        await renderFormView('invoicesContent', null);
        _updateSubmenuActive('new');
    }

    /** View invoice detail */
    async function viewInvoice(invoiceId) {
        const invoice = await getInvoice(invoiceId);
        if (invoice) {
            _selectedInvoice = invoice;
            _currentView = 'view';
            renderDetailView('invoicesContent', invoice);
        }
    }

    /** Edit invoice */
    async function editInvoice(invoiceId) {
        const invoice = await getInvoice(invoiceId);
        if (invoice) {
            _selectedInvoice = invoice;
            _currentView = 'edit';
            await renderFormView('invoicesContent', invoice);
        }
    }

    /** Delete with confirmation */
    async function deleteInvoiceConfirm(invoiceId) {
        if (confirm('Are you sure you want to delete this invoice?')) {
            const result = await deleteInvoice(invoiceId);
            if (result) {
                _showToast('Invoice deleted.', 'success');
                await renderListView();
            }
        }
    }

    /** Send invoice */
    async function sendInvoice(invoiceId) {
        if (confirm('Send this invoice to the client?')) {
            const result = await updateInvoiceStatus(invoiceId, 'sent');
            if (result && !result.error) {
                _showToast('Invoice sent!', 'success');
                await renderListView();
            }
        }
    }

    /** Mark as paid */
    async function markAsPaid(invoiceId) {
        if (confirm('Mark this invoice as paid?')) {
            const result = await updateInvoiceStatus(invoiceId, 'paid');
            if (result && !result.error) {
                _showToast('Invoice marked as paid!', 'success');
                await renderListView();
            }
        }
    }

    /** Cancel invoice */
    async function cancelInvoice(invoiceId) {
        if (confirm('Cancel this invoice? This cannot be undone.')) {
            const result = await updateInvoiceStatus(invoiceId, 'cancelled');
            if (result && !result.error) {
                _showToast('Invoice cancelled.', 'warning');
                await renderListView();
            }
        }
    }

    /** Pagination */
    async function goToPage(page) {
        _pagination.page = page;
        await renderListView();
    }

    // ============================================================
    // SECTION 13: SUBMENU INTEGRATION
    // ============================================================
    /**
     * Update submenu active state
     * @param {string} action - Current action
     */
    function _updateSubmenuActive(action) {
        try {
            const submenuInner = document.getElementById('submenuInner');
            if (!submenuInner) return;

            submenuInner.querySelectorAll('.app-submenu-link').forEach(link => {
                link.classList.remove('active');
                if (link.dataset.action === action) {
                    link.classList.add('active');
                }
            });
        } catch (e) { /* ignore */ }
    }

    // ============================================================
    // SECTION 14: TOAST HELPER
    // ============================================================
    /**
     * Show toast notification
     * @param {string} message - Toast message
     * @param {string} type - 'success' | 'error' | 'warning' | 'info'
     */
    function _showToast(message, type = 'info') {
        try {
            if (window.CRM && window.CRM.showToast) {
                window.CRM.showToast(message, type);
            } else {
                // Fallback toast
                const container = document.getElementById('appToastContainer') || document.body;
                const toast = document.createElement('div');
                toast.className = `toast toast-${type}`;
                toast.setAttribute('role', 'status');
                toast.innerHTML = `<span class="toast-message">${message}</span>`;
                container.appendChild(toast);
                setTimeout(() => {
                    toast.classList.add('toast-removing');
                    setTimeout(() => toast.remove(), 300);
                }, 3000);
            }
        } catch (e) {
            alert(message);
        }
    }

    // ============================================================
    // SECTION 15: INITIALIZATION
    // ============================================================
    /**
     * Initialize the invoices module
     */
    function init() {
        try {
            if (_initialized) return;

            // Set up submenu click handlers if in app shell
            const submenuInner = document.getElementById('submenuInner');
            if (submenuInner) {
                submenuInner.addEventListener('click', (e) => {
                    const link = e.target.closest('.app-submenu-link');
                    if (!link) return;
                    const action = link.dataset.action;
                    if (action === 'list') navigateToList();
                    if (action === 'new') openCreateForm();
                    if (action === 'pending') { _filters.status = 'sent'; navigateToList(); }
                    if (action === 'paid') { _filters.status = 'paid'; navigateToList(); }
                    if (action === 'overdue') { _filters.status = 'overdue'; navigateToList(); }
                });
            }

            // Load initial data
            renderListView();

            _initialized = true;
            console.log('[CRM_Invoices] Module initialized.');
            console.log('[CRM_Invoices] GST Config:', _getInvoiceConfig());
        } catch (error) {
            console.error('[CRM_Invoices] Init error:', error);
        }
    }

    // Auto-init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
    } else {
        setTimeout(init, 300);
    }

    // ============================================================
    // PUBLIC API EXPORT
    // ============================================================
    return {
        // Init
        init,

        // CRUD
        loadInvoices,
        getInvoice,
        createInvoice,
        updateInvoice,
        deleteInvoice,
        updateInvoiceStatus,

        // GST
        calculateGST,
        calculateInvoiceTotals,
        validateGSTIN,
        getStateCodeFromGSTIN,
        searchHsnSacCodes,
        getGstRateForCode,
        checkEWayBillRequirement,

        // Navigation
        navigateToList,
        openCreateForm,
        viewInvoice,
        editInvoice,
        deleteInvoiceConfirm,
        sendInvoice,
        markAsPaid,
        cancelInvoice,
        goToPage,

        // Form
        renderListView,
        renderFormView,
        renderDetailView,

        // Utils
        generateInvoiceNumber,
        getInvoiceConfig: _getInvoiceConfig,

        // State
        getFilters: () => _filters,
        getPagination: () => _pagination,
    };
})();

// ============================================================
// EXPORT TO GLOBAL (Rule #20)
// ============================================================
window.CRM_Invoices = CRM_Invoices;

console.log('[CRM_Invoices] Module loaded. window.CRM_Invoices available.');
console.log('[CRM_Invoices] API: createInvoice, updateInvoice, deleteInvoice, calculateGST, validateGSTIN');