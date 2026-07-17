/**
 * ============================================================
 * 11 AVATAR SMEs CRM - MULTI-TENANT MODULE
 * ============================================================
 * 
 * @file       js/tenant.js
 * @path       C:\Users\rudra\Downloads\11 Avatar\11-Avatar-SMEs-CRM-main\js\tenant.js
 * @author     11 Avatar Digital Hub
 * @email      info@11avatardigitalhub.cloud
 * @repo       https://github.com/11avatardigitalhub/11Avatar-SMEs-CRM.git
 * 
 * PURPOSE:
 * Complete multi-tenant management system handling tenant context,
 * RBAC enforcement, module access control, cross-SaaS user sync
 * (WhatsApp CRM ↔ SMEs CRM), team hierarchy management, and
 * registration approval workflow.
 * 
 * DEPENDENCIES:
 * - js/config.js (CRM_Config)
 * - js/auth.js (CRM_Auth)
 * - js/firestore.js (CRM_Firestore) - optional, graceful fallback
 * 
 * RULES COMPLIANCE:
 * ✅ Rule #1  - Enterprise Grade
 * ✅ Rule #2  - One File At A Time
 * ✅ Rule #5  - Deep Detailing: full JSDoc
 * ✅ Rule #6  - Error Handling: try/catch everywhere
 * ✅ Rule #17 - Multi-Tenant RBAC (8 role levels)
 * ✅ Rule #18 - Firebase Backend
 * ✅ Rule #20 - Export All: window.CRM_Tenant
 * ✅ Rule #21 - Path First
 * ✅ Rule #23 - 300+ lines
 * ✅ Rule #25 - Full File Replacement
 * ============================================================
 */

'use strict';

/**
 * @namespace CRM_Tenant
 * @description Multi-Tenant management service for 11 Avatar SMEs CRM
 */
