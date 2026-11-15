// ============================================================
//  Tela CALENDÁRIO
//  - Mês inteiro com o que tem em cada dia (prova, estudo,
//    treino, meta, datas especiais e tarefas)
//  - Clicou no dia: aparece a lista do dia e dá pra adicionar
//  - "Chegando": viagens, aniversários e metas dos próximos meses
// ============================================================
import * as db from '../db.js';
import { icon } from '../icons.js';
import { openDialog } from '../ui.js';
import { esc, todayISO, addDays, diffDays, parseISO, fmtLong, fmtShort, plural } from '../util.js';
import { subj, subjName, getSetting } from '../settings.js';
import { openStudyBlock } from '../study.js';
import { addEventDialog } from './escola.js';
import { KINDS } from './inicio.js';
import { plan as trainingPlan, dayStatus } from '../training.js';
import { fetchYearly, occurrences } from '../events.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
  'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const FILTERS = [['tudo', 'Tudo'], ['escola', 'Escola'], ['academia', 'Academia'], ['futuro', 'Futuro'], ['pessoal', 'Pessoal']];
const LEGEND = [['prova', 'Prova'], ['trabalho', 'Trabalho'], ['estudo', 'Estudo'], ['treino', 'Treino'],
  ['meta', 'Meta'], ['data', 'Data especial'], ['tarefa', 'Tarefa']];

let month = null;     // 'AAAA-MM' que está aberto
let selected = null;  // dia clicado
let filter = (() => { try { return localStorage.getItem('kai:calFilter') || 'tudo'; } catch { return 'tudo'; } })();

