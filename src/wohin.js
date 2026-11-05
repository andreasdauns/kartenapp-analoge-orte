// „Wohin damit?“ – vom Gegenstand zur richtigen Abgabestelle.
// Orte nur laut OpenStreetMap (ohne Gewähr); Regeln allgemein formuliert, mit Quelle und Stand.
// Wir schreiben keinem einzelnen Geschäft eine Rücknahmepflicht zu.

// recycling:*-Merkmale, die eine „Sammelstelle“ ausmachen (Batterien, Elektro, Lampen …)
export const SAMMEL_FLAGS = [
  'batteries', 'small_electrical_appliances', 'small_appliances', 'electrical_appliances', 'electrical_items',
  'electronics', 'computers', 'mobile_phones', 'low_energy_bulbs', 'fluorescent_tubes', 'light_bulbs',
  'printer_cartridges', 'printer_toner_cartridges', 'cork', 'cooking_oil', 'engine_oil', 'green_waste', 'garden_waste',
  'hazardous_waste', 'paint',
];

export const FLAG_LABEL = {
  batteries: 'Batterien', small_electrical_appliances: 'Elektro-Kleingeräte', small_appliances: 'Elektro-Kleingeräte',
  electrical_appliances: 'Elektrogeräte', electrical_items: 'Elektrogeräte', electronics: 'Elektrogeräte', computers: 'Computer',
  mobile_phones: 'Handys', low_energy_bulbs: 'Energiesparlampen', fluorescent_tubes: 'Leuchtstoffröhren', light_bulbs: 'Lampen',
  printer_cartridges: 'Druckerpatronen', printer_toner_cartridges: 'Tonerkartuschen', cork: 'Korken', cooking_oil: 'Speiseöl',
  engine_oil: 'Altöl', green_waste: 'Grünschnitt', garden_waste: 'Grünschnitt', hazardous_waste: 'Sondermüll', paint: 'Farben',
  clothes: 'Kleidung', shoes: 'Schuhe',
};

const ELEKTRO = ['small_electrical_appliances', 'small_appliances', 'electrical_appliances', 'electrical_items', 'electronics', 'computers', 'mobile_phones'];
const KOMMUNE = 'Verbindlich ist die Abfallsatzung deiner Kommune.';

const SRC = {
  battdg: { label: 'Umweltbundesamt zum Batterierecht-Durchführungsgesetz (BattDG), 22.10.2025', url: 'https://www.umweltbundesamt.de/themen/battdg-in-kraft-getreten-uba-beleiht-erneut' },
  elektrog: { label: '§ 17 Elektro- und Elektronikgerätegesetz (ElektroG)', url: 'https://www.gesetze-im-internet.de/elektrog_2015/__17.html' },
  uba_lampen: { label: 'Umweltbundesamt: Wohin mit kaputten Lampen?', url: 'https://www.umweltbundesamt.de/service/uba-fragen/wohin-kaputten-lampen' },
  uba_med: { label: 'Umweltbundesamt: Medikamentenreste umweltgerecht entsorgen, Stand 11.7.2025', url: 'https://www.umweltbundesamt.de/umweltbewusste-entsorgung-von-medikamentenresten' },
  altoelv: { label: '§ 8 Altölverordnung (AltölV)', url: 'https://www.gesetze-im-internet.de/alt_lv/__8.html' },
  krwg: { label: '§ 20 Kreislaufwirtschaftsgesetz (KrWG)', url: 'https://www.gesetze-im-internet.de/krwg/__20.html' },
  lfu_fett: { label: 'Abfallratgeber Bayern (LfU): Altspeisefette, Stand 02/2025', url: 'https://www.abfallratgeber.bayern.de/publikationen/entsorgung_einzelner_abfallarten/doc/altspeisefette.pdf' },
  lfu_patronen: { label: 'Abfallratgeber Bayern (LfU): Druckerpatronen', url: 'https://www.abfallratgeber.bayern.de/publikationen/entsorgung_einzelner_abfallarten/doc/druckerpatronen.pdf' },
  nabu: { label: 'NABU-Korkkampagne', url: 'https://www.nabu.de/umwelt-und-ressourcen/aktionen-und-projekte/korkampagne/' },
};

