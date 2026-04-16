
-- Tighten analytics_events INSERT policy
DROP POLICY "Service role can insert analytics events" ON public.analytics_events;
CREATE POLICY "Admins can insert analytics events"
  ON public.analytics_events FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Tighten analytics_daily_summary INSERT policy
DROP POLICY "Service role can insert daily summaries" ON public.analytics_daily_summary;
CREATE POLICY "Admins can insert daily summaries"
  ON public.analytics_daily_summary FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Tighten analytics_daily_summary UPDATE policy
DROP POLICY "Service role can update daily summaries" ON public.analytics_daily_summary;
CREATE POLICY "Admins can update daily summaries"
  ON public.analytics_daily_summary FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));
