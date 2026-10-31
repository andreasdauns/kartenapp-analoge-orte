// Holt alle Punkte der App-Kategorien aus OpenStreetMap (Overpass API)
// und schreibt sie als kompakte Datei nach data/pois.json.
// Läuft täglich per GitHub Actions. Lokal: node scripts/build-data.mjs [overpass-antwort.json]

import { readFile, writeFile } from 'node:fs/promises';
import { classify, KEEP_TAG } from '../src/categories.js';

const config = JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8'));
const { lat, lon } = config.center;
const R = Math.round(config.radiusKm * 1000);
const A = `(around:${R},${lat},${lon})`;

const QUERY = `[out:json][timeout:180];
(
  nwr["amenity"="post_box"]${A};
  nwr["amenity"="recycling"]${A};
  nwr["amenity"="toilets"]${A};
  nwr["highway"~"^(rest_area|services)$"]${A};
  nwr["amenity"="parcel_locker"]${A};
  nwr["amenity"="vending_machine"]["vending"~"parcel"]${A};
  nwr["amenity"="atm"]${A};
  nwr["amenity"="bank"]["atm"="yes"]${A};
  nwr["amenity"="charging_station"]${A};
);
out center tags;`;

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function fetchOverpass() {
  let lastErr;
  for (const url of ENDPOINTS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'analog-karte/1.0 (https://github.com/andreasdauns/analog-karte)',
          },
          body: 'data=' + encodeURIComponent(QUERY),
        });
        if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
        return await res.json();
      } catch (e) {
        lastErr = e;
        console.warn('Overpass-Fehler:', e.message);
        await new Promise((r) => setTimeout(r, 30000));
      }
    }
  }
  throw lastErr;
}

export function transform(osm) {
  const items = [];
  for (const el of osm.elements || []) {
    const tags = el.tags || {};
    const cats = classify(tags);
    if (!cats.length) continue;
    const la = el.lat ?? el.center?.lat;
    const lo = el.lon ?? el.center?.lon;
    if (la == null || lo == null) continue;
    const t = {};
    for (const [k, v] of Object.entries(tags)) if (KEEP_TAG(k)) t[k] = v;
    for (const c of cats) {
      items.push({ id: `${el.type[0]}${el.id}`, c, lat: +la.toFixed(6), lon: +lo.toFixed(6), t });
    }
  }
  items.sort((a, b) => (a.c + a.id).localeCompare(b.c + b.id));
  return items;
}

const inputFile = process.argv[2];
const osm = inputFile ? JSON.parse(await readFile(inputFile, 'utf8')) : await fetchOverpass();
const items = transform(osm);
if (!inputFile && items.length < 50) {
  throw new Error(`Nur ${items.length} Punkte erhalten – vermutlich Fehler, alte Daten bleiben bestehen.`);
}
const counts = {};
for (const it of items) counts[it.c] = (counts[it.c] || 0) + 1;
const out = {
  generated: new Date().toISOString(),
  osmTimestamp: osm.osm3s?.timestamp_osm_base || null,
  region: config,
  counts,
  items,
};
await writeFile(new URL('../data/pois.json', import.meta.url), JSON.stringify(out));
console.log(`OK: ${items.length} Punkte`, counts);
