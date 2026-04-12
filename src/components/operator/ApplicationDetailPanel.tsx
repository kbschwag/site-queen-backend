import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOperatorRole } from "@/hooks/useOperatorRole";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Crown, Calendar, X, Flag, ThumbsDown } from "lucide-react";

interface Props {
  application: any;
  onClose: () => void;
}

export default function ApplicationDetailPanel({ application, onClose }: Props) {
  const { user } = useAuth();
  const { isOwner, isPartner, canReviewApplications } = useOperatorRole();
  const queryClient = useQueryClient();

  const [note, setNote] = useState("");
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [convertPlan, setConvertPlan] = useState(application.plan_interest || "starter");
  const [loading, setLoading] = useState(false);

  const canTakeAction = isOwner || isPartner || canReviewApplications;
  const app = application;

  const addNote = async () => {
    if (!note.trim()) return;
    const existingNotes = app.notes || "";
    const timestamp = new Date().toLocaleString();
    const newNote = `${existingNotes}\n[${timestamp} — ${user?.email}]: ${note}`.trim();

    await supabase.from("applications").update({ notes: newNote }).eq("id", app.id);

    // Audit log
    await supabase.from("audit_log").insert({
      user_id: user!.id,
      user_email: user!.email,
      action: `Added note to application: ${app.business_name}`,
      target_table: "applications",
      target_id: app.id,
    });

    setNote("");
    queryClient.invalidateQueries({ queryKey: ["operator-applications"] });
    toast.success("Note added");
  };

  const handleDecline = async () => {
    setLoading(true);
    await supabase.from("applications").update({ status: "declined", decline_reason: declineReason }).eq("id", app.id);

    // Send decline email
    supabase.functions.invoke("send-email", {
      body: { to: app.email, template: "application_declined", data: { name: app.name }, applicationId: app.id },
    }).catch(console.error);

    await supabase.from("audit_log").insert({
      user_id: user!.id,
      user_email: user!.email,
      action: `Declined application: ${app.business_name}`,
      target_table: "applications",
      target_id: app.id,
      details: { reason: declineReason },
    });

    queryClient.invalidateQueries({ queryKey: ["operator-applications"] });
    toast.success("Application declined");
    setShowDeclineModal(false);
    setLoading(false);
    onClose();
  };

  const handleFlag = async () => {
    await supabase.from("applications").update({ status: "needs_review" }).eq("id", app.id);
    await supabase.from("audit_log").insert({
      user_id: user!.id, user_email: user!.email,
      action: `Flagged application: ${app.business_name}`,
      target_table: "applications", target_id: app.id,
    });
    queryClient.invalidateQueries({ queryKey: ["operator-applications"] });
    toast.success("Application flagged for review");
  };

  const handleConvert = async () => {
    setLoading(true);
    try {
      // Call the convert-to-client edge function (handles auth account, client, site, email, audit)
      const { data, error: invokeError } = await supabase.functions.invoke("convert-to-client", {
        body: {
          applicationId: app.id,
          plan: convertPlan,
          callerEmail: user!.email,
          callerName: user!.user_metadata?.full_name || user!.email,
        },
      });

      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);

      queryClient.invalidateQueries({ queryKey: ["operator-applications"] });
      queryClient.invalidateQueries({ queryKey: ["operator-dashboard-stats"] });
      toast.success(`${app.business_name} is now a SiteQueen client ♛`);
      setShowConvertModal(false);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to convert");
    }
    setLoading(false);
  };

  const fieldRow = (label: string, value: any) => (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%]">{value || "—"}</span>
    </div>
  );

  return (
    <>
      <Sheet open onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {app.business_name}
              {app.lead_temperature === "HOT" && <Badge className="bg-amber-500 text-white">🔥 HOT</Badge>}
              {app.lead_temperature === "WARM" && <Badge className="bg-primary/80 text-primary-foreground">💜 WARM</Badge>}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {/* Score */}
            <div className="flex items-center gap-3">
              <div className="text-3xl font-bold">{app.ai_score ?? "—"}</div>
              <div>
                <p className="text-sm font-medium">AI Score</p>
                <p className="text-xs text-muted-foreground">{app.lead_temperature} lead</p>
              </div>
            </div>

            {app.status === "needs_review" && app.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm font-medium text-amber-800">⚠️ Flag Reason</p>
                <p className="text-sm text-amber-700 mt-1">{app.notes}</p>
              </div>
            )}

            <Separator />

            {/* All form answers */}
            <div>
              <h3 className="font-semibold mb-2">Business Info</h3>
              {fieldRow("Business Type", app.business_type)}
              {fieldRow("Business Name", app.business_name)}
              {fieldRow("Industry", app.industry)}
              {fieldRow("Location", [app.city, app.state_province, app.country].filter(Boolean).join(", "))}
              {fieldRow("Has Website", app.has_website)}
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">Business Health</h3>
              {fieldRow("Years in Business", app.years_in_business)}
              {fieldRow("Monthly Clients", app.monthly_clients)}
              {fieldRow("Decision Maker", app.decision_maker_status)}
              {fieldRow("Restricted Niches", app.restricted_niches)}
              {fieldRow("Update Frequency", app.update_frequency)}
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">Website Vision</h3>
              {fieldRow("Website Goal", app.website_goal)}
              {fieldRow("Brand Vibe", app.brand_vibe)}
              {fieldRow("Has Logo", app.has_logo)}
              {app.logo_url && (
                <div className="mt-2">
                  <img src={app.logo_url} alt="Logo" className="h-16 rounded border" />
                </div>
              )}
              {fieldRow("Inspiration", app.inspiration_urls)}
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">Commitment & Contact</h3>
              {fieldRow("Plan Interest", app.plan_interest)}
              {fieldRow("Accepts Commitment", app.accepts_commitment)}
              {fieldRow("Name", app.name)}
              {fieldRow("Email", app.email)}
              {fieldRow("Phone", app.phone)}
              {fieldRow("Additional Notes", app.additional_notes)}
            </div>

            <Separator />

            {/* Internal notes */}
            <div>
              <h3 className="font-semibold mb-2">Internal Notes</h3>
              {app.notes && (
                <pre className="text-xs bg-muted p-3 rounded whitespace-pre-wrap mb-3">{app.notes}</pre>
              )}
              <div className="flex gap-2">
                <Textarea
                  placeholder="Add an internal note..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="text-sm"
                  rows={2}
                />
                <Button size="sm" onClick={addNote} disabled={!note.trim()}>Add</Button>
              </div>
            </div>

            <Separator />

            {/* Actions */}
            {canTakeAction && app.status !== "converted" && app.status !== "declined" && (
              <div className="space-y-2">
                <Button
                  className="w-full gap-2"
                  onClick={() => setShowConvertModal(true)}
                >
                  <Crown className="h-4 w-4" /> Convert to Client ♛
                </Button>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={() => window.open("https://calendly.com/sitequeenai/30min", "_blank")}
                  >
                    <Calendar className="h-4 w-4" /> Schedule Call
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 gap-2 text-destructive hover:text-destructive"
                    onClick={() => setShowDeclineModal(true)}
                  >
                    <ThumbsDown className="h-4 w-4" /> Decline
                  </Button>
                </div>

                {app.status !== "needs_review" && (
                  <Button variant="ghost" className="w-full gap-2" onClick={handleFlag}>
                    <Flag className="h-4 w-4" /> Flag for Review
                  </Button>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Convert modal */}
      <Dialog open={showConvertModal} onOpenChange={setShowConvertModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert to Client ♛</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="font-medium">{app.name}</p>
              <p className="text-sm text-muted-foreground">{app.business_name}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Plan</label>
              <Select value={convertPlan} onValueChange={setConvertPlan}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter — $79/mo</SelectItem>
                  <SelectItem value="growth">Growth — $129/mo</SelectItem>
                  <SelectItem value="pro">Pro — $199/mo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConvertModal(false)}>Cancel</Button>
            <Button onClick={handleConvert} disabled={loading} className="gap-2">
              {loading ? "Converting..." : <><Crown className="h-4 w-4" /> Yes, convert to client</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decline modal */}
      <Dialog open={showDeclineModal} onOpenChange={setShowDeclineModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Application</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will decline {app.name}'s application and send them a warm rejection email.
            </p>
            <Textarea
              placeholder="Internal reason (not shown to applicant)..."
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeclineModal(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDecline} disabled={loading}>
              {loading ? "Declining..." : "Confirm Decline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
