// ============================================================
//  RESUMO DA SEMANA — estilo "stories"
//  Toque na direita = próximo · esquerda = voltar · segure = pausa
// ============================================================
import * as db from '../db.js';
import { icon } from '../icons.js';
import { esc, todayISO, addDays, parseISO, plural } from '../util.js';
import { loadData, weekStats, compute } from '../achievements.js';
import { slats, electric } from '../fx.js';

const DUR = 5200;
const dm = s => parseISO(s).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
const num = (n, dec = 0) => `<b class="big" data-n="${n}" data-dec="${dec}">${dec ? String(n.toFixed(dec)).replace('.', ',') : n}</b>`;

export async function renderResumo(main) {
  const d = await loadData();
  const w = weekStats(d);
  const medals = compute(d).filter(a => a.done).length;
  const name = db.getName();
  const letras = w.treinos.map(t => t.workout).join(' · ');

  const slides = [
    `<div class="st-k">Resumo da semana</div><h2>Bora ver como foi, ${esc(name)}</h2>
      <p>${dm(w.from)} até ${dm(w.to)}</p><div class="st-logo">${electric('calendar', 110)}</div>`,
    `<div class="st-k">${icon('dumbbell')} Academia</div>${num(w.treinos.length)}<h2>${w.treinos.length === 1 ? 'treino feito' : 'treinos feitos'}</h2>
      <p>${w.treinos.length ? `Treinos: ${letras}` : 'Semana de descanso. Na próxima a gente volta com tudo.'}</p>`,
    `<div class="st-k">${icon('school')} Estudo</div>${num(w.horas, w.horas % 1 ? 1 : 0)}<h2>horas de estudo</h2>
      <p>${w.blocos ? `${plural(w.blocos, 'bloco feito', 'blocos feitos')}` : 'Nenhum bloco marcado como feito nesta semana.'}</p>`,
    `<div class="st-k">${icon('sparkle')} Hábitos</div>${num(w.rotina)}<h2>${w.rotina === 1 ? 'dia' : 'dias'} com a rotina completa</h2>
      <p>${w.agua ? `${w.agua} copos de água · ` : ''}${w.top ? `campeão: ${esc(w.top.name)} (${w.top.n}x)` : 'Marque seus hábitos no Início.'}</p>`,
    `<div class="st-k">${icon('check')} Tarefas</div>${num(w.tarefas)}<h2>${w.tarefas === 1 ? 'tarefa concluída' : 'tarefas concluídas'}</h2>
      <p>${w.notas ? `E ${plural(w.notas, 'nota lançada', 'notas lançadas')}, média ${Math.round(w.media)}%` : 'Cada tarefinha conta.'}</p>`,
    `<div class="st-k">${icon('star')} Conquistas</div>${num(medals)}<h2>${medals === 1 ? 'medalha' : 'medalhas'} no total</h2>
      <p><a class="st-link" href="#/conquistas">Ver todas as conquistas</a></p>`,
    `<div class="st-k">Fim</div><h2>Semana que vem tem mais.</h2><p>Bora pra cima 💪</p>
      <div class="row-btns" style="justify-content:center;margin-top:18px">
        <button class="btn" data-again>Ver de novo</button><a class="btn ghost" href="#/inicio">Voltar ao Início</a></div>`,
  ];

  main.innerHTML = `
    <div class="story" id="story">
      <div class="st-bars">${slides.map(() => '<span><i></i></span>').join('')}</div>
      <a class="st-close icon-btn" href="#/inicio" aria-label="Fechar">${icon('plus')}</a>
      <div class="st-stage">${slides.map((s, i) => `<section class="st-slide" data-i="${i}">${s}</section>`).join('')}</div>
      <div class="st-hint small">toque nos lados para passar</div>
    </div>`;

  const story = main.querySelector('#story');
  slats(story);
  const els = [...story.querySelectorAll('.st-slide')], bars = [...story.querySelectorAll('.st-bars i')];
  let cur = 0, t0 = 0, paused = false, pauseAt = 0, raf = 0;

  const countIn = el => {
    const b = el.querySelector('.big'); if (!b) return;
    const end = Number(b.dataset.n), dec = Number(b.dataset.dec), s0 = performance.now();
    const step = now => {
      if (!b.isConnected) return;
      const p = Math.min(1, (now - s0) / 1100), e = 1 - Math.pow(1 - p, 3);
      b.textContent = (end * e).toFixed(dec).replace('.', ',');
      if (p < 1) requestAnimationFrame(step);
    };
    if (document.documentElement.classList.contains('anim')) requestAnimationFrame(step);
  };
  const show = i => {
    cur = Math.max(0, Math.min(slides.length - 1, i));
    els.forEach((e, k) => e.classList.toggle('on', k === cur));
    bars.forEach((b, k) => { b.style.width = k < cur ? '100%' : '0%'; });
    countIn(els[cur]);
    t0 = performance.now();
  };
  const tick = now => {
    if (!story.isConnected) return;
    if (!paused) {
      const p = Math.min(1, (now - t0) / DUR);
      bars[cur].style.width = `${p * 100}%`;
      if (p >= 1 && cur < slides.length - 1) show(cur + 1);
    }
    raf = requestAnimationFrame(tick);
  };
  show(0);
  raf = requestAnimationFrame(tick);

  // toques: esquerda volta, direita avança, segurar pausa
  let downAt = 0;
  story.addEventListener('pointerdown', e => {
    if (e.target.closest('a, button')) return;
    downAt = performance.now(); paused = true; pauseAt = downAt;
  });
  story.addEventListener('pointerup', e => {
    if (!paused) return;
    paused = false;
    t0 += performance.now() - pauseAt;
    if (e.target.closest('a, button')) return;
    if (performance.now() - downAt < 250) {
      const r = story.getBoundingClientRect();
      show(e.clientX - r.left < r.width * .33 ? cur - 1 : cur + 1);
    }
  });
  story.querySelector('[data-again]')?.addEventListener('click', () => show(0));
  const key = e => {
    if (!story.isConnected) return removeEventListener('keydown', key);
    if (e.key === 'ArrowRight') show(cur + 1);
    if (e.key === 'ArrowLeft') show(cur - 1);
    if (e.key === 'Escape') location.hash = '#/inicio';
  };
  addEventListener('keydown', key);
}
