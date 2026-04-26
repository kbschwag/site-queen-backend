create table public.site_versions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  timestamp text not null,
  instruction text,
  files_saved text[],
  restored boolean default false,
  created_at timestamptz not null default now(),
  created_by uuid
);

create index idx_site_versions_client_id_created_at on public.site_versions (client_id, created_at desc);

alter table public.site_versions enable row level security;

create policy "Admins can view site versions"
on public.site_versions for select
using (has_role(auth.uid(), 'admin'::app_role));

create policy "Partners can view site versions"
on public.site_versions for select
using (exists (select 1 from profiles where profiles.user_id = auth.uid() and profiles.role = 'partner'));

create policy "Admins can insert site versions"
on public.site_versions for insert
with check (has_role(auth.uid(), 'admin'::app_role));

create policy "Partners can insert site versions"
on public.site_versions for insert
with check (exists (select 1 from profiles where profiles.user_id = auth.uid() and profiles.role = 'partner'));