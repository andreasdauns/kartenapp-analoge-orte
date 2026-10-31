// Kleiner Parser für OSM opening_hours / collection_times (die häufigen Fälle).
// Unbekannte Syntax -> null, dann zeigt die App den Originaltext.

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
export const DAY_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DAY_RE = /^(Mo|Tu|We|Th|Fr|Sa|Su)(-(Mo|Tu|We|Th|Fr|Sa|Su))?$/;
const TIME = /^(\d{1,2}):(\d{2})$/;

const toMin = (s) => {
  const m = TIME.exec(s);
  if (!m) return null;
  return +m[1] * 60 + +m[2];
};

function parseDays(sel) {
  const days = new Set();
  for (const part of sel.split(',')) {
    const p = part.trim();
    if (p === 'PH' || p === 'SH') continue; // Feiertage ignorieren wir vorerst
    const m = DAY_RE.exec(p);
    if (!m) return null;
    const a = DAYS.indexOf(m[1]);
    const b = m[3] ? DAYS.indexOf(m[3]) : a;
    for (let i = a; ; i = (i + 1) % 7) {
      days.add(i);
      if (i === b) break;
    }
  }
  return days;
}

/**
 * @returns {{kind:'range'|'points', always?:boolean, week:Array<Array<[number,number]>|Array<number>>}|null}
 */
export function parseHours(value, kind = 'range') {
  if (!value || typeof value !== 'string') return null;
  const v = value.trim();
  if (v === '24/7') return { kind, always: true, week: Array.from({ length: 7 }, () => [[0, 1440]]) };
  const week = Array.from({ length: 7 }, () => []);
  let any = false;
  for (let rule of v.split(';')) {
    rule = rule.trim();
    if (!rule) continue;
    let daysPart = null;
    let timesPart = rule;
    const sp = rule.match(/^([A-Za-z,\-\s]+?)\s+(.+)$/);
    if (sp && /^(Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)/.test(sp[1])) {
      daysPart = sp[1].replace(/\s/g, '');
      timesPart = sp[2].trim();
    } else if (/^(Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)[A-Za-z,\-]*$/.test(rule)) {
      // nur Tage, ohne Zeit (z. B. "Mo-Fr") -> unklar
      return null;
    }
    let days;
    if (daysPart) {
      days = parseDays(daysPart);
      if (!days) return null;
      if (days.size === 0) continue; // reine Feiertagsregel
    } else {
      days = new Set([0, 1, 2, 3, 4, 5, 6]);
    }
    if (/^(off|closed)$/i.test(timesPart)) {
      for (const d of days) week[d] = [];
      any = true;
      continue;
    }
    const slots = [];
    for (const t of timesPart.split(',')) {
      const s = t.trim();
      if (kind === 'points') {
        const m = toMin(s);
        if (m == null) return null;
        slots.push(m);
      } else {
        const [a, b] = s.split('-');
        const ma = toMin(a?.trim());
        let mb = b === undefined ? null : toMin(b.trim().replace('+', ''));
        if (ma == null || mb == null) return null;
        if (mb <= ma) mb += 1440; // über Mitternacht
        slots.push([ma, mb]);
      }
    }
    for (const d of days) week[d] = slots.slice();
    any = true;
  }
  return any ? { kind, week } : null;
}

const dayIdx = (date) => (date.getDay() + 6) % 7; // Montag = 0
const minsOf = (date) => date.getHours() * 60 + date.getMinutes();
const hhmm = (m) => {
  m = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const dayWord = (offset, idx) => (offset === 0 ? 'heute' : offset === 1 ? 'morgen' : DAY_DE[idx]);

/** Nächste Leerung (collection_times). */
export function nextPoint(parsed, now = new Date()) {
  if (!parsed) return null;
  const d0 = dayIdx(now);
  const m0 = minsOf(now);
  for (let off = 0; off < 8; off++) {
    const d = (d0 + off) % 7;
    const pts = [...parsed.week[d]].sort((a, b) => a - b);
    for (const p of pts) {
      if (off === 0 && p < m0) continue;
      return { offset: off, day: d, time: hhmm(p), text: `${dayWord(off, d)} ${hhmm(p)}` };
    }
  }
  return null;
}

/** Geöffnet-Status (opening_hours). */
export function openState(parsed, now = new Date()) {
  if (!parsed) return null;
  if (parsed.always) return { open: true, always: true, text: 'rund um die Uhr' };
  const d0 = dayIdx(now);
  const m0 = minsOf(now);
  const until = (b) => (b >= 1440 && b % 1440 === 0 ? 'Mitternacht' : hhmm(b));
  // Intervalle von gestern, die über Mitternacht reichen
  const yest = parsed.week[(d0 + 6) % 7];
  for (const [, b] of yest) if (b > 1440 && m0 < b - 1440) return { open: true, until: until(b), text: `geöffnet bis ${until(b)}` };
  for (const [a, b] of parsed.week[d0]) if (m0 >= a && m0 < b) return { open: true, until: until(b), text: `geöffnet bis ${until(b)}` };
  for (let off = 0; off < 8; off++) {
    const d = (d0 + off) % 7;
    const iv = [...parsed.week[d]].sort((x, y) => x[0] - y[0]);
    for (const [a] of iv) {
      if (off === 0 && a <= m0) continue;
      const next = `${dayWord(off, d)} ${hhmm(a)}`;
      return { open: false, next, text: `geschlossen · öffnet ${next}` };
    }
  }
  return { open: false, text: 'geschlossen' };
}

/** Lesbare Wochenübersicht, z. B. "Mo–Fr 17:00 · Sa 12:00". */
export function weekSummary(parsed) {
  if (!parsed) return null;
  if (parsed.always) return '24 Stunden, 7 Tage';
  const fmt = (slots) =>
    slots.length === 0
      ? (parsed.kind === 'points' ? 'keine' : 'geschlossen')
      : slots.map((s) => (Array.isArray(s) ? `${hhmm(s[0])}–${hhmm(s[1])}` : hhmm(s))).join(', ');
  const rows = [];
  let i = 0;
  while (i < 7) {
    const f = fmt(parsed.week[i]);
    let j = i;
    while (j + 1 < 7 && fmt(parsed.week[j + 1]) === f) j++;
    rows.push(`${i === j ? DAY_DE[i] : `${DAY_DE[i]}–${DAY_DE[j]}`} ${f}`);
    i = j + 1;
  }
  return rows.join(' · ');
}
