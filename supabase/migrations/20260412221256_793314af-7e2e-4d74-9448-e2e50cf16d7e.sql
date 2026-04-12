
-- Drop old constraint and add expanded one
ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role = ANY (ARRAY['client'::text, 'admin'::text, 'owner'::text, 'partner'::text, 'team_member'::text]));

-- Update profile role to owner
UPDATE public.profiles SET role = 'owner' WHERE user_id = '496ee624-e6e2-4479-99bb-20545baebb63';

-- Add admin role for RLS access
INSERT INTO public.user_roles (user_id, role) VALUES ('496ee624-e6e2-4479-99bb-20545baebb63', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
