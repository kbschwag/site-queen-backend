import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Crown,
  ArrowRight,
  Sparkles,
  Loader2,
  CheckCircle2,
  Send,
  ExternalLink,
  Share2,
  Copy,
} from "lucide-react";
import { IntakeForm } from "@/components/intake/IntakeForm";
import type { IntakeData } from "@/components/intake/types";
import { SitePreviewFrame } from "@/components/operator/SitePreviewFrame";
import confetti from "canvas-confetti";

export default function ClientWebsite() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showIntake, setShowIntake] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
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

  const submitFeedback = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error("No client");
      const { error } = await supabase.from("change_requests").insert({
        client_id: client.id,
        request_text: feedbackText,
        change_type: "Pre-launch revision",
        status: "submitted",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Feedback submitted! We'll review it shortly.");
      setFeedbackText("");
      setShowFeedback(false);
      queryClient.invalidateQueries({ queryKey: ["my-change-requests"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const approveWebsite = useMutation({
    mutationFn: async () => {
      if (!client || !site) throw new Error("Missing data");
      // Notify operator
      await supabase.from("notifications").insert({
        type: "client_approved_site",
        client_id: client.id,
        message: `${client.business_name} approved their website for launch ♛`,
        target_role: "operator",
      } as any);
      // Update site status
      await supabase.from("sites").update({ generation_status: "approved" } as any).eq("id", site.id);
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

  // Show intake form full screen
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

  // Helper: render iframe preview
  const renderPreview = (url: string) => {
    const iframeWidth = previewMode === "mobile" ? 390 : "100%";
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Button
            variant={previewMode === "desktop" ? "default" : "outline"}
            size="sm"
            onClick={() => setPreviewMode("desktop")}
            className="gap-1"
          >
            <Monitor className="h-4 w-4" /> Desktop
          </Button>
          <Button
            variant={previewMode === "mobile" ? "default" : "outline"}
            size="sm"
            onClick={() => setPreviewMode("mobile")}
            className="gap-1"
          >
            <Smartphone className="h-4 w-4" /> Mobile
          </Button>
        </div>
        <div className={`border rounded-lg overflow-hidden bg-background ${previewMode === "mobile" ? "mx-auto border-2 rounded-2xl" : ""}`}
          style={{ width: iframeWidth, height: previewMode === "mobile" ? 700 : 500 }}
        >
          <iframe
            src={url}
            className="w-full h-full"
            title="Website preview"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
        <div className="mt-2">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Open in new tab <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    );
  };

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
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-center">
          <h1 className="text-xl font-bold">Your website is ready to preview ♛</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Preview */}
          <div className="lg:col-span-2">
            <Card>
              <CardContent className="pt-6">
                {renderPreview(site.staging_url)}
              </CardContent>
            </Card>
          </div>

          {/* Action panel */}
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
                  <Textarea
                    placeholder="Describe what needs changing..."
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={() => submitFeedback.mutate()}
                      disabled={!feedbackText.trim() || submitFeedback.isPending}
                      className="gap-2 flex-1"
                      size="sm"
                    >
                      {submitFeedback.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Submit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowFeedback(false)}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowFeedback(true)}
              >
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

    // Fire confetti once
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
              {renderPreview(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`)}
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
