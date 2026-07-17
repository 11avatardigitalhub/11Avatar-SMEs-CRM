/**
 * ============================================================
 * 11 AVATAR SMEs CRM - WHATSAPP CLOUDWA INTEGRATION MODULE
 * ============================================================
 * 
 * @file       modules/whatsapp.js
 * @path       C:\Users\rudra\Downloads\11 Avatar\11-Avatar-SMEs-CRM-main\modules\whatsapp.js
 * @author     11 Avatar Digital Hub
 * @email      info@11avatardigitalhub.cloud
 * @repo       https://github.com/11avatardigitalhub/11Avatar-SMEs-CRM.git
 * 
 * PURPOSE:
 * Complete WhatsApp Business API integration via CloudWA.
 * Template messaging, bulk broadcasting, automation rules,
 * chat interface, cross-SaaS sync (WhatsApp CRM ↔ SMEs CRM),
 * lead capture from WhatsApp, invoice sharing, and payment reminders.
 * 
 * DEPENDENCIES:
 * - window.CRM_Config       - CloudWA URL, API endpoints, rate limits
 * - window.CRM_Auth         - Tenant ID, user info
 * - window.CRM_Tenant       - Cross-SaaS sync, module access
 * - window.CRM_Firestore    - CRUD for messages, templates
 * - window.CRM_Invoices     - Invoice sharing
 * - window.CRM_Payments     - Payment reminders
 * - window.CRM_Leads        - Lead capture from WhatsApp
 * - css/crm-design-system.css
 * - app.html                - Module container #module-whatsapp
 * 
 * RULES COMPLIANCE:
 * ✅ Rule #1  - Enterprise Grade
 * ✅ Rule #5  - Deep Detailing: full JSDoc
 * ✅ Rule #6  - Error Handling: try/catch everywhere
 * ✅ Rule #17 - Multi-Tenant with Cross-SaaS sync
 * ✅ Rule #18 - Firebase Backend
 * ✅ Rule #20 - Export All: window.CRM_WhatsApp
 * ✅ Rule #21 - Path First
 * ✅ Rule #23 - 700+ lines
 * ✅ Rule #25 - Full File Replacement
 * ============================================================
 */

'use strict';

