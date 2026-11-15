// ============================================================
//  Animações (só visuais: sem som, sem vibração, sem avisos)
//  - entrada das telas em cascata, números contando, barras e
//    anéis enchendo
//  - "explosão" de partículas ao marcar um check ou hábito
//  - comemoração quando o treino é concluído
//  No modo "Automático", se o celular estiver com "reduzir movimento"
//  ligado, nada disso roda (dá pra forçar "Ligadas" nas Configurações).
// ============================================================
// Liga/desliga em Configurações → Perfil e tema → Animações
const reduce = () => !document.documentElement.classList.contains('anim');
const rnd = (a, b) => a + Math.random() * (b - a);
const GRAYS = ['#ffffff', '#ededed', '#c8c8c8', '#9a9a9a', '#6e6e6e'];

// ---------- Entrada da tela ----------
const ENTER_SEL = '.hello, .page-head, .page-title, .cal-head, .seg, .card, .gcard, .sec-t, .sec-row, .mtile, .icard, .warn, .item';
export function enter(main) {
  if (reduce()) return;
  main.classList.remove('entering');
  void main.offsetWidth; // reinicia as animações
  main.classList.add('entering');
  let i = 0;
  main.querySelectorAll(ENTER_SEL).forEach(el => {
    if (el.parentElement.closest('.pop')) return; // só o de fora anima
    el.classList.add('pop');
    el.style.setProperty('--d', `${Math.min(i++, 14) * 45}ms`);
  });
  countUp(main);
  main.querySelectorAll('.page-title, .sec-t, .cal-head h1').forEach(scramble);
  clearTimeout(main._t);
  main._t = setTimeout(() => {
    main.classList.remove('entering');
    main.querySelectorAll('.pop').forEach(el => el.classList.remove('pop'));
  }, 1600);
}

// Números grandes contam do zero até o valor
function countUp(root) {
  root.querySelectorAll('.stat b, .money b, .counter, .ach-hero .ring-big b').forEach(el => {
    const txt = el.textContent.trim();
    const m = txt.match(/^(\d+)(\/\d+)?$/);
    if (!m || Number(m[1]) === 0) return;
    const end = Number(m[1]), rest = m[2] || '', t0 = performance.now(), dur = 700 + Math.min(end, 60) * 8;
    const step = now => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(end * e) + rest;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(() => { el.textContent = txt; }, dur + 300); // garante o valor final
  });
}

// ---------- Partículas ----------
function layer() {
  let l = document.getElementById('fx');
  if (!l) { l = document.createElement('div'); l.id = 'fx'; document.body.appendChild(l); }
  return l;
}

export function burst(x, y, n = 14) {
  if (reduce()) return;
  const l = layer();
  // onda (anel que cresce)
  const ring = document.createElement('span');
  ring.className = 'fx-ring';
  ring.style.left = `${x}px`; ring.style.top = `${y}px`;
  l.appendChild(ring);
  ring.animate([{ transform: 'translate(-50%,-50%) scale(.2)', opacity: .9 }, { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 0 }],
    { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => ring.remove();
  for (let i = 0; i < n; i++) {
    const p = document.createElement('span');
    const s = rnd(3, 7), star = Math.random() < .3;
    p.className = star ? 'fx-p fx-star' : 'fx-p';
    p.style.cssText = `left:${x}px;top:${y}px;width:${s}px;height:${s}px;background:${GRAYS[i % GRAYS.length]}`;
    l.appendChild(p);
    const a = (i / n) * Math.PI * 2 + rnd(-.3, .3), d = rnd(26, 62);
    p.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(.2) rotate(${rnd(-180, 180)}deg)`, opacity: 0 },
    ], { duration: rnd(450, 750), easing: 'cubic-bezier(.15,.7,.3,1)' }).onfinish = () => p.remove();
  }
}

// Comemoração grande (ex: treino concluído)
export function celebrate(text = 'Mandou bem!') {
  if (reduce()) return;
  const l = layer(), W = innerWidth, H = innerHeight;
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('span');
    const w = rnd(4, 9), h = rnd(6, 14);
    p.className = 'fx-p';
    p.style.cssText = `left:${rnd(0, W)}px;top:-20px;width:${w}px;height:${h}px;border-radius:2px;background:${GRAYS[i % GRAYS.length]}`;
    l.appendChild(p);
    const drift = rnd(-80, 80), dur = rnd(1300, 2300);
    p.animate([
      { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${drift}px, ${H * .6}px) rotate(${rnd(-360, 360)}deg)`, opacity: 1, offset: .7 },
      { transform: `translate(${drift * 1.3}px, ${H + 40}px) rotate(${rnd(-540, 540)}deg)`, opacity: 0 },
    ], { duration: dur, delay: rnd(0, 350), easing: 'cubic-bezier(.3,.6,.5,1)', fill: 'backwards' }).onfinish = () => p.remove();
  }
  const t = document.createElement('div');
  t.className = 'fx-toast';
  t.textContent = text;
  l.appendChild(t);
  t.animate([
    { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 },
    { transform: 'translate(-50%,-50%) scale(1.06)', opacity: 1, offset: .18 },
    { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: .8 },
    { transform: 'translate(-50%,-60%) scale(.96)', opacity: 0 },
  ], { duration: 2000, easing: 'ease-out' }).onfinish = () => t.remove();
}

// ---------- Cliques que merecem uma explosão ----------
// (fica escutando a página toda; as telas não precisam saber disso)
export function initClickFx() {
  document.addEventListener('click', e => {
    const b = e.target.closest('.cb:not(.on), .ring[data-habit]:not([data-go]):not(.full), [data-fx]');
    if (!b) return;
    const r = b.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, b.classList.contains('ring') ? 18 : 12);
  }, true);
}

// ---------- Texto embaralhando (estilo hacker) ----------
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/';
export function scramble(el) {
  if (reduce() || !el) return;
  const node = [...el.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
  if (!node) return;
  const text = node.textContent, t0 = performance.now(), dur = 380 + text.length * 35;
  const step = now => {
    if (!el.isConnected) return;
    const p = Math.min(1, (now - t0) / dur), fixed = Math.floor(p * text.length);
    node.textContent = [...text].map((ch, i) => (i < fixed || ch === ' ' ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join('');
    if (p < 1) requestAnimationFrame(step); else node.textContent = text;
  };
  requestAnimationFrame(step);
  setTimeout(() => { if (node.isConnected) node.textContent = text; }, dur + 400); // garantia
}

// ---------- Luz que segue o dedo / mouse ----------
export function initSpotlight() {
  const SEL = '.card, .gcard, .icard, .medal, .dc, .hold';
  let last = null;
  const move = e => {
    if (reduce()) return;
    const el = e.target.closest?.(SEL);
    if (last && last !== el) last.classList.remove('lit');
    if (!el) { last = null; return; }
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
    el.classList.add('lit');
    last = el;
  };
  document.addEventListener('pointermove', move, { passive: true });
  document.addEventListener('pointerdown', move, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => last?.classList.remove('lit'));
}

// Desliza um elemento (ex: troca de mês no calendário)
export function slide(el, dir) {
  if (reduce() || !el || !dir) return;
  el.animate([{ transform: `translateX(${dir * 28}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
    { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
}
