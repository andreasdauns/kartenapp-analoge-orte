import { CATEGORIES, CATEGORY_BY_ID, PROVIDERS, CARDS, fuelInfo, fuelCardsPassing } from './categories.js';
import { parseHours, nextPoint, openState, weekSummary } from './hours.js';
import * as R from './reports.js';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const LIST_LIMIT = 25;
const PEEK_ROWS = 2;
const MIN_LOAD_ZOOM = 9;
const POST_CHANGE = '2025-07-01'; // Deutsche Post hat 2025 die Leerungszeiten umgestellt
// Start ohne gespeicherten Ausschnitt: ganz Deutschland (kein fester Ort, der Rückschlüsse zulässt)
const START = { lat: 51.16, lon: 10.45, zoom: 5 };
const DE_BOUNDS = [[5.87, 47.27], [15.04, 55.06]];

const $ = (s) => document.querySelector(s);
/** Nur https-Links aus Datenquellen zulassen (Schutz vor manipulierten Links). */
const safeUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' ? esc(x.href) : '#'; } catch { return '#'; } };
const CONTACT_MAIL = ['andreas.dauns.apps', 'gmail.com'].join('@');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* egal */ } },
};

const ICON_ROUTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-8-8 18-2-8z"/></svg>';
const ICON_FLAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

const state = {
  index: null,
  items: [],
  places: [],
  loaded: new Set(),
  loading: new Set(),
  active: new Set(store.get('cats', []).filter((id) => CATEGORY_BY_ID[id])), // beim ersten Start: nichts ausgewählt
  me: null,
  watchId: null,
  selected: null,
  mode: 'peek', // peek | full
  nav: store.get('navApp', null), // google | apple | waze
  providers: new Set(store.get('prov', []).filter((id) => PROVIDERS.some((p) => p.id === id))), // leer = alle Anbieter
  cards: new Set(store.get('cards', []).filter((id) => CARDS.some((c) => c.id === id))), // leer = alle Tankstellen
  cont: new Set(store.get('cont', []).filter((id) => ['glas', 'papier', 'altkleider'].includes(id))), // leer = alle Container
};
const PROV = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));
const PARCEL = ['packstation', 'paketshop'];
const allProviders = () => state.providers.size === 0;
const CARD = Object.fromEntries(CARDS.map((c) => [c.id, c]));
const FUEL = 'tankstelle';
const fuelOf = (it) => it._fi || (it._fi = fuelInfo(it.t));
// Mit gewählten Karten: jede gewählte Karte muss „bestätigt“ oder „laut Marke üblich“ sein
const cardsOk = (it) => state.cards.size === 0 || [...state.cards].every((c) => ['ok', 'likely'].includes(fuelOf(it).cards[c]?.lv));
const passes = (it) => state.active.has(it.c) && (!PARCEL.includes(it.c) || allProviders() || (it.pv || []).some((p) => state.providers.has(p)))
  && (it.c !== FUEL || cardsOk(it));

// ---------- Hilfsfunktionen ----------
function distM(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const fmtDist = (m) => (m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 9950 ? 1 : 0).replace('.', ',')} km`);
const noteUrl = (it) => `https://www.openstreetmap.org/note/new?lat=${it.lat}&lon=${it.lon}#map=19/${it.lat}/${it.lon}`;
const jaNein = (v) => ({ yes: 'ja', no: 'nein', limited: 'eingeschränkt', designated: 'ja', only: 'nur' }[v] || v);
const fmtDate = (s) => { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s || ''); return m ? (m[3] ? `${m[3]}.${m[2]}.${m[1]}` : `${m[2]}/${m[1]}`) : s; };
const isContainer = (c) => c === 'glas' || c === 'papier' || c === 'altkleider';
// Glas, Papier und Altkleider erscheinen oben als eine Kategorie „Container“ mit Unterauswahl (wie Paketdienste)
const CONTAINERS = ['glas', 'papier', 'altkleider'];
const CONT_LABEL = { glas: 'Glas', papier: 'Papier', altkleider: 'Altkleider' };
const CONT_GROUP = {
  id: 'container', plural: 'Container', color: '#2F8F4E', ink: '#FFFFFF',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h16l-1.5 12.5h-13z"/><path d="M3 8h18M9 4.5h6v3.5M10 12v5M14 12v5"/></svg>',
};
const containersOn = () => CONTAINERS.some((c) => state.active.has(c));
// Welche Container-Arten aktiv sind, ergibt sich aus der Unterauswahl (leer = alle)
function syncContainers(on = containersOn()) {
  CONTAINERS.forEach((c) => state.active.delete(c));
  if (on) CONTAINERS.filter((c) => !state.cont.size || state.cont.has(c)).forEach((c) => state.active.add(c));
  store.set('cats', [...state.active]);
  store.set('cont', [...state.cont]);
}
// Alte Auswahl (einzelne Container-Chips) übernehmen
if (containersOn() && !CONTAINERS.every((c) => state.active.has(c)) && !state.cont.size) CONTAINERS.filter((c) => state.active.has(c)).forEach((c) => state.cont.add(c));

const NAV = {
  google: { name: 'Google Maps', url: (it) => `https://www.google.com/maps/dir/?api=1&destination=${it.lat},${it.lon}&travelmode=driving` },
  apple: { name: 'Apple Karten', url: (it) => `https://maps.apple.com/?daddr=${it.lat},${it.lon}&dirflg=d` },
  waze: { name: 'Waze', url: (it) => `https://waze.com/ul?ll=${it.lat},${it.lon}&navigate=yes` },
};
const routeUrl = (it) => NAV[state.nav || 'google'].url(it);

function nearestPlace(pt, maxM = 12000) {
  let best = null, bd = Infinity;
  for (const p of state.places) {
    const dLat = Math.abs(p[1] - pt.lat), dLon = Math.abs(p[2] - pt.lon);
    if (dLat > 0.15 || dLon > 0.22) continue;
    const d = distM(pt, { lat: p[1], lon: p[2] });
    // Städte/Orte leicht bevorzugen gegenüber Stadtteilen weit weg
    const w = d * (p[3] === 'suburb' ? 1.15 : 1);
    if (w < bd) { bd = w; best = p; }
  }
  return best && bd <= maxM ? best[0] : null;
}

function titleOf(it) {
  const t = it.t;
  switch (it.c) {
    case 'packstation': {
      if (it.pk === 'poststation') return `Poststation${t.ref ? ' ' + t.ref : ''}`;
      const b = t.brand || t.operator || '';
      if ((it.pv || []).includes('dhl') && !/deinfach/i.test(b)) return `Packstation${t.ref ? ' ' + t.ref : ''}`;
      return b || t.name || 'Paketstation';
    }
    case 'paketshop': return it.pk === 'filiale' ? 'Postfiliale' : 'Paketshop';
    case 'geldautomat': return 'ATM';
    case 'ladesaeule': return 'Ladesäule';
    case 'apotheke': return t.name || 'Apotheke';
    case 'briefkasten': return 'Briefkasten';
    case 'toilette': return t.name && !/^(wc|toilette)$/i.test(t.name) ? t.name : 'Öffentliche Toilette';
    case 'rastplatz': return t.name || 'Rastplatz';
    case 'tankstelle': return fuelOf(it).brand?.label || t.brand || t.name || t.operator || 'Tankstelle';
    case 'wertstoffhof': {
      if (t.name && !/^(wertstoffhof|recyclinghof)$/i.test(t.name)) return t.name;
      const green = t['recycling:green_waste'] === 'yes' || t['recycling:garden_waste'] === 'yes';
      if (t.recycling_type !== 'centre' && t.amenity === 'recycling' && green) return 'Grünschnitt-Sammelstelle';
      return t.amenity === 'waste_transfer_station' ? 'Abfall-Annahmestelle' : 'Wertstoffhof';
    }
    default: return CATEGORY_BY_ID[it.c].label;
  }
}

