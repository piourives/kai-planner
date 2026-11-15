// ============================================================
//  Tela INÍCIO — 4 blocos + agenda deslizável
//  1. Saudação  2. Hoje (tarefas)  3. Próximos prazos  4. Hábitos
// ============================================================
import * as db from '../db.js';
import { icon } from '../icons.js';
import { openDialog } from '../ui.js';
import { esc, todayISO, addDays, diffDays, weekdayShort, parseISO, fmtLong, fmtShort, plural } from '../util.js';
import { subj, subjName } from '../settings.js';
import { openStudyBlock } from '../study.js';
import { addEventDialog } from './escola.js';
import { plan as trainingPlan, streak as trainingStreak } from '../training.js';
import { getSetting } from '../settings.js';
import { fetchYearly, occurrences } from '../events.js';

// Áreas e tipos de compromisso (cores por tipo no calendário)
export const AREAS = {
  escola:   { label: 'Escola',   color: '#f2f2f2' },
  academia: { label: 'Academia', color: '#b0b0b0' },
  futuro:   { label: 'Futuro',   color: '#7a7a7a' },
  pessoal:  { label: 'Pessoal',  color: '#555555' },
};
export const KINDS = {
  prova:    { label: 'Prova',    area: 'escola',   icon: 'file' },
  trabalho: { label: 'Trabalho', area: 'escola',   icon: 'school' },
  estudo:   { label: 'Estudo',   area: 'escola',   icon: 'school' },
  treino:   { label: 'Treino',   area: 'academia', icon: 'dumbbell' },
  meta:     { label: 'Meta',     area: 'futuro',   icon: 'flag' },
  data:     { label: 'Data especial (viagem, aniversário…)', area: 'pessoal', icon: 'heart' },
};
const PRAZO_KINDS = ['prova', 'trabalho', 'meta'];

const VIEWS = [
  { key: 'tudo', label: 'Tudo' },
  { key: 'escola', label: 'Escola' },
  { key: 'academia', label: 'Academia' },
  { key: 'futuro', label: 'Futuro' },
];

// Hábitos (na Fase 6 dá pra editar nas Configurações)
const HABITS = [
  { key: 'treinar', name: 'Treinar',      icon: 'dumbbell', color: '#f2f2f2', auto: true },
  { key: 'estudar', name: 'Estudar 1h30', icon: 'school',   color: '#f2f2f2' },
  { key: 'agua',    name: 'Água 2L',      icon: 'droplet',  color: '#f2f2f2', target: 8 },
  { key: 'dormir',  name: 'Dormir 8h',    icon: 'moon',     color: '#f2f2f2' },
];
const ROTINA = [
  { key: 'mesa',   name: 'Mesa organizada' },
  { key: 'quarto', name: 'Quarto organizado', optional: true },
  { key: 'oracao', name: 'Rezar o Pai Nosso à noite' },
];

let viewIndex = Number(localStorage.getItem('kai:homeView') || 0);

