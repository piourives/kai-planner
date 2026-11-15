// ============================================================
//  Conquistas (medalhas)
//  São calculadas a partir dos seus dados (treinos, estudo,
//  hábitos, notas, tarefas, metas). Nada é marcado à mão.
//  "ach_seen" guarda quais você já viu, para mostrar as novas.
// ============================================================
import * as db from './db.js';
import { getSetting, setSetting } from './settings.js';
import { doneList, programWeek } from './training.js';
import { diffDays, addDays, todayISO } from './util.js';

const safe = p => p.catch(() => []);

// Maior sequência de dias seguidos num conjunto de datas
export function bestRun(dates) {
  const list = [...new Set(dates)].sort();
  let best = 0, run = 0;
  list.forEach((d, i) => { run = i && diffDays(list[i - 1], d) === 1 ? run + 1 : 1; best = Math.max(best, run); });
  return best;
}
function bestTrainStreak() {
  const l = doneList();
  let best = 0, run = 0;
  l.forEach((x, i) => { run = i && diffDays(l[i - 1].date, x.date) <= 2 ? run + 1 : 1; best = Math.max(best, run); });
  return best;
}
const hours = b => {
  if (!b.start_time || !b.end_time) return 0;
  const m = t => { const [h, mm] = t.split(':').map(Number); return h * 60 + mm; };
  return Math.max(0, m(b.end_time) - m(b.start_time)) / 60;
};

export async function loadData() {
  const [tasks, habits, grades, study, goals, items, loads] = await Promise.all([
    safe(db.list('tasks', { eq: { done: true } })),
    safe(db.list('habit_logs')),
    safe(db.list('grades')),
    safe(db.list('events', { eq: { kind: 'estudo', done: true } })),
    safe(db.list('goals')),
    safe(db.list('goal_items')),
    safe(db.list('load_logs')),
  ]);
  return { tasks, habits, grades, study, goals, items, loads };
}

// Lista de todas as medalhas, com progresso
export function compute(d) {
  const pass = getSetting('pass_pct');
  const treinos = doneList().length, seq = bestTrainStreak(), pw = programWeek();
  const acima = d.grades.filter(g => g.score != null && g.max > 0 && g.score / g.max * 100 >= (g.pass_pct || pass)).length;
  const bySubj = {};
  d.grades.filter(g => g.score != null && g.max > 0).forEach(g => {
    bySubj[g.subject] ??= { s: 0, m: 0 }; bySubj[g.subject].s += +g.score; bySubj[g.subject].m += +g.max;
  });
  const subs = Object.values(bySubj);
  const todasAcima = subs.length >= 3 && subs.every(v => v.s / v.m * 100 >= pass);
  const horasEstudo = d.study.reduce((a, b) => a + hours(b), 0);
  const daysOf = (key, min = 1) => d.habits.filter(l => l.habit_key === key && l.value >= min).map(l => l.date);

  const list = [];
  const add = (id, cat, icon, title, desc, cur, target) =>
    list.push({ id, cat, icon, title, desc, cur: Math.min(cur, target), target, done: cur >= target });

  // Academia
  add('t1', 'Academia', 'dumbbell', 'Primeiro passo', 'Fazer o primeiro treino', treinos, 1);
  add('t10', 'Academia', 'dumbbell', 'Pegando o ritmo', '10 treinos feitos', treinos, 10);
  add('t25', 'Academia', 'dumbbell', 'Constância', '25 treinos feitos', treinos, 25);
  add('t50', 'Academia', 'dumbbell', 'Máquina', '50 treinos feitos', treinos, 50);
  add('t100', 'Academia', 'dumbbell', 'Lenda da academia', '100 treinos feitos', treinos, 100);
  add('s5', 'Academia', 'flame', 'Sem pular', '5 treinos seguidos sem pular nenhum', seq, 5);
  add('s10', 'Academia', 'flame', 'Imparável', '10 treinos seguidos sem pular nenhum', seq, 10);
  add('load', 'Academia', 'trend', 'Medindo a força', 'Registrar a primeira carga', d.loads.length, 1);
  add('p1', 'Academia', 'calendar', 'Primeiro mês', 'Completar 1 mês do programa', Math.max(0, pw.week - 1), 4);
  add('p3', 'Academia', 'star', 'Programa completo', 'Completar os 3 meses do programa', Math.max(0, pw.week - 1), 12);
  // Escola
  add('g1', 'Escola', 'school', 'Acima da média', 'Primeira nota acima da média', acima, 1);
  add('g5', 'Escola', 'school', 'Bom aluno', '5 notas acima da média', acima, 5);
  add('gall', 'Escola', 'star', 'Tudo verde', 'Todas as matérias acima da média (mín. 3 com nota)', todasAcima ? 1 : 0, 1);
  add('b10', 'Escola', 'file', 'Estudioso', '10 horas de estudo em blocos feitos', Math.floor(horasEstudo), 10);
  add('b50', 'Escola', 'file', 'Cérebro turbinado', '50 horas de estudo em blocos feitos', Math.floor(horasEstudo), 50);
  // Hábitos
  for (const h of getSetting('habits').filter(h => !h.auto && h.enabled !== false)) {
    const run = bestRun(daysOf(h.key, h.target > 1 ? h.target : 1));
    add(`h7_${h.key}`, 'Hábitos', h.icon || 'star', `${h.name}: 7 dias`, `7 dias seguidos de ${h.name}`, run, 7);
    add(`h30_${h.key}`, 'Hábitos', h.icon || 'star', `${h.name}: 30 dias`, `30 dias seguidos de ${h.name}`, run, 30);
  }
  const obrig = getSetting('rotina').filter(r => !r.optional && r.enabled !== false);
  if (obrig.length) {
    const sets = obrig.map(r => new Set(daysOf(r.key)));
    const rot = bestRun([...sets[0]].filter(x => sets.every(s => s.has(x))));
    add('r7', 'Hábitos', 'sparkle', 'Rotina em dia', '7 dias seguidos com a rotina completa', rot, 7);
    add('r30', 'Hábitos', 'sparkle', 'Disciplina total', '30 dias seguidos com a rotina completa', rot, 30);
  }
  add('task10', 'Hábitos', 'check', 'Fazedor', '10 tarefas feitas', d.tasks.length, 10);
  add('task100', 'Hábitos', 'check', 'Nada fica pra trás', '100 tarefas feitas', d.tasks.length, 100);
  // Futuro
  add('end', 'Futuro', 'flag', 'Destino marcado', 'Escolher a data final da contagem de 3 anos', getSetting('future_end') ? 1 : 0, 1);
  add('m1', 'Futuro', 'flag', 'Primeiro marco', 'Completar um marco de alguma meta', d.items.filter(i => i.kind === 'marco' && i.done).length, 1);
  add('pic', 'Futuro', 'image', 'Sonhador', 'Colocar 5 fotos no mapa dos sonhos',
    d.items.filter(i => i.image_path).length + d.goals.filter(g => g.image_path).length, 5);
  add('goal', 'Futuro', 'star', 'Conquista desbloqueada', 'Conquistar uma meta ou sonho', d.goals.filter(g => g.done).length, 1);
  return list;
}

