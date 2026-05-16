create table if not exists public.generation_diagnostics (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  template_id text not null,
  page_slug text not null,
  unfilled_placeholders text[] not null default '{}',
  placeholder_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists generation_diagnostics_client_id_idx on public.generation_diagnostics(client_id);
create index if not exists generation_diagnostics_template_id_idx on public.generation_diagnostics(template_id);
create index if not exists generation_diagnostics_created_at_idx on public.generation_diagnostics(created_at desc);

alter table public.generation_diagnostics enable row level security;

create policy "Admins can view generation diagnostics"
on public.generation_diagnostics
for select
using (public.has_role(auth.uid(), 'admin'::app_role));

create policy "Partners can view generation diagnostics"
on public.generation_diagnostics
for select
using (exists (select 1 from public.profiles where profiles.user_id = auth.uid() and profiles.role = 'partner'));

create policy "Admins can insert generation diagnostics"
on public.generation_diagnostics
for insert
with check (public.has_role(auth.uid(), 'admin'::app_role));
