// Sculpt — prévia conceitual (Bruno Luque). Ideia central: "Esculpir com luz".
// Um relevo só aparece quando a luz passa de lado. As placas são mapas de altura procedurais
// (curvas abstratas, nunca rosto ou corpo) iluminadas em canvas: normal · direção da luz.
// Motion (vanilla) faz a coreografia e as cenas ligadas à rolagem; Lenis só na roda do mouse.
// O conteúdo funciona sem este arquivo: os estados escondidos só existem depois de `motion-ready`.

const root = document.documentElement;
const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
const fineMQ = matchMedia('(hover: hover) and (pointer: fine)');
const wideMQ = matchMedia('(min-width: 900px)');
const reduce = reduceMQ.matches;
if (reduce) root.classList.add('reduce');

/* ---------------- tokens de motion ---------------- */
const EASE_OUT = [0.23, 1, 0.32, 1];
const EASE_IN_OUT = [0.77, 0, 0.175, 1];
const DUR = { press: 0.14, control: 0.22, panel: 0.34 };
const SPRING_LIGHT = { stiffness: 110, damping: 19 };   // luz que segue o ponteiro
const SPRING_SCENE = { stiffness: 170, damping: 26 };   // luz comandada pela rolagem
const SPRING_PILL = { type: 'spring', bounce: 0.16, duration: 0.42 };

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const D = Math.PI / 180;
const TAU = Math.PI * 2;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/* ================================================================== */
/* 1. Relevo: mapas de altura e iluminação                             */
/* ================================================================== */
// Paleta de luz: sombra taupe → areia → gesso (tons de 012/011).
const LUT = (() => {
  const stops = [[0, '#56483E'], [0.3, '#837364'], [0.55, '#B3A290'], [0.7, '#D3C4B2'], [0.82, '#E3D8C9'], [0.93, '#F1EADF'], [1, '#FFFBF5']];
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const r = new Uint8ClampedArray(256), g = new Uint8ClampedArray(256), b = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0; while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [t0, c0] = stops[k], [t1, c1] = stops[k + 1];
    const u = clamp((t - t0) / (t1 - t0));
    const A = hex(c0), B = hex(c1);
    r[i] = lerp(A[0], B[0], u); g[i] = lerp(A[1], B[1], u); b[i] = lerp(A[2], B[2], u);
  }
  return { r, g, b };
})();

