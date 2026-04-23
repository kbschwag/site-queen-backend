-- Ensure generated-sites bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-sites', 'generated-sites', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing policies if present so we can recreate cleanly
DROP POLICY IF EXISTS "Allow all operations on generated-sites" ON storage.objects;
DROP POLICY IF EXISTS "Public read generated-sites" ON storage.objects;

-- Service role: full access to the bucket
CREATE POLICY "Allow all operations on generated-sites"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'generated-sites')
WITH CHECK (bucket_id = 'generated-sites');

-- Public: read access to generated site files
CREATE POLICY "Public read generated-sites"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'generated-sites');