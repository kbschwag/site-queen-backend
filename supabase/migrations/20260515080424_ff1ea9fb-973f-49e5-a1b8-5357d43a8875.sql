
-- Extend clients with prospect lifecycle fields
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS lifecycle_stage text NOT NULL DEFAULT 'active_client',
  ADD COLUMN IF NOT EXISTS outreach_channel text,
  ADD COLUMN IF NOT EXISTS date_last_contacted timestamptz,
  ADD COLUMN IF NOT EXISTS next_followup_date date,
  ADD COLUMN IF NOT EXISTS demo_url text,
  ADD COLUMN IF NOT EXISTS demo_view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS demo_last_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS conversion_source text,
  ADD COLUMN IF NOT EXISTS payment_method_at_conversion text,
  ADD COLUMN IF NOT EXISTS pending_payment_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS prospect_category text,
  ADD COLUMN IF NOT EXISTS prospect_city text,
  ADD COLUMN IF NOT EXISTS prospect_services text,
  ADD COLUMN IF NOT EXISTS prospect_notes text,
  ADD COLUMN IF NOT EXISTS prospect_existing_url text,
  ADD COLUMN IF NOT EXISTS prospect_email text,
  ADD COLUMN IF NOT EXISTS prospect_brand_color text,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz;

-- Constrain lifecycle_stage values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_lifecycle_stage_check'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_lifecycle_stage_check
      CHECK (lifecycle_stage IN (
        'prospect','pitched','viewed_demo','call_booked','replied','cold','converted','active_client'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clients_lifecycle_followup
  ON public.clients(lifecycle_stage, next_followup_date)
  WHERE deleted_at IS NULL;

-- Contact log table
CREATE TABLE IF NOT EXISTS public.prospect_contact_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  channel text NOT NULL,
  note text,
  next_followup_date date
);

CREATE INDEX IF NOT EXISTS idx_prospect_contact_log_client
  ON public.prospect_contact_log(client_id, created_at DESC);

ALTER TABLE public.prospect_contact_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can manage contact log" ON public.prospect_contact_log;
CREATE POLICY "Owners can manage contact log"
  ON public.prospect_contact_log
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Partners can manage contact log" ON public.prospect_contact_log;
CREATE POLICY "Partners can manage contact log"
  ON public.prospect_contact_log
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'partner'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'partner'));
