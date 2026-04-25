
CREATE TABLE public.form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  name text,
  phone text,
  email text,
  service text,
  message text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text
);

CREATE INDEX idx_form_submissions_client_id ON public.form_submissions(client_id);
CREATE INDEX idx_form_submissions_submitted_at ON public.form_submissions(submitted_at DESC);

ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own form submissions"
ON public.form_submissions FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.clients
  WHERE clients.id = form_submissions.client_id
    AND clients.user_id = auth.uid()
));

CREATE POLICY "Admins can view all form submissions"
ON public.form_submissions FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Partners can view all form submissions"
ON public.form_submissions FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'partner'
));
