const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const money = (n) => gbp.format(n);
const shortMoney = (n) => (Number.isInteger(n) ? `£${n}` : money(n));
const when = (ms) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// query: what is being shown now. base: the search the shopper started from, before any
// narrowing, so they can always go back to it.
const state = { config: null, query: '', base: '', data: null, view: { sort: 'match', maxPrice: '' } };

// ---------- recent searches (this device only) ----------
const RECENT_KEY = 'recentSearches';
function readRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; }
}
function rememberSearch(q) {
  try {
    const list = [q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch { /* storage unavailable: not worth bothering the shopper about */ }
  renderRecent();
}
function renderRecent() {
  const list = readRecent();
  const el = $('#recent');
  el.hidden = !list.length;
  el.innerHTML = list.length
    ? `<span>Recent:</span> ${list.map((q) => `<button type="button" class="chip chip-light" data-search="${esc(q)}">${esc(q)}</button>`).join(' ')}
       <button type="button" class="text-link" id="clearRecent">Clear</button>`
    : '';
}

async function api(path, options) {
  const res = await fetch(path, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
  return body;
}

// ---------- banner and toast ----------
function banner(text) {
  const el = $('#banner');
  el.textContent = text || '';
  el.hidden = !text;
}

let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.hidden = true; }, 250);
  }, 2600);
}

// ---------- sharing: the phone's own share sheet where there is one, otherwise copy ----------
async function share({ title, text, url }) {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(url ? `${text} ${url}` : text);
    toast('Copied. Paste it wherever you like.');
  } catch {
    toast('Copy the address from your browser to share.');
  }
}

// ---------- Christmas list (kept on this device only) ----------
const LIST_KEY = 'christmasList';
function readList() {
  try { return JSON.parse(localStorage.getItem(LIST_KEY)) || []; } catch { return []; }
}
function writeList(list) {
  try { localStorage.setItem(LIST_KEY, JSON.stringify(list)); } catch { toast('Your browser is not letting us save the list.'); }
  renderListCount();
  if (!$('#listDrawer').hidden) renderListDrawer();
}
const listHas = (key) => readList().some((x) => x.key === key);

function toggleList(key, btn) {
  const list = readList();
  const i = list.findIndex((x) => x.key === key);
  if (i >= 0) {
    list.splice(i, 1);
    writeList(list);
    toast('Removed from your list.');
  } else {
    const g = state.data && state.data.groups.find((x) => x.key === key);
    if (!g) return;
    const first = g.offers[0];
    list.push({
      key,
      label: g.label,
      price: g.from,
      shops: g.retailers,
      image: (g.offers.find((o) => !o.locked && o.image) || {}).image || null,
      shop: first.locked ? null : first.retailer,
      url: first.locked ? null : first.url,
      query: state.query,
      added: Date.now(),
    });
    writeList(list);
    toast('Added to your Christmas list.');
  }
  if (btn) {
    const on = listHas(key);
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.querySelector('span').textContent = on ? 'On your list' : 'Add to list';
  }
}

function renderListCount() {
  const n = readList().length;
  document.querySelectorAll('[data-list-count]').forEach((el) => {
    el.textContent = n;
    el.classList.toggle('has-items', n > 0);
  });
}