/**
 * cats: Kategorien, deren Orte gezeigt werden; flags: nur Orte dieser Kategorien mit einem dieser recycling:*-Merkmale
 * (gilt nicht für Kategorien in `all`); centres: Wertstoffhöfe zusätzlich zeigen; rule: Hinweis mit Quelle; link: Weiterleitung.
 */
export const WOHIN = [
  { id: 'glas', group: 'Container in der Nähe', label: 'Altglas', cats: ['glas'] },
  { id: 'papier', group: 'Container in der Nähe', label: 'Altpapier', cats: ['papier'] },
  { id: 'kleidung', group: 'Container in der Nähe', label: 'Kleidung', cats: ['altkleider'], flags: ['clothes'] },
  { id: 'schuhe', group: 'Container in der Nähe', label: 'Schuhe', cats: ['altkleider'], flags: ['shoes'],
    rule: 'Schuhe am besten paarweise zusammengebunden in einen Altkleider- bzw. Schuhcontainer, der Schuhe annimmt.' },

  { id: 'batterien', group: 'Elektro & Batterien', label: 'Batterien & Akkus', cats: ['sammelstelle'], flags: ['batteries'], centres: true,
    rule: 'Geschäfte, die Batterien verkaufen, müssen Altbatterien der Art, die sie verkaufen, kostenlos zurücknehmen – auch ohne Neukauf. Sammelboxen findest du deshalb in vielen Supermärkten, Drogerien und Baumärkten. Außerdem nehmen Wertstoffhöfe Batterien an. Batterien gehören nie in den Hausmüll.',
    src: [SRC.battdg], few: true },
  { id: 'elektro', group: 'Elektro & Batterien', label: 'Handy & Elektro-Kleingeräte', cats: ['sammelstelle'], flags: ELEKTRO, centres: true,
    rule: 'Wertstoffhöfe nehmen Elektrogeräte kostenlos an. Elektro-Händler ab 400 m² Elektro-Verkaufsfläche und Lebensmittelhändler ab 800 m² Gesamtfläche, die mehrmals im Jahr Elektrogeräte anbieten, nehmen kleine Geräte bis 25 cm Kantenlänge kostenlos zurück – auch ohne Neukauf, höchstens 3 je Geräteart.',
    src: [SRC.elektrog], few: true },
  { id: 'lampen', group: 'Elektro & Batterien', label: 'Energiesparlampen & LED', cats: ['sammelstelle'], flags: ['low_energy_bulbs', 'fluorescent_tubes', 'light_bulbs'], centres: true,
    rule: 'Energiesparlampen, Leuchtstoffröhren und LED-Lampen sind Elektroschrott – nicht in Restmüll, Gelben Sack oder Glascontainer. Annahme am Wertstoffhof, beim Schadstoffmobil und im Handel wie bei Elektrogeräten. Glüh- und Halogenlampen gehören dagegen in den Restmüll.',
    src: [SRC.uba_lampen, SRC.elektrog], few: true },
  { id: 'patronen', group: 'Elektro & Batterien', label: 'Druckerpatronen', cats: ['sammelstelle'], flags: ['printer_cartridges', 'printer_toner_cartridges'], centres: true,
    rule: 'Viele Hersteller und Händler nehmen leere Patronen und Toner zurück. Sonst: Wertstoffhof.',
    src: [SRC.lfu_patronen], few: true },

  { id: 'gruen', group: 'Garten & Wertstoffhof', label: 'Grünschnitt', cats: ['sammelstelle'], flags: ['green_waste', 'garden_waste'], centres: true,
    rule: 'Je nach Kommune über die Biotonne, einen Grünschnitt-Sammelplatz oder den Wertstoffhof.',
    src: [SRC.krwg] },
  { id: 'wertstoffhof', group: 'Garten & Wertstoffhof', label: 'Wertstoffhof', cats: ['wertstoffhof'] },
  { id: 'sperrmuell', group: 'Garten & Wertstoffhof', label: 'Sperrmüll', cats: [], centres: true,
    rule: 'Je nach Kommune holt die Abfallwirtschaft Sperrmüll auf Anfrage ab, oder du bringst ihn zum Wertstoffhof. Termine und Mengen regelt deine Kommune.',
    src: [SRC.krwg] },
  { id: 'korken', group: 'Garten & Wertstoffhof', label: 'Korken', cats: ['sammelstelle'], flags: ['cork'],
    rule: 'Korken dürfen in den Restmüll. Freiwillige Sammlungen (z. B. die Korkkampagne des NABU) nehmen sie gern.',
    src: [SRC.nabu], few: true },

  { id: 'medikamente', group: 'Nur Hinweis, wie es geht', label: 'Medikamente', cats: [],
    rule: 'Nie in Toilette oder Spüle. Meist gehören Medikamente in den Restmüll; je nach Region nehmen auch Apotheken (freiwillig), das Schadstoffmobil oder der Wertstoffhof sie an.',
    link: { label: 'Regel für deine Postleitzahl (arzneimittelentsorgung.de)', url: 'https://arzneimittelentsorgung.de/' },
    src: [SRC.uba_med] },
  { id: 'altoel', group: 'Nur Hinweis, wie es geht', label: 'Altöl', cats: ['sammelstelle'], flags: ['engine_oil'],
    rule: 'Wer Motor- oder Getriebeöl an Endverbraucher verkauft, muss eine Annahmestelle haben und Altöl bis zur gekauften Menge kostenlos annehmen – auch Ölfilter und ölhaltige Abfälle vom Ölwechsel.',
    src: [SRC.altoelv], few: true },
  { id: 'speiseoel', group: 'Nur Hinweis, wie es geht', label: 'Speiseöl & Fett', cats: ['sammelstelle'], flags: ['cooking_oil'], centres: true,
    rule: 'Nie in den Abfluss. Je nach Kommune gut verschlossen in den Restmüll oder zum Wertstoffhof.',
    src: [SRC.lfu_fett], few: true },
  { id: 'sondermuell', group: 'Nur Hinweis, wie es geht', label: 'Farben, Lacke & Sondermüll', cats: ['sammelstelle'], flags: ['hazardous_waste', 'paint'], centres: true,
    rule: 'Schadstoffhaltige Abfälle sammelt deine Kommune getrennt – über das Schadstoffmobil oder den Wertstoffhof. Termine erfährst du bei der Abfallberatung deiner Kommune.',
    src: [SRC.krwg], few: true },
];
export const WOHIN_BY_ID = Object.fromEntries(WOHIN.map((w) => [w.id, w]));
export const WOHIN_NOTE = KOMMUNE;

/** recycling:*-Merkmale eines Ortes (für Filter und Anzeige) */
export const recycleFlags = (t = {}) => Object.keys(t).filter((k) => k.startsWith('recycling:') && (t[k] === 'yes' || t[k] === 'true')).map((k) => k.slice(10));

/** Passt ein Ort zum gewählten Gegenstand? */
export function wohinMatches(w, it) {
  if (!w) return true;
  if (w.centres && it.c === 'wertstoffhof') return true;
  if (!w.cats.includes(it.c)) return false;
  if (!w.flags) return true;
  const f = recycleFlags(it.t);
  return w.flags.some((x) => f.includes(x));
}
/** Kategorien, die für einen Gegenstand eingeschaltet werden */
export const wohinCats = (w) => [...new Set([...w.cats, ...(w.centres ? ['wertstoffhof'] : [])])];
