ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_events_is_bot
  ON public.analytics_events (client_id, is_bot, created_at DESC);