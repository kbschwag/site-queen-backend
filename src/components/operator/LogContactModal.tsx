import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  currentStage?: string;
  onLogged?: () => void;
}

export function LogContactModal({ open, onOpenChange, clientId, currentStage, onLogged }: Props) {
  const { user } = useAuth();
  const [channel, setChannel] = useState("email");
  const [note, setNote] = useState("");
  const defaultDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [followup, setFollowup] = useState(defaultDate);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await supabase.from("prospect_contact_log" as any).insert({
        client_id: clientId,
        created_by: user?.id,
        channel,
        note: note || null,
        next_followup_date: followup || null,
      });
      const updates: any = {
        date_last_contacted: new Date().toISOString(),
        outreach_channel: channel,
        next_followup_date: followup || null,
      };
      if (currentStage === "prospect") updates.lifecycle_stage = "pitched";
      await supabase.from("clients").update(updates).eq("id", clientId);
      toast.success("Contact logged");
      setNote("");
      onLogged?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to log contact");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Log Contact</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Channel</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="dm">DM</SelectItem>
                <SelectItem value="call">Call</SelectItem>
                <SelectItem value="in_person">In Person</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>What happened (optional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div>
            <Label>Next follow-up</Label>
            <Input type="date" value={followup} onChange={(e) => setFollowup(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>Log Contact</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
