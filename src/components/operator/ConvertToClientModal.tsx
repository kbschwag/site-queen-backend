import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  businessName?: string;
  onConverted?: () => void;
}

export function ConvertToClientModal({ open, onOpenChange, clientId, businessName, onConverted }: Props) {
  const [paymentMethod, setPaymentMethod] = useState("manual_paid");
  const [plan, setPlan] = useState("beta");
  const [domain, setDomain] = useState("");
  const [noDomain, setNoDomain] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("convert-prospect-to-client", {
        body: {
          client_id: clientId,
          payment_method: paymentMethod,
          plan,
          domain: domain || null,
          no_domain_yet: noDomain,
          conversation_notes: notes,
          conversion_source: "operator_manual",
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`${businessName || "Prospect"} converted to client`);
      onConverted?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Conversion failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Convert to Client</DialogTitle></DialogHeader>

        <div className="space-y-5">
          <div>
            <Label className="mb-2 block">Payment method</Label>
            <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod}>
              <div className="flex items-start gap-2 opacity-50">
                <RadioGroupItem value="stripe_subscription" id="pm1" disabled />
                <label htmlFor="pm1" className="text-sm">Send a payment link <span className="text-xs text-muted-foreground">(Stripe — coming soon)</span></label>
              </div>
              <div className="flex items-start gap-2 opacity-50">
                <RadioGroupItem value="charge_now" id="pm2" disabled />
                <label htmlFor="pm2" className="text-sm">Charge a card now <span className="text-xs text-muted-foreground">(Stripe — coming soon)</span></label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="manual_paid" id="pm3" />
                <label htmlFor="pm3" className="text-sm">Mark as paid manually (Venmo, cash, etc.)</label>
              </div>
            </RadioGroup>
          </div>

          <div>
            <Label className="mb-2 block">Plan</Label>
            <RadioGroup value={plan} onValueChange={setPlan} className="flex gap-4">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="beta" id="pl1" />
                <label htmlFor="pl1" className="text-sm">Beta Rate ($39)</label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="growth" id="pl2" />
                <label htmlFor="pl2" className="text-sm">Growth ($129)</label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="pro" id="pl3" />
                <label htmlFor="pl3" className="text-sm">Pro ($199)</label>
              </div>
            </RadioGroup>
          </div>

          <div>
            <Label>Domain</Label>
            <Input value={domain} onChange={(e) => setDomain(e.target.value)} disabled={noDomain} placeholder="example.com" />
            <label className="flex items-center gap-2 text-sm mt-2">
              <Checkbox checked={noDomain} onCheckedChange={(v) => setNoDomain(!!v)} />
              They don't have one yet
            </label>
          </div>

          <div>
            <Label>Notes from conversation (becomes their first change request)</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Convert and Notify Client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
