# 🚀 11 Avatar SMEs CRM — Setup Guide

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Git** | 2.0+ | Version control |
| **Node.js** | 18+ | Local development (optional) |
| **Firebase Account** | Blaze Plan | Backend database, auth, storage |
| **Cloudflare Account** | Free/Paid | API Worker deployment |
| **GitHub Account** | Free | Repository hosting & Pages |

---

## Step 1: Clone Repository

```bash
git clone https://github.com/11avatardigitalhub/11Avatar-SMEs-CRM.git
cd 11Avatar-SMEs-CRM
Step 2: Firebase Setup
2.1 Create Firebase Project
Go to https://console.firebase.google.com/

Add Project → Name: avatar-wa-dual-crm

Enable Google Analytics (optional)

Create Project

2.2 Enable Services
text
Build → Authentication → Get Started
├── Sign-in method → Email/Password → Enable
└── Sign-in method → Google → Enable

Build → Firestore Database → Create Database
├── Location: asia-south1 (Mumbai)
└── Rules: Production mode

Build → Storage → Get Started
└── Rules: Production mode
2.3 Deploy Firestore Rules
Firebase Console → Firestore → Rules tab

Paste contents of firebase/firestore.rules

Click Publish

2.4 Deploy Storage Rules
Firebase Console → Storage → Rules tab

Paste contents of firebase/storage.rules

Click Publish

2.5 Get Firebase Config
Project Settings → General → Your apps → Web App

Copy the firebaseConfig object

Update js/config.js with these values:

apiKey

authDomain

projectId

storageBucket

messagingSenderId

appId

2.6 Create Admin User
Firebase Console → Authentication → Users → Add User

Email: 11avatardigitalhub@gmail.com

Password: (secure password)

Firestore → users collection → Add document (same UID):

json
{
  "name": "11 Avatar Admin",
  "displayName": "11 Avatar Admin",
  "email": "11avatardigitalhub@gmail.com",
  "phone": "8959592006",
  "role": "PLATFORM_OWNER",
  "approvalStatus": "approved",
  "status": "active",
  "permissions": ["all"],
  "moduleAccess": ["DASHBOARD", "LEADS", "PIPELINE", "CLIENTS", "INVOICES", "PAYMENTS", "TASKS", "PROJECTS", "RETAINERS", "WHATSAPP", "TRAINING", "REFERRALS", "REPORTS", "NOTIFICATIONS", "APPOINTMENTS", "SETTINGS"],
  "saasAccess": "both",
  "tenantId": null,
  "createdAt": "2026-07-18T00:00:00.000Z",
  "updatedAt": "2026-07-18T00:00:00.000Z"
}
Step 3: Cloudflare Worker Setup
3.1 Create Worker
Go to https://dash.cloudflare.com/

Workers & Pages → Create → Service Worker

Name: 11avatar-api

Paste contents of workers/api-worker.js

Click Save and Deploy

3.2 Set Environment Variables
text
Settings → Variables → Add:

SENDGRID_API_KEY    (Secret)  → your_sendgrid_key
MSG91_AUTH_KEY      (Secret)  → your_msg91_key
CLOUDWA_API_KEY     (Secret)  → your_cloudwa_key
RAZORPAY_KEY_ID     (Plain)   → your_razorpay_id
RAZORPAY_KEY_SECRET (Secret)  → your_razorpay_secret
STRIPE_SECRET_KEY   (Secret)  → your_stripe_secret
3.3 Configure Custom Domain
Triggers → Custom Domains → Add

Domain: 11avatar-api.11avatardigitalhub.cloud

DNS record will auto-create

Step 4: GitHub Pages Deploy
4.1 Push to GitHub
bash
git add .
git commit -m "Initial setup"
git push origin main
4.2 Enable GitHub Pages
Repository → Settings → Pages

Source: main branch, / (root) folder

Save

URL: https://11avatardigitalhub.github.io/11Avatar-SMEs-CRM/

Step 5: Custom Domain (Optional)
GoDaddy/Namecheap → DNS Settings

Add CNAME record:

Name: SME

Value: 11avatardigitalhub.github.io

GitHub Pages → Custom Domain → SME.11avatardigitalhub.cloud

Step 6: Verify Installation
Open https://SME.11avatardigitalhub.cloud/

Landing page should load with dark theme

Click Sign In

Login with admin credentials

Dashboard should load with sidebar

Troubleshooting
Issue	Solution
404 on manifest.json	Check file exists in root
Firebase not initialized	Verify config.js has correct values
CORS errors	Check Cloudflare Worker allows origin
Auth failed	Verify user exists in Firestore with role PLATFORM_OWNER
Modules not loading	Check browser console for script 404 errors
