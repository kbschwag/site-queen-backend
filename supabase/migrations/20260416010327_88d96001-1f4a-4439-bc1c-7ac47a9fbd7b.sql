
-- Create analytics_events table
CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  page_path text,
  page_title text,
  referrer text,
  user_agent text,
  device_type text,
  country text,
  session_id text,
  metadata jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all analytics events"
  ON public.analytics_events FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Partners can view all analytics events"
  ON public.analytics_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'partner'));

CREATE POLICY "Clients can view own analytics events"
  ON public.analytics_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = analytics_events.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Service role can insert analytics events"
  ON public.analytics_events FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_analytics_events_client_created ON public.analytics_events(client_id, created_at);
CREATE INDEX idx_analytics_events_client_type ON public.analytics_events(client_id, event_type);

-- Create analytics_daily_summary table
CREATE TABLE public.analytics_daily_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  page_views integer NOT NULL DEFAULT 0,
  unique_sessions integer NOT NULL DEFAULT 0,
  phone_clicks integer NOT NULL DEFAULT 0,
  form_submissions integer NOT NULL DEFAULT 0,
  cta_clicks integer NOT NULL DEFAULT 0,
  UNIQUE(date, client_id)
);

ALTER TABLE public.analytics_daily_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all daily summaries"
  ON public.analytics_daily_summary FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Partners can view all daily summaries"
  ON public.analytics_daily_summary FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'partner'));

CREATE POLICY "Clients can view own daily summaries"
  ON public.analytics_daily_summary FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = analytics_daily_summary.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Service role can insert daily summaries"
  ON public.analytics_daily_summary FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update daily summaries"
  ON public.analytics_daily_summary FOR UPDATE
  USING (true);

CREATE INDEX idx_analytics_daily_summary_client_date ON public.analytics_daily_summary(client_id, date);

-- Create the atomic increment function
CREATE OR REPLACE FUNCTION public.increment_analytics_summary(
  p_date date,
  p_client_id uuid,
  p_event_type text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO analytics_daily_summary 
    (date, client_id, page_views, phone_clicks, form_submissions, cta_clicks)
  VALUES (
    p_date, p_client_id,
    CASE WHEN p_event_type = 'page_view' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'phone_click' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'form_submission' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'cta_click' THEN 1 ELSE 0 END
  )
  ON CONFLICT (date, client_id) DO UPDATE SET
    page_views = analytics_daily_summary.page_views + 
      CASE WHEN p_event_type = 'page_view' THEN 1 ELSE 0 END,
    phone_clicks = analytics_daily_summary.phone_clicks + 
      CASE WHEN p_event_type = 'phone_click' THEN 1 ELSE 0 END,
    form_submissions = analytics_daily_summary.form_submissions + 
      CASE WHEN p_event_type = 'form_submission' THEN 1 ELSE 0 END,
    cta_clicks = analytics_daily_summary.cta_clicks + 
      CASE WHEN p_event_type = 'cta_click' THEN 1 ELSE 0 END;
END;
$$;
