rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }
    
    function currentUser() {
      return request.auth.uid;
    }
    
    function getUserRole() {
      return request.auth.token.role;
    }
    
    function getTenantId() {
      return request.auth.token.tenantId;
    }
    
    function hasTenant() {
      return request.auth.token.tenantId != null;
    }
    
    function isPlatformOwner() {
      return getUserRole() == 'PLATFORM_OWNER';
    }
    
    function isTenantAdmin() {
      return getUserRole() == 'TENANT_ADMIN' || isPlatformOwner();
    }
    
    function isSubAdmin() {
      return getUserRole() == 'SUB_ADMIN' || isTenantAdmin();
    }
    
    function isManager() {
      return getUserRole() == 'MANAGER' || isSubAdmin();
    }
    
    function isTeamLeader() {
      return getUserRole() == 'TEAM_LEADER' || isManager();
    }
    
    function isExecutive() {
      return getUserRole() == 'EXECUTIVE' || isTeamLeader();
    }
    
    function isViewer() {
      return getUserRole() == 'VIEWER' || isExecutive();
    }
    
    function isRestricted() {
      return getUserRole() == 'RESTRICTED' || isViewer();
    }
    
    function belongsToTenant(tenantId) {
      return hasTenant() && tenantId == getTenantId();
    }
    
    function isOwner(ownerId) {
      return ownerId == currentUser();
    }
    
    function isValidString(value, minLen, maxLen) {
      return value is string && value.size() >= minLen && value.size() <= maxLen;
    }
    
    function isValidEmail(value) {
      return value is string && value.matches('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$');
    }
    
    function isValidPhone(value) {
      return value is string && value.matches('^[+]?[0-9]{10,15}$');
    }
    
    function isValidGSTIN(value) {
      return value is string && value.matches('^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$');
    }

    match /organizations/{orgId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() && isPlatformOwner();
      allow update: if isAuthenticated() && isTenantAdmin() && belongsToTenant(orgId);
      allow delete: if isPlatformOwner();
    }

    match /users/{userId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated();
      allow update: if isAuthenticated() && ((currentUser() == userId) || isTenantAdmin());
      allow delete: if isPlatformOwner();
    }

    match /tenants/{tenantId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() && isPlatformOwner();
      allow update: if isAuthenticated() && isTenantAdmin() && belongsToTenant(tenantId);
      allow delete: if isPlatformOwner();
    }

    match /leads/{leadId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isExecutive() && request.resource.data.tenantId == getTenantId() && isValidString(request.resource.data.firstName, 1, 100);
      allow update: if isAuthenticated() && belongsToTenant(resource.data.tenantId) && (isManager() || isOwner(resource.data.createdBy));
      allow delete: if isAuthenticated() && isTenantAdmin() && belongsToTenant(resource.data.tenantId);
    }

    match /clients/{clientId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isExecutive() && request.resource.data.tenantId == getTenantId();
      allow update: if isAuthenticated() && isManager() && belongsToTenant(resource.data.tenantId);
      allow delete: if isAuthenticated() && isTenantAdmin() && belongsToTenant(resource.data.tenantId);
    }

    match /contacts/{contactId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isExecutive() && request.resource.data.tenantId == getTenantId();
      allow update: if isAuthenticated() && isManager() && belongsToTenant(resource.data.tenantId);
      allow delete: if isAuthenticated() && isTenantAdmin() && belongsToTenant(resource.data.tenantId);
    }

    match /deals/{dealId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isExecutive() && request.resource.data.tenantId == getTenantId();
      allow update: if isAuthenticated() && isManager() && belongsToTenant(resource.data.tenantId);
      allow delete: if isAuthenticated() && isTenantAdmin() && belongsToTenant(resource.data.tenantId);
    }

    match /pipeline_stages/{stageId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create, update, delete: if isAuthenticated() && isTenantAdmin() && request.resource.data.tenantId == getTenantId();
    }

    match /invoices/{invoiceId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isExecutive() && request.resource.data.tenantId == getTenantId();
      allow update: if isAuthenticated() && isManager() && belongsToTenant(resource.data.tenantId);
      allow delete: if isAuthenticated() && isTenantAdmin() && belongsToTenant(resource.data.tenantId);
    }

    match /invoice_items/{itemId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isExecutive() && request.resource.data.tenantId == getTenantId();
      allow update: if isAuthenticated() && isManager() && belongsToTenant(resource.data.tenantId);
      allow delete: if isAuthenticated() && isTenantAdmin() && belongsToTenant(resource.data.tenantId);
    }

    match /payments/{paymentId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isExecutive() && request.resource.data.tenantId == getTenantId();
      allow update: if isAuthenticated() && isManager() && belongsToTenant(resource.data.tenantId);
      allow delete: if isAuthenticated() && isTenantAdmin() && belongsToTenant(resource.data.tenantId);
    }

    match /payment_gateways/{gatewayId} {
      allow read, create, update, delete: if isAuthenticated() && isTenantAdmin() && request.resource.data.tenantId == getTenantId();
    }

    match /tasks/{taskId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isExecutive() && request.resource.data.tenantId == getTenantId();
      allow update: if isAuthenticated() && belongsToTenant(resource.data.tenantId) && (isManager() || isOwner(resource.data.createdBy) || resource.data.assignee == currentUser());
      allow delete: if isAuthenticated() && isTenantAdmin() && belongsToTenant(resource.data.tenantId);
    }

    match /task_comments/{commentId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isExecutive();
      allow update, delete: if isAuthenticated() && isOwner(resource.data.createdBy);
    }

    match /projects/{projectId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isManager() && request.resource.data.tenantId == getTenantId();
      allow update: if isAuthenticated() && isManager() && belongsToTenant(resource.data.tenantId);
      allow delete: if isAuthenticated() && isTenantAdmin() && belongsToTenant(resource.data.tenantId);
    }

    match /project_milestones/{milestoneId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create, update, delete: if isAuthenticated() && isManager() && request.resource.data.tenantId == getTenantId();
    }

    match /retainers/{retainerId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isManager() && request.resource.data.tenantId == getTenantId();
      allow update: if isAuthenticated() && isManager() && belongsToTenant(resource.data.tenantId);
      allow delete: if isAuthenticated() && isTenantAdmin() && belongsToTenant(resource.data.tenantId);
    }

    match /retainer_invoices/{invId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isManager() && request.resource.data.tenantId == getTenantId();
      allow update, delete: if isAuthenticated() && isTenantAdmin() && belongsToTenant(resource.data.tenantId);
    }

    match /courses/{courseId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isManager() && request.resource.data.tenantId == getTenantId();
      allow update: if isAuthenticated() && isManager() && belongsToTenant(resource.data.tenantId);
      allow delete: if isAuthenticated() && isTenantAdmin() && belongsToTenant(resource.data.tenantId);
    }

    match /course_modules/{moduleId} {
      allow read, create, update, delete: if isAuthenticated() && isManager() && request.resource.data.tenantId == getTenantId();
    }

    match /enrollments/{enrollmentId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && belongsToTenant(request.resource.data.tenantId);
      allow update: if isAuthenticated() && (isManager() || resource.data.studentId == currentUser());
      allow delete: if isAuthenticated() && isTenantAdmin();
    }

    match /assessments/{assessmentId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create, update: if isAuthenticated() && isManager();
      allow delete: if isAuthenticated() && isTenantAdmin();
    }

    match /certificates/{certId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isManager();
      allow update, delete: if isAuthenticated() && isTenantAdmin();
    }

    match /referrals/{referralId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isExecutive() && request.resource.data.tenantId == getTenantId();
      allow update: if isAuthenticated() && isManager() && belongsToTenant(resource.data.tenantId);
      allow delete: if isAuthenticated() && isTenantAdmin() && belongsToTenant(resource.data.tenantId);
    }

    match /referral_partners/{partnerId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create, update: if isAuthenticated() && isManager() && request.resource.data.tenantId == getTenantId();
      allow delete: if isAuthenticated() && isTenantAdmin();
    }

    match /referral_commissions/{commissionId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isManager();
      allow update: if isAuthenticated() && isTenantAdmin();
      allow delete: if isAuthenticated() && isTenantAdmin();
    }

    match /whatsapp_messages/{messageId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isExecutive() && request.resource.data.tenantId == getTenantId();
      allow update: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow delete: if isAuthenticated() && isTenantAdmin();
    }

    match /whatsapp_templates/{templateId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create, update: if isAuthenticated() && isManager() && request.resource.data.tenantId == getTenantId();
      allow delete: if isAuthenticated() && isTenantAdmin();
    }

    match /whatsapp_contacts/{contactId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isExecutive() && request.resource.data.tenantId == getTenantId();
      allow update: if isAuthenticated() && isManager();
      allow delete: if isAuthenticated() && isTenantAdmin();
    }

    match /appointments/{appointmentId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isExecutive() && request.resource.data.tenantId == getTenantId();
      allow update: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow delete: if isAuthenticated() && isTenantAdmin() && belongsToTenant(resource.data.tenantId);
    }

    match /calendar_events/{eventId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create, update, delete: if isAuthenticated() && belongsToTenant(request.resource.data.tenantId);
    }

    match /notifications/{notificationId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && request.resource.data.tenantId == getTenantId();
      allow update: if isAuthenticated() && (resource.data.userId == currentUser() || isTenantAdmin());
      allow delete: if isAuthenticated() && resource.data.userId == currentUser();
    }

    match /notification_preferences/{userId} {
      allow read, write: if isAuthenticated() && currentUser() == userId;
    }

    match /email_queue/{emailId} {
      allow read, create: if isAuthenticated() && belongsToTenant(request.resource.data.tenantId);
      allow update, delete: if isAuthenticated() && isTenantAdmin();
    }

    match /sms_queue/{smsId} {
      allow read, create: if isAuthenticated() && belongsToTenant(request.resource.data.tenantId);
      allow update, delete: if isAuthenticated() && isTenantAdmin();
    }

    match /webhook_events/{eventId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isTenantAdmin() && request.resource.data.tenantId == getTenantId();
      allow update, delete: if isAuthenticated() && isTenantAdmin() && belongsToTenant(resource.data.tenantId);
    }

    match /settings/{tenantId} {
      allow read: if isAuthenticated() && belongsToTenant(tenantId);
      allow create, update: if isAuthenticated() && isTenantAdmin() && tenantId == getTenantId();
      allow delete: if isPlatformOwner();
    }

    match /audit_logs/{logId} {
      allow read: if isAuthenticated() && isTenantAdmin();
      allow create: if isAuthenticated() && request.resource.data.tenantId == getTenantId();
      allow update: if false;
      allow delete: if isPlatformOwner();
    }

    match /activity_logs/{logId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && request.resource.data.tenantId == getTenantId();
      allow update, delete: if false;
    }

    match /reports/{reportId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isManager() && request.resource.data.tenantId == getTenantId();
      allow update, delete: if isAuthenticated() && isTenantAdmin() && belongsToTenant(resource.data.tenantId);
    }

    match /report_schedules/{scheduleId} {
      allow read, create, update, delete: if isAuthenticated() && isTenantAdmin() && request.resource.data.tenantId == getTenantId();
    }

    match /api_keys/{keyId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isTenantAdmin() && request.resource.data.tenantId == getTenantId();
      allow update: if isAuthenticated() && isTenantAdmin() && belongsToTenant(resource.data.tenantId);
      allow delete: if isAuthenticated() && isTenantAdmin() && belongsToTenant(resource.data.tenantId);
    }

    match /backup_history/{backupId} {
      allow read: if isAuthenticated() && isTenantAdmin();
      allow create: if isAuthenticated() && isTenantAdmin() && request.resource.data.tenantId == getTenantId();
      allow update, delete: if isPlatformOwner();
    }

    match /team_invites/{inviteId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isTenantAdmin() && request.resource.data.tenantId == getTenantId();
      allow update: if isAuthenticated() && isTenantAdmin();
      allow delete: if isAuthenticated() && isTenantAdmin();
    }

    match /broadcast_logs/{logId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isManager() && request.resource.data.tenantId == getTenantId();
      allow update, delete: if isAuthenticated() && isTenantAdmin();
    }

    match /automation_rules/{ruleId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create, update: if isAuthenticated() && isManager() && request.resource.data.tenantId == getTenantId();
      allow delete: if isAuthenticated() && isTenantAdmin();
    }

    match /otp_store/{otpId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && request.resource.data.tenantId == getTenantId();
      allow update: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow delete: if isAuthenticated() && isTenantAdmin();
    }

    match /zapier_zaps/{zapId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create, update: if isAuthenticated() && isTenantAdmin() && request.resource.data.tenantId == getTenantId();
      allow delete: if isAuthenticated() && isTenantAdmin();
    }

    match /zapier_logs/{logId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && request.resource.data.tenantId == getTenantId();
      allow update, delete: if false;
    }

    match /zapier_webhooks/{webhookId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isTenantAdmin() && request.resource.data.tenantId == getTenantId();
      allow update, delete: if isAuthenticated() && isTenantAdmin();
    }

    match /zoho_mappings/{mappingId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create, update: if isAuthenticated() && isTenantAdmin() && request.resource.data.tenantId == getTenantId();
      allow delete: if isAuthenticated() && isTenantAdmin();
    }

    match /zoho_sync_log/{logId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && request.resource.data.tenantId == getTenantId();
      allow update, delete: if false;
    }

    match /hubspot_mappings/{mappingId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create, update: if isAuthenticated() && isTenantAdmin() && request.resource.data.tenantId == getTenantId();
      allow delete: if isAuthenticated() && isTenantAdmin();
    }

    match /hubspot_sync_log/{logId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && request.resource.data.tenantId == getTenantId();
      allow update, delete: if false;
    }

    match /salesforce_mappings/{mappingId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create, update: if isAuthenticated() && isTenantAdmin() && request.resource.data.tenantId == getTenantId();
      allow delete: if isAuthenticated() && isTenantAdmin();
    }

    match /salesforce_sync_log/{logId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && request.resource.data.tenantId == getTenantId();
      allow update, delete: if false;
    }

    match /tally_sync_log/{logId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && request.resource.data.tenantId == getTenantId();
      allow update, delete: if false;
    }

    match /drive_files/{fileId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isExecutive() && request.resource.data.tenantId == getTenantId();
      allow update: if isAuthenticated() && isManager();
      allow delete: if isAuthenticated() && isTenantAdmin();
    }

    match /drive_shared_drives/{driveId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create, update, delete: if isAuthenticated() && isTenantAdmin();
    }

    match /dropbox_files/{fileId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && isExecutive() && request.resource.data.tenantId == getTenantId();
      allow update: if isAuthenticated() && isManager();
      allow delete: if isAuthenticated() && isTenantAdmin();
    }

    match /webhook_logs/{logId} {
      allow read: if isAuthenticated() && belongsToTenant(resource.data.tenantId);
      allow create: if isAuthenticated() && request.resource.data.tenantId == getTenantId();
      allow update, delete: if false;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
