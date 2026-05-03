CREATE TABLE public.client_ftp_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  ftp_host text NOT NULL,
  ftp_user text NOT NULL,
  ftp_password text NOT NULL,
  ftp_path text NOT NULL DEFAULT '/public_html/',
  ftp_port integer NOT NULL DEFAULT 21,
  use_secure boolean NOT NULL DEFAULT true,
  tested_at timestamptz,
  test_passed boolean,
  test_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_ftp_credentials ENABLE ROW LEVEL SECURITY;

-- Only admins can manage. The password column is never exposed to clients;
-- edge functions use the service role to read it.
CREATE POLICY "Admins can view ftp credentials"
  ON public.client_ftp_credentials FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert ftp credentials"
  ON public.client_ftp_credentials FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update ftp credentials"
  ON public.client_ftp_credentials FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete ftp credentials"
  ON public.client_ftp_credentials FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_client_ftp_credentials_updated_at
  BEFORE UPDATE ON public.client_ftp_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();