function renderListDrawer() {
  const list = readList();
  const body = $('#listBody');
  if (!list.length) {
    body.innerHTML = `
      <div class="list-empty">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="9" width="17" height="11.5" rx="1.5"/><path d="M12 9v11.5M3.5 13h17M12 9c-1.6-3.6-6-4.2-6-1.6C6 9 9.5 9 12 9zm0 0c1.6-3.6 6-4.2 6-1.6C18 9 14.5 9 12 9z"/></svg>
        <p><strong>Your list is empty.</strong></p>
        <p class="muted">Search for a gift and tap "Add to list". We keep the lowest price and add up your total.</p>
      </div>`;
    return;
  }
  const total = list.reduce((n, x) => n + x.price, 0);
  body.innerHTML = `
    <ul class="list-items">
      ${list.map((x) => `
        <li class="list-item">
          ${x.image ? `<img src="${esc(x.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="list-noimg" aria-hidden="true"></span>'}
          <div class="list-info">
            <p class="list-name">${esc(x.label)}</p>
            <p class="list-meta">${x.shop ? `Cheapest at ${esc(x.shop)}` : 'Cheapest shop locked'} · ${x.shops} ${x.shops === 1 ? 'shop' : 'shops'} compared</p>
            <div class="list-acts">
              ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Go to ${esc(x.shop)}</a>` : ''}
              <button type="button" class="text-link" data-search="${esc(x.query)}" data-close-list>Check price again</button>
              <button type="button" class="text-link" data-remove-list="${esc(x.key)}">Remove</button>
            </div>
          </div>
          <p class="list-price">${money(x.price)}</p>
        </li>`).join('')}
    </ul>
    <div class="list-total">
      <span>Total at the lowest prices</span>
      <strong>${money(total)}</strong>
    </div>
    <p class="list-note">Prices as they were when you added each gift. Tap "Check price again" for today's price.</p>
    <div class="list-foot">
      <button type="button" class="btn btn-light" id="shareList">Share my list</button>
      <button type="button" class="text-link" id="clearList">Clear list</button>
    </div>`;
}

let listReturnFocus = null;
function openList() {
  listReturnFocus = document.activeElement;
  renderListDrawer();
  $('#listBackdrop').hidden = false;
  $('#listDrawer').hidden = false;
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => {
    $('#listDrawer').classList.add('open');
    $('#listBackdrop').classList.add('open');
    $('#closeList').focus();
  });
}
function closeList() {
  $('#listDrawer').classList.remove('open');
  $('#listBackdrop').classList.remove('open');
  document.body.classList.remove('no-scroll');
  setTimeout(() => { $('#listDrawer').hidden = true; $('#listBackdrop').hidden = true; }, 250);
  if (listReturnFocus && listReturnFocus.focus) listReturnFocus.focus();
}

function shareList() {
  const list = readList();
  const lines = list.map((x) => `- ${x.label}: ${money(x.price)}${x.shop ? ` at ${x.shop}` : ''}`);
  const total = list.reduce((n, x) => n + x.price, 0);
  share({
    title: 'My Christmas list',
    text: `My Christmas list, at the lowest prices I found:\n${lines.join('\n')}\nTotal: ${money(total)}\nFound with ${state.config.siteName}:`,
    url: location.origin,
  });
}

// ---------- Christmas countdown ----------
function renderCountdown() {
  const now = new Date();
  const xmas = new Date(now.getFullYear(), 11, 25);
  const days = Math.ceil((xmas - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  const el = $('#countdown');
  if (days < 0 || days > 60) { el.hidden = true; return; }
  el.textContent = days === 0 ? 'Happy Christmas' : days === 1 ? '1 day to go' : `${days} days to go`;
  el.hidden = false;
}

// ---------- the search bar that follows you down the page ----------
function setupMiniBar() {
  const bar = $('#miniBar');
  const focusables = bar.querySelectorAll('input, button, a');
  const set = (show) => {
    bar.classList.toggle('show', show);
    bar.setAttribute('aria-hidden', String(!show));
    focusables.forEach((el) => { el.tabIndex = show ? 0 : -1; });
  };
  const toTop = $('#toTop');
  window.addEventListener('scroll', () => { toTop.hidden = window.scrollY < 900; }, { passive: true });
  if (!('IntersectionObserver' in window)) return;
  new IntersectionObserver(([entry]) => set(!entry.isIntersecting && entry.boundingClientRect.top < 0), { threshold: 0 })
    .observe($('#searchForm'));
}

// ---------- results ----------
function photo(src, alt) {
  return src
    ? `<div class="photo"><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer"></div>`
    : '<div class="photo">No photo available</div>';
}

// Says plainly which kind of seller this is, so the shopper can judge for themselves.
function trustLine(o) {
  if (o.tier === 'verified') {
    const who = o.company ? `${esc(o.company)}, ` : '';
    return `<div class="trust">Verified UK business <span class="trust-note">(${who}identity checked by Microsoft Advertising)</span></div>`;
  }
  if (o.tier === 'established') return '<div class="trust">Established UK retailer</div>';
  return '';
}

const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 >= 11 && n % 100 <= 13) || n % 10 > 3 ? 0 : n % 10]}`;

// The rank line at the top of every shop card: who is cheapest, and by how much the rest cost more.
function rankLine(rank, price, cheapest) {
  if (rank === 1) return '<div class="rank rank-first"><span class="rank-no">1</span> Cheapest</div>';
  const more = price - cheapest;
  return `<div class="rank"><span class="rank-no">${rank}</span> <span class="rank-word">${ordinal(rank)} cheapest</span>${more >= 0.01 ? ` <span class="more">+${money(more)}</span>` : ' <span class="more">same price</span>'}</div>`;
}

// How sure we are of the price: checked on the shop's own site, or only as listed.
// A short badge; the fuller explanation is in its tooltip and in the results summary.
function checkLine(o, shopName) {
  const where = shopName ? `${esc(shopName)}'s website` : "the shop's website";
  if (o.check === 'confirmed') return `<span class="check check-ok" title="Price confirmed on ${where} just now">Checked at shop</span>`;
  if (o.check === 'updated') return `<span class="check check-ok" title="Price confirmed on ${where} just now. Shopping listings showed ${money(o.listedPrice)}.">Checked at shop</span>`;
  return `<span class="check" title="This shop's website does not allow automatic checks, so this is its latest listed price. Confirm it on the shop's site.">Listed price</span>`;
}

