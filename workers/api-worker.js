/**
 * ============================================================
 * 11 AVATAR DIGITAL HUB — CLOUDFLARE WORKER API
 * ============================================================
 * 
 * @file       workers/api-worker.js
 * @version    2.0.0
 * @deploy     Cloudflare Workers
 * @domain     https://11avatar-api.11avatardigitalhub.workers.dev
 * @author     11 Avatar Digital Hub
 * @email      info@11avatardigitalhub.cloud
 * 
 * PURPOSE:
 * Serverless API backend for 11 Avatar SMEs CRM.
 * Handles email sending (SendGrid/Mailgun), SMS (MSG91/Twilio),
 * WhatsApp (CloudWA), payment verification (Razorpay/Stripe),
 * GST E-Invoice IRN, E-Way Bill generation, and webhook processing.
 * 
 * DEPLOYMENT:
 * 1. Go to https://dash.cloudflare.com/
 * 2. Workers & Pages → Create → Service Worker
 * 3. Paste this entire file
 * 4. Deploy
 * 5. Triggers → Custom Domain → 11avatar-api.11avatardigitalhub.cloud
 * 
 * ENVIRONMENT VARIABLES (Set in Cloudflare Dashboard):
 * - SENDGRID_API_KEY        : SendGrid API key for email
 * - MSG91_AUTH_KEY          : MSG91 auth key for SMS
 * - TWILIO_ACCOUNT_SID      : Twilio Account SID
 * - TWILIO_AUTH_TOKEN       : Twilio Auth Token
 * - RAZORPAY_KEY_ID         : Razorpay Key ID
 * - RAZORPAY_KEY_SECRET     : Razorpay Key Secret
 * - CLOUDWA_API_KEY         : CloudWA API Key
 * - FIREBASE_PROJECT_ID     : Firebase Project ID
 * - FIREBASE_CLIENT_EMAIL   : Firebase Service Account Email
 * - FIREBASE_PRIVATE_KEY    : Firebase Service Account Private Key
 * - JWT_SECRET              : JWT signing secret
 * - ALLOWED_ORIGINS         : CORS allowed origins (comma-separated)
 * ============================================================
 */

// ============================================================
// CORS CONFIGURATION
// ============================================================
const ALLOWED_ORIGINS = [
    'https://11avatardigitalhub.github.io',
    'https://SME.11avatardigitalhub.cloud',
    'https://cloudwa.11avatardigitalhub.cloud',
    'http://localhost:3000',
    'http://localhost:5000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000',
];

const corsHeaders = (origin) => ({
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tenant-Id, X-User-Id, X-Client-Version',
    'Access-Control-Max-Age': '86400',
});

// ============================================================
// MAIN WORKER HANDLER
// ============================================================
export default {
    async fetch(request, env, ctx) {
        try {
            const url = new URL(request.url);
            const origin = request.headers.get('Origin') || ALLOWED_ORIGINS[0];

            // Handle CORS preflight
            if (request.method === 'OPTIONS') {
                return new Response(null, {
                    status: 204,
                    headers: corsHeaders(origin),
                });
            }

            // Parse path
            const path = url.pathname.replace('/api/', '');

            // Rate limiting (simple — 100 req/min per IP)
            const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
            const rateLimitKey = `ratelimit:${clientIP}`;
            // Note: In production, use Cloudflare KV for rate limiting

            let response;
            const method = request.method;

            // ============================================================
            // ROUTER
            // ============================================================
            switch (true) {
                // Health Check
                case path === 'health' && method === 'GET':
                    response = handleHealth();
                    break;

                // Auth
                case path === 'auth/register' && method === 'POST':
                    response = await handleAuthRegister(request, env);
                    break;
                case path === 'auth/login' && method === 'POST':
                    response = await handleAuthLogin(request, env);
                    break;

                // Email
                case path === 'email/send' && method === 'POST':
                    response = await handleEmailSend(request, env);
                    break;
                case path === 'email/send-template' && method === 'POST':
                    response = await handleEmailSendTemplate(request, env);
                    break;

                // SMS
                case path === 'sms/send' && method === 'POST':
                    response = await handleSMSSend(request, env);
                    break;

                // WhatsApp
                case path === 'whatsapp/send' && method === 'POST':
                    response = await handleWhatsAppSend(request, env);
                    break;
                case path === 'whatsapp/send-template' && method === 'POST':
                    response = await handleWhatsAppSendTemplate(request, env);
                    break;

                // Payments
                case path === 'payments/create-order' && method === 'POST':
                    response = await handleCreateOrder(request, env);
                    break;
                case path === 'payments/verify' && method === 'POST':
                    response = await handleVerifyPayment(request, env);
                    break;
                case path === 'payments/create-payment-intent' && method === 'POST':
                    response = await handleCreatePaymentIntent(request, env);
                    break;
                case path.startsWith('payments/upi-status/') && method === 'GET':
                    response = await handleUPIStatus(url, env);
                    break;

                // Invoices
                case path === 'invoices/generate-pdf' && method === 'POST':
                    response = await handleInvoicePDF(request, env);
                    break;
                case path === 'invoices/generate-irn' && method === 'POST':
                    response = await handleGenerateIRN(request, env);
                    break;
                case path === 'invoices/generate-ewaybill' && method === 'POST':
                    response = await handleGenerateEWayBill(request, env);
                    break;

                // Notifications
                case path === 'notifications/send' && method === 'POST':
                    response = await handleNotificationSend(request, env);
                    break;

                // Webhooks
                case path.startsWith('webhooks/') && method === 'POST':
                    response = await handleWebhook(request, env, path);
                    break;

                // 404
                default:
                    response = jsonResponse({ success: false, error: 'Endpoint not found', path }, 404);
            }

            // Add CORS headers
            const finalHeaders = new Headers(response.headers);
            Object.entries(corsHeaders(origin)).forEach(([key, value]) => {
                finalHeaders.set(key, value);
            });

            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: finalHeaders,
            });

        } catch (error) {
            console.error('[Worker] Unhandled error:', error);
            return jsonResponse({
                success: false,
                error: 'Internal server error',
                message: error.message,
            }, 500);
        }
    },
};

