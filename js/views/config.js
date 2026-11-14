// Configurações — por enquanto só o básico (perfil e sair).
// O resto (matérias, horários, treinos, backup...) vem na Fase 6.
import * as db from '../db.js';
import { icon } from '../icons.js';
import { esc } from '../util.js';

export function renderConfig(main, ctx) {
  const cloud = db.isCloud();
  main.innerHTML = `
    <h1 class="page-title">Configurações</h1>
    <div class="stack">
      <div class="card">
        <div class="card-h"><h2>Perfil</h2></div>
        <form id="nameForm" class="add-row">
          <input class="input" name="n" maxlength="30" value="${esc(db.getName())}" placeholder="Seu nome">
          <button class="btn">Salvar</button>
        </form>
      </div>
      <div class="card">
        <div class="card-h"><h2>Onde seus dados ficam</h2></div>
        <span class="mode-pill"><span class="d" style="background:${cloud ? 'var(--green)' : 'var(--yellow)'}"></span>
          ${cloud ? 'Nuvem (Supabase) — sincroniza celular e computador' : 'Modo local — só neste navegador'}</span>
        ${cloud ? `<p class="muted small">Conectado como ${esc(db.currentUser()?.email)}</p>
          <button class="btn ghost" id="logout">${icon('logout')} Sair da conta</button>`
        : `<p class="muted small">Para sincronizar, preencha o arquivo <code>js/config.js</code> (veja o LEIA-ME).</p>`}
      </div>
      <div class="card">
        <div class="card-h"><h2>Em breve</h2></div>
        <p class="muted small">Tema, matérias e cores, horários fixos, regras de estudo, média, treinos, hábitos e backup chegam na Fase 6.</p>
      </div>
    </div>`;

  main.querySelector('#nameForm').onsubmit = async e => {
    e.preventDefault();
    const n = e.target.n.value.trim();
    if (!n) return;
    await db.setName(n);
    ctx.refreshShell();
  };
  const lo = main.querySelector('#logout');
  if (lo) lo.onclick = async () => { await db.signOut(); location.hash = '#/inicio'; location.reload(); };
}
