/**
 * 11 Avatar SMEs CRM — Authentication Module
 * @file js/core/auth.js
 */
'use strict';

const CRM_Auth = (function() {
    'use strict';

    let _currentUser = null;
    let _userProfile = null;
    let _tenantData = null;
    let _isAuthenticated = false;
    let _authState = null;
    const _authListeners = [];
    let _sessionTimeoutId = null;
    let _tokenRefreshId = null;
    let _inactivityTimeoutId = null;

    const AUTH_STATES = {
        LOADING: 'loading',
        AUTHENTICATED: 'authenticated',
        UNAUTHENTICATED: 'unauthenticated',
        PENDING_APPROVAL: 'pending_approval',
        SUSPENDED: 'suspended',
        ERROR: 'error',
    };

    const CONFIG_READY = function() {
        return typeof window.CRM_Config !== 'undefined' && window.CRM_Config.app;
    };

    const TOKEN_REFRESH_BUFFER = 300000;
    const SESSION_TIMEOUT = 28800000;
    const INACTIVITY_TIMEOUT = 1800000;

    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyBZDaHJSt-4AV6EJYG76p8kcsIHf6LOxdU",
        authDomain: "avatar-wa-dual-crm.firebaseapp.com",
        projectId: "avatar-wa-dual-crm",
        storageBucket: "avatar-wa-dual-crm.firebasestorage.app",
        messagingSenderId: "946959261009",
        appId: "1:946959261009:web:175f5390d63715f1f8c770"
    };

    function _getAuth() {
        try {
            if (!window.firebase || !window.firebase.auth) return null;
            if (!window.firebase.apps || window.firebase.apps.length === 0) {
                if (typeof window.firebase.initializeApp === 'function') {
                    window.firebase.initializeApp(FIREBASE_CONFIG);
                } else {
                    return null;
                }
            }
            return window.firebase.auth();
        } catch (e) { return null; }
    }

    function _getFirestore() {
        try {
            if (!window.firebase || !window.firebase.firestore) return null;
            if (!window.firebase.apps || window.firebase.apps.length === 0) return null;
            return window.firebase.firestore();
        } catch (e) { return null; }
    }

    function _saveSession(data) {
        try {
            if (!CONFIG_READY()) return;
            var keys = window.CRM_Config.app.storageKeys;
            if (data.token) localStorage.setItem(keys.AUTH_TOKEN, data.token);
            if (data.refreshToken) localStorage.setItem(keys.AUTH_REFRESH_TOKEN, data.refreshToken);
            if (data.user) localStorage.setItem(keys.USER_DATA, JSON.stringify(data.user));
            if (data.tenant) localStorage.setItem(keys.TENANT_DATA, JSON.stringify(data.tenant));
        } catch (e) {}
    }

    function _loadSession() {
        try {
            if (!CONFIG_READY()) return null;
            var keys = window.CRM_Config.app.storageKeys;
            var token = localStorage.getItem(keys.AUTH_TOKEN);
            var userData = localStorage.getItem(keys.USER_DATA);
            var tenantData = localStorage.getItem(keys.TENANT_DATA);
            if (token && userData) {
                return { token: token, user: JSON.parse(userData), tenant: tenantData ? JSON.parse(tenantData) : null };
            }
            return null;
        } catch (e) { return null; }
    }

    function _clearSession() {
        try {
            if (CONFIG_READY()) {
                var keys = window.CRM_Config.app.storageKeys;
                localStorage.removeItem(keys.AUTH_TOKEN);
                localStorage.removeItem(keys.AUTH_REFRESH_TOKEN);
                localStorage.removeItem(keys.USER_DATA);
                localStorage.removeItem(keys.TENANT_DATA);
                localStorage.removeItem(keys.LAST_MODULE);
            }
            _currentUser = null;
            _userProfile = null;
            _tenantData = null;
            _isAuthenticated = false;
            _authState = AUTH_STATES.UNAUTHENTICATED;
        } catch (e) {}
    }

    function _isTokenExpired(token) {
        try {
            var payload = JSON.parse(atob(token.split('.')[1]));
            return Date.now() >= ((payload.exp * 1000) - TOKEN_REFRESH_BUFFER);
        } catch (e) { return true; }
    }

    async function _getIdToken(forceRefresh) {
        try {
            var auth = _getAuth();
            if (auth && auth.currentUser) {
                return await auth.currentUser.getIdToken(!!forceRefresh);
            }
            var session = _loadSession();
            if (session && session.token) {
                if (_isTokenExpired(session.token)) return await refreshToken();
                return session.token;
            }
            return null;
        } catch (e) { return null; }
    }

    function _setupTokenRefresh() {
        try {
            if (_tokenRefreshId) clearInterval(_tokenRefreshId);
            _tokenRefreshId = setInterval(async function() {
                try { await _getIdToken(true); } catch (e) {}
            }, TOKEN_REFRESH_BUFFER);
        } catch (e) {}
    }

    function _setupSessionTimeout() {
        try {
            if (_sessionTimeoutId) clearTimeout(_sessionTimeoutId);
            _sessionTimeoutId = setTimeout(function() { logout('Session expired.'); }, SESSION_TIMEOUT);
        } catch (e) {}
    }

    function _setupInactivityDetection() {
        try {
            var resetInactivity = function() {
                if (_inactivityTimeoutId) clearTimeout(_inactivityTimeoutId);
                _inactivityTimeoutId = setTimeout(function() { logout('Inactivity logout.'); }, INACTIVITY_TIMEOUT);
            };
            ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'].forEach(function(evt) {
                document.addEventListener(evt, resetInactivity, { passive: true });
            });
            resetInactivity();
        } catch (e) {}
    }

    function _notifyListeners() {
        var state = {
            isAuthenticated: _isAuthenticated,
            authState: _authState,
            user: _userProfile,
            tenant: _tenantData,
            currentUser: _currentUser,
        };
        _authListeners.forEach(function(fn) { try { fn(state); } catch (e) {} });
    }

    async function _fetchUserProfile(uid) {
        try {
            var db = _getFirestore();
            if (!db) {
                var session = _loadSession();
                return session ? session.user : null;
            }
            var col = CONFIG_READY() ? window.CRM_Config.firebase.collections.USERS : 'users';
            var doc = await db.collection(col).doc(uid).get();
            if (doc.exists) {
                var data = Object.assign({ id: doc.id }, doc.data());
                return data;
            }
            return null;
        } catch (e) {
            var s = _loadSession();
            return s ? s.user : null;
        }
    }

    async function _createUserProfile(firebaseUser) {
        try {
            var db = _getFirestore();
            if (!db) return null;
            var col = CONFIG_READY() ? window.CRM_Config.firebase.collections.USERS : 'users';
            var defaultAccess = CONFIG_READY() ? window.CRM_Config.tenants.defaultModuleAccess : ['DASHBOARD', 'LEADS', 'PIPELINE', 'CLIENTS'];
            var userData = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || '',
                phoneNumber: firebaseUser.phoneNumber || '',
                photoURL: firebaseUser.photoURL || '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                approvalStatus: 'pending',
                status: 'active',
                role: 'EXECUTIVE',
                tenantId: null,
                permissions: [],
                moduleAccess: defaultAccess,
                lastLoginAt: null,
                loginCount: 0,
                metadata: { platform: navigator.platform || '', language: navigator.language || '' },
            };
            await db.collection(col).doc(firebaseUser.uid).set(userData);
            _userProfile = userData;
            return userData;
        } catch (e) { return null; }
    }

    async function _updateUserProfile(uid, updates) {
        try {
            var db = _getFirestore();
            if (!db) return;
            var col = CONFIG_READY() ? window.CRM_Config.firebase.collections.USERS : 'users';
            updates.updatedAt = new Date().toISOString();
            await db.collection(col).doc(uid).update(updates);
            if (_userProfile && _userProfile.uid === uid) Object.assign(_userProfile, updates);
        } catch (e) {}
    }

    async function _fetchTenantData(tenantId) {
        try {
            var db = _getFirestore();
            if (!db) {
                var session = _loadSession();
                return session ? session.tenant : null;
            }
            var col = CONFIG_READY() ? window.CRM_Config.firebase.collections.TENANTS : 'tenants';
            var doc = await db.collection(col).doc(tenantId).get();
            if (doc.exists) return Object.assign({ id: doc.id }, doc.data());
            return null;
        } catch (e) {
            var s = _loadSession();
            return s ? s.tenant : null;
        }
    }

    async function _handleAuthStateChange(firebaseUser) {
        try {
            if (firebaseUser) {
                _currentUser = firebaseUser;
                var profile = await _fetchUserProfile(firebaseUser.uid);
                if (profile) {
                    _userProfile = profile;
                    if (profile.approvalStatus === 'pending') {
                        _authState = AUTH_STATES.PENDING_APPROVAL;
                        _isAuthenticated = false;
                        _notifyListeners();
                        return;
                    }
                    if (profile.status === 'suspended') {
                        _authState = AUTH_STATES.SUSPENDED;
                        _isAuthenticated = false;
                        _notifyListeners();
                        return;
                    }
                    if (profile.tenantId) _tenantData = await _fetchTenantData(profile.tenantId);
                    _authState = AUTH_STATES.AUTHENTICATED;
                    _isAuthenticated = true;
                    _setupTokenRefresh();
                    _setupSessionTimeout();
                    _setupInactivityDetection();
                } else {
                    await _createUserProfile(firebaseUser);
                    _authState = AUTH_STATES.PENDING_APPROVAL;
                    _isAuthenticated = false;
                }
            } else {
                _clearSession();
                _authState = AUTH_STATES.UNAUTHENTICATED;
                _isAuthenticated = false;
            }
            _notifyListeners();
        } catch (e) {
            _authState = AUTH_STATES.ERROR;
            _isAuthenticated = false;
            _notifyListeners();
        }
    }

    function _isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function _handleAuthError(error) {
        var message = 'An unexpected error occurred.';
        var errorCode = 'UNKNOWN';
        if (error && error.code) {
            switch (error.code) {
                case 'auth/email-already-in-use': message = 'Email already registered.'; errorCode = 'EMAIL_EXISTS'; break;
                case 'auth/invalid-email': message = 'Invalid email address.'; errorCode = 'INVALID_EMAIL'; break;
                case 'auth/weak-password': message = 'Password too weak. Use 6+ characters.'; errorCode = 'WEAK_PASSWORD'; break;
                case 'auth/user-not-found': message = 'No account found.'; errorCode = 'USER_NOT_FOUND'; break;
                case 'auth/wrong-password': message = 'Incorrect password.'; errorCode = 'WRONG_PASSWORD'; break;
                case 'auth/user-disabled': message = 'Account disabled.'; errorCode = 'USER_DISABLED'; break;
                case 'auth/too-many-requests': message = 'Too many attempts. Wait and retry.'; errorCode = 'RATE_LIMITED'; break;
                case 'auth/network-request-failed': message = 'Network error. Check connection.'; errorCode = 'NETWORK_ERROR'; break;
                case 'auth/popup-closed-by-user': message = 'Sign-in cancelled.'; errorCode = 'POPUP_CLOSED'; break;
                case 'auth/invalid-verification-code': message = 'Invalid OTP.'; errorCode = 'INVALID_OTP'; break;
                case 'auth/requires-recent-login': message = 'Please re-login for this action.'; errorCode = 'REAUTH_REQUIRED'; break;
                default: message = error.message || message; errorCode = error.code;
            }
        }
        return { success: false, message: message, error: errorCode };
    }

    async function init() {
        try {
            _authState = AUTH_STATES.LOADING;
            _notifyListeners();
            var auth = _getAuth();
            if (auth) {
                auth.onAuthStateChanged(_handleAuthStateChange);
                if (!auth.currentUser) {
                    var session = _loadSession();
                    if (session && session.user) {
                        _userProfile = session.user;
                        _tenantData = session.tenant;
                        _isAuthenticated = true;
                        _authState = AUTH_STATES.AUTHENTICATED;
                        _setupTokenRefresh();
                        _setupSessionTimeout();
                        _setupInactivityDetection();
                        _notifyListeners();
                    } else {
                        _authState = AUTH_STATES.UNAUTHENTICATED;
                        _notifyListeners();
                    }
                }
            } else {
                var s = _loadSession();
                if (s && s.user) {
                    _userProfile = s.user;
                    _tenantData = s.tenant;
                    _isAuthenticated = true;
                    _authState = AUTH_STATES.AUTHENTICATED;
                } else {
                    _authState = AUTH_STATES.UNAUTHENTICATED;
                }
                _notifyListeners();
            }
        } catch (e) {
            _authState = AUTH_STATES.ERROR;
            _notifyListeners();
        }
    }

    async function register(email, password, displayName, extraData) {
        extraData = extraData || {};
        try {
            if (!email || !password || !displayName) return { success: false, message: 'All fields required.', error: 'VALIDATION_ERROR' };
            if (password.length < 6) return { success: false, message: 'Password 6+ characters.', error: 'WEAK_PASSWORD' };
            if (!_isValidEmail(email)) return { success: false, message: 'Valid email required.', error: 'INVALID_EMAIL' };
            var auth = _getAuth();
            if (!auth) {
                var mockUser = { uid: 'user_' + Date.now(), email: email, displayName: displayName };
                await _createUserProfile(mockUser);
                _authState = AUTH_STATES.PENDING_APPROVAL;
                _notifyListeners();
                return { success: true, message: 'Registration submitted. Awaiting approval.', requiresApproval: true };
            }
            var userCredential = await auth.createUserWithEmailAndPassword(email, password);
            var firebaseUser = userCredential.user;
            await firebaseUser.updateProfile({ displayName: displayName });
            await _createUserProfile({ uid: firebaseUser.uid, email: email, displayName: displayName, phoneNumber: extraData.phone || '' });
            if (!firebaseUser.emailVerified) {
                await firebaseUser.sendEmailVerification().catch(function() {});
            }
            _authState = AUTH_STATES.PENDING_APPROVAL;
            _notifyListeners();
            var requiresApproval = CONFIG_READY() ? window.CRM_Config.tenants.registrationApprovalRequired : true;
            return { success: true, message: requiresApproval ? 'Registration submitted. Awaiting approval.' : 'Account created! Verify your email.', requiresApproval: requiresApproval };
        } catch (e) { return _handleAuthError(e); }
    }

    async function login(email, password, rememberMe) {
        try {
            if (!email || !password) return { success: false, message: 'Email and password required.', error: 'VALIDATION_ERROR' };
            var auth = _getAuth();
            if (!auth) {
                var mockUser = { uid: 'user_' + Date.now(), email: email, displayName: email.split('@')[0], approvalStatus: 'approved', role: 'TENANT_ADMIN' };
                var mockTenant = { id: 'tenant_mock', name: 'Demo Org', plan: 'free' };
                _userProfile = mockUser;
                _tenantData = mockTenant;
                _isAuthenticated = true;
                _authState = AUTH_STATES.AUTHENTICATED;
                _saveSession({ token: 'mock_' + Date.now(), user: mockUser, tenant: mockTenant });
                _setupSessionTimeout();
                _setupInactivityDetection();
                _notifyListeners();
                return { success: true, message: 'Welcome (Demo Mode).' };
            }
            var userCredential = await auth.signInWithEmailAndPassword(email, password);
            var firebaseUser = userCredential.user;
            var profile = await _fetchUserProfile(firebaseUser.uid);
            if (!profile) {
                await auth.signOut();
                return { success: false, message: 'Profile not found.', error: 'PROFILE_NOT_FOUND' };
            }
            if (profile.approvalStatus === 'pending') {
                await auth.signOut();
                _authState = AUTH_STATES.PENDING_APPROVAL;
                _notifyListeners();
                return { success: false, message: 'Account pending approval.', error: 'PENDING_APPROVAL' };
            }
            if (profile.status === 'suspended') {
                await auth.signOut();
                return { success: false, message: 'Account suspended.', error: 'ACCOUNT_SUSPENDED' };
            }
            var tenant = null;
            if (profile.tenantId) tenant = await _fetchTenantData(profile.tenantId);
            await _updateUserProfile(firebaseUser.uid, { lastLoginAt: new Date().toISOString(), loginCount: (profile.loginCount || 0) + 1 });
            _currentUser = firebaseUser;
            _userProfile = profile;
            _tenantData = tenant;
            _isAuthenticated = true;
            _authState = AUTH_STATES.AUTHENTICATED;
            var token = await firebaseUser.getIdToken();
            _saveSession({ token: token, refreshToken: firebaseUser.refreshToken, user: profile, tenant: tenant });
            _setupTokenRefresh();
            _setupSessionTimeout();
            _setupInactivityDetection();
            _notifyListeners();
            return { success: true, message: 'Welcome back!' };
        } catch (e) { return _handleAuthError(e); }
    }

    async function loginWithGoogle() {
        try {
            var auth = _getAuth();
            if (!auth) return { success: false, message: 'Service unavailable.', error: 'SERVICE_UNAVAILABLE' };
            var provider = new window.firebase.auth.GoogleAuthProvider();
            provider.addScope('email');
            provider.addScope('profile');
            await auth.signInWithPopup(provider);
            return { success: true, message: 'Google login successful.' };
        } catch (e) { return _handleAuthError(e); }
    }

    async function loginWithPhone(phoneNumber, verifierCallback) {
        try {
            var auth = _getAuth();
            if (!auth) return { success: false, message: 'Service unavailable.', error: 'SERVICE_UNAVAILABLE' };
            var confirmationResult = await auth.signInWithPhoneNumber(phoneNumber, verifierCallback());
            window._phoneConfirmationResult = confirmationResult;
            return { success: true, message: 'OTP sent.', verificationId: confirmationResult.verificationId };
        } catch (e) { return _handleAuthError(e); }
    }

    async function verifyPhoneOTP(otp) {
        try {
            if (!window._phoneConfirmationResult) return { success: false, message: 'No pending OTP.', error: 'NO_OTP_PENDING' };
            await window._phoneConfirmationResult.confirm(otp);
            delete window._phoneConfirmationResult;
            return { success: true, message: 'Phone verified.' };
        } catch (e) { return _handleAuthError(e); }
    }

    async function logout(message) {
        try {
            var auth = _getAuth();
            if (auth) await auth.signOut().catch(function() {});
            if (_tokenRefreshId) clearInterval(_tokenRefreshId);
            if (_sessionTimeoutId) clearTimeout(_sessionTimeoutId);
            if (_inactivityTimeoutId) clearTimeout(_inactivityTimeoutId);
            _clearSession();
            _notifyListeners();
            var landingUrl = CONFIG_READY() ? window.CRM_Config.app.landingUrl : 'index.html';
            window.location.href = landingUrl;
        } catch (e) {
            _clearSession();
            window.location.href = 'index.html';
        }
    }

    async function refreshToken() {
        try {
            var auth = _getAuth();
            if (auth && auth.currentUser) {
                var token = await auth.currentUser.getIdToken(true);
                _saveSession({ token: token });
                return token;
            }
            return null;
        } catch (e) { return null; }
    }

    async function resetPassword(email) {
        try {
            if (!_isValidEmail(email)) return { success: false, message: 'Valid email required.', error: 'INVALID_EMAIL' };
            var auth = _getAuth();
            if (!auth) return { success: false, message: 'Service unavailable.', error: 'SERVICE_UNAVAILABLE' };
            await auth.sendPasswordResetEmail(email);
            return { success: true, message: 'Reset link sent.' };
        } catch (e) { return _handleAuthError(e); }
    }

    async function changePassword(currentPassword, newPassword) {
        try {
            if (newPassword.length < 6) return { success: false, message: 'Password 6+ characters.', error: 'WEAK_PASSWORD' };
            var auth = _getAuth();
            if (!auth || !auth.currentUser) return { success: false, message: 'Not authenticated.', error: 'NOT_AUTHENTICATED' };
            var credential = window.firebase.auth.EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
            await auth.currentUser.reauthenticateWithCredential(credential);
            await auth.currentUser.updatePassword(newPassword);
            return { success: true, message: 'Password changed.' };
        } catch (e) { return _handleAuthError(e); }
    }

    function hasPermission(permission) {
        try {
            if (!_userProfile || !CONFIG_READY()) return false;
            var role = window.CRM_Config.getRole(_userProfile.role);
            if (!role) return false;
            if (role.level <= 1) return true;
            return role.permissions.indexOf(permission) !== -1 || role.permissions.indexOf('*') !== -1;
        } catch (e) { return false; }
    }

    function canAccessModule(moduleName) {
        try {
            if (!_userProfile) return false;
            if (CONFIG_READY()) {
                var role = window.CRM_Config.getRole(_userProfile.role);
                if (role && role.level <= 1) return true;
            }
            return _userProfile.moduleAccess && _userProfile.moduleAccess.indexOf(moduleName.toUpperCase()) !== -1;
        } catch (e) { return false; }
    }

    function hasMinRole(roleName) {
        try {
            if (!_userProfile || !CONFIG_READY()) return false;
            var userRole = window.CRM_Config.getRole(_userProfile.role);
            var requiredRole = window.CRM_Config.getRole(roleName);
            if (!userRole || !requiredRole) return false;
            return userRole.level <= requiredRole.level;
        } catch (e) { return false; }
    }

    function getUser() {
        if (_userProfile && _userProfile.uid && _userProfile.role) {
            return _userProfile;
        }
        try {
            if (CONFIG_READY()) {
                var cached = localStorage.getItem(window.CRM_Config.app.storageKeys.USER_DATA);
                if (cached) {
                    var p = JSON.parse(cached);
                    if (p && p.uid && p.role) {
                        return p;
                    }
                }
            }
        } catch(e) {}
        try {
            var cached2 = localStorage.getItem('crm_user');
            if (cached2) {
                var p2 = JSON.parse(cached2);
                if (p2 && p2.uid && p2.role) {
                    return p2;
                }
            }
        } catch(e) {}
        return _userProfile;
    }

    function getTenant() { return _tenantData; }
    function isAuthenticated() { return _isAuthenticated; }
    function getAuthState() { return _authState; }
    function getUserRole() { return _userProfile ? _userProfile.role : null; }
    function getTenantId() { return _tenantData ? _tenantData.id : (_userProfile ? _userProfile.tenantId : null); }
    function getCurrentUser() { return _currentUser; }

    function onAuthStateChange(listener) {
        _authListeners.push(listener);
        if (_currentUser || _userProfile) {
            listener({ isAuthenticated: _isAuthenticated, authState: _authState, user: _userProfile, tenant: _tenantData });
        }
        return function() { var i = _authListeners.indexOf(listener); if (i > -1) _authListeners.splice(i, 1); };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { init().catch(function() {}); });
    } else {
        init().catch(function() {});
    }

    return {
        AUTH_STATES: AUTH_STATES,
        init: init, register: register, login: login, loginWithGoogle: loginWithGoogle,
        loginWithPhone: loginWithPhone, verifyPhoneOTP: verifyPhoneOTP, logout: logout,
        refreshToken: refreshToken, resetPassword: resetPassword, changePassword: changePassword,
        hasPermission: hasPermission, canAccessModule: canAccessModule, hasMinRole: hasMinRole,
        getUser: getUser, getTenant: getTenant, isAuthenticated: isAuthenticated,
        getAuthState: getAuthState, getUserRole: getUserRole, getTenantId: getTenantId,
        onAuthStateChange: onAuthStateChange, getIdToken: _getIdToken, getCurrentUser: getCurrentUser,
    };
})();

window.CRM_Auth = CRM_Auth;
if (typeof module !== 'undefined' && module.exports) module.exports = CRM_Auth;
