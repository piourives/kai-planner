// ============================================================
//  KAI Planner — arquivo principal
//  Monta a barra do topo, a barra lateral, o login e troca
//  de tela conforme o endereço (#/inicio, #/escola, ...).
// ============================================================
import { electric } from './fx.js';
import * as db from './db.js';
import { icon } from './icons.js';
import { esc } from './util.js';
import { renderInicio } from './views/inicio.js';
import { renderConfig } from './views/config.js';
import { renderEscola } from './views/escola.js';
import { renderCalendario } from './views/calendario.js';
import { renderFuturo } from './views/futuro.js';
import { loadSettings, applyLook } from './settings.js';
import { renderAcademia } from './views/academia.js';
import { loadTraining } from './training.js';
import { enter, initClickFx, initSpotlight } from './anim.js';
import { renderConquistas } from './views/conquistas.js';
import { renderResumo } from './views/resumo.js';

const app = document.getElementById('app');

const ROUTES = {
  inicio:     { label: 'Início',     icon: 'home',     render: renderInicio },
  calendario: { label: 'Calendário', icon: 'calendar', render: renderCalendario },
  escola:     { label: 'Escola',     icon: 'school',   render: renderEscola },
  academia:   { label: 'Academia',   icon: 'dumbbell', render: renderAcademia },
  futuro:     { label: 'Futuro',     icon: 'star',     render: renderFuturo },
  conquistas: { label: 'Conquistas', icon: 'medal',    render: renderConquistas },
  resumo:     { label: 'Resumo da semana', icon: 'play', render: renderResumo },
  config:     { label: 'Configurações', icon: 'settings', render: renderConfig },
};
const MAIN_NAV = ['inicio', 'calendario', 'escola', 'academia', 'futuro', 'conquistas'];

