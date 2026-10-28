export function heartsFor(sofa, preferences = {}) {
  const saved = preferences[sofa.id];
  if (Number.isInteger(saved?.hearts) && saved.hearts >= 0 && saved.hearts <= 3) return saved.hearts;
  return (saved?.status ?? sofa.initial) === 'liked' ? 1 : 0;
}

export function setHearts(preferences, id, hearts) {
  if (!Number.isInteger(hearts) || hearts < 0 || hearts > 3) throw new RangeError('Choose 0–3 hearts');
  return { ...preferences, [id]: { ...preferences[id], hearts, status: hearts > 0 ? 'liked' : preferences[id]?.status === 'passed' ? 'passed' : 'unrated' } };
}

export function upperPrice(price) {
  if (Number.isFinite(price?.high)) return price.high;
  const reference = price?.display?.match(/^€([\d,]+)/);
  return reference ? Number(reference[1].replaceAll(',', '')) : null;
}

export function priceKind(price) {
  if (upperPrice(price) === null) return 'quote';
  if (/new/i.test(price.label)) return 'new';
  if (/vintage/i.test(price.label)) return 'vintage';
  return 'used';
}

export function initialFilters() {
  return { hearts: [0, 1, 2, 3], designer: '', brand: '', priceMin: '', priceMax: '', priceKinds: ['vintage', 'used', 'new', 'quote'], sleeping: ['bed', 'daybed', 'none'], sort: 'hearts-desc' };
}

export function filterSofas(sofas, prices, preferences, filters, query = '', view = 'all') {
  const q = query.toLowerCase().trim();
  return sofas.filter(sofa => {
    const hearts = heartsFor(sofa, preferences), price = prices[sofa.id], amount = upperPrice(price);
    for (const key of ['designer', 'brand']) if (filters[key] && !sofa[key].toLowerCase().includes(filters[key].trim().toLowerCase())) return false;
    if (view === 'new' && !sofa.new || view === 'liked' && hearts === 0 || view === 'beds' && sofa.bed !== 'bed' || view === 'newbeds' && !sofa.newBed) return false;
    if (!filters.hearts.includes(hearts) || !filters.sleeping.includes(sofa.bed) || !filters.priceKinds.includes(priceKind(price))) return false;
    if (filters.priceMin !== '' && (amount === null || amount < Number(filters.priceMin))) return false;
    if (filters.priceMax !== '' && (amount === null || amount > Number(filters.priceMax))) return false;
    return !q || [sofa.name, sofa.designer, sofa.brand, sofa.era, ...(sofa.tags || [])].join(' ').toLowerCase().includes(q);
  });
}

export function nextColumnSort(current, column) {
  const key = column === 'sofa' ? 'name' : column === 'sleeping' ? 'bed' : column;
  return `${key}-${current === `${key}-asc` ? 'desc' : 'asc'}`;
}

export function sortSofas(sofas, prices, preferences, sort, rank = []) {
  const curated = sofa => { const index = rank.indexOf(sofa.id); return index < 0 ? 999 : index; };
  const [key, direction = 'asc'] = sort.split('-');
  const sign = direction === 'desc' ? -1 : 1;
  const amount = sofa => Number.isFinite(prices[sofa.id]?.low) ? prices[sofa.id].low : upperPrice(prices[sofa.id]);
  const bedOrder = { bed: 0, daybed: 1, none: 2 };
  return [...sofas].sort((a, b) => {
    let comparison = 0;
    if (key === 'hearts') comparison = heartsFor(a, preferences) - heartsFor(b, preferences);
    if (key === 'price') {
      const x = amount(a), y = amount(b);
      if (x === null && y !== null) return 1;
      if (y === null && x !== null) return -1;
      if (x !== null && y !== null) comparison = x - y;
    }
    if (['name', 'designer', 'brand'].includes(key)) comparison = a[key].localeCompare(b[key]);
    if (key === 'bed') comparison = bedOrder[a.bed] - bedOrder[b.bed];
    return sign * comparison || curated(a) - curated(b);
  });
}

export function restoreScores(snapshot, preferences = {}) {
  const restored = { ...preferences };
  for (const [id, hearts] of Object.entries(snapshot?.scores || {})) {
    if (Number.isInteger(hearts) && hearts >= 0 && hearts <= 3 && !restored[id]) restored[id] = { hearts, status: hearts ? 'liked' : 'unrated' };
  }
  return restored;
}
