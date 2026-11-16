// Price comparison site server. Needs Node.js 18 or newer and nothing else:
//   node server.mjs
// Settings come from a .env file next to this one (see .env.example).

import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

import { runSearch, searchUrl } from './lib/search.mjs';
import { parseSearch, looksBlocked } from './lib/parse.mjs';
import { present } from './lib/paywall.mjs';
import { createPayments } from './lib/payments.mjs';
import { RETAILERS } from './lib/retailers.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const CACHE_DIR = path.join(DATA, 'cache');

// ---------- settings ----------
if (existsSync(path.join(ROOT, '.env'))) {
  for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}
const env = (k, d = '') => process.env[k] ?? d;
const PORT = Number(env('PORT', '3000'));
// The site's public address. Render provides RENDER_EXTERNAL_URL automatically; set
// PUBLIC_URL yourself when using your own domain.
const PUBLIC_URL = (env('PUBLIC_URL') || env('RENDER_EXTERNAL_URL') || `http://localhost:${PORT}`).trim().replace(/\/+$/, '');
if (!/^https?:\/\/[^/]+$/.test(PUBLIC_URL)) {
  console.error(`PUBLIC_URL must look like https://example.com (got "${PUBLIC_URL}").`);
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' || env('RENDER')) {
  if (PUBLIC_URL.includes('localhost')) console.warn('Warning: PUBLIC_URL is not set, so payments will return to localhost.');
  if (!env('SESSION_SECRET')) console.warn('Warning: SESSION_SECRET is not set; paid access will reset on every deploy.');
}
const SITE_NAME = env('SITE_NAME', 'Shrewd');
const UNLOCK_PENCE = Number(env('UNLOCK_PENCE', '200'));
const SUBSCRIPTION_PENCE = Number(env('SUBSCRIPTION_PENCE', '1200'));
const CACHE_MS = Number(env('CACHE_HOURS', '1')) * 3600 * 1000;
const LOCK_SINGLE_OFFERS = env('LOCK_SINGLE_OFFERS') === '1';
const ALLOW_VERIFIED_UK = env('ALLOW_VERIFIED_UK', '1') !== '0';
const TRUST_PROXY = env('TRUST_PROXY') === '1';
const SECURE = PUBLIC_URL.startsWith('https://');

mkdirSync(CACHE_DIR, { recursive: true });

function loadSecret() {
  if (env('SESSION_SECRET')) return env('SESSION_SECRET');
  const file = path.join(DATA, 'secret.txt');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const s = crypto.randomBytes(32).toString('hex');
  writeFileSync(file, s);
  return s;
}
const SECRET = loadSecret();

const payments = createPayments({
  secretKey: env('STRIPE_SECRET_KEY'),
  fake: env('DEV_FAKE_PAYMENTS') === '1',
  siteName: SITE_NAME,
  unlockPence: UNLOCK_PENCE,
  subscriptionPence: SUBSCRIPTION_PENCE,
});

