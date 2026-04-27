import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Crown, ArrowRight, Sparkles, Loader2, CheckCircle2, Send, ExternalLink, Share2, Copy, Eye, ImageIcon,
  Pencil, Phone, Rocket,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { IntakeForm } from "@/components/intake/IntakeForm";
import type { IntakeData } from "@/components/intake/types";
import { SitePreviewFrame } from "@/components/operator/SitePreviewFrame";
import { useFileUpload } from "@/hooks/useFileUpload";
import confetti from "canvas-confetti";
import { buildSitePreviewUrl } from "@/lib/site-preview";

export default function ClientWebsite() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showIntake, setShowIntake] = useState(false);
  const [checklist, setChecklist] = useState({
    business_info: false,
    contact_info: false,
    services: false,
    photos: false,
    mobile: false,
  });
  const [feedbackText, setFeedbackText] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [hasSeenConfetti, setHasSeenConfetti] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);

  const { data: client } = useQuery({
    queryKey: ["my-client"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { uploadFile, uploading } = useFileUpload(client?.id || "");

  const { data: site } = useQuery({
    queryKey: ["my-site"],
    queryFn: async () => {
      if (!client) return null;
      const { data, error } = await supabase
        .from("sites")
        .select("*")
        .eq("client_id", client.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!client,
  });

  const { data: profile } = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Check for staging ready notification
  const { data: stagingNotification } = useQuery({
    queryKey: ["staging-notification", client?.id],
    queryFn: async () => {
      if (!client) return null;
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("client_id", client.id)
        .eq("type", "staging_ready")
        .eq("read", false)
        .maybeSingle();
      return data;
    },
    enabled: !!client,
  });

  // Calendly revision URL — per-client override or global default
  const { data: revisionUrl } = useQuery({
    queryKey: ["calendly-revision-url", client?.id],
    queryFn: async () => {
      if ((client as any)?.calendly_revision_url) return (client as any).calendly_revision_url as string;
      const { data } = await supabase
        .from("app_settings" as any)
        .select("value")
        .eq("key", "calendly_revision_url")
        .maybeSingle();
      return ((data as any)?.value as string) || "https://calendly.com/sitequeenai/revision-call";
    },
    enabled: !!client,
  });

  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showChangesForm, setShowChangesForm] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !client) return;
    const url = await uploadFile(file, "feedback");
    if (url) setAttachmentUrl(url);
  };

  const submitFeedback = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error("No client");
      // Pre-launch feedback: is_pre_launch = true, NO credits deduction
      const { error } = await supabase.from("change_requests").insert({
        client_id: client.id,
        request_text: feedbackText,
        change_type: "Pre-launch feedback",
        status: "submitted",
        is_pre_launch: true,
        credits_cost: 0,
        attachment_url: attachmentUrl,
      } as any);
      if (error) throw error;

      // Send confirmation email to client
      if (profile?.email) {
        await supabase.functions.invoke("send-email", {
          body: {
            to: profile.email,
            template: "prelaunch_feedback_client",
            data: {
              name: profile.full_name,
              first_name: (profile.full_name || "").split(" ")[0],
              approved_only: false,
            },
            clientId: client.id,
          },
        }).catch(console.error);
      }

      // Notify operator
      await supabase.functions.invoke("send-email", {
        body: {
          to: "hello@sitequeen.ai",
          template: "prelaunch_feedback_operator",
          data: {
            business_name: client.business_name,
            client_name: profile?.full_name || client.business_name,
            plan: client.plan,
            feedback_text: feedbackText,
            attachment_count: attachmentUrl ? 1 : 0,
          },
          clientId: client.id,
        },
      }).catch(console.error);
    },
    onSuccess: () => {
      toast.success("Feedback submitted! We'll review it shortly.");
      setFeedbackText("");
      setAttachmentUrl(null);
      setShowFeedback(false);
      queryClient.invalidateQueries({ queryKey: ["my-change-requests"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const approveWebsite = useMutation({
    mutationFn: async () => {
      if (!client || !site) throw new Error("Missing data");
      // CRITICAL: Set status to client_approved — DO NOT trigger deployment.
      // Only an operator can deploy.
      await supabase.from("sites").update({
        generation_status: "client_approved",
        client_approved_at: new Date().toISOString(),
      } as any).eq("id", site.id);

      await supabase.from("notifications").insert({
        type: "client_approved_site",
        client_id: client.id,
        message: `${client.business_name} has approved their website and is ready to go live ♛ — deploy when ready`,
        target_role: "operator",
      } as any);

      // Notify operator by email
      await supabase.functions.invoke("send-email", {
        body: {
          to: "hello@sitequeen.ai",
          template: "prelaunch_feedback_operator",
          data: {
            business_name: client.business_name,
            client_name: profile?.full_name || client.business_name,
            plan: client.plan,
            feedback_text: "✅ Client approved — ready to go live ♛",
            attachment_count: 0,
          },
          clientId: client.id,
        },
      }).catch(console.error);

      // Send approval confirmation to client
      if (profile?.email) {
        await supabase.functions.invoke("send-email", {
          body: {
            to: profile.email,
            template: "prelaunch_feedback_client",
            data: {
              name: profile.full_name,
              first_name: (profile.full_name || "").split(" ")[0],
              approved_only: true,
            },
            clientId: client.id,
          },
        }).catch(console.error);
      }
    },
    onSuccess: () => {
      toast.success("Approval received — we'll publish your site shortly ♛");
      setShowApproveModal(false);
      queryClient.invalidateQueries({ queryKey: ["my-site"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const bookRevisionCall = useMutation({
    mutationFn: async () => {
      if (!client || !site) throw new Error("Missing data");
      await supabase.from("sites").update({
        generation_status: "revision_call_scheduled",
      } as any).eq("id", site.id);
      await supabase.from("notifications").insert({
        type: "revision_call_scheduled",
        client_id: client.id,
        message: `${client.business_name} has booked a revision call — check your Calendly`,
        target_role: "operator",
      } as any);
      window.open(revisionUrl || "https://calendly.com/sitequeenai/revision-call", "_blank");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-site"] });
    },
    onError: (e) => toast.error(e.message),
  });

  if (!client) return null;

  const intakeCompleted = client.intake_completed;
  const intakeData = (site?.intake_data as IntakeData) || {};
  const intakeProgress = Math.round(((intakeData.completed_steps || []).length / 9) * 100);
  const generationStatus = (site as any)?.generation_status || "pending";
  const siteIsLive = client.site_status === "live";

  if (showIntake) {
    return (
      <IntakeForm
        clientId={client.id}
        userId={user!.id}
        plan={client.plan}
        businessName={client.business_name}
        onComplete={() => {
          setShowIntake(false);
          queryClient.invalidateQueries({ queryKey: ["my-client"] });
          queryClient.invalidateQueries({ queryKey: ["my-site"] });
        }}
      />
    );
  }

  const allChecked = Object.values(checklist).every(Boolean);

  // STATE 1: Intake not started
  if (!intakeCompleted && (!intakeData.current_step || intakeData.current_step <= 1)) {
    return (
      <div className="max-w-xl mx-auto text-center py-12 animate-in fade-in duration-300">
        <Crown className="h-16 w-16 text-primary mx-auto mb-6" />
        <h1 className="text-2xl font-bold mb-3">Let's build your website ♛</h1>
        <p className="text-muted-foreground mb-2">
          Answer a few questions about your business and we'll create a stunning website for you.
        </p>
        <p className="text-sm text-muted-foreground mb-8">Takes about 15 minutes</p>
        <Button size="lg" onClick={() => setShowIntake(true)} className="gap-2 text-lg px-8">
          <Sparkles className="h-5 w-5" /> Start my website brief
        </Button>
      </div>
    );
  }

  // STATE 2: Intake in progress
  if (!intakeCompleted) {
    return (
      <div className="max-w-xl mx-auto text-center py-12 animate-in fade-in duration-300">
        <Crown className="h-12 w-12 text-primary mx-auto mb-6" />
        <h1 className="text-2xl font-bold mb-3">Your website brief is in progress</h1>
        <Card className="max-w-sm mx-auto mb-6">
          <CardContent className="pt-5 pb-4">
            <Progress value={intakeProgress} className="h-3 mb-2" />
            <p className="text-sm font-medium">
              {intakeProgress}% complete — Step {intakeData.current_step || 1} of 9
            </p>
          </CardContent>
        </Card>
        <Button size="lg" onClick={() => setShowIntake(true)} className="gap-2">
          Continue where you left off <ArrowRight className="h-5 w-5" />
        </Button>
      </div>
    );
  }

  // STATE 3: Building
  const stagingReviewStatuses = ["shared", "awaiting_client_review", "pre_launch_revision", "revision_call_scheduled", "client_approved", "approved"];
  if (client.site_status === "building" && !stagingReviewStatuses.includes(generationStatus) && !siteIsLive) {
    const tips = [
      "Prepare your social media announcement",
      "Gather any extra photos you'd like to add later",
      "Think about your launch offer or promotion",
    ];

    return (
      <div className="max-w-xl mx-auto text-center py-12 animate-in fade-in duration-300">
        <div className="relative mx-auto mb-8 w-24 h-24">
          <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-pulse" />
          <div className="absolute inset-2 rounded-full border-4 border-primary/40 animate-pulse" style={{ animationDelay: "0.5s" }} />
          <div className="absolute inset-4 rounded-full bg-primary/10 flex items-center justify-center">
            <Crown className="h-8 w-8 text-primary" />
          </div>
        </div>
        <h1 className="text-2xl font-bold mb-3">Your website is being built ♛</h1>
        <p className="text-muted-foreground mb-8">
          Our team is working on your site right now. Usually ready within 24 hours.
        </p>
        <Card className="max-w-md mx-auto text-left">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">While you wait</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="text-primary font-bold">{i + 1}.</span> {tip}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  }

  // STATE 4: Staging review — three options (approve / request changes / book call)
  const inStagingReview = ["shared", "awaiting_client_review", "pre_launch_revision", "revision_call_scheduled"].includes(generationStatus);
  if (inStagingReview && site?.staging_url && !siteIsLive) {
    const allChecked = Object.values(checklist).every(Boolean);

    return (
      <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
        {/* Header banner — purple, with prominent Approve CTA */}
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="text-center sm:text-left">
              <h1 className="text-2xl font-bold mb-1">Your website is ready to preview ♛</h1>
              <p className="text-sm text-muted-foreground">
                Take your time reviewing it. When you're happy, approve it and our team will publish it to your domain.
              </p>
            </div>
            <Button
              onClick={() => setShowApproveModal(true)}
              size="lg"
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shrink-0"
            >
              <CheckCircle2 className="h-4 w-4" /> Approve my website
            </Button>
          </div>
        </div>

        {/* Status-specific banners */}
        {generationStatus === "pre_launch_revision" && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
            ✏ Your change request is in — we'll update the site and reshare with you shortly.
          </div>
        )}
        {generationStatus === "revision_call_scheduled" && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-sm">
            📞 Your revision call is booked. We'll review the site together and update it after the call.
          </div>
        )}

        {/* Full width preview iframe */}
        <Card>
          <CardContent className="pt-6">
            <SitePreviewFrame clientId={client.id} stagingUrl={site.staging_url} height={560} />
          </CardContent>
        </Card>

        {/* Three option cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Option 1 — Approve */}
          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="pb-3">
              <div className="text-2xl mb-1">✓</div>
              <CardTitle className="text-lg">Looks perfect ♛</CardTitle>
              <CardDescription>Happy with everything? Approve it and our team will publish it to your domain.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => setShowApproveModal(true)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                <CheckCircle2 className="h-4 w-4" /> Approve my website
              </Button>
            </CardContent>
          </Card>

          {/* Option 2 — Request small changes */}
          <Card className="border-l-4 border-l-amber-500">
            <CardHeader className="pb-3">
              <div className="text-2xl mb-1">✏</div>
              <CardTitle className="text-lg">Small changes needed</CardTitle>
              <CardDescription>Need a few tweaks? Tell us what to fix and we'll update it — no call needed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!showChangesForm ? (
                <Button
                  variant="outline"
                  onClick={() => setShowChangesForm(true)}
                  className="w-full border-amber-500 text-amber-700 hover:bg-amber-50 gap-2"
                >
                  <Pencil className="h-4 w-4" /> Request changes
                </Button>
              ) : (
                <>
                  <label className="text-xs font-medium">What would you like changed?</label>
                  <Textarea
                    placeholder="e.g. Can you update the phone number to 555-1234, change the hero headline to say 'Phoenix's Most Trusted Plumber', and swap the about section photo for the one I'm uploading below"
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    rows={5}
                    className="resize-none text-sm"
                  />
                  <div>
                    <label className="text-xs text-muted-foreground">Attach any reference files or new photos (optional)</label>
                    <Input type="file" accept="image/*,.pdf" onChange={handleFileUpload} className="mt-1 text-xs" disabled={Object.values(uploading).some(Boolean)} />
                    {attachmentUrl && <p className="text-xs text-emerald-600 mt-1">✓ File attached</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={async () => {
                        await submitFeedback.mutateAsync();
                        await supabase.from("sites").update({ generation_status: "pre_launch_revision" } as any).eq("id", site.id);
                        queryClient.invalidateQueries({ queryKey: ["my-site"] });
                      }}
                      disabled={!feedbackText.trim() || submitFeedback.isPending}
                      className="bg-amber-600 hover:bg-amber-700 text-white gap-2 flex-1"
                      size="sm"
                    >
                      {submitFeedback.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Submit changes
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowChangesForm(false)}>Cancel</Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Option 3 — Book a revision call */}
          <Card className="border-l-4 border-l-primary">
            <CardHeader className="pb-3">
              <div className="text-2xl mb-1">📞</div>
              <CardTitle className="text-lg">Let's talk it through</CardTitle>
              <CardDescription>
                Want to walk through the site together and discuss bigger changes? Book a free 15 minute revision call.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                onClick={() => bookRevisionCall.mutate()}
                disabled={bookRevisionCall.isPending}
                className="w-full gap-2"
              >
                {bookRevisionCall.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                Book a revision call
              </Button>
              <p className="text-xs text-muted-foreground">
                After booking you'll receive a confirmation email. We'll review the site together on the call.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Important note */}
        <p className="text-center text-xs text-muted-foreground italic">
          Once you publish, our team does a final check before pushing your site live to your domain. We'll notify you the moment it's up. ♛
        </p>

        {/* Publish confirmation modal */}
        <Dialog open={showApproveModal} onOpenChange={setShowApproveModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Ready to publish your website? ♛</DialogTitle>
              <DialogDescription>
                Tick each item to confirm — once published, we'll take your site live on your domain.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {[
                { key: "business_info", label: "My business information is correct" },
                { key: "contact_info", label: "My phone number and email are right" },
                { key: "services", label: "My services are accurate" },
                { key: "photos", label: "Photos look great" },
                { key: "mobile", label: "Looks good on mobile" },
              ].map((item) => (
                <label key={item.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={(checklist as any)[item.key]}
                    onCheckedChange={(v) => setChecklist((prev) => ({ ...prev, [item.key]: !!v }))}
                  />
                  {item.label}
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowApproveModal(false)}>Cancel</Button>
              <Button
                onClick={() => approveWebsite.mutate()}
                disabled={!allChecked || approveWebsite.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                {approveWebsite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Publish my website ♛
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // STATE 4b: Published, waiting to go live
  if ((generationStatus === "client_approved" || generationStatus === "approved") && !siteIsLive) {
    return (
      <div className="max-w-xl mx-auto text-center py-12 animate-in fade-in duration-300">
        <Rocket className="h-16 w-16 text-emerald-500 mx-auto mb-6" />
        <h1 className="text-2xl font-bold mb-3">You published your site ♛</h1>
        <p className="text-muted-foreground">
          We're pushing it live to your domain now. You'll get a notification the moment it's up.
        </p>
      </div>
    );
  }

  // STATE 5: Live
  if (siteIsLive) {
    const siteUrl = site?.deploy_url || buildSitePreviewUrl(client.id);
    const domainDisplay = client.domain_name || siteUrl;

    if (!hasSeenConfetti && siteUrl) {
      setHasSeenConfetti(true);
      setTimeout(() => {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      }, 300);
    }

    const shareText = `My new website is live! Check it out at ${domainDisplay} ♛ Built by @SiteQueen`;

    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
        <div className="text-center py-6">
          <h1 className="text-2xl font-bold mb-2">Your website is live ♛</h1>
          {domainDisplay && (
            <a
              href={siteUrl?.startsWith("http") ? siteUrl : `https://${siteUrl}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-lg text-primary hover:underline"
            >
              {domainDisplay} <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>

        {siteUrl && (
          <Card>
            <CardContent className="pt-6">
              <SitePreviewFrame clientId={client.id} stagingUrl={siteUrl} height={500} />
            </CardContent>
          </Card>
        )}

        {(site as any)?.using_stock_photos && !(site as any)?.stock_photos_replaced && (
          <Card className="bg-amber-50 border-amber-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-amber-900">
                <ImageIcon className="h-4 w-4" /> Make your website truly yours ♛
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-amber-900/90">
                Your site is currently using stock photography. Swapping them for real photos of your business — even iPhone shots — will make it look significantly more authentic and trustworthy.
              </p>
              <p className="text-sm text-amber-900/80">
                Submit a photo swap request using your credits (15 credits each).
              </p>
              <Button asChild size="sm" className="bg-amber-600 hover:bg-amber-700 text-white gap-2">
                <Link to="/dashboard/support">
                  <ImageIcon className="h-4 w-4" /> Submit a photo request
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Share2 className="h-4 w-4" /> Share your site
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/50 rounded-lg p-3 text-sm mb-3">{shareText}</div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                navigator.clipboard.writeText(shareText);
                toast.success("Copied to clipboard!");
              }}
            >
              <Copy className="h-4 w-4" /> Copy share text
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fallback
  return (
    <div className="max-w-xl mx-auto text-center py-12">
      <Crown className="h-12 w-12 text-primary mx-auto mb-4" />
      <h1 className="text-xl font-bold">Your website is on its way ♛</h1>
      <p className="text-muted-foreground mt-2">Check back soon for updates.</p>
    </div>
  );
}