export async function renderCalendario(main) {
  const today = todayISO();
  if (!month) month = today.slice(0, 7);
  const first = `${month}-01`;
  const [Y, M] = month.split('-').map(Number);
  const daysInMonth = new Date(Y, M, 0).getDate();
  const last = `${month}-${String(daysInMonth).padStart(2, '0')}`;
  const offset = parseISO(first).getDay();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  const gridStart = addDays(first, -offset);
  const gridEnd = addDays(gridStart, weeks * 7 - 1);
  if (!selected || selected < first || selected > last) selected = today.slice(0, 7) === month ? today : first;

  // ---------- Dados ----------
  const horizon = addDays(today, 365);
  const fetchFrom = addDays(gridStart < today ? gridStart : today, -62); // -62: viagens que começaram antes
  const fetchTo = gridEnd > horizon ? gridEnd : horizon;
  const [rows, yearly, tasks] = await Promise.all([
    db.list('events', { gte: { date: fetchFrom }, lte: { date: fetchTo }, order: 'date' }),
    fetchYearly(),
    db.list('tasks', { gte: { date: gridStart }, lte: { date: gridEnd }, order: 'created_at' }),
  ]);
  const occ = occurrences(rows, yearly, gridStart, gridEnd);

  // Treinos: previsão de hoje pra frente, histórico pra trás
  const future = gridEnd >= today ? trainingPlan(diffDays(today, gridEnd) + 1) : [];
  const trainingOf = d => d >= today ? future.find(t => t.date === d) : dayStatus(d);
  const tFrom = getSetting('routine').training.from;

  const isRed = (kind, ev, d) => ['prova', 'trabalho'].includes(kind) && ev && ev.status !== 'feito'
    && (ev.surprise || (diffDays(today, d) >= 0 && diffDays(today, d) <= 1));

  // Tudo que tem num dia (já filtrado)
  const itemsOf = d => {
    const list = [];
    const tr = trainingOf(d);
    if (tr && ['train', 'done', 'missed'].includes(tr.type)) {
      list.push({ src: 'treino', kind: 'treino', area: 'academia', time: tFrom, status: tr.type,
        title: `Treino ${tr.workout}${tr.type === 'missed' ? ' (pulado)' : ''}`,
        done: tr.type === 'done', missed: tr.type === 'missed' });
    }
    occ.filter(o => o.date === d).forEach(o => list.push({
      src: 'event', ev: o, kind: o.kind, area: KINDS[o.kind]?.area || 'pessoal', time: o.start_time,
      title: o.title, done: !!o.done || o.status === 'feito', red: isRed(o.kind, o, d),
    }));
    tasks.filter(t => t.date === d).forEach(t => list.push({
      src: 'task', task: t, kind: 'tarefa', area: 'pessoal', title: t.title, done: t.done,
    }));
    return list
      .filter(i => filter === 'tudo' || i.area === filter)
      .sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  };

  const mark = i => `<span class="mk k-${i.kind} ${i.red ? 'red' : ''}"></span>`;

  // ---------- Grade do mês ----------
  const cells = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
    const items = itemsOf(d);
    // blocos de estudo do mesmo dia viram uma linha só
    const lines = [];
    const study = items.filter(i => i.kind === 'estudo');
    items.forEach(i => {
      if (i.kind !== 'estudo') lines.push(i);
      else if (i === study[0]) lines.push({ ...i, title: study.length > 1 ? `Estudo · ${study.length} blocos` : i.title, done: study.every(s => s.done) });
    });
    const MAX = 3;
    const out = d < first || d > last;
    cells.push(`
      <button class="dc ${out ? 'out' : ''} ${d === today ? 'today' : ''} ${d === selected ? 'sel' : ''}" data-day="${d}"
        aria-label="${fmtLong(d)}${lines.length ? `, ${plural(lines.length, 'item', 'itens')}` : ''}">
        <span class="n">${parseISO(d).getDate()}</span>
        ${lines.slice(0, MAX).map(i => `<span class="cm ${i.done ? 'done' : ''} ${i.missed ? 'miss' : ''}">${mark(i)}<span>${esc(i.title)}</span></span>`).join('')}
        ${lines.length > MAX ? `<span class="cm more">+${lines.length - MAX}</span>` : ''}
        <span class="dots-m">${lines.slice(0, 4).map(mark).join('')}${lines.length > 4 ? '<span class="mk more">+</span>' : ''}</span>
      </button>`);
  }

  // ---------- Lista do dia escolhido ----------
  const selItems = itemsOf(selected);
  const n = diffDays(today, selected);
  const quando = n === 0 ? 'Hoje' : n === 1 ? 'Amanhã' : n === -1 ? 'Ontem'
    : n > 0 ? `daqui a ${plural(n, 'dia', 'dias')}` : `há ${plural(-n, 'dia', 'dias')}`;
  const subOf = i => {
    const p = [];
    if (i.src === 'treino') p.push(i.status === 'done' ? 'Feito ✓' : i.missed ? 'Não foi feito' : `Previsto · ${i.time}`);
    if (i.src === 'task') p.push(i.done ? 'Tarefa · feita' : 'Tarefa');
    if (i.ev) {
      const e = i.ev;
      p.push(e.subject ? `<span class="sdot" style="background:${subj(e.subject)?.color || '#555'}"></span>${esc(subjName(e.subject))}` : (KINDS[e.kind]?.label.split(' (')[0] || ''));
      if (e.start_time) p.push(`${e.start_time}–${e.end_time || ''}`);
      if (e.end_date && e.end_date > e.orig_date) p.push(`${fmtShort(e.orig_date)} até ${fmtShort(e.end_date)}`);
      if (e.repeat === 'anual') p.push('todo ano');
      if (e.done || e.status === 'feito') p.push('feito ✓');
    }
    return p.join(' · ');
  };
  const dayHtml = selItems.length ? selItems.map((i, idx) => `
    <button class="item cal-it ${i.done ? 'is-done' : ''}" data-i="${idx}">
      ${mark(i)}
      <span class="item-main"><span class="item-title">${esc(i.title)}</span><span class="item-sub">${subOf(i)}</span></span>
      ${icon('right', 'sm')}
    </button>`).join('') : `<div class="empty">${filter === 'tudo' ? 'Nada marcado neste dia.' : 'Nada desse tipo neste dia.'}</div>`;

  // ---------- Chegando (datas especiais e metas) ----------
  const ahead = occurrences(rows, yearly, today, horizon).filter(o => ['data', 'meta'].includes(o.kind));
  const seen = new Set();
  const upcoming = ahead.filter(o => !seen.has(o.id) && seen.add(o.id)).slice(0, 6);
  const upHtml = upcoming.length ? upcoming.map(o => {
    const k = diffDays(today, o.date);
    return `<button class="item" data-up="${o.date}">
      <span class="mk k-${o.kind}"></span>
      <span class="item-main"><span class="item-title">${esc(o.title)}</span>
        <span class="item-sub">${fmtShort(o.date)}${o.repeat === 'anual' ? ' · todo ano' : ''}${o.end_date && o.end_date > o.orig_date ? ` · até ${fmtShort(o.end_date)}` : ''}</span></span>
      <span class="badge ${k <= 1 ? 'b-red' : 'b-green'}">${k === 0 ? 'Hoje' : k === 1 ? 'Amanhã' : `${k} dias`}</span>
    </button>`;
  }).join('') : '<div class="empty">Nenhuma viagem, aniversário ou meta marcada. Use “Adicionar”.</div>';

  // ---------- Monta a tela ----------
  main.innerHTML = `
    <div class="cal-head">
      <h1>${MESES[M - 1]} <span class="muted">${Y}</span></h1>
      <button class="icon-btn" data-nav="-1" aria-label="Mês anterior">${icon('left')}</button>
      <button class="btn ghost sm-btn" data-nav="0">Hoje</button>
      <button class="icon-btn" data-nav="1" aria-label="Próximo mês">${icon('right')}</button>
      <button class="btn" id="calAdd">${icon('plus')} <span>Adicionar</span></button>
    </div>
    <div class="seg" id="calFilter">${FILTERS.map(([k, l]) => `<button data-f="${k}" class="${filter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="cal-grid">
      <section class="card cal-card">
        <div class="month" id="month">
          ${WD.map(w => `<div class="wd">${w}</div>`).join('')}
          ${cells.join('')}
        </div>
        <div class="legend">${LEGEND.map(([k, l]) => `<span><span class="mk k-${k}"></span>${l}</span>`).join('')}
          <span><span class="mk red"></span>Prazo urgente</span></div>
      </section>
      <div class="cal-side">
        <section class="card" id="dayCard">
          <div class="card-h"><h2>${fmtLong(selected)}</h2><span class="right">${quando}</span></div>
          <div id="dayList">${dayHtml}</div>
          <button class="btn ghost full" id="addHere">${icon('plus')} Adicionar neste dia</button>
        </section>
        <section class="card">
          <div class="card-h"><h2>Chegando</h2><span class="right small">viagens, aniversários e metas</span></div>
          <div id="upList">${upHtml}</div>
        </section>
      </div>
    </div>`;

  const reload = () => renderCalendario(main);
  const goMonth = delta => {
    if (delta === 0) { month = today.slice(0, 7); selected = today; }
    else {
      const d = new Date(Y, M - 1 + delta, 1);
      month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      selected = null;
    }
    reload();
  };

  main.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => goMonth(Number(b.dataset.nav)));
  main.querySelector('#calFilter').onclick = e => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    filter = b.dataset.f;
    try { localStorage.setItem('kai:calFilter', filter); } catch { /* sem problema */ }
    reload();
  };

  // Clicar num dia
  const monthEl = main.querySelector('#month');
  monthEl.onclick = e => {
    const c = e.target.closest('[data-day]');
    if (!c) return;
    const d = c.dataset.day;
    if (d < first || d > last) { month = d.slice(0, 7); selected = d; return reload(); }
    selected = d;
    reload().then(() => {
      if (matchMedia('(max-width: 1150px)').matches) main.querySelector('#dayCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  // Deslizar o dedo no mês (celular) troca de mês
  let x0 = null, y0 = null;
  monthEl.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  monthEl.addEventListener('touchend', e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) goMonth(dx < 0 ? 1 : -1);
  });

  main.querySelector('#calAdd').onclick = () => addDialog(selected, reload);
  main.querySelector('#addHere').onclick = () => addDialog(selected, reload);

  main.querySelector('#dayList').onclick = e => {
    const b = e.target.closest('[data-i]');
    if (b) openItem(selItems[Number(b.dataset.i)], reload);
  };
  main.querySelector('#upList').onclick = e => {
    const b = e.target.closest('[data-up]');
    if (!b) return;
    selected = b.dataset.up; month = selected.slice(0, 7);
    reload();
  };
}

// ============================================================
//  Abrir um item do dia
// ============================================================
function openItem(i, reload) {
  if (!i) return;
  if (i.src === 'treino') { location.hash = '#/academia'; return; }
  if (i.src === 'task') {
    const t = i.task;
    openDialog({
      title: esc(t.title),
      body: `<p class="muted" style="margin:0">Tarefa · ${fmtLong(t.date)}</p>`,
      submitLabel: t.done ? 'Desmarcar' : 'Marcar como feita',
      danger: 'Apagar',
      onSubmit: async () => { await db.update('tasks', t.id, { done: !t.done }); reload(); },
      onDanger: async () => { await db.remove('tasks', t.id); reload(); },
    });
    return;
  }
  const ev = i.ev;
  if (ev.kind === 'estudo') return openStudyBlock(ev, reload);
  if (['prova', 'trabalho'].includes(ev.kind) && ev.subject) { location.hash = `#/escola/p/${ev.id}`; return; }
  editDialog(ev, reload);
}