// Desenhos do relevo. x ∈ [0, A], y ∈ [0, 1], A = largura/altura.
const groove = (d, w) => -Math.exp(-(d * d) / (w * w));
const HEIGHTS = {
  // base: três dobras largas e uma faixa com caneluras finas (gesso esculpido)
  base: (seed = 0) => (x, y, A) => {
    // faixas em relevo com chanfro nítido (a luz rasante desenha a borda) + ondulação larga
    let h = 0.012 * Math.sin(1.7 * x + 0.8 + seed) * Math.cos(2.3 * y + seed);
    const curves = [[0.24, 0.08, 2.1, 0.4, 0.035, 1], [0.55, 0.11, 1.5, 2.1, 0.06, 1.4], [0.83, 0.06, 2.7, 4.3, 0.025, 0.8]];
    for (const [c, a, f, p, w, s] of curves) {
      const d = Math.abs(y - (c + a * Math.sin((f * x) / Math.max(A, 0.6) * 3.3 + p + seed)));
      h += s * 0.02 * (1 - sstep(w - 0.009, w + 0.009, d));
    }
    const t = y - (0.4 + 0.08 * Math.sin(2.2 * x + 1.3 + seed));
    const band = 1 - sstep(0.035, 0.05, Math.abs(t));
    const q = x * 16 + seed; const fq = q - Math.round(q);
    h += band * groove(fq, 0.16) * 0.0035;
    return h;
  },
  // 01 Conversa: duas ondas concêntricas que se encontram
  conversa: () => (x, y, A) => {
    const r1 = Math.hypot(x - A * 0.38, y - 0.45), r2 = Math.hypot(x - A * 0.63, y - 0.56);
    const ring = (r) => { const q = r * 16; const f = q - Math.round(q); return groove(f, 0.13) * (1 - sstep(0.24, 0.3, r)); };
    return Math.min(ring(r1), ring(r2));
  },
  // 02 Avaliação: curvas de nível sobre uma cúpula suave
  avaliacao: () => (x, y, A) => {
    const cx = x - A / 2, cy = y - 0.5;
    const d = Math.exp(-(cx * cx * 1.1 + cy * cy * 1.35 + 0.18 * cx * cy) / 0.085);
    const t = d * 8;
    return (t - Math.sin(TAU * t) / TAU) / 8;
  },
  // 03 Plano: grade ortogonal e uma diagonal dentro de um círculo
  plano: () => (x, y, A) => {
    const cx = x - A / 2, cy = y - 0.5, r = Math.hypot(cx, cy);
    const inside = 1 - sstep(0.31, 0.35, r);
    const g = (q) => { const f = q - Math.round(q); return groove(f, 0.07); };
    const diag = groove((cx - cy) / Math.SQRT2, 0.012);
    return (g(cx * 7) + g(cy * 7)) * inside * 0.5 + groove(r - 0.4, 0.016) * 0.9 + diag * inside * 0.8;
  },
  // 04 Cuidado contínuo: uma única linha em espiral
  cuidado: () => (x, y, A) => {
    const cx = x - A / 2, cy = y - 0.5, r = Math.hypot(cx, cy), th = Math.atan2(cy, cx);
    return Math.cos(r * 52 - th) * (1 - sstep(0.36, 0.46, r)) * sstep(0, 0.04, r);
  },
};
const STEP_LAYERS = ['conversa', 'avaliacao', 'plano', 'cuidado'];
const STEP_AZ = [180, 270, 360, 405].map((a) => a * D);   // esquerda, alto, direita, rasante baixa
const STEP_EL = [0.46, 0.56, 0.46, 0.3];