function shopCard(o, rank, cheapest) {
  const logo = o.logo ? `<img src="${esc(o.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '';
  return `
    <li class="shop${rank === 1 ? ' is-cheapest' : ''}">
      ${rankLine(rank, o.price, cheapest)}
      ${photo(o.image, o.title)}
      <div class="price">${money(o.price)}</div>
      ${checkLine(o, o.retailer)}
      <div class="retailer">${logo}<span>${esc(o.retailer)}</span></div>
      ${trustLine(o)}
      <div class="title" title="${esc(o.title)}">${esc(o.title)}</div>
      ${o.delivery ? `<div class="delivery">${esc(o.delivery)}</div>` : ''}
      <a class="btn" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">Go to ${esc(o.retailer)}</a>
    </li>`;
}

function lockedCard(o) {
  const c = state.config;
  const off = c.payments === 'off';
  return `
    <li class="shop is-cheapest locked">
      <span class="locked-badge">Best price</span>
      <div class="rank rank-first"><span class="rank-no">1</span> Cheapest</div>
      <div class="photo"><img src="${esc(o.image)}" alt="" loading="lazy"></div>
      <div class="price">${money(o.price)}</div>
      ${checkLine(o, '')}
      <div class="retailer veiled" aria-hidden="true">Retailer name</div>
      <div class="trust">${o.tier === 'verified' ? 'Verified UK business' : 'Established UK retailer'}</div>
      <p class="saving">${money(o.saving)} less than the next shop. Unlock to see where.</p>
      <button type="button" class="btn btn-light" data-unlock="${esc(o.id)}" ${off ? 'disabled' : ''}>Unlock for ${shortMoney(c.unlockPrice)}</button>
      <button type="button" class="text-link" data-subscribe ${off ? 'disabled' : ''}>or unlock everything, ${shortMoney(c.subscriptionPrice)} a month</button>
      ${off ? '<small>Payments are not connected yet.</small>' : ''}
    </li>`;
}

function groupHtml(g, maxPrice) {
  const cheapest = g.offers[0].price;
  const dearest = g.offers[g.offers.length - 1].price;
  const shown = g.offers.map((o, i) => ({ o, rank: i + 1 })).filter(({ o }) => !maxPrice || o.price <= maxPrice);
  if (!shown.length) return '';
  const spread = dearest - cheapest;
  const summary = g.retailers > 1
    ? `Cheapest <strong>${money(cheapest)}</strong> · ${g.retailers} shops compared${spread >= 0.01 ? ` · up to ${money(spread)} between them` : ''}`
    : `<strong>${money(cheapest)}</strong> · only one trusted shop has this right now`;
  const saved = listHas(g.key);
  return `
    <article class="group">
      <header class="group-head">
        <div class="group-title">
          <h3>${esc(g.label)}</h3>
          <p>${summary}</p>
        </div>
        <div class="group-actions">
          <button type="button" class="pill-btn${saved ? ' is-on' : ''}" data-add-list="${esc(g.key)}" aria-pressed="${saved}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="9" width="17" height="11.5" rx="1.5"/><path d="M12 9v11.5M3.5 13h17M12 9c-1.6-3.6-6-4.2-6-1.6C6 9 9.5 9 12 9zm0 0c1.6-3.6 6-4.2 6-1.6C18 9 14.5 9 12 9z"/></svg>
            <span>${saved ? 'On your list' : 'Add to list'}</span>
          </button>
          <button type="button" class="pill-btn" data-share-group="${esc(g.key)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3.5M7.5 8L12 3.5 16.5 8M5 12.5v6.5a1.5 1.5 0 001.5 1.5h11a1.5 1.5 0 001.5-1.5v-6.5"/></svg>
            <span>Share</span>
          </button>
        </div>
      </header>
      <ol class="shops" aria-label="Shops selling this, cheapest first">
        ${shown.map(({ o, rank }) => (o.locked ? lockedCard(o) : shopCard(o, rank, cheapest))).join('')}
      </ol>
    </article>`;
}

// Re-draws the product list after a sort or price-limit change, without searching again.
function renderGroups() {
  const data = state.data;
  const maxPrice = Number(state.view.maxPrice) || 0;
  const groups = [...data.groups];
  if (state.view.sort === 'price') groups.sort((a, b) => a.from - b.from);
  if (state.view.sort === 'shops') groups.sort((a, b) => b.retailers - a.retailers || a.from - b.from);
  const html = groups.map((g) => groupHtml(g, maxPrice)).filter(Boolean);
  const list = $('#groupList');
  if (!html.length) {
    list.innerHTML = `<p class="status">Nothing at or under ${money(maxPrice)}.<small>Raise or clear the price limit to see the rest.</small></p>`;
    return;
  }
  list.innerHTML = html
    .map((h, i) => h + (i === 0 ? '<aside class="ad" data-slot="results" aria-label="Advertisement"></aside>' : ''))
    .join('');
  $('#showing').textContent = html.length === data.groups.length ? '' : `Showing ${html.length} of ${data.groups.length} products.`;
  fillAds();
}

function refineHtml(data) {
  const chips = (data.refinements || [])
    .map((r) => `<li><button type="button" class="chip" data-refine="${esc(r.label)}">${esc(r.label)}</button></li>`)
    .join('');
  const narrowed = state.base && state.base.toLowerCase() !== data.query.toLowerCase();
  return `
    <section class="refine" aria-labelledby="refineTitle">
      <div class="refine-top">
        <h3 id="refineTitle">Not quite what you meant?</h3>
        <p class="muted">${chips ? 'Narrow it down with a type, brand or size we found, or add your own details.' : 'Add details such as brand, size, colour, team or model number.'}</p>
      </div>
      ${narrowed ? `<p class="narrowed">Narrowed from “${esc(state.base)}”. <button type="button" class="text-link" data-search="${esc(state.base)}" data-keep-base>Go back</button></p>` : ''}
      ${chips ? `<ul class="chips">${chips}</ul>` : ''}
      <div class="refine-row">
        <form id="refineForm" class="refine-form" autocomplete="off">
          <label class="sr" for="refineInput">Add details to your search</label>
          <input id="refineInput" type="text" maxlength="60" placeholder="Add details, e.g. Topps, 2025, 50ml, black">
          <button type="submit" class="btn">Search again</button>
        </form>
        <div class="controls">
          <label>Order by
            <select id="sortSelect">
              <option value="match">Best match</option>
              <option value="price">Lowest price first</option>
              <option value="shops">Most shops compared</option>
            </select>
          </label>
          <label>Max price (£)
            <input id="maxPrice" type="number" min="0" step="1" inputmode="numeric" placeholder="No limit">
          </label>
          <button type="button" class="text-link copy-link" id="shareResults">Share these results</button>
        </div>
      </div>
    </section>`;
}

function checkedSummary(data) {
  const all = data.groups.flatMap((g) => g.offers);
  const checked = all.filter((o) => o.check === 'confirmed' || o.check === 'updated').length;
  if (!all.length || !all.some((o) => o.check)) return '';
  return `${checked} of ${all.length} prices were checked on the shop's own website just now; the rest are the shop's latest listed price.`;
}

function renderResults(data) {
  const el = $('#results');
  state.data = data;
  state.view = { sort: 'match', maxPrice: '' };
  if (!data.groups.length) {
    el.innerHTML = `
      <div class="searching">
        <p class="searching-label">Search finished: nothing found</p>
        <h2>“${esc(data.query)}”</h2>
        <p>We looked at ${data.listingsSeen} listings, but none matching what you typed came from a seller we trust. Rather than send you to a marketplace or an unknown shop, we show nothing.</p>
        <p class="muted">Try the brand and product name without extra words, or check the spelling.</p>
      </div>
      ${state.base && state.base.toLowerCase() !== data.query.toLowerCase() ? `<p><button type="button" class="btn" data-search="${esc(state.base)}" data-keep-base>Back to “${esc(state.base)}”</button></p>` : ''}`;
    return;
  }
  const note = data.exact
    ? 'Each product shows every trusted UK shop selling it, side by side, cheapest on the left.'
    : `We could not find an exact match for “${esc(data.query)}”. These are the closest products from trusted sellers.`;

  // The single cheapest price anywhere in these results, so it is the first thing seen.
  const best = data.groups.reduce((b, g) => (!b || g.from < b.g.from ? { g } : b), null).g;
  const prices = data.groups.reduce((n, g) => n + g.retailers, 0);
  const found = `Search finished: ${data.groups.length} ${data.groups.length === 1 ? 'product' : 'products'}, ${prices} ${prices === 1 ? 'price' : 'prices'} compared.`;

  el.innerHTML = `
    <div class="results-head">
      <div class="intro">
        <p class="searching-label">${found}</p>
        <h2>Prices for “${esc(data.query)}”</h2>
        <p>${note}</p>
        <p class="fine">${checkedSummary(data)} Prices as of ${when(data.fetchedAt)}. Delivery costs are not included; the shop shows them at checkout.</p>
      </div>
      <div class="best-bar">
        <span class="best-label">Lowest price found</span>
        <span class="best-price">${money(best.from)}</span>
        <span class="best-what">${esc(best.label)}</span>
      </div>
    </div>
    ${refineHtml(data)}
    <p class="muted" id="showing"></p>
    <div id="groupList"></div>`;
  renderGroups();
}

// While a search runs: one clear panel saying what is being searched for, what is
// happening now, and where the results will appear. The steps describe what the
// search does; they move on a timer because the server answers in one go.
let stepTimers = [];
function showSearching(q) {
  stepTimers.forEach(clearTimeout);
  const el = $('#results');
  el.setAttribute('aria-busy', 'true');
  el.innerHTML = `
    <div class="searching" role="status">
      <p class="searching-label">Searching now</p>
      <h2>“${esc(q)}”</h2>
      <div class="track"><div class="runner"></div></div>
      <ol class="search-steps">
        <li class="active">Finding it at UK retailers</li>
        <li>Removing any seller not on our trusted list</li>
        <li>Matching like for like and putting the cheapest first</li>
        <li>Checking each price on the shop's own website</li>
      </ol>
      <p class="muted">This usually takes ten to fifteen seconds. Your prices will appear right here.</p>
    </div>
    <div class="skeleton" aria-hidden="true">
      <div class="sk-head"><span class="sk-line w60"></span><span class="sk-line w30"></span></div>
      <div class="sk-row">${'<div class="sk-card"><span class="sk-img"></span><span class="sk-line w50"></span><span class="sk-line w80"></span><span class="sk-line w70"></span></div>'.repeat(4)}</div>
    </div>`;
  const steps = [...el.querySelectorAll('.search-steps li')];
  const advance = (n) => () => {
    if (!steps[n] || !steps[n].isConnected) return;
    steps[n - 1].className = 'done';
    steps[n].className = 'active';
  };
  stepTimers = [setTimeout(advance(1), 2500), setTimeout(advance(2), 5500), setTimeout(advance(3), 8500)];
}

function setSearchBusy(busy) {
  const btn = $('#searchForm button');
  btn.disabled = busy;
  btn.textContent = busy ? 'Searching' : 'Find the lowest price';
  const mini = $('#miniForm button');
  mini.disabled = busy;
  mini.textContent = busy ? 'Searching' : 'Search';
}

async function search(query, { push = true, keepBase = false } = {}) {
  const q = query.trim().replace(/\s+/g, ' ');
  if (q.length < 2) return;
  if (!keepBase || !state.base) state.base = q;
  state.query = q;
  rememberSearch(state.base);
  $('#q').value = q;
  $('#miniQ').value = q;
  document.title = `${q}: lowest prices | ${state.config ? state.config.siteName : 'Shrewd'}`;
  if (push) {
    const from = state.base !== q ? `&from=${encodeURIComponent(state.base)}` : '';
    history.pushState({}, '', `/?q=${encodeURIComponent(q)}${from}`);
  }
  const el = $('#results');
  showSearching(q);
  setSearchBusy(true);
  requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  try {
    const data = await api(`/api/search?q=${encodeURIComponent(q)}`);
    if (state.query !== q) return; // a newer search has taken over
    renderResults(data);
  } catch (err) {
    if (state.query !== q) return;
    el.innerHTML = `
      <div class="searching">
        <p class="searching-label">Search did not finish</p>
        <h2>“${esc(q)}”</h2>
        <p>${esc(err.message)}</p>
        <button type="button" class="btn" data-search="${esc(q)}">Try again</button>
      </div>`;
  }
  stepTimers.forEach(clearTimeout);
  el.removeAttribute('aria-busy');
  setSearchBusy(false);
  // Bring the finished results to the top once the page has laid them out.
  requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

// ---------- payments ----------
async function checkout(kind, offerId) {
  try {
    const { url } = await api('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, offerId, q: state.query }),
    });
    location.href = url;
  } catch (err) {
    banner(err.message);
    $('#banner').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

async function manageMembership() {
  try {
    const { url } = await api('/api/portal', { method: 'POST' });
    location.href = url;
  } catch (err) {
    banner(err.message);
  }
}

// ---------- unlocked deals ----------
function renderDeals() {
  const deals = state.config.unlocks || [];
  $('#dealsBtn').hidden = deals.length === 0;
  $('#dealsList').innerHTML = deals
    .slice()
    .reverse()
    .map((d) => `
      <li class="offer">
        ${photo(d.image, d.title)}
        <div><div class="retailer"><span>${esc(d.retailer)}</span></div><div class="title">${esc(d.title)}</div></div>
        <div class="buy"><div class="price">${money(d.price)}</div>
        <a class="btn" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">Go to ${esc(d.retailer)}</a></div>
      </li>`)
    .join('');
}

// ---------- advertising ----------
// With ADSENSE_CLIENT set, each space becomes a live AdSense unit, but only after the
// visitor has accepted advertising cookies (UK rules). Without it, the spaces show as
// labelled placeholders so you can see where adverts will sit.
const CONSENT_KEY = 'adConsent';
const readConsent = () => { try { return localStorage.getItem(CONSENT_KEY); } catch { return null; } };
function setConsent(value) {
  try { localStorage.setItem(CONSENT_KEY, value); } catch { /* ignore */ }
  $('#consent').hidden = true;
  if (value === 'yes') {
    document.querySelectorAll('.ad[data-filled]').forEach((el) => { el.removeAttribute('data-filled'); el.hidden = false; });
    fillAds();
  }
}

let adScriptLoaded = false;
function fillAds() {
  const { client, slots } = state.config.ads;
  const consent = readConsent();
  if (client && !consent) $('#consent').hidden = false;
  for (const el of document.querySelectorAll('.ad:not([data-filled])')) {
    el.dataset.filled = '1';
    if (!client) { el.textContent = 'Advertisement'; continue; }
    const slot = slots[el.dataset.slot];
    if (!slot || consent !== 'yes') { el.hidden = true; continue; }
    if (!adScriptLoaded) {
      const s = document.createElement('script');
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
      document.head.appendChild(s);
      adScriptLoaded = true;
    }
    el.classList.add('live');
    el.innerHTML = `<ins class="adsbygoogle" style="display:block" data-ad-client="${esc(client)}" data-ad-slot="${esc(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  }
}

