// ============================================================
//  Tela CONFIGURAÇÕES
//  Perfil e tema · Matérias · Horários · Estudo e média ·
//  Treinos · Hábitos · Backup (exportar, importar, apagar)
// ============================================================
import * as db from '../db.js';
import { icon } from '../icons.js';
import { openDialog } from '../ui.js';
import { esc, todayISO } from '../util.js';
import { getSetting, setSetting, loadSettings, applyLook } from '../settings.js';
import { DEFAULTS } from '../data/defaults.js';
import { loadTraining } from '../training.js';

const TABS = [
  ['perfil', 'Perfil e tema'], ['materias', 'Matérias'], ['horarios', 'Horários'],
  ['estudo', 'Estudo e média'], ['treinos', 'Treinos'], ['habitos', 'Hábitos'], ['backup', 'Backup e dados'],
];
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HABIT_ICONS = ['dumbbell', 'school', 'droplet', 'moon', 'flame', 'heart', 'star', 'sparkle', 'bed', 'pray', 'table', 'file', 'trend', 'flag'];
// Todas as tabelas, na ordem certa para colocar de volta (pais antes dos filhos)
const TABLES = ['settings', 'tasks', 'events', 'habit_logs', 'grades', 'materials',
  'workout_logs', 'load_logs', 'body_logs', 'exercise_media', 'goals', 'goal_items'];
const BUCKETS = ['materiais', 'midia', 'sonhos'];

const clone = o => JSON.parse(JSON.stringify(o));
const newKey = p => `${p}_${Math.random().toString(36).slice(2, 7)}`;
const val = (el, sel) => el.querySelector(sel)?.value.trim() ?? '';
const chk = (el, sel) => !!el.querySelector(sel)?.checked;

// Mostra "Salvo ✓" no botão por um instante
function flash(btn, txt = 'Salvo ✓') {
  const old = btn.innerHTML;
  btn.innerHTML = txt; btn.disabled = true;
  setTimeout(() => { btn.innerHTML = old; btn.disabled = false; }, 1400);
}
function resetBtn(label = 'Voltar ao padrão') {
  return `<button type="button" class="btn ghost" data-reset>${label}</button>`;
}

