// Offene Daten einzelner Städte (Toiletten, Container). Jede Quelle einzeln, Fehler werden übersprungen.
// Lizenzen siehe CITY_SOURCES. Formate am 01.11.2026 geprüft.

import { readFile } from 'node:fs/promises';
import { parcelInfo } from '../src/categories.js';

const UA = { 'User-Agent': 'around-the-corner/1.0 (https://github.com/andreasdauns/kartenapp-analoge-orte)' };
const get = async (url, type = 'json') => {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return type === 'json' ? res.json() : res.text();
};

// UTM Zone 32N (EPSG:25832) -> WGS84, falls eine Quelle keine Längen-/Breitengrade liefert
function utm32ToLatLon(E, N, zone = 32) {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const x = E - 500000, y = N, lon0 = ((zone * 6 - 183) * Math.PI) / 180;
  const M = y / k0, mu = M / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu);
  const C1 = ep2 * Math.cos(p) ** 2, T1 = Math.tan(p) ** 2, N1 = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
  const R1 = (a * (1 - e2)) / (1 - e2 * Math.sin(p) ** 2) ** 1.5, D = x / (N1 * k0);
  const lat = p - ((N1 * Math.tan(p)) / R1) * (D ** 2 / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4) / 24 + ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6) / 720);
  const lon = lon0 + (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5) / 120) / Math.cos(p);
  return [(lat * 180) / Math.PI, (lon * 180) / Math.PI];
}
function pointOf(geom) {
  if (!geom) return null;
  let c = geom.type === 'Point' ? geom.coordinates : geom.type === 'MultiPoint' ? geom.coordinates[0] : null;
  if (!c) return null;
  let [x, y] = c;
  if (Math.abs(x) > 180) return utm32ToLatLon(x, y, geom.zone || 32);
  return [y, x];
}

// Deutsche Öffnungszeiten-Texte möglichst in OSM-Schreibweise bringen (sonst wird der Text roh angezeigt)
export function hoursDE(s) {
  if (!s) return undefined;
  let v = String(s).trim();
  if (/^(durchgehend|ganzt[äa]gig|24 ?(std|h|stunden)|rund um die uhr|24\/7)/i.test(v)) return '24/7';
  v = v.replace(/\r?\n|<br\s*\/?>/gi, '; ').replace(/\s*Uhr/gi, '').replace(/[–—]/g, '-').replace(/(\d{1,2})\.(\d{2})/g, '$1:$2')
    .replace(/\bMo(ntag)?\b/g, 'Mo').replace(/\bDi(enstag)?\b/g, 'Tu').replace(/\bMi(ttwoch)?\b/g, 'We').replace(/\bDo(nnerstag)?\b/g, 'Th')
    .replace(/\bFr(eitag)?\b/g, 'Fr').replace(/\bSa(mstag)?\b/g, 'Sa').replace(/\bSo(nntag)?\b/g, 'Su')
    .replace(/(\b[A-Z][a-z]):(\s)/g, '$1$2').replace(/\s*;\s*/g, '; ').replace(/(\d)\s*-\s*(\d)/g, '$1-$2');
  v = v.replace(/\b(\d):/g, '0$1:');
  return v;
}
const yes = (v) => (v === true || /^(ja|yes|1|true|x)$/i.test(String(v ?? '').trim()) ? 'yes' : /^(nein|no|0|false)$/i.test(String(v ?? '').trim()) ? 'no' : undefined);
const euro = (n) => (n > 0 ? `${String(Number(n).toFixed(2)).replace('.', ',')} €` : undefined);
const toilet = (o) => ({ amenity: 'toilets', ...o });
const container = (kind, o = {}) => ({ amenity: 'recycling', recycling_type: 'container', [`recycling:${{ glas: 'glass_bottles', papier: 'paper', altkleider: 'clothes' }[kind]}`]: 'yes', ...o });

const wfs = (base, type, v = '2.0.0') => `${base}${base.includes('?') ? '&' : '?'}service=WFS&version=${v}&request=GetFeature&${v === '2.0.0' ? 'typeNames' : 'typeName'}=${encodeURIComponent(type)}&outputFormat=application/json&srsName=EPSG:4326`;


