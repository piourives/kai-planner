// ============================================================
//  Tela FUTURO
//  - Contagem regressiva (você escolhe a data final)
//  - Metas de 3 anos e Sonhos de longo prazo
//  - Mapa dos sonhos: mural com as fotos; clicou, vai pra meta
//  - Página de cada meta: marcos, ideias, itens (foto + preço)
// ============================================================
import * as db from '../db.js';
import { icon } from '../icons.js';
import { openDialog } from '../ui.js';
import { esc, todayISO, addDays, diffDays, parseISO, plural } from '../util.js';
import { getSetting, setSetting, subjName } from '../settings.js';
import { doneList, streak, programWeek } from '../training.js';
import { saveImage, imageUrls, deleteImage } from '../images.js';

const AREAS = {
  corpo:    { label: 'Corpo',    icon: 'dumbbell' },
  escola:   { label: 'Escola',   icon: 'school' },
  dinheiro: { label: 'Dinheiro', icon: 'coin' },
  quarto:   { label: 'Quarto',   icon: 'bed' },
  outro:    { label: 'Outro',    icon: 'star' },
};
const TYPES = { meta: 'Meta de 3 anos', sonho: 'Sonho de longo prazo' };

// Metas que já vêm prontas na primeira vez (dá pra editar/apagar tudo)
const SEED = [
  { title: 'Corpo funcional e musculoso', type: 'meta', area: 'corpo',
    description: 'Sem meta de peso: o peso é só para acompanhar. O progresso vem dos treinos, das cargas, da sequência e dos marcos.',
    items: [['marco', 'Primeira barra fixa assistida'], ['marco', '5 barras assistidas seguidas'],
      ['marco', 'Primeira barra fixa sem ajuda'], ['marco', '10 flexões seguidas no chão']] },
  { title: 'Ir bem na escola', type: 'meta', area: 'escola',
    description: 'Ficar acima da média (70%) em todas as matérias.',
    items: [['marco', 'Um trimestre inteiro sem nenhuma matéria abaixo da média'],
      ['marco', 'Chegar em todas as provas do mês com os blocos de estudo feitos']] },
  { title: 'Ganhar dinheiro', type: 'meta', area: 'dinheiro',
    description: 'Ideias para ganhar dinheiro e os primeiros marcos.',
    items: [['marco', 'Primeiros R$ 100 ganhos'], ['marco', 'Primeiros R$ 1.000 ganhos']] },
  { title: 'Quarto dos sonhos', type: 'meta', area: 'quarto',
    description: 'Tudo que vai ter no quarto, com foto e preço.', items: [] },
  { title: 'Casa gigante dos sonhos', type: 'sonho', area: 'outro',
    description: 'Uma casa gigante com a garagem completa.',
    items: [['item', 'Casa gigante'], ['item', 'Ford Mustang'], ['item', 'Dodge Challenger'],
      ['item', 'Ford Raptor'], ['item', 'McLaren']] },
];

