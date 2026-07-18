─────────────────────────────────────────────────────────┐
│ DEPLOYMENT MAP │
├─────────────────────────────────────────────────────────┤
│ │
│ GitHub Pages (Static) │
│ └── index.html, app.html, css/, js/, modules/* │
│ components/, integrations/ │
│ URL: SME.11avatardigitalhub.cloud │
│ │
│ Firebase (Backend) │
│ └── Authentication, Firestore, Storage │
│ Project: avatar-wa-dual-crm │
│ │
│ Cloudflare Workers (API) │
│ └── email, sms, whatsapp, payments, invoices │
│ URL: 11avatar-api.11avatardigitalhub.cloud │
│ │
└─────────────────────────────────────────────────────────┘

text

---

## Quick Deploy (All at once)

### 1. Push Code
```bash
git add .
git commit -m "Deploy v2.0.0"
git push origin main
✅ GitHub Pages auto-deploys

2. Deploy Firebase Rules
bash
# Via Firebase Console (or CLI)
firebase deploy --only firestore:rules
firebase deploy --only storage:rules
3. Deploy Cloudflare Worker
bash
# Via Dashboard or CLI
npx wrangler deploy workers/api-worker.js
Environment-Specific Configs
Development (Local)
javascript
// js/config.js
API_URL: 'http://localhost:8787/api'
FIREBASE_EMULATOR: true
Staging (GitHub Pages)
javascript
// js/config.js  
API_URL: 'https://11avatar-api.11avatardigitalhub.workers.dev/api'
FIREBASE_PROJECT: 'avatar-wa-dual-crm'
Production (Custom Domain)
javascript
// js/config.js
API_URL: 'https://11avatar-api.11avatardigitalhub.cloud/api'
FIREBASE_PROJECT: 'avatar-wa-dual-crm'
Rollback Procedure
GitHub Pages
bash
git revert HEAD --no-edit
git push origin main
Firebase Rules
bash
firebase deploy --only firestore:rules --rollback
Cloudflare Worker
bash
npx wrangler rollback 11avatar-api
Post-Deploy Checklist
Landing page loads (index.html)

Sign In works with Firebase Auth

App shell loads (app.html)

Sidebar navigation works

Dashboard module loads

Firestore read/write works

API health check returns 200

PWA manifest loads

Service worker registers

Offline page works

All CSS loads properly

No console errors