export async function renderConfig(main, ctx, params = []) {
  const tab = TABS.some(([k]) => k === params[0]) ? params[0] : 'perfil';
  main.innerHTML = `
    <h1 class="page-title">Configurações</h1>
    <nav class="seg cfg-tabs">${TABS.map(([k, l]) => `<a href="#/config/${k}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('')}</nav>
    <div id="cfg" class="stack cfg"></div>`;
  const el = main.querySelector('#cfg');
  const fn = { perfil, materias, horarios, estudo, treinos, habitos, backup }[tab];
  await fn(el, ctx);
  main.querySelector('.cfg-tabs .on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

// ============================================================
//  Perfil e tema
// ============================================================
function perfil(el, ctx) {
  const cloud = db.isCloud();
  const theme = getSetting('theme'), size = getSetting('text_size');
  el.innerHTML = `
    <div class="card">
      <div class="card-h"><h2>Perfil</h2></div>
      <form id="nameForm" class="add-row">
        <input class="input" name="n" maxlength="30" value="${esc(db.getName())}" placeholder="Seu nome">
        <button class="btn">Salvar</button>
      </form>
    </div>
    <div class="card">
      <div class="card-h"><h2>Tema</h2></div>
      <div class="small muted" style="margin-bottom:6px">Cor de fundo</div>
      <div class="seg" id="theme">
        <button data-v="escuro" class="${theme === 'escuro' ? 'on' : ''}">Escuro</button>
        <button data-v="preto" class="${theme === 'preto' ? 'on' : ''}">Preto total</button>
      </div>
      <div class="small muted" style="margin-bottom:6px">Tamanho do texto</div>
      <div class="seg" id="size" style="margin-bottom:0">
        <button data-v="normal" class="${size === 'normal' ? 'on' : ''}">Normal</button>
        <button data-v="grande" class="${size === 'grande' ? 'on' : ''}">Grande</button>
      </div>
    </div>
    <div class="card">
      <div class="card-h"><h2>Onde seus dados ficam</h2></div>
      <span class="mode-pill"><span class="d" style="background:${cloud ? '#f2f2f2' : '#8a8a8a'}"></span>
        ${cloud ? 'Nuvem (Supabase) — sincroniza celular e computador' : 'Modo local — só neste navegador'}</span>
      ${cloud ? `<p class="muted small">Conectado como ${esc(db.currentUser()?.email)}</p>
        <button class="btn ghost" id="logout">${icon('logout')} Sair da conta</button>`
      : '<p class="muted small">Para sincronizar, preencha o arquivo <code>js/config.js</code> (veja o LEIA-ME).</p>'}
    </div>
    <div class="card">
      <div class="card-h"><h2>Sem notificações</h2></div>
      <p class="muted small" style="margin:0">O KAI Planner nunca avisa nada sozinho: sem notificações, lembretes, sons ou vibração. Ele só mostra as coisas quando você abre.</p>
    </div>`;

  el.querySelector('#nameForm').onsubmit = async e => {
    e.preventDefault();
    const n = e.target.n.value.trim();
    if (!n) return;
    await db.setName(n);
    ctx.refreshShell();
  };
  const pick = (id, key) => el.querySelector(id).onclick = async e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    await setSetting(key, b.dataset.v);
    applyLook();
    el.querySelectorAll(`${id} button`).forEach(x => x.classList.toggle('on', x === b));
  };
  pick('#theme', 'theme'); pick('#size', 'text_size');
  const lo = el.querySelector('#logout');
  if (lo) lo.onclick = async () => { await db.signOut(); location.hash = '#/inicio'; location.reload(); };
}

// ============================================================
//  Matérias e cores
// ============================================================
function materias(el) {
  let list = clone(getSetting('subjects'));
  const row = s => `
    <div class="cfg-row" data-key="${esc(s.key)}">
      <input type="color" class="color" value="${esc(s.color || '#888888')}" aria-label="Cor">
      <input class="input grow" data-f="name" value="${esc(s.name)}" maxlength="40" placeholder="Nome">
      <input class="input w-sm" data-f="short" value="${esc(s.short || '')}" maxlength="5" placeholder="Sigla">
      <label class="check"><input type="checkbox" data-f="hard" ${s.hard ? 'checked' : ''}> difícil</label>
      <label class="check"><input type="checkbox" data-f="lab" ${s.lab ? 'checked' : ''}> tem lab</label>
      <button type="button" class="icon-btn" data-del title="Apagar">${icon('trash')}</button>
    </div>`;
  const draw = () => {
    el.innerHTML = `
      <div class="card">
        <div class="card-h"><h2>Matérias e cores</h2></div>
        <p class="small muted" style="margin-top:0">“Difícil” = o estudo automático começa mais cedo (Matemática, Física, Química…). A cor é a bolinha discreta ao lado do nome.</p>
        <div id="rows">${list.map(row).join('')}</div>
        <button type="button" class="linkbtn" id="add" style="margin-top:10px">+ Adicionar matéria</button>
        <div class="row-btns" style="margin-top:14px"><button class="btn" id="save">Salvar</button>${resetBtn()}</div>
      </div>`;
  };
  const read = () => [...el.querySelectorAll('#rows .cfg-row')].map(r => ({
    key: r.dataset.key, name: val(r, '[data-f=name]'), short: val(r, '[data-f=short]').toUpperCase(),
    color: r.querySelector('.color').value, hard: chk(r, '[data-f=hard]'), lab: chk(r, '[data-f=lab]'),
  }));
  draw();
  el.onclick = async e => {
    if (e.target.closest('#add')) { list = read(); list.push({ key: newKey('m'), name: '', short: '', color: '#8a8a8a' }); draw(); el.querySelector('#rows .cfg-row:last-child [data-f=name]').focus(); }
    if (e.target.closest('[data-del]')) {
      const r = e.target.closest('.cfg-row');
      if (confirm(`Apagar a matéria "${val(r, '[data-f=name]')}"? Provas e notas antigas dela ficam como "Sem matéria".`)) { list = read().filter(s => s.key !== r.dataset.key); draw(); }
    }
    if (e.target.closest('[data-reset]') && confirm('Voltar as matérias para o padrão?')) { list = clone(DEFAULTS.subjects); draw(); }
    const sv = e.target.closest('#save');
    if (sv) {
      const out = read();
      if (out.some(s => !s.name)) { alert('Toda matéria precisa de um nome.'); return; }
      out.forEach(s => { if (!s.short) s.short = s.name.slice(0, 3).toUpperCase(); });
      await setSetting('subjects', out); list = out;
      flash(el.querySelector('#save'));
    }
  };
}

// ============================================================
//  Horários: grade da escola + rotina fora da escola
// ============================================================
function horarios(el) {
  const tt = clone(getSetting('timetable'));
  const routine = clone(getSetting('routine'));
  const subjects = getSetting('subjects');
  let day = 1;
  const subjSel = v => `<select class="input grow" data-f="subj"><option value="">Recreio / intervalo</option>
    ${subjects.map(s => `<option value="${esc(s.key)}" ${s.key === v ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`;
  const aulaRow = a => `
    <div class="cfg-row aula-row">
      <input class="input w-time" type="time" data-f="from" value="${a[0]}">
      <input class="input w-time" type="time" data-f="to" value="${a[1]}">
      ${subjSel(a[2])}
      <label class="check"><input type="checkbox" data-f="lab" ${a[3] ? 'checked' : ''}> lab</label>
      <button type="button" class="icon-btn" data-del title="Apagar">${icon('trash')}</button>
    </div>`;
  const busyRow = b => `
    <div class="cfg-row busy-row">
      <input class="input grow" data-f="label" value="${esc(b.label)}" maxlength="40" placeholder="Ex: Inglês (curso)">
      <input class="input w-time" type="time" data-f="from" value="${b.from}">
      <input class="input w-time" type="time" data-f="to" value="${b.to}">
      <span class="days">${DIAS.map((d, i) => `<label class="dchip"><input type="checkbox" value="${i}" ${b.days.includes(i) ? 'checked' : ''}><span>${d.charAt(0)}</span></label>`).join('')}</span>
      <button type="button" class="icon-btn" data-delb title="Apagar">${icon('trash')}</button>
    </div>`;
  const winTxt = w => (w || []).map(([a, b]) => `${a}-${b}`).join(', ');

  const readGrade = () => {
    tt[day] = [...el.querySelectorAll('#aulas .cfg-row')].map(r => {
      const s = r.querySelector('[data-f=subj]').value || null;
      const a = [val(r, '[data-f=from]'), val(r, '[data-f=to]'), s];
      if (chk(r, '[data-f=lab]')) a.push(true);
      return a;
    }).filter(a => a[0] && a[1]).sort((x, y) => x[0].localeCompare(y[0]));
  };
  const readBusy = () => [...el.querySelectorAll('#busy .busy-row')].map(r => ({
    label: val(r, '[data-f=label]'), from: val(r, '[data-f=from]'), to: val(r, '[data-f=to]'),
    days: [...r.querySelectorAll('.days input:checked')].map(i => Number(i.value)),
  }));

  const draw = () => {
    el.innerHTML = `
      <div class="card">
        <div class="card-h"><h2>Grade da escola</h2></div>
        <div class="seg" id="days">${[1, 2, 3, 4, 5].map(d => `<button data-d="${d}" class="${d === day ? 'on' : ''}">${DIAS[d]}</button>`).join('')}</div>
        <div id="aulas">${(tt[day] || []).map(aulaRow).join('') || '<div class="empty">Sem aulas neste dia.</div>'}</div>
        <button type="button" class="linkbtn" id="addAula" style="margin-top:10px">+ Adicionar aula</button>
        <div class="row-btns" style="margin-top:14px"><button class="btn" id="saveGrade">Salvar grade</button>${resetBtn()}</div>
      </div>
      <div class="card" id="rotCard">
        <div class="card-h"><h2>Depois da escola</h2></div>
        <p class="small muted" style="margin-top:0">Horários livres = quando o estudo automático pode colocar blocos. Escreva assim: <code>15:30-22:00</code> (separe com vírgula se tiver mais de um).</p>
        ${[1, 2, 3, 4, 5, 6, 0].map(d => `
          <div class="cfg-row">
            <b class="w-day">${DIAS[d]}</b>
            <input class="input grow" data-free="${d}" value="${esc(winTxt(routine.free[d]))}" placeholder="livre (ex: 14:00-22:00)">
            <input class="input grow" data-note="${d}" value="${esc(routine.notes?.[d] || '')}" maxlength="120" placeholder="observação (opcional)">
          </div>`).join('')}
        <h3 class="sub-h">Compromissos fixos</h3>
        <div id="busy">${routine.busy.map(busyRow).join('')}</div>
        <button type="button" class="linkbtn" id="addBusy" style="margin-top:10px">+ Adicionar compromisso</button>
        <h3 class="sub-h">Horário do treino</h3>
        <div class="cfg-row">
          <input class="input w-time" type="time" id="trFrom" value="${routine.training.from}"> até
          <input class="input w-time" type="time" id="trTo" value="${routine.training.to}">
        </div>
        <div class="row-btns" style="margin-top:14px"><button class="btn" id="saveRot">Salvar rotina</button>
          <button type="button" class="btn ghost" id="resetRot">Voltar ao padrão</button></div>
      </div>`;
  };
  draw();

  el.onclick = async e => {
    const d = e.target.closest('#days [data-d]');
    if (d) { readGrade(); routine.busy = readBusy(); day = Number(d.dataset.d); draw(); return; }
    if (e.target.closest('#addAula')) {
      readGrade(); routine.busy = readBusy();
      const last = tt[day]?.[tt[day].length - 1];
      (tt[day] ||= []).push([last ? last[1] : '07:30', '', '']);
      draw(); return;
    }
    if (e.target.closest('[data-del]')) { e.target.closest('.cfg-row').remove(); return; }
    if (e.target.closest('[data-delb]')) { e.target.closest('.busy-row').remove(); return; }
    if (e.target.closest('#addBusy')) {
      readGrade(); routine.busy = readBusy();
      routine.busy.push({ label: '', from: '16:00', to: '17:00', days: [] });
      draw(); return;
    }
    if (e.target.closest('#saveGrade')) {
      readGrade();
      if ([...el.querySelectorAll('#aulas .cfg-row')].some(r => !val(r, '[data-f=to]') || val(r, '[data-f=to]') <= val(r, '[data-f=from]'))) { alert('Confira os horários: o fim de cada aula precisa ser depois do começo.'); return; }
      await setSetting('timetable', tt);
      flash(el.querySelector('#saveGrade'));
      return;
    }
    if (e.target.closest('[data-reset]') && confirm('Voltar a grade da escola para o padrão?')) {
      Object.assign(tt, clone(DEFAULTS.timetable)); await setSetting('timetable', clone(DEFAULTS.timetable)); draw(); return;
    }
    if (e.target.closest('#resetRot') && confirm('Voltar os horários de depois da escola para o padrão?')) {
      Object.assign(routine, clone(DEFAULTS.routine)); await setSetting('routine', clone(DEFAULTS.routine)); draw(); return;
    }
    if (e.target.closest('#saveRot')) {
      const free = {}, notes = {};
      for (const inp of el.querySelectorAll('[data-free]')) {
        const txt = inp.value.trim();
        const parts = txt ? txt.split(/[,;]/).map(p => p.trim()).filter(Boolean) : [];
        const wins = [];
        for (const p of parts) {
          const m = p.match(/^(\d{1,2}):?(\d{2})\s*[-–a]+\s*(\d{1,2}):?(\d{2})$/);
          if (!m) { alert(`Não entendi "${p}" em ${DIAS[inp.dataset.free]}. Escreva assim: 15:30-22:00`); inp.focus(); return; }
          const a = `${m[1].padStart(2, '0')}:${m[2]}`, b = `${m[3].padStart(2, '0')}:${m[4]}`;
          if (b <= a) { alert(`Em ${DIAS[inp.dataset.free]}, o fim precisa ser depois do começo (${p}).`); inp.focus(); return; }
          wins.push([a, b]);
        }
        free[inp.dataset.free] = wins.sort((x, y) => x[0].localeCompare(y[0]));
      }
      el.querySelectorAll('[data-note]').forEach(i => { if (i.value.trim()) notes[i.dataset.note] = i.value.trim(); });
      const busy = readBusy();
      if (busy.some(b => !b.label || !b.days.length || !b.from || !b.to || b.to <= b.from)) {
        alert('Cada compromisso precisa de nome, horário certo e pelo menos um dia.'); return;
      }
      const trFrom = el.querySelector('#trFrom').value, trTo = el.querySelector('#trTo').value;
      if (!trFrom || !trTo || trTo <= trFrom) { alert('Confira o horário do treino.'); return; }
      Object.assign(routine, { free, notes, busy, training: { ...routine.training, from: trFrom, to: trTo } });
      await setSetting('routine', clone(routine));
      flash(el.querySelector('#saveRot'));
    }
  };
}

// ============================================================
//  Regras de estudo e média
// ============================================================
function estudo(el) {
  const r = clone(getSetting('study_rules'));
  const num = (name, v, min, max, step = 1) => `<input class="input w-sm" type="number" name="${name}" value="${v}" min="${min}" max="${max}" step="${step}" required>`;
  const U = [['urgente', '🔴 Urgente'], ['medio', '🟡 Mais ou menos'], ['gg', '🟢 GG']];
  el.innerHTML = `
    <form class="card" id="rules">
      <div class="card-h"><h2>Regras do estudo automático</h2></div>
      <p class="small muted" style="margin-top:0">Valem para as provas novas. Para uma prova que já existe, abra ela e use “Recriar blocos”.</p>
      <div class="rule-grid">
        <span></span><b class="small">Horas por dia</b><b class="small">Dias antes (difícil)</b>
        ${U.map(([k, l]) => `<span>${l}</span>${num(`h_${k}`, r.hours[k], 0.5, 8, 0.5)}${num(`d_${k}`, r.daysHard[k], 1, 10)}`).join('')}
      </div>
      <div class="kv"><span>Dias antes, nas outras matérias</span>${num('daysNormal', r.daysNormal, 1, 10)}</div>
      <div class="kv"><span>Menos dias que isso = prova surpresa (4h no que der)</span>${num('minDays', r.minDays, 1, 5)}</div>
      <div class="kv"><span>Máximo de horas seguidas (depois, pausa de 30 min)</span>${num('blockMax', r.blockMax, 0.5, 6, 0.5)}</div>
      <div class="row-btns" style="margin-top:14px"><button class="btn">Salvar</button>${resetBtn()}</div>
    </form>
    <form class="card" id="media">
      <div class="card-h"><h2>Regra da média</h2></div>
      <div class="kv"><span>Para passar, preciso de (%)</span><input class="input w-sm" type="number" name="pass" min="1" max="100" value="${getSetting('pass_pct')}" required></div>
      <p class="small muted">Nas notas: branco = acima da média, cinza = perto (até 5% abaixo), vermelho = abaixo.</p>
      <div class="row-btns"><button class="btn">Salvar</button></div>
    </form>`;
  el.querySelector('#rules').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target), n = k => Number(f.get(k));
    const out = {
      hours: { urgente: n('h_urgente'), medio: n('h_medio'), gg: n('h_gg') },
      daysHard: { urgente: n('d_urgente'), medio: n('d_medio'), gg: n('d_gg') },
      daysNormal: n('daysNormal'), minDays: n('minDays'), blockMax: n('blockMax'),
    };
    await setSetting('study_rules', out);
    flash(e.target.querySelector('.btn:not(.ghost)'));
  };
  el.querySelector('#rules [data-reset]').onclick = async () => {
    if (!confirm('Voltar as regras de estudo para o padrão?')) return;
    await setSetting('study_rules', clone(DEFAULTS.study_rules)); estudo(el);
  };
  el.querySelector('#media').onsubmit = async e => {
    e.preventDefault();
    await setSetting('pass_pct', Number(e.target.pass.value));
    flash(e.target.querySelector('.btn'));
  };
}

