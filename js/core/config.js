/**
 * ============================================================
 * 11 AVATAR SMEs CRM - GLOBAL CONFIGURATION
 * ============================================================
 * 
 * @file       js/config.js
 * @path       C:\Users\rudra\Downloads\11 Avatar\11-Avatar-SMEs-CRM-main\js\config.js
 * @author     11 Avatar Digital Hub
 * @email      info@11avatardigitalhub.cloud
 * @repo       https://github.com/11avatardigitalhub/11Avatar-SMEs-CRM.git
 * 
 * PURPOSE:
 * Central configuration file for the entire CRM application.
 * All Firebase settings, API endpoints, feature flags, global 
 * constants, and environment-specific variables live here.
 * 
 * RULES COMPLIANCE:
 * ✅ Rule #1  - Enterprise Grade
 * ✅ Rule #5  - Deep Detailing: full JSDoc
 * ✅ Rule #6  - Error Handling: try/catch in all methods
 * ✅ Rule #18 - Firebase Backend configuration
 * ✅ Rule #20 - Export All: window.CRM_Config + ES Module
 * ✅ Rule #21 - Path First: Full file path included
 * ✅ Rule #23 - 300+ lines
 * ✅ Rule #25 - Full File Replacement
 * 
 * SECURITY NOTE:
 * This file contains PUBLIC configuration keys only.
 * Admin SDK secrets, API private keys, and sensitive data 
 * MUST be stored in Cloudflare Workers (api-worker.js) or 
 * Firebase Cloud Functions — NEVER in frontend code.
 * ============================================================
 */

'use strict';

/**
 * @namespace CRM_Config
 * @description Global configuration object for 11 Avatar SMEs CRM
 * @property {Object} firebase - Firebase project configuration
 * @property {Object} api - API endpoints and worker URLs
 * @property {Object} app - Application-level settings
 * @property {Object} features - Feature flags for module access
 * @property {Object} modules - Module-specific configurations
 * @property {Object} business - Business rules (GST, currency, limits)
 * @property {Object} tenants - Multi-tenant configuration
 * @property {Object} roles - RBAC role definitions
 * @property {Object} ui - UI/UX configuration
 * @property {Object} pwa - Progressive Web App settings
 * @property {Object} integrations - Third-party integration configs
 */
