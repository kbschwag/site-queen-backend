
-- analytics_visitors
CREATE TABLE public.analytics_visitors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  visitor_hash    text NOT NULL,
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  total_sessions  integer NOT NULL DEFAULT 1,
  first_source    text,
  country         text,
  region          text,
  city            text,
  device_type     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, visitor_hash)
);

CREATE INDEX idx_visitors_client_lastseen
  ON public.analytics_visitors (client_id, last_seen_at DESC);
CREATE INDEX idx_visitors_hash_lookup
  ON public.analytics_visitors (client_id, visitor_hash);

ALTER TABLE public.analytics_visitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own visitors"
  ON public.analytics_visitors FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.clients c
                 WHERE c.id = analytics_visitors.client_id AND c.user_id = auth.uid()));

CREATE POLICY "Admins can view all visitors"
  ON public.analytics_visitors FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Partners can view all visitors"
  ON public.analytics_visitors FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.user_id = auth.uid() AND p.role = 'partner'));

-- analytics_sessions
CREATE TABLE public.analytics_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  visitor_id       uuid NOT NULL REFERENCES public.analytics_visitors(id) ON DELETE CASCADE,
  started_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer NOT NULL DEFAULT 0,
  page_count       integer NOT NULL DEFAULT 0,
  entry_page       text,
  exit_page        text,
  source           text,
  medium           text,
  referrer         text,
  utm_campaign     text,
  utm_source       text,
  utm_medium       text,
  device_type      text,
  browser          text,
  is_bounce        boolean NOT NULL DEFAULT true,
  converted        boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_visitor_ended
  ON public.analytics_sessions (visitor_id, ended_at DESC);
CREATE INDEX idx_sessions_client_started
  ON public.analytics_sessions (client_id, started_at DESC);

ALTER TABLE public.analytics_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own sessions"
  ON public.analytics_sessions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.clients c
                 WHERE c.id = analytics_sessions.client_id AND c.user_id = auth.uid()));

CREATE POLICY "Admins can view all sessions"
  ON public.analytics_sessions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Partners can view all sessions"
  ON public.analytics_sessions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.user_id = auth.uid() AND p.role = 'partner'));

-- analytics_events additive columns
ALTER TABLE public.analytics_events
  ADD COLUMN visitor_id    uuid REFERENCES public.analytics_visitors(id) ON DELETE SET NULL,
  ADD COLUMN session_id_fk uuid REFERENCES public.analytics_sessions(id) ON DELETE SET NULL;

CREATE INDEX idx_events_visitor    ON public.analytics_events (visitor_id);
CREATE INDEX idx_events_session_fk ON public.analytics_events (session_id_fk);
CREATE INDEX idx_events_client_created
  ON public.analytics_events (client_id, created_at DESC);