// ============================================================
//  Treinos A / B / C
// ============================================================
function treinos(el) {
  const w = clone(getSetting('workouts'));
  let cur = 'A';
  const exRow = (x, i, n) => `
    <div class="cfg-row ex-row" data-key="${esc(x.key)}">
      <input class="input grow" data-f="name" value="${esc(x.name)}" maxlength="60" placeholder="Exercício">
      <input class="input w-sm" type="number" data-f="sets" value="${x.sets ?? ''}" min="1" max="10" placeholder="séries">
      <input class="input w-reps" data-f="reps" value="${esc(x.reps || '')}" maxlength="20" placeholder="reps / tempo">
      <label class="check"><input type="checkbox" data-f="warmup" ${x.warmup ? 'checked' : ''}> aquecimento</label>
      <label class="check"><input type="checkbox" data-f="optional" ${x.optional ? 'checked' : ''}> opcional</label>
      <label class="check"><input type="checkbox" data-f="load" ${x.load ? 'checked' : ''}> carga</label>
      <select class="input w-month" data-f="fromMonth" title="Aparece a partir do mês">
        <option value="">sempre</option>${[2, 3].map(m => `<option value="${m}" ${x.fromMonth === m ? 'selected' : ''}>mês ${m}</option>`).join('')}</select>
      <span class="mv">
        <button type="button" class="icon-btn" data-up ${i === 0 ? 'disabled' : ''} title="Subir">${icon('up')}</button>
        <button type="button" class="icon-btn" data-down ${i === n - 1 ? 'disabled' : ''} title="Descer">${icon('down')}</button>
        <button type="button" class="icon-btn" data-del title="Apagar">${icon('trash')}</button>
      </span>
    </div>`;
  const read = () => {
    const old = Object.fromEntries(w[cur].exercises.map(x => [x.key, x]));
    w[cur].name = val(el, '#wName') || w[cur].name;
    w[cur].place = val(el, '#wPlace');
    w[cur].exercises = [...el.querySelectorAll('.ex-row')].map(r => {
      const x = { ...(old[r.dataset.key] || {}), key: r.dataset.key, name: val(r, '[data-f=name]'), reps: val(r, '[data-f=reps]') };
      const s = val(r, '[data-f=sets]'); if (s) x.sets = Number(s); else delete x.sets;
      for (const f of ['warmup', 'optional', 'load']) { if (chk(r, `[data-f=${f}]`)) x[f] = true; else delete x[f]; }
      const fm = r.querySelector('[data-f=fromMonth]').value; if (fm) x.fromMonth = Number(fm); else delete x.fromMonth;
      return x;
    });
  };
  const draw = () => {
    const ex = w[cur].exercises;
    el.innerHTML = `
      <div class="card">
        <div class="card-h"><h2>Treinos</h2></div>
        <div class="seg" id="wTabs">${Object.keys(w).map(k => `<button data-w="${k}" class="${k === cur ? 'on' : ''}">Treino ${k}</button>`).join('')}</div>
        <div class="two">
          <label class="lbl">Nome<input class="input" id="wName" value="${esc(w[cur].name)}" maxlength="40"></label>
          <label class="lbl">Onde<input class="input" id="wPlace" value="${esc(w[cur].place || '')}" maxlength="40"></label>
        </div>
        <div id="exs" style="margin-top:8px">${ex.map((x, i) => exRow(x, i, ex.length)).join('')}</div>
        <button type="button" class="linkbtn" id="addEx" style="margin-top:10px">+ Adicionar exercício</button>
        <p class="small muted">As trocas (ex: chuva → cardio em casa) continuam valendo nos exercícios que já existiam. A sequência A → B → C e os treinos já feitos não mudam.</p>
        <div class="row-btns" style="margin-top:6px"><button class="btn" id="save">Salvar treinos</button>${resetBtn('Voltar ao padrão')}</div>
      </div>
      <form class="card" id="prog">
        <div class="card-h"><h2>Programa de 3 meses</h2></div>
        <div class="kv"><span>Começou em</span><input class="input w-date" type="date" name="start" value="${getSetting('program_start')}" required></div>
        <div class="row-btns" style="margin-top:8px"><button class="btn">Salvar</button></div>
      </form>`;
  };
  draw();
  el.onclick = async e => {
    const t = e.target.closest('[data-w]');
    if (t) { read(); cur = t.dataset.w; draw(); return; }
    if (e.target.closest('#addEx')) { read(); w[cur].exercises.push({ key: newKey(cur.toLowerCase()), name: '', sets: 2, reps: '10' }); draw(); el.querySelector('.ex-row:last-child [data-f=name]').focus(); return; }
    const row = e.target.closest('.ex-row');
    if (row && e.target.closest('[data-del], [data-up], [data-down]')) {
      read();
      const list = w[cur].exercises, i = list.findIndex(x => x.key === row.dataset.key);
      if (e.target.closest('[data-del]')) list.splice(i, 1);
      else { const j = e.target.closest('[data-up]') ? i - 1 : i + 1; [list[i], list[j]] = [list[j], list[i]]; }
      draw(); return;
    }
    if (e.target.closest('#save')) {
      read();
      if (Object.values(w).some(x => x.exercises.some(ex => !ex.name))) { alert('Todo exercício precisa de um nome.'); return; }
      await setSetting('workouts', clone(w));
      flash(el.querySelector('#save'));
      return;
    }
    if (e.target.closest('[data-reset]') && confirm(`Voltar o Treino ${cur} para o padrão?`)) {
      w[cur] = clone(DEFAULTS.workouts[cur]); await setSetting('workouts', clone(w)); draw();
    }
  };
  el.addEventListener('submit', async e => {
    if (e.target.id !== 'prog') return;
    e.preventDefault();
    await setSetting('program_start', e.target.start.value);
    flash(e.target.querySelector('.btn'));
  });
}

