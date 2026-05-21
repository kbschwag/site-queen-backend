CREATE TABLE IF NOT EXISTS public.tracker_migration_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  file_path TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('dry-run','live')),
  result TEXT NOT NULL CHECK (result IN ('would_migrate','migrated','no_match','multiple_matches','failed')),
  match_count INTEGER NOT NULL DEFAULT 0,
  file_size_before INTEGER,
  file_size_after INTEGER,
  diff_sample TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracker_mig_log_client_date
  ON public.tracker_migration_log (client_id, created_at DESC);

ALTER TABLE public.tracker_migration_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view tracker migration log"
  ON public.tracker_migration_log FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert tracker migration log"
  ON public.tracker_migration_log FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));