export async function renderInicio(main) {
  const today = todayISO();
  const end = addDays(today, 6);

  const [weekTasks, overdue, rawEvents, yearly, logs] = await Promise.all([
    db.list('tasks', { gte: { date: today }, lte: { date: end }, order: 'created_at' }),
    db.list('tasks', { lt: { date: today }, eq: { done: false }, order: 'date' }),
    db.list('events', { gte: { date: addDays(today, -62) }, lte: { date: addDays(today, 365) }, order: 'date' }),
    fetchYearly(),
    db.list('habit_logs', { gte: { date: addDays(today, -400) } }),
  ]);
  // viagens aparecem em todos os dias; aniversários em todo ano
  const events = occurrences(rawEvents, yearly, today, addDays(today, 365));

  const todayTasks = weekTasks.filter(t => t.date === today);
  const doneCount = todayTasks.filter(t => t.done).length;
  const weekEvents = events.filter(e => e.date <= end);

  // ---------- Frase curta ----------
  const tarefasSemana = weekTasks.filter(t => !t.done).length;
  const provasSemana = weekEvents.filter(e => e.kind === 'prova').length;
  const partes = [];
  if (tarefasSemana) partes.push(plural(tarefasSemana, 'tarefa', 'tarefas'));
  if (provasSemana) partes.push(plural(provasSemana, 'prova', 'provas'));
  const frase = partes.length ? `${partes.join(' e ')} essa semana` : 'Semana tranquila por enquanto';

  // ---------- Bloco Hoje ----------
  const taskRow = t => `
    <div class="check-row ${t.done ? 'done' : ''}" data-id="${t.id}">
      <button class="cb ${t.done ? 'on' : ''}" data-act="toggle" aria-label="Marcar">${icon('check')}</button>
      <span class="t">${esc(t.title)}</span>
      <span class="row-actions">
        ${t.done ? '' : `<button data-act="tomorrow" title="Passar pra amanhã">${icon('next')}</button>`}
        <button data-act="delete" title="Apagar">${icon('trash')}</button>
      </span>
    </div>`;

  const overdueHtml = overdue.length ? `
    <div class="overdue">
      <div class="lbl">${icon('flag')} ${plural(overdue.length, 'tarefa ficou', 'tarefas ficaram')} pra trás
        <button data-act="bring-all">Trazer todas pra hoje</button></div>
      ${overdue.map(t => `
        <div class="check-row" data-id="${t.id}">
          <button class="cb" data-act="toggle" aria-label="Marcar">${icon('check')}</button>
          <span class="t">${esc(t.title)} <span class="muted small">· ${fmtShort(t.date)}</span></span>
          <span class="row-actions" style="opacity:1">
            <button data-act="today" title="Trazer pra hoje">${icon('back')}</button>
            <button data-act="delete" title="Apagar">${icon('trash')}</button>
          </span>
        </div>`).join('')}
    </div>` : '';

  // ---------- Próximos prazos (só 3) ----------
  const vistos = new Set();
  const prazos = events.filter(e => PRAZO_KINDS.includes(e.kind) && !vistos.has(e.id) && vistos.add(e.id)).slice(0, 3);
  const prazoHtml = prazos.length ? prazos.map(e => {
    const n = diffDays(today, e.date);
    const cls = n <= 1 ? 'b-red' : n <= 3 ? 'b-yellow' : 'b-green';
    const lbl = n === 0 ? 'Hoje' : n === 1 ? 'Amanhã' : `${n}d`;
    const k = KINDS[e.kind], c = AREAS[k.area].color;
    const tag = e.subject ? `<span class="sdot" style="background:${subj(e.subject)?.color || '#555'}"></span>${esc(subjName(e.subject))}` : k.label;
    const inner = `
      <span class="ico" style="background:#1e1e1e;color:var(--text)">${icon(k.icon)}</span>
      <span class="info"><div class="when">${fmtShort(e.date)} · ${tag}</div><div>${esc(e.title)}</div></span>
      <span class="badge ${cls}">${lbl}</span>`;
    return e.subject ? `<a class="dl" href="#/escola/p/${e.id}">${inner}</a>` : `<div class="dl">${inner}</div>`;
  }).join('') : `<div class="empty">Nenhum prazo chegando. Use o “+” da agenda para adicionar.</div>`;

  // ---------- Hábitos ----------
  const val = (key, date = today) => logs.find(l => l.habit_key === key && l.date === date)?.value || 0;
  const doneSet = (key, target = 1) => new Set(logs.filter(l => l.habit_key === key && l.value >= target).map(l => l.date));
  const streakOf = set => {
    let d = set.has(today) ? today : addDays(today, -1), n = 0;
    while (set.has(d)) { n++; d = addDays(d, -1); }
    return n;
  };
  const flame = n => `<span class="streak">${icon('flame')} ${n} ${n === 1 ? 'dia' : 'dias'}</span>`;

  const blocosHoje = events.filter(e => e.kind === 'estudo' && e.date === today);
  const treinoHoje = trainingPlan(1)[0];
  const ringsHtml = HABITS.map(h => {
    const target = h.target || 1;
    // Treinar: marca sozinho quando o treino do dia é concluído; descanso não conta como falha
    const v = h.auto ? (treinoHoje.type === 'done' ? 1 : 0) : val(h.key);
    const pct = Math.min(v / target, 1);
    const C = 2 * Math.PI * 27;
    const s = h.auto ? trainingStreak() : streakOf(doneSet(h.key, target));
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px">
      <button class="ring" data-habit="${h.key}" ${h.auto ? 'data-go="academia" title="Marca sozinho quando você concluir o treino"' : ''}>
        <span class="circle">
          <svg class="r" viewBox="0 0 62 62"><circle cx="31" cy="31" r="27" fill="none" stroke="#262626" stroke-width="4"/>
            <circle cx="31" cy="31" r="27" fill="none" stroke="${h.color}" stroke-width="4" stroke-linecap="round"
              stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>
          <span class="ic" style="color:${pct >= 1 ? h.color : 'var(--text)'}">${icon(h.icon)}</span>
        </span>
        <span class="name">${h.name}</span>
        ${h.target ? `<span class="small muted">${v}/${target} copos</span>` : h.auto ? `<span class="small muted">${treinoHoje.type === 'rest' ? 'descanso' : treinoHoje.type === 'done' ? `Treino ${treinoHoje.workout} ✓` : `Treino ${treinoHoje.workout} hoje`}</span>`
          : h.key === 'estudar' && blocosHoje.length ? `<span class="small muted">blocos ${blocosHoje.filter(b => b.done).length}/${blocosHoje.length}</span>` : ''}
        ${h.auto ? `<span class="streak">${icon('flame')} ${s} ${s === 1 ? 'treino' : 'treinos'}</span>` : flame(s)}
      </button>
      ${h.target ? `<span class="water-ctl"><button data-water="-1" aria-label="Tirar um copo">−</button><button data-water="1" aria-label="Mais um copo">+</button></span>` : ''}
    </div>`;
  }).join('');

  // Sequência da rotina: mesa + oração no mesmo dia (quarto é opcional)
  const mesa = doneSet('mesa'), oracao = doneSet('oracao');
  const rotinaSet = new Set([...mesa].filter(d => oracao.has(d)));
  const rotinaHtml = ROTINA.map(r => {
    const on = val(r.key) >= 1;
    return `<div class="check-row ${on ? 'done' : ''}">
      <button class="cb ${on ? 'on' : ''}" data-habit="${r.key}" aria-label="Marcar">${icon('check')}</button>
      <span class="t">${r.name} ${r.optional ? '<span class="tag">opcional</span>' : ''}</span>
      <span class="muted small" style="display:flex;align-items:center;gap:3px">${icon('flame', 'sm')}${streakOf(doneSet(r.key))}</span>
    </div>`;
  }).join('');

  // ---------- Agenda deslizável (próximos 7 dias) ----------
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const treinos = trainingPlan(7);
  const tFrom = getSetting('routine').training.from;
  const paneHtml = view => days.map(d => {
    const items = [];
    const tr = treinos.find(t => t.date === d);
    if ((view === 'tudo' || view === 'academia') && tr && tr.type !== 'rest') {
      items.push(`<a class="ag-item ${tr.type === 'done' ? 'ag-done' : ''}" href="#/academia"><span class="dot" style="background:${AREAS.academia.color}"></span><span class="muted small">${tFrom}</span> Treino ${tr.workout}</a>`);
    }
    if (view === 'academia' && tr && tr.type === 'rest') items.push('<span class="ag-none">descanso</span>');
    if (view === 'tudo') {
      weekTasks.filter(t => t.date === d && !t.done)
        .forEach(t => items.push(`<div class="ag-item" style="cursor:default"><span class="dot" style="background:#444"></span>${esc(t.title)}</div>`));
    }
    weekEvents.filter(e => e.date === d && (view === 'tudo' || KINDS[e.kind]?.area === view))
      .sort((a, b) => (a.start_time || '00').localeCompare(b.start_time || '00'))
      .forEach(e => {
        const c = e.subject ? subj(e.subject)?.color || '#555' : AREAS[KINDS[e.kind]?.area || 'pessoal'].color;
        // bloco de estudo = bolinha vazada (diferente da prova)
        const dot = e.kind === 'estudo'
          ? `<span class="dot" style="border:1.5px solid ${c};background:transparent"></span>`
          : `<span class="dot" style="background:${c}"></span>`;
        const time = e.start_time ? `<span class="muted small">${e.start_time}</span> ` : '';
        items.push(`<button class="ag-item ${e.done ? 'ag-done' : ''}" data-event="${e.id}">${dot}${time}${esc(e.title)}</button>`);
      });
    const dd = parseISO(d).getDate();
    return `<div class="agenda-day ${d === today ? 'today' : ''}">
      <button class="d" data-add-date="${d}" style="background:none;border:0;padding:0;text-align:left" title="Adicionar neste dia">
        ${d === today ? 'Hoje' : weekdayShort(d)}<br>${dd}</button>
      <div>${items.join('') || '<span class="ag-none">—</span>'}</div>
    </div>`;
  }).join('');

  // ---------- Monta a tela ----------
  const name = db.getName();
  main.innerHTML = `
    <div class="grid-home">
      <section class="a-hello hello">
        <div>
          <h1>Fala, ${esc(name)} 👋</h1>
          <div class="date">${fmtLong(today)}</div>
        </div>
        <div class="chip">${icon('trend')} ${esc(frase)}</div>
      </section>

      <section class="card a-today" id="todayCard">
        <div class="card-h"><h2>Hoje</h2><span class="right counter">${doneCount}/${todayTasks.length}</span></div>
        ${overdueHtml}
        ${todayTasks.length ? todayTasks.map(taskRow).join('') : '<div class="empty">Nenhuma tarefa pra hoje. Adicione abaixo.</div>'}
        <form class="add-row" id="addTask">
          <input class="input" name="title" placeholder="Nova tarefa…" maxlength="140" autocomplete="off">
          <button class="btn" aria-label="Adicionar">${icon('plus')}</button>
        </form>
      </section>

      <section class="card a-agenda">
        <div class="card-h"><h2>Agenda</h2>
          <span class="right"><span class="tabs-mini" id="viewTabs">${VIEWS.map((v, i) => `<button data-i="${i}">${v.label}</button>`).join('')}</span>
          <button class="icon-btn" id="addEvent" aria-label="Adicionar compromisso">${icon('plus')}</button></span>
        </div>
        <div class="swipe" id="swipe">${VIEWS.map(v => `<div class="pane">${paneHtml(v.key)}</div>`).join('')}</div>
        <div class="dots" id="dots">${VIEWS.map((v, i) => `<button data-i="${i}" aria-label="${v.label}"></button>`).join('')}</div>
      </section>

      <section class="card a-habits" id="habitsCard">
        <div class="card-h"><h2>Hábitos de hoje</h2></div>
        <div class="rings">${ringsHtml}</div>
        <div class="rotina">
          <div class="rh">Rotina <span class="right">${icon('flame', 'sm')} sequência: ${plural(streakOf(rotinaSet), 'dia', 'dias')}</span></div>
          ${rotinaHtml}
        </div>
      </section>

      <section class="card a-deadlines">
        <div class="card-h"><h2>Próximos prazos</h2></div>
        ${prazoHtml}
      </section>
    </div>`;

  const reload = () => renderInicio(main);

  // ---------- Ações: tarefas ----------
  main.querySelector('#addTask').onsubmit = async e => {
    e.preventDefault();
    const title = e.target.title.value.trim();
    if (!title) return;
    await db.insert('tasks', { title, date: today, done: false });
    await reload();
    main.querySelector('#addTask input').focus();
  };
  main.querySelector('#todayCard').addEventListener('click', async e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'bring-all') {
      await Promise.all(overdue.map(t => db.update('tasks', t.id, { date: today })));
      return reload();
    }
    const id = btn.closest('[data-id]')?.dataset.id;
    const t = [...weekTasks, ...overdue].find(x => x.id === id);
    if (!t) return;
    if (act === 'toggle') await db.update('tasks', id, { done: !t.done });
    if (act === 'tomorrow') await db.update('tasks', id, { date: addDays(t.date, 1) });
    if (act === 'today') await db.update('tasks', id, { date: today });
    if (act === 'delete') await db.remove('tasks', id);
    reload();
  });

  // ---------- Ações: hábitos ----------
  main.querySelector('#habitsCard').addEventListener('click', async e => {
    const w = e.target.closest('[data-water]');
    if (w) {
      const v = Math.max(0, Math.min(16, val('agua') + Number(w.dataset.water)));
      await db.upsert('habit_logs', { habit_key: 'agua', date: today, value: v }, ['habit_key', 'date']);
      return reload();
    }
    if (e.target.closest('[data-go]')) { location.hash = '#/academia'; return; }
    const h = e.target.closest('[data-habit]');
    if (!h || h.disabled) return;
    const key = h.dataset.habit;
    let v;
    if (key === 'agua') v = Math.min(16, val('agua') + 1);
    else v = val(key) >= 1 ? 0 : 1;
    await db.upsert('habit_logs', { habit_key: key, date: today, value: v }, ['habit_key', 'date']);
    reload();
  });

  // ---------- Agenda deslizável ----------
  const swipe = main.querySelector('#swipe');
  const setActive = i => {
    viewIndex = i;
    localStorage.setItem('kai:homeView', i);
    main.querySelectorAll('#dots button, #viewTabs button').forEach(b => b.classList.toggle('on', Number(b.dataset.i) === i));
  };
  const goTo = (i, smooth = true) => { swipe.scrollTo({ left: i * swipe.clientWidth, behavior: smooth ? 'smooth' : 'auto' }); setActive(i); };
  requestAnimationFrame(() => goTo(viewIndex, false));
  let t;
  swipe.addEventListener('scroll', () => {
    clearTimeout(t);
    t = setTimeout(() => setActive(Math.round(swipe.scrollLeft / swipe.clientWidth)), 60);
  });
  main.querySelectorAll('#dots button, #viewTabs button').forEach(b => b.onclick = () => goTo(Number(b.dataset.i)));

  // Adicionar compromisso
  const addEvent = date => {
    const area = VIEWS[viewIndex].key;
    if (area === 'escola') return addEventDialog({ date: date || today });
    const defKind = area === 'academia' ? 'treino' : area === 'futuro' ? 'meta' : 'escola';
    const opts = [['escola', 'Prova ou trabalho (Escola)'], ['treino', 'Treino'], ['meta', 'Meta'], ['data', KINDS.data.label]];
    openDialog({
      title: 'Novo compromisso',
      body: `
        <label>O que é?<input class="input" name="title" required maxlength="120" placeholder="Ex: Viagem, aniversário…"></label>
        <label>Tipo<select class="input" name="kind">${opts.map(([k, l]) =>
          `<option value="${k}" ${k === defKind ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Data<input class="input" type="date" name="date" required value="${date || today}"></label>`,
      submitLabel: 'Adicionar',
      onSubmit: async fd => {
        if (fd.get('kind') === 'escola') {
          setTimeout(() => addEventDialog({ title: fd.get('title').trim(), date: fd.get('date') }), 0);
          return;
        }
        await db.insert('events', { title: fd.get('title').trim(), kind: fd.get('kind'), date: fd.get('date') });
        reload();
      },
    });
  };
  main.querySelector('#addEvent').onclick = () => addEvent();
  swipe.addEventListener('click', e => {
    const add = e.target.closest('[data-add-date]');
    if (add) return addEvent(add.dataset.addDate);
    const ev = e.target.closest('[data-event]');
    if (!ev) return;
    const item = events.find(x => x.id === ev.dataset.event);
    if (!item) return;
    if (item.kind === 'estudo') return openStudyBlock(item, reload);
    if (item.subject && ['prova', 'trabalho'].includes(item.kind)) { location.hash = `#/escola/p/${item.id}`; return; }
    openDialog({
      title: esc(item.title),
      body: `<p class="muted" style="margin:0">${KINDS[item.kind]?.label || ''} · ${fmtLong(item.date)}</p>`,
      submitLabel: '',
      danger: 'Apagar',
      onDanger: async () => { await db.remove('events', item.id); reload(); },
    });
  });
}
