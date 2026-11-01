// Wandelt den OSM-Export (GeoJSON-Sequenz aus scripts/fetch-osm.sh) in Kacheln für die App um:
//   data/index.json         Übersicht (Stand, Kachelliste, Anzahl je Kategorie)
//   data/t/<y>_<x>.json     Orte + Ortsnamen je Kachel (tileDeg × tileDeg Grad)
// Aufruf: node scripts/build-data.mjs work/all.geojsonseq

import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import readline from 'node:readline';
import { classify, KEEP_TAG, parcelInfo } from '../src/categories.js';
import { loadExternal, SOURCES } from './external.mjs';
import { loadCities, CITY_SOURCES } from './cities.mjs';
for (const [k, v] of Object.entries(CITY_SOURCES)) SOURCES[k] = { name: v.name, license: v.license, url: v.url };

const root = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('config.json', root), 'utf8'));
const TILE = config.tileDeg;
const input = process.argv[2] || 'work/all.geojsonseq';

function repPoint(g) {
  if (!g) return null;
  const avg = (pts) => {
    let la = 0, lo = 0;
    for (const [x, y] of pts) { lo += x; la += y; }
    return [lo / pts.length, la / pts.length];
  };
  switch (g.type) {
    case 'Point': return g.coordinates;
    case 'LineString': return g.coordinates[Math.floor(g.coordinates.length / 2)];
    case 'Polygon': return avg(g.coordinates[0]);
    case 'MultiPolygon': return avg(g.coordinates[0][0]);
    default: return null;
  }
}

const items = [];
const places = [];
const rl = readline.createInterface({ input: createReadStream(input), crlfDelay: Infinity });
for await (let line of rl) {
  line = line.replace(/^\x1e/, '').trim();
  if (!line) continue;
  const f = JSON.parse(line);
  const props = f.properties || {};
  const type = props['@type'];
  const id = props['@id'];
  const tags = {};
  for (const [k, v] of Object.entries(props)) if (k[0] !== '@') tags[k] = v;
  const p = repPoint(f.geometry);
  if (!p) continue;
  const lon = +p[0].toFixed(6), lat = +p[1].toFixed(6);
  if (tags.place && tags.name && type === 'node') {
    places.push([tags.name, lat, lon, tags.place]);
  }
  const cats = classify(tags);
  if (!cats.length) continue;
  const t = {};
  for (const [k, v] of Object.entries(tags)) if (KEEP_TAG(k)) t[k] = v;
  for (const c of cats) {
    const it = { id: `${type[0]}${id}`, c, lat, lon, t };
    if (c === 'packstation' || c === 'paketshop') {
      const p = parcelInfo(tags);
      it.pk = p.kind; it.pv = p.pv; it.ps = p.send;
    }
    items.push(it);
  }
}

// Bankfilialen ohne eigenen Automaten-Eintrag nur zeigen, wenn kein separater ATM in der Nähe ist
const cell = (la, lo) => `${Math.round(la * 1000)}_${Math.round(lo * 1000)}`;
const atmCells = new Set();
for (const it of items) if (it.c === 'geldautomat' && it.t.amenity === 'atm') {
  const a = Math.round(it.lat * 1000), b = Math.round(it.lon * 1000);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) atmCells.add(`${a + i}_${b + j}`);
}
const kept = items.filter((it) => !(it.c === 'geldautomat' && it.t.amenity === 'bank' && atmCells.has(cell(it.lat, it.lon))));

