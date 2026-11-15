// The search pipeline: one results page, then a closer look at the most promising
// products to collect every seller of each, then filter to safe sellers and group.
// `fetchHtml(url)` is injected so the same code runs on the server and in tests.

import { parseSearch, parseDetails, looksBlocked } from './parse.mjs';
import { tokens, relevance, isAccessory, buildGroups } from './offers.mjs';
import { retailerForName } from './retailers.mjs';
import { suggestRefinements } from './refine.mjs';
import { verifyPrices } from './verify.mjs';

const BASE = 'https://www.bing.com';
const MARKET = 'cc=GB&setlang=en-GB&mkt=en-GB';

export const searchUrl = (q) => `${BASE}/shop?q=${encodeURIComponent(q)}&${MARKET}`;
export const detailsUrl = (q, id) =>
  `${BASE}/shop/productdetails?q=${encodeURIComponent(q)}&goid=${encodeURIComponent(id)}&FORM=SHPPDP&${MARKET}`;

// Results-page sellers that are never shown: looking closer at their listings wastes time.
// (The product page can still list other, trusted sellers of the same item, so these are
// looked at last rather than never.)
const UNLIKELY = /ebay|aliexpress|grandado|fruugo|temu|onbuy|ubuy|u-buy|joom|wish|shein|findthedeal|shopping\.co\.uk|bigshopper|comparor|pricehunter|desertcart|banggood|etsy/i;

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function runSearch(query, { fetchHtml, fetchPage = null, firstPass = 10, secondPass = 8, concurrency = 6, allowVerified = true, budgetMs = 9000 } = {}) {
  const started = Date.now();
  const html = await fetchHtml(searchUrl(query));
  const cards = parseSearch(html);
  if (!cards.length) {
    if (looksBlocked(html)) throw new Error('SOURCE_UNAVAILABLE');
    return { query, exact: false, closestOnly: false, groups: [], listingsSeen: 0, fetchedAt: Date.now() };
  }

  const q = tokens(query);
  const ranked = cards
    .filter((c) => !isAccessory(c.title, query))
    .map((c) => ({
      c,
      rel: relevance(q, c.title),
      score: retailerForName(c.seller) ? 2 : UNLIKELY.test(c.seller) ? 0 : 1,
    }))
    // Relevant products first; within those, sellers we can show before unknowns and marketplaces.
    .sort((a, b) => (b.rel >= 0.5) - (a.rel >= 0.5) || b.score - a.score || b.rel - a.rel || a.c.position - b.c.position);

  const look = (list) =>
    mapLimit(list, concurrency, async (card) => {
      try {
        return { card, options: parseDetails(await fetchHtml(detailsUrl(query, card.id))) };
      } catch {
        return { card, options: [] };
      }
    });

  const sets = await look(ranked.slice(0, firstPass).map((r) => r.c));
  let built = buildGroups(sets, query, { cards, allowVerified });

  // Too little found: look at the next batch of products before giving up, unless the
  // shopper has already waited long enough.
  const more = ranked.slice(firstPass, firstPass + secondPass).map((r) => r.c);
  if (built.groups.length < 3 && more.length && Date.now() - started < budgetMs / 2) {
    sets.push(...(await look(more)));
    built = buildGroups(sets, query, { cards, allowVerified });
  }

  // Cards beyond the closer look still count if the results page gave a direct link.
  const looked = new Set(sets.map((s) => s.card.id));
  const direct = ranked.filter((r) => r.c.url && !looked.has(r.c.id)).map((r) => ({ card: r.c, options: [] }));
  if (direct.length) built = buildGroups([...sets, ...direct], query, { cards, allowVerified });

  const result = {
    query,
    ...built,
    refinements: suggestRefinements(cards.map((c) => c.title), query),
    listingsSeen: cards.length,
    fetchedAt: Date.now(),
  };
  // Confirm prices on the shops' own pages when a page fetcher is supplied.
  if (fetchPage) await verifyPrices(result, { fetchPage });
  return result;
}
