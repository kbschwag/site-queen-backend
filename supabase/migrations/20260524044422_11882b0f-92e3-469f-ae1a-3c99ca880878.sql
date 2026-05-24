ALTER TABLE public.quick_edit_jobs
  ADD COLUMN IF NOT EXISTS enabled_sub_fix_ids TEXT[],
  ADD COLUMN IF NOT EXISTS sub_fix_results JSONB;