// ---------- Ajudantes ----------
const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: Number(v) % 1 ? 2 : 0 });
const parseMoney = s => {
  s = String(s || '').replace(/[^\d,.-]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');      // 1.299,90
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');  // 1.000 = mil
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const fmtDate = s => parseISO(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const pct = p => `${Math.round(p * 100)}%`;
const bar = p => `<div class="pbar"><span style="width:${Math.round(Math.min(1, Math.max(0, p)) * 100)}%"></span></div>`;

// anos/meses/dias entre duas datas
function ymd(a, b) {
  const A = parseISO(a), B = parseISO(b);
  let y = B.getFullYear() - A.getFullYear(), m = B.getMonth() - A.getMonth(), d = B.getDate() - A.getDate();
  if (d < 0) { m--; d += new Date(B.getFullYear(), B.getMonth(), 0).getDate(); }
  if (m < 0) { y--; m += 12; }
  return { y, m, d };
}

// Melhor sequência de treinos (sem pular dia de treino)
function bestStreak() {
  const list = doneList();
  let best = 0, run = 0;
  list.forEach((x, i) => { run = i && diffDays(list[i - 1].date, x.date) <= 2 ? run + 1 : 1; best = Math.max(best, run); });
  return best;
}

// Marcos automáticos do corpo (vêm da Academia)
function corpoAuto() {
  const total = doneList().length;
  const ms = [10, 25, 50, 100, 200].map(n => ({ title: `${n} treinos feitos`, done: total >= n }));
  ms.push({ title: 'Sequência de 10 treinos sem pular', done: bestStreak() >= 10 });
  ms.push({ title: 'Programa de 3 meses completo', done: programWeek().over });
  return { total, streak: streak(), best: bestStreak(), milestones: ms };
}

function escolaAuto(grades) {
  const pass = getSetting('pass_pct');
  const by = {};
  grades.filter(g => g.score != null && g.max > 0).forEach(g => {
    by[g.subject] ??= { s: 0, m: 0 };
    by[g.subject].s += Number(g.score); by[g.subject].m += Number(g.max);
  });
  const subjects = Object.entries(by).map(([k, v]) => ({ key: k, name: subjName(k), p: v.s / v.m * 100 }))
    .sort((a, b) => a.p - b.p);
  const total = Object.values(by).reduce((a, v) => ({ s: a.s + v.s, m: a.m + v.m }), { s: 0, m: 0 });
  return { pass, subjects, avg: total.m ? total.s / total.m * 100 : null, above: subjects.filter(s => s.p >= pass).length };
}

function progressOf(g, its, auto) {
  if (Number(g.target_value) > 0) return Math.min(1, (Number(g.current_value) || 0) / Number(g.target_value));
  const flags = its.filter(i => i.goal_id === g.id && ['marco', 'item'].includes(i.kind)).map(i => i.done);
  if (g.area === 'corpo') auto.corpo.milestones.forEach(m => flags.push(m.done));
  if (g.done) return 1;
  return flags.length ? flags.filter(Boolean).length / flags.length : null;
}

// Preenche as <img data-img="caminho"> com os links das fotos
async function fillImages(root) {
  const els = [...root.querySelectorAll('[data-img]')];
  if (!els.length) return;
  const urls = await imageUrls(els.map(e => e.dataset.img));
  els.forEach(e => {
    const u = urls[e.dataset.img];
    if (u) e.src = u; else e.closest('.ph-wrap')?.classList.add('noimg');
  });
}

async function loadAll() {
  let goals = await db.list('goals', { order: 'position' });
  if (!goals.length && !getSetting('goals_seeded')) {
    for (const [i, s] of SEED.entries()) {
      const g = await db.insert('goals', { title: s.title, type: s.type, area: s.area, description: s.description, position: i });
      for (const [j, [kind, title]] of s.items.entries()) await db.insert('goal_items', { goal_id: g.id, kind, title, position: j, done: false });
    }
    await setSetting('goals_seeded', true);
    goals = await db.list('goals', { order: 'position' });
  }
  const [items, grades] = await Promise.all([
    db.list('goal_items', { order: 'created_at' }),
    db.list('grades').catch(() => []),
  ]);
  items.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.created_at).localeCompare(String(b.created_at)));
  return { goals, items, auto: { corpo: corpoAuto(), escola: escolaAuto(grades) } };
}

// ============================================================
//  Tela principal
// ============================================================
export async function renderFuturo(main, ctx, params = []) {
  if (params[0] === 'm' && params[1]) return renderGoal(main, params[1]);
  const today = todayISO();
  const { goals, items, auto } = await loadAll();
  const end = getSetting('future_end');
  const start = getSetting('program_start');

  // ---------- Contagem ----------
  let countHtml;
  if (!end) {
    countHtml = `
      <section class="card count">
        <div class="count-l"><div class="small muted">Contagem regressiva</div>
          <h2 style="margin:4px 0 6px">Quando termina a sua contagem de 3 anos?</h2>
          <p class="muted small" style="margin:0">Escolha a data final. Dá pra mudar depois.</p></div>
        <form id="endForm" class="row-btns">
          <input class="input" type="date" name="end" required min="${addDays(today, 1)}" value="${addDays(today, 365 * 3 + 1)}">
          <button class="btn">Salvar</button>
        </form>
      </section>`;
  } else {
    const left = end > today ? ymd(today, end) : { y: 0, m: 0, d: 0 };
    const total = Math.max(1, diffDays(start, end));
    const gone = Math.min(1, Math.max(0, diffDays(start, today) / total));
    const nDias = Math.max(0, diffDays(today, end));
    countHtml = `
      <section class="card count">
        <div class="count-l">
          <div class="small muted">${end > today ? 'Faltam' : 'Chegou o dia!'}</div>
          <div class="cd">
            <div><b>${left.y}</b><span>${left.y === 1 ? 'ano' : 'anos'}</span></div>
            <div><b>${left.m}</b><span>${left.m === 1 ? 'mês' : 'meses'}</span></div>
            <div><b>${left.d}</b><span>${left.d === 1 ? 'dia' : 'dias'}</span></div>
          </div>
          <div class="small muted">${plural(nDias, 'dia', 'dias')} até ${fmtDate(end)}</div>
        </div>
        <div class="count-r">
          ${bar(gone)}
          <div class="small muted" style="display:flex;justify-content:space-between;gap:8px;margin-top:6px">
            <span>Começou ${fmtDate(start)}</span><span>${pct(gone)} do caminho</span></div>
          <button class="linkbtn small" id="editEnd" style="margin-top:8px">${icon('edit', 'sm')} Mudar data final</button>
        </div>
      </section>`;
  }

  // ---------- Cartões de metas ----------
  const coverOf = g => g.image_path || items.find(i => i.goal_id === g.id && i.image_path)?.image_path;
  const subOf = g => {
    const its = items.filter(i => i.goal_id === g.id);
    const marcos = its.filter(i => i.kind === 'marco'), coisas = its.filter(i => i.kind === 'item');
    if (g.area === 'corpo') return `${plural(auto.corpo.total, 'treino', 'treinos')} · sequência ${auto.corpo.streak}`;
    if (g.area === 'escola' && auto.escola.avg != null) return `Média geral ${Math.round(auto.escola.avg)}% · ${auto.escola.above}/${auto.escola.subjects.length} matérias acima de ${auto.escola.pass}%`;
    if (Number(g.target_value) > 0) return `${money(g.current_value)} de ${money(g.target_value)}`;
    if (coisas.length) {
      const sum = coisas.reduce((a, i) => a + (Number(i.price) || 0), 0);
      return `${coisas.filter(i => i.done).length}/${coisas.length} itens${sum ? ` · ${money(sum)}` : ''}`;
    }
    const ideias = its.filter(i => i.kind === 'ideia').length;
    return [marcos.length ? `${marcos.filter(i => i.done).length}/${marcos.length} marcos` : '', ideias ? plural(ideias, 'ideia', 'ideias') : '']
      .filter(Boolean).join(' · ') || 'Toque para começar';
  };
  const card = g => {
    const p = progressOf(g, items, auto), cover = coverOf(g);
    return `<a class="gcard ${g.done ? 'gdone' : ''}" href="#/futuro/m/${g.id}">
      ${cover ? `<span class="ph-wrap"><img class="gcover" data-img="${esc(cover)}" alt=""></span>` : ''}
      <span class="gbody">
        <span class="gtitle"><span class="gic">${icon(AREAS[g.area]?.icon || 'star')}</span>${esc(g.title)}${g.done ? ' ✓' : ''}</span>
        <span class="small muted">${subOf(g)}</span>
        ${p != null ? `<span class="gprog">${bar(p)}<span class="small muted">${pct(p)}</span></span>` : ''}
      </span>
    </a>`;
  };
  const metas = goals.filter(g => g.type === 'meta'), sonhos = goals.filter(g => g.type === 'sonho');

  // ---------- Mapa dos sonhos ----------
  const pics = [
    ...goals.filter(g => g.image_path).map(g => ({ path: g.image_path, goal: g.id, cap: g.title })),
    ...items.filter(i => i.image_path).map(i => ({ path: i.image_path, goal: i.goal_id, cap: i.title })),
  ].filter(p => goals.some(g => g.id === p.goal));

  main.innerHTML = `
    <div class="page-head"><h1 class="page-title">Futuro</h1>
      <button class="btn" id="newGoal">${icon('plus')} Nova meta</button></div>
    ${countHtml}
    <h2 class="sec-t">Metas de 3 anos</h2>
    <div class="ggrid">${metas.map(card).join('') || '<div class="empty">Nenhuma meta ainda.</div>'}</div>
    <h2 class="sec-t">Sonhos de longo prazo <span class="muted small">sem prazo</span></h2>
    <div class="ggrid">${sonhos.map(card).join('') || '<div class="empty">Nenhum sonho ainda.</div>'}</div>
    <div class="sec-row"><h2 class="sec-t">Mapa dos sonhos</h2>
      <button class="btn ghost sm-btn" id="addPic">${icon('image')} Adicionar foto</button></div>
    ${pics.length ? `<div class="mural">${pics.map(p => `
      <a class="mtile ph-wrap" href="#/futuro/m/${p.goal}"><img data-img="${esc(p.path)}" alt="${esc(p.cap)}" loading="lazy"><span>${esc(p.cap)}</span></a>`).join('')}</div>`
      : `<div class="card empty" style="text-align:center">Seu mural ainda está vazio. Adicione fotos das suas metas e sonhos — cada foto leva para a meta dela.</div>`}
  `;
  fillImages(main);

  const reload = () => renderFuturo(main, ctx, params);
  main.querySelector('#endForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    await setSetting('future_end', e.target.end.value);
    reload();
  });
  main.querySelector('#editEnd')?.addEventListener('click', () => openDialog({
    title: 'Data final da contagem',
    body: `<label>Termina em<input class="input" type="date" name="end" required value="${end}"></label>`,
    submitLabel: 'Salvar',
    onSubmit: async fd => { await setSetting('future_end', fd.get('end')); reload(); },
  }));
  main.querySelector('#newGoal').onclick = () => goalDialog(null, async g => { location.hash = `#/futuro/m/${g.id}`; });
  main.querySelector('#addPic').onclick = () => photoDialog(goals, null, reload);
}

