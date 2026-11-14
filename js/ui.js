// Peças de interface reaproveitadas pelas telas.

import { todayISO, diffDays } from './util.js';

// Etiqueta "Hoje / Amanhã / 3d" (vermelho discreto só quando é hoje/amanhã)
export function daysBadge(date) {
  const n = diffDays(todayISO(), date);
  if (n < 0) return `<span class="badge b-green">passou</span>`;
  const cls = n <= 1 ? 'b-red' : n <= 3 ? 'b-yellow' : 'b-green';
  const lbl = n === 0 ? 'Hoje' : n === 1 ? 'Amanhã' : `${n}d`;
  return `<span class="badge ${cls}">${lbl}</span>`;
}

// Abre uma janelinha (diálogo) com um formulário.
// onSubmit(formData) — se devolver false, a janela continua aberta.
export function openDialog({ title, body, submitLabel = 'Salvar', danger, onSubmit, onDanger }) {
  const d = document.createElement('dialog');
  d.innerHTML = `<h3>${title}</h3>
    <form>
      ${body}
      <div class="actions">
        ${danger ? `<button type="button" class="btn danger" data-act="danger" style="margin-right:auto">${danger}</button>` : ''}
        <button type="button" class="btn ghost" data-act="cancel">${submitLabel ? 'Cancelar' : 'Fechar'}</button>
        ${submitLabel ? `<button class="btn" type="submit">${submitLabel}</button>` : ''}
      </div>
    </form>`;
  document.body.appendChild(d);
  const close = () => { d.close(); d.remove(); };
  d.querySelector('[data-act=cancel]').onclick = close;
  d.addEventListener('close', () => d.remove());
  const dz = d.querySelector('[data-act=danger]');
  if (dz) dz.onclick = async () => { await onDanger?.(); close(); };
  d.querySelector('form').onsubmit = async e => {
    e.preventDefault();
    const ok = await onSubmit?.(new FormData(e.target));
    if (ok !== false) close();
  };
  d.showModal();
  d.querySelector('input, select, textarea')?.focus();
  return d;
}