class Relief {
  constructor(canvas, { layers, mask = null, res = 0.5, max = 520, az = 200 * D, el = 0.42, spring = SPRING_LIGHT }) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.defs = layers; this.mask = mask; this.res = res; this.max = max;
    this.weights = layers.map((l) => l.w ?? 1);
    this.L = { az, el, taz: az, tel: el, vaz: 0, vel: 0 };
    this.spring = spring;
    this.visible = true; this.dirty = true; this.built = false;
    this.lastW = 0; this.lastH = 0;
  }
  build() {
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    if (!cw || !ch) return false;
    if (Math.abs(cw - this.lastW) < 2 && Math.abs(ch - this.lastH) < 2 && this.built) return true;
    this.lastW = cw; this.lastH = ch;
    const W = Math.max(40, Math.round(Math.min(this.max, cw * this.res)));
    const H = Math.max(30, Math.round((W * ch) / cw));
    this.canvas.width = W; this.canvas.height = H;
    this.W = W; this.H = H; this.img = this.ctx.createImageData(W, H);
    const A = W / H, dx = 1 / H;
    const isWide = cw >= 900;
    this.layers = this.defs.map((def) => {
      const fn = HEIGHTS[def.name](def.seed || 0);
      const h = new Float32Array(W * H);
      for (let j = 0; j < H; j++) {
        const y = (j + 0.5) / H;
        for (let i = 0; i < W; i++) {
          const x = (i + 0.5) / H;
          let v = fn(x, y, A);
          if (this.mask) v *= this.mask(x, y, A, isWide);
          h[j * W + i] = v;
        }
      }
      const gx = new Float32Array(W * H), gy = new Float32Array(W * H);
      const mags = [];
      for (let j = 0; j < H; j++) {
        for (let i = 0; i < W; i++) {
          const k = j * W + i;
          const l = h[j * W + Math.max(0, i - 1)], r = h[j * W + Math.min(W - 1, i + 1)];
          const u = h[Math.max(0, j - 1) * W + i], d = h[Math.min(H - 1, j + 1) * W + i];
          gx[k] = (r - l) / (2 * dx); gy[k] = (d - u) / (2 * dx);
          if ((k & 7) === 0) mags.push(Math.hypot(gx[k], gy[k]));
        }
      }
      mags.sort((a, b) => a - b);
      const p = mags[Math.floor(mags.length * 0.985)] || 1;
      const s = (def.strength || 1.2) / (p || 1);
      for (let k = 0; k < gx.length; k++) { gx[k] *= s; gy[k] *= s; }
      return { gx, gy };
    });
    this.built = true; this.dirty = true;
    return true;
  }
  render() {
    if (!this.built) return;
    const { W, H, img, layers, weights } = this;
    const { az, el } = this.L;
    const ce = Math.cos(el), lx = ce * Math.cos(az), ly = ce * Math.sin(az), lz = Math.sin(el);
    let hx = lx, hy = ly, hz = lz + 1; const hn = 1 / Math.hypot(hx, hy, hz); hx *= hn; hy *= hn; hz *= hn;
    const scale = (0.76 * 255) / Math.sin(0.46);
    const data = img.data, n = W * H;
    const act = layers.map((l, i) => [l, weights[i]]).filter(([, w]) => w > 0.002);
    const { r: R, g: G, b: B } = LUT;
    for (let k = 0, p = 0; k < n; k++, p += 4) {
      let gx = 0, gy = 0;
      for (let m = 0; m < act.length; m++) { const w = act[m][1], l = act[m][0]; gx += l.gx[k] * w; gy += l.gy[k] * w; }
      const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      let d = (-gx * lx - gy * ly + lz) * inv; if (d < 0) d = 0;
      let s = (-gx * hx - gy * hy + hz) * inv; if (s < 0) s = 0;
      s *= s; s *= s; s *= s; s *= s; s *= s; // ^32
      let v = d * scale + s * 46; if (v > 255) v = 255;
      const c = v | 0;
      data[p] = R[c]; data[p + 1] = G[c]; data[p + 2] = B[c]; data[p + 3] = 255;
    }
    this.ctx.putImageData(img, 0, 0);
    if (!this.canvas.classList.contains('is-on')) this.canvas.classList.add('is-on');
    this.dirty = false;
  }
  setTarget(az, el, snap = false) {
    const L = this.L;
    // menor caminho angular
    let t = az; while (t - L.az > Math.PI) t -= TAU; while (t - L.az < -Math.PI) t += TAU;
    L.taz = t; L.tel = el;
    if (snap) { L.az = t; L.el = el; L.vaz = L.vel = 0; this.dirty = true; }
  }
  setTargetRaw(az, el) { this.L.taz = az; this.L.tel = el; } // sem atalho angular (cena com rotação contínua)
  step(dt) {
    const L = this.L, { stiffness: k, damping: c } = this.spring;
    const fa = -k * (L.az - L.taz) - c * L.vaz, fe = -k * (L.el - L.tel) - c * L.vel;
    L.vaz += fa * dt; L.az += L.vaz * dt; L.vel += fe * dt; L.el += L.vel * dt;
    const moving = Math.abs(L.az - L.taz) + Math.abs(L.el - L.tel) + Math.abs(L.vaz) * 0.05 + Math.abs(L.vel) * 0.05 > 0.0015;
    if (moving) this.dirty = true;
    else if (L.az !== L.taz || L.el !== L.tel) { L.az = L.taz; L.el = L.tel; L.vaz = L.vel = 0; this.dirty = true; }
    return moving;
  }
}