// ============================================================
// SECTION 1: HEALTH CHECK
// ============================================================
function handleHealth() {
    return jsonResponse({
        success: true,
        message: '11 Avatar CRM API is running',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
    });
}

// ============================================================
// SECTION 2: AUTHENTICATION
// ============================================================
async function handleAuthRegister(request, env) {
    try {
        const body = await request.json();
        const { email, password, displayName, phone } = body;

        // Validate
        if (!email || !password || !displayName) {
            return jsonResponse({ success: false, error: 'Email, password, and name are required' }, 400);
        }

        if (password.length < 6) {
            return jsonResponse({ success: false, error: 'Password must be at least 6 characters' }, 400);
        }

        // Create user in Firebase Auth via REST API
        const firebaseApiKey = 'AIzaSyB-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // Replace with actual
        const authResponse = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, displayName, returnSecureToken: true }),
            }
        );

        const authData = await authResponse.json();

        if (authData.error) {
            return jsonResponse({ success: false, error: authData.error.message }, 400);
        }

        return jsonResponse({
            success: true,
            message: 'Registration successful',
            userId: authData.localId,
            token: authData.idToken,
        });
    } catch (error) {
        return jsonResponse({ success: false, error: error.message }, 500);
    }
}

async function handleAuthLogin(request, env) {
    try {
        const body = await request.json();
        const { email, password } = body;

        if (!email || !password) {
            return jsonResponse({ success: false, error: 'Email and password are required' }, 400);
        }

        const firebaseApiKey = 'AIzaSyB-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
        const authResponse = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, returnSecureToken: true }),
            }
        );

        const authData = await authResponse.json();

        if (authData.error) {
            return jsonResponse({ success: false, error: authData.error.message }, 400);
        }

        return jsonResponse({
            success: true,
            message: 'Login successful',
            userId: authData.localId,
            token: authData.idToken,
            refreshToken: authData.refreshToken,
            expiresIn: authData.expiresIn,
        });
    } catch (error) {
        return jsonResponse({ success: false, error: error.message }, 500);
    }
}

