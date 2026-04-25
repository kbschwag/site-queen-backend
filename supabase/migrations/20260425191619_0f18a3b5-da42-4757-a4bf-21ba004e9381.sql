-- Move existing trades-hero files into a dedicated folder with standardized names
UPDATE storage.objects SET name = 'trades-hero/index.html'
  WHERE bucket_id = 'templates' AND name = 'trades-hero.html';

UPDATE storage.objects SET name = 'trades-hero/about.html'
  WHERE bucket_id = 'templates' AND name = 'trades-hero-about.html';

UPDATE storage.objects SET name = 'trades-hero/services.html'
  WHERE bucket_id = 'templates' AND name = 'trades-hero-services.html';