// ============================================================
//  Hábitos
// ============================================================
function habitos(el) {
  let hs = clone(getSetting('habits')), rs = clone(getSetting('rotina'));
  const hRow = h => `
    <div class="cfg-row h-row" data-key="${esc(h.key)}">
      <label class="check" title="Mostrar no Início"><input type="checkbox" data-f="on" ${h.enabled !== false ? 'checked' : ''}></label>
      <button type="button" class="ic-pick" data-f="icon" data-v="${esc(h.icon || 'star')}" title="Trocar ícone (toque para mudar)">${icon(h.icon || 'star')}</button>
      <input class="input grow" data-f="name" value="${esc(h.name)}" maxlength="30" placeholder="Nome">
      ${h.auto ? '<span class="small muted">marca sozinho pela Academia</span>' : `
        <label class="lbl-in">meta/dia<input class="input w-sm" type="number" data-f="target" min="1" max="50" value="${h.target || 1}"></label>
        <input class="input w-unit" data-f="unit" value="${esc(h.unit || '')}" maxlength="12" placeholder="unidade">
        <button type="button" class="icon-btn" data-del title="Apagar">${icon('trash')}</button>`}
    </div>`;
  const rRow = r => `
    <div class="cfg-row r-row" data-key="${esc(r.key)}">
      <label class="check" title="Mostrar no Início"><input type="checkbox" data-f="on" ${r.enabled !== false ? 'checked' : ''}></label>
      <input class="input grow" data-f="name" value="${esc(r.name)}" maxlength="50" placeholder="Nome">
      <label class="check"><input type="checkbox" data-f="optional" ${r.optional ? 'checked' : ''}> opcional</label>
      <button type="button" class="icon-btn" data-del title="Apagar">${icon('trash')}</button>
    </div>`;
  const read = () => {
    const oldH = Object.fromEntries(hs.map(h => [h.key, h]));
    hs = [...el.querySelectorAll('.h-row')].map(r => {
      const h = { ...(oldH[r.dataset.key] || {}), key: r.dataset.key, name: val(r, '[data-f=name]'), icon: r.querySelector('[data-f=icon]').dataset.v, enabled: chk(r, '[data-f=on]') };
      if (!h.auto) {
        const t = Number(val(r, '[data-f=target]')) || 1;
        if (t > 1) { h.target = t; h.unit = val(r, '[data-f=unit]'); } else { delete h.target; delete h.unit; }
      }
      return h;
    });
    rs = [...el.querySelectorAll('.r-row')].map(r => ({
      key: r.dataset.key, name: val(r, '[data-f=name]'), optional: chk(r, '[data-f=optional]'), enabled: chk(r, '[data-f=on]'),
    }));
  };
  const draw = () => {
    el.innerHTML = `
      <div class="card">
        <div class="card-h"><h2>Hábitos (anéis do Início)</h2></div>
        <p class="small muted" style="margin-top:0">Desmarque para esconder. Toque no ícone para trocar. “Meta/dia” maior que 1 vira contador (ex: 8 copos de água). Descanso não conta como falha no Treinar.</p>
        <div id="hs">${hs.map(hRow).join('')}</div>
        <button type="button" class="linkbtn" id="addH" style="margin-top:10px">+ Adicionar hábito</button>
      </div>
      <div class="card">
        <div class="card-h"><h2>Rotina</h2></div>
        <p class="small muted" style="margin-top:0">Checklist do dia. A sequência conta os dias em que você fez todos os itens que não são opcionais.</p>
        <div id="rs">${rs.map(rRow).join('')}</div>
        <button type="button" class="linkbtn" id="addR" style="margin-top:10px">+ Adicionar item</button>
      </div>
      <div class="row-btns"><button class="btn" id="save">Salvar hábitos</button>${resetBtn()}</div>`;
  };
  draw();
  el.onclick = async e => {
    const ic = e.target.closest('.ic-pick');
    if (ic) {
      const next = HABIT_ICONS[(HABIT_ICONS.indexOf(ic.dataset.v) + 1) % HABIT_ICONS.length];
      ic.dataset.v = next; ic.innerHTML = icon(next);
      return;
    }
    if (e.target.closest('#addH')) { read(); hs.push({ key: newKey('h'), name: '', icon: 'star' }); draw(); el.querySelector('.h-row:last-child [data-f=name]').focus(); return; }
    if (e.target.closest('#addR')) { read(); rs.push({ key: newKey('r'), name: '' }); draw(); el.querySelector('.r-row:last-child [data-f=name]').focus(); return; }
    if (e.target.closest('[data-del]')) {
      const r = e.target.closest('.cfg-row');
      if (confirm(`Apagar "${val(r, '[data-f=name]') || 'este item'}"? O histórico dele some do Início.`)) { r.remove(); }
      return;
    }
    if (e.target.closest('#save')) {
      read();
      if ([...hs, ...rs].some(x => !x.name)) { alert('Todo hábito precisa de um nome.'); return; }
      await setSetting('habits', clone(hs)); await setSetting('rotina', clone(rs));
      flash(el.querySelector('#save'));
      return;
    }
    if (e.target.closest('[data-reset]') && confirm('Voltar os hábitos para o padrão?')) {
      hs = clone(DEFAULTS.habits); rs = clone(DEFAULTS.rotina);
      await setSetting('habits', clone(hs)); await setSetting('rotina', clone(rs)); draw();
    }
  };
}

