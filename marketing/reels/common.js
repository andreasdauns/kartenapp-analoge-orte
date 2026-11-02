// Shared timeline + geometry helpers (deterministic, driven by t in seconds)
const W = 1080, H = 1920, FPS = 30, DUR = 11;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const prog = (t, a, b) => clamp((t - a) / (b - a));
function bounce(x) { const n1 = 7.5625, d1 = 2.75; if (x < 1 / d1) return n1 * x * x; if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + .75; if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + .9375; return n1 * (x -= 2.625 / d1) * x + .984375; }
const E = {
  inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t * t,
  back: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  bounce,
};
function plen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }
function pointAt(pts, d) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; const L = Math.hypot(x1 - x0, y1 - y0);
    if (d <= L || i === pts.length - 1) { const f = L ? clamp(d / L) : 0; return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f, ang: Math.atan2(y1 - y0, x1 - x0) }; }
    d -= L;
  }
  const l = pts[pts.length - 1]; return { x: l[0], y: l[1], ang: 0 };
}
function resample(pts, step = 5) {
  const out = [{ x: pts[0][0], y: pts[0][1], s: 0 }]; let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; const d = Math.hypot(x1 - x0, y1 - y0); if (d < 1e-6) continue;
    const n = Math.max(1, Math.ceil(d / step));
    for (let j = 1; j <= n; j++) out.push({ x: x0 + (x1 - x0) * j / n, y: y0 + (y1 - y0) * j / n, s: s + d * j / n });
    s += d;
  }
  return out;
}
// Lay out manually broken lines of words, centred on (cx, cy); shrinks font until the widest line fits.
function layoutLines(ctx, lines, fontFn, size, lhR, maxW, cx, cy, minSize = 40) {
  let s = size;
  for (;;) {
    ctx.font = fontFn(s); const sp = ctx.measureText(' ').width; let mw = 0;
    const L = lines.map(ws => { let x = 0; const items = ws.map(w => { const ww = ctx.measureText(w.t).width; const it = { ...w, x, w: ww }; x += ww + sp; return it; }); const lw = x - sp; mw = Math.max(mw, lw); return { items, w: lw, text: ws.map(w => w.t).join(' ') }; });
    if (mw <= maxW || s <= minSize) {
      const lh = s * lhR, top = cy - lh * lines.length / 2, out = [];
      L.forEach((ln, li) => { const x0 = cx - ln.w / 2, base = top + lh * li + lh * 0.74; ln.items.forEach((it, wi) => out.push({ ...it, x: x0 + it.x, y: base, line: li, lw: ln.w, lx: x0 })); ln.x0 = x0; ln.base = base; });
      return { words: out, lines: L, size: s, lh, top, font: fontFn(s) };
    }
    s -= 2;
  }
}
// Shared scene geometry (both styles)
const MAP = { x: 90, y: 650, w: 900, h: 840 };
const ROUTE = [[420, 1395], [420, 1100], [720, 1100], [720, 840], [800, 840]];
const ROUTE_LEN = plen(ROUTE);
const PIN = [880, 840];
const FOXM = [192, 1428, 230], FOXE = [540, 760, 420];
const PSTART = [370, 1450, 1], PMAP = [420, 1395, .34];
// Person placement over time (feet x, y, scale, walk amount, phase)
function personState(t) {
  const m = E.inOut(prog(t, 2.5, 3.3));
  let x = lerp(PSTART[0], PMAP[0], m), y = lerp(PSTART[1], PMAP[1], m), s = lerp(PSTART[2], PMAP[2], m), walk = 0, phase = 0;
  const wp = prog(t, 5.9, 7.3);
  if (wp > 0) { const d = E.inOut(wp) * ROUTE_LEN; const p = pointAt(ROUTE, d); x = p.x; y = p.y; walk = clamp(Math.sin(Math.PI * wp) * 3); phase = d / 34 * Math.PI; }
  return { x, y, s, walk, phase };
}
function foxState(t) {
  const m = E.inOut(prog(t, 8.1, 8.8));
  return { x: lerp(FOXM[0], FOXE[0], m), y: lerp(FOXM[1], FOXE[1], m), size: lerp(FOXM[2], FOXE[2], m), m };
}
const FOX_D = {
  body: 'M18 14 L40 36 L60 36 L82 14 L80 52 Q75 72 50 90 Q25 72 20 52 Z',
  ears: 'M24 24 L34 36 L27 40 Z M76 24 L66 36 L73 40 Z',
  muz: 'M27 56 L50 70 L73 56 Q66 78 50 90 Q34 78 27 56 Z',
};