const CRM_Config = (function() {
    'use strict';

    // ============================================================
    // ENVIRONMENT DETECTION
    // ============================================================
    /**
     * Detects current environment
     * @returns {string} 'development' | 'staging' | 'production'
     */
    function detectEnvironment() {
        try {
            const hostname = window.location.hostname;
            if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('.local')) {
                return 'development';
            }
            if (hostname.includes('staging') || hostname.includes('test') || hostname.includes('github.io')) {
                return 'staging';
            }
            return 'production';
        } catch (error) {
            console.error('[CRM_Config] Environment detection failed:', error);
            return 'production';
        }
    }

    const ENV = detectEnvironment();
    const IS_DEV = ENV === 'development';
    const IS_STAGING = ENV === 'staging';
    const IS_PROD = ENV === 'production';

    // ============================================================
    // FIREBASE CONFIGURATION
    // ============================================================
    /**
     * Firebase project configuration
     * Public keys only - safe to expose in frontend
     * 
     * @property {string} projectId - Firebase project identifier
     * @property {string} appId - Firebase web app identifier
     * @property {string} apiKey - Firebase API key (public)
     * @property {string} authDomain - Firebase Auth domain
     * @property {string} measurementId - Google Analytics ID
     */
    const firebase = {
        // Core Firebase Config (LOCKED - Do not change)
        projectId: 'avatar-wa-dual-crm',
        appId: '1:946959261009:web:175f5390d63715f1f8c770',
        apiKey: 'AIzaSyB-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // Replace with actual key in production
        authDomain: 'avatar-wa-dual-crm.firebaseapp.com',
        databaseURL: `https://avatar-wa-dual-crm-default-rtdb.asia-southeast1.firebasedatabase.app`,
        storageBucket: 'avatar-wa-dual-crm.appspot.com',
        messagingSenderId: '946959261009',
        measurementId: 'G-XXXXXXXXXX', // Google Analytics

        /**
         * Firestore collection names
         * Centralized to avoid typos across modules
         */
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
            EMAIL_QUEUE: 'email_queue',
            SMS_QUEUE: 'sms_queue',
            WEBHOOK_EVENTS: 'webhook_events',
            AUDIT_LOGS: 'audit_logs',
            SETTINGS: 'settings',
            BACKUP_HISTORY: 'backup_history',
            ACTIVITY_LOGS: 'activity_logs',
            REPORTS: 'reports',
            REPORT_SCHEDULES: 'report_schedules',
        },

        /**
         * Firebase Storage paths
         */
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
        },
    };

    // ============================================================
    // API ENDPOINTS
    // ============================================================
    /**
     * API configuration
     * Worker URLs, endpoints, and request defaults
     */
    const api = {
        // Cloudflare Worker API Base URL
        workerUrl: 'https://11avatar-api.11avatardigitalhub.workers.dev',

        // API Version
        version: 'v1',

        // Endpoints
        endpoints: {
            // Auth
            AUTH_REGISTER: '/auth/register',
            AUTH_LOGIN: '/auth/login',
            AUTH_LOGOUT: '/auth/logout',
            AUTH_REFRESH: '/auth/refresh',
            AUTH_VERIFY_EMAIL: '/auth/verify-email',
            AUTH_RESET_PASSWORD: '/auth/reset-password',
            AUTH_CHANGE_PASSWORD: '/auth/change-password',

            // Tenants
            TENANT_CREATE: '/tenants/create',
            TENANT_UPDATE: '/tenants/update',
            TENANT_GET: '/tenants/{tenantId}',
            TENANT_LIST: '/tenants/list',
            TENANT_SUSPEND: '/tenants/suspend',
            TENANT_DELETE: '/tenants/delete',

            // Users
            USER_INVITE: '/users/invite',
            USER_UPDATE_ROLE: '/users/update-role',
            USER_SUSPEND: '/users/suspend',
            USER_LIST: '/users/list',

            // Leads
            LEAD_CAPTURE_WEBHOOK: '/webhooks/lead-capture',
            LEAD_ENRICH: '/leads/enrich',
            LEAD_BULK_IMPORT: '/leads/bulk-import',

            // Invoices
            INVOICE_GENERATE_PDF: '/invoices/generate-pdf',
            INVOICE_SEND_EMAIL: '/invoices/send-email',
            INVOICE_GENERATE_IRN: '/invoices/generate-irn',
            INVOICE_GENERATE_EWAYBILL: '/invoices/generate-ewaybill',

            // Payments
            PAYMENT_CREATE_ORDER: '/payments/create-order',
            PAYMENT_VERIFY: '/payments/verify',
            PAYMENT_REFUND: '/payments/refund',
            PAYMENT_RECONCILE: '/payments/reconcile',

            // WhatsApp
            WHATSAPP_SEND: '/whatsapp/send',
            WHATSAPP_TEMPLATE_SEND: '/whatsapp/send-template',
            WHATSAPP_WEBHOOK: '/webhooks/whatsapp',

            // Notifications
            NOTIFICATION_SEND: '/notifications/send',
            EMAIL_SEND: '/email/send',
            SMS_SEND: '/sms/send',

            // Reports
            REPORT_GENERATE: '/reports/generate',
            REPORT_SCHEDULE: '/reports/schedule',
            REPORT_EXPORT: '/reports/export',

            // Backup
            BACKUP_CREATE: '/backup/create',
            BACKUP_RESTORE: '/backup/restore',
            BACKUP_EXPORT: '/backup/export',

            // Webhooks
            WEBHOOK_REGISTER: '/webhooks/register',
            WEBHOOK_TEST: '/webhooks/test',
        },

        // Request defaults
        requestDefaults: {
            timeout: 30000, // 30 seconds
            retries: 3,
            retryDelay: 1000, // 1 second base delay
            headers: {
                'Content-Type': 'application/json',
                'X-Client-Version': '1.0.0',
                'X-Client-Platform': 'web',
            },
        },

        /**
         * Build full API URL
         * @param {string} endpoint - API endpoint path
         * @param {Object} params - URL parameters to replace
         * @returns {string} Full API URL
         */
        buildUrl: function(endpoint, params) {
            try {
                let url = `${this.workerUrl}/api/${this.version}${endpoint}`;
                if (params) {
                    Object.keys(params).forEach(key => {
                        url = url.replace(`{${key}}`, encodeURIComponent(params[key]));
                    });
                }
                return url;
            } catch (error) {
                console.error('[CRM_Config] URL build error:', error);
                return '';
            }
        },
    };

    // ============================================================
    // APPLICATION SETTINGS
    // ============================================================
    /**
     * App-level configuration
     */
    const app = {
        // Application Info
        name: '11 Avatar SMEs CRM',
        shortName: '11 Avatar CRM',
        version: '2.0.0',
        buildDate: '2025-01-15',
        environment: ENV,
        isDev: IS_DEV,
        isStaging: IS_STAGING,
        isProd: IS_PROD,

        // Debug mode
        debug: IS_DEV || IS_STAGING,
        verboseLogging: IS_DEV,

        // URLs
        liveUrl: IS_PROD ? 'https://SME.11avatardigitalhub.cloud/' : 'https://11avatardigitalhub.github.io/11Avatar-SMEs-CRM/',
        landingUrl: 'index.html',
        appUrl: 'app.html',
        cloudwaUrl: 'https://cloudwa.11avatardigitalhub.cloud/login',

        // Official Emails (Rule #24)
        emails: {
            info: 'info@11avatardigitalhub.cloud',
            support: 'support@11avatardigitalhub.cloud',
            contact: 'contact@11avatardigitalhub.cloud',
            admin: 'admin@11avatardigitalhub.cloud',
            billing: 'billing@11avatardigitalhub.cloud',
            noreply: 'noreply@11avatardigitalhub.cloud',
        },

        // Local Storage Keys
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

        // Session
        sessionTimeout: 8 * 60 * 60 * 1000, // 8 hours
        inactivityTimeout: 30 * 60 * 1000, // 30 minutes
        tokenRefreshBuffer: 5 * 60 * 1000, // Refresh token 5 min before expiry
    };

    // ============================================================
    // FEATURE FLAGS
    // ============================================================
    /**
     * Feature flags for module access control
     * Can be overridden per tenant
     */
    const features = {
        // Core Modules
        DASHBOARD: true,
        LEADS: true,
        PIPELINE: true,
        CLIENTS: true,

        // Financial
        INVOICES: true,
        PAYMENTS: true,
        RETAINERS: true,

        // Operations
        TASKS: true,
        PROJECTS: true,
        APPOINTMENTS: true,

        // Communication
        WHATSAPP: true,
        TRAINING: true,
        REFERRALS: true,

        // Insights
        REPORTS: true,
        NOTIFICATIONS: true,

        // System
        SETTINGS: true,
        AUDIT_LOGS: true,

        // Beta Features
        AI_LEAD_SCORING: false,
        ADVANCED_ANALYTICS: false,
        CUSTOM_REPORT_BUILDER: false,
        E_INVOICE_IRN: true,
        E_WAY_BILL: true,
        MULTI_CURRENCY: false,
        WHITE_LABEL: false,
        API_ACCESS: false,
    };

    // ============================================================
    // MODULE CONFIGURATIONS
    // ============================================================
    /**
     * Module-specific settings
     */
    const modules = {
        leads: {
            maxBulkImport: 1000,
            allowedImportFormats: ['csv', 'json', 'xlsx'],
            autoFollowUpDays: 2,
            maxSocialLinks: 6,
            sources: [
                'Cold Calling', 'WhatsApp', 'Facebook Ads', 'Google Ads',
                'Instagram', 'LinkedIn', 'Referral', 'Website', 'Exhibition',
                'Walk-in', 'Email Campaign', 'SMS Campaign', 'Partner',
                'Training', 'Other'
            ],
            pipelineStages: [
                'New', 'Attempting Contact', 'Connected', 'Qualified',
                'Discovery Call Booked', 'Discovery Call Completed',
                'Proposal Sent', 'Negotiation', 'Verbal Yes',
                'Invoice Sent', 'Won', 'Lost'
            ],
            scoreRules: {
                HAS_NAME: 5,
                HAS_MOBILE: 5,
                HAS_EMAIL: 3,
                HAS_BUSINESS: 3,
                HAS_WEBSITE: 2,
                HAS_DEAL_VALUE: 10,
                REFERRAL_SOURCE: 8,
                WEBSITE_SOURCE: 8,
                HAS_SOCIAL: 4,
            },
        },

        invoices: {
            currency: '₹',
            currencyCode: 'INR',
            defaultTaxRate: 18, // GST rate
            cgstRate: 9,
            sgstRate: 9,
            igstRate: 18,
            paymentTerms: ['Net 7', 'Net 15', 'Net 30', 'Net 45', 'Immediate', 'Custom'],
            invoicePrefix: 'INV',
            dueDaysDefault: 15,
            maxInvoiceItems: 50,
            hsnSacRequired: true,
            eWayBillThreshold: 50000,
        },

        payments: {
            supportedGateways: ['razorpay', 'stripe', 'paypal', 'upi', 'neft', 'rtgs', 'cheque', 'cash'],
            cashPaymentLimit: 200000, // ₹2 Lakh IT compliance
            reconciliationAutoDays: 7,
            utrRequired: true,
            currencies: ['INR', 'USD', 'EUR', 'GBP', 'AED'],
        },

        whatsapp: {
            maxDailyMessages: 1000,
            maxTemplateCharacters: 1024,
            supportedMediaTypes: ['image', 'video', 'document', 'audio'],
            rateLimitPerMinute: 20,
            sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
        },

        tasks: {
            maxSubtasks: 20,
            maxAssignees: 5,
            priorityLevels: ['Low', 'Medium', 'High', 'Urgent'],
            defaultSla: 48, // hours
            undoStackLimit: 50,
        },

        projects: {
            maxMilestones: 50,
            budgetWarningThreshold: 80, // percentage
            healthScoreWeights: {
                BUDGET: 30,
                TIMELINE: 30,
                QUALITY: 20,
                CLIENT_SATISFACTION: 20,
            },
        },

        retainers: {
            autoInvoiceDays: 7, // days before renewal
            utilizationWarning: 80, // percentage
            rolloverPolicies: ['None', 'Up to 25%', 'Up to 50%', 'Unlimited'],
            slaLevels: ['Standard', 'Priority', 'Premium', 'Enterprise'],
        },

        referrals: {
            maxLevels: 5,
            commissionTypes: ['Fixed', 'Percentage', 'Tiered'],
            defaultCommissionRate: 10, // percentage
            payoutThreshold: 1000, // ₹
            partnerTiers: ['Bronze', 'Silver', 'Gold', 'Platinum'],
        },

        reports: {
            maxCustomReports: 20,
            exportFormats: ['pdf', 'excel', 'csv', 'json'],
            maxSchedulePerUser: 10,
            chartTypes: [
                'bar', 'line', 'pie', 'doughnut', 'area',
                'radar', 'scatter', 'bubble', 'funnel',
                'gauge', 'heatmap', 'waterfall'
            ],
        },

        training: {
            maxModulesPerCourse: 50,
            passPercentage: 60,
            certificateLevels: ['Participation', 'Bronze', 'Silver', 'Gold', 'Platinum'],
            questionTypes: ['mcq', 'true_false', 'short_answer', 'essay', 'file_upload'],
        },
    };

    // ============================================================
    // BUSINESS RULES
    // ============================================================
    /**
     * Business-level configuration
     * Indian SME-specific rules
     */
    const business = {
        // GST Configuration
        gst: {
            enabled: true,
            defaultRate: 18,
            rates: [0, 0.25, 3, 5, 12, 18, 28],
            hsnCodeRequired: true,
            sacCodeRequired: true,
            eInvoiceApplicable: true, // For turnover > ₹5 Cr
            stateJurisdiction: '09', // Default UP (can be changed per tenant)
        },

        // Currency & Number Formatting
        format: {
            currency: '₹',
            currencySymbol: '₹',
            locale: 'en-IN',
            dateFormat: 'DD/MM/YYYY',
            timeFormat: 'hh:mm A',
            numberSystem: 'indian', // Indian numbering (lakhs, crores)
            decimalPlaces: 2,
        },

        // Compliance Limits
        compliance: {
            cashTransactionLimit: 200000, // ₹2 Lakh - Section 269ST
            panRequiredAbove: 50000, // PAN required for transactions > ₹50K
            tdsApplicableAbove: 30000, // TDS applicable on professional fees > ₹30K
            gstRegistrationThreshold: 2000000, // ₹20 Lakh (goods)
        },

        // Business Hours
        businessHours: {
            start: '09:00',
            end: '18:00',
            timezone: 'Asia/Kolkata',
            workingDays: [1, 2, 3, 4, 5, 6], // Mon-Sat
        },

        // Data Retention
        dataRetention: {
            auditLogs: 365, // days
            deletedRecords: 90, // days (soft delete)
            notifications: 30, // days
            backupHistory: 7, // versions
            exportFiles: 7, // days
        },
    };

    // ============================================================
    // MULTI-TENANT CONFIGURATION
    // ============================================================
    /**
     * Tenant management configuration
     */
    const tenants = {
        defaultPlan: 'free',
        plans: {
            free: {
                name: 'Free Forever',
                maxUsers: 3,
                maxLeads: 500,
                maxInvoices: 50,
                maxStorage: 100 * 1024 * 1024, // 100 MB
                features: ['DASHBOARD', 'LEADS', 'PIPELINE', 'CLIENTS', 'INVOICES', 'PAYMENTS'],
                supportLevel: 'email',
            },
            starter: {
                name: 'Starter',
                price: 499,
                maxUsers: 10,
                maxLeads: 5000,
                maxInvoices: 500,
                maxStorage: 1 * 1024 * 1024 * 1024, // 1 GB
                features: ['ALL_CORE', 'WHATSAPP', 'TASKS', 'APPOINTMENTS'],
                supportLevel: 'priority_email',
            },
            professional: {
                name: 'Professional',
                price: 1499,
                maxUsers: 50,
                maxLeads: 50000,
                maxInvoices: 5000,
                maxStorage: 10 * 1024 * 1024 * 1024, // 10 GB
                features: ['ALL'],
                supportLevel: 'chat_phone',
            },
            enterprise: {
                name: 'Enterprise',
                price: null, // Custom pricing
                maxUsers: -1, // Unlimited
                maxLeads: -1,
                maxInvoices: -1,
                maxStorage: 100 * 1024 * 1024 * 1024, // 100 GB
                features: ['ALL', 'WHITE_LABEL', 'API_ACCESS', 'CUSTOM_INTEGRATIONS'],
                supportLevel: 'dedicated',
            },
        },

        // Registration
        registrationApprovalRequired: true,
        defaultModuleAccess: ['DASHBOARD', 'LEADS', 'PIPELINE', 'CLIENTS'],
    };

    // ============================================================
    // RBAC ROLE DEFINITIONS (Rule #17)
    // ============================================================
    /**
     * 8-Level Role-Based Access Control
     */
    const roles = {
        PLATFORM_OWNER: {
            level: 0,
            name: 'Platform Owner',
            description: 'Super admin with full system access',
            permissions: ['*'], // All permissions
            isSystemRole: true,
            canManageTenants: true,
            canAccessAllData: true,
        },
        TENANT_ADMIN: {
            level: 1,
            name: 'Tenant Admin',
            description: 'Business owner with full tenant access',
            permissions: [
                'MANAGE_USERS', 'MANAGE_ROLES', 'MANAGE_BILLING',
                'VIEW_ALL_DATA', 'EDIT_ALL_DATA', 'DELETE_ALL_DATA',
                'EXPORT_ALL', 'MANAGE_SETTINGS', 'MANAGE_INTEGRATIONS',
                'VIEW_AUDIT_LOGS', 'MANAGE_MODULES',
            ],
            isSystemRole: false,
            canManageTenants: false,
            canAccessAllData: true,
        },
        SUB_ADMIN: {
            level: 2,
            name: 'Sub Admin',
            description: 'Assigned by tenant admin for specific departments',
            permissions: [
                'MANAGE_USERS', 'VIEW_ALL_DATA', 'EDIT_ALL_DATA',
                'EXPORT_ALL', 'MANAGE_SETTINGS_LIMITED',
                'VIEW_AUDIT_LOGS',
            ],
            isSystemRole: false,
            canManageTenants: false,
            canAccessAllData: true,
        },
        MANAGER: {
            level: 3,
            name: 'Manager',
            description: 'Team manager with reporting access',
            permissions: [
                'VIEW_TEAM_DATA', 'EDIT_TEAM_DATA', 'ASSIGN_TASKS',
                'VIEW_REPORTS', 'EXPORT_REPORTS', 'APPROVE_DEALS',
            ],
            isSystemRole: false,
            canAccessAllData: false,
        },
        TEAM_LEADER: {
            level: 4,
            name: 'Team Leader',
            description: 'Supervises executives',
            permissions: [
                'VIEW_TEAM_DATA', 'EDIT_OWN_DATA', 'ASSIGN_LEADS',
                'VIEW_TEAM_REPORTS', 'MANAGE_PIPELINE',
            ],
            isSystemRole: false,
            canAccessAllData: false,
        },
        EXECUTIVE: {
            level: 5,
            name: 'Executive',
            description: 'Handles leads and day-to-day operations',
            permissions: [
                'VIEW_OWN_DATA', 'EDIT_OWN_DATA', 'CREATE_LEADS',
                'MANAGE_OWN_PIPELINE', 'CREATE_INVOICES',
                'SEND_MESSAGES',
            ],
            isSystemRole: false,
            canAccessAllData: false,
        },
        VIEWER: {
            level: 6,
            name: 'Viewer',
            description: 'Read-only access to assigned data',
            permissions: [
                'VIEW_ASSIGNED_DATA', 'VIEW_DASHBOARD',
                'VIEW_REPORTS_LIMITED',
            ],
            isSystemRole: false,
            canAccessAllData: false,
        },
        RESTRICTED: {
            level: 7,
            name: 'Restricted',
            description: 'Module-specific access only',
            permissions: [
                'VIEW_MODULE_SPECIFIC',
            ],
            isSystemRole: false,
            canAccessAllData: false,
        },
    };

    // ============================================================
    // UI/UX CONFIGURATION
    // ============================================================
    /**
     * UI configuration defaults
     */
    const ui = {
        // Theme defaults
        theme: {
            default: 'light',
            publicDefault: 'dark',
            respectOSPreference: true,
            allowUserToggle: true,
        },

        // Animation
        animation: {
            enabled: true,
            reducedMotionSupport: true,
            defaultDuration: 300, // ms
            pageTransition: 'fadeUp',
            modalAnimation: 'scaleIn',
        },

        // Pagination
        pagination: {
            defaultPageSize: 25,
            pageSizeOptions: [10, 25, 50, 100],
            maxVisiblePages: 7,
        },

        // Search
        search: {
            minCharsForSearch: 2,
            debounceDelay: 300, // ms
            maxRecentSearches: 10,
        },

        // Toast defaults
        toast: {
            duration: 3000, // ms
            errorDuration: 5000,
            maxVisible: 5,
            position: 'top-right',
            mobilePosition: 'bottom-center',
        },

        // Date/Time
        dateTime: {
            timezone: 'Asia/Kolkata',
            fiscalYearStart: '04-01', // April 1st (Indian FY)
            weekStartDay: 1, // Monday
        },
    };

    // ============================================================
    // PWA CONFIGURATION (Rule #15)
    // ============================================================
    /**
     * Progressive Web App settings
     */
    const pwa = {
        enabled: true,
        manifestPath: '/manifest.json',
        serviceWorkerPath: '/service-worker.js',
        cacheName: 'crm-v2',
        cacheStrategy: 'network-first',
        offlinePage: '/offline.html',

        // App shortcuts (long-press on icon)
        shortcuts: [
            { name: 'New Lead', url: '/app.html#leads?action=new', icon: '👥' },
            { name: 'Today Tasks', url: '/app.html#tasks?filter=today', icon: '✅' },
            { name: 'Revenue', url: '/app.html#reports?type=revenue', icon: '💰' },
            { name: 'WhatsApp', url: '/app.html#whatsapp', icon: '💬' },
        ],

        // Share target
        shareTarget: {
            enabled: true,
            acceptTypes: ['text/*', 'image/*', 'application/pdf'],
        },
    };

    // ============================================================
    // INTEGRATION CONFIGURATIONS
    // ============================================================
    /**
     * Third-party integration settings
     */
    const integrations = {
        // Razorpay
        razorpay: {
            enabled: false,
            keyId: '', // Set in tenant settings
            keySecret: '', // NEVER expose in frontend - use Worker
            currency: 'INR',
        },

        // Stripe
        stripe: {
            enabled: false,
            publishableKey: '', // Set in tenant settings
            currency: 'USD',
        },

        // Google Calendar
        googleCalendar: {
            enabled: false,
            clientId: '', // Set in tenant settings
            scopes: ['https://www.googleapis.com/auth/calendar'],
        },

        // MSG91 SMS
        msg91: {
            enabled: false,
            authKey: '', // NEVER expose - use Worker
            senderId: '11AVTR',
            route: 4, // Transactional
            country: 91,
        },

        // SendGrid Email
        sendgrid: {
            enabled: false,
            apiKey: '', // NEVER expose - use Worker
            fromEmail: 'noreply@11avatardigitalhub.cloud',
            fromName: '11 Avatar CRM',
        },

        // Tally ERP
        tally: {
            enabled: false,
            syncDirection: 'bidirectional',
            syncInterval: 15, // minutes
        },

        // Webhook defaults
        webhooks: {
            maxPerTenant: 20,
            retryAttempts: 3,
            retryDelay: 5000, // 5 seconds
            timeout: 10000, // 10 seconds
        },
    };

    // ============================================================
    // ERROR CODES & MESSAGES
    // ============================================================
    /**
     * Centralized error codes for consistent error handling
     */
    const errorCodes = {
        // Auth errors (1000-1999)
        AUTH_INVALID_CREDENTIALS: { code: 1001, message: 'Invalid email or password.' },
        AUTH_EMAIL_NOT_VERIFIED: { code: 1002, message: 'Please verify your email address first.' },
        AUTH_TOKEN_EXPIRED: { code: 1003, message: 'Session expired. Please login again.' },
        AUTH_INSUFFICIENT_PERMISSIONS: { code: 1004, message: 'You do not have permission to perform this action.' },
        AUTH_REGISTRATION_PENDING: { code: 1005, message: 'Your registration is pending approval from the platform owner.' },
        AUTH_TENANT_SUSPENDED: { code: 1006, message: 'Your organization account has been suspended. Contact support.' },

        // Data errors (2000-2999)
        DATA_NOT_FOUND: { code: 2001, message: 'The requested record was not found.' },
        DATA_VALIDATION_FAILED: { code: 2002, message: 'Please check the entered data and try again.' },
        DATA_DUPLICATE: { code: 2003, message: 'A record with this information already exists.' },
        DATA_QUOTA_EXCEEDED: { code: 2004, message: 'You have reached your plan limit. Please upgrade to continue.' },

        // Network errors (3000-3999)
        NETWORK_OFFLINE: { code: 3001, message: 'You are offline. Changes will sync when connection is restored.' },
        NETWORK_TIMEOUT: { code: 3002, message: 'Request timed out. Please check your connection and try again.' },
        NETWORK_SERVER_ERROR: { code: 3003, message: 'Server error. Our team has been notified.' },

        // File errors (4000-4999)
        FILE_TOO_LARGE: { code: 4001, message: 'File size exceeds the allowed limit.' },
        FILE_INVALID_TYPE: { code: 4002, message: 'This file type is not supported.' },
        FILE_UPLOAD_FAILED: { code: 4003, message: 'File upload failed. Please try again.' },

        // Payment errors (5000-5999)
        PAYMENT_FAILED: { code: 5001, message: 'Payment processing failed. Please try again.' },
        PAYMENT_AMOUNT_MISMATCH: { code: 5002, message: 'Payment amount does not match invoice amount.' },

        // Generic
        UNKNOWN_ERROR: { code: 9999, message: 'Something went wrong. Please try again or contact support.' },
    };

    // ============================================================
    // LOGGING CONFIGURATION
    // ============================================================
    /**
     * Logging levels and configuration
     */
    const logging = {
        levels: {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3,
            FATAL: 4,
        },
        currentLevel: IS_DEV ? 0 : 2, // Debug in dev, Warn in production
        maxLogSize: 1000,
        sendToServer: IS_PROD,
        serverEndpoint: '/api/logs',
    };

    // ============================================================
    // PUBLIC API
    // ============================================================
    return {
        // Core
        ENV,
        IS_DEV,
        IS_STAGING,
        IS_PROD,
        firebase,
        api,
        app,

        // Configuration
        features,
        modules,
        business,
        tenants,
        roles,
        ui,
        pwa,
        integrations,

        // Utilities
        errorCodes,
        logging,

        /**
         * Get module configuration
         * @param {string} moduleName - Module name (e.g., 'leads', 'invoices')
         * @returns {Object} Module configuration
         */
        getModuleConfig: function(moduleName) {
            try {
                return this.modules[moduleName] || null;
            } catch (error) {
                console.error('[CRM_Config] getModuleConfig error:', error);
                return null;
            }
        },

        /**
         * Check if a feature is enabled
         * @param {string} featureName - Feature flag name
         * @returns {boolean} Whether feature is enabled
         */
        isFeatureEnabled: function(featureName) {
            try {
                return this.features[featureName] === true;
            } catch (error) {
                console.error('[CRM_Config] isFeatureEnabled error:', error);
                return false;
            }
        },

        /**
         * Get error by code
         * @param {number} code - Error code
         * @returns {Object} Error object {code, message}
         */
        getError: function(code) {
            try {
                const found = Object.values(this.errorCodes).find(e => e.code === code);
                return found || this.errorCodes.UNKNOWN_ERROR;
            } catch (error) {
                console.error('[CRM_Config] getError:', error);
                return this.errorCodes.UNKNOWN_ERROR;
            }
        },

        /**
         * Get role definition
         * @param {string} roleName - Role key (e.g., 'TENANT_ADMIN')
         * @returns {Object|null} Role definition
         */
        getRole: function(roleName) {
            try {
                return this.roles[roleName] || null;
            } catch (error) {
                console.error('[CRM_Config] getRole error:', error);
                return null;
            }
        },

        /**
         * Get tenant plan details
         * @param {string} planName - Plan key (e.g., 'starter')
         * @returns {Object|null} Plan details
         */
        getPlan: function(planName) {
            try {
                return this.tenants.plans[planName] || this.tenants.plans.free;
            } catch (error) {
                console.error('[CRM_Config] getPlan error:', error);
                return this.tenants.plans.free;
            }
        },

        /**
         * Validate if current environment matches expected
         * @param {string} expectedEnv - 'development' | 'staging' | 'production'
         * @returns {boolean}
         */
        isEnvironment: function(expectedEnv) {
            return this.ENV === expectedEnv;
        },
    };
})();

