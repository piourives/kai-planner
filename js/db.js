// ============================================================
//  Camada de dados
//  - Se o config.js tiver URL e chave: usa o Supabase (nuvem,
//    sincroniza celular e computador, com login).
//  - Se não tiver: "modo local", salva só neste navegador.
//  As telas usam sempre as mesmas funções (list, insert, ...),
//  então não precisam saber qual modo está ativo.
// ============================================================
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

let supa = null;
let user = null;

export const isCloud = () => !!supa;
export const currentUser = () => user;

export async function initDB() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  // Só para testes no computador: http://localhost:5173/?local usa o modo local
  if (location.hostname === 'localhost' && new URLSearchParams(location.search).has('local')) return;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  const { data } = await supa.auth.getSession();
  user = data.session?.user ?? null;
  supa.auth.onAuthStateChange((_evt, session) => { user = session?.user ?? null; });
}

// ---------- Login ----------
export async function signIn(email, password) {
  const { error } = await supa.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const { data } = await supa.auth.getSession();
  user = data.session?.user ?? null;
}
export async function signUp(email, password) {
  const { data, error } = await supa.auth.signUp({ email, password });
  if (error) throw error;
  user = data.session?.user ?? null;
  return !!data.session; // false = precisa confirmar o e-mail
}
export async function signOut() {
  if (supa) await supa.auth.signOut();
  user = null;
}

// ---------- Perfil (nome) ----------
// O nome NÃO fica no código: fica na sua conta (ou no navegador, no modo local).
export function getName() {
  if (supa) return user?.user_metadata?.name || '';
  return localStorage.getItem('kai:name') || '';
}
export async function setName(name) {
  if (supa) {
    const { data, error } = await supa.auth.updateUser({ data: { name } });
    if (error) throw error;
    user = data.user;
  } else {
    localStorage.setItem('kai:name', name);
  }
}

// ---------- Operações nas tabelas ----------
// filtros: { eq:{campo:valor}, gte:{}, lte:{}, lt:{}, in:{campo:[...]}, order:'campo', asc:true }

function localLoad(table) {
  try { return JSON.parse(localStorage.getItem('kai:' + table) || '[]'); } catch { return []; }
}
function localSave(table, rows) { localStorage.setItem('kai:' + table, JSON.stringify(rows)); }

function localMatch(r, f = {}) {
  for (const [k, v] of Object.entries(f.eq || {})) if (r[k] !== v) return false;
  for (const [k, v] of Object.entries(f.gte || {})) if (!(r[k] >= v)) return false;
  for (const [k, v] of Object.entries(f.lte || {})) if (!(r[k] <= v)) return false;
  for (const [k, v] of Object.entries(f.lt || {})) if (!(r[k] < v)) return false;
  for (const [k, v] of Object.entries(f.in || {})) if (!v.includes(r[k])) return false;
  return true;
}

