/**
 * 11 Avatar SMEs CRM — Multi-Tenant & RBAC Module
 * @file js/core/tenant.js
 */
'use strict';

const CRM_Tenant = (function() {
    'use strict';

    let _currentTenant = null;
    let _currentUserProfile = null;
    let _teamMembers = [];
    let _pendingApprovals = [];
    let _crossSaasState = null;
    const _tenantListeners = [];
    let _initialized = false;
    const _moduleAccessCache = {};
    const _permissionCache = {};
    const CACHE_TTL = 60000;
    const MAX_TEAM_MEMBERS_PER_PAGE = 50;

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

    function _configReady() {
        return typeof window.CRM_Config !== 'undefined' && window.CRM_Config.app;
    }

    function _getFirestore() {
        try {
            if (!window.firebase || !window.firebase.firestore) return null;
            if (!window.firebase.apps || window.firebase.apps.length === 0) return null;
            return window.firebase.firestore();
        } catch (e) { return null; }
    }

    function _getCurrentUid() {
        try {
            if (window.CRM_Auth && window.CRM_Auth.getCurrentUser) {
                var u = window.CRM_Auth.getCurrentUser();
                return u ? u.uid : null;
            }
            if (window.CRM_Auth && window.CRM_Auth.getUser) {
                var p = window.CRM_Auth.getUser();
                return p ? p.uid : null;
            }
            return null;
        } catch (e) { return null; }
    }

    function _notifyListeners() {
        var state = {
            tenant: _currentTenant,
            userProfile: _currentUserProfile,
            teamMembers: _teamMembers,
            crossSaas: _crossSaasState,
        };
        _tenantListeners.forEach(function(fn) { try { fn(state); } catch (e) {} });
    }

    function _clearCaches() {
        for (var key in _permissionCache) { if (_permissionCache.hasOwnProperty(key)) delete _permissionCache[key]; }
        for (var key in _moduleAccessCache) { if (_moduleAccessCache.hasOwnProperty(key)) delete _moduleAccessCache[key]; }
    }

    function _getDefaultTenantData(tenantId) {
        return {
            id: tenantId,
            name: 'Organization',
            plan: 'free',
            status: 'active',
            createdAt: new Date().toISOString(),
            settings: { currency: '₹', timezone: 'Asia/Kolkata', language: 'en-IN' },
            moduleAccess: _configReady() ? window.CRM_Config.tenants.defaultModuleAccess : ['DASHBOARD', 'LEADS', 'PIPELINE', 'CLIENTS'],
            features: {},
            quotas: { maxUsers: 3, maxLeads: 500, maxInvoices: 50 },
        };
    }

    async function _fetchTenantById(tenantId) {
        try {
            var db = _getFirestore();
            if (!db) {
                if (_configReady()) {
                    var cached = localStorage.getItem(window.CRM_Config.app.storageKeys.TENANT_DATA);
                    if (cached) {
                        try { var p = JSON.parse(cached); if (p.id === tenantId) return p; } catch (e) {}
                    }
                }
                return _getDefaultTenantData(tenantId);
            }
            var col = _configReady() ? window.CRM_Config.firebase.collections.TENANTS : 'tenants';
            var doc = await db.collection(col).doc(tenantId).get();
            if (doc.exists) {
                var data = Object.assign({ id: doc.id }, doc.data());
                if (_configReady()) {
                    try { localStorage.setItem(window.CRM_Config.app.storageKeys.TENANT_DATA, JSON.stringify(data)); } catch (e) {}
                }
                return data;
            }
            return _getDefaultTenantData(tenantId);
        } catch (e) { return _getDefaultTenantData(tenantId); }
    }

    async function _createDefaultTenantContext(userProfile) {
        var plan = _configReady() ? window.CRM_Config.tenants.defaultPlan : 'free';
        var planConfig = _configReady() ? window.CRM_Config.getPlan(plan) : { maxUsers: 3, maxLeads: 500, maxInvoices: 50, maxStorage: 104857600, features: [] };
        var tenantData = {
            id: userProfile.tenantId || 'pending',
            name: userProfile.companyName || 'My Business',
            plan: plan,
            status: userProfile.approvalStatus || 'pending',
            createdAt: userProfile.createdAt || new Date().toISOString(),
            settings: { currency: '₹', timezone: 'Asia/Kolkata', language: 'en-IN', dateFormat: 'DD/MM/YYYY', gstin: '', pan: '', address: {} },
            moduleAccess: userProfile.moduleAccess || (_configReady() ? window.CRM_Config.tenants.defaultModuleAccess : ['DASHBOARD', 'LEADS', 'PIPELINE', 'CLIENTS']),
            features: {},
            quotas: { maxUsers: planConfig.maxUsers, maxLeads: planConfig.maxLeads, maxInvoices: planConfig.maxInvoices, maxStorage: planConfig.maxStorage },
            branding: { logo: null, primaryColor: '#D4AF37' },
        };
        if (planConfig.features) {
            planConfig.features.forEach(function(f) { tenantData.features[f] = true; });
        }
        _currentTenant = tenantData;
        if (_configReady()) {
            try { localStorage.setItem(window.CRM_Config.app.storageKeys.TENANT_DATA, JSON.stringify(tenantData)); } catch (e) {}
        }
        return tenantData;
    }

    async function _loadTeamMembers() {
        try {
            var db = _getFirestore();
            var tenantId = getTenantId();
            if (!db || !tenantId) { _teamMembers = []; return _teamMembers; }
            var col = _configReady() ? window.CRM_Config.firebase.collections.USERS : 'users';
            var snapshot = await db.collection(col)
                .where('tenantId', '==', tenantId)
                .where('status', '==', 'active')
                .limit(MAX_TEAM_MEMBERS_PER_PAGE)
                .get();
            _teamMembers = [];
            snapshot.docs.forEach(function(doc) {
                _teamMembers.push(Object.assign({ id: doc.id }, doc.data()));
            });
            return _teamMembers;
        } catch (e) { _teamMembers = []; return _teamMembers; }
    }

    async function _setupCrossSaasSync(userProfile) {
        try {
            if (!userProfile.saasAccess) return;
            _crossSaasState = { access: userProfile.saasAccess, lastSync: null, syncStatus: 'idle' };
            if (userProfile.saasAccess === 'both') await _syncCrossSaasData();
        } catch (e) {}
    }

    async function _syncCrossSaasData() {
        try {
            _crossSaasState.syncStatus = 'syncing';
            var db = _getFirestore();
            if (!db) { _crossSaasState.syncStatus = 'offline'; return { success: false, message: 'Offline.' }; }
            var uid = _getCurrentUid();
            if (!uid) { _crossSaasState.syncStatus = 'error'; return { success: false, message: 'Not authenticated.' }; }
            var smesDoc = await db.collection(CROSS_SAAS_CONFIG.apps.SMES_CRM.firebaseCollection).doc(uid).get();
            var waDoc = await db.collection(CROSS_SAAS_CONFIG.apps.WHATSAPP_CRM.firebaseCollection).doc(uid).get();
            var syncData = {};
            CROSS_SAAS_CONFIG.apps.SMES_CRM.syncFields.forEach(function(field) {
                if (smesDoc.exists && smesDoc.data()[field] !== undefined) syncData[field] = smesDoc.data()[field];
                else if (waDoc.exists && waDoc.data()[field] !== undefined) syncData[field] = waDoc.data()[field];
            });
            var batch = db.batch();
            syncData.lastSyncedAt = new Date().toISOString();
            if (smesDoc.exists) batch.update(smesDoc.ref, syncData);
            if (waDoc.exists) batch.update(waDoc.ref, syncData);
            await batch.commit();
            _crossSaasState.lastSync = new Date().toISOString();
            _crossSaasState.syncStatus = 'synced';
            return { success: true, message: 'Synced.' };
        } catch (e) { _crossSaasState.syncStatus = 'error'; return { success: false, message: 'Sync failed.' }; }
    }

    async function initTenantContext() {
        try {
            if (!window.CRM_Auth || !window.CRM_Auth.isAuthenticated()) return null;
            var userProfile = window.CRM_Auth.getUser();
            var tenantData = window.CRM_Auth.getTenant();
            if (!userProfile) return null;
            _currentUserProfile = userProfile;
            _currentTenant = tenantData;
            if (!_currentTenant && userProfile.tenantId) _currentTenant = await _fetchTenantById(userProfile.tenantId);
            if (!_currentTenant) _currentTenant = await _createDefaultTenantContext(userProfile);
            await _loadTeamMembers();
            if (CROSS_SAAS_CONFIG.enabled && userProfile.saasAccess) await _setupCrossSaasSync(userProfile);
            _clearCaches();
            _notifyListeners();
            _initialized = true;
            return _currentTenant;
        } catch (e) { return null; }
    }

    function hasPermission(permission) {
        try {
            var cacheKey = (_getCurrentUid() || 'anon') + '_' + permission;
            var cached = _permissionCache[cacheKey];
            if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) return cached.value;
            if (!_currentUserProfile) {
                if (window.CRM_Auth && window.CRM_Auth.hasPermission) {
                    var r = window.CRM_Auth.hasPermission(permission);
                    _permissionCache[cacheKey] = { value: r, timestamp: Date.now() };
                    return r;
                }
                return false;
            }
            if (!_configReady()) return false;
            var role = window.CRM_Config.getRole(_currentUserProfile.role);
            if (!role) { _permissionCache[cacheKey] = { value: false, timestamp: Date.now() }; return false; }
            if (role.level <= 1) { _permissionCache[cacheKey] = { value: true, timestamp: Date.now() }; return true; }
            var has = role.permissions.indexOf(permission) !== -1 || role.permissions.indexOf('*') !== -1;
            _permissionCache[cacheKey] = { value: has, timestamp: Date.now() };
            return has;
        } catch (e) { return false; }
    }

    function canAccessModule(moduleName) {
        try {
            var cacheKey = (_getCurrentUid() || 'anon') + '_module_' + moduleName;
            var cached = _moduleAccessCache[cacheKey];
            if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) return cached.value;
            if (hasMinRole('TENANT_ADMIN')) { _moduleAccessCache[cacheKey] = { value: true, timestamp: Date.now() }; return true; }
            var moduleKey = moduleName.toUpperCase();
            if (_currentTenant && _currentTenant.moduleAccess) {
                var has = _currentTenant.moduleAccess.indexOf(moduleKey) !== -1;
                _moduleAccessCache[cacheKey] = { value: has, timestamp: Date.now() };
                return has;
            }
            if (_currentUserProfile && _currentUserProfile.moduleAccess) {
                var hasU = _currentUserProfile.moduleAccess.indexOf(moduleKey) !== -1;
                _moduleAccessCache[cacheKey] = { value: hasU, timestamp: Date.now() };
                return hasU;
            }
            if (_configReady()) {
                var feat = window.CRM_Config.features[moduleKey];
                if (feat !== undefined) { _moduleAccessCache[cacheKey] = { value: !!feat, timestamp: Date.now() }; return !!feat; }
            }
            return false;
        } catch (e) { return false; }
    }

    function hasMinRole(roleName) {
        try {
            if (!_currentUserProfile) {
                if (window.CRM_Auth && window.CRM_Auth.hasMinRole) return window.CRM_Auth.hasMinRole(roleName);
                return false;
            }
            if (!_configReady()) return false;
            var userRole = window.CRM_Config.getRole(_currentUserProfile.role);
            var requiredRole = window.CRM_Config.getRole(roleName);
            if (!userRole || !requiredRole) return false;
            return userRole.level <= requiredRole.level;
        } catch (e) { return false; }
    }

    function getUserPermissions() {
        try {
            if (!_currentUserProfile || !_configReady()) return [];
            var role = window.CRM_Config.getRole(_currentUserProfile.role);
            return role ? role.permissions : [];
        } catch (e) { return []; }
    }

    function getAccessibleModules() {
        try {
            if (hasMinRole('TENANT_ADMIN') && _configReady()) return Object.keys(window.CRM_Config.modules);
            if (_currentTenant && _currentTenant.moduleAccess) return _currentTenant.moduleAccess;
            if (_currentUserProfile && _currentUserProfile.moduleAccess) return _currentUserProfile.moduleAccess;
            return _configReady() ? window.CRM_Config.tenants.defaultModuleAccess : [];
        } catch (e) { return []; }
    }

    function getTeamMembers(filters) {
        filters = filters || {};
        try {
            var members = _teamMembers.slice();
            if (filters.role) members = members.filter(function(m) { return m.role === filters.role; });
            if (filters.status) members = members.filter(function(m) { return m.status === filters.status; });
            if (filters.search) {
                var s = filters.search.toLowerCase();
                members = members.filter(function(m) {
                    return (m.displayName && m.displayName.toLowerCase().indexOf(s) !== -1) ||
                           (m.email && m.email.toLowerCase().indexOf(s) !== -1);
                });
            }
            return members;
        } catch (e) { return []; }
    }

    function getTeamHierarchy() {
        try {
            var h = { owner: null, admins: [], managers: [], teamLeaders: [], executives: [], viewers: [] };
            _teamMembers.forEach(function(member) {
                switch (member.role) {
                    case 'TENANT_ADMIN': h.owner = member; break;
                    case 'SUB_ADMIN': h.admins.push(member); break;
                    case 'MANAGER': h.managers.push(member); break;
                    case 'TEAM_LEADER': h.teamLeaders.push(member); break;
                    case 'EXECUTIVE': h.executives.push(member); break;
                    case 'VIEWER': h.viewers.push(member); break;
                }
            });
            return h;
        } catch (e) { return {}; }
    }

    async function inviteTeamMember(inviteData) {
        try {
            if (!hasMinRole('TENANT_ADMIN')) return { success: false, message: 'Unauthorized.', error: 'UNAUTHORIZED' };
            var email = inviteData.email;
            var role = inviteData.role || 'EXECUTIVE';
            var moduleAccess = inviteData.moduleAccess || (_configReady() ? window.CRM_Config.tenants.defaultModuleAccess : null);
            if (!email) return { success: false, message: 'Email required.', error: 'VALIDATION_ERROR' };
            var quota = _currentTenant && _currentTenant.quotas ? _currentTenant.quotas.maxUsers : 3;
            if (quota > 0 && _teamMembers.length >= quota) {
                return { success: false, message: 'User limit reached. Upgrade plan.', error: 'QUOTA_EXCEEDED' };
            }
            var db = _getFirestore();
            if (!db) return { success: false, message: 'Service unavailable.', error: 'SERVICE_UNAVAILABLE' };
            var inviteRef = await db.collection('team_invites').add({
                email: email.toLowerCase(), tenantId: getTenantId(), role: role,
                moduleAccess: moduleAccess, invitedBy: _getCurrentUid(),
                invitedAt: new Date().toISOString(), status: 'pending',
                expiresAt: new Date(Date.now() + 604800000).toISOString(),
            });
            if (_configReady()) {
                var url = window.CRM_Config.api.buildUrl('/users/invite');
                fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ inviteId: inviteRef.id, email: email, role: role, tenantId: getTenantId() }),
                }).catch(function() {});
            }
            return { success: true, message: 'Invitation sent to ' + email + '.', inviteId: inviteRef.id };
        } catch (e) { return { success: false, message: 'Failed to send invitation.', error: e.code || 'UNKNOWN' }; }
    }

    async function updateMemberRole(memberUid, newRole) {
        try {
            if (!hasMinRole('TENANT_ADMIN')) return { success: false, message: 'Unauthorized.', error: 'UNAUTHORIZED' };
            if (!_configReady()) return { success: false, message: 'Config not loaded.', error: 'SERVICE_UNAVAILABLE' };
            var roleConfig = window.CRM_Config.getRole(newRole);
            if (!roleConfig) return { success: false, message: 'Invalid role.', error: 'INVALID_ROLE' };
            if (memberUid === _getCurrentUid()) return { success: false, message: 'Cannot change own role.', error: 'SELF_DEMOTE' };
            var db = _getFirestore();
            if (!db) return { success: false, message: 'Service unavailable.', error: 'SERVICE_UNAVAILABLE' };
            var col = window.CRM_Config.firebase.collections.USERS;
            await db.collection(col).doc(memberUid).update({
                role: newRole, updatedAt: new Date().toISOString(), updatedBy: _getCurrentUid(),
            });
            var member = null;
            for (var i = 0; i < _teamMembers.length; i++) {
                if (_teamMembers[i].uid === memberUid || _teamMembers[i].id === memberUid) { member = _teamMembers[i]; break; }
            }
            if (member) member.role = newRole;
            await _loadTeamMembers();
            return { success: true, message: 'Role updated.' };
        } catch (e) { return { success: false, message: 'Failed to update role.', error: e.code || 'UNKNOWN' }; }
    }

    async function removeTeamMember(memberUid) {
        try {
            if (!hasMinRole('TENANT_ADMIN')) return { success: false, message: 'Unauthorized.', error: 'UNAUTHORIZED' };
            if (memberUid === _getCurrentUid()) return { success: false, message: 'Cannot remove yourself.', error: 'SELF_REMOVE' };
            var db = _getFirestore();
            if (!db) return { success: false, message: 'Service unavailable.', error: 'SERVICE_UNAVAILABLE' };
            var col = _configReady() ? window.CRM_Config.firebase.collections.USERS : 'users';
            await db.collection(col).doc(memberUid).update({
                tenantId: null, status: 'inactive', moduleAccess: [],
                updatedAt: new Date().toISOString(), removedBy: _getCurrentUid(),
            });
            _teamMembers = _teamMembers.filter(function(m) { return (m.uid || m.id) !== memberUid; });
            return { success: true, message: 'Member removed.' };
        } catch (e) { return { success: false, message: 'Failed to remove.', error: e.code || 'UNKNOWN' }; }
    }

    async function getPendingApprovals() {
        try {
            if (!hasMinRole('PLATFORM_OWNER')) return [];
            var db = _getFirestore();
            if (!db) return _pendingApprovals;
            var col = _configReady() ? window.CRM_Config.firebase.collections.USERS : 'users';
            var snapshot = await db.collection(col)
                .where('approvalStatus', '==', 'pending')
                .orderBy('createdAt', 'asc')
                .limit(100)
                .get();
            _pendingApprovals = [];
            snapshot.docs.forEach(function(doc) {
                _pendingApprovals.push(Object.assign({ id: doc.id }, doc.data()));
            });
            return _pendingApprovals;
        } catch (e) { return _pendingApprovals; }
    }

    async function approveRegistration(userUid, approved, options) {
        options = options || {};
        try {
            if (!hasMinRole('PLATFORM_OWNER')) return { success: false, message: 'Unauthorized.', error: 'UNAUTHORIZED' };
            var db = _getFirestore();
            if (!db) return { success: false, message: 'Service unavailable.', error: 'SERVICE_UNAVAILABLE' };
            if (!_configReady()) return { success: false, message: 'Config not loaded.', error: 'SERVICE_UNAVAILABLE' };
            var updates = {
                approvalStatus: approved ? 'approved' : 'rejected',
                approvedAt: new Date().toISOString(), approvedBy: _getCurrentUid(),
                updatedAt: new Date().toISOString(),
            };
            if (approved) {
                updates.role = options.role || 'EXECUTIVE';
                updates.moduleAccess = options.moduleAccess || window.CRM_Config.tenants.defaultModuleAccess;
                updates.saasAccess = options.saasAccess || 'smes_only';
                updates.status = 'active';
                if (options.tenantId) {
                    updates.tenantId = options.tenantId;
                } else {
                    var tenantRef = await db.collection(window.CRM_Config.firebase.collections.TENANTS).add({
                        name: 'New Organization', plan: 'free', status: 'active',
                        createdAt: new Date().toISOString(), createdBy: userUid,
                        settings: { currency: '₹', timezone: 'Asia/Kolkata', language: 'en-IN' },
                        moduleAccess: options.moduleAccess || window.CRM_Config.tenants.defaultModuleAccess,
                    });
                    updates.tenantId = tenantRef.id;
                }
            } else {
                updates.status = 'rejected';
                updates.rejectionReason = options.reason || 'Registration rejected.';
            }
            var col = window.CRM_Config.firebase.collections.USERS;
            await db.collection(col).doc(userUid).update(updates);
            _pendingApprovals = _pendingApprovals.filter(function(a) { return a.id !== userUid; });
            try {
                var notifyUrl = window.CRM_Config.api.buildUrl('/notifications/send');
                fetch(notifyUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: userUid,
                        type: approved ? 'registration_approved' : 'registration_rejected',
                        channel: 'email', data: updates,
                    }),
                }).catch(function() {});
            } catch (e) {}
            return { success: true, message: approved ? 'Registration approved.' : 'Registration rejected.' };
        } catch (e) { return { success: false, message: 'Approval failed.', error: e.code || 'UNKNOWN' }; }
    }

    function syncNow() { return _syncCrossSaasData(); }
    function getCrossSaasState() { return _crossSaasState; }

    function canAccessSaasApp(appId) {
        try {
            if (!_crossSaasState) {
                if (_currentUserProfile && _currentUserProfile.saasAccess) {
                    if (_currentUserProfile.saasAccess === 'both') return true;
                    if (_currentUserProfile.saasAccess === 'whatsapp_only' && appId === 'whatsapp-crm') return true;
                    if (_currentUserProfile.saasAccess === 'smes_only' && appId === 'smes-crm') return true;
                }
                return appId === 'smes-crm';
            }
            if (_crossSaasState.access === 'both') return true;
            if (_crossSaasState.access === 'whatsapp_only') return appId === 'whatsapp-crm';
            if (_crossSaasState.access === 'smes_only') return appId === 'smes-crm';
            return false;
        } catch (e) { return false; }
    }

    function getSetting(key, defaultValue) {
        defaultValue = defaultValue || null;
        try {
            if (!_currentTenant || !_currentTenant.settings) return defaultValue;
            var keys = key.split('.');
            var value = _currentTenant.settings;
            for (var i = 0; i < keys.length; i++) {
                if (value && typeof value === 'object' && keys[i] in value) value = value[keys[i]];
                else return defaultValue;
            }
            return value !== undefined ? value : defaultValue;
        } catch (e) { return defaultValue; }
    }

    async function updateSettings(updates) {
        try {
            if (!hasMinRole('TENANT_ADMIN')) return { success: false, message: 'Unauthorized.', error: 'UNAUTHORIZED' };
            var tenantId = getTenantId();
            if (!tenantId) return { success: false, message: 'No tenant context.', error: 'NO_TENANT' };
            var db = _getFirestore();
            if (db && _configReady()) {
                await db.collection(window.CRM_Config.firebase.collections.TENANTS).doc(tenantId).update({
                    settings: updates, updatedAt: new Date().toISOString(), updatedBy: _getCurrentUid(),
                });
            }
            if (!_currentTenant.settings) _currentTenant.settings = {};
            for (var key in updates) { if (updates.hasOwnProperty(key)) _currentTenant.settings[key] = updates[key]; }
            if (_configReady()) {
                try { localStorage.setItem(window.CRM_Config.app.storageKeys.TENANT_DATA, JSON.stringify(_currentTenant)); } catch (e) {}
            }
            return { success: true, message: 'Settings updated.' };
        } catch (e) { return { success: false, message: 'Failed to update settings.', error: e.code || 'UNKNOWN' }; }
    }

    function getQuotaUsage() {
        try {
            var quotas = _currentTenant && _currentTenant.quotas ? _currentTenant.quotas : {};
            return {
                users: { max: quotas.maxUsers || 3, used: _teamMembers.length, remaining: (quotas.maxUsers || 3) - _teamMembers.length },
                leads: { max: quotas.maxLeads || 500, used: 0, remaining: quotas.maxLeads || 500 },
                invoices: { max: quotas.maxInvoices || 50, used: 0, remaining: quotas.maxInvoices || 50 },
                storage: { max: quotas.maxStorage || 104857600, used: 0, remaining: quotas.maxStorage || 104857600, unit: 'bytes' },
            };
        } catch (e) { return {}; }
    }

    function isQuotaExceeded(quotaType) {
        try {
            var usage = getQuotaUsage();
            if (!usage[quotaType]) return false;
            var q = usage[quotaType];
            if (q.max === -1) return false;
            return q.used >= q.max;
        } catch (e) { return false; }
    }

    function getTenantId() {
        return (_currentTenant && _currentTenant.id) || (window.CRM_Auth && window.CRM_Auth.getTenantId ? window.CRM_Auth.getTenantId() : null);
    }
    function getTenant() { return _currentTenant; }
    function getUserProfile() { return _currentUserProfile; }
    function getPlan() { return _currentTenant && _currentTenant.plan ? _currentTenant.plan : 'free'; }
    function isInitialized() { return _initialized; }

    function onTenantChange(listener) {
        _tenantListeners.push(listener);
        if (_initialized) {
            listener({ tenant: _currentTenant, userProfile: _currentUserProfile, teamMembers: _teamMembers, crossSaas: _crossSaasState });
        }
        return function() {
            var i = _tenantListeners.indexOf(listener);
            if (i > -1) _tenantListeners.splice(i, 1);
        };
    }

    function init() {
        try {
            if (window.CRM_Auth && window.CRM_Auth.onAuthStateChange) {
                window.CRM_Auth.onAuthStateChange(function(authState) {
                    if (authState.isAuthenticated && authState.authState === 'authenticated') {
                        initTenantContext().catch(function() {});
                    } else {
                        _currentTenant = null;
                        _currentUserProfile = null;
                        _teamMembers = [];
                        _initialized = false;
                        _notifyListeners();
                    }
                });
            }
            if (window.CRM_Auth && window.CRM_Auth.isAuthenticated()) {
                initTenantContext().catch(function() {});
            }
        } catch (e) {}
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 200); });
    } else {
        setTimeout(init, 200);
    }

    return {
        init: init, initTenantContext: initTenantContext,
        hasPermission: hasPermission, canAccessModule: canAccessModule, hasMinRole: hasMinRole,
        getUserPermissions: getUserPermissions, getAccessibleModules: getAccessibleModules,
        getTeamMembers: getTeamMembers, getTeamHierarchy: getTeamHierarchy,
        inviteTeamMember: inviteTeamMember, updateMemberRole: updateMemberRole, removeTeamMember: removeTeamMember,
        getPendingApprovals: getPendingApprovals, approveRegistration: approveRegistration,
        syncNow: syncNow, getCrossSaasState: getCrossSaasState, canAccessSaasApp: canAccessSaasApp,
        getSetting: getSetting, updateSettings: updateSettings, getQuotaUsage: getQuotaUsage, isQuotaExceeded: isQuotaExceeded,
        getTenantId: getTenantId, getTenant: getTenant, getUserProfile: getUserProfile, getPlan: getPlan,
        isInitialized: isInitialized, onTenantChange: onTenantChange,
    };
})();

window.CRM_Tenant = CRM_Tenant;
if (typeof module !== 'undefined' && module.exports) module.exports = CRM_Tenant;
