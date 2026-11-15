// Decides what a visitor is allowed to see. The lowest price in each comparison is
// locked: its price is sent, but the retailer, title and link never leave the server
// until that visitor has paid. Blurring in the page is decoration only.

const round2 = (n) => Math.round(n * 100) / 100;

// access: { subscriber: boolean, unlocked: Set<string> of offer ids }
export function present(result, access, { lockSingleOffers = false } = {}) {
  const groups = result.groups.map((g) => {
    const [first, second] = g.offers;
    const saving = second ? round2(second.price - first.price) : 0;
    const worthLocking = second ? saving >= 0.01 : lockSingleOffers;

    const offers = g.offers.map((o, i) => {
      const locked = i === 0 && worthLocking && !access.subscriber && !access.unlocked.has(o.id);
      if (locked) {
        return { id: o.id, locked: true, lowest: true, price: o.price, saving, tier: o.tier, check: o.check, listedPrice: o.listedPrice, image: `/api/img/${encodeURIComponent(o.id)}` };
      }
      return {
        id: o.id,
        locked: false,
        lowest: i === 0 && saving >= 0.01, // only a claim worth making when it beats another retailer
        retailer: o.retailer,
        tier: o.tier,
        company: o.company,
        check: o.check,
        listedPrice: o.listedPrice,
        title: o.title,
        price: o.price,
        url: o.url,
        image: o.image,
        logo: o.logo,
        delivery: o.delivery,
      };
    });

    // The heading must never be the locked shop's own wording. The live price check can
    // change which shop is cheapest after the heading was chosen, so decide it here.
    const headline = (t) => String(t || '').split(' | ')[0].trim();
    let label = g.label;
    if (offers[0].locked) {
      const others = g.offers.slice(1).map((o) => headline(o.title)).filter(Boolean);
      label = others.length
        ? others.sort((a, b) => a.length - b.length)[Math.floor((others.length - 1) / 2)]
        : `Lowest price found for “${result.query}”`;
    }

    return {
      key: g.key,
      label,
      size: g.size,
      retailers: g.offers.length,
      from: g.offers[0].price,
      offers,
    };
  });

  return {
    query: result.query,
    exact: result.exact,
    closestOnly: result.closestOnly,
    listingsSeen: result.listingsSeen,
    refinements: result.refinements || [],
    fetchedAt: result.checkedAt || result.fetchedAt,
    groups,
  };
}
