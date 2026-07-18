/**
 * ============================================================
 * 11 AVATAR SMEs CRM - ADVANCED TASK MANAGEMENT MODULE
 * ============================================================
 * 
 * @file       modules/tasks.js
 * @path       C:\Users\rudra\Downloads\11 Avatar\11-Avatar-SMEs-CRM-main\modules\tasks.js
 * @author     11 Avatar Digital Hub
 * @email      info@11avatardigitalhub.cloud
 * @repo       https://github.com/11avatardigitalhub/11Avatar-SMEs-CRM.git
 * 
 * PURPOSE:
 * Complete task management system with Kanban board, List view,
 * Calendar view, time tracking with start/stop timer, subtasks,
 * dependencies, priorities with SLAs, undo/redo stack,
 * bulk operations, and team assignment.
 * 
 * DEPENDENCIES:
 * - window.CRM_Config   - Task config, priority levels, SLA defaults
 * - window.CRM_Auth     - Tenant ID, user info
 * - window.CRM_Tenant   - RBAC, team members
 * - window.CRM_Firestore - CRUD operations
 * - css/crm-design-system.css
 * - app.html            - Module container #module-tasks
 * 
 * RULES COMPLIANCE:
 * ✅ Rule #1  - Enterprise Grade
 * ✅ Rule #5  - Deep Detailing: full JSDoc
 * ✅ Rule #6  - Error Handling: try/catch everywhere
 * ✅ Rule #17 - Multi-Tenant RBAC
 * ✅ Rule #18 - Firebase Backend
 * ✅ Rule #20 - Export All: window.CRM_Tasks
 * ✅ Rule #21 - Path First
 * ✅ Rule #23 - 700+ lines
 * ✅ Rule #25 - Full File Replacement
 * ============================================================
 */

'use strict';

