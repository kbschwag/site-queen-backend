
-- Create app_role enum for user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles without recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin')),
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- Applications table
CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  business_name TEXT NOT NULL,
  business_type TEXT NOT NULL,
  city_state TEXT NOT NULL,
  has_website TEXT NOT NULL,
  years_in_business TEXT NOT NULL,
  monthly_clients TEXT NOT NULL,
  monthly_revenue TEXT NOT NULL,
  is_decision_maker BOOLEAN NOT NULL DEFAULT true,
  website_goal TEXT,
  brand_vibe TEXT,
  has_logo TEXT,
  logo_url TEXT,
  plan_interest TEXT,
  accepts_commitment TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  ai_score INTEGER DEFAULT 0,
  lead_temperature TEXT DEFAULT 'COLD' CHECK (lead_temperature IN ('HOT', 'WARM', 'COLD')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'scheduled')),
  notes TEXT
);
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Anyone can submit applications (public write)
CREATE POLICY "Anyone can submit applications" ON public.applications FOR INSERT WITH CHECK (true);
-- Admins can read all applications
CREATE POLICY "Admins can read applications" ON public.applications FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
-- Admins can update applications
CREATE POLICY "Admins can update applications" ON public.applications FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- Clients table
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  application_id UUID REFERENCES public.applications(id),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  business_type TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'growth', 'pro')),
  site_url TEXT,
  site_status TEXT DEFAULT 'building' CHECK (site_status IN ('building', 'live', 'paused', 'cancelled')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT DEFAULT 'active',
  next_billing_date TIMESTAMPTZ,
  updates_used_this_month INTEGER DEFAULT 0,
  updates_limit INTEGER DEFAULT 0,
  join_date TIMESTAMPTZ DEFAULT now(),
  last_active TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own record" ON public.clients FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Clients can update own record" ON public.clients FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all clients" ON public.clients FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update all clients" ON public.clients FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert clients" ON public.clients FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Change requests table
CREATE TABLE public.change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  request_text TEXT NOT NULL,
  attachment_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'needs_review')),
  ai_processed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  admin_notes TEXT
);
ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own requests" ON public.change_requests FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.clients WHERE clients.id = change_requests.client_id AND clients.user_id = auth.uid())
);
CREATE POLICY "Clients can create requests" ON public.change_requests FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.clients WHERE clients.id = change_requests.client_id AND clients.user_id = auth.uid())
);
CREATE POLICY "Admins can view all requests" ON public.change_requests FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update all requests" ON public.change_requests FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- Sites table
CREATE TABLE public.sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated TIMESTAMPTZ DEFAULT now(),
  deploy_url TEXT,
  staging_url TEXT,
  template_used TEXT,
  business_type TEXT,
  brand_vibe TEXT,
  primary_color TEXT,
  logo_url TEXT,
  intake_data JSONB
);
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own site" ON public.sites FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.clients WHERE clients.id = sites.client_id AND clients.user_id = auth.uid())
);
CREATE POLICY "Admins can view all sites" ON public.sites FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage all sites" ON public.sites FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Emails log table
CREATE TABLE public.emails_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipient_email TEXT NOT NULL,
  email_type TEXT NOT NULL,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  client_id UUID REFERENCES public.clients(id),
  application_id UUID REFERENCES public.applications(id)
);
ALTER TABLE public.emails_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all emails" ON public.emails_log FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert emails" ON public.emails_log FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- user_roles policies
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sites_updated_at BEFORE UPDATE ON public.sites FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, role)
  VALUES (NEW.id, NEW.email, 'client');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
