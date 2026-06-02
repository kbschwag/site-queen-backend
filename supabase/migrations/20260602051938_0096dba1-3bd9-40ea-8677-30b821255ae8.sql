
-- 1. client_page_screenshots: restrict mutations to service_role only
DROP POLICY IF EXISTS "Service can insert screenshots" ON public.client_page_screenshots;
DROP POLICY IF EXISTS "Service can update screenshots" ON public.client_page_screenshots;
DROP POLICY IF EXISTS "Service can delete screenshots" ON public.client_page_screenshots;

CREATE POLICY "Service role manages screenshots"
ON public.client_page_screenshots
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2. page-screenshots storage bucket: restrict ALL policy to service_role
DROP POLICY IF EXISTS "Service can manage page screenshots" ON storage.objects;

CREATE POLICY "Service role manages page-screenshots"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'page-screenshots')
WITH CHECK (bucket_id = 'page-screenshots');

-- 3. application-uploads storage: restrict reads to operators only (keep public INSERT for /apply)
DROP POLICY IF EXISTS "Anyone can read application files" ON storage.objects;

CREATE POLICY "Operators can read application files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'application-uploads'
  AND (has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'partner'))
);

-- Make application-uploads bucket private
UPDATE storage.buckets SET public = false WHERE id = 'application-uploads';

-- 4. app_settings: restrict reads to operators
DROP POLICY IF EXISTS "Anyone authenticated can read app_settings" ON public.app_settings;

CREATE POLICY "Operators can read app_settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'partner')
);

-- 5. Revoke EXECUTE on SECURITY DEFINER functions from anon/authenticated
-- (They still work inside RLS policies; revoking blocks direct PostgREST RPC calls)
REVOKE EXECUTE ON FUNCTION public.bump_unique_visitor_today(date, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_analytics_summary(date, uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_custom_event_definitions() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
-- has_role and is_operator are used inside RLS; revoke direct API exposure but keep usable in policies
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_operator(uuid) FROM anon;
