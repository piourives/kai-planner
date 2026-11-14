import { icon } from '../icons.js';

const ICONS = { 'Calendário': 'calendar', 'Escola': 'school', 'Academia': 'dumbbell', 'Futuro': 'star' };

export function renderSoon(main, title, fase) {
  main.innerHTML = `
    <h1 class="page-title">${title}</h1>
    <div class="card soon">
      ${icon(ICONS[title] || 'sparkle')}
      <h2>Em construção</h2>
      <p class="muted">Esta tela chega na Fase ${fase}.</p>
    </div>`;
}