function subOf(it) {
  const t = it.t;
  const parts = [];
  if (it.c === 'geldautomat') parts.push(t.brand || t.operator || t.name);
  if (PARCEL.includes(it.c)) {
    if (it.c === 'paketshop' && t.name && !/paket|post|hermes|dpd|gls|ups/i.test(t.name)) parts.push(t.name);
    parts.push((it.pv || []).map((p) => PROV[p]?.label).filter(Boolean).join(', '));
  }
  if (it.c === 'wertstoffhof') parts.push(t.operator);
  if (it.c === FUEL) {
    const title = titleOf(it).toLowerCase();
    parts.push([t.operator, t.brand, t.name].find((v) => v && !v.toLowerCase().includes(title) && !title.includes(v.toLowerCase())));
  }
  if (it.c === 'ladesaeule') {
    const kw = Math.max(0, ...Object.keys(t).filter((k) => /^socket:.+:output$/.test(k)).map((k) => parseFloat(t[k]) || 0));
    parts.push([t.operator || t.brand, kw ? `${kw} kW` : null].filter(Boolean).join(' · '));
  }
  parts.push(it.place || (it.place = nearestPlace(it)));
  return parts.filter(Boolean).join(' · ');
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
    if (!p) return t.collection_times ? { cls: '', text: `Leerung: ${t.collection_times}` } : { cls: 'warn', text: 'Leerung unbekannt' };
    const n = nextPoint(p, now);
    return n ? { cls: n.offset === 0 ? 'ok' : '', text: `Leerung ${n.text}` } : null;
  }
  if (it.c === FUEL) {
    if (!t.opening_hours) return { cls: '', text: 'Öffnungszeiten unbekannt' };
    if (parseHours(t.opening_hours)?.always) return { cls: 'ok', text: '24 h geöffnet' };
  }
  if (t.opening_hours && /geschlossen|closed/i.test(t.opening_hours) && !parseHours(t.opening_hours)) return { cls: 'bad', text: t.opening_hours.replace(/"/g, '') };
  if (t.opening_hours) {
    const s = openState(parseHours(t.opening_hours), now);
    if (s) {
      if (isContainer(it.c)) return s.open ? { cls: 'ok', text: s.always ? 'Einwurf jederzeit' : `Einwurf bis ${s.until}` } : { cls: 'bad', text: `Einwurfpause${s.next ? ' · ab ' + s.next : ''}` };
      return { cls: s.open ? 'ok' : 'bad', text: s.text };
    }
  }
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
  garden_waste: 'Gartenabfälle', organic: 'Bioabfall', wood: 'Holz', scrap_metal: 'Metallschrott', metal: 'Metall',
  electrical_appliances: 'Elektrogeräte', electrical_items: 'Elektrogeräte', hazardous_waste: 'Schadstoffe',
  bulky_waste: 'Sperrmüll', furniture: 'Möbel', mattresses: 'Matratzen', tyres: 'Reifen', polystyrene: 'Styropor',
  plastic: 'Kunststoff', waste: 'Restmüll', paint: 'Farben', fluorescent_tubes: 'Leuchtstoffröhren', cds: 'CDs',
  engine_oil: 'Altöl', car_batteries: 'Autobatterien', rubble: 'Bauschutt', soil: 'Erde', christmas_trees: 'Weihnachtsbäume',
};
const SOCKET = { type2: 'Typ 2', type2_combo: 'CCS', chademo: 'CHAdeMO', schuko: 'Schuko', type2_cable: 'Typ 2 (Kabel)', tesla_supercharger: 'Tesla', type1: 'Typ 1' };

const NAME_KEYS = new Set(['Betreiber', 'Marke', 'Bank', 'Geschäft', 'Anbieter', 'Hinweis']);
const normTxt = (v) => String(v).toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim();
function factsOf(it) {
  const f = factsRaw(it);
  // Gleiche Angabe nicht zweimal zeigen: gleiches Feld, oder Name/Betreiber/Marke identisch mit Titel oder einer anderen Angabe
  const seenKeys = new Set(), seenNames = new Set([normTxt(titleOf(it))]);
  return f.filter(([k, v, html]) => {
    if (seenKeys.has(k)) return false;
    seenKeys.add(k);
    if (html || !NAME_KEYS.has(k)) return true;
    const n = normTxt(v);
    if (!n || seenNames.has(n)) return false;
    seenNames.add(n);
    return true;
  });
}
function factsRaw(it) {
  const t = it.t, f = [];
  const add = (k, v) => { if (v && String(v).trim()) f.push([k, String(v).trim()]); };
  if (it.c === 'briefkasten') {
    add('Leerung', weekSummary(parseHours(t.collection_times, 'points')) || t.collection_times || 'unbekannt');
    add('Zuletzt geprüft', fmtDate(t['check_date:collection_times'] || t.check_date || t['survey:date']));
    add('Kasten-Nr.', t.ref);
  }
  if (isContainer(it.c)) {
    const mats = Object.keys(t).filter((k) => /^recycling:[a-z_]+$/.test(k) && t[k] === 'yes').map((k) => MATERIAL[k.slice(10)] || k.slice(10));
    add('Annahme', mats.join(', '));
    add('Art', t.recycling_type === 'centre' ? 'Wertstoffhof' : 'Container');
    add('Einwurfzeiten', weekSummary(parseHours(t.opening_hours)) || t.opening_hours);
  }
  if (it.c === 'wertstoffhof') {
    const mats = Object.keys(t).filter((k) => /^recycling:[a-z_]+$/.test(k) && t[k] === 'yes').map((k) => MATERIAL[k.slice(10)] || k.slice(10).replace(/_/g, ' '));
    add('Öffnungszeiten', weekSummary(parseHours(t.opening_hours)) || t.opening_hours || 'unbekannt – vorher beim Betreiber prüfen');
    add('Annahme', mats.join(', '));
    add('Betreiber', t.operator);
    add('Gebühr', t.fee === 'no' ? 'kostenlos' : t.fee === 'yes' ? (t.charge || 'ja') : null);
  }
  if (it.c === 'toilette') {
    add('Öffnungszeiten', weekSummary(parseHours(t.opening_hours)) || t.opening_hours);
    add('Gebühr', t.fee === 'no' ? 'kostenlos' : t.fee === 'yes' ? (t.charge || 'ja') : null);
    add('Euroschlüssel', t.centralkey === 'eurokey' ? 'ja' : null);
    add('Barrierefrei', t.wheelchair ? `${jaNein(t.wheelchair)} (laut Kartendaten, bitte vorab prüfen)` : null);
    add('Wickeltisch', jaNein(t.changing_table));
    add('Zugang', t.access === 'customers' ? 'nur für Kunden' : null);
  }
  if (it.c === 'rastplatz') {
    add('Art', t.highway === 'services' ? 'Raststätte' : 'Rastplatz / Parkplatz');
    add('Toiletten', t.toilets ? jaNein(t.toilets) : 'unbekannt');
    add('Barrierefreies WC', t['toilets:wheelchair'] ? `${jaNein(t['toilets:wheelchair'])} (laut Kartendaten, bitte vorab prüfen)` : null);
    add('Ausstattung', t['autobahn:features']);
    add('Stellplätze', t['autobahn:info']);
    add('Fahrtrichtung', t.ref);
  }
  if (PARCEL.includes(it.c)) {
    add('Art', { filiale: 'Postfiliale (Partnerfiliale)', paketshop: 'Paketshop', station: 'Paketstation', poststation: 'Poststation (mit Briefmarken & Briefkasten)' }[it.pk]);
    add('Anbieter', (it.pv || []).map((p) => PROV[p]?.label).join(', '));
    add('Geschäft', it.c === 'paketshop' ? t.name : null);
    add('Nummer', t.ref);
    add('Pakete abgeben', { yes: 'ja', no: 'nein, nur abholen', returns: 'nur Retouren' }[it.ps]);
    add('Briefmarken', t['post_office:stamps'] ? 'ja' : null);
    add('Öffnungszeiten', weekSummary(parseHours(t.opening_hours)) || t.opening_hours);
  }
  if (it.c === 'geldautomat') {
    add('Bank', t.brand || t.operator || t.name);
    if (t.amenity === 'bank') add('Standort', 'in der Bankfiliale');
    add('Öffnungszeiten', weekSummary(parseHours(t.opening_hours)) || t.opening_hours);
    add('Einzahlen', jaNein(t.cash_in));
  }
  if (it.c === 'ladesaeule') {
    const s = Object.keys(t).filter((k) => /^socket:[a-z0-9_]+$/.test(k) && t[k] !== 'no')
      .map((k) => { const ty = k.slice(7); const kw = t[`${k}:output`]; return `${SOCKET[ty] || ty} × ${t[k] === 'yes' ? '?' : t[k]}${kw ? ` (${kw.replace(/\s*kW/i, '')} kW)` : ''}`; });
    add('Betreiber', t.operator || t.brand);
    add('Anschlüsse', s.join(', '));
    add('Ladepunkte', t.capacity);
    add('Öffnungszeiten', weekSummary(parseHours(t.opening_hours)) || t.opening_hours);
    add('Kostenpflichtig', jaNein(t.fee));
    add('Bezahlen', t.payment?.replace(/;/g, ', '));
  }
  if (it.c === 'apotheke') {
    add('Öffnungszeiten', weekSummary(parseHours(t.opening_hours)) || t.opening_hours || 'unbekannt');
    add('Telefon', t.phone || t['contact:phone']);
    add('Notdienst', 'nachts, sonn- und feiertags: aponet.de/notdienstsuche');
  }
  if (it.c === FUEL) {
    const fi = fuelOf(it);
    add('Marke', fi.brand?.label || t.brand);
    add('Betreiber', t.operator);
    add('Öffnungszeiten', weekSummary(parseHours(t.opening_hours)) || t.opening_hours || 'unbekannt – vorher prüfen');
    add('Kraftstoffe', FUELS.filter(([keys]) => keys.some((k) => t[`fuel:${k}`] && t[`fuel:${k}`] !== 'no')).map(([, l]) => l).join(', '));
    f.push(['Tankkarten', cardsHtml(it), true]);
    const eq = [];
    if (t.shop && t.shop !== 'no') eq.push('Shop');
    if (t.car_wash === 'yes') eq.push('Waschanlage');
    if (t.toilets === 'yes') eq.push('WC');
    if (t.compressed_air === 'yes') eq.push('Luft');
    if (t.hgv === 'yes') eq.push('Lkw geeignet');
    if (t.automated === 'yes') eq.push('Automat (ohne Personal)');
    add('Ausstattung', eq.join(', '));
  }
  if (!['geldautomat', 'ladesaeule', 'packstation', 'paketshop', 'apotheke', FUEL].includes(it.c)) add('Betreiber', t.operator);
  add('Adresse', addressOf(t));
  add('Ort', it.place || (it.place = nearestPlace(it)));
  add('Hinweis', t.description);
  return f;
}

const FUELS = [
  [['diesel'], 'Diesel'], [['octane_95', 'e5'], 'Super E5'], [['e10'], 'Super E10'], [['octane_98', 'octane_100', 'octane_102'], 'Super Plus'],
  [['HGV_diesel', 'hgv_diesel'], 'Lkw-Diesel'], [['hvo', 'HVO', 'hvo100', 'HVO100'], 'HVO'], [['adblue'], 'AdBlue'],
  [['lpg'], 'LPG/Autogas'], [['cng', 'biogas'], 'CNG/Erdgas'], [['lng'], 'LNG'], [['e85'], 'E85'], [['h70', 'h35', 'hydrogen'], 'Wasserstoff'],
];
const CARD_LV = { ok: ['ok', '✓ bestätigt'], likely: ['likely', '✓ laut Marke üblich'], no: ['bad', '✗ nicht akzeptiert'], unk: ['unk', '– unbekannt'] };
function cardsHtml(it) {
  const fi = fuelOf(it);
  return `<div class="cards">${CARDS.map((c) => {
    const x = fi.cards[c.id];
    const [cls, text] = x.app && x.lv === 'likely' ? ['warn', 'nur per App'] : CARD_LV[x.lv];
    return `<div class="card-row${state.cards.has(c.id) ? ' sel' : ''}"><span class="cl">${esc(c.label)}</span><span class="st lv ${cls}">${esc(text)}</span>${x.app && x.lv === 'ok' ? '<span class="st lv warn">laut Anbieter nur per App</span>' : ''}</div>`;
  }).join('')}</div>`;
}
// In der Liste: Hinweis, wenn eine gewählte Karte hier nur per App geht (z. B. DKV bei JET)
function appBadge(it) {
  const app = [...state.cards].filter((c) => fuelOf(it).cards[c]?.app).map((c) => CARD[c].label);
  return app.length ? ` <span class="st lv warn">${esc(app.join(', '))} nur per App</span>` : '';
}
function fuelHint(it) {
  if (it.c !== FUEL) return '';
  const fi = fuelOf(it);
  const app = CARDS.filter((c) => fi.cards[c.id].app).map((c) => c.label);
  const likely = CARDS.some((c) => fi.cards[c.id].lv === 'likely');
  const finders = CARDS.filter((c) => c.finder).map((c) => `<a href="${c.finder}" target="_blank" rel="noopener">${esc(c.finderLabel || c.label)}</a>`).join(' · ');
  return `<div class="cardhint">${app.length ? `<p><b>${esc(app.join(', '))}:</b> hier laut Anbieter nur digital per App (z. B. DKV App&amp;Go), nicht mit der Plastikkarte.</p>` : ''}${likely ? '<p>„Laut Marke üblich“: Die Karte gilt an Stationen dieser Marke laut Kartenanbieter, ist hier aber nicht einzeln bestätigt.</p>' : ''}<p>Kartenannahme ohne Gewähr – keine Verbindung zu den Kartenanbietern. Im offiziellen Finder prüfen: ${finders}</p></div>`;
}

function extraChips(it) {
  const t = it.t, out = [];
  if (it.c === FUEL) {
    const fi = fuelOf(it);
    for (const c of state.cards) if (fi.cards[c]?.app) out.push({ cls: 'warn', text: `${CARD[c].label} nur per App` });
    if (t.automated === 'yes') out.push({ cls: '', text: 'Automat' });
  }
  if (it.c === 'briefkasten' && t.collection_times) {
    const checked = t['check_date:collection_times'] || t.check_date || t['survey:date'];
    if (!checked || checked < POST_CHANGE) out.push({ cls: 'warn', text: 'Zeit evtl. veraltet' });
  }
  if (it.c === 'toilette') {
    if (t.centralkey === 'eurokey') out.push({ cls: '', text: 'Euroschlüssel' });
    if (t.wheelchair === 'yes') out.push({ cls: '', text: 'barrierefrei (laut Karte)' });
  }
  return out;
}

// ---------- Kategorie-Chips ----------
function renderChips() {
  const top = CATEGORIES.filter((c) => !CONTAINERS.includes(c.id) || c.id === CONTAINERS[0]).map((c) => (c.id === CONTAINERS[0] ? CONT_GROUP : c));
  $('#chips').innerHTML = top.map((c) => `
    <button class="chip" data-id="${c.id}" aria-pressed="${c.id === 'container' ? containersOn() : state.active.has(c.id)}" style="--c:${c.color};--k:${c.ink}">
      <span class="ic">${c.icon}</span>${esc(c.plural)}
    </button>`).join('') + '<button class="chip wishchip" data-wish="1">Fehlt was?</button>';
}
function renderProviders() {
  $('#containers').hidden = !containersOn();
  $('#containers').innerHTML = CONTAINERS.map((id) => { const c = CATEGORY_BY_ID[id]; return `<button class="chip pv ct" data-ct="${id}" aria-pressed="${state.cont.has(id)}" style="--c:${c.color};--k:${c.ink}"><span class="ic">${c.icon}</span>${esc(CONT_LABEL[id])}</button>`; }).join('');
  const show = PARCEL.some((c) => state.active.has(c));
  $('#providers').hidden = !show;
  $('#providers').innerHTML = PROVIDERS.map((p) => `<button class="chip pv" data-pv="${p.id}" aria-pressed="${state.providers.has(p.id)}">${esc(p.label)}</button>`).join('');
  const fuel = CATEGORY_BY_ID[FUEL];
  $('#cards').hidden = !state.active.has(FUEL);
  $('#cards').innerHTML = CARDS.map((c) => `<button class="chip pv cd" data-card="${c.id}" aria-pressed="${state.cards.has(c.id)}" style="--c:${fuel.color};--k:${fuel.ink}">${esc(c.label)}</button>`).join('');
  layoutSheet();
}
$('#cards').addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  const id = b.dataset.card;
  if (state.cards.has(id)) state.cards.delete(id); else state.cards.add(id); // Mehrfachauswahl, leer = alle
  store.set('cards', [...state.cards]);
  renderProviders();
  applyFilter();
  if (state.selected && !state.selected.adding) openDetail(state.selected); else if (!state.selected) renderList();
});
$('#providers').addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  const id = b.dataset.pv;
  if (state.providers.has(id)) state.providers.delete(id); else state.providers.add(id); // einfach an/aus
  store.set('prov', [...state.providers]);
  renderProviders();
  applyFilter();
  if (!state.selected) renderList();
});
$('#containers').addEventListener('click', (e) => {
  const b = e.target.closest('.chip[data-ct]');
  if (!b) return;
  const id = b.dataset.ct;
  if (state.cont.has(id)) state.cont.delete(id); else state.cont.add(id); // Mehrfachauswahl, leer = alle Container
  syncContainers(true);
  renderProviders();
  applyFilter();
  if (state.selected && !state.active.has(state.selected.c)) closeDetail();
  else if (!state.selected) renderList();
});
$('#chips').addEventListener('click', (e) => {
  const b = e.target.closest('.chip[data-id]');
  if (!b) return;
  const id = b.dataset.id;
  if (id === 'container') syncContainers(!containersOn()); // Gruppe an/aus
  else if (state.active.has(id)) state.active.delete(id); else state.active.add(id); // jede Kategorie einzeln an/aus
  store.set('cats', [...state.active]);
  zoomHint();
  renderChips();
  renderProviders();
  applyFilter();
  if (state.selected && !state.active.has(state.selected.c)) closeDetail();
  else if (!state.selected) renderList();
});

