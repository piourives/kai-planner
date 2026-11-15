// ============================================================
//  Tela CONQUISTAS (medalhas)
// ============================================================
import { icon } from '../icons.js';
import { esc } from '../util.js';
import { getAll, checkNew } from '../achievements.js';
import { electric } from '../fx.js';
import { celebrate } from '../anim.js';

const CATS = ['Academia', 'Escola', 'Hábitos', 'Futuro'];

export async function renderConquistas(main) {
  const list = await getAll();
  const fresh = new Set((await checkNew(list)).map(a => a.id));
  await checkNew(list, 'ach_told'); // já viu aqui: não comemora de novo no Início
  const done = list.filter(a => a.done).length;
  const p = done / list.length;
  const C = 2 * Math.PI * 34;

  const medal = a => `
    <div class="medal ${a.done ? 'got' : ''}" title="${esc(a.desc)}">
      <div class="m-ic">${a.done ? electric(a.icon, 30) : icon(a.icon)}</div>
      <div class="m-t">${esc(a.title)}${fresh.has(a.id) ? ' <span class="m-new">NOVA</span>' : ''}</div>
      <div class="m-d">${esc(a.desc)}</div>
      ${a.done ? '<div class="m-ok">Conquistada ✓</div>'
        : `<div class="m-p"><div class="pbar"><span style="width:${Math.round(a.cur / a.target * 100)}%"></span></div><span>${a.cur}/${a.target}</span></div>`}
    </div>`;

  main.innerHTML = `
    <div class="page-head"><h1 class="page-title">Conquistas</h1>
      <a class="btn" href="#/resumo">${icon('play')} Resumo da semana</a></div>
    <section class="card ach-hero">
      <span class="ring-big" style="--c:${C}">
        <svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="34" fill="none" stroke="#262626" stroke-width="6"/>
          <circle cx="40" cy="40" r="34" fill="none" stroke="#f2f2f2" stroke-width="6" stroke-linecap="round"
            stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}" transform="rotate(-90 40 40)"/></svg>
        <b>${Math.round(p * 100)}%</b></span>
      <div><div class="stat"><span class="small muted">Medalhas</span><b>${done}</b></div>
        <div class="small muted">de ${list.length} · elas se desbloqueiam sozinhas com o que você faz no app</div></div>
    </section>
    ${CATS.map(c => {
      const l = list.filter(a => a.cat === c);
      if (!l.length) return '';
      return `<h2 class="sec-t">${c} <span class="muted small">${l.filter(a => a.done).length}/${l.length}</span></h2>
        <div class="medals">${l.sort((a, b) => b.done - a.done).map(medal).join('')}</div>`;
    }).join('')}`;

  if (fresh.size) setTimeout(() => celebrate(fresh.size === 1 ? '🏅 Nova conquista!' : `🏅 ${fresh.size} conquistas novas!`), 500);
}
