
-- Add application_id to call_notes
ALTER TABLE public.call_notes ADD COLUMN IF NOT EXISTS application_id uuid REFERENCES public.applications(id);

-- Make client_id nullable (call notes now primarily linked to applications)
ALTER TABLE public.call_notes ALTER COLUMN client_id DROP NOT NULL;

-- Add call notes tracking to applications table
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS call_notes_completed boolean DEFAULT false;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS call_notes_completed_at timestamp with time zone;

-- Create index for application_id lookups
CREATE INDEX IF NOT EXISTS idx_call_notes_application_id ON public.call_notes(application_id);

-- Add unique constraint on application_id (one call note per application)
ALTER TABLE public.call_notes ADD CONSTRAINT call_notes_application_id_unique UNIQUE (application_id);