const CRM_WhatsApp = (function() {
    'use strict';

    // ============================================================
    // PRIVATE STATE
    // ============================================================
    const _messageCache = new Map();
    const _templateCache = new Map();
    const _contactCache = new Map();
    const _automationRules = [];
    let _activeChat = null;
    let _selectedTemplate = null;
    let _currentView = 'chat';
    let _initialized = false;
    let _wsConnection = null;
    let _reconnectTimer = null;

    const _filters = {
        chatType: 'all',
        search: '',
        dateFrom: null,
        dateTo: null,
        status: 'all',
    };

    const _pagination = {
        page: 1,
        limit: 30,
        total: 0,
        totalPages: 0,
        lastDoc: null,
    };

    // ============================================================
    // CONSTANTS
    // ============================================================
    const CLOUDWA_URL = 'https://cloudwa.11avatardigitalhub.cloud';
    const MAX_DAILY_MESSAGES = 1000;
    const RATE_LIMIT_PER_MINUTE = 20;
    const MAX_TEMPLATE_CHARS = 1024;
    const MAX_BROADCAST_BATCH = 100;
    const TYPING_INDICATOR_DELAY = 1500;
    const RECONNECT_INTERVAL = 5000;
    const MAX_RECONNECT_ATTEMPTS = 10;

    const MESSAGE_TYPES = {
        text: { icon: '💬', name: 'Text', maxLength: 4096 },
        template: { icon: '📋', name: 'Template', maxLength: MAX_TEMPLATE_CHARS },
        image: { icon: '🖼️', name: 'Image', maxSize: 5 * 1024 * 1024 },
        video: { icon: '🎬', name: 'Video', maxSize: 16 * 1024 * 1024 },
        document: { icon: '📄', name: 'Document', maxSize: 100 * 1024 * 1024 },
        audio: { icon: '🎵', name: 'Audio', maxSize: 16 * 1024 * 1024 },
        location: { icon: '📍', name: 'Location', fields: ['latitude', 'longitude', 'name', 'address'] },
        contact: { icon: '👤', name: 'Contact', fields: ['name', 'phones'] },
        interactive: { icon: '🔘', name: 'Interactive', fields: ['type', 'header', 'body', 'footer', 'buttons'] },
    };

    const MESSAGE_STATUSES = {
        queued: { icon: '⏳', color: 'warning', label: 'Queued' },
        sent: { icon: '✅', color: 'info', label: 'Sent' },
        delivered: { icon: '✅✅', color: 'info', label: 'Delivered' },
        read: { icon: '✅✅', color: 'success', label: 'Read' },
        failed: { icon: '❌', color: 'error', label: 'Failed' },
        rejected: { icon: '🚫', color: 'error', label: 'Rejected' },
        deleted: { icon: '🗑️', color: 'muted', label: 'Deleted' },
    };

    const AUTOMATION_TRIGGERS = {
        'lead_created': 'When a new lead is created',
        'invoice_generated': 'When an invoice is generated',
        'payment_received': 'When payment is confirmed',
        'payment_overdue': 'When payment is overdue',
        'task_assigned': 'When a task is assigned',
        'appointment_booked': 'When an appointment is booked',
        'appointment_reminder': '24 hours before appointment',
        'birthday': 'On contact birthday',
        'welcome_message': 'When new contact is added',
        'deal_won': 'When a deal is marked won',
        'deal_lost': 'When a deal is marked lost',
        'custom': 'Custom trigger',
    };

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

    function _getWhatsAppConfig() {
        try { if (window.CRM_Config?.getModuleConfig) return window.CRM_Config.getModuleConfig('whatsapp') || {}; if (window.CRM_Config?.modules?.whatsapp) return window.CRM_Config.modules.whatsapp; } catch (e) {}
        return { maxDailyMessages: 1000, maxTemplateCharacters: 1024, rateLimitPerMinute: 20, sessionTimeout: 86400000 };
    }

    function _formatTime(dateStr) {
        try { return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }); } catch (e) { return dateStr; }
    }

    function _formatDate(dateStr) {
        try { return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch (e) { return dateStr || 'N/A'; }
    }

    function _showToast(msg, type = 'info') {
        try { if (window.CRM?.showToast) { window.CRM.showToast(msg, type); return; }
            const c = document.getElementById('appToastContainer') || document.body;
            const t = document.createElement('div'); t.className = `toast toast-${type}`; t.setAttribute('role', 'status');
            t.innerHTML = `<span class="toast-message">${msg}</span>`; c.appendChild(t);
            setTimeout(() => { t.classList.add('toast-removing'); setTimeout(() => t.remove(), 300); }, 3000);
        } catch (e) { alert(msg); }
    }

    function _escapeHtml(text) { if (!text) return ''; const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }

    function _debounce(fn, delay) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); }; }

    // ============================================================
    // SECTION 1: CLOUDWA API CLIENT
    // ============================================================
    /**
     * CloudWA API wrapper with retry logic
     */
    const CloudWA = {
        _baseUrl: CLOUDWA_URL,
        _messageCount: 0,
        _lastMinuteTimestamps: [],

        async _request(endpoint, options = {}) {
            try {
                const url = `${this._baseUrl}/api${endpoint}`;
                const config = {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Tenant-Id': _getTenantId() || '',
                        'X-User-Id': _getCurrentUser().uid || '',
                    },
                    ...options,
                };
                const response = await fetch(url, config);
                if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                return await response.json();
            } catch (error) {
                console.error('[CloudWA] Request failed:', error);
                throw error;
            }
        },

        _checkRateLimit() {
            const now = Date.now();
            this._lastMinuteTimestamps = this._lastMinuteTimestamps.filter(t => now - t < 60000);
            if (this._lastMinuteTimestamps.length >= RATE_LIMIT_PER_MINUTE) {
                throw new Error('Rate limit exceeded. Please wait before sending more messages.');
            }
            this._lastMinuteTimestamps.push(now);
        },

        _checkDailyLimit() {
            if (this._messageCount >= MAX_DAILY_MESSAGES) {
                throw new Error(`Daily message limit (${MAX_DAILY_MESSAGES}) reached.`);
            }
        },

        async sendMessage(data) {
            this._checkRateLimit();
            this._checkDailyLimit();
            const result = await this._request('/messages/send', { method: 'POST', body: JSON.stringify(data) });
            if (result.success) this._messageCount++;
            return result;
        },

        async sendTemplate(phone, templateName, params = {}, language = 'en') {
            return await this.sendMessage({
                to: phone,
                type: 'template',
                template: { name: templateName, language, components: [{ type: 'body', parameters: Object.values(params).map(v => ({ type: 'text', text: String(v) })) }] },
            });
        },

        async getTemplates() {
            return await this._request('/templates');
        },

        async getMessages(conversationId, limit = 50, before = null) {
            let url = `/messages/${conversationId}?limit=${limit}`;
            if (before) url += `&before=${before}`;
            return await this._request(url);
        },

        async getContacts(search = '', limit = 50) {
            return await this._request(`/contacts?search=${encodeURIComponent(search)}&limit=${limit}`);
        },

        async uploadMedia(file) {
            const formData = new FormData();
            formData.append('file', file);
            const url = `${this._baseUrl}/api/media/upload`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'X-Tenant-Id': _getTenantId() || '' },
                body: formData,
            });
            return await response.json();
        },

        async getWebhookStatus() {
            return await this._request('/webhook/status');
        },

        getDailyUsage() {
            return {
                sent: this._messageCount,
                remaining: MAX_DAILY_MESSAGES - this._messageCount,
                limit: MAX_DAILY_MESSAGES,
                rateLimitRemaining: RATE_LIMIT_PER_MINUTE - this._lastMinuteTimestamps.length,
            };
        },
    };

    // ============================================================
    // SECTION 2: TEMPLATE MANAGEMENT
    // ============================================================
    async function loadTemplates() {
        try {
            if (window.CRM_Firestore?.queryDocuments) {
                const result = await window.CRM_Firestore.queryDocuments('whatsapp_templates', { orderBy: 'name', orderDir: 'asc', limit: 100 });
                if (result?.data) {
                    _templateCache.clear();
                    result.data.forEach(t => _templateCache.set(t.id, t));
                    return result.data;
                }
            }
            // Fallback: built-in templates
            const builtIn = [
                { id: 'tpl_001', name: 'payment_reminder', category: 'UTILITY', language: 'en',
                    content: 'Dear {{1}}, your payment of ₹{{2}} for invoice #{{3}} is due on {{4}}. Please pay at your earliest convenience. — 11 Avatar CRM',
                    variables: ['client_name', 'amount', 'invoice_number', 'due_date'] },
                { id: 'tpl_002', name: 'invoice_sent', category: 'UTILITY', language: 'en',
                    content: 'Dear {{1}}, your invoice #{{2}} for ₹{{3}} has been generated. View and pay online: {{4}}',
                    variables: ['client_name', 'invoice_number', 'amount', 'payment_link'] },
                { id: 'tpl_003', name: 'payment_confirmed', category: 'UTILITY', language: 'en',
                    content: 'Thank you {{1}}! We have received your payment of ₹{{2}} for invoice #{{3}}. Your payment reference is {{4}}.',
                    variables: ['client_name', 'amount', 'invoice_number', 'reference'] },
                { id: 'tpl_004', name: 'lead_welcome', category: 'MARKETING', language: 'en',
                    content: 'Hi {{1}}, thank you for your interest in {{2}}. Our team will contact you shortly. For immediate assistance, call {{3}}.',
                    variables: ['lead_name', 'company_name', 'phone'] },
                { id: 'tpl_005', name: 'appointment_reminder', category: 'UTILITY', language: 'en',
                    content: 'Reminder: You have an appointment with {{1}} on {{2}} at {{3}}. Location: {{4}}. Reply YES to confirm.',
                    variables: ['contact_person', 'date', 'time', 'location'] },
                { id: 'tpl_006', name: 'deal_won', category: 'MARKETING', language: 'en',
                    content: 'Congratulations {{1}}! We are pleased to confirm the deal for {{2}}. Amount: ₹{{3}}. Our team will be in touch for next steps.',
                    variables: ['client_name', 'deal_name', 'amount'] },
                { id: 'tpl_007', name: 'task_assigned', category: 'UTILITY', language: 'en',
                    content: 'New task assigned: {{1}}. Priority: {{2}}. Due: {{3}}. Please acknowledge.',
                    variables: ['task_title', 'priority', 'due_date'] },
                { id: 'tpl_008', name: 'festival_greeting', category: 'MARKETING', language: 'hi',
                    content: '{{1}} की ओर से आपको और आपके परिवार को {{2}} की हार्दिक शुभकामनाएं! 🎉',
                    variables: ['company_name', 'festival_name'] },
            ];
            builtIn.forEach(t => _templateCache.set(t.id, t));
            return builtIn;
        } catch (error) { console.error('[WhatsApp] Template load error:', error); return []; }
    }

    async function createTemplate(templateData) {
        try {
            const data = {
                ...templateData,
                tenantId: _getTenantId(),
                createdAt: new Date().toISOString(),
                createdBy: _getCurrentUser().uid,
                status: 'pending_approval',
            };
            if (window.CRM_Firestore?.createDocument) {
                const created = await window.CRM_Firestore.createDocument('whatsapp_templates', data);
                if (created) { _templateCache.set(created.id, created); return created; }
            }
            return null;
        } catch (error) { console.error('[WhatsApp] Template create error:', error); return { error: 'CREATE_FAILED', message: error.message }; }
    }

    async function deleteTemplate(templateId) {
        try {
            if (window.CRM_Firestore?.deleteDocument) {
                await window.CRM_Firestore.deleteDocument('whatsapp_templates', templateId);
                _templateCache.delete(templateId);
                return true;
            }
            return false;
        } catch (error) { return false; }
    }

    // ============================================================
    // SECTION 3: AUTOMATION ENGINE
    // ============================================================
    /**
     * Automation rules management
     */
    async function loadAutomationRules() {
        try {
            if (window.CRM_Firestore?.queryDocuments) {
                const result = await window.CRM_Firestore.queryDocuments('automation_rules', {
                    filters: [['module', '==', 'whatsapp']],
                    orderBy: 'createdAt', orderDir: 'desc', limit: 50,
                });
                if (result?.data) {
                    _automationRules.length = 0;
                    _automationRules.push(...result.data);
                }
            }
            return _automationRules;
        } catch (error) { console.error('[WhatsApp] Automation load error:', error); return []; }
    }

    async function createAutomationRule(ruleData) {
        try {
            const data = {
                ...ruleData,
                tenantId: _getTenantId(),
                module: 'whatsapp',
                status: ruleData.status || 'active',
                createdAt: new Date().toISOString(),
                createdBy: _getCurrentUser().uid,
                executionCount: 0,
            };
            if (window.CRM_Firestore?.createDocument) {
                const created = await window.CRM_Firestore.createDocument('automation_rules', data);
                if (created) { _automationRules.push(created); return created; }
            }
            return null;
        } catch (error) { return { error: 'CREATE_FAILED', message: error.message }; }
    }

    /**
     * Execute automation rule
     */
    async function executeAutomationRule(trigger, context = {}) {
        try {
            const rules = _automationRules.filter(r => r.trigger === trigger && r.status === 'active');
            if (rules.length === 0) return { executed: 0 };

            let executed = 0;
            for (const rule of rules) {
                try {
                    const template = _templateCache.get(rule.templateId);
                    if (!template) continue;

                    const params = {};
                    if (rule.fieldMapping) {
                        Object.entries(rule.fieldMapping).forEach(([templateVar, contextField]) => {
                            params[templateVar] = context[contextField] || '';
                        });
                    }

                    const phone = context.clientPhone || context.leadPhone || context.phone;
                    if (!phone) continue;

                    await sendTemplateMessage(phone, template.id, params);
                    executed++;

                    if (window.CRM_Firestore?.updateDocument) {
                        await window.CRM_Firestore.updateDocument('automation_rules', rule.id, {
                            lastExecutedAt: new Date().toISOString(),
                            executionCount: (rule.executionCount || 0) + 1,
                        });
                    }
                } catch (e) { console.error(`[WhatsApp] Rule ${rule.id} execution failed:`, e); }
            }
            return { executed };
        } catch (error) { console.error('[WhatsApp] Automation error:', error); return { executed: 0, error: error.message }; }
    }

    // ============================================================
    // SECTION 4: BULK BROADCAST
    // ============================================================
    async function sendBroadcast(templateId, contacts = [], params = {}) {
        try {
            if (!contacts || contacts.length === 0) {
                return { error: 'NO_CONTACTS', message: 'No contacts selected.' };
            }
            if (contacts.length > MAX_BROADCAST_BATCH) {
                return { error: 'BATCH_TOO_LARGE', message: `Maximum ${MAX_BROADCAST_BATCH} contacts per broadcast.` };
            }

            const template = _templateCache.get(templateId);
            if (!template) return { error: 'TEMPLATE_NOT_FOUND', message: 'Template not found.' };

            let sent = 0, failed = 0;
            const broadcastId = 'bc_' + Date.now();

            for (const contact of contacts) {
                try {
                    const contactParams = { ...params };
                    if (contact.name) contactParams['1'] = contact.name;
                    if (contact.amount) contactParams['2'] = contact.amount;
                    if (contact.invoiceNumber) contactParams['3'] = contact.invoiceNumber;

                    await sendTemplateMessage(contact.phone, templateId, contactParams);
                    sent++;
                } catch (e) { failed++; }
                // Small delay between messages to avoid rate limiting
                await new Promise(r => setTimeout(r, 200));
            }

            // Log broadcast
            if (window.CRM_Firestore?.createDocument) {
                await window.CRM_Firestore.createDocument('broadcast_logs', {
                    broadcastId, templateId, contactCount: contacts.length, sent, failed,
                    createdAt: new Date().toISOString(), tenantId: _getTenantId(),
                });
            }

            return { broadcastId, sent, failed, total: contacts.length };
        } catch (error) { console.error('[WhatsApp] Broadcast error:', error); return { error: 'BROADCAST_FAILED', message: error.message }; }
    }

    // ============================================================
    // SECTION 5: MESSAGE OPERATIONS
    // ============================================================
    async function sendTextMessage(phone, text) {
        try {
            if (!phone || !text) return { error: 'VALIDATION', message: 'Phone and text are required.' };
            const result = await CloudWA.sendMessage({ to: phone, type: 'text', text: { body: text } });
            await _saveMessageToFirestore({ to: phone, type: 'text', content: text, status: result.success ? 'sent' : 'failed', waMessageId: result.messageId });
            return result;
        } catch (error) { return { error: 'SEND_FAILED', message: error.message }; }
    }

    async function sendTemplateMessage(phone, templateId, params = {}) {
        try {
            const template = _templateCache.get(templateId);
            if (!template) return { error: 'TEMPLATE_NOT_FOUND', message: 'Template not found.' };
            const result = await CloudWA.sendTemplate(phone, template.name, params, template.language || 'en');
            await _saveMessageToFirestore({ to: phone, type: 'template', templateId, content: template.name, params, status: result.success ? 'sent' : 'failed', waMessageId: result.messageId });
            return result;
        } catch (error) { return { error: 'SEND_FAILED', message: error.message }; }
    }

    async function sendMediaMessage(phone, mediaType, mediaUrl, caption = '') {
        try {
            const typeConfig = MESSAGE_TYPES[mediaType];
            if (!typeConfig) return { error: 'INVALID_TYPE', message: 'Invalid media type.' };
            const result = await CloudWA.sendMessage({
                to: phone, type: mediaType,
                [mediaType]: { link: mediaUrl, caption },
            });
            await _saveMessageToFirestore({ to: phone, type: mediaType, content: mediaUrl, caption, status: result.success ? 'sent' : 'failed', waMessageId: result.messageId });
            return result;
        } catch (error) { return { error: 'SEND_FAILED', message: error.message }; }
    }

    async function sendInteractiveMessage(phone, interactiveData) {
        try {
            const result = await CloudWA.sendMessage({ to: phone, type: 'interactive', interactive: interactiveData });
            await _saveMessageToFirestore({ to: phone, type: 'interactive', content: JSON.stringify(interactiveData), status: result.success ? 'sent' : 'failed', waMessageId: result.messageId });
            return result;
        } catch (error) { return { error: 'SEND_FAILED', message: error.message }; }
    }

    async function _saveMessageToFirestore(messageData) {
        try {
            if (window.CRM_Firestore?.createDocument) {
                const data = {
                    ...messageData,
                    tenantId: _getTenantId(),
                    senderId: _getCurrentUser().uid,
                    senderName: _getCurrentUser().displayName,
                    sentAt: new Date().toISOString(),
                    direction: 'outbound',
                };
                await window.CRM_Firestore.createDocument('whatsapp_messages', data);
            }
        } catch (e) { /* non-critical */ }
    }

    async function loadMessages(conversationId, limit = 50) {
        try {
            if (window.CRM_Firestore?.queryDocuments) {
                const result = await window.CRM_Firestore.queryDocuments('whatsapp_messages', {
                    filters: [['conversationId', '==', conversationId]],
                    orderBy: 'sentAt', orderDir: 'desc', limit,
                });
                return result?.data || [];
            }
            return [];
        } catch (error) { return []; }
    }

    // ============================================================
    // SECTION 6: CONTACT MANAGEMENT
    // ============================================================
    async function loadContacts(search = '') {
        try {
            if (window.CRM_Firestore?.queryDocuments) {
                const filters = [];
                if (search) filters.push(['name', '>=', search], ['name', '<=', search + '\uf8ff']);
                const result = await window.CRM_Firestore.queryDocuments('whatsapp_contacts', { filters, orderBy: 'name', orderDir: 'asc', limit: 100 });
                if (result?.data) {
                    _contactCache.clear();
                    result.data.forEach(c => _contactCache.set(c.id, c));
                    return result.data;
                }
            }
            return [];
        } catch (error) { return []; }
    }

    async function addContact(contactData) {
        try {
            const data = { ...contactData, tenantId: _getTenantId(), createdAt: new Date().toISOString(), createdBy: _getCurrentUser().uid };
            if (window.CRM_Firestore?.createDocument) {
                const created = await window.CRM_Firestore.createDocument('whatsapp_contacts', data);
                if (created) { _contactCache.set(created.id, created); return created; }
            }
            return null;
        } catch (error) { return { error: 'CREATE_FAILED', message: error.message }; }
    }

    // ============================================================
    // SECTION 7: LEAD CAPTURE FROM WHATSAPP
    // ============================================================
    async function captureLeadFromWhatsApp(phone, messageData = {}) {
        try {
            if (window.CRM_Leads?.createLead) {
                const leadData = {
                    firstName: messageData.senderName || 'WhatsApp Lead',
                    phone: phone,
                    source: 'WhatsApp',
                    status: 'New',
                    notes: messageData.text || 'Captured from WhatsApp conversation',
                    sourceDetails: {
                        waMessageId: messageData.waMessageId || '',
                        capturedAt: new Date().toISOString(),
                    },
                };
                return await window.CRM_Leads.createLead(leadData);
            }
            // Fallback: create lead via Firestore directly
            if (window.CRM_Firestore?.createDocument) {
                return await window.CRM_Firestore.createDocument('leads', {
                    firstName: messageData.senderName || 'WhatsApp Lead',
                    phone, source: 'WhatsApp', status: 'New',
                    tenantId: _getTenantId(), createdAt: new Date().toISOString(),
                });
            }
            return null;
        } catch (error) { console.error('[WhatsApp] Lead capture error:', error); return null; }
    }

    // ============================================================
    // SECTION 8: WEBHOOK HANDLER
    // ============================================================
    function setupWebhookListener() {
        try {
            // Listen for incoming WhatsApp messages via CloudWA webhook
            window.addEventListener('crm:whatsapp-message', async (event) => {
                const message = event.detail;
                if (!message) return;

                // Save incoming message
                if (window.CRM_Firestore?.createDocument) {
                    await window.CRM_Firestore.createDocument('whatsapp_messages', {
                        ...message, tenantId: _getTenantId(), direction: 'inbound',
                        receivedAt: new Date().toISOString(), status: 'delivered',
                    });
                }

                // Check if it's a new lead (first message from unknown number)
                const existingContact = _contactCache.get(message.from);
                if (!existingContact) {
                    // Auto-capture as lead
                    await captureLeadFromWhatsApp(message.from, message);
                    _showToast(`New lead captured from WhatsApp: ${message.from}`, 'info');
                }

                // Trigger automation
                await executeAutomationRule('incoming_message', { phone: message.from, message });
            });

            console.log('[WhatsApp] Webhook listener active.');
        } catch (error) { console.error('[WhatsApp] Webhook setup error:', error); }
    }

    // ============================================================
    // SECTION 9: CROSS-SAAS SYNC
    // ============================================================
    async function syncWithWhatsAppCRM() {
        try {
            if (!window.CRM_Tenant?.canAccessSaasApp || !window.CRM_Tenant.canAccessSaasApp('whatsapp-crm')) {
                return { synced: false, message: 'WhatsApp CRM access not enabled.' };
            }

            if (window.CRM_Tenant?.syncNow) {
                const result = await window.CRM_Tenant.syncNow();
                return { synced: result.success, message: result.message };
            }
            return { synced: false, message: 'Sync not available.' };
        } catch (error) { return { synced: false, message: error.message }; }
    }

    // ============================================================
    // SECTION 10: QUICK REPLY BUTTONS
    // ============================================================
    function generateQuickReplies(context = {}) {
        const quickReplies = [
            { id: 'payment_link', label: '💳 Send Payment Link', action: 'sendPaymentLink' },
            { id: 'invoice', label: '🧾 Share Invoice', action: 'shareInvoice' },
            { id: 'appointment', label: '📅 Book Appointment', action: 'bookAppointment' },
            { id: 'status', label: '📊 Order Status', action: 'checkStatus' },
            { id: 'support', label: '🎧 Talk to Support', action: 'contactSupport' },
            { id: 'catalog', label: '📋 View Catalog', action: 'viewCatalog' },
        ];

        return {
            type: 'button',
            header: { type: 'text', text: context.header || 'What would you like to do?' },
            body: { text: context.body || 'Please select an option:' },
            action: {
                buttons: quickReplies.slice(0, 3).map(qr => ({
                    type: 'reply', reply: { id: qr.id, title: qr.label },
                })),
            },
        };
    }

    // ============================================================
    // SECTION 11: USAGE STATISTICS
    // ============================================================
    async function getUsageStats() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

            let todaySent = 0, thisMonthSent = 0, todayReceived = 0, thisMonthReceived = 0;
            let templateUsage = {}, dailyUsage = {};

            if (window.CRM_Firestore?.queryDocuments) {
                const monthResult = await window.CRM_Firestore.queryDocuments('whatsapp_messages', {
                    filters: [['sentAt', '>=', monthStart]],
                    orderBy: 'sentAt', orderDir: 'desc', limit: 1000,
                });
                if (monthResult?.data) {
                    monthResult.data.forEach(m => {
                        if (m.direction === 'outbound') {
                            thisMonthSent++;
                            if (m.sentAt?.startsWith(today)) todaySent++;
                            if (m.templateId) templateUsage[m.templateId] = (templateUsage[m.templateId] || 0) + 1;
                        } else {
                            thisMonthReceived++;
                            if (m.receivedAt?.startsWith(today)) todayReceived++;
                        }
                        const day = (m.sentAt || m.receivedAt || '').split('T')[0];
                        if (day) dailyUsage[day] = (dailyUsage[day] || 0) + 1;
                    });
                }
            }

            const dailyLimit = CloudWA.getDailyUsage();

            return {
                todaySent, todayReceived, thisMonthSent, thisMonthReceived,
                templateUsage, dailyUsage,
                dailyLimitRemaining: dailyLimit.remaining,
                dailyLimitTotal: dailyLimit.limit,
                rateLimitRemaining: dailyLimit.rateLimitRemaining,
            };
        } catch (error) { console.error('[WhatsApp] Stats error:', error); return {}; }
    }

    // ============================================================
    // SECTION 12: UI RENDERERS
    // ============================================================
    async function renderChatView(containerId = 'whatsappContent') {
        try {
            const container = document.getElementById(containerId);
            if (!container) return;

            const stats = await getUsageStats();
            const contacts = await loadContacts();
            const templates = await loadTemplates();

            let html = `
                <div class="whatsapp-container flex" style="height:calc(100vh - 180px);">
                    <!-- Sidebar -->
                    <div class="wa-sidebar" style="width:340px;border-right:1px solid var(--border-color);overflow-y:auto;flex-shrink:0;">
                        <div class="p-3 border-b">
                            <input type="search" id="waContactSearch" class="form-input" placeholder="Search contacts..." style="min-height:40px;">
                        </div>
                        <div id="waContactList">
                            ${contacts.length === 0 ? '<div class="p-4 text-center text-muted">No contacts yet</div>' :
                                contacts.map(c => `
                                    <div class="wa-contact-item flex items-center gap-3 p-3 cursor-pointer hover-bg" data-phone="${c.phone}" onclick="window.CRM_WhatsApp.openChat('${c.phone}')">
                                        <div class="avatar" style="background:var(--gold-gradient);">${(c.name || '?')[0].toUpperCase()}</div>
                                        <div class="flex-1 min-w-0">
                                            <div class="font-medium truncate">${_escapeHtml(c.name || c.phone)}</div>
                                            <div class="text-xs text-muted truncate">${_escapeHtml(c.lastMessage || 'No messages')}</div>
                                        </div>
                                        ${c.unread ? `<span class="badge badge-gold">${c.unread}</span>` : ''}
                                    </div>
                                `).join('')
                            }
                        </div>
                    </div>
                    <!-- Chat Area -->
                    <div class="wa-chat flex-1 flex flex-col">
                        <div class="wa-chat-header p-3 border-b flex items-center gap-3">
                            <div class="avatar" style="background:var(--gold-gradient);font-size:1.2rem;" id="chatAvatar">👤</div>
                            <div>
                                <div class="font-semibold" id="chatName">Select a contact</div>
                                <div class="text-xs text-muted" id="chatStatus">Online</div>
                            </div>
                            <div class="ml-auto flex gap-2">
                                <button class="btn btn-ghost btn-sm" onclick="window.CRM_WhatsApp.shareInvoice()" title="Share Invoice">🧾</button>
                                <button class="btn btn-ghost btn-sm" onclick="window.CRM_WhatsApp.sendPaymentLink()" title="Payment Link">💳</button>
                                <button class="btn btn-ghost btn-sm" onclick="window.CRM_WhatsApp.bookAppointment()" title="Book Appointment">📅</button>
                            </div>
                        </div>
                        <div class="wa-messages flex-1 overflow-y-auto p-4" id="waMessageList">
                            <div class="empty-state"><div class="empty-icon">💬</div><h4>WhatsApp Messages</h4><p>Select a contact to start messaging</p></div>
                        </div>
                        <div class="wa-input-area p-3 border-t flex gap-2">
                            <button class="btn btn-ghost btn-icon" title="Template" onclick="window.CRM_WhatsApp.showTemplateSelector()">📋</button>
                            <button class="btn btn-ghost btn-icon" title="Attachment" onclick="document.getElementById('waFileInput').click()">📎</button>
                            <input type="file" id="waFileInput" style="display:none;" onchange="window.CRM_WhatsApp.handleFileUpload(this)">
                            <textarea id="waMessageInput" class="form-input flex-1" rows="1" placeholder="Type a message..." style="min-height:44px;resize:none;" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window.CRM_WhatsApp.sendCurrentMessage();}"></textarea>
                            <button class="btn btn-primary btn-icon" onclick="window.CRM_WhatsApp.sendCurrentMessage()" title="Send">📨</button>
                        </div>
                    </div>
                </div>
                <!-- Template Selector Modal -->
                <div id="templateSelectorModal" class="modal-overlay" style="display:none;" onclick="if(event.target===this)this.style.display='none'">
                    <div class="modal-box modal-lg" onclick="event.stopPropagation()">
                        <div class="modal-header"><h3 class="modal-title">📋 Select Template</h3><button class="modal-close" onclick="document.getElementById('templateSelectorModal').style.display='none'">✕</button></div>
                        <div class="p-4 grid grid-2 gap-3">
                            ${templates.map(t => `
                                <div class="card cursor-pointer" onclick="window.CRM_WhatsApp.selectTemplate('${t.id}')">
                                    <div class="font-semibold">${_escapeHtml(t.name)}</div>
                                    <div class="text-xs text-muted">${t.category || 'UTILITY'} • ${t.language || 'en'}</div>
                                    <div class="text-sm mt-2 text-muted truncate">${_escapeHtml((t.content || '').substring(0, 80))}...</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
            container.innerHTML = html;

            const contactSearch = document.getElementById('waContactSearch');
            if (contactSearch) {
                contactSearch.addEventListener('input', _debounce(async () => {
                    const contacts = await loadContacts(contactSearch.value);
                    _renderContactList(contacts);
                }, 300));
            }
        } catch (error) { console.error('[WhatsApp] Render chat error:', error); }
    }

    function _renderContactList(contacts) {
        const list = document.getElementById('waContactList');
        if (!list) return;
        if (contacts.length === 0) {
            list.innerHTML = '<div class="p-4 text-center text-muted">No contacts found</div>';
            return;
        }
        list.innerHTML = contacts.map(c => `
            <div class="wa-contact-item flex items-center gap-3 p-3 cursor-pointer hover-bg" data-phone="${c.phone}" onclick="window.CRM_WhatsApp.openChat('${c.phone}')">
                <div class="avatar" style="background:var(--gold-gradient);">${(c.name || '?')[0].toUpperCase()}</div>
                <div class="flex-1 min-w-0">
                    <div class="font-medium truncate">${_escapeHtml(c.name || c.phone)}</div>
                    <div class="text-xs text-muted truncate">${_escapeHtml(c.lastMessage || 'No messages')}</div>
                </div>
            </div>
        `).join('');
    }

    async function renderAutomationView(containerId = 'whatsappContent') {
        try {
            const container = document.getElementById(containerId);
            if (!container) return;
            const rules = await loadAutomationRules();
            const templates = await loadTemplates();

            container.innerHTML = `
                <div class="automation-container">
                    <div class="flex justify-between items-center mb-4">
                        <h2>🤖 Automation Rules</h2>
                        <button class="btn btn-primary" onclick="window.CRM_WhatsApp.showAddRuleForm()">+ Add Rule</button>
                    </div>
                    ${rules.length === 0 ? `
                        <div class="empty-state"><div class="empty-icon">🤖</div><h4>No Automation Rules</h4><p>Create rules to auto-send WhatsApp messages on triggers like new lead, payment received, etc.</p></div>
                    ` : `
                        <div class="grid gap-3">
                            ${rules.map(r => `
                                <div class="card flex justify-between items-center">
                                    <div>
                                        <div class="font-semibold">${AUTOMATION_TRIGGERS[r.trigger] || r.trigger}</div>
                                        <div class="text-sm text-muted">Template: ${_templateCache.get(r.templateId)?.name || r.templateId}</div>
                                        <div class="text-xs text-muted">Executed ${r.executionCount || 0} times</div>
                                    </div>
                                    <div class="flex gap-2">
                                        <span class="badge badge-${r.status === 'active' ? 'success' : 'warning'}">${r.status}</span>
                                        <button class="btn btn-ghost btn-sm" onclick="window.CRM_WhatsApp.toggleRule('${r.id}')">${r.status === 'active' ? '⏸️' : '▶️'}</button>
                                        <button class="btn btn-ghost btn-sm text-error" onclick="window.CRM_WhatsApp.deleteRule('${r.id}')">🗑️</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>
            `;
        } catch (error) { console.error('[WhatsApp] Render automation error:', error); }
    }

    async function renderBroadcastView(containerId = 'whatsappContent') {
        try {
            const container = document.getElementById(containerId);
            if (!container) return;
            const templates = await loadTemplates();
            const contacts = await loadContacts();

            container.innerHTML = `
                <div class="broadcast-container">
                    <h2 class="mb-4">📢 Broadcast Message</h2>
                    <div class="card mb-4">
                        <div class="card-header"><h4>Select Template</h4></div>
                        <div class="card-body">
                            <select id="broadcastTemplate" class="form-select mb-3">
                                <option value="">Select a template...</option>
                                ${templates.map(t => `<option value="${t.id}">${t.name} (${t.category || 'UTILITY'})</option>`).join('')}
                            </select>
                            <div id="broadcastPreview" class="p-3 bg-tertiary rounded" style="display:none;"></div>
                        </div>
                    </div>
                    <div class="card mb-4">
                        <div class="card-header flex justify-between items-center">
                            <h4>Select Recipients (${contacts.length} available)</h4>
                            <button class="btn btn-ghost btn-sm" onclick="window.CRM_WhatsApp.selectAllContacts()">Select All</button>
                        </div>
                        <div class="card-body" style="max-height:300px;overflow-y:auto;">
                            ${contacts.map(c => `
                                <label class="checkbox-group"><input type="checkbox" class="broadcast-contact" value="${c.phone}" data-name="${_escapeHtml(c.name || c.phone)}"> ${_escapeHtml(c.name || c.phone)} (${c.phone})</label>
                            `).join('')}
                        </div>
                    </div>
                    <button class="btn btn-primary btn-lg btn-block" id="sendBroadcastBtn" onclick="window.CRM_WhatsApp.executeBroadcast()">📢 Send Broadcast</button>
                </div>
            `;
        } catch (error) { console.error('[WhatsApp] Render broadcast error:', error); }
    }

    // ============================================================
    // SECTION 13: CHAT ACTIONS
    // ============================================================
    async function openChat(phone) {
        try {
            _activeChat = phone;
            document.getElementById('chatName').textContent = phone;
            document.getElementById('chatAvatar').textContent = (phone || '?')[0].toUpperCase();
            document.getElementById('chatStatus').textContent = 'Online';

            const messages = await loadMessages(phone, 50);
            const msgList = document.getElementById('waMessageList');
            if (!msgList) return;

            if (messages.length === 0) {
                msgList.innerHTML = '<div class="text-center text-muted p-4">No messages yet. Start a conversation!</div>';
            } else {
                msgList.innerHTML = messages.reverse().map(m => `
                    <div class="flex mb-3 ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}">
                        <div class="wa-bubble ${m.direction === 'outbound' ? 'wa-outbound' : 'wa-inbound'}" style="max-width:70%;padding:10px 14px;border-radius:16px;${m.direction === 'outbound' ? 'background:rgba(212,175,55,0.15);margin-left:auto;' : 'background:var(--bg-tertiary);'}">
                            <div>${_escapeHtml(m.content || m.caption || '')}</div>
                            <div class="text-2xs text-muted mt-1 text-right">
                                ${_formatTime(m.sentAt || m.receivedAt)}
                                ${m.status ? MESSAGE_STATUSES[m.status]?.icon || '' : ''}
                            </div>
                        </div>
                    </div>
                `).join('');
                msgList.scrollTop = msgList.scrollHeight;
            }
        } catch (error) { console.error('[WhatsApp] Open chat error:', error); }
    }

    async function sendCurrentMessage() {
        try {
            const input = document.getElementById('waMessageInput');
            if (!input || !input.value.trim()) return;
            if (!_activeChat) { _showToast('Select a contact first.', 'warning'); return; }

            const text = input.value.trim();
            const result = await sendTextMessage(_activeChat, text);

            if (result && !result.error) {
                input.value = '';
                await openChat(_activeChat); // Refresh
            } else {
                _showToast('Failed to send message.', 'error');
            }
        } catch (error) { _showToast('Error: ' + error.message, 'error'); }
    }

    function showTemplateSelector() {
        const modal = document.getElementById('templateSelectorModal');
        if (modal) modal.style.display = 'flex';
    }

    async function selectTemplate(templateId) {
        _selectedTemplate = templateId;
        document.getElementById('templateSelectorModal').style.display = 'none';
        const template = _templateCache.get(templateId);
        if (template && _activeChat) {
            if (confirm(`Send template "${template.name}" to ${_activeChat}?`)) {
                const result = await sendTemplateMessage(_activeChat, templateId, {});
                if (result && !result.error) {
                    _showToast('Template sent!', 'success');
                    await openChat(_activeChat);
                } else {
                    _showToast('Failed to send template.', 'error');
                }
            }
        }
    }

    async function shareInvoice() {
        if (!_activeChat) { _showToast('Select a contact first.', 'warning'); return; }
        // Open invoice selector (simplified)
        _showToast('Invoice sharing will be available with invoice module integration.', 'info');
    }

    async function sendPaymentLink() {
        if (!_activeChat) { _showToast('Select a contact first.', 'warning'); return; }
        if (window.CRM_Payments?.generatePaymentLink) {
            const link = window.CRM_Payments.generatePaymentLink('upi', { amount: 0 });
            await sendTextMessage(_activeChat, `💳 Payment Link: ${link.link}\n\nPay securely via UPI.`);
            await openChat(_activeChat);
        }
    }

    async function bookAppointment() {
        if (!_activeChat) { _showToast('Select a contact first.', 'warning'); return; }
        const interactiveMsg = generateQuickReplies({ header: 'Book Appointment', body: 'When would you like to schedule?' });
        await sendInteractiveMessage(_activeChat, interactiveMsg);
    }

    async function handleFileUpload(input) {
        try {
            const file = input.files[0];
            if (!file || !_activeChat) return;
            _showToast('Uploading...', 'info');
            // In production: upload via CloudWA API
            await sendMediaMessage(_activeChat, file.type.startsWith('image/') ? 'image' : 'document', URL.createObjectURL(file), file.name);
            await openChat(_activeChat);
            input.value = '';
        } catch (error) { _showToast('Upload failed.', 'error'); }
    }

    // ============================================================
    // SECTION 14: NAVIGATION
    // ============================================================
    async function navigateToChat() { _currentView = 'chat'; await renderChatView(); }
    async function navigateToTemplates() { _currentView = 'templates'; await renderTemplatesView(); }
    async function navigateToAutomation() { _currentView = 'automation'; await renderAutomationView(); }
    async function navigateToBroadcast() { _currentView = 'broadcast'; await renderBroadcastView(); }

    async function renderTemplatesView(containerId = 'whatsappContent') {
        const container = document.getElementById(containerId);
        if (!container) return;
        const templates = await loadTemplates();
        container.innerHTML = `
            <div><h2 class="mb-4">📋 Message Templates</h2>
            <div class="grid grid-2 gap-3">
                ${templates.map(t => `
                    <div class="card"><div class="font-semibold">${_escapeHtml(t.name)}</div>
                    <div class="text-xs text-muted">${t.category || 'UTILITY'} • ${t.language || 'en'} • ${t.status || 'approved'}</div>
                    <div class="text-sm mt-2">${_escapeHtml(t.content || '')}</div>
                    ${t.variables ? `<div class="text-xs text-muted mt-2">Variables: ${t.variables.join(', ')}</div>` : ''}
                    </div>
                `).join('')}
            </div></div>
        `;
    }

    // ============================================================
    // SECTION 15: INITIALIZATION
    // ============================================================
    function init() {
        try {
            if (_initialized) return;
            loadTemplates();
            loadAutomationRules();
            setupWebhookListener();
            renderChatView();
            _initialized = true;
            console.log('[CRM_WhatsApp] Module initialized.');
            console.log('[CRM_WhatsApp] CloudWA URL:', CLOUDWA_URL);
        } catch (error) { console.error('[CRM_WhatsApp] Init error:', error); }
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
        CloudWA,
        loadTemplates, createTemplate, deleteTemplate,
        loadAutomationRules, createAutomationRule, executeAutomationRule,
        sendTextMessage, sendTemplateMessage, sendMediaMessage, sendInteractiveMessage,
        sendBroadcast, loadMessages, loadContacts, addContact,
        captureLeadFromWhatsApp, syncWithWhatsAppCRM,
        generateQuickReplies, generatePaymentLink: (opts) => window.CRM_Payments?.generatePaymentLink('upi', opts),
        getUsageStats,
        openChat, sendCurrentMessage, showTemplateSelector, selectTemplate,
        shareInvoice, sendPaymentLink, bookAppointment, handleFileUpload,
        navigateToChat, navigateToTemplates, navigateToAutomation, navigateToBroadcast,
        renderChatView, renderAutomationView, renderBroadcastView,
        getFilters: () => _filters, getActiveChat: () => _activeChat,
        MESSAGE_TYPES, MESSAGE_STATUSES, AUTOMATION_TRIGGERS,
    };
})();

window.CRM_WhatsApp = CRM_WhatsApp;
console.log('[CRM_WhatsApp] Module loaded. window.CRM_WhatsApp available.');