/* ---------------- motor: um único rAF, pausado quando nada muda ---------------- */
const reliefs = new Set();
let raf = 0, lastT = 0;
const onFrameHooks = new Set();
function kick() { if (!raf && !document.hidden) { lastT = 0; raf = requestAnimationFrame(loop); } }
function loop(t) {
  const dt = Math.min(0.034, lastT ? (t - lastT) / 1000 : 0.016); lastT = t;
  let busy = false;
  for (const r of reliefs) {
    if (!r.visible) continue;
    if (!reduce && r.step(dt)) busy = true;
    if (r.dirty) r.render();
  }
  onFrameHooks.forEach((f) => f());
  raf = busy ? requestAnimationFrame(loop) : 0;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const r = e.target.__relief; if (!r) continue;
    r.visible = e.isIntersecting;
    if (r.visible) { if (!r.built) r.build(); r.dirty = true; kick(); }
  }
}, { rootMargin: '120px 0px' });
const ro = new ResizeObserver((entries) => {
  for (const e of entries) { const r = e.target.__relief; if (r && r.built) { r.built = false; } }
  clearTimeout(ro._t);
  ro._t = setTimeout(() => { reliefs.forEach((r) => { if (!r.built && r.visible) r.build(); }); kick(); }, 140);
});
function makeRelief(canvas, opts) {
  const r = new Relief(canvas, opts);
  canvas.__relief = r; reliefs.add(r);
  r.visible = false; io.observe(canvas); ro.observe(canvas);
  return r;
}

/* ---------------- placas da página ---------------- */
const heroMask = (x, y, A, wide) => (wide ? 0.1 + 0.9 * sstep(A * 0.36, A * 0.6, x) : 0.15 + 0.85 * sstep(0.42, 0.68, y));
const contactMask = (x, y, A, wide) => (wide ? 0.08 + 0.92 * sstep(A * 0.4, A * 0.75, x) : 0.15 + 0.85 * sstep(0.35, 0.75, y));

const heroCanvas = $('[data-relief="hero"]');
const hero = heroCanvas && makeRelief(heroCanvas, { layers: [{ name: 'base', seed: 0, strength: 0.95 }], mask: heroMask, res: 0.5, max: 760, az: 180 * D, el: reduce ? 0.42 : 0.14 });
const contactCanvas = $('[data-relief="contact"]');
const contact = contactCanvas && makeRelief(contactCanvas, { layers: [{ name: 'base', seed: 2.4, strength: 0.85 }], mask: contactMask, res: 0.5, max: 720 });

const sceneCanvas = $('[data-relief="scene"]');
const scene = sceneCanvas && makeRelief(sceneCanvas, {
  layers: [{ name: 'base', seed: 1.1, strength: 0.6, w: 0.35 }, ...STEP_LAYERS.map((name, i) => ({ name, strength: 1.5, w: i === 0 ? 1 : 0 }))],
  res: 0.5, max: 420, az: STEP_AZ[0], el: STEP_EL[0], spring: SPRING_SCENE,
});
const stepReliefs = $$('[data-relief="step"]').map((c) => {
  const i = +c.dataset.layer;
  const r = makeRelief(c, { layers: [{ name: 'base', seed: 1.1 + i, strength: 0.55, w: 0.35 }, { name: STEP_LAYERS[i], strength: 1.5 }], res: 1, max: 440, az: STEP_AZ[i] - (reduce ? 0 : 110 * D), el: reduce ? STEP_EL[i] : 0.1 });
  r.index = i; return r;
});
const panelReliefs = $$('[data-relief="panel"]').map((c, i) => makeRelief(c, {
  layers: [{ name: 'base', seed: 3.3 + i * 1.7, strength: 1.2 }, { name: i ? 'cuidado' : 'conversa', strength: 0.5, w: 0.35 }],
  res: 0.55, max: 380, az: (c.dataset.side === 'right' ? 340 : 200) * D, el: 0.44,
}));

/* ---------------- luz global (variáveis CSS para nicho, botões e letras) ---------------- */
// A luz dominante na tela atualiza --lx/--ly/--lit-from. Só escreve quando muda.
let cssLight = { az: NaN };
let globalSource = hero;
function writeCssLight() {
  const src = globalSource; if (!src) return;
  const az = src.L.az;
  if (Math.abs(az - cssLight.az) < 0.004) return;
  cssLight.az = az;
  const s = root.style;
  s.setProperty('--lx', Math.cos(az).toFixed(3));
  s.setProperty('--ly', Math.sin(az).toFixed(3));
  s.setProperty('--lit-from', ((az / D + 90) % 360).toFixed(1) + 'deg');
}
onFrameHooks.add(writeCssLight);