// ---------- start ----------
function applyConfig() {
  const c = state.config;
  document.title = `${c.siteName}: the lowest price from shops you can trust`;
  for (const el of document.querySelectorAll('[data-site-name]')) el.textContent = c.siteName;
  for (const el of document.querySelectorAll('[data-unlock-price]')) el.textContent = shortMoney(c.unlockPrice);
  for (const el of document.querySelectorAll('[data-sub-price]')) el.textContent = shortMoney(c.subscriptionPrice);
  $('#reassure').textContent = c.verifiedSellers
    ? `${c.retailerCount} established UK retailers, plus UK businesses with verified identities. No marketplaces, no overseas drop-shippers.`
    : `${c.retailerCount} established UK retailers only. No marketplaces, no overseas drop-shippers.`;
  const m = $('#memberBtn');
  if (c.subscriber) {
    m.textContent = c.canManage ? 'Manage membership' : 'Member';
    m.disabled = !c.canManage;
  } else {
    m.textContent = `Membership ${shortMoney(c.subscriptionPrice)} a month`;
    m.disabled = c.payments === 'off';
    if (m.disabled) m.title = 'Payments are not connected yet.';
  }
  for (const b of document.querySelectorAll('.plan-btn')) {
    if (c.subscriber) { b.textContent = 'You are a member'; b.disabled = true; }
    else if (c.payments === 'off') { b.disabled = true; b.title = 'Payments are not connected yet.'; }
  }
  renderDeals();
  fillAds();
}

