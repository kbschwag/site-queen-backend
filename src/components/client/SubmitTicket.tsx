import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Check, ArrowLeft, ArrowRight, Loader2, Upload, AlertTriangle, Zap, Crown } from "lucide-react";
import { useFileUpload } from "@/hooks/useFileUpload";

interface SubmitTicketProps {
  clientId: string;
  userId: string;
  creditsBalance: number;
  onBuyCredits: () => void;
  onSubmitted: () => void;
}

const categoryMeta: Record<string, { label: string; color: string; badgeClass: string }> = {
  micro: { label: "Micro changes", color: "bg-emerald-50 border-emerald-200", badgeClass: "bg-emerald-100 text-emerald-700" },
  content: { label: "Content changes", color: "bg-blue-50 border-blue-200", badgeClass: "bg-blue-100 text-blue-700" },
  medium: { label: "Medium changes", color: "bg-purple-50 border-purple-200", badgeClass: "bg-purple-100 text-purple-700" },
  large: { label: "Large changes", color: "bg-orange-50 border-orange-200", badgeClass: "bg-orange-100 text-orange-700" },
  custom: { label: "Not sure?", color: "bg-muted border-muted-foreground/20", badgeClass: "bg-muted text-muted-foreground" },
};

const placeholders: Record<string, string> = {
  "Phone number update": "Enter your new phone number and where you'd like it updated",
  "Email address update": "Enter your new email address",
  "Business hours update": "List your updated hours for each day",
  "Text correction": "Tell us exactly which text to fix and the correct wording",
  "Address update": "Enter your new business address",
  "Social media link": "Provide the social media platform and your new handle/URL",
  "Photo swap": "Describe which photo to replace and upload the new one below",
  "Service description update": "Which service and what changes to make",
  "Add or remove a service": "Describe the service to add or remove",
  "About us edit": "Describe what to change in your about section",
  "Testimonial update": "Provide the new testimonial text and customer name",
  "Team member update": "Which team member and what to update",
  "Multiple photo update": "List the photos to replace and upload new ones below",
  "Add new team member": "Provide name, title, bio, and upload their photo below",
  "Section rewrite": "Which section and what the new content should say",
  "Add new service (full)": "Describe the new service name, what it includes, pricing, and upload a photo if you have one",
  "FAQ update": "List the questions and answers to add or update",
  "Multiple section updates": "Describe all the sections and changes needed",
  "New page section": "Describe the new section you want added",
  "Major content overhaul": "Describe all the content changes needed across your site",
  "New feature addition": "Describe the feature you want added",
  "Navigation update": "Describe how you want the navigation restructured",
  "Not sure — let the team assess": "Describe what you need in as much detail as possible",
};

