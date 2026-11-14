// ============================================================
//  Importar — lê texto colado ou PDF (com texto) e procura
//  padrões simples: data, matéria, tipo e título. SEM IA.
//  Nada é salvo antes da tela de revisão.
// ============================================================
import { subjects } from './settings.js';
import { iso, todayISO, diffDays } from './util.js';

// Palavras que indicam cada matéria (sem acento, minúsculas)
const ALIASES = {
  mat: ['matematica', 'matematicas', 'mat.', 'math'],
  fis: ['fisica', 'fis.', 'physics'],
  qui: ['quimica', 'qui.', 'quim', 'chemistry'],
  inf: ['informatica', 'computacion', 'computacao', 'info'],
  ana: ['analisis', 'analise'],
  esp: ['espanhol', 'espanol', 'castellano', 'lengua', 'literatura'],
  ing: ['ingles', 'english'],
  fra: ['frances', 'francais', 'french'],
  soc: ['sociales', 'historia', 'geografia', 'sociais'],
  edf: ['educacao fisica', 'educacion fisica', 'ed. fisica', 'ed fisica', 'gimnasia'],
  art: ['artistica', 'artes', 'arte', 'educacao artistica', 'educacion artistica', 'musica', 'plastica'],
  fh:  ['formacao humana', 'formacion humana', 'religion', 'religiao', 'catequesis'],
  ori: ['orientacao', 'orientacion', 'tutoria'],
};

const PROVA = ['prova', 'examen', 'exame', 'teste', 'test', 'evaluacion', 'avaliacao', 'parcial', 'escrito', 'oral', 'quiz', 'recuperacao', 'recuperatorio'];
const TRABALHO = ['trabalho', 'trabajo', 'tarea', 'tp', 'entrega', 'proyecto', 'projeto', 'apresentacao', 'presentacion', 'exposicion', 'informe', 'relatorio', 'seminario'];

const MESES = {
  jan: 1, janeiro: 1, enero: 1, fev: 2, fevereiro: 2, feb: 2, febrero: 2, mar: 3, marco: 3, marzo: 3,
  abr: 4, abril: 4, mai: 5, maio: 5, may: 5, mayo: 5, jun: 6, junho: 6, junio: 6, jul: 7, julho: 7, julio: 7,
  ago: 8, agosto: 8, set: 9, setembro: 9, sep: 9, sept: 9, septiembre: 9, setiembre: 9,
  out: 10, outubro: 10, oct: 10, octubre: 10, nov: 11, novembro: 11, noviembre: 11,
  dez: 12, dezembro: 12, dic: 12, diciembre: 12,
};

const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Ano: se não vier, usa o próximo dia/mês que ainda não passou (com folga de 30 dias)
function makeDate(d, m, y) {
  if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12)) return null;
  const today = todayISO();
  if (y) { if (y < 100) y += 2000; return iso(new Date(y, m - 1, d)); }
  let year = Number(today.slice(0, 4));
  let date = iso(new Date(year, m - 1, d));
  if (diffDays(date, today) > 30) date = iso(new Date(year + 1, m - 1, d));
  return date;
}

function findDate(line) {
  const n = norm(line);
  let m = n.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/);
  if (m) {
    const date = makeDate(+m[1], +m[2], m[3] ? +m[3] : null);
    if (date) return { date, match: m[0] };
  }
  m = n.match(/\b(\d{1,2})\s*(?:de\s+)?([a-z]{3,10})\.?(?:\s+(?:de\s+)?(\d{4}))?/);
  if (m && MESES[m[2]]) {
    const date = makeDate(+m[1], MESES[m[2]], m[3] ? +m[3] : null);
    if (date) return { date, match: m[0] };
  }
  return null;
}

function findSubject(line) {
  const n = ' ' + norm(line) + ' ';
  // primeiro os nomes compostos (ed. física antes de física)
  const order = ['edf', 'art', 'fh', ...Object.keys(ALIASES).filter(k => !['edf', 'art', 'fh'].includes(k))];
  for (const key of order) {
    if (!subjects().some(s => s.key === key)) continue;
    if (ALIASES[key].some(a => new RegExp(`(^|[^a-z])${a.replace('.', '\\.')}([^a-z]|$)`).test(n))) return key;
  }
  // nomes das matérias cadastradas (caso tenham mudado nas configurações)
  const s = subjects().find(s => n.includes(norm(s.name)));
  return s?.key || '';
}

function findKind(line) {
  const n = norm(line);
  const has = list => list.some(w => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(n));
  if (has(TRABALHO)) return 'trabalho';
  if (has(PROVA)) return 'prova';
  return 'prova';
}

// Recebe um texto e devolve uma lista de itens detectados
export function parseText(text) {
  const lines = text.split(/\r?\n|;|•/).map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l.length > 3);
  const items = [];
  let lastSubject = '';
  for (const line of lines) {
    const sub = findSubject(line);
    const dt = findDate(line);
    if (!dt) { if (sub) lastSubject = sub; continue; } // linha de título/cabeçalho com matéria
    const subject = sub || lastSubject;
    let title = line.replace(new RegExp(dt.match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
      .replace(/\s{2,}/g, ' ').replace(/^[\s\-–:,.|]+|[\s\-–:,.|]+$/g, '').trim();
    if (!title) title = findKind(line) === 'trabalho' ? 'Trabalho' : 'Prova';
    items.push({
      include: true,
      title: title.slice(0, 120),
      subject,
      kind: findKind(line),
      date: dt.date,
      urgency: 'medio',
      lab: /\blab/i.test(line),
      source: line,
    });
  }
  return items;
}

// ---------- PDF ----------
let pdfjs = null;
function loadPdfJs() {
  if (pdfjs) return Promise.resolve(pdfjs);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => {
      pdfjs = window.pdfjsLib;
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(pdfjs);
    };
    s.onerror = () => reject(new Error('Não consegui carregar o leitor de PDF (precisa de internet).'));
    document.head.appendChild(s);
  });
}

// Extrai o texto de um PDF, mantendo as quebras de linha
export async function pdfToText(file) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  let out = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let lastY = null;
    for (const it of content.items) {
      const y = it.transform?.[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) out += '\n';
      out += it.str;
      if (it.hasEOL) out += '\n';
      lastY = y;
    }
    out += '\n';
  }
  return out.replace(/\n{2,}/g, '\n').trim();
}
