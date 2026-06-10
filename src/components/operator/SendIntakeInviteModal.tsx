import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInvited?: (clientId: string) => void;
}

export function SendIntakeInviteModal({ open, onOpenChange, onInvited }: Props) {
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [plan, setPlan] = useState("starter");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setEmail("");
    setBusinessName("");
    setPlan("starter");
  };

  const handleSubmit = async () => {
    if (!email.trim() || !businessName.trim()) {
      toast.error("Email and business name are required");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-intake-invite", {
        body: { email: email.trim(), business_name: businessName.trim(), plan },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      if ((data as any)?.emailSent) {
        toast.success(`Intake invite sent to ${email}`);
      } else {
        toast.warning(`Client created, but email failed to send: ${(data as any)?.emailError || "unknown"}`);
      }
      onInvited?.((data as any).clientId);
      onOpenChange(false);
      reset();
    } catch (e: any) {
      toast.error(e.message || "Failed to send invite");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send Intake Form</DialogTitle>
          <DialogDescription>
            Creates a client account and emails them a link to set their password and fill out their intake form.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="invite-business">Business name *</Label>
            <Input
              id="invite-business"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Acme Plumbing"
              maxLength={120}
            />
          </div>
          <div>
            <Label htmlFor="invite-email">Email *</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@example.com"
              maxLength={255}
            />
          </div>
          <div>
            <Label className="mb-2 block">Plan</Label>
            <RadioGroup value={plan} onValueChange={setPlan} className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="starter" id="pl-starter" /> Starter / Beta
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="growth" id="pl-growth" /> Growth
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="pro" id="pl-pro" /> Pro
              </label>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send Intake Form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