// "#/escola/p/123" -> rota "escola", parâmetros ["p", "123"]
function currentRoute() {
  const [r, ...params] = location.hash.replace(/^#\/?/, '').split('/');
  return ROUTES[r] ? { key: r, params } : { key: 'inicio', params: [] };
}

// ---------- Barra lateral aberta/fechada ----------
const isMobile = () => matchMedia('(max-width: 860px)').matches;
function initSidebarState() {
  const saved = localStorage.getItem('kai:side');
  const closed = isMobile() ? true : saved === 'closed';
  document.body.classList.toggle('side-closed', closed);
}
function toggleSidebar(force) {
  const closed = force ?? !document.body.classList.contains('side-closed');
  document.body.classList.toggle('side-closed', closed);
  if (!isMobile()) localStorage.setItem('kai:side', closed ? 'closed' : 'open');
}

// ---------- Estrutura da tela ----------
function renderShell() {
  const name = db.getName();
  const navLink = key => {
    const r = ROUTES[key];
    return `<a class="nav-item" data-route="${key}" href="#/${key}">${icon(r.icon)}<span>${r.label}</span></a>`;
  };
  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" id="menuBtn" aria-label="Abrir/fechar menu">${icon('menu')}</button>
      <a class="brand" href="#/inicio">${icon('calendar')}<span>KAI Planner</span></a>
      <div class="top-right">
        <span class="uname">${esc(name)}</span>
        <span class="avatar">${esc((name || '?').charAt(0).toUpperCase())}</span>
        <a class="icon-btn" href="#/config" aria-label="Configurações">${icon('settings')}</a>
      </div>
    </header>
    <div class="layout">
      <nav class="sidebar" id="sidebar">
        ${MAIN_NAV.map(navLink).join('')}
        <div class="nav-spacer"></div>
        ${navLink('config')}
      </nav>
      <div class="backdrop" id="backdrop"></div>
      <main id="main"></main>
    </div>`;
  document.getElementById('menuBtn').onclick = () => toggleSidebar();
  document.getElementById('backdrop').onclick = () => toggleSidebar(true);
  document.getElementById('sidebar').addEventListener('click', e => {
    if (e.target.closest('a') && isMobile()) toggleSidebar(true);
  });
}

async function renderRoute(retried = false) {
  const { key, params } = currentRoute();
  document.querySelectorAll('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.route === key));
  const main = document.getElementById('main');
  const busy = setTimeout(() => document.body.classList.add('busy'), 120);
  try {
    await ROUTES[key].render(main, { refreshShell: startApp }, params);
    enter(main);
  } catch (err) {
    console.error(err);
    const msg = String(err.message || err);
    // Login vencido: renova e tenta de novo; se não der, pede pra entrar outra vez
    if (/jwt/i.test(msg) && !retried) {
      clearTimeout(busy); document.body.classList.remove('busy');
      if (await db.refreshSession().catch(() => false)) return renderRoute(true);
      await db.signOut().catch(() => {});
      renderAuth('Seu login venceu. Entre de novo, por favor.');
      return;
    }
    const falta = /does not exist|schema cache|column/i.test(msg)
      ? '<p class="small">Parece que falta rodar um arquivo SQL novo no Supabase (pasta <code>supabase/</code>, ex: <code>fase5.sql</code>).</p>' : '';
    main.innerHTML = `<div class="card"><b>Ops, algo deu errado.</b><p class="muted small">${esc(msg)}</p>${falta}</div>`;
  }
  clearTimeout(busy);
  document.body.classList.remove('busy');
  window.scrollTo(0, 0);
}

// ---------- Login ----------
function renderAuth(notice = '') {
  let mode = 'login';
  const draw = () => {
    app.innerHTML = `
      <div class="auth-wrap"><div class="card auth">
        <div class="auth-logo">${electric('calendar', 92)}</div>
        <h1>KAI Planner</h1>
        <p class="muted small">${mode === 'login' ? 'Entre com seu e-mail e senha.' : 'Crie sua conta (só precisa fazer uma vez).'}</p>
        <form id="authForm">
          <input class="input" type="email" name="email" placeholder="E-mail" autocomplete="email" required>
          <input class="input" type="password" name="password" placeholder="Senha (mín. 6 caracteres)"
            autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="6" required>
          <button class="btn" type="submit">${mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
          <div class="msg" id="authMsg">${esc(notice)}</div>
        </form>
        <button class="linkbtn" id="switchMode">${mode === 'login' ? 'Não tenho conta — criar' : 'Já tenho conta — entrar'}</button>
      </div></div>`;
    document.getElementById('switchMode').onclick = () => { mode = mode === 'login' ? 'signup' : 'login'; draw(); };
    document.getElementById('authForm').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const msg = document.getElementById('authMsg');
      const btn = e.target.querySelector('button');
      btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Aguarde…';
      try {
        if (mode === 'login') {
          await db.signIn(fd.get('email'), fd.get('password'));
          startApp();
        } else {
          const logged = await db.signUp(fd.get('email'), fd.get('password'));
          if (logged) startApp();
          else { msg.className = 'msg ok'; msg.textContent = 'Conta criada! Abra seu e-mail, clique no link de confirmação e depois entre aqui.'; }
        }
      } catch (err) {
        msg.className = 'msg err';
        msg.textContent = traduzErro(err.message);
      } finally { btn.disabled = false; }
    };
  };
  draw();
}

function traduzErro(m = '') {
  if (/Invalid login/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail primeiro (veja sua caixa de entrada).';
  if (/already registered/i.test(m)) return 'Esse e-mail já tem conta. Use "entrar".';
  if (/Password/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
  return m || 'Não foi possível. Tente de novo.';
}

// ---------- Pergunta o nome na primeira vez ----------
function askName() {
  return new Promise(resolve => {
    const d = document.createElement('dialog');
    d.innerHTML = `<h3>Como você quer ser chamado?</h3>
      <form method="dialog"><input class="input" name="n" maxlength="30" required placeholder="Seu nome ou apelido">
      <div class="actions"><button class="btn">Salvar</button></div></form>`;
    document.body.appendChild(d);
    d.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      await db.setName(d.querySelector('input').value.trim());
      d.close(); d.remove(); resolve();
    };
    d.addEventListener('cancel', e => e.preventDefault());
    d.showModal();
  });
}

// ---------- Início do app ----------
async function startApp() {
  if (db.isCloud() && !db.currentUser()) { applyLook(); renderAuth(); return; }
  if (!db.getName()) await askName();
  await loadSettings(true);
  applyLook();
  await loadTraining();
  renderShell();
  initSidebarState();
  renderRoute();
}

initClickFx();
initSpotlight();
window.addEventListener('hashchange', () => { if (document.getElementById('main')) renderRoute(); });

(async () => {
  try { await db.initDB(); }
  catch (e) { app.innerHTML = `<div class="boot">Não consegui conectar ao Supabase. Verifique a internet e o config.js.</div>`; return; }
  startApp();
})();

// Service worker: só para deixar o app instalável e abrir rápido.
// (Não usamos notificações de forma nenhuma.)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  const hadOld = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(reg => {
    // ao voltar para o app, procura versão nova
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
  // chegou versão nova: recarrega uma vez para já mostrar ela
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadOld && !reloaded && !document.querySelector('dialog[open]')) { reloaded = true; location.reload(); }
  });
}
