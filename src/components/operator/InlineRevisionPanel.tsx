import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Send, CheckCircle2, AlertCircle, History, Undo2, RotateCcw,
  ImagePlus, X, Sparkles, HelpCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Props { clientId: string; }
type Status = "idle" | "previewing" | "awaiting" | "applying" | "success" | "error";

const REVISION_SAFE_IMAGE_BYTES = 4.5 * 1024 * 1024;
const REVISION_MAX_IMAGE_DIMENSION = 1800;

function extensionFor(file: File): string {
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return (file.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
}

async function prepareRevisionImage(file: File): Promise<{ file: File; optimized: boolean }> {
  const type = file.type || (file.name.toLowerCase().endsWith(".png") ? "image/png" : "");
  if (!["image/jpeg", "image/png", "image/webp"].includes(type) || file.size <= REVISION_SAFE_IMAGE_BYTES) {
    return { file, optimized: false };
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, REVISION_MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return { file, optimized: false };
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) return { file, optimized: false };
  return { file: new File([blob], file.name.replace(/\.[^.]+$/, "") + "-optimized.jpg", { type: "image/jpeg" }), optimized: true };
}

interface Plan {
  tool: string;
  summary: string;
  params: any;
  affected_pages: string[];
  affected_fields: string[];
  estimated_changes: number;
  confidence: "high" | "medium" | "low";
  warnings?: string[];
  current_value?: string | null;
  current_value_source?: "intake" | "extracted" | "not_found";
}

interface AuditSubFix {
  id: string;
  description: string;
  tool: string;
  params: any;
  confidence: "high" | "medium";
  enabled_by_default: boolean;
}
interface AuditPlan {
  is_audit_plan: true;
  tool: "audit_and_fix";
  summary: string;
  target_scope: string;
  target_page: string;
  sub_fixes: AuditSubFix[];
}
interface SubFixResult {
  id: string;
  description: string;
  status: "success" | "failed";
  error?: string;
  edited_files?: string[];
  changes?: number;
}

export function InlineRevisionPanel({ clientId }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [instruction, setInstruction] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [lastVersionTs, setLastVersionTs] = useState<string | null>(null);
  const [restoringTs, setRestoringTs] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);

  const [jobId, setJobId] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [auditPlan, setAuditPlan] = useState<AuditPlan | null>(null);
  const [enabledFixIds, setEnabledFixIds] = useState<Set<string>>(new Set());
  const [subFixResults, setSubFixResults] = useState<SubFixResult[] | null>(null);
  const [clarify, setClarify] = useState<{ reason: string; suggestions: string[] } | null>(null);
  const [fallback, setFallback] = useState<{ reason: string; summary: string } | null>(null);

  const { data: versions = [], refetch: refetchVersions } = useQuery({
    queryKey: ["site-versions", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_versions" as any)
        .select("id, timestamp, instruction, files_saved, restored, created_at")
        .eq("client_id", clientId).order("created_at", { ascending: false }).limit(5);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const handleFilePick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileType = file.type || (file.name.toLowerCase().endsWith(".png") ? "image/png" : "");
    if (!["image/jpeg", "image/png", "image/webp"].includes(fileType)) {
      setStatus("error"); setStatusMsg("Only JPG, PNG or WebP allowed"); return;
    }
    setUploading(true); setStatus("idle"); setStatusMsg("");
    try {
      const prepared = await prepareRevisionImage(file);
      const ext = extensionFor(prepared.file);
      const path = `${clientId}/revisions/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("client-uploads").upload(path, prepared.file, { upsert: true, contentType: prepared.file.type });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("client-uploads").getPublicUrl(path);
      setUploadedUrl(urlData.publicUrl); setUploadedName(prepared.file.name);
      if (prepared.optimized) setStatusMsg("Large image optimized for Claude.");
    } catch (err: any) {
      setStatus("error"); setStatusMsg(err?.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const clearUpload = () => { setUploadedUrl(null); setUploadedName(null); };

  const resetAll = () => {
    setInstruction(""); clearUpload(); setPlan(null); setAuditPlan(null);
    setEnabledFixIds(new Set()); setSubFixResults(null);
    setClarify(null); setFallback(null); setJobId(null);
  };

  const handlePreview = async () => {
    const text = instruction.trim();
    if (!text && !uploadedUrl) return;
    setStatus("previewing"); setStatusMsg("");
    setPlan(null); setAuditPlan(null); setSubFixResults(null);
    setClarify(null); setFallback(null);
    try {
      const { data, error } = await supabase.functions.invoke("change-request-preview", {
        body: { client_id: clientId, instruction: text || "Replace the uploaded image into the appropriate slot", uploaded_file_url: uploadedUrl },
      });
      if (error) throw new Error(error.message || "Preview failed");
      const d: any = data;
      if (d?.error) throw new Error(d.error);
      setJobId(d.job_id);
      if (d.success && d.plan) {
        if (d.plan.is_audit_plan) {
          const ap = d.plan as AuditPlan;
          setAuditPlan(ap);
          setEnabledFixIds(new Set(ap.sub_fixes.filter((f) => f.enabled_by_default).map((f) => f.id)));
        } else {
          setPlan(d.plan);
        }
        setStatus("awaiting"); return;
      }
      if (d.needs_clarification) { setClarify({ reason: d.reason, suggestions: d.suggestions || [] }); setStatus("awaiting"); return; }
      if (d.fallback_available) { setFallback({ reason: d.reason, summary: d.fallback_summary }); setStatus("awaiting"); return; }
      throw new Error("Unexpected response from preview");
    } catch (e: any) {
      setStatus("error"); setStatusMsg(e?.message || "Preview failed");
    }
  };

  const handleApply = async (useFallback = false) => {
    if (!jobId) return;
    setStatus("applying"); setStatusMsg("");
    try {
      const body: any = { job_id: jobId, use_fallback: useFallback };
      if (auditPlan) body.enabled_sub_fix_ids = Array.from(enabledFixIds);
      const { data, error } = await supabase.functions.invoke("change-request-apply", { body });
      if (error) throw new Error(error.message || "Apply failed");
      const d: any = data;
      if (d?.error) throw new Error(d.error);
      setStatus("success");
      setStatusMsg(`✓ ${d.changes_made || 0} change(s) applied across ${(d.edited_files || []).length} page(s)`);
      setLastVersionTs(d.version_timestamp || null);
      if (d.is_audit_plan && Array.isArray(d.sub_fix_results)) {
        setSubFixResults(d.sub_fix_results);
        // Preserve sub_fix_results display: don't fully reset audit context yet
        setInstruction(""); clearUpload();
        setPlan(null); setAuditPlan(null); setEnabledFixIds(new Set());
        setClarify(null); setFallback(null); setJobId(null);
      } else {
        resetAll();
      }
      queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] });
      refetchVersions();
    } catch (e: any) {
      setStatus("error"); setStatusMsg(e?.message || "Apply failed");
    }
  };


  const handleCancel = async () => {
    if (jobId) {
      await supabase.functions.invoke("change-request-cancel", { body: { job_id: jobId } }).catch(() => {});
    }
    resetAll(); setStatus("idle"); setStatusMsg("");
  };

  const handleRestore = async (timestamp: string) => {
    setRestoringTs(timestamp);
    try {
      const { data, error } = await supabase.functions.invoke("restore-version", { body: { client_id: clientId, timestamp } });
      if (error) throw new Error(error.message || "Restore failed");
      if ((data as any)?.error) throw new Error((data as any).error);
      setStatus("success"); setStatusMsg(`✓ Restored version from ${timestamp}`); setLastVersionTs(null);
      queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] });
      refetchVersions();
    } catch (e: any) {
      setStatus("error"); setStatusMsg(e?.message || "Restore failed");
    } finally { setRestoringTs(null); }
  };

  const canPreview = (!!instruction.trim() || !!uploadedUrl) && (status === "idle" || status === "error" || status === "success");
  const busy = status === "previewing" || status === "applying";

  return (
    <div className="rounded-lg border border-primary/20 bg-muted/20 p-3 space-y-3">
      <div className="text-sm font-medium flex items-center gap-2">
        <Send className="h-4 w-4 text-primary" /> Revise Site ♛
      </div>

      {/* Input area — hidden while a plan is awaiting */}
      {status !== "awaiting" && (
        <div className="space-y-2">
          <Textarea
            placeholder="Describe the change — e.g. 'Change our phone to 480-555-0001' or 'Remove the testimonials section'. Upload a photo to swap a site image."
            value={instruction} onChange={(e) => setInstruction(e.target.value)}
            rows={4} className="text-sm resize-none" disabled={busy}
          />
          <div className="rounded-md border border-dashed border-border/60 bg-background/40 p-2 flex items-center gap-2 flex-wrap">
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
            <Button type="button" size="sm" variant="outline" onClick={handleFilePick} disabled={uploading || busy} className="gap-1.5 h-8">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
              {uploadedUrl ? "Replace photo" : "Upload photo"}
            </Button>
            <span className="text-[11px] text-muted-foreground">jpg, png, webp</span>
            {uploadedUrl && (
              <div className="flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-2 py-1">
                <CheckCircle2 className="h-3 w-3 shrink-0" />
                <span className="truncate max-w-[180px]" title={uploadedName || ""}>{uploadedName}</span>
                <button type="button" onClick={clearUpload} className="hover:text-emerald-900"><X className="h-3 w-3" /></button>
              </div>
            )}
          </div>
          <Button onClick={handlePreview} disabled={!canPreview} className="gap-2 w-full" size="sm">
            {status === "previewing" ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing your request…</> : <><Sparkles className="h-4 w-4" /> Preview Change</>}
          </Button>
        </div>
      )}

      {/* Awaiting confirmation: plan / clarify / fallback */}
      {status === "awaiting" && plan && (
        <div className="space-y-3 rounded-md border border-primary/30 bg-background p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-semibold">Plan preview</div>
            <Badge variant="outline" className={
              plan.confidence === "high" ? "text-emerald-700 border-emerald-300 bg-emerald-50"
              : plan.confidence === "low" ? "text-amber-700 border-amber-300 bg-amber-50"
              : "text-blue-700 border-blue-300 bg-blue-50"
            }>{plan.confidence} confidence</Badge>
          </div>
          <p className="text-sm">{plan.summary}</p>
          {plan.tool === "update_data_field" && plan.current_value && (
            <div className="rounded border bg-muted/40 p-2 text-xs space-y-1">
              <div><span className="text-muted-foreground">FROM:</span> <span className="font-mono">{plan.current_value}</span></div>
              <div><span className="text-muted-foreground">TO:</span> <span className="font-mono">{plan.params?.new_value}</span></div>
              {plan.current_value_source === "extracted" && (
                <div className="text-emerald-700 flex items-center gap-1 pt-0.5">
                  <CheckCircle2 className="h-3 w-3" /> Current value extracted from deployed HTML
                </div>
              )}
              {plan.current_value_source === "intake" && (
                <div className="text-muted-foreground pt-0.5">Current value from intake data</div>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className="text-muted-foreground">Tool:</span>
            <Badge variant="secondary" className="text-[10px]">{plan.tool}</Badge>
            {plan.affected_pages.length > 0 && <>
              <span className="text-muted-foreground ml-2">Pages:</span>
              {plan.affected_pages.map((p) => <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>)}
            </>}
            {plan.estimated_changes > 0 && (
              <span className="text-muted-foreground ml-2">{plan.estimated_changes} change(s)</span>
            )}
          </div>
          {plan.warnings && plan.warnings.length > 0 && (
            <div className="rounded bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900 space-y-1">
              {plan.warnings.map((w, i) => <div key={i} className="flex items-start gap-1.5"><AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /><span>{w}</span></div>)}
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={() => handleApply(false)} size="sm" className="gap-2" disabled={busy}>
              {busy && status === "applying" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Apply
            </Button>
            <Button onClick={handleCancel} size="sm" variant="ghost" disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Audit plan: checklist of proposed fixes */}
      {status === "awaiting" && auditPlan && (
        <div className="space-y-3 rounded-md border border-primary/30 bg-background p-3">
          <div className="text-sm font-semibold">{auditPlan.summary}</div>
          {auditPlan.sub_fixes.length === 0 ? (
            <div className="text-xs text-muted-foreground">Nothing to fix automatically. Try describing the specific issue.</div>
          ) : (
            <ul className="space-y-2">
              {auditPlan.sub_fixes.map((f) => {
                const checked = enabledFixIds.has(f.id);
                return (
                  <li key={f.id} className="flex items-start gap-2 text-xs border border-border/60 rounded p-2">
                    <input
                      type="checkbox" checked={checked} disabled={busy}
                      onChange={(e) => {
                        setEnabledFixIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(f.id); else next.delete(f.id);
                          return next;
                        });
                      }}
                      className="mt-0.5 shrink-0 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-foreground">{f.description}</div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <Badge variant="secondary" className="text-[10px]">{f.tool}</Badge>
                        <Badge variant="outline" className={`text-[10px] ${
                          f.confidence === "high"
                            ? "text-emerald-700 border-emerald-300 bg-emerald-50"
                            : "text-amber-700 border-amber-300 bg-amber-50"
                        }`}>{f.confidence}</Badge>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex gap-2">
            <Button
              onClick={() => handleApply(false)} size="sm" className="gap-2"
              disabled={busy || enabledFixIds.size === 0}
            >
              {busy && status === "applying" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Apply {enabledFixIds.size} {enabledFixIds.size === 1 ? "fix" : "fixes"}
            </Button>
            <Button onClick={handleCancel} size="sm" variant="ghost" disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}


      {status === "awaiting" && clarify && (
        <div className="space-y-3 rounded-md border border-blue-300 bg-blue-50/50 p-3">
          <div className="flex items-start gap-2 text-sm">
            <HelpCircle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <div><div className="font-semibold text-blue-900">Need a bit more detail</div><div className="text-blue-900/80 mt-1">{clarify.reason}</div></div>
          </div>
          {clarify.suggestions.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs text-blue-900/70">Try one of these:</div>
              {clarify.suggestions.map((s, i) => (
                <button key={i} onClick={() => { setInstruction(s); setStatus("idle"); setClarify(null); }}
                  className="block w-full text-left text-xs bg-white hover:bg-blue-50 border border-blue-200 rounded px-2 py-1.5 transition-colors">
                  "{s}"
                </button>
              ))}
            </div>
          )}
          <Button onClick={handleCancel} size="sm" variant="ghost">Start over</Button>
        </div>
      )}

      {status === "awaiting" && fallback && (
        <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50/50 p-3">
          <div className="flex items-start gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div><div className="font-semibold text-amber-900">No exact match</div><div className="text-amber-900/80 mt-1">{fallback.reason}</div><div className="text-xs text-amber-900/70 mt-2">{fallback.summary}</div></div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => handleApply(true)} size="sm" className="gap-2" disabled={busy}>
              {busy && status === "applying" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Try AI edit
            </Button>
            <Button onClick={handleCancel} size="sm" variant="ghost">Cancel</Button>
          </div>
        </div>
      )}

      {status === "applying" && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying…</div>}
      {status === "success" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-2 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> {statusMsg}</span>
            {lastVersionTs && (
              <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => handleRestore(lastVersionTs)} disabled={!!restoringTs}>
                {restoringTs === lastVersionTs ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />} Undo
              </Button>
            )}
          </div>
          {subFixResults && subFixResults.length > 0 && (
            <ul className="space-y-1 text-xs">
              {subFixResults.map((r) => (
                <li key={r.id} className="flex items-start gap-2">
                  {r.status === "success"
                    ? <CheckCircle2 className="h-3 w-3 text-emerald-600 mt-0.5 shrink-0" />
                    : <AlertCircle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />}
                  <span className={r.status === "success" ? "text-emerald-800" : "text-destructive"}>
                    {r.description}
                    {r.status === "failed" && r.error ? ` — ${r.error}` : ""}
                    {r.status === "success" && r.edited_files?.length
                      ? ` (${r.changes ?? 0} change${(r.changes ?? 0) === 1 ? "" : "s"} across ${r.edited_files.length} page${r.edited_files.length === 1 ? "" : "s"})`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {status === "error" && (
        <div className="flex items-start gap-2 text-xs text-destructive"><AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /><span>{statusMsg}</span></div>
      )}

      {versions.length > 0 && (
        <div className="pt-2 border-t border-border/50 space-y-2">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><History className="h-3 w-3" /> Version history (last 5)</div>
          <ul className="space-y-1.5">
            {versions.map((v: any) => (
              <li key={v.id} className="flex items-start gap-2 text-xs bg-background/60 rounded p-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {v.restored && <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 border-blue-200">restored</Badge>}
                    <span className="text-muted-foreground">{formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}</span>
                  </div>
                  <p className="truncate mt-0.5" title={v.instruction || ""}>{v.instruction || "(no instruction)"}</p>
                </div>
                <Button size="sm" variant="ghost" className="gap-1 h-7 text-[11px] shrink-0" onClick={() => handleRestore(v.timestamp)} disabled={!!restoringTs}>
                  {restoringTs === v.timestamp ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Restore
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
