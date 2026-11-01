// Zusätzliche amtliche/offene Datenquellen neben OpenStreetMap.
// Jede Quelle liefert Orte im gleichen Format wie build-data.mjs: {id, c, lat, lon, t, src}.
// Fällt eine Quelle aus, wird sie übersprungen (die App läuft mit den übrigen Daten weiter).

const UA = { 'User-Agent': 'around-the-corner/1.0 (https://github.com/andreasdauns/kartenapp-analoge-orte)' };
const get = async (url, type = 'json') => {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return type === 'json' ? res.json() : res.text();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const SOURCES = {
  osm: { name: 'OpenStreetMap-Mitwirkende', license: 'ODbL', url: 'https://www.openstreetmap.org/copyright' },
  bnetza: { name: 'Bundesnetzagentur – Ladesäulenregister', license: 'CC BY 4.0', url: 'https://www.bundesnetzagentur.de/ladesaeulenregister' },
  autobahn: { name: 'Die Autobahn GmbH des Bundes', license: 'verkehr.autobahn.de', url: 'https://www.autobahn.de' },
  dortmund: { name: 'EDG Entsorgung Dortmund', license: 'dl-de/zero-2.0', url: 'https://open-data.dortmund.de/explore/dataset/edg-abfallentsorgung/' },
  muenster: { name: 'Stadt Münster', license: 'dl-de/by-2.0', url: 'https://opendata.stadt-muenster.de/dataset/standorte-der-glascontainer' },
  koeln: { name: 'Stadt Köln', license: 'dl-de/zero-2.0', url: 'https://www.offenedaten-koeln.de/' },
};

// ---------- CSV (Semikolon, Anführungszeichen) ----------
function parseCsvLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ';') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
// Ganze Datei zeilenweise, Zeilenumbrüche innerhalb von Anführungszeichen bleiben im Feld
function* csvRows(text) {
  let start = 0, q = false;
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i];
    if (ch === '"') q = !q;
    else if ((ch === '\n' || i === text.length) && !q) {
      yield text.slice(start, i).replace(/\r$/, '');
      start = i + 1;
    }
  }
}
const num = (s) => parseFloat(String(s || '').replace(',', '.'));

