CREATE POLICY "Operators can delete generated sites"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'generated-sites' AND public.is_operator(auth.uid()));

CREATE POLICY "Operators can upload generated sites"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'generated-sites' AND public.is_operator(auth.uid()));

CREATE POLICY "Operators can update generated sites"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'generated-sites' AND public.is_operator(auth.uid()))
WITH CHECK (bucket_id = 'generated-sites' AND public.is_operator(auth.uid()));