-- ============================================================
--  KAI Planner — Fase 2 (Escola)
--  Como usar: Supabase > SQL Editor > New query > cole tudo > Run
--  (Se aparecer o aviso "destructive operations", pode rodar:
--   ele só recria as regras de segurança, não apaga dados.)
-- ============================================================

-- ---------- Provas, trabalhos e blocos de estudo (na tabela events) ----------
alter table public.events add column if not exists subject    text;
alter table public.events add column if not exists lab        boolean not null default false;
alter table public.events add column if not exists status     text not null default 'a_fazer';
alter table public.events add column if not exists urgency    text;
alter table public.events add column if not exists content    text;                  -- "o que vai cair"
alter table public.events add column if not exists topics     jsonb not null default '[]'::jsonb;
alter table public.events add column if not exists parent_id  uuid references public.events (id) on delete cascade;
alter table public.events add column if not exists start_time text;                  -- "16:30"
alter table public.events add column if not exists end_time   text;
alter table public.events add column if not exists done       boolean not null default false;
alter table public.events add column if not exists plan_note  text;                  -- avisos do estudo automático
alter table public.events add column if not exists surprise   boolean not null default false;
create index if not exists events_parent on public.events (parent_id);

-- ---------- Notas ----------
create table if not exists public.grades (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject    text not null,
  name       text not null check (char_length(name) <= 120),
  max        numeric not null check (max > 0),
  score      numeric,
  pass_pct   numeric not null default 70,
  date       date,
  event_id   uuid references public.events (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Materiais (PDFs ligados a uma prova) ----------
create table if not exists public.materials (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_id   uuid references public.events (id) on delete cascade,
  name       text not null,
  path       text not null,
  size       bigint not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- Configurações (matérias, grade, rotina, regras) ----------
create table if not exists public.settings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key        text not null,
  value      jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);

-- ---------- Segurança (RLS): só o dono vê ----------
alter table public.grades    enable row level security;
alter table public.materials enable row level security;
alter table public.settings  enable row level security;

drop policy if exists "dono" on public.grades;
create policy "dono" on public.grades for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dono" on public.materials;
create policy "dono" on public.materials for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dono" on public.settings;
create policy "dono" on public.settings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Pasta PRIVADA para os PDFs (até 50 MB por arquivo) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('materiais', 'materiais', false, 52428800,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Cada pessoa só mexe na própria pasta (o nome da pasta é o id do usuário)
drop policy if exists "materiais: ler o que é meu"    on storage.objects;
drop policy if exists "materiais: enviar pra mim"     on storage.objects;
drop policy if exists "materiais: apagar o que é meu" on storage.objects;

create policy "materiais: ler o que é meu" on storage.objects for select to authenticated
  using (bucket_id = 'materiais' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "materiais: enviar pra mim" on storage.objects for insert to authenticated
  with check (bucket_id = 'materiais' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "materiais: apagar o que é meu" on storage.objects for delete to authenticated
  using (bucket_id = 'materiais' and (storage.foldername(name))[1] = auth.uid()::text);
