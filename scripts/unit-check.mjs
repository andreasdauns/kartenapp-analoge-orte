// Kleine Einheiten-Tests für Hilfsfunktionen der Datenaufbereitung. Läuft vor dem Daten-Build;
// schlägt ein Test fehl, wird nicht veröffentlicht.
import assert from 'node:assert/strict';
import { hoursDE, CITY_SOURCES, fractionsOf } from './cities.mjs';

const cases = [
  ['Täglich: 8.00 - 22.00 Uhr', 'Mo-Su 08:00-22:00'],
  ['täglich 24 Stunden', '24/7'],
  ['Täglich rund um die Uhr', '24/7'],
  ['durchgehend geöffnet', '24/7'],
  ['Mo-Fr 8.00-18.00 Uhr', 'Mo-Fr 08:00-18:00'],
  ['täglich außer Sonntag', 'täglich außer Su'], // bleibt Klartext statt falscher Zeiten
  ['durchgehend, außer bei Veranstaltungen', 'durchgehend, außer bei Veranstaltungen'], // Einschränkung → nie „24/7“
  ['So lange der Vorrat reicht', 'So lange der Vorrat reicht'],
  ['Sonntag 9-12', 'Su 09-12'.replace('09-12', '9-12')],
];
for (const [inp, out] of cases) assert.equal(hoursDE(inp), out, `hoursDE(${JSON.stringify(inp)})`);

// Bielefeld: Zuordnung der beiden Toiletten-Ebenen
const bi = CITY_SOURCES.bielefeld;
const nette = bi.map({ name: 'Gaststätte Vahle', adresse: 'Wertherstraße 24', behind: 'ja', wickeltisc: 'ja', _nette: true });
assert.equal(nette.c, 'toilette');
assert.equal(nette.t.fee, 'no');
assert.equal(nette.t.changing_table, 'yes');
assert.match(nette.t.description, /Nette Toilette/);
const oeff = bi.map({ einricht: 'Bürgerpark', str: 'Wertherstraße 88', oeff: 'Täglich: 8.00 - 22.00 Uhr', barfrei: 'nein', entgelt: 'nein', anmerkun: '' });
assert.equal(oeff.t.opening_hours, 'Mo-Su 08:00-22:00');
assert.equal(oeff.t.wheelchair, 'no');
assert.match(oeff.t.description, /Stand 2016/);
assert.equal(bi.map({ einricht: 'Friedhof', oeff: 'Nur bei Bestattungen' }), null);
assert.equal(bi.license, 'CC BY 4.0');

// Container-Art: Straßennamen dürfen keine Fraktion vortäuschen
assert.deepEqual([...fractionsOf({ strasse: 'Pappelweg 3', art: 'Glas' })], ['glas']);
assert.deepEqual([...fractionsOf({ standort: 'Glasstraße 1' })], []);
assert.deepEqual([...fractionsOf({ name: 'Weißenburger Str.' })], []);
assert.deepEqual([...fractionsOf({ standort: 'Glascontainer Marktplatz' })], ['glas']);
assert.deepEqual([...fractionsOf({ typ: 'Altpapier, Glas' })].sort(), ['glas', 'papier']);
assert.equal(CITY_SOURCES.rostock.map({ _c: 'briefkasten' }).t.operator, undefined);

console.log(`Einheiten-Tests: ${cases.length + 15} Prüfungen bestanden`);
