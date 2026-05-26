
-- Operator chat tables for the new Claude-powered chat workflow.

CREATE TABLE public.operator_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_operator_chats_client ON public.operator_chats(client_id);
CREATE INDEX idx_operator_chats_operator ON public.operator_chats(operator_id);

CREATE TABLE public.operator_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.operator_chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content JSONB NOT NULL,
  tool_name TEXT,
  tool_input JSONB,
  tool_result JSONB,
  requires_confirmation BOOLEAN NOT NULL DEFAULT false,
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_operator_chat_messages_chat ON public.operator_chat_messages(chat_id, created_at);

ALTER TABLE public.operator_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_chat_messages ENABLE ROW LEVEL SECURITY;

-- Helper: is the caller an operator (admin or partner)?
CREATE OR REPLACE FUNCTION public.is_operator(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id AND role IN ('partner','admin'))
$$;

-- Chats: any operator can view/manage operator chats
CREATE POLICY "Operators view all chats" ON public.operator_chats
  FOR SELECT USING (public.is_operator(auth.uid()));
CREATE POLICY "Operators insert chats" ON public.operator_chats
  FOR INSERT WITH CHECK (public.is_operator(auth.uid()) AND operator_id = auth.uid());
CREATE POLICY "Operators update chats" ON public.operator_chats
  FOR UPDATE USING (public.is_operator(auth.uid()));

CREATE POLICY "Operators view chat messages" ON public.operator_chat_messages
  FOR SELECT USING (public.is_operator(auth.uid()));
CREATE POLICY "Operators insert chat messages" ON public.operator_chat_messages
  FOR INSERT WITH CHECK (public.is_operator(auth.uid()));
CREATE POLICY "Operators update chat messages" ON public.operator_chat_messages
  FOR UPDATE USING (public.is_operator(auth.uid()));

CREATE TRIGGER trg_operator_chats_updated
  BEFORE UPDATE ON public.operator_chats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
