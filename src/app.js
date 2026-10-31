import { CATEGORIES, CATEGORY_BY_ID } from './categories.js';
import { parseHours, nextPoint, openState, weekSummary } from './hours.js';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const LIST_LIMIT = 25;
const POST_CHANGE = '2025-07-01'; // Deutsche Post hat 2025 die Leerungszeiten umgestellt

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* egal */ } },
};

const ICON_ROUTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-8-8 18-2-8z"/></svg>';
const ICON_FLAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

const state = {
  data: null,
  items: [],
  active: new Set(store.get('active', CATEGORIES.map((c) => c.id)).filter((id) => CATEGORY_BY_ID[id])),
  me: null, // {lat, lon, acc}
  watchId: null,
  selected: null,
  expanded: false,
};
if (!state.active.size) CATEGORIES.forEach((c) => state.active.add(c.id));

// ---------- Hilfsfunktionen ----------
function distM(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const fmtDist = (m) => (m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 9950 ? 1 : 0).replace('.', ',')} km`);
const routeUrl = (it) => `https://www.google.com/maps/dir/?api=1&destination=${it.lat},${it.lon}&travelmode=driving`;
const noteUrl = (it) => `https://www.openstreetmap.org/note/new?lat=${it.lat}&lon=${it.lon}#map=19/${it.lat}/${it.lon}`;
const jaNein = (v) => ({ yes: 'ja', no: 'nein', limited: 'eingeschränkt', designated: 'ja', only: 'nur' }[v] || v);
const fmtDate = (s) => { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s || ''); return m ? (m[3] ? `${m[3]}.${m[2]}.${m[1]}` : `${m[2]}/${m[1]}`) : s; };
const isContainer = (c) => c === 'glas' || c === 'papier' || c === 'altkleider';

function titleOf(it) {
  const t = it.t;
  if (it.c === 'packstation') {
    const b = t.brand || t.operator || '';
    return /dhl|deutsche post/i.test(b) || /packstation/i.test(t.name || '') ? `Packstation${t.ref ? ' ' + t.ref : ''}` : (t.name || b || 'Paketautomat');
  }
  if (it.c === 'geldautomat') return t.brand || t.operator || t.name || 'Geldautomat';
  if (it.c === 'ladesaeule') return t.operator || t.brand || t.name || 'Ladesäule';
  if (it.c === 'briefkasten') return t.name && !/briefkasten/i.test(t.name) ? `Briefkasten ${t.name}` : 'Briefkasten';
  return t.name || CATEGORY_BY_ID[it.c].label;
}

function addressOf(t) {
  const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
  return [street, t['addr:city']].filter(Boolean).join(', ') || null;
}

