
-- Add generation columns to sites table
ALTER TABLE public.sites 
  ADD COLUMN IF NOT EXISTS generation_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS generation_error text;

-- Allow clients to update their own site (for intake submission)
CREATE POLICY "Clients can update own site"
ON public.sites FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM clients WHERE clients.id = sites.client_id AND clients.user_id = auth.uid()
));

-- Create notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  message text NOT NULL,
  staging_url text,
  read boolean NOT NULL DEFAULT false,
  target_role text NOT NULL DEFAULT 'operator'
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all notifications"
ON public.notifications FOR SELECT
USING (target_role = 'operator' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update notifications"
ON public.notifications FOR UPDATE
USING (target_role = 'operator' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view own notifications"
ON public.notifications FOR SELECT
USING (
  target_role = 'client' AND
  EXISTS (SELECT 1 FROM clients WHERE clients.id = notifications.client_id AND clients.user_id = auth.uid())
);

CREATE POLICY "Clients can update own notifications"
ON public.notifications FOR UPDATE
USING (
  target_role = 'client' AND
  EXISTS (SELECT 1 FROM clients WHERE clients.id = notifications.client_id AND clients.user_id = auth.uid())
);

-- Service role can insert notifications (from edge functions)
CREATE POLICY "Service role can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (true);

-- Create generation_logs table
CREATE TABLE public.generation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  template_id text,
  status text NOT NULL DEFAULT 'pending',
  tokens_used integer,
  error_message text
);

ALTER TABLE public.generation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view generation logs"
ON public.generation_logs FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert generation logs"
ON public.generation_logs FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Service role insert for edge functions
CREATE POLICY "Service role can insert generation logs"
ON public.generation_logs FOR INSERT
WITH CHECK (true);

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('templates', 'templates', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('generated-sites', 'generated-sites', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for templates bucket (public read, admin write)
CREATE POLICY "Public can read templates"
ON storage.objects FOR SELECT
USING (bucket_id = 'templates');

CREATE POLICY "Admins can manage templates"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'templates' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update templates"
ON storage.objects FOR UPDATE
USING (bucket_id = 'templates' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete templates"
ON storage.objects FOR DELETE
USING (bucket_id = 'templates' AND has_role(auth.uid(), 'admin'::app_role));

-- Storage policies for generated-sites bucket (public read, service role writes via edge function)
CREATE POLICY "Public can read generated sites"
ON storage.objects FOR SELECT
USING (bucket_id = 'generated-sites');

CREATE POLICY "Anyone can upload to generated sites"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'generated-sites');

CREATE POLICY "Anyone can update generated sites"
ON storage.objects FOR UPDATE
USING (bucket_id = 'generated-sites');
