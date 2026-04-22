ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS blog_addon_requested boolean DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS booking_addon_requested boolean DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS custom_font_url text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS custom_font_name text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS preferred_font text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS logo_addon_requested boolean DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS primary_color text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS accent_color text;