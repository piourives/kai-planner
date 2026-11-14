// ============================================================
//  Tela ESCOLA
//  Abas: Prazos · Grade · Notas · Importar
//  + página de cada prova/trabalho (#/escola/p/<id>)
// ============================================================
import * as db from '../db.js';
import { icon } from '../icons.js';
import { openDialog, daysBadge } from '../ui.js';
import { esc, todayISO, addDays, diffDays, parseISO, fmtShort, fmtLong, plural } from '../util.js';
import { getSetting, subjects, subj, subjName, subjDot, subjLabel, subjOptions } from '../settings.js';
import { URGENCY, STATUS } from '../data/defaults.js';
import { createExamBlocks, replanExam, deleteEventCascade, openMaterial, openStudyBlock, moveBlock, isTrainingDay } from '../study.js';
import { parseText, pdfToText } from '../importer.js';

const TABS = [
  { key: 'prazos', label: 'Prazos' },
  { key: 'grade', label: 'Grade' },
  { key: 'notas', label: 'Notas' },
  { key: 'importar', label: 'Importar' },
];
const KIND_LABEL = { prova: 'Prova', trabalho: 'Trabalho' };
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

let importItems = null; // itens do Importar aguardando revisão

export async function renderEscola(main, ctx, params = []) {
  if (params[0] === 'p' && params[1]) return renderDetail(main, params[1]);
  const tab = TABS.some(t => t.key === params[0]) ? params[0] : 'prazos';
  main.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">Escola</h1>
      <button class="btn" id="addBtn">${icon('plus')} Adicionar</button>
    </div>
    <nav class="seg">${TABS.map(t => `<a href="#/escola/${t.key}" class="${t.key === tab ? 'on' : ''}">${t.label}</a>`).join('')}</nav>
    <div id="tab"></div>`;
  main.querySelector('#addBtn').onclick = () => addEventDialog();
  const el = main.querySelector('#tab');
  if (tab === 'prazos') await renderPrazos(el);
  if (tab === 'grade') renderGrade(el);
  if (tab === 'notas') await renderNotas(el);
  if (tab === 'importar') renderImportar(el);
}

// ============================================================
//  Adicionar / editar prova ou trabalho
// ============================================================
function eventFormBody(ev = {}) {
  const kind = ev.kind || 'prova';
  return `
    <div class="two">
      <label>Tipo<select class="input" name="kind">
        ${Object.entries(KIND_LABEL).map(([k, v]) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${v}</option>`).join('')}
      </select></label>
      <label>Data<input class="input" type="date" name="date" required value="${ev.date || addDays(todayISO(), 7)}"></label>
    </div>
    <label>Título<input class="input" name="title" required maxlength="120" value="${esc(ev.title || '')}" placeholder="Ex: Prova de cinemática"></label>
    <div class="two">
      <label>Matéria<select class="input" name="subject" required>${subjOptions(ev.subject || 'mat')}</select></label>
      <label class="check"><input type="checkbox" name="lab" ${ev.lab ? 'checked' : ''}> Lab</label>
    </div>
    <label data-only="prova">Urgência
      <select class="input" name="urgency">${Object.entries(URGENCY).map(([k, u]) =>
        `<option value="${k}" ${k === (ev.urgency || 'medio') ? 'selected' : ''}>${u.emoji} ${u.label} — ${u.hint}</option>`).join('')}</select>
    </label>`;
}
function wireKindToggle(d) {
  const sel = d.querySelector('[name=kind]');
  const upd = () => d.querySelectorAll('[data-only=prova]').forEach(x => { x.style.display = sel.value === 'prova' ? '' : 'none'; });
  sel.onchange = upd; upd();
}
function formToEvent(fd) {
  const kind = fd.get('kind');
  return {
    kind, title: fd.get('title').trim(), date: fd.get('date'), subject: fd.get('subject'),
    lab: fd.get('lab') === 'on', urgency: kind === 'prova' ? fd.get('urgency') : null,
  };
}

export function addEventDialog(preset = {}) {
  const d = openDialog({
    title: 'Adicionar prova ou trabalho',
    body: eventFormBody(preset),
    submitLabel: 'Salvar',
    onSubmit: async fd => {
      const ev = await db.insert('events', { ...formToEvent(fd), status: 'a_fazer', topics: [], done: false });
      if (ev.kind === 'prova') await createExamBlocks(ev);
      location.hash = `#/escola/p/${ev.id}`;
    },
  });
  wireKindToggle(d);
}

function editEventDialog(ev, reload) {
  const d = openDialog({
    title: 'Editar',
    body: eventFormBody(ev),
    submitLabel: 'Salvar',
    onSubmit: async fd => {
      const patch = formToEvent(fd);
      await db.update('events', ev.id, patch);
      const updated = { ...ev, ...patch };
      const mudou = patch.date !== ev.date || patch.urgency !== ev.urgency || patch.subject !== ev.subject || patch.kind !== ev.kind;
      if (mudou) {
        if (updated.kind === 'prova') await replanExam(updated);
        else {
          const blocks = await db.list('events', { eq: { parent_id: ev.id } });
          for (const b of blocks) if (!b.done) await db.remove('events', b.id);
          await db.update('events', ev.id, { plan_note: null, surprise: false });
        }
      }
      reload();
    },
  });
  wireKindToggle(d);
}

// ============================================================
//  PRAZOS
// ============================================================
async function renderPrazos(el) {
  const today = todayISO();
  const [items, todayBlocks] = await Promise.all([
    db.list('events', { in: { kind: ['prova', 'trabalho'] }, order: 'date' }),
    db.list('events', { eq: { kind: 'estudo', date: today }, order: 'start_time' }),
  ]);
  const next = items.filter(e => e.date >= today);
  const past = items.filter(e => e.date < today).reverse();
  const alerts = next.filter(e => e.plan_note && e.status !== 'feito');

  const row = e => `
    <a class="item" href="#/escola/p/${e.id}">
      <span class="item-main">
        <span class="item-title">${esc(e.title)}</span>
        <span class="item-sub">${subjLabel(e.subject, e.lab)} · ${KIND_LABEL[e.kind]} · ${fmtShort(e.date)}
          ${e.urgency ? ` · ${URGENCY[e.urgency]?.emoji || ''}` : ''}</span>
      </span>
      <span class="st st-${e.status}">${STATUS[e.status] || ''}</span>
      ${daysBadge(e.date)}
    </a>`;

  el.innerHTML = `
    ${alerts.map(e => `<a class="warn ${e.surprise ? 'red' : ''}" href="#/escola/p/${e.id}">
      <b>${e.surprise ? '⚠ Prova surpresa: ' : 'Atenção: '}${esc(e.title)}</b>
      <span>${esc(e.plan_note).replace(/\n/g, '<br>')}</span></a>`).join('')}

    ${todayBlocks.length ? `<section class="card">
      <div class="card-h"><h2>Estudo de hoje</h2><span class="right counter">${todayBlocks.filter(b => b.done).length}/${todayBlocks.length}</span></div>
      ${todayBlocks.map(b => `<div class="check-row ${b.done ? 'done' : ''}" data-block="${b.id}">
        <button class="cb ${b.done ? 'on' : ''}" data-act="done">${icon('check')}</button>
        <span class="t"><span class="muted small">${b.start_time}–${b.end_time}</span> ${subjDot(b.subject)}${esc(b.title)}</span>
        <span class="row-actions" style="opacity:1"><button data-act="open" title="Ver">${icon('next')}</button></span>
      </div>`).join('')}
    </section>` : ''}

    <section class="card">
      <div class="card-h"><h2>Próximas provas e trabalhos</h2></div>
      ${next.length ? next.map(row).join('') : `<div class="empty">Nada cadastrado. Use “Adicionar” ou a aba Importar.</div>`}
    </section>

    ${past.length ? `<details class="card"><summary>Já passaram (${past.length})</summary>${past.map(row).join('')}</details>` : ''}`;

  el.querySelectorAll('[data-block]').forEach(r => r.addEventListener('click', async e => {
    const b = todayBlocks.find(x => x.id === r.dataset.block);
    const act = e.target.closest('[data-act]')?.dataset.act;
    const reload = () => renderPrazos(el);
    if (act === 'done') { await db.update('events', b.id, { done: !b.done }); reload(); }
    if (act === 'open') openStudyBlock(b, reload);
  }));
}

// ============================================================
//  PÁGINA DA PROVA / TRABALHO
// ============================================================
async function renderDetail(main, id) {
  const today = todayISO();
  const [[ev], blocks, mats] = await Promise.all([
    db.list('events', { eq: { id } }),
    db.list('events', { eq: { parent_id: id }, order: 'date' }),
    db.list('materials', { eq: { event_id: id }, order: 'created_at' }).catch(() => []),
  ]);
  if (!ev) { main.innerHTML = `<a class="back" href="#/escola/prazos">${icon('back')} Prazos</a><div class="card empty">Não encontrei esse item.</div>`; return; }
  blocks.sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
  const reload = () => renderDetail(main, id);
  const topics = ev.topics || [];
  const isProva = ev.kind === 'prova';
  const totalMB = mats.reduce((s, m) => s + Number(m.size || 0), 0) / 1048576;

  main.innerHTML = `
    <a class="back" href="#/escola/prazos">${icon('back')} Prazos</a>
    <section class="card">
      <div class="det-head">
        <div>
          <div class="item-sub">${subjLabel(ev.subject, ev.lab)} · ${KIND_LABEL[ev.kind]}</div>
          <h1 class="det-title">${esc(ev.title)}</h1>
          <div class="muted">${fmtLong(ev.date)} ${daysBadge(ev.date)}</div>
        </div>
        <div class="row-btns">
          <button class="btn ghost" id="edit">Editar</button>
          <button class="btn danger" id="del">${icon('trash')}</button>
        </div>
      </div>
      <div class="two" style="margin-top:12px">
        <label class="lbl">Status<select class="input" id="status">${Object.entries(STATUS).map(([k, v]) =>
          `<option value="${k}" ${k === ev.status ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        ${isProva ? `<label class="lbl">Urgência<select class="input" id="urg">${Object.entries(URGENCY).map(([k, u]) =>
          `<option value="${k}" ${k === ev.urgency ? 'selected' : ''}>${u.emoji} ${u.label}</option>`).join('')}</select></label>` : ''}
      </div>
    </section>

    ${ev.plan_note ? `<div class="warn ${ev.surprise ? 'red' : ''}"><b>${ev.surprise ? '⚠ Prova surpresa' : 'Atenção'}</b>
      <span>${esc(ev.plan_note).replace(/\n/g, '<br>')}</span></div>` : ''}

    <section class="card">
      <div class="card-h"><h2>O que vai cair</h2></div>
      <textarea class="input" id="content" rows="3" placeholder="Ex: capítulos 3 e 4, exercícios da lista 2…">${esc(ev.content || '')}</textarea>
      <div id="topics" style="margin-top:8px">
        ${topics.map((t, i) => `<div class="check-row ${t.done ? 'done' : ''}" data-i="${i}">
          <button class="cb ${t.done ? 'on' : ''}" data-act="tog">${icon('check')}</button>
          <span class="t">${esc(t.text)}</span>
          <span class="row-actions"><button data-act="del" title="Apagar">${icon('trash')}</button></span></div>`).join('')}
      </div>
      <form class="add-row" id="addTopic"><input class="input" name="t" maxlength="120" placeholder="Novo tópico…" autocomplete="off">
        <button class="btn" aria-label="Adicionar tópico">${icon('plus')}</button></form>
    </section>

    <section class="card">
      <div class="card-h"><h2>Materiais</h2><span class="right small">${mats.length ? `${totalMB.toFixed(1)} MB` : ''}</span></div>
      ${mats.map(m => `<div class="check-row" data-mat="${m.id}">
        <span class="t"><button class="linkbtn" data-act="open">📄 ${esc(m.name)}</button>
          <span class="muted small"> · ${(m.size / 1048576).toFixed(1)} MB</span></span>
        <span class="row-actions"><button data-act="del" title="Apagar">${icon('trash')}</button></span></div>`).join('')
        || '<div class="empty">Nenhum PDF ainda.</div>'}
      ${db.isCloud() ? `<label class="btn ghost upl">${icon('file')} Enviar PDF<input type="file" id="upl" accept="application/pdf" hidden></label>
        <p class="muted small">Até 20 MB por arquivo. O plano grátis do Supabase tem 1 GB no total.</p>`
        : '<p class="muted small">Enviar PDFs precisa do Supabase (não funciona no modo local).</p>'}
      <div class="small" id="uplMsg"></div>
    </section>

    ${isProva ? `<section class="card">
      <div class="card-h"><h2>Blocos de estudo</h2>
        <span class="right counter">${blocks.filter(b => b.done).length}/${blocks.length}</span></div>
      ${blocks.map(b => `<div class="check-row ${b.done ? 'done' : ''}" data-block="${b.id}">
        <button class="cb ${b.done ? 'on' : ''}" data-act="done">${icon('check')}</button>
        <span class="t">${fmtShort(b.date)} · ${b.start_time}–${b.end_time}${isTrainingDay(b.date) ? ' <span class="tag">dia de treino</span>' : ''}</span>
        <span class="row-actions" style="opacity:1">
          <button data-act="move" title="Mover">${icon('calendar')}</button>
          <button data-act="del" title="Apagar">${icon('trash')}</button></span></div>`).join('')
        || '<div class="empty">Nenhum bloco.</div>'}
      ${ev.date > today ? `<button class="btn ghost" id="replan" style="margin-top:10px">Recriar blocos</button>
        <p class="muted small">Recriar apaga os blocos ainda não feitos e monta de novo nos horários livres.</p>` : ''}
    </section>` : ''}`;

  // Ações
  main.querySelector('#edit').onclick = () => editEventDialog(ev, reload);
  main.querySelector('#del').onclick = async () => {
    if (!confirm(`Apagar "${ev.title}" com os blocos de estudo e PDFs ligados a ela?`)) return;
    await deleteEventCascade(ev);
    location.hash = '#/escola/prazos';
  };
  main.querySelector('#status').onchange = async e => { await db.update('events', id, { status: e.target.value }); };
  const urg = main.querySelector('#urg');
  if (urg) urg.onchange = async e => {
    await db.update('events', id, { urgency: e.target.value });
    if (ev.date > today && confirm('Mudou a urgência. Quer recriar os blocos de estudo com as novas horas?')) {
      await replanExam({ ...ev, urgency: e.target.value });
    }
    reload();
  };
  main.querySelector('#content').onchange = async e => { await db.update('events', id, { content: e.target.value }); };

  const saveTopics = async list => { await db.update('events', id, { topics: list }); reload(); };
  main.querySelector('#addTopic').onsubmit = async e => {
    e.preventDefault();
    const t = e.target.t.value.trim();
    if (t) await saveTopics([...topics, { text: t, done: false }]);
  };
  main.querySelector('#topics').addEventListener('click', e => {
    const r = e.target.closest('[data-i]'); const act = e.target.closest('[data-act]')?.dataset.act;
    if (!r || !act) return;
    const i = Number(r.dataset.i);
    if (act === 'tog') saveTopics(topics.map((t, j) => (j === i ? { ...t, done: !t.done } : t)));
    if (act === 'del') saveTopics(topics.filter((_, j) => j !== i));
  });

  main.querySelectorAll('[data-mat]').forEach(r => r.addEventListener('click', async e => {
    const m = mats.find(x => x.id === r.dataset.mat);
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'open') openMaterial(m);
    if (act === 'del' && confirm(`Apagar "${m.name}"?`)) {
      await db.removeFile('materiais', m.path); await db.remove('materials', m.id); reload();
    }
  }));
  const upl = main.querySelector('#upl');
  if (upl) upl.onchange = async () => {
    const f = upl.files[0]; const msg = main.querySelector('#uplMsg');
    if (!f) return;
    if (f.type !== 'application/pdf') { msg.textContent = 'Só arquivos PDF.'; return; }
    if (f.size > 20 * 1048576) { msg.textContent = `Esse PDF tem ${(f.size / 1048576).toFixed(1)} MB. O limite aqui é 20 MB — tente comprimir o arquivo.`; return; }
    msg.textContent = 'Enviando…';
    try {
      const safe = f.name.normalize('NFD').replace(/[^\w.\-]+/g, '_').slice(-80);
      const path = await db.uploadFile('materiais', `${id}/${Date.now()}-${safe}`, f);
      await db.insert('materials', { event_id: id, name: f.name, path, size: f.size });
      reload();
    } catch (err) { msg.textContent = 'Não deu para enviar: ' + err.message; }
  };

  main.querySelectorAll('[data-block]').forEach(r => r.addEventListener('click', async e => {
    const b = blocks.find(x => x.id === r.dataset.block);
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'done') { await db.update('events', b.id, { done: !b.done }); reload(); }
    if (act === 'move') moveBlock(b, reload);
    if (act === 'del') { await db.remove('events', b.id); reload(); }
  }));
  const rp = main.querySelector('#replan');
  if (rp) rp.onclick = async () => { rp.disabled = true; await replanExam(ev); reload(); };
}

// ============================================================
//  GRADE SEMANAL
// ============================================================
let gradeDay = null;
function renderGrade(el) {
  const tt = getSetting('timetable');
  const routine = getSetting('routine');
  const now = new Date();
  const todayDow = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (gradeDay === null) gradeDay = todayDow >= 1 && todayDow <= 5 ? todayDow : 1;
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  const cell = (p, d) => {
    if (!p) return '';
    const [a, b, s, lab] = p;
    const live = d === todayDow && nowMin >= toMin(a) && nowMin < toMin(b);
    return s ? `<div class="tt-cell ${live ? 'live' : ''}">${subjDot(s)}${esc(subj(s)?.short || s)}${lab ? '<span class="tag">Lab</span>' : ''}</div>`
      : `<div class="tt-cell rec ${live ? 'live' : ''}">recreio</div>`;
  };
  // tabela da semana (computador): linhas por horário
  const times = [...new Set(Object.values(tt).flat().map(p => p[0]))].sort();
  const table = `<div class="tt">
    <div class="tt-h"></div>${[1, 2, 3, 4, 5].map(d => `<div class="tt-h ${d === todayDow ? 'on' : ''}">${DIAS[d]}</div>`).join('')}
    ${times.map(t => {
      const end = Object.values(tt).flat().find(p => p[0] === t)?.[1];
      return `<div class="tt-time">${t}<br><span>${end}</span></div>` +
        [1, 2, 3, 4, 5].map(d => cell((tt[d] || []).find(p => p[0] === t), d) || '<div class="tt-cell empty-c"></div>').join('');
    }).join('')}
  </div>`;

  // lista do dia (celular)
  const list = (tt[gradeDay] || []).map(p => {
    const [a, b, s, lab] = p;
    const live = gradeDay === todayDow && nowMin >= toMin(a) && nowMin < toMin(b);
    return `<div class="tt-row ${s ? '' : 'rec'} ${live ? 'live' : ''}"><span class="muted small">${a}–${b}</span>
      <span>${s ? subjLabel(s, lab) : 'Recreio'}</span></div>`;
  }).join('');

  const busy = routine.busy.filter(b => b.days.includes(gradeDay)).map(b => `${b.label} ${b.from}–${b.to}`);
  el.innerHTML = `
    <section class="card only-desk">${table}</section>
    <section class="card only-mob">
      <div class="seg small-seg">${[1, 2, 3, 4, 5].map(d => `<button data-d="${d}" class="${d === gradeDay ? 'on' : ''}">${DIAS[d]}</button>`).join('')}</div>
      ${list}
    </section>
    <section class="card">
      <div class="card-h"><h2>Depois da escola</h2>
        <span class="right only-desk"><span class="seg small-seg">${[1, 2, 3, 4, 5].map(d =>
          `<button data-d="${d}" class="${d === gradeDay ? 'on' : ''}">${DIAS[d]}</button>`).join('')}</span></span></div>
      <p style="margin:0 0 6px">${esc(routine.notes?.[gradeDay] || '')}</p>
      <p class="muted small" style="margin:0">${esc(busy.join(' · '))}${busy.length ? ' · ' : ''}À noite: tarefas, estudo e tempo livre.</p>
    </section>`;
  el.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { gradeDay = Number(b.dataset.d); renderGrade(el); });
}

// ============================================================
//  NOTAS
// ============================================================
function gradeStatus(g) {
  if (g.score === null || g.score === undefined || g.score === '') return 'pend';
  const pass = g.max * g.pass_pct / 100;
  const margin = g.max * 0.05;
  const diff = Number(g.score) - pass;
  if (diff > margin) return 'ok';
  if (diff >= -margin) return 'near';
  return 'bad';
}
const fmtN = n => String(Math.round(Number(n) * 100) / 100).replace('.', ',');

async function renderNotas(el) {
  const [grades, exams] = await Promise.all([
    db.list('grades', { order: 'created_at' }),
    db.list('events', { in: { kind: ['prova', 'trabalho'] }, order: 'date' }),
  ]);
  const bySubj = subjects().map(s => ({ s, list: grades.filter(g => g.subject === s.key) })).filter(x => x.list.length);
  const reload = () => renderNotas(el);

  el.innerHTML = `
    <div class="legend small muted">
      <span><i class="gd ok"></i> acima da média</span><span><i class="gd near"></i> perto</span>
      <span><i class="gd bad"></i> abaixo</span><span><i class="gd pend"></i> sem nota</span>
      <button class="btn" id="addGrade" style="margin-left:auto">${icon('plus')} Avaliação</button>
    </div>
    ${bySubj.length ? `<div class="notas-grid">${bySubj.map(({ s, list }) => {
      const graded = list.filter(g => gradeStatus(g) !== 'pend');
      const got = graded.reduce((a, g) => a + Number(g.score), 0);
      const max = graded.reduce((a, g) => a + Number(g.max), 0);
      const all = list.reduce((a, g) => a + Number(g.max), 0);
      return `<section class="card">
        <div class="card-h"><h2>${subjDot(s.key)}${esc(s.name)}</h2>
          <span class="right"><b class="counter">${fmtN(got)}</b>/${fmtN(max)} pts</span></div>
        ${list.map(g => `<button class="grade-row" data-g="${g.id}">
          <i class="gd ${gradeStatus(g)}"></i>
          <span class="t">${esc(g.name)}${g.date ? `<span class="muted small"> · ${fmtShort(g.date)}</span>` : ''}</span>
          <span class="small muted">média ${fmtN(g.max * g.pass_pct / 100)}</span>
          <b>${g.score === null || g.score === undefined ? '—' : fmtN(g.score)}<span class="muted">/${fmtN(g.max)}</span></b>
        </button>`).join('')}
        <div class="muted small" style="margin-top:6px">Valendo até agora: ${fmtN(all)} pts</div>
      </section>`;
    }).join('')}</div>` : `<section class="card empty">Nenhuma avaliação ainda. Clique em “Avaliação” para adicionar.</section>`}`;

  el.querySelector('#addGrade').onclick = () => gradeDialog(null, exams, reload);
  el.querySelectorAll('[data-g]').forEach(b => b.onclick = () => gradeDialog(grades.find(g => g.id === b.dataset.g), exams, reload));
}

function gradeDialog(g, exams, reload) {
  const passDef = getSetting('pass_pct');
  g = g || { subject: 'mat', name: '', max: '', score: '', pass_pct: passDef, date: '', event_id: '' };
  const d = openDialog({
    title: g.id ? 'Editar avaliação' : 'Nova avaliação',
    body: `
      <label>Ligar a uma prova/trabalho (opcional)<select class="input" name="event_id">
        <option value="">— nenhuma —</option>
        ${exams.map(e => `<option value="${e.id}" ${e.id === g.event_id ? 'selected' : ''}>${esc(subjName(e.subject))} · ${esc(e.title)} · ${fmtShort(e.date)}</option>`).join('')}
      </select></label>
      <div class="two">
        <label>Matéria<select class="input" name="subject">${subjOptions(g.subject)}</select></label>
        <label>Data<input class="input" type="date" name="date" value="${g.date || ''}"></label>
      </div>
      <label>Nome<input class="input" name="name" required maxlength="120" value="${esc(g.name)}" placeholder="Ex: Prova 1"></label>
      <div class="three">
        <label>Vale<input class="input" type="number" name="max" min="0.1" step="0.1" required value="${g.max}"></label>
        <label>Tirei<input class="input" type="number" name="score" min="0" step="0.01" value="${g.score ?? ''}" placeholder="—"></label>
        <label>Média %<input class="input" type="number" name="pass_pct" min="0" max="100" step="1" value="${g.pass_pct}"></label>
      </div>
      <p class="muted small" id="passInfo" style="margin:0"></p>`,
    submitLabel: 'Salvar',
    danger: g.id ? 'Apagar' : null,
    onDanger: async () => { await db.remove('grades', g.id); reload(); },
    onSubmit: async fd => {
      const row = {
        subject: fd.get('subject'), name: fd.get('name').trim(), max: Number(fd.get('max')),
        score: fd.get('score') === '' ? null : Number(fd.get('score')),
        pass_pct: Number(fd.get('pass_pct') || passDef), date: fd.get('date') || null,
        event_id: fd.get('event_id') || null,
      };
      if (row.score !== null && row.score > row.max) { alert('A nota não pode ser maior do que o valor.'); return false; }
      // Data sem prova ligada: cria o item no calendário
      if (!row.event_id && row.date) {
        const ev = await db.insert('events', { kind: 'prova', title: row.name, date: row.date, subject: row.subject,
          status: row.score !== null ? 'feito' : 'a_fazer', topics: [], done: false });
        row.event_id = ev.id;
      }
      if (g.id) await db.update('grades', g.id, row); else await db.insert('grades', row);
      reload();
    },
  });
  const info = () => {
    const max = Number(d.querySelector('[name=max]').value), pct = Number(d.querySelector('[name=pass_pct]').value);
    d.querySelector('#passInfo').textContent = max ? `Média desta avaliação: ${fmtN(max * pct / 100)} pontos (${pct}%).` : '';
  };
  d.querySelectorAll('[name=max],[name=pass_pct]').forEach(i => i.oninput = info); info();
  d.querySelector('[name=event_id]').onchange = e => {
    const ex = exams.find(x => x.id === e.target.value);
    if (!ex) return;
    d.querySelector('[name=subject]').value = ex.subject || 'mat';
    d.querySelector('[name=date]').value = ex.date;
    if (!d.querySelector('[name=name]').value) d.querySelector('[name=name]').value = ex.title;
  };
}

// ============================================================
//  IMPORTAR
// ============================================================
function renderImportar(el) {
  const draw = () => {
    el.innerHTML = `
      <section class="card">
        <div class="card-h"><h2>Colar texto ou enviar PDF</h2></div>
        <p class="muted small" style="margin-top:0">Cole o texto do recado, do quadro ou do e-mail. Eu procuro datas, matérias e tipo (prova ou trabalho)
          e te mostro tudo para revisar antes de salvar. <b>Imagens e PDFs escaneados não são lidos</b> — só PDFs com texto.</p>
        <textarea class="input" id="imText" rows="7" placeholder="Ex:&#10;Prova de Física 20/11 - cinemática&#10;Trabajo de Sociales: entrega 25 de noviembre&#10;Matemática — teste 03/12"></textarea>
        <div class="row-btns" style="margin-top:10px">
          <button class="btn" id="imParse">Detectar</button>
          <label class="btn ghost upl">${icon('file')} Enviar PDF<input type="file" id="imPdf" accept="application/pdf" hidden></label>
        </div>
        <div class="small muted" id="imMsg" style="margin-top:8px"></div>
      </section>
      ${importItems ? reviewHtml() : ''}`;
    el.querySelector('#imParse').onclick = () => {
      importItems = parseText(el.querySelector('#imText').value);
      if (!importItems.length) { importItems = null; el.querySelector('#imMsg').textContent = 'Não achei nenhuma data no texto. Confira se tem datas como 20/11 ou "20 de novembro".'; return; }
      draw();
    };
    el.querySelector('#imPdf').onchange = async e => {
      const f = e.target.files[0]; const msg = el.querySelector('#imMsg');
      if (!f) return;
      msg.textContent = 'Lendo o PDF…';
      try {
        const text = await pdfToText(f);
        if (text.replace(/\s/g, '').length < 10) { msg.textContent = 'Esse PDF não tem texto (parece escaneado ou imagem). Digite os itens à mão.'; return; }
        el.querySelector('#imText').value = text;
        importItems = parseText(text);
        if (!importItems.length) { importItems = null; msg.textContent = 'Li o PDF, mas não achei datas. O texto apareceu na caixa acima — dá para editar e clicar em Detectar.'; return; }
        const keep = text; draw(); el.querySelector('#imText').value = keep;
      } catch (err) { msg.textContent = 'Não consegui ler o PDF: ' + err.message; }
    };
    if (importItems) wireReview();
  };

  const reviewHtml = () => `
    <section class="card">
      <div class="card-h"><h2>Revisar (${importItems.length})</h2><span class="right small">Confira e corrija antes de salvar</span></div>
      ${importItems.map((it, i) => `<div class="rev ${it.include ? '' : 'off'}" data-i="${i}">
        <label class="check"><input type="checkbox" data-f="include" ${it.include ? 'checked' : ''}> Salvar</label>
        <input class="input" data-f="title" value="${esc(it.title)}" maxlength="120">
        <div class="rev-grid">
          <select class="input" data-f="subject"><option value="">— matéria —</option>${subjOptions(it.subject)}</select>
          <select class="input" data-f="kind">${Object.entries(KIND_LABEL).map(([k, v]) => `<option value="${k}" ${k === it.kind ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <input class="input" type="date" data-f="date" value="${it.date}">
          <select class="input" data-f="urgency" ${it.kind !== 'prova' ? 'disabled' : ''}>${Object.entries(URGENCY).map(([k, u]) =>
            `<option value="${k}" ${k === it.urgency ? 'selected' : ''}>${u.emoji} ${u.label}</option>`).join('')}</select>
        </div>
        <div class="muted small">Lido: “${esc(it.source)}”</div>
      </div>`).join('')}
      <div class="row-btns" style="margin-top:10px">
        <button class="btn" id="imSave">Salvar selecionados</button>
        <button class="btn ghost" id="imCancel">Descartar</button>
      </div>
      <div class="small" id="imSaveMsg"></div>
    </section>`;

  const wireReview = () => {
    el.querySelectorAll('.rev').forEach(r => {
      const it = importItems[Number(r.dataset.i)];
      r.querySelectorAll('[data-f]').forEach(inp => inp.onchange = () => {
        const f = inp.dataset.f;
        it[f] = inp.type === 'checkbox' ? inp.checked : inp.value;
        if (f === 'include') r.classList.toggle('off', !it.include);
        if (f === 'kind') r.querySelector('[data-f=urgency]').disabled = it.kind !== 'prova';
      });
    });
    el.querySelector('#imCancel').onclick = () => { importItems = null; draw(); };
    el.querySelector('#imSave').onclick = async () => {
      const sel = importItems.filter(i => i.include);
      const msg = el.querySelector('#imSaveMsg');
      if (sel.some(i => !i.subject || !i.date || !i.title.trim())) { msg.textContent = 'Escolha a matéria, a data e o título de todos os itens marcados.'; return; }
      el.querySelector('#imSave').disabled = true;
      msg.textContent = 'Salvando e montando os blocos de estudo…';
      for (const it of sel) {
        const ev = await db.insert('events', { kind: it.kind, title: it.title.trim(), date: it.date, subject: it.subject,
          lab: !!it.lab, urgency: it.kind === 'prova' ? it.urgency : null, status: 'a_fazer', topics: [], done: false });
        if (ev.kind === 'prova') await createExamBlocks(ev);
      }
      importItems = null;
      location.hash = '#/escola/prazos';
    };
  };
  draw();
}
