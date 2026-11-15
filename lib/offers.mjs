// Turns raw seller listings into like-for-like comparisons: one group per product and
// size, each listing every trusted retailer selling it, cheapest first.
// The source mixes related products together, so every listing is matched on its own
// title rather than on where it was found.

import { classifySeller } from './retailers.mjs';

const STOP = new Set(['the', 'a', 'an', 'for', 'of', 'with', 'and', 'by', 'in', 'to', 'new', 'uk', 'from', 'on']);

// Words that describe packaging or colour rather than which product it is.
const NOISE = new Set([
  'spray', 'men', 'mens', 'women', 'womens', 'unisex', 'him', 'her', 'pack', 'brand', 'sealed', 'box', 'boxed',
  'genuine', 'official', 'private', 'blend', 'fragrance', 'perfume', 'smartphone', 'mobile', 'phone', 'sim',
  'free', 'unlocked', '5g', 'edition', 'version', 'model', 'beauty', 'natural', 'vaporisateur',
  'black', 'blk', 'white', 'silver', 'grey', 'gray', 'gold', 'blue', 'red', 'pink', 'green', 'purple', 'yellow',
  'orange', 'teal', 'ultramarine', 'midnight', 'starlight', 'graphite', 'titanium', 'navy', 'beige', 'cream',
]);

// Words that change which product it is. Two listings must agree on all of these.
const CRITICAL = new Set([
  'edp', 'edt', 'edc', 'parfum', 'cologne', 'extrait', 'intense', 'extreme', 'elixir', 'absolu', 'sport',
  'pro', 'max', 'plus', 'mini', 'ultra', 'lite', 'se', 'fe', 'xl', 'slim', 'digital', 'oled', 'kids', 'junior',
  'gift', 'set', 'bundle', 'duo', 'trio', 'kit', 'refill', 'travel', 'dual', 'single', 'double', 'cordless',
]);

// Add-on words. A listing only counts as an add-on when it also says what it is "for"
// (as in "Case for iPhone 16"), so a "stand mixer" or a "cable knit jumper" survives.
const ACCESSORY = [
  'case', 'cover', 'screen protector', 'protector', 'strap', 'charger', 'cable', 'adapter', 'adaptor',
  'replacement', 'spare', 'sticker', 'skin', 'mount', 'holder', 'liner', 'liners', 'accessory',
  'accessories', 'refill', 'filter', 'battery', 'remote', 'bag', 'sleeve', 'decal', 'parts', 'part',
];
const FOR = /\b(for|fits|compatible)\b/;

// Never what the shopper meant unless they typed it: second-hand stock and fragrance samples.
// Also monthly prices (a phone on contract is not "£30"), which would look like bargains.
const CONDITION = /\b(refurbished|renewed|pre-?owned|second[- ]hand|ex[- ]display|open box|sample|samples|decant|vial|tester|empty bottle|pay monthly|per month|a month|monthly plan|contract|airtime plan|on (?:vodafone|ee|o2|three|giffgaff|sky mobile|virgin media|tesco mobile|id mobile|smarty|lebara|voxi))\b|\(used\)|\bused\s*[-–:,]|\bgrade [abc]\b|\/\s?mo(nth)?\b/;