/** Wichtigster Status in einer Zeile: {cls, text} */
function statusOf(it, now = new Date()) {
  const t = it.t;
  if (it.c === 'briefkasten') {
    const p = parseHours(t.collection_times, 'points');
    if (!p) return t.collection_times ? { cls: '', text: `Leerung: ${t.collection_times}` } : { cls: 'warn', text: 'Leerungszeit unbekannt' };
    const n = nextPoint(p, now);
    return n ? { cls: n.offset === 0 ? 'ok' : '', text: `Leerung ${n.text}` } : null;
  }
  if (t.opening_hours) {
    const s = openState(parseHours(t.opening_hours), now);
    if (s) {
      if (isContainer(it.c)) return s.open ? { cls: 'ok', text: s.always ? 'Einwurf jederzeit' : `Einwurf bis ${s.until}` } : { cls: 'bad', text: `Einwurfpause${s.next ? ' · ab ' + s.next : ''}` };
      return { cls: s.open ? 'ok' : 'bad', text: s.text };
    }
  }
  if (t.opening_hours && /geschlossen|closed/i.test(t.opening_hours)) return { cls: 'bad', text: t.opening_hours.replace(/"/g, '') };
  if (it.c === 'toilette') {
    if (t.access === 'permit') return { cls: 'warn', text: 'nur mit Erlaubnis' };
    if (t.access === 'customers') return { cls: 'warn', text: 'nur für Kunden' };
    if (t.fee === 'no') return { cls: 'ok', text: 'kostenlos' };
    if (t.fee === 'yes') return { cls: '', text: t.charge ? `Gebühr ${t.charge}` : 'kostenpflichtig' };
  }
  if (it.c === 'rastplatz') {
    if (t.toilets === 'yes') return { cls: 'ok', text: 'mit WC' };
    if (t.toilets === 'no') return { cls: 'bad', text: 'kein WC' };
    return { cls: '', text: 'WC unbekannt' };
  }
  return null;
}

const MATERIAL = {
  glass_bottles: 'Glasflaschen', glass: 'Glas', paper: 'Papier', cardboard: 'Pappe', newspaper: 'Zeitungen',
  clothes: 'Kleidung', shoes: 'Schuhe', plastic_packaging: 'Verpackungen', cans: 'Dosen', batteries: 'Batterien',
  small_appliances: 'Elektro-Kleingeräte', books: 'Bücher', cooking_oil: 'Speiseöl', green_waste: 'Grünschnitt',
};
const SOCKET = { type2: 'Typ 2', type2_combo: 'CCS', chademo: 'CHAdeMO', schuko: 'Schuko', type2_cable: 'Typ 2 (Kabel)', tesla_supercharger: 'Tesla', type1: 'Typ 1' };

function factsOf(it) {
  const t = it.t, f = [];
  const add = (k, v) => { if (v) f.push([k, v]); };
  if (it.c === 'briefkasten') {
    const p = parseHours(t.collection_times, 'points');
    add('Leerung', weekSummary(p) || t.collection_times || 'unbekannt');
    add('Zuletzt geprüft', fmtDate(t['check_date:collection_times'] || t.check_date || t['survey:date']));
    add('Kasten-Nr.', t.ref);
  }
  if (isContainer(it.c)) {
    const mats = Object.keys(t).filter((k) => k.startsWith('recycling:') && t[k] === 'yes').map((k) => MATERIAL[k.slice(10)] || k.slice(10));
    add('Annahme', mats.join(', '));
    add('Art', t.recycling_type === 'centre' ? 'Wertstoffhof' : 'Container');
    add('Einwurfzeiten', weekSummary(parseHours(t.opening_hours)) || t.opening_hours);
  }
  if (it.c === 'toilette') {
    add('Öffnungszeiten', weekSummary(parseHours(t.opening_hours)) || t.opening_hours);
    add('Gebühr', t.fee === 'no' ? 'kostenlos' : t.fee === 'yes' ? (t.charge || 'ja') : null);
    add('Euroschlüssel', t.centralkey === 'eurokey' ? 'ja' : null);
    add('Barrierefrei', jaNein(t.wheelchair));
    add('Wickeltisch', jaNein(t.changing_table));
    add('Zugang', t.access === 'customers' ? 'nur für Kunden' : null);
  }
  if (it.c === 'rastplatz') {
    add('Art', t.highway === 'services' ? 'Raststätte' : 'Rastplatz / Parkplatz');
    add('Toiletten', t.toilets ? jaNein(t.toilets) : 'unbekannt');
    add('Barrierefreies WC', jaNein(t['toilets:wheelchair']));
  }
  if (it.c === 'packstation') {
    add('Anbieter', t.brand || t.operator);
    add('Nummer', t.ref);
    add('Öffnungszeiten', weekSummary(parseHours(t.opening_hours)) || t.opening_hours);
    add('Pakete abschicken', jaNein(t.parcel_mail_in));
  }
  if (it.c === 'geldautomat') {
    add('Bank', t.operator && t.operator !== titleOf(it) ? t.operator : null);
    add('Öffnungszeiten', weekSummary(parseHours(t.opening_hours)) || t.opening_hours);
    add('Einzahlen', jaNein(t.cash_in));
    add('Im Gebäude', jaNein(t.indoor));
  }
  if (it.c === 'ladesaeule') {
    const s = Object.keys(t).filter((k) => /^socket:[a-z0-9_]+$/.test(k) && t[k] !== 'no')
      .map((k) => { const ty = k.slice(7); const kw = t[`${k}:output`]; return `${SOCKET[ty] || ty} × ${t[k] === 'yes' ? '?' : t[k]}${kw ? ` (${kw.replace(' kW', '')} kW)` : ''}`; });
    add('Anschlüsse', s.join(', '));
    add('Ladepunkte', t.capacity);
    add('Öffnungszeiten', weekSummary(parseHours(t.opening_hours)) || t.opening_hours);
    add('Kostenpflichtig', jaNein(t.fee));
  }
  if (!['geldautomat', 'ladesaeule', 'packstation'].includes(it.c)) add('Betreiber', t.operator);
  add('Adresse', addressOf(t));
  add('Hinweis', t.description);
  return f;
}

function extraChips(it) {
  const t = it.t, out = [];
  if (it.c === 'briefkasten' && t.collection_times) {
    const checked = t['check_date:collection_times'] || t.check_date || t['survey:date'];
    if (!checked || checked < POST_CHANGE) out.push({ cls: 'warn', text: 'Zeit evtl. veraltet' });
  }
  if (it.c === 'toilette') {
    if (t.centralkey === 'eurokey') out.push({ cls: '', text: 'Euroschlüssel' });
    if (t.wheelchair === 'yes') out.push({ cls: '', text: 'barrierefrei' });
  }
  return out;
}

// ---------- Kopf: Kategorie-Chips ----------
function renderChips() {
  const counts = state.data?.counts || {};
  $('#chips').innerHTML = CATEGORIES.map((c) => `
    <button class="chip" data-id="${c.id}" aria-pressed="${state.active.has(c.id)}" style="--c:${c.color};--k:${c.ink}">
      <span class="ic">${c.icon}</span>${esc(c.plural)}${state.data ? `<span class="n">${counts[c.id] || 0}</span>` : ''}
    </button>`).join('');
}
$('#chips').addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  const id = b.dataset.id;
  const all = state.active.size === CATEGORIES.length;
  if (all) { state.active = new Set([id]); } // erster Tipp: nur diese Kategorie
  else if (state.active.has(id)) {
    state.active.delete(id);
    if (!state.active.size) CATEGORIES.forEach((c) => state.active.add(c.id)); // letzte abgewählt -> alle
  } else state.active.add(id);
  store.set('active', [...state.active]);
  renderChips();
  applyFilter();
  if (state.selected && !state.active.has(state.selected.c)) closeDetail();
  else if (!state.selected) renderList();
});