export async function getAll() { return compute(await loadData()); }

// Medalhas novas desde a última vez (e já marca como vistas).
// key: 'ach_seen' = vistas na tela Conquistas · 'ach_told' = já comemoradas no Início
export async function checkNew(list, key = 'ach_seen') {
  list ||= await getAll();
  const seen = new Set(getSetting(key) || []);
  const fresh = list.filter(a => a.done && !seen.has(a.id));
  if (fresh.length) await setSetting(key, [...seen, ...fresh.map(a => a.id)]).catch(() => {});
  return fresh;
}

// Estatísticas de uma semana (para o Resumo)
export function weekStats(d, from = addDays(todayISO(), -6), to = todayISO()) {
  const inW = x => x && x >= from && x <= to;
  const treinos = doneList().filter(t => inW(t.date));
  const blocos = d.study.filter(b => inW(b.date));
  const tarefas = d.tasks.filter(t => inW(t.date));
  const logs = d.habits.filter(l => inW(l.date));
  const agua = logs.filter(l => l.habit_key === 'agua').reduce((a, l) => a + (l.value || 0), 0);
  const obrig = getSetting('rotina').filter(r => !r.optional && r.enabled !== false).map(r => r.key);
  const dias = [];
  for (let x = from; x <= to; x = addDays(x, 1)) dias.push(x);
  const rotina = obrig.length ? dias.filter(x => obrig.every(k => logs.some(l => l.habit_key === k && l.date === x && l.value >= 1))).length : 0;
  const habCount = {};
  logs.filter(l => l.value >= 1).forEach(l => { habCount[l.habit_key] = (habCount[l.habit_key] || 0) + 1; });
  const habits = getSetting('habits');
  const top = Object.entries(habCount).filter(([k]) => habits.some(h => h.key === k)).sort((a, b) => b[1] - a[1])[0];
  const notas = d.grades.filter(g => inW(g.date || String(g.created_at || '').slice(0, 10)) && g.score != null && g.max > 0);
  return {
    from, to, treinos, horas: blocos.reduce((a, b) => a + hours(b), 0), blocos: blocos.length,
    tarefas: tarefas.length, agua, rotina, top: top ? { name: habits.find(h => h.key === top[0]).name, n: top[1] } : null,
    notas: notas.length, media: notas.length ? notas.reduce((a, g) => a + g.score / g.max, 0) / notas.length * 100 : null,
  };
}