export function SubmitTicket({ clientId, userId, creditsBalance, onBuyCredits, onSubmitted }: SubmitTicketProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<any>(null);
  const [description, setDescription] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ticketRef, setTicketRef] = useState("");
  const { uploadFile, uploading } = useFileUpload(clientId);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);

  const { data: changeTypes = [] } = useQuery({
    queryKey: ["change-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("change_types")
        .select("*")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const grouped = changeTypes.reduce((acc: Record<string, any[]>, ct: any) => {
    (acc[ct.category] = acc[ct.category] || []).push(ct);
    return acc;
  }, {});

  const totalCost = (selectedType?.credits_cost || 0) + (isUrgent ? 10 : 0);
  const isCustom = selectedType?.category === "custom";
  const hasEnoughCredits = isCustom || creditsBalance >= totalCost;
  const balanceAfter = creditsBalance - totalCost;

  // Zero credits state
  if (creditsBalance === 0 && step === 1) {
    return (
      <div className="text-center py-12 space-y-4">
        <Crown className="h-12 w-12 text-primary mx-auto" />
        <h3 className="text-lg font-bold">You've used all your credits this month ♛</h3>
        <p className="text-muted-foreground text-sm">Buy more credits or upgrade your plan to submit requests.</p>
        <div className="flex gap-3 justify-center">
          <Button onClick={onBuyCredits} className="bg-amber-500 hover:bg-amber-600 gap-2">
            <Crown className="h-4 w-4" /> Buy credits
          </Button>
          <Button variant="outline">Upgrade plan</Button>
        </div>
      </div>
    );
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file, "tickets");
    if (url) setAttachmentUrl(url);
  };

  const handleSubmit = async () => {
    if (!selectedType) return;
    setSubmitting(true);
    try {
      const ref = `SQ-${Date.now().toString(36).toUpperCase()}`;
      const costToDeduct = isCustom ? 0 : totalCost;

      const { error } = await supabase.from("change_requests").insert({
        client_id: clientId,
        request_text: description + (additionalContext ? `\n\nAdditional context: ${additionalContext}` : ""),
        change_type: selectedType.name,
        credits_cost: costToDeduct,
        priority: isUrgent ? "urgent" : "normal",
        attachment_url: attachmentUrl,
        status: isCustom ? "pending_assessment" : "submitted",
      } as any);
      if (error) throw error;

      if (!isCustom && costToDeduct > 0) {
        const newBalance = creditsBalance - costToDeduct;
        await supabase.from("clients").update({ credits_balance: newBalance } as any).eq("id", clientId);
        await supabase.from("credits_transactions").insert({
          client_id: clientId,
          transaction_type: "ticket_spent",
          credits_amount: -costToDeduct,
          credits_balance_after: newBalance,
          description: `${selectedType.name}${isUrgent ? " (urgent)" : ""} — ticket ${ref}`,
        } as any);
      }

      // Send ticket submitted confirmation email
      supabase.functions.invoke("send-email", {
        body: {
          to: "", // will be resolved by the edge function via client lookup
          template: "ticket_submitted",
          data: {
            request_text: description,
            change_type: selectedType.name,
            credits_cost: isCustom ? null : costToDeduct,
            priority: isUrgent ? "urgent" : "normal",
          },
          clientId,
        },
      }).catch(console.error);

      setTicketRef(ref);
      setStep(3);
      queryClient.invalidateQueries({ queryKey: ["my-client"] });
      queryClient.invalidateQueries({ queryKey: ["my-change-requests"] });
      onSubmitted();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Step 3 — Confirmation
  if (step === 3) {
    return (
      <div className="text-center py-8 space-y-4">
        <Check className="h-12 w-12 text-emerald-600 mx-auto" />
        <h3 className="text-lg font-bold">Your request has been submitted ♛</h3>
        <p className="text-muted-foreground text-sm">
          {isCustom
            ? "We'll review your request and confirm the credit cost before making any changes. No credits have been deducted yet."
            : `We'll get to work within ${isUrgent ? "4 hours" : "24-48 hours"}.`}
        </p>
        <Badge variant="outline" className="text-base px-4 py-1">{ticketRef}</Badge>
        <div className="pt-4">
          <Button variant="outline" onClick={() => { setStep(1); setSelectedType(null); setDescription(""); setAdditionalContext(""); setIsUrgent(false); setAttachmentUrl(null); }}>
            Submit another request
          </Button>
        </div>
      </div>
    );
  }

  // Step 2 — Describe the change
  if (step === 2 && selectedType) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="gap-1 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Back to change types
        </Button>

        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
          <span className="text-sm font-medium">{selectedType.name}</span>
          {!isCustom && <Badge className={categoryMeta[selectedType.category]?.badgeClass}>{selectedType.credits_cost} credits</Badge>}
        </div>

        <div>
          <label className="text-sm font-medium">Describe exactly what you need changed</label>
          <Textarea
            className="mt-1.5 resize-none"
            rows={5}
            placeholder={placeholders[selectedType.name] || "Describe your change..."}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium">Attach photos, logos, or reference files</label>
          <div className="mt-1.5">
            <Input type="file" accept="image/*,.pdf" onChange={handleFileUpload} disabled={Object.values(uploading).some(Boolean)} />
            {uploading && <p className="text-xs text-muted-foreground mt-1">Uploading...</p>}
            {attachmentUrl && <p className="text-xs text-emerald-600 mt-1">✓ File attached</p>}
          </div>
        </div>

        {!isCustom && (
          <div className="flex items-center gap-3 p-3 rounded-lg border">
            <button
              onClick={() => setIsUrgent(!isUrgent)}
              className={`flex items-center gap-2 flex-1 text-left text-sm ${isUrgent ? "font-semibold" : ""}`}
            >
              <div className={`h-5 w-5 rounded border flex items-center justify-center ${isUrgent ? "bg-amber-500 border-amber-500" : "border-muted-foreground/30"}`}>
                {isUrgent && <Check className="h-3 w-3 text-white" />}
              </div>
              <Zap className="h-4 w-4 text-amber-500" />
              Urgent — +10 credits (4 hour processing)
            </button>
          </div>
        )}

        <div>
          <label className="text-sm font-medium">Any additional context? (optional)</label>
          <Textarea
            className="mt-1.5 resize-none"
            rows={2}
            placeholder="Anything else we should know..."
            value={additionalContext}
            onChange={(e) => setAdditionalContext(e.target.value)}
          />
        </div>

        <Separator />

        <Card className="bg-muted/30">
          <CardContent className="pt-4 pb-3 space-y-1.5 text-sm">
            <div className="flex justify-between"><span>Change type</span><span className="font-medium">{selectedType.name}</span></div>
            {!isCustom && (
              <>
                <div className="flex justify-between"><span>Credits cost</span><span>{selectedType.credits_cost}</span></div>
                {isUrgent && <div className="flex justify-between text-amber-600"><span>Urgent surcharge</span><span>+10</span></div>}
                <Separator />
                <div className="flex justify-between font-semibold"><span>Total</span><span>{totalCost} credits</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Remaining after</span><span>{balanceAfter} credits</span></div>
              </>
            )}
            {isCustom && <p className="text-xs text-muted-foreground">No credits deducted — we'll assess and confirm the cost first.</p>}
          </CardContent>
        </Card>

        {!hasEnoughCredits && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-destructive">You need {totalCost - creditsBalance} more credits</p>
              <div className="flex gap-2 mt-2">
                <Button size="sm" onClick={onBuyCredits} className="bg-amber-500 hover:bg-amber-600">Buy credits</Button>
                <Button size="sm" variant="outline">Upgrade plan</Button>
              </div>
            </div>
          </div>
        )}

        <Button
          className="w-full gap-2"
          onClick={handleSubmit}
          disabled={!description.trim() || submitting || (!hasEnoughCredits && !isCustom)}
        >
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</> : <><Check className="h-4 w-4" /> Submit request</>}
        </Button>
      </div>
    );
  }

  // Step 1 — Choose change type
  return (
    <div className="space-y-5">
      {(["micro", "content", "medium", "large", "custom"] as const).map((cat) => {
        const types = grouped[cat];
        if (!types?.length) return null;
        const meta = categoryMeta[cat];
        return (
          <div key={cat}>
            <h3 className="text-sm font-semibold mb-2">{meta.label}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {types.map((ct: any) => (
                <button
                  key={ct.id}
                  onClick={() => { setSelectedType(ct); setStep(2); }}
                  className={`text-left p-3 rounded-lg border transition-colors hover:border-primary/50 ${
                    selectedType?.id === ct.id ? "border-primary bg-primary/5" : "bg-card"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{ct.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{ct.description}</p>
                    </div>
                    {ct.credits_cost > 0 && (
                      <Badge className={`${meta.badgeClass} shrink-0 text-xs`}>{ct.credits_cost}</Badge>
                    )}
                    {ct.credits_cost === 0 && cat === "custom" && (
                      <Badge variant="outline" className="shrink-0 text-xs">Free</Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