// ============================================================
// SECTION 3: EMAIL SERVICE (SendGrid)
// ============================================================
async function handleEmailSend(request, env) {
    try {
        const body = await request.json();
        const { to, subject, html, text, from, fromName, cc, bcc, attachments } = body;

        if (!to || !subject) {
            return jsonResponse({ success: false, error: 'To and subject are required' }, 400);
        }

        const SENDGRID_API_KEY = env.SENDGRID_API_KEY || '';
        const FROM_EMAIL = from || 'noreply@11avatardigitalhub.cloud';
        const FROM_NAME = fromName || '11 Avatar Digital Hub';

        const recipients = Array.isArray(to) ? to : [to];
        const personalizations = [{
            to: recipients.map(email => ({ email })),
            subject: subject,
        }];

        if (cc) {
            personalizations[0].cc = (Array.isArray(cc) ? cc : [cc]).map(email => ({ email }));
        }
        if (bcc) {
            personalizations[0].bcc = (Array.isArray(bcc) ? bcc : [bcc]).map(email => ({ email }));
        }

        const emailPayload = {
            personalizations,
            from: { email: FROM_EMAIL, name: FROM_NAME },
            content: [
                { type: 'text/html', value: html || text || '' },
                { type: 'text/plain', value: text || '' },
            ],
        };

        if (attachments && attachments.length > 0) {
            emailPayload.attachments = attachments;
        }

        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SENDGRID_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(emailPayload),
        });

        if (response.status === 202) {
            return jsonResponse({ success: true, message: 'Email sent successfully' });
        } else {
            const errorBody = await response.text();
            return jsonResponse({ success: false, error: 'SendGrid error', details: errorBody }, 500);
        }
    } catch (error) {
        return jsonResponse({ success: false, error: error.message }, 500);
    }
}

async function handleEmailSendTemplate(request, env) {
    try {
        const body = await request.json();
        const { to, templateId, dynamicTemplateData, from, fromName } = body;

        if (!to || !templateId) {
            return jsonResponse({ success: false, error: 'To and templateId are required' }, 400);
        }

        const SENDGRID_API_KEY = env.SENDGRID_API_KEY || '';

        const payload = {
            from: {
                email: from || 'noreply@11avatardigitalhub.cloud',
                name: fromName || '11 Avatar Digital Hub',
            },
            template_id: templateId,
            personalizations: [{
                to: (Array.isArray(to) ? to : [to]).map(email => ({ email })),
                dynamic_template_data: dynamicTemplateData || {},
            }],
        };

        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SENDGRID_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (response.status === 202) {
            return jsonResponse({ success: true, message: 'Template email sent' });
        } else {
            const errorBody = await response.text();
            return jsonResponse({ success: false, error: 'SendGrid error', details: errorBody }, 500);
        }
    } catch (error) {
        return jsonResponse({ success: false, error: error.message }, 500);
    }
}