// ---------- Hilfen für weitere Quellen ----------
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/, 1)[0];
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift().map((h) => h.trim());
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}
const numDE = (v) => parseFloat(String(v ?? '').replace(',', '.'));
// CSV mit Koordinatenspalten (Breite/Länge oder UTM) in Features umwandeln
async function csvFeatures(url) {
  const rows = parseCsv(await get(url, 'text'));
  const keys = Object.keys(rows[0] || {});
  const find = (re) => keys.find((k) => re.test(k));
  const kLat = find(/^(lat|latitude|breite|breitengrad|y_?wgs|wgs84_?y|nord_?wgs)$/i) || find(/lat|breite/i);
  const kLon = find(/^(lon|lng|long|longitude|laenge|länge|laengengrad|längengrad|x_?wgs|wgs84_?x)$/i) || find(/lon|lng|länge|laenge/i);
  const kE = find(/^(x|rechtswert|utm_?east|ostwert|east)$/i), kN = find(/^(y|hochwert|utm_?north|nordwert|north)$/i);
  return {
    features: rows.map((p) => {
      let lat = numDE(p[kLat]), lon = numDE(p[kLon]);
      if (!(lat > 40 && lat < 60) && kE && kN) { const e = numDE(p[kE]), n = numDE(p[kN]); if (e > 100000) [lat, lon] = utm32ToLatLon(e, n); }
      if (!(lat > 40 && lat < 60) && lon > 40 && lon < 60) [lat, lon] = [lon, lat];
      return lat > 40 ? { geometry: { type: 'Point', coordinates: [lon, lat] }, properties: p } : null;
    }).filter(Boolean),
  };
}
const txtOf = (p) => Object.values(p).filter((v) => typeof v === 'string').join(' ');
// Container-Arten aus beliebigen Feldern erkennen
function containersFrom(p, operator, fallback = null) {
  const out = [];
  const flag = (re) => Object.entries(p).some(([k, v]) => re.test(k) && (v === true || Number(v) > 0 || /^(ja|x|yes|1|true)$/i.test(String(v))));
  const t = txtOf(p);
  const desc = p.standort || p.Standort || p.strasse || p.Strasse || p.STANDORT || p.BEZEICHNUNG || p.bezeichnung || p.adresse || p.Adresse || p.LAGEBESCHREIBUNG || undefined;
  const hours = hoursDE(p.einwurfzeiten || p.Einwurfzeiten || p.oeffnungszeiten);
  const add = (c) => out.push({ c, t: container(c, { operator, description: desc, opening_hours: hours }) });
  if (flag(/glas/i) || /glas|drei-kammer|weiß|weiss.*braun/i.test(t)) add('glas');
  if (flag(/papier|pappe/i) || /papier|pappe/i.test(t)) add('papier');
  if (flag(/kleid|textil|schuh/i) || /altkleid|textil|kleider/i.test(t)) add('altkleider');
  if (!out.length && fallback) add(fallback);
  return out;
}
function kmlFeatures(kml) {
  const feats = [];
  for (const pm of kml.split(/<Placemark[\s>]/).slice(1)) {
    const c = /<coordinates>\s*([-\d.]+),([-\d.]+)/.exec(pm);
    if (!c) continue;
    const props = {};
    for (const m of pm.matchAll(/<SimpleData name="([^"]+)">([^<]*)<\/SimpleData>/g)) props[m[1]] = m[2];
    const n = /<name>([^<]*)<\/name>/.exec(pm); if (n) props.name = n[1];
    feats.push({ geometry: { type: 'Point', coordinates: [+c[1], +c[2]] }, properties: props });
  }
  return { features: feats };
}

// INSPIRE-GML (z. B. Rostock): Punkte + Beschreibung aus dem XML ziehen
function gmlFeatures(xml, zone = 33) {
  const feats = [];
  for (const m of xml.split(/<wfs:member>/).slice(1)) {
    const pos = /<gml:pos[^>]*>\s*([\d.]+)\s+([\d.]+)/.exec(m);
    if (!pos) continue;
    const desc = /<gml:description>([^<]*)</.exec(m)?.[1];
    const name = /<gml:name>([^<]*)</.exec(m)?.[1];
    feats.push({ geometry: { type: 'Point', coordinates: [+pos[1], +pos[2]], zone }, properties: { description: desc, name } });
  }
  return { features: feats };
}
const ods = (base, ds) => `${base}/api/v2/catalog/datasets/${ds}/exports/geojson`;