// ============================================================
//  Backup e dados
// ============================================================
async function backup(el, ctx) {
  const cloud = db.isCloud();
  el.innerHTML = `
    <div class="card">
      <div class="card-h"><h2>Exportar (fazer backup)</h2></div>
      <p class="small muted" style="margin-top:0">Baixa <b>um arquivo</b> com tudo: tarefas, provas, estudo, notas, hábitos, treinos, cargas, medidas, metas, sonhos e configurações.
        ${cloud ? 'Os arquivos em si (PDFs, vídeos e fotos) continuam guardados na nuvem; o backup leva a lista deles.' : ''}</p>
      <button class="btn" id="export">${icon('file')} Baixar backup</button>
    </div>
    <div class="card">
      <div class="card-h"><h2>Importar (voltar um backup)</h2></div>
      <p class="small muted" style="margin-top:0">Troca <b>todos</b> os dados atuais pelos do arquivo. Dica: baixe um backup antes, por segurança.</p>
      <input type="file" id="importFile" accept=".json,application/json" hidden>
      <button class="btn ghost" id="import">Escolher arquivo de backup…</button>
      <div class="msg small" id="impMsg"></div>
    </div>
    ${cloud ? `<div class="card">
      <div class="card-h"><h2>Espaço dos arquivos</h2></div>
      <div id="usage" class="small muted">Calculando…</div>
    </div>` : ''}
    <div class="card danger-card">
      <div class="card-h"><h2>Apagar dados</h2></div>
      <p class="small muted" style="margin-top:0">Apaga tudo do app${cloud ? ' (inclusive PDFs, vídeos e fotos)' : ''} e começa do zero. Sua conta e seu nome continuam. <b>Não dá pra desfazer.</b></p>
      <button class="btn danger" id="wipe">${icon('trash')} Apagar todos os dados</button>
    </div>`;

  el.querySelector('#export').onclick = async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const tables = {};
      for (const t of TABLES) {
        try { tables[t] = (await db.list(t)).map(({ user_id, ...r }) => r); } catch { tables[t] = []; }
      }
      const data = { app: 'kai-planner', version: 1, exported_at: new Date().toISOString(), tables };
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `kai-planner-backup-${todayISO()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      flash(btn, 'Baixado ✓');
    } catch (err) { alert('Não consegui fazer o backup: ' + err.message); btn.disabled = false; }
  };

  const file = el.querySelector('#importFile');
  el.querySelector('#import').onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files[0]; file.value = '';
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch { alert('Esse arquivo não é um backup válido.'); return; }
    if (data?.app !== 'kai-planner' || typeof data.tables !== 'object') { alert('Esse arquivo não é um backup do KAI Planner.'); return; }
    const count = t => (data.tables[t] || []).length;
    const when = data.exported_at ? new Date(data.exported_at).toLocaleString('pt-BR') : '?';
    openDialog({
      title: 'Voltar este backup?',
      body: `<p class="muted" style="margin:0">Backup de <b>${esc(when)}</b>:</p>
        <div class="small">${count('tasks')} tarefas · ${count('events')} provas/compromissos/blocos · ${count('grades')} notas ·
          ${count('workout_logs')} treinos · ${count('habit_logs')} registros de hábitos · ${count('goals')} metas</div>
        <p class="small" style="margin:0"><b>Todos os dados atuais serão trocados por estes.</b></p>`,
      submitLabel: 'Sim, trocar tudo',
      onSubmit: async () => {
        const msg = el.querySelector('#impMsg');
        msg.textContent = 'Voltando o backup… não feche o app.';
        try {
          for (const t of [...TABLES].reverse()) { try { await db.clearTable(t); } catch { /* tabela ainda não existe */ } }
          for (const t of TABLES) {
            let rows = (data.tables[t] || []).map(({ user_id, ...r }) => r);
            if (t === 'events') rows = [...rows.filter(r => !r.parent_id), ...rows.filter(r => r.parent_id)];
            await db.bulkInsert(t, rows);
          }
          await loadSettings(true); applyLook(); await loadTraining();
          msg.className = 'msg ok small'; msg.textContent = 'Backup voltado ✓';
          setTimeout(() => ctx.refreshShell(), 800);
        } catch (err) {
          msg.className = 'msg err small';
          msg.textContent = 'Deu erro no meio: ' + err.message + ' — confira se todos os arquivos faseN.sql foram rodados e tente de novo.';
        }
      },
    });
  };

  el.querySelector('#wipe').onclick = () => {
    const d = openDialog({
      title: 'Apagar todos os dados?',
      body: `<p class="muted" style="margin:0">Isso apaga tudo do app${cloud ? ', inclusive PDFs, vídeos e fotos' : ''}. Não dá pra desfazer.</p>
        <label>Para confirmar, escreva <b>APAGAR</b><input class="input" name="c" autocomplete="off" required></label>`,
      submitLabel: 'Apagar tudo',
      onSubmit: async fd => {
        if (fd.get('c').trim().toUpperCase() !== 'APAGAR') { alert('Escreva APAGAR para confirmar.'); return false; }
        try {
          for (const t of [...TABLES].reverse()) { try { await db.clearTable(t); } catch { /* ok */ } }
          if (cloud) for (const b of BUCKETS) { try { await db.removeFiles(b, (await db.listFiles(b)).map(x => x.path)); } catch { /* ok */ } }
          ['kai:homeView', 'kai:calFilter'].forEach(k => { try { localStorage.removeItem(k); } catch { /* ok */ } });
          await loadSettings(true); applyLook(); await loadTraining();
          location.hash = '#/inicio';
          ctx.refreshShell();
        } catch (err) { alert('Não consegui apagar tudo: ' + err.message); }
      },
    });
    d.querySelector('.btn[type=submit]').classList.add('danger');
  };

  if (cloud) {
    const box = el.querySelector('#usage');
    try {
      const names = { materiais: 'PDFs e materiais', midia: 'Vídeos “como fazer”', sonhos: 'Fotos das metas' };
      let total = 0;
      const lines = [];
      for (const b of BUCKETS) {
        const files = await db.listFiles(b).catch(() => []);
        const size = files.reduce((a, f) => a + f.size, 0);
        total += size;
        lines.push(`<div class="kv"><span>${names[b]}</span><b>${(size / 1048576).toFixed(1)} MB · ${files.length} ${files.length === 1 ? 'arquivo' : 'arquivos'}</b></div>`);
      }
      const p = total / (1024 ** 3);
      box.innerHTML = `${lines.join('')}
        <div class="kv"><span>Total (plano grátis: 1 GB)</span><b>${(total / 1048576).toFixed(1)} MB · ${Math.round(p * 100)}%</b></div>
        <div class="pbar" style="margin-top:6px"><span style="width:${Math.min(100, p * 100).toFixed(1)}%"></span></div>`;
    } catch { box.textContent = 'Não consegui calcular agora.'; }
  }
}