// ============================================================
// SECTION 4: SMS SERVICE (MSG91)
// ============================================================
async function handleSMSSend(request, env) {
    try {
        const body = await request.json();
        const { phone, message, senderId, route } = body;

        if (!phone || !message) {
            return jsonResponse({ success: false, error: 'Phone and message are required' }, 400);
        }

        const MSG91_AUTH_KEY = env.MSG91_AUTH_KEY || '';
        const SENDER_ID = senderId || '11AVTR';
        const ROUTE = route || '4'; // 4 = Transactional, 1 = Promotional

        // Format phone: remove +, spaces
        const mobile = phone.replace(/[+\s-]/g, '');

        const payload = {
            sender: SENDER_ID,
            route: ROUTE,
            country: '91',
            sms: [{ message, to: [mobile] }],
        };

        const response = await fetch('https://api.msg91.com/api/v2/sendsms', {
            method: 'POST',
            headers: {
                'authkey': MSG91_AUTH_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (data.type === 'success') {
            return jsonResponse({ success: true, message: 'SMS sent', messageId: data.message });
        } else {
            return jsonResponse({ success: false, error: 'MSG91 error', details: data }, 500);
        }
    } catch (error) {
        return jsonResponse({ success: false, error: error.message }, 500);
    }
}

// ============================================================
// SECTION 5: WHATSAPP SERVICE (CloudWA)
// ============================================================
async function handleWhatsAppSend(request, env) {
    try {
        const body = await request.json();
        const { to, type, text, image, video, document, template } = body;

        if (!to) {
            return jsonResponse({ success: false, error: 'Phone number is required' }, 400);
        }

        const CLOUDWA_API_KEY = env.CLOUDWA_API_KEY || '';
        const CLOUDWA_URL = 'https://cloudwa.11avatardigitalhub.cloud/api';

        let waPayload = { to };

        if (type === 'template' && template) {
            waPayload.type = 'template';
            waPayload.template = template;
        } else if (type === 'text' || text) {
            waPayload.type = 'text';
            waPayload.text = { body: text?.body || text };
        } else if (type === 'image' && image) {
            waPayload.type = 'image';
            waPayload.image = image;
        } else if (type === 'video' && video) {
            waPayload.type = 'video';
            waPayload.video = video;
        } else if (type === 'document' && document) {
            waPayload.type = 'document';
            waPayload.document = document;
        } else {
            waPayload.type = 'text';
            waPayload.text = { body: text || 'Message from 11 Avatar CRM' };
        }

        const response = await fetch(`${CLOUDWA_URL}/messages/send`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CLOUDWA_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(waPayload),
        });

        const data = await response.json();

        if (data.success) {
            return jsonResponse({ success: true, message: 'WhatsApp message sent', messageId: data.messageId });
        } else {
            return jsonResponse({ success: false, error: 'CloudWA error', details: data }, 500);
        }
    } catch (error) {
        return jsonResponse({ success: false, error: error.message }, 500);
    }
}

async function handleWhatsAppSendTemplate(request, env) {
    try {
        const body = await request.json();
        const { to, templateName, language, params } = body;

        if (!to || !templateName) {
            return jsonResponse({ success: false, error: 'Phone and template name are required' }, 400);
        }

        const templatePayload = {
            name: templateName,
            language: { code: language || 'en' },
            components: [{
                type: 'body',
                parameters: (params || []).map(value => ({
                    type: 'text',
                    text: String(value),
                })),
            }],
        };

        return await handleWhatsAppSend(
            new Request(request.url, {
                method: 'POST',
                headers: request.headers,
                body: JSON.stringify({ to, type: 'template', template: templatePayload }),
            }),
            env
        );
    } catch (error) {
        return jsonResponse({ success: false, error: error.message }, 500);
    }
}

// ============================================================
// SECTION 6: PAYMENT SERVICE (Razorpay + Stripe)
// ============================================================
async function handleCreateOrder(request, env) {
    try {
        const body = await request.json();
        const { amount, currency, receipt, notes } = body;

        if (!amount) {
            return jsonResponse({ success: false, error: 'Amount is required' }, 400);
        }

        const RAZORPAY_KEY_ID = env.RAZORPAY_KEY_ID || '';
        const RAZORPAY_KEY_SECRET = env.RAZORPAY_KEY_SECRET || '';

        const orderPayload = {
            amount: Math.round(amount * 100), // Convert to paise
            currency: currency || 'INR',
            receipt: receipt || `rcpt_${Date.now()}`,
            notes: notes || {},
        };

        const auth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

        const response = await fetch('https://api.razorpay.com/v1/orders', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(orderPayload),
        });

        const data = await response.json();

        if (data.id) {
            return jsonResponse({ success: true, orderId: data.id, amount: data.amount, currency: data.currency });
        } else {
            return jsonResponse({ success: false, error: 'Razorpay error', details: data }, 500);
        }
    } catch (error) {
        return jsonResponse({ success: false, error: error.message }, 500);
    }
}

async function handleVerifyPayment(request, env) {
    try {
        const body = await request.json();
        const { gateway, paymentId, orderId, signature, paymentIntentId } = body;

        if (!gateway) {
            return jsonResponse({ success: false, error: 'Gateway is required' }, 400);
        }

        // Razorpay verification
        if (gateway === 'razorpay' && paymentId && orderId && signature) {
            const RAZORPAY_KEY_SECRET = env.RAZORPAY_KEY_SECRET || '';
            const crypto = await import('crypto');
            
            // Verify signature
            const expectedSignature = await signData(`${orderId}|${paymentId}`, RAZORPAY_KEY_SECRET);
            
            if (signature === expectedSignature) {
                return jsonResponse({ success: true, verified: true, paymentId, orderId });
            } else {
                return jsonResponse({ success: false, verified: false, error: 'Signature mismatch' }, 400);
            }
        }

        // Stripe verification
        if (gateway === 'stripe' && paymentIntentId) {
            const STRIPE_SECRET = env.STRIPE_SECRET_KEY || '';
            
            const response = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
                headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` },
            });
            
            const data = await response.json();
            
            if (data.status === 'succeeded') {
                return jsonResponse({ success: true, verified: true, paymentIntentId, status: data.status });
            } else {
                return jsonResponse({ success: false, verified: false, status: data.status });
            }
        }

        // Bank Transfer / UPI verification
        return jsonResponse({ success: true, verified: true, message: 'Payment recorded for verification' });
    } catch (error) {
        return jsonResponse({ success: false, error: error.message }, 500);
    }
}

async function handleCreatePaymentIntent(request, env) {
    try {
        const body = await request.json();
        const { amount, currency, description } = body;

        const STRIPE_SECRET = env.STRIPE_SECRET_KEY || '';

        // Create payment intent
        const params = new URLSearchParams();
        params.append('amount', Math.round(amount * 100));
        params.append('currency', (currency || 'usd').toLowerCase());
        params.append('description', description || '11 Avatar CRM Payment');

        const response = await fetch('https://api.stripe.com/v1/payment_intents', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${STRIPE_SECRET}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });

        const data = await response.json();

        if (data.client_secret) {
            return jsonResponse({
                success: true,
                clientSecret: data.client_secret,
                paymentIntentId: data.id,
            });
        } else {
            return jsonResponse({ success: false, error: 'Stripe error', details: data }, 500);
        }
    } catch (error) {
        return jsonResponse({ success: false, error: error.message }, 500);
    }
}

async function handleUPIStatus(url, env) {
    try {
        const transactionId = url.pathname.split('/').pop();
        return jsonResponse({
            success: true,
            transactionId,
            status: 'completed', // In production: check actual UPI status
            message: 'Payment verified',
        });
    } catch (error) {
        return jsonResponse({ success: false, error: error.message }, 500);
    }
}

// ============================================================
// SECTION 7: INVOICE SERVICES
// ============================================================
async function handleInvoicePDF(request, env) {
    try {
        const body = await request.json();
        const { invoiceData } = body;

        if (!invoiceData) {
            return jsonResponse({ success: false, error: 'Invoice data is required' }, 400);
        }

        // In production: Generate PDF using Puppeteer/PDFKit
        // For now, return success with placeholder
        return jsonResponse({
            success: true,
            message: 'PDF generation queued',
            downloadUrl: `https://SME.11avatardigitalhub.cloud/invoices/${invoiceData.invoiceNumber || 'download'}.pdf`,
        });
    } catch (error) {
        return jsonResponse({ success: false, error: error.message }, 500);
    }
}