// ---------- Karte ----------
// Kartenausschnitt wird bewusst NICHT gespeichert (Datensparsamkeit, § 25 TDDDG); alten Eintrag entfernen
try { localStorage.removeItem('view'); } catch { /* egal */ }
const view = null;
const map = new maplibregl.Map({
  container: 'map',
  style: STYLE_URL,
  center: view ? [view.lon, view.lat] : [START.lon, START.lat],
  zoom: view ? view.zoom : START.zoom,
  attributionControl: false,
  dragRotate: false,
  pitchWithRotate: false,
});
map.touchZoomRotate.disableRotation();
// map.loaded() ist false, solange Kacheln nachladen – daher eigenes Flag für „Karte einmal fertig geladen“
map.once('load', () => { state.mapReady = true; });
if (!view) map.fitBounds(DE_BOUNDS, { padding: 24, animate: false });


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

const fc = (features) => ({ type: 'FeatureCollection', features });
const pointF = (lon, lat, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } });
const geojson = () => fc(state.items.map((it, i) => pointF(it.lon, it.lat, {
  c: it.c, i, pv: it.pv ? `|${it.pv.join('|')}|` : '',
  fc: it.c === FUEL ? `|${fuelCardsPassing(fuelOf(it)).join('|')}|` : '',
  u: it.src === 'user' && !isConfirmed(it) ? 1 : 0,
})));