// ============================================================
//  Página de uma meta
// ============================================================
async function renderGoal(main, id) {
  const { goals, items, auto } = await loadAll();
  const g = goals.find(x => x.id === id);
  if (!g) { main.innerHTML = `<div class="card">Essa meta não existe mais. <a class="linkbtn" href="#/futuro">Voltar</a></div>`; return; }
  const its = items.filter(i => i.goal_id === g.id);
  const of = k => its.filter(i => i.kind === k);
  const p = progressOf(g, items, auto);
  const end = g.deadline || (g.type === 'meta' ? getSetting('future_end') : null);
  const reload = () => renderGoal(main, id);

  // Painel automático
  let autoHtml = '';
  if (g.area === 'corpo') {
    const [loads, body] = await Promise.all([
      db.list('load_logs', { order: 'date' }).catch(() => []),
      db.list('body_logs', { order: 'date' }).catch(() => []),
    ]);
    const names = {};
    Object.values(getSetting('workouts')).forEach(w => w.exercises.forEach(e => { names[e.key] = e.name; }));
    const byEx = {};
    loads.filter(l => l.weight != null).forEach(l => { (byEx[l.exercise_key] ??= []).push(l); });
    const evol = Object.entries(byEx).map(([k, l]) => ({ name: names[k] || k, a: l[0].weight, b: l[l.length - 1].weight }));
    const pesos = body.filter(b => b.weight != null);
    const c = auto.corpo;
    autoHtml = `
      <section class="card">
        <div class="card-h"><h2>Vem da Academia</h2><a class="right linkbtn small" href="#/academia">abrir</a></div>
        <div class="three">
          <div class="stat"><span class="small muted">Treinos feitos</span><b>${c.total}</b></div>
          <div class="stat"><span class="small muted">Sequência</span><b>${c.streak}</b></div>
          <div class="stat"><span class="small muted">Melhor sequência</span><b>${c.best}</b></div>
        </div>
        <div class="chips">${c.milestones.map(m => `<span class="mchip ${m.done ? 'on' : ''}">${m.done ? icon('check', 'sm') : ''}${m.title}</span>`).join('')}</div>
        ${evol.length ? `<div class="small muted" style="margin-top:12px">Cargas (primeira → última)</div>
          ${evol.map(e => `<div class="kv"><span>${esc(e.name)}</span><b>${e.a} → ${e.b} kg</b></div>`).join('')}` : '<p class="small muted">Registre cargas na Academia para ver a evolução aqui.</p>'}
        ${pesos.length ? `<div class="kv"><span>Peso (só acompanhamento)</span><b>${pesos[0].weight}${pesos.length > 1 ? ` → ${pesos[pesos.length - 1].weight}` : ''} kg</b></div>` : ''}
      </section>`;
  }
  if (g.area === 'escola') {
    const e = auto.escola;
    autoHtml = `
      <section class="card">
        <div class="card-h"><h2>Vem das notas</h2><a class="right linkbtn small" href="#/escola/notas">abrir</a></div>
        ${e.subjects.length ? `
          <div class="kv"><span>Média geral</span><b>${Math.round(e.avg)}%</b></div>
          <div class="kv"><span>Matérias acima de ${e.pass}%</span><b>${e.above} de ${e.subjects.length}</b></div>
          ${e.subjects.map(s => `<div class="kv"><span>${esc(s.name)}</span><b class="${s.p < e.pass ? 'txt-red' : ''}">${Math.round(s.p)}%</b></div>`).join('')}`
          : '<p class="small muted" style="margin:0">Quando você lançar notas na Escola, a média aparece aqui.</p>'}
      </section>`;
  }
  if (Number(g.target_value) > 0 || g.area === 'dinheiro') {
    autoHtml += `
      <section class="card">
        <div class="card-h"><h2>Dinheiro</h2><button class="right linkbtn small" id="editMoney">${icon('edit', 'sm')} atualizar</button></div>
        ${Number(g.target_value) > 0
          ? `<div class="money"><b>${money(g.current_value)}</b><span class="muted"> de ${money(g.target_value)}</span></div>${bar(p)}`
          : '<p class="small muted" style="margin:0">Quer juntar um valor? Toque em “atualizar” e coloque quanto quer juntar e quanto já tem.</p>'}
      </section>`;
  }

  // Listas
  const checkList = (kind, label, hint) => {
    const list = of(kind);
    return `
      <section class="card" data-kind="${kind}">
        <div class="card-h"><h2>${label}</h2>${list.length ? `<span class="right counter">${list.filter(i => i.done).length}/${list.length}</span>` : ''}</div>
        ${list.map(i => `
          <div class="check-row ${i.done ? 'done' : ''}" data-id="${i.id}">
            <button class="cb ${i.done ? 'on' : ''}" data-act="toggle" aria-label="Marcar">${icon('check')}</button>
            <span class="t">${esc(i.title)}</span>
            <span class="row-actions"><button data-act="delete" title="Apagar">${icon('trash')}</button></span>
          </div>`).join('') || `<div class="empty">${hint}</div>`}
        <form class="add-row" data-add="${kind}">
          <input class="input" name="title" placeholder="${kind === 'marco' ? 'Novo marco…' : 'Nova ideia…'}" maxlength="160" autocomplete="off">
          <button class="btn" aria-label="Adicionar">${icon('plus')}</button>
        </form>
      </section>`;
  };
  const coisas = of('item');
  const soma = coisas.reduce((a, i) => a + (Number(i.price) || 0), 0);
  const jaTem = coisas.filter(i => i.done).reduce((a, i) => a + (Number(i.price) || 0), 0);
  const itemsHtml = `
    <section class="card">
      <div class="card-h"><h2>${g.area === 'quarto' ? 'Itens do quarto' : 'Itens'}</h2>
        <span class="right">${soma ? `${money(jaTem)} de ${money(soma)}` : ''}</span></div>
      <div class="igrid">
        ${coisas.map(i => `
          <button class="icard ${i.done ? 'idone' : ''}" data-item="${i.id}">
            <span class="ph-wrap ${i.image_path ? '' : 'noimg'}">${i.image_path ? `<img data-img="${esc(i.image_path)}" alt="">` : ''}<span class="ph">${icon('image')}<small>adicionar foto</small></span></span>
            <span class="ibody"><span class="ititle">${i.done ? '✓ ' : ''}${esc(i.title)}</span>
              <span class="small muted">${i.price != null ? money(i.price) : 'sem preço'}</span></span>
          </button>`).join('')}
        <button class="icard iadd" id="addItem">${icon('plus')}<span>Adicionar item</span></button>
      </div>
      <p class="small muted" style="margin:10px 0 0">Toque no item para colocar foto, preço ou marcar como ${g.area === 'quarto' ? 'comprado' : 'conquistado'}.</p>
    </section>`;
  const fotos = of('foto');
  const fotosHtml = `
    <section class="card">
      <div class="card-h"><h2>Fotos no mapa dos sonhos</h2><button class="right linkbtn small" id="addFoto">${icon('plus', 'sm')} foto</button></div>
      ${fotos.length ? `<div class="mural small-m">${fotos.map(f => `
        <button class="mtile ph-wrap" data-foto="${f.id}"><img data-img="${esc(f.image_path)}" alt=""><span>${esc(f.title)}</span></button>`).join('')}</div>`
        : '<div class="empty">Fotos que te lembram dessa meta. Elas aparecem no mapa dos sonhos.</div>'}
    </section>`;

  const showIdeias = g.area === 'dinheiro' || of('ideia').length;
  const showItems = ['quarto', 'outro'].includes(g.area) || g.type === 'sonho' || coisas.length;
  const extras = [];
  if (!showIdeias) extras.push(`<button class="linkbtn small" data-more="ideia">+ Ideias</button>`);
  if (!showItems) extras.push(`<button class="linkbtn small" data-more="item">+ Itens com foto e preço</button>`);

  main.innerHTML = `
    <a class="linkbtn small" href="#/futuro">${icon('back', 'sm')} Futuro</a>
    <section class="card ghead">
      ${g.image_path ? `<span class="ph-wrap gbanner"><img data-img="${esc(g.image_path)}" alt=""></span>` : ''}
      <div class="ghead-in">
      <div class="det-head">
        <div>
          <div class="small muted">${TYPES[g.type]} · ${AREAS[g.area]?.label || ''}${end ? ` · até ${fmtDate(end)}` : ''}</div>
          <h1 class="page-title" style="margin:4px 0 6px">${esc(g.title)}${g.done ? ' ✓' : ''}</h1>
          ${g.description ? `<p class="muted" style="margin:0">${esc(g.description)}</p>` : ''}
        </div>
        <div class="row-btns">
          <button class="btn ghost sm-btn" id="cover">${icon('image')} ${g.image_path ? 'Trocar capa' : 'Foto de capa'}</button>
          <button class="btn ghost sm-btn" id="editGoal">${icon('edit')} Editar</button>
        </div>
      </div>
      ${p != null ? `<div class="gprog" style="margin-top:12px">${bar(p)}<span class="small muted">${pct(p)}</span></div>` : ''}
      </div>
      <input type="file" accept="image/*" id="coverFile" hidden>
    </section>
    <div class="gcols">
      ${autoHtml}
      ${checkList('marco', 'Marcos', 'Nenhum marco ainda. Marcos são passos no caminho: “primeira barra”, “primeiros R$ 100”…')}
      ${showIdeias ? checkList('ideia', 'Ideias', 'Escreva ideias pra testar. Marque as que você já tentou.') : ''}
    </div>
    ${showItems ? itemsHtml : ''}
    ${fotosHtml}
    ${extras.length ? `<div class="row-btns" style="margin-top:4px">${extras.join('')}</div>` : ''}
    <div style="margin-top:18px"><button class="btn ghost sm-btn" id="toggleDone">${g.done ? 'Desmarcar conquista' : `${icon('check')} Marcar como conquistada`}</button></div>
  `;
  fillImages(main);

  // Capa
  const coverFile = main.querySelector('#coverFile');
  main.querySelector('#cover').onclick = () => coverFile.click();
  coverFile.onchange = async () => {
    const f = coverFile.files[0]; if (!f) return;
    try {
      const path = await saveImage(f);
      await deleteImage(g.image_path);
      await db.update('goals', g.id, { image_path: path });
      reload();
    } catch (e) { alert('Não consegui salvar a foto: ' + e.message); }
  };
  main.querySelector('#editGoal').onclick = () => goalDialog(g, reload);
  main.querySelector('#editMoney')?.addEventListener('click', () => moneyDialog(g, reload));
  main.querySelector('#toggleDone').onclick = async () => { await db.update('goals', g.id, { done: !g.done }); reload(); };

  // Marcos e ideias
  main.querySelectorAll('form[data-add]').forEach(f => f.onsubmit = async e => {
    e.preventDefault();
    const title = f.title.value.trim(); if (!title) return;
    await db.insert('goal_items', { goal_id: g.id, kind: f.dataset.add, title, done: false, position: its.length });
    await reload();
    main.querySelector(`form[data-add=${f.dataset.add}] input`)?.focus();
  });
  main.querySelectorAll('section[data-kind]').forEach(sec => sec.addEventListener('click', async e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const it = its.find(i => i.id === b.closest('[data-id]').dataset.id); if (!it) return;
    if (b.dataset.act === 'toggle') await db.update('goal_items', it.id, { done: !it.done });
    if (b.dataset.act === 'delete') await db.remove('goal_items', it.id);
    reload();
  }));

  // Itens e fotos
  main.querySelector('#addItem')?.addEventListener('click', () => itemDialog(g, null, its.length, reload));
  main.querySelectorAll('[data-item]').forEach(b => b.onclick = () => itemDialog(g, its.find(i => i.id === b.dataset.item), its.length, reload));
  main.querySelector('#addFoto').onclick = () => photoDialog(goals, g.id, reload);
  main.querySelectorAll('[data-foto]').forEach(b => b.onclick = () => {
    const f = its.find(i => i.id === b.dataset.foto);
    openDialog({
      title: esc(f.title), body: '<p class="muted small" style="margin:0">Foto do mapa dos sonhos.</p>',
      submitLabel: '', danger: 'Apagar foto',
      onDanger: async () => { await deleteImage(f.image_path); await db.remove('goal_items', f.id); reload(); },
    });
  });
  main.querySelectorAll('[data-more]').forEach(b => b.onclick = () => {
    if (b.dataset.more === 'item') return itemDialog(g, null, its.length, reload);
    openDialog({
      title: 'Nova ideia', body: '<label>Ideia<input class="input" name="title" required maxlength="160"></label>',
      submitLabel: 'Adicionar',
      onSubmit: async fd => { await db.insert('goal_items', { goal_id: g.id, kind: 'ideia', title: fd.get('title').trim(), done: false, position: its.length }); reload(); },
    });
  });
}

