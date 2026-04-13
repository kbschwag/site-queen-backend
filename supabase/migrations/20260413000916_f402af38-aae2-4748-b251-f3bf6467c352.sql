
-- Add credit fields to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS credits_balance integer DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS credits_monthly_allowance integer DEFAULT 10;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS credits_rollover_cap integer DEFAULT 20;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS credits_last_reset timestamp with time zone DEFAULT now();

-- Add ticket fields to change_requests
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS change_type text;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS credits_cost integer;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS credit_purchase_id text;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS assessed_by_operator boolean DEFAULT false;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS operator_notes text;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal';

-- Credits transactions table
CREATE TABLE IF NOT EXISTS public.credits_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  transaction_type text NOT NULL,
  credits_amount integer NOT NULL,
  credits_balance_after integer NOT NULL,
  description text,
  change_request_id uuid REFERENCES change_requests(id),
  stripe_payment_intent_id text
);

ALTER TABLE public.credits_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all credit transactions" ON public.credits_transactions FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert credit transactions" ON public.credits_transactions FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Partners can view all credit transactions" ON public.credits_transactions FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'partner'));
CREATE POLICY "Clients can view own transactions" ON public.credits_transactions FOR SELECT USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = credits_transactions.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Clients can insert own transactions" ON public.credits_transactions FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = credits_transactions.client_id AND clients.user_id = auth.uid()));

-- Credit packages table
CREATE TABLE IF NOT EXISTS public.credit_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  credits integer NOT NULL,
  price_cents integer NOT NULL,
  stripe_price_id text,
  active boolean DEFAULT true
);

ALTER TABLE public.credit_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active packages" ON public.credit_packages FOR SELECT USING (active = true);
CREATE POLICY "Admins can manage packages" ON public.credit_packages FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Change types table
CREATE TABLE IF NOT EXISTS public.change_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  name text NOT NULL,
  description text,
  credits_cost integer NOT NULL,
  examples text,
  active boolean DEFAULT true,
  sort_order integer
);

ALTER TABLE public.change_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active change types" ON public.change_types FOR SELECT USING (active = true);
CREATE POLICY "Admins can manage change types" ON public.change_types FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert credit packages
INSERT INTO public.credit_packages (name, credits, price_cents) VALUES
  ('10 credits', 10, 1500),
  ('30 credits', 30, 3500),
  ('100 credits', 100, 9900);

-- Insert change types
INSERT INTO public.change_types (category, name, description, credits_cost, examples, sort_order) VALUES
('micro', 'Phone number update', 'Update your business phone number anywhere on the site', 5, 'Change main number, add second number, update click-to-call', 1),
('micro', 'Email address update', 'Update your business email address', 5, 'Change contact email, update form submission email', 2),
('micro', 'Business hours update', 'Update your opening hours', 5, 'Change any day hours, add holiday hours, mark as closed', 3),
('micro', 'Text correction', 'Fix a typo or small wording change', 5, 'Spelling mistake, grammar fix, small rewording under 10 words', 4),
('micro', 'Address update', 'Update your business address', 5, 'New location, add suite number, update map link', 5),
('micro', 'Social media link', 'Add or update a social media link', 5, 'New Instagram handle, updated Facebook page, add TikTok', 6),
('content', 'Photo swap', 'Replace one existing photo with a new one', 15, 'New hero photo, updated team photo, fresh service image', 7),
('content', 'Service description update', 'Edit an existing service name or description', 15, 'Update what a service includes, change pricing, edit description', 8),
('content', 'Add or remove a service', 'Add one new service or remove an existing one', 15, 'New offering, discontinued service, seasonal service', 9),
('content', 'About us edit', 'Update your about section content', 15, 'New story, updated credentials, refreshed bio', 10),
('content', 'Testimonial update', 'Add or update one customer testimonial', 15, 'New review, update existing quote, add customer photo', 11),
('content', 'Team member update', 'Update existing team member information', 15, 'New title, updated bio, new photo', 12),
('medium', 'Multiple photo update', 'Add or replace up to 5 photos across the site', 30, 'Refresh service photos, new team photos, updated gallery', 13),
('medium', 'Add new team member', 'Add a brand new team member with photo and bio', 30, 'New hire, new partner, new staff member', 14),
('medium', 'Section rewrite', 'Completely rewrite one full section', 30, 'New about story, full services rewrite, updated homepage copy', 15),
('medium', 'Add new service (full)', 'Add a new service with full description and photo', 30, 'New offering with image, detailed description, and pricing', 16),
('medium', 'FAQ update', 'Add or update your FAQ section', 30, 'New questions, updated answers, reordered FAQs', 17),
('medium', 'Multiple section updates', 'Update content across multiple sections at once', 30, 'Homepage and services, about and team, multiple areas', 18),
('large', 'New page section', 'Add a completely new section to an existing page', 60, 'New gallery section, new awards section, new CTA section', 19),
('large', 'Major content overhaul', 'Significant rewrite across multiple sections', 60, 'Full homepage refresh, complete services update', 20),
('large', 'New feature addition', 'Add new functionality to your site', 60, 'Booking button, new contact form, WhatsApp button, map embed', 21),
('large', 'Navigation update', 'Restructure or update your site navigation', 60, 'New menu items, reordered links, new dropdown', 22),
('custom', 'Not sure — let the team assess', 'Describe what you need and we will tell you the credit cost before proceeding', 0, 'Anything that does not fit the categories above', 23);
