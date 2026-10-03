alter table public.gold_purchases add column if not exists gold_type text;
alter table public.gold_purchases add column if not exists product_number text;

create index if not exists gold_purchases_occurred_idx on public.gold_purchases (occurred_at desc);
create index if not exists subscriptions_active_next_due_idx on public.subscriptions (active, next_due);
create index if not exists transactions_to_account_idx on public.transactions (to_account_id);
create index if not exists transactions_occurred_kind_idx on public.transactions (occurred_at desc, kind);
create index if not exists receivables_status_idx on public.receivables (status);