// Adds words to the current search ("football card" + "Topps"), keeping the original to go back to.
function narrow(extra) {
  const words = extra.trim();
  if (!words) return;
  const already = state.query.toLowerCase().split(/\s+/);
  const add = words.split(/\s+/).filter((w) => !already.includes(w.toLowerCase())).join(' ');
  search(add ? `${state.query} ${add}` : state.query, { keepBase: true });
}

function shareGroup(key) {
  const g = state.data && state.data.groups.find((x) => x.key === key);
  if (!g) return;
  const url = `${location.origin}/?q=${encodeURIComponent(state.query)}`;
  share({
    title: g.label,
    text: `${g.label}: from ${money(g.from)} across ${g.retailers} trusted UK ${g.retailers === 1 ? 'shop' : 'shops'}.`,
    url,
  });
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'listBackdrop') return closeList();
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.unlock) return checkout('unlock', t.dataset.unlock);
  if ('subscribe' in t.dataset) return checkout('subscription');
  if (t.dataset.refine) return narrow(t.dataset.refine);
  if (t.dataset.addList) return toggleList(t.dataset.addList, t);
  if (t.dataset.shareGroup) return shareGroup(t.dataset.shareGroup);
  if (t.dataset.removeList) {
    writeList(readList().filter((x) => x.key !== t.dataset.removeList));
    document.querySelectorAll(`[data-add-list="${CSS.escape(t.dataset.removeList)}"]`).forEach((b) => {
      b.classList.remove('is-on'); b.setAttribute('aria-pressed', 'false'); b.querySelector('span').textContent = 'Add to list';
    });
    return;
  }
  if ('openList' in t.dataset) return openList();
  if (t.id === 'closeList') return closeList();
  if (t.id === 'shareList') return shareList();
  if (t.id === 'clearList') {
    writeList([]);
    document.querySelectorAll('[data-add-list].is-on').forEach((b) => {
      b.classList.remove('is-on'); b.setAttribute('aria-pressed', 'false'); b.querySelector('span').textContent = 'Add to list';
    });
    return;
  }
  if (t.id === 'shareResults') return share({ title: `Prices for ${state.query}`, text: `Lowest prices for "${state.query}" at trusted UK shops:`, url: `${location.origin}/?q=${encodeURIComponent(state.query)}` });
  if (t.id === 'shareSite') return share({ title: state.config.siteName, text: 'Find which trusted UK shop sells any gift for the least. Free to search:', url: location.origin });
  if (t.id === 'toTop') { window.scrollTo({ top: 0, behavior: 'smooth' }); $('#q').focus({ preventScroll: true }); return; }
  if (t.id === 'consentYes') return setConsent('yes');
  if (t.id === 'consentNo') return setConsent('no');
  if (t.id === 'clearRecent') { try { localStorage.removeItem(RECENT_KEY); } catch {} return renderRecent(); }
  if (t.dataset.search) {
    if ('closeList' in t.dataset) closeList();
    return search(t.dataset.search, { keepBase: 'keepBase' in t.dataset && t.dataset.search !== state.base ? true : false });
  }
  if (t.id === 'memberBtn') return state.config.subscriber ? manageMembership() : checkout('subscription');
  if (t.id === 'dealsBtn') { $('#deals').hidden = false; $('#deals').scrollIntoView({ behavior: 'smooth' }); }
});

