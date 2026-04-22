-- Support messages table
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid references public.clients(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  message text not null,
  client_name text,
  business_name text,
  client_email text,
  status text not null default 'new',
  replied_at timestamptz,
  replied_by uuid references auth.users(id) on delete set null,
  reply_text text,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null
);

create index if not exists support_messages_status_idx on public.support_messages(status);
create index if not exists support_messages_client_idx on public.support_messages(client_id);

alter table public.support_messages enable row level security;

-- Client: insert their own
drop policy if exists "Clients can insert own support messages" on public.support_messages;
create policy "Clients can insert own support messages"
on public.support_messages
for insert
to authenticated
with check (auth.uid() = user_id);

-- Client: view their own
drop policy if exists "Clients can view own support messages" on public.support_messages;
create policy "Clients can view own support messages"
on public.support_messages
for select
to authenticated
using (auth.uid() = user_id);

-- Operators (admin role): view all
drop policy if exists "Operators can view all support messages" on public.support_messages;
create policy "Operators can view all support messages"
on public.support_messages
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

-- Operators: update (mark replied / soft delete)
drop policy if exists "Operators can update support messages" on public.support_messages;
create policy "Operators can update support messages"
on public.support_messages
for update
to authenticated
using (public.has_role(auth.uid(), 'admin'));

-- Seed the support calendly setting if missing
insert into public.app_settings (key, value)
values ('calendly_support_url', 'https://calendly.com/sitequeenai/support-call')
on conflict (key) do nothing;