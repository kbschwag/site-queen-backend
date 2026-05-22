BEGIN;

-- 1. New columns on analytics_events
ALTER TABLE analytics_events
  ADD COLUMN IF NOT EXISTS tier text DEFAULT 'growth',
  ADD COLUMN IF NOT EXISTS click_x_pct numeric(4, 1),
  ADD COLUMN IF NOT EXISTS click_y_pct numeric(4, 1),
  ADD COLUMN IF NOT EXISTS scroll_milestone smallint,
  ADD COLUMN IF NOT EXISTS milestone_name text,
  ADD COLUMN IF NOT EXISTS seconds_on_page integer,
  ADD COLUMN IF NOT EXISTS event_name text,
  ADD COLUMN IF NOT EXISTS element jsonb;

-- 2. ALTER existing form_submissions (Option C)
ALTER TABLE form_submissions
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS page_path text,
  ADD COLUMN IF NOT EXISTS fields jsonb,
  ADD COLUMN IF NOT EXISTS visitor_id uuid REFERENCES analytics_visitors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS referrer text,
  ADD COLUMN IF NOT EXISTS is_spam boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'form_submissions_session_page_window'
  ) THEN
    ALTER TABLE form_submissions
      ADD CONSTRAINT form_submissions_session_page_window
      UNIQUE (client_id, session_id, page_path, created_at);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_form_submissions_client_created
  ON form_submissions (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_visitor
  ON form_submissions (visitor_id) WHERE visitor_id IS NOT NULL;

-- New insert policy for tracker (existing SELECT policies remain).
DROP POLICY IF EXISTS "Service can insert form submissions" ON form_submissions;
CREATE POLICY "Service can insert form submissions"
  ON form_submissions FOR INSERT
  WITH CHECK (true);

-- 3. custom_event_definitions
CREATE TABLE IF NOT EXISTS custom_event_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  display_name text NOT NULL,
  description text,
  icon text DEFAULT 'tag',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT custom_events_client_name_unique UNIQUE (client_id, event_name)
);

CREATE INDEX IF NOT EXISTS idx_custom_event_definitions_client
  ON custom_event_definitions (client_id) WHERE is_active = true;

ALTER TABLE custom_event_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients see own custom event definitions" ON custom_event_definitions;
CREATE POLICY "Clients see own custom event definitions"
  ON custom_event_definitions FOR SELECT
  USING (
    client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Operators manage all custom event definitions" ON custom_event_definitions;
CREATE POLICY "Operators manage all custom event definitions"
  ON custom_event_definitions FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'partner')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'partner')
  );

-- 4. client_page_screenshots
CREATE TABLE IF NOT EXISTS client_page_screenshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  page_path text NOT NULL,
  page_name text,
  desktop_url text,
  desktop_width integer,
  desktop_height integer,
  mobile_url text,
  mobile_width integer,
  mobile_height integer,
  captured_at timestamptz DEFAULT now(),
  CONSTRAINT screenshot_client_path_unique UNIQUE (client_id, page_path)
);

CREATE INDEX IF NOT EXISTS idx_client_page_screenshots_client
  ON client_page_screenshots (client_id);

ALTER TABLE client_page_screenshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients see own page screenshots" ON client_page_screenshots;
CREATE POLICY "Clients see own page screenshots"
  ON client_page_screenshots FOR SELECT
  USING (
    client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Operators see all screenshots" ON client_page_screenshots;
CREATE POLICY "Operators see all screenshots"
  ON client_page_screenshots FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'partner')
  );

DROP POLICY IF EXISTS "Service can insert screenshots" ON client_page_screenshots;
CREATE POLICY "Service can insert screenshots"
  ON client_page_screenshots FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service can update screenshots" ON client_page_screenshots;
CREATE POLICY "Service can update screenshots"
  ON client_page_screenshots FOR UPDATE
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service can delete screenshots" ON client_page_screenshots;
CREATE POLICY "Service can delete screenshots"
  ON client_page_screenshots FOR DELETE
  USING (true);

-- 5. Indexes on analytics_events for new query patterns
CREATE INDEX IF NOT EXISTS idx_events_heatmap
  ON analytics_events (client_id, page_path, created_at DESC)
  WHERE event_type = 'click' AND is_bot = false;

CREATE INDEX IF NOT EXISTS idx_events_scroll
  ON analytics_events (client_id, page_path, scroll_milestone)
  WHERE event_type = 'scroll_depth' AND is_bot = false;

CREATE INDEX IF NOT EXISTS idx_events_milestone
  ON analytics_events (client_id, page_path, milestone_name)
  WHERE event_type = 'element_visible' AND is_bot = false;

CREATE INDEX IF NOT EXISTS idx_events_custom
  ON analytics_events (client_id, event_name, created_at DESC)
  WHERE event_type = 'custom_event' AND is_bot = false;

CREATE INDEX IF NOT EXISTS idx_events_journey
  ON analytics_events (client_id, session_id_fk, created_at)
  WHERE is_bot = false;

-- 6. Column / table comments
COMMENT ON COLUMN analytics_events.tier IS 'Subscription tier of the client when the event was captured (growth or premium).';
COMMENT ON COLUMN analytics_events.click_x_pct IS 'Horizontal click position as percentage of document width (0-100, one decimal). NULL for non-click events.';
COMMENT ON COLUMN analytics_events.click_y_pct IS 'Vertical click position as percentage of document height (0-100, one decimal). NULL for non-click events.';
COMMENT ON COLUMN analytics_events.scroll_milestone IS 'For scroll_depth events: which threshold was crossed (25, 50, 75, or 100). NULL otherwise.';
COMMENT ON COLUMN analytics_events.milestone_name IS 'For element_visible events: the friendly name from data-sq-milestone. NULL otherwise.';
COMMENT ON COLUMN analytics_events.seconds_on_page IS 'For page_exit events: total wall-clock seconds the visitor was on the page. NULL otherwise.';
COMMENT ON COLUMN analytics_events.event_name IS 'For custom_event: the friendly name from data-sq-track. NULL otherwise.';
COMMENT ON COLUMN analytics_events.element IS 'JSONB describing the interacted element: {tag, id, classes, text, href, track_name}.';
COMMENT ON TABLE custom_event_definitions IS 'Display metadata for custom events (data-sq-track). Dashboard joins to this for friendly rendering.';
COMMENT ON TABLE client_page_screenshots IS 'Per-page screenshots for heatmap backgrounds. Generated at site-build time, not by the tracker.';

-- 7. Storage bucket for page-screenshots
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'page-screenshots',
  'page-screenshots',
  true,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Service can manage page screenshots" ON storage.objects;
CREATE POLICY "Service can manage page screenshots"
  ON storage.objects FOR ALL
  USING (bucket_id = 'page-screenshots')
  WITH CHECK (bucket_id = 'page-screenshots');

DROP POLICY IF EXISTS "Public can read page screenshots" ON storage.objects;
CREATE POLICY "Public can read page screenshots"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'page-screenshots');

COMMIT;