$('#searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  state.base = '';
  $('#q').blur(); // closes the phone keyboard so the results are in view
  search($('#q').value);
});
$('#miniForm').addEventListener('submit', (e) => {
  e.preventDefault();
  state.base = '';
  $('#miniQ').blur();
  search($('#miniQ').value);
});

// Keyboard: "/" jumps to the search box; Escape closes the list.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#listDrawer').hidden) { closeList(); return; }
  if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $('#q').focus({ preventScroll: true });
  }
  // Keep keyboard focus inside the open list panel.
  if (e.key === 'Tab' && !$('#listDrawer').hidden) {
    const f = [...$('#listDrawer').querySelectorAll('button, a[href], input')].filter((x) => !x.disabled);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
});

// The narrowing form and the sort and price controls are redrawn with each result,
// so listen at the document level.
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'refineForm') return;
  e.preventDefault();
  narrow($('#refineInput').value);
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'sortSelect') { state.view.sort = e.target.value; renderGroups(); }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'maxPrice') { state.view.maxPrice = e.target.value; renderGroups(); }
});

window.addEventListener('popstate', () => {
  const p = new URLSearchParams(location.search);
  const q = p.get('q');
  if (!q) return;
  state.base = p.get('from') || '';
  search(q, { push: false, keepBase: Boolean(state.base) });
});

(async function start() {
  const params = new URLSearchParams(location.search);
  renderCountdown();
  renderListCount();
  setupMiniBar();
  try {
    state.config = await api('/api/config');
  } catch (err) {
    banner('The site could not load its settings. Please refresh the page.');
    return;
  }
  applyConfig();

  const paid = params.get('paid');
  if (paid === 'unlock') banner('Payment received. Your deal is unlocked below and saved under “Your unlocked deals”.');
  else if (paid === 'subscription') banner('Membership active. Every lowest price is now unlocked for you.');
  else if (paid === 'failed') banner('The payment did not complete, so nothing has been unlocked.');
  else if (state.config.payments === 'test') banner('Test mode: payments are simulated and no money is taken.');
  if (paid) {
    params.delete('paid');
    const rest = params.toString();
    history.replaceState({}, '', rest ? `/?${rest}` : '/');
  }

  renderRecent();
  const q = params.get('q');
  if (q) {
    state.base = params.get('from') || '';
    search(q, { push: false, keepBase: Boolean(state.base) });
  }
})();