export const CITY_SOURCES = {
  berlin: {
    name: 'Land Berlin (Senatsverwaltung)', license: 'dl-de/zero-2.0', url: 'https://gdi.berlin.de/services/wfs/toiletten',
    fetch: () => get(wfs('https://gdi.berlin.de/services/wfs/toiletten', 'toiletten:toiletten')),
    map: (p) => ({ c: 'toilette', t: toilet({ name: p.standort, operator: p.betreiber, opening_hours: hoursDE(p.oeffnungszeiten), fee: p.nutzungsentgelt > 0 ? 'yes' : p.nutzungsentgelt === 0 ? 'no' : undefined, charge: euro(p.nutzungsentgelt), wheelchair: yes(p.barrierefrei), changing_table: yes(p.wickeltisch), description: p.modelltyp }) }),
  },
  muenchen_wc: {
    name: 'Landeshauptstadt München', license: 'dl-de/by-2.0', url: 'https://opendata.muenchen.de/dataset/wc_finder',
    fetch: () => get(wfs('https://geoportal.muenchen.de/geoserver/gsm_wfs/ows', 'gsm_wfs:wc_finder_opendata', '1.1.0')),
    map: (p) => ({ c: 'toilette', t: toilet({ name: p.name, opening_hours: hoursDE(p.oeffnungszeiten), fee: p.preis > 0 ? 'yes' : p.preis === 0 ? 'no' : undefined, charge: euro(p.preis), changing_table: yes(p.wickeln), wheelchair: yes(p.barrierefrei ?? p.rollstuhlgerecht), 'addr:street': p.strasse, 'addr:city': [p.plz, p.stadt].filter(Boolean).join(' ') || undefined }) }),
  },
  muenchen_container: {
    name: 'Landeshauptstadt München (AWM)', license: 'dl-de/by-2.0', url: 'https://opendata.muenchen.de/dataset/awm_container_opendata',
    fetch: () => get(wfs('https://geoportal.muenchen.de/geoserver/gsm_wfs/ows', 'gsm_wfs:awm_container', '1.1.0')),
    map: (p) => {
      const out = [];
      if (p.glas_braun || p.glas_gruen || p.glas_weiss) out.push({ c: 'glas', t: container('glas', { operator: 'AWM München', description: p.adresse }) });
      if (p.altkleider) out.push({ c: 'altkleider', t: container('altkleider', { operator: 'AWM München', description: p.adresse }) });
      return out;
    },
  },
  hamburg: {
    name: 'Freie und Hansestadt Hamburg (BUKEA / Stadtreinigung)', license: 'dl-de/by-2.0', url: 'https://api.hamburg.de/datasets/v1/abfall_recycling',
    fetch: async () => {
      const feats = [];
      for (const [col, c] of [['abfall_recycling_1_papier', 'papier'], ['abfall_recycling_2_glas', 'glas'], ['abfall_recycling_4_textil', 'altkleider']]) {
        const d = await get(`https://api.hamburg.de/datasets/v1/abfall_recycling/collections/${col}/items?f=json&limit=10000`);
        for (const f of d.features || []) feats.push({ ...f, properties: { ...f.properties, _c: c } });
      }
      return { features: feats };
    },
    map: (p) => ({ c: p._c, t: container(p._c, { operator: 'Stadtreinigung Hamburg', description: p.standort || p.langtext, ref: p.depotnummer }) }),
  },
  gelsenkirchen: {
    name: 'Stadt Gelsenkirchen', license: 'dl-de/zero-2.0', url: 'https://daten.geoportal.ruhr/',
    fetch: async () => {
      const a = await get('https://maps.gelsenkirchen.de/geoserver/infrastrukturdatenbank/ogc/features/v1/collections/oeffentliche_toilette/items?f=json&limit=10000');
      const b = await get('https://maps.gelsenkirchen.de/geoserver/infrastrukturdatenbank/ogc/features/v1/collections/entsorgung/items?f=json&limit=10000');
      return { features: [...(a.features || []).map((f) => ({ ...f, properties: { ...f.properties, _wc: 1 } })), ...(b.features || [])] };
    },
    map: (p) => {
      if (p._wc) return { c: 'toilette', t: toilet({ name: p.Name, description: p.Info || undefined, 'addr:street': p.Strasse }) };
      const n = `${p.Name || ''}`;
      const c = /glas/i.test(n) ? 'glas' : /papier/i.test(n) ? 'papier' : /kleid|textil/i.test(n) ? 'altkleider' : null;
      return c ? { c, t: container(c, { name: p.Name, 'addr:street': p.Strasse }) } : null;
    },
  },
  aachen: {
    name: 'Stadt Aachen', license: 'dl-de/by-2.0', url: 'https://geoserver.aachen.de/opendata/abfallnavi/ows',
    fetch: async () => {
      const feats = [];
      for (const [type, c] of [['abfallnavi:Glascontainer', 'glas'], ['abfallnavi:Altkleidercontainer', 'altkleider']]) {
        const d = await get(wfs('https://geoserver.aachen.de/opendata/abfallnavi/ows', type, '1.1.0'));
        for (const f of d.features || []) feats.push({ ...f, properties: { ...f.properties, _c: c } });
      }
      return { features: feats };
    },
    map: (p) => ({ c: p._c, t: container(p._c, { operator: 'Stadt Aachen', description: [p.strasse, p.hausnummer].filter(Boolean).join(' ') || undefined, opening_hours: hoursDE(p.oeffnungszeiten) }) }),
  },
  dortmund_wc: {
    name: 'Stadt Dortmund', license: 'dl-de/zero-2.0', url: 'https://open-data.dortmund.de/explore/dataset/offentliche-toiletten/',
    fetch: async () => {
      const d = await get('https://open-data.dortmund.de/api/explore/v2.1/catalog/datasets/offentliche-toiletten/exports/json');
      return { features: d.filter((x) => x.geo_point_2d).map((x) => ({ geometry: { type: 'Point', coordinates: [x.geo_point_2d.lon, x.geo_point_2d.lat] }, properties: x })) };
    },
    map: (p) => ({ c: 'toilette', t: toilet({ name: p.objektname || p.bezeichnung, description: [p.objektzusa, p.i_beschr].filter(Boolean).join(' · ') || undefined, wheelchair: /rollstuhleignung:\s*ja/i.test(p.i_zusinfo || '') ? 'yes' : undefined }) }),
  },
  bochum: {
    name: 'USB Bochum', license: 'CC0', url: 'https://bochum.opendata.ruhr/',
    fetch: async () => {
      const csv = await get('https://bochum.opendata.ruhr/dataset/1b5c33bb-cfa6-40ab-b394-be3f0037ad32/resource/9370542d-efdb-4d05-b7bf-a45ef76aac59/download/bochum_usb_standorte.csv', 'text');
      const rows = csv.split(/\r?\n/).filter(Boolean).map((l) => l.match(/("([^"]*)"|[^,]*)(,|$)/g).map((x) => x.replace(/,$/, '').replace(/^"|"$/g, '')));
      const head = rows.shift();
      const ix = (n) => head.indexOf(n);
      return {
        features: rows.map((r) => {
          const m = /\(([\d.]+),\s*([\d.]+)\)/.exec(r[ix('Standort')] || '');
          return m ? { geometry: { type: 'Point', coordinates: [+m[2], +m[1]] }, properties: { name: r[ix('Name')], typ: r[ix('Typ')], adresse: r[ix('Adresse')], glas: +r[ix('Glascontainer')] || 0, kleider: +r[ix('Altkleider')] || 0 } } : null;
        }).filter(Boolean),
      };
    },
    map: (p) => {
      if (/lager|verwerter/i.test(p.typ || '')) return null;
      const out = [];
      if (p.glas) out.push({ c: 'glas', t: container('glas', { operator: 'USB Bochum', description: p.adresse }) });
      if (p.kleider) out.push({ c: 'altkleider', t: container('altkleider', { operator: 'USB Bochum', description: p.adresse }) });
      return out;
    },
  },
  trier: {
    name: 'Stadt Trier', license: 'dl-de/by-2.0', url: 'https://www.trier.de',
    fetch: async () => {
      const feats = [];
      for (const [url, c] of [
        ['https://www.geoportal.rlp.de/spatial-objects/633/collections/ms:oeffentl_toiletten/items?f=json&limit=1000', 'toilette'],
        ['https://www.geoportal.rlp.de/spatial-objects/477/collections/ms:glascontainer/items?f=json&limit=1000', 'glas'],
        ['https://www.geoportal.rlp.de/spatial-objects/477/collections/ms:altkleidercontainer/items?f=json&limit=1000', 'altkleider'],
      ]) {
        try {
          const d = await get(url);
          for (const f of d.features || []) feats.push({ ...f, properties: { ...f.properties, _c: c } });
        } catch { /* einzelne Ebene fehlt */ }
      }
      return { features: feats };
    },
    map: (p) => {
      const name = p.name || p.bezeichnung || p.titel || p.standort;
      if (p._c === 'toilette') return { c: 'toilette', t: toilet({ name, description: p.oeffnungszeiten || p.beschreibung || undefined }) };
      return { c: p._c, t: container(p._c, { operator: 'Stadt Trier', description: name }) };
    },
  },

  freiburg: {
    name: 'Stadt Freiburg i. Br.', license: 'dl-de/by-2.0', url: 'https://www.freiburg.de',
    fetch: async () => {
      const feats = [];
      for (const type of ['ms:oeff_toiletten', 'ms:nette_toilette']) {
        const d = await get(`https://geoportal.freiburg.de/wfs/gmf_toiletten/gmf_toiletten?service=WFS&version=2.0.0&request=GetFeature&typeNames=${type}&outputFormat=geojson&srsName=EPSG:4326`).catch(() => ({ features: [] }));
        for (const f of d.features || []) feats.push({ ...f, properties: { ...f.properties, _nette: type.includes('nette') } });
      }
      return { features: feats };
    },
    map: (p) => ({ c: 'toilette', t: toilet({ name: p.name || p.bezeichnung || p.NAME || p.standort, opening_hours: hoursDE(p.oeffnungszeiten || p.OEFFNUNGSZEITEN), description: p._nette ? 'Nette Toilette (in Gastronomie/Geschäft)' : (p.beschreibung || undefined) }) }),
  },
  muenster_wc: {
    name: 'Stadt Münster', license: 'dl-de/by-2.0', url: 'https://opendata.stadt-muenster.de',
    fetch: async () => kmlFeatures(await get('https://www.stadt-muenster.de/ows/mapserv706/poiserv?REQUEST=GetFeature&SERVICE=WFS&VERSION=1.0.0&TYPENAME=ms:Toiletten&OUTPUTFORMAT=KML', 'text')),
    map: (p) => {
      const days = [['MONTAG', 'Mo'], ['DIENSTAG', 'Tu'], ['MITTWOCH', 'We'], ['DONNERSTAG', 'Th'], ['FREITAG', 'Fr'], ['SAMSTAG', 'Sa'], ['SONNTAG', 'Su']];
      const oh = days.filter(([k]) => p[k] && /\d/.test(p[k])).map(([k, d]) => `${d} ${hoursDE(p[k])}`).join('; ') || undefined;
      return { c: 'toilette', t: toilet({ name: p.BEZEICHNUNG || p.NAME || p.name || p.STANDORT, opening_hours: oh, wheelchair: yes(p.BARRIEREFREI), fee: /kostenlos|frei/i.test(p.KOSTEN || '') ? 'no' : undefined }) };
    },
  },
  herne: {
    name: 'Stadt Herne', license: 'dl-de/zero-2.0', url: 'https://www.herne.de',
    fetch: async () => {
      const a = await get('https://geodaten.herne.de/geoserver/soziales/barrierefreietoiletten?SERVICE=WFS&REQUEST=GetFeature&TYPENAME=barrierefreie_toiletten&OUTPUTFORMAT=application/json&srsName=EPSG:4326');
      const b = await get(wfs('https://geodaten.herne.de/geoserver/abfall/entsorgungskarte', 'wertstoffsammelstelle', '1.1.0')).catch(() => ({ features: [] }));
      return { features: [...(a.features || []).map((f) => ({ ...f, properties: { ...f.properties, _wc: 1 } })), ...(b.features || [])] };
    },
    map: (p) => (p._wc
      ? { c: 'toilette', t: toilet({ name: p.anzeigenam, description: p.infotxt || undefined, wheelchair: 'yes' }) }
      : containersFrom(p, 'Entsorgung Herne')),
  },
  neuss: {
    name: 'Stadt Neuss / Rhein-Kreis Neuss', license: 'CC0', url: 'https://opendata.rhein-kreis-neuss.de',
    fetch: () => get(ods('https://opendata.rhein-kreis-neuss.de', 'stadt-neuss-oeffentliche-toiletten')),
    map: (p) => ({ c: 'toilette', t: toilet({ name: p.bezeichnung, description: p.category || undefined }) }),
  },
  grevenbroich: {
    name: 'Stadt Grevenbroich', license: 'CC0', url: 'https://opendata.rhein-kreis-neuss.de',
    fetch: () => get(ods('https://opendata.rhein-kreis-neuss.de', 'grevenbroich-glascontainer-standorte')),
    map: (p) => ({ c: 'glas', t: container('glas', { operator: 'Stadt Grevenbroich', description: [p.strasse, p.standort].filter(Boolean).join(', ') || undefined }) }),
  },
  meerbusch: {
    name: 'Stadt Meerbusch', license: 'dl-de/zero-2.0', url: 'https://opendata.rhein-kreis-neuss.de',
    fetch: () => get(ods('https://opendata.rhein-kreis-neuss.de', 'meerbusch-wertstoffcontainer')),
    map: (p) => containersFrom(p, 'Stadt Meerbusch', 'glas'),
  },
  wuerzburg: {
    name: 'Stadt Würzburg', license: 'dl-de/by-2.0', url: 'https://wuerzburg.opendatasoft.com',
    fetch: () => get(ods('https://wuerzburg.opendatasoft.com', 'barrierefreie-toiletten-im-stadtgebiet-wuerzburg')),
    map: (p) => ({ c: 'toilette', t: toilet({ name: p.company || p.toilettype, description: p.description || undefined, wheelchair: 'yes', centralkey: /euro/i.test(p.description || '') && !/ohne euro/i.test(p.description || '') ? 'eurokey' : undefined }) }),
  },
  regensburg: {
    name: 'Stadt Regensburg', license: 'CC BY 4.0', url: 'https://www.regensburg.de/opendata',
    fetch: () => get('https://mapservice.regensburg.de/cgi-bin/mapserv?map=/data/ows/maps/altglas_wfs.map&service=WFS&version=1.1.0&request=GetFeature&outputformat=geojson&TYPENAME=altglas'),
    map: (p) => ({ c: 'glas', t: container('glas', { operator: 'Stadt Regensburg', description: p.BEZEICHNUNG || p.LAGEBESCHREIBUNG || undefined }) }),
  },
  lk_cham: {
    name: 'Landratsamt Cham', license: 'CC BY 4.0', url: 'https://data-lra-cha.opendata.arcgis.com',
    fetch: () => get('https://data-lra-cha.opendata.arcgis.com/api/download/v1/items/46f6b60e560c4d908e423d510d181e4d/geojson?layers=30'),
    map: (p) => containersFrom({ ...p, standort: [p.BEM, p.ORT_NAM].filter(Boolean).join(', ') }, 'Landkreis Cham', 'glas'),
  },
  amberg: {
    name: 'Stadt Amberg', license: 'CC BY 3.0 DE', url: 'https://amberg.de/opendata',
    fetch: () => csvFeatures('https://amberg.de/fileadmin/opendata/container.csv'),
    map: (p) => containersFrom(p, 'Stadt Amberg'),
  },
  deggendorf: {
    name: 'Stadt Deggendorf', license: 'CC BY 3.0 DE', url: 'https://opendata.deggendorf.de',
    fetch: () => csvFeatures('https://opendata.deggendorf.de/od/containerstandorte.csv'),
    map: (p) => containersFrom(p, 'Stadt Deggendorf'),
  },
  waldkraiburg: {
    name: 'Stadt Waldkraiburg', license: 'CC BY 4.0', url: 'https://www.waldkraiburg.de',
    fetch: () => csvFeatures('https://www.waldkraiburg.de/cdn/uploads/glascontainer-standorte-stadt-waldkraiburg.csv'),
    map: (p) => containersFrom(p, 'Stadt Waldkraiburg', 'glas'),
  },
  wesel: {
    name: 'Stadt Wesel', license: 'dl-de/zero-2.0', url: 'https://geoportal.wesel.de',
    fetch: () => csvFeatures('https://geoportal.wesel.de/opendata/oeff_toiletten/oeff_toiletten.csv'),
    map: (p) => ({ c: 'toilette', t: toilet({ name: p.name || p.Name || p.bezeichnung || p.Bezeichnung || p.standort || p.Standort, opening_hours: hoursDE(p.oeffnungszeiten || p.Oeffnungszeiten || p['Öffnungszeiten']) }) }),
  },
  soest: {
    name: 'Stadt Soest', license: 'dl-de/by-2.0', url: 'https://opendata.soest.de',
    fetch: () => csvFeatures('https://opendata.soest.de/dataset/e96b9f10-0684-4d1c-ba5f-43dcbef1c209/resource/767212a9-e383-4473-b6b4-7d85ee9eb30a/download/oeffentliche_toiletten_stadtsoest.csv'),
    map: (p) => ({ c: 'toilette', t: toilet({ name: p.name || p.Name || p.bezeichnung || p.Bezeichnung || p.standort || p.Standort, opening_hours: hoursDE(p.oeffnungszeiten || p.Oeffnungszeiten || p['Öffnungszeiten']) }) }),
  },

  rostock: {
    name: 'Hanse- und Universitätsstadt Rostock', license: 'CC0', url: 'https://geo.sv.rostock.de',
    fetch: async () => {
      const feats = [];
      for (const [svc, ft, c] of [
        ['us-emf-glassrecyclingbins', 'us-emf:EnvironmentalManagementFacility', 'glas'],
        ['us-emf-clothingdonationbins', 'us-emf:EnvironmentalManagementFacility', 'altkleider'],
        ['us-govserv-parcellockers', 'us-govserv:GovernmentalService', 'packstation'],
      ]) {
        try {
          const xml = await get(`https://geo.sv.rostock.de/inspire/${svc}/download?service=WFS&version=2.0.0&request=GetFeature&typenames=${ft}`, 'text');
          for (const f of gmlFeatures(xml, 33).features) feats.push({ ...f, properties: { ...f.properties, _c: c } });
        } catch { /* Ebene fehlt */ }
      }
      return { features: feats };
    },
    map: (p) => (p._c === 'packstation'
      ? { c: 'packstation', t: { amenity: 'parcel_locker', name: p.description || p.name } }
      : { c: p._c, t: container(p._c, { operator: 'Hansestadt Rostock', description: p.description }) }),
  },
  luenen: {
    name: 'Stadt Lünen', license: 'CC BY 4.0', url: 'https://geoportal.luenen.de',
    fetch: () => get('https://geoportal.luenen.de/arcgis/rest/services/Wertstoffsammelstellen/MapServer/864/query?where=1%3D1&outFields=*&outSR=4326&f=geojson'),
    map: (p) => containersFrom(p, 'Stadt Lünen'),
  },
  leipzig: {
    name: 'Stadt Leipzig', license: 'dl-de/by-2.0', url: 'https://opendata.leipzig.de',
    fetch: async () => {
      let csv;
      try { csv = await get('https://geodaten.leipzig.de/open_data/organisationseinheit/Amt_fuer_Geoinformation_und_Bodenordnung/Toilettenstandorte/Oeffentliche_Toiletten_Stadt_Leipzig.csv', 'text'); }
      catch { csv = await readFile(new URL('../sources/leipzig_toiletten.csv', import.meta.url), 'utf8'); } // Kopie vom 01.11.2026
      const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
      const split = (l) => (l.match(/("([^"]*)"|[^,]*)(,|$)/g) || []).map((x) => x.replace(/,$/, '').replace(/^"|"$/g, ''));
      const head = split(lines.shift());
      return { features: lines.map((l) => { const r = split(l); const p = Object.fromEntries(head.map((h, i) => [h, r[i]])); return { geometry: { type: 'Point', coordinates: [+p.long, +p.lat] }, properties: p }; }) };
    },
    map: (p) => {
      if (/geschlossen/i.test(p.Oeffnungszeiten || '')) return null;
      const free = /kostenfrei|kostenlos/i.test(p.Entgelt || '');
      return { c: 'toilette', t: toilet({ name: p.Ort, operator: p.Betreiber, opening_hours: hoursDE(p.Oeffnungszeiten), fee: free ? 'no' : p.Entgelt ? 'yes' : undefined, charge: free ? undefined : p.Entgelt?.replace(/\s*\(.*\)/, ''), wheelchair: /barrierefrei/i.test(p.Ausstattung || '') ? 'yes' : /barrierearm/i.test(p.Ausstattung || '') ? 'limited' : undefined, changing_table: /wickel/i.test(p.Ausstattung || '') ? 'yes' : undefined, unisex: /all gender/i.test(p.Ausstattung || '') ? 'yes' : undefined }) };
    },
  },
  essen: {
    name: 'Stadt Essen', license: 'dl-de/by-2.0 („Stadt Essen“)', url: 'https://opendata.essen.de',
    fetch: async () => {
      const feats = [];
      const wc = await get('https://opendata.essen.de/sites/default/files/Toilettenanlagen_010424.geojson').catch(() => ({ features: [] }));
      for (const f of wc.features || []) feats.push({ ...f, properties: { ...f.properties, _wc: 1 } });
      const ct = await get('https://opendata.essen.de/sites/default/files/Containerstandorte_0.geojson').catch(() => ({ features: [] }));
      feats.push(...(ct.features || []));
      return { features: feats };
    },
    map: (p) => {
      const txt = Object.values(p).join(' ');
      if (p._wc) return { c: 'toilette', t: toilet({ name: p.Name || p.name || p.Bezeichnung || p.BEZEICHNUNG }) };
      const out = [];
      if (/glas/i.test(txt)) out.push({ c: 'glas', t: container('glas', { operator: 'EBE Essen' }) });
      if (/papier/i.test(txt)) out.push({ c: 'papier', t: container('papier', { operator: 'EBE Essen' }) });
      if (/kleid|textil/i.test(txt)) out.push({ c: 'altkleider', t: container('altkleider', { operator: 'EBE Essen' }) });
      return out;
    },
  },
};

export async function loadCities() {
  const result = {};
  for (const [key, s] of Object.entries(CITY_SOURCES)) {
    try {
      const d = await s.fetch();
      const items = [];
      for (const f of d.features || []) {
        const pt = pointOf(f.geometry);
        if (!pt || !(pt[0] > 47 && pt[0] < 55.5 && pt[1] > 5.5 && pt[1] < 15.5)) continue;
        let m = s.map(f.properties || {});
        if (!m) continue;
        if (!Array.isArray(m)) m = [m];
        for (const x of m) {
          for (const k of Object.keys(x.t)) if (x.t[k] === undefined || x.t[k] === null || x.t[k] === '') delete x.t[k];
          const it = { id: `${key}:${items.length}`, c: x.c, lat: +pt[0].toFixed(6), lon: +pt[1].toFixed(6), t: x.t, src: key };
          if (x.c === 'packstation' || x.c === 'paketshop') { const pi = parcelInfo(x.t); it.pk = pi.kind; it.pv = pi.pv; it.ps = pi.send; }
          items.push(it);
        }
      }
      result[key] = items;
      console.log(`Stadtquelle ${key}: ${items.length} Orte`);
    } catch (e) {
      console.warn(`Stadtquelle ${key} übersprungen: ${e.message}`);
    }
  }
  return result;
}