export function tokens(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // "Minérale" and "Minerale" are the same word
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/['’]/g, '')
    .replace(/\b([a-z])\.(?=[a-z]\b)/g, '$1') // "I.D." and "ID" are the same word
    .replace(/\beau\s+de\s+parfum\b/g, ' edp ')
    .replace(/\beau\s+de\s+toilette\b/g, ' edt ')
    .replace(/\beau\s+de\s+cologne\b/g, ' edc ')
    .replace(/(\d)\s+(ml|l|gb|tb|kg|g|inch|cm|mm|oz|w)\b/g, '$1$2')
    .split(/[^a-z0-9.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t && !STOP.has(t));
}

// Edit distance allowing one swap of neighbouring letters ("paino" -> "piano").
function editDistance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

function tokenMatch(a, b) {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  // Tolerate a typing slip in longer words only; short words are too easy to confuse.
  if (/\d/.test(a) || /\d/.test(b)) return false;
  const min = Math.min(a.length, b.length);
  if (min >= 5) return editDistance(a, b, min >= 9 ? 2 : 1) <= (min >= 9 ? 2 : 1);
  return false;
}

// Share of the words typed by the shopper that appear in a listing title (0 to 1).
export function relevance(queryTokens, title) {
  if (!queryTokens.length) return 0;
  const tt = tokens(title);
  const hit = queryTokens.filter((q) => tt.some((t) => tokenMatch(q, t))).length;
  return hit / queryTokens.length;
}

export function extractSize(text) {
  const t = String(text || '').toLowerCase();
  const m =
    /(\d+(?:\.\d+)?)\s?(ml|cl|litres?|l|gb|tb)\b/.exec(t) ||
    /(\d+(?:\.\d+)?)\s?(inch|"|kg|g|oz)(?![a-z])/.exec(t);
  if (!m) return null;
  let unit = m[2];
  if (unit === '"') unit = 'inch';
  if (/^litre/.test(unit)) unit = 'l';
  return `${Number(m[1])}${unit}`;
}

const SIZE_TOKEN = /^\d+(\.\d+)?(ml|cl|l|gb|tb|kg|g|inch|oz)$/;

// Manufacturer model numbers such as AF180UK, DZ300UK, WH1000XM5 or 5KSM175PSBOB: a word
// of five or more characters mixing letters and digits that is not a size or a year.
const NOT_MODEL = /^(\d+(\.\d+)?(ml|cl|l|gb|tb|kg|g|mg|inch|in|cm|mm|m|oz|w|kw|v|mah|hz|ft|pcs|pk|pack|x|p|k|th|st|nd|rd|s))$|^\d+x\d+/;
function extractModel(title) {
  const words = String(title || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(\b[a-z]{1,4})-(\d)/g, '$1$2') // "DZ-300" -> "dz300"
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 5 && /[a-z]/.test(w) && /\d/.test(w) && !NOT_MODEL.test(w));
  if (!words.length) return null;
  return words.sort((a, b) => b.length - a.length)[0];
}

function slug(url) {
  try { return decodeURIComponent(new URL(url).pathname).replace(/[-_/+.]+/g, ' '); } catch { return ''; }
}

// Retailers often append a marketing blurb after a bar; the product name comes first.
export const headline = (title) => String(title || '').split(' | ')[0].trim();

// The words that tell one product from another. The words the shopper typed are left out:
// every result shares them, so they would make different products look alike
// ("TC Start mesh office chair" and "Habitat Oxley mesh office chair").
export function signature(title, url, queryTokens = []) {
  const head = headline(title);
  const all = tokens(head);
  const typed = (t) => queryTokens.some((q) => tokenMatch(q, t));
  return {
    size: extractSize(head) || (url ? extractSize(slug(url)) : null),
    model: extractModel(head),
    critical: all.filter((t) => CRITICAL.has(t)).sort().join(' '),
    core: new Set(all.filter((t) => !NOISE.has(t) && !CRITICAL.has(t) && !SIZE_TOKEN.test(t) && !/^\d{4}$/.test(t) && !typed(t))),
  };
}

// Two sellers of the same new product rarely differ by more than this; a bigger gap
// almost always means a multipack, a bundle or a different model.
const PRICE_SPREAD = 2.2;
const pricesCompatible = (a, b) => Math.max(a, b) / Math.min(a, b) <= PRICE_SPREAD;

function overlap(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter;
}

export function sameProduct(a, b) {
  if (a.model && b.model) {
    // Both carry a model number: that settles it either way.
    if (!(a.model.startsWith(b.model) || b.model.startsWith(a.model))) return false;
    return !a.size || !b.size || a.size === b.size;
  }
  if (a.size !== b.size) return false;
  if (a.critical !== b.critical) return false;
  const inter = overlap(a.core, b.core);
  const small = Math.min(a.core.size, b.core.size);
  // Exactly the same distinguishing words, same size and same type: the same product,
  // even when that is a single word ("Oud Minerale 100ml" at two shops).
  if (inter >= 1 && a.core.size === inter && b.core.size === inter) return true;
  if (small < 2) return false;
  if (inter === small) return true; // one title is the other plus extra description
  // Otherwise allow one differing word, and only between long descriptions: with short
  // ones a single different word is usually the model ("Origin" against "I.D.").
  return small >= 5 && inter >= small - 1;
}

function looselyRelated(a, b) {
  const inter = overlap(a.core, b.core);
  return inter / Math.max(1, a.core.size + b.core.size - inter) >= 0.5;
}

export function isAccessory(title, queryText) {
  const t = ` ${String(title || '').toLowerCase()} `;
  const q = ` ${String(queryText || '').toLowerCase()} `;
  const cond = CONDITION.exec(t);
  if (cond) {
    // Excluded unless the shopper typed that same word ("refurbished iphone").
    const word = cond[0].replace(/[^a-z -]/g, ' ').trim().split(/\s+/).pop();
    if (!word || !new RegExp(`\\b${word}\\b`).test(q)) return true;
  }
  if (!FOR.test(t)) return false;
  // "Battery for Dyson V11" is an add-on when the shopper asked for a Dyson V11: the thing
  // they typed comes after the "for". "Dyson V11 ... battery for whole home" is the product.
  const qt = tokens(queryText);
  return ACCESSORY.some((w) => {
    if (q.includes(w)) return false;
    const m = new RegExp(`\\b${w}\\b(?:\\s+\\S+){0,3}?\\s+(?:for|fits|compatible)\\b(.*)$`).exec(t);
    if (!m) return false;
    return relevance(qt, m[1]) >= 0.5 && relevance(qt, t.slice(0, m.index)) < 0.5;
  });
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

// sets: [{ card, options }] where options are the sellers found on that card's page.
// cards: every card from the results page, used to pair each listing with the right photo.
export function buildGroups(sets, query, { cards = [], maxGroups = 8, maxOffers = 8, allowVerified = true } = {}) {
  const q = tokens(query);
  // Photos are matched on the full titles: with a very specific search, leaving out the
  // words typed would leave nothing to compare.
  const cardSigs = cards.filter((c) => c.image).map((c) => ({ c, sig: signature(c.title) }));
  const seen = new Set();
  const flat = [];

  for (const { card, options } of sets) {
    const candidates = [...options];
    if (card.url) candidates.push({ id: card.id, price: card.price, title: card.title, url: card.url, logo: card.logo });

    for (const o of candidates) {
      const id = String(o.id);
      if (seen.has(id)) continue;
      const retailer = classifySeller(o.url, { seller: o.seller, advertiser: o.advertiser }, { allowVerified });
      if (!retailer) continue; // not a seller we are prepared to send anyone to
      let title = o.title || card.title;
      if (id === String(card.id) && card.title.length > title.length) title = card.title;
      if (isAccessory(title, query)) continue;
      // A "title" that is just the shop's name, or a single word, says nothing about the product.
      if (tokens(title).length < 2 || tokens(title).join(' ') === tokens(retailer.name).join(' ')) continue;
      seen.add(id);

      const sig = signature(title, o.url, q);
      const fullSig = signature(title, o.url);
      const srcSig = signature(card.title);
      const match = cardSigs.find((x) => sameProduct(x.sig, fullSig));
      const image = match ? match.c.image : looselyRelated(srcSig, fullSig) ? card.image : null;

      flat.push({
        sig,
        rel: relevance(q, title),
        position: card.position,
        offer: {
          id,
          retailer: retailer.name,
          retailerKey: retailer.key,
          tier: retailer.tier,
          company: retailer.company || null,
          title,
          price: o.price,
          url: o.url,
          image,
          logo: o.logo || null,
          delivery: o.delivery || null,
        },
      });
    }
  }

  // When the shopper typed a model number or size ("iphone 16 128gb"), two listings that
  // both contain everything typed are the same product, unless a word such as Pro, Plus or
  // Max, a different size or a different model number says otherwise.
  const specific = q.some((t) => /\d/.test(t)) && q.length >= 2;
  const fullMatch = (a, b) =>
    specific && a.rel >= 0.999 && b.rel >= 0.999 &&
    a.sig.critical === b.sig.critical &&
    (!a.sig.size || !b.sig.size || a.sig.size === b.sig.size) &&
    (!a.sig.model || !b.sig.model || a.sig.model.startsWith(b.sig.model) || b.sig.model.startsWith(a.sig.model));

  // Build groups one listing at a time. A listing joins a group only if it matches most of
  // the listings already in it, so a chain of near-misses (A looks like B, B like C) can
  // never put two different products together.
  const same = (a, b) => pricesCompatible(a.offer.price, b.offer.price) && (fullMatch(a, b) || sameProduct(a.sig, b.sig));
  const clusters = [];
  const order = [...flat].sort((a, b) => b.rel - a.rel || a.position - b.position);
  for (const f of order) {
    let best = null;
    let bestScore = 0;
    for (const c of clusters) {
      const hits = c.filter((m) => same(f, m)).length;
      const score = hits / c.length;
      if (hits > 0 && score > 0.5 && score > bestScore) { best = c; bestScore = score; }
    }
    if (best) best.push(f); else clusters.push([f]);
  }

  let groups = clusters.map((items) => {
    const anyImage = (items.find((i) => i.offer.image) || {}).offer?.image || null;
    // One row per retailer: keep that retailer's lowest price.
    const best = new Map();
    for (const { offer } of items) {
      if (!offer.image) offer.image = anyImage;
      const cur = best.get(offer.retailerKey);
      if (!cur || offer.price < cur.price) best.set(offer.retailerKey, offer);
    }
    // Linking pairs can chain A to B to C; keep only prices close to the group's middle, so
    // a different, cheaper item can never pose as this product's lowest price.
    const mid = median([...best.values()].map((o) => o.price));
    const offers = [...best.values()]
      .filter((o) => pricesCompatible(o.price, mid))
      .sort((a, b) => a.price - b.price)
      .slice(0, maxOffers);
    const size = (items.find((i) => i.sig.size) || {}).sig?.size || null;
    // Name the group with its most typical title (the one sharing most words with the rest),
    // preferring one that states the size, then the shorter.
    // The cheapest offer may be locked, so its exact wording is never used for the heading
    // when another shop's wording is available.
    const inGroup = items.filter((i) => offers.some((o) => o.id === i.offer.id));
    const kept = inGroup.length > 1 ? inGroup.filter((i) => i.offer.id !== offers[0].id) : inGroup;
    const typical = (it) => kept.reduce((n, o) => n + (o === it ? 0 : overlap(it.sig.core, o.sig.core)), 0);
    const label = headline(
      [...kept].sort((a, b) =>
        typical(b) - typical(a) ||
        (extractSize(b.offer.title) ? 1 : 0) - (extractSize(a.offer.title) ? 1 : 0) ||
        a.offer.title.length - b.offer.title.length)[0].offer.title,
    );
    return {
      key: offers[0].id,
      label,
      size,
      rel: Math.max(...items.map((i) => i.rel)),
      position: Math.min(...items.map((i) => i.position)),
      offers,
    };
  });

  // Only products that match what was typed. With no close match, fall back to products
  // sharing at least a third of the words typed, never to something unrelated.
  let kept = groups.filter((g) => g.rel >= 0.5);
  const closestOnly = kept.length === 0;
  if (closestOnly) kept = groups.filter((g) => g.rel >= 0.34);

  // Drop listings priced far below everything else: almost always an add-on or a sample.
  if (kept.length >= 4) {
    const mid = median(kept.map((g) => g.offers[0].price));
    kept = kept.filter((g) => g.offers[0].price >= mid * 0.1);
  }

  const bucket = (r) => (r >= 0.999 ? 3 : r >= 0.75 ? 2 : 1);
  kept.sort((a, b) => bucket(b.rel) - bucket(a.rel) || b.offers.length - a.offers.length || a.position - b.position);

  return {
    exact: kept.some((g) => g.rel >= 0.999),
    closestOnly: closestOnly && kept.length > 0,
    groups: kept.slice(0, maxGroups).map(({ key, label, size, offers }) => ({ key, label, size, offers })),
  };
}
