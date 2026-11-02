// Style B "Flach": clean flat vector look in the Nahfuchs brand palette
const C = { bg: '#EEF3EC', blob: '#E3EBE0', ink: '#17241D', or: '#E8742A', gr: '#1F4D3A', wh: '#FFFFFF', map: '#E1E9DD', bld: '#D2DECD', park: '#C4DCB8', tree: '#A6C998', river: '#CBE0E3', ok: '#2F8A55', muted: '#5E6E64', poi: '#7C9384' };
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const F = (w, s) => `${w} ${s}px Outfit`;
const FOXP = { body: new Path2D(FOX_D.body), ears: new Path2D(FOX_D.ears), muz: new Path2D(FOX_D.muz) };

function shadow(blur, y, a) { ctx.shadowColor = `rgba(23,36,29,${a})`; ctx.shadowBlur = blur; ctx.shadowOffsetY = y; ctx.shadowOffsetX = 0; }
function noShadow() { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); }
function line(pts, w, col, cap = 'round') { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.lineCap = cap; ctx.lineJoin = 'round'; ctx.stroke(); }
function check(x, y, s, p, col = C.wh, w = 8) { // tick drawn progressively, s = half size
  const pts = [[x - s * .55, y + s * .02], [x - s * .12, y + s * .42], [x + s * .6, y - s * .38]];
  const L = plen(pts) * p; if (L <= 0) return; const out = [pts[0]]; let acc = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (acc + d <= L) { out.push(pts[i]); acc += d; } else { const f = (L - acc) / d; out.push([lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)]); break; } }
  line(out, w, col);
}
function envelope(x, y, w, h, col, lw) {
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  rr(x - w / 2, y - h / 2, w, h, lw * .9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - w / 2 + lw * .6, y - h / 2 + lw * .6); ctx.lineTo(x, y + h * .08); ctx.lineTo(x + w / 2 - lw * .6, y - h / 2 + lw * .6); ctx.stroke(); ctx.restore();
}