export async function list(table, f = {}) {
  if (supa) {
    let q = supa.from(table).select('*');
    for (const [k, v] of Object.entries(f.eq || {})) q = q.eq(k, v);
    for (const [k, v] of Object.entries(f.gte || {})) q = q.gte(k, v);
    for (const [k, v] of Object.entries(f.lte || {})) q = q.lte(k, v);
    for (const [k, v] of Object.entries(f.lt || {})) q = q.lt(k, v);
    for (const [k, v] of Object.entries(f.in || {})) q = q.in(k, v);
    if (f.order) q = q.order(f.order, { ascending: f.asc !== false });
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
  let rows = localLoad(table).filter(r => localMatch(r, f));
  if (f.order) {
    const dir = f.asc === false ? -1 : 1;
    rows.sort((a, b) => (a[f.order] > b[f.order] ? dir : a[f.order] < b[f.order] ? -dir : 0));
  }
  return rows;
}

export async function insert(table, row) {
  if (supa) {
    const { data, error } = await supa.from(table).insert({ ...row, user_id: user.id }).select().single();
    if (error) throw error;
    return data;
  }
  const rows = localLoad(table);
  const r = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
  rows.push(r); localSave(table, rows);
  return r;
}

export async function update(table, id, patch) {
  if (supa) {
    const { error } = await supa.from(table).update(patch).eq('id', id);
    if (error) throw error;
    return;
  }
  const rows = localLoad(table).map(r => (r.id === id ? { ...r, ...patch } : r));
  localSave(table, rows);
}

export async function remove(table, id) {
  if (supa) {
    const { error } = await supa.from(table).delete().eq('id', id);
    if (error) throw error;
    return;
  }
  localSave(table, localLoad(table).filter(r => r.id !== id));
}

// ---------- Arquivos (Supabase Storage, pastas privadas) ----------
// Os arquivos ficam em <bucket>/<id do usuário>/... e só o dono acessa.
export async function uploadFile(bucket, path, file) {
  if (!supa) throw new Error('Enviar arquivos precisa do Supabase (não funciona no modo local).');
  const full = `${user.id}/${path}`;
  const { error } = await supa.storage.from(bucket).upload(full, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return full;
}
export async function fileUrl(bucket, fullPath) {
  const { data, error } = await supa.storage.from(bucket).createSignedUrl(fullPath, 3600);
  if (error) throw error;
  return data.signedUrl;
}
// Vários links de uma vez (para o mural de fotos)
export async function fileUrls(bucket, paths) {
  if (!paths.length) return {};
  const { data, error } = await supa.storage.from(bucket).createSignedUrls(paths, 3600);
  if (error) throw error;
  const out = {};
  data.forEach(d => { if (d.signedUrl) out[d.path] = d.signedUrl; });
  return out;
}
export async function removeFile(bucket, fullPath) {
  if (!supa) return;
  await supa.storage.from(bucket).remove([fullPath]);
}

// ---------- Backup ----------
// Apaga todas as SUAS linhas de uma tabela
export async function clearTable(table) {
  if (supa) {
    const { error } = await supa.from(table).delete().eq('user_id', user.id);
    if (error) throw error;
    return;
  }
  localStorage.removeItem('kai:' + table);
}
// Coloca várias linhas de uma vez (mantém os ids, para as ligações continuarem certas)
export async function bulkInsert(table, rows) {
  if (!rows.length) return;
  if (supa) {
    for (let i = 0; i < rows.length; i += 500) {
      const part = rows.slice(i, i + 500).map(r => ({ ...r, user_id: user.id }));
      const { error } = await supa.from(table).insert(part);
      if (error) throw error;
    }
    return;
  }
  localSave(table, [...localLoad(table), ...rows]);
}
// Lista todos os seus arquivos de uma pasta (com subpastas): [{path, size}]
export async function listFiles(bucket, prefix = '') {
  if (!supa) return [];
  const base = prefix ? `${user.id}/${prefix}` : user.id;
  const out = [];
  const walk = async dir => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supa.storage.from(bucket).list(dir, { limit: 1000, offset });
      if (error) throw error;
      for (const f of data) {
        if (f.id === null) await walk(`${dir}/${f.name}`); // é uma pasta
        else out.push({ path: `${dir}/${f.name}`, size: f.metadata?.size || 0 });
      }
      if (data.length < 1000) break;
    }
  };
  await walk(base);
  return out;
}
export async function removeFiles(bucket, paths) {
  if (!supa) return;
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supa.storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) throw error;
  }
}

// Cria ou atualiza a linha que tem os mesmos valores nas colunas "keys".
export async function upsert(table, row, keys) {
  if (supa) {
    const { error } = await supa.from(table)
      .upsert({ ...row, user_id: user.id }, { onConflict: ['user_id', ...keys].join(',') });
    if (error) throw error;
    return;
  }
  const rows = localLoad(table);
  const i = rows.findIndex(r => keys.every(k => r[k] === row[k]));
  if (i >= 0) rows[i] = { ...rows[i], ...row };
  else rows.push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row });
  localSave(table, rows);
}
