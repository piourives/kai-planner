// ============================================================
//  Tela ACADEMIA
//  Treino de hoje (ou descanso), sequência, semana, checklist,
//  cargas, "ver como fazer", progressão de 3 meses e regras.
// ============================================================
import * as db from '../db.js';
import { icon } from '../icons.js';
import { openDialog } from '../ui.js';
import { esc, todayISO, addDays, parseISO, fmtShort, fmtLong, plural } from '../util.js';
import { getSetting, setSetting } from '../settings.js';
import { PROGRESSION, TRAINING_RULES } from '../data/defaults.js';
import { plan, dayStatus, streak, monthCount, programWeek, loadTraining } from '../training.js';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const fmtN = n => String(n).replace('.', ',');

export async function renderAcademia(main) {
  const today = todayISO();
  const st = plan(1)[0];
  const next = st.type === 'rest' ? plan(4).find(p => p.type === 'train') : null;
  const wk = st.type === 'rest' ? next.workout : st.workout;
  const workouts = getSetting('workouts');
  const W = workouts[wk];
  const sets3 = getSetting('sets3') || {};
  const prog = programWeek();

  const [logRows, loads, bodies, media] = await Promise.all([
    db.list('workout_logs', { eq: { date: today } }),
    db.list('load_logs', { order: 'date', asc: false }),
    db.list('body_logs', { order: 'date', asc: false }),
    db.list('exercise_media').catch(() => []),
  ]);
  const log = logRows[0];
  const finished = st.type === 'done';
  const exercises = W.exercises.filter(e => !e.fromMonth || prog.month >= e.fromMonth);
  // Treino feito sem registro no app (o primeiro, informado na configuração): mostra tudo marcado
  const seedDay = finished && !log;
  const checks = seedDay ? Object.fromEntries(exercises.filter(e => !e.optional).map(e => [e.key, true])) : log?.checks || {};
  const swaps = log?.swaps || {};
  const active = st.type !== 'rest' && !seedDay; // dá pra marcar exercícios hoje
  const required = exercises.filter(e => !e.optional);
  const doneCount = required.filter(e => checks[e.key]).length;
  const setsOf = e => (e.sets ? (sets3[wk] && !e.optional ? 3 : e.sets) : null);
  const nameOf = e => { const i = swaps[e.key] || 0; return i ? e.swaps[i - 1] : e.name; };
  const reload = () => renderAcademia(main);

  // ---------- Topo: hoje ----------
  const hero = finished
    ? `<div class="hero-ic">${icon('check')}</div><div><h2>Treino ${wk} concluído 💪</h2>
        <div class="muted">${W.name} · ${W.place} · amanhã é descanso</div></div>
        ${seedDay ? '' : '<button class="btn ghost" id="undo" style="margin-left:auto">Desfazer</button>'}`
    : active
      ? `<div class="hero-ic">${icon('dumbbell')}</div><div><h2>Hoje: Treino ${wk}</h2>
          <div class="muted">${W.name} · ${W.place} · às 19h ou 20h</div></div>
          <span class="right counter" style="margin-left:auto">${doneCount}/${required.length}</span>`
      : `<div class="hero-ic">${icon('moon')}</div><div><h2>Hoje: Descanso</h2>
          <div class="muted">Próximo: Treino ${wk} (${W.name}) ${next.date === addDays(today, 1) ? 'amanhã' : fmtShort(next.date)}</div></div>`;

  // ---------- Semana ----------
  const dow = parseISO(today).getDay();
  const monday = addDays(today, -((dow + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    const s = dayStatus(d);
    const cls = { done: 'w-done', train: 'w-train', rest: 'w-rest', missed: 'w-miss', none: 'w-none' }[s.type];
    const inner = s.type === 'done' ? icon('check') : s.type === 'rest' ? '–' : s.workout || '';
    return `<div class="wday ${d === today ? 'today' : ''}"><span class="wc ${cls}" title="${s.type === 'missed' ? 'Não treinou' : ''}">${inner}</span>
      <span class="small">${DIAS[parseISO(d).getDay()]}</span></div>`;
  }).join('');

  // ---------- Exercícios ----------
  const exRow = e => {
    const last = loads.find(l => l.exercise_key === e.key);
    const hasMedia = media.some(m => m.exercise_key === e.key);
    const on = !!checks[e.key];
    return `<div class="ex ${on ? 'done' : ''}" data-ex="${e.key}">
      ${active ? `<button class="cb ${on ? 'on' : ''}" data-act="check" aria-label="Marcar">${icon('check')}</button>` : '<span class="ex-dot"></span>'}
      <div class="ex-main">
        <div class="ex-name">${esc(nameOf(e))}${e.optional ? ' <span class="tag">opcional</span>' : ''}${e.warmup ? ' <span class="tag">aquecimento</span>' : ''}</div>
        <div class="ex-sub">${setsOf(e) ? `${setsOf(e)}×${esc(e.reps)}` : esc(e.reps)}
          ${last ? ` · última: ${last.weight != null ? fmtN(last.weight) + ' kg' : ''}${last.reps ? ' ×' + esc(last.reps) : ''}${last.note ? ' ' + esc(last.note) : ''}` : ''}</div>
        <div class="ex-btns">
          <button data-act="how">${icon('next')} ${hasMedia ? 'Ver como fazer' : 'Como fazer'}</button>
          ${e.load ? `<button data-act="load">${icon('trend')} Carga</button>` : ''}
          ${e.swaps && active ? `<button data-act="swap">${icon('back')} Trocar</button>` : ''}
        </div>
      </div>
    </div>`;
  };

  // ---------- Progressão ----------
  const sets3Hint = prog.month === 1
    ? 'Mês 1: fique nas 2 séries e capriche na técnica.'
    : sets3[wk] ? `Treino ${wk} está com 3 séries.` : `Já dá pra fazer 3 séries no Treino ${wk}? Se 2 séries estão fáceis e com boa técnica, ative.`;

  const lastBody = bodies[0];

  main.innerHTML = `
    <div class="page-head"><h1 class="page-title">Academia</h1></div>
    <div class="acad-grid">
      <section class="card hero a-hero">${hero}</section>
      <section class="card a-stats">
        <div class="stat"><span class="muted small">Sequência</span><b>${streak()}</b><span class="small muted">treinos</span></div>
        <div class="stat"><span class="muted small">No mês</span><b>${monthCount()}</b><span class="small muted">treinos</span></div>
      </section>
      <section class="card a-week"><div class="card-h"><h2>Esta semana</h2></div><div class="week">${week}</div></section>

      <section class="card a-ex" id="exCard">
        <div class="card-h"><h2>${active ? 'Exercícios' : `Prévia do Treino ${wk}`}</h2>
          <span class="right small">${W.name} · ${W.place}</span></div>
        ${exercises.map(exRow).join('')}
        ${active && !finished ? '<p class="muted small" style="margin:8px 0 0">Marcou todos (menos os opcionais)? O treino conta como feito sozinho.</p>' : ''}
      </section>

      <section class="card a-prog">
        <div class="card-h"><h2>Progressão</h2><span class="right small">${prog.over ? 'Programa de 3 meses concluído' : `Mês ${prog.month} · Semana ${prog.week}`}</span></div>
        ${PROGRESSION.map(p => `<div class="prog ${p.month === prog.month ? 'on' : ''}"><b>Mês ${p.month}</b> <span class="muted small">sem. ${p.weeks}</span><div class="small">${p.text}</div></div>`).join('')}
        <div class="box small" style="margin-top:10px">${sets3Hint}
          ${prog.month >= 2 ? `<button class="btn ghost" id="sets3" style="margin-top:8px">${sets3[wk] ? 'Voltar para 2 séries' : 'Usar 3 séries'} no Treino ${wk}</button>` : ''}</div>
      </section>

      <section class="card a-rules"><div class="card-h"><h2>Regras</h2></div>
        <ul class="rules">${TRAINING_RULES.map(r => `<li>${r}</li>`).join('')}</ul></section>

      <section class="card a-body">
        <div class="card-h"><h2>Peso e medidas</h2><button class="icon-btn right" id="addBody" aria-label="Registrar">${icon('plus')}</button></div>
        <p class="muted small" style="margin-top:0">Só acompanhamento, sem meta de peso.</p>
        ${lastBody ? `<div class="body-last">
          ${lastBody.weight != null ? `<div><b>${fmtN(lastBody.weight)}</b> <span class="muted small">kg</span></div>` : ''}
          ${lastBody.waist != null ? `<div><b>${fmtN(lastBody.waist)}</b> <span class="muted small">cintura</span></div>` : ''}
          ${lastBody.arm != null ? `<div><b>${fmtN(lastBody.arm)}</b> <span class="muted small">braço</span></div>` : ''}
          ${lastBody.chest != null ? `<div><b>${fmtN(lastBody.chest)}</b> <span class="muted small">peito</span></div>` : ''}
        </div>
        ${bodies.slice(0, 5).map(b => `<div class="small muted body-row" data-body="${b.id}">${fmtShort(b.date)} · ${[b.weight != null ? fmtN(b.weight) + ' kg' : '', b.waist != null ? 'cintura ' + fmtN(b.waist) : '', b.arm != null ? 'braço ' + fmtN(b.arm) : '', b.chest != null ? 'peito ' + fmtN(b.chest) : ''].filter(Boolean).join(' · ')}</div>`).join('')}`
        : '<div class="empty">Nenhum registro ainda.</div>'}
      </section>
    </div>`;

  // ---------- Ações ----------
  const saveLog = async patch => {
    const row = { date: today, workout: wk, checks, swaps, done: !!log?.done, ...patch };
    await db.upsert('workout_logs', row, ['date']);
    if (row.done !== !!log?.done) await loadTraining();
  };

  main.querySelector('#exCard').addEventListener('click', async e => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const key = btn.closest('[data-ex]').dataset.ex;
    const ex = exercises.find(x => x.key === key);
    const act = btn.dataset.act;
    if (act === 'check') {
      const nc = { ...checks, [key]: !checks[key] };
      const all = required.every(x => nc[x.key]);
      await saveLog({ checks: nc, done: all });
      reload();
    }
    if (act === 'swap') {
      const i = ((swaps[key] || 0) + 1) % (ex.swaps.length + 1);
      await saveLog({ swaps: { ...swaps, [key]: i } });
      reload();
    }
    if (act === 'load') loadDialog(ex, nameOf(ex), setsOf(ex), loads, reload);
    if (act === 'how') mediaDialog(ex, nameOf(ex), media.find(m => m.exercise_key === key), reload);
  });

  const undo = main.querySelector('#undo');
  if (undo) undo.onclick = async () => {
    if (!confirm('Desfazer o treino de hoje? Os checks serão apagados.')) return;
    await saveLog({ checks: {}, done: false });
    reload();
  };
  const s3 = main.querySelector('#sets3');
  if (s3) s3.onclick = async () => { await setSetting('sets3', { ...sets3, [wk]: !sets3[wk] }); reload(); };
  main.querySelector('#addBody').onclick = () => bodyDialog(null, reload);
  main.querySelectorAll('[data-body]').forEach(r => r.onclick = () => bodyDialog(bodies.find(b => b.id === r.dataset.body), reload));
}