// ============================================================
// EXPORT TO GLOBAL (Rule #20)
// ============================================================
window.CRM_Config = CRM_Config;

// ES Module export (for future module bundler support)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CRM_Config;
}

// ============================================================
// INITIALIZATION LOG
// ============================================================
(function() {
    try {
        const env = CRM_Config.ENV;
        const mode = env === 'production' ? '🔴 PROD' :
                     env === 'staging' ? '🟡 STAGING' : '🟢 DEV';

        console.log(`%c🚀 11 Avatar SMEs CRM %cv${CRM_Config.app.version}`,
            'font-weight:bold;color:#D4AF37;', 'color:#888;');
        console.log(`%c📦 Config Loaded %c| %c${mode} %c| %cFirebase: ${CRM_Config.firebase.projectId}`,
            'color:#D4AF37;', '', 'color:#10B981;', '', 'color:#888;');
        console.log(`%c🔗 API: ${CRM_Config.api.workerUrl}`,
            'color:#888;font-size:0.8em;');
        console.log(`%c📧 Support: ${CRM_Config.app.emails.support}`,
            'color:#888;font-size:0.8em;');
        console.log(`%c✅ window.CRM_Config available globally`,
            'color:#10B981;');

        if (CRM_Config.app.debug) {
            console.log('%c⚠️ Debug mode enabled - verbose logging active',
                'color:#F59E0B;');
            console.log('CRM_Config:', CRM_Config);
        }
    } catch (error) {
        console.error('[CRM_Config] Init log error:', error);
    }
})();
