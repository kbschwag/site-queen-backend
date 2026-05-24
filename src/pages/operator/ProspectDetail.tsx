import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, ExternalLink, Copy, RefreshCw, MessageCirclePlus, Crown, Eye, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { toast } from "sonner";
import { LogContactModal } from "@/components/operator/LogContactModal";
import { ConvertToClientModal } from "@/components/operator/ConvertToClientModal";
import { ALL_PROSPECT_STAGES, STAGE_LABELS, STAGE_COLORS, CHANNEL_LABELS } from "@/lib/prospect-utils";
import { InlineRevisionPanel } from "@/components/operator/InlineRevisionPanel";
import { MyTickets } from "@/components/client/MyTickets";

export default function ProspectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showLog, setShowLog] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [edits, setEdits] = useState<Record<string, any>>({});

  const { data: client, isLoading } = useQuery({
    queryKey: ["prospect-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*, sites(staging_url, generation_status, generation_error)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
    refetchInterval: 10000,
  });

  const { data: contactLog = [] } = useQuery({
    queryKey: ["prospect-contact-log", id],
    queryFn: async () => {
      const { data } = await (supabase.from("prospect_contact_log" as any) as any)
        .select("*")
        .eq("client_id", id!)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: changeRequests = [] } = useQuery({
    queryKey: ["prospect-change-requests", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("change_requests")
        .select("*")
        .eq("client_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  const c: any = client;
  const demoUrl = c?.sites?.[0]?.staging_url;
  const genStatus = c?.sites?.[0]?.generation_status;

  const saveEdits = async () => {
    if (!Object.keys(edits).length) return;
    const { error } = await supabase.from("clients").update(edits as any).eq("id", id!);
    if (error) toast.error(error.message);
    else { toast.success("Saved"); setEdits({}); qc.invalidateQueries({ queryKey: ["prospect-detail", id] }); }
  };

  const setStage = async (stage: string) => {
    const { error } = await supabase.from("clients").update({ lifecycle_stage: stage }).eq("id", id!);
    if (error) toast.error(error.message);
    else { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["prospect-detail", id] }); }
  };

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const { error } = await supabase.functions.invoke("generate-website", { body: { client_id: id } });
      if (error) throw error;
      toast.success("Regeneration started");
      qc.invalidateQueries({ queryKey: ["prospect-detail", id] });
    } catch (e: any) {
      toast.error(e.message || "Failed to regenerate");
    } finally {
      setRegenerating(false);
    }
  };

  if (isLoading) return <div className="p-8 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!c) return <div className="p-8">Prospect not found.</div>;

  const field = (key: string) => edits[key] !== undefined ? edits[key] : (c[key] ?? "");
  const set = (key: string, v: any) => setEdits((e) => ({ ...e, [key]: v }));

  return (
    <div className="space-y-5 max-w-5xl">
      <Button variant="ghost" size="sm" onClick={() => navigate("/operator/prospects")}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Prospects
      </Button>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{c.business_name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className={STAGE_COLORS[c.lifecycle_stage]}>{STAGE_LABELS[c.lifecycle_stage]}</Badge>
            <span className="text-sm text-muted-foreground">Added {format(new Date(c.created_at), "MMM d, yyyy")}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowLog(true)}><MessageCirclePlus className="h-4 w-4 mr-1" />Log Contact</Button>
          <Button onClick={() => setShowConvert(true)}><Crown className="h-4 w-4 mr-1" />Convert to Client</Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4 mr-1" />Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this prospect?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove <b>{c.business_name}</b> from your prospect list. The record is soft-deleted and can be restored by an Owner.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    const { data: auth } = await supabase.auth.getUser();
                    const { error } = await supabase
                      .from("clients")
                      .update({ deleted_at: new Date().toISOString(), deleted_by: auth.user?.id ?? null } as any)
                      .eq("id", id!);
                    if (error) { toast.error(error.message); return; }
                    toast.success("Prospect deleted");
                    navigate("/operator/prospects");
                  }}
                >Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">Intake</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Business name</Label><Input value={field("business_name")} onChange={(e) => set("business_name", e.target.value)} /></div>
              <div><Label>Category</Label><Input value={field("prospect_category")} onChange={(e) => set("prospect_category", e.target.value)} /></div>
              <div><Label>City</Label><Input value={field("prospect_city")} onChange={(e) => set("prospect_city", e.target.value)} /></div>
              <div><Label>Phone</Label><Input value={field("phone_number")} onChange={(e) => set("phone_number", e.target.value)} /></div>
              <div><Label>Email</Label><Input value={field("prospect_email")} onChange={(e) => set("prospect_email", e.target.value)} /></div>
              <div><Label>Existing URL</Label><Input value={field("prospect_existing_url")} onChange={(e) => set("prospect_existing_url", e.target.value)} /></div>
            </div>
            <div><Label>Services</Label><Textarea rows={3} value={field("prospect_services")} onChange={(e) => set("prospect_services", e.target.value)} /></div>
            <div><Label>Notes</Label><Textarea rows={3} value={field("prospect_notes")} onChange={(e) => set("prospect_notes", e.target.value)} /></div>
            {!!Object.keys(edits).length && (
              <div className="flex gap-2"><Button onClick={saveEdits}>Save changes</Button><Button variant="ghost" onClick={() => setEdits({})}>Discard</Button></div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Demo Site</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {demoUrl ? (
              <>
                <div className="text-xs break-all p-2 bg-muted rounded">{demoUrl}</div>
                <div className="flex gap-2">
                  <Button size="sm" asChild><a href={demoUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-1" />Preview</a></Button>
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(demoUrl); toast.success("Copied"); }}><Copy className="h-4 w-4" /></Button>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                {genStatus === "failed" ? <span className="text-red-600">Generation failed</span> : <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>}
              </div>
            )}
            <div className="text-sm pt-2 border-t space-y-1">
              <div className="flex items-center gap-2"><Eye className="h-4 w-4 text-muted-foreground" /><b>{c.demo_view_count || 0}</b> total views</div>
              {c.demo_last_viewed_at && <div className="text-xs text-muted-foreground">Last viewed {format(new Date(c.demo_last_viewed_at), "MMM d, h:mm a")}</div>}
            </div>
            <Button size="sm" variant="outline" className="w-full" onClick={regenerate} disabled={regenerating}>
              {regenerating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Regenerate Site
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Status</CardTitle></CardHeader>
          <CardContent>
            <Select value={c.lifecycle_stage} onValueChange={setStage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_PROSPECT_STAGES.map((s) => <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground mt-3">
              Last contacted: {c.date_last_contacted ? format(new Date(c.date_last_contacted), "MMM d, yyyy") : "Never"}<br />
              Next follow-up: {c.next_followup_date ? format(new Date(c.next_followup_date), "MMM d, yyyy") : "—"}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Request Changes</CardTitle>
            <p className="text-xs text-muted-foreground">
              Refine this prospect's demo site — same revision flow used for active clients. Changes deploy to staging immediately.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {demoUrl ? (
              <InlineRevisionPanel clientId={c.id} />
            ) : (
              <p className="text-sm text-muted-foreground">Generate the demo site first before requesting changes.</p>
            )}
            <div className="pt-4 border-t">
              <h3 className="text-sm font-semibold mb-3">Request History ({changeRequests.length})</h3>
              <MyTickets changeRequests={changeRequests} clientId={c.id} />
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">Contact Log</CardTitle></CardHeader>
          <CardContent>
            {contactLog.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts logged yet.</p>
            ) : (
              <ul className="divide-y">
                {contactLog.map((entry: any) => (
                  <li key={entry.id} className="py-2 flex items-start gap-3 text-sm">
                    <Badge variant="outline">{CHANNEL_LABELS[entry.channel] || entry.channel}</Badge>
                    <div className="flex-1">
                      <div className="text-xs text-muted-foreground">{format(new Date(entry.created_at), "MMM d, yyyy h:mm a")}</div>
                      {entry.note && <div>{entry.note}</div>}
                      {entry.next_followup_date && <div className="text-xs text-muted-foreground">Next: {format(new Date(entry.next_followup_date), "MMM d")}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <LogContactModal open={showLog} onOpenChange={setShowLog} clientId={c.id} currentStage={c.lifecycle_stage} onLogged={() => { qc.invalidateQueries({ queryKey: ["prospect-contact-log", id] }); qc.invalidateQueries({ queryKey: ["prospect-detail", id] }); }} />
      <ConvertToClientModal open={showConvert} onOpenChange={setShowConvert} clientId={c.id} businessName={c.business_name} onConverted={() => { qc.invalidateQueries({ queryKey: ["prospect-detail", id] }); navigate("/operator/clients"); }} />
    </div>
  );
}