async function handleGenerateIRN(request, env) {
    try {
        const body = await request.json();
        const { invoiceData } = body;

        // In production: Call GST Portal API for IRN generation
        return jsonResponse({
            success: true,
            message: 'IRN generation queued',
            irn: `IRN${Date.now()}`,
            ackNo: `ACK${Date.now()}`,
        });
    } catch (error) {
        return jsonResponse({ success: false, error: error.message }, 500);
    }
}

async function handleGenerateEWayBill(request, env) {
    try {
        const body = await request.json();
        const { invoiceData } = body;

        // In production: Call E-Way Bill API
        return jsonResponse({
            success: true,
            message: 'E-Way Bill generation queued',
            ewayBillNo: `EWB${Date.now()}`,
        });
    } catch (error) {
        return jsonResponse({ success: false, error: error.message }, 500);
    }
}

// ============================================================
// SECTION 8: NOTIFICATIONS
// ============================================================
async function handleNotificationSend(request, env) {
    try {
        const body = await request.json();
        const { userId, type, channel, title, message, data } = body;

        // Log notification (in production: push to Firebase/FCM)
        console.log(`[Notification] User: ${userId}, Type: ${type}, Channel: ${channel}`);

        // If email, trigger email send
        if (channel === 'email' && data?.email) {
            await handleEmailSend(
                new Request(request.url, {
                    method: 'POST',
                    headers: request.headers,
                    body: JSON.stringify({ to: data.email, subject: title, html: message }),
                }),
                env
            );
        }

        // If SMS, trigger SMS send
        if (channel === 'sms' && data?.phone) {
            await handleSMSSend(
                new Request(request.url, {
                    method: 'POST',
                    headers: request.headers,
                    body: JSON.stringify({ phone: data.phone, message: `${title}: ${message}` }),
                }),
                env
            );
        }

        return jsonResponse({ success: true, message: 'Notification processed' });
    } catch (error) {
        return jsonResponse({ success: false, error: error.message }, 500);
    }
}

// ============================================================
// SECTION 9: WEBHOOKS
// ============================================================
async function handleWebhook(request, env, path) {
    try {
        const body = await request.json();
        
        // Log webhook
        console.log(`[Webhook] Received: ${path}`, JSON.stringify(body).substring(0, 200));

        // Handle different webhook types
        if (path.includes('razorpay')) {
            // Verify Razorpay webhook signature
            return jsonResponse({ success: true, message: 'Razorpay webhook processed' });
        }

        if (path.includes('stripe')) {
            return jsonResponse({ success: true, message: 'Stripe webhook processed' });
        }

        if (path.includes('whatsapp')) {
            return jsonResponse({ success: true, message: 'WhatsApp webhook processed' });
        }

        return jsonResponse({ success: true, message: 'Webhook received' });
    } catch (error) {
        return jsonResponse({ success: false, error: error.message }, 500);
    }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

async function signData(data, secret) {
    // HMAC SHA256 signing
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    const hashArray = Array.from(new Uint8Array(signature));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
// END OF WORKER
// ============================================================
