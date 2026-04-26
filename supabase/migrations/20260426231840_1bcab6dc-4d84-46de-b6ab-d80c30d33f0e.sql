CREATE TABLE IF NOT EXISTS public.quick_edit_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  operator_id UUID NOT NULL,
  operator_email TEXT,
  instruction TEXT NOT NULL,
  pages TEXT NOT NULL DEFAULT 'homepage',
  status TEXT NOT NULL DEFAULT 'pending',
  change_type TEXT,
  version_timestamp TEXT,
  edited_files TEXT[] NOT NULL DEFAULT '{}',
  skipped_files TEXT[] NOT NULL DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.quick_edit_jobs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_quick_edit_jobs_client_created
ON public.quick_edit_jobs (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quick_edit_jobs_status_created
ON public.quick_edit_jobs (status, created_at ASC);

DROP POLICY IF EXISTS "Operators can manage quick edit jobs" ON public.quick_edit_jobs;
CREATE POLICY "Operators can manage quick edit jobs"
ON public.quick_edit_jobs
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'partner')
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'partner')
  )
);

DROP POLICY IF EXISTS "Clients can view their own quick edit jobs" ON public.quick_edit_jobs;
CREATE POLICY "Clients can view their own quick edit jobs"
ON public.quick_edit_jobs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = quick_edit_jobs.client_id
      AND c.user_id = auth.uid()
  )
);

DROP TRIGGER IF EXISTS update_quick_edit_jobs_updated_at ON public.quick_edit_jobs;
CREATE TRIGGER update_quick_edit_jobs_updated_at
BEFORE UPDATE ON public.quick_edit_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();