// ---------- Registrar carga ----------
function loadDialog(ex, name, sets, loads, reload) {
  const hist = loads.filter(l => l.exercise_key === ex.key).slice(0, 6);
  const last = hist[0];
  openDialog({
    title: esc(name),
    body: `
      <div class="three">
        <label>Peso (kg)<input class="input" type="number" name="weight" step="0.5" min="0" value="${last?.weight ?? ''}" placeholder="—"></label>
        <label>Repetições<input class="input" name="reps" maxlength="20" value="${esc(last?.reps ?? ex.reps.replace(/ .*/, ''))}"></label>
        <label>Séries<input class="input" type="number" name="sets" min="1" max="10" value="${last?.sets ?? sets ?? 2}"></label>
      </div>
      <label>Observação<input class="input" name="note" maxlength="60" value="${esc(last?.note ?? '')}" placeholder="Ex: elástico verde, fácil, difícil…"></label>
      ${hist.length ? `<div class="small muted">Histórico:<br>${hist.map(l => `${fmtShort(l.date)} · ${l.weight != null ? fmtN(l.weight) + ' kg' : ''} ${l.sets ? l.sets + '×' : ''}${esc(l.reps || '')} ${esc(l.note || '')}`).join('<br>')}</div>` : ''}`,
    submitLabel: 'Registrar',
    onSubmit: async fd => {
      await db.insert('load_logs', {
        date: todayISO(), exercise_key: ex.key,
        weight: fd.get('weight') === '' ? null : Number(fd.get('weight')),
        reps: fd.get('reps').trim() || null, sets: Number(fd.get('sets')) || null, note: fd.get('note').trim() || null,
      });
      reload();
    },
  });
}