const CRM_Tenant = (function() {
    'use strict';

    // ============================================================
    // PRIVATE STATE
    // ============================================================
    /** @type {Object|null} Current tenant context */
    let _currentTenant = null;

    /** @type {Object|null} Current user's full profile with permissions */
    let _currentUserProfile = null;

    /** @type {Array<Object>} Team members cache */
    let _teamMembers = [];

    /** @type {Array<Object>} Pending registration approvals */
    let _pendingApprovals = [];

    /** @type {Object|null} Cross-SaaS sync state */
    let _crossSaasState = null;

    /** @type {Array<Function>} Tenant change listeners */
    const _tenantListeners = [];

    /** @type {boolean} Whether tenant module is initialized */
    let _initialized = false;

    /** @type {Object} Module access cache */
    const _moduleAccessCache = {};

    /** @type {Object} Permission check cache */
    const _permissionCache = {};

    // ============================================================
    // CONSTANTS
    // ============================================================
    const CACHE_TTL = 60000; // 1 minute cache TTL
    const MAX_TEAM_MEMBERS_PER_PAGE = 50;

    // Cross-SaaS configuration
    const CROSS_SAAS_CONFIG = {
        enabled: true,
        apps: {
            WHATSAPP_CRM: {
                id: 'whatsapp-crm',
                name: 'WhatsApp CRM',
                url: 'https://cloudwa.11avatardigitalhub.cloud',
                firebaseCollection: 'whatsapp_users',
                syncFields: ['displayName', 'email', 'phoneNumber', 'photoURL', 'tenantId', 'role'],
            },
            SMES_CRM: {
                id: 'smes-crm',
                name: 'SMEs CRM',
                url: 'https://SME.11avatardigitalhub.cloud',
                firebaseCollection: 'users',
                syncFields: ['displayName', 'email', 'phoneNumber', 'photoURL', 'tenantId', 'role', 'moduleAccess'],
            },
        },
        accessTypes: ['whatsapp_only', 'smes_only', 'both'],
    };

    // ============================================================
    // FIREBASE HELPERS
    // ============================================================
    /**
     * Get Firestore instance safely
     * @returns {Object|null}
     */
    function _getFirestore() {
        try {
            if (window.firebase && window.firebase.firestore) {
                return window.firebase.firestore();
            }
            return null;
        } catch (error) {
            console.error('[CRM_Tenant] Firestore not available:', error);
            return null;
        }
    }

    /**
     * Get current user UID
     * @returns {string|null}
     */
    function _getCurrentUid() {
        try {
            if (window.CRM_Auth && window.CRM_Auth.getCurrentUser) {
                const user = window.CRM_Auth.getCurrentUser();
                return user ? user.uid : null;
            }
            if (window.CRM_Auth && window.CRM_Auth.getUser) {
                const profile = window.CRM_Auth.getUser();
                return profile ? profile.uid : null;
            }
            return null;
        } catch (error) {
            console.error('[CRM_Tenant] Get UID error:', error);
            return null;
        }
    }

    // ============================================================
    // TENANT CONTEXT MANAGEMENT
    // ============================================================
    /**
     * Initialize tenant context
     * Called after successful authentication
     * @returns {Promise<Object>} Tenant context
     */
    async function initTenantContext() {
        try {
            if (!window.CRM_Auth || !window.CRM_Auth.isAuthenticated()) {
                console.warn('[CRM_Tenant] User not authenticated. Skipping tenant init.');
                return null;
            }

            const userProfile = window.CRM_Auth.getUser();
            const tenantData = window.CRM_Auth.getTenant();

            if (!userProfile) {
                console.warn('[CRM_Tenant] No user profile available.');
                return null;
            }

            _currentUserProfile = userProfile;
            _currentTenant = tenantData;

            // If user has tenantId but no tenant data, fetch it
            if (!_currentTenant && userProfile.tenantId) {
                _currentTenant = await _fetchTenantById(userProfile.tenantId);
            }

            // If user has no tenant, they might be pending approval
            if (!_currentTenant) {
                _currentTenant = await _createDefaultTenantContext(userProfile);
            }

            // Load team members
            await _loadTeamMembers();

            // Set up cross-SaaS sync if applicable
            if (CROSS_SAAS_CONFIG.enabled && userProfile.saasAccess) {
                await _setupCrossSaasSync(userProfile);
            }

            // Clear caches
            _clearCaches();

            // Notify listeners
            _notifyListeners();

            _initialized = true;

            console.log('[CRM_Tenant] Tenant context initialized.');
            console.log(`[CRM_Tenant] Tenant: ${_currentTenant?.name || 'N/A'} (${_currentTenant?.plan || 'free'})`);
            console.log(`[CRM_Tenant] Role: ${userProfile.role}, Team: ${_teamMembers.length} members`);

            return _currentTenant;
        } catch (error) {
            console.error('[CRM_Tenant] Init error:', error);
            return null;
        }
    }

    /**
     * Fetch tenant by ID from Firestore
     * @param {string} tenantId - Tenant ID
     * @returns {Promise<Object|null>}
     */
    async function _fetchTenantById(tenantId) {
        try {
            const db = _getFirestore();
            if (!db) {
                // Fallback: return cached
                const cached = localStorage.getItem(CRM_Config.app.storageKeys.TENANT_DATA);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (parsed.id === tenantId) return parsed;
                }
                return _getDefaultTenantData(tenantId);
            }

            const doc = await db.collection(CRM_Config.firebase.collections.TENANTS)
                .doc(tenantId).get();

            if (doc.exists) {
                const data = { id: doc.id, ...doc.data() };
                // Cache in localStorage
                localStorage.setItem(CRM_Config.app.storageKeys.TENANT_DATA, JSON.stringify(data));
                return data;
            }

            return _getDefaultTenantData(tenantId);
        } catch (error) {
            console.error('[CRM_Tenant] Fetch tenant error:', error);
            return _getDefaultTenantData(tenantId);
        }
    }

    /**
     * Create default tenant context for users without tenant
     * @param {Object} userProfile - User profile
     * @returns {Promise<Object>}
     */
    async function _createDefaultTenantContext(userProfile) {
        const tenantData = {
            id: userProfile.tenantId || 'pending',
            name: userProfile.companyName || 'My Business',
            plan: CRM_Config.tenants.defaultPlan,
            status: userProfile.approvalStatus || 'pending',
            createdAt: userProfile.createdAt || new Date().toISOString(),
            settings: {
                currency: '₹',
                timezone: 'Asia/Kolkata',
                language: 'en-IN',
                dateFormat: 'DD/MM/YYYY',
                gstin: '',
                pan: '',
                address: {},
            },
            moduleAccess: userProfile.moduleAccess || CRM_Config.tenants.defaultModuleAccess,
            features: {},
            quotas: {},
            branding: {
                logo: null,
                primaryColor: '#D4AF37',
            },
        };

        // Apply plan-based quotas
        const planConfig = CRM_Config.getPlan(tenantData.plan);
        if (planConfig) {
            tenantData.quotas = {
                maxUsers: planConfig.maxUsers,
                maxLeads: planConfig.maxLeads,
                maxInvoices: planConfig.maxInvoices,
                maxStorage: planConfig.maxStorage,
            };
            tenantData.features = planConfig.features.reduce((acc, f) => {
                acc[f] = true;
                return acc;
            }, {});
        }

        _currentTenant = tenantData;
        localStorage.setItem(CRM_Config.app.storageKeys.TENANT_DATA, JSON.stringify(tenantData));
        return tenantData;
    }

    /**
     * Get default tenant data for fallback
     * @param {string} tenantId
     * @returns {Object}
     */
    function _getDefaultTenantData(tenantId) {
        return {
            id: tenantId,
            name: 'Organization',
            plan: 'free',
            status: 'active',
            createdAt: new Date().toISOString(),
            settings: {
                currency: '₹',
                timezone: 'Asia/Kolkata',
                language: 'en-IN',
            },
            moduleAccess: CRM_Config.tenants.defaultModuleAccess,
            features: {},
            quotas: { maxUsers: 3, maxLeads: 500, maxInvoices: 50 },
        };
    }

    // ============================================================
    // RBAC & PERMISSIONS
    // ============================================================
    /**
     * Check if current user has specific permission
     * @param {string} permission - Permission key
     * @returns {boolean}
     */
    function hasPermission(permission) {
        try {
            // Check cache
            const cacheKey = `${_getCurrentUid()}_${permission}`;
            const cached = _permissionCache[cacheKey];
            if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
                return cached.value;
            }

            if (!_currentUserProfile) {
                // Try CRM_Auth
                if (window.CRM_Auth && window.CRM_Auth.hasPermission) {
                    const result = window.CRM_Auth.hasPermission(permission);
                    _permissionCache[cacheKey] = { value: result, timestamp: Date.now() };
                    return result;
                }
                return false;
            }

            const role = CRM_Config.getRole(_currentUserProfile.role);
            if (!role) return false;

            // Level 0 (Platform Owner) and Level 1 (Tenant Admin) have all permissions
            if (role.level <= 1) {
                _permissionCache[cacheKey] = { value: true, timestamp: Date.now() };
                return true;
            }

            // Check specific permission
            const hasPerm = role.permissions.includes(permission) || role.permissions.includes('*');
            _permissionCache[cacheKey] = { value: hasPerm, timestamp: Date.now() };
            return hasPerm;
        } catch (error) {
            console.error('[CRM_Tenant] hasPermission error:', error);
            return false;
        }
    }

    /**
     * Check if user can access a module
     * @param {string} moduleName - Module name
     * @returns {boolean}
     */
    function canAccessModule(moduleName) {
        try {
            const cacheKey = `${_getCurrentUid()}_module_${moduleName}`;
            const cached = _moduleAccessCache[cacheKey];
            if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
                return cached.value;
            }

            // Platform Owner and Tenant Admin can access everything
            if (hasMinRole('TENANT_ADMIN')) {
                _moduleAccessCache[cacheKey] = { value: true, timestamp: Date.now() };
                return true;
            }

            // Check tenant-level module access
            if (_currentTenant && _currentTenant.moduleAccess) {
                const moduleKey = moduleName.toUpperCase();
                const hasAccess = _currentTenant.moduleAccess.includes(moduleKey);
                _moduleAccessCache[cacheKey] = { value: hasAccess, timestamp: Date.now() };
                return hasAccess;
            }

            // Check user-level module access
            if (_currentUserProfile && _currentUserProfile.moduleAccess) {
                const moduleKey = moduleName.toUpperCase();
                const hasAccess = _currentUserProfile.moduleAccess.includes(moduleKey);
                _moduleAccessCache[cacheKey] = { value: hasAccess, timestamp: Date.now() };
                return hasAccess;
            }

            // Check feature flags
            const featureKey = moduleName.toUpperCase();
            if (CRM_Config.features[featureKey] !== undefined) {
                const enabled = CRM_Config.features[featureKey] === true;
                _moduleAccessCache[cacheKey] = { value: enabled, timestamp: Date.now() };
                return enabled;
            }

            return false;
        } catch (error) {
            console.error('[CRM_Tenant] canAccessModule error:', error);
            return false;
        }
    }

    /**
     * Check if user's role is at or above specified level
     * @param {string} roleName - Minimum role required
     * @returns {boolean}
     */
    function hasMinRole(roleName) {
        try {
            if (!_currentUserProfile) {
                if (window.CRM_Auth && window.CRM_Auth.hasMinRole) {
                    return window.CRM_Auth.hasMinRole(roleName);
                }
                return false;
            }

            const userRole = CRM_Config.getRole(_currentUserProfile.role);
            const requiredRole = CRM_Config.getRole(roleName);

            if (!userRole || !requiredRole) return false;
            return userRole.level <= requiredRole.level;
        } catch (error) {
            console.error('[CRM_Tenant] hasMinRole error:', error);
            return false;
        }
    }

    /**
     * Get all permissions for current user
     * @returns {Array<string>}
     */
    function getUserPermissions() {
        try {
            if (!_currentUserProfile) return [];
            const role = CRM_Config.getRole(_currentUserProfile.role);
            return role ? role.permissions : [];
        } catch (error) {
            console.error('[CRM_Tenant] getUserPermissions error:', error);
            return [];
        }
    }

    /**
     * Get accessible modules for current user
     * @returns {Array<string>}
     */
    function getAccessibleModules() {
        try {
            // Admin sees everything
            if (hasMinRole('TENANT_ADMIN')) {
                return Object.keys(CRM_Config.modules);
            }

            // Tenant-level access
            if (_currentTenant && _currentTenant.moduleAccess) {
                return _currentTenant.moduleAccess;
            }

            // User-level access
            if (_currentUserProfile && _currentUserProfile.moduleAccess) {
                return _currentUserProfile.moduleAccess;
            }

            return CRM_Config.tenants.defaultModuleAccess || [];
        } catch (error) {
            console.error('[CRM_Tenant] getAccessibleModules error:', error);
            return [];
        }
    }

    // ============================================================
    // TEAM MANAGEMENT
    // ============================================================
    /**
     * Load team members for current tenant
     * @returns {Promise<Array>}
     */
    async function _loadTeamMembers() {
        try {
            const db = _getFirestore();
            const tenantId = getTenantId();

            if (!db || !tenantId) {
                _teamMembers = [];
                return _teamMembers;
            }

            const snapshot = await db.collection(CRM_Config.firebase.collections.USERS)
                .where('tenantId', '==', tenantId)
                .where('status', '==', 'active')
                .limit(MAX_TEAM_MEMBERS_PER_PAGE)
                .get();

            _teamMembers = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            }));

            return _teamMembers;
        } catch (error) {
            console.error('[CRM_Tenant] Load team error:', error);
            _teamMembers = [];
            return _teamMembers;
        }
    }

    /**
     * Get team members
     * @param {Object} [filters] - Optional filters
     * @returns {Array<Object>}
     */
    function getTeamMembers(filters = {}) {
        try {
            let members = [..._teamMembers];

            if (filters.role) {
                members = members.filter(m => m.role === filters.role);
            }
            if (filters.status) {
                members = members.filter(m => m.status === filters.status);
            }
            if (filters.search) {
                const search = filters.search.toLowerCase();
                members = members.filter(m =>
                    (m.displayName && m.displayName.toLowerCase().includes(search)) ||
                    (m.email && m.email.toLowerCase().includes(search))
                );
            }

            return members;
        } catch (error) {
            console.error('[CRM_Tenant] getTeamMembers error:', error);
            return [];
        }
    }

    /**
     * Get team hierarchy tree
     * @returns {Object} Hierarchy tree
     */
    function getTeamHierarchy() {
        try {
            const hierarchy = {
                owner: null,
                admins: [],
                managers: [],
                teamLeaders: [],
                executives: [],
                viewers: [],
            };

            _teamMembers.forEach(member => {
                switch (member.role) {
                    case 'TENANT_ADMIN':
                        hierarchy.owner = member;
                        break;
                    case 'SUB_ADMIN':
                        hierarchy.admins.push(member);
                        break;
                    case 'MANAGER':
                        hierarchy.managers.push(member);
                        break;
                    case 'TEAM_LEADER':
                        hierarchy.teamLeaders.push(member);
                        break;
                    case 'EXECUTIVE':
                        hierarchy.executives.push(member);
                        break;
                    case 'VIEWER':
                        hierarchy.viewers.push(member);
                        break;
                }
            });

            return hierarchy;
        } catch (error) {
            console.error('[CRM_Tenant] getTeamHierarchy error:', error);
            return {};
        }
    }

    /**
     * Invite a team member (requires Tenant Admin)
     * @param {Object} inviteData - {email, role, moduleAccess}
     * @returns {Promise<Object>} Result
     */
    async function inviteTeamMember(inviteData) {
        try {
            if (!hasMinRole('TENANT_ADMIN')) {
                return { success: false, message: 'Only Tenant Admin can invite team members.', error: 'UNAUTHORIZED' };
            }

            const { email, role = 'EXECUTIVE', moduleAccess = null } = inviteData;
            if (!email) {
                return { success: false, message: 'Email is required.', error: 'VALIDATION_ERROR' };
            }

            // Check quota
            const planQuota = _currentTenant?.quotas?.maxUsers;
            if (planQuota && planQuota > 0 && _teamMembers.length >= planQuota) {
                return {
                    success: false,
                    message: `Team member limit (${planQuota}) reached. Upgrade your plan to add more.`,
                    error: 'QUOTA_EXCEEDED',
                };
            }

            const db = _getFirestore();
            if (!db) {
                return { success: false, message: 'Service temporarily unavailable.', error: 'SERVICE_UNAVAILABLE' };
            }

            const tenantId = getTenantId();
            const inviteRef = await db.collection('team_invites').add({
                email: email.toLowerCase(),
                tenantId,
                role,
                moduleAccess: moduleAccess || CRM_Config.tenants.defaultModuleAccess,
                invitedBy: _getCurrentUid(),
                invitedAt: new Date().toISOString(),
                status: 'pending',
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
            });

            // Send email via worker
            if (window.CRM_Config) {
                const workerUrl = CRM_Config.api.buildUrl('/users/invite');
                fetch(workerUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ inviteId: inviteRef.id, email, role, tenantId }),
                }).catch(err => console.warn('[CRM_Tenant] Invite email send failed:', err));
            }

            console.log('[CRM_Tenant] Team invite sent:', inviteRef.id);
            return { success: true, message: `Invitation sent to ${email}.`, inviteId: inviteRef.id };
        } catch (error) {
            console.error('[CRM_Tenant] Invite error:', error);
            return { success: false, message: 'Failed to send invitation.', error: error.code || 'UNKNOWN' };
        }
    }

    /**
     * Update team member role
     * @param {string} memberUid - Member's UID
     * @param {string} newRole - New role
     * @returns {Promise<Object>}
     */
    async function updateMemberRole(memberUid, newRole) {
        try {
            if (!hasMinRole('TENANT_ADMIN')) {
                return { success: false, message: 'Unauthorized.', error: 'UNAUTHORIZED' };
            }

            const roleConfig = CRM_Config.getRole(newRole);
            if (!roleConfig) {
                return { success: false, message: 'Invalid role.', error: 'INVALID_ROLE' };
            }

            // Cannot demote self
            if (memberUid === _getCurrentUid()) {
                return { success: false, message: 'You cannot change your own role.', error: 'SELF_DEMOTE' };
            }

            const db = _getFirestore();
            if (!db) {
                return { success: false, message: 'Service unavailable.', error: 'SERVICE_UNAVAILABLE' };
            }

            await db.collection(CRM_Config.firebase.collections.USERS)
                .doc(memberUid).update({
                    role: newRole,
                    updatedAt: new Date().toISOString(),
                    updatedBy: _getCurrentUid(),
                });

            // Update local cache
            const member = _teamMembers.find(m => m.uid === memberUid || m.id === memberUid);
            if (member) member.role = newRole;

            await _loadTeamMembers(); // Refresh
            return { success: true, message: 'Role updated successfully.' };
        } catch (error) {
            console.error('[CRM_Tenant] Update role error:', error);
            return { success: false, message: 'Failed to update role.', error: error.code || 'UNKNOWN' };
        }
    }

    /**
     * Remove team member from tenant
     * @param {string} memberUid - Member UID
     * @returns {Promise<Object>}
     */
    async function removeTeamMember(memberUid) {
        try {
            if (!hasMinRole('TENANT_ADMIN')) {
                return { success: false, message: 'Unauthorized.', error: 'UNAUTHORIZED' };
            }

            if (memberUid === _getCurrentUid()) {
                return { success: false, message: 'You cannot remove yourself.', error: 'SELF_REMOVE' };
            }

            const db = _getFirestore();
            if (!db) {
                return { success: false, message: 'Service unavailable.', error: 'SERVICE_UNAVAILABLE' };
            }

            await db.collection(CRM_Config.firebase.collections.USERS)
                .doc(memberUid).update({
                    tenantId: null,
                    status: 'inactive',
                    moduleAccess: [],
                    updatedAt: new Date().toISOString(),
                    removedBy: _getCurrentUid(),
                });

            _teamMembers = _teamMembers.filter(m => (m.uid || m.id) !== memberUid);
            return { success: true, message: 'Team member removed.' };
        } catch (error) {
            console.error('[CRM_Tenant] Remove member error:', error);
            return { success: false, message: 'Failed to remove member.', error: error.code || 'UNKNOWN' };
        }
    }

    // ============================================================
    // REGISTRATION APPROVAL WORKFLOW
    // ============================================================
    /**
     * Get pending registration approvals (Platform Owner only)
     * @returns {Promise<Array>}
     */
    async function getPendingApprovals() {
        try {
            if (!hasMinRole('PLATFORM_OWNER')) {
                return [];
            }

            const db = _getFirestore();
            if (!db) return _pendingApprovals;

            const snapshot = await db.collection(CRM_Config.firebase.collections.USERS)
                .where('approvalStatus', '==', 'pending')
                .orderBy('createdAt', 'asc')
                .limit(100)
                .get();

            _pendingApprovals = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            }));

            return _pendingApprovals;
        } catch (error) {
            console.error('[CRM_Tenant] Pending approvals error:', error);
            return _pendingApprovals;
        }
    }

    /**
     * Approve or reject a registration
     * @param {string} userUid - User UID
     * @param {boolean} approved - Whether to approve
     * @param {Object} [options] - Approval options
     * @param {string} [options.role] - Assigned role
     * @param {Array} [options.moduleAccess] - Module access list
     * @param {string} [options.saasAccess] - 'whatsapp_only' | 'smes_only' | 'both'
     * @param {string} [options.tenantId] - Assign to existing tenant
     * @returns {Promise<Object>}
     */
    async function approveRegistration(userUid, approved, options = {}) {
        try {
            if (!hasMinRole('PLATFORM_OWNER')) {
                return { success: false, message: 'Only Platform Owner can approve registrations.', error: 'UNAUTHORIZED' };
            }

            const db = _getFirestore();
            if (!db) {
                return { success: false, message: 'Service unavailable.', error: 'SERVICE_UNAVAILABLE' };
            }

            const updates = {
                approvalStatus: approved ? 'approved' : 'rejected',
                approvedAt: new Date().toISOString(),
                approvedBy: _getCurrentUid(),
                updatedAt: new Date().toISOString(),
            };

            if (approved) {
                updates.role = options.role || 'EXECUTIVE';
                updates.moduleAccess = options.moduleAccess || CRM_Config.tenants.defaultModuleAccess;
                updates.saasAccess = options.saasAccess || 'smes_only';
                updates.status = 'active';

                // Create or assign tenant
                if (options.tenantId) {
                    updates.tenantId = options.tenantId;
                } else {
                    // Create new tenant
                    const tenantRef = await db.collection(CRM_Config.firebase.collections.TENANTS).add({
                        name: 'New Organization',
                        plan: 'free',
                        status: 'active',
                        createdAt: new Date().toISOString(),
                        createdBy: userUid,
                        settings: {
                            currency: '₹',
                            timezone: 'Asia/Kolkata',
                            language: 'en-IN',
                        },
                        moduleAccess: options.moduleAccess || CRM_Config.tenants.defaultModuleAccess,
                    });
                    updates.tenantId = tenantRef.id;
                }
            } else {
                updates.status = 'rejected';
                updates.rejectionReason = options.reason || 'Registration rejected by platform owner.';
            }

            await db.collection(CRM_Config.firebase.collections.USERS)
                .doc(userUid).update(updates);

            // Remove from pending list
            _pendingApprovals = _pendingApprovals.filter(a => a.id !== userUid);

            // Send notification email
            const workerUrl = CRM_Config.api.buildUrl('/notifications/send');
            fetch(workerUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: userUid,
                    type: approved ? 'registration_approved' : 'registration_rejected',
                    channel: 'email',
                    data: updates,
                }),
            }).catch(err => console.warn('[CRM_Tenant] Notification send failed:', err));

            return {
                success: true,
                message: approved ? 'Registration approved successfully.' : 'Registration rejected.',
            };
        } catch (error) {
            console.error('[CRM_Tenant] Approval error:', error);
            return { success: false, message: 'Failed to process approval.', error: error.code || 'UNKNOWN' };
        }
    }

    // ============================================================
    // CROSS-SAAS SYNC (WhatsApp CRM ↔ SMEs CRM)
    // ============================================================
    /**
     * Set up cross-SaaS synchronization
     * @param {Object} userProfile - User profile with saasAccess
     */
    async function _setupCrossSaasSync(userProfile) {
        try {
            if (!userProfile.saasAccess) return;

            _crossSaasState = {
                access: userProfile.saasAccess, // 'whatsapp_only' | 'smes_only' | 'both'
                lastSync: null,
                syncStatus: 'idle',
            };

            // If user has access to both, sync data
            if (userProfile.saasAccess === 'both') {
                await _syncCrossSaasData();
            }

            console.log('[CRM_Tenant] Cross-SaaS sync configured:', userProfile.saasAccess);
        } catch (error) {
            console.error('[CRM_Tenant] Cross-SaaS setup error:', error);
        }
    }

    /**
     * Sync data between WhatsApp CRM and SMEs CRM
     * @returns {Promise<Object>}
     */
    async function _syncCrossSaasData() {
        try {
            _crossSaasState.syncStatus = 'syncing';

            const db = _getFirestore();
            if (!db) {
                _crossSaasState.syncStatus = 'offline';
                return { success: false, message: 'Offline - sync when online.' };
            }

            const uid = _getCurrentUid();
            if (!uid) {
                _crossSaasState.syncStatus = 'error';
                return { success: false, message: 'Not authenticated.' };
            }

            // Fetch user data from both collections
            const [smesDoc, waDoc] = await Promise.all([
                db.collection(CROSS_SAAS_CONFIG.apps.SMES_CRM.firebaseCollection).doc(uid).get(),
                db.collection(CROSS_SAAS_CONFIG.apps.WHATSAPP_CRM.firebaseCollection).doc(uid).get(),
            ]);

            const syncData = {};
            CROSS_SAAS_CONFIG.apps.SMES_CRM.syncFields.forEach(field => {
                if (smesDoc.exists && smesDoc.data()[field] !== undefined) {
                    syncData[field] = smesDoc.data()[field];
                } else if (waDoc.exists && waDoc.data()[field] !== undefined) {
                    syncData[field] = waDoc.data()[field];
                }
            });

            // Update both collections with merged data
            const batch = db.batch();
            if (smesDoc.exists) batch.update(smesDoc.ref, { ...syncData, lastSyncedAt: new Date().toISOString() });
            if (waDoc.exists) batch.update(waDoc.ref, { ...syncData, lastSyncedAt: new Date().toISOString() });
            await batch.commit();

            _crossSaasState.lastSync = new Date().toISOString();
            _crossSaasState.syncStatus = 'synced';

            console.log('[CRM_Tenant] Cross-SaaS sync completed.');
            return { success: true, message: 'Data synced across platforms.' };
        } catch (error) {
            console.error('[CRM_Tenant] Cross-SaaS sync error:', error);
            _crossSaasState.syncStatus = 'error';
            return { success: false, message: 'Sync failed.', error: error.code || 'UNKNOWN' };
        }
    }

    /**
     * Manually trigger cross-SaaS sync
     * @returns {Promise<Object>}
     */
    function syncNow() {
        return _syncCrossSaasData();
    }

    /**
     * Get cross-SaaS state
     * @returns {Object|null}
     */
    function getCrossSaasState() {
        return _crossSaasState;
    }

    /**
     * Check if user can access a specific SaaS app
     * @param {string} appId - 'whatsapp-crm' | 'smes-crm'
     * @returns {boolean}
     */
    function canAccessSaasApp(appId) {
        try {
            if (!_crossSaasState) {
                // Check user profile directly
                if (_currentUserProfile && _currentUserProfile.saasAccess) {
                    if (_currentUserProfile.saasAccess === 'both') return true;
                    if (_currentUserProfile.saasAccess === 'whatsapp_only' && appId === 'whatsapp-crm') return true;
                    if (_currentUserProfile.saasAccess === 'smes_only' && appId === 'smes-crm') return true;
                }
                // Default: can access current app
                return appId === 'smes-crm';
            }

            if (_crossSaasState.access === 'both') return true;
            if (_crossSaasState.access === 'whatsapp_only') return appId === 'whatsapp-crm';
            if (_crossSaasState.access === 'smes_only') return appId === 'smes-crm';
            return false;
        } catch (error) {
            console.error('[CRM_Tenant] canAccessSaasApp error:', error);
            return false;
        }
    }

    // ============================================================
    // TENANT SETTINGS
    // ============================================================
    /**
     * Get tenant setting
     * @param {string} key - Setting key (dot notation supported)
     * @param {*} defaultValue - Default if not set
     * @returns {*}
     */
    function getSetting(key, defaultValue = null) {
        try {
            if (!_currentTenant || !_currentTenant.settings) return defaultValue;

            const keys = key.split('.');
            let value = _currentTenant.settings;

            for (const k of keys) {
                if (value && typeof value === 'object' && k in value) {
                    value = value[k];
                } else {
                    return defaultValue;
                }
            }

            return value !== undefined ? value : defaultValue;
        } catch (error) {
            console.error('[CRM_Tenant] getSetting error:', error);
            return defaultValue;
        }
    }

    /**
     * Update tenant settings
     * @param {Object} updates - Key-value pairs to update
     * @returns {Promise<Object>}
     */
    async function updateSettings(updates) {
        try {
            if (!hasMinRole('TENANT_ADMIN')) {
                return { success: false, message: 'Only Tenant Admin can update settings.', error: 'UNAUTHORIZED' };
            }

            const tenantId = getTenantId();
            if (!tenantId) {
                return { success: false, message: 'No tenant context.', error: 'NO_TENANT' };
            }

            const db = _getFirestore();
            if (db) {
                await db.collection(CRM_Config.firebase.collections.TENANTS)
                    .doc(tenantId).update({
                        settings: updates,
                        updatedAt: new Date().toISOString(),
                        updatedBy: _getCurrentUid(),
                    });
            }

            // Update local cache
            if (!_currentTenant.settings) _currentTenant.settings = {};
            Object.assign(_currentTenant.settings, updates);
            localStorage.setItem(CRM_Config.app.storageKeys.TENANT_DATA, JSON.stringify(_currentTenant));

            return { success: true, message: 'Settings updated.' };
        } catch (error) {
            console.error('[CRM_Tenant] Update settings error:', error);
            return { success: false, message: 'Failed to update settings.', error: error.code || 'UNKNOWN' };
        }
    }

    /**
     * Get tenant quotas and usage
     * @returns {Object} {max, used, remaining}
     */
    function getQuotaUsage() {
        try {
            const quotas = _currentTenant?.quotas || {};
            return {
                users: {
                    max: quotas.maxUsers || 3,
                    used: _teamMembers.length,
                    remaining: (quotas.maxUsers || 3) - _teamMembers.length,
                },
                leads: {
                    max: quotas.maxLeads || 500,
                    used: 0, // To be updated by leads module
                    remaining: quotas.maxLeads || 500,
                },
                invoices: {
                    max: quotas.maxInvoices || 50,
                    used: 0,
                    remaining: quotas.maxInvoices || 50,
                },
                storage: {
                    max: quotas.maxStorage || 104857600,
                    used: 0,
                    remaining: quotas.maxStorage || 104857600,
                    unit: 'bytes',
                },
            };
        } catch (error) {
            console.error('[CRM_Tenant] getQuotaUsage error:', error);
            return {};
        }
    }

    /**
     * Check if a quota is exceeded
     * @param {string} quotaType - 'users' | 'leads' | 'invoices' | 'storage'
     * @returns {boolean}
     */
    function isQuotaExceeded(quotaType) {
        try {
            const usage = getQuotaUsage();
            if (!usage[quotaType]) return false;
            const quota = usage[quotaType];
            if (quota.max === -1) return false; // Unlimited
            return quota.used >= quota.max;
        } catch (error) {
            console.error('[CRM_Tenant] isQuotaExceeded error:', error);
            return false;
        }
    }

    // ============================================================
    // UTILITY METHODS
    // ============================================================
    /**
     * Clear permission and module caches
     */
    function _clearCaches() {
        Object.keys(_permissionCache).forEach(key => delete _permissionCache[key]);
        Object.keys(_moduleAccessCache).forEach(key => delete _moduleAccessCache[key]);
    }

    /**
     * Notify all tenant change listeners
     */
    function _notifyListeners() {
        const state = {
            tenant: _currentTenant,
            userProfile: _currentUserProfile,
            teamMembers: _teamMembers,
            crossSaas: _crossSaasState,
        };
        _tenantListeners.forEach(listener => {
            try { listener(state); } catch (e) { console.error('[CRM_Tenant] Listener error:', e); }
        });
    }

    /** @returns {string|null} Current tenant ID */
    function getTenantId() {
        return _currentTenant?.id || (window.CRM_Auth?.getTenantId ? window.CRM_Auth.getTenantId() : null);
    }

    /** @returns {Object|null} Current tenant */
    function getTenant() { return _currentTenant; }

    /** @returns {Object|null} Current user profile */
    function getUserProfile() { return _currentUserProfile; }

    /** @returns {string|null} Current tenant plan */
    function getPlan() { return _currentTenant?.plan || 'free'; }

    /** @returns {boolean} Whether tenant is initialized */
    function isInitialized() { return _initialized; }

    /**
     * Subscribe to tenant changes
     * @param {Function} listener - Callback(state)
     * @returns {Function} Unsubscribe
     */
    function onTenantChange(listener) {
        _tenantListeners.push(listener);
        if (_initialized) {
            listener({
                tenant: _currentTenant,
                userProfile: _currentUserProfile,
                teamMembers: _teamMembers,
                crossSaas: _crossSaasState,
            });
        }
        return () => {
            const i = _tenantListeners.indexOf(listener);
            if (i > -1) _tenantListeners.splice(i, 1);
        };
    }

    // ============================================================
    // INITIALIZATION
    // ============================================================
    function init() {
        try {
            // Listen for auth changes to re-init tenant context
            if (window.CRM_Auth && window.CRM_Auth.onAuthStateChange) {
                window.CRM_Auth.onAuthStateChange(async (authState) => {
                    if (authState.isAuthenticated && authState.authState === 'authenticated') {
                        await initTenantContext();
                    } else {
                        _currentTenant = null;
                        _currentUserProfile = null;
                        _teamMembers = [];
                        _initialized = false;
                        _notifyListeners();
                    }
                });
            }

            // Try to init immediately if already authenticated
            if (window.CRM_Auth && window.CRM_Auth.isAuthenticated()) {
                initTenantContext().catch(err => console.error('[CRM_Tenant] Auto-init error:', err));
            }

            console.log('[CRM_Tenant] Module loaded.');
        } catch (error) {
            console.error('[CRM_Tenant] Init error:', error);
        }
    }

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 200));
    } else {
        setTimeout(init, 200);
    }

    // ============================================================
    // PUBLIC API EXPORT
    // ============================================================
    return {
        // Init
        init,
        initTenantContext,

        // RBAC
        hasPermission,
        canAccessModule,
        hasMinRole,
        getUserPermissions,
        getAccessibleModules,

        // Team
        getTeamMembers,
        getTeamHierarchy,
        inviteTeamMember,
        updateMemberRole,
        removeTeamMember,

        // Approvals
        getPendingApprovals,
        approveRegistration,

        // Cross-SaaS
        syncNow,
        getCrossSaasState,
        canAccessSaasApp,

        // Settings
        getSetting,
        updateSettings,
        getQuotaUsage,
        isQuotaExceeded,

        // State
        getTenantId,
        getTenant,
        getUserProfile,
        getPlan,
        isInitialized,
        onTenantChange,
    };
})();

// ============================================================
// EXPORT TO GLOBAL (Rule #20)
// ============================================================
window.CRM_Tenant = CRM_Tenant;

// ES Module export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CRM_Tenant;
}

console.log('[CRM_Tenant] Module loaded. window.CRM_Tenant available.');