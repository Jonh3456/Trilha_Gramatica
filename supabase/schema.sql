-- ============================================================================
-- Trilha Gramatical — esquema Supabase
-- Cole este script inteiro no SQL Editor do seu projeto Supabase e clique "Run".
-- Ele cria a tabela de progresso do usuário e as políticas de segurança (RLS)
-- para que cada pessoa só possa ler/gravar o próprio progresso.
-- ============================================================================

-- 1) Tabela de progresso (1 linha por usuário autenticado)
create table if not exists public.progress (
  user_id uuid references auth.users(id) on delete cascade primary key,
  score integer not null default 0,
  energy integer not null default 100,
  units_completed jsonb not null default '{}'::jsonb,
  last_unit text,
  updated_at timestamptz not null default now()
);

-- 2) Habilita Row Level Security (obrigatório para proteger os dados)
alter table public.progress enable row level security;

-- 3) Políticas: cada usuário só enxerga e edita a própria linha
drop policy if exists "select_own_progress" on public.progress;
create policy "select_own_progress"
  on public.progress for select
  using (auth.uid() = user_id);

drop policy if exists "insert_own_progress" on public.progress;
create policy "insert_own_progress"
  on public.progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "update_own_progress" on public.progress;
create policy "update_own_progress"
  on public.progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4) Atualiza automaticamente o campo updated_at a cada gravação
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_progress_updated_at on public.progress;
create trigger trg_progress_updated_at
  before update on public.progress
  for each row execute function public.set_updated_at();
