/**
 * 11 Avatar SMEs CRM — Firestore Service Layer
 * @file js/core/firestore.js
 */
'use strict';

const CRM_Firestore = (function() {
    'use strict';

    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyBZDaHJSt-4AV6EJYG76p8kcsIHf6LOxdU",
        authDomain: "avatar-wa-dual-crm.firebaseapp.com",
        projectId: "avatar-wa-dual-crm",
        storageBucket: "avatar-wa-dual-crm.firebasestorage.app",
        messagingSenderId: "946959261009",
        appId: "1:946959261009:web:175f5390d63715f1f8c770"
    };

    let _db = null;
    let _available = false;
    let _isOnline = navigator.onLine;
    const _offlineQueue = [];
    let _processingQueue = false;
    const _activeListeners = new Map();
    const _cache = new Map();
    let _pendingBatch = null;
    const MAX_OFFLINE_QUEUE = 500;
    const CACHE_TTL = 300000;
    const MAX_BATCH_SIZE = 500;
    const DEFAULT_PAGE_SIZE = 25;

    async function init() {
        try {
            if (window.firebase && typeof window.firebase.initializeApp === 'function') {
                if (!window.firebase.apps || window.firebase.apps.length === 0) {
                    window.firebase.initializeApp(FIREBASE_CONFIG);
                }
            } else {
                _available = false;
                return false;
            }
            if (!window.firebase.firestore) {
                _available = false;
                return false;
            }
            _db = window.firebase.firestore();
            try {
                await _db.enablePersistence({ synchronizeTabs: true });
            } catch (err) {
                if (err.code === 'failed-precondition') {
                    console.log('[Firestore] Multiple tabs — persistence already active.');
                } else if (err.code === 'unimplemented') {
                    console.log('[Firestore] Browser does not support offline persistence.');
                }
            }
            window.addEventListener('online', _handleOnline);
            window.addEventListener('offline', _handleOffline);
            _available = true;
            _isOnline = navigator.onLine;
            if (_isOnline && _offlineQueue.length > 0) {
                await processOfflineQueue();
            }
            return true;
        } catch (e) {
            _available = false;
            return false;
        }
    }

    async function _handleOnline() {
        _isOnline = true;
        await processOfflineQueue();
    }

    function _handleOffline() {
        _isOnline = false;
    }

    function _configReady() {
        return typeof window.CRM_Config !== 'undefined' && window.CRM_Config.app && window.CRM_Config.app.storageKeys;
    }

    function _getTenantId() {
        try {
            if (window.CRM_Tenant && window.CRM_Tenant.getTenantId) {
                return window.CRM_Tenant.getTenantId();
            }
            if (window.CRM_Auth && window.CRM_Auth.getTenantId) {
                return window.CRM_Auth.getTenantId();
            }
            if (_configReady()) {
                var cached = localStorage.getItem(window.CRM_Config.app.storageKeys.TENANT_DATA);
                if (cached) {
                    try {
                        var t = JSON.parse(cached);
                        return t.id || null;
                    } catch (e) {
                        return null;
                    }
                }
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    function _getCurrentUid() {
        try {
            if (window.CRM_Auth && window.CRM_Auth.getCurrentUser) {
                var u = window.CRM_Auth.getCurrentUser();
                return u ? u.uid : null;
            }
            if (window.firebase && window.firebase.auth && window.firebase.auth().currentUser) {
                return window.firebase.auth().currentUser.uid;
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    function _addTenantContext(data) {
        var tenantId = _getTenantId();
        var uid = _getCurrentUid();
        var now = new Date().toISOString();
        var result = {};
        for (var key in data) {
            if (data.hasOwnProperty(key)) {
                result[key] = data[key];
            }
        }
        result.tenantId = result.tenantId || tenantId;
        result.createdBy = result.createdBy || uid;
        result.createdAt = result.createdAt || now;
        result.updatedBy = uid;
        result.updatedAt = now;
        return result;
    }

    function _getCollection(collectionName) {
        if (!_db) {
            throw new Error('Firestore not initialized. Call CRM_Firestore.init() first.');
        }
        return _db.collection(collectionName);
    }

    function _cacheKey(collection, docId, query) {
        var tenantPart = _getTenantId() || 'anonymous';
        var key = tenantPart + '_' + collection;
        if (docId) {
            key += '_' + docId;
        }
        if (query) {
            try {
                key += '_' + JSON.stringify(query);
            } catch (e) {}
        }
        return key;
    }

    function _getFromCache(key) {
        var cached = _cache.get(key);
        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
            return cached.data;
        }
        if (cached) {
            _cache.delete(key);
        }
        return null;
    }

    function _setCache(key, data) {
        _cache.set(key, { data: data, timestamp: Date.now() });
        if (_cache.size > 200) {
            var keys = _cache.keys();
            for (var i = 0; i < 50; i++) {
                var k = keys.next();
                if (k.done) break;
                _cache.delete(k.value);
            }
        }
    }

    function invalidateCache(collection) {
        var prefix = (_getTenantId() || 'anonymous') + '_' + collection;
        var keysToDelete = [];
        _cache.forEach(function(val, key) {
            if (key.indexOf(prefix) === 0) {
                keysToDelete.push(key);
            }
        });
        keysToDelete.forEach(function(k) {
            _cache.delete(k);
        });
    }

    function clearAllCache() {
        _cache.clear();
    }

    async function getDocument(collection, docId, options) {
        options = options || {};
        try {
            if (!_available) {
                return _getFromCache(_cacheKey(collection, docId));
            }
            if (!options.bypassCache) {
                var cached = _getFromCache(_cacheKey(collection, docId));
                if (cached) {
                    return cached;
                }
            }
            var doc = await _getCollection(collection).doc(docId).get();
            if (!doc.exists) {
                return null;
            }
            var data = Object.assign({ id: doc.id }, doc.data());
            if (data.tenantId && data.tenantId !== _getTenantId()) {
                return null;
            }
            if (!options.includeDeleted && data._deleted) {
                return null;
            }
            _setCache(_cacheKey(collection, docId), data);
            return data;
        } catch (e) {
            return _getFromCache(_cacheKey(collection, docId));
        }
    }

    async function createDocument(collection, data) {
        try {
            var docData = _addTenantContext(data);
            var docRef = _getCollection(collection).doc();
            var now = new Date().toISOString();
            var finalData = {};
            for (var key in docData) {
                if (docData.hasOwnProperty(key)) {
                    finalData[key] = docData[key];
                }
            }
            finalData.id = docRef.id;
            finalData.createdAt = finalData.createdAt || now;
            finalData.updatedAt = now;
            if (_isOnline && _available) {
                await docRef.set(finalData);
                invalidateCache(collection);
                _setCache(_cacheKey(collection, docRef.id), finalData);
                return finalData;
            } else {
                _addToOfflineQueue({
                    type: 'create',
                    collection: collection,
                    docId: docRef.id,
                    data: finalData
                });
                _setCache(_cacheKey(collection, docRef.id), finalData);
                return finalData;
            }
        } catch (e) {
            throw e;
        }
    }

    async function setDocument(collection, docId, data) {
        try {
            var docData = _addTenantContext(data);
            var now = new Date().toISOString();
            var finalData = {};
            for (var key in docData) {
                if (docData.hasOwnProperty(key)) {
                    finalData[key] = docData[key];
                }
            }
            finalData.id = docId;
            finalData.updatedAt = now;
            if (_isOnline && _available) {
                await _getCollection(collection).doc(docId).set(finalData, { merge: true });
                invalidateCache(collection);
                _setCache(_cacheKey(collection, docId), finalData);
                return finalData;
            } else {
                _addToOfflineQueue({
                    type: 'set',
                    collection: collection,
                    docId: docId,
                    data: finalData
                });
                _setCache(_cacheKey(collection, docId), finalData);
                return finalData;
            }
        } catch (e) {
            throw e;
        }
    }

    async function updateDocument(collection, docId, updates) {
        try {
            var updateData = {};
            for (var key in updates) {
                if (updates.hasOwnProperty(key)) {
                    updateData[key] = updates[key];
                }
            }
            updateData.updatedBy = _getCurrentUid();
            updateData.updatedAt = new Date().toISOString();
            if (_isOnline && _available) {
                await _getCollection(collection).doc(docId).update(updateData);
                invalidateCache(collection);
                var cached = _getFromCache(_cacheKey(collection, docId));
                if (cached) {
                    var merged = {};
                    for (var k in cached) {
                        if (cached.hasOwnProperty(k)) {
                            merged[k] = cached[k];
                        }
                    }
                    for (var uk in updateData) {
                        if (updateData.hasOwnProperty(uk)) {
                            merged[uk] = updateData[uk];
                        }
                    }
                    _setCache(_cacheKey(collection, docId), merged);
                    return merged;
                }
                var result = { id: docId };
                for (var uk2 in updateData) {
                    if (updateData.hasOwnProperty(uk2)) {
                        result[uk2] = updateData[uk2];
                    }
                }
                return result;
            } else {
                _addToOfflineQueue({
                    type: 'update',
                    collection: collection,
                    docId: docId,
                    data: updateData
                });
                var c2 = _getFromCache(_cacheKey(collection, docId));
                var m2 = {};
                if (c2) {
                    for (var ck in c2) {
                        if (c2.hasOwnProperty(ck)) {
                            m2[ck] = c2[ck];
                        }
                    }
                }
                for (var uk3 in updateData) {
                    if (updateData.hasOwnProperty(uk3)) {
                        m2[uk3] = updateData[uk3];
                    }
                }
                m2.id = docId;
                _setCache(_cacheKey(collection, docId), m2);
                return m2;
            }
        } catch (e) {
            throw e;
        }
    }

    async function deleteDocument(collection, docId, hardDelete) {
        try {
            if (hardDelete) {
                if (_isOnline && _available) {
                    await _getCollection(collection).doc(docId).delete();
                    _cache.delete(_cacheKey(collection, docId));
                    invalidateCache(collection);
                } else {
                    _addToOfflineQueue({
                        type: 'hardDelete',
                        collection: collection,
                        docId: docId
                    });
                }
            } else {
                await updateDocument(collection, docId, {
                    _deleted: true,
                    _deletedAt: new Date().toISOString(),
                    _deletedBy: _getCurrentUid()
                });
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    async function restoreDocument(collection, docId) {
        return await updateDocument(collection, docId, {
            _deleted: false,
            _deletedAt: null,
            _deletedBy: null,
            _restoredAt: new Date().toISOString(),
            _restoredBy: _getCurrentUid()
        });
    }

    async function queryDocuments(collection, options) {
        options = options || {};
        try {
            var filters = options.filters || [];
            var orderBy = options.orderBy || 'createdAt';
            var orderDir = options.orderDir || 'desc';
            var limit = options.limit || DEFAULT_PAGE_SIZE;
            var startAfter = options.startAfter || null;
            var includeDeleted = options.includeDeleted || false;
            var bypassCache = options.bypassCache || false;

            var cacheKey = _cacheKey(collection, null, {
                f: filters,
                o: orderBy,
                d: orderDir,
                l: limit
            });

            if (!bypassCache && !startAfter) {
                var cached = _getFromCache(cacheKey);
                if (cached) {
                    return cached;
                }
            }

            var query = _getCollection(collection);
            var tenantId = _getTenantId();

            if (tenantId) {
                query = query.where('tenantId', '==', tenantId);
            }

            if (!includeDeleted) {
                query = query.where('_deleted', '==', false);
            }

            for (var i = 0; i < filters.length; i++) {
                query = query.where(filters[i][0], filters[i][1], filters[i][2]);
            }

            query = query.orderBy(orderBy, orderDir).limit(limit + 1);

            if (startAfter) {
                query = query.startAfter(startAfter);
            }

            if (!_available && !_isOnline) {
                var offlineCached = _getFromCache(cacheKey);
                return offlineCached || { data: [], hasMore: false, lastDoc: null, total: 0 };
            }

            var snapshot = await query.get();
            var docs = [];
            snapshot.docs.forEach(function(doc) {
                docs.push(Object.assign({ id: doc.id }, doc.data()));
            });

            var hasMore = docs.length > limit;
            var data = hasMore ? docs.slice(0, limit) : docs;
            var lastDoc = hasMore ? snapshot.docs[limit - 1] : null;
            var result = { data: data, hasMore: hasMore, lastDoc: lastDoc, total: data.length };

            _setCache(cacheKey, result);
            return result;
        } catch (e) {
            return { data: [], hasMore: false, lastDoc: null, total: 0 };
        }
    }

    async function getAllDocuments(collection, options) {
        try {
            var allData = [];
            var lastDoc = null;
            var hasMore = true;
            while (hasMore) {
                var opts = {};
                if (options) {
                    for (var key in options) {
                        if (options.hasOwnProperty(key)) {
                            opts[key] = options[key];
                        }
                    }
                }
                opts.startAfter = lastDoc;
                opts.limit = 100;
                var result = await queryDocuments(collection, opts);
                allData = allData.concat(result.data);
                hasMore = result.hasMore;
                lastDoc = result.lastDoc;
            }
            return allData;
        } catch (e) {
            return [];
        }
    }

    async function countDocuments(collection, filters) {
        filters = filters || [];
        try {
            var query = _getCollection(collection);
            var tenantId = _getTenantId();
            if (tenantId) {
                query = query.where('tenantId', '==', tenantId);
            }
            query = query.where('_deleted', '==', false);
            for (var i = 0; i < filters.length; i++) {
                query = query.where(filters[i][0], filters[i][1], filters[i][2]);
            }
            var snapshot = await query.count().get();
            return snapshot.data().count;
        } catch (e) {
            return 0;
        }
    }

    function startBatch() {
        if (_pendingBatch) {
            return;
        }
        _pendingBatch = _db.batch();
    }

    function batchCreate(collection, data, docId) {
        if (!_pendingBatch) {
            startBatch();
        }
        var docData = _addTenantContext(data);
        var docRef = docId ? _getCollection(collection).doc(docId) : _getCollection(collection).doc();
        _pendingBatch.set(docRef, docData);
    }

    function batchUpdate(collection, docId, updates) {
        if (!_pendingBatch) {
            startBatch();
        }
        var updateData = {};
        for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
                updateData[key] = updates[key];
            }
        }
        updateData.updatedBy = _getCurrentUid();
        updateData.updatedAt = new Date().toISOString();
        _pendingBatch.update(_getCollection(collection).doc(docId), updateData);
    }

    function batchDelete(collection, docId) {
        if (!_pendingBatch) {
            startBatch();
        }
        _pendingBatch.delete(_getCollection(collection).doc(docId));
    }

    async function commitBatch() {
        try {
            if (!_pendingBatch) {
                return false;
            }
            await _pendingBatch.commit();
            _pendingBatch = null;
            clearAllCache();
            return true;
        } catch (e) {
            _pendingBatch = null;
            return false;
        }
    }

    function cancelBatch() {
        _pendingBatch = null;
    }

    function onDocumentSnapshot(collection, docId, callback) {
        try {
            var listenerId = 'doc_' + collection + '_' + docId;
            if (_activeListeners.has(listenerId)) {
                try {
                    _activeListeners.get(listenerId)();
                } catch (e) {}
            }
            var unsubscribe = _getCollection(collection).doc(docId).onSnapshot(
                function(doc) {
                    if (doc.exists) {
                        var data = Object.assign({ id: doc.id }, doc.data());
                        _setCache(_cacheKey(collection, docId), data);
                        callback(data);
                    } else {
                        callback(null);
                    }
                },
                function() {
                    callback(null);
                }
            );
            _activeListeners.set(listenerId, unsubscribe);
            return function() {
                unsubscribe();
                _activeListeners.delete(listenerId);
            };
        } catch (e) {
            return function() {};
        }
    }

    function onQuerySnapshot(collection, callback, options) {
        options = options || {};
        try {
            var listenerId = 'query_' + collection + '_' + JSON.stringify(options);
            if (_activeListeners.has(listenerId)) {
                try {
                    _activeListeners.get(listenerId)();
                } catch (e) {}
            }
            var filters = options.filters || [];
            var orderBy = options.orderBy || 'createdAt';
            var orderDir = options.orderDir || 'desc';
            var limit = options.limit || 100;
            var query = _getCollection(collection);
            var tenantId = _getTenantId();
            if (tenantId) {
                query = query.where('tenantId', '==', tenantId);
            }
            query = query.where('_deleted', '==', false);
            for (var i = 0; i < filters.length; i++) {
                query = query.where(filters[i][0], filters[i][1], filters[i][2]);
            }
            query = query.orderBy(orderBy, orderDir).limit(limit);
            var unsubscribe = query.onSnapshot(
                function(snapshot) {
                    var data = [];
                    snapshot.docs.forEach(function(doc) {
                        data.push(Object.assign({ id: doc.id }, doc.data()));
                    });
                    callback(data);
                },
                function() {
                    callback([]);
                }
            );
            _activeListeners.set(listenerId, unsubscribe);
            return function() {
                unsubscribe();
                _activeListeners.delete(listenerId);
            };
        } catch (e) {
            return function() {};
        }
    }

    function removeAllListeners() {
        _activeListeners.forEach(function(unsubscribe) {
            try {
                unsubscribe();
            } catch (e) {}
        });
        _activeListeners.clear();
    }

    function _addToOfflineQueue(operation) {
        if (_offlineQueue.length >= MAX_OFFLINE_QUEUE) {
            _offlineQueue.shift();
        }
        _offlineQueue.push({
            type: operation.type,
            collection: operation.collection,
            docId: operation.docId,
            data: operation.data,
            queuedAt: new Date().toISOString(),
            retryCount: 0
        });
        _saveOfflineQueue();
    }

    function _saveOfflineQueue() {
        try {
            if (_configReady()) {
                localStorage.setItem(
                    window.CRM_Config.app.storageKeys.OFFLINE_QUEUE,
                    JSON.stringify(_offlineQueue)
                );
            }
        } catch (e) {}
    }

    function _loadOfflineQueue() {
        try {
            if (_configReady()) {
                var saved = localStorage.getItem(window.CRM_Config.app.storageKeys.OFFLINE_QUEUE);
                if (saved) {
                    var parsed = JSON.parse(saved);
                    for (var i = 0; i < parsed.length; i++) {
                        _offlineQueue.push(parsed[i]);
                    }
                }
            }
        } catch (e) {}
    }

    async function processOfflineQueue() {
        if (_processingQueue || !_isOnline || _offlineQueue.length === 0) {
            return {
                processed: 0,
                failed: 0,
                remaining: _offlineQueue.length
            };
        }
        _processingQueue = true;
        var processed = 0;
        var failed = 0;
        var queueCopy = _offlineQueue.slice();
        _offlineQueue.length = 0;
        for (var i = 0; i < queueCopy.length; i++) {
            var op = queueCopy[i];
            try {
                switch (op.type) {
                    case 'create':
                        await _getCollection(op.collection).doc(op.docId).set(op.data);
                        break;
                    case 'set':
                        await _getCollection(op.collection).doc(op.docId).set(op.data, { merge: true });
                        break;
                    case 'update':
                        await _getCollection(op.collection).doc(op.docId).update(op.data);
                        break;
                    case 'hardDelete':
                        await _getCollection(op.collection).doc(op.docId).delete();
                        break;
                }
                processed++;
            } catch (e) {
                failed++;
                if ((op.retryCount || 0) < 3) {
                    _offlineQueue.push({
                        type: op.type,
                        collection: op.collection,
                        docId: op.docId,
                        data: op.data,
                        queuedAt: op.queuedAt,
                        retryCount: (op.retryCount || 0) + 1
                    });
                }
            }
        }
        _saveOfflineQueue();
        _processingQueue = false;
        return {
            processed: processed,
            failed: failed,
            remaining: _offlineQueue.length
        };
    }

    function getOfflineQueueStatus() {
        return {
            queueSize: _offlineQueue.length,
            isProcessing: _processingQueue,
            isOnline: _isOnline
        };
    }

    function clearOfflineQueue() {
        _offlineQueue.length = 0;
        _saveOfflineQueue();
    }

    function generateId(collection) {
        return _getCollection(collection).doc().id;
    }

    function isAvailable() {
        return _available;
    }

    function isOnline() {
        return _isOnline;
    }

    function getDb() {
        return _db;
    }

    function timestamp() {
        if (!_available) {
            return new Date().toISOString();
        }
        return window.firebase.firestore.FieldValue.serverTimestamp();
    }

    function increment(amount) {
        amount = amount || 1;
        if (!_available) {
            return amount;
        }
        return window.firebase.firestore.FieldValue.increment(amount);
    }

    function arrayUnion() {
        if (!_available) {
            return Array.prototype.slice.call(arguments);
        }
        return window.firebase.firestore.FieldValue.arrayUnion.apply(null, arguments);
    }

    function arrayRemove() {
        if (!_available) {
            return Array.prototype.slice.call(arguments);
        }
        return window.firebase.firestore.FieldValue.arrayRemove.apply(null, arguments);
    }

    function deleteField() {
        if (!_available) {
            return null;
        }
        return window.firebase.firestore.FieldValue.delete();
    }

    async function runTransaction(updateFn) {
        if (!_available) {
            throw new Error('Firestore not available.');
        }
        return await _db.runTransaction(updateFn);
    }

    _loadOfflineQueue();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            init().catch(function() {});
        });
    } else {
        setTimeout(function() {
            init().catch(function() {});
        }, 100);
    }

    return {
        init: init,
        isAvailable: isAvailable,
        isOnline: isOnline,
        getDb: getDb,
        getDocument: getDocument,
        createDocument: createDocument,
        setDocument: setDocument,
        updateDocument: updateDocument,
        deleteDocument: deleteDocument,
        restoreDocument: restoreDocument,
        queryDocuments: queryDocuments,
        getAllDocuments: getAllDocuments,
        countDocuments: countDocuments,
        startBatch: startBatch,
        batchCreate: batchCreate,
        batchUpdate: batchUpdate,
        batchDelete: batchDelete,
        commitBatch: commitBatch,
        cancelBatch: cancelBatch,
        onDocumentSnapshot: onDocumentSnapshot,
        onQuerySnapshot: onQuerySnapshot,
        removeAllListeners: removeAllListeners,
        processOfflineQueue: processOfflineQueue,
        getOfflineQueueStatus: getOfflineQueueStatus,
        clearOfflineQueue: clearOfflineQueue,
        invalidateCache: invalidateCache,
        clearAllCache: clearAllCache,
        generateId: generateId,
        timestamp: timestamp,
        increment: increment,
        arrayUnion: arrayUnion,
        arrayRemove: arrayRemove,
        deleteField: deleteField,
        runTransaction: runTransaction,
        MAX_BATCH_SIZE: MAX_BATCH_SIZE,
        DEFAULT_PAGE_SIZE: DEFAULT_PAGE_SIZE
    };
})();

window.CRM_Firestore = CRM_Firestore;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CRM_Firestore;
}
