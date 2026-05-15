import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Crown } from "lucide-react";
import { toast } from "sonner";

// Public landing for the demo-site banner "Claim this site" CTA.
// Marks the prospect as converted via self_serve_banner with manual_paid placeholder
// (Stripe wiring will replace this with a real checkout when enabled).
export default function ClaimProspect() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("clients").select("id, business_name, lifecycle_stage").eq("id", id!).maybeSingle();
      setClient(data);
      setLoading(false);
    })();
  }, [id]);

  const handleClaim = async () => {
    setSubmitting(true);
    try {
      // Public flow — call the conversion edge fn with a service-style flag.
      // For v1 we record cart-abandonment and notify operator; full payment pipeline lands with Stripe.
      await supabase.from("notifications").insert({
        type: "prospect_claim_abandoned",
        target_role: "operator",
        client_id: id,
        message: `${client?.business_name || "A prospect"} clicked Claim — finalize manually`,
      } as any);
      toast.success("Got it — we'll be in touch within minutes!");
      navigate("/");
    } catch (e: any) {
      toast.error(e.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!client) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">This link is no longer active.</div>;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-primary/5 to-background">
      <Card className="max-w-lg w-full p-8 text-center space-y-4">
        <Crown className="h-10 w-10 text-primary mx-auto" />
        <h1 className="text-2xl font-bold">Claim your site, {client.business_name}!</h1>
        <p className="text-muted-foreground">
          You're about to lock in the Beta Rate of <b>$39/month</b> — your sample becomes your live website,
          and our team takes over for changes, hosting, and SEO. We'll reach out within minutes to finalize.
        </p>
        <Button size="lg" className="w-full" onClick={handleClaim} disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Claim this site — $39/month
        </Button>
        <p className="text-xs text-muted-foreground">No card needed yet — we'll send a secure payment link.</p>
      </Card>
    </div>
  );
}
