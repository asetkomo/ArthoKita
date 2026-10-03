-- Dompetku schema. Jalankan sekali di Supabase SQL Editor.
-- Semua akses data lewat server (service role). RLS aktif tanpa policy =
-- anon/authenticated tidak bisa membaca apa pun dari browser.

create extension if not exists pgcrypto;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'bank' check (type in ('bank','ewallet','cash','credit_card','investment','other')),
  currency text not null default 'IDR' check (currency in ('IDR','USD')),
  initial_balance numeric(18,2) not null default 0,
  color text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('income','expense')),
  color text,
  created_at timestamptz not null default now(),
  unique (name, kind)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('income','expense','transfer')),
  amount numeric(18,2) not null check (amount > 0),
  currency text not null default 'IDR' check (currency in ('IDR','USD')),
  amount_idr numeric(18,2) not null,
  account_id uuid references public.accounts(id) on delete set null,
  to_account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  description text,
  merchant text,
  occurred_at date not null default current_date,
  source text not null default 'web',
  items jsonb,
  notes text,
  raw jsonb,
  receipt_path text,
  created_at timestamptz not null default now()
);
-- Jika tabel transactions sudah dibuat sebelumnya, jalankan:
-- alter table public.transactions add column if not exists receipt_path text;
create index if not exists transactions_occurred_idx on public.transactions (occurred_at desc);
create index if not exists transactions_category_idx on public.transactions (category_id);
create index if not exists transactions_account_idx on public.transactions (account_id);

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider text,
  kind text not null default 'paylater' check (kind in ('paylater','loan','credit_card','personal','other')),
  currency text not null default 'IDR' check (currency in ('IDR','USD')),
  total_amount numeric(18,2) not null,
  installment_amount numeric(18,2) not null,
  total_installments int not null check (total_installments > 0),
  start_date date not null,
  due_day int not null check (due_day between 1 and 31),
  interest_rate numeric(8,4),
  account_id uuid references public.accounts(id) on delete set null,
  notes text,
  status text not null default 'active' check (status in ('active','paid_off')),
  created_at timestamptz not null default now()
);

create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts(id) on delete cascade,
  installment_no int not null,
  amount numeric(18,2) not null,
  paid_at date not null default current_date,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (debt_id, installment_no)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(18,2) not null,
  currency text not null default 'IDR' check (currency in ('IDR','USD')),
  cycle text not null default 'monthly' check (cycle in ('monthly','yearly')),
  next_due date not null,
  account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null unique references public.categories(id) on delete cascade,
  amount numeric(18,2) not null,
  alert_percent int not null default 80,
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_amount numeric(18,2) not null,
  saved_amount numeric(18,2) not null default 0,
  deadline date,
  color text,
  created_at timestamptz not null default now()
);

create table if not exists public.fx_rates (
  rate_date date not null,
  base text not null,
  quote text not null,
  rate numeric(18,6) not null,
  primary key (rate_date, base, quote)
);

create or replace view public.account_balances with (security_invoker = true) as
select a.id, a.name, a.type, a.currency, a.color, a.archived, a.initial_balance,
  a.initial_balance + coalesce(sum(
    case
      when t.account_id = a.id and t.kind = 'income' then t.amount
      when t.account_id = a.id and t.kind in ('expense','transfer') then -t.amount
      when t.to_account_id = a.id and t.kind = 'transfer' then t.amount
      else 0 end), 0) as balance
from public.accounts a
left join public.transactions t on t.account_id = a.id or t.to_account_id = a.id
group by a.id;

-- Grants: hanya service_role (server). Browser tidak punya akses.
do $$
declare t text;
begin
  foreach t in array array['accounts','categories','transactions','debts','debt_payments','subscriptions','budgets','goals','fx_rates'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
revoke all on public.account_balances from anon, authenticated;
grant select on public.account_balances to service_role;

insert into public.categories (name, kind, color) values
  ('Gaji','income','#2f7d5b'), ('Bonus','income','#5a9e6f'), ('Freelance','income','#3e8e8a'), ('Lainnya','income','#7a8b6a'),
  ('Makanan & Minuman','expense','#d0703c'), ('Transportasi','expense','#c99a2e'), ('Belanja','expense','#b85c5c'),
  ('Tagihan & Utilitas','expense','#5b7fa6'), ('Hiburan','expense','#8a6fb0'), ('Kesehatan','expense','#4f9a94'),
  ('Pendidikan','expense','#6a8f3a'), ('Langganan','expense','#a3683a'), ('Cicilan & Hutang','expense','#8c3f3f'), ('Lainnya','expense','#7d7d6f')
on conflict (name, kind) do nothing;
