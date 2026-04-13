
-- Applications table additions
ALTER TABLE applications ADD COLUMN IF NOT EXISTS approval_note text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS decline_note text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS approved_by uuid;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS declined_by uuid;

-- Clients table additions
ALTER TABLE clients ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'current';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS payment_failed_count integer DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS suspension_date timestamptz;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone_number text;

-- Change requests table additions
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS is_pre_launch boolean DEFAULT false;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS needs_info_note text;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS client_info_response text;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS client_info_attachments text[];

-- Payment events table
CREATE TABLE IF NOT EXISTS payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  amount_cents integer,
  currency text DEFAULT 'usd',
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  failure_reason text,
  warning_1_sent_at timestamptz,
  warning_2_sent_at timestamptz,
  warning_3_sent_at timestamptz,
  resolved_at timestamptz,
  resolved boolean DEFAULT false
);

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage payment events"
  ON payment_events FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Partners can view payment events"
  ON payment_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'partner'));

CREATE POLICY "Clients can view own payment events"
  ON payment_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = payment_events.client_id AND clients.user_id = auth.uid()));

-- Scheduled emails table
CREATE TABLE IF NOT EXISTS scheduled_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  send_at timestamptz NOT NULL,
  email_type text NOT NULL,
  recipient_email text NOT NULL,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  payload jsonb,
  sent boolean DEFAULT false,
  sent_at timestamptz,
  cancelled boolean DEFAULT false
);

ALTER TABLE scheduled_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage scheduled emails"
  ON scheduled_emails FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Partners can view scheduled emails"
  ON scheduled_emails FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'partner'));