// ============================================================
//  Adicionar / editar
// ============================================================
const ADD_KINDS = [
  ['tarefa', 'Tarefa do dia'],
  ['escola', 'Prova ou trabalho (Escola)'],
  ['data', 'Data especial (viagem, aniversário…)'],
  ['meta', 'Meta'],
  ['treino', 'Treino / atividade extra'],
];

const extrasHtml = (ev = {}) => `
  <div class="cal-extra">
    <label>Até (opcional — para viagens de vários dias)
      <input class="input" type="date" name="end_date" value="${ev.end_date || ''}"></label>
    <label class="check"><input type="checkbox" name="repeat" ${ev.repeat === 'anual' ? 'checked' : ''}> Repete todo ano (aniversário)</label>
    <label>Observação (opcional)<textarea class="input" name="notes" rows="2" maxlength="500">${esc(ev.notes || '')}</textarea></label>
  </div>`;

// Lê os campos extras; só manda as colunas novas quando foram usadas
function readExtras(fd, base) {
  const out = {};
  const end = fd.get('end_date');
  if (end && end < base.date) { alert('A data final precisa ser depois da data de início.'); return null; }
  if (end && end > base.date) out.end_date = end;
  else if (base.had_end) out.end_date = null;
  if (fd.get('repeat')) out.repeat = 'anual';
  else if (base.had_repeat) out.repeat = null;
  const notes = (fd.get('notes') || '').trim();
  if (notes || base.had_notes) out.notes = notes || null;
  return out;
}

