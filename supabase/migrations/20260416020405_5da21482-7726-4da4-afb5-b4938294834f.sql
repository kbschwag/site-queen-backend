
-- Create call_notes table
CREATE TABLE IF NOT EXISTS public.call_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE UNIQUE,
  
  their_story text,
  ideal_customer text,
  inspiration_sites jsonb DEFAULT '[]'::jsonb,
  instagram_handle text,
  google_search_terms text,
  
  website_goal text,
  contact_preferences text[] DEFAULT '{}',
  booking_url text,
  
  pages_agreed jsonb DEFAULT '[]'::jsonb,
  
  template_selected text,
  color_direction text,
  vibe_notes text,
  tone_of_voice text,
  tone_custom text,
  
  expert_additions text,
  expert_avoid text,
  exact_phrases text,
  
  final_notes text,
  internal_notes text,
  
  completed boolean DEFAULT false,
  completed_at timestamp with time zone,
  completed_by uuid
);

-- Enable RLS
ALTER TABLE public.call_notes ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage call notes"
  ON public.call_notes FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Partners can view call notes"
  ON public.call_notes FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'partner'));

CREATE POLICY "Partners can update call notes"
  ON public.call_notes FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'partner'));

CREATE POLICY "Partners can insert call notes"
  ON public.call_notes FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'partner'));

-- Auto-update updated_at
CREATE TRIGGER update_call_notes_updated_at
  BEFORE UPDATE ON public.call_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add columns to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS call_notes_completed boolean DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS call_notes_completed_at timestamp with time zone;