function applyFilter() {
  if (!map.getLayer('pois')) return;
  const conds = [['in', ['get', 'c'], ['literal', [...state.active]]]];
  if (!allProviders()) conds.push(['any', ['!', ['in', ['get', 'c'], ['literal', PARCEL]]], ...[...state.providers].map((p) => ['in', `|${p}|`, ['get', 'pv']])]);
  if (state.cards.size) conds.push(['any', ['!=', ['get', 'c'], FUEL], ['all', ...[...state.cards].map((c) => ['in', `|${c}|`, ['get', 'fc']])]]);
  map.setFilter('pois', conds.length === 1 ? conds[0] : ['all', ...conds]);
}

async function setupLayers() {
  for (const c of CATEGORIES) {
    if (map.hasImage(c.id)) continue;
    const img = await markerImage(c);
    if (img && !map.hasImage(c.id)) map.addImage(c.id, img, { pixelRatio: 2 });
  }
  if (map.getSource('pois')) return;
  map.addSource('sel', { type: 'geojson', data: fc([]) });
  map.addLayer({ id: 'sel', type: 'circle', source: 'sel', paint: { 'circle-radius': 22, 'circle-color': '#173B2C', 'circle-opacity': 0.18, 'circle-stroke-color': '#173B2C', 'circle-stroke-width': 2 } });
  map.addSource('me', { type: 'geojson', data: state.me ? fc([pointF(state.me.lon, state.me.lat)]) : fc([]) });
  map.addLayer({ id: 'me-halo', type: 'circle', source: 'me', paint: { 'circle-radius': 16, 'circle-color': '#1A73E8', 'circle-opacity': 0.18 } });
  map.addLayer({ id: 'me', type: 'circle', source: 'me', paint: { 'circle-radius': 7, 'circle-color': '#1A73E8', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } });
  map.addSource('pois', { type: 'geojson', data: geojson() });
  map.addLayer({
    id: 'pois', type: 'symbol', source: 'pois', minzoom: MIN_LOAD_ZOOM,
    layout: {
      'icon-image': ['get', 'c'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.4, 13, 0.62, 16, 0.85, 18, 1],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': ['case', ['==', ['get', 'u'], 1], 0.5, 1] },
  });
  applyFilter();
}
map.on('load', setupLayers);
map.on('click', 'pois', (e) => {
  const f = e.features?.[0];
  if (!f) return;
  e.originalEvent.__handled = true;
  openDetail(state.items[f.properties.i]);
});
map.on('click', (e) => { if (!e.originalEvent.__handled && state.selected && !state.selected.adding) closeDetail(); });
map.on('mouseenter', 'pois', () => { map.getCanvas().style.cursor = 'pointer'; });
map.on('mouseleave', 'pois', () => { map.getCanvas().style.cursor = ''; });
let moveTimer;
function zoomHint() {
  const h = $('#zoomhint');
  if (h) h.hidden = !(state.active.size && map.getZoom() < MIN_LOAD_ZOOM);
}
map.on('zoom', zoomHint);
map.on('moveend', () => {
  clearTimeout(moveTimer);
  moveTimer = setTimeout(() => {
    const c = map.getCenter();
    loadVisible();
    loadReports();
    updateHeader();
    if (!state.me && !state.selected) renderList();
  }, 200);
});

// ---------- Kacheln laden ----------
const tileKey = (lat, lon) => `${Math.floor(lat / state.index.tileDeg)}_${Math.floor(lon / state.index.tileDeg)}`;
function keysAround(lat, lon, r = 1) {
  const T = state.index.tileDeg, y = Math.floor(lat / T), x = Math.floor(lon / T), out = [];
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) out.push(`${y + i}_${x + j}`);
  return out;
}
function keysInView() {
  const T = state.index.tileDeg, b = map.getBounds(), out = [];
  for (let y = Math.floor(b.getSouth() / T); y <= Math.floor(b.getNorth() / T); y++)
    for (let x = Math.floor(b.getWest() / T); x <= Math.floor(b.getEast() / T); x++) out.push(`${y}_${x}`);
  return out;
}
let refreshTimer;
async function loadTiles(keys) {
  const todo = [...new Set(keys)].filter((k) => k in state.index.tiles && !state.loaded.has(k) && !state.loading.has(k));
  if (!todo.length) return false;
  todo.forEach((k) => state.loading.add(k));
  await Promise.all(todo.map(async (k) => {
    try {
      const res = await fetch(`data/t/${k}.json`);
      const d = await res.json();
      for (const it of d.items) state.items.push(it);
      for (const p of d.places) state.places.push(p);
      state.loaded.add(k);
    } catch { /* nächster Versuch beim nächsten Verschieben */ }
    state.loading.delete(k);
  }));
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    map.getSource('pois')?.setData(geojson());
    updateHeader();
    if (!state.selected) renderList();
  }, 50);
  return true;
}
function loadVisible() {
  if (!state.index) return;
  if (!state.me && map.getZoom() < MIN_LOAD_ZOOM) return; // Übersicht: erst laden, wenn ein Ort gewählt ist
  const r = refPoint();
  const keys = keysAround(r.lat, r.lon, 1);
  if (map.getZoom() >= MIN_LOAD_ZOOM) keys.push(...keysInView());
  loadTiles(keys);
}