function addDialog(date, reload) {
  const d = openDialog({
    title: 'Adicionar',
    body: `
      <label>O que é?<input class="input" name="title" required maxlength="140" placeholder="Ex: Viagem pra praia, aniversário da vó…"></label>
      <label>Tipo<select class="input" name="kind">${ADD_KINDS.map(([k, l]) => `<option value="${k}" ${k === 'data' ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Data<input class="input" type="date" name="date" required value="${date}"></label>
      ${extrasHtml()}`,
    submitLabel: 'Adicionar',
    onSubmit: async fd => {
      const kind = fd.get('kind'), title = fd.get('title').trim(), day = fd.get('date');
      if (kind === 'tarefa') { await db.insert('tasks', { title, date: day, done: false }); return reload(); }
      if (kind === 'escola') { setTimeout(() => addEventDialog({ title, date: day }), 0); return; }
      const extra = readExtras(fd, { date: day });
      if (!extra) return false;
      await db.insert('events', { title, kind, date: day, ...extra });
      reload();
    },
  });
  const sel = d.querySelector('[name=kind]'), box = d.querySelector('.cal-extra');
  const sync = () => { box.hidden = ['tarefa', 'escola'].includes(sel.value); };
  sel.onchange = sync; sync();
}

function editDialog(ev, reload) {
  const kinds = ADD_KINDS.filter(([k]) => ['data', 'meta', 'treino'].includes(k));
  if (!kinds.some(([k]) => k === ev.kind)) kinds.push([ev.kind, KINDS[ev.kind]?.label || ev.kind]);
  const start = ev.orig_date || ev.date;
  openDialog({
    title: 'Editar',
    body: `
      <label>O que é?<input class="input" name="title" required maxlength="140" value="${esc(ev.title)}"></label>
      <label>Tipo<select class="input" name="kind">${kinds.map(([k, l]) => `<option value="${k}" ${k === ev.kind ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Data${ev.repeat === 'anual' ? ' (primeira vez)' : ''}<input class="input" type="date" name="date" required value="${start}"></label>
      ${extrasHtml(ev)}`,
    submitLabel: 'Salvar',
    danger: ev.repeat === 'anual' ? 'Apagar (todos os anos)' : 'Apagar',
    onSubmit: async fd => {
      const day = fd.get('date');
      const extra = readExtras(fd, { date: day, had_end: !!ev.end_date, had_repeat: !!ev.repeat, had_notes: !!ev.notes });
      if (!extra) return false;
      await db.update('events', ev.id, { title: fd.get('title').trim(), kind: fd.get('kind'), date: day, ...extra });
      reload();
    },
    onDanger: async () => { await db.remove('events', ev.id); reload(); },
  });
}
