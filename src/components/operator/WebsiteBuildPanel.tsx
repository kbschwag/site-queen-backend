import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Globe, Eye, Send, CheckCircle2, AlertTriangle, Wrench, Loader2, Rocket
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SitePreviewFrame } from "./SitePreviewFrame";

interface Props {
  clientId: string;
  businessName: string;
}

export function WebsiteBuildPanel({ clientId, businessName }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [sharing, setSharing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [showGoLiveModal, setShowGoLiveModal] = useState(false);
  const [goLiveChecked, setGoLiveChecked] = useState(false);

  const { data: clientData } = useQuery({
    queryKey: ["operator-client-deploy-status", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("domain_name, domain_status, deployment_path_confirmed")
        .eq("id", clientId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: site, isLoading } = useQuery({
    queryKey: ["operator-site-build", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: preLaunchFeedback = [] } = useQuery({
    queryKey: ["pre-launch-feedback", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("change_requests")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Filter for pre-launch tagged ones
      return (data || []).filter((cr: any) =>
        cr.admin_notes?.includes("[PRE-LAUNCH]") || cr.status === "pre_launch"
      );
    },
  });

  const generationStatus = (site as any)?.generation_status || "pending";
  const stagingUrl = site?.staging_url;
  const generationError = (site as any)?.generation_error;

  const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    pending: { label: "Pending", color: "bg-muted text-muted-foreground", icon: Wrench },
    generating: { label: "Generating...", color: "bg-amber-500/10 text-amber-700 border-amber-200", icon: Loader2 },
    complete: { label: "Ready for your review", color: "bg-blue-500/10 text-blue-700 border-blue-200", icon: Eye },
    shared: { label: "Shared with client", color: "bg-purple-500/10 text-purple-700 border-purple-200", icon: Send },
    live: { label: "Live", color: "bg-emerald-500/10 text-emerald-700 border-emerald-200", icon: Globe },
    failed: { label: "Failed", color: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertTriangle },
    manual_review: { label: "Manual Review", color: "bg-amber-500/10 text-amber-700 border-amber-200", icon: Wrench },
  };

  const status = statusConfig[generationStatus] || statusConfig.pending;
  const StatusIcon = status.icon;

  const handleShareWithClient = async () => {
    setSharing(true);
    try {
      await supabase
        .from("sites")
        .update({ generation_status: "shared" } as any)
        .eq("client_id", clientId);

      // Send email notification to client
      await supabase.functions.invoke("send-email", {
        body: {
          to: null, // Edge function will look up client email
          template: "staging_ready",
          data: { business_name: businessName, staging_url: stagingUrl },
          clientId,
        },
      });

      // Create client notification
      await supabase.from("notifications").insert({
        type: "staging_ready",
        client_id: clientId,
        message: `Your website is ready to preview! ♛`,
        staging_url: stagingUrl,
        target_role: "client",
      } as any);

      await supabase.from("audit_log").insert({
        user_id: user!.id,
        user_email: user!.email,
        action: `Shared staging URL with client: ${businessName}`,
        target_table: "sites",
        target_id: clientId,
      });

      queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] });
      toast.success("Staging URL shared with client!");
    } catch (e) {
      toast.error("Failed to share with client");
    } finally {
      setSharing(false);
    }
  };

  const handleManualReview = async () => {
    await supabase
      .from("sites")
      .update({ generation_status: "manual_review" } as any)
      .eq("client_id", clientId);

    // Mark related notifications as read
    const { data: notifs } = await supabase
      .from("notifications")
      .select("id")
      .eq("client_id", clientId)
      .eq("read", false);
    if (notifs) {
      for (const n of notifs) {
        await supabase.from("notifications").update({ read: true } as any).eq("id", n.id);
      }
    }

    queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] });
    queryClient.invalidateQueries({ queryKey: ["operator-notifications"] });
    toast.success("Marked for manual review");
  };

  const handleApproveGoLive = async () => {
    setApproving(true);
    try {
      await supabase
        .from("sites")
        .update({ generation_status: "live" } as any)
        .eq("client_id", clientId);

      await supabase
        .from("clients")
        .update({ site_status: "live" } as any)
        .eq("id", clientId);

      // Send celebration email
      await supabase.functions.invoke("send-email", {
        body: {
          to: null,
          template: "site_live",
          data: { business_name: businessName, site_url: stagingUrl },
          clientId,
        },
      });

      // Client notification
      await supabase.from("notifications").insert({
        type: "site_live",
        client_id: clientId,
        message: `Your website is live! ♛ Congratulations!`,
        target_role: "client",
      } as any);

      await supabase.from("audit_log").insert({
        user_id: user!.id,
        user_email: user!.email,
        action: `Approved and set ${businessName} site to live`,
        target_table: "sites",
        target_id: clientId,
      });

      queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] });
      queryClient.invalidateQueries({ queryKey: ["operator-clients"] });
      toast.success("Site is now LIVE! 🎉");
    } catch (e) {
      toast.error("Failed to go live");
    } finally {
      setApproving(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Status Badge */}
      <div className="flex items-center gap-3">
        <Badge className={status.color}>
          <StatusIcon className={`h-3 w-3 mr-1 ${generationStatus === "generating" ? "animate-spin" : ""}`} />
          {status.label}
        </Badge>
        {(site as any)?.generated_at && (
          <span className="text-xs text-muted-foreground">
            Generated {new Date((site as any).generated_at).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Ready for review */}
      {generationStatus === "complete" && stagingUrl && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <SitePreviewFrame clientId={clientId} stagingUrl={stagingUrl} height={500} />
            <div className="flex gap-2">
              <Button onClick={handleShareWithClient} disabled={sharing} className="gap-2 flex-1">
                {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Share with client for review
              </Button>
              <Button variant="outline" onClick={handleManualReview} className="gap-2">
                <Wrench className="h-4 w-4" /> I'll work on it
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shared with client */}
      {generationStatus === "shared" && stagingUrl && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Shared with Client</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <SitePreviewFrame clientId={clientId} stagingUrl={stagingUrl} height={400} />
            {preLaunchFeedback.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Client Feedback</h4>
                {preLaunchFeedback.map((fb: any) => (
                  <div key={fb.id} className="bg-muted/50 rounded-lg p-3 text-sm">
                    <p>{fb.request_text}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(fb.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleApproveGoLive} disabled={approving} className="gap-2 flex-1 bg-emerald-600 hover:bg-emerald-700">
                {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Approve & Go Live
              </Button>
              <Button variant="outline" onClick={handleManualReview} className="gap-2">
                <Wrench className="h-4 w-4" /> I'll work on it
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Failed */}
      {generationStatus === "failed" && (
        <Card className="border-destructive/30">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Generation Failed</p>
                <p className="text-sm text-muted-foreground">{generationError || "Unknown error"}</p>
              </div>
            </div>
            <Button variant="outline" onClick={handleManualReview} className="gap-2">
              <Wrench className="h-4 w-4" /> I'll work on it
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Manual review */}
      {generationStatus === "manual_review" && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wrench className="h-4 w-4" />
              <span>You're handling this build manually.</span>
            </div>
             <SitePreviewFrame clientId={clientId} stagingUrl={stagingUrl} height={300} />
          </CardContent>
        </Card>
      )}

      {/* Live */}
      {generationStatus === "live" && (
        <Card className="border-emerald-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Site is live!</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
