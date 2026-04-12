
-- Drop the overly permissive FOR ALL policy on sites
DROP POLICY "Admins can manage all sites" ON public.sites;

-- Replace with specific policies
CREATE POLICY "Admins can insert sites" ON public.sites FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update sites" ON public.sites FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete sites" ON public.sites FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
