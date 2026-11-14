// Funções pequenas usadas em várias telas.

// Evita que um texto digitado vire código HTML (segurança).
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Datas no formato "2026-11-14", sempre no fuso do aparelho.
export function iso(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function todayISO() { return iso(new Date()); }
export function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); }
export function diffDays(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export function weekdayShort(s) { return DIAS[parseISO(s).getDay()]; }
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
export function fmtLong(s) {
  return cap(parseISO(s).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));
}
export function fmtShort(s) {
  return cap(parseISO(s).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace(/\./g, ''));
}

export function plural(n, um, varios) { return `${n} ${n === 1 ? um : varios}`; }
