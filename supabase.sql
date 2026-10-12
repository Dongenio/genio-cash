-- Gênio $ — cria a tabela de lançamentos
-- Cole tudo no Supabase > SQL Editor > New query > Run

create table if not exists public.lancamentos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo       text not null check (tipo in ('entrada','saida')),
  valor      integer not null check (valor > 0),          -- em centavos: 2590 = R$ 25,90
  descricao  text default '',
  categoria  text not null default 'Outros',
  data       date not null,
  criado_em  timestamptz not null default now()
);

create index if not exists lancamentos_user_data on public.lancamentos (user_id, data desc);

-- Segurança: cada pessoa só enxerga e mexe nos PRÓPRIOS lançamentos
alter table public.lancamentos enable row level security;

create policy "ver os meus"     on public.lancamentos for select using (auth.uid() = user_id);
create policy "criar os meus"   on public.lancamentos for insert with check (auth.uid() = user_id);
create policy "editar os meus"  on public.lancamentos for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "apagar os meus"  on public.lancamentos for delete using (auth.uid() = user_id);
