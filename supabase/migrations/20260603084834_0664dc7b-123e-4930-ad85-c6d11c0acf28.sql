UPDATE public.sites
SET intake_data = jsonb_set(
      COALESCE(intake_data, '{}'::jsonb),
      '{portfolio_photos}',
      COALESCE(intake_data->'portfolio_photos', '[]'::jsonb) ||
        '["https://onrvqbygwzhmhgkctcrm.supabase.co/storage/v1/object/public/client-uploads/2471a93f-dba5-40dd-8630-1273672c4d96/portfolio/1780476467847.jpg","https://onrvqbygwzhmhgkctcrm.supabase.co/storage/v1/object/public/client-uploads/2471a93f-dba5-40dd-8630-1273672c4d96/portfolio/1780476469851.jpg","https://onrvqbygwzhmhgkctcrm.supabase.co/storage/v1/object/public/client-uploads/2471a93f-dba5-40dd-8630-1273672c4d96/portfolio/1780476474498.jpg","https://onrvqbygwzhmhgkctcrm.supabase.co/storage/v1/object/public/client-uploads/2471a93f-dba5-40dd-8630-1273672c4d96/portfolio/1780476476272.jpg","https://onrvqbygwzhmhgkctcrm.supabase.co/storage/v1/object/public/client-uploads/2471a93f-dba5-40dd-8630-1273672c4d96/portfolio/1780476482338.jpg"]'::jsonb
    ),
    photos_provided = true,
    using_stock_photos = false,
    photo_count = COALESCE(photo_count, 0) + 5
WHERE client_id = '2471a93f-dba5-40dd-8630-1273672c4d96';