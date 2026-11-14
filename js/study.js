// ============================================================
//  Estudo automático
//  Ao cadastrar uma prova, cria blocos de estudo nos horários
//  livres, sem cair em cima de aula, compromisso fixo ou treino.
//  Se não couber, NÃO mexe no treino: só mostra o aviso.
// ============================================================
import * as db from './db.js';
import { getSetting, subj, subjName, subjLabel } from './settings.js';
import { openDialog } from './ui.js';
import { esc, todayISO, addDays, diffDays, parseISO, fmtShort, fmtLong } from './util.js';

export const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const toHM = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const dow = d => parseISO(d).getDay();

// Dia de treino previsto (dia sim, dia não a partir do último Treino A).
// Na Fase 3 isso passa a usar os treinos marcados de verdade.
export function isTrainingDay(date) {
  const diff = diffDays(getSetting('training_anchor'), date);
  return ((diff % 2) + 2) % 2 === 0;
}

// Horários livres (em blocos de 30 min) de um dia
export function freeSlots(date, taken = [], fromMin = null) {
  const routine = getSetting('routine');
  const d = dow(date);
  const busy = routine.busy.filter(b => b.days.includes(d)).map(b => [toMin(b.from), toMin(b.to)]);
  if (isTrainingDay(date)) busy.push([toMin(routine.training.from), toMin(routine.training.to)]);
  taken.filter(e => e.date === date && e.start_time && e.end_time)
    .forEach(e => busy.push([toMin(e.start_time), toMin(e.end_time)]));
  const slots = [];
  for (const [a, b] of routine.free[d] || []) {
    for (let t = toMin(a); t + 30 <= toMin(b); t += 30) {
      if (fromMin != null && t < fromMin) continue;
      if (busy.some(([x, y]) => t < y && t + 30 > x)) continue;
      slots.push(t);
    }
  }
  return slots;
}

// Escolhe "need" fatias de 30 min, com pausa depois de "maxRun" fatias seguidas
function pick(slots, need, maxRun) {
  const taken = [];
  let run = 0, prev = null;
  for (const t of slots) {
    if (taken.length >= need) break;
    if (prev === null || t !== prev + 30) run = 0;
    prev = t;
    if (run >= maxRun) { run = 0; continue; } // pausa
    taken.push(t); run++;
  }
  // junta fatias seguidas em blocos
  const blocks = [];
  for (const t of taken) {
    const last = blocks[blocks.length - 1];
    if (last && last[1] === t) last[1] = t + 30;
    else blocks.push([t, t + 30]);
  }
  return { blocks, hours: taken.length / 2 };
}

// Planeja os blocos para uma prova (não salva nada)
export function planExam(exam, existing = [], today = todayISO()) {
  const rules = getSetting('study_rules');
  const s = subj(exam.subject);
  const daysLeft = diffDays(today, exam.date);
  const out = { blocks: [], notes: [], surprise: false };

  let hours = rules.hours[exam.urgency] ?? 3;
  let nDays = s?.hard ? (rules.daysHard[exam.urgency] ?? 3) : rules.daysNormal;
  nDays = Math.max(rules.minDays, nDays);

  let days;
  if (daysLeft < rules.minDays) {
    // Prova surpresa: 4h no dia que sobrar
    out.surprise = true;
    hours = 4;
    days = daysLeft >= 1 ? Array.from({ length: daysLeft }, (_, i) => addDays(today, i)) : [];
    if (!days.length) out.notes.push('A prova é hoje: não sobrou nenhum dia para estudar antes.');
  } else {
    const start = addDays(exam.date, -(nDays + 2)) > today ? addDays(exam.date, -(nDays + 2)) : today;
    const cands = [];
    for (let d = start; d < exam.date; d = addDays(d, 1)) cands.push(d);
    // Preferência: dias de descanso, tardes livres (sex/sáb/dom) e a véspera
    const score = d => (isTrainingDay(d) ? 0 : 2) + ([0, 5, 6].includes(dow(d)) ? 1 : 0)
      + (d === addDays(exam.date, -1) ? 1 : 0) - diffDays(d, exam.date) * 0.1;
    days = [...cands].sort((a, b) => score(b) - score(a)).slice(0, nDays).sort();
    if (days.length < nDays) out.notes.push(`Só deu para usar ${days.length} de ${nDays} dias antes da prova.`);
  }

  const now = new Date();
  const nowMin = Math.ceil((now.getHours() * 60 + now.getMinutes() + 15) / 30) * 30;
  for (const d of days) {
    const slots = freeSlots(d, [...existing, ...out.blocks], d === today ? nowMin : null);
    const { blocks, hours: got } = pick(slots, hours * 2, rules.blockMax * 2);
    blocks.forEach(([a, b]) => out.blocks.push({ date: d, start_time: toHM(a), end_time: toHM(b) }));
    if (got < hours) {
      const falta = hours - got;
      out.notes.push(`Faltaram ${String(falta).replace('.', ',')}h em ${fmtShort(d)}: horário cheio${isTrainingDay(d) ? ' (o treino foi mantido)' : ''}.`);
    }
  }
  return out;
}