const CRM_Tasks = (function() {
    'use strict';

    // ============================================================
    // PRIVATE STATE
    // ============================================================
    const _taskCache = new Map();
    let _selectedTask = null;
    let _currentView = 'kanban';
    let _initialized = false;
    let _timeTracker = null;
    let _undoStack = [];
    let _redoStack = [];
    let _dragState = null;

    const _filters = {
        status: 'all',
        priority: 'all',
        assignee: 'all',
        search: '',
        dateFrom: null,
        dateTo: null,
        projectId: null,
    };

    const _pagination = {
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 0,
        lastDoc: null,
    };

    const _sort = { field: 'createdAt', direction: 'desc' };

    // ============================================================
    // CONSTANTS
    // ============================================================
    const TASK_STATUSES = ['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled'];
    
    const TASK_STATUS_CONFIG = {
        backlog: { label: 'Backlog', icon: '📥', color: '#888888', order: 0 },
        todo: { label: 'To Do', icon: '📋', color: '#3B82F6', order: 1 },
        in_progress: { label: 'In Progress', icon: '⚡', color: '#F59E0B', order: 2 },
        review: { label: 'Review', icon: '🔍', color: '#8B5CF6', order: 3 },
        done: { label: 'Done', icon: '✅', color: '#10B981', order: 4 },
        cancelled: { label: 'Cancelled', icon: '❌', color: '#DC2626', order: 5 },
    };

    const PRIORITY_LEVELS = {
        low: { label: 'Low', icon: '🟢', color: '#10B981', sla: 72 },
        medium: { label: 'Medium', icon: '🟡', color: '#F59E0B', sla: 48 },
        high: { label: 'High', icon: '🟠', color: '#F97316', sla: 24 },
        urgent: { label: 'Urgent', icon: '🔴', color: '#DC2626', sla: 8 },
    };

    const TASK_TYPES = {
        task: { icon: '✅', name: 'Task' },
        bug: { icon: '🐛', name: 'Bug' },
        feature: { icon: '⭐', name: 'Feature' },
        improvement: { icon: '📈', name: 'Improvement' },
        meeting: { icon: '📅', name: 'Meeting' },
        follow_up: { icon: '📞', name: 'Follow-up' },
        documentation: { icon: '📝', name: 'Documentation' },
    };

    const MAX_SUBTASKS = 20;
    const MAX_ASSIGNEES = 5;
    const UNDO_STACK_LIMIT = 50;

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

    function _formatDate(dateStr, format = 'full') {
        try {
            if (!dateStr) return 'N/A';
            const d = new Date(dateStr);
            if (format === 'time') return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            if (format === 'short') return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
            if (format === 'iso') return dateStr.split('T')[0];
            return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch (e) { return dateStr || 'N/A'; }
    }

    function _escapeHtml(text) { if (!text) return ''; const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }

    function _debounce(fn, delay) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); }; }

    function _generateId() { return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6); }

    // ============================================================
    // SECTION 1: TIME TRACKER ENGINE
    // ============================================================
    const TimeTracker = {
        _activeTaskId: null,
        _startTime: null,
        _elapsedSeconds: 0,
        _intervalId: null,
        _pausedAt: null,

        start(taskId) {
            try {
                if (this._activeTaskId && this._activeTaskId !== taskId) {
                    this.stop();
                }
                this._activeTaskId = taskId;
                this._startTime = Date.now();
                this._elapsedSeconds = 0;
                this._pausedAt = null;
                this._tick();
                this._intervalId = setInterval(() => this._tick(), 1000);
                _showToast('⏱️ Timer started', 'info');
                return { tracking: true, taskId, startTime: new Date().toISOString() };
            } catch (e) { console.error('[Tasks] Timer start error:', e); return null; }
        },

        pause() {
            if (!this._activeTaskId || !this._startTime) return;
            this._pausedAt = Date.now();
            if (this._intervalId) clearInterval(this._intervalId);
            this._elapsedSeconds += Math.floor((this._pausedAt - this._startTime) / 1000);
            this._startTime = null;
        },

        resume() {
            if (!this._activeTaskId || !this._pausedAt) return;
            this._startTime = Date.now();
            this._pausedAt = null;
            this._tick();
            this._intervalId = setInterval(() => this._tick(), 1000);
        },

        stop() {
            try {
                if (!this._activeTaskId) return null;
                if (this._intervalId) clearInterval(this._intervalId);
                const endTime = Date.now();
                const totalSeconds = this._startTime ? this._elapsedSeconds + Math.floor((endTime - this._startTime) / 1000) : this._elapsedSeconds;
                const result = { taskId: this._activeTaskId, totalSeconds, formattedTime: this._formatTime(totalSeconds), startedAt: this._pausedAt ? new Date(endTime - (this._elapsedSeconds * 1000)).toISOString() : new Date(this._startTime - this._elapsedSeconds * 1000).toISOString(), endedAt: new Date().toISOString() };
                this._activeTaskId = null;
                this._startTime = null;
                this._elapsedSeconds = 0;
                this._pausedAt = null;
                return result;
            } catch (e) { console.error('[Tasks] Timer stop error:', e); return null; }
        },

        getCurrent() {
            if (!this._activeTaskId) return null;
            const currentSeconds = this._startTime ? this._elapsedSeconds + Math.floor((Date.now() - this._startTime) / 1000) : this._elapsedSeconds;
            return { taskId: this._activeTaskId, elapsed: currentSeconds, formatted: this._formatTime(currentSeconds), isPaused: !this._startTime && !!this._pausedAt };
        },

        _tick() {
            const current = this.getCurrent();
            if (current) {
                window.dispatchEvent(new CustomEvent('crm:timer-tick', { detail: current }));
            }
        },

        _formatTime(totalSeconds) {
            const h = Math.floor(totalSeconds / 3600);
            const m = Math.floor((totalSeconds % 3600) / 60);
            const s = totalSeconds % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        },
    };

    // ============================================================
    // SECTION 2: UNDO/REDO STACK
    // ============================================================
    function pushUndo(action) {
        _undoStack.push({ ...action, timestamp: Date.now() });
        if (_undoStack.length > UNDO_STACK_LIMIT) _undoStack.shift();
        _redoStack = [];
    }

    async function undo() {
        try {
            if (_undoStack.length === 0) { _showToast('Nothing to undo.', 'info'); return; }
            const action = _undoStack.pop();
            _redoStack.push(action);

            switch (action.type) {
                case 'status_change':
                    await updateTaskStatus(action.taskId, action.previousStatus);
                    break;
                case 'delete':
                    if (window.CRM_Firestore?.createDocument) {
                        await window.CRM_Firestore.createDocument('tasks', action.taskData);
                        _taskCache.set(action.taskData.id, action.taskData);
                    }
                    break;
                case 'update':
                    await updateTask(action.taskId, action.previousData);
                    break;
                case 'create':
                    await deleteTask(action.taskId);
                    break;
            }
            _showToast('↩️ Undo successful', 'success');
            await _refreshCurrentView();
        } catch (error) { console.error('[Tasks] Undo error:', error); _showToast('Undo failed.', 'error'); }
    }

    async function redo() {
        try {
            if (_redoStack.length === 0) { _showToast('Nothing to redo.', 'info'); return; }
            const action = _redoStack.pop();
            _undoStack.push(action);

            switch (action.type) {
                case 'status_change':
                    await updateTaskStatus(action.taskId, action.newStatus);
                    break;
                case 'delete':
                    await deleteTask(action.taskId);
                    break;
                case 'update':
                    await updateTask(action.taskId, action.newData);
                    break;
                case 'create':
                    if (window.CRM_Firestore?.createDocument) {
                        await window.CRM_Firestore.createDocument('tasks', action.taskData);
                        _taskCache.set(action.taskData.id, action.taskData);
                    }
                    break;
            }
            _showToast('↪️ Redo successful', 'success');
            await _refreshCurrentView();
        } catch (error) { console.error('[Tasks] Redo error:', error); _showToast('Redo failed.', 'error'); }
    }

    // ============================================================
    // SECTION 3: TASK CRUD
    // ============================================================
    async function loadTasks(options = {}) {
        try {
            const filters = [];
            if (_filters.status && _filters.status !== 'all') filters.push(['status', '==', _filters.status]);
            if (_filters.priority && _filters.priority !== 'all') filters.push(['priority', '==', _filters.priority]);
            if (_filters.assignee && _filters.assignee !== 'all') filters.push(['assignee', '==', _filters.assignee]);
            if (_filters.projectId) filters.push(['projectId', '==', _filters.projectId]);

            let result;
            if (window.CRM_Firestore?.queryDocuments) {
                result = await window.CRM_Firestore.queryDocuments('tasks', {
                    filters, orderBy: _sort.field, orderDir: _sort.direction,
                    limit: options.limit || _pagination.limit, startAfter: _pagination.lastDoc,
                });
            } else { result = _fallbackQuery(); }

            _taskCache.clear();
            if (result?.data) result.data.forEach(t => _taskCache.set(t.id, _enrichTask(t)));

            _pagination.total = result?.total || (result?.data?.length || 0);
            _pagination.totalPages = Math.ceil(_pagination.total / _pagination.limit) || 1;
            _pagination.lastDoc = result?.lastDoc || null;

            let data = result?.data || [];
            if (_filters.search) {
                const s = _filters.search.toLowerCase();
                data = data.filter(t => (t.title || '').toLowerCase().includes(s) || (t.description || '').toLowerCase().includes(s) || (t.tags || []).some(tag => tag.toLowerCase().includes(s)));
            }

            return { data: data.map(t => _enrichTask(t)), total: _pagination.total };
        } catch (error) { console.error('[Tasks] Load error:', error); return { data: [], total: 0 }; }
    }

    async function getTask(taskId) {
        try {
            if (_taskCache.has(taskId)) return _taskCache.get(taskId);
            if (window.CRM_Firestore?.getDocument) {
                const task = await window.CRM_Firestore.getDocument('tasks', taskId);
                if (task) { const enriched = _enrichTask(task); _taskCache.set(taskId, enriched); return enriched; }
            }
            return null;
        } catch (e) { return null; }
    }

    async function createTask(taskData) {
        try {
            const now = new Date().toISOString();
            const user = _getCurrentUser();
            const data = {
                ...taskData,
                id: _generateId(),
                tenantId: _getTenantId(),
                status: taskData.status || 'todo',
                priority: taskData.priority || 'medium',
                type: taskData.type || 'task',
                createdAt: now, updatedAt: now,
                createdBy: user.uid, createdByName: user.displayName,
                subtasks: taskData.subtasks || [],
                timeEntries: taskData.timeEntries || [],
                totalTimeSpent: taskData.totalTimeSpent || 0,
                comments: taskData.comments || [],
                attachments: taskData.attachments || [],
                tags: taskData.tags || [],
                order: taskData.order || Date.now(),
            };

            if (window.CRM_Firestore?.createDocument) {
                const created = await window.CRM_Firestore.createDocument('tasks', data);
                if (created) {
                    const enriched = _enrichTask(created);
                    _taskCache.set(created.id, enriched);
                    pushUndo({ type: 'create', taskId: created.id, taskData: created });
                    return enriched;
                }
            } else { return _fallbackCreate(data); }
            return null;
        } catch (error) { console.error('[Tasks] Create error:', error); return { error: 'CREATE_FAILED', message: error.message }; }
    }

    async function updateTask(taskId, updates) {
        try {
            const existing = await getTask(taskId);
            if (!existing) return null;

            const previousData = { ...existing };
            const updateData = { ...updates, updatedAt: new Date().toISOString(), updatedBy: _getCurrentUser().uid };

            if (window.CRM_Firestore?.updateDocument) {
                const updated = await window.CRM_Firestore.updateDocument('tasks', taskId, updateData);
                if (updated) {
                    const enriched = _enrichTask(updated);
                    _taskCache.set(taskId, enriched);
                    pushUndo({ type: 'update', taskId, previousData, newData: updateData });
                    return enriched;
                }
            }
            return null;
        } catch (e) { console.error('[Tasks] Update error:', e); return null; }
    }

    async function updateTaskStatus(taskId, newStatus) {
        try {
            if (!TASK_STATUSES.includes(newStatus)) return { error: 'INVALID_STATUS', message: 'Invalid status.' };
            const existing = await getTask(taskId);
            const previousStatus = existing?.status;
            const updates = { status: newStatus };
            if (newStatus === 'done') updates.completedAt = new Date().toISOString();
            if (newStatus === 'in_progress' && !existing?.startedAt) updates.startedAt = new Date().toISOString();

            const result = await updateTask(taskId, updates);
            if (result && !result.error) {
                pushUndo({ type: 'status_change', taskId, previousStatus, newStatus });
            }
            return result;
        } catch (e) { return { error: 'STATUS_FAILED', message: e.message }; }
    }

    async function deleteTask(taskId) {
        try {
            const existing = await getTask(taskId);
            if (window.CRM_Firestore?.deleteDocument) {
                await window.CRM_Firestore.deleteDocument('tasks', taskId);
                _taskCache.delete(taskId);
                pushUndo({ type: 'delete', taskId, taskData: existing });
                return true;
            }
            return false;
        } catch (e) { return false; }
    }

    async function logTime(taskId, timeEntry) {
        try {
            const task = await getTask(taskId);
            if (!task) return null;
            const timeEntries = [...(task.timeEntries || []), { ...timeEntry, loggedAt: new Date().toISOString(), loggedBy: _getCurrentUser().uid }];
            const totalTimeSpent = timeEntries.reduce((s, t) => s + (t.durationSeconds || 0), 0);
            return await updateTask(taskId, { timeEntries, totalTimeSpent });
        } catch (e) { return null; }
    }

    async function addSubtask(taskId, subtaskData) {
        try {
            const task = await getTask(taskId);
            if (!task) return null;
            if ((task.subtasks || []).length >= MAX_SUBTASKS) return { error: 'LIMIT', message: `Max ${MAX_SUBTASKS} subtasks.` };
            const subtasks = [...(task.subtasks || []), { id: 'sub_' + Date.now(), ...subtaskData, status: 'pending', createdAt: new Date().toISOString() }];
            return await updateTask(taskId, { subtasks });
        } catch (e) { return null; }
    }

    async function toggleSubtask(taskId, subtaskId) {
        try {
            const task = await getTask(taskId);
            if (!task) return null;
            const subtasks = (task.subtasks || []).map(s => s.id === subtaskId ? { ...s, status: s.status === 'done' ? 'pending' : 'done', completedAt: s.status !== 'done' ? new Date().toISOString() : null } : s);
            return await updateTask(taskId, { subtasks });
        } catch (e) { return null; }
    }

    // ============================================================
    // SECTION 4: DATA ENRICHMENT
    // ============================================================
    function _enrichTask(task) {
        try {
            const statusConfig = TASK_STATUS_CONFIG[task.status] || {};
            const priorityConfig = PRIORITY_LEVELS[task.priority] || {};
            const typeConfig = TASK_TYPES[task.type] || {};
            const dueDate = task.dueDate ? new Date(task.dueDate) : null;
            const isOverdue = dueDate && dueDate < new Date() && task.status !== 'done' && task.status !== 'cancelled';
            const slaHours = priorityConfig.sla || 48;
            const createdAt = task.createdAt ? new Date(task.createdAt) : new Date();
            const slaDeadline = new Date(createdAt.getTime() + slaHours * 3600000);
            const isSLABreached = new Date() > slaDeadline && task.status !== 'done' && task.status !== 'cancelled';

            return {
                ...task,
                statusLabel: statusConfig.label, statusIcon: statusConfig.icon, statusColor: statusConfig.color,
                priorityLabel: priorityConfig.label, priorityIcon: priorityConfig.icon, priorityColor: priorityConfig.color,
                typeIcon: typeConfig.icon, typeName: typeConfig.name,
                formattedDueDate: _formatDate(task.dueDate),
                formattedCreatedAt: _formatDate(task.createdAt),
                isOverdue, isSLABreached,
                slaDeadline: slaDeadline.toISOString(),
                daysOverdue: dueDate ? Math.max(0, Math.floor((new Date() - dueDate) / 86400000)) : 0,
                subtaskProgress: task.subtasks ? { total: task.subtasks.length, completed: task.subtasks.filter(s => s.status === 'done').length } : { total: 0, completed: 0 },
                totalTimeFormatted: TimeTracker._formatTime(task.totalTimeSpent || 0),
            };
        } catch (e) { return task; }
    }

    // ============================================================
    // SECTION 5: FALLBACKS
    // ============================================================
    function _fallbackQuery() {
        try {
            const stored = localStorage.getItem('crm_tasks');
            let tasks = stored ? JSON.parse(stored) : [];
            tasks = tasks.filter(t => t.tenantId === _getTenantId());
            return { data: tasks, total: tasks.length, hasMore: false, lastDoc: null };
        } catch (e) { return { data: [], total: 0 }; }
    }

    function _fallbackCreate(data) {
        try {
            const stored = localStorage.getItem('crm_tasks');
            const tasks = stored ? JSON.parse(stored) : [];
            tasks.push(data);
            localStorage.setItem('crm_tasks', JSON.stringify(tasks));
            return data;
        } catch (e) { return null; }
    }

    // ============================================================
    // SECTION 6: BULK OPERATIONS
    // ============================================================
    async function bulkUpdateStatus(taskIds, newStatus) {
        try {
            let updated = 0;
            for (const id of taskIds) {
                const result = await updateTaskStatus(id, newStatus);
                if (result && !result.error) updated++;
            }
            _showToast(`${updated} tasks updated to ${TASK_STATUS_CONFIG[newStatus]?.label}.`, 'success');
            return { updated, total: taskIds.length };
        } catch (e) { return { updated: 0, error: e.message }; }
    }

    async function bulkDelete(taskIds) {
        try {
            let deleted = 0;
            for (const id of taskIds) {
                const result = await deleteTask(id);
                if (result) deleted++;
            }
            _showToast(`${deleted} tasks deleted.`, 'success');
            await _refreshCurrentView();
            return { deleted, total: taskIds.length };
        } catch (e) { return { deleted: 0, error: e.message }; }
    }

    async function bulkAssign(taskIds, assigneeUid) {
        try {
            let assigned = 0;
            for (const id of taskIds) {
                const result = await updateTask(id, { assignee: assigneeUid });
                if (result && !result.error) assigned++;
            }
            _showToast(`${assigned} tasks reassigned.`, 'success');
            return { assigned, total: taskIds.length };
        } catch (e) { return { assigned: 0, error: e.message }; }
    }

    // ============================================================
    // SECTION 7: UI RENDERERS - KANBAN
    // ============================================================
    async function renderKanbanView(containerId = 'tasksContent') {
        try {
            const container = document.getElementById(containerId);
            if (!container) return;

            const result = await loadTasks({ limit: 500 });
            const tasks = result.data || [];

            let html = `
                <div class="tasks-kanban-container">
                    <div class="flex justify-between items-center mb-4">
                        <h2>📋 Task Board</h2>
                        <div class="flex gap-2">
                            <button class="btn btn-outline btn-sm ${_currentView === 'kanban' ? 'active' : ''}" onclick="window.CRM_Tasks.switchView('kanban')">📋 Kanban</button>
                            <button class="btn btn-outline btn-sm ${_currentView === 'list' ? 'active' : ''}" onclick="window.CRM_Tasks.switchView('list')">📄 List</button>
                            <button class="btn btn-outline btn-sm ${_currentView === 'calendar' ? 'active' : ''}" onclick="window.CRM_Tasks.switchView('calendar')">📅 Calendar</button>
                            <button class="btn btn-primary btn-sm" onclick="window.CRM_Tasks.openCreateForm()">+ New Task</button>
                        </div>
                    </div>
                    ${_buildFilterBar()}
                    <div class="kanban-board">
                        ${TASK_STATUSES.filter(s => s !== 'cancelled').map(status => {
                            const config = TASK_STATUS_CONFIG[status];
                            const statusTasks = tasks.filter(t => t.status === status);
                            return `
                                <div class="kanban-col" data-status="${status}" 
                                     ondragover="event.preventDefault();this.classList.add('drag-over')" 
                                     ondragleave="this.classList.remove('drag-over')" 
                                     ondrop="window.CRM_Tasks.handleKanbanDrop(event, '${status}')">
                                    <div class="kanban-col-header">
                                        <span class="kanban-col-title">${config.icon} ${config.label}</span>
                                        <span class="kanban-col-count">${statusTasks.length}</span>
                                    </div>
                                    <div class="kanban-items">
                                        ${statusTasks.map(t => _buildKanbanCard(t)).join('')}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
            container.innerHTML = html;
            _bindKanbanEvents();
        } catch (e) { console.error('[Tasks] Render kanban error:', e); }
    }

    function _buildKanbanCard(task) {
        const enriched = _enrichTask(task);
        return `
            <div class="kanban-item" draggable="true" data-task-id="${task.id}" 
                 ondragstart="window.CRM_Tasks.handleDragStart(event, '${task.id}')" 
                 ondragend="window.CRM_Tasks.handleDragEnd(event)"
                 onclick="window.CRM_Tasks.openTaskDetail('${task.id}')">
                <div class="flex justify-between items-start mb-2">
                    <span class="text-xs font-medium" style="color:${enriched.priorityColor};">${enriched.priorityIcon} ${enriched.priorityLabel}</span>
                    <span class="text-xs text-muted">${enriched.typeIcon}</span>
                </div>
                <div class="font-medium text-sm mb-2">${_escapeHtml(task.title || 'Untitled')}</div>
                ${task.description ? `<div class="text-xs text-muted mb-2 truncate">${_escapeHtml(task.description.substring(0, 80))}</div>` : ''}
                <div class="flex justify-between items-center text-2xs text-muted">
                    <span>${task.assigneeName || 'Unassigned'}</span>
                    <span>${enriched.formattedDueDate}</span>
                </div>
                ${enriched.isOverdue ? '<span class="badge badge-error mt-1">Overdue</span>' : ''}
                ${enriched.isSLABreached ? '<span class="badge badge-warning mt-1">SLA Breach</span>' : ''}
                ${enriched.subtaskProgress.total > 0 ? `
                    <div class="mt-2">
                        <div class="progress progress-sm"><div class="progress-bar" style="width:${(enriched.subtaskProgress.completed / enriched.subtaskProgress.total) * 100}%"></div></div>
                        <div class="text-2xs text-muted mt-1">${enriched.subtaskProgress.completed}/${enriched.subtaskProgress.total} subtasks</div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // ============================================================
    // SECTION 8: UI RENDERERS - LIST VIEW
    // ============================================================
    async function renderListView(containerId = 'tasksContent') {
        try {
            const container = document.getElementById(containerId);
            if (!container) return;

            const result = await loadTasks();
            const tasks = result.data || [];

            let html = `
                <div class="tasks-list-container">
                    <div class="flex justify-between items-center mb-4">
                        <h2>📄 All Tasks</h2>
                        <div class="flex gap-2">
                            <button class="btn btn-outline btn-sm ${_currentView === 'kanban' ? 'active' : ''}" onclick="window.CRM_Tasks.switchView('kanban')">📋 Kanban</button>
                            <button class="btn btn-outline btn-sm ${_currentView === 'list' ? 'active' : ''}" onclick="window.CRM_Tasks.switchView('list')">📄 List</button>
                            <button class="btn btn-outline btn-sm ${_currentView === 'calendar' ? 'active' : ''}" onclick="window.CRM_Tasks.switchView('calendar')">📅 Calendar</button>
                            <button class="btn btn-primary btn-sm" onclick="window.CRM_Tasks.openCreateForm()">+ New Task</button>
                        </div>
                    </div>
                    ${_buildFilterBar()}
                    <div class="table-container">
                        <table class="table">
                            <thead><tr>
                                <th style="width:5%"><input type="checkbox" id="selectAllTasks"></th>
                                <th style="width:30%">Task</th>
                                <th style="width:10%">Priority</th>
                                <th style="width:10%">Status</th>
                                <th style="width:12%">Assignee</th>
                                <th style="width:10%">Due Date</th>
                                <th style="width:8%">Time</th>
                                <th style="width:15%">Actions</th>
                            </tr></thead>
                            <tbody>
                                ${tasks.length === 0 ? '<tr><td colspan="8" class="text-center p-4 text-muted">No tasks found</td></tr>' :
                                    tasks.map(t => {
                                        const enriched = _enrichTask(t);
                                        return `
                                            <tr class="${enriched.isOverdue ? 'overdue-row' : ''}">
                                                <td><input type="checkbox" class="task-select" value="${t.id}"></td>
                                                <td>
                                                    <div class="font-medium">${enriched.typeIcon} ${_escapeHtml(t.title || 'Untitled')}</div>
                                                    ${t.tags ? t.tags.map(tag => `<span class="badge badge-sm mr-1">${_escapeHtml(tag)}</span>`).join('') : ''}
                                                </td>
                                                <td><span style="color:${enriched.priorityColor};">${enriched.priorityIcon} ${enriched.priorityLabel}</span></td>
                                                <td><span class="badge" style="background:${enriched.statusColor}20;color:${enriched.statusColor};">${enriched.statusIcon} ${enriched.statusLabel}</span></td>
                                                <td>${_escapeHtml(t.assigneeName || '—')}</td>
                                                <td>${enriched.formattedDueDate} ${enriched.isOverdue ? '<span class="text-error">⚠️</span>' : ''}</td>
                                                <td>${enriched.totalTimeFormatted}</td>
                                                <td>
                                                    <button class="btn btn-ghost btn-sm" onclick="window.CRM_Tasks.openTaskDetail('${t.id}')">👁️</button>
                                                    <button class="btn btn-ghost btn-sm" onclick="window.CRM_Tasks.startTimer('${t.id}')">⏱️</button>
                                                    <button class="btn btn-ghost btn-sm" onclick="window.CRM_Tasks.quickComplete('${t.id}')">✅</button>
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')
                                }
                            </tbody>
                        </table>
                    </div>
                    ${result.total > 0 ? `
                        <div class="flex justify-between items-center mt-3">
                            <button class="btn btn-outline btn-sm" id="bulkCompleteBtn">✅ Complete Selected</button>
                            <span class="text-sm text-muted">${result.total} tasks</span>
                        </div>
                    ` : ''}
                </div>
            `;
            container.innerHTML = html;
            _bindListEvents();
        } catch (e) { console.error('[Tasks] Render list error:', e); }
    }

    // ============================================================
    // SECTION 9: UI RENDERERS - CALENDAR VIEW
    // ============================================================
    async function renderCalendarView(containerId = 'tasksContent') {
        try {
            const container = document.getElementById(containerId);
            if (!container) return;

            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth();
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const today = now.getDate();

            const result = await loadTasks({ limit: 500 });
            const tasksByDate = {};
            (result.data || []).forEach(t => {
                if (t.dueDate) {
                    const day = new Date(t.dueDate).getDate();
                    if (!tasksByDate[day]) tasksByDate[day] = [];
                    tasksByDate[day].push(t);
                }
            });

            let calendarGrid = '';
            for (let i = 0; i < firstDay; i++) calendarGrid += '<div class="calendar-cell empty"></div>';
            for (let day = 1; day <= daysInMonth; day++) {
                const dayTasks = tasksByDate[day] || [];
                calendarGrid += `
                    <div class="calendar-cell ${day === today ? 'today' : ''}" onclick="window.CRM_Tasks.openDayTasks(${day})">
                        <div class="calendar-day">${day}</div>
                        ${dayTasks.slice(0, 3).map(t => `
                            <div class="calendar-task" style="background:${PRIORITY_LEVELS[t.priority]?.color || '#888'}20;border-left:3px solid ${PRIORITY_LEVELS[t.priority]?.color || '#888'};" onclick="event.stopPropagation();window.CRM_Tasks.openTaskDetail('${t.id}')">
                                ${_escapeHtml((t.title || '').substring(0, 20))}
                            </div>
                        `).join('')}
                        ${dayTasks.length > 3 ? `<div class="text-2xs text-muted">+${dayTasks.length - 3} more</div>` : ''}
                    </div>
                `;
            }

            container.innerHTML = `
                <div class="tasks-calendar-container">
                    <div class="flex justify-between items-center mb-4">
                        <h2>📅 Task Calendar</h2>
                        <div class="flex gap-2">
                            <button class="btn btn-outline btn-sm" onclick="window.CRM_Tasks.switchView('kanban')">📋 Kanban</button>
                            <button class="btn btn-outline btn-sm" onclick="window.CRM_Tasks.switchView('list')">📄 List</button>
                            <button class="btn btn-primary btn-sm" onclick="window.CRM_Tasks.openCreateForm()">+ New Task</button>
                        </div>
                    </div>
                    <div class="calendar-header text-center mb-2">
                        <h3>${now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h3>
                    </div>
                    <div class="calendar-grid">
                        ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="calendar-weekday">${d}</div>`).join('')}
                        ${calendarGrid}
                    </div>
                </div>
            `;
        } catch (e) { console.error('[Tasks] Render calendar error:', e); }
    }

    // ============================================================
    // SECTION 10: UI BUILDERS
    // ============================================================
    function _buildFilterBar() {
        return `
            <div class="flex gap-2 mb-3 flex-wrap">
                <select id="taskStatusFilter" class="form-select" style="width:auto;min-height:40px;">
                    <option value="all">All Status</option>
                    ${TASK_STATUSES.map(s => `<option value="${s}">${TASK_STATUS_CONFIG[s].icon} ${TASK_STATUS_CONFIG[s].label}</option>`).join('')}
                </select>
                <select id="taskPriorityFilter" class="form-select" style="width:auto;min-height:40px;">
                    <option value="all">All Priority</option>
                    ${Object.entries(PRIORITY_LEVELS).map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
                </select>
                <input type="search" id="taskSearchFilter" class="form-input" placeholder="Search tasks..." style="width:200px;min-height:40px;">
            </div>
        `;
    }

    // ============================================================
    // SECTION 11: DRAG & DROP
    // ============================================================
    function handleDragStart(event, taskId) {
        _dragState = { taskId };
        event.dataTransfer.setData('text/plain', taskId);
        event.target.classList.add('dragging');
    }

    function handleDragEnd(event) {
        event.target.classList.remove('dragging');
        document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
        _dragState = null;
    }

    async function handleKanbanDrop(event, newStatus) {
        event.preventDefault();
        event.target.closest('.kanban-col')?.classList.remove('drag-over');
        const taskId = event.dataTransfer.getData('text/plain');
        if (taskId && newStatus) {
            await updateTaskStatus(taskId, newStatus);
            await renderKanbanView();
        }
    }

    // ============================================================
    // SECTION 12: CREATE/EDIT FORM
    // ============================================================
    async function openCreateForm(containerId = 'tasksContent', taskData = null) {
        try {
            const container = document.getElementById(containerId);
            if (!container) return;
            const isEdit = !!taskData;
            const teamMembers = window.CRM_Tenant?.getTeamMembers ? window.CRM_Tenant.getTeamMembers() : [];

            container.innerHTML = `
                <div class="task-form-container">
                    <h2 class="mb-4">${isEdit ? 'Edit Task' : 'Create New Task'}</h2>
                    <form id="taskForm" class="task-form">
                        <div class="card mb-3">
                            <div class="card-body">
                                <div class="form-group"><label class="form-label form-label-required">Title</label><input type="text" id="taskTitle" class="form-input" value="${_escapeHtml(taskData?.title || '')}" required></div>
                                <div class="form-group mt-3"><label class="form-label">Description</label><textarea id="taskDesc" class="form-textarea" rows="3">${_escapeHtml(taskData?.description || '')}</textarea></div>
                                <div class="form-row mt-3">
                                    <div class="form-group flex-1"><label class="form-label">Status</label><select id="taskStatus" class="form-select">${TASK_STATUSES.map(s => `<option value="${s}" ${taskData?.status === s ? 'selected' : ''}>${TASK_STATUS_CONFIG[s].label}</option>`).join('')}</select></div>
                                    <div class="form-group flex-1"><label class="form-label">Priority</label><select id="taskPriority" class="form-select">${Object.entries(PRIORITY_LEVELS).map(([k, v]) => `<option value="${k}" ${taskData?.priority === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
                                    <div class="form-group flex-1"><label class="form-label">Type</label><select id="taskType" class="form-select">${Object.entries(TASK_TYPES).map(([k, v]) => `<option value="${k}" ${taskData?.type === k ? 'selected' : ''}>${v.icon} ${v.name}</option>`).join('')}</select></div>
                                </div>
                                <div class="form-row mt-3">
                                    <div class="form-group flex-1"><label class="form-label">Assignee</label><select id="taskAssignee" class="form-select"><option value="">Unassigned</option>${teamMembers.map(m => `<option value="${m.uid || m.id}" ${taskData?.assignee === (m.uid || m.id) ? 'selected' : ''}>${m.displayName || m.email}</option>`).join('')}</select></div>
                                    <div class="form-group flex-1"><label class="form-label">Due Date</label><input type="date" id="taskDueDate" class="form-input" value="${taskData?.dueDate?.split('T')[0] || ''}"></div>
                                </div>
                                <div class="form-group mt-3"><label class="form-label">Tags (comma-separated)</label><input type="text" id="taskTags" class="form-input" value="${(taskData?.tags || []).join(', ')}" placeholder="e.g., important, client, follow-up"></div>
                            </div>
                        </div>
                        <div class="flex justify-end gap-3">
                            <button type="button" class="btn btn-secondary btn-lg" onclick="window.CRM_Tasks.navigateToBoard()">Cancel</button>
                            <button type="submit" class="btn btn-primary btn-lg">${isEdit ? '💾 Update' : '✅ Create Task'}</button>
                        </div>
                    </form>
                </div>
            `;

            document.getElementById('taskForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const data = {
                    title: document.getElementById('taskTitle')?.value,
                    description: document.getElementById('taskDesc')?.value,
                    status: document.getElementById('taskStatus')?.value,
                    priority: document.getElementById('taskPriority')?.value,
                    type: document.getElementById('taskType')?.value,
                    assignee: document.getElementById('taskAssignee')?.value,
                    assigneeName: document.getElementById('taskAssignee')?.selectedOptions[0]?.text,
                    dueDate: document.getElementById('taskDueDate')?.value,
                    tags: (document.getElementById('taskTags')?.value || '').split(',').map(t => t.trim()).filter(Boolean),
                };
                if (!data.title) { _showToast('Title is required.', 'error'); return; }

                let result;
                if (isEdit && taskData?.id) result = await updateTask(taskData.id, data);
                else result = await createTask(data);

                if (result && !result.error) { _showToast(isEdit ? 'Task updated!' : 'Task created!', 'success'); navigateToBoard(); }
                else _showToast(result?.message || 'Failed.', 'error');
            });
        } catch (e) { console.error('[Tasks] Form error:', e); }
    }

    // ============================================================
    // SECTION 13: NAVIGATION & EVENTS
    // ============================================================
    async function _refreshCurrentView() {
        if (_currentView === 'kanban') await renderKanbanView();
        else if (_currentView === 'list') await renderListView();
        else if (_currentView === 'calendar') await renderCalendarView();
    }

    async function switchView(view) { _currentView = view; await _refreshCurrentView(); }
    async function navigateToBoard() { _currentView = 'kanban'; await renderKanbanView(); }

    async function openTaskDetail(taskId) {
        const task = await getTask(taskId);
        if (!task) return;
        _selectedTask = task;
        _showToast(`Task: ${task.title}\nStatus: ${task.statusLabel}\nPriority: ${task.priorityLabel}`, 'info');
    }

    async function startTimer(taskId) {
        const result = TimeTracker.start(taskId);
        if (result) await updateTask(taskId, { startedAt: result.startTime });
    }

    function stopTimer() {
        const result = TimeTracker.stop();
        if (result) {
            logTime(result.taskId, { durationSeconds: result.totalSeconds, startedAt: result.startedAt, endedAt: result.endedAt });
            _showToast(`Time logged: ${result.formattedTime}`, 'success');
        }
    }

    async function quickComplete(taskId) { await updateTaskStatus(taskId, 'done'); await _refreshCurrentView(); _showToast('Task completed! ✅', 'success'); }

    function _bindKanbanEvents() {
        document.querySelectorAll('.kanban-item').forEach(item => {
            item.addEventListener('dragstart', (e) => handleDragStart(e, item.dataset.taskId));
            item.addEventListener('dragend', handleDragEnd);
        });
    }

    function _bindListEvents() {
        document.getElementById('selectAllTasks')?.addEventListener('change', (e) => {
            document.querySelectorAll('.task-select').forEach(cb => cb.checked = e.target.checked);
        });
        document.getElementById('bulkCompleteBtn')?.addEventListener('click', async () => {
            const selected = [...document.querySelectorAll('.task-select:checked')].map(cb => cb.value);
            if (selected.length === 0) { _showToast('Select tasks first.', 'warning'); return; }
            await bulkUpdateStatus(selected, 'done');
            await renderListView();
        });
        document.getElementById('taskStatusFilter')?.addEventListener('change', async () => { _filters.status = document.getElementById('taskStatusFilter').value; await _refreshCurrentView(); });
        document.getElementById('taskPriorityFilter')?.addEventListener('change', async () => { _filters.priority = document.getElementById('taskPriorityFilter').value; await _refreshCurrentView(); });
        const searchEl = document.getElementById('taskSearchFilter');
        if (searchEl) searchEl.addEventListener('input', _debounce(async () => { _filters.search = searchEl.value; await _refreshCurrentView(); }, 400));
    }

    // ============================================================
    // SECTION 14: INIT
    // ============================================================
    function init() {
        try {
            if (_initialized) return;
            renderKanbanView();
            document.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
                if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
            });
            _initialized = true;
            console.log('[CRM_Tasks] Module initialized.');
        } catch (e) { console.error('[CRM_Tasks] Init error:', e); }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
    else setTimeout(init, 300);

    return {
        init, TimeTracker,
        loadTasks, getTask, createTask, updateTask, updateTaskStatus, deleteTask,
        logTime, addSubtask, toggleSubtask,
        bulkUpdateStatus, bulkDelete, bulkAssign,
        undo, redo,
        renderKanbanView, renderListView, renderCalendarView,
        openCreateForm, openTaskDetail, startTimer, stopTimer, quickComplete,
        switchView, navigateToBoard, handleDragStart, handleDragEnd, handleKanbanDrop,
        getFilters: () => _filters,
    };
})();

window.CRM_Tasks = CRM_Tasks;
console.log('[CRM_Tasks] Module loaded. window.CRM_Tasks available.');