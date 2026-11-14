-- ============================================================
--  KAI Planner — Fase 3 (Academia)
--  Como usar: Supabase > SQL Editor > New query > cole tudo > Run
--  (O aviso "destructive operations" pode aparecer: é só porque
--   ele recria as regras de segurança. Não apaga dados.)
-- ============================================================

-- Um registro por dia de treino (checks dos exercícios, trocas, se foi concluído)
create table if not exists public.workout_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date       date not null,
  workout    text not null check (workout in ('A','B','C')),
  checks     jsonb not null default '{}'::jsonb,
  swaps      jsonb not null default '{}'::jsonb,
  done       boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- Cargas por exercício
create table if not exists public.load_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date         date not null,
  exercise_key text not null,
  weight       numeric,
  reps         text,
  sets         integer,
  note         text,
  created_at   timestamptz not null default now()
);

-- Peso e medidas (só acompanhamento)
create table if not exists public.body_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date       date not null,
  weight     numeric,
  waist      numeric,
  arm        numeric,
  chest      numeric,
  created_at timestamptz not null default now()
);

-- Vídeo/imagem "como fazer" de cada exercício
create table if not exists public.exercise_media (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise_key text not null,
  path         text not null,
  mime         text,
  size         bigint not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists workout_logs_user_date on public.workout_logs (user_id, date);
create index if not exists load_logs_user_ex on public.load_logs (user_id, exercise_key, date);

-- ---------- Segurança (RLS): só o dono vê ----------
alter table public.workout_logs   enable row level security;
alter table public.load_logs      enable row level security;
alter table public.body_logs      enable row level security;
alter table public.exercise_media enable row level security;

drop policy if exists "dono" on public.workout_logs;
create policy "dono" on public.workout_logs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "dono" on public.load_logs;
create policy "dono" on public.load_logs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "dono" on public.body_logs;
create policy "dono" on public.body_logs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "dono" on public.exercise_media;
create policy "dono" on public.exercise_media for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Pasta PRIVADA para vídeos e imagens (até 50 MB por arquivo) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('midia', 'midia', false, 52428800,
        array['video/mp4', 'video/webm', 'video/quicktime', 'image/gif', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "midia: ler o que é meu"    on storage.objects;
drop policy if exists "midia: enviar pra mim"     on storage.objects;
drop policy if exists "midia: apagar o que é meu" on storage.objects;

create policy "midia: ler o que é meu" on storage.objects for select to authenticated
  using (bucket_id = 'midia' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "midia: enviar pra mim" on storage.objects for insert to authenticated
  with check (bucket_id = 'midia' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "midia: apagar o que é meu" on storage.objects for delete to authenticated
  using (bucket_id = 'midia' and (storage.foldername(name))[1] = auth.uid()::text);
