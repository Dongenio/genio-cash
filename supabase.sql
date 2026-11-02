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


-- ===== v3: categorias que você cria =====
create table if not exists public.categorias (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo       text not null check (tipo in ('entrada','saida')),
  nome       text not null check (char_length(nome) between 1 and 24),
  criado_em  timestamptz not null default now(),
  unique (user_id, tipo, nome)
);

alter table public.categorias enable row level security;

create policy "ver as minhas"    on public.categorias for select using (auth.uid() = user_id);
create policy "criar as minhas"  on public.categorias for insert with check (auth.uid() = user_id);
create policy "apagar as minhas" on public.categorias for delete using (auth.uid() = user_id);


-- ===== v6: contas do mês =====
create table if not exists public.contas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome       text not null check (char_length(nome) between 1 and 40),
  valor      integer not null default 0 check (valor >= 0),      -- centavos; previsto
  variavel   boolean not null default false,                     -- luz, cartão: muda todo mês
  dia        integer not null check (dia between 1 and 31),      -- dia do vencimento
  categoria  text not null default 'Contas',
  inicio     text not null check (inicio ~ '^[0-9]{4}-[0-9]{2}$'),            -- "AAAA-MM"
  fim        text check (fim is null or fim ~ '^[0-9]{4}-[0-9]{2}$'),          -- parou de cobrar depois deste mês
  parcelas   integer check (parcelas is null or parcelas >= 1),  -- null = todo mês; 1 = só um mês
  criado_em  timestamptz not null default now()
);
alter table public.contas enable row level security;
create policy "ver minhas contas"    on public.contas for select using (auth.uid() = user_id);
create policy "criar minhas contas"  on public.contas for insert with check (auth.uid() = user_id);
create policy "editar minhas contas" on public.contas for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "apagar minhas contas" on public.contas for delete using (auth.uid() = user_id);

create table if not exists public.pagamentos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conta_id      uuid not null references public.contas(id) on delete cascade,
  mes           text not null check (mes ~ '^[0-9]{4}-[0-9]{2}$'),
  valor         integer not null check (valor > 0),
  pago_em       date not null,
  lancamento_id uuid references public.lancamentos(id) on delete cascade,  -- apagou a saída? a conta volta pra "a pagar"
  criado_em     timestamptz not null default now(),
  unique (conta_id, mes)
);
alter table public.pagamentos enable row level security;
create policy "ver meus pagamentos"    on public.pagamentos for select using (auth.uid() = user_id);
create policy "criar meus pagamentos"  on public.pagamentos for insert with check (auth.uid() = user_id);
create policy "apagar meus pagamentos" on public.pagamentos for delete using (auth.uid() = user_id);
