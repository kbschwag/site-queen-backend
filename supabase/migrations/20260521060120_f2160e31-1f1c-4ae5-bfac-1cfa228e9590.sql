-- Create public 'tracker' bucket for hosted tracker JS
INSERT INTO storage.buckets (id, name, public)
VALUES ('tracker', 'tracker', true)
ON CONFLICT (id) DO NOTHING;

-- Public read policy
CREATE POLICY "Tracker bucket public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'tracker');

-- Service-role writes only (no anon/authenticated insert/update/delete policies)
-- Service role bypasses RLS, so edge functions and the upload tool can manage it.