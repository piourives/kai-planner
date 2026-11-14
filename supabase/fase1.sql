-- ============================================================
--  KAI Planner — Fase 1: tabelas + segurança (RLS)
--  Como usar: Supabase > SQL Editor > New query > cole tudo > Run
--  Pode rodar de novo sem problema (não apaga nada).
-- ============================================================

-- Tarefas do dia (bloco "Hoje")
create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null check (char_length(title) <= 200),
  date       date not null,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);

-- Compromissos do calendário (prova, trabalho, estudo, treino, meta, data especial)
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null check (char_length(title) <= 200),
  kind       text not null check (kind in ('prova','trabalho','estudo','treino','meta','data')),
  date       date not null,
  notes      text,
  created_at timestamptz not null default now()
);

-- Registro dos hábitos (1 linha por hábito por dia; "value" = 1 feito, ou nº de copos de água)
create table if not exists public.habit_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_key  text not null,
  date       date not null,
  value      integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, habit_key, date)
);

create index if not exists tasks_user_date on public.tasks (user_id, date);
create index if not exists events_user_date on public.events (user_id, date);
create index if not exists habit_logs_user_date on public.habit_logs (user_id, date);

-- ---------- Row Level Security: cada linha só é vista/alterada pelo dono ----------
alter table public.tasks      enable row level security;
alter table public.events     enable row level security;
alter table public.habit_logs enable row level security;

drop policy if exists "dono" on public.tasks;
create policy "dono" on public.tasks for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dono" on public.events;
create policy "dono" on public.events for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dono" on public.habit_logs;
create policy "dono" on public.habit_logs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
