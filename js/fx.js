// ============================================================
//  Efeitos especiais (inspirados em sites de animação, feitos
//  do zero para o KAI, em preto e branco):
//   - slats(host)        micro ripas: barrinhas que ondulam e
//                        acendem perto do dedo/mouse
//   - electric(nome)     ícone com brilho elétrico (neon)
//   - techText(el)       caixa "técnica" com medidas na última letra
//   - carousel(host,…)   carrossel circular 3D de fotos
//   - holdButton/bindHold/holdConfirm  "segure para confirmar"
//  Com as animações desligadas, tudo fica parado (mas funcionando).
// ============================================================
import { icon } from './icons.js';
import { openDialog } from './ui.js';
import { esc } from './util.js';
import { burst } from './anim.js';

const animOn = () => document.documentElement.classList.contains('anim');

// Roda um laço de animação só enquanto o elemento existe e aparece na tela
function loop(el, frame, fps = 40) {
  let visible = true, last = 0, raf = 0;
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) raf = requestAnimationFrame(tick);
  }) : null;
  io?.observe(el);
  function tick(now) {
    raf = 0;
    if (!el.isConnected) { io?.disconnect(); return; }
    if (!visible || !animOn()) return;
    if (now - last >= 1000 / fps) { last = now; frame(now); }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  return () => { if (!raf && visible && el.isConnected) raf = requestAnimationFrame(tick); };
}

// ============================================================
//  Micro ripas
// ============================================================
export function slats(host) {
  if (!host || host.querySelector(':scope > canvas.slats')) return;
  const c = document.createElement('canvas');
  c.className = 'slats';
  c.setAttribute('aria-hidden', 'true');
  host.prepend(c);
  host.classList.add('has-slats');
  const ctx = c.getContext('2d');
  let W = 0, H = 0, px = -9999, py = -9999, glowT = 0;
  const BW = 5, GX = 4, BH = 20, GY = 5;

  const resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = host.clientWidth; H = host.clientHeight;
    c.width = Math.max(1, W * dpr); c.height = Math.max(1, H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(performance.now());
  };
  const bar = (x, y, w, h) => {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, w / 2); ctx.fill(); }
    else ctx.fillRect(x, y, w, h);
  };
  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    const cols = Math.floor((W + GX) / (BW + GX)), rows = Math.floor((H + GY) / (BH + GY));
    const ox = (W - (cols * (BW + GX) - GX)) / 2, oy = (H - (rows * (BH + GY) - GY)) / 2;
    const near = Math.max(0, 1 - (t - glowT) / 1400); // brilho do dedo some devagar
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const x = ox + k * (BW + GX), y = oy + r * (BH + GY);
        const w1 = .5 + .5 * Math.sin(x * .017 - y * .012 - t * .0011);
        const w2 = .5 + .5 * Math.sin((x + y * 1.7) * .006 + t * .0006);
        let v = Math.pow(w1 * .65 + w2 * .35, 3) * (.35 + .65 * (1 - x / W) * (y / H + .2));
        const d = Math.hypot(x - px, y - py);
        v += Math.max(0, 1 - d / 110) * .9 * near;
        ctx.fillStyle = `rgba(255,255,255,${(.045 + Math.min(1, v) * .32).toFixed(3)})`;
        bar(x, y, BW, BH);
      }
    }
  }
  const move = e => {
    const r = c.getBoundingClientRect();
    px = e.clientX - r.left; py = e.clientY - r.top; glowT = performance.now();
    if (!animOn()) draw(performance.now());
  };
  host.addEventListener('pointermove', move, { passive: true });
  host.addEventListener('pointerdown', move, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(host);
  resize();
  loop(c, draw, 30);
}

// ============================================================
//  Logotipo elétrico
// ============================================================
let fid = 0;
export function electric(name = 'calendar', size = 96) {
  const id = `elec${++fid}`;
  const inner = icon(name).replace(/^<svg[^>]*>|<\/svg>$/g, '');
  const anim = animOn();
  return `<span class="electric ${anim ? 'live' : ''}" style="--s:${size}px" aria-hidden="true">
    <svg viewBox="-2 -2 28 28" width="${size}" height="${size}">
      <defs>
        <filter id="${id}" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="2" result="n">
            ${anim ? '<animate attributeName="seed" values="1;5;9;3;7;2;8;4" dur="0.7s" repeatCount="indefinite" calcMode="discrete"/>' : ''}
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.1" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
        <filter id="${id}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.1"/></filter>
      </defs>
      <g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
        <g filter="url(#${id}b)" stroke-width="2.6" opacity=".75">${inner}</g>
        <g filter="url(#${id})" stroke-width="1.5">${inner}</g>
        <g stroke-width=".55">${inner}</g>
      </g>
    </svg></span>`;
}

