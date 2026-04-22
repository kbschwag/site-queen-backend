
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS generation_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS last_generation_attempt_at timestamp with time zone;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS intake_snapshot jsonb;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS intake_snapshot_saved_at timestamp with time zone;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS call_notes_snapshot jsonb;
