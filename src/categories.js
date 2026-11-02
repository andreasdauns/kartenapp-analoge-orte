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
    id: 'wertstoffhof', label: 'Wertstoffhof', plural: 'Wertstoffhöfe & Grünschnitt',
    color: '#5E7F1A', ink: '#FFFFFF',
    icon: svg('<path d="M5 20c0-8.5 5.5-14.5 15-15.5-.8 10-6.5 15.5-15 15.5z"/><path d="M5 20l8.5-8.5"/>'),
  },
  {
    id: 'toilette', label: 'Toilette', plural: 'Öffentliche Toiletten',
    color: '#0A8FA6', ink: '#FFFFFF',
    icon: txt('WC', 10),
  },
  {
    id: 'rastplatz', label: 'Rastplatz', plural: 'Rastplätze (Autobahn)',
    color: '#1E3A8A', ink: '#FFFFFF',
    icon: txt('P', 15),
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
    id: 'geldautomat', label: 'ATM', plural: 'ATMs',
    color: '#8A4B12', ink: '#FFFFFF',
    icon: txt('€', 15),
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
  // Wertstoffhöfe, Grünschnitt-/Kompostannahme, Umladestationen mit Bürgerannahme
  const green = yes(tags['recycling:green_waste']) || yes(tags['recycling:garden_waste']);
  if (!noAccess && ((a === 'recycling' && (tags.recycling_type === 'centre' || green)) || a === 'waste_transfer_station')) out.push('wertstoffhof');
  if (a === 'toilets' && !noAccess) out.push('toilette');
  if (tags.highway === 'rest_area' || tags.highway === 'services') out.push('rastplatz');
  const locker = a === 'parcel_locker' || (a === 'vending_machine' && /parcel/.test(tags.vending || ''));
  if (locker) out.push('packstation');
  else if (a === 'post_office' || /^(post_partner|post_annex|bureau|yes)$/.test(tags.post_office || tags['post_office:type'] || '')
    || /paket ?-?shop|hermes paket|pickup paket/i.test(tags.name || '')) out.push('paketshop');
  if (a === 'atm' || (a === 'bank' && tags.atm !== 'no')) out.push('geldautomat');
  if (a === 'charging_station' && !noAccess) out.push('ladesaeule');
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

// Tags, die in die App übernommen werden (der Rest wird verworfen, um die Datei klein zu halten).
export const KEEP_TAG = (k) =>
  /^(name|operator|brand|ref|collection_times|opening_hours|fee|charge|wheelchair|changing_table|centralkey|access|check_date.*|survey:date|capacity|recycling_type|recycling:.*|toilets.*|drive_through|description|level|addr:.*|amenity|highway|vending|socket:.*|motorcar|cash_in|indoor|unisex|male|female|post_box:type|parcel_mail_in|parcel_pickup|website|atm|ref:.*|post_office.*|parcel_locker:.*|payment|autobahn:.*)$/.test(k);
