-- ============================================================
--  KAI Planner — Fase 4: Calendário
--  Como usar: Supabase > SQL Editor > New query > cole tudo > Run
--  Pode rodar de novo sem problema (não apaga nada).
--
--  Adiciona aos compromissos:
--   - end_date: data final (para viagens de vários dias)
--   - repeat:   'anual' = repete todo ano (aniversários)
-- ============================================================

alter table public.events add column if not exists end_date date;
alter table public.events add column if not exists repeat text;

alter table public.events drop constraint if exists events_repeat_check;
alter table public.events add constraint events_repeat_check
  check (repeat is null or repeat in ('anual'));

alter table public.events drop constraint if exists events_end_date_check;
alter table public.events add constraint events_end_date_check
  check (end_date is null or end_date >= date);

-- A segurança (RLS "dono") criada na Fase 1 continua valendo para essas colunas.