/* ================================================================== */
/* 2. Interface: topo, Lenis, âncoras, CTA fixo, copiar, abas          */
/* ================================================================== */
const top = $('[data-top]');
const onScrollTop = () => top.classList.toggle('is-solid', scrollY > 24);
addEventListener('scroll', onScrollTop, { passive: true }); onScrollTop();

let lenis = null;
function startLenis() {
  if (reduce || !window.Lenis || lenis || !fineMQ.matches) return;
  lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.95 });
  const tick = (t) => { if (!lenis) return; lenis.raf(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
if (window.Lenis) startLenis(); else addEventListener('load', startLenis, { once: true });
reduceMQ.addEventListener('change', () => { if (reduceMQ.matches && lenis) { lenis.destroy(); lenis = null; } });

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href');
  const target = id === '#inicio' ? document.body : $(id);
  if (!target) return;
  e.preventDefault();
  const offset = id === '#inicio' ? 0 : -(top.offsetHeight + 8);
  if (lenis) lenis.scrollTo(id === '#inicio' ? 0 : target, { offset, duration: 1.3, easing: (t) => 1 - Math.pow(1 - t, 4) });
  else scrollTo({ top: id === '#inicio' ? 0 : target.getBoundingClientRect().top + scrollY + offset, behavior: reduce ? 'auto' : 'smooth' });
  if (id !== '#inicio') { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
});

// CTA fixo no celular: aparece depois do hero, some no contato e no rodapé
const sticky = $('[data-sticky]');
if (sticky) {
  const zones = new Map();
  const upd = () => sticky.classList.toggle('is-on', !zones.get('hero') && !zones.get('contato') && !zones.get('foot'));
  const zio = new IntersectionObserver((es) => { es.forEach((e) => zones.set(e.target.dataset.zone, e.isIntersecting)); upd(); }, { threshold: 0 });
  [[$('[data-hero]'), 'hero'], [$('#contato'), 'contato'], [$('.foot'), 'foot']].forEach(([el, z]) => { if (el) { el.dataset.zone = z; zio.observe(el); } });
}

// Mensagens: copiar e abrir o Direct (a mensagem também vai para a área de transferência)
const MSG = {
  geral: 'Olá! Gostaria de agendar uma avaliação na Sculpt.',
  rosto: 'Olá! Gostaria de saber mais sobre os cuidados para o rosto na Sculpt.',
  corpo: 'Olá! Gostaria de saber mais sobre os cuidados corporais na Sculpt.',
};
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch {
    const ta = document.createElement('textarea');
    ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove(); return ok;
  }
}
const toastEl = $('[data-toast]');
let toastT = 0;
function toast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg; toastEl.classList.add('is-on');
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('is-on'), 2600);
}
$$('[data-copy]').forEach((b) => {
  b.hidden = false;
  let t = 0;
  b.addEventListener('click', async () => {
    const ok = await copyText(MSG[b.dataset.copy] || MSG.geral);
    b.classList.add('is-done'); clearTimeout(t); t = setTimeout(() => b.classList.remove('is-done'), 1900);
    toast(ok ? 'Mensagem copiada. Abra o Direct e cole na conversa.' : 'Não foi possível copiar. Selecione o texto da mensagem.');
  });
});
$$('a[data-direct]').forEach((a) => a.addEventListener('click', () => {
  copyText(MSG[a.dataset.msg] || MSG.geral).then((ok) => { if (ok) toast('Mensagem copiada. Cole no Direct da Sculpt.'); });
}));

