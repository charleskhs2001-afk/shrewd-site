// Suggests ways to narrow a vague search ("football card" -> Panini, Topps, Match Attax,
// NFL...). Taken from words and pairs of words that recur across the listings found but
// are not shared by all of them, so each suggestion splits the results usefully.

import { tokens, relevance } from './offers.mjs';

const GENERIC = new Set([
  'with', 'set', 'pack', 'new', 'size', 'sizes', 'black', 'white', 'grey', 'gray', 'blue', 'red', 'pink', 'green',
  'silver', 'gold', 'large', 'small', 'medium', 'adult', 'adults', 'kids', 'men', 'mens', 'women', 'womens', 'unisex',
  'free', 'uk', 'official', 'genuine', 'brand', 'premium', 'quality', 'best', 'gift', 'ideal', 'perfect', 'great',
  'includes', 'including', 'inside', 'extra', 'non', 'slip', 'easy', 'one', 'two', 'up', 'x', 'pcs', 'piece',
  'pieces', 'per', 'only', 'all', 'more', 'your', 'you', 'our', 'it', 'is', 'are', 'or', 'at', 'as', 'be', 'this',
  'that', 'its', 'colour', 'color', 'style', 'design', 'model', 'type', 'edition', 'version', 'product', 'products',
  'item', 'items', 'cm', 'mm', 'inch', 'ml', 'l', 'g', 'kg', 'available', 'options', 'option', 'various', 'assorted',
  // Selling and condition words: they describe the listing, not a kind of product.
  'trading', 'value', 'authenticated', 'authentic', 'witnessed', 'certified', 'beckett', 'graded', 'grade', 'sealed',
  'boxed', 'retail', 'exclusive', 'limited', 'bonus', 'deal', 'offer', 'sale', 'discount', 'cheap', 'uk', 'stock',
  'delivery', 'shipping', 'fast', 'warranty', 'year', 'years', 'month', 'months', 'day', 'days', 'pack', 'packs',
  'bundle', 'collection', 'collectible', 'collectibles', 'collectors', 'fans', 'fan', 'gifts', 'present', 'christmas',
]);

const isSize = (t) => /^\d+(\.\d+)?(ml|l|gb|tb|kg|g|inch|oz|cl)$/.test(t);
const useful = (t) => !GENERIC.has(t) && (isSize(t) || (/[a-z]/.test(t) && t.length >= 3)) && !/^\d+$/.test(t);

// Show a suggestion the way the shops write it ("Match Attax", not "match attax").
function displayForm(phrase, titles) {
  const words = phrase.split(' ');
  const re = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\-]+'), 'i');
  const counts = new Map();
  for (const t of titles) {
    const m = re.exec(t.normalize('NFD').replace(/[̀-ͯ]/g, ''));
    if (m) counts.set(m[0], (counts.get(m[0]) || 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best) return phrase;
  const s = best[0].replace(/\s+/g, ' ');
  return s === s.toUpperCase() && s.length > 4 ? s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s;
}

export function suggestRefinements(titles, query, { max = 10 } = {}) {
  const q = tokens(query);
  const docs = titles.map((t) => {
    const all = tokens(String(t).split(' | ')[0]);
    const kept = all.filter((w) => useful(w) && relevance([w], q.join(' ')) === 0 && !q.some((x) => relevance([x], w) > 0));
    const pairs = [];
    for (let i = 0; i + 1 < all.length; i++) {
      if (kept.includes(all[i]) && kept.includes(all[i + 1]) && !isSize(all[i]) && !isSize(all[i + 1])) pairs.push(`${all[i]} ${all[i + 1]}`);
    }
    return new Set([...kept, ...pairs]);
  });

  const n = docs.length;
  if (n < 4) return [];
  const df = new Map();
  for (const d of docs) for (const w of d) df.set(w, (df.get(w) || 0) + 1);

  const minDf = Math.max(2, Math.ceil(n * 0.06));
  const candidates = [...df.entries()].filter(([, c]) => c >= minDf && c <= n * 0.7);

  // Prefer "match attax" over "match" and "attax" when the pair covers nearly all of them.
  const chosen = [];
  const byScore = candidates
    .map(([w, c]) => ({ w, c, score: c * (w.includes(' ') ? 1.4 : 1) }))
    .sort((a, b) => b.score - a.score);
  for (const cand of byScore) {
    if (chosen.length >= max) break;
    const parts = cand.w.split(' ');
    const clash = chosen.some((c) => {
      const cp = c.w.split(' ');
      return parts.some((p) => cp.includes(p));
    });
    if (clash) continue;
    chosen.push(cand);
  }
  return chosen.map(({ w, c }) => ({ label: displayForm(w, titles), count: c }));
}
