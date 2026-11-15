// ============================================================
//  Fotos das metas e sonhos
//  - Antes de enviar, a foto é diminuída (máx. 1600 px, JPEG),
//    pra gastar pouco do espaço grátis do Supabase.
//  - Nuvem: vai para a pasta privada "sonhos/<seu id>/...".
//  - Modo local (teste): fica guardada no navegador, bem pequena.
// ============================================================
import * as db from './db.js';

const BUCKET = 'sonhos';
const cache = new Map(); // caminho -> { url, até quando vale }

// Diminui a foto. GIF fica como está (pra não perder a animação).
async function shrink(file, max) {
  if (file.type === 'image/gif') return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
  return blob && blob.size < file.size ? new File([blob], 'foto.jpg', { type: 'image/jpeg' }) : file;
}

// Envia uma foto e devolve o "caminho" para guardar na tabela
export async function saveImage(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem (JPG, PNG, WEBP ou GIF).');
  if (file.size > 10 * 1024 * 1024 && file.type === 'image/gif') throw new Error('GIF muito grande (máx. 10 MB).');
  if (!db.isCloud()) {
    const small = await shrink(file, 700);
    return await new Promise((ok, fail) => {
      const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = fail; r.readAsDataURL(small);
    });
  }
  const img = await shrink(file, 1600);
  const ext = img.type === 'image/gif' ? 'gif' : img.type === 'image/png' ? 'png' : img.type === 'image/webp' ? 'webp' : 'jpg';
  return db.uploadFile(BUCKET, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`, img);
}

// Links para mostrar as fotos: { caminho: url }
export async function imageUrls(paths) {
  const out = {}, need = [];
  const now = Date.now();
  for (const p of new Set(paths.filter(Boolean))) {
    if (p.startsWith('data:')) out[p] = p;
    else if (cache.get(p)?.until > now) out[p] = cache.get(p).url;
    else need.push(p);
  }
  if (need.length && db.isCloud()) {
    try {
      const got = await db.fileUrls(BUCKET, need);
      for (const [p, url] of Object.entries(got)) { out[p] = url; cache.set(p, { url, until: now + 50 * 60 * 1000 }); }
    } catch { /* sem foto, sem problema */ }
  }
  return out;
}

export async function deleteImage(path) {
  if (!path || path.startsWith('data:')) return;
  cache.delete(path);
  await db.removeFile(BUCKET, path).catch(() => {});
}
