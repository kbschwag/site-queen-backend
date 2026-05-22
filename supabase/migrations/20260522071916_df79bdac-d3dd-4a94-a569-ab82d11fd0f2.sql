-- Function: seed default custom event definitions for a new client
CREATE OR REPLACE FUNCTION public.seed_default_custom_event_definitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.custom_event_definitions (client_id, event_name, display_name, description, icon) VALUES
    (NEW.id, 'quote_click', 'Quote Button Clicked', 'Visitor clicked the Get a Quote button', 'check-circle'),
    (NEW.id, 'cta_home_hero', 'Home Hero CTA', 'Visitor clicked the main hero call-to-action on the home page', 'arrow-right'),
    (NEW.id, 'cta_services_main', 'Services Page CTA', 'Visitor clicked the main call-to-action on the services page', 'arrow-right'),
    (NEW.id, 'learn_more_home', 'Learn More (Home)', 'Visitor clicked a Learn More link on the home page', 'info'),
    (NEW.id, 'service_expand', 'Service Detail Expanded', 'Visitor expanded a service detail panel', 'chevron-down'),
    (NEW.id, 'pdf_download', 'PDF Downloaded', 'Visitor downloaded a PDF', 'download'),
    (NEW.id, 'video_play', 'Video Played', 'Visitor started playing an embedded video', 'play')
  ON CONFLICT (client_id, event_name) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_custom_event_definitions ON public.clients;
CREATE TRIGGER trg_seed_custom_event_definitions
AFTER INSERT ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.seed_default_custom_event_definitions();

-- Backfill existing clients that have no custom event definitions yet
INSERT INTO public.custom_event_definitions (client_id, event_name, display_name, description, icon)
SELECT c.id, v.event_name, v.display_name, v.description, v.icon
FROM public.clients c
CROSS JOIN (VALUES
  ('quote_click',       'Quote Button Clicked',     'Visitor clicked the Get a Quote button',                              'check-circle'),
  ('cta_home_hero',     'Home Hero CTA',            'Visitor clicked the main hero call-to-action on the home page',       'arrow-right'),
  ('cta_services_main', 'Services Page CTA',        'Visitor clicked the main call-to-action on the services page',        'arrow-right'),
  ('learn_more_home',   'Learn More (Home)',        'Visitor clicked a Learn More link on the home page',                  'info'),
  ('service_expand',    'Service Detail Expanded',  'Visitor expanded a service detail panel',                             'chevron-down'),
  ('pdf_download',      'PDF Downloaded',           'Visitor downloaded a PDF',                                            'download'),
  ('video_play',        'Video Played',             'Visitor started playing an embedded video',                           'play')
) AS v(event_name, display_name, description, icon)
WHERE c.deleted_at IS NULL
ON CONFLICT (client_id, event_name) DO NOTHING;