// Abas Rosto / Corpo (teclado: setas, Home, End)
const tabs = $$('[data-tab]');
const panels = $$('[data-panel]');
const pill = $('[data-pill]');
const tabsBox = $('[data-tabs]');
let activeTab = 0;
let animateFn = null;
panels.forEach((p, i) => { if (i) p.hidden = true; });
function placePill(animate) {
  if (!pill) return;
  const t = tabs[activeTab], br = tabsBox.getBoundingClientRect(), r = t.getBoundingClientRect();
  const to = { transform: `translate(${r.left - br.left}px, ${r.top - br.top}px)`, width: r.width + 'px', height: r.height + 'px' };
  if (!animate || !animateFn || reduce) { Object.assign(pill.style, to, { opacity: 1 }); return; }
  animateFn(pill, to, SPRING_PILL);
}
function selectTab(i, focus) {
  if (i === activeTab) { if (focus) tabs[i].focus(); return; }
  const dir = i > activeTab ? 1 : -1;
  const prev = panels[activeTab], next = panels[i];
  tabs[activeTab].setAttribute('aria-selected', 'false'); tabs[activeTab].tabIndex = -1;
  tabs[i].setAttribute('aria-selected', 'true'); tabs[i].tabIndex = 0;
  activeTab = i;
  if (focus) tabs[i].focus();
  placePill(true);
  prev.hidden = true; next.hidden = false;
  const pr = panelReliefs[i];
  if (pr) {
    // a luz atravessa a placa: começa do lado oposto e assenta
    const side = next.querySelector('canvas').dataset.side === 'right' ? 340 : 200;
    if (!reduce) { pr.setTarget((side + 150 * dir) * D, 0.16, true); }
    if (!pr.built) pr.build();
    pr.visible = true; pr.setTarget(side * D, 0.44, reduce); kick();
  }
  if (animateFn && !reduce) {
    animateFn(next.querySelector('.panel__copy'), { opacity: [0, 1], transform: [`translateX(${28 * dir}px)`, 'translateX(0px)'] }, { duration: DUR.panel + 0.1, ease: EASE_OUT });
  }
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(i));
  t.addEventListener('keydown', (e) => {
    const k = e.key; let n = null;
    if (k === 'ArrowRight' || k === 'ArrowDown') n = (activeTab + 1) % tabs.length;
    if (k === 'ArrowLeft' || k === 'ArrowUp') n = (activeTab - 1 + tabs.length) % tabs.length;
    if (k === 'Home') n = 0; if (k === 'End') n = tabs.length - 1;
    if (n !== null) { e.preventDefault(); selectTab(n, true); }
  });
});
if (tabsBox) {
  if (!pill) tabsBox.classList.add('no-pill');
  addEventListener('resize', () => placePill(false));
  document.fonts?.ready.then(() => placePill(false));
  placePill(false);
}

/* ================================================================== */
/* 3. Luz: ponteiro (desktop) e rolagem (celular)                       */
/* ================================================================== */
const heroEl = $('[data-hero]');
const sceneEl = $('[data-scene]');
let sceneActive = false;
const HERO_REST = { az: 205 * D, el: 0.44 };

if (!reduce && fineMQ.matches) {
  // a luz vem do lado do cursor; quanto mais longe do centro, mais rasante
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || sceneActive) return;
    const cx = innerWidth * 0.62, cy = innerHeight * 0.5;
    const dx = e.clientX - cx, dy = e.clientY - cy;
    const dist = clamp(Math.hypot(dx / innerWidth, dy / innerHeight) / 0.62);
    const az = Math.atan2(dy, dx), el = lerp(0.62, 0.2, dist);
    [hero, contact].forEach((r) => r && r.setTarget(az, el));
    kick();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { [hero, contact].forEach((r) => r && r.setTarget(HERO_REST.az, HERO_REST.el)); kick(); });
}

/* ================================================================== */
/* 4. Coreografia (Motion)                                             */
/* ================================================================== */
const M = window.Motion || null;
if (!M) console.warn('Motion indisponível; página segue estática.');
const prog = (p) => (typeof p === 'number' ? p : p?.y?.progress ?? 0);

// Cena presa só no desktop com movimento; senão, placas empilhadas.
const usePin = !reduce && !!M && wideMQ.matches && !!scene;
if (usePin) root.classList.add('pinned');
else if (scene) { reliefs.delete(scene); io.unobserve(sceneCanvas); }
if (!usePin) {/* etapas em lista: todas acesas */}

