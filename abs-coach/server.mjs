// Core Check server: serves the site and, when ANTHROPIC_API_KEY is set, analyses photos.
//   npm install && npm start      ->  http://localhost:3000
// Without an API key the site still works fully; estimates come from the user's answers.

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');

// ---------- settings (.env next to this file is optional) ----------
if (existsSync(path.join(ROOT, '.env'))) {
  for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const env = (k, d = '') => process.env[k] ?? d;
const PORT = Number(env('PORT', '3000'));
const AI = !!env('ANTHROPIC_API_KEY');
const PER_IP_PER_HOUR = Number(env('ANALYSES_PER_HOUR', '12'));
const PER_DAY = Number(env('ANALYSES_PER_DAY', '300'));
const TRUST_PROXY = env('TRUST_PROXY', '1') === '1';
const MAX_BODY = 10 * 1024 * 1024;
const MAX_IMAGE_B64 = 2_800_000; // about 2 MB of JPEG

const { analysePhotos, AnalysisError, MODEL } = AI ? await import('./lib/analyze.mjs') : {};

// ---------- helpers ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });

function clientIp(req) {
  if (TRUST_PROXY) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Photos are too large.'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---------- rate limits (in memory; resets on restart) ----------
const hits = new Map();
let day = new Date().toISOString().slice(0, 10);
let todayCount = 0;
function allow(ip) {
  const now = Date.now();
  const d = new Date().toISOString().slice(0, 10);
  if (d !== day) {
    day = d;
    todayCount = 0;
  }
  if (todayCount >= PER_DAY) return 'The photo analyser has reached today’s limit. Your plan still works; try the analysis again tomorrow.';
  const list = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (list.length >= PER_IP_PER_HOUR) return 'Too many analyses from this connection. Try again in an hour.';
  list.push(now);
  hits.set(ip, list);
  todayCount += 1;
  return null;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) if (!list.some((t) => now - t < 3600_000)) hits.delete(ip);
}, 600_000).unref();

// ---------- validation ----------
const isNum = (n, lo, hi) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const isImage = (s) => typeof s === 'string' && s.length > 1000 && s.length <= MAX_IMAGE_B64 && B64.test(s) && (s.startsWith('/9j/') || s.startsWith('iVBOR'));
const optNum = (n, lo, hi) => (n == null ? null : isNum(n, lo, hi) ? n : undefined);

function validate(body) {
  const p = body?.profile;
  if (!p || !['male', 'female'].includes(p.sex)) return 'Missing profile.';
  if (!isNum(p.age, 13, 100)) return 'Please check your age.';
  if (p.age < 18) return 'Photo analysis is only for adults.';
  if (!isNum(p.heightCm, 120, 230) || !isNum(p.weightKg, 35, 250)) return 'Please check your height and weight.';
  const waistCm = optNum(p.waistCm, 45, 200);
  if (waistCm === undefined) return 'Please check your waist measurement.';
  if (!isImage(body.images?.relaxed) || !isImage(body.images?.tensed)) return 'Both photos are needed, as JPEG or PNG under 2 MB.';
  const selfStage = Number.isInteger(body.selfStage) && body.selfStage >= 0 && body.selfStage <= 5 ? body.selfStage : null;
  const goalStage = Number.isInteger(p.goalStage) && p.goalStage >= 0 && p.goalStage <= 5 ? p.goalStage : null;
  let previous = null;
  if (body.previous) {
    const q = body.previous;
    if (!isNum(q.daysAgo, 0, 400) || !isNum(q.weightKg, 35, 250)) return 'Previous check-in details are invalid.';
    const images = q.images && isImage(q.images.relaxed) && isImage(q.images.tensed) ? { relaxed: q.images.relaxed, tensed: q.images.tensed } : null;
    previous = {
      daysAgo: q.daysAgo,
      weightKg: q.weightKg,
      waistCm: optNum(q.waistCm, 45, 200) ?? null,
      bf: optNum(q.bf, 3, 60) ?? null,
      stage: Number.isInteger(q.stage) && q.stage >= 0 && q.stage <= 5 ? q.stage : null,
      images,
    };
  }
  return {
    profile: { sex: p.sex, age: Math.round(p.age), heightCm: p.heightCm, weightKg: p.weightKg, waistCm, goalStage },
    selfStage,
    images: { relaxed: body.images.relaxed, tensed: body.images.tensed },
    previous,
  };
}

// ---------- routes ----------
async function handleAnalyze(req, res) {
  if (!AI) return json(res, 503, { error: 'Photo analysis is switched off on this server.' });
  if (!String(req.headers['content-type'] || '').includes('application/json')) return json(res, 415, { error: 'Expected JSON.' });
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    return json(res, e.status || 400, { error: e.status === 413 ? 'Photos are too large.' : 'Could not read the request.' });
  }
  const input = validate(body);
  if (typeof input === 'string') return json(res, 400, { error: input });
  const limited = allow(clientIp(req));
  if (limited) return json(res, 429, { error: limited });
  const started = Date.now();
  try {
    const result = await analysePhotos(input);
    console.log(`analyse ok ${Date.now() - started}ms check-in=${!!input.previous}`);
    return json(res, 200, { result });
  } catch (e) {
    console.log(`analyse failed ${Date.now() - started}ms: ${e.message}`);
    if (e instanceof AnalysisError) return json(res, e.status, { error: e.message });
    return json(res, 500, { error: 'Photo analysis failed. Try again shortly.' });
  }
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden');
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not a file');
    const ext = path.extname(file).toLowerCase();
    const data = await readFile(file);
    // No build step and no hashed filenames, so ask browsers to revalidate.
    const cache = ['.png', '.svg', '.ico'].includes(ext) ? 'public, max-age=86400' : 'no-cache';
    send(res, 200, req.method === 'HEAD' ? undefined : data, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache, 'Last-Modified': s.mtime.toUTCString() });
  } catch {
    send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    if (p === '/api/health') return json(res, 200, { ok: true });
    if (p === '/api/config') return json(res, 200, { ai: AI });
    if (p === '/api/analyze') {
      if (req.method !== 'POST') return json(res, 405, { error: 'Use POST.' });
      return await handleAnalyze(req, res);
    }
    if (p.startsWith('/api/')) return json(res, 404, { error: 'Not found.' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return await serveStatic(req, res, p);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: 'Server error.' });
  }
});
server.requestTimeout = 150_000;
server.listen(PORT, () => {
  console.log(`Core Check running on http://localhost:${PORT}`);
  console.log(AI ? `Photo analysis: on (${MODEL})` : 'Photo analysis: off (set ANTHROPIC_API_KEY to switch it on)');
});
