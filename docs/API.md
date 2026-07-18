# 🔌 11 Avatar SMEs CRM — API Documentation

**Base URL:** `https://11avatar-api.11avatardigitalhub.workers.dev/api`

---

## Authentication

All API requests (except health & auth) require:
Authorization: Bearer <firebase_id_token>
X-Tenant-Id: <tenant_id>

text

---

## Endpoints

### Health Check
GET /api/health

Response 200:
{
"success": true,
"message": "11 Avatar CRM API is running",
"version": "2.0.0",
"timestamp": "2026-07-18T10:30:00Z"
}

text

---

### Authentication

#### Register
POST /api/auth/register

Request:
{
"email": "user@example.com",
"password": "securePass123",
"displayName": "John Doe",
"phone": "919876543210"
}

Response 200:
{
"success": true,
"message": "Registration successful",
"userId": "abc123",
"token": "eyJhbG..."
}

text

#### Login
POST /api/auth/login

Request:
{
"email": "user@example.com",
"password": "securePass123"
}

Response 200:
{
"success": true,
"message": "Login successful",
"userId": "abc123",
"token": "eyJhbG...",
"refreshToken": "...",
"expiresIn": 3600
}

text

---

### Email

#### Send Email
POST /api/email/send

Request:
{
"to": ["recipient@example.com"],
"subject": "Test Email",
"html": "<h1>Hello</h1><p>This is a test</p>",
"from": "noreply@11avatardigitalhub.cloud",
"fromName": "11 Avatar CRM"
}

Response 200:
{
"success": true,
"message": "Email sent successfully"
}

text

---

### SMS

#### Send SMS
POST /api/sms/send

Request:
{
"phone": "919876543210",
"message": "Your OTP is 123456",
"senderId": "11AVTR",
"route": "4"
}

Response 200:
{
"success": true,
"message": "SMS sent",
"messageId": "msg_abc123"
}

text

---

### WhatsApp

#### Send WhatsApp Message
POST /api/whatsapp/send

Request:
{
"to": "919876543210",
"type": "text",
"text": { "body": "Hello from 11 Avatar CRM!" }
}

Response 200:
{
"success": true,
"message": "WhatsApp message sent",
"messageId": "wamid_abc123"
}

text

#### Send WhatsApp Template
POST /api/whatsapp/send-template

Request:
{
"to": "919876543210",
"templateName": "payment_reminder",
"language": "en",
"params": ["John", "₹5,000", "INV-001", "25 Jul 2026"]
}

text

---

### Payments

#### Create Razorpay Order
POST /api/payments/create-order

Request:
{
"amount": 5000,
"currency": "INR",
"receipt": "rcpt_001",
"notes": { "invoiceId": "INV-001" }
}

Response 200:
{
"success": true,
"orderId": "order_abc123",
"amount": 500000,
"currency": "INR"
}

text

#### Verify Payment
POST /api/payments/verify

Request:
{
"gateway": "razorpay",
"paymentId": "pay_abc123",
"orderId": "order_abc123",
"signature": "sign_xyz"
}

Response 200:
{
"success": true,
"verified": true,
"paymentId": "pay_abc123",
"orderId": "order_abc123"
}

text

#### Create Stripe Payment Intent
POST /api/payments/create-payment-intent

Request:
{
"amount": 50,
"currency": "usd",
"description": "CRM Subscription"
}

Response 200:
{
"success": true,
"clientSecret": "pi_xxx_secret_yyy",
"paymentIntentId": "pi_xxx"
}

text

---

### Invoices

#### Generate PDF
POST /api/invoices/generate-pdf

Request:
{
"invoiceData": { "invoiceNumber": "INV-26-0001", ... }
}

Response 200:
{
"success": true,
"message": "PDF generation queued",
"downloadUrl": "https://SME.11avatardigitalhub.cloud/invoices/INV-26-0001.pdf"
}

text

#### Generate IRN (GST E-Invoice)
POST /api/invoices/generate-irn

Request:
{
"invoiceData": { ... }
}

Response 200:
{
"success": true,
"irn": "IRN123456789",
"ackNo": "ACK123456789"
}

text

---

### Notifications

#### Send Notification
POST /api/notifications/send

Request:
{
"userId": "user123",
"type": "payment_received",
"channel": "email",
"title": "Payment Received",
"message": "Payment of ₹5,000 received",
"data": { "email": "user@example.com" }
}

Response 200:
{
"success": true,
"message": "Notification processed"
}

text

---

## Error Responses

All errors follow this format:
```json
{
  "success": false,
  "error": "Error message",
  "details": {}
}
HTTP Status Codes
Code	Meaning
200	Success
400	Bad Request / Validation Error
401	Unauthorized
403	Forbidden
404	Endpoint Not Found
429	Rate Limited
500	Internal Server Error
Rate Limits
100 requests/minute per IP address

1000 emails/day (SendGrid free tier)

100 SMS/day (MSG91 test)

WhatsApp: 20 messages/minute

Exceeding limits returns:

json
{
  "success": false,
  "error": "Rate limit exceeded. Try again in 60 seconds."
}
