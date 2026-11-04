// Gemeinsame Kategorie-Definitionen für Daten-Skript (Node) und App (Browser).

const svg = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const txt = (t, size = 11) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text x="12" y="12" dy="0.36em" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${size}" fill="currentColor">${t}</text></svg>`;

export const CATEGORIES = [
  {
    id: 'briefkasten', label: 'Briefkasten', plural: 'Briefkästen',
    color: '#F2C200', ink: '#3A2E00',
    icon: svg('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>'),
  },
  {
    id: 'glas', label: 'Glascontainer', plural: 'Glascontainer',
    color: '#2F8F4E', ink: '#FFFFFF',
    icon: svg('<path d="M10 2.5h4M10.5 2.5v4.2c0 .8-.4 1.5-1 2-1 .8-1.5 1.8-1.5 3V20a1.5 1.5 0 0 0 1.5 1.5h5A1.5 1.5 0 0 0 16 20v-8.3c0-1.2-.5-2.2-1.5-3-.6-.5-1-1.2-1-2V2.5"/><path d="M8 14h8"/>'),
  },
  {
    id: 'papier', label: 'Papiercontainer', plural: 'Papiercontainer',
    color: '#2B6CB0', ink: '#FFFFFF',
    icon: svg('<path d="M6 2.5h8l4 4V21.5H6z"/><path d="M14 2.5v4h4M9 11h6M9 14.5h6M9 18h4"/>'),
  },
  {
    id: 'altkleider', label: 'Altkleider', plural: 'Altkleidercontainer',
    color: '#7C4DDB', ink: '#FFFFFF',
    icon: svg('<path d="M8.5 3L3 6.5l2.2 3.8L7 9.4V21h10V9.4l1.8.9L21 6.5 15.5 3c-.6 1.5-1.9 2.5-3.5 2.5S9.1 4.5 8.5 3z"/>'),
  },
  {
    id: 'wertstoffhof', label: 'Wertstoffhof', plural: 'Wertstoffhöfe',
    color: '#5E7F1A', ink: '#FFFFFF',
    icon: svg('<path d="M5 20c0-8.5 5.5-14.5 15-15.5-.8 10-6.5 15.5-15 15.5z"/><path d="M5 20l8.5-8.5"/>'),
  },
  {
    id: 'toilette', label: 'Toilette', plural: 'Öffentliche Toiletten',
    color: '#0A8FA6', ink: '#FFFFFF',
    icon: txt('WC', 10),
  },
  {
    id: 'rastplatz', label: 'Raststätte / Rastplatz', plural: 'Raststätten & Rastplätze',
    color: '#1E3A8A', ink: '#FFFFFF',
    icon: txt('P', 15),
  },
  {
    id: 'parkride', label: 'Park & Ride', plural: 'Park & Ride',
    color: '#00796B', ink: '#FFFFFF',
    icon: txt('P+R', 8),
  },
  {
    id: 'wanderpark', label: 'Wanderparkplatz', plural: 'Wanderparkplätze',
    color: '#33691E', ink: '#FFFFFF',
    icon: svg('<circle cx="13" cy="4.5" r="2"/><path d="M10 21l2.5-7 3 3V21M8.5 12.5l1.5-4 3-1.5 2.5 3 2.5 1M12 13l-1.5-4.5M6 21l2-5"/>'),
  },
  {
    id: 'tankstelle', label: 'Tankstelle', plural: 'Tankstellen',
    color: '#0B5D6E', ink: '#FFFFFF',
    icon: svg('<path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3h6A1.5 1.5 0 0 1 14 4.5V21M3.5 21h12M5 10h9"/><path d="M14 12.5h1.5A1.5 1.5 0 0 1 17 14v3a1.5 1.5 0 0 0 3 0V8.5L17.5 6"/>'),
  },
  {
    id: 'paketshop', label: 'Postfiliale / Paketshop', plural: 'Filialen & Paketshops',
    color: '#C0267A', ink: '#FFFFFF',
    icon: svg('<path d="M3.5 9.5L5 4h14l1.5 5.5"/><path d="M3.5 9.5c0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5c0 1.4 1.1 2.5 2.5 2.5h2c1.4 0 2.5-1.1 2.5-2.5 0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5"/><path d="M5 12v8.5h14V12M10 20.5v-5h4v5"/>'),
  },
  {
    id: 'packstation', label: 'Paketstation', plural: 'Paketstationen',
    color: '#D7263D', ink: '#FFFFFF',
    icon: svg('<path d="M12 2.5l8.5 4.5v10L12 21.5 3.5 17V7z"/><path d="M3.5 7L12 11.5 20.5 7M12 11.5v10"/>'),
  },
  {
    id: 'geldautomat', label: 'Geldautomat', plural: 'Geldautomaten',
    color: '#8A4B12', ink: '#FFFFFF',
    icon: txt('€', 15),
  },
  {
    id: 'apotheke', label: 'Apotheke', plural: 'Apotheken',
    color: '#C62828', ink: '#FFFFFF',
    icon: svg('<path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z"/>'),
  },
  {
    id: 'ladesaeule', label: 'Ladesäule', plural: 'Ladesäulen',
    color: '#E0590B', ink: '#FFFFFF',
    icon: svg('<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>'),
  },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

const yes = (v) => v === 'yes' || v === 'true';

// Ordnet ein OSM-Objekt (Tags) den App-Kategorien zu. Ein Container kann mehrere haben.
export function classify(tags = {}) {
  const out = [];
  const a = tags.amenity;
  const noAccess = ['private', 'no'].includes(tags.access);
  if (a === 'post_box') out.push('briefkasten');
  if (a === 'recycling' && !noAccess) {
    if (yes(tags['recycling:glass_bottles']) || yes(tags['recycling:glass'])) out.push('glas');
    if (yes(tags['recycling:paper']) || yes(tags['recycling:cardboard']) || yes(tags['recycling:newspaper'])) out.push('papier');
    if (yes(tags['recycling:clothes']) || yes(tags['recycling:shoes'])) out.push('altkleider');
  }
  // Nur echte Wertstoffhöfe (Annahme von Grünschnitt, Sperrmüll, Bioabfall usw.) und Abfall-Annahmestellen –
  // keine einzelnen Grünschnitt-Container
  if (!noAccess && ((a === 'recycling' && tags.recycling_type === 'centre') || a === 'waste_transfer_station')) out.push('wertstoffhof');
  if (a === 'toilets' && !noAccess) out.push('toilette');
  if (tags.highway === 'rest_area' || tags.highway === 'services') out.push('rastplatz');
  // Parken: nur öffentlich nutzbare Parkplätze – keine privaten, Kunden-, Anwohner- oder Firmenparkplätze,
  // keine Parkstreifen am Straßenrand, Carports oder Garagenhöfe
  const closedAccess = /^(private|no|customers|delivery|permit|residents|employees|destination|agricultural|forestry|military|discouraged)$/;
  const smallKind = /^(street_side|lane|on_kerb|half_on_kerb|carports|garage_boxes|garages|layby|sheds)$/;
  if ((a === 'parking' || a === 'car_pooling') && !closedAccess.test(tags.access || '') && !smallKind.test(tags.parking || '') && tags.highway !== 'rest_area' && tags.highway !== 'services') {
    // Park & Ride schließt Mitfahrer-/Pendlerparkplätze ein
    if (a === 'car_pooling' || tags.park_ride === 'hov' || tags.carpool === 'designated' || (tags.park_ride && tags.park_ride !== 'no')) out.push('parkride');
    else if (yes(tags.hiking) || /wanderpark/i.test(tags.name || '')) out.push('wanderpark');
    // normale Parkplätze bewusst nicht (Entscheidung Andreas 4.11.: zu viele, unübersichtlich)
  }
  const locker = a === 'parcel_locker' || (a === 'vending_machine' && /parcel/.test(tags.vending || ''));
  if (locker) out.push('packstation');
  else if (a === 'post_office' || /^(post_partner|post_annex|bureau|yes)$/.test(tags.post_office || tags['post_office:type'] || '')
    || /paket ?-?shop|hermes paket|pickup paket/i.test(tags.name || '')) out.push('paketshop');
  if (a === 'atm' || (a === 'bank' && tags.atm !== 'no')) out.push('geldautomat');
  if (a === 'charging_station' && !noAccess) out.push('ladesaeule');
  // Öffentliche Tankstellen – keine Werks-/Betriebstankstellen (access=private/no) und keine reinen Bootstankstellen
  if (a === 'fuel' && !noAccess && !(tags.boat === 'yes' && tags.motorcar === 'no')) out.push('tankstelle');
  if ((a === 'pharmacy' || tags.healthcare === 'pharmacy') && !noAccess && tags.dispensing !== 'no') out.push('apotheke');
  return out;
}

// ---------- Paketdienste ----------
export const PROVIDERS = [
  { id: 'dhl', label: 'DHL / Post', re: /deutsche ?post|\bdhl\b|dhl[ -]|packstation|poststation|postfiliale|dpag/i, finder: 'https://www.dhl.de/de/privatkunden/dhl-standorte-finden.html' },
  { id: 'hermes', label: 'Hermes', re: /hermes|hemes/i, finder: 'https://www.myhermes.de/paketshopfinder/' },
  { id: 'dpd', label: 'DPD', re: /\bdpd|geopost|pickup/i, finder: 'https://www.dpd.com/de/de/pickup-paketshops/' },
  { id: 'gls', label: 'GLS', re: /\bgls\b|general logistics/i, not: /gls ?(gemeinschafts)?bank/i, finder: 'https://gls-pakete.de/' },
  { id: 'ups', label: 'UPS', re: /\bups\b|united parcel/i, finder: 'https://www.ups.com/dropoff/?loc=de_DE' },
  { id: 'amazon', label: 'Amazon', re: /amazon/i },
  { id: 'fedex', label: 'FedEx', re: /fed ?ex|\btnt\b/i },
  { id: 'myflexbox', label: 'myflexbox', re: /flex ?box|deinfach/i },
  { id: 'andere', label: 'Andere', re: /citipost|bw ?post|biber ?post|lvz ?post|\bpin\b|nordbrief|inpost|vinted|inboxx|mail boxes/i },
];

/** Art (filiale | paketshop | station | poststation), Anbieter-Liste und Abgabe-Möglichkeit eines Paket-Orts. */
export function parcelInfo(tags = {}) {
  const fields = ['brand', 'operator', 'name', 'post_office:brand', 'post_office:service_provider', 'parcel_locker:service_provider',
    'post_office:parcel_from', 'post_office:parcel_pickup', 'post_office:parcel_to'];
  const txt = fields.map((k) => tags[k]).filter((v) => v && !/^(yes|no)$/i.test(v)).join(';');
  let pv = PROVIDERS.filter((p) => p.re.test(txt) && !(p.not && p.not.test(txt))).map((p) => p.id);
  const locker = tags.amenity === 'parcel_locker' || tags.amenity === 'vending_machine';
  let kind;
  if (locker) kind = /poststation/i.test(txt) ? 'poststation' : 'station';
  else if (/^(bureau|post_annex)$/.test(tags.post_office || '') || tags['ref:deutsche_post']) kind = 'filiale';
  else if (/paket ?-?shop|hermes|dpd|gls|ups|pickup/i.test(txt) && !/deutsche ?post|postfiliale/i.test(txt)) kind = 'paketshop';
  else if (tags.amenity === 'post_office' || /deutsche ?post/i.test(txt) || tags['post_office:letter_from'] || tags['post_office:stamps']) kind = 'filiale';
  else kind = 'paketshop';
  if (/flex ?box/i.test(txt) && pv.length <= 1) pv = [...new Set([...pv, 'myflexbox', 'dpd', 'gls', 'ups', 'fedex'])];
  if (/deinfach/i.test(txt)) pv = [...new Set([...pv, 'dhl', 'ups'])];
  if ((kind === 'filiale' || kind === 'poststation') && !pv.length) pv = ['dhl'];
  if (!pv.length) pv = locker && /packstation/i.test(txt) ? ['dhl'] : ['andere'];
  let send = null;
  const mi = tags.parcel_mail_in;
  if (mi === 'yes') send = 'yes'; else if (mi === 'returns_only') send = 'returns'; else if (mi === 'no') send = 'no';
  else if (tags['post_office:parcel_from']) send = tags['post_office:parcel_from'] === 'no' ? 'no' : 'yes';
  else if (pv.includes('amazon') && locker) send = 'no';
  else send = 'yes';
  return { kind, pv, send };
}

// ---------- Tankstellen: Marken und Tankkarten ----------
// Nur Text, keine Logos und keine Markenfarben (beschreibende Nennung, § 23 MarkenG).
// Erkennung in der Reihenfolge brand → operator → name. Mehrere Einträge dürfen dieselbe id haben.
export const FUEL_BRANDS = [
  { id: 'aral', label: 'Aral', re: /\baral\b/i },
  { id: 'shell', label: 'Shell', re: /\bshell\b/i },
  { id: 'esso', label: 'Esso', re: /\besso\b/i },
  { id: 'total', label: 'TotalEnergies', re: /total ?energies|\btotal\b/i },
  { id: 'total', label: 'Circle K', re: /circle ?k\b/i }, // Circle K betreibt seit 2024 die TotalEnergies-Stationen in DE
  { id: 'jet', label: 'JET', re: /\bjet\b/i },
  { id: 'avia', label: 'AVIA', re: /\bavia\b/i },
  { id: 'star', label: 'Star', re: /^star\b|\bstar tankstelle|\borlen\b/i },
  { id: 'eni', label: 'Eni', re: /\beni\b|enilive|\bagip\b/i },
  { id: 'hem', label: 'HEM', re: /\bhem\b|tamoil/i },
  { id: 'westfalen', label: 'Westfalen', re: /\bwestfalen\b/i },
  { id: 'raiffeisen', label: 'Raiffeisen', re: /raiffeisen|\brwg\b/i },
  { id: 'baywa', label: 'BayWa', re: /\bbaywa\b/i },
  { id: 'bft', label: 'bft', re: /\bbft\b/i },
  { id: 'oil', label: 'OIL!', re: /\boil!|^oil\b/i },
  { id: 'hoyer', label: 'Hoyer', re: /\bhoyer\b/i },
  { id: 'q1', label: 'Q1', re: /\bq1\b/i },
  { id: 'classic', label: 'Classic', re: /\bclassic\b/i },
  { id: 'sprint', label: 'Sprint', re: /^sprint\b|\bsprint tankstelle/i },
  { id: 'team', label: 'team', re: /^team\b|\bteam energie|\bteam tankstelle/i },
  { id: 'markant', label: 'Markant', re: /\bmarkant\b/i },
  { id: 'calpam', label: 'Calpam', re: /\bcalpam\b/i },
  { id: 'ed', label: 'ED', re: /^ed( tankstelle)?$/i },
  { id: 'tankpool24', label: 'tankpool24', re: /tank ?pool ?24/i },
];

/** Marke einer Tankstelle: {id, label} oder null. */
export function fuelBrand(tags = {}) {
  for (const k of ['brand', 'operator', 'name']) {
    const v = tags[k];
    if (!v) continue;
    const b = FUEL_BRANDS.find((x) => x.re.test(v));
    if (b) return b;
  }
  return null;
}

// Die sechs Tankkarten im Filter (Reihenfolge = Reihenfolge der Chips).
// osm: payment:<key>-Schlüssel in OpenStreetMap inkl. üblicher Schreibvarianten (taginfo Geofabrik DE, abgefragt 2.11.2026).
// finder: offizielle Akzeptanzsuche des Anbieters (nur verlinkt, nicht übernommen).
export const CARDS = [
  { id: 'dkv', label: 'DKV', osm: ['dkv', 'dkv_card'], finder: 'https://my.dkv-mobility.com/maps/' },
  { id: 'uta', label: 'UTA', osm: ['uta', 'uta_card'], finder: 'https://web.uta.com/en/search' },
  { id: 'aral', label: 'Aral / Routex', osm: ['routex', 'aral_card', 'aral_cardkomfort', 'aral_plus', 'bp_komfort'], finder: 'https://www.routex.com', finderLabel: 'Routex' },
  { id: 'shell', label: 'Shell', osm: ['euroshell', 'shell', 'shell_card'] }, // nicht shell_clubsmart (Bonusprogramm)
  { id: 'logpay', label: 'LogPay', osm: ['logpay'] },
  { id: 'esso', label: 'Esso', osm: ['esso_card', 'esso'] },
];

// Stufe „laut Marke üblich“: dokumentierte Marken-Partnerschaften der Kartenanbieter.
// 1 = Karte an dieser Marke üblich, 'app' = nur digital per App (nicht mit der Plastikkarte).
// Keine Gewähr: einzelne Pächter/Autohöfe können abweichen. Etwa jährlich die Pressemitteilungen prüfen.
export const CARD_RULES = {
  dkv: {
    aral: 1,          // firmenauto 11/2018: „beinahe jede Aral-Tankstelle“ – https://www.firmenauto.de/branche/dkv-erweitert-servicenetz-150-neue-aral-stationen-im-netz/
    shell: 1,         // firmenauto 12/2025 (Partnerschaft erweitert) – https://www.firmenauto.de/who-is-who/tankkarten/tankkarten-dkv/
    tankpool24: 1,    // firmenauto 12/2025 / Eurowag 9/2021: tankpool24 nimmt DKV
    jet: 'app',       // VerkehrsRundschau 6/2024: alle JET-Stationen, aber nur per DKV App&Go – https://www.verkehrsrundschau.de/nachrichten/transport-logistik/article-3524339
    classic: 'app',   // VerkehrsRundschau 8/2024: 160 Classic-Stationen per App&Go – https://www.verkehrsrundschau.de/nachrichten/transport-logistik/dkv-mobility-erweitert-akzeptanznetzwerk-um-160-classic-tankstellen-3549402
    // Esso, TotalEnergies, AVIA, Star, Eni: sehr wahrscheinlich, aber ohne Primärquelle → bewusst „unbekannt“
  },
  uta: {
    // UTA-Flyer „Economy-Netz“ 12/2025 – https://web.uta.com/fileadmin/user_upload/pdf-files/uta-economy-flyer.pdf
    aral: 1, total: 1, esso: 1, avia: 1, jet: 1, star: 1, eni: 1, hem: 1, bft: 1, raiffeisen: 1, oil: 1,
    westfalen: 1, hoyer: 1, q1: 1, ed: 1, baywa: 1, classic: 1, sprint: 1, team: 1, calpam: 1, markant: 1,
    shell: 1,         // UTA-PM 17.9.2025: alle Shell-Stationen in DE seit 1.9.2025 – https://web.uta.com/en/press-releases/uta-edenred-adds-all-shell-service-stations-in-germany-to-its-acceptance-network
  },
  aral: {
    aral: 1,          // eigene Marke – https://www.aral.de/de/global/fleet_solutions.html
    eni: 1,           // ROUTEX-Partner (Enilive) – https://www.routex.com
    total: 1,         // gegenseitige Akzeptanz Aral/TotalEnergies seit 2018 – https://www.auto-medienportal.net/artikel/detail/43235 (Stand nach Übernahme durch Circle K offen)
    avia: 1,          // VerkehrsRundschau 3/2024: Aral-Karten an AVIA seit Q3 2024 – https://www.verkehrsrundschau.de/nachrichten/transport-logistik/avia-und-aral-kooperieren-bei-tankkarten-3497808
  },
  shell: {
    shell: 1,         // eigene Marke
    star: 1,          // mobilityplaza 7/2022: 570 ORLEN/star-Stationen – https://www.mobilityplaza.com/news/shell-expands-card-services-through-orlen-station-network-in-germany
  },
  logpay: {
    aral: 1,          // VerkehrsRundschau 2018: LogPay an über 2.000 Aral-Stationen – https://www.verkehrsrundschau.de/nachrichten/nfz-fuhrpark/logpay-vereinbart-tankkartenakzeptanz-mit-bp-aral-2985025
    esso: 1,          // Meldung „Esso accepts LogPay fuel cards“; Marktübersicht sprit+ 9/2022 – https://www.sprit-plus.de/downloadfile/3270152/Sprit%20_Ladekarten.pdf
    // Shell, HEM, AVIA u. a. nur per Bezahl-App (sprit+ Pay-at-pump) → nicht als Kartenannahme gewertet
  },
  esso: {
    esso: 1,          // eigene Marke – https://www.essocard.com/de-de/ (abgerufen 11/2026)
    shell: 1,         // essocard.com: Esso-Karten werden an Shell-Stationen angenommen
  },
};

/**
 * Kartenannahme je Tankstelle.
 * Stufen: ok = bestätigt (OSM payment:*=yes) · no = nicht akzeptiert (payment:*=no) · likely = laut Marke üblich · unk = unbekannt.
 * app = laut Anbieter nur per App (z. B. DKV bei JET/Classic).
 * @returns {{brand: {id,label}|null, cards: Object<string,{lv:string, app:boolean}>}}
 */
export function fuelInfo(tags = {}) {
  const brand = fuelBrand(tags);
  const cards = {};
  for (const c of CARDS) {
    const vals = c.osm.map((k) => tags[`payment:${k}`]).filter(Boolean);
    const rule = brand ? CARD_RULES[c.id]?.[brand.id] : undefined;
    let lv = 'unk';
    if (vals.some((v) => v === 'yes')) lv = 'ok';
    else if (vals.some((v) => v === 'no')) lv = 'no';
    else if (rule) lv = 'likely';
    cards[c.id] = { lv, app: rule === 'app' && lv !== 'no' };
  }
  return { brand, cards };
}
/** Karten, mit denen die Tankstelle den Filter besteht (bestätigt oder laut Marke üblich). */
export const fuelCardsPassing = (info) => CARDS.filter((c) => ['ok', 'likely'].includes(info.cards[c.id].lv)).map((c) => c.id);

// Tags, die in die App übernommen werden (der Rest wird verworfen, um die Datei klein zu halten).
const KEEP_BASE = /^(name|operator|brand|ref|collection_times|opening_hours|fee|charge|wheelchair|changing_table|centralkey|access|check_date.*|survey:date|capacity|recycling_type|recycling:.*|toilets.*|drive_through|description|level|addr:.*|amenity|highway|vending|socket:.*|motorcar|cash_in|indoor|unisex|male|female|post_box:type|parcel_mail_in|parcel_pickup|website|phone|contact:phone|healthcare|dispensing|atm|ref:.*|post_office.*|parcel_locker:.*|payment|autobahn:.*|parking|park_ride|maxstay|capacity:.*|hiking|supervised|carpool|maxheight)$/;
// Nur bei Tankstellen: angezeigte Kraftstoffe, Tankkarten und Ausstattung
const KEEP_FUEL = new RegExp(`^(fuel:(diesel|octane_95|e5|e10|octane_98|octane_100|octane_102|lpg|cng|lng|biogas|adblue|HGV_diesel|hgv_diesel|hvo|HVO|hvo100|HVO100|e85|h70|h35|hydrogen)|payment:(${CARDS.flatMap((c) => c.osm).join('|')})|car_wash|shop|compressed_air|hgv|automated)$`);
export const KEEP_TAG = (k, cats) => KEEP_BASE.test(k) || (Boolean(cats?.includes('tankstelle')) && KEEP_FUEL.test(k));
