// Checks each price on the shop's own product page, because the shopping listings we
// search can lag behind (a shop cuts or raises a price, or sells out, before the listing
// catches up). Where a shop's page can be read, its price and stock replace the listing's.
// Some shops block automated visits; their prices stay as listed and are labelled so.

const round2 = (n) => Math.round(n * 100) / 100;

function num(v) {
  const n = Number(String(v ?? '').replace(/[£,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? round2(n) : null;
}

function* walk(node) {
  if (Array.isArray(node)) { for (const x of node) yield* walk(x); return; }
  if (!node || typeof node !== 'object') return;
  yield node;
  for (const k of ['@graph', 'mainEntity', 'itemListElement', 'item', 'hasVariant']) if (node[k]) yield* walk(node[k]);
}

const isType = (n, t) => [].concat(n['@type'] || []).some((x) => String(x).toLowerCase() === t);

function stockFrom(av) {
  const s = String(av || '').toLowerCase();
  if (!s) return null;
  if (/outofstock|soldout|discontinued/.test(s)) return false;
  if (/instock|limitedavailability|onlineonly|preorder|presale/.test(s)) return true;
  return null;
}

// The page's own structured product data (schema.org), which most large shops publish.
function fromJsonLd(html) {
  const found = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    for (const node of walk(data)) {
      if (!isType(node, 'product') || !node.offers) continue;
      for (const offer of [].concat(node.offers)) {
        for (const o of walk(offer)) {
          const cur = String(o.priceCurrency || o.priceSpecification?.priceCurrency || 'GBP').toUpperCase();
          if (cur !== 'GBP') continue;
          const price = num(o.price ?? o.lowPrice ?? o.priceSpecification?.price);
          if (price) {
            found.push({
              price,
              inStock: stockFrom(o.availability),
              ref: [o.url, o.sku, o.gtin13, o.gtin, o.mpn, node.sku, node.productID].filter(Boolean).map(String),
            });
          }
        }
      }
      if (found.length) return found; // the first product on the page is the one being sold
    }
  }
  return found;
}

function fromAmazon(html) {
  const at = html.indexOf('corePrice');
  const text = at >= 0 ? html.slice(at, at + 20000) : '';
  const price = num((/a-offscreen">\s*£([\d,.]+)\s*</.exec(text) || [])[1]) ||
    num((/"priceAmount"\s*:\s*([\d.]+)/.exec(html) || [])[1]);
  if (!price) return [];
  const avail = (/id="availability"[\s\S]{0,400}?<span[^>]*>\s*([^<]+?)\s*</.exec(html) || [])[1] || '';
  const inStock = /in stock|left in stock/i.test(avail) ? true : /unavailable|out of stock/i.test(avail) ? false : null;
  return [{ price, inStock }];
}

function fromMeta(html) {
  const price = num((/(?:product:price:amount|og:price:amount)["'][^>]*content=["']([\d.,]+)/i.exec(html) || [])[1]);
  return price ? [{ price, inStock: null }] : [];
}

export function readShopPrice(html, url) {
  let host = '';
  try { host = new URL(url).hostname; } catch { /* ignore */ }
  const found = /(^|\.)amazon\.co\.uk$/.test(host) ? fromAmazon(html) : [...fromJsonLd(html), ...fromMeta(html)];
  return found;
}

// Picks the shop's price for this listing, only when there is no doubt which item it
// belongs to. A page can carry several prices (other sizes, related products): then the
// one whose product code appears in our link is used; failing that, the listed price is
// confirmed if the page shows it; otherwise we say we could not check rather than guess.
export function chooseLivePrice(found, listed, url = '') {
  const plausible = found.filter((f) => f.price >= listed * 0.5 && f.price <= listed * 1.6);
  if (!plausible.length) return null;
  const distinct = [...new Set(plausible.map((f) => f.price))];
  if (distinct.length === 1) return plausible[0];

  const link = decodeURIComponent(String(url)).toLowerCase();
  const codes = (f) => (f.ref || []).flatMap((r) => String(r).toLowerCase().split(/[^a-z0-9]+/)).filter((c) => c.length >= 5 && /\d/.test(c)); // product codes, not words like the shop's name
  const matched = plausible.filter((f) => codes(f).some((c) => link.includes(c)));
  const matchedPrices = [...new Set(matched.map((f) => f.price))];
  if (matchedPrices.length === 1) return matched[0];

  return plausible.find((f) => f.price === listed) || null;
}

async function mapLimit(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i]); }
  }));
}

// Updates the offers in place, then re-orders each product's shops by the checked prices.
// fetchPage(url) resolves to HTML, or throws when the shop refuses or is too slow.
export async function verifyPrices(result, { fetchPage, concurrency = 12, budgetMs = 6000 } = {}) {
  const offers = result.groups.flatMap((g) => g.offers);
  const deadline = Date.now() + budgetMs;
  await mapLimit(offers, concurrency, async (o) => {
    o.listedPrice = o.price;
    o.check = 'listed';
    if (Date.now() > deadline) return;
    try {
      const html = await Promise.race([
        fetchPage(o.url),
        new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), Math.max(500, deadline - Date.now()))),
      ]);
      const live = chooseLivePrice(readShopPrice(html, o.url), o.price, o.url);
      if (!live) return;
      o.check = live.price === o.price ? 'confirmed' : 'updated';
      o.price = live.price;
      if (live.inStock === false) o.check = 'out-of-stock';
    } catch { /* blocked or slow: keep the listed price, labelled as such */ }
  });

  // Sold-out offers are dropped: the point is that the shopper can actually buy it.
  for (const g of result.groups) {
    g.offers = g.offers.filter((o) => o.check !== 'out-of-stock').sort((a, b) => a.price - b.price);
  }
  result.groups = result.groups.filter((g) => g.offers.length);
  result.checkedAt = Date.now();
  return result;
}