// ---------- Zusätzliche Quellen einmischen ----------
const usedSources = { osm: kept.length };
if (!process.env.NO_EXTERNAL) {
  const ext = await loadExternal(config.states || config.regions.map((r) => r.name));
  Object.assign(ext, await loadCities());
  const G = 0.005;
  const gk = (la, lo) => `${Math.floor(la / G)}_${Math.floor(lo / G)}`;
  const grid = new Map();
  const addGrid = (it) => { const k = gk(it.lat, it.lon); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(it); };
  const near = (it, cat, maxM) => {
    const y = Math.floor(it.lat / G), x = Math.floor(it.lon / G);
    let best = null, bd = maxM;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of grid.get(`${y + i}_${x + j}`) || []) {
      if (o.c !== cat) continue;
      const d = Math.hypot((o.lat - it.lat) * 111320, (o.lon - it.lon) * 111320 * Math.cos(it.lat * Math.PI / 180));
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  };
  if ((ext.bnetza?.length || 0) > 1000) {
    for (let i = kept.length - 1; i >= 0; i--) if (kept[i].c === 'ladesaeule') kept.splice(i, 1);
    kept.push(...ext.bnetza);
    usedSources.bnetza = ext.bnetza.length;
  }
  kept.forEach(addGrid);
  for (const it of ext.autobahn || []) {
    const o = near(it, 'rastplatz', 400);
    if (o) {
      if (it.t.toilets && (!o.t.toilets || it.t.toilets === 'yes')) o.t.toilets = it.t.toilets;
      for (const k of ['autobahn:features', 'autobahn:info', 'ref']) if (it.t[k] && !o.t[k]) o.t[k] = it.t[k];
      if (!o.t.name && it.t.name) o.t.name = it.t.name;
      o.src2 = 'autobahn';
    } else { kept.push(it); addGrid(it); }
  }
  if (ext.autobahn) usedSources.autobahn = ext.autobahn.length;
  for (const name of ['dortmund', 'muenster', 'koeln', ...Object.keys(CITY_SOURCES), 'overture']) {
    let added = 0;
    for (const it of ext[name] || []) {
      const r = it.c === 'paketshop' ? 60 : it.c === 'toilette' ? 60 : 40;
      const o = near(it, it.c, r) || (it.c === 'paketshop' ? near(it, 'packstation', 25) : null);
      if (o) {
        // vorhandenen Eintrag mit amtlichen Zusatzinfos ergänzen (Öffnungszeiten, Gebühr, Barrierefreiheit …)
        let enriched = false;
        if (name !== 'overture') for (const k of ['opening_hours', 'fee', 'charge', 'wheelchair', 'changing_table', 'unisex']) {
          if (it.t[k] && !o.t[k]) { o.t[k] = it.t[k]; enriched = true; }
        }
        if (enriched && !o.src2) { o.src2 = name; usedSources[`${name}_ergänzt`] = (usedSources[`${name}_ergänzt`] || 0) + 1; }
        continue;
      }
      kept.push(it); addGrid(it); added++;
    }
    if (ext[name]) usedSources[name] = added;
  }
}

const key = (la, lo) => `${Math.floor(la / TILE)}_${Math.floor(lo / TILE)}`;
const tiles = new Map();
const tileOf = (k) => { if (!tiles.has(k)) tiles.set(k, { items: [], places: [] }); return tiles.get(k); };
for (const it of kept) tileOf(key(it.lat, it.lon)).items.push(it);
for (const pl of places) tileOf(key(pl[1], pl[2])).places.push(pl);

const counts = {};
for (const it of kept) counts[it.c] = (counts[it.c] || 0) + 1;

const dataDir = new URL('data/', root);
await rm(new URL('t/', dataDir), { recursive: true, force: true });
await mkdir(new URL('t/', dataDir), { recursive: true });
const tileCounts = {};
let bytes = 0;
for (const [k, v] of tiles) {
  const s = JSON.stringify(v);
  bytes += s.length;
  tileCounts[k] = v.items.length;
  await writeFile(new URL(`t/${k}.json`, dataDir), s);
}
const index = {
  generated: new Date().toISOString(),
  regions: config.regions.map((r) => r.name),
  tileDeg: TILE,
  start: config.start,
  counts,
  tiles: tileCounts,
  overture: await readFile(new URL('work/overture_meta.json', root), 'utf8').then(JSON.parse).catch(() => null),
  sources: Object.fromEntries(Object.entries(usedSources).filter(([k]) => SOURCES[k]).map(([k, n]) => [k, { ...SOURCES[k], count: n, enriched: usedSources[`${k}_ergänzt`] || 0 }])),
};
await writeFile(new URL('index.json', dataDir), JSON.stringify(index));
console.log(`OK: ${kept.length} Orte, ${places.length} Ortsnamen, ${tiles.size} Kacheln, ${(bytes / 1e6).toFixed(1)} MB`);
console.log(counts);
if (kept.length < 1000 && !process.env.ALLOW_SMALL) throw new Error('Zu wenige Orte – Abbruch');