// ---------- Standort ----------
function refPoint() {
  if (state.me) return { ...state.me, mine: true };
  const c = map.getCenter();
  return { lat: c.lat, lon: c.lng, mine: false };
}
function updateHeader() { /* Kopfzeile entfernt – nur noch Kategorien oben */ }
function setMe(pos) {
  const first = !state.me;
  state.me = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy };
  map.getSource('me')?.setData(fc([pointF(state.me.lon, state.me.lat)]));
  $('#btn-locate').classList.add('active');
  loadVisible();
  updateHeader();
  if (!state.selected) renderList(); // erst Layout/Padding festlegen, dann die Karte bewegen
  if (first) { if (state.mapReady) centerOnMe(); else map.once('load', centerOnMe); }
}
/** Karte auf den eigenen Standort (Stadt-Zoom); holt den Zoom nach, falls eine Fahrt abgebrochen wurde. */
function centerOnMe() {
  if (!state.me) return;
  const to = { center: [state.me.lon, state.me.lat], zoom: Math.max(map.getZoom(), 14.5) };
  map.once('moveend', () => { if (map.getZoom() < 13) map.easeTo({ center: [state.me.lon, state.me.lat], zoom: 14.5 }); });
  if (map.getZoom() < MIN_LOAD_ZOOM) map.jumpTo(to); else map.flyTo(to);
}
const LOC_ERR = {
  1: 'Dein Gerät hat den Standort für diesen Browser gesperrt. iPhone: Einstellungen → Apps → Chrome (bzw. Safari) → Standort → „Beim Verwenden der App“; danach hier erneut tippen. Android/PC: Standort für nahfuchs.de in den Website-Einstellungen erlauben.',
  2: 'Standort konnte gerade nicht ermittelt werden. Bitte nochmal versuchen oder die Karte selbst verschieben.',
  3: 'Standort konnte gerade nicht ermittelt werden. Bitte nochmal versuchen oder die Karte selbst verschieben.',
  na: 'Dein Browser kann keinen Standort ermitteln. Bitte schieb die Karte selbst zu deinem Ort.',
};
const overviewCard = () => !state.me && !state.selected && map.getZoom() < MIN_LOAD_ZOOM;
function locFailed(code) {
  state.locating = false;
  state.locError = code;
  if (state.watchId != null) { navigator.geolocation.clearWatch(state.watchId); state.watchId = null; }
  $('#btn-locate').classList.remove('active');
  if (overviewCard()) renderList(); else toast(LOC_ERR[code] || LOC_ERR[2]);
}
function startLocate() {
  if (!('geolocation' in navigator)) { locFailed('na'); return; }
  if (state.watchId != null) {
    centerOnMe();
    return;
  }
  if (state.locating) return;
  state.locating = true;
  state.locError = null;
  if (overviewCard()) renderList();
  // Erst einmalig abfragen (zuverlässiger auf iOS), danach laufend aktualisieren
  navigator.geolocation.getCurrentPosition((pos) => {
    state.locating = false;
    state.locError = null;
    setMe(pos);
    if (state.watchId == null) {
      state.watchId = navigator.geolocation.watchPosition(setMe, (err) => { if (err.code === 1) locFailed(1); }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
    }
  }, (err) => locFailed(err.code), { enableHighAccuracy: true, maximumAge: 60000, timeout: 15000 });
}
$('#btn-locate').addEventListener('click', startLocate);
try {
  navigator.permissions?.query({ name: 'geolocation' }).then((p) => { if (p.state === 'granted') startLocate(); }).catch(() => {});
} catch { /* egal */ }

// ---------- Unteres Blatt (ziehbar) ----------
const sheet = $('#sheet'), body = $('#sheet-body');
const wide = () => innerWidth >= 720;
const sheetMax = () => Math.round(innerHeight * 0.74);

function peekHeight() {
  if (state.selected) {
    const c = body.firstElementChild;
    const safe = parseFloat(getComputedStyle(body).paddingBottom) || 12;
    const max = state.selected.adding ? Math.round(innerHeight * 0.42) : sheetMax(); // beim Eintragen max. knapp halber Bildschirm
    return Math.min(max, Math.round($('#grip').offsetHeight + (c ? c.getBoundingClientRect().height : 120) + safe + 4));
  }
  const rows = body.querySelectorAll('.row');
  const last = rows[Math.min(PEEK_ROWS, rows.length) - 1] || body.lastElementChild;
  if (!last) return 120;
  const bottom = last.getBoundingClientRect().bottom - body.getBoundingClientRect().top + body.scrollTop;
  return Math.min(sheetMax(), Math.round($('#grip').offsetHeight + bottom + (isStaticSheet() ? 2 : 10) + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0)));
}
function setVisible(px) {
  document.documentElement.style.setProperty('--sheet-h', `${px}px`);
}
const isStaticSheet = () => !state.selected && !body.querySelector('.row'); // Hinweis-Karten ohne Liste: nicht hochziehbar
function layoutSheet() {
  const still = isStaticSheet();
  sheet.classList.toggle('static', still);
  if (still) state.mode = 'peek';
  const full = state.mode === 'full' && !state.selected;
  const h = wide() ? sheet.offsetHeight : full ? sheetMax() : peekHeight();
  sheet.classList.toggle('peek', !full && !state.selected);
  document.documentElement.style.setProperty('--sheet-max', `${sheetMax()}px`);
  setVisible(h);
  const pad = { top: Math.round($('.top').offsetHeight + 8), bottom: Math.round(wide() ? 0 : Math.min(h, innerHeight * 0.5)), left: wide() ? 420 : 0, right: 0 };
  const cur = map.getPadding();
  if (cur.top !== pad.top || cur.bottom !== pad.bottom || cur.left !== pad.left) {
    // setPadding würde eine laufende Kamerafahrt abbrechen → erst danach nachziehen
    if (map.isMoving()) { if (!state.padPending) { state.padPending = true; map.once('moveend', () => { state.padPending = false; layoutSheet(); }); } }
    else map.setPadding(pad);
  }
  document.documentElement.style.setProperty('--cross-y', `${Math.round(pad.top + (innerHeight - pad.top - pad.bottom) / 2)}px`);
}
addEventListener('resize', layoutSheet);

