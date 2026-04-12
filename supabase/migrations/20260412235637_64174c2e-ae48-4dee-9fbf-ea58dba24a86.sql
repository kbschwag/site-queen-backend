-- Add domain management columns to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS domain_name text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS hostinger_folder_path text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS domain_status text DEFAULT 'not_started';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS deployment_path_confirmed boolean DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS email_hosting_notes text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS deploy_count integer DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS domain_checklist jsonb DEFAULT '{
  "domain_confirmed": false,
  "registrar_identified": false,
  "client_has_access": false,
  "dns_documented": false,
  "email_identified": false,
  "transfer_initiated": false,
  "mx_records_recreated": false,
  "email_tested": false,
  "deployment_path_confirmed": false
}'::jsonb;

-- Add deployment tracking columns to sites
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS last_deployed_at timestamp with time zone;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS deploy_count integer DEFAULT 0;