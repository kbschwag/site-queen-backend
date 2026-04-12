
-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Service role can insert generation logs" ON public.generation_logs;
DROP POLICY IF EXISTS "Anyone can upload to generated sites" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update generated sites" ON storage.objects;

-- Edge functions use service_role key which bypasses RLS entirely,
-- so we don't need permissive insert policies. Admin policies already cover UI inserts.

-- For generated-sites storage, edge functions bypass RLS with service_role key
-- Only admins need explicit policies for dashboard access
CREATE POLICY "Admins can upload to generated sites"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'generated-sites' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update generated sites"
ON storage.objects FOR UPDATE
USING (bucket_id = 'generated-sites' AND has_role(auth.uid(), 'admin'::app_role));
