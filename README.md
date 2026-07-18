# 11Avatar-SMEs-CRM
enterprise-grade multi-tenant SaaS platform
# 🏢 11 Avatar SMEs CRM

![Version](https://img.shields.io/badge/version-2.0.0-gold)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)
![Status](https://img.shields.io/badge/status-enterprise-green)
![Made In India](https://img.shields.io/badge/made%20in-India-orange)

> **India's Most Affordable Revenue Operating System for Small & Medium Enterprises**

---

## 🎯 What is 11 Avatar SMEs CRM?

A complete, enterprise-grade **Lead-to-Revenue Operating System** built specifically for Indian Small & Medium Enterprises. From capturing leads via WhatsApp to sending GST-compliant invoices — everything in one platform.

---

## ✨ Key Features

| Category | Modules |
|----------|---------|
| **CRM Core** | 📊 Dashboard, 👤 Leads, 🏢 Clients, 📈 Pipeline |
| **Financial** | 🧾 GST Invoices, 💰 Payments, 🔄 Retainers |
| **Operations** | ✅ Tasks, 🚀 Projects, 📅 Appointments |
| **Communication** | 💬 WhatsApp (CloudWA), 🎓 Training LMS, 🔗 Referrals |
| **Intelligence** | 📋 Reports, 🔔 Notifications |
| **System** | ⚙️ Settings, 👥 Multi-Tenant, 🔐 8-Level RBAC |

### 🧾 GST-Ready Invoicing
- Auto CGST/SGST/IGST calculation
- HSN/SAC code support
- E-Way Bill generation (₹50K+ threshold)
- E-Invoice IRN ready
- UPI payment link generation
- Tally ERP integration

### 💬 WhatsApp Business Integration
- CloudWA-powered messaging
- Template messages & bulk broadcasting
- Auto lead capture from WhatsApp
- Payment reminders & invoice sharing

### 📱 PWA — Works Offline
- Install on any device (Android/iOS/Desktop)
- Full offline support via Service Worker
- Push notifications
- Home screen shortcuts

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vanilla JavaScript (ES2020+), HTML5, CSS3 |
| **Backend** | Cloudflare Workers (Serverless API) |
| **Database** | Firebase Firestore (NoSQL, Multi-Tenant) |
| **Auth** | Firebase Authentication |
| **Storage** | Firebase Storage + Google Drive + Dropbox |
| **Hosting** | GitHub Pages / Firebase Hosting |
| **PWA** | Service Worker, Manifest, Offline Cache |

---

## 📁 Project Structure
11-Avatar-SMEs-CRM-main/
├── index.html # Public Landing Page (Dark Theme)
├── app.html # Internal App Shell (Light Theme)
├── offline.html # PWA Offline Fallback
├── manifest.json # PWA Manifest
├── service-worker.js # PWA Service Worker
├── README.md # Project Documentation
│
├── css/
│ └── crm-design-system.css # Master Design System (1,600+ lines)
│
├── js/
│ ├── config.js # Firebase Config, API URLs, Global Settings
│ ├── auth.js # Firebase Auth + Multi-Tenant Registration
│ ├── router.js # Hash-Based SPA Router
│ ├── tenant.js # Multi-Tenant Context + 8-Level RBAC
│ └── firestore.js # Firestore CRUD Service Layer
│
├── modules/ # 16 Business Modules
│ ├── dashboard.js # Real-Time KPI Dashboard
│ ├── leads.js # Advanced Lead Management
│ ├── clients.js # 360° Client View
│ ├── pipeline.js # Visual Kanban Pipeline
│ ├── invoices.js # GST-Compliant Invoicing
│ ├── payments.js # Payment Tracking + UPI
│ ├── tasks.js # Task Management (Kanban + Timer)
│ ├── projects.js # Project Tracking + Gantt
│ ├── retainers.js # MRR/ARR Retainer Management
│ ├── training.js # Training LMS
│ ├── referrals.js # Multi-Level Referral Engine
│ ├── reports.js # Advanced Reports & Analytics
│ ├── whatsapp.js # WhatsApp CloudWA Integration
│ ├── appointments.js # Appointment Scheduling
│ ├── notifications.js # Notification Engine
│ └── settings.js # Organization, RBAC, Billing
│
├── integrations/ # 12 Third-Party Integrations
│ ├── email.js # SendGrid / SMTP
│ ├── sms.js # MSG91 / Twilio
│ ├── calendar.js # Google Calendar + Outlook
│ ├── payment-gateway.js # Razorpay / Stripe / PayPal
│ ├── tally.js # Tally ERP Sync
│ ├── zoho.js # Zoho CRM Sync
│ ├── hubspot.js # HubSpot Sync
│ ├── salesforce.js # Salesforce Sync
│ ├── zapier.js # Zapier Automation
│ ├── google-drive.js # Google Drive Storage
│ ├── dropbox.js # Dropbox Storage
│ └── webhook.js # Custom Webhook Manager
│
├── components/ # 27 Reusable UI Components
│ ├── modal.js # Modal Dialog System
│ ├── toast.js # Toast Notifications
│ ├── kanban-board.js # Drag-Drop Kanban Board
│ ├── chart.js # Chart & Visualization
│ ├── data-table.js # Advanced Data Table
│ ├── tabs.js # Tab Navigation
│ ├── tree-view.js # Hierarchical Tree
│ ├── color-picker.js # Color Picker
│ ├── date-picker.js # Date/Time Picker
│ ├── file-upload.js # File Upload with Preview
│ ├── search-bar.js # Global Search with Autocomplete
│ ├── rich-text-editor.js # WYSIWYG Editor
│ ├── command-palette.js # Spotlight Search (Ctrl+K)
│ ├── context-menu.js # Right-Click Context Menu
│ ├── stepper.js # Multi-Step Wizard
│ ├── timeline.js # Event Timeline
│ ├── carousel.js # Image/Content Slider
│ ├── drawer.js # Slide Panel Drawer
│ ├── tag-input.js # Tag Input with Autocomplete
│ ├── avatar-stack.js # Avatar Group Component
│ ├── breadcrumb.js # Breadcrumb Navigation
│ ├── progress-bar.js # Progress Indicator
│ ├── skeleton.js # Skeleton Loading
│ ├── rating.js # Star Rating
│ ├── infinite-scroll.js # Infinite Scroll
│ └── signature-pad.js # Digital Signature Canvas
│
├── firebase/
│ ├── firestore.rules # Firestore Security Rules (45 collections)
│ ├── storage.rules # Firebase Storage Rules
│ └── firebase.json # Firebase Hosting Config
│
├── workers/
│ └── api-worker.js # Cloudflare Worker API (16 endpoints)
│
├── assets/
│ ├── icons/ # PWA Icons (72-512px)
│ └── images/ # Logo, OG Image, Screenshots
│
└── docs/
├── SETUP.md # Firebase Setup Guide
├── DEPLOY.md # Deployment Guide
├── RBAC.md # Role-Based Access Control
└── API.md # API Documentation

text

---

## 🚀 Quick Start

### Prerequisites
- Firebase project (`avatar-wa-dual-crm`)
- Cloudflare Workers account
- Node.js (optional, for local development)

### Local Development
```bash
# Clone the repository
git clone https://github.com/11avatardigitalhub/11Avatar-SMEs-CRM.git
cd 11Avatar-SMEs-CRM

# Open in browser (no build step required)
# Use Live Server or open index.html directly
Live URLs
Environment	URL
Production	https://SME.11avatardigitalhub.cloud
GitHub Pages	https://11avatardigitalhub.github.io/11Avatar-SMEs-CRM
API Worker	https://11avatar-api.11avatardigitalhub.cloud
🔐 Authentication & Roles
8-Level RBAC Hierarchy
Level	Role	Description
0	PLATFORM_OWNER	Super admin — full system access
1	TENANT_ADMIN	Business owner — full tenant access
2	SUB_ADMIN	Department admin
3	MANAGER	Team manager with reporting
4	TEAM_LEADER	Supervises executives
5	EXECUTIVE	Handles leads & operations
6	VIEWER	Read-only access
7	RESTRICTED	Module-specific access
🔌 API Endpoints
Endpoint	Method	Description
/api/health	GET	Health check
/api/auth/login	POST	User login
/api/auth/register	POST	User registration
/api/email/send	POST	Send email via SendGrid
/api/sms/send	POST	Send SMS via MSG91
/api/whatsapp/send	POST	Send WhatsApp via CloudWA
/api/payments/create-order	POST	Create Razorpay order
/api/payments/verify	POST	Verify payment
/api/invoices/generate-irn	POST	Generate GST E-Invoice IRN
🎨 Design System
Public Pages: Dark theme (#0A0A0A) with Gold (#D4AF37) accents

Internal App: Light theme (#F8F6F0) for readability

Typography: Poppins (headings) + Inter (body)

8 Breakpoints: 320px → 1920px

Glass Morphism: Backdrop blur with semi-transparent backgrounds

3D Effects: Transform, perspective, shadows

📊 File Statistics
Category	Files	Total Lines
Foundation (HTML/CSS/JS Core)	8	~5,000
Business Modules	16	~12,000
Integrations	12	~5,500
UI Components	27	~13,000
Firebase Config	3	~1,200
Worker API	1	~500
TOTAL	~80	~37,000+
🤝 Official Contacts
Purpose	Email
General Info	info@11avatardigitalhub.cloud
Support	support@11avatardigitalhub.cloud
Contact	contact@11avatardigitalhub.cloud
Admin	admin@11avatardigitalhub.cloud
📄 License
This project is licensed under the GPL-3.0 License — see the LICENSE file for details.

🏆 Built With ❤️ for Indian Businesses 🇮🇳
11 Avatar Digital Hub — Empowering SMEs with World-Class Technology
