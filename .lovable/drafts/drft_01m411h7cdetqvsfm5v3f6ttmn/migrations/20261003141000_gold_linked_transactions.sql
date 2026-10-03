alter table public.gold_purchases add column if not exists account_id uuid references public.accounts(id) on delete set null;
alter table public.gold_purchases add column if not exists transaction_id uuid references public.transactions(id) on delete set null;
insert into public.categories (name, kind, color) values ('Emas','expense','#c9a227'), ('Emas','income','#c9a227')
on conflict (name, kind) do nothing;
