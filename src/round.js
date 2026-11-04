// Erledigungs-Runde: mehrere Erledigungen (z. B. Brief + Altglas + Geld) zu einer kurzen Runde verbinden.
// Alles wird auf dem Gerät berechnet; es werden keine Daten verschickt.

export const ROUND_TASKS = [
  { id: 'brief', label: 'Brief einwerfen', cats: ['briefkasten'] },
  { id: 'paket', label: 'Paket abgeben', cats: ['packstation', 'paketshop'] },
  { id: 'geld', label: 'Geld abheben', cats: ['geldautomat'] },
  { id: 'glas', label: 'Altglas', cats: ['glas'] },
  { id: 'papier', label: 'Altpapier', cats: ['papier'] },
  { id: 'kleider', label: 'Altkleider', cats: ['altkleider'] },
  { id: 'apotheke', label: 'Apotheke', cats: ['apotheke'] },
  { id: 'tanken', label: 'Tanken', cats: ['tankstelle'] },
  { id: 'laden', label: 'E-Auto laden', cats: ['ladesaeule'] },
  { id: 'wc', label: 'Toilette', cats: ['toilette'] },
  { id: 'wertstoff', label: 'Wertstoffhof', cats: ['wertstoffhof'] },
];

// Google Maps erlaubt auf dem Handy höchstens 3 Zwischenstopps + Ziel → 4 Erledigungen
export const MAX_TASKS = 4;

export const ROUND_MODES = {
  walking: { label: 'Zu Fuß', radius: 2500, kmh: 4.5, detour: 1.3 },
  bicycling: { label: 'Rad', radius: 6000, kmh: 15, detour: 1.3 },
  driving: { label: 'Auto', radius: 20000, kmh: 35, detour: 1.4 },
};

const CANDIDATES = 7; // je Erledigung die nächsten 7 Orte prüfen

export function distM(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function permutations(n) {
  if (n <= 1) return [[0].slice(0, n)];
  const out = [];
  for (const p of permutations(n - 1)) for (let i = 0; i <= p.length; i++) out.push([...p.slice(0, i), n - 1, ...p.slice(i)]);
  return out;
}

/**
 * Kürzeste Runde ab `start`.
 * items: alle geladenen Orte; ok(item, task) entscheidet, ob ein Ort für eine Erledigung in Frage kommt
 * (Kategorie, Filter, jetzt geöffnet). back: Rückweg zum Start mitrechnen (nur für die Reihenfolge).
 * Ergebnis: { stops: [{ task, item, legM }], missing: [task], totalM, minutes }
 */
export function planRound({ items, start, taskIds, mode = 'walking', back = true, ok = () => true }) {
  const m = ROUND_MODES[mode] || ROUND_MODES.walking;
  const tasks = taskIds.map((id) => ROUND_TASKS.find((t) => t.id === id)).filter(Boolean).slice(0, MAX_TASKS);
  const lists = [];
  const missing = [];
  for (const task of tasks) {
    const cands = items
      .filter((it) => task.cats.includes(it.c) && ok(it, task))
      .map((it) => ({ it, d: distM(start, it) }))
      .filter((x) => x.d <= m.radius)
      .sort((a, b) => a.d - b.d)
      .slice(0, CANDIDATES)
      .map((x) => x.it);
    if (cands.length) lists.push({ task, cands }); else missing.push(task);
  }
  if (!lists.length) return { stops: [], missing, totalM: 0, minutes: 0 };

  const perms = permutations(lists.length);
  let best = null;
  const pick = new Array(lists.length);
  const walk = (k) => {
    if (k === lists.length) {
      const pts = pick.map((ci, i) => lists[i].cands[ci]);
      const seen = new Set(pts.map((p) => p.id));
      if (seen.size < pts.length) return; // derselbe Ort nicht doppelt
      for (const order of perms) {
        let d = 0, prev = start, cut = false;
        for (const i of order) { d += distM(prev, pts[i]); prev = pts[i]; if (best && d >= best.cost) { cut = true; break; } }
        if (cut) continue;
        const cost = d + (back ? distM(prev, start) : 0);
        if (!best || cost < best.cost) best = { cost, order: [...order], pts: [...pts] };
      }
      return;
    }
    for (let ci = 0; ci < lists[k].cands.length; ci++) { pick[k] = ci; walk(k + 1); }
  };
  walk(0);
  if (!best) return { stops: [], missing, totalM: 0, minutes: 0 };

  let prev = start, totalM = 0;
  const stops = best.order.map((i) => {
    const item = best.pts[i];
    const legM = distM(prev, item);
    totalM += legM; prev = item;
    return { task: lists[i].task, item, legM };
  });
  const backM = back ? distM(prev, start) : 0;
  totalM += backM;
  const minutes = Math.max(1, Math.round((totalM * m.detour) / 1000 / m.kmh * 60));
  return { stops, missing, totalM, backM, minutes };
}

/** Google-Maps-Link mit Zwischenstopps (ohne Startpunkt: Google nimmt den eigenen Standort, unser Standort wird nicht übertragen). */
export function googleRoundUrl(stops, mode = 'walking') {
  const p = (it) => `${it.lat},${it.lon}`;
  const last = stops[stops.length - 1].item;
  const way = stops.slice(0, -1).map((s) => p(s.item)).join('|');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p(last))}${way ? `&waypoints=${encodeURIComponent(way)}` : ''}&travelmode=${mode}`;
}