// ---------- Ladesäulenregister der Bundesnetzagentur ----------
const PLUG = [
  [/combo|ccs/i, 'type2_combo'],
  [/chademo/i, 'chademo'],
  [/typ 2.*(kupplung|kabel)/i, 'type2_cable'],
  [/typ 2/i, 'type2'],
  [/schuko/i, 'schuko'],
  [/typ 1/i, 'type1'],
  [/tesla/i, 'tesla_supercharger'],
];
async function bnetza(states) {
  const page = await get('https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/DownloadundKontakt.html', 'text');
  const csvUrl = page.match(/https:\/\/data\.bundesnetzagentur\.de\/[^"'\s]+Ladesaeulenregister[^"'\s]+\.csv/i)?.[0];
  if (!csvUrl) throw new Error('CSV-Link nicht gefunden');
  return parseBnetza(await get(csvUrl, 'text'), states);
}
export function parseBnetza(raw, states) {
  const text = raw.replace(/^\uFEFF/, '');
  const lines = [...csvRows(text)];
  const hi = lines.findIndex((l) => l.startsWith('Ladeeinrichtungs-ID'));
  if (hi < 0) throw new Error('Kopfzeile nicht gefunden');
  const head = parseCsvLine(lines[hi]);
  const col = (name) => head.findIndex((h) => h.trim() === name);
  const C = {
    op: col('Betreiber'), disp: col('Anzeigename (Karte)'), status: col('Status'), n: col('Anzahl Ladepunkte'),
    kw: col('Nennleistung Ladeeinrichtung [kW]'), street: col('Straße'), nr: col('Hausnummer'), zip: col('Postleitzahl'),
    city: col('Ort'), state: col('Bundesland'), lat: col('Breitengrad'), lon: col('Längengrad'),
    loc: col('Standortbezeichnung'), pay: col('Bezahlsysteme'), oh: col('Öffnungszeiten'),
  };
  const plugCols = [];
  for (let i = 1; i <= 12; i++) {
    const a = col(`Steckertypen${i}`), b = col(`Nennleistung Stecker${i}`);
    if (a >= 0) plugCols.push([a, b]);
  }
  const groups = new Map();
  for (let i = hi + 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const r = parseCsvLine(lines[i]);
    if (!states.includes(r[C.state])) continue;
    if (r[C.status] && !/in betrieb/i.test(r[C.status])) continue;
    const lat = num(r[C.lat]), lon = num(r[C.lon]);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    const op = r[C.disp] || r[C.op];
    const key = `${lat.toFixed(4)}_${lon.toFixed(4)}_${op}`;
    let g = groups.get(key);
    if (!g) {
      g = { lat, lon, op, n: 0, plugs: {}, kw: {}, r, always: false };
      groups.set(key, g);
    }
    g.n += parseInt(r[C.n]) || 0;
    if (/^247$|24\/7|rund um die uhr/i.test(r[C.oh] || '')) g.always = true;
    for (const [a, b] of plugCols) {
      for (const p of String(r[a] || '').split(/[;,]\s*/).filter(Boolean)) {
        const ty = PLUG.find(([re]) => re.test(p))?.[1];
        if (!ty) continue;
        g.plugs[ty] = (g.plugs[ty] || 0) + 1;
        const kw = num(r[b]);
        if (kw) g.kw[ty] = Math.max(g.kw[ty] || 0, kw);
      }
    }
  }
  const out = [];
  let i = 0;
  for (const g of groups.values()) {
    const r = g.r;
    const t = {
      amenity: 'charging_station', operator: g.op, capacity: g.n ? String(g.n) : undefined,
      'addr:street': r[C.street] || undefined, 'addr:housenumber': r[C.nr] || undefined,
      'addr:city': [r[C.zip], r[C.city]].filter(Boolean).join(' ') || undefined,
      description: r[C.loc] || undefined, payment: r[C.pay] || undefined,
      opening_hours: g.always ? '24/7' : undefined,
    };
    for (const [ty, n] of Object.entries(g.plugs)) {
      t[`socket:${ty}`] = String(n);
      if (g.kw[ty]) t[`socket:${ty}:output`] = `${g.kw[ty]} kW`;
    }
    for (const k of Object.keys(t)) if (t[k] === undefined) delete t[k];
    out.push({ id: `x${i++}`, c: 'ladesaeule', lat: +g.lat.toFixed(6), lon: +g.lon.toFixed(6), t, src: 'bnetza' });
  }
  return out;
}

// ---------- Autobahn GmbH: Rastplätze mit Ausstattung ----------
async function autobahn(stateCodes) {
  const { roads } = await get('https://verkehr.autobahn.de/o/autobahn/');
  const seen = new Set();
  const out = [];
  for (const road of roads) {
    let d;
    try { d = await get(`https://verkehr.autobahn.de/o/autobahn/${encodeURIComponent(road)}/services/parking_lorry`); }
    catch { continue; }
    for (const p of d.parking_lorry || []) {
      const m = /^DE-([A-Z]{2,3})-/.exec(p.identifier || '');
      if (!m || !(stateCodes.includes('*') || stateCodes.includes(m[1])) || seen.has(p.identifier)) continue;
      seen.add(p.identifier);
      const feats = (p.lorryParkingFeatureIcons || []).map((f) => f.description).filter(Boolean);
      const t = {
        highway: 'rest_area',
        name: p.subtitle || undefined,
        ref: (p.title || '').replace(/\s*\|\s*/, ' Richtung '),
        'autobahn:features': feats.join(', ') || undefined,
        'autobahn:info': (p.description || []).join(', ') || undefined,
      };
      if (feats.some((f) => /toilette|wc/i.test(f))) t.toilets = 'yes';
      else if (feats.length) t.toilets = 'no';
      for (const k of Object.keys(t)) if (t[k] === undefined) delete t[k];
      out.push({ id: `a${p.identifier}`, c: 'rastplatz', lat: +p.coordinate.lat, lon: +p.coordinate.long, t, src: 'autobahn' });
    }
    await sleep(150);
  }
  return out;
}

// ---------- Dortmund (EDG): Glas- und Papiercontainer ----------
async function dortmund() {
  const d = await get('https://open-data.dortmund.de/api/explore/v2.1/catalog/datasets/edg-abfallentsorgung/exports/json');
  const out = [];
  for (const x of d) {
    const c = /altglas/i.test(x.titel || '') ? 'glas' : /altpapier/i.test(x.titel || '') ? 'papier' : null;
    const g = x.geografische_koordinaten;
    if (!c || !g) continue;
    out.push({
      id: `d${out.length}`, c, lat: +g.lat, lon: +g.lon, src: 'dortmund',
      t: {
        amenity: 'recycling', recycling_type: 'container', [`recycling:${c === 'glas' ? 'glass_bottles' : 'paper'}`]: 'yes',
        operator: 'EDG', 'addr:street': x.adresse || undefined, 'addr:city': x.ort || undefined,
        description: x.letzte_leerung_depotcontainer || undefined,
      },
    });
  }
  return out;
}

// ---------- Münster (AWM): Glascontainer ----------
async function muenster() {
  const d = await get('https://raw.githubusercontent.com/od-ms/converter-scripts/master/data/awm-glascontainer-combined.geojson');
  return d.features.filter((f) => f.geometry?.type === 'Point').map((f, i) => ({
    id: `m${i}`, c: 'glas', lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], src: 'muenster',
    t: {
      amenity: 'recycling', recycling_type: 'container', 'recycling:glass_bottles': 'yes', operator: 'AWM Münster',
      description: [f.properties?.Standort, f.properties?.Sorten ? `Sorten: ${f.properties.Sorten}` : null].filter(Boolean).join(' · ') || undefined,
    },
  }));
}

// ---------- Köln: öffentliche Toiletten ----------
async function koeln() {
  const url = 'https://geoportal.stadt-koeln.de/wss/service/toiletten_wfs/guest?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ms%3Atoiletten&OUTPUTFORMAT=' + encodeURIComponent('application/json; subtype=geojson');
  const d = await get(url);
  const out = [];
  for (const f of d.features || []) {
    const p = f.properties || {};
    const lat = num(p.WGS84_x), lon = num(p.WGS84_y);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    out.push({
      id: `k${p.gid || out.length}`, c: 'toilette', lat, lon, src: 'koeln',
      t: {
        amenity: 'toilets', name: p.Name || undefined, operator: 'Stadt Köln',
        description: [p.Typ, p.Lage, p.Zusatzinfo].filter(Boolean).join(' · ') || undefined,
      },
    });
  }
  return out;
}

const STATE_CODES = { 'Nordrhein-Westfalen': ['NW', 'NRW'], Hessen: ['HE'], 'Rheinland-Pfalz': ['RP'] };

export async function loadExternal(states) {
  const jobs = {
    bnetza: () => bnetza(states),
    autobahn: () => autobahn(states.length >= 16 ? ['*'] : states.flatMap((n) => STATE_CODES[n] || [])),
    dortmund, muenster, koeln,
  };
  const result = {};
  for (const [name, fn] of Object.entries(jobs)) {
    try {
      const items = await fn();
      for (const it of items) for (const k of Object.keys(it.t)) if (it.t[k] === undefined) delete it.t[k];
      result[name] = items;
      console.log(`Quelle ${name}: ${items.length} Orte`);
    } catch (e) {
      console.warn(`Quelle ${name} übersprungen: ${e.message}`);
    }
  }
  return result;
}
