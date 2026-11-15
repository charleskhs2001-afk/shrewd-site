// Pure HTML parsing for the price source (Bing Shopping, UK market).
// No Node-only imports here, so the same code runs in Node and in a browser test page.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', pound: '£' };

export function decodeEntities(s = '') {
  return String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function clean(s) {
  return decodeEntities(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function parsePrice(s) {
  const m = /(?:£|&#163;|&pound;)\s?(\d[\d,]*(?:\.\d{1,2})?)/.exec(String(s || ''));
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function b64urlDecode(s) {
  try {
    let t = s.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    const bin = atob(t);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return '';
  }
}

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

// Search-engine links wrap the retailer's address inside redirect and tracking URLs.
// Peel those layers off and return the retailer's own address.
export function unwrapUrl(href) {
  let cur = decodeEntities(href || '').trim();
  for (let i = 0; i < 8; i++) {
    let u;
    try { u = new URL(cur); } catch { break; }

    const packed = u.searchParams.get('u');
    if (/(^|\.)bing\.com$/i.test(u.hostname) && packed && /^[A-Za-z0-9_-]+$/.test(packed)) {
      let dec = b64urlDecode(packed.replace(/^a1/, ''));
      if (/^https?%3a/i.test(dec)) dec = safeDecode(dec);
      if (dec.startsWith('/')) dec = 'https://www.bing.com' + dec;
      if (/^https?:\/\//i.test(dec)) { cur = dec; continue; }
      break;
    }

    const parts = u.search.slice(1).split('&');
    let idx = -1;
    parts.forEach((kv, n) => {
      const v = kv.slice(kv.indexOf('=') + 1);
      if (/^https?(:|%3a)/i.test(v)) idx = n;
    });
    if (idx === -1) break;
    const v = parts[idx].slice(parts[idx].indexOf('=') + 1);
    if (/^https?:/i.test(v)) {
      // Nested address was not encoded, so everything after it belongs to it.
      const rest = parts.slice(idx + 1).join('&');
      cur = rest ? v + (v.includes('?') ? '&' : '?') + rest : v;
    } else {
      cur = safeDecode(v);
    }
  }
  return cur;
}

const TRACKING = /^(utm_\w+|mtm_\w+|gclid|gclsrc|msclkid|fbclid|dclid|gad_\w+|gbraid|wbraid|affil|thg_ppc_campaign|adtype|kwds|campaign|campaignid|adgroupid|adposition|adid|keyword|matchtype|network|device|feeditemid|targetid|loc_\w+|stkn|tw_\w+|srsltid|cmpid|cm_\w+|awc|tag|ref_?|source|mkwid|pcrid|ds_\w+|s_kwcid|ef_id|irclickid|clickid|ist\w+|msockid|rlid|ntb|h)$/i;

export function cleanUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  for (const key of [...u.searchParams.keys()]) {
    const val = u.searchParams.get(key);
    if (TRACKING.test(key) || val === '' || /[{}]/.test(val)) u.searchParams.delete(key);
  }
  u.hash = '';
  u.protocol = 'https:';
  return u.href;
}

function splitChunks(html, re, maxLen) {
  const starts = [];
  let m;
  while ((m = re.exec(html))) starts.push(m.index);
  return starts.map((s, i) => html.slice(s, Math.min(i + 1 < starts.length ? starts[i + 1] : s + maxLen, s + maxLen * 4)));
}

function productImage(chunk) {
  const re = /(?:data-)?src="(https:\/\/th\.bing\.com\/th[^"]+)"/g;
  let m;
  while ((m = re.exec(chunk))) {
    const src = decodeEntities(m[1]);
    if (/pid=retail|\/ODF\./i.test(src)) continue; // retailer logo, not the product
    return src.replace(/([?&])w=\d+/, '$1w=360').replace(/([?&])h=\d+/, '$1h=360');
  }
  return null;
}

function retailerLogo(chunk) {
  const m = /(?:data-)?src="(https:\/\/th\.bing\.com\/th[^"]*pid=retail[^"]*)"/.exec(chunk);
  return m ? decodeEntities(m[1]) : null;
}

// Search results page -> product cards.
export function parseSearch(html) {
  const cards = [];
  const chunks = splitChunks(html, /<li[^>]*class="br-item[^"]*"/g, 16000);
  chunks.forEach((chunk, position) => {
    const id = (/data-offerId="(\d+)"/i.exec(chunk) || /goid=(\d+)/.exec(chunk) || [])[1];
    if (!id) return;
    const title =
      clean((/br-title[^>]*>\s*<span title="([^"]+)"/.exec(chunk) || [])[1]) ||
      clean((/\salt="([^"]+)"/.exec(chunk) || [])[1]) ||
      clean((/data-alt="([^"]+)"/.exec(chunk) || [])[1]) ||
      clean((/class="[^"]*br-title[^"]*"[^>]*>([\s\S]{0,400}?)<\/(?:div|a)>/.exec(chunk) || [])[1]);
    const priceArea = (/class="[^"]*(?:pd-price|br-focusPrice)[^"]*"[^>]*>([\s\S]{0,300})/.exec(chunk) || [])[1];
    const price = parsePrice(priceArea) ?? parsePrice(chunk);
    const seller =
      clean((/class="[^"]*\bbr-seller"[^>]*>([^<]+)</.exec(chunk) || [])[1]) ||
      clean((/br-sellerTxt">([^<]+)</.exec(chunk) || [])[1]) ||
      clean((/l2_seller_lgfb[^>]*title="([^"]+)"/.exec(chunk) || [])[1]);
    const direct = (/class="ofr_lnk[^"]*"[^>]*href="([^"]+)"/i.exec(chunk) || [])[1];
    if (!title || !price) return;
    cards.push({
      id,
      position,
      title,
      price,
      seller,
      image: productImage(chunk),
      logo: retailerLogo(chunk),
      url: direct ? cleanUrl(unwrapUrl(direct)) : null,
    });
  });
  return cards;
}

// The visible text of a fragment as a list of short pieces, in order.
function textPieces(html) {
  return [...String(html).replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, '').matchAll(/>([^<>]+)</g)]
    .map((m) => clean(m[1]))
    .filter(Boolean);
}

// Who stands behind a sponsored offer, as published by the search engine's
// advertiser-identity scheme: company name, country, and whether it was verified.
function advertiserOf(chunk) {
  // The details sit between the seller name and the price. Looking no further than the
  // price stops a later, unrelated advert on the page being read as this seller's.
  const end = chunk.indexOf('offer-price');
  const own = end > 0 ? chunk.slice(0, end) : chunk;
  const at = own.indexOf('Advertiser Details');
  if (at === -1) return null;
  const pieces = textPieces(own.slice(at, at + 6000));
  const after = (label) => {
    const i = pieces.findIndex((p) => p.toLowerCase() === label);
    return i >= 0 && pieces[i + 1] ? pieces[i + 1] : null;
  };
  return {
    name: after('name:'),
    location: after('location:'),
    verified: pieces.some((p) => /verified by microsoft advertising/i.test(p)),
  };
}

// Product page -> every seller offering that same product.
// The source uses more than one layout for this list; match the shared class prefix.
export function parseDetails(html) {
  const options = [];
  const chunks = splitChunks(html, /<div[^>]*class="sh-buying-option br-oboSnOptLk[^"]*"/g, 30000);
  for (const chunk of chunks) {
    const head = chunk.slice(0, 600);
    const id = (/data-offer-id="(\d+)"/.exec(head) || [])[1];
    const raw = Number((/data-price="([\d.]+)"/.exec(head) || [])[1]);
    const price = Number.isFinite(raw) && raw > 0
      ? Math.round(raw * 100) / 100
      : parsePrice((/data-price-display="([^"]+)"/.exec(head) || [])[1]);
    const href = (/class="br-oboSnOptLink"[^>]*?href="([^"]+)"/.exec(chunk) || [])[1];
    const seller =
      clean((/offer-seller-name__text">([^<]+)</.exec(chunk) || [])[1]) ||
      clean((/class="br-oboSnOptLink"[^>]*?title="([^"]+)"/.exec(chunk) || [])[1]);
    const title = clean((/offer-title__text[^>]*>([^<]+)</.exec(chunk) || [])[1]);
    const delivery = clean((/>\s*((?:free|fast|next[- ]day)[^<]{0,12}(?:delivery|shipping)[^<]{0,24})</i.exec(chunk) || [])[1]);
    if (!id || !price || !href) continue;
    const url = cleanUrl(unwrapUrl(href));
    if (!url) continue;
    options.push({
      id, price, seller, title, url,
      logo: retailerLogo(chunk),
      delivery: delivery || null,
      advertiser: advertiserOf(chunk),
    });
  }
  return options;
}

// True when the source returned a block or challenge page rather than results.
export function looksBlocked(html) {
  return html.length < 20000 || /captcha|unusual traffic|verify you are a human/i.test(html.slice(0, 20000));
}
