import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SitePreviewFrame } from "./SitePreviewFrame";
import { toast } from "sonner";
import {
  Globe, Eye, Send, CheckCircle2, AlertTriangle, Wrench, Loader2, Rocket, Sparkles, ImageIcon, Mail, Pencil, Phone, RefreshCw,
} from "lucide-react";
import { QuickEditPanel } from "./QuickEditPanel";
import { FailureCard } from "./GenerationFailureCard";
import { CodeEditorModal } from "./CodeEditorModal";
import { useFileUpload } from "@/hooks/useFileUpload";
import { Code2 } from "lucide-react";
import { buildSitePreviewUrl } from "@/lib/site-preview";

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
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareNote, setShareNote] = useState("");
  const [goLiveChecked, setGoLiveChecked] = useState(false);
  const [requestingPhotos, setRequestingPhotos] = useState(false);
  const [togglingStockReplaced, setTogglingStockReplaced] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedClientId, setAdvancedClientId] = useState("");
  const [advancedTriggering, setAdvancedTriggering] = useState(false);

  const { data: clientData } = useQuery({
    queryKey: ["operator-client-deploy-status", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("domain_name, domain_status, deployment_path_confirmed, user_id, intake_completed, call_notes_completed, site_status")
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

  // Check whether an index.html exists in the deploy backup folder so we know
  // to show the code editor button.
  const { data: hasGeneratedFile } = useQuery({
    queryKey: ["operator-site-html-exists", clientId, (site as any)?.generated_at, (site as any)?.last_updated],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("generated-sites")
        .list(`${clientId}/deploy`, { limit: 50 });
      if (error) return false;
      return (data || []).some((f: any) => f.name === "index.html");
    },
  });

  // Look up client email for sending emails
  const { data: clientProfile } = useQuery({
    queryKey: ["operator-client-profile", clientId],
    queryFn: async () => {
      if (!(clientData as any)?.user_id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("user_id", (clientData as any).user_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!(clientData as any)?.user_id,
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
      return (data || []).filter((cr: any) =>
        cr.is_pre_launch === true || cr.admin_notes?.includes("[PRE-LAUNCH]") || cr.status === "pre_launch"
      );
    },
  });

  const generationStatus = (site as any)?.generation_status || "pending";
  const stagingUrl = site?.staging_url;
  const sharePreviewUrl = buildSitePreviewUrl(clientId);
  const generationError = (site as any)?.generation_error;

  const statusConfig: Record<string, { label: string; color: string; icon: any; pulse?: boolean }> = {
    pending: { label: "Pending", color: "bg-muted text-muted-foreground", icon: Wrench },
    generating: { label: "Generating...", color: "bg-amber-500/10 text-amber-700 border-amber-200", icon: Loader2 },
    complete: { label: "Ready for operator review", color: "bg-amber-500/10 text-amber-700 border-amber-200", icon: Eye, pulse: true },
    shared: { label: "Awaiting client review", color: "bg-purple-500/10 text-purple-700 border-purple-200", icon: Send },
    awaiting_client_review: { label: "Awaiting client review", color: "bg-purple-500/10 text-purple-700 border-purple-200", icon: Send },
    pre_launch_revision: { label: "Pre-launch revision requested", color: "bg-amber-500/10 text-amber-700 border-amber-200", icon: Pencil },
    revision_call_scheduled: { label: "Revision call scheduled", color: "bg-purple-500/10 text-purple-700 border-purple-200", icon: Phone },
    client_approved: { label: "Client approved — ready to deploy", color: "bg-emerald-500/10 text-emerald-700 border-emerald-200", icon: CheckCircle2, pulse: true },
    approved: { label: "Client approved — ready to deploy", color: "bg-emerald-500/10 text-emerald-700 border-emerald-200", icon: CheckCircle2, pulse: true },
    live: { label: "Live", color: "bg-emerald-500/10 text-emerald-700 border-emerald-200", icon: Globe },
    failed: { label: "Failed", color: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertTriangle },
    manual_review: { label: "Manual Review", color: "bg-amber-500/10 text-amber-700 border-amber-200", icon: Wrench },
  };

  const status = statusConfig[generationStatus] || statusConfig.pending;
  const StatusIcon = status.icon;

  const handleShareWithClient = async (isReshare = false) => {
    setSharing(true);
    try {
      const updatePayload: any = { generation_status: "awaiting_client_review" };
      if (isReshare) {
        updatePayload.last_reshared_at = new Date().toISOString();
        updatePayload.reshared_count = ((site as any)?.reshared_count ?? 0) + 1;
      }
      await supabase.from("sites").update(updatePayload).eq("client_id", clientId);

      // Send website ready for review email
      if (clientProfile?.email) {
        await supabase.functions.invoke("send-email", {
          body: {
            to: clientProfile.email,
            template: "website_ready_for_review",
            data: {
              name: clientProfile.full_name || businessName,
              first_name: (clientProfile.full_name || "").split(" ")[0] || businessName,
              business_name: businessName,
              staging_url: sharePreviewUrl,
              operator_note: shareNote || null,
              using_stock_photos: !!(site as any)?.using_stock_photos,
            },
            clientId,
          },
        });
      }

      // Create client notification
      await supabase.from("notifications").insert({
        type: "staging_ready",
        client_id: clientId,
        message: `Your website is ready to preview ♛ — take a look and let us know what you think`,
        staging_url: sharePreviewUrl,
        target_role: "client",
      } as any);

      await supabase.from("audit_log").insert({
        user_id: user!.id, user_email: user!.email,
        action: `Shared staging URL with client: ${businessName}`,
        target_table: "sites", target_id: clientId,
      });

      queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] });
      toast.success("Staging URL shared with client & email sent!");
      setShowShareModal(false);
      setShareNote("");
    } catch (e) {
      toast.error("Failed to share with client");
    } finally {
      setSharing(false);
    }
  };

  const handleManualReview = async () => {
    await supabase.from("sites").update({ generation_status: "manual_review" } as any).eq("client_id", clientId);

    const { data: notifs } = await supabase.from("notifications").select("id").eq("client_id", clientId).eq("read", false);
    if (notifs) {
      for (const n of notifs) {
        await supabase.from("notifications").update({ read: true } as any).eq("id", n.id);
      }
    }

    queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] });
    queryClient.invalidateQueries({ queryKey: ["operator-notifications"] });
    toast.success("Marked for manual review");
  };

  const isClientApproved = generationStatus === "client_approved" || generationStatus === "approved";
  const domainReady = (clientData as any)?.domain_status === "ready_to_deploy";
  const deployConfirmed = !!(clientData as any)?.deployment_path_confirmed;
  const canGoLive = isClientApproved && domainReady && deployConfirmed;

  const goLiveTooltip = !isClientApproved
    ? "Waiting for client approval"
    : !domainReady
    ? "Set domain status to Ready to deploy first"
    : !deployConfirmed
    ? "Confirm deployment path in Domain & Deploy tab first"
    : "";

  const handleApproveGoLive = async () => {
    setApproving(true);
    setShowGoLiveModal(false);
    setGoLiveChecked(false);
    try {
      const { data: deployResult, error: deployError } = await supabase.functions.invoke("deploy-to-hostinger", {
        body: { client_id: clientId },
      });

      if (deployError) {
        console.error("Deploy function error, updating statuses manually:", deployError);
        await supabase.from("sites").update({ generation_status: "live" } as any).eq("client_id", clientId);
        await supabase.from("clients").update({ site_status: "live" } as any).eq("id", clientId);
      }

      // Send site live email
      if (clientProfile?.email) {
        await supabase.functions.invoke("send-email", {
          body: {
            to: clientProfile.email,
            template: "site_live",
            data: {
              name: clientProfile.full_name || businessName,
              first_name: (clientProfile.full_name || "").split(" ")[0] || businessName,
              business_name: businessName,
                site_url: sharePreviewUrl,
                domain: (clientData as any)?.domain_name || sharePreviewUrl,
            },
            clientId,
          },
        });
      }

      await supabase.from("notifications").insert({
        type: "site_live",
        client_id: clientId,
        message: `Your website is live! ♛ Congratulations!`,
        target_role: "client",
      } as any);

      await supabase.from("audit_log").insert({
        user_id: user!.id, user_email: user!.email,
        action: `Approved and set ${businessName} site to live`,
        target_table: "sites", target_id: clientId,
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

  const photosProvided = !!(site as any)?.photos_provided;
  const photoCount = (site as any)?.photo_count || 0;
  const usingStockPhotos = !!(site as any)?.using_stock_photos;
  const stockPhotosReplaced = !!(site as any)?.stock_photos_replaced;

  const handleRequestPhotos = async () => {
    if (!clientProfile?.email) {
      toast.error("No client email on file");
      return;
    }
    setRequestingPhotos(true);
    try {
      await supabase.functions.invoke("send-email", {
        body: {
          to: clientProfile.email,
          template: "request_photos",
          data: {
            name: clientProfile.full_name || businessName,
            first_name: (clientProfile.full_name || "").split(" ")[0] || businessName,
            business_name: businessName,
          },
          clientId,
        },
      });
      await supabase.from("audit_log").insert({
        user_id: user!.id, user_email: user!.email,
        action: `Requested photos from ${businessName}`,
        target_table: "sites", target_id: clientId,
      });
      toast.success("Photo request email sent ♛");
    } catch {
      toast.error("Failed to send photo request");
    } finally {
      setRequestingPhotos(false);
    }
  };

  const handleToggleStockReplaced = async () => {
    setTogglingStockReplaced(true);
    try {
      await supabase
        .from("sites")
        .update({ stock_photos_replaced: !stockPhotosReplaced } as any)
        .eq("client_id", clientId);
      await supabase.from("audit_log").insert({
        user_id: user!.id, user_email: user!.email,
        action: `Marked stock photos as ${!stockPhotosReplaced ? "replaced" : "not replaced"} for ${businessName}`,
        target_table: "sites", target_id: clientId,
      });
      queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] });
      toast.success(!stockPhotosReplaced ? "Marked as replaced ♛" : "Marked as not replaced");
    } catch {
      toast.error("Failed to update");
    } finally {
      setTogglingStockReplaced(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Status Badge + toolbar */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge className={status.color}>
            <StatusIcon className={`h-3 w-3 mr-1 ${generationStatus === "generating" ? "animate-spin" : ""}`} />
            {status.label}
          </Badge>
          {(site as any)?.generated_at && (
            <span className="text-xs text-muted-foreground">
              Generated {new Date((site as any).generated_at).toLocaleDateString()}
            </span>
          )}
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {hasGeneratedFile && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowCodeEditor(true)}
                className="gap-1.5"
              >
                <Code2 className="h-3.5 w-3.5" />
                {"< > View / edit code"}
              </Button>
            )}
            {(clientData as any)?.site_status !== "live" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowRegenerateModal(true)}
                disabled={regenerating}
                className="gap-1.5"
              >
                {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Regenerate website ♛
              </Button>
            )}
          </div>
        </div>

        {/* Generation error details (collapsed) */}
        {generationStatus === "failed" && generationError && (
          <details className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium text-destructive">
              View generation error
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-destructive/90 font-mono">
              {generationError}
            </pre>
          </details>
        )}

        {/* Advanced collapsible */}
        {(clientData as any)?.site_status !== "live" && (
          <div className="text-xs">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Advanced {advancedOpen ? "▴" : "▾"}
            </button>
            {advancedOpen && (
              <div className="mt-2 p-3 rounded-md border bg-muted/30 space-y-2">
                <label className="text-xs font-medium">Trigger generation by Client ID</label>
                <div className="flex gap-2">
                  <Input
                    value={advancedClientId}
                    onChange={(e) => setAdvancedClientId(e.target.value)}
                    placeholder="client-uuid"
                    className="text-xs h-8"
                  />
                  <Button
                    size="sm"
                    disabled={advancedTriggering || !advancedClientId.trim()}
                    onClick={async () => {
                      setAdvancedTriggering(true);
                      try {
                        const { error } = await supabase.functions.invoke("generate-website", {
                          body: { client_id: advancedClientId.trim() },
                        });
                        if (error) throw error;
                        toast.success("Generation triggered ♛");
                        setAdvancedClientId("");
                      } catch (e: any) {
                        toast.error(e?.message || "Failed to trigger generation");
                      } finally {
                        setAdvancedTriggering(false);
                      }
                    }}
                    className="gap-1.5"
                  >
                    {advancedTriggering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    Generate ♛
                  </Button>
                </div>
                <p className="text-[11px] text-amber-600">
                  ⚠ This will overwrite any existing generated site for this client.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Photo status — only meaningful once intake is done */}
      {(clientData as any)?.intake_completed && (
        <Card className={photosProvided ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}>
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
              {photosProvided ? (
                <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200">
                  {photoCount} photo{photoCount === 1 ? "" : "s"} uploaded ✓
                </Badge>
              ) : (
                <Badge className="bg-amber-500/10 text-amber-700 border-amber-200">
                  No photos — stock imagery will be used
                </Badge>
              )}
              {usingStockPhotos && stockPhotosReplaced && (
                <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200">
                  Stock replaced ♛
                </Badge>
              )}
              {usingStockPhotos && !stockPhotosReplaced && photosProvided === false && (
                <Badge variant="outline" className="text-xs">Stock not yet replaced</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {!photosProvided && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRequestPhotos}
                  disabled={requestingPhotos}
                  className="gap-2"
                >
                  {requestingPhotos ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                  Request photos from client
                </Button>
              )}
              {usingStockPhotos && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleToggleStockReplaced}
                  disabled={togglingStockReplaced}
                  className="gap-2 text-xs"
                >
                  {togglingStockReplaced ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {stockPhotosReplaced ? "Mark as not replaced" : "Mark stock as replaced"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending — show generate button with state indicators */}
      {generationStatus === "pending" && (() => {
        const intakeComplete = !!(clientData as any)?.intake_completed;
        const callNotesComplete = !!(clientData as any)?.call_notes_completed;
        const bothReady = intakeComplete && callNotesComplete;
        const onlyIntake = intakeComplete && !callNotesComplete;
        const onlyCallNotes = !intakeComplete && callNotesComplete;
        const neitherReady = !intakeComplete && !callNotesComplete;

        return (
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={intakeComplete ? "bg-emerald-500/10 text-emerald-700 border-emerald-200" : "bg-amber-500/10 text-amber-700 border-amber-200"}>
                  Intake: {intakeComplete ? "Complete" : "Pending"}
                </Badge>
                <Badge className={callNotesComplete ? "bg-emerald-500/10 text-emerald-700 border-emerald-200" : "bg-amber-500/10 text-amber-700 border-amber-200"}>
                  Call Notes: {callNotesComplete ? "Complete" : "Pending"}
                </Badge>
              </div>
              {bothReady && (
                <Button
                  onClick={async () => {
                    try {
                      await supabase.functions.invoke("generate-website", { body: { client_id: clientId } });
                      queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] });
                      toast.success("Website generation started!");
                    } catch { toast.error("Failed to start generation"); }
                  }}
                  className="w-full gap-2"
                >
                  <Sparkles className="h-4 w-4" /> Generate website ♛
                </Button>
              )}
              {onlyIntake && (
                <>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        await supabase.functions.invoke("generate-website", { body: { client_id: clientId } });
                        queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] });
                        toast.success("Website generation started!");
                      } catch { toast.error("Failed to start generation"); }
                    }}
                    className="w-full gap-2"
                  >
                    <Sparkles className="h-4 w-4" /> Generate website (no call notes)
                  </Button>
                  <p className="text-xs text-amber-600 text-center">Call notes not added — website quality will be lower without your expert input</p>
                </>
              )}
              {onlyCallNotes && (
                <Button disabled className="w-full gap-2">
                  Waiting for client intake form
                </Button>
              )}
              {neitherReady && (
                <Button disabled className="w-full gap-2">
                  Waiting for intake form and call notes
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Ready for review — show Share modal trigger */}
      {generationStatus === "complete" && stagingUrl && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <SitePreviewFrame clientId={clientId} stagingUrl={stagingUrl} height={500} />
            <div className="flex gap-2">
              <Button onClick={() => setShowShareModal(true)} disabled={sharing} className="gap-2 flex-1">
                <Send className="h-4 w-4" /> Share with client for review
              </Button>
              <Button variant="outline" onClick={handleManualReview} className="gap-2">
                <Wrench className="h-4 w-4" /> I'll work on it
              </Button>
            </div>
            <QuickEditPanel clientId={clientId} onEditComplete={() => queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] })} />
          </CardContent>
        </Card>
      )}

      {/* Awaiting client review — purple banner + reshare + quick edit */}
      {(generationStatus === "awaiting_client_review" || generationStatus === "shared" || generationStatus === "pre_launch_revision" || generationStatus === "revision_call_scheduled") && stagingUrl && (
        <Card className="border-purple-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Send className="h-4 w-4 text-purple-600" />
              {generationStatus === "pre_launch_revision"
                ? "Pre-launch revision requested"
                : generationStatus === "revision_call_scheduled"
                ? "Revision call scheduled ♛"
                : "Awaiting client review"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <SitePreviewFrame clientId={clientId} stagingUrl={stagingUrl} height={400} />

            {generationStatus === "revision_call_scheduled" && (
              <div className="rounded-lg bg-purple-50 border border-purple-200 p-3 text-sm">
                <p className="text-purple-900">
                  After the call, use the Quick Edit panel below to make any changes discussed, then click <strong>Reshare staging</strong> to send the updated site back to the client.
                </p>
              </div>
            )}

            {preLaunchFeedback.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  Client Feedback
                  <Badge className="bg-amber-500/10 text-amber-700 border-amber-200 text-[10px]">Pre-launch</Badge>
                </h4>
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
              <Button onClick={() => handleShareWithClient(true)} disabled={sharing} className="gap-2 flex-1" variant="outline">
                {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Reshare staging
              </Button>
              <Button variant="outline" onClick={handleManualReview} className="gap-2">
                <Wrench className="h-4 w-4" /> I'll work on it
              </Button>
            </div>

            <QuickEditPanel clientId={clientId} onEditComplete={() => queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] })} />
          </CardContent>
        </Card>
      )}

      {/* Client approved — prominent green deploy card */}
      {(generationStatus === "client_approved" || generationStatus === "approved") && stagingUrl && (
        <Card className="border-emerald-300 bg-emerald-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="h-5 w-5" />
              ♛ Client has approved their website — ready to deploy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm space-y-1">
              <p><strong>Business:</strong> {businessName}</p>
              {(clientData as any)?.domain_name && <p><strong>Domain:</strong> {(clientData as any).domain_name}</p>}
              {(site as any)?.client_approved_at && (
                <p className="text-muted-foreground text-xs">
                  Approved at: {new Date((site as any).client_approved_at).toLocaleString()}
                </p>
              )}
              {(site as any)?.client_approval_notes && (
                <p className="text-xs italic text-muted-foreground mt-1">"{(site as any).client_approval_notes}"</p>
              )}
            </div>

            <SitePreviewFrame clientId={clientId} stagingUrl={stagingUrl} height={300} />

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="block w-full">
                    <Button
                      onClick={() => setShowGoLiveModal(true)}
                      disabled={approving || !canGoLive}
                      className="gap-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                      size="lg"
                    >
                      {approving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />}
                      Approve and go live ♛
                    </Button>
                  </span>
                </TooltipTrigger>
                {!canGoLive && <TooltipContent><p>{goLiveTooltip}</p></TooltipContent>}
              </Tooltip>
            </TooltipProvider>

            <QuickEditPanel clientId={clientId} onEditComplete={() => queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] })} />
          </CardContent>
        </Card>
      )}

      {/* Failed — proper failure card with retry, view-data and edit-code actions */}
      {generationStatus === "failed" && (
        <FailureCard
          clientId={clientId}
          businessName={businessName}
          site={site}
          generationError={generationError}
          onRetry={() => queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] })}
        />
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

      {/* Share with client modal */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Share {businessName}'s website for review</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p className="text-muted-foreground text-xs mb-1">Staging URL</p>
              <a href={sharePreviewUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">
                {sharePreviewUrl}
              </a>
            </div>
            <div>
              <label className="text-sm font-medium">Add a personal message (optional)</label>
              <Textarea
                placeholder="e.g. We're really proud of how this turned out — we think you're going to love it"
                value={shareNote}
                onChange={(e) => setShareNote(e.target.value)}
                rows={3}
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShareModal(false)}>Cancel</Button>
            <Button onClick={() => handleShareWithClient(false)} disabled={sharing} className="gap-2">
              {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send for review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Go Live Confirmation Modal */}
      <Dialog open={showGoLiveModal} onOpenChange={(open) => { setShowGoLiveModal(open); if (!open) setGoLiveChecked(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Go live confirmation</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will push <strong>{businessName}</strong>'s website live at{" "}
            <strong>{(clientData as any)?.domain_name || "their domain"}</strong>.
            This action cannot be undone.
          </p>
          <label className="flex items-center gap-2 text-sm cursor-pointer mt-2">
            <Checkbox checked={goLiveChecked} onCheckedChange={(c) => setGoLiveChecked(!!c)} />
            I have reviewed the site and it is ready for the client
          </label>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowGoLiveModal(false)}>Cancel</Button>
            <Button onClick={handleApproveGoLive} disabled={!goLiveChecked || approving} className="gap-2">
              {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              Confirm and go live ♛
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full screen code editor */}
      <CodeEditorModal
        open={showCodeEditor}
        onOpenChange={setShowCodeEditor}
        clientId={clientId}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] });
          queryClient.invalidateQueries({ queryKey: ["operator-site-html-exists", clientId] });
        }}
      />

      {/* Regenerate website confirmation */}
      <Dialog open={showRegenerateModal} onOpenChange={setShowRegenerateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate website for {businessName}?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>This will rebuild their entire site from scratch using their current intake form data and call notes. Any manual edits made in the code editor will be overwritten.</p>
            <p className="text-amber-600">⚠ This uses current intake data — any edits the client made after original submission will be reflected.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowRegenerateModal(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                setShowRegenerateModal(false);
                setRegenerating(true);
                try {
                  await supabase
                    .from("sites")
                    .update({ generation_status: "pending", staging_url: null, generation_error: null } as any)
                    .eq("client_id", clientId);
                  await supabase
                    .from("clients")
                    .update({ site_status: "building" } as any)
                    .eq("id", clientId);
                  queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] });
                  toast.info("Rebuilding site... ♛");
                  const { error } = await supabase.functions.invoke("generate-website", {
                    body: { client_id: clientId },
                  });
                  if (error) throw error;
                  queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] });
                  queryClient.invalidateQueries({ queryKey: ["operator-site-html-exists", clientId] });
                  queryClient.invalidateQueries({ queryKey: ["operator-client-deploy-status", clientId] });
                  toast.success("Site regenerated ♛ — preview updated");
                } catch (e: any) {
                  toast.error(e?.message || "Regeneration failed");
                } finally {
                  setRegenerating(false);
                }
              }}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" /> Yes, regenerate ♛
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
