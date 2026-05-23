
-- 2a. New columns on analytics_events
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS last_scroll_milestone integer,
  ADD COLUMN IF NOT EXISTS exit_page_path text,
  ADD COLUMN IF NOT EXISTS doc_width integer,
  ADD COLUMN IF NOT EXISTS doc_height integer;

-- 2b. New columns on analytics_daily_summary
ALTER TABLE public.analytics_daily_summary
  ADD COLUMN IF NOT EXISTS unique_visitors integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scroll_depth_events integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_events integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engagement_pings integer NOT NULL DEFAULT 0;

-- 2c. Updated summary function
CREATE OR REPLACE FUNCTION public.increment_analytics_summary(
  p_date date,
  p_client_id uuid,
  p_event_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO analytics_daily_summary
    (date, client_id, page_views, phone_clicks, form_submissions, cta_clicks,
     scroll_depth_events, click_events, engagement_pings, unique_visitors)
  VALUES (
    p_date, p_client_id,
    CASE WHEN p_event_type = 'page_view' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'phone_click' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'form_submission' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'cta_click' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'scroll_depth' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'click' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'engagement_ping' THEN 1 ELSE 0 END,
    0
  )
  ON CONFLICT (date, client_id) DO UPDATE SET
    page_views = analytics_daily_summary.page_views +
      CASE WHEN p_event_type = 'page_view' THEN 1 ELSE 0 END,
    phone_clicks = analytics_daily_summary.phone_clicks +
      CASE WHEN p_event_type = 'phone_click' THEN 1 ELSE 0 END,
    form_submissions = analytics_daily_summary.form_submissions +
      CASE WHEN p_event_type = 'form_submission' THEN 1 ELSE 0 END,
    cta_clicks = analytics_daily_summary.cta_clicks +
      CASE WHEN p_event_type = 'cta_click' THEN 1 ELSE 0 END,
    scroll_depth_events = analytics_daily_summary.scroll_depth_events +
      CASE WHEN p_event_type = 'scroll_depth' THEN 1 ELSE 0 END,
    click_events = analytics_daily_summary.click_events +
      CASE WHEN p_event_type = 'click' THEN 1 ELSE 0 END,
    engagement_pings = analytics_daily_summary.engagement_pings +
      CASE WHEN p_event_type = 'engagement_ping' THEN 1 ELSE 0 END;
END;
$$;

-- Helper: bump unique_visitors when a visitor is first seen on a given day
CREATE OR REPLACE FUNCTION public.bump_unique_visitor_today(
  p_date date,
  p_client_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO analytics_daily_summary (date, client_id, unique_visitors)
  VALUES (p_date, p_client_id, 1)
  ON CONFLICT (date, client_id) DO UPDATE SET
    unique_visitors = analytics_daily_summary.unique_visitors + 1;
END;
$$;

-- 2d. form_submissions session_id_fk
ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS session_id_fk uuid REFERENCES public.analytics_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_form_submissions_session_fk
  ON public.form_submissions(session_id_fk);

-- Backfill: match each submission to the most recent session whose window includes the submission
UPDATE public.form_submissions fs
SET session_id_fk = sub.session_id
FROM (
  SELECT DISTINCT ON (fs2.id) fs2.id AS submission_id, s.id AS session_id
  FROM public.form_submissions fs2
  JOIN public.analytics_sessions s
    ON s.visitor_id = fs2.visitor_id
   AND s.client_id = fs2.client_id
   AND s.started_at <= fs2.created_at
   AND fs2.created_at <= COALESCE(s.ended_at, s.started_at + interval '30 minutes') + interval '5 minutes'
  WHERE fs2.visitor_id IS NOT NULL
    AND fs2.session_id_fk IS NULL
  ORDER BY fs2.id, s.started_at DESC
) sub
WHERE fs.id = sub.submission_id;