// ---------- characters ----------
function fox(cx, cy, size, { blink = 0, rot = 0, alpha = 1, sh = .18, sx = 1, sy = 1 } = {}) {
  if (size <= 0.5 || alpha <= 0) return;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(sx, sy); const k = size / 100; ctx.scale(k, k); ctx.translate(-50, -52);
  shadow(26, 12, sh); ctx.fillStyle = C.or; ctx.fill(FOXP.body); noShadow();
  ctx.fillStyle = 'rgba(23,36,29,.35)'; ctx.fill(FOXP.ears);
  ctx.fillStyle = C.wh; ctx.fill(FOXP.muz);
  ctx.fillStyle = C.ink;
  for (const ex of [39, 61]) { ctx.save(); ctx.translate(ex, 51); ctx.scale(1, Math.max(.12, 1 - blink)); circle(0, 0, 4); ctx.fill(); ctx.restore(); }
  circle(50, 86, 4.5); ctx.fill();
  ctx.restore();
}
function letterAt(x, y, sc, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc);
  rr(-70, -48, 140, 96, 12); ctx.fillStyle = C.wh; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 10; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-62, -40); ctx.lineTo(0, 8); ctx.lineTo(62, -40); ctx.lineWidth = 8; ctx.lineJoin = 'round'; ctx.stroke();
  rr(30, -36, 26, 30, 4); ctx.fillStyle = C.or; ctx.fill();
  ctx.restore();
}
const HAND = [150, -322], LETTER_OFF = [36, -40], LETTER_ROT = -0.18;
function person(st, o = {}) {
  const { letter = true, mood = 0, wave = 0, alpha = 1, pop = 1 } = o; const { x, y, s, walk, phase } = st;
  if (pop <= 0) return;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.scale(s * pop, s * pop);
  // ground shadow
  ctx.fillStyle = 'rgba(23,36,29,.12)'; ctx.beginPath(); ctx.ellipse(0, 4, 95, 18, 0, 0, Math.PI * 2); ctx.fill();
  const bob = -Math.abs(Math.sin(phase)) * 12 * walk; ctx.translate(0, bob);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const hip = -212, L = 205;
  for (const side of [-1, 1]) { const a = side * .17 + Math.sin(phase + (side > 0 ? Math.PI : 0)) * .42 * walk; const fx = side * 16 + Math.sin(a) * L, fy = hip + Math.cos(a) * L; line([[side * 16, hip], [fx, fy]], 22, C.ink); line([[fx, fy], [fx + side * 22, fy]], 22, C.ink); }
  // left arm (swings)
  const la = .28 + Math.sin(phase) * .5 * walk + Math.sin(wave * 2) * .05;
  line([[-46, -372], [-46 - Math.sin(la) * 175, -372 + Math.cos(la) * 175]], 20, C.ink);
  // torso
  rr(-64, -405, 128, 210, [46, 46, 20, 20]); ctx.fillStyle = C.gr; ctx.fill();
  // right arm holding letter
  const wv = Math.sin(wave) * 14; const hx = HAND[0], hy = HAND[1] + wv;
  line([[46, -372], [hx, hy]], 20, C.ink);
  if (letter) letterAt(hx + LETTER_OFF[0], hy + LETTER_OFF[1], 1, LETTER_ROT + Math.sin(wave) * .06);
  // head
  circle(0, -488, 70); ctx.fillStyle = C.wh; ctx.fill(); ctx.lineWidth = 13; ctx.strokeStyle = C.ink; ctx.stroke();
  // hair tuft
  line([[-14, -556], [4, -584], [24, -566]], 12, C.ink);
  ctx.fillStyle = C.ink; for (const ex of [-24, 24]) { circle(ex, -494, 8.5); ctx.fill(); }
  if (mood < 1) { ctx.globalAlpha *= 1; line([[-42, -522], [-14, -532]], 8, `rgba(23,36,29,${1 - mood})`); line([[14, -532], [42, -522]], 8, `rgba(23,36,29,${1 - mood})`); }
  ctx.beginPath(); ctx.moveTo(-20, -458); ctx.quadraticCurveTo(0, -458 + lerp(-12, 22, mood), 20, -458); ctx.lineWidth = 8; ctx.strokeStyle = C.ink; ctx.stroke();
  // cheeks
  ctx.fillStyle = `rgba(232,116,42,${.25 * mood})`; circle(-42, -470, 11); ctx.fill(); circle(42, -470, 11); ctx.fill();
  ctx.restore();
}
function handWorld(st, wave = 0) { const bob = -Math.abs(Math.sin(st.phase)) * 12 * st.walk; return [st.x + (HAND[0] + LETTER_OFF[0]) * st.s, st.y + (HAND[1] + Math.sin(wave) * 14 + LETTER_OFF[1] + bob) * st.s]; }

