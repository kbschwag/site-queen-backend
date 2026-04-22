-- ============= New columns on sites =============
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS client_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_approval_notes TEXT,
  ADD COLUMN IF NOT EXISTS reshared_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reshared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS operator_edit_count INTEGER DEFAULT 0;

-- ============= New column on clients =============
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS calendly_revision_url TEXT;

-- ============= operator_edits log table =============
CREATE TABLE IF NOT EXISTS public.operator_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL,
  operator_email TEXT,
  instruction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  model_used TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_operator_edits_client_id ON public.operator_edits(client_id);
CREATE INDEX IF NOT EXISTS idx_operator_edits_created_at ON public.operator_edits(created_at DESC);

ALTER TABLE public.operator_edits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view operator edits" ON public.operator_edits;
CREATE POLICY "Admins can view operator edits"
  ON public.operator_edits FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Partners can view operator edits" ON public.operator_edits;
CREATE POLICY "Partners can view operator edits"
  ON public.operator_edits FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'partner'));

DROP POLICY IF EXISTS "Admins can insert operator edits" ON public.operator_edits;
CREATE POLICY "Admins can insert operator edits"
  ON public.operator_edits FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'partner'));

-- ============= app_settings: global key/value =============
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can read app_settings" ON public.app_settings;
CREATE POLICY "Anyone authenticated can read app_settings"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can upsert app_settings" ON public.app_settings;
CREATE POLICY "Admins can upsert app_settings"
  ON public.app_settings FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update app_settings" ON public.app_settings;
CREATE POLICY "Admins can update app_settings"
  ON public.app_settings FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default Calendly URLs (no-op if rows already exist)
INSERT INTO public.app_settings (key, value)
VALUES
  ('calendly_discovery_url', 'https://calendly.com/sitequeenai/30min'),
  ('calendly_revision_url', 'https://calendly.com/sitequeenai/revision-call')
ON CONFLICT (key) DO NOTHING;