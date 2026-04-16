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
} from "lucide-react";
import { Link } from "react-router-dom";
import { IntakeForm } from "@/components/intake/IntakeForm";
import type { IntakeData } from "@/components/intake/types";
import { SitePreviewFrame } from "@/components/operator/SitePreviewFrame";
import { useFileUpload } from "@/hooks/useFileUpload";
import confetti from "canvas-confetti";

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
      await supabase.from("notifications").insert({
        type: "client_approved_site",
        client_id: client.id,
        message: `${client.business_name} approved their website for launch ♛`,
        target_role: "operator",
      } as any);
      await supabase.from("sites").update({ generation_status: "approved" } as any).eq("id", site.id);

      // Send approval confirmation
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
      toast.success("Website approved! We'll make it live shortly ♛");
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
  if (client.site_status === "building" && generationStatus !== "shared" && generationStatus !== "approved") {
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

  // STATE 4: Staging review
  if ((generationStatus === "shared" && site?.staging_url) && !siteIsLive && generationStatus !== "approved") {
    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
        {/* Banner notification */}
        {stagingNotification && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Eye className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium text-sm">Your website is ready to preview ♛</p>
                <p className="text-xs text-muted-foreground">Take a look and let us know what you think</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => {
              window.open(site.staging_url || "#", "_blank");
            }} className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" /> View preview
            </Button>
          </div>
        )}

        <div className="text-center">
          <h1 className="text-xl font-bold">Your website is ready to preview ♛</h1>
          <p className="text-sm text-muted-foreground mt-1">This is pre-launch feedback — no credits will be used</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardContent className="pt-6">
                <SitePreviewFrame clientId={client.id} stagingUrl={site.staging_url} height={500} />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Looking good?</CardTitle>
                <CardDescription>
                  Review your site carefully. Check all your information is correct and everything reads well on mobile.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { key: "business_info", label: "My business information is correct" },
                  { key: "contact_info", label: "My phone number and email are right" },
                  { key: "services", label: "My services are accurate" },
                  { key: "photos", label: "Photos look great" },
                  { key: "mobile", label: "Site looks good on mobile" },
                ].map((item) => (
                  <label key={item.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={(checklist as any)[item.key]}
                      onCheckedChange={(v) => setChecklist((prev) => ({ ...prev, [item.key]: !!v }))}
                    />
                    {item.label}
                  </label>
                ))}
              </CardContent>
            </Card>

            {showFeedback ? (
              <Card>
                <CardContent className="pt-5 space-y-3">
                  <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs">Pre-launch feedback — no credits used</Badge>
                  <Textarea
                    placeholder="Describe what needs changing..."
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                  <div>
                    <label className="text-xs text-muted-foreground">Attach a file (optional)</label>
                    <Input type="file" accept="image/*,.pdf" onChange={handleFileUpload} className="mt-1" />
                    {attachmentUrl && <p className="text-xs text-emerald-600 mt-1">✓ File attached</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => submitFeedback.mutate()}
                      disabled={!feedbackText.trim() || submitFeedback.isPending}
                      className="gap-2 flex-1"
                      size="sm"
                    >
                      {submitFeedback.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Submit feedback
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowFeedback(false)}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => setShowFeedback(true)}>
                Request changes before approving
              </Button>
            )}

            <Button
              className="w-full gap-2"
              disabled={!allChecked || approveWebsite.isPending}
              onClick={() => {
                if (confirm("Are you sure everything looks great?")) {
                  approveWebsite.mutate();
                }
              }}
            >
              {approveWebsite.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Approve my website ♛
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // STATE 4b: Approved, waiting to go live
  if (generationStatus === "approved" && !siteIsLive) {
    return (
      <div className="max-w-xl mx-auto text-center py-12 animate-in fade-in duration-300">
        <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto mb-6" />
        <h1 className="text-2xl font-bold mb-3">You approved your site ♛</h1>
        <p className="text-muted-foreground">
          We'll make it live shortly. You'll get a notification when it's ready.
        </p>
      </div>
    );
  }

  // STATE 5: Live
  if (siteIsLive) {
    const siteUrl = site?.deploy_url || site?.staging_url || client.domain_name;
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