// ---------- scene pieces ----------
function bg(t) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.blob; circle(150 + 30 * Math.sin(t * .6), 470 + 20 * Math.cos(t * .5), 300); ctx.fill();
  circle(980 - 20 * Math.sin(t * .5), 1620 + 25 * Math.sin(t * .7), 360); ctx.fill();
}
function clock(t) {
  const pin = E.back(prog(t, .35, .85)), pout = E.in(prog(t, 2.3, 2.65)); const s = pin * (1 - pout); if (s <= .001) return;
  const cx = 812, cy = 950, r = 158, shake = Math.sin(t * 38) * .06 * Math.sin(Math.PI * prog(t, 1.15, 1.85));
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.rotate((1 - pin) * -.4 + shake);
  // bells
  for (const sd of [-1, 1]) { ctx.save(); ctx.rotate(sd * .62); rr(-46, -r - 52, 92, 40, [40, 40, 8, 8]); ctx.fillStyle = C.gr; ctx.fill(); ctx.restore(); }
  shadow(34, 14, .16); circle(0, 0, r); ctx.fillStyle = C.wh; ctx.fill(); noShadow();
  ctx.lineWidth = 16; ctx.strokeStyle = C.ink; ctx.stroke();
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, q = i % 3 === 0; const r1 = r - (q ? 44 : 34), r2 = r - 22; line([[Math.sin(a) * r1, -Math.cos(a) * r1], [Math.sin(a) * r2, -Math.cos(a) * r2]], q ? 9 : 5, q ? C.ink : '#9AA79F'); }
  const ha = (5 + 10 / 60) / 12 * Math.PI * 2, ma = 10 / 60 * Math.PI * 2;
  line([[0, 0], [Math.sin(ha) * 84, -Math.cos(ha) * 84]], 18, C.ink); line([[0, 0], [Math.sin(ma) * 122, -Math.cos(ma) * 122]], 12, C.ink);
  const sec = 14 + Math.floor(t) + E.back(clamp((t % 1) / .25)); const sa = sec / 60 * Math.PI * 2;
  line([[-Math.sin(sa) * 26, Math.cos(sa) * 26], [Math.sin(sa) * 136, -Math.cos(sa) * 136]], 5, C.or);
  circle(0, 0, 13); ctx.fillStyle = C.ink; ctx.fill(); circle(0, 0, 6); ctx.fillStyle = C.or; ctx.fill();
  ctx.restore();
  const bs = E.back(prog(t, .6, 1.05)) * (1 - pout); if (bs <= .001) return;
  ctx.save(); ctx.translate(cx, cy + r + 78); ctx.scale(bs, bs); shadow(20, 8, .15); rr(-122, -48, 244, 96, 48); ctx.fillStyle = C.gr; ctx.fill(); noShadow();
  ctx.fillStyle = C.wh; ctx.font = F(800, 60); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('17:10', 0, 3); ctx.restore();
}
function bubble(t) {
  const p = E.back(prog(t, 1.0, 1.4)), q = E.in(prog(t, 2.2, 2.45)); const s = p * (1 - q); if (s <= .001) return;
  const x = 205, y = 790; ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(Math.sin(t * 5) * .05);
  shadow(20, 8, .14); ctx.beginPath(); ctx.arc(0, 0, 66, 0, Math.PI * 2); ctx.moveTo(30, 52); ctx.lineTo(78, 108); ctx.lineTo(56, 40); ctx.fillStyle = C.wh; ctx.fill(); noShadow();
  ctx.fillStyle = C.or; ctx.font = F(800, 92); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 0, 4); ctx.restore();
}
const POIS = [{ x: 245, y: 965, g: 'WC', fs: 30 }, { x: 870, y: 1262, g: '€', fs: 40 }, { x: 572, y: 742, g: '+', fs: 54 }];
function mapScene(t) {
  const p = prog(t, 2.42, 3.0); if (p <= 0) return; const e = E.out(p), sc = .9 + .1 * E.back(p);
  ctx.save(); ctx.globalAlpha = e; ctx.translate(540, 1070); ctx.scale(sc, sc); ctx.translate(-540, -1070);
  const { x, y, w, h } = MAP;
  shadow(46, 18, .13); rr(x, y, w, h, 56); ctx.fillStyle = C.map; ctx.fill(); noShadow();
  ctx.save(); rr(x, y, w, h, 56); ctx.clip();
  // river
  ctx.beginPath(); ctx.moveTo(60, 800); ctx.bezierCurveTo(170, 760, 250, 740, 300, 690); ctx.bezierCurveTo(340, 650, 380, 640, 420, 600); ctx.lineWidth = 64; ctx.strokeStyle = C.river; ctx.lineCap = 'round'; ctx.stroke();
  // buildings
  ctx.fillStyle = C.bld;
  [[466, 676, 96, 120], [584, 690, 92, 104], [766, 676, 64, 128], [130, 892, 104, 74], [272, 886, 100, 150], [130, 990, 110, 64], [466, 886, 206, 76], [466, 982, 92, 72], [580, 982, 92, 72], [766, 886, 198, 82], [766, 988, 92, 70], [878, 988, 86, 70], [116, 1148, 256, 104], [116, 1272, 120, 40], [766, 1146, 198, 94], [766, 1360, 198, 104]].forEach(b => { rr(b[0], b[1], b[2], b[3], 14); ctx.fill(); });
  // park
  rr(466, 1146, 208, 170, 34); ctx.fillStyle = C.park; ctx.fill();
  ctx.fillStyle = C.tree; [[512, 1196, 26], [570, 1230, 32], [630, 1186, 22], [622, 1272, 26], [520, 1278, 20]].forEach(([a, b, r]) => { circle(a, b, r); ctx.fill(); });
  // streets
  ctx.lineCap = 'butt';
  line([[180, 820], [180, 1490]], 26, C.wh, 'butt'); line([[420, 1338], [990, 1338]], 26, C.wh, 'butt'); 
  for (const sx of [420, 720]) line([[sx, 600], [sx, 1540]], 44, C.wh, 'butt');
  for (const sy of [840, 1100]) line([[40, sy], [1040, sy]], 44, C.wh, 'butt');
  ctx.restore();
  ctx.restore();
  // secondary POIs (other categories)
  POIS.forEach((q, i) => {
    const s = E.back(prog(t, 3.5 + i * .12, 3.85 + i * .12)); if (s <= 0) return;
    ctx.save(); ctx.translate(q.x, q.y); ctx.scale(s, s); shadow(10, 4, .12); circle(0, 0, 34); ctx.fillStyle = C.wh; ctx.fill(); noShadow();
    ctx.lineWidth = 4; ctx.strokeStyle = '#C9D6CB'; ctx.stroke();
    ctx.fillStyle = C.poi; ctx.font = F(800, q.fs); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(q.g, 0, 2); ctx.restore();
  });
}
function route(t) {
  const p = E.inOut(prog(t, 5.3, 6.2)); if (p <= 0) return; const L = ROUTE_LEN * p;
  for (let d = 26; d <= L; d += 30) { const q = pointAt(ROUTE, d); const age = clamp((L - d) / 40); circle(q.x, q.y, 8 * E.back(age)); ctx.fillStyle = C.gr; ctx.fill(); }
}
function pin(t) {
  const p = prog(t, 3.1, 3.75); if (p <= 0) return;
  const dy = -560 * (1 - E.bounce(p)); const sqp = prog(t, 7.6, 8.0); const sq = Math.sin(sqp * Math.PI) * (1 - sqp) * 1.4;
  const [x, y] = PIN;
  ctx.save(); ctx.globalAlpha = clamp(p * 4);
  ctx.fillStyle = 'rgba(23,36,29,.2)'; ctx.beginPath(); ctx.ellipse(x, y, 30 * (.5 + .5 * E.bounce(p)), 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(x, y + dy); ctx.scale(1 + sq * .15, 1 - sq * .15);
  shadow(18, 8, .2); ctx.beginPath(); ctx.moveTo(0, -2); ctx.bezierCurveTo(-18, -30, -56, -58, -56, -98); ctx.arc(0, -98, 56, Math.PI, 0); ctx.bezierCurveTo(56, -58, 18, -30, 0, -2); ctx.fillStyle = C.or; ctx.fill(); noShadow();
  circle(0, -98, 36); ctx.fillStyle = C.wh; ctx.fill(); envelope(0, -98, 40, 28, C.or, 5);
  ctx.restore();
  // success badge + sparkles
  const bq = prog(t, 7.66, 7.98), b = E.back(bq); if (bq > 0) {
    ctx.save(); ctx.translate(x + 50, y - 150); ctx.scale(b, b); shadow(12, 5, .2); circle(0, 0, 30); ctx.fillStyle = C.ok; ctx.fill(); noShadow(); check(0, 0, 22, prog(t, 7.8, 8.0), C.wh, 7); ctx.restore();
    const sp = prog(t, 7.62, 8.1); ctx.save(); ctx.globalAlpha = 1 - E.in(sp);
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * .42; const r1 = 80 + 50 * E.out(sp), r2 = r1 + 26 * (1 - sp) + 6; line([[x + Math.cos(a) * r1, y - 98 + Math.sin(a) * r1], [x + Math.cos(a) * r2, y - 98 + Math.sin(a) * r2]], 7, i % 2 ? C.or : C.gr); }
    ctx.restore();
  }
}
function youAreHere(t) {
  if (t < 3.0 || t > 6.0) return; const a = clamp((t - 3.0) / .3) * (1 - clamp((t - 5.7) / .3));
  const ph = (t * 1.1) % 1; ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = `rgba(31,77,58,${.28 * (1 - ph)})`; ctx.beginPath(); ctx.ellipse(PMAP[0], PMAP[1], 30 + 60 * ph, 12 + 24 * ph, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function flyingLetter(t, st) {
  const p = prog(t, 7.3, 7.66); if (p <= 0 || p >= 1) return;
  const [hx, hy] = handWorld(st); const tx = PIN[0], ty = PIN[1] - 98; const e = E.inOut(p);
  const x = lerp(hx, tx, e), y = lerp(hy, ty, e) - Math.sin(Math.PI * p) * 90;
  letterAt(x, y, st.s * lerp(1, .45, e), LETTER_ROT + e * 1.2);
}
// ---------- text ----------
function caption(t, lines, size, tin, tout, cy) {
  const L = layoutLines(ctx, lines, s => F(800, s), size, 1.1, 930, 540, cy);
  ctx.font = L.font; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  L.words.forEach((w, i) => {
    const p = E.out(prog(t, tin + i * .07, tin + i * .07 + .5)), q = E.in(prog(t, tout + i * .03, tout + i * .03 + .3));
    const a = p * (1 - q); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = w.c || C.ink; ctx.translate(w.x + w.w / 2, w.y + 50 * (1 - p) - 40 * q); const s = .9 + .1 * p; ctx.scale(s, s); ctx.fillText(w.t, -w.w / 2, 0); ctx.restore();
  });
}
function card(t) {
  const p = prog(t, 5.0, 5.5); if (p <= 0) return; const e = E.back(p); const y0 = 300, h = 222;
  ctx.save(); ctx.globalAlpha = clamp(p * 2.5); ctx.translate(540, y0 + h / 2 - 70 * (1 - E.out(p))); ctx.scale(.92 + .08 * e, .92 + .08 * e); ctx.translate(-540, -(y0 + h / 2));
  shadow(40, 16, .15); rr(64, y0, 952, h, 44); ctx.fillStyle = C.wh; ctx.fill(); noShadow();
  envelope(128, y0 + 66, 40, 28, C.or, 5);
  ctx.font = F(600, 32); ctx.letterSpacing = '3px'; ctx.fillStyle = C.muted; ctx.textBaseline = 'alphabetic'; ctx.fillText('NÄCHSTER BRIEFKASTEN', 168, y0 + 78); ctx.letterSpacing = '0px';
  const parts = [['300 m', C.or], [' · ', '#A3AFA7'], ['Leerung 17:30', C.ink]];
  let s = 74; for (; s > 40; s -= 2) { ctx.font = F(800, s); if (ctx.measureText(parts.map(q => q[0]).join('')).width <= 700) break; }
  let x = 104; parts.forEach(([tx, c]) => { ctx.fillStyle = c; ctx.fillText(tx, x, y0 + 168); x += ctx.measureText(tx).width; });
  const cs = E.back(prog(t, 5.45, 5.8)); if (cs > 0) { ctx.save(); ctx.translate(930, y0 + h / 2); ctx.scale(cs, cs); circle(0, 0, 50); ctx.fillStyle = C.ok; ctx.fill(); ctx.restore(); check(930, y0 + h / 2, 34, prog(t, 5.6, 5.9), C.wh, 10); }
  ctx.restore();
}
// ---------- end card ----------
function endCard(t) {
  const p = prog(t, 8.1, 8.75); if (p <= 0) return; const e = E.inOut(p);
  circle(FOXM[0], FOXM[1], e * 2300); ctx.fillStyle = C.gr; ctx.fill();
  const hp = E.back(prog(t, 8.5, 9.0)); if (hp > 0) { circle(FOXE[0], FOXE[1] + 4, 270 * hp); ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fill(); circle(FOXE[0], FOXE[1] + 4, 330 * hp); ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.fill(); }
  // domain
  const dp = E.out(prog(t, 8.62, 9.12)); if (dp > 0) {
    ctx.save(); ctx.globalAlpha = dp; ctx.font = F(800, 132); ctx.textBaseline = 'alphabetic';
    const a = 'nahfuchs', b = '.de', wa = ctx.measureText(a).width, wb = ctx.measureText(b).width; const x0 = 540 - (wa + wb) / 2, yb = 1112 + 40 * (1 - dp);
    ctx.fillStyle = C.wh; ctx.fillText(a, x0, yb); ctx.fillStyle = C.or; ctx.fillText(b, x0 + wa, yb); ctx.restore();
  }
  ['Kostenlos', 'Ohne Konto', 'Ohne Werbung'].forEach((txt, i) => {
    const q = prog(t, 8.95 + i * .16, 9.45 + i * .16); if (q <= 0) return; const s = E.back(q);
    ctx.save(); ctx.font = F(600, 52); const tw = ctx.measureText(txt).width, pw = tw + 132, ph = 90, cy = 1232 + i * 106;
    ctx.globalAlpha = clamp(q * 3); ctx.translate(540, cy); ctx.scale(s, s);
    rr(-pw / 2, -ph / 2, pw, ph, ph / 2); ctx.fillStyle = 'rgba(255,255,255,.09)'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.stroke();
    circle(-pw / 2 + 50, 0, 22); ctx.fillStyle = C.or; ctx.fill(); check(-pw / 2 + 50, 0, 15, prog(t, 9.1 + i * .16, 9.35 + i * .16), C.wh, 5.5);
    ctx.fillStyle = C.wh; ctx.textBaseline = 'middle'; ctx.fillText(txt, -pw / 2 + 92, 3); ctx.restore();
  });
}
function drawFox(t) {
  const pp = prog(t, 3.45, 3.95); if (pp <= 0) return; const st = foxState(t);
  const pop = E.back(pp); const idle = Math.sin(t * 2.4) * .045 * (1 - st.m);
  const blink = Math.max(Math.sin(Math.PI * prog(t, 4.6, 4.75)), Math.sin(Math.PI * prog(t, 7.0, 7.15)), Math.sin(Math.PI * prog(t, 10.1, 10.28)));
  const fy = st.y + Math.sin(t * 2.2) * 7 * st.m;
  fox(st.x, fy, st.size * pop, { rot: idle + (1 - pop) * -.5, blink, sh: st.m > .5 ? .35 : .2 });
}

window.render = function (t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  bg(t);
  const st = personState(t);
  if (t < 8.8) {
    mapScene(t); youAreHere(t); route(t); clock(t); bubble(t);
    person(st, { letter: t < 7.3, mood: E.inOut(prog(t, 2.6, 3.2)), wave: t < 2.5 ? t * 6 : 0, pop: E.back(prog(t, 0, .55)) });
    pin(t); flyingLetter(t, st);
    caption(t, [[{ t: 'Brief' }, { t: 'muss' }, { t: 'heute', c: C.or }], [{ t: 'noch' }, { t: 'weg?' }]], 108, .15, 2.2, 465);
    caption(t, [[{ t: 'Nahfuchs', c: C.gr }, { t: 'zeigt' }, { t: 'dir' }], [{ t: 'den' }, { t: 'nächsten' }], [{ t: 'Briefkasten', c: C.or }]], 96, 2.65, 4.75, 460);
    card(t);
  }
  endCard(t);
  drawFox(t);
};