// ---------- Ver como fazer (vídeo ou imagem) ----------
async function mediaDialog(ex, name, m, reload) {
  if (!db.isCloud()) {
    openDialog({ title: esc(name), body: '<p class="muted">Enviar vídeos precisa do Supabase (não funciona no modo local).</p>', submitLabel: '' });
    return;
  }
  let viewer = '';
  if (m) {
    try {
      const url = await db.fileUrl('midia', m.path);
      viewer = m.mime?.startsWith('video')
        ? `<video src="${url}" autoplay loop muted playsinline controls class="media"></video>`
        : `<img src="${url}" alt="Como fazer: ${esc(name)}" class="media">`;
    } catch (e) { viewer = `<p class="muted">Não consegui abrir: ${esc(e.message)}</p>`; }
  }
  const d = openDialog({
    title: esc(name),
    body: `${viewer || '<p class="muted" style="margin:0">Ainda não tem vídeo. Envie um vídeo curto (5–15 s) ou uma imagem/GIF mostrando o movimento.</p>'}
      <label class="btn ghost upl">${icon('file')} ${m ? 'Trocar arquivo' : 'Enviar vídeo ou imagem'}
        <input type="file" accept="video/mp4,video/webm,video/quicktime,image/gif,image/png,image/jpeg,image/webp" hidden></label>
      <p class="muted small" style="margin:0">Até 15 MB recomendado (máx. 50 MB). O plano grátis tem 1 GB no total.</p>
      <div class="small" data-msg></div>`,
    submitLabel: '',
    danger: m ? 'Apagar vídeo' : null,
    onDanger: async () => { await db.removeFile('midia', m.path); await db.remove('exercise_media', m.id); reload(); },
  });
  d.querySelector('input[type=file]').onchange = async e => {
    const f = e.target.files[0]; const msg = d.querySelector('[data-msg]');
    if (!f) return;
    if (!/^(video|image)\//.test(f.type)) { msg.textContent = 'Só vídeo ou imagem.'; return; }
    const mb = f.size / 1048576;
    if (mb > 50) { msg.textContent = `Arquivo de ${mb.toFixed(0)} MB: passa do limite de 50 MB. Corte o vídeo para poucos segundos.`; return; }
    if (mb > 15 && !confirm(`Esse arquivo tem ${mb.toFixed(1)} MB. Vídeos curtos (5–15 s) economizam espaço. Enviar mesmo assim?`)) return;
    msg.textContent = 'Enviando…';
    try {
      const safe = f.name.normalize('NFD').replace(/[^\w.\-]+/g, '_').slice(-60);
      const path = await db.uploadFile('midia', `${ex.key}/${Date.now()}-${safe}`, f);
      if (m) { await db.removeFile('midia', m.path); await db.remove('exercise_media', m.id); }
      await db.insert('exercise_media', { exercise_key: ex.key, path, mime: f.type, size: f.size });
      d.close(); reload();
    } catch (err) { msg.textContent = 'Não deu para enviar: ' + err.message; }
  };
}

// ---------- Peso e medidas ----------
function bodyDialog(b, reload) {
  const v = k => (b?.[k] ?? '');
  openDialog({
    title: b ? 'Editar registro' : 'Registrar peso e medidas',
    body: `
      <label>Data<input class="input" type="date" name="date" value="${b?.date || todayISO()}" required></label>
      <div class="two">
        <label>Peso (kg)<input class="input" type="number" step="0.1" name="weight" value="${v('weight')}"></label>
        <label>Cintura (cm)<input class="input" type="number" step="0.5" name="waist" value="${v('waist')}"></label>
        <label>Braço (cm)<input class="input" type="number" step="0.5" name="arm" value="${v('arm')}"></label>
        <label>Peito (cm)<input class="input" type="number" step="0.5" name="chest" value="${v('chest')}"></label>
      </div>
      <p class="muted small" style="margin:0">Preencha só o que quiser.</p>`,
    submitLabel: 'Salvar',
    danger: b ? 'Apagar' : null,
    onDanger: async () => { await db.remove('body_logs', b.id); reload(); },
    onSubmit: async fd => {
      const num = k => (fd.get(k) === '' ? null : Number(fd.get(k)));
      const row = { date: fd.get('date'), weight: num('weight'), waist: num('waist'), arm: num('arm'), chest: num('chest') };
      if (b) await db.update('body_logs', b.id, row); else await db.insert('body_logs', row);
      reload();
    },
  });
}
