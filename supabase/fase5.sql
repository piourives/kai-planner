-- ============================================================
--  KAI Planner — Fase 5: Futuro (metas, sonhos e mapa dos sonhos)
--  Como usar: Supabase > SQL Editor > New query > cole tudo > Run
--  Pode rodar de novo sem problema (não apaga nada).
-- ============================================================

-- Metas (prazo de 3 anos) e sonhos (sem prazo)
create table if not exists public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title         text not null check (char_length(title) <= 120),
  type          text not null default 'meta' check (type in ('meta','sonho')),
  area          text not null default 'outro' check (area in ('corpo','escola','dinheiro','quarto','outro')),
  description   text,
  deadline      date,
  image_path    text,
  target_value  numeric,
  current_value numeric,
  position      integer not null default 0,
  done          boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Coisas dentro de cada meta: marcos, ideias, itens (com foto e preço) e fotos do mapa
create table if not exists public.goal_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id    uuid not null references public.goals (id) on delete cascade,
  kind       text not null check (kind in ('marco','ideia','item','foto')),
  title      text not null check (char_length(title) <= 160),
  price      numeric,
  image_path text,
  done       boolean not null default false,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists goals_user on public.goals (user_id);
create index if not exists goal_items_goal on public.goal_items (user_id, goal_id);

-- ---------- Segurança: cada linha só é vista/alterada pelo dono ----------
alter table public.goals      enable row level security;
alter table public.goal_items enable row level security;

drop policy if exists "dono" on public.goals;
create policy "dono" on public.goals for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dono" on public.goal_items;
create policy "dono" on public.goal_items for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Fotos: pasta privada "sonhos" (só imagens, até 10 MB cada) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sonhos', 'sonhos', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "sonhos: ver as minhas" on storage.objects;
create policy "sonhos: ver as minhas" on storage.objects for select to authenticated
  using (bucket_id = 'sonhos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "sonhos: enviar nas minhas" on storage.objects;
create policy "sonhos: enviar nas minhas" on storage.objects for insert to authenticated
  with check (bucket_id = 'sonhos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "sonhos: apagar as minhas" on storage.objects;
create policy "sonhos: apagar as minhas" on storage.objects for delete to authenticated
  using (bucket_id = 'sonhos' and (storage.foldername(name))[1] = auth.uid()::text);