let drag = null, suppressClick = false;
sheet.addEventListener('pointerdown', (e) => {
  if (wide() || state.selected?.adding || isStaticSheet()) return; // beim Eintragen bzw. bei Hinweis-Karten nicht ziehen
  const handle = e.target.closest('.grip, .sheet-h, .detail-h');
  const peekAnywhere = state.mode === 'peek' && !e.target.closest('a, button, .go');
  if (!handle && !peekAnywhere) return;
  if (state.mode === 'full' && !handle && body.scrollTop > 0) return;
  const cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sheet-h')) || peekHeight();
  drag = { y0: e.clientY, h0: cur, t0: performance.now(), moved: false, id: e.pointerId };
});
addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dy = e.clientY - drag.y0;
  if (!drag.moved && Math.abs(dy) < 6) return;
  if (!drag.moved) { drag.moved = true; sheet.classList.add('dragging'); document.body.classList.add('dragging'); }
  const h = Math.max(70, Math.min(sheetMax(), drag.h0 - dy));
  setVisible(h);
  drag.h = h;
  drag.v = dy / Math.max(1, performance.now() - drag.t0);
});
addEventListener('pointerup', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null;
  sheet.classList.remove('dragging'); document.body.classList.remove('dragging');
  if (!d.moved) {
    if (e.target.closest('.grip')) toggleSheet();
    return;
  }
  suppressClick = true; setTimeout(() => { suppressClick = false; }, 50);
  const pulledDown = d.h < d.h0;
  if (state.selected) {
    if (d.h0 - d.h > 70) { closeDetail(); return; }
    layoutSheet(); return;
  }
  const peek = peekHeight();
  if (Math.abs(d.v) > 0.5) state.mode = pulledDown ? 'peek' : 'full';
  else state.mode = d.h > (peek + sheetMax()) / 2 ? 'full' : 'peek';
  if (state.mode === 'peek') body.scrollTop = 0;
  layoutSheet();
});
addEventListener('pointercancel', () => { if (drag) { drag = null; sheet.classList.remove('dragging'); document.body.classList.remove('dragging'); layoutSheet(); } });
sheet.addEventListener('click', (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
$('#grip').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') toggleSheet(); });
function toggleSheet() {
  if (state.selected) { closeDetail(); return; }
  if (isStaticSheet()) return;
  state.mode = state.mode === 'full' ? 'peek' : 'full';
  if (state.mode === 'peek') body.scrollTop = 0;
  layoutSheet();
}

function message(msg) {
  state.selected = null;
  body.innerHTML = `<div class="empty">${esc(msg)}</div>`;
  layoutSheet();
}

function rowHtml(it, ref) {
  const cat = CATEGORY_BY_ID[it.c];
  const st = reportChips(it)[0] || statusOf(it);
  const sub = subOf(it);
  return `<div class="row" data-i="${it._i}" role="button" tabindex="0">
    <span class="ic" style="--c:${cat.color};--k:${cat.ink}">${cat.icon}</span>
    <span class="main">
      <div class="name">${esc(titleOf(it))}${it.c === FUEL ? appBadge(it) : ''}</div>
      <div class="meta">${st ? `<span class="st ${st.cls}">${esc(st.text)}</span>` : ''}<span class="sub">${esc(sub)}</span></div>
    </span>
    <span class="dist">${fmtDist(distM(ref, it))}</span>
    <a class="go" data-route="${it._i}" href="${routeUrl(it)}" target="_blank" rel="noopener" aria-label="Route">${ICON_ROUTE}</a>
  </div>`;
}

function providerHint() {
  if (allProviders() || !PARCEL.some((c) => state.active.has(c))) return '';
  const weak = [...state.providers].filter((p) => p !== 'dhl' && PROV[p]?.finder);
  if (!weak.length) return '';
  return `<div class="hint">${esc(weak.map((p) => PROV[p].label).join(', '))}: Shops sind in den Kartendaten nur teilweise erfasst. Offizielle Suche: ${weak.map((p) => `<a href="${PROV[p].finder}" target="_blank" rel="noopener">${esc(PROV[p].label)} ↗</a>`).join(' · ')}</div>`;
}
function cardHint() {
  if (!state.cards.size || !state.active.has(FUEL)) return '';
  return `<div class="hint">Tankstellen mit ${esc([...state.cards].map((c) => CARD[c].label).join(' + '))}: bestätigt oder laut Marke üblich – ohne Gewähr.</div>`;
}
const NOTDIENST_URL = 'https://www.aponet.de/notdienstsuche';
function notdienstHint() {
  if (!state.active.has('apotheke')) return '';
  return `<a class="notdienst" href="${NOTDIENST_URL}" target="_blank" rel="noopener"><b>Welche Apotheke hat jetzt Notdienst?</b><span>Offizielle Notdienstsuche der Apothekerkammern öffnen ↗</span></a>`;
}
const wishLink = () => '<button class="link wish-link" data-wish="1">Fehlt dir was in der App? Sag’s uns</button>';
function renderList() {
  if (!state.index) return;
  const ref = refPoint();
  const box = 0.25;
  const near = [];
  state.items.forEach((it, i) => {
    if (!passes(it) || Math.abs(it.lat - ref.lat) > box || Math.abs(it.lon - ref.lon) > box * 1.5) return;
    it._i = i;
    near.push({ it, d: distM(ref, it) });
  });
  near.sort((a, b) => a.d - b.d);
  const list = near.slice(0, LIST_LIMIT);
  if (!state.me && map.getZoom() < MIN_LOAD_ZOOM) {
    body.innerHTML = `<div class="sheet-h"><h2>Wo suchst du? 🦊</h2></div>
      <button class="btn primary locate-cta" id="use-loc"${state.locating ? ' disabled' : ''}>${state.locating ? 'Standort wird gesucht …' : '📍 Meinen Standort verwenden'}</button>
      ${state.locError ? `<div class="hint loc-err">${esc(LOC_ERR[state.locError] || LOC_ERR[2])}</div>` : ''}
      <div class="empty">Oder schieb die Karte zu deinem Ort und zoom hinein. Dein Standort bleibt auf deinem Gerät und wird nicht gespeichert.</div>`;
    $('#use-loc').addEventListener('click', startLocate);
    layoutSheet();
    return;
  }
  if (!state.active.size) {
    body.innerHTML = '<div class="sheet-h"><h2>Was suchst du?</h2></div><div class="empty">Tippe oben auf eine oder mehrere Kategorien, z. B. Briefkästen oder Container.</div>';
    layoutSheet();
    return;
  }
  const only = state.active.size === 1 ? CATEGORY_BY_ID[[...state.active][0]].plural : [...state.active].every((c) => PARCEL.includes(c)) ? 'Paketstellen' : [...state.active].every(isContainer) ? 'Container' : 'Orte';
  const loadingHere = keysAround(ref.lat, ref.lon, 0).some((k) => state.loading.has(k));
  const empty = loadingHere ? 'Orte werden geladen …' : (tileKey(ref.lat, ref.lon) in state.index.tiles ? 'In der Nähe ist nichts eingetragen.' : 'Dieses Gebiet ist noch nicht in der App (bisher: ' + state.index.regions.join(', ') + ').');
  body.innerHTML = `
    <div class="sheet-h"><h2>Nächste ${esc(only === 'Apotheken-Notdienst' ? 'Apotheken' : only)}</h2><span class="from">${ref.mine ? '' : 'ab Kartenmitte'}</span></div>
    ${notdienstHint()}
    ${list.length ? list.map((x) => rowHtml(x.it, ref)).join('') : `<div class="empty">${esc(empty)}</div>`}
    ${list.length > PEEK_ROWS && state.mode === 'peek' ? '<div class="hint">Nach oben ziehen für mehr</div>' : ''}
    ${providerHint()}
    ${cardHint()}
    ${wishLink()}`;
  layoutSheet();
}
body.addEventListener('click', (e) => {
  if (e.target.closest('.go, a')) return;
  const r = e.target.closest('.row');
  if (r) openDetail(state.items[+r.dataset.i], true);
});

function openDetail(it, fly = false) {
  $('#crosshair').hidden = true;
  state.selected = it;
  it._i = state.items.indexOf(it);
  const cat = CATEGORY_BY_ID[it.c];
  const chips = [...reportChips(it), statusOf(it), ...extraChips(it)].filter(Boolean);
  const ref = refPoint();
  const sub = subOf(it);
  map.getSource('sel')?.setData(fc([pointF(it.lon, it.lat)]));
  const checked = it.t.check_date || it.t['survey:date'];
  body.scrollTop = 0;
  body.innerHTML = `<div class="detail">
    <div class="detail-h">
      <span class="ic" style="--c:${cat.color};--k:${cat.ink}">${cat.icon}</span>
      <div><div class="cat">${esc(fmtDist(distM(ref, it)) + (ref.mine ? '' : ' ab Kartenmitte'))}</div><h2>${esc(titleOf(it))}</h2></div>
      <button class="close" id="close" aria-label="Schließen">${ICON_X}</button>
    </div>
    ${chips.length ? `<div class="status-line">${chips.map((c) => `<span class="st ${c.cls}">${esc(c.text)}</span>`).join('')}</div>` : ''}
    <dl class="facts">${[...factsOf(it), ...reportFacts(it)].map(([k, v, html]) => `<dt>${esc(k)}</dt><dd>${html ? v : esc(v)}</dd>`).join('')}</dl>
    ${fuelHint(it)}
    <div class="actions">
      <a class="btn primary" data-route="${it._i}" href="${routeUrl(it)}" target="_blank" rel="noopener">${ICON_ROUTE}Route</a>
      ${R.enabled() ? (it.src === 'user' && !isConfirmed(it)
        ? `<button class="btn" id="confirm">Gibt es (${confirmCount(it)}/${R.CONFIRM_NEEDED})</button><button class="btn" id="deny">Gibt es nicht</button>`
        : `<button class="btn" id="report-btn">${ICON_FLAG}Melden</button>`)
        : (!it.src ? `<a class="btn" href="${noteUrl(it)}" target="_blank" rel="noopener">${ICON_FLAG}Korrigieren</a>` : '')}
    </div>
    ${state.nav ? `<div class="navpref">Navigation mit ${esc(NAV[state.nav].name)} · <button id="navchange">ändern</button></div>` : ''}
    <div class="src">${sourceLine(it, checked)}</div>
    ${it.src === 'user' || repOf(it) ? `<div class="src"><a href="${esc(dsaMailUrl(it))}">Rechtswidrigen Inhalt melden</a></div>` : ''}
  </div>`;
  $('#close').addEventListener('click', closeDetail);
  $('#navchange')?.addEventListener('click', () => openChooser(null));
  $('#report-btn')?.addEventListener('click', () => openReport(it));
  $('#confirm')?.addEventListener('click', () => submit({ place_id: it.id, category: it.c, kind: 'confirm', lat: it.lat, lon: it.lon }, 'Danke für die Bestätigung!'));
  $('#deny')?.addEventListener('click', () => submit({ place_id: it.id, category: it.c, kind: 'gone', lat: it.lat, lon: it.lon }, 'Danke! Nach zwei solchen Meldungen wird der Ort ausgeblendet.'));
  layoutSheet();
  if (fly) map.easeTo({ center: [it.lon, it.lat], zoom: Math.max(map.getZoom(), 16) });
}
/** Meldeweg nach Art. 16 DSA: vorbefüllte E-Mail mit allen Pflichtangaben (kein Formular, keine Speicherung in der App). */
function dsaMailUrl(it) {
  const lat = it.lat.toFixed(5), lon = it.lon.toFixed(5);
  const body = [
    'Meldung eines rechtswidrigen Inhalts (Art. 16 DSA)', '',
    `Betroffener Ort: ${titleOf(it)} (ID ${it.id})`,
    `Position: ${lat}, ${lon} – https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=19/${lat}/${lon}`, '',
    'Welcher Inhalt ist betroffen (z. B. eingetragener Ort, Zustandsmeldung)?', '', '',
    'Warum ist der Inhalt rechtswidrig? Bitte begründen:', '', '',
    'Dein Name:', 'Deine E-Mail-Adresse:', '',
    'Ich erkläre, dass ich in gutem Glauben davon überzeugt bin, dass die Angaben und Behauptungen in dieser Meldung richtig und vollständig sind.',
  ].join('\n');
  return `mailto:${CONTACT_MAIL}?subject=${encodeURIComponent('Nahfuchs – rechtswidriger Inhalt (Art. 16 DSA)')}&body=${encodeURIComponent(body)}`;
}
function sourceLine(it, checked) {
  const S = state.index?.sources || {};
  const parts = [];
  if (!it.src) parts.push(`<a href="https://www.openstreetmap.org/${{ n: 'node', w: 'way', r: 'relation' }[it.id[0]]}/${it.id.slice(1)}" target="_blank" rel="noopener">OpenStreetMap</a>`);
  if (it.src === 'user') parts.push(`von Nutzern gemeldet · ${isConfirmed(it) ? 'bestätigt' : `noch nicht bestätigt (${confirmCount(it)}/${R.CONFIRM_NEEDED})`}`);
  for (const k of [it.src, it.src2].filter(Boolean)) if (S[k]) parts.push(`<a href="${safeUrl(S[k].url)}" target="_blank" rel="noopener">${esc(S[k].name)}</a> (${esc(S[k].license)})`);
  return `Quelle: ${parts.join(' · ')}${checked ? ` · vor Ort geprüft ${esc(fmtDate(checked))}` : ''}`;
}
function closeDetail() {
  $('#crosshair').hidden = true;
  state.selected = null;
  state.mode = 'peek';
  map.getSource('sel')?.setData(fc([]));
  renderList();
}

// ---------- Navigations-App wählen ----------
let pendingRoute = null;
function openChooser(it) {
  pendingRoute = it;
  $('#chooser').hidden = false;
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-route]');
  if (!a || state.nav) return;
  e.preventDefault();
  openChooser(state.items[+a.dataset.route]);
}, true);
$('#chooser').addEventListener('click', (e) => {
  const b = e.target.closest('[data-nav]');
  if (!b && e.target !== $('#chooser')) return;
  $('#chooser').hidden = true;
  const app = b?.dataset.nav;
  if (!app) { pendingRoute = null; return; }
  state.nav = app;
  store.set('navApp', app);
  if (pendingRoute) {
    const url = NAV[app].url(pendingRoute);
    if (!window.open(url, '_blank')) location.href = url;
  }
  pendingRoute = null;
  if (state.selected?.adding) return;
  if (state.selected) openDetail(state.selected); else renderList();
});

