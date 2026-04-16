
-- Rate limits table
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  count integer DEFAULT 1,
  reset_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_rate_limits_key ON public.rate_limits(key);
CREATE INDEX idx_rate_limits_reset_at ON public.rate_limits(reset_at);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- No public access — only service role uses this table
CREATE POLICY "Service role only" ON public.rate_limits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Add reCAPTCHA fields to applications
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS recaptcha_score decimal;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS bot_risk boolean DEFAULT false;
