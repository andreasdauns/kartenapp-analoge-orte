// Nutzer-Meldungen (Supabase, ohne Konto). Aktiv, sobald src/config.js ausgefüllt ist.
import { SUPABASE } from './config.js';

export const enabled = () => Boolean(SUPABASE.url && SUPABASE.key);
const H = () => ({ apikey: SUPABASE.key, Authorization: `Bearer ${SUPABASE.key}`, 'Content-Type': 'application/json' });

export function deviceId() {
  let id = null;
  try { id = localStorage.getItem('device'); } catch { /* egal */ }
  if (!id) {
    id = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()).replace(/-/g, '');
    try { localStorage.setItem('device', id); } catch { /* egal */ }
  }
  return id;
}

/** Gerätekennung je Ort, nicht über Orte hinweg verknüpfbar (wie in der Datenbank-Funktion reports_in_box). */
export async function deviceKey(placeId) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${deviceId()}:${placeId}`));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return deviceId(); }
}

export const CONFIRM_NEEDED = 3; // so viele verschiedene Geräte machen einen neuen Ort "bestätigt"
const HOURS = 3600 * 1000;
export const STATUS_TTL = { glas: 24 * HOURS, papier: 24 * HOURS, altkleider: 48 * HOURS, toilette: 12 * HOURS, rastplatz: 12 * HOURS };

export const STATUS_OPTIONS = {
  container: [['voll', 'Voll'], ['halb', 'Halb voll'], ['leer', 'Leer / Platz']],
  wc: [['sauber', 'Sauber'], ['ok', 'In Ordnung'], ['dreckig', 'Dreckig'], ['defekt', 'Defekt']],
};
export const statusGroup = (c) => (['glas', 'papier', 'altkleider'].includes(c) ? 'container' : ['toilette', 'rastplatz'].includes(c) ? 'wc' : null);

/** Meldungen in einem Kartenausschnitt laden. */
export async function fetchBox(s, w, n, e) {
  if (!enabled()) return [];
  // Bevorzugt: geschützte Abfrage (begrenzter Ausschnitt, Geräte-IDs nur je Ort pseudonymisiert)
  const rpc = await fetch(`${SUPABASE.url}/rest/v1/rpc/reports_in_box`, { method: 'POST', headers: H(), body: JSON.stringify({ s, w, n, e }) }).catch(() => null);
  if (rpc && rpc.ok) return rpc.json();
  // Kein Direktzugriff auf die Tabelle: Lesen ausschließlich über die geschützte Funktion
  throw new Error(`Meldungen: HTTP ${rpc ? rpc.status : 'offline'}`);
}

/** Eine Meldung abschicken. */
export async function send(r) {
  const body = { ...r, device: deviceId() };
  if (r.kind === 'status' && STATUS_TTL[r.category]) body.expires_at = new Date(Date.now() + STATUS_TTL[r.category]).toISOString();
  if (r.kind === 'closed') body.expires_at = new Date(Date.now() + 7 * 24 * HOURS).toISOString();
  const res = await fetch(`${SUPABASE.url}/rest/v1/reports`, { method: 'POST', headers: { ...H(), Prefer: 'return=minimal' }, body: JSON.stringify(body) });
  if (res.status === 409) throw new Error('Das hast du schon gemeldet.');
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(/Zu viele/.test(t) ? 'Zu viele Meldungen – bitte später erneut versuchen.' : 'Meldung konnte nicht gesendet werden.');
  }
}

/** Meldungen pro Ort zusammenfassen. */
export function summarize(rows) {
  const now = Date.now();
  const by = new Map();
  const get = (id) => { if (!by.has(id)) by.set(id, { status: null, gone: new Set(), confirm: new Set(), closed: null, hours: null, notes: [], creator: null, newPlace: null }); return by.get(id); };
  for (const r of rows) { // neueste zuerst
    const s = get(r.place_id);
    const exp = r.expires_at ? Date.parse(r.expires_at) : null;
    switch (r.kind) {
      case 'status': if (!s.status && (!exp || exp > now)) s.status = { value: r.status, at: Date.parse(r.created_at) }; break;
      case 'gone': s.gone.add(r.device); break;
      case 'confirm': s.confirm.add(r.device); break;
      case 'closed': if (!s.closed && (!exp || exp > now)) s.closed = { text: r.message, at: Date.parse(r.created_at) }; break;
      case 'hours': if (!s.hours) s.hours = { text: r.message, at: Date.parse(r.created_at) }; break;
      case 'note': if (s.notes.length < 3 && r.message) s.notes.push({ text: r.message, at: Date.parse(r.created_at) }); break;
      case 'new': s.newPlace = r; s.creator = r.device; s.confirm.add(r.device); break;
      default:
    }
  }
  return by;
}

export function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 2) return 'gerade eben';
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return d === 1 ? 'gestern' : `vor ${d} Tagen`;
}

/** Wünsche und Rückmeldungen: nur die angetippten Auswahlpunkte, ohne Geräte-ID, ohne Text. */
export async function sendWishes(items) {
  if (!enabled()) throw new Error('Senden ist gerade nicht möglich.');
  const res = await fetch(`${SUPABASE.url}/rest/v1/wishes`, { method: 'POST', headers: { ...H(), Prefer: 'return=minimal' }, body: JSON.stringify(items.map((item) => ({ item }))) });
  if (!res.ok) throw new Error('Konnte nicht gesendet werden. Bitte später erneut versuchen.');
}
