/* ================= Celebration screen: gold trophy, flames, smoke and graffiti =================
   Used on the presenter's screen at the end of a live quiz review and, in a lighter version, on students' devices. */
let graffitiFontsP = null;
function loadGraffitiFonts() {
  if (!graffitiFontsP) {
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Rubik+Wet+Paint&family=Permanent+Marker&display=swap';
    document.head.appendChild(l);
    graffitiFontsP = Promise.race([
      Promise.all([document.fonts?.load('64px "Rubik Wet Paint"', 'CHAMPION'), document.fonts?.load('32px "Permanent Marker"', 'Legend')]).catch(() => {}),
      new Promise(r => setTimeout(r, 1500))
    ]);
  }
  return graffitiFontsP;
}
function nameLines(name) {
  const n = String(name || '').trim() || 'Champion';
  if (n.length <= 13 || !n.includes(' ')) return [n];
  const mid = n.length / 2; let best = -1;
  for (let i = 0; i < n.length; i++) if (n[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? [n] : [n.slice(0, best), n.slice(best + 1)];
}
function trophySvg(name, plaque) {
  const lines = nameLines(name);
  const longest = Math.max(...lines.map(l => l.length));
  const fs = Math.max(13, Math.min(34, 150 / (0.6 * longest)));
  const y0 = lines.length === 1 ? 132 : 118;
  const text = (attrs) => lines.map((l, i) => `<text x="150" y="${y0 + i * fs * 1.08}" ${attrs} font-size="${fs.toFixed(1)}" text-anchor="middle" font-family="'Permanent Marker','Atkinson Hyperlegible',system-ui,sans-serif"${l.length > 14 ? ` textLength="${Math.min(170, l.length * fs * .58).toFixed(0)}" lengthAdjust="spacingAndGlyphs"` : ''}>${esc(l)}</text>`).join('');
  const pl = String(plaque || 'Live quiz champion').slice(0, 34);
  return `<svg class="trophy" viewBox="0 0 300 360" role="img" aria-label="Gold trophy engraved with ${esc(name)}">
  <defs>
    <linearGradient id="tg-gold" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#8a5a00"/><stop offset=".18" stop-color="#ffd85a"/><stop offset=".34" stop-color="#fff6c8"/><stop offset=".5" stop-color="#f5bf2a"/><stop offset=".78" stop-color="#b57a06"/><stop offset="1" stop-color="#ffd860"/></linearGradient>
    <linearGradient id="tg-gold-v" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#e6a91a"/><stop offset="1" stop-color="#8a5a00"/></linearGradient>
    <linearGradient id="tg-base" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3b2a20"/><stop offset="1" stop-color="#1c130e"/></linearGradient>
    <radialGradient id="tg-glow" cx=".5" cy=".42" r=".55"><stop offset="0" stop-color="#ffd85a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd85a" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="150" cy="150" r="150" fill="url(#tg-glow)"/>
  <path d="M66 72 C14 66 14 150 84 160" fill="none" stroke="url(#tg-gold-v)" stroke-width="15" stroke-linecap="round"/>
  <path d="M234 72 C286 66 286 150 216 160" fill="none" stroke="url(#tg-gold-v)" stroke-width="15" stroke-linecap="round"/>
  <path d="M58 48 C58 150 96 202 150 207 C204 202 242 150 242 48 Z" fill="url(#tg-gold)"/>
  <ellipse cx="150" cy="48" rx="92" ry="14" fill="#ffe58a"/><ellipse cx="150" cy="50" rx="80" ry="9" fill="#9a6400" opacity=".55"/>
  <path d="M82 66 C80 120 98 166 128 188" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" opacity=".38"/>
  <path d="M150 72 l7 14 15 2 -11 10 3 15 -14 -7 -14 7 3 -15 -11 -10 15 -2z" fill="#9a6400" opacity=".85"/>
  <g>${text('fill="#fff3b0" opacity=".9" dx="1" dy="1.4"')}${text('fill="#6b4300"')}</g>
  <path d="M136 207 L164 207 L172 250 L128 250 Z" fill="url(#tg-gold)"/>
  <ellipse cx="150" cy="252" rx="32" ry="9" fill="url(#tg-gold-v)"/>
  <path d="M96 262 L204 262 L214 300 L86 300 Z" fill="url(#tg-gold)"/>
  <rect x="70" y="298" width="160" height="34" rx="6" fill="url(#tg-base)"/>
  <rect x="88" y="305" width="124" height="20" rx="3" fill="url(#tg-gold)"/>
  <text x="150" y="319.5" font-size="${pl.length > 22 ? 8.5 : 10}" text-anchor="middle" fill="#5a3700" font-family="'Atkinson Hyperlegible',system-ui,sans-serif" font-weight="700" letter-spacing=".6">${esc(pl.toUpperCase())}</text>
</svg>`;
}
const CROWN = `<svg class="cele-crown" viewBox="0 0 120 70" aria-hidden="true"><path d="M8 60 L14 18 L38 42 L60 8 L82 42 L106 18 L112 60 Z" fill="none" stroke="#f2cb52" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="14" cy="16" r="5" fill="#ff3ea5"/><circle cx="60" cy="7" r="6" fill="#2de2e6"/><circle cx="106" cy="16" r="5" fill="#b6ff3b"/></svg>`;
const TAGS = [
  { t: 'CHAMPION', c: '#ff3ea5', s: '#2de2e6', x: 50, y: 7, r: -4, z: 1.55, big: true },
  { t: 'LEGEND', c: '#b6ff3b', s: '#5b2cff', x: 13, y: 22, r: -13, z: 1 },
  { t: '#1', c: '#ff8a00', s: '#ffef3b', x: 87, y: 20, r: 11, z: 1.6 },
  { t: 'ON FIRE', c: '#2de2e6', s: '#ff3ea5', x: 14, y: 60, r: 7, z: .9 },
  { t: 'BIG BRAIN', c: '#ffef3b', s: '#ff3ea5', x: 86, y: 58, r: -8, z: .85 },
  { t: 'GG', c: '#ff6b6b', s: '#2de2e6', x: 30, y: 40, r: -18, z: .8, wide: true },
  { t: 'WOW', c: '#c38bff', s: '#b6ff3b', x: 72, y: 42, r: 14, z: .75, wide: true }
];
function celebrationHtml({ winners = [], runners = [], plaque = '', subtitle = '', compact = false, mine = false }) {
  const names = winners.map(w => w.name);
  const champ = names.length > 1 ? names.join(' & ') : (names[0] || 'Our class');
  const head = names.length ? (mine ? 'You won!' : names.length > 1 ? 'Co-champions!' : 'Congratulations!') : 'Great effort, everyone!';
  const tags = (compact ? TAGS.filter(t => !t.wide).slice(0, 4) : TAGS).map((g, i) => `<span class="tag${g.big ? ' big' : ''}" style="--x:${compact ? Math.round(50 + (g.x - 50) * .62) : g.x}%;--y:${g.y}%;--r:${g.r}deg;--z:${g.z};--c:${g.c};--s:${g.s};--d:${(0.35 + i * 0.22).toFixed(2)}s">${esc(g.t)}</span>`).join('');
  const splats = Array.from({ length: compact ? 10 : 22 }, (_, i) => { const c = ['#ff3ea5', '#2de2e6', '#b6ff3b', '#ff8a00', '#ffef3b', '#c38bff'][i % 6]; return `<i style="--x:${(Math.random() * 96 + 2).toFixed(1)}%;--y:${(Math.random() * 70 + 2).toFixed(1)}%;--c:${c};--sz:${(Math.random() * 46 + 14).toFixed(0)}px;--d:${(0.2 + Math.random() * 1.6).toFixed(2)}s"></i>`; }).join('');
  return `<div class="cele${compact ? ' compact' : ''}" role="region" aria-label="Celebration">
    <div class="cele-wall"></div>
    <div class="cele-splats" aria-hidden="true">${splats}</div>
    <div class="cele-tags" aria-hidden="true">${tags}</div>
    <canvas class="cele-fire" aria-hidden="true"></canvas>
    <div class="cele-center">
      ${CROWN}
      <div class="cele-trophy">${trophySvg(champ, plaque)}</div>
      <h1 class="cele-head" aria-live="polite">${esc(head)}${names.length && !mine ? `<span>${esc(champ)}</span>` : ''}</h1>
      ${subtitle ? `<p class="cele-sub">${esc(subtitle)}</p>` : ''}
      ${runners.length ? `<ol class="cele-podium">${runners.map((r, i) => `<li><span class="medal m${i + 2}">${i + 2}</span><span class="grow">${esc(r.name)}</span><b class="mono">${(r.score || 0).toLocaleString()}</b></li>`).join('')}</ol>` : ''}
    </div>
  </div>`;
}
/* Particle fire + smoke on a canvas: flame "tongues" lick up from emitters along the bottom edge (taller at the sides, so the
   trophy is framed by fire), smoke curls off the tips, and embers float up. Returns a stop() function. */
function startFire(canvas, { intensity = 1 } = {}) {
  const ctx = canvas.getContext('2d'); if (!ctx) return () => {};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1, raf = 0, last = performance.now(), alive = true, clock = 0;
  const sprite = (r, g, b, a = 1, soft = .45) => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${r},${g},${b},${a})`); gr.addColorStop(soft, `rgba(${r},${g},${b},${a * .5})`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return c;
  };
  const FL = [sprite(255, 212, 110), sprite(255, 160, 36), sprite(244, 96, 18), sprite(150, 34, 8)];
  const SM = sprite(120, 112, 106, .9, .6), EM = sprite(255, 214, 120);
  const flames = [], smoke = [], embers = [];
  let emitters = [];
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1); W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.max(1, W * dpr); canvas.height = Math.max(1, H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.max(6, Math.ceil(W / 64));
    emitters = Array.from({ length: n }, (_, i) => { const x = (i + .5) * W / n, e = Math.min(x, W - x) / W; return { x, ph: Math.random() * 6.3, sp: .8 + Math.random() * 1.4, boost: e < .18 ? 1.9 : e < .3 ? 1.35 : 1 }; });
  };
  resize(); const ro = 'ResizeObserver' in window ? new ResizeObserver(resize) : null; ro?.observe(canvas);
  const base = () => Math.max(70, H * .2);
  const spawn = dt => {
    for (const em of emitters) {
      const h = base() * em.boost * (0.7 + 0.45 * Math.sin(clock * em.sp * 2.2 + em.ph) + 0.2 * Math.sin(clock * 5.3 + em.ph * 2));
      const k = 70 * intensity * dt; let m = Math.floor(k) + (Math.random() < k % 1 ? 1 : 0);
      while (m--) {
        const life = .55 + Math.random() * .5;
        flames.push({ x: em.x + (Math.random() + Math.random() - 1) * 26, y: H + 6, tx: em.x, vy: -Math.max(40, h) / life, life: 0, max: life, size: (30 + Math.random() * 26) * Math.min(1.25, em.boost), w: Math.random() * 6.3 });
      }
      if (Math.random() < 1.4 * intensity * dt * em.boost) smoke.push({ x: em.x + (Math.random() - .5) * 40, y: H - h * (0.85 + Math.random() * .3), vx: (Math.random() - .5) * 16, vy: -(22 + Math.random() * 26), life: 0, max: 4 + Math.random() * 3, size: 70 + Math.random() * 70, ph: Math.random() * 6 });
      if (Math.random() < 2.2 * intensity * dt * em.boost) embers.push({ x: em.x + (Math.random() - .5) * 30, y: H - h * Math.random() * .7, vx: (Math.random() - .5) * 40, vy: -(90 + Math.random() * 170), life: 0, max: 1.4 + Math.random() * 2, ph: Math.random() * 6 });
    }
  };
  const step = dt => {
    clock += dt; spawn(dt);
    for (const a of [flames, smoke, embers]) for (let i = a.length - 1; i >= 0; i--) { const p = a[i]; p.life += dt; if (p.life >= p.max) a.splice(i, 1); }
    for (const p of flames) { const t = p.life / p.max; p.x += ((p.tx - p.x) * 2.2 + Math.sin(clock * 7 + p.w) * 22 * t) * dt; p.y += p.vy * dt; }
    for (const p of smoke) { p.x += (p.vx + Math.sin(p.life * 1.2 + p.ph) * 12) * dt; p.y += p.vy * dt; p.size += 26 * dt; }
    for (const p of embers) { p.x += (p.vx + Math.sin(p.life * 6 + p.ph) * 34) * dt; p.y += p.vy * dt; p.vy *= .995; }
  };
  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    for (const p of smoke) { const t = p.life / p.max; ctx.globalAlpha = Math.sin(Math.PI * t) * .3; ctx.drawImage(SM, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, H, 0, H - base() * 1.6); g.addColorStop(0, 'rgba(255,120,20,.35)'); g.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, H - base() * 1.6, W, base() * 1.6);
    for (const p of flames) {
      const t = p.life / p.max, spr = FL[Math.min(3, Math.floor(t * 4.2))];
      const s = p.size * (1 - t * .78);
      ctx.globalAlpha = Math.pow(1 - t, .7) * .42;
      ctx.drawImage(spr, p.x - s / 2, p.y - s * .8, s, s * 1.6);
    }
    for (const p of embers) { const t = p.life / p.max; ctx.globalAlpha = 1 - t; ctx.drawImage(EM, p.x - 3, p.y - 3, 6, 6); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  };
  if (reduced) { for (let i = 0; i < 180; i++) step(1 / 60); draw(); return () => { ro?.disconnect(); }; }
  const loop = now => { if (!alive) return; const dt = Math.min(.05, (now - last) / 1000); last = now; step(dt); draw(); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  return () => { alive = false; cancelAnimationFrame(raf); ro?.disconnect(); };
}
let celeStop = null;
async function mountCelebration(host, opts) {
  stopCelebration();
  await loadGraffitiFonts();
  host.innerHTML = celebrationHtml(opts);
  const cv = $('.cele-fire', host);
  celeStop = startFire(cv, { intensity: opts.compact ? .6 : 1 });
  requestAnimationFrame(() => host.querySelector('.cele')?.classList.add('go'));
}
function stopCelebration() { if (celeStop) { celeStop(); celeStop = null; } }
