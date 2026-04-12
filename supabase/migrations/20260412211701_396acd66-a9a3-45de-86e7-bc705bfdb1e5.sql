GRANT INSERT, SELECT ON public.applications TO anon, authenticated;
GRANT UPDATE, SELECT ON public.applications TO authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;