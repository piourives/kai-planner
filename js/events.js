// ============================================================
//  Compromissos que se repetem ou duram vários dias
//  - Viagem de 20/12 a 27/12 aparece em todos esses dias.
//  - Aniversário marcado "todo ano" aparece em todos os anos.
// ============================================================
import * as db from './db.js';
import { addDays, parseISO, iso } from './util.js';

// Busca as datas que repetem todo ano (se a Fase 4 ainda não foi
// rodada no Supabase, simplesmente não tem nenhuma)
export async function fetchYearly() {
  try { return await db.list('events', { eq: { repeat: 'anual' } }); } catch { return []; }
}

// Transforma os compromissos em "ocorrências" dia a dia entre from e to.
// Cada ocorrência é o compromisso com a data do dia em que aparece;
// a data original fica em orig_date.
export function occurrences(rows, yearly, from, to) {
  const out = [];
  for (const ev of rows) {
    if (ev.repeat === 'anual') continue; // vem da lista "yearly"
    const end = ev.end_date && ev.end_date > ev.date ? ev.end_date : ev.date;
    if (end < from || ev.date > to) continue;
    for (let d = ev.date < from ? from : ev.date; d <= end && d <= to; d = addDays(d, 1)) {
      out.push({ ...ev, date: d, orig_date: ev.date });
    }
  }
  for (const ev of yearly) {
    for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
      const d = `${y}${ev.date.slice(4)}`;
      if (iso(parseISO(d)) !== d) continue; // 29/02 em ano que não é bissexto
      if (d < ev.date || d < from || d > to) continue;
      out.push({ ...ev, date: d, orig_date: ev.date });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.start_time || '').localeCompare(b.start_time || ''));
}