if (reduce) {
  root.classList.add('motion-ready');
  if (hero) hero.setTarget(HERO_REST.az, HERO_REST.el, true);
  stepReliefs.forEach((r) => { r.setTarget(STEP_AZ[r.index], STEP_EL[r.index], true); });
  kick();
} else if (M) {
  const { animate, scroll, inView, stagger } = M;
  animateFn = (...a) => animate(...a);
  root.classList.add('motion-ready');

  /* ---- ASSINATURA 1: hero. Texto entra já; a luz chega da esquerda e o retrato sobe no nicho ---- */
  animate('.hero__title .line > span', { transform: ['translateY(108%)', 'translateY(0%)'] }, { duration: 0.95, delay: stagger(0.09), ease: EASE_OUT });
  animate('.hero__lead, .hero__actions', { opacity: [0, 1], transform: ['translateY(12px)', 'translateY(0px)'] }, { duration: 0.7, delay: stagger(0.08, { startDelay: 0.3 }), ease: EASE_OUT });
  animate('.niche__cut', { clipPath: ['inset(100% 0 0 0 round 999px 999px 4px 4px)', 'inset(0% 0 0 0 round 999px 999px 4px 4px)'] }, { duration: 1.25, delay: 0.2, ease: EASE_IN_OUT });
  animate('.niche__cut img', { transform: ['translateY(8%) scale(1.06)', 'translateY(0%) scale(1)'] }, { duration: 1.6, delay: 0.2, ease: EASE_OUT });
  animate('.niche__label', { opacity: [0, 1] }, { duration: 0.6, delay: 1.1 });
  if (hero) {
    // entrada curta da luz: rasante pela esquerda → repouso
    hero.setTarget(180 * D, 0.12, true);
    setTimeout(() => { hero.setTarget(HERO_REST.az, HERO_REST.el); [contact].forEach((r) => r && r.setTarget(HERO_REST.az, HERO_REST.el, true)); kick(); }, 180);
    kick();
  }

  // celular: a rolagem varre a luz sobre o hero e o contato
  if (!fineMQ.matches) {
    scroll((p) => { const t = prog(p); hero && hero.setTarget((205 + t * 120) * D, 0.44 - t * 0.18); kick(); }, { target: heroEl, offset: ['start start', 'end start'] });
    const ct = $('[data-contact]');
    scroll((p) => { const t = prog(p); contact && contact.setTarget((150 + t * 110) * D, 0.3 + t * 0.14); kick(); }, { target: ct, offset: ['start end', 'end end'] });
  }

  // saída do hero: o nicho sobe um pouco mais devagar que a página
  scroll((p) => { const t = prog(p); const n = $('[data-niche]'); n.style.transform = `translateY(${(t * -40).toFixed(1)}px)`; }, { target: heroEl, offset: ['start start', 'end start'] });

  /* ---- ASSINATURA 2: Quatro luzes ---- */
  const steps = $$('[data-step]');
  if (usePin) {
    const lamp = $('[data-lamp]');
    const count = $('[data-count]');
    const stage = $('[data-stage]');
    let current = -1;
    steps.forEach((s) => s.classList.remove('is-active'));
    const showStep = (i) => {
      if (i === current) return;
      const prev = steps[current], next = steps[i], dir = i > current ? 1 : -1;
      current = i;
      if (prev) animate(prev, { opacity: [1, 0], transform: `translateY(${-14 * dir}px)`, filter: 'blur(4px)' }, { duration: 0.26, ease: EASE_OUT })
        .then(() => { if (steps[current] !== prev) prev.classList.remove('is-active'); });
      next.classList.add('is-active');
      animate(next, { opacity: [0, 1], transform: [`translateY(${20 * dir}px)`, 'translateY(0px)'], filter: ['blur(4px)', 'blur(0px)'] }, { duration: 0.5, delay: 0.06, ease: EASE_OUT });
      count.textContent = String(i + 1).padStart(2, '0');
    };
    showStep(0);
    const placeLamp = () => {
      const R = stage.querySelector('.orbit').offsetWidth / 2;
      const az = scene.L.az;
      lamp.style.transform = `translate(${(Math.cos(az) * R).toFixed(1)}px, ${(Math.sin(az) * R).toFixed(1)}px)`;
    };
    onFrameHooks.add(placeLamp);
    const renderScene = (p) => {
      const f = clamp(p * 4.2 - 0.6, 0, 3);
      const i0 = Math.floor(f), i1 = Math.min(3, i0 + 1), u = sstep(0.25, 0.75, f - i0);
      const az = lerp(STEP_AZ[i0], STEP_AZ[i1], u);
      let el = lerp(STEP_EL[i0], STEP_EL[i1], u);
      el *= 1 - 0.6 * sstep(0.9, 1, p);                 // fim da cena: a luz desce e a sombra se alonga
      scene.weights = [0.35, 0, 0, 0, 0];
      scene.weights[1 + i0] += 1 - u; scene.weights[1 + i1] += u;
      scene.setTargetRaw(az, el); scene.dirty = true;
      showStep(Math.min(3, Math.round(f)));
      kick();
    };
    scroll((p) => renderScene(prog(p)), { target: sceneEl, offset: ['start start', 'end end'] });
    // enquanto a cena está presa, a luz dela comanda nicho, botões e letras
    const sio = new IntersectionObserver(([e]) => {
      const r = e.boundingClientRect;
      sceneActive = e.isIntersecting && r.top <= 2 && r.bottom >= innerHeight - 2;
    }, { threshold: [0, 0.01, 0.99, 1] });
    sio.observe(sceneEl);
    scroll(() => {
      const r = sceneEl.getBoundingClientRect();
      sceneActive = r.top <= 2 && r.bottom >= innerHeight - 2;
      globalSource = sceneActive ? scene : (r.top > 0 ? hero : contact);
    });
  } else {
    // celular / sem pin: cada placa recebe a luz ao entrar (varredura curta)
    stepReliefs.forEach((r) => {
      inView(r.canvas, () => { r.setTarget(STEP_AZ[r.index], STEP_EL[r.index]); kick(); }, { amount: 0.45 });
    });
    scroll(() => { const r = sceneEl.getBoundingClientRect(); globalSource = r.top > innerHeight * 0.5 ? hero : contact; });
  }

  /* ---- NARRATIVA 1: a sombra do relevo se alonga e escurece a seção seguinte ---- */
  const duskShadow = $('[data-dusk-shadow]');
  if (duskShadow) {
    duskShadow.style.transform = 'scaleY(.08)';
    scroll((p) => { const t = sstep(0, 1, prog(p)); duskShadow.style.transform = `scaleY(${(0.08 + 1.32 * t).toFixed(3)})`; }, { target: $('[data-dusk]'), offset: ['start end', 'end 0.6'] });
  }

  /* ---- NARRATIVA 2: passagem de luz pelos títulos ---- */
  $$('.sweep').forEach((h) => inView(h, () => { h.classList.add('is-lit'); }, { amount: 0.8 }));

  /* ---- NARRATIVA 3: letras gravadas surgem com a luz (escala de profundidade) ---- */
  const carve = $('[data-carve]');
  if (carve && carve.getBoundingClientRect().top > innerHeight) {
    const words = $$('span', carve);
    words.forEach((w) => { w.style.opacity = 0.0001; w.style.clipPath = 'inset(0 100% 0 0)'; });
    inView(carve, () => {
      animate(words, { opacity: [0.0001, 1], clipPath: ['inset(0 100% -10% 0)', 'inset(0 0% -10% 0)'] }, { duration: 1.1, delay: stagger(0.14), ease: EASE_IN_OUT });
    }, { amount: 0.35 });
  }

  /* ---- Interface: pressão com retorno imediato nos botões principais ---- */
  // (CSS :active) — aqui só a pílula das abas usa mola.
}

/* ---------------- dica do ponteiro some depois do primeiro movimento ---------------- */
const hint = $('[data-hint]');
if (hint && (!fineMQ.matches || reduce)) hint.hidden = true;
else if (hint) addEventListener('pointermove', function once() { setTimeout(() => hint.style.opacity = '0', 2200); hint.style.transition = 'opacity .8s ease'; removeEventListener('pointermove', once); }, { passive: true });

/* ---------------- primeiro quadro ---------------- */
reliefs.forEach((r) => { if (r.canvas.getBoundingClientRect().top < innerHeight + 200) { r.visible = true; r.build(); } });
kick();
