// ============================================================
//  Sequência de treinos
//  A → descanso → B → descanso → C → descanso → A ...
//  - O dia depois de um treino feito é descanso.
//  - Se um dia de treino passar sem treinar, o treino NÃO avança:
//    no dia seguinte continua sendo o mesmo treino.
// ============================================================
import * as db from './db.js';
import { getSetting } from './settings.js';
import { todayISO, addDays, diffDays } from './util.js';

const NEXT = { A: 'B', B: 'C', C: 'A' };
let done = []; // [{date, workout}] treinos concluídos, em ordem

export async function loadTraining() {
  let rows = [];
  try { rows = await db.list('workout_logs', { eq: { done: true }, order: 'date' }); } catch { rows = []; }
  const seed = { date: getSetting('training_anchor'), workout: 'A' };
  const map = new Map([[seed.date, seed]]);
  rows.forEach(r => map.set(r.date, { date: r.date, workout: r.workout }));
  done = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export const doneList = () => done;
const lastBefore = date => { for (let i = done.length - 1; i >= 0; i--) if (done[i].date < date) return done[i]; return null; };

// Plano de hoje em diante: [{date, type:'done'|'train'|'rest', workout}]
export function plan(days = 14) {
  const today = todayISO();
  const out = [];
  let last = lastBefore(today);
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const d = i === 0 ? done.find(x => x.date === today) : null;
    if (d) { out.push({ date, type: 'done', workout: d.workout }); last = d; continue; }
    if (!last) { out.push({ date, type: 'train', workout: 'A' }); last = { date, workout: 'A' }; continue; }
    if (diffDays(last.date, date) === 1) out.push({ date, type: 'rest' });
    else { const w = NEXT[last.workout]; out.push({ date, type: 'train', workout: w }); last = { date, workout: w }; }
  }
  return out;
}

// Situação de um dia qualquer
export function dayStatus(date) {
  const today = todayISO();
  if (date >= today) return plan(diffDays(today, date) + 1).pop();
  const d = done.find(x => x.date === date);
  if (d) return { date, type: 'done', workout: d.workout };
  const prev = lastBefore(date);
  if (!prev) return { date, type: 'none' };
  if (diffDays(prev.date, date) === 1) return { date, type: 'rest' };
  return { date, type: 'missed', workout: NEXT[prev.workout] };
}

export function isTrainingDay(date) {
  const s = dayStatus(date);
  return s.type === 'train' || s.type === 'done';
}

// Sequência: treinos seguidos sem pular nenhum dia de treino
export function streak() {
  if (!done.length) return 0;
  const today = todayISO();
  if (diffDays(done[done.length - 1].date, today) > 2) return 0;
  let n = 1;
  for (let i = done.length - 1; i > 0; i--) {
    if (diffDays(done[i - 1].date, done[i].date) <= 2) n++; else break;
  }
  return n;
}

export function monthCount(ref = todayISO()) {
  return done.filter(d => d.date.slice(0, 7) === ref.slice(0, 7)).length;
}

// Semana do programa de 3 meses
export function programWeek(date = todayISO()) {
  const week = Math.floor(diffDays(getSetting('program_start'), date) / 7) + 1;
  return { week: Math.max(1, week), month: Math.min(3, Math.max(1, Math.ceil(week / 4))), over: week > 12 };
}
