
-- Add intake_completed to clients
ALTER TABLE public.clients ADD COLUMN intake_completed boolean NOT NULL DEFAULT false;

-- Create storage bucket for client uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('client-uploads', 'client-uploads', true);

-- Storage policies: clients can upload to their own folder
CREATE POLICY "Clients can upload own files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'client-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Clients can view own files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'client-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Clients can update own files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'client-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Clients can delete own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'client-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Admins can access all client uploads
CREATE POLICY "Admins can view all client uploads"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'client-uploads'
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can manage all client uploads"
ON storage.objects FOR ALL
USING (
  bucket_id = 'client-uploads'
  AND has_role(auth.uid(), 'admin'::app_role)
);
