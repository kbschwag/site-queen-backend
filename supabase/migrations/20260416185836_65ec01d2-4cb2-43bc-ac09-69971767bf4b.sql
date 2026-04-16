-- New columns for rebuilt application form
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS business_instagram text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS business_facebook text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS ideal_customer text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS google_search_terms text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS support_level text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS readiness text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS referral_source text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS logo_addon_requested boolean DEFAULT false;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS anything_else text;

-- Make legacy required columns nullable (new form doesn't collect these)
ALTER TABLE public.applications ALTER COLUMN has_website DROP NOT NULL;
ALTER TABLE public.applications ALTER COLUMN years_in_business DROP NOT NULL;
ALTER TABLE public.applications ALTER COLUMN monthly_clients DROP NOT NULL;