// ============================================================
//  Diálogos
// ============================================================
function goalDialog(g, after) {
  const isNew = !g;
  g = g || { type: 'meta', area: 'outro' };
  const d = openDialog({
    title: isNew ? 'Nova meta ou sonho' : 'Editar',
    body: `
      <label>Nome<input class="input" name="title" required maxlength="120" value="${esc(g.title || '')}" placeholder="Ex: Aprender a tocar violão"></label>
      <div class="two">
        <label>Tipo<select class="input" name="type">${Object.entries(TYPES).map(([k, l]) => `<option value="${k}" ${g.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Área<select class="input" name="area">${Object.entries(AREAS).map(([k, a]) => `<option value="${k}" ${g.area === k ? 'selected' : ''}>${a.label}</option>`).join('')}</select></label>
      </div>
      <label>Descrição (opcional)<textarea class="input" name="description" rows="2" maxlength="600">${esc(g.description || '')}</textarea></label>
      <label class="dl-only">Prazo próprio (opcional — se vazio, usa a data da contagem)
        <input class="input" type="date" name="deadline" value="${g.deadline || ''}"></label>
      <details ${Number(g.target_value) > 0 ? 'open' : ''}><summary class="small muted">Juntar um valor em dinheiro (opcional)</summary>
        <div class="two" style="margin-top:8px">
          <label>Quero juntar (R$)<input class="input" name="target" inputmode="decimal" value="${g.target_value ?? ''}"></label>
          <label>Já tenho (R$)<input class="input" name="current" inputmode="decimal" value="${g.current_value ?? ''}"></label>
        </div></details>`,
    submitLabel: isNew ? 'Criar' : 'Salvar',
    danger: isNew ? null : 'Apagar meta',
    onSubmit: async fd => {
      const row = {
        title: fd.get('title').trim(), type: fd.get('type'), area: fd.get('area'),
        description: fd.get('description').trim() || null,
        deadline: fd.get('type') === 'meta' ? (fd.get('deadline') || null) : null,
        target_value: parseMoney(fd.get('target')), current_value: parseMoney(fd.get('current')),
      };
      if (isNew) {
        const all = await db.list('goals');
        const created = await db.insert('goals', { ...row, position: all.length, done: false });
        await after(created);
      } else {
        await db.update('goals', g.id, row);
        await after(g);
      }
    },
    onDanger: async () => {
      if (!confirm(`Apagar "${g.title}" com todos os marcos, itens e fotos? Não dá pra desfazer.`)) return;
      const its = await db.list('goal_items', { eq: { goal_id: g.id } });
      for (const i of its) { await deleteImage(i.image_path); await db.remove('goal_items', i.id); }
      await deleteImage(g.image_path);
      await db.remove('goals', g.id);
      location.hash = '#/futuro';
    },
  });
  const type = d.querySelector('[name=type]'), dl = d.querySelector('.dl-only');
  const sync = () => { dl.hidden = type.value !== 'meta'; };
  type.onchange = sync; sync();
}

function moneyDialog(g, after) {
  openDialog({
    title: 'Dinheiro',
    body: `<div class="two">
      <label>Quero juntar (R$)<input class="input" name="target" inputmode="decimal" required value="${g.target_value ?? ''}" placeholder="Ex: 1000"></label>
      <label>Já tenho (R$)<input class="input" name="current" inputmode="decimal" value="${g.current_value ?? ''}" placeholder="Ex: 150"></label></div>`,
    submitLabel: 'Salvar',
    onSubmit: async fd => {
      const t = parseMoney(fd.get('target'));
      if (!(t > 0)) { alert('Coloque um valor maior que zero.'); return false; }
      await db.update('goals', g.id, { target_value: t, current_value: parseMoney(fd.get('current')) });
      after();
    },
  });
}

function itemDialog(g, it, count, after) {
  const isNew = !it;
  const word = g.area === 'quarto' ? 'Já comprei' : 'Já conquistei';
  openDialog({
    title: isNew ? 'Novo item' : 'Editar item',
    body: `
      <label>Nome<input class="input" name="title" required maxlength="160" value="${esc(it?.title || '')}" placeholder="Ex: Cadeira gamer"></label>
      <label>Preço (R$, opcional)<input class="input" name="price" inputmode="decimal" value="${it?.price ?? ''}" placeholder="Ex: 1.299,90"></label>
      <label>${it?.image_path ? 'Trocar foto' : 'Foto (opcional)'}<input class="input" type="file" name="photo" accept="image/*"></label>
      ${isNew ? '' : `<label class="check"><input type="checkbox" name="done" ${it.done ? 'checked' : ''}> ${word}</label>`}
      <p class="small muted" style="margin:0">A foto é diminuída antes de enviar, pra economizar espaço (o plano grátis tem 1 GB).</p>`,
    submitLabel: isNew ? 'Adicionar' : 'Salvar',
    danger: isNew ? null : 'Apagar item',
    onSubmit: async fd => {
      const row = { title: fd.get('title').trim(), price: parseMoney(fd.get('price')) };
      if (!isNew) row.done = !!fd.get('done');
      const file = fd.get('photo');
      if (file && file.size) {
        try { row.image_path = await saveImage(file); } catch (e) { alert('Não consegui salvar a foto: ' + e.message); return false; }
        if (it?.image_path) await deleteImage(it.image_path);
      }
      if (isNew) await db.insert('goal_items', { goal_id: g.id, kind: 'item', done: false, position: count, ...row });
      else await db.update('goal_items', it.id, row);
      after();
    },
    onDanger: async () => { await deleteImage(it.image_path); await db.remove('goal_items', it.id); after(); },
  });
}

function photoDialog(goals, goalId, after) {
  if (!goals.length) { alert('Crie uma meta primeiro.'); return; }
  openDialog({
    title: 'Foto no mapa dos sonhos',
    body: `
      <label>Foto<input class="input" type="file" name="photo" accept="image/*" required></label>
      <label>Legenda<input class="input" name="title" maxlength="160" placeholder="Ex: O carro que eu quero"></label>
      <label>Leva para a meta<select class="input" name="goal">${goals.map(g => `<option value="${g.id}" ${g.id === goalId ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}</select></label>
      <p class="small muted" style="margin:0">A foto é diminuída antes de enviar, pra economizar espaço.</p>`,
    submitLabel: 'Adicionar',
    onSubmit: async fd => {
      const file = fd.get('photo');
      if (!file || !file.size) return false;
      let path;
      try { path = await saveImage(file); } catch (e) { alert('Não consegui salvar a foto: ' + e.message); return false; }
      const goal = fd.get('goal');
      await db.insert('goal_items', {
        goal_id: goal, kind: 'foto', title: fd.get('title').trim() || goals.find(g => g.id === goal)?.title || 'Foto',
        image_path: path, done: false, position: 0,
      });
      after();
    },
  });
}