// Cria os blocos de uma prova e salva os avisos nela
export async function createExamBlocks(exam) {
  const today = todayISO();
  if (exam.kind !== 'prova' || exam.date < today) return { blocks: [], notes: [] };
  const existing = await db.list('events', { eq: { kind: 'estudo' }, gte: { date: today }, lte: { date: exam.date } });
  const plan = planExam(exam, existing.filter(b => b.parent_id !== exam.id), today);
  for (const b of plan.blocks) {
    await db.insert('events', {
      title: `Estudar ${subjName(exam.subject)}`, kind: 'estudo', date: b.date,
      start_time: b.start_time, end_time: b.end_time, subject: exam.subject, lab: !!exam.lab,
      parent_id: exam.id, done: false,
    });
  }
  await db.update('events', exam.id, { plan_note: plan.notes.join('\n') || null, surprise: plan.surprise });
  return plan;
}

// Apaga os blocos ainda não feitos (de hoje em diante) e cria de novo
export async function replanExam(exam) {
  const today = todayISO();
  const blocks = await db.list('events', { eq: { parent_id: exam.id } });
  for (const b of blocks) if (!b.done && b.date >= today) await db.remove('events', b.id);
  return createExamBlocks(exam);
}

// Apaga uma prova/trabalho com tudo que está ligado a ela
export async function deleteEventCascade(ev) {
  const [blocks, mats] = await Promise.all([
    db.list('events', { eq: { parent_id: ev.id } }),
    db.list('materials', { eq: { event_id: ev.id } }).catch(() => []),
  ]);
  for (const m of mats) { await db.removeFile('materiais', m.path); await db.remove('materials', m.id); }
  for (const b of blocks) await db.remove('events', b.id);
  await db.remove('events', ev.id);
}

// Abre um material (PDF) numa aba nova
export async function openMaterial(m) {
  const w = window.open('', '_blank');
  try {
    const url = await db.fileUrl('materiais', m.path);
    if (w) w.location = url; else location.href = url;
  } catch (e) {
    w?.close();
    alert('Não consegui abrir o arquivo: ' + e.message);
  }
}

// Janela de um bloco de estudo: mostra o que vai cair e os PDFs
export async function openStudyBlock(block, onChange) {
  const [parents, mats] = await Promise.all([
    block.parent_id ? db.list('events', { eq: { id: block.parent_id } }) : [],
    block.parent_id ? db.list('materials', { eq: { event_id: block.parent_id } }).catch(() => []) : [],
  ]);
  const p = parents[0];
  const topics = p?.topics || [];
  const d = openDialog({
    title: `${block.done ? '✓ ' : ''}${esc(block.title)}`,
    body: `
      <p class="muted" style="margin:0">${fmtLong(block.date)} · ${block.start_time}–${block.end_time}</p>
      ${p ? `<div class="box"><div class="small muted">Para a prova</div>
        <div>${subjLabel(p.subject, p.lab)} · ${esc(p.title)} · ${fmtShort(p.date)}</div></div>` : ''}
      ${p?.content ? `<div><div class="small muted">O que vai cair</div><div class="pre">${esc(p.content)}</div></div>` : ''}
      ${topics.length ? `<div>${topics.map(t => `<div class="small">${t.done ? '☑' : '☐'} ${esc(t.text)}</div>`).join('')}</div>` : ''}
      ${mats.length ? `<div><div class="small muted">Materiais</div>${mats.map(m =>
        `<button type="button" class="linkbtn" data-mat="${m.id}">📄 ${esc(m.name)}</button>`).join('<br>')}</div>` : ''}
      <div class="row-btns">
        <button type="button" class="btn ghost" data-act="move">Mover</button>
        ${p ? `<a class="btn ghost" href="#/escola/p/${p.id}" data-act="open">Abrir prova</a>` : ''}
      </div>`,
    submitLabel: block.done ? 'Desmarcar feito' : 'Marcar como feito',
    danger: 'Apagar bloco',
    onSubmit: async () => { await db.update('events', block.id, { done: !block.done }); onChange?.(); },
    onDanger: async () => { await db.remove('events', block.id); onChange?.(); },
  });
  d.addEventListener('click', e => {
    const mb = e.target.closest('[data-mat]');
    if (mb) openMaterial(mats.find(m => m.id === mb.dataset.mat));
    if (e.target.closest('[data-act=open]')) d.close();
    if (e.target.closest('[data-act=move]')) { d.close(); moveBlock(block, onChange); }
  });
}

export function moveBlock(block, onChange) {
  openDialog({
    title: 'Mover bloco de estudo',
    body: `
      <label>Dia<input class="input" type="date" name="date" value="${block.date}" required></label>
      <div class="two">
        <label>Começa<input class="input" type="time" name="start" value="${block.start_time}" step="900" required></label>
        <label>Termina<input class="input" type="time" name="end" value="${block.end_time}" step="900" required></label>
      </div>`,
    submitLabel: 'Salvar',
    onSubmit: async fd => {
      if (fd.get('end') <= fd.get('start')) { alert('O fim precisa ser depois do começo.'); return false; }
      await db.update('events', block.id, { date: fd.get('date'), start_time: fd.get('start'), end_time: fd.get('end') });
      onChange?.();
    },
  });
}
