ALTER TABLE public.quick_edit_jobs
  ADD COLUMN IF NOT EXISTS current_value TEXT,
  ADD COLUMN IF NOT EXISTS current_value_source TEXT;