// ---------- price source ----------
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// Look like an ordinary UK browser visit. The cookie sets the UK market and skips the
// cookie-consent page, which otherwise has no products on it.
const BROWSER_HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'en-GB,en;q=0.9',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
  Cookie: 'BCP=AD=1&AL=1&SM=1; _EDGE_S=mkt=en-gb; _EDGE_CD=m=en-gb; SRCHHPGUSR=SRCHLANG=en',
};

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`source responded ${res.status}`);
  const html = await res.text();
  if (process.env.DEBUG_SOURCE) console.log('source', res.url.slice(0, 160), html.length, (html.match(/<title>([^<]*)/) || [])[1], (html.match(/br-oboSnOptLk|br-card|sh-buying-option/g) || []).length, [...new Set((html.match(/class="[^"]{3,40}"/g) || []).map((c) => c.slice(7, -1)))].slice(40, 160).join(' '), /captcha|challenge|unusual traffic/i.test(html), (html.match(/br_errorTitle[^>]*>([\s\S]{0,300})/) || [])[1], (html.match(/br-subtitle[^>]*>([\s\S]{0,300})/) || [])[1]);
  return html;
}

// A shop's own product page, to confirm the price. Only public https addresses, and every
// redirect is checked the same way, so the server can never be pointed at its own network.
// (IPv6 addresses always appear in brackets in a URL, so "[" covers all of them.)
const PRIVATE_HOST = /^(localhost|0\.|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)|\.localhost$|\.local$|\.internal$/i;
function publicHttps(u) {
  return u.protocol === 'https:' && !PRIVATE_HOST.test(u.hostname) && !/^\d+$/.test(u.hostname) && !u.hostname.includes(':');
}
async function fetchPage(url) {
  let u = new URL(url);
  for (let hop = 0; hop < 4; hop++) {
    if (!publicHttps(u)) throw new Error('refused');
    const res = await fetch(u, {
      headers: BROWSER_HEADERS,
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      u = new URL(res.headers.get('location'), u);
      continue;
    }
    if (!res.ok) throw new Error(`shop responded ${res.status}`);
    const text = await res.text();
    return text.length > 6_000_000 ? text.slice(0, 6_000_000) : text;
  }
  throw new Error('too many redirects');
}

// ---------- search cache (memory + disk, so restarts stay warm) ----------
const normalise = (q) => String(q || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
const cacheFile = (key) => path.join(CACHE_DIR, crypto.createHash('sha1').update(key).digest('hex') + '.json');
const memory = new Map();   // key -> result
const inflight = new Map(); // key -> promise
const offerIndex = new Map(); // offer id -> offer (for checkout and photos)

// Keeps memory use flat however many different searches people make.
function remember(key, result) {
  memory.delete(key);
  memory.set(key, result);
  if (memory.size > 1500) for (const k of [...memory.keys()].slice(0, 300)) memory.delete(k);
}

function index(result) {
  for (const g of result.groups) for (const o of g.offers) offerIndex.set(o.id, o);
  if (offerIndex.size > 50000) {
    for (const k of [...offerIndex.keys()].slice(0, 10000)) offerIndex.delete(k);
  }
}

const fresh = (r) => r && Date.now() - r.fetchedAt < (r.groups.length ? CACHE_MS : 30 * 60 * 1000);

async function readCache(key) {
  if (memory.has(key)) return memory.get(key);
  try {
    const r = JSON.parse(await readFile(cacheFile(key), 'utf8'));
    remember(key, r);
    index(r);
    return r;
  } catch {
    return null;
  }
}

async function getSearch(query) {
  const key = normalise(query);
  const cached = await readCache(key);
  if (fresh(cached)) return cached;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const result = await runSearch(key, { fetchHtml, fetchPage, allowVerified: ALLOW_VERIFIED_UK });
      result.query = query.trim().slice(0, 120);
      // An empty result is often a one-off bad response from the source: never keep it,
      // or every visitor sees "nothing found" for that search until the cache expires.
      if (!result.groups?.length) {
        console.warn('search empty:', key, 'listings seen:', result.listingsSeen);
        return result;
      }
      remember(key, result);
      index(result);
      writeFile(cacheFile(key), JSON.stringify(result)).catch(() => {});
      return result;
    } catch (err) {
      if (cached) return cached; // stale prices beat no prices; fetchedAt shows their age
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

// ---------- visitor access (signed cookie, nothing stored server-side) ----------
const COOKIE = 'access';
const sign = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');

function readAccessCookie(req) {
  const raw = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return { s: [] };
  const [body, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!body || !sig) return { s: [] };
  // Compare as bytes: odd characters in a tampered cookie must be rejected, not crash the request.
  const got = Buffer.from(sig);
  const want = Buffer.from(sign(body));
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return { s: [] };
  try {
    const v = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return { s: Array.isArray(v.s) ? v.s.slice(-40) : [], sub: v.sub || null, cust: v.cust || null };
  } catch {
    return { s: [] };
  }
}

function accessCookieHeader(value) {
  const body = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${COOKIE}=${body}.${sign(body)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${400 * 24 * 3600}${SECURE ? '; Secure' : ''}`;
}

async function getAccess(req) {
  const cookie = readAccessCookie(req);
  const unlocks = [];
  // Look up all of this visitor's payments at once rather than one after another.
  const sessions = await Promise.all(cookie.s.map((id) => payments.getSession(id).catch(() => null)));
  for (const s of sessions) {
    if (s?.paid && s.kind === 'unlock') unlocks.push(payments.snapshot(s));
  }
  const subscriber = await payments.subscriptionActive(cookie.sub);
  return { cookie, subscriber, unlocks, unlocked: new Set(unlocks.map((u) => u.id)) };
}

// ---------- small helpers ----------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json',
};

function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, {
    'Content-Length': buf.length,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...headers,
  });
  res.end(buf);
}
const json = (res, status, obj, headers = {}) =>
  send(res, status, JSON.stringify(obj), { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store', ...headers });
const redirect = (res, to, headers = {}) => send(res, 303, '', { Location: to, ...headers });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 10000) { reject(new Error('too large')); req.destroy(); } else parts.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}

const clientIp = (req) =>
  (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';

// Limits brand-new lookups per visitor so nobody can use the site to hammer the price source.
const buckets = new Map();
function allowLookup(ip) {
  const now = Date.now();
  const b = buckets.get(ip) || { count: 0, since: now };
  if (now - b.since > 5 * 60 * 1000) { b.count = 0; b.since = now; }
  b.count += 1;
  buckets.set(ip, b);
  if (buckets.size > 20000) buckets.clear();
  return b.count <= 30;
}

// ---------- routes ----------
async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;

  // For the host's health check: answers instantly without touching Stripe or the price source.
  if (route === 'GET /api/health') return json(res, 200, { ok: true });

  // Shows what the price source sends this server for one test search. Nothing private.
  if (route === 'GET /api/check-source') {
    if (!allowLookup(clientIp(req))) return json(res, 429, { error: 'Try again in a few minutes.' });
    const q = String(url.searchParams.get('q') || 'airpods pro').slice(0, 60);
    try {
      const r = await fetch(searchUrl(q), { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(15000) });
      const html = await r.text();
      return json(res, 200, {
        query: q,
        status: r.status,
        finalAddress: r.url.slice(0, 200),
        bytes: html.length,
        pageTitle: (html.match(/<title>([^<]*)/) || [])[1] || null,
        productCardsInPage: (html.match(/class="br-item/g) || []).length,
        productsRead: parseSearch(html).length,
        looksBlocked: looksBlocked(html),
        mentionsConsent: /consent|cookie preferences/i.test(html.slice(0, 30000)),
        sample: html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600),
      });
    } catch (err) {
      return json(res, 200, { query: q, error: err.message });
    }
  }

  if (route === 'GET /api/config') {
    const access = await getAccess(req);
    return json(res, 200, {
      siteName: SITE_NAME,
      payments: payments.enabled ? 'live' : payments.fake ? 'test' : 'off',
      unlockPrice: UNLOCK_PENCE / 100,
      subscriptionPrice: SUBSCRIPTION_PENCE / 100,
      subscriber: access.subscriber,
      canManage: Boolean(access.subscriber && access.cookie.cust),
      unlocks: access.unlocks,
      retailerCount: RETAILERS.length,
      verifiedSellers: ALLOW_VERIFIED_UK,
      ads: {
        client: env('ADSENSE_CLIENT'),
        slots: { top: env('ADSENSE_SLOT_TOP'), results: env('ADSENSE_SLOT_RESULTS'), footer: env('ADSENSE_SLOT_FOOTER') },
      },
    });
  }

  if (route === 'GET /api/search') {
    const q = String(url.searchParams.get('q') || '').trim();
    if (q.length < 2) return json(res, 400, { error: 'Type at least two characters.' });
    const cached = await readCache(normalise(q));
    if (!fresh(cached) && !allowLookup(clientIp(req))) {
      return json(res, 429, { error: 'Too many searches in a short time. Please try again in a few minutes.' });
    }
    try {
      const result = await getSearch(q);
      const access = await getAccess(req);
      return json(res, 200, present(result, access, { lockSingleOffers: LOCK_SINGLE_OFFERS }));
    } catch (err) {
      console.error('search failed:', q, err.message);
      return json(res, 502, { error: 'We could not reach our price source just now. Please try again shortly.' });
    }
  }

  // Photo for a locked offer, served from here so its address gives nothing away.
  if (req.method === 'GET' && url.pathname.startsWith('/api/img/')) {
    let imgId = '';
    try { imgId = decodeURIComponent(url.pathname.slice('/api/img/'.length)); } catch { return send(res, 404, 'not found'); }
    const offer = offerIndex.get(imgId);
    if (!offer?.image || !/^https:\/\/th\.bing\.com\//.test(offer.image)) return send(res, 404, 'not found');
    try {
      const r = await fetch(offer.image, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) return send(res, 404, 'not found');
      return send(res, 200, Buffer.from(await r.arrayBuffer()), {
        'Content-Type': r.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      });
    } catch {
      return send(res, 404, 'not found');
    }
  }

  if (route === 'POST /api/checkout') {
    const body = await readBody(req).catch(() => null);
    if (!body) return json(res, 400, { error: 'Bad request.' });
    const kind = body.kind === 'subscription' ? 'subscription' : 'unlock';
    const q = String(body.q || '').slice(0, 120);
    let offer = null;
    if (kind === 'unlock') {
      const id = String(body.offerId || '');
      // A price no longer in memory (for example after a restart): look it up again, but
      // only within the same per-visitor limit as searching, so this cannot be used to
      // hammer the price source.
      if (!offerIndex.has(id) && q.trim().length >= 2) {
        const cached = await readCache(normalise(q));
        if (fresh(cached) || allowLookup(clientIp(req))) await getSearch(q).catch(() => {});
      }
      offer = offerIndex.get(id);
      if (!offer) return json(res, 404, { error: 'That price has expired. Please search again.' });
    }
    try {
      const session = await payments.createCheckout({
        kind,
        offer,
        query: q,
        successUrl: `${PUBLIC_URL}/api/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${PUBLIC_URL}/${q ? '?q=' + encodeURIComponent(q) : ''}`,
      });
      return json(res, 200, { url: session.url });
    } catch (err) {
      if (err.message === 'PAYMENTS_NOT_CONFIGURED') return json(res, 503, { error: 'Payments are not connected yet.' });
      console.error('checkout failed:', err.message);
      return json(res, 502, { error: 'We could not start the payment. Please try again.' });
    }
  }

  if (route === 'GET /api/checkout/return') {
    const id = String(url.searchParams.get('session_id') || '');
    let session = null;
    try { session = await payments.getSession(id); } catch (err) { console.error('session lookup failed:', err.message); }
    if (!session?.paid) return redirect(res, '/?paid=failed');
    const cookie = readAccessCookie(req);
    if (session.kind === 'subscription') {
      cookie.sub = session.subscription;
      cookie.cust = session.customer;
    } else if (!cookie.s.includes(id)) {
      cookie.s.push(id);
    }
    const q = session.metadata?.q ? `&q=${encodeURIComponent(session.metadata.q)}` : '';
    return redirect(res, `/?paid=${session.kind}${q}`, { 'Set-Cookie': accessCookieHeader(cookie) });
  }

  if (route === 'POST /api/portal') {
    const cookie = readAccessCookie(req);
    try {
      const to = await payments.portalUrl(cookie.cust, PUBLIC_URL + '/');
      return to ? json(res, 200, { url: to }) : json(res, 404, { error: 'No membership found on this device.' });
    } catch (err) {
      console.error('portal failed:', err.message);
      return json(res, 502, { error: 'We could not open membership settings. Please try again.' });
    }
  }

  return json(res, 404, { error: 'Not found.' });
}

async function handleStatic(req, res, url) {
  if (url.pathname === '/ads.txt') {
    return env('ADS_TXT') ? send(res, 200, env('ADS_TXT') + '\n', { 'Content-Type': TYPES['.txt'] }) : send(res, 404, 'not found');
  }
  let rel;
  try { rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, ''); }
  catch { return send(res, 404, 'not found'); }
  const file = path.resolve(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 404, 'not found');
  try {
    // Images can also be stored as text (base64) in a ".b64" file next to where they belong.
    let body = await readFile(file).catch(async (err) => {
      try { return Buffer.from((await readFile(file + '.b64', 'utf8')).replace(/\s+/g, ''), 'base64'); } catch { throw err; }
    });
    // Link previews (TikTok, Instagram, WhatsApp) need full addresses, not "/og-image.png".
    if (rel === 'index.html') {
      body = Buffer.from(body.toString('utf8')
        .replace('content="/og-image.png"', `content="${PUBLIC_URL}/og-image.png"`)
        .replace('<meta property="og:type"', `<meta property="og:url" content="${PUBLIC_URL}/">\n  <meta property="og:type"`));
    }
    return send(res, 200, body, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=300',
    });
  } catch {
    return send(res, 404, 'not found');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, PUBLIC_URL);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    return await handleStatic(req, res, url);
  } catch (err) {
    console.error('request failed:', err);
    if (!res.headersSent) send(res, 500, 'Something went wrong.');
  }
});

server.listen(PORT, () => {
  console.log(`${SITE_NAME} is running at ${PUBLIC_URL}`);
  console.log(`Payments: ${payments.enabled ? 'Stripe connected' : payments.fake ? 'TEST MODE (no money taken)' : 'not connected'}`);
});
