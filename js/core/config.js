/**
 * 11 Avatar SMEs CRM — Global Configuration
 * @file js/core/config.js
 */
'use strict';

const CRM_Config = (function() {
    'use strict';

    function detectEnvironment() {
        try {
            const hostname = window.location.hostname;
            if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('.local')) return 'development';
            if (hostname.includes('staging') || hostname.includes('test') || hostname.includes('github.io')) return 'staging';
            return 'production';
        } catch (error) { return 'production'; }
    }

    const ENV = detectEnvironment();
    const IS_DEV = ENV === 'development';
    const IS_STAGING = ENV === 'staging';
    const IS_PROD = ENV === 'production';

    const firebase = {
        projectId: 'avatar-wa-dual-crm',
        appId: '1:946959261009:web:175f5390d63715f1f8c770',
        apiKey: 'AIzaSyBZDaHJSt-4AV6EJYG76p8kcsIHf6LOxdU',
        authDomain: 'avatar-wa-dual-crm.firebaseapp.com',
        databaseURL: 'https://avatar-wa-dual-crm-default-rtdb.asia-southeast1.firebasedatabase.app',
        storageBucket: 'avatar-wa-dual-crm.firebasestorage.app',
        messagingSenderId: '946959261009',

        collections: {
            ORGANIZATIONS: 'organizations',
            USERS: 'users',
            TENANTS: 'tenants',
            CLIENTS: 'clients',
            CONTACTS: 'contacts',
            LEADS: 'leads',
            DEALS: 'deals',
            PIPELINE_STAGES: 'pipeline_stages',
            INVOICES: 'invoices',
            INVOICE_ITEMS: 'invoice_items',
            PAYMENTS: 'payments',
            PAYMENT_GATEWAYS: 'payment_gateways',
            TASKS: 'tasks',
            TASK_COMMENTS: 'task_comments',
            PROJECTS: 'projects',
            PROJECT_MILESTONES: 'project_milestones',
            RETAINERS: 'retainers',
            RETAINER_INVOICES: 'retainer_invoices',
            COURSES: 'courses',
            COURSE_MODULES: 'course_modules',
            ENROLLMENTS: 'enrollments',
            ASSESSMENTS: 'assessments',
            CERTIFICATES: 'certificates',
            REFERRALS: 'referrals',
            REFERRAL_PARTNERS: 'referral_partners',
            REFERRAL_COMMISSIONS: 'referral_commissions',
            NOTIFICATIONS: 'notifications',
            NOTIFICATION_PREFERENCES: 'notification_preferences',
            CALENDAR_EVENTS: 'calendar_events',
            APPOINTMENTS: 'appointments',
            WHATSAPP_MESSAGES: 'whatsapp_messages',
            WHATSAPP_TEMPLATES: 'whatsapp_templates',
            WHATSAPP_CONTACTS: 'whatsapp_contacts',
            EMAIL_QUEUE: 'email_queue',
            SMS_QUEUE: 'sms_queue',
            WEBHOOK_EVENTS: 'webhook_events',
            WEBHOOK_LOGS: 'webhook_logs',
            AUDIT_LOGS: 'audit_logs',
            SETTINGS: 'settings',
            BACKUP_HISTORY: 'backup_history',
            ACTIVITY_LOGS: 'activity_logs',
            REPORTS: 'reports',
            REPORT_SCHEDULES: 'report_schedules',
            TEAM_INVITES: 'team_invites',
            BROADCAST_LOGS: 'broadcast_logs',
            AUTOMATION_RULES: 'automation_rules',
            OTP_STORE: 'otp_store',
            API_KEYS: 'api_keys',
            ZAPIER_ZAPS: 'zapier_zaps',
            ZAPIER_LOGS: 'zapier_logs',
            ZAPIER_WEBHOOKS: 'zapier_webhooks',
            ZOHO_MAPPINGS: 'zoho_mappings',
            ZOHO_SYNC_LOG: 'zoho_sync_log',
            HUBSPOT_MAPPINGS: 'hubspot_mappings',
            HUBSPOT_SYNC_LOG: 'hubspot_sync_log',
            SALESFORCE_MAPPINGS: 'salesforce_mappings',
            SALESFORCE_SYNC_LOG: 'salesforce_sync_log',
            TALLY_SYNC_LOG: 'tally_sync_log',
            DRIVE_FILES: 'drive_files',
            DRIVE_SHARED_DRIVES: 'drive_shared_drives',
            DROPBOX_FILES: 'dropbox_files',
        },

        storagePaths: {
            USER_AVATARS: 'users/{userId}/avatar',
            CLIENT_LOGOS: 'clients/{clientId}/logo',
            INVOICE_PDFS: 'invoices/{invoiceId}/pdf',
            DOCUMENTS: 'tenants/{tenantId}/documents',
            COURSE_MATERIALS: 'courses/{courseId}/materials',
            BACKUP_FILES: 'tenants/{tenantId}/backups',
            TEMP_UPLOADS: 'temp/{userId}',
            EXPORTS: 'tenants/{tenantId}/exports',
            SIGNATURES: 'signatures/{userId}',
            WHATSAPP_MEDIA: 'whatsapp/{tenantId}',
        },
    };

    const api = {
        workerUrl: 'https://11avatar-api.11avatardigitalhub.workers.dev',
        version: 'v1',
        endpoints: {
            AUTH_REGISTER: '/auth/register',
            AUTH_LOGIN: '/auth/login',
            AUTH_LOGOUT: '/auth/logout',
            AUTH_REFRESH: '/auth/refresh',
            AUTH_VERIFY_EMAIL: '/auth/verify-email',
            AUTH_RESET_PASSWORD: '/auth/reset-password',
            AUTH_CHANGE_PASSWORD: '/auth/change-password',
            TENANT_CREATE: '/tenants/create',
            TENANT_UPDATE: '/tenants/update',
            TENANT_GET: '/tenants/{tenantId}',
            TENANT_LIST: '/tenants/list',
            TENANT_SUSPEND: '/tenants/suspend',
            TENANT_DELETE: '/tenants/delete',
            USER_INVITE: '/users/invite',
            USER_UPDATE_ROLE: '/users/update-role',
            USER_SUSPEND: '/users/suspend',
            USER_LIST: '/users/list',
            USER_APPROVE: '/users/approve',
            LEAD_CAPTURE_WEBHOOK: '/webhooks/lead-capture',
            LEAD_ENRICH: '/leads/enrich',
            LEAD_BULK_IMPORT: '/leads/bulk-import',
            INVOICE_GENERATE_PDF: '/invoices/generate-pdf',
            INVOICE_SEND_EMAIL: '/invoices/send-email',
            INVOICE_GENERATE_IRN: '/invoices/generate-irn',
            INVOICE_GENERATE_EWAYBILL: '/invoices/generate-ewaybill',
            PAYMENT_CREATE_ORDER: '/payments/create-order',
            PAYMENT_VERIFY: '/payments/verify',
            PAYMENT_REFUND: '/payments/refund',
            PAYMENT_RECONCILE: '/payments/reconcile',
            WHATSAPP_SEND: '/whatsapp/send',
            WHATSAPP_TEMPLATE_SEND: '/whatsapp/send-template',
            WHATSAPP_WEBHOOK: '/webhooks/whatsapp',
            NOTIFICATION_SEND: '/notifications/send',
            EMAIL_SEND: '/email/send',
            SMS_SEND: '/sms/send',
            REPORT_GENERATE: '/reports/generate',
            REPORT_SCHEDULE: '/reports/schedule',
            REPORT_EXPORT: '/reports/export',
            BACKUP_CREATE: '/backup/create',
            BACKUP_RESTORE: '/backup/restore',
            BACKUP_EXPORT: '/backup/export',
            WEBHOOK_REGISTER: '/webhooks/register',
            WEBHOOK_TEST: '/webhooks/test',
        },
        requestDefaults: {
            timeout: 30000,
            retries: 3,
            retryDelay: 1000,
            headers: { 'Content-Type': 'application/json', 'X-Client-Version': '2.2.0', 'X-Client-Platform': 'web' },
        },
        buildUrl: function(endpoint, params) {
            try {
                let url = `${this.workerUrl}/api/${this.version}${endpoint}`;
                if (params) {
                    Object.keys(params).forEach(key => { url = url.replace(`{${key}}`, encodeURIComponent(params[key])); });
                }
                return url;
            } catch (error) { return ''; }
        },
    };

    const app = {
        name: '11 Avatar SMEs CRM',
        shortName: '11 Avatar CRM',
        version: '2.2.0',
        environment: ENV,
        isDev: IS_DEV,
        isStaging: IS_STAGING,
        isProd: IS_PROD,
        debug: IS_DEV || IS_STAGING,
        verboseLogging: IS_DEV,
        liveUrl: IS_PROD ? 'https://SME.11avatardigitalhub.cloud/' : 'https://11avatardigitalhub.github.io/11Avatar-SMEs-CRM/',
        landingUrl: 'index.html',
        appUrl: 'app.html',
        cloudwaUrl: 'https://cloudwa.11avatardigitalhub.cloud/login',
        emails: {
            info: 'info@11avatardigitalhub.cloud',
            support: 'support@11avatardigitalhub.cloud',
            contact: 'contact@11avatardigitalhub.cloud',
            admin: 'admin@11avatardigitalhub.cloud',
            billing: 'billing@11avatardigitalhub.cloud',
            noreply: 'noreply@11avatardigitalhub.cloud',
        },
        storageKeys: {
            AUTH_TOKEN: 'crm_auth_token',
            AUTH_REFRESH_TOKEN: 'crm_refresh_token',
            USER_DATA: 'crm_user',
            TENANT_DATA: 'crm_tenant',
            THEME: 'crm_theme',
            SIDEBAR_STATE: 'crm_sidebar_collapsed',
            LAST_MODULE: 'crm_last_module',
            ONBOARDING_DONE: 'crm_onboarding_done',
            CACHE_PREFIX: 'crm_cache_',
            OFFLINE_QUEUE: 'crm_offline_queue',
        },
        sessionTimeout: 28800000,
        inactivityTimeout: 1800000,
        tokenRefreshBuffer: 300000,
    };

    const features = {
        DASHBOARD: true, LEADS: true, PIPELINE: true, CLIENTS: true,
        INVOICES: true, PAYMENTS: true, RETAINERS: true,
        TASKS: true, PROJECTS: true, APPOINTMENTS: true,
        WHATSAPP: true, TRAINING: true, REFERRALS: true,
        REPORTS: true, NOTIFICATIONS: true,
        SETTINGS: true, AUDIT_LOGS: true, PROFILE: true,
        AI_LEAD_SCORING: false, ADVANCED_ANALYTICS: false, CUSTOM_REPORT_BUILDER: false,
        E_INVOICE_IRN: true, E_WAY_BILL: true,
        MULTI_CURRENCY: false, WHITE_LABEL: false, API_ACCESS: false,
    };

    const modules = {
        dashboard: { refreshInterval: 30000, kpis: ['revenue', 'leads', 'conversion', 'outstanding'], defaultDateRange: 'this_month' },
        leads: {
            maxBulkImport: 1000, allowedImportFormats: ['csv', 'json', 'xlsx'], autoFollowUpDays: 2, maxSocialLinks: 6,
            sources: ['Cold Calling', 'WhatsApp', 'Facebook Ads', 'Google Ads', 'Instagram', 'LinkedIn', 'Referral', 'Website', 'Exhibition', 'Walk-in', 'Email Campaign', 'SMS Campaign', 'Partner', 'Training', 'Other'],
            pipelineStages: ['New', 'Attempting Contact', 'Connected', 'Qualified', 'Discovery Call Booked', 'Discovery Call Completed', 'Proposal Sent', 'Negotiation', 'Verbal Yes', 'Invoice Sent', 'Won', 'Lost'],
            scoreRules: { HAS_NAME: 5, HAS_MOBILE: 5, HAS_EMAIL: 3, HAS_BUSINESS: 3, HAS_WEBSITE: 2, HAS_DEAL_VALUE: 10, REFERRAL_SOURCE: 8, WEBSITE_SOURCE: 8, HAS_SOCIAL: 4 },
        },
        pipeline: { defaultView: 'kanban', views: ['kanban', 'list', 'table'], dealStages: ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'], probabilityByStage: { 'New': 10, 'Contacted': 25, 'Qualified': 50, 'Proposal': 70, 'Negotiation': 85, 'Closed Won': 100, 'Closed Lost': 0 } },
        clients: { maxContactsPerClient: 50, types: ['Individual', 'Partnership', 'LLP', 'Pvt Ltd', 'Public Ltd', 'Trust', 'Society', 'Other'], gstinRequired: true, panRequired: true },
        invoices: { currency: '₹', currencyCode: 'INR', defaultTaxRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, paymentTerms: ['Net 7', 'Net 15', 'Net 30', 'Net 45', 'Immediate', 'Custom'], invoicePrefix: 'INV', dueDaysDefault: 15, maxInvoiceItems: 50, hsnSacRequired: true, eWayBillThreshold: 50000 },
        payments: { supportedGateways: ['razorpay', 'stripe', 'paypal', 'upi', 'neft', 'rtgs', 'cheque', 'cash'], cashPaymentLimit: 200000, reconciliationAutoDays: 7, utrRequired: true, currencies: ['INR', 'USD', 'EUR', 'GBP', 'AED'] },
        whatsapp: { maxDailyMessages: 1000, maxTemplateCharacters: 1024, supportedMediaTypes: ['image', 'video', 'document', 'audio'], rateLimitPerMinute: 20, sessionTimeout: 86400000 },
        tasks: { maxSubtasks: 20, maxAssignees: 5, priorityLevels: ['Low', 'Medium', 'High', 'Urgent'], defaultSla: 48, undoStackLimit: 50 },
        projects: { maxMilestones: 50, budgetWarningThreshold: 80, healthScoreWeights: { BUDGET: 30, TIMELINE: 30, QUALITY: 20, CLIENT_SATISFACTION: 20 } },
        retainers: { autoInvoiceDays: 7, utilizationWarning: 80, rolloverPolicies: ['None', 'Up to 25%', 'Up to 50%', 'Unlimited'], slaLevels: ['Standard', 'Priority', 'Premium', 'Enterprise'] },
        referrals: { maxLevels: 5, commissionTypes: ['Fixed', 'Percentage', 'Tiered'], defaultCommissionRate: 10, payoutThreshold: 1000, partnerTiers: ['Bronze', 'Silver', 'Gold', 'Platinum'] },
        reports: { maxCustomReports: 20, exportFormats: ['pdf', 'excel', 'csv', 'json'], maxSchedulePerUser: 10, chartTypes: ['bar', 'line', 'pie', 'doughnut', 'area', 'radar', 'scatter', 'bubble', 'funnel', 'gauge', 'heatmap', 'waterfall'] },
        training: { maxModulesPerCourse: 50, passPercentage: 60, certificateLevels: ['Participation', 'Bronze', 'Silver', 'Gold', 'Platinum'], questionTypes: ['mcq', 'true_false', 'short_answer', 'essay', 'file_upload'] },
        appointments: { defaultDuration: 30, bufferTime: 15, reminderBefore: [15, 30, 60, 1440], maxPerDay: 20 },
        notifications: { channels: ['in_app', 'email', 'sms', 'push'], maxInAppStored: 100, digestFrequency: 'daily' },
        settings: { maxApiKeys: 5, maxWebhooks: 20, maxAutomationRules: 50 },
    };

    const business = {
        gst: { enabled: true, defaultRate: 18, rates: [0, 0.25, 3, 5, 12, 18, 28], hsnCodeRequired: true, sacCodeRequired: true, eInvoiceApplicable: true, stateJurisdiction: '09' },
        format: { currency: '₹', currencySymbol: '₹', locale: 'en-IN', dateFormat: 'DD/MM/YYYY', timeFormat: 'hh:mm A', numberSystem: 'indian', decimalPlaces: 2 },
        compliance: { cashTransactionLimit: 200000, panRequiredAbove: 50000, tdsApplicableAbove: 30000, gstRegistrationThreshold: 2000000 },
        businessHours: { start: '09:00', end: '18:00', timezone: 'Asia/Kolkata', workingDays: [1, 2, 3, 4, 5, 6] },
        dataRetention: { auditLogs: 365, deletedRecords: 90, notifications: 30, backupHistory: 7, exportFiles: 7 },
    };

    const tenants = {
        defaultPlan: 'free',
        plans: {
            free: { name: 'Free Forever', maxUsers: 3, maxLeads: 500, maxInvoices: 50, maxStorage: 104857600, features: ['DASHBOARD', 'LEADS', 'PIPELINE', 'CLIENTS', 'INVOICES', 'PAYMENTS'], supportLevel: 'email' },
            starter: { name: 'Starter', price: 499, maxUsers: 10, maxLeads: 5000, maxInvoices: 500, maxStorage: 1073741824, features: ['ALL_CORE', 'WHATSAPP', 'TASKS', 'APPOINTMENTS'], supportLevel: 'priority_email' },
            professional: { name: 'Professional', price: 1499, maxUsers: 50, maxLeads: 50000, maxInvoices: 5000, maxStorage: 10737418240, features: ['ALL'], supportLevel: 'chat_phone' },
            enterprise: { name: 'Enterprise', price: null, maxUsers: -1, maxLeads: -1, maxInvoices: -1, maxStorage: 107374182400, features: ['ALL', 'WHITE_LABEL', 'API_ACCESS', 'CUSTOM_INTEGRATIONS'], supportLevel: 'dedicated' },
        },
        registrationApprovalRequired: true,
        defaultModuleAccess: ['DASHBOARD', 'LEADS', 'PIPELINE', 'CLIENTS'],
    };

    const roles = {
        PLATFORM_OWNER: { level: 0, name: 'Platform Owner', permissions: ['*'], isSystemRole: true, canManageTenants: true, canAccessAllData: true },
        TENANT_ADMIN: { level: 1, name: 'Tenant Admin', permissions: ['MANAGE_USERS', 'MANAGE_ROLES', 'MANAGE_BILLING', 'VIEW_ALL_DATA', 'EDIT_ALL_DATA', 'DELETE_ALL_DATA', 'EXPORT_ALL', 'MANAGE_SETTINGS', 'MANAGE_INTEGRATIONS', 'VIEW_AUDIT_LOGS', 'MANAGE_MODULES'], isSystemRole: false, canAccessAllData: true },
        SUB_ADMIN: { level: 2, name: 'Sub Admin', permissions: ['MANAGE_USERS', 'VIEW_ALL_DATA', 'EDIT_ALL_DATA', 'EXPORT_ALL', 'MANAGE_SETTINGS_LIMITED', 'VIEW_AUDIT_LOGS'], isSystemRole: false, canAccessAllData: true },
        MANAGER: { level: 3, name: 'Manager', permissions: ['VIEW_TEAM_DATA', 'EDIT_TEAM_DATA', 'ASSIGN_TASKS', 'VIEW_REPORTS', 'EXPORT_REPORTS', 'APPROVE_DEALS'], isSystemRole: false, canAccessAllData: false },
        TEAM_LEADER: { level: 4, name: 'Team Leader', permissions: ['VIEW_TEAM_DATA', 'EDIT_OWN_DATA', 'ASSIGN_LEADS', 'VIEW_TEAM_REPORTS', 'MANAGE_PIPELINE'], isSystemRole: false, canAccessAllData: false },
        EXECUTIVE: { level: 5, name: 'Executive', permissions: ['VIEW_OWN_DATA', 'EDIT_OWN_DATA', 'CREATE_LEADS', 'MANAGE_OWN_PIPELINE', 'CREATE_INVOICES', 'SEND_MESSAGES'], isSystemRole: false, canAccessAllData: false },
        VIEWER: { level: 6, name: 'Viewer', permissions: ['VIEW_ASSIGNED_DATA', 'VIEW_DASHBOARD', 'VIEW_REPORTS_LIMITED'], isSystemRole: false, canAccessAllData: false },
        RESTRICTED: { level: 7, name: 'Restricted', permissions: ['VIEW_MODULE_SPECIFIC'], isSystemRole: false, canAccessAllData: false },
    };

    const ui = {
        theme: { default: 'light', publicDefault: 'dark', respectOSPreference: true, allowUserToggle: true },
        animation: { enabled: true, reducedMotionSupport: true, defaultDuration: 300 },
        pagination: { defaultPageSize: 25, pageSizeOptions: [10, 25, 50, 100], maxVisiblePages: 7 },
        search: { minCharsForSearch: 2, debounceDelay: 300, maxRecentSearches: 10 },
        toast: { duration: 3000, errorDuration: 5000, maxVisible: 5, position: 'top-right', mobilePosition: 'bottom-center' },
        dateTime: { timezone: 'Asia/Kolkata', fiscalYearStart: '04-01', weekStartDay: 1 },
    };

    const pwa = {
        enabled: true, manifestPath: '/manifest.json', serviceWorkerPath: '/service-worker.js',
        cacheName: 'crm-v2', cacheStrategy: 'network-first', offlinePage: '/offline.html',
        shortcuts: [
            { name: 'New Lead', url: '/app.html#leads?action=new', icon: '👥' },
            { name: 'Today Tasks', url: '/app.html#tasks?filter=today', icon: '✅' },
            { name: 'Revenue', url: '/app.html#reports?type=revenue', icon: '💰' },
            { name: 'WhatsApp', url: '/app.html#whatsapp', icon: '💬' },
        ],
        shareTarget: { enabled: true, acceptTypes: ['text/*', 'image/*', 'application/pdf'] },
    };

    const integrations = {
        razorpay: { enabled: false, keyId: '', currency: 'INR' },
        stripe: { enabled: false, publishableKey: '', currency: 'USD' },
        googleCalendar: { enabled: false, clientId: '', scopes: ['https://www.googleapis.com/auth/calendar'] },
        msg91: { enabled: false, senderId: '11AVTR', route: 4, country: 91 },
        sendgrid: { enabled: false, fromEmail: 'noreply@11avatardigitalhub.cloud', fromName: '11 Avatar CRM' },
        tally: { enabled: false, syncDirection: 'bidirectional', syncInterval: 15 },
        webhooks: { maxPerTenant: 20, retryAttempts: 3, retryDelay: 5000, timeout: 10000 },
    };

    const errorCodes = {
        AUTH_INVALID_CREDENTIALS: { code: 1001, message: 'Invalid email or password.' },
        AUTH_EMAIL_NOT_VERIFIED: { code: 1002, message: 'Please verify your email address first.' },
        AUTH_TOKEN_EXPIRED: { code: 1003, message: 'Session expired. Please login again.' },
        AUTH_INSUFFICIENT_PERMISSIONS: { code: 1004, message: 'You do not have permission to perform this action.' },
        AUTH_REGISTRATION_PENDING: { code: 1005, message: 'Your registration is pending approval.' },
        AUTH_TENANT_SUSPENDED: { code: 1006, message: 'Your organization account has been suspended.' },
        DATA_NOT_FOUND: { code: 2001, message: 'The requested record was not found.' },
        DATA_VALIDATION_FAILED: { code: 2002, message: 'Please check the entered data and try again.' },
        DATA_DUPLICATE: { code: 2003, message: 'A record with this information already exists.' },
        DATA_QUOTA_EXCEEDED: { code: 2004, message: 'You have reached your plan limit. Please upgrade to continue.' },
        NETWORK_OFFLINE: { code: 3001, message: 'You are offline. Changes will sync when connection is restored.' },
        NETWORK_TIMEOUT: { code: 3002, message: 'Request timed out.' },
        NETWORK_SERVER_ERROR: { code: 3003, message: 'Server error. Our team has been notified.' },
        FILE_TOO_LARGE: { code: 4001, message: 'File size exceeds the allowed limit.' },
        FILE_INVALID_TYPE: { code: 4002, message: 'This file type is not supported.' },
        FILE_UPLOAD_FAILED: { code: 4003, message: 'File upload failed. Please try again.' },
        PAYMENT_FAILED: { code: 5001, message: 'Payment processing failed. Please try again.' },
        PAYMENT_AMOUNT_MISMATCH: { code: 5002, message: 'Payment amount does not match invoice amount.' },
        UNKNOWN_ERROR: { code: 9999, message: 'Something went wrong. Please try again.' },
    };

    const logging = { levels: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, FATAL: 4 }, currentLevel: IS_DEV ? 0 : 2, maxLogSize: 1000 };

    return {
        ENV, IS_DEV, IS_STAGING, IS_PROD,
        firebase, api, app, features, modules, business, tenants, roles, ui, pwa, integrations, errorCodes, logging,
        getModuleConfig: function(moduleName) { try { return this.modules[moduleName] || null; } catch (e) { return null; } },
        isFeatureEnabled: function(featureName) { try { return this.features[featureName] === true; } catch (e) { return false; } },
        getError: function(code) { try { return Object.values(this.errorCodes).find(e => e.code === code) || this.errorCodes.UNKNOWN_ERROR; } catch (e) { return this.errorCodes.UNKNOWN_ERROR; } },
        getRole: function(roleName) { try { return this.roles[roleName] || null; } catch (e) { return null; } },
        getPlan: function(planName) { try { return this.tenants.plans[planName] || this.tenants.plans.free; } catch (e) { return this.tenants.plans.free; } },
        isEnvironment: function(expectedEnv) { return this.ENV === expectedEnv; },
    };
})();

window.CRM_Config = CRM_Config;
if (typeof module !== 'undefined' && module.exports) module.exports = CRM_Config;
console.log('[CRM_Config] v' + CRM_Config.app.version + ' | ' + CRM_Config.ENV + ' | ' + CRM_Config.firebase.projectId);
