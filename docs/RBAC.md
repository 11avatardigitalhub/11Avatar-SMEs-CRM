# 🔐 11 Avatar SMEs CRM — Role-Based Access Control

## 8-Level Hierarchy
Level 0: PLATFORM_OWNER ─── Full system access, all tenants
│
Level 1: TENANT_ADMIN ─── Full tenant access, manage users
│
Level 2: SUB_ADMIN ─── Department admin, manage modules
│
Level 3: MANAGER ─── Team management, view all data
│
Level 4: TEAM_LEADER ─── Supervise executives
│
Level 5: EXECUTIVE ─── Day-to-day operations
│
Level 6: VIEWER ─── Read-only access
│
Level 7: RESTRICTED ─── Module-specific access only

text

---

## Permission Matrix

| Permission | PLATFORM_OWNER | TENANT_ADMIN | SUB_ADMIN | MANAGER | TEAM_LEADER | EXECUTIVE | VIEWER | RESTRICTED |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Manage Users** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Manage Roles** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Manage Billing** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **View All Data** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Edit All Data** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Delete Data** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Export Data** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **View Reports** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Create Leads** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Manage Pipeline** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Create Invoices** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Send Messages** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **View Own Data** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Module Specific** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Module Access Control

| Module | Default Access |
|--------|---------------|
| Dashboard | All roles |
| Leads | Executive+ |
| Pipeline | Executive+ |
| Clients | Executive+ |
| Invoices | Executive+ |
| Payments | Executive+ |
| Tasks | Executive+ |
| Projects | Team Leader+ |
| Retainers | Manager+ |
| WhatsApp | Executive+ |
| Training | Manager+ |
| Referrals | Executive+ |
| Reports | Team Leader+ |
| Notifications | All roles |
| Appointments | Executive+ |
| Settings | Tenant Admin+ |

---

## Adding a New User

1. **Register via Sign Up page** → Pending approval
2. **Platform Owner approves** → Assigns role & modules
3. **User gets access** based on role permissions

---

## Changing Role

1. Settings → Team & Roles
2. Select user
3. Change role from dropdown
4. Save
5. New permissions apply on next login
