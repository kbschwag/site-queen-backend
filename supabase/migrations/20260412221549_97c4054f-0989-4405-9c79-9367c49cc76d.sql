
UPDATE auth.users 
SET email_confirmed_at = now(),
    updated_at = now()
WHERE id = '496ee624-e6e2-4479-99bb-20545baebb63';