// ---------- Meldungen ----------
state.rep = new Map();
state.repRows = new Map();
state.repFetched = new Map();
const repOf = (it) => state.rep.get(it.id);
const confirmCount = (it) => repOf(it)?.confirm.size || 1;
const isConfirmed = (it) => it.src !== 'user' || confirmCount(it) >= R.CONFIRM_NEEDED;
const STATUS_TEXT = { voll: ['bad', 'Voll'], halb: ['warn', 'Halb voll'], leer: ['ok', 'Platz frei'], sauber: ['ok', 'Sauber'], ok: ['ok', 'In Ordnung'], dreckig: ['bad', 'Dreckig'], defekt: ['bad', 'Defekt'] };

function reportChips(it) {
  const r = repOf(it);
  if (!r) return [];
  const out = [];
  if (r.status) { const [cls, label] = STATUS_TEXT[r.status.value] || ['', r.status.value]; out.push({ cls, text: `${label} · ${R.ago(r.status.at)}` }); }
  if (r.closed) out.push({ cls: 'bad', text: `Geschlossen gemeldet · ${R.ago(r.closed.at)}` });
  if (r.gone.size) out.push({ cls: r.gone.size >= 2 ? 'bad' : 'warn', text: `${r.gone.size}× als verschwunden gemeldet` });
  if (r.hours) out.push({ cls: 'warn', text: `Zeiten evtl. falsch (gemeldet ${R.ago(r.hours.at)})` });
  return out;
}
function reportFacts() { return []; } // Nutzertexte werden bewusst nicht angezeigt

function applyReports() {
  const all = [];
  for (const rows of state.repRows.values()) all.push(...rows);
  all.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  state.rep = R.summarize(all);
  let added = false;
  // Missbrauchsschutz: unbestätigte, von Nutzern eingetragene Orte verschwinden, sobald 2 Geräte „gibt es nicht“ melden
  const userHidden = (r) => r && r.newPlace && r.confirm.size < R.CONFIRM_NEEDED && r.gone.size >= 2;
  const before = state.items.length;
  state.items = state.items.filter((it) => !(it.src === 'user' && userHidden(state.rep.get(it.id))));
  if (state.items.length !== before) { added = true; if (state.selected && !state.items.includes(state.selected)) state.selected = null; }
  for (const [id, r] of state.rep) {
    if (!r.newPlace || userHidden(r) || state.items.some((it) => it.id === id)) continue;
    const n = r.newPlace;
    state.items.push({ id, c: n.category, lat: n.lat, lon: n.lon, t: {}, src: 'user' });
    added = true;
  }
  if (added || all.length) map.getSource('pois')?.setData(geojson());
  if (state.selected?.adding) return;
  if (state.selected) openDetail(state.selected); else renderList();
}

async function loadReports(force = false) {
  if (!R.enabled() || map.getZoom() < 11) return;
  const b = map.getBounds();
  const key = `${b.getSouth().toFixed(1)}_${b.getWest().toFixed(1)}_${b.getNorth().toFixed(1)}_${b.getEast().toFixed(1)}`;
  if (!force && Date.now() - (state.repFetched.get(key) || 0) < 5 * 60000) return;
  state.repFetched.set(key, Date.now());
  try {
    const rows = await R.fetchBox(b.getSouth() - 0.02, b.getWest() - 0.03, b.getNorth() + 0.02, b.getEast() + 0.03);
    for (const r of rows) {
      if (!state.repRows.has(r.place_id)) state.repRows.set(r.place_id, []);
      const list = state.repRows.get(r.place_id);
      if (!list.some((x) => x.created_at === r.created_at && x.device === r.device && x.kind === r.kind)) list.push(r);
    }
    applyReports();
  } catch { /* offline o. ä. */ }
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

async function submit(report, thanks = 'Danke! Deine Meldung ist gespeichert.') {
  try {
    await R.send(report);
    $('#report').hidden = true;
    toast(thanks);
    maybeShowSupport();
    const row = { ...report, device: await R.deviceKey(report.place_id), created_at: new Date().toISOString(), expires_at: null };
    if (report.kind === 'status' && R.STATUS_TTL[report.category]) row.expires_at = new Date(Date.now() + R.STATUS_TTL[report.category]).toISOString();
    if (!state.repRows.has(report.place_id)) state.repRows.set(report.place_id, []);
    state.repRows.get(report.place_id).push(row);
    applyReports();
  } catch (e) {
    toast(e.message);
  }
}

function openReport(it) {
  const grp = R.statusGroup(it.c);
  const base = { place_id: it.id, category: it.c, lat: it.lat, lon: it.lon };
  const timesLabel = it.c === 'briefkasten' ? 'Leerungszeit stimmt nicht' : isContainer(it.c) ? 'Einwurfzeiten stimmen nicht' : 'Öffnungszeiten stimmen nicht';
  $('#report-card').innerHTML = `
    <h2>${esc(titleOf(it))} melden</h2>
    ${grp ? `<div class="sec">Wie sieht es gerade aus?</div><div class="opts">${R.STATUS_OPTIONS[grp].map(([v, l]) => `<button class="btn" data-status="${v}">${esc(l)}</button>`).join('')}</div>` : ''}
    <div class="sec">Etwas stimmt nicht</div>
    <div class="opts">
      <button class="btn" data-kind="hours">${esc(timesLabel)}</button>
      <button class="btn" data-kind="closed">Vorübergehend geschlossen</button>
      <button class="btn" data-kind="gone">Gibt es nicht mehr</button>
    </div>
    <button class="link" data-close>Abbrechen</button>`;
  const card = $('#report-card');
  card.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.close !== undefined) { $('#report').hidden = true; return; }
    if (b.dataset.status) return submit({ ...base, kind: 'status', status: b.dataset.status });
    if (b.dataset.kind) return submit({ ...base, kind: b.dataset.kind });
  };
  $('#report').hidden = false;
}
$('#report').addEventListener('click', (e) => { if (e.target === $('#report')) $('#report').hidden = true; });

// Neuen Ort eintragen: Fadenkreuz in der Kartenmitte
function openAdd() {
  closeDetail();
  $('#crosshair').hidden = false;
  let cat = null;
  body.innerHTML = `<div class="detail">
    <div class="detail-h add-h"><div><div class="cat">Neuen Ort melden</div><h2>Kreuz auf den Ort schieben</h2></div>
      <button class="close" id="add-cancel" aria-label="Abbrechen">${ICON_X}</button></div>
    <div class="add-sec">Was ist dort?</div>
    <div class="cat-pick">${CATEGORIES.map((c) => `<button class="chip" data-cat="${c.id}" aria-pressed="false" style="--c:${c.color};--k:${c.ink}"><span class="ic">${c.icon}</span>${esc(c.label)}</button>`).join('')}</div>
    <div class="add-row"><button class="btn primary" id="add-save">Melden</button></div>
    <div class="src">Erscheint sofort blass und gilt als bestätigt, sobald ${R.CONFIRM_NEEDED} Personen ihn bestätigt haben. Mit dem Melden akzeptierst du die <a href="info.html#nutzung" target="_blank">Nutzungsbedingungen</a>.</div>
  </div>`;
  state.selected = { adding: true };
  body.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
    cat = b.dataset.cat;
    body.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  const end = () => { $('#crosshair').hidden = true; state.selected = null; renderList(); };
  $('#add-cancel').addEventListener('click', end);
  $('#add-save').addEventListener('click', async () => {
    if (!cat) { toast('Bitte zuerst auswählen, was dort ist.'); return; }
    const c = map.getCenter();
    const id = `new:${(crypto.randomUUID?.() || String(Date.now())).replace(/-/g, '').slice(0, 20)}`;
    $('#crosshair').hidden = true;
    state.selected = null;
    await submit({ place_id: id, category: cat, kind: 'new', lat: +c.lat.toFixed(6), lon: +c.lng.toFixed(6) }, 'Danke! Der Ort ist eingetragen und wartet auf Bestätigung.');
    if (isContainer(cat) && state.cont.size) state.cont.add(cat);
    state.active.add(cat);
    store.set('cats', [...state.active]);
    store.set('cont', [...state.cont]);
    renderChips(); renderProviders(); applyFilter();
  });
  layoutSheet();
}
if (R.enabled()) {
  $('#btn-add').hidden = false;
  $('#btn-add').addEventListener('click', openAdd);
}

