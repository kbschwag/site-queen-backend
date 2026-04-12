
-- 1. Create staff_permissions table
CREATE TABLE public.staff_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  can_review_applications BOOLEAN NOT NULL DEFAULT false,
  can_handle_change_requests BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;

-- Owner can do everything with staff permissions
CREATE POLICY "Owners can view all staff permissions"
  ON public.staff_permissions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners can insert staff permissions"
  ON public.staff_permissions FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners can update staff permissions"
  ON public.staff_permissions FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners can delete staff permissions"
  ON public.staff_permissions FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Team members can view their own permissions
CREATE POLICY "Users can view own permissions"
  ON public.staff_permissions FOR SELECT
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_staff_permissions_updated_at
  BEFORE UPDATE ON public.staff_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Create audit_log table
CREATE TABLE public.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_email TEXT,
  user_name TEXT,
  action TEXT NOT NULL,
  target_table TEXT,
  target_id TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Only owners can view full audit log
CREATE POLICY "Owners can view all audit logs"
  ON public.audit_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Any authenticated staff can insert audit logs
CREATE POLICY "Authenticated users can insert audit logs"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Partners can view operational audit logs (not revenue/settings)
CREATE POLICY "Partners can view operational logs"
  ON public.audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('partner')
    )
    AND target_table NOT IN ('revenue', 'settings', 'staff_permissions')
  );

-- Team members can view their own audit logs
CREATE POLICY "Users can view own audit logs"
  ON public.audit_log FOR SELECT
  USING (auth.uid() = user_id);

-- 3. Add assigned_to column to change_requests
ALTER TABLE public.change_requests
  ADD COLUMN IF NOT EXISTS assigned_to UUID;

-- 4. Add RLS policy for partners on applications (full access)
CREATE POLICY "Partners can read applications"
  ON public.applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('partner')
    )
  );

CREATE POLICY "Partners can update applications"
  ON public.applications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('partner')
    )
  );

-- Team members with can_review_applications can see flagged apps only
CREATE POLICY "Reviewers can read flagged applications"
  ON public.applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_permissions
      WHERE staff_permissions.user_id = auth.uid()
      AND staff_permissions.can_review_applications = true
      AND staff_permissions.is_active = true
    )
    AND status = 'needs_review'
  );

-- Team members with can_review_applications can update flagged apps
CREATE POLICY "Reviewers can update flagged applications"
  ON public.applications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_permissions
      WHERE staff_permissions.user_id = auth.uid()
      AND staff_permissions.can_review_applications = true
      AND staff_permissions.is_active = true
    )
    AND status = 'needs_review'
  );

-- 5. Partners can view all clients
CREATE POLICY "Partners can view all clients"
  ON public.clients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('partner')
    )
  );

CREATE POLICY "Partners can update all clients"
  ON public.clients FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('partner')
    )
  );

-- 6. Partners can view all change requests
CREATE POLICY "Partners can view all change requests"
  ON public.change_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('partner')
    )
  );

CREATE POLICY "Partners can update all change requests"
  ON public.change_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('partner')
    )
  );

-- Team members with can_handle_change_requests see only assigned requests
CREATE POLICY "Assigned staff can view their change requests"
  ON public.change_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_permissions
      WHERE staff_permissions.user_id = auth.uid()
      AND staff_permissions.can_handle_change_requests = true
      AND staff_permissions.is_active = true
    )
    AND assigned_to = auth.uid()
  );

CREATE POLICY "Assigned staff can update their change requests"
  ON public.change_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_permissions
      WHERE staff_permissions.user_id = auth.uid()
      AND staff_permissions.can_handle_change_requests = true
      AND staff_permissions.is_active = true
    )
    AND assigned_to = auth.uid()
  );

-- 7. Partners can view all sites
CREATE POLICY "Partners can view all sites"
  ON public.sites FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('partner')
    )
  );

-- 8. Partners and reviewers can view email logs
CREATE POLICY "Partners can view all email logs"
  ON public.emails_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('partner')
    )
  );

-- 9. Allow edge functions to insert email logs (service role handles this but also anon for the send-email function)
CREATE POLICY "Service can insert email logs"
  ON public.emails_log FOR INSERT
  TO anon
  WITH CHECK (true);
