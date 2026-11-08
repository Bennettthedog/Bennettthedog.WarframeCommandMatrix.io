/* Stable mapping from StarHold's damage order to Veil's source-order squares.
   Rank ordering and invalid-position filtering mirror the original StarHold renderer. */
(() => {
  const normalize = key => String(key).replace(/\r?\n/g, ' ').replace(/[_-]+/g, ' ').replace(/[^\w# ]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  function validPos(entry) {
    const parts = String(entry?.pos || '').split(',').map(x => Number(x.trim()));
    return parts.length >= 4 && parts.every(Number.isFinite);
  }
  function damagedSources(doc, runtime = {}) {
    const result = new Set();
    for (const [key, entries] of Object.entries(doc.ssd || {})) {
      if (!Array.isArray(entries)) continue;
      let ordered = entries.map((entry, source) => ({entry, source})).filter(x => validPos(x.entry));
      const norm = normalize(key), shield = /^shield\s*#\s*(\d+)$/i.exec(key.trim());
      let indices;
      if (shield) indices = runtime.damagedShieldBoxIndicesByShield?.[String(Number(shield[1]))];
      else if (/armou?r/i.test(key)) indices = runtime.damagedArmorBoxIndicesByGroup?.[key.trim().toLowerCase()];
      else {
        if (['sensor', 'scanner', 'damage control'].includes(norm)) {
          ordered.sort((a, b) => {
            const ar = Number(a.entry.rank), br = Number(b.entry.rank);
            const av = Number.isFinite(ar), bv = Number.isFinite(br);
            return av && bv ? ar - br || a.source - b.source : av ? -1 : bv ? 1 : a.source - b.source;
          });
        }
        indices = runtime.damagedSsdBoxIndicesByKey?.[norm];
      }
      for (const index of indices || []) {
        if (ordered[index]) result.add(`${key}:${ordered[index].source}`);
      }
    }
    return result;
  }
  const mapping = {damagedSources, validPos};
  if (typeof module !== 'undefined') module.exports = mapping;
  else window.MatrixMapping = mapping;
})();
