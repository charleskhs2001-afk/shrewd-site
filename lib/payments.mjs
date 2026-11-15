// Payments through Stripe Checkout, called over Stripe's REST API (no SDK to install).
// Nothing is stored on this server: what a visitor has paid for is read back from Stripe
// using the checkout session ids kept in their signed cookie.

const API = 'https://api.stripe.com/v1/';
const chunk = (s, n) => (String(s || '').match(new RegExp(`.{1,${n}}`, 'gs')) || []);

export function createPayments({ secretKey, fake = false, siteName, unlockPence, subscriptionPence }) {
  const enabled = Boolean(secretKey);
  const fakeSessions = new Map();

  async function stripe(method, path, params) {
    const res = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: params ? new URLSearchParams(params) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error?.message || `Stripe error ${res.status}`);
    return body;
  }

  function unlockMetadata(offer, query) {
    const meta = {
      kind: 'unlock',
      q: String(query || '').slice(0, 200),
      offer_id: offer.id,
      retailer: offer.retailer.slice(0, 200),
      title: offer.title.slice(0, 450),
      price: String(offer.price),
      image: String(offer.image || '').slice(0, 450),
    };
    chunk(offer.url, 450).slice(0, 6).forEach((part, i) => { meta[`url_${i}`] = part; });
    return meta;
  }

  async function createCheckout({ kind, offer, query, successUrl, cancelUrl }) {
    const metadata = kind === 'unlock' ? unlockMetadata(offer, query) : { kind: 'subscription', q: String(query || '').slice(0, 200) };

    if (!enabled && fake) {
      const id = `fake_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      fakeSessions.set(id, {
        id, paid: true, kind, metadata,
        subscription: kind === 'subscription' ? `fakesub_${id}` : null,
        customer: null,
      });
      return { id, url: successUrl.replace('{CHECKOUT_SESSION_ID}', id) };
    }
    if (!enabled) throw new Error('PAYMENTS_NOT_CONFIGURED');

    const params = {
      mode: kind === 'subscription' ? 'subscription' : 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'gbp',
    };
    if (kind === 'subscription') {
      params['line_items[0][price_data][unit_amount]'] = String(subscriptionPence);
      params['line_items[0][price_data][recurring][interval]'] = 'month';
      params['line_items[0][price_data][product_data][name]'] = `${siteName} membership: every lowest price unlocked`;
    } else {
      params['line_items[0][price_data][unit_amount]'] = String(unlockPence);
      params['line_items[0][price_data][product_data][name]'] = `${siteName}: unlock one lowest price`;
    }
    for (const [k, v] of Object.entries(metadata)) params[`metadata[${k}]`] = v;

    const s = await stripe('POST', 'checkout/sessions', params);
    return { id: s.id, url: s.url };
  }

  const paidSessions = new Map(); // paid sessions never change, so cache them for good

  async function getSession(id) {
    if (fakeSessions.has(id)) return fakeSessions.get(id);
    if (!enabled || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return null;
    if (paidSessions.has(id)) return paidSessions.get(id);
    const s = await stripe('GET', `checkout/sessions/${id}`);
    const session = {
      id: s.id,
      paid: s.status === 'complete' && (s.payment_status === 'paid' || s.payment_status === 'no_payment_required'),
      kind: s.metadata?.kind || (s.mode === 'subscription' ? 'subscription' : 'unlock'),
      metadata: s.metadata || {},
      subscription: typeof s.subscription === 'string' ? s.subscription : s.subscription?.id || null,
      customer: typeof s.customer === 'string' ? s.customer : s.customer?.id || null,
    };
    if (session.paid) paidSessions.set(id, session);
    return session;
  }

  const subCache = new Map(); // subscription id -> { active, at }

  async function subscriptionActive(id) {
    if (!id) return false;
    if (id.startsWith('fakesub_')) return fake && !enabled;
    if (!enabled || !/^sub_[A-Za-z0-9]+$/.test(id)) return false;
    const hit = subCache.get(id);
    if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.active;
    try {
      const s = await stripe('GET', `subscriptions/${id}`);
      const active = s.status === 'active' || s.status === 'trialing';
      subCache.set(id, { active, at: Date.now() });
      return active;
    } catch {
      return hit ? hit.active : false;
    }
  }

  async function portalUrl(customer, returnUrl) {
    if (!enabled || !customer) return null;
    const s = await stripe('POST', 'billing_portal/sessions', { customer, return_url: returnUrl });
    return s.url;
  }

  // Rebuild what was bought from the details saved with the payment.
  function snapshot(session) {
    const m = session.metadata || {};
    let url = '';
    for (let i = 0; i < 6 && m[`url_${i}`]; i++) url += m[`url_${i}`];
    return {
      id: m.offer_id,
      retailer: m.retailer,
      title: m.title,
      price: Number(m.price),
      url,
      image: m.image || null,
      query: m.q || '',
    };
  }

  return { enabled, fake: !enabled && fake, createCheckout, getSession, subscriptionActive, portalUrl, snapshot };
}
