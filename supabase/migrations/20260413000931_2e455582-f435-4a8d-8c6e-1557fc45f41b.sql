
DROP POLICY IF EXISTS "Admins can manage packages" ON public.credit_packages;

CREATE POLICY "Admins can select packages" ON public.credit_packages FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert packages" ON public.credit_packages FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update packages" ON public.credit_packages FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete packages" ON public.credit_packages FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage change types" ON public.change_types;

CREATE POLICY "Admins can select change types" ON public.change_types FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert change types" ON public.change_types FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update change types" ON public.change_types FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete change types" ON public.change_types FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));
