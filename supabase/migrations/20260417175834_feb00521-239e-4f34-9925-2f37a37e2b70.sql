-- 1. Soft-delete the duplicate older Maximus Beauty record (keep newest)
UPDATE public.clients
SET deleted_at = now()
WHERE id = '32128320-628b-45e9-88d4-a181f9fefb99'
  AND deleted_at IS NULL;

-- 2. Soft-delete the stale "Addis unique finds" client on the same user_id
UPDATE public.clients
SET deleted_at = now()
WHERE id = 'a3dd2074-731a-422e-aba4-9d6d7c3658b1'
  AND deleted_at IS NULL;

-- 3. Prevent future duplicates: only one active client per user_id
CREATE UNIQUE INDEX IF NOT EXISTS clients_active_user_id_unique
  ON public.clients (user_id)
  WHERE deleted_at IS NULL AND user_id IS NOT NULL;