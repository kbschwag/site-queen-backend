import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Send,
  CheckCircle2,
  AlertCircle,
  History,
  Undo2,
  RotateCcw,
  ImagePlus,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Props {
  clientId: string;
}

type Status = "idle" | "running" | "success" | "error";

const PAGE_OPTIONS = [
  { value: "homepage", label: "Homepage" },
  { value: "about", label: "About" },
  { value: "services", label: "Services" },
  { value: "contact", label: "Contact" },
  { value: "all", label: "All Pages" },
];

const IMAGE_SLOT_OPTIONS = [
  { value: "hero", label: "Hero Image" },
  { value: "about", label: "About / Owner Photo" },
  { value: "why-us", label: "Why Us Photo" },
  { value: "service-1", label: "Service Photo 1" },
  { value: "service-2", label: "Service Photo 2" },
  { value: "service-3", label: "Service Photo 3" },
  { value: "service-4", label: "Service Photo 4" },
  { value: "service-5", label: "Service Photo 5" },
  { value: "service-6", label: "Service Photo 6" },
  { value: "logo", label: "Logo" },
];

const slotLabel = (val: string) =>
  IMAGE_SLOT_OPTIONS.find((o) => o.value === val)?.label || val;

export function InlineRevisionPanel({ clientId }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [instruction, setInstruction] = useState("");
  const [pages, setPages] = useState<string>("homepage");
  const [status, setStatus] = useState<Status>("idle");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [lastVersionTs, setLastVersionTs] = useState<string | null>(null);
  const [restoringTs, setRestoringTs] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [imageSlot, setImageSlot] = useState<string>("hero");

  const { data: versions = [], refetch: refetchVersions } = useQuery({
    queryKey: ["site-versions", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_versions" as any)
        .select("id, timestamp, instruction, files_saved, restored, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const handleFilePick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setStatus("error");
      setStatusMsg("Only JPG, PNG or WebP images are allowed");
      return;
    }
    setUploading(true);
    setStatus("idle");
    setStatusMsg("");
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const path = `${clientId}/revisions/${fileName}`;

      const { error: upErr } = await supabase.storage
        .from("client-uploads")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage
        .from("client-uploads")
        .getPublicUrl(path);

      setUploadedUrl(urlData.publicUrl);
      setUploadedName(file.name);
    } catch (err: any) {
      setStatus("error");
      setStatusMsg(err?.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const clearUpload = () => {
    setUploadedUrl(null);
    setUploadedName(null);
  };

  const handleApply = async () => {
    const text = instruction.trim();
    if (!text && !uploadedUrl) return;

    // Build final instruction. Photo replacement instruction takes precedence/prepends.
    let finalInstruction = text;
    if (uploadedUrl) {
      const photoInstruction = `Replace the ${slotLabel(imageSlot)} with this new image URL: ${uploadedUrl}`;
      finalInstruction = text ? `${photoInstruction}\n\n${text}` : photoInstruction;
    }

    setStatus("running");
    setStatusMsg("");
    try {
      const { data, error } = await supabase.functions.invoke("quick-edit-html", {
        body: { client_id: clientId, instruction: finalInstruction, pages },
      });
      if (error) throw new Error(error.message || "Edit failed");
      if ((data as any)?.error) throw new Error((data as any).error);
      setStatus("success");
      setStatusMsg("✓ Changes applied");
      setLastVersionTs((data as any)?.version_timestamp || null);
      setInstruction("");
      clearUpload();
      queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] });
      refetchVersions();
    } catch (e: any) {
      setStatus("error");
      setStatusMsg(e?.message || "Edit failed");
    }
  };

  const handleRestore = async (timestamp: string) => {
    setRestoringTs(timestamp);
    try {
      const { data, error } = await supabase.functions.invoke("restore-version", {
        body: { client_id: clientId, timestamp },
      });
      if (error) throw new Error(error.message || "Restore failed");
      if ((data as any)?.error) throw new Error((data as any).error);
      setStatus("success");
      setStatusMsg(`✓ Restored version from ${timestamp}`);
      setLastVersionTs(null);
      queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] });
      refetchVersions();
    } catch (e: any) {
      setStatus("error");
      setStatusMsg(e?.message || "Restore failed");
    } finally {
      setRestoringTs(null);
    }
  };

  const canSubmit = (!!instruction.trim() || !!uploadedUrl) && status !== "running";

  return (
    <div className="rounded-lg border border-primary/20 bg-muted/20 p-3 space-y-3">
      <div className="text-sm font-medium flex items-center gap-2">
        <Send className="h-4 w-4 text-primary" />
        Revise Site ♛
      </div>

      <div className="flex gap-2 flex-col sm:flex-row">
        <div className="flex-1 space-y-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              What would you like to change?
            </label>
            <Textarea
              placeholder="Describe the change — e.g. 'Change the hero headline to Phoenix's Most Trusted Plumber' or 'Make the navy color #001a4d'. You can leave this blank if you only want to replace a photo."
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={4}
              className="text-sm resize-none"
              disabled={status === "running"}
            />
          </div>

          {/* Photo upload row */}
          <div className="rounded-md border border-dashed border-border/60 bg-background/40 p-2 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleFilePick}
                disabled={uploading || status === "running"}
                className="gap-1.5 h-8"
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="h-3.5 w-3.5" />
                )}
                {uploadedUrl ? "Replace photo" : "Upload new photo"}
              </Button>
              <span className="text-[11px] text-muted-foreground">
                jpg, png, webp
              </span>
              {uploadedUrl && (
                <div className="flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-2 py-1 max-w-full">
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[180px]" title={uploadedName || ""}>
                    {uploadedName}
                  </span>
                  <button
                    type="button"
                    onClick={clearUpload}
                    className="hover:text-emerald-900"
                    aria-label="Remove uploaded photo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
            {uploadedUrl && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Replace which image?
                </label>
                <Select value={imageSlot} onValueChange={setImageSlot} disabled={status === "running"}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMAGE_SLOT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <div className="sm:w-44 flex flex-col gap-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Which page?</label>
            <Select value={pages} onValueChange={setPages} disabled={status === "running"}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleApply}
            disabled={!canSubmit}
            className="gap-2 w-full"
            size="sm"
          >
            {status === "running" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Applying...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" /> Apply Revision
              </>
            )}
          </Button>
        </div>
      </div>

      {status === "success" && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-2 text-xs text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> {statusMsg}
          </span>
          {lastVersionTs && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 h-7 text-xs"
              onClick={() => handleRestore(lastVersionTs)}
              disabled={!!restoringTs}
            >
              {restoringTs === lastVersionTs ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Undo2 className="h-3 w-3" />
              )}
              Undo last change
            </Button>
          )}
        </div>
      )}
      {status === "error" && (
        <div className="flex items-start gap-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {versions.length > 0 && (
        <div className="pt-2 border-t border-border/50 space-y-2">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <History className="h-3 w-3" /> Version history (last 5)
          </div>
          <ul className="space-y-1.5">
            {versions.map((v: any) => (
              <li
                key={v.id}
                className="flex items-start gap-2 text-xs bg-background/60 rounded p-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {v.restored && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-blue-500/10 text-blue-700 border-blue-200"
                      >
                        restored
                      </Badge>
                    )}
                    <span className="text-muted-foreground">
                      {formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="truncate mt-0.5" title={v.instruction || ""}>
                    {v.instruction || "(no instruction)"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1 h-7 text-[11px] shrink-0"
                  onClick={() => handleRestore(v.timestamp)}
                  disabled={!!restoringTs}
                >
                  {restoringTs === v.timestamp ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