// ============================================================
//  Texto técnico: caixa tracejada + medidas na última letra
// ============================================================
export function techText(el) {
  if (!el || el.querySelector('.tech')) return;
  const txt = el.textContent;
  if (!txt.trim()) return;
  const i = txt.trimEnd().length - 1;
  el.innerHTML = `${esc(txt.slice(0, i))}<span class="tech">${esc(txt[i])}<svg class="tb" aria-hidden="true"><rect width="100%" height="100%"/></svg>`
    + '<i class="th a"></i><i class="th b"></i><i class="th c"></i><i class="th d"></i>'
    + `<b class="tdim" aria-hidden="true"></b></span>${esc(txt.slice(i + 1))}`;
  const span = el.querySelector('.tech');
  const r = span.getBoundingClientRect();
  span.querySelector('.tdim').textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`;
}

// ============================================================
//  Carrossel circular 3D
//  items: [{ path, cap, href }]  (as fotos são preenchidas por data-img)
// ============================================================
export function carousel(host, items) {
  if (!host || items.length < 3) return;
  let list = [...items];
  while (list.length < 6) list = list.concat(items);
  list = list.slice(0, 14);
  const n = list.length;
  host.innerHTML = `<div class="car3d" role="region" aria-label="Carrossel do mapa dos sonhos (arraste para girar)">
    <div class="car-ring">${list.map((it, i) => `
      <a class="car-item ph-wrap" href="${it.href}" data-i="${i}" draggable="false">
        <img data-img="${esc(it.path)}" alt="${esc(it.cap)}" draggable="false"><span>${esc(it.cap)}</span></a>`).join('')}</div></div>`;
  const stage = host.querySelector('.car3d'), ring = host.querySelector('.car-ring');
  const els = [...ring.children];
  let angle = 0, R = 0, vel = 0, dragging = false, moved = 0, lastX = 0;

  const layout = () => {
    const w = host.clientWidth;
    const iw = w < 420 ? 96 : w < 700 ? 120 : 150;
    stage.style.setProperty('--iw', `${iw}px`);
    R = Math.max(iw * .9, (iw + 14) / (2 * Math.tan(Math.PI / n)));
    R = Math.min(R, w * .62);
    els.forEach((e, i) => { e.style.transform = `rotateY(${i * 360 / n}deg) translateZ(${R}px)`; });
    paint();
  };
  const paint = () => {
    ring.style.transform = `translateZ(${-R}px) rotateY(${angle}deg)`;
    els.forEach((e, i) => {
      const a = ((i * 360 / n + angle) % 360 + 360) % 360;
      const f = (Math.cos(a * Math.PI / 180) + 1) / 2; // 1 = de frente
      e.style.opacity = (.25 + .75 * f).toFixed(2);
      e.style.filter = `grayscale(${(1 - f * .9).toFixed(2)}) brightness(${(.5 + .5 * f).toFixed(2)})`;
      e.style.zIndex = Math.round(f * 100);
    });
  };
  const onMove = e => {
    if (!dragging) return;
    const dx = e.clientX - lastX; lastX = e.clientX;
    moved += Math.abs(dx); vel = dx * .35; angle += vel;
    paint();
  };
  const up = () => {
    dragging = false;
    removeEventListener('pointermove', onMove); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
  };
  stage.addEventListener('pointerdown', e => {
    dragging = true; moved = 0; lastX = e.clientX; vel = 0;
    addEventListener('pointermove', onMove); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });
  // se arrastou, não abre a meta
  stage.addEventListener('click', e => { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);

  if ('ResizeObserver' in window) new ResizeObserver(layout).observe(host);
  layout();
  loop(stage, () => {
    if (dragging) return;
    vel *= .94;
    angle += Math.abs(vel) > .05 ? vel : -.12; // gira devagar sozinho
    paint();
  }, 50);
}

// ============================================================
//  Botão "segure para confirmar"
// ============================================================
export const holdButton = (label = 'Segure para confirmar', cls = '', id = '') =>
  `<button type="button" class="hold ${cls}" ${id ? `id="${id}"` : ''} data-hold><span class="hold-fill"></span><span class="hold-txt">${label}</span></button>`;

export function bindHold(btn, onDone, ms = 1300) {
  if (!btn) return;
  let raf = 0, timer = 0, t0 = 0, done = false;
  const txt = btn.querySelector('.hold-txt'), label = txt.textContent;
  const set = p => btn.style.setProperty('--p', p.toFixed(3));
  const tick = now => { set(Math.min(1, (now - t0) / ms)); raf = requestAnimationFrame(tick); };
  const start = e => {
    if (done || btn.disabled) return;
    e?.preventDefault?.();
    t0 = performance.now();
    btn.classList.add('holding');
    txt.textContent = 'Segurando…';
    raf = requestAnimationFrame(tick);
    timer = setTimeout(finish, ms);
  };
  const cancel = () => {
    if (done || !btn.classList.contains('holding')) return;
    cancelAnimationFrame(raf); clearTimeout(timer);
    btn.classList.remove('holding'); set(0);
    txt.textContent = label;
  };
  const finish = async () => {
    done = true; cancelAnimationFrame(raf); set(1);
    btn.classList.remove('holding'); btn.classList.add('held');
    txt.textContent = 'Confirmado ✓';
    const r = btn.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, 18);
    await onDone();
  };
  btn.addEventListener('pointerdown', start);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, cancel));
  btn.addEventListener('contextmenu', e => e.preventDefault());
  btn.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) start(e); });
  btn.addEventListener('keyup', e => { if (e.key === 'Enter' || e.key === ' ') cancel(); });
  btn.addEventListener('click', e => e.preventDefault());
}

// Janela que só confirma segurando o botão. Devolve true/false.
export function holdConfirm({ title, text, label = 'Segure para apagar', danger = true, ms = 1500 }) {
  return new Promise(resolve => {
    let ok = false;
    const d = openDialog({
      title,
      body: `<p class="muted" style="margin:0">${text}</p>${holdButton(label, danger ? 'danger' : '')}`,
      submitLabel: '',
    });
    d.addEventListener('close', () => resolve(ok));
    bindHold(d.querySelector('[data-hold]'), () => { ok = true; setTimeout(() => d.close(), 350); }, ms);
  });
}

// ============================================================
//  Placas de relógio (números virando, tipo aeroporto)
// ============================================================
export function flipNumber(el) {
  if (!el || el.classList.contains('flip')) return;
  const target = el.textContent.trim();
  if (!/^\d+$/.test(target)) return;
  el.classList.add('flip');
  el.setAttribute('aria-label', target);
  el.innerHTML = [...target].map(() => '<span class="fd" aria-hidden="true"><span class="fd-c">0</span></span>').join('');
  const cards = [...el.querySelectorAll('.fd-c')];
  const final = () => cards.forEach((c, i) => { c.textContent = target[i]; });
  if (!animOn()) return final();
  cards.forEach((c, i) => {
    const goal = Number(target[i]);
    let v = 0;
    const step = () => {
      if (!c.isConnected) return;
      c.textContent = v;
      c.classList.remove('go'); void c.offsetWidth; c.classList.add('go');
      if (v < goal) { v++; setTimeout(step, 110); }
    };
    setTimeout(step, 350 + i * 180);
  });
  setTimeout(final, 3500); // garante o número certo no fim
}

// ============================================================
//  Céu estrelado (fundo da tela Futuro)
// ============================================================
export function stars(host) {
  if (!host || host.querySelector(':scope > canvas.stars')) return;
  const c = document.createElement('canvas');
  c.className = 'stars';
  c.setAttribute('aria-hidden', 'true');
  host.prepend(c);
  const ctx = c.getContext('2d');
  let W = 0, H = 0, mx = 0, my = 0;
  const N = Math.min(220, Math.round(innerWidth * innerHeight / 6500));
  const list = Array.from({ length: N }, () => ({
    x: Math.random(), y: Math.random() * 3, z: .2 + Math.random() * .8,
    r: Math.random() < .08 ? 1.6 : .4 + Math.random() * .9, ph: Math.random() * 6.28, sp: .6 + Math.random() * 1.8,
  }));
  const resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    c.width = W * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(performance.now());
  };
  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    const sy = scrollY;
    for (const s of list) {
      let y = (s.y * H - sy * s.z * .35 + my * s.z * 10) % (H * 3);
      if (y < 0) y += H * 3;
      if (y > H) continue;
      const x = s.x * W + mx * s.z * 14;
      const a = (.25 + .6 * s.z) * (.55 + .45 * Math.sin(t * .001 * s.sp + s.ph));
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, s.r * (.6 + s.z * .6), 0, 6.283); ctx.fill();
      if (s.r > 1.5) { // estrelas grandes com brilho em cruz
        ctx.fillStyle = `rgba(255,255,255,${(a * .35).toFixed(3)})`;
        ctx.fillRect(x - 5, y - .3, 10, .6); ctx.fillRect(x - .3, y - 5, .6, 10);
      }
    }
  }
  addEventListener('resize', () => { if (c.isConnected) resize(); }, { passive: true });
  addEventListener('pointermove', e => { mx = e.clientX / W - .5; my = e.clientY / H - .5; }, { passive: true });
  addEventListener('scroll', () => { if (c.isConnected && !animOn()) draw(performance.now()); }, { passive: true });
  resize();
  loop(c, draw, 30);
}
