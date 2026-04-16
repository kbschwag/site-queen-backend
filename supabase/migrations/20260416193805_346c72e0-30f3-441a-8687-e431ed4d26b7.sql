ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS photos_provided boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS photo_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS using_stock_photos boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_photos_replaced boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS photo_rights_confirmed boolean DEFAULT false;