// Configurações do usuário (guardadas na tabela "settings").
// Se ainda não houver nada salvo, usa os valores de data/defaults.js.
import * as db from './db.js';
import { DEFAULTS } from './data/defaults.js';
import { esc } from './util.js';

let cache = null;

export async function loadSettings(force = false) {
  if (cache && !force) return cache;
  try {
    const rows = await db.list('settings');
    cache = {};
    rows.forEach(r => { cache[r.key] = r.value; });
  } catch {
    cache = {}; // tabela ainda não criada: usa os padrões
  }
  return cache;
}

export function getSetting(key) {
  return cache?.[key] ?? DEFAULTS[key];
}

// Tema e tamanho do texto
export function applyLook() {
  const r = document.documentElement;
  r.dataset.theme = getSetting('theme') || 'escuro';
  r.dataset.size = getSetting('text_size') || 'normal';
  // Animações: 'auto' segue o celular ("reduzir movimento"), 'on' sempre, 'off' nunca
  const a = getSetting('animations') || 'auto';
  const on = a === 'on' || (a === 'auto' && !matchMedia('(prefers-reduced-motion: reduce)').matches);
  r.classList.toggle('anim', on);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', r.dataset.theme === 'preto' ? '#000000' : '#0a0a0a');
}

export async function setSetting(key, value) {
  await db.upsert('settings', { key, value }, ['key']);
  if (!cache) cache = {};
  cache[key] = value;
}

// ---------- Matérias ----------
export const subjects = () => getSetting('subjects');
export const subj = key => subjects().find(s => s.key === key);
export const subjName = key => subj(key)?.name || 'Sem matéria';

export function subjDot(key) {
  const s = subj(key);
  return `<span class="sdot" style="background:${s?.color || '#555'}"></span>`;
}
export function subjLabel(key, lab) {
  return `${subjDot(key)}${esc(subjName(key))}${lab ? ' <span class="tag">Lab</span>' : ''}`;
}
export function subjOptions(selected) {
  return subjects().map(s => `<option value="${s.key}" ${s.key === selected ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}
