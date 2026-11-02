/**
 * Lugoba Miracle Center Church — Relworx mobile money donations.
 *
 * Secrets (never put these in HTML/JS):
 *   firebase functions:secrets:set RELWORX_API_KEY
 *   firebase functions:secrets:set RELWORX_ACCOUNT_NO
 */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.firestore();

const RELWORX_BASE = 'https://payments.relworx.com/api/mobile-money';
const SECRETS = ['RELWORX_API_KEY', 'RELWORX_ACCOUNT_NO'];
const MIN_AMOUNT = 1000;
const MAX_AMOUNT = 5000000; // Relworx limit for UGX mobile money
const PURPOSES = ['Tithe', 'Offering', 'Building Fund', 'Missions & Outreach', 'Support the Needy', 'Other'];
const ALLOWED_ORIGINS = [
  'https://www.lugobamiraclecenterchurch.com',
  'https://lugobamiraclecenterchurch.com',
  'http://localhost:5000',
  'http://localhost:8080',
  'http://127.0.0.1:5500'
];

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '3600');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return true; }
  return false;
}

// 07xxxxxxxx / 2567xxxxxxxx / +2567xxxxxxxx -> +2567xxxxxxxx (or '' if invalid)
function normPhone(v) {
  const d = String(v || '').replace(/[^\d]/g, '');
  if (/^07\d{8}$/.test(d)) return '+256' + d.slice(1);
  if (/^2567\d{8}$/.test(d)) return '+' + d;
  if (/^7\d{8}$/.test(d)) return '+256' + d;
  return '';
}

function newReceiptNo() {
  return 'LMCC-' + crypto.randomBytes(5).toString('hex').toUpperCase(); // 15 chars (Relworx wants 8–36)
}

function publicView(d) {
  return {
    receiptNo: d.receiptNo, name: d.name, purpose: d.purpose, amount: d.amount,
    currency: d.currency, method: d.method, status: d.status, reference: d.reference || ''
  };
}

async function relworx(path, init) {
  const r = await fetch(RELWORX_BASE + path, Object.assign({
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.relworx.v2',
      'Authorization': 'Bearer ' + process.env.RELWORX_API_KEY
    }
  }, init));
  let body = {};
  try { body = await r.json(); } catch (e) { /* non-JSON */ }
  return { ok: r.ok, status: r.status, body };
}

// ── 1. Start a donation: creates the record and sends the PIN prompt ────────
exports.relworxRequestPayment = functions
  .runWith({ secrets: SECRETS, timeoutSeconds: 30, memory: '256MB' })
  .https.onRequest(async (req, res) => {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const b = req.body || {};
    const name = String(b.name || '').trim();
    const email = String(b.email || '').trim().slice(0, 160);
    const purpose = String(b.purpose || '');
    const amount = Math.round(Number(b.amount));
    const phone = normPhone(b.phone);
    const payFrom = normPhone(b.payFrom || b.phone);
    const method = b.method === 'airtel' ? 'airtel' : 'mtn';

    if (!name || name.length > 120) return res.status(400).json({ error: 'Please enter your full name.' });
    if (!phone) return res.status(400).json({ error: 'Please enter a valid Ugandan phone number.' });
    if (!payFrom) return res.status(400).json({ error: 'Please enter a valid mobile money number.' });
    if (!PURPOSES.includes(purpose)) return res.status(400).json({ error: 'Invalid giving purpose.' });
    if (!amount || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
      return res.status(400).json({ error: 'Amount must be between UGX ' + MIN_AMOUNT.toLocaleString('en-UG') + ' and UGX ' + MAX_AMOUNT.toLocaleString('en-UG') + '.' });
    }

    const receiptNo = newReceiptNo();
    const ref = db.collection('donations').doc(receiptNo);
    const record = {
      receiptNo, name, phone, email, purpose, amount, currency: 'UGX', method,
      payFrom, reference: '', status: 'pending', gateway: 'relworx',
      at: admin.firestore.FieldValue.serverTimestamp()
    };
    await ref.set(record);

    try {
      const r = await relworx('/request-payment', {
        method: 'POST',
        body: JSON.stringify({
          account_no: process.env.RELWORX_ACCOUNT_NO,
          reference: receiptNo,
          msisdn: payFrom,
          currency: 'UGX',
          amount: amount,
          description: ('Donation - ' + purpose).slice(0, 100)
        })
      });
      if (!r.ok || !r.body.success || !r.body.internal_reference) {
        console.error('Relworx request failed', r.status, JSON.stringify(r.body));
        await ref.update({ status: 'failed', failReason: String(r.body.message || r.status).slice(0, 200) });
        const msg = r.status === 429
          ? 'Too many attempts for this number. Please wait 10 minutes and try again.'
          : (r.body.message || 'The payment request could not be sent. Please try again.');
        return res.status(502).json({ error: msg });
      }
      await ref.update({ internalReference: r.body.internal_reference });
      return res.json({ receiptNo, message: 'Check your phone and enter your Mobile Money PIN to approve.' });
    } catch (err) {
      console.error('Relworx request error', err);
      await ref.update({ status: 'failed', failReason: 'network error' });
      return res.status(502).json({ error: 'Could not reach the payment service. Please try again.' });
    }
  });

// ── 2. Poll status: asks Relworx and updates the record ────────────────────
exports.relworxCheckStatus = functions
  .runWith({ secrets: SECRETS, timeoutSeconds: 30, memory: '256MB' })
  .https.onRequest(async (req, res) => {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const receiptNo = String((req.body || {}).receiptNo || '');
    if (!/^LMCC-[0-9A-F]{10}$/.test(receiptNo)) return res.status(400).json({ error: 'Invalid receipt number.' });

    const ref = db.collection('donations').doc(receiptNo);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Donation not found.' });
    const d = snap.data();

    if (d.status !== 'pending' || !d.internalReference) return res.json(publicView(d));

    try {
      const qs = '/check-request-status?internal_reference=' + encodeURIComponent(d.internalReference) +
                 '&account_no=' + encodeURIComponent(process.env.RELWORX_ACCOUNT_NO);
      const r = await relworx(qs, { method: 'GET' });
      const s = String(r.body.request_status || r.body.status || '').toLowerCase();

      if (r.ok && s === 'success') {
        // never trust a "paid" status unless the amount matches what we asked for
        if (Number(r.body.amount) === Number(d.amount)) {
          await ref.update({
            status: 'paid',
            reference: String(r.body.provider_transaction_id || ''),
            provider: String(r.body.provider || ''),
            paidAt: admin.firestore.FieldValue.serverTimestamp()
          });
          d.status = 'paid'; d.reference = String(r.body.provider_transaction_id || '');
        } else {
          console.error('Amount mismatch', receiptNo, r.body.amount, d.amount);
          await ref.update({ status: 'review', failReason: 'amount mismatch' });
          d.status = 'review';
        }
      } else if (r.ok && s === 'failed') {
        await ref.update({ status: 'failed', failReason: String(r.body.message || '').slice(0, 200) });
        d.status = 'failed';
      }
    } catch (err) {
      console.error('Relworx status error', err); // leave as pending; client will retry
    }
    return res.json(publicView(d));
  });
