// ============================================================
//  Valores padrão do app.
//  Na primeira vez o app usa estes valores. Quando você mudar
//  algo nas Configurações (Fase 6), a sua versão fica salva na
//  sua conta (tabela "settings") e passa a valer no lugar destes.
// ============================================================

// Matérias: key (código), nome, sigla, cor da bolinha, se é difícil
export const SUBJECTS = [
  { key: 'mat', name: 'Matemática',          short: 'MAT', color: '#5b8def', hard: true },
  { key: 'fis', name: 'Física',              short: 'FÍS', color: '#a78bfa', hard: true, lab: true },
  { key: 'qui', name: 'Química',             short: 'QUÍ', color: '#34d399', hard: true, lab: true },
  { key: 'inf', name: 'Informática',         short: 'INF', color: '#94a3b8' },
  { key: 'ana', name: 'Análisis',            short: 'ANÁ', color: '#22d3ee' },
  { key: 'esp', name: 'Espanhol',            short: 'ESP', color: '#fbbf24' },
  { key: 'ing', name: 'Inglês',              short: 'ING', color: '#f87171' },
  { key: 'fra', name: 'Francês',             short: 'FRA', color: '#f472b6' },
  { key: 'soc', name: 'Sociales',            short: 'SOC', color: '#fb923c' },
  { key: 'edf', name: 'Educação Física',     short: 'EDF', color: '#a3e635' },
  { key: 'art', name: 'Educação Artística',  short: 'ART', color: '#e879f9' },
  { key: 'fh',  name: 'Formação Humana',     short: 'FH',  color: '#2dd4bf' },
  { key: 'ori', name: 'Orientação',          short: 'ORI', color: '#d6d3d1' },
];

// Horários das aulas (null = recreio)
export const PERIODS = [
  ['07:30', '08:20'], ['08:20', '09:05'], ['09:05', '09:50'], ['09:50', '10:35'],
  null,
  ['11:00', '11:40'], ['11:40', '12:25'],
  null,
  ['13:10', '13:45'], ['13:45', '14:20'], ['14:20', '15:00'],
];

// Grade semanal: 1=Seg ... 5=Sex. Cada item: [início, fim, matéria, lab?]  (matéria null = recreio)
const R = (a, b) => [a, b, null];
export const TIMETABLE = {
  1: [['07:30','08:20','inf'],['08:20','09:05','esp'],['09:05','09:50','esp'],['09:50','10:35','ing'],R('10:35','11:00'),
      ['11:00','11:40','soc'],['11:40','12:25','mat'],R('12:25','13:10'),['13:10','13:45','mat'],['13:45','14:20','fra'],['14:20','15:00','fra']],
  2: [['07:30','08:20','ing'],['08:20','09:05','esp'],['09:05','09:50','edf'],['09:50','10:35','art'],R('10:35','11:00'),
      ['11:00','11:40','mat'],['11:40','12:25','mat'],R('12:25','13:10'),['13:10','13:45','fis'],['13:45','14:20','soc'],['14:20','15:00','fh']],
  3: [['07:30','08:20','fra'],['08:20','09:05','qui'],['09:05','09:50','esp'],['09:50','10:35','esp'],R('10:35','11:00'),
      ['11:00','11:40','soc'],['11:40','12:25','ing'],R('12:25','13:10'),['13:10','13:45','mat'],['13:45','14:20','mat'],['14:20','15:00','esp']],
  4: [['07:30','08:20','ana'],['08:20','09:05','mat'],['09:05','09:50','fis'],['09:50','10:35','fis'],R('10:35','11:00'),
      ['11:00','11:40','ori'],['11:40','12:25','edf'],R('12:25','13:10'),['13:10','13:45','art'],['13:45','14:20','ing'],['14:20','15:00','soc']],
  5: [['07:30','08:20','fis',true],['08:20','09:05','fis',true],['09:05','09:50','qui',true],['09:50','10:35','qui',true],R('10:35','11:00'),
      ['11:00','11:40','qui'],['11:40','12:25','ing'],['12:25','13:10','fra'],['13:10','13:45','qui']],
};

// Rotina fora da escola. Dias: 0=Dom 1=Seg ... 6=Sáb
// "free" = janelas em que dá pra estudar; "busy" = compromissos fixos dentro delas.
export const ROUTINE = {
  free: {
    0: [['09:00', '12:00'], ['14:00', '22:00']],
    1: [['17:30', '22:00']],
    2: [['15:30', '22:00']],
    3: [['16:30', '22:00']],
    4: [['15:30', '22:00']],
    5: [['14:30', '22:00']],
    6: [['09:00', '12:00'], ['14:00', '22:00']],
  },
  busy: [
    { days: [2, 4], from: '16:00', to: '17:00', label: 'Inglês (curso)' },
    { days: [0, 1, 2, 3, 4, 5, 6], from: '18:00', to: '18:30', label: 'Lanche' },
  ],
  training: { from: '19:00', to: '20:30', label: 'Treino' },
  notes: {
    1: 'Sai às 17:00 (espera o futebol, 16–17h) · em casa ~17:30',
    2: 'Sai às 15:00 · em casa ~15:30 · inglês 16–17h',
    3: 'Sai às 15:00 · espera o futebol até 16:00 · em casa ~16:30',
    4: 'Sai às 15:00 · em casa ~15:30 · inglês 16–17h',
    5: 'Sai ~14:00 · tarde livre',
  },
};

// Regras do estudo automático
export const STUDY_RULES = {
  hours: { urgente: 4, medio: 3, gg: 2 },          // horas por dia
  daysHard: { urgente: 4, medio: 3, gg: 3 },       // dias antes (matérias difíceis)
  daysNormal: 2,                                   // dias antes (outras)
  minDays: 2,
  blockMax: 2,                                     // horas seguidas no máximo (depois, pausa de 30 min)
};

export const URGENCY = {
  urgente: { label: 'Urgente', emoji: '🔴', hint: 'não entendi nada' },
  medio:   { label: 'Mais ou menos', emoji: '🟡', hint: 'sei um pouco, preciso estudar' },
  gg:      { label: 'GG', emoji: '🟢', hint: 'só revisar' },
};

export const STATUS = {
  a_fazer:   'A fazer',
  estudando: 'Estudando',
  feito:     'Feito',
};

export const PASS_PCT = 70;

// Dia em que foi feito um Treino A (base da sequência dia sim / dia não).
// Na Fase 3 isso passa a ser calculado pelos treinos que você marcar.
export const TRAINING_ANCHOR = '2026-11-14';

export const DEFAULTS = {
  subjects: SUBJECTS,
  timetable: TIMETABLE,
  routine: ROUTINE,
  study_rules: STUDY_RULES,
  pass_pct: PASS_PCT,
  training_anchor: TRAINING_ANCHOR,
};
