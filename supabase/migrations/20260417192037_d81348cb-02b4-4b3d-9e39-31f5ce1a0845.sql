-- Clear all data tables (in dependency order)
DELETE FROM public.analytics_events;
DELETE FROM public.analytics_daily_summary;
DELETE FROM public.credits_transactions;
DELETE FROM public.change_requests;
DELETE FROM public.call_notes;
DELETE FROM public.generation_logs;
DELETE FROM public.payment_events;
DELETE FROM public.scheduled_emails;
DELETE FROM public.notifications;
DELETE FROM public.emails_log;
DELETE FROM public.audit_log;
DELETE FROM public.rate_limits;
DELETE FROM public.sites;
DELETE FROM public.clients;
DELETE FROM public.applications;
DELETE FROM public.staff_permissions;
DELETE FROM public.user_roles;
DELETE FROM public.profiles;

-- Delete all auth users (full wipe)
DELETE FROM auth.users;