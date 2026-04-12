-- Drop the existing policy that doesn't work for anon users
DROP POLICY IF EXISTS "Anyone can submit applications" ON public.applications;

-- Recreate with correct roles (anon for unauthenticated, authenticated for logged-in)
CREATE POLICY "Anyone can submit applications"
ON public.applications
FOR INSERT
TO anon, authenticated
WITH CHECK (true);
