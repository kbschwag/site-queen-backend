
-- Add new columns for the multi-step qualification form
ALTER TABLE public.applications 
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state_province text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS restricted_niches text,
  ADD COLUMN IF NOT EXISTS update_frequency text,
  ADD COLUMN IF NOT EXISTS additional_notes text,
  ADD COLUMN IF NOT EXISTS logo_file_url text,
  ADD COLUMN IF NOT EXISTS inspiration_urls text,
  ADD COLUMN IF NOT EXISTS decline_reason text,
  ADD COLUMN IF NOT EXISTS decision_maker_status text;

-- Make columns nullable that are no longer collected
ALTER TABLE public.applications 
  ALTER COLUMN monthly_revenue DROP NOT NULL,
  ALTER COLUMN city_state DROP NOT NULL;

-- Create storage bucket for application file uploads
INSERT INTO storage.buckets (id, name, public) 
VALUES ('application-uploads', 'application-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to upload application files
CREATE POLICY "Anyone can upload application files"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'application-uploads');

-- Allow anyone to read application files
CREATE POLICY "Anyone can read application files"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'application-uploads');