// ---------- Begrüßung beim ersten Start ----------
async function shareApp() {
  const url = location.origin + location.pathname;
  const data = { title: 'Nahfuchs', text: 'Briefkästen, Paketshops, Container, Toiletten & mehr um die Ecke – kostenlos:', url };
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(url);
    toast('Link kopiert – danke fürs Weiterempfehlen!');
  } catch { /* abgebrochen */ }
}
// Drei kurze Schritte beim ersten Start (zum Ansehen: ?willkommen)
(function onboarding() {
  const box = $('#welcome'), slides = [...box.querySelectorAll('.ob-slide')], dots = [...box.querySelectorAll('.ob-dots span')];
  const next = $('#ob-next'); let i = 0;
  const show = (n) => {
    i = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach((s, k) => { s.hidden = k !== i; });
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
    const last = i === slides.length - 1;
    next.textContent = last ? 'Los geht’s' : 'Weiter';
    $('#ob-skip').style.visibility = last ? 'hidden' : '';
  };
  const done = () => { box.hidden = true; store.set('welcomed', true); };
  next.addEventListener('click', () => (i === slides.length - 1 ? done() : show(i + 1)));
  $('#ob-skip').addEventListener('click', done);
  let x0 = null;
  box.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', (e) => {
    if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1));
  });
  if (!store.get('welcomed', false) || new URLSearchParams(location.search).has('willkommen')) { show(0); box.hidden = false; }
})();
$('#welcome-share').addEventListener('click', shareApp);

// ---------- Freiwillige Unterstützung ----------
// Ohne Zähler und ohne Nutzungsprofil: Der Hinweis erscheint höchstens einmal pro App-Sitzung nach einer
// erfolgreichen Meldung. Gespeichert wird nur, wenn jemand selbst „Nicht mehr anzeigen“ wählt.
let supportShown = false;
function maybeShowSupport(force = false) {
  if (!force && (supportShown || store.get('supportHidden', false))) return;
  supportShown = true;
  setTimeout(() => {
    if (!force && document.querySelector('.chooser:not([hidden])')) return; // nicht über andere Fenster legen
    $('#support').hidden = false;
  }, force ? 300 : 1800);
}
$('#support-go').addEventListener('click', () => { $('#support').hidden = true; });
$('#support-share').addEventListener('click', () => { $('#support').hidden = true; shareApp(); });
$('#support-later').addEventListener('click', () => { $('#support').hidden = true; });
$('#support-never').addEventListener('click', () => { store.set('supportHidden', true); $('#support').hidden = true; });
if (new URLSearchParams(location.search).has('unterstuetzen')) maybeShowSupport(true);
// Alte, nicht mehr verwendete Einträge früherer Versionen entfernen
try { ['firstSeen', 'useDays', 'support'].forEach((k) => localStorage.removeItem(k)); } catch { /* egal */ }

// ---------- Wünsche & Rückmeldungen ----------
// Kein Pop-up: Das Fenster öffnet sich nur, wenn jemand selbst auf „Fehlt was?“ (Ende der Kategorie-Leiste oder Ende der Liste) tippt.
// Gesendet werden nur die angetippten Punkte (feste Liste) – ohne Geräte-ID, ohne Freitext.
const WISH_CATS = [
  ['aed', 'Defibrillatoren (AED)'], ['trinkwasser', 'Trinkbrunnen'], ['buecher', 'Bücherschränke'],
  ['fahrrad', 'Fahrrad-Reparatur'], ['wickeln', 'Wickeltische'], ['spielplatz', 'Spielplätze'],
  ['hundekot', 'Hundekotbeutel'], ['wohnmobil', 'Wohnmobil-Stellplätze'],
];
const WISH_FB = [
  ['ort_fehlt', 'Ein Ort fehlt'], ['daten_falsch', 'Angaben stimmen oft nicht'], ['langsam', 'Karte lädt langsam'],
  ['standort', 'Standort klappt nicht'], ['bedienung', 'Bedienung umständlich'], ['gefaellt', 'Gefällt mir 👍'],
];
const wishBtns = (list) => list.map(([id, label]) => `<button class="wchip" data-w="${id}" aria-pressed="false">${esc(label)}</button>`).join('');
$('#wish-cats').innerHTML = wishBtns(WISH_CATS);
$('#wish-fb').innerHTML = wishBtns(WISH_FB);
$('#wish-mail').href = 'mailto:' + ['andreas.dauns.apps', 'gmail.com'].join('@') + '?subject=' + encodeURIComponent('Nahfuchs-Idee');
let wishSent = false;
function openWish() {
  $('#wish').querySelectorAll('.wchip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  $('#wish-send').disabled = true;
  $('#wish-send').textContent = wishSent ? 'Danke, schon gesendet!' : 'Abschicken';
  $('#wish').hidden = false;
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-wish]')) openWish(); });
$('#wish').addEventListener('click', (e) => {
  const b = e.target.closest('.wchip');
  if (b) {
    b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    $('#wish-send').disabled = wishSent || !$('#wish').querySelector('.wchip[aria-pressed="true"]');
  } else if (e.target === $('#wish')) $('#wish').hidden = true;
});
$('#wish-close').addEventListener('click', () => { $('#wish').hidden = true; });
$('#wish-send').addEventListener('click', async () => {
  const picked = [...$('#wish').querySelectorAll('.wchip[aria-pressed="true"]')].map((b) => b.dataset.w);
  if (!picked.length || wishSent) return;
  $('#wish-send').disabled = true;
  try {
    await R.sendWishes(picked);
    wishSent = true;
    $('#wish').hidden = true;
    toast(picked.includes('ort_fehlt') ? 'Danke! Tipp: Fehlende Orte kannst du selbst mit dem + Knopf eintragen.' : 'Danke für deine Rückmeldung!');
  } catch (err) {
    $('#wish-send').disabled = false;
    toast(err.message);
  }
});

// ---------- Start ----------
async function init() {
  renderChips();
  renderProviders();
  try {
    const res = await fetch('data/index.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    state.index = await res.json();
    const extra = Object.entries(state.index.sources || {}).filter(([k]) => k !== 'osm')
      .map(([, v]) => `<a href="${safeUrl(v.url)}" target="_blank" rel="noopener">${esc(v.name)}</a> (${esc(v.license)})`);
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '<a href="info.html">Impressum · Datenschutz · Nutzung</a>' + (extra.length ? ' · Weitere Daten: ' + extra.join(', ') : '') }), 'bottom-left');
    // Ausführliche Quellenangabe von Anfang an eingeklappt (sonst blitzt der große Kasten beim Start auf).
    // Die Kurzform „© OpenStreetMap“ + Impressum bleibt dauerhaft sichtbar (OSMF Attribution Guidelines).
    const attrib = document.querySelector('.maplibregl-ctrl-attrib');
    attrib?.classList.remove('maplibregl-compact-show');
    attrib?.removeAttribute('open');
    map.addControl({
      onAdd() {
        const el = document.createElement('div');
        el.className = 'maplibregl-ctrl mini-attrib';
        el.innerHTML = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> · <a href="info.html#impressum">Impressum</a>';
        return el;
      },
      onRemove() {},
    }, 'bottom-left');
    const g = new Date(state.index.generated);
    body.innerHTML = '<div class="empty">Orte werden geladen …</div>';
    layoutSheet();
    const go = () => { loadVisible(); if (!state.me && !state.selected) renderList(); };
    if (state.mapReady) go(); else map.once('load', go);
  } catch {
    message('Die Ortsdaten werden gerade erstellt. Schau in ein paar Minuten nochmal rein.');
  }
}
init();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