// ---------- Karte ----------
const cfg = { lat: 50.5446, lon: 7.1136 };
const map = new maplibregl.Map({
  container: 'map',
  style: STYLE_URL,
  center: [cfg.lon, cfg.lat],
  zoom: 12.6,
  attributionControl: false,
  dragRotate: false,
  pitchWithRotate: false,
});
map.touchZoomRotate.disableRotation();
map.addControl(new maplibregl.AttributionControl({
  compact: true,
  customAttribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap-Mitwirkende</a> · <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>',
}), 'bottom-left');

function markerImage(cat) {
  return new Promise((resolve) => {
    const inner = cat.icon.replace(/currentColor/g, cat.ink).replace('<svg ', '<svg x="11" y="11" width="26" height="26" ');
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="${cat.color}" stroke="#fff" stroke-width="3"/>${inner}</svg>`;
    const img = new Image(96, 96);
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = 96; cv.height = 96;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, 96, 96);
      resolve(ctx.getImageData(0, 0, 96, 96));
    };
    img.onerror = () => resolve(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
  });
}

function geojson() {
  return {
    type: 'FeatureCollection',
    features: state.items.map((it, i) => ({ type: 'Feature', id: i, properties: { c: it.c, i }, geometry: { type: 'Point', coordinates: [it.lon, it.lat] } })),
  };
}

function applyFilter() {
  if (!map.getLayer('pois')) return;
  map.setFilter('pois', ['in', ['get', 'c'], ['literal', [...state.active]]]);
}

async function setupLayers() {
  for (const c of CATEGORIES) {
    if (map.hasImage(c.id)) continue;
    const img = await markerImage(c);
    if (img && !map.hasImage(c.id)) map.addImage(c.id, img, { pixelRatio: 2 });
  }
  if (!map.getSource('pois')) {
    map.addSource('sel', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'sel', type: 'circle', source: 'sel', paint: { 'circle-radius': 22, 'circle-color': '#173B2C', 'circle-opacity': 0.18, 'circle-stroke-color': '#173B2C', 'circle-stroke-width': 2 } });
    map.addSource('me', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'me-halo', type: 'circle', source: 'me', paint: { 'circle-radius': 16, 'circle-color': '#1A73E8', 'circle-opacity': 0.18 } });
    map.addLayer({ id: 'me', type: 'circle', source: 'me', paint: { 'circle-radius': 7, 'circle-color': '#1A73E8', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } });
    if (state.me) map.getSource('me').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [state.me.lon, state.me.lat] } }] });
    map.addSource('pois', { type: 'geojson', data: geojson() });
    map.addLayer({
      id: 'pois', type: 'symbol', source: 'pois',
      layout: {
        'icon-image': ['get', 'c'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.42, 13, 0.62, 16, 0.85, 18, 1],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-sort-key': ['get', 'i'],
      },
    });
    applyFilter();
  }
}
map.on('load', setupLayers);
map.on('styleimagemissing', () => {});
map.on('click', 'pois', (e) => {
  const f = e.features?.[0];
  if (!f) return;
  e.originalEvent.__handled = true;
  openDetail(state.items[f.properties.i]);
});
map.on('click', (e) => { if (!e.originalEvent.__handled && state.selected) closeDetail(); });
map.on('mouseenter', 'pois', () => { map.getCanvas().style.cursor = 'pointer'; });
map.on('mouseleave', 'pois', () => { map.getCanvas().style.cursor = ''; });
let moveTimer;
map.on('moveend', () => { clearTimeout(moveTimer); moveTimer = setTimeout(() => { if (!state.me && !state.selected) renderList(); }, 250); });

// ---------- Standort ----------
function refPoint() {
  if (state.me) return { ...state.me, mine: true };
  const c = map.getCenter();
  return { lat: c.lat, lon: c.lng, mine: false };
}
function setMe(pos) {
  const first = !state.me;
  state.me = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy };
  map.getSource('me')?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [state.me.lon, state.me.lat] } }] });
  $('#btn-locate').classList.add('active');
  if (first) map.flyTo({ center: [state.me.lon, state.me.lat], zoom: Math.max(map.getZoom(), 14.5) });
  if (!state.selected) renderList();
}
function startLocate() {
  if (!('geolocation' in navigator)) return;
  if (state.watchId != null) {
    if (state.me) map.flyTo({ center: [state.me.lon, state.me.lat], zoom: Math.max(map.getZoom(), 14.5) });
    return;
  }
  state.watchId = navigator.geolocation.watchPosition(setMe, (err) => {
    state.watchId = null;
    $('#btn-locate').classList.remove('active');
    if (err.code === 1) alertSheet('Standort ist nicht freigegeben. Du kannst ihn in den Browser-Einstellungen erlauben – die Liste zeigt sonst die Entfernung zur Kartenmitte.');
  }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
}
$('#btn-locate').addEventListener('click', startLocate);
try {
  navigator.permissions?.query({ name: 'geolocation' }).then((p) => { if (p.state === 'granted') startLocate(); }).catch(() => {});
} catch { /* egal */ }

// ---------- Unteres Blatt ----------
const sheet = $('#sheet'), body = $('#sheet-body');
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--sheet-h', `${sheet.offsetHeight}px`);
  const wide = innerWidth >= 720;
  map.setPadding({ top: 110, bottom: wide ? 0 : Math.min(sheet.offsetHeight, innerHeight * 0.5), left: wide ? 420 : 0, right: 0 });
}).observe(sheet);
$('#grip').addEventListener('click', () => { state.expanded = !state.expanded; if (!state.selected) renderList(); });

function alertSheet(msg) {
  body.innerHTML = `<div class="empty">${esc(msg)}</div>`;
}

function rowHtml(it, ref) {
  const cat = CATEGORY_BY_ID[it.c];
  const st = statusOf(it);
  const d = distM(ref, it);
  return `<div class="row" data-i="${state.items.indexOf(it)}" role="button" tabindex="0">
    <span class="ic" style="--c:${cat.color};--k:${cat.ink}">${cat.icon}</span>
    <span class="main">
      <div class="name">${esc(titleOf(it))}</div>
      <div class="meta">${st ? `<span class="st ${st.cls}">${esc(st.text)}</span>` : esc(cat.label)}</div>
    </span>
    <span class="dist">${fmtDist(d)}</span>
    <a class="go" href="${routeUrl(it)}" target="_blank" rel="noopener" aria-label="Route in Google Maps">${ICON_ROUTE}</a>
  </div>`;
}

function renderList() {
  if (!state.data) return;
  const ref = refPoint();
  const list = state.items
    .filter((it) => state.active.has(it.c))
    .map((it) => ({ it, d: distM(ref, it) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, state.expanded ? LIST_LIMIT : 3);
  const only = state.active.size === 1 ? CATEGORY_BY_ID[[...state.active][0]].plural : 'Orte';
  body.innerHTML = `
    <div class="sheet-h"><h2>Nächste ${esc(only)}</h2><span class="from">${ref.mine ? 'von dir aus' : 'ab Kartenmitte'}</span></div>
    ${list.length ? list.map((x) => rowHtml(x.it, ref)).join('') : '<div class="empty">Hier ist noch nichts eingetragen.</div>'}
    ${!state.expanded && list.length ? '<button class="btn" id="more" style="width:100%;height:42px;margin-top:6px">Mehr anzeigen</button>' : ''}`;
  $('#more')?.addEventListener('click', () => { state.expanded = true; renderList(); });
}
body.addEventListener('click', (e) => {
  if (e.target.closest('.go')) return; // Link öffnet Google Maps
  const r = e.target.closest('.row');
  if (r) openDetail(state.items[+r.dataset.i], true);
});

function openDetail(it, fly = false) {
  state.selected = it;
  const cat = CATEGORY_BY_ID[it.c];
  const st = statusOf(it);
  const chips = [st, ...extraChips(it)].filter(Boolean);
  const ref = refPoint();
  map.getSource('sel')?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [it.lon, it.lat] } }] });
  if (fly) map.easeTo({ center: [it.lon, it.lat], zoom: Math.max(map.getZoom(), 16) });
  const checked = it.t.check_date || it.t['survey:date'];
  body.innerHTML = `<div class="detail">
    <div class="detail-h">
      <span class="ic" style="--c:${cat.color};--k:${cat.ink}">${cat.icon}</span>
      <div><div class="cat">${esc(cat.label)} · ${fmtDist(distM(ref, it))}${ref.mine ? '' : ' ab Kartenmitte'}</div><h2>${esc(titleOf(it))}</h2></div>
      <button class="close" id="close" aria-label="Schließen">${ICON_X}</button>
    </div>
    ${chips.length ? `<div class="status-line">${chips.map((c) => `<span class="st ${c.cls}">${esc(c.text)}</span>`).join('')}</div>` : ''}
    <dl class="facts">${factsOf(it).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    <div class="actions">
      <a class="btn primary" href="${routeUrl(it)}" target="_blank" rel="noopener">${ICON_ROUTE}Route</a>
      <a class="btn" href="${noteUrl(it)}" target="_blank" rel="noopener">${ICON_FLAG}Korrigieren</a>
    </div>
    <div class="src">Quelle: <a href="https://www.openstreetmap.org/${{ n: 'node', w: 'way', r: 'relation' }[it.id[0]]}/${it.id.slice(1)}" target="_blank" rel="noopener">OpenStreetMap</a>${checked ? ` · vor Ort geprüft ${esc(fmtDate(checked))}` : ''}</div>
  </div>`;
  $('#close').addEventListener('click', closeDetail);
}
function closeDetail() {
  state.selected = null;
  map.getSource('sel')?.setData({ type: 'FeatureCollection', features: [] });
  renderList();
}

// ---------- Daten laden ----------
async function loadData() {
  try {
    const res = await fetch('data/pois.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    state.data = await res.json();
    state.items = state.data.items;
    const g = new Date(state.data.generated);
    const r = state.data.region || {};
    $('#stand').textContent = `${r.name || ''} · ${r.radiusKm || ''} km · Stand ${g.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`;
    renderChips();
    if (map.getSource('pois')) map.getSource('pois').setData(geojson());
    renderList();
  } catch {
    $('#stand').textContent = 'Daten noch nicht verfügbar';
    alertSheet('Die Ortsdaten werden gerade erstellt. Schau in ein paar Minuten nochmal rein.');
  }
}
renderChips();
loadData();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
